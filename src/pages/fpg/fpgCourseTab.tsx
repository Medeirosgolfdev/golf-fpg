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
import { createContext, lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Course, Tee } from "../../data/types";
import type { Tournament } from "../../data/fpgTypes";
import type { ResolvedCourse } from "../kids/CourseTab";
import type { JogadorNoTee } from "../kids/PrevisaoTab";
import { useFedBirthdates, useFedGenders, useFedHcp } from "../../ui/InscricoesComponents";
import { formatPlayerName } from "../../utils/playerUtils";
import { normName } from "../../utils/normName";
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
  return teePeloEscalao(t);
}

/** O tee que caberia ao Manuel pelo escalão dele à data da prova (regulamento
 *  da prova / tabela FPG) — também quando ele NÃO está na prova: a Previsão
 *  aparece sempre que o campo é conhecido, com o tee à escolha (04/11/2026). */
export function teePeloEscalao(t: Tournament): string | null {
  const dob = `${MANUEL_DOB.year}-${String(MANUEL_DOB.month + 1).padStart(2, "0")}-${String(MANUEL_DOB.day).padStart(2, "0")}`;
  const esc = escalaoAtDate(dob, t.date || todayIso());
  const regra = teeRuleFor(t.ccode, String(t.tcode ?? ""));
  return (regra ? regra(parseSubNumber(esc), "M") : teeNameFor(esc ?? undefined, "M")) ?? null;
}

type DrawPlayers = Record<string, { groups?: { tee?: string | null; players?: { nome?: string; fed?: string | null; tee?: string | null }[] }[] }>;

/** Os jogadores da prova que saem do MESMO tee que o Manuel, com o índice de
 *  cada um (para a «🔮 Previsão» os pôr em gross «ao handicap» neste tee).
 *  Tee de cada um: o das voltas jogadas → o do draw → o do regulamento da
 *  prova / tabela FPG pelo escalão (nascimento à data) e sexo. Índice: o de
 *  hoje (federados) → o da inscrição / da prova. Antes dos resultados, só os
 *  inscritos confirmados (nem reservas nem desistentes). */
export function jogadoresNoTee(
  t: Tournament, tee: string,
  m: { dob: Map<string, string>; sex: Map<string, "M" | "F">; hcp: Map<string, number> },
): JogadorNoTee[] {
  const alvo = norm(tee);
  const regra = teeRuleFor(t.ccode, String(t.tcode ?? ""));
  const doDraw = new Map<string, string>();
  for (const d of Object.values((t as { _draws?: DrawPlayers })._draws ?? {})) {
    for (const g of d?.groups ?? []) {
      for (const p of g.players ?? []) {
        const tt = p.tee || g.tee;
        if (tt) doDraw.set(p.fed || normName(p.nome || ""), tt);
      }
    }
  }
  const teeDe = (fed: string | null, nome: string, escalao?: string | null): string | null => {
    const d = doDraw.get(fed || normName(nome));
    if (d) return d;
    const esc = escalao || (fed ? escalaoAtDate(m.dob.get(fed), t.date || todayIso()) : null);
    const sex = fed ? m.sex.get(fed) : undefined;
    if (!esc) return null;
    return (regra ? regra(parseSubNumber(esc), sex) : teeNameFor(esc, sex)) ?? null;
  };
  const out: JogadorNoTee[] = [];
  const vistos = new Set<string>();
  const junta = (nome: string, fed: string | null, club: string | null, hi: number | null, teeJogador: string | null) => {
    const manuel = isManuel({ name: nome, fed: fed ?? undefined });
    const key = fed || normName(nome);
    if (vistos.has(key)) return;
    if (!manuel && norm(teeJogador || "") !== alvo) return;
    vistos.add(key);
    out.push({ key, name: formatPlayerName(nome), fed, club, hi, isManuel: manuel, sex: manuel ? "M" : (fed ? m.sex.get(fed) ?? null : null) });
  };
  if ((t.players ?? []).length > 0) {
    for (const p of t.players) {
      const fed = p.fed || p.fedCode || null;
      const jogado = (p.roundScores ?? []).map((r) => r.teeName).find(Boolean) || p.teeName || null;
      junta(p.name, fed, p.club || null, (fed ? m.hcp.get(fed) : undefined) ?? p.hcpExact ?? null, jogado || teeDe(fed, p.name, p.escalao));
    }
  } else {
    for (const p of t._admissions?.players ?? []) {
      // Só quem joga: fora os desistentes e as «reservas» (lista de espera, ou
      // apurados da Final ainda por inscrever — crossApuradosInscritos). O
      // Manuel fica sempre (a previsão é dele).
      if ((p.status === "desistente" || p.status === "reserva") && !isManuel({ name: p.nome, fed: p.fed ?? undefined })) continue;
      const teeTexto = p.teeName && !/\d\s*m$/i.test(p.teeName) ? p.teeName : null;
      junta(p.nome, p.fed, p.clube, (p.fed ? m.hcp.get(p.fed) : undefined) ?? p.hcp ?? null, teeTexto || teeDe(p.fed, p.nome, p.escalao));
    }
  }
  return out;
}

/** De onde veio o tee inicial da Previsão. */
type TeeFonte = "prova" | "escalao" | "nenhum";

function PrevisaoDaProva({ courseKey, teeId, tournament, fonte, teeSugerido }: {
  courseKey: string; teeId: string; tournament: Tournament; fonte: TeeFonte; teeSugerido: string;
}) {
  const { simCourses } = useCourses();
  const dob = useFedBirthdates();
  const sex = useFedGenders();
  const hcp = useFedHcp();
  // O tee inicial (o do Manuel / o do escalão dele) e a nota de onde veio; a
  // caixa para mudar de tee é da própria PrevisaoTab (a mesma no Kids 2 —
  // 04/11/2026, «porque é que não são o mesmo módulo»).
  const resolved = useMemo<ResolvedCourse | null>(() => {
    const course = simCourses.find((c) => c.courseKey === courseKey);
    const tee = course?.master.tees.find((t) => t.teeId === teeId);
    if (!course || !tee) return null;
    const note = fonte === "escalao" ? `O Manuel não está nesta prova — o tee que lhe caberia pelo escalão (${teeSugerido}). Muda-se na caixa «Tee».`
      : fonte === "nenhum" ? "Não se sabe o tee do Manuel aqui — escolhe-se na caixa «Tee»."
      : undefined;
    return { course, tee, note };
  }, [simCourses, courseKey, teeId, fonte, teeSugerido]);
  // O field é o do tee à vista (o escolhido na caixa).
  const [teeNome, setTeeNome] = useState("");
  const onTee = useCallback((t: { teeName: string }) => setTeeNome(t.teeName), []);
  const field = useMemo(() => jogadoresNoTee(tournament, teeNome || resolved?.tee.teeName || "", { dob, sex, hcp }), [tournament, teeNome, resolved, dob, sex, hcp]);
  return (
    <Suspense fallback={<LoadingState size="sm" message="A preparar a previsão…" />}>
      <div className="mt-8"><PrevisaoTab resolved={resolved} field={field.length > 1 ? field : undefined} onTee={onTee} /></div>
    </Suspense>
  );
}

type Aba = { key: string; label: string; content: React.ReactNode };

/** As abas «⛳ O campo» e «🔮 Previsão» da prova (a do Kids 2: o Manuel no tee
 *  dele neste campo — régua WHS, plano por buraco, alcance). As duas sempre que
 *  o campo é conhecido (04/11/2026); a Previsão começa no tee do Manuel na prova
 *  → o do escalão dele (quando não está na prova) → o 1.º tee de homens, e
 *  muda-se de tee numa caixa. Vazio enquanto se procura. `campo` vazio/null →
 *  não procura nada. */
export function useCampoTabs(campo: string | null | undefined, manuelTee: string | null | undefined, tournament: Tournament): Aba[] {
  const nome = campo?.trim() || "";
  // Sem o tee do Manuel na prova, o do escalão dele (ele não está na prova).
  const teeProva = manuelTee?.trim() || "";
  const teeEsc = teeProva ? "" : (teePeloEscalao(tournament) ?? "");
  const tee = teeProva || teeEsc;
  const fonte: TeeFonte = teeProva ? "prova" : teeEsc ? "escalao" : "nenhum";
  const [found, setFound] = useState<{ q: string; key: string | null; teeId: string | null; exacto?: boolean } | null>(null);
  const q = `${nome}|${tee}`;
  useEffect(() => {
    if (!nome) return;
    let alive = true;
    import("../../data/courses")
      .then((m) => m.loadCourses())
      .then(({ simCourses }) => {
        if (!alive) return;
        const c = findCourseByName(simCourses, nome);
        // O tee pedido; sem ele no campo, o 1.º tee de homens (escolhe-se na caixa).
        const t0 = (c && tee && findTee(c, tee)) || c?.master.tees.find((x) => x.sex !== "F") || c?.master.tees[0] || null;
        setFound({ q, key: c?.courseKey ?? null, teeId: t0?.teeId ?? null, exacto: !!(c && tee && findTee(c, tee)) });
      })
      .catch(() => { if (alive) setFound({ q, key: null, teeId: null, exacto: false }); });
    return () => { alive = false; };
  }, [nome, tee, q]);
  const cur = found && found.q === q ? found : null;
  const key = cur?.key ?? null;
  const teeId = cur?.teeId ?? null;
  const fonteFinal: TeeFonte = cur?.exacto ? fonte : "nenhum";
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
      content: <CoursesGate><PrevisaoDaProva courseKey={key} teeId={teeId} tournament={tournament} fonte={fonteFinal} teeSugerido={tee} /></CoursesGate>,
    });
    return abas;
  }, [key, teeId, tournament, tee, fonteFinal]);
}
