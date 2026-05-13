/**
 * kids2/components/EvolutionChart.tsx
 *
 * Linha temporal das performances do jogador. Eixo X = data, eixo Y = ±par.
 * Pontos coloridos por tipo de torneio (USKids/FPG/RFEG/...) com toggle de
 * eixo Y entre "±par" e "posição".
 *
 * Linha azul (suavizada) liga as observações ordenadas no tempo. Top-3
 * pinta o ponto a dourado/prata/bronze.
 */

import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Scatter, ComposedChart,
} from "recharts";
import type { CanonicalData, Junior, Tournament, Flight, Result } from "../data";

interface Props {
  data: CanonicalData;
  junior: Junior;
  filterTids?: Set<string> | null;
}

interface Point {
  date: string;        // YYYY-MM-DD
  ts: number;          // timestamp para X numérico
  toPar: number | null;
  pos: number | null;
  flight: string;
  tName: string;
  sourceId: string;
  trophy?: 1 | 2 | 3;
}

const SOURCE_COLORS: Record<string, string> = {
  uskids: "#2563eb",   // azul USKids
  fpg:    "#16a34a",   // verde FPG
  rfeg:   "#f59e0b",   // âmbar RFEG
  ffgolf: "#dc2626",   // vermelho FFG
  wjgc:   "#7c3aed",   // roxo WJGC
  eowagr: "#0891b2",   // ciano EOWAGR
  doral:  "#db2777",   // rosa Doral
};

const SOURCE_LABELS: Record<string, string> = {
  uskids: "USKids", fpg: "FPG", rfeg: "RFEG", ffgolf: "FFG",
  wjgc: "WJGC", eowagr: "EOWAGR", doral: "Doral",
};

export default function EvolutionChart({ data, junior, filterTids }: Props) {
  const [yMode, setYMode] = useState<"toPar" | "pos">("toPar");

  const points = useMemo<Point[]>(() => {
    const arr: Point[] = [];
    for (const tid of junior.tournamentIds) {
      if (filterTids && !filterTids.has(tid)) continue;
      const t = data.tournamentById.get(tid);
      if (!t) continue;
      for (const f of t.flights) {
        const r = f.results.find((x) => x.juniorId === junior.id);
        if (!r) continue;
        const date = t.date || t.startDate || "";
        if (!date) continue;
        const [y, m, d] = date.split("-").map(Number);
        if (!y || !m || !d) continue;
        const ts = new Date(y, m - 1, d).getTime();

        // toPar: usar r.toPar ou calcular
        const parTotal = f.par?.reduce((a, b) => a + (b || 0), 0) || t.parTotal || 0;
        const grosses = (r.rounds || []).map((rd) => rd.gross).filter((g): g is number => typeof g === "number");
        const total = r.totalGross ?? (grosses.length ? grosses.reduce((a, b) => a + b, 0) : null);
        const toPar = r.toPar ?? (total != null && parTotal && grosses.length ? total - parTotal * grosses.length : null);

        const trophy: 1 | 2 | 3 | undefined = typeof r.pos === "number" && r.pos <= 3 ? (r.pos as 1 | 2 | 3) : undefined;

        arr.push({
          date, ts,
          toPar: toPar ?? null,
          pos: typeof r.pos === "number" ? r.pos : null,
          flight: f.label,
          tName: t.shortName || t.name || tid,
          sourceId: t.sourceId,
          trophy,
        });
      }
    }
    arr.sort((a, b) => a.ts - b.ts);
    return arr;
  }, [data, junior, filterTids]);

  if (points.length < 2) {
    return (
      <section style={{ marginBottom: 14 }}>
        <h3 style={{ margin: "8px 0 10px", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Evolução</h3>
        <div style={{ fontSize: 12, color: "var(--text-3)", padding: "10px 12px", background: "var(--bg-muted)", borderRadius: 6 }}>
          Insuficiência de dados para representar evolução ({points.length} {points.length === 1 ? "ponto" : "pontos"}).
        </div>
      </section>
    );
  }

  // Eixo Y: para "pos", inverter (menor pos = melhor = topo)
  const yKey = yMode === "toPar" ? "toPar" : "pos";
  const yLabel = yMode === "toPar" ? "±par" : "posição";
  const yReversed = yMode === "pos";

  // Linha de referência: par (0) ou top-10
  const refY = yMode === "toPar" ? 0 : 10;
  const refLabel = yMode === "toPar" ? "par" : "Top 10";

  const sources = Array.from(new Set(points.map((p) => p.sourceId)));

  return (
    <section style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "8px 0 10px" }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Evolução</h3>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setYMode("toPar")}
            style={btnStyle(yMode === "toPar")}
          >±par</button>
          <button
            onClick={() => setYMode("pos")}
            style={btnStyle(yMode === "pos")}
          >Posição</button>
        </div>
      </div>

      <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 6px 6px" }}>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <ComposedChart data={points} margin={{ top: 6, right: 12, left: 0, bottom: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
              <XAxis
                dataKey="ts"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(ts) => {
                  const d = new Date(ts);
                  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
                }}
                tick={{ fontSize: 10, fill: "var(--text-3)" }}
                stroke="var(--border)"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-3)" }}
                stroke="var(--border)"
                reversed={yReversed}
                allowDecimals={false}
                width={40}
              />
              <Tooltip
                content={<CustomTooltip yMode={yMode} />}
              />
              <ReferenceLine
                y={refY}
                stroke="var(--text-3)"
                strokeDasharray="4 4"
                label={{ value: refLabel, fontSize: 9, fill: "var(--text-3)", position: "right" }}
              />
              {/* Linha-base ligando todos os pontos */}
              <Line
                type="monotone"
                dataKey={yKey}
                stroke="var(--color-info)"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              {/* Scatters coloridos por sourceId */}
              {sources.map((src) => (
                <Scatter
                  key={src}
                  name={SOURCE_LABELS[src] || src}
                  data={points.filter((p) => p.sourceId === src && p[yKey] != null)}
                  dataKey={yKey}
                  fill={SOURCE_COLORS[src] || "var(--text-3)"}
                  shape={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (typeof cx !== "number" || typeof cy !== "number") return <></>;
                    const trophy = payload.trophy;
                    const color = trophy === 1 ? "#FAEEDA" : trophy === 2 ? "#D3D1C7" : trophy === 3 ? "#F5C4B3" : (SOURCE_COLORS[src] || "var(--text-3)");
                    const stroke = trophy ? (trophy === 1 ? "#854F0B" : trophy === 2 ? "#2C2C2A" : "#993C1D") : "white";
                    return <circle cx={cx} cy={cy} r={trophy ? 5 : 3.5} fill={color} stroke={stroke} strokeWidth={trophy ? 1.5 : 1} />;
                  }}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legenda */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "6px 8px", fontSize: 10, color: "var(--text-3)" }}>
          {sources.map((src) => (
            <span key={src} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: SOURCE_COLORS[src] || "var(--text-3)", display: "inline-block" }} />
              {SOURCE_LABELS[src] || src}
            </span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#FAEEDA", border: "1px solid #854F0B", display: "inline-block" }} /> Top-3 destacado
          </span>
        </div>
      </div>
    </section>
  );
}

function CustomTooltip({ active, payload, yMode }: any) {
  if (!active || !payload?.length) return null;
  const p: Point = payload[0].payload;
  const yVal = yMode === "toPar" ? p.toPar : p.pos;
  const yLabel = yMode === "toPar"
    ? (yVal == null ? "—" : yVal === 0 ? "E" : yVal > 0 ? `+${yVal}` : String(yVal))
    : (yVal == null ? "—" : `#${yVal}`);
  return (
    <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 11, boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}>
      <div style={{ fontWeight: 700, color: "var(--text)" }}>{p.tName}</div>
      <div style={{ color: "var(--text-3)", fontSize: 10 }}>{p.flight} · {fmtDate(p.date)}</div>
      <div style={{ color: "var(--text-2)", marginTop: 3 }}>
        {yMode === "toPar" ? "±par: " : "Posição: "}<strong>{yLabel}</strong>
        {p.trophy && <span style={{ marginLeft: 6 }}>🏆</span>}
      </div>
    </div>
  );
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 11, fontWeight: 600,
    padding: "3px 10px", borderRadius: 6,
    border: `1px solid ${active ? "var(--color-info-dark)" : "var(--border)"}`,
    background: active ? "var(--color-info-dark)" : "var(--bg)",
    color: active ? "var(--bg)" : "var(--text-2)",
    cursor: "pointer",
  };
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y.slice(2)}`;
}
