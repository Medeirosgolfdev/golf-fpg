/**
 * scripts/build-licencia-dob-lookup.js
 *
 * Varre todos os JSONs em public/data/rfegolf-resultats/ e cria um lookup
 * { licencia → { name, dob, sex, club, source: compId, lastSeenIso } } em
 * public/data/licencia-dob-lookup.json.
 *
 * RFEGolf é a única fonte que expõe DOB de jogadores espanhois — NextCaddy só
 * tem nome/licencia/hcp. Este lookup permite enriquecer o display NextCaddy
 * com idade calculada à data do torneio.
 *
 * Uso: node scripts/build-licencia-dob-lookup.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../public/data/rfegolf-resultats");
const OUT = path.resolve(__dirname, "../public/data/licencia-dob-lookup.json");

if (!fs.existsSync(ROOT)) {
  console.error("public/data/rfegolf-resultats nao existe. Corre primeiro o scrape RFEGolf.");
  process.exit(1);
}

function parseEsDate(s) {
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const files = fs.readdirSync(ROOT)
  .filter(f => /^\d+\.json$/.test(f))
  .sort();

const lookup = {};
let processed = 0;
let totalEntries = 0;

for (const file of files) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf-8"));
    if (!j || !j.ok || !j.inscritos) continue;
    const compId = j.compId || parseInt(file.replace(".json", ""), 10);
    const compDateIso = parseEsDate(j.meta?.dateStart) || j.scrapedAt || null;
    const allLists = ["admitidos", "reservas", "bajas", "invitados", "noAdmitidos", "provisional"];
    for (const list of allLists) {
      const players = j.inscritos[list] || [];
      for (const p of players) {
        if (!p.licencia || !p.dob) continue;
        const dobIso = parseEsDate(p.dob);
        if (!dobIso) continue;
        const lic = p.licencia.trim();
        const existing = lookup[lic];
        // Prefer entries from MORE RECENT competitions (last seen wins) — but DOB is immutable,
        // so we just keep first valid entry; only overwrite if we don't have a name/club yet.
        if (!existing) {
          lookup[lic] = {
            licencia: lic,
            name: p.name ? p.name.trim() : null,
            dob: p.dob,
            dobIso,
            sex: p.sexo || null,
            club: p.club ? p.club.trim() : null,
            catEdad: p.catEdad || null,
            sources: [compId],
            firstSeenIso: compDateIso,
            lastSeenIso: compDateIso,
          };
          totalEntries++;
        } else {
          // Update last-seen + add to sources, keep best non-empty fields
          if (!existing.sources.includes(compId)) existing.sources.push(compId);
          if (compDateIso && (!existing.lastSeenIso || compDateIso > existing.lastSeenIso)) {
            existing.lastSeenIso = compDateIso;
          }
          if (compDateIso && (!existing.firstSeenIso || compDateIso < existing.firstSeenIso)) {
            existing.firstSeenIso = compDateIso;
          }
          if (!existing.name && p.name) existing.name = p.name.trim();
          if (!existing.club && p.club) existing.club = p.club.trim();
          if (!existing.sex && p.sexo) existing.sex = p.sexo;
        }
      }
    }
    processed++;
  } catch (e) {
    console.warn("skip " + file + ": " + e.message);
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  source: "scripts/build-licencia-dob-lookup.js",
  totalCompsProcessed: processed,
  totalLicencias: Object.keys(lookup).length,
  lookup,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 0));  // não pretty — pode ser grande
const sizeMB = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
console.log(`Lookup built: ${Object.keys(lookup).length} licencias from ${processed} comps → ${OUT} (${sizeMB} MB)`);

// Sample
const sample = Object.values(lookup).slice(0, 3);
for (const e of sample) {
  console.log(`  ${e.licencia}: ${e.name} | DOB ${e.dob} (${e.sex || "?"}) | ${e.club || "—"} | seen in ${e.sources.length} comps`);
}
