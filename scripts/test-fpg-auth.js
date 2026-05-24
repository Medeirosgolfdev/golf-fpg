#!/usr/bin/env node
/**
 * test-fpg-auth.js — Testa se os cookies em api/.datagolf-cookies.json
 * autenticam server-side no my.fpg.pt.
 *
 * Lê o cookieHeader do ficheiro (já não é hardcoded) — assim basta atualizar
 * o ficheiro de cookies e re-correr este teste.
 *
 * Corre: node scripts/test-fpg-auth.js
 */

const fs = require("fs");
const path = require("path");

const COOKIES_FILE = path.join(__dirname, "..", "api", ".datagolf-cookies.json");

function loadCookies() {
  if (!fs.existsSync(COOKIES_FILE)) {
    console.error("[ERRO] Ficheiro nao encontrado:", COOKIES_FILE);
    process.exit(1);
  }
  const j = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf8"));
  if (!j.cookieHeader) {
    console.error("[ERRO] cookieHeader vazio em", COOKIES_FILE);
    process.exit(1);
  }
  return j.cookieHeader;
}

async function main() {
  const COOKIE = loadCookies();
  console.log("-> Cookies lidos de", COOKIES_FILE.replace(process.cwd(), "."));
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
    process.exit(2);
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
      process.exit(0);
    }
    console.log("\n[AVISO] Resposta JSON inesperada:");
    console.log(JSON.stringify(j, null, 2).slice(0, 2000));
    process.exit(3);
  } catch {
    console.log("\n[AVISO] Resposta nao e JSON:");
    console.log(text.slice(0, 2000));
    process.exit(4);
  }
}

main().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
