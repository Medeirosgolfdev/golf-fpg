/**
 * src/pages/fpg/fpgCourseTab.tsx — a aba «⛳ O campo» das provas da /FPG
 * (26/10/2026, pedido da Mariana na Taça Presidente: «não dizes qual é o campo
 * nem temos um tab com os resultados do Manuel neste campo… no fundo o que já
 * temos em /campos»).
 *
 * Mostra o MESMO «Como jogou» da /campos (`CourseComoJogou`: recordes por tee,
 * quem jogou por tee e a média por buraco do Manuel) para o campo da prova —
 * carregado só ao abrir a aba (a /campos é um módulo à parte e os campos
 * ~13 MB + course-players ~10 MB vêm pelo `CoursesGate`). Também para provas
 * que ainda não se jogaram: o campo resolve-se pelo nome.
 */
import { lazy, Suspense, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Tournament } from "../../data/fpgTypes";
import { CoursesGate, useCourses } from "../../context/CoursesContext";
import { canonicalCourseName, resolveCourseKeyByName } from "../../utils/courseAliases";
import { norm } from "../../utils/format";
import LoadingState from "../../ui/LoadingState";

const CourseComoJogou = lazy(() => import("../CamposPage").then((m) => ({ default: m.CourseComoJogou })));

const ckey = (s: string) => norm(canonicalCourseName(s) || s);

function CampoDaProva({ campo }: { campo: string }) {
  const { simCourses } = useCourses();
  const navigate = useNavigate();
  const course = useMemo(() => {
    const key = resolveCourseKeyByName(campo);
    return (key && simCourses.find((c) => c.courseKey === key))
      || simCourses.find((c) => ckey(c.master.name) === ckey(campo))
      || null;
  }, [simCourses, campo]);
  if (!course) {
    return <div className="notice notice-info mt-8">Não encontrei o campo «{campo}» na lista de campos.</div>;
  }
  return (
    <div className="mt-8">
      <div className="muted fs-11 mb-8">
        <a href={`/campos/${course.courseKey}?view=manuel`} onClick={(e) => { e.preventDefault(); navigate(`/campos/${course.courseKey}?view=manuel`); }}>
          {course.master.name} ↗
        </a>{" "}
        — o mesmo «Como jogou» da página do campo.
      </div>
      <Suspense fallback={<LoadingState size="sm" message="A carregar o campo…" />}>
        <CourseComoJogou course={course} onSelectPlayer={(fed) => navigate(`/jogadores/${fed}`)} />
      </Suspense>
    </div>
  );
}

/** A aba, quando a prova tem campo conhecido. */
export function fpgCourseTabs(t: Tournament | null | undefined): { key: string; label: string; content: React.ReactNode }[] | undefined {
  const campo = t?.campo?.trim();
  if (!campo) return undefined;
  return [{
    key: "campo",
    label: "⛳ O campo",
    content: <CoursesGate withPlayers><CampoDaProva campo={campo} /></CoursesGate>,
  }];
}
