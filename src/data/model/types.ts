/**
 * src/data/model/types.ts — MODELO COMUM de um torneio, igual para todas as
 * fontes (FPG, Drive, USKids, MAJOR, França, Espanha, GJGL, EGR, WAGR…).
 *
 * Fase 0 do plano «reescrita por tipo de torneio» (22/10/2026): a app passa a
 * saber, em dados, o FORMATO (stroke / só totais / match play / equipas), o
 * ESTADO (futuro / a decorrer / acabado), os buracos, o cut e de onde vem o
 * par — em vez de cada página o inferir à sua maneira. Os campos são opcionais
 * e vivem AO LADO das inferências antigas (`_openRound`, `hasResults`, `_cut`),
 * que continuam a funcionar; as funções de `tournament.ts` dizem o mesmo que
 * elas (há testes). Só tipos aqui — nada de React.
 */
import type { FpgDraw } from "../nacional2026Loader";

/** Formato do torneio (o que decide a peça que o desenha). */
export type TournamentFormat =
  /** Stroke play com cartões buraco a buraco (TournamentDetail). */
  | "stroke"
  /** Só totais por volta, sem cartões (TotalsResumo). */
  | "totals"
  /** Match play individual (MatchplayView: Taça FPG, CFJ…). */
  | "matchplay-ind"
  /** Match play por equipas (MatchplayView: ETC, Clubes 3-way). */
  | "matchplay-team"
  /** Stroke play por equipas (Clubes por grupos/categorias). */
  | "stroke-team";

/** Estado do torneio, tirado dos DADOS (não da data):
 *  `future` = sem resultados (só inscrições/draw); `live` = uma volta a
 *  decorrer (`_openRound`); `finished` = com resultados e nenhuma volta aberta. */
export type TournamentStatus = "future" | "live" | "finished";

/** De onde vem o par: `oficial` = par por buraco da fonte; `total-only` = só
 *  o par total (ou o ±par da fonte) — sem par por buraco; `none` = sem par
 *  nenhum (regra de 22/10/2026: nunca se inventa). */
export type ParOrigin = "oficial" | "total-only" | "none";

/** Cut de um torneio de várias voltas (o mesmo que o TournamentDetail mostra
 *  na aba «Pré-Cut»: vem do `expandMultiRound`). */
export interface CutInfo {
  /** Volta depois da qual houve cut (1-based). */
  afterRound: number;
  /** Pior resultado acumulado de quem passou (gross nas voltas até ao cut);
   *  null quando os cartões não o dizem. */
  line: number | null;
  /** Nº de eliminados no cut. */
  out: number;
}

/** Os campos do modelo num torneio/divisão. Todos opcionais. */
export interface TournamentModel {
  format?: TournamentFormat;
  status?: TournamentStatus;
  /** 9 ou 18 (o nº de buracos que o leaderboard desenha); null = sem cartões. */
  holes?: number | null;
  /** Cut, quando houve; null = sem cut. */
  cut?: CutInfo | null;
  parOrigin?: ParOrigin;
}

/** Identidade de um jogador, num só formato para todas as fontes
 *  (ver `identity.ts`). null = a fonte não o diz — nunca se adivinha. */
export interface PlayerIdentity {
  sex: "M" | "F" | null;
  /** Código ISO-3166 alfa-2 em maiúsculas («PT», «ES», «GB»…). Subdivisões do
   *  Reino Unido ficam «GB-ENG»/«GB-SCT»/«GB-WLS»/«GB-NIR». */
  countryIso: string | null;
  /** Data de nascimento ISO (AAAA-MM-DD) quando a fonte a dá. */
  dob: string | null;
  /** Ano de nascimento (do `dob`, ou o ano que a fonte dá). */
  birthYear: number | null;
  /** Escalão CANÓNICO (`escalao.ts`: «Sub 12», «10 anos», «Absoluto»…). */
  escalao: string | null;
}

/** Colunas que o DrawTab esconde (o mesmo `hideCols` do DrawTab). */
export interface DrawHideCols { esc?: boolean; fed?: boolean; clube?: boolean; hcp?: boolean; tee?: boolean; nasc?: boolean }

/** Draw de uma volta como DADOS (sem React): o CircuitShell/TournamentDetail
 *  desenham-no com o DrawTab partilhado. Os loaders podem produzi-lo e outras
 *  páginas (Kids 2, scripts) reaproveitá-lo sem desenhar nada. */
export interface RoundDrawData {
  /** Volta (1-based). */
  round: number;
  /** Grupos e horas no formato FPG. */
  draw?: FpgDraw;
  /** Data do torneio (para idades/escalões); null = a do próprio draw. */
  tournamentDate?: string | null;
  hideCols?: DrawHideCols;
  /** Rótulo da coluna do clube (USKids: «Cidade»). */
  clubLabel?: string;
  /** Resultado de cada jogador nessa volta, por federado/nome normalizado. */
  results?: Map<string, { gross: number; toPar: number | null }>;
}

/** Aviso por cima de uma tabela de totais: `aviso` = caixa «notice» (WAGR);
 *  `nota` = linha pequena (LGPIDF). */
export interface TotalsNotice { kind: "aviso" | "nota"; text: string; title?: string }

/** Coluna extra de uma tabela de totais, como dados: o valor é o campo `field`
 *  do jogador, com `decimals` casas (sem número → «–»). */
export interface TotalsExtraCol { header: string; title?: string; field: string; decimals?: number }
