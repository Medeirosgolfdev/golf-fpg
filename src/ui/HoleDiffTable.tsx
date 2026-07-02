/**
 * src/ui/HoleDiffTable.tsx
 *
 * Tabela partilhada de alcance buraco-a-buraco (metros + "apos drive/2a
 * pancada faltam", com X = green fora de alcance em regulacao). Aceita 1 ou 2
 * tees — com 2 mostra tambem a linha de diferenca (Delta). Usada na
 * "Vantagem de Tee" (/comparar) e na tab "Previsao". Fonte da formula de
 * alcance: utils/reach.
 */
import React, { useMemo } from "react";
import type { Tee } from "../data/types";
import { getTeeHex } from "../utils/teeColors";
import { buildReach, type HoleReach } from "../utils/reach";

const MONO = "var(--font-mono)";

export interface ReachTee { tee: Tee; label?: React.ReactNode }

function appCell(app: HoleReach["afterDrive"]) {
  if (app == null) return "–";
  return (
    <span
      style={{ fontFamily: MONO, color: app.reachable ? "var(--color-good-dark)" : "var(--color-warn-dark)", fontWeight: app.reachable ? 400 : 800 }}
      title={app.reachable
        ? "Metros que sobram para o green — alcançável em regulação"
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
    label: t.label ?? <span style={{ fontWeight: 700 }}>{t.tee.teeName}</span>,
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

  const two = data.length >= 2;
  const distAt = (i: number, h: number) => byHole[i].get(h)?.dist ?? null;
  const parAt = (h: number): number | null => {
    for (const m of byHole) { const r = m.get(h); if (r?.par != null) return r.par; }
    return null;
  };
  const totals = data.map((_, i) => holes.reduce((s, h) => s + (distAt(i, h) ?? 0), 0));
  const parTotal = data.length ? data[0].reach.reduce((s, r) => s + (r.par ?? 0), 0) : 0;

  const lblStyle: React.CSSProperties = {
    position: "sticky", left: 0, background: "var(--bg-card)", zIndex: "var(--z-base)",
    fontWeight: 700, fontSize: "var(--fs-12)", whiteSpace: "nowrap",
  };

  return (
    <div style={{ overflowX: "auto", paddingBottom: 14 }}>
      <table className="dtable">
        <thead>
          <tr>
            <th style={lblStyle}>Buraco</th>
            {holes.map(h => <th key={h} className="r" style={{ fontFamily: MONO }}>{h}</th>)}
            <th className="r" style={{ fontFamily: MONO }}>Σ</th>
          </tr>
        </thead>
        <tbody>
          {/* Par */}
          <tr>
            <td style={lblStyle}>Par</td>
            {holes.map(h => {
              const ps = byHole.map(m => m.get(h)?.par ?? null);
              const distinct = [...new Set(ps.filter(p => p != null))];
              return (
                <td key={h} className="r" style={{ fontFamily: MONO, color: "var(--text-3)" }}>
                  {distinct.length > 1 ? distinct.join("/") : (parAt(h) ?? "–")}
                </td>
              );
            })}
            <td className="r" style={{ fontFamily: MONO, color: "var(--text-3)" }}>{parTotal || "–"}</td>
          </tr>

          {/* Metros por tee */}
          {data.map((d, i) => (
            <tr key={"m" + i} style={{ background: d.hex + "1f" }}>
              <td style={lblStyle}>{d.label} <span style={{ fontWeight: 600 }}>(m)</span></td>
              {holes.map(h => <td key={h} className="r" style={{ fontFamily: MONO }}>{distAt(i, h) ?? "–"}</td>)}
              <td className="r" style={{ fontFamily: MONO, fontWeight: 800 }}>{totals[i] || "–"}</td>
            </tr>
          ))}

          {/* Delta (so com 2 tees) */}
          {two && (
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td style={lblStyle}>Δ (m)</td>
              {holes.map(h => {
                const a = distAt(0, h), b = distAt(1, h);
                const delta = a != null && b != null ? a - b : null;
                return (
                  <td key={h} className="r" style={{ fontFamily: MONO, fontWeight: delta != null && Math.abs(delta) >= 30 ? 800 : 400 }}>
                    {delta != null ? (delta > 0 ? "+" : "") + delta : "–"}
                  </td>
                );
              })}
              <td className="r" style={{ fontFamily: MONO, fontWeight: 800 }}>
                {totals[0] && totals[1] ? (totals[0] - totals[1] > 0 ? "+" : "") + (totals[0] - totals[1]) : "–"}
              </td>
            </tr>
          )}

          {/* Blocos por tee: apos drive + apos 2a pancada */}
          {data.map((d, i) => (
            <React.Fragment key={"blk" + i}>
              <tr style={{ background: d.hex + "1f", borderTop: "2px solid var(--border)" }}>
                <td style={lblStyle}>{d.label} <span style={{ fontWeight: 600 }}>· após drive faltam (m)</span></td>
                {holes.map(h => <td key={h} className="r">{appCell(byHole[i].get(h)?.afterDrive ?? null)}</td>)}
                <td />
              </tr>
              <tr style={{ background: d.hex + "1f" }}>
                <td style={lblStyle}>{d.label} <span style={{ fontWeight: 600 }}>· após 2ª pancada faltam (m)</span></td>
                {holes.map(h => <td key={h} className="r">{appCell(byHole[i].get(h)?.after2 ?? null)}</td>)}
                <td />
              </tr>
              {two && i === 0 && (
                <tr aria-hidden="true"><td colSpan={holes.length + 2} style={{ height: 12, padding: 0, border: "none", background: "transparent" }} /></tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
