/**
 * entryState.ts — O que a sidebar e os filtros do CircuitShell sabem de uma
 * entrada: Manuel, portugueses e hole-in-one. Vem dos metadados da entrada
 * (`hasManuel`/`hasPt`/`hasAce`) ou, nas entradas eager, das divisões.
 *
 * Fora do CircuitShell (21/10/2026) para o índice da /ffg, gerado no build
 * (`scripts/build-ffg-list-index.js`), calcular os metadados com as MESMAS
 * regras com que o shell os calcularia a partir das divisões.
 */
import { isManuelByName } from "../../constants/manuel";
import { tournamentAces } from "../../utils/aces";
import type { Player as FPGPlayer } from "../../data/fpgTypes";
import type { CircuitDivision, CircuitEntry } from "./types";

/** Português? via flag do adaptador (_isPortuguese) ou nome do Manuel. */
function isPt(p: FPGPlayer): boolean {
  return !!p._isPortuguese || isManuelByName(p.name);
}

/** Divisões: o Manuel jogou alguma? */
export function divisionsHaveManuel(divs: CircuitDivision[]): boolean {
  return divs.some(d => !!d.results?.players.some(p => isManuelByName(p.name)));
}
/** Divisões: há portugueses? */
export function divisionsHavePt(divs: CircuitDivision[]): boolean {
  return divs.some(d => !!d.results?.players.some(p => isPt(p)));
}
/** Divisões: houve hole-in-one? */
export function divisionsHaveAce(divs: CircuitDivision[]): boolean {
  return divs.some(d => !!d.results && tournamentAces(d.results.players).length > 0);
}

/**
 * Uma entrada EAGER (com `divisions`) reduzida aos metadados com que a sidebar
 * e os filtros do shell mostram exactamente o mesmo sem as divisões — para
 * índices gerados no build (a página passa a entrada com `loadDivisions`).
 * Lança se a entrada tiver divisões que os metadados não conseguem representar
 * (escalões/sexos que só as divisões trazem).
 */
export function entryListMeta(e: CircuitEntry): Omit<CircuitEntry, "divisions" | "loadDivisions"> {
  const { divisions = [], loadDivisions: _lazy, ...meta } = e;
  const nR = Math.max(0, ...divisions.map(d => d.results?.rounds ?? 0));
  const out: Omit<CircuitEntry, "divisions" | "loadDivisions"> = {
    ...meta,
    hasManuel: meta.hasManuel ?? divisionsHaveManuel(divisions),
    hasPt: meta.hasPt ?? divisionsHavePt(divisions),
    hasAce: meta.hasAce ?? divisionsHaveAce(divisions),
    escalao: meta.escalao ?? divisions[0]?.escalao,
    sex: meta.sex ?? divisions[0]?.sex,
    roundsCount: meta.roundsCount ?? (nR || undefined),
    divisionCount: meta.divisionCount ?? divisions.length,
  };
  if (out.playerCount == null) out.playerCount = divisions.reduce((a, d) => a + (d.results?.players.length ?? 0), 0);
  // Filtros de escalão/sexo: o shell também procura nas divisões — os
  // metadados têm de cobrir o que elas trazem, e o dropdown tem de ser o mesmo.
  const esc = out.escaloes ?? [];
  for (const d of divisions) {
    if (out.escalao !== d.escalao && !esc.includes(d.escalao)) throw new Error(`${e.id}: escalão «${d.escalao}» só existe nas divisões`);
    if (d.sex && out.sex !== "Mixed" && out.sex !== d.sex) throw new Error(`${e.id}: sexo «${d.sex}» só existe nas divisões`);
  }
  if (!esc.length && divisions.some(d => d.escalao !== out.escalao)) throw new Error(`${e.id}: escalões das divisões ≠ \`escalao\` e sem \`escaloes\``);
  // ★ da sidebar só com `hasManuel` explícito; o filtro também lê as divisões.
  if (meta.hasManuel == null && out.hasManuel) throw new Error(`${e.id}: o Manuel está nas divisões mas a entrada não tem \`hasManuel\``);
  return out;
}

/** O Manuel jogou neste torneio? metadata (`hasManuel`) ou divisões eager.
 *  `undefined` = desconhecido (lazy sem metadata) → não filtra (mantém visível). */
export function entryManuelState(e: CircuitEntry): boolean | undefined {
  if (e.hasManuel != null) return e.hasManuel;
  if (e.divisions) return divisionsHaveManuel(e.divisions);
  return undefined;
}
/** Há portugueses neste torneio? metadata (`hasPt`) ou divisões eager. */
export function entryPtState(e: CircuitEntry): boolean | undefined {
  if (e.hasPt != null) return e.hasPt;
  if (e.divisions) return divisionsHavePt(e.divisions);
  return undefined;
}
/** Houve hole-in-one neste torneio? metadata (`hasAce`) ou divisões eager
 *  (páginas lazy sem `hasAce` só mostram o marcador depois de abrir o torneio,
 *  nos tabs). */
export function entryHasAce(e: CircuitEntry): boolean {
  if (e.hasAce != null) return e.hasAce;
  if (!e.divisions) return false;
  return divisionsHaveAce(e.divisions);
}
