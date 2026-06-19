/**
 * kids2/components/MemberHistTable.tsx
 *
 * Tabela canónica do histórico USKids alargado do junior. Subset de torneios
 * com `sourceId === "uskids"` apresentado densamente, com referência ao
 * memberId actual e aos historicalMemberIds (legacy USKids accounts).
 *
 * Equivalente do `kids/MemberHistTable.tsx` antigo mas alimentado pelo
 * schema canónico em vez do `mhTorneios` específico do KIDSdataLoader.
 *
 * Só renderiza para juniors com pelo menos um torneio USKids.
 */

import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { CanonicalData, Junior, Tournament } from "../data";
import { useSort } from "../../../hooks/useSort";
import SortableHdr from "../../../ui/SortableHdr";
import { categorizeTournamentLinks } from "../tournamentLinks";

interface Props {
  data: CanonicalData;
  junior: Junior;
  filterTids?: Set<string> | null;
}

type MHSortKey = "date" | "name" | "flight" | "pos" | "total" | "toPar";

const MONTHS_PT_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface Row {
  tid: string;
  date: string;
  name: string;
  flight: string;
  pos: number | null;
  total: number | null;
  toPar: number | null;
  rounds: Array<number | null>;
  tournament: Tournament;
}

export default function MemberHistTable({ data, junior, filterTids }: Props) {
  const { sortKey, sortDir, toggleSort } = useSort<MHSortKey>("date", "desc", {
    date: "desc", name: "asc", flight: "asc", pos: "asc", total: "asc", toPar: "asc",
  });

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const tid of junior.tournamentIds) {
      if (filterTids && !filterTids.has(tid)) continue;
      const t = data.tournamentById.get(tid);
      if (!t || t.sourceId !== "uskids") continue;
      for (const f of t.flights) {
        const r = f.results.find((x) => x.juniorId === junior.id);
        if (!r) continue;
        const parTotal = f.par?.reduce((a, b) => a + (b || 0), 0) || t.parTotal || null;
        const grosses = (r.rounds || []).map((rd) => (typeof rd.gross === "number" ? rd.gross : null));
        const numericGrosses = grosses.filter((g): g is number => typeof g === "number");
        const total = r.totalGross ?? (numericGrosses.length ? numericGrosses.reduce((a, b) => a + b, 0) : null);
        const toPar = r.toPar ?? (total != null && parTotal && numericGrosses.length ? total - parTotal * numericGrosses.length : null);
        out.push({
          tid,
          date: t.date || t.startDate || "",
          name: t.name || t.shortName || tid,
          flight: f.label || "—",
          pos: typeof r.pos === "number" ? r.pos : null,
          total,
          toPar,
          rounds: grosses,
          tournament: t,
        });
        break; // 1 entrada por torneio (1 flight)
      }
    }
    return out;
  }, [data, junior, filterTids]);

  const sortedRows = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    const safeNum = (v: number | null) => (v == null ? Number.POSITIVE_INFINITY : v);
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "date":   return mul * a.date.localeCompare(b.date);
        case "name":   return mul * a.name.localeCompare(b.name);
        case "flight": return mul * a.flight.localeCompare(b.flight);
        case "pos":    return mul * (safeNum(a.pos) - safeNum(b.pos));
        case "total":  return mul * (safeNum(a.total) - safeNum(b.total));
        case "toPar":  return mul * (safeNum(a.toPar) - safeNum(b.toPar));
      }
    });
  }, [rows, sortKey, sortDir]);

  if (rows.length === 0) return null;

  const uskidsSrc = junior.sources.uskids;
  const memberId = uskidsSrc?.memberId;
  const historicalIds = uskidsSrc?.historicalMemberIds || [];

  return (
    <section style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "8px 0 10px", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--text)" }}>
          📊 Histórico USKids
        </h3>
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
          <span>{rows.length} {rows.length === 1 ? "torneio" : "torneios"}</span>
          {memberId && (
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "var(--fs-10)",
              padding: "1px 5px", borderRadius: 3,
              background: "var(--bg-muted)", border: "1px solid var(--border-light)",
            }} title="USKids memberId actual">
              #{memberId}
            </span>
          )}
          {historicalIds.map((h, i) => {
            const id = typeof h === "string" ? h : h.memberId;
            const note = typeof h === "string" ? null : h.note;
            return (
              <span key={i} title={note || "Legacy USKids memberId"} style={{
                fontFamily: "var(--font-mono)", fontSize: "var(--fs-10)",
                padding: "1px 5px", borderRadius: 3,
                background: "var(--bg)", border: "1px dashed var(--border)",
                color: "var(--text-3)",
              }}>
                legacy #{id}
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="dtable-sm">
          <thead>
            <tr>
              <SortableHdr k="date"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Data</SortableHdr>
              <SortableHdr k="name"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Torneio</SortableHdr>
              <SortableHdr k="flight" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ width: 80 }}>Escalão</SortableHdr>
              <SortableHdr k="pos"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ width: 50, textAlign: "center" }}>Pos</SortableHdr>
              <SortableHdr k="total"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ width: 60, textAlign: "right" }}>Total</SortableHdr>
              <SortableHdr k="toPar"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ width: 50, textAlign: "right" }}>±par</SortableHdr>
              <th style={{ width: 100, textAlign: "right" }}>Rondas</th>
              <th style={{ width: 50, textAlign: "right" }}>↗</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              const links = categorizeTournamentLinks(r.tournament);
              return (
              <tr key={r.tid}>
                <td style={{ color: "var(--text-3)" }}>{fmtDate(r.date)}</td>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td style={{ color: "var(--text-3)" }}>{r.flight}</td>
                <td style={{ textAlign: "center", fontWeight: 700,
                  color: r.pos != null && r.pos <= 3 ? "var(--medal-gold-strong)" : "var(--text-2)" }}>
                  {r.pos != null ? `#${r.pos}` : "—"}
                </td>
                <td style={{ textAlign: "right" }}>{r.total != null ? r.total : "—"}</td>
                <td style={{ textAlign: "right", fontWeight: r.toPar != null && r.toPar !== 0 ? 700 : 400,
                  color: r.toPar == null ? "var(--text-3)"
                    : r.toPar < 0 ? "var(--medal-gold-strong)"
                    : r.toPar > 0 ? "var(--color-danger-dark)"
                    : "var(--text-2)" }}>
                  {r.toPar == null ? "—" : r.toPar === 0 ? "E" : r.toPar > 0 ? `+${r.toPar}` : String(r.toPar)}
                </td>
                <td style={{ textAlign: "right", color: "var(--text-3)" }}>
                  {r.rounds.length > 0 ? r.rounds.map((g) => g ?? "—").join(" · ") : "—"}
                </td>
                <td style={{ textAlign: "right" }}>
                  {links.length > 0 ? (
                    <a href={links[0].url} target="_blank" rel="noreferrer"
                      title={`Abrir em ${links[0].label}`}
                      style={{
                        color: `var(${links[0].colorVar})`,
                        textDecoration: "none", fontWeight: 700, fontSize: "var(--fs-12)",
                      }}
                    >↗</a>
                  ) : <span style={{ color: "var(--text-3)" }}>—</span>}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}


function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-");
  const mn = parseInt(m, 10);
  if (!y || !mn) return iso;
  return `${MONTHS_PT_SHORT[mn - 1]} ${y}`;
}
