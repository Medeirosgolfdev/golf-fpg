#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Adiciona ao uskids-member-history-slim.json os mids que existem APENAS
 * no uskids-name-lookup.json. Sem dados de torneios (não os temos no
 * uskids-golf no formato que o member-history precisa) — só name, country,
 * ageGroup e place. O aggregator vai gerar juniors entries para estes
 * mids quando re-correr.
 *
 * Backup automático. Dry-run.
 *
 * USO:
 *   cd C:\golf-fpg
 *   node scripts/add-new-mids-from-lookup.js --dry-run
 *   node scripts/add-new-mids-from-lookup.js
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const MH_PATH = path.join(ROOT, "public/data/uskids-member-history-slim.json");
const LOOKUP_PATH = path.join(ROOT, "public/data/uskids-name-lookup.json");

const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");

function readJSON(p) {
  const t = fs.readFileSync(p, "utf-8");
  return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
}

console.log(`A ler ${path.basename(MH_PATH)}...`);
const mh = readJSON(MH_PATH);
console.log(`A ler ${path.basename(LOOKUP_PATH)}...`);
const lookup = readJSON(LOOKUP_PATH);

const mhJog = mh.jogadores || (mh.jogadores = {});
const additions = [];

for (const [mid, info] of Object.entries(lookup.members || {})) {
  if (mhJog[mid]) continue; // já existe — skip
  // Cria entry mínima
  const entry = {
    name: info.name || "?",
    country: info.country || null,
    ageGroup: info.ageGroup_latest || null,
    place: info.place || null,
    // Sem torneios — não temos os dados estruturados no formato do member-history
    // (uskids-golf tem flight_players por pid, não rounds por mid)
    torneios: {},
    totalTorneios: 0,
    // Tag de proveniência
    _source: "uskids-name-lookup",
  };
  if (!DRY_RUN) mhJog[mid] = entry;
  additions.push({ mid, ...entry });
}

console.log();
console.log("=".repeat(70));
console.log(`Mids no lookup: ${Object.keys(lookup.members).length}`);
console.log(`Já existentes no member-history: ${Object.keys(lookup.members).length - additions.length}`);
console.log(`Novos a adicionar: ${additions.length}`);
console.log("=".repeat(70));

const sample = VERBOSE ? additions : additions.slice(0, 30);
console.log(`\n--- ${VERBOSE ? "Todos" : "Top 30"} novos mids ---`);
for (const a of sample) {
  console.log(
    `  mid=${a.mid.padStart(7)}  ${(a.country || "??").padEnd(3)} ${(a.ageGroup || "?").padEnd(14)}  ${a.name}${a.place ? "  @ " + a.place : ""}`
  );
}
if (!VERBOSE && additions.length > 30) {
  console.log(`  ... +${additions.length - 30} mais (--verbose para ver todos)`);
}

if (DRY_RUN) {
  console.log("\n--- DRY RUN — não escrevi nada ---");
  process.exit(0);
}

if (additions.length === 0) {
  console.log("\nNada a adicionar.");
  process.exit(0);
}

const backup = `${MH_PATH}.bak-${Date.now()}`;
fs.copyFileSync(MH_PATH, backup);
console.log(`\nBackup: ${path.basename(backup)}`);

// IMPORTANTE: formato compacto (sem indent) — ficheiro servido em runtime
fs.writeFileSync(MH_PATH, JSON.stringify(mh), "utf-8");
const sz = fs.statSync(MH_PATH).size;
console.log(`✅ ${path.basename(MH_PATH)} actualizado (${sz} bytes, compacto).`);
console.log(`   ${additions.length} mids adicionados.`);
console.log(`\nPróximo passo: re-correr o aggregator para baking no juniors.json.`);
