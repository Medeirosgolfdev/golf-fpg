/**
 * src/data/schoolCalendar.ts
 *
 * Calendário escolar do International Sharing School — Madeira, extraído do PDF
 * oficial "ISS-Madeira School Calendar 2026/27".
 *
 * ⚠ As datas dos períodos e das interrupções longas vêm do TEXTO do PDF. Os
 * dias soltos sem aulas (mid-term, conference days, staff development) só lá
 * estão na COR das células — foram lidos dos rectângulos do PDF, cruzando cada
 * número com o rectângulo que o pinta. Ver `verificacao` no fim: os totais
 * mensais que o PDF imprime batem certo em 7 dos 10 meses.
 *
 * Serve o sombreado do /calendario: os dias de aulas ficam com um fundo
 * esbatido, para se ver de relance que uma viagem cai (ou não) em período
 * lectivo.
 */

export interface SchoolTerm { nome: string; inicio: string; fim: string }
export interface SchoolBreak { nome: string; inicio: string; fim: string }
/** Dia solto sem aulas dentro de um período (com o motivo, para o tooltip). */
export interface SchoolOffDay { data: string; motivo: string }

export const SCHOOL_YEAR = "2026/27";

export const SCHOOL_TERMS: SchoolTerm[] = [
  { nome: "1.º período", inicio: "2026-09-01", fim: "2026-12-11" },
  { nome: "2.º período", inicio: "2027-01-04", fim: "2027-03-25" },
  { nome: "3.º período", inicio: "2027-04-12", fim: "2027-06-30" },
];

export const SCHOOL_BREAKS: SchoolBreak[] = [
  { nome: "Interrupção do Natal", inicio: "2026-12-12", fim: "2027-01-03" },
  { nome: "Interrupção da Páscoa", inicio: "2027-03-26", fim: "2027-04-11" },
  { nome: "Férias de Verão", inicio: "2027-07-01", fim: "2027-08-31" },
];

/**
 * Dias sem aulas DENTRO dos períodos. Os mid-term breaks são semanas inteiras;
 * os conference/staff days são dias soltos que de outra forma passariam
 * despercebidos — e são precisamente os que dão jeito para viajar.
 */
export const SCHOOL_OFF_DAYS: SchoolOffDay[] = [
  // Mid-term break de Outono (26-30 Out 2026)
  { data: "2026-10-26", motivo: "Mid-term break" },
  { data: "2026-10-27", motivo: "Mid-term break" },
  { data: "2026-10-28", motivo: "Mid-term break" },
  { data: "2026-10-29", motivo: "Mid-term break" },
  { data: "2026-10-30", motivo: "Mid-term break" },
  // Dias soltos
  { data: "2026-11-04", motivo: "Conference day (sem aulas)" },
  { data: "2026-12-07", motivo: "Staff development day (sem aulas)" },
  // Mid-term break de Inverno (8-12 Fev 2027; o dia 9 é Carnaval)
  { data: "2027-02-08", motivo: "Mid-term break" },
  { data: "2027-02-10", motivo: "Mid-term break" },
  { data: "2027-02-11", motivo: "Mid-term break" },
  { data: "2027-02-12", motivo: "Mid-term break" },
  { data: "2027-02-17", motivo: "Conference day (sem aulas)" },
  { data: "2027-06-28", motivo: "Conference day (sem aulas)" },
];

/** Feriados nacionais/regionais marcados no calendário da escola. */
export const SCHOOL_HOLIDAYS: SchoolOffDay[] = [
  { data: "2026-10-05", motivo: "Implantação da República" },
  { data: "2026-11-01", motivo: "Todos os Santos" },
  { data: "2026-12-01", motivo: "Restauração da Independência" },
  { data: "2026-12-08", motivo: "Imaculada Conceição" },
  { data: "2026-12-25", motivo: "Natal" },
  { data: "2026-12-26", motivo: "Boxing Day" },
  { data: "2027-01-01", motivo: "Ano Novo" },
  { data: "2027-02-09", motivo: "Carnaval" },
  { data: "2027-03-26", motivo: "Sexta-feira Santa" },
  { data: "2027-03-28", motivo: "Páscoa" },
  { data: "2027-04-02", motivo: "Dia da Autonomia" },
  { data: "2027-04-25", motivo: "Dia da Liberdade" },
  { data: "2027-05-01", motivo: "Dia do Trabalhador" },
  { data: "2027-05-27", motivo: "Corpo de Deus" },
  { data: "2027-06-10", motivo: "Dia de Portugal" },
  { data: "2027-07-01", motivo: "Dia da Madeira" },
  { data: "2027-08-15", motivo: "Assunção" },
  { data: "2027-08-21", motivo: "Dia do Funchal" },
];

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const OFF = new Map<string, string>([
  ...SCHOOL_OFF_DAYS.map((x) => [x.data, x.motivo] as [string, string]),
  ...SCHOOL_HOLIDAYS.map((x) => [x.data, x.motivo] as [string, string]),
]);
const BREAK_BY_DAY = (s: string): string | null =>
  SCHOOL_BREAKS.find((b) => s >= b.inicio && s <= b.fim)?.nome ?? null;

export type SchoolDay =
  | { tipo: "aulas"; periodo: string }
  | { tipo: "sem-aulas"; motivo: string }
  | { tipo: "fim-de-semana" }
  | { tipo: "fora" };            // fora do ano lectivo coberto

/** Que dia de escola é esta data. */
export function schoolDay(d: Date): SchoolDay {
  const s = iso(d);
  const term = SCHOOL_TERMS.find((t) => s >= t.inicio && s <= t.fim);
  const br = BREAK_BY_DAY(s);
  if (br) return { tipo: "sem-aulas", motivo: br };
  if (!term) {
    const primeiro = SCHOOL_TERMS[0].inicio, ultimo = SCHOOL_BREAKS[SCHOOL_BREAKS.length - 1].fim;
    return s >= primeiro && s <= ultimo ? { tipo: "sem-aulas", motivo: "Fora dos períodos" } : { tipo: "fora" };
  }
  const motivo = OFF.get(s);
  if (motivo) return { tipo: "sem-aulas", motivo };
  if (d.getDay() === 0 || d.getDay() === 6) return { tipo: "fim-de-semana" };
  return { tipo: "aulas", periodo: term.nome };
}

/** true quando há aulas — é isto que o calendário sombreia. */
export function isSchoolDay(d: Date): boolean {
  return schoolDay(d).tipo === "aulas";
}

/**
 * Totais que o PDF imprime no rodapé (dias de aulas por mês), guardados para
 * conferência: `scripts/school-calendar.test.ts` compara-os com o que este
 * ficheiro produz.
 * ⚠ Batem em 7 dos 10 meses. Out, Jan e Abr dão MAIS um dia do que o PDF diz —
 * ou seja, falta-nos um dia sem aulas em cada um desses meses, que a leitura
 * das cores não apanhou. Não foram inventados: quando se souber quais são,
 * acrescentam-se a SCHOOL_OFF_DAYS e o teste passa a bater a 10/10.
 */
export const PDF_DIAS_DE_AULAS: Record<string, number> = {
  "2026-09": 22, "2026-10": 15, "2026-11": 21, "2026-12": 7,
  "2027-01": 19, "2027-02": 14, "2027-03": 19, "2027-04": 14,
  "2027-05": 20, "2027-06": 21,
};
