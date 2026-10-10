#!/usr/bin/env node
/**
 * scripts/scrape-dgv.js
 *
 * Scraper Node-puro (fetch) das provas JUVENIS do Deutscher Golf Verband (DGV):
 * Deutsche Meisterschaften AK 14/16/18, DM-Vorausscheide, Deutsche
 * Mannschaftsmeisterschaften (DMM) da juventude e German International
 * Amateur Championship Boys/Girls.
 *
 * Fontes (públicas — as mesmas que o calendário golf.de/sport/turnierkalender/
 * dgv-turniere.html usa; o cabeçalho X-Client-Id é o que a página injecta):
 *   - lista:      GraphQL https://api-v2.golf.de/graphql  (SearchTournaments,
 *                 tournamentCategory DGV, janela em dias a contar de hoje)
 *   - resultados: GET https://api-v2.golf.de/v1.0/tournaments/{n}/results
 *   - campo:      GET https://membership-card-api.golf.de/tournaments/{n}/rounds/{r}/scorecards/{guid}/details
 *                 (par, Course Rating, Slope, nome do percurso, cor do tee).
 *   Os cartões buraco a buraco do golf.de são IMAGENS (PNG) — não há strokes.
 *
 * Saída: public/data/dgv_{tournamentNumber}.json — JobFile (o formato do
 * util/jobfile.js do agregador kids2), 1 divisão por torneio:
 *   { tournament, year, startDate, endDate, source, course, format, rounds:[…],
 *     divisions:[{ division:"AK 14 Jungen", par, parTotal, courseRating, slope,
 *       players:[{ pos, name, country, club, hcp, team, detailId, total, toPar,
 *                  rounds:[{day, date, gross|null, format, teamGross?}] }],
 *       teams:[{pos, name, total}] }] }
 *
 * Regras:
 *   - Voltas em VIERER (foursome) dão uma pancada por PAR → gross individual
 *     = null; o resultado do par fica em `teamGross` (não entra nas fichas).
 *   - Handicap da DGV: o «plus» vem com sinal menos («-1,0»), que é a nossa
 *     convenção (plus em negativo) — guarda-se tal como vem.
 *   - Estrangeiros (German International): clube 8 e o nome do clube é o PAÍS
 *     em alemão → country ISO2.
 *   - Nunca grava um torneio sem resultados por cima de um ficheiro com
 *     resultados (scrape vazio não destrói entrada boa).
 *
 * Uso:
 *   node scripts/scrape-dgv.js                    # juvenis dos últimos 21 dias e próximos 7
 *   node scripts/scrape-dgv.js --from -2000 --to 120   # janela em dias (histórico)
 *   node scripts/scrape-dgv.js --ids 490003047173,490003047174
 *   node scripts/scrape-dgv.js --dry              # não grava, só mostra
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const OUT_DIR = path.resolve(__dirname, "../public/data");
const CLIENT_ID = "955dcb18-b58d-417c-97be-afa895c45da5";
const HEADERS = { "x-client-id": CLIENT_ID, accept: "application/json", origin: "https://www.golf.de", referer: "https://www.golf.de/" };
const CAL_URL = (n) => `https://www.golf.de/sport/turnierkalender/dgv-turniere.html#/${n}/ergebnisse`;

// Provas juvenis: AK 14/16/18, Jungen/Mädchen, Boys/Girls. Fora: AK 30/50/65/75, «AK offen».
const YOUTH_RX = /\b(AK\s?1[0-8]|Jungen|M(ä|ae)dchen|Boys|Girls)\b/i;
const ADULT_RX = /\bAK\s?(offen|[2-9]\d)\b/i;

const COUNTRY_DE = {
  "deutschland": "DE", "dänemark": "DK", "england": "GB-ENG", "schottland": "GB-SCT", "wales": "GB-WLS",
  "nordirland": "GB-NIR", "irland": "IE", "niederlande": "NL", "belgien": "BE", "luxemburg": "LU",
  "frankreich": "FR", "spanien": "ES", "portugal": "PT", "italien": "IT", "schweiz": "CH",
  "österreich": "AT", "tschechische republik": "CZ", "tschechien": "CZ", "slowakei": "SK", "polen": "PL",
  "ungarn": "HU", "slowenien": "SI", "kroatien": "HR", "norwegen": "NO", "schweden": "SE",
  "finnland": "FI", "island": "IS", "estland": "EE", "lettland": "LV", "litauen": "LT",
  "griechenland": "GR", "türkei": "TR", "rumänien": "RO", "bulgarien": "BG", "serbien": "RS",
  "ukraine": "UA", "israel": "IL", "usa": "US", "vereinigte staaten": "US", "kanada": "CA",
  "mexiko": "MX", "südafrika": "ZA", "australien": "AU", "neuseeland": "NZ", "japan": "JP",
  "china": "CN", "korea": "KR", "indien": "IN", "thailand": "TH", "malta": "MT", "zypern": "CY",
};

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const DRY = argv.includes("--dry");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: HEADERS });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get("content-type") || "";
      if (!/json/.test(ct)) return null;
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

const SEARCH_Q = `query SearchTournaments($first: Int!, $cursor: String, $tournamentCategory: TournamentCategory!, $startDaysFromToday: Int, $endDaysFromToday: Int) { searchTournaments(input: {tournamentCategory: $tournamentCategory, startDaysFromToday: $startDaysFromToday, endDaysFromToday: $endDaysFromToday}, first: $first, after: $cursor) { edges { node { tournamentNumber tournamentName tournamentStartsOn hasResults } } pageInfo { hasNextPage endCursor } totalCount } }`;

async function listTournaments(from, to) {
  const out = [];
  let cursor = null;
  do {
    const qs = new URLSearchParams({ query: SEARCH_Q, operationName: "SearchTournaments", variables: JSON.stringify({ first: 50, cursor, tournamentCategory: "DGV", startDaysFromToday: from, endDaysFromToday: to }) });
    const j = await getJson(`https://api-v2.golf.de/graphql?${qs}`);
    if (!j || j.errors) throw new Error("SearchTournaments: " + JSON.stringify(j && j.errors).slice(0, 300));
    const s = j.data.searchTournaments;
    out.push(...s.edges.map((e) => e.node));
    cursor = s.pageInfo.hasNextPage ? s.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

const num = (v) => {
  if (v == null) return null;
  const s = String(v).trim().replace(",", ".");
  return /^[-+]?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};
const isoDay = (s) => (s ? String(s).slice(0, 10) : null);
const fullName = (p) => [p.firstName, p.additionalName, p.lastName].map((x) => String(x || "").trim()).filter(Boolean).join(" ");

/** «Round 1 - Klassischer_Vierer - Zählspiel\nRound 2 - Einzel - Zählspiel» → {1:"vierer",2:"einzel"} */
function roundFormats(description, roundCount) {
  const f = {};
  const lines = String(description || "").split(/\n/);
  for (const l of lines) {
    const m = /Round\s+(\d+)\s*-\s*([^-]+)/i.exec(l);
    if (m) f[+m[1]] = /vierer|foursome|scramble|vierball/i.test(m[2]) ? "vierer" : "einzel";
  }
  // descrição sem «Round n» (ex.: «Einzel - Zählspiel») vale para todas as voltas
  if (!Object.keys(f).length) {
    const kind = /vierer|foursome|scramble|vierball/i.test(description || "") ? "vierer" : "einzel";
    for (let r = 1; r <= (roundCount || 1); r++) f[r] = kind;
  }
  return f;
}

/** «DMM AK 14 Jungen im Golfclub Gifhorn 2026…» → «AK 14 Jungen»; «… Boys 2026 …» → «Boys» */
function divisionLabel(name) {
  const ak = /\bAK\s?(\d{1,2})\b/i.exec(name);
  const sex = /Jungen|Boys/i.test(name) ? "Jungen" : /M(ä|ae)dchen|Girls/i.test(name) ? "Mädchen" : "";
  if (ak) return `AK ${ak[1]} ${sex}`.trim();
  if (/Boys/i.test(name)) return "Boys";
  if (/Girls/i.test(name)) return "Girls";
  return sex || "Geral";
}

function countryOf(p) {
  const club = String(p.homeClubName || "").trim();
  if (Number(p.homeClubNumber) === 8 || COUNTRY_DE[club.toLowerCase()]) return COUNTRY_DE[club.toLowerCase()] || null;
  return "DE";
}

async function courseForRound(n, roundNumber, guid) {
  if (!guid) return null;
  const d = await getJson(`https://membership-card-api.golf.de/tournaments/${n}/rounds/${roundNumber}/scorecards/${guid}/details`);
  if (!d) return null;
  const pl = (d.players || [])[0] || {};
  return { courseName: d.courseName || null, par: num(d.par), courseRating: num(d.courseRating), slope: num(d.slope), tee: pl.startTeeColor || null, date: isoDay(d.tournamentDate) };
}

async function scrapeOne(n) {
  const res = await getJson(`https://api-v2.golf.de/v1.0/tournaments/${n}/results`);
  const t = res && res.tournament;
  if (!t) return { n, skip: "sem resultados" };
  const formats = roundFormats(t.description, t.roundCount);
  const roundDates = {};
  for (const r of t.rounds || []) roundDates[r.roundNumber] = isoDay(r.tournamentDate);

  // Jogadores: juntar TODAS as entradas (grossResults e teamResults de todas as
  // classes e voltas) por dgvPlayerId; cada `totals[]` traz {roundNumber, value}.
  const players = new Map();
  const teamsByRound = {};
  const guidByRound = {};
  const touch = (p, teamName) => {
    const id = p.dgvPlayerId || fullName(p);
    let pl = players.get(id);
    if (!pl) {
      pl = { id, name: fullName(p), club: String(p.homeClubName || "").trim() || null, country: countryOf(p), hcp: num(p.exactHandicap), team: teamName || null, indiv: {}, pair: {}, last: null };
      players.set(id, pl);
    }
    if (teamName && !pl.team) pl.team = teamName;
    if (pl.hcp == null) pl.hcp = num(p.exactHandicap);
    return pl;
  };
  for (const r of t.rounds || []) {
    for (const c of r.resultClasses || []) {
      const entries = [];
      for (const p of c.grossResults || []) entries.push([p, null]);
      for (const tm of c.teamRankings || []) {
        (teamsByRound[r.roundNumber] = teamsByRound[r.roundNumber] || new Map()).set(tm.name, { pos: tm.displayRank || String(tm.rank), name: tm.name, total: tm.total });
        for (const p of tm.teamResults || []) entries.push([p, tm.name]);
      }
      for (const [p, teamName] of entries) {
        const pl = touch(p, teamName);
        const pair = Number(p.partnerNumber) > 0;
        for (const x of p.totals || []) {
          const v = num(x.value);
          const rn = Number(x.roundNumber);
          if (pair || formats[rn] === "vierer") { if (v != null) pl.pair[rn] = v; }
          else if (v != null) pl.indiv[rn] = v;
          else if (x.value && !pl.indiv[rn]) pl.indiv[rn] = String(x.value).trim(); // NA/DQ…
        }
        // posição individual: a da entrada da volta mais adiantada (só provas individuais)
        if (!pair && (c.grossResults || []).includes(p) && (!pl.last || r.roundNumber >= pl.last.round)) {
          pl.last = { round: r.roundNumber, rank: p.rank, placementText: p.placementText, total: num(p.total) };
        }
        if (!pair && p.resultGuid && !guidByRound[r.roundNumber] && (p.totals || []).some((x) => Number(x.roundNumber) === r.roundNumber)) guidByRound[r.roundNumber] = p.resultGuid;
      }
    }
  }
  if (!players.size) return { n, skip: "classificação vazia", name: t.name };

  // Campo por volta (par, CR, slope) — um cartão por volta individual
  const course = {};
  for (const rn of Object.keys(formats).map(Number)) {
    if (formats[rn] !== "einzel" || !guidByRound[rn]) continue;
    try { course[rn] = await courseForRound(n, rn, guidByRound[rn]); } catch { course[rn] = null; }
    await sleep(250);
  }
  const c0 = Object.values(course).find(Boolean) || null;
  const parRound = c0 && c0.par;

  const rounds = Object.keys(formats).map(Number).sort((a, b) => a - b);
  const out = [];
  for (const pl of players.values()) {
    const rr = rounds.map((rn) => {
      const g = pl.indiv[rn];
      const o = { day: rn, date: roundDates[rn] || null, format: formats[rn], gross: typeof g === "number" ? g : null };
      if (typeof g === "string") o.status = g;
      if (pl.pair[rn] != null) o.teamGross = pl.pair[rn];
      return o;
    });
    const indivGross = rr.filter((x) => typeof x.gross === "number");
    if (!indivGross.length && !rr.some((x) => x.teamGross != null)) continue;
    const total = indivGross.length ? indivGross.reduce((s, x) => s + x.gross, 0) : null;
    const status = rr.map((x) => x.status).find(Boolean);
    let pos = null;
    if (pl.last && pl.last.rank) pos = (pl.last.placementText === "*" ? "T" : "") + pl.last.rank;
    if (!pos && status && /^(DQ|WD|NR|NA|DNS|DNF|RTD)$/i.test(status)) pos = status.toUpperCase();
    out.push({
      pos, name: pl.name, country: pl.country, club: pl.club, hcp: pl.hcp, team: pl.team,
      detailId: pl.id ? `dgv${pl.id}` : null,
      total, toPar: total != null && parRound ? total - parRound * indivGross.length : null,
      // `rounds` = só voltas INDIVIDUAIS (é o que o agregador conta); o foursome
      // fica em `teamRounds` — quem só jogou o foursome não é participação.
      rounds: rr.filter((x) => x.gross != null || x.status).map(({ teamGross, ...x }) => x),
      ...(rr.some((x) => x.teamGross != null) ? { teamRounds: rr.filter((x) => x.teamGross != null).map((x) => ({ day: x.day, date: x.date, format: x.format, teamGross: x.teamGross })) } : {}),
    });
  }
  // ordem: posição oficial; sem posição (DMM) → total individual; depois nome
  const pn = (p) => { const m = /\d+/.exec(String(p.pos || "")); return m ? +m[0] : 9999; };
  out.sort((a, b) => pn(a) - pn(b) || (a.total ?? 9999) - (b.total ?? 9999) || a.name.localeCompare(b.name));

  const lastTeams = Object.keys(teamsByRound).map(Number).sort((a, b) => b - a)[0];
  const teams = lastTeams ? [...teamsByRound[lastTeams].values()] : [];
  const start = Object.values(roundDates).filter(Boolean).sort()[0] || isoDay(t.eventStartDate);
  const end = Object.values(roundDates).filter(Boolean).sort().pop() || start;
  const venue = (/ - (.+)$/.exec(t.name) || /\bim (.+?) \d{4}/.exec(t.name) || [])[1] || null;
  return {
    n, name: t.name, playersWithResults: out.filter((p) => p.rounds.some((r) => r.gross != null)).length,
    data: {
      tournament: t.name.replace(/, Deutsche Mannschaftsmeisterschaft$/, "").trim(),
      year: start ? +start.slice(0, 4) : null,
      startDate: start, endDate: end,
      source: CAL_URL(n),
      dgvTournamentNumber: Number(n),
      course: (c0 && c0.courseName) || venue,
      venue,
      format: t.description || null,
      lastUpdatedAt: t.lastUpdatedAt || null,
      rounds: rounds.map((rn) => ({ round: rn, date: roundDates[rn] || null, format: formats[rn], ...(course[rn] ? { course: course[rn] } : {}) })),
      divisions: [{
        division: divisionLabel(t.name),
        source: CAL_URL(n),
        par: null,
        parTotal: parRound || null,
        courseRating: c0 ? c0.courseRating : null,
        slope: c0 ? c0.slope : null,
        teeName: c0 ? c0.tee : null,
        players: out,
        ...(teams.length ? { teams } : {}),
      }],
      scrapedAt: new Date().toISOString(),
    },
  };
}

(async () => {
  let ids = arg("ids") ? arg("ids").split(",").map((s) => s.trim()).filter(Boolean) : null;
  if (!ids) {
    const from = Number(arg("from", "-21"));
    const to = Number(arg("to", "7"));
    const all = await listTournaments(from, to);
    const youth = all.filter((t) => YOUTH_RX.test(t.tournamentName) && !ADULT_RX.test(t.tournamentName));
    console.log(`📋 DGV: ${all.length} provas na janela [${from}, ${to}] dias, ${youth.length} juvenis`);
    ids = youth.filter((t) => t.hasResults || new Date(t.tournamentStartsOn) <= new Date()).map((t) => String(t.tournamentNumber));
  }
  let gravados = 0, erros = 0;
  for (const n of ids) {
    try {
      const r = await scrapeOne(n);
      if (r.skip) { console.log(`   ⏭  ${n} ${r.name || ""} — ${r.skip}`); continue; }
      const file = path.join(OUT_DIR, `dgv_${n}.json`);
      // guarda anti-encolhimento: não substituir por menos jogadores com resultados
      if (fs.existsSync(file)) {
        try {
          const old = JSON.parse(fs.readFileSync(file, "utf8"));
          const oldN = (old.divisions?.[0]?.players || []).filter((p) => (p.rounds || []).some((x) => x.gross != null)).length;
          if (oldN > r.playersWithResults) { console.log(`   🛡  ${n} mantém o ficheiro (${oldN} > ${r.playersWithResults} com resultados)`); continue; }
        } catch { /* ficheiro estragado → regrava */ }
      }
      const semData = (o) => JSON.stringify({ ...o, scrapedAt: null });
      let igual = false;
      if (fs.existsSync(file)) { try { igual = semData(JSON.parse(fs.readFileSync(file, "utf8"))) === semData(r.data); } catch { /* regrava */ } }
      if (igual) { console.log(`   =  ${n} sem alterações`); continue; }
      if (!DRY) writeJsonAtomic(file, r.data, { spaces: 1 });
      gravados++;
      const d = r.data.divisions[0];
      console.log(`   💾 ${n} ${r.data.startDate} ${r.name.slice(0, 70)} · ${d.division} · ${d.players.length} jogadores (${r.playersWithResults} com voltas individuais) · par ${d.parTotal ?? "?"} CR ${d.courseRating ?? "?"}/${d.slope ?? "?"}${DRY ? " [dry]" : ""}`);
    } catch (e) {
      console.log(`   ❌ ${n}: ${e.message}`);
      erros++;
    }
    await sleep(400);
  }
  console.log(`✅ ${gravados} ficheiro(s) ${DRY ? "(dry, nada gravado)" : "gravado(s)"}${erros ? ` · ${erros} erro(s)` : ""}`);
  // exit codes do repo: 0 gravou · 2 nada de novo · 1 erro
  process.exitCode = erros && !gravados ? 1 : gravados ? 0 : 2;
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
