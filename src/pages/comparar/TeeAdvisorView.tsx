/**
 * TeeAdvisorView.tsx — Tab "Vantagem de Tee" da página /comparar
 *
 * Comparador aprofundado de tees de um campo para um júnior:
 *   1. Pancadas de perdão — playing handicap WHS por tee
 *      (PH = HI × Slope/113 + CR − Par). Tee mais longo costuma ter CR
 *      mais alto → mais pancadas recebidas → mais perdão.
 *   2. Distância habitual — mediana dos metros das últimas voltas 18B
 *      do Manuel (data.json). Quanto mais perto, mais "em casa".
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

const MONO = "'JetBrains Mono', monospace";

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
              <td>{c.club} <span className="muted" style={{ fontSize: 11 }}>({c.abbr})</span></td>
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

interface TeeHist { n: number; avgVsPar: number | null; best: number | null; avgSd: number | null }

/** Histórico real do Manuel num campo+tee (voltas 18B com par conhecido). */
function teeHistory(data: PlayerPageData | null, courseName: string, teeName: string): TeeHist {
  const empty: TeeHist = { n: 0, avgVsPar: null, best: null, avgSd: null };
  if (!data) return empty;
  const ck = norm(courseName);
  const tk = norm(teeName);
  let n = 0, sumVsPar = 0, best: number | null = null, sdSum = 0, sdN = 0;
  for (const c of data.DATA) {
    if (norm(c.course) !== ck) continue;
    for (const r of c.rounds) {
      if (r.holeCount !== 18 || norm(r.tee) !== tk) continue;
      if (r.gross == null || r.par == null || r.gross <= 0) continue;
      n++;
      sumVsPar += r.gross - r.par;
      if (best === null || r.gross < best) best = r.gross;
      if (r.sd != null) { sdSum += r.sd; sdN++; }
    }
  }
  if (n === 0) return empty;
  return { n, avgVsPar: sumVsPar / n, best, avgSd: sdN > 0 ? sdSum / sdN : null };
}

/** Mediana dos metros das últimas `cap` voltas 18B — distância habitual. */
function habitualDistance(data: PlayerPageData | null, cap = 20): { median: number | null; n: number } {
  if (!data) return { median: null, n: 0 };
  const rounds: { m: number; d: number }[] = [];
  for (const c of data.DATA) for (const r of c.rounds) {
    if (r.holeCount === 18 && r.meters != null && r.meters > 3000) {
      rounds.push({ m: r.meters, d: r.dateSort });
    }
  }
  if (rounds.length === 0) return { median: null, n: 0 };
  rounds.sort((a, b) => b.d - a.d);
  const recent = rounds.slice(0, cap).map(r => r.m).sort((a, b) => a - b);
  const mid = Math.floor(recent.length / 2);
  const median = recent.length % 2 ? recent[mid] : (recent[mid - 1] + recent[mid]) / 2;
  return { median, n: recent.length };
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
    hist: teeHistory(data, courseName, tee.teeName),
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

  // 1 — Pancadas de perdão (informativo: no mesmo campo o tee longo recebe
  // SEMPRE mais pancadas — a pergunta certa é se a compensação chega)
  if (a.ph != null && b.ph != null) {
    const diff = a.ph - b.ph;
    const dDist = a.dist != null && b.dist != null ? a.dist - b.dist : null;
    const mPerStroke = diff !== 0 && dDist != null ? Math.abs(dDist / diff) : null;
    cs.push({
      icon: "🛡️", title: "Pancadas de perdão", short: "Perdão",
      text: diff === 0 ? (
        <>Recebe {a.ph} pancadas em ambos os tees — sem diferença de perdão.</>
      ) : (
        <>
          {A}: {a.ph} pancadas recebidas (gross alvo {a.grossAlvo}) · {B}: {b.ph} (gross alvo {b.grossAlvo}).
          {" "}O tee mais longo recebe sempre mais perdão — aqui são +{Math.abs(diff)} pancada{Math.abs(diff) === 1 ? "" : "s"}
          {dDist != null && <> por {Math.abs(dDist)} m extra{mPerStroke != null && <> (≈{mPerStroke.toFixed(0)} m por pancada)</>}</>}.
          {" "}É a compensação calculada para o jogador médio deste handicap — justa, mas não generosa, para um júnior cujo comprimento ainda depende do drive.
        </>
      ),
      pts: 0, available: true, informational: true,
    });
  } else {
    cs.push({ icon: "🛡️", title: "Pancadas de perdão", short: "Perdão", text: "Sem CR/Slope num dos tees — impossível calcular.", pts: 0, available: false });
  }

  // 2 — Distância habitual (assimétrico: jogar MAIS longo que o habitual é que
  // custa a um júnior com distância ainda em desenvolvimento; encurtar não penaliza)
  if (a.deltaHab != null && b.deltaHab != null) {
    const excessA = Math.max(0, a.deltaHab), excessB = Math.max(0, b.deltaHab);
    const diff = excessB - excessA; // positivo → A exige menos distância extra
    const meaningful = Math.abs(diff) >= 150;
    const fmt = (m: TeeMetrics) => m.deltaHab! > 0
      ? `+${m.deltaHab!.toFixed(0)} m acima da distância habitual`
      : `${Math.abs(m.deltaHab!).toFixed(0)} m abaixo da distância habitual`;
    cs.push({
      icon: "📏", title: "Distância habitual", short: "Distância",
      text: (
        <>
          {A}: {fmt(a)} · {B}: {fmt(b)}.{" "}
          {excessA === 0 && excessB === 0
            ? "Nenhum dos tees exige mais distância do que o habitual — confortável em ambos."
            : meaningful
              ? <>Jogar bastante acima do habitual obriga a esticar um jogo que ainda está em desenvolvimento — <TeeNameSpan tee={(diff > 0 ? a : b).tee} /> é menos exigente fisicamente.</>
              : "O excesso face ao habitual é pequeno — nenhum dos tees obriga a esticar o jogo."}
        </>
      ),
      pts: meaningful ? Math.sign(diff) * Math.min(2, Math.abs(diff) / 400) : 0,
      available: true,
    });
  } else {
    cs.push({ icon: "📏", title: "Distância habitual", short: "Distância", text: "Sem distância do tee ou sem histórico de voltas para estimar o habitual.", pts: 0, available: false });
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

  // 4 — Histórico real
  if (a.hist.n >= 2 && b.hist.n >= 2 && a.hist.avgVsPar != null && b.hist.avgVsPar != null) {
    const diff = b.hist.avgVsPar - a.hist.avgVsPar; // positivo → A teve scores melhores vs par
    cs.push({
      icon: "📊", title: "Histórico real neste campo", short: "Histórico",
      text: (
        <>
          {A}: média {fmtToPar(Math.round(a.hist.avgVsPar))} vs par em {a.hist.n} voltas · {B}: {fmtToPar(Math.round(b.hist.avgVsPar))} em {b.hist.n}.{" "}
          {Math.abs(diff) < 1 ? "Rendimento equivalente." : <>Scores reais melhores de <TeeNameSpan tee={(diff > 0 ? a : b).tee} />.</>}
        </>
      ),
      pts: Math.max(-3, Math.min(3, diff)),
      available: true,
    });
  } else {
    const parts: string[] = [];
    if (a.hist.n > 0) parts.push(`${a.tee.teeName}: ${a.hist.n} volta${a.hist.n === 1 ? "" : "s"}`);
    if (b.hist.n > 0) parts.push(`${b.tee.teeName}: ${b.hist.n} volta${b.hist.n === 1 ? "" : "s"}`);
    cs.push({
      icon: "📊", title: "Histórico real neste campo", short: "Histórico",
      text: parts.length > 0
        ? `Histórico insuficiente para comparar (${parts.join(" · ")} — mínimo 2 em cada tee).`
        : "Sem voltas registadas neste campo.",
      pts: 0, available: false,
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
      style={{ width, padding: "4px 8px", fontFamily: MONO, fontSize: 13 }}
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
  avg: m => m.hist.avgVsPar ?? Number.MAX_SAFE_INTEGER,
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
            <SortableHdr k="avg"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Média real vs par">Média vs Par</SortableHdr>
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
              <td className="r" style={{ fontFamily: MONO }}>{m.hist.avgVsPar != null ? fmtToPar(Math.round(m.hist.avgVsPar)) : "–"}</td>
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
    position: "sticky", left: 0, background: "var(--bg-card)", zIndex: 1,
    fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
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

  const hab = useMemo(() => habitualDistance(manuelData), [manuelData]);
  const habEff = habOverride ?? hab.median;

  const metrics = useMemo(
    () => tees.map(t => buildMetrics(t, hcp, driveM, secondM, habEff, manuelData, course?.master.name ?? "")),
    [tees, hcp, driveM, secondM, habEff, manuelData, course]
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

  // Recomendação: janela Longleaf/USGA (comprimento adequado ≈ 24-28× o drive),
  // dificuldades documentadas no tee longo e perdão extra. Em vez de um "vencedor"
  // mecânico, dá um conselho condicional (confiança vs. defesa de score).
  const recommendation = useMemo(() => {
    if (!teeA || !teeB || teeA.dist == null || teeB.dist == null) return null;
    const longer = teeA.dist >= teeB.dist ? teeA : teeB;
    const shorter = longer === teeA ? teeB : teeA;
    const low = Math.round(24 * driveM), high = Math.round(28 * driveM);
    const alerts = longer.gir.detail.filter(d => !d.reachable).length;
    const perdao = longer.ph != null && shorter.ph != null ? longer.ph - shorter.ph : null;
    const longerInWindow = longer.dist! <= high;
    const shorterTooShort = shorter.dist! < low;
    const go = longerInWindow && alerts <= 2;
    return { longer, shorter, low, high, alerts, perdao, longerInWindow, shorterTooShort, go };
  }, [teeA, teeB, driveM]);

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

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 16px" }}>
        <span style={{ fontSize: 22 }}>📏</span>
        <span style={{ fontWeight: 800, fontSize: 15 }}>Distância habitual</span>
        <input
          className="input" type="number" step={50}
          value={habEff != null ? Math.round(habEff) : ""}
          onChange={e => { const v = parseFloat(e.target.value); setHabOverride(Number.isFinite(v) ? v : null); }}
          title="Distância de referência a que o jogador está habituado — edita para simular outro cenário"
          style={{ width: 110, padding: "6px 10px", fontFamily: MONO, fontSize: 17, fontWeight: 700 }}
        />
        <span style={{ fontWeight: 700, fontSize: 15 }}>m</span>
        {habOverride != null ? (
          <button
            type="button"
            onClick={() => setHabOverride(null)}
            style={{ padding: "4px 10px", fontSize: 12, fontWeight: 600, background: "var(--bg-muted)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--text-2)" }}
          >
            ↺ Repor automático{hab.median != null ? ` (${hab.median.toFixed(0)} m)` : ""}
          </button>
        ) : (
          <span className="muted" style={{ fontSize: 13 }}>
            {hab.median != null ? `mediana das últimas ${hab.n} voltas 18B do Manuel` : "sem histórico — introduz um valor"}
          </span>
        )}
      </div>

      {tees.length === 0 ? (
        <EmptyState icon="🔍" message="Este campo não tem tees para o filtro seleccionado." />
      ) : (
        <>
          <div className="card">
            <div className="h-md">🟡 Tees de {course?.master.name}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 10 }}>
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
                    <span style={{ fontSize: 18, lineHeight: 1.2 }}>{c.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{c.title}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 2 }}>{c.text}</div>
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
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                  📋 Diferença buraco a buraco — {teeA.tee.teeName} vs {teeB.tee.teeName}
                </div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
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
                  <span style={{ fontSize: 24 }}>{recommendation.go ? "🚀" : "🛡️"}</span>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.5 }}>
                      {recommendation.go
                        ? <>Se estás confiante no teu jogo, arrisca as <TeeNameSpan tee={recommendation.longer.tee} /></>
                        : <>Consolida nas <TeeNameSpan tee={recommendation.shorter.tee} /> — o tee longo ainda é cedo</>}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.6 }}>
                      {recommendation.go ? (
                        <>
                          <TeeNameSpan tee={recommendation.longer.tee} /> ({recommendation.longer.dist} m) está dentro do comprimento adequado
                          ao teu drive de {driveM} m (24–28× o drive ≈ {recommendation.low}–{recommendation.high} m)
                          {recommendation.perdao != null && recommendation.perdao > 0 && <>, recebes +{recommendation.perdao} pancada{recommendation.perdao === 1 ? "" : "s"} de perdão</>}
                          {" "}e {recommendation.alerts === 0
                            ? "não há dificuldades documentadas"
                            : recommendation.alerts === 1
                              ? "só existe 1 dificuldade documentada"
                              : `existem ${recommendation.alerts} dificuldades documentadas`}.
                          {recommendation.shorterTooShort && <> Aliás, <TeeNameSpan tee={recommendation.shorter.tee} /> ({recommendation.shorter.dist} m) já está abaixo dessa janela — deixa de ser desafio.</>}
                          {" "}Num torneio a contar para ranking ou num dia menos confiante, <TeeNameSpan tee={recommendation.shorter.tee} /> protege o score e a confiança.
                        </>
                      ) : (
                        <>
                          <TeeNameSpan tee={recommendation.longer.tee} /> ({recommendation.longer.dist} m)
                          {recommendation.longerInWindow
                            ? <> tem {recommendation.alerts} buracos fora de alcance em regulação</>
                            : <> excede o comprimento adequado ao teu drive de {driveM} m (24–28× ≈ {recommendation.low}–{recommendation.high} m){recommendation.alerts > 0 && <> e tem {recommendation.alerts} buraco{recommendation.alerts === 1 ? "" : "s"} fora de alcance em regulação</>}</>}.
                          {" "}Tees longos demais pressionam o jogo longo e custam confiança — usa-o como treino pontual e muda quando o drive crescer.
                        </>
                      )}
                    </div>
                  </div>
                  <TeePill tee={(recommendation.go ? recommendation.longer : recommendation.shorter).tee} />
                </div>
              )}
            </div>
          )}

          <div className="muted" style={{ fontSize: 11, lineHeight: 1.6, marginTop: 4 }}>
            Metodologia: o perdão usa a fórmula WHS de playing handicap — um tee mais longo tem
            Course Rating mais alto e por isso dá mais pancadas recebidas, ou seja, o gross que
            equivale a "jogar ao handicap" é mais alto. A distância habitual vem do histórico real
            de voltas 18B — só penaliza jogar ACIMA do habitual (encurtar não é desvantagem para um júnior). Os buracos de alerta assumem drive + 2ª pancada configurados acima
            (par 3 ≤ drive · par 4 ≤ drive+2ª · par 5 ≤ drive+2×2ª) e são informativos — não pontuam no veredicto. O histórico só compara tees
            com ≥2 voltas de 18 buracos cada. A recomendação final usa a janela Longleaf/USGA
            (comprimento adequado ≈ 24-28× a distância de drive — validada com dados Trackman
            pela US Kids Golf Foundation e ASGCA): dentro da janela e com poucas dificuldades
            documentadas, o tee longo é um desafio saudável; fora dela, pressiona o jogo longo
            e custa confiança.
          </div>

          <details className="card" style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
              📐 Porquê 24–28× a distância de drive?
            </summary>
            <div style={{ fontSize: 13, lineHeight: 1.7, marginTop: 10 }}>
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
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                <a href="http://www.longleafteesystem.com/" target="_blank" rel="noopener noreferrer">↗ Longleaf Tee System (US Kids Golf Foundation + ASGCA)</a>
                <a href="https://tournaments.uskidsgolf.com/play-and-learn/forward-tees/forward-tee-yardages" target="_blank" rel="noopener noreferrer">↗ U.S. Kids Golf — Forward Tee Yardages</a>
                <a href="https://www.usga.org/content/usga/home-page/course-care/green-section-record/61/issue-06/forward-tees-for-the-future.html" target="_blank" rel="noopener noreferrer">↗ USGA — Forward Tees for the Future</a>
                <a href="https://www.usga.org/content/usga/home-page/course-care/green-section-record/61/issue-11/helping-golfers-choose-their--best-tees--.html" target="_blank" rel="noopener noreferrer">↗ USGA — Helping Golfers Choose Their "Best Tees"</a>
                <a href="https://pdf.pgalinks.com/p-g-a/Tee_It_Forward_Guidelines.pdf" target="_blank" rel="noopener noreferrer">↗ PGA/USGA — Tee It Forward Guidelines (PDF)</a>
              </div>
            </div>
          </details>
        </>
      )}
    </>
  );
}
