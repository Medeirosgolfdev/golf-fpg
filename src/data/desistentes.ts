/**
 * Quem se desinscreve fica na lista de inscrições, marcado.
 *
 * A página de inscrições da FPG só mostra quem está inscrito AGORA: quem se
 * desinscreve desaparece. Ao trocar a lista guardada (ou a do último scrape)
 * pela nova, os que saíram voltam a entrar com `status: "desistente"` e
 * `desinscritoEm` (o dia em que se deu pela saída, «YYYY-MM-DD» em Lisboa).
 * Pedido da Mariana a 02/11/2026: na final Drive, quem saía voltava a aparecer
 * como «por inscrever», como se nunca se tivesse inscrito.
 *
 * Um só sítio para a regra: o site (TournamentDetail, lista live), o scraper
 * (scripts/lib/desistentes.cjs) e o servidor local (vite.config.ts). Por isso
 * este ficheiro só tem tipos — nada de `enum`/`namespace` nem imports do `src`
 * (o Node corre-o directamente).
 */

export interface InscritoBase {
  fed?: string | null;
  nome?: string;
  status?: string;
  pos?: number | null;
  desinscritoEm?: string | null;
}

const keyOf = (p: InscritoBase): string =>
  p.fed ? String(p.fed) : String(p.nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function hojeLisboa(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Lisbon" }).format(d);
}

/**
 * Junta à lista nova quem estava na anterior e já não está, como desistente.
 * Devolve null quando saem demasiados de uma vez (> 3 e > 30% dos inscritos):
 * é mais provável uma fonte parcial do que uma debandada — não se marca ninguém.
 */
export function juntarDesistentes<P extends InscritoBase>(
  anteriores: P[] | null | undefined,
  novos: P[] | null | undefined,
  { hoje = hojeLisboa() }: { hoje?: string } = {},
): { players: P[]; saidas: P[] } | null {
  const prev = anteriores ?? [];
  const cur = novos ?? [];
  const naLista = new Set(cur.map(keyOf));
  const activos = prev.filter(p => p.status !== "desistente");
  const saidas = activos.filter(p => !naLista.has(keyOf(p)));
  if (saidas.length > 3 && saidas.length > activos.length * 0.3) return null;
  const jaSairam = prev.filter(p => p.status === "desistente" && !naLista.has(keyOf(p)));
  const marcados = [
    ...jaSairam,
    ...saidas.map(p => ({ ...p, status: "desistente", desinscritoEm: hoje })),
  ].map(p => ({ ...p, pos: null }));
  return { players: [...cur, ...marcados], saidas };
}
