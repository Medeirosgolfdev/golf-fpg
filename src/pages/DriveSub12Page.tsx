/**
 * DriveSub12Page.tsx — Página agregadora Sub-12 DRIVE
 *
 * Lê os mesmos dados que a DrivePage (drive-data.json + aquapor-data.json + players.json + drive-sd-lookup.json)
 * e filtra todos os jogadores Sub-12 para apresentar:
 *  • Tabela resumo (jogadores × torneios)
 *  • Ranking por SD médio
 *  • Evolução ao longo da época (gráfico recharts)
 */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { SC, sdClassByHcp } from "../utils/scoreDisplay";
import { isCalUnlocked } from "../utils/authConstants";
import PasswordGate from "../ui/PasswordGate";
import LoadingState from "../ui/LoadingState";

/* ═══════════════════════════════════════════
   Types (mirroring DrivePage)
   ═══════════════════════════════════════════ */

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
  _incomplete?: boolean;
  _roundsPlayed?: number;
}
interface Tournament {
  name: string; ccode: string; tcode: string; date: string; campo: string; clube: string;
  series: "tour" | "challenge" | "aquapor"; region: string; escalao: string | null; num: number;
  playerCount: number; players: Player[]; rounds?: number;
  _multiGroup?: string; _roundLabel?: string; _totalRounds?: number;
}
interface DriveData {
  lastUpdated: string; source: string; totalTournaments: number; totalPlayers: number;
  totalScorecards: number; tournaments: Tournament[];
}
interface PlayersDB { [fed: string]: { escalao?: string; name?: string; club?: { short?: string }; region?: string; sex?: string; hcp?: number; dob?: string } }
type SDLookup = Record<string, number>;

/* ═══════════════════════════════════════════
   Data functions (same logic as DrivePage)
   ═══════════════════════════════════════════ */

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

function isDNS(p: Player): boolean {
  const g = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
  if (g != null && g >= 900) return true;
  if (String(p.pos) === "NS" && p.scores?.every(s => s === 0)) return true;
  return false;
}

/* ── Escalão lookup ── */
type EscLookup = Map<string, string>;

function buildEscLookup(playersDB: PlayersDB, allTournaments: Tournament[]): EscLookup {
  const m = new Map<string, string>();
  for (const [fed, info] of Object.entries(playersDB)) {
    if (info.escalao) {
      m.set(fed, info.escalao.startsWith("Sub") ? info.escalao.replace("-", " ") : info.escalao);
    }
  }
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

function resolveEsc(p: Player, escLookup: EscLookup): string {
  const fed = p.fed || p.fedCode;
  if (fed && escLookup.has(fed)) return escLookup.get(fed)!;
  return "";
}

function isSub12(esc: string): boolean {
  const e = esc.toLowerCase().replace(/-/g, " ");
  return e.includes("sub 12");
}

/* ── WHS Expected 9h SD ── */
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

/* ── AGS ── */
function calcAGS(scores: number[], parArr: number[], si: number[], cr: number, slope: number, hcp: number, nholes: number): number {
  if (!scores.length || !parArr.length || !si.length || scores.length < nholes) return scores.reduce((a, b) => a + b, 0);
  const parT = parArr.reduce((a, b) => a + b, 0);
  const ch = Math.round(hcp * (slope / 113) + (cr - parT));
  const siOrder = Array.from({ length: nholes }, (_, i) => i).sort((a, b) => si[a] - si[b]);
  const strokes = new Array(nholes).fill(0);
  let rem = Math.max(0, ch);
  while (rem > 0) { for (const idx of siOrder) { if (rem <= 0) break; strokes[idx]++; rem--; } }
  let adj = 0;
  for (let i = 0; i < nholes; i++) adj += Math.min(scores[i], parArr[i] + 2 + strokes[i]);
  return adj;
}

/* ── SD computation (returns value + source) ── */
function computeSDWithSource(p: Player, sdLookup: SDLookup): { sd: number | null; source: "fpg" | "ags" | "raw" | null } {
  if (isDNS(p)) return { sd: null, source: null };
  const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
  if (gross == null || isNaN(gross as number)) return { sd: null, source: null };
  const g = gross as number;
  const nh = p.nholes || p.scores?.length || 18;
  if (nh > 18) return { sd: null, source: null };

  const sid = String(p.scoreId);
  if (sdLookup[sid] != null) return { sd: sdLookup[sid], source: "fpg" };

  const is9 = nh <= 9;
  const parArr = p.par || [];
  const scores = p.scores || [];
  const si = p.si || [];

  if (p.courseRating && p.slope && p.hcpExact != null && si.length >= nh && scores.length >= nh && parArr.length >= nh) {
    const adjGross = calcAGS(scores, parArr, si, p.courseRating, p.slope, p.hcpExact, nh);
    const rawSD = (113 / p.slope) * (adjGross - p.courseRating);
    return { sd: is9 ? rawSD + expectedSD9(p.hcpExact) : rawSD, source: "ags" };
  }
  if (p.courseRating && p.slope) {
    const rawSD = (113 / p.slope) * (g - p.courseRating);
    if (is9 && p.hcpExact != null) return { sd: rawSD + expectedSD9(p.hcpExact), source: "raw" };
    if (!is9) return { sd: rawSD, source: "raw" };
  }
  return { sd: null, source: null };
}

/* ═══════════════════════════════════════════
   Aggregation
   ═══════════════════════════════════════════ */

interface TournResult {
  tournKey: string; tournName: string; tournShort: string;
  date: string; dateSort: number; campo: string; region: string;
  series: "tour" | "challenge" | "aquapor";
  gross: number; toPar: number; sd: number | null; sdSource: "fpg" | "ags" | "raw" | null;
  pos: number | string | null; totalPlayers: number;
}

interface Sub12Row {
  fed: string; name: string; club: string; region: string; sex: string; hcp: number | null;
  results: TournResult[];
  avgGross: number | null; avgSD: number | null; bestGross: number | null; tourneiosPlayed: number;
}

const numAvg = (nums: number[]): number | null => nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;

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
  if (parts.length === 3 && parts[2].length === 4) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime() || 0;
  return new Date(d).getTime() || 0;
}

function buildSub12Data(tournaments: Tournament[], playersDB: PlayersDB, sdLookup: SDLookup, escLookup: EscLookup): Sub12Row[] {
  // Skip "Total" combined entries to avoid double-counting
  const singleRound = tournaments.filter(t => !t._roundLabel || t._roundLabel !== "Total");

  const playerMap = new Map<string, Sub12Row>();

  for (const t of singleRound) {
    for (const p of t.players) {
      if (isDNS(p)) continue;
      const esc = resolveEsc(p, escLookup);
      if (!isSub12(esc)) continue;

      const fed = p.fed || p.fedCode || "";
      if (!fed) continue;

      const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
      if (gross == null || isNaN(gross as number)) continue;
      const g = gross as number;

      const parArr = p.par || [];
      const parT = p.parTotal || (parArr.length > 0 ? parArr.reduce((a, b) => a + b, 0) : 72);
      const tp = g - parT;
      const { sd, source: sdSource } = computeSDWithSource(p, sdLookup);

      const tournKey = t.tcode + "_" + t.date;

      if (!playerMap.has(fed)) {
        const dbInfo = playersDB[fed];
        playerMap.set(fed, {
          fed,
          name: p.name || dbInfo?.name || `Fed. ${fed}`,
          club: p.club || dbInfo?.club?.short || "",
          region: dbInfo?.region || t.region || "",
          sex: dbInfo?.sex || "",
          hcp: dbInfo?.hcp ?? p.hcpExact ?? null,
          results: [], avgGross: null, avgSD: null, bestGross: null, tourneiosPlayed: 0,
        });
      }

      const row = playerMap.get(fed)!;
      if (row.results.some(r => r.tournKey === tournKey)) continue;

      row.results.push({
        tournKey, tournName: t.name, tournShort: tournShort(t),
        date: t.date, dateSort: dateToSort(t.date),
        campo: t.campo || "", region: t.region, series: t.series,
        gross: g, toPar: tp, sd: sd != null ? Math.round(sd * 10) / 10 : null, sdSource,
        pos: p.pos, totalPlayers: t.playerCount,
      });
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

/* ═══════════════════════════════════════════
   UI Constants & Helpers
   ═══════════════════════════════════════════ */

const CHART_COLORS = ["#2563eb","#dc2626","#16a34a","#d97706","#7c3aed","#0891b2","#be185d","#65a30d","#c2410c","#6366f1","#0d9488","#ea580c"];
const SERIE_COLORS: Record<string, string> = { tour: "#059669", challenge: "#8b5cf6", aquapor: "#4338ca" };
const SERIE_LABELS: Record<string, string> = { tour: "Tour", challenge: "Challenge", aquapor: "AQUAPOR" };

const fmtTP = (v: number | null): string => v == null ? "–" : v === 0 ? "E" : v > 0 ? "+" + v : "" + v;
const shortDate = (d: string) => { if (!d) return ""; const parts = d.split("-"); return parts.length >= 3 ? parts[0] + "/" + parts[1] : d; };

/* ═══════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════ */

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card" style={{ flex: "1 1 120px", minWidth: 120, textAlign: "center", padding: "10px 8px" }}>
      <div className="muted fs-10" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || "var(--text)", marginTop: 2 }}>{value}</div>
      {sub && <div className="muted fs-10" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SdSpan({ sd, hcp }: { sd: number | null; hcp?: number | null }) {
  if (sd == null) return <span className="c-muted">–</span>;
  const cls = sdClassByHcp(sd, hcp ?? null);
  return <span className={"p p-sm p-" + cls} style={{ fontSize: 11 }}>{sd.toFixed(1)}</span>;
}

function ToParSpan({ tp }: { tp: number | null }) {
  if (tp == null) return <span className="c-muted">–</span>;
  const color = tp < 0 ? SC.danger : tp === 0 ? SC.good : undefined;
  return <span style={{ fontWeight: 700, fontSize: 11, color }}>{fmtTP(tp)}</span>;
}

/* ── Tabela Grid ── */
const STICKY_NAME_W = 170;
const STICKY_HCP_W = 48;
const STICKY_BG = "var(--bg-card)";
const STICKY_BG_HEAD = "var(--bg-topbar)";

const stickyBase = (left: number, isLast?: boolean): React.CSSProperties => ({
  position: "sticky", left, zIndex: 2, background: STICKY_BG,
  ...(isLast ? { borderRight: "2px solid var(--border)", boxShadow: "2px 0 4px rgba(0,0,0,0.06)" } : {}),
});
const stickyHeadBase = (left: number, isLast?: boolean): React.CSSProperties => ({
  position: "sticky", left, zIndex: 3, background: STICKY_BG_HEAD,
  ...(isLast ? { borderRight: "2px solid var(--border)", boxShadow: "2px 0 4px rgba(0,0,0,0.06)" } : {}),
});

function TournamentGrid({ rows, allTournaments, onPlayerClick }: {
  rows: Sub12Row[];
  allTournaments: { key: string; short: string; date: string; series: string }[];
  onPlayerClick: (fed: string) => void;
}) {
  const [sortKey, setSortKey] = useState<string>("avgSD");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "name": return a.name.localeCompare(b.name, "pt") * dir;
        case "hcp": return ((a.hcp ?? 999) - (b.hcp ?? 999)) * dir;
        case "avgSD": return ((a.avgSD ?? 999) - (b.avgSD ?? 999)) * dir;
        case "avgGross": return ((a.avgGross ?? 999) - (b.avgGross ?? 999)) * dir;
        case "played": return (b.tourneiosPlayed - a.tourneiosPlayed) * dir;
        default: {
          const rA = a.results.find(r => r.tournKey === sortKey)?.gross ?? 999;
          const rB = b.results.find(r => r.tournKey === sortKey)?.gross ?? 999;
          return (rA - rB) * dir;
        }
      }
    });
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };
  const arrow = (key: string) => sortKey === key ? <span style={{ marginLeft: 2, fontSize: 8 }}>{sortDir === "asc" ? "▲" : "▼"}</span> : null;

  return (
    <div style={{ overflowX: "auto", maxWidth: "100%", width: "100%", position: "relative" }}>
      <table className="tourn-draw" style={{ minWidth: STICKY_NAME_W + STICKY_HCP_W + 160 + allTournaments.length * 74, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: STICKY_NAME_W }} />
          <col style={{ width: STICKY_HCP_W }} />
          <col style={{ width: 32 }} />
          <col style={{ width: 52 }} />
          <col style={{ width: 52 }} />
          {allTournaments.map(t => <col key={t.key} style={{ width: 74 }} />)}
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...stickyHeadBase(0), minWidth: STICKY_NAME_W, width: STICKY_NAME_W, cursor: "pointer" }} onClick={() => toggleSort("name")}>Jogador{arrow("name")}</th>
            <th className="r" style={{ ...stickyHeadBase(STICKY_NAME_W, true), width: STICKY_HCP_W, minWidth: STICKY_HCP_W, cursor: "pointer" }} onClick={() => toggleSort("hcp")}>HCP{arrow("hcp")}</th>
            <th className="r" style={{ width: 28, cursor: "pointer" }} onClick={() => toggleSort("played")} title="Torneios">T{arrow("played")}</th>
            <th className="r" style={{ width: 52, cursor: "pointer" }} onClick={() => toggleSort("avgGross")}>Avg{arrow("avgGross")}</th>
            <th className="r" style={{ width: 52, cursor: "pointer" }} onClick={() => toggleSort("avgSD")}>SD̄{arrow("avgSD")}</th>
            {allTournaments.map(t => (
              <th key={t.key} className="r" style={{ width: 72, fontSize: 9, lineHeight: 1.2, padding: "6px 3px", cursor: "pointer" }}
                onClick={() => toggleSort(t.key)} title={t.date}>
                <div style={{ color: SERIE_COLORS[t.series] || "var(--text-3)", fontWeight: 800 }}>{t.short}{arrow(t.key)}</div>
                <div style={{ color: "var(--text-muted)", fontWeight: 400 }}>{shortDate(t.date)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, idx) => (
            <tr key={p.fed} className={p.sex === "F" ? "tourn-female-row" : ""} style={{ cursor: "pointer" }}
              onClick={() => onPlayerClick(p.fed)}>
              <td style={{ ...stickyBase(0) }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span className="fw-600" style={{ fontSize: 12, cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 2 }}
                    onClick={(e) => { e.stopPropagation(); window.open(`/jogadores/${p.fed}`, "_blank"); }}>
                    {p.name}
                  </span>
                  {p.sex === "F" && <span className="jog-sex-inline jog-sex-F">F</span>}
                </div>
                <div className="c-muted fs-9">{p.club} · {p.region}</div>
              </td>
              <td className="r tourn-mono fs-11" style={{ ...stickyBase(STICKY_NAME_W, true) }}>{p.hcp != null ? p.hcp.toFixed(1) : "–"}</td>
              <td className="r tourn-mono fw-700">{p.tourneiosPlayed}</td>
              <td className="r tourn-mono fs-11">{p.avgGross != null ? p.avgGross.toFixed(0) : "–"}</td>
              <td className="r"><SdSpan sd={p.avgSD} hcp={p.hcp} /></td>
              {allTournaments.map(t => {
                const res = p.results.find(r => r.tournKey === t.key);
                if (!res) return <td key={t.key} className="r c-muted fs-10">–</td>;
                return (
                  <td key={t.key} className="r" style={{ padding: "3px 3px" }}>
                    <div className="tourn-mono fw-700 fs-12">{res.gross}</div>
                    <div style={{ fontSize: 9, marginTop: 1 }}><ToParSpan tp={res.toPar} /></div>
                    {res.sdSource === "fpg" && res.sd != null && (
                      <div style={{ fontSize: 9, marginTop: 1, opacity: 0.85 }}><SdSpan sd={res.sd} hcp={p.hcp} /></div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={99} className="muted p-16">Nenhum jogador Sub-12 encontrado nos dados DRIVE</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ── Ranking ── */
function RankingView({ rows, onPlayerClick }: { rows: Sub12Row[]; onPlayerClick: (fed: string) => void }) {
  const ranked = [...rows].filter(p => p.avgSD != null && p.tourneiosPlayed >= 2).sort((a, b) => (a.avgSD ?? 999) - (b.avgSD ?? 999));
  const medals = ["🥇", "🥈", "🥉"];
  const oneTourney = rows.filter(p => p.tourneiosPlayed === 1);

  return (
    <div>
      {ranked.length === 0 ? (
        <div className="card"><div className="muted">Nenhum jogador com ≥2 torneios para gerar ranking</div></div>
      ) : (
        <div className="tourn-scroll">
          <table className="tourn-draw" style={{ fontSize: 12 }}>
            <thead><tr>
              <th className="r" style={{ width: 36 }}>#</th><th>Jogador</th><th>Clube</th>
              <th className="r">HCP</th><th className="r">T</th><th className="r">Avg Gross</th>
              <th className="r">Avg SD</th><th className="r">Melhor</th>
            </tr></thead>
            <tbody>
              {ranked.map((p, i) => (
                <tr key={p.fed} className={p.sex === "F" ? "tourn-female-row" : ""} style={{ cursor: "pointer" }} onClick={() => onPlayerClick(p.fed)}>
                  <td className="r" style={{ fontSize: 16 }}>{i < 3 ? medals[i] : <span className="tourn-mono fw-700">{i + 1}</span>}</td>
                  <td>
                    <span className="fw-700" style={{ cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 2 }}
                      onClick={(e) => { e.stopPropagation(); window.open(`/jogadores/${p.fed}`, "_blank"); }}>
                      {p.name}
                    </span>
                    {p.sex === "F" && <span className="jog-sex-inline jog-sex-F ml-4">F</span>}
                  </td>
                  <td className="c-muted fs-11">{p.club}</td>
                  <td className="r tourn-mono">{p.hcp != null ? p.hcp.toFixed(1) : "–"}</td>
                  <td className="r tourn-mono">{p.tourneiosPlayed}</td>
                  <td className="r tourn-mono">{p.avgGross?.toFixed(0) ?? "–"}</td>
                  <td className="r"><SdSpan sd={p.avgSD} hcp={p.hcp} /></td>
                  <td className="r tourn-mono fw-700" style={{ color: "var(--color-good-dark)" }}>{p.bestGross ?? "–"}</td>
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

/* ── Evolução (recharts) ── */
function EvolutionChart({ rows }: { rows: Sub12Row[] }) {
  const eligible = rows.filter(p => p.results.filter(r => r.sd != null).length >= 2);

  if (eligible.length === 0) {
    return <div className="card"><div className="h-xs">Evolução SD ao longo da época</div><div className="muted">Dados insuficientes (mínimo 2 torneios por jogador)</div></div>;
  }

  const top = [...eligible]
    .sort((a, b) => b.results.filter(r => r.sd != null).length - a.results.filter(r => r.sd != null).length)
    .slice(0, 10);

  const allDates = [...new Set(top.flatMap(p => p.results.filter(r => r.sd != null).map(r => r.date)))];
  allDates.sort((a, b) => dateToSort(a) - dateToSort(b));

  const chartData = allDates.map(d => {
    const point: Record<string, any> = { date: shortDate(d) };
    for (const p of top) {
      const res = p.results.find(r => r.date === d && r.sd != null);
      if (res) point[p.fed] = res.sd;
    }
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
            <Tooltip
              contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
              formatter={(value: number, name: string) => {
                const p = top.find(x => x.fed === name);
                return [value?.toFixed(1), p?.name || name];
              }}
            />
            <Legend formatter={(value: string) => {
              const p = top.find(x => x.fed === value);
              return <span style={{ fontSize: 10 }}>{p?.name || value}</span>;
            }} />
            <ReferenceLine y={36} stroke="var(--color-danger)" strokeDasharray="4 4" strokeWidth={1} />
            {top.map((p, i) => (
              <Line key={p.fed} type="monotone" dataKey={p.fed}
                stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2}
                dot={{ r: 3 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Detalhe jogador ── */
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
        <KpiCard label="Torneios" value={String(row.tourneiosPlayed)} />
        <KpiCard label="Avg Gross" value={row.avgGross?.toFixed(0) ?? "–"} />
        <KpiCard label="Avg SD" value={row.avgSD?.toFixed(1) ?? "–"} color={row.avgSD != null && row.avgSD <= 25 ? "var(--color-good)" : undefined} />
        <KpiCard label="Melhor" value={row.bestGross != null ? String(row.bestGross) : "–"} color="var(--color-good-dark)" />
      </div>
      <table className="tourn-draw" style={{ fontSize: 11 }}>
        <thead><tr><th>Data</th><th>Torneio</th><th>Campo</th><th className="r">Pos</th><th className="r">Gross</th><th className="r">±Par</th><th className="r">SD</th></tr></thead>
        <tbody>
          {row.results.map((r, i) => (
            <tr key={i}>
              <td className="tourn-mono fs-10">{r.date}</td>
              <td>
                <span className="fw-600">{r.tournName}</span>
                <span className="p p-sm ml-4" style={{ fontSize: 8, background: (SERIE_COLORS[r.series] || "#999") + "22", color: SERIE_COLORS[r.series], border: `1px solid ${SERIE_COLORS[r.series]}44` }}>
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

/* ═══════════════════════════════════════════
   Main
   ═══════════════════════════════════════════ */

type ViewTab = "grid" | "ranking" | "evolucao";
type SeriesTab = "tour" | "challenge" | "aquapor";

const SERIES_TABS: { key: SeriesTab; label: string; emoji: string; color: string; bg: string; holes: string }[] = [
  { key: "tour", label: "Tour", emoji: "🏌️", color: "#059669", bg: "#d1fae5", holes: "18h" },
  { key: "challenge", label: "Challenge", emoji: "⚡", color: "#7c3aed", bg: "#ede9fe", holes: "9h" },
  { key: "aquapor", label: "AQUAPOR", emoji: "💧", color: "#4338ca", bg: "#e0e7ff", holes: "18h" },
];

/** Filter rows to a specific series and recompute aggregates */
function filterBySeries(rows: Sub12Row[], series: SeriesTab): Sub12Row[] {
  return rows.map(p => {
    const fR = p.results.filter(r => r.series === series);
    if (fR.length === 0) return null;
    const fG = fR.map(r => r.gross);
    const fS = fR.filter(r => r.sd != null).map(r => r.sd!);
    return { ...p, results: fR, tourneiosPlayed: fR.length, avgGross: numAvg(fG), avgSD: numAvg(fS), bestGross: fG.length ? Math.min(...fG) : null };
  }).filter(Boolean) as Sub12Row[];
}

function Sub12Content() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sub12Data, setSub12Data] = useState<Sub12Row[]>([]);
  const [allTournKeys, setAllTournKeys] = useState<{ key: string; short: string; date: string; series: string }[]>([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [seriesTab, setSeriesTab] = useState<SeriesTab>("tour");
  const [viewTab, setViewTab] = useState<ViewTab>("grid");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [sexFilter, setSexFilter] = useState<string>("all");
  const [searchQ, setSearchQ] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Sub12Row | null>(null);

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
      }

      const playersDB = pp as PlayersDB;
      const sdLookup = sd as SDLookup;
      const escLookup = buildEscLookup(playersDB, driveData.tournaments);
      const rows = buildSub12Data(driveData.tournaments, playersDB, sdLookup, escLookup);
      setSub12Data(rows);
      setLastUpdated(driveData.lastUpdated || "");

      const tournMap = new Map<string, { key: string; short: string; date: string; series: string; dateSort: number }>();
      for (const row of rows) for (const r of row.results) {
        if (!tournMap.has(r.tournKey)) tournMap.set(r.tournKey, { key: r.tournKey, short: r.tournShort, date: r.date, series: r.series, dateSort: r.dateSort });
      }
      setAllTournKeys([...tournMap.values()].sort((a, b) => a.dateSort - b.dateSort));

      // Auto-select first series that has data
      const hasTour = rows.some(p => p.results.some(r => r.series === "tour"));
      const hasChall = rows.some(p => p.results.some(r => r.series === "challenge"));
      if (!hasTour && hasChall) setSeriesTab("challenge");

      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  /* ── Data filtered by active series ── */
  const seriesRows = useMemo(() => filterBySeries(sub12Data, seriesTab), [sub12Data, seriesTab]);
  const seriesTourns = useMemo(() => allTournKeys.filter(t => t.series === seriesTab), [allTournKeys, seriesTab]);

  /* ── Additional filters (region, sex, search) ── */
  const filtered = useMemo(() => {
    let list = seriesRows;
    if (regionFilter !== "all") list = list.filter(p => p.region.toLowerCase().includes(regionFilter.toLowerCase()));
    if (sexFilter !== "all") list = list.filter(p => p.sex === sexFilter);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q) || p.fed.includes(q));
    }
    return list;
  }, [seriesRows, regionFilter, sexFilter, searchQ]);

  const availableRegions = useMemo(() => [...new Set(seriesRows.map(p => p.region).filter(Boolean))].sort(), [seriesRows]);

  /* ── Series counts for tabs ── */
  const seriesCounts = useMemo(() => {
    const counts: Record<string, { players: number; tourns: number }> = {};
    for (const s of SERIES_TABS) {
      const rows = filterBySeries(sub12Data, s.key);
      const tourns = new Set(rows.flatMap(p => p.results.map(r => r.tournKey)));
      counts[s.key] = { players: rows.length, tourns: tourns.size };
    }
    return counts;
  }, [sub12Data]);

  /* ── KPIs ── */
  const totalPlayers = filtered.length;
  const totalRounds = filtered.reduce((s, p) => s + p.tourneiosPlayed, 0);
  const globalAvgSD = numAvg(filtered.filter(p => p.avgSD != null).map(p => p.avgSD!));
  const bestPerf = filtered.reduce<number | null>((best, p) => p.bestGross != null && (best == null || p.bestGross < best) ? p.bestGross : best, null);

  const handlePlayerClick = useCallback((fed: string) => {
    // Find in the series-filtered data so detail shows only current series results
    const p = seriesRows.find(x => x.fed === fed);
    if (p) setSelectedPlayer(prev => prev?.fed === fed ? null : p);
  }, [seriesRows]);

  const activeSeries = SERIES_TABS.find(s => s.key === seriesTab)!;

  if (loading) return <LoadingState />;
  if (error) return <div className="tourn-layout"><div className="notice-error" style={{ margin: 16 }}>Erro: {error}</div></div>;

  return (
    <div className="tourn-layout">
      <div className="toolbar">
        <div className="toolbar-left">
          <span className="tourn-toolbar-title">👶 Sub-12 DRIVE</span>
          <span className="tourn-toolbar-meta">Época 2025/26</span>
          <div className="tourn-toolbar-sep" />

          {/* Series tabs */}
          <div className="escalao-pills">
            {SERIES_TABS.map(s => {
              const c = seriesCounts[s.key];
              if (!c || c.players === 0) return null;
              const active = seriesTab === s.key;
              return (
                <button key={s.key} className={"tourn-tab tourn-tab-sm" + (active ? " active" : "")}
                  onClick={() => { setSeriesTab(s.key); setSelectedPlayer(null); }}
                  style={active ? {} : { background: s.bg, color: s.color, borderColor: s.bg }}>
                  {s.emoji} {s.label} <span style={{ fontWeight: 400, fontSize: 10 }}>({c.tourns}T · {c.players} jog · {s.holes})</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="toolbar-right">
          {lastUpdated && <span className="chip">📅 {lastUpdated}</span>}
        </div>
      </div>

      {/* View tabs + filters */}
      <div style={{ padding: "8px 12px 0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div className="escalao-pills">
          {([
            { key: "grid" as ViewTab, label: "📊 Tabela" },
            { key: "ranking" as ViewTab, label: "🏆 Ranking" },
            { key: "evolucao" as ViewTab, label: "📈 Evolução" },
          ]).map(t => (
            <button key={t.key} className={"tourn-tab tourn-tab-sm" + (viewTab === t.key ? " active" : "")} onClick={() => setViewTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="tourn-toolbar-sep" />
        {availableRegions.length > 1 && (
          <select className="select" value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
            <option value="all">Todas zonas</option>
            {availableRegions.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        )}
        <select className="select" value={sexFilter} onChange={e => setSexFilter(e.target.value)}>
          <option value="all">Sexo</option>
          <option value="M">Masc.</option>
          <option value="F">Fem.</option>
        </select>
        <input className="input" value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Nome, clube…" style={{ width: 130 }} />
        <span className="chip" style={{ marginLeft: "auto" }}>{totalPlayers} jog · {totalRounds} rondas</span>
      </div>

      {/* KPIs */}
      <div style={{ padding: "8px 12px 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <KpiCard label="Jogadores" value={String(totalPlayers)} sub={activeSeries.holes} />
        <KpiCard label="Rondas" value={String(totalRounds)} />
        <KpiCard label="SD Médio" value={globalAvgSD?.toFixed(1) ?? "–"} color={globalAvgSD != null && globalAvgSD <= 25 ? "var(--color-good)" : undefined} />
        <KpiCard label="Melhor Gross" value={bestPerf != null ? String(bestPerf) : "–"} color="var(--color-good-dark)" />
      </div>

      {/* Player detail */}
      {selectedPlayer && (
        <div style={{ padding: "12px 12px 0" }}>
          <PlayerDetail row={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
        </div>
      )}

      {/* Content */}
      <div style={{ padding: 12 }}>
        {viewTab === "grid" && <TournamentGrid rows={filtered} allTournaments={seriesTourns} onPlayerClick={handlePlayerClick} />}
        {viewTab === "ranking" && <RankingView rows={filtered} onPlayerClick={handlePlayerClick} />}
        {viewTab === "evolucao" && <EvolutionChart rows={filtered} />}
      </div>
    </div>
  );
}

export default function DriveSub12Page() {
  const [unlocked, setUnlocked] = useState(() => isCalUnlocked());
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return <Sub12Content />;
}
