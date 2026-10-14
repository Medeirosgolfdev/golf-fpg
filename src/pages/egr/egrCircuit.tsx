/**
 * egrCircuit.tsx — adapta os eventos EGR ao CircuitShell partilhado.
 *
 * Os eventos EGR (europeangolfrankings.com) trazem leaderboard de TOTAIS por
 * ronda (R1-R4) + país/clube, mas NÃO scorecards buraco-a-buraco. Por isso cada
 * evento vira uma `CircuitEntry` (lazy) com UMA `CircuitDivision` cujo
 * `customResults` é o `ScorecardLeaderboard` partilhado sem scorecard — o mesmo
 * padrão do RFEG (NCResultsLeaderboard) e do GJGL. Zero tabelas próprias.
 */
import { cachedFetchJson } from "../../data/fetchCache";
import TotalsResumo from "../../ui/circuit/TotalsResumo";
import type { CircuitEntry, CircuitDivision, CircuitSex } from "../../ui/circuit/types";

/* ── Tipos dos dados EGR ────────────────────────────────────────── */
export interface EgrEventListItem {
  id: string;
  name: string;
  venue: string | null;
  sourceUrl: string | null;
  ageGroup: string;
  ageNum: number | null;
  sex: "M" | "F" | null;
  country: string;
  startDate: string | null;
  endDate: string | null;
  year: number | null;
  egrPoints: number | null;
  cr: number | null;
  par: number | null;
  rounds: number;
  playerCount: number;
  countryCount: number;
  hasPt: boolean;
  hasManuel: boolean;
}
export interface EgrEventsList { generatedAt: string; total: number; events: EgrEventListItem[] }

interface EgrEventPlayer {
  id: string; pos: string | number | null; posNum: number | null;
  name: string; country: string | null; club: string | null;
  ageGroup: string | null; egrRank: number | null;
  r1: number | null; r2: number | null; r3: number | null; r4: number | null;
  total: number | null; egrPoints: number | null;
  /** HCP juntado do egr-dob-roster (índice ATUAL, não à data do torneio; ~22-40% cobertura). */
  _hcp?: number | null;
}

/* ── HCP do roster GolfBox (egr-dob-roster.json), por nome. O leaderboard EGR
 *  não traz HCP; junta-se aqui o índice actual onde existir. Carrega 1× (cache). */
interface EgrRoster { players: Record<string, { name: string; hcp?: number | null }> }
const normNm = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
let _hcpMapPromise: Promise<Map<string, number>> | null = null;
function loadHcpMap(): Promise<Map<string, number>> {
  if (!_hcpMapPromise) {
    _hcpMapPromise = cachedFetchJson<EgrRoster>("/data/egr/egr-dob-roster.json")
      .then((r) => {
        const m = new Map<string, number>();
        for (const v of Object.values(r?.players || {})) if (typeof v.hcp === "number") m.set(normNm(v.name), v.hcp);
        return m;
      })
      .catch(() => new Map<string, number>());
  }
  return _hcpMapPromise;
}
interface EgrEventFull {
  id: string; name: string; venue?: string; country?: string;
  ageGroup?: string; sex?: "M" | "F" | null; cr?: number | null; par?: number | null;
  startDateRaw?: string; endDateRaw?: string; sourceUrl?: string; players: EgrEventPlayer[];
}

/* ── Adapter: evento → divisão (lazy) ───────────────────────────── */
async function egrLoadDivisions(e: EgrEventListItem): Promise<CircuitDivision[]> {
  const [ev, hcpMap] = await Promise.all([
    cachedFetchJson<EgrEventFull>(`/data/egr/events/egr_${e.id}.json`),
    loadHcpMap(),
  ]);
  const players = (ev?.players || []).map((p) => ({ ...p, _hcp: hcpMap.get(normNm(p.name)) ?? null }));
  return [{
    key: "main",
    escalao: e.ageGroup || "—",
    tabLabel: e.ageGroup ? `${e.ageGroup}${e.sex ? (e.sex === "F" ? " ♀" : " ♂") : ""}` : undefined,
    sex: (e.sex || undefined) as CircuitSex | undefined,
    hasManuel: e.hasManuel,
    // Resumo comum das fontes só com totais (14/10/2026).
    customResults: <TotalsResumo parPerRound={ev?.par ?? e.par ?? null} tournamentDate={e.startDate || undefined}
      players={players.map((p) => ({ name: p.name, country: p.country, club: p.club, hcp: p._hcp ?? null,
        pos: p.posNum, rounds: [p.r1, p.r2, p.r3, p.r4], total: p.total }))} />,
  }];
}

/* ── Constrói as CircuitEntry a partir do índice de eventos ─────── */
export function buildEgrEntries(list: EgrEventListItem[]): CircuitEntry[] {
  return list.map((e) => ({
    id: `evt:${e.id}`,
    year: e.year,
    name: e.name,
    source: "egr",
    course: e.venue || undefined,
    federation: e.country || undefined,
    dateStart: e.startDate || undefined,
    dateEnd: e.endDate || undefined,
    sourceUrl: e.sourceUrl || undefined,
    escalao: e.ageGroup || undefined,
    sex: (e.sex || undefined) as CircuitSex | undefined,
    intl: e.countryCount >= 4,
    playerCount: e.playerCount,
    roundsCount: e.rounds || undefined,
    divisionCount: 1,
    hasPt: e.hasPt,
    hasManuel: e.hasManuel,
    hasResults: true,
    loadDivisions: () => egrLoadDivisions(e),
  }));
}
