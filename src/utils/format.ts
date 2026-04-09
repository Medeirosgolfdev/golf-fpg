const ptFmt = new Intl.NumberFormat("pt-PT");

/** Formata número ou "—" */
export function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return ptFmt.format(n);
}

/** Formata CR com 1 decimal e vírgula PT */
export function fmtCR(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(1).replace(".", ",");
}

/** Normaliza texto para comparação */
export function norm(s: string): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Title case: capitaliza cada palavra */
export function titleCase(s: string): string {
  const x = (s ?? "").trim();
  if (!x) return x;
  return x.replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

/** Soma um range de valores com getter */
export function sumRange(from: number, to: number, getVal: (i: number) => number | null): number | null {
  let sum = 0;
  let any = false;
  for (let i = from; i <= to; i++) {
    const v = getVal(i);
    if (v != null) {
      sum += v;
      any = true;
    }
  }
  return any ? sum : null;
}

/** Data abreviada: "25-03-2024" → "25-03" */
export function shortDate(d: string): string {
  return (d || "").replace(/^(\d{2})-(\d{2})-\d{4}$/, "$1-$2");
}

/* ── Delta formatters (signed, fixed decimals) ── */

/** +1.5 / -2.3 / E (1 decimal) */
export function fD(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(1);
}

/** +1.50 / -2.30 (2 decimals) */
export function fD2(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(2);
}

/* ── Name helpers ── */

/** "Manuel Medeiros" → "Manuel" */
export function firstName(name: string): string {
  return (name || "").split(" ")[0];
}

/** "Manuel Henrique Medeiros" → "Manuel Henrique" */
export function shortName(name: string): string {
  return (name || "").split(" ").slice(0, 2).join(" ");
}

/** Meses abreviados em português */
export const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"] as const;

/** Normaliza uma string de data para ISO (YYYY-MM-DD).
 *  Aceita "YYYY-MM-DD" (passa), "MM/DD/YYYY" (US), "DD-MM-YYYY" */
export function isoDate(s: string): string {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parts = s.split("/");
  if (parts.length === 3 && parts[2].length === 4)
    return `${parts[2]}-${parts[0].padStart(2,"0")}-${parts[1].padStart(2,"0")}`;
  return s;
}

/** Formata data curta: "17/03" (dd/mm sem ano). Útil para colunas compactas. */
export function fmtDateShort(s: string): string {
  if (!s) return "";
  const [, m, day] = s.split("-");
  if (!m || !day) return s;
  return `${day}/${m}`;
}

/** Formata chave "YYYY-MM" → "Jan 2025". Aceita "?" e anos de 4 dígitos. */
export function monthLabel(key: string): string {
  if (!key || key === "?") return "Data desconhecida";
  if (key.length === 4) return key;
  const [yr, mo] = key.split("-");
  return `${MONTHS_PT[parseInt(mo) - 1] || mo} ${yr}`;
}

/** Formata chip de torneio: "21 field · 3R · Boys 10-11" */
export function fmtFieldInfo(fieldSize: number, nRounds: number, category: string): string {
  return `${fieldSize} field · ${nRounds}R · ${category}`;
}

/** Formata data para exibição: "17 mar. 2026"
 *  Aceita ISO, MM/DD/YYYY ou DD-MM-YYYY */
export function fmtDate(s: string): string {
  if (!s) return "";
  const iso = isoDate(s);
  if (!iso) return s;
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

/** Formata to-par: +5, -2, E */
export function fmtToPar(tp: number | null | undefined, placeholder = "—"): string {
  if (tp == null || !Number.isFinite(tp)) return placeholder;
  if (tp === 0) return "E";
  return tp > 0 ? `+${tp}` : `${tp}`;
}

/** Formata handicap: +2.3, -1.0, 0.0 */
export function fmtHcp(hcp: number | null | undefined, placeholder = "—"): string {
  if (hcp == null || !Number.isFinite(hcp)) return placeholder;
  const s = Math.abs(hcp).toFixed(1);
  return hcp < 0 ? `+${s}` : hcp > 0 ? s : `0.0`;
}

/** Formata Score Differential: +1.2, -3.5 */
export function fmtSD(sd: number | null | undefined, placeholder = "—"): string {
  if (sd == null || !Number.isFinite(sd)) return placeholder;
  return sd >= 0 ? `+${sd.toFixed(1)}` : sd.toFixed(1);
}

/** Número com sinal explícito: "+5", "0", "-3". Com decimais: fmtSign(1.5, 1) → "+1.5" */
export function fmtSign(n: number, decimals?: number): string {
  const s = decimals != null ? n.toFixed(decimals) : String(n);
  return n > 0 ? `+${s}` : s;
}

/** Número com sinal e parênteses: "(E)" / "(+3)" / "(-2)". Usado para subtotais F9/B9. */
export function fmtSignParen(n: number): string {
  if (n === 0) return "(E)";
  return n > 0 ? `(+${n})` : `(${n})`;
}
