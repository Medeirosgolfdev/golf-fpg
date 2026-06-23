/**
 * kids2/components/PalmaresSection.tsx
 *
 * Catálogo completo de vitórias do junior em formato de cards dourados, ordenado
 * por peso de torneio (desc) e depois data (desc). Complementa o palmarès inline
 * do hero (top 5) com TODAS as vitórias e mais detalhe por card:
 *   • nome do torneio + edição + flight
 *   • estrelas de prestígio
 *   • ±par final
 *   • diff vs Manuel (quando Manuel também jogou esse torneio)
 *
 * Não aparece para juniors sem vitórias nem para a ficha do próprio Manuel
 * (o hero já mostra o palmarès dele).
 */

import { useMemo, useState } from "react";
import type { CanonicalData, Junior, Tournament, Flight, Result } from "../data";
import { getTournWeight, formatStars } from "../tournWeight";
import { tpColor } from "../../../ui/tournamentPrimitives";
import { fmtToPar, MONTHS_PT } from "../../../utils/format";

const DEFAULT_LIMIT = 6;
const RECENT_MONTHS = 24; // "recente" = últimos 24 meses
const HIGH_STARS_THRESHOLD = 3; // a partir de ★★★ subimos mesmo antigas

interface Props {
  data: CanonicalData;
  junior: Junior;
  filterTids?: Set<string> | null;
}

interface WinCard {
  tid: string;
  tournament: Tournament;
  flight: Flight;
  result: Result;
  stars: number;
  toPar: number | null;
  manuelToPar: number | null;
}

export default function PalmaresSection({ data, junior, filterTids }: Props) {
  const [showAll, setShowAll] = useState(false);

  const allWins = useMemo(() => collectAllWins(data, junior, filterTids), [data, junior, filterTids]);

  // Por default mostra vitórias RECENTES (últimos 24m) OU vitórias marcantes (★★★+)
  // — descarta destaques de 2020 com 2★ que estavam a poluir a secção.
  // Botão "Ver todas" expande para a lista completa.
  const featured = useMemo(() => {
    const now = Date.now();
    const cutoff = now - RECENT_MONTHS * 30 * 24 * 3600 * 1000;
    return allWins.filter((w) => {
      if (w.stars >= HIGH_STARS_THRESHOLD) return true;
      const dStr = w.tournament.date || w.tournament.startDate || "";
      const t = dStr ? new Date(dStr).getTime() : 0;
      return t > 0 && t >= cutoff;
    });
  }, [allWins]);

  // Early return DEPOIS de todos os hooks (Rules of Hooks).
  if (allWins.length === 0) return null;

  const visible = showAll ? allWins : featured.slice(0, DEFAULT_LIMIT);
  const hiddenCount = allWins.length - visible.length;

  return (
    <section style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "8px 0 10px", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--text)" }}>
          🏆 Palmarès
        </h3>
        <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
          {showAll
            ? `${allWins.length} vitórias`
            : `${visible.length} de ${allWins.length} vitórias · recentes + ★★★+`}
        </span>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 10,
      }}>
        {visible.map((w) => (
          <WinCard key={w.tid + "_" + w.flight.flightKey} win={w} />
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            marginTop: 10, padding: "6px 14px",
            background: "var(--bg-muted)", border: "1px solid var(--border-light)",
            borderRadius: 6, fontSize: "var(--fs-12)", fontWeight: 600,
            color: "var(--text-2)", cursor: "pointer",
            width: "100%",
          }}
        >
          Ver as restantes {hiddenCount} {hiddenCount === 1 ? "vitória" : "vitórias"} (inclui ★)
        </button>
      )}
      {showAll && allWins.length > DEFAULT_LIMIT && (
        <button
          onClick={() => setShowAll(false)}
          style={{
            marginTop: 10, padding: "6px 14px",
            background: "var(--bg)", border: "1px solid var(--border-light)",
            borderRadius: 6, fontSize: "var(--fs-11)", fontWeight: 600,
            color: "var(--text-3)", cursor: "pointer",
            width: "100%",
          }}
        >
          Recolher (mostrar só destaques)
        </button>
      )}
    </section>
  );
}

function WinCard({ win }: { win: WinCard }) {
  const t = win.tournament;
  const date = t.date || t.startDate || "";
  const year = date.slice(0, 4) || "?";
  const month = date.slice(5, 7);
  const monthLabel = month ? MONTHS_PT[Number(month) - 1] : "";
  const url = t.links?.[0]?.url;

  return (
    <div style={{
      // Discreto: fundo de card normal, sem gradient amarelo agressivo.
      // O destaque dourado fica apenas no troféu + estrelas.
      background: "var(--bg-card)",
      border: "1px solid var(--border-light)",
      borderLeft: "3px solid var(--medal-gold-strong)",
      borderRadius: 6,
      padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 6,
      minHeight: 90,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontSize: "var(--fs-16)", lineHeight: 1 }}>🏆</span>
        <span title={`${win.stars}/5 estrelas de prestígio`} style={{
          fontSize: "var(--fs-10)", letterSpacing: 0.3, color: "var(--medal-gold-strong)", flexShrink: 0, fontWeight: 600,
        }}>
          {formatStars(win.stars)}
        </span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "var(--fs-13)", fontWeight: 700, color: "var(--text)", lineHeight: 1.25 }}>
          {t.name || t.shortName || win.tid}
        </div>
        <div style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", marginTop: 3 }}>
          {monthLabel ? `${monthLabel} ${year}` : year} · {win.flight.label}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-11)", flexWrap: "wrap" }}>
        {win.toPar != null && (
          <span style={{
            fontWeight: 700,
            color: tpColor(win.toPar) ?? "var(--text-2)",
          }} title="Total ±par">
            {fmtToPar(win.toPar)}
          </span>
        )}
        {win.manuelToPar != null && (
          <span title="±par do Manuel neste torneio" style={{
            fontSize: "var(--fs-9)", padding: "1px 5px", borderRadius: 3, fontWeight: 700,
            background: "var(--bg-success-subtle, #ecfdf5)", color: "var(--color-good-dark)",
            border: "1px solid var(--color-good-dark)",
          }}>
            M: {win.manuelToPar === 0 ? "E" : win.manuelToPar > 0 ? `+${win.manuelToPar}` : String(win.manuelToPar)}
          </span>
        )}
        {url && (
          <a href={url} target="_blank" rel="noreferrer" style={{
            marginLeft: "auto", color: "var(--text-3)", textDecoration: "none",
            fontSize: "var(--fs-12)", fontWeight: 600,
          }} title="Abrir resultados">↗</a>
        )}
      </div>
    </div>
  );
}

function collectAllWins(data: CanonicalData, junior: Junior, filterTids?: Set<string> | null): WinCard[] {
  const manuelId = data.manuel?.id;
  const isManuelView = manuelId === junior.id;
  const out: WinCard[] = [];
  const seenTid = new Set<string>();
  for (const tid of junior.tournamentIds) {
    if (filterTids && !filterTids.has(tid)) continue;
    const t = data.tournamentById.get(tid);
    if (!t) continue;
    for (const f of t.flights) {
      const r = f.results.find((x) => x.juniorId === junior.id);
      if (r?.pos !== 1) continue;
      if (seenTid.has(tid)) continue; // 1 win per tournament
      seenTid.add(tid);
      const flightFs = typeof f.fieldSize === "number" && f.fieldSize > 0 ? f.fieldSize : f.results.length;
      const w = getTournWeight(t, flightFs);
      // ±par do junior (preferir explícito, senão calcular)
      const parTotal = f.par?.reduce((a, b) => a + (b || 0), 0) || t.parTotal || 0;
      const grosses = (r.rounds || []).map((rd) => rd.gross).filter((g): g is number => typeof g === "number");
      const total = r.totalGross ?? (grosses.length ? grosses.reduce((a, b) => a + b, 0) : null);
      const toPar = r.toPar ?? (total != null && parTotal && grosses.length ? total - parTotal * grosses.length : null);

      // ±par do Manuel no mesmo torneio (se aplicável)
      let manuelToPar: number | null = null;
      if (manuelId && !isManuelView) {
        for (const mf of t.flights) {
          const mR = mf.results.find((x) => x.juniorId === manuelId);
          if (!mR) continue;
          const mParTotal = mf.par?.reduce((a, b) => a + (b || 0), 0) || t.parTotal || 0;
          const mGrosses = (mR.rounds || []).map((rd) => rd.gross).filter((g): g is number => typeof g === "number");
          const mTotal = mR.totalGross ?? (mGrosses.length ? mGrosses.reduce((a, b) => a + b, 0) : null);
          manuelToPar = mR.toPar ?? (mTotal != null && mParTotal && mGrosses.length ? mTotal - mParTotal * mGrosses.length : null);
          break;
        }
      }

      out.push({
        tid,
        tournament: t,
        flight: f,
        result: r,
        stars: w.stars,
        toPar: toPar ?? null,
        manuelToPar,
      });
      break;
    }
  }
  // Sort: prioriza vitórias recentes; só 3★+ do passado conseguem subir.
  const now = Date.now();
  const MS_IN_MONTH = 1000 * 60 * 60 * 24 * 30;
  out.sort((a, b) => scoreWin(b) - scoreWin(a));
  return out;

  function scoreWin(w: WinCard): number {
    const dStr = w.tournament.date || w.tournament.startDate || "";
    const t = dStr ? new Date(dStr).getTime() : 0;
    const monthsAgo = t > 0 ? (now - t) / MS_IN_MONTH : 999;
    const recency = Math.max(0, 24 - monthsAgo);
    return w.stars * 6 + recency;
  }
}
