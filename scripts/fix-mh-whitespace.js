#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Limpa nomes em uskids-member-history-slim.json
 * ----------------------------------------------
 * Aplica 2 regras a `jogadores[mid].name`:
 *
 *  1) Whitespace: trim + colapsa espaços internos (ex: "Eldrick  Stoddard"
 *     → "Eldrick Stoddard")
 *  2) Pontos espúrios: remove o "." trailing de palavras com mais de 1
 *     caractere. Preserva iniciais legítimas tipo "J. Smith" porque "J" tem
 *     1 char. Ex: "Ely. Horenstein." → "Ely Horenstein", mas "J. Smith Jr."
 *     fica "J. Smith Jr" (remove só o último ponto).
 *
 * NÃO toca em nomes COMPLETAMENTE diferentes (ex: o mid 489430 com
 * Matthew/Lucas) — para isso usa drill-mid.js e corrige à mão.
 *
 * Backup automático antes de escrever. Idempotente.
 *
 * USO:
 *   cd C:\golf-fpg
 *
 *   # ver o que ia alterar, sem escrever
 *   node scripts/fix-mh-whitespace.js --dry-run
 *
 *   # aplicar
 *   node scripts/fix-mh-whitespace.js
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const FILE = path.join(ROOT, "public/data/uskids-member-history-slim.json");

const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");

function cleanName(raw) {
  if (typeof raw !== "string") return raw;
  // 1) Trim + colapsa whitespace interno
  let s = raw.trim().replace(/\s+/g, " ");
  // 2) Remove "." trailing de palavras com >1 char.
  //    Split por espaço; para cada palavra, se acabar em "." e a parte
  //    antes do ponto tiver mais de 1 char, remover o ponto.
  s = s
    .split(" ")
    .map((w) => {
      if (w.endsWith(".") && w.slice(0, -1).length > 1 && !w.includes(".")) {
        // Defensivo: só apaga se for o ÚNICO ponto na palavra (não "Jr.." ou similar)
        return w.slice(0, -1);
      }
      return w;
    })
    .join(" ");
  return s;
}

console.log(`A ler ${FILE}...`);
const txt = fs.readFileSync(FILE, "utf-8");
const data = JSON.parse(txt.charCodeAt(0) === 0xfeff ? txt.slice(1) : txt);

const jog = data.jogadores || {};
const total = Object.keys(jog).length;
const changes = [];

for (const [mid, p] of Object.entries(jog)) {
  if (!p || typeof p.name !== "string") continue;
  const before = p.name;
  const after = cleanName(before);
  if (after !== before) {
    changes.push({ mid, before, after });
    if (!DRY_RUN) p.name = after;
  }
}

console.log(`Jogadores: ${total}`);
console.log(`Nomes alterados: ${changes.length}`);

if (changes.length === 0) {
  console.log("Nada a fazer — ficheiro já está limpo.");
  process.exit(0);
}

const sample = VERBOSE ? changes : changes.slice(0, 30);
console.log(`\n--- ${VERBOSE ? "Todas" : "Top 30"} alterações ---`);
for (const c of sample) {
  console.log(`  mid=${c.mid.padStart(7)}  "${c.before}"   →   "${c.after}"`);
}
if (!VERBOSE && changes.length > 30) {
  console.log(`  ... +${changes.length - 30} mais (usa --verbose para ver todas)`);
}

if (DRY_RUN) {
  console.log("\n--- DRY RUN — não escrevi nada ---");
  process.exit(0);
}

// Backup
const backup = `${FILE}.bak-${Date.now()}`;
fs.copyFileSync(FILE, backup);
console.log(`\nBackup: ${path.basename(backup)}`);

// IMPORTANTE: formato COMPACTO (sem indent). Ficheiro é servido em runtime
// ao browser pelo KIDSdataLoader — indentação multiplica tamanho ~4x.
fs.writeFileSync(FILE, JSON.stringify(data), "utf-8");
const sz = fs.statSync(FILE).size;
console.log(`✅ ${path.basename(FILE)} actualizado (${sz} bytes, formato compacto).`);
console.log(`   Re-corre node scripts/build-uskids-name-lookup.js para refrescar o lookup.`);
