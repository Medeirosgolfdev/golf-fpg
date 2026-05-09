/**
 * scripts/enrich-licencia-from-fcg.js
 *
 * Enriquece public/data/licencia-dob-lookup.json com licenças encontradas em
 * scripts/fcg-scope.json (campo `inscritos` de cada torneio FCG — fonte:
 * tabela embebida em catgolf.com).
 *
 * Para cada licença CB/AD/etc não conhecida, adiciona uma entry com
 * { name, source: ["catgolf-fcg-scope"], firstSeenIso, lastSeenIso }
 * sem DOB. Para licenças já conhecidas, **só** actualiza:
 *   - lastSeenIso (se mais recente)
 *   - sources (adiciona "catgolf-fcg-scope" se ainda não estava)
 * Não sobrescreve dob/sex/club existentes.
 *
 * USO:
 *   node scripts/enrich-licencia-from-fcg.js               # dry-run (default)
 *   node scripts/enrich-licencia-from-fcg.js --apply       # escreve mudanças
 */

"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const SCOPE = path.join(REPO, "scripts", "fcg-scope.json");
const LOOKUP = path.join(REPO, "public", "data", "licencia-dob-lookup.json");

const APPLY = process.argv.includes("--apply");

if (!fs.existsSync(SCOPE)) {
  console.error("Missing", SCOPE, "— corre discover-fcg-scope.js primeiro com --keep-non-juvenile.");
  process.exit(1);
}
if (!fs.existsSync(LOOKUP)) {
  console.error("Missing", LOOKUP);
  process.exit(1);
}

const scope = JSON.parse(fs.readFileSync(SCOPE, "utf8"));
const lookupFile = JSON.parse(fs.readFileSync(LOOKUP, "utf8"));
const lookup = lookupFile.lookup || {};

// Backup primeiro
if (APPLY) {
  const bak = LOOKUP + ".bak-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  fs.copyFileSync(LOOKUP, bak);
  console.log("[enrich] backup ->", path.relative(REPO, bak));
}

let added = 0;
let updated = 0;
let skipped = 0;

const SOURCE_TAG = "catgolf-fcg-scope";

for (const t of scope.tournaments || []) {
  const tDate = t.dateIso || t.dateStart || (t.year ? `${t.year}-01-01` : null);
  for (const i of t.inscritos || []) {
    const lic = i.license;
    if (!lic) continue;
    const registeredAt = i.registeredAt || null;
    const seenIso = (registeredAt && registeredAt.slice(0, 10)) || tDate;

    if (!lookup[lic]) {
      // Adicionar entry nova (sem DOB)
      lookup[lic] = {
        licencia: lic,
        name: i.name,
        dob: null,
        dobIso: null,
        sex: null,
        club: null,
        catEdad: null,
        sources: [SOURCE_TAG],
        firstSeenIso: seenIso,
        lastSeenIso: seenIso,
      };
      added++;
    } else {
      // Actualizar entry existente — só completar campos vazios
      const e = lookup[lic];
      let didUpdate = false;
      if (!e.name && i.name) { e.name = i.name; didUpdate = true; }
      e.sources = e.sources || [];
      if (!e.sources.includes(SOURCE_TAG)) {
        e.sources.push(SOURCE_TAG);
        didUpdate = true;
      }
      if (seenIso) {
        if (!e.firstSeenIso || seenIso < e.firstSeenIso) {
          e.firstSeenIso = seenIso;
          didUpdate = true;
        }
        if (!e.lastSeenIso || seenIso > e.lastSeenIso) {
          e.lastSeenIso = seenIso;
          didUpdate = true;
        }
      }
      if (didUpdate) updated++;
      else skipped++;
    }
  }
}

const out = {
  ...lookupFile,
  generatedAt: new Date().toISOString(),
  totalLicencias: Object.keys(lookup).length,
  lookup,
};

console.log(`[enrich] added=${added}, updated=${updated}, skipped=${skipped}`);
console.log(`[enrich] new total licenças: ${Object.keys(lookup).length} (was ${Object.keys(lookupFile.lookup).length})`);

if (APPLY) {
  fs.writeFileSync(LOOKUP, JSON.stringify(out, null, 0));
  console.log(`[enrich] wrote ${path.relative(REPO, LOOKUP)} (${(fs.statSync(LOOKUP).size / 1024).toFixed(1)} KB)`);
} else {
  console.log("[enrich] dry-run (no changes). Use --apply to write.");
}
