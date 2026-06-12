#!/usr/bin/env node
/**
 * test-datagolf-node.js — Valida que os cookies autenticam server-side no
 * scoring.datagolf.pt.
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
 *   2 = cookies invalidos (Param_Errors / Erro 999 / HTTP 500)
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

async function main() {
  const { cookie: COOKIE, src } = loadCookies();
  console.log("-> Cookies lidos de", src);
  console.log("  (" + COOKIE.length + " chars, " + (COOKIE.match(/=/g) || []).length + " cookies)");

  console.log("-> POST", POST_URL);
  const r = await fetch(POST_URL, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Origin": "https://scoring.datagolf.pt",
      "Referer": "https://scoring.datagolf.pt/pt/tournaments.aspx",
      "Cookie": COOKIE,
    },
    body: JSON.stringify(POST_BODY),
  });
  console.log("<- HTTP", r.status, r.statusText);
  const text = await r.text();

  if (text.includes("Runtime Error") || text.includes("Param_Errors") || text.includes("Erro 999")) {
    console.log("\n[ERRO] FALHA - cookies invalidos/expirados");
    console.log("Primeiros 400 chars:", text.slice(0, 400).replace(/\s+/g, " "));
    process.exit(2);
  }

  try {
    const j = JSON.parse(text);
    if (j.d?.Result === "OK") {
      const recs = j.d.Records || [];
      console.log("\n[OK] SUCESSO - Result:OK");
      console.log("   TotalRecordCount:", j.d.TotalRecordCount);
      console.log("   Records devolvidos:", recs.length);
      if (recs[0]) {
        console.log("\nPrimeiro torneio:", recs[0].name || "(sem nome)");
        console.log("   ccode/tcode:", (recs[0].ccode || "?") + "/" + (recs[0].tcode || "?"));
        console.log("   Data:", recs[0].started_at || "-");
      }
      process.exit(0);
    }
    console.log("\n[AVISO] Resposta JSON inesperada:");
    console.log(JSON.stringify(j, null, 2).slice(0, 1000));
    process.exit(3);
  } catch {
    console.log("\n[AVISO] Resposta nao e JSON:");
    console.log(text.slice(0, 1000));
    process.exit(4);
  }
}

main().catch(e => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
