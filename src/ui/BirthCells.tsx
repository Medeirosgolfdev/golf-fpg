/**
 * src/ui/BirthCells.tsx — células «Nasc.» e «Idade» iguais em todas as tabelas
 * de torneio (Draw, Inscrições, Scorecard). 16/10/2026: no Faldo Madeira o Draw
 * mostrava as estimativas a vermelho e a data completa em pílula, e a tabela da
 * R1 mostrava só o ano, sem estimativas.
 *
 * Valor lido → pílula com a cor do escalão à data da prova (BirthPill, 02/11/2026).
 * Estimativa → itálico vermelho (.est-value), com a nota no tooltip.
 */
import type { ReactNode } from "react";
import BirthPill from "./BirthPill";
import { ageAtDate, anoEscalao, dateParts, escalaoAtDate, fmtDatePt } from "../utils/format";
import { MUTED } from "./tableCells";

export interface BirthInfo {
  /** Data de nascimento ISO (ou só o ano em `birthYear`). */
  dob?: string | null;
  birthYear?: number | null;
  /** Estimativa: ano mais antigo possível; `birthYearEstMax` o mais recente (null = em aberto). */
  birthYearEst?: number | null;
  birthYearEstMax?: number | null;
  estNote?: string | null;
  /** Mostrar a data completa (só quando é a própria prova que a publica — senão
   *  só o ano, como no Resumo e nas Inscrições da FPG). Default: true. */
  showDate?: boolean;
}

/** Nasc. e Idade (ReactNode) + tooltip, à data `refDate` (ISO). */
export function birthCells(b: BirthInfo, refDate?: string | null): { nasc: ReactNode; idade: ReactNode; tip: string } {
  // «AAAA-MM-DD» ou «DD/MM/AAAA» → ISO; só o ano («2014») conta como ano solto.
  const dp = dateParts(b.dob ? String(b.dob) : null);
  const dob = dp ? `${dp.y}-${String(dp.m).padStart(2, "0")}-${String(dp.d).padStart(2, "0")}` : null;
  const soAno = !dp && /^\d{4}$/.test(String(b.dob ?? "").trim()) ? +String(b.dob).trim() : null;
  const dobYear = dp ? dp.y : (b.birthYear ?? soAno);
  const y = Number(String(refDate || "").slice(0, 4)) || null;
  const age = dob ? ageAtDate(dob, refDate || undefined) : dobYear != null && y ? y - dobYear : null;
  const lo = b.birthYearEst ?? null;
  const hi = b.birthYearEstMax;
  const est = dobYear == null && lo != null;
  const estYear = !est ? null : hi === null ? `≥${lo}` : hi != null && hi > lo! ? `${lo}–${String(hi).slice(2)}` : `${lo}`;
  const estAge = !est || !y ? null : hi === null ? `≤${y - lo!}` : hi != null && hi > lo! ? `~${y - hi}–${y - lo!}` : `~${y - lo!}`;
  const tip = dob ? `${dob} (${age ?? "?"} anos à data)` : est ? `Estimativa — ${b.estNote || "ano deduzido, não lido"}` : "";
  const shown = b.showDate !== false && dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? fmtDatePt(dob) : dobYear;
  // Ano e idade lidos pintam-se com a cor do escalão (pelo ano, como a FPG);
  // as estimativas ficam a vermelho, como sempre.
  const pill = pillDoAno(dobYear, refDate);
  return {
    nasc: dobYear != null ? <BirthPill {...pill}>{shown}</BirthPill>
      : est ? <span className="est-value">{estYear}</span> : MUTED,
    idade: age != null ? <BirthPill {...pill}>{!dob ? "~" : ""}{age}a</BirthPill>
      : estAge ? <span className="est-value">{estAge}a</span> : MUTED,
    tip,
  };
}

/** Valor para ORDENAR pelo nascimento (ms): a data completa quando há; senão o
 *  ano (lido ou estimado) a meio do ano — as estimativas ordenam-se junto das
 *  datas reais. null = sem data nem ano. */
export function birthSortValue(dob: string | null | undefined, ano?: number | null): number | null {
  const dp = dateParts(dob ? String(dob) : null);
  if (dp) return Date.UTC(dp.y, dp.m - 1, dp.d);
  const soAno = /^\d{4}$/.test(String(dob ?? "").trim()) ? +String(dob).trim() : null;
  const y = ano ?? soAno;
  return y != null ? Date.UTC(y, 6, 1) : null;
}

/** Comparador das colunas «Nasc.» e «Idade» (10/11/2026: partilhavam a chave e
 *  «Idade ▲» punha os mais velhos primeiro). «Nasc. ▲» = nascido há mais tempo
 *  primeiro; «Idade ▲» = o mais novo primeiro (a data ao contrário). Sem data
 *  nem ano → sempre no fim, nas duas direcções. `dir` = 1 (asc) ou -1 (desc). */
export function compareBirth(coluna: "nasc" | "idade", a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null || b == null) return a == null && b == null ? 0 : a == null ? 1 : -1;
  return (a - b) * (coluna === "idade" ? -dir : dir);
}

/** Escalão de quem nasceu em `ano`, à data `refDate` (pelo ano civil, como a
 *  FPG — `escalaoAtDate`): a cor da pílula de nascimento/idade. */
export function escDoAno(ano: number | null | undefined, refDate?: string | null): string | null {
  return ano != null && refDate ? escalaoAtDate(`${ano}-01-01`, refDate) : null;
}

/** Cor da pílula de nascimento/idade de quem nasceu em `ano`: o escalão à data
 *  e se é o 1.º ano dele (claro com contorno; o 2.º ano fica cheio — a regra do
 *  AnoEscalaoPill). Só os Sub N têm dois anos. */
export function pillDoAno(ano: number | null | undefined, refDate?: string | null): { esc: string | null; ano1: boolean } {
  const esc = escDoAno(ano, refDate);
  return { esc, ano1: !!esc && /^Sub/i.test(esc) && anoEscalao(`${ano}`, esc, refDate) === "1A" };
}

/** Os campos de nascimento além da data (ano solto, estimativa e nota) de um
 *  jogador, para passar a uma linha de tabela sem os perder. */
export function birthFieldsOf(p: object): Pick<BirthInfo, "birthYear" | "birthYearEst" | "birthYearEstMax" | "estNote"> {
  const x = p as BirthInfo;
  return {
    ...(x.birthYear != null ? { birthYear: x.birthYear } : {}),
    ...(x.birthYearEst != null
      ? { birthYearEst: x.birthYearEst, ...("birthYearEstMax" in x ? { birthYearEstMax: x.birthYearEstMax } : {}), estNote: x.estNote ?? null }
      : {}),
  };
}
