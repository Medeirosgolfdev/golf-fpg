/**
 * src/pages/jogadores/JogadoresToolbar.tsx
 *
 * Toolbar da JogadoresPage — reorganizada na Fase 2 (2026-08-15) para seguir
 * a linguagem das outras páginas (FPG/Drive):
 *
 *   LINHA 1 (magra, sempre visível): SidebarToggle · título · DataSourcesChip ·
 *   segmented Nossos/TODOS · segmented Lista/📊 Stats (só TODOS) · pesquisa
 *   (padrão FPG: 🔎 + ×) · pills de escalão + preset 🧒 Jovens · 🟢 Novos ·
 *   🏌️ Activos · ⚙️ Filtros (abre o painel) · ✕ Limpar · contador · ⓘ Info.
 *
 *   PAINEL (linha 2, colapsável — abre sozinho se houver filtros dele activos):
 *   selects raros (Sexo/Nacionalidade/Região/Clube/Fonte), HCP DO/AO,
 *   Ordenar, e as preferências como ToggleChip (👴 seniores · ⭐ destaques ·
 *   🏑 só P&P). FilterField/ToggleChip partilhados com a landing /jogadores.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SexFilter } from "../../data/types";
import { escCls } from "../../utils/playerUtils";
import { isSeniorEscalao, ESCALOES_JOVENS } from "../../constants/escaloes";
import { Toolbar, ToolbarTitle, ToolbarSep } from "../../ui/Toolbar";
import Counter from "../../ui/Counter";
import SidebarToggle from "../../ui/SidebarToggle";
import { DataSourcesChip, type DataSource } from "../../ui/DataSources";
import { FilterField, ToggleChip } from "../../ui/FilterField";
import type { JogadoresFiltersApi } from "./useJogadoresFilters";
import { NEW_DAYS, type SortKey, type ViewMode } from "./filterPlayers";

/** Contagens calculadas (memoizadas) no shell — a toolbar não varre listas. */
export interface ToolbarCounts {
  nossosTotal: number;
  nossosNonSenior: number;
  todosTotal: number | null;
  todosNonSenior: number | null;
  newCount: number;
  ppCount: number;
}

export default function JogadoresToolbar({
  api, viewMode, onSetViewMode,
  showStats, onSetShowStats,
  counts, dataSources,
  loadingFeds, federadosError,
  escaloes, escalaoCountMap, regions, clubOptions,
  isJuvenilFilter, filteredCount,
  sidebarOpen, onToggleSidebar,
}: {
  api: JogadoresFiltersApi;
  viewMode: ViewMode;
  onSetViewMode: (m: ViewMode) => void;
  showStats: boolean;
  onSetShowStats: (v: boolean) => void;
  counts: ToolbarCounts;
  dataSources: DataSource[];
  loadingFeds: boolean;
  federadosError: string | null;
  escaloes: string[];
  escalaoCountMap: Record<string, number>;
  regions: string[];
  clubOptions: { code: string; label: string }[];
  isJuvenilFilter: boolean;
  filteredCount: number;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  const { filters, update, updateSort, toggleSortDir, toggleEscalao, clearEscalao, clearAllFilters, activeFiltersCount } = api;
  const navigate = useNavigate();

  // Nº de filtros activos que vivem no PAINEL — badge do botão ⚙️ (para nada
  // ficar escondido) e abertura automática no arranque.
  const panelActiveCount = useMemo(() => [
    filters.sexFilter !== "ALL",
    filters.natFilter !== "ALL",
    filters.regionFilter !== "ALL",
    filters.clubFilter !== "ALL",
    filters.hcpMin !== "",
    filters.hcpMax !== "",
    filters.sourceFilter !== "ALL",
    filters.onlyPP,
  ].filter(Boolean).length, [filters]);
  const [panelOpen, setPanelOpen] = useState(() => panelActiveCount > 0);

  const nossosShown = filters.includeSeniors ? counts.nossosTotal : counts.nossosNonSenior;
  const todosShown = counts.todosTotal == null ? null
    : (filters.includeSeniors ? counts.todosTotal : counts.todosNonSenior);

  return (
    <>
      <Toolbar>
        <SidebarToggle open={sidebarOpen} onToggle={onToggleSidebar} backLabel="Jogadores" />
        <ToolbarTitle>🏌️ Jogadores</ToolbarTitle>
        <DataSourcesChip sources={dataSources} />
        {/* Toggle Nossos / TODOS (lazy-load federados.json) */}
        <div className="segmented-toggle" role="tablist" aria-label="Fonte de jogadores">
          <button
            role="tab"
            aria-selected={viewMode === "ours"}
            className={`seg-btn ${viewMode === "ours" ? "active" : ""}`}
            onClick={() => onSetViewMode("ours")}
            title={filters.includeSeniors
              ? `${counts.nossosTotal} jogadores com análise detalhada`
              : `${counts.nossosNonSenior} não-seniores (total ${counts.nossosTotal} com seniores)`}
          >
            <span className="seg-label">Nossos</span>
            <span className="seg-count">{nossosShown}</span>
          </button>
          <button
            role="tab"
            aria-selected={viewMode === "todos"}
            className={`seg-btn ${viewMode === "todos" ? "active" : ""}`}
            onClick={() => onSetViewMode("todos")}
            title={federadosError ? `Erro: ${federadosError}` : (filters.includeSeniors ? "Lista FPG completa (cadastro)" : `Sem seniores — total ${counts.todosTotal ?? "?"} com seniores`)}
            style={federadosError ? { background: "var(--color-warn-vivid)", color: "#fff" } : undefined}
          >
            <span className="seg-label">TODOS</span>
            <span className="seg-count">
              {todosShown != null ? todosShown.toLocaleString("pt-PT")
                : loadingFeds ? "⏳"
                : federadosError ? "⚠"
                : "15k+"}
            </span>
          </button>
        </div>
        {/* Vista Lista | 📊 Stats — era um botão de "filtro" 📊; é uma troca de
            vista, por isso ganha a forma segmented (padrão CamposPage). */}
        {viewMode === "todos" && (
          <div className="segmented-toggle" role="tablist" aria-label="Vista">
            <button role="tab" aria-selected={!showStats}
              className={`seg-btn ${!showStats ? "active" : ""}`}
              onClick={() => onSetShowStats(false)}>
              <span className="seg-label">Lista</span>
            </button>
            <button role="tab" aria-selected={showStats}
              className={`seg-btn ${showStats ? "active" : ""}`}
              onClick={() => onSetShowStats(true)}
              title="Estatísticas globais dos federados FPG">
              <span className="seg-label">📊 Stats</span>
            </button>
          </div>
        )}
        {viewMode === "todos" && federadosError && (
          <div className="muted fs-10 fw-600" style={{ color: "var(--color-warn-vivid)" }}>
            ⚠ Erro a carregar federados.json: {federadosError}
          </div>
        )}
        <ToolbarSep />
        {/* Pesquisa — padrão unificado da FPGPage (type=search + 🔎 + ×) */}
        <div style={{ flexShrink: 0, position: "relative", display: "inline-flex", alignItems: "center" }}>
          <span aria-hidden="true" style={{
            position: "absolute", left: 8, fontSize: "var(--fs-11)", color: "var(--text-muted)", pointerEvents: "none",
          }}>🔎</span>
          <input
            type="search"
            value={filters.q}
            onChange={e => update({ q: e.target.value })}
            placeholder="nome, clube, nº federado…"
            aria-label="Pesquisar jogadores"
            style={{
              fontSize: "var(--fs-12)",
              padding: "4px 22px 4px 24px",
              width: 200,
              border: "1px solid var(--border)",
              borderRadius: 5,
              background: "var(--bg-card)",
              color: "var(--text)",
              outline: "none",
            }}
          />
          {filters.q && (
            <button
              type="button"
              aria-label="Limpar pesquisa"
              onClick={() => update({ q: "" })}
              style={{
                position: "absolute", right: 2,
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-muted)", fontSize: "var(--fs-14)", padding: "0 4px",
                lineHeight: 1,
              }}
            >×</button>
          )}
        </div>
        <ToolbarSep />
        {/* Escalão pills — em NOSSOS sempre visíveis; em TODOS só quando o filtro
             de jovens está activo. Com Jovens activo escondemos pills de
             Absoluto/Sénior/SuperSenior/MidAmateur (não fazem sentido no contexto). */}
        {(viewMode === "ours" || isJuvenilFilter || filters.escalaoFilter.size > 0) && (
          <div className="escalao-pills">
            {filters.escalaoFilter.size > 0 && (
              <button className="p p-esc-clear" onClick={clearEscalao} title="Limpar filtros de escalão">✕</button>
            )}
            {escaloes.map(esc => {
              const active = filters.escalaoFilter.has(esc);
              const cls = escCls(esc);
              const count = escalaoCountMap[esc] || 0;
              if (count === 0 && !active) return null;
              // Quando filtro Jovens está activo, não mostrar pills de seniores.
              if (isJuvenilFilter && isSeniorEscalao(esc)) return null;
              return (
                <button
                  key={esc}
                  className={`p p-esc-filter p-${cls}${active ? " active" : ""}`}
                  onClick={() => toggleEscalao(esc)}
                  aria-pressed={active}
                  title={`${esc} (${count})`}
                >
                  {esc.replace("Sub-", "S")}{count > 0 && <span className="p-filter-count">{count}</span>}
                </button>
              );
            })}
          </div>
        )}
        {/* Preset 🧒 Jovens — pill ROTULADA (antes era botão-ícone sem texto) */}
        <button
          className={`tourn-tab tourn-tab-sm${isJuvenilFilter ? " active" : ""}`}
          onClick={() => update({ escalaoFilter: isJuvenilFilter ? new Set() : new Set(ESCALOES_JOVENS) })}
          aria-pressed={isJuvenilFilter}
          title={isJuvenilFilter ? "Limpar filtro de jovens" : "Só escalões jovens (Sub-10 a Sub-21)"}
        >
          🧒 Jovens
        </button>
        {/* 🟢 Novos — pill rotulada com count; disabled em vez de desaparecer
            (evita layout-shift quando os stats acabam de carregar) */}
        <button
          className={`tourn-tab tourn-tab-sm${filters.newFilter ? " active" : ""}`}
          onClick={() => update({ newFilter: !filters.newFilter })}
          aria-pressed={filters.newFilter}
          disabled={counts.newCount === 0}
          style={counts.newCount === 0 ? { opacity: 0.45, cursor: "default" } : undefined}
          title={filters.newFilter
            ? `Filtrando ${counts.newCount} jogadores com rondas nos últimos ${NEW_DAYS} dias — clicar para limpar`
            : `Mostrar só os ${counts.newCount} jogadores com rondas nos últimos ${NEW_DAYS} dias`}
        >
          🟢 Novos{counts.newCount > 0 && <span className="p-filter-count">{counts.newCount}</span>}
        </button>
        {/* Activos (ambos os modos) — com rondas este ano */}
        <button
          className={`tourn-tab tourn-tab-sm${filters.activeOnlyFilter ? " active" : ""}`}
          onClick={() => update({ activeOnlyFilter: !filters.activeOnlyFilter })}
          aria-pressed={filters.activeOnlyFilter}
          title={`Jogadores com rondas em ${new Date().getFullYear()} (união: player-stats locais + cadastro FPG)`}
        >
          🏌️ Activos
        </button>
        {/* ⚙️ Filtros — abre o painel secundário; badge = filtros do painel activos */}
        <button
          className={`tourn-tab tourn-tab-sm${panelOpen ? " active" : ""}`}
          onClick={() => setPanelOpen(v => !v)}
          aria-expanded={panelOpen}
          title={panelOpen ? "Fechar painel de filtros" : "Mais filtros (sexo, região, clube, HCP, ordenação, preferências)"}
        >
          ⚙️ Filtros{panelActiveCount > 0 && <span className="p-filter-count">{panelActiveCount}</span>}
        </button>
        {/* Limpar filtros + badge */}
        {activeFiltersCount > 0 && (
          <button
            className="p"
            onClick={clearAllFilters}
            title="Limpar todos os filtros activos (mantém ordenação e preferências)"
            style={{ background: "var(--color-warn-vivid)", color: "#fff", gap: 4 }}
          >
            ✕ Limpar <span className="p-filter-count">{activeFiltersCount}</span>
          </button>
        )}
        <Counter ml="auto">{filteredCount} jogadores</Counter>
        {/* ⓘ Info — páginas relacionadas (padrão CircuitShell). Rotas internas
            navegam na SPA; só a página estática abre em novo tab. */}
        <select
          className="input"
          value=""
          onChange={e => {
            const v = e.target.value;
            if (!v) return;
            if (v.endsWith(".html")) window.open(v, "_blank", "noopener");
            else navigate(v);
            e.currentTarget.value = "";
          }}
          style={{ fontSize: "var(--fs-12)", padding: "3px 6px", flexShrink: 0 }}
          title="Páginas relacionadas"
          aria-label="Páginas relacionadas"
        >
          <option value="">ⓘ Info</option>
          <option value="/analise-percurso-juniores.html">📈 Percurso de juniores ↗</option>
          <option value="/jogadores-por-ano">📅 Jogadores por ano</option>
          <option value="/torneios-recentes">🏆 Torneios recentes</option>
        </select>
      </Toolbar>

      {/* ── Painel secundário (linha 2) — filtros raros + preferências ── */}
      {panelOpen && (
        <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)", padding: "8px 12px" }}>
          <div className="filter-grid">
            <FilterField label="SEXO">
              <select className="filter-input" value={filters.sexFilter} onChange={e => update({ sexFilter: e.target.value as SexFilter })}>
                <option value="ALL">Todos</option><option value="M">Masculino</option><option value="F">Feminino</option>
              </select>
            </FilterField>
            {viewMode === "todos" && (
              <FilterField label="NACIONALIDADE">
                <select className="filter-input" value={filters.natFilter} onChange={e => update({ natFilter: e.target.value as typeof filters.natFilter })}>
                  <option value="ALL">Todas</option>
                  <option value="PT">🇵🇹 Portugueses</option>
                  <option value="FOREIGN">🌍 Estrangeiros</option>
                </select>
              </FilterField>
            )}
            <FilterField label="REGIÃO">
              <select className="filter-input" value={filters.regionFilter} onChange={e => update({ regionFilter: e.target.value })}>
                <option value="ALL">Todas</option>
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </FilterField>
            <FilterField label="CLUBE">
              <select className="filter-input" value={filters.clubFilter} onChange={e => update({ clubFilter: e.target.value })}>
                <option value="ALL">Todos</option>
                {clubOptions.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="HCP (DO / AO)">
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  className="filter-input" type="number" step="0.1" min="-10" max="54"
                  value={filters.hcpMin} onChange={e => update({ hcpMin: e.target.value })}
                  placeholder="mín" aria-label="HCP mínimo" style={{ width: 68 }}
                />
                <span className="muted fs-10">–</span>
                <input
                  className="filter-input" type="number" step="0.1" min="-10" max="54"
                  value={filters.hcpMax} onChange={e => update({ hcpMax: e.target.value })}
                  placeholder="máx" aria-label="HCP máximo" style={{ width: 68 }}
                />
              </div>
            </FilterField>
            {viewMode === "todos" && (
              <FilterField label="FONTE DOS DADOS">
                <select className="filter-input" value={filters.sourceFilter} onChange={e => update({ sourceFilter: e.target.value as typeof filters.sourceFilter })}>
                  <option value="ALL">Todas</option>
                  <option value="WITH_ANALYSIS">🔍 Com análise</option>
                  <option value="CADASTRO">ø Só cadastro</option>
                </select>
              </FilterField>
            )}
            <FilterField label="ORDENAR">
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <select
                  className="filter-input"
                  value={filters.sortKey}
                  onChange={e => {
                    const k = e.target.value as SortKey;
                    updateSort(k, k === "rounds" || k === "aces" ? "desc" : "asc");
                  }}
                >
                  <option value="rounds">Voltas</option>
                  <option value="name">Nome</option>
                  <option value="hcp">Handicap</option>
                  <option value="club">Clube</option>
                  <option value="escalao">Escalão</option>
                  <option value="ranking">🏆 Ranking</option>
                  <option value="aces">🕳️ Hole-in-one</option>
                </select>
                <button
                  className="tourn-tab tourn-tab-sm"
                  onClick={toggleSortDir}
                  title={filters.sortDir === "asc" ? "Ordem crescente (clica para inverter)" : "Ordem decrescente (clica para inverter)"}
                  aria-label={filters.sortDir === "asc" ? "Ordem crescente" : "Ordem decrescente"}
                  style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  {filters.sortDir === "asc" ? "↑ asc" : "↓ desc"}
                </button>
              </div>
            </FilterField>
          </div>
          {/* Preferências + toggles raros — mesmos ToggleChip da landing */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
            <ToggleChip
              checked={filters.includeSeniors}
              onChange={v => update({ includeSeniors: v })}
              label="👴 Incluir seniores"
              title="Mostrar também Absoluto/MidAmateur/Sénior/SuperSenior (preferência guardada)"
            />
            <ToggleChip
              checked={filters.prioritizeJuniors}
              onChange={v => update({ prioritizeJuniors: v })}
              label="⭐ Destaques no topo"
              title="Manuel, Gastão e top 5 de cada escalão do Nacional de Jovens no topo da ordenação por nome (preferência guardada)"
            />
            {counts.ppCount > 0 && (
              <ToggleChip
                checked={filters.onlyPP}
                onChange={v => update({ onlyPP: v })}
                label={`🏑 Só com HCP P&P (${counts.ppCount})`}
                title={`Mostrar só os ${counts.ppCount} jogadores com handicap Pitch & Putt estabelecido`}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
