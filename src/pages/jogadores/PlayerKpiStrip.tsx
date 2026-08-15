/**
 * src/pages/jogadores/PlayerKpiStrip.tsx
 *
 * Faixa de KPIs partilhada — abre TODAS as vistas em tabela (Por data, Por
 * campo, Por torneio) com o mesmo ritmo rico das vistas Análises/Federado.
 * Usa os mesmos .kpi-card globais.
 */
import { useMemo } from "react";
import type { PlayerPageData, RoundData } from "../../data/playerDataLoader";
import { numSafe, meanArr } from "../../utils/mathUtils";
import UiKpiCard from "../../ui/KpiCard";

export default function PlayerKpiStrip({ data, currentHcp, roundsThisYear, ppHcp, onPpClick }: {
  data: PlayerPageData; currentHcp: number | null; roundsThisYear: number;
  /** Handicap Pitch & Putt — mostrado ao LADO do índice normal (é um
   *  handicap, não um facto de cadastro). Clique abre a vista P&P. */
  ppHcp?: number | string | null;
  onPpClick?: () => void;
}) {
  const k = useMemo(() => {
    const arr: (RoundData & { course: string })[] = [];
    data.DATA.forEach(c => c.rounds.forEach(r => arr.push({ ...r, course: c.course })));
    arr.sort((a, b) => (b.dateSort || 0) - (a.dateSort || 0));
    const sdRounds = arr.filter(r => numSafe(r.sd) != null);
    const avgSD20 = meanArr(sdRounds.slice(0, 20).map(r => Number(r.sd)));
    const bestSD = sdRounds.length ? Math.min(...sdRounds.map(r => Number(r.sd))) : null;
    // Evolução do índice ~12 meses: índice actual vs hi pré-ronda de há ~1 ano.
    const cutoff = Date.now() - 365 * 24 * 3600 * 1000;
    const withHi = arr.filter(r => numSafe(r.hi) != null);
    const old = withHi.find(r => (r.dateSort || 0) <= cutoff);
    const idxThen = old ? Number(old.hi) : null;
    const idxDelta = (currentHcp != null && idxThen != null) ? currentHcp - idxThen : null;
    // Rondas do ano anterior (mesma lógica de r.date que roundsThisYear).
    const prevY = String(new Date().getFullYear() - 1);
    let roundsPrevYear = 0;
    arr.forEach(r => { if (r.date && r.date.slice(-4) === prevY) roundsPrevYear++; });
    return { totalRounds: arr.length, totalCourses: data.DATA.length, avgSD20, bestSD, idxDelta, roundsPrevYear };
  }, [data, currentHcp]);
  const curY = new Date().getFullYear();
  return (
    <div className="jog-kpi-strip">
      <UiKpiCard size="sm" className="kpi-hero" label="Índice" value={currentHcp != null ? currentHcp.toFixed(1) : "—"}
        delta={k.idxDelta} deltaLabel="em 12m"
        fill={k.idxDelta == null ? null
          : k.idxDelta < -0.05 ? "good"   /* índice desceu → melhorou → verde */
          : k.idxDelta > 0.05 ? "danger"  /* índice subiu → piorou → vermelho */
          : null} />
      {ppHcp != null && (
        <span onClick={onPpClick}
          style={{ display: "inline-flex", cursor: onPpClick ? "pointer" : undefined }}
          title="Handicap Pitch & Putt — clica para ver o histórico P&P">
          <UiKpiCard size="sm" label="P&P" value={ppHcp} sub="pitch & putt" />
        </span>
      )}
      <UiKpiCard size="sm" label="Voltas" value={k.totalRounds} sub={`${k.totalCourses} campos`} />
      <UiKpiCard size="sm" label={`Rondas ${curY}`} value={roundsThisYear}
        sub={k.roundsPrevYear > 0 ? `vs ${k.roundsPrevYear} em ${curY - 1}` : undefined} />
      <UiKpiCard size="sm" label="SD médio" value={k.avgSD20 != null ? k.avgSD20.toFixed(1) : "—"} sub="janela WHS" />
      <UiKpiCard size="sm" label="Melhor SD" value={k.bestSD != null ? k.bestSD.toFixed(1) : "—"} color="var(--color-good)" sub="carreira" />
    </div>
  );
}
