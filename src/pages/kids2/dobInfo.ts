/**
 * kids2/dobInfo.ts
 *
 * Inferência de data de nascimento (DOB) adaptada ao schema canónico
 * (Junior + Tournament + Flight). Equivalente ao kids/dobInference.ts original
 * mas sem dependências de T_MAP/T/uskTournNames/hiddenTids — usa directamente
 * tournament.date + flight.ageMin/ageMax.
 *
 * 4 estados:
 *   • known     — junior.dob presente (formato ISO "YYYY-MM-DD")
 *   • range     — junior.dobRange presente (aggregator pré-calculou um range)
 *   • inferred  — calculado a partir dos torneios + escalões
 *   • unknown   — sem dados suficientes
 *
 * O estado "range" depende de o aggregator popular junior.dobRange (ver PR4.x
 * — actualmente 0% coverage em todas as fontes). Enquanto não estiver, esta
 * função degrada para "inferred" automaticamente.
 */

import type { Junior, Tournament } from "./data";

export type DobState = "known" | "range" | "inferred" | "unknown";

export interface DobInfo {
  state: DobState;
  /** ISO "YYYY-MM-DD" se known, ou data central do range/inferred. Pode ser null se unknown. */
  dobIso: string | null;
  /** Inicio do range possível (ISO). Igual a dobIso quando known. */
  rangeMin: string | null;
  /** Fim do range possível (ISO). Igual a dobIso quando known. */
  rangeMax: string | null;
  /** Idade actual em anos (calculada). Quando inferred usa midpoint. */
  age: number | null;
  /** Rótulo human-readable para o estado ("11 anos", "~11 anos", "10–11 anos", "?"). */
  ageLabel: string;
  /** Rótulo da DOB ou range ("29/04/2014", "Mar–Dez 2014", "2013–2014", "?"). */
  dobLabel: string;
  /** Dias para o próximo aniversário (só quando known + dentro de 90 dias). */
  nextBdayDays: number | null;
  /** Próxima idade após o aniversário (só quando known + countdown activo). */
  nextAge: number | null;
}

const MONTHS_PT_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ═══════════════════════════════════════════════════════════════════════
// Helpers de data
// ═══════════════════════════════════════════════════════════════════════

/** Parse ISO "YYYY-MM-DD" para Date local (12h para evitar DST issues). */
function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  return new Date(y, mo - 1, d, 12);
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Idade em anos completos de `dob` à data `at`. */
export function ageAt(dob: Date, at: Date): number {
  let age = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age--;
  return age;
}

/** Formata DOB ISO como "DD/MM/YYYY". */
export function fmtDobPt(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

// ═══════════════════════════════════════════════════════════════════════
// Constraints from canonical tournaments
// ═══════════════════════════════════════════════════════════════════════

interface Constraint {
  date: Date;
  ageMin: number;
  ageMax: number;
  tid: string;
}

/** Extrai constraints (data + range de idade) de cada torneio onde o junior participou. */
function collectConstraints(junior: Junior, tournamentById: Map<string, Tournament>): Constraint[] {
  const out: Constraint[] = [];
  for (const tid of junior.tournamentIds) {
    const t = tournamentById.get(tid);
    if (!t) continue;
    const dateIso = t.date || t.startDate;
    const date = parseIsoDate(dateIso);
    if (!date) continue;
    for (const f of t.flights) {
      const r = f.results.find((x) => x.juniorId === junior.id);
      if (!r) continue;
      const ageMin = typeof f.ageMin === "number" ? f.ageMin : null;
      const ageMax = typeof f.ageMax === "number" ? f.ageMax : null;
      if (ageMin == null && ageMax == null) continue;
      // Se só tem um, copia para o outro (ex: Boys 11 → ageMin=11, ageMax=11)
      const lo = ageMin ?? ageMax!;
      const hi = ageMax ?? ageMin!;
      // Sanity: ranges absurdos saltam-se
      if (lo < 5 || hi > 25 || lo > hi) continue;
      out.push({ date, ageMin: lo, ageMax: hi, tid });
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════

export function computeDobInfo(junior: Junior, tournamentById: Map<string, Tournament>): DobInfo {
  // ── Estado 1: known (junior.dob presente) ──────────────────────────────
  if (junior.dob) {
    const dob = parseIsoDate(junior.dob);
    if (dob) {
      const today = new Date();
      const age = ageAt(dob, today);
      // Próximo aniversário
      const nextBday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
      if (nextBday <= today) nextBday.setFullYear(nextBday.getFullYear() + 1);
      const days = Math.ceil((nextBday.getTime() - today.getTime()) / 86400000);
      const showCountdown = days <= 90;
      return {
        state: "known",
        dobIso: junior.dob,
        rangeMin: junior.dob,
        rangeMax: junior.dob,
        age,
        ageLabel: `${age} anos`,
        dobLabel: fmtDobPt(junior.dob),
        nextBdayDays: showCountdown ? days : null,
        nextAge: showCountdown ? age + 1 : null,
      };
    }
  }

  // ── Estado 2: range (junior.dobRange pré-calculado pelo aggregator) ───
  if (junior.dobRange?.lo && junior.dobRange?.hi) {
    const lo = parseIsoDate(junior.dobRange.lo);
    const hi = parseIsoDate(junior.dobRange.hi);
    if (lo && hi && lo <= hi) {
      const midMs = (lo.getTime() + hi.getTime()) / 2;
      const mid = new Date(midMs);
      const today = new Date();
      const age = ageAt(mid, today);
      return {
        state: "range",
        dobIso: toIso(mid),
        rangeMin: junior.dobRange.lo,
        rangeMax: junior.dobRange.hi,
        age,
        ageLabel: `~${age} anos`,
        dobLabel: fmtRange(lo, hi),
        nextBdayDays: null,
        nextAge: null,
      };
    }
  }

  // ── Estado 3: inferred (calcula a partir dos torneios) ─────────────────
  const constraints = collectConstraints(junior, tournamentById);
  if (constraints.length === 0) {
    return {
      state: "unknown",
      dobIso: null, rangeMin: null, rangeMax: null,
      age: null, ageLabel: "?", dobLabel: "?",
      nextBdayDays: null, nextAge: null,
    };
  }

  // Intersect all per-tournament DOB windows.
  // "Idade A na data D" → DOB ∈ (D − (A+1) anos + 1d, D − A anos]
  let rangeMin: Date | null = null;
  let rangeMax: Date | null = null;
  for (const c of constraints) {
    const latest = new Date(c.date);
    latest.setFullYear(latest.getFullYear() - c.ageMin);
    const earliest = new Date(c.date);
    earliest.setFullYear(earliest.getFullYear() - c.ageMax - 1);
    earliest.setDate(earliest.getDate() + 1);

    const newMin = (!rangeMin || earliest > rangeMin) ? earliest : rangeMin;
    const newMax = (!rangeMax || latest < rangeMax) ? latest : rangeMax;
    if (newMin <= newMax) {
      rangeMin = newMin;
      rangeMax = newMax;
    }
    // se conflitua, ignorar silenciosamente (fonte com erro de matching)
  }

  if (!rangeMin || !rangeMax || rangeMin > rangeMax) {
    return {
      state: "unknown",
      dobIso: null, rangeMin: null, rangeMax: null,
      age: null, ageLabel: "?", dobLabel: "?",
      nextBdayDays: null, nextAge: null,
    };
  }

  // Tighten with age-group transitions (step-ups consecutivos)
  const sorted = [...constraints].sort((a, b) => a.date.getTime() - b.date.getTime());
  for (let i = 0; i < sorted.length - 1; i++) {
    const c1 = sorted[i], c2 = sorted[i + 1];
    if (c2.ageMin - c1.ageMax === 1) {
      const transA = c1.ageMax + 1;
      const transLate = new Date(c2.date);
      transLate.setFullYear(transLate.getFullYear() - transA);
      const transEarly = new Date(c1.date);
      transEarly.setFullYear(transEarly.getFullYear() - transA);
      transEarly.setDate(transEarly.getDate() + 1);

      const tMin = transEarly > rangeMin ? transEarly : rangeMin;
      const tMax = transLate < rangeMax ? transLate : rangeMax;
      if (tMin <= tMax) { rangeMin = tMin; rangeMax = tMax; }
    }
  }

  const midMs = (rangeMin.getTime() + rangeMax.getTime()) / 2;
  const mid = new Date(midMs);
  const today = new Date();
  const age = ageAt(mid, today);
  return {
    state: "inferred",
    dobIso: toIso(mid),
    rangeMin: toIso(rangeMin),
    rangeMax: toIso(rangeMax),
    age,
    ageLabel: `~${age} anos`,
    dobLabel: fmtRange(rangeMin, rangeMax),
    nextBdayDays: null, nextAge: null,
  };
}

function fmtRange(lo: Date, hi: Date): string {
  const spanDays = Math.round((hi.getTime() - lo.getTime()) / 86400000);
  if (spanDays <= 1) {
    // essentially exact
    return `${String(lo.getDate()).padStart(2, "0")}/${String(lo.getMonth() + 1).padStart(2, "0")}/${lo.getFullYear()}`;
  }
  const minY = lo.getFullYear(), maxY = hi.getFullYear();
  const minM = lo.getMonth(), maxM = hi.getMonth();
  if (minY === maxY) {
    if (minM === maxM) return `${MONTHS_PT_SHORT[minM]} ${minY}`;
    return `${MONTHS_PT_SHORT[minM]}–${MONTHS_PT_SHORT[maxM]} ${minY}`;
  }
  // Cross-year — mostra meses se range é estreito
  if (spanDays < 400) return `${MONTHS_PT_SHORT[minM]} ${minY} – ${MONTHS_PT_SHORT[maxM]} ${maxY}`;
  return `${minY}–${maxY}`;
}

// ═══════════════════════════════════════════════════════════════════════
// Escalão internacional unificado (Sub-N)
// ═══════════════════════════════════════════════════════════════════════

const ageToSub = (a: number): string | null => {
  if (a <= 10) return "Sub-10";
  if (a <= 12) return "Sub-12";
  if (a <= 14) return "Sub-14";
  if (a <= 16) return "Sub-16";
  if (a <= 18) return "Sub-18";
  if (a <= 21) return "Sub-21";
  return null;
};

/** Deriva Sub-N (escalão internacional unificado) preferindo DOB exacta,
 *  caindo para DOB inferida, e finalmente categoria RFEG.
 *
 *  Convenção USKids/FPG: jogadores de N anos competem em Sub-N (Boys 12 = Sub-12).
 *
 *  Retorna null se idade desconhecida e sem catEdad RFEG. */
export function escalaoIntl(junior: Junior, tournamentById: Map<string, Tournament>): string | null {
  // 1) DOB known → idade actual
  if (junior.dob) {
    const dob = parseIsoDate(junior.dob);
    if (dob) {
      const a = ageAt(dob, new Date());
      const sub = ageToSub(a);
      if (sub) return sub;
    }
  }

  // 2) DOB inferida via tournaments
  const info = computeDobInfo(junior, tournamentById);
  if (info.age != null) {
    const sub = ageToSub(info.age);
    if (sub) return sub;
  }

  // 3) Fallback: catEdad RFEG → Sub-N approximation
  const cat = junior.sources.rfeg?.catEdad;
  if (cat) {
    const c = cat.toUpperCase();
    if (/BENJAM/.test(c)) return "Sub-12";
    if (/ALEV/.test(c)) return "Sub-14";
    if (/INFANT/.test(c)) return "Sub-16";
    if (/CADETE/.test(c)) return "Sub-18";
    if (/JUNIOR|JUVENIL/.test(c)) return "Sub-21";
  }
  return null;
}
