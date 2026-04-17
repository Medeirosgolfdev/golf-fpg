#!/usr/bin/env node
/**
 * scripts/fix-fpg-admissions-vac.js
 *
 * Patch post-scrape: o parser antigo do browser apanhava o ANO da data de
 * inscrição (ex: 2025) como valor de VAC quando a tabela da FPG não tinha
 * coluna VAC explícita (torneios Drive/Aquapor sem classificação). Isto
 * define vac=null quando o valor cai no range 1900..2100 (sem VAC real).
 *
 * Corre uma vez sobre public/data/fpg-admissions-draws.json.
 * O browser script (browser-scrape-fpg-admissions-draws.js) foi entretanto
 * corrigido para não voltar a cometer este bug.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const FILE = path.resolve(__dirname, "..", "public", "data", "fpg-admissions-draws.json");

const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
let fixed = 0, totalPlayers = 0;
for (const t of (j.tournaments || [])) {
  for (const p of (t.admissions?.players || [])) {
    totalPlayers++;
    if (p.vac != null && Number.isFinite(p.vac) && p.vac >= 1900 && p.vac <= 2100) {
      p.vac = null;
      fixed++;
    }
  }
}
fs.writeFileSync(FILE, JSON.stringify(j, null, 2));
console.log(`Jogadores totais: ${totalPlayers}`);
console.log(`VAC fixados (set to null): ${fixed}`);
