/**
 * Exporta um subset do licencia-dob-lookup.json para a KIDSpage usar como
 * "base de dados de espanhois" — cada entry tem { name, dobIso, sex, club, licencia }.
 * Output: public/data/spain-players.json
 */
const fs = require("fs");
const path = require("path");
const IN = path.resolve(__dirname, "../public/data/licencia-dob-lookup.json");
const HCP_IN = path.resolve(__dirname, "../public/data/licencia-hcp-lookup.json");
const IDX_IN = path.resolve(__dirname, "../public/data/rfegolf-resultats-index.json");
const OUT = path.resolve(__dirname, "../public/data/spain-players.json");
const d = JSON.parse(fs.readFileSync(IN, "utf-8"));
const lookup = d.lookup || {};

// ── Contagem de torneios por jogador (TODAS as plataformas) ──────────────
// O `sources[]` de cada entry do lookup lista os IDs de torneios em que o
// jogador apareceu — numéricos (RFEGolf / livegolfscoring) e "nc####"
// (NextCaddy: Andaluzia, Madrid, Castilla y León). É a contagem REAL, ao
// contrário dos rivais (rfegolf+fcg) que ignoram o NextCaddy. Para o total do
// ano corrente mapeamos cada source → ano via o índice de resultados.
const CUR_YEAR = new Date().getFullYear();
const idToYear = {};
try {
  const idx = JSON.parse(fs.readFileSync(IDX_IN, "utf-8"));
  for (const t of (idx.tournaments || [])) {
    if (t.year == null) continue;
    for (const key of [t.id, t.compId, t.tourId]) {
      if (key == null) continue;
      idToYear[String(key)] = t.year;
      if (t.source === "nextcaddy") idToYear["nc" + key] = t.year;
    }
  }
} catch (e) {
  console.warn("Aviso: rfegolf-resultats-index.json em falta — contagem por ano fica a 0.");
}

// HCP mais recente por licença (licencia-hcp-lookup é keyed em MAIÚSCULAS).
// Junta-se aqui para que o roster espanhol leve o handicap actual, consumido
// pelo adapter aggregator/sources/rfeg.js → sources.rfeg.hcp.
let hcpLookup = {};
try {
  hcpLookup = (JSON.parse(fs.readFileSync(HCP_IN, "utf-8")).lookup) || {};
} catch (e) {
  console.warn("Aviso: licencia-hcp-lookup.json em falta — entries ficam sem hcp.");
}

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFKD")
    .replace(/[̀-ͯ]/g, "").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
}

const byName = {};
const byLicencia = {};
for (const [lic, e] of Object.entries(lookup)) {
  const hcpEntry = hcpLookup[lic.toUpperCase()] || null;
  const sources = Array.isArray(e.sources) ? e.sources : [];
  let ano = 0;
  for (const s of sources) if (idToYear[String(s)] === CUR_YEAR) ano++;
  const entry = {
    licencia: lic,
    name: e.name,
    dob: e.dob,
    dobIso: e.dobIso,
    sex: e.sex,
    club: e.club,
    catEdad: e.catEdad,
    hcp: hcpEntry && typeof hcpEntry.hcp === "number" ? hcpEntry.hcp : null,
    hcpDate: hcpEntry?.dateIso || null,
    nat: "ESP",
    // Contagem de torneios (todas as plataformas) — total + ano corrente.
    tot: sources.length,
    ano,
    firstSeenIso: e.firstSeenIso || null,
    lastSeenIso: e.lastSeenIso || null,
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
