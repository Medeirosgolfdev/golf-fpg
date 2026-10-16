/**
 * src/ui/BirthCells.tsx — células «Nasc.» e «Idade» iguais em todas as tabelas
 * de torneio (Draw, Inscrições, Scorecard). 16/10/2026: no Faldo Madeira o Draw
 * mostrava as estimativas a vermelho e a data completa em pílula, e a tabela da
 * R1 mostrava só o ano, sem estimativas.
 *
 * Valor lido → pílula neutra (BirthPill). Estimativa → itálico vermelho
 * (.est-value), com a nota no tooltip.
 */
import type { ReactNode } from "react";
import BirthPill from "./BirthPill";
import { ageAtDate } from "../utils/format";

export interface BirthInfo {
  /** Data de nascimento ISO (ou só o ano em `birthYear`). */
  dob?: string | null;
  birthYear?: number | null;
  /** Estimativa: ano mais antigo possível; `birthYearEstMax` o mais recente (null = em aberto). */
  birthYearEst?: number | null;
  birthYearEstMax?: number | null;
  estNote?: string | null;
}

/** Nasc. e Idade (ReactNode) + tooltip, à data `refDate` (ISO). */
export function birthCells(b: BirthInfo, refDate?: string | null): { nasc: ReactNode; idade: ReactNode; tip: string } {
  const dob = b.dob ? String(b.dob).slice(0, 10) : null;
  const dobYear = dob ? parseInt(dob.slice(0, 4), 10) : (b.birthYear ?? null);
  const y = Number(String(refDate || "").slice(0, 4)) || null;
  const age = dob ? ageAtDate(dob, refDate || undefined) : dobYear != null && y ? y - dobYear : null;
  const lo = b.birthYearEst ?? null;
  const hi = b.birthYearEstMax;
  const est = dobYear == null && lo != null;
  const estYear = !est ? null : hi === null ? `≥${lo}` : hi != null && hi > lo! ? `${lo}–${String(hi).slice(2)}` : `${lo}`;
  const estAge = !est || !y ? null : hi === null ? `≤${y - lo!}` : hi != null && hi > lo! ? `~${y - hi}–${y - lo!}` : `~${y - lo!}`;
  const tip = dob ? `${dob} (${age ?? "?"} anos à data)` : est ? `Estimativa — ${b.estNote || "ano deduzido, não lido"}` : "";
  const shown = dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob.split("-").reverse().join("/") : dobYear;
  return {
    nasc: dobYear != null ? <BirthPill>{shown}</BirthPill>
      : est ? <span className="est-value">{estYear}</span> : <span className="muted">–</span>,
    idade: age != null ? <BirthPill>{!dob ? "~" : ""}{age}a</BirthPill>
      : estAge ? <span className="est-value">{estAge}a</span> : <span className="muted">–</span>,
    tip,
  };
}
