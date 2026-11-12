/**
 * egrCircuit.tsx — adapta os eventos EGR ao CircuitShell partilhado.
 *
 * Os eventos EGR (europeangolfrankings.com) trazem leaderboard de TOTAIS por
 * ronda (R1-R4) + país/clube, mas NÃO scorecards buraco-a-buraco. Por isso cada
 * evento vira uma `CircuitEntry` (lazy) com UMA `CircuitDivision` só com
 * `totals` (dados) — o shell passa-os ao TournamentDetail como prova sem
 * buraco a buraco (o mesmo Resumo de todas as provas). Sem React: o loader
 * serve também o Kids 2.
 *
 * Provas que nós temos inteiras noutra fonte (GolfBox: Suíça, Bélgica,
 * Bálticos, Albert Vermeiren; DGV, Faldo, Evian, condados ingleses…) — `egr-fontes-ricas.json`, gerado no prebuild —
 * mostram o ficheiro completo (cartões, clube, handicap, draw) dentro do evento
 * EGR, em vez de só os totais (Mariana, 04/11/2026: «fazer um merge da
 * informação e colocar lá também»).
 */
import { withDivisionModel } from "../../data/model/division";
import { cachedFetchJson, memoAsync } from "../../data/fetchCache";
import { normLoose } from "../../utils/normName";
import type { CircuitEntry, CircuitDivision, CircuitSex } from "../../ui/circuit/types";
import { jobFileDivisions, jobScorecardOptions, type JobFile } from "../../data/major/jobFile";

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
// `memoAsync`: uma carga por sessão; uma falha entrega o vazio mas não fica guardada.
const loadHcpMap = memoAsync(async (): Promise<Map<string, number>> => {
  const r = await cachedFetchJson<EgrRoster>("/data/egr/egr-dob-roster.json");
  const m = new Map<string, number>();
  for (const v of Object.values(r?.players || {})) if (typeof v.hcp === "number") m.set(normLoose(v.name), v.hcp);
  return m;
}, { fallback: () => new Map<string, number>() });
interface EgrEventFull {
  id: string; name: string; venue?: string; country?: string;
  ageGroup?: string; sex?: "M" | "F" | null; cr?: number | null; par?: number | null;
  startDateRaw?: string; endDateRaw?: string; sourceUrl?: string; players: EgrEventPlayer[];
}

/* ── A prova completa noutra fonte (quando a temos) ─────────────── */
/** Nome do link da prova na fonte, pelo endereço. */
function rotuloFonte(url: string): string {
  if (/golfbox\./i.test(url)) return "Livescoring GolfBox";
  if (/golf\.de/i.test(url)) return "golf.de (DGV)";
  if (/golfgenius\.com/i.test(url)) return "GolfGenius";
  if (/intelligentgolf/i.test(url)) return "intelligentgolf";
  return "Resultados na fonte";
}
/** `links`: o ficheiro completo e as classes; `paginas`: a página da prova aqui
 *  no site para as fontes com formato próprio (FFG, FIG, RFEG). */
interface EgrFontesRicas { links: Record<string, { file: string; divs: number[] }>; paginas?: Record<string, string> }
const loadFontesRicas = memoAsync(async (): Promise<EgrFontesRicas> => {
  const r = await cachedFetchJson<EgrFontesRicas>("/data/egr/egr-fontes-ricas.json");
  return { links: r?.links || {}, paginas: r?.paginas || {} };
}, { fallback: (): EgrFontesRicas => ({ links: {}, paginas: {} }) });

/** As divisões do JobFile que correspondem ao evento EGR, com cartões. */
async function divisoesRicas(e: EgrEventListItem, link: { file: string; divs: number[] }): Promise<CircuitDivision[] | null> {
  const f = await cachedFetchJson<JobFile>(link.file).catch(() => null);
  if (!f?.divisions?.length) return null;
  const todas = jobFileDivisions(f, [f], (dv) => dv.division, true);
  const escolhidas = link.divs.map((i) => todas[i]).filter((d): d is NonNullable<typeof d> => !!d && d.division.players.length > 0);
  if (!escolhidas.length) return null;
  return escolhidas.map((d) => withDivisionModel({
    key: d.key,
    escalao: e.ageGroup || d.label,
    tabLabel: d.label,
    sex: (e.sex || undefined) as CircuitSex | undefined,
    hasManuel: d.hasManuel,
    results: d.results,
    scOptions: jobScorecardOptions({ showRatings: true }),
    links: d.division.source ? [{ label: rotuloFonte(d.division.source), icon: "🔗", url: d.division.source }] : undefined,
  }));
}

/* ── Adapter: evento → divisão (lazy) ───────────────────────────── */
async function egrLoadDivisions(e: EgrEventListItem): Promise<CircuitDivision[]> {
  const ricas = await loadFontesRicas();
  const link = ricas.links[e.id];
  const pagina = ricas.paginas?.[e.id];
  if (link) {
    const rico = await divisoesRicas(e, link);
    if (rico) return rico;
  }
  const [ev, hcpMap] = await Promise.all([
    cachedFetchJson<EgrEventFull>(`/data/egr/events/egr_${e.id}.json`),
    loadHcpMap(),
  ]);
  const players = (ev?.players || []).map((p) => ({ ...p, _hcp: hcpMap.get(normLoose(p.name)) ?? null }));
  const totais = players.map((p) => ({ name: p.name, country: p.country, club: p.club, hcp: p._hcp ?? null,
    pos: p.posNum, rounds: [p.r1, p.r2, p.r3, p.r4], total: p.total }));
  const par = ev?.par ?? e.par ?? null;
  return [withDivisionModel({
    key: "main",
    escalao: e.ageGroup || "—",
    sex: (e.sex || undefined) as CircuitSex | undefined,
    hasManuel: e.hasManuel,
    // Só totais → prova sem buraco a buraco no Resumo comum (totalsDivisionView).
    totals: { players: totais, parPerRound: par, tournamentDate: e.startDate || undefined },
    // a mesma prova completa noutra página do site (FFG, FIG, RFEG)
    links: pagina ? [{ label: "Prova completa no site", icon: "📋", url: pagina, title: "Cartões, clubes e handicaps na página da federação, aqui no site" }] : undefined,
  })];
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
