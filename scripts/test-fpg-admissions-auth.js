#!/usr/bin/env node
/**
 * test-fpg-admissions-auth.js — Valida que os cookies do scoring.fpg.pt/lists
 * (usados pelo scrape-fpg-admissions-draws-node.js) ainda autenticam.
 *
 * Fonte dos cookies (por ordem):
 *   1. env FPG_ADMISSIONS_COOKIES (produção/Actions)
 *   2. ficheiro api/.fpg-admissions-cookies.json (dev local)
 *
 * Faz GET ao linkpage.aspx (gateway canónico — ver CLAUDE.md) de um torneio
 * conhecido e verifica que a resposta não é "Param Error".
 *
 * Exit codes:
 *   0 = sucesso
 *   1 = erro geral (rede, sem cookies)
 *   2 = cookies inválidos (Param Error / Erro 999 / HTTP 500)
 *   3 = a FONTE está em baixo (o controlo sem credenciais também falha) —
 *       refrescar cookies não resolve; ver scripts/lib/fpg-liveness.js
 */

const fs = require("fs");
const path = require("path");
const { sondarFpg, diagnosticar, explicar, EXIT } = require("./lib/fpg-liveness");

const COOKIES_FILE = path.join(__dirname, "..", "api", ".fpg-admissions-cookies.json");

// Torneio de referência (Nacional Sub-12 H 2026 — já decorrido, página estável)
const TEST_URL =
  "https://scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=000&tourn=10941&ack=XH256YF450";

function loadCookies() {
  if (process.env.FPG_ADMISSIONS_COOKIES) {
    return { cookie: process.env.FPG_ADMISSIONS_COOKIES, src: "env FPG_ADMISSIONS_COOKIES" };
  }
  if (!fs.existsSync(COOKIES_FILE)) {
    console.error("[ERRO] Sem env FPG_ADMISSIONS_COOKIES e ficheiro nao encontrado:", COOKIES_FILE);
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

  console.log("-> GET", TEST_URL);
  const r = await fetch(TEST_URL, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Cookie": COOKIE,
    },
  });
  console.log("<- HTTP", r.status, r.statusText, "(final:", r.url + ")");
  const text = await r.text();

  if (
    r.status >= 500 ||
    /Param_Errors|<title>\s*Param Error|Erro 999|Runtime Error/i.test(text)
  ) {
    // Repetir SEM credenciais antes de acusar o segredo (ver fpg-liveness.js).
    const sondas = await sondarFpg();
    const veredicto = diagnosticar(false, sondas);
    console.log(`\n[${veredicto === "indeterminado" ? "ERRO" : "AVISO"}] FALHA - ${explicar(veredicto)}`);
    console.log(`   (sonda de alcançabilidade: HTTP ${sondas.reach.status})`);
    console.log("Primeiros 400 chars:", text.slice(0, 400).replace(/\s+/g, " "));
    process.exit(veredicto === "indeterminado" ? EXIT.INDETERMINADO : EXIT.FONTE_EM_BAIXO);
  }

  // A página de admissions válida tem a tabela de inscritos (ou pelo menos
  // o título do torneio). Verificação leve para apanhar respostas vazias.
  if (text.length < 500) {
    console.log("\n[AVISO] Resposta suspeita (demasiado curta):");
    console.log(text.slice(0, 400));
    process.exit(2);
  }

  console.log("\n[OK] SUCESSO - linkpage admissions respondeu com conteudo valido");
  console.log("   Tamanho da resposta:", text.length, "chars");
  process.exit(0);
}

main().catch(e => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
