/**
 * Eclético do jogador em cada 9 buracos do Santo da Serra (Machico, Desertas,
 * Serras), juntando as voltas de 18 (as duas metades) e as de 9. Um bloco por
 * 9 buracos, com o tee escolhido por clique (por omissão o da volta mais recente).
 */
import { useMemo, useState } from "react";
import type { PlayerPageData } from "../data/playerDataLoader";
import { sserraLoopEclectics, type LoopEclectic } from "../data/sserraLoops";
import { getTeeHex, textOnColor } from "../utils/teeColors";
import { fmtToPar } from "../utils/format";
import { SC } from "../utils/scoreDisplay";
import ScoreCircle from "./ScoreCircle";
import TeePill from "./TeePill";

const somaPar = (pars: readonly number[], g: (number | null)[]) =>
  g.reduce<number>((s, v, i) => s + (v != null ? pars[i] : 0), 0);
const soma = (g: (number | null)[]) => g.reduce<number>((s, v) => s + (v ?? 0), 0);
const corPar = (d: number) => (d > 0 ? SC.danger : d < 0 ? SC.good : SC.muted);

function Bloco({ loop }: { loop: LoopEclectic }) {
  const [teeKey, setTeeKey] = useState(loop.tees[0]?.teeKey);
  const [verVoltas, setVerVoltas] = useState(false);
  const tee = loop.tees.find(t => t.teeKey === teeKey) ?? loop.tees[0];
  if (!tee) return null;
  const hx = getTeeHex(tee.teeName), fg = textOnColor(hx);
  const parTot = loop.pars.reduce((a, b) => a + b, 0);
  const totalCel = (g: (number | null)[]) => {
    const gt = soma(g), pt = somaPar(loop.pars, g);
    return (
      <td className="col-total fw-700">
        <div className="ec-sum-g">{gt || ""}</div>
        {gt > 0 && <div className="ec-sum-tp" style={{ color: corPar(gt - pt) }}>{fmtToPar(gt - pt)}</div>}
      </td>
    );
  };
  return (
    <div className="ecPillBlock ecActive overflow-hidden br-lg mt-8">
      <div className="fw-600 fs-12 ecPillHeader" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span className="fw-700">{loop.nome}</span>
        <span className="muted">par {parTot}</span>
        <span className="muted">· Eclético</span>
        <span className="fw-700">{tee.total ?? "–"}</span>
        {tee.total != null && <span className="fw-700" style={{ color: corPar(tee.total - parTot) }}>{fmtToPar(tee.total - parTot)}</span>}
        <button type="button" className="muted fs-12" onClick={() => setVerVoltas(v => !v)}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline dotted" }}>
          {verVoltas ? "▾" : "▸"} {tee.rounds.length} voltas
        </button>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {loop.tees.map(t => (
            <button key={t.teeKey} type="button" onClick={() => setTeeKey(t.teeKey)}
              title={`${t.rounds.length} voltas neste tee`}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", opacity: t.teeKey === tee.teeKey ? 1 : 0.45 }}>
              <TeePill name={t.teeName} />
            </button>
          ))}
        </span>
      </div>
      <div className="scroll-x">
        <table className="sc-table-ec sc-grid">
          <thead>
            <tr>
              <th className="row-label col-w60">Buraco</th>
              {loop.pars.map((_, i) => <th key={i}>{i + 1}</th>)}
              <th className="col-total">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="ec-ref-row">
              <td className="row-label fw-700">Par</td>
              {loop.pars.map((p, i) => <td key={i}>{p}</td>)}
              <td className="col-total fw-700">{parTot}</td>
            </tr>
            {tee.meters.some(m => m != null) && (
              <tr className="ec-ref-row">
                <td className="row-label">Distância</td>
                {tee.meters.map((m, i) => <td key={i}>{m ?? ""}</td>)}
                <td className="col-total">{soma(tee.meters) || ""}</td>
              </tr>
            )}
            <tr className="ec-eclectic-row">
              <td className="row-label fw-700">Eclético</td>
              {tee.best.map((v, i) => (
                <td key={i} title={tee.bestFrom[i] ? `Melhor: ${tee.bestFrom[i]}` : undefined}>
                  {v != null ? <ScoreCircle gross={v} par={loop.pars[i]} /> : "–"}
                </td>
              ))}
              {totalCel(tee.best)}
            </tr>
            {verVoltas && tee.rounds.map(r => (
              <tr key={r.scoreId} className="ec-round-row">
                <td className="row-label fw-700" title={r.combo.join(" → ")}>
                  <span className="p p-sm" style={{ background: hx, color: fg }}>{(r.date || "").replace(/^(\d\d)-(\d\d)-\d\d(\d\d)$/, "$1/$2/$3")}</span>
                </td>
                {r.g.map((v, i) => <td key={i}><ScoreCircle gross={v} par={loop.pars[i]} empty="dot" /></td>)}
                {totalCel(r.g)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LoopEclecticSection({ data }: { data: PlayerPageData }) {
  const loops = useMemo(() => sserraLoopEclectics(data), [data]);
  if (!loops.length) return null;
  return (
    <div className="card mb-16" style={{ padding: "10px 12px" }}>
      <div className="sc-bar-head"><span>Santo da Serra — eclético por 9 buracos</span></div>
      <div className="fs-11 muted" style={{ margin: "4px 0 2px" }}>
        Melhor resultado de sempre em cada buraco dos três 9 (Machico, Desertas, Serras), juntando as voltas de 18 buracos — as duas metades — e as de 9. Actualiza-se com cada volta nova.
      </div>
      {loops.map(l => <Bloco key={l.nome} loop={l} />)}
    </div>
  );
}
