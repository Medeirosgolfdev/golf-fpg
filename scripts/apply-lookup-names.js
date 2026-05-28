#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Aplica nomes do uskids-name-lookup.json ao uskids-member-history-slim.json
 * ------------------------------------------------------------------------
 * Lógica:
 *
 *   Para cada mid presente em AMBOS os ficheiros onde o nome difere:
 *     - Aplica o nome do LOOKUP (vem do scrape USKids original, validado
 *       por strokes match no build-uskids-name-lookup.js)
 *     - Adiciona `place` (cidade) que o member-history não tem
 *     - Preserva `country`, `ageGroup`, `torneios` do member-history
 *
 *   Excepções (skip — mantém member-history):
 *     - Se o nome do lookup é claramente PIOR (vazio, single letter, etc.)
 *
 * Backup automático antes de escrever. Dry-run por defeito mostra todas
 * as alterações.
 *
 * USO:
 *   cd C:\golf-fpg
 *
 *   # ver o que ia mudar
 *   node scripts/apply-lookup-names.js --dry-run
 *
 *   # aplicar
 *   node scripts/apply-lookup-names.js
 *
 *   # filtrar por categoria (caps, accents, length, other)
 *   node scripts/apply-lookup-names.js --dry-run --only outros
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const MH_PATH = path.join(ROOT, "public/data/uskids-member-history-slim.json");
const LOOKUP_PATH = path.join(ROOT, "public/data/uskids-name-lookup.json");

const argv = process.argv.slice(2);
function flag(name, def = null) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const next = argv[i + 1];
  if (!next || next.startsWith("--")) return true;
  return next;
}
const DRY_RUN = argv.includes("--dry-run");
const ONLY = (flag("only", null) || "").toString().toLowerCase();
const VERBOSE = argv.includes("--verbose");

function stripDiacritics(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function categorize(a, b) {
  if (a === b) return "equal";
  if (a.toLowerCase() === b.toLowerCase()) return "caps";
  if (
    stripDiacritics(a).toLowerCase() === stripDiacritics(b).toLowerCase()
  )
    return "accents";
  if (Math.abs(a.length - b.length) > 3) return "length";
  return "outros";
}

// Heurística: rejeitar nome do lookup se for claramente pior
function lookupNameIsValid(lookupName, mhName) {
  if (!lookupName || typeof lookupName !== "string") return false;
  if (lookupName.length < 3) return false; // single name muito curto
  // Se o lookup é só 1 palavra e o mh tem 2+, suspeitar
  if (lookupName.split(" ").length === 1 && mhName.split(" ").length >= 2)
    return false;
  return true;
}

console.log(`A ler ${path.basename(MH_PATH)}...`);
const mhTxt = fs.readFileSync(MH_PATH, "utf-8");
const mh = JSON.parse(mhTxt.charCodeAt(0) === 0xfeff ? mhTxt.slice(1) : mhTxt);

console.log(`A ler ${path.basename(LOOKUP_PATH)}...`);
const lookup = JSON.parse(fs.readFileSync(LOOKUP_PATH, "utf-8"));

const changes = [];
const placesAdded = [];
const rejected = [];

for (const [mid, info] of Object.entries(lookup.members || {})) {
  const j = mh.jogadores && mh.jogadores[mid];
  if (!j) continue;

  const lookupName = info.name;
  const mhName = j.name || "";
  const cat = categorize(mhName, lookupName);

  if (cat === "equal") {
    // Mesmo assim, se mh não tem place e lookup tem, adiciona
    if (!j.place && info.place) {
      j.place = info.place;
      placesAdded.push({ mid, place: info.place, name: mhName });
    }
    continue;
  }

  if (ONLY && cat !== ONLY) continue;

  if (!lookupNameIsValid(lookupName, mhName)) {
    rejected.push({ mid, mhName, lookupName, reason: "lookup name pior" });
    continue;
  }

  changes.push({
    mid,
    cat,
    mhName,
    lookupName,
    addPlace: !j.place && info.place ? info.place : null,
    addCountryLookup: info.country,
  });

  if (!DRY_RUN) {
    j.name = lookupName;
    if (!j.place && info.place) j.place = info.place;
  }
}

// Sumário
const byCat = changes.reduce((acc, c) => {
  acc[c.cat] = (acc[c.cat] || 0) + 1;
  return acc;
}, {});

console.log();
console.log("=".repeat(70));
console.log(`Mids analisados: ${Object.keys(lookup.members).length}`);
console.log(`Alterações de nome: ${changes.length}`);
for (const [cat, n] of Object.entries(byCat)) {
  console.log(`  ${cat.padEnd(8)}: ${n}`);
}
console.log(`Places adicionados (sem alterar nome): ${placesAdded.length}`);
console.log(`Rejeitados (lookup name pior): ${rejected.length}`);
console.log("=".repeat(70));

console.log("\n--- ALTERAÇÕES DE NOME ---");
for (const c of changes) {
  console.log(
    `  [${c.cat.padEnd(7)}] mid=${c.mid.padStart(7)}  "${c.mhName}"   →   "${c.lookupName}"${c.addPlace ? `   (+place="${c.addPlace}")` : ""}`
  );
}

if (rejected.length) {
  console.log("\n--- REJEITADOS (nenhum nome alterado) ---");
  for (const r of rejected) {
    console.log(
      `  mid=${r.mid.padStart(7)}  mh="${r.mhName}"  lookup="${r.lookupName}"  (${r.reason})`
    );
  }
}

if (VERBOSE && placesAdded.length) {
  console.log("\n--- PLACES ADICIONADOS (nome inalterado) ---");
  for (const p of placesAdded.slice(0, 50))
    console.log(`  mid=${p.mid.padStart(7)}  ${p.name}   +place="${p.place}"`);
  if (placesAdded.length > 50)
    console.log(`  ... +${placesAdded.length - 50} mais`);
}

if (DRY_RUN) {
  console.log("\n--- DRY RUN — não escrevi nada ---");
  process.exit(0);
}

if (changes.length === 0 && placesAdded.length === 0) {
  console.log("\nNada a alterar.");
  process.exit(0);
}

// Backup
const backup = `${MH_PATH}.bak-${Date.now()}`;
fs.copyFileSync(MH_PATH, backup);
console.log(`\nBackup: ${path.basename(backup)}`);

// IMPORTANTE: gravar em formato COMPACTO (sem indent), tal como o ficheiro
// original. Este JSON é servido directamente ao browser em runtime pelo
// KIDSdataLoader — indentação multiplica o tamanho por ~4x e mata o fetch.
fs.writeFileSync(MH_PATH, JSON.stringify(mh), "utf-8");
const sz = fs.statSync(MH_PATH).size;
console.log(`✅ ${path.basename(MH_PATH)} actualizado (${sz} bytes, formato compacto).`);
console.log(
  `   ${changes.length} nomes corrigidos, ${placesAdded.length} cidades adicionadas.`
);
