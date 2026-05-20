/**
 * src/ui/circuit/types.ts
 *
 * Contrato da página-mãe de circuitos (CircuitShell).
 *
 * Todas as páginas de circuito (RFEG, France/FFG, England, GJGL, MAJOR=Doral+BJGT)
 * normalizam os seus dados para estes tipos e entregam-nos ao <CircuitShell>.
 * Cada página passa a ser: loader + adaptador + config — sem layout próprio.
 *
 * O leaderboard em si continua a ser desenhado pelo <IntlTournView>, que recebe
 * um Tournament (FPG-format) por divisão/secção. Ver src/ui/IntlTournView.tsx.
 */

import type React from "react";
import type { Tournament as FPGTournament, ScorecardOptions } from "../../data/fpgTypes";
import type { MultiRoundRow, ExtraColumn } from "../multiRoundTypes";

/** Sexo de uma divisão/escalão. "Mixed" → mostra dois badges (M+F). */
export type CircuitSex = "M" | "F" | "Mixed";

/** Secções possíveis no detalhe (cada uma só aparece se tiver dados). */
export type CircuitSectionKind = "results" | "inscritos" | "draw";

/** Modo de agrupamento da sidebar. */
export type CircuitGrouping = "year" | "series-year" | "source-year";

/** Toggles rápidos da toolbar (subconjunto activado por página via config). */
export type CircuitToggle =
  | "manuel"      // só/destacar o Manuel (universal)
  | "pt"          // todos os portugueses, tratados como o Manuel (universal)
  | "top10"       // top 10 classificados (universal, precisa de resultados)
  | "veteranos"   // jogadores presentes em >= veteranoThreshold torneios (universal, cross-entry)
  | "regressados" // jogou edição anterior do mesmo torneio (só séries anuais)
  | "subiram";    // subiu de escalão face à última edição (só séries anuais)

/**
 * Uma divisão (escalão) dentro de um torneio. Corresponde a um tab `.tab-under`
 * no detalhe. Tem pelo menos uma secção com dados.
 */
export interface CircuitDivision {
  /** Chave única dentro do entry (usada como key de React e no estado de tab). */
  key: string;
  /** Escalão canónico para pill/sorting (ex: "Boys 10-11", "Benjamín", "Sub-12"). */
  escalao: string;
  /** Override do label do tab quando o escalão canónico não descreve bem. */
  tabLabel?: string;
  /** Sexo da divisão (controla badges). */
  sex?: CircuitSex;
  /** True se o Manuel jogou esta divisão (marcador ★ no tab e selecção inteligente). */
  hasManuel?: boolean;

  // ── Secções (pelo menos uma) ──────────────────────────────────────
  /** Leaderboard de resultados (hole-by-hole se houver). Alimenta o IntlTournView. */
  results?: FPGTournament;
  /** Lista(s) de inscritos (admitidos/reservas/...). Estrutura livre por página. */
  inscritos?: CircuitInscritos;
  /** Draw / tee times. Estrutura livre por página (convertida para DrawTab). */
  draw?: CircuitDraw;

  // ── Opções de display do leaderboard ──────────────────────────────
  scOptions?: ScorecardOptions;
  /** Labels de ronda, ex: ["R1 · 25 Fev", "R2 · 26 Fev"]. */
  roundLabels?: string[];
  siLabel?: string;

  // ── Módulos avançados opcionais (BJGT: HoleDiff/ManuelDay; evo cross-ano) ──
  evoCols?: ExtraColumn<MultiRoundRow & { _pos?: number | null }>[];
  accHeader?: React.ReactNode;
  roundExtra?: (roundIndex: number) => React.ReactNode;
  accExtra?: React.ReactNode;
}

/** Lista de inscritos de uma divisão — sub-listas opcionais. */
export interface CircuitInscritos {
  /** Sub-listas nomeadas (admitidos, reservas, bajas, ...). A 1ª é o default. */
  lists: Array<{ key: string; label: string; players: CircuitInscritoRow[] }>;
}

export interface CircuitInscritoRow {
  pos?: number | string;
  name: string;
  club?: string;
  fed?: string;
  hcp?: number | null;
  escalao?: string;
  sex?: "M" | "F";
  country?: string;
  dob?: string;
  status?: string;
}

/** Draw / tee times de uma divisão — por ronda. */
export interface CircuitDraw {
  /** Por número de ronda → grupos de saída. */
  rounds: Record<string, CircuitDrawGroup[]>;
}

export interface CircuitDrawGroup {
  teeTime?: string;
  startHole?: number;
  tee?: string;
  players: Array<{ name: string; club?: string; fed?: string }>;
}

/**
 * Um torneio na sidebar. Pode ter várias divisões (escalões) → tabs no detalhe.
 */
export interface CircuitEntry {
  /** ID estável para deep-linking (vai para a URL). */
  id: string;
  /** Ano civil (agrupamento da sidebar). Null → grupo "Sem data". */
  year: number | null;
  /** Nome do torneio. */
  name: string;
  /** Série para agrupamento extra (BJGT vs EOWAGR; FFG vs LGPIDF). */
  series?: string;
  /** Fonte de dados (RFEGolf/NextCaddy/...) — controla cor do chip na sidebar. */
  source?: string;
  /** Campo. */
  course?: string;
  dateStart?: string;
  dateEnd?: string;
  /** Federação organizadora (mostrada no header). */
  federation?: string;
  /** Link para o leaderboard/microsite oficial. */
  sourceUrl?: string;
  /** Limites de HCP (mostrados no header se preenchidos). */
  hcpLimit?: { men?: number; women?: number };

  // ── Metadados leves para a sidebar (quando as divisões são lazy) ──────
  /** Escalão para o EscPill da sidebar (quando divisions ainda não carregadas). */
  escalao?: string;
  /** Sexo para badge na sidebar. */
  sex?: CircuitSex;
  /** Nº de jogadores (sidebar). Fallback: soma das divisões carregadas. */
  playerCount?: number;
  /** Nº de rondas (RoundPill na sidebar). */
  roundsCount?: number;
  /** Nº de escalões/divisões (sidebar). Fallback: divisions.length ?? 1. */
  divisionCount?: number;

  /**
   * Divisões (escalões) — tabs no detalhe.
   * EAGER (Doral/BJGT/England/GJGL): fornecer já aqui.
   * LAZY (RFEG/FFG, centenas de torneios): deixar `undefined` e fornecer
   * `loadDivisions`, que o shell chama ao seleccionar o torneio.
   */
  divisions?: CircuitDivision[];
  /** Carregamento lazy das divisões — chamado pelo shell na selecção (com cache). */
  loadDivisions?: () => Promise<CircuitDivision[]>;

  /** True se o Manuel jogou alguma divisão (marcador ★ na sidebar). */
  hasManuel?: boolean;
}

/** Item especial fixo no topo da sidebar (ex: Categorias de idade, Federações). */
export interface CircuitSpecialItem {
  key: string;
  label: string;
  render: () => React.ReactNode;
}

/**
 * Configuração ("personalidade") de uma página de circuito.
 */
export interface CircuitConfig {
  /** Base de rota para deep-linking (ex: "/rfeg"). */
  routeBase: string;
  /** Título na toolbar (ex: "🇪🇸 RFEG"). */
  title: string;
  /** Cor do circuito (CSS var, ex: "var(--color-doral-mid)"). */
  color?: string;
  /** Cor do texto sobre `color` nas etiquetas de ano. */
  textColor?: string;

  /** Agrupamento da sidebar. */
  grouping: CircuitGrouping;
  /** Ordem das séries quando grouping = "series-year". */
  seriesOrder?: string[];
  /** Cores por fonte quando grouping = "source-year" (chip colorido). */
  sourceColors?: Record<string, string>;
  /** Itens especiais fixos no topo da sidebar. */
  specialItems?: CircuitSpecialItem[];

  /** Filtros activos na toolbar. */
  filters?: {
    search?: boolean;
    year?: boolean;
    escalao?: boolean;
    sex?: boolean;
    source?: boolean;
    liga?: boolean;
    toggles?: CircuitToggle[];
  };

  /** Limiar de "muitos torneios" para o toggle Veteranos (default 3). */
  veteranoThreshold?: number;
  /**
   * Índice pré-calculado de presenças por jogador (normName → nº torneios),
   * para o toggle Veteranos em páginas com carregamento lazy (RFEG/FFG), onde
   * o shell não tem todos os jogadores em memória. Se omitido, o shell calcula
   * a partir das divisões EAGER carregadas.
   */
  veteranIndex?: Map<string, number>;

  /** Mensagem de loading. */
  loadingMessage?: string;
}
