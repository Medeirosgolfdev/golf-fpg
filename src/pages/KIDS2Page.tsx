/**
 * KIDS2Page.tsx — rebuild canonical-first.
 *
 * Layout:
 *   - Toolbar global (SidebarToggle + título + DataSourcesChip + filtros)
 *   - Sidebar (master-detail) com search + lista por país
 *   - Painel direito (PlayerProfile)
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useJuniorsCanonical, normName } from "./kids2/data";
import Sidebar from "./kids2/Sidebar";
import PlayerProfile from "./kids2/PlayerProfile";
import Kids2SubNav from "./kids2/Kids2SubNav";
import EmptyState from "../ui/EmptyState";
import LoadingState from "../ui/LoadingState";
import { ToolbarSep } from "../ui/Toolbar";
import SidebarToggle from "../ui/SidebarToggle";
import { DataSourcesChip } from "../ui/DataSources";
import { useMasterDetail } from "../hooks/useMasterDetail";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";

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
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <KIDS2PageContent />;
}

function KIDS2PageContent() {
  const status = useJuniorsCanonical();
  const params = useParams<{ juniorId?: string }>();
  const navigate = useNavigate();
  const md = useMasterDetail(true);

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

  // Resolver retro-compat: /kids2#memberId ou /kids2#NomeJogador → /kids2/:juniorId
  // (5 linkers do site continuam a passar hashes; após resolver, navegamos para a URL canónica)
  useEffect(() => {
    if (status.kind !== "ready") return;
    if (params.juniorId) return; // já temos juniorId na URL — nada a fazer
    if (typeof window === "undefined") return;
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return;
    let resolved: string | null = null;
    // 1) Tentar como USKids memberId (uma string numérica de 5-7 dígitos)
    const decoded = decodeURIComponent(raw);
    const byMember = status.data.juniorByUskidsMember.get(decoded);
    if (byMember) resolved = byMember.id;
    // 2) Tentar como normName (decoded vs raw)
    if (!resolved) {
      const candidates = status.data.juniorByNormName.get(normName(decoded));
      if (candidates && candidates.length > 0) resolved = candidates[0].id;
    }
    if (resolved) {
      // Limpa hash e navega para URL canónica
      navigate(`/kids2/${resolved}`, { replace: true });
    }
  }, [status, params.juniorId, navigate]);

  if (status.kind === "loading") return <LoadingState />;
  if (status.kind === "error") return <EmptyState size="md" message={`Falhou carregar canónicos: ${status.error}`} />;

  const data = status.data;
  const manuel = data.manuel;
  const selectedId = params.juniorId || manuel?.id;
  const selected = selectedId ? data.juniorById.get(selectedId) : null;

  const handleSelect = (id: string) => {
    navigate(`/kids2/${id}`, { replace: true });
    md.onSelect();
  };

  const hasActiveFilter = activeSources.size > 0 || onlyVsManuel || onlyWins;

  return (
    <div className="tourn-layout">
      {/* ── Barra de navegação única do KIDS2 (mesma em todas as sub-páginas) ──
          Os filtros/contagem vão como children e só aparecem aqui (página
          principal); nas sub-páginas a barra mostra só a navegação. */}
      <Kids2SubNav leading={<SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />}>
        <DataSourcesChip sources={data.sources} />
        <ToolbarSep />
        <span className="toolbar-meta shrink-0" style={{ fontSize: "var(--fs-10)", color: "var(--color-good-dark)", fontWeight: 700 }}>
          {data.juniors.length} juniors · {data.tournaments.length} torneios · ✓
        </span>
        <ToolbarSep />
        {/* Pills de fonte */}
        <span style={{ fontSize: "var(--fs-10)", fontWeight: 700, color: "var(--text-3)", letterSpacing: 0.4, textTransform: "uppercase", flexShrink: 0 }}>
          Fonte
        </span>
        {SOURCE_PILLS.map((p) => {
          const active = activeSources.has(p.key);
          return (
            <button
              key={p.key}
              className={"tourn-tab tourn-tab-sm" + (active ? " active" : " tourn-tab-muted")}
              style={{ flexShrink: 0 }}
              onClick={() => toggleSource(p.key)}
              title={`Filtrar: ${p.label}`}
            >
              {p.label}
            </button>
          );
        })}
        <ToolbarSep />
        <button
          className={"tourn-tab tourn-tab-sm" + (onlyVsManuel ? " active" : " tourn-tab-muted")}
          style={{ flexShrink: 0 }}
          onClick={() => setOnlyVsManuel((v) => !v)}
          title="Só rivais que cruzaram com Manuel"
          disabled={!manuel}
        >
          ⚔️ vs Manuel
        </button>
        <button
          className={"tourn-tab tourn-tab-sm" + (onlyWins ? " active" : " tourn-tab-muted")}
          style={{ flexShrink: 0 }}
          onClick={() => setOnlyWins((v) => !v)}
          title="Só rivais com pelo menos 1 vitória"
        >
          🏆 c/ vitórias
        </button>
        {hasActiveFilter && (
          <button
            onClick={clearFilters}
            className="tourn-tab tourn-tab-sm"
            style={{ flexShrink: 0, background: "var(--bg-danger)", color: "var(--color-danger-dark)", borderColor: "var(--color-danger)" }}
            title="Limpar filtros"
          >
            ✕
          </button>
        )}
      </Kids2SubNav>

      {/* ── Layout master-detail ── */}
      <div className="master-detail">
        <div className={md.sidebarClass}>
          <Sidebar
            data={data}
            selectedId={selectedId || null}
            onSelect={handleSelect}
            countryFilter={countryFilter}
            onCountryFilterChange={setCountryFilter}
            activeSources={activeSources}
            onlyVsManuel={onlyVsManuel}
            onlyWins={onlyWins}
          />
        </div>
        <div className="course-detail" ref={md.detailRef}>
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
