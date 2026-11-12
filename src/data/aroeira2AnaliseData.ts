/**
 * aroeira2AnaliseData.ts
 *
 * Funções de agregação para a tab "Análise" do torneio PJA Aroeira Masters 2026
 * (ccode=029, tcode=10543, campo PGA Aroeira No.2). Junta:
 *
 *   1. Histórico do Manuel no Aroeira II (todas as rondas)
 *   2. Top 21 do torneio + histórico individual no Aroeira II
 *   3. Inscritos no Nacional Sub-12 2026 (tcode 10941) que já jogaram Aroeira II
 *   4. Hot-spots hole-by-hole (Manuel vs field)
 *
 * Fontes de dados:
 *   - jovens_2026.json e jovens_2025.json
 *   - pull-torneios000.json e pull-torneios003.json
 *   - drive-data-YYYY-MM.json (PJA Aroeira April 2026)
 *   - fpg-admissions-draws.json (lista de inscritos Sub-12 Nacional)
 *
 * Critério de matching de campo:
 *   `course` ou `campo` normalizado contém "aroeirano2", "aroeira2" ou "aroeiraii".
 */

import type { Tournament } from "./fpgTypes";
import { cachedFetchJson } from "./fetchCache";
import { fmtToPar, fmtSign } from "../utils/format";
import { meanArr, soma, somaDe } from "../utils/mathUtils";
import { compareNullsLast } from "../hooks/useSort";
import { MANUEL_FED, isManuel as isManuelPlayer } from "../constants/manuel";
import { normLoose } from "../utils/normName";
import { isNoCardGross } from "./intlCommon";

const SUB12_NACIONAL_2026_TCODE = "10941"; // Campeonato Nacional de Jovens Sub 12 H

/* ── Helpers de normalização ─────────────────────────────────── */

function normCourse(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/\s+/g, "").replace(/[-.]/g, "");
}

const AROEIRA2_NORMS = ["pgaaroeirano2", "pgaaroeira2", "aroeirano2", "aroeira2", "aroeiraii"];

function isAroeiraIICourse(courseOrCampo: string | null | undefined): boolean {
  const n = normCourse(courseOrCampo);
  return AROEIRA2_NORMS.some(k => n.includes(k));
}

const normName = (s: string | null | undefined): string => normLoose(s || "");

/* ── Estruturas devolvidas ────────────────────────────────────── */

export interface PlayerRoundOnCourse {
  fedCode: string | null;
  name: string;
  club: string;
  hcpExact: number | null | undefined;
  date: string;                   // YYYY-MM-DD
  tournamentName: string;
  ccode: string;
  tcode: string;
  round: number;
  gross: number | null;
  toPar: number | null;
  scores: number[];               // hole-by-hole, len=18 ou len=9
  pars: number[];
  si?: number[];
}

interface CompareRow {
  fedCode: string | null;
  name: string;
  club: string;
  hcpExact: number | null;
  /** Nº de rondas no Aroeira II (incluindo o torneio actual) */
  nRounds: number;
  /** Média de gross das rondas (todas) */
  avgGross: number | null;
  /** Melhor gross */
  bestGross: number | null;
  /** Média do toPar das rondas */
  avgToPar: number | null;
  /** Apenas rondas anteriores ao torneio actual (histórico estrito) */
  priorRounds: PlayerRoundOnCourse[];
  /** Rondas no torneio actual */
  currentRounds: PlayerRoundOnCourse[];
}

interface HoleHotSpot {
  hole: number;            // 1..18
  par: number;
  /** Média do field (todos os jogadores Top21 + Sub12 com dados) */
  fieldAvg: number;
  /** Média do field menos o par (positivo = field perde pancadas) */
  fieldDelta: number;
  /** Score médio do Manuel neste buraco (todas as rondas Aroeira II) */
  manuelAvg: number | null;
  /** Diferença Manuel vs field (positivo = Manuel pior) */
  manuelVsField: number | null;
  /** Stroke index (1=mais difícil, 18=mais fácil) — primeira ronda válida */
  si: number | null;
}

export interface AnalisePackage {
  tournament: Tournament;       // o torneio actual (029/10543)
  manuelHistory: PlayerRoundOnCourse[];
  top21Compare: CompareRow[];   // 21 jogadores ordenados pela posição final
  sub12Inscritos: CompareRow[]; // inscritos Sub-12 com pelo menos 1 ronda Aroeira II
  hotSpots: HoleHotSpot[];      // 18 buracos
  parReference: number[];       // pars do torneio actual (R1)
  siReference: number[];        // SI do torneio actual (R1)
}

/* ── Extracção de rondas a partir de um Tournament ────────────── */

function extractPlayerRounds(t: Tournament): PlayerRoundOnCourse[] {
  const out: PlayerRoundOnCourse[] = [];
  if (!isAroeiraIICourse((t as any).campo) && !isAroeiraIICourse((t as any).course)) return out;
  for (const p of (t.players || [])) {
    if (!p.roundScores || p.roundScores.length === 0) continue;
    for (const rs of p.roundScores) {
      if (!rs.scores || rs.scores.length === 0) continue;
      // Filtrar rondas inválidas (todos zeros, «sem cartão» ≥ 900, ou WD)
      if (rs.gross == null || isNoCardGross(rs.gross)) continue;
      if (rs.scores.every(s => s === 0)) continue;
      const pars = rs.pars && rs.pars.length ? rs.pars : (p.par || []);
      if (!pars.length) continue;
      const parTot = soma(pars);
      out.push({
        fedCode: p.fedCode || null,
        name: p.name,
        club: p.club || "",
        hcpExact: p.hcpExact,
        date: t.date || "",
        tournamentName: t.name || "",
        ccode: t.ccode || "",
        tcode: t.tcode || "",
        round: rs.round,
        gross: rs.gross,
        toPar: parTot ? rs.gross - parTot : null,
        scores: rs.scores.slice(0, 18),
        pars: pars.slice(0, 18),
        si: rs.si && rs.si.length ? rs.si.slice(0, 18) : undefined,
      });
    }
  }
  return out;
}

/* ── Loader principal ─────────────────────────────────────────── */

interface AdmissionsFile {
  tournaments: Array<{
    ccode: string; tcode: string;
    admissions?: { players?: Array<{ fed: string; nome: string; clube?: string; hcp?: number }> };
  }>;
}

interface PullFile { tournaments: Tournament[] }

/** Ficheiros onde procurar provas jogadas no Aroeira II (a lista estava escrita duas vezes). */
const FONTES_AROEIRA = [
  "/data/jovens_2026.json",
  "/data/jovens_2025.json",
  "/data/pull-torneios000.json",
  "/data/pull-torneios003.json",
  "/data/drive-data-2026-04.json",
  "/data/drive-data-2026-03.json",
  "/data/drive-data-2025-02.json",
];

/** Os torneios de todas as fontes, pela cache global (`cachedFetchJson`: cada ficheiro
 *  pede-se uma só vez). Ficheiro que não existe ou falha fica de fora. SÓ LEITURA —
 *  os objectos são os da cache, partilhados com quem mais os pedir. */
async function torneiosDasFontes(): Promise<Tournament[]> {
  const ficheiros = await Promise.all(FONTES_AROEIRA.map(src => cachedFetchJson<PullFile>(src).catch(() => null)));
  return ficheiros.flatMap(j => j?.tournaments ?? []);
}

type InscritoSub12 = NonNullable<NonNullable<AdmissionsFile["tournaments"][number]["admissions"]>["players"]>[number];

/** Inscritos do Campeonato Nacional Sub-12 H 2026 (o ficheiro era pedido três vezes). */
async function inscritosSub12Nacional(): Promise<InscritoSub12[]> {
  const adm = await cachedFetchJson<AdmissionsFile>("/data/fpg-admissions-draws.json").catch(() => null);
  return adm?.tournaments?.find(t => t.ccode === "000" && t.tcode === SUB12_NACIONAL_2026_TCODE)?.admissions?.players ?? [];
}

/** As voltas jogadas no Aroeira II, de uma lista de torneios. Uma entrada por prova
 *  (ccode/tcode): quando a mesma vem de dois ficheiros fica a que tem mais voltas
 *  (em caso de empate, a primeira da lista). */
function voltasNoAroeiraII(torneios: Tournament[]): PlayerRoundOnCourse[] {
  const nVoltas = (t: Tournament) => somaDe((t.players || []), p => (p.roundScores?.length || 0));
  const porProva = new Map<string, Tournament>();
  for (const t of torneios) {
    if (!isAroeiraIICourse((t as any).campo) && !isAroeiraIICourse((t as any).course)) continue;
    const k = `${t.ccode}/${t.tcode}`;
    const cur = porProva.get(k);
    if (!cur || nVoltas(t) > nVoltas(cur)) porProva.set(k, t);
  }
  const out: PlayerRoundOnCourse[] = [];
  for (const t of porProva.values()) out.push(...extractPlayerRounds(t));
  return out;
}

/** Só as voltas de 18 buracos com cartão cujo par, buraco a buraco, é o do torneio actual
 *  (routing de Nov 2025+) — garante que B1, B2… são fisicamente os mesmos buracos.
 *  Volta sem pares conhecidos passa. */
function voltasNoRoutingActual(allRounds: PlayerRoundOnCourse[], parRef: number[]): PlayerRoundOnCourse[] {
  const parKey = parRef.join(",");
  return allRounds.filter(r => {
    if (r.scores.length !== 18) return false;
    if (r.gross == null || isNoCardGross(r.gross)) return false;
    if (!r.pars || r.pars.length !== 18) return true;
    return r.pars.join(",") === parKey;
  });
}

async function loadAroeiraIIAnalise(currentTournament: Tournament): Promise<AnalisePackage> {
  const allTournaments: Tournament[] = await torneiosDasFontes();

  // Add current tournament too (if not already in list)
  const ccTc = (t: Tournament) => `${t.ccode}/${t.tcode}`;
  const seenKeys = new Set(allTournaments.map(ccTc));
  if (!seenKeys.has(ccTc(currentTournament))) allTournaments.push(currentTournament);

  // Todas as voltas jogadas no Aroeira II (uma entrada por prova).
  const allRounds = voltasNoAroeiraII(allTournaments);

  // Manuel history
  const manuelHistory = allRounds
    .filter(r => isManuelPlayer({ fed: r.fedCode ?? undefined, name: r.name }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top 21: jogadores do torneio actual, com histórico anterior
  const currentKey = ccTc(currentTournament);
  const top21Compare: CompareRow[] = [];
  const currentPlayers = currentTournament.players || [];
  for (const p of currentPlayers) {
    const fedKey = p.fedCode || null;
    const nKey = normName(p.name);
    const playerRounds = allRounds.filter(r =>
      (fedKey && r.fedCode === fedKey) ||
      (!fedKey && normName(r.name) === nKey)
    );
    const priorRounds = playerRounds.filter(r => `${r.ccode}/${r.tcode}` !== currentKey);
    const currentRounds = playerRounds.filter(r => `${r.ccode}/${r.tcode}` === currentKey);
    const validGross = playerRounds.map(r => r.gross).filter((g): g is number => g != null);
    const validToPar = playerRounds.map(r => r.toPar).filter((t): t is number => t != null);
    top21Compare.push({
      fedCode: fedKey,
      name: p.name,
      club: p.club || "",
      hcpExact: p.hcpExact ?? null,
      nRounds: playerRounds.length,
      avgGross: meanArr(validGross),
      bestGross: validGross.length ? Math.min(...validGross) : null,
      avgToPar: meanArr(validToPar),
      priorRounds, currentRounds,
    });
  }

  // Sub-12 inscritos no Nacional 2026 (tcode 10941)
  const sub12Inscritos: CompareRow[] = [];
  const top21Feds = new Set(top21Compare.map(c => c.fedCode).filter(Boolean));
  for (const ins of await inscritosSub12Nacional()) {
    if (top21Feds.has(ins.fed)) continue; // já está no Top 21
    const playerRounds = allRounds.filter(r => r.fedCode === ins.fed);
    if (playerRounds.length === 0) continue; // só os que JÁ jogaram Aroeira II
    const validGross = playerRounds.map(r => r.gross).filter((g): g is number => g != null);
    const validToPar = playerRounds.map(r => r.toPar).filter((t): t is number => t != null);
    sub12Inscritos.push({
      fedCode: ins.fed, name: ins.nome, club: ins.clube || "",
      hcpExact: typeof ins.hcp === "number" ? ins.hcp : null,
      nRounds: playerRounds.length,
      avgGross: meanArr(validGross),
      bestGross: validGross.length ? Math.min(...validGross) : null,
      avgToPar: meanArr(validToPar),
      priorRounds: playerRounds, currentRounds: [],
    });
  }
  sub12Inscritos.sort((a, b) => compareNullsLast(a.avgGross, b.avgGross, 1));

  // Hot-spots hole-by-hole (Manuel vs field do torneio actual)
  const par18 = currentTournament.players?.[0]?.roundScores?.[0]?.pars?.slice(0, 18) ?? [];
  const si18 = currentTournament.players?.[0]?.roundScores?.[0]?.si?.slice(0, 18) ?? [];
  const hotSpots: HoleHotSpot[] = [];
  // Field rounds = todas rondas do torneio actual (todos os 21 jogadores)
  const fieldRoundsCurrent = (currentTournament.players || []).flatMap(p => (p.roundScores || []).filter(rs => rs.scores && rs.scores.length === 18 && !isNoCardGross(rs.gross) && !rs.scores.every(s => s === 0)));
  const manuelRoundsAll = manuelHistory.filter(r => r.scores.length === 18);

  for (let h = 0; h < 18; h++) {
    const fieldVals = fieldRoundsCurrent.map(rs => rs.scores[h]).filter(s => s > 0);
    const fieldAvg = fieldVals.length ? soma(fieldVals) / fieldVals.length : 0;
    const manuelVals = manuelRoundsAll.map(r => r.scores[h]).filter(s => s > 0);
    const manuelAvg = meanArr(manuelVals);
    const par = par18[h] ?? 4;
    hotSpots.push({
      hole: h + 1, par,
      fieldAvg, fieldDelta: fieldAvg - par,
      manuelAvg, manuelVsField: manuelAvg != null ? manuelAvg - fieldAvg : null,
      si: si18[h] ?? null,
    });
  }

  return {
    tournament: currentTournament,
    manuelHistory,
    top21Compare,
    sub12Inscritos,
    hotSpots,
    parReference: par18,
    siReference: si18,
  };
}

/* ────────────────────────────────────────────────────────────
   MAPA DO CAMPO — distribuição por buraco
   ──────────────────────────────────────────────────────────── */

export interface HoleDistribution {
  hole: number;
  par: number;
  si: number | null;
  meters: number | null;
  /** Total de rondas que jogaram este buraco (excluindo zeros / picks) */
  n: number;
  /** % de scores ≤ par-1 (birdie ou eagle) */
  pctBirdiePlus: number;
  /** % de pares */
  pctPar: number;
  /** % de bogeys */
  pctBogey: number;
  /** % de duplo bogey ou pior */
  pctDoublePlus: number;
  /** Score médio (decimal) */
  avgScore: number;
  /** Score mais comum (modal) */
  modalScore: number;
  /** Score do Manuel: média (todas as rondas históricas + actuais) */
  manuelAvg: number | null;
  manuelN: number;
  /**
   * Label classificativa do buraco:
   *   "birdie"  → >= 20% birdies+ (oportunidade)
   *   "par"     → modal=par e ≥40% pares (manter)
   *   "bogey"   → modal=bogey OU >50% bogey+duplo+ (defender)
   *   "danger"  → ≥25% duplo+ (cuidado redobrado)
   */
  label: "birdie" | "par" | "bogey" | "danger";
}

interface HoleStats {
  perHole: HoleDistribution[];
  /** Total de rondas usadas no cálculo (todas) */
  totalRounds: number;
  /** Distância total do campo (m), se disponível */
  totalMeters: number;
}

/**
 * Constrói o mapa do campo a partir de TODAS as rondas reunidas.
 * Inclui todas as rondas de todos os jogadores no Aroeira II — o "field"
 * verdadeiro do campo, não só do torneio actual.
 */
function buildHoleStats(
  allRounds: PlayerRoundOnCourse[],
  parRef: number[],
  siRef: number[],
  metersRef: number[] | null = null,
): HoleStats {
  const perHole: HoleDistribution[] = [];
  let totalMeters = 0;
  // 1) Filtrar pelo routing actual (Nov 2025+) — só rondas cuja sequencia de
  // pars bate com a do torneio actual. Garante que B1, B2, etc. são fisicamente
  // os mesmos buracos.
  const valid = voltasNoRoutingActual(allRounds, parRef);
  const manuelRounds = valid.filter(r => isManuelPlayer({ fed: r.fedCode ?? undefined, name: r.name }));

  for (let h = 0; h < 18; h++) {
    const par = parRef[h] ?? 4;
    // Score frequencies para o field todo
    const scoresField: number[] = [];
    for (const r of valid) {
      const s = r.scores[h];
      if (s > 0) scoresField.push(s);
    }
    const n = scoresField.length;
    let nB = 0, nP = 0, nBog = 0, nDb = 0;
    const freq: Record<number, number> = {};
    for (const s of scoresField) {
      const d = s - par;
      if (d <= -1) nB++;
      else if (d === 0) nP++;
      else if (d === 1) nBog++;
      else nDb++;
      freq[s] = (freq[s] ?? 0) + 1;
    }
    const sum = soma(scoresField);
    const avg = n ? sum / n : 0;
    const modal = n ? Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]) : par;
    const pctB = n ? (nB / n) * 100 : 0;
    const pctP = n ? (nP / n) * 100 : 0;
    const pctBog = n ? (nBog / n) * 100 : 0;
    const pctDb = n ? (nDb / n) * 100 : 0;

    // Manuel
    const manuelVals = manuelRounds.map(r => r.scores[h]).filter(s => s > 0);
    const manuelAvg = meanArr(manuelVals);

    // Label
    let label: HoleDistribution["label"];
    if (pctDb >= 25) label = "danger";
    else if (pctB >= 20) label = "birdie";
    else if (pctBog + pctDb >= 50 || modal === par + 1) label = "bogey";
    else label = "par";

    const meters = (metersRef && metersRef[h]) ? metersRef[h] : null;
    if (meters) totalMeters += meters;
    perHole.push({
      hole: h + 1, par, si: siRef[h] ?? null, meters,
      n, pctBirdiePlus: pctB, pctPar: pctP, pctBogey: pctBog, pctDoublePlus: pctDb,
      avgScore: avg, modalScore: modal,
      manuelAvg, manuelN: manuelVals.length,
      label,
    });
  }
  return { perHole, totalRounds: valid.length, totalMeters };
}

/* ────────────────────────────────────────────────────────────
   SCORECARDS POR JOGADOR — todas as rondas no Aroeira II
   ──────────────────────────────────────────────────────────── */

export interface PlayerScorecardBundle {
  fedCode: string | null;
  name: string;
  club: string;
  hcpExact: number | null;
  /** Categoria: "top21" (jogou este FdS) ou "sub12_inscrito" (vai jogar Nacional) */
  category: "top21" | "sub12_inscrito";
  /** Nº de rondas no Aroeira II (todas, históricas + actual) */
  nRounds: number;
  avgGross: number | null;
  bestGross: number | null;
  avgToPar: number | null;
  /** Posição final no PJA Aroeira Masters 2026 (só se top21) */
  currentPos: number | string | null;
  rounds: PlayerRoundOnCourse[];
}

/**
 * Reunir scorecards detalhados (com hole-by-hole) por jogador.
 * Top 21: ordenados pela posição final no torneio actual.
 * Sub-12 inscritos: ordenados por avgGross (melhor primeiro).
 */
function buildPlayerScorecards(
  pkg: AnalisePackage,
  allRounds: PlayerRoundOnCourse[],
): PlayerScorecardBundle[] {
  const out: PlayerScorecardBundle[] = [];
  const top21Players = pkg.tournament.players || [];
  const seen = new Set<string>();

  // Top 21
  for (const p of top21Players) {
    const fed = p.fedCode || null;
    const nKey = normName(p.name);
    const key = fed || nKey;
    if (seen.has(key)) continue;
    seen.add(key);
    const rounds = allRounds
      .filter(r => (fed ? r.fedCode === fed : normName(r.name) === nKey))
      .sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round);
    const validG = rounds.map(r => r.gross).filter((g): g is number => g != null);
    const validTp = rounds.map(r => r.toPar).filter((t): t is number => t != null);
    out.push({
      fedCode: fed, name: p.name, club: p.club || "",
      hcpExact: p.hcpExact ?? null,
      category: "top21",
      nRounds: rounds.length,
      avgGross: meanArr(validG),
      bestGross: validG.length ? Math.min(...validG) : null,
      avgToPar: meanArr(validTp),
      currentPos: typeof p.pos !== "undefined" ? (p.pos as any) : null,
      rounds,
    });
  }

  // Sub-12 inscritos com histórico
  for (const c of pkg.sub12Inscritos) {
    const key = c.fedCode || normName(c.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      fedCode: c.fedCode, name: c.name, club: c.club,
      hcpExact: c.hcpExact, category: "sub12_inscrito",
      nRounds: c.priorRounds.length,
      avgGross: c.avgGross, bestGross: c.bestGross, avgToPar: c.avgToPar,
      currentPos: null,
      rounds: c.priorRounds,
    });
  }
  return out;
}

/**
 * Função top-level que chama loadAroeiraIIAnalise + buildHoleStats + buildPlayerScorecards
 * e devolve o pacote completo enriquecido.
 */
export interface RichAnalisePackage extends AnalisePackage {
  holeStats: HoleStats;
  playerCards: PlayerScorecardBundle[];
}

export async function loadRichAroeiraIIAnalise(currentTournament: Tournament): Promise<RichAnalisePackage> {
  const pkg = await loadAroeiraIIAnalise(currentTournament);
  // As mesmas fontes (já em cache), agora com a prova aberta à frente.
  const allTournaments: Tournament[] = [currentTournament, ...(await torneiosDasFontes())];
  const allRounds = voltasNoAroeiraII(allTournaments);

  // metros do torneio actual (R1)
  const refRound = currentTournament.players?.[0]?.roundScores?.[0];
  const metersRef = refRound?.meters && refRound.meters.length === 18 ? refRound.meters.slice(0, 18) : null;

  const holeStats = buildHoleStats(allRounds, pkg.parReference, pkg.siReference, metersRef);
  const playerCards = buildPlayerScorecards(pkg, allRounds);
  return { ...pkg, holeStats, playerCards };
}

/* ────────────────────────────────────────────────────────────
   ANÁLISES AVANÇADAS — KPIs, dificuldade, par-3/4/5, teórica
   ──────────────────────────────────────────────────────────── */

export interface KPI {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "danger" | "neutral";
}

export interface ParGroupStats {
  group: "Par 3" | "Par 4" | "Par 5";
  count: number;             // nº de buracos deste tipo
  fieldAvg: number;          // score médio field
  fieldDelta: number;        // fieldAvg - par
  manuelAvg: number | null;
  manuelDelta: number | null;
  pctBirdiePlus: number;     // % field
  pctBogey: number;
  pctDoublePlus: number;
}

export interface ManuelHoleStats {
  hole: number;
  par: number;
  scores: number[];          // todas as instâncias jogadas pelo Manuel
  avg: number;
  best: number;
  worst: number;
  sd: number;                // desvio padrão
  consistency: "alta" | "média" | "baixa";  // <0.7 alta, 0.7-1.4 média, >=1.4 baixa
}

export function buildKPIs(pkg: AnalisePackage, holes: HoleDistribution[]): KPI[] {
  const out: KPI[] = [];
  // Total rondas analisadas
  const totalRounds = holes[0]?.n || 0;
  out.push({ label: "Rondas analisadas", value: String(totalRounds), hint: "Todas as rondas no PGA Aroeira No.2 nos JSONs.", tone: "neutral" });

  // Buraco mais difícil / mais fácil (delta vs par)
  const sortedHard = [...holes].sort((a, b) => (b.avgScore - b.par) - (a.avgScore - a.par));
  if (sortedHard[0]) {
    out.push({ label: "Buraco mais difícil", value: "B" + sortedHard[0].hole, hint: `Avg ${sortedHard[0].avgScore.toFixed(2)} (par ${sortedHard[0].par}, +${(sortedHard[0].avgScore - sortedHard[0].par).toFixed(2)})`, tone: "danger" });
    const easiest = sortedHard[sortedHard.length - 1];
    out.push({ label: "Buraco mais fácil", value: "B" + easiest.hole, hint: `Avg ${easiest.avgScore.toFixed(2)} (par ${easiest.par}, ${(easiest.avgScore - easiest.par).toFixed(2)})`, tone: "good" });
  }

  // Manuel: melhor ronda
  const validManuel = pkg.manuelHistory.filter(r => r.gross != null && r.scores.length === 18);
  if (validManuel.length) {
    const best = validManuel.reduce((b, r) => (r.gross! < b.gross! ? r : b), validManuel[0]);
    out.push({ label: "⭐ Melhor ronda", value: String(best.gross), hint: `${best.date.slice(0, 10)} (${fmtToPar(best.toPar ?? 0)}) — ${best.tournamentName}`, tone: "good" });
  }
  // Manuel: ronda mais recente
  const sortedRecent = [...validManuel].sort((a, b) => b.date.localeCompare(a.date) || b.round - a.round);
  if (sortedRecent[0]) {
    const r0 = sortedRecent[0];
    out.push({ label: "⭐ Última ronda", value: String(r0.gross), hint: `${r0.date.slice(0, 10)} R${r0.round} (${fmtToPar(r0.toPar ?? 0)})`, tone: r0.toPar != null && r0.toPar <= 7 ? "good" : r0.toPar != null && r0.toPar <= 15 ? "warn" : "danger" });
  }
  // Manuel: tendência (avg primeiras 3 vs últimas 2)
  if (validManuel.length >= 3) {
    const sortedByDate = [...validManuel].sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round);
    const earlier = sortedByDate.slice(0, Math.max(1, Math.floor(sortedByDate.length / 2)));
    const recent = sortedByDate.slice(Math.max(1, Math.floor(sortedByDate.length / 2)));
    const earlyAvg = somaDe(earlier, r => r.gross!) / earlier.length;
    const recentAvg = somaDe(recent, r => r.gross!) / recent.length;
    const diff = recentAvg - earlyAvg;
    const tone = diff < -3 ? "good" : diff > 3 ? "danger" : "neutral";
    const arrow = diff < -1 ? "↓" : diff > 1 ? "↑" : "→";
    out.push({ label: "Tendência Manuel", value: arrow + " " + fmtSign(diff, 1), hint: `Primeiras ${earlier.length} rondas avg ${earlyAvg.toFixed(1)} → últimas ${recent.length} avg ${recentAvg.toFixed(1)}`, tone });
  }
  return out;
}

export function buildParGroupStats(holes: HoleDistribution[]): ParGroupStats[] {
  const groups: ("Par 3" | "Par 4" | "Par 5")[] = ["Par 3", "Par 4", "Par 5"];
  const out: ParGroupStats[] = [];
  for (const g of groups) {
    const par = g === "Par 3" ? 3 : g === "Par 4" ? 4 : 5;
    const sub = holes.filter(h => h.par === par);
    if (!sub.length) continue;
    const fieldAvg = somaDe(sub, h => h.avgScore) / sub.length;
    const manuelHoles = sub.filter(h => h.manuelAvg != null);
    const manuelAvg = manuelHoles.length ? somaDe(manuelHoles, h => (h.manuelAvg ?? 0)) / manuelHoles.length : null;
    out.push({
      group: g, count: sub.length,
      fieldAvg, fieldDelta: fieldAvg - par,
      manuelAvg, manuelDelta: manuelAvg != null ? manuelAvg - par : null,
      pctBirdiePlus: somaDe(sub, h => h.pctBirdiePlus) / sub.length,
      pctBogey: somaDe(sub, h => h.pctBogey) / sub.length,
      pctDoublePlus: somaDe(sub, h => h.pctDoublePlus) / sub.length,
    });
  }
  return out;
}

export function buildManuelHoleStats(manuelRounds: PlayerRoundOnCourse[], parRef: number[]): ManuelHoleStats[] {
  const out: ManuelHoleStats[] = [];
  for (let h = 0; h < 18; h++) {
    const par = parRef[h] ?? 4;
    const scores = manuelRounds.map(r => r.scores[h]).filter(s => s > 0);
    if (!scores.length) {
      out.push({ hole: h + 1, par, scores: [], avg: 0, best: 0, worst: 0, sd: 0, consistency: "média" });
      continue;
    }
    const avg = soma(scores) / scores.length;
    const best = Math.min(...scores);
    const worst = Math.max(...scores);
    const variance = somaDe(scores, v => (v - avg) ** 2) / scores.length;
    const sd = Math.sqrt(variance);
    const consistency = sd < 0.7 ? "alta" : sd < 1.4 ? "média" : "baixa";
    out.push({ hole: h + 1, par, scores, avg, best, worst, sd, consistency });
  }
  return out;
}

/** Ronda teórica = somatório dos best score de cada buraco do Manuel.
 *  Compara com a melhor ronda real — diferença = "potencial em cima da mesa". */
export interface ManuelTheoretical {
  theoretical: number;
  bestReal: number;
  diff: number;          // bestReal - theoretical
  perHoleBest: number[]; // best score de cada buraco
}

export function buildManuelTheoretical(manuelStats: ManuelHoleStats[], manuelRounds: PlayerRoundOnCourse[]): ManuelTheoretical | null {
  const valid = manuelStats.filter(s => s.scores.length > 0);
  if (valid.length < 18) return null;
  const theoretical = somaDe(valid, h => h.best);
  const realRounds = manuelRounds.filter(r => r.gross != null && r.scores.length === 18);
  if (!realRounds.length) return null;
  const bestReal = Math.min(...realRounds.map(r => r.gross!));
  return {
    theoretical,
    bestReal,
    diff: bestReal - theoretical,
    perHoleBest: valid.map(s => s.best),
  };
}

/** Ranking dos jogadores Top 21 por toPar médio no campo (todas as rondas Aroeira II). */
export interface FieldRanking {
  fedCode: string | null;
  name: string;
  hcpExact: number | null;
  nRounds: number;
  avgGross: number;
  avgToPar: number;
  bestGross: number;
  /** Diferença entre avg e o campo geral — quem joga melhor relativamente ao field */
  vsFieldAvg: number;
}

export function buildFieldRanking(playerCards: PlayerScorecardBundle[], fieldAvgGross: number): FieldRanking[] {
  const out: FieldRanking[] = [];
  for (const c of playerCards) {
    if (c.avgGross == null || c.bestGross == null || c.avgToPar == null) continue;
    out.push({
      fedCode: c.fedCode, name: c.name, hcpExact: c.hcpExact,
      nRounds: c.nRounds,
      avgGross: c.avgGross, avgToPar: c.avgToPar,
      bestGross: c.bestGross,
      vsFieldAvg: c.avgGross - fieldAvgGross,
    });
  }
  out.sort((a, b) => a.avgToPar - b.avgToPar);
  return out;
}

/* ────────────────────────────────────────────────────────────
   SCORECARDS CRONOLÓGICOS + EVOLUÇÃO POR JOGADOR
   ──────────────────────────────────────────────────────────── */

/** Uma ronda enriquecida com info do jogador, para tabela cronológica unificada. */
export interface CronoRound {
  fedCode: string | null;
  playerName: string;
  hcpExact: number | null;
  date: string;            // YYYY-MM-DD
  round: number;
  tournamentName: string;
  ccode: string;
  tcode: string;
  gross: number | null;
  toPar: number | null;
  scores: number[];        // 18 holes
  pars: number[];
}

export interface EvolutionStats {
  fedCode: string | null;
  name: string;
  hcpExact: number | null;
  /** Cronológicas (todas as rondas no Aroeira II do jogador, ascendente por data) */
  rounds: CronoRound[];
  /** Slope da regressão linear gross vs índice da ronda. Negativo = a melhorar. */
  slope: number;
  /** Diferença entre primeira e última ronda (negativo = melhoria) */
  firstToLast: number | null;
  /** Avg primeiras N/2 rondas vs últimas N/2 (negativo = melhorou) */
  trendDelta: number | null;
  /** Best gross na história */
  bestGross: number | null;
  /** Última ronda gross */
  lastGross: number | null;
  /** Diferença entre best e última (positivo = afastou-se do best) */
  lastVsBest: number | null;
  /** Etiqueta de tendência: "↗ piorou", "↘ melhorou", "→ estável" */
  trendLabel: "↘ melhorou" | "↗ piorou" | "→ estável" | "—";
}

/** Junta TODAS as rondas de TODOS os jogadores (Top 21 + Sub-12 inscritos com histórico)
 *  num único array ordenado por data ascendente. */
export function buildChronologicalRounds(playerCards: PlayerScorecardBundle[]): CronoRound[] {
  const out: CronoRound[] = [];
  for (const c of playerCards) {
    for (const r of c.rounds) {
      out.push({
        fedCode: c.fedCode, playerName: c.name, hcpExact: c.hcpExact,
        date: r.date, round: r.round,
        tournamentName: r.tournamentName, ccode: r.ccode, tcode: r.tcode,
        gross: r.gross, toPar: r.toPar,
        scores: r.scores, pars: r.pars,
      });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round || a.playerName.localeCompare(b.playerName));
  return out;
}

/** Calcula estatísticas de evolução por jogador (slope, first-to-last, melhor, etc.). */
export function buildEvolutionStats(playerCards: PlayerScorecardBundle[]): EvolutionStats[] {
  const out: EvolutionStats[] = [];
  for (const c of playerCards) {
    const sortedRounds = [...c.rounds].sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round);
    const validG = sortedRounds.filter(r => r.gross != null).map(r => r.gross!);
    if (sortedRounds.length === 0) continue;
    const cronos: CronoRound[] = sortedRounds.map(r => ({
      fedCode: c.fedCode, playerName: c.name, hcpExact: c.hcpExact,
      date: r.date, round: r.round,
      tournamentName: r.tournamentName, ccode: r.ccode, tcode: r.tcode,
      gross: r.gross, toPar: r.toPar,
      scores: r.scores, pars: r.pars,
    }));
    // Slope: regressão linear simples
    const n = validG.length;
    let slope = 0;
    if (n >= 2) {
      const xs = validG.map((_, i) => i);
      const meanX = soma(xs) / n;
      const meanY = soma(validG) / n;
      const num = somaDe(xs, (x, i) => (x - meanX) * (validG[i] - meanY));
      const den = somaDe(xs, x => (x - meanX) ** 2);
      slope = den ? num / den : 0;
    }
    const firstToLast = validG.length >= 2 ? validG[validG.length - 1] - validG[0] : null;
    let trendDelta: number | null = null;
    if (validG.length >= 4) {
      const half = Math.floor(validG.length / 2);
      const first = validG.slice(0, half);
      const last = validG.slice(half);
      const fAvg = soma(first) / first.length;
      const lAvg = soma(last) / last.length;
      trendDelta = lAvg - fAvg;
    }
    const bestGross = validG.length ? Math.min(...validG) : null;
    const lastGross = validG.length ? validG[validG.length - 1] : null;
    const lastVsBest = (lastGross != null && bestGross != null) ? lastGross - bestGross : null;
    let trendLabel: EvolutionStats["trendLabel"] = "—";
    if (n >= 2) {
      if (slope <= -1.5) trendLabel = "↘ melhorou";
      else if (slope >= 1.5) trendLabel = "↗ piorou";
      else trendLabel = "→ estável";
    }
    out.push({
      fedCode: c.fedCode, name: c.name, hcpExact: c.hcpExact,
      rounds: cronos,
      slope, firstToLast, trendDelta,
      bestGross, lastGross, lastVsBest, trendLabel,
    });
  }
  // Ordenar por: melhor evolução primeiro (slope mais negativo)
  out.sort((a, b) => a.slope - b.slope);
  return out;
}

/* ────────────────────────────────────────────────────────────
   SUB-12 — performance dedicada
   ──────────────────────────────────────────────────────────── */

/** Cross-reference com inscritos do Campeonato Nacional Sub-12 H 2026 (tcode 10941).
 *  Devolve um Set de fed codes que estão confirmados como Sub-12. */
export async function loadSub12FedSet(): Promise<Set<string>> {
  const out = new Set<string>();
  for (const p of await inscritosSub12Nacional()) if (p.fed) out.add(String(p.fed));
  return out;
}

/** Os números de um jogador sobre as suas voltas no campo, por ordem de data:
 *  quantas, média/melhor/pior gross, média do ±par e a última. */
function resumoDasVoltas(voltas: PlayerRoundOnCourse[]): Pick<Sub12Performance,
  "nRounds" | "avgGross" | "bestGross" | "worstGross" | "avgToPar" | "lastGross" | "lastDate" | "rounds"> {
  const rounds = [...voltas].sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round);
  const grosses = rounds.map(r => r.gross).filter((g): g is number => g != null);
  const toPars = rounds.map(r => r.toPar).filter((t): t is number => t != null);
  const last = rounds.length ? rounds[rounds.length - 1] : null;
  return {
    nRounds: rounds.length,
    avgGross: meanArr(grosses),
    bestGross: grosses.length ? Math.min(...grosses) : null,
    worstGross: grosses.length ? Math.max(...grosses) : null,
    avgToPar: meanArr(toPars),
    lastGross: last?.gross ?? null,
    lastDate: last?.date ?? null,
    rounds,
  };
}

export interface Sub12Performance {
  fedCode: string | null;
  name: string;
  club: string;
  hcpExact: number | null;
  /** "top21" se também jogou o PJA Aroeira Masters 2026, "inscrito" se só vai jogar agora. */
  status: "top21+inscrito" | "top21_so" | "inscrito_com_historico" | "inscrito_estreante";
  nRounds: number;
  avgGross: number | null;
  bestGross: number | null;
  worstGross: number | null;
  avgToPar: number | null;
  lastGross: number | null;
  lastDate: string | null;
  /** Só inscritos que estão a estrear no campo (status="inscrito_estreante") podem ter rounds=[]. */
  rounds: PlayerRoundOnCourse[];
}

/** Constrói tabela de performance dos Sub-12.
 *
 *  Sub-12 é definido como: fed pertence a `sub12FedSet` (lista de inscritos no
 *  Nacional Sub-12 2026 do tcode 10941). Inclui:
 *   - Sub-12 que também jogaram o PJA Aroeira Masters 2026 (top21 + inscritos)
 *   - Sub-12 inscritos com histórico Aroeira II (mas sem ter jogado o torneio actual)
 *   - Sub-12 inscritos sem histórico (estreantes — primeira vez no campo)
 *   - Manuel é incluído mesmo que não tenha um fed na lista (caso `fedCode === MANUEL_FED`).
 */
export function buildSub12Performance(
  pkg: AnalisePackage,
  sub12FedSet: Set<string>,
): Sub12Performance[] {
  const out: Sub12Performance[] = [];
  const inTorneio = new Set<string>();

  // 1) Top 21: incluir os que estão na lista Sub-12
  for (const p of pkg.tournament.players || []) {
    const fed = p.fedCode || "";
    inTorneio.add(fed);
    const isSub12 = (fed && sub12FedSet.has(fed)) || fed === MANUEL_FED;
    if (!isSub12) continue;
    const playerCard = pkg.top21Compare.find(c => c.fedCode === fed);
    if (!playerCard) continue;
    out.push({
      fedCode: fed || null,
      name: playerCard.name, club: playerCard.club,
      hcpExact: playerCard.hcpExact,
      status: sub12FedSet.has(fed) ? "top21+inscrito" : "top21_so",
      ...resumoDasVoltas([...playerCard.priorRounds, ...playerCard.currentRounds]),
    });
  }

  // 2) Sub-12 inscritos com histórico (que não estavam no Top 21)
  for (const c of pkg.sub12Inscritos) {
    if (c.fedCode && inTorneio.has(c.fedCode)) continue; // já tratado em (1)
    out.push({
      fedCode: c.fedCode, name: c.name, club: c.club, hcpExact: c.hcpExact,
      status: "inscrito_com_historico",
      ...resumoDasVoltas(c.priorRounds),
    });
  }

  // 3) Sub-12 inscritos SEM histórico (estreantes) — vamos buscar à própria admissions
  //    Estes não estão em `pkg.sub12Inscritos` porque essa lista filtrou só os com rondas.
  //    Para os obter, re-fetch admissions.
  // (deixa para a função top-level fazer este enriquecimento, se necessário)

  // Ordenar: primeiro os que jogam melhor o campo (avg toPar ascending), os sem rondas no fim
  out.sort((a, b) => {
    if (a.avgToPar == null && b.avgToPar == null) return a.name.localeCompare(b.name);
    if (a.avgToPar == null) return 1;
    if (b.avgToPar == null) return -1;
    return a.avgToPar - b.avgToPar;
  });
  return out;
}

/** Adiciona estreantes (Sub-12 inscritos sem rondas no Aroeira II) ao array. */
export async function enrichSub12WithEstreantes(
  perf: Sub12Performance[],
  sub12FedSet: Set<string>,
): Promise<Sub12Performance[]> {
  {
    const inscritos = await inscritosSub12Nacional();
    const seenFeds = new Set(perf.map(p => p.fedCode).filter(Boolean) as string[]);
    for (const ins of inscritos) {
      if (!ins.fed || seenFeds.has(ins.fed)) continue;
      if (!sub12FedSet.has(ins.fed)) continue;
      perf.push({
        fedCode: ins.fed, name: ins.nome, club: ins.clube || "",
        hcpExact: typeof ins.hcp === "number" ? ins.hcp : null,
        status: "inscrito_estreante",
        nRounds: 0, avgGross: null, bestGross: null, worstGross: null,
        avgToPar: null, lastGross: null, lastDate: null, rounds: [],
      });
    }
  }
  return perf;
}

/* ──────── DIAL POR BURACO — best/worst + distribuição ──────── */

interface ScoreDist {
  birdiePlus: number;
  par: number;
  bogey: number;
  doublePlus: number;
  /** Total de scores agregados (denominador para %) */
  n: number;
}

export interface HoleDial {
  hole: number;
  par: number;
  fieldBest: number | null;
  fieldWorst: number | null;
  fieldN: number;
  fieldDist: ScoreDist;
  sub12Best: number | null;
  sub12Worst: number | null;
  sub12N: number;
  sub12Dist: ScoreDist;
  manuelBest: number | null;
  manuelWorst: number | null;
  manuelN: number;
  manuelDist: ScoreDist;
}

function distFromScores(scores: number[], par: number): ScoreDist {
  let bp = 0, p = 0, b = 0, dp = 0;
  for (const s of scores) {
    const d = s - par;
    if (d <= -1) bp++;
    else if (d === 0) p++;
    else if (d === 1) b++;
    else dp++;
  }
  return { birdiePlus: bp, par: p, bogey: b, doublePlus: dp, n: scores.length };
}

export function buildHoleDials(
  allRounds: PlayerRoundOnCourse[],
  parRef: number[],
  sub12FedSet: Set<string>,
): HoleDial[] {
  const out: HoleDial[] = [];
  const valid = voltasNoRoutingActual(allRounds, parRef);
  const isManuel = (r: PlayerRoundOnCourse) => isManuelPlayer({ fed: r.fedCode ?? undefined, name: r.name });
  const isSub12 = (r: PlayerRoundOnCourse) => isManuel(r) || (r.fedCode != null && sub12FedSet.has(r.fedCode));
  const minOrNull = (a: number[]) => a.length ? Math.min(...a) : null;
  const maxOrNull = (a: number[]) => a.length ? Math.max(...a) : null;
  for (let h = 0; h < 18; h++) {
    const par = parRef[h] ?? 4;
    const fieldVals: number[] = [];
    const sub12Vals: number[] = [];
    const manuelVals: number[] = [];
    for (const r of valid) {
      const s = r.scores[h];
      if (s <= 0) continue;
      fieldVals.push(s);
      if (isSub12(r)) sub12Vals.push(s);
      if (isManuel(r)) manuelVals.push(s);
    }
    out.push({
      hole: h + 1, par,
      fieldBest: minOrNull(fieldVals), fieldWorst: maxOrNull(fieldVals), fieldN: fieldVals.length,
      fieldDist: distFromScores(fieldVals, par),
      sub12Best: minOrNull(sub12Vals), sub12Worst: maxOrNull(sub12Vals), sub12N: sub12Vals.length,
      sub12Dist: distFromScores(sub12Vals, par),
      manuelBest: minOrNull(manuelVals), manuelWorst: maxOrNull(manuelVals), manuelN: manuelVals.length,
      manuelDist: distFromScores(manuelVals, par),
    });
  }
  return out;
}
