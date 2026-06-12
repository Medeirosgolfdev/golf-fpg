/**
 * scripts/lib/cookies.js — Carregamento unificado de cookies FPG/DataGolf.
 *
 * Substitui as ~6 cópias de loadCookies() espalhadas pelos scrapers.
 * Convenção: env vars primeiro (produção/Actions), ficheiro local depois (dev).
 *
 * Uso:
 *   const { loadCookieHeader } = require("./lib/cookies");
 *   const COOKIE = loadCookieHeader({
 *     envVars: ["DATAGOLF_SCORING_COOKIES"],
 *     file: path.join(REPO, "api", ".scoring-datagolf-cookies.json"),
 *     label: "[drive]",
 *   });
 */

const fs = require("fs");

/**
 * @param {object} opts
 * @param {string[]} opts.envVars  — nomes de env vars, por ordem de preferência
 * @param {string}   opts.file     — path do ficheiro JSON com { cookieHeader }
 * @param {string}   [opts.label]  — prefixo de log (ex: "[drive]")
 * @param {boolean}  [opts.exitOnFail=true] — process.exit(1) se não encontrar
 * @returns {string|null} cookie header
 */
function loadCookieHeader({ envVars = [], file, label = "[cookies]", exitOnFail = true }) {
  for (const name of envVars) {
    if (process.env[name]) {
      console.log(`${label} cookies de env ${name}`);
      return process.env[name];
    }
  }
  if (file && fs.existsSync(file)) {
    try {
      const j = JSON.parse(fs.readFileSync(file, "utf8"));
      if (j.cookieHeader) {
        console.log(`${label} cookies de ${file.replace(process.cwd(), ".")}`);
        return j.cookieHeader;
      }
    } catch { /* ficheiro corrompido → cai no erro abaixo */ }
  }
  const hint = envVars.length ? `Define ${envVars.join(" ou ")}` : "Define a env var";
  console.error(`${label} ERRO: sem cookies. ${hint}${file ? ` ou cria ${file} via refresh-all-cookies.js` : ""}`);
  if (exitOnFail) process.exit(1);
  return null;
}

module.exports = { loadCookieHeader };
