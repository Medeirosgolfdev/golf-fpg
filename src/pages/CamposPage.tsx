import { useMemo, useState } from "react";
import type { Course, Tee } from "../data/types";
import TeeBadge from "../ui/TeeBadge";
import { getTeeHex } from "../utils/teeColors";
import { fmt, fmtCR, norm, titleCase, sumRange } from "../utils/format";

type Props = { courses: Course[] };

type SexFilter = "ALL" | "M" | "F";

/* ─── Helpers ─── */

function sexRank(s: string) {
  if (s === "M") return 0;
  if (s === "F") return 1;
  return 2;
}

function sortTees(tees: Tee[]): Tee[] {
  return [...tees].sort((a, b) => {
    const da = a.distances?.total ?? -1;
    const db = b.distances?.total ?? -1;
    if (db !== da) return db - da;
    const sr = sexRank(a.sex) - sexRank(b.sex);
    if (sr !== 0) return sr;
    return a.teeName.localeCompare(b.teeName, "pt-PT", { sensitivity: "base" });
  });
}

function filterTees(tees: Tee[], sex: SexFilter): Tee[] {
  if (sex === "ALL") return tees;
  return tees.filter((t) => t.sex === sex);
}

function teeHex(t: Tee): string {
  return getTeeHex(t.teeName, t.scorecardMeta?.teeColor);
}

function teeSuffix(t: Tee): string | null {
  const cr = t.ratings?.holes18?.courseRating;
  const sl = t.ratings?.holes18?.slopeRating;
  if (cr && sl) return `${fmtCR(cr)}/${sl}`;
  return null;
}

/* ─── Componente: Grelha Scorecard Multi-Tee ─── */

function ScorecardGrid({ tees }: { tees: Tee[] }) {
  const sorted = useMemo(() => sortTees(tees), [tees]);

  const refTee = sorted.find((t) => t.holes?.length >= 18) ?? sorted[0];
  const refByHole = useMemo(() => {
    const m = new Map<number, (typeof refTee)["holes"][0]>();
    for (const h of refTee?.holes ?? []) {
      if (h.hole >= 1 && h.hole <= 18) m.set(h.hole, h);
    }
    return m;
  }, [refTee]);

  if (!sorted.length) return <div className="muted">Sem tees disponíveis</div>;

  return (
    <div className="sc-wrap">
      <table className="sc-table">
        <thead>
          <tr>
            <th className="sc-sticky">Tee</th>
            {Array.from({ length: 9 }, (_, i) => (
              <th key={i + 1} className="sc-h">{i + 1}</th>
            ))}
            <th className="sc-h sc-tot">OUT</th>
            {Array.from({ length: 9 }, (_, i) => (
              <th key={i + 10} className="sc-h">{i + 10}</th>
            ))}
            <th className="sc-h sc-tot">IN</th>
            <th className="sc-h sc-tot">TOT</th>
          </tr>
        </thead>
        <tbody>
          {/* Linhas de distância por tee */}
          {sorted.map((t) => {
            const byHole = new Map<number, (typeof t)["holes"][0]>();
            for (const h of t.holes ?? []) byHole.set(h.hole, h);

            const out = sumRange(1, 9, (i) => byHole.get(i)?.distance ?? null);
            const inn = sumRange(10, 18, (i) => byHole.get(i)?.distance ?? null);
            const tot = (out ?? 0) + (inn ?? 0);

            return (
              <tr key={t.teeId} className="sc-tee-row">
                <td className="sc-sticky sc-tee-cell">
                  <TeeBadge
                    label={titleCase(t.teeName)}
                    colorHex={teeHex(t)}
                    suffix={t.sex !== "U" ? t.sex : null}
                  />
                </td>
                {Array.from({ length: 9 }, (_, i) => (
                  <td key={i + 1} className="sc-c">{fmt(byHole.get(i + 1)?.distance ?? null)}</td>
                ))}
                <td className="sc-c sc-tot-val">{fmt(out)}</td>
                {Array.from({ length: 9 }, (_, i) => (
                  <td key={i + 10} className="sc-c">{fmt(byHole.get(i + 10)?.distance ?? null)}</td>
                ))}
                <td className="sc-c sc-tot-val">{fmt(inn)}</td>
                <td className="sc-c sc-tot-val">{fmt(tot || null)}</td>
              </tr>
            );
          })}

          {/* PAR */}
          <tr className="sc-meta-row">
            <td className="sc-sticky sc-meta-label">PAR</td>
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 1} className="sc-c">{refByHole.get(i + 1)?.par ?? "—"}</td>
            ))}
            <td className="sc-c sc-tot-val">{fmt(sumRange(1, 9, (i) => refByHole.get(i)?.par ?? null))}</td>
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 10} className="sc-c">{refByHole.get(i + 10)?.par ?? "—"}</td>
            ))}
            <td className="sc-c sc-tot-val">{fmt(sumRange(10, 18, (i) => refByHole.get(i)?.par ?? null))}</td>
            <td className="sc-c sc-tot-val">{fmt(sumRange(1, 18, (i) => refByHole.get(i)?.par ?? null))}</td>
          </tr>

          {/* SI / HCP */}
          <tr className="sc-meta-row">
            <td className="sc-sticky sc-meta-label">HCP</td>
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 1} className="sc-c">{refByHole.get(i + 1)?.si ?? "—"}</td>
            ))}
            <td className="sc-c">—</td>
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 10} className="sc-c">{refByHole.get(i + 10)?.si ?? "—"}</td>
            ))}
            <td className="sc-c">—</td>
            <td className="sc-c">—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ─── Componente: Tabela de Ratings por Tee ─── */

function RatingsTable({ tees }: { tees: Tee[] }) {
  const sorted = sortTees(tees);

  return (
    <div className="ratings-wrap">
      <table className="ratings-table">
        <thead>
          <tr>
            <th>Tee</th>
            <th>Sexo</th>
            <th className="r-num">Dist (m)</th>
            <th className="r-num">Par</th>
            <th className="r-num">CR</th>
            <th className="r-num">Slope</th>
            <th className="r-num">CR F9</th>
            <th className="r-num">Sl F9</th>
            <th className="r-num">CR B9</th>
            <th className="r-num">Sl B9</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.teeId}>
              <td>
                <TeeBadge label={titleCase(t.teeName)} colorHex={teeHex(t)} />
              </td>
              <td className="r-sex">{t.sex}</td>
              <td className="r-num">{fmt(t.distances?.total)}</td>
              <td className="r-num">{t.ratings?.holes18?.par ?? "—"}</td>
              <td className="r-num">{fmtCR(t.ratings?.holes18?.courseRating)}</td>
              <td className="r-num">{t.ratings?.holes18?.slopeRating ?? "—"}</td>
              <td className="r-num">{fmtCR(t.ratings?.holes9Front?.courseRating)}</td>
              <td className="r-num">{t.ratings?.holes9Front?.slopeRating ?? "—"}</td>
              <td className="r-num">{fmtCR(t.ratings?.holes9Back?.courseRating)}</td>
              <td className="r-num">{t.ratings?.holes9Back?.slopeRating ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Página Principal ─── */

export default function CamposPage({ courses }: Props) {
  const [q, setQ] = useState("");
  const [sexFilter, setSexFilter] = useState<SexFilter>("ALL");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<"scorecard" | "ratings">("scorecard");

  /* Filtrar e ordenar campos */
  const filtered = useMemo(() => {
    const qq = norm(q);
    let list = courses;
    if (qq) {
      list = courses.filter((c) => {
        const name = norm(c.master.name);
        const key = norm(c.courseKey);
        return name.includes(qq) || key.includes(qq);
      });
    }
    return list;
  }, [courses, q]);

  /* Campo selecionado */
  const selected = useMemo(() => {
    if (!selectedKey) return filtered[0] ?? null;
    return courses.find((c) => c.courseKey === selectedKey) ?? filtered[0] ?? null;
  }, [courses, filtered, selectedKey]);

  const selectedTees = useMemo(() => {
    if (!selected) return [];
    return sortTees(filterTees(selected.master.tees, sexFilter));
  }, [selected, sexFilter]);

  const scorecardLink = selected?.master.links?.scorecards;

  /* Stats globais */
  const totalTees = useMemo(() => courses.reduce((n, c) => n + c.master.tees.length, 0), [courses]);

  return (
    <div className="campos-page">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="field">
            <label>Pesquisa</label>
            <input
              className="input"
              value={q}
              onChange={(e) => { setQ(e.target.value); setSelectedKey(null); }}
              placeholder="Nome do campo…"
            />
          </div>
          <div className="field">
            <label>Sexo</label>
            <select className="select" value={sexFilter} onChange={(e) => setSexFilter(e.target.value as SexFilter)}>
              <option value="ALL">Todos</option>
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
          </div>
        </div>
        <div className="toolbar-right">
          <div className="chip">{filtered.length} campos</div>
          <div className="chip">{totalTees} tees</div>
        </div>
      </div>

      {/* Master-detail */}
      <div className="master-detail">
        {/* Lista de campos */}
        <div className="course-list">
          {filtered.map((c) => {
            const active = selected?.courseKey === c.courseKey;
            const tees = filterTees(c.master.tees, sexFilter);
            return (
              <button
                key={c.courseKey}
                className={`course-item ${active ? "active" : ""}`}
                onClick={() => setSelectedKey(c.courseKey)}
              >
                <div className="course-item-name">{c.master.name}</div>
                <div className="course-item-meta">
                  {tees.length} tee{tees.length !== 1 ? "s" : ""}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="muted" style={{ padding: 16 }}>Nenhum campo encontrado</div>
          )}
        </div>

        {/* Detalhe */}
        <div className="course-detail">
          {selected ? (
            <>
              <div className="detail-header">
                <div>
                  <h2 className="detail-title">{selected.master.name}</h2>
                  <div className="detail-sub">
                    <span className="muted">{selected.courseKey}</span>
                    {scorecardLink && (
                      <>
                        {" · "}
                        <a href={scorecardLink} target="_blank" rel="noreferrer" className="detail-link">
                          Ver scorecard ↗
                        </a>
                      </>
                    )}
                  </div>
                </div>
                <div className="detail-actions">
                  <button
                    className={`tab-btn ${detailView === "scorecard" ? "active" : ""}`}
                    onClick={() => setDetailView("scorecard")}
                  >
                    Scorecard
                  </button>
                  <button
                    className={`tab-btn ${detailView === "ratings" ? "active" : ""}`}
                    onClick={() => setDetailView("ratings")}
                  >
                    Ratings
                  </button>
                </div>
              </div>

              {/* Tee badges resumo */}
              <div className="tee-badges-row">
                {selectedTees.map((t) => (
                  <span key={t.teeId} className="tee-badge-card">
                    <TeeBadge
                      label={titleCase(t.teeName)}
                      colorHex={teeHex(t)}
                      suffix={teeSuffix(t)}
                    />
                    <span className="muted" style={{ fontSize: 11 }}>
                      {t.sex} · {fmt(t.distances?.total)} m
                    </span>
                  </span>
                ))}
                {selectedTees.length === 0 && (
                  <span className="muted">Sem tees para este filtro</span>
                )}
              </div>

              {/* Vista */}
              {detailView === "scorecard" ? (
                <ScorecardGrid tees={selectedTees} />
              ) : (
                <RatingsTable tees={selectedTees} />
              )}
            </>
          ) : (
            <div className="muted" style={{ padding: 24 }}>Seleciona um campo</div>
          )}
        </div>
      </div>
    </div>
  );
}
