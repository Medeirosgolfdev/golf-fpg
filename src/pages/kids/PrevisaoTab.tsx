/**
 * pages/kids/PrevisaoTab.tsx
 *
 * Tab "Previsão" do FieldRivaisDashboard.
 *
 * Pega no campo/tee que o ESCALÃO do Manuel vai jogar (resolvido por
 * `resolveCourseTee`, o mesmo da tab "O Campo") + no Handicap Index real do
 * Manuel, e mostra uma régua WHS tipo /simulador fixada NESTE campo:
 *   • Course Handicap + Playing Handicap
 *   • Gross para "jogar ao índice" (e ao par)
 *   • Tabela gross → Score Differential → vs Par (ordenável)
 *
 * Reutiliza as fórmulas centrais de `whsCalc.ts`. Os ratings (CR/Slope/Par)
 * vêm do tee resolvido; quando o campo não tem rating publicado, há campos
 * manuais editáveis (prefixados com o que existir).
 */
import { useEffect, useMemo, useState } from "react";
import { useCourses } from "../../context/CoursesContext";
import { resolveCourseTee, type ResolvedCourse } from "./CourseTab";
import { calcSD, calcScore, calcCourseHcp, calcPlayingHcp } from "../../utils/whsCalc";
import { fmtCR, fmtToPar, fmtSign, fmtOrd } from "../../utils/format";
import { useSort, compareNullsLast, compareTextNullsLast } from "../../hooks/useSort";
import PlayerLink from "../../ui/PlayerLink";
import SexBadge from "../../ui/SexBadge";
import { HcpText } from "../../ui/HcpPill";
import SortableHdr from "../../ui/SortableHdr";
import { loadPlayerData } from "../../data/playerDataLoader";
import type { PlayerPageData } from "../../data/playerDataLoader";
import { MANUEL_FED } from "../../constants/manuel";
import { buildHoleProfile, buildGamePlan, estimateField, fieldHoleVsPar, topFieldHoleStats, ultimas20, porComprimento, type HolePlan } from "./previsaoModel";
import HoleDiffTable from "../../ui/HoleDiffTable";
import KpiCard from "../../ui/KpiCard";
import { scClass } from "../../utils/scoreDisplay";
import { buildReach, notReachableHoles } from "../../utils/reach";
import EmptyState from "../../ui/EmptyState";
import LoadingState from "../../ui/LoadingState";
import { MUTED } from "../../ui/tableCells";
import { Pill } from "../../ui/PillBadge";
import { SDPill } from "../../ui/tournamentPrimitives";
import { Fill, Tint } from "../../ui/DataStyle";
import { parHoleColors } from "../../ui/CourseHeroCard";
import { useJson } from "../../hooks/useJson";
import { USKIDS_SEDES } from "../../data/uskidsVenues";
import { stripAccents } from "../../utils/normName";
import Select from "../../ui/Select";
import SectionTitle from "../../ui/SectionTitle";
import { FilterField } from "../../ui/FilterField";

interface FieldEscalao { nome: string }
interface FieldTorneio { t: number; name: string; date_inicio: string; escaloes: FieldEscalao[] }
interface MHSlim { torneios: Record<string, unknown>; jogadores: Record<string, unknown> }

/** Um jogador da prova que sai do mesmo tee que o Manuel (aba «👥 O field
 *  neste tee»; montado por quem conhece a prova — `fpgCourseTab.tsx`). */
export interface JogadorNoTee { key: string; name: string; fed: string | null; club: string | null; hi: number | null; isManuel: boolean; sex: "M" | "F" | null }

/** Campo de 9 buracos jogado duas vezes (o 10–18 repete o 1–9 em par e metros). */
function noveDuasVezes(holes: readonly { par: number | null; distance: number | null }[]): boolean {
  return holes.length === 18 && holes.slice(0, 9).every((h, i) => h.par === holes[i + 9].par && h.distance === holes[i + 9].distance);
}
const media2 = (a: number | null, b: number | null | undefined) => (a == null ? null : b == null ? a : (a + b) / 2);
type PlanRow = HolePlan & { twin?: HolePlan };

const ALLOWANCES = [100, 95, 90, 85] as const;

function parseNum(s: string): number | null {
  const v = parseFloat(s.replace(",", "."));
  return isNaN(v) ? null : v;
}

type RowKey = "gross" | "toPar" | "sd";

export default function PrevisaoTab({ torneio = null, escalaoNome = "", mh = null, resolved: resolvedIn, field: fieldNoTee, onTee }: {
  torneio?: FieldTorneio | null;
  escalaoNome?: string;
  mh?: MHSlim | null;
  /** Campo + tee já conhecidos (aba «🔮 Previsão» do TournamentDetail — provas
   *  FPG/Drive/…, 04/11/2026). Sem isto resolve-se pelo torneio USKids. */
  resolved?: ResolvedCourse | null;
  /** Os jogadores da prova no mesmo tee, com índice (sem isto, sem a secção). */
  field?: JogadorNoTee[];
  /** Avisa quem chama quando se muda de tee na caixa (o field depende do tee). */
  onTee?: (tee: { teeId: string; teeName: string; escolhido: boolean }) => void;
}) {
  const { simCourses } = useCourses();
  const base = useMemo<ResolvedCourse | null>(
    () => resolvedIn !== undefined ? resolvedIn : resolveCourseTee(torneio as never, escalaoNome, mh as never, simCourses),
    [resolvedIn, torneio, escalaoNome, mh, simCourses],
  );
  // Escolher o tee (04/11/2026: «tens que permitir que se mude o tee na
  // previsão») — todos os tees do campo; começa no resolvido.
  const cursoCompleto = useMemo(
    () => (base ? simCourses.find((c) => c.courseKey === base.course.courseKey) ?? base.course : null),
    [base, simCourses],
  );
  // Prova com mais de um campo (USKIDS_SEDES — Spanish Open 2026: Old e New):
  // os tees de todos, agrupados por campo.
  const campos = useMemo(() => {
    const sede = torneio ? USKIDS_SEDES[(torneio as { t: number }).t] : undefined;
    const daSede = (sede?.courseKeys ?? []).map((k) => simCourses.find((c) => c.courseKey === k)).filter((c): c is NonNullable<typeof c> => !!c);
    return daSede.length ? daSede : cursoCompleto ? [cursoCompleto] : [];
  }, [torneio, simCourses, cursoCompleto]);
  // Valor da caixa = «courseKey|teeId».
  const [teeSel, setTeeSel] = useState<string | null>(null);
  useEffect(() => { setTeeSel(null); }, [base?.tee.teeId, base?.course.courseKey]);
  const resolved = useMemo<ResolvedCourse | null>(() => {
    if (!base || !teeSel) return base;
    const [ck, tid] = teeSel.split("|");
    const course = campos.find((c) => c.courseKey === ck);
    const tee = course?.master.tees.find((t) => t.teeId === tid);
    return course && tee ? { course, tee } : base;
  }, [base, teeSel, campos]);
  useEffect(() => {
    if (resolved && onTee) onTee({ teeId: resolved.tee.teeId, teeName: resolved.tee.teeName, escolhido: teeSel != null });
  }, [resolved, onTee, teeSel]);
  const baseKey = base ? `${base.course.courseKey}|${base.tee.teeId}` : "";
  const baseNaLista = campos.some((c) => c.courseKey === base?.course.courseKey && c.master.tees.some((t) => t.teeId === base?.tee.teeId));
  // Só tees de homens: a Previsão é do Manuel, e o rating de senhoras de um
  // tee dá-lhe pancadas que não são as dele (04/11/2026: Rojas de senhoras,
  // CR 71.3 contra 66.4 — «a melhor», «ao handicap» e «a média» seguidas).
  // O tee resolvido fica sempre na lista, seja qual for.
  const teesDe = (c: (typeof campos)[number]) => c.master.tees.filter((t) => t.sex !== "F" || (c.courseKey === base?.course.courseKey && t.teeId === base?.tee.teeId));
  const nTees = campos.reduce((a, c) => a + teesDe(c).length, 0);
  const opcaoTee = (c: { courseKey: string }, t: { teeId: string; teeName: string; sex?: string; distances?: { total?: number | null } }) => (
    <option key={c.courseKey + t.teeId} value={`${c.courseKey}|${t.teeId}`}>
      {t.teeName}{t.sex === "F" ? " (senhoras)" : t.sex === "M" ? " (homens)" : ""}{t.distances?.total ? ` · ${t.distances.total} m` : ""}
    </option>
  );

  // HI + dados completos do Manuel (default 9.4 até carregar). Editável.
  const [playerData, setPlayerData] = useState<PlayerPageData | null>(null);
  const [manuelHi, setManuelHi] = useState<number | null>(null);
  const [hiInput, setHiInput] = useState<string>("");
  const [hiTouched, setHiTouched] = useState(false);
  useEffect(() => {
    let alive = true;
    loadPlayerData(MANUEL_FED)
      .then(d => { if (!alive) return; setPlayerData(d); if (d?.HCP_INFO?.current != null) setManuelHi(d.HCP_INFO.current); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Allowance da competição (USKids = 100%; deixa-se escolher).
  const [allowance, setAllowance] = useState<number>(100);
  const [driveM, setDriveM] = useState(185);
  const [secondM, setSecondM] = useState(160);

  // Ratings resolvidos do tee + overrides manuais.
  const r18 = resolved?.tee.ratings.holes18;
  const holesCount = resolved?.tee.distances.holesCount ?? 18;
  const resCR = r18?.courseRating ?? null;
  const resSlope = r18?.slopeRating ?? null;
  const resPar = r18?.par ?? null;

  const [mCR, setMCR] = useState("");
  const [mSlope, setMSlope] = useState("");
  const [mPar, setMPar] = useState("");
  // Reset overrides quando muda o tee resolvido (novo campo/escalão).
  useEffect(() => { setMCR(""); setMSlope(""); setMPar(""); }, [resolved?.tee.teeId]);

  const cr = parseNum(mCR) ?? resCR;
  const slope = parseNum(mSlope) ?? resSlope;
  const par = parseNum(mPar) ?? resPar;
  const hi = hiTouched ? parseNum(hiInput) : (manuelHi ?? 9.4);

  const canCompute = cr != null && slope != null && slope > 0 && par != null && hi != null && holesCount === 18;

  const calc = useMemo(() => {
    if (!canCompute) return null;
    const courseHcp = calcCourseHcp(hi!, slope!, cr!, par!);
    const playingHcp = calcPlayingHcp(hi!, slope!, cr!, par!, allowance / 100);
    const playsToIndex = calcScore(hi!, cr!, slope!);        // gross ≈ jogar ao índice
    const evenGross = par!;                                    // jogar ao par
    const sdAtPar = calcSD(par!, cr!, slope!);                 // SD de fazer o par
    return { courseHcp, playingHcp, playsToIndex, evenGross, sdAtPar };
  }, [canCompute, hi, slope, cr, par, allowance]);

  const { sortKey, sortDir, toggleSort } = useSort<RowKey>("gross", "asc");

  // ── Plano de jogo + estimativa de field (independentes do CR/Slope) ──
  const profile = useMemo(() => buildHoleProfile(playerData), [playerData]);
  const fieldVsPar = useMemo(() => fieldHoleVsPar(mh as never, torneio as never, escalaoNome), [mh, torneio, escalaoNome]);
  const topField = useMemo(() => topFieldHoleStats(mh as never, torneio as never, escalaoNome, 5), [mh, torneio, escalaoNome]);
  // «Bom dia» = o perfil por buraco das 8 voltas que contam para o handicap
  // (as 8 melhores das últimas 20) — 04/11/2026, em vez de «melhor 6m / melhor
  // de sempre» («num júnior… está sempre melhor nos últimos 6m»).
  const u20 = useMemo(() => ultimas20(playerData), [playerData]);
  const bomProfile = useMemo(() => u20.bomIds.size ? buildHoleProfile(playerData, u20.bomIds) : null, [playerData, u20]);
  const gamePlan = useMemo<HolePlan[]>(
    () => resolved ? buildGamePlan(resolved.tee, profile, { driveM, secondM, courseHcp: calc?.courseHcp ?? 0, fieldVsPar, bomProfile }) : [],
    [resolved, profile, driveM, secondM, calc, fieldVsPar, bomProfile],
  );
  const bomGross = useMemo(() => {
    if (!gamePlan.length) return null;
    let acc = 0;
    for (const h of gamePlan) { if (h.expBom == null) return null; acc += h.expBom; }
    return Math.round(acc);
  }, [gamePlan]);
  // Das últimas 20 voltas, quantas — jogadas neste tee — davam o handicap ou melhor.
  const vinte = useMemo(() => {
    if (!calc || cr == null || slope == null || !u20.sds.length) return null;
    const alvo = Math.round(calc.playsToIndex);
    const gross = u20.sds.map(sd => Math.round(calcScore(sd, cr, slope)));
    return { n: gross.length, ok: gross.filter(g => g <= alvo).length, melhor: Math.min(...gross), gross };
  }, [calc, cr, slope, u20]);
  const expPerRound = useMemo(() => {
    if (!gamePlan.length) return null;
    let acc = 0;
    for (const h of gamePlan) { if (h.expStrokes == null) return null; acc += h.expStrokes; }
    return acc;
  }, [gamePlan]);

  // Régua gross → ±par → SD, de 2 abaixo da melhor das últimas 20 até 2 acima
  // da média, com quantas das últimas 20 voltas deram EXACTAMENTE esse gross
  // neste tee — a coluna soma 20 com a linha das piores (04/11/2026: «não
  // temos tabelas globais mais bonitas?»; o acumulado «X ou melhor» confundia).
  const regua = useMemo(() => {
    if (!calc || cr == null || slope == null || par == null) return null;
    const alvo = Math.round(calc.playsToIndex);
    const media = expPerRound != null ? Math.round(expPerRound) : alvo;
    // Começa SEMPRE, no mínimo, no par (04/11/2026, «deveria começar sempre
    // pelo menos no par») e acaba 2 acima da média.
    const lo = Math.min(vinte?.melhor ?? alvo, alvo, par + 2) - 2;
    const top = Math.max(media, alvo) + 2;
    const rows: { gross: number; toPar: number; sd: number; n20: number | null }[] = [];
    for (let g = lo; g <= top; g++) {
      rows.push({ gross: g, toPar: g - par, sd: calcSD(g, cr, slope), n20: vinte ? vinte.gross.filter(x => x === g).length : null });
    }
    const piores = vinte ? vinte.gross.filter(x => x > top).length : 0;
    const maxN = Math.max(1, piores, ...rows.map(r => r.n20 ?? 0));
    return { rows, top, piores, maxN };
  }, [calc, cr, slope, par, expPerRound, vinte]);
  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...(regua?.rows ?? [])].sort((a, b) => (a[sortKey] - b[sortKey]) * dir);
  }, [regua, sortKey, sortDir]);

  // ── O comprimento do tee: joga pior nos tees compridos do que o SD diz? ──
  const teeM = resolved?.tee.distances.total ?? null;
  const comprimento = useMemo(() => {
    if (!teeM) return null;
    const grupos = porComprimento(playerData, teeM).map(gr => ({
      ...gr,
      aqui: gr.sdMedio != null && cr != null && slope != null ? Math.round(calcScore(gr.sdMedio, cr, slope)) : null,
      ordem: gr.key === "curtos" ? 0 : gr.key === "parecidos" ? 1 : 2,
    }));
    const todas = grupos.reduce((a, gr) => a + gr.n, 0);
    const sdGeral = todas ? grupos.reduce((a, gr) => a + (gr.sdMedio ?? 0) * gr.n, 0) / todas : null;
    return { grupos, todas, sdGeral };
  }, [playerData, teeM, cr, slope]);
  const { sortKey: cK, sortDir: cD, toggleSort: cT } = useSort<"ordem" | "n" | "metros" | "vsParMedio" | "sdMedio" | "sdMelhor" | "aqui">("ordem", "asc");
  const comprimentoSorted = useMemo(() => {
    const dir = cD === "asc" ? 1 : -1;
    return [...(comprimento?.grupos ?? [])].sort((a, b) => compareNullsLast(a[cK], b[cK], dir));
  }, [comprimento, cK, cD]);
  const field = useMemo(() => estimateField(mh as never, torneio as never, escalaoNome), [mh, torneio, escalaoNome]);
  // Campo de 9 buracos jogado 2× (Oeiras): 9 linhas, cada uma com o buraco
  // gémeo (1 · 10) — o esperado é a média das duas passagens; o Σ é o das 18.
  const nove = useMemo(() => resolved ? noveDuasVezes(resolved.tee.holes) : false, [resolved]);
  const planRows = useMemo<PlanRow[]>(() => nove
    ? gamePlan.slice(0, 9).map((h, i) => {
      const tw = gamePlan[i + 9];
      return { ...h, twin: tw, expStrokes: media2(h.expStrokes, tw?.expStrokes), expBom: media2(h.expBom, tw?.expBom) };
    })
    : gamePlan, [gamePlan, nove]);
  // O buraco mais difícil (SI mais baixo) e o mais fácil (SI mais alto) das linhas.
  const siExtremos = useMemo(() => {
    const sis = planRows.map(h => h.si).filter((x): x is number => x != null);
    return sis.length ? { min: Math.min(...sis), max: Math.max(...sis) } : { min: null, max: null };
  }, [planRows]);
  // Quem jogou este tee (os nossos seguidos, sem o Manuel) — buraco a buraco
  // (scripts/build-course-hole-field.js; chave = courseKey ou nome do campo).
  const { data: holeField } = useJson<CourseHoleField>("/data/course-hole-field.json");
  const campoAqui = useMemo(() => {
    if (!holeField || !resolved) return null;
    const c = holeField.c[resolved.course.courseKey] ?? holeField.c[stripAccents(resolved.course.master.name).toLowerCase().trim()];
    return c?.[resolved.tee.teeName.trim().toUpperCase()] ?? null;
  }, [holeField, resolved]);
  // Cor da coluna Par: a fórmula da «Vista do campo» (par 3 verde · 4 roxo ·
  // 5 vermelho; mais escuro = mais comprido dentro do par).
  const corPar = useMemo(() => resolved ? parHoleColors(resolved.tee) : new Map<number, { bg: string; fg: string; border: string }>(), [resolved]);
  const planFonte = gamePlan[0]?.tagSource ?? "perfil";
  const { sortKey: pK, sortDir: pD, toggleSort: pT } = useSort<"hole" | "par" | "dist" | "si" | "exp" | "tag">("hole", "asc");
  const planSorted = useMemo(() => {
    const arr = [...planRows];
    const dir = pD === "asc" ? 1 : -1;
    const tagRank: Record<string, number> = { attack: 0, neutral: 1, defend: 2 };
    arr.sort((a, b) => {
      let va: number | null, vb: number | null;
      switch (pK) {
        case "par": va = a.par ?? null; vb = b.par ?? null; break;
        case "dist": va = a.dist || null; vb = b.dist || null; break;
        case "si": va = a.si ?? null; vb = b.si ?? null; break;
        case "exp": va = a.expStrokes ?? null; vb = b.expStrokes ?? null; break;
        case "tag": va = tagRank[a.tag]; vb = tagRank[b.tag]; break;
        default: va = a.hole; vb = b.hole;
      }
      return compareNullsLast(va, vb, dir);
    });
    return arr;
  }, [planRows, pK, pD]);

  const reach = useMemo(() => resolved ? buildReach(resolved.tee, driveM, secondM) : [], [resolved, driveM, secondM]);
  const notReach = useMemo(() => notReachableHoles(reach), [reach]);
  // Alcance de um campo de 9 jogado 2×: só os 9 buracos.
  const teeAlcance = useMemo(() => resolved && nove ? { ...resolved.tee, holes: resolved.tee.holes.slice(0, 9) } : resolved?.tee ?? null, [resolved, nove]);
  const notReach9 = useMemo(() => nove ? notReach.filter(r => r.hole <= 9) : notReach, [notReach, nove]);

  // Parâmetros numa linha; as caixas só ao «✎ editar» (ou quando falta rating).
  const [editar, setEditar] = useState(false);

  // ── O field neste tee: o índice de cada um em gross «ao handicap» aqui ──
  // As raparigas jogam o mesmo tee com o rating de senhoras (Vermelhas F: CR
  // 72.8 / 124 ≠ 67.8 / 119) — cada uma com o do seu sexo.
  const ratingF = useMemo(() => {
    if (!resolved) return null;
    const k = resolved.tee.teeName.trim().toLowerCase();
    const tF = resolved.course.master.tees.find(t => t.sex === "F" && t.teeName.trim().toLowerCase() === k);
    const r = tF?.ratings.holes18;
    return r?.courseRating != null && r.slopeRating != null ? { cr: r.courseRating, slope: r.slopeRating, par: r.par ?? par } : null;
  }, [resolved, par]);
  const fieldRanked = useMemo(() => {
    if (!fieldNoTee?.length || cr == null || slope == null) return [];
    const rows = fieldNoTee.map(j => {
      const h = j.isManuel ? hi : j.hi;
      const rt = j.sex === "F" ? ratingF : { cr, slope, par };
      const g = h != null && rt ? Math.round(calcScore(h, rt.cr, rt.slope)) : null;
      return { ...j, hi: h, gross: g, toPar: g != null && rt?.par != null ? g - rt.par : null, pos: null as number | null };
    }).sort((a, b) => compareNullsLast(a.gross, b.gross, 1));
    let last: number | null = null, pos = 0;
    rows.forEach((r, i) => { if (r.gross == null) return; if (r.gross !== last) { pos = i + 1; last = r.gross; } r.pos = pos; });
    return rows;
  }, [fieldNoTee, cr, slope, par, hi, ratingF]);
  const { sortKey: fK, sortDir: fD, toggleSort: fT } = useSort<"pos" | "name" | "club" | "hi" | "gross">("pos", "asc");
  const fieldSorted = useMemo(() => {
    const dir = fD === "asc" ? 1 : -1;
    return [...fieldRanked].sort((a, b) =>
      fK === "name" ? compareTextNullsLast(a.name, b.name, dir)
      : fK === "club" ? compareTextNullsLast(a.club, b.club, dir)
      : compareNullsLast(a[fK], b[fK], dir));
  }, [fieldRanked, fK, fD]);
  const manuelNoField = fieldRanked.find(r => r.isManuel) ?? null;
  const comIndice = fieldRanked.filter(r => r.gross != null).length;

  if (!torneio && resolvedIn === undefined) return <EmptyState size="sm" message="Sem torneio seleccionado." />;
  if (!resolved) {
    return (
      <div className="muted p-16">
        Sem campo resolvido para este torneio/escalão — a previsão precisa do par/distâncias do campo.
      </div>
    );
  }

  const predGross = calc ? Math.round(calc.playsToIndex) : null;
  const predMedia = expPerRound != null ? Math.round(expPerRound) : null;

  // Projecção de torneio do Manuel: a sua volta a JOGAR AO ÍNDICE (forma
  // competitiva), não a volta média da época (que inclui treino/casual e ficava
  // alta). Usa o plays-to-index do campo (predGross); se o campo não tiver
  // CR/Slope, cai na volta média do perfil.
  const manuelPerRound = predGross ?? predMedia;
  const manuelBasis: "índice" | "média" = predGross != null ? "índice" : "média";
  const manuelTot = (manuelPerRound != null && field.nRoundsTypical != null) ? manuelPerRound * field.nRoundsTypical : null;

  return (
    <div className="u-d-flex u-fd-column u-gap-14px">
      {resolved.note && !teeSel && (
        <div className="muted fs-11 u-p-6px-10px u-bg-bg-muted u-bd-qpvg4 u-br-radius">
          ⚠ {resolved.note}
        </div>
      )}

      <div className="card u-d-flex u-fd-column u-gap-12px">
      {/* Campo + tee resolvido */}
      <SectionTitle as="div" size="lg" className="u-m-0"
        right={nTees > 1 ? (
          <FilterField asLabel label="Tee">
            <Select value={teeSel ?? (baseNaLista ? baseKey : "")} onChange={(v) => setTeeSel(v && v !== baseKey ? v : null)} active={teeSel != null}>
              {!baseNaLista && <option value="">{base?.tee.teeName} (do torneio)</option>}
              {campos.length > 1
                ? campos.map((c) => <optgroup key={c.courseKey} label={c.master.name}>{teesDe(c).map((t) => opcaoTee(c, t))}</optgroup>)
                : campos[0] && teesDe(campos[0]).map((t) => opcaoTee(campos[0], t))}
            </Select>
          </FilterField>
        ) : undefined}>
        {resolved.course.master.name}
        {" · "}
        <span>{resolved.tee.teeName}</span>
        {resolved.tee.distances.total != null && <span className="muted">{" · "}{resolved.tee.distances.total} m</span>}
      </SectionTitle>

      {resolved.ratingApprox && (
        <div className="muted fs-11 u-p-6px-10px u-bg-bg-muted u-bd-qpvg4 u-br-radius">
          ⚠ CR/Slope estimados por interpolação entre os tees com rating oficial — este tee de torneio não tem rating publicado.
        </div>
      )}

      {/* Parâmetros numa linha; as caixas ao «✎ editar» */}
      <div className="prev-params">
        <span>Índice <strong><HcpText hcp={hi} /></strong></span>
        <span>CR <strong>{cr != null ? fmtCR(cr) : "—"}</strong></span>
        <span>Slope <strong>{slope ?? "—"}</strong></span>
        <span>Par <strong>{par ?? "—"}</strong></span>
        <span>Allowance <strong>{allowance}%</strong></span>
        <span>Drive <strong>{driveM} m</strong></span>
        <span>2.ª pancada <strong>{secondM} m</strong></span>
        <button type="button" className="btn btn-link" onClick={() => setEditar(v => !v)}>{editar ? "✓ fechar" : "✎ editar"}</button>
      </div>
      {(editar || cr == null || slope == null || par == null) && (
      <div className="u-d-flex u-gap-14px u-fwr-wrap u-ai-flex-end">
        <FilterField asLabel label="Handicap Index">
          <input className="select fs-13 u-w-84px" type="text" inputMode="decimal"
            value={hiTouched ? hiInput : (hi != null ? hi.toFixed(1) : "")}
            onChange={e => { setHiTouched(true); setHiInput(e.target.value); }}
            placeholder="9.4" />
        </FilterField>
        <FilterField asLabel label="Course Rating">
          <input className="select fs-13 u-w-84px" type="text" inputMode="decimal"
            value={mCR} onChange={e => setMCR(e.target.value)}
            placeholder={resCR != null ? fmtCR(resCR) : "—"} />
        </FilterField>
        <FilterField asLabel label="Slope">
          <input className="select fs-13 u-w-84px" type="text" inputMode="numeric"
            value={mSlope} onChange={e => setMSlope(e.target.value)}
            placeholder={resSlope != null ? String(resSlope) : "—"} />
        </FilterField>
        <FilterField asLabel label="Par">
          <input className="select fs-13 u-w-70px" type="text" inputMode="numeric"
            value={mPar} onChange={e => setMPar(e.target.value)}
            placeholder={resPar != null ? String(resPar) : "—"} />
        </FilterField>
        <FilterField asLabel label="Allowance">
          <Select className="fs-13 u-w-84px" value={allowance}
            onChange={v => setAllowance(parseInt(v, 10))}>
            {ALLOWANCES.map(a => <option key={a} value={a}>{a}%</option>)}
          </Select>
        </FilterField>
        <FilterField asLabel label="Drive (m)">
          <input className="select fs-13 u-w-70px" type="text" inputMode="numeric"
            value={driveM} onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setDriveM(v); }} />
        </FilterField>
        <FilterField asLabel label="2ª pancada (m)">
          <input className="select fs-13 u-w-70px" type="text" inputMode="numeric"
            value={secondM} onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setSecondM(v); }} />
        </FilterField>
      </div>
      )}

      {holesCount !== 18 && (
        <div className="muted fs-12">A previsão está disponível para provas de 18 buracos (este escalão joga {holesCount}).</div>
      )}
      {holesCount === 18 && !canCompute && (
        <div className="muted fs-12">
          Falta CR/Slope para este campo — preenche os campos acima para calcular a previsão.
        </div>
      )}

      {calc && (
        <>
          {/* Strip de KPIs */}
          <div className="kpi-row kpi-row-4">
            <KpiCard label="A sua média" value={predMedia ?? "–"} sub={predMedia != null ? `${fmtToPar(predMedia - (par as number))} · forma 6m` : undefined} />
            {/* «Ao handicap» e «Bom dia» são a MESMA coisa (o índice é a média das
                8 voltas que contam) — uma só KPI (04/11/2026, «é a mesma coisa?»);
                o buraco a buraco só diz quando dá diferente. */}
            <KpiCard label="Ao handicap · um bom dia" value={predGross} color="var(--accent)"
              sub={`${fmtToPar(predGross! - (par as number))} · HCP ${Math.round(calc.courseHcp)} · as 8 voltas que contam${bomGross != null && bomGross !== predGross ? ` (buraco a buraco: ${bomGross})` : ""}`} />
            <KpiCard label="Melhor das últimas 20" value={vinte?.melhor ?? "–"} color="var(--color-good)" sub={vinte ? `${fmtToPar(vinte.melhor - (par as number))} · jogada neste tee` : "sem dados"} />
            <KpiCard label={`${predGross} ou menos`} value={vinte ? `${vinte.ok} em ${vinte.n}` : "–"} sub={vinte ? `das últimas ${vinte.n} voltas, jogadas neste tee` : "sem dados"} />
          </div>

          <p className="muted fs-12 u-m-0">
            Para competir, o alvo não é a média — é jogar <strong>ao handicap</strong> (+{Math.round(calc.courseHcp)} ≈ <strong>{predGross}</strong>) ou abaixo, que é o que faz num <strong>bom dia</strong> (o índice é a média das 8 voltas que contam).
            A volta <strong>média</strong> (forma 6m) ronda {predMedia}{vinte && <>; das últimas {vinte.n} voltas, <strong>{vinte.ok}</strong> davam {predGross} ou menos neste tee e a melhor {vinte.melhor}</>}.
            A régua abaixo traduz cada gross no Score Differential que geraria.
          </p>

          {/* Régua gross → SD → vs Par (ordenável) */}
          <table className="dtable dt-compact">
            <thead>
              <tr>
                <SortableHdr k="gross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Gross</SortableHdr>
                <SortableHdr k="toPar" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">±Par</SortableHdr>
                <SortableHdr k="sd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Score Differential = (113 / Slope) × (Gross − CR); cor pelo índice dele">SD</SortableHdr>
                {vinte && <th title="Das últimas 20 voltas, quantas — convertidas para este tee pelo Score Differential — deram exactamente este gross (a coluna soma 20)">Voltas (das últimas {vinte.n})</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(row => {
                const isPred = predGross != null && row.gross === predGross;
                const marcas = [
                  row.gross === predGross && <Pill key="h" className="p-ref-hcp">ao handicap · bom dia</Pill>,
                  row.gross === predMedia && <Pill key="m" className="p-ref-media">a média</Pill>,
                  vinte && row.gross === vinte.melhor && <Pill key="b" className="p-ref-best">a melhor das {vinte.n}</Pill>,
                ].filter(Boolean);
                return (
                  <tr key={row.gross} className={isPred ? "u-bg-accent-light u-fw-700" : undefined}>
                    <td className="r u-fw-800">{row.gross}</td>
                    <td className={`r ${vsParTone(row.gross, par)}`}>{fmtToPar(row.toPar)}</td>
                    <td className="r"><SDPill sd={row.sd} hcp={hi} /></td>
                    {vinte && (
                      <td>
                        <span className="prev-regua-n20">
                          <span className="prev-bar"><Fill pct={(row.n20 ?? 0) / (regua?.maxN ?? 1) * 100} /></span>
                          <span className="u-ws-nowrap">{row.n20 ? `${row.n20} ${row.n20 === 1 ? "volta" : "voltas"}` : MUTED}</span>
                        </span>
                      </td>
                    )}
                    <td><span className="u-d-inline-flex u-gap-4px u-fwr-wrap">{marcas}</span></td>
                  </tr>
                );
              })}
            </tbody>
            {vinte && regua && regua.piores > 0 && (
              <tfoot>
                <tr>
                  <td className="r u-fw-800">{regua.top + 1}+</td>
                  <td />
                  <td />
                  <td>
                    <span className="prev-regua-n20">
                      <span className="prev-bar"><Fill pct={regua.piores / regua.maxN * 100} /></span>
                      <span className="u-ws-nowrap">{regua.piores} {regua.piores === 1 ? "volta" : "voltas"}</span>
                    </span>
                  </td>
                  <td className="muted">piores</td>
                </tr>
              </tfoot>
            )}
          </table>

          <p className="muted fs-11 u-m-0">
            Cenários: "média" = volta típica (forma 6m) · "ao handicap" = jogar ao índice (+HCP) · "bom dia" = como jogou buraco a buraco nas 8 voltas que contam para o handicap (as 8 de Score Differential mais baixo das últimas 20), nos buracos deste tee · "N ou menos" = das últimas 20 voltas, quantas, convertidas para este tee pelo Score Differential, davam o gross de jogar ao handicap ou melhor · "Voltas" na régua = quantas das últimas 20 deram exactamente esse gross neste tee (somam 20 com a linha das piores). Score Differential = (113 / Slope) × (Gross − CR). O índice é a média das 8 melhores de 20 voltas
            (o potencial num bom dia), por isso joga-se "ao índice" ou melhor só ~1 em cada 4 a 5 voltas (cerca de 20–25% das vezes).
          </p>
        </>
      )}
      </div>

      {/* ── O comprimento do tee (04/11/2026: «sem levar em conta a distância e
          dificuldade do tee… deveria haver uma análise disso») ── */}
      {comprimento && teeM && comprimento.todas > 0 && (() => {
        const par = comprimento.grupos.find(gr => gr.key === "parecidos")!;
        const dif = par.sdMedio != null && comprimento.sdGeral != null ? par.sdMedio - comprimento.sdGeral : null;
        const pancadas = dif != null && slope != null ? Math.round(Math.abs(dif) * slope / 113) : null;
        const nome = (k: string) => k === "curtos" ? `Mais curtos (< ${teeM - 250} m)` : k === "parecidos" ? `Parecidos (${teeM - 250}–${teeM + 250} m)` : `Mais compridos (> ${teeM + 250} m)`;
        return (
          <details className="card" open>
            <summary className="fs-13 fw-600 u-cur-pointer u-user-select-none">
              📏 O comprimento do tee — {teeM} m
              <span className="muted fw-400 fs-11">{"  ·  as voltas de 18 dos últimos 6 meses, pelo comprimento do tee"}</span>
            </summary>
            <p className="fs-12 u-m-6px-0-0">
              {par.n < 3
                ? <>Só {par.n} {par.n === 1 ? "volta" : "voltas"} em tees deste comprimento nos últimos 6 meses — pouco para dizer se joga pior aqui do que o SD prevê.</>
                : dif != null && Math.abs(dif) < 1
                  ? <>Nos tees deste comprimento joga <strong>como no resto</strong> (SD médio {par.sdMedio!.toFixed(1)} contra {comprimento.sdGeral!.toFixed(1)} em geral): o CR e o Slope já descontam a distância, e a conversão pelo SD é justa.</>
                  : dif != null && dif >= 1
                    ? <>Nos tees deste comprimento joga <strong className="tone-bad">pior</strong> do que no resto (SD médio {par.sdMedio!.toFixed(1)} contra {comprimento.sdGeral!.toFixed(1)}): conte com <strong>~{pancadas} pancada{pancadas === 1 ? "" : "s"} a mais</strong> do que a régua diz.</>
                    : <>Nos tees deste comprimento joga <strong className="tone-good">melhor</strong> do que no resto (SD médio {par.sdMedio!.toFixed(1)} contra {comprimento.sdGeral!.toFixed(1)}): ~{pancadas} pancada{pancadas === 1 ? "" : "s"} a menos do que a média dele diria.</>}
            </p>
            <table className="dtable dt-compact u-mt-8px">
              <thead>
                <tr>
                  <SortableHdr k="ordem" sortKey={cK} sortDir={cD} onSort={cT}>Tees</SortableHdr>
                  <SortableHdr k="n" sortKey={cK} sortDir={cD} onSort={cT} className="r">Voltas</SortableHdr>
                  <SortableHdr k="metros" sortKey={cK} sortDir={cD} onSort={cT} className="r" title="Comprimento médio dos tees em que jogou">Metros</SortableHdr>
                  <SortableHdr k="vsParMedio" sortKey={cK} sortDir={cD} onSort={cT} className="r" title="Pancadas acima do par, em média — aqui a distância pesa">±Par médio</SortableHdr>
                  <SortableHdr k="sdMedio" sortKey={cK} sortDir={cD} onSort={cT} className="r" title="Score Differential médio — já desconta o CR e o Slope do tee">SD médio</SortableHdr>
                  <SortableHdr k="sdMelhor" sortKey={cK} sortDir={cD} onSort={cT} className="r">Melhor SD</SortableHdr>
                  <SortableHdr k="aqui" sortKey={cK} sortDir={cD} onSort={cT} className="r" title={`O SD médio desse grupo convertido para as ${resolved.tee.teeName} (CR ${cr ?? "–"} · Slope ${slope ?? "–"})`}>Aqui daria</SortableHdr>
                </tr>
              </thead>
              <tbody>
                {comprimentoSorted.map(gr => (
                  <tr key={gr.key} className={gr.key === "parecidos" ? "u-bg-accent-light u-fw-700" : undefined}>
                    <td className="u-ws-nowrap">{nome(gr.key)}</td>
                    <td className="r">{gr.n || MUTED}</td>
                    <td className="r">{gr.metros ?? MUTED}</td>
                    <td className="r">{gr.vsParMedio != null ? fmtSign(gr.vsParMedio, 1) : MUTED}</td>
                    <td className="r"><SDPill sd={gr.sdMedio} hcp={hi} /></td>
                    <td className="r"><SDPill sd={gr.sdMelhor} hcp={hi} /></td>
                    <td className="r u-fw-800">{gr.aqui ?? MUTED}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted fs-11 u-m-6px-0-0">
              Em pancadas, os tees compridos custam mais (±Par); o SD já desconta isso pelo CR e o Slope de cada tee. Se o SD médio dos tees parecidos com este fosse claramente pior do que o resto, era sinal de que a distância lhe pesa mais do que o rating diz.
            </p>
          </details>
        );
      })()}

      {/* ── O field neste tee (índice → gross ao handicap) ── */}
      {fieldRanked.length > 1 && (
        <details className="card" open>
          <summary className="fs-13 fw-600 u-cur-pointer u-user-select-none">
            👥 O field neste tee — {fieldRanked.length} jogadores das {resolved.tee.teeName}
            {manuelNoField?.pos != null && (
              <span className="muted fw-400 fs-11">{"  ·  o Manuel é o "}{fmtOrd(manuelNoField.pos)} de {comIndice} ao handicap</span>
            )}
          </summary>
          <table className="dtable u-mt-8px">
            <thead>
              <tr>
                <SortableHdr k="pos" sortKey={fK} sortDir={fD} onSort={fT} className="r">#</SortableHdr>
                <SortableHdr k="name" sortKey={fK} sortDir={fD} onSort={fT}>Jogador</SortableHdr>
                <SortableHdr k="club" sortKey={fK} sortDir={fD} onSort={fT}>Clube</SortableHdr>
                <SortableHdr k="hi" sortKey={fK} sortDir={fD} onSort={fT} className="r">Índice</SortableHdr>
                <SortableHdr k="gross" sortKey={fK} sortDir={fD} onSort={fT} className="r" title="Gross de jogar ao índice neste tee: CR + Índice × Slope / 113">Ao handicap</SortableHdr>
                <th className="r">±Par</th>
              </tr>
            </thead>
            <tbody>
              {fieldSorted.map(r => (
                <tr key={r.key} className={r.isManuel ? "u-bg-accent-light u-fw-700" : undefined}>
                  <td className="r">{r.pos != null ? fmtOrd(r.pos) : MUTED}</td>
                  <td className="u-ws-nowrap">{r.sex && <SexBadge sex={r.sex} />} <PlayerLink fed={r.fed} name={r.name} /></td>
                  <td className="muted">{r.club || MUTED}</td>
                  <td className="r">{r.hi != null ? <HcpText hcp={r.hi} /> : MUTED}</td>
                  <td className="r">{r.gross ?? MUTED}</td>
                  <td className={`r ${vsParTone(r.gross, par)}`}>{r.toPar != null ? fmtToPar(r.toPar) : MUTED}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted fs-11 u-m-6px-0-0">
            Os jogadores da prova que saem das {resolved.tee.teeName} (pelo draw, pelas voltas ou pelo escalão e sexo), com o índice de hoje.
            «Ao handicap» = o gross de jogar ao índice neste tee (rapazes CR {cr != null ? fmtCR(cr) : "—"} · Slope {slope ?? "—"}{ratingF ? <>; raparigas CR {fmtCR(ratingF.cr)} · Slope {ratingF.slope}</> : null}) — num dia normal joga-se 3 a 5 acima.
          </p>
        </details>
      )}

      {/* ── Plano de jogo (buraco a buraco) ── */}
      {gamePlan.length > 0 && (
        <details className="card" open>
          <summary className="fs-13 fw-600 u-cur-pointer u-user-select-none">
            🎯 Plano de jogo — buraco a buraco
            {expPerRound != null && par != null && (
              <span className="muted fw-400 fs-11">{"  ·  total esperado ≈ "}{Math.round(expPerRound)} ({fmtToPar(Math.round(expPerRound) - (par as number))})</span>
            )}
            {nove && <span className="muted fw-400 fs-11">{"  ·  campo de 9 buracos, joga-se 2 vezes"}</span>}
          </summary>

          <div className="u-d-flex u-gap-12px u-fwr-wrap u-ai-center u-m-8px-0">
            <span className="muted fs-11">Drive {driveM} m · 2ª {secondM} m (editável no topo e no Alcance)</span>
            <span className="muted fs-11 u-d-inline-flex u-gap-10px u-ai-center u-fwr-wrap">
              <span><Dot tone="attack" /> atacar</span>
              <span><Dot tone="neutral" /> neutro</span>
              <span><Dot tone="defend" /> defender</span>
              <span><span className="u-d-inline-block u-minw-18px u-p-0-6px u-br-999px u-bg-accent u-c-fff u-fw-800 u-fs-fs-10 u-ta-center">SI</span> = recebe pancada</span>
            </span>
          </div>

          <div className="u-ox-auto"><table className="dtable prev-plano">
            <thead>
              <tr>
                <SortableHdr k="hole" sortKey={pK} sortDir={pD} onSort={pT} className="r">#</SortableHdr>
                <SortableHdr k="dist" sortKey={pK} sortDir={pD} onSort={pT} className="r">m</SortableHdr>
                <SortableHdr k="si" sortKey={pK} sortDir={pD} onSort={pT}>SI</SortableHdr>
                <SortableHdr k="par" sortKey={pK} sortDir={pD} onSort={pT} className="r">Par</SortableHdr>
                <SortableHdr k="exp" sortKey={pK} sortDir={pD} onSort={pT} className="r" title="Pancadas esperadas num dia normal (a média dele nos últimos 6 meses)">Média</SortableHdr>
                <th className="r" title="Pancadas esperadas num bom dia: como jogou buracos parecidos (par e distância) nas 8 voltas que contam para o handicap">Bom<br />dia</th>
                <th className="u-ta-center" title="% de birdies ou melhor · pares · bogeys ou pior do Manuel em buracos parecidos (mesmo par, distância próxima) de qualquer campo, nos últimos 6 meses">Manuel<br />buracos parecidos</th>
                {campoAqui && <th className="u-ta-center" title={`% de birdies ou melhor · pares · bogeys ou pior dos nossos jogadores seguidos neste buraco, das ${resolved.tee.teeName} (${campoAqui.r} voltas de ${campoAqui.j} jogadores, sem o Manuel)`}>Quem jogou<br />aqui ({campoAqui.j})</th>}
                <SortableHdr k="tag" sortKey={pK} sortDir={pD} onSort={pT}>Plano</SortableHdr>
                <th>Estratégia</th>
                {topField && topField.roundKeys.map(rk => (
                  <th key={rk} className="r" title={`Média do top-5 (${topField.year}) na ronda ${rk}`}>T5 R{rk}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {planSorted.map(h => {
                const tone = h.tag === "attack" ? "attack" : h.tag === "defend" ? "defend" : "neutral";
                const tagL = h.tag === "attack" ? "Atacar" : h.tag === "defend" ? "Defender" : "Neutro";
                return (
                  <tr key={h.hole}>
                    <td className="r u-ws-nowrap">{h.hole}{h.twin && <span className="muted">{" · "}{h.twin.hole}</span>}</td>
                    <td className="r">{h.dist ?? "–"}</td>
                    <td className="u-ws-nowrap">
                      <span
                        title={h.getsStroke ? `Buraco ${h.hole}: recebe pancada de handicap` : `Buraco ${h.hole}: stroke index ${h.si ?? "-"}`}
                        className={"si-pill" + (h.getsStroke ? " on" : "")}
                      >
                        {h.si ?? "–"}
                      </span>
                      {/* 2.ª passagem (campo de 9): só o número, apagadinho — 04/11/2026,
                          «faz confusão ter 2 SI em cada buraco». */}
                      {h.twin && (
                        <span className={"si-twin" + (h.twin.getsStroke ? " on" : "")}
                          title={`Buraco ${h.twin.hole} (2.ª volta): stroke index ${h.twin.si ?? "-"}${h.twin.getsStroke ? " — recebe pancada" : ""}`}>
                          {h.twin.si ?? ""}
                        </span>
                      )}
                      {h.si != null && h.si === siExtremos.min && <Pill className="p-bad u-ml-6px" title="O buraco mais difícil do campo (SI mais baixo)">+difícil</Pill>}
                      {h.si != null && h.si === siExtremos.max && <Pill className="p-good u-ml-6px" title="O buraco mais fácil do campo (SI mais alto)">+fácil</Pill>}
                    </td>
                    <td className="r">
                      {h.par != null && corPar.get(h.hole)
                        ? <Tint as="span" className="par-chip" bg={corPar.get(h.hole)!.bg} fg={corPar.get(h.hole)!.fg} bd={corPar.get(h.hole)!.border}
                            title={`Par ${h.par} — cor da «Vista do campo»: mais escuro = mais comprido dentro dos par ${h.par}`}>{h.par}</Tint>
                        : <span className="u-fw-700">{h.par ?? "–"}</span>}
                    </td>
                    <td className={`r u-fw-600 ${vsParTone(h.expStrokes, h.par)}`}>{h.expStrokes != null ? h.expStrokes.toFixed(1) : "–"}</td>
                    <td className={`r ${vsParTone(h.expBom, h.par)}`}>{h.expBom != null ? h.expBom.toFixed(1) : "–"}</td>
                    <td className="u-ta-center u-ws-nowrap"
                      title={h.hist ? `Manuel, em ${h.hist.n} buracos de par ${h.par} com distância parecida a ${h.dist} m (últimos 6 meses): ${h.hist.birdies} birdies ou melhor, ${h.hist.pares} pares, ${h.hist.bogeys} bogeys ou pior` : "Poucos buracos parecidos no histórico do Manuel"}>
                      <DistBuraco par={h.par} c={h.hist ? [h.hist.n, h.hist.birdies, h.hist.pares, h.hist.bogeys] : null} />
                    </td>
                    {campoAqui && (() => {
                      const c = somaBuraco(campoAqui.h, h.hole, h.twin?.hole);
                      return (
                        <td className="u-ta-center u-ws-nowrap"
                          title={c ? `Quem jogou aqui (sem o Manuel), buraco ${h.hole}${h.twin ? ` e ${h.twin.hole}` : ""}: ${c[1]} birdies ou melhor, ${c[2]} pares, ${c[3]} bogeys ou pior em ${c[0]}` : "Sem cartões deste buraco"}>
                          <DistBuraco par={h.par} c={c} />
                        </td>
                      );
                    })()}
                    <td className={`u-fw-700 u-ws-nowrap ${PLAN_TONE[tone].c}`} title={h.tagSource === "manuel" && h.expBom != null && h.par != null ? `Pelo histórico do Manuel: num bom dia faz ${h.expBom.toFixed(1)} neste buraco (${fmtSign(h.expBom - h.par, 1)} ao par)` : h.fieldVsPar != null ? `Field (edição anterior): ${fmtSign(h.fieldVsPar, 1)} vs par` : h.tagSource === "si" ? `Pelo índice do buraco no campo (SI ${h.si})` : "Sem dados do field nem SI — pelo histórico do Manuel"}><Dot tone={tone} /> {tagL}</td>
                    <td className="muted u-ws-nowrap">{h.note}</td>
                    {topField && topField.roundKeys.map((rk, ri) => {
                      const cell = topField.holes[h.hole - 1]?.[ri];
                      const hp = topField.par[h.hole - 1];
                      return (
                        <td key={rk} className="u-ta-center u-ws-nowrap u-p-2px-6px">
                          {cell && cell.scores.length ? (
                            <span className="u-d-inline-flex u-gap-1px u-jc-center">
                              {cell.scores.map((sc, j) => (
                                <span key={j} className={"sc-score sc-score-sm " + scClass(sc, hp)} title={topField.players[j]}>{sc}</span>
                              ))}
                            </span>
                          ) : MUTED}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="u-fw-800 u-bg-bg-header u-bt-2px-solid-border">
                <td className="r u-ws-nowrap">{nove ? "Σ 18" : "Σ"}</td>
                <td className="r">{gamePlan.reduce((a, h) => a + (h.dist ?? 0), 0)}</td>
                <td />
                <td className="r">{gamePlan.reduce((a, h) => a + (h.par ?? 0), 0)}</td>
                {/* Totais: a Média (dia normal) e o Bom dia, com o ±par — 04/11/2026,
                    em vez do «≈ 81 pancadas (+7)» solto no fim, que repetia a Média. */}
                <td className="r u-ws-nowrap" title={expPerRound != null ? `Soma da coluna Média: ${expPerRound.toFixed(1)}` : undefined}>
                  {expPerRound != null ? <>{Math.round(expPerRound)} <span className="muted fw-400 fs-11">{par != null ? fmtToPar(Math.round(expPerRound) - (par as number)) : ""}</span></> : "–"}
                </td>
                <td className="r u-ws-nowrap u-c-color-good">
                  {bomGross != null ? <>{bomGross} <span className="muted fw-400 fs-11">{par != null ? fmtToPar(bomGross - (par as number)) : ""}</span></> : "–"}
                </td>
                <td />
                {campoAqui && <td />}
                <td colSpan={2 + (topField?.roundKeys.length ?? 0)} />
              </tr>
            </tfoot>
          </table></div>
          {!playerData && <LoadingState size="sm" message="A carregar o histórico do Manuel para o «esperado»…" />}
          <p className="muted fs-11 u-m-6px-0-0">
            "Média" e "Bom dia" = pancadas que o Manuel deve fazer em cada buraco num dia normal (a média dele em buracos do mesmo par e distância nos últimos 6 meses) e num bom dia (o mesmo, só nas 8 voltas que contam para o handicap — as 8 melhores das últimas 20); cada coluna soma ao total das KPIs lá em cima (verde = abaixo do par, vermelho = acima). Base: média do Manuel em buracos do mesmo par e distância ({profile.recent ? "últimos 6 meses" : "todas as voltas"}). "Plano" = {planFonte === "manuel" ? <>pelo histórico do Manuel, não pelo SI (o SI é a dificuldade para o jogador em geral): <strong>Atacar</strong> = num bom dia faz par ou melhor neste tipo de buraco · <strong>Defender</strong> = mesmo num bom dia fica acima do par · Neutro = o resto. Os círculos são percentagens — birdie ou melhor · par · bogey ou pior: "Manuel · buracos parecidos" = o que ele fez em buracos do mesmo par e distância parecida, em qualquer campo, nos últimos 6 meses; "Quem jogou aqui" = o que os nossos jogadores seguidos (sem o Manuel) fizeram NESTE buraco, deste tee.</> : <>dificuldade do buraco {planFonte === "field" ? "para o field na edição anterior" : planFonte === "si" ? "pelo índice (SI) do campo — o terço mais difícil defender, o mais fácil atacar" : "pelo histórico do Manuel em buracos parecidos"} (atacar = mais fáceis, defender = mais difíceis).</>}{nove ? " Campo de 9 buracos jogado 2 vezes: cada linha é a 1.ª e a 2.ª passagem (o SI da 2.ª em pequeno); o Σ é o das 18." : ""}{topField && <> "T5 R#" = scores dos 5 melhores classificados da edição anterior nessa ronda, por ordem de classificação (cor = convenção dos scorecards: birdie/par/bogey). Mostra que os bons fazem birdies onde a média fica acima do par; nome do jogador no hover.</>}
          </p>
        </details>
      )}

      {/* ── Alcance / GIR pós-drive (componente partilhado com a Vantagem de Tee) ── */}
      {reach.length > 0 && (
        <details className="card" open>
          <summary className="fs-13 fw-600 u-cur-pointer u-user-select-none">
            📏 Alcance — greens em regulação
            <span className="muted fw-400 fs-11">
              {"  ·  "}{notReach9.length === 0 ? "todos os greens em regulação" : `${notReach9.length} buraco${notReach9.length === 1 ? "" : "s"} fora de alcance`}
            </span>
          </summary>
          <div className="muted fs-11 u-m-6px-0">
            "1.ª pancada" = o taco de saída e os metros que dá (escala do saco pelo drive): nos par 3 o taco mais curto que chega ao green;
            nos par 4 o driver, salvo se deixar menos do que um sand wedge cheio — aí o taco que deixa um pitching wedge cheio; nos par 5 o driver. "2.ª" e "3.ª pancada" = o taco (sem o driver) para o que falta até ao green, no máximo a 2.ª pancada configurada; quando chega ao green, o ⛳ ocupa as linhas que sobram.
            "faltam" = metros para o green depois de cada pancada · ⛳ = chega ao green · ✗ = green fora de alcance em regulação.
          </div>
          {/* O drive e a 2.ª pancada à mão aqui (04/11/2026: «editar a distância do
              drive desapareceu») — os mesmos valores do «✎ editar» do topo. */}
          <div className="u-d-flex u-gap-12px u-fwr-wrap u-ai-center u-m-0-0-8px">
            <FilterField asLabel label="Drive (m)">
              <input className="select fs-13 u-w-70px" type="text" inputMode="numeric"
                value={driveM} onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setDriveM(v); }} />
            </FilterField>
            <FilterField asLabel label="2.ª pancada (m)">
              <input className="select fs-13 u-w-70px" type="text" inputMode="numeric"
                value={secondM} onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setSecondM(v); }} />
            </FilterField>
          </div>
          {notReach9.length > 0 && (
            <p className="fs-12 u-m-0-0-8px u-c-color-warn-dark">
              ⚠ Fora de alcance em regulação:{" "}
              {notReach9.map(r => `buraco ${r.hole} (par ${r.par}, ${r.dist}m)`).join("; ")}.
            </p>
          )}
          {teeAlcance && <HoleDiffTable tees={[{ tee: teeAlcance }]} driveM={driveM} secondM={secondM} />}
        </details>
      )}

      {/* ── Estimativa de score do torneio (field) ── */}
      {field.editions.length > 0 && (
        <details className="card" open>
          <summary className="fs-13 fw-600 u-cur-pointer u-user-select-none">
            🏆 Estimativa de score — {field.editions.length} edi{field.editions.length === 1 ? "ção" : "ções"} anterior{field.editions.length === 1 ? "" : "es"}
            {field.formatLabel && (
              <span className="muted fw-400 fs-11">{"  ·  estimativa sobre "}{field.nCounted} fiáve{field.nCounted === 1 ? "l" : "is"} ({field.formatLabel}{field.minField ? `, field ≥ ${field.minField}` : ""})</span>
            )}
          </summary>
          <div className="kpis u-m-8px-0-12px u-grid-template-columns-7squv u-jc-start">
            {field.avgWinner != null && <KpiCard label="Ganhar ≈" value={field.avgWinner} sub={field.parPerRound && field.nRoundsTypical ? fmtToPar(field.avgWinner - field.parPerRound * field.nRoundsTypical) : undefined} />}
            {field.avgTop10 != null && <KpiCard label="Top-10 ≈" value={field.avgTop10} sub={field.parPerRound && field.nRoundsTypical ? fmtToPar(field.avgTop10 - field.parPerRound * field.nRoundsTypical) : undefined} />}
            {field.avgMedian != null && <KpiCard label="Mediana ≈" value={field.avgMedian} />}
            {manuelTot != null && manuelPerRound != null && (
              <KpiCard label="Manuel ≈ (torneio)" value={manuelTot} color="var(--accent)" sub={`${manuelPerRound}/volta · ${manuelBasis === "índice" ? "ao índice" : "volta média"}`} />
            )}
          </div>
          {manuelTot != null && field.nRoundsTypical != null && field.avgWinner != null && (
            <p className="muted fs-12 u-m-0">
              {(() => {
                const tot = manuelTot;
                const dWin = tot - field.avgWinner;
                const dTop = field.avgTop10 != null ? tot - field.avgTop10 : null;
                const dMed = field.avgMedian != null ? tot - field.avgMedian : null;
                const parts: string[] = [];
                parts.push(dWin <= 0 ? "em prova pela vitória" : `faltam ~${dWin} para a média de vencedor`);
                if (dTop != null) parts.push(dTop <= 0 ? "dentro do top-10 típico" : `~${dTop} para o top-10`);
                if (dMed != null && dMed !== 0) parts.push(dMed < 0 ? `${-dMed} abaixo da mediana` : `${dMed} acima da mediana`);
                return <>Estimativa do Manuel ≈ <strong>{tot}</strong> ({field.nRoundsTypical} voltas, {manuelBasis === "índice" ? "ao índice" : "volta média"}): {parts.join(" · ")}.</>;
              })()}
            </p>
          )}
          <table className="dtable u-mt-8px">
            <thead><tr>
              <th>Ano</th>
              <th className="r">Rondas</th>
              <th className="r">Vencedor</th>
              <th className="r">Top-10</th>
              <th className="r">Mediana</th>
              <th className="r">Field</th>
            </tr></thead>
            <tbody>
              {field.editions.map(e => {
                const rowTitle = e.exclReason === "format"
                  ? `Formato ${e.nRounds}×${e.holesPerRound} ≠ ${field.formatLabel} — fora da estimativa`
                  : e.exclReason === "field"
                  ? `Field pequeno (${e.field}${field.minField ? " < " + field.minField : ""}) — amostra pouco fiável, fora da estimativa`
                  : undefined;
                return (
                <tr key={e.tcode} className={e.counted ? undefined : "u-op-0_5"} title={rowTitle}>
                  <td>{e.year}</td>
                  <td className="r">
                    {e.nRounds}
                    {e.exclReason === "format" && <span className="u-c-color-danger" title={`Formato diferente (${e.nRounds}×${e.holesPerRound}) — não conta`}> ⚠</span>}
                  </td>
                  <td className="r">{e.winner}</td>
                  <td className="r">{e.top10 ?? "–"}</td>
                  <td className="r">{e.median}</td>
                  <td className="r">
                    {e.field}
                    {e.exclReason === "field" && <span className="u-c-color-danger" title={`Field pequeno — não conta`}> ⚠</span>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted fs-11 u-m-6px-0-0">
            Scores totais das edições passadas deste torneio+escalão (member-history USKids).{" "}
            {field.formatLabel && (
              <>A estimativa usa só as {field.nCounted} edi{field.nCounted === 1 ? "ção" : "ções"} fiáve{field.nCounted === 1 ? "l" : "is"} — mesmo formato ({field.formatLabel}, nº de voltas × buracos)
              {field.minField ? ` e field ≥ ${field.minField}` : ""}.
              {(field.nExcludedFormat > 0 || field.nExcludedField > 0) && (
                <>{" "}Fora (a cinzento, ⚠):{" "}
                  {[
                    field.nExcludedFormat > 0 ? `${field.nExcludedFormat} de formato diferente` : null,
                    field.nExcludedField > 0 ? `${field.nExcludedField} com field pequeno` : null,
                  ].filter(Boolean).join(" e ")}.</>
              )}
              {" "}Top-10 só conta com field ≥ 10. </>
            )}
            "Manuel ≈" projeta-o {manuelBasis === "índice" ? `a jogar ao índice neste campo (${manuelPerRound}/volta × ${field.nRoundsTypical}) — a forma competitiva, não a média da época` : "pela sua volta média neste campo"}.
          </p>
        </details>
      )}
    </div>
  );
}

/** Classe da cor do valor face ao par (abaixo = verde, acima = vermelho). */
/** `public/data/course-hole-field.json` (scripts/build-course-hole-field.js):
 *  por campo e tee, [n, birdies, pares, bogeys] de cada buraco. */
interface CourseHoleField { c: Record<string, Record<string, { r: number; j: number; h: number[][] }>> }

/** O buraco (e o gémeo, num campo de 9 jogado 2×) somados: [n, b, p, bg]. */
function somaBuraco(h: number[][], hole: number, twin?: number): number[] | null {
  const out = [0, 0, 0, 0];
  for (const x of [h[hole - 1], twin != null ? h[twin - 1] : undefined]) {
    if (x) for (let i = 0; i < 4; i++) out[i] += x[i];
  }
  return out[0] > 0 ? out : null;
}

/** Birdie ou melhor · par · bogey ou pior em %, nos círculos/quadrados dos
 *  cartões (tamanho fixo — o círculo do birdie não se deforma). */
function DistBuraco({ par, c }: { par: number | null; c: number[] | null }) {
  if (!c || par == null || !c[0]) return MUTED;
  const pct = (k: number) => Math.round((c[k] / c[0]) * 100);
  return (
    <span className="u-d-inline-flex u-gap-4px u-jc-center">
      <span className={"sc-score sc-score-sm " + scClass(par - 1, par)}>{pct(1)}</span>
      <span className={"sc-score sc-score-sm " + scClass(par, par)}>{pct(2)}</span>
      <span className={"sc-score sc-score-sm " + scClass(par + 1, par)}>{pct(3)}</span>
    </span>
  );
}

function vsParTone(v: number | null, par: number | null): string {
  if (v == null || par == null) return "u-c-text";
  return v < par - 0.05 ? "u-c-color-good" : v > par + 0.05 ? "u-c-color-danger" : "u-c-text";
}

/** Cor do plano do buraco: texto (`c`) e bolinha (`bg`). */
const PLAN_TONE = {
  attack: { c: "u-c-color-good", bg: "u-bg-color-good" },
  neutral: { c: "u-c-text-3", bg: "u-bg-text-3" },
  defend: { c: "u-c-color-danger", bg: "u-bg-color-danger" },
} as const;

function Dot({ tone }: { tone: keyof typeof PLAN_TONE }) {
  return <span className={`cor-dot ${PLAN_TONE[tone].bg}`} />;
}

