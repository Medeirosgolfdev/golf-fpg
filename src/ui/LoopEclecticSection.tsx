/**
 * Vista «Ecléticos»: eclético do jogador em cada 9 buracos — os três 9 do
 * Santo da Serra (Machico, Desertas, Serras) e os campos de 9 buracos jogados
 * duas vezes (Miramar, Jamor…). Uma só tabela: uma linha por 9 com o eclético
 * e, por baixo, as voltas de cada data nesse 9 (fecham com ▾).
 * Tee: o escolhido em cima; numa linha sem voltas nesse tee usa-se o da volta
 * mais recente dessa linha (e mostra-se a pill).
 */
import React, { useMemo, useState } from "react";
import type { PlayerPageData } from "../data/playerDataLoader";
import { eclecticos9, type LoopEclectic } from "../data/sserraLoops";
import { getTeeHex, textOnColor } from "../utils/teeColors";
import { fmtToPar } from "../utils/format";
import { SC } from "../utils/scoreDisplay";
import ScoreCircle from "./ScoreCircle";
import TeePill from "./TeePill";

const soma = (g: (number | null)[]) => g.reduce<number>((s, v) => s + (v ?? 0), 0);
const corPar = (d: number) => (d > 0 ? SC.danger : d < 0 ? SC.good : SC.muted);
const dataCurta = (d: string) => (d || "").replace(/^(\d\d)-(\d\d)-\d\d(\d\d)$/, "$1/$2/$3");

function TotalCel({ g, pars }: { g: (number | null)[]; pars: readonly number[] }) {
  const gt = soma(g), pt = g.reduce<number>((s, v, i) => s + (v != null ? pars[i] : 0), 0);
  return (
    <td className="col-total fw-700">
      <div className="ec-sum-g">{gt || ""}</div>
      {gt > 0 && <div className="ec-sum-tp" style={{ color: corPar(gt - pt) }}>{fmtToPar(gt - pt)}</div>}
    </td>
  );
}

export function LoopEclecticSection({ data }: { data: PlayerPageData }) {
  const grupos = useMemo(() => eclecticos9(data), [data]);
  const linhas = useMemo(() => grupos.flatMap(g => g.linhas), [grupos]);
  const tees = useMemo(() => {
    const m = new Map<string, { teeName: string; ultima: number }>();
    for (const l of linhas) for (const t of l.tees) {
      const u = t.rounds[0]?.dateSort ?? 0;
      const cur = m.get(t.teeKey);
      if (!cur || u > cur.ultima) m.set(t.teeKey, { teeName: t.teeName, ultima: u });
    }
    return [...m.entries()].sort((a, b) => b[1].ultima - a[1].ultima).map(([teeKey, v]) => ({ teeKey, teeName: v.teeName }));
  }, [linhas]);
  const [teeKey, setTeeKey] = useState<string | null>(null);
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const alternar = (k: string) => setFechados(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  if (!linhas.length || !tees.length) return null;
  const escolhido = tees.find(t => t.teeKey === teeKey) ?? tees[0];
  const teeDe = (l: LoopEclectic) => l.tees.find(t => t.teeKey === escolhido.teeKey) ?? l.tees[0];

  return (
    <div className="card mb-16" style={{ padding: "8px 12px", width: "fit-content", maxWidth: "100%" }}>
      <div className="fs-12 fw-700" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 4 }}>
        <span>Ecléticos de 9 buracos</span>
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", marginLeft: 6 }}>
          {tees.map(t => (
            <button key={t.teeKey} type="button" onClick={() => setTeeKey(t.teeKey)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", opacity: t.teeKey === escolhido.teeKey ? 1 : 0.4 }}>
              <TeePill name={t.teeName} />
            </button>
          ))}
        </span>
      </div>
      <div className="scroll-x">
        <table className="sc-table-ec sc-grid">
          <thead>
            <tr>
              <th className="row-label col-w60">9 buracos</th>
              {Array.from({ length: 9 }, (_, i) => <th key={i}>{i + 1}</th>)}
              <th className="col-total">Total</th>
              <th className="ec-extra" title="Voltas neste 9 e neste tee">Voltas</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(gr => (
              <React.Fragment key={gr.grupo}>
                {gr.linhas.length > 1 && (
                  <tr><td colSpan={12} className="fs-11 fw-700 muted" style={{ textAlign: "left", paddingTop: 6 }}>{gr.grupo}</td></tr>
                )}
                {gr.linhas.map(l => {
                  const t = teeDe(l);
                  const chave = `${gr.grupo}|${l.nome}`;
                  const ver = !fechados.has(chave);
                  const parTot = l.pars.reduce((a, b) => a + b, 0);
                  const hx = getTeeHex(t.teeName), fg = textOnColor(hx);
                  return (
                    <React.Fragment key={chave}>
                      <tr className="ec-eclectic-row">
                        <td className="row-label fw-700">
                          {l.nome}
                          <div className="fs-10 muted fw-400">
                            par {parTot}{t.teeKey !== escolhido.teeKey && <> · <TeePill name={t.teeName} /></>}
                          </div>
                        </td>
                        {l.pars.map((p, i) => (
                          <td key={i} title={t.bestFrom[i] ? `Par ${p} · melhor a ${t.bestFrom[i]}` : `Par ${p}`}>
                            {t.best[i] != null ? <ScoreCircle gross={t.best[i]!} par={p} /> : <span className="muted">–</span>}
                            <div className="fs-10 muted">{p}</div>
                          </td>
                        ))}
                        <td className="col-total fw-700">
                          {t.total != null ? (
                            <>
                              <div className="ec-sum-g">{t.total}</div>
                              <div className="ec-sum-tp" style={{ color: corPar(t.total - parTot) }}>{fmtToPar(t.total - parTot)}</div>
                            </>
                          ) : <span className="muted">–</span>}
                        </td>
                        <td className="ec-extra">
                          <button type="button" className="fs-11" onClick={() => alternar(chave)}
                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--accent)" }}>
                            {ver ? "▾" : "▸"} {t.rounds.length}
                          </button>
                        </td>
                      </tr>
                      {ver && t.rounds.map(r => (
                        <tr key={`${r.scoreId}|${r.g.join()}`} className="ec-round-row">
                          <td className="row-label">
                            <span className="p p-sm" style={{ background: hx, color: fg }}>{dataCurta(r.date)}</span>
                          </td>
                          {r.g.map((v, i) => <td key={i}><ScoreCircle gross={v} par={l.pars[i]} empty="dot" /></td>)}
                          <TotalCel g={r.g} pars={l.pars} />
                          <td className="ec-extra fs-10 muted">
                            {r.combo.length > 1 ? (r.combo[0] === r.combo[1] ? "18 (2×)" : r.combo.join("-")) : "9 bur."}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
