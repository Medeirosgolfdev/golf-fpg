/**
 * clubesMatchplayTypes.ts — Tipos do match play 3-way dos torneios de clubes
 * (ex.: Campeonato Regional de Clubes 2026, Palheiro). O ficheiro CLUBES{ano}.json
 * traz estes dados em `matchPlayResults` no torneio.
 */

export interface MpPlayer { name: string; fed?: string; gross?: number | null; toPar?: number | null; scores?: (number | null)[]; }
export interface MpH2H    { w: string; l: string; margin: string | null; half?: boolean; }
export interface MpMatch  {
  match: number;
  note?: string;
  players?: Record<string, MpPlayer>;
  h2h?: MpH2H[];
  /** Pontos de cada clube neste match — a chave é a do clube (ex.: `"cgss": 1`). */
  [clubKey: string]: unknown;
}
export interface MpDia    { dia: number; matches?: MpMatch[]; subtotal: Record<string, number>; }
export interface MpCat    {
  key: string; label: string; note?: string; dias: MpDia[];
  /** Clubes que jogam esta categoria (ex.: o CGSS não alinha em Senhoras). Sem
   *  isto, todos os clubes. */
  participants?: string[];
}
export interface MpDrawPlayer { name: string; fed?: string; club: string; tee?: string; }
export interface MpDrawGroup  { teeTime: string; tee?: string; players: MpDrawPlayer[]; }
export interface MpDiaDraw    { date?: string; modalidade?: string; campo?: string; groups: Record<string, MpDrawGroup[]>; }
export interface MatchPlayData {
  lastUpdated?: string;
  clubs: { key: string; name: string; shortName: string }[];
  categories: MpCat[];
  course?: { nome?: string; tee?: string; par: number[]; parTotal?: number; meters?: number[]; };
  dia1?: MpDiaDraw;
  dia2?: MpDiaDraw;
  /** Total oficial por clube; `_places` = classificação final (clube → lugar). */
  grandTotal?: { _places?: Record<string, number>; [clubKey: string]: unknown };
}

/** Uma linha por JOGADOR (não por match): no modo Total um miúdo joga nos dois
 *  dias e aparecia 2× na tabela. Agrega por fed (ou nome) somando os pontos e
 *  juntando os confrontos de cada adversário. */
export interface MpRow {
  key: string;
  player: MpPlayer | undefined;
  pts: number | null;
  /** Uma entrada POR CONFRONTO JOGADO (não por resultado): quando o jogador
   *  esteve emparelhado mas o resultado não foi publicado, a entrada fica
   *  `pending` — assim a linha do dia não desaparece e vê-se o que falta. */
  byOpp: Map<string, { won: boolean; half: boolean; margin: string | null; pending?: boolean }[]>;
}
