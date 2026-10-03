/**
 * Vista «Ecléticos»: eclético do jogador em cada 9 buracos — os três 9 do
 * Santo da Serra (Machico, Desertas, Serras) e os campos de 9 buracos jogados
 * duas vezes (Miramar, Jamor…). Um cartão por 9 (lado a lado quando cabem),
 * com o eclético e, a abrir no «▸ N voltas», as voltas de cada data.
 * Tee: o escolhido em cima; num 9 sem voltas nesse tee usa-se o da volta mais
 * recente desse 9 (e mostra-se a pill).
 */
import { useMemo, useState } from "react";
import type { PlayerPageData } from "../data/playerDataLoader";
import { eclecticos9, type LoopEclectic, type LoopTee } from "../data/sserraLoops";
import { useCamposDe9 } from "../hooks/useCamposDe9";
import { getTeeHex, textOnColor } from "../utils/teeColors";
import { fmtToPar } from "../utils/format";
import { SC } from "../utils/scoreDisplay";
import ScoreCircle from "./ScoreCircle";

const soma = (g: (number | null)[]) => g.reduce<number>((s, v) => s + (v ?? 0), 0);
const corPar = (d: number) => (d > 0 ? SC.danger : d < 0 ? SC.good : SC.muted);
const dataCurta = (d: string) => (d || "").replace(/^(\d\d)-(\d\d)-\d\d(\d\d)$/, "$1/$2/$3");
/** Voltas (dias), não metades: uma volta de 18 num 9 jogado 2× conta uma vez. */
const nVoltas = (t: LoopTee) => new Set(t.rounds.map(r => r.scoreId)).size;
const semBorda = { background: "none", border: "none", padding: 0, cursor: "pointer" } as const;

function TotalCel({ g, pars }: { g: (number | null)[]; pars: readonly number[] }) {
  const gt = soma(g), pt = g.reduce<number>((s, v, i) => s + (v != null ? pars[i] : 0), 0);
  return (
    <td className="col-total fw-700">
      <div className="ec-sum-g">{gt || ""}</div>
      {gt > 0 && <div className="ec-sum-tp" style={{ color: corPar(gt - pt) }}>{fmtToPar(gt - pt)}</div>}
    </td>
  );
}

function CartaoNove({ grupo, l }: { grupo: string; l: LoopEclectic }) {
  const [aberto, setAberto] = useState(false);
  const [teeKey, setTeeKey] = useState(l.tees[0]?.teeKey);
  const t: LoopTee = l.tees.find(x => x.teeKey === teeKey) ?? l.tees[0];
  const pars = t.pars; // os pares deste tee (podem diferir de tee para tee)
  const parTot = pars.reduce((a, b) => a + b, 0);
  const hx = getTeeHex(t.teeName), fg = textOnColor(hx);
  return (
    <div className="ecPillBlock ecActive overflow-hidden br-lg" style={{ display: "inline-flex", flexDirection: "column", maxWidth: "100%" }}>
      {/* width 0 + min-width 100%: o cabeçalho não alarga o cartão — dobra
          dentro da largura da tabela. */}
      <div className="fw-600 fs-12 ecPillHeader" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", width: 0, minWidth: "100%", boxSizing: "border-box" }}>
        {grupo !== l.nome && <span className="muted">{grupo} ·</span>}
        <span className="fw-700">{l.nome}</span>
        <span className="muted">· Eclético</span>
        <span className="fw-700">{t.total ?? "–"}</span>
        {t.total != null && <span className="fw-700" style={{ color: corPar(t.total - parTot) }}>{fmtToPar(t.total - parTot)}</span>}
        <button type="button" className="fs-12" onClick={() => setAberto(v => !v)} style={{ ...semBorda, color: "var(--accent)" }}>
          {aberto ? "▾" : "▸"} {nVoltas(t)} voltas
        </button>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 5, alignItems: "center" }}>
          {l.tees.map(x => {
            const cor = getTeeHex(x.teeName), sel = x.teeKey === t.teeKey;
            return (
              <button key={x.teeKey} type="button" onClick={() => setTeeKey(x.teeKey)}
                title={`${x.teeName} · ${nVoltas(x)} voltas`} aria-label={x.teeName}
                style={{ ...semBorda, width: 14, height: 14, borderRadius: "50%", background: cor,
                  border: "1px solid var(--border)",
                  boxShadow: sel ? "0 0 0 2px var(--bg-card, #fff), 0 0 0 3.5px var(--text-2)" : "none",
                  opacity: sel ? 1 : 0.55 }} />
            );
          })}
        </span>
      </div>
      <div className="scroll-x">
        <table className="sc-table-ec sc-grid">
          <thead>
            <tr>
              <th className="row-label col-w60">Buraco</th>
              {pars.map((_, i) => <th key={i}>{i + 1}</th>)}
              <th className="col-total">Total</th>
              {aberto && <th className="ec-extra">Percurso</th>}
            </tr>
          </thead>
          <tbody>
            <tr className="ec-ref-row">
              <td className="row-label fw-700">Par</td>
              {pars.map((p, i) => <td key={i}>{p}</td>)}
              <td className="col-total fw-700">{parTot}</td>
              {aberto && <td className="ec-extra" />}
            </tr>
            {t.meters.some(m => m != null) && (
              <tr className="ec-ref-row">
                <td className="row-label">Metros</td>
                {t.meters.map((m, i) => <td key={i}>{m ?? ""}</td>)}
                <td className="col-total">{soma(t.meters) || ""}</td>
                {aberto && <td className="ec-extra" />}
              </tr>
            )}
            <tr className="ec-eclectic-row">
              <td className="row-label fw-700">Eclético</td>
              {pars.map((p, i) => (
                <td key={i} title={t.bestFrom[i] ? `Melhor a ${t.bestFrom[i]}` : undefined}>
                  {t.best[i] != null ? <ScoreCircle gross={t.best[i]!} par={p} /> : <span className="muted">–</span>}
                </td>
              ))}
              {t.total != null ? (
                <td className="col-total fw-700">
                  <div className="ec-sum-g">{t.total}</div>
                  <div className="ec-sum-tp" style={{ color: corPar(t.total - parTot) }}>{fmtToPar(t.total - parTot)}</div>
                </td>
              ) : <TotalCel g={t.best} pars={pars} />}
              {aberto && <td className="ec-extra" />}
            </tr>
            {aberto && t.rounds.map(r => (
              <tr key={`${r.scoreId}|${r.g.join()}`} className="ec-round-row">
                <td className="row-label">
                  <span className="p p-sm" style={{ background: hx, color: fg }}>{dataCurta(r.date)}</span>
                </td>
                {r.g.map((v, i) => <td key={i}><ScoreCircle gross={v} par={pars[i]} empty="dot" /></td>)}
                <TotalCel g={r.g} pars={pars} />
                <td className="ec-extra fs-10 muted">
                  {r.combo.length > 1 ? (r.combo[0] === r.combo[1] ? "18 (2×)" : r.combo.join("-")) : "9 bur."}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LoopEclecticSection({ data }: { data: PlayerPageData }) {
  const campos9 = useCamposDe9();
  const grupos = useMemo(() => eclecticos9(data, campos9), [data, campos9]);
  if (!grupos.length) return null;
  return (
    <div className="mb-16">
      <div className="fs-12 fw-700" style={{ marginBottom: 6 }}>Ecléticos de 9 buracos</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
        {grupos.flatMap(g => g.linhas.filter(l => l.tees.length).map(l => (
          <CartaoNove key={`${g.grupo}|${l.nome}`} grupo={g.grupo} l={l} />
        )))}
      </div>
    </div>
  );
}
