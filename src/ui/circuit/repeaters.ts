/**
 * src/ui/circuit/repeaters.ts
 *
 * «Quem repete» genérico (13/10/2026): dos jogadores do field de HOJE (resultados,
 * inscritos ou draw da divisão aberta), quem já jogou edições anteriores da mesma
 * prova e onde ficou em cada uma. Cálculo puro — a tabela é o
 * `Scout.tsx` (aba «Scout», ex-«Quem repete»). A FPG junta-lhe colunas próprias — HCP, forma
 * WHS e previsão (`ui/circuit/ScoutProva.tsx`, modelo em `pages/fpg/repeatersModel.ts`); aqui só se usa o que
 * todas as fontes têm: posição, total e ±par de cada edição.
 *
 * Quem é quem (10/11/2026): pelo FEDERADO quando o field e a edição o trazem,
 * senão pelo nome — `utils/playerKey.ts`. Só pelo nome, dois homónimos com
 * federados diferentes ficavam com os resultados um do outro.
 */
import { fedFpg, indexPlayers, playerKey } from "../../utils/playerKey";
import { findManuelNaProva, isManuel } from "../../constants/manuel";
import { classificarPorTotal } from "../../utils/classificacao";
import type { PastEdition, PastEditionPlayer } from "./PastEditionsTable";

/**
 * O lugar de cada jogador numa edição: o oficial da fonte (`pos`) quando o há;
 * senão o lugar pelo total entre quem fez todas as voltas, com empates (dois
 * 1.ºs, a seguir o 3.º) — `classificarPorTotal`. Quem não acabou e não tem lugar
 * oficial fica sem lugar. É o lugar do JOGADOR, não o número da linha
 * (10/11/2026) — usado aqui e nas medalhas da tabela «Edições anteriores».
 */
export function editionPlaces(e: Pick<PastEdition, "players">): Map<PastEditionPlayer, number> {
  const { pos } = classificarPorTotal(e.players, (p) => p.fullRounds, (p) => p.total);
  const out = new Map<PastEditionPlayer, number>();
  for (const p of e.players) {
    const lugar = p.pos ?? pos.get(p) ?? null;
    if (lugar != null) out.set(p, lugar);
  }
  return out;
}

/** Jogador do field. O `fed` (FPG), quando há, identifica-o melhor do que o
 *  nome — «Manuel Medeiros» é também o nome do pai (54907). */
export interface FieldPlayer {
  name: string; club?: string | null; country?: string | null; fed?: string | null;
  /** Nascimento que a prova traz (ISO, ou só o ano). */
  dob?: string | null;
}

/** É o Manuel? Pelo federado FPG quando o field o traz (o pai, 54907, também se
 *  chama «Manuel Medeiros»), senão pelo nome. Uma licença de fora (RFEG, FFG…)
 *  não é um federado FPG: aí decide o nome. */
export function fieldIsManuel(p: { name: string; fed?: string | null }): boolean {
  return isManuel({ fed: fedFpg(p.fed) ?? undefined, name: p.name });
}

export interface RepeaterCell {
  pos: number | null;
  total: number | null;
  toPar: number | null;
  /** Fez todas as voltas da edição (senão o lugar é de quem não acabou). */
  complete: boolean;
  /** Jogadores dessa edição (o «de N» do lugar). */
  field: number;
}

export interface RepeaterRow {
  /** `playerKey(fed, nome)` do jogador do field. */
  key: string;
  name: string;
  club: string | null;
  isManuel: boolean;
  /** Resultado por edição (id da edição → célula). */
  byEd: Record<string, RepeaterCell>;
  /** Edições anteriores jogadas. */
  n: number;
  bestPos: number | null;
  /** Média do ±par nas edições completas. */
  avgToPar: number | null;
  /** Confrontos com o Manuel nas edições em que os dois acabaram: [Manuel à frente, atrás]. */
  vsManuel: [number, number] | null;
}

export interface RepeatersResult {
  rows: RepeaterRow[];
  /** Edições usadas (as anteriores — sem a de hoje), pela ordem recebida. */
  editions: PastEdition[];
  fieldSize: number;
}

export function buildRepeaters(field: FieldPlayer[], editions: PastEdition[], currentId?: string | null): RepeatersResult {
  const prev = editions.filter((e) => e.id !== currentId);
  // Índice por edição: federado-senão-nome (tolera «Apelido, Nome»), com o lugar
  // de cada jogador (o oficial; sem ele, pelo total com empates).
  const idx = prev.map((e) => {
    const maxFull = Math.max(0, ...e.players.map((p) => p.fullRounds));
    const lugares = editionPlaces(e);
    const cell = (p: PastEditionPlayer): RepeaterCell =>
      ({ pos: lugares.get(p) ?? null, total: p.total, toPar: p.toPar, complete: p.fullRounds >= maxFull, field: e.players.length });
    return { e, cell, quem: indexPlayers(e.players, (p) => p.fed, (p) => p.name), manuel: findManuelNaProva(e.players) ?? null };
  });

  const seen = new Set<string>();
  const rows: RepeaterRow[] = [];
  for (const fp of field) {
    const key = playerKey(fp.fed, fp.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const byEd: Record<string, RepeaterCell> = {};
    let ahead = 0, behind = 0;
    for (const { e, cell, quem, manuel } of idx) {
      const p = quem.get(fp.fed, fp.name);
      if (!p) continue;
      const c = cell(p);
      byEd[e.id] = c;
      const mc = manuel && manuel !== p ? cell(manuel) : null;
      if (mc && mc.complete && c.complete && mc.pos != null && c.pos != null && mc.pos !== c.pos) {
        if (mc.pos < c.pos) ahead++; else behind++;
      }
    }
    const cells = Object.values(byEd);
    if (!cells.length) continue;
    const done = cells.filter((c) => c.complete);
    const pos = done.map((c) => c.pos).filter((v): v is number => v != null);
    const tp = done.map((c) => c.toPar).filter((v): v is number => v != null);
    const isM = fieldIsManuel(fp);
    rows.push({
      key, name: fp.name, club: fp.club ?? null, isManuel: isM, byEd,
      n: cells.length,
      bestPos: pos.length ? Math.min(...pos) : null,
      avgToPar: tp.length ? Math.round((tp.reduce((s, v) => s + v, 0) / tp.length) * 10) / 10 : null,
      vsManuel: !isM && ahead + behind > 0 ? [ahead, behind] : null,
    });
  }
  // Mais edições primeiro; depois o melhor lugar (sem lugar no fim) e o nome.
  rows.sort((a, b) => (b.n - a.n)
    || (a.bestPos == null ? (b.bestPos == null ? 0 : 1) : b.bestPos == null ? -1 : a.bestPos - b.bestPos)
    || a.name.localeCompare(b.name));
  return { rows, editions: prev, fieldSize: seen.size };
}
