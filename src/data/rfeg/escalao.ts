/**
 * escalao.ts — Escalão RFEG (Benjamín, Alevín, Infantil…) e Sub-N a partir da
 * idade ou da categoria da fonte.
 *
 * Tirado da RFEGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import { SUB_TO_ES_TERM } from "../../ui/PillBadge";

/* ── Helpers de conversão idade → Sub-N (escalão FPG/RFEG) ──────
 * Todos os adapters (LGS/NC/RFEGolf) usam isto para preencher
 * player.escalao com "Sub-N" → renderiza como pill colorido (EscPill). */
export function ageToSubN(age: number | null): string | null {
  if (age == null || age < 0) return null;
  if (age <= 10) return "Sub-10";
  if (age <= 12) return "Sub-12";
  if (age <= 14) return "Sub-14";
  if (age <= 16) return "Sub-16";
  if (age <= 18) return "Sub-18";
  if (age <= 21) return "Sub-21";
  if (age <= 25) return "Sub-25";
  return null;
}
/** Termo oficial RFEG para o escalão. Sub-12 → "Alevín", etc. */
export function ageToEscalaoEs(age: number | null): string | null {
  const subN = ageToSubN(age);
  if (!subN) return null;
  return SUB_TO_ES_TERM[subN] || subN;
}

/** Variantes de caixa/acento dos termos RFEG → forma canónica (a fonte traz
 *  "Alevín" e "ALEVIN" misturados; sem isto a UI mostrava as duas grafias). */
export const ES_TERM_CANON: Record<string, string> = {
  benjamin: "Benjamín", alevin: "Alevín", infantil: "Infantil",
  cadete: "Cadete", junior: "Junior", juvenil: "Juvenil", absoluto: "Absoluto",
};
export function canonEscaloEs(s: string | null | undefined): string | null {
  if (!s) return null;
  const k = s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s-]/g, "");
  return ES_TERM_CANON[k] || s.trim();
}
/** Extrai o ano (4 dígitos) de uma data "DD/MM/YYYY" ou ISO "YYYY-MM-DD". */
export function yearOf(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /(\d{4})/.exec(s);
  return m ? parseInt(m[1], 10) : null;
}
/** Escalão RFEG canónico de um jogador.
 *  1) idade-no-ano = anoTorneio − anoNascimento (NÃO a idade exacta à data do
 *     torneio — senão o mesmo ano de nascimento parte-se em duas categorias
 *     consoante o aniversário caia antes/depois do torneio: ex. dois nascidos
 *     em 2015 apareciam como Alevín e Benjamín no mesmo campeonato).
 *  2) Fallback: categoria da fonte (catEdad/nivel), normalizada.
 *
 *  ⚠ A ordem já foi a inversa ("a categoria da fonte é oficial, logo manda").
 *  Não manda: o `catEdad` do `licencia-dob-lookup` é um RETRATO da última prova
 *  em que vimos o jogador, que pode ser de há anos — e o escalão muda todos os
 *  anos. Num torneio de 2026 apareciam "Infantil" e "Alevín" em miúdos nascidos
 *  em 2008-2010 (Sub-18/Sub-16), porque a categoria guardada era de 2021-2024.
 *  Com DOB, a idade-no-ano é a verdade e a categoria da fonte não acrescenta
 *  nada; sem DOB, é tudo o que temos. */
export function escaloEsForPlayer(
  catEdad: string | null | undefined,
  dob: string | null | undefined,
  ref: string | null | undefined,
): string | null {
  const by = yearOf(dob), ty = yearOf(ref);
  if (by != null && ty != null) {
    const calc = ageToEscalaoEs(ty - by);
    if (calc) return calc;
  }
  return canonEscaloEs(catEdad);
}
