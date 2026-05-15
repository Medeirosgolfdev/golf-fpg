/**
 * kids2/NextTournaments.tsx
 *
 * /kids2/next-t — torneios futuros agrupados por mês. Por default mostra os
 * torneios em que o Manuel está inscrito (data > hoje); toggle para mostrar
 * todos os torneios futuros do canónico.
 *
 * Cada card linka para /kids2/scout/:tid para ver o field.
 */

import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useJuniorsCanonical } from "./data";
import type { CanonicalData, Tournament } from "./data";
import LoadingState from "../../ui/LoadingState";
import EmptyState from "../../ui/EmptyState";
import { usePasswordGate } from "../../hooks/usePasswordGate";
import PasswordGate from "../../ui/PasswordGate";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function NextTournaments() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <NextTournamentsContent />;
}

function NextTournamentsContent() {
  const status = useJuniorsCanonical();
  const [scope, setScope] = useState<"manuel" | "all">("manuel");

  if (status.kind === "loading") return <LoadingState />;
  if (status.kind === "error") return <EmptyState size="md" message={`Falhou: ${status.error}`} />;

  const data = status.data;
  return <NextContent data={data} scope={scope} onScopeChange={setScope} />;
}

interface FutureT {
  tournament: Tournament;
  manuelInField: boolean;
  fieldSize: number;
  flightLabel: string | null;
}

function NextContent({ data, scope, onScopeChange }: {
  data: CanonicalData; scope: "manuel" | "all"; onScopeChange: (s: "manuel" | "all") => void;
}) {
  const manuel = data.manuel;
  const today = new Date().toISOString().slice(0, 10);

  const futures = useMemo<FutureT[]>(() => {
    const out: FutureT[] = [];
    for (const t of data.tournaments) {
      const date = t.date || t.startDate || "";
      if (!date || date < today) continue;

      let manuelInField = false;
      let flightLabel: string | null = null;
      let fieldSize = 0;
      for (const f of t.flights) {
        // Preferir `fieldSize` real do aggregator. Fallback para results.length
        // (sub-conjunto trackado nos canónicos) quando o aggregator não populou.
        fieldSize += typeof f.fieldSize === "number" && f.fieldSize > 0
          ? f.fieldSize
          : f.results.length;
        if (manuel && f.results.some((r) => r.juniorId === manuel.id)) {
          manuelInField = true;
          flightLabel = f.label;
        }
      }
      out.push({ tournament: t, manuelInField, fieldSize, flightLabel });
    }
    out.sort((a, b) => {
      const da = a.tournament.date || a.tournament.startDate || "";
      const db = b.tournament.date || b.tournament.startDate || "";
      return da.localeCompare(db);
    });
    return out;
  }, [data, manuel, today]);

  const filtered = scope === "manuel" ? futures.filter((x) => x.manuelInField) : futures;

  // Agrupar por mês (YYYY-MM)
  const byMonth = useMemo(() => {
    const m = new Map<string, FutureT[]>();
    for (const f of filtered) {
      const date = f.tournament.date || f.tournament.startDate || "";
      const ym = date.slice(0, 7);
      let arr = m.get(ym);
      if (!arr) { arr = []; m.set(ym, arr); }
      arr.push(f);
    }
    return m;
  }, [filtered]);

  const months = Array.from(byMonth.keys()).sort();

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Link to="/kids2" style={{ fontSize: 13, color: "var(--color-info)" }}>← KIDS2</Link>
      </div>

      <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "var(--text)" }}>
        📅 Próximos torneios
      </h2>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center" }}>
        <button
          onClick={() => onScopeChange("manuel")}
          style={tabStyle(scope === "manuel")}
        >
          ⚔️ do Manuel ({futures.filter((f) => f.manuelInField).length})
        </button>
        <button
          onClick={() => onScopeChange("all")}
          style={tabStyle(scope === "all")}
        >
          🌐 todos ({futures.length})
        </button>
        <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>
          a partir de {fmtDateShort(today)}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: "20px 12px", textAlign: "center", color: "var(--text-3)", background: "var(--bg-muted)", borderRadius: 8 }}>
          {scope === "manuel"
            ? "Sem torneios futuros do Manuel no canónico. Quando inscrito num torneio aparecerá aqui."
            : "Sem torneios futuros no canónico."}
        </div>
      ) : (
        months.map((ym) => {
          const monthRows = byMonth.get(ym)!;
          const [y, mm] = ym.split("-");
          const monthLabel = `${MONTHS_PT[parseInt(mm, 10) - 1]} ${y}`;
          return (
            <div key={ym} style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-2)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {monthLabel}
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {monthRows.map(({ tournament, manuelInField, fieldSize, flightLabel }) => (
                  <TournamentCard
                    key={tournament.id}
                    tournament={tournament}
                    manuelInField={manuelInField}
                    fieldSize={fieldSize}
                    flightLabel={flightLabel}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function TournamentCard({ tournament, manuelInField, fieldSize, flightLabel }: {
  tournament: Tournament; manuelInField: boolean; fieldSize: number; flightLabel: string | null;
}) {
  const date = tournament.date || tournament.startDate || "";
  const url = tournament.links?.[0]?.url;
  return (
    <Link
      to={`/kids2/scout/${tournament.id}`}
      style={{
        display: "block",
        background: manuelInField ? "var(--bg-success-subtle, #ecfdf5)" : "var(--bg)",
        border: `1px solid ${manuelInField ? "var(--border-success, #97c459)" : "var(--border)"}`,
        borderRadius: 8,
        padding: "10px 12px",
        textDecoration: "none",
        color: "inherit",
        transition: "transform 80ms",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
            {manuelInField && <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "var(--color-good-dark)", color: "var(--bg)", fontWeight: 700 }}>⚔️ MANUEL</span>}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tournament.name || tournament.shortName || tournament.id}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
            {fmtDateShort(date)}
            {tournament.course && <span> · {tournament.course}</span>}
            {flightLabel && <span> · {flightLabel}</span>}
            <span> · {fieldSize} {fieldSize === 1 ? "jogador" : "jogadores"}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {url && (
            <a
              href={url} target="_blank" rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 11, color: "var(--color-info)", textDecoration: "none" }}
              title="Abrir site oficial"
            >↗ oficial</a>
          )}
          <span style={{ fontSize: 12, color: "var(--color-info-dark, #1e3a8a)", fontWeight: 600 }}>
            🔭 scout →
          </span>
        </div>
      </div>
    </Link>
  );
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 12, fontWeight: 600,
    padding: "5px 12px", borderRadius: 6,
    border: `1px solid ${active ? "var(--color-info-dark)" : "var(--border)"}`,
    background: active ? "var(--color-info-dark)" : "var(--bg)",
    color: active ? "var(--bg)" : "var(--text-2)",
    cursor: "pointer",
  };
}

function fmtDateShort(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_PT[parseInt(m, 10) - 1]} ${y}`;
}
