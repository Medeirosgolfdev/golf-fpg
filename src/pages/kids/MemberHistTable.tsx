/**
 * kids/MemberHistTable.tsx — Tabela do historial USKids (Member History)
 * (extraído de KIDSPage.tsx para reduzir tamanho)
 */
import { useMemo } from "react";
import SortableHdr from "../../ui/SortableHdr";
import { useSort } from "../../hooks/useSort";
import { fmtToPar, isoDate } from "../../utils/format";
import { tpColorDark } from "../../utils/scoreDisplay";

// Types partilhados
interface MHTournRound { gross: number }
interface MHTournament {
  name: string; ageGroup: string; place: number;
  totalStrokes: number; rounds: Record<string, MHTournRound>;
  par?: number[]; startDate?: string;
}

export type MHSortCol = "date" | "pos" | "total" | "name";

export function MemberHistTable({ mhTorneios, memberId }: {
  mhTorneios: Array<MHTournament & { tid: string }>;
  memberId: string;
}) {
  const { sortKey, sortDir, toggleSort } = useSort<MHSortCol>("date", "desc", { name: "asc" });

  const sorted = useMemo(() => {
    return [...mhTorneios].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") {
        const pa = isoDate(a.startDate || ""), pb = isoDate(b.startDate || "");
        cmp = pa.localeCompare(pb);
      } else if (sortKey === "pos") {
        cmp = (a.place || 999) - (b.place || 999);
      } else if (sortKey === "total") {
        cmp = (a.totalStrokes || 999) - (b.totalStrokes || 999);
      } else if (sortKey === "name") {
        cmp = (a.name || "").localeCompare(b.name || "");
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [mhTorneios, sortKey, sortDir]);

  return (
    <div className="mt-24 mb-16">
      <div className="h-sm mb-8" style={{ color: "var(--text-2)", display: "flex", alignItems: "center", gap: 8 }}>
        <span>📊 Histórico USKids · {mhTorneios.length} torneios</span>
        <span style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", fontWeight: 400 }}>ID: {memberId}</span>
      </div>
      <div className="scroll-x">
        <table className="dtable w-full fs-12" >
          <thead>
            <tr>
              <SortableHdr k="name"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="ta-left" style={{ padding: "4px 8px" }}>Torneio</SortableHdr>
              <th className="ta-c" style={{ width: 60 }}>Escalão</th>
              <SortableHdr k="pos"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="ta-c" style={{ width: 42 }}>Pos</SortableHdr>
              <SortableHdr k="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="ta-c" style={{ width: 60 }}>Total</SortableHdr>
              <th className="ta-c" style={{ width: 70 }}>Rondas</th>
              <SortableHdr k="date"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="ta-left" style={{ width: 70 }}>Data</SortableHdr>
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
                  <td style={{ textAlign: "center", fontSize: "var(--fs-10)", color: "var(--text-2)" }}>{t.ageGroup}</td>
                  <td style={{ textAlign: "center", fontWeight: 700,
                    color: t.place <= 3 && t.place > 0 ? "var(--color-good-dark)" : "var(--text-2)" }}>
                    {t.place > 0 ? `${t.place}º` : "—"}
                  </td>
                  <td className="ta-c">
                    {t.totalStrokes > 0 ? (
                      <>
                        <span className="fw-600">{t.totalStrokes}</span>
                        {tpStr && <span className="fs-10" style={{ color: tpColorDark(tp), marginLeft: 3 }}>({tpStr})</span>}
                      </>
                    ) : "—"}
                  </td>
                  <td style={{ textAlign: "center", fontSize: "var(--fs-10)", color: "var(--text-3)" }}>
                    {rdGross.length > 0 ? rdGross.join(" + ") : "—"}
                  </td>
                  <td style={{ fontSize: "var(--fs-10)", color: "var(--text-3)" }}>{fmtD}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
