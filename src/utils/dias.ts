/**
 * src/utils/dias.ts — contas com dias do calendário em «AAAA-MM-DD» (10/11/2026).
 * Sem horas nem fusos: cada data é lida como dia civil (meio-dia UTC), por isso
 * não escorrega um dia com o relógio de outro país. «Hoje» vem do `todayIso()`.
 */

/** Dia civil de uma data ISO («2026-09-12» ou «2026-09-12T…») em ms UTC; null se não é data. */
function diaUtc(iso: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], 12);
  return Number.isNaN(t) ? null : t;
}

/** «AAAA-MM-DD» a partir de ISO (com ou sem horas) ou DD/MM/AAAA — as datas dos
 *  torneios da FPG. Outra coisa → null. */
export function diaIso(s: string | null | undefined): string | null {
  const v = String(s ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v);
  return dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : null;
}

/** `iso` + n dias(«2026-12-30» + 3 → «2027-01-02»). Data ilegível → devolve-a como veio. */
export function addDaysIso(iso: string, n: number): string {
  const t = diaUtc(iso);
  return t == null ? iso : new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/** Dias do calendário de `de` até `ate` (negativo se `ate` é antes); null se
 *  alguma das duas não é uma data ISO. */
export function diasEntre(de: string | null | undefined, ate: string | null | undefined): number | null {
  const a = diaUtc(de), b = diaUtc(ate);
  return a == null || b == null ? null : Math.round((b - a) / 86_400_000);
}
