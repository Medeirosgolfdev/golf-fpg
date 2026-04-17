/**
 * fpgUtils.ts — Funções utilitárias do pipeline FPG
 *
 * Funções partilhadas usadas por FPGPage, DrivePage e leaderboards.
 * Extraídas de FPGPage.tsx.
 */
import type { Player, Tournament, RoundScore, SDResult, PlayerFilter } from "./fpgTypes";
import type { EscLookup } from "../utils/playerUtils";
import type { PlayersDB } from "../ui/tournamentPrimitives";
import { normalizePlayer } from "../utils/playerUtils";
import { calcAGS, expectedSD9 } from "../utils/whsCalc";
import { norm, escalaoAtDate } from "../utils/format";

export function numGross(p: Player): number {
  return typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number) ?? 999;
}

/** Escalão do jogador no contexto do torneio.
 *  Prioridade:
 *    1) escalaoAtDate(dob, tournamentDate)  — SEMPRE preferido se há dob+data
 *    2) escalão gravado no registo do torneio (histórico do scrape)
 *    3) lookup actual (players.json) — último recurso
 */
export function resolveEsc(
  p: Player,
  escLookup: EscLookup,
  opts?: { tournamentDate?: string | null; playersDB?: PlayersDB }
): string {
  const fed = p.fedCode || (p as any).fed;
  // 1) Cálculo dob + data do torneio (verdade matemática)
  if (opts?.tournamentDate && opts?.playersDB && fed) {
    const dob = (opts.playersDB[fed] as any)?.dob;
    if (dob) {
      const calc = escalaoAtDate(dob, opts.tournamentDate);
      if (calc) return calc;
    }
  }
  // 2) Histórico do registo
  const historic = (p as any).escalao || (p as any).ageCategory;
  if (historic) return historic.replace("-", " ").replace(/sub(\d)/i, "Sub $1").trim();
  // 3) Lookup actual
  if (fed && escLookup.has(fed)) return escLookup.get(fed)!;
  return "";
}

export function computeSD(p: Player): SDResult {
  const scores = p.scores || [];
  const parArr = p.par || [];
  const si = p.si || [];
  const nh = p.nholes || scores.length || (parArr.length > 0 ? parArr.length : 18);
  const is9 = nh <= 9;
  const cr = p.courseRating;
  const slope = p.slope;
  const hcp = p.hcpExact;
  const gross = numGross(p);
  if (!cr || !slope || gross == null || isNaN(gross)) return { sd: null, source: null };
  if (hcp != null && si.length >= nh && scores.length >= nh && parArr.length >= nh) {
    const ags = calcAGS(scores, parArr, si, cr, slope, hcp, nh);
    const raw = (113 / slope) * (ags - cr);
    const sd = is9 ? raw + expectedSD9(hcp) : raw;
    return { sd: Math.max(0, Math.round(sd * 10) / 10), source: "ags" };
  }
  if (!is9) {
    const sd = Math.max(0, Math.round((113 / slope) * (gross - cr) * 10) / 10);
    return { sd, source: "raw" };
  }
  if (hcp != null) {
    const raw = (113 / slope) * (gross - cr);
    const sd = Math.max(0, Math.round((raw + expectedSD9(hcp)) * 10) / 10);
    return { sd, source: "raw" };
  }
  return { sd: null, source: null };
}

export function filterPlayers(
  players: Player[],
  f: PlayerFilter,
  escLookup: EscLookup,
  playersDB: PlayersDB,
  opts?: { tournamentDate?: string | null }
): Player[] {
  let ps = players;
  if (f.name) { const q = f.name.toLowerCase(); ps = ps.filter(p => p.name.toLowerCase().includes(q) || (p.club || "").toLowerCase().includes(q)); }
  if (f.escs.length) ps = ps.filter(p => f.escs.includes(resolveEsc(p, escLookup, { tournamentDate: opts?.tournamentDate, playersDB })));
  if (f.tees.length) ps = ps.filter(p => p.teeName != null && f.tees.includes(p.teeName));
  if (f.club) ps = ps.filter(p => p.club === f.club);
  return ps;
}

/** "PJA TOUR Vale Pisão - Dia 1" → "PJA TOUR Vale Pisão" */
function extractBaseName(name: string): string {
  return name.replace(/\s*[-–]?\s*(?:dia|round|ronda)\s*\d+\s*$/i, "").trim();
}

function detectRoundNumber(name: string): number | null {
  const m = name.match(/[-–]?\s*(?:dia|round|ronda)\s*(\d+)\s*$/i);
  return m ? parseInt(m[1]) : null;
}

/** Expand multi-round: 1 torneio → R1 + R2 + ... + Total */
export function expandMultiRound(t: Tournament): Tournament[] {
  const nRounds = t.rounds || 1;
  const hasMulti = t.players.some(p => (p.roundScores?.length ?? 0) > 1);
  if (nRounds <= 1 || !hasMulti) return [t];

  const out: Tournament[] = [];

  // Per-round entries
  for (let rd = 1; rd <= nRounds; rd++) {
    const rdPlayers: Player[] = [];
    for (const p of t.players) {
      const rs = p.roundScores?.find(r => r.round === rd);
      if (!rs) continue;
      const parT = p.parTotal || rs.pars.reduce((a, b) => a + b, 0);
      rdPlayers.push(normalizePlayer({
        ...p,
        scoreId: p.scoreId + "_R" + rd,
        grossTotal: rs.gross,
        toPar: rs.gross - parT,
        scores: rs.scores, par: rs.pars, si: rs.si, meters: rs.meters,
        courseRating: rs.courseRating, slope: rs.slope, teeName: rs.teeName,
        roundScores: [rs],
      }));
    }
    // Sort by gross for this round — WD players sempre no fim
    rdPlayers.sort((a, b) => {
      const aWD = a._wd; const bWD = b._wd;
      if (aWD && !bWD) return 1;
      if (!aWD && bWD) return -1;
      return numGross(a) - numGross(b);
    });
    out.push({ ...t, players: rdPlayers, _roundLabel: `R${rd}` } as any);
  }

  // Total (accumulated) entry — jogadores incompletos vão para o fim
  // playedRounds = máximo de rondas realmente jogadas (não o total declarado do torneio)
  // Isto evita marcar todos como "incompletos" quando ainda faltam rondas futuras.
  const playedRounds = Math.max(0, ...t.players.map(p => p.roundScores?.length ?? 0));

  const totalPlayers: Player[] = [];
  for (const p of t.players) {
    if (!p.roundScores?.length) continue;

    // Rondas válidas: excluir WD (gross>=999 ou scorecard todo zeros)
    const validRounds = p.roundScores.filter(rs =>
      rs.gross < 999 && !(rs.scores?.length && rs.scores.every(s => s === 0))
    );
    const isWD = validRounds.length < p.roundScores.length;   // desistiu em ≥1 ronda
    const nPlayed = validRounds.length;

    // "incompleto" = menos rondas válidas do que o máximo disponível, sem ser WD
    const incomplete = !isWD && nPlayed < playedRounds;

    const gross = validRounds.reduce((s, rs) => s + rs.gross, 0);
    const parPerRound = p.parTotal || (p.roundScores[0]?.pars.reduce((a, b) => a + b, 0) || 0);
    const parT = parPerRound * nPlayed;

    totalPlayers.push(normalizePlayer({
      ...p,
      grossTotal: gross,
      toPar: gross - parT,
      _incomplete: incomplete,
      _wd: isWD,
      _roundsPlayed: nPlayed,
    } as any));
  }
  // Completos ordenados por gross; incompletos no fim; WD no fim de tudo
  const complete   = totalPlayers.filter(p => !p._incomplete && !p._wd).sort((a, b) => numGross(a) - numGross(b));
  const wdPlayers  = totalPlayers.filter(p => p._wd);
  const incomplete = totalPlayers.filter(p =>  p._incomplete && !p._wd).sort((a, b) => numGross(a) - numGross(b));
  // Positions only for complete players
  let pos = 1;
  complete.forEach((p, i) => {
    if (i > 0 && numGross(p) !== numGross(complete[i - 1])) pos = i + 1;
    (p as any)._pos = pos;
  });
  incomplete.forEach(p => { (p as any)._pos = null; });
  // Label do tab: "Resumo" quando terminou, "Resumo R1–R2" quando ainda faltam rondas
  const accumLabel = playedRounds < nRounds ? `Resumo R1–R${playedRounds}` : "Resumo";
  out.push({ ...t, players: [...complete, ...incomplete, ...wdPlayers], _roundLabel: accumLabel, _isTotal: true } as any);

  return out;
}

/** Funde N torneios (rondas separadas) num único torneio multi-ronda sintético */
export function mergeTournamentRounds(rounds: Tournament[]): Tournament {
  const sorted = [...rounds].sort((a, b) => {
    const ra = detectRoundNumber(a.name) ?? 99;
    const rb = detectRoundNumber(b.name) ?? 99;
    if (ra !== rb) return ra - rb;
    return (a.date || "").localeCompare(b.date || "");
  });

  const nRounds = sorted.length;
  const byKey = new Map<string, { player: Player; rsArr: RoundScore[] }>();

  sorted.forEach((t, ri) => {
    for (const p of t.players) {
      const key = p.fedCode || ("name:" + p.name.toLowerCase().trim());
      const rs: RoundScore = {
        round: ri + 1,
        gross: numGross(p),
        scores: p.scores || p.roundScores?.[0]?.scores || [],
        pars: p.par || p.roundScores?.[0]?.pars || [],
        si: p.si || p.roundScores?.[0]?.si || [],
        meters: p.meters || p.roundScores?.[0]?.meters || [],
        courseRating: p.courseRating ?? p.roundScores?.[0]?.courseRating,
        slope: p.slope ?? p.roundScores?.[0]?.slope,
        teeName: p.teeName ?? p.roundScores?.[0]?.teeName,
      };
      if (byKey.has(key)) {
        byKey.get(key)!.rsArr.push(rs);
      } else {
        byKey.set(key, { player: p, rsArr: [rs] });
      }
    }
  });

  const refParTotal = sorted[0].players[0]?.parTotal
    || sorted[0].players[0]?.par?.reduce((a, b) => a + b, 0)
    || 72;

  const players: Player[] = [];
  for (const { player, rsArr } of byKey.values()) {
    const grossTotal = rsArr.reduce((s, r) => s + r.gross, 0);
    players.push({
      ...player,
      roundScores: rsArr,
      grossTotal,
      toPar: grossTotal - refParTotal * rsArr.length,
      parTotal: refParTotal,
      scores: rsArr[0]?.scores,
      par:    rsArr[0]?.pars,
      si:     rsArr[0]?.si,
      meters: rsArr[0]?.meters,
    });
  }

  const baseName  = extractBaseName(sorted[0].name);
  const lastDate  = sorted[sorted.length - 1].date;
  const tcodeList = sorted.map(t => t.tcode).join("+");

  return {
    ...sorted[0],
    name: baseName,
    date: lastDate,
    rounds: nRounds,
    playerCount: players.length,
    players,
    tcode: tcodeList,
    _sourceFile: sorted[0]._sourceFile,
    _sourceIndex: sorted[0]._sourceIndex,
    _isSynthetic: true,
    _subRounds: sorted,
  } as any;
}

/**
 * Constrói a lista de display: detecta pares "Dia 1/Dia 2" com mesmo ccode+baseName,
 * cria torneios sintéticos e esconde os originais da sidebar.
 */
export function buildDisplayList(tournaments: Tournament[]): Tournament[] {
  const candidates = new Map<string, Tournament[]>();
  for (const t of tournaments) {
    if (detectRoundNumber(t.name) == null) continue;
    const base = extractBaseName(t.name);
    const key  = `${t.ccode || "?"}_${base.toLowerCase().trim()}`;
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key)!.push(t);
  }

  const hiddenTcodes = new Set<string>();
  const synthetics: Tournament[] = [];
  for (const group of candidates.values()) {
    if (group.length < 2) continue;
    group.forEach(t => hiddenTcodes.add(t.tcode));
    synthetics.push(mergeTournamentRounds(group));
  }

  const standalone = tournaments.filter(t => !hiddenTcodes.has(t.tcode));
  return [...standalone, ...synthetics].sort(
    (a, b) => (b.date || "").localeCompare(a.date || "")
  );
}
