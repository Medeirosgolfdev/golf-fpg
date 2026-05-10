/**
 * tournamentClassification.ts — Funções puras para classificar torneios em
 * categorias (Jovem, PJA, Santo da Serra) por nome ou código.
 *
 * Reusável por qualquer página que mostre torneios FPG (FPGPage, DrivePage,
 * BJGTPage, KIDSPage, NacionaisJovensPage). Mantém a lógica fora dos
 * componentes para que futuros ajustes (e.g. apanhar mais variantes de nome)
 * sejam feitos num único sítio.
 */
import type { Tournament } from "../data/fpgTypes";
import type { TournPill } from "../pages/fpg/constants";
import { SSERRA_CCODE } from "../ui/TournSidebarItem";

/** Remove diacríticos (acentos, til, cedilha) — usado antes de matching de
 *  regex que não conhece variantes acentuadas (ex: "Júnior" → "Junior"). */
export function stripAcc(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Regex para detectar torneios juvenis pelo NOME:
 *   - "junior" / "juniors"  (Junior Open, GJG Portuguese Juniors)
 *   - "júnior" (Taça Yeatman Júnior — usar com stripAcc primeiro)
 *   - "subN"   (sub10, sub-14, sub 14, ...)
 *   - "UN"     (U10, U12, U14, U16, U18, U21 — categorias internacionais)
 *
 *  Nota: deve ser combinado com stripAcc(name) para apanhar "Júnior" e
 *  variantes acentuadas. Excepções (PJA, Greatgolf Junior) devem ser
 *  filtradas separadamente porque vão para outros tabs.
 */
export const JOVEM_NAME_RE = /\b(juniors?|sub[\s-]?\d{1,2}|u\d{1,2})\b/i;

/** True se o NOME do torneio contém um padrão juvenil. */
export function isJovemByName(name: string | undefined | null): boolean {
  if (!name) return false;
  return JOVEM_NAME_RE.test(stripAcc(name));
}

/** True se o torneio é do CGSS Santo da Serra (ccode === "007"). */
export function isSantoDaSerra(t: Tournament): boolean {
  return t.ccode === SSERRA_CCODE;
}

/** Classifica se um torneio pertence ao circuito PJA pelo nome / tcode / flags.
 *  Combina:
 *   - Override manual (`_manual: true` + `_origin: "PJA"`)
 *   - "PJA" no nome
 *   - tcode em TOURN_PILLS com valor "PJA"
 *   - (≥ 2026) Greatgolf Junior, Drive Tour (sem Challenge), Circuito Aquapor
 *
 *  Excepção: torneios Santo da Serra (ccode=007) nunca contam como PJA.
 */
export function isPJA(
  t: Tournament,
  tournPills: Record<string, TournPill> = {},
): boolean {
  if ((t as any)._manual && (t as any)._origin === "PJA") return true;
  if (isSantoDaSerra(t)) return false;
  const year = (t.date || "").slice(0, 4);
  const name = t.name || "";
  if (/PJA/i.test(name)) return true;
  const tcodes = t.tcode?.split("+") || [];
  if (tcodes.some(tc => tournPills[tc] === "PJA")) return true;
  if (year >= "2026") {
    if (/greatgolf.*junior/i.test(name)) return true;
    if (/Drive\s+Tour/i.test(name) && !/Challenge/i.test(name)) return true;
    if (/Circuito\s+Aquapor/i.test(name)) return true;
  }
  return false;
}

/** True se o torneio deve aparecer no tab "Jovens". Combina:
 *   - Padrão juvenil no nome (junior, subN, UN, ...)
 *   - MAS NÃO PJA / Greatgolf Junior (esses vão para o tab PJA)
 *
 *  Não substitui a inclusão directa via `jovens_YYYY.json` — apenas detecta
 *  os torneios que devem subir do `tournaments` array para o tab Jovens.
 */
export function isJovemForTab(t: Tournament): boolean {
  const name = t.name || "";
  if (!isJovemByName(name)) return false;
  if (/PJA/i.test(name)) return false;                // já em tab PJA
  if (/greatgolf.*junior/i.test(name)) return false;  // já em tab PJA (excepção)
  return true;
}
