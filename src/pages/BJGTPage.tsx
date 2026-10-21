/**
 * BJGTPage.tsx — módulo de dados + módulos ricos BJGT/EOWAGR
 *
 * ⚠ Já NÃO é uma página. NOTA (2026-07-02): a UI standalone legada
 * (master-detail com sidebar por ano + PasswordGate, rota /bjgt-legacy) foi
 * removida — /bjgt-legacy redirecciona agora para /major.
 *
 * Este módulo exporta os módulos ricos (bjgtEvoFor, bjgtMajorDivision — que
 * embrulha FStats/HoleDiff/ManuelDay) consumidos pela MajorPage (CircuitShell).
 * Os dados (lista de ficheiros, normalização e conversão para o formato FPG)
 * vivem em src/data/major/bluegolf.ts desde 21/10/2026.
 */
import React from "react";
import { scClass, SC } from "../utils/scoreDisplay";
import { isManuelByName as isM } from "../constants/manuel";
import { fmtToPar, fmtSign, fmtSignParen as fmtSub } from "../utils/format";
import type { ScorecardOptions } from "./FPGPage";
import { RoundPill } from "../ui/PillBadge";
import { buildEvoMap, type EvoEntry, type EvoInput } from "../hooks/useEvoComparison";
import { EvoSummary, tagEvo, makeEvoCols } from "../ui/evo";
import type { CircuitDivision } from "../ui/circuit/types";
import { intlScorecardOptions } from "../data/intlScorecard";
import { blueGolfToTournament, type TData, type TDef } from "../data/major/bluegolf";



/** Opções para ocultar colunas FPG-específicas e adaptar ao contexto BJGT */
/** Coluna ANO (class year) — só JWGC/FCG a expõem. */
function bjgtScorecardOptions(showClass = false): ScorecardOptions {
  return intlScorecardOptions({ showClass });
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
      <div className="h-md">🇵🇹 Análise Manuel — R{ri + 1}</div>
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

/* ═══════════════════════════════════════════════════════════════
   Helpers para a página MAJOR (CircuitShell) — reutilizam os módulos
   ricos locais (HoleDiff/ManuelDay/FStats) + o adaptador.
   ═══════════════════════════════════════════════════════════════ */

/** Evolução ano-a-ano para um TDef (bidirecional 2025↔2026). Pura (sem hooks). */
export function bjgtEvoFor(cur: TDef, all: TDef[]): { evo?: Map<string, EvoEntry>; evoYear?: string } {
  const refYear = cur.year === 2026 ? 2025 : cur.year === 2025 ? 2026 : 0;
  if (!refYear) return {};
  const refDefs = all.filter((t) => t && t.year === refYear && t.series === cur.series);
  if (!refDefs.length) return {};
  const curNR = Math.max(...cur.data.players.map((p) => p.rounds.length), 0);
  const curParTotal = cur.data.parTotal * curNR;
  const input: EvoInput = {
    currentPlayers: cur.data.players.filter((p) => p.total != null)
      .map((p) => ({ name: p.name, value: p.total! - curParTotal, category: cur.category })),
    referencePlayers: refDefs.flatMap((t) => {
      const tNR = Math.max(...t.data.players.map((p) => p.rounds.length), 0);
      const tPar = t.data.parTotal * tNR;
      return t.data.players.filter((p) => p.total != null)
        .map((p) => ({ name: p.name, value: p.total! - tPar, category: t.category }));
    }),
    referenceYear: String(refYear),
    isManuel: isM,
  };
  const raw = buildEvoMap(input);
  if (cur.year === 2025 && raw.evoMap) {
    const flipped = new Map<string, EvoEntry>();
    for (const [k, v] of raw.evoMap) flipped.set(k, { ...v, delta: -v.delta, from: v.to, to: v.from });
    return { evo: flipped, evoYear: raw.evoYear };
  }
  return { evo: raw.evoMap, evoYear: raw.evoYear };
}

/** CircuitDivision de um torneio BJGT/EOWAGR (results + evoCols + módulos ricos). */
export function bjgtMajorDivision(def: TDef, evo: Map<string, EvoEntry> | undefined, evoYear: string | undefined, sourceUrl?: string): CircuitDivision {
  const data = def.data;
  const manuelName = def.manuelName || (data.players.some((p) => isM(p.name)) ? "Manuel" : "");
  const hasEvo = !!evo && evo.size > 0;
  const roundLabels = def.roundDates?.map((d, i) => `R${i + 1} · ${d}`);
  const rLabel = (i: number) => (def.roundDates?.[i] ? `R${i + 1} · ${def.roundDates[i]}` : `R${i + 1}`);
  const evoCols = hasEvo ? makeEvoCols(evo!, evoYear) : undefined;
  const results = blueGolfToTournament(data, def);
  tagEvo(results, evo);
  return {
    key: def.id,
    escalao: def.category,
    tabLabel: def.category,
    hasManuel: data.players.some((p) => isM(p.name)),
    links: sourceUrl ? [{ label: "BlueGolf", url: sourceUrl, icon: "🔗" }] : undefined,
    results,
    scOptions: bjgtScorecardOptions(results.players.some((p) => (p as unknown as { _classYear?: number | null })._classYear != null)),
    roundLabels,
    evoCols,
    // Apresentação PLANA (igual ao JOB/Doral): o leaderboard renderiza sem
    // "janela"/card. A análise extra (média + dificuldade por buraco + ManuelDay)
    // flui POR BAIXO, em cards próprios, via accHeader/accExtra/roundExtra.
    accHeader: hasEvo ? <EvoSummary evo={evo!} what={`regressaram de ${evoYear}`} metric="±par" /> : undefined,
    accExtra: (
      <div className="card">
        <div className="h-md">📊 Dificuldade por Buraco — Todas as rondas</div>
        <FStats data={data} ri="all" />
        <HoleDiff data={data} ri="all" mn={manuelName} />
      </div>
    ),
    roundExtra: (tab) => (
      <>
        <div className="card">
          <div className="h-md">📊 Dificuldade por Buraco — {rLabel(tab)}</div>
          <FStats data={data} ri={tab} />
          <HoleDiff data={data} ri={tab} mn={manuelName} />
        </div>
        {manuelName && <ManuelDay data={data} ri={tab} />}
      </>
    ),
  };
}
