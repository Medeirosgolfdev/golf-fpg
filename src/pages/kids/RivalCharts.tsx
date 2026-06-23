/**
 * kids/RivalCharts.tsx — Componentes de gráficos do detalhe do rival
 * (extraído de KIDSPage.tsx para reduzir tamanho)
 *
 *   - EvolucaoChart       — gráfico de evolução temporal
 *   - TorneiosRecorrentes — comparação rival vs Manuel em torneios repetidos
 *   - H2HTable            — tabela head-to-head detalhada
 */
import React, { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { fmtToPar, fmtSign, MONTHS_PT, medal } from "../../utils/format";
import H2HSortableTable from "./H2HSortableTable";
import type { H2HConfronto } from "./types";
import { tpColorDark } from "../../utils/scoreDisplay";
import { flag as flagOf } from "../../utils/flagUtils";
import { uskTournNames, uskFieldSizes } from "../../data/KIDSdataLoader";
import type { AutoRivalPlayer } from "../../data/KIDSdataLoader";

// Types partilhados — compatíveis com KIDSPage.tsx
interface TournResult { p: number | "WD"; t: number | null; tp: number | null; rd: (number | null)[]; nholes?: number }
interface RivalPlayer { n: string; co: string; isM?: boolean; dob?: string; r: Record<string, TournResult>; up: string[] }

export type EvoMode = "tpr" | "pos";

/** Devolve nholes a partir dos dados do torneio. Usa o valor explícito do loader. */
export function inferNholes(nholes: number | undefined, _ageGroup?: string | null): number {
  return (nholes !== undefined && nholes > 0) ? nholes : 18;
}

/** ±par por ronda normalizado para equivalente 18 buracos */
export function tprNorm(tp: number | null, rounds: number, nholes: number): number | null {
  if (tp == null || rounds <= 0) return null;
  // Normaliza para equivalente de 18 buracos: tp_18h = tp * (18/nholes) / rounds
  return Math.round(tp * (18 / nholes) / rounds * 10) / 10;
}

export function EvolucaoChart({
  tournResults, manuelResults,
}: {
  tournResults: { id: string; short: string; dateExact: string; tp: number | null; rounds: number; nholes?: number; field: number; pos: number | null }[];
  manuelResults: typeof tournResults;
}) {
  const [mode, setMode] = useState<EvoMode>("tpr");

  const sorted = useMemo(() => [...tournResults].sort((a, b) => a.dateExact.localeCompare(b.dateExact)), [tournResults]);

  const data = useMemo(() => sorted.map(t => {
    const mEntry = manuelResults.find(m => m.id === t.id);
    const nh = t.nholes ?? 18;
    const rivalVal = mode === "tpr"
      ? tprNorm(t.tp, t.rounds, nh)
      : (t.pos != null && t.field > 0 ? Math.round(t.pos / t.field * 100) : null);
    const manuelVal = mEntry
      ? (mode === "tpr"
          ? tprNorm(mEntry.tp, mEntry.rounds, mEntry.nholes ?? 18)
          : (mEntry.pos != null && mEntry.field > 0 ? Math.round(mEntry.pos / mEntry.field * 100) : null))
      : null;
    return { name: t.short + (nh === 9 ? "⁹" : ""), rival: rivalVal, manuel: manuelVal };
  }), [sorted, manuelResults, mode]);

  const hasManuel = data.some(d => d.manuel != null);
  const yFormat  = (v: number) => mode === "tpr" ? (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) : `${v}%`;

  return (
    <div className="mb-16">
      <div className="flex-between-mb6">
        <div style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--text-2)" }}>
          Evolução por torneio
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {(["tpr", "pos"] as EvoMode[]).map(m => (
            <button key={m}
              className={`p p-filter p-sm fs-10${mode === m ? " active" : ""}`}
              onClick={() => setMode(m)}>
              {m === "tpr" ? "±par/ronda" : "posição %"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", marginBottom: 6 }}>
        {mode === "tpr"
          ? "±par/ronda equiv. 18h — torneios de 9 buracos são normalizados (⁹ no nome)"
          : "Posição relativa no field — independente do par e dimensão do torneio"}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--text-3)" }} />
          <YAxis reversed={mode === "pos"} tickFormatter={yFormat} tick={{ fontSize: 10, fill: "var(--text-3)" }} width={42} />
          <Tooltip
            formatter={((val: number, name: string) => [yFormat(val), name === "rival" ? "Jogador" : "Manuel"]) as any}
            contentStyle={{ fontSize: 11, background: "var(--bg-card)", border: "1px solid var(--border)" }}
          />
          {hasManuel && <Legend formatter={v => v === "rival" ? "Jogador" : "Manuel"} wrapperStyle={{ fontSize: 11 }} />}
          <Line type="monotone" dataKey="rival" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4, fill: "var(--accent)" }} connectNulls />
          {hasManuel && (
            <Line type="monotone" dataKey="manuel" stroke="var(--color-info-light)" strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 3, fill: "var(--color-info-light)" }} connectNulls />
          )}
          {mode === "tpr" && <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 2" />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════════════════
   TORNEIOS RECORRENTES
   ═══════════════════════════════════ */
export function TorneiosRecorrentes({
  groups,
}: {
  groups: { canon: string; name: string; entries: { year: number; pos: number | null; tp: number | null; ageGroup: string | null }[] }[];
}) {
  if (!groups.length) return null;
  return (
    <div className="card mb-12">
      <div className="h-sm mb-8" style={{ color: "var(--text-2)" }}>
        Evolução no mesmo torneio · <span className="fw-400 fs-11">torneios com 2+ presenças</span>
      </div>
      <div className="gap-8" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {groups.map(g => {
          const hasPodium    = g.entries.some(e => e.pos != null && e.pos <= 3);
          const podiumBorder = g.entries.some(e => e.pos === 1) ? "var(--medal-gold)"
            : g.entries.some(e => e.pos === 2) ? "var(--medal-silver)"
            : g.entries.some(e => e.pos === 3) ? "var(--medal-bronze)" : undefined;
          return (
            <div key={g.canon} className="card" style={{ padding: "8px 12px", margin: 0,
              borderLeft: podiumBorder ? `3px solid ${podiumBorder}` : undefined }}>
              <div style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--text)", marginBottom: 6,
                display: "flex", alignItems: "center", gap: 4 }}>
                {hasPodium && <span>{g.entries.some(e => e.pos === 1) ? "🏆" : g.entries.some(e => e.pos === 2) ? "🥈" : "🥉"}</span>}
                <span className="overflow-hidden flex-1" style={{ textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                <span className="muted fs-10 fw-400 shrink-0" >{g.entries.length}×</span>
              </div>
              <div style={{ display: "flex", gap: 3, alignItems: "center", overflowX: "auto" }}>
                {g.entries.map((e, i) => {
                  const prev  = g.entries[i - 1];
                  const delta = (prev && e.pos != null && prev.pos != null) ? e.pos - prev.pos : null;
                  const mdl = medal(e.pos ?? 0);
                  const bg    = e.pos === 1 ? "var(--medal-gold-bg)" : e.pos === 2 ? "var(--medal-silver-bg)" : e.pos === 3 ? "var(--medal-bronze-bg)" : "var(--bg-detail)";
                  const bd    = e.pos === 1 ? "var(--medal-gold)" : e.pos === 2 ? "var(--medal-silver)" : e.pos === 3 ? "var(--medal-bronze)" : "var(--border-light)";
                  const tpStr = fmtToPar(e.tp);
                  return (
                    <React.Fragment key={i}>
                      {i > 0 && (
                        <span style={{ fontSize: "var(--fs-12)", fontWeight: 900, flexShrink: 0,
                          color: delta != null && delta < 0 ? "var(--color-good-dark)"
                            : delta != null && delta > 0 ? "var(--color-danger-vivid)"
                            : "var(--text-3)" }}>
                          {delta != null && delta < 0 ? "↑" : delta != null && delta > 0 ? "↓" : "="}
                        </span>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
                        padding: "3px 5px", borderRadius: 4, background: bg, border: `1px solid ${bd}`, flexShrink: 0 }}>
                        <span style={{ fontSize: "var(--fs-9)", color: "var(--text-3)", fontWeight: 500 }}>{e.year}</span>
                        <span style={{ fontSize: mdl ? 14 : 11, fontWeight: 900, lineHeight: 1,
                          color: e.pos === 1 ? "var(--color-warn-dark)" : e.pos != null && e.pos <= 3 ? "var(--medal-silver)" : "var(--text-3)" }}>
                          {mdl ?? (e.pos != null ? `#${e.pos}` : "—")}
                        </span>
                        {e.tp != null && <span style={{ fontSize: "var(--fs-9)", fontWeight: 600,
                          color: (e.tp ?? 0) <= 0 ? "var(--color-good-dark)" : "var(--text-3)" }}>{tpStr}</span>}
                        {e.ageGroup && <span style={{ fontSize: "var(--fs-8)", color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>{e.ageGroup}</span>}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════
   HEAD-TO-HEAD TABLE DETALHADA
   ═══════════════════════════════════ */
/* H2HSortableTable extraído para ./kids/H2HSortableTable.tsx */

export function H2HTable({
  confrontos, playerName,
}: {
  confrontos: H2HConfronto[];
  playerName: string;
}) {
  if (!confrontos.length) return null;
  const firstName = playerName.split(" ")[0];
  const vitorias  = confrontos.filter(c => c.manPos < c.rivalPos).length;
  const derrotas  = confrontos.filter(c => c.manPos > c.rivalPos).length;
  const avgDifTp  = (() => {
    const difs = confrontos.filter(c => c.manTp != null && c.rivalTp != null).map(c => (c.rivalTp ?? 0) - (c.manTp ?? 0));
    return difs.length ? (difs.reduce((a, b) => a + b, 0) / difs.length).toFixed(1) : null;
  })();
  const avgManPos  = Math.round(confrontos.reduce((s, c) => s + c.manPos, 0) / confrontos.length);
  const avgRivPos  = Math.round(confrontos.reduce((s, c) => s + c.rivalPos, 0) / confrontos.length);

  return (
    <div className="card mb-12 overflow-hidden" >
      <div className="flex-wrap" style={{ padding: "12px 16px 8px", display: "flex", alignItems: "baseline", gap: 10 }}>
        <div className="h-sm" style={{ color: "var(--text-2)" }}>
          Head-to-head · {confrontos.length} confronto{confrontos.length !== 1 ? "s" : ""}
        </div>
        <span style={{ fontSize: "var(--fs-13)", fontWeight: 700, color: derrotas < vitorias ? "var(--color-danger-vivid)" : "var(--color-good-dark)" }}>
          {firstName} {derrotas}× vs Manuel {vitorias}×
        </span>
        <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)", marginLeft: "auto" }}>
          Avg: {firstName} {avgRivPos}º · Manuel {avgManPos}º
          {avgDifTp != null && ` · Dif. ±par: ${parseFloat(avgDifTp) > 0 ? "+" : ""}${avgDifTp}`}
        </span>
      </div>
      <div className="scroll-x">
        <H2HSortableTable confrontos={confrontos} firstName={firstName} />
      </div>
    </div>
  );
}
