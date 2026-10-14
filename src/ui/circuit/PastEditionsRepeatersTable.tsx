/**
 * src/ui/circuit/PastEditionsRepeatersTable.tsx — vista «Quem repete» da tab
 * «Edições anteriores» dos circuitos (MAJOR, FFG, RFEG, Drive, EGR…).
 *
 * Uma linha por jogador do field de hoje que já jogou a prova; uma coluna por
 * edição anterior com o lugar (±par no tooltip). Mesmo modelo de tabela que o
 * scorecard (.sc-lb), espaçada (.sc-lb-airy), ordenável pelo cabeçalho.
 */
import { useContext, useEffect, useMemo, useState } from "react";
import { KidsLinkCtx, KidsLink } from "../KidsLink";
import { cachedFetchJson } from "../../data/fetchCache";
import { normName } from "../../utils/normName";
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

/** Resumo do kids2 escrito pelo agregador (`scripts/aggregator/util/form.js`):
 *  últimos torneios [data, ±par, buracos, lugar, field] e confrontos com o Manuel. */
interface JuniorForm { r: [string, number, number, number | null, number][]; m?: [number, number] }
interface FormFile { players: Record<string, JuniorForm> }

const N_FORMA = 5;
/** ±par médio por 18 buracos nos últimos torneios (9 buracos contam metade). */
function formaMedia(f: JuniorForm | undefined): number | null {
  const r = f?.r.slice(0, N_FORMA) ?? [];
  if (!r.length) return null;
  return Math.round((r.reduce((s, x) => s + (x[1] * 18) / x[2], 0) / r.length) * 10) / 10;
}
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export default function PastEditionsRepeatersTable({ data }: { data: RepeatersResult }) {
  const { sortKey, sortDir, toggleSort } = useSort<string>("n", "desc", { name: "asc", best: "asc", avg: "asc", forma: "asc" });
  const { rows, editions, fieldSize } = data;
  const kidsMap = useContext(KidsLinkCtx);
  const [form, setForm] = useState<FormFile | null>(null);
  useEffect(() => {
    let alive = true;
    cachedFetchJson<FormFile>("/data/juniors-form.json").then((d) => { if (alive) setForm(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const formOf = (r: RepeaterRow): JuniorForm | undefined => {
    const id = kidsMap.get(normName(r.name))?.id;
    return id ? form?.players[id] : undefined;
  };

  const sorted = useMemo(() => {
    const val = (r: RepeaterRow): number | string | null => {
      if (sortKey === "name") return r.name;
      if (sortKey === "n") return r.n;
      if (sortKey === "best") return r.bestPos;
      if (sortKey === "avg") return r.avgToPar;
      if (sortKey === "vsm") return r.vsManuel ? r.vsManuel[0] - r.vsManuel[1] : null;
      if (sortKey === "forma") return formaMedia(formOf(r));
      if (sortKey === "ult") return formOf(r)?.r[0]?.[0] ?? null;
      if (sortKey === "vsmAll") { const m = formOf(r)?.m; return m ? m[0] - m[1] : null; }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDir, form, kidsMap]);

  if (!editions.length) return <EmptyState size="md" message="Ainda não há edições anteriores desta prova." />;
  if (!rows.length) return <EmptyState size="md" message={`Nenhum dos ${fieldSize} jogadores de hoje jogou as edições anteriores.`} />;

  const temManuel = rows.some((r) => r.vsManuel);
  const temForma = rows.some((r) => formOf(r)?.r.length);
  const temManuelTodos = rows.some((r) => formOf(r)?.m);
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
              {temForma && <SortableHdr k="forma" {...hp} title={`±par médio por 18 buracos nos últimos ${N_FORMA} torneios (kids2, últimos 18 meses)`}>Forma</SortableHdr>}
              {temForma && <SortableHdr k="ult" {...hp} title="Último torneio no kids2: lugar / jogadores do escalão">Último</SortableHdr>}
              {temManuel && (
                <SortableHdr k="vsm" {...hp} title="Confrontos com o Manuel nas edições anteriores desta prova em que os dois acabaram: Manuel à frente – Manuel atrás">vs Manuel aqui</SortableHdr>
              )}
              {temManuelTodos && (
                <SortableHdr k="vsmAll" {...hp} title="Todos os confrontos com o Manuel no mesmo escalão (kids2): Manuel à frente – Manuel atrás">vs Manuel total</SortableHdr>
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
                  {flagOf(r.club)}{r.name} <KidsLink nome={r.name} />
                </td>
                <td className="mono">{r.n}</td>
                <td className="mono">{r.bestPos != null ? `${r.bestPos}º` : "–"}</td>
                <td className="mono" style={{ color: r.avgToPar != null ? tpColorDark(r.avgToPar) : undefined }}>
                  {r.avgToPar != null ? fmtToPar(r.avgToPar) : "–"}
                </td>
                {temForma && (() => {
                  const f = formOf(r);
                  const fm = formaMedia(f);
                  return (
                    <td className="mono" style={{ color: fm != null ? tpColorDark(fm) : undefined }}
                      title={f?.r.slice(0, N_FORMA).map((x) => `${ddmm(x[0])} · ${fmtToPar(x[1])} (${x[2]} b.)${x[3] ? ` · ${x[3]}º/${x[4]}` : ""}`).join("\n")}>
                      {fm != null ? fmtToPar(fm) : "–"}
                    </td>
                  );
                })()}
                {temForma && (() => {
                  const u = formOf(r)?.r[0];
                  return (
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>
                      {u ? <>{u[3] ? `${u[3]}º/${u[4]}` : fmtToPar(u[1])} <span className="muted fs-10">{ddmm(u[0])}</span></> : "–"}
                    </td>
                  );
                })()}
                {temManuel && (
                  <td className="mono" style={{ color: r.vsManuel ? (r.vsManuel[0] > r.vsManuel[1] ? "var(--accent-dark)" : r.vsManuel[0] < r.vsManuel[1] ? "var(--score-birdie)" : undefined) : undefined }}>
                    {r.vsManuel ? `${r.vsManuel[0]}–${r.vsManuel[1]}` : "–"}
                  </td>
                )}
                {temManuelTodos && (() => {
                  const m = formOf(r)?.m;
                  return (
                    <td className="mono" style={{ color: m ? (m[0] > m[1] ? "var(--accent-dark)" : m[0] < m[1] ? "var(--score-birdie)" : undefined) : undefined }}>
                      {m ? `${m[0]}–${m[1]}` : "–"}
                    </td>
                  );
                })()}
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
