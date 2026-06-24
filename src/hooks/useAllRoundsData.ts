/**
 * useAllRoundsData — Hook partilhado entre AllRoundsScorecardLB e DriveAllRoundsScorecardLB
 *
 * Extrai toda a lógica de dados comum:
 *   - Row building (grouped + flat)
 *   - Ranking
 *   - Sorting (grouped + flat)
 *   - Filtering (nome + clube)
 *   - Par/SI reference extraction
 *   - UI state (groupMode, showSC, filter, sort)
 *
 * As diferenças entre FPG e Drive (SD calculation, DNS filter, per-round refs)
 * são injectadas via opções.
 */

import { useState, useMemo } from "react";
import { useSort } from "./useSort";
import { fmtToPar, medal } from "../utils/format";
import { toggleArr } from "../utils/mathUtils";
import type { Player, Tournament, RoundScore } from "../data/fpgTypes";

/* ── Helpers de sort (Out/In a partir dos scores da ronda) ── */
function frontSum(rd: { scores: number[] }): number {
  return rd.scores.slice(0, 9).reduce((s, v) => s + (v > 0 ? v : 0), 0);
}
function backSum(rd: { scores: number[] }): number {
  return rd.scores.slice(9, 18).reduce((s, v) => s + (v > 0 ? v : 0), 0);
}

/* ── Types exportados ── */

export interface RdData {
  scores: number[];
  gross: number;
  toPar: number;
  sd: number | null;
  eags: number;
  birds: number;
  pars: number;
  bogs: number;
  /** Pars por buraco PARA ESTA RONDA — usado pelo ScoreCells para colorir
   *  cada score (birdie/par/bogey) com base nas pars reais da ronda, e não
   *  das pars globais (que podem diferir quando R1 e R2 são em percursos
   *  com routing diferente, ex: Santo da Serra Desertas-Serras vs Serras-Serras). */
  holePars: number[];
}

export interface PRow {
  key: string;
  name: string;
  club: string;
  fed?: string;
  hcp: number | null;
  esc: string;
  teeName?: string;
  rds: (RdData | null)[];
  total: number | null;
  totalTP: number | null;
  isWD: boolean;
  pos: number | null;
  _rdCount: number;
  _fullCount: number;
}

export interface FlatRow {
  key: string;
  playerKey: string;
  name: string;
  club: string;
  fed?: string;
  hcp: number | null;
  esc: string;
  teeName?: string;
  rd: RdData;
  ri: number;
  rdLabel: string;
  isWD: boolean;
  pos: number | null;
}

export interface RoundRef {
  pars: number[];
  si: number[];
  meters?: number[];
  cr?: number;
  slope?: number;
}

/** Função injectável para calcular o SD de uma ronda */
export type ComputeRoundSD = (
  player: Player,
  capped: number[],
  rs: RoundScore,
  ref: RoundRef,
  gross: number,
) => number | null;

export interface UseAllRoundsOptions {
  tournament: Tournament;
  /** Máximo de score por buraco (cap). Default: 10 */
  maxHoleScore?: number;
  /** Função para resolver escalão. Se omitida, usa "" */
  resolveEsc?: (p: Player) => string;
  /** Filtro de jogadores antes de processar (e.g. isDNS). Se omitida, inclui todos */
  playerFilter?: (p: Player) => boolean;
  /** Cálculo de SD por ronda. Se omitida, sd = null */
  computeRoundSD?: ComputeRoundSD;
  /** References por ronda (pars/si/cr/slope). Se omitida, usa R1 para todas */
  roundRefs?: RoundRef[];
}

export interface AllRoundsResult {
  /* Dados de referência */
  par: number[];
  si: number[];
  meters: number[];
  nh: number;
  is9: boolean;
  parF9: number;
  parB9: number;
  parTot: number;
  hasSI: boolean;
  hasMeters: boolean;
  playedRounds: number;
  roundRefs: RoundRef[];

  /* Rows processados */
  gDisplayed: PRow[];
  displayed: FlatRow[];

  /* UI state */
  groupMode: boolean;
  setGroupMode: (v: boolean) => void;
  showSC: boolean;
  setShowSC: React.Dispatch<React.SetStateAction<boolean>>;
  nameQ: string;
  setNameQ: (v: string) => void;
  clubQ: string;
  setClubQ: (v: string) => void;
  escFilter: string[];
  setEscFilter: (v: string[]) => void;
  toggleEsc: (e: string) => void;
  teeFilter: string[];
  setTeeFilter: (v: string[]) => void;
  toggleTee: (t: string) => void;
  sortKey: string;
  sortDir: "asc" | "desc";
  toggleSort: (k: string) => void;
  availClubs: string[];
  availEsc: string[];
  availTees: string[];

  /* Helpers */
  clearFilter: () => void;
}

/* ── Hook ── */

export function useAllRoundsData(opts: UseAllRoundsOptions): AllRoundsResult {
  const {
    tournament,
    maxHoleScore = 10,
    resolveEsc: resolveEscFn,
    playerFilter,
    computeRoundSD,
  } = opts;

  // UI state
  const [nameQ, setNameQ] = useState("");
  const [clubQ, setClubQ] = useState("");
  const [escFilter, setEscFilter] = useState<string[]>([]);
  const [teeFilter, setTeeFilter] = useState<string[]>([]);
  const [showSC, setShowSC] = useState(true);
  const [groupMode, setGroupMode] = useState(true);
  const { sortKey, sortDir, toggleSort } = useSort<string>("pos");

  // Rondas jogadas
  const playedRounds = useMemo(
    () => Math.max(0, ...tournament.players.map((p) => p.roundScores?.length ?? 0)),
    [tournament],
  );

  // References por ronda
  const roundRefs: RoundRef[] = useMemo(() => {
    if (opts.roundRefs) return opts.roundRefs;
    // Fallback: usa R1 para todas
    for (const p of tournament.players) {
      const rs = p.roundScores?.find((r) => r.round === 1);
      if (rs?.pars?.length) return [{ pars: rs.pars, si: rs.si || [], meters: rs.meters || [] }];
    }
    const p0 = tournament.players[0];
    if (p0?.par?.length) return [{ pars: p0.par, si: p0.si || [], meters: (p0 as any).meters || [] }];
    return [{ pars: [], si: [], meters: [] }];
  }, [tournament, opts.roundRefs]);

  const ref0 = roundRefs[0] ?? { pars: [], si: [], meters: [] };
  const par = ref0.pars;
  const si = ref0.si;
  const meters = ref0.meters || [];
  const nh = par.length || 18;
  const is9 = nh <= 9;
  const parF9 = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const parB9 = !is9 ? par.slice(9).reduce((a, b) => a + b, 0) : 0;
  const parTot = par.reduce((a, b) => a + b, 0);
  const hasSI = si.length >= nh;
  // Linha de metros só aparece quando o ficheiro traz distâncias reais (> 0).
  const hasMeters = meters.slice(0, nh).some((v) => Number(v) > 0);

  // Build round data para um jogador + ronda
  function buildRdData(p: Player, rdNum: number): RdData | null {
    const rs = p.roundScores?.find((r) => r.round === rdNum);
    if (!rs) return null;
    if (rs.gross >= 999 || (rs.scores?.length > 0 && rs.scores.every((s) => s === 0)))
      return null;
    const ref = roundRefs[rdNum - 1] ?? ref0;
    const refPars = rs.pars?.length ? rs.pars : ref.pars;
    const capped = rs.scores?.map((s) => Math.min(s, maxHoleScore)) ?? [];
    const gross = capped.length ? capped.reduce((a, b) => a + b, 0) : rs.gross;
    const rdPar = refPars?.reduce((a, b) => a + b, 0) || parTot;
    let eags = 0, birds = 0, pars2 = 0, bogs = 0;
    capped.forEach((s, h) => {
      if (!s || s <= 0) return; // buraco não jogado (9H guardadas como 18 com zeros)
      const d = s - (refPars[h] ?? par[h] ?? 0);
      if (d <= -2) eags++;
      else if (d === -1) birds++;
      else if (d === 0) pars2++;
      else bogs++;
    });
    const sd = computeRoundSD ? computeRoundSD(p, capped, rs, ref, gross) : null;
    return { scores: capped, gross, toPar: gross - rdPar, sd, eags, birds, pars: pars2, bogs, holePars: refPars || [] };
  }

  // Jogadores filtrados
  const players = useMemo(
    () => (playerFilter ? tournament.players.filter(playerFilter) : tournament.players),
    [tournament, playerFilter],
  );

  /* ── Grouped rows ── */
  const groupedRows: PRow[] = useMemo(() => {
    return players.map((p) => {
      const rds = Array.from({ length: playedRounds }, (_, ri) => buildRdData(p, ri + 1));
      const validRds = rds.filter((r) => r != null) as RdData[];
      const anyWD = rds.some(
        (r, ri) => r == null && !!p.roundScores?.find((rs) => rs.round === ri + 1),
      );
      const total = validRds.length ? validRds.reduce((s, r) => s + r.gross, 0) : null;
      const totalTP = validRds.length ? validRds.reduce((s, r) => s + r.toPar, 0) : null;
      return {
        key: p.scoreId || p.name,
        name: p.name,
        club: p.club || "",
        fed: (p as any).fed || p.fedCode,
        hcp: p.hcpExact ?? null,
        esc: resolveEscFn ? resolveEscFn(p) : "",
        teeName: p.teeName,
        rds,
        total,
        totalTP,
        isWD: anyWD,
        pos: null,
        _rdCount: validRds.length,
        _fullCount: 0,
      };
    });
  }, [players, playedRounds, resolveEscFn]);

  const rankedGrouped = useMemo(() => {
    const fullCount = Math.max(0, ...groupedRows.map((r) => r._rdCount));
    const pm = new Map<string, number>();
    const complete = groupedRows
      .filter((r) => r._rdCount === fullCount && r.total != null && !r.isWD)
      .sort((a, b) => a.total! - b.total!);
    let cnt = 1;
    complete.forEach((r, i) => {
      if (i > 0 && r.total !== complete[i - 1].total) cnt = i + 1;
      pm.set(r.key, cnt);
    });
    return groupedRows.map((r) => ({ ...r, pos: pm.get(r.key) ?? null, _fullCount: fullCount }));
  }, [groupedRows]);

  /* ── Flat rows ── */
  const flatRows: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = [];
    for (const p of players) {
      const isWD = !!(p as any)._wd;
      for (let ri = 0; ri < playedRounds; ri++) {
        const rd = buildRdData(p, ri + 1);
        if (rd == null) continue;
        out.push({
          key: `${p.scoreId || p.name}_${ri}`,
          playerKey: p.scoreId || p.name,
          name: p.name,
          club: p.club || "",
          fed: (p as any).fed || p.fedCode,
          hcp: p.hcpExact ?? null,
          esc: resolveEscFn ? resolveEscFn(p) : "",
          teeName: p.teeName,
          rd,
          ri,
          rdLabel: `R${ri + 1}`,
          isWD,
          pos: null,
        });
      }
    }
    return out;
  }, [players, playedRounds, resolveEscFn]);

  const rankedFlat = useMemo(() => {
    const valid = [...flatRows.filter((r) => !r.isWD)].sort((a, b) => a.rd.gross - b.rd.gross);
    const pm = new Map<string, number>();
    let cnt = 1;
    valid.forEach((r, i) => {
      if (i > 0 && r.rd.gross !== valid[i - 1].rd.gross) cnt = i + 1;
      pm.set(r.key, cnt);
    });
    return flatRows.map((r) => ({ ...r, pos: pm.get(r.key) ?? null }));
  }, [flatRows]);

  /* ── Sorting ── */
  // Regex específica para sort por buraco (h0..h17). Não confundir com "hcp",
  // que também começa por "h" — daí o \d+ exige pelo menos um dígito.
  const HOLE_RE = /^h\d+$/;
  const sortedGrouped = useMemo(() => {
    const INF = 9999;
    function cmp(a: PRow, b: PRow) {
      if (sortKey === "topar" || sortKey === "gross" || HOLE_RE.test(sortKey)) {
        const bestVal = (row: PRow): number => {
          const vals = row.rds
            .filter((rd) => rd != null)
            .map((rd) => {
              if (sortKey === "topar") return rd!.toPar ?? INF;
              if (sortKey === "gross") return rd!.gross ?? INF;
              const v = rd!.scores?.[parseInt(sortKey.slice(1))];
              return v && v > 0 ? v : INF;
            });
          return vals.length ? Math.min(...vals) : INF;
        };
        const av = bestVal(a), bv = bestVal(b);
        return sortDir === "asc" ? av - bv : bv - av;
      }
      // Out / In — melhor (menor) volta nas 9 da frente / de trás
      if (sortKey === "out" || sortKey === "in") {
        const f = sortKey === "out" ? frontSum : backSum;
        const best = (row: PRow): number => {
          const vals = row.rds.filter((rd): rd is RdData => rd != null).map((rd) => { const v = f(rd); return v > 0 ? v : INF; });
          return vals.length ? Math.min(...vals) : INF;
        };
        return sortDir === "asc" ? best(a) - best(b) : best(b) - best(a);
      }
      // Birdies / Pares / Bogeys — melhor ronda do jogador no torneio
      if (sortKey === "eag" || sortKey === "bird" || sortKey === "par" || sortKey === "bog") {
        const pick = (rd: RdData) => sortKey === "eag" ? rd.eags : sortKey === "bird" ? rd.birds : sortKey === "par" ? rd.pars : rd.bogs;
        const agg = (row: PRow): number => {
          const vals = row.rds.filter((rd): rd is RdData => rd != null).map(pick);
          if (!vals.length) return sortKey === "bog" ? INF : -1;
          return sortKey === "bog" ? Math.min(...vals) : Math.max(...vals);
        };
        const av = agg(a), bv = agg(b);
        // bird/par: mais primeiro em asc. bog: menos primeiro em asc.
        if (sortKey === "bog") return sortDir === "asc" ? av - bv : bv - av;
        return sortDir === "asc" ? bv - av : av - bv;
      }
      switch (sortKey) {
        case "pos":
          return sortDir === "asc" ? (a.pos ?? INF) - (b.pos ?? INF) : (b.pos ?? INF) - (a.pos ?? INF);
        case "name":
          return sortDir === "asc" ? a.name.localeCompare(b.name, "pt") : b.name.localeCompare(a.name, "pt");
        case "club":
          return sortDir === "asc" ? a.club.localeCompare(b.club, "pt") : b.club.localeCompare(a.club, "pt");
        case "hcp":
          return sortDir === "asc" ? (a.hcp ?? INF) - (b.hcp ?? INF) : (b.hcp ?? INF) - (a.hcp ?? INF);
        default:
          return 0;
      }
    }
    // WD vão sempre ao fundo, mas ENTRE WDs também respeitam o cmp escolhido.
    return [
      ...rankedGrouped.filter((r) => r.total != null && !r.isWD).sort(cmp),
      ...rankedGrouped.filter((r) => r.total == null && !r.isWD).sort(cmp),
      ...rankedGrouped.filter((r) => r.isWD).sort(cmp),
    ];
  }, [rankedGrouped, sortKey, sortDir]);

  const sortedFlat = useMemo(() => {
    const INF = 9999;
    function cmp(a: FlatRow, b: FlatRow) {
      if (sortKey === "topar") {
        const d = (a.rd.toPar ?? INF) - (b.rd.toPar ?? INF);
        return sortDir === "asc" ? d : -d;
      }
      if (sortKey === "gross") {
        const d = (a.rd.gross ?? INF) - (b.rd.gross ?? INF);
        return sortDir === "asc" ? d : -d;
      }
      if (HOLE_RE.test(sortKey)) {
        const h = parseInt(sortKey.slice(1));
        const va = a.rd.scores?.[h];
        const vb = b.rd.scores?.[h];
        const av = va && va > 0 ? va : INF;
        const bv = vb && vb > 0 ? vb : INF;
        const d = av - bv;
        return sortDir === "asc" ? d : -d;
      }
      if (sortKey === "out" || sortKey === "in") {
        const f = sortKey === "out" ? frontSum : backSum;
        const av = f(a.rd) || INF, bv = f(b.rd) || INF;
        return sortDir === "asc" ? av - bv : bv - av;
      }
      if (sortKey === "eag" || sortKey === "bird" || sortKey === "par" || sortKey === "bog") {
        const pick = (rd: RdData) => sortKey === "eag" ? rd.eags : sortKey === "bird" ? rd.birds : sortKey === "par" ? rd.pars : rd.bogs;
        const av = pick(a.rd), bv = pick(b.rd);
        if (sortKey === "bog") return sortDir === "asc" ? av - bv : bv - av;
        return sortDir === "asc" ? bv - av : av - bv;
      }
      switch (sortKey) {
        case "pos":
          return sortDir === "asc" ? (a.pos ?? INF) - (b.pos ?? INF) : (b.pos ?? INF) - (a.pos ?? INF);
        case "name":
          return sortDir === "asc" ? a.name.localeCompare(b.name, "pt") : b.name.localeCompare(a.name, "pt");
        case "club":
          return sortDir === "asc" ? a.club.localeCompare(b.club, "pt") : b.club.localeCompare(a.club, "pt");
        case "hcp":
          return sortDir === "asc" ? (a.hcp ?? INF) - (b.hcp ?? INF) : (b.hcp ?? INF) - (a.hcp ?? INF);
        default:
          return 0;
      }
    }
    return [
      ...rankedFlat.filter((r) => !r.isWD).sort(cmp),
      ...rankedFlat.filter((r) => r.isWD).sort(cmp),
    ];
  }, [rankedFlat, sortKey, sortDir]);

  /* ── Filtering ── */
  const gDisplayed = useMemo(() => {
    const q = nameQ.toLowerCase();
    return sortedGrouped.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || r.club.toLowerCase().includes(q)) &&
        (!clubQ || r.club === clubQ) &&
        (escFilter.length === 0 || (r.esc && escFilter.includes(r.esc))) &&
        (teeFilter.length === 0 || (r.teeName && teeFilter.includes(r.teeName))),
    );
  }, [sortedGrouped, nameQ, clubQ, escFilter, teeFilter]);

  const displayed = useMemo(() => {
    const q = nameQ.toLowerCase();
    return sortedFlat.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || r.club.toLowerCase().includes(q)) &&
        (!clubQ || r.club === clubQ) &&
        (escFilter.length === 0 || (r.esc && escFilter.includes(r.esc))) &&
        (teeFilter.length === 0 || (r.teeName && teeFilter.includes(r.teeName))),
    );
  }, [sortedFlat, nameQ, clubQ, escFilter, teeFilter]);

  const availClubs = useMemo(() => {
    const s = new Set<string>();
    for (const r of sortedGrouped) if (r.club) s.add(r.club);
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [sortedGrouped]);

  const availEsc = useMemo(() => {
    const s = new Set<string>();
    for (const r of sortedGrouped) if (r.esc) s.add(r.esc);
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [sortedGrouped]);

  const availTees = useMemo(() => {
    const s = new Set<string>();
    for (const r of sortedGrouped) if (r.teeName) s.add(r.teeName);
    return [...s].sort();
  }, [sortedGrouped]);

  return {
    par, si, meters, nh, is9, parF9, parB9, parTot, hasSI, hasMeters, playedRounds, roundRefs,
    gDisplayed, displayed,
    groupMode, setGroupMode, showSC, setShowSC,
    nameQ, setNameQ, clubQ, setClubQ,
    escFilter, setEscFilter, toggleEsc: (e: string) => setEscFilter(toggleArr(escFilter, e)),
    teeFilter, setTeeFilter, toggleTee: (t: string) => setTeeFilter(toggleArr(teeFilter, t)),
    sortKey, sortDir, toggleSort,
    availClubs, availEsc, availTees,
    clearFilter: () => { setNameQ(""); setClubQ(""); setEscFilter([]); setTeeFilter([]); },
  };
}
