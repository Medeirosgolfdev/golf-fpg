/**
 * TeeAdvisorView.tsx — Tab "Vantagem de Tee" da página /comparar
 *
 * Comparador aprofundado de tees de um campo para um júnior:
 *   1. Pancadas de perdão — playing handicap WHS por tee
 *      (PH = HI × Slope/113 + CR − Par). Tee mais longo costuma ter CR
 *      mais alto → mais pancadas recebidas → mais perdão.
 *   2. Distância habitual — percentil 70 dos metros das últimas voltas 18B
 *      do Manuel (a distância que já joga em competição). Quanto mais perto,
 *      mais "em casa".
 *   3. Perfil dos buracos — buracos alcançáveis em regulação dado o
 *      alcance de drive/2ª pancada do júnior. Lista os buracos que
 *      mudam de alcançável↔inalcançável entre tees.
 *   4. Histórico real — voltas do Manuel nesse campo/tee (média vs par).
 *
 * Conclusão final: veredicto ponderado com a contribuição de cada
 * critério visível e explicada.
 *
 * Estilos via classes existentes (.card, .dtable, .select, .input,
 * .muted) e tokens (sem hex hardcoded). Tabela ordenável (useSort +
 * SortableHdr) — regra absoluta do projecto.
 */
import React, { useEffect, useMemo, useState } from "react";
import type { Course, Tee } from "../../data/types";
import { loadPlayerData, type PlayerPageData } from "../../data/playerDataLoader";
import { getParTotal } from "../../ui/CourseHeroCard";
import { useSort, compareValuesNullsLast } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import EmptyState from "../../ui/EmptyState";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../../ui/Toolbar";
import { norm, fmtToPar, fmtSign, fmtHcp } from "../../utils/format";
import { median } from "../../utils/mathUtils";
import { calcCourseHcp } from "../../utils/whsCalc";
import { getTeeHex } from "../../utils/teeColors";
import SharedTeePill from "../../ui/TeePill";
import HoleDiffTable from "../../ui/HoleDiffTable";
import { reachBudget } from "../../utils/reach";
import { MANUEL_FED } from "../../constants/manuel";
import { resolvePlayedMeters, resolvePlayedTee, courseKeyName } from "../../utils/playedDistance";
import ExtLink from "../../ui/ExternalLink";
import SexSelect from "../../ui/SexSelect";
import Select from "../../ui/Select";
import NumberInput from "../../ui/NumberInput";
import SectionTitle from "../../ui/SectionTitle";
import { Tint } from "../../ui/DataStyle";
import { CLUB_SCALE } from "../../utils/clubScale";


/** Coerção segura para número — alguns campos do JSON vêm como string (ex: sd "14"). */
const toNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/* ═══════════════════ Escala de distâncias do saco ═══════════════════ */
// A escala vive em utils/clubScale (também escolhe o taco de saída do Alcance).

type ClubSortKey = "club" | "pct" | "dist";

/**
 * Tabela de distâncias estimadas do saco para um dado drive. Reage em tempo
 * real ao input "Drive (m)" do topo da página (recebe `driveM` por prop).
 * Ordenável por cabeçalho — regra absoluta do projecto.
 */
function ClubDistanceTable({ driveM }: { driveM: number }) {
  const { sortKey, sortDir, toggleSort } = useSort<ClubSortKey>("pct", "desc", { club: "asc" });
  const rows = useMemo(
    () => CLUB_SCALE.map(c => ({ ...c, dist: Math.round((driveM * c.pct) / 100) })),
    [driveM]
  );
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "club") return a.club.localeCompare(b.club, "pt") * dir;
      const av = sortKey === "pct" ? a.pct : a.dist;
      const bv = sortKey === "pct" ? b.pct : b.dist;
      return (av - bv) * dir;
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className="u-ox-auto u-pb-6px">
      <table className="dtable u-minw-320px">
        <thead>
          <tr>
            <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Taco</SortableHdr>
            <SortableHdr k="pct" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Percentagem constante do drive">% drive</SortableHdr>
            <SortableHdr k="dist" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Distância estimada para o drive configurado no topo">Dist (m)</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {sorted.map(c => (
            <tr key={c.abbr} className={c.abbr === "D" ? "u-fw-800" : undefined}>
              <td>{c.club} <span className="muted u-fs-fs-11">({c.abbr})</span></td>
              <td className="r mono">{c.pct}%</td>
              <td className="r mono u-fw-700">{c.dist}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════ Modelos de cálculo ═══════════════════ */


interface ReachInfo { hole: number; par: number; dist: number; budget: number; reachable: boolean }
interface ReachOutcome { reach: number[]; total: number; detail: ReachInfo[] }

/** Buracos alcançáveis em regulação dado alcance de drive + 2ª pancada. */
function reachableHoles(tee: Tee, driveM: number, secondM: number): ReachOutcome {
  const reach: number[] = [];
  const detail: ReachInfo[] = [];
  let total = 0;
  for (const h of tee.holes) {
    if (h.par == null || h.distance == null || h.par < 3) continue;
    total++;
    const budget = reachBudget(h.par, driveM, secondM);
    const reachable = h.distance <= budget;
    if (reachable) reach.push(h.hole);
    detail.push({ hole: h.hole, par: h.par, dist: h.distance, budget, reachable });
  }
  return { reach, total, detail };
}

interface TeeHist {
  n: number; typVsPar: number | null; best: number | null;
  /** Forma recente: nº de voltas consideradas e resultado típico (mediana) vs par das últimas (máx. 4). */
  recentN: number; recentTypVsPar: number | null;
}

/** Chave de tee robusta: ignora o prefixo "USKids" e a pontuação, para que
 *  "Boys 11" (etiqueta da volta) case com "USKids Boys 11" (tee do master). */
function teeKey(s: string): string {
  return norm(s).replace(/\buskids\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Histórico real do Manuel num campo+tee (voltas 18B com par conhecido).
 *  Devolve agregado (todas as voltas) e forma recente (últimas até 4, por data).
 *  A correspondência campo↔volta usa a mesma normalização robusta das distâncias
 *  (courseKeyName + resolvePlayedTee, com o override curado MANUEL_AWAY_TEE), para
 *  não perder voltas por travessão vs hífen ou "Boys 11" vs "USKids Boys 11". */
function teeHistory(
  data: PlayerPageData | null, courseName: string, tee: Tee,
  simCourses: Course[], fedId: string,
): TeeHist {
  const empty: TeeHist = { n: 0, typVsPar: null, best: null, recentN: 0, recentTypVsPar: null };
  if (!data) return empty;
  const ck = courseKeyName(courseName);
  const tk = teeKey(tee.teeName);
  const rs: { vsPar: number; gross: number; d: number }[] = [];
  for (const c of data.DATA) {
    if (courseKeyName(c.course) !== ck) continue;
    for (const r of c.rounds) {
      if (r.holeCount !== 18) continue;
      if (r.gross == null || r.par == null || r.gross <= 0) continue;
      // Esta volta foi jogada no tee em análise? Tenta a chave de tee (ignora
      // "USKids"); só se falhar recorre a resolvePlayedTee (override/cor curados).
      const sameTee = teeKey(r.tee) === tk
        || resolvePlayedTee(c.course, r.tee, simCourses, fedId)?.teeId === tee.teeId;
      if (!sameTee) continue;
      rs.push({ vsPar: r.gross - r.par, gross: r.gross, d: r.dateSort });
    }
  }
  if (rs.length === 0) return empty;
  rs.sort((a, b) => b.d - a.d); // mais recente primeiro
  const n = rs.length;
  // Mediana (não média): uma volta catastrófica não distorce o resultado típico.
  const typVsPar = median(rs.map(x => x.vsPar));
  const best = Math.min(...rs.map(x => x.gross));
  const recentN = Math.min(4, n);
  const recentTypVsPar = median(rs.slice(0, recentN).map(x => x.vsPar));
  return { n, typVsPar, best, recentN, recentTypVsPar };
}

/** Distância habitual = percentil 70 dos metros das últimas `cap` voltas 18B.
 *  O P70 inclina para o lado mais longo: representa a distância que o Manuel já
 *  joga com à-vontade em competição (Glen, Villa Padierna, Porto Santo…), sem
 *  ser puxada para baixo pelas voltas curtas de treino em casa — ao contrário
 *  da mediana, que caía no aglomerado dos tees curtos.
 *  A distância de cada volta vem do registo (`r.meters`) quando válido; quando
 *  vem vazio — típico dos torneios internacionais que a FPG regista sem jardas
 *  (Marco Simone, Villa Padierna, Glen, La Forêt…) — liga-se ao tee real do
 *  campo via `resolvePlayedMeters` (o MESMO que a JogadoresPage usa, incluindo
 *  o override curado `MANUEL_AWAY_TEE`). Assim as voltas longas internacionais
 *  deixam de ser excluídas em silêncio. */
function habitualDistance(
  data: PlayerPageData | null,
  simCourses: Course[],
  cap = 20,
): { value: number | null; n: number } {
  if (!data) return { value: null, n: 0 };
  const rounds: { m: number; d: number }[] = [];
  for (const c of data.DATA) for (const r of c.rounds) {
    if (r.holeCount !== 18) continue;
    const m = (r.meters != null && r.meters > 3000)
      ? r.meters
      : resolvePlayedMeters(c.course, r.tee, r.holeCount, simCourses, MANUEL_FED);
    if (m != null && m > 3000) rounds.push({ m, d: r.dateSort });
  }
  if (rounds.length === 0) return { value: null, n: 0 };
  rounds.sort((a, b) => b.d - a.d);
  const recent = rounds.slice(0, cap).map(r => r.m).sort((a, b) => a - b);
  // Percentil 70 por nearest-rank sobre as voltas mais recentes (ascendentes).
  const idx = Math.min(recent.length - 1, Math.max(0, Math.ceil(0.7 * recent.length) - 1));
  return { value: recent[idx], n: recent.length };
}

interface LongPerf {
  thresholdM: number; index: number;
  nLong: number; nShort: number;
  /** Voltas com score differential ≤ índice (jogadas ao nível do índice ou melhor). */
  nLongGood: number; nShortGood: number;
  /** Melhor (menor) score differential em campos longos, com campo e metros. */
  bestLong: { sd: number; course: string; meters: number } | null;
  /** Melhor (menor) score differential em campos CURTOS — para saber se o melhor
   *  golfe do período foi mesmo num campo longo. */
  bestShortSd: number | null;
}

/** Desempenho do jogador em campos LONGOS vs curtos (últimos 12 meses), medido
 *  por score differential. NÃO usa a média: o índice WHS é a média das 8 MELHORES
 *  de 20 voltas (o potencial num bom dia), e um jogador só joga ao índice ~1 em
 *  cada 5 voltas — por isso a média de differential fica sempre acima do índice e
 *  seria enganadora. Em vez disso conta as voltas jogadas AO NÍVEL DO ÍNDICE ou
 *  melhor (as que formam o handicap) e guarda o melhor differential. Usa o mesmo
 *  fallback de metros que a distância habitual, para incluir os torneios intl. */
function longTeePerformance(
  data: PlayerPageData | null, simCourses: Course[], thresholdM: number, index: number,
): LongPerf {
  const empty: LongPerf = { thresholdM, index, nLong: 0, nShort: 0, nLongGood: 0, nShortGood: 0, bestLong: null, bestShortSd: null };
  if (!data) return empty;
  // Só os últimos 12 meses: um júnior cresce depressa — o que era capaz há mais
  // de um ano não representa o jogo de hoje.
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  let longN = 0, shortN = 0, nLongGood = 0, nShortGood = 0;
  let bestLong: { sd: number; course: string; meters: number } | null = null;
  let bestShortSd: number | null = null;
  for (const c of data.DATA) for (const r of c.rounds) {
    if (r.holeCount !== 18 || r.dateSort < cutoff) continue;
    const sd = toNum(r.sd);
    if (sd == null) continue;
    const m = (r.meters != null && r.meters > 3000)
      ? r.meters
      : resolvePlayedMeters(c.course, r.tee, r.holeCount, simCourses, MANUEL_FED);
    if (m == null || m <= 3000) continue;
    const good = sd <= index;
    if (m >= thresholdM) {
      longN++; if (good) nLongGood++;
      if (bestLong == null || sd < bestLong.sd) bestLong = { sd, course: c.course, meters: m };
    } else {
      shortN++; if (good) nShortGood++;
      if (bestShortSd == null || sd < bestShortSd) bestShortSd = sd;
    }
  }
  return { thresholdM, index, nLong: longN, nShort: shortN, nLongGood, nShortGood, bestLong, bestShortSd };
}

/* ═══════════════════ Métricas por tee ═══════════════════ */

interface TeeMetrics {
  tee: Tee;
  dist: number | null;
  par: number;
  cr: number | null;
  slope: number | null;
  /** Pancadas recebidas (playing hcp arredondado) */
  ph: number | null;
  phRaw: number | null;
  /** Gross que joga ao handicap (SD = HI) */
  grossAlvo: number | null;
  deltaHab: number | null;
  gir: ReachOutcome;
  hist: TeeHist;
}

function buildMetrics(
  tee: Tee, hi: number, driveM: number, secondM: number,
  habitual: number | null, data: PlayerPageData | null, courseName: string,
  simCourses: Course[], fedId: string,
): TeeMetrics {
  const par = getParTotal(tee);
  const cr = tee.ratings?.holes18?.courseRating ?? null;
  const slope = tee.ratings?.holes18?.slopeRating ?? null;
  const dist = tee.distances?.total ?? null;
  const phRaw = cr != null && slope != null && par > 0 ? calcCourseHcp(hi, slope, cr, par) : null;
  const ph = phRaw != null ? Math.round(phRaw) : null;
  return {
    tee, dist, par, cr, slope, ph, phRaw,
    grossAlvo: ph != null ? par + ph : null,
    deltaHab: dist != null && habitual != null ? dist - habitual : null,
    gir: reachableHoles(tee, driveM, secondM),
    hist: teeHistory(data, courseName, tee, simCourses, fedId),
  };
}

/* ═══════════════════ Veredicto A vs B ═══════════════════ */

interface Conclusion {
  icon: string;
  title: string;
  text: React.ReactNode;
  /** >0 favorece A, <0 favorece B, 0 neutro */
  pts: number;
  available: boolean;
  /** Conclusão informativa (alerta) — não entra na pontuação do veredicto */
  informational?: boolean;
  /** Tom visual do cartão */
  tone?: "warn";
  /** Rótulo curto para o resumo do veredicto */
  short?: string;
}

function buildConclusions(a: TeeMetrics, b: TeeMetrics): Conclusion[] {
  const cs: Conclusion[] = [];
  const A = <TeeNameSpan tee={a.tee} />;
  const B = <TeeNameSpan tee={b.tee} />;

  // 1 — Saldo do tee longo: pancadas de perdão GANHAS vs nº de perigos CRIADOS.
  // A pergunta central: +7 pancadas para cobrir só 2 buracos difíceis é um bom
  // negócio; +2 pancadas para 3 perigos não é. O tee mais longo dá SEMPRE mais
  // perdão — o que decide é se essa compensação cobre os perigos que cria.
  if (a.ph != null && b.ph != null) {
    const longer = (a.dist ?? 0) >= (b.dist ?? 0) ? a : b;
    const shorter = longer === a ? b : a;
    const perdao = (longer.ph ?? 0) - (shorter.ph ?? 0);
    const haveGir = longer.gir.total > 0;
    const perigos = haveGir ? longer.gir.detail.filter(d => !d.reachable).length : 0;
    const saldo = perdao - perigos;
    // Banda morta: ±1 de saldo = empate (uma pancada de margem para um perigo
    // não é vantagem — se o dia corre mal não há folga). Só ≥2 ("com folga")
    // favorece mesmo o tee longo; ≤−2 favorece o curto.
    const ptsLonger = Math.abs(saldo) <= 1 ? 0 : Math.max(-3, Math.min(3, saldo > 0 ? saldo - 1 : saldo + 1));
    cs.push({
      icon: "⚖️", title: "Saldo: perdão vs perigos", short: "Saldo",
      text: (
        <>
          <TeeNameSpan tee={longer.tee} /> dá +{perdao} pancada{perdao === 1 ? "" : "s"} de perdão (gross alvo {longer.grossAlvo} vs {shorter.grossAlvo})
          {haveGir
            ? <> e cria {perigos} {perigos === 1 ? "perigo" : "perigos"} — buraco{perigos === 1 ? "" : "s"} fora de alcance em regulação. Saldo {fmtSign(saldo)}: {
                saldo >= 2 ? <>a compensação cobre os perigos <b>com folga</b> — o tee longo compensa.</>
                : saldo === 1 ? <>cobre os perigos <b>à justa</b>, sem margem — se algo correr mal não há folga. Na prática, <b>empate</b>.</>
                : saldo === 0 ? <>iguala exatamente os perigos — <b>empate</b>.</>
                : saldo === -1 ? <>fica a uma pancada de cobrir os perigos — sem margem; quase <b>empate</b>, ligeiramente desfavorável.</>
                : <>os perigos superam a compensação — o tee longo cobra mais do que dá.</>
              }</>
            : <>; sem distâncias por buraco para contar os perigos neste campo.</>}
        </>
      ),
      pts: haveGir ? (longer === a ? ptsLonger : -ptsLonger) : 0,
      available: true,
      informational: !haveGir,
    });
  } else {
    cs.push({ icon: "⚖️", title: "Saldo: perdão vs perigos", short: "Saldo", text: "Sem CR/Slope num dos tees — impossível calcular o perdão.", pts: 0, available: false });
  }

  // 2 — Ajuste à distância de competição (a distância que ele JÁ joga a sério).
  // O ideal é jogar PERTO dela: muito acima estica o jogo longo; muito ABAIXO
  // tira o desafio e trava o desenvolvimento — um júnior não cresce a recuar de
  // tee. Por isso penaliza os dois lados, não só o excesso.
  if (a.deltaHab != null && b.deltaHab != null) {
    const fitA = Math.abs(a.deltaHab), fitB = Math.abs(b.deltaHab);
    const diff = fitB - fitA; // positivo → A ajusta-se melhor (mais perto do habitual)
    const meaningful = Math.abs(diff) >= 150;
    const best = fitA <= fitB ? a : b;
    const other = best === a ? b : a;
    const desc = (m: TeeMetrics) => {
      const g = Math.round(m.deltaHab!);
      if (g > 200) return `${g} m acima do que joga em competição`;
      if (g < -200) return `${Math.abs(g)} m abaixo do que joga em competição`;
      return `à distância que já joga em competição (${fmtSign(g)} m)`;
    };
    cs.push({
      icon: "📏", title: "Ajuste à distância de competição", short: "Distância",
      text: (
        <>
          {A}: {desc(a)} · {B}: {desc(b)}.{" "}
          {!meaningful
            ? "Ambos perto da distância que já enfrenta — sem diferença relevante."
            : other.deltaHab! < -200
              ? <><TeeNameSpan tee={best.tee} /> está à distância que já joga a sério; <TeeNameSpan tee={other.tee} /> fica {Math.abs(Math.round(other.deltaHab!))} m abaixo disso — oferece menos desafio.</>
              : <><TeeNameSpan tee={other.tee} /> obriga a esticar o jogo para além do habitual; <TeeNameSpan tee={best.tee} /> está mais perto da sua distância de competição.</>}
        </>
      ),
      pts: meaningful ? Math.sign(diff) * Math.min(2, Math.abs(diff) / 400) : 0,
      available: true,
    });
  } else {
    cs.push({ icon: "📏", title: "Ajuste à distância de competição", short: "Distância", text: "Sem distância do tee ou sem histórico para estimar a distância de competição.", pts: 0, available: false });
  }

  // 3 — Buracos de alerta (informativo, não pontua: um buraco fora de alcance
  // não decide o tee — decide a ESTRATÉGIA com que esse buraco se joga)
  if (a.gir.total > 0 && b.gir.total > 0) {
    const alertsA = a.gir.detail.filter(d => !d.reachable);
    const alertsB = b.gir.detail.filter(d => !d.reachable);
    const describe = (ds: ReachInfo[]) =>
      ds.map(d => `buraco ${d.hole} (par ${d.par}, ${d.dist} m — faltam ${Math.max(0, d.dist - d.budget).toFixed(0)} m)`).join("; ");
    const hasAlerts = alertsA.length > 0 || alertsB.length > 0;
    const nAlertHoles = new Set([...alertsA, ...alertsB].map(d => d.hole)).size;
    cs.push({
      icon: "⚠️", title: "Buracos de alerta",
      tone: hasAlerts ? "warn" : undefined,
      text: !hasAlerts ? (
        <>Com o alcance configurado, todos os buracos chegam em regulação a partir de qualquer um dos tees.</>
      ) : (
        <>
          {alertsA.length > 0 && <>De {A}, green fora de alcance em regulação: {describe(alertsA)}. </>}
          {alertsB.length > 0 && <>De {B}, green fora de alcance em regulação: {describe(alertsB)}. </>}
          {nAlertHoles === 1 ? "Neste buraco" : "Nestes buracos"} a estratégia muda: máxima concentração
          no plano de jogo, atacar por etapas (layup confortável + approach curto) e aceitar com
          naturalidade perder aí uma pancada — o bogey é um bom resultado, o par é bónus.
        </>
      ),
      pts: 0, available: true, informational: true,
    });
  } else {
    cs.push({ icon: "⚠️", title: "Buracos de alerta", text: "Sem distâncias por buraco num dos tees.", pts: 0, available: false, informational: true });
  }

  // 4 — Histórico real (por tee). Mostra o que existe MESMO que só haja um tee
  // jogado — é normal jogar sempre o mesmo tee, e é precisamente essa transição
  // que se está a analisar. Só pontua quando há ≥2 voltas em AMBOS (comparável).
  if (a.hist.n === 0 && b.hist.n === 0) {
    cs.push({ icon: "📊", title: "Histórico real neste campo", short: "Histórico", text: "Sem voltas registadas neste campo.", pts: 0, available: false });
  } else {
    // Usa o típico RECENTE (mesma janela que a recomendação) para serem coerentes;
    // mostra o total de voltas entre parênteses.
    const desc = (m: TeeMetrics) => {
      if (m.hist.n === 0) return <><TeeNameSpan tee={m.tee} />: ainda sem voltas</>;
      const v = m.hist.recentTypVsPar ?? m.hist.typVsPar;
      if (m.hist.n >= 2 && v != null)
        return <><TeeNameSpan tee={m.tee} />: típico {fmtToPar(Math.round(v))} vs par (últimas {m.hist.recentN}{m.hist.n > m.hist.recentN ? <> de {m.hist.n}</> : null} voltas)</>;
      return <><TeeNameSpan tee={m.tee} />: {m.hist.n} volta{m.hist.n === 1 ? "" : "s"}{v != null ? <> ({fmtToPar(Math.round(v))} vs par)</> : null}</>;
    };
    const comparable = a.hist.n >= 2 && b.hist.n >= 2 && a.hist.recentTypVsPar != null && b.hist.recentTypVsPar != null;
    const diff = comparable ? (b.hist.recentTypVsPar! - a.hist.recentTypVsPar!) : 0;
    cs.push({
      icon: "📊", title: "Histórico real neste campo", short: "Histórico",
      text: (
        <>
          {desc(a)} · {desc(b)} <span className="muted">(mediana — ignora voltas atípicas)</span>.{" "}
          {comparable
            ? (Math.abs(diff) < 1 ? "Rendimento equivalente." : <>Scores típicos melhores de <TeeNameSpan tee={(diff > 0 ? a : b).tee} />.</>)
            : "Só há histórico num dos tees — é exactamente a mudança de tee que estás a ponderar."}
        </>
      ),
      pts: comparable ? Math.max(-3, Math.min(3, diff)) : 0,
      available: true,
      informational: !comparable,
    });
  }

  return cs;
}

/* ═══════════════════ UI helpers ═══════════════════ */

/** Pill de tee — usa o componente partilhado (.p .p-tee), passando o hex já
 *  resolvido com a dica scorecardMeta.teeColor (que o partilhado não conhece). */
function TeePill({ tee }: { tee: Tee }) {
  return <SharedTeePill name={tee.teeName} hex={getTeeHex(tee.teeName, tee.scorecardMeta?.teeColor)} />;
}

/** Tee referido no corpo do texto: pill partilhada num tamanho compacto (0.92em),
 *  para encaixar no fluxo das frases sem quebrar a linha. */
function TeeNameSpan({ tee }: { tee: Tee }) {
  return (
    <span className="u-fs-0_92em u-ws-nowrap">
      <SharedTeePill name={tee.teeName} hex={getTeeHex(tee.teeName, tee.scorecardMeta?.teeColor)} />
    </span>
  );
}

function NumInput({ value, onChange, step = 1, title }: {
  value: number; onChange: (v: number) => void; step?: number; title?: string;
}) {
  return (
    <NumberInput className="u-w-70px" value={value} step={step} title={title}
      onChange={t => { const v = parseFloat(t); if (Number.isFinite(v)) onChange(v); }} />
  );
}

/* ═══════════════════ Tabela de tees (ordenável) ═══════════════════ */

type TeeSortKey = "tee" | "dist" | "dhab" | "par" | "cr" | "slope" | "ph" | "alvo" | "gir" | "nh" | "avg";

const TEE_SORT_VAL: Record<TeeSortKey, (m: TeeMetrics) => number | string | null> = {
  tee: m => m.tee.teeName.toLowerCase(),
  dist: m => m.dist,
  dhab: m => m.deltaHab != null ? Math.abs(m.deltaHab) : null,
  par: m => m.par,
  cr: m => m.cr,
  slope: m => m.slope,
  ph: m => m.ph,
  alvo: m => m.grossAlvo,
  gir: m => m.gir.total > 0 ? m.gir.reach.length : null,
  nh: m => m.hist.n,
  avg: m => m.hist.recentTypVsPar,
};

function TeeTable({ rows, habitual }: { rows: TeeMetrics[]; habitual: number | null }) {
  const { sortKey, sortDir, toggleSort } = useSort<TeeSortKey>("dist", "desc", {
    tee: "asc", dhab: "asc", avg: "asc",
  });

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      return compareValuesNullsLast(TEE_SORT_VAL[sortKey](a), TEE_SORT_VAL[sortKey](b), dir);
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className="u-ox-auto u-pb-14px">
      <table className="dtable">
        <thead>
          <tr>
            <SortableHdr k="tee"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Tee</SortableHdr>
            <SortableHdr k="dist"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Dist (m)</SortableHdr>
            <SortableHdr k="dhab"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Diferença para a distância habitual">Δ hab.</SortableHdr>
            <SortableHdr k="par"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Par</SortableHdr>
            <SortableHdr k="cr"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">CR</SortableHdr>
            <SortableHdr k="slope" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Slope</SortableHdr>
            <SortableHdr k="ph"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Pancadas recebidas (playing handicap WHS)">Perdão</SortableHdr>
            <SortableHdr k="alvo"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Gross que joga ao handicap (SD = HI)">Gross alvo</SortableHdr>
            <SortableHdr k="gir"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Buracos alcançáveis em regulação com o alcance configurado">Alcanç.</SortableHdr>
            <SortableHdr k="nh"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Voltas 18B do Manuel neste tee">Voltas</SortableHdr>
            <SortableHdr k="avg"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Resultado típico recente (mediana das últimas voltas) vs par — ignora voltas atípicas">Típico vs Par</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {sorted.map(m => (
            <tr key={m.tee.teeId + "|" + (m.dist ?? "") + "|" + (m.cr ?? "")}>
              <td><TeePill tee={m.tee} /></td>
              <td className="r mono">{m.dist ?? "–"}</td>
              <td className={"r mono" + (m.deltaHab != null && Math.abs(m.deltaHab) <= 200 ? " u-c-color-good-dark" : "")}>
                {m.deltaHab != null && habitual != null ? fmtSign(m.deltaHab, 0) : "–"}
              </td>
              <td className="r mono">{m.par || "–"}</td>
              <td className="r mono">{m.cr != null ? m.cr.toFixed(1) : "–"}</td>
              <td className="r mono">{m.slope ?? "–"}</td>
              <td className="r mono u-fw-700">{m.ph != null ? m.ph : "–"}</td>
              <td className="r mono">{m.grossAlvo ?? "–"}</td>
              <td className="r mono">{m.gir.total > 0 ? `${m.gir.reach.length}/${m.gir.total}` : "–"}</td>
              <td className="r mono">{m.hist.n || "–"}</td>
              <td className="r mono">{m.hist.recentTypVsPar != null ? fmtToPar(Math.round(m.hist.recentTypVsPar)) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════ Tabela de diferenças buraco a buraco (A vs B) ═══════════════ */

/* ═══════════════════ Vista principal ═══════════════════ */

export default function TeeAdvisorView({ simCourses, initialCourseKey }: { simCourses: Course[]; initialCourseKey?: string }) {
  const sortedCourses = useMemo(
    () => [...simCourses].sort((a, b) => a.master.name.localeCompare(b.master.name, "pt", { sensitivity: "base" })),
    [simCourses]
  );

  const defaultCourseKey = useMemo(() => {
    // Dentro dos Campos: abre no campo seleccionado na lista.
    if (initialCourseKey && sortedCourses.some(c => c.courseKey === initialCourseKey)) return initialCourseKey;
    const sds = sortedCourses.find(c => /santo\s+d[ao]\s+serra/i.test(c.master.name));
    return sds?.courseKey ?? sortedCourses[0]?.courseKey ?? "";
  }, [sortedCourses, initialCourseKey]);

  const [courseKey, setCourseKey] = useState(defaultCourseKey);
  const [sexFilter, setSexFilter] = useState<"M" | "F">("M");
  const [hcp, setHcp] = useState<number>(10);
  const [hcpTouched, setHcpTouched] = useState(false);
  const [driveM, setDriveM] = useState(185);
  const [secondM, setSecondM] = useState(160);
  const [habOverride, setHabOverride] = useState<number | null>(null);
  const [teeAId, setTeeAId] = useState("");
  const [teeBId, setTeeBId] = useState("");

  const [manuelData, setManuelData] = useState<PlayerPageData | null>(null);
  useEffect(() => {
    let alive = true;
    loadPlayerData(MANUEL_FED)
      .then(d => { if (alive) setManuelData(d); })
      .catch(() => { /* sem dados do Manuel — a vista degrada graciosamente */ });
    return () => { alive = false; };
  }, []);

  // HCP default = HCP actual do Manuel (até o utilizador editar)
  useEffect(() => {
    if (!hcpTouched && manuelData) {
      const cur = manuelData.HCP_INFO?.current ?? manuelData.META?.latestHcp;
      if (cur != null && Number.isFinite(cur)) setHcp(cur);
    }
  }, [manuelData, hcpTouched]);

  const course = useMemo(
    () => sortedCourses.find(c => c.courseKey === courseKey) ?? sortedCourses[0],
    [sortedCourses, courseKey]
  );

  const tees = useMemo(() => {
    if (!course) return [];
    const seen = new Set<string>();
    return course.master.tees.filter(t => {
      if (t.sex !== sexFilter && t.sex !== "U") return false;
      const k = `${norm(t.teeName)}|${t.distances?.total ?? ""}|${t.ratings?.holes18?.courseRating ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [course, sexFilter]);

  const hab = useMemo(() => habitualDistance(manuelData, simCourses), [manuelData, simCourses]);
  const habEff = habOverride ?? hab.value;

  const metrics = useMemo(
    () => tees.map(t => buildMetrics(t, hcp, driveM, secondM, habEff, manuelData, course?.master.name ?? "", simCourses, MANUEL_FED)),
    [tees, hcp, driveM, secondM, habEff, manuelData, course, simCourses]
  );

  // Par A/B default: amarelas vs vermelhas; fallback mais longo vs mais curto
  const { teeA, teeB } = useMemo(() => {
    const byId = (id: string) => metrics.find(m => m.tee.teeId === id);
    let a = teeAId ? byId(teeAId) : undefined;
    let b = teeBId ? byId(teeBId) : undefined;
    if (!a || !b) {
      const amar = metrics.find(m => /amarel/i.test(m.tee.teeName));
      const verm = metrics.find(m => /vermelh/i.test(m.tee.teeName));
      if (amar && verm) { a = a ?? amar; b = b ?? verm; }
      else {
        const withDist = metrics.filter(m => m.dist != null).sort((x, y) => (y.dist ?? 0) - (x.dist ?? 0));
        a = a ?? withDist[0];
        b = b ?? withDist.find(m => m !== a) ?? withDist[1];
      }
    }
    if (a && b && a.tee.teeId === b.tee.teeId) b = metrics.find(m => m.tee.teeId !== a!.tee.teeId);
    return { teeA: a, teeB: b };
  }, [metrics, teeAId, teeBId]);

  const conclusions = useMemo(
    () => (teeA && teeB ? buildConclusions(teeA, teeB) : []),
    [teeA, teeB]
  );

  // Recomendação ancorada na EVIDÊNCIA: a distância que o Manuel já joga em
  // competição (habEff) e se já joga ao handicap no tee curto (= superou-o). A
  // janela 24-28× do drive é só referência secundária — quando o que ele joga a
  // sério a ultrapassa, é sinal de que o alcance real é maior do que o drive configurado.
  const recommendation = useMemo(() => {
    if (!teeA || !teeB || teeA.dist == null || teeB.dist == null) return null;
    const longer = teeA.dist >= teeB.dist ? teeA : teeB;
    const shorter = longer === teeA ? teeB : teeA;
    const low = Math.round(24 * driveM), high = Math.round(28 * driveM);
    const alerts = longer.gir.detail.filter(d => !d.reachable).length;
    const perdao = longer.ph != null && shorter.ph != null ? longer.ph - shorter.ph : null;
    // Já joga o tee longo? (cabe na distância de competição demonstrada)
    const longerWithinPlayed = habEff != null && longer.dist! <= habEff + 150;
    // Quanto é que o tee curto fica abaixo da distância de competição (para a msg).
    const shorterBelowPlayed = habEff != null ? Math.round(habEff - shorter.dist!) : null;
    // Já joga ao handicap no tee curto? (melhor gross ≈ gross alvo) → superou-o
    const outgrewShorter = shorter.hist.n >= 1 && shorter.hist.best != null && shorter.grossAlvo != null
      && shorter.hist.best <= shorter.grossAlvo + 1;
    // Forma NESTE campo (a média vs par já desconta a dificuldade, porque o
    // playing handicap do tee sobe com o CR/Slope). Usa a forma recente quando há.
    const sForm = shorter.hist.recentTypVsPar ?? shorter.hist.typVsPar;
    const lForm = longer.hist.recentTypVsPar ?? longer.hist.typVsPar;
    // Ainda não faz bons resultados nem no tee CURTO deste campo (bem acima do
    // que o handicap aponta) → subir de tee aqui é prematuro.
    const strugglesShorterHere = shorter.hist.n >= 2 && sForm != null && shorter.ph != null && sForm > shorter.ph + 4;
    // Já joga BEM o tee longo NESTE campo → sinal forte para subir.
    const longGoodHere = longer.hist.n >= 2 && lForm != null && longer.ph != null && lForm <= longer.ph + 2;
    const readyByDistance = habEff != null && (longerWithinPlayed || outgrewShorter);
    const beyondWindow = habEff != null && habEff > high;
    // Desempenho real em campos do comprimento do tee longo (ou acima), 12 meses.
    const perfThreshold = Math.round(((longer.dist ?? 0) - 150) / 50) * 50;
    const longPerf = longTeePerformance(manuelData, simCourses, perfThreshold, hcp);
    // Saldo: pancadas extra ganhas vs perigos criados ao subir de tee.
    const saldo = perdao != null ? perdao - alerts : null;
    const goodDeal = saldo != null && saldo >= 2;          // cobre os perigos com folga
    const badDeal = saldo != null && saldo <= -2;          // perigos superam o perdão
    const neverPlayedHere = shorter.hist.n === 0 && longer.hist.n === 0;

    // Modo da recomendação (por prioridade). Não há "arrisca sempre": a distância
    // abre a porta, mas um saldo negativo (mais perigos que perdão) ou não conhecer
    // o campo podem desaconselhar subir já.
    type RecMode = "go" | "suit" | "caution" | "master" | "hold";
    let mode: RecMode;
    if (habEff == null) {
      mode = (longer.dist! <= high && alerts <= 2) ? "go" : "hold";
    } else if (longGoodHere) {
      mode = "go";                                 // já joga BEM o tee longo aqui
    } else if (!readyByDistance) {
      mode = strugglesShorterHere ? "master" : "hold";
    } else if (badDeal) {
      mode = "caution";                            // tem distância, mas mau negócio aqui
    } else if (strugglesShorterHere) {
      mode = "suit";                               // curto não lhe assenta; longo pode encaixar
    } else {
      mode = "go";
    }
    const stepUp = mode === "go" || mode === "suit";

    return {
      longer, shorter, low, high, alerts, perdao, saldo, goodDeal,
      mode, neverPlayedHere,
      longerWithinPlayed, shorterBelowPlayed, stepUp, beyondWindow,
      habitual: habEff, strugglesShorterHere, longGoodHere, sForm, lForm,
      shorterPh: shorter.ph,
      shortRecentN: shorter.hist.recentN, longRecentN: longer.hist.recentN,
      longPerf,
    };
  }, [teeA, teeB, driveM, habEff, manuelData, simCourses, hcp]);

  // Frase de evidência (dados reais) sobre o desempenho dele em campos longos —
  // partilhada pelas mensagens de recomendação que mandam subir de tee.
  const perfLine = useMemo(() => {
    const lp = recommendation?.longPerf;
    if (!lp || lp.nLong < 3) return null;
    // O índice WHS é o potencial num bom dia (média das 8 melhores de 20); só se
    // joga ao índice ~1 em cada 5 voltas. Por isso conta-se as voltas jogadas AO
    // NÍVEL DO ÍNDICE ou melhor, não a média (que é sempre mais alta).
    const pLong = lp.nLong ? lp.nLongGood / lp.nLong : 0;
    const pShort = lp.nShort ? lp.nShortGood / lp.nShort : 0;
    const asGoodAsShort = lp.nShort >= 3 && pLong >= pShort - 0.01;
    // 10/11/2026: cada afirmação só sai quando os números a suportam. Antes a
    // frase dizia SEMPRE «os dados dão-te confiança», «abaixo do teu índice» e «é
    // aí que mostras o teu melhor golfe» — mesmo com 0 voltas ao nível do índice.
    const confianca = lp.nLongGood >= 1 && (lp.nShort < 3 || asGoodAsShort);
    const best = lp.bestLong;
    const bestVsIndice = best == null ? null
      : best.sd < lp.index ? "abaixo do teu índice"
      : best.sd > lp.index ? "acima do teu índice"
      : "igual ao teu índice";
    // O melhor differential do período foi num campo longo?
    const melhorFoiLongo = best != null && best.sd <= lp.index && (lp.bestShortSd == null || best.sd <= lp.bestShortSd);
    return (
      <>
        {" "}{confianca ? "Os dados dão-te confiança" : "O que os dados dizem"}: nos <b>últimos 12 meses</b> jogaste <b>{lp.nLong} voltas em campos de {lp.thresholdM} m ou mais</b> e
        em <b>{lp.nLongGood}</b> delas jogaste ao nível do teu índice ({fmtHcp(lp.index)}) ou melhor
        {asGoodAsShort ? <> — tão frequente como nos campos curtos</> : null}.
        {best
          ? <> O teu melhor differential em campos longos neste período (<b>{best.sd.toFixed(1)}</b>, {bestVsIndice}) foi em {best.course} ({best.meters} m).</>
          : null}
        {asGoodAsShort
          ? <>{" "}Jogar longo não te tira qualidade{melhorFoiLongo ? " — é aí que mostras o teu melhor golfe" : ""}.</>
          : null}
      </>
    );
  }, [recommendation]);

  if (sortedCourses.length === 0) {
    return <EmptyState icon="🏌️" message="Sem campos disponíveis." />;
  }

  return (
    <>
      <Toolbar>
        <ToolbarTitle>⛳ Campo</ToolbarTitle>
        <Select value={course?.courseKey ?? ""} onChange={v => { setCourseKey(v); setTeeAId(""); setTeeBId(""); }}>
          {sortedCourses.map(c => <option key={c.courseKey} value={c.courseKey}>{c.master.name}</option>)}
        </Select>
        <ToolbarSep />
        <ToolbarMeta>Tees</ToolbarMeta>
        <SexSelect value={sexFilter} onChange={v => { setSexFilter(v); setTeeAId(""); setTeeBId(""); }} />
        <ToolbarSep />
        <ToolbarMeta>HCP</ToolbarMeta>
        <NumInput value={hcp} step={0.1} title="Handicap index do jogador" onChange={v => { setHcp(v); setHcpTouched(true); }} />
        <ToolbarSep />
        <ToolbarMeta>Drive (m)</ToolbarMeta>
        <NumInput value={driveM} step={5} title="Alcance médio de drive" onChange={setDriveM} />
        <ToolbarMeta>2ª panc. (m)</ToolbarMeta>
        <NumInput value={secondM} step={5} title="Alcance médio da 2ª pancada (madeira/híbrido)" onChange={setSecondM} />
      </Toolbar>

      <div className="card u-d-flex u-ai-center u-gap-10px u-fwr-wrap">
        <span className="u-fs-fs-22">📏</span>
        <span className="u-fw-800 u-fs-fs-15">Distância habitual</span>
        <NumberInput variant="big" className="u-w-110px" step={50}
          value={habEff != null ? Math.round(habEff) : ""}
          onChange={t => { const v = parseFloat(t); setHabOverride(Number.isFinite(v) ? v : null); }}
          title="Distância de referência a que o jogador está habituado — edita para simular outro cenário"
        />
        <span className="u-fw-700 u-fs-fs-15">m</span>
        {habOverride != null ? (
          <button
            type="button"
            onClick={() => setHabOverride(null)}
            className="btn"
          >
            ↺ Repor automático{hab.value != null ? ` (${hab.value.toFixed(0)} m)` : ""}
          </button>
        ) : (
          <span className="muted u-fs-fs-13">
            {hab.value != null ? `percentil 70 das últimas ${hab.n} voltas 18B do Manuel — a distância que já joga em competição` : "sem histórico — introduz um valor"}
          </span>
        )}
      </div>

      {tees.length === 0 ? (
        <EmptyState icon="🔍" message="Este campo não tem tees para o filtro seleccionado." />
      ) : (
        <>
          <div className="card">
            <SectionTitle as="div" icon="🟡">Tees de {course?.master.name}</SectionTitle>
            <div className="muted u-fs-fs-12 u-mt-6px u-mb-10px">
              Perdão = pancadas recebidas WHS (HI×Slope/113 + CR − Par) · Gross alvo = gross que joga ao handicap (SD = HI) · Clica no cabeçalho para ordenar
            </div>
            <TeeTable rows={metrics} habitual={habEff} />
          </div>

          {teeA && teeB && (
            <div className="card u-bl-4px-solid-accent">
              <SectionTitle as="div" icon="🆚" right={<>
                <Tint bd={getTeeHex(teeA.tee.teeName, teeA.tee.scorecardMeta?.teeColor)} className="u-d-contents taa-tee-sel">
                  <Select value={teeA.tee.teeId} onChange={setTeeAId}>
                    {metrics.map(m => <option key={m.tee.teeId} value={m.tee.teeId}>{m.tee.teeName}{m.dist != null ? ` (${m.dist} m)` : ""}</option>)}
                  </Select>
                </Tint>
                <span className="muted">vs</span>
                <Tint bd={getTeeHex(teeB.tee.teeName, teeB.tee.scorecardMeta?.teeColor)} className="u-d-contents taa-tee-sel">
                  <Select value={teeB.tee.teeId} onChange={setTeeBId}>
                    {metrics.map(m => <option key={m.tee.teeId} value={m.tee.teeId}>{m.tee.teeName}{m.dist != null ? ` (${m.dist} m)` : ""}</option>)}
                  </Select>
                </Tint>
              </>}>
                Confronto de tees
              </SectionTitle>

              <div className="u-d-flex u-fd-column u-gap-10px u-mt-12px">
                {conclusions.map((c, i) => (
                  <div key={i} className={"advice-card" + (c.tone === "warn" ? " warn" : "") + (c.available ? "" : " off")}>
                    <span className="u-fs-fs-18 u-lh-1_2">{c.icon}</span>
                    <div className="u-fl-1">
                      <div className="u-fw-700 u-fs-fs-13">{c.title}</div>
                      <div className="u-fs-fs-13 u-lh-1_5 u-mt-2px">{c.text}</div>
                    </div>
                    {c.available && c.pts !== 0 && (
                      <span className="u-fsh-0" title={`Contribuição para o veredicto: ${fmtSign(c.pts, 1)}`}>
                        <TeePill tee={(c.pts > 0 ? teeA : teeB).tee} />
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="u-mt-16px">
                <SectionTitle as="div" icon="📋">Diferença buraco a buraco — {teeA.tee.teeName} vs {teeB.tee.teeName}</SectionTitle>
                <div className="muted u-fs-fs-12 u-mb-8px">
                  Linhas "após drive" = metros que faltam para o green depois da pancada do tee (0 = green alcançado; no par 3 a própria pancada do tee é a do green). Linhas "após 2ª pancada" = o que sobra depois da 2ª pancada grande (madeira/híbrido), só nos par 4/5 — num par 5 é o approach que entra no green. · ✗ = green fora de alcance em regulação
                </div>
                <HoleDiffTable tees={[{ tee: teeA.tee, label: <TeePill tee={teeA.tee} /> }, { tee: teeB.tee, label: <TeePill tee={teeB.tee} /> }]} driveM={driveM} secondM={secondM} />
              </div>

              {recommendation && (
                <div className="u-mt-14px u-p-14px-16px u-br-radius u-bg-accent-light u-bd-1px-solid-accent u-d-flex u-gap-12px u-ai-center u-fwr-wrap">
                  <span className="u-fs-fs-24">{
                    recommendation.mode === "go" ? "🚀"
                    : recommendation.mode === "suit" ? "🎯"
                    : recommendation.mode === "caution" ? "🤔"
                    : "🛡️"
                  }</span>
                  <div className="u-fl-1 u-minw-220px">
                    <div className="u-fw-800 u-fs-fs-14 u-lh-1_5">
                      {recommendation.mode === "go"
                        ? <>Avança para as <TeeNameSpan tee={recommendation.longer.tee} /> — já jogas esta distância em competição</>
                        : recommendation.mode === "suit"
                          ? <>As <TeeNameSpan tee={recommendation.longer.tee} /> talvez sejam mais adequadas ao teu jogo</>
                          : recommendation.mode === "caution"
                            ? <>Aqui, as <TeeNameSpan tee={recommendation.shorter.tee} /> são a escolha sensata</>
                            : recommendation.mode === "master"
                              ? <>Primeiro, domina as <TeeNameSpan tee={recommendation.shorter.tee} /> neste campo</>
                              : <>Por agora, fica nas <TeeNameSpan tee={recommendation.shorter.tee} /> — o salto ainda é grande</>}
                    </div>
                    <div className="u-fs-fs-13 u-mt-4px u-lh-1_6">
                      {recommendation.mode === "suit" ? (
                        <>
                          Ainda não bateste as <TeeNameSpan tee={recommendation.shorter.tee} /> deste campo{recommendation.sForm != null && <> (resultado típico {fmtToPar(Math.round(recommendation.sForm))} vs par {recommendation.shortRecentN === recommendation.shorter.hist.n ? "" : "nas últimas "}{recommendation.shortRecentN} volta{recommendation.shortRecentN === 1 ? "" : "s"}, quando o handicap aqui aponta para ~{fmtToPar(recommendation.shorterPh ?? 0)})</>} — mas isso pode não ser falta de jogo. Um campo curto demais <b>tira-te o driver da mão</b>, deixa-te distâncias <i>tweener</i> (nem wedge cheio, nem ferro confortável) e não premia o teu comprimento. As <TeeNameSpan tee={recommendation.longer.tee} /> ({recommendation.longer.dist} m) estão dentro da distância que já jogas a sério{recommendation.habitual != null ? <> ({Math.round(recommendation.habitual)} m)</> : null} e devolvem-te o driver, pancadas cheias e <b>variedade de tacos</b> no approach — podem encaixar melhor no teu jogo.{perfLine}{recommendation.perdao != null && recommendation.perdao > 0 && <> Ainda recebes +{recommendation.perdao} pancada{recommendation.perdao === 1 ? "" : "s"} de perdão{recommendation.alerts > 0 ? <> (saldo {fmtSign(recommendation.saldo!)})</> : null}.</>} Vale a pena experimentá-las e comparar os resultados.{recommendation.neverPlayedHere && <> Como é a tua estreia no campo, ganha-lhe a medida nas primeiras voltas.</>}
                        </>
                      ) : recommendation.mode === "go" ? (
                        <>
                          <b>Estás pronto para as <TeeNameSpan tee={recommendation.longer.tee} /></b> ({recommendation.longer.dist} m):
                          {recommendation.habitual != null
                            ? <> é uma distância que já enfrentas a sério em competição ({Math.round(recommendation.habitual)} m).</>
                            : <> está dentro do comprimento adequado ao teu drive de {driveM} m (24–28× ≈ {recommendation.low}–{recommendation.high} m).</>}
                          {perfLine}
                          {recommendation.longGoodHere && recommendation.lForm != null && (
                            <> E neste campo em concreto já lá jogas bem — resultado típico {fmtToPar(Math.round(recommendation.lForm))} {recommendation.longRecentN === recommendation.longer.hist.n ? "" : "nas últimas "}{recommendation.longRecentN} volta{recommendation.longRecentN === 1 ? "" : "s"}.</>
                          )}
                          {recommendation.perdao != null && recommendation.perdao > 0 && (
                            <> Ainda por cima recebes +{recommendation.perdao} pancada{recommendation.perdao === 1 ? "" : "s"} de perdão{recommendation.alerts > 0
                              ? <> para {recommendation.alerts} perigo{recommendation.alerts === 1 ? "" : "s"} (saldo {fmtSign(recommendation.saldo!)}{recommendation.goodDeal ? ", cobre-os com folga" : ""})</>
                              : <> e nenhum buraco fica fora de alcance</>}.</>
                          )}
                          {recommendation.beyondWindow && (
                            <> O teu alcance real já vai além da janela de {driveM} m de drive — não te limites a ela.</>
                          )}
                          {recommendation.neverPlayedHere
                            ? <> Como é a tua estreia neste campo, entra com plano de jogo e ganha-lhe a medida — a distância, essa, não é problema.</>
                            : <> Atira-te com confiança; as <TeeNameSpan tee={recommendation.shorter.tee} /> ficam como rede de segurança num dia mais difícil.</>}
                        </>
                      ) : recommendation.mode === "caution" ? (
                        <>
                          Tens distância para as <TeeNameSpan tee={recommendation.longer.tee} /> ({recommendation.longer.dist} m){recommendation.habitual != null && <> — já jogas {Math.round(recommendation.habitual)} m em competição</>}. Mas <b>neste campo</b> elas criam {recommendation.alerts} buraco{recommendation.alerts === 1 ? "" : "s"} fora de alcance em regulação e só dão +{recommendation.perdao} de perdão (<b>saldo {recommendation.saldo}</b>): mais castigo do que recompensa.{recommendation.neverPlayedHere && <> E ainda não o conheces.</>} As <TeeNameSpan tee={recommendation.shorter.tee} /> ({recommendation.shorter.dist} m) já são um teste a sério{recommendation.shorterBelowPlayed != null && recommendation.shorterBelowPlayed <= 400 ? " (perto da tua distância de competição)" : ""} e alcanças {recommendation.shorter.gir.reach.length}/{recommendation.shorter.gir.total} greens em regulação. {recommendation.neverPlayedHere ? "Conhece o campo primeiro" : "Fica nelas por agora"} e guarda as <TeeNameSpan tee={recommendation.longer.tee} /> para quando o saldo jogar a teu favor.
                        </>
                      ) : recommendation.mode === "master" ? (
                        <>
                          {recommendation.longerWithinPlayed
                            ? <>Já jogas esta distância noutros campos, mas <b>aqui</b> ainda não tens bons resultados nem das <TeeNameSpan tee={recommendation.shorter.tee} /></>
                            : <>Ainda não tens bons resultados nas <TeeNameSpan tee={recommendation.shorter.tee} /> deste campo</>}
                          {recommendation.sForm != null && <> — resultado típico {fmtToPar(Math.round(recommendation.sForm))} {recommendation.shortRecentN === recommendation.shorter.hist.n ? "" : "nas últimas "}{recommendation.shortRecentN} volta{recommendation.shortRecentN === 1 ? "" : "s"}, quando o teu handicap aqui aponta para ~{fmtToPar(recommendation.shorterPh ?? 0)}</>}.
                          {" "}Consolida primeiro o teu campo nas <TeeNameSpan tee={recommendation.shorter.tee} /> e sobe de tee aqui quando os resultados acompanharem o que já fazes noutros campos longos.
                        </>
                      ) : (
                        <>
                          <TeeNameSpan tee={recommendation.longer.tee} /> ({recommendation.longer.dist} m) está
                          {recommendation.habitual != null
                            ? <> acima da distância que já jogas a sério ({Math.round(recommendation.habitual)} m){recommendation.perdao != null && recommendation.alerts > 0 && <>, e a troca só te dá +{recommendation.perdao} pancada{recommendation.perdao === 1 ? "" : "s"} para {recommendation.alerts} perigo{recommendation.alerts === 1 ? "" : "s"} (saldo {fmtSign(recommendation.saldo!)})</>}</>
                            : <> acima do comprimento adequado ao teu drive de {driveM} m (24–28× ≈ {recommendation.low}–{recommendation.high} m)</>}.
                          {" "}Consolida primeiro nas <TeeNameSpan tee={recommendation.shorter.tee} /> e sobe quando jogares esta distância com regularidade.
                        </>
                      )}
                    </div>
                  </div>
                  <TeePill tee={(recommendation.stepUp ? recommendation.longer : recommendation.shorter).tee} />
                </div>
              )}
            </div>
          )}

          <div className="muted u-fs-fs-11 u-lh-1_6 u-mt-4px">
            Metodologia: o <b>saldo</b> compara as pancadas de perdão que o tee mais longo dá
            (fórmula WHS de playing handicap — mais Course Rating = mais pancadas recebidas) com o
            número de perigos que cria (buracos fora de alcance em regulação). Saldo positivo = a
            compensação cobre os perigos com folga. A <b>distância de competição</b> é o percentil 70
            das últimas 20 voltas de 18 buracos (a distância que ele já joga a sério, com os torneios
            internacionais ligados ao tee real do campo); o ajuste premia jogar PERTO dela — muito
            acima estica o jogo longo, muito abaixo tira o desafio. Os buracos de alerta assumem
            drive + 2ª pancada configurados acima (par 3 ≤ drive · par 4 ≤ drive+2ª · par 5 ≤ drive+2×2ª).
            A <b>forma no campo</b> usa a <b>mediana</b> ("resultado típico"), não a média — uma
            volta catastrófica não distorce o retrato — e dá prioridade às últimas voltas; o
            desempenho em campos longos usa só os <b>últimos 12 meses</b> (um júnior cresce depressa)
            e mede-se pelas voltas jogadas <b>ao nível do índice ou melhor</b>, não pela média: o índice
            WHS é a média das 8 MELHORES de 20 voltas (o potencial num bom dia) e só ~1 em cada 5 voltas
            se joga ao índice, por isso a média de differential fica sempre acima dele e seria enganadora.
            A recomendação NÃO empurra sempre para o tee longo: a distância abre a porta, mas se o
            <b> saldo for negativo</b> (mais perigos que perdão) ou ele <b>ainda não conhecer o campo</b>,
            aconselha cautela — o tee mais curto e conhecido é a escolha sensata. Se ainda não faz
            bons resultados nem no tee curto deste campo, manda dominá-lo primeiro; se já joga bem o
            tee longo aqui (ou se o tee curto não premia o seu jogo), manda subir. A janela
            Longleaf/USGA (24-28× o drive, dados Trackman da US Kids Golf Foundation + ASGCA) é só
            referência secundária — quando o que ele já joga a ultrapassa, é sinal de que o alcance
            real é maior do que o drive configurado.
          </div>

          <details className="card u-mt-8px">
            <summary className="u-cur-pointer u-fw-700 u-fs-fs-13">
              📐 Porquê 24–28× a distância de drive?
            </summary>
            <div className="u-fs-fs-13 u-lh-1_7 u-mt-10px">
              <p className="u-m-0-0-8px">
                <b>1 — O drive é o factor de escala do saco inteiro.</b> As medições Trackman
                recolhidas pela US Kids Golf Foundation e pela ASGCA mostram que as distâncias dos
                outros tacos são percentagens notavelmente constantes do drive, do profissional de
                tour ao júnior: o ferro 7 anda nos ~65–70% do drive, o wedge nos ~40–50%. Conhecendo
                o drive de um jogador, conhece-se o alcance do jogo todo.
              </p>
              <div className="u-m-0-0-12px u-p-10px-12px u-br-radius u-bg-bg-muted u-bd-1px-solid-border-light">
                <SectionTitle as="div">Distâncias estimadas do saco — drive de {driveM} m</SectionTitle>
                <div className="muted u-fs-fs-12 u-mb-8px">
                  Cada taco como percentagem constante do drive. Atualiza automaticamente
                  quando mudas o <b>Drive (m)</b> no topo da página.
                </div>
                <ClubDistanceTable driveM={driveM} />
              </div>
              <p className="u-m-0-0-8px">
                <b>2 — O multiplicador é a "conta de tacos" de uma volta.</b> Num par 72 medido em
                unidades de drive (D): 10 par 4 ≈ drive + ferro médio ≈ 1,65 D cada; 4 par 5 ≈ drive
                + madeira + approach ≈ 2,3 D cada; 4 par 3 ≈ 0,6 D cada. Somando, uma volta "à
                escala" mede ≈ 24–28 D. Um campo dentro desta janela pede a cada jogador a mesma
                mistura de pancadas que um campo de tour pede a um profissional: fairway com o
                drive, approaches com ferros médios, variedade de tacos.
              </p>
              <p className="u-m-0-0-8px">
                <b>3 — Confere com a realidade.</b> Um profissional de tour com drive de ~260 m joga
                campos de ~6.600 m (ratio ≈ 25×); um scratch amador com 220 m joga ~5.700 m (≈ 26×).
                Abaixo da janela, todos os approaches viram wedges — não se treinam ferros médios
                nem madeiras e o desafio desaparece. Acima, o jogador não chega aos greens em
                regulação, força o swing para ganhar metros que não tem e joga na defensiva — é aí
                que a USGA documenta perda de confiança e de desenvolvimento.
              </p>
              <p className="muted u-m-0">
                Nota: as tabelas Longleaf implicam ~22–26× (o ratio cresce ligeiramente com o
                drive); o Tee It Forward da USGA/PGA usa ~28×. A janela 24–28× usada nesta página é
                a síntese das duas referências.
              </p>
              <div className="u-mt-10px u-d-flex u-fd-column u-gap-4px u-fs-fs-12">
                <ExtLink href="http://www.longleafteesystem.com/">↗ Longleaf Tee System (US Kids Golf Foundation + ASGCA)</ExtLink>
                <ExtLink href="https://tournaments.uskidsgolf.com/play-and-learn/forward-tees/forward-tee-yardages">↗ U.S. Kids Golf — Forward Tee Yardages</ExtLink>
                <ExtLink href="https://www.usga.org/content/usga/home-page/course-care/green-section-record/61/issue-06/forward-tees-for-the-future.html">↗ USGA — Forward Tees for the Future</ExtLink>
                <ExtLink href="https://www.usga.org/content/usga/home-page/course-care/green-section-record/61/issue-11/helping-golfers-choose-their--best-tees--.html">↗ USGA — Helping Golfers Choose Their "Best Tees"</ExtLink>
                <ExtLink href="https://pdf.pgalinks.com/p-g-a/Tee_It_Forward_Guidelines.pdf">↗ PGA/USGA — Tee It Forward Guidelines (PDF)</ExtLink>
              </div>
            </div>
          </details>

          <details className="card u-mt-8px">
            <summary className="u-cur-pointer u-fw-700 u-fs-fs-13">
              📊 Porquê contamos voltas ao nível do índice — e não a média?
            </summary>
            <div className="u-fs-fs-13 u-lh-1_7 u-mt-10px">
              <p className="u-m-0-0-8px">
                <b>1 — O índice de handicap é potencial, não média.</b> No World Handicap System, o
                índice é a <b>média das 8 melhores</b> de entre as últimas 20 voltas (cada uma
                ajustada à dificuldade do campo). Mede o que o jogador é capaz de fazer <i>num bom
                dia</i> — de propósito, não o que faz em média. Um jogador "irregular" carrega um
                índice mais baixo do que o seu score médio sugeriria.
              </p>
              <p className="u-m-0-0-8px">
                <b>2 — Por isso só se joga ao índice ~1 em cada 5 voltas.</b> O WHS assume que um
                jogador iguala ou bate o seu índice cerca de <b>20% das vezes</b>. As outras 4 em 5
                voltas ficam acima — é o esperado, não um sinal de mau jogo. Consequência: a
                <b> média</b> de score differential de um jogador anda sempre vários pontos
                <i> acima</i> do índice (um índice ~10 tem médias na casa dos 14–15).
              </p>
              <p className="u-m-0-0-8px">
                <b>3 — Logo, comparamos as voltas certas.</b> Para saber se ele aguenta um
                comprimento, citar a "média de differential" seria enganador — pareceria mau quando
                é perfeitamente normal. Em vez disso contamos as voltas jogadas <b>ao nível do índice
                ou melhor</b> (as que efetivamente formam o handicap) e o <b>melhor differential</b>
                do período. Se essas voltas de qualidade aparecem tanto — ou mais — nos campos
                longos, é prova de que o comprimento não lhe tira nível.
              </p>
              <p className="muted u-m-0">
                Nota: tudo isto é medido nos <b>últimos 12 meses</b>, porque um júnior cresce
                depressa e o que fazia há mais de um ano já não representa o jogo de hoje.
              </p>
              <div className="u-mt-10px u-d-flex u-fd-column u-gap-4px u-fs-fs-12">
                <ExtLink href="https://www.usga.org/content/usga/home-page/handicapping/world-handicap-system/topics/handicap-index-calculation.html">↗ USGA — The Handicap Index Calculation (8 melhores de 20)</ExtLink>
                <ExtLink href="https://www.randa.org/en/roh/the-rules-of-handicapping/rule-5">↗ R&A — Rules of Handicapping, Rule 5</ExtLink>
                <ExtLink href="https://www.nationalclubgolfer.com/whs/odds-of-beating-your-handicap/">↗ National Club Golfer — odds de bater o teu handicap (~1 em 5)</ExtLink>
              </div>
            </div>
          </details>
        </>
      )}
    </>
  );
}
