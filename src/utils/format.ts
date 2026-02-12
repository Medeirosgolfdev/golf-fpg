const ptFmt = new Intl.NumberFormat("pt-PT");

/** Formata número ou "—" */
export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return ptFmt.format(n);
}

/** Formata CR com 1 decimal e vírgula PT */
export function fmtCR(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
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

/** Title case simples */
export function titleCase(s: string): string {
  const x = (s ?? "").trim();
  if (!x) return x;
  return x[0].toUpperCase() + x.slice(1).toLowerCase();
}

/** Soma um range de valores com getter */
export function sumRange(from: number, to: number, getVal: (i: number) => number | null): number | null {
  let sum = 0;
  let any = false;
  for (let i = from; i <= to; i++) {
    const v = getVal(i);
    if (v !== null && v !== undefined) {
      sum += v;
      any = true;
    }
  }
  return any ? sum : null;
}
