/**
 * Exporta um subset do licencia-dob-lookup.json para a KIDSpage usar como
 * "base de dados de espanhois" — cada entry tem { name, dobIso, sex, club, licencia }.
 * Output: public/data/spain-players.json
 */
const fs = require("fs");
const path = require("path");
const IN = path.resolve(__dirname, "../public/data/licencia-dob-lookup.json");
const OUT = path.resolve(__dirname, "../public/data/spain-players.json");
const d = JSON.parse(fs.readFileSync(IN, "utf-8"));
const lookup = d.lookup || {};

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFKD")
    .replace(/[̀-ͯ]/g, "").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
}

const byName = {};
const byLicencia = {};
for (const [lic, e] of Object.entries(lookup)) {
  const entry = {
    licencia: lic,
    name: e.name,
    dob: e.dob,
    dobIso: e.dobIso,
    sex: e.sex,
    club: e.club,
    catEdad: e.catEdad,
    nat: "ESP",
  };
  byLicencia[lic] = entry;
  if (!e.name) continue;
  // RFEGolf armazena nomes como "APELIDO , NOMES" (com vírgula). Indexamos
  // ambas as variantes para conseguirmos match com KIDSpage que tem "Nomes Apelido".
  const raw = norm(e.name);
  byName[raw] = entry;
  // Variante invertida: "apelido , nomes" → "nomes apelido"
  const m = e.name.match(/^([^,]+?)\s*,\s*(.+)$/);
  if (m) {
    const apelido = norm(m[1]);
    const nomes = norm(m[2]);
    if (nomes && apelido) {
      byName[nomes + ' ' + apelido] = entry;
      byName[apelido + ' ' + nomes] = entry;
    }
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  source: "licencia-dob-lookup.json (subset Spain)",
  total: Object.keys(byLicencia).length,
  byName, byLicencia,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
const size = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
console.log(`Built: ${out.total} entries → ${OUT} (${size} MB)`);
