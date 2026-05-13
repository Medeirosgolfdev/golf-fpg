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

const SOURCE_ID = "wjgc";
const SOURCE_LABEL = "WJGC / BJGT";

function load(opts) {
  const wjgcFiles = listFiles(DATA_DIR, DATA.wjgcPattern);
  const bjgtFiles = listFiles(DATA_DIR, DATA.bjgtPattern);

  const players = [];
  const tournaments = [];
  // Players nesta fonte: cada jogador único por (nome+país). sourceKey gerado.
  const playerMap = new Map();

  for (const file of [...wjgcFiles, ...bjgtFiles]) {
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
  const category = data.category || "Geral";
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
      status: pl.pos === null && pl._error ? "DNS" : (pl.pos === null ? "CUT" : "OK"),
      totalGross: typeof pl.total === "number" ? pl.total : null,
      toPar: typeof pl.result === "number" ? pl.result : null,
      rounds,
    });
  }

  // Determinar ageMin/ageMax do category
  const ageRange = /(\d+)\s*-\s*(\d+)/.exec(category);
  const ageMin = ageRange ? +ageRange[1] : null;
  const ageMax = ageRange ? +ageRange[2] : null;
  const sex = /^Boys/i.test(category) ? "M" : /^Girls/i.test(category) ? "F" : null;

  // Determinar data — prioridade: data explícita > inferida do nome > default Aug
  let dateIso = data.date || data.startDate || null;
  // Se não há, extrair year do nome se estiver lá (mais fiável que `year` field)
  let effectiveYear = year;
  const yrInName = /\b(20\d{2})\b/.exec(name);
  if (yrInName) effectiveYear = +yrInName[1];
  if (!dateIso && effectiveYear) {
    // Default: 1 Agosto (WJGC/Daily Mail são tipicamente Jul-Ago)
    dateIso = series.id === "eowagr" ? `${effectiveYear}-07-01`
            : `${effectiveYear}-08-01`;
  }

  return {
    sourceKey,
    name,
    date: dateIso,
    startDate: dateIso,
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
  };
}

function wjgcSeries(name) {
  if (/EOWAGR|European Open WAGR/i.test(name)) return { id: "eowagr", label: "European Open WAGR" };
  if (/WJGC|World Junior Golf Championship|Daily Mail/i.test(name)) return { id: "wjgc", label: "WJGC · BJGT" };
  if (/BJGT/i.test(name)) return { id: "bjgt", label: "BJGT" };
  return { id: "wjgc-other", label: name };
}

module.exports = { load, SOURCE_ID, SOURCE_LABEL };
