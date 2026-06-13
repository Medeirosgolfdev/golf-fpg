import { useMemo, useState, useEffect } from "react";
import SidebarToggle from "../ui/SidebarToggle";
import EmptyState from "../ui/EmptyState";
import Counter from "../ui/Counter";
import { Toolbar } from "../ui/Toolbar";
import { useMasterDetail } from "../hooks/useMasterDetail";
import { useParams, useNavigate } from "react-router-dom";
import type { Course, Tee, SexFilter, CoursePlayerRound } from "../data/types";
import { useAppContext } from "../context/AppContext";
import TeeBadge from "../ui/TeeBadge";
import { teeCanonicalLabel, teeGroupHex } from "../utils/teeColors";
import { fmt, fmtCR, norm, titleCase, sumRange, fmtToPar } from "../utils/format";
import { fixMojibake } from "../utils/fixEncoding";
import { sortTees, filterTees, teeHexFromTee } from "../utils/teeUtils";
import { PillBadge } from "../ui/PillBadge";
import ExtLink from "../ui/ExternalLink";
import { useSort } from "../hooks/useSort";
import SortableHdr from "../ui/SortableHdr";
import { cachedFetchJson } from "../data/fetchCache";
import { isTournamentCourse } from "../constants/tournamentCourses";

/* Mapa fed-code → nome para jogadores que não estão em players.json.
   Gerado por scripts/build-course-player-names.js a partir de federados.json.
   Carregado uma única vez ao nível do módulo. */
let _coursePlayerNames: Record<string, string> | null = null;
let _coursePlayerNamesPromise: Promise<Record<string, string>> | null = null;
function loadCoursePlayerNames(): Promise<Record<string, string>> {
  if (_coursePlayerNames) return Promise.resolve(_coursePlayerNames);
  if (!_coursePlayerNamesPromise) {
    _coursePlayerNamesPromise = cachedFetchJson<{ names?: Record<string, string> }>(
      "/data/course-player-names.json"
    )
      .then((d) => {
        _coursePlayerNames = d?.names ?? {};
        return _coursePlayerNames;
      })
      .catch(() => {
        _coursePlayerNames = {};
        return _coursePlayerNames;
      });
  }
  return _coursePlayerNamesPromise;
}



type OriginFilter = "ALL" | "PT" | "INTL" | "TOURN";

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
                  <td key={i + 1} className="ta-c">{fmt(byHole.get(i + 1)?.distance ?? null)}</td>
                ))}
                <td className="ta-c sc-tot-val">{fmt(out)}</td>
                {Array.from({ length: 9 }, (_, i) => (
                  <td key={i + 10} className="ta-c">{fmt(byHole.get(i + 10)?.distance ?? null)}</td>
                ))}
                <td className="ta-c sc-tot-val">{fmt(inn)}</td>
                <td className="ta-c sc-tot-val">{fmt(tot || null)}</td>
              </tr>
            );
          })}

          {/* PAR */}
          <tr className="sc-meta-row sc-par-row">
            <td className="sc-sticky sc-meta-label">PAR</td>
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 1} className="ta-c">{refByHole.get(i + 1)?.par ?? "–"}</td>
            ))}
            <td className="ta-c sc-tot-val">{fmt(sumRange(1, 9, (i) => refByHole.get(i)?.par ?? null))}</td>
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 10} className="ta-c">{refByHole.get(i + 10)?.par ?? "–"}</td>
            ))}
            <td className="ta-c sc-tot-val">{fmt(sumRange(10, 18, (i) => refByHole.get(i)?.par ?? null))}</td>
            <td className="ta-c sc-tot-val">{fmt(sumRange(1, 18, (i) => refByHole.get(i)?.par ?? null))}</td>
          </tr>

          {/* SI / HCP */}
          <tr className="sc-meta-row sc-hcp-row">
            <td className="sc-sticky sc-meta-label">SI</td>
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 1} className="ta-c">{refByHole.get(i + 1)?.si ?? "–"}</td>
            ))}
            <td className="ta-c">–</td>
            {Array.from({ length: 9 }, (_, i) => (
              <td key={i + 10} className="ta-c">{refByHole.get(i + 10)?.si ?? "–"}</td>
            ))}
            <td className="ta-c">–</td>
            <td className="ta-c">–</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ——— Componente: Tabela de Ratings por Tee ——— */

type RatingsSortKey = "tee" | "sex" | "dist" | "par" | "cr" | "slope" | "crF9" | "slF9" | "crB9" | "slB9";

function RatingsTable({ tees }: { tees: Tee[] }) {
  const defaultSorted = sortTees(tees);
  const { sortKey, sortDir, toggleSort } = useSort<RatingsSortKey>("tee");

  const sorted = useMemo(() => {
    if (sortKey === "tee") {
      // "tee" = ordem canónica (branca, amarela, azul, ...) ou inversa
      return sortDir === "asc" ? defaultSorted : [...defaultSorted].reverse();
    }
    const getVal = (t: Tee): number | string => {
      switch (sortKey) {
        case "sex":   return t.sex ?? "";
        case "dist":  return t.distances?.total ?? -Infinity;
        case "par":   return t.ratings?.holes18?.par ?? -Infinity;
        case "cr":    return t.ratings?.holes18?.courseRating ?? -Infinity;
        case "slope": return t.ratings?.holes18?.slopeRating ?? -Infinity;
        case "crF9":  return t.ratings?.holes9Front?.courseRating ?? -Infinity;
        case "slF9":  return t.ratings?.holes9Front?.slopeRating ?? -Infinity;
        case "crB9":  return t.ratings?.holes9Back?.courseRating ?? -Infinity;
        case "slB9":  return t.ratings?.holes9Back?.slopeRating ?? -Infinity;
        default:      return 0;
      }
    };
    return [...defaultSorted].sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      let cmp: number;
      if (typeof va === "string" && typeof vb === "string") cmp = va.localeCompare(vb, "pt");
      else cmp = (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [defaultSorted, sortKey, sortDir]);

  return (
    <div className="sc-wrap">
      <table className="ratings-table">
        <thead>
          <tr>
            <SortableHdr k="tee"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Tee</SortableHdr>
            <SortableHdr k="sex"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Sexo</SortableHdr>
            <SortableHdr k="dist"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r-num">Dist (m)</SortableHdr>
            <SortableHdr k="par"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r-num">Par</SortableHdr>
            <SortableHdr k="cr"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r-num">CR</SortableHdr>
            <SortableHdr k="slope" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r-num">Slope</SortableHdr>
            <SortableHdr k="crF9"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r-num">CR F9</SortableHdr>
            <SortableHdr k="slF9"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r-num">Sl F9</SortableHdr>
            <SortableHdr k="crB9"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r-num">CR B9</SortableHdr>
            <SortableHdr k="slB9"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r-num">Sl B9</SortableHdr>
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

function CoursePlayersSection({ course, onSelectPlayer }: { course: Course; onSelectPlayer?: (fed: string) => void }) {
  const { players } = useAppContext();
  const [nameMap, setNameMap] = useState<Record<string, string>>(_coursePlayerNames ?? {});

  useEffect(() => {
    let alive = true;
    loadCoursePlayerNames().then((m) => { if (alive) setNameMap(m); });
    return () => { alive = false; };
  }, []);

  const entries = useMemo(() => {
    const raw = course.master._players;
    if (!raw || Object.keys(raw).length === 0) return [];
    return Object.entries(raw)
      .map(([nfed, val]) => {
        const p = players[nfed];
        // Nome SEMPRE: players.json → mapa de federados → (último recurso) número.
        // Ignorar "nomes" placeholder iguais ao próprio nº federado (entradas
        // por preencher em players.json / course-player-names.json).
        const realName = p?.name && p.name !== nfed ? p.name : null;
        const fromMap = nameMap[nfed] && nameMap[nfed] !== nfed ? nameMap[nfed] : null;
        const name = realName ?? fromMap ?? nfed;
        // Retro-compat: formato antigo = string (só data); novo = array de rondas
        const rounds: CoursePlayerRound[] = Array.isArray(val)
          ? val
          : typeof val === "string"
            ? [{ date: val, gross: null, toPar: null, tee: null, event: null, sd: null }]
            : [];
        const latest = rounds.find((r) => r.date)?.date ?? null;
        return { nfed, name, rounds, latest };
      })
      .sort((a, b) => {
        if (a.latest !== b.latest) return (b.latest ?? "").localeCompare(a.latest ?? "");
        return a.name.localeCompare(b.name, "pt");
      });
  }, [course, players, nameMap]);

  if (entries.length === 0) return null;

  /** "2026-02-27" → "27/02/2026"; devolve "" se a data não for ISO. */
  const fmtDMY = (d: string | null) => {
    const m = d && d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
  };

  return (
    <div className="course-players-section">
      <h4 className="course-players-title">Jogadores ({entries.length})</h4>
      <div className="course-players-list">
        {entries.map(({ nfed, name, rounds }) => (
          <div key={nfed} className="course-player-row">
            {onSelectPlayer ? (
              <button
                type="button"
                onClick={() => onSelectPlayer(nfed)}
                className="tourn-pname tourn-pname-link"
              >
                {name}
              </button>
            ) : (
              <a
                href={`/jogadores/${nfed}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tourn-pname tourn-pname-link"
              >
                {name}
              </a>
            )}
            <span className="course-player-results muted">
              {rounds.map((r, i) => {
                const dia = fmtDMY(r.date);
                const score =
                  r.gross != null
                    ? `${r.gross}${r.toPar != null ? ` (${fmtToPar(r.toPar)})` : ""}`
                    : "";
                const label = [dia, score].filter(Boolean).join(": ");
                if (!label) return null;
                return (
                  <span
                    key={i}
                    className="course-player-result"
                    title={[r.event, r.tee, r.sd != null ? `SD ${r.sd}` : null].filter(Boolean).join(" · ")}
                  >
                    {label}
                  </span>
                );
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CamposPage() {
  const { simCourses, tournamentCourses, players } = useAppContext();
  // Base = campos reais + torneios. O filtro de origem decide o que mostrar:
  // por defeito (ALL/PT/INTL) os torneios ficam escondidos; só aparecem em "Torneios".
  const courses = useMemo(
    () => [...simCourses, ...tournamentCourses],
    [simCourses, tournamentCourses]
  );
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
      // Internacional = campos away que NÃO são torneios/organizações
      list = list.filter((c) => c.courseKey.startsWith("away-") && !isTournamentCourse(c.courseKey));
    } else if (originFilter === "TOURN") {
      list = list.filter((c) => isTournamentCourse(c.courseKey));
    } else {
      // ALL: esconde os torneios (só visíveis no separador "Torneios")
      list = list.filter((c) => !isTournamentCourse(c.courseKey));
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
          <option value="TOURN">{"\ud83c\udfc6"} Torneios</option>
        </select>
        {(originFilter === "INTL" || originFilter === "ALL" || originFilter === "TOURN") && (
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
        <Counter ml="auto">{filtered.length} campos</Counter>
        <Counter>{totalTees} tees</Counter>
        {intlCount > 0 && <Counter icon={"\ud83c\udf0d"}>{intlCount} intl</Counter>}
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
              <a
                key={c.courseKey}
                href={`/campos/${c.courseKey}`}
                className={`course-item ${active ? "active" : ""}`}
                onClick={e => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) { e.preventDefault(); selectCourse(c.courseKey); md.onSelect(); } }}
              >
                <div className="course-item-name">
                  {flag && <span className="course-flag">{flag}</span>}
                  <span>{c.master.name}</span>
                  {c.courseKey.startsWith("away-") && <PillBadge pill="INTL" />}
                </div>
                <div className="course-item-meta">
                  {tees.length} tee{tees.length !== 1 ? "s" : ""}
                </div>
              </a>
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
                        <ExtLink href={scorecardLink} className="detail-link">
                          Ver scorecard ↗
                        </ExtLink>
                      </>
                    )}
                    {selected.master.links?.extra?.map((lnk) => (
                      <span key={lnk.url}>
                        {" · "}
                        <ExtLink href={lnk.url} className="detail-link">
                          {lnk.label} ↗
                        </ExtLink>
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
                    <span className="muted fs-11" >
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
