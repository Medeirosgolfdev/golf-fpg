/**
 * HcpEvolution.tsx — Análise de evolução de HCP de uma coorte
 *
 * Substitui o antigo HcpEvolutionChart (CrossAnalysis): em vez de um "esparguete"
 * de dezenas de linhas com 6 cores repetidas, mostra
 *   1) um gráfico limpo com DESTAQUE + CONTEXTO (jogadores escolhidos a cor,
 *      os restantes em cinza ténue), eixo Y intuitivo (HCP melhor no topo) e
 *      outliers já filtrados na origem (HCP > 54 removido no pipeline);
 *   2) uma tabela ORDENÁVEL de métricas de evolução por jogador
 *      (início → actual, Δ, melhor, declive por mês).
 *
 * Alimentado pelos jogadores filtrados da /jogadores-por-ano + hcp-history.json.
 */
import { useEffect, useMemo, useState } from "react";
import type { HcpHistoryDb } from "../data/hcpHistoryLoader";
import { computeEvoMetrics, pointsInWindow, type EvoMetrics } from "../utils/hcpEvolution";
import { MONTHS_PT } from "../utils/format";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";
import SexBadge from "./SexBadge";

export interface EvoPlayer {
  fed: string;
  name: string;
  sex?: string;
  club?: string;
  escalao?: string;
}

/** Paleta de séries — cores distintas e legíveis (até 8 destaques em simultâneo). */
const PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706",
  "#9333ea", "#0891b2", "#db2777", "#65a30d",
];

const PERIODS: { v: number; label: string }[] = [
  { v: 3, label: "3 meses" },
  { v: 6, label: "6 meses" },
  { v: 12, label: "12 meses" },
  { v: 24, label: "24 meses" },
  { v: 0, label: "Tudo" },
];

type Row = { p: EvoPlayer; m: EvoMetrics };
type SortKey = "nome" | "pontos" | "inicio" | "actual" | "delta" | "best" | "slope";

function fmtMonth(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}

function DeltaCell({ d }: { d: number }) {
  if (d === 0) return <span className="muted">0</span>;
  const improved = d < 0;
  return (
    <span style={{ color: improved ? "var(--color-good)" : "var(--color-danger)", fontWeight: 700 }}>
      {improved ? "▼" : "▲"} {d > 0 ? "+" : ""}{d.toFixed(1)}
    </span>
  );
}

export default function HcpEvolution({ players, history }: {
  players: EvoPlayer[]; history: HcpHistoryDb;
}) {
  const [period, setPeriod] = useState(12);
  const [focused, setFocused] = useState<string[]>([]);
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("delta", "asc", {
    pontos: "desc", best: "asc", inicio: "asc", actual: "asc", slope: "asc", delta: "asc", nome: "asc",
  });

  const cutoff = period > 0 ? Date.now() - period * 30.44 * 86400000 : 0;

  // Métricas por jogador (só os que têm histórico válido na janela escolhida).
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const p of players) {
      const m = computeEvoMetrics(history[p.fed], cutoff);
      if (m) out.push({ p, m });
    }
    return out;
  }, [players, history, cutoff]);

  // Foco por defeito: o melhor "evoluidor" (Δ mais negativo) com ≥ 3 pontos.
  useEffect(() => {
    setFocused(prev => {
      const valid = prev.filter(f => rows.some(r => r.p.fed === f));
      if (valid.length > 0) return valid;
      const best = [...rows].filter(r => r.m.nPts >= 3).sort((a, b) => a.m.delta - b.m.delta)[0];
      return best ? [best.p.fed] : [];
    });
  }, [rows]);

  const colorFor = (fed: string) => PALETTE[focused.indexOf(fed) % PALETTE.length];
  const toggleFocus = (fed: string) =>
    setFocused(prev => prev.includes(fed)
      ? prev.filter(f => f !== fed)
      : [...prev, fed].slice(-PALETTE.length)); // não passar do tamanho da paleta

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...rows];
    arr.sort((a, b) => {
      switch (sortKey) {
        case "nome":   return dir * a.p.name.localeCompare(b.p.name, "pt");
        case "pontos": return dir * (a.m.nPts - b.m.nPts);
        case "inicio": return dir * (a.m.start - b.m.start);
        case "actual": return dir * (a.m.end - b.m.end);
        case "delta":  return dir * (a.m.delta - b.m.delta);
        case "best":   return dir * (a.m.best - b.m.best);
        case "slope":  return dir * ((a.m.slopePerMonth ?? 0) - (b.m.slopePerMonth ?? 0));
        default:       return 0;
      }
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  if (players.length === 0) return null;
  if (rows.length === 0) {
    return (
      <div className="card" style={{ padding: "12px 14px" }}>
        <div className="h-xs fs-14 mb-8">📈 Evolução de HCP</div>
        <div className="muted fs-12">
          Sem histórico de HCP para estes jogadores nesta janela. Os dados vêm de{" "}
          <code>hcp-history.json</code> — corre <code>node scripts/enrich-players.js</code> no PC para o gerar/actualizar.
        </div>
      </div>
    );
  }

  /* ── Geometria do gráfico ─────────────────────────────────────── */
  const W = 860, H = 320;
  const PAD = { top: 16, right: 16, bottom: 26, left: 42 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Limites calculados por loop (evita spread em arrays muito grandes).
  let minD = Infinity, maxD = -Infinity, minH = Infinity, maxH = -Infinity;
  for (const r of rows) {
    for (const pt of pointsInWindow(history[r.p.fed], cutoff)) {
      if (pt.d < minD) minD = pt.d;
      if (pt.d > maxD) maxD = pt.d;
      if (pt.h < minH) minH = pt.h;
      if (pt.h > maxH) maxH = pt.h;
    }
  }
  const rangeD = maxD - minD || 1;
  const rangeH = maxH - minH || 1;

  // Y intuitivo: HCP MENOR (melhor) no TOPO.
  const sx = (d: number) => PAD.left + (d - minD) / rangeD * plotW;
  const sy = (h: number) => PAD.top + (h - minH) / rangeH * plotH;

  const pathFor = (fed: string) => {
    const pts = pointsInWindow(history[fed], cutoff);
    if (pts.length < 2) return null;
    return pts.map((pt, i) => `${i === 0 ? "M" : "L"} ${sx(pt.d).toFixed(1)} ${sy(pt.h).toFixed(1)}`).join(" ");
  };

  const yTicks = Array.from({ length: 5 }, (_, i) => minH + (i / 4) * rangeH);
  const xTicks = [minD, minD + rangeD / 2, maxD];
  const focusSet = new Set(focused);

  return (
    <div className="card" style={{ padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
        <div className="h-xs fs-14">📈 Evolução de HCP <span className="muted fs-11">({rows.length} jogadores com histórico)</span></div>
        <label className="fs-12" style={{ marginLeft: "auto" }}>
          Período:{" "}
          <select value={period} onChange={e => setPeriod(Number(e.target.value))} style={{ padding: "4px 8px" }}>
            {PERIODS.map(p => <option key={p.v} value={p.v}>{p.label}</option>)}
          </select>
        </label>
      </div>

      <div className="scroll-x">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", minWidth: 520 }}
          role="img" aria-label="Evolução do HCP ao longo do tempo">
          {/* Grelha + rótulos Y (HCP melhor no topo) */}
          {yTicks.map((h, i) => {
            const y = sy(h);
            return (
              <g key={`y${i}`}>
                <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--border-light)" strokeDasharray="2,3" />
                <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-3)">{h.toFixed(1)}</text>
              </g>
            );
          })}
          {/* Rótulos X */}
          {xTicks.map((d, i) => (
            <text key={`x${i}`} x={sx(d)} y={H - 8} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
              fontSize={10} fill="var(--text-3)">{fmtMonth(d)}</text>
          ))}
          <text x={PAD.left - 6} y={PAD.top - 4} textAnchor="end" fontSize={9} fill="var(--text-3)">melhor ↑</text>

          {/* Contexto — todos a cinza ténue */}
          {rows.map(r => {
            if (focusSet.has(r.p.fed)) return null;
            const d = pathFor(r.p.fed);
            return d ? <path key={r.p.fed} d={d} stroke="var(--text-3)" strokeWidth={1} fill="none" opacity={0.18} /> : null;
          })}
          {/* Destaque — por cima, a cor + pontos com tooltip nativo */}
          {focused.map(fed => {
            const d = pathFor(fed);
            if (!d) return null;
            const color = colorFor(fed);
            const pts = pointsInWindow(history[fed], cutoff);
            const name = rows.find(r => r.p.fed === fed)?.p.name ?? fed;
            return (
              <g key={fed}>
                <path d={d} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
                {pts.map((pt, i) => (
                  <circle key={i} cx={sx(pt.d)} cy={sy(pt.h)} r={2.4} fill={color}>
                    <title>{`${name} · ${fmtMonth(pt.d)} · HCP ${pt.h.toFixed(1)}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Chips de selecção — clicar destaca/remove */}
      <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
        <span className="muted fs-10" style={{ alignSelf: "center", fontWeight: 700 }}>Destacar:</span>
        {sortedRows.map(r => {
          const isOn = focusSet.has(r.p.fed);
          const color = isOn ? colorFor(r.p.fed) : undefined;
          return (
            <button key={r.p.fed} onClick={() => toggleFocus(r.p.fed)}
              title={`${r.m.start.toFixed(1)} → ${r.m.end.toFixed(1)} (Δ ${r.m.delta > 0 ? "+" : ""}${r.m.delta.toFixed(1)})`}
              style={{
                padding: "3px 8px", fontSize: "var(--fs-11)", borderRadius: 4, cursor: "pointer",
                background: isOn ? color + "22" : "var(--bg-muted)",
                border: `1px solid ${isOn ? color : "var(--border)"}`,
                color: isOn ? "var(--text-1)" : "var(--text-3)",
                fontWeight: isOn ? 700 : 400,
              }}>
              {r.p.name}
            </button>
          );
        })}
        {focused.length > 0 && (
          <button className="p p-sm p-muted" onClick={() => setFocused([])} title="Limpar destaques">✕</button>
        )}
      </div>

      {/* Tabela de métricas de evolução — ordenável */}
      <div className="scroll-x" style={{ marginTop: 12 }}>
        <table className="dtable fs-12" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th className="r" style={{ width: 26 }}>#</th>
              <SortableHdr k="nome" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Jogador</SortableHdr>
              <th>Sx</th>
              <SortableHdr k="pontos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Nº de rondas com índice na janela">Pts</SortableHdr>
              <SortableHdr k="inicio" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="HCP no início da janela">Início</SortableHdr>
              <SortableHdr k="actual" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="HCP mais recente">Actual</SortableHdr>
              <SortableHdr k="delta" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Variação na janela (negativo = melhorou)">Δ</SortableHdr>
              <SortableHdr k="best" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Melhor HCP na janela">Melhor</SortableHdr>
              <SortableHdr k="slope" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Declive da regressão (pontos de HCP por mês; negativo = a melhorar)">/mês</SortableHdr>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, i) => {
              const on = focusSet.has(r.p.fed);
              return (
                <tr key={r.p.fed} onClick={() => toggleFocus(r.p.fed)} style={{ cursor: "pointer" }}
                  className={on ? "cross-current" : ""}>
                  <td className="r" style={{ color: "var(--text-3)" }}>{i + 1}</td>
                  <td style={{ fontWeight: on ? 700 : 500, whiteSpace: "nowrap" }}>
                    {on && <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: colorFor(r.p.fed), marginRight: 6 }} />}
                    {r.p.name}
                  </td>
                  <td>{r.p.sex ? <SexBadge sex={r.p.sex} /> : <span className="muted">—</span>}</td>
                  <td className="r">{r.m.nPts}</td>
                  <td className="r">{r.m.start.toFixed(1)}</td>
                  <td className="r"><b>{r.m.end.toFixed(1)}</b></td>
                  <td className="r"><DeltaCell d={r.m.delta} /></td>
                  <td className="r">{r.m.best.toFixed(1)}</td>
                  <td className="r">
                    {r.m.slopePerMonth == null ? <span className="muted">—</span>
                      : <span style={{ color: r.m.slopePerMonth < 0 ? "var(--color-good)" : r.m.slopePerMonth > 0 ? "var(--color-danger)" : undefined }}>
                          {r.m.slopePerMonth > 0 ? "+" : ""}{r.m.slopePerMonth.toFixed(2)}
                        </span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
