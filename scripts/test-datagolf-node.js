#!/usr/bin/env node
/**
 * test-datagolf-node.js — Valida que os cookies autenticam server-side no
 * scoring.datagolf.pt.
 *
 * Sonda DOIS endpoints, porque os workflows que dependem deste secret não
 * usam todos o mesmo (2026-08-20): a `TournamentsLST` alimenta o
 * update-drive/update-classif/update-jovens e a `HandicapsLST` alimenta o
 * update-federados. Enquanto só se sondava a primeira, o vigia semanal deu
 * VERDE às 09:22 e o update-federados falhou às 12:47 no mesmo dia com o
 * mesmo secret — um alarme que não cobre o endpoint que parte não serve de
 * alarme.
 *
 * Fonte dos cookies (por ordem):
 *   1. env DATAGOLF_SCORING_COOKIES (producao/Actions)
 *   2. ficheiro api/.scoring-datagolf-cookies.json (dev local)
 *
 * Corre: node scripts/test-datagolf-node.js
 *
 * Exit codes:
 *   0 = sucesso (Result:OK)
 *   1 = erro geral (rede, JSON invalido)
 *   2 = pelo menos um endpoint em baixo (cookies invalidos / HTTP 500)
 */

const fs = require("fs");
const path = require("path");

const COOKIES_FILE = path.join(__dirname, "..", "api", ".scoring-datagolf-cookies.json");

const POST_URL = "https://scoring.datagolf.pt/pt/tournaments.aspx/TournamentsLST?jtStartIndex=0&jtPageSize=5&jtSorting=started_at%20DESC";
const POST_BODY = {
  ClubCode: "0", dtIni: "", dtFim: "", CourseName: "",
  TournCode: "", TournName: "",
  jtStartIndex: "0", jtPageSize: "5", jtSorting: "started_at DESC",
};

// Endpoint + body do scrape-federados-node.js (mantidos em sincronia com ele).
const FED_URL = "https://scoring.datagolf.pt/pt/FederatedsList_V2.aspx/HandicapsLST";
const FED_BODY = {
  name: "", fedno: "", ClubCode: "0", FedStat: "9", Gender: "0",
  Agelev: "0", HcpStat: "0", FHcp: "", THcp: "", ProAm: "0",
  IniFlag: "0", FAge: "", TAge: "", Permit: "", MaxResults: "0",
  MessMax: "Demasiados resultados. Por favor refine a pesquisa.",
  jtStartIndex: "0", jtPageSize: "5", jtSorting: "name ASC",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36";

function loadCookies() {
  // 1. env (producao/Actions) — mesma convencao do scrape-drive-node.js
  if (process.env.DATAGOLF_SCORING_COOKIES) {
    return { cookie: process.env.DATAGOLF_SCORING_COOKIES, src: "env DATAGOLF_SCORING_COOKIES" };
  }
  // 2. ficheiro local (dev)
  if (!fs.existsSync(COOKIES_FILE)) {
    console.error("[ERRO] Sem env DATAGOLF_SCORING_COOKIES e ficheiro nao encontrado:", COOKIES_FILE);
    console.error("   Corre primeiro: node scripts/refresh-all-cookies.js");
    process.exit(1);
  }
  const j = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf8"));
  if (!j.cookieHeader) {
    console.error("[ERRO] cookieHeader vazio em", COOKIES_FILE);
    process.exit(1);
  }
  return { cookie: j.cookieHeader, src: COOKIES_FILE.replace(process.cwd(), ".") };
}

/* Uma sonda = um POST ao PageMethod + verificação de Result:"OK".
   Devolve {ok, detail} em vez de matar o processo: queremos testar TODOS os
   endpoints e listar de uma vez os que estão em baixo. */
async function probe(label, url, body, referer) {
  console.log(`\n-> [${label}] POST`, url);
  let r, text;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Origin": "https://scoring.datagolf.pt",
        "Referer": referer,
        "Cookie": COOKIE_HEADER,
      },
      body: JSON.stringify(body),
    });
    text = await r.text();
  } catch (e) {
    console.log(`<- [${label}] erro de rede:`, e.message);
    return { ok: false, detail: `rede: ${e.message}` };
  }
  console.log(`<- [${label}] HTTP`, r.status, r.statusText);

  if (text.includes("Runtime Error") || text.includes("Param_Errors") || text.includes("Erro 999")) {
    console.log(`   [ERRO] cookies invalidos/expirados`);
    console.log("   Primeiros 300 chars:", text.slice(0, 300).replace(/\s+/g, " "));
    return { ok: false, detail: `cookies invalidos (HTTP ${r.status})` };
  }
  try {
    const j = JSON.parse(text);
    const d = j.d || j;
    if (d.Result === "OK") {
      console.log(`   [OK] Result:OK · TotalRecordCount:`, d.TotalRecordCount,
                  `· Records:`, (d.Records || []).length);
      return { ok: true, detail: "OK" };
    }
    console.log("   [AVISO] Resposta JSON inesperada:", JSON.stringify(d).slice(0, 300));
    return { ok: false, detail: `Result=${d.Result || "?"}` };
  } catch {
    console.log("   [AVISO] Resposta nao e JSON:", text.slice(0, 300).replace(/\s+/g, " "));
    return { ok: false, detail: `resposta nao-JSON (HTTP ${r.status})` };
  }
}

/* Windows: chamar process.exit() com os sockets keep-alive do fetch ainda a
   fechar rebenta com "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"
   (libuv src\win\async.c:76) e devolve exit=-1073740791 — DEPOIS de o teste
   ter passado. A 28/08/2026 o run-cookie-refresh.bat leu esse codigo como
   "cookies invalidos" e saltou a cascata do update-federados. Fechar o
   dispatcher do undici e sair pelo exitCode deixa o event loop drenar. */
async function sair(code) {
  const d = globalThis[Symbol.for("undici.globalDispatcher.1")];
  if (d && typeof d.close === "function") { try { await d.close(); } catch {} }
  process.exitCode = code;
}

let COOKIE_HEADER = "";

async function main() {
  const { cookie, src } = loadCookies();
  COOKIE_HEADER = cookie;
  console.log("-> Cookies lidos de", src);
  console.log("  (" + cookie.length + " chars, " + (cookie.match(/=/g) || []).length + " cookies)");

  const results = [];
  results.push(["TournamentsLST (drive/classif/jovens)",
    await probe("torneios", POST_URL, POST_BODY,
                "https://scoring.datagolf.pt/pt/tournaments.aspx")]);
  results.push(["HandicapsLST (federados)",
    await probe("federados", FED_URL, FED_BODY,
                "https://scoring.datagolf.pt/pt/FederatedsList_V2.aspx")]);

  const mortos = results.filter(([, r]) => !r.ok);
  console.log("");
  for (const [nome, r] of results) console.log(r.ok ? `  OK   ${nome}` : `  FALHA ${nome} — ${r.detail}`);
  if (mortos.length > 0) {
    console.log(`\n[ERRO] ${mortos.length} de ${results.length} endpoints em baixo — refrescar DATAGOLF_SCORING_COOKIES.`);
    return sair(2);
  }
  console.log("\n[OK] SUCESSO — os endpoints do scoring.datagolf.pt respondem.");
  return sair(0);
}

main().catch(e => {
  console.error("ERRO:", e.message);
  return sair(1);
});
