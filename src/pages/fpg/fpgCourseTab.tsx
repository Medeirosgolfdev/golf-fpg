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
import type { Course, Tee } from "../../data/types";
import type { Tournament } from "../../data/fpgTypes";
import type { ResolvedCourse } from "../kids/CourseTab";
import { CoursesGate, useCourses } from "../../context/CoursesContext";
import { canonicalCourseName, resolveCourseKeyByName } from "../../utils/courseAliases";
import { norm, escalaoAtDate, todayIso } from "../../utils/format";
import { isManuel, MANUEL_DOB } from "../../constants/manuel";
import { tournamentHasManuel } from "../../data/fpgUtils";
import { teeRuleFor, teeNameFor, parseSubNumber } from "../../utils/teeRegulation";
import LoadingState from "../../ui/LoadingState";

const CourseComoJogou = lazy(() => import("../CamposPage").then((m) => ({ default: m.CourseComoJogou })));
const PrevisaoTab = lazy(() => import("../kids/PrevisaoTab"));

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

/** O tee do campo com este nome — o de homens primeiro (o Manuel). */
function findTee(course: Course, teeName: string): Tee | null {
  const k = norm(teeName);
  const tees = course.master.tees.filter((t) => norm(t.teeName) === k);
  return tees.find((t) => t.sex === "M") ?? tees.find((t) => t.sex !== "F") ?? tees[0] ?? null;
}

type DrawLite = Record<string, { groups?: { tee?: string | null; players?: { nome?: string; fed?: string | null; tee?: string | null }[] }[] }>;

/** De que tee joga o Manuel nesta prova: o do draw → o das voltas jogadas → o
 *  regulamento da prova / a tabela FPG pelo escalão dele à data. null = não está
 *  na prova (ou não se sabe). */
export function manuelTeeNaProva(t: Tournament | null | undefined): string | null {
  if (!t) return null;
  for (const d of Object.values((t as { _draws?: DrawLite })._draws ?? {})) {
    for (const g of d?.groups ?? []) {
      const p = (g.players ?? []).find((x) => isManuel({ name: x.nome, fed: x.fed ?? undefined }));
      const tee = p && (p.tee || g.tee);
      if (tee) return tee;
    }
  }
  const jogou = (t.players ?? []).find((p) => isManuel(p as never));
  const teeJogado = jogou && ((jogou.roundScores ?? []).map((r) => r.teeName).find(Boolean) || jogou.teeName);
  if (teeJogado) return teeJogado;
  if (!tournamentHasManuel(t)) return null;
  const dob = `${MANUEL_DOB.year}-${String(MANUEL_DOB.month + 1).padStart(2, "0")}-${String(MANUEL_DOB.day).padStart(2, "0")}`;
  const esc = escalaoAtDate(dob, t.date || todayIso());
  const regra = teeRuleFor(t.ccode, String(t.tcode ?? ""));
  return (regra ? regra(parseSubNumber(esc), "M") : teeNameFor(esc ?? undefined, "M")) ?? null;
}

function PrevisaoDaProva({ courseKey, teeId }: { courseKey: string; teeId: string }) {
  const { simCourses } = useCourses();
  const resolved = useMemo<ResolvedCourse | null>(() => {
    const course = simCourses.find((c) => c.courseKey === courseKey);
    const tee = course?.master.tees.find((t) => t.teeId === teeId);
    return course && tee ? { course, tee } : null;
  }, [simCourses, courseKey, teeId]);
  return (
    <Suspense fallback={<LoadingState size="sm" message="A preparar a previsão…" />}>
      <div className="mt-8"><PrevisaoTab resolved={resolved} /></div>
    </Suspense>
  );
}

type Aba = { key: string; label: string; content: React.ReactNode };

/** As abas «⛳ O campo» e «🔮 Previsão» da prova (a do Kids 2: o Manuel no tee
 *  dele neste campo — régua WHS, plano por buraco, alcance). O campo, quando é
 *  conhecido; a previsão, quando também se sabe o tee do Manuel e ele existe no
 *  campo. Vazio enquanto se procura. `campo` vazio/null → não procura nada. */
export function useCampoTabs(campo: string | null | undefined, manuelTee?: string | null): Aba[] {
  const nome = campo?.trim() || "";
  const tee = manuelTee?.trim() || "";
  const [found, setFound] = useState<{ q: string; key: string | null; teeId: string | null } | null>(null);
  const q = `${nome}|${tee}`;
  useEffect(() => {
    if (!nome) return;
    let alive = true;
    import("../../data/courses")
      .then((m) => m.loadCourses())
      .then(({ simCourses }) => {
        if (!alive) return;
        const c = findCourseByName(simCourses, nome);
        setFound({ q, key: c?.courseKey ?? null, teeId: (c && tee && findTee(c, tee)?.teeId) || null });
      })
      .catch(() => { if (alive) setFound({ q, key: null, teeId: null }); });
    return () => { alive = false; };
  }, [nome, tee, q]);
  const cur = found && found.q === q ? found : null;
  const key = cur?.key ?? null;
  const teeId = cur?.teeId ?? null;
  return useMemo(() => {
    if (!key) return [];
    const abas: Aba[] = [{
      key: "campo",
      label: "⛳ O campo",
      content: <CoursesGate withPlayers><CampoDaProva courseKey={key} /></CoursesGate>,
    }];
    if (teeId) abas.push({
      key: "previsao",
      label: "🔮 Previsão",
      content: <CoursesGate><PrevisaoDaProva courseKey={key} teeId={teeId} /></CoursesGate>,
    });
    return abas;
  }, [key, teeId]);
}
