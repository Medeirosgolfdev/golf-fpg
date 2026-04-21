#!/usr/bin/env node
/**
 * refresh-all-cookies.js
 * ═════════════════════════════════════════════════════════════════════
 * Task diária (10:00 via Windows Scheduled Task) que captura cookies
 * frescos para os três backends da FPG:
 *
 *   • my.fpg.pt              → api/.datagolf-cookies.json
 *   • scoring.datagolf.pt    → api/.scoring-datagolf-cookies.json
 *   • scoring.fpg.pt         → api/.fpg-admissions-cookies.json
 *
 * COMO FUNCIONA
 * ─────────────
 * Chrome moderno (Chromium bundled da Playwright incluído) rejeita os
 * cookies da FPG via SameSite enforcement. Só Chrome 90 (última versão
 * com as flags toggleáveis) consegue persistir o `.AspNet.ApplicationCookie`
 * e o par `ASP.NET_SessionId` + `DG_Lists_URL`.
 *
 * Este script usa Playwright para:
 *   1. Lançar Chrome 90 (executável configurado via CHROME90_PATH)
 *   2. Usar um perfil dedicado (CHROME90_PROFILE) onde o user fez login
 *      manual uma vez em area.my.fpg.pt
 *   3. Navegar sequencialmente aos três hosts (a sessão SSO persiste
 *      entre hosts .fpg.pt / .datagolf.pt)
 *   4. Extrair TODOS os cookies (incluindo httpOnly) via context.cookies()
 *   5. Escrever em cada ficheiro o respectivo subconjunto de cookies
 *   6. Validar com POST a cada endpoint real
 *
 * PRÉ-REQUISITOS (uma vez)
 * ────────────────────────
 * 1. Chrome 90 instalado num path conhecido
 * 2. Perfil de automação criado + logado:
 *      "C:\Program Files\Google\Chrome\Application\chrome.exe" \
 *        --user-data-dir=C:\golf-fpg\chrome-profile-automation
 *    Navegar a:
 *      - https://area.my.fpg.pt/login/  → fazer login
 *      - https://my.fpg.pt/Home/PlayerWHS.aspx?no=52884
 *      - https://scoring.datagolf.pt/pt/tournaments.aspx
 *      - https://scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=000&tourn=10941&ack=XH256YF450
 *    Confirmar que `chrome://flags` tem:
 *      • SameSite by default cookies          → Disabled
 *      • Cookies without SameSite must be secure → Disabled
 *    Fechar o browser.
 * 3. (Opcional) `gh auth login` para actualizar GitHub Secrets
 *
 * VARIÁVEIS DE AMBIENTE
 * ─────────────────────
 * CHROME90_PATH      path completo do chrome.exe de Chrome 90
 *                    (default: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
 * CHROME90_PROFILE   directório user-data-dir do perfil logado
 *                    (default: "C:\\golf-fpg\\chrome-profile-automation")
 * HEADFUL=1          abre browser visível (debug); sem isto → headless
 * SKIP_VALIDATION=1  salta os testes POST de validação
 *
 * EXIT CODES
 * ──────────
 * 0  — todos os cookies capturados e validados com sucesso
 * 1  — erro geral (browser não abre, ficheiros não escreveram)
 * 2  — cookies capturados mas validação falhou (sessão SSO expirou)
 * 3  — parcial: só alguns hosts capturados/válidos
 * ═════════════════════════════════════════════════════════════════════
 */
"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// ─── Configuração ────────────────────────────────────────────────────
const REPO_ROOT  = path.resolve(__dirname, "..");
const API_DIR    = path.join(REPO_ROOT, "api");

const CHROME90_PATH    = process.env.CHROME90_PATH
  || "C:\\Users\\Mariana\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const CHROME90_PROFILE = process.env.CHROME90_PROFILE
  || "C:\\golf-fpg\\chrome-profile-automation";
const HEADLESS         = !process.env.HEADFUL;
const VALIDATE         = !process.env.SKIP_VALIDATION;

const UA_CHROME90 = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36";

/** Host → config file + warmup URLs + validation endpoint */
const HOSTS = [
  {
    host:     "my.fpg.pt",
    file:     path.join(API_DIR, ".datagolf-cookies.json"),
    warmup:   [
      "https://my.fpg.pt/Home/PlayerWHS.aspx?no=52884",
    ],
    validate: {
      url:     "https://my.fpg.pt/Home/PlayerWHS.aspx/HCPWhsFederLST?fed_code=52884&pp=N&jtStartIndex=0&jtPageSize=1",
      headers: {
        "Content-Type":     "application/json; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Accept":           "application/json, text/javascript, */*; q=0.01",
        "Origin":           "https://my.fpg.pt",
        "Referer":          "https://my.fpg.pt/Home/PlayerWHS.aspx?no=52884",
      },
      body:    { fed_code: "52884", pp: "N", jtStartIndex: "0", jtPageSize: "1" },
    },
  },
  {
    host:     "scoring.datagolf.pt",
    file:     path.join(API_DIR, ".scoring-datagolf-cookies.json"),
    warmup:   [
      // Entry-gate em scoring-pt.datagolf.pt: seta cookies nos DOIS subdomínios
      // (scoring-pt.datagolf.pt + scoring.datagolf.pt) e redireciona para tournaments.aspx.
      // Crítico: é esta a URL que valida o hash server-side e prepara o DG_Lists_URL.
      "https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T",
    ],
    validate: {
      url:     "https://scoring.datagolf.pt/pt/tournaments.aspx/TournamentsLST?jtStartIndex=0&jtPageSize=1&jtSorting=started_at%20DESC",
      headers: {
        "Content-Type":     "application/json; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Accept":           "application/json, text/javascript, */*; q=0.01",
        "Origin":           "https://scoring.datagolf.pt",
        "Referer":          "https://scoring.datagolf.pt/pt/tournaments.aspx",
      },
      body:    {
        ClubCode: "0", dtIni: "", dtFim: "", CourseName: "",
        TournCode: "", TournName: "",
        jtStartIndex: "0", jtPageSize: "1", jtSorting: "started_at DESC",
      },
    },
  },
  {
    host:     "scoring.fpg.pt",
    file:     path.join(API_DIR, ".fpg-admissions-cookies.json"),
    warmup:   [
      // Página pública de admissions — seta cookie de sessão mesmo anon
      "https://scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=000&tourn=10941&ack=XH256YF450",
    ],
    // Validação via HEAD simples à mesma URL (200 = OK)
    validate: {
      url:     "https://scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=000&tourn=10941&ack=XH256YF450",
      method:  "GET",
      headers: {},
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────
function log(msg) {
  const t = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${t}] ${msg}`);
}

function ensureDirs() {
  if (!fs.existsSync(API_DIR)) fs.mkdirSync(API_DIR, { recursive: true });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Escreve o ficheiro no formato esperado pelos scripts e pelo proxy
 * `api/datagolf.js`: { host, generated, cookieHeader, cookies[] }
 */
function writeCookieFile(file, host, cookies, source = "playwright refresh-all-cookies") {
  const header = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const output = {
    generated:    new Date().toISOString(),
    source,
    host,
    cookieHeader: header,
    cookies:      cookies.map(c => ({
      name:     c.name,
      httpOnly: c.httpOnly,
      secure:   c.secure,
      path:     c.path,
      expires:  c.expires,
    })),
  };
  fs.writeFileSync(file, JSON.stringify(output, null, 2));
  return header;
}

/**
 * Corre o POST de validação dentro da página (usa mesma origem → sem CORS).
 * Retorna { ok: bool, status, detail }.
 */
async function validateInPage(page, spec) {
  if (!spec || !VALIDATE) return { ok: true, status: "skipped", detail: "skipped" };
  if (spec.method === "GET") {
    // Teste simples de GET
    try {
      const r = await page.evaluate(async (url) => {
        const resp = await fetch(url, { method: "GET", credentials: "include" });
        return { status: resp.status, ok: resp.ok };
      }, spec.url);
      return { ok: r.ok, status: r.status, detail: `GET ${r.status}` };
    } catch (e) {
      return { ok: false, status: 0, detail: e.message };
    }
  }
  try {
    const r = await page.evaluate(async ({ url, headers, body }) => {
      const resp = await fetch(url, {
        method:      "POST",
        headers,
        credentials: "include",
        body:        JSON.stringify(body),
      });
      const text = await resp.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch {}
      const inner = parsed?.d || parsed || {};
      return {
        status:    resp.status,
        ok:        resp.ok,
        result:    inner.Result || null,
        total:     inner.TotalRecordCount ?? null,
        bodyPrev:  text.slice(0, 200).replace(/\s+/g, " "),
      };
    }, spec);
    const ok = r.status === 200 && r.result === "OK";
    const detail = ok
      ? `HTTP ${r.status} · Result=OK · TotalRecordCount=${r.total}`
      : `HTTP ${r.status} · Result=${r.result || "?"} · ${r.bodyPrev}`;
    return { ok, status: r.status, detail };
  } catch (e) {
    return { ok: false, status: 0, detail: e.message };
  }
}

// ─── Main ────────────────────────────────────────────────────────────
(async () => {
  log("🚀 refresh-all-cookies — Playwright + Chrome 90");
  log(`   CHROME90_PATH    = ${CHROME90_PATH}`);
  log(`   CHROME90_PROFILE = ${CHROME90_PROFILE}`);
  log(`   headless         = ${HEADLESS}`);
  log(`   validação        = ${VALIDATE ? "on" : "off"}`);

  ensureDirs();

  // Validações iniciais
  if (!fs.existsSync(CHROME90_PATH)) {
    log(`❌ Chrome 90 não encontrado em: ${CHROME90_PATH}`);
    log("   Configura via env var CHROME90_PATH.");
    process.exit(1);
  }
  if (!fs.existsSync(CHROME90_PROFILE)) {
    log(`⚠ Perfil não encontrado: ${CHROME90_PROFILE}`);
    log("   Playwright vai criar um novo — mas estará vazio/sem login.");
    log("   Setup: lança Chrome 90 com --user-data-dir apontando aí e faz login manual em area.my.fpg.pt.");
  }

  let context = null;
  try {
    log("→ A lançar Chrome 90 com perfil persistente...");
    context = await chromium.launchPersistentContext(CHROME90_PROFILE, {
      executablePath: CHROME90_PATH,
      headless:       HEADLESS,
      viewport:       { width: 1280, height: 800 },
      userAgent:      UA_CHROME90,
      locale:         "pt-PT",
      args: [
        // Reinforce para versões antigas (em Chrome 90 as flags chrome://flags mandam):
        "--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure",
        "--disable-blink-features=AutomationControlled",
      ],
    });
  } catch (e) {
    log(`❌ Falhou a lançar Chrome 90: ${e.message}`);
    log("   Dica comum: Chrome 90 com o mesmo perfil já aberto → fecha-o primeiro.");
    process.exit(1);
  }

  const page = context.pages()[0] || await context.newPage();

  const results = [];
  let hardFail = false;

  for (const spec of HOSTS) {
    log("─────────────────────────────────────────────────────");
    log(`📍 Host: ${spec.host}`);
    try {
      for (const url of spec.warmup) {
        log(`   → GET ${url}`);
        const r = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
        log(`     status=${r?.status()} · title="${(await page.title()).slice(0, 60)}"`);
        await sleep(1500);
      }

      // Capturar cookies desse host específico
      const cookies = await context.cookies(`https://${spec.host}`);
      log(`   ✓ ${cookies.length} cookies capturados`);
      cookies.forEach(c => {
        const v = c.value.length > 20 ? c.value.slice(0, 17) + "..." : c.value;
        log(`     · ${c.name.padEnd(28)} = ${v.padEnd(22)}  [httpOnly=${c.httpOnly}]`);
      });

      if (cookies.length === 0) {
        results.push({ host: spec.host, ok: false, detail: "0 cookies" });
        continue;
      }

      // Escrever ficheiro
      const header = writeCookieFile(spec.file, spec.host, cookies);
      log(`   💾 Gravado em ${path.relative(REPO_ROOT, spec.file)} (${header.length} chars)`);

      // Validar
      const v = await validateInPage(page, spec.validate);
      if (v.ok) {
        log(`   ✅ Validação: ${v.detail}`);
      } else {
        log(`   ⚠ Validação falhou: ${v.detail}`);
      }
      results.push({ host: spec.host, ok: v.ok, detail: v.detail, file: spec.file });
    } catch (e) {
      log(`   ❌ Erro no host ${spec.host}: ${e.message}`);
      results.push({ host: spec.host, ok: false, detail: e.message });
    }
  }

  await context.close();

  // ─── Sumário ────────────────────────────────────────────────────
  log("═════════════════════════════════════════════════════");
  log("📊 Sumário:");
  let okCount = 0;
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    log(`   ${icon} ${r.host.padEnd(22)}  ${r.detail}`);
    if (r.ok) okCount++;
  }
  log(`   ${okCount}/${results.length} hosts OK`);

  if (okCount === 0) {
    log("❌ Nenhum host válido. Provavelmente a sessão SSO expirou.");
    log("   Abre Chrome 90 com --user-data-dir=" + CHROME90_PROFILE);
    log("   e faz login em https://area.my.fpg.pt/login/");
    process.exit(2);
  }
  if (okCount < results.length) {
    log(`⚠ Parcial: ${results.length - okCount} hosts falharam.`);
    process.exit(3);
  }
  log("🎉 Tudo OK — cookies frescos escritos e validados.");
  process.exit(0);
})();
