/**
 * scripts/aggregator/sources/eowagr.js
 *
 * Adapter European Open WAGR (eowagr*.json).
 *
 * Mesmo formato BlueGolf que WJGC, mas separado para clareza.
 * Encaminha para o adapter WJGC com pattern diferente.
 */

const path = require("path");
const { DATA, DATA_DIR, readJsonSafe, listFiles } = require("../util/io");
const { displayName, countryToIso2 } = require("../util/names");

const SOURCE_ID = "eowagr";
const SOURCE_LABEL = "European Open WAGR";

function load(opts) {
  const files = listFiles(DATA_DIR, DATA.eowagrPattern);
  const players = [];
  const tournaments = [];
  const playerMap = new Map();

  for (const file of files) {
    const data = readJsonSafe(file, null);
    if (!data) continue;
    const tt = normalize(data, path.basename(file), playerMap);
    if (tt) tournaments.push(tt);
  }

  for (const p of playerMap.values()) players.push(p);

  return { sourceId: SOURCE_ID, sourceLabel: SOURCE_LABEL, players, tournaments };
}

function normalize(data, fileName, playerMap) {
  const par = Array.isArray(data.par) ? data.par : null;
  const parTotal = typeof data.parTotal === "number" ? data.parTotal : (par ? par.reduce((a, b) => a + (b || 0), 0) : null);
  const year = data.year || null;
  const name = data.tournament || `EOWAGR ${year || ""}`.trim();
  const category = data.category || "Geral";
  const sourceKey = fileName.replace(/\.json$/, "");

  const flightPlayers = Array.isArray(data.players) ? data.players : [];
  const results = [];
  for (const pl of flightPlayers) {
    const playerName = displayName(pl.name || "");
    if (!playerName) continue;
    const iso = countryToIso2(pl.country || "") || null;
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
      status: "OK",
      totalGross: typeof pl.total === "number" ? pl.total : null,
      toPar: typeof pl.result === "number" ? pl.result : null,
      rounds,
    });
  }

  const ageRange = /(\d+)\s*-\s*(\d+)/.exec(category);
  const ageMin = ageRange ? +ageRange[1] : null;
  const ageMax = ageRange ? +ageRange[2] : null;
  const sex = /^Boys/i.test(category) ? "M" : /^Girls/i.test(category) ? "F" : null;

  // Links: preferir data.source (URL do leaderboard BlueGolf gravado pelo scrape)
  const links = data.source ? [{ label: "BlueGolf", url: data.source }] : [];

  return {
    sourceKey,
    name,
    date: year ? `${year}-07-01` : null,
    seriesId: "eowagr",
    seriesLabel: "European Open WAGR",
    course: data.course || null,
    parTotal,
    flights: [{
      flightKey: category.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label: category, ageMin, ageMax, sex, par,
      fieldSize: results.length,
      results,
    }],
    links,
  };
}

module.exports = { load, SOURCE_ID, SOURCE_LABEL };
