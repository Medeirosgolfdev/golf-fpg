/**
 * src/ui/circuit/teamPointsTypes.ts
 *
 * Classificação de EQUIPAS por pontos, repartida por categoria e por ronda/dia
 * (ex.: Regional de Clubes 2026 — 3-way match play, pontos por clube em
 * Homens/Senhoras/Juniores, Dia 1/Dia 2). Desenhada pela <TeamPointsStandings>;
 * os dados constroem-se no data layer (ex.: `clubesTeamPoints` em
 * src/data/clubesMatchplayAdapter.ts).
 */

/** Resultado de um jogador contra uma equipa adversária (um por confronto). */
export interface TeamPointsResult {
  won: boolean;
  half: boolean;
  margin: string | null;
  /** Emparelhado mas sem resultado publicado. */
  pending?: boolean;
}

/** Linha de um jogador no detalhe de uma equipa. */
export interface TeamPointsPlayerRow {
  key: string;
  catKey: string;
  name: string;
  fed?: string | null;
  gross?: number | null;
  toPar?: number | null;
  pts: number | null;
  /** Resultados contra cada equipa adversária (chave = equipa). */
  vs: Record<string, TeamPointsResult[]>;
}

/** Uma vista (uma ronda, ou o total de todas). */
export interface TeamPointsSelection {
  /** pts[equipa][categoria] — categoria ausente = a equipa não a joga. */
  pts: Record<string, Record<string, number>>;
  /** Confrontos sem resultado publicado nesta vista. */
  pending: number;
  /** Jogadores de cada equipa nesta vista. */
  players: Record<string, TeamPointsPlayerRow[]>;
}

export interface TeamPointsData {
  teams: { key: string; name: string; shortName?: string }[];
  categories: { key: string; label: string }[];
  rounds: { n: number; label: string }[];
  /** Uma entrada por ronda (`n`) e `"all"` = total. */
  byRound: Record<string, TeamPointsSelection>;
  /** Classificação oficial publicada (equipa → lugar), quando existe. */
  officialPlaces?: Record<string, number>;
  /** Equipas a destacar (ex.: a do Manuel). */
  highlight?: string[];
  /** Explicação do aviso de confrontos pendentes. */
  pendingNote?: string;
}

/** Pontos de match play: 0.5 → "½", 1.5 → "1½". */
export function fmtPoints(v: number | null | undefined): string {
  if (v == null) return "—";
  const int = Math.floor(v);
  const half = Math.abs(v - int - 0.5) < 1e-9;
  if (!half) return String(v);
  return int === 0 ? "½" : `${int}½`;
}
