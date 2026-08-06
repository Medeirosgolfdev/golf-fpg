/**
 * kids2/components/MatchupVsManuel.tsx
 *
 * Confronto vs Manuel — sem cor verde de "Manuel". Stats + tabela com troféus.
 *
 * Paridade com a tabela H2H detalhada do /kids-legacy (2026-08-06, sunset):
 * ±par por lado, coluna Resultado (venceu/empate) com tinte de linha, Dif.
 * preferindo ±par (robusto a WD/menos rondas), e KPIs de médias de posição.
 */

import React from "react";
import type { CanonicalData, Junior, Flight, Result, Tournament } from "../data";
import { getSharedTournamentIds } from "../data";
import { useSort } from "../../../hooks/useSort";
import SortableHdr from "../../../ui/SortableHdr";
import { tpColor } from "../../../ui/tournamentPrimitives";
import { MONTHS_PT, fmtToPar } from "../../../utils/format";

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
    const getVal = (r: Row, key: SortKey): string | number => {
      switch (key) {
        case "date": return r.t.date || "";
        case "name": return (r.t.name || r.t.id || "").toLowerCase();
        case "flight": return r.flight.label || "";
        case "jGross": return r.rJ.totalGross ?? Number.POSITIVE_INFINITY;
        case "jPos": return typeof r.rJ.pos === "number" ? r.rJ.pos : Number.POSITIVE_INFINITY;
        case "mGross": return r.rM.totalGross ?? Number.POSITIVE_INFINITY;
        case "mPos": return typeof r.rM.pos === "number" ? r.rM.pos : Number.POSITIVE_INFINITY;
        case "diff": return r.diff ?? Number.POSITIVE_INFINITY;
        case "result": return r.outcome ?? Number.POSITIVE_INFINITY;
      }
    };
    const va = getVal(a, sortKey);
    const vb = getVal(b, sortKey);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * mul;
    return String(va).localeCompare(String(vb)) * mul;
  });

  return (
    <div style={{
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "12px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: "var(--fs-18)" }}>⚔️</span>
        <h3 style={{ margin: 0, fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--text)" }}>
          Confronto com Manuel
        </h3>
        {avgPosJ != null && avgPosM != null && (
          <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)", marginLeft: "auto" }}>
            Avg: {firstName} {avgPosJ}º · Manuel {avgPosM}º
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        <Stat value={String(rows.length)} label="encontros" />
        <Stat value={draws > 0 ? `${wins}–${losses}–${draws}` : `${wins}–${losses}`} label={draws > 0 ? "V / D / E" : "vitórias / derrotas"} />
        <Stat value={avgDiff != null ? fmtDiff(avgDiff) : "—"} label="dif. média (±par)" />
        <Stat value={worst != null ? fmtDiff(worst) : "—"} label="pior margem" />
      </div>

      <table className="dtable">
        <thead>
          <tr>
            <SortableHdr k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Data</SortableHdr>
            <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Torneio</SortableHdr>
            <SortableHdr k="flight" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Escalão</SortableHdr>
            <SortableHdr k="jGross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "right" }}>{firstName}</SortableHdr>
            <SortableHdr k="jPos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "center" }}>Pos</SortableHdr>
            <SortableHdr k="mGross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thManuel, textAlign: "right" }}>Manuel</SortableHdr>
            <SortableHdr k="mPos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thManuel, textAlign: "center" }}>Pos</SortableHdr>
            <SortableHdr k="diff" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "right" }}>Dif.</SortableHdr>
            <SortableHdr k="result" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "right" }}>Resultado</SortableHdr>
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
                  <a href={r.t.links[0].url} target="_blank" rel="noreferrer" style={{ marginLeft: 4, color: "var(--color-info)" }}>↗</a>
                )}
              </td>
              <td style={{ color: "var(--text-3)" }}>{r.flight.label}</td>
              <td style={{ textAlign: "right" }}>
                <RoundsCell result={r.rJ} />
                <ToParTag tp={r.rJ.toPar} />
              </td>
              <td style={{ textAlign: "center" }}><PosTrophy pos={r.rJ.pos} /></td>
              <td style={{ ...tdManuel, textAlign: "right" }}>
                <RoundsCell result={r.rM} />
                <ToParTag tp={r.rM.toPar} />
              </td>
              <td style={{ ...tdManuel, textAlign: "center" }}><PosTrophy pos={r.rM.pos} /></td>
              <td style={{ textAlign: "right", fontWeight: 700, color: r.diff != null ? (tpColor(r.diff) ?? "var(--text-3)") : "var(--text-3)" }}>
                {r.diff != null ? fmtDiff(r.diff) : "—"}
              </td>
              <td style={{
                textAlign: "right", fontWeight: 700, fontSize: "var(--fs-11)",
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
const thManuel: React.CSSProperties = { background: "color-mix(in srgb, var(--bg-manuel-sticky) 35%, transparent)" };
const tdManuel: React.CSSProperties = { background: "color-mix(in srgb, var(--bg-success-subtle) 35%, transparent)" };

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "var(--fs-24)", fontWeight: 700, lineHeight: 1, color: "var(--text)" }}>{value}</div>
      <div style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", marginTop: 3, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function ToParTag({ tp }: { tp: number | null | undefined }) {
  if (tp == null) return null;
  return (
    <span style={{ fontSize: "var(--fs-10)", marginLeft: 4, color: tp <= 0 ? "var(--color-good-dark)" : "var(--text-3)" }}>
      ({fmtToPar(tp)})
    </span>
  );
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
      <span style={{ color: "var(--text)" }}>{grosses.join("·")}</span>
      {total != null && <span style={{ color: "var(--text-3)", marginLeft: 4 }}>({total})</span>}
    </>
  );
}

function PosTrophy({ pos }: { pos: number | null | undefined }) {
  if (typeof pos !== "number") return <span style={{ color: "var(--text-3)" }}>—</span>;
  if (pos <= 3) {
    const bg = pos === 1 ? "var(--medal-gold-bg)" : pos === 2 ? "var(--medal-silver-bg)" : "var(--medal-bronze-bg)";
    const fg = pos === 1 ? "var(--medal-gold-fg)" : pos === 2 ? "var(--medal-silver-fg)" : "var(--medal-bronze-fg)";
    return <span style={{ background: bg, color: fg, fontWeight: 700, padding: "1px 6px", borderRadius: 4, fontSize: "var(--fs-11)" }}>🏆 #{pos}</span>;
  }
  return <span>#{pos}</span>;
}

/** Formata diff com sinal e máximo 3 casas decimais. Inteiros não recebem
 *  ponto decimal; floats são arredondados para 3 casas e zeros à direita
 *  são removidos (ex: -14.7777 → "-14.778"; -14.5 → "-14.5"; -14 → "-14"). */
function fmtDiff(n: number): string {
  if (n === 0) return "0";
  if (Number.isInteger(n)) return n > 0 ? `+${n}` : String(n);
  // Round to 3 decimals, then trim trailing zeros and lonely dot.
  const rounded = Math.round(n * 1000) / 1000;
  const fmt = rounded.toFixed(3).replace(/\.?0+$/, "");
  return rounded > 0 ? `+${fmt}` : fmt;
}

function fmtDateShort(iso: string | undefined): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  return `${MONTHS_PT[m - 1]} ${y}`;
}
