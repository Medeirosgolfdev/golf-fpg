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
      // ⚠ O scraper GolfGenius por vezes numera as rondas pela ORDEM em que o
      // jogador entrou (day=1 = primeira ronda dele) e não cronologicamente.
      // Para o Doral 2025, o Manuel tem rounds[0]={day:1, date:"Fri Dec 19", gross:79}
      // e rounds[1]={day:2, date:"Thu Dec 18", gross:98} — mas Dec 18 é antes
      // de Dec 19 logo o REAL Day 1 foi 98 (mau) e o Day 2 foi 79 (recuperou).
      //
      // Ordenamos as rondas pela DATA quando disponível (e re-numeramos), para
      // que a UI mostre R1/R2 na ordem cronológica que reflicta o que aconteceu.
      const rawRounds = Array.isArray(pl.rounds) ? pl.rounds.slice() : [];
      const datedRounds = rawRounds.map((r, i) => ({
        _origIndex: i,
        _ts: parseDoralDate(r.date),
        day: r.day,
        gross: typeof r.gross === "number" ? r.gross : null,
        strokes: Array.isArray(r.scores) ? r.scores : undefined,
      }));
      // Se todas as rondas têm date parseável, ordena cronologicamente.
      const allDated = datedRounds.length > 0 && datedRounds.every((r) => r._ts != null);
      if (allDated) {
        datedRounds.sort((a, b) => (a._ts - b._ts));
      }
      const rounds = datedRounds.map((r, i) => ({
        round: i + 1, // re-numera após ordenação cronológica
        gross: r.gross,
        strokes: r.strokes,
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

    // Inferir pos para players que vieram com pos:null mas têm total numérico
    // (scraper GolfGenius por vezes falha a coluna POS — calcular pelo ranking
    // de total ascendente dentro do flight).
    inferMissingPositions(results);

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

/** Parse de datas do GolfGenius tipo "Thu, December 18" / "Fri, December 19".
 *  Devolve timestamp ms ou null se não parseável. Ano não vem no string —
 *  para ordenação dentro do mesmo torneio é irrelevante (assumimos ano 2000). */
function parseDoralDate(s) {
  if (!s || typeof s !== "string") return null;
  // "Thu, December 18" → extract "December 18"
  const m = /(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2})/.exec(s);
  if (!m) return null;
  const monthName = m[1];
  const day = parseInt(m[2], 10);
  if (!day) return null;
  const months = {
    January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
    July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
  };
  const mi = months[monthName];
  if (mi === undefined) return null;
  // Ano fixo (2000) — só importa a ordem dentro do torneio.
  return new Date(2000, mi, day).getTime();
}

/** Atribui pos a players que estavam com pos:null mas têm totalGross numérico.
 *  Ordena por totalGross ascendente; empates partilham a mesma pos (no padrão
 *  golf "T-N"). Players sem total continuam null (WD/DNF). */
function inferMissingPositions(results) {
  const withTotal = results.filter((r) => typeof r.totalGross === "number");
  if (withTotal.length === 0) return;
  // Se há pelo menos 1 com pos já atribuído, presumimos que o JSON tem
  // posições parciais. Vamos preencher os null sem reescrever os existentes.
  const sorted = [...withTotal].sort((a, b) => (a.totalGross || 0) - (b.totalGross || 0));
  let lastTotal = -1;
  let lastPos = 0;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const t = r.totalGross || 0;
    const pos = t === lastTotal ? lastPos : i + 1;
    if (r.pos === null || r.pos === undefined) {
      r.pos = pos;
    }
    lastTotal = t;
    lastPos = pos;
  }
}

module.exports = { load, SOURCE_ID, SOURCE_LABEL };
