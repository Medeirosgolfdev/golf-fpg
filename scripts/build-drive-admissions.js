#!/usr/bin/env node
/**
 * build-drive-admissions.js — escreve `public/data/fpg-admissions-draws-drive.json`:
 * do `fpg-admissions-draws.json` (inscrições e draws de TODOS os torneios FPG,
 * ~12 MB) só os torneios que a /drive usa:
 *   - os do Drive/AQUAPOR pelo nome (a mesma regra dos torneios por jogar em
 *     `src/data/drive/driveSource.ts`: «Drive Tour», «Drive Chall…», «Aquapor»);
 *   - os que têm resultados nos mensais `drive-data-*`/`aquapor-data-*`
 *     (por `ccode-tcode`, que é como a /drive lhes pendura as inscrições).
 * O resto do ficheiro (cabeçalho) fica igual. Um torneio em destaque
 * (`FEATURED_TOURNAMENTS`) de uma série do Drive tem de casar por uma destas
 * regras — hoje não há nenhum.
 *
 * Gerado — NÃO vai para o git (.gitignore). Corre no `predev` e no `prebuild`.
 * À mão: node scripts/build-drive-admissions.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeAtomic } = require("./lib/atomic-write");

const DATA_DIR = path.join(__dirname, "..", "public", "data");
const IN_FILE = path.join(DATA_DIR, "fpg-admissions-draws.json");
const OUT_FILE = path.join(DATA_DIR, "fpg-admissions-draws-drive.json");

const DRIVE_RE = /\bdrive\s+(tour\b|chall)/i;
const AQUA_RE = /\baquapor\b/i;

/** `ccode-tcode` de todos os torneios dos mensais do Drive e do AQUAPOR. */
function monthlyKeys(dir) {
  const keys = new Set();
  for (const n of fs.readdirSync(dir)) {
    if (!/^(drive|aquapor)-data-\d{4}-\d{2}\.json$/.test(n)) continue;
    const d = JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));
    for (const t of d.tournaments || []) keys.add(`${t.ccode}-${t.tcode}`);
  }
  return keys;
}

function buildDriveAdmissions(file, keys) {
  const tournaments = (file.tournaments || []).filter((t) =>
    DRIVE_RE.test(t.name || "") || AQUA_RE.test(t.name || "") || keys.has(`${t.ccode}-${t.tcode}`));
  return { ...file, total: tournaments.length, tournaments };
}

function main() {
  const out = buildDriveAdmissions(JSON.parse(fs.readFileSync(IN_FILE, "utf8")), monthlyKeys(DATA_DIR));
  if (out.tournaments.length === 0) {
    console.error("[drive-admissions] nenhum torneio do Drive no fpg-admissions-draws.json — não gravado");
    process.exit(1);
  }
  const json = JSON.stringify(out) + "\n";
  const prev = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, "utf8") : null;
  if (prev !== json) writeAtomic(OUT_FILE, json);
  console.log(`[drive-admissions] ${out.tournaments.length} torneios · ${(json.length / 1e6).toFixed(2)} MB`);
}

if (require.main === module) main();
module.exports = { buildDriveAdmissions, DRIVE_RE, AQUA_RE };
