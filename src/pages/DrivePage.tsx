// @refresh reset
/**
 * DrivePage.tsx — DRIVE Tour & Challenge + AQUAPOR Results 2026
 * v10: Reads scraper v7 format directly (fedCode, roundScores)
 *      + multi-round support (R1/R2/Total tabs)
 */
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { ESCALOES_DRIVE as ESCALOES } from "../constants/escaloes";
import { useSort } from "../hooks/useSort";
import { loadPlayers } from "../data/loader";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { sdClassByHcp, medalColor } from "../utils/scoreDisplay";
import { calcAGS, expectedSD9 } from "../utils/whsCalc";
import { fmtToPar, fmtDateShort, fmtHcp, medal, shortDateSlash, tournamentUrl, parseTournKey, fpgAdmissionsUrl } from "../utils/format";
import TournExtLinks from "../ui/TournExtLinks";
import TabRow from "../ui/TabRow";
import { FilterPills } from "../ui/FilterPills";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import { resolveFedsInTournaments , buildEscLookup, normalizePlayer } from "../utils/playerUtils";
import { resolveEsc, buildTemporalEscLookup, type TemporalEscLookup } from "../data/fpgUtils";
import { DataSourcesChip, DataSourcesProvider, type DataSource } from "../ui/DataSources";
import { TournSidebarItem, type SidebarItemTournament } from "../ui/TournSidebarItem";
import { PILL_TCODE, EscPill, SIDEBAR_ACCENT, RoundPill, NineHPill } from "../ui/PillBadge";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarSep } from "../ui/Toolbar";
import PlayerLink from "../ui/PlayerLink";
import { useFedBirthdates } from "../ui/InscricoesComponents";
import EmptyState from "../ui/EmptyState";
import { DRIVE_POINTS_TOUR, DRIVE_POINTS_CHALLENGE, tournamentPoints, rankingTotal } from "../constants/drivePoints";
import { useMasterDetail } from "../hooks/useMasterDetail";
import KpiCard from "../ui/KpiCard";
import LoadingState from "../ui/LoadingState";
import { ScorecardLeaderboard } from "../ui/ScorecardLeaderboard";
import SortableHdr from "../ui/SortableHdr";
import DetailHeader from "../ui/DetailHeader";
import SexBadge from "../ui/SexBadge";
import { C } from "../utils/colors";
import { tournamentAces } from "../utils/aces";
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
import { FEATURED_TOURNAMENTS, buildFeaturedSynthetic } from "../data/featuredTournaments";
import AdmissionsTab from "../ui/AdmissionsTab";
import DrawTab, { buildDrawResults } from "../ui/DrawTab";
import TournamentGrid from "../ui/TournamentGrid";
import { expandMultiRound, isDNS } from "../ui/driveUtils";
import CircuitShell from "../ui/circuit/CircuitShell";
import { buildDriveEntries, DRIVE_CONFIG } from "./drive/driveCircuitData";
import { TournamentDetail } from "./fpg/TournamentDetail";

import type {
  Tournament,
  Player,
  DriveData,
  SDLookup,
  TStats,
} from "../ui/driveTypes";

/* ── Types ── */

/* ── Normalizer: imported from playerUtils ── */

function normalizeTournament(t: any): Tournament {
  return { ...t, players: (t.players || []).map(normalizePlayer) };
}

/* ── Constants ── */
const REGIONS = [
  { id: "norte",   label: "Norte",   emoji: "📍", color: "var(--accent)", bg: "var(--accent-light)" },
  { id: "tejo",    label: "Tejo",    emoji: "📍", color: "var(--accent)", bg: "var(--accent-light)" },
  { id: "sul",     label: "Sul",     emoji: "📍", color: "var(--accent)", bg: "var(--accent-light)" },
  { id: "madeira", label: "Madeira", emoji: "📍", color: "var(--accent)", bg: "var(--accent-light)" },
  { id: "acores",  label: "Açores",  emoji: "📍", color: "var(--accent)", bg: "var(--accent-light)" },
];
/** Remove o sufixo de ronda/total do tcode ("X_R2"/"X_Total" → "X"). */
const stripRoundSuffix = (tc: string | null | undefined) => (tc || "").replace(/_R\d+$|_Total$/, "");
const regionOf = (id: string | null | undefined) => REGIONS.find((r) => r.id === id);

/* ── Rankings oficiais FPG (scoring.fpg.pt) ──
   Todos hospedados no "club" universal 988, com ack fixo.
   • Drive Tour:      RDT{R}{YY}            — por região (R: M/S/T/N/A)
   • Drive Challenge: DC_{REG}M{NN}G{YY}    — por região+escalão (Gross)
   Só os códigos de região do Challenge para a Madeira (MAD) estão confirmados;
   acrescentar os restantes aqui quando se souberem. */
const FPG_RANKING_CLUB = "988";
const FPG_RANKING_ACK = "8428ACK987";
const FPG_DT_REGION_CODE: Record<string, string> = {
  madeira: "M", sul: "S", tejo: "T", norte: "N", acores: "A",
};
const FPG_DC_REGION_CODE: Record<string, string> = {
  madeira: "MAD",
};
/** URL do ranking oficial FPG para a série/região/escalão, ou null se não mapeável. */
function fpgRankingUrl(series: string, region: string, escalao: string | null, year: string | null): string | null {
  const yy = (year || String(new Date().getFullYear())).slice(-2);
  let code: string | null = null;
  if (series === "tour") {
    const r = FPG_DT_REGION_CODE[region];
    if (r) code = `RDT${r}${yy}`;
  } else if (series === "challenge") {
    const reg = FPG_DC_REGION_CODE[region];
    const nn = escalao ? (escalao.match(/\d+/) || [])[0] : null;
    if (reg && nn) code = `DC_${reg}M${nn}G${yy}`;
  }
  if (!code) return null;
  return `https://scoring.fpg.pt/lists/linkpage.aspx?page=rankingresult&club=${FPG_RANKING_CLUB}&ranking=${code}&ack=${FPG_RANKING_ACK}&minpoints=1`;
}

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

  // Skip SD calculation for multi-round combined entries (nholes > 18).
  // g >= 900 é sentinela de "sem cartão" (998 ND/NR, 999 NS/WD) — ver a mesma
  // guarda no computeSD() de fpgUtils.ts.
  if (nh <= 18 && g < 900) {
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

/* ── Escalão helpers ──────────────────────────────────────────────
 * Para resolução de escalão por jogador, usamos `resolveEsc` de fpgUtils
 * (fonte única de verdade — prioridade: DOB+data → historic → temporalLookup → escLookup).
 *
 * `buildTemporalEscLookup` vive em fpgUtils e cobre Challenge tournaments.
 *
 * As funções abaixo são adaptadores específicos do Drive:
 *  - `resolveEscForRow(p, t, ...)` — escalão para mostrar na linha do torneio `t`
 *     (escalaoAtDate é prioritário; se Drive Challenge (t.escalao) e sem DOB, usa t.escalao)
 *  - `availEscaloes` e `filterTournByEsc` — helpers de UI (lista/filtro)
 */
type EscLookup = Map<string, string>; // fedCode → normalized escalão ("Sub 12")

/** Wrapper canónico: escalão do jogador no contexto do torneio (com todos os fallbacks). */
function resolveEscForTournament(
  p: Player,
  t: Tournament,
  escLookup: EscLookup,
  playersDB: PlayersDB,
  temporalEscLookup?: TemporalEscLookup,
  fedBirthdates?: Map<string, string>
): string {
  // Tentar via DOB (regra FPG year-based) + historic + temporal + actual.
  // `fedBirthdates` (federados.json) cobre Sub-10 e novos registos que não
  // estão em `players.json` curado — sem ele, torneios combinados herdam o
  // escalão base errado.
  const viaResolve = resolveEsc(p as any, escLookup, {
    tournamentDate: t.date,
    playersDB,
    temporalEscLookup,
    fedBirthdates,
  });
  if (viaResolve) return viaResolve;
  // Último recurso: se o torneio tem escalão explícito (Drive Challenge), usa-o
  if (t.escalao) return t.escalao;
  return "";
}

function availEscaloes(
  tournaments: Tournament[],
  escLookup: EscLookup,
  playersDB: PlayersDB,
  temporalEscLookup?: TemporalEscLookup,
  fedBirthdates?: Map<string, string>
): string[] {
  const s = new Set<string>();
  for (const t of tournaments) {
    for (const p of t.players) {
      if (isDNS(p)) continue;
      const e = resolveEscForTournament(p, t, escLookup, playersDB, temporalEscLookup, fedBirthdates);
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
  playersDB: PlayersDB,
  temporalEscLookup?: TemporalEscLookup,
  fedBirthdates?: Map<string, string>
): Tournament[] {
  return tournaments.map(t => {
    const filtered = t.players.filter(p => {
      if (isDNS(p)) return false;
      const esc = resolveEscForTournament(p, t, escLookup, playersDB, temporalEscLookup, fedBirthdates);
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
const shortCampo = (c: string) =>
  c?.replace(/Vilamoura - /g, "").replace(/ \(.*\)/, "").replace(/ - .*/, "")
    .replace(/ Golf/g, "").replace(/Santo da Serra.*/, "Stº Serra") || "";

/* ── Player name (alias do primitivo partilhado) ── */
const PName = (props: { name: string; fed?: string; playersDB?: PlayersDB; highlight?: boolean }) =>
  <TournPName name={props.name} fed={props.fed} playersDB={props.playersDB} highlight={props.highlight} />;

/* ── Drive Tour / Challenge Points table — fonte única em constants/drivePoints ── */

/* ═══════════════════════════════════════════════════════
   DRIVE POINTS TABLE (tabela de referência de pontos)
   ═══════════════════════════════════════════════════════ */
function DrivePointsTable() {
  const [open, setOpen] = React.useState(false);
  // Tour e Challenge diferem no 8º (38 vs 35) e o Tour tem 20º=18 — mostrar
  // ambas as colunas (descoberta 2026-07-10 vs rankings oficiais).
  const allPos = [...new Set([...Object.keys(DRIVE_POINTS_TOUR), ...Object.keys(DRIVE_POINTS_CHALLENGE)].map(Number))].sort((a, b) => a - b);
  const entries = allPos.map(pos => ({ pos, pts: DRIVE_POINTS_TOUR[pos] ?? 0, ptsCh: DRIVE_POINTS_CHALLENGE[pos] ?? 0 }));
  const half = Math.ceil(entries.length / 2);
  const col1 = entries.slice(0, half);
  const col2 = entries.slice(half);

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <span className="h-md fs-13">🏅 Tabela de Pontos Drive Tour</span>
        <span style={{ fontSize: "var(--fs-10)", color: "var(--text-muted)", marginTop: 1 }}>{open ? "▲ fechar" : "▼ ver"}</span>
      </button>
      {open && (
        <div className="mt-10">
          <div className="muted fs-11 mb-8">
            Pontos por posição final em cada torneio — Tour e Challenge diferem no 8º lugar (validado contra os rankings oficiais FPG).
          </div>
          <div className="flex-wrap" style={{ display: "flex", gap: 24 }}>
            {[col1, col2].map((col, ci) => (
              <table key={ci} className="dtable tbl-compact" style={{ width: "auto", minWidth: 190 }}>
                <thead>
                  <tr>
                    <th className="r" style={{ width: 40 }}>Pos</th>
                    <th className="r fw-800" style={{ width: 60, color: "var(--color-warn-dark)" }}>Tour</th>
                    <th className="r fw-800" style={{ width: 70, color: "var(--color-warn-dark)" }}>Challenge</th>
                  </tr>
                </thead>
                <tbody>
                  {col.map(({ pos, pts, ptsCh }) => (
                    <tr key={pos}>
                      <td className="r fw-700" style={{ color: medalColor(pos) ?? "var(--text)" }}>
                        {medal(pos) ?? pos + "º"}
                      </td>
                      <td className="r fw-800" style={{ color: "var(--color-warn-dark)" }}>{pts || "—"}</td>
                      <td className="r fw-800" style={{ color: "var(--color-warn-dark)", opacity: ptsCh === pts ? 0.55 : 1 }}>{ptsCh || "—"}</td>
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
function ScorecardLB(props: { tournament: Tournament; playersDB: PlayersDB; escLookup: EscLookup; sdLookup: SDLookup; temporalEscLookup?: TemporalEscLookup; fedBirthdates?: Map<string, string> }) {
  const { tournament, playersDB, escLookup, sdLookup, temporalEscLookup, fedBirthdates } = props;
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
  const escOf = (p: Player) => resolveEscForTournament(p, tournament, escLookup, playersDB, temporalEscLookup, fedBirthdates);
  const sdOf = (p: Player) => computeStats(p, sdLookup)?.sd18 ?? null;

  const mult = sortDir === "asc" ? 1 : -1;
  const INF = 9999;
  const sorted = [...byGross].sort((a, b) => {
    if (sortKey === "pos") {
      return mult * ((a._dp ?? INF) - (b._dp ?? INF));
    }
    if (sortKey === "esc") {
      const ai = ESCALOES.indexOf(escOf(a)); const bi = ESCALOES.indexOf(escOf(b));
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

  const rows: import("../ui/ScorecardLeaderboard").ScorecardRow[] = sorted.map((p, idx) => {
    const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number);
    const dp = p._dp;
    const showP = idx === 0 || dp !== (sorted[idx - 1] as Player)._dp;
    const rowBg = isManuel(p) ? "var(--bg-success-subtle)" : undefined;
    const esc = resolveEscForTournament(p, tournament, escLookup, playersDB, temporalEscLookup, fedBirthdates);
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
        {(refP as { course?: string }).course && <> · 📍 {(refP as { course?: string }).course}</>}
        {refP.courseRating && <> · CR {refP.courseRating}</>}
        {refP.slope && <> · Slope {refP.slope}</>}
      </>}
      prefixHeaderCells={<>
        <SortableHdr k="esc" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-esc">ESC.</SortableHdr>
        <th className="lb-club">CLUBE</th>
        <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-hcp">HCP</SortableHdr>
        <SortableHdr k="tee" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-tee">TEE</SortableHdr>
      </>}
      postScorecardHeaderCells={<>
        <SortableHdr k="sd" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="lb-sd">SD</SortableHdr>
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
function DriveAccumulatedLB({ tournament, nRounds, escLookup, playersDB, sdLookup, temporalEscLookup, fedBirthdates }: {
  tournament: Tournament; nRounds: number; escLookup: EscLookup; playersDB: PlayersDB; sdLookup: SDLookup; temporalEscLookup?: TemporalEscLookup;
  fedBirthdates?: Map<string, string>;
}) {
  const rawPlayers = tournament.players;
  const complete = rawPlayers.filter(p => !p._incomplete);
  const incomplete = rawPlayers.filter(p => p._incomplete);
  const parPerRound = complete[0]?.parTotal ?? incomplete[0]?.parTotal ?? 72;

  const rows: MultiRoundRow[] = useMemo(() => rawPlayers.map(p => {
    const esc = resolveEscForTournament(p, tournament, escLookup, playersDB, temporalEscLookup, fedBirthdates);
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
    const _fed = p.fed || p.fedCode;
    const dob = (_fed && (((playersDB as any)?.[_fed]?.dob) || fedBirthdates?.get(_fed))) || null;
    return {
      key: p.scoreId || p.name,
      name: p.name,
      fed: _fed,
      club: p.club || "",
      hcp: p.hcpExact ?? null,
      esc: esc || undefined,
      dob,
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
  }), [rawPlayers, escLookup, nRounds, parPerRound, sdLookup, tournament, playersDB, temporalEscLookup, fedBirthdates]);

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
        tournamentDate={tournament.date}
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
  campo?: string;
  num?: number;
  date: string;
  escalao: string | null | undefined; // para Challenge single-escalão ou null quando evento agrupa vários
  isMulti: boolean;    // multi-ronda (R1/R2/Total)
  isEvent: boolean;    // Challenge: vários escalões no mesmo dia/campo → tabs por escalão
  totalRounds: number;
  entries: Tournament[];  // 1 para single, N+1 para multi-ronda, N escalões para isEvent
}

function buildGroups(tournaments: Tournament[]): TournGroup[] {
  const escIdx = (esc: string | null | undefined) => {
    const i = ESCALOES.indexOf(esc || "");
    return i >= 0 ? i : 99;
  };
  const sorted = [...tournaments].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return escIdx(a.escalao) - escIdx(b.escalao);
  });
  const groups: TournGroup[] = [];
  const multiMap   = new Map<string, Tournament[]>();   // Tour multi-ronda (sem escalão de evento)
  const eventMap   = new Map<string, Tournament[]>();   // Challenge: date+ccode → TODAS as entries (single/R1/R2/Resumo)
  const singles: Tournament[] = [];

  // ── 1ª passagem: bucketizar ───────────────────────────────────────────
  // Challenge agrupa SEMPRE por evento (data+campo), juntando escalões — mesmo
  // quando multi-ronda. As entries R1/R2/Resumo entram aqui e são consolidadas
  // por escalão na 2ª passagem (antes, a expansão multi-ronda fragmentava o
  // evento num cartão por escalão).
  for (const t of sorted) {
    if (t.series === "challenge" && t.escalao) {
      const eventKey = "ev-" + t.date + "-" + (t.ccode || t.campo);
      if (!eventMap.has(eventKey)) eventMap.set(eventKey, []);
      eventMap.get(eventKey)!.push(t);
    } else if (t._multiGroup) {
      if (!multiMap.has(t._multiGroup)) multiMap.set(t._multiGroup, []);
      multiMap.get(t._multiGroup)!.push(t);
    } else {
      singles.push(t);
    }
  }

  const roundSort = (a: Tournament, b: Tournament) => {
    if (a._roundLabel === "Resumo") return 1;
    if (b._roundLabel === "Resumo") return -1;
    return (a._roundLabel || "").localeCompare(b._roundLabel || "");
  };

  const seen = new Set<string>();
  for (const t of sorted) {
    if (t.series === "challenge" && t.escalao) {
      const eventKey = "ev-" + t.date + "-" + (t.ccode || t.campo);
      if (seen.has(eventKey)) continue;
      seen.add(eventKey);
      const bucket = eventMap.get(eventKey) || [];

      // Agrupar por escalão e escolher um representante por escalão:
      //   multi-ronda → entry "Resumo" (acumulado, renderiza via DriveAccumulatedLB)
      //   1 ronda     → a própria entry
      const byEsc = new Map<string, Tournament[]>();
      for (const e of bucket) {
        const k = e.escalao || "?";
        if (!byEsc.has(k)) byEsc.set(k, []);
        byEsc.get(k)!.push(e);
      }
      const reps: { escalao: string; rep: Tournament; rounds: Tournament[]; totalRounds: number }[] = [];
      for (const [esc, ents] of byEsc) {
        const resumo = ents.find(e => e._roundLabel === "Resumo");
        const rdEnts = ents.filter(e => e._roundLabel && e._roundLabel !== "Resumo");
        if (resumo) {
          reps.push({ escalao: esc, rep: resumo, rounds: rdEnts, totalRounds: resumo._totalRounds || (rdEnts.length || 2) });
        } else {
          reps.push({ escalao: esc, rep: ents[0], rounds: [], totalRounds: 1 });
        }
      }
      reps.sort((a, b) => escIdx(a.escalao) - escIdx(b.escalao));

      if (reps.length === 1) {
        const r = reps[0];
        if (r.rounds.length > 0) {
          // 1 escalão multi-ronda → cartão multi-ronda (tabs R1/R2/Resumo) — preserva drill-down por ronda
          const entries = [...r.rounds, r.rep].sort(roundSort);
          groups.push({
            key: r.rep._multiGroup || eventKey,
            label: shortCampo(r.rep.campo), campo: r.rep.campo, num: r.rep.num, date: r.rep.date,
            escalao: r.escalao, isMulti: true, isEvent: false, totalRounds: r.totalRounds, entries,
          });
        } else {
          groups.push({
            key: eventKey,
            label: shortCampo(r.rep.campo), campo: r.rep.campo, num: r.rep.num, date: r.rep.date,
            escalao: r.escalao, isMulti: false, isEvent: false, totalRounds: 1, entries: [r.rep],
          });
        }
      } else {
        // Vários escalões no mesmo evento → cartão de evento, 1 tab por escalão.
        const entries = reps.map(r => r.rep);
        const maxRounds = Math.max(1, ...reps.map(r => r.totalRounds));
        groups.push({
          key: eventKey,
          label: shortCampo(t.campo), campo: t.campo, num: t.num, date: t.date,
          escalao: null, isMulti: false, isEvent: true, totalRounds: maxRounds, entries,
        });
      }
    } else if (t._multiGroup) {
      if (seen.has(t._multiGroup)) continue;
      seen.add(t._multiGroup);
      const entries = multiMap.get(t._multiGroup)!;
      entries.sort(roundSort);
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
  /** Pontos oficiais desta prova (já com empates partilhados; nas Finais é o
   *  valor SIMPLES — o ×1.5 é aplicado pelo rankingTotal). */
  pts: number;
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
/** Labels legíveis das zonas Drive (chaves canónicas em minúsculas). */
const REGION_LABEL: Record<string, string>  = { norte: "Norte", tejo: "Tejo", sul: "Sul", madeira: "Madeira", acores: "Açores", nacional: "Nacional" };
const regionLabel = (r: string): string => REGION_LABEL[r.toLowerCase()] || r;

const numAvg = (nums: number[]): number | null => nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;

/** Compara escalões ignorando espaços/hífens/caixa ("Sub-12" ≡ "Sub 12" ≡ "sub12").
 *  Generalização 2026-07-10: o ranking deixou de ser fixo Sub-10+Sub-12 — o
 *  escalão-alvo é escolhido no selector da sidebar (estado `sub12Esc`). */
function escMatches(esc: string, target: string): boolean {
  if (!esc || !target) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[\s-]/g, "");
  return norm(esc) === norm(target);
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
function buildSub12Data(
  tournaments: Tournament[],
  playersDB: PlayersDB,
  sdLookup: SDLookup,
  escLookup: EscLookup,
  temporalEscLookup?: TemporalEscLookup,
  fedBirthdates?: Map<string, string>,
  targetEsc: string = "Sub 12"
): Sub12Row[] {
  // Incluir apenas ronda única OU a entrada "Total" de torneios multi-ronda
  // (nunca R1/R2 individuais — pontos são pela classificação do Total)
  const validTournaments = tournaments.filter(t =>
    !t._roundLabel || t._roundLabel === "Resumo"
  );
  const playerMap = new Map<string, Sub12Row>();
  for (const t of validTournaments) {
    // Pontos oficiais da prova, para o campo TODO (não só o escalão filtrado):
    // a posição que pontua é a do leaderboard completo. No Aquapor é dentro do
    // sexo, daí passar o sexo do players.json.
    const ptsByFed = tournamentPoints(
      t.players.map(p => ({
        fed: p.fed || p.fedCode || "",
        pos: p.pos,
        gross: typeof p.grossTotal === "number" ? p.grossTotal : null,
        sex: playersDB[p.fed || p.fedCode || ""]?.sex || "",
      })),
      t.series,
    );
    for (const p of t.players) {
      if (isDNS(p)) continue;
      // Escalão no ANO do torneio (year-based) — crucial para filtrar o escalão
      // correctamente em torneios antigos (um jogador que é Sub-14 hoje pode ter
      // sido Sub-12 em 2024, e vice-versa).
      const esc = resolveEscForTournament(p, t, escLookup, playersDB, temporalEscLookup, fedBirthdates);
      // "all" = TODOS os jogadores do circuito, incluindo os de escalão não
      // resolvido (sem DOB em players.json/federados — ex: João Santos/PXO,
      // Maria Cunha, que faltavam vs o ranking oficial RDTM26). O circuito
      // Drive é exclusivamente jovem, por isso é seguro não filtrar aqui.
      // Escalão específico exige match exacto (sem DOB fica de fora — não
      // há como saber o escalão).
      if (targetEsc !== "all" && !escMatches(esc, targetEsc)) continue;
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
        campo: t.campo || "", region: t.region || "", series: (t.series || "tour") as "tour" | "challenge" | "aquapor",
        gross: g, toPar: tp,
        sd: sd18 != null ? Math.round(sd18 * 10) / 10 : null, sdSource,
        pos: p.pos, totalPlayers: t.playerCount, pts: ptsByFed.get(fed) ?? 0,
        nholes, birdies, pars: parsCount, bogeys,
      });
      row.totalBird += birdies;
      row.totalPars += parsCount;
      row.totalBog  += bogeys;
    }
  }
  for (const row of playerMap.values()) {
    row.results.sort((a, b) => a.dateSort - b.dateSort);
    // Zona DRIVE do jogador = zona MODAL dos torneios que jogou (vocabulário
    // canónico norte/tejo/sul/madeira/acores). NÃO usar a região de residência
    // do players.json ("Algarve"/"Lisboa"/…, outro vocabulário e com encoding
    // partido) — misturava dois mundos no filtro de zonas (bug 2026-07-10).
    const zoneCounts = new Map<string, number>();
    for (const r of row.results) {
      if (r.region) zoneCounts.set(r.region, (zoneCounts.get(r.region) || 0) + 1);
    }
    const modalZone = [...zoneCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (modalZone) row.region = modalZone;
    const grosses = row.results.map(r => r.gross);
    const sds = row.results.filter(r => r.sd != null).map(r => r.sd!);
    row.tourneiosPlayed = row.results.length;
    row.avgGross = numAvg(grosses);
    row.avgSD = numAvg(sds);
    row.bestGross = grosses.length > 0 ? Math.min(...grosses) : null;
    row.bestSD = sds.length > 0 ? Math.min(...sds) : null;
    // Ranking COMO A FPG: melhores-4 da fase regular + Final regional ×1.5.
    row.totalPts = rankingTotal(row.results);
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
      totalPts:  rankingTotal(fR),
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
              padding: "3px 8px", borderRadius: "var(--radius-pill)", fontSize: "var(--fs-10)",
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
                  <td className="r" style={{ fontSize: "var(--fs-16)" }}>{medal(i + 1) ?? <span className="mono fw-700">{i+1}</span>}</td>
                  <td>
                    <a href={`/jogadores/${p.fed}`} target="_blank" rel="noopener noreferrer"
                      className="fw-700"
                      onClick={e => e.stopPropagation()}
                      style={{ color: "inherit", textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 2 }}>
                      {p.name}
                    </a>
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
                <a key={p.fed}
                  href={`/jogadores/${p.fed}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "var(--bg)", borderRadius: "var(--radius)", fontSize: "var(--fs-11)", color: "inherit", textDecoration: "none" }}
                  onClick={e => { e.stopPropagation(); }}>
                  <span className="fw-600">{p.name}</span>
                  <span className="mono">{r?.gross ?? "–"} <span className="c-muted">({r?.tournShort})</span></span>
                </a>
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
              formatter={(((value: number | undefined, name: string) => { const p = top.find(x => x.fed===name); return [value != null ? value.toFixed(1) : "", p?.name||name]; }) as any)} />
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
      <button onClick={onClose} title="Fechar" aria-label="Fechar" style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", cursor: "pointer", fontSize: "var(--fs-18)", color: "var(--text-3)" }}>✕</button>
      <div className="mb-8" style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span className="fw-800" style={{ fontSize: "var(--fs-16)" }}>{row.name}</span>
        <span className="muted fs-11">{row.club} · {regionLabel(row.region)} · HCP {fmtHcp(row.hcp)}</span>
        <PlayerLink fed={row.fed} name="Ver perfil →" style={{ fontSize: "var(--fs-11)", color: "var(--accent)", textDecoration: "underline" }} />
      </div>
      <div className="mb-10 flex-wrap d-flex gap-6">
        <KpiCard label="Torneios"  value={String(row.tourneiosPlayed)} />
        <KpiCard label="Pts"       value={row.totalPts > 0 ? String(row.totalPts) : "–"} color="var(--color-warn-dark)" />
        <KpiCard label="Best SD"   value={row.bestSD?.toFixed(1) ?? "–"} color={row.bestSD != null && row.bestSD <= 25 ? "var(--color-good)" : undefined} />
        <KpiCard label="Melhor"    value={row.bestGross != null ? String(row.bestGross) : "–"} color="var(--color-good-dark)" />
      </div>
      <div className="scroll-x">
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
  // Fallback DOB p/ federados fora de players.json curado.
  const fedBirthdates = useFedBirthdates();
  // Deep-link canónico: /drive/torneio/{ccode}-{tcode}
  const { tkey: urlTkey } = useParams<{ tkey?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Filtros sincronizados com URL query params para partilha directa.
  // Formato: `/drive?nav=ranking-sub12&series=aquapor&year=2026&region=Norte&esc=Sub+12,Sub+14&manuel=0`.
  const [searchParams, setSearchParams] = useSearchParams();
  const getQP = (key: string) => searchParams.get(key);

  const [navMode, setNavMode]   = useState<"torneios"|"ranking-sub12">(() => {
    const v = getQP("nav");
    return (v === "ranking-sub12") ? v : "torneios";
  });
  const [series, setSeries]     = useState<"all"|"tour"|"challenge"|"aquapor">(() => {
    const v = getQP("series");
    return (v === "all" || v === "tour" || v === "challenge" || v === "aquapor") ? v : "tour";
  });
  const [filterManuel, setFilterManuel] = useState(() => getQP("manuel") === "1");
    const md = useMasterDetail();
  const [regionFilter, setRegionFilter]         = useState<string | null>(() => getQP("region"));
  const [escFilter, setEscFilter]               = useState<string[]>(() => {
    const v = getQP("esc");
    return v ? v.split(",").map(s => s.trim()).filter(Boolean) : [];
  });
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [roundIdx, setRoundIdx]                 = useState(0);

  // Filtro de ano (null = todos)
  const [yearFilter, setYearFilter]             = useState<string | null>(() => getQP("year"));

  // Estado específico Sub-12
  const [sub12Series, setSub12Series]   = useState<Sub12SeriesTab>(() => {
    const v = getQP("s12s"); return (v === "tour" || v === "aquapor") ? v as Sub12SeriesTab : "tour";
  });
  const [sub12View, setSub12View]       = useState<Sub12ViewTab>(() => {
    const v = getQP("s12v"); return (v === "grid" || v === "list") ? v as Sub12ViewTab : "grid";
  });
  // Região: `s12r` é o param próprio; `region` (do modo torneios) serve de
  // fallback — assim `?nav=ranking-sub12&region=acores` filtra o ranking em
  // vez de ficar um param fantasma sem efeito (bug 2026-07-10).
  const [sub12Region, setSub12Region]   = useState(() => getQP("s12r") || getQP("region") || "all");
  const [sub12Sex, setSub12Sex]         = useState(() => getQP("s12x") || "all");
  // Escalão do ranking (generalização 2026-07-10 — deixou de ser fixo Sub-12).
  // "all" = todos os escalões jovens (Sub 10-18), como "Todas as zonas".
  const [sub12Esc, setSub12Esc]         = useState<string>(() => {
    const v = getQP("s12e");
    return v && (v === "all" || ESCALOES.includes(v)) ? v : "Sub 12";
  });
  const [sub12Search, setSub12Search]   = useState("");
  const [sub12Player, setSub12Player]   = useState<Sub12Row | null>(null);

  // Torneio seleccionado — vem do URL (?t=) para que o link seja partilhável.
  // Sem isto, /drive?series=aquapor abria sempre o torneio MAIS RECENTE da
  // série e não aquele que se estava a ver: partilhar o link mandava a outra
  // pessoa para outro torneio (e mudava sozinho à medida que novos torneios
  // fossem scrapados). Declarado aqui, acima do efeito state→URL, porque esse
  // efeito passou a lê-lo.
  const [selectedDriveId, setSelectedDriveId] = useState<string | null>(() => getQP("t"));

  // Sincronização state → URL (query string). Constrói params só com valores
  // não-default para manter URLs limpas. `replace: true` não pollui histórico.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (navMode !== "torneios") sp.set("nav", navMode);
    if (series !== "tour") sp.set("series", series);
    if (filterManuel) sp.set("manuel", "1");
    if (regionFilter) sp.set("region", regionFilter);
    if (escFilter.length) sp.set("esc", escFilter.join(","));
    if (yearFilter) sp.set("year", yearFilter);
    // Torneio aberto — torna o link partilhável ("estamos a ver ESTE").
    // Só na vista de torneios: nos rankings não há torneio seleccionado.
    if (navMode === "torneios" && selectedDriveId) sp.set("t", selectedDriveId);
    if (navMode === "ranking-sub12") {
      if (sub12Series !== "tour") sp.set("s12s", sub12Series);
      if (sub12View !== "grid") sp.set("s12v", sub12View);
      if (sub12Region !== "all") sp.set("s12r", sub12Region);
      if (sub12Sex !== "all") sp.set("s12x", sub12Sex);
      if (sub12Esc !== "Sub 12") sp.set("s12e", sub12Esc);
    }
    // Não mexer se o URL já é igual (evita push inútil ao histórico)
    if (sp.toString() !== searchParams.toString()) {
      setSearchParams(sp, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navMode, series, filterManuel, regionFilter, escFilter, yearFilter, selectedDriveId, sub12Series, sub12View, sub12Region, sub12Sex, sub12Esc]);

  // Carrega todos os ficheiros mensais: {prefix}-YYYY-MM.json
  // Itera startYear → ano corrente, todos os meses; ignora silenciosamente os que não existem (404)
  // Retorna tornedos com `_sourceFile` preenchido + meta de cada ficheiro.
  // startYear por prefixo (primeiro ficheiro que existe):
  //   drive-data   → 2021 (2021-09)
  //   aquapor-data → 2024 (2024-02)
  // Evita dezenas de fetches a ficheiros que sabemos não existirem.
  async function loadAllFiles(prefix: string, forceAqapor = false, startYear = 2021): Promise<{ tournaments: Tournament[]; meta: DataSource[] }> {
    const all: Tournament[] = [];
    const meta: DataSource[] = [];
    const now = new Date();
    const curYear  = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    for (let year = startYear; year <= curYear; year++) {
      for (let month = 1; month <= 12; month++) {
        if (year === curYear && month > curMonth) break;
        const mm  = String(month).padStart(2, "0");
        const url = `/data/${prefix}-${year}-${mm}.json`;
        try {
          const r = await fetch(url);
          if (!r.ok) continue;   // mês sem ficheiro → saltar (não regista 404 para não poluir o painel)
          // Em dev, Vite faz fallback para index.html quando o ficheiro não existe
          // (r.ok=true mas body é HTML, não JSON). Verificar Content-Type antes
          // de parsear, senão r.json() rebenta com "unexpected character at line 1".
          const ct = r.headers.get("content-type") || "";
          if (!ct.includes("json")) continue;
          const d = await r.json();
          const tourns: Tournament[] = (d.tournaments || []).map((t: any) => {
            const base = forceAqapor ? { ...t, series: "aquapor" as const } : t;
            return { ...normalizeTournament(base), _sourceFile: url } as Tournament;
          });
          all.push(...tourns);
          meta.push({
            path: url,
            status: "loaded",
            count: tourns.length,
            source: d.source,
            lastUpdated: d.lastUpdated,
            group: prefix,
          });
        } catch (e) {
          meta.push({ path: url, status: "error", error: String(e), group: prefix });
        }
      }
    }
    return { tournaments: all, meta };
  }

  const [monthlyMeta, setMonthlyMeta] = useState<DataSource[]>([]);

  useEffect(() => {
    Promise.all([
      loadAllFiles("drive-data", false, 2021),
      loadAllFiles("aquapor-data", true, 2024),
      loadPlayers().catch(() => ({})),
      fetch("/data/drive-sd-lookup.json").then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([driveR, aqR, pp, sd]) => {
      const driveTourns = driveR.tournaments;
      const aqTourns = aqR.tournaments;
      setMonthlyMeta([...driveR.meta, ...aqR.meta]);
      const rawTournaments = [...driveTourns, ...aqTourns];
      setRaw(rawTournaments);
      const allTourns = expandMultiRound(rawTournaments);
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
  const [raw, setRaw] = useState<Tournament[]>([]);
  const [admissionsMeta, setAdmissionsMeta] = useState<DataSource[]>([]);
  useEffect(() => {
    loadFpgAdmissionsDraws()
      .then(f => {
        setAdmDrawsIdx(indexFpgAdmissionsDraws(f));
        setAdmissionsMeta([{
          path: "/data/fpg-admissions-draws.json",
          status: "loaded",
          count: f?.tournaments?.length || 0,
          source: (f as any)?.source,
          lastUpdated: (f as any)?.scrapedAt,
          group: "admissions",
        }]);
      })
      .catch((e) => {
        setAdmissionsMeta([{
          path: "/data/fpg-admissions-draws.json",
          status: "error",
          error: String(e),
          group: "admissions",
        }]);
      });
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

  // ── CircuitShell: entries a partir da lista CRUA (não-expandida) ─────────
  // O IntlTournView desenha as tabs de ronda a partir de results.players[].roundScores;
  // as secções Inscritos/Draw vêm de _admissions/_draws (anexados por tcode base).
  const escLookup = useMemo(() => buildEscLookup(pdb, (data?.tournaments ?? []) as any /* tipo local diferente do playerUtils */), [pdb, data]);
  const driveEntries = useMemo(() => {
    if (raw.length === 0) return [];
    if (admDrawsIdx.size > 0) {
      for (const t of raw) {
        const ad = admDrawsIdx.get(`${t.ccode}-${(t as any).tcode}`);
        if (ad) { (t as any)._admissions = ad.admissions; (t as any)._draws = ad.draws; }
      }
    }
    // Injectar torneios Drive FUTUROS como sintéticos — mesmo template da
    // FPGPage (src/data/featuredTournaments.ts): aparecem na sidebar apenas
    // com Inscrições/Draw enquanto não há resultados nos drive-data-*.json;
    // o TournamentDetail (renderFull abaixo) trata das tabs e da verificação
    // LIVE das inscrições. Dedup por ccode/tcode: quando o torneio real chega
    // aos ficheiros mensais, o sintético deixa de ser injectado.
    // Duas vias:
    //   (a) config FEATURED_TOURNAMENTS com series tour/challenge/aquapor
    //       (casos especiais — overrides de nome/região/links);
    //   (b) AUTO-DETECÇÃO por nome em fpg-admissions-draws.json — o scraper
    //       descobre os Drive futuros sozinho via TournamentsLST (INCLUDE_RX
    //       drive tour/challenge + aquapor) e aqui basta o nome bater.
    let src = raw as any[];
    if (admDrawsIdx.size > 0) {
      const have = new Set(src.map(t => `${t.ccode}/${(t as any).tcode}`));
      // (a) config
      for (const ft of FEATURED_TOURNAMENTS) {
        if (!ft.series || ft.series === "jovens") continue;  // jovens → FPGPage
        const key = `${ft.ccode}/${ft.tcode}`;
        if (have.has(key)) continue;
        const ad = admDrawsIdx.get(`${ft.ccode}-${ft.tcode}`);
        if (!ad) continue;  // sem dados scraped, a entrada fica dormente
        src = [...src, buildFeaturedSynthetic(ft, ad) as unknown as Tournament];
        have.add(key);
      }
      // (b) auto-detecção por nome — /chall/ como PREFIXO porque os nomes
      // longos vêm abreviados da FPG em pontos arbitrários ("Drive Chall
      // Tejo-Mosteiro-…", "Drive Challe Tejo-Power by Belas-…")
      const DRIVE_RE = /\bdrive\s+(tour\b|chall)/i;
      const AQUA_RE = /\baquapor\b/i;
      const inferDriveRegion = (name: string): string | null => {
        if (/madeira/i.test(name)) return "madeira";
        if (/a[çc]ores/i.test(name)) return "acores";
        if (/\bnorte\b/i.test(name)) return "norte";
        if (/\btejo\b/i.test(name)) return "tejo";
        if (/\bsul\b/i.test(name)) return "sul";
        return null;
      };
      for (const [, ad] of admDrawsIdx) {
        const key = `${ad.ccode}/${ad.tcode}`;
        if (have.has(key)) continue;
        const name = ad.name || "";
        if (!DRIVE_RE.test(name) && !AQUA_RE.test(name)) continue;
        const ftAuto = {
          ccode: String(ad.ccode),
          tcode: String(ad.tcode),
          series: (AQUA_RE.test(name) ? "aquapor" : /\bchall/i.test(name) ? "challenge" : "tour") as "aquapor" | "challenge" | "tour",
          region: inferDriveRegion(name),
        };
        src = [...src, buildFeaturedSynthetic(ftAuto, ad) as unknown as Tournament];
        have.add(key);
      }
    }
    // Filtros tournament-level (partilhados por TODOS os escalões do mesmo dia →
    // não destroem o agrupamento por evento): série / ano / região.
    if (series !== "all") src = src.filter(t => (t.series || "tour") === series);
    // Ano: por defeito o mais recente disponível (não "todos os anos").
    const yrs = [...new Set(src.map(t => (t.date || "").slice(0, 4)).filter(Boolean))].sort().reverse();
    const effYear = yearFilter ?? yrs[0];
    if (effYear) src = src.filter(t => (t.date || "").slice(0, 4) === effYear);
    if (regionFilter) src = src.filter(t => t.region === regionFilter);
    const ents = buildDriveEntries(src as any);
    // Detalhe IDÊNTICO à FPGPage: cada divisão (escalão) renderiza o TournamentDetail
    // da FPGPage — tabs flat (Inscrições·Draw·R1·R2·Resumo·Scorecards), que busca
    // inscrições/draws sozinho por ccode-tcode. Limpamos as secções genéricas do
    // shell para não aparecerem section-tabs duplicados.
    for (const e of ents) {
      for (const d of e.divisions ?? []) {
        d.inscritos = undefined;
        d.draw = undefined;
        const t = d.results as any;
        d.renderFull = (extras) => <TournamentDetail tournament={t} escLookup={escLookup as any} playersDB={pdb as any}
          extraTabs={[extras?.seasonTab, extras?.pastEditionsTab].filter(Boolean) as { key: string; label: string; content: React.ReactNode }[]} />;
      }
    }
    // Filtros entry-level — preservam TODOS os escalões do evento: Manuel / escalão.
    let out = ents;
    if (filterManuel) out = out.filter(e => e.hasManuel);
    if (escFilter.length > 0) out = out.filter(e => (e.divisions ?? []).some(d => escFilter.includes(d.escalao as any)));
    return out;
  }, [raw, admDrawsIdx, series, yearFilter, regionFilter, filterManuel, escFilter, pdb, escLookup]);

  // Pool INTEGRAL para a tab "Edições anteriores" — TODOS os torneios (todos os
  // anos/séries/regiões), sem os filtros da sidebar nem os sintéticos futuros.
  // O Drive repete o mesmo evento várias vezes por ano (etapas), por vezes no
  // mesmo campo; a tab mostra-os todos como colunas. Sem este pool integral, as
  // irmãs ficavam limitadas ao ano/série/região filtrados na sidebar.
  const driveEditionsPool = useMemo(() => (raw.length === 0 ? [] : buildDriveEntries(raw as any)), [raw]);

  // Auto-seleccionar o torneio mais recente (e re-seleccionar quando a selecção
  // actual deixa de estar visível depois de mudar filtros).
  useEffect(() => {
    if (driveEntries.length === 0) return;
    const exists = selectedDriveId && driveEntries.some(e => e.id === selectedDriveId);
    if (!exists) {
      const latest = [...driveEntries].sort((a, b) => (b.dateStart || "").localeCompare(a.dateStart || ""))[0];
      setSelectedDriveId(latest?.id ?? null);
    }
  }, [driveEntries, selectedDriveId]);

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
  // escLookup definido acima (antes de driveEntries).

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
    return buildSub12Data(tourns, pdb, sdLookup, escLookup, temporalEscLookup, fedBirthdates, sub12Esc);
  }, [sub12Ready, data, pdb, sdLookup, escLookup, temporalEscLookup, activeYear, fedBirthdates, sub12Esc]);

  const sub12SeriesRows = useMemo(() => filterBySub12Series(sub12Data, sub12Series), [sub12Data, sub12Series]);

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

  // Colunas da grid = torneios onde os jogadores VISÍVEIS jogaram (derivadas
  // das linhas já filtradas) — com o filtro Madeira activo, as colunas das
  // outras zonas desaparecem em vez de consumir espaço vazio (2026-07-10).
  const sub12Tourns = useMemo(() => {
    const m = new Map<string, { key: string; short: string; date: string; series: string; dateSort: number }>();
    for (const row of sub12Filtered) {
      for (const r of row.results) {
        if (!m.has(r.tournKey)) m.set(r.tournKey, { key: r.tournKey, short: r.tournShort, date: r.date, series: r.series, dateSort: r.dateSort });
      }
    }
    return [...m.values()].sort((a,b) => a.dateSort - b.dateSort);
  }, [sub12Filtered]);

  // Zonas disponíveis: derivadas de TODOS os dados do escalão (não só da série
  // corrente) — senão o select desaparecia em séries pequenas (AQUAPOR com 1
  // jogador → 1 zona) e a lista "saltava" ao trocar de série.
  const sub12AvailRegions = useMemo(() => [...new Set(sub12Data.map(p => p.region).filter(Boolean))].sort(), [sub12Data]);

  const sub12Counts = useMemo(() => {
    const counts: Record<string, { players: number; tourns: number }> = {};
    for (const s of SUB12_SERIES_TABS) {
      const rows = filterBySub12Series(sub12Data, s.key);
      const tourns = new Set(rows.flatMap(p => p.results.map(r => r.tournKey)));
      counts[s.key] = { players: rows.length, tourns: tourns.size };
    }
    return counts;
  }, [sub12Data]);

  const sub12EscLabel = sub12Esc === "all" ? "Todos os escalões" : sub12Esc;
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
    // Aplicar escFilter. Challenge: cada tcode é um único escalão (t.escalao
    // definido), por isso filtra-se ao nível do torneio — caso contrário a
    // ResumoTable (painel Temporada) mostrava todos os escalões juntos.
    // Outras séries: filtro por jogador (DOB) com recálculo de posições.
    if (escFilter.length > 0) {
      ts = series === "challenge"
        ? ts.filter(t => t.escalao != null && escFilter.includes(t.escalao))
        : filterTournByEsc(ts, escFilter, escLookup, pdb, temporalEscLookup, fedBirthdates);
    }
    if (filterManuel) ts = ts.filter(t => t.players.some((p: Player) => isManuel(p)));
    return ts;
  }, [series, seriesT, regionFilter, escFilter, escLookup, pdb, temporalEscLookup, filterManuel, fedBirthdates]);

  const filteredGroups = useMemo(() => {
    const applyFilters = (ts: Tournament[]) => {
      let r = ts;
      if (regionFilter) r = r.filter(t => t.region === regionFilter);
      if (escFilter.length > 0 && series !== "challenge") r = filterTournByEsc(r, escFilter, escLookup, pdb, temporalEscLookup, fedBirthdates);
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
  }, [series, filteredT, tourT, challT, aquaporT, regionFilter, escFilter, filterManuel, escLookup, pdb, temporalEscLookup, fedBirthdates]);

  const regionT = useMemo(() => regionFilter ? seriesT.filter(t => t.region === regionFilter) : seriesT, [seriesT, regionFilter]);
  const uniquePCFiltered  = useMemo(() => uniquePC(filteredT), [filteredT]);
  const uniquePCRegion    = useMemo(() => uniquePC(regionT), [regionT]);
  const countTour         = useMemo(() => countEvents(tourT), [tourT]);
  const countChall        = useMemo(() => countEvents(challT), [challT]);
  const countAquapor      = useMemo(() => countEvents(aquaporT), [aquaporT]);

  // Para series="all" mostramos sempre todos os escalões (fixo) — evita iterar todos os jogadores
  const availEscs = useMemo(() => {
    if (series === "all") return ["Sub 10","Sub 12","Sub 14","Sub 16","Sub 18","Absoluto","Sénior"];
    return availEscaloes(regionT, escLookup, pdb, temporalEscLookup, fedBirthdates);
  }, [series, regionT, escLookup, pdb, temporalEscLookup, fedBirthdates]);

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

  // ── Deep-link: ajustar filtros para que o torneio seja visível ──────────
  // Quando há `/drive/torneio/{ccode}-{tcode}` na URL, detectar em que série
  // (tour/challenge/aquapor) o torneio está e mudar `series` para essa antes
  // de procurar. Também desliga `filterManuel` se o Manuel não jogou no
  // torneio apontado pelo deep-link. Corre só uma vez por deep-link (e
  // quando a data chega).
  useEffect(() => {
    if (!urlTkey) return;
    const parsed = parseTournKey(urlTkey);
    if (!parsed) return;
    const { ccode, tcode } = parsed;
    const matchesT = (t: Tournament) => t.ccode === ccode && (
      t.tcode === tcode || (t.tcode || "").split("+").includes(tcode)
    );
    let found: Tournament | null = null;
    let detectedSeries: "tour" | "challenge" | "aquapor" | null = null;
    for (const t of tourT) { if (matchesT(t)) { found = t; detectedSeries = "tour"; break; } }
    if (!found) for (const t of challT) { if (matchesT(t)) { found = t; detectedSeries = "challenge"; break; } }
    if (!found) for (const t of aquaporT) { if (matchesT(t)) { found = t; detectedSeries = "aquapor"; break; } }
    if (!found || !detectedSeries) return;  // ainda não carregado — próxima corrida apanha
    if (series !== detectedSeries && series !== "all") setSeries(detectedSeries);
    // Desligar filterManuel se o Manuel não está neste torneio — caso contrário o
    // filtro esconde-o e nunca aparece.
    if (filterManuel && !found.players.some(p => isManuel(p))) setFilterManuel(false);
    // Limpar filtros regionais/escalão que possam estar a esconder o torneio
    if (regionFilter && found.region !== regionFilter) setRegionFilter(null);
    if (escFilter.length > 0) setEscFilter([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTkey, tourT, challT, aquaporT]);

  // ── Deep-link: sync URL (:tkey) → selectedGroupKey + roundIdx ──────────
  // `/drive/torneio/{ccode}-{tcode}` → procura o torneio na lista filtrada
  // e selecciona o grupo/entry correspondente. Corre quando `filteredGroups`
  // termina de carregar e sempre que o tkey da URL muda.
  useEffect(() => {
    if (!urlTkey || filteredGroups.length === 0) return;
    const parsed = parseTournKey(urlTkey);
    if (!parsed) return;
    const { ccode, tcode } = parsed;
    for (const g of filteredGroups) {
      // Match exacto primeiro (preserva ronda/escalão específico no URL).
      let entryIdx = g.entries.findIndex(e =>
        e.ccode === ccode && (
          e.tcode === tcode ||
          (e.tcode || "").split("+").includes(tcode)
        )
      );
      // Fallback por tcode base (sem sufixo _R{n}/_Total) — para hrefs canónicos
      // da sidebar de eventos multi-ronda, onde as entries são "_Total".
      if (entryIdx < 0) {
        entryIdx = g.entries.findIndex(e => {
          const base = stripRoundSuffix(e.tcode);
          return e.ccode === ccode && (base === tcode || base.split("+").includes(tcode));
        });
      }
      if (entryIdx >= 0) {
        if (selectedGroupKey !== g.key) setSelectedGroupKey(g.key);
        if (roundIdx !== entryIdx) setRoundIdx(entryIdx);
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTkey, filteredGroups]);

  // ── Deep-link: sync estado (torneio seleccionado) → URL ────────────────
  // Quando o utilizador muda de torneio (clica na sidebar ou nas tabs de
  // ronda/escalão), actualizar a URL para `/drive/torneio/{ccode}-{tcode}`
  // com `replace: true` (não pollui o histórico). Não há loop: o useEffect
  // URL→estado acima só dispara setters quando `idx !== selected`, e
  // navegar para a URL actual é no-op.
  useEffect(() => {
    if (!curTournament || !curTournament.ccode || !curTournament.tcode) return;
    const target = tournamentUrl("drive", curTournament.ccode, curTournament.tcode);
    if (target && location.pathname !== target) {
      navigate(target, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curTournament]);

  // Pré-calcular labels sidebar
  const sidebarNumCount = useMemo(() => {
    const m = new Map<string, Map<number, number>>();
    for (const g of filteredGroups) {
      const region = g.entries[0]?.region || "";
      if (!m.has(region)) m.set(region, new Map());
      const rm = m.get(region)!;
      const numKey = g.num ?? 0;
      rm.set(numKey, (rm.get(numKey) || 0) + 1);
    }
    return m;
  }, [filteredGroups]);

  const sidebarItemLabel = (g: TournGroup) => {
    const region = g.entries[0]?.region || "";
    const numKey = g.num ?? 0;
    const isDup = (sidebarNumCount.get(region)?.get(numKey) || 0) > 1;
    const base = `T${g.num ?? "?"}${isDup ? " · " + fmtDateShort(g.date) : ""} · ${g.label}`;
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
            const tc = stripRoundSuffix(e.tcode);
            const url = (tc && e.ccode) ? `https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=${String(e.ccode).padStart(3,"0")}&tcode=${tc}` : "";
            return esc && (
              <span key={esc} className="gap-2" style={{ display: "inline-flex", alignItems: "center" }}>
                <span className={`p p-sm p-${esc.toLowerCase().replace(/\s+/g,"")}`}>{esc}</span>
                {tc && (
                  <span className="p p-sm p-tourn" style={PILL_TCODE}>{tc}</span>
                )}
                {url && <button type="button" onClick={ev => { ev.stopPropagation(); window.open(url, "_blank", "noopener,noreferrer"); }}
                  style={{ background: "none", border: "none", padding: "0 1px", cursor: "pointer", fontSize: "var(--fs-11)", color: "var(--accent)", opacity: isActive ? 1 : 0.55, lineHeight: 1, display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}>🔗</button>}
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
      tcode:       g.isEvent ? undefined : (stripRoundSuffix(t0?.tcode) || undefined),
      ccode:       t0?.ccode,
      name:        sidebarItemLabel(g),
      campo:       campoDisplay,
      clube:       (t0 as any)?.clube ?? null,
      date:        g.date,
      playerCount: nJog,
      rounds:      (g.isMulti || g.isEvent) ? g.totalRounds : 1,
      nholes:      (t0 as { nholes?: number; par?: number[] } | undefined)?.nholes || (t0 as { par?: number[] } | undefined)?.par?.length || 18,
      series:      grpSeries,
      escalao:     (!g.isEvent && !g.isMulti) ? g.escalao : null,
      players:     g.entries.flatMap(e => e.players),
    };

    // Deep-link canónico — o TournSidebarItem renderiza como <a href> (com
    // Ctrl/Cmd+click a abrir em nova aba). Para sintéticos com tcode "A+B"
    // usamos apenas o primeiro tcode no URL (parseTournKey match ambos).
    const firstTcode = stripRoundSuffix((t0?.tcode || "").split("+")[0]);
    const href = (t0?.ccode && firstTcode) ? tournamentUrl("drive", t0.ccode, firstTcode) : undefined;
    return (
      <TournSidebarItem
        key={g.key}
        t={tData}
        isActive={isActive}
        onClick={onClick}
        accentColor={grpAccent}
        extraPills={extraPills}
        href={href}
      />
    );
  };
  if (loading) return <LoadingState />;
  if (error)   return <div className="jogadores-page"><div className="notice-error" style={{ margin: 16 }}>Erro: {error}</div></div>;
  if (!data)   return null;

  const sdCount = Object.keys(sdLookup).length;
  const allSources: DataSource[] = [...monthlyMeta, ...admissionsMeta];
  const providerTournaments = (data?.tournaments ?? []).map(t => ({
    _sourceFile: (t as any)._sourceFile,
    name: t.name,
    date: t.date,
    tcode: t.tcode,
    ccode: t.ccode,
  }));
  return (
    <DataSourcesProvider tournaments={providerTournaments}>
    <div className="jogadores-page">

      {/* ── Toolbar mobile-first: scroll horizontal ── */}
      <div style={{ borderBottom: "1px solid var(--border-light)" }}>

        {/* Linha 1: tudo numa linha scrollável */}
        <Toolbar>
          <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Torneios" />
          <ToolbarTitle>🏁 DRIVE</ToolbarTitle>
          <DataSourcesChip sources={allSources} />
          <a href="https://competicoes.fpg.pt/ranking/" target="_blank" rel="noopener noreferrer"
            className="p p-sm" style={{ textDecoration: "none", background: "var(--bg-muted)", color: "var(--accent)", border: "1px solid var(--border)" }}
            title="Rankings oficiais da FPG (competicoes.fpg.pt)">🏆 Rankings FPG</a>
          <ToolbarSep />
          <TabRow
            style={{ marginBottom: 0 }}
            tabs={[
              { key: "torneios",      label: "Torneios" },
              { key: "ranking-sub12", label: "🏅 Rankings" },
            ]}
            active={navMode}
            onChange={(k) => { setNavMode(k as typeof navMode); setSeries("tour"); setYearFilter(null); setSelectedGroupKey(null); setRoundIdx(0); }}
          />
          {navMode === "torneios" && (<>
            <ToolbarSep />
            <TabRow
              style={{ marginBottom: 0 }}
              tabs={[
                { key: "all",       label: "Todos" },
                { key: "tour",      label: "🏌️ Tour", count: countTour },
                { key: "challenge", label: "⚡ Challenge", count: countChall },
                { key: "aquapor",   label: "💧 AQUAPOR", count: countAquapor },
              ]}
              active={series}
              onChange={(k) => { const kk = k as typeof series; setSeries(kk); setRegionFilter(null); setEscFilter([]); setSelectedGroupKey(null); setRoundIdx(0); if (kk === "all" && !yearFilter) setYearFilter(availYears[0] ?? null); }}
            />
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

        {/* Linha 2: regiões + escalões — wrap em mobile, scroll horizontal em desktop */}
        {navMode === "torneios" && (availRegions.length > 1 || availEscs.length > 0) && (
          <div style={{
            display: "flex", alignItems: "center", gap: md.isMobile ? 4 : 6,
            padding: "4px 12px 6px",
            overflowX: md.isMobile ? "visible" : "auto",
            flexWrap: md.isMobile ? "wrap" : "nowrap",
            rowGap: md.isMobile ? 4 : undefined,
            scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
            borderTop: "1px solid var(--border-light)",
          }}>
            {availRegions.length > 1 && (<>
              <button className={"tourn-tab tourn-tab-sm shrink-0" + (regionFilter === null ? " active" : "")}
                onClick={() => setRegionFilter(null)}>
                {md.isMobile ? `Todas ${countEvents(seriesT)}` : `Todas (${countEvents(seriesT)})`}
              </button>
              {availRegions.map(reg => {
                const rt = seriesT.filter(t => t.region === reg.id);
                const nT = countEvents(rt);
                const nJ = uniquePC(rt);
                return (
                  <button key={reg.id}
                    className={"tourn-tab tourn-tab-sm" + (regionFilter === reg.id ? " active" : " tourn-tab-muted")}
                    onClick={() => setRegionFilter(reg.id)}
                    style={{ flexShrink: 0 }}>
                    {md.isMobile
                      ? `${reg.label} ${nT}·${nJ}`
                      : `${reg.emoji} ${reg.label} (${nT}T · ${nJ} jog)`}
                  </button>
                );
              })}
              <ToolbarSep />
            </>)}
            <button className={"tourn-tab tourn-tab-sm shrink-0" + (escFilter.length === 0 ? " active" : " tourn-tab-muted")}
              onClick={() => setEscFilter([])}>
              {md.isMobile ? `Todos ${uniquePCRegion}` : `Todos (${uniquePCRegion} jog)`}
            </button>
            <FilterPills
              items={(["Sub 10","Sub 12","Sub 14","Sub 16","Sub 18","Absoluto","Sénior"] as const).map(e => ({
                key: e,
                label: e,
                disabled: !availEscs.includes(e),
              }))}
              active={escFilter}
              onToggle={(e) => setEscFilter(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])}
              style={md.isMobile ? { display: "contents" } : undefined}
            />
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
              // Série sem jogadores no escalão escolhido: mostrar ESBATIDA em
              // vez de esconder — esconder fazia parecer que a série tinha
              // sido removida ao trocar de escalão (ex: AQUAPOR sem Sub 14).
              const empty = !c || c.players === 0;
              const active = sub12Series === s.key;
              return (
                <button key={s.key}
                  className={`course-item ${active ? "active" : ""}`}
                  style={empty ? { opacity: 0.45 } : undefined}
                  onClick={() => { setSub12Series(s.key); setSub12View("grid"); setSub12Player(null); md.onSelect(); }}>
                  <div className="course-item-name">{s.emoji} {s.label}</div>
                  <div className="course-item-sub">
                    {empty ? `sem jogadores${sub12Esc === "all" ? "" : ` ${sub12Esc}`}` : `${c.tourns} torneios · ${c.players} jog · ${s.holes}`}
                  </div>
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
                  onClick={() => { setSub12View(v); md.onSelect(); }}>
                  <div className="course-item-name">{labels[v]}</div>
                </button>
              );
            })}

            {/* Filtros compactos */}
            <div className="sidebar-section-title mt-8">Filtros</div>
            <div className="flex-col gap-4" style={{ padding: "4px 8px", display: "flex" }}>
              <select className="select w-full fs-11" value={sub12Esc}
                onChange={e => { setSub12Esc(e.target.value); setSub12Player(null); }}>
                <option value="all">Todos os escalões</option>
                {ESCALOES.map(esc => <option key={esc} value={esc}>{esc}</option>)}
              </select>
              {sub12AvailRegions.length > 0 && (
                <select className="select w-full fs-11" value={sub12Region} onChange={e => setSub12Region(e.target.value)}>
                  <option value="all">Todas as zonas</option>
                  {sub12AvailRegions.map(z => <option key={z} value={z}>{regionLabel(z)}</option>)}
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
              {sub12EscLabel} · scoring.datagolf.pt
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
                <div className="h-md">
                  {sub12View === "grid" ? "📊" : sub12View === "ranking" ? "🏆" : "📈"}{" "}
                  {sub12View === "grid" ? "Tabela" : sub12View === "ranking" ? "Ranking" : "Evolução SD"}{" "}
                  — {sub12EscLabel} {SUB12_SERIES_TABS.find(s => s.key === sub12Series)?.label} {activeYear ?? ""}
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
        <CircuitShell entries={driveEntries} pastEditionsPool={driveEditionsPool} config={{ ...DRIVE_CONFIG, color: "var(--color-good-dark)", textColor: "#fff", filters: { search: true } }} loading={loading}
          selectedId={selectedDriveId ?? undefined}
          onSelectEntry={(e) => setSelectedDriveId(e.id)} />
      )}

      {false && navMode === "torneios" && (
        <div className="master-detail">

          {/* Sidebar */}
          <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
            <button
              className={`course-item ${selectedGroupKey === null ? "active" : ""}`}
              onClick={() => { setSelectedGroupKey(null); setRoundIdx(0); md.onSelect(); }}>
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

          {/* Conteúdo principal — mesmo slot/estilo que a CircuitShell (.course-detail:
              padding var(--space-inner) + background var(--bg-detail)). */}
          <div className="course-detail" ref={md.detailRef}>

            {/* RESUMO */}
            {selectedGroupKey === null && (
              <div>
                <div className="card overflow-hidden">
                  <div className="h-md">
                    📋 {series === "tour" ? "Drive Tour" : series === "challenge" ? "Drive Challenge" : series === "aquapor" ? "AQUAPOR" : "DRIVE"}
                    {regionFilter ? " " + (regionOf(regionFilter)?.label || "") : ""}
                    {escFilter.length > 0 ? " — " + escFilter.join(", ") : ""} — Temporada {activeYear ?? "Todos"}
                  </div>
                  <div className="muted fs-11 mb-8">
                    {filteredGroups.length} torneios · {uniquePCFiltered} jogadores ·{" "}
                    {filteredGroups.reduce((a, g) => a + g.entries.filter(e => !e._roundLabel || e._roundLabel === "Resumo").reduce((s, t) => s + t.players.filter(p => !isDNS(p)).length, 0), 0)} presenças
                  </div>
                  {regionFilter && (() => {
                    if (!regionFilter) return null;
                    // Tour: ranking por região. Challenge: precisa de escalão único seleccionado.
                    const escForLink = series === "challenge" ? (escFilter.length === 1 ? escFilter[0] : null) : null;
                    if (series === "challenge" && !escForLink) return null;
                    const rankUrl = fpgRankingUrl(series, regionFilter!, escForLink, activeYear);
                    return rankUrl ? (
                      <div className="mb-8">
                        <a href={rankUrl ?? undefined} target="_blank" rel="noopener noreferrer"
                          className="p p-sm" style={{ textDecoration: "none", background: "var(--bg-muted)", color: "var(--accent)", border: "1px solid var(--border)" }}
                          title="Abrir o ranking oficial da FPG (scoring.fpg.pt) em nova aba">
                          🔗 Ranking oficial FPG — {series === "tour" ? "Drive Tour" : "Drive Challenge"} {regionOf(regionFilter)?.label}{escForLink ? " " + escForLink : ""}
                        </a>
                      </div>
                    ) : null;
                  })()}
                  <ResumoTable tournaments={filteredT as any /* tipo local diferente do playerUtils */} playersDB={pdb} sdLookup={sdLookup} escLookup={escLookup} mergeByEvent={series === "challenge"} />
                </div>

                {/* Tabela de pontos */}
                <div className="card mt-8">
                  <DrivePointsTable />
                </div>
              </div>
            )}

            {/* DETALHE DE TORNEIO */}
            {selectedGroupKey !== null && selectedGroup && curTournament && (() => {
              // Extrair admissions/draws do torneio actual (atachados pelo useEffect)
              if (!selectedGroup) return null;
              if (!curTournament) return null;
              const sg = selectedGroup!;
              const ct = curTournament!;
              const firstT = sg.entries[0] as any;
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
              <div>
                {ct && (() => {
                  const nholes = ct.players[0]?.nholes || 18;
                  const nJog = ct.players.filter(p => !isDNS(p) && !p._incomplete).length;
                  const parTotal = ct.players[0]?.parTotal
                    || (ct.players[0]?.par?.reduce((a, b) => a + b, 0))
                    || (ct.players[0]?.roundScores?.[0]?.pars?.reduce((a, b) => a + b, 0))
                    || 0;
                  // Holes-in-one do torneio inteiro (agrega todas as rondas/escalões do grupo,
                  // dedup por jogador+buraco para não duplicar entre rondas e o Resumo).
                  const aces = (() => {
                    const seen = new Set<string>();
                    const out: { name: string; hole: number; par: number; round?: number }[] = [];
                    for (const entry of sg.entries) {
                      for (const a of tournamentAces(entry.players)) {
                        const k = (a.name || "").toLowerCase().trim() + "|" + a.hole;
                        if (seen.has(k)) continue;
                        seen.add(k); out.push(a);
                      }
                    }
                    return out;
                  })();
                  const canonicalUrl = tournamentUrl("drive", ct.ccode, ct.tcode);
                  const titleText = sg.label || ct.campo || ct.name || "Torneio";
                  return (
                  <DetailHeader
                    title={canonicalUrl ? (
                      <a href={canonicalUrl} target="_blank" rel="noopener noreferrer"
                        title="Link canónico do torneio (abrir em nova aba para partilhar)"
                        style={{ color: "inherit", textDecoration: "none" }}>
                        {titleText}
                      </a>
                    ) : titleText}
                    actions={<>
                      <TournExtLinks ccode={ct.ccode} tcode={ct.tcode} />
                    </>}
                    sub={<>
                      {ct.campo && <span className="muted">📍 {ct.campo}</span>}
                      <span className="muted ml-8">📅 {fmtDateShort(ct.date)}</span>
                      <span className="gap-4 ml-8" style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap" }}>
                        <span className="p p-sm" style={{ background: "var(--bg-muted)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                          {nJog} jog
                        </span>
                        {(sg.isMulti || ct._roundLabel === "Resumo") && <RoundPill nR={ct._totalRounds || sg.totalRounds} />}
                        {nholes <= 9 && <NineHPill />}
                        {parTotal > 0 && (
                          <span className="p p-sm" style={{ background: "var(--bg-muted)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                            Par {parTotal}
                          </span>
                        )}
                        {aces.length > 0 && (
                          <span className="p p-sm"
                            style={{ background: "var(--score-eagle, #f59e0b)", color: "#fff", border: "1px solid var(--score-eagle, #f59e0b)" }}
                            title={aces.map(a => `${a.name || "?"} — buraco ${a.hole} (par ${a.par})${a.round ? ` · R${a.round}` : ""}`).join("\n")}>
                            🕳️ {aces.length} hole-in-one
                          </span>
                        )}
                        {!sg.isEvent && ct.escalao && <EscPill esc={ct.escalao!} />}
                        {sg.isEvent && <span className="muted">{sg.entries.length} escalões</span>}
                      </span>
                    </>}
                  />
                  );
                })()}

                {/* Tabs: Inscrições / Draws + rondas (isMulti) ou escalões (isEvent) */}
                {(sg.isMulti || sg.isEvent || hasExtraTabs) && (
                  <div className="tab-bar" style={{ marginBottom: 8 }}>
                    {hasAdmissions && (
                      <button
                        className={"tab-under" + (specialTab === "admissions" ? " active" : "")}
                        onClick={() => setSpecialTab("admissions")}>
                        📝 Inscrições
                        <span className="muted fs-10" style={{ marginLeft: 4 }}>({adm.players.length})</span>
                      </button>
                    )}
                    {(() => {
                      // Draw R{n} INTERCALADO antes de cada ronda R{n} (= FPG/RFEG/Major),
                      // em vez de todos os draws agrupados no início. O DrawTab rico já era
                      // usado; muda só a ORDEM das abas para ficar igual às outras páginas.
                      const drawnInline = new Set<number>();
                      const out: React.ReactNode[] = [];
                      sg.entries.forEach((entry, ri) => {
                        const lbl = sg.isEvent
                          ? (entry.escalao || ("E" + (ri + 1)))
                          : (entry._roundLabel || ("R" + (ri + 1)));
                        const isResumo = lbl === "Resumo";
                        const rnMatch = /^R(\d+)$/i.exec(entry._roundLabel || "");
                        const rn = rnMatch ? parseInt(rnMatch[1], 10) : null;
                        if (!sg.isEvent && rn != null && drawRounds.includes(rn)) {
                          drawnInline.add(rn);
                          out.push(
                            <button key={`draw:${rn}`}
                              className={"tab-under" + (specialTab === `draw:${rn}` ? " active" : "")}
                              onClick={() => setSpecialTab(`draw:${rn}`)}>
                              🎯 Draw R{rn}
                            </button>
                          );
                        }
                        const activeCount = entry.players.filter(p => !isDNS(p)).length;
                        const isActive = specialTab === null && roundIdx === ri;
                        const nAces = tournamentAces(entry.players).length;
                        out.push(
                          <button key={entry.tcode + "_" + ri}
                            className={"tab-under" + (isActive ? " active" : "")}
                            onClick={() => { setSpecialTab(null); setRoundIdx(ri); }}>
                            {isResumo ? "📊" : sg.isEvent ? "⚡" : "🏌️"} {lbl}
                            <span className="muted fs-10" style={{ marginLeft: 4 }}>({activeCount} jog)</span>
                            {nAces > 0 && <span title={`${nAces} hole-in-one`}> 🕳️</span>}
                          </button>
                        );
                      });
                      // Draws sem ronda de resultado correspondente (ex: futura, ou eventos
                      // por escalão) → à frente das rondas, para não desaparecerem.
                      const leftover = drawRounds.filter(r => !drawnInline.has(r));
                      if (leftover.length) {
                        out.unshift(...leftover.map(r => (
                          <button key={`draw:${r}`}
                            className={"tab-under" + (specialTab === `draw:${r}` ? " active" : "")}
                            onClick={() => setSpecialTab(`draw:${r}`)}>
                            🎯 Draw R{r}
                          </button>
                        )));
                      }
                      return out;
                    })()}
                    {/* Tab Scorecards combinados — só para multi-ronda */}
                    {sg.isMulti && sg.entries.some(e => e._roundLabel === "Resumo") && (
                      <button
                        className={"tab-under" + (specialTab === null && roundIdx === sg.entries.length ? " active" : "")}
                        onClick={() => { setSpecialTab(null); setRoundIdx(sg.entries.length); }}>
                        📋 Scorecards
                      </button>
                    )}
                  </div>
                )}
                {ct && (
                  <div className="overflow-hidden">
                    {specialTab === "admissions" && adm
                      ? <AdmissionsTab
                          admissions={adm}
                          playersDB={pdb}
                          date={ct.date}
                          fpgUrl={ct.ccode && ct.tcode ? fpgAdmissionsUrl(ct.ccode!, ct.tcode!) : undefined}
                          tournamentEscalao={ct.escalao || undefined}
                          tournamentSex={/\bF\b|\bS\b|Feminino/i.test(ct.name || "") ? "F" : /\bM\b|\bH\b|Masculino/i.test(ct.name || "") ? "M" : undefined}
                        />
                      : specialTab?.startsWith("draw:")
                        ? (() => {
                            const dRound = parseInt(specialTab!.slice(5), 10);
                            // Resultados dessa ronda: entrada já-por-ronda do grupo
                            // (R{n}); cada jogador tem grossTotal/toPar da ronda.
                            const rEntry = sg.entries.find(e => (e._roundLabel || "").toUpperCase() === "R" + dRound)
                              || sg.entries[dRound - 1]
                              || sg.entries[0];
                            return <DrawTab
                              draw={draws[specialTab!.slice(5)] || { groups: [] }}
                              roundNum={dRound}
                              playersDB={pdb}
                              tournamentEscalao={ct.escalao || undefined}
                              tournamentSex={/\bF\b|\bS\b|Feminino/i.test(ct.name || "") ? "F" : /\bM\b|\bH\b|Masculino/i.test(ct.name || "") ? "M" : undefined}
                              tournamentDate={ct.date}
                              admissions={adm}
                              results={buildDrawResults(rEntry?.players, dRound, { perRoundEntry: true })}
                            />;
                          })()
                        : roundIdx === sg.entries.length
                          ? (() => {
                              const totalT = sg.entries.find(e => e._roundLabel === "Resumo");
                              return totalT
                                ? <DriveAllRoundsScorecardLB totalTournament={totalT!} playersDB={pdb} sdLookup={sdLookup} />
                                : <EmptyState size="sm" message="Dados insuficientes" />;
                            })()
                          : ct._roundLabel === "Resumo"
                            ? <DriveAccumulatedLB tournament={ct} nRounds={ct._totalRounds || sg.totalRounds || 2} escLookup={escLookup} playersDB={pdb} sdLookup={sdLookup} temporalEscLookup={temporalEscLookup} fedBirthdates={fedBirthdates} />
                            : <ScorecardLB tournament={ct} playersDB={pdb} escLookup={escLookup} sdLookup={sdLookup} temporalEscLookup={temporalEscLookup} fedBirthdates={fedBirthdates} />}
                  </div>
                )}
              </div>
              );
            })()}

          </div>
        </div>
      )}

    </div>
    </DataSourcesProvider>
  );
}

export default function DrivePage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <DriveContent />;
}
