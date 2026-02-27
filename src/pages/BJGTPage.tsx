/**
 * BJGTPage.tsx — BJGT Tournament Results
 * 3 tournaments · day sub-tabs (Acumulado, R1, R2, R3)
 */
import React, { useEffect, useState } from "react";
import { scClass, SC } from "../utils/scoreDisplay";
import { fmtToPar, fmtSign } from "../utils/format";
import { isCalUnlocked } from "../utils/authConstants";
import PasswordGate from "../ui/PasswordGate";
import LoadingState from "../ui/LoadingState";

/* ── Types ── */
interface RoundData { day: number; scores: number[] | null; f9: number | null; b9: number | null; gross: number }
interface PlayerData { name: string; country: string; pos: number | null; result: number | null; total: number | null; rounds: RoundData[] }
interface TData { tournament: string; par: number[]; si?: number[]; parF9: number; parB9: number; parTotal: number; players: PlayerData[] }
interface TDef { id: string; label: string; shortLabel: string; data: TData; manuelName: string; year: number; category: string }

/* ── Data URLs ── */
const URLS = [
  { id: "2025_b1011", url: "/data/bjgt_vp_field_2025.json", label: "2025 // Boys 10-11", shortLabel: "2025", manuelName: "Manuel Medeiros", year: 2025, category: "Boys 10-11" },
  { id: "2026_b1011", url: "/data/wjgc_2026_b1011.json", label: "2026 // Boys 10-11", shortLabel: "2026 Boys 10-11", manuelName: "Manuel Francisco Medeiros", year: 2026, category: "Boys 10-11" },
  { id: "2026_b1213", url: "/data/wjgc_2026_contest33.json", label: "2026 // Boys 12-13", shortLabel: "2026 Boys 12-13", manuelName: "", year: 2026, category: "Boys 12-13" },
];

/* ── Flags ── */
const FL: Record<string, string> = {"Portugal":"🇵🇹","Inglaterra":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Federação Russa":"🇷🇺","Russian Federation":"🇷🇺","Suíça":"🇨🇭","Switzerland":"🇨🇭","China":"🇨🇳","Tailândia":"🇹🇭","Thailand":"🇹🇭","França":"🇫🇷","France":"🇫🇷","Espanha":"🇪🇸","Spain":"🇪🇸","Bulgária":"🇧🇬","Bulgaria":"🇧🇬","Gales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿","Wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿","Alemanha":"🇩🇪","Germany":"🇩🇪","Holanda":"🇳🇱","Netherlands":"🇳🇱","Noruega":"🇳🇴","Norway":"🇳🇴","Lituânia":"🇱🇹","Lithuania":"🇱🇹","Estônia":"🇪🇪","Estonia":"🇪🇪","Estados Unidos":"🇺🇸","United States":"🇺🇸","Irlanda":"🇮🇪","Ireland":"🇮🇪","Irlanda do Norte":"🇬🇧","Northern Ireland":"🇬🇧","Itália":"🇮🇹","Italy":"🇮🇹","Escócia":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","Scotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","Filipinas":"🇵🇭","Philippines":"🇵🇭","Suécia":"🇸🇪","Sweden":"🇸🇪","Reino Unido":"🇬🇧","United Kingdom":"🇬🇧","Great Britain":"🇬🇧","Polônia":"🇵🇱","Poland":"🇵🇱","República Checa":"🇨🇿","Czech Republic":"🇨🇿","Colômbia":"🇨🇴","Colombia":"🇨🇴","México":"🇲🇽","Mexico":"🇲🇽","Marrocos":"🇲🇦","Morocco":"🇲🇦","Bélgica":"🇧🇪","Belgium":"🇧🇪","Eslovénia":"🇸🇮","Slovenia":"🇸🇮","Ucrânia":"🇺🇦","Ukraine":"🇺🇦","Roménia":"🇷🇴","Romania":"🇷🇴","Eslováquia":"🇸🇰","Slovakia":"🇸🇰","Emirados Árabes Unidos":"🇦🇪","United Arab Emirates":"🇦🇪","Turquia":"🇹🇷","Turkey":"🇹🇷","Índia":"🇮🇳","India":"🇮🇳","Vietname":"🇻🇳","Viet Nam":"🇻🇳","Cazaquistão":"🇰🇿","Kazakhstan":"🇰🇿","Hungria":"🇭🇺","Hungary":"🇭🇺","África do Sul":"🇿🇦","South Africa":"🇿🇦","Singapura":"🇸🇬","Singapore":"🇸🇬","Dinamarca":"🇩🇰","Denmark":"🇩🇰","Canadá":"🇨🇦","Canada":"🇨🇦","Áustria":"🇦🇹","Austria":"🇦🇹","Paraguai":"🇵🇾","Paraguay":"🇵🇾","Brasil":"🇧🇷","Brazil":"🇧🇷","Jersey":"🇯🇪","Nigéria":"🇳🇬","Nigeria":"🇳🇬","Omã":"🇴🇲","Oman":"🇴🇲","Chile":"🇨🇱","Porto Rico":"🇵🇷","Puerto Rico":"🇵🇷","Costa Rica":"🇨🇷","Letónia":"🇱🇻","Latvia":"🇱🇻","Coreia do Sul":"🇰🇷","South Korea":"🇰🇷"};
const gf = (co: string) => FL[co] || "🏳️";

function loadT(raw: any): TData {
  const d = raw as TData;
  const players = d.players.filter((p: any) => p.total != null && p.rounds?.length > 0).sort((a: any, b: any) => a.total - b.total);
  let pos = 1;
  players.forEach((p: any, i: number) => { if (i > 0 && p.total > players[i - 1].total) pos = i + 1; p.pos = pos; });
  return { ...d, players };
}

const fmtSub = (v: number) => v === 0 ? "(E)" : v > 0 ? `(+${v})` : `(${v})`;
const isM = (n: string) => n.includes("Manuel") && (n.includes("Medeiros") || n.includes("Francisco"));

/* ═══════════════════════════════════════════════════════════════
   ACCUMULATED LEADERBOARD — compact, ±par per round
   ═══════════════════════════════════════════════════════════════ */
function AccLB({ data }: { data: TData }) {
  const { parTotal, players } = data;
  const nR = players[0]?.rounds.length || 0;
  return (
    <div className="bjgt-chart-scroll">
      <table className="sc-table-modern" data-sc-table="1" style={{ width: "auto" }}>
        <thead><tr>
          <th className="hole-header" style={{ textAlign: "center", width: 26, padding: "0 2px" }}>#</th>
          <th className="hole-header" style={{ textAlign: "left", paddingLeft: 6, paddingRight: 8 }}>Jogador</th>
          {Array.from({ length: nR }, (_, i) => (<React.Fragment key={i}>
            <th className="hole-header" style={{ width: 30, textAlign: "center", padding: "0 1px" }}>R{i + 1}</th>
            <th className="hole-header" style={{ width: 34, textAlign: "center", padding: "0 1px", color: "var(--text-muted)", fontWeight: 500, fontSize: 9 }}>±par</th>
          </React.Fragment>))}
          <th className="hole-header col-total" style={{ width: 34, padding: "0 3px" }}>Tot</th>
          <th className="hole-header" style={{ width: 38, textAlign: "center", padding: "0 3px" }}>±Par</th>
        </tr></thead>
        <tbody>
          {players.map((p, idx) => {
            const showPos = idx === 0 || p.pos !== players[idx - 1].pos;
            const tp = p.result ?? (p.total != null ? p.total - parTotal * nR : null);
            const bg = isM(p.name) ? "var(--bg-success-subtle)" : p.country.includes("Portugal") ? "rgba(var(--rgb-success), 0.06)" : undefined;
            return (
              <tr key={idx} style={bg ? { background: bg } : undefined}>
                <td className="fw-800 ta-center" style={{ color: "var(--text-3)", fontSize: 11, padding: "0 2px" }}>{showPos ? p.pos : ""}</td>
                <td style={{ whiteSpace: "nowrap", paddingLeft: 6, paddingRight: 8, fontSize: 12 }}>
                  <span className="fw-700">{gf(p.country)} {p.name}</span>
                </td>
                {p.rounds.map((r, i) => {
                  const rdTp = r.gross - parTotal;
                  const c = rdTp < 0 ? SC.danger : rdTp === 0 ? SC.good : "var(--text-3)";
                  return (<React.Fragment key={i}>
                    <td style={{ textAlign: "center", fontSize: 12, fontWeight: 600, padding: "0 1px" }}>{r.gross}</td>
                    <td style={{ textAlign: "center", fontSize: 10, fontWeight: 600, padding: "0 1px", color: c }}>{fmtToPar(rdTp)}</td>
                  </React.Fragment>);
                })}
                <td className="col-total fw-800" style={{ fontSize: 13, padding: "0 3px" }}>{p.total}</td>
                <td className="fw-700" style={{ textAlign: "center", fontSize: 12, padding: "0 3px", color: tp != null && tp < 0 ? SC.danger : tp === 0 ? SC.good : "var(--text-3)" }}>
                  {tp != null ? fmtToPar(tp) : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SCORECARD TABLE — hole-by-hole for one round
   ═══════════════════════════════════════════════════════════════ */
function SCTable({ data, ri }: { data: TData; ri: number }) {
  const { par, si, parF9, parB9, parTotal, players } = data;
  const ws = players.filter(p => p.rounds[ri]?.scores);
  const sorted = [...ws].sort((a, b) => a.rounds[ri].gross - b.rounds[ri].gross);
  let pos = 1;
  sorted.forEach((p, i) => { if (i > 0 && p.rounds[ri].gross > sorted[i - 1].rounds[ri].gross) pos = i + 1; (p as any)._dp = pos; });
  if (!sorted.length) return <div className="empty-state-sm">Scorecards buraco-a-buraco não disponíveis para esta ronda.</div>;
  return (
    <div className="bjgt-chart-scroll">
      <table className="sc-table-modern" data-sc-table="1">
        <thead><tr>
          <th className="hole-header" style={{ textAlign: "center", width: 26 }}>#</th>
          <th className="hole-header" style={{ textAlign: "left", paddingLeft: 6 }}>Jogador</th>
          <th className="hole-header col-total" style={{ width: 28 }}>Tot</th>
          <th className="hole-header" style={{ width: 28 }}>±</th>
          {[1,2,3,4,5,6,7,8,9].map(h => <th key={h} className="hole-header">{h}</th>)}
          <th className="hole-header col-out fs-10">Out</th>
          {[10,11,12,13,14,15,16,17,18].map(h => <th key={h} className="hole-header">{h}</th>)}
          <th className="hole-header col-in fs-10">In</th>
        </tr></thead>
        <tbody>
          <tr className="sep-row"><td></td><td className="row-label par-label">PAR</td><td className="col-total">{parTotal}</td><td></td>
            {par.slice(0,9).map((p,i) => <td key={i}>{p}</td>)}<td className="col-out fw-600">{parF9}</td>
            {par.slice(9,18).map((p,i) => <td key={i}>{p}</td>)}<td className="col-in fw-600">{parB9}</td></tr>
          {si && si.length >= 18 && <tr className="meta-row sep-row"><td></td><td className="row-label par-label">S.I.</td><td></td><td></td>
            {si.slice(0,9).map((s,i) => <td key={i}>{s}</td>)}<td className="col-out"></td>
            {si.slice(9,18).map((s,i) => <td key={i}>{s}</td>)}<td className="col-in"></td></tr>}
          {sorted.map((p, idx) => {
            const r = p.rounds[ri]; if (!r?.scores) return null;
            const f9 = r.f9!, b9 = r.b9!, tp = r.gross - parTotal;
            const dp = (p as any)._dp; const showP = idx === 0 || dp !== (sorted[idx - 1] as any)._dp;
            const bg = isM(p.name) ? "var(--bg-success-subtle)" : p.country.includes("Portugal") ? "rgba(var(--rgb-success), 0.06)" : undefined;
            return (
              <tr key={idx} style={bg ? { background: bg } : undefined}>
                <td className="fw-800 ta-center" style={{ color: "var(--text-3)", fontSize: 11 }}>{showP ? dp : ""}</td>
                <td className="row-label fw-700" style={{ whiteSpace: "nowrap", fontSize: 11 }}>{gf(p.country)} {p.name.length > 22 ? p.name.substring(0, 20) + "…" : p.name}</td>
                <td className="col-total">{r.gross}</td>
                <td className="fw-700" style={{ color: tp < 0 ? SC.danger : tp === 0 ? SC.good : "var(--text-3)", fontSize: 11 }}>{fmtToPar(tp)}</td>
                {r.scores.slice(0,9).map((sc,i) => <td key={i}><span className={`sc-score ${scClass(sc, par[i])}`}>{sc}</span></td>)}
                <td className="col-out fw-600">{f9} <span className="fs-8 c-text-3">{fmtSub(f9 - parF9)}</span></td>
                {r.scores.slice(9,18).map((sc,i) => <td key={i}><span className={`sc-score ${scClass(sc, par[9+i])}`}>{sc}</span></td>)}
                <td className="col-in fw-600">{b9} <span className="fs-8 c-text-3">{fmtSub(b9 - parB9)}</span></td>
              </tr>);
          })}
        </tbody>
      </table>
    </div>
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
          <th className="hole-header" style={{ textAlign: "left", paddingLeft: 6, minWidth: 44 }}></th>
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
        {eagles.length > 0 && <div className="card-detail br-default" style={{ padding: "4px 8px" }}><span className="fw-800" style={{ color: SC.danger }}>🦅 {eagles.length}</span><span className="fs-10 c-text-3"> {eagles.map(h => "H"+h.h).join(", ")}</span></div>}
        <div className="card-detail br-default" style={{ padding: "4px 8px" }}><span className="fw-800" style={{ color: SC.danger }}>🐦 {birdies.length}</span><span className="fs-10 c-text-3"> {birdies.map(h => "H"+h.h).join(", ")}</span></div>
        <div className="card-detail br-default" style={{ padding: "4px 8px" }}><span className="fw-800" style={{ color: SC.good }}>⛳ {pars.length} pars</span></div>
        <div className="card-detail br-default" style={{ padding: "4px 8px" }}><span className="fw-800" style={{ color: "var(--text-2)" }}>📦 {bogeys.length}</span><span className="fs-10 c-text-3"> {bogeys.map(h => "H"+h.h).join(", ")}</span></div>
        {doubles.length > 0 && <div className="card-detail br-default" style={{ padding: "4px 8px" }}><span className="fw-800" style={{ color: "var(--color-warn-dark)" }}>💥 {doubles.length} dbl</span><span className="fs-10 c-text-3"> {doubles.map(h => "H"+h.h).join(", ")}</span></div>}
        {worse.length > 0 && <div className="card-detail br-default" style={{ padding: "4px 8px" }}><span className="fw-800" style={{ color: "var(--color-warn-dark)" }}>🔥 {worse.length} triple+</span><span className="fs-10 c-text-3"> {worse.map(h => "H"+h.h+"(+"+h.diff+")").join(", ")}</span></div>}
      </div>
      <div className="muted fs-10 mb-4 fw-700">Performance por tipo de buraco</div>
      <div className="grid-auto-fill mb-8" style={{ gap: 6 }}>
        {[{ label: "Par 3", d: p3 },{ label: "Par 4", d: p4 },{ label: "Par 5", d: p5 }].map(({ label, d }) => (
          <div key={label} className="card-detail br-default" style={{ padding: "4px 8px" }}>
            <div className="fw-700 fs-11">{label} ({d.n})</div>
            <div className="fs-10">{d.scores.join(", ")} → <span className="fw-700" style={{ color: d.total < 0 ? SC.danger : d.total === 0 ? SC.good : "var(--text-2)" }}>{d.total > 0 ? "+"+d.total : d.total === 0 ? "E" : d.total}</span><span className="c-text-3"> (avg {d.avg > 0 ? "+" : ""}{d.avg.toFixed(2)})</span></div>
          </div>
        ))}
      </div>
      {prevR?.scores && vsPrev && <>
        <div className="muted fs-10 mb-4 fw-700">vs R{ri} (anterior: {prevR.gross})</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {worseVP.length > 0 && <div className="fs-10"><span className="fw-700" style={{ color: "var(--color-warn-dark)" }}>Pior (+{worseVP.reduce((s,h) => s+h.delta, 0)}):</span> {worseVP.map(h => `H${h.h} ${h.prev}→${h.gross}`).join(", ")}</div>}
          {betterVP.length > 0 && <div className="fs-10"><span className="fw-700" style={{ color: SC.danger }}>Melhor ({betterVP.reduce((s,h) => s+h.delta, 0)}):</span> {betterVP.map(h => `H${h.h} ${h.prev}→${h.gross}`).join(", ")}</div>}
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
  const nR = players[0]?.rounds.length || 0;
  const nSC = ri === "all" ? players.filter(p => p.rounds.some(r => r.scores)).length : players.filter(p => p.rounds[ri as number]?.scores).length;
  if (ri === "all") {
    const avg = players.reduce((s,p) => s + p.total!, 0) / players.length;
    return <div className="muted fs-10 mb-8">{players.length} jogadores · {nR} rondas · Par {parTotal} · Média: {avg.toFixed(1)} ({fmtToPar(Math.round(avg - parTotal * nR))}) · Líder: {players[0]?.name} ({players[0]?.total}){nSC < players.length && ` · ${nSC} com scorecard`}</div>;
  }
  const scores = players.filter(p => p.rounds[ri as number]).map(p => p.rounds[ri as number].gross);
  const avg = scores.reduce((s,v) => s+v, 0) / scores.length;
  return <div className="muted fs-10 mb-8">{scores.length} jogadores · Par {parTotal} · Média R{(ri as number)+1}: {avg.toFixed(1)} ({fmtToPar(Math.round(avg - parTotal))}){nSC < scores.length && ` · ${nSC} com scorecard`}</div>;
}

/* ═══════════════════════════════════════════════════════════════
   TOURNAMENT VIEW — day tabs
   ═══════════════════════════════════════════════════════════════ */
function TournView({ def }: { def: TDef }) {
  const { data, manuelName } = def;
  const nR = data.players[0]?.rounds.length || 0;
  const [dt, setDt] = useState<number | "all">("all");
  return (
    <div>
      <div className="escalao-pills mb-8" style={{ gap: 4 }}>
        <button onClick={() => setDt("all")} className={`tourn-tab tourn-tab-sm${dt === "all" ? " active" : ""}`}>Acumulado</button>
        {Array.from({ length: nR }, (_, i) => <button key={i} onClick={() => setDt(i)} className={`tourn-tab tourn-tab-sm${dt === i ? " active" : ""}`}>R{i + 1}</button>)}
      </div>
      {dt === "all" && <>
        <div className="card"><div className="h-md fs-14">🏆 Leaderboard — {def.label}</div><FStats data={data} ri="all" /><AccLB data={data} /></div>
        <div className="card"><div className="h-md fs-14">📊 Dificuldade por Buraco — Todas as rondas</div><FStats data={data} ri="all" /><HoleDiff data={data} ri="all" mn={manuelName} /></div>
      </>}
      {typeof dt === "number" && <>
        <div className="card"><div className="h-md fs-14">🏆 R{dt+1} — Scorecards</div><FStats data={data} ri={dt} /><SCTable data={data} ri={dt} /></div>
        <div className="card"><div className="h-md fs-14">📊 Dificuldade por Buraco — R{dt+1}</div><HoleDiff data={data} ri={dt} mn={manuelName} /></div>
        {manuelName && <ManuelDay data={data} ri={dt} />}
      </>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */
function Content() {
  const [ti, setTi] = useState(1);
  const [all, setAll] = useState<(TDef | null)[]>([null, null, null]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all(URLS.map(async (m) => {
      try { const res = await fetch(m.url); if (!res.ok) return null; const raw = await res.json();
        return { id: m.id, label: m.label, shortLabel: m.shortLabel, data: loadT(raw), manuelName: m.manuelName, year: m.year, category: m.category } as TDef;
      } catch { return null; }
    })).then(r => { setAll(r); setLoading(false); });
  }, []);

  const cur = all[ti];
  if (loading) return <LoadingState />;

  return (
    <div className="tourn-layout">
      <style>{`.bjgt-chart-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; } .bjgt-chart-scroll > div, .bjgt-chart-scroll > table { min-width: 320px; }`}</style>
      <div className="toolbar">
        <div className="toolbar-left">
          <span className="tourn-toolbar-title">🇪🇸 BJGT</span>
          <span className="tourn-toolbar-meta">📍 Villa Padierna — Flamingos</span>
          <div className="tourn-toolbar-sep" />
          <div className="escalao-pills">
            {URLS.map((t, i) => <button key={t.id} onClick={() => setTi(i)} className={`tourn-tab tourn-tab-sm${ti === i ? " active" : ""}`}>{t.shortLabel}</button>)}
          </div>
        </div>
        <div className="toolbar-right">
          {cur && <span className="chip">{cur.data.players.length} field · {cur.data.players[0]?.rounds.length || 0}R · {cur.category}</span>}
        </div>
      </div>
      {cur ? <TournView def={cur} /> : <div className="center-msg muted">Dados não disponíveis</div>}
    </div>
  );
}

export default function BJGTPage() {
  const [unlocked, setUnlocked] = useState(() => isCalUnlocked());
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return <Content />;
}
