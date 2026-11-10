/**
 * kids2/components/MetricsGrid.tsx
 *
 * 6 cards: Torneios · Vitórias · Top-3 · Melhor ±par · Média ronda (±σ) · % sub-par.
 * Grelha responsive 6 cols em desktop, 3×2 em mobile (via grid-template-columns
 * repeat(auto-fit, minmax(...))).
 */

import type { CanonicalData, Junior } from "../data";
import { countWins, countTop3, computeRoundStats } from "../data";
import { fmtToPar, MONTHS_PT, shortTournamentName } from "../../../utils/format";
import KpiCard from "../../../ui/KpiCard";

interface Props {
  data: CanonicalData;
  junior: Junior;
  filterTids?: Set<string> | null;
}

export default function MetricsGrid({ data, junior, filterTids }: Props) {
  const total = filterTids
    ? junior.tournamentIds.filter((tid) => filterTids.has(tid)).length
    : junior.tournamentIds.length;
  // Com o MESMO filtro de circuito dos torneios (10/11/2026): senão a taxa passava de 100 %.
  const wins = countWins(junior, data.tournamentById, undefined, filterTids);
  const top3 = countTop3(junior, data.tournamentById, undefined, filterTids);
  const stats = computeRoundStats(junior, data.tournamentById, filterTids);

  const winsPct = total > 0 ? Math.round((wins / total) * 100) : 0;
  const top3Pct = total > 0 ? Math.round((top3 / total) * 100) : 0;

  // Subtítulo para "Melhor ±par" — qual torneio, ronda e ANO.
  // O ano é crítico: o KPI agrega TODA a carreira (sem filtros), mas a lista
  // de Resultados pode ter anos antigos colapsados — sem ano o utilizador
  // pode não encontrar o torneio.
  let bestSub = "";
  if (stats.bestToPar) {
    const t = data.tournamentById.get(stats.bestToPar.tournamentId);
    if (t) {
      const date = t.date || t.startDate || "";
      const year = date.slice(0, 4);
      const m = date.slice(5, 7);
      const monthLabel = m ? MONTHS_PT[Number(m) - 1] : "";
      const fullName = t.name || t.shortName || "";
      const datePart = year ? (monthLabel ? `${monthLabel} ${year}` : year) : "";
      bestSub = `${shortTournamentName(fullName, { max: 32 })} · R${stats.bestToPar.round}${datePart ? " · " + datePart : ""}`;
    }
  }

  return (
    <div className="kpi-row u-m-0">
      <Card label="Torneios" value={String(total)} subtitle={`${data.tournaments.length} totais no canónico`} />
      <Card label="🏆 Vitórias" value={String(wins)} subtitle={total ? `${winsPct}% taxa` : undefined} />
      <Card label="Top-3" value={String(top3)} subtitle={total ? `${top3Pct}% taxa` : undefined} />
      <Card
        label="Melhor ±par"
        value={stats.bestToPar ? fmtToPar(stats.bestToPar.value) : "—"}
        subtitle={bestSub || undefined}
        accent={stats.bestToPar && stats.bestToPar.value < 0 ? "good" : undefined}
      />
      <Card
        label="Média ronda"
        value={stats.mean != null ? stats.mean.toFixed(1) : "—"}
        subtitle={stats.sd != null && stats.total > 0
          ? `σ ${stats.sd.toFixed(1)} · ${stats.total} rondas`
          : undefined}
      />
      <Card
        label="% sub-par"
        value={stats.subParPct != null ? `${stats.subParPct}%` : "—"}
        subtitle={stats.subParPct != null ? "rondas abaixo do par" : "sem par registado"}
        accent={stats.subParPct != null && stats.subParPct >= 30 ? "good" : undefined}
      />
    </div>
  );
}

/** Adaptador fino → definição única KpiCard (destaque a dourado quando é bom). */
function Card({ label, value, subtitle, accent }: {
  label: string;
  value: string;
  subtitle?: string;
  accent?: "good" | "warn";
}) {
  const color = accent === "good" ? "var(--medal-gold-strong)" : accent === "warn" ? "var(--color-warn-dark)" : undefined;
  return <KpiCard label={label} value={value} sub={subtitle} color={color} />;
}

/** Abrevia o nome do torneio de forma inteligente, mantendo o escalão.
 *  Antes truncava a 24 chars cegamente — "Campeonato Nacional Sub 12 H"
 *  ficava "Campeonato Nacional Sub " (sem o número). */
