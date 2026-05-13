/**
 * kids2/components/ResultsTimeline.tsx
 *
 * Tabela cronológica de TODOS os torneios do jogador, agrupada por ano.
 * Filter pills de fonte/circuito no topo.
 */

import React, { useMemo, useState } from "react";
import type { CanonicalData, Junior, Tournament, Flight, Result } from "../data";
import { getSharedTournamentIds } from "../data";
import { useSort } from "../../../hooks/useSort";
import SortableHdr from "../../../ui/SortableHdr";
import ScorecardModal from "./ScorecardModal";

type ResKey = "date" | "type" | "pos" | "name" | "flight" | "rounds" | "toPar" | "vsM";

interface Props {
  data: CanonicalData;
  junior: Junior;
  filterTids?: Set<string> | null;
}

interface Row {
  tid: string;
  tournament: Tournament;
  flight: Flight;
  result: Result;
  year: string;
  date: string;
  vsManuelDiff: number | null;
}

const MONTHS_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const SOURCE_LABELS: Record<string, string> = {
  uskids: "USKids", fpg: "FPG", rfeg: "RFEG", ffgolf: "FFG", wjgc: "WJGC", eowagr: "EOWAGR", doral: "Doral",
};

export default function ResultsTimeline({ data, junior, filterTids }: Props) {
  const [expandedYears, setExpandedYears] = useState<Set<string>>(() => new Set([new Date().getFullYear().toString()]));
  const [modal, setModal] = useState<{ row: Row; round: number } | null>(null);
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set());

  const allRows = useMemo<Row[]>(() => {
    const manuelSharedIds = data.manuel ? new Set(getSharedTournamentIds(junior, data.manuel)) : new Set<string>();
    const out: Row[] = [];
    for (const tid of junior.tournamentIds) {
      if (filterTids && !filterTids.has(tid)) continue;
      const t = data.tournamentById.get(tid);
      if (!t) continue;
      for (const f of t.flights) {
        const r = f.results.find((x) => x.juniorId === junior.id);
        if (!r) continue;
        const date = t.date || t.startDate || "";
        let vsManuelDiff: number | null = null;
        if (manuelSharedIds.has(tid) && data.manuel) {
          const mF = t.flights.find((ff) => ff.results.some((rr) => rr.juniorId === data.manuel!.id));
          const mR = mF?.results.find((rr) => rr.juniorId === data.manuel!.id);
          if (mR?.totalGross != null && r.totalGross != null) {
            vsManuelDiff = r.totalGross - mR.totalGross;
          }
        }
        out.push({ tid, tournament: t, flight: f, result: r, year: date.slice(0, 4) || "?", date, vsManuelDiff });
      }
    }
    out.sort((a, b) => b.date.localeCompare(a.date));
    return out;
  }, [data, junior, filterTids]);

  const sourcesAvailable = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allRows) {
      const s = r.tournament.sourceId || "?";
      m.set(s, (m.get(s) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [allRows]);

  const rows = useMemo(() => {
    if (activeSources.size === 0) return allRows;
    return allRows.filter((r) => activeSources.has(r.tournament.sourceId));
  }, [allRows, activeSources]);

  const byYear = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      let arr = m.get(r.year);
      if (!arr) { arr = []; m.set(r.year, arr); }
      arr.push(r);
    }
    return m;
  }, [rows]);

  const toggleSource = (s: string) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  if (allRows.length === 0) return null;

  const toggleYear = (y: string) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y); else next.add(y);
      return next;
    });
  };

  const years = Array.from(byYear.keys()).sort((a, b) => b.localeCompare(a));

  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "8px 0 10px", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Resultados</h3>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>
          {rows.length}{activeSources.size > 0 ? ` de ${allRows.length}` : ""} {rows.length === 1 ? "resultado" : "resultados"}
        </span>
      </div>

      {sourcesAvailable.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10, padding: "8px 10px", background: "var(--bg-muted)", borderRadius: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: 0.4, textTransform: "uppercase", marginRight: 2 }}>
            Fonte
          </span>
          {sourcesAvailable.map(([src, count]) => {
            const active = activeSources.has(src);
            return (
              <button
                key={src}
                onClick={() => toggleSource(src)}
                style={{
                  fontSize: 11,
                  padding: "2px 9px",
                  borderRadius: 999,
                  border: `1px solid ${active ? "var(--color-info-dark)" : "var(--border-light)"}`,
                  background: active ? "var(--color-info-dark)" : "var(--bg)",
                  color: active ? "var(--bg)" : "var(--text-2)",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
                title={`Filtrar: ${SOURCE_LABELS[src] || src}`}
              >
                {SOURCE_LABELS[src] || src} <span style={{ opacity: 0.7, marginLeft: 3 }}>{count}</span>
              </button>
            );
          })}
          {activeSources.size > 0 && (
            <button
              onClick={() => setActiveSources(new Set())}
              style={{
                fontSize: 11,
                padding: "2px 9px",
                borderRadius: 999,
                border: "1px solid var(--color-danger-dark)",
                background: "var(--bg)",
                color: "var(--color-danger-dark)",
                cursor: "pointer",
                fontWeight: 600,
              }}
              title="Limpar filtros de fonte"
            >
              ✕ limpar
            </button>
          )}
        </div>
      )}

      {years.map((y) => {
        const yearRows = byYear.get(y)!;
        const wins = yearRows.filter((r) => r.result.pos === 1).length;
        const manuelEncounters = yearRows.filter((r) => r.vsManuelDiff != null).length;
        const expanded = expandedYears.has(y);
        return (
          <div key={y} style={{ marginBottom: 10 }}>
            <div
              onClick={() => toggleYear(y)}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                padding: "6px 8px",
                background: "var(--bg-muted)",
                borderRadius: 4,
                cursor: "pointer",
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700 }}>{expanded ? "▼" : "▶"} {y}</span>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                {yearRows.length} torneios · {wins} vitórias{manuelEncounters > 0 ? ` · ${manuelEncounters}× vs Manuel` : ""}
              </span>
            </div>
            {expanded && <YearTable rows={yearRows} onOpenRound={(row, round) => setModal({ row, round })} />}
          </div>
        );
      })}
      {modal && (
        <ScorecardModal
          open={true}
          onClose={() => setModal(null)}
          tournament={modal.row.tournament}
          flight={modal.row.flight}
          result={modal.row.result}
          round={modal.round}
          playerName={junior.canonicalName}
        />
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, padding: "8px 10px", fontSize: 10, color: "var(--text-3)", background: "var(--bg-muted)", borderRadius: 6 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ background: "#FAEEDA", color: "#854F0B", fontWeight: 700, padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>🏆 #1</span> ouro
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ background: "#D3D1C7", color: "#2C2C2A", fontWeight: 700, padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>🏆 #2</span> prata
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ background: "#F5C4B3", color: "#993C1D", fontWeight: 700, padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>🏆 #3</span> bronze
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ background: "var(--bg-success-subtle, #ecfdf5)", border: "1px solid var(--border-success, #97c459)", color: "var(--color-good-dark)", fontWeight: 700, padding: "1px 4px", borderRadius: 3, fontSize: 10 }}>±N</span>
          diff vs Manuel
        </span>
        <span style={{ marginLeft: "auto" }}>
          Clique nos scores sublinhados para ver scorecard hole-by-hole · Cabeçalhos clicáveis para ordenar
        </span>
      </div>
    </section>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "6px 4px", fontWeight: 600, color: "var(--text-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3, cursor: "pointer" };

function YearTable({ rows, onOpenRound }: { rows: Row[]; onOpenRound: (row: Row, round: number) => void }) {
  const { sortKey, sortDir, toggleSort } = useSort<ResKey>("date", "desc", {
    pos: "asc", date: "desc", toPar: "asc", vsM: "asc", rounds: "asc",
  });

  const sorted = useMemo(() => {
    const arr = [...rows];
    const sign = sortDir === "asc" ? 1 : -1;
    const safeNum = (v: any) => (typeof v === "number" ? v : Number.POSITIVE_INFINITY);
    arr.sort((a, b) => {
      switch (sortKey) {
        case "date":   return sign * a.date.localeCompare(b.date);
        case "type":   return sign * (a.tournament.sourceId || "").localeCompare(b.tournament.sourceId || "");
        case "pos":    return sign * (safeNum(a.result.pos) - safeNum(b.result.pos));
        case "name":   return sign * (a.tournament.name || "").localeCompare(b.tournament.name || "");
        case "flight": return sign * (a.flight.label || "").localeCompare(b.flight.label || "");
        case "rounds": {
          const ta = a.result.totalGross ?? safeNum(null);
          const tb = b.result.totalGross ?? safeNum(null);
          return sign * (ta - tb);
        }
        case "toPar":  return sign * (safeNum(a.result.toPar) - safeNum(b.result.toPar));
        case "vsM":    return sign * (safeNum(a.vsManuelDiff) - safeNum(b.vsManuelDiff));
        default: return 0;
      }
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  return (
    <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          <SortableHdr<ResKey> k="date"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 56 }}>Data</SortableHdr>
          <SortableHdr<ResKey> k="type"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 56 }}>Tipo</SortableHdr>
          <SortableHdr<ResKey> k="pos"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 50, textAlign: "center" }}>Pos</SortableHdr>
          <SortableHdr<ResKey> k="name"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={thStyle}>Torneio</SortableHdr>
          <SortableHdr<ResKey> k="flight" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 70 }}>Escalão</SortableHdr>
          <SortableHdr<ResKey> k="rounds" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 80, textAlign: "right" }}>Rondas</SortableHdr>
          <SortableHdr<ResKey> k="toPar"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 42, textAlign: "right" }}>±par</SortableHdr>
          <SortableHdr<ResKey> k="vsM"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ ...thStyle, width: 46, textAlign: "right" }}>vs M</SortableHdr>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <ResultRow key={r.tid + r.flight.flightKey} r={r} onOpenRound={onOpenRound} />
        ))}
      </tbody>
    </table>
  );
}

function ResultRow({ r, onOpenRound }: { r: Row; onOpenRound: (row: Row, round: number) => void }) {
  const bg = r.vsManuelDiff != null ? "var(--bg-success-subtle, #ecfdf5)" : undefined;
  const parTotal = r.flight.par?.reduce((a, b) => a + (b || 0), 0) || r.tournament.parTotal;
  const rounds = r.result.rounds || [];
  const grosses = rounds.map((rd) => rd.gross).filter((g): g is number => typeof g === "number");
  const total = r.result.totalGross ?? (grosses.length ? grosses.reduce((a, b) => a + b, 0) : null);
  const toPar = r.result.toPar ?? (total != null && parTotal && grosses.length ? total - parTotal * grosses.length : null);
  const url = r.tournament.links?.[0]?.url;
  const roundsWithStrokes = new Set(rounds.filter((rd) => rd.strokes && rd.strokes.some((s) => s > 0)).map((rd) => rd.round));
  return (
    <tr style={{ background: bg, borderBottom: "1px solid var(--border-light)" }}>
      <td style={{ ...tdStyle, color: "var(--text-3)" }}>{fmtDate(r.date)}</td>
      <td style={tdStyle}>
        <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--bg)", border: "1px solid var(--border-light)" }}>
          {SOURCE_LABELS[r.tournament.sourceId] || r.tournament.sourceId}
        </span>
      </td>
      <td style={{ ...tdStyle, textAlign: "center" }}><PosBadgeSmall pos={r.result.pos} /></td>
      <td style={tdStyle}>
        <div>
          {r.tournament.name || r.tournament.shortName || r.tid}
          {url && <a href={url} target="_blank" rel="noreferrer" style={{ marginLeft: 4, color: "var(--color-info)", fontSize: 10 }}>↗</a>}
        </div>
        {r.flight.results.length > 0 && (
          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 1 }}>
            {r.flight.results.length} {r.flight.results.length === 1 ? "jogador" : "jogadores"}
          </div>
        )}
      </td>
      <td style={{ ...tdStyle, color: "var(--text-3)" }}>{r.flight.label}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        {rounds.length > 0 ? (
          rounds.map((rd, i) => {
            const g = rd.gross;
            const clickable = roundsWithStrokes.has(rd.round);
            return (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: "var(--text-3)" }}>·</span>}
                {clickable && typeof g === "number" ? (
                  <button
                    onClick={() => onOpenRound(r, rd.round)}
                    style={{
                      background: "none", border: "none", padding: "0 2px", fontSize: 11,
                      color: "var(--color-info-dark, #1e3a8a)", cursor: "pointer",
                      textDecoration: "underline", fontWeight: 600, fontVariantNumeric: "tabular-nums",
                    }}
                    title="Ver scorecard buraco-a-buraco"
                  >{g}</button>
                ) : (
                  <span>{g ?? "—"}</span>
                )}
              </React.Fragment>
            );
          })
        ) : (total ?? "—")}
      </td>
      <td style={{ ...tdStyle, textAlign: "right", color: toPar != null && toPar < 0 ? "var(--color-good-dark)" : toPar != null && toPar > 0 ? "var(--color-danger-dark)" : "var(--text-3)", fontWeight: toPar != null && toPar < 0 ? 700 : 400 }}>
        {toPar == null ? "—" : toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : String(toPar)}
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        {r.vsManuelDiff != null && (
          <span style={{ background: "var(--bg-success-subtle, #ecfdf5)", color: "var(--color-good-dark)", fontWeight: 700, padding: "1px 4px", borderRadius: 3, fontSize: 10, border: "1px solid var(--border-success, #97c459)" }}>
            {r.vsManuelDiff === 0 ? "0" : r.vsManuelDiff > 0 ? `+${r.vsManuelDiff}` : String(r.vsManuelDiff)}
          </span>
        )}
      </td>
    </tr>
  );
}

const tdStyle: React.CSSProperties = { padding: "5px 4px", fontSize: 11, verticalAlign: "top" };

function PosBadgeSmall({ pos }: { pos: number | null | undefined }) {
  if (typeof pos !== "number") return <span style={{ color: "var(--text-3)" }}>—</span>;
  if (pos <= 3) {
    const bg = pos === 1 ? "#FAEEDA" : pos === 2 ? "#D3D1C7" : "#F5C4B3";
    const fg = pos === 1 ? "#854F0B" : pos === 2 ? "#2C2C2A" : "#993C1D";
    return <span style={{ background: bg, color: fg, fontWeight: 700, padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>🏆 #{pos}</span>;
  }
  return <span style={{ color: "var(--text-3)" }}>#{pos}</span>;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  const mn = parseInt(m, 10);
  if (!mn || !d) return iso;
  return `${d.padStart(2, "0")} ${MONTHS_ABBR[mn - 1] || ""}`;
}
