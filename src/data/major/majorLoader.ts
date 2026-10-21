/**
 * majorLoader.ts — Carregamento dos dados da /major (catálogo + lazy load)
 *
 * A página pede só `major-catalog.json` (gerado por
 * scripts/build-major-catalog.js): a lista sai desse índice e o detalhe de cada
 * torneio só carrega ao clicar (`loadDivisions` do CircuitShell). Antes de
 * 2026-07-06 a página pedia ~127 ficheiros (~14.6 MB, ~48 pedidos 404 por
 * adivinhar anos) no arranque.
 *
 * Aqui ficam os ficheiros de cada fonte e a leitura; quem desenha as divisões
 * (tabs, colunas, módulos ricos) é a MajorPage.
 *
 * Tirado da MajorPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import { cachedFetchJson } from "../fetchCache";
import type { MatchplayFile } from "../../ui/circuit/matchplayTypes";
import { BLUEGOLF_FILES, normalizeBlueGolf, type TDef } from "./bluegolf";
import { DORAL_FILES, normalizeDoralFile, type DoralEntry } from "./doral";
import { jobEntryId, type JobFile } from "./jobFile";

export interface MajorCatalogEntry {
  id: string; source: string; series: string; year: number; name: string;
  course?: string; dateStart?: string; dateEnd?: string; sourceUrl?: string;
  escalao?: string; playerCount?: number; roundsCount?: number; divisionCount?: number;
  hasManuel?: boolean; hasPt?: boolean;
}
export interface MajorCatalog {
  generatedAt: string; total: number;
  veteranIndex: Record<string, number>;
  entries: MajorCatalogEntry[];
}

/* ── BlueGolf (BJGT / EOWAGR / FCG / JWGC) ── */

export type BlueGolfSource = TDef["series"];
export const isBlueGolfSource = (s: string): s is BlueGolfSource =>
  s === "bjgt" || s === "eowagr" || s === "fcg" || s === "jwgc";

/** Escalões de uma série BlueGolf num ano. Traz também o ano-irmão (2025↔2026)
 *  para a evolução ano-a-ano do `bjgtEvoFor` (só compara esses dois anos). */
export async function loadBlueGolfDefs(source: BlueGolfSource, year: number): Promise<TDef[]> {
  const sibling = year === 2025 ? 2026 : year === 2026 ? 2025 : 0;
  const wantYears = new Set([year, sibling].filter(Boolean));
  const urls = BLUEGOLF_FILES.filter((m) => m.series === source && wantYears.has(m.year));
  return (await Promise.all(urls.map(async (m): Promise<TDef | null> => {
    try {
      const raw = await cachedFetchJson<unknown>(m.url);
      if (raw == null) return null;
      return {
        id: m.id, label: m.label, shortLabel: m.shortLabel,
        data: normalizeBlueGolf(raw), manuelName: m.manuelName, year: m.year,
        category: m.category, roundDates: m.roundDates, series: m.series,
      } as TDef;
    } catch { return null; }
  }))).filter((d): d is TDef => d != null);
}

/** URL de origem (BlueGolf) de cada escalão, para os links do header. */
export const BLUEGOLF_SOURCE_URL = new Map<string, string>(BLUEGOLF_FILES.map((m) => [m.id, m.sourceUrl]));

/* ── Doral ── */

const doralYearOf = (u: string) => Number(u.match(/ftm_doral_(\d+)/)?.[1] ?? 0);

/** Divisões do Doral até `year` inclusive: a evolução do Doral (`doralEvoFor`)
 *  olha para TODOS os anos anteriores (os ficheiros ficam em cache). */
export async function loadDoralEntries(year: number): Promise<DoralEntry[]> {
  const files = DORAL_FILES.filter((f) => doralYearOf(f.url) <= year);
  const dorals = await Promise.all(files.map(async ({ url, sourceUrl }) => {
    try {
      const raw = await cachedFetchJson<Parameters<typeof normalizeDoralFile>[0]>(url);
      if (!raw) return [] as DoralEntry[];
      return normalizeDoralFile(raw, sourceUrl);
    } catch {
      return [] as DoralEntry[];
    }
  }));
  return dorals.flat();
}

/* ── Fontes JobFile (GolfGenius / GolfBox) ── */

/** Como a página desenha a fonte:
 *  - "job": Junior Orange Bowl (Rapazes/Raparigas, leaderboard do shell)
 *  - "gg":  TournamentDetail com tabs flat (FM, GolfGenius, GolfBox) */
export interface MajorJobSource {
  layout: "job" | "gg";
  /** Ficheiros a ler para um ano. A evolução (`jobEvoFor`) só precisa do ano
   *  anterior → [ano-1, ano]; nos circuitos multi-etapa, as etapas do ano. */
  files: (y: number) => string[];
  series: string;
  linkLabel?: string;
  showRatings?: boolean;
  showAges?: boolean;
  /** FM: nome da prova na partilha («Future Masters Golf {ano}»), campo por
   *  omissão e escalões por idade crescente. */
  eventName?: string;
  defaultCourse?: string;
  sortByAge?: boolean;
  /** O id ignora `f.stop` (o JOB e o FM nunca o tiveram). */
  noStop?: boolean;
}

const perYear = (name: (y: number) => string) => (y: number) => [y - 1, y].map(name);
const stops = (n: number, name: (k: number, y: number) => string) => (y: number) =>
  Array.from({ length: n }, (_, i) => name(i + 1, y));
const golfbox = { linkLabel: "Livescoring GolfBox", showRatings: true } as const;

export const MAJOR_JOB_SOURCES: Record<string, MajorJobSource> = {
  job: { layout: "job", files: perYear((y) => `/data/orangebowl_${y}.json`), series: "JOB", noStop: true },
  fm: { layout: "gg", files: perYear((y) => `/data/ftm_fm_${y}.json`), series: "FM", noStop: true, eventName: "Future Masters Golf", defaultCourse: "Dothan Country Club", sortByAge: true },
  fsga: { layout: "gg", files: perYear((y) => `/data/fsga_${y}.json`), series: "FSGA" },
  uajt: { layout: "gg", files: perYear((y) => `/data/uajt_${y}.json`), series: "UA" },
  // The Junior Tour (Under Armour) — WORLD Championship. Prova distinta do
  // `uajt` (Summer National Championship) da mesma tour.
  uaworlds: { layout: "gg", files: perYear((y) => `/data/uaworlds_${y}.json`), series: "UA Worlds" },
  mexnacional: { layout: "gg", files: perYear((y) => `/data/mexnacional_${y}.json`), series: "MÉX" },
  // 'Champion of Champions' World Championship (Lough Erne, Irlanda do Norte) —
  // convite mundial de campeões juvenis, Sub-7 a Sub-19 M+F.
  coc: { layout: "gg", files: perYear((y) => `/data/coc_${y}.json`), series: "CoC" },
  reidtrophy: { layout: "gg", files: perYear((y) => `/data/reidtrophy_${y}.json`), series: "Reid Trophy" },
  // The Amundi Evian Juniors Cup (Evian Resort, França) — Sub-14 M+F, seleções
  // nacionais; o tee sheet traz o HCP de cada jogador (coluna HCP do draw).
  // showRatings: todas as edições têm HCP + CR/slope por escalão (cartão de tee
  // do GG; em 2022-24 os cartões WHS dos portugueses) → colunas HCP e SD.
  evianjc: { layout: "gg", files: perYear((y) => `/data/evianjc_${y}.json`), series: "Evian JC", showRatings: true },
  // Faldo Junior Tour Madeira (Santo da Serra) — HCP só dos portugueses (federados FPG).
  faldomadeira: { layout: "gg", files: perYear((y) => `/data/faldomadeira_${y}.json`), series: "Faldo Madeira", showAges: true },
  icopa: { layout: "gg", files: perYear((y) => `/data/icopa_${y}.json`), series: "Bobby Díaz" },
  interzonas: { layout: "gg", files: perYear((y) => `/data/interzonas_${y}.json`), series: "Interzonas" },
  avtrophy: { layout: "gg", files: perYear((y) => `/data/avtrophy_${y}.json`), series: "BEL U14", ...golfbox },
  // EGA European Team Championships (GolfBox) — mesmo formato do avtrophy, com
  // ficheiro de match play irmão (GOLFBOX_MATCHPLAY_SOURCES) → tab "Match Play".
  ebtc2: { layout: "gg", files: perYear((y) => `/data/ebtc2_${y}.json`), series: "ETC Boys", ...golfbox },
  egtc: { layout: "gg", files: perYear((y) => `/data/egtc_${y}.json`), series: "ETC Girls", ...golfbox },
  elg: { layout: "gg", files: perYear((y) => `/data/elg_${y}.json`), series: "ETC Ladies", ...golfbox },
  eatc: { layout: "gg", files: perYear((y) => `/data/eatc_${y}.json`), series: "ETC Men", ...golfbox },
  eatc2: { layout: "gg", files: perYear((y) => `/data/eatc2_${y}.json`), series: "ETC Men 2", ...golfbox },
  // European Young Masters (EGA, GolfBox) — U16, 2M+2F por país; PT tem equipa.
  eym: { layout: "gg", files: perYear((y) => `/data/eym_${y}.json`), series: "Young Masters", ...golfbox },
  // Estonian Junior Open (Estonian Golf Association, GolfBox) — Boys/Girls U12-U21.
  // showAges: o GolfBox traz o ano de nascimento de todos → coluna IDADE.
  ejo: { layout: "gg", files: perYear((y) => `/data/ejo_${y}.json`), series: "EST Jr Open", ...golfbox, showAges: true },
  // Estonian Junior Tour — circuito de etapas (U9-U21), 1 ficheiro por etapa;
  // os ids levam o nº da etapa (f.stop) e a tab "Época" junta as etapas do ano
  // via seasonKey.
  ejt: { layout: "gg", files: stops(8, (n, y) => `/data/ejt${n}_${y}.json`), series: "EST Jr Tour", ...golfbox, showAges: true },
  // Optimist Intl Junior Championship — 3 fases por ano (Phase 1 = Boys 10-13 +
  // Girls 10-12, o escalão do Manuel), ficheiros optimist{1..3}_{ano}.json.
  optimist: { layout: "gg", files: stops(3, (n, y) => `/data/optimist${n}_${y}.json`), series: "Optimist Intl", linkLabel: "GolfGenius" },
};

/** Fontes GolfBox (ETC) que podem ter um ficheiro de MATCH PLAY irmão
 *  ({source}_matchplay_{ano}.json, gerado por scrape-golfbox-matchplay.js) —
 *  a fase knockout de equipas depois da qualificação stroke play. */
const GOLFBOX_MATCHPLAY_SOURCES = new Set(["ebtc2", "egtc", "elg", "eatc", "eatc2", "eym"]);

export interface MajorJobData {
  def: MajorJobSource;
  /** O ficheiro da entrada do catálogo (o seu id = `cat.id`). */
  file: JobFile;
  /** Todos os lidos (o ano anterior entra na evolução). */
  files: JobFile[];
  /** Match play da mesma edição (só fontes ETC com brackets). */
  matchplay?: MatchplayFile;
}

/** Lê os ficheiros de uma fonte JobFile para a entrada do catálogo. `null` se a
 *  fonte não for JobFile ou o ficheiro da entrada não existir. */
export async function loadMajorJobData(cat: MajorCatalogEntry): Promise<MajorJobData | null> {
  const def = MAJOR_JOB_SOURCES[cat.source];
  if (!def) return null;
  const [files, mp] = await Promise.all([
    Promise.all(def.files(cat.year).map((p) => cachedFetchJson<JobFile>(p).catch(() => null)))
      .then((fs) => fs.filter((f): f is JobFile => !!f && Array.isArray(f.divisions))),
    GOLFBOX_MATCHPLAY_SOURCES.has(cat.source)
      ? cachedFetchJson<MatchplayFile>(`/data/${cat.source}_matchplay_${cat.year}.json`).catch(() => null)
      : Promise.resolve(null),
  ]);
  const file = files.find((f) => jobEntryId(cat.source, f, !def.noStop) === cat.id);
  if (!file) return null;
  const okMp = mp && Array.isArray(mp.flights) && mp.flights.length ? mp : undefined;
  // O match play só vale para a edição do próprio ano.
  return { def, file, files, matchplay: okMp && okMp.year === file.year ? okMp : undefined };
}
