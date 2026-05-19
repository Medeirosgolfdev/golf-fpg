/**
 * EnglandGolfPage.tsx -- England Golf Tournament Results
 *
 * Duplicacao da BJGTPage adaptada para England Golf (GolfGenius).
 * Em vez de URLs hardcoded, carrega `england-golf-catalog.json` em runtime
 * e constroi as entradas TDef dinamicamente. Cada catalogo entry vira UM
 * (ou mais, multi-divisao) TDef apontando para `/data/england_{slug}.json`
 * (ou `_div1`, `_div2`, etc.).
 */
import React, { useEffect, useState, useMemo } from "react";
import { cachedFetchJson } from "../data/fetchCache";
import { scClass, SC } from "../utils/scoreDisplay";
import { isManuelByName as isM } from "../constants/manuel";
import EvoBadge from "../ui/EvoBadge";
import ExtLink from "../ui/ExternalLink";
import SidebarSectionTitle from "../ui/SidebarSectionTitle";
import { gf } from "../utils/flagUtils";
import { fmtToPar, fmtSign, fmtSignParen as fmtSub, fmtFieldInfo } from "../utils/format";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import type { MultiRoundRow, ExtraColumn } from "../ui/multiRoundTypes";
import { type Tournament as FPGTournament, type Player as FPGPlayer, type RoundScore as FPGRoundScore, type ScorecardOptions } from "./FPGPage";
import { IntlTournView } from "../ui/IntlTournView";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarMeta } from "../ui/Toolbar";
import { DataSourcesChip, DataSourcesProvider, type DataSource } from "../ui/DataSources";
import DetailHeader from "../ui/DetailHeader";
import { useMasterDetail } from "../hooks/useMasterDetail";
import LoadingState from "../ui/LoadingState";
import Counter from "../ui/Counter";
import { useKidsLinkMap } from "../hooks/useKidsLinkMap";
import { KidsLinkCtx } from "../ui/KidsLink";
import { RoundPill, ManuelPill } from "../ui/PillBadge";
import type { EvoEntry } from "../hooks/useEvoComparison";

/* ── Types ── */
interface RoundData { day: number; scores: number[] | null; f9: number | null; b9: number | null; gross: number }
interface PlayerData { name: string; country: string; pos: number | null; result: number | null; total: number | null; rounds: RoundData[] }
interface TData { tournament: string; par: number[]; si?: number[]; meters?: number[]; tee?: string; course?: string; parF9: number; parB9: number; parTotal: number; metersTotal?: number; players: PlayerData[] }
interface TDef { id: string; label: string; shortLabel: string; data: TData; manuelName: string; year: number; category: string; roundDates?: string[]; series: "england" }

/* ── Data URLs ── */
/* NOTA: nomes dos ficheiros WJGC actualizados após re-scrape (2026-05-14):
 *   wjgc_2025_contest34   → wjgc_2025_b1011
 *   wjgc_2026_b1011_3r    → wjgc_2026_b1011
 *   wjgc_2026_contest33   → wjgc_2026_b1213
 * `reverseRounds: true` REMOVIDO — o novo scrape-bluegolf.js ordena as rondas
 * pelo label correctamente, deixando de ser necessária inversão manual. */
interface CatalogEntry {
  year: number;
  section: string;
  slug: string;
  title: string;
  gender?: "M" | "F" | "Mixed";
  ageGroup?: string;
  gg_base?: string;
  gg_page: string | null;
  gg_league?: string | null;
}
interface Catalog {
  generated_at?: string;
  tournaments: CatalogEntry[];
}

/**
 * URL canonico do torneio no GolfGenius (para o link "Leaderboard oficial").
 */
function ggUrl(t: CatalogEntry): string {
  const base = t.gg_base?.replace(/\/$/, "") || "https://www.golfgenius.com";
  return `${base}/pages/${t.gg_page}`;
}

/**
 * Constroi as entries de URLS a partir do catalogo. Cada torneio gera 1
 * candidato `england_{slug}.json`. Se houver multi-divisao, o scraper gera
 * `_div1`, `_div2`... -- carregamos ate o primeiro 404 contiguo.
 *
 * Aqui apenas geramos a entrada com slug base; o loader trata de tentar
 * tambem as variantes _div1/_div2.
 */
type UrlEntry = {
  id: string;
  url: string;
  label: string;
  shortLabel: string;
  manuelName: string;
  year: number;
  category: string;
  roundDates?: string[];
  series: "england";
  sourceUrl: string;
  catalogEntry: CatalogEntry;
};

function buildUrlsFromCatalog(catalog: Catalog): UrlEntry[] {
  const out: UrlEntry[] = [];
  for (const t of catalog.tournaments) {
    if (!t.gg_page) continue;
    out.push({
      id: `${t.year}_${t.slug}`,
      url: `/data/england_${t.slug}.json`,
      label: `${t.year} // ${t.title}`,
      shortLabel: t.title,
      manuelName: "",
      year: t.year,
      category: t.ageGroup || t.section || "",
      roundDates: undefined,
      series: "england",
      sourceUrl: ggUrl(t),
      catalogEntry: t,
    });
  }
  // Ordenar: ano desc, slug asc
  out.sort((a, b) => (b.year - a.year) || a.label.localeCompare(b.label));
  return out;
}


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
    const prev = players[i - 1];
    if (i > 0 && p.total != null && prev != null && prev.total != null && p.total > prev.total && prev.rounds.length === maxR) pos = i + 1;
    p.pos = pos;
  });
  return { ...d, players };
}


/* ═══════════════════════════════════════════════════════════════
   ADAPTADOR TData → FPGTournament (padrão DORALPage)
   ═══════════════════════════════════════════════════════════════ */
function tDataToTournament(data: TData, def: TDef): FPGTournament {
  const { par, si, meters, parTotal, players } = data;
  /* `tee` pode vir vazio do scraper (detectCourseInfo nao encontrou parens "(Black)" etc.).
     Fallback: usar `course` (nome do campo) ou "Tee" para que ScorecardLB consiga
     renderizar a linha de metros (requer teeName nao vazio). */
  const teeName = data.tee || data.course || "Tee";
  const nR = Math.max(...players.map(p => p.rounds.length), 0);

  /* Cut detection: feito centralmente em expandMultiRound (data layer).
     Aqui apenas convertemos cada PlayerData -> FPGPlayer, mantendo o
     `_roundsPlayed` por jogador. O _cut/_wd/_incomplete e atribuido depois
     pelo expandMultiRound baseado na distribuicao de rondas. */
  const fpgPlayers: FPGPlayer[] = players
    .filter(p => p.rounds.length > 0)
    .map(p => {
      const roundScores: FPGRoundScore[] = p.rounds.map((r, ri) => ({
        round: ri + 1,
        gross: r.gross,
        scores: r.scores ?? [],
        pars: par,
        si: si && si.length >= par.length ? si : [],
        meters: meters && meters.length >= par.length ? meters : [],
        teeName,
      }));
      const playedR = p.rounds.length;
      // toPar vs par das rondas EFECTIVAMENTE jogadas.
      // IGNORAR p.result -- vem mal extraido do leaderboard GolfGenius.
      const toPar = p.total != null && parTotal > 0 ? p.total - parTotal * playedR : null;
      return {
        scoreId: p.name,
        pos: p.pos,
        name: p.name,
        club: p.country ? `${gf(p.country)} ${p.country}` : "",
        grossTotal: p.total,
        toPar,
        nholes: par.length,
        parTotal,  // PAR POR RONDA
        scores: p.rounds[0]?.scores ?? undefined,
        par,
        si: si && si.length >= par.length ? si : undefined,
        meters: meters && meters.length >= par.length ? meters : undefined,
        teeName,
        roundScores,
        _roundsPlayed: playedR,
      } as FPGPlayer;
    });
  return {
    name: def.label,
    tcode: def.id,
    date: "",
    campo: ((def.data as unknown) as { course?: string }).course || def.shortLabel || "",
    rounds: nR,
    playerCount: fpgPlayers.length,
    players: fpgPlayers,
  };
}


/** Opções para ocultar colunas FPG-específicas e adaptar ao contexto BJGT */
function bjgtScorecardOptions(): ScorecardOptions {
  return {
    hideHCP: true,
    hideSD: true,
    hideEsc: true,
    hideFed: true,
    hideTee: true,
    clubLabel: "País",
  };
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
          <th className="hole-header ta-left"></th>
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
        {eagles.length > 0 && <div className="card-detail br" style={{ padding: "4px 8px" }}><span className="fw-800" style={{ color: SC.good }}>🦅 {eagles.length}</span><span className="fs-10 c-text-3"> {eagles.map(h => "H"+h.h).join(", ")}</span></div>}
        <div className="card-detail br" style={{ padding: "4px 8px" }}><span className="fw-800" style={{ color: SC.good }}>🐦 {birdies.length}</span><span className="fs-10 c-text-3"> {birdies.map(h => "H"+h.h).join(", ")}</span></div>
        <div className="card-detail br" style={{ padding: "4px 8px" }}><span className="fw-800 c-text-2">⛳ {pars.length} pars</span></div>
        <div className="card-detail br" style={{ padding: "4px 8px" }}><span className="fw-800 c-text-2">📦 {bogeys.length}</span><span className="fs-10 c-text-3"> {bogeys.map(h => "H"+h.h).join(", ")}</span></div>
        {doubles.length > 0 && <div className="card-detail br" style={{ padding: "4px 8px" }}><span className="fw-800 c-warn-dark">💥 {doubles.length} dbl</span><span className="fs-10 c-text-3"> {doubles.map(h => "H"+h.h).join(", ")}</span></div>}
        {worse.length > 0 && <div className="card-detail br" style={{ padding: "4px 8px" }}><span className="fw-800 c-warn-dark">🔥 {worse.length} triple+</span><span className="fs-10 c-text-3"> {worse.map(h => "H"+h.h+"(+"+h.diff+")").join(", ")}</span></div>}
      </div>
      <div className="muted fs-10 mb-4 fw-700">Performance por tipo de buraco</div>
      <div className="grid-auto-fill mb-8" style={{ gap: 6 }}>
        {[{ label: "Par 3", d: p3 },{ label: "Par 4", d: p4 },{ label: "Par 5", d: p5 }].map(({ label, d }) => (
          <div key={label} className="card-detail br" style={{ padding: "4px 8px" }}>
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
    return <div className="muted fs-10 mb-8">{fullPlayers.length} jogadores{nR > 1 && <> (<RoundPill nR={nR} />)</>}{players.length > fullPlayers.length ? ` + ${players.length - fullPlayers.length} WD` : ""} · Par {parTotal} · Média: {avg.toFixed(1)} ({fmtToPar(Math.round(avg - parTotal * nR))}) · Líder: {fullPlayers[0]?.name} ({fullPlayers[0]?.total}){nSC < players.length && ` · ${nSC} com scorecard`}</div>;
  }
  const scores = players.filter(p => p.rounds[ri as number]).map(p => p.rounds[ri as number].gross);
  const avg = scores.reduce((s,v) => s+v, 0) / scores.length;
  return <div className="muted fs-10 mb-8">{scores.length} jogadores · Par {parTotal} · Média R{(ri as number)+1}: {avg.toFixed(1)} ({fmtToPar(Math.round(avg - parTotal))}){nSC < scores.length && ` · ${nSC} com scorecard`}</div>;
}

/** Mini-resumo de evolução ano-a-ano */
function EvoSummary({ evo, evoYear }: { evo: Map<string, EvoEntry>; evoYear: string }) {
  if (!evo.size) return null;
  const returning = [...evo.values()].filter(e => e.delta !== 0);
  const improved = returning.filter(e => e.delta < 0).length;
  return (
    <div className="muted fs-10 mb-8">
      {evo.size} jogadores regressaram de {evoYear}{returning.length > 0 ? ` · ${improved}/${returning.length} melhoraram (±par)` : ""}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TOURNAMENT VIEW — day tabs
   ═══════════════════════════════════════════════════════════════ */
function TournView({ def, evo, evoYear, selectedDivision }: { def: TDef; evo?: Map<string, EvoEntry>; evoYear?: string; selectedDivision?: string | null }) {
  const { data, manuelName } = def;
  const hasEvo = evo && evo.size > 0;

  // Filter players by selectedDivision if provided
  const filteredData = useMemo(() => {
    if (!selectedDivision) return data;
    return {
      ...data,
      players: data.players.filter(p => (p as any).divisions?.includes(selectedDivision) ?? false)
    };
  }, [data, selectedDivision]);

  const tournament = useMemo(() => tDataToTournament(filteredData, def), [filteredData, def]);
  const scOptions = useMemo(() => bjgtScorecardOptions(), []);

  // Round labels com datas (e.g. "R1 · 25 Fev")
  const roundLabels = useMemo(() =>
    def.roundDates?.map((d, i) => `R${i + 1} · ${d}`),
    [def.roundDates],
  );

  /* Colunas de evolução (só no Resumo) */
  type RowWithPos = MultiRoundRow & { _pos?: number | null };
  const evoCols: ExtraColumn<RowWithPos>[] | undefined = hasEvo ? [
    {
      header: evoYear || "2025",
      className: "ta-c fs-11 fw-600",
      headerStyle: { width: 44, textAlign: "center" as const, padding: "0 3px", borderLeft: "2px solid var(--border)" },
      cell: (row: RowWithPos) => {
        const ev = evo!.get(row.name);
        return ev
          ? <span className="inline-sep">{fmtSign(ev.otherValue)}</span>
          : <span className="c-muted inline-sep">–</span>;
      },
    },
    {
      header: "Δ",
      className: "ta-c fs-11 fw-700",
      headerStyle: { width: 34, textAlign: "center" as const, padding: "0 3px" },
      cell: (row: RowWithPos) => {
        const ev = evo!.get(row.name);
        if (!ev) return <span className="c-muted">–</span>;
        return <span style={{ color: ev.delta < 0 ? "var(--good-dark)" : ev.delta > 0 ? SC.danger : "var(--text-3)" }}>{ev.delta > 0 ? "+" : ""}{ev.delta}</span>;
      },
    },
    {
      header: "Percurso",
      className: "ta-c",
      headerStyle: { width: 140, textAlign: "center" as const, padding: "0 4px" },
      cell: (row: RowWithPos) => {
        const ev = evo!.get(row.name);
        return ev
          ? <EvoBadge pill={ev.pill} from={ev.from} to={ev.to} />
          : <EvoBadge pill="NEW" label={evoYear === "2026" ? "não voltou" : "novo"} />;
      },
    },
  ] : undefined;

  const rLabel = (i: number) => def.roundDates?.[i] ? `R${i + 1} · ${def.roundDates[i]}` : `R${i + 1}`;

  return (
    <IntlTournView
      tournament={tournament}
      scOptions={scOptions}
      roundLabels={roundLabels}
      evoCols={evoCols}
      renderAccSection={(accLB) => (
        <>
          <div className="card">
            <div className="h-md fs-14">🏆 Leaderboard — {def.label}</div>
            {hasEvo && <EvoSummary evo={evo!} evoYear={evoYear!} />}
            {accLB}
          </div>
          <div className="card">
            <div className="h-md fs-14">📊 Dificuldade por Buraco — Todas as rondas</div>
            <FStats data={data} ri="all" />
            <HoleDiff data={data} ri="all" mn={manuelName} />
          </div>
        </>
      )}
      renderRoundSection={(roundLB, tab) => (
        <>
          <div className="card">
            <div className="h-md fs-14">🏆 {rLabel(tab)} — Scorecards</div>
            <FStats data={data} ri={tab} />
            {roundLB}
          </div>
          <div className="card">
            <div className="h-md fs-14">📊 Dificuldade por Buraco — {rLabel(tab)}</div>
            <HoleDiff data={data} ri={tab} mn={manuelName} />
          </div>
          {manuelName && <ManuelDay data={data} ri={tab} />}
        </>
      )}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */

function Content() {
  const [ti, setTi] = useState(0);
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  const [URLS, setURLS] = useState<UrlEntry[]>([]);
  const [all, setAll] = useState<(TDef | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileMeta, setFileMeta] = useState<DataSource[]>([]);
  const { kidsMap } = useKidsLinkMap();
  const md = useMasterDetail();

  // Reset selectedDivision when tournament changes
  useEffect(() => {
    setSelectedDivision(null);
  }, [ti]);

  useEffect(() => {
    let alive = true;
    type FileResult = { def: TDef | null; meta: DataSource };
    cachedFetchJson<Catalog>("/data/england-golf-catalog.json")
      .then(async (cat) => {
        if (!alive || !cat) return;
        const urls = buildUrlsFromCatalog(cat);
        if (!alive) return;
        setURLS(urls);

        // Para cada entry, tentar `/data/england_{slug}.json` primeiro.
        // Se 404, tentar `_div1`, `_div2` ate 404 contiguo.
        const allResults: FileResult[] = [];
        await Promise.all(urls.map(async (m, idx) => {
          try {
            const raw = await cachedFetchJson<unknown>(m.url);
            if (raw != null) {
              const def = { id: m.id, label: m.label, shortLabel: m.shortLabel, data: loadT(raw), manuelName: m.manuelName, year: m.year, category: m.category, roundDates: m.roundDates, series: m.series } as TDef;
              allResults[idx] = { def, meta: { path: m.url, status: "loaded", group: m.series } };
            } else {
              allResults[idx] = { def: null, meta: { path: m.url, status: "error", error: "Ficheiro nao encontrado", group: m.series } };
            }
          } catch (e) {
            allResults[idx] = { def: null, meta: { path: m.url, status: "error", error: String(e), group: m.series } };
          }
        }));

        if (!alive) return;
        setAll(allResults.map(r => r.def));
        setFileMeta(allResults.map(r => r.meta));
        setLoading(false);
        // Auto-seleccionar primeiro torneio com dados (preferindo onde o Manuel jogou)
        const withManuel = allResults.findIndex(r => r.def?.data.players.some(p => isM(p.name)));
        const withData = allResults.findIndex(r => r.def != null);
        const target = withManuel >= 0 ? withManuel : withData >= 0 ? withData : 0;
        setTi(target);
      })
      .catch((e) => {
        if (!alive) return;
        console.error("Erro a carregar england-golf-catalog.json:", e);
        setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const cur = all[ti];
  // EvoComparison removida para England Golf (sem mapping fiavel 2025 vs 2026
  // entre series com calendarios diferentes -- pode ser adicionada depois).
  const evoMap: Map<string, EvoEntry> | undefined = undefined;
  const evoYear: string | undefined = undefined;

  if (loading) return <LoadingState />;

  return (
    <KidsLinkCtx.Provider value={kidsMap}>
    <DataSourcesProvider tournaments={[]}>
    <div className="tourn-layout">

      {/* Toolbar */}
      <Toolbar>
        <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />
        <ToolbarTitle>England Golf</ToolbarTitle>
        <DataSourcesChip sources={fileMeta} />
        {cur && <ToolbarMeta>📍 {((cur.data as unknown) as { course?: string }).course || "England"}</ToolbarMeta>}
        {cur && (() => {
          const nR = Math.max(...cur.data.players.map(p => p.rounds.length));
          return <Counter ml="auto">{fmtFieldInfo(cur.data.players.filter(p => p.rounds.length === nR).length, nR, cur.category)}</Counter>;
        })()}
      </Toolbar>

      {/* Master-detail */}
      <div className="master-detail">

        {/* Sidebar — 1 entrada por ANO (padrão DORALPage).
            Os escalões aparecem como tabs no detalhe. */}
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          {(["england"] as const).map(series => {
            const seriesUrls = URLS.filter(u => u.series === series);
            if (!seriesUrls.length) return null;
            const seriesYears = [...new Set(seriesUrls.map(u => u.year))].sort().reverse();
            const isEowagr = false;
            return (
              <React.Fragment key={series}>
                <SidebarSectionTitle dark>
                  England Golf -- Torneios Juvenis
                </SidebarSectionTitle>
                {seriesYears.flatMap(year => {
                  const yearUrls = seriesUrls.filter(u => u.year === year);
                  const yearUrlsWithData = yearUrls.filter(u => all[URLS.indexOf(u)] != null);
                  if (!yearUrlsWithData.length) return [];

                  // Year header
                  const yearHeader = (
                    <div key={`year-${series}-${year}`} style={{
                      backgroundColor: "#1e3a5f",
                      color: "#fff",
                      padding: "12px 8px",
                      marginBottom: 8,
                      fontWeight: 600,
                      fontSize: 14,
                      borderRadius: "4px"
                    }}>
                      {year}
                    </div>
                  );

                  // Tournament buttons
                  const tourButtons = yearUrlsWithData.map(u => {
                    const idx = URLS.indexOf(u);
                    const d = all[idx];
                    const isActive = idx === ti;
                    const nR = d ? Math.max(...d.data.players.map(p => p.rounds.length), 0) : 0;
                    const nP = d ? d.data.players.filter(p => p.rounds.length === nR).length : 0;
                    const hasManuel = d?.data.players.some(p => isM(p.name)) ?? false;

                    return (
                      <button
                        key={u.id}
                        className={`course-item ${isActive ? "active" : ""}`}
                        onClick={() => { setTi(idx); md.onSelect(); }}
                        style={{ marginBottom: 6 }}
                      >
                        <div className="course-item-name">{u.shortLabel}</div>
                        <div className="course-item-meta" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <span>{u.category}</span>
                          <span className="muted">·</span>
                          <span>{nP} jog</span>
                          {nR > 1 && <RoundPill nR={nR} />}
                          {hasManuel && <ManuelPill />}
                        </div>
                      </button>
                    );
                  });

                  return [yearHeader, ...tourButtons];
                })}
              </React.Fragment>
            );
          })}
        </div>

        {/* Detail */}
        <div className="course-detail" ref={md.detailRef}>
          {cur ? (<>
            <DetailHeader
              title={`${cur.year} · ${cur.category}`}
              sub={<>
                <span className="muted">📍 {((cur.data as unknown) as { course?: string }).course || URLS[ti]?.shortLabel || ""}</span>
                {(() => {
                  const data = cur.data as any;
                  const parTotal = data.parTotal;
                  const metersTotal = data.metersTotal;
                  return (
                    <>
                      {parTotal && <span className="chip ml-8">Par {parTotal}</span>}
                      {metersTotal && <span className="chip ml-4">{metersTotal}m</span>}
                    </>
                  );
                })()}
                <span className="chip ml-8">{fmtFieldInfo(cur.data.players.filter(p => p.rounds.length === Math.max(...cur.data.players.map(pp => pp.rounds.length))).length, Math.max(...cur.data.players.map(p => p.rounds.length)), cur.category)}</span>
                {(() => {
                  const nR = Math.max(...cur.data.players.map(p => p.rounds.length), 0);
                  return nR > 1 ? <RoundPill nR={nR} /> : null;
                })()}
                <ExtLink href={URLS[ti].sourceUrl} className="tourn-ext-link ml-8">🔗 Leaderboard oficial</ExtLink>
              </>}
            />
            {/* Division tabs — extracted from player.divisions[] */}
            {(() => {
              const allDivisions = new Set<string>();
              cur.data.players.forEach(p => {
                (p as any).divisions?.forEach((d: string) => allDivisions.add(d));
              });

              if (allDivisions.size <= 1) return null;

              const divisions = Array.from(allDivisions).sort();
              return (
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap", borderBottom: "1px solid var(--border)", marginBottom: 10, overflowX: "auto" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedDivision(null)}
                    className={"tab-under" + (!selectedDivision ? " active" : "")}
                    style={{ fontSize: 13 }}
                  >
                    Todos ({cur.data.players.length})
                  </button>
                  {divisions.map(div => {
                    const count = cur.data.players.filter(p => (p as any).divisions?.includes(div)).length;
                    const active = selectedDivision === div;
                    return (
                      <button
                        key={div}
                        type="button"
                        onClick={() => setSelectedDivision(div)}
                        className={"tab-under" + (active ? " active" : "")}
                        style={{ fontSize: 13 }}
                      >
                        {div} <span className="fs-10 muted" style={{ marginLeft: 4 }}>({count})</span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            <TournView def={cur} evo={evoMap} evoYear={evoYear} selectedDivision={selectedDivision} />
            {/* EvoComparison removida para England Golf */}
          </>) : <div className="center-msg muted">Dados não disponíveis</div>}
        </div>

      </div>
    </div>
    </DataSourcesProvider>
    </KidsLinkCtx.Provider>
  );
}

export default function EnglandGolfPage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <Content />;
}
