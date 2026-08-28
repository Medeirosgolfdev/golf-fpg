#!/usr/bin/env node
/**
 * test-fpg-auth.js — Testa se os cookies autenticam server-side no my.fpg.pt.
 *
 * Fonte dos cookies (por ordem):
 *   1. env FPG_COOKIES ou DATAGOLF_COOKIES (producao/Actions)
 *   2. ficheiro api/.datagolf-cookies.json (dev local)
 *
 * Corre: node scripts/test-fpg-auth.js
 */

const fs = require("fs");
const path = require("path");

const COOKIES_FILE = path.join(__dirname, "..", "api", ".datagolf-cookies.json");

function loadCookies() {
  // 1. env (producao/Actions) — mesma convencao do fpg-scrape-node.js
  if (process.env.FPG_COOKIES) return { cookie: process.env.FPG_COOKIES, src: "env FPG_COOKIES" };
  if (process.env.DATAGOLF_COOKIES) return { cookie: process.env.DATAGOLF_COOKIES, src: "env DATAGOLF_COOKIES" };
  // 2. ficheiro local (dev)
  if (!fs.existsSync(COOKIES_FILE)) {
    console.error("[ERRO] Sem env FPG_COOKIES e ficheiro nao encontrado:", COOKIES_FILE);
    process.exit(1);
  }
  const j = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf8"));
  if (!j.cookieHeader) {
    console.error("[ERRO] cookieHeader vazio em", COOKIES_FILE);
    process.exit(1);
  }
  return { cookie: j.cookieHeader, src: COOKIES_FILE.replace(process.cwd(), ".") };
}

/* Mesma armadilha do test-datagolf-node.js: em Windows, process.exit() com os
   sockets keep-alive do fetch ainda a fechar rebenta na libuv (async.c:76) e
   devolve exit=-1073740791 mesmo tendo o teste passado. Ver o comentario la. */
async function sair(code) {
  const d = globalThis[Symbol.for("undici.globalDispatcher.1")];
  if (d && typeof d.close === "function") { try { await d.close(); } catch {} }
  process.exitCode = code;
}

async function main() {
  const { cookie: COOKIE, src } = loadCookies();
  console.log("-> Cookies lidos de", src);
  console.log("  (" + COOKIE.length + " chars, " + (COOKIE.match(/=/g) || []).length + " cookies)");

  const url = "https://my.fpg.pt/Home/PlayerWHS.aspx/HCPWhsFederLST?fed_code=52884&pp=N&jtStartIndex=0&jtPageSize=100";

  console.log("-> POST", url);
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "Origin": "https://my.fpg.pt",
      "Referer": "https://my.fpg.pt/Home/PlayerWHS.aspx?no=52884",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0",
      "DNT": "1",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Cookie": COOKIE,
    },
    body: JSON.stringify({ fed_code: "52884", pp: "N", jtStartIndex: "0", jtPageSize: "100" }),
  });

  console.log("<- HTTP", r.status, r.statusText);
  const text = await r.text();

  if (text.includes("Param_Errors.aspx")) {
    console.log("\n[ERRO] FALHA - Param_Errors.aspx (cookies invalidos/expirados)");
    console.log("Primeiros 500 chars:", text.slice(0, 500));
    return sair(2);
  }

  try {
    const j = JSON.parse(text);
    if (j.d && j.d.Result === "OK") {
      console.log("\n[OK] SUCESSO - autenticacao funcionou!");
      console.log("TotalRecordCount:", j.d.TotalRecordCount);
      console.log("Records devolvidos:", j.d.Records?.length);
      if (j.d.Records?.[0]) {
        const r0 = j.d.Records[0];
        console.log("\nPrimeiro registo:", r0.tourn_name || r0.tournament_description || "(sem nome)");
        console.log("  Campo:", r0.course_description || "-");
        console.log("  Data:", r0.hcp_dateStr || r0.score_dateStr || "-");
        console.log("  Stab:", r0.stableford ?? r0.calculated_stablnet_total ?? "-");
      }
      return sair(0);
    }
    console.log("\n[AVISO] Resposta JSON inesperada:");
    console.log(JSON.stringify(j, null, 2).slice(0, 2000));
    return sair(3);
  } catch {
    console.log("\n[AVISO] Resposta nao e JSON:");
    console.log(text.slice(0, 2000));
    return sair(4);
  }
}

main().catch(e => { console.error("ERRO:", e.message); return sair(1); });
