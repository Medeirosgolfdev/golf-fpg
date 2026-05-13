/**
 * KIDS2Page.tsx — rebuild canonical-first.
 *
 * Substitui a antiga KIDSPage de raiz. Lê só dos canónicos
 * (juniors.json + juniors-tournaments.json + tournament-catalog.json) e
 * compõe a UI a partir das mockups aprovadas:
 *
 *   - Header (logo + total + search + filtros)
 *   - Sidebar (virtualizada com react-window)
 *   - Painel direito:
 *       - HeroIdentity
 *       - MatchupVsManuel
 *       - MetricsGrid
 *       - FilterPills (de circuito, por jogador)
 *       - HistoryByTournament (cards compactos)
 *       - ResultsTimeline (tabela por ano)
 */

import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useJuniorsCanonical } from "./kids2/data";
import Sidebar from "./kids2/Sidebar";
import PlayerProfile from "./kids2/PlayerProfile";
import EmptyState from "../ui/EmptyState";
import LoadingState from "../ui/LoadingState";

export default function KIDS2Page() {
  const status = useJuniorsCanonical();
  const params = useParams<{ juniorId?: string }>();
  const navigate = useNavigate();

  // Estado de filtros + search no nível da página (passa para Sidebar)
  const [q, setQ] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("");

  if (status.kind === "loading") {
    return <LoadingState />;
  }
  if (status.kind === "error") {
    return <EmptyState size="md" message={`Falhou carregar canónicos: ${status.error}`} />;
  }

  const data = status.data;
  const manuel = data.manuel;
  const selectedId = params.juniorId || manuel?.id;
  const selected = selectedId ? data.juniorById.get(selectedId) : null;

  const handleSelect = (id: string) => {
    navigate(`/kids2/${id}`, { replace: true });
  };

  return (
    <div className="kids2-page" style={{ display: "flex", height: "100%", minHeight: "calc(100vh - 60px)" }}>
      <Sidebar
        data={data}
        selectedId={selectedId || null}
        onSelect={handleSelect}
        q={q}
        onQChange={setQ}
        countryFilter={countryFilter}
        onCountryFilterChange={setCountryFilter}
      />
      <div className="kids2-detail" style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <Link
            to="/kids2/next-t"
            style={{
              fontSize: 12, fontWeight: 600,
              color: "var(--color-info-dark, #1e3a8a)",
              textDecoration: "none",
              padding: "4px 10px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--bg)",
            }}
            title="Ver proximos torneios do Manuel"
          >Proximos torneios</Link>
        </div>
        {selected ? (
          <PlayerProfile data={data} junior={selected} />
        ) : (
          <EmptyState size="md" message="Selecciona um rival na barra lateral." />
        )}
      </div>
    </div>
  );
}
