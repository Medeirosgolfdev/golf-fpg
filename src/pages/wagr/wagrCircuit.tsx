/**
 * wagrCircuit.tsx — adapta os eventos WAGR ao CircuitShell partilhado.
 *
 * Os eventos WAGR (wagr.com) trazem leaderboard de TOTAIS por ronda (R1-R4) +
 * país e pontos WAGR, mas NÃO scorecards buraco-a-buraco e NÃO o par do campo.
 * Por isso cada evento vira uma `CircuitEntry` (lazy) com UMA `CircuitDivision`
 * só com `totals` (dados: jogadores, aviso e a coluna PTS) — o shell desenha o
 * TotalsResumo partilhado, o mesmo do EGR/GJGL/LGPIDF. Zero tabelas próprias.
 *
 * ⚠ Sem par → `hideTotals` (esconde as colunas ± e Tot do shell) e o Total
 *   entra como coluna própria, ao lado dos pontos WAGR.
 * ⚠ O leaderboard é PARCIAL: só os jogadores que pontuaram no WAGR. Um
 *   Nacional de Jovens com 60 inscritos pode dar 4 linhas — daí o aviso no
 *   `metaLine`, para não se ler a tabela como o campo todo.
 */
import { withDivisionModel } from "../../data/model/division";
import { cachedFetchJson } from "../../data/fetchCache";
import type { CircuitEntry, CircuitDivision, CircuitSex } from "../../ui/circuit/types";

/* ── Tipos dos dados WAGR ───────────────────────────────────────── */
export interface WagrEventListItem {
  id: string;
  name: string;
  course: string | null;
  country: string;
  /** Junior / All Ages / Collegiate / MidAm / Senior / Pro / Other. */
  eventType: string;
  format: string | null;
  sex: "M" | "F" | "Mixed" | null;
  startDate: string | null;
  endDate: string | null;
  year: number | null;
  /** "Power" do evento — a força do campo segundo o WAGR. */
  power: number | null;
  rounds: number;
  playerCount: number;
  countryCount: number;
  hasPt: boolean;
}
export interface WagrEventsList { generatedAt: string; total: number; events: WagrEventListItem[] }

export interface WagrEventPlayer {
  id: string | null;
  pos: string | number | null;
  posNum: number | null;
  name: string;
  country: string | null;
  r1: number | null; r2: number | null; r3: number | null; r4: number | null;
  total: number | null;
  points: number | null;
}
interface WagrEventFull {
  id: string; name: string | null; country: string | null; region: string | null;
  eventType: string | null; format: string | null; sex: "M" | "F" | "Mixed" | null;
  organiser: string | null; startDate: string | null; endDate: string | null;
  week: string | null; power: number | null; spRounds: number | null; mpRounds: number | null;
  courses?: string[]; winner?: string | null; url?: string;
  players: WagrEventPlayer[];
}

export const WAGR_SITE = "https://www.wagr.com";
/** ⚠ O slug da URL do evento é decorativo — só o id final conta. */
export const wagrEventUrl = (id: string | number) => `${WAGR_SITE}/events/x-${id}`;
export const wagrPlayerUrl = (link: string) => `${WAGR_SITE}/playerprofile/${link}`;

/* ── Adapter: evento → divisão (lazy) ───────────────────────────── */
async function wagrLoadDivisions(e: WagrEventListItem): Promise<CircuitDivision[]> {
  const ev = await cachedFetchJson<WagrEventFull>(`/data/wagr/events/wagr_${e.id}.json`);
  const players = ev?.players || [];
  return [withDivisionModel({
    key: "main",
    escalao: e.eventType || "—",
    sex: (e.sex || undefined) as CircuitSex | undefined,
    // Só totais → o shell desenha o TotalsResumo comum (ui/circuit/divisionPieces).
    // O WAGR não publica o par do campo (sem ±par) e só traz quem pontuou.
    totals: {
      players: totaisWagr(players), parPerRound: null, tournamentDate: e.startDate || undefined,
      notice: { kind: "aviso", title: "O WAGR só publica os jogadores que pontuaram no ranking — não é o campo todo.",
        text: `⚠ Só os classificados que pontuaram no WAGR (${players.length}) — não é o campo completo.` },
      extra: [{ header: "PTS", title: "Pontos WAGR ganhos no evento", field: "points", decimals: 2 }],
    },
  })];
}

/** Jogadores de um evento WAGR no formato da tabela de totais (e do `totals`). */
function totaisWagr(players: { name: string; country?: string | null; posNum?: number | null; r1?: number | null; r2?: number | null; r3?: number | null; r4?: number | null; total?: number | null; points?: number | null }[]) {
  return players.map((p) => ({ name: p.name, country: p.country, pos: p.posNum,
    rounds: [p.r1 ?? null, p.r2 ?? null, p.r3 ?? null, p.r4 ?? null], total: p.total, points: p.points }));
}

/* ── Constrói as CircuitEntry a partir do índice de eventos ─────── */
export function buildWagrEntries(list: WagrEventListItem[]): CircuitEntry[] {
  return list.map((e) => ({
    id: `evt:${e.id}`,
    year: e.year,
    name: e.name,
    source: "wagr",
    course: e.course || undefined,
    federation: e.country || undefined,
    dateStart: e.startDate || undefined,
    dateEnd: e.endDate || undefined,
    sourceUrl: wagrEventUrl(e.id),
    escalao: e.eventType || undefined,
    sex: (e.sex || undefined) as CircuitSex | undefined,
    intl: e.countryCount >= 4,
    playerCount: e.playerCount,
    roundsCount: e.rounds || undefined,
    divisionCount: 1,
    hasPt: e.hasPt,
    hasResults: true,
    loadDivisions: () => wagrLoadDivisions(e),
  }));
}
