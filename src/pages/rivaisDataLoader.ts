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
  return _scorecards.get(normName(playerName)) || [];
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
      name: string;
      players: Array<{
        name: string; country: string;
        pos: number|null; toPar: number|null;
        r1Gross: number; r2Gross: number;
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
    for (const p of div.players || []) {
      const name = p.name.includes(",")
        ? p.name.split(",").map(s=>s.trim()).reverse().join(" ")
        : p.name.trim();
      const rd = [p.r1Gross, p.r2Gross].filter(g => g > 0);
      if (!rd.length) continue;
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

function processUskids(data: unknown): AutoRivalPlayer[] {
  const d = data as {
    resultados: Array<{
      name: string;
      escaloes: Array<{
        nome: string;
        rondas: Array<{
          ronda: number;
          leaderboard: Array<{ nome: string; pais: string; score: number; buracos: number }>;
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
      const pm: Record<string, { co: string; scores: Record<number,number>; origName: string }> = {};
      for (const ronda of esc.rondas || []) {
        for (const jog of ronda.leaderboard || []) {
          const key = normName(jog.nome);
          if (!pm[key]) pm[key] = { co: co(jog.pais), scores: {}, origName: jog.nome.trim() };
          if (jog.score > 0 && jog.buracos === 18)
            pm[key].scores[ronda.ronda] = jog.score;
        }
      }
      for (const info of Object.values(pm)) {
        const rd = Object.entries(info.scores)
          .sort(([a],[b]) => Number(a)-Number(b))
          .map(([,v]) => v);
        if (!rd.length) continue;
        all.push({
          n: info.origName, co: info.co,
          r: { [tid]: { p: null, t: rd.reduce((a,b)=>a+b,0), tp: null, rd, ageGroup: esc.nome }},
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

export async function buildAutoRivals(): Promise<AutoRivalPlayer[]> {
  const base = "/data/";
  const files = [
    ["wjgc25_b89",    "wjgc_2025_b89.json"],
    ["wjgc25_b1011",  "wjgc_2025_contest34.json"],
    ["wjgc25_b1213",  "wjgc_2025_contest28.json"],
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
  if (doral)  mergeInto(map, processDoral(doral));
  if (uskids) mergeInto(map, processUskids(uskids));

  return Array.from(map.values());
}
