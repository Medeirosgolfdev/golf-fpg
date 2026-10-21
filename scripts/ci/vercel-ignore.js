#!/usr/bin/env node
/* scripts/ci/vercel-ignore.js — «Ignored Build Step» do Vercel (vercel.json →
 * ignoreCommand).
 *
 * Convenção do Vercel: exit 0 = NÃO fazer deploy deste commit; exit 1 = fazer.
 *
 * Porquê (auditoria 20/10/2026, R4): os ~35 workflows fazem ~190 commits de
 * dados por semana e cada um gerava um deployment de ~1,1 GB — também os que só
 * tocam em data-archive/ (fora do deploy), docs/ ou .github/. Saltam-se esses.
 *
 * Regra: salta-se SÓ quando TODOS os ficheiros mudados desde o último deploy
 * batem na lista IGNORAVEIS. Qualquer outra coisa (public/, src/, api/, lib/,
 * output/{fed}/, ranking-pja/, shared/, package*.json, configs…) faz deploy.
 * Na dúvida — sem git, sem base, erro — faz deploy.
 *
 * Base da comparação: VERCEL_GIT_PREVIOUS_SHA (o commit do último deploy deste
 * branch) quando existe no clone; senão HEAD^. Comparar só HEAD^..HEAD não
 * chega: num push com vários commits o Vercel só constrói o último, e um commit
 * anterior com public/ ficava por publicar.
 *
 * Simular sobre o histórico: node scripts/ci/vercel-ignore.js --simular "7 days ago"
 */
"use strict";
const { execFileSync } = require("child_process");

// Caminhos que nunca entram no deployment nem no build.
const IGNORAVEIS = [
  /^data-archive\//,           // fora do public/ e do outDir — de propósito
  /^docs\//,                   // documentação (≠ public/docs, que é servido)
  /^\.github\//,               // workflows
  /^\.claude\//,
  /^scripts\/.*\.test\.js$/,   // testes dos scripts
  /^scripts\/_archive\//,      // legados que não se correm
  /^scripts\/ci\//,            // CI (inclui este ficheiro)
  /^scripts\/[^/]+\.json$/,    // scopes/memórias dos scrapers (fcg-scope, draw-mail-processed…)
  /^(?!public\/)(?:.*\/)?[^/]+\.md$/, // markdown fora do public/
];

function ignoravel(ficheiro) {
  return IGNORAVEIS.some((re) => re.test(ficheiro));
}

/** true = pode saltar o deploy (todos os ficheiros são ignoráveis e há pelo menos um). */
function deveIgnorar(ficheiros) {
  const fs = ficheiros.filter(Boolean);
  return fs.length > 0 && fs.every(ignoravel);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function existe(sha) {
  try { git(["cat-file", "-e", `${sha}^{commit}`]); return true; } catch { return false; }
}

function ficheirosMudados(base, head = "HEAD") {
  return git(["diff", "--name-only", "--no-renames", base, head]).split("\n").filter(Boolean);
}

function main() {
  const i = process.argv.indexOf("--simular");
  if (i > 0) return simular(process.argv[i + 1] || "7 days ago");

  const prev = process.env.VERCEL_GIT_PREVIOUS_SHA;
  let base = null;
  if (prev && existe(prev)) base = prev;
  else if (existe("HEAD^")) base = "HEAD^";
  if (!base) { console.log("vercel-ignore: sem base para comparar → deploy"); process.exit(1); }

  const fs = ficheirosMudados(base);
  if (deveIgnorar(fs)) {
    console.log(`vercel-ignore: ${fs.length} ficheiro(s) desde ${base.slice(0, 9)}, todos fora do deploy → SALTAR`);
    process.exit(0);
  }
  const relevante = fs.find((f) => !ignoravel(f));
  console.log(`vercel-ignore: ${relevante || "(sem ficheiros)"} mexe no site → deploy`);
  process.exit(1);
}

function simular(since) {
  const shas = git(["rev-list", "--first-parent", `--since=${since}`, "HEAD"]).split("\n").filter(Boolean);
  let saltados = 0;
  for (const sha of shas) {
    if (!existe(`${sha}^`)) continue;
    const fs = ficheirosMudados(`${sha}^`, sha);
    const salta = deveIgnorar(fs);
    if (salta) saltados++;
    const msg = git(["log", "-1", "--format=%s", sha]).slice(0, 70);
    console.log(`${salta ? "SALTA " : "deploy"}  ${sha.slice(0, 9)}  ${msg}`);
  }
  console.log(`\n${saltados} de ${shas.length} commits desde «${since}» não fariam deploy.`);
}

if (require.main === module) {
  try { main(); } catch (e) { console.log(`vercel-ignore: erro (${e.message}) → deploy`); process.exit(1); }
}

module.exports = { deveIgnorar, ignoravel, IGNORAVEIS };
