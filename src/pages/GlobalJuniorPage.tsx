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
import { withDivisionModel } from "../data/model/division";
import TotalsResumo from "../ui/circuit/TotalsResumo";
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { cachedFetchJson } from "../data/fetchCache";
import { isManuelByName as isM } from "../constants/manuel";
import { gf } from "../utils/flagUtils";
import LoadingState from "../ui/LoadingState";
import { type Tournament as FPGTournament, type ScorecardOptions } from "./FPGPage";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitEntry, CircuitConfig, CircuitDivision, CircuitLink } from "../ui/circuit/types";
import { tournamentFamilyKey } from "../ui/circuit/pastEditions";
import { intlScorecardOptions } from "../data/intlScorecard";
import { buildFPGTournament, type IntlPlayerIn } from "../data/intlTournament";

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
  // Sem par por buraco → sem par (nunca 4 inventado); o ±par é o da fonte.
  const par18: number[] = d.par && d.par.length >= 18 ? (d.par as number[]) : [];
  return buildFPGTournament(
    { name: label, tcode: `${d.slug}-u${div.ak}`, date: d.start_date || "", campo: ovr?.course || d.course || d.country },
    { par: par18, teeName: "Tee", holes: 18, parTotal: par18.length ? undefined : null },
    div.players.map((p): IntlPlayerIn => {
      // Tee curado por sexo — só se houver evidência para ESSE sexo (não
      // mostrar metros dos rapazes a uma rapariga).
      const teeOvr = ovr?.tees?.[p.gender === "f" ? "F" : "M"] ?? null;
      const dispCountry = /united states/i.test(p.country || "") ? "USA" : (p.country || "");
      return {
        id: p.playerKey || p.name, name: p.name, pos: p.pos,
        club: p.country ? `${flagForCountry(p.country)} ${dispCountry}` : "",
        country: p.country, total: p.total, hcp: p.hcp, rounds: p.rounds || [],
        ...(par18.length ? {} : { toPar: typeof p.toPar === "number" ? p.toPar : null }),
        wd: false,
        course: teeOvr ? { si: teeOvr.si, meters: teeOvr.meters, teeName: teeOvr.tee ?? "Tee" } : undefined,
      };
    }),
  );
}

function gjglScorecardOptions(hasTees?: boolean): ScorecardOptions {
  return intlScorecardOptions({ hideHCP: false, hideTee: !hasTees });
}

const CATALOG_URL = "/data/gjgl-catalog.json";
const dataUrl = (slug: string) => `/data/gjgl/gjgl_${slug}.json`;

/** Divisão GJGL sem buraco a buraco → o Resumo comum (TotalsResumo). O par de
 *  uma volta tira-se de quem tem total e ±par numéricos. */
function gjglTotais(div: GjglDivision) {
  const ref = div.players.find((p) => typeof p.toPar === "number" && p.total != null && (p.rounds || []).some((r) => r?.gross));
  const nR = ref ? (ref.rounds || []).filter((r) => r?.gross).length : 0;
  const parPerRound = ref && nR ? Math.round((ref.total! - (ref.toPar as number)) / nR) : null;
  const players = div.players.map((p) => ({ name: p.name, country: p.country, club: p.club ?? null,
    hcp: p.hcp ?? null, birthYear: p.birthYearEst ?? null, pos: p.pos,
    rounds: (p.rounds || []).map((r) => r?.gross ?? null), total: p.total }));
  return { players, parPerRound };
}
function GjglTotals({ div }: { div: GjglDivision }) {
  const { players, parPerRound } = gjglTotais(div);
  return <TotalsResumo parPerRound={parPerRound} players={players} />;
}

/* ═══════════════════════════════════════════════════════════════
   GlobalJuniorPage (NOVO) — assente no CircuitShell partilhado.
   Carregamento LAZY por torneio (catálogo só tem metadados; o detalhe
   carrega gjgl_{slug}.json ao seleccionar). Divisões U14/U18/U23.
   Quando uma divisão não tem hole-by-hole, usa o Resumo de totais via
   `customResults` (GjglTotals).
   ═══════════════════════════════════════════════════════════════ */

/** Carrega o detalhe de um torneio GJGL e constrói as divisões (U14/U18/U23). */
function gjglLoadDivisions(slug: string): Promise<CircuitDivision[]> {
  return Promise.all([cachedFetchJson<GjglData>(dataUrl(slug)), loadGjglOverrides()])
    .then(([d, allOvr]) => {
      if (!d || !d.divisions?.length) return [];
      const ovr = allOvr[slug] ?? null;
      return d.divisions.map((div): CircuitDivision => withDivisionModel(((): CircuitDivision => {
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
          // Resumo comum das fontes só com totais (14/10/2026).
          customResults: <GjglTotals div={div} />,
          totals: gjglTotais(div),
        };
      })()));
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
  // "Edições anteriores": família pelo nome (sem bandeira/ano) — agrupa a mesma
  // prova GJGL ano-a-ano.
  editionKey: (e) => tournamentFamilyKey(e.name),
  loadingMessage: "A carregar GJGL…",
};

export default function GlobalJuniorPage() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  // undefined = a carregar · null = falhou. O shell só arranca depois: as DATAS
  // vêm do índice e, sem elas, o torneio por omissão (o mais recente) saía
  // errado e ficava no URL (abria o UAE de Fevereiro — 14/10/2026).
  const [index, setIndex] = useState<GjglIndex | null | undefined>(undefined);
  const [ovr, setOvr] = useState<GjglOverrides | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    cachedFetchJson<Catalog>(CATALOG_URL)
      .then((c) => { if (!cancelled) setCatalog(c); })
      .catch((err) => { if (!cancelled) setCatalogError(String((err as Error).message || err)); });
    // Índice slim — enriquece a sidebar/header; falha silenciosa (opcional).
    cachedFetchJson<GjglIndex>("/data/gjgl-index.json")
      .then((d) => { if (!cancelled) setIndex(d ?? null); })
      .catch(() => { if (!cancelled) setIndex(null); });
    // Overrides de campo/distâncias (eventos PT) — falha silenciosa (opcional).
    loadGjglOverrides().then((o) => { if (!cancelled) setOvr(o); });
    return () => { cancelled = true; };
  }, []);

  const entries = useMemo(() => (catalog && index !== undefined ? buildGjglEntries(catalog, index, ovr) : []), [catalog, index, ovr]);
  const selectedId = useMemo<string | undefined>(
    () => (slug && entries.some((e) => e.id === slug) ? slug : undefined),
    [slug, entries],
  );

  if (catalogError) {
    return <div className="center-msg p-24">Erro a carregar catálogo: {catalogError}</div>;
  }
  if (!catalog || index === undefined) {
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
