/**
 * multiRoundTypes.ts — tipos e constantes do MultiRoundLeaderboard
 * Separados do componente para evitar conflitos de Fast Refresh.
 */
import type React from "react";

export interface MRRound {
  roundKey?: string;
  label?: string;
  gross: number | null;
  toPar?: number | null;
  pts?: number | null;
  scorecardId?: string | null;
  /** Par da ronda (usado para calcular ±par por ronda) */
  parPerRound?: number;
  /** Scoring Differential */
  sd?: number | null;
  sdSource?: string | null;
  /** Contadores de score */
  birdies?: number;
  pars?: number;
  bogeys?: number;
}

export interface MultiRoundRow {
  /** Chave única para React key */
  key?: string;
  name: string;
  fed?: string;
  fedCode?: string;
  toPar: number | null;
  gross: number | null;
  pos: number;
  rounds: MRRound[];
  esc?: string;
  tee?: string;
  teeName?: string;
  sex?: string;
  club?: string;
  hcp?: number | null;
  /** Soma de todos os pars das rondas (para calcular ±par total) */
  parTotal?: number;
  /** Linha de destaque (Manuel) */
  isHighlighted?: boolean;
  /** Jogador incompleto (não jogou todas as rondas) */
  isIncomplete?: boolean;
  /** Jogador desistiu */
  isWD?: boolean;
  /** Emoji de bandeira pré-renderizado (para páginas sem playersDB) */
  countryFlag?: string;
}

export interface ExtraColumn<R = MultiRoundRow & { _pos?: number | null }> {
  /** Conteúdo do header */
  header: React.ReactNode;
  /** Classe CSS do th/td */
  className?: string;
  /** Style do th */
  headerStyle?: React.CSSProperties;
  /** Renderizar célula para cada linha */
  cell: (row: R, idx: number) => React.ReactNode;
}

export interface PlayerFilter {
  name: string;
  escs: string[];
  tees: string[];
  club: string;
}

export const EMPTY_FILTER: PlayerFilter = { name: "", escs: [], tees: [], club: "" };
