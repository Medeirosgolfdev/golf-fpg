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
    <section className="u-mb-4px">
      <div className="u-d-flex u-ai-baseline u-jc-space-between u-m-8px-0-10px u-gap-8px">
        <h3 className="u-m-0 u-fs-fs-14 u-fw-700 u-c-text">
          🏆 Palmarès
        </h3>
        <span className="u-fs-fs-11 u-c-text-3">
          {showAll
            ? `${allWins.length} vitórias`
            : `${visible.length} de ${allWins.length} vitórias · recentes + ★★★+`}
        </span>
      </div>

      <div className="u-d-grid u-grid-template-columns-u0vn1 u-gap-10px">
        {visible.map((w) => (
          <WinCard key={w.tid + "_" + w.flight.flightKey} win={w} />
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="u-mt-10px u-p-6px-14px u-bg-bg-muted u-bd-1px-solid-border-light u-br-radius u-fs-fs-12 u-fw-600 u-c-text-2 u-cur-pointer u-w-100pc"
        >
          Ver as restantes {hiddenCount} {hiddenCount === 1 ? "vitória" : "vitórias"} (inclui ★)
        </button>
      )}
      {showAll && allWins.length > DEFAULT_LIMIT && (
        <button
          onClick={() => setShowAll(false)}
          className="u-mt-10px u-p-6px-14px u-bg-bg u-bd-1px-solid-border-light u-br-radius u-fs-fs-11 u-fw-600 u-c-text-3 u-cur-pointer u-w-100pc"
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
    <div className="u-bg-bg-card u-bd-1px-solid-border-light u-bl-3px-solid-medal-gold-strong u-br-radius u-p-10px-12px u-d-flex u-fd-column u-gap-6px u-minh-90px">
      <div className="u-d-flex u-ai-baseline u-jc-space-between u-gap-6px">
        <span className="u-fs-fs-16 u-lh-1">🏆</span>
        <span title={`${win.stars}/5 estrelas de prestígio`} className="u-fs-fs-10 u-ls-0_3px u-c-medal-gold-strong u-fsh-0 u-fw-600">
          {formatStars(win.stars)}
        </span>
      </div>
      <div className="u-fl-1">
        <div className="u-fs-fs-13 u-fw-700 u-c-text u-lh-1_25">
          {t.name || t.shortName || win.tid}
        </div>
        <div className="u-fs-fs-10 u-c-text-3 u-mt-3px">
          {monthLabel ? `${monthLabel} ${year}` : year} · {win.flight.label}
        </div>
      </div>
      <div className="u-d-flex u-ai-center u-gap-6px u-fs-fs-11 u-fwr-wrap">
        {win.toPar != null && (
          <span style={{
            fontWeight: 700,
            color: tpColor(win.toPar) ?? "var(--text-2)",
          }} title="Total ±par">
            {fmtToPar(win.toPar)}
          </span>
        )}
        {win.manuelToPar != null && (
          <span title="±par do Manuel neste torneio" className="u-fs-fs-9 u-p-1px-4px u-br-radius-sm u-fw-700 u-bg-var-bg-success-subtle-ecfdf5 u-c-color-good-dark u-bd-1px-solid-color-good-dark">
            M: {win.manuelToPar === 0 ? "E" : win.manuelToPar > 0 ? `+${win.manuelToPar}` : String(win.manuelToPar)}
          </span>
        )}
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="u-ml-auto u-c-text-3 u-td-none u-fs-fs-12 u-fw-600" title="Abrir resultados">↗</a>
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
