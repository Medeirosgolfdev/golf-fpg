/**
 * kids/MemberHistTable.tsx — Tabela do historial USKids (Member History)
 * (extraído de KIDSPage.tsx para reduzir tamanho)
 */
import React, { useMemo, useState } from "react";
import SortableHdr from "../../ui/SortableHdr";
import { fmtToPar, MONTHS_PT, sortArrow, isoDate } from "../../utils/format";
import { tpColorDark } from "../../utils/scoreDisplay";

// Types partilhados
interface MHTournRound { gross: number }
interface MHTournament {
  name: string; ageGroup: string; place: number;
  totalStrokes: number; rounds: Record<string, MHTournRound>;
  par?: number[]; startDate?: string;
}

// Helper local — coloração para to-par
function tpColorMH(tp: number | null): string {
  if (tp == null) return "var(--text-3)";
  if (tp < 0) return "var(--color-good-dark)";
  if (tp === 0) return "var(--text-2)";
  return "var(--color-danger)";
}

export type MHSortCol = "date" | "pos" | "total" | "name";

export function MemberHistTable({ mhTorneios, memberId }: {
  mhTorneios: Array<MHTournament & { tid: string }>;
  memberId: string;
}) {
  const [sortCol, setSortCol] = useState<MHSortCol>("date");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");

  const doSort = (col: MHSortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(col === "name" ? "asc" : "desc"); }
  };

  const sorted = useMemo(() => {
    return [...mhTorneios].sort((a, b) => {
      let cmp = 0;
      if (sortCol === "date") {
        const pa = isoDate(a.startDate || ""), pb = isoDate(b.startDate || "");
        cmp = pa.localeCompare(pb);
      } else if (sortCol === "pos") {
        cmp = (a.place || 999) - (b.place || 999);
      } else if (sortCol === "total") {
        cmp = (a.totalStrokes || 999) - (b.totalStrokes || 999);
      } else if (sortCol === "name") {
        cmp = (a.name || "").localeCompare(b.name || "");
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [mhTorneios, sortCol, sortDir]);

  const ThS = ({ col, label, style, className }: { col: MHSortCol; label: string; style?: React.CSSProperties; className?: string }) => (
    <th onClick={() => doSort(col)} className={className} style={{ cursor: "pointer", userSelect: "none", ...style }}>
      {label}{sortArrow(col, sortCol, sortDir)}
    </th>
  );

  return (
    <div className="mt-24 mb-16">
      <div className="h-sm mb-8" style={{ color: "var(--text-2)", display: "flex", alignItems: "center", gap: 8 }}>
        <span>📊 Histórico USKids · {mhTorneios.length} torneios</span>
        <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 400 }}>ID: {memberId}</span>
      </div>
      <div className="scroll-x">
        <table className="dtable w-full fs-12" >
          <thead>
            <tr>
              <ThS col="name"  label="Torneio"  className="ta-left"  style={{ padding: "4px 8px" }} />
              <th className="ta-c" style={{ width: 60 }}>Escalão</th>
              <ThS col="pos"   label="Pos"   className="ta-c"   style={{ width: 42 }} />
              <ThS col="total" label="Total" className="ta-c" style={{ width: 60 }} />
              <th className="ta-c" style={{ width: 70 }}>Rondas</th>
              <ThS col="date"  label="Data"  className="ta-left"  style={{ width: 70 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(t => {
              const nRds = Object.keys(t.rounds || {}).length;
              const rdGross = Object.values(t.rounds || {}).map((rd: MHTournRound) => rd.gross).filter(g => g > 0);
              const parTotal = (t.par || []).reduce((a: number, b: number) => a + b, 0);
              const tp = t.totalStrokes && parTotal ? t.totalStrokes - parTotal * nRds : null;
              const tpStr = fmtToPar(tp, "");
              const isoD = isoDate(t.startDate || "");
              const fmtD = isoD ? new Date(isoD + "T12:00:00").toLocaleDateString("pt-PT", { month: "short", year: "numeric" }) : (t.startDate || "");
              return (
                <tr key={t.tid} style={{ borderBottom: "1px solid var(--border-light)" }}>
                  <td style={{ padding: "4px 8px", fontWeight: 500 }}>{t.name}</td>
                  <td style={{ textAlign: "center", fontSize: 10, color: "var(--text-2)" }}>{t.ageGroup}</td>
                  <td style={{ textAlign: "center", fontWeight: 700,
                    color: t.place <= 3 && t.place > 0 ? "var(--color-good-dark)" : "var(--text-2)" }}>
                    {t.place > 0 ? `${t.place}º` : "—"}
                  </td>
                  <td className="ta-c">
                    {t.totalStrokes > 0 ? (
                      <>
                        <span className="fw-600">{t.totalStrokes}</span>
                        {tpStr && <span className="fs-10" style={{ color: tpColorMH(tp), marginLeft: 3 }}>({tpStr})</span>}
                      </>
                    ) : "—"}
                  </td>
                  <td style={{ textAlign: "center", fontSize: 10, color: "var(--text-3)" }}>
                    {rdGross.length > 0 ? rdGross.join(" + ") : "—"}
                  </td>
                  <td style={{ fontSize: 10, color: "var(--text-3)" }}>{fmtD}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
