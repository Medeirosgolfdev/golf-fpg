/**
 * scripts/build-major-catalog.js
 *
 * Gera `public/data/major-catalog.json` — o ÍNDICE leve da página /major.
 *
 * PORQUÊ: a MajorPage pedia ~127 ficheiros (~14.6 MB) no arranque (incl. ~48
 * pedidos 404 por adivinhar anos que não existem), só para desenhar a lista
 * lateral. Este catálogo dá à lista toda a metadata de que precisa (nome, campo,
 * datas, nº de jogadores/escalões/rondas, Manuel/PT) num único ficheiro pequeno.
 * O detalhe de cada torneio (scorecards) passa a carregar LAZY, só ao clicar
 * (ver `loadDivisions` na MajorPage). Mesmo padrão do FFG/England.
 *
 * O catálogo é DERIVADO dos ficheiros de dados existentes (glob) — sem
 * adivinhar anos → sem 404s. Para bjgt/eowagr, as datas de ronda não vivem nos
 * ficheiros bluegolf (vêm do array URLS da BJGTPage), por isso há um pequeno
 * mapa ROUND_DATES aqui (eventos históricos, estáveis).
 *
 * Correr:  node scripts/build-major-catalog.js
 * Deve correr sempre que um ficheiro de dados MAJOR muda (ver workflows).
 *
 * ⚠ As regras de metadata AQUI espelham os builders da MajorPage.tsx
 * (buildMajorEntries / buildJobEntries / buildFmEntries / buildGgJobEntries).
 * Se um builder mudar a forma como calcula name/playerCount/etc., actualizar aqui.
 */

const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const DATA_DIR = path.join(__dirname, "..", "public", "data");
const OUT = path.join(DATA_DIR, "major-catalog.json");

/* ── Helpers de nome (espelho de src/utils/normName.ts + constants/manuel.ts) ── */
function normName(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function isManuelByName(name) {
  const n = normName(name);
  if (!/\bmanuel\b/.test(n)) return false;
  if (!/\bmedeiros\b/.test(n)) return false;
  if (/\b(joao|antonio|jose|pedro|miguel|ricardo|luis|carlos)\b/.test(n)) return false;
  return true;
}
function isPtCountry(c) {
  const s = String(c || "").trim();
  return /portugal/i.test(s) || /^(pt|prt|por)$/i.test(s);
}

/* ── IO ── */
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")); }
  catch { return null; }
}
function listFiles(re) {
  try { return fs.readdirSync(DATA_DIR).filter((f) => re.test(f)); }
  catch { return []; }
}

/* ── Datas de ronda bjgt/eowagr (não estão nos ficheiros; espelham URLS) ── */
const ROUND_DATES = {
  "bjgt:2024": ["20 Fev", "21 Fev", "22 Fev"],
  "bjgt:2026": ["25 Fev", "26 Fev", "27 Fev"],
  "eowagr:2025": ["11 Ago", "12 Ago", "13 Ago"],
  // bjgt:2025 não tem datas de ronda (roundDates undefined nas URLS).
};

/* ── Acumuladores ── */
const entries = [];
const vet = new Map(); // normName -> nº de torneios em que aparece (para o toggle Veteranos)

/** Conta cada jogador UMA vez por torneio (dedup por nome normalizado). */
function addVet(names) {
  const seen = new Set();
  for (const nm of names) {
    const k = normName(nm);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    vet.set(k, (vet.get(k) || 0) + 1);
  }
}

const maxRounds = (players) =>
  players.reduce((m, p) => Math.max(m, Array.isArray(p.rounds) ? p.rounds.length : 0), 0);

/* ═══════════════════════════════════════════════════════════════════════
   1) BLUEGOLF — bjgt (brjgt*) + eowagr (eowagr25_contest*)
   Cada ficheiro = 1 escalão. Agrupar por (série, ano).
   ═══════════════════════════════════════════════════════════════════════ */
function buildBluegolf() {
  const files = [
    ...listFiles(/^brjgt.*\.json$/).map((f) => ({ file: f, series: "bjgt" })),
    ...listFiles(/^eowagr25_contest\d+\.json$/).map((f) => ({ file: f, series: "eowagr" })),
  ];
  const byKey = new Map(); // `${series}:${year}` -> { series, year, datas[] }
  for (const { file, series } of files) {
    const d = readJson(file);
    if (!d || !Array.isArray(d.players)) continue;
    const year = Number(d.year);
    if (!year) continue;
    const key = `${series}:${year}`;
    if (!byKey.has(key)) byKey.set(key, { series, year, divs: [] });
    byKey.get(key).divs.push(d);
  }
  for (const [key, { series, year, divs }] of byKey) {
    // players "válidos" = com total e pelo menos uma ronda (espelha loadT).
    const validOf = (d) => d.players.filter((p) => p.total != null && Array.isArray(p.rounds) && p.rounds.length > 0);
    const allValid = divs.flatMap(validOf);
    const allPlayers = divs.flatMap((d) => d.players);
    const rawName = (divs.find((d) => d.tournament)?.tournament || "").replace(/\s*[-–]\s*(boys|girls|u\d|sub).*$/i, "").trim();
    const seriesLabel = series === "eowagr" ? "EU" : "BJGT";
    const rd = ROUND_DATES[key];
    entries.push({
      id: key,
      source: series,
      series: seriesLabel,
      year,
      name: rawName || `${seriesLabel} ${year}`,
      course: series === "eowagr" ? "França" : "Espanha",
      dateStart: rd ? `${rd[0]} ${year}` : undefined,
      dateEnd: rd && rd.length > 1 ? `${rd[rd.length - 1]} ${year}` : undefined,
      roundsCount: (rd && rd.length) || maxRounds(allValid) || undefined,
      playerCount: allValid.length,
      divisionCount: divs.length,
      hasManuel: allPlayers.some((p) => isManuelByName(p.name)),
      hasPt: allPlayers.some((p) => isPtCountry(p.country) || isManuelByName(p.name)),
    });
    addVet(allValid.map((p) => p.name));
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   2) DORAL — ftm_doral_<ano>.json (RawGG: divisions[].players[])
   ═══════════════════════════════════════════════════════════════════════ */
function buildDoral() {
  for (const file of listFiles(/^ftm_doral_\d+\.json$/)) {
    const d = readJson(file);
    if (!d || !Array.isArray(d.divisions)) continue;
    const year = Number(d.year) || Number((file.match(/(\d{4})/) || [])[1]);
    if (!year) continue;
    const players = d.divisions.flatMap((dv) => dv.players || []);
    const valid = players.filter((p) => p.total != null);
    entries.push({
      id: `doral:${year}`,
      source: "doral",
      series: "Doral",
      year,
      name: d.tournament || `Doral ${year}`,
      // buildMajorEntries: várias divisões = vários campos → "USA" (o Doral é
      // sempre multi-campo Red Tiger/Golden Palm/…).
      course: d.divisions.length > 1 ? "USA" : undefined,
      roundsCount: maxRounds(valid) || undefined,
      playerCount: valid.length,
      divisionCount: d.divisions.length,
      hasManuel: players.some((p) => isManuelByName(p.name)),
      hasPt: players.some((p) => isPtCountry(p.country) || isManuelByName(p.name)),
      escalao: d.divisions.length === 1 ? d.divisions[0].division : undefined,
    });
    addVet(valid.map((p) => p.name));
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   3) GOLFGENIUS / JobFile — job, fm, fsga, uajt, mexnacional, icopa,
      interzonas, avtrophy. Cada ficheiro = 1 torneio com divisions[].
   ═══════════════════════════════════════════════════════════════════════ */
const GG_SOURCES = [
  { prefix: "orangebowl_", source: "job", series: "JOB", name: (f, y) => `Junior Orange Bowl ${y}`, course: (f) => f.course || undefined, union: false },
  { prefix: "ftm_fm_", source: "fm", series: "FM", name: (f, y) => `Future Masters Golf ${y}`, course: (f) => f.course || "Dothan Country Club", union: true },
  { prefix: "fsga_", source: "fsga", series: "FSGA", name: (f, y) => f.tournament || `FSGA ${y}`, course: (f) => f.course || undefined, union: true },
  { prefix: "uajt_", source: "uajt", series: "UA", name: (f, y) => f.tournament || `UA ${y}`, course: (f) => f.course || undefined, union: true },
  { prefix: "mexnacional_", source: "mexnacional", series: "MÉX", name: (f, y) => f.tournament || `MÉX ${y}`, course: (f) => f.course || undefined, union: true },
  { prefix: "icopa_", source: "icopa", series: "Bobby Díaz", name: (f, y) => f.tournament || `Bobby Díaz ${y}`, course: (f) => f.course || undefined, union: true },
  { prefix: "interzonas_", source: "interzonas", series: "Interzonas", name: (f, y) => f.tournament || `Interzonas ${y}`, course: (f) => f.course || undefined, union: true },
  { prefix: "avtrophy_", source: "avtrophy", series: "BEL U14", name: (f, y) => f.tournament || `BEL U14 ${y}`, course: (f) => f.course || undefined, union: true },
  // EGA European Team Championships (GolfBox, mesmo JobFile do avtrophy).
  { prefix: "ebtc2_", source: "ebtc2", series: "ETC Boys", name: (f, y) => f.tournament || `ETC Boys ${y}`, course: (f) => f.course || undefined, union: true },
  { prefix: "egtc_", source: "egtc", series: "ETC Girls", name: (f, y) => f.tournament || `ETC Girls ${y}`, course: (f) => f.course || undefined, union: true },
];

const hasScores = (p) => Array.isArray(p.rounds) && p.rounds.some((r) => Array.isArray(r.scores) && r.scores.length > 0);

function buildGgJob() {
  for (const src of GG_SOURCES) {
    const re = new RegExp(`^${src.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\d+\\.json$`);
    for (const file of listFiles(re)) {
      const f = readJson(file);
      if (!f || !Array.isArray(f.divisions)) continue;
      const year = Number(f.year) || Number((file.match(/(\d{4})/) || [])[1]);
      if (!year) continue;
      const players = f.divisions.flatMap((dv) => dv.players || []);
      // playerCount: "union" (total OU rondas com scores) para fm/gg em curso;
      // só `total != null` para o JOB (espelha buildJobEntries).
      const valid = players.filter((p) => (p.total != null) || (src.union && hasScores(p)));
      // Torneio ainda sem campo/scores (ex: evento futuro por começar) → não listar.
      if (valid.length === 0) continue;
      entries.push({
        id: `${src.source}:${year}`,
        source: src.source,
        series: src.series,
        year,
        name: src.name(f, year),
        course: src.course(f),
        sourceUrl: f.source || undefined,
        roundsCount: maxRounds(valid) || undefined,
        playerCount: valid.length,
        divisionCount: f.divisions.length,
        hasManuel: players.some((p) => isManuelByName(p.name)),
        hasPt: players.some((p) => isPtCountry(p.country) || isManuelByName(p.name)),
        escalao: f.divisions.length === 1 ? f.divisions[0].division : undefined,
      });
      addVet(valid.map((p) => p.name));
    }
  }
}

/* ── Run ── */
buildBluegolf();
buildDoral();
buildGgJob();

// Ordenar por ano desc, depois nome — só por estética do ficheiro (o shell reordena).
entries.sort((a, b) => (b.year - a.year) || String(a.name).localeCompare(String(b.name)));

// veteranIndex: só nomes com ≥2 presenças (o toggle usa threshold 3; ≥2 chega
// e poda milhares de one-offs → ficheiro muito mais pequeno).
const veteranIndex = {};
for (const [k, n] of vet) if (n >= 2) veteranIndex[k] = n;

// Limpar undefined (JSON não os guarda, mas mantém o ficheiro enxuto).
for (const e of entries) for (const key of Object.keys(e)) if (e[key] === undefined) delete e[key];

const out = {
  generatedAt: new Date().toISOString(),
  source: "build-major-catalog.js",
  total: entries.length,
  veteranIndex,
  entries,
};

writeJsonAtomic(OUT, out);

const withM = entries.filter((e) => e.hasManuel).length;
console.log(`major-catalog.json: ${entries.length} torneios, ${Object.keys(veteranIndex).length} veteranos (≥2), ${withM} com Manuel`);
console.log(`  → ${OUT}`);
