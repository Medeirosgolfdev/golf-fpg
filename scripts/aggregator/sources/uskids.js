/**
 * scripts/aggregator/sources/uskids.js
 *
 * Adapter USKids.
 *
 * Lê:
 *   - uskids-member-history-slim.json (roster + resultados)
 *   - uskids-results.json (resultados por torneio)
 *   - uskids_torneios_completos(N).json (par/yards detalhados, scorecards)
 *   - uskids-field-sizes.json (field counts)
 *   - t_de_tournaments_do_uskids.json (lookup de nomes por t=)
 *
 * USKids NÃO expõe dob/sex/club/hcp. Esses campos vêm por cross-ref noutras fontes.
 */

const path = require("path");
const fs = require("fs");
const { DATA, DATA_DIR, readJsonSafe, listFiles } = require("../util/io");
const { displayName, countryToIso2, countryName, usDateToIso } = require("../util/names");
const { warn, sub } = require("../util/log");

const SOURCE_ID = "uskids";
const SOURCE_LABEL = "USKids Golf";

/** Extracts series ID from tournament name (strips year, normalizes). */
function seriesFromName(name) {
  if (!name) return { id: null, label: null };
  let s = String(name);
  // Strip leading/trailing year
  s = s.replace(/\b20\d{2}\b/g, "").trim();
  s = s.replace(/\s+/g, " ").trim();
  // Strip suffixes
  s = s.replace(/\b(Tournament|Event)$/i, "").trim();
  if (!s) return { id: null, label: null };
  const id = "uskids-" + s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return { id, label: s };
}

/** Build flightKey + label from ageGroup string. */
function parseFlight(ageGroup) {
  if (!ageGroup) return { flightKey: "unknown", label: "?", ageMin: null, ageMax: null, sex: null };
  const s = String(ageGroup).trim();
  const sex = /^Girls/i.test(s) ? "F" : /^Boys/i.test(s) ? "M" : null;
  const rangeMatch = s.match(/(\d+)\s*-\s*(\d+)/);
  const singleMatch = s.match(/\b(\d+)\b/);
  let ageMin = null, ageMax = null;
  if (rangeMatch) { ageMin = +rangeMatch[1]; ageMax = +rangeMatch[2]; }
  else if (singleMatch) { ageMin = ageMax = +singleMatch[1]; }
  const isUnder = /&\s*Under/i.test(s);
  if (isUnder && ageMax != null) ageMin = null;
  const flightKey = (sex || "x").toLowerCase() + "_" + (ageMin ?? "") + "_" + (ageMax ?? "");
  return { flightKey, label: s, ageMin, ageMax, sex };
}

/**
 * Carrega uskids_torneios_completos(1-22).json e devolve um Map com par/yards
 * por (tcode, ageGroup). Estes ficheiros têm a granularidade certa por flight
 * — slim só tem 1 par/yards por torneio, o que é errado em torneios com
 * múltiplos campos (e.g. WC Boys 8 joga 9H num campo, Boys 13-18 joga 18H noutro).
 */
function loadCompletos() {
  const files = listFiles(DATA_DIR, DATA.uskidsCompletosPattern);
  const map = new Map(); // `${tcode}|${ageGroupLabel}` → { par, yards, numHoles, totalPar, totalYards }
  for (const file of files) {
    const data = readJsonSafe(file, null);
    if (!data?.signupanytime_t) continue;
    const tcode = String(data.signupanytime_t);
    for (const [, flight] of Object.entries(data.flights || {})) {
      const category = flight?.category;
      if (!category) continue;
      const ci = flight.course_info?.R1 || flight.course_info?.R2;
      if (!ci?.holes || !Array.isArray(ci.holes)) continue;
      const par = ci.holes.map((h) => h.par || 0);
      const yards = ci.holes.map((h) => h.yards || 0);
      const numHoles = ci.numHoles || par.length;
      const totalPar = typeof ci.totalPar === "number" ? ci.totalPar : par.reduce((a, b) => a + b, 0);
      const totalYards = typeof ci.totalYards === "number" ? ci.totalYards : yards.reduce((a, b) => a + b, 0);
      map.set(`${tcode}|${category}`, { par, yards, numHoles, totalPar, totalYards });
    }
  }
  return map;
}

async function load(opts) {
  const slim = readJsonSafe(DATA.uskidsMemberHistorySlim, { torneios: {}, jogadores: {} });
  const tournNamesArr = readJsonSafe(DATA.uskidsTournNames, []);
  const fieldSizes = readJsonSafe(DATA.uskidsFieldSizes, {});
  const results = readJsonSafe(DATA.uskidsResults, { resultados: [] });
  const completosMap = loadCompletos();

  // 1) Build tournament name lookup (slim has names, but for tcodes only in results we need this)
  const tournNameMap = new Map();
  for (const t of tournNamesArr) {
    if (t.t) tournNameMap.set(String(t.t), { name: t.name, date: t.date });
  }
  // Overlay with slim torneios
  for (const [tcode, meta] of Object.entries(slim.torneios || {})) {
    tournNameMap.set(String(tcode), { name: meta.name, date: meta.startDate });
  }

  // 2) Aggregate tournament records
  // Key: tcode → { name, startDate, par, holes, flights: Map<flightKey, RawFlight> }
  const tournMap = new Map();
  function getTourn(tcode) {
    if (!tournMap.has(tcode)) {
      const meta = slim.torneios?.[tcode];
      const nameInfo = tournNameMap.get(tcode);
      const name = meta?.name || nameInfo?.name || `t=${tcode}`;
      const rawDate = meta?.startDate || nameInfo?.date || null;
      const date = rawDate ? usDateToIso(rawDate) : null;
      const par = Array.isArray(meta?.par) ? meta.par : null;
      const yards = Array.isArray(meta?.yards) ? meta.yards : null;
      const holesPerRound = meta?.holesPerRound || (par && par.filter(p => p > 0).length === 9 ? 9 : 18);
      const parTotal = par ? par.reduce((a, b) => a + (b || 0), 0) : null;
      const series = seriesFromName(name);
      tournMap.set(tcode, {
        sourceKey: String(tcode),
        name,
        date,
        startDate: date,
        seriesId: series.id,
        seriesLabel: series.label,
        parTotal,
        holesPerRound,
        flights: new Map(),
        _par: par,
        _yards: yards,
      });
    }
    return tournMap.get(tcode);
  }

  // 3) Build player records + per-tournament results
  const playerMap = new Map();
  const players = [];

  for (const [memberId, p] of Object.entries(slim.jogadores || {})) {
    const iso2 = countryToIso2(p.country);
    const player = {
      sourceKey: String(memberId),
      name: displayName(p.name || ""),
      country: iso2 || (p.country || null),
      ageGroupCurrent: p.ageGroup || null,
      extra: {
        slimAgeGroupCurrent: p.ageGroup || null,
        totalTorneios: p.totalTorneios || Object.keys(p.torneios || {}).length,
      },
    };
    players.push(player);
    playerMap.set(String(memberId), player);

    // For each tournament this player played, attach a result to that tournament's flight
    for (const [tcode, tres] of Object.entries(p.torneios || {})) {
      const t = getTourn(tcode);
      const flightInfo = parseFlight(tres.ageGroup);
      let flight = t.flights.get(flightInfo.flightKey);
      if (!flight) {
        // Tentar primeiro o completosMap (par/yards por flight); fallback ao slim (per-torneio)
        const cm = completosMap.get(`${tcode}|${tres.ageGroup}`);
        const fsEntry = fieldSizes[tcode]?.escaloes?.[tres.ageGroup];
        flight = {
          flightKey: flightInfo.flightKey,
          label: flightInfo.label,
          ageMin: flightInfo.ageMin,
          ageMax: flightInfo.ageMax,
          sex: flightInfo.sex,
          par: cm?.par || t._par || undefined,
          yards: cm?.yards || t._yards || undefined,
          numHoles: cm?.numHoles || t.holesPerRound,
          totalPar: cm?.totalPar,
          fieldSize: fsEntry?.inscritos || null,
          results: [],
        };
        t.flights.set(flightInfo.flightKey, flight);
      }
      // Build rounds array
      const rounds = [];
      for (const [rnum, rdata] of Object.entries(tres.rounds || {})) {
        const round = parseInt(rnum, 10);
        if (!Number.isFinite(round)) continue;
        rounds.push({
          round,
          gross: rdata.gross ?? null,
          strokes: Array.isArray(rdata.strokes) ? rdata.strokes : undefined,
        });
      }
      rounds.sort((a, b) => a.round - b.round);
      const totalGross = rounds.reduce((acc, r) => (r.gross != null ? acc + r.gross : acc), 0) || null;
      const toPar = totalGross != null && t.parTotal ? totalGross - (t.parTotal * rounds.length) / Math.max(1, rounds.length / rounds.length) : null;
      // toPar usa par do FLIGHT (mais correcto que par do torneio).
      // Slim só tem par a nível de torneio — wrong para multi-flight tournaments.
      let toParCalc = null;
      const parPerRound = flight.totalPar || t.parTotal;
      if (parPerRound && rounds.length) {
        const grossSum = rounds.reduce((acc, r) => acc + (r.gross || 0), 0);
        toParCalc = grossSum - parPerRound * rounds.length;
      }
      flight.results.push({
        playerSourceKey: String(memberId),
        playerName: displayName(p.name || ""),
        pos: typeof tres.place === "number" ? tres.place : null,
        status: typeof tres.place === "number" ? "OK" : (tres.status === 2 ? "WD" : "OK"),
        totalGross,
        toPar: toParCalc,
        rounds,
      });
    }
  }

  // 4) Convert tournMap to array, strip internal _par/_yards
  const tournaments = [];
  for (const [, t] of tournMap) {
    const flights = Array.from(t.flights.values()).map((f) => ({
      flightKey: f.flightKey,
      label: f.label,
      ageMin: f.ageMin,
      ageMax: f.ageMax,
      sex: f.sex,
      par: f.par,
      yards: f.yards,
      fieldSize: f.fieldSize,
      results: f.results,
    }));
    tournaments.push({
      sourceKey: t.sourceKey,
      name: t.name,
      date: t.date,
      startDate: t.startDate,
      seriesId: t.seriesId,
      seriesLabel: t.seriesLabel,
      parTotal: t.parTotal,
      holesPerRound: t.holesPerRound,
      flights,
      links: [{
        label: "Signupanytime",
        url: `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&t=${t.sourceKey}`,
      }],
    });
  }

  // 5) Also fold in uskids-results.json entries that aren't in slim
  // (these tend to be tournaments with results but no member-history yet)
  for (const tres of results.resultados || []) {
    const tcode = String(tres.t || tres.tcode || "");
    if (!tcode || tournMap.has(tcode)) continue;
    // Build a basic tournament record from results-only data
    const series = seriesFromName(tres.name);
    const flights = [];
    for (const esc of tres.escaloes || []) {
      const flightInfo = parseFlight(esc.age_group || esc.nome);
      const flight = {
        flightKey: flightInfo.flightKey,
        label: flightInfo.label,
        ageMin: flightInfo.ageMin,
        ageMax: flightInfo.ageMax,
        sex: flightInfo.sex,
        results: [],
      };
      // Each ronda has a leaderboard; we want per-player results, not per-ronda.
      // We need to collapse: collect per-player rounds across all rondas.
      const perPlayer = new Map();
      for (const ronda of esc.rondas || []) {
        for (const lp of ronda.leaderboard || []) {
          const name = displayName(lp.nome || "");
          if (!name) continue;
          const key = name;
          let acc = perPlayer.get(key);
          if (!acc) { acc = { name, pos: lp.score?.includes?.("WD") ? null : null, rounds: [] }; perPlayer.set(key, acc); }
          acc.rounds.push({
            round: ronda.ronda || acc.rounds.length + 1,
            gross: typeof lp.score === "number" ? lp.score : null,
            strokes: Array.isArray(lp.strokes) ? lp.strokes : undefined,
          });
          // Position: usar a última disponível
          if (typeof lp.score === "number") acc.lastGross = lp.score;
        }
      }
      for (const acc of perPlayer.values()) {
        flight.results.push({
          playerSourceKey: null, // sem memberId — não vai casar com slim, mas pode casar por nome cross-source
          playerName: acc.name,
          pos: null,
          status: "OK",
          totalGross: null,
          toPar: null,
          rounds: acc.rounds,
        });
      }
      flights.push(flight);
    }
    tournaments.push({
      sourceKey: tcode,
      name: tres.name,
      date: null,
      seriesId: series.id,
      seriesLabel: series.label,
      flights,
      links: [{
        label: "Signupanytime",
        url: `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&t=${tcode}`,
      }],
    });
  }

  return {
    sourceId: SOURCE_ID,
    sourceLabel: SOURCE_LABEL,
    players,
    tournaments,
  };
}

module.exports = { load, SOURCE_ID, SOURCE_LABEL };
