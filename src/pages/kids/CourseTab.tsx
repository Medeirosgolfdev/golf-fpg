/**
 * pages/kids/CourseTab.tsx
 *
 * Tab "O Campo" do FieldRivaisDashboard. Reutiliza o CourseHeroCard
 * (mesmo componente da página /comparar) e seleciona o campo+tee a partir
 * do torneio + escalão actualmente escolhidos.
 *
 * Estratégia de mapeamento torneio→campo:
 *   1. Lookup hardcoded por baseName (do nome do torneio) + escalão. Coloca os
 *      casos conhecidos onde sabemos que o tee USKids específico está em
 *      `extraCourses.ts` (Glen Golf "Uskids Boys 12" / "Uskids Boys 14", etc).
 *   2. Fallback: tentar bater pelo `course` registado em member-history-slim
 *      (mh.torneios[tcode].byEscalao[escalao].course) contra os campos
 *      conhecidos no AppContext.
 *
 * Mantemos o mapping aqui local — quando o leque de torneios mapeados crescer,
 * passa para o `extraCourses.ts` ou para um JSON dedicado.
 */
import React, { useMemo } from "react";
import CourseHeroCard from "../../ui/CourseHeroCard";
import { useAppContext } from "../../context/AppContext";
import type { Course, Tee } from "../../data/types";

interface FieldPlayer { nome: string; pais: string }
interface FieldEscalao { nome: string; jogadores?: FieldPlayer[] }
interface FieldTorneio { t: number; name: string; date_inicio: string; escaloes: FieldEscalao[] }

interface MHEscalaoMeta { course?: string; yards?: number[]; par?: number[] }
interface MHSlim {
  torneios: Record<string, {
    name: string;
    startDate: string;
    holesPerRound: number;
    par: number[] | null;
    yards?: number[] | null;
    byEscalao?: Record<string, MHEscalaoMeta>;
  }>;
}

/** Lookup: baseName + escalão → courseKey + teeName (case-insensitive em teeName). */
interface CourseMapping { baseRegex: RegExp; escalao: string; courseKey: string; teeName: string }
const COURSE_MAPPINGS: CourseMapping[] = [
  // European Championship 2026 — Glen Golf Club (Escócia)
  { baseRegex: /european championship/i, escalao: "Boys 12",  courseKey: "away-glen-golf-course", teeName: "uskids boys 12" },
  { baseRegex: /european championship/i, escalao: "Boys 14",  courseKey: "away-glen-golf-course", teeName: "uskids boys 14" },
  { baseRegex: /european championship/i, escalao: "Girls 12", courseKey: "away-glen-golf-course", teeName: "uskids girls 12" },
];

function findCourseAndTee(
  torneio: FieldTorneio,
  escalao: string,
  simCourses: Course[],
  mh: MHSlim | null,
): { course: Course; tee: Tee } | null {
  // 1) Lookup hardcoded
  for (const m of COURSE_MAPPINGS) {
    if (!m.baseRegex.test(torneio.name)) continue;
    if (m.escalao !== escalao) continue;
    const course = simCourses.find(c => c.courseKey === m.courseKey);
    if (!course) continue;
    const tee = course.master.tees.find(t =>
      t.teeName?.toLowerCase().trim() === m.teeName.toLowerCase().trim()
    );
    if (tee) return { course, tee };
    // sem tee específico, mostrar primeiro
    if (course.master.tees.length > 0) return { course, tee: course.master.tees[0] };
  }

  // 2) Fallback: tentar bater pelo course do member-history-slim
  if (mh && torneio.t >= 0) {
    const meta = mh.torneios[String(torneio.t)];
    const escMeta = meta?.byEscalao?.[escalao];
    const courseName = escMeta?.course?.trim();
    if (courseName) {
      const match = simCourses.find(c =>
        c.master.name?.toLowerCase().trim() === courseName.toLowerCase()
      );
      if (match && match.master.tees.length > 0) {
        return { course: match, tee: match.master.tees[0] };
      }
    }
  }

  return null;
}

export default function CourseTab({ torneio, escalaoNome, mh }: {
  torneio: FieldTorneio | null;
  escalaoNome: string;
  mh: MHSlim | null;
}) {
  const ctx = useAppContext();
  const selection = useMemo(() => {
    if (!torneio) return null;
    return findCourseAndTee(torneio, escalaoNome, ctx.simCourses, mh);
  }, [torneio, escalaoNome, ctx.simCourses, mh]);

  if (!torneio) {
    return <div className="muted p-16">Sem torneio selecionado.</div>;
  }
  if (!selection) {
    return (
      <div className="muted p-16" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span>Sem informação detalhada de campo para este torneio/escalão.</span>
        <span style={{ fontSize: 11 }}>
          Para mostrar aqui o hero do campo, adicionar uma entrada em
          <code style={{ margin: "0 4px", padding: "1px 4px", background: "var(--bg-muted)", borderRadius: 3 }}>
            COURSE_MAPPINGS
          </code>
          (em <code>src/pages/kids/CourseTab.tsx</code>) com o <em>baseName</em>
          do torneio, <em>escalão</em>, <em>courseKey</em> e <em>teeName</em>.
        </span>
      </div>
    );
  }

  return (
    <div>
      <CourseHeroCard course={selection.course} tee={selection.tee} />
    </div>
  );
}
