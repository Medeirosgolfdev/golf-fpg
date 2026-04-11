/**
 * BJGTPage.tsx — BJGT Tournament Results
 * 3 tournaments · day sub-tabs (Acumulado, R1, R2, R3)
 */
import React, { useEffect, useState, useMemo } from "react";
import { cachedFetch } from "../data/fetchCache";
import { scClass, SC } from "../utils/scoreDisplay";
import { tpColor, isManuel, fmtTP } from "../ui/tournamentPrimitives";
import EvoBadge from "../ui/EvoBadge";
import ExtLink from "../ui/ExternalLink";
import SidebarSectionTitle from "../ui/SidebarSectionTitle";
import { gf } from "../utils/flagUtils";
const isM = (name: string) => isManuel({ name });
import { fmtToPar, fmtSign, fmtSignParen as fmtSub, fmtFieldInfo } from "../utils/format";
import { isCalUnlocked } from "../utils/authConstants";
import { MultiRoundLeaderboard } from "../ui/MultiRoundLeaderboard";
import { ScorecardLeaderboard, type ScorecardRow } from "../ui/ScorecardLeaderboard";
import type { MultiRoundRow, ExtraColumn } from "../ui/multiRoundTypes";
import PasswordGate from "../ui/PasswordGate";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../ui/Toolbar";
import DetailHeader from "../ui/DetailHeader";
import TabRow from "../ui/TabRow";
import { useMasterDetail } from "../hooks/useMasterDetail";
import LoadingState from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";

/* ── Types ── */
interface RoundData { day: number; scores: number[] | null; f9: number | null; b9: number | null; gross: number }
interface PlayerData { name: string; country: string; pos: number | null; result: number | null; total: number | null; rounds: RoundData[] }
interface TData { tournament: string; par: number[]; si?: number[]; parF9: number; parB9: number; parTotal: number; players: PlayerData[] }
interface TDef { id: string; label: string; shortLabel: string; data: TData; manuelName: string; year: number; category: string; roundDates?: string[]; series: "bjgt" | "eowagr" }
interface EvoEntry { otherTotal: number; delta: number; from: string; to: string; pill: string }

/* ── Data URLs ── */
const URLS = [
  /* ── BJGT (Villa Padierna) ── */
  { id: "2025_b89",   url: "/data/wjgc_2025_b89.json",        label: "2025 // Boys 8-9",    shortLabel: "2025 Boys 8-9",    manuelName: "",                          year: 2025, category: "Boys 8-9",    roundDates: undefined,                                   series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/28/leaderboard.htm" },
  { id: "2025_b1011", url: "/data/wjgc_2025_contest34.json",   label: "2025 // Boys 10-11",  shortLabel: "2025 Boys 10-11",  manuelName: "Manuel Medeiros",           year: 2025, category: "Boys 10-11", roundDates: undefined,                                   series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/34/leaderboard.htm" },
  { id: "2026_b1011", url: "/data/wjgc_2026_b1011_3r.json",   label: "2026 // Boys 10-11",  shortLabel: "2026 Boys 10-11",  manuelName: "Manuel Francisco Medeiros", year: 2026, category: "Boys 10-11", roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/73/leaderboard.htm", reverseRounds: true },
  { id: "2026_b1213", url: "/data/wjgc_2026_contest33.json",  label: "2026 // Boys 12-13",  shortLabel: "2026 Boys 12-13",  manuelName: "",                          year: 2026, category: "Boys 12-13", roundDates: ["25 Fev", "26 Fev", "27 Fev"] as string[], series: "bjgt" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2537/contest/33/leaderboard.htm", reverseRounds: true },
  /* ── EOWAGR (European Open) ── */
  /* ── EOWAGR (European Open) ── */
  /* ── EOWAGR (European Open) ── */
  { id: "eo25_b78",   url: "/data/eowagr25_contest121.json",  label: "2025 // Boys 7-8",    shortLabel: "2025 Boys 7-8",    manuelName: "",                          year: 2025, category: "Boys 7-8",   roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolfw/brjgt25/event/brjgt2512/contest/121/leaderboard.htm" },
  { id: "eo25_b910",  url: "/data/eowagr25_contest13.json",   label: "2025 // Boys 9-10",   shortLabel: "2025 Boys 9-10",   manuelName: "",                          year: 2025, category: "Boys 9-10",  roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2515/contest/13/leaderboard.htm" },
  { id: "eo25_b1112", url: "/data/eowagr25_scorecards.json",  label: "2025 // Boys 11-12",  shortLabel: "2025 Boys 11-12",  manuelName: "Manuel Medeiros",           year: 2025, category: "Boys 11-12", roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt2515/contest/121/leaderboard.htm" },
  { id: "eo25_b1314", url: "/data/eowagr25_contest77.json",   label: "2025 // Boys 13-14",  shortLabel: "2025 Boys 13-14",  manuelName: "",                          year: 2025, category: "Boys 13-14", roundDates: ["11 Ago", "12 Ago", "13 Ago"] as string[], series: "eowagr" as const, sourceUrl: "https://brjgt.bluegolfw/brjgt25/event/brjgt2512/contest/77/leaderboard.htm" },
];

/* ── Flags ── */

function loadT(raw: any, reverseRounds?: boolean): TData {
  const d = raw as TData;
  let players = d.players;
  if (reverseRounds) {
    players = players.map(p => ({ ...p, rounds: [...p.rounds].reverse() }));
  }
  const maxR = Math.max(...players.filter((p: any) => p.rounds?.length > 0).map((p: any) => p.rounds.length));
  players = players.filter((p: any) => p.total != null && p.rounds?.length > 0)
    .sort((a: any, b: any) => {
      const aFull = a.rounds.length === maxR ? 0 : 1;
      const bFull = b.rounds.length === maxR ? 0 : 1;
      if (aFull !== bFull) return aFull - bFull;
      return a.total - b.total;
    });
  let pos = 1;
  players.forEach((p: any, i: number) => {
    if (p.rounds.length < maxR) { p.pos = null; return; }
    if (i > 0 && p.total > players[i - 1]!.total && players[i - 1]!.rounds.length === maxR) pos = i + 1;
    p.pos = pos;
  });
  return { ...d, players };
}


/* ═══════════════════════════════════════════════════════════════
   ACCUMULATED LEADERBOARD — via MultiRoundLeaderboard
   ═══════════════════════════════════════════════════════════════ */
function AccLB({ data, evo, evoYear, roundDates }: { data: TData; evo?: Map<string, EvoEntry>; evoYear?: string; roundDates?: string[] }) {
  const { parTotal, players } = data;
  const nR = Math.max(...players.map(p => p.rounds.length), 0);
  const hasEvo = evo && evo.size > 0;

  const rows: MultiRoundRow[] = useMemo(() => players.map((p, idx) => {
    const incomplete = p.rounds.length < nR;
    const isPT = p.country.includes("Portugal");
    return {
      key: p.name + idx,
      name: p.name,
      countryFlag: gf(p.country),
      gross: p.total ?? 0,
      parTotal: parTotal * nR,
      toPar: p.result ?? (p.total != null ? p.total - parTotal * nR : null),
      pos: p.pos ?? 0,
      isIncomplete: incomplete,
      isWD: incomplete,
      isHighlighted: isM(p.name) || isPT,
      rounds: Array.from({ length: nR }, (_, i) => {
        const r = p.rounds[i];
        if (!r) return { gross: null, parPerRound: parTotal };
        return { gross: r.gross, parPerRound: parTotal };
      }),
    };
  }), [players, nR, parTotal]);

  /* Colunas de evolução */
  const extraCols: ExtraColumn<MultiRoundRow & { _pos?: number | null }>[] | undefined = hasEvo ? [
    {
      header: evoYear || "2025",
      className: "ta-c fs-11 fw-600",
      headerStyle: { width: 36, textAlign: "center", padding: "0 3px", borderLeft: "2px solid var(--border)" },
      cell: (row) => {
        const ev = evo!.get(row.name);
        return ev
          ? <span style={{ borderLeft: "2px solid var(--border)", padding: "0 3px", display: "inline-block" }}>{ev.otherTotal}</span>
          : <span className="c-muted" style={{ borderLeft: "2px solid var(--border)", padding: "0 3px", display: "inline-block" }}>–</span>;
      },
    },
    {
      header: "Δ",
      className: "ta-c fs-11 fw-700",
      headerStyle: { width: 34, textAlign: "center", padding: "0 3px" },
      cell: (row) => {
        const ev = evo!.get(row.name);
        if (!ev) return <span className="c-muted">–</span>;
        return <span style={{ color: ev.delta < 0 ? "var(--good-dark)" : ev.delta > 0 ? SC.danger : "var(--text-3)" }}>{ev.delta > 0 ? "+" : ""}{ev.delta}</span>;
      },
    },
    {
      header: "Percurso",
      className: "ta-c",
      headerStyle: { width: 140, textAlign: "center", padding: "0 4px" },
      cell: (row) => {
        const ev = evo!.get(row.name);
        return ev
          ? <EvoBadge pill={ev.pill} from={ev.from} to={ev.to} />
          : <EvoBadge pill="NEW" label={evoYear === "2026" ? "não voltou" : "novo"} />;
      },
    },
  ] : undefined;

  return (
    <MultiRoundLeaderboard
      rows={rows}
      nRounds={nR}
      sortable
      showCols={{ esc: false, fed: false, tee: false, club: false, hcp: false, roundStats: false }}
      roundDates={roundDates}
      extraColumns={extraCols}
      renderName={(row) => <span className="fw-700">{row.countryFlag} {row.name}</span>}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCORECARD TABLE — via ScorecardLeaderboard
   ═══════════════════════════════════════════════════════════════ */
function SCTable({ data, ri }: { data: TData; ri: number }) {
  const { par, si, parTotal, players } = data;
  const nh = par.length;
  const ws = players.filter(p => p.rounds[ri]?.scores);
  const sorted = [...ws].sort((a, b) => a.rounds[ri].gross - b.rounds[ri].gross);
  const [showSC, setShowSC] = React.useState(true);

  // Calcular posições
  let pos = 1;
  sorted.forEach((p, i) => { if (i > 0 && p.rounds[ri].gross > sorted[i - 1].rounds[ri].gross) pos = i + 1; (p as any)._dp = pos; });

  // Média de grosses
  const grosses = sorted.map(p => p.rounds[ri].gross).filter(g => g != null && !isNaN(g));
  const avg = grosses.length ? grosses.reduce((a, b) => a + b, 0) / grosses.length : 0;

  const rows: ScorecardRow[] = useMemo(() => {
    return sorted.map((p, idx) => {
      const r = p.rounds[ri];
      if (!r?.scores) return null;
      const tp = r.gross - parTotal;
      const dp = (p as any)._dp as number;
      const showP = idx === 0 || dp !== (sorted[idx - 1] as any)._dp;
      const isPT = p.country.includes("Portugal");
      const bg = isM(p.name) ? "var(--bg-success-subtle)" : isPT ? "rgba(var(--rgb-success), 0.06)" : undefined;

      // Contadores de score
      let birds = 0, pars = 0, bogs = 0;
      for (let i = 0; i < r.scores.length && i < par.length; i++) {
        const d = r.scores[i] - par[i];
        if (d <= -1) birds++; else if (d === 0) pars++; else bogs++;
      }

      return {
        key: p.name + idx,
        pos: showP ? dp : "",
        gross: r.gross,
        toPar: tp,
        scores: r.scores,
        rowBg: bg,
        stickyBg: bg || "var(--bg-card,#fff)",
        nameContent: <span className="fw-700">{gf(p.country)} {p.name.length > 22 ? p.name.substring(0, 20) + "…" : p.name}</span>,
        sortName: p.name,
        sortPos: dp,
        prefixCells: <td className="lb-fed" style={{ fontSize: 10 }}>{p.country || "–"}</td>,
        postScorecardCells: <>
          <td className="lb-bird">{birds || ""}</td>
          <td className="lb-par-stat">{pars || ""}</td>
          <td className="lb-bog">{bogs || ""}</td>
        </>,
      } as ScorecardRow;
    }).filter(Boolean) as ScorecardRow[];
  }, [sorted, ri, parTotal, par]);

  if (!rows.length) return <EmptyState size="sm" message="Scorecards buraco-a-buraco não disponíveis para esta ronda." />;

  return (
    <ScorecardLeaderboard
      par={par}
      si={si.length >= nh ? si : undefined}
      rows={rows}
      parLabelColSpan={2}
      postScorecardColCount={3}
      showScorecard={showSC}
      onToggleScorecard={() => setShowSC(v => !v)}
      sortable
      metaLine={<>
        {sorted.length} jogadores · Par {parTotal} · {nh}h · Média: {avg.toFixed(1)} ({fmtTP(Math.round(avg - parTotal))})
      </>}
      prefixHeaderCells={<th className="lb-fed">País</th>}
      postScorecardHeaderCells={<>
        <th className="lb-bird">🐦</th>
        <th className="lb-par-stat">Par</th>
        <th className="lb-bog">■</th>
      </>}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════
   HOLE DIFFICULTY
   ═══════════════════════════════════════════════════════════════ */
function HoleDiff({ data, ri, mn }: { data: TData; ri: number | "all"; mn?: string }) {
  const { par, parF9, parB9, parTotal, players } = data;
  const avgs = par.map((p, i) => {
    const sc: number[] = [];
    for (const pl of players) { if (ri === "all") { for (const r of pl.rounds) if (r.scores?.[i] != null) sc.push(r.scores[i]); } else { const r = pl.rounds[ri]; if (r?.scores?.[i] != null) sc.push(r.scores[i]); } }
    const avg = sc.length > 0 ? sc.reduce((a, b) => a + b, 0) / sc.length : p;
    return { avg, diff: avg - p, n: sc.length };
  });
  if (avgs.every(h => h.n === 0)) return null;
  const m = mn ? players.find(p => isM(p.name)) : null;
  const mr = m && ri !== "all" ? m.rounds[ri] : null;
  return (
    <div className="bjgt-chart-scroll">
      <table className="sc-table-modern" data-sc-table="1">
        <thead><tr>
          <th className="hole-header ta-left"  style={{ paddingLeft: 6, minWidth: 44 }}></th>
          {par.slice(0,9).map((_,i) => <th key={i} className="hole-header">{i+1}</th>)}
          <th className="hole-header col-out fs-10">Out</th>
          {par.slice(9).map((_,i) => <th key={i+9} className="hole-header">{i+10}</th>)}
          <th className="hole-header col-in fs-10">In</th>
          <th className="hole-header col-total">TOT</th>
        </tr></thead>
        <tbody>
          <tr className="sep-row"><td className="row-label par-label">Par</td>
            {par.slice(0,9).map((p,i) => <td key={i}>{p}</td>)}<td className="col-out fw-600">{parF9}</td>
            {par.slice(9).map((p,i) => <td key={i+9}>{p}</td>)}<td className="col-in fw-600">{parB9}</td><td className="col-total">{parTotal}</td></tr>
          <tr><td className="row-label fw-700">Média</td>
            {avgs.map((h,i) => <React.Fragment key={i}><td className="fw-600" style={{ color: h.diff > 0.7 ? SC.danger : h.diff < 0.2 ? SC.good : "var(--text-2)" }}>{h.avg.toFixed(1)}</td>{i === 8 && <td className="col-out"></td>}</React.Fragment>)}
            <td className="col-in"></td><td className="col-total fw-700">{avgs.reduce((a,h) => a + h.avg, 0).toFixed(1)}</td></tr>
          <tr className="meta-row sep-row"><td className="row-label c-muted fs-10">vs Par</td>
            {avgs.map((h,i) => <React.Fragment key={i}><td className="fs-10 fw-600" style={{ color: h.diff > 0.7 ? SC.danger : h.diff < 0.2 ? SC.good : "var(--text-muted)" }}>{fmtSign(h.diff, 1)}</td>{i === 8 && <td className="col-out"></td>}</React.Fragment>)}
            <td className="col-in"></td><td className="col-total"></td></tr>
          {mr?.scores && <tr style={{ background: "var(--bg-success-subtle)" }}><td className="row-label fw-700">🇵🇹 Manuel</td>
            {mr.scores.slice(0,9).map((sc,i) => <td key={i}><span className={`sc-score ${scClass(sc, par[i])}`}>{sc}</span></td>)}
            <td className="col-out fw-700">{mr.f9}<span className={`sc-topar ${(mr.f9!-parF9)<0?"sc-under":(mr.f9!-parF9)>0?"sc-over":""}`}>{fmtSign(mr.f9!-parF9)}</span></td>
            {mr.scores.slice(9).map((sc,i) => <td key={i+9}><span className={`sc-score ${scClass(sc, par[9+i])}`}>{sc}</span></td>)}
            <td className="col-in fw-700">{mr.b9}<span className={`sc-topar ${(mr.b9!-parB9)<0?"sc-under":(mr.b9!-parB9)>0?"sc-over":""}`}>{fmtSign(mr.b9!-parB9)}</span></td>
            <td className="col-total fw-700">{mr.gross}<span className={`sc-topar ${(mr.gross-parTotal)<0?"sc-under":(mr.gross-parTotal)>0?"sc-over":""}`}>{fmtSign(mr.gross-parTotal)}</span></td>
          </tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MANUEL DAY ANALYSIS
   ═══════════════════════════════════════════════════════════════ */
function ManuelDay({ data, ri }: { data: TData; ri: number }) {
  const { par, parF9, parB9, parTotal, players } = data;
  const manuel = players.find(p => isM(p.name));
  if (!manuel) return null;
  const r = manuel.rounds[ri]; if (!r?.scores) return null;
  const prevR = ri > 0 ? manuel.rounds[ri - 1] : null;

  const holes = r.scores.map((sc, i) => ({ h: i+1, par: par[i], gross: sc, diff: sc - par[i], prev: prevR?.scores?.[i] ?? null }));
  const eagles = holes.filter(h => h.diff <= -2), birdies = holes.filter(h => h.diff === -1);
  const pars = holes.filter(h => h.diff === 0), bogeys = holes.filter(h => h.diff === 1);
  const doubles = holes.filter(h => h.diff === 2), worse = holes.filter(h => h.diff >= 3);

  const byPar = (t: number) => { const h = holes.filter(x => x.par === t); return { n: h.length, total: h.reduce((s,x) => s+x.diff, 0), avg: h.length ? h.reduce((s,x) => s+x.diff, 0)/h.length : 0, scores: h.map(x => x.gross) }; };
  const p3 = byPar(3), p4 = byPar(4), p5 = byPar(5);

  const vsPrev = prevR?.scores ? holes.map(h => ({ ...h, delta: h.prev != null ? h.gross - h.prev : 0 })) : null;
  const worseVP = vsPrev?.filter(h => h.delta > 0).sort((a,b) => b.delta - a.delta) ?? [];
  const betterVP = vsPrev?.filter(h => h.delta < 0).sort((a,b) => a.delta - b.delta) ?? [];
  const fieldAvg = players.filter(p => p.rounds[ri]).reduce((s,p) => s + p.rounds[ri].gross, 0) / players.filter(p => p.rounds[ri]).length;

  return (
    <div className="card">
      <div className="h-md fs-14">🇵🇹 Análise Manuel — R{ri + 1}</div>
      <div className="muted fs-10 mb-8">Gross: {r.gross} ({fmtToPar(r.gross-parTotal)}) · F9: {r.f9} {fmtSub(r.f9!-parF9)} · B9: {r.b9} {fmtSub(r.b9!-parB9)} · Média field: {fieldAvg.toFixed(1)}</div>
      <div className="grid-auto-fill mb-8" style={{ gap: 6 }}>
        {eagles.length > 0 && <div className="card-detail br-default" style={{ padding: "4px 8px" }}><span className="fw-800" style={{ color: SC.good }}>🦅 {eagles.length}</span><span className="fs-10 c-text-3"> {eagles.map(h => "H"+h.h).join(", ")}</span></div>}
        <div className="card-detail br-default" style={{ padding: "4px 8px" }}><span className="fw-800" style={{ color: SC.good }}>🐦 {birdies.length}</span><span className="fs-10 c-text-3"> {birdies.map(h => "H"+h.h).join(", ")}</span></div>
        <div className="card-detail br-default" style={{ padding: "4px 8px" }}><span className="fw-800 c-text-2">⛳ {pars.length} pars</span></div>
        <div className="card-detail br-default" style={{ padding: "4px 8px" }}><span className="fw-800 c-text-2">📦 {bogeys.length}</span><span className="fs-10 c-text-3"> {bogeys.map(h => "H"+h.h).join(", ")}</span></div>
        {doubles.length > 0 && <div className="card-detail br-default" style={{ padding: "4px 8px" }}><span className="fw-800 c-warn-dark">💥 {doubles.length} dbl</span><span className="fs-10 c-text-3"> {doubles.map(h => "H"+h.h).join(", ")}</span></div>}
        {worse.length > 0 && <div className="card-detail br-default" style={{ padding: "4px 8px" }}><span className="fw-800 c-warn-dark">🔥 {worse.length} triple+</span><span className="fs-10 c-text-3"> {worse.map(h => "H"+h.h+"(+"+h.diff+")").join(", ")}</span></div>}
      </div>
      <div className="muted fs-10 mb-4 fw-700">Performance por tipo de buraco</div>
      <div className="grid-auto-fill mb-8" style={{ gap: 6 }}>
        {[{ label: "Par 3", d: p3 },{ label: "Par 4", d: p4 },{ label: "Par 5", d: p5 }].map(({ label, d }) => (
          <div key={label} className="card-detail br-default" style={{ padding: "4px 8px" }}>
            <div className="fw-700 fs-11">{label} ({d.n})</div>
            <div className="fs-10">{d.scores.join(", ")} → <span className="fw-700" style={{ color: d.total < 0 ? SC.good : d.total > 0 ? SC.danger : undefined }}>{d.total > 0 ? "+"+d.total : d.total === 0 ? "E" : d.total}</span><span className="c-text-3"> (avg {d.avg > 0 ? "+" : ""}{d.avg.toFixed(2)})</span></div>
          </div>
        ))}
      </div>
      {prevR?.scores && vsPrev && <>
        <div className="muted fs-10 mb-4 fw-700">vs R{ri} (anterior: {prevR.gross})</div>
        <div className="gap-12 flex-wrap" style={{ display: "flex" }}>
          {worseVP.length > 0 && <div className="fs-10"><span className="fw-700 c-warn-dark">Pior (+{worseVP.reduce((s,h) => s+h.delta, 0)}):</span> {worseVP.map(h => `H${h.h} ${h.prev}→${h.gross}`).join(", ")}</div>}
          {betterVP.length > 0 && <div className="fs-10"><span className="fw-700" style={{ color: SC.good }}>Melhor ({betterVP.reduce((s,h) => s+h.delta, 0)}):</span> {betterVP.map(h => `H${h.h} ${h.prev}→${h.gross}`).join(", ")}</div>}
        </div>
      </>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FIELD STATS SUMMARY
   ═══════════════════════════════════════════════════════════════ */
function FStats({ data, ri }: { data: TData; ri: number | "all" }) {
  const { parTotal, players } = data;
  const nR = Math.max(...players.map(p => p.rounds.length), 0);
  const fullPlayers = players.filter(p => p.rounds.length === nR);
  const nSC = ri === "all" ? players.filter(p => p.rounds.some(r => r.scores)).length : players.filter(p => p.rounds[ri as number]?.scores).length;
  if (ri === "all") {
    const avg = fullPlayers.reduce((s,p) => s + p.total!, 0) / fullPlayers.length;
    return <div className="muted fs-10 mb-8">{fullPlayers.length} jogadores ({nR} rondas){players.length > fullPlayers.length ? ` + ${players.length - fullPlayers.length} WD` : ""} · Par {parTotal} · Média: {avg.toFixed(1)} ({fmtToPar(Math.round(avg - parTotal * nR))}) · Líder: {fullPlayers[0]?.name} ({fullPlayers[0]?.total}){nSC < players.length && ` · ${nSC} com scorecard`}</div>;
  }
  const scores = players.filter(p => p.rounds[ri as number]).map(p => p.rounds[ri as number].gross);
  const avg = scores.reduce((s,v) => s+v, 0) / scores.length;
  return <div className="muted fs-10 mb-8">{scores.length} jogadores · Par {parTotal} · Média R{(ri as number)+1}: {avg.toFixed(1)} ({fmtToPar(Math.round(avg - parTotal))}){nSC < scores.length && ` · ${nSC} com scorecard`}</div>;
}

/* ═══════════════════════════════════════════════════════════════
   TOURNAMENT VIEW — day tabs
   ═══════════════════════════════════════════════════════════════ */
function TournView({ def, evo, evoYear }: { def: TDef; evo?: Map<string, EvoEntry>; evoYear?: string }) {
  const { data, manuelName } = def;
  const nR = Math.max(...data.players.map(p => p.rounds.length), 0);
  const [dt, setDt] = useState<number | "all">("all");
  const rLabel = (i: number) => def.roundDates?.[i] ? `R${i + 1} · ${def.roundDates[i]}` : `R${i + 1}`;
  return (
    <div>
      <TabRow tabs={[{ key: "all" as string|number, label: "Acumulado" }, ...Array.from({ length: nR }, (_, i) => ({ key: i as string|number, label: rLabel(i) }))]} active={dt} onChange={setDt} />
      {dt === "all" && <>
        <div className="card"><div className="h-md fs-14">🏆 Leaderboard — {def.label}</div><FStats data={data} ri="all" /><AccLB data={data} evo={evo} evoYear={evoYear} roundDates={def.roundDates} /></div>
        <div className="card"><div className="h-md fs-14">📊 Dificuldade por Buraco — Todas as rondas</div><FStats data={data} ri="all" /><HoleDiff data={data} ri="all" mn={manuelName} /></div>
      </>}
      {typeof dt === "number" && <>
        <div className="card"><div className="h-md fs-14">🏆 {rLabel(dt)} — Scorecards</div><FStats data={data} ri={dt} /><SCTable data={data} ri={dt} /></div>
        <div className="card"><div className="h-md fs-14">📊 Dificuldade por Buraco — {rLabel(dt)}</div><HoleDiff data={data} ri={dt} mn={manuelName} /></div>
        {manuelName && <ManuelDay data={data} ri={dt} />}
      </>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */
function buildEvo(cur: TDef, all: (TDef | null)[]): { evoMap?: Map<string, EvoEntry>; evoYear?: string; manuelEvo?: EvoEntry } {
  let evoMap: Map<string, EvoEntry> | undefined;
  let evoYear: string | undefined;
  let manuelEvo: EvoEntry | undefined;

  if (cur.year === 2026) {
    evoYear = "2025";
    const prev25 = all.filter(t => t && t.year === 2025) as TDef[];
    if (prev25.length) {
      const all25Players = prev25.flatMap(t => t.data.players.map(p => ({ ...p, cat: t.category })));
      evoMap = new Map();
      for (const p26 of cur.data.players) {
        if (!p26.total) continue;
        const match = all25Players.find(p25 => {
          const n25 = p25.name.toLowerCase().replace(/\s+/g, " ");
          const n26 = p26.name.toLowerCase().replace(/\s+/g, " ");
          return n25 === n26 || (n25.includes(n26.split(" ")[0]) && n25.includes(n26.split(" ").slice(-1)[0]));
        });
        if (!match || !match.total) continue;
        if (match.rounds.length !== p26.rounds.length) continue;
        const entry: EvoEntry = { otherTotal: match.total, delta: p26.total - match.total, from: match.cat, to: cur.category, pill: match.cat === cur.category ? "STAY" : "UP" };
        evoMap.set(p26.name, entry);
        if (isM(p26.name)) manuelEvo = entry;
      }
      if (!evoMap.size) evoMap = undefined;
    }
  } else if (cur.year === 2025) {
    evoYear = "2026";
    const next26 = all.filter(t => t && t.year === 2026) as TDef[];
    if (next26.length) {
      const all26Players = next26.flatMap(t => t.data.players.map(p => ({ ...p, cat: t.category })));
      evoMap = new Map();
      for (const p25 of cur.data.players) {
        if (!p25.total) continue;
        const match = all26Players.find(p26 => {
          const n25 = p25.name.toLowerCase().replace(/\s+/g, " ");
          const n26 = p26.name.toLowerCase().replace(/\s+/g, " ");
          return n25 === n26 || (n26.includes(n25.split(" ")[0]) && n26.includes(n25.split(" ").slice(-1)[0]));
        });
        if (!match || !match.total) continue;
        if (match.rounds.length !== p25.rounds.length) continue;
        const entry: EvoEntry = { otherTotal: match.total, delta: match.total - p25.total, from: cur.category, to: match.cat, pill: cur.category === match.cat ? "STAY" : "UP" };
        evoMap.set(p25.name, entry);
        if (isM(p25.name)) manuelEvo = entry;
      }
      if (!evoMap.size) evoMap = undefined;
    }
  }
  return { evoMap, evoYear, manuelEvo };
}

function Content() {
  const [ti, setTi] = useState(2);
  const [all, setAll] = useState<(TDef | null)[]>(new Array(URLS.length).fill(null));
  const [loading, setLoading] = useState(true);
    const md = useMasterDetail();
  useEffect(() => {
    Promise.all(URLS.map(async (m) => {
      try { const res = await cachedFetch(m.url); if (!res.ok) return null; const raw = await res.json();
        return { id: m.id, label: m.label, shortLabel: m.shortLabel, data: loadT(raw, (m as any).reverseRounds), manuelName: m.manuelName, year: m.year, category: m.category, roundDates: m.roundDates, series: m.series } as TDef;
      } catch { return null; }
    })).then(r => { setAll(r); setLoading(false); });
  }, []);

  const cur = all[ti];
  if (loading) return <LoadingState />;

  const { evoMap, evoYear, manuelEvo } = cur ? buildEvo(cur, all) : {};

  return (
    <div className="tourn-layout">

      {/* Toolbar */}
      <Toolbar>
                <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />
        {cur?.series === "eowagr"
          ? <ToolbarTitle>🌍 European Open</ToolbarTitle>
          : <ToolbarTitle>🏌️ WJGC</ToolbarTitle>}
        {cur && <ToolbarMeta>{
          cur.series === "eowagr"
            ? "📍 Le Touquet GC — La Forêt"
            : cur.category === "Boys 12-13"
              ? "📍 Villa Padierna — Alferini"
              : "📍 Villa Padierna — Flamingos"
        }</ToolbarMeta>}
        {cur && (() => {
          const nR = Math.max(...cur.data.players.map(p => p.rounds.length));
          return <span className="chip ml-auto" >{fmtFieldInfo(cur.data.players.filter(p => p.rounds.length === nR).length, nR, cur.category)}</span>;
        })()}
      </Toolbar>

      {/* Master-detail */}
      <div className="master-detail">

        {/* Sidebar */}
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          {(["bjgt", "eowagr"] as const).map(series => {
            const seriesUrls = URLS.filter(u => u.series === series);
            if (!seriesUrls.length) return null;
            const seriesYears = [...new Set(seriesUrls.map(u => u.year))].sort();
            const isEowagr = series === "eowagr";
            return (
              <React.Fragment key={series}>
                <SidebarSectionTitle dark color={isEowagr ? "var(--color-eowagr-dark)" : undefined} textColor={isEowagr ? "var(--color-eowagr-text)" : undefined} borderColor={isEowagr ? "var(--color-warn-vivid)" : undefined} letterSpacing={isEowagr ? "0.08em" : undefined}>
                  {isEowagr ? "🌍 European Open" : "🏌️ World Junior Golf Championship"}
                </SidebarSectionTitle>
                {seriesYears.map(year => (
                  <React.Fragment key={year}>
                    <div className="sidebar-year-label" style={{
                      padding: "2px 10px",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      color: isEowagr ? "var(--color-eowagr-text)" : "#ffffff",
                      textTransform: "uppercase",
                      borderLeft: "none",
                      marginTop: 4,
                      background: isEowagr ? "var(--color-eowagr-mid)" : "var(--color-bjgt-mid)",
                    }}>{year}</div>
                    {seriesUrls.filter(u => u.year === year).map((u) => {
                      const idx = URLS.indexOf(u);
                      const t = all[idx];
                      const nR = t ? Math.max(...t.data.players.map(p => p.rounds.length), 0) : 0;
                      const nP = t ? t.data.players.filter(p => p.rounds.length === nR).length : 0;
                      return (
                        <button key={u.id}
                          className={`course-item ${ti === idx ? "active" : ""}`}
                          style={isEowagr && ti === idx ? { borderLeft: "3px solid var(--color-warn-vivid)" } : isEowagr ? { borderLeft: "3px solid transparent" } : {}}
                          onClick={() => { setTi(idx); md.onSelect(); }}>
                          <div className="course-item-name">{u.category}</div>
                          {t && <div className="course-item-meta">{nP} jog · {nR}R</div>}
                          <ExtLink href={u.sourceUrl} className="tourn-ext-link mt-4" 
                            onClick={e => e.stopPropagation()}>
                            🔗 Leaderboard oficial
                          </ExtLink>
                        </button>
                      );
                    })}
                  </React.Fragment>
                ))}
              </React.Fragment>
            );
          })}
        </div>

        {/* Detail */}
        <div className="course-detail" ref={md.detailRef}>
          {cur ? (<>
            <DetailHeader
              title={cur.label}
              sub={<><span className="muted">{cur.series === "eowagr" ? "📍 Le Touquet GC — La Forêt" : cur.category === "Boys 12-13" ? "📍 Villa Padierna — Alferini" : "📍 Villa Padierna — Flamingos"}</span><ExtLink href={URLS[ti].sourceUrl} className="tourn-ext-link ml-8" >🔗 Leaderboard oficial</ExtLink></>}
            />
            <TournView def={cur} evo={evoMap} evoYear={evoYear} />
            {manuelEvo && cur.year === 2026 && (
              <div className="card" style={{ background: "var(--bg-success-subtle)", border: "1px solid var(--good)" }}>
                <div className="h-md fs-14">🇵🇹 Manuel — Evolução WJGC</div>
                <div className="gap-16 flex-wrap" style={{ display: "flex", alignItems: "center" }}>
                  <div className="ta-c" style={{ flex: "1 1 100px" }}>
                    <div className="muted fs-10">2025 ({manuelEvo.from})</div>
                    <div className="fw-900" style={{ fontSize: 24 }}>{manuelEvo.otherTotal}</div>
                  </div>
                  <div style={{ fontSize: 24, color: "var(--good-dark)" }}>→</div>
                  <div className="ta-c" style={{ flex: "1 1 100px" }}>
                    <div className="muted fs-10">2026 ({manuelEvo.to})</div>
                    <div className="fw-900" style={{ fontSize: 24, color: manuelEvo.delta < 0 ? "var(--good-dark)" : "var(--text-3)" }}>{manuelEvo.otherTotal + manuelEvo.delta}</div>
                  </div>
                  <div className="ta-c" style={{ flex: "1 1 80px" }}>
                    <div className="muted fs-10">Δ</div>
                    <div className="fw-900" style={{ fontSize: 24, color: manuelEvo.delta < 0 ? "var(--good-dark)" : SC.danger }}>{manuelEvo.delta > 0 ? "+" : ""}{manuelEvo.delta}</div>
                    <div className="muted fs-10">pancadas (3R)</div>
                  </div>
                </div>
              </div>
            )}
          </>) : <div className="center-msg muted">Dados não disponíveis</div>}
        </div>

      </div>
    </div>
  );
}

export default function BJGTPage() {
  const [unlocked, setUnlocked] = useState(() => isCalUnlocked());
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return <Content />;
}
