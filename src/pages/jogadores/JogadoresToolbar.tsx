/**
 * src/pages/jogadores/JogadoresToolbar.tsx
 *
 * Toolbar completa da JogadoresPage: toggle Nossos/TODOS, pesquisa, filtros
 * (sexo, nacionalidade, região, clube, HCP, activos, fonte, novos, jovens,
 * seniores, pin, P&P), pills de escalão, ordenação, limpar e links externos.
 */
import type { Player, SexFilter } from "../../data/types";
import type { FederadoRaw } from "../../data/federadosLoader";
import { normalizeAgeLevel } from "../../data/federadosLoader";
import type { PlayerStatsDb } from "../../data/playerStatsTypes";
import { daysSince } from "../../data/playerStatsTypes";
import type { FederadoPP } from "../../data/federadosPPLoader";
import { hasRealPPHcp } from "../../data/federadosPPLoader";
import { escCls } from "../../utils/playerUtils";
import { isSeniorEscalao, coerceEscalao, ESCALOES_JOVENS } from "../../constants/escaloes";
import { Toolbar, ToolbarTitle } from "../../ui/Toolbar";
import Counter from "../../ui/Counter";
import SidebarToggle from "../../ui/SidebarToggle";
import type { JogadoresFiltersApi } from "./useJogadoresFilters";
import { NEW_DAYS, type ListPlayer, type SortKey, type ViewMode } from "./filterPlayers";

export default function JogadoresToolbar({
  api, viewMode, onSetViewMode,
  players, federados, loadingFeds, federadosError,
  allPlayers, statsDb, ppMap,
  escaloes, escalaoCountMap, regions, clubOptions,
  isJuvenilFilter, filteredCount,
  showStats, onToggleStats,
  sidebarOpen, onToggleSidebar,
}: {
  api: JogadoresFiltersApi;
  viewMode: ViewMode;
  onSetViewMode: (m: ViewMode) => void;
  players: Record<string, Player>;
  federados: FederadoRaw[] | null;
  loadingFeds: boolean;
  federadosError: string | null;
  allPlayers: ListPlayer[];
  statsDb: PlayerStatsDb;
  ppMap: Map<string, FederadoPP>;
  escaloes: string[];
  escalaoCountMap: Record<string, number>;
  regions: string[];
  clubOptions: { code: string; label: string }[];
  isJuvenilFilter: boolean;
  filteredCount: number;
  showStats: boolean;
  onToggleStats: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  const { filters, update, updateSort, toggleSortDir, toggleEscalao, clearEscalao, clearAllFilters, activeFiltersCount } = api;

  return (
    <Toolbar>
      <SidebarToggle open={sidebarOpen} onToggle={onToggleSidebar} backLabel="Jogadores" />
      <ToolbarTitle>🏌️ Jogadores</ToolbarTitle>
      {/* Toggle Nossos / TODOS (lazy-load federados.json) */}
      {(() => {
        // Contagens reactivas ao filtro de seniores. Quando seniores estão
        // ocultos, mostramos o nº de não-seniores para bater certo com a lista.
        const nossosTotal = Object.keys(players).length;
        const nossosNonSenior = Object.values(players).filter(p => !isSeniorEscalao(coerceEscalao(p.escalao))).length;
        const todosTotal = federados ? federados.length : null;
        // Usa a MESMA normalização que o sidebar (federadoToPlayer →
        // normalizeAgeLevel) para bater certo com o que aparece listado.
        // Mapa: Senior→Sénior, SuperSenior→Sénior, MidAmateur→Absoluto.
        const todosNonSenior = federados
          ? federados.filter(f => !isSeniorEscalao(normalizeAgeLevel(f.age_level))).length
          : null;
        const nossosShown = filters.includeSeniors ? nossosTotal : nossosNonSenior;
        const todosShown = todosTotal == null ? null : (filters.includeSeniors ? todosTotal : todosNonSenior!);
        return (
          <div className="segmented-toggle" role="tablist" aria-label="Fonte de jogadores">
            <button
              role="tab"
              aria-selected={viewMode === "ours"}
              className={`seg-btn ${viewMode === "ours" ? "active" : ""}`}
              onClick={() => onSetViewMode("ours")}
              title={filters.includeSeniors
                ? `${nossosTotal} jogadores com análise detalhada`
                : `${nossosNonSenior} não-seniores (total ${nossosTotal} com seniores)`}
            >
              <span className="seg-label">Nossos</span>
              <span className="seg-count">{nossosShown}</span>
            </button>
            <button
              role="tab"
              aria-selected={viewMode === "todos"}
              className={`seg-btn ${viewMode === "todos" ? "active" : ""}`}
              onClick={() => onSetViewMode("todos")}
              title={federadosError ? `Erro: ${federadosError}` : (filters.includeSeniors ? "Lista FPG completa (cadastro)" : `Sem seniores — total ${todosTotal ?? "?"} com seniores`)}
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
        );
      })()}
      {viewMode === "todos" && federadosError && (
        <div className="muted fs-10 fw-600" style={{ color: "var(--color-warn-vivid)" }}>
          ⚠ Erro a carregar federados.json: {federadosError}
        </div>
      )}
      {/* ORDEM: Nome · Sexo · Nacionalidade · Região · Clube · [Novos] · Jovens · Seniores · Stats */}
      <input className="input" value={filters.q} onChange={e => update({ q: e.target.value })}
        placeholder="Nome, clube, n.º federado…" />
      <select className="select" value={filters.sexFilter} onChange={e => update({ sexFilter: e.target.value as SexFilter })}>
        <option value="ALL">Sexo</option><option value="M">Masculino</option><option value="F">Feminino</option>
      </select>
      {viewMode === "todos" && (
        <select className="select" value={filters.natFilter} onChange={e => update({ natFilter: e.target.value as typeof filters.natFilter })} title="Nacionalidade">
          <option value="ALL">Nacionalidade</option>
          <option value="PT">🇵🇹 Portugueses</option>
          <option value="FOREIGN">🌍 Estrangeiros</option>
        </select>
      )}
      <select className="select" value={filters.regionFilter} onChange={e => update({ regionFilter: e.target.value })}>
        <option value="ALL">Região</option>
        {regions.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <select className="select" value={filters.clubFilter} onChange={e => update({ clubFilter: e.target.value })} title="Clube">
        <option value="ALL">Todos os clubes</option>
        {clubOptions.map(c => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>
      {/* Acções rápidas: Novos · Jovens · Seniores · Stats (TODOS) */}
      {Object.keys(statsDb).length > 0 && (() => {
        const newCount = allPlayers.filter(p => { const d = daysSince(statsDb[p.fed]); return d != null && d <= NEW_DAYS; }).length;
        if (newCount === 0) return null;
        return (
          <button
            className={`p p-icon-only p-novo${filters.newFilter ? " active" : ""}`}
            onClick={() => update({ newFilter: !filters.newFilter })}
            title={filters.newFilter
              ? `Filtrando ${newCount} jogadores com rondas nos últimos ${NEW_DAYS} dias — clicar para limpar`
              : `Mostrar só os ${newCount} jogadores com rondas nos últimos ${NEW_DAYS} dias`}
            style={{ background: filters.newFilter ? "var(--color-good)" : undefined, color: filters.newFilter ? "#fff" : undefined, borderColor: filters.newFilter ? "var(--color-good)" : "var(--border-best)" }}
          >
            <span className="p-icon-big" aria-hidden="true">🟢</span>
            <span className="p-filter-count">{newCount}</span>
          </button>
        );
      })()}
      <button
        className={`p p-icon-only ${isJuvenilFilter ? "active" : ""}`}
        onClick={() => {
          if (isJuvenilFilter) {
            update({ escalaoFilter: new Set() });
          } else {
            update({ escalaoFilter: new Set(ESCALOES_JOVENS) });
          }
        }}
        title={isJuvenilFilter ? "Limpar filtro de jovens" : "Só escalões jovens (Sub-10 a Sub-21)"}
      >
        <span className="p-icon-big" aria-hidden="true">🧒</span>
      </button>
      <button
        className={`p p-icon-only ${filters.includeSeniors ? "active" : ""}`}
        onClick={() => update({ includeSeniors: !filters.includeSeniors })}
        title={filters.includeSeniors ? "Ocultar seniores (Absoluto/Sénior/SuperSenior/MidAmateur)" : "Mostrar também seniores"}
        style={filters.includeSeniors ? { background: "var(--color-good)", color: "#fff" } : undefined}
      >
        <span className="p-icon-big" aria-hidden="true">👴</span>
      </button>
      <button
        className={`p p-icon-only ${filters.prioritizeJuniors ? "active" : ""}`}
        onClick={() => update({ prioritizeJuniors: !filters.prioritizeJuniors })}
        title={filters.prioritizeJuniors
          ? "Manuel, Gastão e top 5 de cada escalão do Nacional de Jovens no topo (clicar para ordem alfabética pura)"
          : "Fixar Manuel, Gastão e top 5 do Nacional de Jovens no topo da lista"}
        style={filters.prioritizeJuniors ? { background: "var(--accent)", color: "#fff" } : undefined}
      >
        <span className="p-icon-big" aria-hidden="true">⭐</span>
      </button>
      {ppMap.size > 0 && (() => {
        const ppCount = allPlayers.filter(p => hasRealPPHcp(ppMap.get(p.fed))).length;
        return (
          <button
            className={`p p-icon-only ${filters.onlyPP ? " active" : ""}`}
            onClick={() => update({ onlyPP: !filters.onlyPP })}
            title={filters.onlyPP
              ? `A mostrar só jogadores com HCP de Pitch & Putt — clicar para limpar`
              : `Mostrar só os ${ppCount} jogadores com HCP de Pitch & Putt`}
            style={filters.onlyPP ? { background: "var(--badge-pp, var(--badge-pp))", color: "#fff", borderColor: "var(--badge-pp, var(--badge-pp))" } : undefined}
          >
            <span className="p-icon-big" aria-hidden="true">🏑</span>
            <span className="p-filter-count">{ppCount}</span>
          </button>
        );
      })()}
      {viewMode === "todos" && (
        <button
          className={`p ${showStats ? "active" : ""}`}
          onClick={onToggleStats}
          title="Estatísticas globais"
        >
          📊
        </button>
      )}
      {/* Escalão pills — em NOSSOS sempre visíveis; em TODOS só quando o filtro
           de jovens está activo. Com Jovens activo escondemos pills de
           Absoluto/Sénior/SuperSenior/MidAmateur (não fazem sentido no contexto). */}
      {(viewMode === "ours" || isJuvenilFilter || filters.escalaoFilter.size > 0) && (
        <div className="escalao-pills">
          {filters.escalaoFilter.size > 0 && (
            <button className="p p-esc-clear" onClick={clearEscalao} title="Limpar filtros">✕</button>
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
                title={`${esc} (${count})`}
              >
                {esc.replace("Sub-", "S")}{count > 0 && <span className="p-filter-count">{count}</span>}
              </button>
            );
          })}
        </div>
      )}
      {/* HCP range */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <input
          className="input" type="number" step="0.1" min="-10" max="54"
          value={filters.hcpMin} onChange={e => update({ hcpMin: e.target.value })}
          placeholder="HCP min" title="HCP mínimo"
          style={{ width: 72 }}
        />
        <span className="muted fs-10">–</span>
        <input
          className="input" type="number" step="0.1" min="-10" max="54"
          value={filters.hcpMax} onChange={e => update({ hcpMax: e.target.value })}
          placeholder="HCP max" title="HCP máximo"
          style={{ width: 72 }}
        />
      </div>
      {/* Activos (ambos os modos) — com rondas este ano */}
      <button
        className={`p ${filters.activeOnlyFilter ? "active" : ""}`}
        onClick={() => update({ activeOnlyFilter: !filters.activeOnlyFilter })}
        title={`Jogadores com rondas em ${new Date().getFullYear()} (união: player-stats locais + cadastro FPG)`}
        style={{ background: filters.activeOnlyFilter ? "var(--color-good)" : undefined, color: filters.activeOnlyFilter ? "#fff" : undefined }}
      >
        🏌️ Activos
      </button>
      {/* Fonte — só TODOS */}
      {viewMode === "todos" && (
        <select
          className="select" value={filters.sourceFilter}
          onChange={e => update({ sourceFilter: e.target.value as typeof filters.sourceFilter })}
          title="Origem dos dados"
        >
          <option value="ALL">Fonte (todos)</option>
          <option value="WITH_ANALYSIS">🔍 Com análise</option>
          <option value="CADASTRO">ø Só cadastro</option>
        </select>
      )}
      {/* Sort: key + direction toggle */}
      <div style={{ display: "inline-flex", alignItems: "stretch", gap: 0 }}>
        <select
          className="select"
          value={filters.sortKey}
          onChange={e => {
            const k = e.target.value as SortKey;
            updateSort(k, k === "rounds" || k === "aces" ? "desc" : "asc");
          }}
          style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
        >
          <option value="name">Ordenar: Nome</option>
          <option value="hcp">Ordenar: Handicap</option>
          <option value="club">Ordenar: Clube</option>
          <option value="escalao">Ordenar: Escalão</option>
          <option value="ranking">Ordenar: 🏆 Ranking</option>
          <option value="rounds">Ordenar: Voltas</option>
          <option value="aces">Ordenar: 🕳️ Hole-in-one</option>
        </select>
        <button
          className="p"
          onClick={toggleSortDir}
          title={filters.sortDir === "asc" ? "Ordem crescente (clica para inverter)" : "Ordem decrescente (clica para inverter)"}
          style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: "0 8px", minWidth: 34 }}
        >
          {filters.sortDir === "asc" ? "▲" : "▼"}
        </button>
      </div>
      {/* Limpar filtros + badge */}
      {activeFiltersCount > 0 && (
        <button
          className="p"
          onClick={clearAllFilters}
          title="Limpar todos os filtros activos"
          style={{ background: "var(--color-warn-vivid)", color: "#fff", gap: 4 }}
        >
          ✕ Limpar <span className="p-filter-count">{activeFiltersCount}</span>
        </button>
      )}
      <Counter ml="auto">{filteredCount} jogadores</Counter>
      <span style={{ display: "inline-flex", gap: 6, whiteSpace: "nowrap" }}>
        <a
          href="/analise-percurso-juniores.html"
          target="_blank"
          rel="noopener noreferrer"
          title="Análise de percurso de juniores"
          className="btn-pill"
          style={{ fontSize: "var(--fs-11)", textDecoration: "none" }}
        >
          ↗ percurso
        </a>
        <a
          href="/jogadores-por-ano"
          target="_blank"
          rel="noopener noreferrer"
          title="Jogadores por ano"
          className="btn-pill"
          style={{ fontSize: "var(--fs-11)", textDecoration: "none" }}
        >
          ↗ por ano
        </a>
        <a
          href="/torneios-recentes"
          target="_blank"
          rel="noopener noreferrer"
          title="Torneios recentes reconstruídos das voltas dos nossos jogadores"
          className="btn-pill"
          style={{ fontSize: "var(--fs-11)", textDecoration: "none" }}
        >
          ↗ torneio
        </a>
      </span>
    </Toolbar>
  );
}
