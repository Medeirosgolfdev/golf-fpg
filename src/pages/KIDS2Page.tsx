/**
 * KIDS2Page.tsx — rebuild canonical-first.
 *
 * Layout:
 *   - Toolbar superior (filtros de fonte + special toggles + link)
 *   - Sidebar (só search + lista agrupada por país)
 *   - Painel direito (PlayerProfile)
 */

import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useJuniorsCanonical } from "./kids2/data";
import Sidebar from "./kids2/Sidebar";
import PlayerProfile from "./kids2/PlayerProfile";
import EmptyState from "../ui/EmptyState";
import LoadingState from "../ui/LoadingState";

export type Kids2SourceKey = "uskids" | "fpg" | "rfeg" | "ffgolf" | "wjgc" | "eowagr" | "doral";

const SOURCE_PILLS: { key: Kids2SourceKey; label: string }[] = [
  { key: "uskids", label: "USKids" },
  { key: "fpg", label: "FPG" },
  { key: "rfeg", label: "RFEG" },
  { key: "ffgolf", label: "FFG" },
  { key: "wjgc", label: "WJGC" },
  { key: "eowagr", label: "EOWAGR" },
  { key: "doral", label: "Doral" },
];

export default function KIDS2Page() {
  const status = useJuniorsCanonical();
  const params = useParams<{ juniorId?: string }>();
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("");
  const [activeSources, setActiveSources] = useState<Set<Kids2SourceKey>>(new Set());
  const [onlyVsManuel, setOnlyVsManuel] = useState(false);
  const [onlyWins, setOnlyWins] = useState(false);

  const toggleSource = (k: Kids2SourceKey) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const clearFilters = () => {
    setActiveSources(new Set());
    setOnlyVsManuel(false);
    setOnlyWins(false);
  };

  if (status.kind === "loading") return <LoadingState />;
  if (status.kind === "error") return <EmptyState size="md" message={`Falhou carregar canónicos: ${status.error}`} />;

  const data = status.data;
  const manuel = data.manuel;
  const selectedId = params.juniorId || manuel?.id;
  const selected = selectedId ? data.juniorById.get(selectedId) : null;

  const handleSelect = (id: string) => {
    navigate(`/kids2/${id}`, { replace: true });
  };

  const hasActiveFilter = activeSources.size > 0 || onlyVsManuel || onlyWins;

  return (
    <div className="kids2-page" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "calc(100vh - 60px)" }}>
      {/* Toolbar superior: filtros + link próximos torneios */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-muted)",
        flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: 0.4, textTransform: "uppercase", marginRight: 2 }}>
          Fonte
        </span>
        {SOURCE_PILLS.map((p) => {
          const active = activeSources.has(p.key);
          return (
            <button
              key={p.key}
              onClick={() => toggleSource(p.key)}
              style={pillStyle(active)}
              title={`Filtrar: ${p.label}`}
            >
              {p.label}
            </button>
          );
        })}
        <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 4px" }} />
        <button
          onClick={() => setOnlyVsManuel((v) => !v)}
          style={pillStyle(onlyVsManuel, "var(--color-good-dark)")}
          title="Só rivais que cruzaram com Manuel"
          disabled={!manuel}
        >
          ⚔️ vs Manuel
        </button>
        <button
          onClick={() => setOnlyWins((v) => !v)}
          style={pillStyle(onlyWins, "var(--color-warn-dark, #92400e)")}
          title="Só rivais com pelo menos 1 vitória"
        >
          🏆 c/ vitórias
        </button>
        {hasActiveFilter && (
          <button
            onClick={clearFilters}
            style={{ ...pillStyle(false), color: "var(--color-danger-dark)", borderColor: "var(--color-danger-dark)" }}
            title="Limpar filtros"
          >
            ✕ limpar
          </button>
        )}
        <Link
          to="/kids2/next-t"
          style={{
            marginLeft: "auto",
            fontSize: 12, fontWeight: 600,
            color: "var(--color-info-dark, #1e3a8a)",
            textDecoration: "none",
            padding: "4px 10px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: "var(--bg)",
          }}
          title="Ver próximos torneios do Manuel"
        >📅 Próximos torneios</Link>
      </div>

      {/* Layout principal: sidebar + detail */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Sidebar
          data={data}
          selectedId={selectedId || null}
          onSelect={handleSelect}
          q={q}
          onQChange={setQ}
          countryFilter={countryFilter}
          onCountryFilterChange={setCountryFilter}
          activeSources={activeSources}
          onlyVsManuel={onlyVsManuel}
          onlyWins={onlyWins}
        />
        <div className="kids2-detail" style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {selected ? (
            <PlayerProfile data={data} junior={selected} />
          ) : (
            <EmptyState size="md" message="Selecciona um rival na barra lateral." />
          )}
        </div>
      </div>
    </div>
  );
}

function pillStyle(active: boolean, accent?: string): React.CSSProperties {
  const baseAccent = accent || "var(--color-info-dark)";
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 999,
    border: `1px solid ${active ? baseAccent : "var(--border)"}`,
    background: active ? baseAccent : "var(--bg)",
    color: active ? "var(--bg)" : "var(--text-2)",
    cursor: "pointer",
    lineHeight: 1.4,
    letterSpacing: 0.2,
  };
}
