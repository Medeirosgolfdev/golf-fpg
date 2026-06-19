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
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import EmptyState from "../../ui/EmptyState";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../../ui/Toolbar";
import { norm, fmtToPar } from "../../utils/format";
import { getTeeHex, textOnColor, teeBorder } from "../../utils/teeColors";
import { MANUEL_FED } from "../../constants/manuel";
import { resolvePlayedMeters, resolvePlayedTee, courseKeyName } from "../../utils/playedDistance";

const MONO = "'JetBrains Mono', monospace";

/** Coerção segura para número — alguns campos do JSON vêm como string (ex: sd "14"). */
const toNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/** Mediana de uma lista de números (null se vazia). Robusta a voltas atípicas:
 *  uma ronda catastrófica não distorce o resultado típico, ao contrário da média. */
const median = (nums: number[]): number | null => {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* ═══════════════════ Escala de distâncias do saco ═══════════════════ */
/**
 * Distância de cada taco como percentagem CONSTANTE do drive — a base do
 * princípio 24-28× (medições Trackman da US Kids Golf Foundation + ASGCA).
 * Os valores respeitam as âncoras citadas no bloco explicativo: ferro 7 ≈
 * 65-70% do drive, wedges ≈ 40-50%. Monotónicas decrescentes.
 */
const CLUB_SCALE: { club: string; abbr: string; pct: number }[] = [
  { club: "Driver", abbr: "D", pct: 100 },
  { club: "Madeira 3", abbr: "M3", pct: 93 },
  { club: "Madeira 5", abbr: "M5", pct: 87 },
  { club: "Híbrido", abbr: "Hb", pct: 81 },
  { club: "Ferro 4", abbr: "F4", pct: 77 },
  { club: "Ferro 5", abbr: "F5", pct: 73 },
  { club: "Ferro 6", abbr: "F6", pct: 69 },
  { club: "Ferro 7", abbr: "F7", pct: 65 },
  { club: "Ferro 8", abbr: "F8", pct: 60 },
  { club: "Ferro 9", abbr: "F9", pct: 55 },
  { club: "Pitching wedge", abbr: "PW", pct: 50 },
  { club: "Gap wedge", abbr: "GW", pct: 45 },
  { club: "Sand wedge", abbr: "SW", pct: 40 },
  { club: "Lob wedge", abbr: "LW", pct: 35 },
];

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
    <div style={{ overflowX: "auto", paddingBottom: 6 }}>
      <table className="dtable" style={{ minWidth: 320 }}>
        <thead>
          <tr>
            <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Taco</SortableHdr>
            <SortableHdr k="pct" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Percentagem constante do drive">% drive</SortableHdr>
            <SortableHdr k="dist" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Distância estimada para o drive configurado no topo">Dist (m)</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {sorted.map(c => (
            <tr key={c.abbr} style={c.abbr === "D" ? { fontWeight: 800 } : undefined}>
              <td>{c.club} <span className="muted" style={{ fontSize: "var(--fs-11)" }}>({c.abbr})</span></td>
              <td className="r" style={{ fontFamily: MONO }}>{c.pct}%</td>
              <td className="r" style={{ fontFamily: MONO, fontWeight: 700 }}>{c.dist}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════ Modelos de cálculo ═══════════════════ */

/** Playing handicap WHS (não arredondado). */
function playingHcpRaw(hi: number, slope: number, cr: number, par: number): number {
  return hi * (slope / 113) + (cr - par);
}

interface ReachInfo { hole: number; par: number; dist: number; budget: number; reachable: boolean }
interface ReachOutcome { reach: number[]; total: number; detail: ReachInfo[] }

/** Orçamento de metros para chegar ao green em regulação. */
function reachBudget(par: number, driveM: number, secondM: number): number {
  return par === 3 ? driveM : par === 4 ? driveM + secondM : driveM + secondM * (par - 3);
}

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
  const empty: LongPerf = { thresholdM, index, nLong: 0, nShort: 0, nLongGood: 0, nShortGood: 0, bestLong: null };
  if (!data) return empty;
  // Só os últimos 12 meses: um júnior cresce depressa — o que era capaz há mais
  // de um ano não representa o jogo de hoje.
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  let longN = 0, shortN = 0, nLongGood = 0, nShortGood = 0;
  let bestLong: { sd: number; course: string; meters: number } | null = null;
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
    }
  }
  return { thresholdM, index, nLong: longN, nShort: shortN, nLongGood, nShortGood, bestLong };
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
  const phRaw = cr != null && slope != null && par > 0 ? playingHcpRaw(hi, slope, cr, par) : null;
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
            ? <> e cria {perigos} {perigos === 1 ? "perigo" : "perigos"} — buraco{perigos === 1 ? "" : "s"} fora de alcance em regulação. Saldo {saldo > 0 ? "+" : ""}{saldo}: {
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
      return `à distância que já joga em competição (${g >= 0 ? "+" : ""}${g} m)`;
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

function TeePill({ tee }: { tee: Tee }) {
  const hex = getTeeHex(tee.teeName, tee.scorecardMeta?.teeColor);
  return (
    <span className="p p-sm" style={{
      background: hex, color: textOnColor(hex), border: teeBorder(hex) ?? "1px solid var(--border)",
      fontWeight: 700, justifyContent: "center", minWidth: 86,
    }}>
      {tee.teeName}
    </span>
  );
}

/** Nome de tee inline, sempre com a cor do tee (regra do projecto: referir tees com a sua cor). */
function TeeNameSpan({ tee }: { tee: Tee }) {
  const hex = getTeeHex(tee.teeName, tee.scorecardMeta?.teeColor);
  return (
    <span style={{
      background: hex, color: textOnColor(hex), border: teeBorder(hex) ?? "1px solid var(--border)",
      borderRadius: 6, padding: "0 6px", fontWeight: 800, fontSize: "0.92em", whiteSpace: "nowrap",
    }}>
      {tee.teeName}
    </span>
  );
}

function NumInput({ value, onChange, step = 1, width = 70, title }: {
  value: number; onChange: (v: number) => void; step?: number; width?: number; title?: string;
}) {
  return (
    <input
      className="input" type="number" value={value} step={step} title={title}
      onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); }}
      style={{ width, padding: "4px 8px", fontFamily: MONO, fontSize: "var(--fs-13)" }}
    />
  );
}

/* ═══════════════════ Tabela de tees (ordenável) ═══════════════════ */

type TeeSortKey = "tee" | "dist" | "dhab" | "par" | "cr" | "slope" | "ph" | "alvo" | "gir" | "nh" | "avg";

const TEE_SORT_VAL: Record<TeeSortKey, (m: TeeMetrics) => number | string> = {
  tee: m => m.tee.teeName.toLowerCase(),
  dist: m => m.dist ?? -1,
  dhab: m => m.deltaHab != null ? Math.abs(m.deltaHab) : Number.MAX_SAFE_INTEGER,
  par: m => m.par,
  cr: m => m.cr ?? -1,
  slope: m => m.slope ?? -1,
  ph: m => m.ph ?? -99,
  alvo: m => m.grossAlvo ?? -1,
  gir: m => m.gir.total > 0 ? m.gir.reach.length : -1,
  nh: m => m.hist.n,
  avg: m => m.hist.recentTypVsPar ?? Number.MAX_SAFE_INTEGER,
};

function TeeTable({ rows, habitual }: { rows: TeeMetrics[]; habitual: number | null }) {
  const { sortKey, sortDir, toggleSort } = useSort<TeeSortKey>("dist", "desc", {
    tee: "asc", dhab: "asc", avg: "asc",
  });

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = TEE_SORT_VAL[sortKey](a), bv = TEE_SORT_VAL[sortKey](b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv, "pt") * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div style={{ overflowX: "auto", paddingBottom: 14 }}>
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
              <td className="r" style={{ fontFamily: MONO }}>{m.dist ?? "–"}</td>
              <td className="r" style={{ fontFamily: MONO, color: m.deltaHab != null && Math.abs(m.deltaHab) <= 200 ? "var(--color-good-dark)" : undefined }}>
                {m.deltaHab != null && habitual != null ? (m.deltaHab > 0 ? "+" : "") + m.deltaHab.toFixed(0) : "–"}
              </td>
              <td className="r" style={{ fontFamily: MONO }}>{m.par || "–"}</td>
              <td className="r" style={{ fontFamily: MONO }}>{m.cr != null ? m.cr.toFixed(1) : "–"}</td>
              <td className="r" style={{ fontFamily: MONO }}>{m.slope ?? "–"}</td>
              <td className="r" style={{ fontFamily: MONO, fontWeight: 700 }}>{m.ph != null ? m.ph : "–"}</td>
              <td className="r" style={{ fontFamily: MONO }}>{m.grossAlvo ?? "–"}</td>
              <td className="r" style={{ fontFamily: MONO }}>{m.gir.total > 0 ? `${m.gir.reach.length}/${m.gir.total}` : "–"}</td>
              <td className="r" style={{ fontFamily: MONO }}>{m.hist.n || "–"}</td>
              <td className="r" style={{ fontFamily: MONO }}>{m.hist.recentTypVsPar != null ? fmtToPar(Math.round(m.hist.recentTypVsPar)) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════ Tabela de diferenças buraco a buraco (A vs B) ═══════════════ */

interface HoleDiffRow {
  h: number;
  parA: number | null;
  parB: number | null;
  dA: number | null;
  dB: number | null;
  delta: number | null;
  appA: { m: number; reachable: boolean } | null;
  appB: { m: number; reachable: boolean } | null;
  /** Distância que sobra depois da 2ª pancada grande (só par 4/5) */
  app2A: { m: number; reachable: boolean } | null;
  app2B: { m: number; reachable: boolean } | null;
}

function buildDiffRows(a: TeeMetrics, b: TeeMetrics, driveM: number, secondM: number): HoleDiffRow[] {
  const mapA = new Map(a.tee.holes.map(h => [h.hole, h]));
  const mapB = new Map(b.tee.holes.map(h => [h.hole, h]));
  const holes = [...new Set([...mapA.keys(), ...mapB.keys()])].sort((x, y) => x - y);
  // "Após drive": o que falta para o green depois do drive (par 3 = a própria pancada do tee)
  const mk = (par: number | null | undefined, d: number | null | undefined) => {
    if (par == null || d == null || par < 3) return null;
    // Metros que sobram para o green depois da pancada do tee — vale para todos
    // os pares: num par 3 a pancada do tee é a pancada para o green, logo se
    // o alcança sobra 0; se fica curto, sobra a diferença.
    return {
      m: Math.max(0, d - driveM),
      reachable: d <= reachBudget(par, driveM, secondM),
    };
  };
  // "Após 2ª pancada grande": só faz sentido no par 4 e par 5 (drive + madeira).
  // Num par 4 sobra 0 se chegou ao green em regulação; num par 5 é o approach
  // que entra no green (a 3ª pancada).
  const mk2 = (par: number | null | undefined, d: number | null | undefined) => {
    if (par == null || d == null || par < 4) return null;
    return {
      m: Math.max(0, d - driveM - secondM),
      reachable: d <= reachBudget(par, driveM, secondM),
    };
  };
  return holes.map(h => {
    const ha = mapA.get(h), hb = mapB.get(h);
    const dA = ha?.distance ?? null, dB = hb?.distance ?? null;
    return {
      h,
      parA: ha?.par ?? null,
      parB: hb?.par ?? null,
      dA, dB,
      delta: dA != null && dB != null ? dA - dB : null,
      appA: mk(ha?.par, dA),
      appB: mk(hb?.par, dB),
      app2A: mk2(ha?.par, dA),
      app2B: mk2(hb?.par, dB),
    };
  });
}

function HoleDiffTable({ a, b, driveM, secondM }: {
  a: TeeMetrics; b: TeeMetrics; driveM: number; secondM: number;
}) {
  const rows = useMemo(() => buildDiffRows(a, b, driveM, secondM), [a, b, driveM, secondM]);
  const totA = rows.reduce((s, r) => s + (r.dA ?? 0), 0);
  const totB = rows.reduce((s, r) => s + (r.dB ?? 0), 0);
  const hexA = getTeeHex(a.tee.teeName, a.tee.scorecardMeta?.teeColor);
  const hexB = getTeeHex(b.tee.teeName, b.tee.scorecardMeta?.teeColor);
  const tintA = hexA + "1f", tintB = hexB + "1f";

  const lblStyle: React.CSSProperties = {
    position: "sticky", left: 0, background: "var(--bg-card)", zIndex: "var(--z-base)",
    fontWeight: 700, fontSize: "var(--fs-12)", whiteSpace: "nowrap",
  };

  const appCell = (app: HoleDiffRow["appA"]) => app == null ? "–" : (
    <span
      style={{ fontFamily: MONO, color: app.reachable ? "var(--color-good-dark)" : "var(--color-warn-dark)", fontWeight: app.reachable ? 400 : 800 }}
      title={app.reachable
        ? "Metros que sobram para o green — alcançável em regulação"
        : "Green NÃO alcançável em regulação com o alcance configurado"}
    >
      {app.m.toFixed(0)}{app.reachable ? "" : "✗"}
    </span>
  );

  return (
    <div style={{ overflowX: "auto", paddingBottom: 14 }}>
      <table className="dtable">
        <thead>
          <tr>
            <th style={lblStyle}>Buraco</th>
            {rows.map(r => <th key={r.h} className="r" style={{ fontFamily: MONO }}>{r.h}</th>)}
            <th className="r" style={{ fontFamily: MONO }}>Σ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={lblStyle}>Par</td>
            {rows.map(r => (
              <td key={r.h} className="r" style={{ fontFamily: MONO, color: "var(--text-3)" }}>
                {r.parA != null && r.parB != null && r.parA !== r.parB ? `${r.parA}/${r.parB}` : (r.parA ?? r.parB ?? "–")}
              </td>
            ))}
            <td className="r" style={{ fontFamily: MONO, color: "var(--text-3)" }}>{a.par || b.par || "–"}</td>
          </tr>
          <tr style={{ background: tintA }}>
            <td style={lblStyle}><TeePill tee={a.tee} /> <span style={{ fontWeight: 600 }}>(m)</span></td>
            {rows.map(r => <td key={r.h} className="r" style={{ fontFamily: MONO }}>{r.dA ?? "–"}</td>)}
            <td className="r" style={{ fontFamily: MONO, fontWeight: 800 }}>{totA || "–"}</td>
          </tr>
          <tr style={{ background: tintB }}>
            <td style={lblStyle}><TeePill tee={b.tee} /> <span style={{ fontWeight: 600 }}>(m)</span></td>
            {rows.map(r => <td key={r.h} className="r" style={{ fontFamily: MONO }}>{r.dB ?? "–"}</td>)}
            <td className="r" style={{ fontFamily: MONO, fontWeight: 800 }}>{totB || "–"}</td>
          </tr>
          <tr style={{ borderTop: "2px solid var(--border)" }}>
            <td style={lblStyle}>Δ (m)</td>
            {rows.map(r => (
              <td key={r.h} className="r" style={{ fontFamily: MONO, fontWeight: r.delta != null && Math.abs(r.delta) >= 30 ? 800 : 400 }}>
                {r.delta != null ? (r.delta > 0 ? "+" : "") + r.delta : "–"}
              </td>
            ))}
            <td className="r" style={{ fontFamily: MONO, fontWeight: 800 }}>
              {totA && totB ? (totA - totB > 0 ? "+" : "") + (totA - totB) : "–"}
            </td>
          </tr>
          {/* Bloco do tee A — as duas análises juntas */}
          <tr style={{ background: tintA, borderTop: "2px solid var(--border)" }}>
            <td style={lblStyle}><TeePill tee={a.tee} /> <span style={{ fontWeight: 600 }}>· após drive faltam (m)</span></td>
            {rows.map(r => <td key={r.h} className="r">{appCell(r.appA)}</td>)}
            <td />
          </tr>
          <tr style={{ background: tintA }}>
            <td style={lblStyle}><TeePill tee={a.tee} /> <span style={{ fontWeight: 600 }}>· após 2ª pancada faltam (m)</span></td>
            {rows.map(r => <td key={r.h} className="r">{appCell(r.app2A)}</td>)}
            <td />
          </tr>
          {/* Espaço entre as duas análises */}
          <tr aria-hidden="true"><td colSpan={rows.length + 2} style={{ height: 12, padding: 0, border: "none", background: "transparent" }} /></tr>
          {/* Bloco do tee B — as duas análises juntas */}
          <tr style={{ background: tintB }}>
            <td style={lblStyle}><TeePill tee={b.tee} /> <span style={{ fontWeight: 600 }}>· após drive faltam (m)</span></td>
            {rows.map(r => <td key={r.h} className="r">{appCell(r.appB)}</td>)}
            <td />
          </tr>
          <tr style={{ background: tintB }}>
            <td style={lblStyle}><TeePill tee={b.tee} /> <span style={{ fontWeight: 600 }}>· após 2ª pancada faltam (m)</span></td>
            {rows.map(r => <td key={r.h} className="r">{appCell(r.app2B)}</td>)}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════ Vista principal ═══════════════════ */

export default function TeeAdvisorView({ simCourses }: { simCourses: Course[] }) {
  const sortedCourses = useMemo(
    () => [...simCourses].sort((a, b) => a.master.name.localeCompare(b.master.name, "pt", { sensitivity: "base" })),
    [simCourses]
  );

  const defaultCourseKey = useMemo(() => {
    const sds = sortedCourses.find(c => /santo\s+d[ao]\s+serra/i.test(c.master.name));
    return sds?.courseKey ?? sortedCourses[0]?.courseKey ?? "";
  }, [sortedCourses]);

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
    return (
      <>
        {" "}Os dados dão-te confiança: nos <b>últimos 12 meses</b> jogaste <b>{lp.nLong} voltas em campos de {lp.thresholdM} m ou mais</b> e
        em <b>{lp.nLongGood}</b> delas jogaste ao nível do teu índice ({lp.index.toFixed(1)}) ou melhor
        {asGoodAsShort ? <> — tão frequente como nos campos curtos</> : null}.
        {lp.bestLong
          ? <> O teu melhor differential deste período (<b>{lp.bestLong.sd.toFixed(1)}</b>, abaixo do teu índice) foi em {lp.bestLong.course} ({lp.bestLong.meters} m).</>
          : null}
        {" "}Jogar longo não te tira qualidade — é aí que mostras o teu melhor golfe.
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
        <select className="select" value={course?.courseKey ?? ""} onChange={e => { setCourseKey(e.target.value); setTeeAId(""); setTeeBId(""); }}>
          {sortedCourses.map(c => <option key={c.courseKey} value={c.courseKey}>{c.master.name}</option>)}
        </select>
        <ToolbarSep />
        <ToolbarMeta>Tees</ToolbarMeta>
        <select className="select" value={sexFilter} onChange={e => { setSexFilter(e.target.value as "M" | "F"); setTeeAId(""); setTeeBId(""); }}>
          <option value="M">Masculinos</option>
          <option value="F">Femininos</option>
        </select>
        <ToolbarSep />
        <ToolbarMeta>HCP</ToolbarMeta>
        <NumInput value={hcp} step={0.1} title="Handicap index do jogador" onChange={v => { setHcp(v); setHcpTouched(true); }} />
        <ToolbarSep />
        <ToolbarMeta>Drive (m)</ToolbarMeta>
        <NumInput value={driveM} step={5} title="Alcance médio de drive" onChange={setDriveM} />
        <ToolbarMeta>2ª panc. (m)</ToolbarMeta>
        <NumInput value={secondM} step={5} title="Alcance médio da 2ª pancada (madeira/híbrido)" onChange={setSecondM} />
      </Toolbar>

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--fs-22)" }}>📏</span>
        <span style={{ fontWeight: 800, fontSize: "var(--fs-15)" }}>Distância habitual</span>
        <input
          className="input" type="number" step={50}
          value={habEff != null ? Math.round(habEff) : ""}
          onChange={e => { const v = parseFloat(e.target.value); setHabOverride(Number.isFinite(v) ? v : null); }}
          title="Distância de referência a que o jogador está habituado — edita para simular outro cenário"
          style={{ width: 110, padding: "6px 10px", fontFamily: MONO, fontSize: 17, fontWeight: 700 }}
        />
        <span style={{ fontWeight: 700, fontSize: "var(--fs-15)" }}>m</span>
        {habOverride != null ? (
          <button
            type="button"
            onClick={() => setHabOverride(null)}
            style={{ padding: "4px 10px", fontSize: "var(--fs-12)", fontWeight: 600, background: "var(--bg-muted)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--text-2)" }}
          >
            ↺ Repor automático{hab.value != null ? ` (${hab.value.toFixed(0)} m)` : ""}
          </button>
        ) : (
          <span className="muted" style={{ fontSize: "var(--fs-13)" }}>
            {hab.value != null ? `percentil 70 das últimas ${hab.n} voltas 18B do Manuel — a distância que já joga em competição` : "sem histórico — introduz um valor"}
          </span>
        )}
      </div>

      {tees.length === 0 ? (
        <EmptyState icon="🔍" message="Este campo não tem tees para o filtro seleccionado." />
      ) : (
        <>
          <div className="card">
            <div className="h-md">🟡 Tees de {course?.master.name}</div>
            <div className="muted" style={{ fontSize: "var(--fs-12)", marginTop: -6, marginBottom: 10 }}>
              Perdão = pancadas recebidas WHS (HI×Slope/113 + CR − Par) · Gross alvo = gross que joga ao handicap (SD = HI) · Clica no cabeçalho para ordenar
            </div>
            <TeeTable rows={metrics} habitual={habEff} />
          </div>

          {teeA && teeB && (
            <div className="card" style={{ borderLeft: "4px solid var(--accent)" }}>
              <div className="h-md" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                🆚 Confronto de tees
                <select className="select" value={teeA.tee.teeId} onChange={e => setTeeAId(e.target.value)} style={{ border: `2px solid ${getTeeHex(teeA.tee.teeName, teeA.tee.scorecardMeta?.teeColor)}` }}>
                  {metrics.map(m => <option key={m.tee.teeId} value={m.tee.teeId}>{m.tee.teeName}{m.dist != null ? ` (${m.dist} m)` : ""}</option>)}
                </select>
                <span className="muted">vs</span>
                <select className="select" value={teeB.tee.teeId} onChange={e => setTeeBId(e.target.value)} style={{ border: `2px solid ${getTeeHex(teeB.tee.teeName, teeB.tee.scorecardMeta?.teeColor)}` }}>
                  {metrics.map(m => <option key={m.tee.teeId} value={m.tee.teeId}>{m.tee.teeName}{m.dist != null ? ` (${m.dist} m)` : ""}</option>)}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                {conclusions.map((c, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 10, alignItems: "flex-start",
                    padding: "10px 12px", borderRadius: "var(--radius)",
                    background: c.tone === "warn" ? "var(--color-warn-alpha)" : c.available ? "var(--bg-muted)" : "transparent",
                    border: c.tone === "warn" ? "1px solid var(--color-warn)" : "1px solid var(--border-light)",
                    opacity: c.available ? 1 : 0.6,
                  }}>
                    <span style={{ fontSize: "var(--fs-18)", lineHeight: 1.2 }}>{c.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: "var(--fs-13)" }}>{c.title}</div>
                      <div style={{ fontSize: "var(--fs-13)", lineHeight: 1.5, marginTop: 2 }}>{c.text}</div>
                    </div>
                    {c.available && c.pts !== 0 && (
                      <span style={{ flexShrink: 0 }} title={`Contribuição para o veredicto: ${c.pts > 0 ? "+" : ""}${c.pts.toFixed(1)}`}>
                        <TeePill tee={(c.pts > 0 ? teeA : teeB).tee} />
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 700, fontSize: "var(--fs-13)", marginBottom: 4 }}>
                  📋 Diferença buraco a buraco — {teeA.tee.teeName} vs {teeB.tee.teeName}
                </div>
                <div className="muted" style={{ fontSize: "var(--fs-12)", marginBottom: 8 }}>
                  Linhas "após drive" = metros que faltam para o green depois da pancada do tee (0 = green alcançado; no par 3 a própria pancada do tee é a do green). Linhas "após 2ª pancada" = o que sobra depois da 2ª pancada grande (madeira/híbrido), só nos par 4/5 — num par 5 é o approach que entra no green. · ✗ = green fora de alcance em regulação
                </div>
                <HoleDiffTable a={teeA} b={teeB} driveM={driveM} secondM={secondM} />
              </div>

              {recommendation && (
                <div style={{
                  marginTop: 14, padding: "14px 16px", borderRadius: "var(--radius)",
                  background: "var(--accent-light)", border: "1px solid var(--accent)",
                  display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
                }}>
                  <span style={{ fontSize: "var(--fs-24)" }}>{
                    recommendation.mode === "go" ? "🚀"
                    : recommendation.mode === "suit" ? "🎯"
                    : recommendation.mode === "caution" ? "🤔"
                    : "🛡️"
                  }</span>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontWeight: 800, fontSize: "var(--fs-14)", lineHeight: 1.5 }}>
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
                    <div style={{ fontSize: "var(--fs-13)", marginTop: 4, lineHeight: 1.6 }}>
                      {recommendation.mode === "suit" ? (
                        <>
                          Ainda não bateste as <TeeNameSpan tee={recommendation.shorter.tee} /> deste campo{recommendation.sForm != null && <> (resultado típico {fmtToPar(Math.round(recommendation.sForm))} vs par {recommendation.shortRecentN === recommendation.shorter.hist.n ? "" : "nas últimas "}{recommendation.shortRecentN} volta{recommendation.shortRecentN === 1 ? "" : "s"}, quando o handicap aqui aponta para ~{fmtToPar(recommendation.shorterPh ?? 0)})</>} — mas isso pode não ser falta de jogo. Um campo curto demais <b>tira-te o driver da mão</b>, deixa-te distâncias <i>tweener</i> (nem wedge cheio, nem ferro confortável) e não premia o teu comprimento. As <TeeNameSpan tee={recommendation.longer.tee} /> ({recommendation.longer.dist} m) estão dentro da distância que já jogas a sério{recommendation.habitual != null ? <> ({Math.round(recommendation.habitual)} m)</> : null} e devolvem-te o driver, pancadas cheias e <b>variedade de tacos</b> no approach — podem encaixar melhor no teu jogo.{perfLine}{recommendation.perdao != null && recommendation.perdao > 0 && <> Ainda recebes +{recommendation.perdao} pancada{recommendation.perdao === 1 ? "" : "s"} de perdão{recommendation.alerts > 0 ? <> (saldo {recommendation.saldo! > 0 ? "+" : ""}{recommendation.saldo})</> : null}.</>} Vale a pena experimentá-las e comparar os resultados.{recommendation.neverPlayedHere && <> Como é a tua estreia no campo, ganha-lhe a medida nas primeiras voltas.</>}
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
                              ? <> para {recommendation.alerts} perigo{recommendation.alerts === 1 ? "" : "s"} (saldo {recommendation.saldo! > 0 ? "+" : ""}{recommendation.saldo}{recommendation.goodDeal ? ", cobre-os com folga" : ""})</>
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
                            ? <> acima da distância que já jogas a sério ({Math.round(recommendation.habitual)} m){recommendation.perdao != null && recommendation.alerts > 0 && <>, e a troca só te dá +{recommendation.perdao} pancada{recommendation.perdao === 1 ? "" : "s"} para {recommendation.alerts} perigo{recommendation.alerts === 1 ? "" : "s"} (saldo {recommendation.saldo! > 0 ? "+" : ""}{recommendation.saldo})</>}</>
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

          <div className="muted" style={{ fontSize: "var(--fs-11)", lineHeight: 1.6, marginTop: 4 }}>
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

          <details className="card" style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "var(--fs-13)" }}>
              📐 Porquê 24–28× a distância de drive?
            </summary>
            <div style={{ fontSize: "var(--fs-13)", lineHeight: 1.7, marginTop: 10 }}>
              <p style={{ margin: "0 0 8px" }}>
                <b>1 — O drive é o factor de escala do saco inteiro.</b> As medições Trackman
                recolhidas pela US Kids Golf Foundation e pela ASGCA mostram que as distâncias dos
                outros tacos são percentagens notavelmente constantes do drive, do profissional de
                tour ao júnior: o ferro 7 anda nos ~65–70% do drive, o wedge nos ~40–50%. Conhecendo
                o drive de um jogador, conhece-se o alcance do jogo todo.
              </p>
              <div style={{
                margin: "0 0 12px", padding: "10px 12px", borderRadius: "var(--radius)",
                background: "var(--bg-muted)", border: "1px solid var(--border-light)",
              }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 2 }}>
                  Distâncias estimadas do saco — drive de {driveM} m
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>
                  Cada taco como percentagem constante do drive. Atualiza automaticamente
                  quando mudas o <b>Drive (m)</b> no topo da página.
                </div>
                <ClubDistanceTable driveM={driveM} />
              </div>
              <p style={{ margin: "0 0 8px" }}>
                <b>2 — O multiplicador é a "conta de tacos" de uma volta.</b> Num par 72 medido em
                unidades de drive (D): 10 par 4 ≈ drive + ferro médio ≈ 1,65 D cada; 4 par 5 ≈ drive
                + madeira + approach ≈ 2,3 D cada; 4 par 3 ≈ 0,6 D cada. Somando, uma volta "à
                escala" mede ≈ 24–28 D. Um campo dentro desta janela pede a cada jogador a mesma
                mistura de pancadas que um campo de tour pede a um profissional: fairway com o
                drive, approaches com ferros médios, variedade de tacos.
              </p>
              <p style={{ margin: "0 0 8px" }}>
                <b>3 — Confere com a realidade.</b> Um profissional de tour com drive de ~260 m joga
                campos de ~6.600 m (ratio ≈ 25×); um scratch amador com 220 m joga ~5.700 m (≈ 26×).
                Abaixo da janela, todos os approaches viram wedges — não se treinam ferros médios
                nem madeiras e o desafio desaparece. Acima, o jogador não chega aos greens em
                regulação, força o swing para ganhar metros que não tem e joga na defensiva — é aí
                que a USGA documenta perda de confiança e de desenvolvimento.
              </p>
              <p style={{ margin: 0 }} className="muted">
                Nota: as tabelas Longleaf implicam ~22–26× (o ratio cresce ligeiramente com o
                drive); o Tee It Forward da USGA/PGA usa ~28×. A janela 24–28× usada nesta página é
                a síntese das duas referências.
              </p>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--fs-12)" }}>
                <a href="http://www.longleafteesystem.com/" target="_blank" rel="noopener noreferrer">↗ Longleaf Tee System (US Kids Golf Foundation + ASGCA)</a>
                <a href="https://tournaments.uskidsgolf.com/play-and-learn/forward-tees/forward-tee-yardages" target="_blank" rel="noopener noreferrer">↗ U.S. Kids Golf — Forward Tee Yardages</a>
                <a href="https://www.usga.org/content/usga/home-page/course-care/green-section-record/61/issue-06/forward-tees-for-the-future.html" target="_blank" rel="noopener noreferrer">↗ USGA — Forward Tees for the Future</a>
                <a href="https://www.usga.org/content/usga/home-page/course-care/green-section-record/61/issue-11/helping-golfers-choose-their--best-tees--.html" target="_blank" rel="noopener noreferrer">↗ USGA — Helping Golfers Choose Their "Best Tees"</a>
                <a href="https://pdf.pgalinks.com/p-g-a/Tee_It_Forward_Guidelines.pdf" target="_blank" rel="noopener noreferrer">↗ PGA/USGA — Tee It Forward Guidelines (PDF)</a>
              </div>
            </div>
          </details>

          <details className="card" style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "var(--fs-13)" }}>
              📊 Porquê contamos voltas ao nível do índice — e não a média?
            </summary>
            <div style={{ fontSize: "var(--fs-13)", lineHeight: 1.7, marginTop: 10 }}>
              <p style={{ margin: "0 0 8px" }}>
                <b>1 — O índice de handicap é potencial, não média.</b> No World Handicap System, o
                índice é a <b>média das 8 melhores</b> de entre as últimas 20 voltas (cada uma
                ajustada à dificuldade do campo). Mede o que o jogador é capaz de fazer <i>num bom
                dia</i> — de propósito, não o que faz em média. Um jogador "irregular" carrega um
                índice mais baixo do que o seu score médio sugeriria.
              </p>
              <p style={{ margin: "0 0 8px" }}>
                <b>2 — Por isso só se joga ao índice ~1 em cada 5 voltas.</b> O WHS assume que um
                jogador iguala ou bate o seu índice cerca de <b>20% das vezes</b>. As outras 4 em 5
                voltas ficam acima — é o esperado, não um sinal de mau jogo. Consequência: a
                <b> média</b> de score differential de um jogador anda sempre vários pontos
                <i> acima</i> do índice (um índice ~10 tem médias na casa dos 14–15).
              </p>
              <p style={{ margin: "0 0 8px" }}>
                <b>3 — Logo, comparamos as voltas certas.</b> Para saber se ele aguenta um
                comprimento, citar a "média de differential" seria enganador — pareceria mau quando
                é perfeitamente normal. Em vez disso contamos as voltas jogadas <b>ao nível do índice
                ou melhor</b> (as que efetivamente formam o handicap) e o <b>melhor differential</b>
                do período. Se essas voltas de qualidade aparecem tanto — ou mais — nos campos
                longos, é prova de que o comprimento não lhe tira nível.
              </p>
              <p style={{ margin: 0 }} className="muted">
                Nota: tudo isto é medido nos <b>últimos 12 meses</b>, porque um júnior cresce
                depressa e o que fazia há mais de um ano já não representa o jogo de hoje.
              </p>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--fs-12)" }}>
                <a href="https://www.usga.org/content/usga/home-page/handicapping/world-handicap-system/topics/handicap-index-calculation.html" target="_blank" rel="noopener noreferrer">↗ USGA — The Handicap Index Calculation (8 melhores de 20)</a>
                <a href="https://www.randa.org/en/roh/the-rules-of-handicapping/rule-5" target="_blank" rel="noopener noreferrer">↗ R&A — Rules of Handicapping, Rule 5</a>
                <a href="https://www.nationalclubgolfer.com/whs/odds-of-beating-your-handicap/" target="_blank" rel="noopener noreferrer">↗ National Club Golfer — odds de bater o teu handicap (~1 em 5)</a>
              </div>
            </div>
          </details>
        </>
      )}
    </>
  );
}
