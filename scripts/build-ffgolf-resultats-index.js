/**
 * scripts/build-ffgolf-resultats-index.js
 *
 * Cria public/data/ffgolf-resultats-index.json agregando os JSONs em
 * public/data/ffgolf-resultats/ (excepto _index-*).
 *
 * Filtra automaticamente para SÓ juvenis (descarta Mid-Am, Seniors, équipes
 * messieurs/dames, Coupe Ganay, Trophée Esmond/Carlhian, etc.).
 *
 * Cross-reference com public/data/ffgolf-catalog.json (in-memory) para popular
 * pagesFfgolfUrl/ffgolfOfficialUrl/ggPage de cada torneio que case com um
 * majeur do catálogo.
 *
 * Output:
 * {
 *   generatedAt, total,
 *   tournaments: [{
 *     file, trnId, partKey, name, formule, date, dateIso, year,
 *     typeCompetition, ligue, ligues, seriesCount, totalPlayers, divisions,
 *     pagesFfgolfUrl, ffgolfOfficialUrl, ggPage, ffgolfSlug, ffgolfSection
 *   }]
 * }
 *
 * Dedup por trnId: o portal FFG lista o mesmo torneio em várias ligas (um GP
 * Jeunes regional aparece também em 19="Clubs étrangers"; as Qualifications
 * CFJ nacionais aparecem em todas as ligas) e existem ficheiros com e sem
 * zero à esquerda ("03-02-X.json" vs "3-02-X.json"). O conteúdo é idêntico —
 * fica UMA entrada por trnId, na liga de menor número (00=Nacional ganha às
 * regionais, regionais ganham a 19), com as restantes registadas em `ligues`.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../public/data/ffgolf-resultats");
const OUT = path.resolve(__dirname, "../public/data/ffgolf-resultats-index.json");
const CATALOG_FILE = path.resolve(__dirname, "../public/data/ffgolf-catalog.json");

if (!fs.existsSync(ROOT)) {
  console.error("public/data/ffgolf-resultats nao existe.");
  process.exit(1);
}

// ── Filtro juvenil ──────────────────────────────────────────────
const JUVENIL_INCLUDE = [
  /\bU(8|10|12|14|16|18)\b/i,
  /\bjeunes?\b/i, /\bjuniors?\b/i,
  /\bbenjamins?\b/i, /\bbenjamines?\b/i,
  /\bminimes?\b/i, /\bcadets?\b/i, /\bcadettes?\b/i,
  /école de golf/i, /ecole de golf/i, /poucets/i,
];
const JUVENIL_EXCLUDE = [
  /seniors?/i, /mid[- ]?am(ateurs?)?/i,
  /messieurs/i, /dames/i,
  /coupe ganay/i, /trophée esmond/i, /trophée carlhian/i,
  /\bespoir\b/i,
];
function isJuvenil(name, typeCompetition) {
  if (typeCompetition === "03" || typeCompetition === "3") return true;
  if (!name) return false;
  if (JUVENIL_INCLUDE.some(re => re.test(name))) {
    if (JUVENIL_EXCLUDE.some(re => re.test(name))) return false;
    return true;
  }
  return false;
}

// ── Helpers de matching com catálogo ────────────────────────────
const PAGES_FFGOLF_URL = "https://pages.ffgolf.org/resultats/";
const STOP_TOK = new Set(["de","des","du","la","le","les","et","au","aux","un","une","sur","par","pour","2024","2025","2026"]);
function normName(s) {
  return String(s || "").toLowerCase().normalize("NFKD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function sigTokens(s) {
  return normName(s).split(" ").filter(t => t.length >= 3 && !STOP_TOK.has(t));
}
const catalog = fs.existsSync(CATALOG_FILE)
  ? (JSON.parse(fs.readFileSync(CATALOG_FILE, "utf-8")).tournaments || [])
  : [];
function matchCatalog(name, year) {
  if (!name || !year) return null;
  const tok = sigTokens(name);
  if (!tok.length) return null;
  const same = catalog.filter(e => String(e.year) === String(year));
  if (!same.length) return null;
  const exact = same.find(e => normName(e.title) === normName(name));
  if (exact) return exact;
  const cand = same.filter(e => {
    const c = normName(e.title);
    return tok.every(t => c.includes(t));
  });
  if (cand.length === 1) return cand[0];
  if (cand.length > 1) {
    const hasG = /gar[cç]ons|boys|men|messieurs/i.test(name);
    const hasF = /filles|girls|women|dames/i.test(name);
    if (hasG) {
      const m = cand.find(e => /gar[cç]ons|boys|men|messieurs/i.test(e.title));
      if (m) return m;
    }
    if (hasF) {
      const m = cand.find(e => /filles|girls|women|dames/i.test(e.title));
      if (m) return m;
    }
    return cand[0];
  }
  return null;
}
function officialUrl(e) {
  if (!e || !e.year || !e.slug || !e.section) return null;
  return "https://www.ffgolf.org/golf-amateur/jeunes/calendrier-resultats/" +
    e.section + "/" + e.year + "/" + e.slug + "/page-scores-tournoi";
}

function dateToIso(s) {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const files = fs.readdirSync(ROOT)
  .filter((f) => /^\d{1,2}-\d{1,2}-\d+\.json$/.test(f))
  .sort();

console.log(`A indexar ${files.length} ficheiros FFG Resultats`);

const tournaments = [];
let skippedNonJuvenil = 0;
for (const file of files) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf-8"));
    const m = file.match(/^(\d{1,2})-(\d{1,2})-(\d+)\.json$/);
    if (!m) continue;
    const typeCompetition = m[1].padStart(2, "0");
    const ligue = m[2].padStart(2, "0");
    const trnId = m[3];
    if (!isJuvenil(j.name, typeCompetition)) { skippedNonJuvenil++; continue; }
    const dateIso = dateToIso(j.date);
    const year = dateIso ? parseInt(dateIso.slice(0, 4), 10) : null;
    const series = (j.details?.series || []).map((s) => ({
      serieId: s.serieId,
      label: s.label,
      players: s.players?.length || 0,
    }));
    const totalPlayers = series.reduce((sum, s) => sum + s.players, 0);
    const cm = j.ggPage ? null : matchCatalog(j.name, year);
    tournaments.push({
      file,
      trnId,
      // Deep-link GET do portal: resultats-details/{partKey}/{trnId} (a UI do
      // portal só faz POST; a rota GET existe e é indexada pelo Google).
      partKey: j.partKey || null,
      name: j.name,
      formule: j.formule || "Simple",
      date: j.date,
      dateIso,
      year,
      typeCompetition,
      ligue,
      seriesCount: series.length,
      totalPlayers,
      divisions: series,
      pagesFfgolfUrl: j.pagesFfgolfUrl || PAGES_FFGOLF_URL,
      ffgolfOfficialUrl: j.ffgolfOfficialUrl || (cm ? officialUrl(cm) : null),
      ggPage: j.ggPage || (cm ? cm.gg_page : null) || null,
      ffgolfSlug: j.ffgolfSlug || (cm ? cm.slug : null) || null,
      ffgolfSection: j.ffgolfSection || (cm ? cm.section : null) || null,
    });
  } catch (e) {
    console.error(`${file}: ${e.message}`);
  }
}

// ── Dedup por trnId (ver cabeçalho) ─────────────────────────────
const byTrnId = new Map();
for (const t of tournaments) {
  if (!byTrnId.has(t.trnId)) byTrnId.set(t.trnId, []);
  byTrnId.get(t.trnId).push(t);
}
const deduped = [];
let droppedDup = 0;
for (const group of byTrnId.values()) {
  group.sort((a, b) =>
    a.ligue.localeCompare(b.ligue) ||
    a.typeCompetition.localeCompare(b.typeCompetition) ||
    a.file.localeCompare(b.file)
  );
  const keep = group[0];
  keep.ligues = [...new Set(group.map((t) => t.ligue))].sort();
  droppedDup += group.length - 1;
  deduped.push(keep);
}

deduped.sort((a, b) => (b.dateIso || "").localeCompare(a.dateIso || ""));

const out = {
  generatedAt: new Date().toISOString(),
  source: "scripts/build-ffgolf-resultats-index.js",
  total: deduped.length,
  tournaments: deduped,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
console.log(`OK: ${OUT}`);
console.log(`   ${deduped.length} torneios juvenis · ${droppedDup} duplicados de liga removidos · ${skippedNonJuvenil} não-juvenis filtrados · ${deduped.reduce((s, t) => s + t.totalPlayers, 0)} jogadores`);
const byYear = {};
deduped.forEach((t) => { byYear[t.year || "?"] = (byYear[t.year || "?"] || 0) + 1; });
console.log("   por ano:", JSON.stringify(byYear));
const withGG = deduped.filter(t => t.ggPage).length;
const withOff = deduped.filter(t => t.ffgolfOfficialUrl).length;
console.log(`   com GolfGenius: ${withGG}, com URL oficial: ${withOff}`);
