#!/usr/bin/env node
/**
 * fix-players-placeholder-names.js
 *
 * Corrige entradas em public/data/players.json cujo `name` é um PLACEHOLDER
 * igual ao próprio nº de federado (ex: "27849": { "name": "27849" }). Esses
 * placeholders aparecem por preencher e fazem com que a UI mostre o NÚMERO em
 * vez do nome (ganham prioridade sobre o course-player-names.json).
 *
 * Resolve o nome real a partir de:
 *   1. public/data/federados.json            (activos)
 *   2. data-archive/federados-inativos.json  (inactivos, se existir)
 *
 * Cria backup antes de escrever. Dry-run por defeito; usar --apply para gravar.
 *
 *   node scripts/fix-players-placeholder-names.js          # mostra o que faria
 *   node scripts/fix-players-placeholder-names.js --apply  # aplica
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PLAYERS = path.join(ROOT, "public", "data", "players.json");
const FED_SOURCES = [
  path.join(ROOT, "public", "data", "federados.json"),
  path.join(ROOT, "data-archive", "federados-inativos.json"),
  path.join(ROOT, "public", "data", "federados-inativos.json"),
];

const apply = process.argv.includes("--apply");

function loadFedNames() {
  const names = {};
  for (const f of FED_SOURCES) {
    if (!fs.existsSync(f)) continue;
    try {
      const doc = JSON.parse(fs.readFileSync(f, "utf8"));
      const list = Array.isArray(doc) ? doc : doc.players ?? [];
      for (const p of list) {
        const code = p && p.federation_code;
        if (code && p.name && !(code in names)) names[code] = p.name;
      }
    } catch (e) {
      console.warn(`  aviso: não consegui ler ${path.basename(f)}: ${e.message}`);
    }
  }
  return names;
}

function main() {
  const players = JSON.parse(fs.readFileSync(PLAYERS, "utf8"));
  const fedNames = loadFedNames();

  const fixed = [];
  const unresolved = [];
  for (const [key, v] of Object.entries(players)) {
    if (!v || typeof v !== "object") continue;
    const nm = String(v.name ?? "").trim();
    if (nm !== String(key)) continue; // só placeholders (name == nº)
    const real = fedNames[key];
    if (real) {
      fixed.push([key, real]);
      v.name = real;
    } else {
      unresolved.push(key);
    }
  }

  console.log(`Placeholders encontrados: ${fixed.length + unresolved.length}`);
  for (const [k, n] of fixed) console.log(`  ✓ ${k} -> ${n}`);
  for (const k of unresolved) console.log(`  ✗ ${k} -> (não encontrado nos federados)`);

  if (!apply) {
    console.log("\n(dry-run — usar --apply para gravar)");
    return;
  }
  if (fixed.length === 0) {
    console.log("\nNada para gravar.");
    return;
  }
  const backup = PLAYERS.replace(/\.json$/, `.backup-${Date.now()}.json`);
  fs.copyFileSync(PLAYERS, backup);
  fs.writeFileSync(PLAYERS, JSON.stringify(players, null, 2) + "\n");
  console.log(`\nGravado ${fixed.length} correcções. Backup: ${path.basename(backup)}`);
}

main();
