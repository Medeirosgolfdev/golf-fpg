/**
 * pages/kids/CourseTab.tsx
 *
 * Tab "O Campo" do FieldRivaisDashboard.
 *
 * Estratégia (cada ESCALÃO pode jogar percurso diferente — Venice Open 2025
 * Boys 9 joga Della Montecchia Green/White; Boys 12 joga White/Red; Boys 13+
 * jogam Frassanelle; Boys 7-8 jogam Galzignano). Logo NÃO podemos usar um
 * mapping fixo por torneio: temos de tirar a info ESPECÍFICA do escalão.
 *
 * Fontes, por ordem de preferência:
 *
 *   1. member-history-slim.json — `mh.torneios[tcode].byEscalao[escalao]`
 *      traz course (nome), par[18] e yards[18] específicos do tee jogado por
 *      esse escalão nessa edição. É a fonte autoritativa.
 *
 *   2. Edição anterior do mesmo escalão — se a edição actual ainda não tem
 *      `course` registado (caso de torneios futuros como Venice 2026),
 *      reutiliza-se a informação da edição imediatamente anterior do MESMO
 *      escalão, com badge "provável".
 *
 *   3. Match por nome contra `simCourses` — quando o slim dá um `course`,
 *      tentamos casar com um Course conhecido para enriquecer com
 *      slope/CR (que o slim não traz). Best-effort: se não houver match
 *      exacto, mostramos só o que vem do slim.
 *
 * O par/yards do slim é o "ground truth"; o slope/CR é cosmético.
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

/** Procura edição anterior do MESMO baseName que tenha course preenchido
 *  para o escalão dado. Usado quando edição actual ainda não tem (futuro). */
function findPrevEdition(mh: MHSlim, torneio: FieldTorneio, escalao: string): MHEscalaoMeta | null {
  const baseName = torneio.name.replace(/\s+\d{4}\s*$/, "").trim();
  if (!baseName) return null;
  // Ordenar tcodes por ano desc
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
    if (year >= currentYear) continue; // só anteriores
    const escMeta = meta.byEscalao?.[escalao];
    if (!escMeta?.course) continue;
    if (!escMeta?.par || !escMeta?.yards) continue;
    candidates.push({ tcode: tc, year, meta: escMeta });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.year - a.year);
  return candidates[0].meta;
}

/** Tenta encontrar um Course/Tee em simCourses cujo nome bata com o curso do
 *  slim. Devolve {course, tee} (tee escolhido pelo melhor match) ou null. */
function matchSimCourse(courseName: string, simCourses: Course[]): { course: Course; tee: Tee } | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const target = norm(courseName);
  // Match exacto
  for (const c of simCourses) {
    if (norm(c.master.name) === target) {
      const tee = c.master.tees[0];
      if (tee) return { course: c, tee };
    }
  }
  // Match parcial: o nome do curso do slim CONTIDO no nome do simCourse,
  // ou vice-versa. Ex: "Golf Club Della Montecchia - White/Red" do slim
  // contém "Golf Club Della Montecchia" do simCourse.
  let best: { course: Course; score: number } | null = null;
  for (const c of simCourses) {
    const cname = norm(c.master.name);
    if (target.includes(cname) || cname.includes(target)) {
      const score = Math.min(target.length, cname.length);
      if (!best || score > best.score) best = { course: c, score };
    }
  }
  if (best && best.course.master.tees.length > 0) {
    return { course: best.course, tee: best.course.master.tees[0] };
  }
  return null;
}

/** Constrói um Course/Tee sintético a partir dos dados do slim
 *  (par[], yards[], courseName). slopeRating/courseRating são enriquecidos
 *  do simCourse correspondente quando existe; senão null. */
function buildSyntheticCourseTee(
  courseName: string,
  par: number[],
  yards: number[],
  hpr: number,
  simCourses: Course[],
): { course: Course; tee: Tee } {
  // Enriquecer slope/CR via match com simCourses
  const matched = matchSimCourse(courseName, simCourses);
  const slope = matched?.tee.ratings?.holes18?.slopeRating ?? null;
  const cr = matched?.tee.ratings?.holes18?.courseRating ?? null;
  const country = matched?.course.master.country;

  // Construir holes
  const holes = [];
  let totalDist = 0;
  let f9Dist = 0;
  let b9Dist = 0;
  for (let i = 0; i < hpr; i++) {
    const y = yards[i] ?? 0;
    const m = y > 0 ? Math.round(y * 0.9144) : 0;
    holes.push({
      hole: i + 1,
      par: par[i] ?? null,
      si: null,
      distance: m > 0 ? m : null,
    });
    totalDist += m;
    if (i < 9) f9Dist += m; else b9Dist += m;
  }
  const parTotal = par.slice(0, hpr).reduce((a, b) => a + (b || 0), 0);

  const tee: Tee = {
    teeId: "synth-" + (courseName || "tee").replace(/\s+/g, "-").toLowerCase(),
    sex: "U",
    teeName: courseName.split("-").slice(-1)[0].trim() || courseName,
    ratings: {
      holes18: {
        par: parTotal || null,
        slopeRating: slope,
        courseRating: cr,
      },
    },
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
    courseKey: "synth-" + courseName.replace(/\s+/g, "-").toLowerCase(),
    master: {
      courseId: tee.teeId,
      name: courseName,
      country,
      links: { fpg: null, scorecards: null },
      tees: [tee],
    },
  };
  return { course, tee };
}

export default function CourseTab({ torneio, escalaoNome, mh }: {
  torneio: FieldTorneio | null;
  escalaoNome: string;
  mh: MHSlim | null;
}) {
  const ctx = useAppContext();
  const result = useMemo<{
    course: Course;
    tee: Tee;
    note?: string;
  } | null>(() => {
    if (!torneio || !mh) return null;
    const meta = mh.torneios[String(torneio.t)];
    const hpr = (meta?.holesPerRound) || 18;

    // 1) Slim — escalão actual da edição actual
    const escMeta = meta?.byEscalao?.[escalaoNome];
    if (escMeta?.par && escMeta?.yards && escMeta?.course) {
      const r = buildSyntheticCourseTee(escMeta.course, escMeta.par, escMeta.yards, hpr, ctx.simCourses);
      return { ...r };
    }

    // 2) Edição actual sem course mas com par+yards (caso típico de futuros) →
    //    procurar edição anterior do mesmo escalão para tirar o course-name.
    if (escMeta?.par && escMeta?.yards && !escMeta?.course) {
      const prev = findPrevEdition(mh, torneio, escalaoNome);
      if (prev?.course) {
        // Usar par/yards da edição ACTUAL (podem ter mudado) com course-name
        // da anterior como aproximação.
        const r = buildSyntheticCourseTee(prev.course, escMeta.par, escMeta.yards, hpr, ctx.simCourses);
        return { ...r, note: "Campo da edição anterior (a confirmar)" };
      }
      // Sem prev — mostrar só par/yards (course = "Campo a confirmar")
      const r = buildSyntheticCourseTee("Campo (a confirmar)", escMeta.par, escMeta.yards, hpr, ctx.simCourses);
      return { ...r, note: "Aguarda confirmação oficial do campo" };
    }

    // 3) Edição actual sem nada → tentar edição anterior totalmente
    const prev = findPrevEdition(mh, torneio, escalaoNome);
    if (prev?.par && prev?.yards && prev?.course) {
      const r = buildSyntheticCourseTee(prev.course, prev.par, prev.yards, hpr, ctx.simCourses);
      return { ...r, note: "Dados da edição anterior" };
    }

    return null;
  }, [torneio, escalaoNome, mh, ctx.simCourses]);

  if (!torneio) {
    return <div className="muted p-16">Sem torneio selecionado.</div>;
  }
  if (!result) {
    return (
      <div className="muted p-16" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span>Sem informação detalhada de campo para este torneio/escalão.</span>
        <span style={{ fontSize: 11 }}>
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
          ⚠ {result.note}
        </div>
      )}
      <CourseHeroCard course={result.course} tee={result.tee} />
    </div>
  );
}
