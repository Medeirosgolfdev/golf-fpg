import type React from "react";
import type { BaseRoundScore, BasePlayer, BaseTournament } from "../ui/sharedTypes";

/**
 * fpgTypes.ts — Tipos partilhados do pipeline FPG
 *
 * Usados por FPGPage, DrivePage, DORALPage, BJGTPage, USKIDSPage.
 * Extraídos de FPGPage.tsx para evitar imports circulares.
 * Extends base types from sharedTypes.ts for consistency across domains.
 */

/** FPG-specific round score with full hole-by-hole data */
export interface RoundScore extends BaseRoundScore {
  // Extends BaseRoundScore with FPG-specific additions if any
}

/** FPG-specific player with full scoring history and internal flags */
export interface Player extends BasePlayer {
  scoreId: string;
  fed?: string;
  fedCode?: string;
  hcpExact?: number;
  hcpPlay?: number;
  parTotal?: number;
  scores?: number[];
  par?: number[];
  si?: number[];
  meters?: number[];
  roundScores?: RoundScore[];
  /** Escalão do jogador nesta entrada (torneios multi-escalão trazem-no por linha). */
  escalao?: string | null;
  /** Campo jogado (presente em linhas de scorecard/volta individual). */
  course?: string;
  // flags internas de multi-ronda (não vêm do JSON — atribuídas por expandMultiRound)
  _wd?: boolean;          // desistiu em ≥1 ronda
  _cut?: boolean;         // eliminado no cut (rondas completas mas N < maxR)
  _incomplete?: boolean;  // jogou menos rondas que o máximo disponível
  _roundsPlayed?: number; // rondas válidas jogadas
  _dp?: number;           // display position (atribuído pela ScorecardLB para ranking)
  /** Marca jogador português em páginas internacionais (FFG, etc.) — aplica
   *  highlight verde néon na linha. Atribuído pelo adaptador da página. */
  _isPortuguese?: boolean;
}

/** FPG-specific tournament with full structure and metadata */
export interface Tournament extends BaseTournament {
  /** Override BaseTournament.players (BasePlayer[]) com o tipo FPG completo,
   *  para que `t.players[i].roundScores` etc. tipem correctamente em fpgUtils. */
  players: Player[];
  ccode?: string;
  clube?: string;
  circuit?: string;
  series?: string;
  region?: string;
  escalao?: string | null;
  num?: number;
  /** Mapa clube → letra de equipa do sorteio oficial (torneios de clubes).
   *  Usado por autoGruposByClub para mostrar as letras oficiais (A/B/C…) em
   *  vez de uma atribuição alfabética automática. */
  teamLetters?: Record<string, string>;
  links?: Record<string, string>;
  /** Links extra do torneio (regulamento, página do evento, etc.) — aparecem
   *  na toolbar do detalhe ao lado de Inscrições/Draw/Scoring. */
  extraLinks?: Array<{ label: string; url: string; icon?: string }>;
  rounds?: number;
  playerCount: number;
  _sourceFile?: string;
  _sourceIndex?: number;
  _isSynthetic?: boolean;
  _subRounds?: Tournament[];
  // Multi-round metadata
  _multiGroup?: string;    // parent tcode (shared by R1/R2/Total)
  _roundLabel?: string;    // "R1", "R2", "Resumo"
  _totalRounds?: number;   // e.g. 2
  _isIncomplete?: boolean; // true for players missing rounds
  /** Nº da ronda que está A DECORRER (parte do campo ainda em jogo). Quem não
   *  saiu para ela não é um jogador incompleto — sem isto o acumulado marcava
   *  metade do field como eliminado no cut a meio da manhã. */
  _openRound?: number;
  /** Override do label do botão/tab de escalão na Jovens view. Usar quando o
   *  `escalao` canónico (ex: "Sub 10") não descreve bem o torneio — p.ex. num
   *  Regional combinado Sub 10/12 ou Sub 14 a 24, o label fica "Sub 10 e 12"
   *  ou "Sub 14 a 24" apenas no botão, mantendo o `escalao` para sorting/pills. */
  _tabLabel?: string;
}

export interface GrupoJogador { nome: string; fed: string | null; hcp: number | string; }
export interface GrupoEntry   { grupo: string; clube: string; jogadores: GrupoJogador[]; suplente?: string; capitao?: string; }

/** Opções opcionais para adaptar o scorecard a contextos não-FPG (ex: Doral) */
export interface ScorecardOptions {
  hideHCP?: boolean;      // ocultar coluna HCP
  hideSD?: boolean;       // ocultar coluna SD
  hideEsc?: boolean;      // ocultar coluna ESC (escalão)
  hideFed?: boolean;      // ocultar coluna FED (federação)
  hideTee?: boolean;      // ocultar coluna TEE
  hideClub?: boolean;     // ocultar coluna CLUB (usado em RFEG: clube é irrelevante)
  showAge?: boolean;      // mostrar coluna IDADE (separada da ESC, sortable; usa player._age)
  showClass?: boolean;    // mostrar coluna ANO de graduação/class year (sortable; usa player._classYear) — JWGC/FCG BlueGolf
  noPlayerLink?: boolean; // não criar link /jogadores/{fed} no nome (usado em RFEG: licenças espanholas não correspondem a fed codes FPG)
  clubLabel?: string;     // label alternativo para coluna Clube (ex: "País")
  startHole?: number;     // buraco inicial (default 1, back-9: 10)
  /** Esconder símbolo "≈" do SD raw (jogadores sem HCP). Útil em USKids onde
   *  o tip é redundante para todos. PT players com HCP FPG continuam a ver "~". */
  hideRawSDTip?: boolean;
  /** Decorador que envolve o conteúdo do nome (ex: para adicionar ↗ Kids link). */
  nameDecorator?: (name: string, content: React.ReactNode) => React.ReactNode;
  /** USKids / torneio a decorrer ou interrompido: NÃO estimar (Net Double
   *  Bogey) os buracos por jogar. Um cartão em branco = buraco por jogar (fica
   *  em branco), não um buraco por terminar; o ±par sai só dos buracos jogados
   *  (ou null), nunca gross − par total. */
  noInferBlanks?: boolean;
}

export interface SDResult {
  sd: number | null;
  /** "fpg" = SD oficial vindo da fonte (WHS), não recalculado localmente. */
  source: "ags" | "raw" | "fpg" | null;
}

export interface PlayerFilter {
  name: string;
  escs: string[];
  tees: string[];
  club: string;
  /** Filtro M/F: "" = todos, "M" = só masculino, "F" = só feminino. */
  sex?: "" | "M" | "F";
}
