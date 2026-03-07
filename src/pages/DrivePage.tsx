/**
 * DrivePage.tsx — DRIVE Tour & Challenge + AQUAPOR Results 2026
 * v10: Reads scraper v7 format directly (fedCode, roundScores)
 *      + multi-round support (R1/R2/Total tabs)
 */
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { scClass, SC, sdClassByHcp } from "../utils/scoreDisplay";
import { isCalUnlocked } from "../utils/authConstants";
import PasswordGate from "../ui/PasswordGate";
import LoadingState from "../ui/LoadingState";
import { resolveFedsInTournaments } from "../utils/playerUtils";

/* ── Types ── */
interface RoundScore {
  round: number; gross: number;
  scores: number[]; pars: number[]; si: number[]; meters: number[];
  courseRating: number; slope: number; teeName: string; teeColorId?: number;
}
interface Player {
  scoreId: string; pos: number | string | null; name: string; club: string;
  grossTotal: number | string | null; toPar: number | string | null;
  fed?: string; fedCode?: string; hcpExact?: number; hcpPlay?: number;
  course?: string; courseRating?: number; slope?: number; teeName?: string;
  nholes?: number; parTotal?: number;
  scores?: number[]; par?: number[]; si?: number[]; meters?: number[];
  roundScores?: RoundScore[];
  _incomplete?: boolean;   // didn't play all rounds in a multi-round event
  _roundsPlayed?: number;  // how many rounds this player actually completed
}
interface Tournament {
  name: string; ccode: string; tcode: string; date: string; campo: string; clube: string;
  series: "tour" | "challenge" | "aquapor"; region: string; escalao: string | null; num: number;
  playerCount: number; players: Player[]; rounds?: number;
  /** Multi-round grouping metadata (added by expandMultiRound) */
  _multiGroup?: string;       // parent tcode (shared by R1/R2/Total)
  _roundLabel?: string;       // "R1", "R2", "Total"
  _totalRounds?: number;      // e.g. 2
  _isIncomplete?: boolean;    // true for players missing rounds (on Player level via _incomplete)
}
interface DriveData {
  lastUpdated: string; source: string; totalTournaments: number; totalPlayers: number;
  totalScorecards: number; tournaments: Tournament[];
}
interface PlayersDB { [fed: string]: { escalao?: string; name?: string; club?: { short?: string } } }
type SDLookup = Record<string, number>;

/* ── Normalizer: scraper format → internal format ── */
function normalizePlayer(p: any): Player {
  const r1: RoundScore | undefined = p.roundScores?.[0];
  return {
    ...p,
    fed: p.fed || p.fedCode || undefined,
    scores: p.scores || r1?.scores,
    par: p.par || r1?.pars,
    si: p.si || r1?.si,
    meters: p.meters || r1?.meters,
    courseRating: p.courseRating ?? r1?.courseRating,
    slope: p.slope ?? r1?.slope,
    teeName: p.teeName || r1?.teeName,
  };
}

function normalizeTournament(t: any): Tournament {
  return { ...t, players: (t.players || []).map(normalizePlayer) };
}

/** Expand multi-round tournaments: 1 original → R1 + R2 + Total */
function expandMultiRound(tournaments: Tournament[]): Tournament[] {
  const out: Tournament[] = [];
  for (const t of tournaments) {
    const nRounds = t.rounds || 1;
    if (nRounds <= 1 || !t.players.some(p => p.roundScores && p.roundScores.length > 1)) {
      out.push(t);
      continue;
    }
    const groupId = t.tcode;  // shared identifier for all entries in this group

    // Generate a per-round entry for each round
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
          scores: rs.scores,
          par: rs.pars,
          si: rs.si,
          meters: rs.meters,
          courseRating: rs.courseRating,
          slope: rs.slope,
          teeName: rs.teeName,
          roundScores: [rs],
        }));
      }
      // Sort by gross for position
      rdPlayers.sort((a, b) => ((a.grossTotal as number) || 999) - ((b.grossTotal as number) || 999));
      let pos = 1;
      rdPlayers.forEach((p, i) => {
        if (i > 0 && (p.grossTotal as number) !== (rdPlayers[i - 1].grossTotal as number)) pos = i + 1;
        p.pos = pos;
      });
      out.push({
        ...t,
        name: t.name + " (R" + rd + ")",
        tcode: t.tcode + "_R" + rd,
        playerCount: rdPlayers.length,
        players: rdPlayers,
        rounds: 1,
        _multiGroup: groupId,
        _roundLabel: "R" + rd,
        _totalRounds: nRounds,
      });
    }

    // Also keep the original combined entry — but fix player ranking
    const totalPlayers = t.players.map(p => {
      const playedRounds = p.roundScores?.filter(r => r.scores && r.scores.length > 0).length || 0;
      const incomplete = playedRounds < nRounds;
      // Calculate combined parTotal across played rounds
      let combinedPar = 0;
      for (const rs of (p.roundScores || [])) {
        if (rs.pars && rs.pars.length > 0) {
          combinedPar += rs.pars.reduce((a, b) => a + b, 0);
        }
      }
      if (combinedPar === 0) combinedPar = (p.parTotal || 72) * playedRounds;
      return {
        ...p,
        _incomplete: incomplete,
        _roundsPlayed: playedRounds,
        parTotal: combinedPar,
        nholes: (p.nholes || 18) * playedRounds,
        // Keep toPar from original data (already correct for complete players)
        toPar: p.toPar,
      };
    });

    // Sort: complete players by grossTotal, then incomplete at bottom
    totalPlayers.sort((a, b) => {
      // Incomplete players go to the bottom
      if (a._incomplete && !b._incomplete) return 1;
      if (!a._incomplete && b._incomplete) return -1;
      // Among same group, sort by grossTotal
      const ag = typeof a.grossTotal === "string" ? parseInt(a.grossTotal) : (a.grossTotal as number ?? 999);
      const bg = typeof b.grossTotal === "string" ? parseInt(b.grossTotal) : (b.grossTotal as number ?? 999);
      return ag - bg;
    });
    // Assign positions (only complete players get real positions)
    let pos = 1;
    totalPlayers.forEach((p, i) => {
      if (p._incomplete || isDNS(p)) {
        p.pos = p._incomplete ? "INC" : (p.pos || "NS");
      } else {
        if (i > 0) {
          const prev = totalPlayers[i - 1];
          if (!prev._incomplete && !isDNS(prev)) {
            const ag = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number ?? 999);
            const bg = typeof prev.grossTotal === "string" ? parseInt(prev.grossTotal) : (prev.grossTotal as number ?? 999);
            if (ag !== bg) pos = i + 1;
          }
        }
        p.pos = pos;
      }
    });

    out.push({
      ...t,
      name: t.name + " (Total)",
      tcode: t.tcode + "_Total",
      players: totalPlayers,
      _multiGroup: groupId,
      _roundLabel: "Total",
      _totalRounds: nRounds,
    });
  }
  return out;
}
interface TStats {
  pos: number | string | null; gross: number; toPar: number;
  sd18: number | null; sdSource: "fpg" | "ags" | "raw" | null;
  nholes: number; birdies: number; pars: number; bogeys: number;
}
type SortKey = string;

/* ── Constants ── */
const REGIONS = [
  { id: "norte", label: "Norte", emoji: "🔵", color: "#2563eb", bg: "#dbeafe" },
  { id: "tejo", label: "Tejo", emoji: "🟡", color: "#a16207", bg: "#fef3c7" },
  { id: "sul", label: "Sul", emoji: "🟢", color: "#16a34a", bg: "#dcfce7" },
  { id: "madeira", label: "Madeira", emoji: "🟣", color: "#7c3aed", bg: "#ede9fe" },
  { id: "acores", label: "Açores", emoji: "🔴", color: "#dc2626", bg: "#fee2e2" },
];
const ESCALOES = ["Sub 10", "Sub 12", "Sub 14", "Sub 16", "Sub 18"];
const regionOf = (id: string) => REGIONS.find((r) => r.id === id);
const isManuel = (p: { name: string; fed?: string }) =>
  p.fed === "52884" || (p.name.includes("Manuel") && (p.name.includes("Medeiros") || p.name.includes("Goulartt")));

/* ── WHS Expected 9h SD table ── */
const EXP9: Record<number, number> = {
  0:1.2,1:1.7,2:2.2,3:2.8,4:3.3,5:3.8,6:4.3,7:4.8,8:5.4,9:5.9,
  10:6.4,11:6.9,12:7.4,13:8.0,14:8.5,15:9.0,16:9.5,17:10.0,18:10.6,
  19:11.1,20:11.6,21:12.2,22:12.7,23:13.2,24:13.7,25:14.2,26:14.8,
  27:15.3,28:15.8,29:16.3,30:16.8,31:17.4,32:17.9,33:18.4,34:18.9,
  35:19.4,36:20.0,37:20.5,38:21.0,39:21.5,40:22.0,41:22.6,42:23.1,
  43:23.6,44:24.1,45:24.6,46:25.2,47:25.7,48:26.2,49:26.7,50:27.2,
  51:27.8,52:28.3,53:28.8,54:29.3,
};
function expectedSD9(hi: number): number {
  const c = Math.min(54, Math.max(0, hi));
  const lo = Math.floor(c);
  const loV = EXP9[lo] ?? (lo * 0.52 + 1.2);
  const hiV = EXP9[Math.min(lo + 1, 54)] ?? ((lo + 1) * 0.52 + 1.2);
  return loV + (c - lo) * (hiV - loV);
}

/* ── AGS: Adjusted Gross Score (Net Double Bogey cap per hole) ── */
function calcAGS(
  scores: number[], parArr: number[], si: number[],
  cr: number, slope: number, hcp: number, nholes: number
): number {
  if (!scores.length || !parArr.length || !si.length || scores.length < nholes) {
    return scores.reduce((a, b) => a + b, 0);
  }
  const parT = parArr.reduce((a, b) => a + b, 0);
  const ch = Math.round(hcp * (slope / 113) + (cr - parT));
  const siOrder = Array.from({ length: nholes }, (_, i) => i).sort((a, b) => si[a] - si[b]);
  const strokes = new Array(nholes).fill(0);
  let rem = Math.max(0, ch);
  while (rem > 0) {
    for (const idx of siOrder) {
      if (rem <= 0) break;
      strokes[idx]++;
      rem--;
    }
  }
  let adj = 0;
  for (let i = 0; i < nholes; i++) {
    const ndb = parArr[i] + 2 + strokes[i];
    adj += Math.min(scores[i], ndb);
  }
  return adj;
}

/* ── Helpers ── */
const fmtTP = (v: number | null): string => {
  if (v == null) return "–";
  return v === 0 ? "E" : v > 0 ? "+" + v : "" + v;
};
const tpColor = (v: number | null | undefined): string | undefined => {
  if (v == null) return undefined;
  if (v < 0) return SC.danger;
  if (v === 0) return SC.good;
  return undefined;
};
const fmtDate = (d: string) => {
  if (!d) return "";
  const [, m, day] = d.split("-");
  return day + "/" + m;
};
const fmtSub = (v: number) => (v === 0 ? "(E)" : v > 0 ? "(+" + v + ")" : "(" + v + ")");

function isDNS(p: Player): boolean {
  const g = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
  if (g != null && g >= 900) return true;
  if (String(p.pos) === "NS" && p.scores?.every((s) => s === 0)) return true;
  return false;
}

function computeStats(p: Player, sdLookup: SDLookup): TStats | null {
  if (isDNS(p)) return null;
  const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
  if (gross == null || isNaN(gross as number)) return null;
  const g = gross as number;
  const parArr = p.par || [];
  const scores = p.scores || [];
  const si = p.si || [];
  const parT = p.parTotal || parArr.reduce((a, b) => a + b, 0);
  const tp = g - parT;
  const nh = p.nholes || scores.length || 18;
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
    else if (p.courseRating && p.slope && p.hcpExact != null && si.length >= nh && scores.length >= nh && parArr.length >= nh) {
      const adjGross = calcAGS(scores, parArr, si, p.courseRating, p.slope, p.hcpExact, nh);
      const rawSD = (113 / p.slope) * (adjGross - p.courseRating);
      sd18 = is9 ? rawSD + expectedSD9(p.hcpExact) : rawSD;
      sdSource = "ags";
    }
    // 3) Raw fallback (no SI)
    else if (p.courseRating && p.slope) {
      const rawSD = (113 / p.slope) * (g - p.courseRating);
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
function buildEscLookup(playersDB: PlayersDB, allTournaments: Tournament[]): EscLookup {
  const m = new Map<string, string>();
  // 1) From playersDB
  for (const [fed, info] of Object.entries(playersDB)) {
    if (info.escalao) {
      m.set(fed, info.escalao.startsWith("Sub") ? info.escalao.replace("-", " ") : info.escalao);
    }
  }
  // 2) From Challenge tournaments (fill gaps)
  for (const t of allTournaments) {
    if (t.escalao) {
      for (const p of t.players) {
        const fed = p.fed || p.fedCode;
        if (fed && !m.has(fed)) m.set(fed, t.escalao);
      }
    }
  }
  return m;
}

/** Resolve a player's escalão */
function resolveEsc(p: Player, escLookup: EscLookup): string {
  const fed = p.fed || p.fedCode;
  if (fed && escLookup.has(fed)) return escLookup.get(fed)!;
  return "";
}

/** Get available escalões from a set of tournaments (sorted by ESCALOES order) */
function availEscaloes(tournaments: Tournament[], escLookup: EscLookup): string[] {
  const s = new Set<string>();
  for (const t of tournaments) {
    for (const p of t.players) {
      if (isDNS(p)) continue;
      const e = resolveEsc(p, escLookup);
      if (e) s.add(e);
    }
  }
  // Sort by ESCALOES order, then any extras alphabetically
  const ordered = ESCALOES.filter(e => s.has(e));
  for (const e of s) {
    if (!ordered.includes(e)) ordered.push(e);
  }
  return ordered;
}

/** Filter tournaments keeping only players of a given escalão; recalculate positions */
function filterTournByEsc(tournaments: Tournament[], escs: string[], escLookup: EscLookup): Tournament[] {
  return tournaments.map(t => {
    const filtered = t.players.filter(p => {
      if (isDNS(p)) return false;
      return escs.includes(resolveEsc(p, escLookup));
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
function uniqueEscPC(ts: Tournament[], esc: string, escLookup: EscLookup): number {
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

/* ── Sortable header ── */
function SortTh(props: {
  children: React.ReactNode; sortKey: SortKey; current: SortKey; dir: "asc" | "desc";
  onSort: (k: SortKey) => void; style?: React.CSSProperties; className?: string; colSpan?: number;
}) {
  const active = props.current === props.sortKey;
  return (
    <th colSpan={props.colSpan} className={props.className}
      style={{ ...props.style, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => props.onSort(props.sortKey)}>
      {props.children}{active && <span style={{ marginLeft: 2, fontSize: 8 }}>{props.dir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

/* ── Player name ── */
function PName(props: { name: string; fed?: string; playersDB?: PlayersDB; highlight?: boolean }) {
  const hasProfile = props.fed && props.playersDB && props.playersDB[props.fed];
  const sex = props.fed && props.playersDB ? props.playersDB[props.fed]?.sex : undefined;
  const truncName = props.name.length > 25 ? props.name.substring(0, 23) + "…" : props.name;
  const sty: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
    ...(hasProfile ? { cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 2 } : {}),
  };
  const handleClick = hasProfile ? () => window.open("/jogadores/" + props.fed, "_blank") : undefined;
  return (
    <span style={sty} onClick={handleClick}>
      {truncName}
      {props.highlight && <span style={{ marginLeft: 3, fontSize: 10 }}>⭐</span>}
      {sex === "M" && <span className="jog-sex-inline jog-sex-M" style={{ marginLeft: 4 }}>M</span>}
      {sex === "F" && <span className="jog-sex-inline jog-sex-F" style={{ marginLeft: 4 }}>F</span>}
    </span>
  );
}

/* ── SD cell ── */
function SDCell(props: { sd: number | null; sdSource: string | null; hcp: number | null; nholes: number; style?: React.CSSProperties }) {
  if (props.sd == null) return <td className="r" style={props.style}>–</td>;
  const cls = sdClassByHcp(props.sd, props.hcp);
  const is9 = props.nholes <= 9;
  const tip = props.sdSource === "fpg" ? "" : props.sdSource === "ags" ? "~" : "≈";
  return (
    <td className="r" style={props.style}>
      <span className={"p p-sm p-" + cls}>{props.sd.toFixed(1)}</span>
      {(is9 || tip) && <span style={{ fontSize: 7, color: "var(--text-muted)", marginLeft: 1 }}>{is9 && "*"}{tip}</span>}
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

  const medalColor = (pos: number) => {
    if (pos === 1) return "#f59e0b";
    if (pos === 2) return "#94a3b8";
    if (pos === 3) return "#b45309";
    return undefined;
  };

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <span className="h-md fs-13">🏅 Tabela de Pontos Drive Tour</span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{open ? "▲ fechar" : "▼ ver"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div className="muted fs-11 mb-8">Pontos atribuídos por posição final em cada torneio.</div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[col1, col2].map((col, ci) => (
              <table key={ci} className="dtable tbl-compact" style={{ width: "auto", minWidth: 140 }}>
                <thead>
                  <tr>
                    <th className="r" style={{ fontSize: 11, padding: "4px 8px", width: 40 }}>Pos</th>
                    <th className="r" style={{ fontSize: 11, padding: "4px 8px", width: 60, color: "var(--color-warn-dark)", fontWeight: 800 }}>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {col.map(({ pos, pts }) => (
                    <tr key={pos}>
                      <td className="r fw-700" style={{ padding: "3px 8px", fontSize: 12, color: medalColor(pos) ?? "var(--text)" }}>
                        {pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : pos + "º"}
                      </td>
                      <td className="r fw-800" style={{ padding: "3px 8px", fontSize: 13, color: "var(--color-warn-dark)" }}>{pts}</td>
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
   RESUMO TABLE
   ═══════════════════════════════════════════════════════ */
function ResumoTable(props: { tournaments: Tournament[]; playersDB: PlayersDB; sdLookup: SDLookup; escLookup?: EscLookup; mergeByEvent?: boolean }) {
  const { playersDB, sdLookup } = props;
  const globalEscLookup = props.escLookup;
  const mergeByEvent = !!props.mergeByEvent;
  const sorted = useMemo(() => [...props.tournaments].sort((a, b) => a.date.localeCompare(b.date)), [props.tournaments]);
  const [sortKey, setSortKey] = useState<SortKey>("totalPts");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const handleSort = useCallback((k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }, [sortKey]);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // Chave de coluna — inline, sem useCallback
  const mkKey = (t: Tournament) =>
    mergeByEvent
      ? String(t.num) + "|" + String(t.region) + "|" + String(t.date)
      : (t.ccode + "-" + t.tcode);

  // Torneios visíveis (colunas da tabela)
  const visibleSorted = useMemo(() => {
    if (mergeByEvent) {
      // Uma coluna por evento físico (num+region+date), ignorar duplicados por escalão
      const seen = new Set<string>();
      return sorted.filter(t => {
        if (t._multiGroup && t._roundLabel !== "Total") return false;
        const k = String(t.num) + "|" + String(t.region) + "|" + String(t.date);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    return sorted.filter(t => {
      if (!t._multiGroup) return true;
      if (t._roundLabel === "Total") return true;
      return expandedGroups.has(t._multiGroup);
    });
  }, [sorted, expandedGroups, mergeByEvent]);

  interface PRow {
    pKey: string; name: string; club: string; fed: string; escalao: string; hcp: number | null;
    results: Map<string, TStats | "dns">; jogos: number; bestSD: number | null; avgSD: number | null;
    totalBird: number; totalPars: number; totalBog: number; totalPts: number;
  }

  // Build escalao lookup from Challenge tournament data
  const challEscLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of sorted) {
      if (t.escalao) {
        for (const p of t.players) {
          const fed = p.fed || p.fedCode;
          if (fed && !m.has(fed)) m.set(fed, t.escalao);
        }
      }
    }
    return m;
  }, [sorted]);

  const rows = useMemo(() => {
    const map = new Map<string, PRow>();
    const totalKeys = new Set<string>();
    for (const t of sorted) {
      if (t._roundLabel === "Total") totalKeys.add(mkKey(t));
    }
    for (const t of sorted) {
      const tKey = mkKey(t);
      const isTotal = totalKeys.has(tKey);
      for (const p of t.players) {
        const pKey = p.fed || p.name;
        if (!map.has(pKey)) {
          let esc = t.escalao || "";
          if (!esc && p.fed) {
            if (globalEscLookup?.has(p.fed)) {
              esc = globalEscLookup.get(p.fed)!;
            } else if (playersDB[p.fed]?.escalao) {
              const raw = playersDB[p.fed].escalao!;
              esc = raw.startsWith("Sub") ? raw.replace("-", " ") : raw;
            } else if (challEscLookup.has(p.fed)) {
              esc = challEscLookup.get(p.fed)!;
            }
          }
          map.set(pKey, { pKey, name: p.name, club: p.club, fed: p.fed || "", escalao: esc,
            hcp: p.hcpExact ?? null, results: new Map(), jogos: 0, bestSD: null, avgSD: null,
            totalBird: 0, totalPars: 0, totalBog: 0, totalPts: 0 });
        }
        const row = map.get(pKey)!;
        if (p.hcpExact != null) row.hcp = p.hcpExact;
        if (!row.escalao && t.escalao) row.escalao = t.escalao;
        if (!row.escalao && p.fed && globalEscLookup?.has(p.fed)) row.escalao = globalEscLookup.get(p.fed)!;
        if (!row.escalao && p.fed && challEscLookup.has(p.fed)) row.escalao = challEscLookup.get(p.fed)!;
        if (isDNS(p)) {
          row.results.set(tKey, "dns");
        } else {
          const st = computeStats(p, sdLookup);
          if (st) {
            row.results.set(tKey, st);
            if (!isTotal) {
              row.totalBird += st.birdies;
              row.totalPars += st.pars;
              row.totalBog += st.bogeys;
            }
            // Assign points: only for single-round events OR the "Total" of a multi-round event
            // (not for individual R1/R2 entries)
            const isRoundEntry = t._roundLabel && t._roundLabel !== "Total";
            if (!isRoundEntry) {
              row.totalPts += drivePoints(p.pos);
            }
          }
        }
        row.jogos = [...row.results.entries()]
          .filter(([k, v]) => v !== "dns" && !totalKeys.has(k))
          .length;
      }
    }
    for (const row of map.values()) {
      const sds: number[] = [];
      for (const [tKey, r] of row.results.entries()) {
        if (!totalKeys.has(tKey) && r !== "dns" && r.sd18 != null) sds.push(r.sd18);
      }
      row.bestSD = sds.length ? Math.min(...sds) : null;
      row.avgSD = sds.length ? sds.reduce((s, v) => s + v, 0) / sds.length : null;
    }
    return [...map.values()];
  }, [sorted, playersDB, sdLookup, challEscLookup, globalEscLookup]);

  const sortedRows = useMemo(() => {
    const mult = sortDir === "asc" ? 1 : -1;
    const INF = 9999;
    return [...rows].sort((a, b) => {
      if (sortKey === "name") return mult * a.name.localeCompare(b.name);
      if (sortKey === "fed") return mult * a.fed.localeCompare(b.fed);
      if (sortKey === "escalao") return mult * a.escalao.localeCompare(b.escalao);
      if (sortKey === "club") return mult * a.club.localeCompare(b.club);
      if (sortKey === "hcp") return mult * ((a.hcp ?? INF) - (b.hcp ?? INF));
      if (sortKey === "jogos") return mult * (a.jogos - b.jogos);
      if (sortKey === "totalPts") return mult * (a.totalPts - b.totalPts);
      if (sortKey === "bestSD") return mult * ((a.bestSD ?? INF) - (b.bestSD ?? INF));
      if (sortKey === "avgSD") return mult * ((a.avgSD ?? INF) - (b.avgSD ?? INF));
      if (sortKey === "totalBird") return mult * (a.totalBird - b.totalBird);
      if (sortKey === "totalPars") return mult * (a.totalPars - b.totalPars);
      if (sortKey === "totalBog") return mult * (a.totalBog - b.totalBog);
      const parts = sortKey.split("_");
      const field = parts[0];
      const tKey = parts.slice(1).join("_");
      const ra = a.results.get(tKey);
      const rb = b.results.get(tKey);
      const sa = ra && ra !== "dns" ? ra : null;
      const sb = rb && rb !== "dns" ? rb : null;
      let va: number, vb: number;
      if (field === "pos") { va = sa ? Number(sa.pos) || INF : INF; vb = sb ? Number(sb.pos) || INF : INF; }
      else if (field === "gross") { va = sa?.gross ?? INF; vb = sb?.gross ?? INF; }
      else if (field === "toPar") { va = sa?.toPar ?? INF; vb = sb?.toPar ?? INF; }
      else if (field === "sd") { va = sa?.sd18 ?? INF; vb = sb?.sd18 ?? INF; }
      else if (field === "bird") { va = sa?.birdies ?? -1; vb = sb?.birdies ?? -1; }
      else if (field === "par") { va = sa?.pars ?? -1; vb = sb?.pars ?? -1; }
      else if (field === "bog") { va = sa?.bogeys ?? INF; vb = sb?.bogeys ?? INF; }
      else { va = 0; vb = 0; }
      return mult * (va - vb);
    });
  }, [rows, sortKey, sortDir]);

  if (!sorted.length) return <div className="muted ta-center p-24">Sem torneios.</div>;

  const hs: React.CSSProperties = { fontSize: 11, padding: "6px 5px" };
  const cs: React.CSSProperties = { fontSize: 12, padding: "5px 5px", whiteSpace: "nowrap" };
  const bG = "3px solid var(--border)";
  const bS = "1px solid var(--border-light, #e5e7eb)";

  // Sticky column styles
  const stickyBg = "var(--bg-card, #fff)";
  const stickyCol0: React.CSSProperties = { position: "sticky", left: 0, zIndex: 3, minWidth: 26, background: stickyBg };
  const stickyCol1: React.CSSProperties = { position: "sticky", left: 26, zIndex: 3, minWidth: 155, background: stickyBg, boxShadow: "2px 0 4px rgba(0,0,0,0.06)" };
  const stickyHeadCol0: React.CSSProperties = { ...stickyCol0, zIndex: 5 };
  const stickyHeadCol1: React.CSSProperties = { ...stickyCol1, zIndex: 5 };

  // Build group header info for first header row
  interface GroupHeader { key: string; label: string; colSpan: number; isMulti: boolean; groupId?: string; tournament: Tournament; isExpanded: boolean }
  const groupHeaders = useMemo(() => {
    const headers: GroupHeader[] = [];
    const seenGroups = new Set<string>();
    for (const t of visibleSorted) {
      if (t._multiGroup) {
        if (seenGroups.has(t._multiGroup)) continue;
        seenGroups.add(t._multiGroup);
        const entries = visibleSorted.filter(vt => vt._multiGroup === t._multiGroup);
        const isExpanded = expandedGroups.has(t._multiGroup);
        headers.push({
          key: t._multiGroup,
          label: "T" + t.num + " · " + shortCampo(t.campo),
          colSpan: entries.length * 7,
          isMulti: true,
          groupId: t._multiGroup,
          tournament: t,
          isExpanded,
        });
      } else {
        headers.push({
          key: t.tcode,
          label: "T" + t.num + " · " + shortCampo(t.campo),
          colSpan: 7,
          isMulti: false,
          tournament: t,
          isExpanded: false,
        });
      }
    }
    return headers;
  }, [visibleSorted, expandedGroups]);

  return (
    <div className="bjgt-chart-scroll">
      <table className="dtable tbl-compact">
        <thead>
          {/* Row 1: Group-level headers */}
          <tr>
            <th colSpan={6} style={{ ...hs, borderBottom: "none" }}></th>
            {groupHeaders.map((gh) => {
              const t = gh.tournament;
              const nh = t.players.find((p) => !isDNS(p))?.nholes || 18;
              const realCount = t.players.filter((p) => !isDNS(p) && !p._incomplete).length;
              // For multi-round, get par from original (non-Total) entry
              const parSrc = gh.isMulti
                ? visibleSorted.find(vt => vt._multiGroup === gh.groupId && vt._roundLabel !== "Total")
                : t;
              const par = (parSrc || t).players.find((p) => !isDNS(p))?.parTotal || "?";
              return (
                <th key={gh.key} colSpan={gh.colSpan} style={{ ...hs, textAlign: "center", borderLeft: bG, background: "var(--bg-hover)", lineHeight: 1.3 }}>
                  <div className="fw-800" style={{ fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <span>{gh.label}</span>
                    {gh.isMulti && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleGroup(gh.groupId!); }}
                        style={{
                          fontSize: 11, fontWeight: 800, width: 20, height: 18,
                          border: "1px solid var(--border)", borderRadius: 4,
                          background: gh.isExpanded ? "#dcfce7" : "var(--bg-card, #fff)",
                          color: gh.isExpanded ? "#16a34a" : "var(--text-muted)",
                          cursor: "pointer", lineHeight: 1, padding: 0,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}
                        title={gh.isExpanded ? "Colapsar rondas" : "Expandir R1/R2"}
                      >
                        {gh.isExpanded ? "−" : "+"}
                      </button>
                    )}
                  </div>
                  <div className="c-muted-fs10-fw5">
                    {fmtDate(t.date)} · Par {par} · {nh}h · {realCount} jog
                    {gh.isMulti && <> · {t._totalRounds}R</>}
                  </div>
                </th>
              );
            })}
            <th colSpan={7} style={{ ...hs, borderLeft: bG, textAlign: "center", background: "var(--bg-hover)", fontSize: 12, fontWeight: 800 }}>Temporada</th>
            <th style={{ minWidth: 160, borderBottom: "none", background: "transparent" }}></th>
          </tr>
          {/* Row 2: Sub-column headers */}
          <tr>
            <SortTh sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, textAlign: "center", width: 26, ...stickyHeadCol0 }}>#</SortTh>
            <SortTh sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, textAlign: "left", paddingLeft: 6, minWidth: 155, ...stickyHeadCol1 }}>Jogador</SortTh>
            <SortTh sortKey="fed" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 52 }}>Fed</SortTh>
            <SortTh sortKey="escalao" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 52 }}>Esc.</SortTh>
            <SortTh sortKey="club" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, minWidth: 80 }}>Clube</SortTh>
            <SortTh sortKey="hcp" current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 42, borderRight: bG }}>HCP</SortTh>
            {visibleSorted.map((t) => {
              const tKey = mkKey(t);
              const roundLabel = t._roundLabel;
              const isRoundCol = roundLabel && roundLabel !== "Total";
              const isTotalCol = roundLabel === "Total";
              const bg = isTotalCol ? "var(--bg-warn-subtle)" : isRoundCol ? "var(--bg-success-subtle)" : undefined;
              return (
                <React.Fragment key={tKey}>
                  <SortTh sortKey={"pos_" + tKey} current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 28, borderLeft: bG, background: bg }}>
                    {roundLabel ? <span style={{ fontSize: 9, fontWeight: 800, color: isTotalCol ? "var(--color-warn-dark)" : "var(--color-good-dark)" }}>{isTotalCol ? "Σ" : roundLabel}</span> : "#"}
                  </SortTh>
                  <SortTh sortKey={"gross_" + tKey} current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 36, borderLeft: bS, background: bg }}>Gross</SortTh>
                  <SortTh sortKey={"toPar_" + tKey} current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 32, borderLeft: bS, background: bg }}>±Par</SortTh>
                  <SortTh sortKey={"sd_" + tKey} current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 40, borderLeft: bS, background: bg }}>SD</SortTh>
                  <SortTh sortKey={"bird_" + tKey} current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center", background: bg }}>🐦</SortTh>
                  <SortTh sortKey={"par_" + tKey} current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center", background: bg }}>Par</SortTh>
                  <SortTh sortKey={"bog_" + tKey} current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center", background: bg }}>■</SortTh>
                </React.Fragment>
              );
            })}
            <SortTh sortKey="jogos" current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 32, borderLeft: bG }}>Jogos</SortTh>
            <SortTh sortKey="totalPts" current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 44, borderLeft: bS, fontWeight: 800, color: "var(--color-warn-dark)" }}>Pts</SortTh>
            <SortTh sortKey="bestSD" current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 50, borderLeft: bS }}>Best SD</SortTh>
            <SortTh sortKey="avgSD" current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 50, borderLeft: bS }}>Avg SD</SortTh>
            <SortTh sortKey="totalBird" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>🐦</SortTh>
            <SortTh sortKey="totalPars" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>Par</SortTh>
            <SortTh sortKey="totalBog" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>■</SortTh>
            <th style={{ minWidth: 160, background: "transparent", borderBottom: "none" }}></th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, idx) => {
            const bg = isManuel(row) ? "var(--bg-success-subtle)" : undefined;
            // Sticky cells need a fully opaque background — var(--bg-success-subtle) may be semi-transparent
            const cellBg = isManuel(row) ? "#d1fae5" : stickyBg;
            const escCls = row.escalao ? "p p-sm p-" + row.escalao.toLowerCase().replace(/\s+/g, "") : "";
            return (
              <tr key={row.pKey} style={bg ? { background: bg } : undefined}>
                <td className="fw-700 ta-center" style={{ ...cs, color: "var(--text-3)", ...stickyCol0, background: cellBg }}>{idx + 1}</td>
                <td style={{ ...cs, paddingLeft: 6, ...stickyCol1, background: cellBg }}>
                  <PName name={row.name} fed={row.fed || undefined} playersDB={playersDB} highlight={isManuel(row)} />
                </td>
                <td style={{ ...cs, fontSize: 10, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>{row.fed || "–"}</td>
                <td style={cs}>{row.escalao ? <span className={escCls + " fs-9"}>{row.escalao}</span> : <span className="c-muted-fs10">–</span>}</td>
                <td style={{ ...cs, color: "var(--text-3)" }}>{row.club}</td>
                <td className="r" style={{ ...cs, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-3)", borderRight: bG }}>{row.hcp != null ? row.hcp.toFixed(1) : "–"}</td>
                {visibleSorted.map((t) => {
                  const tKey = mkKey(t);
                  const rv = row.results.get(tKey);
                  const isTotalCol = t._roundLabel === "Total";
                  const isRoundCol = t._roundLabel && t._roundLabel !== "Total";
                  const colBg = isTotalCol ? "var(--bg-warn-subtle)" : isRoundCol ? "var(--bg-success-subtle)" : undefined;
                  if (!rv) return <td key={tKey} colSpan={7} style={{ textAlign: "center", borderLeft: bG, ...cs, background: colBg }}></td>;
                  if (rv === "dns") return <td key={tKey} colSpan={7} style={{ textAlign: "center", borderLeft: bG, ...cs, background: colBg }}><span style={{ color: "var(--text-muted)", fontWeight: 600, fontSize: 11 }}>NS</span></td>;
                  return (
                    <React.Fragment key={tKey}>
                      <td className="r fw-700" style={{ borderLeft: bG, ...cs, color: "var(--text-3)", background: colBg }}>{rv.pos}</td>
                      <td className="r fw-800" style={{ ...cs, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", borderLeft: bS, background: colBg }}>{rv.gross}</td>
                      <td className="r fw-700" style={{ ...cs, fontFamily: "'JetBrains Mono', monospace", color: tpColor(rv.toPar), borderLeft: bS, background: colBg }}>{fmtTP(rv.toPar)}</td>
                      <SDCell sd={rv.sd18} sdSource={rv.sdSource} hcp={row.hcp} nholes={rv.nholes} style={{ ...cs, borderLeft: bS, background: colBg }} />
                      <td style={{ ...cs, borderLeft: bS, textAlign: "center", background: colBg }}>{rv.birdies}</td>
                      <td style={{ ...cs, borderLeft: bS, textAlign: "center", background: colBg }}>{rv.pars}</td>
                      <td style={{ ...cs, borderLeft: bS, textAlign: "center", background: colBg }}>{rv.bogeys}</td>
                    </React.Fragment>
                  );
                })}
                <td className="r fw-700" style={{ borderLeft: bG, ...cs, fontSize: 13 }}>{row.jogos}</td>
                <td className="r fw-800" style={{ borderLeft: bS, ...cs, fontSize: 13, color: row.totalPts > 0 ? "var(--color-warn-dark)" : "var(--text-muted)" }}>{row.totalPts > 0 ? row.totalPts : "–"}</td>
                <td className="r" style={{ ...cs, borderLeft: bS }}>{row.bestSD != null ? <span className={"p p-sm p-" + sdClassByHcp(row.bestSD, row.hcp)}>{row.bestSD.toFixed(1)}</span> : "–"}</td>
                <td className="r" style={{ ...cs, borderLeft: bS }}>{row.avgSD != null ? <span className={"p p-sm p-" + sdClassByHcp(row.avgSD, row.hcp)}>{row.avgSD.toFixed(1)}</span> : "–"}</td>
                <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{row.totalBird}</td>
                <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{row.totalPars}</td>
                <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{row.totalBog}</td>
                <td style={{ minWidth: 160 }}></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SCORECARD LEADERBOARD
   ═══════════════════════════════════════════════════════ */
function ScorecardLB(props: { tournament: Tournament; playersDB: PlayersDB }) {
  const { tournament, playersDB } = props;
  const players = tournament.players.filter((p) => !isDNS(p) && p.scores && p.scores.length > 0);
  if (!players.length) return <div className="muted ta-center p-16">Scorecards não disponíveis.</div>;
  const refP = players[0];
  const par = refP.par || [];
  const nh = par.length;
  const is9 = nh <= 9;
  const parF9 = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const parB9 = nh > 9 ? par.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
  const parTotal = par.reduce((a, b) => a + b, 0);
  const si = refP.si || [];

  const sorted = [...players].sort((a, b) => {
    const ag = typeof a.grossTotal === "string" ? parseInt(a.grossTotal) : (a.grossTotal as number ?? 999);
    const bg = typeof b.grossTotal === "string" ? parseInt(b.grossTotal) : (b.grossTotal as number ?? 999);
    return ag - bg;
  });
  let pos = 1;
  sorted.forEach((p, i) => {
    if (i > 0) {
      const prev = typeof sorted[i - 1].grossTotal === "string" ? parseInt(sorted[i - 1].grossTotal as string) : sorted[i - 1].grossTotal;
      const cur = typeof p.grossTotal === "string" ? parseInt(p.grossTotal as string) : p.grossTotal;
      if (cur !== prev) pos = i + 1;
    }
    (p as any)._dp = pos;
  });
  const grosses = sorted.map((p) => typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number)).filter((g) => !isNaN(g));
  const avg = grosses.length ? grosses.reduce((a, b) => a + b, 0) / grosses.length : 0;

  return (
    <div>
      <div className="muted fs-11 mb-8 p-0-4px">
        {sorted.length} jogadores · Par {parTotal} · {nh}h · Média Rt: {avg.toFixed(1)} ({fmtTP(Math.round(avg - parTotal))})
        {refP.course && <> · 📍 {refP.course}</>}
        {refP.courseRating && <> · CR {refP.courseRating}</>}
        {refP.slope && <> · Slope {refP.slope}</>}
      </div>
      <div className="bjgt-chart-scroll">
        <table className="sc-table-modern" data-sc-table="1">
          <thead><tr>
            <th className="hole-header" style={{ textAlign: "center", width: 26, position: "sticky", left: 0, zIndex: 5, background: "var(--bg-card, #fff)" }}>#</th>
            <th className="hole-header" style={{ textAlign: "left", paddingLeft: 6, position: "sticky", left: 26, zIndex: 5, background: "var(--bg-card, #fff)", boxShadow: "2px 0 4px rgba(0,0,0,0.06)", minWidth: 130 }}>Jogador</th>
            <th className="hole-header col-total" style={{ width: 30 }}>Tot</th>
            <th className="hole-header" style={{ width: 30 }}>±</th>
            {Array.from({ length: Math.min(9, nh) }, (_, i) => <th key={i} className="hole-header">{i + 1}</th>)}
            <th className="hole-header col-out fs-10">{is9 ? "Tot" : "Out"}</th>
            {!is9 && Array.from({ length: Math.min(9, nh - 9) }, (_, i) => <th key={i + 9} className="hole-header">{i + 10}</th>)}
            {!is9 && <th className="hole-header col-in fs-10">In</th>}
          </tr></thead>
          <tbody>
            <tr className="sep-row">
              <td className="sticky-col-0"></td><td className="row-label par-label sticky-col-1">PAR</td><td className="col-total">{parTotal}</td><td></td>
              {par.slice(0, 9).map((p, i) => <td key={i}>{p}</td>)}
              <td className="col-out fw-600">{parF9}</td>
              {!is9 && par.slice(9, 18).map((p, i) => <td key={i}>{p}</td>)}
              {!is9 && <td className="col-in fw-600">{parB9}</td>}
            </tr>
            {si.length >= nh && (
              <tr className="meta-row sep-row">
                <td className="sticky-col-0"></td><td className="row-label par-label sticky-col-1">S.I.</td><td></td><td></td>
                {si.slice(0, 9).map((s, i) => <td key={i}>{s}</td>)}
                <td className="col-out"></td>
                {!is9 && si.slice(9, 18).map((s, i) => <td key={i}>{s}</td>)}
                {!is9 && <td className="col-in"></td>}
              </tr>
            )}
            {sorted.map((p, idx) => {
              const scores = p.scores!;
              const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number);
              const tp = gross - parTotal;
              const f9 = scores.slice(0, 9).reduce((a, b) => a + b, 0);
              const b9 = !is9 ? scores.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
              const dp = (p as any)._dp;
              const showP = idx === 0 || dp !== (sorted[idx - 1] as any)._dp;
              const bg = isManuel(p) ? "var(--bg-success-subtle)" : undefined;
              return (
                <tr key={p.scoreId || idx} style={bg ? { background: bg } : undefined}>
                  <td className="fw-800 ta-center" style={{ color: "var(--text-3)", fontSize: 11, position: "sticky", left: 0, zIndex: 2, background: bg || "var(--bg-card, #fff)" }}>{showP ? dp : ""}</td>
                  <td className="row-label" style={{ whiteSpace: "nowrap", paddingLeft: 6, position: "sticky", left: 26, zIndex: 2, background: bg || "var(--bg-card, #fff)", boxShadow: "2px 0 4px rgba(0,0,0,0.06)" }}>
                    <PName name={p.name} fed={p.fed} playersDB={playersDB} highlight={isManuel(p)} />
                  </td>
                  <td className="col-total">{gross}</td>
                  <td className="fw-700" style={{ color: tp < 0 ? SC.danger : tp === 0 ? SC.good : "var(--text-3)", fontSize: 12 }}>{fmtTP(tp)}</td>
                  {scores.slice(0, 9).map((sc, i) => <td key={i}><span className={"sc-score " + scClass(sc, par[i])}>{sc}</span></td>)}
                  <td className="col-out fw-600">{f9} <span className="fs-8 c-text-3">{fmtSub(f9 - parF9)}</span></td>
                  {!is9 && scores.slice(9, 18).map((sc, i) => <td key={i}><span className={"sc-score " + scClass(sc, par[9 + i])}>{sc}</span></td>)}
                  {!is9 && <td className="col-in fw-600">{b9} <span className="fs-8 c-text-3">{fmtSub(b9 - parB9)}</span></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TOTAL LEADERBOARD (multi-round combined view)
   ═══════════════════════════════════════════════════════ */
function TotalLeaderboard(props: { tournament: Tournament; playersDB: PlayersDB; sdLookup: SDLookup }) {
  const { tournament, playersDB, sdLookup } = props;
  const nRounds = tournament._totalRounds || 2;
  const players = tournament.players.filter(p => !isDNS(p));
  if (!players.length) return <div className="muted ta-center p-16">Sem resultados.</div>;

  // Players are already sorted with incomplete at the bottom by expandMultiRound
  const complete = players.filter(p => !p._incomplete);
  const incomplete = players.filter(p => p._incomplete);
  const refP = complete[0] || players[0];
  const parTotal = (refP.parTotal || 72) * nRounds;

  const cs: React.CSSProperties = { fontSize: 12, padding: "5px 6px", whiteSpace: "nowrap" };
  const hs: React.CSSProperties = { fontSize: 11, padding: "6px 5px" };
  const bS = "1px solid var(--border-light, #e5e7eb)";

  return (
    <div>
      <div className="muted fs-11 mb-8 p-0-4px">
        {complete.length} classificados · {incomplete.length > 0 && <>{incomplete.length} incompletos · </>}
        {nRounds} rondas · Par {parTotal}
      </div>
      <div className="bjgt-chart-scroll">
        <table className="dtable tbl-compact">
          <thead>
            <tr>
              <th style={{ ...hs, width: 28, textAlign: "center" }}>#</th>
              <th style={{ ...hs, textAlign: "left", paddingLeft: 6, minWidth: 155 }}>Jogador</th>
              <th style={{ ...hs, width: 50 }}>Clube</th>
              <th className="r" style={{ ...hs, width: 42 }}>HCP</th>
              <th className="r fw-800" style={{ ...hs, width: 42, borderLeft: bS }}>Total</th>
              <th className="r" style={{ ...hs, width: 36, borderLeft: bS }}>±Par</th>
              {Array.from({ length: nRounds }, (_, r) => (
                <React.Fragment key={r}>
                  <th className="r" style={{ ...hs, width: 36, borderLeft: bS, background: "var(--bg-hover)" }}>R{r + 1}</th>
                  <th className="r" style={{ ...hs, width: 32, background: "var(--bg-hover)" }}>±</th>
                </React.Fragment>
              ))}
              <th className="r" style={{ ...hs, width: 40, borderLeft: bS }}>SD</th>
              <th style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>🐦</th>
              <th style={{ ...hs, width: 28, textAlign: "center" }}>Par</th>
              <th style={{ ...hs, width: 28, textAlign: "center" }}>■</th>
            </tr>
          </thead>
          <tbody>
            {[...complete, ...incomplete].map((p, idx) => {
              const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number);
              const tp = gross - parTotal;
              const bg = isManuel(p) ? "var(--bg-success-subtle)" : p._incomplete ? "var(--bg-hover)" : undefined;
              const stats = computeStats(p, sdLookup);

              // Count birdies/pars/bogeys across ALL rounds
              let totalBird = 0, totalPars = 0, totalBog = 0;
              for (const rs of (p.roundScores || [])) {
                const pars = rs.pars || [];
                const scores = rs.scores || [];
                for (let i = 0; i < scores.length && i < pars.length; i++) {
                  const d = scores[i] - pars[i];
                  if (d <= -1) totalBird++;
                  else if (d === 0) totalPars++;
                  else totalBog++;
                }
              }

              // Per-round gross and toPar
              const roundData = Array.from({ length: nRounds }, (_, r) => {
                const rs = p.roundScores?.find(rr => rr.round === r + 1);
                if (!rs) return null;
                const rPar = rs.pars?.reduce((a, b) => a + b, 0) || (refP.parTotal || 72);
                return { gross: rs.gross, toPar: rs.gross - rPar };
              });

              return (
                <tr key={p.scoreId || idx} style={bg ? { background: bg } : undefined}>
                  <td className="fw-700 ta-center" style={{ ...cs, color: "var(--text-3)" }}>
                    {p._incomplete ? "" : p.pos}
                  </td>
                  <td style={{ ...cs, paddingLeft: 6 }}>
                    <PName name={p.name} fed={p.fed} playersDB={playersDB} highlight={isManuel(p)} />
                    {p._incomplete && <span style={{ marginLeft: 4, fontSize: 9, color: "#dc2626", fontWeight: 700 }}>INC</span>}
                  </td>
                  <td style={{ ...cs, color: "var(--text-3)", fontSize: 11 }}>{p.club}</td>
                  <td className="r" style={{ ...cs, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-3)" }}>
                    {p.hcpExact != null ? p.hcpExact.toFixed(1) : "–"}
                  </td>
                  <td className="r fw-800" style={{ ...cs, fontSize: 14, fontFamily: "'JetBrains Mono', monospace", borderLeft: bS }}>
                    {p._incomplete ? <span className="opacity-40">{gross}</span> : gross}
                  </td>
                  <td className="r fw-700" style={{ ...cs, fontFamily: "'JetBrains Mono', monospace", color: p._incomplete ? undefined : tpColor(tp), borderLeft: bS }}>
                    {p._incomplete ? <span className="opacity-40">{fmtTP(tp)}</span> : fmtTP(tp)}
                  </td>
                  {roundData.map((rd, r) => (
                    <React.Fragment key={r}>
                      <td className="r fw-700" style={{ ...cs, borderLeft: bS, fontFamily: "'JetBrains Mono', monospace", background: "var(--bg-hover)" }}>
                        {rd ? rd.gross : <span className="c-muted">–</span>}
                      </td>
                      <td className="r" style={{ ...cs, fontFamily: "'JetBrains Mono', monospace", color: rd ? tpColor(rd.toPar) : undefined, background: "var(--bg-hover)", fontSize: 11 }}>
                        {rd ? fmtTP(rd.toPar) : <span className="c-muted">–</span>}
                      </td>
                    </React.Fragment>
                  ))}
                  {stats?.sd18 != null ? (
                    <SDCell sd={stats.sd18} sdSource={stats.sdSource} hcp={p.hcpExact ?? null} nholes={stats.nholes} style={{ ...cs, borderLeft: bS }} />
                  ) : (
                    <td className="r" style={{ ...cs, borderLeft: bS }}>–</td>
                  )}
                  <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{totalBird || ""}</td>
                  <td style={{ ...cs, textAlign: "center" }}>{totalPars || ""}</td>
                  <td style={{ ...cs, textAlign: "center" }}>{totalBog || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A display group: either a single tournament or a multi-round set (R1+R2+Total) */
interface TournGroup {
  key: string;
  label: string;       // tab label
  campo: string;
  num: number;
  date: string;
  escalao: string | null; // para Challenge: "Sub 10", "Sub 12", etc.
  isMulti: boolean;
  totalRounds: number;
  entries: Tournament[];  // 1 for single, N+1 for multi (R1, R2, ..., Total)
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
  const multiMap = new Map<string, Tournament[]>();
  const singles: Tournament[] = [];

  for (const t of sorted) {
    if (t._multiGroup) {
      if (!multiMap.has(t._multiGroup)) multiMap.set(t._multiGroup, []);
      multiMap.get(t._multiGroup)!.push(t);
    } else {
      singles.push(t);
    }
  }

  // Build groups in date order
  const allEntries = [...sorted];
  const seen = new Set<string>();
  for (const t of allEntries) {
    if (t._multiGroup) {
      if (seen.has(t._multiGroup)) continue;
      seen.add(t._multiGroup);
      const entries = multiMap.get(t._multiGroup)!;
      // Sort: R1, R2, ..., Total last
      entries.sort((a, b) => {
        if (a._roundLabel === "Total") return 1;
        if (b._roundLabel === "Total") return -1;
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
        totalRounds: t._totalRounds || 2,
        entries,
      });
    } else {
      groups.push({
        key: t.tcode,
        label: shortCampo(t.campo),
        campo: t.campo,
        num: t.num,
        date: t.date,
        escalao: t.escalao ?? null,
        isMulti: false,
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
  avgGross: number | null; avgSD: number | null; bestGross: number | null; tourneiosPlayed: number;
  totalBird: number; totalPars: number; totalBog: number;
}
type Sub12SeriesTab = "tour" | "challenge" | "aquapor";
type Sub12ViewTab = "grid" | "ranking" | "evolucao";

const SUB12_SERIES_TABS: { key: Sub12SeriesTab; label: string; emoji: string; color: string; bg: string; holes: string }[] = [
  { key: "tour",      label: "Tour",      emoji: "🏌️", color: "#059669", bg: "#d1fae5", holes: "18h" },
  { key: "challenge", label: "Challenge", emoji: "⚡",  color: "#7c3aed", bg: "#ede9fe", holes: "9h"  },
  { key: "aquapor",   label: "AQUAPOR",   emoji: "💧", color: "#4338ca", bg: "#e0e7ff", holes: "18h" },
];
const CHART_COLORS = ["#2563eb","#dc2626","#16a34a","#d97706","#7c3aed","#0891b2","#be185d","#65a30d","#c2410c","#6366f1","#0d9488","#ea580c"];
const SERIE_COLORS: Record<string, string> = { tour: "#059669", challenge: "#7c3aed", aquapor: "#4338ca" };
const SERIE_LABELS: Record<string, string>  = { tour: "Tour",   challenge: "Challenge",  aquapor: "AQUAPOR" };
const REGION_EMOJI: Record<string, string>  = { norte: "🔵", tejo: "🟡", sul: "🟢", madeira: "🟣", acores: "🔴", nacional: "⚪" };

const numAvg = (nums: number[]): number | null => nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;

function isSub12(esc: string): boolean {
  if (!esc) return false;
  const n = esc.toLowerCase().replace(/[\s-]/g, "");
  return n === "sub10" || n === "sub12";
}
function computeSDWithSource(p: Player, sdLookup: SDLookup): { sd: number | null; source: "fpg" | "ags" | "raw" | null } {
  const fed = p.fed || p.fedCode;
  if (fed && sdLookup[fed] != null) return { sd: sdLookup[fed], source: "fpg" };
  const scores = p.scores || [];
  const parArr = p.par || [];
  const si = p.si || [];
  const nholes = p.nholes || scores.length || 18;
  const parT = p.parTotal || (parArr.length ? parArr.reduce((a,b)=>a+b,0) : 72);
  const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number);
  if (gross == null || isNaN(gross)) return { sd: null, source: null };
  const cr = p.courseRating;
  const slope = p.slope;
  const hcp = p.hcpExact;
  if (cr && slope && hcp != null && scores.length >= nholes && parArr.length >= nholes && si.length >= nholes) {
    const ags = calcAGS(scores, parArr, si, cr, slope, hcp, nholes);
    const sd18 = nholes <= 9
      ? Math.abs(ags - parT) / (slope / 113) * (18 / nholes) + (cr - parT * (18 / nholes))
      : (ags - cr) * 113 / slope + (cr - (cr / (nholes / 18) * (nholes / 18)));
    const sd = Math.max(0, Math.round(sd18 * 10) / 10);
    return { sd, source: "ags" };
  }
  if (hcp != null) {
    const exp = nholes <= 9 ? expectedSD9(Math.abs(hcp)) : Math.abs(hcp) * 1.06 + 1;
    return { sd: Math.round(exp * 10) / 10, source: "raw" };
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
  const singleRound = tournaments.filter(t => !t._roundLabel || t._roundLabel !== "Total");
  const playerMap = new Map<string, Sub12Row>();
  for (const t of singleRound) {
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
          results: [], avgGross: null, avgSD: null, bestGross: null, tourneiosPlayed: 0,
          totalBird: 0, totalPars: 0, totalBog: 0,
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
  }
  return [...playerMap.values()].sort((a, b) => (a.avgSD ?? 999) - (b.avgSD ?? 999));
}
function filterBySub12Series(rows: Sub12Row[], series: Sub12SeriesTab): Sub12Row[] {
  return rows.map(p => {
    const fR = p.results.filter(r => r.series === series);
    if (fR.length === 0) return null;
    const fG = fR.map(r => r.gross);
    const fS = fR.filter(r => r.sd != null).map(r => r.sd!);
    return {
      ...p, results: fR, tourneiosPlayed: fR.length,
      avgGross: numAvg(fG), avgSD: numAvg(fS), bestGross: fG.length ? Math.min(...fG) : null,
      totalBird: fR.reduce((s, r) => s + r.birdies, 0),
      totalPars: fR.reduce((s, r) => s + r.pars, 0),
      totalBog:  fR.reduce((s, r) => s + r.bogeys, 0),
    };
  }).filter(Boolean) as Sub12Row[];
}

const shortDate = (d: string) => {
  if (!d) return "";
  const parts = d.split("-");
  return parts.length >= 3 ? (parts[0].length === 4 ? parts[2] + "/" + parts[1] : parts[0] + "/" + parts[1]) : d;
};

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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
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
              {isNext && <span style={{ fontSize: 8, background: col, color: "#fff", padding: "0 4px", borderRadius: 3, marginLeft: 2 }}>PRÓXIMO</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="kpi" style={{ flex: "1 1 120px", minWidth: 120 }}>
      <div className="kpi-lbl">{label}</div>
      <div className="kpi-val" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
function SdSpan({ sd, hcp }: { sd: number | null; hcp?: number | null }) {
  if (sd == null) return <span className="c-muted">–</span>;
  return <span className={"p p-sm fs-11 p-" + sdClassByHcp(sd, hcp ?? null)}>{sd.toFixed(1)}</span>;
}
function ToParSpan({ tp }: { tp: number | null }) {
  if (tp == null) return <span className="c-muted">–</span>;
  const color = tp < 0 ? SC.danger : tp === 0 ? SC.good : undefined;
  const s = tp === 0 ? "E" : tp > 0 ? "+" + tp : "" + tp;
  return <span style={{ fontWeight: 700, fontSize: 11, color }}>{s}</span>;
}

const STICKY_NAME_W = 170;
const STICKY_HCP_W  = 48;
const STICKY_BG      = "var(--bg-card)";
const STICKY_BG_HEAD = "var(--bg-topbar)";
const stickyBase     = (left: number, isLast?: boolean): React.CSSProperties => ({ position: "sticky", left, zIndex: 2, background: STICKY_BG, ...(isLast ? { borderRight: "2px solid var(--border)", boxShadow: "2px 0 4px rgba(0,0,0,0.06)" } : {}) });
const stickyHeadBase = (left: number, isLast?: boolean): React.CSSProperties => ({ position: "sticky", left, zIndex: 3, background: STICKY_BG_HEAD, ...(isLast ? { borderRight: "2px solid var(--border)", boxShadow: "2px 0 4px rgba(0,0,0,0.06)" } : {}) });

function TournamentGrid({ rows, allTournaments, onPlayerClick, playersDB, escLookup }: {
  rows: Sub12Row[];
  allTournaments: { key: string; short: string; date: string; series: string; campo?: string; nholes?: number }[];
  onPlayerClick: (fed: string) => void;
  playersDB: PlayersDB;
  escLookup?: EscLookup;
}) {
  type S12SortKey = "name" | "fed" | "escalao" | "club" | "hcp" | "played" | "avgSD" | "avgGross" | string;
  const [sortKey, setSortKey] = useState<S12SortKey>("avgSD");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = useCallback((k: S12SortKey) => {
    if (k === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }, [sortKey]);

  const sorted = useMemo(() => {
    const mult = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const INF = 9999;
      switch (sortKey) {
        case "name":     return mult * a.name.localeCompare(b.name, "pt");
        case "fed":      return mult * (a.fed || "").localeCompare(b.fed || "");
        case "escalao": {
          const ea = playersDB[a.fed]?.escalao || "";
          const eb = playersDB[b.fed]?.escalao || "";
          return mult * ea.localeCompare(eb, "pt");
        }
        case "club":     return mult * (a.club || "").localeCompare(b.club || "", "pt");
        case "hcp":      return mult * ((a.hcp ?? INF) - (b.hcp ?? INF));
        case "totalBird": return mult * (b.totalBird - a.totalBird);
        case "totalPars": return mult * (b.totalPars - a.totalPars);
        case "totalBog":  return mult * (a.totalBog  - b.totalBog);
        case "avgSD":    return mult * ((a.avgSD ?? INF) - (b.avgSD ?? INF));
        case "avgGross": return mult * ((a.avgGross ?? INF) - (b.avgGross ?? INF));
        default: {
          if (sortKey.startsWith("gross_")) {
            const tk = sortKey.replace("gross_", "");
            const va = a.results.find(r => r.tournKey === tk)?.gross ?? INF;
            const vb = b.results.find(r => r.tournKey === tk)?.gross ?? INF;
            return mult * (va - vb);
          }
          if (sortKey.startsWith("toPar_")) {
            const tk = sortKey.replace("toPar_", "");
            const va = a.results.find(r => r.tournKey === tk)?.toPar ?? INF;
            const vb = b.results.find(r => r.tournKey === tk)?.toPar ?? INF;
            return mult * (va - vb);
          }
          if (sortKey.startsWith("sd_")) {
            const tk = sortKey.replace("sd_", "");
            const va = a.results.find(r => r.tournKey === tk)?.sd ?? INF;
            const vb = b.results.find(r => r.tournKey === tk)?.sd ?? INF;
            return mult * (va - vb);
          }
          if (sortKey.startsWith("pos_")) {
            const tk = sortKey.replace("pos_", "");
            const va = typeof a.results.find(r => r.tournKey === tk)?.pos === "number" ? (a.results.find(r => r.tournKey === tk)?.pos as number) : INF;
            const vb = typeof b.results.find(r => r.tournKey === tk)?.pos === "number" ? (b.results.find(r => r.tournKey === tk)?.pos as number) : INF;
            return mult * (va - vb);
          }
          if (sortKey.startsWith("bird_")) {
            const tk = sortKey.replace("bird_", "");
            const va = a.results.find(r => r.tournKey === tk)?.birdies ?? -1;
            const vb = b.results.find(r => r.tournKey === tk)?.birdies ?? -1;
            return mult * (vb - va); // mais birdies = melhor
          }
          if (sortKey.startsWith("par_")) {
            const tk = sortKey.replace("par_", "");
            const va = a.results.find(r => r.tournKey === tk)?.pars ?? -1;
            const vb = b.results.find(r => r.tournKey === tk)?.pars ?? -1;
            return mult * (vb - va);
          }
          if (sortKey.startsWith("bog_")) {
            const tk = sortKey.replace("bog_", "");
            const va = a.results.find(r => r.tournKey === tk)?.bogeys ?? 999;
            const vb = b.results.find(r => r.tournKey === tk)?.bogeys ?? 999;
            return mult * (va - vb); // menos bogeys = melhor
          }
          return 0;
        }
      }
    });
  }, [rows, sortKey, sortDir, playersDB]);

  // Mesmas constantes exactas do ResumoTable
  const hs: React.CSSProperties = { fontSize: 11, padding: "6px 5px" };
  const cs: React.CSSProperties = { fontSize: 12, padding: "5px 5px", whiteSpace: "nowrap" };
  const bG = "3px solid var(--border)";
  const bS = "1px solid var(--border-light, #e5e7eb)";
  const stickyBg = "var(--bg-card, #fff)";
  const stickyCol0: React.CSSProperties = { position: "sticky", left: 0, zIndex: 3, minWidth: 26, background: stickyBg };
  const stickyCol1: React.CSSProperties = { position: "sticky", left: 26, zIndex: 3, minWidth: 155, background: stickyBg, boxShadow: "2px 0 4px rgba(0,0,0,0.06)" };
  const stickyHeadCol0: React.CSSProperties = { ...stickyCol0, zIndex: 5 };
  const stickyHeadCol1: React.CSSProperties = { ...stickyCol1, zIndex: 5 };

  const fmtTP2 = (v: number | null) => v == null ? "–" : v === 0 ? "E" : v > 0 ? "+" + v : "" + v;
  const tpColor2 = (v: number | null) => v == null ? undefined : v < 0 ? SC.danger : v === 0 ? SC.good : undefined;

  return (
    <div className="bjgt-chart-scroll">
      <table className="dtable tbl-compact">
        <thead>
          {/* Linha 1: nome do torneio — igual ao ResumoTable */}
          <tr>
            <th colSpan={6} style={{ ...hs, borderBottom: "none" }}></th>
            {allTournaments.map(t => (
              <th key={t.key} colSpan={7} style={{ ...hs, textAlign: "center", borderLeft: bG, background: "var(--bg-hover)", lineHeight: 1.3 }}>
                <div className="fw-800" style={{ fontSize: 13 }}>{t.short}</div>
                <div className="c-muted-fs10-fw5">
                  {shortDate(t.date)}{t.campo ? " · " + t.campo : ""}{t.nholes ? " · " + t.nholes + "h" : ""}
                </div>
              </th>
            ))}
            <th colSpan={6} style={{ ...hs, borderLeft: bG, textAlign: "center", background: "var(--bg-hover)", fontSize: 12, fontWeight: 800 }}>Temporada</th>
          </tr>
          {/* Linha 2: sub-colunas */}
          <tr>
            <SortTh sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, textAlign: "center", width: 26, ...stickyHeadCol0 }}>#</SortTh>
            <SortTh sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, textAlign: "left", paddingLeft: 6, minWidth: 155, ...stickyHeadCol1 }}>Jogador</SortTh>
            <SortTh sortKey="fed"     current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 52 }}>Fed</SortTh>
            <SortTh sortKey="escalao" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 52 }}>Esc.</SortTh>
            <SortTh sortKey="club"    current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, minWidth: 80 }}>Clube</SortTh>
            <SortTh sortKey="hcp"     current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 42, borderRight: bG }}>HCP</SortTh>
            {allTournaments.map(t => (
              <React.Fragment key={t.key}>
                <SortTh sortKey={"pos_" + t.key}   current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 28, borderLeft: bG }}>#</SortTh>
                <SortTh sortKey={"gross_" + t.key} current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 40, borderLeft: bS }}>Gross</SortTh>
                <SortTh sortKey={"toPar_" + t.key} current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 36, borderLeft: bS }}>±Par</SortTh>
                <SortTh sortKey={"sd_" + t.key}    current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 44, borderLeft: bS }}>SD</SortTh>
                <SortTh sortKey={"bird_" + t.key}  current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>🐦</SortTh>
                <SortTh sortKey={"par_" + t.key}   current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>Par</SortTh>
                <SortTh sortKey={"bog_" + t.key}   current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>■</SortTh>
              </React.Fragment>
            ))}
            <SortTh sortKey="played"    current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 36, borderLeft: bG }}>Jogos</SortTh>
            <SortTh sortKey="avgGross"  current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 44, borderLeft: bS }}>Avg</SortTh>
            <SortTh sortKey="avgSD"     current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 50, borderLeft: bS }}>Avg SD</SortTh>
            <SortTh sortKey="totalBird" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>🐦</SortTh>
            <SortTh sortKey="totalPars" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>Par</SortTh>
            <SortTh sortKey="totalBog"  current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>■</SortTh>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, idx) => {
            const dbInfo = playersDB[p.fed] || {};
            const escalao = dbInfo.escalao || "";
            const escCls = escalao ? "p p-sm p-" + escalao.toLowerCase().replace(/[\s-]/g, "") : "";
            const cellBg = stickyBg;
            return (
              <tr key={p.fed} className="pointer" onClick={() => onPlayerClick(p.fed)}>
                <td className="fw-700 ta-center" style={{ ...cs, color: "var(--text-3)", ...stickyCol0, background: cellBg }}>{idx + 1}</td>
                <td style={{ ...cs, paddingLeft: 6, ...stickyCol1, background: cellBg }}>
                  <PName name={p.name} fed={p.fed || undefined} playersDB={playersDB} />
                </td>
                <td style={{ ...cs, fontSize: 10, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>{p.fed || "–"}</td>
                <td style={cs}>{escalao ? <span className={escCls + " fs-9"}>{escalao}</span> : <span className="c-muted-fs10">–</span>}</td>
                <td style={{ ...cs, color: "var(--text-3)" }}>{p.club}</td>
                <td className="r" style={{ ...cs, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-3)", borderRight: bG }}>{p.hcp != null ? p.hcp.toFixed(1) : "–"}</td>
                {allTournaments.map(t => {
                  const res = p.results.find(r => r.tournKey === t.key);
                  if (!res) return (
                    <td key={t.key} colSpan={7} style={{ textAlign: "center", borderLeft: bG, ...cs }}></td>
                  );
                  return (
                    <React.Fragment key={t.key}>
                      <td className="r fw-700" style={{ borderLeft: bG, ...cs, color: "var(--text-3)" }}>{res.pos ?? "–"}</td>
                      <td className="r fw-800" style={{ ...cs, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", borderLeft: bS }}>{res.gross}</td>
                      <td className="r fw-700" style={{ ...cs, fontFamily: "'JetBrains Mono', monospace", color: tpColor2(res.toPar), borderLeft: bS }}>{fmtTP2(res.toPar)}</td>
                      <td className="r" style={{ ...cs, borderLeft: bS }}>
                        <SDCell sd={res.sd} sdSource={res.sdSource} hcp={p.hcp} nholes={res.nholes} style={{}} />
                      </td>
                      <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{res.birdies}</td>
                      <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{res.pars}</td>
                      <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{res.bogeys}</td>
                    </React.Fragment>
                  );
                })}
                <td className="r fw-700" style={{ borderLeft: bG, ...cs, fontSize: 13 }}>{p.tourneiosPlayed}</td>
                <td className="r" style={{ ...cs, borderLeft: bS, fontFamily: "'JetBrains Mono', monospace" }}>{p.avgGross != null ? p.avgGross.toFixed(0) : "–"}</td>
                <td className="r" style={{ ...cs, borderLeft: bS }}>
                  {p.avgSD != null ? <span className={"p p-sm p-" + sdClassByHcp(p.avgSD, p.hcp)}>{p.avgSD.toFixed(1)}</span> : "–"}
                </td>
                <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{p.totalBird}</td>
                <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{p.totalPars}</td>
                <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{p.totalBog}</td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr><td colSpan={99} className="muted p-16">Nenhum jogador Sub-12 encontrado</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}


function RankingView({ rows, onPlayerClick }: { rows: Sub12Row[]; onPlayerClick: (fed: string) => void }) {
  const ranked = [...rows].filter(p => p.avgSD != null && p.tourneiosPlayed >= 2).sort((a,b) => (a.avgSD??999)-(b.avgSD??999));
  const medals = ["🥇","🥈","🥉"];
  const oneTourney = rows.filter(p => p.tourneiosPlayed === 1);
  return (
    <div>
      {ranked.length === 0 ? (
        <div className="card"><div className="muted">Nenhum jogador com ≥2 torneios para gerar ranking</div></div>
      ) : (
        <div className="bjgt-chart-scroll">
          <table className="dtable" style={{ fontSize: 12 }}>
            <thead><tr>
              <th className="r" style={{ width: 36 }}>#</th><th style={{ textAlign: "left", paddingLeft: 6 }}>Jogador</th><th>Clube</th>
              <th className="r">HCP</th><th className="r">T</th><th className="r">Avg Gross</th>
              <th className="r">Avg SD</th><th className="r">Melhor</th>
            </tr></thead>
            <tbody>
              {ranked.map((p, i) => (
                <tr key={p.fed} className={`pointer${p.sex === "F" ? " tourn-female-row" : ""}`} onClick={() => onPlayerClick(p.fed)}>
                  <td className="r" style={{ fontSize: 16 }}>{i < 3 ? medals[i] : <span className="tourn-mono fw-700">{i+1}</span>}</td>
                  <td>
                    <span className="fw-700" style={{ cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 2 }}
                      onClick={(e) => { e.stopPropagation(); window.open(`/jogadores/${p.fed}`, "_blank"); }}>{p.name}</span>
                    {p.sex === "F" && <span className="jog-sex-inline jog-sex-F ml-4">F</span>}
                    {p.sex === "M" && <span className="jog-sex-inline jog-sex-M ml-4">M</span>}
                  </td>
                  <td className="c-muted fs-11">{p.club}</td>
                  <td className="r tourn-mono">{p.hcp != null ? p.hcp.toFixed(1) : "–"}</td>
                  <td className="r tourn-mono">{p.tourneiosPlayed}</td>
                  <td className="r tourn-mono">{p.avgGross?.toFixed(0) ?? "–"}</td>
                  <td className="r"><SdSpan sd={p.avgSD} hcp={p.hcp} /></td>
                  <td className="r tourn-mono fw-700 c-good-dark">{p.bestGross ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {oneTourney.length > 0 && (
        <div className="card mt-14">
          <div className="h-xs">Com apenas 1 torneio ({oneTourney.length})</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
            {oneTourney.map(p => {
              const r = p.results[0];
              return (
                <div key={p.fed} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "var(--bg)", borderRadius: "var(--radius)", fontSize: 11, cursor: "pointer" }}
                  onClick={() => onPlayerClick(p.fed)}>
                  <span className="fw-600">{p.name}</span>
                  <span className="tourn-mono">{r?.gross ?? "–"} <span className="c-muted">({r?.tournShort})</span></span>
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
      <div style={{ width: "100%", height: 340, marginTop: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={["dataMin - 2", "dataMax + 2"]} />
            <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
              formatter={(value: number, name: string) => { const p = top.find(x => x.fed===name); return [value?.toFixed(1), p?.name||name]; }} />
            <Legend formatter={(value: string) => { const p = top.find(x => x.fed===value); return <span style={{ fontSize: 10 }}>{p?.name||value}</span>; }} />
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
      <button onClick={onClose} style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-3)" }}>✕</button>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 800 }}>{row.name}</span>
        <span className="muted fs-11">{row.club} · {row.region} · HCP {row.hcp != null ? row.hcp.toFixed(1) : "–"}</span>
        <a href={`/jogadores/${row.fed}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "underline" }}>Ver perfil →</a>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <KpiCard label="Torneios"  value={String(row.tourneiosPlayed)} />
        <KpiCard label="Avg Gross" value={row.avgGross?.toFixed(0) ?? "–"} />
        <KpiCard label="Avg SD"    value={row.avgSD?.toFixed(1) ?? "–"} color={row.avgSD != null && row.avgSD <= 25 ? "var(--color-good)" : undefined} />
        <KpiCard label="Melhor"    value={row.bestGross != null ? String(row.bestGross) : "–"} color="var(--color-good-dark)" />
      </div>
      <table className="dtable fs-11">
        <thead><tr><th>Data</th><th>Torneio</th><th>Campo</th><th className="r">Pos</th><th className="r">Gross</th><th className="r">±Par</th><th className="r">SD</th></tr></thead>
        <tbody>
          {row.results.map((r, i) => (
            <tr key={i}>
              <td className="tourn-mono fs-10">{r.date}</td>
              <td>
                <span className="fw-600">{r.tournName}</span>
                <span className="p p-sm ml-4" style={{ fontSize: 8, background: (SERIE_COLORS[r.series]||"#999")+"22", color: SERIE_COLORS[r.series], border: `1px solid ${SERIE_COLORS[r.series]}44` }}>
                  {SERIE_LABELS[r.series]}
                </span>
              </td>
              <td className="c-muted fs-10">{r.campo}</td>
              <td className="r tourn-mono">{r.pos ?? "–"}<span className="c-muted fs-9">/{r.totalPlayers}</span></td>
              <td className="r tourn-mono fw-700">{r.gross}</td>
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

  // Série principal (inclui sub12 como 4ª tab)
  const [series, setSeries]                     = useState<"tour"|"challenge"|"aquapor"|"sub12">("tour");
  const [sidebarOpen, setSidebarOpen]           = useState(true);
  const [regionFilter, setRegionFilter]         = useState<string | null>(null);
  const [escFilter, setEscFilter]               = useState<string[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [roundIdx, setRoundIdx]                 = useState(0);

  // Estado específico Sub-12
  const [sub12Series, setSub12Series]   = useState<Sub12SeriesTab>("tour");
  const [sub12View, setSub12View]       = useState<Sub12ViewTab>("grid");
  const [sub12Region, setSub12Region]   = useState("all");
  const [sub12Sex, setSub12Sex]         = useState("all");
  const [sub12Search, setSub12Search]   = useState("");
  const [sub12Player, setSub12Player]   = useState<Sub12Row | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/data/drive-data.json").then(r => { if (!r.ok) throw new Error("drive " + r.status); return r.json(); }),
      fetch("/data/players.json").then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch("/data/drive-sd-lookup.json").then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch("/data/aquapor-data.json").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([dd, pp, sd, aq]) => {
      const driveData = dd as DriveData;
      driveData.tournaments = driveData.tournaments.map(normalizeTournament);
      if (aq?.tournaments) {
        const aqT = (aq.tournaments as Tournament[]).map(t => normalizeTournament({ ...t, series: "aquapor" as const }));
        driveData.tournaments = [...driveData.tournaments, ...aqT];
        driveData.totalTournaments += aqT.length;
        driveData.totalPlayers += aqT.reduce((s, t) => s + t.playerCount, 0);
      }
      driveData.tournaments = expandMultiRound(driveData.tournaments);
      // Mostrar dados imediatamente; resolver feds em background
      setData(driveData); setPdb(pp as PlayersDB); setSdLookup(sd as SDLookup); setLoading(false);
      setTimeout(() => {
        resolveFedsInTournaments(driveData.tournaments, pp as PlayersDB);
        // Forçar re-render para aplicar feds resolvidos
        setData({ ...driveData });
      }, 0);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const tourT    = useMemo(() => data?.tournaments.filter(t => t.series === "tour")      ?? [], [data]);
  const challT   = useMemo(() => data?.tournaments.filter(t => t.series === "challenge") ?? [], [data]);
  const aquaporT = useMemo(() => data?.tournaments.filter(t => t.series === "aquapor")   ?? [], [data]);
  const escLookup = useMemo(() => buildEscLookup(pdb, data?.tournaments ?? []), [pdb, data]);

  // Sub-12: só calcular quando a tab é activada pela primeira vez
  const [sub12Ready, setSub12Ready] = useState(false);
  useEffect(() => { if (series === "sub12" && !sub12Ready) setSub12Ready(true); }, [series, sub12Ready]);

  const sub12Data = useMemo(() =>
    sub12Ready && data ? buildSub12Data(data.tournaments, pdb, sdLookup, escLookup) : []
  , [sub12Ready, data, pdb, sdLookup, escLookup]);

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
  const sub12KpiAvgSD    = numAvg(sub12Filtered.filter(p => p.avgSD != null).map(p => p.avgSD!));
  const sub12KpiBest     = sub12Filtered.reduce<number|null>((best,p) => p.bestGross != null && (best==null||p.bestGross<best) ? p.bestGross : best, null);

  const handleSub12PlayerClick = useCallback((fed: string) => {
    const p = sub12SeriesRows.find(x => x.fed === fed);
    if (p) setSub12Player(prev => prev?.fed === fed ? null : p);
  }, [sub12SeriesRows]);

  // Série normal (tour/challenge/aquapor)
  const seriesT = series === "tour" ? tourT : series === "challenge" ? challT : aquaporT;
  const availRegions = useMemo(() => {
    if (series === "sub12") return [];
    const s = new Set(seriesT.map(t => t.region));
    return REGIONS.filter(r => s.has(r.id));
  }, [series, seriesT]);

  const filteredT = useMemo(() => {
    if (series === "sub12") return [];
    let ts = seriesT;
    if (regionFilter) ts = ts.filter(t => t.region === regionFilter);
    if (escFilter.length > 0 && series === "challenge") ts = filterTournByEsc(ts, escFilter, escLookup);
    return ts;
  }, [series, seriesT, regionFilter, escFilter, escLookup]);

  const filteredGroups = useMemo(() => series === "sub12" ? [] : buildGroups(filteredT), [series, filteredT]);
  const regionT = useMemo(() => regionFilter ? seriesT.filter(t => t.region === regionFilter) : seriesT, [seriesT, regionFilter]);
  const availEscs = useMemo(() => series === "challenge" ? availEscaloes(regionT, escLookup) : [], [series, regionT, escLookup]);

  useEffect(() => { setRegionFilter(null); setEscFilter([]); setSelectedGroupKey(null); setRoundIdx(0); }, [series]);
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
    return `T${g.num}${isDup ? " · " + fmtDate(g.date) : ""}${g.escalao ? " · " + g.label + " · " + g.escalao : " · " + g.label}`;
  };

  if (loading) return <LoadingState />;
  if (error)   return <div className="jogadores-page"><div className="notice-error" style={{ margin: 16 }}>Erro: {error}</div></div>;
  if (!data)   return null;

  const sdCount = Object.keys(sdLookup).length;
  const isSub12Mode = series === "sub12";

  return (
    <div className="jogadores-page">

      {/* ── Toolbar ── */}
      <div className="toolbar">
        <div className="toolbar-left">
          {(
            <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)}
              title={sidebarOpen ? "Fechar painel" : "Abrir painel"}>
              {sidebarOpen ? "◀" : "▶"}
            </button>
          )}
          <span className="toolbar-title">
            {isSub12Mode ? "Sub-12 DRIVE" : series === "aquapor" ? "💧 AQUAPOR" : "🏁 DRIVE"} 2026
          </span>
          <span className="toolbar-meta">
            {isSub12Mode ? "Sub-10 + Sub-12" : series === "aquapor" ? "Circuito Nacional" : "Circuito Regional Juvenil"}
          </span>
          <div className="toolbar-sep" />
          <div className="escalao-pills">
            <button className={"tourn-tab tourn-tab-sm" + (series === "tour" ? " active" : "")}
              onClick={() => setSeries("tour")}
              style={series === "tour" ? {} : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}>
              🏌️ Tour ({countEvents(tourT)})
            </button>
            <button className={"tourn-tab tourn-tab-sm" + (series === "challenge" ? " active" : "")}
              onClick={() => setSeries("challenge")}
              style={series === "challenge" ? {} : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}>
              ⚡ Challenge ({countEvents(challT)})
            </button>
            <button className={"tourn-tab tourn-tab-sm" + (series === "aquapor" ? " active" : "")}
              onClick={() => setSeries("aquapor")}
              style={series === "aquapor" ? {} : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}>
              💧 AQUAPOR ({countEvents(aquaporT)})
            </button>
            <button className={"tourn-tab tourn-tab-sm" + (series === "sub12" ? " active" : "")}
              onClick={() => setSeries("sub12")}
              style={series === "sub12" ? {} : { background: "var(--bg-warn-strong)", color: "var(--color-warn-dark)", borderColor: "var(--bg-warn-strong)", fontWeight: 700 }}>
              Sub-12
            </button>
          </div>
        </div>
        <div className="toolbar-right">
          {!isSub12Mode && data.totalScorecards > 0 && (
            <span className="chip" style={{ background: "var(--bg-success-strong)", color: "var(--color-good-dark)" }}>
              📊 {data.totalScorecards} sc
            </span>
          )}
          <span className="chip">📅 {data.lastUpdated}</span>
        </div>
      </div>

      {/* ── Toolbar linha 2: filtros de série normal ── */}
      {!isSub12Mode && (availRegions.length > 1 || (series === "challenge" && availEscs.length > 1)) && (
        <div className="toolbar" style={{ minHeight: 0, padding: "4px 12px", borderTop: "1px solid var(--border-light)", gap: 6, flexWrap: "wrap" }}>
          {availRegions.length > 1 && (
            <div className="escalao-pills gap-4">
              <button className={"tourn-tab tourn-tab-sm" + (regionFilter === null ? " active" : "")}
                onClick={() => setRegionFilter(null)}>
                Todas ({countEvents(seriesT)})
              </button>
              {availRegions.map(reg => {
                const rt = seriesT.filter(t => t.region === reg.id);
                return (
                  <button key={reg.id}
                    className={"tourn-tab tourn-tab-sm" + (regionFilter === reg.id ? " active" : "")}
                    onClick={() => setRegionFilter(reg.id)}
                    style={regionFilter === reg.id ? {} : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}>
                    {reg.emoji} {reg.label} ({countEvents(rt)}T · {uniquePC(rt)} jog)
                  </button>
                );
              })}
            </div>
          )}
          {series === "challenge" && availEscs.length > 1 && (
            <>
              {availRegions.length > 1 && <div className="toolbar-sep" />}
              <div className="escalao-pills gap-4">
                <button className={"tourn-tab tourn-tab-sm" + (escFilter.length === 0 ? " active" : "")}
                  onClick={() => setEscFilter([])}>
                  Todos ({uniquePC(regionT)} jog)
                </button>
                {availEscs.map(e => {
                  const on = escFilter.includes(e);
                  return (
                    <button key={e}
                      className={"tourn-tab tourn-tab-sm" + (on ? " active" : "")}
                      onClick={() => setEscFilter(prev => on ? prev.filter(x => x !== e) : [...prev, e])}
                      style={on ? {} : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}>
                      {e}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODO SUB-12
          ══════════════════════════════════════════ */}
      {isSub12Mode && (
        <div className="master-detail">

          {/* Sidebar Sub-12 */}
          <div className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
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
            <div style={{ padding: "4px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
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
              <input className="input" style={{ width: "100%", fontSize: 11, boxSizing: "border-box" }}
                value={sub12Search} onChange={e => setSub12Search(e.target.value)} placeholder="Nome, clube…" />
            </div>

            <div className="muted fs-10" style={{ padding: "8px 12px", borderTop: "1px solid var(--border-light)", marginTop: 8 }}>
              Sub-10 + Sub-12 · scoring.datagolf.pt
            </div>
          </div>

          {/* Conteúdo principal */}
          <div className="flex-1-scroll">
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
                  — Sub-12 {SUB12_SERIES_TABS.find(s => s.key === sub12Series)?.label} 2026
                </div>
                <div className="muted fs-11 mb-8">
                  {sub12KpiPlayers} jogadores · {sub12KpiRounds} rondas
                  {sub12KpiAvgSD != null && <> · SD médio <span style={{ fontWeight: 700, color: sub12KpiAvgSD <= 25 ? "var(--color-good)" : "var(--text)" }}>{sub12KpiAvgSD.toFixed(1)}</span></>}
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
      {!isSub12Mode && (
        <div className="master-detail">

          {/* Sidebar */}
          <div className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
            <button
              className={`course-item ${selectedGroupKey === null ? "active" : ""}`}
              onClick={() => { setSelectedGroupKey(null); setRoundIdx(0); }}>
              <div className="course-item-name">📋 Resumo temporada</div>
              <div className="course-item-sub">{filteredGroups.length} torneios · {uniquePC(filteredT)} jog</div>
            </button>

            {availRegions.length > 1 && !regionFilter
              ? REGIONS
                  .filter(r => filteredGroups.some(g => g.entries[0]?.region === r.id))
                  .map(reg => {
                    const regGroups = filteredGroups.filter(g => g.entries[0]?.region === reg.id);
                    return (
                      <React.Fragment key={reg.id}>
                        <div className="sidebar-section-title">{reg.emoji} {reg.label}</div>
                        {regGroups.map(g => (
                          <button key={g.key}
                            className={`course-item ${selectedGroupKey === g.key ? "active" : ""}`}
                            onClick={() => { setSelectedGroupKey(g.key); setRoundIdx(0); }}>
                            <div className="course-item-name">{sidebarItemLabel(g)}</div>
                            <div className="course-item-sub">
                              {fmtDate(g.date)} · {uniquePC(g.entries)} jog
                              {g.isMulti && <span className="chip" style={{ marginLeft: 4, fontSize: 9, padding: "0 5px" }}>{g.totalRounds}R</span>}
                            </div>
                          </button>
                        ))}
                      </React.Fragment>
                    );
                  })
              : filteredGroups.map(g => (
                  <button key={g.key}
                    className={`course-item ${selectedGroupKey === g.key ? "active" : ""}`}
                    onClick={() => { setSelectedGroupKey(g.key); setRoundIdx(0); }}>
                    <div className="course-item-name">{sidebarItemLabel(g)}</div>
                    <div className="course-item-sub">
                      {fmtDate(g.date)} · {uniquePC(g.entries)} jog
                      {g.isMulti && <span className="chip" style={{ marginLeft: 4, fontSize: 9, padding: "0 5px" }}>{g.totalRounds}R</span>}
                    </div>
                  </button>
                ))
            }

            {filteredGroups.length === 0 && (
              <div className="muted" style={{ padding: "16px 12px", fontSize: 12 }}>Sem torneios</div>
            )}
            <div className="muted fs-10" style={{ padding: "8px 12px", borderTop: "1px solid var(--border-light)" }}>
              scoring.datagolf.pt{sdCount > 0 && ` · SD: ${sdCount}`}
            </div>
          </div>

          {/* Conteúdo principal */}
          <div className="flex-1-scroll">

            {/* RESUMO */}
            {selectedGroupKey === null && (
              <div style={{ padding: "0 12px 12px" }}>
                <div className="card card-scroll">
                  <div className="h-md fs-14">
                    📋 {series === "tour" ? "Drive Tour" : series === "challenge" ? "Drive Challenge" : "AQUAPOR"}
                    {regionFilter ? " " + (regionOf(regionFilter)?.label || "") : ""}
                    {escFilter.length > 0 ? " — " + escFilter.join(", ") : ""} — Temporada 2026
                  </div>
                  <div className="muted fs-11 mb-8">
                    {filteredGroups.length} torneios · {uniquePC(filteredT)} jogadores ·{" "}
                    {filteredT.filter(t => t._roundLabel !== "Total").reduce((a, t) => a + t.players.filter(p => !isDNS(p)).length, 0)} presenças
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
            {selectedGroupKey !== null && selectedGroup && (
              <div style={{ padding: "0 12px 12px" }}>
                {selectedGroup.isMulti && (
                  <div className="escalao-pills" style={{ gap: 3, flexWrap: "wrap", padding: "8px 0 0" }}>
                    {selectedGroup.entries.map((entry, ri) => {
                      const lbl = entry._roundLabel || ("R" + (ri + 1));
                      const isTotal = lbl === "Total";
                      const activeCount = entry.players.filter(p => !isDNS(p)).length;
                      return (
                        <button key={entry.tcode}
                          className={"tourn-tab tourn-tab-sm" + (roundIdx === ri ? " active" : "")}
                          onClick={() => setRoundIdx(ri)}
                          style={roundIdx === ri ? {} : isTotal
                            ? { background: "var(--bg-warn-strong)", color: "var(--color-warn-dark)", borderColor: "var(--bg-warn-strong)" }
                            : {}}>
                          {isTotal ? "📊" : "🏌️"} {lbl}
                          <span style={{ fontSize: 9, marginLeft: 3, opacity: 0.7 }}>({activeCount} jog)</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {curTournament && (
                  <div className="card card-scroll" style={{ marginTop: selectedGroup.isMulti ? 8 : 0 }}>
                    <div className="h-md fs-14">
                      {selectedGroup.isMulti
                        ? <>{curTournament._roundLabel === "Total" ? "📊 Acumulado" : "🏌️ " + curTournament._roundLabel} — {selectedGroup.campo}</>
                        : <>🏆 Scorecard — {selectedGroup.label}</>}
                    </div>
                    <div className="muted fs-11 mb-4">
                      T{curTournament.num} · 📍 {curTournament.campo} · 📅 {fmtDate(curTournament.date)}
                      {selectedGroup.isMulti && <> · {selectedGroup.totalRounds} rondas</>}
                      {" · "}{curTournament.players.filter(p => !isDNS(p) && !p._incomplete).length} jog
                      {curTournament._roundLabel === "Total" && curTournament.players.some(p => p._incomplete) && (
                        <> + {curTournament.players.filter(p => p._incomplete).length} inc</>
                      )}
                      {" · "}{curTournament.players[0]?.nholes || 18}h
                    </div>
                    {curTournament._roundLabel === "Total"
                      ? <TotalLeaderboard tournament={curTournament} playersDB={pdb} sdLookup={sdLookup} />
                      : <ScorecardLB tournament={curTournament} playersDB={pdb} />}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}

export default function DrivePage() {
  const [unlocked, setUnlocked] = useState(() => isCalUnlocked());
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return <DriveContent />;
}
