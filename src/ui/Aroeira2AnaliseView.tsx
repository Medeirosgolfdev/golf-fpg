/**
 * Aroeira2AnaliseView.tsx — análise rica do PJA Aroeira Masters 2026 (029/10543)
 *
 * Usa as classes CSS padrão do projecto (.sc-lb, .lb-*) para consistência
 * visual com o resto da app.
 */
import React, { useEffect, useMemo, useState } from "react";
import type { Tournament } from "../data/fpgTypes";
import {
  loadRichAroeiraIIAnalise,
  buildKPIs, buildParGroupStats, buildManuelHoleStats, buildManuelTheoretical,
  buildFieldRanking, buildChronologicalRounds, buildEvolutionStats,
  loadSub12FedSet, buildSub12Performance, enrichSub12WithEstreantes,
  buildHoleDials,
  type RichAnalisePackage, type PlayerScorecardBundle, type HoleDistribution,
  type Sub12Performance, type HoleDial,
} from "../data/aroeira2AnaliseData";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import UiKpiCard from "./KpiCard";
import SortableHdr from "./SortableHdr";
import { useSort } from "../hooks/useSort";
import { fmtToPar, fmtHcp } from "../utils/format";
import { scClass } from "../utils/scoreDisplay";
import PlayerLink from "./PlayerLink";

const MANUEL_FED = "52884";

const fmtPct = (p: number) => p.toFixed(0) + "%";
const fmtAvg = (n: number | null | undefined, d = 1) => (n == null || !isFinite(n)) ? "–" : n.toFixed(d);
const fmtDelta = (n: number | null | undefined, d = 1) => (n == null || !isFinite(n)) ? "–" : (n === 0 ? "0" : (n > 0 ? "+" : "") + n.toFixed(d));

const LABEL_INFO = {
  birdie: { emoji: "🟢", text: "Oportunidade", bg: "var(--color-good-alpha)", border: "var(--color-good)" },
  par:    { emoji: "🟡", text: "Par",          bg: "rgba(234, 179, 8, .12)",  border: "#eab308" },
  bogey:  { emoji: "🔴", text: "Bogey",         bg: "var(--color-danger-alpha)", border: "var(--color-danger)" },
  danger: { emoji: "⚫", text: "Perigo",        bg: "var(--overlay-black-15)",     border: "var(--grey-900)" },
} as const;

const TONE_COLOR = { good: "var(--color-good)", warn: "var(--color-orange)", danger: "var(--color-danger)", neutral: "var(--text-muted)" } as const;

/* ── KPI card — aspecto consistente ─────────────────── */
/* Adaptador fino → delega na definição única UiKpiCard (realce por tom). */
function KpiCard({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint?: string; tone?: "good" | "warn" | "danger" | "neutral" }) {
  const c = TONE_COLOR[tone];
  return (
    <UiKpiCard
      label={label}
      value={value}
      sub={hint}
      color={tone === "neutral" ? undefined : c}
      accentBorder={c}
      style={{ flex: "1 1 200px", minWidth: 200 }}
    />
  );
}

/* ── Mapa do campo: tabela sc-lb padrão ───────────── */
function HoleMapTable({ holes }: { holes: HoleDistribution[] }) {
  const totMeters = holes.reduce((s, h) => s + (h.meters ?? 0), 0);
  const totPar = holes.reduce((s, h) => s + h.par, 0);
  return (
    <div className="bjgt-chart-scroll">
      <table className="sc-lb">
        <thead>
          <tr>
            <th className="lb-name" style={{ textAlign: "left" }}>Buraco</th>
            {holes.slice(0, 9).map(h => <th key={h.hole} className="lb-hole">{h.hole}</th>)}
            <th className="lb-halftot">Out</th>
            {holes.slice(9).map(h => <th key={h.hole} className="lb-hole">{h.hole}</th>)}
            <th className="lb-halftot">In</th>
            <th className="lb-halftot">Tot</th>
          </tr>
          <tr className="lb-par-row">
            <td className="lb-par-lbl">PAR</td>
            {holes.slice(0, 9).map(h => <td key={h.hole} className="lb-hole">{h.par}</td>)}
            <td className="lb-halftot">{holes.slice(0, 9).reduce((s, h) => s + h.par, 0)}</td>
            {holes.slice(9).map(h => <td key={h.hole} className="lb-hole">{h.par}</td>)}
            <td className="lb-halftot">{holes.slice(9).reduce((s, h) => s + h.par, 0)}</td>
            <td className="lb-halftot">{totPar}</td>
          </tr>
          <tr className="lb-si-row">
            <td className="lb-par-lbl">SI</td>
            {holes.slice(0, 9).map(h => <td key={h.hole} className="lb-hole">{h.si ?? "–"}</td>)}
            <td className="lb-halftot">—</td>
            {holes.slice(9).map(h => <td key={h.hole} className="lb-hole">{h.si ?? "–"}</td>)}
            <td className="lb-halftot">—</td>
            <td className="lb-halftot">—</td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="lb-name muted">Dist (m)</td>
            {holes.slice(0, 9).map(h => <td key={h.hole} className="lb-hole muted">{h.meters ?? "–"}</td>)}
            <td className="lb-halftot muted">{holes.slice(0, 9).reduce((s, h) => s + (h.meters ?? 0), 0) || "–"}</td>
            {holes.slice(9).map(h => <td key={h.hole} className="lb-hole muted">{h.meters ?? "–"}</td>)}
            <td className="lb-halftot muted">{holes.slice(9).reduce((s, h) => s + (h.meters ?? 0), 0) || "–"}</td>
            <td className="lb-halftot fw-600">{totMeters || "–"}</td>
          </tr>
          <tr>
            <td className="lb-name fw-600" style={{ color: "var(--color-good)" }}>% Birdie+</td>
            {holes.slice(0, 9).map(h => <td key={h.hole} className="lb-hole" style={{ color: h.pctBirdiePlus >= 20 ? "var(--color-good)" : h.pctBirdiePlus >= 10 ? "var(--chart-8)" : "var(--text-muted)", fontWeight: h.pctBirdiePlus >= 20 ? 700 : 400 }}>{fmtPct(h.pctBirdiePlus)}</td>)}
            <td className="lb-halftot">—</td>
            {holes.slice(9).map(h => <td key={h.hole} className="lb-hole" style={{ color: h.pctBirdiePlus >= 20 ? "var(--color-good)" : h.pctBirdiePlus >= 10 ? "var(--chart-8)" : "var(--text-muted)", fontWeight: h.pctBirdiePlus >= 20 ? 700 : 400 }}>{fmtPct(h.pctBirdiePlus)}</td>)}
            <td className="lb-halftot">—</td>
            <td className="lb-halftot">—</td>
          </tr>
          <tr>
            <td className="lb-name">% Par</td>
            {holes.slice(0, 9).map(h => <td key={h.hole} className="lb-hole">{fmtPct(h.pctPar)}</td>)}
            <td className="lb-halftot">—</td>
            {holes.slice(9).map(h => <td key={h.hole} className="lb-hole">{fmtPct(h.pctPar)}</td>)}
            <td className="lb-halftot">—</td>
            <td className="lb-halftot">—</td>
          </tr>
          <tr>
            <td className="lb-name" style={{ color: "var(--color-danger)" }}>% Bogey</td>
            {holes.slice(0, 9).map(h => <td key={h.hole} className="lb-hole" style={{ color: h.pctBogey >= 50 ? "var(--color-danger)" : h.pctBogey >= 35 ? "var(--color-orange)" : "var(--text)", fontWeight: h.pctBogey >= 50 ? 700 : 400 }}>{fmtPct(h.pctBogey)}</td>)}
            <td className="lb-halftot">—</td>
            {holes.slice(9).map(h => <td key={h.hole} className="lb-hole" style={{ color: h.pctBogey >= 50 ? "var(--color-danger)" : h.pctBogey >= 35 ? "var(--color-orange)" : "var(--text)", fontWeight: h.pctBogey >= 50 ? 700 : 400 }}>{fmtPct(h.pctBogey)}</td>)}
            <td className="lb-halftot">—</td>
            <td className="lb-halftot">—</td>
          </tr>
          <tr>
            <td className="lb-name fw-700">% Duplo+</td>
            {holes.slice(0, 9).map(h => <td key={h.hole} className="lb-hole" style={{ color: h.pctDoublePlus >= 25 ? "var(--grey-900)" : h.pctDoublePlus >= 15 ? "var(--color-danger)" : "var(--text-muted)", fontWeight: h.pctDoublePlus >= 25 ? 700 : 400 }}>{fmtPct(h.pctDoublePlus)}</td>)}
            <td className="lb-halftot">—</td>
            {holes.slice(9).map(h => <td key={h.hole} className="lb-hole" style={{ color: h.pctDoublePlus >= 25 ? "var(--grey-900)" : h.pctDoublePlus >= 15 ? "var(--color-danger)" : "var(--text-muted)", fontWeight: h.pctDoublePlus >= 25 ? 700 : 400 }}>{fmtPct(h.pctDoublePlus)}</td>)}
            <td className="lb-halftot">—</td>
            <td className="lb-halftot">—</td>
          </tr>
          <tr>
            <td className="lb-name muted">Avg field</td>
            {holes.slice(0, 9).map(h => <td key={h.hole} className="lb-hole muted">{h.avgScore.toFixed(2)}</td>)}
            <td className="lb-halftot muted fw-600">{holes.slice(0, 9).reduce((s, h) => s + h.avgScore, 0).toFixed(1)}</td>
            {holes.slice(9).map(h => <td key={h.hole} className="lb-hole muted">{h.avgScore.toFixed(2)}</td>)}
            <td className="lb-halftot muted fw-600">{holes.slice(9).reduce((s, h) => s + h.avgScore, 0).toFixed(1)}</td>
            <td className="lb-halftot fw-700">{holes.reduce((s, h) => s + h.avgScore, 0).toFixed(1)}</td>
          </tr>
          <tr style={{ background: "var(--bg-success-subtle)" }}>
            <td className="lb-name fw-700" style={{ color: "var(--color-good-dark)" }}>⭐ Manuel</td>
            {holes.slice(0, 9).map(h => <td key={h.hole} className="lb-hole fw-600" style={{ color: "var(--color-good-dark)" }}>{fmtAvg(h.manuelAvg, 2)}</td>)}
            <td className="lb-halftot fw-700" style={{ color: "var(--color-good-dark)" }}>{fmtAvg(holes.slice(0, 9).reduce((s, h) => s + (h.manuelAvg ?? 0), 0))}</td>
            {holes.slice(9).map(h => <td key={h.hole} className="lb-hole fw-600" style={{ color: "var(--color-good-dark)" }}>{fmtAvg(h.manuelAvg, 2)}</td>)}
            <td className="lb-halftot fw-700" style={{ color: "var(--color-good-dark)" }}>{fmtAvg(holes.slice(9).reduce((s, h) => s + (h.manuelAvg ?? 0), 0))}</td>
            <td className="lb-halftot fw-700" style={{ color: "var(--color-good-dark)" }}>{fmtAvg(holes.reduce((s, h) => s + (h.manuelAvg ?? 0), 0))}</td>
          </tr>
          <tr>
            <td className="lb-name fw-700">Tipo</td>
            {holes.slice(0, 9).map(h => { const i = LABEL_INFO[h.label]; return <td key={h.hole} className="lb-hole" style={{ background: i.bg }} title={i.text}>{i.emoji}</td>; })}
            <td className="lb-halftot">—</td>
            {holes.slice(9).map(h => { const i = LABEL_INFO[h.label]; return <td key={h.hole} className="lb-hole" style={{ background: i.bg }} title={i.text}>{i.emoji}</td>; })}
            <td className="lb-halftot">—</td>
            <td className="lb-halftot">—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}


/* ── Cartão por buraco: 3 donuts comparativos (Manuel / Sub-12 / Field) ── */
function MiniDonut({ dist, label, sublabel, hideIfEmpty = false }: {
  dist: { birdiePlus: number; par: number; bogey: number; doublePlus: number; n: number };
  label: string;
  sublabel: string;
  hideIfEmpty?: boolean;
}) {
  const SIZE = 78;
  const STROKE = 14;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  if (dist.n === 0) {
    if (hideIfEmpty) return null;
    return (
      <div style={{ flex: 1, textAlign: "center" }}>
        <svg width={SIZE} height={SIZE}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--bg-muted)" strokeWidth={STROKE} />
          <text x={SIZE / 2} y={SIZE / 2 + 4} fontSize="11" fill="var(--text-muted)" textAnchor="middle">–</text>
        </svg>
        <div style={{ fontSize: "var(--fs-11)", fontWeight: 700, marginTop: 2 }}>{label}</div>
        <div style={{ fontSize: "var(--fs-9)", color: "var(--text-muted)" }}>0 rondas</div>
      </div>
    );
  }
  const pct = (n: number) => (n / dist.n) * 100;
  const segs = [
    { v: dist.birdiePlus, color: "var(--color-good)", name: "Birdie+" },
    { v: dist.par,        color: "var(--grey-200)", name: "Par" },
    { v: dist.bogey,      color: "var(--score-double)", name: "Bogey" },
    { v: dist.doublePlus, color: "var(--color-danger)", name: "Duplo+" },
  ];
  let acc = 0;
  return (
    <div style={{ flex: 1, textAlign: "center", minWidth: 90 }}>
      <svg width={SIZE} height={SIZE} style={{ display: "block", margin: "0 auto" }}>
        {/* base ring */}
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--bg-muted)" strokeWidth={STROKE} />
        {/* segments */}
        {segs.map((s, i) => {
          if (s.v === 0) return null;
          const len = (s.v / dist.n) * CIRC;
          const offset = -acc;  // negative offset to start at top
          acc += len;
          return (
            <circle key={i}
              cx={SIZE / 2} cy={SIZE / 2} r={R}
              fill="none" stroke={s.color} strokeWidth={STROKE}
              strokeDasharray={`${len} ${CIRC - len}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          );
        })}
        {/* center: % par + birdie agregado (positivo) */}
        <text x={SIZE / 2} y={SIZE / 2 - 2} fontSize="14" fontWeight="800" textAnchor="middle" fill="var(--text)">
          {Math.round(pct(dist.birdiePlus) + pct(dist.par))}%
        </text>
        <text x={SIZE / 2} y={SIZE / 2 + 11} fontSize="8" textAnchor="middle" fill="var(--text-muted)">par-or-better</text>
      </svg>
      <div style={{ fontSize: "var(--fs-11)", fontWeight: 700, marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: "var(--fs-9)", color: "var(--text-muted)" }}>{sublabel}</div>
    </div>
  );
}

function HoleDial({ d }: { d: HoleDial }) {
  return (
    <div style={{ padding: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: "var(--fs-16)", fontWeight: 800 }}>B{d.hole}</span>
        <span className="muted" style={{ fontSize: "var(--fs-11)" }}>par <b>{d.par}</b></span>
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
        <MiniDonut dist={d.manuelDist} label="⭐ Manuel" sublabel={`${d.manuelN} rds${d.manuelBest != null ? ` · best ${d.manuelBest} · worst ${d.manuelWorst}` : ""}`} />
        <MiniDonut dist={d.sub12Dist}  label="Sub-12"     sublabel={`${d.sub12N} rds${d.sub12Best != null ? ` · best ${d.sub12Best}` : ""}`} />
        <MiniDonut dist={d.fieldDist}  label="Field"      sublabel={`${d.fieldN} rds${d.fieldBest != null ? ` · best ${d.fieldBest}` : ""}`} />
      </div>
      {/* Mini-legenda das cores */}
      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 8, fontSize: "var(--fs-9)" }}>
        <span style={{ color: "var(--color-good)", fontWeight: 700 }}>● Birdie+</span>
        <span style={{ color: "var(--grey-500)", fontWeight: 700 }}>● Par</span>
        <span style={{ color: "var(--score-quad)", fontWeight: 700 }}>● Bogey</span>
        <span style={{ color: "var(--color-danger)", fontWeight: 700 }}>● Duplo+</span>
      </div>
    </div>
  );
}

/* ── Player block (consistente com o resto da app) ─── */
function PlayerCardBlock({ card, parRef }: { card: PlayerScorecardBundle; parRef: number[] }) {
  const [open, setOpen] = useState(card.fedCode === MANUEL_FED);
  const isManuel = card.fedCode === MANUEL_FED;
  const parF9 = parRef.slice(0, 9).reduce((a, b) => a + b, 0);
  const parB9 = parRef.slice(9, 18).reduce((a, b) => a + b, 0);
  return (
    <div className="player-card-block" style={{
      border: isManuel ? "2px solid var(--color-good)" : "1px solid var(--border)",
      borderRadius: "var(--radius-md)", marginBottom: 8,
      background: isManuel ? "var(--bg-success-subtle)" : "var(--bg-card)",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="fs-13"
        style={{ width: "100%", padding: "8px 12px", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}
      >
        <span className="muted">{open ? "▼" : "▶"}</span>
        <span className="fw-700" style={{ flex: 1 }}>
          {card.fedCode ? <PlayerLink fed={card.fedCode} name={card.name} /> : card.name}
          {isManuel && " ⭐"}
        </span>
        <span className="muted fs-12" style={{ minWidth: 100 }}>{card.club || "–"}</span>
        <span className="fs-12">HCP <b>{fmtHcp(card.hcpExact)}</b></span>
        <span className="fs-12">{card.nRounds} rds</span>
        <span className="fs-13 fw-700">Avg {fmtAvg(card.avgGross, 0)}</span>
        <span className="fs-13">Best {card.bestGross ?? "–"}</span>
        <span className="fs-13 fw-700" style={{ color: card.avgToPar != null && card.avgToPar < 0 ? "var(--color-good)" : card.avgToPar != null && card.avgToPar > 0 ? "var(--color-danger)" : "var(--text)" }}>
          {fmtDelta(card.avgToPar)}
        </span>
        {card.category === "top21" && <span className="muted fs-11" style={{ minWidth: 50 }}>Pos {card.currentPos ?? "–"}</span>}
        {card.category === "sub12_inscrito" && <span className="fs-11 fw-600" style={{ background: "rgba(59, 130, 246, .15)", padding: "3px 8px", borderRadius: "var(--radius)", color: "var(--color-info)" }}>Sub-12 inscrito</span>}
      </button>
      {open && card.rounds.length > 0 && (
        <div className="bjgt-chart-scroll" style={{ padding: "0 12px 10px" }}>
          <table className="sc-lb sc-lb-with-sc">
            <thead>
              <tr>
                <th className="lb-name" style={{ textAlign: "left", minWidth: 240 }}>Data / Torneio</th>
                <th className="lb-topar">±</th>
                <th className="lb-gross">Tot</th>
                {parRef.slice(0, 9).map((_, i) => <th key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{i + 1}</th>)}
                <th className="lb-halftot">Out</th>
                {parRef.slice(9).map((_, i) => <th key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{i + 10}</th>)}
                <th className="lb-halftot">In</th>
              </tr>
              <tr className="lb-par-row">
                <td className="lb-par-lbl">PAR</td>
                <td className="lb-topar"></td>
                <td className="lb-gross">{parRef.reduce((a, b) => a + b, 0)}</td>
                {parRef.slice(0, 9).map((p, i) => <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{p}</td>)}
                <td className="lb-halftot">{parF9}</td>
                {parRef.slice(9).map((p, i) => <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{p}</td>)}
                <td className="lb-halftot">{parB9}</td>
              </tr>
            </thead>
            <tbody>
              {card.rounds.map((r, idx) => {
                const f9 = r.scores.slice(0, 9).reduce((a, b) => a + b, 0);
                const b9 = r.scores.slice(9, 18).reduce((a, b) => a + b, 0);
                const rPars = r.pars && r.pars.length === 18 ? r.pars : parRef;
                const rParF9 = rPars.slice(0, 9).reduce((a, b) => a + b, 0);
                const rParB9 = rPars.slice(9, 18).reduce((a, b) => a + b, 0);
                return (
                  <tr key={idx}>
                    <td className="lb-name muted fs-11" style={{ whiteSpace: "nowrap" }}>{r.date.slice(0, 10)} · R{r.round} · {r.tournamentName}</td>
                    <td className="lb-topar fw-700" style={{ color: r.toPar != null && r.toPar < 0 ? "var(--color-good)" : r.toPar != null && r.toPar > 0 ? "var(--color-danger)" : "var(--text)" }}>{r.toPar != null ? fmtToPar(r.toPar) : "–"}</td>
                    <td className="lb-gross fw-700">{r.gross ?? "–"}</td>
                    {r.scores.slice(0, 9).map((sc, i) => (
                      <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
                        <span className={"sc-score " + scClass(sc, rPars[i] ?? 4)}>{sc || ""}</span>
                      </td>
                    ))}
                    <td className="lb-halftot">{f9} <span className="fs-10 c-text-3">({fmtToPar(f9 - rParF9)})</span></td>
                    {r.scores.slice(9, 18).map((sc, i) => (
                      <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
                        <span className={"sc-score " + scClass(sc, rPars[9 + i] ?? 4)}>{sc || ""}</span>
                      </td>
                    ))}
                    <td className="lb-halftot">{b9} <span className="fs-10 c-text-3">({fmtToPar(b9 - rParB9)})</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Recomendações ───────────────────────────────────── */
function buildHoleRecommendations(holes: HoleDistribution[]): { hole: number; text: string; type: "good" | "neutral" | "warn" | "danger" }[] {
  return holes.map(h => {
    const m = h.manuelAvg;
    const manuelDelta = m != null ? m - h.par : null;
    const manuelVsField = m != null ? m - h.avgScore : null;
    let txt = "", type: "good" | "neutral" | "warn" | "danger" = "neutral";
    if (h.label === "birdie") {
      type = "good";
      txt = `Par ${h.par}${h.meters ? ` · ${h.meters}m` : ""} — ${fmtPct(h.pctBirdiePlus)} fazem birdie+. Ataca: tiro com confiança ao green em 2.`;
      if (manuelVsField != null && manuelVsField > 0.5) { txt += ` ⚠ Manuel está ${manuelVsField.toFixed(1)} acima do field — analisar tee shot.`; type = "warn"; }
    } else if (h.label === "danger") {
      type = "danger";
      txt = `Par ${h.par}${h.meters ? ` · ${h.meters}m` : ""} — ${fmtPct(h.pctDoublePlus)} fazem duplo+. Defensivo: punch out, accept bogey.`;
    } else if (h.label === "bogey") {
      type = "warn";
      txt = `Par ${h.par}${h.meters ? ` · ${h.meters}m` : ""} — ${fmtPct(h.pctBogey)} fazem bogey. Foco: segurar par, não forçar pin.`;
      if (manuelDelta != null && manuelDelta < 0.5) { txt += ` ✓ Manuel costuma fazer ${fmtAvg(m)} aqui — está acima do field, manter.`; type = "good"; }
    } else {
      txt = `Par ${h.par}${h.meters ? ` · ${h.meters}m` : ""} — par é o mais comum (${fmtPct(h.pctPar)}). Jogo standard.`;
    }
    return { hole: h.hole, text: txt, type };
  });
}

/* ── Componente principal ─────────────────────────────── */
export default function Aroeira2AnaliseView({ tournament }: { tournament: Tournament }) {
  const [pkg, setPkg] = useState<RichAnalisePackage | null>(null);
  const [sub12Perf, setSub12Perf] = useState<Sub12Performance[]>([]);
  const [sub12FedSet, setSub12FedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    Promise.all([loadRichAroeiraIIAnalise(tournament), loadSub12FedSet()])
      .then(async ([p, fedSet]) => {
        if (!alive) return;
        const baseSub12 = buildSub12Performance(p, fedSet);
        const fullSub12 = await enrichSub12WithEstreantes(baseSub12, fedSet);
        if (!alive) return;
        setPkg(p); setSub12Perf(fullSub12); setSub12FedSet(fedSet); setLoading(false);
      })
      .catch(e => { if (alive) { setError(String(e?.message || e)); setLoading(false); } });
    return () => { alive = false; };
  }, [tournament]);

  const kpis = useMemo(() => pkg ? buildKPIs(pkg, pkg.holeStats.perHole) : [], [pkg]);
  const parGroups = useMemo(() => pkg ? buildParGroupStats(pkg.holeStats.perHole) : [], [pkg]);
  const manuelStats = useMemo(() => pkg ? buildManuelHoleStats(pkg.manuelHistory, pkg.parReference) : [], [pkg]);
  const theoretical = useMemo(() => pkg && manuelStats.length === 18 ? buildManuelTheoretical(manuelStats, pkg.manuelHistory) : null, [pkg, manuelStats]);
  const holeRecs = useMemo(() => pkg ? buildHoleRecommendations(pkg.holeStats.perHole) : [], [pkg]);
  const fieldAvgGross = useMemo(() => pkg ? pkg.holeStats.perHole.reduce((s, h) => s + h.avgScore, 0) : 0, [pkg]);
  const fieldRanking = useMemo(() => pkg ? buildFieldRanking(pkg.playerCards, fieldAvgGross) : [], [pkg, fieldAvgGross]);
  const cronoRounds = useMemo(() => pkg ? buildChronologicalRounds(pkg.playerCards) : [], [pkg]);
  const evolution = useMemo(() => pkg ? buildEvolutionStats(pkg.playerCards) : [], [pkg]);

  /* ── Ordenação das 3 tabelas de ranking ── */
  const frSort = useSort<"name" | "hcp" | "rds" | "avgToPar" | "avgGross" | "best" | "vsField">("avgToPar");
  const sortedFieldRanking = useMemo(() => {
    const mult = frSort.sortDir === "asc" ? 1 : -1;
    const num = (v: number | null) => v == null ? Infinity : v;
    return [...fieldRanking].sort((a, b) => {
      switch (frSort.sortKey) {
        case "name":     return mult * a.name.localeCompare(b.name, "pt");
        case "hcp":      return mult * (num(a.hcpExact) - num(b.hcpExact));
        case "rds":      return mult * (a.nRounds - b.nRounds);
        case "avgToPar": return mult * (a.avgToPar - b.avgToPar);
        case "avgGross": return mult * (a.avgGross - b.avgGross);
        case "best":     return mult * (a.bestGross - b.bestGross);
        case "vsField":  return mult * (a.vsFieldAvg - b.vsFieldAvg);
        default:         return 0;
      }
    });
  }, [fieldRanking, frSort.sortKey, frSort.sortDir]);

  const s12Sort = useSort<"name" | "club" | "hcp" | "status" | "rds" | "avgToPar" | "avgGross" | "best" | "worst" | "last" | "date">("avgToPar");
  const sortedSub12Perf = useMemo(() => {
    const mult = s12Sort.sortDir === "asc" ? 1 : -1;
    const num = (v: number | null) => v == null ? Infinity : v;
    const str = (v: string | null) => v ?? "";
    return [...sub12Perf].sort((a, b) => {
      switch (s12Sort.sortKey) {
        case "name":     return mult * a.name.localeCompare(b.name, "pt");
        case "club":     return mult * str(a.club).localeCompare(str(b.club), "pt");
        case "hcp":      return mult * (num(a.hcpExact) - num(b.hcpExact));
        case "status":   return mult * a.status.localeCompare(b.status, "pt");
        case "rds":      return mult * (a.nRounds - b.nRounds);
        case "avgToPar": return mult * (num(a.avgToPar) - num(b.avgToPar));
        case "avgGross": return mult * (num(a.avgGross) - num(b.avgGross));
        case "best":     return mult * (num(a.bestGross) - num(b.bestGross));
        case "worst":    return mult * (num(a.worstGross) - num(b.worstGross));
        case "last":     return mult * (num(a.lastGross) - num(b.lastGross));
        case "date":     return mult * str(a.lastDate).localeCompare(str(b.lastDate));
        default:         return 0;
      }
    });
  }, [sub12Perf, s12Sort.sortKey, s12Sort.sortDir]);

  const evSort = useSort<"name" | "hcp" | "rds" | "best" | "last" | "lastVsBest" | "slope" | "firstToLast" | "trendDelta" | "trend">("slope");
  const sortedEvolution = useMemo(() => {
    const mult = evSort.sortDir === "asc" ? 1 : -1;
    const num = (v: number | null) => v == null ? Infinity : v;
    return [...evolution].sort((a, b) => {
      switch (evSort.sortKey) {
        case "name":        return mult * a.name.localeCompare(b.name, "pt");
        case "hcp":         return mult * (num(a.hcpExact) - num(b.hcpExact));
        case "rds":         return mult * (a.rounds.length - b.rounds.length);
        case "best":        return mult * (num(a.bestGross) - num(b.bestGross));
        case "last":        return mult * (num(a.lastGross) - num(b.lastGross));
        case "lastVsBest":  return mult * (num(a.lastVsBest) - num(b.lastVsBest));
        case "slope":       return mult * (a.slope - b.slope);
        case "firstToLast": return mult * (num(a.firstToLast) - num(b.firstToLast));
        case "trendDelta":  return mult * (num(a.trendDelta) - num(b.trendDelta));
        case "trend":       return mult * a.trendLabel.localeCompare(b.trendLabel, "pt");
        default:            return 0;
      }
    });
  }, [evolution, evSort.sortKey, evSort.sortDir]);

  const difficulty = useMemo(() => {
    if (!pkg) return { hard: [] as HoleDistribution[], easy: [] as HoleDistribution[] };
    const sorted = [...pkg.holeStats.perHole].sort((a, b) => (b.avgScore - b.par) - (a.avgScore - a.par));
    return { hard: sorted.slice(0, 5), easy: sorted.slice(-5).reverse() };
  }, [pkg]);

  const holeDials = useMemo(() => {
    if (!pkg) return [] as HoleDial[];
    // re-extrair allRounds da playerCards (todas as rondas de todos os jogadores)
    const allRounds = pkg.playerCards.flatMap(c => c.rounds);
    return buildHoleDials(allRounds, pkg.parReference, sub12FedSet);
  }, [pkg, sub12FedSet]);

  if (loading) return <LoadingState message="A carregar análise…" />;
  if (error) return <div className="fs-13" style={{ padding: 24, color: "var(--color-danger)" }}>Erro: {error}</div>;
  if (!pkg) return <EmptyState size="sm" message="Sem dados" />;

  const top21Cards = pkg.playerCards.filter(c => c.category === "top21");
  const sub12CardsCom = pkg.playerCards.filter(c => c.category === "sub12_inscrito");
  const parF9Ref = pkg.parReference.slice(0, 9).reduce((a, b) => a + b, 0);
  const parB9Ref = pkg.parReference.slice(9, 18).reduce((a, b) => a + b, 0);

  return (
    <div className="aroeira2-analise fs-13" style={{ display: "flex", flexDirection: "column", gap: 28, paddingBottom: 40 }}>

      {/* Header */}
      <section>
        <div className="muted fs-12" style={{ marginBottom: 4 }}>
          PGA Aroeira No.2 · par 72 · {pkg.holeStats.totalMeters || 4805}m · {pkg.holeStats.totalRounds} rondas analisadas
        </div>
        <h2 style={{ margin: "0 0 8px" }}>Análise Aroeira II — radar para o Nacional Sub-12 (1-3 Mai 2026)</h2>
        <div className="muted fs-13">{top21Cards.length} jogadores PJA Aroeira Masters 2026 · {sub12CardsCom.length} inscritos Sub-12 Nacional com histórico no campo</div>
      </section>

      {/* KPIs */}
      <section>
        <h3>Visão de relance</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
        </div>
      </section>

      {/* Legenda */}
      <section style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {(Object.keys(LABEL_INFO) as Array<keyof typeof LABEL_INFO>).map(k => (
          <span key={k} className="fs-12 fw-600" style={{ background: LABEL_INFO[k].bg, padding: "5px 12px", borderRadius: "var(--radius)", border: `1px solid ${LABEL_INFO[k].border}` }}>
            {LABEL_INFO[k].emoji} {LABEL_INFO[k].text}
          </span>
        ))}
      </section>

      {/* 1. Mapa do campo */}
      <section>
        <h3>1. Mapa do campo</h3>
        <div className="muted fs-12" style={{ marginBottom: 8 }}>
          Agregado das rondas com o routing actual (Nov 2025+). Rondas anteriores com tee de início diferente foram excluídas para garantir que cada buraco corresponde fisicamente ao que vai ser jogado no Nacional Sub-12.
        </div>
        <HoleMapTable holes={pkg.holeStats.perHole} />
      </section>

      {/* 1b. Dials por buraco */}
      <section>
        <h3>1b. 18 dials — média field, Sub-12, melhor e pior do Manuel</h3>
        <div className="muted fs-12" style={{ marginBottom: 10 }}>
          Para cada buraco, melhor (Best) e pior (Worst) score já registado em rondas com routing actual. <strong style={{ color: "var(--color-good-dark)" }}>⭐ Manuel</strong> (suas rondas), <strong style={{ color: "var(--color-info)" }}>Sub-12</strong> (Manuel + outros Sub-12 com histórico) e <strong>Field</strong> (todos no campo). Cores oficiais nas células: vermelho = birdie/eagle, azul = bogey/duplo.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 10 }}>
          {holeDials.map(d => <HoleDial key={d.hole} d={d} />)}
        </div>
      </section>

      {/* 2. Top dificuldade */}
      <section>
        <h3>2. Buracos chave — Top 5 difíceis vs Top 5 fáceis</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ border: "2px solid var(--color-danger)", borderRadius: "var(--radius-md)", padding: 12, background: "rgba(220, 38, 38, .04)" }}>
            <h4 style={{ margin: "0 0 8px", color: "var(--color-danger-dark)" }}>🔴 Mais difíceis (vão preparados)</h4>
            <table className="sc-lb">
              <thead>
                <tr><th className="lb-name">B</th><th className="lb-hole">Par</th><th className="lb-hole">Avg</th><th className="lb-hole">Δ</th><th className="lb-hole">%Bog+</th><th className="lb-hole">⭐ M</th></tr>
              </thead>
              <tbody>
                {difficulty.hard.map(h => (
                  <tr key={h.hole}>
                    <td className="lb-name fw-700">B{h.hole}</td>
                    <td className="lb-hole">{h.par}</td>
                    <td className="lb-hole">{h.avgScore.toFixed(2)}</td>
                    <td className="lb-hole fw-700" style={{ color: "var(--color-danger)" }}>+{(h.avgScore - h.par).toFixed(2)}</td>
                    <td className="lb-hole">{fmtPct(h.pctBogey + h.pctDoublePlus)}</td>
                    <td className="lb-hole fw-700" style={{ color: "var(--color-good-dark)" }}>{fmtAvg(h.manuelAvg, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ border: "2px solid var(--color-good)", borderRadius: "var(--radius-md)", padding: 12, background: "rgba(22, 163, 74, .04)" }}>
            <h4 style={{ margin: "0 0 8px", color: "var(--color-good-dark)" }}>🟢 Mais fáceis (capitalizar)</h4>
            <table className="sc-lb">
              <thead>
                <tr><th className="lb-name">B</th><th className="lb-hole">Par</th><th className="lb-hole">Avg</th><th className="lb-hole">Δ</th><th className="lb-hole">%Bird+</th><th className="lb-hole">⭐ M</th></tr>
              </thead>
              <tbody>
                {difficulty.easy.map(h => (
                  <tr key={h.hole}>
                    <td className="lb-name fw-700">B{h.hole}</td>
                    <td className="lb-hole">{h.par}</td>
                    <td className="lb-hole">{h.avgScore.toFixed(2)}</td>
                    <td className="lb-hole fw-700" style={{ color: h.avgScore - h.par <= 0 ? "var(--color-good)" : "var(--text)" }}>{fmtDelta(h.avgScore - h.par, 2)}</td>
                    <td className="lb-hole">{fmtPct(h.pctBirdiePlus)}</td>
                    <td className="lb-hole fw-700" style={{ color: "var(--color-good-dark)" }}>{fmtAvg(h.manuelAvg, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 3. Splits Par-3/4/5 */}
      {parGroups.length > 0 && (
        <section>
          <h3>3. Splits Par-3 / Par-4 / Par-5</h3>
          <table className="sc-lb">
            <thead>
              <tr>
                <th className="lb-name">Tipo</th>
                <th className="lb-hole">Buracos</th>
                <th className="lb-hole">Avg field</th>
                <th className="lb-hole">Δ field</th>
                <th className="lb-hole">⭐ Avg M</th>
                <th className="lb-hole">Δ Manuel</th>
                <th className="lb-hole">%Bird+</th>
                <th className="lb-hole">%Bogey</th>
                <th className="lb-hole">%Duplo+</th>
              </tr>
            </thead>
            <tbody>
              {parGroups.map(pg => (
                <tr key={pg.group}>
                  <td className="lb-name fw-700">{pg.group}</td>
                  <td className="lb-hole">{pg.count}</td>
                  <td className="lb-hole">{pg.fieldAvg.toFixed(2)}</td>
                  <td className="lb-hole fw-700" style={{ color: pg.fieldDelta < 0 ? "var(--color-good)" : "var(--color-danger)" }}>{fmtDelta(pg.fieldDelta, 2)}</td>
                  <td className="lb-hole" style={{ color: "var(--color-good-dark)" }}>{fmtAvg(pg.manuelAvg, 2)}</td>
                  <td className="lb-hole fw-700" style={{ color: pg.manuelDelta != null && pg.manuelDelta < 0 ? "var(--color-good)" : pg.manuelDelta != null && pg.manuelDelta > 0 ? "var(--color-danger)" : "var(--text)" }}>{fmtDelta(pg.manuelDelta, 2)}</td>
                  <td className="lb-hole" style={{ color: "var(--color-good)" }}>{fmtPct(pg.pctBirdiePlus)}</td>
                  <td className="lb-hole" style={{ color: "var(--color-danger)" }}>{fmtPct(pg.pctBogey)}</td>
                  <td className="lb-hole fw-700">{fmtPct(pg.pctDoublePlus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* 4. Manuel teórica + variabilidade */}
      {theoretical && (
        <section>
          <h3>4. Manuel — ronda teórica vs realidade</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <KpiCard label="Ronda teórica" value={String(theoretical.theoretical)} hint={`Soma do best score do Manuel em cada buraco (par 72, ${fmtToPar(theoretical.theoretical - 72)})`} tone="good" />
            <KpiCard label="Melhor ronda real" value={String(theoretical.bestReal)} hint={`Melhor ronda jogada (par 72, ${fmtToPar(theoretical.bestReal - 72)})`} tone="warn" />
            <KpiCard label="Potencial em cima da mesa" value={"-" + theoretical.diff} hint="Pancadas que o Manuel já fez em rondas separadas mas ainda não juntou na mesma ronda" tone="warn" />
          </div>
          <h4 style={{ margin: "0 0 8px" }}>Best/Worst do Manuel por buraco (ronda eclética)</h4>
          <div className="bjgt-chart-scroll">
            <table className="sc-lb">
              <thead>
                <tr>
                  <th className="lb-name" style={{ textAlign: "left" }}>Métrica</th>
                  {manuelStats.map(s => <th key={s.hole} className="lb-hole">B{s.hole}</th>)}
                  <th className="lb-halftot">Tot</th>
                </tr>
                <tr className="lb-par-row">
                  <td className="lb-par-lbl">PAR</td>
                  {manuelStats.map(s => <td key={s.hole} className="lb-hole">{s.par}</td>)}
                  <td className="lb-halftot">{manuelStats.reduce((a, s) => a + s.par, 0) || 72}</td>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="lb-name fw-600" style={{ color: "var(--color-good)" }}>Best (eclética)</td>
                  {manuelStats.map(s => <td key={s.hole} className="lb-hole"><span className={"sc-score " + scClass(s.best, s.par)}>{s.best || "–"}</span></td>)}
                  <td className="lb-halftot fw-700" style={{ color: "var(--color-good-dark)" }}>{manuelStats.filter(s => s.best > 0).reduce((a, s) => a + s.best, 0) || "–"}</td>
                </tr>
                <tr>
                  <td className="lb-name fw-600" style={{ color: "var(--color-danger)" }}>Worst (anti-eclética)</td>
                  {manuelStats.map(s => <td key={s.hole} className="lb-hole"><span className={"sc-score " + scClass(s.worst, s.par)}>{s.worst || "–"}</span></td>)}
                  <td className="lb-halftot fw-700" style={{ color: "var(--color-danger)" }}>{manuelStats.filter(s => s.worst > 0).reduce((a, s) => a + s.worst, 0) || "–"}</td>
                </tr>
                <tr>
                  <td className="lb-name fw-600">Pior – Melhor</td>
                  {manuelStats.map(s => {
                    const gap = s.scores.length ? s.worst - s.best : 0;
                    const color = gap === 0 ? "var(--color-good)" : gap <= 1 ? "var(--chart-8)" : gap <= 2 ? "var(--text)" : "var(--color-danger)";
                    return <td key={s.hole} className="lb-hole fw-700" style={{ color }}>{s.scores.length ? gap : "–"}</td>;
                  })}
                  <td className="lb-halftot fw-700">{manuelStats.filter(s => s.scores.length).reduce((a, s) => a + (s.worst - s.best), 0) || "–"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="muted fs-11" style={{ marginTop: 6 }}>
            <b>Best (eclética)</b>: melhor score que o Manuel já fez em cada buraco — soma do total dá a ronda teórica. <b>Worst (anti-eclética)</b>: pior score. <b>Pior – Melhor</b>: amplitude — 0 verde escuro (sempre o mesmo), 1-2 razoável, ≥3 grande oscilação (alvo de treino).
          </div>
        </section>
      )}

      {/* 5. Plano táctico */}
      <section>
        <h3>5. Plano táctico buraco-a-buraco</h3>
        <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 8 }}>
          {holeRecs.map(r => (
            <li key={r.hole} className="fs-13" style={{ padding: 10, borderRadius: "var(--radius)", border: `1.5px solid ${TONE_COLOR[r.type]}`, background: "var(--bg-card)" }}>
              <strong style={{ color: TONE_COLOR[r.type] }}>B{r.hole}</strong> — {r.text}
            </li>
          ))}
        </ol>
      </section>

      {/* 6. Field ranking */}
      <section>
        <h3>6. Ranking — quem joga melhor o Aroeira II</h3>
        <table className="sc-lb">
          <thead>
            <tr>
              <th className="lb-pos">#</th>
              <SortableHdr k="name" sortKey={frSort.sortKey} sortDir={frSort.sortDir} onSort={frSort.toggleSort} className="lb-name" style={{ textAlign: "left" }}>Jogador</SortableHdr>
              <SortableHdr k="hcp" sortKey={frSort.sortKey} sortDir={frSort.sortDir} onSort={frSort.toggleSort} className="lb-hcp">HCP</SortableHdr>
              <SortableHdr k="rds" sortKey={frSort.sortKey} sortDir={frSort.sortDir} onSort={frSort.toggleSort} className="lb-hole">Rds</SortableHdr>
              <SortableHdr k="avgToPar" sortKey={frSort.sortKey} sortDir={frSort.sortDir} onSort={frSort.toggleSort} className="lb-topar">Avg ±</SortableHdr>
              <SortableHdr k="avgGross" sortKey={frSort.sortKey} sortDir={frSort.sortDir} onSort={frSort.toggleSort} className="lb-gross">Avg G</SortableHdr>
              <SortableHdr k="best" sortKey={frSort.sortKey} sortDir={frSort.sortDir} onSort={frSort.toggleSort} className="lb-hole">Best</SortableHdr>
              <SortableHdr k="vsField" sortKey={frSort.sortKey} sortDir={frSort.sortDir} onSort={frSort.toggleSort} className="lb-hole">vs field</SortableHdr>
            </tr>
          </thead>
          <tbody>
            {sortedFieldRanking.map((r, i) => {
              const isManuel = r.fedCode === MANUEL_FED;
              return (
                <tr key={i} style={{ background: isManuel ? "var(--bg-success-subtle)" : undefined }}>
                  <td className="lb-pos fw-700">{i + 1}</td>
                  <td className="lb-name fw-600">{r.fedCode ? <PlayerLink fed={r.fedCode} name={r.name} /> : r.name}{isManuel && " ⭐"}</td>
                  <td className="lb-hcp">{fmtHcp(r.hcpExact)}</td>
                  <td className="lb-hole">{r.nRounds}</td>
                  <td className="lb-topar fw-700" style={{ color: r.avgToPar < 0 ? "var(--color-good)" : "var(--color-danger)" }}>{fmtDelta(r.avgToPar, 1)}</td>
                  <td className="lb-gross">{r.avgGross.toFixed(1)}</td>
                  <td className="lb-hole fw-600">{r.bestGross}</td>
                  <td className="lb-hole" style={{ color: r.vsFieldAvg < 0 ? "var(--color-good)" : "var(--color-danger)" }}>{fmtDelta(r.vsFieldAvg, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* 7. Top 21 scorecards */}
      <section>
        <h3>7. Top 21 PJA — scorecards detalhados</h3>
        <div className="muted fs-12" style={{ marginBottom: 8 }}>Clica para expandir todas as rondas hole-by-hole. Manuel auto-aberto.</div>
        {top21Cards.map((c, i) => <PlayerCardBlock key={i} card={c} parRef={pkg.parReference} />)}
      </section>

      {/* 8. Sub-12 com histórico */}
      <section>
        <h3>8. Sub-12 inscritos Nacional com histórico Aroeira II</h3>
        {sub12CardsCom.length === 0
          ? <div className="muted fs-13">Nenhum (fora dos Top 21).</div>
          : sub12CardsCom.map((c, i) => <PlayerCardBlock key={i} card={c} parRef={pkg.parReference} />)}
      </section>

      {/* 8b. Tabela Sub-12 dedicada */}
      <section>
        <h3>9. Sub-12 — performance no Aroeira II</h3>
        <div className="muted fs-12" style={{ marginBottom: 8 }}>
          Cruzamento dos jogadores que estão inscritos no Campeonato Nacional de Jovens Sub-12 H 2026 (1-3 Maio, tcode 10941) com o histórico no campo. Inclui Manuel mesmo que não esteja na lista de inscritos.
        </div>
        <table className="sc-lb">
          <thead>
            <tr>
              <th className="lb-pos">#</th>
              <SortableHdr k="name" sortKey={s12Sort.sortKey} sortDir={s12Sort.sortDir} onSort={s12Sort.toggleSort} className="lb-name" style={{ textAlign: "left" }}>Jogador</SortableHdr>
              <SortableHdr k="club" sortKey={s12Sort.sortKey} sortDir={s12Sort.sortDir} onSort={s12Sort.toggleSort} className="lb-club" style={{ textAlign: "left" }}>Clube</SortableHdr>
              <SortableHdr k="hcp" sortKey={s12Sort.sortKey} sortDir={s12Sort.sortDir} onSort={s12Sort.toggleSort} className="lb-hcp">HCP</SortableHdr>
              <SortableHdr k="status" sortKey={s12Sort.sortKey} sortDir={s12Sort.sortDir} onSort={s12Sort.toggleSort} className="lb-name" style={{ textAlign: "left" }}>Estado</SortableHdr>
              <SortableHdr k="rds" sortKey={s12Sort.sortKey} sortDir={s12Sort.sortDir} onSort={s12Sort.toggleSort} className="lb-hole">Rds</SortableHdr>
              <SortableHdr k="avgToPar" sortKey={s12Sort.sortKey} sortDir={s12Sort.sortDir} onSort={s12Sort.toggleSort} className="lb-topar">Avg ±</SortableHdr>
              <SortableHdr k="avgGross" sortKey={s12Sort.sortKey} sortDir={s12Sort.sortDir} onSort={s12Sort.toggleSort} className="lb-gross">Avg G</SortableHdr>
              <SortableHdr k="best" sortKey={s12Sort.sortKey} sortDir={s12Sort.sortDir} onSort={s12Sort.toggleSort} className="lb-hole">Best</SortableHdr>
              <SortableHdr k="worst" sortKey={s12Sort.sortKey} sortDir={s12Sort.sortDir} onSort={s12Sort.toggleSort} className="lb-hole">Worst</SortableHdr>
              <SortableHdr k="last" sortKey={s12Sort.sortKey} sortDir={s12Sort.sortDir} onSort={s12Sort.toggleSort} className="lb-hole">Última</SortableHdr>
              <SortableHdr k="date" sortKey={s12Sort.sortKey} sortDir={s12Sort.sortDir} onSort={s12Sort.toggleSort} className="lb-name" style={{ textAlign: "left" }}>Data</SortableHdr>
            </tr>
          </thead>
          <tbody>
            {sortedSub12Perf.map((s, i) => {
              const isManuel = s.fedCode === MANUEL_FED;
              const statusLabel = s.status === "top21+inscrito" ? "🏆 jogou + inscrito" : s.status === "top21_so" ? "🏆 só jogou" : s.status === "inscrito_com_historico" ? "📋 inscrito + histórico" : "🆕 estreante";
              const statusColor = s.status === "top21+inscrito" ? "var(--color-good)" : s.status === "top21_so" ? "var(--chart-8)" : s.status === "inscrito_com_historico" ? "var(--color-info)" : "var(--color-orange)";
              return (
                <tr key={i} style={{ background: isManuel ? "var(--bg-success-subtle)" : undefined }}>
                  <td className="lb-pos fw-700">{i + 1}</td>
                  <td className="lb-name fw-600">{s.fedCode ? <PlayerLink fed={s.fedCode} name={s.name} /> : s.name}{isManuel && " ⭐"}</td>
                  <td className="lb-club muted">{s.club || "–"}</td>
                  <td className="lb-hcp">{fmtHcp(s.hcpExact)}</td>
                  <td className="lb-name fs-11" style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</td>
                  <td className="lb-hole fw-600">{s.nRounds}</td>
                  <td className="lb-topar fw-700" style={{ color: s.avgToPar != null && s.avgToPar < 0 ? "var(--color-good)" : s.avgToPar != null && s.avgToPar > 0 ? "var(--color-danger)" : "var(--text)" }}>{s.avgToPar != null ? fmtDelta(s.avgToPar, 1) : "–"}</td>
                  <td className="lb-gross">{fmtAvg(s.avgGross, 1)}</td>
                  <td className="lb-hole fw-600">{s.bestGross ?? "–"}</td>
                  <td className="lb-hole muted">{s.worstGross ?? "–"}</td>
                  <td className="lb-hole">{s.lastGross ?? "–"}</td>
                  <td className="lb-name muted fs-11">{s.lastDate ? s.lastDate.slice(0, 10) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="muted fs-11" style={{ marginTop: 6 }}>
          Estados: 🏆 jogou + inscrito = jogou o PJA Aroeira Masters 2026 e está inscrito no Nacional · 🏆 só jogou = jogou o PJA mas não está inscrito (ex: Manuel tem fed que pode não estar na lista) · 📋 inscrito + histórico = inscrito Sub-12 com rondas anteriores · 🆕 estreante = inscrito Sub-12 sem rondas no Aroeira II.
        </div>
      </section>

      {/* 9. Cronologia + evolução */}
      <section>
        <h3>10. Scorecards Sub-12 cronológicos — todos juntos</h3>
        <div className="muted fs-12" style={{ marginBottom: 8 }}>{cronoRounds.length} rondas, ordenadas por data ascendente. Cada linha é uma ronda.</div>
        <div className="bjgt-chart-scroll">
          <table className="sc-lb sc-lb-with-sc">
            <thead>
              <tr>
                <th className="lb-pos">#</th>
                <th className="lb-name" style={{ textAlign: "left", minWidth: 180 }}>Data / Torneio</th>
                <th className="lb-name" style={{ textAlign: "left", minWidth: 160 }}>Jogador</th>
                <th className="lb-hcp">HCP</th>
                <th className="lb-topar">±</th>
                <th className="lb-gross">Tot</th>
                {pkg.parReference.slice(0, 9).map((_, i) => <th key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{i + 1}</th>)}
                <th className="lb-halftot">Out</th>
                {pkg.parReference.slice(9).map((_, i) => <th key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{i + 10}</th>)}
                <th className="lb-halftot">In</th>
              </tr>
              <tr className="lb-par-row">
                <td colSpan={4} className="lb-par-lbl">PAR</td>
                <td className="lb-topar"></td>
                <td className="lb-gross">{pkg.parReference.reduce((a, b) => a + b, 0)}</td>
                {pkg.parReference.slice(0, 9).map((p, i) => <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{p}</td>)}
                <td className="lb-halftot">{parF9Ref}</td>
                {pkg.parReference.slice(9).map((p, i) => <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{p}</td>)}
                <td className="lb-halftot">{parB9Ref}</td>
              </tr>
            </thead>
            <tbody>
              {cronoRounds.map((r, idx) => {
                const f9 = r.scores.slice(0, 9).reduce((a, b) => a + b, 0);
                const b9 = r.scores.slice(9, 18).reduce((a, b) => a + b, 0);
                const isManuel = r.fedCode === MANUEL_FED;
                const rPars = r.pars && r.pars.length === 18 ? r.pars : pkg.parReference;
                const rParF9 = rPars.slice(0, 9).reduce((a, b) => a + b, 0);
                const rParB9 = rPars.slice(9, 18).reduce((a, b) => a + b, 0);
                return (
                  <tr key={idx} style={{ background: isManuel ? "var(--bg-success-subtle)" : undefined }}>
                    <td className="lb-pos muted fs-11">{idx + 1}</td>
                    <td className="lb-name muted fs-11" style={{ whiteSpace: "nowrap" }}>{r.date.slice(0, 10)} · R{r.round} · {r.tournamentName}</td>
                    <td className="lb-name fw-600">{r.fedCode ? <PlayerLink fed={r.fedCode} name={r.playerName} /> : r.playerName}{isManuel && " ⭐"}</td>
                    <td className="lb-hcp fs-11">{fmtHcp(r.hcpExact)}</td>
                    <td className="lb-topar fw-700" style={{ color: r.toPar != null && r.toPar < 0 ? "var(--color-good)" : r.toPar != null && r.toPar > 0 ? "var(--color-danger)" : "var(--text)" }}>{r.toPar != null ? fmtToPar(r.toPar) : "–"}</td>
                    <td className="lb-gross fw-700">{r.gross ?? "–"}</td>
                    {r.scores.slice(0, 9).map((sc, i) => (
                      <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
                        <span className={"sc-score " + scClass(sc, rPars[i] ?? 4)}>{sc || ""}</span>
                      </td>
                    ))}
                    <td className="lb-halftot">{f9} <span className="fs-10 c-text-3">({fmtToPar(f9 - rParF9)})</span></td>
                    {r.scores.slice(9, 18).map((sc, i) => (
                      <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
                        <span className={"sc-score " + scClass(sc, rPars[9 + i] ?? 4)}>{sc || ""}</span>
                      </td>
                    ))}
                    <td className="lb-halftot">{b9} <span className="fs-10 c-text-3">({fmtToPar(b9 - rParB9)})</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 11. Análise de evolução */}
      <section>
        <h3>11. Evolução por jogador</h3>
        <div className="muted fs-12" style={{ marginBottom: 8 }}>
          Slope = pancadas por ronda (negativo = a melhorar). Δ first→last = última ronda menos primeira. Δ trend = média da 2ª metade menos média da 1ª. Ordenado por melhor evolução.
        </div>
        <table className="sc-lb">
          <thead>
            <tr>
              <th className="lb-pos">#</th>
              <SortableHdr k="name" sortKey={evSort.sortKey} sortDir={evSort.sortDir} onSort={evSort.toggleSort} className="lb-name" style={{ textAlign: "left" }}>Jogador</SortableHdr>
              <SortableHdr k="hcp" sortKey={evSort.sortKey} sortDir={evSort.sortDir} onSort={evSort.toggleSort} className="lb-hcp">HCP</SortableHdr>
              <SortableHdr k="rds" sortKey={evSort.sortKey} sortDir={evSort.sortDir} onSort={evSort.toggleSort} className="lb-hole">Rds</SortableHdr>
              <SortableHdr k="best" sortKey={evSort.sortKey} sortDir={evSort.sortDir} onSort={evSort.toggleSort} className="lb-hole">Best</SortableHdr>
              <SortableHdr k="last" sortKey={evSort.sortKey} sortDir={evSort.sortDir} onSort={evSort.toggleSort} className="lb-hole">Última</SortableHdr>
              <SortableHdr k="lastVsBest" sortKey={evSort.sortKey} sortDir={evSort.sortDir} onSort={evSort.toggleSort} className="lb-hole">Última−Best</SortableHdr>
              <SortableHdr k="slope" sortKey={evSort.sortKey} sortDir={evSort.sortDir} onSort={evSort.toggleSort} className="lb-hole">Slope</SortableHdr>
              <SortableHdr k="firstToLast" sortKey={evSort.sortKey} sortDir={evSort.sortDir} onSort={evSort.toggleSort} className="lb-hole">Δ first→last</SortableHdr>
              <SortableHdr k="trendDelta" sortKey={evSort.sortKey} sortDir={evSort.sortDir} onSort={evSort.toggleSort} className="lb-hole">Δ trend</SortableHdr>
              <SortableHdr k="trend" sortKey={evSort.sortKey} sortDir={evSort.sortDir} onSort={evSort.toggleSort} className="lb-name" style={{ textAlign: "left" }}>Tendência</SortableHdr>
            </tr>
          </thead>
          <tbody>
            {sortedEvolution.map((e, i) => {
              const isManuel = e.fedCode === MANUEL_FED;
              return (
                <tr key={i} style={{ background: isManuel ? "var(--bg-success-subtle)" : undefined }}>
                  <td className="lb-pos fw-700">{i + 1}</td>
                  <td className="lb-name fw-600">{e.fedCode ? <PlayerLink fed={e.fedCode} name={e.name} /> : e.name}{isManuel && " ⭐"}</td>
                  <td className="lb-hcp">{fmtHcp(e.hcpExact)}</td>
                  <td className="lb-hole">{e.rounds.length}</td>
                  <td className="lb-hole fw-600">{e.bestGross ?? "–"}</td>
                  <td className="lb-hole">{e.lastGross ?? "–"}</td>
                  <td className="lb-hole" style={{ color: e.lastVsBest != null && e.lastVsBest <= 2 ? "var(--color-good)" : e.lastVsBest != null && e.lastVsBest >= 8 ? "var(--color-danger)" : "var(--text-muted)" }}>{e.lastVsBest != null ? "+" + e.lastVsBest : "–"}</td>
                  <td className="lb-hole fw-700" style={{ color: e.slope < -0.5 ? "var(--color-good)" : e.slope > 0.5 ? "var(--color-danger)" : "var(--text)" }}>{fmtDelta(e.slope, 2)}</td>
                  <td className="lb-hole" style={{ color: e.firstToLast != null && e.firstToLast < 0 ? "var(--color-good)" : e.firstToLast != null && e.firstToLast > 0 ? "var(--color-danger)" : "var(--text)" }}>{fmtDelta(e.firstToLast, 0)}</td>
                  <td className="lb-hole" style={{ color: e.trendDelta != null && e.trendDelta < 0 ? "var(--color-good)" : e.trendDelta != null && e.trendDelta > 0 ? "var(--color-danger)" : "var(--text)" }}>{fmtDelta(e.trendDelta, 1)}</td>
                  <td className="lb-name fw-600">{e.trendLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

    </div>
  );
}
