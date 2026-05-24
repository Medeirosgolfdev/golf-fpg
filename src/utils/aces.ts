/**
 * src/utils/aces.ts
 *
 * Detecção de holes-in-one (aces) a partir de scorecards buraco-a-buraco.
 *
 * REGRA CANÓNICA: um ace é um gross de 1 num buraco cujo PAR É CONHECIDO e
 * pertence a {3, 4}. Justificação:
 *  - Par 3 é o caso típico de um hole-in-one.
 *  - Par 4 é rarissimo mas possível (drive directo ao buraco).
 *  - Par 5+ com gross 1 é fisicamente impossível → é artefacto de dados.
 *  - Buracos não jogados vêm como 0 / null → ignorados (não são "1").
 *  - Buracos sem par conhecido (formatos slim sem par inline) NÃO contam,
 *    por decisão de produto: preferimos não inflacionar com falsos positivos.
 *
 * Esta validação é essencial: uma contagem ingénua de "gross == 1" sobre
 * todo o dataset devolve milhares de ocorrências (duplicados + placeholders),
 * quase todas falsas. Passar sempre por estas funções.
 */

/** Pares onde um gross de 1 conta como hole-in-one. */
export const ACE_VALID_PARS: ReadonlySet<number> = new Set([3, 4]);

/** Um ace detectado num scorecard (buraco 1-based + par do buraco). */
export interface AceHit {
  /** Buraco, 1-based. */
  hole: number;
  /** Par do buraco (3 ou 4). */
  par: number;
  /** Ronda 1-based, quando a fonte é multi-ronda. */
  round?: number;
}

type Numish = number | null | undefined;

/**
 * Detecta aces num par de arrays gross/par alinhados por índice de buraco.
 * Ace = gross === 1 E par do buraco ∈ {3,4}. Tudo o resto é ignorado.
 */
export function findAces(scores: ReadonlyArray<Numish>, pars: ReadonlyArray<Numish>): AceHit[] {
  if (!Array.isArray(scores) || !Array.isArray(pars)) return [];
  const hits: AceHit[] = [];
  const n = Math.min(scores.length, pars.length);
  for (let i = 0; i < n; i++) {
    const g = scores[i];
    const p = pars[i];
    if (g === 1 && typeof p === "number" && ACE_VALID_PARS.has(p)) {
      hits.push({ hole: i + 1, par: p });
    }
  }
  return hits;
}

/** Forma mínima de um jogador para detecção de aces (compatível com fpgTypes.Player). */
export interface AceablePlayer {
  scores?: ReadonlyArray<Numish>;
  par?: ReadonlyArray<Numish>;
  roundScores?: ReadonlyArray<{ round?: number; scores?: ReadonlyArray<Numish>; pars?: ReadonlyArray<Numish> }>;
}

/**
 * Aces de um jogador. Prefere `roundScores` (multi-ronda canónico); cai para
 * os arrays flat `scores`/`par` (ronda única) só quando não há roundScores.
 */
export function playerAces(p: AceablePlayer): AceHit[] {
  const out: AceHit[] = [];
  if (p.roundScores && p.roundScores.length > 0) {
    for (const r of p.roundScores) {
      if (!Array.isArray(r.scores)) continue;
      for (const hit of findAces(r.scores, r.pars ?? [])) {
        out.push(r.round != null ? { ...hit, round: r.round } : hit);
      }
    }
  } else if (Array.isArray(p.scores)) {
    out.push(...findAces(p.scores, p.par ?? []));
  }
  return out;
}

/** Nº de aces de um jogador (atalho de `playerAces`). */
export function countPlayerAces(p: AceablePlayer): number {
  return playerAces(p).length;
}

/** Um ace no contexto de um torneio (inclui o nome do jogador). */
export interface TournamentAce extends AceHit {
  name: string;
}

/**
 * Todos os aces de uma lista de jogadores de um torneio. Itera UMA vez sobre a
 * lista consolidada (uma linha por jogador), pelo que não há duplicação por
 * sub-rondas — desde que se passe a lista de `players` já consolidada.
 */
export function tournamentAces(players: ReadonlyArray<AceablePlayer & { name?: string }>): TournamentAce[] {
  const out: TournamentAce[] = [];
  for (const p of players) {
    const name = p.name ?? "";
    for (const hit of playerAces(p)) out.push({ ...hit, name });
  }
  return out;
}

/** Forma mínima de um registo HOLES da página de jogador. */
export interface HoleScoresLike {
  g?: ReadonlyArray<Numish>;
  p?: ReadonlyArray<Numish>;
}

/** Um ace detectado nos HOLES de um jogador (inclui o scoreId da ronda). */
export interface HoleScoreAce extends AceHit {
  scoreId: string;
}

/**
 * Aces a partir do mapa HOLES (scoreId → {g, p}) usado na JogadoresPage.
 * Cada chave é uma ronda; agrega os aces de todas as rondas do jogador.
 */
export function acesFromHoleScores(holes: Record<string, HoleScoresLike> | null | undefined): HoleScoreAce[] {
  if (!holes) return [];
  const out: HoleScoreAce[] = [];
  for (const [scoreId, h] of Object.entries(holes)) {
    if (!h || !Array.isArray(h.g) || !Array.isArray(h.p)) continue;
    for (const hit of findAces(h.g, h.p)) out.push({ ...hit, scoreId });
  }
  return out;
}
