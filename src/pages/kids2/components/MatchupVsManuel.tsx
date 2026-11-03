/**
 * kids2/components/MatchupVsManuel.tsx
 *
 * Confronto vs Manuel — sem cor verde de "Manuel". Stats + tabela com troféus.
 *
 * Paridade com a tabela H2H detalhada do /kids-legacy (2026-08-06, sunset):
 * ±par por lado, coluna Resultado (venceu/empate) com tinte de linha, Dif.
 * preferindo ±par (robusto a WD/menos rondas), e KPIs de médias de posição.
 */

import type { CanonicalData, Junior, Flight, Result, Tournament } from "../data";
import { getSharedTournamentIds } from "../data";
import { useSort, compareValuesNullsLast } from "../../../hooks/useSort";
import SortableHdr from "../../../ui/SortableHdr";
import KpiCard from "../../../ui/KpiCard";
import ToPar from "../../../ui/ToPar";
import { fmtSign, monthLabel } from "../../../utils/format";
import ExtLink from "../../../ui/ExternalLink";
import { TrophyPos } from "../../../ui/PosBadge";

type SortKey = "date" | "name" | "flight" | "jGross" | "jPos" | "mGross" | "mPos" | "diff" | "result";

interface Props {
  data: CanonicalData;
  junior: Junior;
  manuel: Junior;
}

interface Row {
  t: Tournament;
  flight: Flight;
  rJ: Result;
  rM: Result;
  /** Dif. junior−Manuel: ±par quando ambos têm toPar (robusto a nº de rondas
   *  diferente, ex: WD), senão gross; null quando falta dos dois lados. */
  diff: number | null;
  /** -1 junior venceu · 0 empate · 1 Manuel venceu · null sem posições. */
  outcome: number | null;
}

/** Flight do torneio onde AMBOS jogaram. Não usar getResultInTournament de
 *  cada lado: um jogador pode aparecer em 2 flights do mesmo torneio (England
 *  cross-trophy) e o primeiro flight de um não é necessariamente o partilhado. */
function findSharedFlight(t: Tournament, junior: Junior, manuel: Junior): { flight: Flight; rJ: Result; rM: Result } | null {
  for (const f of t.flights) {
    const rJ = f.results.find((x) => x.juniorId === junior.id);
    if (!rJ) continue;
    const rM = f.results.find((x) => x.juniorId === manuel.id);
    if (rM) return { flight: f, rJ, rM };
  }
  return null;
}

export default function MatchupVsManuel({ data, junior, manuel }: Props) {
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("date", "desc", {
    date: "desc", name: "asc", flight: "asc",
    jGross: "asc", jPos: "asc", mGross: "asc", mPos: "asc", diff: "asc", result: "asc",
  });

  const sharedIds = getSharedTournamentIds(junior, manuel);
  if (sharedIds.length === 0) return null;

  const rows = sharedIds.map((tid) => {
    const t = data.tournamentById.get(tid);
    if (!t) return null;
    // Confronto real = mesmo flight (Boys 11 vs Boys 12 no mesmo torneio não conta).
    const shared = findSharedFlight(t, junior, manuel);
    if (!shared) return null;
    const { flight, rJ, rM } = shared;
    const diff = rJ.toPar != null && rM.toPar != null ? rJ.toPar - rM.toPar
      : rJ.totalGross != null && rM.totalGross != null ? rJ.totalGross - rM.totalGross
      : null;
    const outcome = typeof rJ.pos === "number" && typeof rM.pos === "number"
      ? (rJ.pos < rM.pos ? -1 : rJ.pos > rM.pos ? 1 : 0)
      : null;
    return { t, flight, rJ, rM, diff, outcome } as Row;
  }).filter(Boolean) as Row[];

  if (rows.length === 0) return null;

  const firstName = junior.canonicalName.split(" ")[0];
  let wins = 0, losses = 0, draws = 0;
  const diffs: number[] = [];
  let posJSum = 0, posMSum = 0, posN = 0;
  let worst: number | null = null;
  for (const r of rows) {
    if (r.outcome === -1) wins++;
    else if (r.outcome === 1) losses++;
    else if (r.outcome === 0) draws++;
    if (r.diff != null) {
      diffs.push(r.diff);
      if (worst == null || Math.abs(r.diff) > Math.abs(worst)) worst = r.diff;
    }
    if (typeof r.rJ.pos === "number" && typeof r.rM.pos === "number") {
      posJSum += r.rJ.pos; posMSum += r.rM.pos; posN++;
    }
  }
  const avgDiff = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;
  const avgPosJ = posN ? Math.round(posJSum / posN) : null;
  const avgPosM = posN ? Math.round(posMSum / posN) : null;

  // Ordenação aplicada antes do render
  const sortedRows = [...rows].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    // Vazios (null / "") sempre no fim, nas duas direcções.
    const getVal = (r: Row, key: SortKey): string | number | null => {
      switch (key) {
        case "date": return r.t.date || null;
        case "name": return (r.t.name || r.t.id || "").toLowerCase();
        case "flight": return r.flight.label || null;
        case "jGross": return r.rJ.totalGross ?? null;
        case "jPos": return typeof r.rJ.pos === "number" ? r.rJ.pos : null;
        case "mGross": return r.rM.totalGross ?? null;
        case "mPos": return typeof r.rM.pos === "number" ? r.rM.pos : null;
        case "diff": return r.diff ?? null;
        case "result": return r.outcome ?? null;
      }
    };
    return compareValuesNullsLast(getVal(a, sortKey), getVal(b, sortKey), mul);
  });

  return (
    <div className="u-bg-bg u-bd-1px-solid-border u-br-radius-lg u-p-12px-16px">
      <div className="u-d-flex u-ai-center u-gap-8px u-mb-12px">
        <span className="u-fs-fs-18">⚔️</span>
        <h3 className="u-m-0 u-fs-fs-14 u-fw-700 u-c-text">
          Confronto com Manuel
        </h3>
        {avgPosJ != null && avgPosM != null && (
          <span className="u-fs-fs-11 u-c-text-3 u-ml-auto">
            Avg: {firstName} {avgPosJ}.º · Manuel {avgPosM}.º
          </span>
        )}
      </div>

      <div className="kpi-row u-m-0-0-12px">
        <KpiCard label="encontros" value={String(rows.length)} align="center" />
        <KpiCard label={draws > 0 ? "V / D / E" : "vitórias / derrotas"} value={draws > 0 ? `${wins}–${losses}–${draws}` : `${wins}–${losses}`} align="center" />
        <KpiCard label="dif. média (±par)" value={avgDiff != null ? fmtDiff(avgDiff) : "—"} align="center" />
        <KpiCard label="pior margem" value={worst != null ? fmtDiff(worst) : "—"} align="center" />
      </div>

      <table className="dtable">
        <thead>
          <tr>
            <SortableHdr k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Data</SortableHdr>
            <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Torneio</SortableHdr>
            <SortableHdr k="flight" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Escalão</SortableHdr>
            <SortableHdr k="jGross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="u-ta-right">{firstName}</SortableHdr>
            <SortableHdr k="jPos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="u-ta-center">Pos</SortableHdr>
            <SortableHdr k="mGross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="col-manuel-th u-ta-right">Manuel</SortableHdr>
            <SortableHdr k="mPos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="col-manuel-th u-ta-center">Pos</SortableHdr>
            <SortableHdr k="diff" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="u-ta-right">Dif.</SortableHdr>
            <SortableHdr k="result" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="u-ta-right">Resultado</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r, i) => (
            <tr key={i} style={{
              background: r.outcome === -1 ? "rgba(22,163,74,.04)" : r.outcome === 1 ? "rgba(220,38,38,.04)" : undefined,
            }}>
              <td>{fmtDateShort(r.t.date)}</td>
              <td>
                {r.t.name || r.t.id}
                {r.t.links?.[0]?.url && (
                  <ExtLink href={r.t.links[0].url} className="u-ml-4px u-c-color-info">↗</ExtLink>
                )}
              </td>
              <td className="u-c-text-3">{r.flight.label}</td>
              <td className="u-ta-right">
                <RoundsCell result={r.rJ} />
                <ToParTag tp={r.rJ.toPar} />
              </td>
              <td className="u-ta-center"><TrophyPos pos={r.rJ.pos} /></td>
              <td className="col-manuel u-ta-right">
                <RoundsCell result={r.rM} />
                <ToParTag tp={r.rM.toPar} />
              </td>
              <td className="col-manuel u-ta-center"><TrophyPos pos={r.rM.pos} /></td>
              <td className="u-ta-right">
                <ToPar v={r.diff} kind="delta" digits={r.diff != null && !Number.isInteger(r.diff) ? 1 : undefined} />
              </td>
              <td className="u-ta-right u-fw-700 u-fs-fs-11" style={{
                color: r.outcome === -1 ? "var(--color-good-dark)" : r.outcome === 1 ? "var(--color-danger-vivid)" : "var(--text-3)",
              }}>
                {r.outcome === -1 ? `${firstName} venceu` : r.outcome === 1 ? "Manuel venceu" : r.outcome === 0 ? "empate" : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// "Cor Manuel" — token reservado no projecto para destacar tudo o que está
// ligado ao Manuel (row highlight, sticky cols, gross pill no print).
// Definida em tokens.css: --bg-success-subtle (#d1fae5) e --bg-manuel-sticky
// (#c3f5dc, ligeiramente mais escuro para colunas).
// Mesma cor usada nas linhas vs-Manuel do ResultsTimeline.
// → classes .col-manuel-th / .col-manuel (App.css).

function ToParTag({ tp }: { tp: number | null | undefined }) {
  if (tp == null) return null;
  return <ToPar v={tp} light className="u-fs-fs-10 u-ml-4px" prefix="(" suffix=")" />;
}

function RoundsCell({ result }: { result: Result }) {
  if (!result.rounds?.length) {
    return <>{result.totalGross != null ? String(result.totalGross) : "—"}</>;
  }
  const grosses = result.rounds.map((r) => r.gross).filter((g): g is number => typeof g === "number");
  if (!grosses.length) {
    return <>{result.totalGross != null ? String(result.totalGross) : "—"}</>;
  }
  const total = result.totalGross != null && grosses.length > 1 ? result.totalGross : null;
  return (
    <>
      <span className="u-c-text">{grosses.join("·")}</span>
      {total != null && <span className="u-c-text-3 u-ml-4px">({total})</span>}
    </>
  );
}

/** Diferença com sinal: inteiros como estão, médias com uma casa (antes saíam 3: «-13.143»). */
function fmtDiff(n: number): string {
  return Number.isInteger(n) ? fmtSign(n) : fmtSign(Math.round(n * 10) / 10, 1);
}

function fmtDateShort(iso: string | undefined): string {
  return iso ? monthLabel(iso.slice(0, 7)) : "—";
}
