/**
 * Vista «Ecléticos»: eclético do jogador em cada 9 buracos — os três 9 do
 * Santo da Serra (Machico, Desertas, Serras) e os campos de 9 buracos jogados
 * duas vezes (Miramar, Jamor…). Um cartão por 9 (lado a lado quando cabem),
 * com o eclético e, a abrir no «▸ N voltas», as voltas de cada data.
 * Tee: o escolhido em cima; num 9 sem voltas nesse tee usa-se o da volta mais
 * recente desse 9 (e mostra-se a pill).
 */
import { useMemo, useState } from "react";
import { soma, somaDe } from "../utils/mathUtils";
import type { PlayerPageData } from "../data/playerDataLoader";
import { eclecticos9, type LoopEclectic, type LoopTee } from "../data/sserraLoops";
import { useCamposDe9 } from "../hooks/useCamposDe9";
import { getTeeHex, textOnColor } from "../utils/teeColors";
import { fmtToPar, shortDateSlash } from "../utils/format";
import { toneClass } from "../utils/scoreDisplay";
import ScoreCircle from "./ScoreCircle";
import TeeDots from "./TeeDots";
import { Tint } from "./DataStyle";
import ExpandArrow from "./ExpandArrow";
import { MUTED } from "./tableCells";
import SectionTitle from "./SectionTitle";

const corPar = (d: number) => toneClass(d, { muted: true });
/** Voltas (dias), não metades: uma volta de 18 num 9 jogado 2× conta uma vez. */
const nVoltas = (t: LoopTee) => new Set(t.rounds.map(r => r.scoreId)).size;

function TotalCel({ g, pars }: { g: (number | null)[]; pars: readonly number[] }) {
  const gt = soma(g), pt = somaDe(g, (v, i) => (v != null ? pars[i] : 0));
  return (
    <td className="col-total fw-700">
      <div className="ec-sum-g">{gt || ""}</div>
      {gt > 0 && <div className={`ec-sum-tp ${corPar(gt - pt)}`}>{fmtToPar(gt - pt)}</div>}
    </td>
  );
}

function CartaoNove({ grupo, l }: { grupo: string; l: LoopEclectic }) {
  const [aberto, setAberto] = useState(false);
  const [teeKey, setTeeKey] = useState(l.tees[0]?.teeKey);
  const t: LoopTee = l.tees.find(x => x.teeKey === teeKey) ?? l.tees[0];
  const pars = t.pars; // os pares deste tee (podem diferir de tee para tee)
  const parTot = soma(pars);
  const hx = getTeeHex(t.teeName), fg = textOnColor(hx);
  return (
    <div className="ecPillBlock ecActive overflow-hidden br-lg u-d-inline-flex u-fd-column u-maxw-100pc">
      {/* width 0 + min-width 100%: o cabeçalho não alarga o cartão — dobra
          dentro da largura da tabela. */}
      <div className="fw-600 fs-12 ecPillHeader u-d-flex u-fwr-wrap u-gap-6px u-ai-center u-w-0 u-minw-100pc u-box-sizing-border-box">
        {grupo !== l.nome && <span className="muted">{grupo} ·</span>}
        <span className="fw-700">{l.nome}</span>
        <span className="muted">· Eclético</span>
        <span className="fw-700">{t.total ?? "–"}</span>
        {t.total != null && <span className={`fw-700 ${corPar(t.total - parTot)}`}>{fmtToPar(t.total - parTot)}</span>}
        <button type="button" className="fs-12 lec-toggle" onClick={() => setAberto(v => !v)}>
          <ExpandArrow open={aberto} /> {nVoltas(t)} volta{nVoltas(t) === 1 ? "" : "s"}
        </button>
        <TeeDots active={t.teeKey} onSelect={setTeeKey}
          tees={l.tees.map(x => ({ key: x.teeKey, name: x.teeName, title: `${x.teeName} · ${nVoltas(x)} volta${nVoltas(x) === 1 ? "" : "s"}` }))} />
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
                  {t.best[i] != null ? <ScoreCircle gross={t.best[i]!} par={p} /> : MUTED}
                </td>
              ))}
              {t.total != null ? (
                <td className="col-total fw-700">
                  <div className="ec-sum-g">{t.total}</div>
                  <div className={`ec-sum-tp ${corPar(t.total - parTot)}`}>{fmtToPar(t.total - parTot)}</div>
                </td>
              ) : <TotalCel g={t.best} pars={pars} />}
              {aberto && <td className="ec-extra" />}
            </tr>
            {aberto && t.rounds.map(r => (
              <tr key={`${r.scoreId}|${r.g.join()}`} className="ec-round-row">
                <td className="row-label">
                  <Tint className="p p-sm" bg={hx} fg={fg}>{shortDateSlash(r.date, true)}</Tint>
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
      <SectionTitle as="div" size="sm">Ecléticos de 9 buracos</SectionTitle>
      <div className="u-d-flex u-fwr-wrap u-gap-12px u-ai-flex-start">
        {grupos.flatMap(g => g.linhas.filter(l => l.tees.length).map(l => (
          <CartaoNove key={`${g.grupo}|${l.nome}`} grupo={g.grupo} l={l} />
        )))}
      </div>
    </div>
  );
}
