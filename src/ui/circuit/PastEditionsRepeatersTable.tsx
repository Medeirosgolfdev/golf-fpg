/**
 * src/ui/circuit/PastEditionsRepeatersTable.tsx — vista «Quem repete» da tab
 * «Edições anteriores» dos circuitos (MAJOR, FFG, RFEG, Drive, EGR…).
 *
 * Uma linha por jogador do field de hoje que já jogou a prova; uma coluna por
 * edição anterior com o lugar (±par no tooltip). Mesmo modelo de tabela que o
 * scorecard (.sc-lb), espaçada (.sc-lb-airy), ordenável pelo cabeçalho.
 */
import { useMemo } from "react";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../SortableHdr";
import EmptyState from "../EmptyState";
import { fmtToPar } from "../../utils/format";
import { tpColorDark } from "../../utils/scoreDisplay";
import type { RepeatersResult, RepeaterRow } from "./repeaters";

function flagOf(club?: string | null): string {
  const first = (club || "").trim().split(/\s+/)[0] || "";
  return /^[\u{1F1E6}-\u{1F1FF}\u{1F3F4}]/u.test(first) ? first + " " : "";
}

export default function PastEditionsRepeatersTable({ data }: { data: RepeatersResult }) {
  const { sortKey, sortDir, toggleSort } = useSort<string>("n", "desc", { name: "asc", best: "asc", avg: "asc" });
  const { rows, editions, fieldSize } = data;

  const sorted = useMemo(() => {
    const val = (r: RepeaterRow): number | string | null => {
      if (sortKey === "name") return r.name;
      if (sortKey === "n") return r.n;
      if (sortKey === "best") return r.bestPos;
      if (sortKey === "avg") return r.avgToPar;
      if (sortKey === "vsm") return r.vsManuel ? r.vsManuel[0] - r.vsManuel[1] : null;
      return r.byEd[sortKey]?.pos ?? null;
    };
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = typeof va === "string" ? va.localeCompare(String(vb)) : (va as number) - (vb as number);
      return c * dir || a.name.localeCompare(b.name);
    });
  }, [rows, sortKey, sortDir]);

  if (!editions.length) return <EmptyState size="md" message="Ainda não há edições anteriores desta prova." />;
  if (!rows.length) return <EmptyState size="md" message={`Nenhum dos ${fieldSize} jogadores de hoje jogou as edições anteriores.`} />;

  const temManuel = rows.some((r) => r.vsManuel);
  const sameYear = (e: (typeof editions)[number]) => editions.some((o) => o !== e && o.year === e.year);
  const hp = { sortKey, sortDir, onSort: toggleSort };

  return (
    <div>
      <div className="fs-12 muted" style={{ margin: "2px 0 10px" }}>
        {rows.length} dos {fieldSize} jogadores de hoje já jogaram esta prova · {editions.length} edi{editions.length === 1 ? "ção" : "ções"} anteriores
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="sc-lb sc-lb-airy" style={{ fontVariantNumeric: "tabular-nums", width: "max-content" }}>
          <thead>
            <tr>
              <SortableHdr k="name" {...hp} style={{ textAlign: "left" }}>Jogador</SortableHdr>
              <SortableHdr k="n" {...hp} title="Quantas edições anteriores jogou">Presenças</SortableHdr>
              <SortableHdr k="best" {...hp} title="Melhor lugar numa edição que acabou">Melhor</SortableHdr>
              <SortableHdr k="avg" {...hp} title="Média do ±par nas edições que acabou">Média ±</SortableHdr>
              {temManuel && (
                <SortableHdr k="vsm" {...hp} title="Confrontos com o Manuel nas edições em que os dois acabaram: Manuel à frente – Manuel atrás">vs Manuel</SortableHdr>
              )}
              {editions.map((e) => (
                <SortableHdr key={e.id} k={e.id} {...hp}
                  title={[e.label, e.division, e.course].filter(Boolean).join(" · ")}>
                  {e.year}
                  {sameYear(e) && e.label ? <div className="fs-10 muted" style={{ fontWeight: 500 }}>{e.label}</div> : null}
                </SortableHdr>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.key} className={r.isManuel ? "row-manuel" : undefined}>
                <td style={{ textAlign: "left", whiteSpace: "nowrap" }} className={r.isManuel ? "fw-700" : undefined}>
                  {flagOf(r.club)}{r.name}
                </td>
                <td className="mono">{r.n}</td>
                <td className="mono">{r.bestPos != null ? `${r.bestPos}º` : "–"}</td>
                <td className="mono" style={{ color: r.avgToPar != null ? tpColorDark(r.avgToPar) : undefined }}>
                  {r.avgToPar != null ? fmtToPar(r.avgToPar) : "–"}
                </td>
                {temManuel && (
                  <td className="mono" style={{ color: r.vsManuel ? (r.vsManuel[0] > r.vsManuel[1] ? "var(--accent-dark)" : r.vsManuel[0] < r.vsManuel[1] ? "var(--score-birdie)" : undefined) : undefined }}>
                    {r.vsManuel ? `${r.vsManuel[0]}–${r.vsManuel[1]}` : "–"}
                  </td>
                )}
                {editions.map((e) => {
                  const c = r.byEd[e.id];
                  if (!c) return <td key={e.id} className="muted">–</td>;
                  return (
                    <td key={e.id} className="mono"
                      title={[c.total != null ? `${c.total}` : null, c.toPar != null ? fmtToPar(c.toPar) : null, c.complete ? null : "não acabou"].filter(Boolean).join(" · ")}
                      style={c.complete ? undefined : { fontStyle: "italic", color: "var(--text-3)" }}>
                      {c.pos != null ? `${c.pos}º` : "–"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
