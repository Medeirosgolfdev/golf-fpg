/**
 * scripts/aggregator/sources/wjgc.js
 *
 * Adapter WJGC + BJGT (BlueGolf).
 *
 * Lê todos os ficheiros que casem com wjgc_*.json ou bjgt_*.json em public/data/.
 * Não tem sourceKey forte por jogador — matching por nome+país (cross-source).
 */

const path = require("path");
const { DATA, DATA_DIR, readJsonSafe, listFiles } = require("../util/io");
const { displayName, countryToIso2 } = require("../util/names");
// Partilhado com o adapter england (ver util/rank.js).
const { rankResults } = require("../util/rank");

const SOURCE_ID = "wjgc";
const SOURCE_LABEL = "WJGC / BJGT";

function load(opts) {
  // BJGT / Daily Mail WJGC: usar os ficheiros canónicos brjgt* (superset com
  // todos os 14 escalões/ano + course), NÃO os mirrors legados wjgc_2025_*/
  // wjgc_2026_* (subconjunto sem course, que a KIDSPage legacy ainda usa).
  // Ler ambos duplicaria o mesmo evento (sourceKeys diferentes) e inflaria a
  // contagem de confrontos. bjgtPattern (bjgt_*) fica como fallback legado (0
  // ficheiros hoje).
  const brjgtFiles = listFiles(DATA_DIR, DATA.brjgtPattern);
  const bjgtFiles = listFiles(DATA_DIR, DATA.bjgtPattern);
  // FCG Callaway World + Uswing Mojing JWGC — mesmo formato bluegolf.
  const fcgWorldFiles = listFiles(DATA_DIR, DATA.fcgWorldPattern);
  const jwgcFiles = listFiles(DATA_DIR, DATA.jwgcPattern);

  const players = [];
  const tournaments = [];
  // Players nesta fonte: cada jogador único por (nome+país). sourceKey gerado.
  const playerMap = new Map();

  for (const file of [...brjgtFiles, ...bjgtFiles, ...fcgWorldFiles, ...jwgcFiles]) {
    const data = readJsonSafe(file, null);
    if (!data) continue;
    const tt = normalize(data, path.basename(file), playerMap);
    if (tt) tournaments.push(tt);
  }

  for (const p of playerMap.values()) players.push(p);

  return {
    sourceId: SOURCE_ID,
    sourceLabel: SOURCE_LABEL,
    players,
    tournaments,
  };
}

function normalize(data, fileName, playerMap) {
  const name = data.tournament || fileName.replace(/\.json$/, "");
  // Quando o scrape grava `category: ""` (bug histórico do scrape-bluegolf.js
  // que não preenchia category), tentamos inferir do título do torneio.
  // Suporta "Boys 10-11", "Girls 12-13", "B10-11", "Boys 8-9" etc.
  const category = data.category || extractCategoryFromName(name) || "Geral";
  const par = Array.isArray(data.par) ? data.par : null;
  const parTotal = typeof data.parTotal === "number" ? data.parTotal : (par ? par.reduce((a, b) => a + (b || 0), 0) : null);
  const year = data.year || null;

  const series = wjgcSeries(name);
  const sourceKey = fileName.replace(/\.json$/, "");

  const flightPlayers = Array.isArray(data.players) ? data.players : [];
  const results = [];
  for (const pl of flightPlayers) {
    const playerName = displayName(pl.name || "");
    if (!playerName) continue;
    const iso = countryToIso2(pl.country || "") || null;
    // Player sourceKey: hash from name+country
    const key = `${playerName.toLowerCase()}|${iso || ""}`;
    if (!playerMap.has(key)) {
      playerMap.set(key, {
        sourceKey: key,
        name: playerName,
        country: iso,
        extra: { countryName: pl.country || null },
      });
    }
    const rounds = (Array.isArray(pl.rounds) ? pl.rounds : []).map((r, i) => ({
      round: r.day || i + 1,
      gross: typeof r.gross === "number" ? r.gross : null,
      strokes: Array.isArray(r.scores) ? r.scores : undefined,
    }));
    results.push({
      playerSourceKey: key,
      playerName,
      pos: typeof pl.pos === "number" ? pl.pos : null,
      status: pl._error ? "DNS" : "OK",
      totalGross: typeof pl.total === "number" ? pl.total : null,
      toPar: typeof pl.result === "number" ? pl.result : null,
      rounds,
    });
  }
  rankResults(results, par ? par.length : 18);

  // Determinar ageMin/ageMax do category
  const ageRange = /(\d+)\s*-\s*(\d+)/.exec(category);
  const ageMin = ageRange ? +ageRange[1] : null;
  const ageMax = ageRange ? +ageRange[2] : null;
  const sex = /^Boys/i.test(category) ? "M" : /^Girls/i.test(category) ? "F" : null;

  // Determinar data — preferir dados reais. Se não há startDate/date no
  // ficheiro, fabricar um mês/dia aproximado a partir do nome do torneio.
  //
  // ⚠ ATENÇÃO — a UI (EvolutionChart, HistoryByTournament, ResultsTimeline)
  // FILTRA torneios sem date. Deixar null tornaria estes torneios invisíveis
  // no kids2. Por isso fabricamos data plausível por convenção do torneio:
  //   • Daily Mail WJGC      → final de Fevereiro (Villa Padierna)
  //   • European Open WAGR   → início de Agosto
  //   • BJGT generic         → meio do ano (fallback)
  // O year vem preferencialmente do nome do torneio (mais fiável que data.year).
  let effectiveYear = year;
  const yrInName = /\b(20\d{2})\b/.exec(name);
  if (yrInName) effectiveYear = +yrInName[1];
  // Datas reais por evento (o ficheiro bluegolf não as traz) → só se cai fora
  // da tabela é que se fabrica uma data pela convenção do torneio.
  const known = EVENT_DATES[eventSlug(sourceKey)];
  let dateIso = data.date || data.startDate || (known ? known.start : null);
  let endIso = known ? known.end : null;
  if (!dateIso && effectiveYear) {
    dateIso = inferDateFromName(name, effectiveYear);
  }

  // Links: preferir data.source (novo scrape-bluegolf grava o URL completo).
  // Fallback: hardcoded por filename para JSONs antigos que não têm source.
  const sourceUrl = data.source || inferBluegolfUrlFromFilename(sourceKey);
  const links = sourceUrl ? [{ label: "BlueGolf", url: sourceUrl }] : [];

  return {
    sourceKey,
    name,
    date: dateIso,
    startDate: dateIso,
    ...(endIso ? { endDate: endIso } : {}),
    year: effectiveYear, // pelo menos preserva ano para ordenação na UI
    seriesId: series.id,
    seriesLabel: series.label,
    course: data.course || null,
    parTotal,
    flights: [{
      flightKey: category.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label: category,
      ageMin,
      ageMax,
      sex,
      par,
      fieldSize: results.length,
      results,
    }],
    links,
  };
}



/** Slug do EVENTO a partir do nome do ficheiro ("fcg268_boys_11-12" → "fcg268").
 *  Todos os escalões do mesmo evento partilham datas. */
function eventSlug(sourceKey) {
  return String(sourceKey).split("_")[0];
}

/** Datas REAIS por evento — os ficheiros bluegolf não trazem data nenhuma e a
 *  UI do kids2 filtra torneios sem ela. Preferidas ao `inferDateFromName`.
 *  Espelham as `roundDates` do catálogo `URLS` (BJGTPage.tsx). */
const EVENT_DATES = {
  // FCG Callaway World Championship (Palm Springs / Palm Desert, CA)
  fcg251: { start: "2025-07-14", end: "2025-07-16" }, // Westin Mission - Pete Dye
  fcg268: { start: "2026-07-13", end: "2026-07-15" }, // Desert Willow - Mt. View
  // Uswing Mojing Junior World — Torrey Pines South, La Jolla CA
  jwgc261: { start: "2026-07-06", end: "2026-07-09" },
  // Daily Mail WJGC — Villa Padierna, Espanha
  brjgt243: { start: "2024-02-20", end: "2024-02-22" },
  brjgt2431: { start: "2024-02-20", end: "2024-02-22" },
  brjgt251: { start: "2025-04-05", end: "2025-04-06" },
  brjgt2537: { start: "2026-02-25", end: "2026-02-27" },
  // European Open WAGR — Le Touquet (La Forêt), França
  eowagr25: { start: "2025-08-11", end: "2025-08-13" },
};

/** Fallback URL para JSONs WJGC scrapados antes do source ser gravado.
 *  Mapping baseado no `RE-SCRAPE-WJGC.md` — contest IDs conhecidos. */
function inferBluegolfUrlFromFilename(sourceKey) {
  // Daily Mail WJGC 2025 — event brjgt251
  const map2025 = {
    "wjgc_2025_b7u":   "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/20/leaderboard.htm",
    "wjgc_2025_b1011": "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/34/leaderboard.htm",
    "wjgc_2025_g1213": "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/43/leaderboard.htm",
    "wjgc_2025_bwagr": "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/101/leaderboard.htm",
  };
  // Daily Mail WJGC 2026 — event brjgt2537
  const map2026 = {
    "wjgc_2026_b89":   "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/25/leaderboard.htm",
    "wjgc_2026_b1011": "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/73/leaderboard.htm",
    "wjgc_2026_b1213": "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/33/leaderboard.htm",
    "wjgc_2026_bwagr": "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/5/leaderboard.htm",
    "wjgc_2026_gwagr": "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/69/leaderboard.htm",
  };
  return map2025[sourceKey] || map2026[sourceKey] || null;
}

/** Extrai categoria (ex: "Boys 10-11") do título do torneio.
 *  Usado quando data.category vem vazio do scrape (bug histórico).
 *  Devolve string canónica "Boys N-M" ou "Girls N-M" ou null. */
function extractCategoryFromName(name) {
  if (!name) return null;
  // "Boys 10-11", "Girls 12-13" (com espaço a separar)
  let m = /\b(Boys|Girls)\s+(\d+)\s*[-–]\s*(\d+)/i.exec(name);
  if (m) return `${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}-${m[3]}`;
  // "Boys 10" / "Girls 12" (idade única — gera Sub-N artificial)
  m = /\b(Boys|Girls)\s+(\d+)\b/i.exec(name);
  if (m) return `${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`;
  // "B10-11", "G12-13" (abreviado, raro mas seguro)
  m = /\b([BG])(\d+)-(\d+)\b/i.exec(name);
  if (m) {
    const prefix = m[1].toUpperCase() === "B" ? "Boys" : "Girls";
    return `${prefix} ${m[2]}-${m[3]}`;
  }
  return null;
}

/** Infere data plausível (YYYY-MM-DD) a partir do nome do torneio.
 *  Necessário porque o scrape-bluegolf.js não preenche `date` e a UI filtra
 *  torneios sem date. As datas são aproximadas — preferir startDate real
 *  quando estiver disponível no ficheiro. */
function inferDateFromName(name, year) {
  if (!name || !year) return null;
  // FCG Callaway World Championship — Palm Springs, meados de Julho
  if (/FCG|Callaway/i.test(name)) return `${year}-07-15`;
  // Uswing Mojing Junior World (JWGC) — meados de Julho
  if (/Uswing|Mojing|JWGC|Junior\s+World/i.test(name)) return `${year}-07-15`;
  // Daily Mail WJGC — Villa Padierna, final de Fevereiro
  if (/Daily\s*Mail|WJGC|World\s+Junior/i.test(name)) return `${year}-02-26`;
  // European Open WAGR — início de Agosto
  if (/EOWAGR|European Open WAGR/i.test(name)) return `${year}-08-01`;
  // BJGT genérico — meio do ano (fallback)
  if (/BJGT/i.test(name)) return `${year}-07-01`;
  // Sem heurística específica — usar 1 de Janeiro (preserva ano para ordenação)
  return `${year}-01-01`;
}

function wjgcSeries(name) {
  if (/FCG|Callaway/i.test(name)) return { id: "fcgworld", label: "FCG Callaway World" };
  if (/Uswing|Mojing|JWGC/i.test(name)) return { id: "jwgc", label: "Uswing Mojing JWGC" };
  if (/EOWAGR|European Open WAGR/i.test(name)) return { id: "eowagr", label: "European Open WAGR" };
  if (/WJGC|World Junior Golf Championship|Daily Mail/i.test(name)) return { id: "wjgc", label: "WJGC · BJGT" };
  if (/BJGT/i.test(name)) return { id: "bjgt", label: "BJGT" };
  return { id: "wjgc-other", label: name };
}

module.exports = { load, SOURCE_ID, SOURCE_LABEL, rankResults, EVENT_DATES };
