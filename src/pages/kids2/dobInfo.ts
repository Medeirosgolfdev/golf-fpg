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
import { MONTHS_PT } from "../../utils/format";

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

    const newMin: Date = (!rangeMin || earliest > rangeMin) ? earliest : rangeMin;
    const newMax: Date = (!rangeMax || latest < rangeMax) ? latest : rangeMax;
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

      const tMin: Date = transEarly > rangeMin! ? transEarly : rangeMin!;
      const tMax: Date = transLate < rangeMax! ? transLate : rangeMax!;
      if (tMin <= tMax) { rangeMin = tMin; rangeMax = tMax; }
    }
  }

  const midMs = (rangeMin!.getTime() + rangeMax!.getTime()) / 2;
  const mid = new Date(midMs);
  const today = new Date();
  const age = ageAt(mid, today);
  return {
    state: "inferred",
    dobIso: toIso(mid),
    rangeMin: toIso(rangeMin!),
    rangeMax: toIso(rangeMax!),
    age,
    ageLabel: `~${age} anos`,
    dobLabel: fmtRange(rangeMin!, rangeMax!),
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
    if (minM === maxM) return `${MONTHS_PT[minM]} ${minY}`;
    return `${MONTHS_PT[minM]}–${MONTHS_PT[maxM]} ${minY}`;
  }
  // Cross-year — mostra meses se range é estreito
  if (spanDays < 400) return `${MONTHS_PT[minM]} ${minY} – ${MONTHS_PT[maxM]} ${maxY}`;
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

// ═══════════════════════════════════════════════════════════════════════
// Categoria oficial RFEG (Espanha)
// ═══════════════════════════════════════════════════════════════════════

/** Categorias oficiais RFEG (Real Federación Española de Golf). Calculadas
 *  pela idade que o jogador faz no ANO CIVIL em curso (regra oficial RFEG). */
export type CategoriaRFEG = "Benjamín" | "Alevín" | "Infantil" | "Cadete" | "Juvenil" | "Junior";

const CATEGORIA_RFEG_RANGES: ReadonlyArray<{ ageMax: number; cat: CategoriaRFEG }> = [
  { ageMax: 10, cat: "Benjamín" },
  { ageMax: 12, cat: "Alevín" },
  { ageMax: 14, cat: "Infantil" },
  { ageMax: 16, cat: "Cadete" },
  { ageMax: 18, cat: "Juvenil" },
  { ageMax: 21, cat: "Junior" },
];

/** Calcula a categoria RFEG a partir da idade no ano civil. Retorna null
 *  se idade fora dos escalões juvenis (<6 ou >21). */
export function categoriaFromAgeThisYear(ageThisYear: number): CategoriaRFEG | null {
  if (ageThisYear <= 0) return null;
  for (const r of CATEGORIA_RFEG_RANGES) {
    if (ageThisYear <= r.ageMax) return r.cat;
  }
  return null;
}

/** Indica se o jogador é "1º ano" ou "2º ano" da categoria (cada categoria
 *  RFEG cobre 2 anos: ex. Alevín = 11+12; quem tem 11 anos no ano civil
 *  está no 1º ano de Alevín, quem tem 12 está no 2º). Retorna 1 ou 2. */
export function anoNaCategoria(ageThisYear: number, cat: CategoriaRFEG): 1 | 2 {
  // Cada categoria começa numa idade par: Benjamín 9-10, Alevín 11-12, etc.
  // Excepção: Benjamín é mono-faixa (só ageMax 10) — assumimos sempre 2º.
  const starts: Record<CategoriaRFEG, number> = {
    "Benjamín": 9,
    "Alevín":   11,
    "Infantil": 13,
    "Cadete":   15,
    "Juvenil":  17,
    "Junior":   19,
  };
  const lo = starts[cat];
  return ageThisYear === lo ? 1 : 2;
}

export interface CategoriaRFEGInfo {
  cat: CategoriaRFEG;
  ano: 1 | 2;
  /** "Alevín 2º ano" — pronto para mostrar num pill. */
  label: string;
  /** Origem do cálculo: "dob" (DOB conhecido), "inferred" (DOB inferido),
   *  "source" (catEdad veio directamente da licença RFEG). */
  source: "dob" | "inferred" | "source";
}

/** Calcula a categoria RFEG do junior, preferindo DOB conhecido,
 *  caindo para DOB inferido via torneios, e finalmente para `catEdad`
 *  bruto vindo da licença RFEG.
 *
 *  Alarga a função antiga `categoriaRFEGFromDob` (kids/dobInference.ts)
 *  com:
 *    - input Junior em vez de string solta
 *    - tighten via `computeDobInfo` quando DOB exacta não existe
 *    - inferência do "ano" dentro da categoria (1º ou 2º)
 *    - origem do cálculo (para mostrar tooltip "calculado vs declarado") */
export function categoriaRFEG(
  junior: Junior,
  tournamentById?: Map<string, Tournament>,
  today: Date = new Date(),
): CategoriaRFEGInfo | null {
  const yearNow = today.getFullYear();

  // Preferência 1: DOB exacta
  if (junior.dob) {
    const dob = parseIsoDate(junior.dob);
    if (dob) {
      const ageThisYear = yearNow - dob.getFullYear();
      const cat = categoriaFromAgeThisYear(ageThisYear);
      if (cat) {
        const ano = anoNaCategoria(ageThisYear, cat);
        return { cat, ano, label: `${cat} ${ano}º ano`, source: "dob" };
      }
    }
  }

  // Preferência 2: DOB inferido via torneios
  if (tournamentById) {
    const info = computeDobInfo(junior, tournamentById);
    if (info.dobIso) {
      const dob = parseIsoDate(info.dobIso);
      if (dob) {
        const ageThisYear = yearNow - dob.getFullYear();
        const cat = categoriaFromAgeThisYear(ageThisYear);
        if (cat) {
          const ano = anoNaCategoria(ageThisYear, cat);
          // Quando inferido, não temos certeza absoluta sobre o ano dentro
          // da categoria — mostrar mesmo assim, mas marcar a fonte.
          return { cat, ano, label: `${cat} ${ano}º ano`, source: "inferred" };
        }
      }
    }
  }

  // Preferência 3: catEdad vinda da licença RFEG (string bruta)
  const raw = junior.sources.rfeg?.catEdad;
  if (raw) {
    const c = raw.toUpperCase();
    let cat: CategoriaRFEG | null = null;
    if (/BENJAM/.test(c)) cat = "Benjamín";
    else if (/ALEV/.test(c)) cat = "Alevín";
    else if (/INFANT/.test(c)) cat = "Infantil";
    else if (/CADETE/.test(c)) cat = "Cadete";
    else if (/JUVENIL/.test(c)) cat = "Juvenil";
    else if (/JUNIOR/.test(c)) cat = "Junior";
    if (cat) {
      // Não temos o ano na fonte — assumir 2º (pior caso para idade)
      return { cat, ano: 2, label: cat, source: "source" };
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// dobRangeStrict — versão permissiva (constraints parciais)
// ═══════════════════════════════════════════════════════════════════════

/** Versão permissiva de `computeDobInfo` que aceita constraints parciais.
 *
 *  O `computeDobInfo` exige uma faixa etária completa (ageMin E ageMax)
 *  para considerar o torneio. Esta variante aceita também:
 *    - só ageMin presente (o jogador tinha PELO MENOS X anos → DOB ≤ data−X)
 *    - só ageMax presente (o jogador tinha NO MÁXIMO X anos → DOB ≥ data−X−1+1d)
 *
 *  Útil para juniors que aparecem em poucos torneios (ex: 1-2 inscrições
 *  com escalão "Sub 14" mas sem limite inferior, ou "Open" com idade máx).
 *
 *  Retorna `[lo, hi]` em ISO ("YYYY-MM-DD") ou `[null, null]` se nada se
 *  pôde inferir. */
export function dobRangeStrict(
  junior: Junior,
  tournamentById: Map<string, Tournament>,
): [string | null, string | null] {
  // Quando DOB é conhecida, é o range exacto.
  if (junior.dob) {
    const d = parseIsoDate(junior.dob);
    if (d) {
      const iso = toIso(d);
      return [iso, iso];
    }
  }

  let lo: Date | null = null;
  let hi: Date | null = null;

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
      // Sanity: ranges absurdos saltam-se
      if (ageMin != null && (ageMin < 5 || ageMin > 25)) continue;
      if (ageMax != null && (ageMax < 5 || ageMax > 25)) continue;
      if (ageMin != null && ageMax != null && ageMin > ageMax) continue;

      // ageMin presente → tinha pelo menos ageMin anos → DOB ≤ data − ageMin anos
      if (ageMin != null) {
        const latest = new Date(date);
        latest.setFullYear(latest.getFullYear() - ageMin);
        if (!hi || latest < hi) hi = latest;
      }
      // ageMax presente → tinha no máximo ageMax anos → DOB ≥ data − (ageMax+1) anos + 1 dia
      if (ageMax != null) {
        const earliest = new Date(date);
        earliest.setFullYear(earliest.getFullYear() - ageMax - 1);
        earliest.setDate(earliest.getDate() + 1);
        if (!lo || earliest > lo) lo = earliest;
      }
    }
  }

  return [lo ? toIso(lo) : null, hi ? toIso(hi) : null];
}

// ═══════════════════════════════════════════════════════════════════════
// arePlayersCompatible — auditoria de qualidade do merge
// ═══════════════════════════════════════════════════════════════════════

export interface CompatibilityResult {
  /** True se os 2 juniors PODEM ser a mesma pessoa. */
  compatible: boolean;
  /** Razão para incompatibilidade ('memberId-mismatch', 'dob-mismatch',
   *  'sex-mismatch', 'rfeg-lic-mismatch', 'fpg-fed-mismatch') ou null se compatíveis. */
  reason: string | null;
  /** Detalhes adicionais para mostrar em ferramenta de debug. */
  detail?: string;
}

/** Testa se 2 juniors PODEM ser a mesma pessoa.
 *
 *  Retorna `compatible: false` apenas com EVIDÊNCIA FORTE de que são
 *  pessoas diferentes:
 *    1. memberIds USKids ambos definidos e distintos (e nenhum aparece
 *       no historicalMemberIds do outro)
 *    2. DOBs ISO ambas definidas e distintas
 *    3. Sexos ambos definidos e distintos
 *    4. Licenças RFEG ambas definidas e distintas (e nenhuma aparece
 *       no historicalLicenses do outro)
 *    5. fed FPG ambos definidos e distintos (e nenhum aparece no
 *       historicalFeds do outro)
 *
 *  Caso contrário retorna `compatible: true`. NÃO usa ranges DOB inferidos
 *  porque escalões adjacentes (Boys 10/11) podem produzir ranges disjuntos
 *  para a MESMA pessoa devido a boundaries de idade × data de torneio.
 *
 *  Útil para auditar o output do aggregator: se alguma vez o aggregator
 *  fundir 2 juniors com `compatible: false`, isso indica bug de matching
 *  (e deve ser usado para flag em ferramenta de admin/debug). */
export function arePlayersCompatible(a: Junior, b: Junior): CompatibilityResult {
  // 1) USKids memberId mismatch
  const midA = a.sources.uskids?.memberId;
  const midB = b.sources.uskids?.memberId;
  if (midA && midB && midA !== midB) {
    const histA = (a.sources.uskids?.historicalMemberIds || []).map((h) => typeof h === "string" ? h : h.memberId);
    const histB = (b.sources.uskids?.historicalMemberIds || []).map((h) => typeof h === "string" ? h : h.memberId);
    if (!histA.includes(midB) && !histB.includes(midA)) {
      return { compatible: false, reason: "memberId-mismatch", detail: `${midA} vs ${midB}` };
    }
  }

  // 2) DOB mismatch
  if (a.dob && b.dob && a.dob !== b.dob) {
    return { compatible: false, reason: "dob-mismatch", detail: `${a.dob} vs ${b.dob}` };
  }

  // 3) Sexo mismatch
  const sxA = a.sex || a.sources.fpg?.sex || a.sources.rfeg?.sex || a.sources.ffgolf?.sex;
  const sxB = b.sex || b.sources.fpg?.sex || b.sources.rfeg?.sex || b.sources.ffgolf?.sex;
  if (sxA && sxB && sxA !== sxB) {
    return { compatible: false, reason: "sex-mismatch", detail: `${sxA} vs ${sxB}` };
  }

  // 4) RFEG lic mismatch
  const licA = a.sources.rfeg?.lic;
  const licB = b.sources.rfeg?.lic;
  if (licA && licB && licA !== licB) {
    const histA = (a.sources.rfeg?.historicalLicenses || []).map((h) => typeof h === "string" ? h : h.lic);
    const histB = (b.sources.rfeg?.historicalLicenses || []).map((h) => typeof h === "string" ? h : h.lic);
    if (!histA.includes(licB) && !histB.includes(licA)) {
      return { compatible: false, reason: "rfeg-lic-mismatch", detail: `${licA} vs ${licB}` };
    }
  }

  // 5) FPG fed mismatch
  const fedA = a.sources.fpg?.fed;
  const fedB = b.sources.fpg?.fed;
  if (fedA && fedB && fedA !== fedB) {
    const histA = (a.sources.fpg?.historicalFeds || []).map((h) => typeof h === "string" ? h : h.fed);
    const histB = (b.sources.fpg?.historicalFeds || []).map((h) => typeof h === "string" ? h : h.fed);
    if (!histA.includes(fedB) && !histB.includes(fedA)) {
      return { compatible: false, reason: "fpg-fed-mismatch", detail: `${fedA} vs ${fedB}` };
    }
  }

  return { compatible: true, reason: null };
}
