#!/usr/bin/env node
/**
 * fix-topar-sem-par.js
 *
 * Repara o `toPar` dos jogadores gravados sem `parTotal`.
 *
 * O scrape-classif-node.js fazia `sumGross - (parTotal || 0) * nRondas`. Para
 * quem nao e federado FPG o parTotal vem null, o par virava 0 e o toPar ficava
 * IGUAL ao gross — dai aparecerem "+220" e "+234" ao lado dos "+4" nas tabelas
 * de edicoes anteriores. O bug ja foi corrigido no scraper; isto limpa o que
 * ficou nos ficheiros.
 *
 * Regra: o par e do CAMPO, igual para todos os jogadores da mesma prova. Tira-se
 * de quem o tenha e recalcula-se. Nao havendo nenhum, o toPar passa a null —
 * desconhecido e melhor do que um numero errado.
 *
 *   node scripts/fix-topar-sem-par.js --dry
 *   node scripts/fix-topar-sem-par.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry");

const alvos = fs.readdirSync(path.join(ROOT, "public", "data"))
  .filter(f => /^(pull-torneios\d+|torneio-\d+-\d+)\.json$/.test(f))
  .map(f => path.join("public", "data", f));

function readJSON(p) {
  let t = fs.readFileSync(p, "utf-8");
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return JSON.parse(t);
}

let totCorr = 0, totNull = 0, totFich = 0;

for (const rel of alvos) {
  const abs = path.join(ROOT, rel);
  const j = readJSON(abs);
  let corr = 0, anulados = 0;

  for (const t of (j.tournaments || [])) {
    const players = t.players || [];
    // Par do campo: o primeiro parTotal disponivel na prova.
    let par = null;
    for (const p of players) if (typeof p.parTotal === "number") { par = p.parTotal; break; }
    const nR = Math.max(1, Number(t.rounds) || 1);

    for (const p of players) {
      if (typeof p.parTotal === "number") continue;          // tem par, nada a fazer
      if (typeof p.toPar !== "number" || typeof p.grossTotal !== "number") continue;
      // A assinatura do bug: toPar exactamente igual ao gross.
      if (p.toPar !== p.grossTotal) continue;
      const nRondas = (p.roundScores || []).length || nR;
      if (par != null) { p.toPar = p.grossTotal - par * nRondas; corr++; }
      else { p.toPar = null; anulados++; }
    }
  }

  if (corr || anulados) {
    totFich++;
    console.log(`  ${rel}`);
    console.log(`      ${corr} recalculados · ${anulados} postos a null (par desconhecido)`);
    if (!DRY) fs.writeFileSync(abs, JSON.stringify(j, null, 2) + "\n");
  }
  totCorr += corr; totNull += anulados;
}

console.log("");
console.log(`Total: ${totCorr} recalculados · ${totNull} a null · ${totFich} ficheiros`);
if (DRY) console.log("(--dry: nada foi escrito)");
