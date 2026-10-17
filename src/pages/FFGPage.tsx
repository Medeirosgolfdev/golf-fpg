/**
 * FFGPage.tsx — 🇫🇷 FFGolf · Torneios juvenis franceses
 *
 * Carrega o catálogo `public/data/ffgolf-catalog.json` (lista de torneios
 * mapeados) e, para cada um, tenta `public/data/ffgolf/{year}_{slug}.json`
 * (gerado pelo scraper).
 *
 * ⚠ Proveniência dos dados de campo: os metros/SI só existem quando a fonte
 * os publica (rota Playwright, ou override do cartão oficial). A rota fetch
 * (v2tournaments) NÃO os expõe, e nesses ficheiros o PAR vem INFERIDO dos
 * marcadores do scorecard (`course.parSource`) — pode divergir do oficial.
 * Nada é preenchido por adivinhação: sem fonte, o campo fica vazio.
 *
 * Fontes na lista: `ffgres` (portal FFG), `gg` (GolfGenius, sem gémeo no
 * portal) e `lgpidf`. Match play (knockout) é excluído no scrape.
 */
import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cachedFetchJson, invalidateCache } from "../data/fetchCache";
import { isManuelByName as isM } from "../constants/manuel";

/** Lista de excepções de jogadores portugueses cuja nacionalidade no portal FFG
 *  está marcada como FRA (porque jogam num clube francês) mas que sabemos serem
 *  portugueses. Comparação feita por nome normalizado (sem acentos, lowercase),
 *  match em qualquer ordem das palavras (apelido pode vir 1º).
 *
 *  Para adicionar: incluir o nome conforme aparece nos dados, ou em qualquer ordem
 *  desde que todas as palavras estejam presentes na string normalizada.
 *  A lista vive em `utils/ptPlayers` — partilhada com o MatchplayView, senão o
 *  jogador perdia o destaque na aba Match Play da mesma página. */
import { isPT } from "../utils/ptPlayers";
import ExtLink from "../ui/ExternalLink";
import { gf, normPaisDisplay } from "../utils/flagUtils";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import DetailHeader from "../ui/DetailHeader";
import LoadingState from "../ui/LoadingState";
import { type Tournament as FPGTournament, type Player as FPGPlayer, type RoundScore as FPGRoundScore, type ScorecardOptions } from "./FPGPage";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitEntry, CircuitConfig, CircuitDivision, CircuitLink, CircuitSpecialItem } from "../ui/circuit/types";
import { tournamentFamilyKey } from "../ui/circuit/pastEditions";
import type { MatchplayFile, MatchplayRound, MatchplayTeamMatch } from "../ui/circuit/matchplayTypes";
import { FFGPlayersView } from "./ffg/PlayersView";
import DrawTab from "../ui/DrawTab";
import type { FpgDraw, FpgDrawFlight, FpgAdmissions, FpgAdmissionPlayer } from "../data/nacional2026Loader";
import TotalsResumo from "../ui/circuit/TotalsResumo";
import { ffgEscalaoCanonico } from "../utils/ffgEscalao";
import { intlScorecardOptions } from "../data/intlScorecard";

/* ── Tipos do ficheiro novo (1 torneio = 1 ficheiro) ──────────── */
interface CourseInfo {
  name: string;
  tee?: string;
  par: number[];
  meters: number[];
  si: number[];
  parTotal: number;
  metersTotal: number;
}
interface PlayerRound {
  round: number;
  gross: number;
  scores: number[];
  f9?: number;
  b9?: number;
}
interface FFGPlayer {
  id: string;
  pos: number | null;
  name: string;
  country: string;
  club: string;
  hcp: number | null;
  total: number | null;
  toPar: number | null;
  roundScores?: number[];   // novo formato genérico [r1, r2, ..., rN]
  /** legacy: alguns ficheiros antigos têm r1/r2 directos */
  r1?: number | null;
  r2?: number | null;
  rounds: PlayerRound[];
}
interface FFGTournament {
  tournament: string;
  slug: string;
  year: number;
  section: string;
  source: string;
  gg_page: string;
  gg_league?: string;
  course: CourseInfo;
  rounds: number;
  format: string;
  /** Nomes das divisões do torneio (o scraper emite-os; ficheiros antigos não têm). */
  divisions?: string[];
  /** Datas do evento, derivadas das rondas. Ficheiros antigos não as têm. */
  dateStart?: string | null;
  dateEnd?: string | null;
  /** Tee sheet do GolfGenius (scrape-ffgolf-gg-teesheet.js). */
  draws?: FFGDrawRound[];
  players: FFGPlayer[];
  /** Vista por evento do dropdown GG (scrape-ffgolf.js rota Playwright). Nos
   *  eventos match play, `players` são os VENCEDORES dessa eliminatória. */
  events?: Array<{ id?: string; name: string; format: string; players?: Array<{ name: string }> }>;
  /** Bracket knockout completo (scrape-ffgolf.js — fetchBracket), já no schema
   *  MatchplayFile: winners, resultados ("2 & 1") e estado buraco-a-buraco. */
  matchplay?: MatchplayFile;
  scrapedAt?: string;
}

interface FFGDrawPlayer {
  name: string;
  hcp: number | null;
  club: string | null;
  tee: string | null;
}
interface FFGDrawGroup {
  teeTime: string;
  players: FFGDrawPlayer[];
}
interface FFGDrawRound {
  round: number;
  label: string | null;
  dateIso: string | null;
  course: string | null;
  tee: string | null;
  groups: FFGDrawGroup[];
}

interface CatalogEntry {
  year: number;
  section: string;
  slug: string;
  /** Pode faltar em entradas descobertas sem página de scores — ver entryTitle(). */
  title?: string;
  gg_page: string | null;
  gg_league: string | null;
  ffgolf_url?: string;
  ffgolf_scores_url?: string;
}
interface Catalog {
  generated_at: string;
  source?: string;
  note?: string;
  tournaments: CatalogEntry[];
}

/* ── Tipos LGPIDF (PDFs Paris-Île-de-France) ──────────────────── */
interface LGPIDFInscrito {
  rank: number | null;
  scratch?: boolean;
  nationality?: string;
  name: string;
  club: string;
  category?: string;
  hcp: number | null;
  meriteSpiRaw?: string | null;
  wildCard?: boolean;
  registered?: boolean;
}
interface LGPIDFInscritosPdf {
  pdfKind: string;
  pdfFilename: string;
  pdfUrl: string;
  category?: string;
  players: LGPIDFInscrito[];
}
interface LGPIDFTeeTimePlayer {
  name: string;
  hcp?: number;
  playHcp?: number;
  category?: string | null;
  club?: string;
  teeTime?: string | null;
  startHole?: number | null;
}
interface LGPIDFTeeTimeGroup {
  groupNumber: number;
  players: LGPIDFTeeTimePlayer[];
}
interface LGPIDFTeeTimePdf {
  pdfKind: string;
  pdfFilename: string;
  pdfUrl: string;
  groups: LGPIDFTeeTimeGroup[];
}
interface LGPIDFCourseHole {
  hole: number;
  distance: number;
  unit: string;
  entrySide: string;
  rawDigits?: string;
}
interface LGPIDFCourseMapPdf {
  pdfFilename: string;
  pdfUrl: string;
  holes: LGPIDFCourseHole[];
}
interface LGPIDFCourse {
  category?: string;
  pdfKind?: string;
  pdfFilename?: string;
  pdfUrl?: string;
  parser?: string;
  players: Array<{
    pos?: number | null;
    prix?: number | null;
    name: string;
    club?: string;
    hcp?: number | null;
    r1?: number | null;
    r2?: number | null;
    total?: number | null;
    dnf?: boolean;
    division?: string;
  }>;
}
interface LGPIDFAllPdf {
  kind: string;
  filename: string;
  url: string;
  localPath?: string;
  category?: string;
}
interface LGPIDFTournament {
  tournament: string;
  slug: string;
  year: number;
  section: string;
  source: string;
  scrapedAt?: string;
  courseLevel?: string;
  course?: CourseInfo;
  dateStart?: string | null;
  dateEnd?: string | null;
  rounds: number;
  format?: string;
  divisions?: string[];
  courses: LGPIDFCourse[];
  teeTimePdfs: LGPIDFTeeTimePdf[];
  courseMapPdfs: LGPIDFCourseMapPdf[];
  inscritosPdfs: LGPIDFInscritosPdf[];
  allPdfs?: LGPIDFAllPdf[];
  players: Array<{
    pos?: number | null;
    name: string;
    club?: string;
    division?: string;
    country?: string;
    hcp?: number | null;
    r1?: number | null;
    r2?: number | null;
    total?: number | null;
    dnf?: boolean;
  }>;
}
interface LGPIDFIndexEntry {
  file: string;
  slug: string;
  year: number;
  tournament: string;
  section: string;
  source: string;
  divisions: string[];
  rounds: number;
  inscritosCount: number;
  playersCount: number;
  teeTimePdfsCount: number;
  courseMapPdfsCount: number;
  scrapedAt?: string;
}
interface LGPIDFIndex {
  generatedAt: string;
  source: string;
  total: number;
  tournaments: LGPIDFIndexEntry[];
}

/* ── Tipos FFG Resultats (sistema central da FFG, todas as ligas) ── */
interface FFGResPlayer {
  classement: string | null;
  pos: number | null;
  flag: string;
  name: string;
  nameNom?: string | null;
  namePrenom?: string | null;
  sex?: string | null;
  nationality?: string | null;
  license?: string | null;
  glfLic?: string | null;
  hcp: number | null;
  club: string;
  region?: string | null;
  teeTime?: string | null;
  statusR1?: string | null;
  statusR2?: string | null;
  statusR3?: string | null;
  statusR4?: string | null;
  t1: number | null;
  t2: number | null;
  t3: number | null;
  t4: number | null;
  total: number | null;
  scoresR1?: number[] | null;
  scoresR2?: number[] | null;
  scoresR3?: number[] | null;
  scoresR4?: number[] | null;
}
interface FFGResSerie {
  serieId: string;
  label: string | null;
  courseTerrain?: string | null;
  parString?: string | null;
  parPerHole?: number[] | null;
  parTotal?: number | null;
  glfOrg?: string | null;
  players: FFGResPlayer[];
}
/** Cartão de uma série de um torneio do portal FFG (`ffgolf-course-overrides.json` →
 *  `resultats`). `tee` é o nome mostrado na linha de metros — nos GP Jeunes é muitas
 *  vezes uma MISTURA de tees («misto: Azuis + Vermelhas»), detalhada em `teePorBuraco`. */
interface FFGSerieCourse {
  tee: string;
  misto?: boolean;
  par: number[];
  meters: number[];
  metersTotal?: number;
  teePorBuraco?: string[];
  nota?: string;
}

/** «U12G»/«U12 G»/«BG»/«MF» → chave única U12G/U14G/U16F… (BG/BF = Benjamins = U14,
 *  MG/MF = Minimes = U16 — os GP Jeunes usam as duas grafias). */
const serieCourseKey = (label: string): string => {
  const k = String(label || "").toUpperCase().replace(/\s+/g, "");
  const alias: Record<string, string> = { BG: "U14G", BF: "U14F", MG: "U16G", MF: "U16F" };
  return alias[k] || k;
};

/** Distâncias por série de um torneio do portal FFG, se publicadas (null = não há). */
async function loadFfgSerieCourses(trnId: string): Promise<Record<string, FFGSerieCourse> | null> {
  try {
    const o = await cachedFetchJson<{ resultats?: Record<string, { series?: Record<string, FFGSerieCourse> }> }>("/data/ffgolf-course-overrides.json");
    return o?.resultats?.[trnId]?.series ?? null;
  } catch {
    return null;
  }
}

interface FFGResTournament {
  trnId: string;
  partKey: string;
  name: string;
  formule: string;
  date: string;
  /** Enriquecimento com metros/SI vindos do scrape GolfGenius (course statistics widget).
   *  Injectado pelo load effect quando há um ficheiro `public/data/ffgolf/{year}_{slug}.json`
   *  correspondente. Quando presente, o adapter `ffgResToFPGTournament` usa-o para
   *  popular RoundScore.meters e RoundScore.si na vista hole-by-hole.
   *  `courses` contém todas as variantes de tee (ex: Black/Garçons, Blue/Filles) — o
   *  adapter selecciona o tee certo pela maioria de sex da série. */
  _ggCourse?: { par: number[]; meters: number[]; si: number[]; parTotal?: number; metersTotal?: number; name?: string;
                courses?: Array<{ teeName?: string; par: number[]; meters: number[]; si: number[]; parTotal?: number; metersTotal?: number }> } | null;
  /** Distâncias POR SÉRIE vindas de `ffgolf-course-overrides.json` → `resultats[trnId].series`
   *  (marcas jovens publicadas pela Liga/clube, ex.: GP Jeunes de Rennes 2026). Chave
   *  normalizada por `serieCourseKey`. Ganha ao `_ggCourse` na série a que se aplica. */
  _serieCourses?: Record<string, FFGSerieCourse> | null;
  details: {
    trnId: string;
    series: FFGResSerie[];
    rawDates?: { start: string; end: string } | null;
    rawTitle?: string | null;
    rawCourse?: string | null;
  };
}
interface FFGResIndexEntry {
  file: string;
  trnId: string;
  /** Chave do deep-link GET do portal: resultats-details/{partKey}/{trnId}. */
  partKey?: string | null;
  name: string;
  formule: string;
  date: string;
  dateIso: string | null;
  year: number | null;
  typeCompetition: string;
  ligue: string;
  /** Todas as ligas onde o torneio aparece no portal (dedup do build). */
  ligues?: string[];
  seriesCount: number;
  totalPlayers: number;
  /** Campo(s) do torneio — courseTerrain do detalhe, sem prefixo "(FFG)". */
  course?: string | string[] | null;
  /** Sexo agregado dos jogadores: "M", "F" ou "MF" (misto). Da fonte, não inferido. */
  sex?: "M" | "F" | "MF" | null;
  /** Nº de rondas efectivamente jogadas (maior índice com score/estado). */
  roundsPlayed?: number | null;
  divisions: { serieId: string; label: string | null; players: number }[];
  // Links cruzados pelo build-ffgolf-resultats-index.js (a partir do catálogo).
  pagesFfgolfUrl?: string | null;
  ffgolfOfficialUrl?: string | null;
  ggPage?: string | null;
  ffgolfSlug?: string | null;
  ffgolfSection?: string | null;
}
interface FFGResIndex {
  generatedAt: string;
  source: string;
  total: number;
  tournaments: FFGResIndexEntry[];
}

/* ── Tipos FFG categorias de idade (Vademecum) ──────────────── */
interface FFGAgeCategory {
  name: string;
  millesime: string;
  age: string;
  intl: string;
  subIntl: string;
}
interface FFGCategoriesData {
  _source: string;
  _vademecumUrl: string;
  _vademecumNote?: string;
  categories: FFGAgeCategory[];
  distancesParCategorie?: {
    _source?: string;
    _extractedAt?: string;
    _note?: string;
    matches?: Record<string, { trous: number; Garcons: number; Filles: number }>;
    _status?: string;
  };
}

/* ── Normalização de nome (FFGolf/GolfGenius usam "APELIDO(S) Nome") ────
 * O run INICIAL de tokens todo-em-CAPS é o apelido (pode ser composto):
 * "CASTRO FERREIRA Ricardo" → "Ricardo Castro Ferreira". Tratar só o 1º
 * token baralhava nomes de apelido duplo ("Ferreira Ricardo Castro"). */
function normalizeName(raw: string): string {
  const trimmed = raw.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return trimmed;
  const isCaps = (t: string) => t.length >= 2 && t === t.toUpperCase() && /^[A-ZÀ-Ý'-]+$/.test(t);
  let n = 0;
  while (n < parts.length && isCaps(parts[n])) n++;
  if (n === 0 || n === parts.length) return trimmed; // sem run em CAPS, ou nome inteiro em CAPS
  if (!parts.slice(0, n).some((t) => t.length >= 3)) return trimmed; // só iniciais/partículas
  const apelido = toTitleCase(parts.slice(0, n).join(" "));
  return `${parts.slice(n).join(" ")} ${apelido}`;
}

/* Normalize um apelido em CAPS para Title Case (ex: "MARCINIAK" → "Marciniak", "DE LOS RIOS" → "De Los Rios") */
function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part) => part.match(/^[a-zà-ÿ]/) ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join("");
}

/* Construir nome canónico "Nome Apelido" para um FFG player.
 * Cruza com KIDS page: o KIDS usa "Nome Apelido" (ex: "Valentina Marciniak").
 * O FFG dá `nameNom: "MARCINIAK"` (caps) e `namePrenom: "Valentina"`. */
function ffgPlayerName(p: { name?: string; nameNom?: string | null; namePrenom?: string | null }): string {
  if (p.namePrenom && p.nameNom) {
    const apelido = toTitleCase(p.nameNom.trim());
    return `${p.namePrenom.trim()} ${apelido}`;
  }
  return normalizeName(p.name || "");
}

/** País do jogador FFG para bandeira. Só o que a fonte dá — NUNCA inventar
 *  "FR" quando falta (mostrava estrangeiros como franceses e estragava o
 *  filtro 🇵🇹). "FRA" real do portal converte-se no código FR. Sem país → null. */
function ffgCountry(p: { nationality?: string | null; flag?: string | null }): string | null {
  const c = p.nationality || p.flag || null;
  if (!c) return null;
  return c === "FRA" ? "FR" : c;
}

/* ── Legenda das siglas de divisão / categoria FFG ─────────────
   B = Benjamin (~13-14 anos), M = Minime (~14-15), C = Cadet (~16-17)
   U10/U12/U14 = sub-10/12/14 (categorias Kids/PitchPutt/escola)
   F = Filles (raparigas), G = Garçons (rapazes)
*/
function divisionLabel(div: string): string {
  if (!div) return "—";
  const u = div.trim().toUpperCase();
  const map: Record<string, string> = {
    BF: "Benjamin Filles", BG: "Benjamin Garçons",
    MF: "Minime Filles",   MG: "Minime Garçons",
    CF: "Cadet Filles",    CG: "Cadet Garçons",
    JF: "Junior Filles",   JG: "Junior Garçons",
    "U10F": "Sub-10 Filles", "U10G": "Sub-10 Garçons",
    "U12F": "Sub-12 Filles", "U12G": "Sub-12 Garçons",
    "U14F": "Sub-14 Filles", "U14G": "Sub-14 Garçons",
    "U16F": "Sub-16 Filles", "U16G": "Sub-16 Garçons",
    "U18F": "Sub-18 Filles", "U18G": "Sub-18 Garçons",
  };
  if (map[u]) return map[u];
  // Códigos do <select serieCpt> das páginas resultats (2026-07-02):
  // "BENG"/"BenF" (Benjamins), "MinG"/"MINF" (Minimes), "CADG" (Cadets),
  // "POUF" (Poussins), "H/U12"·"F/U10" (sexo/idade), "Messieurs"/"Dames".
  const hf = u.match(/^([HFDM])\s*\/\s*U(\d+)$/);
  if (hf) return `Sub-${hf[2]} ${hf[1] === "H" || hf[1] === "M" ? "Garçons" : "Filles"}`;
  const abbr = u.match(/^(POU|BEN|MIN|CAD|JUN)([FG])$/);
  if (abbr) {
    const cat = { POU: "Poussin", BEN: "Benjamin", MIN: "Minime", CAD: "Cadet", JUN: "Junior" }[abbr[1]]!;
    return `${cat} ${abbr[2] === "F" ? "Filles" : "Garçons"}`;
  }
  // Plurais franceses: feminino explícito ("BENJAMINES", "CADETTES") → Filles;
  // plural simples ("BENJAMINS", "MINIMES") pode ser misto → só a categoria.
  const pluralF = u.match(/^(POUSSIN|BENJAMIN|CADETT)ES$/);
  if (pluralF) {
    const cat = { POUSSIN: "Poussin", BENJAMIN: "Benjamin", CADETT: "Cadet" }[pluralF[1]]!;
    return `${cat} Filles`;
  }
  const pluralM = u.match(/^(POUSSINS|BENJAMINS|MINIMES|CADETS)$/);
  if (pluralM) return pluralM[1].charAt(0) + pluralM[1].slice(1).toLowerCase();
  const uOnly = u.match(/^U(\d+)$/);
  if (uOnly) return `Sub-${uOnly[1]}`;
  // Categorias longas vindas de inscritos PDFs ("U12 Fille", "BENJAMIN Garçon")
  return div
    .replace(/U(\d+)\s+Fille/i, "Sub-$1 Filles")
    .replace(/U(\d+)\s+Gar[çc]on/i, "Sub-$1 Garçons")
    .replace(/BENJAMIN(?:E)?\s+Fille/i, "Benjamin Filles")
    .replace(/BENJAMIN(?:E)?\s+Gar[çc]on/i, "Benjamin Garçons")
    .replace(/MINIM(?:E)?\s+Fille/i, "Minime Filles")
    .replace(/MINIM(?:E)?\s+Gar[çc]on/i, "Minime Garçons");
}

/* ── Escalão canónico para o FILTRO da lista (agrupa ~455 labels crus) ──
   A regra vive em `src/utils/ffgEscalao.ts` (partilhada com o build Node via
   o espelho `scripts/lib/ffg-escalao.cjs`); reexportada aqui porque metade da
   app a importa desta página. Não substitui divisionLabel (tabs/pills
   continuam detalhados) — isto só alimenta `entry.escaloes` + dropdown. */
export { ffgEscalaoCanonico };

/** Escalões de um torneio: divisões + NOME (a idade FFG mora no nome quando as
 *  divisões só dizem o sexo). Junta ambas as fontes e dedup. */
function ffgEscaloesOfTournament(name: string | undefined, labels: (string | null | undefined)[]): string[] {
  return ffgEscaloesOf([...labels, name]);
}

/** Escalões canónicos (dedup, sem nulls) de uma lista de labels de série. */
function ffgEscaloesOf(labels: (string | null | undefined)[]): string[] {
  return [...new Set(labels.map(ffgEscalaoCanonico).filter((x): x is string => !!x))];
}

/* ── Categoria/título amigável a partir do nome do torneio ────── */
function shortTitle(t: FFGTournament | CatalogEntry): string {
  // `title` é opcional no catálogo (entradas sem página de scores no ffgolf.org)
  // → cai no nome do torneio scrapado e, em último caso, no slug.
  const name = ("title" in t && t.title) ? t.title
    : "tournament" in t ? t.tournament
    : t.slug;
  return name
    .replace(/^Championnat de France des Jeunes\s*-\s*/i, "Champ. France ")
    .replace(/^Internationaux de France\s+/i, "Internat. France ")
    .replace(/^Championnat\s+/i, "Champ. ")
    .replace(/Trophée Crocodile/, "")
    .replace(/\s+\(Sage Valley\)$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* ── Adaptador FFG Resultats → FPGTournament (reusa IntlTournView com par real) ── */
function ffgResToFPGTournament(data: FFGResTournament, serieFilter?: string): FPGTournament {
  // Filtrar série específica ou agregar tudo. Se o filtro não corresponde a
  // nenhuma série (caso comum quando vimos de outro torneio), faz fallback
  // para todas as séries em vez de devolver tournament vazio.
  let seriesToUse: FFGResSerie[];
  if (serieFilter && serieFilter !== "all") {
    const matched = data.details.series.filter((s) => s.serieId === serieFilter);
    seriesToUse = matched.length > 0 ? matched : data.details.series;
  } else {
    seriesToUse = data.details.series;
  }

  // Pegar par/curso da primeira série (todos partilham o mesmo curso geralmente)
  const firstSerie = seriesToUse[0] || data.details.series[0];
  const par: number[] = firstSerie?.parPerHole && firstSerie.parPerHole.length === 18
    ? firstSerie.parPerHole
    : [];
  const parTotal = firstSerie?.parTotal || 0;
  const courseName = firstSerie?.courseTerrain
    ? `Parcours ${firstSerie.courseTerrain}`
    : "";

  // Detectar nº de rondas REALMENTE jogadas (algum player tem tN não-null).
  // Importante: torneios futuros ou em curso podem ter t2/t3/t4 todos null
  // — nesse caso numRounds=1 para não marcar todos como WD.
  const allPlayers = seriesToUse.flatMap((s) => s.players.map((p) => ({ ...p, _serieId: s.serieId })));
  const hasT2 = allPlayers.some((p) => p.t2 != null);
  const hasT3 = allPlayers.some((p) => p.t3 != null);
  const hasT4 = allPlayers.some((p) => p.t4 != null);
  const numRounds = hasT4 ? 4 : hasT3 ? 3 : hasT2 ? 2 : 1;

  // Sort por total
  const sorted = [...allPlayers].sort((a, b) => {
    if (a.total == null && b.total == null) return 0;
    if (a.total == null) return 1;
    if (b.total == null) return -1;
    return a.total - b.total;
  });

  // Enriquecimento GG (metros/SI por buraco) injectado pelo load effect, se disponível.
  // Quando há múltiplos tees no curso (Black/Garçons + Blue/Filles), seleccionar o correcto
  // baseado em sex maioritário dos jogadores da série filtrada.
  const ggC = (data as any)._ggCourse as { par?: number[]; meters?: number[]; si?: number[]; metersTotal?: number;
    courses?: Array<{ teeName?: string; par?: number[]; meters?: number[]; si?: number[]; metersTotal?: number }> } | undefined;
  let chosenCourse: { par?: number[]; meters?: number[]; si?: number[]; metersTotal?: number } | undefined = ggC;
  if (ggC?.courses && ggC.courses.length > 1) {
    // Maioria sex da série: M → tee mais longo (Black), F → tee mais curto (Blue)
    const seriePlayers = sorted; // já filtrados pela série visível
    const males = seriePlayers.filter((p) => p.sex === "M").length;
    const females = seriePlayers.filter((p) => p.sex === "F").length;
    const sortedByMeters = [...ggC.courses].sort((a, b) => (b.metersTotal || 0) - (a.metersTotal || 0));
    if (males > females) chosenCourse = sortedByMeters[0]; // tee mais longo
    else if (females > males) chosenCourse = sortedByMeters[sortedByMeters.length - 1]; // tee mais curto
    // Empate ou só 1 tee → fica com o ggC default (primeiro do scrape)
  }
  // Distâncias publicadas para ESTA série (marcas jovens da Liga/clube) ganham ao GG:
  // num GP Jeunes cada escalão joga as suas marcas, muitas vezes misturando tees.
  const serieCourse = seriesToUse.length === 1
    ? data._serieCourses?.[serieCourseKey(seriesToUse[0].label || seriesToUse[0].serieId)]
    : undefined;
  if (serieCourse && Array.isArray(serieCourse.meters) && serieCourse.meters.length === 18) {
    chosenCourse = { par: serieCourse.par, meters: serieCourse.meters, si: chosenCourse?.si, metersTotal: serieCourse.metersTotal };
  }
  const ggMeters = chosenCourse?.meters && chosenCourse.meters.length === 18 ? chosenCourse.meters : [];
  const ggSi = chosenCourse?.si && chosenCourse.si.length === 18 ? chosenCourse.si : [];

  // teeName fictício "FFG" para que o ScorecardLB inclua a linha de metros.
  // Sem teeName, o teeMetersMap não é populado e a linha "m" por buraco fica vazia.
  // Com distâncias da série, o nome diz que o tee é MISTO (ex.: «… — misto: Azuis + Vermelhas»).
  const ffgTeeName = serieCourse?.tee || (ggC as any)?.name || "Tees";
  const players: FPGPlayer[] = sorted.map((p, idx) => {
    const rounds: FPGRoundScore[] = [];
    if (p.scoresR1 && p.scoresR1.length === 18 && p.t1 != null) {
      rounds.push({ round: 1, gross: p.t1, scores: p.scoresR1, pars: par, si: ggSi, meters: ggMeters, teeName: ggMeters.length ? ffgTeeName : undefined });
    }
    if (p.scoresR2 && p.scoresR2.length === 18 && p.t2 != null) {
      rounds.push({ round: 2, gross: p.t2, scores: p.scoresR2, pars: par, si: ggSi, meters: ggMeters, teeName: ggMeters.length ? ffgTeeName : undefined });
    }
    if (p.scoresR3 && p.scoresR3.length === 18 && p.t3 != null) {
      rounds.push({ round: 3, gross: p.t3, scores: p.scoresR3, pars: par, si: ggSi, meters: ggMeters, teeName: ggMeters.length ? ffgTeeName : undefined });
    }
    if (p.scoresR4 && p.scoresR4.length === 18 && p.t4 != null) {
      rounds.push({ round: 4, gross: p.t4, scores: p.scoresR4, pars: par, si: ggSi, meters: ggMeters, teeName: ggMeters.length ? ffgTeeName : undefined });
    }
    const incomplete = rounds.length < numRounds;
    const playerCountry = ffgCountry(p); // país REAL ou null — nunca "FRA" inventado
    const clubText = (p.club && p.club.trim()) ? p.club.trim() : (playerCountry ? normPaisDisplay(playerCountry) : "");
    const flagPrefix = playerCountry ? `${gf(playerCountry)} ` : "";
    return {
      scoreId: p.license || `${data.trnId}-${p._serieId}-${idx}`,
      pos: p.pos ?? idx + 1,
      name: ffgPlayerName(p),
      club: `${flagPrefix}${clubText}`.trim(),
      grossTotal: p.total,
      toPar: p.total != null && parTotal > 0 ? p.total - (parTotal * numRounds) : null,
      hcpExact: p.hcp ?? undefined,
      nholes: par.length || 18,
      parTotal,
      scores: rounds[0]?.scores || [],
      par,
      si: ggSi,
      meters: ggMeters,
      teeName: ggMeters.length ? ffgTeeName : undefined,
      roundScores: rounds,
      _wd: incomplete,
      _roundsPlayed: rounds.length,
      // Marca conterrâneos para o ScorecardLB/AccumulatedLB aplicar .row-portuguese.
      _isPortuguese: isPT((p as any).nationality, (p as any).flag, p.name),
    } as FPGPlayer;
  });

  return {
    name: data.name,
    tcode: data.trnId,
    date: data.date,
    campo: courseName,
    rounds: numRounds,
    playerCount: players.length,
    players,
  };
}

/* ── Adaptador FFG → FPGTournament (para reusar IntlTournView) ── */
function toFPGTournament(t: FFGTournament): FPGTournament {
  // Ordenar primeiro por total ascendente (pode estar fora de ordem nos JSONs antigos)
  // e atribuir pos sequencial se vier null
  const sorted = [...t.players].sort((a, b) => {
    if (a.total == null) return 1;
    if (b.total == null) return -1;
    return a.total - b.total;
  });
  // ⚠ O ScorecardLeaderboard só desenha a linha de metros para tees que
  // conheça pelo NOME (teeMetersMap é indexado por teeName). Sem teeName os
  // metros chegam ao componente e são ignorados — era por isso que o cartão
  // do campo não aparecia nos torneios GG. Mesmo truque do caminho do portal.
  // NUNCA inventar um nome de tee: o ScorecardLB indexa os metros por teeName,
  // portanto sem nome REAL de tee (vindo do cartão oficial) não há linha de
  // metros — fica vazia, que é o correcto quando não sabemos em que tee se jogou.
  const ggTeeName = t.course.tee || null;
  const hasMeters = !!ggTeeName
    && Array.isArray(t.course.meters) && t.course.meters.length === t.course.par.length;
  const players: FPGPlayer[] = sorted.map((p, idx) => {
    const roundScores: FPGRoundScore[] = p.rounds.map((r) => ({
      round: r.round,
      gross: r.gross,
      scores: r.scores,
      pars: t.course.par,
      si: t.course.si,
      meters: t.course.meters,
      teeName: hasMeters ? ggTeeName : undefined,
    }));
    const incomplete = p.rounds.length < t.rounds;
    // Position: usar p.pos se válido, senão idx+1
    const pos = (typeof p.pos === "number" && p.pos > 0) ? p.pos : (idx + 1);
    return {
      scoreId: p.id,
      pos,
      name: normalizeName(p.name),
      club: p.country ? `${gf(p.country)} ${p.club || normPaisDisplay(p.country)}` : p.club,
      grossTotal: p.total,
      toPar: p.toPar,
      hcpExact: p.hcp ?? undefined,
      nholes: t.course.par.length,
      parTotal: t.course.parTotal,
      scores: p.rounds[0]?.scores,
      par: t.course.par,
      si: t.course.si,
      meters: t.course.meters,
      teeName: hasMeters ? ggTeeName : undefined,
      roundScores,
      _wd: incomplete,
      _roundsPlayed: p.rounds.length,
      // Marca conterrâneos (.row-portuguese) — o caminho FFG-resultats já o
      // fazia; sem isto os torneios GolfGenius não destacavam PT (o GG publica
      // country null, mas a excepção por nome — Ricardo Castro Ferreira — pega).
      _isPortuguese: isPT(p.country, null, p.name),
    } as FPGPlayer;
  });
  return {
    name: `${t.year} // ${shortTitle(t)}`,
    tcode: `${t.year}_${t.slug}`,
    date: t.dateStart || "",
    campo: t.course.name,
    rounds: t.rounds,
    playerCount: players.length,
    players,
  };
}

function ffgScorecardOptions(): ScorecardOptions {
  return intlScorecardOptions({ hideHCP: false, clubLabel: "Clube" });
}

/* ── CategoriesView (Catégories d'âge FFG — info no body) ─────── */
function CategoriesView({ data }: { data: FFGCategoriesData }) {
  return (
    <div className="p-12-16">
      <DetailHeader
        title="📚 Catégories d'âge FFG"
        sub={
          <>
            <span className="muted">Federação Francesa de Golf — categorias oficiais por idade</span>
            <ExtLink href={data._source} className="tourn-ext-link" style={{ marginLeft: 8 }}>
              🔗 Página oficial
            </ExtLink>
            <ExtLink href={data._vademecumUrl} className="tourn-ext-link" style={{ marginLeft: 8, color: "var(--accent, #2563eb)" }}>
              📄 Vademecum FFG (PDF, 388 págs)
            </ExtLink>
          </>
        }
      />

      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table className="dtable">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Catégorie FR</th>
              <th>Millésime (ano nasc.)</th>
              <th>Idade</th>
              <th>Catégorie Internationale</th>
              <th>Sub-catégorie</th>
            </tr>
          </thead>
          <tbody>
            {data.categories.map((c) => (
              <tr key={c.name}>
                <td><strong>{c.name}</strong></td>
                <td style={{ textAlign: "center" }}>{c.millesime}</td>
                <td style={{ textAlign: "center" }}>{c.age}</td>
                <td style={{ textAlign: "center" }}>{c.intl}</td>
                <td style={{ textAlign: "center" }}>
                  <span className="chip" style={{ fontWeight: 600 }}>{c.subIntl}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 8 }}>📏 Distâncias máximas por categoria</h3>
        <p className="muted">
          Definidas no <em>Cahier des charges des Grands Prix Jeunes</em> (Vademecum FFG, secção 1.2.x).
        </p>
        {data.distancesParCategorie?.matches && Object.keys(data.distancesParCategorie.matches).length > 0 ? (
          <>
            <table className="dtable">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Categoria</th>
                  <th style={{ textAlign: "left" }}>FFG</th>
                  <th style={{ textAlign: "center" }}>#Trous</th>
                  <th style={{ textAlign: "right" }}>Garçons (m)</th>
                  <th style={{ textAlign: "right" }}>Filles (m)</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { uCode: "U8",  ffgLabel: "Enfant",    keys: ["U8"] },
                  { uCode: "U10", ffgLabel: "Poucet",    keys: ["U10", "Poucets", "Poucet"] },
                  { uCode: "U12", ffgLabel: "Poussin",   keys: ["U12", "Poussins", "Poussin"] },
                  { uCode: "U14", ffgLabel: "Benjamins", keys: ["Benjamins", "Benjamin", "U14"] },
                  { uCode: "U16", ffgLabel: "Minimes",   keys: ["Minimes", "Minime", "U16"] },
                  { uCode: "U18", ffgLabel: "Cadets",    keys: ["Cadets", "Cadet", "U18"] },
                ]).map(({ uCode, ffgLabel, keys }) => {
                  const matches = data.distancesParCategorie!.matches!;
                  const m = keys.map((k) => matches[k]).find((v) => v != null);
                  return (
                    <tr key={uCode}>
                      <td><strong>{uCode}</strong></td>
                      <td className="muted">{ffgLabel}</td>
                      <td style={{ textAlign: "center" }}>{m?.trous ?? "—"}</td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                        {m?.Garcons ? m.Garcons.toLocaleString("pt-PT") : "—"}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                        {m?.Filles ? m.Filles.toLocaleString("pt-PT") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="fs-10 muted mt-8">
              <em>
                Distâncias máximas em metros (par 72 indicativo). Extraído do{" "}
                <a href={data._vademecumUrl} target="_blank" rel="noopener noreferrer">Vademecum FFG</a>
                {data.distancesParCategorie._source ? ` — ${data.distancesParCategorie._source}` : ""}.
              </em>
            </div>
          </>
        ) : (
          <div style={{ padding: 16, background: "var(--bg-muted, #f5f5f5)", borderRadius: 6, marginTop: 8 }}>
            <p className="fs-12">
              <strong>Distâncias ainda não extraídas.</strong> Para popular esta tabela:
            </p>
            <pre style={{
              padding: 12,
              background: "var(--bg-card, #fff)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              fontSize: "var(--fs-11)",
              overflow: "auto",
            }}>
{`# 1. Descarregar o Vademecum (PDF ~88MB)
Invoke-WebRequest "${data._vademecumUrl}" \`
  -OutFile public\\data\\Vademecum2024.pdf

# 2. Correr o parser
node scripts/parse-vademecum-distances.js`}
            </pre>
            <p className="fs-11 muted mt-8">
              O parser procura a secção <em>"Cahier des charges des Grands Prix Jeunes"</em> e
              extrai distâncias por categoria. Resultado é guardado em <code>public/data/ffg-categories-age.json</code>.
            </p>
          </div>
        )}
      </div>

      <div className="muted fs-11 mt-16" style={{ marginTop: 24 }}>
        <strong>Notas:</strong>
        <ul style={{ marginTop: 4 }}>
          <li>O Vademecum FFG é actualizado anualmente (este link aponta para 2024).</li>
          <li>O <em>Cahier des charges</em> contém também regulamentos sobre tees, formato de competição, etc.</li>
          <li>A categoria <strong>Poucet(te)</strong> não tem equivalente directo PT — é a faixa 9-10 anos.</li>
        </ul>
      </div>
    </div>
  );
}
/* ── LGPIDF (PDFs Paris-Île-de-France) → os componentes partilhados ──────
 * Inscritos → AdmissionsTab, tee times → DrawTab, leaderboard (só totais) →
 * TotalsResumo; o mapa do campo fica numa aba própria da divisão. */

function lgpidfAdmissions(data: LGPIDFTournament): FpgAdmissions | undefined {
  const players: FpgAdmissionPlayer[] = data.inscritosPdfs.flatMap((pdf) => pdf.players.map((p): FpgAdmissionPlayer => ({
    pos: p.rank, fed: null, nome: normalizeName(p.name), clube: p.club || null, hcp: p.hcp,
    vac: null, dataInscricao: null, status: "confirmed",
    country: ffgCountry(p as { nationality?: string | null }), escalao: p.category ?? pdf.category ?? null,
    tags: [p.wildCard && "WC", p.scratch && "SCR"].filter(Boolean) as string[],
  })));
  return players.length ? { players, totalInscritos: players.length } : undefined;
}

/** Um PDF de horários por volta (pela ordem publicada). */
function lgpidfDraws(data: LGPIDFTournament): FpgDraw[] {
  return data.teeTimePdfs.map((pdf) => ({
    groups: pdf.groups.map((g): FpgDrawFlight => ({
      teeTime: g.players.find((p) => p.teeTime)?.teeTime ?? "",
      startHole: g.players.find((p) => p.startHole != null)?.startHole ?? null,
      tee: null,
      players: g.players.map((p) => ({ nome: normalizeName(p.name), clube: p.club || null, hcp: p.hcp ?? null })),
    })),
  }));
}

/** Par 72 assumido (18 buracos — standard nos Grand Prix Jeunes franceses):
 *  o PDF de resultados não traz o par. */
function LGPIDFTotals({ data }: { data: LGPIDFTournament }) {
  return (
    <TotalsResumo parPerRound={72} tournamentDate={data.dateStart ?? undefined}
      players={data.players.map((p) => ({ name: normalizeName(p.name), country: p.country ?? null, club: p.club ?? null,
        hcp: p.hcp ?? null, pos: p.pos ?? null, rounds: [p.r1 ?? null, p.r2 ?? null].slice(0, data.rounds || 2), total: p.total ?? null }))}
      notice={<span className="muted fs-10">* ±Par com par 72 assumido — o PDF de resultados não traz o par do campo.</span>} />
  );
}

function LGPIDFCourseMapTab({ data }: { data: LGPIDFTournament }) {
  if (!data.courseMapPdfs.length) return <div className="muted">Sem mapa do campo.</div>;
  return (
    <div>
      {data.courseMapPdfs.map((pdf) => {
        const total = pdf.holes.reduce((s, h) => s + h.distance, 0);
        return (
          <div key={pdf.pdfFilename} className="mb-12">
            <div className="muted fs-10 mb-8">
              <ExtLink href={pdf.pdfUrl}>📄 {pdf.pdfFilename}</ExtLink> · {pdf.holes.length} buracos · Total: {total.toLocaleString("pt-PT")} {pdf.holes[0]?.unit || ""}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="dtable-sm" style={{ textAlign: "center" }}>
                <thead>
                  <tr>
                    <th>Buraco</th>
                    {pdf.holes.map((h) => <th key={h.hole}>{h.hole}</th>)}
                    <th>Tot</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Distância</td>
                    {pdf.holes.map((h) => <td key={h.hole}>{h.distance}</td>)}
                    <td><strong>{total}</strong></td>
                  </tr>
                  <tr>
                    <td>Lado</td>
                    {pdf.holes.map((h) => <td key={h.hole} style={{ fontSize: "var(--fs-10)" }}>{h.entrySide.slice(0, 1)}</td>)}
                    <td>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   FFGPage (NOVO) — assente no CircuitShell partilhado.
   • FFG-Resultats (fonte principal): divisões por série com `results` reais
     (ffgResToFPGTournament) → leaderboard + toggles Manuel/PT/Top10 funcionam.
   • LGPIDF (PDFs Paris-Île-de-France): reutiliza a LGPIDFView como customResults.
   • Catégories d'âge: item no menu Info da toolbar.
   Shell estendido com filtro `liga` + filtro `INTL`.
   ═══════════════════════════════════════════════════════════════ */

const FFG_LIGUE_LABELS: Record<string, string> = {
  "00": "Nacional (Federales)",
  "01": "Paris-Île-de-France", "02": "Auvergne-Rhône-Alpes", "03": "Nouvelle-Aquitaine",
  "04": "PACA", "06": "Occitanie", "07": "Hauts-de-France", "08": "Grand-Est",
  "09": "Normandie", "10": "Pays de la Loire", "11": "Bretagne", "12": "Centre-Val de Loire",
  "13": "Bourgogne-F.-Comte", "14": "Réunion", "15": "Corse", "16": "Nouvelle-Calédonie",
  "17": "Guadeloupe", "18": "Polynésie", "19": "Clubs étrangers", "20": "Martinique",
  "21": "Guyane", "22": "Outre-Mer",
};
const isIntlName = (name?: string | null) => /\binternationa(l|ux?)\b/i.test(name || "");

/** Carrega o detalhe de UM torneio FFG-Resultats (lazy) + enriquecimento GG. */
async function ffgResLoadDivisions(meta: FFGResIndexEntry): Promise<CircuitDivision[]> {
  const td = await cachedFetchJson<FFGResTournament>(`/data/ffgolf-resultats/${meta.file}`);
  if (!td) return [];
  const serieCourses = await loadFfgSerieCourses(td.trnId);
  if (serieCourses) td._serieCourses = serieCourses;
  if (meta.ffgolfSlug && meta.year) {
    try {
      const ggData = await cachedFetchJson<{ course?: { par?: number[]; meters?: number[]; si?: number[]; parTotal?: number; metersTotal?: number; name?: string }; courses?: Array<{ teeName?: string; par?: number[]; meters?: number[]; si?: number[]; parTotal?: number; metersTotal?: number }> }>(`/data/ffgolf/${meta.year}_${meta.ffgolfSlug}.json`);
      if (ggData && ggData.course && Array.isArray(ggData.course.meters) && ggData.course.meters.length === 18) {
        const allCourses = Array.isArray(ggData.courses) ? ggData.courses
          .filter((c) => Array.isArray(c?.meters) && c.meters!.length === 18)
          .map((c) => ({ teeName: c.teeName, par: c.par || [], meters: c.meters!, si: c.si || [], parTotal: c.parTotal, metersTotal: c.metersTotal })) : [];
        td._ggCourse = { par: ggData.course.par || [], meters: ggData.course.meters, si: ggData.course.si || [], parTotal: ggData.course.parTotal, metersTotal: ggData.course.metersTotal, name: ggData.course.name, courses: allCourses.length > 0 ? allCourses : undefined };
      }
    } catch { /* GG opcional */ }
  }
  return td.details.series.map((s): CircuitDivision => ({
    key: s.serieId,
    escalao: divisionLabel(s.label || s.serieId),
    tabLabel: divisionLabel(s.label || s.serieId),
    hasManuel: s.players.some((p) => isM(p.name)),
    results: ffgResToFPGTournament(td, s.serieId),
    scOptions: ffgScorecardOptions(),
  }));
}

/** FFG-Resultats: entry LAZY a partir do índice (1607 torneios — detalhe só
 *  carrega ao seleccionar). hasManuel/hasPt vêm de um índice enriquecido opcional. */
function ffgResEntry(meta: FFGResIndexEntry, hasManuel?: boolean, hasPt?: boolean): CircuitEntry {
  const links: CircuitLink[] = [];
  if (meta.ggPage) links.push({ label: "GolfGenius", url: `https://www.golfgenius.com/pages/${meta.ggPage}`, icon: "🏌️", title: "Scorecards hole-by-hole no GolfGenius" });
  // Deep-link directo aos resultados deste torneio no portal FFG (rota GET
  // com partKey — a mesma que o kids2 usa via agregador).
  if (meta.partKey) links.push({ label: "Resultados FFG", url: `https://pages.ffgolf.org/resultats/resultats-details/${meta.partKey}/${meta.trnId}`, icon: "🏁", title: "Resultados oficiais deste torneio no portal FFG" });
  if (meta.ffgolfOfficialUrl) links.push({ label: "Página FFG", url: meta.ffgolfOfficialUrl, icon: "🔗" });
  if (!meta.partKey && !meta.ffgolfOfficialUrl) links.push({ label: "Portal FFG", url: meta.pagesFfgolfUrl || "https://pages.ffgolf.org/resultats/", icon: "🔗" });
  return {
    id: `ffgres:${meta.trnId}`,
    year: meta.year,
    name: meta.name,
    series: "FFG Officiel",
    source: "ffgres",
    dateStart: meta.dateIso ?? undefined,
    federation: "FFG",
    liga: meta.ligue,
    ligas: meta.ligues?.length ? meta.ligues : undefined,
    intl: isIntlName(meta.name),
    escaloes: ffgEscaloesOfTournament(meta.name, (meta.divisions ?? []).map((d) => d.label || d.serieId)),
    // Campos ricos da sidebar (existem no índice; antes não eram expostos).
    course: Array.isArray(meta.course) ? meta.course.join(" · ") : (meta.course ?? undefined),
    sex: meta.sex === "MF" ? "Mixed" : (meta.sex ?? undefined),
    roundsCount: meta.roundsPlayed ?? undefined,
    hasResults: meta.totalPlayers > 0,
    links,
    playerCount: meta.totalPlayers,
    divisionCount: meta.seriesCount,
    hasManuel,
    hasPt,
    loadDivisions: () => ffgResLoadDivisions(meta),
  };
}

/** Tee sheet GG → `FpgDraw`, para reutilizar o DrawTab partilhado (o mesmo
 *  que a /FPG, /major, /rfeg e /drive usam) em vez de uma tabela própria. */
function ggDrawToFpgDraw(round: FFGDrawRound): FpgDraw {
  return {
    name: round.label ?? undefined,
    date: round.dateIso ?? undefined,
    totalJogadores: round.groups.reduce((s, g) => s + g.players.length, 0),
    groups: round.groups.map((g) => ({
      teeTime: g.teeTime,
      startHole: null, // o GG não publica buraco de saída na tee sheet
      tee: round.tee ?? null,
      players: g.players.map((p) => ({
        nome: normalizeName(p.name),
        clube: p.club,
        hcp: p.hcp,
        tee: p.tee ?? null,
      })),
    })),
  };
}

/* ── Match play GG → MatchplayFile (bracket knockout individual) ──────────
   O GolfGenius não expõe o score dos confrontos ao público, mas dá-nos tudo o
   resto: os PARES vêm do tee sheet (draws com grupos de 2) e o VENCEDOR de
   cada par é quem aparece na lista de jogadores do evento dessa eliminatória
   (nos eventos match play do dropdown, `players` = vencedores). Para rondas
   sem tee sheet publicado (a FFG publica-o em cima da hora), os pares
   sintetizam-se pela ordem do bracket: vencedores dos matches 1+2 defrontam-se
   no match 1 da ronda seguinte (knockout standard). */
const mpKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const mpLabelBase = (s: string | null | undefined) => mpKey((s || "").replace(/\(.*$/, ""));
const isKnockoutLabel = (s: string | null | undefined) => /finale|1\/\d+|demi|quart|match\s*play/i.test(s || "");

/** Bracket do scraper com os nomes GG ("LE THEO Maxence") normalizados p/ display. */
function normalizeMpNames(mp: MatchplayFile): MatchplayFile {
  const n = (s: string | null) => (s ? normalizeName(s) : s);
  return {
    ...mp,
    flights: mp.flights.map((fl) => ({
      ...fl,
      rounds: fl.rounds.map((r) => ({
        ...r,
        matches: r.matches.map((m) => ({
          ...m,
          home: m.home ? { ...m.home, name: n(m.home.name) } : null,
          away: m.away ? { ...m.away, name: n(m.away.name) } : null,
          games: m.games.map((g) => ({
            ...g,
            home: g.home ? { ...g.home, name: n(g.home.name), players: g.home.players.map((p) => normalizeName(p)) } : null,
            away: g.away ? { ...g.away, name: n(g.away.name), players: g.away.players.map((p) => normalizeName(p)) } : null,
          })),
        })),
      })),
    })),
  };
}

function buildFfgMatchplay(data: FFGTournament): MatchplayFile | undefined {
  // Bracket completo do scraper (winners + "2 & 1" + holes) — fonte preferida.
  if (data.matchplay?.flights?.length) return normalizeMpNames(data.matchplay);
  const matchEvents = (data.events ?? []).filter((e) => e.format === "match");
  const draws = data.draws ?? [];
  const knockoutDraws = draws.filter((r) => isKnockoutLabel(r.label));
  if (!matchEvents.length && !knockoutDraws.some((r) => r.groups.length)) return undefined;

  const side = (name: string | null): MatchplayTeamMatch["home"] =>
    name ? { teamId: null, name: normalizeName(name), iso: null, country: null, points: null, isLead: false } : null;

  // Rondas na ordem do tee sheet (R3, R4, …); eventos match casados por label.
  const rounds: MatchplayRound[] = [];
  let prevWinnersOrdered: (string | null)[] | null = null; // nomes crus, ordem do bracket
  let number = 0;
  for (const dr of knockoutDraws) {
    number += 1;
    const ev = matchEvents.find((e) => mpLabelBase(e.name) === mpLabelBase(dr.label));
    const winners = new Set((ev?.players ?? []).map((p) => mpKey(p.name)));
    // Pares: tee sheet publicado > síntese pela ordem do bracket anterior.
    let pairs: Array<{ a: string | null; b: string | null; teeTime: string | null }> = [];
    if (dr.groups.length) {
      pairs = dr.groups
        .filter((g) => g.players.length >= 1)
        .map((g) => ({ a: g.players[0]?.name ?? null, b: g.players[1]?.name ?? null, teeTime: g.teeTime || null }));
    } else if (prevWinnersOrdered && prevWinnersOrdered.length >= 2 && prevWinnersOrdered.every(Boolean)) {
      for (let i = 0; i + 1 < prevWinnersOrdered.length; i += 2) {
        pairs.push({ a: prevWinnersOrdered[i], b: prevWinnersOrdered[i + 1], teeTime: null });
      }
    } else if (!ev?.players?.length) {
      continue; // ronda futura sem pares nem vencedores — nada a mostrar
    }
    const roundWinnersRaw: (string | null)[] = [];
    const matches: MatchplayTeamMatch[] = pairs.map((p, i) => {
      const aWon = p.a != null && winners.has(mpKey(p.a));
      const bWon = p.b != null && winners.has(mpKey(p.b));
      const winner = aWon && !bWon ? "home" : bWon && !aWon ? "away" : null;
      // Nomes CRUS na ordem do bracket (o display normaliza, mas o matching
      // da ronda seguinte precisa do nome tal como o GG o escreve).
      roundWinnersRaw.push(winner === "home" ? p.a : winner === "away" ? p.b : null);
      return {
        teamMatchId: null, matchNo: i + 1, startTime: p.teeTime,
        result: null, isSettled: winner != null, isStarted: false,
        home: side(p.a), away: side(p.b), winner, games: [],
      };
    });
    if (!matches.length) continue;
    rounds.push({ number, name: (dr.label || "").replace(/\s*\(.*$/, "") || `Ronda ${number}`, date: dr.dateIso, matches });
    prevWinnersOrdered = roundWinnersRaw;
  }
  if (!rounds.length) return undefined;
  return {
    tournament: data.tournament, slug: data.slug, year: data.year,
    format: "KnockOut", parentCompetitionId: null,
    startDate: rounds[0]?.date ?? undefined, endDate: rounds[rounds.length - 1]?.date ?? undefined,
    flights: [{
      competitionId: 1, name: "Match Play", format: "KnockOut", parentId: null,
      isCompleted: false, source: data.source || "", rounds,
    }],
    scrapedAt: data.scrapedAt || "",
  };
}

/** Slugs GG que NÃO são torneios franceses (espelha EXCLUDE_SLUGS de
 *  scripts/lib/ffgolf-gg.js — o roster já os exclui; a /ffg também deve). */
const GG_NON_FR_SLUGS = new Set<string>([
  "junior-invitational",                    // Sage Valley (EUA)
  "world-junior-girls-golf-championship",   // WAGR (Canadá)
]);

/** Sexo a partir do nome do torneio (só quando é inequívoco). Sem sinal → undefined. */
function ggSexFromName(name: string): "M" | "F" | undefined {
  const g = /gar[cç]ons|boys/i.test(name), f = /filles|girls/i.test(name);
  return g && !f ? "M" : f && !g ? "F" : undefined;
}

/** GolfGenius: torneio FFG que vive só no GG (sem gémeo no portal de resultados).
 *  Reutiliza a DivView — a mesma vista que a versão pré-CircuitShell usava. */
/** Datas de um torneio GG: usa o topo do ficheiro, senão deriva das rondas do
 *  match play (sempre presentes). Sem isto, ficheiros sem `dateStart` (CFJ 2026
 *  Filles/Benjamins/Benjamines) davam `entryDateKey` "00000000" e afundavam para
 *  o fundo da sidebar (ordenada por data) = "não aparecem". */
function ggInferDates(data: FFGTournament): { start?: string; end?: string } {
  const mp = (data.matchplay?.flights ?? [])
    .flatMap((f) => (f.rounds ?? []).map((r) => r.date))
    .filter((d): d is string => !!d)
    .sort();
  return { start: data.dateStart ?? mp[0], end: data.dateEnd ?? mp[mp.length - 1] };
}

/** Label de escalão de UM torneio GG FFG (o GG não o publica) — inferido do slug:
 *  "…u12-garcons…" → "U12 Garçons", "…benjamines" → "Benjamines". */
function ffgGgEscalaoLabel(meta: CatalogEntry, data: FFGTournament): string {
  const s = (meta.slug || "").toLowerCase();
  const sex = /gar[cç]ons|boys/.test(s) ? "Garçons" : /filles|girls/.test(s) ? "Filles" : "";
  const age = /u1[0248]/.exec(s)?.[0]?.toUpperCase();
  if (/benjamines/.test(s)) return "Benjamines";
  if (/benjamins/.test(s)) return "Benjamins";
  if (/minimes/.test(s)) return sex ? `Minimes ${sex}` : "Minimes";
  if (age) return sex ? `${age} ${sex}` : age;
  const esc = ffgEscaloesOfTournament(data.tournament || meta.title, data.divisions ?? []);
  return esc[0] || ((data.divisions ?? []).join("/")) || meta.title || "—";
}

/** Chave de "evento" para fundir escalões do MESMO campeonato: tira do slug os
 *  tokens de escalão/sexo/patrocinador. Os 4 do CFJ 2026 colapsam todos em
 *  "championnat-de-france-des-jeunes". */
function ffgEventFamilyKey(meta: CatalogEntry): string {
  return (meta.slug || "")
    .toLowerCase()
    .replace(/-troph[ée]e-.*$/, "")
    .replace(/\b(u1[0248]|benjamins|benjamines|minimes|gar[cç]ons|filles|boys|girls)\b/g, "")
    .replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/** Slug de família → título legível FR ("championnat-de-france-des-jeunes" →
 *  "Championnat de France des Jeunes"). */
function ffgPrettyTitle(familyKey: string): string {
  const small = new Set(["de", "des", "du", "la", "le", "et", "d", "aux", "au"]);
  return familyKey.split("-").filter(Boolean)
    .map((w, i) => (i > 0 && small.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Uma divisão (escalão) de um torneio GG FFG — leaderboard + match play + draws. */
function ffgGgDivision(meta: CatalogEntry, data: FFGTournament): CircuitDivision {
  const hasManuel = data.players.some((p) => isM(p.name));
  const label = ffgGgEscalaoLabel(meta, data);
  return {
    key: `${meta.year}_${meta.slug}`,
    escalao: label,
    tabLabel: label,
    sex: ggSexFromName(data.tournament || meta.title || ""),
    hasManuel,
    // `results` (não `customResults`): só assim a shell renderiza o IntlTournView
    // e intercala as abas "Draw R{n}" antes de cada ronda.
    results: toFPGTournament(data),
    scOptions: ffgScorecardOptions(),
    siLabel: "m",
    // Bracket knockout (CFJ etc.) — aba "Match Play" no fim da barra.
    matchplay: buildFfgMatchplay(data),
    // Draw por ronda intercalado com os resultados (mesmo padrão da /rfeg). Inclui
    // rondas por jogar — no match play saber COM QUEM se joga a seguinte é metade
    // da informação.
    roundDraws: (data.draws ?? []).filter((r) => r.groups.length).length
      ? (data.draws ?? [])
          .filter((r) => r.groups.length)
          .map((r) => ({
            round: r.round,
            render: () => (
              <DrawTab
                draw={ggDrawToFpgDraw(r)}
                roundNum={r.round}
                tournamentDate={r.dateIso}
                hideCols={{ fed: true, nasc: true, esc: true }}
              />
            ),
          }))
      : undefined,
  };
}

function ggLinks(meta: CatalogEntry, data: FFGTournament): CircuitLink[] {
  const links: CircuitLink[] = [
    { label: "GolfGenius", url: data.source || `https://www.golfgenius.com/pages/${meta.gg_page}`, icon: "🏌️", title: "Leaderboard e scorecards no GolfGenius" },
  ];
  if (meta.ffgolf_scores_url) links.push({ label: "Resultados FFG", url: meta.ffgolf_scores_url, icon: "🏁" });
  if (meta.ffgolf_url) links.push({ label: "Página FFG", url: meta.ffgolf_url, icon: "🔗" });
  return links;
}

/** Torneio GG de escalão único. */
function ggEntry(meta: CatalogEntry, data: FFGTournament): CircuitEntry {
  const div = ffgGgDivision(meta, data);
  const { start, end } = ggInferDates(data);
  return {
    id: `gg:${meta.year}_${meta.slug}`,
    year: meta.year,
    name: data.tournament || meta.title || meta.slug,
    series: "GolfGenius",
    source: "gg",
    course: data.course?.name ?? undefined,
    dateStart: start ?? undefined,
    dateEnd: end ?? undefined,
    federation: "FFG",
    intl: isIntlName(data.tournament || meta.title || ""),
    escaloes: ffgEscaloesOfTournament(data.tournament || meta.title, data.divisions ?? []),
    sex: ggSexFromName(data.tournament || meta.title || ""),
    roundsCount: data.rounds || undefined,
    hasResults: data.players.length > 0,
    links: ggLinks(meta, data),
    playerCount: data.players.length,
    divisionCount: (data.divisions ?? []).length || 1,
    hasManuel: div.hasManuel,
    divisions: [div],
  };
}

/** Vários escalões do MESMO campeonato GG (mesmo ano+campo) fundidos numa entrada
 *  com abas de escalão — ex: CFJ 2026 (U12 Garçons/Filles + Benjamins/Benjamines):
 *  4 leagues GolfGenius distintas mas 1 só evento (mesmos dias, mesmo campo). */
function ggMergedEntry(members: { meta: CatalogEntry; data: FFGTournament }[]): CircuitEntry {
  const escRank = (d: CircuitDivision): number => {
    const s = d.escalao.toLowerCase();
    const age = /u10/.test(s) ? 10 : /u12/.test(s) ? 12 : /benjamin/.test(s) ? 13
      : /u14/.test(s) ? 14 : /minime/.test(s) ? 15 : /u16/.test(s) ? 16 : /u18/.test(s) ? 18 : 99;
    return age * 10 + (d.sex === "F" ? 1 : 0);   // Garçons antes de Filles
  };
  const divisions = members.map((m) => ffgGgDivision(m.meta, m.data)).sort((a, b) => escRank(a) - escRank(b));
  const y = members[0].meta.year;
  // Os escalões podem jogar percursos diferentes do mesmo clube — no cabeçalho
  // da entrada fundida mostra-se o CLUBE (cada aba de escalão traz o seu percurso).
  const rawCourse = members.map((m) => m.data.course?.name).find(Boolean);
  const course = rawCourse ? rawCourse.replace(/\s*\(.*$/, "").trim() : undefined;
  const starts = members.map((m) => ggInferDates(m.data).start).filter((d): d is string => !!d).sort();
  const ends = members.map((m) => ggInferDates(m.data).end).filter((d): d is string => !!d).sort();
  const fam = ffgPrettyTitle(ffgEventFamilyKey(members[0].meta));
  return {
    id: `gg:evt:${ffgEventFamilyKey(members[0].meta)}_${y}`,
    year: y,
    name: `${fam} ${y}`,
    series: "GolfGenius",
    source: "gg",
    course,
    dateStart: starts[0],
    dateEnd: ends[ends.length - 1],
    federation: "FFG",
    intl: isIntlName(fam),
    escaloes: divisions.map((d) => d.escalao),
    sex: "Mixed",
    roundsCount: Math.max(0, ...members.map((m) => m.data.rounds || 0)) || undefined,
    hasResults: members.some((m) => m.data.players.length > 0),
    links: members.map((m) => ({
      label: `GG · ${ffgGgEscalaoLabel(m.meta, m.data)}`,
      url: m.data.source || `https://www.golfgenius.com/pages/${m.meta.gg_page}`,
      icon: "🏌️",
    })),
    playerCount: members.reduce((s, m) => s + m.data.players.length, 0),
    divisionCount: divisions.length,
    hasManuel: divisions.some((d) => d.hasManuel),
    divisions,
  };
}

/** LGPIDF: 1 entry, uma divisão que reutiliza a LGPIDFView (todas as tabs PDF). */
function lgpidfEntry(meta: LGPIDFIndexEntry, data: LGPIDFTournament): CircuitEntry {
  const inscritos = data.inscritosPdfs.reduce((s, pf) => s + pf.players.length, 0);
  const hasManuel = data.players.some((p) => isM(p.name)) || data.inscritosPdfs.some((pf) => pf.players.some((pl) => isM(pl.name)));
  return {
    id: `lgpidf:${meta.year}_${meta.slug}`,
    year: meta.year,
    name: meta.tournament,
    series: "LGPIDF",
    source: "lgpidf",
    course: data.course?.name ?? undefined,
    dateStart: data.dateStart ?? undefined,
    dateEnd: data.dateEnd ?? undefined,
    federation: "LGPIDF",
    playerCount: data.players.length || inscritos,
    divisionCount: 1,
    escaloes: ffgEscaloesOfTournament(data.tournament || meta.tournament, meta.divisions ?? []),
    hasManuel,
    divisions: [{
      key: "main",
      escalao: meta.divisions?.length ? meta.divisions.join("/") : "—",
      hasManuel,
      customResults: data.players.length ? <LGPIDFTotals data={data} /> : undefined,
      admissions: lgpidfAdmissions(data),
      roundDraws: lgpidfDraws(data).map((draw, i) => ({
        round: i + 1,
        render: () => <DrawTab draw={draw} roundNum={i + 1} tournamentDate={data.dateStart ?? null} />,
      })),
      extraSections: data.courseMapPdfs.length
        ? [{ key: "course-map", label: "📐 Mapa do campo", content: <LGPIDFCourseMapTab data={data} /> }]
        : undefined,
      links: (data.allPdfs ?? []).map((p) => ({ label: `${p.kind}${p.category ? ` · ${p.category}` : ""}`, url: p.url, icon: "📄", title: p.filename })),
    }],
  };
}

function FFGShellContent() {
  // Vista informativa via URL: /ffg/info/{key} (deep-linkável, persiste no
  // reload) — mesmo padrão da /rfeg. A selecção de torneio continua local.
  const navigate = useNavigate();
  const params = useParams<{ source?: string; key?: string }>();
  const selectedInfo = params.source === "info" ? (params.key ?? null) : null;
  // Torneio seleccionado via URL: /ffg/t/{entryId} — deep-linkável/partilhável.
  // O CircuitShell reflecte o default no URL ao aterrar em /ffg (mesmo padrão
  // da /rfeg e /egr). react-router já devolve o param descodificado.
  const selectedTourn = params.source === "t" && params.key ? params.key : undefined;
  const [ffgResIndex, setFfgResIndex] = useState<FFGResIndex | null>(null);
  const [lgpidfIndex, setLgpidfIndex] = useState<LGPIDFIndex | null>(null);
  const [lgpidfData, setLgpidfData] = useState<Map<string, LGPIDFTournament>>(new Map());
  const [ffgCategories, setFfgCategories] = useState<FFGCategoriesData | null>(null);
  const [ggCatalog, setGgCatalog] = useState<Catalog | null>(null);
  const [ggData, setGgData] = useState<Map<string, FFGTournament>>(new Map());
  const [ggTwins, setGgTwins] = useState<Set<string>>(new Set());
  // Índice opcional Manuel/PT por trnId (gerado por scripts/build-ffgolf-manuel-index.js)
  // — permite o filtro Manuel/PT na LISTA sem carregar os 1607 ficheiros.
  const [manuelIdx, setManuelIdx] = useState<Record<string, { m?: boolean; pt?: boolean }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      invalidateCache("/data/ffgolf-resultats-index.json");
      try {
        // FFG-Resultats: só o ÍNDICE (lazy — o detalhe carrega ao seleccionar).
        const ffgIdx = await cachedFetchJson<FFGResIndex>("/data/ffgolf-resultats-index.json");
        if (ffgIdx && alive) setFfgResIndex(ffgIdx);

        // LGPIDF (PDFs Paris-Île-de-France) — eager (pequeno; permite dedup + Manuel).
        try {
          const lgIdx = await cachedFetchJson<LGPIDFIndex>("/data/ffgolf-lgpidf-index.json");
          if (lgIdx && alive) {
            setLgpidfIndex(lgIdx);
            const lgMap = new Map<string, LGPIDFTournament>();
            await Promise.all(lgIdx.tournaments.map(async (t) => {
              try { const td = await cachedFetchJson<LGPIDFTournament>(`/data/ffgolf/${t.file}`); if (td) lgMap.set(`${t.year}_${t.slug}`, td); } catch { /* skip */ }
            }));
            if (alive) setLgpidfData(lgMap);
          }
        } catch { /* lgpidf opcional */ }

        // Índice Manuel/PT (opcional) — alimenta o filtro da lista em modo lazy.
        try {
          const mi = await cachedFetchJson<{ tournaments: Record<string, { m?: boolean; pt?: boolean }> }>("/data/ffgolf-manuel-index.json");
          if (mi?.tournaments && alive) setManuelIdx(mi.tournaments);
        } catch { /* opcional */ }

        // Catálogo GolfGenius — torneios FFG hospedados no GG. A maioria é gémea
        // de um evento do portal (entra por ffgres); os que NÃO têm gémeo só
        // existem aqui e, sem este bloco, não apareciam em lado nenhum.
        try {
          const cat = await cachedFetchJson<Catalog>("/data/ffgolf-catalog.json");
          if (cat && alive) {
            setGgCatalog(cat);
            const ggMap = new Map<string, FFGTournament>();
            await Promise.all(
              cat.tournaments.filter((t) => t.gg_page).map(async (t) => {
                try {
                  const td = await cachedFetchJson<FFGTournament>(`/data/ffgolf/${t.year}_${t.slug}.json`);
                  if (td) ggMap.set(`${t.year}_${t.slug}`, td);
                } catch { /* ficheiro em falta é normal */ }
              })
            );
            if (alive) setGgData(ggMap);
          }
        } catch { /* catálogo opcional */ }

        // Gémeos GG ↔ portal: quando o mesmo evento existe nos dois sítios, o
        // portal ganha (tem licenças) e a versão GG é escondida.
        try {
          const tw = await cachedFetchJson<{ twins: Record<string, unknown> }>("/data/ffgolf-gg-twins.json");
          if (tw?.twins && alive) setGgTwins(new Set(Object.keys(tw.twins)));
        } catch { /* opcional */ }

        // Catégories d'âge (Vademecum).
        try { const cats = await cachedFetchJson<FFGCategoriesData>("/data/ffg-categories-age.json"); if (cats && alive) setFfgCategories(cats); } catch { /* opcional */ }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Match LGPIDF → FFG por data+nome (esconde os LGPIDF que duplicam um FFG Officiel).
  const matchedLgKeys = useMemo(() => {
    const set = new Set<string>();
    if (!ffgResIndex || !lgpidfIndex) return set;
    for (const fe of ffgResIndex.tournaments) {
      if (!fe.dateIso) continue;
      for (const le of lgpidfIndex.tournaments) {
        const lg = lgpidfData.get(`${le.year}_${le.slug}`);
        if (!lg || lg.dateStart !== fe.dateIso) continue;
        const fw = fe.name.toLowerCase().split(/[\s-]+/);
        const lw = lg.tournament.toLowerCase().split(/[\s-]+/);
        if (fw.filter((w) => w.length > 3 && lw.includes(w)).length >= 2) set.add(`${le.year}_${le.slug}`);
      }
    }
    return set;
  }, [ffgResIndex, lgpidfIndex, lgpidfData]);

  const entries = useMemo<CircuitEntry[]>(() => {
    const out: CircuitEntry[] = [];
    if (ffgResIndex) {
      const seen = new Set<string>();
      for (const meta of ffgResIndex.tournaments) {
        if (seen.has(meta.trnId)) continue;
        seen.add(meta.trnId);
        const mi = manuelIdx[meta.trnId];
        out.push(ffgResEntry(meta, mi?.m, mi?.pt));
      }
    }
    if (lgpidfIndex) {
      for (const meta of lgpidfIndex.tournaments) {
        const key = `${meta.year}_${meta.slug}`;
        if (matchedLgKeys.has(key)) continue;
        const data = lgpidfData.get(key);
        if (!data) continue;
        out.push(lgpidfEntry(meta, data));
      }
    }
    if (ggCatalog) {
      // Rede de segurança: uma página GolfGenius que aloja as duas divisões
      // (Filles + Garçons) tem slugs distintos a apontar ao MESMO gg_page e o
      // seu leaderboard é combinado — os dois ficheiros ficam idênticos. Dedup
      // por gg_page para não mostrar o mesmo evento duas vezes (o nome exibido
      // vem do próprio GG, que é o título combinado real, não do slug).
      const seenGgPage = new Set<string>();
      const ggPairs: { meta: CatalogEntry; data: FFGTournament }[] = [];
      for (const meta of ggCatalog.tournaments) {
        if (!meta.gg_page) continue;
        // Eventos não-franceses que o catálogo GG arrastou (Sage Valley/EUA,
        // World Junior Girls/Canadá) — mesma lista do EXCLUDE_SLUGS do roster.
        // Não pertencem à página 🇫🇷 France.
        if (GG_NON_FR_SLUGS.has(meta.slug)) continue;
        const key = `${meta.year}_${meta.slug}`;
        if (seenGgPage.has(meta.gg_page)) continue;
        const data = ggData.get(key);
        if (!data || !data.players?.length) continue;
        // Gémeo do portal: por regra escondemos a versão GG (o portal traz
        // licenças + leaderboard mais rico). EXCEPÇÃO: quando a versão GG tem
        // match play (bracket knockout) mantemo-la SEMPRE — o portal só publica
        // o stroke play da qualificação e não representa os confrontos, logo a
        // GG é a única fonte do match play (caso CFJ U12 Garçons 2026, que o
        // build-france-players marcou como gémeo e desaparecia da lista).
        const hasMatchplay = !!data.matchplay?.flights?.length;
        if (ggTwins.has(key) && !hasMatchplay) continue; // o portal já mostra este evento
        seenGgPage.add(meta.gg_page);
        ggPairs.push({ meta, data });
      }
      // Fundir escalões do MESMO campeonato numa entrada com abas de escalão
      // (CFJ 2026 = U12 Garçons/Filles + Benjamins/Benjamines, 4 leagues GG mas 1
      // evento). Chave: família do nome + ano + CLUBE. Usa-se o clube (nome antes
      // do parêntesis) e não o percurso exato — o mesmo evento joga percursos
      // diferentes por escalão E o GG nomeia-os de forma inconsistente ("Golf du
      // Gouverneur (Montaplan)" vs "(Montaplan CFJ 2026)" vs "(Le Breuil …)").
      // Só funde quando há campo (para nunca fundir por engano); sem campo, solo.
      const clubKey = (c: string) => c.toLowerCase().replace(/\s*\(.*$/, "").replace(/\s+/g, " ").trim();
      const byEvent = new Map<string, { meta: CatalogEntry; data: FFGTournament }[]>();
      for (const pr of ggPairs) {
        const course = pr.data.course?.name || "";
        const gkey = course
          ? `${ffgEventFamilyKey(pr.meta)}|${pr.meta.year}|${clubKey(course)}`
          : `__solo__|${pr.meta.year}_${pr.meta.slug}`;
        if (!byEvent.has(gkey)) byEvent.set(gkey, []);
        byEvent.get(gkey)!.push(pr);
      }
      for (const members of byEvent.values()) {
        out.push(members.length > 1 ? ggMergedEntry(members) : ggEntry(members[0].meta, members[0].data));
      }
    }
    return out;
  }, [ffgResIndex, lgpidfIndex, lgpidfData, matchedLgKeys, manuelIdx, ggCatalog, ggData, ggTwins]);

  const config = useMemo<CircuitConfig>(() => {
    const specialItems: CircuitSpecialItem[] = [
      { key: "joueurs", label: "👥 Joueurs de France", render: () => <FFGPlayersView /> },
      ...(ffgCategories
        ? [{ key: "categorias", label: "📚 Catégories d'âge FFG", render: () => <CategoriesView data={ffgCategories} /> }]
        : []),
    ];
    return {
      routeBase: "/ffg",
      title: "🇫🇷 France",
      color: "var(--color-ffg-dark)",
      textColor: "#fff",
      // Agrupar só por ANO, não por série: um torneio é um torneio, e a fonte
      // de onde o extraímos é um detalhe nosso, não uma divisão do calendário.
      // Separado por série, o punhado de eventos GolfGenius ficava debaixo de
      // 1265 entradas do portal — presente mas invisível. A fonte continua
      // legível na pill de cada linha e filtrável no dropdown "Fonte".
      grouping: "year",
      sourceColors: { ffgres: "var(--color-ffg-dark)", lgpidf: "#3b5a8c", gg: "#1f7a4d" },
      sourceLabels: { ffgres: "FFG Officiel", lgpidf: "LGPIDF", gg: "GolfGenius" },
      ligaLabels: FFG_LIGUE_LABELS,
      filters: { search: true, year: true, escalao: true, sex: true, source: true, liga: true, intl: true, toggles: ["manuel", "pt", "top10", "results"] },
      specialItems,
      // "Edições anteriores": família pelo nome (o `tournamentFamilyKey` tira o
      // prefixo "{ano} // " e os anos) — agrupa o mesmo Grand Prix ano-a-ano.
      editionKey: (e) => tournamentFamilyKey(e.name),
      loadingMessage: "A carregar FFGolf…",
    };
  }, [ffgCategories]);

  if (loading) return <LoadingState message="A carregar FFGolf…" />;
  return (
    <CircuitShell
      entries={entries}
      config={config}
      selectedId={selectedTourn}
      onSelectEntry={(e) => navigate(`/ffg/t/${encodeURIComponent(e.id)}`)}
      selectedInfo={selectedInfo}
      onSelectInfo={(key) => navigate(key ? `/ffg/info/${key}` : "/ffg")}
    />
  );
}

export default function FFGPage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <FFGShellContent />;
}
