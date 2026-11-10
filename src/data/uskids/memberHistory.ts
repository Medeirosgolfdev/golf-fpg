/**
 * src/data/uskids/memberHistory.ts — a forma do histórico USKids por jogador
 * (`uskids-member-history-slim.json`), declarada UMA vez (10/11/2026 — estava
 * copiada em três ficheiros do Kids: Rivais, Scorecards anteriores e Campo).
 */

/** Uma volta: gross e, quando há, as pancadas buraco a buraco (18 posições,
 *  zeros nos buracos não jogados). */
export interface MHRound { gross: number; strokes?: number[] }

/** A prova de um jogador: escalão, lugar oficial (null = sem classificação) e voltas. */
export interface MHTorn { ageGroup: string; place: number | null; rounds: Record<string, MHRound> }

export interface MHPlr { name: string; country: string; torneios: Record<string, MHTorn> }

/** Campo, jardas e par do ESCALÃO (os mais novos jogam 9 buracos no mesmo torneio). */
export interface MHEscalaoMeta { course?: string; yards?: number[]; par?: number[] }

export interface MHTornMeta {
  name: string;
  startDate: string;
  holesPerRound: number;
  par: number[] | null;
  yards?: number[] | null;
  byEscalao?: Record<string, MHEscalaoMeta>;
}

export interface MHSlim {
  torneios: Record<string, MHTornMeta>;
  jogadores: Record<string, MHPlr>;
}
