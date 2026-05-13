/**
 * scripts/aggregator/sources/doral.js
 *
 * Adapter First Tee Miami Doral Jr. Classic (GolfGenius).
 *
 * Lê ftm_doral_YYYY.json. Cada ficheiro tem várias divisions; cada division é um flight.
 * Players têm `id` (GolfGenius), `name` ("Last, First"), `country` (nome longo), `birthYear`.
 */

const path = require("path");
const { DATA, DATA_DIR, readJsonSafe, listFiles } = require("../util/io");
const { displayName, splitName, countryToIso2 } = require("../util/names");

const SOURCE_ID = "doral";
const SOURCE_LABEL = "First Tee Miami Doral Jr. Classic";

function load(opts) {
  const files = listFiles(DATA_DIR, DATA.doralPattern);
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
  const year = data.year || null;
  const sourceKey = fileName.replace(/\.json$/, "");
  const divisions = Array.isArray(data.divisions) ? data.divisions : [];
  const flights = [];

  for (const div of divisions) {
    const divKey = div.division || div.key || div.name || "";
    const ageRange = /(\d+)\s*-\s*(\d+)/.exec(divKey) || /(\d+)\s*&\s*(\d+)/.exec(divKey);
    const ageMin = ageRange ? +ageRange[1] : null;
    const ageMax = ageRange ? +ageRange[2] : null;
    const sex = /^Boys/i.test(divKey) ? "M" : /^Girls/i.test(divKey) ? "F" : null;

    const par = Array.isArray(div.par) ? div.par : null;
    const parTotal = typeof div.parTotal === "number" ? div.parTotal : (par ? par.reduce((a, b) => a + (b || 0), 0) : null);

    const divPlayers = Array.isArray(div.players) ? div.players : [];
    const results = [];
    for (const pl of divPlayers) {
      const rawName = pl.name || "";
      const cleanName = displayName(splitName(rawName)); // "Last, First" → "First Last"
      if (!cleanName) continue;
      const iso = countryToIso2(pl.country || "") || null;
      const key = pl.id ? `doral-${pl.id}` : `${cleanName.toLowerCase()}|${iso || ""}`;
      if (!playerMap.has(key)) {
        playerMap.set(key, {
          sourceKey: key,
          name: cleanName,
          country: iso,
          extra: {
            countryName: pl.country || null,
            birthYear: typeof pl.birthYear === "number" ? pl.birthYear : null,
            golfGeniusId: pl.id || null,
          },
        });
      }
      const rounds = (Array.isArray(pl.rounds) ? pl.rounds : []).map((r) => ({
        round: r.day || rounds?.length + 1,
        gross: typeof r.gross === "number" ? r.gross : null,
        strokes: Array.isArray(r.scores) ? r.scores : undefined,
      }));
      // Algumas entradas têm r1Gross/r2Gross sem rounds detalhados
      if (rounds.length === 0) {
        if (typeof pl.r1Gross === "number") rounds.push({ round: 1, gross: pl.r1Gross });
        if (typeof pl.r2Gross === "number") rounds.push({ round: 2, gross: pl.r2Gross });
      }
      results.push({
        playerSourceKey: key,
        playerName: cleanName,
        pos: typeof pl.pos === "number" ? pl.pos : null,
        status: "OK",
        totalGross: typeof pl.total === "number" ? pl.total : null,
        toPar: typeof pl.toPar === "number" ? pl.toPar : null,
        rounds,
      });
    }

    flights.push({
      flightKey: divKey.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label: divKey,
      ageMin, ageMax, sex,
      par,
      fieldSize: results.length,
      results,
    });
  }

  return {
    sourceKey,
    name: data.tournament || `Doral ${year || ""}`.trim(),
    date: year ? `${year}-12-19` : null,
    seriesId: "doral-jr-classic",
    seriesLabel: "First Tee Miami Doral Jr. Classic",
    course: data.course || "Doral",
    flights,
    links: data.source ? [{ label: "GolfGenius", url: data.source }] : [],
  };
}

module.exports = { load, SOURCE_ID, SOURCE_LABEL };
