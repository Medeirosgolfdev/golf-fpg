/**
 * kids2/components/CircuitFilterPills.tsx
 *
 * Pills "FILTRAR POR CIRCUITO" para o painel direito do PlayerProfile.
 * Quando o user clica numa pill, o filtro é aplicado a HistoryByTournament
 * e ResultsTimeline (não à MetricsGrid nem ao banner do Manuel).
 *
 * As pills são derivadas dos torneios do junior (não hardcoded), agrupadas
 * por circuito: sourceId + diferenciação USKids Euro/World/Regional.
 */

import React, { useMemo } from "react";
import type { CanonicalData, Junior } from "../data";

interface Props {
  data: CanonicalData;
  junior: Junior;
  active: string;                       // "all" ou circuit id
  onChange: (circuit: string) => void;
}

export interface Circuit {
  id: string;
  label: string;
  tournamentIds: Set<string>;
}

/**
 * Determina o "circuito" de um torneio. USKids divide-se por escopo.
 */
function getTournamentCircuit(t: { sourceId: string; name?: string; shortName?: string; seriesId?: string }): { id: string; label: string } {
  const src = t.sourceId;
  const name = ((t.name || t.shortName || "") + " " + (t.seriesId || "")).toLowerCase();

  if (src === "uskids") {
    if (/world|championship/i.test(name) && !/european/i.test(name)) {
      return { id: "uskids-world", label: "USKids World" };
    }
    if (/european|venice|rome|marco|el prat|euro/i.test(name)) {
      return { id: "uskids-euro", label: "USKids Euro" };
    }
    if (/local tour|local invitational/i.test(name)) {
      return { id: "uskids-local", label: "USKids Local" };
    }
    return { id: "uskids-other", label: "USKids" };
  }
  if (src === "fpg") return { id: "fpg", label: "FPG" };
  if (src === "rfeg") return { id: "rfeg", label: "RFEG" };
  if (src === "ffgolf") return { id: "ffg", label: "FFG" };
  if (src === "wjgc") return { id: "wjgc", label: "WJGC" };
  if (src === "eowagr") return { id: "eowagr", label: "EOWAGR" };
  if (src === "doral") return { id: "doral", label: "Doral" };
  return { id: src, label: src };
}

export function useJuniorCircuits(data: CanonicalData, junior: Junior): Circuit[] {
  return useMemo(() => {
    const m = new Map<string, Circuit>();
    for (const tid of junior.tournamentIds) {
      const t = data.tournamentById.get(tid);
      if (!t) continue;
      const c = getTournamentCircuit(t);
      let entry = m.get(c.id);
      if (!entry) {
        entry = { id: c.id, label: c.label, tournamentIds: new Set() };
        m.set(c.id, entry);
      }
      entry.tournamentIds.add(tid);
    }
    return Array.from(m.values()).sort((a, b) => b.tournamentIds.size - a.tournamentIds.size);
  }, [data, junior]);
}

export default function CircuitFilterPills({ data, junior, active, onChange }: Props) {
  const circuits = useJuniorCircuits(data, junior);
  const total = junior.tournamentIds.length;

  if (circuits.length < 2) return null; // não vale a pena com 1 circuito só

  return (
    <div style={{
      padding: "10px 12px",
      background: "var(--bg-muted)",
      borderRadius: "var(--radius)",
      marginBottom: 10,
    }}>
      <div style={{ fontSize: "var(--fs-10)", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        Filtrar por circuito
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        <button onClick={() => onChange("all")} style={pillStyle(active === "all")}>
          Todos · {total}
        </button>
        {circuits.map((c) => (
          <button key={c.id} onClick={() => onChange(c.id)} style={pillStyle(active === c.id)}>
            {c.label} · {c.tournamentIds.size}
          </button>
        ))}
      </div>
    </div>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: "var(--fs-11)", fontWeight: 600,
    padding: "3px 9px", borderRadius: "var(--radius-pill)",
    border: `1px solid ${active ? "var(--text)" : "var(--border)"}`,
    background: active ? "var(--text)" : "var(--bg)",
    color: active ? "var(--bg)" : "var(--text-2)",
    cursor: "pointer",
    lineHeight: 1.4,
  };
}
