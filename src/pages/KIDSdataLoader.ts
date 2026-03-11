/**
 * rivaisDataLoader.ts
 * Carrega todos os JSON de torneios via fetch (public/data/)
 * e converte em AutoRivalPlayer[] para merge na RivaisIntlPage.
 */

const CC: Record<string, string> = {
  US:"United States",GB:"United Kingdom",ES:"Spain",IT:"Italy",
  FR:"France",DE:"Germany",CH:"Switzerland",NO:"Norway",
  SE:"Sweden",PT:"Portugal",RU:"Russian Federation",BG:"Bulgaria",
  NL:"Netherlands",LT:"Lithuania",TH:"Thailand",PH:"Philippines",
  CN:"China",RO:"Romania",UA:"Ukraine",SI:"Slovenia",
  BE:"Belgium",DK:"Denmark",CA:"Canada",BR:"Brazil",
  MX:"Mexico",AT:"Austria",HU:"Hungary",SK:"Slovakia",
  ZA:"South Africa",SG:"Singapore",IN:"India",TR:"Turkey",
  KR:"South Korea",LV:"Latvia",CZ:"Czech Republic",PL:"Poland",
  PY:"Paraguay",CL:"Chile",CO:"Colombia",PR:"Puerto Rico",
  IE:"Ireland",CY:"Cyprus",OM:"Oman",LB:"Lebanon",
  AE:"United Arab Emirates",KZ:"Kazakhstan",VN:"Viet Nam",
  JE:"Jersey",NG:"Nigeria",CR:"Costa Rica",AR:"Argentina",
  // Extra codes found in USKids completo files
  UK:"United Kingdom",PHL:"Philippines",
  AU:"Australia",JP:"Japan",NZ:"New Zealand",FI:"Finland",
  TW:"Taiwan",HK:"Hong Kong",ID:"Indonesia",EE:"Estonia",
  AM:"Armenia",BB:"Barbados",BS:"Bahamas",BO:"Bolivia",
  DO:"Dominican Republic",DZ:"Algeria",EC:"Ecuador",
  GT:"Guatemala",HN:"Honduras",KE:"Kenya",KH:"Cambodia",
  MA:"Morocco",NI:"Nicaragua",PA:"Panama",PE:"Peru",
  RE:"Réunion",SV:"El Salvador",UG:"Uganda",
  UY:"Uruguay",VE:"Venezuela",
};

function co(raw: string): string {
  const t = (raw||"").trim();
  return CC[t] || CC[t.toUpperCase()] || CC[t.toLowerCase()] || t;
}

export function normName(n: string): string {
  return n.trim().toLowerCase()
    .replace(/\s+/g," ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

export interface AutoTournResult {
  p: number | null;
  t: number | null;
  tp: number | null;
  rd: number[];
  ageGroup?: string;
}

export interface AutoRivalPlayer {
  n: string;
  co: string;
  r: Record<string, AutoTournResult>;
}

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

export interface AutoScorecard {
  tid: string;
  playerName: string;
  par: number[];
  si: number[];
  rounds: number[][];  // each round = 18 hole scores
}

// Global scorecard store: key = normName(playerName), value = list of scorecards
const _scorecards: Map<string, AutoScorecard[]> = new Map();

// Manuel Medeiros DOB: 29/04/2014
const MANUEL_BIRTH_YEAR = 2014;

// t-codes dos 15 ficheiros USKids World Championship / major events
const USKIDS_KNOWN_TCODES = new Set([
  11604, 14029, 15807, 18124,
  8300, 13568, 15704, 18242,
  12229, 14302, 16428,
  14218, 12093, 16705, 18719,
]);

// Nomes fixos para os t-codes conhecidos (fallback caso o JSON não seja parseable)
const USKIDS_TCODE_META: Record<number, { name: string; short: string; dateExact: string }> = {
  11604: { name: "World Championship 2022",           short: "WC 2022",  dateExact: "2022-08-04" },
  14029: { name: "World Championship 2023",           short: "WC 2023",  dateExact: "2023-08-03" },
  15807: { name: "World Championship 2024",           short: "WC 2024",  dateExact: "2024-08-01" },
  18124: { name: "World Championship 2025",           short: "WC 2025",  dateExact: "2025-07-31" },
   8300: { name: "European Championship 2022",        short: "EC 2022",  dateExact: "2022-05-31" },
  13568: { name: "European Championship 2023",        short: "EC 2023",  dateExact: "2023-05-30" },
  15704: { name: "European Championship 2024",        short: "EC 2024",  dateExact: "2024-05-28" },
  18242: { name: "European Championship 2025",        short: "EC 2025",  dateExact: "2025-05-27" },
  12229: { name: "Venice Open 2022",                  short: "Venice 22",dateExact: "2022-08-18" },
  14302: { name: "Venice Open 2023",                  short: "Venice 23",dateExact: "2023-08-17" },
  16428: { name: "Venice Open 2024",                  short: "Venice 24",dateExact: "2024-08-15" },
  12093: { name: "Red White & Blue Inv. 2022",        short: "RWB 2022", dateExact: "2022-07-02" },
  14218: { name: "Red White & Blue Inv. 2023",        short: "RWB 2023", dateExact: "2023-07-01" },
  16705: { name: "Red White & Blue Inv. 2024",        short: "RWB 2024", dateExact: "2024-07-06" },
  18719: { name: "Red White & Blue Inv. 2025",        short: "RWB 2025", dateExact: "2025-07-05" },
};

// USKids completo tournament names: key = tid prefix "usk{tcode}", value = {name, short, date}
// Pre-populated with known names; updated from JSON during processUskidsCompleto
export const uskTournNames: Map<string, { name: string; short: string; date: string; dateExact: string }> = (() => {
  const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const m = new Map<string, { name: string; short: string; date: string; dateExact: string }>();
  for (const [tcode, meta] of Object.entries(USKIDS_TCODE_META as Record<string, { name: string; short: string; dateExact: string }>)) {
    const [yr, mo] = meta.dateExact.split("-").map(Number);
    const date = `${MONTHS[mo - 1]} ${yr}`;
    m.set(`usk${tcode}`, { name: meta.name, short: meta.short, date, dateExact: meta.dateExact });
  }
  return m;
})();
// Field sizes per tid: "usk{tcode}_b{n}" → number of players
export const uskFieldSizes: Map<string, number> = new Map();

function addScorecard(normN: string, sc: AutoScorecard) {
  if (!_scorecards.has(normN)) _scorecards.set(normN, []);
  _scorecards.get(normN)!.push(sc);
}

export function getScorecards(playerName: string): AutoScorecard[] {
  const key = normName(playerName);
  const parts = key.split(" ").filter(Boolean);
  if (parts.length < 2) return _scorecards.get(key) ?? [];
  const first = parts[0];
  const last  = parts[parts.length - 1];
  // Recolher todos os matches (exacto + variantes com nome do meio)
  // para que "Manuel Medeiros" e "Manuel Goulartt Medeiros" sejam agregados
  const all: AutoScorecard[] = [];
  for (const [k, v] of _scorecards.entries()) {
    const kp = k.split(" ").filter(Boolean);
    if (kp[0] === first && kp[kp.length - 1] === last) all.push(...v);
  }
  return all;
}

function processWjgc(data: unknown, tid: string): AutoRivalPlayer[] {
  const d = data as {
    par?: number[]; si?: number[];
    players: Array<{
      name: string; country: string;
      pos: number|string|null; result: number|null;
      rounds: Array<{ gross: number; scores?: number[] }>;
    }>;
  };
  const par = d.par || [];
  const si = d.si || [];
  return (d.players || []).filter(p => p.rounds?.length > 0).map(p => {
    const rd = p.rounds.map(r => r.gross).filter(g => g > 0);
    const norm = normName(p.name.trim());
    // Store hole-by-hole scorecard if available (suporta 9H e 18H)
    const expectedHoles = par.length > 0 ? par.length : 18;
    const holeRounds = p.rounds
      .map(r => r.scores || [])
      .filter(s => s.length === expectedHoles);
    if (holeRounds.length > 0 && par.length > 0) {
      addScorecard(norm, { tid, playerName: p.name.trim(), par, si, rounds: holeRounds });
    }
    return {
      n: p.name.trim(),
      co: co(p.country),
      r: { [tid]: {
        p: typeof p.pos === "number" ? p.pos : null,
        t: rd.length ? rd.reduce((a,b)=>a+b,0) : null,
        tp: p.result ?? null,
        rd,
      }},
    };
  });
}

function processDoral(data: unknown): AutoRivalPlayer[] {
  const d = data as {
    divisions: Array<{
      name: string; par?: number[];
      players: Array<{
        name: string; country: string;
        pos: number|null; toPar: number|null;
        r1Gross: number; r2Gross: number;
        rounds?: Array<{ scores?: number[]; gross: number }>;
      }>;
    }>;
  };
  const divMap: Record<string,string> = {
    "Boys 8 & 9 Division":   "doral25_b89",
    "Boys 10 & 11 Division": "doral25_b1011",
    "Boys 12 & 13 Division": "doral25_b1213",
  };
  const all: AutoRivalPlayer[] = [];
  for (const div of d.divisions || []) {
    const tid = divMap[div.name];
    if (!tid) continue;
    const divPar: number[] = div.par || [];

    // Collect entries for this division
    type DEntry = { name: string; co: string; rd: number[]; t: number; tp: number | null; holeRounds: number[][] };
    const entries: DEntry[] = [];
    for (const p of div.players || []) {
      const name = p.name.includes(",")
        ? p.name.split(",").map(s=>s.trim()).reverse().join(" ")
        : p.name.trim();
      const rd = [p.r1Gross, p.r2Gross].filter(g => g > 0);
      if (!rd.length) continue;
      const holeRounds = (p.rounds || []).map(r => r.scores || []).filter(s => s.length === 18);
      entries.push({ name, co: co(p.country), rd, t: rd.reduce((a,b)=>a+b,0), tp: p.toPar ?? null, holeRounds });
    }

    // Sort and assign positions
    const maxRds = entries.length ? Math.max(...entries.map(e => e.rd.length)) : 0;
    entries.sort((a, b) => b.rd.length - a.rd.length || a.t - b.t);
    let pos = 1;
    for (let i = 0; i < entries.length; i++) {
      if (i > 0 && entries[i].rd.length === entries[i-1].rd.length && entries[i].t === entries[i-1].t) {
        // empate — mantém pos anterior
      } else { pos = i + 1; }
      const e = entries[i];
      if (e.holeRounds.length > 0 && divPar.length === 18)
        addScorecard(normName(e.name), { tid, playerName: e.name, par: divPar, si: [], rounds: e.holeRounds });
      all.push({
        n: e.name, co: e.co,
        r: { [tid]: { p: e.rd.length < maxRds ? null : pos, t: e.t, tp: e.tp, rd: e.rd }},
      });
    }
    // Store field size
    const full = entries.filter(e => e.rd.length >= maxRds).length;
    if (full > 0) uskFieldSizes.set(tid, full);
  }
  return all;
}

const USKIDS_ID: Record<string,string> = {
  "Venice Open 2025":                    "venice25",
  "Rome Classic 2025":                   "rome25",
  "Marco Simone Invitational 2025":      "marco25",
  "Desert Shootout 2026":                "desert26",
  "Sandestin Championship 2026":         "sandestin26",
  "2026 Mississippi State Invitational": "msstate26",
  "Real Club de Golf El Prat":           "elprat23",
};

// Par by tournament (t code) and age group code — mirrors TEES_LOOKUP in USKidsFieldPage
// Key: "tCode-ageGroup", value: par array
const USKIDS_PAR: Record<string, number[]> = {
  // Rome Classic 2025 (t=20175) — par 72 todos os escalões
  "20175-2102": [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4],
  "20175-2103": [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4],
  "20175-2104": [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4],
  "20175-2105": [4,5,3,4,4,4,4,5,3, 4,5,4,3,4,4,3,5,4],
  // Venice Open 2025 (t=19418)
  "19418-2102": [4,5,4,3,4,3,4,5,4, 5,3,4,4,4,4,3,4,5], // Boys 9 Green+White
  "19418-2103": [4,3,5,4,4,4,4,3,5, 4,5,4,3,4,3,4,5,4], // Boys 10 Red+Green
  "19418-2104": [5,3,4,4,4,4,3,4,5, 4,3,5,4,4,4,4,3,5], // Boys 11 White+Red
  "19418-2105": [5,3,4,4,4,4,3,4,5, 4,3,5,4,4,4,4,3,5], // Boys 12 White+Red
  // Marco Simone Invitational 2025 (t=18438) — par 72 todos os escalões
  "18438-2102": [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5], // Boys 9
  "18438-2103": [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5], // Boys 10
  "18438-2104": [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5], // Boys 11
  "18438-2105": [4,4,4,3,4,4,3,5,5, 4,4,5,3,4,4,4,3,5], // Boys 12
  // El Prat 2023 (t=15573) — 9 buracos; par do Boys 9 confirmado via away-courses
  "15573-2151": [4,3,4,5,4,3,4,4,5], // Boys 9
  "15573-2150": [4,3,4,5,4,3,4,4,5], // Boys 8 (mesma rotação, tee diferente)
  "15573-2152": [4,3,4,5,4,3,4,4,5], // Boys 10
  // Mississippi 2026, Desert 2026, Sandestin 2026 — par total 72 mas sem dados por buraco
  // Os scorecards são guardados (strokes=18H) mas tp por buraco não está disponível
};

function processUskids(data: unknown): AutoRivalPlayer[] {
  const d = data as {
    resultados: Array<{
      t: number;
      name: string;
      escaloes: Array<{
        nome: string;
        age_group: number;
        rondas: Array<{
          ronda: number;
          buracos?: number;
          par?: number[];
          leaderboard: Array<{
            nome: string; pais: string; score: number; buracos: number;
            to_par?: number | null;
            strokes?: number[];
            rondas?: Record<string, { strokes?: number[] }>;
          }>;
        }>;
      }>;
    }>;
  };
  const all: AutoRivalPlayer[] = [];
  for (const tourn of d.resultados || []) {
    const baseId = USKIDS_ID[tourn.name];
    if (!baseId) continue;
    for (const esc of tourn.escaloes || []) {
      const ageNum = parseInt(esc.nome.replace(/\D/g,""), 10);
      if (!ageNum) continue;
      const tid = `${baseId}_b${ageNum}`;

      interface PEntry {
        co: string; scores: Record<number,number>; origName: string;
        holeScores: Record<number, number[]>;
        par: number[];          // buraco-a-buraco (pode ficar vazio)
        toParByRound: Record<number, number>; // ronda → to_par do jogador
      }
      const pm: Record<string, PEntry> = {};

      for (const ronda of esc.rondas || []) {
        // Par por buraco: preferir ronda.par, depois USKIDS_PAR lookup
        const rPar: number[] =
          ronda.par?.length === (ronda.buracos || 18) ? ronda.par :
          (USKIDS_PAR[`${tourn.t}-${esc.age_group}`] || []);

        for (const jog of ronda.leaderboard || []) {
          const key = normName(jog.nome);
          if (!pm[key]) pm[key] = { co: co(jog.pais), scores: {}, origName: jog.nome.trim(), holeScores: {}, par: rPar, toParByRound: {} };
          const expectedB = ronda.buracos || 18;
          if (jog.score > 0 && jog.buracos === expectedB)
            pm[key].scores[ronda.ronda] = jog.score;
          // Guardar to_par por ronda para calcular tp total
          if (jog.to_par != null)
            pm[key].toParByRound[ronda.ronda] = jog.to_par;
          // Strokes buraco-a-buraco (suporta 9H e 18H)
          const strokes: number[] = jog.strokes?.length ? jog.strokes
            : (jog.rondas?.["1"]?.strokes ?? []);
          if (strokes.length === expectedB)
            pm[key].holeScores[ronda.ronda] = strokes;
          if (rPar.length === expectedB && pm[key].par.length !== expectedB)
            pm[key].par = rPar;
        }
      }

      // Pre-compute all entries for ranking
      type UEntry = { origName: string; co: string; rd: number[]; t: number; tp: number | null; holeRounds: number[][] };
      const entries: UEntry[] = [];
      for (const info of Object.values(pm)) {
        const rdEntries = Object.entries(info.scores).sort(([a],[b]) => Number(a)-Number(b));
        const rd = rdEntries.map(([,v]) => v);
        if (!rd.length) continue;
        const tpEntries = Object.entries(info.toParByRound).sort(([a],[b]) => Number(a)-Number(b));
        const tp = tpEntries.length === rdEntries.length
          ? tpEntries.reduce((acc, [,v]) => acc + v, 0) : null;
        const holeRounds = Object.entries(info.holeScores)
          .sort(([a],[b]) => Number(a)-Number(b))
          .map(([,v]) => v)
          .filter(r => r.length === 18 && r.some(s => s > 0));
        entries.push({ origName: info.origName, co: info.co, rd, t: rd.reduce((a,b)=>a+b,0), tp, holeRounds });
      }
      // Sort by total, assign positions
      const maxRds = entries.length ? Math.max(...entries.map(e => e.rd.length)) : 0;
      entries.sort((a, b) => b.rd.length - a.rd.length || a.t - b.t);
      let pos = 1;
      for (let i = 0; i < entries.length; i++) {
        if (i > 0 && entries[i].rd.length === entries[i-1].rd.length && entries[i].t === entries[i-1].t) {
          // empate
        } else { pos = i + 1; }
        const e = entries[i];
        if (e.holeRounds.length > 0)
          addScorecard(normName(e.origName), { tid, playerName: e.origName, par: pm[normName(e.origName)]?.par ?? [], si: [], rounds: e.holeRounds });
        all.push({
          n: e.origName, co: e.co,
          r: { [tid]: { p: e.rd.length < maxRds ? null : pos, t: e.t, tp: e.tp, rd: e.rd, ageGroup: esc.nome }},
        });
      }
      // Store field size
      const fullField = entries.filter(e => e.rd.length >= maxRds).length;
      if (fullField > 0) uskFieldSizes.set(tid, fullField);
    }
  }
  return all;
}

function mergeInto(map: Map<string, AutoRivalPlayer>, players: AutoRivalPlayer[]) {
  for (const p of players) {
    const key = normName(p.n);
    if (map.has(key)) {
      const ex = map.get(key)!;
      for (const [tid, res] of Object.entries(p.r)) {
        if (!ex.r[tid] || res.rd.length > ex.r[tid].rd.length)
          ex.r[tid] = res;
      }
    } else {
      map.set(key, { ...p, r: { ...p.r } });
    }
  }
}

// Mapeamento tcode (pull-torneios000.json) → tid interno
// Inclui apenas torneios relevantes para rivais internacionais
const PULL_TCODE_TO_TID: Record<string, string> = {
  "10080": "qdl25",    // Quinta do Lago Junior Open 2025 - U12
  "10296": "gg26",     // Greatgolf Junior Open 2026 - U12
  "10295": "gg26_u14", // Greatgolf Junior Open 2026 - U14
  "10294": "gg26_open",// Greatgolf Junior Open 2026 - open (todos escalões)
};

function processPullTorneios(d: unknown): AutoRivalPlayer[] {
  const data = d as {
    tournaments: Array<{
      name: string; tcode: string; date: string; campo?: string;
      players: Array<{
        pos: number; name: string; club?: string;
        grossTotal?: number; toPar?: number;
        roundScores: Array<{
          round: number; gross: number;
          scores: number[]; pars: number[]; si: number[];
        }>;
      }>;
    }>;
  };

  const all: AutoRivalPlayer[] = [];
  for (const tourn of data.tournaments || []) {
    const tid = PULL_TCODE_TO_TID[tourn.tcode];
    if (!tid) continue;

    for (const player of tourn.players || []) {
      const validRounds = player.roundScores
        .filter(rs => rs.scores?.length === 18 && rs.scores.some(s => s > 0))
        .sort((a, b) => a.round - b.round);

      if (!validRounds.length) continue;

      const rd = validRounds.map(rs => rs.gross);
      const tp = player.toPar ?? null;
      const t  = player.grossTotal ?? (rd.reduce((a, b) => a + b, 0) || null);
      const p  = player.pos ?? null;

      // Scorecard: use pars/si from first round (consistent across rounds on same course)
      const par = validRounds[0].pars;
      const si  = validRounds[0].si;
      if (par.length === 18) {
        addScorecard(normName(player.name), {
          tid,
          playerName: player.name,
          par,
          si,
          rounds: validRounds.map(rs => rs.scores),
        });
      }

      all.push({
        n: player.name,
        co: player.club || "",
        r: { [tid]: { p, t, tp, rd } },
      });
    }
  }
  return all;
}

/**
 * Processa ficheiros no formato "uskids_torneios_completos" (array de torneios).
 * - Carrega escalões Boys ±1 do que Manuel teria jogado na altura (9H e 18H incluídos)
 * - flight_name pode ser dict {age_group} ou string → lookup via meta.flights
 * - tid gerado como "usk{tcode}_b{minAge}"
 */
function processUskidsCompleto(data: unknown): AutoRivalPlayer[] {
  type FlightCourse = { pars: number[] };
  type AgeGroup = { name: string; gender: string; min_age: number; holes_per_round: number };
  type MetaFlight = { age_group: number };
  type PlayerRoundData = { strokes: number[]; flight_round: string };
  type FlightPlayer = {
    first: string; last: string; country: string;
    rounds: Record<string, PlayerRoundData>;
  };
  type RoundData = { flight_players: Record<string, FlightPlayer> };
  type Flight = {
    flight_id: number;
    flight_name: { age_group: number } | string;
    rounds_data: Record<string, RoundData>;
  };
  type Tournament = {
    t: number;
    meta: {
      tournament: { name: string; start_date: string };
      age_groups: Record<string, AgeGroup>;
      flights: Record<string, MetaFlight>;
      flight_courses: Record<string, FlightCourse>;
    };
    flights: Flight[];
  };

  const tournaments = data as Tournament[];
  if (!Array.isArray(tournaments)) return [];

  const all: AutoRivalPlayer[] = [];

  for (const tourn of tournaments) {
    if (!USKIDS_KNOWN_TCODES.has(tourn.t)) continue;

    const meta = tourn.meta;
    const tcode = tourn.t;

    // Ano do torneio → idade do Manuel nessa época
    const startParts = meta.tournament.start_date.split("/").map(Number);
    const tournYear = startParts[2];
    const manuelAge = tournYear - MANUEL_BIRTH_YEAR;

    // Guardar nome/data do torneio para lookup no UI
    if (!uskTournNames.has(`usk${tcode}`)) {
      const rawName = meta.tournament.name; // ex: "World Championship 2022"
      const mo = startParts[0]; // 1-12
      const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
      const dateStr = `${MONTHS[(mo - 1) % 12]} ${tournYear}`;
      // Short name: sigla extraída
      const short = rawName
        .replace(/World Championship/i, "WC")
        .replace(/European Championship/i, "EC")
        .replace(/\b(Invitational|Open|Classic|Championship|Junior|Tour)\b/gi, "")
        .replace(/\s+/g, " ").trim()
        .slice(0, 12);
      const mo2 = String(mo).padStart(2,"0");
      const da2 = String(startParts[1]).padStart(2,"0");
      uskTournNames.set(`usk${tcode}`, { name: rawName, short, date: dateStr, dateExact: `${tournYear}-${mo2}-${da2}` });
    }

    // Escalões Boys únicos ordenados por min_age (desduplicar min_age repetidos)
    const seenMinAge = new Set<number>();
    const boysAgs = Object.entries(meta.age_groups)
      .filter(([, ag]) => ag.gender === "Boys")
      .sort((a, b) => a[1].min_age - b[1].min_age)
      .reduce((acc, [id, ag]) => {
        if (!seenMinAge.has(ag.min_age)) {
          seenMinAge.add(ag.min_age);
          acc.push({ id: Number(id), minAge: ag.min_age, holes: ag.holes_per_round, name: ag.name });
        }
        return acc;
      }, [] as { id: number; minAge: number; holes: number; name: string }[]);

    // Índice do escalão do Manuel (pelo min_age mais próximo)
    const manuelIdx = boysAgs.findIndex(ag => ag.minAge === manuelAge);
    // Se não existir exactamente, usar o mais próximo
    const pivotIdx = manuelIdx >= 0
      ? manuelIdx
      : boysAgs.reduce((best, ag, i) =>
          Math.abs(ag.minAge - manuelAge) < Math.abs(boysAgs[best].minAge - manuelAge) ? i : best, 0);

    // Queremos ±1 escalão em torno do pivot
    const wantedMinAges = new Set(
      boysAgs.slice(Math.max(0, pivotIdx - 1), pivotIdx + 2).map(ag => ag.minAge)
    );

    // flight_round_id → par por buraco (sem zeros)
    const frPars: Record<number, number[]> = {};
    for (const [frid, fc] of Object.entries(meta.flight_courses)) {
      frPars[Number(frid)] = (fc.pars || []).filter((p: number) => p > 0);
    }

    // ag_id → info (para lookup rápido)
    const agById = new Map(boysAgs.map(ag => [ag.id, ag]));

    // Track ag_ids já processados por torneio
    const processedAgIds = new Set<number>();

    for (const flight of tourn.flights) {
      const fid = flight.flight_id;

      // Resolver age_group: flight_name pode ser dict ou string
      const fn = flight.flight_name;
      const agId: number | undefined =
        typeof fn === "object" && fn !== null && "age_group" in fn
          ? (fn as { age_group: number }).age_group
          : meta.flights[String(fid)]?.age_group;
      if (agId == null) continue;
      if (processedAgIds.has(agId)) continue;

      const agInfo = agById.get(agId);
      if (!agInfo || !wantedMinAges.has(agInfo.minAge)) continue;
      processedAgIds.add(agId);

      const holes = agInfo.holes;
      const agLabel = agInfo.name;
      const tid = `usk${tcode}_b${agInfo.minAge}`;

      // Agregar jogadores por nome
      const pm: Record<string, {
        name: string; country: string;
        rounds: Record<number, number[]>;
        par: number[];
      }> = {};

      for (const roundData of Object.values(flight.rounds_data)) {
        const fp = roundData.flight_players;
        if (!fp || typeof fp !== "object") continue;
        for (const p of Object.values(fp)) {
          const fullName = `${p.first} ${p.last}`.trim();
          const key = normName(fullName);
          if (!pm[key]) pm[key] = { name: fullName, country: p.country, rounds: {}, par: [] };

          for (const [rnumStr, rdata] of Object.entries(p.rounds)) {
            const rnum = Number(rnumStr);
            const strokes = rdata.strokes || [];
            if (strokes.length === holes && strokes.some(s => s > 0)) {
              if (!pm[key].rounds[rnum]) pm[key].rounds[rnum] = strokes;
              if (!pm[key].par.length) {
                const par = frPars[Number(rdata.flight_round)] || [];
                if (par.length === holes) pm[key].par = par;
              }
            }
          }
        }
      }

      // Pré-calcular totais para ranking
      type Computed = { name: string; country: string; rd: number[]; t: number; tp: number | null; par: number[]; rdRaw: number[][] };
      const computed: Computed[] = [];
      for (const info of Object.values(pm)) {
        const rdEntries = Object.entries(info.rounds).sort(([a], [b]) => Number(a) - Number(b));
        if (!rdEntries.length) continue;
        const rdRaw = rdEntries.map(([, v]) => v);
        const rd = rdRaw.map(v => v.reduce((a, b) => a + b, 0));
        const t = rd.reduce((a, b) => a + b, 0);
        const tp = info.par.length === holes
          ? t - info.par.reduce((a, b) => a + b, 0) * rdEntries.length
          : null;
        computed.push({ name: info.name, country: info.country, rd, t, tp, par: info.par, rdRaw });
      }

      // Ordenar por total (quem jogou menos rondas fica no fim)
      const maxRds = Math.max(...computed.map(c => c.rd.length), 0);
      computed.sort((a, b) => {
        if (a.rd.length !== b.rd.length) return b.rd.length - a.rd.length;
        return a.t - b.t;
      });

      // Atribuir posição com empates
      let pos = 1;
      for (let i = 0; i < computed.length; i++) {
        if (i > 0 && computed[i].rd.length === computed[i - 1].rd.length && computed[i].t === computed[i - 1].t) {
          // empate — mesma posição
        } else {
          pos = i + 1;
        }
        const c = computed[i];
        addScorecard(normName(c.name), {
          tid, playerName: c.name, par: c.par, si: [],
          rounds: c.rdRaw,
        });
        all.push({
          n: c.name, co: co(c.country),
          r: { [tid]: { p: c.rd.length < maxRds ? null : pos, t: c.t, tp: c.tp, rd: c.rd, ageGroup: agLabel } },
        });
      }
      // Store full field size (only players who completed all rounds)
      const fullField = computed.filter(c => c.rd.length >= maxRds).length;
      if (fullField > 0) uskFieldSizes.set(tid, fullField);
    }
  }

  return all;
}

export type LoadProgress = { done: number; total: number; label: string };

export async function buildAutoRivals(
  onProgress?: (p: LoadProgress) => void
): Promise<AutoRivalPlayer[]> {
  _scorecards.clear();
  // Re-populate from hardcoded meta (clear + refill)
  uskTournNames.clear();
  for (const [tcode, meta] of Object.entries(USKIDS_TCODE_META as Record<string, { name: string; short: string; dateExact: string }>)) {
    const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const [yr, mo] = meta.dateExact.split("-").map(Number);
    uskTournNames.set(`usk${tcode}`, { name: meta.name, short: meta.short, date: `${MONTHS[mo - 1]} ${yr}`, dateExact: meta.dateExact });
  }
  uskFieldSizes.clear();

  const base = "/data/";

  // Todos os ficheiros a carregar, com label e processador
  type FileTask =
    | { kind: "wjgc"; tid: string; file: string }
    | { kind: "doral" | "uskids" | "pull"; file: string }
    | { kind: "completo"; file: string };

  const tasks: FileTask[] = [
    { kind: "wjgc", tid: "wjgc25_b89",    file: "wjgc_2025_b89.json" },
    { kind: "wjgc", tid: "wjgc25_b1011",  file: "wjgc_2025_contest34.json" },
    { kind: "wjgc", tid: "wjgc26",        file: "wjgc_2026_b1011_3r.json" },
    { kind: "wjgc", tid: "wjgc26_1213",   file: "wjgc_2026_contest33.json" },
    { kind: "wjgc", tid: "eowagr25_b78",  file: "eowagr25_contest121.json" },
    { kind: "wjgc", tid: "eowagr25_b910", file: "eowagr25_contest13.json" },
    { kind: "wjgc", tid: "eowagr25",      file: "eowagr25_scorecards.json" },
    { kind: "wjgc", tid: "eowagr25_b1314",file: "eowagr25_contest77.json" },
    { kind: "doral",  file: "ftm_doral_2025.json" },
    { kind: "uskids", file: "uskids-results.json" },
    { kind: "pull",   file: "pull-torneios000.json" },
    ...Array.from({ length: 15 }, (_, i) =>
      ({ kind: "completo" as const, file: `uskids_torneios_completos(${i + 1}).json` })
    ),
  ];

  const total = tasks.length;
  const map = new Map<string, AutoRivalPlayer>();

  // Labels amigáveis por ficheiro
  const labelFor = (t: FileTask): string => {
    if (t.kind === "wjgc") return t.tid.replace(/_/g," ").toUpperCase();
    if (t.kind === "doral") return "Doral";
    if (t.kind === "uskids") return "USKids Results";
    if (t.kind === "pull") return "Torneios PT";
    const m = t.file.match(/\((\d+)\)/);
    return m ? `USKids #${m[1]}` : t.file;
  };

  // Carregar em paralelo mas reportar progresso à medida que cada um termina
  let done = 0;
  const report = (label: string) => {
    done++;
    onProgress?.({ done, total, label });
  };

  await Promise.all(tasks.map(async task => {
    try {
      const d = await fetchJson(`${base}${task.file}`);
      if (task.kind === "wjgc")    mergeInto(map, processWjgc(d, task.tid));
      if (task.kind === "doral")   mergeInto(map, processDoral(d));
      if (task.kind === "uskids")  mergeInto(map, processUskids(d));
      if (task.kind === "pull")    mergeInto(map, processPullTorneios(d));
      if (task.kind === "completo") mergeInto(map, processUskidsCompleto(d));
    } catch { /* ficheiro não existe ou erro — ignorar */ }
    report(labelFor(task));
  }));

  return Array.from(map.values());
}
