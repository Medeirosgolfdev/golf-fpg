/**
 * pages/kids/CourseTab.tsx
 *
 * Tab "O Campo" do FieldRivaisDashboard.
 *
 * Estrategia (cada ESCALAO pode jogar percurso diferente). Fontes, por ordem
 * de preferencia:
 *   1. member-history-slim.json -> byEscalao[escalao] traz course (nome),
 *      par[18] e yards[18] do tee jogado por esse escalao. Ground truth.
 *   2. Edicao anterior do mesmo escalao (quando a actual ainda nao tem course).
 *   3. Match por nome + tee contra simCourses (away-courses + extraCourses) por
 *      SOBREPOSICAO DE TOKENS + escolha do TEE do escalao (nome + distancia) ->
 *      slope/CR/SI reais (ex: Paris Boys 12 -> tee Bleus, CR 67.8 / Slope 119).
 *
 * resolveCourseTee() e exportado para a tab "Previsao" reutilizar.
 */
import { useMemo } from "react";
import CourseHeroCard from "../../ui/CourseHeroCard";
import { useAppContext } from "../../context/AppContext";
import type { Course, Tee } from "../../data/types";

interface FieldEscalao { nome: string }
interface FieldTorneio { t: number; name: string; date_inicio: string; escaloes: FieldEscalao[] }

interface MHEscalaoMeta { course?: string; yards?: number[]; par?: number[] }
interface MHTornMeta {
  name: string;
  startDate: string;
  holesPerRound: number;
  par: number[] | null;
  yards?: number[] | null;
  byEscalao?: Record<string, MHEscalaoMeta>;
}
interface MHSlim {
  torneios: Record<string, MHTornMeta>;
  jogadores: Record<string, unknown>;
}

/** Resultado da resolucao de campo/tee para um torneio+escalao. */
export interface ResolvedCourse {
  course: Course;
  tee: Tee;
  note?: string;
  /** true quando o CR/Slope foi estimado por interpolacao (tee sem rating oficial). */
  ratingApprox?: boolean;
}

/** Procura edicao anterior do MESMO baseName com course preenchido. */
function findPrevEdition(mh: MHSlim, torneio: FieldTorneio, escalao: string): MHEscalaoMeta | null {
  const baseName = torneio.name.replace(/\s+\d{4}\s*$/, "").trim();
  if (!baseName) return null;
  const candidates: Array<{ tcode: string; year: number; meta: MHEscalaoMeta }> = [];
  const currentYear = parseInt((torneio.name.match(/(\d{4})/) || ["", "0"])[1], 10);
  for (const [tc, meta] of Object.entries(mh.torneios)) {
    if (!meta?.name) continue;
    const mBase = meta.name.replace(/\s+\d{4}\s*$/, "").trim();
    if (mBase !== baseName) continue;
    if (/Parent\/Child/i.test(meta.name)) continue;
    const yMatch = meta.name.match(/(\d{4})/);
    if (!yMatch) continue;
    const year = parseInt(yMatch[1], 10);
    if (year >= currentYear) continue;
    const escMeta = meta.byEscalao?.[escalao];
    if (!escMeta?.course) continue;
    if (!escMeta?.par || !escMeta?.yards) continue;
    candidates.push({ tcode: tc, year, meta: escMeta });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.year - a.year);
  return candidates[0].meta;
}

// -- Matching campo<->campo por sobreposicao de tokens --------------------
const COURSE_STOPWORDS = new Set([
  "golf", "club", "course", "country", "the", "de", "do", "da", "of", "and",
  "g", "gc", "cc", "resort", "links",
]);

function courseTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(t => t.length >= 2 && !COURSE_STOPWORDS.has(t)),
  );
}

/** Encontra o Course em simCourses que melhor casa por sobreposicao de tokens.
 *  Ex: "Paris Val d'Europe Golf Course - Red/Blue" <-> "Golf Paris Val
 *  d'Europe Disneyland - RED/BLUE" partilham {paris,val,europe,red,blue}. */
function matchSimCourse(courseName: string, simCourses: Course[]): Course | null {
  const target = courseTokens(courseName);
  if (target.size === 0) return null;
  let best: { course: Course; score: number } | null = null;
  for (const c of simCourses) {
    const ct = courseTokens(c.master.name);
    if (ct.size === 0) continue;
    let inter = 0;
    for (const t of target) if (ct.has(t)) inter++;
    if (inter === 0) continue;
    const score = inter / Math.min(target.size, ct.size);
    const coverage = inter / target.size;
    if (coverage < 0.5) continue;
    if (!best || score > best.score) best = { course: c, score };
  }
  return best ? best.course : null;
}

// -- Seleccao do TEE especifico do escalao --------------------------------
/** Numeros de idade referidos no nome do tee.
 *  "Bleus / USKids Boys 12" -> {12}; "USKids Boys 15-18 / 13-14" ->
 *  {13,14,15,16,17,18}; "Rouges" -> {}. */
function teeAgeNumbers(teeName: string): Set<number> {
  const out = new Set<number>();
  const ranges = teeName.match(/\d+\s*-\s*\d+/g) || [];
  for (const r of ranges) {
    const [a, b] = r.split(/\s*-\s*/).map(Number);
    if (!isNaN(a) && !isNaN(b)) for (let n = Math.min(a, b); n <= Math.max(a, b); n++) out.add(n);
  }
  const cleaned = teeName.replace(/\d+\s*-\s*\d+/g, " ");
  for (const m of cleaned.match(/\d+/g) || []) out.add(parseInt(m, 10));
  return out;
}

/** Numeros de idade do escalao. "Boys 12" -> [12]; "Boys 10-11" -> [10,11];
 *  "U14" -> [14]; "Geral" -> []. */
function escalaoNumbers(esc: string): number[] {
  if (!esc) return [];
  const u = esc.match(/^U(\d+)$/i);
  if (u) return [parseInt(u[1], 10)];
  const r = esc.match(/(\d+)\s*[-&]\s*(\d+)/);
  if (r) {
    const a = parseInt(r[1], 10), b = parseInt(r[2], 10);
    const out: number[] = [];
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) out.push(n);
    return out;
  }
  const s = esc.match(/(\d+)/);
  return s ? [parseInt(s[1], 10)] : [];
}

const SEX_PREF: Record<string, number> = { M: 0, U: 1, F: 2 };

/** Melhor tee de `course` para um escalao (Manuel = rapaz). Criterios:
 *  (1) escalao nomeado no tee; (2) distancia total mais proxima; (3) M. */
function pickTeeForEscalao(course: Course, escalaoNome: string, targetMeters: number | null): Tee | null {
  const tees = course.master.tees || [];
  if (tees.length === 0) return null;
  const escNums = escalaoNumbers(escalaoNome);

  const scored = tees.map(tee => {
    const ageNums = teeAgeNumbers(tee.teeName);
    const named = escNums.length > 0 && escNums.some(n => ageNums.has(n));
    const total = tee.distances?.total ?? null;
    const distDelta = (targetMeters != null && total != null) ? Math.abs(total - targetMeters) : Infinity;
    return { tee, named, distDelta, sexPref: SEX_PREF[tee.sex] ?? 3 };
  });

  const named = scored.filter(s => s.named);
  const pool = named.length > 0 ? named : scored;
  pool.sort((a, b) => {
    if (a.distDelta !== b.distDelta) return a.distDelta - b.distDelta;
    return a.sexPref - b.sexPref;
  });
  return pool[0]?.tee ?? null;
}

/** Interpola CR/Slope por distancia a partir dos tees do campo COM rating
 *  oficial. Usado quando o tee do escalao nao tem rating publicado (ex: tees
 *  de torneio USKids intermedios). Prefere tees do mesmo sexo; extrapola se o
 *  alvo cair fora do intervalo dos tees rated. */
function interpolateRatings(course: Course, targetMeters: number | null, sex: string): { cr: number; slope: number } | null {
  if (targetMeters == null || targetMeters <= 0) return null;
  type Pt = { d: number; cr: number; slope: number };
  const collect = (filterSex: boolean): Pt[] => {
    const pts: Pt[] = [];
    for (const t of course.master.tees) {
      if (filterSex && t.sex !== sex) continue;
      const r = t.ratings.holes18;
      const d = t.distances?.total;
      if (r?.courseRating != null && r?.slopeRating != null && d != null && d > 0) {
        pts.push({ d, cr: r.courseRating, slope: r.slopeRating });
      }
    }
    return pts;
  };
  let pts = collect(true);
  if (pts.length < 2) pts = collect(false);
  if (pts.length < 2) return null;
  const byD = new Map<number, Pt>();
  for (const pt of pts) if (!byD.has(pt.d)) byD.set(pt.d, pt);
  const arr = [...byD.values()].sort((a, b) => a.d - b.d);
  if (arr.length < 2) return null;
  let lo = arr[0], hi = arr[1];
  if (targetMeters >= arr[arr.length - 1].d) { lo = arr[arr.length - 2]; hi = arr[arr.length - 1]; }
  else if (targetMeters > arr[0].d) {
    for (let i = 0; i < arr.length - 1; i++) {
      if (targetMeters >= arr[i].d && targetMeters <= arr[i + 1].d) { lo = arr[i]; hi = arr[i + 1]; break; }
    }
  }
  const span = hi.d - lo.d;
  const f = span === 0 ? 0 : (targetMeters - lo.d) / span;
  const cr = lo.cr + f * (hi.cr - lo.cr);
  let slope = Math.round(lo.slope + f * (hi.slope - lo.slope));
  slope = Math.max(55, Math.min(155, slope));
  return { cr: Math.round(cr * 10) / 10, slope };
}

/** Constroi Course/Tee a partir do slim (par/yards/courseName), enriquecido
 *  com slope/CR/SI do tee casado (escolhido pelo escalao) quando existe. O
 *  par/yards do slim manda; o tee casado fornece ratings + SI + nome/sexo. */
function buildCourseTee(
  courseName: string,
  par: number[],
  yards: number[],
  hpr: number,
  escalaoNome: string,
  simCourses: Course[],
): ResolvedCourse {
  const matchedCourse = matchSimCourse(courseName, simCourses);

  let targetMeters = 0;
  for (let i = 0; i < hpr; i++) {
    const y = yards[i] ?? 0;
    if (y > 0) targetMeters += Math.round(y * 0.9144);
  }
  const matchedTee = matchedCourse ? pickTeeForEscalao(matchedCourse, escalaoNome, targetMeters) : null;

  let slope = matchedTee?.ratings?.holes18?.slopeRating ?? null;
  let cr = matchedTee?.ratings?.holes18?.courseRating ?? null;
  let ratingApprox = false;
  if (matchedCourse && (slope == null || cr == null)) {
    const interp = interpolateRatings(
      matchedCourse,
      targetMeters > 0 ? targetMeters : (matchedTee?.distances?.total ?? null),
      matchedTee?.sex ?? "M",
    );
    if (interp) { cr = interp.cr; slope = interp.slope; ratingApprox = true; }
  }
  const country = matchedCourse?.master.country;
  const matchedSI: (number | null)[] = matchedTee ? matchedTee.holes.slice(0, hpr).map(h => h.si ?? null) : [];

  const holes = [];
  let totalDist = 0, f9Dist = 0, b9Dist = 0;
  for (let i = 0; i < hpr; i++) {
    const y = yards[i] ?? 0;
    const m = y > 0 ? Math.round(y * 0.9144) : 0;
    holes.push({ hole: i + 1, par: par[i] ?? null, si: matchedSI[i] ?? null, distance: m > 0 ? m : null });
    totalDist += m;
    if (i < 9) f9Dist += m; else b9Dist += m;
  }
  const parTotal = par.slice(0, hpr).reduce((a, b) => a + (b || 0), 0);
  const teeName = matchedTee?.teeName || (courseName.split("-").slice(-1)[0].trim() || courseName);

  const tee: Tee = {
    teeId: matchedTee?.teeId || ("synth-" + (courseName || "tee").replace(/\s+/g, "-").toLowerCase()),
    sex: matchedTee?.sex ?? "U",
    teeName,
    scorecardMeta: matchedTee?.scorecardMeta,
    ratings: { holes18: { par: parTotal || null, slopeRating: slope, courseRating: cr } },
    holes,
    distances: {
      total: totalDist > 0 ? totalDist : null,
      front9: f9Dist > 0 ? f9Dist : null,
      back9: b9Dist > 0 ? b9Dist : null,
      holesCount: hpr,
      complete18: hpr === 18,
    },
  };
  const course: Course = {
    courseKey: matchedCourse?.courseKey || ("synth-" + courseName.replace(/\s+/g, "-").toLowerCase()),
    master: {
      courseId: tee.teeId,
      name: matchedCourse?.master.name || courseName,
      country,
      links: matchedCourse?.master.links || { fpg: null, scorecards: null },
      tees: [tee],
    },
  };
  return { course, tee, ratingApprox };
}

/** Resolve {course, tee, note} para um torneio+escalao (cascata de fontes).
 *  Exportado para a tab "Previsao" reutilizar. */
export function resolveCourseTee(
  torneio: FieldTorneio | null,
  escalaoNome: string,
  mh: MHSlim | null,
  simCourses: Course[],
): ResolvedCourse | null {
  if (!torneio || !mh) return null;
  const meta = mh.torneios[String(torneio.t)];
  const hpr = (meta?.holesPerRound) || 18;

  const escMeta = meta?.byEscalao?.[escalaoNome];
  if (escMeta?.par && escMeta?.yards && escMeta?.course) {
    return buildCourseTee(escMeta.course, escMeta.par, escMeta.yards, hpr, escalaoNome, simCourses);
  }

  if (escMeta?.par && escMeta?.yards && !escMeta?.course) {
    const prev = findPrevEdition(mh, torneio, escalaoNome);
    if (prev?.course) {
      const r = buildCourseTee(prev.course, escMeta.par, escMeta.yards, hpr, escalaoNome, simCourses);
      return r; // mesmo campo/venue — par/yards são da edição actual
    }
    const r = buildCourseTee("Campo (a confirmar)", escMeta.par, escMeta.yards, hpr, escalaoNome, simCourses);
    return { ...r, note: "Aguarda confirmação oficial do campo" };
  }

  const prev = findPrevEdition(mh, torneio, escalaoNome);
  if (prev?.par && prev?.yards && prev?.course) {
    const r = buildCourseTee(prev.course, prev.par, prev.yards, hpr, escalaoNome, simCourses);
    return { ...r, note: "Dados da edição anterior" };
  }

  return null;
}

export default function CourseTab({ torneio, escalaoNome, mh }: {
  torneio: FieldTorneio | null;
  escalaoNome: string;
  mh: MHSlim | null;
}) {
  const ctx = useAppContext();
  const result = useMemo<ResolvedCourse | null>(
    () => resolveCourseTee(torneio, escalaoNome, mh, ctx.simCourses),
    [torneio, escalaoNome, mh, ctx.simCourses],
  );

  if (!torneio) {
    return <div className="muted p-16">Sem torneio selecionado.</div>;
  }
  if (!result) {
    return (
      <div className="muted p-16" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span>Sem informação detalhada de campo para este torneio/escalão.</span>
        <span style={{ fontSize: "var(--fs-11)" }}>
          Esta vista lê os dados do member-history-slim. Se o torneio é novo
          e ainda não foi scrapado, a info aparecerá depois do próximo run de
          <code style={{ margin: "0 4px", padding: "1px 4px", background: "var(--bg-muted)", borderRadius: 3 }}>fetch-uskids-results</code>.
        </span>
      </div>
    );
  }

  return (
    <div>
      {result.note && (
        <div className="muted fs-11 mb-8" style={{
          padding: "6px 10px",
          background: "var(--bg-warn-alpha, var(--bg-muted))",
          border: "1px solid var(--color-warn-alpha, var(--border))",
          borderRadius: 6,
        }}>
          {"⚠"} {result.note}
        </div>
      )}
      <CourseHeroCard course={result.course} tee={result.tee} />
    </div>
  );
}
