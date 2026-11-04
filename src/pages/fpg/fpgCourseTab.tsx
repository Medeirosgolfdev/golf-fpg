/**
 * src/pages/fpg/fpgCourseTab.tsx — a aba «⛳ O campo» do detalhe de torneio
 * (26/10/2026, pedido da Mariana na Taça Presidente: «não dizes qual é o campo
 * nem temos um tab com os resultados do Manuel neste campo… no fundo o que já
 * temos em /campos»).
 *
 * Desde 04/11/2026 vive no `TournamentDetail` — aparece em TODAS as páginas de
 * torneio (FPG, Drive, MAJOR, França, Espanha, USKids…) sempre que o campo da
 * prova é conhecido na lista de campos («quero que o campo exista sempre que
 * for conhecido»). Campo desconhecido = sem aba.
 *
 * Mostra o MESMO «Como jogou» da /campos (`CourseComoJogou`: recordes por tee,
 * quem jogou por tee e a média por buraco do Manuel). Para decidir se a aba
 * existe carregam-se só os campos (master + away, sem o course-players); o
 * «quem jogou» (~10 MB) vem pelo `CoursesGate withPlayers` só ao abrir a aba.
 * Também para provas que ainda não se jogaram: o campo resolve-se pelo nome.
 */
import { createContext, lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Course } from "../../data/types";
import { CoursesGate, useCourses } from "../../context/CoursesContext";
import { canonicalCourseName, resolveCourseKeyByName } from "../../utils/courseAliases";
import { norm } from "../../utils/format";
import LoadingState from "../../ui/LoadingState";

const CourseComoJogou = lazy(() => import("../CamposPage").then((m) => ({ default: m.CourseComoJogou })));

const ckey = (s: string) => norm(canonicalCourseName(s) || s);

/** O campo do torneio no cabeçalho do circuito (`CircuitEntry.course`), para
 *  quando o torneio de um escalão não traz `campo` (MAJOR, fontes de fora). */
export const CampoDoCircuito = createContext<string | undefined>(undefined);

/** O nome inteiro e cada parte dele: as provas juntam muitas vezes o clube ao
 *  campo («Oeiras Green Valley / Academia Municipal de Golfe»). E «clube - nine-nine»,
 *  a forma que os combos (Santo da Serra «… | Machico Serras») resolvem pelo nome. */
function nomesCandidatos(campo: string): string[] {
  const nome = campo.trim();
  const partes = nome.split(/\s+[/|–—-]\s+|\s*\(|\)\s*/).map((s) => s.trim()).filter(Boolean);
  const combo = partes.length === 2 ? [`${partes[0]} - ${partes[1].replace(/\s+/g, "-")}`] : [];
  return [...new Set([nome, ...combo, ...partes])];
}

/** O campo da lista com este nome (aliases, nome do master, ou uma das partes). */
export function findCourseByName(courses: readonly Course[], campo: string): Course | null {
  for (const nome of nomesCandidatos(campo)) {
    const key = resolveCourseKeyByName(nome);
    const c = (key && courses.find((x) => x.courseKey === key))
      || courses.find((x) => ckey(x.master.name) === ckey(nome));
    if (c) return c;
  }
  return null;
}

function CampoDaProva({ courseKey }: { courseKey: string }) {
  const { simCourses } = useCourses();
  const navigate = useNavigate();
  const course = useMemo(() => simCourses.find((c) => c.courseKey === courseKey) ?? null, [simCourses, courseKey]);
  if (!course) return null;
  return (
    <div className="mt-8">
      <div className="muted fs-11 mb-8">
        <a href={`/campos/${course.courseKey}?view=manuel`} className="tourn-ext-link" title="Abrir a página do campo"
          onClick={(e) => { e.preventDefault(); navigate(`/campos/${course.courseKey}?view=manuel`); }}>
          ⛳ {course.master.name} ↗
        </a>{" "}
        — o mesmo «Como jogou» da página do campo.
      </div>
      <Suspense fallback={<LoadingState size="sm" message="A carregar o campo…" />}>
        <CourseComoJogou course={course} onSelectPlayer={(fed) => navigate(`/jogadores/${fed}`)} />
      </Suspense>
    </div>
  );
}

/** A aba «⛳ O campo» da prova, quando o campo é conhecido (null enquanto se
 *  procura e quando não se encontra). `campo` vazio/null → não procura nada. */
export function useCampoTab(campo: string | null | undefined): { key: string; label: string; content: React.ReactNode } | null {
  const nome = campo?.trim() || "";
  const [found, setFound] = useState<{ nome: string; key: string | null } | null>(null);
  useEffect(() => {
    if (!nome) return;
    let alive = true;
    import("../../data/courses")
      .then((m) => m.loadCourses())
      .then(({ simCourses }) => { if (alive) setFound({ nome, key: findCourseByName(simCourses, nome)?.courseKey ?? null }); })
      .catch(() => { if (alive) setFound({ nome, key: null }); });
    return () => { alive = false; };
  }, [nome]);
  const key = found && found.nome === nome ? found.key : null;
  return useMemo(() => key ? {
    key: "campo",
    label: "⛳ O campo",
    content: <CoursesGate withPlayers><CampoDaProva courseKey={key} /></CoursesGate>,
  } : null, [key]);
}
