import { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Course, Tee, SexFilter } from "../data/types";
import TeeBadge from "../ui/TeeBadge";
import PillBadge from "../ui/PillBadge";
import { teeCanonicalLabel, teeGroupHex } from "../utils/teeColors";
import { fmt, fmtCR, norm, titleCase, sumRange } from "../utils/format";
import { sortTees, filterTees, teeHexFromTee } from "../utils/teeUtils";

type Props = { courses: Course[] };

type OriginFilter = "ALL" | "PT" | "INTL";

/* ——— Helpers ——— */

/** Mapa de paises conhecidos — fallback para quando country nao vem nos dados */
const KNOWN_AWAY: Record<string, { country: string; flag: string }> = {
  "away-villa-padierna-flamingos":           { country: "Espanha",  flag: "\ud83c\uddea\ud83c\uddf8" },
  "away-le-touquet-golf-club-la-for-t":      { country: "França",   flag: "\ud83c\uddeb\ud83c\uddf7" },
  "away-golf-della-montecchia-white-red":    { country: "Itália",   flag: "\ud83c\uddee\ud83c\uddf9" },
  "away-golden-palm":                        { country: "EUA",      flag: "\ud83c\uddfa\ud83c\uddf8" },
  "away-real-club-de-golf-el-prat":          { country: "Espanha",  flag: "\ud83c\uddea\ud83c\uddf8" },
  "away-terre-dei-consoli-golf-club":        { country: "Itália",   flag: "\ud83c\uddee\ud83c\uddf9" },
  "away-marco-simone":                       { country: "Itália",   flag: "\ud83c\uddee\ud83c\uddf9" },
};

const COUNTRY_FLAGS: Record<string, string> = {
  "portugal": "\ud83c\uddf5\ud83c\uddf9", "espanha": "\ud83c\uddea\ud83c\uddf8",
  "italia": "\ud83c\uddee\ud83c\uddf9", "franca": "\ud83c\uddeb\ud83c\uddf7",
  "eua": "\ud83c\uddfa\ud83c\uddf8", "reino unido": "\ud83c\uddec\ud83c\udde7",
  "irlanda": "\ud83c\uddee\ud83c\uddea", "alemanha": "\ud83c\udde9\ud83c\uddea",
  "holanda": "\ud83c\uddf3\ud83c\uddf1", "suica": "\ud83c\udde8\ud83c\udded",
  "belgica": "\ud83c\udde7\ud83c\uddea", "turquia": "\ud83c\uddf9\ud83c\uddf7",
  "marrocos": "\ud83c\uddf2\ud83c\udde6", "brasil": "\ud83c\udde7\ud83c\uddf7",
  "africa do sul": "\ud83c\uddff\ud83c\udde6", "grecia": "\ud83c\uddec\ud83c\uddf7",
};

function normalizeCountryKey(raw: string): string {
  // Reparar double-encoding UTF-8 (mojibake)
  let s = raw;
  try {
    const bytes = new Uint8Array([...s].map(c => c.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (decoded !== s) s = decoded;
  } catch { /* ok */ }
  return s.trim().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function resolveFlag(c: Course): string {
  // 1) Tentar pelo country dos dados
  if (c.master.country) {
    const key = normalizeCountryKey(c.master.country);
    const flag = COUNTRY_FLAGS[key];
    if (flag) return flag;
  }
  // 2) Fallback: mapa de campos conhecidos
  const known = KNOWN_AWAY[c.courseKey];
  if (known) return known.flag;
  // 3) Campo away desconhecido — bandeira generica
  if (c.courseKey.startsWith("away-")) return "\ud83c\udff3\ufe0f";
  return "";
}

function resolveCountryName(c: Course): string {
  if (c.master.country) {
    let s = c.master.country;
    try {
      const bytes = new Uint8Array([...s].map(ch => ch.charCodeAt(0)));
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (decoded !== s) s = decoded;
    } catch { /* ok */ }
    return s.trim();
  }
  return KNOWN_AWAY[c.courseKey]?.country || "";
}

function isAway(c: Course): boolean {
  return c.courseKey.startsWith("away-");
}

function teeSuffix(t: Tee): string | null {
  const cr = t.ratings?.holes18?.courseRating;
  const sl = t.ratings?.holes18?.slopeRating;
  if (cr && sl) return `${fmtCR(cr)}/${sl}`;
  return null;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 0;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/* ——— Componente: Grelha Scorecard Multi-Tee ——— */

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
                    colorHex={teeHexFromTee(t)}
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
          <tr className="sc-meta-row sc-par-row">
            <td className="sc-sticky sc-meta-label">PAR</td>
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 1} className="sc-c">{refByHole.get(i + 1)?.par ?? "–"}</td>
            ))}
            <td className="sc-c sc-tot-val">{fmt(sumRange(1, 9, (i) => refByHole.get(i)?.par ?? null))}</td>
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 10} className="sc-c">{refByHole.get(i + 10)?.par ?? "–"}</td>
            ))}
            <td className="sc-c sc-tot-val">{fmt(sumRange(10, 18, (i) => refByHole.get(i)?.par ?? null))}</td>
            <td className="sc-c sc-tot-val">{fmt(sumRange(1, 18, (i) => refByHole.get(i)?.par ?? null))}</td>
          </tr>

          {/* SI / HCP */}
          <tr className="sc-meta-row sc-hcp-row">
            <td className="sc-sticky sc-meta-label">HCP</td>
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 1} className="sc-c">{refByHole.get(i + 1)?.si ?? "–"}</td>
            ))}
            <td className="sc-c">–</td>
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 10} className="sc-c">{refByHole.get(i + 10)?.si ?? "–"}</td>
            ))}
            <td className="sc-c">–</td>
            <td className="sc-c">–</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ——— Componente: Tabela de Ratings por Tee ——— */

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
                <TeeBadge label={titleCase(t.teeName)} colorHex={teeHexFromTee(t)} />
              </td>
              <td className="r-sex">{t.sex}</td>
              <td className="r-num">{fmt(t.distances?.total)}</td>
              <td className="r-num">{t.ratings?.holes18?.par ?? "–"}</td>
              <td className="r-num">{fmtCR(t.ratings?.holes18?.courseRating)}</td>
              <td className="r-num">{t.ratings?.holes18?.slopeRating ?? "–"}</td>
              <td className="r-num">{fmtCR(t.ratings?.holes9Front?.courseRating)}</td>
              <td className="r-num">{t.ratings?.holes9Front?.slopeRating ?? "–"}</td>
              <td className="r-num">{fmtCR(t.ratings?.holes9Back?.courseRating)}</td>
              <td className="r-num">{t.ratings?.holes9Back?.slopeRating ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ——— Página Principal ——— */

export default function CamposPage({ courses }: Props) {
  const { courseKey: urlCourseKey } = useParams<{ courseKey?: string }>();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sexFilter, setSexFilter] = useState<SexFilter>("ALL");
  const [teeFilter, setTeeFilter] = useState<string>("ALL");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("ALL");
  const [selectedKey, setSelectedKey] = useState<string | null>(urlCourseKey ?? null);
  const [detailView, setDetailView] = useState<"scorecard" | "ratings">("scorecard");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* Sync URL param → selectedKey */
  useEffect(() => {
    if (urlCourseKey && courses.some(c => c.courseKey === urlCourseKey)) {
      setSelectedKey(urlCourseKey);
    }
  }, [urlCourseKey]);

  /* Helper: select course and update URL */
  const selectCourse = (key: string | null) => {
    setSelectedKey(key);
    if (key) {
      navigate(`/campos/${key}`, { replace: true });
    } else {
      navigate("/campos", { replace: true });
    }
  };

  /* Unique tee color groups across all courses (for filter dropdown) */
  const uniqueTees = useMemo(() => {
    const map = new Map<string, { label: string; hex: string }>();
    for (const c of courses) {
      for (const t of c.master.tees) {
        const hex = teeGroupHex(t.teeName, t.scorecardMeta?.teeColor);
        if (!map.has(hex)) {
          map.set(hex, {
            label: teeCanonicalLabel(t.teeName, t.scorecardMeta?.teeColor),
            hex,
          });
        }
      }
    }
    return [...map.values()]
      .sort((a, b) => a.label.localeCompare(b.label, "pt"));
  }, [courses]);

  /* Filtrar e ordenar campos */
  const filtered = useMemo(() => {
    const qq = norm(q);
    let list = courses;
    if (qq) {
      list = list.filter((c) => {
        const name = norm(c.master.name);
        const key = norm(c.courseKey);
        return name.includes(qq) || key.includes(qq);
      });
    }
    if (originFilter === "PT") {
      list = list.filter((c) => !c.courseKey.startsWith("away-"));
    } else if (originFilter === "INTL") {
      list = list.filter((c) => c.courseKey.startsWith("away-"));
    }
    if (teeFilter !== "ALL") {
      list = list.filter((c) =>
        c.master.tees.some((t) => teeGroupHex(t.teeName, t.scorecardMeta?.teeColor) === teeFilter)
      );
    }
    return list;
  }, [courses, q, originFilter, teeFilter]);

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
  const intlCount = useMemo(() => courses.filter(c => c.courseKey.startsWith("away-")).length, [courses]);

  return (
    <div className="campos-page">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Fechar painel" : "Abrir painel"}
          >
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <input
            className="input"
            value={q}
            onChange={(e) => { setQ(e.target.value); selectCourse(null); }}
            placeholder="Nome do campo…"
          />
          <select
            className="select"
            value={originFilter}
            onChange={(e) => { setOriginFilter(e.target.value as OriginFilter); selectCourse(null); }}
          >
            <option value="ALL">Origem</option>
            <option value="PT">{"\ud83c\uddf5\ud83c\uddf9"} Portugal</option>
            <option value="INTL">{"\ud83c\udf0d"} Internacional</option>
          </select>
          <select className="select" value={sexFilter} onChange={(e) => setSexFilter(e.target.value as SexFilter)}>
            <option value="ALL">Sexo</option>
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
          </select>
          <select
            className="select"
            value={teeFilter}
            onChange={(e) => { setTeeFilter(e.target.value); selectCourse(null); }}
          >
            <option value="ALL">Todos os tees</option>
            {uniqueTees.map((t) => (
              <option key={t.hex} value={t.hex}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="toolbar-right">
          <div className="chip">{filtered.length} campos</div>
          <div className="chip">{totalTees} tees</div>
          {intlCount > 0 && <div className="chip">{"\ud83c\udf0d"} {intlCount} intl</div>}
        </div>
      </div>

      {/* Master-detail */}
      <div className="master-detail">
        {/* Lista de campos */}
        <div className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
          {filtered.map((c) => {
            const active = selected?.courseKey === c.courseKey;
            const tees = filterTees(c.master.tees, sexFilter);
            return (
              <button
                key={c.courseKey}
                className={`course-item ${active ? "active" : ""}`}
                onClick={() => selectCourse(c.courseKey)}
              >
                <div className="course-item-name">
                  {resolveFlag(c) && <span className="course-flag">{resolveFlag(c)}</span>}
                  <span>{c.master.name}</span>
                  {c.courseKey.startsWith("away-") && <PillBadge pill="INTL" />}
                </div>
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
              <div className="detail-header" style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <h2 className="detail-title">
                    {selected.master.name}
                    {resolveFlag(selected) && (
                      <span className="course-country-badge">
                        {resolveFlag(selected)} {resolveCountryName(selected)}
                      </span>
                    )}
                    {isAway(selected) && <PillBadge pill="INTL" />}
                  </h2>
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
                      colorHex={teeHexFromTee(t)}
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
