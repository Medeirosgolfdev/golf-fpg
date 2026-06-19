import React, { useMemo } from "react";
import { fmtToPar } from "../../utils/format";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import { RoundPill } from "../../ui/PillBadge";
import type { H2HConfronto, H2HSortKey } from "./types";

export default function H2HSortableTable({ confrontos, firstName }: { confrontos: H2HConfronto[]; firstName: string }) {
  const { sortKey, sortDir, toggleSort } = useSort<H2HSortKey>("year", "desc");

  const sorted = useMemo(() => {
    const INF = 9999;
    return [...confrontos].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "tourn":    return dir * a.tornName.localeCompare(b.tornName, "pt");
        case "year":     return dir * (a.year - b.year);
        case "manPos":   return dir * (a.manPos - b.manPos);
        case "rivalPos": return dir * (a.rivalPos - b.rivalPos);
        case "dif": {
          const da = a.manTp != null && a.rivalTp != null ? a.rivalTp - a.manTp : INF;
          const db = b.manTp != null && b.rivalTp != null ? b.rivalTp - b.manTp : INF;
          return dir * (da - db);
        }
        case "result": {
          const ra = a.manPos < a.rivalPos ? -1 : a.manPos > a.rivalPos ? 1 : 0;
          const rb = b.manPos < b.rivalPos ? -1 : b.manPos > b.rivalPos ? 1 : 0;
          return dir * (ra - rb);
        }
        default: return 0;
      }
    });
  }, [confrontos, sortKey, sortDir]);

  const SH = ({ k, children, className, style }: { k: H2HSortKey; children: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className={className} style={style}>
      {children}
    </SortableHdr>
  );

  return (
    <table className="dtable w-full">
      <thead>
        <tr>
          <SH k="tourn" className="ta-left" style={{ padding: "4px 12px" }}>Torneio</SH>
          <SH k="year" className="ta-c" style={{ width: 60 }}>Escalão</SH>
          <SH k="manPos" className="ta-c" style={{ width: 70 }}>Manuel</SH>
          <SH k="rivalPos" className="ta-c" style={{ width: 70 }}>{firstName}</SH>
          <SH k="dif" className="ta-c" style={{ width: 50 }}>Dif.</SH>
          <SH k="result" className="ta-right" style={{ width: 100, paddingRight: 12 }}>Resultado</SH>
        </tr>
      </thead>
      <tbody>
        {sorted.map((c, i) => {
          const rivalWon = c.rivalPos < c.manPos;
          const draw     = c.rivalPos === c.manPos;
          const dif      = c.manTp != null && c.rivalTp != null ? c.rivalTp - c.manTp : null;
          return (
            <tr key={c.tid} style={{
              background: rivalWon ? "rgba(22,163,74,.04)" : draw ? "transparent" : "rgba(220,38,38,.04)",
              borderBottom: i < confrontos.length - 1 ? "1px solid var(--border-light)" : "none",
            }}>
              <td style={{ padding: "7px 12px", fontWeight: 500 }}>
                {c.tornName.replace(/\s*\d{4}$/, "")}
                <span style={{ marginLeft: 5, fontSize: "var(--fs-10)", color: "var(--text-3)" }}> '{String(c.year).slice(2)}</span>
                {c.nRounds && c.nRounds > 1 && (
                  <span style={{ marginLeft: 6 }}>
                    <RoundPill nR={c.nRounds} />
                  </span>
                )}
              </td>
              <td style={{ textAlign: "center", fontSize: "var(--fs-10)", color: "var(--text-2)" }}>{c.ageGroup ?? "—"}</td>
              <td className="ta-c">
                <strong>#{c.manPos}</strong>
                {c.manTp != null && <span style={{ fontSize: "var(--fs-10)", color: (c.manTp ?? 1) <= 0 ? "var(--color-good-dark)" : "var(--text-3)", marginLeft: 4 }}>({fmtToPar(c.manTp)})</span>}
              </td>
              <td style={{ textAlign: "center", color: rivalWon ? "var(--color-good-dark)" : "var(--color-danger-vivid)" }}>
                <strong>#{c.rivalPos}</strong>
                {c.rivalTp != null && <span className="fs-10 ml-4">({fmtToPar(c.rivalTp)})</span>}
              </td>
              <td style={{ textAlign: "center", fontSize: "var(--fs-11)",
                color: dif != null && dif < 0 ? "var(--color-good-dark)" : dif != null && dif > 0 ? "var(--color-danger-vivid)" : "var(--text-3)" }}>
                {dif != null ? (dif > 0 ? "+" : "") + dif : "—"}
              </td>
              <td style={{ textAlign: "right", fontWeight: 700, fontSize: "var(--fs-11)", paddingRight: 12,
                color: rivalWon ? "var(--color-good-dark)" : draw ? "var(--text-3)" : "var(--color-danger-vivid)" }}>
                {rivalWon ? `${firstName} venceu` : draw ? "empate" : "Manuel venceu"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
