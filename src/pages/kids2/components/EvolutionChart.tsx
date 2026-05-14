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
  ResponsiveContainer, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Scatter, ComposedChart,
} from "recharts";
import type { CanonicalData, Junior } from "../data";

interface Props {
  data: CanonicalData;
  junior: Junior;
  filterTids?: Set<string> | null;
}

interface Point {
  date: string;        // YYYY-MM-DD
  ts: number;          // timestamp para X numérico
  toPar: number | null;
  /** ±par normalizado para equivalente de 18 buracos por ronda. */
  toParNorm: number | null;
  pos: number | null;
  /** ±par do Manuel no mesmo torneio (se também jogou). */
  manuelToPar: number | null;
  /** ±par/18H do Manuel no mesmo torneio. */
  manuelToParNorm: number | null;
  /** Posição do Manuel. */
  manuelPos: number | null;
  flight: string;
  tName: string;
  sourceId: string;
  trophy?: 1 | 2 | 3;
  /** nº de buracos por ronda — útil para etiqueta "9H". */
  nholes: number;
}

/** Devolve nº de buracos por ronda do torneio (preferindo `holesPerRound`,
 *  senão contando pars > 0 no flight). */
function inferNholes(holesPerRound?: number, par?: number[]): number {
  if (typeof holesPerRound === "number" && holesPerRound > 0) return holesPerRound;
  if (Array.isArray(par)) {
    const n = par.filter((p) => p > 0).length;
    if (n === 9 || n === 18) return n;
  }
  return 18;
}

/** ±par/ronda equivalente a 18 buracos. Útil para misturar 9H e 18H. */
function tprNorm(toPar: number | null, nRounds: number, nholes: number): number | null {
  if (toPar == null || nRounds <= 0 || nholes <= 0) return null;
  return Math.round((toPar * (18 / nholes) / nRounds) * 10) / 10;
}

const SOURCE_COLORS: Record<string, string> = {
  uskids: "var(--source-uskids)",
  fpg:    "var(--source-fpg)",
  rfeg:   "var(--source-rfeg)",
  ffgolf: "var(--source-ffgolf)",
  wjgc:   "var(--source-wjgc)",
  eowagr: "var(--source-eowagr)",
  doral:  "var(--source-doral)",
};

const SOURCE_LABELS: Record<string, string> = {
  uskids: "USKids", fpg: "FPG", rfeg: "RFEG", ffgolf: "FFG",
  wjgc: "WJGC", eowagr: "EOWAGR", doral: "Doral",
};

export default function EvolutionChart({ data, junior, filterTids }: Props) {
  const [yMode, setYMode] = useState<"toPar" | "toParNorm" | "pos">("toPar");
  const [include9H, setInclude9H] = useState(false);

  const isManuelView = data.manuel?.id === junior.id;
  const manuelId = !isManuelView ? data.manuel?.id : null;

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

        // toPar do torneio completo (usa r.toPar ou calcula)
        const parTotal = f.par?.reduce((a, b) => a + (b || 0), 0) || t.parTotal || 0;
        const grosses = (r.rounds || []).map((rd) => rd.gross).filter((g): g is number => typeof g === "number");
        const total = r.totalGross ?? (grosses.length ? grosses.reduce((a, b) => a + b, 0) : null);
        const toParTotal = r.toPar ?? (total != null && parTotal && grosses.length ? total - parTotal * grosses.length : null);

        const nh = inferNholes(t.holesPerRound, f.par);
        const nRounds = r.rounds?.length || grosses.length || (typeof t.rounds === "number" ? t.rounds : 1);
        // ±par MÉDIO POR RONDA (não total) — escala consistente entre torneios de 1, 2 ou 4 rondas
        const toPar = toParTotal != null && nRounds > 0 ? Math.round((toParTotal / nRounds) * 10) / 10 : null;
        // ±par/18H normalizado (útil para misturar 9H + 18H)
        const toParNorm = tprNorm(toParTotal ?? null, nRounds, nh);

        const trophy: 1 | 2 | 3 | undefined = typeof r.pos === "number" && r.pos <= 3 ? (r.pos as 1 | 2 | 3) : undefined;

        // Procurar dados do Manuel no MESMO torneio (qualquer flight)
        let manuelToPar: number | null = null;
        let manuelToParNorm: number | null = null;
        let manuelPos: number | null = null;
        if (manuelId) {
          for (const mf of t.flights) {
            const mR = mf.results.find((x) => x.juniorId === manuelId);
            if (!mR) continue;
            if (typeof mR.pos === "number") manuelPos = mR.pos;
            const mParTotal = mf.par?.reduce((a, b) => a + (b || 0), 0) || t.parTotal || 0;
            const mGrosses = (mR.rounds || []).map((rd) => rd.gross).filter((g): g is number => typeof g === "number");
            const mTotal = mR.totalGross ?? (mGrosses.length ? mGrosses.reduce((a, b) => a + b, 0) : null);
            const mTpTotal = mR.toPar ?? (mTotal != null && mParTotal && mGrosses.length ? mTotal - mParTotal * mGrosses.length : null);
            const mNh = inferNholes(t.holesPerRound, mf.par);
            const mNRounds = mR.rounds?.length || mGrosses.length || (typeof t.rounds === "number" ? t.rounds : 1);
            // ±par por ronda do Manuel (mesma transformação)
            manuelToPar = mTpTotal != null && mNRounds > 0 ? Math.round((mTpTotal / mNRounds) * 10) / 10 : null;
            manuelToParNorm = tprNorm(mTpTotal ?? null, mNRounds, mNh);
            break;
          }
        }

        arr.push({
          date, ts,
          toPar: toPar ?? null,
          toParNorm,
          pos: typeof r.pos === "number" ? r.pos : null,
          manuelToPar, manuelToParNorm, manuelPos,
          flight: f.label,
          tName: t.shortName || t.name || tid,
          sourceId: t.sourceId,
          trophy,
          nholes: nh,
        });
      }
    }
    arr.sort((a, b) => a.ts - b.ts);
    return arr;
  }, [data, junior, filterTids, manuelId]);

  // Filtragem 9H: por default escondemos torneios de 9 buracos para evitar
  // misturar escalas (uma ronda 9H tem range ±par muito mais estreito que 18H).
  // Quando `yMode === "toParNorm"` a escala normalizada não precisa do filtro
  // mas mantemos o respeito ao toggle por consistência visual.
  const visiblePoints = useMemo(
    () => include9H ? points : points.filter((p) => p.nholes !== 9),
    [points, include9H],
  );
  const hidden9HCount = points.length - visiblePoints.length;

  if (visiblePoints.length < 2) {
    return (
      <section style={{ marginBottom: 14 }}>
        <h3 style={{ margin: "8px 0 10px", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Evolução</h3>
        <div style={{ fontSize: 12, color: "var(--text-3)", padding: "10px 12px", background: "var(--bg-muted)", borderRadius: 6 }}>
          Insuficiência de dados para representar evolução ({visiblePoints.length} {visiblePoints.length === 1 ? "ponto" : "pontos"}{hidden9HCount > 0 ? ` · ${hidden9HCount} de 9H escondidos` : ""}).
        </div>
      </section>
    );
  }

  // Eixo Y: para "pos", inverter (menor pos = melhor = topo)
  const yKey: "toPar" | "toParNorm" | "pos" = yMode;
  const manuelYKey: "manuelToPar" | "manuelToParNorm" | "manuelPos" =
    yMode === "toPar" ? "manuelToPar" : yMode === "toParNorm" ? "manuelToParNorm" : "manuelPos";
  const yReversed = yMode === "pos";

  // Linha de referência: par (0) ou top-10
  const refY = yMode === "pos" ? 10 : 0;
  const refLabel = yMode === "pos" ? "Top 10" : "par";

  const sources = Array.from(new Set(visiblePoints.map((p) => p.sourceId)));
  const hasManuelLine = !isManuelView && visiblePoints.some((p) => p[manuelYKey] != null);

  return (
    <section style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "8px 0 10px" }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Evolução</h3>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button
            onClick={() => setYMode("toPar")}
            style={btnStyle(yMode === "toPar")}
            title="±par médio por ronda do torneio"
          >±par/ronda</button>
          <button
            onClick={() => setYMode("toParNorm")}
            style={btnStyle(yMode === "toParNorm")}
            title="±par/ronda normalizado para equivalente 18 buracos — útil para misturar 9H e 18H"
          >±par/18H</button>
          <button
            onClick={() => setYMode("pos")}
            style={btnStyle(yMode === "pos")}
          >Posição</button>
          <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 2px" }} />
          <button
            onClick={() => setInclude9H((v) => !v)}
            style={btnStyle(include9H)}
            title={include9H
              ? "A mostrar torneios de 9 e 18 buracos juntos"
              : `Mostrar também ${hidden9HCount} torneio(s) de 9 buracos`}
          >
            9H {include9H ? "✓" : "✗"}
          </button>
        </div>
      </div>

      <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 6px 6px" }}>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <ComposedChart data={visiblePoints} margin={{ top: 6, right: 12, left: 0, bottom: 16 }}>
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
                allowDecimals={yMode !== "pos"}
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
              {/* Linha-base do rival (todos os pontos) */}
              <Line
                type="monotone"
                dataKey={yKey}
                name="Rival"
                stroke="var(--color-info)"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              {/* Linha sobreposta do Manuel — só desenhada quando não estamos a ver a ficha do próprio Manuel */}
              {hasManuelLine && (
                <Line
                  type="monotone"
                  dataKey={manuelYKey}
                  name="Manuel"
                  stroke="var(--color-good-dark)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={{ r: 2.5, fill: "var(--color-good-dark)", stroke: "var(--bg)", strokeWidth: 1 }}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {/* Scatters coloridos por sourceId. Pontos 9H ficam mais pequenos + outline tracejado. */}
              {sources.map((src) => (
                <Scatter
                  key={src}
                  name={SOURCE_LABELS[src] || src}
                  data={visiblePoints.filter((p) => p.sourceId === src && p[yKey] != null)}
                  dataKey={yKey}
                  fill={SOURCE_COLORS[src] || "var(--text-3)"}
                  shape={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (typeof cx !== "number" || typeof cy !== "number") return <></>;
                    const trophy = payload.trophy;
                    const is9h = payload.nholes === 9;
                    const color = trophy === 1 ? "var(--medal-gold-bg)" : trophy === 2 ? "var(--medal-silver-bg)" : trophy === 3 ? "var(--medal-bronze-bg)" : (SOURCE_COLORS[src] || "var(--text-3)");
                    const stroke = trophy ? (trophy === 1 ? "var(--medal-gold-fg)" : trophy === 2 ? "var(--medal-silver-fg)" : "var(--medal-bronze-fg)") : (is9h ? "var(--text-2)" : "white");
                    const radius = trophy ? 5 : is9h ? 2.5 : 3.5;
                    return <circle cx={cx} cy={cy} r={radius} fill={color} stroke={stroke} strokeWidth={trophy ? 1.5 : 1} strokeDasharray={is9h ? "1 1" : undefined} />;
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
          {hasManuelLine && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title="Linha tracejada verde = Manuel no mesmo torneio">
              <span style={{ display: "inline-block", width: 18, height: 2, borderTop: "2px dashed var(--color-good-dark)" }} /> Manuel
            </span>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--medal-gold-bg)", border: "1px solid var(--medal-gold-fg)", display: "inline-block" }} /> Top-3 destacado
          </span>
        </div>
      </div>
    </section>
  );
}

function CustomTooltip({ active, payload, yMode }: any) {
  if (!active || !payload?.length) return null;
  const p: Point = payload[0].payload;
  const rivalVal =
    yMode === "toPar" ? p.toPar :
    yMode === "toParNorm" ? p.toParNorm :
    p.pos;
  const manuelVal =
    yMode === "toPar" ? p.manuelToPar :
    yMode === "toParNorm" ? p.manuelToParNorm :
    p.manuelPos;
  const yLabel = (v: number | null): string => {
    if (v == null) return "—";
    if (yMode === "pos") return `#${v}`;
    // toPar e toParNorm têm a mesma representação numérica
    const formatted = yMode === "toParNorm" ? v.toFixed(1) : String(v);
    if (v === 0) return "E";
    if (v > 0) return `+${formatted}`;
    return formatted;
  };
  const metricLabel = yMode === "toPar" ? "±par" : yMode === "toParNorm" ? "±par/18H" : "Posição";
  return (
    <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 11, boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}>
      <div style={{ fontWeight: 700, color: "var(--text)" }}>{p.tName}</div>
      <div style={{ color: "var(--text-3)", fontSize: 10 }}>
        {p.flight} · {fmtDate(p.date)}{p.nholes === 9 ? " · 9H" : ""}
      </div>
      <div style={{ color: "var(--text-2)", marginTop: 3, display: "flex", flexDirection: "column", gap: 2 }}>
        <span>
          {metricLabel}: <strong>{yLabel(rivalVal)}</strong>
          {p.trophy && <span style={{ marginLeft: 6 }}>🏆</span>}
        </span>
        {manuelVal != null && (
          <span style={{ color: "var(--color-good-dark)" }}>
            Manuel: <strong>{yLabel(manuelVal)}</strong>
          </span>
        )}
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
