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
// Matcher partilhado (uma só cópia honesta — ver lib/ffgolf-catalog-match.js).
const PAGES_FFGOLF_URL = "https://pages.ffgolf.org/resultats/";
const { matchCatalog: _matchCatalog } = require("./lib/ffgolf-catalog-match.js");
const catalog = fs.existsSync(CATALOG_FILE)
  ? (JSON.parse(fs.readFileSync(CATALOG_FILE, "utf-8")).tournaments || [])
  : [];
const matchCatalog = (name, year) => _matchCatalog(name, year, catalog);
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
    const rawSeries = j.details?.series || [];
    const series = rawSeries.map((s) => ({
      serieId: s.serieId,
      label: s.label,
      players: s.players?.length || 0,
    }));
    const totalPlayers = series.reduce((sum, s) => sum + s.players, 0);

    // Assinatura por licenças (conjunto ordenado) para dedup de re-publicações:
    // a FFG por vezes republica o MESMO evento com outro trnId. Não vai ao
    // output — só serve para agrupar. Guardada por-torneio (interno).
    const licSet = new Set();
    for (const s of rawSeries) for (const p of (s.players || [])) if (p.license) licSet.add(p.license);
    const licSig = [...licSet].sort().join(",");

    // ── Campos ricos p/ a sidebar (existem no detalhe; o índice não os tinha) ──
    // Campo(s): courseTerrain de cada série, sem o prefixo "(FFG) ", dedup.
    const courses = [...new Set(
      rawSeries.map((s) => String(s.courseTerrain || "").replace(/^\(FFG\)\s*/i, "").trim()).filter(Boolean)
    )];
    const course = courses.length === 1 ? courses[0] : (courses.length ? courses : null);
    // Sexo do torneio a partir dos jogadores (M/F/mixed). Só o que a fonte diz.
    let nM = 0, nF = 0;
    for (const s of rawSeries) for (const p of (s.players || [])) {
      if (p.sex === "M") nM++; else if (p.sex === "F") nF++;
    }
    const sex = nM && nF ? "MF" : nM ? "M" : nF ? "F" : null;
    // Nº de rondas efectivamente jogadas: maior índice r com algum score/estado.
    let roundsPlayed = 0;
    for (const s of rawSeries) for (const p of (s.players || [])) {
      for (let r = 4; r > roundsPlayed; r--) {
        if (p["t" + r] != null || (p["statusR" + r] && p["statusR" + r] !== "")) { roundsPlayed = r; break; }
      }
    }
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
      _licSig: licSig,        // interno (removido antes do output) — dedup de re-publicação
      _licCount: licSet.size, // idem
      course,
      sex,
      roundsPlayed: roundsPlayed || null,
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

// ── Dedup de RE-PUBLICAÇÃO (mesmo evento, trnId diferente) ──────────
// A FFG por vezes republica o mesmo torneio com outro trnId (às vezes com
// nome ligeiramente diferente — "GRAND PRIX JEUNES" vs "…DE DEAUVILLE"). O
// dedup por trnId acima não os apanha. Agrupamos por (ano + conjunto EXACTO
// de licenças) com datas a ≤3 dias e ficamos com UM canónico (mais jogadores,
// depois mais ligas, depois trnId menor). Só actua com licenças a sério
// (≥5) e conjuntos IDÊNTICOS — rosters só parecidos (ex: Critérium Cadet a
// partilhar jogadores) NÃO são fundidos. Espelha o scripts/delete-... que
// apaga os ficheiros; aqui é a rede que aguenta um re-scrape recriá-los.
const dayDiff = (a, b) => {
  if (!a || !b) return 99;
  return Math.abs((new Date(a) - new Date(b)) / 864e5);
};
const bySig = new Map();
for (const t of deduped) {
  if (!t._licSig || t._licCount < 5) { bySig.set(`solo:${t.trnId}`, [t]); continue; }
  const key = `${t.year}|${t._licSig}`;
  if (!bySig.has(key)) bySig.set(key, []);
  bySig.get(key).push(t);
}
const canonical = [];
let droppedRepub = 0;
for (const group of bySig.values()) {
  if (group.length === 1) { canonical.push(group[0]); continue; }
  // Confirmar proximidade de data dentro do grupo (licenças iguais já garantem
  // o evento; a data protege contra coincidências raras entre épocas).
  group.sort((a, b) =>
    (b.totalPlayers - a.totalPlayers) ||
    ((b.ligues?.length || 1) - (a.ligues?.length || 1)) ||
    a.trnId.localeCompare(b.trnId)
  );
  const keep = group[0];
  const merged = [keep];
  for (const t of group.slice(1)) {
    if (dayDiff(keep.dateIso, t.dateIso) <= 3) {
      keep.ligues = [...new Set([...(keep.ligues || [keep.ligue]), ...(t.ligues || [t.ligue])])].sort();
      droppedRepub++;
    } else {
      merged.push(t); // data distante → evento diferente, mantém
    }
  }
  canonical.push(...merged);
}

for (const t of canonical) { delete t._licSig; delete t._licCount; }
canonical.sort((a, b) => (b.dateIso || "").localeCompare(a.dateIso || ""));

const out = {
  generatedAt: new Date().toISOString(),
  source: "scripts/build-ffgolf-resultats-index.js",
  total: canonical.length,
  tournaments: canonical,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
console.log(`OK: ${OUT}`);
console.log(`   ${canonical.length} torneios juvenis · ${droppedDup} duplicados de liga + ${droppedRepub} re-publicações removidos · ${skippedNonJuvenil} não-juvenis filtrados · ${canonical.reduce((s, t) => s + t.totalPlayers, 0)} jogadores`);
const byYear = {};
canonical.forEach((t) => { byYear[t.year || "?"] = (byYear[t.year || "?"] || 0) + 1; });
console.log("   por ano:", JSON.stringify(byYear));
const withGG = canonical.filter(t => t.ggPage).length;
const withOff = canonical.filter(t => t.ffgolfOfficialUrl).length;
console.log(`   com GolfGenius: ${withGG}, com URL oficial: ${withOff}`);
