/**
 * src/data/uskids/memberHistory.ts — a forma do histórico USKids por jogador
 * (`uskids-member-history-slim.json`), declarada UMA vez (10/11/2026 — estava
 * copiada em três ficheiros do Kids: Rivais, Scorecards anteriores e Campo).
 */
import { buracosDoFlight } from "../../utils/voltasJogadas";

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

/** Abaixo disto o gross é erro de dados (cartão incompleto), não uma volta. */
export const MIN_GROSS_18H = 55;
export const MIN_GROSS_9H = 28;

/** Família de um torneio USKids: o nome sem o ano no fim
 *  («European Championship 2025» → «European Championship»). */
export function mhFamilia(name: string): string {
  return name.replace(/\s+\d{4}\s*$/, "").trim();
}

/** Uma edição passada de um torneio, vista por UM escalão. */
export interface MHEdicao {
  tcode: string;
  meta: MHTornMeta;
  /** Ano tirado do nome («2024»). */
  year: string;
  /** Campo, jardas e par próprios do escalão, quando a fonte os dá. */
  escMeta?: MHEscalaoMeta;
  /** Par e jardas: os do escalão, senão os do torneio. */
  par: number[] | null;
  yards: number[] | null;
  /** [memberId, jogador] de quem jogou este torneio NESTE escalão. */
  jogadores: Array<[string, MHPlr]>;
  /** Buracos por volta do ESCALÃO, pelas voltas jogadas: a ficha do torneio diz
   *  18 mas o Boys 8 e o 7 & Under jogam 9. */
  hpr: 9 | 18;
  /** Mínimo de pancadas para uma volta contar (9 ou 18 buracos). */
  minGross: number;
}

/** As edições (todos os anos) da mesma família de torneio em que o escalão jogou —
 *  o arranque comum de «Edições anteriores» e «Scorecards anteriores» do Kids
 *  (10/11/2026 — estava copiado nas duas). Ficam de fora os Parent/Child e os
 *  torneios sem ano no nome. Cada página monta depois o que é dela. */
export function mhEdicoesDoEscalao(mh: MHSlim, nomeTorneio: string, escalaoNome: string): MHEdicao[] {
  const familia = mhFamilia(nomeTorneio);
  if (!familia) return [];
  const out: MHEdicao[] = [];
  for (const [tcode, meta] of Object.entries(mh.torneios)) {
    if (!meta?.name) continue;
    if (/Parent\/Child/i.test(meta.name)) continue;
    if (mhFamilia(meta.name) !== familia) continue;
    const yearMatch = meta.name.match(/(\d{4})/);
    if (!yearMatch) continue;
    const escMeta = meta.byEscalao?.[escalaoNome];
    const par = escMeta?.par || meta.par || null;
    const yards = escMeta?.yards || meta.yards || null;
    const jogadores = Object.entries(mh.jogadores).filter(([, p]) => p.torneios[tcode]?.ageGroup === escalaoNome);
    const hpr = buracosDoFlight(jogadores.flatMap(([, p]) => Object.values(p.torneios[tcode].rounds || {})), par, meta.holesPerRound);
    out.push({ tcode, meta, year: yearMatch[1], escMeta, par, yards, jogadores, hpr, minGross: hpr === 9 ? MIN_GROSS_9H : MIN_GROSS_18H });
  }
  return out;
}
