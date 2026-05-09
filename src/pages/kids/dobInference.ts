/**
 * kids/dobInference.ts — Inferência de data de nascimento (DOB) por idade/escalão
 * (extraído de KIDSPage.tsx — função core do sistema de matching de rivais)
 *
 * Funções principais:
 *  - computeDobInfo(rival) — infere DOB partindo de torneios+idades+escalões
 *  - escalaoIntl(ageMin, ageMax) — formata escalão (Boys 11-12, Sub-12, etc.)
 *  - dobRangeStrict(rival) — range mínimo possível para DOB de um rival
 *  - arePlayersCompatible(a, b) — testam se dois rivais podem ser a mesma pessoa
 */
import { T } from "./tournDef";
import { hiddenTids } from "../KIDSPage";
import type { TournDef } from "./tournDef";
import type { RivalPlayer, MHPlayer } from "../KIDSPage";
import { uskTournNames, fpgTournNames, ffgolfTournNames } from "../../data/KIDSdataLoader";
import { isoDate, MONTHS_PT } from "../../utils/format";

interface RivalLike {
  n: string;
  dob?: string;
  r: Record<string, { p?: number | "WD"; t?: number | null; tp?: number | null; rd?: (number|null)[]; ageGroup?: string }>;
}

export function parseDob(s: string): Date {
  const [d, m, y] = s.split("/").map(Number);
  return new Date(y, m - 1, d);
}

/** Age at a given date */
export function ageAt(dob: Date, at: Date): number {
  let age = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age--;
  return age;
}

/** Format age string for an ESTIMATED DOB (midpoint) — no countdown */
export function fmtAgeEstimated(dob: Date): string {
  return `~${ageAt(dob, new Date())} anos`;
}

export interface DobInfo {
  exact: boolean;
  dob?: Date;
  dobStr?: string;       // "DD/MM/YYYY"
  rangeMin?: Date;       // earliest possible
  rangeMax?: Date;       // latest possible
  rangeStr: string;      // e.g. "Mar–Dez 2014" or "2014–2015"
  ageStr: string;        // e.g. "11 anos" or "~11 anos"
  nextBdayDays?: number; // dias para o próximo aniversário (só exact)
  nextAge?: number;      // próxima idade (só exact, quando countdown activo)
}

export const T_MAP: Record<string, { dateExact?: string; ageMin?: number; ageMax?: number }> = {
  ...Object.fromEntries(T.map(t => [t.id, t])),
  // Auto tourns from rivaisDataLoader
  wjgc25_b89:    { dateExact: "2025-02-24", ageMin: 8,  ageMax: 9  },
  wjgc25_b1011:  { dateExact: "2025-02-24", ageMin: 10, ageMax: 11 },
  wjgc25_b1213:  { dateExact: "2025-02-24", ageMin: 12, ageMax: 13 },
  eowagr25_b78:  { dateExact: "2025-08-01", ageMin: 7,  ageMax: 8  },
  eowagr25_b910: { dateExact: "2025-08-01", ageMin: 9,  ageMax: 10 },
  eowagr25_b1314:{ dateExact: "2025-08-01", ageMin: 13, ageMax: 14 },
  doral25_b89:   { dateExact: "2025-12-19", ageMin: 8,  ageMax: 9  },
  doral25_b1011: { dateExact: "2025-12-19", ageMin: 10, ageMax: 11 },
  doral25_b1213: { dateExact: "2025-12-19", ageMin: 12, ageMax: 13 },
  venice25_b9:   { dateExact: "2025-08-07", ageMin: 9,  ageMax: 9  },
  venice25_b10:  { dateExact: "2025-08-07", ageMin: 10, ageMax: 10 },
  venice25_b11:  { dateExact: "2025-08-07", ageMin: 11, ageMax: 11 },
  venice25_b12:  { dateExact: "2025-08-07", ageMin: 12, ageMax: 12 },
  rome25_b10:    { dateExact: "2025-10-09", ageMin: 10, ageMax: 10 },
  rome25_b11:    { dateExact: "2025-10-09", ageMin: 11, ageMax: 11 },
  rome25_b12:    { dateExact: "2025-10-09", ageMin: 12, ageMax: 12 },
  marco25_b9:    { dateExact: "2025-03-15", ageMin: 9,  ageMax: 9  },
  marco25_b10:   { dateExact: "2025-03-15", ageMin: 10, ageMax: 10 },
  marco25_b11:   { dateExact: "2025-03-15", ageMin: 11, ageMax: 11 },
  marco25_b12:   { dateExact: "2025-03-15", ageMin: 12, ageMax: 12 },
  marco26_b9:    { dateExact: "2026-03-13", ageMin: 9,  ageMax: 9  },
  marco26_b10:   { dateExact: "2026-03-13", ageMin: 10, ageMax: 10 },
  marco26_b11:   { dateExact: "2026-03-13", ageMin: 11, ageMax: 11 },
  marco26_b12:   { dateExact: "2026-03-13", ageMin: 12, ageMax: 12 },
  desert26_b9:   { dateExact: "2026-02-21", ageMin: 9,  ageMax: 9  },
  desert26_b10:  { dateExact: "2026-02-21", ageMin: 10, ageMax: 10 },
  desert26_b11:  { dateExact: "2026-02-21", ageMin: 11, ageMax: 11 },
  desert26_b12:  { dateExact: "2026-02-21", ageMin: 12, ageMax: 12 },
  sandestin26_b9: { dateExact: "2026-01-17", ageMin: 9,  ageMax: 9  },
  sandestin26_b10:{ dateExact: "2026-01-17", ageMin: 10, ageMax: 10 },
  sandestin26_b11:{ dateExact: "2026-01-17", ageMin: 11, ageMax: 11 },
  sandestin26_b12:{ dateExact: "2026-01-17", ageMin: 12, ageMax: 12 },
  msstate26_b9:  { dateExact: "2026-03-09", ageMin: 9,  ageMax: 9  },
  msstate26_b10: { dateExact: "2026-03-09", ageMin: 10, ageMax: 10 },
  msstate26_b11: { dateExact: "2026-03-09", ageMin: 11, ageMax: 11 },
  msstate26_b12: { dateExact: "2026-03-09", ageMin: 12, ageMax: 12 },
  elprat23_b8:   { dateExact: "2023-10-22", ageMin: 8,  ageMax: 8  },
  elprat23_b9:   { dateExact: "2023-10-22", ageMin: 9,  ageMax: 9  },
  elprat23_b10:  { dateExact: "2023-10-22", ageMin: 10, ageMax: 10 },
  // Doral 2024
  doral24_b89:   { dateExact: "2024-12-19", ageMin: 8,  ageMax: 9  },
  doral24_b1011: { dateExact: "2024-12-19", ageMin: 10, ageMax: 11 },
  doral24_b1213: { dateExact: "2024-12-19", ageMin: 12, ageMax: 13 },
  // Greatgolf
  gg25:          { dateExact: "2025-02-08", ageMax: 12 },
  gg26_u14:      { dateExact: "2026-02-08", ageMin: 13, ageMax: 14 },
  gg26_open:     { dateExact: "2026-02-08" },
};

/** Parse "Boys 11" / "Boys 10-11" / "Boys 10 & 11" → exact age or null */
export function parseExactAge(agStr: string): number | null {
  if (!agStr) return null;
  // "Boys 11" — single age, no range
  const single = agStr.match(/[Bb]oys\s+(\d+)$/);
  if (single) return Number(single[1]);
  // "Boys 10" with trailing spaces / punctuation
  const clean = agStr.match(/[Bb]oys\s+(\d+)\s*$/);
  if (clean) return Number(clean[1]);
  return null; // range like "Boys 10-11" or "Boys 10 & 11" → can't pin exact age
}

export interface DobConstraint {
  dateExact: string;   // tournament date
  ageMin: number;      // minimum age bracket
  ageMax: number;      // maximum age bracket (same as min when exact)
  tid: string;
}

/** Calcula o escalão internacional Sub-N (Sub-10/12/14/16/18/21) prefirindo
 *  a idade actual (DOB exacto), com fallback para a categoria RFEG (catEdad). */
export function escalaoIntl(rival: RivalPlayer): string | null {
  const ageToSub = (a: number): string | null => {
    if (a <= 9) return "Sub-10";
    if (a <= 11) return "Sub-12";
    if (a <= 13) return "Sub-14";
    if (a <= 15) return "Sub-16";
    if (a <= 17) return "Sub-18";
    if (a <= 21) return "Sub-21";
    return null;
  };
  // 1) DOB exacto → idade actual
  if (rival.dob) {
    try {
      const d = parseDob(rival.dob);
      const today = new Date();
      let a = today.getFullYear() - d.getFullYear();
      const beforeBirthday = today.getMonth() < d.getMonth()
        || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate());
      if (beforeBirthday) a--;
      const sub = ageToSub(a);
      if (sub) return sub;
    } catch {}
  }
  // 2) Fallback: catEdad RFEG → mapeamento standard
  const cat = (rival as any).esCatEdad as string | undefined;
  if (cat) {
    const c = cat.toUpperCase();
    if (/BENJAM/.test(c)) return "Sub-10";
    if (/ALEV/.test(c)) return "Sub-12";
    if (/INFANT/.test(c)) return "Sub-14";
    if (/CADETE/.test(c)) return "Sub-16";
    if (/JUNIOR|JUVENIL/.test(c)) return "Sub-18";
  }
  return null;
}

export function computeDobInfo(p: RivalPlayer, mhPlayer?: MHPlayer | null): DobInfo {
  // If exact DOB known
  if (p.dob) {
    const d = parseDob(p.dob);
    const today = new Date();
    const a = ageAt(d, today);
    const nextBday = new Date(today.getFullYear(), d.getMonth(), d.getDate());
    if (nextBday <= today) nextBday.setFullYear(nextBday.getFullYear() + 1);
    const diffDays = Math.ceil((nextBday.getTime() - today.getTime()) / 86400000);
    const showCountdown = diffDays <= 90;
    return {
      exact: true, dob: d, dobStr: p.dob, rangeStr: p.dob, ageStr: `${a} anos`,
      nextBdayDays: showCountdown ? diffDays : undefined,
      nextAge: showCountdown ? a + 1 : undefined,
    };
  }

  // ── Step 1: collect constraints from p.r tournaments ──────────────────────
  const constraints: DobConstraint[] = [];
  const hidden = hiddenTids(p); // skip dedup'd tids to avoid contradictory constraints

  for (const [tid, res] of Object.entries(p.r)) {
    if (hidden.has(tid)) continue; // skip duplicates that could create contradictions
    let td: { dateExact?: string; ageMin?: number; ageMax?: number } | undefined = T_MAP[tid];

    // USKids completo tids "usk{tcode}_b{n}" → dateExact from name map, age from suffix
    if (!td) {
      const m = tid.match(/^(usk\d+)_b(\d+)$/);
      if (m) {
        const base = uskTournNames.get(m[1]);
        const age = Number(m[2]);
        if (base) td = { dateExact: base.dateExact, ageMin: age, ageMax: age };
      }
    }
    // FPG juniores: "fpg{tcode}" — tcode pode conter + para torneios pré-fundidos
    if (!td && /^fpg[\d+]+$/.test(tid)) {
      const fpg = fpgTournNames.get(tid);
      if (fpg) td = { dateExact: fpg.dateExact, ageMin: fpg.ageMin, ageMax: fpg.ageMax };
    }
    // FFGolf: "ff{trnId}_{U10|U12|U14}" → dateExact + age range derivado do escalão
    if (!td && tid.startsWith("ff")) {
      const ff = ffgolfTournNames.get(tid);
      if (ff) {
        const ag = ff.ageGroup || "";
        const aMin = ag === "U10" ? 8 : ag === "U12" ? 11 : ag === "U14" ? 13 : null;
        const aMax = ag === "U10" ? 10 : ag === "U12" ? 12 : ag === "U14" ? 14 : null;
        if (aMin != null && aMax != null) {
          td = { dateExact: ff.dateExact, ageMin: aMin, ageMax: aMax };
        }
      }
    }
    if (!td?.dateExact) continue;

    let ageMin = td.ageMin ?? null;
    let ageMax = td.ageMax ?? null;

    // Refine using the actual ageGroup string stored on this result
    const agStr = (res as any).ageGroup as string | undefined;
    if (agStr) {
      const exact = parseExactAge(agStr);
      if (exact != null) {
        ageMin = (ageMin == null) ? exact : Math.max(ageMin, exact);
        ageMax = (ageMax == null) ? exact : Math.min(ageMax, exact);
      }
    }

    if (ageMin == null || ageMax == null) continue;
    constraints.push({ dateExact: td.dateExact, ageMin, ageMax, tid });
  }

  // ── Step 1b: member history — precise single-age USKids data points ────────
  // Each entry gives an exact age on a specific date → very tight constraint
  // Multiple consecutive entries with a step-up reveal the birthday window precisely
  if (mhPlayer) {
    for (const [mhTid, t] of Object.entries(mhPlayer.torneios)) {
      if (!t.startDate || !t.ageGroup) continue;
      const isoD = isoDate(t.startDate);
      if (!isoD) continue;
      const exact = parseExactAge(t.ageGroup);
      if (exact == null) continue; // range label like "Boys 10-11" → skip
      constraints.push({ dateExact: isoD, ageMin: exact, ageMax: exact, tid: `mh_${mhTid}` });
    }
  }

  if (constraints.length === 0) {
    return { exact: false, rangeStr: "?", ageStr: "?" };
  }

  // ── Step 2: intersect all per-tournament DOB windows ───────────────────────
  // "Age A on date D" → birthday ∈ (D − (A+1) years, D − A years]
  // Apply each constraint only if it doesn't make the range impossible.
  // Bad constraints (e.g. from a name collision in auto-loaded data) are skipped.
  let rangeMin: Date | null = null;
  let rangeMax: Date | null = null;

  for (const c of constraints) {
    const tDate = new Date(c.dateExact);
    const latest = new Date(tDate);
    latest.setFullYear(latest.getFullYear() - c.ageMin);
    const earliest = new Date(tDate);
    earliest.setFullYear(earliest.getFullYear() - c.ageMax - 1);
    earliest.setDate(earliest.getDate() + 1);

    // Try applying — only commit if the result is still a valid window
    const newMin: Date = (!rangeMin || earliest > rangeMin) ? earliest : rangeMin;
    const newMax: Date = (!rangeMax || latest  < rangeMax)  ? latest   : rangeMax;
    if (newMin <= newMax) {
      rangeMin = newMin;
      rangeMax = newMax;
    }
    // else: this constraint conflicts with what we know — skip it silently
  }

  if (!rangeMin || !rangeMax || rangeMin > rangeMax) {
    return { exact: false, rangeStr: "?", ageStr: "?" };
  }

  // ── Step 3: tighten using age-group transitions ─────────────────────────────
  // If player was age A at T1 and A+1 at T2 (T2 > T1), their (A+1)-th birthday
  // falls strictly between T1 and T2 → birthday ∈ (T1 − (A+1) years, T2 − (A+1) years]
  // This same window is already captured by the intersection above, but the
  // transition check lets us tighten when we only have the later tournament:
  //   if we know birthday > T1 (because they were still A at T1), we can set
  //   a lower bound on birthday of (T1 - (A+1) years + 1 day).
  // So the main benefit is detecting the transition to add this lower bound constraint.

  const sorted = [...constraints].sort((a, b) => a.dateExact.localeCompare(b.dateExact));
  for (let i = 0; i < sorted.length - 1; i++) {
    const c1 = sorted[i], c2 = sorted[i + 1];
    // Is this a clear step-up? (c2's minimum age > c1's maximum age, difference = 1)
    if (c2.ageMin - c1.ageMax === 1) {
      // Birthday is the (c1.ageMax + 1)th birthday, which happened between T1 and T2
      // → birthday ∈ (T1 − (c1.ageMax+1) years, T2 − (c1.ageMax+1) years]
      const transA = c1.ageMax + 1;
      const transLate = new Date(c2.dateExact);
      transLate.setFullYear(transLate.getFullYear() - transA);
      const transEarly = new Date(c1.dateExact);
      transEarly.setFullYear(transEarly.getFullYear() - transA);
      transEarly.setDate(transEarly.getDate() + 1);

      // Apply transition tightening only if it keeps the range valid
      const tMin: Date = transEarly > rangeMin! ? transEarly : rangeMin!;
      const tMax: Date = transLate  < rangeMax! ? transLate  : rangeMax!;
      if (tMin <= tMax) { rangeMin = tMin; rangeMax = tMax; }
    }
  }

  if (rangeMin! > rangeMax!) {
    return { exact: false, rangeStr: "?", ageStr: "?" };
  }

  // ── Step 4: format output ───────────────────────────────────────────────────
  const minY = rangeMin!.getFullYear(), maxY = rangeMax!.getFullYear();
  const minM = rangeMin!.getMonth(),    maxM = rangeMax!.getMonth();
  const spanDays = Math.round((rangeMax!.getTime() - rangeMin!.getTime()) / 86400000);

  let rangeStr: string;
  if (spanDays <= 1) {
    // Single day — essentially exact
    const d = rangeMin!;
    rangeStr = `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  } else if (minY === maxY) {
    if (minM === maxM) {
      rangeStr = `${MONTHS_PT[minM]} ${minY}`;
    } else {
      rangeStr = `${MONTHS_PT[minM]}–${MONTHS_PT[maxM]} ${minY}`;
    }
  } else {
    rangeStr = `${MONTHS_PT[minM]} ${minY} – ${MONTHS_PT[maxM]} ${maxY}`;
  }

  // Estimate age: use midpoint of the DOB range
  const midMs  = (rangeMin!.getTime() + rangeMax!.getTime()) / 2;
  const midDob = new Date(midMs);
  // Never show countdown for estimated DOBs — midpoint is not the real birthday
  const ageStr = fmtAgeEstimated(midDob);

  return { exact: false, rangeMin: rangeMin ?? undefined, rangeMax: rangeMax ?? undefined, rangeStr, ageStr };
}

export function dobRangeStrict(p: RivalPlayer): [Date | null, Date | null] {
  if (p.dob) {
    const d = parseDob(p.dob);
    return [d, d];
  }
  let lo: Date | null = null, hi: Date | null = null;
  for (const [tid, res] of Object.entries(p.r)) {
    let td: { dateExact?: string; ageMin?: number; ageMax?: number } | undefined = T_MAP[tid];
    if (!td) {
      const m = tid.match(/^(usk\d+)_b(\d+)$/);
      if (m) {
        const base = uskTournNames.get(m[1]);
        const age = Number(m[2]);
        if (base) td = { dateExact: base.dateExact, ageMin: age, ageMax: age };
      }
    }
    if (!td && /^fpg[\d+]+$/.test(tid)) {
      const fpg = fpgTournNames.get(tid);
      if (fpg) td = { dateExact: fpg.dateExact, ageMin: fpg.ageMin, ageMax: fpg.ageMax };
    }
    if (!td && tid.startsWith("ff")) {
      const ff = ffgolfTournNames.get(tid);
      if (ff) {
        const ag = ff.ageGroup || "";
        const aMin = ag === "U10" ? 8 : ag === "U12" ? 11 : ag === "U14" ? 13 : null;
        const aMax = ag === "U10" ? 10 : ag === "U12" ? 12 : ag === "U14" ? 14 : null;
        if (aMin != null && aMax != null) td = { dateExact: ff.dateExact, ageMin: aMin, ageMax: aMax };
      }
    }
    if (!td?.dateExact) continue;

    let ageMin = td.ageMin ?? null;
    let ageMax = td.ageMax ?? null;
    const agStr = (res as any).ageGroup as string | undefined;
    if (agStr) {
      const exact = parseExactAge(agStr);
      if (exact != null) {
        ageMin = ageMin == null ? exact : Math.max(ageMin, exact);
        ageMax = ageMax == null ? exact : Math.min(ageMax, exact);
      }
    }
    // Aceitar constraints parciais: só ageMin (≥X anos) ou só ageMax (≤X anos)
    if (ageMin == null && ageMax == null) continue;

    const tDate = new Date(td.dateExact);
    if (ageMin != null) {
      // Tinha PELO MENOS ageMin → DOB ≤ tDate - ageMin anos (latest possível)
      const latest = new Date(tDate); latest.setFullYear(latest.getFullYear() - ageMin);
      if (!hi || latest < hi) hi = latest;
    }
    if (ageMax != null) {
      // Tinha NO MÁXIMO ageMax → DOB > tDate - (ageMax+1) anos (earliest possível)
      const earliest = new Date(tDate); earliest.setFullYear(earliest.getFullYear() - ageMax - 1);
      earliest.setDate(earliest.getDate() + 1);
      if (!lo || earliest > lo) lo = earliest;
    }
  }
  return [lo, hi];
}

/**
 * Verifica se dois jogadores podem coerentemente ser a mesma pessoa.
 * Conservador: SÓ bloqueia merge quando há evidência FORTE de pessoas diferentes.
 *
 * Bloqueia se:
 *   1. memberId definido em ambos e diferente
 *   2. DOB explícita em ambos e diferem por > 30 dias
 *
 * NÃO bloqueia em janelas DOB inferidas (demasiado ruidosas — kids jogam em
 * escalões adjacentes, dados podem ter pequenas inconsistências). Janelas
 * com gap > 1 ano contra DOB explícita vão soltar a flag.
 *
 * Para Manuel: nunca bloqueia (resolvePlayerKey + isM já tratam dele).
 */
export function arePlayersCompatible(a: RivalPlayer, b: RivalPlayer): boolean {
  if (a.isM || b.isM) return true;

  const aMid = (a as any).memberId, bMid = (b as any).memberId;
  if (aMid && bMid && aMid !== bMid) return false;

  // DOB explícita em ambos: têm de coincidir (tolerância 30 dias)
  if (a.dob && b.dob) {
    const da = parseDob(a.dob), db = parseDob(b.dob);
    const diffDays = Math.abs(da.getTime() - db.getTime()) / 86400000;
    if (diffDays > 30) return false;
  }

  // DOB explícita vs janela inferida do outro: bloqueia só se gap > 12 meses
  const explicit = a.dob ? parseDob(a.dob) : (b.dob ? parseDob(b.dob) : null);
  const other = a.dob ? b : (b.dob ? a : null);
  if (explicit && other) {
    const [lo, hi] = dobRangeStrict(other);
    if (lo && explicit < lo) {
      const months = (lo.getTime() - explicit.getTime()) / (30.44 * 86400000);
      if (months > 12) return false;
    }
    if (hi && explicit > hi) {
      const months = (explicit.getTime() - hi.getTime()) / (30.44 * 86400000);
            if (months > 12) return false;
    }
  }

  return true;
}
