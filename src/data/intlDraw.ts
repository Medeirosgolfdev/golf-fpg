/**
 * intlDraw.ts — o construtor único dos draws das fontes de fora da FPG
 * (MAJOR/GolfGenius/GolfBox, Espanha, GolfGenius FFG, LGPIDF) para o FpgDraw
 * que o DrawTab desenha.
 *
 * O tee sheet só traz nomes (às vezes clube/HCP/tee); o resto — país, HCP,
 * nascimento, estimativas, resultado — vem do leaderboard ou dos lookups da
 * fonte, cruzado POR NOME com `indexByName`. Cada fonte decide as suas chaves
 * de nome (normalização, as duas ordens do nome) e quem ganha num nome
 * repetido; o construtor junta o que o tee sheet traz com o enriquecimento.
 */
import type { FpgDraw, FpgDrawFlight } from "./nacional2026Loader";

export type FpgDrawPlayer = FpgDrawFlight["players"][number];

/** Índice por nome. Cada linha entra com todas as chaves que `keys` der (sem
 *  acentos, nas duas ordens do nome…); linhas sem valor (`undefined`) não
 *  entram. `keep`: "first" guarda a 1.ª ocorrência de cada chave, "last" a
 *  última (quem vem depois ganha). */
export function indexByName<R, V>(
  rows: Iterable<R>,
  keys: (row: R) => (string | null | undefined)[],
  value: (row: R) => V | undefined,
  keep: "first" | "last",
): Map<string, V> {
  const m = new Map<string, V>();
  for (const row of rows) {
    const v = value(row);
    if (v === undefined) continue;
    for (const k of keys(row)) {
      if (!k) continue;
      if (keep === "first" && m.has(k)) continue;
      m.set(k, v);
    }
  }
  return m;
}

/** Um flight (grupo de saída) tal como a fonte o dá. */
export interface DrawFlightIn<P> {
  teeTime: string;
  startHole: number | null;
  tee: string | null;
  players: P[];
}

/** Junta jogadores CONSECUTIVOS com a mesma chave (ex.: hora + buraco de saída)
 *  num flight — para fontes que publicam uma linha por jogador. */
export function groupConsecutive<P>(
  players: P[],
  key: (p: P) => string,
  flight: (first: P) => Omit<DrawFlightIn<P>, "players">,
): DrawFlightIn<P>[] {
  const out: DrawFlightIn<P>[] = [];
  let cur = "";
  for (const p of players) {
    const k = key(p);
    if (!out.length || k !== cur) { out.push({ ...flight(p), players: [] }); cur = k; }
    out[out.length - 1].players.push(p);
  }
  return out;
}

/** Flights → FpgDraw. Cada jogador = o que o tee sheet traz (`base`) + o que se
 *  sabe dele por nome (`enrich`). `head` (nome, data, total) só nas fontes que
 *  os dão. */
export function buildFpgDraw<P>(
  flights: DrawFlightIn<P>[],
  base: (p: P) => FpgDrawPlayer,
  enrich?: (p: P) => Partial<FpgDrawPlayer> | undefined,
  head?: Pick<FpgDraw, "name" | "date" | "totalJogadores">,
): FpgDraw {
  return {
    ...head,
    groups: flights.map((f) => ({
      teeTime: f.teeTime,
      startHole: f.startHole,
      tee: f.tee,
      players: f.players.map((p) => ({ ...base(p), ...enrich?.(p) })),
    })),
  };
}
