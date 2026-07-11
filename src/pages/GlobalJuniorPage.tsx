/**
 * GlobalJuniorPage.tsx — Global Junior Golf Live (GJGL) Tournament Results
 *
 * Lê `public/data/gjgl-catalog.json` em runtime e, para cada slug com
 * dados scrapados (`public/data/gjgl/gjgl_{slug}.json`), constrói TDef
 * por escalão (U14/U18/U23).
 *
 * Estética inspirada na FPGPage:
 *   • Sidebar master-detail agrupada por ano
 *   • Toolbar com tabs de escalão
 *   • IntlTournView (componente partilhado) por escalão
 *
 * O GJGL só expõe escalões U14, U18, U23. Manuel (12y) compete em U14.
 */
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { cachedFetchJson } from "../data/fetchCache";
import { isManuelByName as isM } from "../constants/manuel";
import ExtLink from "../ui/ExternalLink";
import { gf } from "../utils/flagUtils";
import { fmtToPar } from "../utils/format";
import { tpColor } from "../ui/tournamentPrimitives";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../ui/Toolbar";
import LoadingState from "../ui/LoadingState";
import { ManuelPill } from "../ui/PillBadge";
import { type Tournament as FPGTournament, type Player as FPGPlayer, type RoundScore as FPGRoundScore, type ScorecardOptions } from "./FPGPage";
import { IntlTournView } from "../ui/IntlTournView";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitEntry, CircuitConfig, CircuitDivision, CircuitLink } from "../ui/circuit/types";

/* ── Nome de país (por extenso, vindo do scraper) → ISO-2 ──────────
   O scraper GJGL extrai o país de um comentário HTML embutido na row do
   leaderboard (nome por extenso em inglês). Mapeamos para ISO-2 para
   gerar a bandeira emoji via gf(). Também tolera ISO-3 e "gif:N" legacy. */
const NAME_TO_ISO2: Record<string, string> = {
  Portugal: "PT", Spain: "ES", France: "FR", Germany: "DE", Italy: "IT",
  Netherlands: "NL", Denmark: "DK", Sweden: "SE", Finland: "FI", Iceland: "IS",
  Poland: "PL", Switzerland: "CH", Latvia: "LV", Estonia: "EE",
  Scotland: "GB-SCT", England: "GB-ENG", Wales: "GB-WLS", Ireland: "IE",
  "South Africa": "ZA", UAE: "AE", "United Arab Emirates": "AE",
  Mauritius: "MU", India: "IN", Belgium: "BE", Austria: "AT", Norway: "NO",
  "United States": "US", "United States of America": "US", USA: "US", "United Kingdom": "GB", "Great Britain": "GB",
  "Hong Kong": "HK", China: "CN", Japan: "JP", "South Korea": "KR", Korea: "KR",
  Australia: "AU", Brazil: "BR", Argentina: "AR", Canada: "CA", Mexico: "MX",
  "Czech Republic": "CZ", Czechia: "CZ", Slovakia: "SK", Slovenia: "SI",
  Hungary: "HU", Romania: "RO", Bulgaria: "BG", Greece: "GR", Turkey: "TR",
  Ukraine: "UA", Lithuania: "LT", Luxembourg: "LU", Malta: "MT", Cyprus: "CY",
  Croatia: "HR", Serbia: "RS", Russia: "RU", "Russian Federation": "RU",
  Morocco: "MA", Egypt: "EG", "New Zealand": "NZ", Singapore: "SG",
  Thailand: "TH", Philippines: "PH", Malaysia: "MY", Indonesia: "ID",
  Israel: "IL", "Saudi Arabia": "SA", Qatar: "QA", Bahrain: "BH",
};
// Legacy ISO-3 fallback for any old scraped JSON still using 3-letter codes
const ISO3_TO_ISO2: Record<string, string> = {
  AUT: "AT", BEL: "BE", CHE: "CH", DEU: "DE", DNK: "DK", ESP: "ES",
  EST: "EE", FIN: "FI", FRA: "FR", GBR: "GB", ENG: "GB-ENG", ITA: "IT",
  NLD: "NL", NOR: "NO", POL: "PL", PRT: "PT", SWE: "SE", USA: "US",
  ZAF: "ZA", IND: "IN", MUS: "MU", ARE: "AE",
};
function flagForCountry(country: string | null | undefined): string {
  if (!country) return "";
  if (/^gif:\d+$/.test(country)) return "🏳";
  const iso2 = NAME_TO_ISO2[country] || ISO3_TO_ISO2[country] || (country.length === 2 ? country : "");
  return iso2 ? (gf(iso2) || "🏳") : "🏳";
}

/* ── Types ────────────────────────────────────────────────────────── */
interface CatalogEntry {
  year: number;
  slug: string;
  title: string;
  country: string;
  section: string;
  gjgl_tournamentid?: number;
}
interface Catalog {
  generated_at?: string;
  tournaments: CatalogEntry[];
}
/** Índice slim (gjgl-index.json) — metadados leves p/ sidebar+header sem
 *  descarregar os ficheiros pesados. Gerado por scripts/build-gjgl-index.js. */
interface GjglIndexTournament {
  tournament: string | null;
  year: number | null;
  country: string | null;
  section: string | null;
  start_date: string | null;
  end_date: string | null;
  course: string | null;
  rounds: number | null;
  parTotal: number | null;
  tour_url: string | null;
  livescoring_url: string | null;
  entrylist_url: string | null;
  divisions: { ak: number; ageGroup: string; players: number }[];
  playerCount: number;
  hasManuel?: boolean;
  hasPt?: boolean;
}
interface GjglIndex {
  generated_at?: string;
  tournaments: Record<string, GjglIndexTournament>;
}
interface GjglRound {
  day: number;
  scores: (number | null)[] | null;
  par: (number | null)[] | null;
  gross: number | null;
  parTotal?: number;
}
interface GjglPlayer {
  pos: number | null;
  tiedFlag?: boolean;
  country: string | null;
  countryGif?: string | null;
  gender?: "m" | "f" | null;
  name: string;
  playerKey?: string;
  club?: string | null;
  hcp?: number | null;
  hcpRaw?: string | null;
  gradYear?: number | null;
  birthYearEst?: number | null;
  hole?: number | null;
  toPar?: number | string | null;
  total: number | null;
  ageGroup?: string | null;
  rounds?: GjglRound[];
}
interface GjglDivision {
  ak: number;
  ageGroup: string;
  players: GjglPlayer[];
}
interface GjglData {
  tournament: string;
  slug: string;
  year: number;
  country: string;
  section: string;
  tour_url: string;
  livescoring_url: string;
  gjgl_tournamentid: number;
  start_date: string | null;
  end_date: string | null;
  course?: string | null;
  rounds: number;
  par: number[] | null;
  parTotal: number | null;
  divisions: GjglDivision[];
}

/* ── Overrides de campo/distâncias (eventos jogados em Portugal) ───────
 * O GJGL não publica distâncias; para os eventos PT o
 * build-gjgl-course-overrides.js extrai campo + tee + metros/SI por buraco
 * das voltas WHS dos federados FPG que lá jogaram (por sexo). */
interface GjglTeeOverride { tee: string; metersTotal: number; meters: number[]; si?: number[] }
interface GjglCourseOverride { course: string; evidence: string; note?: string; tees: Partial<Record<"M" | "F", GjglTeeOverride>> }
type GjglOverrides = Record<string, GjglCourseOverride>;

const OVERRIDES_URL = "/data/gjgl-course-overrides.json";
let _gjglOvr: Promise<GjglOverrides> | null = null;
function loadGjglOverrides(): Promise<GjglOverrides> {
  if (!_gjglOvr) {
    _gjglOvr = cachedFetchJson<{ overrides: GjglOverrides }>(OVERRIDES_URL)
      .then((d) => d?.overrides || {})
      .catch(() => ({}));
  }
  return _gjglOvr;
}

/* ── Adapter GjglData → FPGTournament por escalão ─────────────────── */
function divisionToTournament(d: GjglData, div: GjglDivision, label: string, ovr?: GjglCourseOverride | null): FPGTournament {
  const par18: number[] = d.par && d.par.length >= 18 ? (d.par as number[]) : new Array(18).fill(4);
  const parTotal = d.parTotal || par18.reduce((a, b) => a + b, 0);
  const nR = Math.max(...div.players.map(p => (p.rounds || []).length), 0);
  const fpgPlayers: FPGPlayer[] = div.players
    .filter(p => (p.rounds || []).length > 0)
    .map(p => {
      // Tee curado por sexo — só se houver evidência para ESSE sexo (não
      // mostrar metros dos rapazes a uma rapariga).
      const teeOvr = ovr?.tees?.[p.gender === "f" ? "F" : "M"] ?? null;
      const pRounds = p.rounds || [];
      const roundScores: FPGRoundScore[] = pRounds.map((r, ri) => ({
        round: ri + 1,
        gross: r.gross ?? 0,
        scores: (r.scores ?? []).map(x => x ?? 0),
        pars: par18,
        si: teeOvr?.si ?? [],
        meters: teeOvr?.meters ?? [],
        teeName: teeOvr?.tee ?? "Tee",
      }));
      const playedR = pRounds.length;
      const tp = p.total != null && parTotal > 0 ? p.total - parTotal * playedR : null;
      const flag = flagForCountry(p.country);
      const dispCountry = /united states/i.test(p.country || "") ? "USA" : (p.country || "");
      return {
        scoreId: p.playerKey || p.name,
        pos: p.pos,
        name: p.name,
        club: p.country ? `${flag} ${dispCountry}` : "",
        grossTotal: p.total,
        toPar: tp,
        nholes: 18,
        parTotal,
        scores: pRounds[0]?.scores?.map(x => x ?? 0),
        par: par18,
        si: teeOvr?.si,
        meters: teeOvr?.meters,
        teeName: teeOvr?.tee ?? "Tee",
        roundScores,
        _roundsPlayed: playedR,
        hcpExact: p.hcp ?? undefined,
        _isPortuguese: /portugal/i.test(p.country || "") || /^(pt|prt)$/i.test(p.country || ""),
      } as FPGPlayer;
    });
  return {
    name: label,
    tcode: `${d.slug}-u${div.ak}`,
    date: d.start_date || "",
    campo: ovr?.course || d.course || d.country,
    rounds: nR,
    playerCount: fpgPlayers.length,
    players: fpgPlayers,
  };
}

function gjglScorecardOptions(hasTees?: boolean): ScorecardOptions {
  return {
    hideHCP: false,
    hideSD: true,
    hideEsc: true,
    hideFed: true,
    hideTee: !hasTees,
    clubLabel: "País",
  };
}

const CATALOG_URL = "/data/gjgl-catalog.json";
const dataUrl = (slug: string) => `/data/gjgl/gjgl_${slug}.json`;

/** to-par do GJGL pode vir como número OU status (WD/DNS/DQ/NR/NS). Strings
 *  passam tal-qual; números delegam em fmtToPar. */
function gjglTopar(tp: number | string | null | undefined): string {
  if (typeof tp === "string") return tp;
  return fmtToPar(tp);
}
/** Cor só para to-par numérico (status strings ficam sem cor). */
function gjglToparColor(tp: number | string | null | undefined): string | undefined {
  return typeof tp === "number" ? tpColor(tp) : undefined;
}

/* ─────────────────────────────────────────────────────────────────── */

export function GlobalJuniorPageLegacy() {
  const { slug: routeSlug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [activeData, setActiveData] = useState<GjglData | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [loadingActive, setLoadingActive] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await cachedFetchJson<Catalog>(CATALOG_URL);
        if (cancelled) return;
        setCatalog(c);
      } catch (err) {
        if (!cancelled) setCatalogError(String((err as Error).message || err));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const sortedTournaments = useMemo(() => {
    if (!catalog) return [];
    return [...catalog.tournaments].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return a.slug.localeCompare(b.slug);
    });
  }, [catalog]);

  const byYear = useMemo(() => {
    const m = new Map<number, CatalogEntry[]>();
    for (const t of sortedTournaments) {
      if (!m.has(t.year)) m.set(t.year, []);
      m.get(t.year)!.push(t);
    }
    return Array.from(m.entries()).sort((a, b) => b[0] - a[0]);
  }, [sortedTournaments]);

  const selectedSlug = useMemo(() => {
    if (routeSlug && sortedTournaments.some(t => t.slug === routeSlug)) return routeSlug;
    const withData = sortedTournaments.find(t => t.gjgl_tournamentid);
    return withData?.slug || sortedTournaments[0]?.slug || null;
  }, [routeSlug, sortedTournaments]);

  useEffect(() => {
    if (!routeSlug && selectedSlug) {
      navigate(`/global-junior/${selectedSlug}`, { replace: true });
    }
  }, [routeSlug, selectedSlug, navigate]);

  useEffect(() => {
    if (!selectedSlug) return;
    let cancelled = false;
    setLoadingActive(true);
    setActiveError(null);
    setActiveData(null);
    (async () => {
      try {
        const d = await cachedFetchJson<GjglData>(dataUrl(selectedSlug));
        if (cancelled) return;
        setActiveData(d);
      } catch (err) {
        if (!cancelled) setActiveError(String((err as Error).message || err));
      } finally {
        if (!cancelled) setLoadingActive(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSlug]);

  const activeCatalogEntry = useMemo(
    () => sortedTournaments.find(t => t.slug === selectedSlug) || null,
    [sortedTournaments, selectedSlug]
  );

  if (catalogError) {
    return <div className="center-msg" style={{ padding: 24 }}>Erro a carregar catálogo: {catalogError}</div>;
  }
  if (!catalog) {
    return <LoadingState message="A carregar catálogo GJGL…" />;
  }

  return (
    <div className="master-detail">
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="md-sidebar" aria-label="Lista de torneios GJGL" style={{ width: 280, minWidth: 280, borderRight: "1px solid var(--border-subtle)" }}>
          <Toolbar>
            <ToolbarTitle>🌍 Global Junior</ToolbarTitle>
            <ToolbarSep />
            <ToolbarMeta>{sortedTournaments.length} torneios</ToolbarMeta>
            <button onClick={() => setSidebarOpen(false)} style={{ marginLeft: 8, background: "transparent", border: "1px solid var(--border-subtle)", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>‹</button>
          </Toolbar>
          <div style={{ padding: "8px 4px", maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
            {byYear.map(([year, ts]) => (
              <div key={year} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, padding: "4px 10px", color: "var(--text-muted)", fontSize: "var(--fs-12)" }}>
                  {year} ({ts.length})
                </div>
                {ts.map(t => {
                  const isActive = t.slug === selectedSlug;
                  const hasData = !!t.gjgl_tournamentid;
                  return (
                    <button
                      key={t.slug}
                      onClick={() => navigate(`/global-junior/${t.slug}`)}
                      className={`md-sidebar-item ${isActive ? "is-active" : ""}`}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "6px 10px", marginBottom: 2, borderRadius: 4,
                        background: isActive ? "var(--bg-selected, #e5f0ff)" : "transparent",
                        border: "1px solid var(--border-subtle, #e0e0e0)",
                        cursor: "pointer", fontSize: "var(--fs-12)",
                        opacity: hasData ? 1 : 0.55,
                      }}
                      title={hasData ? "" : "Sem dados scrapados ainda"}
                    >
                      <span style={{ marginRight: 6 }}>{flagForCountry(t.country) || "🏳"}</span>
                      <span>{t.title.replace(/\s*\d{4}\s*$/, "")}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Detail */}
      <main className="md-detail" style={{ flex: 1, padding: 16, overflow: "auto" }}>
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} style={{ marginBottom: 12, background: "transparent", border: "1px solid var(--border-subtle)", padding: "4px 10px", borderRadius: 4, cursor: "pointer" }}>
            › Mostrar torneios
          </button>
        )}
        {!activeCatalogEntry && <div className="center-msg" style={{ padding: 24 }}>Selecciona um torneio na barra lateral.</div>}
        {activeCatalogEntry && (
          <>
            <h2 style={{ margin: "0 0 4px 0" }}>
              <span style={{ marginRight: 8 }}>{flagForCountry(activeCatalogEntry.country) || "🏳"}</span>
              {activeCatalogEntry.title}
            </h2>
            <div style={{ fontSize: "var(--fs-12)", color: "var(--text-muted)", marginBottom: 16 }}>
              {activeData?.start_date && (
                <>{activeData.start_date}{activeData.end_date && activeData.end_date !== activeData.start_date ? ` – ${activeData.end_date}` : ""}</>
              )}
              {activeData?.course && <> · {activeData.course}</>}
              {activeData?.tour_url && <> · <ExtLink href={activeData.tour_url}>página oficial</ExtLink></>}
              {activeData?.livescoring_url && <> · <ExtLink href={activeData.livescoring_url}>live scoring</ExtLink></>}
            </div>
            {loadingActive && <LoadingState message="A carregar torneio…" />}
            {activeError && (
              <div className="center-msg" style={{ padding: 24 }}>
                <p>Sem dados scrapados ainda para este torneio.</p>
                <p style={{ fontSize: "var(--fs-12)", color: "var(--text-muted)" }}>
                  Para descarregar: <code>node scripts/scrape-gjgl.js --slug {activeCatalogEntry.slug}</code>
                </p>
              </div>
            )}
            {activeData && !loadingActive && <DivisionTabs data={activeData} />}
          </>
        )}
      </main>
    </div>
  );
}

/* ── Tabs por escalão (U14/U18/U23) ───────────────────────────────── */
function DivisionTabs({ data }: { data: GjglData }) {
  const [activeAk, setActiveAk] = useState<number>(() => {
    const u14 = data.divisions.find(d => d.ak === 14);
    if (u14 && u14.players.some(p => isM(p.name))) return 14;
    return data.divisions[0]?.ak ?? 14;
  });

  const activeDiv = data.divisions.find(d => d.ak === activeAk);

  const tournament = useMemo(
    () => activeDiv ? divisionToTournament(data, activeDiv, `${data.tournament} — U${activeAk}`) : null,
    [data, activeDiv, activeAk]
  );

  const manuelInDiv = useMemo(
    () => activeDiv ? activeDiv.players.find(p => isM(p.name)) : null,
    [activeDiv]
  );

  if (!data.divisions.length) {
    return <div className="center-msg" style={{ padding: 24 }}>Sem divisões scrapadas.</div>;
  }

  return (
    <div>
      <Toolbar>
        {data.divisions.map(div => (
          <button
            key={div.ak}
            onClick={() => setActiveAk(div.ak)}
            className={`tab-under ${div.ak === activeAk ? "active" : ""}`}
            style={{ marginRight: 6 }}
          >
            U{div.ak}
            <span style={{ marginLeft: 6, fontSize: "var(--fs-11)", color: "var(--text-muted)" }}>
              ({div.players.length})
            </span>
          </button>
        ))}
        <ToolbarSep />
        {manuelInDiv && (
          <ToolbarMeta>
            <ManuelPill /> Pos {manuelInDiv.pos ?? "—"} · Total {manuelInDiv.total ?? "—"} ({gjglTopar(manuelInDiv.toPar)})
          </ToolbarMeta>
        )}
      </Toolbar>
      {tournament && (tournament.rounds ?? 0) > 0 ? (
        <IntlTournView tournament={tournament} scOptions={gjglScorecardOptions()} />
      ) : (
        <div style={{ padding: 16 }}>
          <p style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>
            Scorecards hole-by-hole não disponíveis (o scraper actual extrai leaderboard mas
            os scorecards individuais do GJGL precisam de melhorias no parser).
          </p>
          {activeDiv && <SimpleLeaderboard div={activeDiv} />}
        </div>
      )}
    </div>
  );
}

function SimpleLeaderboard({ div }: { div: GjglDivision }) {
  return (
    <table className="dtable">
      <thead>
        <tr>
          <th>Pos</th>
          <th>País</th>
          <th>Nome</th>
          <th className="r">HCP</th>
          <th className="r">Nasc.~</th>
          <th className="r">R1</th>
          <th className="r">R2</th>
          <th className="r">R3</th>
          <th className="r">Total</th>
          <th className="r">vs Par</th>
        </tr>
      </thead>
      <tbody>
        {div.players.map((p, i) => {
          const isManuel = isM(p.name);
          const pos = p.pos != null ? p.pos : (p.tiedFlag ? "T" : "—");
          return (
            <tr key={i} style={{ background: isManuel ? "var(--bg-success-subtle)" : undefined, fontWeight: isManuel ? 700 : undefined }}>
              <td>{pos}</td>
              <td>{flagForCountry(p.country)} {p.country || "—"}</td>
              <td>{p.name}{isManuel && " 🇵🇹"}</td>
              <td className="r">{p.hcpRaw ?? (p.hcp != null ? p.hcp : "—")}</td>
              <td className="r" style={{ color: "var(--text-muted)" }} title={p.gradYear ? `Grad year ${p.gradYear}` : ""}>{p.birthYearEst ?? "—"}</td>
              <td className="r">{(p.rounds || [])[0]?.gross ?? "—"}</td>
              <td className="r">{(p.rounds || [])[1]?.gross ?? "—"}</td>
              <td className="r">{(p.rounds || [])[2]?.gross ?? "—"}</td>
              <td className="r">{p.total ?? "—"}</td>
              <td className="r" style={{ color: gjglToparColor(p.toPar) }}>{gjglTopar(p.toPar)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GlobalJuniorPage (NOVO) — assente no CircuitShell partilhado.
   Carregamento LAZY por torneio (catálogo só tem metadados; o detalhe
   carrega gjgl_{slug}.json ao seleccionar). Divisões U14/U18/U23.
   Quando uma divisão não tem hole-by-hole, usa SimpleLeaderboard via
   `customResults` (fallback de totais). GlobalJuniorPageLegacy preservada.
   ═══════════════════════════════════════════════════════════════ */

/** Carrega o detalhe de um torneio GJGL e constrói as divisões (U14/U18/U23). */
function gjglLoadDivisions(slug: string): Promise<CircuitDivision[]> {
  return Promise.all([cachedFetchJson<GjglData>(dataUrl(slug)), loadGjglOverrides()])
    .then(([d, allOvr]) => {
      if (!d || !d.divisions?.length) return [];
      const ovr = allOvr[slug] ?? null;
      return d.divisions.map((div): CircuitDivision => {
        const tournament = divisionToTournament(d, div, `${d.tournament} — U${div.ak}`, ovr);
        const hasHoleByHole = (tournament.rounds ?? 0) > 0 && tournament.players.length > 0;
        const hasManuel = div.players.some((p) => isM(p.name));
        if (hasHoleByHole) {
          return {
            key: `u${div.ak}`,
            escalao: `U${div.ak}`,
            tabLabel: `U${div.ak}`,
            hasManuel,
            results: tournament,
            scOptions: gjglScorecardOptions(!!ovr),
          };
        }
        return {
          key: `u${div.ak}`,
          escalao: `U${div.ak}`,
          tabLabel: `U${div.ak} (${div.players.length})`,
          hasManuel,
          customResults: <SimpleLeaderboard div={div} />,
        };
      });
    })
    .catch(() => []);
}

/** Catálogo + índice slim → entries do CircuitShell. Metadados (data, campo,
 *  rondas, nº jog, divisões) e links oficiais vêm do índice; o detalhe completo
 *  (scorecards) continua a ser carregado de forma lazy ao seleccionar. */
function buildGjglEntries(catalog: Catalog, index: GjglIndex | null, ovr?: GjglOverrides | null): CircuitEntry[] {
  return catalog.tournaments
    .filter((t) => t.gjgl_tournamentid)
    .map((t): CircuitEntry => {
      const ix = index?.tournaments?.[t.slug];
      const courseOvr = ovr?.[t.slug]?.course;
      const links: CircuitLink[] = [];
      if (ix?.tour_url) links.push({ label: "Página oficial", url: ix.tour_url, icon: "🌐" });
      if (ix?.livescoring_url) links.push({ label: "Live scoring", url: ix.livescoring_url, icon: "📡" });
      if (ix?.entrylist_url) links.push({ label: "Inscritos", url: ix.entrylist_url, icon: "👥" });
      return {
        id: t.slug,
        year: t.year,
        name: `${flagForCountry(t.country) || "🏳"} ${t.title}`.trim(),
        federation: t.country,
        course: courseOvr ?? ix?.course ?? undefined,
        dateStart: ix?.start_date ?? undefined,
        dateEnd: ix?.end_date ?? undefined,
        roundsCount: ix?.rounds ?? undefined,
        divisionCount: ix?.divisions?.length ?? undefined,
        playerCount: ix?.playerCount ?? undefined,
        hasManuel: ix?.hasManuel,
        hasPt: ix?.hasPt,
        links: links.length ? links : undefined,
        loadDivisions: () => gjglLoadDivisions(t.slug),
      };
    });
}

const GJGL_CONFIG: CircuitConfig = {
  routeBase: "/global-junior",
  title: "🏌️ Global Junior",
  color: "var(--color-good-dark)",
  textColor: "#fff",
  grouping: "year",
  filters: { search: true, year: true, toggles: ["manuel", "pt", "top10"] },
  loadingMessage: "A carregar GJGL…",
};

export default function GlobalJuniorPage() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [index, setIndex] = useState<GjglIndex | null>(null);
  const [ovr, setOvr] = useState<GjglOverrides | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    cachedFetchJson<Catalog>(CATALOG_URL)
      .then((c) => { if (!cancelled) setCatalog(c); })
      .catch((err) => { if (!cancelled) setCatalogError(String((err as Error).message || err)); });
    // Índice slim — enriquece a sidebar/header; falha silenciosa (opcional).
    cachedFetchJson<GjglIndex>("/data/gjgl-index.json")
      .then((d) => { if (!cancelled && d) setIndex(d); })
      .catch(() => {});
    // Overrides de campo/distâncias (eventos PT) — falha silenciosa (opcional).
    loadGjglOverrides().then((o) => { if (!cancelled) setOvr(o); });
    return () => { cancelled = true; };
  }, []);

  const entries = useMemo(() => (catalog ? buildGjglEntries(catalog, index, ovr) : []), [catalog, index, ovr]);
  const selectedId = useMemo<string | undefined>(
    () => (slug && entries.some((e) => e.id === slug) ? slug : undefined),
    [slug, entries],
  );

  if (catalogError) {
    return <div className="center-msg" style={{ padding: 24 }}>Erro a carregar catálogo: {catalogError}</div>;
  }
  if (!catalog) {
    return <LoadingState message="A carregar catálogo GJGL…" />;
  }

  return (
    <CircuitShell
      entries={entries}
      config={GJGL_CONFIG}
      selectedId={selectedId}
      onSelectEntry={(e) => navigate(`/global-junior/${e.id}`)}
    />
  );
}
