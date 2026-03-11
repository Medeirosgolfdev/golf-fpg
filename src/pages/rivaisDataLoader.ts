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
};

function co(raw: string): string {
  const t = (raw||"").trim();
  return CC[t] || t;
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

function addScorecard(normN: string, sc: AutoScorecard) {
  if (!_scorecards.has(normN)) _scorecards.set(normN, []);
  _scorecards.get(normN)!.push(sc);
}

export function getScorecards(playerName: string): AutoScorecard[] {
  const key = normName(playerName);
  // Exact match first
  const exact = _scorecards.get(key);
  if (exact?.length) return exact;
  // Fuzzy: match by first + last word (handles middle names like "Goulartt")
  const parts = key.split(" ").filter(Boolean);
  if (parts.length < 2) return [];
  const first = parts[0];
  const last  = parts[parts.length - 1];
  for (const [k, v] of _scorecards.entries()) {
    const kp = k.split(" ").filter(Boolean);
    if (kp[0] === first && kp[kp.length - 1] === last) return v;
  }
  return [];
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
    // Store hole-by-hole scorecard if available
    const holeRounds = p.rounds
      .map(r => r.scores || [])
      .filter(s => s.length === 18);
    if (holeRounds.length > 0 && par.length === 18) {
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
    for (const p of div.players || []) {
      const name = p.name.includes(",")
        ? p.name.split(",").map(s=>s.trim()).reverse().join(" ")
        : p.name.trim();
      const rd = [p.r1Gross, p.r2Gross].filter(g => g > 0);
      if (!rd.length) continue;
      const holeRounds = (p.rounds || []).map(r => r.scores || []).filter(s => s.length === 18);
      if (holeRounds.length > 0 && divPar.length === 18)
        addScorecard(normName(name), { tid, playerName: name, par: divPar, si: [], rounds: holeRounds });
      all.push({
        n: name, co: co(p.country),
        r: { [tid]: { p: p.pos, t: rd.reduce((a,b)=>a+b,0), tp: p.toPar ?? null, rd }},
      });
    }
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
          if (jog.score > 0 && jog.buracos === 18)
            pm[key].scores[ronda.ronda] = jog.score;
          // Guardar to_par por ronda para calcular tp total
          if (jog.to_par != null)
            pm[key].toParByRound[ronda.ronda] = jog.to_par;
          // Strokes buraco-a-buraco
          const strokes: number[] = jog.strokes?.length ? jog.strokes
            : (jog.rondas?.["1"]?.strokes ?? []);
          if (strokes.length === 18)
            pm[key].holeScores[ronda.ronda] = strokes;
          if (rPar.length === 18 && pm[key].par.length !== 18)
            pm[key].par = rPar;
        }
      }

      for (const info of Object.values(pm)) {
        const rdEntries = Object.entries(info.scores).sort(([a],[b]) => Number(a)-Number(b));
        const rd = rdEntries.map(([,v]) => v);
        if (!rd.length) continue;

        // tp = soma dos to_par por ronda (se disponível)
        const tpEntries = Object.entries(info.toParByRound).sort(([a],[b]) => Number(a)-Number(b));
        const tp = tpEntries.length === rdEntries.length
          ? tpEntries.reduce((acc, [,v]) => acc + v, 0)
          : null;

        // Scorecard: guardar se tiver strokes buraco-a-buraco
        // par pode estar vazio — o componente renderiza na mesma sem coloração por buraco
        const holeRounds = Object.entries(info.holeScores)
          .sort(([a],[b]) => Number(a)-Number(b))
          .map(([,v]) => v)
          .filter(r => r.length === 18 && r.some(s => s > 0));
        if (holeRounds.length > 0) {
          addScorecard(normName(info.origName), { tid, playerName: info.origName, par: info.par, si: [], rounds: holeRounds });
        }

        all.push({
          n: info.origName, co: info.co,
          r: { [tid]: { p: null, t: rd.reduce((a,b)=>a+b,0), tp, rd, ageGroup: esc.nome }},
        });
      }
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

export async function buildAutoRivals(): Promise<AutoRivalPlayer[]> {
  // Limpar scorecard store antes de reconstruir
  _scorecards.clear();

  const base = "/data/";
  const files = [
    ["wjgc25_b89",    "wjgc_2025_b89.json"],
    ["wjgc25_b1011",  "wjgc_2025_contest34.json"],
    ["wjgc26",        "wjgc_2026_b1011_3r.json"],
    ["wjgc26_1213",   "wjgc_2026_contest33.json"],
    ["eowagr25_b78",  "eowagr25_contest121.json"],
    ["eowagr25_b910", "eowagr25_contest13.json"],
    ["eowagr25",      "eowagr25_scorecards.json"],
    ["eowagr25_b1314","eowagr25_contest77.json"],
  ] as const;

  const results = await Promise.allSettled([
    ...files.map(([,f]) => fetchJson(`${base}${f}`)),
    fetchJson(`${base}ftm_doral_2025.json`),
    fetchJson(`${base}uskids-results.json`),
    fetchJson(`${base}pull-torneios000.json`),
  ]);

  const map = new Map<string, AutoRivalPlayer>();
  const ok = (r: PromiseSettledResult<unknown>) =>
    r.status === "fulfilled" ? r.value : null;

  files.forEach(([tid], i) => {
    const d = ok(results[i]);
    if (d) mergeInto(map, processWjgc(d, tid));
  });

  const doral = ok(results[files.length]);
  const uskids = ok(results[files.length + 1]);
  const pull   = ok(results[files.length + 2]);
  if (doral)  mergeInto(map, processDoral(doral));
  if (uskids) mergeInto(map, processUskids(uskids));
  if (pull)   mergeInto(map, processPullTorneios(pull));

  return Array.from(map.values());
}
