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
import type { MatchplayFile } from "./matchplayTypes";

/** Sexo de uma divisão/escalão. "Mixed" → mostra dois badges (M+F). */
export type CircuitSex = "M" | "F" | "Mixed";

/** Secções possíveis no detalhe (cada uma só aparece se tiver dados). */
export type CircuitSectionKind = "results" | "inscritos" | "draw" | "matchplay";

/** Modo de agrupamento da sidebar. */
type CircuitGrouping = "year" | "series-year" | "source-year";

/** Toggles rápidos da toolbar (subconjunto activado por página via config). */
export type CircuitToggle =
  | "manuel"      // só/destacar o Manuel (universal)
  | "pt"          // todos os portugueses, tratados como o Manuel (universal)
  | "top10"       // top 10 classificados (universal, precisa de resultados)
  | "veteranos"   // jogadores presentes em >= veteranoThreshold torneios (universal, cross-entry)
  | "results"     // só torneios com leaderboard publicado (universal)
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
  /**
   * Conteúdo de resultados à medida, renderizado em vez do IntlTournView quando
   * não há scorecards hole-by-hole (ex: GJGL com leaderboard só de totais).
   * Se `results` existir, tem precedência sobre `customResults`.
   */
  customResults?: React.ReactNode;
  /** Lista(s) de inscritos (admitidos/reservas/...). Estrutura livre por página. */
  inscritos?: CircuitInscritos;
  /** Draw / tee times. Estrutura livre por página (convertida para DrawTab). */
  draw?: CircuitDraw;

  /** Links de origem desta divisão (ex: BlueGolf/GolfGenius do escalão) —
   *  mostrados no header do detalhe junto aos links do torneio. */
  links?: CircuitLink[];

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
  /**
   * Substituição total da secção acumulada (Resumo) do IntlTournView. Recebe o
   * elemento do leaderboard acumulado e devolve o conteúdo completo da secção
   * (England/BJGT usam isto para envolver o leaderboard em cards + HoleDiff +
   * Field Stats). Tem precedência sobre accHeader/accExtra.
   */
  renderAccSection?: (leaderboard: React.ReactNode) => React.ReactNode;
  /**
   * Substituição total da secção de cada ronda do IntlTournView. Recebe o
   * leaderboard da ronda e o índice. Tem precedência sobre roundExtra.
   */
  renderRoundSection?: (leaderboard: React.ReactNode, roundIndex: number) => React.ReactNode;

  /**
   * Substituição total da secção de Inscritos. Quando definido, o shell renderiza
   * isto em vez do `InscritosView` interno (a DrivePage usa-o para mostrar o
   * `AdmissionsTab` da FPGPage). A secção continua a aparecer com base em `inscritos`.
   */
  renderInscritos?: () => React.ReactNode;
  /**
   * Substituição TOTAL do detalhe da divisão (header + section-tabs + conteúdo).
   * Quando definido, o shell desenha só as tabs de escalão e delega TUDO o resto
   * neste node — a DrivePage usa-o para montar o `TournamentDetail` da FPGPage
   * (tabs flat Inscrições·Draw·R1·R2·Resumo·Scorecards). Outras páginas não o
   * definem e mantêm o render por secções do shell.
   */
  renderFull?: () => React.ReactNode;
  /**
   * Só relevante com `renderFull`: mantém o DetailHeader do shell (título do
   * torneio + campo + pills) por cima do conteúdo `renderFull`. A FM usa isto
   * para ter o mesmo cabeçalho que os restantes torneios (JOB/Doral/BJGT) ao
   * mesmo tempo que delega o corpo no `TournamentDetail` (tabs flat com draws).
   * A DrivePage NÃO o define — lá o `TournamentDetail` traz o seu próprio header
   * com o nome real do torneio, e o do shell seria redundante.
   */
  renderFullKeepHeader?: boolean;
  /**
   * Substituição total da secção de Draw. Quando definido, o shell renderiza isto
   * em vez do `DrawView` interno (a DrivePage usa-o para mostrar o `DrawTab` da
   * FPGPage, com selector de ronda próprio). A secção aparece com base em `draw`.
   */
  renderDrawSection?: () => React.ReactNode;
  /**
   * Draws POR RONDA, para intercalar com os resultados na barra principal
   * (Inscrições · Draw R1 · R1 · Draw R2 · R2 · …) em vez de uma aba "Draw" única
   * com sub-menu. Quando presente, o shell NÃO mostra a aba "Draw" agregada e
   * passa estes a `IntlTournView`, que insere cada "Draw R{n}" antes da ronda n.
   * `round` é 1-based. Pode incluir rondas ainda não jogadas (ex: Draw R3 com só
   * os pairings, sem resultados).
   */
  roundDraws?: { round: number; render: () => React.ReactNode }[];
  /**
   * MATCH PLAY (brackets) do torneio — schema `MatchplayFile` gerado pelo
   * `scrape-golfbox-matchplay.js` (ETC no GolfBox: {slug}_matchplay_{ano}.json).
   * Com resultados de ronda, aparece como aba "Match Play" no FIM da barra do
   * IntlTournView (é a fase final, depois da qualificação stroke play); sem
   * rondas, entra na barra de secções. Renderizado pelo <MatchplayView>.
   */
  matchplay?: MatchplayFile;
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
  /** Código do torneio (ex: "10615") — mostrado como pill na sidebar. */
  tcode?: string;
  /** Fonte de dados (RFEGolf/NextCaddy/...) — controla cor do chip na sidebar. */
  source?: string;
  /** Ids das entradas FUNDIDAS numa entrada combinada (ex: as categorias de um
   *  Campeonato de España). Permite que um deep-link para um id membro
   *  seleccione o grupo — sem isto a URL não corresponde a entrada nenhuma. */
  memberIds?: string[];
  /** Liga/região (FFG: ligue) — alimenta o filtro `liga` da toolbar. */
  liga?: string;
  /** TODAS as ligas onde o torneio aparece (dedup multi-liga do portal FFG).
   *  Quando presente, o filtro e as pills usam esta lista; `liga` é o fallback. */
  ligas?: string[];
  /** Marca torneio internacional (FFG: Internationaux) — alimenta o filtro INTL. */
  intl?: boolean;
  /** Campo. */
  course?: string;
  dateStart?: string;
  dateEnd?: string;
  /** Federação organizadora (mostrada no header). */
  federation?: string;
  /** Link para o leaderboard/microsite oficial. */
  sourceUrl?: string;
  /**
   * Links de ação no header do detalhe (Inscrições/Draw/Scoring/Regulamento/PDF…).
   * Renderizados ao estilo da FPGPage, à direita do título. O `sourceUrl`, se
   * existir, é adicionado automaticamente como "Leaderboard oficial".
   */
  links?: CircuitLink[];
  /** Limites de HCP (mostrados no header se preenchidos). */
  hcpLimit?: { men?: number; women?: number };

  // ── Metadados leves para a sidebar (quando as divisões são lazy) ──────
  /** Escalão para o EscPill da sidebar (quando divisions ainda não carregadas). */
  escalao?: string;
  /** Escalões contidos numa entrada COMBINADA multi-escalão (lazy): o `escalao`
   *  único não chega e `divisions` ainda não carregaram. Alimenta o filtro e o
   *  dropdown de escalão para a entrada combinada continuar a aparecer. */
  escaloes?: string[];
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

  /** True se o Manuel jogou alguma divisão (marcador ★ na sidebar + filtro Manuel). */
  hasManuel?: boolean;
  /** True se há ≥1 jogador português (filtro PT da toolbar). Para páginas lazy
   *  deve vir do índice; para páginas eager o shell calcula das divisões. */
  hasPt?: boolean;
  /** True se há leaderboard publicado (≥1 classificado). Alimenta o toggle
   *  "Com resultados". `undefined` = desconhecido → nunca escondido pelo filtro. */
  hasResults?: boolean;
}

/** Item especial fixo no topo da sidebar (ex: Categorias de idade, Federações). */
export interface CircuitSpecialItem {
  key: string;
  label: string;
  render: () => React.ReactNode;
}

/**
 * Link de ação no header do detalhe (à direita do título), ao estilo da
 * FPGPage: Inscrições / Draw / Scoring / Regulamento / PDF / leaderboard oficial.
 * Renderizado como `.tourn-ext-link` (abre em nova aba).
 */
export interface CircuitLink {
  label: string;
  url: string;
  /** Emoji/ícone opcional antes do label. */
  icon?: string;
  /** Tooltip (title). */
  title?: string;
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
  /** Cores por fonte (chip colorido na sidebar). Ex: { rfegolf: "#aa151b" }. */
  sourceColors?: Record<string, string>;
  /** Labels legíveis por fonte (chip na sidebar). Ex: { rfegolf: "RFEGolf" }. */
  sourceLabels?: Record<string, string>;
  /** Labels legíveis por liga (FFG: ligue → nome da região) no dropdown. */
  ligaLabels?: Record<string, string>;
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
    /** Botão INTL — mostra só torneios marcados `intl` (FFG: Internationaux). */
    intl?: boolean;
    toggles?: CircuitToggle[];
    /** Toggles ligados por defeito ao abrir a página (subconjunto de `toggles`).
     *  Ex: RFEG liga "results" para esconder futuros só-inscritos à partida. */
    defaultToggles?: CircuitToggle[];
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

  /**
   * Tab extra no FIM da barra de cada divisão (a seguir a Resumo/Scorecards/
   * Match Play) — a MAJOR usa-a para "Edições anteriores". Recebe o torneio e a
   * divisão abertos e devolve o conteúdo; `null` esconde a tab.
   *
   * ⚠ Só se aplica às divisões que usam o render por secções do shell. As que
   * definem `renderFull` (delegam tudo no TournamentDetail) têm de passar a tab
   * pelo `extraTabs` desse componente — o shell não lhes toca no conteúdo.
   */
  pastEditionsTab?: (entry: CircuitEntry, div: CircuitDivision) => { label: string; content: React.ReactNode } | null;

  /** Mensagem de loading. */
  loadingMessage?: string;
}
