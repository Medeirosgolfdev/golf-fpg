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
import { escCls } from "../../utils/playerUtils";
import { isSeniorEscalao, ESCALOES_JOVENS } from "../../constants/escaloes";
import { Toolbar, ToolbarTitle, ToolbarSep } from "../../ui/Toolbar";
import Counter from "../../ui/Counter";
import SidebarToggle from "../../ui/SidebarToggle";
import { DataSourcesChip, type DataSource } from "../../ui/DataSources";
import { FilterField, ToggleChip } from "../../ui/FilterField";
import type { JogadoresFiltersApi } from "./useJogadoresFilters";
import { NEW_DAYS, type SortKey, type ViewMode } from "./filterPlayers";
import ClearButton from "../../ui/ClearButton";
import TabRow from "../../ui/TabRow";
import SearchInput from "../../ui/SearchInput";
import SexSelect from "../../ui/SexSelect";
import Select from "../../ui/Select";
import { MUTED } from "../../ui/tableCells";
import NumberInput from "../../ui/NumberInput";

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
  showStats, onSetShowStats, showCompare = false, onSetShowCompare,
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
  /** Vista «⚔️ Comparar» (comparar jogadores — veio do /comparar, 13/10/2026). */
  showCompare?: boolean;
  onSetShowCompare?: (v: boolean) => void;
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
        <TabRow ariaLabel="Fonte de jogadores" active={viewMode} onChange={onSetViewMode}
          tabs={[
            { key: "ours" as const, label: "Nossos", count: nossosShown,
              title: filters.includeSeniors
                ? `${counts.nossosTotal} jogadores com análise detalhada`
                : `${counts.nossosNonSenior} não-seniores (total ${counts.nossosTotal} com seniores)` },
            { key: "todos" as const, label: "TODOS", className: federadosError ? "is-warn" : undefined,
              count: todosShown != null ? todosShown.toLocaleString("pt-PT") : loadingFeds ? "⏳" : federadosError ? "⚠" : "15k+",
              title: federadosError ? `Erro: ${federadosError}` : (filters.includeSeniors ? "Lista FPG completa (cadastro)" : `Sem seniores — total ${counts.todosTotal ?? "?"} com seniores`) },
          ]} />
        {/* Vista Lista | 📊 Stats — era um botão de "filtro" 📊; é uma troca de
            vista, por isso ganha a forma segmented (padrão CamposPage). */}
        <TabRow ariaLabel="Vista" active={showCompare ? "compare" : showStats ? "stats" : "lista"}
          onChange={(k) => { onSetShowCompare?.(k === "compare"); onSetShowStats(k === "stats"); }}
          tabs={[
            { key: "lista", label: "Lista" },
            ...(viewMode === "todos" ? [{ key: "stats", label: "📊 Stats", title: "Estatísticas globais dos federados FPG" }] : []),
            ...(onSetShowCompare ? [{ key: "compare", label: "⚔️ Comparar", title: "Comparar até 4 jogadores lado a lado" }] : []),
          ]} />
        {viewMode === "todos" && federadosError && (
          <div className="muted fs-10 fw-600 u-c-color-warn-vivid">
            ⚠ Erro a carregar federados.json: {federadosError}
          </div>
        )}
        <ToolbarSep />
        {/* Pesquisa — padrão unificado da FPGPage (type=search + 🔎 + ×) */}
        <SearchInput value={filters.q} onChange={v => update({ q: v })} placeholder="nome, clube, nº fed…" ariaLabel="Pesquisar jogadores" />
        <ToolbarSep />
        {/* Escalão pills — em NOSSOS sempre visíveis; em TODOS só quando o filtro
             de jovens está activo. Com Jovens activo escondemos pills de
             Absoluto/Sénior/SuperSenior/MidAmateur (não fazem sentido no contexto). */}
        {(viewMode === "ours" || isJuvenilFilter || filters.escalaoFilter.size > 0) && (
          <div className="escalao-pills">
            {filters.escalaoFilter.size > 0 && (
              <ClearButton onClick={clearEscalao} title="Limpar filtros de escalão" />
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
        <ToggleChip checked={isJuvenilFilter} label="🧒 Jovens"
          onChange={() => update({ escalaoFilter: isJuvenilFilter ? new Set() : new Set(ESCALOES_JOVENS) })}
          title={isJuvenilFilter ? "Limpar filtro de jovens" : "Só escalões jovens (Sub-10 a Sub-21)"} />
        {/* 🟢 Novos — pill rotulada com count; disabled em vez de desaparecer
            (evita layout-shift quando os stats acabam de carregar) */}
        <ToggleChip checked={filters.newFilter} onChange={v => update({ newFilter: v })}
          disabled={counts.newCount === 0}
          label={<>🟢 Novos{counts.newCount > 0 && <span className="p-filter-count">{counts.newCount}</span>}</>}
          title={filters.newFilter
            ? `Filtrando ${counts.newCount} jogadores com rondas nos últimos ${NEW_DAYS} dias — clicar para limpar`
            : `Mostrar só os ${counts.newCount} jogadores com rondas nos últimos ${NEW_DAYS} dias`} />
        {/* Activos (ambos os modos) — com rondas este ano */}
        <ToggleChip checked={filters.activeOnlyFilter} onChange={v => update({ activeOnlyFilter: v })} label="🏌️ Activos"
          title={`Jogadores com rondas em ${new Date().getFullYear()} (união: player-stats locais + cadastro FPG)`} />
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
          <ClearButton onClick={clearAllFilters} count={activeFiltersCount}
            title="Limpar todos os filtros activos (mantém ordenação e preferências)" />
        )}
        {/* ⓘ Info — páginas relacionadas (padrão CircuitShell). Rotas internas
            navegam na SPA; só a página estática abre em novo tab. Vive ANTES
            do contador para o elemento na borda direita (scroll) ser o chip
            compacto e não um select meio-cortado. */}
        {/* value="" controlado: o React repõe «ⓘ Info» depois de cada escolha. */}
        <Select
          variant="compact"
          className="u-fsh-0"
          value=""
          onChange={v => {
            if (!v) return;
            if (v.endsWith(".html")) window.open(v, "_blank", "noopener");
            else navigate(v);
          }}
          title="Páginas relacionadas"
          aria-label="Páginas relacionadas"
        >
          <option value="">ⓘ Info</option>
          <option value="/analise-percurso-juniores.html">📈 Percurso de juniores ↗</option>
          <option value="/jogadores-por-ano">📅 Jogadores por ano</option>
          <option value="/torneios-recentes">🏆 Torneios recentes</option>
        </Select>
        {/* Contador compacto (só o número + 🏌️) — é o elemento na borda do
            scroll horizontal; a versão longa "N jogadores" cortava a meio. */}
        <Counter ml="auto" title={`${filteredCount.toLocaleString("pt-PT")} jogadores na lista`}>
          {filteredCount.toLocaleString("pt-PT")} 🏌️
        </Counter>
      </Toolbar>

      {/* ── Painel secundário (linha 2) — filtros raros + preferências ── */}
      {panelOpen && (
        <div className="u-bb-1px-solid-border u-bg-bg-card u-p-8px-12px">
          <div className="filter-grid">
            <FilterField label="SEXO">
              <SexSelect variant="filter" value={filters.sexFilter} onChange={v => update({ sexFilter: v })} allValue="ALL" />
            </FilterField>
            {viewMode === "todos" && (
              <FilterField label="NACIONALIDADE">
                <Select variant="filter" value={filters.natFilter} onChange={v => update({ natFilter: v as typeof filters.natFilter })}>
                  <option value="ALL">Todas</option>
                  <option value="PT">🇵🇹 Portugueses</option>
                  <option value="FOREIGN">🌍 Estrangeiros</option>
                </Select>
              </FilterField>
            )}
            <FilterField label="REGIÃO">
              <Select variant="filter" value={filters.regionFilter} onChange={v => update({ regionFilter: v })}>
                <option value="ALL">Todas</option>
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            </FilterField>
            <FilterField label="CLUBE">
              <Select variant="filter" value={filters.clubFilter} onChange={v => update({ clubFilter: v })}>
                <option value="ALL">Todos</option>
                {clubOptions.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="HCP (DO / AO)">
              <div className="u-d-flex u-gap-4px u-ai-center">
                <NumberInput variant="filter" className="u-w-68px" step="0.1" min="-10" max="54"
                  value={filters.hcpMin} onChange={t => update({ hcpMin: t })}
                  placeholder="mín" aria-label="HCP mínimo" />
                {MUTED}
                <NumberInput variant="filter" className="u-w-68px" step="0.1" min="-10" max="54"
                  value={filters.hcpMax} onChange={t => update({ hcpMax: t })}
                  placeholder="máx" aria-label="HCP máximo" />
              </div>
            </FilterField>
            {viewMode === "todos" && (
              <FilterField label="FONTE DOS DADOS">
                <Select variant="filter" value={filters.sourceFilter} onChange={v => update({ sourceFilter: v as typeof filters.sourceFilter })}>
                  <option value="ALL">Todas</option>
                  <option value="WITH_ANALYSIS">🔍 Com análise</option>
                  <option value="CADASTRO">ø Só cadastro</option>
                </Select>
              </FilterField>
            )}
            <FilterField label="ORDENAR">
              <div className="u-d-flex u-gap-4px u-ai-center">
                <Select
                  variant="filter"
                  value={filters.sortKey}
                  onChange={v => {
                    const k = v as SortKey;
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
                </Select>
                <button
                  className="tourn-tab tourn-tab-sm u-ws-nowrap u-fsh-0"
                  onClick={toggleSortDir}
                  title={filters.sortDir === "asc" ? "Ordem crescente (clica para inverter)" : "Ordem decrescente (clica para inverter)"}
                  aria-label={filters.sortDir === "asc" ? "Ordem crescente" : "Ordem decrescente"}

                >
                  {filters.sortDir === "asc" ? "▲ asc" : "▼ desc"}
                </button>
              </div>
            </FilterField>
          </div>
          {/* Preferências + toggles raros — mesmos ToggleChip da landing */}
          <div className="u-d-flex u-fwr-wrap u-gap-6px u-mt-8px u-ai-center">
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
