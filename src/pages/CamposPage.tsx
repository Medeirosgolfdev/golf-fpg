import { useMemo, useState, useEffect } from "react";
import SidebarToggle from "../ui/SidebarToggle";
import EmptyState from "../ui/EmptyState";
import DetailHeader from "../ui/DetailHeader";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../ui/Toolbar";
import { useMasterDetail } from "../hooks/useMasterDetail";
import { useParams, useNavigate } from "react-router-dom";
import type { Course, Tee, SexFilter } from "../data/types";
import { useAppContext } from "../context/AppContext";
import TeeBadge from "../ui/TeeBadge";
import { teeCanonicalLabel, teeGroupHex } from "../utils/teeColors";
import { fmt, fmtCR, norm, titleCase, sumRange } from "../utils/format";
import { fixMojibake } from "../utils/fixEncoding";
import { sortTees, filterTees, teeHexFromTee } from "../utils/teeUtils";
import { PillBadge } from "../ui/PillBadge";



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
  "portugal": "🇵🇹", "espanha": "🇪🇸",
  "italia": "🇮🇹", "franca": "🇫🇷",
  "eua": "🇺🇸", "reino unido": "🇬🇧",
  "inglaterra": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "escocia": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "gales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  "irlanda": "🇮🇪", "irlanda do norte": "🇬🇧",
  "alemanha": "🇩🇪", "holanda": "🇳🇱", "suica": "🇨🇭",
  "belgica": "🇧🇪", "turquia": "🇹🇷",
  "marrocos": "🇲🇦", "brasil": "🇧🇷",
  "africa do sul": "🇿🇦", "grecia": "🇬🇷",
  "suecia": "🇸🇪", "noruega": "🇳🇴", "dinamarca": "🇩🇰",
  "finlandia": "🇫🇮", "polonia": "🇵🇱",
  "eslovaquia": "🇸🇰", "rep checa": "🇨🇿", "republica checa": "🇨🇿",
  "hungria": "🇭🇺", "austria": "🇦🇹", "bulgaria": "🇧🇬",
  "estonia": "🇪🇪", "ucrania": "🇺🇦", "islandia": "🇮🇸",
  "canada": "🇨🇦", "porto rico": "🇵🇷",
  "pais de gales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  "rep dominicana": "🇩🇴",
};

function normalizeCountryKey(raw: string): string {
  const s = fixMojibake(raw);
  return s.trim().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
    return fixMojibake(c.master.country).trim();
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
          {sorted.map((t, idx) => {
            const byHole = new Map<number, (typeof t)["holes"][0]>();
            for (const h of t.holes ?? []) byHole.set(h.hole, h);

            const out = sumRange(1, 9, (i) => byHole.get(i)?.distance ?? null);
            const inn = sumRange(10, 18, (i) => byHole.get(i)?.distance ?? null);
            const tot = (out ?? 0) + (inn ?? 0);

            return (
              <tr key={`${t.teeId}-${idx}`} className="sc-tee-row">
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
          {sorted.map((t, idx) => (
            <tr key={`${t.teeId}-${idx}`}>
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
/* ——— Componente: Quem jogou neste campo ——— */

function CoursePlayersSection({ course }: { course: Course }) {
  const { players } = useAppContext();

  const entries = useMemo(() => {
    const raw = course.master._players;
    if (!raw || Object.keys(raw).length === 0) return [];
    return Object.entries(raw)
      .map(([nfed, d]) => {
        const p = players[nfed];
        const date: string | null = (d as string | null) ?? null;
        return { nfed, name: p?.name ?? nfed, date };
      })
      .sort((a, b) => {
        const da = a.date ? a.date.split("-").reverse().join("") : "0";
        const db = b.date ? b.date.split("-").reverse().join("") : "0";
        if (db !== da) return db.localeCompare(da);
        return a.name.localeCompare(b.name, "pt");
      });
  }, [course, players]);

  if (entries.length === 0) return null;

  return (
    <div className="course-players-section">
      <h4 className="course-players-title">Jogadores ({entries.length})</h4>
      <div className="course-players-list">
        {entries.map(({ nfed, name, date }) => (
          <div key={nfed} className="course-player-row">
            <a
              href={`/jogadores/${nfed}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tourn-pname tourn-pname-link"
            >
              {name}
            </a>
            {date && <span className="course-player-date muted">{date}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CamposPage() {
  const { simCourses: courses, players } = useAppContext();
  const { courseKey: urlCourseKey } = useParams<{ courseKey?: string }>();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [playerQ, setPlayerQ] = useState("");
  const [sexFilter, setSexFilter] = useState<SexFilter>("ALL");
  const [teeFilter, setTeeFilter] = useState<string>("ALL");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("ALL");
  const [countryFilter, setCountryFilter] = useState<string>("ALL");
  const [selectedKey, setSelectedKey] = useState<string | null>(urlCourseKey ?? null);
  const [detailView, setDetailView] = useState<"scorecard" | "ratings">("scorecard");
    const isMobileInit = typeof window !== "undefined" && window.innerWidth <= 768;
  const md = useMasterDetail(!(isMobileInit && urlCourseKey));
  /* Sync URL param → selectedKey */
  useEffect(() => {
    if (urlCourseKey && courses.some(c => c.courseKey === urlCourseKey)) {
      setSelectedKey(urlCourseKey);
    }
  }, [urlCourseKey, courses]);

  /* Helper: select course and update URL */
  const selectCourse = (key: string | null) => {
    setSelectedKey(key);
    if (key) {
      navigate(`/campos/${key}`, { replace: true });
    } else {
      navigate("/campos", { replace: true });
    }
  };

  /* Lista de países únicos dos campos INTL */
  const intlCountries = useMemo(() => {
    const seen = new Map<string, string>(); // normKey → display
    for (const c of courses) {
      if (!c.courseKey.startsWith("away-")) continue;
      const name = resolveCountryName(c);
      if (!name) continue;
      const key = normalizeCountryKey(name);
      if (!seen.has(key)) seen.set(key, name);
    }
    return [...seen.entries()]
      .map(([k, v]) => ({ key: k, label: v, flag: COUNTRY_FLAGS[k] ?? "🌍" }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt"));
  }, [courses]);

  /* Pesquisa por jogador — calcular nfeds que correspondem */
  const playerNfeds = useMemo<Set<string> | null>(() => {
    const pq = playerQ.trim();
    if (!pq) return null;
    const pqn = norm(pq);
    const matched = new Set<string>();
    for (const [nfed, p] of Object.entries(players)) {
      if (norm(p.name ?? "").includes(pqn)) matched.add(nfed);
    }
    return matched;
  }, [playerQ, players]);

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
    if (countryFilter !== "ALL") {
      list = list.filter((c) => {
        const cn = resolveCountryName(c);
        return normalizeCountryKey(cn) === countryFilter;
      });
    }
    if (teeFilter !== "ALL") {
      list = list.filter((c) =>
        c.master.tees.some((t) => teeGroupHex(t.teeName, t.scorecardMeta?.teeColor) === teeFilter)
      );
    }
    // Filtro por jogador — só campos onde o jogador jogou
    if (playerNfeds && playerNfeds.size > 0) {
      list = list.filter((c) => {
        const p = c.master._players;
        if (!p) return false;
        return Object.keys(p).some((nfed) => playerNfeds.has(nfed));
      });
    } else if (playerQ.trim()) {
      // Pesquisa activa mas sem jogador encontrado
      list = [];
    }
    // Ordenação: campos PT primeiro (A→Z), depois INTL (A→Z)
    list = [...list].sort((a, b) => {
      const aPT = !a.courseKey.startsWith("away-");
      const bPT = !b.courseKey.startsWith("away-");
      if (aPT !== bPT) return aPT ? -1 : 1;
      return a.master.name.localeCompare(b.master.name, "pt", { sensitivity: "base" });
    });
    return list;
  }, [courses, q, originFilter, countryFilter, teeFilter, playerNfeds, playerQ]);

  /* Campo selecionado */
  const selected = useMemo(() => {
    if (!selectedKey) return filtered[0] ?? null;
    return courses.find((c) => c.courseKey === selectedKey) ?? filtered[0] ?? null;
  }, [courses, filtered, selectedKey]);

  const selectedTees = useMemo(() => {
    if (!selected) return [];
    const tees = sortTees(filterTees(selected.master.tees, sexFilter));
    // Ignorar tees sem qualquer dado útil (sem buracos e sem distância)
    return tees.filter(t => {
      const holes = t.distances?.holesCount ?? 0;
      const dist = t.distances?.total ?? 0;
      const cr = t.ratings?.holes18?.courseRating;
      // Manter se tem buracos, ou distância, ou pelo menos CR válido
      return holes > 0 || dist > 0 || (cr != null && cr > 0);
    });
  }, [selected, sexFilter]);

  const scorecardLink = selected?.master.links?.scorecards;
  const selectedFlag = selected ? resolveFlag(selected) : "";

  /* Stats globais */
  const totalTees = useMemo(() => courses.reduce((n, c) => n + c.master.tees.length, 0), [courses]);
  const intlCount = useMemo(() => courses.filter(c => c.courseKey.startsWith("away-")).length, [courses]);

  return (
    <div className="campos-page">
      {/* Toolbar */}
      <Toolbar>
                <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Campos" />
        <input
          className="input"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPlayerQ(""); selectCourse(null); }}
          placeholder="Nome do campo…"
        />
        <input
          className="input"
          value={playerQ}
          onChange={(e) => { setPlayerQ(e.target.value); setQ(""); selectCourse(null); }}
          placeholder="Jogador…"
          title="Mostra os campos onde este jogador já jogou"
        />
        <select
          className="select"
          value={originFilter}
          onChange={(e) => { setOriginFilter(e.target.value as OriginFilter); setCountryFilter("ALL"); selectCourse(null); }}
        >
          <option value="ALL">Origem</option>
          <option value="PT">{"\ud83c\uddf5\ud83c\uddf9"} Portugal</option>
          <option value="INTL">{"\ud83c\udf0d"} Internacional</option>
        </select>
        {(originFilter === "INTL" || originFilter === "ALL") && (
          <select
            className="select"
            value={countryFilter}
            onChange={(e) => { setCountryFilter(e.target.value); selectCourse(null); }}
          >
            <option value="ALL">País</option>
            {intlCountries.map(({ key, label, flag }) => (
              <option key={key} value={key}>{flag} {label}</option>
            ))}
          </select>
        )}
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
        <div className="chip" style={{ marginLeft: "auto" }}>{filtered.length} campos</div>
          <div className="chip">{totalTees} tees</div>
          {intlCount > 0 && <div className="chip">{"\ud83c\udf0d"} {intlCount} intl</div>}
      </Toolbar>

      {/* Master-detail */}
      <div className="master-detail">
        {/* Lista de campos */}
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          {filtered.map((c) => {
            const active = selected?.courseKey === c.courseKey;
            const tees = filterTees(c.master.tees, sexFilter);
            const flag = resolveFlag(c);
            return (
              <button
                key={c.courseKey}
                className={`course-item ${active ? "active" : ""}`}
                onClick={() => { selectCourse(c.courseKey); md.onSelect(); }}
              >
                <div className="course-item-name">
                  {flag && <span className="course-flag">{flag}</span>}
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
            <EmptyState size="sm" message="Nenhum campo encontrado" />
          )}
        </div>

        {/* Detalhe */}
        <div className="course-detail" ref={md.detailRef}>
          {selected ? (
            <>
              <div className="detail-header">
                <div className="detail-header-top">
                <div>
                  <h2 className="detail-title">
                    {selected.master.name}
                    {selectedFlag && (
                      <span className="course-country-badge">
                        {selectedFlag} {resolveCountryName(selected)}
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
                    {selected.master.links?.extra?.map((lnk) => (
                      <span key={lnk.url}>
                        {" · "}
                        <a href={lnk.url} target="_blank" rel="noreferrer" className="detail-link">
                          {lnk.label} ↗
                        </a>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="detail-actions">
                  <button
                    className={`tourn-tab tourn-tab-sm ${detailView === "scorecard" ? "active" : ""}`}
                    onClick={() => setDetailView("scorecard")}
                  >
                    Scorecard
                  </button>
                  <button
                    className={`tourn-tab tourn-tab-sm ${detailView === "ratings" ? "active" : ""}`}
                    onClick={() => setDetailView("ratings")}
                  >
                    Ratings
                  </button>
                </div>
                </div>
              </div>

              {/* Tee badges resumo */}
              <div className="tee-badges-row">
                {selectedTees.map((t, idx) => (
                  <span key={`${t.teeId}-${idx}`} className="tee-badge-card">
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

              {/* Jogadores que já jogaram aqui */}
              <CoursePlayersSection
                course={selected}
                onSelectPlayer={(fed) => navigate(`/jogadores/${fed}`)}
              />
            </>
          ) : (
            <div className="muted" style={{ padding: 24 }}>Seleciona um campo</div>
          )}
        </div>
      </div>
    </div>
  );
}
