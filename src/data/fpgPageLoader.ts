/**
 * fpgPageLoader.ts — Dados da /FPG (FPGPage)
 *
 * Tudo o que a página lê e junta antes de desenhar:
 *   - playersDB: players.json + players-nationality + kids-links + kids-tracked-names
 *   - pull-torneios*.json (em lotes) + Clubes (CLUBES{ano}, clubes_sub_14&18_{ano})
 *     enriquecidos com inscrições/draws do fpg-admissions-draws.json
 *   - Jovens: jovens_{ano}.json + fpg-nacionais-historico.json + torneios em
 *     destaque/só-inscrições injectados a partir do fpg-admissions-draws.json
 *   - PJA: drive-data/aquapor-data mensais + pja-members + pja-pdf-snapshot
 *   - listas derivadas: displayList (dedup), candidatos da vista Jovens, pills
 *
 * Os ficheiros pequenos e só de leitura vão pelo `cachedFetchJson`. Os
 * ficheiros de torneios vão por `fetch`: os objectos são enriquecidos aqui
 * (`_admissions`/`_draws`) e não podem ser os da cache partilhada; os de
 * Clubes pedem `cache: "no-store"` (ver loadClubesFiles).
 *
 * Extraído da FPGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import { useEffect, useState } from "react";
import type { Tournament } from "./fpgTypes";
import type { PlayersDB } from "../ui/tournamentPrimitives";
import type { DataSource } from "../ui/DataSources";
import type { PjaPdfEntry } from "../ui/PJARankingView";
import type { MelhoriasJson } from "./melhoriasTypes";
import { cachedFetchJson } from "./fetchCache";
import { loadFpgPlayersDB } from "./fpgPlayersDB";
import { loadDriveMonthly, type DriveMonthlyPrefix } from "./drive/driveLoader";
import { buildEscLookup, normalizePlayer, type EscLookup } from "../utils/playerUtils";
import {
  loadFpgAdmissionsDraws, indexFpgAdmissionsDraws,
  type FpgTournamentData, type FpgAdmissionsDrawsFile,
} from "./nacional2026Loader";
import { FEATURED_TOURNAMENTS, buildFeaturedSynthetic, inferEscalao, stripEscalaoSuffix } from "./featuredTournaments";
import { loadFpgFilesIndex, fpgFileUrls, pullTorneiosIndexOf } from "./fpgFilesIndex";
import { yearMatchesFilter, type DriveData, type FileMeta, type TournPill } from "../pages/fpg/constants";
import { isDriveOrAquapor, isHiddenNonManuelDrive, tournamentHasManuel, matchesTournamentSearch } from "./fpgUtils";
import { isClubesMatchPlay } from "./clubesFormats";

/* ── Nomes e draws ────────────────────────────────────────────────────── */

/** Nome de torneio normalizado para comparar registos (sem acentos/pontuação). */
export function normTournamentName(s: string | undefined | null): string {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Dois nomes do MESMO torneio? Igual normalizado, ou um contém o outro (a FPG
 *  abrevia: «Drive Chall Tejo-…»). Sem nome de um dos lados → aceitar. */
export function sameTournamentName(a: string | undefined | null, b: string | undefined | null): boolean {
  const x = normTournamentName(a), y = normTournamentName(b);
  if (!x || !y) return true;
  return x === y || x.includes(y) || y.includes(x);
}

/** Objecto de draws com pelo menos uma volta. */
export const hasDraws = (d: unknown) => !!d && typeof d === "object" && Object.keys(d as object).length > 0;

/** Junta ao torneio as inscrições e os draws do fpg-admissions-draws.json.
 *  ⚠ A FPG reutiliza tcodes: o registo só serve se o NOME bater com o do torneio
 *  (13/10/2026 — um «Troféu João Sousa» com o ccode:tcode da Final do Drive
 *  Challenge recebia os inscritos, o draw e o ★Manuel do Jamor).
 *  DRAWS: preferir os embebidos no JSON do torneio (CLUBES{ano}.json, scrapados
 *  por scripts/scrape-clube-draws.js, completos); o fpg-admissions-draws.json
 *  pode ter o torneio com `draws: {}` vazio (só admissions) — nesse caso NÃO
 *  sobrepor os embebidos (era este o bug do regional 2024).
 *  ADMISSIONS: preferir as da FPG (mais completas), senão as embebidas.
 *  Muda o próprio objecto e devolve-o. */
export function enrichAdmDraws(t: Tournament, admIdx: Map<string, FpgTournamentData>): Tournament {
  const adRaw = admIdx.get(`${t.ccode}-${t.tcode}`);
  const ad = adRaw && sameTournamentName(t.name, adRaw.name) ? adRaw : undefined;
  if (hasDraws(t.draws)) t._draws = t.draws;
  else if (hasDraws(ad?.draws)) t._draws = ad!.draws;
  t._admissions = ad?.admissions ?? t.admissions;
  return t;
}

/** fpg-admissions-draws.json (via cachedFetchJson) e o índice `ccode-tcode`. */
async function loadAdmissions(): Promise<{ file: FpgAdmissionsDrawsFile | null; idx: Map<string, FpgTournamentData> }> {
  const file = await loadFpgAdmissionsDraws().catch(() => null);
  return { file, idx: file ? indexFpgAdmissionsDraws(file) : new Map<string, FpgTournamentData>() };
}

/* ── playersDB ────────────────────────────────────────────────────────── */
// `loadFpgPlayersDB` vive em ./fpgPlayersDB (a /drive usa-o também, decisão F).
export { loadFpgPlayersDB };

/** playersDB e o índice de escalões, prontos para a página. */
export function useFpgPlayersDB(): { playersDB: PlayersDB; escLookup: EscLookup } {
  const [state, setState] = useState<{ playersDB: PlayersDB; escLookup: EscLookup }>(
    () => ({ playersDB: {}, escLookup: new Map() }));
  useEffect(() => {
    let alive = true;
    loadFpgPlayersDB().then(pdb => {
      if (alive) setState({ playersDB: pdb, escLookup: buildEscLookup(pdb) });
    });
    return () => { alive = false; };
  }, []);
  return state;
}

/* ── pull-torneios ────────────────────────────────────────────────────── */

/** Lê os pull-torneios{000…}.json que o índice (`fpg-files-index.json`) diz
 *  existirem, em lotes paralelos de 10 — nada de sondar nomes até dar 404. Cada
 *  lote chega a `onBatch` (a sidebar enche-se aos poucos). Os links de
 *  tournament-links.json entram em `links`. */
export async function loadPullTorneios(
  onBatch: (tournaments: Tournament[], meta: FileMeta[]) => void,
  isAlive: () => boolean,
): Promise<{ tournaments: Tournament[]; meta: FileMeta[] } | null> {
  const [externalLinks, filesIndex] = await Promise.all([
    cachedFetchJson<Record<string, Record<string, string>>>("/data/tournament-links.json").catch(() => null),
    loadFpgFilesIndex(),
  ]);
  const urls = fpgFileUrls(filesIndex, "pull-torneios");
  const allT: Tournament[] = [];
  const meta: FileMeta[] = [];
  const PARALLEL_BATCH = 10;
  for (let start = 0; start < urls.length; start += PARALLEL_BATCH) {
    if (!isAlive()) return null;
    const batch = await Promise.all(urls.slice(start, start + PARALLEL_BATCH).map(async (url) => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) return { url, d: null as DriveData | null, err: `HTTP ${resp.status}` };
        return { url, d: await resp.json() as DriveData, err: null };
      } catch (e) {
        return { url, d: null, err: String(e).slice(0, 120) };
      }
    }));
    for (const { url, d, err } of batch) {
      if (!d) {
        console.warn(`[FPGPage] Falhou ${url}: ${err} — a continuar`);
        continue;
      }
      const i = pullTorneiosIndexOf(url);
      const normalised = (d.tournaments || []).map(t => {
        const extLinks = externalLinks?.[String(t.tcode)];
        return { ...t, _sourceFile: url, _sourceIndex: i,
          players: t.players.map(normalizePlayer),
          ...(extLinks ? { links: { ...(t.links || {}), ...extLinks } } : {}) };
      });
      allT.push(...normalised);
      meta.push({ file: url, index: i, lastUpdated: d.lastUpdated, source: d.source, count: normalised.length });
    }
    if (isAlive()) onBatch([...allT], [...meta]);
  }
  return { tournaments: allT, meta };
}

/* ── Clubes ───────────────────────────────────────────────────────────── */

/** Ficheiros de Clubes: juvenis (sub14 + sub18 no mesmo JSON — escalão lido de
 *  `t.escalao`) e não-juvenis (Nacional de Clubes Mid-Amateur, Regional de
 *  Clubes Absoluto) com escFallback "midam" — a vista Grupos auto-constrói as
 *  equipas por clube, mesmo que o JSON não traga `escalao` (ex.: gerado pelo
 *  scrape-classif-node). */
export const CLUBES_FILES: { url: string; year: string; escFallback: string | null }[] = [
  { url: "/data/clubes_sub_14&18_2026.json", year: "2026", escFallback: null },
  { url: "/data/clubes_sub_14&18_2025.json", year: "2025", escFallback: null },
  { url: "/data/clubes_sub_14&18_2024.json", year: "2024", escFallback: null },
  { url: "/data/CLUBES2026.json", year: "2026", escFallback: "midam" },
  { url: "/data/CLUBES2024.json", year: "2024", escFallback: "midam" },
];

export function resolveClubesEsc(escalao: string | null | undefined, fallback: string | null): string {
  if (escalao && /14/i.test(escalao)) return "sub14";
  if (escalao && /18/i.test(escalao)) return "sub18";
  if (escalao && /mid|amateur|absolut|s[eé]nior/i.test(escalao)) return "midam";
  return fallback ?? "sub14";
}

/** Lê os ficheiros de Clubes, marca `_clubesEsc`/`_clubesYear` e deduplica por
 *  tcode (a última ocorrência ganha). */
export async function loadClubesFiles(): Promise<{ tournaments: Tournament[]; meta: DataSource[] }> {
  const meta: DataSource[] = [];
  const results = await Promise.all(CLUBES_FILES.map(async ({ url, year, escFallback }) => {
    try {
      // cache:"no-store" — os ficheiros CLUBES{ano}.json são scrapados/
      // actualizados com frequência (draws, novos torneios). Sem isto, o
      // browser servia a versão antiga em cache e os draws não apareciam.
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        meta.push({ path: url, status: "error", error: `HTTP ${r.status}`, group: "clubes" });
        return [];
      }
      const d: DriveData = await r.json();
      const rows: Tournament[] = (d.tournaments || []).map(t => ({
        ...t,
        series: "clubes" as const,
        _clubesEsc: resolveClubesEsc(t.escalao, escFallback),
        _clubesYear: year,
        _sourceFile: url,
        players: t.players.map(normalizePlayer),
      }));
      meta.push({ path: url, status: "loaded", count: rows.length, source: d.source, lastUpdated: d.lastUpdated, group: "clubes" });
      return rows;
    } catch (e) {
      meta.push({ path: url, status: "error", error: String(e), group: "clubes" });
      return [];
    }
  }));
  const seen = new Map<string, Tournament>();
  for (const t of results.flat()) seen.set(String(t.tcode), t);
  return { tournaments: [...seen.values()], meta };
}

/* ── Loader principal: pull-torneios + Clubes ─────────────────────────── */

export interface FpgMainData {
  /** pull-torneios + Clubes, enriquecidos com inscrições/draws. */
  tournaments: Tournament[];
  fileMeta: FileMeta[];
  loading: boolean;
  error: string | null;
  clubesTournaments: Tournament[];
  clubesLoaded: boolean;
  clubesMeta: DataSource[];
}

/** Carrega os pull-torneios e os Clubes. Os Clubes arrancam logo, em paralelo,
 *  e publicam-se mal tenham inscrições/draws — a vista /FPG/clubes (e o
 *  deep-link ?ct=) não espera pelos pull-torneios. No fim, `tournaments` =
 *  pull-torneios + Clubes, todos enriquecidos (aparecem com draws/pairings nos
 *  tabs STO, PJA, Clubes e Todos). */
export function useFpgMainData(): FpgMainData {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [fileMeta, setFileMeta] = useState<FileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clubesTournaments, setClubesTournaments] = useState<Tournament[]>([]);
  const [clubesLoaded, setClubesLoaded] = useState(false);
  const [clubesMeta, setClubesMeta] = useState<DataSource[]>([]);

  useEffect(() => {
    let alive = true;
    const admP = loadAdmissions();
    const clubesP = (async () => {
      const { tournaments: clubes, meta } = await loadClubesFiles();
      if (alive) setClubesMeta(meta);
      const { idx } = await admP;
      // Só depois de enriquecidos com _draws/_admissions é que se publica o
      // estado dos clubes — evita renderizar primeiro sem draws.
      const enriched = clubes.map(t => enrichAdmDraws(t, idx));
      if (alive) { setClubesTournaments(enriched); setClubesLoaded(true); }
      return enriched;
    })().catch(() => {
      if (alive) setClubesLoaded(true);
      return [] as Tournament[];
    });

    (async () => {
      try {
        const pulled = await loadPullTorneios((ts, meta) => {
          setTournaments(ts);
          setFileMeta(meta);
        }, () => alive);
        if (!pulled || !alive) return;
        if (pulled.tournaments.length === 0) setError("Sem torneios: nenhum pull-torneios*.json no índice /data/fpg-files-index.json");
        const [{ idx }, clubes] = await Promise.all([admP, clubesP]);
        if (alive) {
          setTournaments([...pulled.tournaments.map(t => enrichAdmDraws(t, idx)), ...clubes]);
          setLoading(false);
        }
      } catch {
        // erro inesperado — não mostrar stack trace técnico
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { tournaments, fileMeta, loading, error, clubesTournaments, clubesLoaded, clubesMeta };
}

/* ── Jovens ───────────────────────────────────────────────────────────── */

const JOVENS_FILES = [
  { url: "/data/jovens_2026.json", year: "2026" },
  { url: "/data/jovens_2025.json", year: "2025" },
  { url: "/data/jovens_2024.json", year: "2024" },
  { url: "/data/jovens_2023.json", year: "2023" },
  { url: "/data/jovens_2022.json", year: "2022" },
  { url: "/data/jovens_2020.json", year: "2020" },
  { url: "/data/jovens_2019.json", year: "2019" },
];
/** Histórico dos Campeonatos Nacionais Jovens (2005-2026) — o mesmo ficheiro
 *  que alimenta a TitulosPage e a NacionaisJovensPage. Entra para os Nacionais
 *  históricos aparecerem na sidebar de /FPG/jovens (anos pré-2019 não estão em
 *  jovens_YYYY.json). Tcodes repetidos perdem para a entrada de jovens_YYYY. */
const HISTORICO_URL = "/data/fpg-nacionais-historico.json";

/** Nome de um torneio jovem nas inscrições (para injectar os só-inscrições). */
const ADM_JOVEM_RE = /\b(juniors?|júniors?|juvenil|juvenis|sub[\s\-_]?\d{1,2}|u\d{1,2}|jovens?)\b/i;

/**
 * Junta os torneios jovens lidos dos ficheiros com o fpg-admissions-draws.json:
 *  1) dedup por ccode/tcode (o primeiro ganha) + inscrições/draws quando há registo
 *  2) torneios em destaque (FEATURED_TOURNAMENTS — Nacional 2026 Aroeira,
 *     Amendoeira 2026, …) como sintéticos, se ainda não existirem e houver scrape.
 *     Entradas de séries Drive (tour/challenge/aquapor) são da DrivePage.
 *  3) outros torneios jovens só com inscrições (detectados pelo nome) — aparecem
 *     em /FPG/jovens logo que tenham inscrições scrapadas.
 */
export function mergeJovensWithAdmissions(rows: Tournament[], admIdx: Map<string, FpgTournamentData>): Tournament[] {
  const seen = new Map<string, Tournament>();
  for (const t of rows) {
    const key = t.ccode + "/" + String(t.tcode);
    if (seen.has(key)) continue;
    const ad = admIdx.get(`${t.ccode}-${t.tcode}`);
    if (ad) {
      t._admissions = ad.admissions;
      t._draws = ad.draws;
    }
    seen.set(key, t);
  }
  for (const ft of FEATURED_TOURNAMENTS) {
    if ((ft.series ?? "jovens") !== "jovens") continue;  // Drive → DrivePage
    const key = ft.ccode + "/" + ft.tcode;
    if (seen.has(key)) continue;
    const ad = admIdx.get(`${ft.ccode}-${ft.tcode}`);
    if (!ad) continue;  // sem dados scraped, não injecta
    const date = ft.date || ad.date || "";
    const synthetic = {
      ...buildFeaturedSynthetic(ft, ad),
      _jovensYear: date.substring(0, 4) || String(new Date().getFullYear()),
    } as unknown as Tournament;
    seen.set(key, synthetic);
  }
  const stripDia = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [, ad] of admIdx) {
    const tournKey = `${ad.ccode}/${ad.tcode}`;
    if (seen.has(tournKey)) continue;
    const playerCount = ad.admissions?.totalInscritos ?? (ad.admissions?.players?.length ?? 0);
    if (playerCount === 0) continue;
    if (!ADM_JOVEM_RE.test(stripDia(ad.name || ""))) continue;
    const year = ad.date?.substring(0, 4) || String(new Date().getFullYear());
    const baseName = stripEscalaoSuffix(ad.name || "") || `Torneio ${ad.tcode}`;
    seen.set(tournKey, {
      name: baseName,
      ccode: ad.ccode,
      tcode: String(ad.tcode),
      date: ad.date || "",
      campo: ad.campo || null,
      clube: ad.ccode,
      circuit: "tour",
      series: "jovens",
      region: null,
      escalao: inferEscalao(ad.name || ""),
      num: 1,
      rounds: (ad.admissions as { rounds?: number } | undefined)?.rounds ?? 1,
      playerCount,
      players: [],
      _jovensYear: year,
      _sourceFile: "fpg-admissions-draws.json",
      _admissions: ad.admissions,
      _draws: ad.draws,
    } as unknown as Tournament);
  }
  return [...seen.values()];
}

export interface FpgJovensData {
  jovensTournaments: Tournament[];
  jovensLoaded: boolean;
  jovensMeta: DataSource[];
  admissionsMeta: DataSource[];
}

/** Jovens (arranca no mount, para aparecerem também em "Todos"). */
export function useFpgJovensData(): FpgJovensData {
  const [state, setState] = useState<FpgJovensData>({
    jovensTournaments: [], jovensLoaded: false, jovensMeta: [], admissionsMeta: [],
  });
  useEffect(() => {
    let alive = true;
    const meta: DataSource[] = [];
    const loadYear = async ({ url, year }: { url: string; year: string }): Promise<Tournament[]> => {
      try {
        const r = await fetch(url);
        if (!r.ok) {
          meta.push({ path: url, status: "error", error: `HTTP ${r.status}`, group: "jovens" });
          return [];
        }
        const d: DriveData = await r.json();
        const rows = (d.tournaments || []).map(t => ({
          ...t, _jovensYear: year, _sourceFile: url,
          players: t.players.map(normalizePlayer),
        }));
        meta.push({ path: url, status: "loaded", count: rows.length, source: d.source, lastUpdated: d.lastUpdated, group: "jovens" });
        return rows;
      } catch (e) {
        meta.push({ path: url, status: "error", error: String(e), group: "jovens" });
        return [];
      }
    };
    // Histórico: mesma forma que os jovens_YYYY, mas cobre 2005-2026 (incluindo
    // Drive Tour Finals e Sub-10/12 2025 Santo Estevão ccode=988). Sem os
    // "de Clubes" (têm tab própria). Quando traz admissions/draws (Nacional
    // Jovens 2026), passam a _admissions/_draws para as tabs Inscrições/Pairings.
    const loadHistorico = async (): Promise<Tournament[]> => {
      try {
        const r = await fetch(HISTORICO_URL);
        if (!r.ok) {
          meta.push({ path: HISTORICO_URL, status: "error", error: `HTTP ${r.status}`, group: "jovens" });
          return [];
        }
        const d = await r.json() as DriveData;
        const rows = (d.tournaments || [])
          .filter(t => !/de\s+clubes/i.test(t.name || ""))
          .map(t => ({
            ...t,
            _jovensYear: (t.date || "").substring(0, 4),
            _sourceFile: HISTORICO_URL,
            players: (t.players || []).map(normalizePlayer),
            ...(t.admissions ? { _admissions: t.admissions } : {}),
            ...(t.draws ? { _draws: t.draws } : {}),
          }));
        meta.push({ path: HISTORICO_URL, status: "loaded", count: rows.length, source: d.source, lastUpdated: d.lastUpdated, group: "jovens" });
        return rows;
      } catch (e) {
        meta.push({ path: HISTORICO_URL, status: "error", error: String(e), group: "jovens" });
        return [];
      }
    };
    Promise.all([
      Promise.all(JOVENS_FILES.map(loadYear)),
      loadHistorico(),
      loadAdmissions(),
    ]).then(([years, historico, adm]) => {
      if (!alive) return;
      const admissionsMeta: DataSource[] = [{
        path: "/data/fpg-admissions-draws.json",
        status: adm.file ? "loaded" : "error",
        count: adm.file ? (adm.file.tournaments?.length || 0) : undefined,
        source: adm.file?.source,
        lastUpdated: adm.file?.scrapedAt ?? undefined,
        group: "admissions",
      }];
      setState({
        jovensTournaments: mergeJovensWithAdmissions([...years.flat(), ...historico], adm.idx),
        jovensLoaded: true,
        jovensMeta: meta,
        admissionsMeta,
      });
    });
    return () => { alive = false; };
  }, []);
  return state;
}

/* ── PJA (Drive Tour + Aquapor mensais) ───────────────────────────────── */

/** drive-data/aquapor-data desde `startYear` (src/data/drive/driveLoader.ts). */
async function loadMonthly(prefix: DriveMonthlyPrefix, startYear: number): Promise<Tournament[]> {
  return (await loadDriveMonthly(prefix, { fromYear: startYear })).tournaments;
}

/** Objecto `{ ano: [...] }` sem as chaves `_…` e só com os valores em lista. */
async function loadYearLists<T>(url: string, mapItem: (v: unknown) => T): Promise<Record<string, T[]>> {
  try {
    const d = await cachedFetchJson<Record<string, unknown>>(url);
    const out: Record<string, T[]> = {};
    for (const [k, v] of Object.entries(d ?? {})) {
      if (k.startsWith("_")) continue;
      if (Array.isArray(v)) out[k] = v.map(mapItem);
    }
    return out;
  } catch { return {}; }
}

export interface FpgPjaExtra {
  /** Drive Tour + Aquapor mensais — só para o Ranking PJA e para reencaminhar
   *  deep-links /FPG/torneio/ de drives para a /drive. Não entram no displayList. */
  pjaExtraTournaments: Tournament[];
  pjaExtraReady: boolean;
  /** fedCodes inscritos no circuito PJA por ano (pja-members.json). */
  pjaMembers: Record<string, string[]>;
  /** Snapshot do PDF oficial PJA, para a tabela mostrar Δ pts / Δ rondas. */
  pjaPdfSnapshot: Record<string, PjaPdfEntry[]>;
}

/** Carregado SEMPRE (não só no tab Ranking PJA): deep-links em nova aba para
 *  `/FPG/torneio/{ccode}-{tcode}` de um Drive Tour ou Aquapor precisam dele. */
export function useFpgPjaExtra(): FpgPjaExtra {
  const [state, setState] = useState<FpgPjaExtra>({
    pjaExtraTournaments: [], pjaExtraReady: false, pjaMembers: {}, pjaPdfSnapshot: {},
  });
  useEffect(() => {
    let alive = true;
    Promise.all([
      loadMonthly("drive-data", 2026),
      loadMonthly("aquapor-data", 2026),
      loadYearLists("/data/pja-members.json", v => String(v)),
      loadYearLists("/data/pja-pdf-snapshot.json", v => v as PjaPdfEntry),
    ]).then(([drive, aq, members, pdfSnap]) => {
      if (!alive) return;
      // Sem buildDisplayList: drive-data é single-round por design e o aquapor
      // já vem como entrada única multi-round.
      setState({ pjaExtraTournaments: [...drive, ...aq], pjaExtraReady: true, pjaMembers: members, pjaPdfSnapshot: pdfSnap });
    });
    return () => { alive = false; };
  }, []);
  return state;
}

/* ── Listas derivadas ─────────────────────────────────────────────────── */

/** Nº de rondas com scorecard — entre duas versões do mesmo torneio, ganha a
 *  mais completa (⚠ Amendoeira World Kids 2026: um scrape parcial de 2 rondas
 *  ficou em pull-torneios002.json e o final de 3 em ...006.json). */
const roundCount = (t: Tournament) =>
  Math.max(0, ...(t.players || []).map(p => p.roundScores?.length ?? 0));

/**
 * Lista unificada que alimenta o tab "Todos" (antes do `buildDisplayList`):
 *  - tournaments (pull-torneios + clubes) — UMA entrada por ccode/tcode, a mais completa
 *  - jovensTournaments — só se o ccode/tcode for novo; se já existir, enxerta
 *    inscrições/draws/extraLinks que só a versão jovem traz (Miramar U25/Sub-10
 *    2026; os links do clube DESAPARECIAM assim que saíam os primeiros resultados)
 *  - o mesmo torneio com ccode/tcode diferentes (nome + data + campo iguais) →
 *    UMA entrada, com os jogadores da versão mais completa e as inscrições/draws
 *    de quem os tiver (13/10/2026 — Troféu João Sousa em duplicado)
 *  - sem os drives sem Manuel (vivem na /drive; chegam aqui via admissions)
 */
export function dedupDisplayTournaments(tournaments: Tournament[], jovensTournaments: Tournament[]): Tournament[] {
  const dedupMap = new Map<string, Tournament>();
  const keyOf = (t: Tournament) => (t.ccode || "?") + "/" + String(t.tcode ?? "?");
  for (const t of tournaments) {
    const k = keyOf(t);
    const ex = dedupMap.get(k);
    if (!ex || roundCount(t) > roundCount(ex)) dedupMap.set(k, t);
  }
  for (const j of jovensTournaments) {
    const k = keyOf(j);
    const ex = dedupMap.get(k);
    if (!ex) { dedupMap.set(k, j); continue; }
    if ((!ex._admissions && j._admissions)
        || (!ex._draws && j._draws)
        || (!ex.extraLinks?.length && j.extraLinks?.length)) {
      dedupMap.set(k, {
        ...ex,
        _admissions: ex._admissions ?? j._admissions,
        _draws: ex._draws ?? j._draws,
        extraLinks: ex.extraLinks?.length ? ex.extraLinks : j.extraLinks,
      });
    }
  }
  const byIdentity = new Map<string, Tournament>();
  for (const t of dedupMap.values()) {
    const id = `${normTournamentName(t.name)}|${t.date || ""}|${normTournamentName(t.campo || "")}`;
    const ex = byIdentity.get(id);
    if (!ex) { byIdentity.set(id, t); continue; }
    const [main, other] = roundCount(t) > roundCount(ex) || (t.players?.length ?? 0) > (ex.players?.length ?? 0) ? [t, ex] : [ex, t];
    byIdentity.set(id, {
      ...main,
      _admissions: main._admissions ?? other._admissions,
      _draws: hasDraws(main._draws) ? main._draws : other._draws,
      extraLinks: main.extraLinks?.length ? main.extraLinks : other.extraLinks,
      _mergedFrom: `${other.ccode}-${other.tcode}`,
    });
  }
  return [...byIdentity.values()].filter(t => !isHiddenNonManuelDrive(t));
}

/** Regex de detecção de torneios juvenis pelo nome: junior(s)/júnior, juvenil,
 *  jovens, subN, UN (U10…U21), escola/estagio/academia (contexto juvenil). */
const JOVEM_NAME_RE = /\b(juniors?|júniors?|juvenil|juvenis|jovens?|sub[\s-]?\d{1,2}|u\d{1,2}|escola|estagio|academia)\b/i;

/**
 * Torneios do tab JOVENS:
 *   1. jovensTournaments — Nacionais Jovens + sintéticos (primeira ocorrência ganha)
 *   2. torneios juvenis de outras fontes, pelo nome (Vila Sol Junior, GJG Junior
 *      Classics, Academia Junior, CityKids…). PJA e Greatgolf têm tab próprio.
 * Um torneio FEATURED já jogado entra como sintético (players:[], só
 * inscrições/draws) E com os resultados reais: ganha o que tem resultados e,
 * entre duas versões reais, a com mais rondas — herdando inscrições/draws/links.
 */
export function jovensCandidates(jovensTournaments: Tournament[], tournaments: Tournament[]): Tournament[] {
  const dedupMap = new Map<string, Tournament>();
  const keyOf = (t: Tournament) => (t.ccode || "") + "/" + String(t.tcode || "");
  const hasResults = (t: Tournament) =>
    (t.players || []).some(p => (p.roundScores?.length ?? 0) > 0 || p.grossTotal != null);
  for (const j of jovensTournaments) {
    const k = keyOf(j);
    if (!dedupMap.has(k)) dedupMap.set(k, j);
  }
  const stripAcc = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const t of tournaments) {
    const cleanName = stripAcc(t.name || "");
    // "kids" pode vir colado ao nome do clube ("CityKids") — teste à parte.
    if (!JOVEM_NAME_RE.test(cleanName) && !/kids/i.test(cleanName)) continue;
    // Falsos positivos de "academia": "Academia Militar" não é juvenil.
    if (/academia\s+militar/i.test(cleanName)) continue;
    if (/PJA/i.test(t.name || "")) continue;                // já em tab PJA
    if (/greatgolf.*junior/i.test(t.name || "")) continue;  // já em tab PJA (excepção)
    const k = keyOf(t);
    const existing = dedupMap.get(k);
    if (!existing) { dedupMap.set(k, t); continue; }
    if ((hasResults(t) && !hasResults(existing)) || roundCount(t) > roundCount(existing)) {
      dedupMap.set(k, {
        ...t,
        _admissions: existing._admissions ?? t._admissions,
        _draws: existing._draws ?? t._draws,
        extraLinks: existing.extraLinks ?? t.extraLinks,
      });
    }
  }
  return [...dedupMap.values()];
}

/** Filtros da vista Jovens: sem Drive/Aquapor (página /drive), sem clubes em
 *  match play (/FPG/clubes), ★Manuel (também pré-jogo: inscrições/draws), ano
 *  e pesquisa (termo já normalizado). */
export function selectJovens(
  list: Tournament[],
  opts: { filterManuel: boolean; yearFilter: string | null; searchTerm: string },
): Tournament[] {
  return list
    .filter(t => !isDriveOrAquapor(t))
    .filter(t => !isClubesMatchPlay(t))
    .filter(t => !opts.filterManuel || tournamentHasManuel(t))
    .filter(t => yearMatchesFilter(t._jovensYear ?? t.date?.substring(0, 4), opts.yearFilter))
    .filter(t => matchesTournamentSearch(t, opts.searchTerm));
}

/** Pill de torneio (REGIONAL, NACIONAL…) por tcode, a partir das entradas do
 *  melhorias.json que têm `pill` — todos os tcodes dos links dessa entrada
 *  (ex.: classificacao_d1 + classificacao_d2). */
export function buildTcodePills(melhorias: MelhoriasJson): Record<string, TournPill> {
  const pills: Record<string, TournPill> = {};
  for (const playerData of Object.values(melhorias)) {
    if (typeof playerData !== "object" || !playerData) continue;
    for (const raw of Object.values(playerData)) {
      if (typeof raw !== "object" || !raw || Array.isArray(raw)) continue;
      const entry = raw as { pill?: TournPill; links?: Record<string, unknown> };
      if (!entry.pill) continue;
      for (const v of Object.values(entry.links || {})) {
        const match = String(v).match(/tcode=(\d+)/);
        if (match) pills[match[1]] = entry.pill;
      }
    }
  }
  return pills;
}
