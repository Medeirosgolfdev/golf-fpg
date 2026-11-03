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
import type {} from "react";
import type { CanonicalData, Junior, Tournament } from "../data";
import { useSort, compareNullsLast } from "../../../hooks/useSort";
import SortableHdr from "../../../ui/SortableHdr";
import { fmtToPar, fmtMonthYear } from "../../../utils/format";
import { tpColor } from "../../../ui/tournamentPrimitives";
import { categorizeTournamentLinks } from "../tournamentLinks";
import ExtLink from "../../../ui/ExternalLink";
import { MUTED } from "../../../ui/tableCells";
import { TrophyPos } from "../../../ui/PosBadge";
import SectionTitle from "../../../ui/SectionTitle";

interface Props {
  data: CanonicalData;
  junior: Junior;
  filterTids?: Set<string> | null;
}

type MHSortKey = "date" | "name" | "flight" | "pos" | "total" | "toPar";

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
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "date":   return mul * a.date.localeCompare(b.date);
        case "name":   return mul * a.name.localeCompare(b.name);
        case "flight": return mul * a.flight.localeCompare(b.flight);
        // Vazios sempre no fim, nas duas direcções.
        case "pos":    return compareNullsLast(a.pos, b.pos, mul);
        case "total":  return compareNullsLast(a.total, b.total, mul);
        case "toPar":  return compareNullsLast(a.toPar, b.toPar, mul);
      }
    });
  }, [rows, sortKey, sortDir]);

  if (rows.length === 0) return null;

  const uskidsSrc = junior.sources.uskids;
  const memberId = uskidsSrc?.memberId;
  const historicalIds = uskidsSrc?.historicalMemberIds || [];

  return (
    <section className="u-mb-4px">
      <SectionTitle icon="📊" right={<>
          <span>{rows.length} {rows.length === 1 ? "torneio" : "torneios"}</span>
          {memberId && (
            <span className="u-ff-font-mono u-fs-fs-10 u-p-1px-4px u-br-radius-sm u-bg-bg-muted u-bd-1px-solid-border-light" title="USKids memberId actual">
              #{memberId}
            </span>
          )}
          {historicalIds.map((h, i) => {
            const id = typeof h === "string" ? h : h.memberId;
            const note = typeof h === "string" ? null : h.note;
            return (
              <span key={i} title={note || "Legacy USKids memberId"} className="u-ff-font-mono u-fs-fs-10 u-p-1px-4px u-br-radius-sm u-bg-bg u-bd-1px-dashed-border u-c-text-3">
                legacy #{id}
              </span>
            );
          })}
      </>}>
        Histórico USKids
      </SectionTitle>

      <div className="u-ox-auto">
        <table className="dtable dtable-sm">
          <thead>
            <tr>
              <SortableHdr k="date"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Data</SortableHdr>
              <SortableHdr k="name"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Torneio</SortableHdr>
              <SortableHdr k="flight" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="u-w-80px">Escalão</SortableHdr>
              <SortableHdr k="pos"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="u-w-50px u-ta-center">Pos</SortableHdr>
              <SortableHdr k="total"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="u-w-60px u-ta-right">Total</SortableHdr>
              <SortableHdr k="toPar"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="u-w-50px u-ta-right">±par</SortableHdr>
              <th className="u-w-100px u-ta-right">Rondas</th>
              <th className="u-w-50px u-ta-right">↗</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              const links = categorizeTournamentLinks(r.tournament);
              return (
              <tr key={r.tid}>
                <td className="u-c-text-3">{fmtMonthYear(r.date)}</td>
                <td className="u-fw-600">{r.name}</td>
                <td className="u-c-text-3">{r.flight}</td>
                <td className="u-ta-center"><TrophyPos pos={r.pos} small /></td>
                <td className="u-ta-right">{r.total != null ? r.total : "—"}</td>
                <td className={"u-ta-right " + (r.toPar != null && r.toPar !== 0 ? "u-fw-700" : "u-fw-400")} style={{
                  color: r.toPar == null ? "var(--text-3)"
                    : tpColor(r.toPar) ?? "var(--text-2)" }}>
                  {fmtToPar(r.toPar)}
                </td>
                <td className="u-ta-right u-c-text-3">
                  {r.rounds.length > 0 ? r.rounds.map((g) => g ?? "—").join(" · ") : "—"}
                </td>
                <td className="u-ta-right">
                  {links.length > 0 ? (
                    <ExtLink href={links[0].url}
                      title={`Abrir em ${links[0].label}`}
                      className="u-td-none u-fw-700 u-fs-fs-12"
                      style={{ color: `var(${links[0].colorVar})` }}
                    >↗</ExtLink>
                  ) : MUTED}
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


