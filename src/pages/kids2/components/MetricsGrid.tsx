/**
 * kids2/components/MetricsGrid.tsx
 *
 * 4 cards: Torneios · Vitórias · Top-3 · Melhor ronda.
 */

import React from "react";
import type { CanonicalData, Junior } from "../data";
import { countWins, countTop3, bestRoundGross } from "../data";

interface Props {
  data: CanonicalData;
  junior: Junior;
}

export default function MetricsGrid({ data, junior }: Props) {
  const total = junior.tournamentIds.length;
  const wins = countWins(junior, data.tournamentById);
  const top3 = countTop3(junior, data.tournamentById);
  const best = bestRoundGross(junior, data.tournamentById);

  const winsPct = total > 0 ? Math.round((wins / total) * 100) : 0;
  const top3Pct = total > 0 ? Math.round((top3 / total) * 100) : 0;

  const bestTourn = best ? data.tournamentById.get(best.tournamentId) : null;

  // Determinar par-relative para o melhor gross
  let bestSub = "";
  if (best && bestTourn) {
    for (const f of bestTourn.flights) {
      const r = f.results.find((x) => x.juniorId === junior.id);
      if (r?.rounds?.some((rd) => rd.round === best.round && rd.gross === best.gross)) {
        const parPerRound = f.par?.reduce((a, b) => a + (b || 0), 0) || bestTourn.parTotal;
        if (parPerRound) {
          const diff = best.gross - parPerRound;
          const diffStr = diff === 0 ? "E" : diff > 0 ? `+${diff}` : String(diff);
          bestSub = `${shortNameOf(bestTourn.name || bestTourn.shortName || "")} · R${best.round} · ${diffStr}`;
        } else {
          bestSub = `${shortNameOf(bestTourn.name || "")} · R${best.round}`;
        }
        break;
      }
    }
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 10,
    }}>
      <Card label="Torneios" value={String(total)} subtitle={`${data.tournaments.length} totais no canónico`} />
      <Card label="🏆 Vitórias" value={String(wins)} subtitle={total ? `${winsPct}% taxa` : undefined} />
      <Card label="Top-3" value={String(top3)} subtitle={total ? `${top3Pct}% taxa` : undefined} />
      <Card label="Melhor ronda" value={best ? String(best.gross) : "—"} subtitle={bestSub || undefined} />
    </div>
  );
}

function Card({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div style={{
      background: "var(--bg-muted)",
      borderRadius: 6,
      padding: "10px 12px",
    }}>
      <div style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 3, color: "var(--text)" }}>{value}</div>
      {subtitle && <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function shortNameOf(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 24);
}
