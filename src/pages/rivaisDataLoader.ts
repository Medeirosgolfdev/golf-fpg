/**
 * rivaisDataLoader.ts
 *
 * Carrega automaticamente todos os ficheiros JSON de torneios
 * e converte-os em RivalPlayer[] para uso na RivaisIntlPage.
 *
 * Cada ficheiro JSON tem prioridade sobre os dados do array D manual,
 * excepto quando D tem dob, isM, up, ou overrides manuais.
 */

// ─── JSON imports (Vite resolve estes em build-time) ───────────────────────
import wjgc25_b1011  from "./wjgc_2025_contest34.json";
import wjgc25_b89    from "./wjgc_2025_b89.json";
import wjgc25_b1213  from "./wjgc_2025_contest28.json";  // "B8-9" no nome mas é B12-13 na realidade - ver nota
import wjgc26_b1011  from "./wjgc_2026_b1011_3r.json";
import wjgc26_b1213  from "./wjgc_2026_contest33.json";
import eowagr25_b910 from "./eowagr25_contest13.json";
import eowagr25_b1112 from "./eowagr25_scorecards.json";
import eowagr25_b1314 from "./eowagr25_contest77.json";
import eowagr25_b78  from "./eowagr25_contest121.json";
import doralRaw      from "./ftm_doral_2025.json";
import uskidsRaw     from "./uskids-results.json";

// ─── Country code → full name ──────────────────────────────────────────────
const CC: Record<string, string> = {
  US: "United States", GB: "United Kingdom", ES: "Spain", IT: "Italy",
  FR: "France", DE: "Germany", CH: "Switzerland", NO: "Norway",
  SE: "Sweden", PT: "Portugal", RU: "Russian Federation", BG: "Bulgaria",
  NL: "Netherlands", LT: "Lithuania", TH: "Thailand", PH: "Philippines",
  CN: "China", RO: "Romania", UA: "Ukraine", SI: "Slovenia",
  BE: "Belgium", DK: "Denmark", CA: "Canada", BR: "Brazil",
  MX: "Mexico", AT: "Austria", HU: "Hungary", SK: "Slovakia",
  ZA: "South Africa", SG: "Singapore", IN: "India", TR: "Turkey",
  KR: "South Korea", LV: "Latvia", CZ: "Czech Republic", PL: "Poland",
  PY: "Paraguay", CL: "Chile", CO: "Colombia", PR: "Puerto Rico",
  IE: "Ireland", CY: "Cyprus", OM: "Oman", LB: "Lebanon",
  AE: "United Arab Emirates", KZ: "Kazakhstan", VN: "Viet Nam",
  JE: "Jersey", NG: "Nigeria", CR: "Costa Rica", AR: "Argentina",
};

function country(raw: string): string {
  if (!raw) return "?";
  const trimmed = raw.trim();
  return CC[trimmed] || trimmed;
}

// ─── Normalise player name for dedup ──────────────────────────────────────
export function normName(n: string): string {
  return n.trim().toLowerCase()
    .replace(/\s+/g, " ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ─── Types mirrored from RivaisIntlPage ───────────────────────────────────
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

// ─── Tournament descriptors ────────────────────────────────────────────────
interface TournSource {
  id: string;
  ageGroup: string;
  ageMin: number;
  ageMax: number;
  dateExact: string;
}

const TOURN_DEFS: TournSource[] = [
  { id: "wjgc25_b89",    ageGroup: "B8-9",   ageMin: 8,  ageMax: 9,  dateExact: "2025-02-24" },
  { id: "wjgc25_b1011",  ageGroup: "B10-11", ageMin: 10, ageMax: 11, dateExact: "2025-02-24" },
  { id: "wjgc25_b1213",  ageGroup: "B12-13", ageMin: 12, ageMax: 13, dateExact: "2025-02-24" },
  { id: "wjgc26_b1011",  ageGroup: "B10-11", ageMin: 10, ageMax: 11, dateExact: "2026-02-24" },
  { id: "wjgc26_b1213",  ageGroup: "B12-13", ageMin: 12, ageMax: 13, dateExact: "2026-02-24" },
  { id: "eowagr25_b78",  ageGroup: "B7-8",   ageMin: 7,  ageMax: 8,  dateExact: "2025-08-01" },
  { id: "eowagr25_b910", ageGroup: "B9-10",  ageMin: 9,  ageMax: 10, dateExact: "2025-08-01" },
  { id: "eowagr25_b1112",ageGroup: "B10-11", ageMin: 10, ageMax: 11, dateExact: "2025-08-01" },
  { id: "eowagr25_b1314",ageGroup: "B13-14", ageMin: 13, ageMax: 14, dateExact: "2025-08-01" },
  { id: "doral25_b89",   ageGroup: "B8-9",   ageMin: 8,  ageMax: 9,  dateExact: "2025-12-19" },
  { id: "doral25_b1011", ageGroup: "B10-11", ageMin: 10, ageMax: 11, dateExact: "2025-12-19" },
  { id: "doral25_b1213", ageGroup: "B12-13", ageMin: 12, ageMax: 13, dateExact: "2025-12-19" },
];

// Export so RivaisIntlPage can merge with its T array
export const AUTO_TOURN_DEFS = TOURN_DEFS;

// ─── Generic WJGC/EOWAGR JSON processor ───────────────────────────────────
interface WjgcJson {
  tournament: string;
  players: Array<{
    name: string;
    country: string;
    pos: number | string | null;
    result: number | null;
    total: number | null;
    rounds: Array<{ gross: number; scores?: number[] }>;
  }>;
}

function processWjgcJson(data: unknown, tid: string): AutoRivalPlayer[] {
  const d = data as WjgcJson;
  return d.players.filter(p => p.rounds?.length > 0).map(p => {
    const rd = p.rounds.map(r => r.gross).filter(g => g > 0);
    const t = rd.length > 0 ? rd.reduce((a, b) => a + b, 0) : null;
    const pos = typeof p.pos === "number" ? p.pos : null;
    return {
      n: p.name.trim(),
      co: country(p.country),
      r: { [tid]: { p: pos, t, tp: p.result ?? null, rd } },
    };
  });
}

// ─── Doral processor ──────────────────────────────────────────────────────
interface DoralJson {
  divisions: Array<{
    name: string;
    players: Array<{
      name: string;
      country: string;
      pos: number | null;
      toPar: number | null;
      total: number | null;
      r1Gross: number;
      r2Gross: number;
      rounds?: Array<{ gross?: number; scores?: number[] }>;
    }>;
  }>;
}

function processDoral(data: unknown): AutoRivalPlayer[] {
  const d = data as DoralJson;
  const all: AutoRivalPlayer[] = [];
  const divMap: Record<string, string> = {
    "Boys 8 & 9 Division": "doral25_b89",
    "Boys 10 & 11 Division": "doral25_b1011",
    "Boys 12 & 13 Division": "doral25_b1213",
  };
  for (const div of d.divisions) {
    const tid = divMap[div.name];
    if (!tid) continue;
    for (const p of div.players) {
      const name = p.name.includes(",")
        ? p.name.split(",").map(s => s.trim()).reverse().join(" ")
        : p.name.trim();
      const rd = [p.r1Gross, p.r2Gross].filter(g => g > 0);
      if (rd.length === 0) continue;
      const t = rd.reduce((a, b) => a + b, 0);
      all.push({
        n: name,
        co: country(p.country),
        r: { [tid]: { p: p.pos, t, tp: p.toPar ?? null, rd } },
      });
    }
  }
  return all;
}

// ─── USKids processor ─────────────────────────────────────────────────────
interface UskidsJson {
  resultados: Array<{
    t: number;
    name: string;
    date_inicio: string;
    escaloes: Array<{
      nome: string;  // "Boys 11", "Boys 12", etc.
      is_manuel: boolean;
      rondas: Array<{
        ronda: number;
        leaderboard: Array<{
          nome: string;
          pais: string;
          score: number;
          buracos: number;
        }>;
      }>;
    }>;
  }>;
}

// Map US Kids tournament name → our internal id
const USKIDS_ID_MAP: Record<string, string> = {
  "Venice Open 2025": "venice25",
  "Rome Classic 2025": "rome25",
  "Marco Simone Invitational 2025": "marco25",
  "Desert Shootout 2026": "desert26",
  "Sandestin Championship 2026": "sandestin26",
  "2026 Mississippi State Invitational": "msstate26",
  "Real Club de Golf El Prat": "elprat23",
};

// Age group name → (ageMin, ageMax)
const USKIDS_AGE_MAP: Record<string, [number, number]> = {
  "Boys 7":  [7, 7], "Boys 8":  [8, 8], "Boys 9": [9, 9],
  "Boys 10": [10,10], "Boys 11": [11,11], "Boys 12": [12,12],
  "Boys 13": [13,13], "Boys 14": [14,14],
};

// USKids dates
const USKIDS_DATE_MAP: Record<string, string> = {
  "Venice Open 2025": "2025-08-07",
  "Rome Classic 2025": "2025-10-09",
  "Marco Simone Invitational 2025": "2025-03-15",
  "Desert Shootout 2026": "2026-02-21",
  "Sandestin Championship 2026": "2026-01-17",
  "2026 Mississippi State Invitational": "2026-03-09",
  "Real Club de Golf El Prat": "2023-10-22",
};

interface UskidsExtraTournDef extends TournSource {
  name: string;
  short: string;
  field: number;
  nations: number;
}

export const USKIDS_AUTO_TOURNS: UskidsExtraTournDef[] = [];

function processUskids(data: unknown): { players: AutoRivalPlayer[]; extraTourns: UskidsExtraTournDef[] } {
  const d = data as UskidsJson;
  const allPlayers: AutoRivalPlayer[] = [];
  const extraTourns: UskidsExtraTournDef[] = [];
  const seenTournIds = new Set<string>();

  for (const tourn of d.resultados) {
    const baseId = USKIDS_ID_MAP[tourn.name];
    if (!baseId) continue;
    const tDate = USKIDS_DATE_MAP[tourn.name] || "2025-01-01";

    for (const esc of tourn.escaloes) {
      if (!esc.nome || !esc.rondas?.length) continue;
      const ages = USKIDS_AGE_MAP[esc.nome];
      if (!ages) continue;
      const [ageMin, ageMax] = ages;

      // Suffix tourns per age group (e.g. "venice25_b11")
      const tid = `${baseId}_b${ageMin}`;

      // Collect rounds per player
      const playerMap: Record<string, { co: string; scores: Record<number, number> }> = {};
      for (const ronda of esc.rondas) {
        for (const jog of ronda.leaderboard) {
          const norm = normName(jog.nome);
          if (!playerMap[norm]) {
            playerMap[norm] = { co: country(jog.pais), scores: {} };
          }
          if (jog.score > 0 && jog.buracos === 18) {
            playerMap[norm].scores[ronda.ronda] = jog.score;
          }
        }
      }

      // Build players
      let fieldCount = 0;
      const nationSet = new Set<string>();
      for (const [norm, info] of Object.entries(playerMap)) {
        const rd = Object.entries(info.scores)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([, v]) => v);
        if (rd.length === 0) continue;
        fieldCount++;
        nationSet.add(info.co);

        // Find original name from leaderboard
        let origName = norm;
        for (const ronda of esc.rondas) {
          const found = ronda.leaderboard.find(j => normName(j.nome) === norm);
          if (found) { origName = found.nome.trim(); break; }
        }

        const t = rd.reduce((a, b) => a + b, 0);
        allPlayers.push({
          n: origName,
          co: info.co,
          r: { [tid]: { p: null, t, tp: null, rd, ageGroup: esc.nome } },
        });
      }

      // Register extra tournament def if not already
      if (!seenTournIds.has(tid)) {
        seenTournIds.add(tid);
        extraTourns.push({
          id: tid,
          name: `${tourn.name} ${esc.nome}`,
          short: `${baseId.replace(/\d+/g, s => s.slice(-2)).toUpperCase()}_${esc.nome.replace("Boys ", "B")}`,
          ageGroup: esc.nome,
          ageMin,
          ageMax,
          dateExact: tDate,
          field: fieldCount,
          nations: nationSet.size,
        });
      }
    }
  }

  return { players: allPlayers, extraTourns };
}

// ─── Master merge function ─────────────────────────────────────────────────
export function buildAutoRivals(): {
  players: AutoRivalPlayer[];
  extraTournDefs: TournSource[];
} {
  const all: AutoRivalPlayer[] = [
    ...processWjgcJson(wjgc25_b89,     "wjgc25_b89"),
    ...processWjgcJson(wjgc25_b1011,   "wjgc25_b1011"),
    ...processWjgcJson(wjgc25_b1213,   "wjgc25_b1213"),
    ...processWjgcJson(wjgc26_b1011,   "wjgc26"),           // já existe no T como wjgc26
    ...processWjgcJson(wjgc26_b1213,   "wjgc26_1213"),       // já existe no T como wjgc26_1213
    ...processWjgcJson(eowagr25_b78,   "eowagr25_b78"),
    ...processWjgcJson(eowagr25_b910,  "eowagr25_b910"),
    ...processWjgcJson(eowagr25_b1112, "eowagr25"),          // já existe no T como eowagr25
    ...processWjgcJson(eowagr25_b1314, "eowagr25_b1314"),
    ...processDoral(doralRaw),
  ];

  const { players: uskidsPlayers, extraTourns } = processUskids(uskidsRaw);
  all.push(...uskidsPlayers);

  // Deduplicate: merge by normalised name
  const merged: Map<string, AutoRivalPlayer> = new Map();
  for (const p of all) {
    const key = normName(p.n);
    if (merged.has(key)) {
      const existing = merged.get(key)!;
      // Merge results — each tournament id unique
      for (const [tid, res] of Object.entries(p.r)) {
        if (!existing.r[tid]) {
          existing.r[tid] = res;
        }
        // If same tid but more rounds, prefer the one with more data
        else if (res.rd.length > existing.r[tid].rd.length) {
          existing.r[tid] = res;
        }
      }
    } else {
      merged.set(key, { ...p, r: { ...p.r } });
    }
  }

  // Build extra tournament defs (new ids not in the main T array)
  const knownIds = new Set([
    "brjgt25","eowagr25","venice25","rome25","doral25","qdl25","gg26","wjgc26","wjgc26_1213"
  ]);
  const allExtraDefs: TournSource[] = [
    ...TOURN_DEFS.filter(t => !knownIds.has(t.id)),
    ...extraTourns,
  ];

  return {
    players: Array.from(merged.values()),
    extraTournDefs: allExtraDefs,
  };
}
