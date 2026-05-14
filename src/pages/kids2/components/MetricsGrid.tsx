/**
 * kids2/components/MetricsGrid.tsx
 *
 * 6 cards: Torneios · Vitórias · Top-3 · Melhor ±par · Média ronda (±σ) · % sub-par.
 * Grelha responsive 6 cols em desktop, 3×2 em mobile (via grid-template-columns
 * repeat(auto-fit, minmax(...))).
 */

import type { CanonicalData, Junior } from "../data";
import { countWins, countTop3, computeRoundStats } from "../data";

interface Props {
  data: CanonicalData;
  junior: Junior;
  filterTids?: Set<string> | null;
}

export default function MetricsGrid({ data, junior, filterTids }: Props) {
  const total = filterTids
    ? junior.tournamentIds.filter((tid) => filterTids.has(tid)).length
    : junior.tournamentIds.length;
  const wins = countWins(junior, data.tournamentById);
  const top3 = countTop3(junior, data.tournamentById);
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
      const monthLabel = m ? MONTHS_PT_SHORT[Number(m) - 1] : "";
      const fullName = t.name || t.shortName || "";
      const datePart = year ? (monthLabel ? `${monthLabel} ${year}` : year) : "";
      bestSub = `${shortNameOf(fullName)} · R${stats.bestToPar.round}${datePart ? " · " + datePart : ""}`;
    }
  }

  const fmtToPar = (n: number): string => n === 0 ? "E" : n > 0 ? `+${n}` : String(n);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
      gap: 10,
    }}>
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

function Card({ label, value, subtitle, accent }: {
  label: string;
  value: string;
  subtitle?: string;
  accent?: "good" | "warn";
}) {
  const valueColor =
    accent === "good" ? "var(--medal-gold-strong)" :
    accent === "warn" ? "var(--color-warn-dark)" :
    "var(--text)";
  return (
    <div style={{
      background: "var(--bg-muted)",
      borderRadius: 6,
      padding: "10px 12px",
    }}>
      <div style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 3, color: valueColor }}>{value}</div>
      {subtitle && <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

/** Abrevia o nome do torneio de forma inteligente, mantendo o escalão.
 *  Antes truncava a 24 chars cegamente — "Campeonato Nacional Sub 12 H"
 *  ficava "Campeonato Nacional Sub " (sem o número). */
function shortNameOf(s: string): string {
  if (!s) return "";
  return s
    .replace(/\s+/g, " ")
    .trim()
    // Abreviações longas → curtas (preservam escalão/divisão)
    .replace(/Campeonato\s+Nacional\s+de\s+Jovens\s+/i, "CNJ ")
    .replace(/Campeonato\s+Nacional\s+(?:de\s+)?/i, "Nacional ")
    .replace(/Greatgolf\s+Junior\s+Open(?:\s+with\s+[^·-]+)?/i, "Greatgolf JO")
    .replace(/Quinta\s+do\s+Lago\s+Junior\s+Open/i, "QdL JO")
    .replace(/USKids?\s+European\s+Championship/i, "USKids Euro")
    .replace(/USKids?\s+World\s+Championship/i, "USKids World")
    .replace(/Marco\s+Simone\s+Invitational/i, "Marco Simone")
    .replace(/Venice\s+Open/i, "Venice")
    .replace(/Rome\s+Classic/i, "Rome")
    .replace(/Real\s+Club\s+de\s+Golf\s+El\s+Prat/i, "El Prat")
    .replace(/European\s+Open\s+WAGR/i, "EOWAGR")
    .replace(/Daily\s+Mail\s+WJGC/i, "DM WJGC")
    .replace(/First\s+Tee\s+Miami\s+Doral\s+Jr\.?\s+Classic/i, "Doral Jr Classic")
    .replace(/\s+/g, " ")
    .trim()
    // Cap final para evitar overflow em casos não cobertos
    .slice(0, 32);
}

const MONTHS_PT_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
