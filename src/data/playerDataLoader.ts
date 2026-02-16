/**
 * playerDataLoader.ts
 * 
 * Extrai os dados embebidos no HTML standalone gerado por make-scorecards-ui.js.
 * O HTML contém um bloco <script> com variáveis JS (DATA, HOLES, etc.)
 * geradas via JSON.stringify — podemos extraí-las com regex e fazer JSON.parse.
 */

/* ─── Tipos (espelham a estrutura gerada pelo pipeline Node) ─── */

export interface RoundData {
  scoreId: string;
  date: string;
  dateSort: number;
  holeCount: number;
  tee: string;
  teeKey: string;
  gross: number | null;
  par: number | null;
  stb: number | null;
  sd: number | null;
  hi: number | null;
  meters: number | null;
  hasCard: boolean;
  eventName: string;
  scoreOrigin: string;
  _isTreino?: boolean;
  _group?: string;
  _pill?: string;
  _links?: Record<string, string>;
  _showInTournament?: boolean | null;
}

export interface CourseData {
  course: string;
  count: number;
  lastDateSort: number;
  rounds: RoundData[];
}

export interface HoleScores {
  g: (number | null)[];
  p: (number | null)[];
  si: (number | null)[];
  m?: (number | null)[];
  hc: number;
}

export interface EclecticHole {
  h: number;
  best: number | null;
  par: number | null;
  from: { scoreId: string; date: string } | null;
}

export interface EclecticEntry {
  teeName: string;
  teeKey: string;
  holeCount: number;
  totalGross: number;
  totalPar: number;
  toPar: number | null;
  holes: EclecticHole[];
  si: (number | null)[];
  wins: Record<string, number>;
}

export interface HoleStatEntry {
  h: number;
  par: number | null;
  si: number | null;
  n: number;
  avg?: number;
  best?: number;
  worst?: number;
  strokesLost?: number;
  dist?: {
    eagle: number;
    birdie: number;
    par: number;
    bogey: number;
    double: number;
    triple: number;
  };
}

export interface HoleStatsData {
  teeName: string;
  teeKey: string;
  holeCount: number;
  nRounds: number;
  holes: HoleStatEntry[];
  totalDist: { eagle: number; birdie: number; par: number; bogey: number; double: number; triple: number; total: number };
  totalPar: number;
  totalStrokesLost: number;
  byParType: Record<string, {
    par: number; holes: HoleStatEntry[]; totalN: number; avg: number | null;
    avgVsPar: number | null; strokesLostPerRound: number; nHoles: number;
    parOrBetterPct: number; doubleOrWorsePct: number;
    dist: { eagle: number; birdie: number; par: number; bogey: number; double: number; triple: number };
  }>;
  f9b9: { f9: { strokesLost: number; par: number; dblPct: number }; b9: { strokesLost: number; par: number; dblPct: number } } | null;
  bestRound: { gross: number; date: string } | null;
  worstRound: { gross: number; date: string } | null;
  avgGross: number | null;
  trend: number | null;
}

export interface CrossPlayerData {
  fed: string;
  name: string;
  sex: string;
  escalao: string;
  birthYear: number | string | null;
  club: string;
  currentHcp: number | null;
  lastSD: number | null;
  avgSD20: number | null;
  avgGross20: number | null;
  numRounds: number;
  numTournaments: number;
  numEDS: number;
  roundsCurrentYear: number;
  roundsLastYear: number;
  rounds2YearsAgo: number;
  rounds3YearsAgo: number;
  firstDate: string | null;
  hcpHistory: { d: number; h: number }[];
  courseTee: Record<string, {
    course: string; tee: string; courseKey: string; teeKey: string;
    best: number | null; avg: number; worst: number | null; count: number;
    rounds: { gross: number; par: number; sd: number | null; hi: number | null; date: string; event: string }[];
  }>;
}

export interface HcpInfo {
  current: number | null;
  lowHcp: number | null;
  softCap: number | null;
  hardCap: number | null;
  scoreAvg: number | null;
  qtyScores: number | null;
  qtyCalc: number | null;
  adjustTotal: number | null;
}

export interface PlayerPageData {
  DATA: CourseData[];
  HOLES: Record<string, HoleScores>;
  EC: Record<string, EclecticEntry[]>;
  ECDET: Record<string, Record<string, EclecticEntry>>;
  HOLE_STATS: Record<string, Record<string, HoleStatsData>>;
  TEE: unknown[];
  CROSS_DATA: Record<string, CrossPlayerData>;
  CURRENT_FED: string;
  HCP_INFO: HcpInfo;
  META: {
    lastUpdate: string;
    lastRoundDate: string;
    generatedDate: string;
    latestHcp: number | null;
    escalao: string;
    club: string;
  };
}

/* ─── Extracção de dados do HTML ─── */

function extractVar(scriptText: string, varName: string): string | null {
  // Find the line: var NAME = <JSON>;
  // Use greedy .+ so we match to the LAST semicolon on the line (avoids backtracking issues with large JSON)
  const regex = new RegExp(`var\\s+${varName}\\s*=\\s*(.+);\\s*$`, "m");
  const match = scriptText.match(regex);
  return match ? match[1].trimEnd() : null;
}

function parseVar<T>(scriptText: string, varName: string, fallback: T): T {
  const raw = extractVar(scriptText, varName);
  if (!raw) {
    console.warn(`[playerDataLoader] extractVar returned null for ${varName}`);
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`[playerDataLoader] Failed to parse ${varName} (${raw.length} chars, starts: ${raw.substring(0, 80)}...):`, e);
    return fallback;
  }
}

export async function loadPlayerData(fedId: string): Promise<PlayerPageData> {
  // Try data.json first (lightweight, generated by make-scorecards-ui.js)
  const jsonUrl = `/${fedId}/analysis/data.json`;
  try {
    const resp = await fetch(jsonUrl);
    if (resp.ok) {
      const raw = await resp.json();
      // Current HCP = post-round value from HCP_INFO (not pre-round r.hi)
      const latestHcp: number | null = raw.HCP_INFO?.current != null ? Number(raw.HCP_INFO.current) : null;

      const currentCross = raw.CROSS_DATA?.[raw.CURRENT_FED || fedId];
      // Club may be string or object {short, long}
      const clubRaw = currentCross?.club;
      const club = typeof clubRaw === "string" ? clubRaw
        : (clubRaw?.short || clubRaw?.long || "");

      const result: PlayerPageData = {
        DATA: raw.DATA || [],
        HOLES: raw.HOLES || {},
        EC: raw.EC || {},
        ECDET: raw.ECDET || {},
        HOLE_STATS: raw.HOLE_STATS || {},
        TEE: raw.TEE || [],
        CROSS_DATA: raw.CROSS_DATA || {},
        CURRENT_FED: raw.CURRENT_FED || fedId,
        HCP_INFO: raw.HCP_INFO || { current: null, lowHcp: null, softCap: null, hardCap: null, scoreAvg: null, qtyScores: null, qtyCalc: null, adjustTotal: null },
        META: {
          lastUpdate: raw.META?.lastUpdate || "",
          lastRoundDate: raw.META?.lastRoundDate || "",
          generatedDate: raw.META?.generatedDate || "",
          latestHcp,
          escalao: currentCross?.escalao || "",
          club,
        },
      };
      console.log(`[playerDataLoader] Loaded from data.json: DATA=${result.DATA.length} courses, CROSS_DATA=${Object.keys(result.CROSS_DATA).length} players`);
      return result;
    }
  } catch { /* fallback to HTML */ }

  // Fallback: parse HTML (backward compatibility)
  console.warn(`[playerDataLoader] data.json not found, falling back to HTML parsing`);
  const htmlUrl = `/${fedId}/analysis/by-course-ui.html`;
  const resp = await fetch(htmlUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${htmlUrl}`);
  const html = await resp.text();

  const scriptMatch = html.match(/<script>([\s\S]+)<\/script>/);
  if (!scriptMatch) throw new Error("No script block found in HTML");
  const script = scriptMatch[1];

  const result = {
    DATA: parseVar<CourseData[]>(script, "DATA", []),
    HOLES: parseVar<Record<string, HoleScores>>(script, "HOLES", {}),
    EC: parseVar<Record<string, EclecticEntry[]>>(script, "EC", {}),
    ECDET: parseVar<Record<string, Record<string, EclecticEntry>>>(script, "ECDET", {}),
    HOLE_STATS: parseVar<Record<string, Record<string, HoleStatsData>>>(script, "HOLE_STATS", {}),
    TEE: parseVar<unknown[]>(script, "TEE", []),
    CROSS_DATA: parseVar<Record<string, CrossPlayerData>>(script, "CROSS_DATA", {}),
    CURRENT_FED: parseVar<string>(script, "CURRENT_FED", fedId),
    HCP_INFO: parseVar<HcpInfo>(script, "HCP_INFO", {
      current: null, lowHcp: null, softCap: null, hardCap: null,
      scoreAvg: null, qtyScores: null, qtyCalc: null, adjustTotal: null,
    }),
  };

  // Extract META from HTML
  const lastUpdateMatch = html.match(/ltima actualiza[çc][ãa]o:\s*([^<]+)/i);
  const lastUpdate = lastUpdateMatch ? lastUpdateMatch[1].trim() : "";
  const lastRoundMatch = html.match(/Actualizado:\s*<b>([^<]+)<\/b>/i);
  const lastRoundDate = lastRoundMatch ? lastRoundMatch[1].trim() : "";
  const generatedMatch = html.match(/Gerado:\s*([^<\n]+)/i);
  const generatedDate = generatedMatch ? generatedMatch[1].trim() : "";

  // Current HCP = post-round value from HCP_INFO (not pre-round r.hi)
  const latestHcp: number | null = result.HCP_INFO?.current != null ? Number(result.HCP_INFO.current) : null;

  const currentCross = result.CROSS_DATA[result.CURRENT_FED || fedId];
  // Club may be string or object {short, long}
  const clubRaw = currentCross?.club;
  const club = typeof clubRaw === "string" ? clubRaw
    : (clubRaw?.short || clubRaw?.long || "");

  console.log(`[playerDataLoader] Loaded from HTML: DATA=${result.DATA.length} courses, CROSS_DATA=${Object.keys(result.CROSS_DATA).length} players`);

  return {
    ...result,
    META: { lastUpdate, lastRoundDate, generatedDate, latestHcp, escalao: currentCross?.escalao || "", club },
  };
}
