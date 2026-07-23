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
  "fcg:2025": ["14 Jul", "15 Jul", "16 Jul"],
  "fcg:2026": ["13 Jul", "14 Jul", "15 Jul"],
  // bjgt:2025 não tem datas de ronda (roundDates undefined nas URLS).
};

/* ── Intervalo de datas (start→end) para eventos bluegolf a decorrer, cuja
   contagem de rondas ainda não está fechada. Só alimenta dateStart/dateEnd —
   NÃO afecta roundsCount (esse vem do nº real de rondas nos dados). ── */
const BLUEGOLF_DATE_RANGE = {
  "jwgc:2026": { start: "6 Jul", end: "9 Jul" }, // Torrey Pines - South, La Jolla CA (parcial: só Boys 13-14/15-18)
};

/* ── Fallback de datas ISO para torneios sem datas nos dados nem em round.date
   (curadas à mão; datas oficiais dos eventos). Só usadas quando nada mais dá. ── */
const FALLBACK_DATES = {
  // Junior Orange Bowl — Biltmore GC, Coral Gables. Slot FIXO 3–6 de JANEIRO do
  // ano da edição (NÃO Dezembro): 59ª=3-6 Jan 2023, 61ª terminou 6 Jan 2025,
  // 62ª=3-6 Jan 2026 (amateurgolf). O ficheiro orangebowl_YYYY é a edição de
  // Janeiro desse ano (já com resultados). Fontes não trazem round.date → hardcode.
  "job:2023": { dateStart: "2023-01-03", dateEnd: "2023-01-06" },
  "job:2024": { dateStart: "2024-01-03", dateEnd: "2024-01-06" },
  "job:2025": { dateStart: "2025-01-03", dateEnd: "2025-01-06" },
  "job:2026": { dateStart: "2026-01-03", dateEnd: "2026-01-06" },
  // Daily Mail WJGC 2025 (BJGT) — sem datas de ronda nos ficheiros bluegolf.
  "bjgt:2025": { dateStart: "2025-04-05", dateEnd: "2025-04-06" },
};

/* ── Meses em inglês (round.date dos JobFiles/doral: "Fri, December 19") ── */
const MONTHS_EN = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
/** "Fri, December 19" (+ ano do ficheiro) → "2025-12-19". */
function parseRoundDateISO(s, year) {
  if (!s || !year) return null;
  const m = /([A-Za-z]+)\s+(\d{1,2})/.exec(String(s).replace(/^[A-Za-z]+,\s*/, ""));
  if (!m) return null;
  const mon = MONTHS_EN[m[1].toLowerCase()];
  if (!mon) return null;
  return `${year}-${String(mon).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`;
}
/* ── Meses PT abreviados (ROUND_DATES / BLUEGOLF_DATE_RANGE: "25 Fev", "6 Jul") ── */
const MONTHS_PT = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};
/** "25 Fev" (+ ano) → "2026-02-25" ISO. Uniformiza as datas bluegolf com as
 *  restantes fontes (todas ISO) — sem isto a sidebar não ordena por data. */
function ptDateToIso(s, year) {
  if (!s || !year) return undefined;
  const m = /^\s*(\d{1,2})\s+([A-Za-zçÇ]+)/.exec(String(s));
  if (!m) return undefined;
  const mon = MONTHS_PT[m[2].toLowerCase().slice(0, 3)];
  if (!mon) return undefined;
  return `${year}-${String(mon).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
}
/** Deriva {dateStart,dateEnd} ISO do campo round.date de uma lista de jogadores. */
function deriveDatesFromRounds(players, year) {
  const iso = [];
  for (const p of players || []) for (const r of (p.rounds || [])) {
    const d = parseRoundDateISO(r.date, year);
    if (d) iso.push(d);
  }
  if (!iso.length) return {};
  iso.sort();
  const dateStart = iso[0];
  const dateEnd = iso[iso.length - 1] !== dateStart ? iso[iso.length - 1] : undefined;
  return { dateStart, dateEnd };
}

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
    ...listFiles(/^fcg\d+_.*\.json$/).map((f) => ({ file: f, series: "fcg" })),
    ...listFiles(/^jwgc\d+_.*\.json$/).map((f) => ({ file: f, series: "jwgc" })),
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
    const seriesLabel = series === "eowagr" ? "EU" : series === "fcg" ? "FCG" : series === "jwgc" ? "JWGC" : "BJGT";
    const rd = ROUND_DATES[key];
    const dr = BLUEGOLF_DATE_RANGE[key];
    const rawCourse = divs.find((d) => d.course)?.course || "";
    entries.push({
      id: key,
      source: series,
      series: seriesLabel,
      year,
      name: rawName || `${seriesLabel} ${year}`,
      course: series === "eowagr" ? "França" : series === "jwgc" || series === "fcg" ? (rawCourse || "USA") : "Espanha",
      dateStart: dr ? ptDateToIso(dr.start, year) : rd ? ptDateToIso(rd[0], year) : undefined,
      dateEnd: dr ? ptDateToIso(dr.end, year) : rd && rd.length > 1 ? ptDateToIso(rd[rd.length - 1], year) : undefined,
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
      ...deriveDatesFromRounds(players, year),
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
  // O título do GG só leva o ano em algumas edições ("2025 'Champion of…'" vs
  // "'Champion of…'") → tirar o prefixo para a lista não misturar os dois (o
  // ano já é coluna própria).
  { prefix: "uaworlds_", source: "uaworlds", series: "UA Worlds", name: (f, y) => (f.tournament || `UA Worlds ${y}`).replace(/^d{4}s+/, ""), course: (f) => f.course || undefined, union: true },
  { prefix: "coc_", source: "coc", series: "CoC", name: (f, y) => (f.tournament || `Champion of Champions ${y}`).replace(/^\d{4}\s+/, ""), course: (f) => f.course || undefined, union: true },
  { prefix: "icopa_", source: "icopa", series: "Bobby Díaz", name: (f, y) => f.tournament || `Bobby Díaz ${y}`, course: (f) => f.course || undefined, union: true },
  { prefix: "interzonas_", source: "interzonas", series: "Interzonas", name: (f, y) => f.tournament || `Interzonas ${y}`, course: (f) => f.course || undefined, union: true },
  { prefix: "avtrophy_", source: "avtrophy", series: "BEL U14", name: (f, y) => f.tournament || `BEL U14 ${y}`, course: (f) => f.course || undefined, union: true },
  // EGA European Team Championships (GolfBox, mesmo JobFile do avtrophy).
  { prefix: "ebtc2_", source: "ebtc2", series: "ETC Boys", name: (f, y) => f.tournament || `ETC Boys ${y}`, course: (f) => f.course || undefined, union: true },
  { prefix: "egtc_", source: "egtc", series: "ETC Girls", name: (f, y) => f.tournament || `ETC Girls ${y}`, course: (f) => f.course || undefined, union: true },
  { prefix: "elg_", source: "elg", series: "ETC Ladies", name: (f, y) => f.tournament || `ETC Ladies ${y}`, course: (f) => f.course || undefined, union: true },
  { prefix: "eatc_", source: "eatc", series: "ETC Men", name: (f, y) => f.tournament || `ETC Men ${y}`, course: (f) => f.course || undefined, union: true },
  { prefix: "eatc2_", source: "eatc2", series: "ETC Men 2", name: (f, y) => f.tournament || `ETC Men 2 ${y}`, course: (f) => f.course || undefined, union: true },
  { prefix: "eym_", source: "eym", series: "Young Masters", name: (f, y) => f.tournament || `European Young Masters ${y}`, course: (f) => f.course || undefined, union: true },
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
        // Datas: GolfBox (ebtc2/egtc/avtrophy) traz startDate/endDate ISO no topo;
        // os GolfGenius não, mas têm round.date por ronda ("Fri, June 30") → derivar.
        ...(f.startDate
          ? { dateStart: f.startDate, dateEnd: f.endDate || undefined }
          : deriveDatesFromRounds(players, year)),
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

// Fallback final: torneios sem datas nos dados nem em round.date (JOB, WJGC 2025)
// recebem as datas oficiais curadas — só quando ainda não têm nenhuma.
for (const e of entries) {
  if ((e.dateStart || e.dateEnd) || !FALLBACK_DATES[e.id]) continue;
  e.dateStart = FALLBACK_DATES[e.id].dateStart;
  e.dateEnd = FALLBACK_DATES[e.id].dateEnd;
}

// Torneios ocultados da /major (sem PT/rivais conhecidos — só ocupam espaço).
// PT feminino joga o European LADIES' Team (fonte elg), não o Girls (egtc).
// PT masculino joga a Div. 2 (fonte eatc2), não a Div. 1 (eatc).
const HIDE_IDS = new Set(["egtc:2026", "eatc:2026"]);
{
  const before = entries.length;
  for (let i = entries.length - 1; i >= 0; i--) if (HIDE_IDS.has(entries[i].id)) entries.splice(i, 1);
  if (entries.length !== before) console.log(`  (ocultados ${before - entries.length} torneio(s): ${[...HIDE_IDS].join(", ")})`);
}

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
