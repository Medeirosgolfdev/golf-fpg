/**
 * src/pages/jogadores/views/CoursePerformanceSection.tsx
 *
 * Bloco "Evolução neste campo" dentro do detalhe de um campo (ByCourseView):
 * tendência (regressão dos SDs), conclusão em prosa e timeline SVG dos gross.
 */
import React, { useMemo } from "react";
import type { RoundData } from "../../../data/playerDataLoader";
import { fmtSign } from "../../../utils/format";
import { getTeeHex } from "../../../utils/teeColors";
import { meanArr, minArr, maxArr, linearSlope } from "../../../utils/mathUtils";

/* ─── Linha temporal das rondas neste campo ─── */
export function RoundsTimeline({ rounds }: { rounds: RoundData[] }) {
  // Só rondas com gross+par válido (para termos o eixo Y coerente); excluímos 9H
  const pts = useMemo(() => {
    return rounds
      .filter(r => r.gross != null && r.par != null && r.holeCount === 18 && r.dateSort > 0)
      .map(r => ({
        x: r.dateSort,
        gross: Number(r.gross),
        par: Number(r.par),
        tee: r.tee || "",
        date: r.date,
        scoreId: r.scoreId,
        diff: Number(r.gross) - Number(r.par),
      }))
      .sort((a, b) => a.x - b.x);
  }, [rounds]);

  if (pts.length < 3) return null;

  // Dimensões SVG
  const W = 1200, H = 170;
  const padL = 32, padR = 12, padT = 14, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.gross);
  const pars = pts.map(p => p.par);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMinRaw = Math.min(...ys, ...pars), yMaxRaw = Math.max(...ys, ...pars);
  // Margem de 2 golpes em cima e em baixo
  const yMin = Math.floor(yMinRaw - 2), yMax = Math.ceil(yMaxRaw + 2);

  const xScale = (x: number) => padL + (xMax === xMin ? innerW / 2 : ((x - xMin) / (xMax - xMin)) * innerW);
  const yScale = (y: number) => padT + innerH - ((y - yMin) / (yMax - yMin || 1)) * innerH;

  // Path da linha de gross (poliline suave)
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.x).toFixed(1)} ${yScale(p.gross).toFixed(1)}`).join(" ");

  // Par: se for constante, linha horizontal; se não, liga os pontos
  const parConst = pars.every(p => p === pars[0]);
  const parPath = parConst
    ? `M ${padL} ${yScale(pars[0])} L ${W - padR} ${yScale(pars[0])}`
    : pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.x).toFixed(1)} ${yScale(p.par).toFixed(1)}`).join(" ");

  // Grid Y (3 linhas)
  const yTicks = [yMin, Math.round((yMin + yMax) / 2), yMax];

  // Labels X: primeiro e último ponto
  const fmtDate = (ds: string) => ds ? ds.substring(0, 5) + "/" + ds.slice(-2) : "";

  return (
    <div className="mt-10">
      <div className="h-sm">Evolução dos gross <span className="muted fs-11">({pts.length} rondas de 18 buracos · linha tracejada = par)</span></div>
      <div className="scroll-x">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="Evolução do gross ao longo do tempo">
          {/* Eixo Y: linhas de grelha */}
          {yTicks.map(t => (
            <g key={t}>
              <line x1={padL} y1={yScale(t)} x2={W - padR} y2={yScale(t)} stroke="var(--border-light)" strokeWidth={1} strokeDasharray={t === yTicks[1] ? "" : "2 3"} />
              <text x={padL - 4} y={yScale(t) + 3} fontSize={10} fill="var(--text-3)" textAnchor="end">{t}</text>
            </g>
          ))}
          {/* Linha do par */}
          <path d={parPath} stroke="var(--color-good)" strokeWidth={1.5} strokeDasharray="5 4" fill="none" opacity={0.7} />
          {/* Linha dos gross */}
          <path d={linePath} stroke="var(--chart-2)" strokeWidth={2} fill="none" />
          {/* Pontos com cor do tee */}
          {pts.map(p => {
            const hex = getTeeHex(p.tee);
            const above = p.diff > 0;
            return (
              <g key={p.scoreId}>
                <circle cx={xScale(p.x)} cy={yScale(p.gross)} r={4.5} fill={hex} stroke="var(--bg-card)" strokeWidth={1.5}>
                  <title>{`${p.date} · ${p.tee} · Gross ${p.gross} (par ${p.par}, ${above ? "+" : ""}${p.diff})`}</title>
                </circle>
              </g>
            );
          })}
          {/* Labels X: datas espaçadas — só rende cada etiqueta se distar o suficiente
              da anterior em x (evita sobreposição quando há rondas em datas próximas). */}
          {(() => {
            const lastIdx = pts.length - 1;
            const minGap = 95;
            const want = Math.min(8, pts.length);
            const cand = Array.from(new Set(
              Array.from({ length: want }, (_, i) => Math.round((i * lastIdx) / (want - 1)))
            ));
            const keep: number[] = [];
            let lastX = -Infinity;
            for (const idx of cand) {
              const x = xScale(pts[idx].x);
              if (x - lastX >= minGap) { keep.push(idx); lastX = x; }
            }
            if (keep.length === 0 || keep[keep.length - 1] !== lastIdx) {
              if (keep.length && xScale(pts[lastIdx].x) - lastX < minGap) keep[keep.length - 1] = lastIdx;
              else keep.push(lastIdx);
            }
            return keep.map(idx => {
              const anchor = idx === 0 ? "start" : idx === lastIdx ? "end" : "middle";
              return <text key={idx} x={xScale(pts[idx].x)} y={H - 8} fontSize={10} fill="var(--text-3)" textAnchor={anchor}>{fmtDate(pts[idx].date)}</text>;
            });
          })()}
        </svg>
      </div>
    </div>
  );
}

/* ─── Course Performance Analysis (KPIs + Conclusion) ─── */
export default function CoursePerformanceSection({ rounds }: { rounds: RoundData[] }) {
  const stats = useMemo(() => {
    const r18 = rounds.filter(r => r.holeCount === 18 && (r.sd != null || r.stb != null));
    const r9 = rounds.filter(r => r.holeCount === 9 && (r.sd != null || r.stb != null));
    if (r18.length + r9.length < 2) return null;

    interface NormRound { sd: number | null; stb: number | null; hi: number | null; tee: string; date: string; dateSort: number; holeCount: number; gross: number | null; par: number | null }
    const allNorm: NormRound[] = [];
    r18.forEach(r => allNorm.push({
      sd: r.sd != null ? Number(r.sd) : null, stb: r.stb != null ? Number(r.stb) : null,
      hi: r.hi, tee: r.tee || "?", date: r.date || "", dateSort: r.dateSort,
      holeCount: 18, gross: r.gross ? Number(r.gross) : null, par: r.par ? Number(r.par) : null
    }));
    r9.forEach(r => allNorm.push({
      sd: r.sd != null ? Number(r.sd) : null, stb: r.stb != null ? Number(r.stb) + 17 : null,
      hi: r.hi, tee: r.tee || "?", date: r.date || "", dateSort: r.dateSort,
      holeCount: 9, gross: null, par: null
    }));
    allNorm.sort((a, b) => a.dateSort - b.dateSort);

    const sdArr = allNorm.map(r => r.sd).filter((x): x is number => x != null && !isNaN(x));
    const stbArr = allNorm.map(r => r.stb).filter((x): x is number => x != null && !isNaN(x));

    // Trend: linear regression on SD
    let trendLabel = "➡️ Estável", trendCls = "trend-flat";
    if (sdArr.length >= 3) {
      const slope = linearSlope(sdArr)!;
      if (slope < -0.3) { trendLabel = "📈 A melhorar"; trendCls = "trend-up"; }
      else if (slope > 0.3) { trendLabel = "📉 A piorar"; trendCls = "trend-down"; }
    }

    // By tee breakdown
    const teeMap: Record<string, { tee: string; sds: number[]; stbs: number[]; grosses: number[]; pars: number[]; count: number }> = {};
    allNorm.forEach(r => {
      if (!teeMap[r.tee]) teeMap[r.tee] = { tee: r.tee, sds: [], stbs: [], grosses: [], pars: [], count: 0 };
      if (r.sd != null && !isNaN(r.sd)) teeMap[r.tee].sds.push(r.sd);
      if (r.stb != null && !isNaN(r.stb)) teeMap[r.tee].stbs.push(r.stb);
      if (r.gross != null && r.par != null) { teeMap[r.tee].grosses.push(r.gross); teeMap[r.tee].pars.push(r.par); }
      teeMap[r.tee].count++;
    });
    const teeArr = Object.values(teeMap).sort((a, b) => b.count - a.count);

    // Conclusion (native React elements)
    const grossArr18 = allNorm.filter(r => r.gross != null && r.par != null);
    const conclusion: React.ReactNode[] = [];
    if (grossArr18.length >= 2) {
      const avgG = meanArr(grossArr18.map(r => r.gross!))!;
      const avgP = meanArr(grossArr18.map(r => r.par!))!;
      const diff = avgG - avgP;
      const bestG = minArr(grossArr18.map(r => r.gross!))!;
      const bestP = grossArr18.reduce((a, r) => r.gross! < a.gross! ? r : a).par;
      conclusion.push(<span key="avg">Em média faz <b>{avgG.toFixed(0)} pancadas</b> neste campo (<b>{fmtSign(diff, 0)} vs par</b>). </span>);
      conclusion.push(<span key="best">O melhor resultado foi <b>{bestG}</b> (par {bestP}). </span>);
    }
    if (stbArr.length >= 2) {
      const avgStb = meanArr(stbArr)!;
      if (avgStb >= 36) conclusion.push(<span key="stb">A média Stableford de <b>{avgStb.toFixed(0)}</b> mostra que joga <b className="c-par-ok">consistentemente bem</b> aqui. </span>);
      else if (avgStb >= 30) conclusion.push(<span key="stb">A média Stableford de <b>{avgStb.toFixed(0)}</b> mostra um desempenho <b>sólido</b>. </span>);
      else conclusion.push(<span key="stb">A média Stableford de <b>{avgStb.toFixed(0)}</b> sugere <b className="c-eagle">espaço para melhorar</b> neste campo. </span>);
    }
    if (trendCls === "trend-up") conclusion.push(<span key="trend">A tendência é <b className="c-par-ok">positiva</b> — está a melhorar neste campo. </span>);
    else if (trendCls === "trend-down") conclusion.push(<span key="trend">A tendência é <b className="c-birdie">negativa</b> — os resultados recentes pioraram. </span>);
    if (teeArr.length > 1) {
      const bestTee = teeArr.reduce((a, b) => (meanArr(b.stbs) ?? 0) > (meanArr(a.stbs) ?? 0) ? b : a);
      if (bestTee.stbs.length >= 2) conclusion.push(<span key="tee">Os tees <b>{bestTee.tee}</b> são onde tem melhores resultados (Stb {meanArr(bestTee.stbs)!.toFixed(0)}). </span>);
    }

    return {
      has9: r9.length > 0, r18Count: r18.length, r9Count: r9.length,
      totalRounds: allNorm.length,
      sdArr, stbArr,
      avgSd: meanArr(sdArr), minSd: minArr(sdArr), maxSd: maxArr(sdArr),
      avgStb: meanArr(stbArr), maxStb: maxArr(stbArr),
      trendLabel, trendCls,
      conclusion,
    };
  }, [rounds]);

  if (!stats) return null;

  // Versão compacta: tendência pill + resumo em prosa + timeline.
  // Os KPIs (Média SD, Melhor SD, etc.) deixam de aparecer aqui porque já estão
  // no bloco do Eclético (colunas HCP/Stb/SD por ronda + totais).
  return (
    <details className="details-block mt-10">
      <summary className="details-summary">
        Evolução neste campo
        {stats.sdArr.length >= 3 && (
          <span className={`p p-sm ml-6 ${stats.trendCls}`} title="Tendência linear da série de SDs">
            {stats.trendLabel}
          </span>
        )}
      </summary>
      {stats.conclusion.length > 0 && (
        <div className="caConcText fs-12 mt-6">{stats.conclusion}</div>
      )}
      {stats.has9 && <div className="muted fs-10 mt-4">Stb 9h normalizado +17</div>}
      <RoundsTimeline rounds={rounds} />
    </details>
  );
}
