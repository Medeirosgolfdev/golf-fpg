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
import { isManuel } from "../constants/manuel";

export function numGross(p: Player): number {
  return typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number) ?? 999;
}

/** Verifica se o Manuel está neste torneio — em qualquer fase.
 *
 *  Procura em 3 sítios (em ordem de disponibilidade):
 *    1. `t.players` — torneios jogados (scorecards) ou com resultados parciais
 *    2. `t._admissions.players` — torneios pre-jogo da FPG (Nacional 2026, Drive, etc.)
 *    3. `t._draws[*].groups[*].players` — torneios pre-jogo sem admissions scraped
 *       (ex: Regional Santo da Serra — draw vem por email em PDF, sem admissions)
 *
 *  Fonte única desta lógica para garantir consistência entre filtros da sidebar,
 *  pill no cabeçalho do detail e highlight na sidebar.
 */
export function tournamentHasManuel(t: Tournament | undefined | null): boolean {
  if (!t) return false;
  if ((t.players || []).some(p => isManuel(p as any))) return true;
  const adm = (t as any)._admissions?.players as Array<{ fed?: string | null; nome?: string }> | undefined;
  if (adm?.some(p => isManuel({ name: p.nome, fed: p.fed ?? undefined }))) return true;
  const dr = (t as any)._draws as Record<string, { groups?: Array<{ players?: Array<{ nome?: string; fed?: string | null }> }> }> | undefined;
  if (dr) {
    for (const round of Object.values(dr)) {
      for (const g of (round?.groups || [])) {
        for (const p of (g.players || [])) {
          if (isManuel({ name: p.nome, fed: p.fed ?? undefined })) return true;
        }
      }
    }
  }
  return false;
}

/** Mapa fed → ano → escalão. Construído a partir de torneios Challenge (t.escalao explícito).
 *  Usado como fallback quando não há DOB na playersDB para inferir o escalão num ano específico. */
export type TemporalEscLookup = Map<string, Map<string, string>>;

/** Escalão do jogador no contexto do torneio — FONTE ÚNICA DE VERDADE.
 *
 *  Regra FPG: escalão é baseado na idade que o jogador faz no ano civil do torneio
 *  (year − yearOfBirth). Ver `escalaoAtDate` em utils/format.ts.
 *
 *  Prioridade:
 *    1) escalaoAtDate(dob, tournamentDate) — SEMPRE preferido se há dob + data (cálculo directo)
 *    2) escalão gravado no registo do torneio (histórico do scrape) — reflecte o escalão na altura
 *    3) temporalEscLookup[fed][year] — escalão inferido de outros torneios do mesmo ano (ex: Challenge)
 *    4) lookup actual (players.json) — último recurso (pode estar errado para torneios antigos)
 *
 *  Usar sempre esta função em vez de aceder directamente ao playersDB[fed].escalao ou
 *  ao escLookup global: isso mostraria sempre o escalão ACTUAL, errado para torneios antigos.
 */
export function resolveEsc(
  p: Player,
  escLookup: EscLookup,
  opts?: {
    tournamentDate?: string | null;
    playersDB?: PlayersDB;
    temporalEscLookup?: TemporalEscLookup;
  }
): string {
  const fed = p.fedCode || (p as any).fed;
  // 1) Cálculo dob + data do torneio (verdade matemática, year-based)
  if (opts?.tournamentDate && opts?.playersDB && fed) {
    const dob = (opts.playersDB[fed] as any)?.dob;
    if (dob) {
      const calc = escalaoAtDate(dob, opts.tournamentDate);
      if (calc) return calc;
    }
  }
  // 2) Histórico do registo do torneio (escalão guardado no scrape)
  const historic = (p as any).escalao || (p as any).ageCategory;
  if (historic) return historic.replace("-", " ").replace(/sub(\d)/i, "Sub $1").trim();
  // 3) Temporal lookup por ano do torneio (inferido de outros torneios do mesmo ano)
  if (fed && opts?.tournamentDate && opts?.temporalEscLookup) {
    const year = String(opts.tournamentDate).slice(0, 4);
    const y = opts.temporalEscLookup.get(fed)?.get(year);
    if (y) return y;
  }
  // 4) Lookup actual (fallback — pode estar errado para torneios antigos)
  if (fed && escLookup.has(fed)) return escLookup.get(fed)!;
  return "";
}

/** Constrói o temporal lookup: fedCode → Map<year, escalão>
 *  A partir dos torneios Challenge (que têm t.escalao explícito).
 *  Permite saber o escalão de um jogador num ANO específico mesmo sem DOB na playersDB. */
export function buildTemporalEscLookup(
  tournaments: Array<{
    escalao?: string | null;
    series?: string;
    date?: string;
    players: Array<{ fed?: string; fedCode?: string }>;
    _roundLabel?: string;
  }>
): TemporalEscLookup {
  const map: TemporalEscLookup = new Map();
  for (const t of tournaments) {
    // Só Challenge têm t.escalao explícito (escalão único por torneio)
    if (t.series !== "challenge" || !t.escalao) continue;
    // Ignorar rondas expandidas (R1/R2) — só o torneio base ou Total
    if (t._roundLabel && t._roundLabel !== "Resumo") continue;
    const year = t.date?.split("-")[0];
    if (!year) continue;
    for (const p of t.players) {
      const fed = p.fed || p.fedCode || "";
      if (!fed) continue;
      if (!map.has(fed)) map.set(fed, new Map());
      // Não sobrescrever se já existe (primeiro torneio encontrado ganha)
      if (!map.get(fed)!.has(year)) map.get(fed)!.set(year, t.escalao);
    }
  }
  return map;
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
  opts?: { tournamentDate?: string | null; temporalEscLookup?: TemporalEscLookup }
): Player[] {
  let ps = players;
  if (f.name) { const q = f.name.toLowerCase(); ps = ps.filter(p => p.name.toLowerCase().includes(q) || (p.club || "").toLowerCase().includes(q)); }
  if (f.escs.length) ps = ps.filter(p => f.escs.includes(resolveEsc(p, escLookup, { tournamentDate: opts?.tournamentDate, playersDB, temporalEscLookup: opts?.temporalEscLookup })));
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
