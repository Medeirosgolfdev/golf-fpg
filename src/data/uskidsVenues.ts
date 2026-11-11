/**
 * src/data/uskidsVenues.ts — o campo de uma prova USKids por disputar quando
 * NÃO é o da edição anterior, e o tee de cada escalão enquanto a USKids não
 * publica as distâncias oficiais (04/11/2026, Mariana: «este ano vai ser no
 * SAN ROQUE… vamos ter uma ideia do campo que vamos jogar»).
 *
 * Sem isto o Kids 2 («O Campo», «🔮 Previsão») usava o campo da edição
 * anterior (Spanish Open 2025 = Alto Golf).
 */
import { METROS_POR_JARDA } from "../utils/jardas";

/** Grelha «International Partner Multi-Day Event Yardage» da USKids (jardas
 *  por escalão), lida da imagem da página «Age Groups and Yardages»
 *  (tournaments.uskidsgolf.com/tournaments/international/age-groups-and-yardages-0,
 *  ficheiro international_partner_yardages_0.png, 04/11/2026). */
export const USKIDS_INTL_YARDAGE: { sex: "M" | "F"; ageMin: number; ageMax: number; min: number; max: number; holes: 9 | 18 }[] = [
  { sex: "M", ageMin: 0, ageMax: 6, min: 1200, max: 1350, holes: 9 },
  { sex: "M", ageMin: 7, ageMax: 7, min: 1500, max: 1650, holes: 9 },
  { sex: "M", ageMin: 8, ageMax: 8, min: 1800, max: 1950, holes: 9 },
  { sex: "M", ageMin: 9, ageMax: 9, min: 4200, max: 4500, holes: 18 },
  { sex: "M", ageMin: 10, ageMax: 11, min: 4800, max: 5100, holes: 18 },
  { sex: "M", ageMin: 12, ageMax: 12, min: 5400, max: 5700, holes: 18 },
  { sex: "M", ageMin: 13, ageMax: 14, min: 6000, max: 6300, holes: 18 },
  { sex: "M", ageMin: 15, ageMax: 18, min: 6600, max: 6900, holes: 18 },
  { sex: "F", ageMin: 0, ageMax: 8, min: 1200, max: 1350, holes: 9 },
  { sex: "F", ageMin: 9, ageMax: 10, min: 1800, max: 1950, holes: 9 },
  { sex: "F", ageMin: 11, ageMax: 12, min: 4200, max: 4500, holes: 18 },
  { sex: "F", ageMin: 13, ageMax: 14, min: 4800, max: 5100, holes: 18 },
  { sex: "F", ageMin: 15, ageMax: 18, min: 5400, max: 5700, holes: 18 },
];

/** A linha da grelha de um escalão USKids («Boys 12», «Girls 13-14»…). */
export function uskidsIntlYardage(escalao: string): (typeof USKIDS_INTL_YARDAGE)[number] | null {
  const m = /\b(boys|girls)\b\s*(\d{1,2})/i.exec(escalao || "");
  if (!m) return null;
  const sex = m[1].toLowerCase() === "boys" ? "M" : "F";
  const age = parseInt(m[2], 10);
  return USKIDS_INTL_YARDAGE.find((r) => r.sex === sex && age >= r.ageMin && age <= r.ageMax) ?? null;
}

/** Sede de provas por disputar (tcode USKids → campos da /campos). */
export const USKIDS_SEDES: Record<number, {
  courseKeys: string[];
  /** Campo de cada escalão (nome USKids → courseKey); os outros vão para `resto`. */
  porEscalao?: Record<string, string>;
  resto?: string;
  nota: string;
}> = {
  // Spanish Open 2026 (20–22/11): «this year's championship will feature two
  // exceptional venues: The San Roque Club and San Roque Golf & Resort». Que
  // escalão joga onde: pela página da USKids que a Mariana viu a 04/11/2026
  // («Boys 12 · The San Roque Club»; «os outros é no San Roque Golf & Resort»).
  23132: {
    courseKeys: ["away-the-san-roque-club-old", "away-san-roque"],
    // Tabela «Course Assignment» da página da USKids (Mariana, 04/11/2026):
    // Boys 12, Girls 13-14 e Girls 15-18 no The San Roque Club (Old Course);
    // todos os outros no San Roque Golf & Resort (New Course) — os de 9 buracos
    // (Boys 6–8, Girls 8 e 9-10) nos 9 de trás («Back»).
    porEscalao: {
      "Boys 12": "away-the-san-roque-club-old",
      "Girls 13-14": "away-the-san-roque-club-old",
      "Girls 15-18": "away-the-san-roque-club-old",
    },
    resto: "away-san-roque",
    nota: "Spanish Open 2026: Boys 12, Girls 13-14 e Girls 15-18 no The San Roque Club (Old Course); os outros escalões no San Roque Golf & Resort (New Course)",
  },
};

/** Os campos onde um escalão joga numa sede (um só quando se sabe). */
export function camposDoEscalao(sede: (typeof USKIDS_SEDES)[number], escalao: string): string[] {
  const k = sede.porEscalao?.[escalao] ?? sede.resto;
  return k ? [k] : sede.courseKeys;
}

/** O campo e o tee de um escalão numa prova com sede (`USKIDS_SEDES`): dos
 *  campos do escalão, o tee do sexo do escalão cujo comprimento (em jardas)
 *  fica mais perto do meio da faixa da grelha USKids. Só escalões de 18
 *  buracos. Fonte única — Kids 2 (`resolveCourseTee`) e o CircuitShell
 *  (`useCampoTabs`, /uskids). */
export function teeDaSede<C extends { courseKey: string; master: { name: string; tees: { sex: string; teeName: string; distances: { total?: number | null } }[] } }>(
  t: number, escalao: string, courses: readonly C[],
): { course: C; tee: C["master"]["tees"][number]; nota: string } | null {
  const sede = USKIDS_SEDES[t];
  const faixa = uskidsIntlYardage(escalao);
  if (!sede || !faixa || faixa.holes !== 18) return null;
  const alvo = (faixa.min + faixa.max) / 2;
  let best: { course: C; tee: C["master"]["tees"][number]; d: number } | null = null;
  for (const key of camposDoEscalao(sede, escalao)) {
    const course = courses.find((c) => c.courseKey === key);
    for (const tee of course?.master.tees ?? []) {
      if (tee.sex !== faixa.sex || !tee.distances?.total) continue;
      const d = Math.abs(tee.distances.total / METROS_POR_JARDA - alvo);
      if (!best || d < best.d) best = { course: course!, tee, d };
    }
  }
  if (!best) return null;
  const total = best.tee.distances.total ?? 0;
  return {
    course: best.course,
    tee: best.tee,
    nota: `${sede.nota}. Tee estimado pela grelha da USKids, enquanto não saem as distâncias oficiais (${escalao}: ${faixa.min}–${faixa.max} jardas): ${best.course.master.name} · ${best.tee.teeName}, ${total} m (${Math.round(total / 0.9144)} jardas).`,
  };
}
