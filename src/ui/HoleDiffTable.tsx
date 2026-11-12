/**
 * src/ui/HoleDiffTable.tsx
 *
 * Tabela partilhada de alcance buraco-a-buraco: par (com a cor da «Vista do
 * campo»), metros, o taco da 1.ª pancada (utils/clubScale — nem sempre o
 * driver), e o que falta para o green depois da 1.ª e da 2.ª pancada (⛳ = no
 * green, ✗ = green fora de alcance em regulação). Aceita 1 ou 2 tees — com 2
 * mostra também a linha de diferença (Δ) e pinta as linhas de cada tee.
 * Usada na "Vantagem de Tee" (/comparar) e na tab "Previsão". Fonte da
 * fórmula de alcance: utils/reach.
 */
import React, { useMemo } from "react";
import { fmtSign } from "../utils/format";
import type { Tee } from "../data/types";
import { getTeeHex } from "../utils/teeColors";
import { buildReach, type HoleReach } from "../utils/reach";
import { Tint } from "./DataStyle";
import { parHoleColors } from "./CourseHeroCard";


export interface ReachTee { tee: Tee; label?: React.ReactNode }

/** Metros que faltam para o green: ⛳ = chega; ✗ = fora de alcance em regulação. */
function appCell(app: HoleReach["afterDrive"]) {
  if (app == null) return null;
  if (app.m === 0 && app.reachable) return <span title="Chega ao green">⛳</span>;
  return (
    <span
      className={"mono " + (app.reachable ? "u-c-text-2 u-fw-400" : "u-c-color-warn-dark u-fw-800")}
      title={app.reachable
        ? "Metros que faltam para o green — alcançável em regulação"
        : "Green NÃO alcançável em regulação com o alcance configurado"}
    >
      {app.m.toFixed(0)}{app.reachable ? "" : "✗"}
    </span>
  );
}

export default function HoleDiffTable({ tees, driveM, secondM }: {
  tees: ReachTee[];
  driveM: number;
  secondM: number;
}) {
  const data = useMemo(() => tees.map(t => ({
    tee: t.tee,
    label: t.label ?? <span className="u-fw-700">{t.tee.teeName}</span>,
    reach: buildReach(t.tee, driveM, secondM),
    hex: getTeeHex(t.tee.teeName, t.tee.scorecardMeta?.teeColor),
  })), [tees, driveM, secondM]);

  const holes = useMemo(() => {
    const set = new Set<number>();
    for (const d of data) for (const r of d.reach) set.add(r.hole);
    return [...set].sort((a, b) => a - b);
  }, [data]);

  const byHole = useMemo(
    () => data.map(d => { const m = new Map<number, HoleReach>(); for (const r of d.reach) m.set(r.hole, r); return m; }),
    [data],
  );
  // Cor do par (a da «Vista do campo», pelo 1.º tee).
  const corPar = useMemo(() => (data[0] ? parHoleColors(data[0].tee) : new Map()), [data]);

  const two = data.length >= 2;
  const distAt = (i: number, h: number) => byHole[i].get(h)?.dist ?? null;
  const parAt = (h: number): number | null => {
    for (const m of byHole) { const r = m.get(h); if (r?.par != null) return r.par; }
    return null;
  };
  const totals = data.map((_, i) => holes.reduce((s, h) => s + (distAt(i, h) ?? 0), 0));
  const parTotal = data.length ? data[0].reach.reduce((s, r) => s + (r.par ?? 0), 0) : 0;
  // Com 1 tee não se pinta a linha (não há nada a distinguir); com 2, cada tee na sua cor.
  const fundo = (hex: string) => (two ? hex + "1f" : undefined);
  const rotulo = (d: (typeof data)[number], txt: string) => (two ? <>{d.label} <span className="u-fw-600">· {txt}</span></> : txt);

  return (
    <div className="u-ox-auto u-pb-14px">
      <table className="dtable hdt">
        <thead>
          <tr>
            <th className="hdt-lbl">Buraco</th>
            {holes.map(h => <th key={h} className="ta-c mono">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {/* Par — com a cor da «Vista do campo» */}
          <tr>
            <td className="hdt-lbl">Par <span className="muted fw-400">· {parTotal || "–"}</span></td>
            {holes.map(h => {
              const ps = byHole.map(m => m.get(h)?.par ?? null);
              const distinct = [...new Set(ps.filter(p => p != null))];
              const cor = corPar.get(h);
              const p = parAt(h);
              return (
                <td key={h} className="ta-c">
                  {distinct.length > 1 ? distinct.join("/")
                    : p != null && cor ? <Tint as="span" className="par-chip" bg={cor.bg} fg={cor.fg} bd={cor.border}>{p}</Tint>
                    : (p ?? "–")}
                </td>
              );
            })}
          </tr>

          {/* Metros por tee */}
          {data.map((d, i) => (
            <Tint as="tr" key={"m" + i} bg={fundo(d.hex)}>
              <td className="hdt-lbl">{two ? <>{d.label} <span className="u-fw-600">(m)</span></> : "Metros"} <span className="muted fw-400">· {totals[i] || "–"}</span></td>
              {holes.map(h => <td key={h} className="ta-c mono">{distAt(i, h) ?? "–"}</td>)}
            </Tint>
          ))}

          {/* Delta (so com 2 tees) */}
          {two && (
            <tr className="u-bt-2px-solid-border">
              <td className="hdt-lbl">Δ (m) <span className="muted fw-400">· {totals[0] && totals[1] ? fmtSign(totals[0] - totals[1]) : "–"}</span></td>
              {holes.map(h => {
                const a = distAt(0, h), b = distAt(1, h);
                const delta = a != null && b != null ? a - b : null;
                return (
                  <td key={h} className={"ta-c mono " + (delta != null && Math.abs(delta) >= 30 ? "u-fw-800" : "u-fw-400")}>
                    {delta != null ? fmtSign(delta) : "–"}
                  </td>
                );
              })}
            </tr>
          )}

          {/* Blocos por tee: pancada → faltam, até chegar ao green (no máximo 3
              pancadas). Quando chega, o ⛳ ocupa as linhas que sobram — sem
              células vazias (04/11/2026). */}
          {data.map((d, i) => {
            const passos = (h: number) => {
              const r = byHole[i].get(h);
              const f1 = r?.par === 3 && r.afterDrive?.reachable ? { m: 0, reachable: true } : r?.afterDrive ?? null;
              return { shots: [r?.first ?? null, r?.second ?? null, r?.third ?? null], faltam: [f1, r?.after2 ?? null, r?.after3 ?? null] };
            };
            // Linha (0..5) onde o buraco chega ao green: «faltam» = 0 e alcançável.
            const chega = (h: number) => {
              const p = passos(h);
              const k = p.faltam.findIndex(v => v != null && v.m === 0 && v.reachable);
              return k < 0 ? null : 2 * k + 1;
            };
            const nPanc = Math.max(1, ...holes.map(h => { const c = chega(h); return c == null ? 3 : (c + 1) / 2; }));
            const linhas = Array.from({ length: nPanc * 2 }, (_, li) => li);
            return (
              <React.Fragment key={"blk" + i}>
                {linhas.map(li => {
                  const k = Math.floor(li / 2), ePancada = li % 2 === 0;
                  const txt = ePancada ? `${k + 1}.ª pancada (taco · m)` : `faltam depois da ${k + 1}.ª (m)`;
                  return (
                    <Tint as="tr" key={li} className={(ePancada ? "hdt-shot" : "hdt-left") + (li === 0 ? " u-bt-2px-solid-border" : "")} bg={fundo(d.hex)}>
                      <td className="hdt-lbl">{rotulo(d, txt)}</td>
                      {holes.map(h => {
                        const c = chega(h);
                        if (c != null && li > c) return null;              // já está no green (célula de cima)
                        const p = passos(h);
                        if (c != null && li === c) {
                          return <td key={h} className="ta-c hdt-green" rowSpan={linhas.length - li}>{appCell(p.faltam[k])}</td>;
                        }
                        if (ePancada) {
                          const f = p.shots[k];
                          return (
                            <td key={h} className="ta-c" title={f ? `${f.club} — ~${f.m} m${k === 0 ? ` (${f.pct}% do drive)` : ""}` : undefined}>
                              {f ? <><span className="hdt-club">{f.abbr}</span><span className="hdt-club-m">{f.m}</span></> : "–"}
                            </td>
                          );
                        }
                        return <td key={h} className="ta-c">{appCell(p.faltam[k])}</td>;
                      })}
                    </Tint>
                  );
                })}
                {two && i === 0 && (
                  <tr aria-hidden="true"><td colSpan={holes.length + 1} className="u-h-12px u-p-0 u-bd-none u-bg-transparent" /></tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
