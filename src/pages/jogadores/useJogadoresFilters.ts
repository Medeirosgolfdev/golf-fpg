/**
 * src/pages/jogadores/useJogadoresFilters.ts
 *
 * Estado dos filtros da toolbar da JogadoresPage num único objecto
 * (JogadoresFilterState de filterPlayers.ts), com os helpers de mutação.
 * `beforeChange` é chamado antes de cada alteração de filtro (a página usa-o
 * para limpar a selecção — comportamento herdado da versão monolítica, onde
 * cada onChange chamava clearSelection()). As alterações de ORDENAÇÃO são
 * silenciosas (não limpam a selecção), como no original.
 */
import { useMemo, useState } from "react";
import type { JogadoresFilterState, SortKey } from "./filterPlayers";
import { countActiveFilters } from "./filterPlayers";

const makeDefaults = (): JogadoresFilterState => ({
  q: "",
  sexFilter: "ALL",
  escalaoFilter: new Set<string>(),
  regionFilter: "ALL",
  natFilter: "ALL",
  clubFilter: "ALL",
  hcpMin: "",
  hcpMax: "",
  activeOnlyFilter: false,
  sourceFilter: "ALL",
  // Por defeito ocultamos Sénior/SuperSenior/Absoluto/MidAmateur (são muitos e
  // menos interessantes para o tracking júnior). Botão na toolbar carrega-os.
  includeSeniors: false,
  newFilter: false,
  onlyPP: false,
  // Fixar Manuel, Gastão e o top 5 de cada escalão do Nacional de Jovens no
  // topo da lista alfabética (ver constants/pinnedPlayers.ts). Ligado por
  // defeito; "✕ Limpar" desliga-o → ordem alfabética pura. Re-activável pelo ⭐.
  prioritizeJuniors: true,
  // Default: ordenar por nº de rondas no ano corrente (desc) para destacar
  // jogadores activos.
  sortKey: "rounds",
  sortDir: "desc",
});

export interface JogadoresFiltersApi {
  filters: JogadoresFilterState;
  /** Altera filtros (chama beforeChange primeiro — limpa a selecção). */
  update: (patch: Partial<JogadoresFilterState>) => void;
  /** Altera a ordenação SEM limpar a selecção. */
  updateSort: (sortKey: SortKey, sortDir: "asc" | "desc") => void;
  toggleSortDir: () => void;
  toggleEscalao: (esc: string) => void;
  clearEscalao: () => void;
  /** "✕ Limpar": repõe todos os filtros; mantém ordenação e includeSeniors;
   *  desliga o pin (volta à ordem alfabética pura). */
  clearAllFilters: () => void;
  activeFiltersCount: number;
}

export function useJogadoresFilters(beforeChange?: () => void): JogadoresFiltersApi {
  const [filters, setFilters] = useState<JogadoresFilterState>(makeDefaults);

  const update = (patch: Partial<JogadoresFilterState>) => {
    beforeChange?.();
    setFilters(f => ({ ...f, ...patch }));
  };

  const updateSort = (sortKey: SortKey, sortDir: "asc" | "desc") => {
    setFilters(f => ({ ...f, sortKey, sortDir }));
  };

  const toggleSortDir = () => {
    setFilters(f => ({ ...f, sortDir: f.sortDir === "asc" ? "desc" : "asc" }));
  };

  const toggleEscalao = (esc: string) => {
    beforeChange?.();
    setFilters(f => {
      const next = new Set(f.escalaoFilter);
      if (next.has(esc)) next.delete(esc);
      else next.add(esc);
      return { ...f, escalaoFilter: next };
    });
  };

  const clearEscalao = () => {
    beforeChange?.();
    setFilters(f => ({ ...f, escalaoFilter: new Set() }));
  };

  const clearAllFilters = () => {
    beforeChange?.();
    setFilters(f => ({
      ...makeDefaults(),
      sortKey: f.sortKey,
      sortDir: f.sortDir,
      includeSeniors: f.includeSeniors,
      prioritizeJuniors: false, // volta à ordem alfabética pura
    }));
  };

  const activeFiltersCount = useMemo(() => countActiveFilters(filters), [filters]);

  return { filters, update, updateSort, toggleSortDir, toggleEscalao, clearEscalao, clearAllFilters, activeFiltersCount };
}
