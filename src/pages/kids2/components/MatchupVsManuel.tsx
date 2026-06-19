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
      padding: "12px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: "var(--fs-18)" }}>⚔️</span>
        <h3 style={{ margin: 0, fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--text)" }}>
          Confronto com Manuel
        </h3>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        <Stat value={String(rows.length)} label="encontros" />
        <Stat value={`${wins}–${losses}`} label="vitórias / derrotas" />
        <Stat value={fmtDiff(avgDiff)} label="diff médio" />
        <Stat value={fmtDiff(worst)} label="pior margem" />
      </div>

      <table className="dtable">
        <thead>
          <tr>
            <SortableHdr k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Data</SortableHdr>
            <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Torneio</SortableHdr>
            <SortableHdr k="flight" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Escalão</SortableHdr>
            <SortableHdr k="jGross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "right" }}>{junior.canonicalName.split(" ")[0]}</SortableHdr>
            <SortableHdr k="jPos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "center" }}>Pos</SortableHdr>
            <SortableHdr k="mGross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thManuel, textAlign: "right" }}>Manuel</SortableHdr>
            <SortableHdr k="mPos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thManuel, textAlign: "center" }}>Pos</SortableHdr>
            <SortableHdr k="diff" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "right" }}>diff</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r, i) => (
            <tr key={i}>
              <td>{fmtDateShort(r.t.date)}</td>
              <td>
                {r.t.name || r.t.shortName || r.t.id}
                {r.t.links?.[0]?.url && (
                  <a href={r.t.links[0].url} target="_blank" rel="noreferrer" style={{ marginLeft: 4, color: "var(--color-info)" }}>↗</a>
                )}
              </td>
              <td style={{ color: "var(--text-3)" }}>{r.rJ.flight.label}</td>
              <td style={{ textAlign: "right" }}>
                <RoundsCell result={r.rJ.result} />
              </td>
              <td style={{ textAlign: "center" }}><PosTrophy pos={r.rJ.result.pos} /></td>
              <td style={{ ...tdManuel, textAlign: "right" }}>
                <RoundsCell result={r.rM.result} />
              </td>
              <td style={{ ...tdManuel, textAlign: "center" }}><PosTrophy pos={r.rM.result.pos} /></td>
              <td style={{ textAlign: "right", fontWeight: 700, color: r.diff > 0 ? "var(--color-danger-dark)" : r.diff < 0 ? "var(--medal-gold-strong)" : "var(--text-3)" }}>
                {fmtDiff(r.diff)}
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
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[m - 1]} ${y}`;
}
