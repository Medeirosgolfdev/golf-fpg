// @refresh reset
/**
 * DrivePage.tsx — DRIVE Tour & Challenge + AQUAPOR Results 2026
 * v10: Reads scraper v7 format directly (fedCode, roundScores)
 *      + multi-round support (R1/R2/Total tabs)
 */
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useSort } from "../hooks/useSort";
import { loadPlayers } from "../data/loader";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { SC, sdClassByHcp, scClass, medalColor } from "../utils/scoreDisplay";
import { calcAGS, expectedSD9 } from "../utils/whsCalc";
import { fmtToPar, fmtDateShort, fmtHcp, medal, fpgDrawUrl, fpgScoringUrl, fpgAdmissionsUrl, shortDateSlash } from "../utils/format";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import { resolveFedsInTournaments , buildEscLookup, resolveEscFromLookup, escPillCls, normalizePlayer } from "../utils/playerUtils";
import { TournSidebarItem, type SidebarItemTournament } from "../ui/TournSidebarItem";
import { PILL_TCODE, EscPill, SIDEBAR_ACCENT, RoundPill } from "../ui/PillBadge";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarSep } from "../ui/Toolbar";
import PlayerLink from "../ui/PlayerLink";
import EmptyState from "../ui/EmptyState";
import { useMasterDetail } from "../hooks/useMasterDetail";
import KpiCard from "../ui/KpiCard";
import LoadingState from "../ui/LoadingState";
import { ScorecardLeaderboard } from "../ui/ScorecardLeaderboard";
import SexBadge from "../ui/SexBadge";
import { C } from "../utils/colors";
import { CrossSeasonTable, SortTh as _CSortTh } from "../ui/CrossSeasonTable";
// Wrapper que aceita style (não incluído nos props originais de SortTh)
const CSortTh = _CSortTh as React.ComponentType<React.ComponentProps<typeof _CSortTh> & { style?: React.CSSProperties }>;
import { MultiRoundLeaderboard } from "../ui/MultiRoundLeaderboard";
import type { MRRound, MultiRoundRow } from "../ui/multiRoundTypes";
import {
  isManuel,
  fmtTP,
  tpColor,
  TeeDot,
  SDPill,
  TournPName,
  type PlayersDB,
} from "../ui/tournamentPrimitives";
import { ResumoTable } from "../ui/ResumoTable";
import DriveAllRoundsScorecardLB from "../ui/DriveAllRoundsScorecardLB";
import { loadFpgAdmissionsDraws, indexFpgAdmissionsDraws } from "../data/nacional2026Loader";
import AdmissionsTab from "../ui/AdmissionsTab";
import DrawTab from "../ui/DrawTab";
import TournamentGrid from "../ui/TournamentGrid";
import { expandMultiRound, isDNS } from "../ui/driveUtils";
import type {
  Tournament,
  Player,
  DriveData,
  SDLookup,
  RoundScore,
  TStats,
} from "../ui/driveTypes";

/* ── Types ── */

/* ── Normalizer: imported from playerUtils ── */

function normalizeTournament(t: any): Tournament {
  return { ...t, players: (t.players || []).map(normalizePlayer) };
}
type SortKey = string;

/* ── Constants ── */
const REGIONS = [
  { id: "norte",   label: "Norte",   emoji: "📍", color: "var(--accent)", bg: "var(--accent-light)" },
  { id: "tejo",    label: "Tejo",    emoji: "📍", color: "var(--accent)", bg: "var(--accent-light)" },
  { id: "sul",     label: "Sul",     emoji: "📍", color: "var(--accent)", bg: "var(--accent-light)" },
  { id: "madeira", label: "Madeira", emoji: "📍", color: "var(--accent)", bg: "var(--accent-light)" },
  { id: "acores",  label: "Açores",  emoji: "📍", color: "var(--accent)", bg: "var(--accent-light)" },
];
const ESCALOES = ["Sub 10", "Sub 12", "Sub 14", "Sub 16", "Sub 18"];
const regionOf = (id: string) => REGIONS.find((r) => r.id === id);

/* ── WHS Expected 9h SD table ── */

/* ── Helpers ── */

/** URL público do torneio em scoring.datagolf.pt */

function computeStats(p: Player, sdLookup: SDLookup): TStats | null {
  if (isDNS(p)) return null;
  const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
  if (gross == null || isNaN(gross as number)) return null;
  const g = gross as number;

  // Flat fields may be absent when player uses roundScores format;
  // fall back to roundScores[0] for single-round tournaments
  const rs0 = p.roundScores?.[0];
  const parArr = p.par?.length ? p.par : rs0?.pars || [];
  const scores = p.scores?.length ? p.scores : rs0?.scores || [];
  const si = p.si?.length ? p.si : rs0?.si || [];
  const cr = p.courseRating ?? rs0?.courseRating;
  const slope = p.slope ?? rs0?.slope;

  const parT = p.parTotal || parArr.reduce((a, b) => a + b, 0);
  const tp = g - parT;
  const nh = p.nholes || scores.length || parArr.length || 18;
  const is9 = nh <= 9;

  let sd18: number | null = null;
  let sdSource: "fpg" | "ags" | "raw" | null = null;

  // Skip SD calculation for multi-round combined entries (nholes > 18)
  if (nh <= 18) {
    // 1) FPG lookup by scoreId
    const sid = String(p.scoreId);
    if (sdLookup[sid] != null) {
      sd18 = sdLookup[sid];
      sdSource = "fpg";
    }
    // 2) AGS calculation (needs SI data)
    else if (cr && slope && p.hcpExact != null && si.length >= nh && scores.length >= nh && parArr.length >= nh) {
      const adjGross = calcAGS(scores, parArr, si, cr, slope, p.hcpExact, nh);
      const rawSD = (113 / slope) * (adjGross - cr);
      sd18 = is9 ? rawSD + expectedSD9(p.hcpExact) : rawSD;
      sdSource = "ags";
    }
    // 3) Raw fallback (no SI)
    else if (cr && slope) {
      const rawSD = (113 / slope) * (g - cr);
      if (is9 && p.hcpExact != null) {
        sd18 = rawSD + expectedSD9(p.hcpExact);
      } else if (!is9) {
        sd18 = rawSD;
      }
      sdSource = sd18 != null ? "raw" : null;
    }
  }

  let birdies = 0, pars = 0, bogeys = 0;
  // If player has multiple roundScores, count across all rounds
  if (p.roundScores && p.roundScores.length > 1) {
    for (const rs of p.roundScores) {
      const rScores = rs.scores || [];
      const rPars = rs.pars || [];
      for (let i = 0; i < rScores.length && i < rPars.length; i++) {
        const d = rScores[i] - rPars[i];
        if (d <= -1) birdies++;
        else if (d === 0) pars++;
        else bogeys++;
      }
    }
  } else {
    for (let i = 0; i < scores.length && i < parArr.length; i++) {
      const d = scores[i] - parArr[i];
      if (d <= -1) birdies++;
      else if (d === 0) pars++;
      else bogeys++;
    }
  }
  return { pos: p.pos, gross: g, toPar: tp, sd18, sdSource, nholes: nh, birdies, pars, bogeys };
}

function uniquePC(ts: Tournament[]): number {
  const s = new Set<string>();
  for (const t of ts) for (const p of t.players) if (!isDNS(p)) s.add(p.fed || p.name);
  return s.size;
}
function countEvents(ts: Tournament[]): number {
  const s = new Set<string>();
  for (const t of ts) {
    // Para torneios multi-ronda expandidos, contar só o grupo uma vez
    const key = t._multiGroup || (t.region + "-" + t.num + "-" + t.date);
    s.add(key);
  }
  return s.size;
}

/* ── Escalão helpers (for Tour/AQUAPOR where players are mixed) ── */
type EscLookup = Map<string, string>; // fedCode → normalized escalão ("Sub 12")

/** Build global escalão lookup: playersDB → Challenge tournament data */


/**
 * Temporal escalão lookup: fedCode → Map<year, escalão>
 * Construído a partir dos torneios Challenge (que têm t.escalao explícito).
 * Permite saber o escalão de um jogador NUM ANO ESPECÍFICO, não apenas o actual.
 */
function buildTemporalEscLookup(tournaments: Tournament[]): Map<string, Map<string, string>> {
  const map = new Map<string, Map<string, string>>();
  for (const t of tournaments) {
    if (t.series !== "challenge" || !t.escalao) continue;
    // Ignorar rondas expandidas (R1/R2) — só o torneio base ou Total
    if (t._roundLabel && t._roundLabel !== "Resumo") continue;
    const year = t.date?.split("-")[0];
    if (!year) continue;
    for (const p of t.players) {
      const fed = p.fed || p.fedCode || "";
      if (!fed) continue;
      if (!map.has(fed)) map.set(fed, new Map());
      // Não sobrescrever se já existe para este ano (primeiro torneio encontrado ganha)
      if (!map.get(fed)!.has(year)) map.get(fed)!.set(year, t.escalao!);
    }
  }
  return map;
}

/**
 * Resolve o escalão de um jogador para um ANO específico:
 * 1) Procura no temporalEscLookup pelo ano do torneio
 * 2) Fallback para o escLookup global (atual)
 */
function resolveEscTemporal(
  p: Player,
  year: string | null | undefined,
  temporalLookup: Map<string, Map<string, string>>,
  fallback: EscLookup
): string {
  const fed = p.fed || p.fedCode || "";
  if (fed && year) {
    const y = temporalLookup.get(fed)?.get(year);
    if (y) return y;
  }
  return resolveEscFromLookup(p, fallback);
}

const resolveEsc = (p: Player, escLookup: EscLookup): string => resolveEscFromLookup(p, escLookup);

/** Get available escalões from a set of tournaments (sorted by ESCALOES order) */
/**
 * Resolve o escalão de um jogador PARA EFEITOS DE FILTRO (não para o pill visual):
 * 1. Se o torneio tem t.escalao definido (Drive Challenge) → usa-o directamente
 *    (todos os jogadores desse torneio competiram nesse escalão)
 * 2. Senão → procura no temporalLookup pelo ano do torneio
 * 3. Fallback → escLookup global (actual)
 */
function resolveEscFilter(
  p: Player,
  t: Tournament,
  temporalLookup: Map<string, Map<string, string>>,
  escLookup: EscLookup
): string {
  if (t.escalao) return t.escalao;
  const year = t.date?.split("-")[0];
  return resolveEscTemporal(p, year, temporalLookup, escLookup);
}

function availEscaloes(
  tournaments: Tournament[],
  escLookup: EscLookup,
  temporalLookup?: Map<string, Map<string, string>>
): string[] {
  const s = new Set<string>();
  for (const t of tournaments) {
    for (const p of t.players) {
      if (isDNS(p)) continue;
      const e = temporalLookup
        ? resolveEscFilter(p, t, temporalLookup, escLookup)
        : resolveEsc(p, escLookup);
      if (e) s.add(e);
    }
  }
  const ordered = ESCALOES.filter(e => s.has(e));
  for (const e of s) {
    if (!ordered.includes(e)) ordered.push(e);
  }
  return ordered;
}

/** Filter tournaments keeping only players of a given escalão; recalculate positions */
function filterTournByEsc(
  tournaments: Tournament[],
  escs: string[],
  escLookup: EscLookup,
  temporalLookup?: Map<string, Map<string, string>>
): Tournament[] {
  return tournaments.map(t => {
    const filtered = t.players.filter(p => {
      if (isDNS(p)) return false;
      // Usar resolveEscFilter: t.escalao tem prioridade (Challenge já está separado por escalão)
      const esc = temporalLookup
        ? resolveEscFilter(p, t, temporalLookup, escLookup)
        : resolveEsc(p, escLookup);
      return escs.includes(esc);
    });
    if (!filtered.length) return null;
    // Recalculate positions
    const sorted = [...filtered].sort((a, b) => {
      if (a._incomplete && !b._incomplete) return 1;
      if (!a._incomplete && b._incomplete) return -1;
      const ag = typeof a.grossTotal === "string" ? parseInt(a.grossTotal) : (a.grossTotal as number ?? 999);
      const bg = typeof b.grossTotal === "string" ? parseInt(b.grossTotal) : (b.grossTotal as number ?? 999);
      return ag - bg;
    });
    let pos = 1;
    sorted.forEach((p, i) => {
      if (p._incomplete) { p.pos = "INC"; return; }
      if (i > 0) {
        const prev = sorted[i - 1];
        if (!prev._incomplete) {
          const ag = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number ?? 999);
          const bg = typeof prev.grossTotal === "string" ? parseInt(prev.grossTotal) : (prev.grossTotal as number ?? 999);
          if (ag !== bg) pos = i + 1;
        }
      }
      p.pos = pos;
    });
    return { ...t, players: sorted, playerCount: sorted.length };
  }).filter(Boolean) as Tournament[];
}

/** Count unique players matching an escalão across tournaments */
function _uniqueEscPC(ts: Tournament[], esc: string, escLookup: EscLookup): number {
  const s = new Set<string>();
  for (const t of ts) {
    for (const p of t.players) {
      if (isDNS(p)) continue;
      if (resolveEsc(p, escLookup) === esc) s.add(p.fed || p.name);
    }
  }
  return s.size;
}
const shortCampo = (c: string) =>
  c?.replace(/Vilamoura - /g, "").replace(/ \(.*\)/, "").replace(/ - .*/, "")
    .replace(/ Golf/g, "").replace(/Santo da Serra.*/, "Stº Serra") || "";

/* ── Player name (alias do primitivo partilhado) ── */
const PName = (props: { name: string; fed?: string; playersDB?: PlayersDB; highlight?: boolean }) =>
  <TournPName name={props.name} fed={props.fed} playersDB={props.playersDB} highlight={props.highlight} />;

/* ── SD cell ── */
function SDCell(props: { sd: number | null; sdSource: string | null; hcp: number | null; nholes: number; style?: React.CSSProperties }) {
  if (props.sd == null) return <td className="r" style={props.style}>–</td>;
  const cls = sdClassByHcp(props.sd, props.hcp);
  const is9 = props.nholes <= 9;
  const tip = props.sdSource === "fpg" ? "" : props.sdSource === "ags" ? "~" : "≈";
  return (
    <td className="r" style={props.style}>
      <span className={"p p-sm p-" + cls}>{props.sd.toFixed(1)}</span>
      {(is9 || tip) && <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 1 }}>{is9 && "*"}{tip}</span>}
    </td>
  );
}

/* ── Drive Tour Points table ── */
const DRIVE_POINTS: Record<number, number> = {
  1: 250, 2: 165, 3: 94, 4: 75, 5: 64, 6: 53, 7: 45,
  8: 38, 9: 33, 10: 30, 11: 27, 12: 26, 13: 24, 14: 23,
  15: 22, 16: 21, 17: 20, 18: 19, 19: 18,
};
function drivePoints(pos: number | string | null): number {
  if (pos == null) return 0;
  const n = Number(pos);
  if (isNaN(n) || n <= 0) return 0;
  return DRIVE_POINTS[n] ?? 0;
}

/* ═══════════════════════════════════════════════════════
   DRIVE POINTS TABLE (tabela de referência de pontos)
   ═══════════════════════════════════════════════════════ */
function DrivePointsTable() {
  const [open, setOpen] = React.useState(false);
  const entries = Object.entries(DRIVE_POINTS).map(([pos, pts]) => ({ pos: Number(pos), pts }));
  const half = Math.ceil(entries.length / 2);
  const col1 = entries.slice(0, half);
  const col2 = entries.slice(half);

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <span className="h-md fs-13">🏅 Tabela de Pontos Drive Tour</span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{open ? "▲ fechar" : "▼ ver"}</span>
      </button>
      {open && (
        <div className="mt-10">
          <div className="muted fs-11 mb-8">Pontos atribuídos por posição final em cada torneio.</div>
          <div className="flex-wrap" style={{ display: "flex", gap: 24 }}>
            {[col1, col2].map((col, ci) => (
              <table key={ci} className="dtable tbl-compact" style={{ width: "auto", minWidth: 140 }}>
                <thead>
                  <tr>
                    <th className="r" style={{ width: 40 }}>Pos</th>
                    <th className="r fw-800" style={{ width: 60, color: "var(--color-warn-dark)" }}>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {col.map(({ pos, pts }) => (
                    <tr key={pos}>
                      <td className="r fw-700" style={{ color: medalColor(pos) ?? "var(--text)" }}>
                        {medal(pos) ?? pos + "º"}
                      </td>
                      <td className="r fw-800" style={{ color: "var(--color-warn-dark)" }}>{pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SCORECARD LEADERBOARD
   Colunas idênticas ao Diversos: ESC · CLUBE · HCP · TEE · Tot · ± · SD · 🐦 · Par · ■
   ═══════════════════════════════════════════════════════ */
function ScorecardLB(props: { tournament: Tournament; playersDB: PlayersDB; escLookup: EscLookup; sdLookup: SDLookup; temporalEscLookup?: Map<string, Map<string, string>> }) {
  const { tournament, playersDB, escLookup, sdLookup, temporalEscLookup } = props;
  const tournYear = tournament.date?.split("-")[0];
  const [showScorecard, setShowScorecard] = React.useState(true);
  const { sortKey, sortDir, toggleSort: handleSort } = useSort<"pos"|"esc"|"tee"|"hcp"|"sd">("pos");

  const players = tournament.players.filter((p) => !isDNS(p) && ((p.scores && p.scores.length > 0) || (p.roundScores?.[0]?.scores?.length ?? 0) > 0));
  if (!players.length) return <EmptyState size="sm" message="Scorecards não disponíveis." />;

  const refP = players[0];
  const rs0 = refP.roundScores?.[0];
  const par = refP.par?.length ? refP.par : rs0?.pars || [];
  const nh = par.length;
  const parTotal = par.reduce((a, b) => a + b, 0);
  const si = refP.si?.length ? refP.si : rs0?.si || [];

  // Colectar metros por tee (cada tee distinto gera uma linha)
  const teeMetersMap = new Map<string, number[]>();
  for (const p of players) {
    const prs = p.roundScores?.[0];
    const tn = p.teeName || prs?.teeName;
    const m = prs?.meters?.length ? prs.meters : p.meters;
    if (tn && m?.length && m.length >= nh && !teeMetersMap.has(tn)) {
      teeMetersMap.set(tn, m);
    }
  }
  const teeMeters = Array.from(teeMetersMap.entries()).map(([teeName, meters]) => ({ teeName, meters }));

  // Ordenar por pos (gross) primeiro para calcular _dp
  const byGross = [...players].sort((a, b) => {
    const ag = typeof a.grossTotal === "string" ? parseInt(a.grossTotal) : (a.grossTotal as number ?? 999);
    const bg = typeof b.grossTotal === "string" ? parseInt(b.grossTotal) : (b.grossTotal as number ?? 999);
    return ag - bg;
  });
  let posCounter = 1;
  byGross.forEach((p, i) => {
    if (i > 0) {
      const prev = typeof byGross[i - 1].grossTotal === "string" ? parseInt(byGross[i - 1].grossTotal as string) : byGross[i - 1].grossTotal;
      const cur = typeof p.grossTotal === "string" ? parseInt(p.grossTotal as string) : p.grossTotal;
      if (cur !== prev) posCounter = i + 1;
    }
    p._dp = posCounter;
  });
  const grosses = byGross.map((p) => typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number)).filter((g) => !isNaN(g));
  const avg = grosses.length ? grosses.reduce((a, b) => a + b, 0) / grosses.length : 0;

  // Resolver escalão e stats por jogador antes de ordenar
  const ESC_ORDER = ["Sub 10","Sub 12","Sub 14","Sub 16","Sub 18"];
  const escOf = (p: Player) => (temporalEscLookup
    ? resolveEscTemporal(p, tournYear, temporalEscLookup, escLookup)
    : resolveEsc(p, escLookup, { tournamentDate: tournament.date, playersDB })) || tournament.escalao || "";
  const sdOf = (p: Player) => computeStats(p, sdLookup)?.sd18 ?? null;

  const mult = sortDir === "asc" ? 1 : -1;
  const INF = 9999;
  const sorted = [...byGross].sort((a, b) => {
    if (sortKey === "pos") {
      return mult * ((a._dp ?? INF) - (b._dp ?? INF));
    }
    if (sortKey === "esc") {
      const ai = ESC_ORDER.indexOf(escOf(a)); const bi = ESC_ORDER.indexOf(escOf(b));
      const av = ai >= 0 ? ai : INF; const bv = bi >= 0 ? bi : INF;
      if (av !== bv) return mult * (av - bv);
      // secundário: pos
      return (a._dp ?? INF) - (b._dp ?? INF);
    }
    if (sortKey === "tee") {
      const av = a.teeName || ""; const bv = b.teeName || "";
      const cmp = av.localeCompare(bv);
      if (cmp !== 0) return mult * cmp;
      return (a._dp ?? INF) - (b._dp ?? INF);
    }
    if (sortKey === "hcp") {
      const av = a.hcpExact ?? INF; const bv = b.hcpExact ?? INF;
      if (av !== bv) return mult * (av - bv);
      return (a._dp ?? INF) - (b._dp ?? INF);
    }
    if (sortKey === "sd") {
      const av = sdOf(a) ?? INF; const bv = sdOf(b) ?? INF;
      if (av !== bv) return mult * (av - bv);
      return (a._dp ?? INF) - (b._dp ?? INF);
    }
    return 0;
  });

  const _bS = "1px solid var(--border-light)";

  const rows: import("../ui/ScorecardLeaderboard").ScorecardRow[] = sorted.map((p, idx) => {
    const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number);
    const dp = p._dp;
    const showP = idx === 0 || dp !== (sorted[idx - 1] as Player)._dp;
    const rowBg = isManuel(p) ? "var(--bg-success-subtle)" : undefined;
    const esc = (temporalEscLookup
      ? resolveEscTemporal(p, tournYear, temporalEscLookup, escLookup)
      : resolveEsc(p, escLookup, { tournamentDate: tournament.date, playersDB })) || tournament.escalao || "";
    const stats = computeStats(p, sdLookup);
    return {
      key: p.scoreId || idx,
      pos: showP ? dp : "",
      gross,
      toPar: gross - parTotal,
      scores: p.scores?.length ? p.scores : p.roundScores?.[0]?.scores,
      rowBg,
      isManuel: isManuel(p),
      nameContent: <PName name={p.name} fed={p.fed} playersDB={playersDB} highlight={isManuel(p)} />,
      prefixCells: <>
        <td className="lb-esc">{esc ? <EscPill esc={esc} /> : <span className="muted">–</span>}</td>
        <td className="lb-club">{p.club || "–"}</td>
        <td className="lb-hcp">{fmtHcp(p.hcpExact)}</td>
        <td className="lb-tee"><TeeDot teeName={p.teeName || p.roundScores?.[0]?.teeName} /></td>
      </>,
      postScorecardCells: <>
        <td className="lb-sd">
          {stats?.sd18 != null
            ? <SDPill sd={stats.sd18} source={stats.sdSource} hcp={p.hcpExact ?? null} />
            : <span className="muted">–</span>}
        </td>
        <td className="lb-bird">{stats?.birdies || ""}</td>
        <td className="lb-par-stat">{stats?.pars || ""}</td>
        <td className="lb-bog">{stats?.bogeys || ""}</td>
      </>,
    };
  });

  return (
    <ScorecardLeaderboard
      par={par}
      si={si.length >= nh ? si : undefined}
      teeMeters={teeMeters.length ? teeMeters : undefined}
      rows={rows}
      parLabelColSpan={4}
      postTotalColCount={0}
      postScorecardColCount={4}
      showScorecard={showScorecard}
      onToggleScorecard={() => setShowScorecard(v => !v)}
      metaLine={<>
        {sorted.length} jogadores · Par {parTotal} · {nh}h · Média: {avg.toFixed(1)} ({fmtTP(Math.round(avg - parTotal))})
        {refP.course && <> · 📍 {refP.course}</>}
        {refP.courseRating && <> · CR {refP.courseRating}</>}
        {refP.slope && <> · Slope {refP.slope}</>}
      </>}
      prefixHeaderCells={<>
        <th className={"lb-esc lb-sortable" + (sortKey==="esc" ? " lb-sort-active" : "")}
          onClick={() => handleSort("esc")} style={{cursor:"pointer"}}>
          ESC.{sortKey==="esc" ? (sortDir==="asc"?" ▲":" ▼") : ""}
        </th>
        <th className="lb-club">CLUBE</th>
        <th className={"lb-hcp lb-sortable" + (sortKey==="hcp" ? " lb-sort-active" : "")}
          onClick={() => handleSort("hcp")} style={{cursor:"pointer"}}>
          HCP{sortKey==="hcp" ? (sortDir==="asc"?" ▲":" ▼") : ""}
        </th>
        <th className={"lb-tee lb-sortable" + (sortKey==="tee" ? " lb-sort-active" : "")}
          onClick={() => handleSort("tee")} style={{cursor:"pointer"}}>
          TEE{sortKey==="tee" ? (sortDir==="asc"?" ▲":" ▼") : ""}
        </th>
      </>}
      postScorecardHeaderCells={<>
        <th className={"lb-sd lb-sortable" + (sortKey==="sd" ? " lb-sort-active" : "")}
          onClick={() => handleSort("sd")} style={{cursor:"pointer"}}>
          SD{sortKey==="sd" ? (sortDir==="asc"?" ▲":" ▼") : ""}
        </th>
        <th className="lb-bird">🐦</th>
        <th className="lb-par-stat">Par</th>
        <th className="lb-bog">■</th>
      </>}
      activeSortKey={sortKey === "pos" ? "pos" : ""}
      activeSortDir={sortDir}
    />
  );
}

/* ═══════════════════════════════════════════════════════
   ACUMULADO MULTI-RONDA — usa MultiRoundLeaderboard
   (local, sem importar FPGPage — evita loop HMR)
   ═══════════════════════════════════════════════════════ */
function DriveAccumulatedLB({ tournament, nRounds, escLookup, playersDB, sdLookup }: {
  tournament: Tournament; nRounds: number; escLookup: EscLookup; playersDB: PlayersDB; sdLookup: SDLookup;
}) {
  const rawPlayers = tournament.players;
  const complete = rawPlayers.filter(p => !p._incomplete);
  const incomplete = rawPlayers.filter(p => p._incomplete);
  const parPerRound = complete[0]?.parTotal ?? incomplete[0]?.parTotal ?? 72;

  const rows: MultiRoundRow[] = useMemo(() => rawPlayers.map(p => {
    const esc = resolveEsc(p, escLookup, { tournamentDate: tournament.date, playersDB }) || tournament.escalao || "";
    const roundScores = p.roundScores || [];
    const mappedRounds: MRRound[] = Array.from({ length: nRounds }, (_, i) => {
      const rdNum = i + 1;
      const rs = roundScores.find(r => r.round === rdNum);
      if (!rs) return { gross: null };
      // Build a single-round player for SD calc
      const sdP: Player = { ...p, scores: rs.scores, par: rs.pars, si: rs.si,
        courseRating: rs.courseRating, slope: rs.slope, nholes: rs.pars?.length,
        grossTotal: rs.gross, roundScores: [rs] };
      const stats = computeStats(sdP, sdLookup);
      let birdies = 0, pars = 0, bogeys = 0;
      for (let j = 0; j < (rs.scores?.length ?? 0); j++) {
        const d = (rs.scores[j] || 0) - (rs.pars[j] || 0);
        if (d <= -1) birdies++; else if (d === 0) pars++; else bogeys++;
      }
      return {
        gross: rs.gross,
        parPerRound: rs.pars?.reduce((a: number, b: number) => a + b, 0) || parPerRound,
        sd: stats?.sd18 ?? null, sdSource: stats?.sdSource ?? null,
        birdies, pars, bogeys,
      };
    });
    const numGross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number) ?? 999;
    return {
      key: p.scoreId || p.name,
      name: p.name,
      fed: p.fed || p.fedCode,
      club: p.club || "",
      hcp: p.hcpExact ?? null,
      esc: esc || undefined,
      teeName: p.teeName,
      pos: typeof p.pos === "number" ? p.pos : parseInt(String(p.pos)) || 999,
      gross: numGross,
      toPar: numGross - parPerRound * nRounds,
      parTotal: parPerRound * nRounds,
      isIncomplete: !!p._incomplete,
      isWD: !!p._wd,
      isHighlighted: isManuel(p),
      rounds: mappedRounds,
    };
  }), [rawPlayers, escLookup, nRounds, parPerRound, sdLookup, tournament.escalao]);

  if (!rawPlayers.length) return <EmptyState size="sm" message="Sem resultados." />;

  const refP0 = complete[0] ?? rawPlayers[0];
  const refRS = refP0?.roundScores?.find(rs => rs.round === 1);
  const cr = refRS?.courseRating ?? refP0?.courseRating;
  const slope = refRS?.slope ?? refP0?.slope;
  const campo = tournament.campo || "";
  const grosses = complete.map(p => typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number)).filter(g => !isNaN(g) && g > 0);
  const avgGross = grosses.length ? grosses.reduce((a, b) => a + b, 0) / grosses.length : null;

  const infoParts: (string | null)[] = [
    `${complete.length} classif.`,
    incomplete.length > 0 ? `${incomplete.length} inc.` : null,
    `Par ${parPerRound * nRounds}`,
    avgGross != null ? `Média ${avgGross.toFixed(1)} (${avgGross - parPerRound * nRounds >= 0 ? "+" : ""}${(avgGross - parPerRound * nRounds).toFixed(1)})` : null,
    campo ? `📍 ${campo}` : null,
    cr ? `CR ${cr}` : null,
    slope ? `Slope ${slope}` : null,
  ];

  return (
    <div>
      <div className="muted fs-11 mb-8 p-0-4px">{infoParts.filter(Boolean).map((s, i) => <React.Fragment key={i}>{i > 0 && " · "}{s}</React.Fragment>)}</div>
      <MultiRoundLeaderboard
        rows={rows}
        nRounds={nRounds}
        playersDB={playersDB}
        showCols={{ esc: true, fed: true, tee: true }}
        sortable
        filterable
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SCORECARD COMBINADO — moved to DriveAllRoundsScorecardLB.tsx
   ═══════════════════════════════════════════════════════ */

/** A display group: either a single tournament or a multi-round set (R1+R2+Total) */
interface TournGroup {
  key: string;
  label: string;       // tab label
  campo: string;
  num: number;
  date: string;
  escalao: string | null; // para Challenge single-escalão ou null quando evento agrupa vários
  isMulti: boolean;    // multi-ronda (R1/R2/Total)
  isEvent: boolean;    // Challenge: vários escalões no mesmo dia/campo → tabs por escalão
  totalRounds: number;
  entries: Tournament[];  // 1 para single, N+1 para multi-ronda, N escalões para isEvent
}

function buildGroups(tournaments: Tournament[]): TournGroup[] {
  const escIdx = (esc: string | null) => {
    const i = ESCALOES.indexOf(esc || "");
    return i >= 0 ? i : 99;
  };
  const sorted = [...tournaments].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return escIdx(a.escalao) - escIdx(b.escalao);
  });
  const groups: TournGroup[] = [];
  const multiMap   = new Map<string, Tournament[]>();
  const eventMap   = new Map<string, Tournament[]>(); // Challenge: date+ccode → escalões
  const singles: Tournament[] = [];

  for (const t of sorted) {
    if (t._multiGroup) {
      if (!multiMap.has(t._multiGroup)) multiMap.set(t._multiGroup, []);
      multiMap.get(t._multiGroup)!.push(t);
    } else if (t.series === "challenge" && t.escalao && !t._roundLabel) {
      // Challenge: agrupar por data + campo (ccode) — vários escalões no mesmo evento
      const eventKey = "ev-" + t.date + "-" + (t.ccode || t.campo);
      if (!eventMap.has(eventKey)) eventMap.set(eventKey, []);
      eventMap.get(eventKey)!.push(t);
    } else {
      singles.push(t);
    }
  }

  const seen = new Set<string>();
  for (const t of sorted) {
    if (t._multiGroup) {
      if (seen.has(t._multiGroup)) continue;
      seen.add(t._multiGroup);
      const entries = multiMap.get(t._multiGroup)!;
      entries.sort((a, b) => {
        if (a._roundLabel === "Resumo") return 1;
        if (b._roundLabel === "Resumo") return -1;
        return (a._roundLabel || "").localeCompare(b._roundLabel || "");
      });
      groups.push({
        key: t._multiGroup,
        label: shortCampo(t.campo),
        campo: t.campo,
        num: t.num,
        date: t.date,
        escalao: t.escalao ?? null,
        isMulti: true,
        isEvent: false,
        totalRounds: t._totalRounds || 2,
        entries,
      });
    } else if (t.series === "challenge" && t.escalao && !t._roundLabel) {
      const eventKey = "ev-" + t.date + "-" + (t.ccode || t.campo);
      if (seen.has(eventKey)) continue;
      seen.add(eventKey);
      const entries = (eventMap.get(eventKey) || []).sort((a, b) => escIdx(a.escalao) - escIdx(b.escalao));
      const nEscs = entries.length;
      groups.push({
        key: eventKey,
        label: shortCampo(t.campo),
        campo: t.campo,
        num: t.num,
        date: t.date,
        escalao: nEscs === 1 ? entries[0].escalao : null, // null quando tem vários escalões
        isMulti: false,
        isEvent: nEscs > 1,
        totalRounds: 1,
        entries,
      });
    } else {
      groups.push({
        key: t.tcode + "_" + t.date,
        label: shortCampo(t.campo),
        campo: t.campo,
        num: t.num,
        date: t.date,
        escalao: t.escalao ?? null,
        isMulti: false,
        isEvent: false,
        totalRounds: 1,
        entries: [t],
      });
    }
  }
  return groups;
}


/* ═══════════════════════════════════════════════════════
   MAIN — DriveContent com sidebar coerente
   ═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   SUB-12: Types & Data
   ═══════════════════════════════════════════════════════ */
interface TournResult {
  tournKey: string; tournName: string; tournShort: string;
  date: string; dateSort: number; campo: string; region: string;
  series: "tour" | "challenge" | "aquapor";
  gross: number; toPar: number; sd: number | null; sdSource: "fpg" | "ags" | "raw" | null;
  pos: number | string | null; totalPlayers: number;
  nholes: number; birdies: number; pars: number; bogeys: number;
}
interface Sub12Row {
  fed: string; name: string; club: string; region: string; sex: string; hcp: number | null;
  results: TournResult[];
  avgGross: number | null; avgSD: number | null; bestGross: number | null; bestSD: number | null; tourneiosPlayed: number;
  totalBird: number; totalPars: number; totalBog: number; totalPts: number;
}
type Sub12SeriesTab = "tour" | "challenge" | "aquapor";
type Sub12ViewTab = "grid" | "ranking" | "evolucao";

const SUB12_SERIES_TABS: { key: Sub12SeriesTab; label: string; emoji: string; color: string; bg: string; holes: string }[] = [
  { key: "tour",      label: "Tour",      emoji: "🏌️", color: "var(--color-teal)", bg: C.bgSuccessSubtle, holes: "18h" },
  { key: "challenge", label: "Challenge", emoji: "⚡",  color: C.chartPurple, bg: "var(--bg-purple)", holes: "9h"  },
  { key: "aquapor",   label: "AQUAPOR",   emoji: "💧", color: "var(--chart-5)", bg: "var(--bg-info-strong)", holes: "18h" },
];
const CHART_COLORS = C.charts;
const SERIE_COLORS: Record<string, string> = { tour: "var(--color-teal)", challenge: C.chartPurple, aquapor: "var(--chart-5)" };
const SERIE_LABELS: Record<string, string>  = { tour: "Tour",   challenge: "Challenge",  aquapor: "AQUAPOR" };
const REGION_EMOJI: Record<string, string>  = { norte: "🔵", tejo: "🟡", sul: "🟢", madeira: "🟣", acores: "🔴", nacional: "⚪" };

const numAvg = (nums: number[]): number | null => nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;

function isSub12(esc: string): boolean {
  if (!esc) return false;
  const n = esc.toLowerCase().replace(/[\s-]/g, "");
  return n === "sub10" || n === "sub12";
}
function _computeSDWithSource(p: Player, sdLookup: SDLookup): { sd: number | null; source: "fpg" | "ags" | "raw" | null } {
  const fed = p.fed || p.fedCode;
  if (fed && sdLookup[fed] != null) return { sd: sdLookup[fed], source: "fpg" };
  // Fall back to roundScores[0] for single-round tournaments with no flat fields
  const rs0 = p.roundScores?.[0];
  const scores = p.scores?.length ? p.scores : rs0?.scores || [];
  const parArr = p.par?.length ? p.par : rs0?.pars || [];
  const si = p.si?.length ? p.si : rs0?.si || [];
  const nholes = p.nholes || scores.length || parArr.length || 18;
  const parT = p.parTotal || (parArr.length ? parArr.reduce((a,b)=>a+b,0) : 72);
  const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number);
  if (gross == null || isNaN(gross)) return { sd: null, source: null };
  const cr = p.courseRating ?? rs0?.courseRating;
  const slope = p.slope ?? rs0?.slope;
  const hcp = p.hcpExact;
  if (cr && slope && hcp != null && scores.length >= nholes && parArr.length >= nholes && si.length >= nholes) {
    const ags = calcAGS(scores, parArr, si, cr, slope, hcp, nholes);
    // Fórmula WHS 2024 — idêntica a computeStats:
    // 18h: SD = (113/slope) × (AGS − CR)
    // 9h:  SD = rawSD + expectedSD9(hcp)  (regra 2024: SD dos 9h + expected dos restantes 9h)
    const rawSD = (113 / slope) * (ags - cr);
    const sd18 = nholes <= 9 ? rawSD + expectedSD9(hcp) : rawSD;
    return { sd: Math.round(sd18 * 10) / 10, source: "ags" };
  }
  // Fallback sem SI: raw gross (sem clip — SD pode ser negativo para jogadores de elite)
  if (cr && slope) {
    const rawSD = (113 / slope) * (gross - cr);
    const sd18 = nholes <= 9 && hcp != null ? rawSD + expectedSD9(hcp) : rawSD;
    return { sd: Math.round(sd18 * 10) / 10, source: "raw" };
  }
  return { sd: null, source: null };
}
function tournShort(t: Tournament): string {
  const num = t.num || "?";
  const isAq = t.series === "aquapor";
  const isCh = t.series === "challenge";
  const prefix = isAq ? "AQ" : isCh ? "DC" : "DT";
  if (t.name.toLowerCase().includes("final")) return `${prefix}F`;
  let zona = "";
  if (t.region === "madeira") zona = "Mad";
  else if (t.region === "sul") zona = "Sul";
  else if (t.region === "norte") zona = "Nrt";
  else if (t.region === "tejo") zona = "Tjo";
  return `${prefix}${num} ${zona}`.trim();
}
function dateToSort(d: string): number {
  if (!d) return 0;
  const parts = d.split("-");
  if (parts.length === 3 && parts[0].length === 4) return new Date(d).getTime() || 0;
  if (parts.length === 3 && parts[2].length === 4) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime() || 0;
  return new Date(d).getTime() || 0;
}
function buildSub12Data(tournaments: Tournament[], playersDB: PlayersDB, sdLookup: SDLookup, escLookup: EscLookup): Sub12Row[] {
  // Incluir apenas ronda única OU a entrada "Total" de torneios multi-ronda
  // (nunca R1/R2 individuais — pontos são pela classificação do Total)
  const validTournaments = tournaments.filter(t =>
    !t._roundLabel || t._roundLabel === "Resumo"
  );
  const playerMap = new Map<string, Sub12Row>();
  for (const t of validTournaments) {
    for (const p of t.players) {
      if (isDNS(p)) continue;
      const esc = resolveEsc(p, escLookup);
      if (!isSub12(esc)) continue;
      const fed = p.fed || p.fedCode || "";
      if (!fed) continue;
      const stats = computeStats(p, sdLookup);
      if (!stats) continue;
      const { gross: g, toPar: tp, sd18, sdSource, nholes, birdies, pars: parsCount, bogeys } = stats;
      const tournKey = t.tcode + "_" + t.date;
      if (!playerMap.has(fed)) {
        const dbInfo = playersDB[fed];
        playerMap.set(fed, {
          fed, name: p.name || dbInfo?.name || `Fed. ${fed}`,
          club: p.club || dbInfo?.club?.short || "",
          region: dbInfo?.region || t.region || "",
          sex: dbInfo?.sex || "", hcp: dbInfo?.hcp ?? p.hcpExact ?? null,
          results: [], avgGross: null, avgSD: null, bestGross: null, bestSD: null, tourneiosPlayed: 0,
          totalBird: 0, totalPars: 0, totalBog: 0, totalPts: 0,
        });
      }
      const row = playerMap.get(fed)!;
      if (row.results.some(r => r.tournKey === tournKey)) continue;
      row.results.push({
        tournKey, tournName: t.name, tournShort: tournShort(t),
        date: t.date, dateSort: dateToSort(t.date),
        campo: t.campo || "", region: t.region, series: t.series,
        gross: g, toPar: tp,
        sd: sd18 != null ? Math.round(sd18 * 10) / 10 : null, sdSource,
        pos: p.pos, totalPlayers: t.playerCount,
        nholes, birdies, pars: parsCount, bogeys,
      });
      row.totalBird += birdies;
      row.totalPars += parsCount;
      row.totalBog  += bogeys;
      row.totalPts  += drivePoints(typeof p.pos === "number" ? p.pos : 0);
    }
  }
  for (const row of playerMap.values()) {
    row.results.sort((a, b) => a.dateSort - b.dateSort);
    const grosses = row.results.map(r => r.gross);
    const sds = row.results.filter(r => r.sd != null).map(r => r.sd!);
    row.tourneiosPlayed = row.results.length;
    row.avgGross = numAvg(grosses);
    row.avgSD = numAvg(sds);
    row.bestGross = grosses.length > 0 ? Math.min(...grosses) : null;
    row.bestSD = sds.length > 0 ? Math.min(...sds) : null;
  }
  return [...playerMap.values()].sort((a, b) => b.totalPts - a.totalPts);
}
function filterBySub12Series(rows: Sub12Row[], series: Sub12SeriesTab): Sub12Row[] {
  return rows.map(p => {
    const fR = p.results.filter(r => r.series === series);
    if (fR.length === 0) return null;
    const fG = fR.map(r => r.gross);
    const fS = fR.filter(r => r.sd != null).map(r => r.sd!);
    return {
      ...p, results: fR, tourneiosPlayed: fR.length,
      avgGross: numAvg(fG), avgSD: numAvg(fS),
      bestGross: fG.length ? Math.min(...fG) : null,
      bestSD: fS.length ? Math.min(...fS) : null,
      totalBird: fR.reduce((s, r) => s + r.birdies, 0),
      totalPars: fR.reduce((s, r) => s + r.pars, 0),
      totalBog:  fR.reduce((s, r) => s + r.bogeys, 0),
      totalPts:  fR.reduce((s, r) => s + drivePoints(typeof r.pos === "number" ? r.pos : 0), 0),
    };
  }).filter(Boolean) as Sub12Row[];
}

const shortDate = shortDateSlash;

/* ─ Sub-12 Calendar ─ */
const fmtCalDate = (d: Date, end?: Date): string => {
  const dd = (n: number) => String(n).padStart(2, "0");
  const base = dd(d.getDate()) + "/" + dd(d.getMonth() + 1);
  return end ? base + "–" + dd(end.getDate()) + "/" + dd(end.getMonth() + 1) : base;
};
interface CalEntry { name: string; date: Date; endDate?: Date; campo: string; region: string; series: "tour"|"challenge"|"aquapor"; }
const CAL_ENTRIES: CalEntry[] = [
  { name: "1º DT Sul",     date: new Date(2026,0,11), campo: "Laguna GC",        region: "sul",     series: "tour" },
  { name: "2º DT Sul",     date: new Date(2026,1,1),  campo: "Vila Sol",          region: "sul",     series: "tour" },
  { name: "3º DT Sul",     date: new Date(2026,3,4),  campo: "Penina (TBC)",      region: "sul",     series: "tour" },
  { name: "4º DT Sul",     date: new Date(2026,5,10), campo: "Boavista",          region: "sul",     series: "tour" },
  { name: "1º DT Norte",   date: new Date(2026,0,4),  campo: "Estela GC",         region: "norte",   series: "tour" },
  { name: "2º DT Norte",   date: new Date(2026,1,1),  campo: "Amarante",          region: "norte",   series: "tour" },
  { name: "3º DT Norte",   date: new Date(2026,1,28), endDate: new Date(2026,2,1), campo: "Vale Pisão", region: "norte", series: "tour" },
  { name: "4º DT Norte",   date: new Date(2026,3,19), campo: "Ponte de Lima",     region: "norte",   series: "tour" },
  { name: "1º DT Tejo",    date: new Date(2026,0,4),  campo: "Montado",           region: "tejo",    series: "tour" },
  { name: "2º DT Tejo",    date: new Date(2026,0,31), campo: "Belas",             region: "tejo",    series: "tour" },
  { name: "3º DT Tejo",    date: new Date(2026,2,28), endDate: new Date(2026,2,29), campo: "St. Estêvão", region: "tejo", series: "tour" },
  { name: "4º DT Tejo",    date: new Date(2026,3,12), campo: "Lisbon SC",         region: "tejo",    series: "tour" },
  { name: "1º DT Madeira", date: new Date(2026,0,3),  campo: "Palheiro Golf",     region: "madeira", series: "tour" },
  { name: "2º DT Madeira", date: new Date(2026,1,7),  campo: "Santo da Serra",    region: "madeira", series: "tour" },
  { name: "3º DT Madeira", date: new Date(2026,2,7),  campo: "Palheiro Golf",     region: "madeira", series: "tour" },
  { name: "4º DT Madeira", date: new Date(2026,3,11), campo: "Porto Santo Golfe", region: "madeira", series: "tour" },
  { name: "1º DC Madeira", date: new Date(2026,0,4),  campo: "Palheiro",          region: "madeira", series: "challenge" },
  { name: "2º DC Madeira", date: new Date(2026,1,8),  campo: "Santo da Serra",    region: "madeira", series: "challenge" },
  { name: "3º DC Madeira", date: new Date(2026,2,8),  campo: "Santo da Serra",    region: "madeira", series: "challenge" },
  { name: "4º DC Madeira", date: new Date(2026,3,12), campo: "Porto Santo",       region: "madeira", series: "challenge" },
  { name: "1º DC Açores",  date: new Date(2026,0,24), campo: "Terceira Island GC",region: "acores",  series: "challenge" },
  { name: "2º DC Açores",  date: new Date(2026,1,28), campo: "Terceira Island GC",region: "acores",  series: "challenge" },
  { name: "AQUAPOR",       date: new Date(2026,0,17), endDate: new Date(2026,0,18), campo: "Vidago Palace", region: "nacional", series: "aquapor" },
];

/* ═══════════════════════════════════════════════════════
   SUB-12: UI Components
   ═══════════════════════════════════════════════════════ */
function UpcomingSchedule({ series }: { series: Sub12SeriesTab }) {
  const now = new Date(); now.setHours(0,0,0,0);
  const entries = CAL_ENTRIES.filter(e => e.series === series).sort((a,b) => a.date.getTime()-b.date.getTime());
  if (!entries.length) return null;
  return (
    <div className="card p-8-12">
      <div className="h-xs mb-6">📅 Calendário {SERIE_LABELS[series]} 2026</div>
      <div className="flex-wrap gap-4" style={{ display: "flex" }}>
        {entries.map((e, i) => {
          const endRef = e.endDate || e.date;
          const isPast = endRef.getTime() < now.getTime();
          const isNext = !isPast && entries.slice(0,i).every(prev => (prev.endDate||prev.date).getTime() < now.getTime());
          const col = SERIE_COLORS[series];
          return (
            <div key={i} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 8px", borderRadius: "var(--radius-pill)", fontSize: 10,
              fontWeight: isNext ? 800 : isPast ? 400 : 600,
              background: isNext ? col + "18" : isPast ? "transparent" : "var(--bg-card)",
              color: isPast ? "var(--text-muted)" : isNext ? col : "var(--text-2)",
              border: isNext ? `2px solid ${col}` : isPast ? "1px solid var(--border-light)" : "1px solid var(--border)",
              textDecoration: isPast ? "line-through" : "none", opacity: isPast ? 0.6 : 1,
            }}>
              {REGION_EMOJI[e.region] || ""} <span className="fw-700">{fmtCalDate(e.date, e.endDate)}</span> {e.name} <span className="c-muted">{e.campo}</span>
              {isNext && <span className="badge-next" style={{ background: col }}>PRÓXIMO</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function SdSpan({ sd, hcp }: { sd: number | null; hcp?: number | null }) {
  if (sd == null) return <span className="c-muted">–</span>;
  return <span className={"p p-sm fs-11 p-" + sdClassByHcp(sd, hcp ?? null)}>{sd.toFixed(1)}</span>;
}
function ToParSpan({ tp }: { tp: number | null }) {
  if (tp == null) return <span className="c-muted">–</span>;
  const color = tpColor(tp);
  return <span className="fw-700 fs-11" style={{ color }}>{fmtToPar(tp)}</span>;
}

const _STICKY_HCP_W  = 48;
const STICKY_BG      = "var(--bg-card)";
const STICKY_BG_HEAD = "var(--bg-topbar)";
const _stickyBase     = (left: number, isLast?: boolean): React.CSSProperties => ({ position: "sticky", left, zIndex: 2, background: STICKY_BG, ...(isLast ? { borderRight: "2px solid var(--border)", boxShadow: "2px 0 4px rgba(0,0,0,0.06)" } : {}) });
const _stickyHeadBase = (left: number, isLast?: boolean): React.CSSProperties => ({ position: "sticky", left, zIndex: 3, background: STICKY_BG_HEAD, ...(isLast ? { borderRight: "2px solid var(--border)", boxShadow: "2px 0 4px rgba(0,0,0,0.06)" } : {}) });


function RankingView({ rows, onPlayerClick }: { rows: Sub12Row[]; onPlayerClick: (fed: string) => void }) {
  const ranked = [...rows].filter(p => p.totalPts > 0).sort((a, b) => b.totalPts - a.totalPts);
  const zeroPts = rows.filter(p => p.totalPts === 0);
  return (
    <div>
      {ranked.length === 0 ? (
        <div className="card"><div className="muted">Nenhum jogador com pontos ainda</div></div>
      ) : (
        <div className="bjgt-chart-scroll">
          <table className="dtable fs-12" >
            <thead><tr>
              <th className="r" style={{ width: 36 }}>#</th>
              <th className="ta-left" style={{ paddingLeft: 6 }}>Jogador</th>
              <th>Clube</th>
              <th className="r">HCP</th>
              <th className="r">T</th>
              <th className="r" style={{ fontWeight: 800, color: "var(--color-warn-dark)" }}>Pts</th>
              <th className="r">Best SD</th>
              <th className="r">Melhor</th>
            </tr></thead>
            <tbody>
              {ranked.map((p, i) => (
                <tr key={p.fed} className={`pointer${p.sex === "F" ? " tourn-female-row" : ""}`} onClick={() => onPlayerClick(p.fed)}>
                  <td className="r" style={{ fontSize: 16 }}>{medal(i + 1) ?? <span className="mono fw-700">{i+1}</span>}</td>
                  <td>
                    <span className="fw-700" style={{ cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 2 }}
                      onClick={(e) => { e.stopPropagation(); window.open(`/jogadores/${p.fed}`, "_blank"); }}>{p.name}</span>
                    <SexBadge sex={p.sex} size="sm" className="ml-4" />
                  </td>
                  <td className="c-muted fs-11">{p.club}</td>
                  <td className="r mono">{fmtHcp(p.hcp)}</td>
                  <td className="r mono">{p.tourneiosPlayed}</td>
                  <td className="r fw-800" style={{ color: "var(--color-warn-dark)" }}>{p.totalPts}</td>
                  <td className="r"><SdSpan sd={p.bestSD} hcp={p.hcp} /></td>
                  <td className="r mono fw-700 c-good-dark">{p.bestGross ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {zeroPts.length > 0 && (
        <div className="card mt-14">
          <div className="h-xs">Sem pontos ({zeroPts.length})</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
            {zeroPts.map(p => {
              const r = p.results[0];
              return (
                <div key={p.fed} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "var(--bg)", borderRadius: "var(--radius)", fontSize: 11, cursor: "pointer" }}
                  onClick={() => onPlayerClick(p.fed)}>
                  <span className="fw-600">{p.name}</span>
                  <span className="mono">{r?.gross ?? "–"} <span className="c-muted">({r?.tournShort})</span></span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EvolutionChart({ rows }: { rows: Sub12Row[] }) {
  const eligible = rows.filter(p => p.results.filter(r => r.sd != null).length >= 2);
  if (!eligible.length) {
    return <div className="card"><div className="h-xs">Evolução SD</div><div className="muted">Dados insuficientes (mínimo 2 torneios por jogador)</div></div>;
  }
  const top = [...eligible].sort((a,b) => b.results.filter(r=>r.sd!=null).length - a.results.filter(r=>r.sd!=null).length).slice(0,10);
  const allDates = [...new Set(top.flatMap(p => p.results.filter(r=>r.sd!=null).map(r=>r.date)))].sort((a,b)=>dateToSort(a)-dateToSort(b));
  const chartData = allDates.map(d => {
    const point: Record<string, any> = { date: shortDate(d) };
    for (const p of top) { const res = p.results.find(r => r.date===d && r.sd!=null); if (res) point[p.fed] = res.sd; }
    return point;
  });
  return (
    <div className="card">
      <div className="h-xs">Evolução SD ao longo da época</div>
      <div className="w-full mt-8" style={{ height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={["dataMin - 2", "dataMax + 2"]} />
            <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
              formatter={(value: number | undefined, name: string) => { const p = top.find(x => x.fed===name); return [value != null ? value.toFixed(1) : "", p?.name||name]; }} />
            <Legend formatter={(value: string) => { const p = top.find(x => x.fed===value); return <span className="fs-10">{p?.name||value}</span>; }} />
            <ReferenceLine y={36} stroke="var(--color-danger)" strokeDasharray="4 4" strokeWidth={1} />
            {top.map((p, i) => (
              <Line key={p.fed} type="monotone" dataKey={p.fed} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PlayerDetail({ row, onClose }: { row: Sub12Row; onClose: () => void }) {
  return (
    <div className="card" style={{ border: "2px solid var(--accent)", position: "relative" }}>
      <button onClick={onClose} title="Fechar" aria-label="Fechar" style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-3)" }}>✕</button>
      <div className="mb-8" style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span className="fw-800" style={{ fontSize: 16 }}>{row.name}</span>
        <span className="muted fs-11">{row.club} · {row.region} · HCP {fmtHcp(row.hcp)}</span>
        <PlayerLink fed={row.fed} name="Ver perfil →" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "underline" }} />
      </div>
      <div className="mb-10 flex-wrap d-flex gap-6">
        <KpiCard label="Torneios"  value={String(row.tourneiosPlayed)} />
        <KpiCard label="Pts"       value={row.totalPts > 0 ? String(row.totalPts) : "–"} color="var(--color-warn-dark)" />
        <KpiCard label="Best SD"   value={row.bestSD?.toFixed(1) ?? "–"} color={row.bestSD != null && row.bestSD <= 25 ? "var(--color-good)" : undefined} />
        <KpiCard label="Melhor"    value={row.bestGross != null ? String(row.bestGross) : "–"} color="var(--color-good-dark)" />
      </div>
      <table className="dtable fs-11">
        <thead><tr><th>Data</th><th>Torneio</th><th>Campo</th><th className="r">Pos</th><th className="r">Gross</th><th className="r">±Par</th><th className="r">SD</th></tr></thead>
        <tbody>
          {row.results.map((r, i) => (
            <tr key={i}>
              <td className="mono fs-10">{r.date}</td>
              <td>
                <span className="fw-600">{r.tournName}</span>
                <span className="badge-serie ml-4" style={{ background: (SERIE_COLORS[r.series]||"var(--text-muted)")+"22", color: SERIE_COLORS[r.series], border: `1px solid ${SERIE_COLORS[r.series]}44` }}>
                  {SERIE_LABELS[r.series]}
                </span>
              </td>
              <td className="c-muted fs-10">{r.campo}</td>
              <td className="r mono">{r.pos ?? "–"}<span className="c-muted fs-10">/{r.totalPlayers}</span></td>
              <td className="r mono fw-700">{r.gross}</td>
              <td className="r"><ToParSpan tp={r.toPar} /></td>
              <td className="r"><SdSpan sd={r.sd} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN — DriveContent unificado (Tour + Challenge + AQUAPOR + Sub-12)
   ═══════════════════════════════════════════════════════ */
function DriveContent() {
  const [data, setData]           = useState<DriveData | null>(null);
  const [pdb, setPdb]             = useState<PlayersDB>({});
  const [sdLookup, setSdLookup]   = useState<SDLookup>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [navMode, setNavMode]   = useState<"torneios"|"ranking-pja"|"ranking-sub12">("torneios");
  const [series, setSeries]     = useState<"all"|"tour"|"challenge"|"aquapor">("tour");
  const [filterManuel, setFilterManuel] = useState(true);
    const md = useMasterDetail();
  const [regionFilter, setRegionFilter]         = useState<string | null>(null);
  const [escFilter, setEscFilter]               = useState<string[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [roundIdx, setRoundIdx]                 = useState(0);

  // Filtro de ano (null = todos)
  const [yearFilter, setYearFilter]             = useState<string | null>(null);

  // Estado específico Sub-12
  const [sub12Series, setSub12Series]   = useState<Sub12SeriesTab>("tour");
  const [sub12View, setSub12View]       = useState<Sub12ViewTab>("grid");
  const [sub12Region, setSub12Region]   = useState("all");
  const [sub12Sex, setSub12Sex]         = useState("all");
  const [sub12Search, setSub12Search]   = useState("");
  const [sub12Player, setSub12Player]   = useState<Sub12Row | null>(null);

  // Carrega todos os ficheiros mensais: {prefix}-YYYY-MM.json
  // Itera 2022 → ano corrente, todos os meses; ignora silenciosamente os que não existem (404)
  async function loadAllFiles(prefix: string, forceAqapor = false): Promise<Tournament[]> {
    const all: Tournament[] = [];
    const now = new Date();
    const curYear  = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    for (let year = 2022; year <= curYear; year++) {
      for (let month = 1; month <= 12; month++) {
        if (year === curYear && month > curMonth) break;
        const mm  = String(month).padStart(2, "0");
        const url = `/data/${prefix}-${year}-${mm}.json`;
        try {
          const r = await fetch(url);
          if (!r.ok) continue;   // mês sem ficheiro → saltar
          const d = await r.json();
          const tourns: Tournament[] = (d.tournaments || []).map((t: any) =>
            normalizeTournament(forceAqapor ? { ...t, series: "aquapor" as const } : t)
          );
          all.push(...tourns);
        } catch {
          continue;
        }
      }
    }
    return all;
  }

  useEffect(() => {
    Promise.all([
      loadAllFiles("drive-data"),
      loadAllFiles("aquapor-data", true),
      loadPlayers().catch(() => ({})),
      fetch("/data/drive-sd-lookup.json").then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([driveTourns, aqTourns, pp, sd]) => {
      const allTourns = expandMultiRound([...driveTourns, ...aqTourns]);
      const driveData: DriveData = {
        lastUpdated: "",
        source: "scoring.datagolf.pt",
        totalTournaments: allTourns.length,
        totalPlayers: allTourns.reduce((s, t) => s + t.playerCount, 0),
        totalScorecards: 0,
        tournaments: allTourns,
      };
      setData(driveData); setPdb(pp as PlayersDB); setSdLookup(sd as SDLookup); setLoading(false);
      setTimeout(() => {
        resolveFedsInTournaments(driveData.tournaments, pp as PlayersDB);
        setData({ ...driveData });
      }, 0);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Carregar admissions + draws (uma vez) e atachar aos tournaments por ccode-tcode
  const [admDrawsIdx, setAdmDrawsIdx] = useState<Map<string, any>>(new Map());
  useEffect(() => {
    loadFpgAdmissionsDraws()
      .then(f => setAdmDrawsIdx(indexFpgAdmissionsDraws(f)))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!data || admDrawsIdx.size === 0) return;
    for (const t of data.tournaments) {
      const ad = admDrawsIdx.get(`${t.ccode}-${(t as any).tcode}`);
      if (ad) {
        (t as any)._admissions = ad.admissions;
        (t as any)._draws = ad.draws;
      }
    }
  }, [data, admDrawsIdx]);

  // State para tab especial (Inscrições / Draw RN) ortogonal ao roundIdx
  const [specialTab, setSpecialTab] = useState<string | null>(null);  // "admissions" | "draw:1" | null

  // Anos disponíveis — só os que têm torneios reais na série activa (exclui sub-rondas expandidas)
  const availYears = useMemo(() => {
    const s = new Set<string>();
    for (const t of data?.tournaments ?? []) {
      if ((series === "all" || t.series === series) && (!t._roundLabel || t._roundLabel === "Resumo")) {
        const y = t.date?.split("-")[0];
        if (y) s.add(y);
      }
    }
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [data, series]);

  // Ano activo: por omissão o mais recente disponível
  const activeYear = yearFilter ?? availYears[0] ?? null;
  const inYear = (t: Tournament) => !activeYear || t.date?.startsWith(activeYear);

  const tourT    = useMemo(() => data?.tournaments.filter(t => t.series === "tour"      && inYear(t)) ?? [], [data, activeYear]);
  const allT     = useMemo(() => data?.tournaments.filter(t => inYear(t)) ?? [], [data, activeYear]);
  const challT   = useMemo(() => data?.tournaments.filter(t => t.series === "challenge" && inYear(t)) ?? [], [data, activeYear]);
  const aquaporT = useMemo(() => data?.tournaments.filter(t => t.series === "aquapor"   && inYear(t)) ?? [], [data, activeYear]);
  const escLookup = useMemo(() => buildEscLookup(pdb, (data?.tournaments ?? []) as any /* tipo local diferente do playerUtils */), [pdb, data]);

  // Lookup temporal: fedCode → Map<year, escalão> — construído dos torneios Challenge históricos
  const temporalEscLookup = useMemo(
    () => buildTemporalEscLookup(data?.tournaments ?? []),
    [data]
  );



  // Sub-12: só calcular quando a tab é activada pela primeira vez
  const [sub12Ready, setSub12Ready] = useState(false);
  useEffect(() => { if (navMode === "ranking-sub12" && !sub12Ready) setSub12Ready(true); }, [navMode, sub12Ready]);

  const sub12Data = useMemo(() => {
    if (!sub12Ready || !data) return [];
    const tourns = activeYear
      ? data.tournaments.filter(t => t.date?.startsWith(activeYear))
      : data.tournaments;
    return buildSub12Data(tourns, pdb, sdLookup, escLookup);
  }, [sub12Ready, data, pdb, sdLookup, escLookup, activeYear]);

  const sub12SeriesRows = useMemo(() => filterBySub12Series(sub12Data, sub12Series), [sub12Data, sub12Series]);
  const sub12Tourns = useMemo(() => {
    const m = new Map<string, { key: string; short: string; date: string; series: string; dateSort: number }>();
    for (const row of sub12SeriesRows) {
      for (const r of row.results) {
        if (!m.has(r.tournKey)) m.set(r.tournKey, { key: r.tournKey, short: r.tournShort, date: r.date, series: r.series, dateSort: r.dateSort });
      }
    }
    return [...m.values()].sort((a,b) => a.dateSort - b.dateSort);
  }, [sub12SeriesRows]);

  const sub12Filtered = useMemo(() => {
    let list = sub12SeriesRows;
    if (sub12Region !== "all") list = list.filter(p => p.region.toLowerCase().includes(sub12Region.toLowerCase()));
    if (sub12Sex !== "all")    list = list.filter(p => p.sex === sub12Sex);
    if (sub12Search.trim()) {
      const q = sub12Search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q) || p.fed.includes(q));
    }
    return list;
  }, [sub12SeriesRows, sub12Region, sub12Sex, sub12Search]);

  const sub12AvailRegions = useMemo(() => [...new Set(sub12SeriesRows.map(p => p.region).filter(Boolean))].sort(), [sub12SeriesRows]);

  const sub12Counts = useMemo(() => {
    const counts: Record<string, { players: number; tourns: number }> = {};
    for (const s of SUB12_SERIES_TABS) {
      const rows = filterBySub12Series(sub12Data, s.key);
      const tourns = new Set(rows.flatMap(p => p.results.map(r => r.tournKey)));
      counts[s.key] = { players: rows.length, tourns: tourns.size };
    }
    return counts;
  }, [sub12Data]);

  const sub12KpiPlayers  = sub12Filtered.length;
  const sub12KpiRounds   = sub12Filtered.reduce((s,p) => s + p.tourneiosPlayed, 0);
  const sub12KpiBestSD   = numAvg(sub12Filtered.filter(p => p.bestSD != null).map(p => p.bestSD!));
  const sub12KpiBest     = sub12Filtered.reduce<number|null>((best,p) => p.bestGross != null && (best==null||p.bestGross<best) ? p.bestGross : best, null);

  const handleSub12PlayerClick = useCallback((fed: string) => {
    const p = sub12SeriesRows.find(x => x.fed === fed);
    if (p) setSub12Player(prev => prev?.fed === fed ? null : p);
  }, [sub12SeriesRows]);

  // Série normal (tour/challenge/aquapor)
  const seriesT = series === "all" ? allT : series === "tour" ? tourT : series === "challenge" ? challT : aquaporT;
  const availRegions = useMemo(() => {
    const s = new Set(seriesT.map(t => t.region));
    return REGIONS.filter(r => s.has(r.id));
  }, [series, seriesT]);

  // Para series="all": aplicar filtros a cada série e combinar os grupos
  // Mais eficiente que um único buildGroups(allT) com centenas de entries
  const filteredT = useMemo(() => {
    let ts = seriesT;
    if (regionFilter) ts = ts.filter(t => t.region === regionFilter);
    // Para Challenge (isEvent), NÃO filtrar por escalão aqui — o grupo agrupa todos os escalões
    // O escFilter é aplicado ao nível dos entries do grupo em filteredGroups
    if (escFilter.length > 0 && series !== "challenge") ts = filterTournByEsc(ts, escFilter, escLookup, temporalEscLookup);
    if (filterManuel) ts = ts.filter(t => t.players.some(p => isManuel(p)));
    return ts;
  }, [series, seriesT, regionFilter, escFilter, escLookup, temporalEscLookup, filterManuel]);

  const filteredGroups = useMemo(() => {
    const applyFilters = (ts: Tournament[]) => {
      let r = ts;
      if (regionFilter) r = r.filter(t => t.region === regionFilter);
      if (escFilter.length > 0 && series !== "challenge") r = filterTournByEsc(r, escFilter, escLookup, temporalEscLookup);
      if (filterManuel) r = r.filter(t => t.players.some(p => isManuel(p)));
      return r;
    };

    let groups: TournGroup[];
    if (series === "all") {
      groups = [
        ...buildGroups(applyFilters(tourT)),
        ...buildGroups(applyFilters(challT)),
        ...buildGroups(applyFilters(aquaporT)),
      ];
    } else {
      groups = buildGroups(filteredT);
    }

    // Para isEvent (Challenge agrupado): filtrar entries pelo escFilter
    // O evento continua visível se tiver pelo menos 1 escalão que corresponde
    if (escFilter.length > 0) {
      groups = groups.map(g => {
        if (!g.isEvent) return g;
        const matchEntries = g.entries.filter(e => e.escalao && escFilter.includes(e.escalao));
        if (matchEntries.length === 0) return null;
        return { ...g, entries: matchEntries, escalao: matchEntries.length === 1 ? matchEntries[0].escalao : null };
      }).filter(Boolean) as TournGroup[];
    }

    return groups;
  }, [series, filteredT, tourT, challT, aquaporT, regionFilter, escFilter, filterManuel, escLookup, temporalEscLookup]);

  const regionT = useMemo(() => regionFilter ? seriesT.filter(t => t.region === regionFilter) : seriesT, [seriesT, regionFilter]);
  const uniquePCFiltered  = useMemo(() => uniquePC(filteredT), [filteredT]);
  const uniquePCRegion    = useMemo(() => uniquePC(regionT), [regionT]);
  const countTour         = useMemo(() => countEvents(tourT), [tourT]);
  const countChall        = useMemo(() => countEvents(challT), [challT]);
  const countAquapor      = useMemo(() => countEvents(aquaporT), [aquaporT]);
  const countSeries       = useMemo(() => countEvents(seriesT), [seriesT]);

  // Para series="all" mostramos sempre todos os escalões (fixo) — evita iterar todos os jogadores
  const availEscs = useMemo(() => {
    if (series === "all") return ["Sub 10","Sub 12","Sub 14","Sub 16","Sub 18","Absoluto","Sénior"];
    return availEscaloes(regionT, escLookup, temporalEscLookup);
  }, [series, regionT, escLookup, temporalEscLookup]);

  useEffect(() => { setRegionFilter(null); setEscFilter([]); setSelectedGroupKey(null); setRoundIdx(0); }, [series]);
  // Se o ano activo não existe na nova série, resetar para o mais recente disponível
  useEffect(() => {
    if (yearFilter && !availYears.includes(yearFilter)) setYearFilter(null);
  }, [availYears]);
  useEffect(() => { setEscFilter([]); setSelectedGroupKey(null); setRoundIdx(0); }, [regionFilter]);
  useEffect(() => { setSub12Player(null); }, [sub12Series]);

  const selectedGroup = useMemo(
    () => filteredGroups.find(g => g.key === selectedGroupKey) ?? null,
    [filteredGroups, selectedGroupKey]
  );
  const curTournament = selectedGroup ? (selectedGroup.entries[roundIdx] || selectedGroup.entries[0]) : null;

  // Pré-calcular labels sidebar
  const sidebarNumCount = useMemo(() => {
    const m = new Map<string, Map<number, number>>();
    for (const g of filteredGroups) {
      const region = g.entries[0]?.region || "";
      if (!m.has(region)) m.set(region, new Map());
      const rm = m.get(region)!;
      rm.set(g.num, (rm.get(g.num) || 0) + 1);
    }
    return m;
  }, [filteredGroups]);

  const sidebarItemLabel = (g: TournGroup) => {
    const region = g.entries[0]?.region || "";
    const isDup = (sidebarNumCount.get(region)?.get(g.num) || 0) > 1;
    const base = `T${g.num}${isDup ? " · " + fmtDateShort(g.date) : ""} · ${g.label}`;
    if (g.isEvent) return base; // Challenge evento — escalões mostrados como sub-badges
    if (g.escalao) return base + " · " + g.escalao;
    return base;
  };

  const renderDriveItem = (g: TournGroup, isActive: boolean, onClick: () => void) => {
    const t0 = g.entries[0];
    const nJog = uniquePC(g.entries);
    // Para isEvent (Challenge agrupado): mostrar pills de escalão por entry
    const extraPills = g.isEvent
      ? (<>
          {g.entries.map(e => {
            const esc = e.escalao;
            const tc = e.tcode?.replace(/_R\d+$|_Total$/, "") || "";
            const url = (tc && e.ccode) ? `https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=${String(e.ccode).padStart(3,"0")}&tcode=${tc}` : "";
            return esc && (
              <span key={esc} className="gap-2" style={{ display: "inline-flex", alignItems: "center" }}>
                <span className={`p p-sm p-${esc.toLowerCase().replace(/\s+/g,"")}`}>{esc}</span>
                {tc && (
                  <span className="p p-sm p-tourn" style={PILL_TCODE}>{tc}</span>
                )}
                {url && <button type="button" onClick={ev => { ev.stopPropagation(); window.open(url, "_blank", "noopener,noreferrer"); }}
                  style={{ background: "none", border: "none", padding: "0 1px", cursor: "pointer", fontSize: 11, color: "var(--accent)", opacity: isActive ? 1 : 0.55, lineHeight: 1, display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}>🔗</button>}
              </span>
            );
          })}
        </>)
      : null;

    // Determinar série e accent explicitamente (não confiar em t0.series que pode ser null)
    const grpSeries = (t0 as any)?.series as string | undefined;
    const grpAccent = grpSeries === "aquapor"   ? SIDEBAR_ACCENT.aquapor
                    : grpSeries === "challenge"  ? SIDEBAR_ACCENT.challenge
                    : SIDEBAR_ACCENT.tour; // drive/tour/undefined → verde

    // Campo: mostrar região (Norte/Tejo/Sul) quando campo=label para consistência visual
    const region = (t0 as any)?.region as string | undefined;
    const regionLabel = region
      ? REGIONS.find(r => r.id === region)?.label ?? null
      : null;
    const campoDisplay = g.campo !== g.label ? g.campo
      : regionLabel ?? undefined;

    const tData: SidebarItemTournament = {
      tcode:       g.isEvent ? undefined : (t0?.tcode?.replace(/_R\d+$|_Total$/, "") || undefined),
      ccode:       t0?.ccode,
      name:        sidebarItemLabel(g),
      campo:       campoDisplay,
      clube:       (t0 as any)?.clube ?? null,
      date:        g.date,
      playerCount: nJog,
      rounds:      g.isMulti ? g.totalRounds : 1,
      nholes:      t0?.nholes || t0?.par?.length || 18,
      series:      grpSeries,
      escalao:     (!g.isEvent && !g.isMulti) ? g.escalao : null,
      players:     g.entries.flatMap(e => e.players),
    };

    return (
      <TournSidebarItem
        key={g.key}
        t={tData}
        isActive={isActive}
        onClick={onClick}
        accentColor={grpAccent}
        extraPills={extraPills}
      />
    );
  };
  if (loading) return <LoadingState />;
  if (error)   return <div className="jogadores-page"><div className="notice-error" style={{ margin: 16 }}>Erro: {error}</div></div>;
  if (!data)   return null;

  const sdCount = Object.keys(sdLookup).length;
  return (
    <div className="jogadores-page">

      {/* ── Toolbar mobile-first: scroll horizontal ── */}
      <div style={{ borderBottom: "1px solid var(--border-light)" }}>

        {/* Linha 1: tudo numa linha scrollável */}
        <Toolbar>
          <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Torneios" />
          <ToolbarTitle>🏁 DRIVE</ToolbarTitle>
          <ToolbarSep />
          {([
            { key: "torneios",      label: "Torneios" },
            { key: "ranking-pja",   label: "📊 Ranking PJA" },
            { key: "ranking-sub12", label: "🏅 Ranking Sub-12" },
          ] as const).map(({ key, label }) => (
            <button key={key}
              className={"tourn-tab tourn-tab-sm" + (navMode === key ? " active" : " tourn-tab-muted")}
              onClick={() => { setNavMode(key); setSeries("tour"); setYearFilter(null); setSelectedGroupKey(null); setRoundIdx(0); }}
              style={navMode === key
                ? { flexShrink: 0 }
                : { flexShrink: 0 }}>
              {label}
            </button>
          ))}
          {navMode === "torneios" && (<>
            <ToolbarSep />
            {([
              { key: "all",       label: "Todos" },
              { key: "tour",      label: "🏌️ Tour" },
              { key: "challenge", label: "⚡ Challenge" },
              { key: "aquapor",   label: "💧 AQUAPOR" },
            ] as const).map(({ key, label }) => (
              <button key={key}
                className={"tourn-tab tourn-tab-sm" + (series === key ? " active" : " tourn-tab-muted")}
                onClick={() => { setSeries(key); setRegionFilter(null); setEscFilter([]); setSelectedGroupKey(null); setRoundIdx(0); if (key === "all" && !yearFilter) setYearFilter(availYears[0] ?? null); }}
                style={series === key
                  ? { flexShrink: 0 }
                  : { flexShrink: 0 }}>
                {label}{key !== "all" ? ` (${key === "tour" ? countTour : key === "challenge" ? countChall : countAquapor})` : ""}
              </button>
            ))}
            {availYears.length > 1 && (<>
              <ToolbarSep />
              {availYears.map(y => (
                <button key={y}
                  className={"tourn-tab tourn-tab-sm" + (activeYear === y ? " active" : " tourn-tab-muted")}
                  onClick={() => { setYearFilter(y === activeYear && availYears.length > 1 ? null : y); setSelectedGroupKey(null); setRoundIdx(0); }}
                  style={activeYear === y
                    ? { flexShrink: 0 }
                    : { flexShrink: 0 }}>
                  {y}
                </button>
              ))}
              <ToolbarSep />
              <button
                className={"tourn-tab tourn-tab-sm" + (filterManuel ? " active" : " tourn-tab-muted")}
                onClick={() => setFilterManuel(v => !v)}
                style={filterManuel
                  ? { flexShrink: 0, background: "var(--bg-success-subtle)", borderColor: "var(--color-good)", color: "var(--color-good-dark)", whiteSpace: "nowrap" }
                  : { flexShrink: 0, whiteSpace: "nowrap" }}>
                ★ Manuel
              </button>
            </>)}
          </>)}
          <div className="flex-1" style={{ minWidth: 8 }} />
          {/* Contadores à direita */}
          {navMode === "torneios" && data.totalScorecards > 0 && (
            <span className="chip" style={{ flexShrink: 0, background: "var(--bg-success-strong)", color: "var(--color-good-dark)" }}>
              📊 {data.totalScorecards} sc
            </span>
          )}
          {data.lastUpdated && <span className="muted fs-10 shrink-0"  style={{ whiteSpace: "nowrap" }}>{data.lastUpdated}</span>}
        </Toolbar>

        {/* Linha 2: regiões + escalões — scroll horizontal */}
        {navMode === "torneios" && (availRegions.length > 1 || availEscs.length > 0) && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px 6px", overflowX: "auto", flexWrap: "nowrap",
            scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
            borderTop: "1px solid var(--border-light)",
          }}>
            {availRegions.length > 1 && (<>
              <button className={"tourn-tab tourn-tab-sm shrink-0" + (regionFilter === null ? " active" : "")}
                onClick={() => setRegionFilter(null)}>
                Todas ({countEvents(seriesT)})
              </button>
              {availRegions.map(reg => {
                const rt = seriesT.filter(t => t.region === reg.id);
                return (
                  <button key={reg.id}
                    className={"tourn-tab tourn-tab-sm" + (regionFilter === reg.id ? " active" : " tourn-tab-muted")}
                    onClick={() => setRegionFilter(reg.id)}
                    style={regionFilter === reg.id
                      ? { flexShrink: 0 }
                      : { flexShrink: 0 }}>
                    {reg.emoji} {reg.label} ({countEvents(rt)}T · {uniquePC(rt)} jog)
                  </button>
                );
              })}
              <ToolbarSep />
            </>)}
            <button className={"tourn-tab tourn-tab-sm shrink-0" + (escFilter.length === 0 ? " active" : "")}
              onClick={() => setEscFilter([])}>
              Todos ({uniquePCRegion} jog)
            </button>
            {(["Sub 10","Sub 12","Sub 14","Sub 16","Sub 18","Absoluto","Sénior"] as const).map(e => {
              const available = availEscs.includes(e);
              const on = escFilter.includes(e);
              if (!available) return (
                <span key={e} className="tourn-tab tourn-tab-sm"
                  style={{ flexShrink: 0, background: "var(--bg-muted)", color: "var(--text-muted)", borderColor: "var(--border)", opacity: 0.35, cursor: "default", pointerEvents: "none" }}>
                  {e}
                </span>
              );
              return (
                <button key={e}
                  className={"tourn-tab tourn-tab-sm" + (on ? " active" : " tourn-tab-muted")}
                  onClick={() => setEscFilter(prev => on ? prev.filter(x => x !== e) : [...prev, e])}
                  style={on
                    ? { flexShrink: 0 }
                    : { flexShrink: 0 }}>
                  {e}
                </button>
              );
            })}
          </div>
        )}
      </div>


      {/* ══════════════════════════════════════════
          MODO SUB-12
          ══════════════════════════════════════════ */}
      {navMode === "ranking-sub12" && (
        <div className="master-detail">

          {/* Sidebar Sub-12 */}
          <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
            {/* Séries */}
            <div className="sidebar-section-title">Série</div>
            {SUB12_SERIES_TABS.map(s => {
              const c = sub12Counts[s.key];
              if (!c || c.players === 0) return null;
              const active = sub12Series === s.key;
              return (
                <button key={s.key}
                  className={`course-item ${active ? "active" : ""}`}
                  onClick={() => { setSub12Series(s.key); setSub12View("grid"); setSub12Player(null); }}>
                  <div className="course-item-name">{s.emoji} {s.label}</div>
                  <div className="course-item-sub">{c.tourns} torneios · {c.players} jog · {s.holes}</div>
                </button>
              );
            })}

            {/* Vistas */}
            <div className="sidebar-section-title mt-8">Vista</div>
            {(["grid", "ranking", "evolucao"] as Sub12ViewTab[]).map(v => {
              const labels: Record<Sub12ViewTab, string> = { grid: "📊 Tabela", ranking: "🏆 Ranking", evolucao: "📈 Evolução" };
              return (
                <button key={v}
                  className={`course-item ${sub12View === v ? "active" : ""}`}
                  onClick={() => setSub12View(v)}>
                  <div className="course-item-name">{labels[v]}</div>
                </button>
              );
            })}

            {/* Filtros compactos */}
            <div className="sidebar-section-title mt-8">Filtros</div>
            <div className="flex-col gap-4" style={{ padding: "4px 8px", display: "flex" }}>
              {sub12AvailRegions.length > 1 && (
                <select className="select w-full fs-11" value={sub12Region} onChange={e => setSub12Region(e.target.value)}>
                  <option value="all">Todas as zonas</option>
                  {sub12AvailRegions.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              )}
              <select className="select w-full fs-11" value={sub12Sex} onChange={e => setSub12Sex(e.target.value)}>
                <option value="all">Ambos os sexos</option>
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
              </select>
              <input className="input w-full fs-11"  style={{ boxSizing: "border-box" }}
                value={sub12Search} onChange={e => setSub12Search(e.target.value)} placeholder="Nome, clube…" />
            </div>

            <div className="muted fs-10" style={{ padding: "8px 12px", borderTop: "1px solid var(--border-light)", marginTop: 8 }}>
              Sub-10 + Sub-12 · scoring.datagolf.pt
            </div>
          </div>

          {/* Conteúdo principal */}
          <div className="content" ref={md.detailRef}>
            <div style={{ padding: "0 12px 12px" }}>

              {/* Detalhe jogador (se aberto) */}
              {sub12Player && (
                <div className="mt-12">
                  <PlayerDetail row={sub12Player} onClose={() => setSub12Player(null)} />
                </div>
              )}

              {/* Calendário no topo */}
              <div className="mt-12">
                <UpcomingSchedule series={sub12Series} />
              </div>

              <div className="card mt-8">
                {/* Header do card igual ao Resumo */}
                <div className="h-md fs-14">
                  {sub12View === "grid" ? "📊" : sub12View === "ranking" ? "🏆" : "📈"}{" "}
                  {sub12View === "grid" ? "Tabela" : sub12View === "ranking" ? "Ranking" : "Evolução SD"}{" "}
                  — Sub-12 {SUB12_SERIES_TABS.find(s => s.key === sub12Series)?.label} {activeYear ?? ""}
                </div>
                <div className="muted fs-11 mb-8">
                  {sub12KpiPlayers} jogadores · {sub12KpiRounds} rondas
                  {sub12KpiBestSD != null && <> · Best SD <span style={{ fontWeight: 700, color: sub12KpiBestSD <= 25 ? "var(--color-good)" : "var(--text)" }}>{sub12KpiBestSD.toFixed(1)}</span></>}
                  {sub12KpiBest != null && <> · Melhor gross <span style={{ fontWeight: 700, color: "var(--color-good-dark)" }}>{sub12KpiBest}</span></>}
                </div>

                {/* Conteúdo */}
                {sub12View === "grid"     && <TournamentGrid rows={sub12Filtered} allTournaments={sub12Tourns} onPlayerClick={handleSub12PlayerClick} playersDB={pdb} escLookup={escLookup} />}
                {sub12View === "ranking"  && <RankingView    rows={sub12Filtered} onPlayerClick={handleSub12PlayerClick} />}
                {sub12View === "evolucao" && <EvolutionChart rows={sub12Filtered} />}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════
          MODO NORMAL (Tour / Challenge / AQUAPOR)
          ══════════════════════════════════════════ */}
      {navMode === "torneios" && (
        <div className="master-detail">

          {/* Sidebar */}
          <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
            <button
              className={`course-item ${selectedGroupKey === null ? "active" : ""}`}
              onClick={() => { setSelectedGroupKey(null); setRoundIdx(0); }}>
              <div className="course-item-name">📋 Resumo temporada</div>
              <div className="course-item-sub">{filteredGroups.length} torneios · {uniquePCFiltered} jog</div>
            </button>

            {availRegions.length > 1 && !regionFilter
              ? REGIONS
                  .filter(r => filteredGroups.some(g => g.entries[0]?.region === r.id))
                  .map(reg => {
                    const regGroups = filteredGroups.filter(g => g.entries[0]?.region === reg.id);
                    return (
                      <React.Fragment key={reg.id}>
                        <div className="sidebar-section-title-dark">{reg.emoji} {reg.label}</div>
                        {regGroups.map(g => renderDriveItem(g, selectedGroupKey === g.key, () => { setSelectedGroupKey(g.key); setRoundIdx(0); md.onSelect(); }))}
                      </React.Fragment>
                    );
                  })
              : filteredGroups.map(g => renderDriveItem(g, selectedGroupKey === g.key, () => { setSelectedGroupKey(g.key); setRoundIdx(0); md.onSelect(); }))
            }

            {filteredGroups.length === 0 && (
              <EmptyState size="sm" message="Sem torneios" />
            )}
            <div className="muted fs-10" style={{ padding: "8px 12px", borderTop: "1px solid var(--border-light)" }}>
              scoring.datagolf.pt{sdCount > 0 && ` · SD: ${sdCount}`}
            </div>
          </div>

          {/* Conteúdo principal */}
          <div className="content">

            {/* RESUMO */}
            {selectedGroupKey === null && (
              <div style={{ padding: "0 12px 12px" }}>
                <div className="card overflow-hidden">
                  <div className="h-md fs-14">
                    📋 {series === "tour" ? "Drive Tour" : series === "challenge" ? "Drive Challenge" : series === "aquapor" ? "AQUAPOR" : "DRIVE"}
                    {regionFilter ? " " + (regionOf(regionFilter)?.label || "") : ""}
                    {escFilter.length > 0 ? " — " + escFilter.join(", ") : ""} — Temporada {activeYear ?? "Todos"}
                  </div>
                  <div className="muted fs-11 mb-8">
                    {filteredGroups.length} torneios · {uniquePCFiltered} jogadores ·{" "}
                    {filteredGroups.reduce((a, g) => a + g.entries.filter(e => !e._roundLabel || e._roundLabel === "Resumo").reduce((s, t) => s + t.players.filter(p => !isDNS(p)).length, 0), 0)} presenças
                  </div>
                  <ResumoTable tournaments={filteredT} playersDB={pdb} sdLookup={sdLookup} escLookup={escLookup} mergeByEvent={series === "challenge"} />
                </div>

                {/* Tabela de pontos */}
                <div className="card mt-8">
                  <DrivePointsTable />
                </div>
              </div>
            )}

            {/* DETALHE DE TORNEIO */}
            {selectedGroupKey !== null && selectedGroup && (() => {
              // Extrair admissions/draws do torneio actual (atachados pelo useEffect)
              const firstT = selectedGroup.entries[0] as any;
              const adm = firstT?._admissions;
              const draws = firstT?._draws || {};
              const hasAdmissions = adm && !adm.error && (adm.players?.length ?? 0) > 0;
              const drawRounds: number[] = [];
              for (const [r, d] of Object.entries(draws)) {
                if (d && (d as any).groups && (d as any).groups.length > 0) drawRounds.push(parseInt(r, 10));
              }
              drawRounds.sort((a, b) => a - b);
              const hasExtraTabs = hasAdmissions || drawRounds.length > 0;
              return (
              <div style={{ padding: "0 12px 12px" }}>
                {/* Tabs: Inscrições / Draws + rondas (isMulti) ou escalões (isEvent) */}
                {(selectedGroup.isMulti || selectedGroup.isEvent || hasExtraTabs) && (
                  <div className="escalao-pills flex-wrap" style={{ gap: 3, padding: "8px 0 0" }}>
                    {hasAdmissions && (
                      <button
                        className={"tourn-tab tourn-tab-sm" + (specialTab === "admissions" ? " active" : "")}
                        onClick={() => setSpecialTab("admissions")}>
                        📝 Inscrições
                        <span className="fs-10" style={{ marginLeft: 3, opacity: 0.7 }}>({adm.players.length})</span>
                      </button>
                    )}
                    {drawRounds.map(r => (
                      <button key={`draw:${r}`}
                        className={"tourn-tab tourn-tab-sm" + (specialTab === `draw:${r}` ? " active" : "")}
                        onClick={() => setSpecialTab(`draw:${r}`)}>
                        🎯 Draw R{r}
                      </button>
                    ))}
                    {selectedGroup.entries.map((entry, ri) => {
                      const lbl = selectedGroup.isEvent
                        ? (entry.escalao || ("E" + (ri + 1)))
                        : (entry._roundLabel || ("R" + (ri + 1)));
                      const isResumo = lbl === "Resumo";
                      const activeCount = entry.players.filter(p => !isDNS(p)).length;
                      const isActive = specialTab === null && roundIdx === ri;
                      return (
                        <button key={entry.tcode + "_" + ri}
                          className={"tourn-tab tourn-tab-sm" + (isActive ? " active" : "")}
                          onClick={() => { setSpecialTab(null); setRoundIdx(ri); }}
                          style={isActive ? {} : isResumo
                            ? { background: "var(--bg-warn-strong)", color: "var(--color-warn-dark)", borderColor: "var(--bg-warn-strong)" }
                            : {}}>
                          {isResumo ? "📊" : selectedGroup.isEvent ? "⚡" : "🏌️"} {lbl}
                          <span className="fs-10" style={{ marginLeft: 3, opacity: 0.7 }}>({activeCount} jog)</span>
                        </button>
                      );
                    })}
                    {/* Tab Scorecards combinados — só para multi-ronda */}
                    {selectedGroup.isMulti && selectedGroup.entries.some(e => e._roundLabel === "Resumo") && (
                      <button
                        className={"tourn-tab tourn-tab-sm" + (specialTab === null && roundIdx === selectedGroup.entries.length ? " active" : "")}
                        onClick={() => { setSpecialTab(null); setRoundIdx(selectedGroup.entries.length); }}>
                        📋 Scorecards
                      </button>
                    )}
                  </div>
                )}
                {curTournament && (
                  <div className="card overflow-hidden" style={{ marginTop: (selectedGroup.isMulti || selectedGroup.isEvent) ? 8 : 0 }}>
                    <div className="h-md fs-14 gap-8" style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                      <span>
                        {selectedGroup.isEvent
                          ? <>⚡ {curTournament.escalao} — {selectedGroup.campo}</>
                          : selectedGroup.isMulti
                            ? <>{curTournament._roundLabel === "Resumo" ? "📊 Acumulado" : "🏌️ " + curTournament._roundLabel} — {selectedGroup.campo}</>
                            : <>🏆 Scorecard — {selectedGroup.label}</>}
                      </span>
                      <a href={fpgAdmissionsUrl(curTournament.ccode, curTournament.tcode)}
                        target="_blank" rel="noopener noreferrer"
                        className="tourn-ext-link"
                        title="Inscrições (tournAdmissions) na Federação">
                        Inscrições ↗
                      </a>
                      <a href={fpgDrawUrl(curTournament.ccode, curTournament.tcode)}
                        target="_blank" rel="noopener noreferrer"
                        className="tourn-ext-link"
                        title="Emparelhamentos (Draw) na Federação">
                        Draw ↗
                      </a>
                      <a href={fpgScoringUrl(curTournament.ccode, curTournament.tcode)}
                        target="_blank" rel="noopener noreferrer"
                        className="tourn-ext-link"
                        title="Classificação (Scoring) na Federação">
                        Scoring ↗
                      </a>
                    </div>
                    <div className="muted fs-11 mb-4">
                      T{curTournament.num} · 📍 {curTournament.campo} · 📅 {fmtDateShort(curTournament.date)}
                      {selectedGroup.isMulti && <> · {selectedGroup.totalRounds} rondas</>}
                      {selectedGroup.isEvent && <> · {selectedGroup.entries.length} escalões</>}
                      {" · "}{curTournament.players.filter(p => !isDNS(p) && !p._incomplete).length} jog
                      {curTournament._roundLabel === "Resumo" && curTournament.players.some(p => p._incomplete) && (
                        <> + {curTournament.players.filter(p => p._incomplete).length} inc</>
                      )}
                      {" · "}{curTournament.players[0]?.nholes || 18}h
                    </div>
                    {specialTab === "admissions" && adm
                      ? <AdmissionsTab
                          admissions={adm}
                          playersDB={pdb}
                          date={curTournament.date}
                          fpgUrl={curTournament.ccode && curTournament.tcode ? fpgAdmissionsUrl(curTournament.ccode, curTournament.tcode) : undefined}
                          tournamentEscalao={curTournament.escalao || undefined}
                          tournamentSex={/\bF\b|\bS\b|Feminino/i.test(curTournament.name || "") ? "F" : /\bM\b|\bH\b|Masculino/i.test(curTournament.name || "") ? "M" : undefined}
                        />
                      : specialTab && specialTab.startsWith("draw:")
                        ? <DrawTab
                            draw={draws[specialTab.slice(5)] || { groups: [] }}
                            roundNum={parseInt(specialTab.slice(5), 10)}
                            playersDB={pdb}
                            tournamentEscalao={curTournament.escalao || undefined}
                            tournamentSex={/\bF\b|\bS\b|Feminino/i.test(curTournament.name || "") ? "F" : /\bM\b|\bH\b|Masculino/i.test(curTournament.name || "") ? "M" : undefined}
                            tournamentDate={curTournament.date}
                          />
                        : roundIdx === selectedGroup.entries.length
                          ? (() => {
                              const totalT = selectedGroup.entries.find(e => e._roundLabel === "Resumo");
                              return totalT
                                ? <DriveAllRoundsScorecardLB totalTournament={totalT} playersDB={pdb} sdLookup={sdLookup} />
                                : <EmptyState size="sm" message="Dados insuficientes" />;
                            })()
                          : curTournament._roundLabel === "Resumo"
                            ? <DriveAccumulatedLB tournament={curTournament} nRounds={selectedGroup.totalRounds || 2} escLookup={escLookup} playersDB={pdb} sdLookup={sdLookup} />
                            : <ScorecardLB tournament={curTournament} playersDB={pdb} escLookup={escLookup} sdLookup={sdLookup} />}
                  </div>
                )}
              </div>
              );
            })()}

          </div>
        </div>
      )}

      {/* Ranking PJA — placeholder */}
      {navMode === "ranking-pja" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "var(--text-muted)", padding: 40 }}>
          <div style={{ fontSize: 40 }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Ranking PJA</div>
          <div className="fs-13 ta-c" style={{ maxWidth: 320 }}>Em desenvolvimento — pontuação acumulada dos atletas PJA nos torneios Drive.</div>
        </div>
      )}

    </div>
  );
}

export default function DrivePage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <DriveContent />;
}
