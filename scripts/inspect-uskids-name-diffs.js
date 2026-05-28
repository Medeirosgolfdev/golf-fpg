#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Inspecciona diferenças entre uskids-name-lookup.json e
 * uskids-member-history-slim.json. Categoriza por tipo (capitalização,
 * acentos, comprimento) e mostra amostras dos mais interessantes.
 *
 * USO:
 *   cd C:\golf-fpg
 *   node scripts/inspect-uskids-name-diffs.js
 *
 *   # mais amostras (default 15 por categoria)
 *   node scripts/inspect-uskids-name-diffs.js --samples 50
 *
 *   # filtrar por país (ex: PT, IT, ES)
 *   node scripts/inspect-uskids-name-diffs.js --country PT
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function flag(name, def = null) {
  const i = process.argv.slice(2).indexOf(`--${name}`);
  if (i === -1) return def;
  const next = process.argv.slice(2)[i + 1];
  if (!next || next.startsWith("--")) return true;
  return next;
}

const SAMPLES = parseInt(flag("samples", "15"), 10);
const COUNTRY = (flag("country", null) || "").toString().toUpperCase();

const lookupPath = path.join(ROOT, "public/data/uskids-name-lookup.json");
const mhPath = path.join(ROOT, "public/data/uskids-member-history-slim.json");

console.log(`A ler ${path.basename(lookupPath)}...`);
const lookup = JSON.parse(fs.readFileSync(lookupPath, "utf-8"));
console.log(`A ler ${path.basename(mhPath)}...`);
const mh = JSON.parse(fs.readFileSync(mhPath, "utf-8"));

const stripDiacritics = (s) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

const diffs = [];
let newOnly = 0;
let identical = 0;
for (const [mid, info] of Object.entries(lookup.members)) {
  const j = mh.jogadores[mid];
  if (!j) {
    newOnly++;
    continue;
  }
  if (!j.name) continue;
  if (j.name === info.name) {
    identical++;
    continue;
  }
  if (COUNTRY && (info.country || "").toUpperCase() !== COUNTRY) continue;
  diffs.push({
    mid,
    lookup: info.name,
    mh: j.name,
    country: info.country || "",
    place: info.place || "",
    year: info.year_latest,
    ageGroup: info.ageGroup_latest,
  });
}

const cats = { caps: [], accents: [], length: [], other: [] };
for (const d of diffs) {
  const a = d.lookup;
  const b = d.mh;
  if (a.toLowerCase() === b.toLowerCase()) {
    cats.caps.push(d);
  } else if (
    stripDiacritics(a).toLowerCase() === stripDiacritics(b).toLowerCase()
  ) {
    cats.accents.push(d);
  } else if (Math.abs(a.length - b.length) > 3) {
    cats.length.push(d);
  } else {
    cats.other.push(d);
  }
}

console.log();
console.log("=".repeat(70));
console.log(`Total memberIds no lookup: ${Object.keys(lookup.members).length}`);
console.log(`  Iguais ao member-history: ${identical}`);
console.log(`  Novos (não estão no member-history): ${newOnly}`);
console.log(
  `  Com nome diferente${COUNTRY ? ` (filtro country=${COUNTRY})` : ""}: ${diffs.length}`
);
console.log();
console.log("Categorização das diferenças:");
console.log(`  só capitalização: ${cats.caps.length}`);
console.log(`  só acentos:       ${cats.accents.length}`);
console.log(`  comprimento >3 chars (abreviatura?): ${cats.length.length}`);
console.log(`  outros (mais interessantes):         ${cats.other.length}`);
console.log("=".repeat(70));

function show(title, arr) {
  console.log(`\n--- ${title} (top ${SAMPLES}) ---`);
  arr.slice(0, SAMPLES).forEach((d) => {
    const yearAg = `${d.year || "??"} ${d.ageGroup || ""}`.trim();
    const loc = `${d.country}${d.place ? " " + d.place : ""}`.trim();
    console.log(
      `  mid=${d.mid.padStart(7)} | ${loc.padEnd(30)} | ${yearAg.padEnd(18)} |`
    );
    console.log(`    lookup: ${d.lookup}`);
    console.log(`    mh:     ${d.mh}`);
  });
}

show("Outros (mais interessantes)", cats.other);
show("Comprimento muito diferente", cats.length);
show("Só capitalização", cats.caps);
show("Só acentos", cats.accents);
