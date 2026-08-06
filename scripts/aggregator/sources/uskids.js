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
/**
 * ±par HONESTO para flights que jogam 9 buracos num torneio de 18 (Boys 7&U /
 * Boys 8): o cálculo antigo (par do torneio × nº de rondas) dava −69 a um
 * 2×9H de gross 75 (caso Marcus Karim, British Kids 2021). Regra por ronda:
 *  - com scorecard (strokes[18], zeros = não jogado) CONSISTENTE (Σ==gross):
 *    par da ronda = Σ do par dos buracos JOGADOS (parArr também pode ter zeros
 *    nos não jogados — armadilha USKids conhecida). Ronda parcial sem parArr
 *    utilizável → ±par = null (nunca fabricar).
 *  - gross > Σ strokes = cartão truncado NA FONTE (volta completa) → par cheio.
 *  - sem strokes → par cheio (sem sinal de 9H).
 * Convenção do projecto: tp só quando dá para calcular com confiança.
 */
function computeToPar(rounds, parArr, parPerRound, totalGross) {
  if (totalGross == null || !rounds.length) return null;
  const pars = Array.isArray(parArr) ? parArr : null;
  const fullPar = pars ? pars.reduce((a, b) => a + (b > 0 ? b : 0), 0) : (parPerRound || 0);
  if (!fullPar) return null;
  let parSum = 0;
  for (const r of rounds) {
    if (r.gross == null) continue;
    const strokes = Array.isArray(r.strokes) ? r.strokes : null;
    const playedIdx = strokes ? strokes.map((s, i) => (s > 0 ? i : -1)).filter((i) => i >= 0) : [];
    const sumStrokes = playedIdx.reduce((a, i) => a + strokes[i], 0);
    const nFull = pars ? pars.filter((p) => p > 0).length : 18;
    if (strokes && playedIdx.length > 0 && playedIdx.length < nFull && sumStrokes === r.gross) {
      // Ronda parcial genuína (9H): par dos buracos jogados.
      if (!pars) return null;
      const played = playedIdx.reduce((a, i) => a + (pars[i] > 0 ? pars[i] : 0), 0);
      if (played <= 0) return null;
      parSum += played;
    } else {
      parSum += fullPar;
    }
  }
  return parSum > 0 ? totalGross - parSum : null;
}

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

  // Calcula dobRange (intersecção das janelas possíveis) a partir das
  // participações: para cada torneio com ageMin/ageMax + date, kid had age
  // [ageMin..ageMax] em date → DOB ∈ (date - (ageMax+1)yrs, date - ageMin yrs].
  // Intersect todas as janelas.
  function computeDobRange(participations) {
    let lo = null, hi = null; // YYYY-MM-DD strings
    for (const part of participations) {
      const { date, ageMin, ageMax } = part;
      if (!date || ageMin == null || ageMax == null) continue;
      const d = new Date(date + "T00:00:00Z");
      if (isNaN(d.getTime())) continue;
      // Janela: DOB > (date - (ageMax+1) anos) e DOB <= (date - ageMin anos)
      const dobLo = new Date(d);
      dobLo.setUTCFullYear(d.getUTCFullYear() - (ageMax + 1));
      dobLo.setUTCDate(dobLo.getUTCDate() + 1);
      const dobHi = new Date(d);
      dobHi.setUTCFullYear(d.getUTCFullYear() - ageMin);
      const loStr = dobLo.toISOString().slice(0, 10);
      const hiStr = dobHi.toISOString().slice(0, 10);
      if (lo === null || loStr > lo) lo = loStr;
      if (hi === null || hiStr < hi) hi = hiStr;
    }
    if (lo !== null && hi !== null && lo <= hi) return { lo, hi };
    return null;
  }


  for (const [memberId, p] of Object.entries(slim.jogadores || {})) {
    const iso2 = countryToIso2(p.country);
    // Recolher participações com ageMin/ageMax + data do torneio
    const participations = [];
    for (const [tcode, tres] of Object.entries(p.torneios || {})) {
      const flightInfo = parseFlight(tres.ageGroup);
      const tInfo = getTourn(tcode);
      const date = tInfo?.startDate || tInfo?.date;
      if (date && flightInfo.ageMin != null && flightInfo.ageMax != null) {
        participations.push({ date, ageMin: flightInfo.ageMin, ageMax: flightInfo.ageMax });
      }
    }
    const dobRange = computeDobRange(participations);

    const player = {
      sourceKey: String(memberId),
      name: displayName(p.name || ""),
      country: iso2 || (p.country || null),
      ageGroupCurrent: p.ageGroup || null,
      // place = cidade ("Lisboa, PT") — vem do uskids-name-lookup.json via
      // apply-lookup-names.js. Adicionado 2026-05-28. Promovido para
      // sources.uskids.place pelo identity-matcher.
      place: p.place || null,
      dobRange: dobRange,
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
      // toPar honesto: par dos buracos JOGADOS (ver computeToPar) — os escalões
      // mais novos jogam 9 buracos num torneio de 18 e o par×rondas dava −69.
      const toParCalc = computeToPar(rounds, flight.par, flight.totalPar || t.parTotal, totalGross);
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

  // 4) Fold uskids-results.json entries into tournMap.
  // Cobre dois casos:
  //   (a) tcodes NOVOS — torneios sem member-history ainda (recém-acabados)
  //   (b) tcodes JÁ em tournMap mas com flights vazios / sem alguns jogadores
  //       — ex: slim tem meta do torneio (descoberta) mas ninguém ainda lá
  //       jogou no slim porque o scrape do member-history corre semanal.
  function normNameKey(n) {
    return (n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[-'’.·]+/g, " ").replace(/\s+/g, " ").trim();
  }
  // Index para resolver memberId via nome+país. Sem isto o identity matcher
  // (linha 290) descarta os results com playerSourceKey null.
  // Mapeia "normName|iso2" → memberId; e também "normName|" como fallback.
  const playersByNameCountry = new Map();
  for (const p of players) {
    const nk = normNameKey(p.name);
    if (!nk) continue;
    const iso = (p.country || "").toUpperCase();
    const keyWithCc = `${nk}|${iso}`;
    if (!playersByNameCountry.has(keyWithCc)) {
      playersByNameCountry.set(keyWithCc, p.sourceKey);
    }
    // Fallback só por nome — só preenche se for único (evita ambiguidade entre jogadores com mesmo nome)
    const keyNoCc = `${nk}|`;
    if (playersByNameCountry.has(keyNoCc)) {
      playersByNameCountry.set(keyNoCc, "__AMBIG__");
    } else {
      playersByNameCountry.set(keyNoCc, p.sourceKey);
    }
  }
  // Purgar entradas ambíguas do fallback sem país
  for (const [k, v] of playersByNameCountry) {
    if (v === "__AMBIG__") playersByNameCountry.delete(k);
  }
  for (const tres of results.resultados || []) {
    const tcode = String(tres.t || tres.tcode || "");
    if (!tcode) continue;
    const isNew = !tournMap.has(tcode);
    const t = getTourn(tcode);
    // Se o nome ainda é fallback "t=NNNN", preferir o nome de results
    if (tres.name && (isNew || t.name === `t=${tcode}` || !t.name)) {
      t.name = tres.name;
      const series = seriesFromName(tres.name);
      t.seriesId = series.id;
      t.seriesLabel = series.label;
    }
    for (const esc of tres.escaloes || []) {
      // esc.nome ("Boys 12") tem prioridade sobre esc.age_group (id numérico tipo "2105")
      // — parseFlight de "2105" produzia flightKey absurdo "x_2105_2105".
      const escLabel = esc.nome || esc.age_group;
      const flightInfo = parseFlight(escLabel);
      let flight = t.flights.get(flightInfo.flightKey);
      if (!flight) {
        const cm = completosMap.get(`${tcode}|${escLabel}`) || completosMap.get(`${tcode}|${esc.age_group}`);
        const fsEntry = fieldSizes[tcode]?.escaloes?.[escLabel] || fieldSizes[tcode]?.escaloes?.[esc.age_group];
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
      // Colapsar per-player rounds across all rondas
      const perPlayer = new Map();
      for (const ronda of esc.rondas || []) {
        for (const lp of ronda.leaderboard || []) {
          const name = displayName(lp.nome || "");
          if (!name) continue;
          let acc = perPlayer.get(name);
          if (!acc) { acc = { name, rounds: [] }; perPlayer.set(name, acc); }
          acc.rounds.push({
            round: ronda.ronda || acc.rounds.length + 1,
            gross: typeof lp.score === "number" ? lp.score : null,
            strokes: Array.isArray(lp.strokes) ? lp.strokes : undefined,
          });
        }
      }
      // Dedup contra resultados que já vieram do slim (mesmo flight, mesmo nome)
      const existingNames = new Set(
        flight.results.map(r => normNameKey(r.playerName))
      );
      // Recolher também o país por jogador (para resolver memberId via name+country)
      const perPlayerCountry = new Map();
      for (const ronda of esc.rondas || []) {
        for (const lp of ronda.leaderboard || []) {
          const name = displayName(lp.nome || "");
          if (!name) continue;
          if (lp.pais && !perPlayerCountry.has(name)) perPlayerCountry.set(name, lp.pais);
        }
      }
      // Primeira passagem: construir todos os results (sem pos)
      const newResults = [];
      for (const acc of perPlayer.values()) {
        if (existingNames.has(normNameKey(acc.name))) continue;
        acc.rounds.sort((a, b) => a.round - b.round);
        const grossSum = acc.rounds.reduce((s, r) => s + (r.gross || 0), 0);
        const toParCalc = computeToPar(acc.rounds, flight.par, flight.totalPar || t.parTotal, grossSum || null);
        // Tentar resolver memberId via playersByNameCountry (do slim).
        // Sem isto, o identity matcher dropa o result (linha 290 do matcher exige playerSourceKey).
        const cc = perPlayerCountry.get(acc.name) || null;
        const iso2 = cc ? countryToIso2(cc) : null;
        const lookupKey = `${normNameKey(acc.name)}|${(iso2 || "").toUpperCase()}`;
        const resolvedMemberId =
          playersByNameCountry.get(lookupKey) ||
          playersByNameCountry.get(`${normNameKey(acc.name)}|`); // sem país, fallback só pelo nome
        newResults.push({
          playerSourceKey: resolvedMemberId || null,
          playerName: acc.name,
          pos: null,
          status: "OK",
          totalGross: grossSum || null,
          toPar: toParCalc,
          rounds: acc.rounds,
        });
      }
      // Segunda passagem: calcular pos por sort de totalGross (asc, null/WD ao fim).
      // Empate → mesma pos (estilo "T5"). Mantém-se inserção stable depois.
      const expectedRounds = Math.max(0, ...newResults.map(r => r.rounds.length));
      const ranked = newResults
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.totalGross != null && r.rounds.length === expectedRounds);
      ranked.sort((a, b) => a.r.totalGross - b.r.totalGross);
      let lastGross = null, lastPos = 0;
      ranked.forEach(({ r }, idx) => {
        if (r.totalGross === lastGross) {
          r.pos = lastPos;
        } else {
          r.pos = idx + 1;
          lastPos = r.pos;
          lastGross = r.totalGross;
        }
      });
      for (const r of newResults) flight.results.push(r);
    }
  }

  // 5) Convert tournMap to array, strip internal _par/_yards
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

  return {
    sourceId: SOURCE_ID,
    sourceLabel: SOURCE_LABEL,
    players,
    tournaments,
  };
}

module.exports = { load, SOURCE_ID, SOURCE_LABEL, computeToPar };
