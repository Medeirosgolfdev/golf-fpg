/**
 * src/utils/mesAno.ts — datas escritas «Fev 2025» (as das tabelas fixas de
 * torneios) em forma que ORDENA (10/11/2026).
 *
 * Ordenar «Fev 2025», «Ago 2025», «Dez 2025» como texto dá ordem alfabética, e
 * ao lado de datas ISO («2025-08-17») não se comparam. Havia a mesma conta na
 * Tabela global e a falta dela na ficha do jogador da análise BJGT.
 */
import { MONTHS_PT } from "./format";

/** «Fev 2025» → «2025-02»; uma data ISO passa como veio; o resto também (não se adivinha). */
export function isoDeMesAno(s: string | null | undefined): string {
  const t = String(s ?? "").trim();
  const m = /^([A-Za-zçÇ]{3})\.?\s+(\d{4})$/.exec(t);
  const i = m ? MONTHS_PT.findIndex((x) => x.toLowerCase() === m[1].toLowerCase()) : -1;
  return m && i >= 0 ? `${m[2]}-${String(i + 1).padStart(2, "0")}` : t;
}
