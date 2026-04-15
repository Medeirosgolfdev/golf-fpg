#!/usr/bin/env node
/**
 * refresh-datagolf-cookies.js
 * ═════════════════════════════════════════════════════════════════
 * Usa Playwright para abrir scoring.datagolf.pt e **captura todos os
 * cookies** (incluindo os httpOnly que Node fetch simples não consegue
 * obter).
 *
 * ─── Warmup em múltiplos passos ──────────────────────────────────
 * Entrar directo em PlayerWHS.aspx sem sessão prévia dá 500 (testado).
 * Precisamos de:
 *   1. GET FederatedsList_V2.aspx   → seta ASP.NET_SessionId (mesmo
 *      devolvendo Erro 999 no body)
 *   2. GET PlayerWHS.aspx?no=X       → agora com sessão, devolve 200
 *      e carrega o jTable
 *   3. Aguardar 1º POST do jTable (jTable completa o state da sessão)
 *   4. Capturar TODOS os cookies (incluindo httpOnly)
 *
 * Grava em `api/.datagolf-cookies.json` (lido pelo proxy `api/datagolf.js`).
 *
 * USO:
 *   node scripts/refresh-datagolf-cookies.js
 *   HEADFUL=1 node scripts/refresh-datagolf-cookies.js  (ver browser)
 * ═════════════════════════════════════════════════════════════════
 */
"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const OUT_FILE = path.join(__dirname, "..", "api", ".datagolf-cookies.json");
const HEADLESS = !process.env.HEADFUL;
const WARMUP_FED = "52884";  // fed válido para validação

(async () => {
  console.log(`🌐 A abrir browser ${HEADLESS ? "headless (oculto)" : "visível (HEADFUL)"}...`);

  // CRÍTICO: o servidor FPG não seta SameSite nos cookies. Chrome moderno
  // bloqueia com default "Lax" → devolve "Erro 999". Nas versões actuais de
  // Chromium (>=v100), os flags --disable-features=SameSiteByDefaultCookies
  // já NÃO funcionam (hard-coded).
  //
  // Solução: usar o Chrome instalado do user (canal "chrome") com o mesmo
  // user-data-dir (perfil) — se o user configurou chrome://flags para
  // Disabled, o Playwright herda essa configuração.
  const browser = await chromium.launch({
    headless: HEADLESS,
    channel: "chrome",  // usa o Chrome instalado no sistema, não o Chromium bundled
    args: [
      // Ainda tentamos setar; em versões antigas ajuda.
      "--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure",
      "--disable-blink-features=AutomationControlled",
    ],
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    locale: "pt-PT",
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  try {
    // ── PASSO 1: aguecer com tournaments.aspx (página pública estável) ──
    console.log("→ 1/4 GET tournaments.aspx (home pública — warmup inicial)...");
    const r0 = await page.goto("https://scoring.datagolf.pt/pt/tournaments.aspx", {
      waitUntil: "networkidle",
      timeout: 30000,
    }).catch(e => { console.warn(`    (warmup inicial falhou: ${e.message})`); return null; });
    if (r0) console.log(`    Status: ${r0.status()} · Título: "${await page.title()}"`);
    await page.waitForTimeout(1500);

    // ── PASSO 2: FederatedsList_V2 (seta ASP.NET_SessionId + corre JS) ──
    console.log("→ 2/4 GET FederatedsList_V2.aspx (estabelecer sessão completa)...");
    const r1 = await page.goto("https://scoring.datagolf.pt/pt/FederatedsList_V2.aspx", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    console.log(`    Status: ${r1?.status()} · Título: "${await page.title()}"`);
    await page.waitForTimeout(2000);  // deixar JS rodar todo

    let cookies = await context.cookies("https://scoring.datagolf.pt");
    console.log(`    Cookies após passo 2 (${cookies.length}): ${cookies.map(c => c.name).join(", ") || "(nenhum)"}`);

    // ── PASSO 3: agora com sessão estabelecida, entrar em PlayerWHS ──
    console.log(`→ 3/4 GET PlayerWHS.aspx?no=${WARMUP_FED}...`);
    const r2 = await page.goto(`https://scoring.datagolf.pt/pt/PlayerWHS.aspx?no=${WARMUP_FED}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    console.log(`    Status: ${r2?.status()} · Título: "${await page.title()}"`);

    if (r2?.status() !== 200) {
      // Diagnóstico
      const bodyPreview = await page.content().catch(() => "");
      console.warn(`    Body preview: ${bodyPreview.slice(0, 300).replace(/\s+/g, " ")}`);
      throw new Error(`PlayerWHS devolveu HTTP ${r2?.status()} — sessão não estabeleceu correctamente`);
    }

    // ── PASSO 4: aguardar POST do jTable (completa a sessão) ──
    console.log("→ 4/4 A aguardar POST do jTable...");
    const posted = await page.waitForResponse(
      r => r.url().includes("HCPWhsFederLST") && r.request().method() === "POST",
      { timeout: 20000 },
    ).catch(() => null);
    if (posted) {
      console.log(`    ✓ POST capturado: HTTP ${posted.status()}`);
    } else {
      console.warn("    ⚠ POST do jTable não detectado em 20s — a continuar mesmo assim");
    }

    // Pequena espera adicional para cookies rotativos estabilizarem
    await page.waitForTimeout(1500);

    // ── Capturar TODOS os cookies ──
    cookies = await context.cookies("https://scoring.datagolf.pt");
    if (!cookies.length) throw new Error("Nenhum cookie capturado — algo falhou");

    console.log(`\n✓ ${cookies.length} cookies capturados:`);
    cookies.forEach(c => {
      const v = c.value.length > 25 ? c.value.slice(0, 22) + "..." : c.value;
      console.log(`   - ${c.name.padEnd(24)} = ${v.padEnd(28)} [httpOnly=${c.httpOnly}, secure=${c.secure}, path=${c.path}]`);
    });

    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
    const output = {
      generated: new Date().toISOString(),
      source:    "playwright warmup (FederatedsList_V2 → PlayerWHS)",
      host:      "scoring.datagolf.pt",
      cookieHeader,
      cookies:   cookies.map(c => ({
        name: c.name, httpOnly: c.httpOnly, secure: c.secure,
        path: c.path, expires: c.expires,
      })),
    };
    fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\n💾 Guardado em ${path.relative(process.cwd(), OUT_FILE)}`);
    console.log(`   Header Cookie: ${cookieHeader.length} chars, ${cookies.length} cookies`);

    // ── Validar: fazer POST manual ao endpoint e ver se funciona ──
    console.log(`\n🧪 Teste: POST ao endpoint real...`);
    const testResp = await page.evaluate(async (fed) => {
      const r = await fetch(`/pt/PlayerWHS.aspx/HCPWhsFederLST?fed_code=${fed}`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ fed_code: fed, jtStartIndex: "0", jtPageSize: "1", jtSorting: "hcp_date DESC" }),
      });
      const j = await r.json();
      return { status: r.status, result: (j.d || j).Result, total: (j.d || j).TotalRecordCount, msg: (j.d || j).Message };
    }, WARMUP_FED);
    if (testResp.result === "OK") {
      console.log(`   ✅ Endpoint FUNCIONA — ${testResp.total} rondas`);
    } else {
      console.warn(`   ⚠ Endpoint devolveu: ${testResp.msg || testResp.result}`);
    }
  } catch (e) {
    console.error("\n❌ Erro:", e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
