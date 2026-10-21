/**
 * text.ts — Normalização de nomes e datas das fontes de Espanha.
 *
 * Tirado da RFEGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */

/** Normaliza nome/texto ES para matching: NFKD, sem diacríticos, vírgulas/pontos → espaço.
 *  ⚠ Diferente do `norm` partilhado (format.ts), que tira apóstrofos em vez de vírgulas. */
export const normEs = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();

/* ── Helpers ───────────────────────────────────────────── */

/** Converte uma data "DD/MM/YYYY" (formato das fontes España) para ISO
 *  "YYYY-MM-DD". Deixa passar valores já-ISO e devolve null se não reconhecer.
 *  O AdmissionsTab partilhado — e os utils `ageAtDate`/`escalaoAtDate` que ele usa —
 *  assumem dob/datas em ISO (a federados.json FPG é ISO). Sem esta conversão,
 *  `parseInt(dob.slice(0,4))` lia o DIA ("01/02/2016" → 1) e `new Date(dob)`
 *  ficava Invalid (idade "? anos"). */
export function esDateToIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t : null;
}
