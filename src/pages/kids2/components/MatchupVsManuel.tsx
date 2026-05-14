/**
 * kids2/components/MatchupVsManuel.tsx
 *
 * Confronto vs Manuel — sem cor verde de "Manuel". Stats + tabela com troféus.
 */

import React from "react";
import type { CanonicalData, Junior } from "../data";
import { getSharedTournamentIds, getResultInTournament } from "../data";
import { useSort } from "../../../hooks/useSort";
import SortableHdr from "../../../ui/SortableHdr";

type SortKey = "date" | "name" | "flight" | "jGross" | "jPos" | "mGross" | "mPos" | "diff";

interface Props {
  data: CanonicalData;
  junior: Junior;
  manuel: Junior;
}

export default function MatchupVsManuel({ data, junior, manuel }: Props) {
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("date", "desc", {
    date: "desc", name: "asc", flight: "asc",
    jGross: "asc", jPos: "asc", mGross: "asc", mPos: "asc", diff: "asc",
  });

  const sharedIds = getSharedTournamentIds(junior, manuel);
  if (sharedIds.length === 0) return null;

  // ⚠ IMPORTANTE: torneios USKids/USKids-completos podem ter MÚLTIPLOS flights
  // (Boys 11 + Boys 12) sob o mesmo tournamentId. Se Rafael jogou B12 e Manuel
  // jogou B11, NÃO é confronto — escalões diferentes. Filtrar para apenas
  // pares onde ambos estiveram no MESMO flight (flightKey igual).
  const rows = sharedIds.map((tid) => {
    const t = data.tournamentById.get(tid);
    if (!t) return null;
    const rJ = getResultInTournament(junior, t);
    const rM = getResultInTournament(manuel, t);
    if (!rJ || !rM) return null;
    // Se rJ e rM estão em flights diferentes (escalões diferentes), saltar.
    if (rJ.flight.flightKey !== rM.flight.flightKey) return null;
    const diff = (rJ.result.totalGross ?? 0) - (rM.result.totalGross ?? 0);
    return { t, rJ, rM, diff };
  }).filter(Boolean) as Array<{ t: any; rJ: any; rM: any; diff: number }>;

  if (rows.length === 0) return null;

  let wins = 0, losses = 0, draws = 0;
  let diffSum = 0, worst = 0;
  for (const r of rows) {
    const pJ = r.rJ.result.pos, pM = r.rM.result.pos;
    if (typeof pJ === "number" && typeof pM === "number") {
      if (pJ < pM) wins++;
      else if (pJ > pM) losses++;
      else draws++;
    }
    diffSum += r.diff;
    if (Math.abs(r.diff) > Math.abs(worst)) worst = r.diff;
  }
  const avgDiff = rows.length > 0 ? (diffSum / rows.length) : 0;

  // Ordenação aplicada antes do render
  const sortedRows = [...rows].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    const getVal = (r: typeof a, key: SortKey): string | number => {
      switch (key) {
        case "date": return r.t.date || "";
        case "name": return (r.t.name || r.t.shortName || r.t.id || "").toLowerCase();
        case "flight": return r.rJ.flight.label || "";
        case "jGross": return r.rJ.result.totalGross ?? Number.POSITIVE_INFINITY;
        case "jPos": return typeof r.rJ.result.pos === "number" ? r.rJ.result.pos : Number.POSITIVE_INFINITY;
        case "mGross": return r.rM.result.totalGross ?? Number.POSITIVE_INFINITY;
        case "mPos": return typeof r.rM.result.pos === "number" ? r.rM.result.pos : Number.POSITIVE_INFINITY;
        case "diff": return r.diff;
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
      padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>⚔️</span>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
          Confronto com Manuel
        </h3>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        <Stat value={String(rows.length)} label="encontros" />
        <Stat value={`${wins}–${losses}`} label="vitórias / derrotas" />
        <Stat value={fmtDiff(avgDiff)} label="diff médio" />
        <Stat value={fmtDiff(worst)} label="pior margem" />
      </div>

      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", background: "var(--bg)", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border-light)" }}>
        <thead>
          <tr style={{ background: "var(--bg-muted)", color: "var(--text-2)" }}>
            <SortableHdr k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={th}>Data</SortableHdr>
            <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={th}>Torneio</SortableHdr>
            <SortableHdr k="flight" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={th}>Escalão</SortableHdr>
            <SortableHdr k="jGross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...th, textAlign: "right" }}>{junior.canonicalName.split(" ")[0]}</SortableHdr>
            <SortableHdr k="jPos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...th, textAlign: "center" }}>Pos</SortableHdr>
            <SortableHdr k="mGross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...th, textAlign: "right" }}>Manuel</SortableHdr>
            <SortableHdr k="mPos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...th, textAlign: "center" }}>Pos</SortableHdr>
            <SortableHdr k="diff" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...th, textAlign: "right" }}>diff</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border-light)" }}>
              <td style={td}>{fmtDateShort(r.t.date)}</td>
              <td style={td}>
                {r.t.name || r.t.shortName || r.t.id}
                {r.t.links?.[0]?.url && (
                  <a href={r.t.links[0].url} target="_blank" rel="noreferrer" style={{ marginLeft: 4, color: "var(--color-info)" }}>↗</a>
                )}
              </td>
              <td style={tdMuted}>{r.rJ.flight.label}</td>
              <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                <RoundsCell result={r.rJ.result} />
              </td>
              <td style={{ ...td, textAlign: "center" }}><PosTrophy pos={r.rJ.result.pos} /></td>
              <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                <RoundsCell result={r.rM.result} />
              </td>
              <td style={{ ...td, textAlign: "center" }}><PosTrophy pos={r.rM.result.pos} /></td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700, color: r.diff > 0 ? "var(--color-danger-dark)" : r.diff < 0 ? "var(--medal-gold-strong)" : "var(--text-3)" }}>
                {fmtDiff(r.diff)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = { padding: "6px 8px", fontSize: 11, fontWeight: 600, textAlign: "left" };
const td: React.CSSProperties = { padding: "6px 8px", fontSize: 12 };
const tdMuted: React.CSSProperties = { ...td, color: "var(--text-3)" };

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color: "var(--text)" }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function RoundsCell({ result }: { result: any }) {
  if (!result.rounds?.length) {
    return <>{result.totalGross != null ? String(result.totalGross) : "—"}</>;
  }
  const grosses = result.rounds.map((r: any) => r.gross).filter((g: any) => typeof g === "number");
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

function PosTrophy({ pos }: { pos: any }) {
  if (typeof pos !== "number") return <span style={{ color: "var(--text-3)" }}>—</span>;
  if (pos <= 3) {
    const bg = pos === 1 ? "var(--medal-gold-bg)" : pos === 2 ? "var(--medal-silver-bg)" : "var(--medal-bronze-bg)";
    const fg = pos === 1 ? "var(--medal-gold-fg)" : pos === 2 ? "var(--medal-silver-fg)" : "var(--medal-bronze-fg)";
    return <span style={{ background: bg, color: fg, fontWeight: 700, padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>🏆 #{pos}</span>;
  }
  return <span>#{pos}</span>;
}

function fmtDiff(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : String(n);
}

function fmtDateShort(iso: string | undefined): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[m - 1]} ${y}`;
}
