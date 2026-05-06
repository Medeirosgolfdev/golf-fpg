/**
 * FFGPage.tsx — 🇫🇷 FFGolf · Torneios juvenis franceses
 *
 * Carrega o catálogo `public/data/ffgolf-catalog.json` (lista de torneios
 * mapeados) e, para cada um, tenta `public/data/ffgolf/{year}_{slug}.json`
 * (gerado pelo scraper). Os ficheiros têm par REAL, metros e SI vindos do
 * widget course_statistics do GolfGenius — não há adivinhação.
 *
 * Match play (knockout) é excluído pelo scraper. Só stroke play (qualifiers)
 * é mostrado.
 */
import React, { useEffect, useState, useMemo } from "react";
import { cachedFetchJson, invalidateCache } from "../data/fetchCache";
import { isManuelByName as isM } from "../constants/manuel";
import ExtLink from "../ui/ExternalLink";
import SidebarSectionTitle from "../ui/SidebarSectionTitle";
import { gf } from "../utils/flagUtils";
import { fmtFieldInfo } from "../utils/format";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarMeta } from "../ui/Toolbar";
import { DataSourcesChip, DataSourcesProvider, type DataSource } from "../ui/DataSources";
import DetailHeader from "../ui/DetailHeader";
import { useMasterDetail } from "../hooks/useMasterDetail";
import LoadingState from "../ui/LoadingState";
import { RoundPill, ManuelPill } from "../ui/PillBadge";
import { type Tournament as FPGTournament, type Player as FPGPlayer, type RoundScore as FPGRoundScore, type ScorecardOptions } from "./FPGPage";
import { IntlTournView } from "../ui/IntlTournView";
import { useKidsLinkMap } from "../hooks/useKidsLinkMap";
import { KidsLinkCtx } from "../ui/KidsLink";
import { ScorecardLeaderboard, type ScorecardRow } from "../ui/ScorecardLeaderboard";
import SortableHdr from "../ui/SortableHdr";
import { useSort } from "../hooks/useSort";
import SexBadge from "../ui/SexBadge";

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
  players: FFGPlayer[];
  scrapedAt?: string;
}

interface CatalogEntry {
  year: number;
  section: string;
  slug: string;
  title: string;
  gg_page: string | null;
  gg_league: string | null;
  ffgolf_url?: string;
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
interface FFGResTournament {
  trnId: string;
  partKey: string;
  name: string;
  formule: string;
  date: string;
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
  name: string;
  formule: string;
  date: string;
  dateIso: string | null;
  year: number | null;
  typeCompetition: string;
  ligue: string;
  seriesCount: number;
  totalPlayers: number;
  divisions: { serieId: string; label: string | null; players: number }[];
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

/* ── Normalização de nome (FFGolf usa "APELIDO Nome") ──────────── */
function normalizeName(raw: string): string {
  const trimmed = raw.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return trimmed;
  const first = parts[0];
  const rest = parts.slice(1).join(" ");
  if (first.length >= 3 && first === first.toUpperCase() && /^[A-ZÀ-Ý-]+$/.test(first)) {
    const last = first.charAt(0) + first.slice(1).toLowerCase();
    return `${rest} ${last}`;
  }
  return trimmed;
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

/* ── Legenda das siglas de divisão / categoria FFG ─────────────
   B = Benjamin (~13-14 anos), M = Minime (~14-15), C = Cadet (~16-17)
   U10/U12/U14 = sub-10/12/14 (categorias Kids/PitchPutt/escola)
   F = Filles (raparigas), G = Garçons (rapazes)
*/
function divisionLabel(div: string): string {
  if (!div) return "—";
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
  if (map[div]) return map[div];
  // Categorias longas vindas de inscritos PDFs ("U12 Fille", "BENJAMIN Garçon")
  return div
    .replace(/U(\d+)\s+Fille/i, "Sub-$1 Filles")
    .replace(/U(\d+)\s+Gar[çc]on/i, "Sub-$1 Garçons")
    .replace(/BENJAMIN(?:E)?\s+Fille/i, "Benjamin Filles")
    .replace(/BENJAMIN(?:E)?\s+Gar[çc]on/i, "Benjamin Garçons")
    .replace(/MINIM(?:E)?\s+Fille/i, "Minime Filles")
    .replace(/MINIM(?:E)?\s+Gar[çc]on/i, "Minime Garçons");
}

/* ── Categoria/título amigável a partir do nome do torneio ────── */
function shortTitle(t: FFGTournament | CatalogEntry): string {
  const name = "title" in t ? t.title : t.tournament;
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

  // Detectar nº de rondas (qualquer player tem t3/t4 não-null?)
  const allPlayers = seriesToUse.flatMap((s) => s.players.map((p) => ({ ...p, _serieId: s.serieId })));
  const hasT3 = allPlayers.some((p) => p.t3 != null);
  const hasT4 = allPlayers.some((p) => p.t4 != null);
  const numRounds = hasT4 ? 4 : hasT3 ? 3 : 2;

  // Sort por total
  const sorted = [...allPlayers].sort((a, b) => {
    if (a.total == null && b.total == null) return 0;
    if (a.total == null) return 1;
    if (b.total == null) return -1;
    return a.total - b.total;
  });

  const players: FPGPlayer[] = sorted.map((p, idx) => {
    const rounds: FPGRoundScore[] = [];
    if (p.scoresR1 && p.scoresR1.length === 18 && p.t1 != null) {
      rounds.push({ round: 1, gross: p.t1, scores: p.scoresR1, pars: par, si: [], meters: [] });
    }
    if (p.scoresR2 && p.scoresR2.length === 18 && p.t2 != null) {
      rounds.push({ round: 2, gross: p.t2, scores: p.scoresR2, pars: par, si: [], meters: [] });
    }
    if (p.scoresR3 && p.scoresR3.length === 18 && p.t3 != null) {
      rounds.push({ round: 3, gross: p.t3, scores: p.scoresR3, pars: par, si: [], meters: [] });
    }
    if (p.scoresR4 && p.scoresR4.length === 18 && p.t4 != null) {
      rounds.push({ round: 4, gross: p.t4, scores: p.scoresR4, pars: par, si: [], meters: [] });
    }
    const incomplete = rounds.length < numRounds;
    const playerCountry = p.nationality || p.flag || "FRA";
    const clubLabel = (p.club && p.club.trim()) ? p.club.trim() : playerCountry;
    return {
      scoreId: p.license || `${data.trnId}-${p._serieId}-${idx}`,
      pos: p.pos ?? idx + 1,
      name: ffgPlayerName(p),
      club: `${gf(playerCountry)} ${clubLabel}`,
      grossTotal: p.total,
      toPar: p.total != null && parTotal > 0 ? p.total - (parTotal * numRounds) : null,
      hcpExact: p.hcp ?? undefined,
      nholes: par.length || 18,
      parTotal,
      scores: rounds[0]?.scores || [],
      par,
      si: [],
      meters: [],
      roundScores: rounds,
      _wd: incomplete,
      _roundsPlayed: rounds.length,
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
  const players: FPGPlayer[] = sorted.map((p, idx) => {
    const roundScores: FPGRoundScore[] = p.rounds.map((r) => ({
      round: r.round,
      gross: r.gross,
      scores: r.scores,
      pars: t.course.par,
      si: t.course.si,
      meters: t.course.meters,
    }));
    const incomplete = p.rounds.length < t.rounds;
    // Position: usar p.pos se válido, senão idx+1
    const pos = (typeof p.pos === "number" && p.pos > 0) ? p.pos : (idx + 1);
    return {
      scoreId: p.id,
      pos,
      name: normalizeName(p.name),
      club: p.country ? `${gf(p.country)} ${p.club || p.country}` : p.club,
      grossTotal: p.total,
      toPar: p.toPar,
      hcpExact: p.hcp ?? undefined,
      nholes: t.course.par.length,
      parTotal: t.course.parTotal,
      scores: p.rounds[0]?.scores,
      par: t.course.par,
      si: t.course.si,
      meters: t.course.meters,
      roundScores,
      _wd: incomplete,
      _roundsPlayed: p.rounds.length,
    } as FPGPlayer;
  });
  return {
    name: `${t.year} // ${shortTitle(t)}`,
    tcode: `${t.year}_${t.slug}`,
    date: "",
    campo: t.course.name,
    rounds: t.rounds,
    playerCount: players.length,
    players,
  };
}

function ffgScorecardOptions(): ScorecardOptions {
  return {
    hideHCP: false,
    hideSD: true,
    hideEsc: true,
    hideFed: true,
    hideTee: true,
    clubLabel: "Clube",
  };
}

/* ── CategoriesView (Catégories d'âge FFG — info no body) ─────── */
function CategoriesView({ data }: { data: FFGCategoriesData }) {
  return (
    <div style={{ padding: "12px 16px" }}>
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
        <table className="data-table" style={{ width: "100%" }}>
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
            <table className="data-table" style={{ width: "100%" }}>
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
                      <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                        {m?.Garcons ? m.Garcons.toLocaleString("pt-PT") : "—"}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace" }}>
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
              fontSize: 11,
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

/* ── FFGResView (sistema central FFG — todas as ligas) ────────── */
function FFGResView({ data, lgpidfSupp }: { data: FFGResTournament; lgpidfSupp?: LGPIDFTournament | null }) {
  type SortKey = "pos" | "nome" | "club" | "hcp" | "t1" | "t2" | "t3" | "t4" | "total";
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("pos");
  const [serieFilter, setSerieFilter] = useState<string>(
    data.details.series[0]?.serieId || "all"
  );

  // Detectar se temos hole-by-hole (parPerHole + scoresR1) — usar IntlTournView
  const firstSerie = data.details.series.find((s) => s.serieId === serieFilter) || data.details.series[0];
  const hasHbh = !!(firstSerie?.parPerHole && firstSerie.parPerHole.length === 18
    && firstSerie.players.some((p) => p.scoresR1 && p.scoresR1.length === 18));
  const fpgTournament = useMemo(
    () => hasHbh ? ffgResToFPGTournament(data, serieFilter) : null,
    [hasHbh, data, serieFilter],
  );
  const scOptions = useMemo(() => ffgScorecardOptions(), []);
  type Tab = "leaderboard" | "inscritos" | "tee-times" | "course-map" | "pdfs";
  const [tab, setTab] = useState<Tab>("leaderboard");

  const allSeries = data.details.series;
  const supp = lgpidfSupp;
  const inscritosCount = supp?.inscritosPdfs.reduce((s, p) => s + p.players.length, 0) || 0;
  const teeTimeCount = supp?.teeTimePdfs.length || 0;
  const courseMapCount = supp?.courseMapPdfs.length || 0;
  const pdfCount = supp?.allPdfs?.length || 0;
  const hasSupp = !!supp;
  const tabs: Array<{ key: Tab; label: string; count: number; show: boolean }> = [
    { key: "leaderboard", label: "🏆 Leaderboard FFG", count: data.details.series.reduce((s, x) => s + x.players.length, 0), show: true },
    { key: "inscritos", label: "📋 Inscritos (PDF)", count: inscritosCount, show: inscritosCount > 0 },
    { key: "tee-times", label: "🕐 Tee times (PDF)", count: teeTimeCount, show: teeTimeCount > 0 },
    { key: "course-map", label: "📐 Mapa do campo (PDF)", count: courseMapCount, show: courseMapCount > 0 },
    { key: "pdfs", label: "📁 PDFs", count: pdfCount, show: pdfCount > 0 },
  ];

  // Detectar nº de rondas a partir dos jogadores (qualquer t3/t4 não-null)
  const hasT3 = allSeries.some((s) => s.players.some((p) => p.t3 != null));
  const hasT4 = allSeries.some((s) => s.players.some((p) => p.t4 != null));
  const numRounds = hasT4 ? 4 : hasT3 ? 3 : 2;
  const ASSUMED_PAR = 72 * numRounds;

  // Filtrar jogadores pela série seleccionada
  const filtered = useMemo(() => {
    if (serieFilter === "all") return allSeries.flatMap((s) => s.players.map((p) => ({ ...p, _serieId: s.serieId })));
    const s = allSeries.find((x) => x.serieId === serieFilter);
    return s ? s.players.map((p) => ({ ...p, _serieId: s.serieId })) : [];
  }, [allSeries, serieFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const mult = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "pos":  v = (a.pos ?? 999) - (b.pos ?? 999); break;
        case "nome": v = a.name.localeCompare(b.name); break;
        case "club": v = (a.club || "").localeCompare(b.club || ""); break;
        case "hcp":  v = (a.hcp ?? 99) - (b.hcp ?? 99); break;
        case "t1":   v = (a.t1 ?? 999) - (b.t1 ?? 999); break;
        case "t2":   v = (a.t2 ?? 999) - (b.t2 ?? 999); break;
        case "t3":   v = (a.t3 ?? 999) - (b.t3 ?? 999); break;
        case "t4":   v = (a.t4 ?? 999) - (b.t4 ?? 999); break;
        case "total":v = (a.total ?? 999) - (b.total ?? 999); break;
      }
      return mult * v;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const rows: ScorecardRow[] = useMemo(() => sorted.map((p, i) => {
    const manuel = isM(p.name);
    const gross = p.total ?? 0;
    const toPar = gross > 0 ? gross - ASSUMED_PAR : null;
    return {
      key: `${p.name}-${i}`,
      pos: p.pos ?? (i + 1),
      gross,
      toPar,
      scores: [],
      isManuel: manuel,
      sortPos: p.pos,
      sortName: normalizeName(p.name),
      nameContent: (
        <>
          <span style={{ marginRight: 4 }}>{gf(p.nationality || p.flag || "FRA")}</span>
          <span className="fw-700">{normalizeName(p.name)}</span>
          {manuel && <> {" "}<ManuelPill /></>}
        </>
      ),
      prefixCells: (
        <>
          <td className="lb-club" title={p.club}>{p.club || "—"}</td>
          <td className="lb-hcp">{p.hcp != null ? p.hcp.toFixed(1) : "—"}</td>
          <td className="lb-tee" style={{ fontSize: 11 }}>{p._serieId}</td>
        </>
      ),
      postScorecardCells: (
        <>
          <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.t1 ?? "—"}</td>
          <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.t2 ?? "—"}</td>
          {numRounds >= 3 && <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.t3 ?? "—"}</td>}
          {numRounds >= 4 && <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.t4 ?? "—"}</td>}
        </>
      ),
    } as ScorecardRow;
  }), [sorted, ASSUMED_PAR, numRounds]);

  if (!allSeries.length) return <div className="muted">Sem séries disponíveis.</div>;

  const prefixHeaderCells = (
    <>
      <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-club">CLUBE</SortableHdr>
      <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-hcp">Idx</SortableHdr>
      <th className="lb-tee">SÉRIE</th>
    </>
  );

  const postScorecardHeaderCells = (
    <>
      <SortableHdr k="t1" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "right" }}>T1</SortableHdr>
      <SortableHdr k="t2" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "right" }}>T2</SortableHdr>
      {numRounds >= 3 && <SortableHdr k="t3" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "right" }}>T3</SortableHdr>}
      {numRounds >= 4 && <SortableHdr k="t4" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "right" }}>T4</SortableHdr>}
    </>
  );

  const filterBar = (
    <div className="detail-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
      <span className="fs-12 fw-700">Série:</span>
      <select className="input" value={serieFilter} onChange={(e) => setSerieFilter(e.target.value)} style={{ maxWidth: 240 }}>
        <option value="all">Todas ({allSeries.reduce((s, x) => s + x.players.length, 0)})</option>
        {allSeries.map((s) => (
          <option key={s.serieId} value={s.serieId}>
            {s.serieId} ({s.players.length})
          </option>
        ))}
      </select>
      <span className="muted fs-12">
        {sorted.length} jogadores · {numRounds} ronda{numRounds > 1 ? "s" : ""} · ± vs par {72 * numRounds}*
      </span>
    </div>
  );

  return (
    <>
      <div className="muted fs-10 mb-8" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span>🇫🇷 FFG Officiel · {data.formule} · 📅 {data.date}</span>
        {hasSupp && supp?.course?.name && <span>· 📍 {supp.course.name}</span>}
        {hasSupp && supp?.course && supp.course.metersTotal > 0 && (
          <span>· {supp.course.metersTotal.toLocaleString("pt-PT")} m</span>
        )}
        <span>· {allSeries.length} séries · {data.details.series.reduce((s, x) => s + x.players.length, 0)} jogadores</span>
      </div>

      {/* Tabs (só se há LGPIDF supp data) */}
      {hasSupp && tabs.filter((t) => t.show).length > 1 && (
        <div className="mb-12" style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          {tabs.filter((t) => t.show).map((t) => (
            <button
              key={t.key}
              className={`tab-under ${tab === t.key ? "active" : ""}`}
              onClick={() => setTab(t.key)}
              style={{ padding: "8px 12px", border: "none", background: "none", cursor: "pointer", fontSize: 13 }}
            >
              {t.label} <span className="muted">({t.count})</span>
            </button>
          ))}
        </div>
      )}

      {tab === "leaderboard" && (
        <>
          {/* Filtro de série acima da leaderboard */}
          <div className="detail-toolbar mb-8" style={{ flexWrap: "wrap", gap: 8 }}>
            {data.details.series.length > 1 && (
              <>
                <span className="fs-12 fw-700">Série:</span>
                <select className="input" value={serieFilter} onChange={(e) => setSerieFilter(e.target.value)} style={{ maxWidth: 320 }}>
                  {data.details.series.map((s) => {
                    // Inferir sex (todos jogadores da série partilham)
                    const sex = s.players[0]?.sex;
                    const sexLabel = sex === "F" ? "Filles (F)" : sex === "M" ? "Garçons (M)" : "";
                    return (
                      <option key={s.serieId} value={s.serieId}>
                        Série {s.serieId}{sexLabel ? ` · ${sexLabel}` : ""} · {s.players.length} jog · par {s.parTotal || "?"}
                      </option>
                    );
                  })}
                </select>
                {(() => {
                  const sx = firstSerie?.players[0]?.sex;
                  if (sx === "F" || sx === "M") return <SexBadge sex={sx} />;
                  return null;
                })()}
              </>
            )}
            <span className="muted fs-12" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {firstSerie?.players.length || 0} jogadores · {firstSerie?.parTotal ? `Par ${firstSerie.parTotal}` : "Par desconhecido"} ·
              <RoundPill nR={numRounds} />
              {firstSerie?.courseTerrain && <>· {firstSerie.courseTerrain}</>}
            </span>
          </div>
          {hasHbh && fpgTournament ? (
            // Scorecard hole-by-hole real com cores eagle/birdie/par/bogey
            <IntlTournView tournament={fpgTournament} scOptions={scOptions} siLabel="m" />
          ) : (
            // Fallback: tabela só com totais (sem hole-by-hole disponível)
            <>
              <ScorecardLeaderboard
                par={[]}
                rows={rows}
                prefixHeaderCells={prefixHeaderCells}
                postScorecardHeaderCells={postScorecardHeaderCells}
                postScorecardColCount={numRounds}
                showScorecard={false}
                filterBar={filterBar}
                onSortPos={() => toggleSort("pos")}
                onSortName={() => toggleSort("nome")}
                activeSortKey={sortKey}
                activeSortDir={sortDir}
              />
              <div className="muted fs-10 mt-8" style={{ padding: "0 8px" }}>
                * Hole-by-hole não disponível neste torneio. Source: pages.ffgolf.org/resultats — sistema oficial FFG.
              </div>
            </>
          )}
        </>
      )}
      {tab === "inscritos" && supp && <LGPIDFInscritosTab data={supp} />}
      {tab === "tee-times" && supp && <LGPIDFTeeTimesTab data={supp} />}
      {tab === "course-map" && supp && <LGPIDFCourseMapTab data={supp} />}
      {tab === "pdfs" && supp?.allPdfs && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 8 }}>
          {supp.allPdfs.map((p) => (
            <ExtLink key={p.filename} href={p.url} className="chip fs-12" style={{ textDecoration: "none", padding: "6px 10px" }}>
              📄 {p.kind}{p.category ? ` · ${p.category}` : ""}
            </ExtLink>
          ))}
        </div>
      )}
    </>
  );
}

/* ── DivView ─────────────────────────────────────────────────── */
function DivView({ data }: { data: FFGTournament }) {
  const tournament = useMemo(() => toFPGTournament(data), [data]);
  const scOptions = useMemo(() => ffgScorecardOptions(), []);
  return <IntlTournView tournament={tournament} scOptions={scOptions} siLabel="m" />;
}

/* ── LGPIDFView (PDF-only — mostra inscritos, tee times, course map) ─ */
function LGPIDFView({ data }: { data: LGPIDFTournament }) {
  type TabKey = "inscritos" | "tee-times" | "course-map" | "leaderboard";
  // Default tab: a primeira fonte com dados
  const defaultTab: TabKey =
    data.inscritosPdfs.length > 0 ? "inscritos" :
    data.teeTimePdfs.length > 0 ? "tee-times" :
    data.courseMapPdfs.length > 0 ? "course-map" :
    "leaderboard";
  const [tab, setTab] = useState<TabKey>(defaultTab);

  const totalInscritos = data.inscritosPdfs.reduce((s, p) => s + p.players.length, 0);
  const totalTeeTimeGroups = data.teeTimePdfs.reduce((s, p) => s + p.groups.length, 0);
  const totalCourseHoles = data.courseMapPdfs.reduce((s, p) => s + p.holes.length, 0);

  const tabs: Array<{ key: TabKey; label: string; count: number; show: boolean }> = [
    { key: "inscritos", label: "📋 Inscritos", count: totalInscritos, show: data.inscritosPdfs.length > 0 },
    { key: "tee-times", label: "🕐 Tee times", count: totalTeeTimeGroups, show: data.teeTimePdfs.length > 0 },
    { key: "course-map", label: "📐 Mapa do campo", count: totalCourseHoles, show: data.courseMapPdfs.length > 0 },
    { key: "leaderboard", label: "🏆 Leaderboard", count: data.players.length, show: data.players.length > 0 },
  ];

  // Formatar datas (PT)
  const fmtDate = (iso?: string | null) => {
    if (!iso) return null;
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  const dateStr = data.dateStart && data.dateEnd && data.dateStart !== data.dateEnd
    ? `${fmtDate(data.dateStart)} – ${fmtDate(data.dateEnd)}`
    : fmtDate(data.dateStart);

  return (
    <div className="lgpidf-view">
      <div className="muted fs-10 mb-8" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span>🇫🇷 Paris-Île-de-France</span>
        {dateStr && <span>· 📅 {dateStr}</span>}
        {data.course?.name && <span>· 📍 {data.course.name}</span>}
        {data.course && data.course.metersTotal > 0 && (
          <span>· {data.course.metersTotal.toLocaleString("pt-PT")} m</span>
        )}
      </div>
      {data.divisions && data.divisions.length > 0 && (
        <div className="fs-10 mb-8" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span className="muted">Divisões:</span>
          {data.divisions.map((d) => (
            <span key={d} className="chip" style={{ fontSize: 10 }} title={divisionLabel(d)}>
              <strong>{d}</strong> <span className="muted">— {divisionLabel(d)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Lista de PDFs descarregáveis */}
      {data.allPdfs && data.allPdfs.length > 0 && (
        <div className="mb-12" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span className="muted fs-10">📁 PDFs:</span>
          {data.allPdfs.map((p) => (
            <ExtLink key={p.filename} href={p.url} className="chip fs-10" style={{ textDecoration: "none" }}>
              📄 {p.kind}{p.category ? ` · ${p.category}` : ""}
            </ExtLink>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-12" style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)" }}>
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            className={`tab-under ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
            style={{ padding: "8px 12px", border: "none", background: "none", cursor: "pointer", fontSize: 13 }}
          >
            {t.label} <span className="muted">({t.count})</span>
          </button>
        ))}
      </div>

      {tab === "inscritos" && <LGPIDFInscritosTab data={data} />}
      {tab === "tee-times" && <LGPIDFTeeTimesTab data={data} />}
      {tab === "course-map" && <LGPIDFCourseMapTab data={data} />}
      {tab === "leaderboard" && <LGPIDFLeaderboardTab data={data} />}
    </div>
  );
}

function LGPIDFInscritosTab({ data }: { data: LGPIDFTournament }) {
  type SortKey = "pos" | "nome" | "club" | "category" | "hcp";
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("pos");
  const [catFilter, setCatFilter] = useState<string>("all");

  // Concatenar todas as listas de inscritos (1 PDF pode ter várias categorias)
  const all = useMemo(() => {
    const list: LGPIDFInscrito[] = [];
    for (const pdf of data.inscritosPdfs) for (const p of pdf.players) list.push(p);
    return list;
  }, [data]);

  const allCategories = useMemo(
    () => [...new Set(all.map((p) => p.category || ""))].filter(Boolean).sort(),
    [all],
  );

  const filtered = useMemo(
    () => catFilter === "all" ? all : all.filter((p) => p.category === catFilter),
    [all, catFilter],
  );

  const sorted = useMemo(() => {
    const list = [...filtered];
    const mult = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "pos":      v = (a.rank ?? 999) - (b.rank ?? 999); break;
        case "nome":     v = a.name.localeCompare(b.name); break;
        case "club":     v = (a.club || "").localeCompare(b.club || ""); break;
        case "category": v = (a.category || "").localeCompare(b.category || ""); break;
        case "hcp":      v = (a.hcp ?? 99) - (b.hcp ?? 99); break;
      }
      return mult * v;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const rows: ScorecardRow[] = useMemo(() => sorted.map((p, i) => {
    const manuel = isM(p.name);
    return {
      key: `${p.name}-${i}`,
      pos: p.scratch ? "SCR" : (p.rank ?? "—"),
      gross: 0,
      toPar: null,
      scores: [],
      isManuel: manuel,
      sortPos: p.rank,
      sortName: normalizeName(p.name),
      nameContent: (
        <>
          <span style={{ marginRight: 4 }}>{gf(p.nationality === "FRA" ? "FR" : (p.nationality || "FR"))}</span>
          <span className="fw-700">{normalizeName(p.name)}</span>
          {manuel && <> {" "}<ManuelPill /></>}
        </>
      ),
      prefixCells: (
        <>
          <td className="lb-club" title={p.club}>{p.club || "—"}</td>
          <td className="lb-hcp">{p.hcp != null ? p.hcp.toFixed(1) : "—"}</td>
          <td className="lb-tee" style={{ fontSize: 11 }}>{p.category || "—"}</td>
        </>
      ),
      postScorecardCells: (
        <td style={{ padding: "6px 8px", textAlign: "center" }}>
          {p.wildCard && <span className="chip" style={{ background: "var(--accent, #2563eb)", color: "#fff", fontSize: 10 }}>WC</span>}
          {p.scratch && <span className="chip" style={{ marginLeft: 4, fontSize: 10 }}>SCR</span>}
          {!p.wildCard && !p.scratch && <span className="muted fs-10">—</span>}
        </td>
      ),
    } as ScorecardRow;
  }), [sorted]);

  if (!all.length) return <div className="muted">Sem inscritos.</div>;

  const prefixHeaderCells = (
    <>
      <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-club">CLUBE</SortableHdr>
      <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-hcp">Idx</SortableHdr>
      <SortableHdr k="category" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-tee">CAT.</SortableHdr>
    </>
  );

  const postScorecardHeaderCells = (
    <th style={{ padding: "7px 8px", textAlign: "center" }}>WC/SCR</th>
  );

  const filterBar = (
    <div className="detail-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
      {allCategories.length > 1 && (
        <>
          <span className="fs-12 fw-700">Categoria:</span>
          <select className="input" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ maxWidth: 240 }}>
            <option value="all">Todas ({all.length})</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>
                {c} — {divisionLabel(c)} ({all.filter((p) => p.category === c).length})
              </option>
            ))}
          </select>
        </>
      )}
      <span className="muted fs-12">{sorted.length} inscritos</span>
      <div className="ml-auto gap-8 flex-wrap" style={{ display: "flex", alignItems: "center" }}>
        {data.inscritosPdfs.map((pdf) => (
          <ExtLink key={pdf.pdfFilename} href={pdf.pdfUrl} className="fs-11" style={{ color: "var(--chart-2)" }}>
            📄 PDF ↗
          </ExtLink>
        ))}
      </div>
    </div>
  );

  return (
    <ScorecardLeaderboard
      par={[]}
      rows={rows}
      prefixHeaderCells={prefixHeaderCells}
      postScorecardHeaderCells={postScorecardHeaderCells}
      postScorecardColCount={1}
      showScorecard={false}
      filterBar={filterBar}
      onSortPos={() => toggleSort("pos")}
      onSortName={() => toggleSort("nome")}
      activeSortKey={sortKey}
      activeSortDir={sortDir}
    />
  );
}

function LGPIDFTeeTimesTab({ data }: { data: LGPIDFTournament }) {
  type SortKey = "pos" | "nome" | "club" | "category" | "hcp" | "tee" | "hole";
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("tee");

  // Flatten todos os PDFs em rows de jogadores
  const allFlat = useMemo(() => {
    const list: Array<LGPIDFTeeTimePlayer & { groupNumber: number; pdfFilename: string }> = [];
    for (const pdf of data.teeTimePdfs) {
      for (const g of pdf.groups) {
        for (const p of g.players) {
          list.push({ ...p, groupNumber: g.groupNumber, pdfFilename: pdf.pdfFilename });
        }
      }
    }
    return list;
  }, [data]);

  const sorted = useMemo(() => {
    const list = [...allFlat];
    const mult = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "pos":      v = a.groupNumber - b.groupNumber; break;
        case "nome":     v = a.name.localeCompare(b.name); break;
        case "club":     v = (a.club || "").localeCompare(b.club || ""); break;
        case "category": v = (a.category || "").localeCompare(b.category || ""); break;
        case "hcp":      v = (a.hcp ?? 99) - (b.hcp ?? 99); break;
        case "tee":      v = (a.teeTime || "99:99").localeCompare(b.teeTime || "99:99"); break;
        case "hole":     v = (a.startHole ?? 99) - (b.startHole ?? 99); break;
      }
      return mult * v;
    });
    return list;
  }, [allFlat, sortKey, sortDir]);

  const rows: ScorecardRow[] = useMemo(() => sorted.map((p, i) => {
    const manuel = isM(p.name);
    return {
      key: `${p.name}-${i}`,
      pos: p.groupNumber,
      gross: 0,
      toPar: null,
      scores: [],
      isManuel: manuel,
      sortPos: p.groupNumber,
      sortName: normalizeName(p.name),
      nameContent: (
        <>
          <span style={{ marginRight: 4 }}>{gf("FR")}</span>
          <span className="fw-700">{normalizeName(p.name)}</span>
          {manuel && <> {" "}<ManuelPill /></>}
        </>
      ),
      prefixCells: (
        <>
          <td className="lb-club" title={p.club}>{p.club || "—"}</td>
          <td className="lb-hcp">{p.hcp != null ? p.hcp.toFixed(1) : "—"}</td>
          <td className="lb-tee" style={{ fontSize: 11 }}>{p.category || "—"}</td>
        </>
      ),
      postScorecardCells: (
        <>
          <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 600 }}>{p.teeTime || "—"}</td>
          <td style={{ padding: "6px 8px", textAlign: "center" }}>{p.startHole != null ? `T${p.startHole}` : "—"}</td>
        </>
      ),
    } as ScorecardRow;
  }), [sorted]);

  if (!allFlat.length) return <div className="muted">Sem tee-times.</div>;

  const prefixHeaderCells = (
    <>
      <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-club">CLUBE</SortableHdr>
      <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-hcp">Idx</SortableHdr>
      <SortableHdr k="category" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-tee">CAT.</SortableHdr>
    </>
  );

  const postScorecardHeaderCells = (
    <>
      <SortableHdr k="tee" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "center" }}>HORA</SortableHdr>
      <SortableHdr k="hole" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "center" }}>TEE</SortableHdr>
    </>
  );

  const filterBar = (
    <div className="detail-toolbar">
      <span className="muted fs-12">
        {allFlat.length} jogadores em {data.teeTimePdfs.reduce((s, p) => s + p.groups.length, 0)} grupos
      </span>
      <div className="ml-auto gap-8 flex-wrap" style={{ display: "flex", alignItems: "center" }}>
        {data.teeTimePdfs.map((pdf) => (
          <ExtLink key={pdf.pdfFilename} href={pdf.pdfUrl} className="fs-11" style={{ color: "var(--chart-2)" }}>
            📄 {pdf.pdfKind} ↗
          </ExtLink>
        ))}
      </div>
    </div>
  );

  return (
    <ScorecardLeaderboard
      par={[]}
      rows={rows}
      prefixHeaderCells={prefixHeaderCells}
      postScorecardHeaderCells={postScorecardHeaderCells}
      postScorecardColCount={2}
      showScorecard={false}
      filterBar={filterBar}
      onSortPos={() => toggleSort("pos")}
      onSortName={() => toggleSort("nome")}
      activeSortKey={sortKey}
      activeSortDir={sortDir}
    />
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
              <table className="data-table" style={{ width: "100%", fontSize: 12, textAlign: "center" }}>
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
                    {pdf.holes.map((h) => <td key={h.hole} style={{ fontSize: 10 }}>{h.entrySide.slice(0, 1)}</td>)}
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

function LGPIDFLeaderboardTab({ data }: { data: LGPIDFTournament }) {
  type SortKey = "pos" | "nome" | "club" | "division" | "hcp" | "r1" | "r2" | "total";
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("total");
  const [divFilter, setDivFilter] = useState<string>("all");

  const allDivisions = useMemo(
    () => [...new Set(data.players.map((p) => p.division || ""))].filter(Boolean).sort(),
    [data.players],
  );

  const filtered = useMemo(
    () => divFilter === "all" ? data.players : data.players.filter((p) => p.division === divFilter),
    [data.players, divFilter],
  );

  const sorted = useMemo(() => {
    const list = [...filtered];
    const mult = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "pos":      v = (a.pos ?? 999) - (b.pos ?? 999); break;
        case "nome":     v = a.name.localeCompare(b.name); break;
        case "club":     v = (a.club || "").localeCompare(b.club || ""); break;
        case "division": v = (a.division || "").localeCompare(b.division || ""); break;
        case "hcp":      v = (a.hcp ?? 99) - (b.hcp ?? 99); break;
        case "r1":       v = (a.r1 ?? 999) - (b.r1 ?? 999); break;
        case "r2":       v = (a.r2 ?? 999) - (b.r2 ?? 999); break;
        case "total":    v = (a.total ?? 999) - (b.total ?? 999); break;
      }
      return mult * v;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  // Par assumido por torneio: 72 é standard nos GP Jeunes franceses (18 buracos).
  // Como o PDF não nos dá par real, calculamos to-par como gross - 72.
  // Marcado na UI com asterisco e nota explicativa.
  const ASSUMED_PAR_18 = 72;
  const ASSUMED_PAR_TOTAL = data.rounds * ASSUMED_PAR_18;

  const rows: ScorecardRow[] = useMemo(() => sorted.map((p, i) => {
    const manuel = isM(p.name);
    const gross = p.total ?? 0;
    const toPar = gross > 0 ? gross - ASSUMED_PAR_TOTAL : null;
    return {
      key: `${p.name}-${i}`,
      pos: p.pos ?? (i + 1),
      gross,
      toPar,  // gross - par(72×rondas) — PAR ASSUMIDO, ver nota no filterBar
      scores: [],
      isManuel: manuel,
      sortPos: p.pos,
      sortName: normalizeName(p.name),
      nameContent: (
        <>
          <span style={{ marginRight: 4 }}>{gf("FR")}</span>
          <span className="fw-700">{normalizeName(p.name)}</span>
          {manuel && <> {" "}<ManuelPill /></>}
          {p.dnf && <span className="chip" style={{ marginLeft: 4, fontSize: 10, background: "var(--bg-muted)" }}>DNF</span>}
        </>
      ),
      prefixCells: (
        <>
          <td className="lb-club" title={p.club}>{p.club || "—"}</td>
          <td className="lb-hcp">{p.hcp != null ? p.hcp.toFixed(1) : "—"}</td>
          <td className="lb-tee" style={{ fontSize: 11 }}>{p.division || "—"}</td>
        </>
      ),
      postScorecardCells: (
        <>
          <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.r1 ?? "—"}</td>
          <td style={{ padding: "6px 8px", textAlign: "right" }}>{p.r2 ?? "—"}</td>
        </>
      ),
    } as ScorecardRow;
  }), [sorted, ASSUMED_PAR_TOTAL]);

  if (!data.players.length) return <div className="muted">Sem leaderboard ainda.</div>;

  const prefixHeaderCells = (
    <>
      <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-club">CLUBE</SortableHdr>
      <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-hcp">Idx</SortableHdr>
      <SortableHdr k="division" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-tee">DIV.</SortableHdr>
    </>
  );

  const postScorecardHeaderCells = (
    <>
      <SortableHdr k="r1" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "right" }}>R1</SortableHdr>
      <SortableHdr k="r2" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "right" }}>R2</SortableHdr>
    </>
  );

  const filterBar = (
    <div className="detail-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
      {allDivisions.length > 1 && (
        <>
          <span className="fs-12 fw-700">Divisão:</span>
          <select className="input" value={divFilter} onChange={(e) => setDivFilter(e.target.value)} style={{ maxWidth: 240 }}>
            <option value="all">Todas ({data.players.length})</option>
            {allDivisions.map((d) => (
              <option key={d} value={d}>
                {d} — {divisionLabel(d)} ({data.players.filter((p) => p.division === d).length})
              </option>
            ))}
          </select>
        </>
      )}
      <span className="muted fs-12">
        {sorted.length} jogadores · ± calculado vs par {ASSUMED_PAR_18}* · scores validados por soma R1+R2=Total
      </span>
    </div>
  );

  return (
    <>
      <ScorecardLeaderboard
        par={[]}
        rows={rows}
        prefixHeaderCells={prefixHeaderCells}
        postScorecardHeaderCells={postScorecardHeaderCells}
        postScorecardColCount={2}
        showScorecard={false}
        filterBar={filterBar}
        onSortPos={() => toggleSort("pos")}
        onSortName={() => toggleSort("nome")}
        activeSortKey={sortKey}
        activeSortDir={sortDir}
      />
      <div className="muted fs-10 mt-8" style={{ padding: "0 8px" }}>
        * Par 72 assumido (standard nos Grand Prix Jeunes franceses 18 buracos). Distância real do campo só está disponível quando o PDF do mapa do campo é descarregado.
      </div>
    </>
  );
}

/* ── FStats ──────────────────────────────────────────────────── */
function FStats({ data }: { data: FFGTournament }) {
  const { players } = data;
  const full = players.filter((p) => p.rounds.length === data.rounds);
  const avg = full.length ? full.reduce((s, p) => s + (p.total ?? 0), 0) / full.length : 0;
  return (
    <div className="muted fs-10 mb-8">
      {full.length} jogadores
      {data.rounds > 1 && (
        <>
          {" "}(<RoundPill nR={data.rounds} />)
        </>
      )}
      {players.length > full.length ? ` + ${players.length - full.length} parciais` : ""}
      {full.length > 0 && (
        <>
          {" · "}Média total: {avg.toFixed(1)}
          {" · "}Líder: {normalizeName(full[0]?.name)} ({full[0]?.total})
          {" · "}Par {data.course.parTotal} · {data.course.metersTotal.toLocaleString("pt-PT")} m
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN CONTENT
   ═══════════════════════════════════════════════════════════════ */
/* Selecção pode ser GG (catálogo), LGPIDF (PDFs), FFG Resultats, ou categorias info */
type SelectionKind = "gg" | "lgpidf" | "ffgres" | "categories";
interface Selection { kind: SelectionKind; key: string }

function Content() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogErr, setCatalogErr] = useState<string | null>(null);
  const [data, setData] = useState<Map<string, FFGTournament>>(new Map());
  const [lgpidfIndex, setLgpidfIndex] = useState<LGPIDFIndex | null>(null);
  const [lgpidfData, setLgpidfData] = useState<Map<string, LGPIDFTournament>>(new Map());
  const [ffgResIndex, setFfgResIndex] = useState<FFGResIndex | null>(null);
  const [ffgResData, setFfgResData] = useState<Map<string, FFGResTournament>>(new Map());
  const [ffgCategories, setFfgCategories] = useState<FFGCategoriesData | null>(null);
  // Filtros FFG sidebar (TÊM de estar antes de qualquer return — Rules of Hooks)
  const [ffgFilterYear, setFfgFilterYear] = useState<string>("all");
  const [ffgFilterLigue, setFfgFilterLigue] = useState<string>("all");
  const [ffgFilterType, setFfgFilterType] = useState<string>("all");
  const [ffgFilterText, setFfgFilterText] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);
  const { kidsMap } = useKidsLinkMap();
  const md = useMasterDetail();
  const [fileMeta, setFileMeta] = useState<DataSource[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Invalidar cache para evitar respostas falhadas em cache
      invalidateCache("/data/ffgolf-catalog.json");
      invalidateCache("/data/ffgolf-lgpidf-index.json");
      invalidateCache("/data/ffgolf-resultats-index.json");
      try {
        const cat = await cachedFetchJson<Catalog>("/data/ffgolf-catalog.json");
        if (!cat) throw new Error("ffgolf-catalog.json não encontrado (404)");
        if (!alive) return;
        setCatalog(cat);
        setFileMeta((p) => [...p, { path: "/data/ffgolf-catalog.json", status: "loaded", count: cat.tournaments.length, group: "ffg" }]);

        // Tentar carregar cada torneio individualmente
        const dataMap = new Map<string, FFGTournament>();
        await Promise.all(
          cat.tournaments
            .filter((t) => t.gg_page)
            .map(async (t) => {
              const url = `/data/ffgolf/${t.year}_${t.slug}.json`;
              try {
                const td = await cachedFetchJson<FFGTournament>(url);
                if (td) dataMap.set(`${t.year}_${t.slug}`, td);
              } catch {
                /* missing file is fine */
              }
            })
        );
        if (!alive) return;
        setData(dataMap);
        setFileMeta((p) => [...p, { path: "/data/ffgolf/*.json", status: "loaded", count: dataMap.size, group: "ffg" }]);

        // Carregar LGPIDF index e respectivos JSONs
        try {
          const lgIdx = await cachedFetchJson<LGPIDFIndex>("/data/ffgolf-lgpidf-index.json");
          if (lgIdx && alive) {
            setLgpidfIndex(lgIdx);
            setFileMeta((p) => [...p, { path: "/data/ffgolf-lgpidf-index.json", status: "loaded", count: lgIdx.total, group: "ffg" }]);
            const lgMap = new Map<string, LGPIDFTournament>();
            await Promise.all(lgIdx.tournaments.map(async (t) => {
              try {
                const td = await cachedFetchJson<LGPIDFTournament>(`/data/ffgolf/${t.file}`);
                if (td) lgMap.set(`${t.year}_${t.slug}`, td);
              } catch { /* skip */ }
            }));
            if (alive) {
              setLgpidfData(lgMap);
              setFileMeta((p) => [...p, { path: "/data/ffgolf/lgpidf-*.json", status: "loaded", count: lgMap.size, group: "ffg" }]);
            }
          }
        } catch { /* lgpidf index opcional */ }

        // Carregar categorias de idade FFG (Vademecum)
        try {
          const cats = await cachedFetchJson<FFGCategoriesData>("/data/ffg-categories-age.json");
          if (cats && alive) setFfgCategories(cats);
        } catch { /* opcional */ }

        // Carregar FFG Resultats (sistema central FFG) — todas as ligas + anos
        try {
          const ffgIdx = await cachedFetchJson<FFGResIndex>("/data/ffgolf-resultats-index.json");
          if (ffgIdx && alive) {
            setFfgResIndex(ffgIdx);
            setFileMeta((p) => [...p, { path: "/data/ffgolf-resultats-index.json", status: "loaded", count: ffgIdx.total, group: "ffg" }]);
            const fMap = new Map<string, FFGResTournament>();
            await Promise.all(ffgIdx.tournaments.map(async (t) => {
              try {
                const td = await cachedFetchJson<FFGResTournament>(`/data/ffgolf-resultats/${t.file}`);
                if (td) fMap.set(t.trnId, td);
              } catch { /* skip */ }
            }));
            if (alive) {
              setFfgResData(fMap);
              setFileMeta((p) => [...p, { path: "/data/ffgolf-resultats/*.json", status: "loaded", count: fMap.size, group: "ffg" }]);
            }
          }
        } catch { /* ffg resultats index opcional */ }

        setLoading(false);
      } catch (e) {
        if (alive) {
          const msg = String((e as Error)?.message || e);
          setCatalogErr(msg);
          setFileMeta((p) => [...p, { path: "/data/ffgolf-catalog.json", status: "error", error: msg, group: "ffg" }]);
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <LoadingState />;
  if (!catalog) {
    return (
      <div className="center-msg muted">
        Catálogo FFGolf não disponível.<br />
        <span className="fs-10">Esperado em <code>public/data/ffgolf-catalog.json</code></span>
        {catalogErr && <><br /><span className="fs-10" style={{ color: "var(--danger)" }}>Erro: {catalogErr}</span></>}
      </div>
    );
  }

  // Lista visível GG: só torneios que TÊM dados scrapados
  const visibleEntries = catalog.tournaments
    .filter((t) => t.gg_page && data.has(`${t.year}_${t.slug}`))
    .sort((a, b) => (b.year - a.year) || a.title.localeCompare(b.title));

  // Lista visível FFG Resultats: ordenada por dateIso DESC (mais recente primeiro)
  const ffgResAll = (ffgResIndex?.tournaments || []).filter((t) => ffgResData.has(t.trnId));
  const ffgResVisible = ffgResAll
    .filter((t) => ffgFilterYear === "all" || String(t.year) === ffgFilterYear)
    .filter((t) => ffgFilterLigue === "all" || t.ligue === ffgFilterLigue)
    .filter((t) => ffgFilterType === "all" || t.typeCompetition === ffgFilterType)
    .filter((t) => !ffgFilterText || t.name.toLowerCase().includes(ffgFilterText.toLowerCase()))
    .sort((a, b) => (b.dateIso || "").localeCompare(a.dateIso || ""));

  // Listas únicas de filtro
  const ffgYears = [...new Set(ffgResAll.map((t) => String(t.year || "?")))].sort((a, b) => b.localeCompare(a));
  const ffgLigues = [...new Set(ffgResAll.map((t) => t.ligue))].sort();
  const ffgTypes = [...new Set(ffgResAll.map((t) => t.typeCompetition))].sort();
  const LIGUE_LABELS: Record<string, string> = {
    "00": "Nacional (Federales)",
    "01": "Paris-Île-de-France", "02": "Auvergne-Rhône-Alpes", "03": "Nouvelle-Aquitaine",
    "04": "PACA", "06": "Occitanie", "07": "Hauts-de-France", "08": "Grand-Est",
    "09": "Normandie", "10": "Pays de la Loire", "11": "Bretagne", "12": "Centre-Val de Loire",
    "13": "Bourgogne-F.-Comte", "14": "Réunion", "15": "Corse", "16": "Nouvelle-Calédonie",
    "17": "Guadeloupe", "18": "Polynésie", "19": "Clubs étrangers", "20": "Martinique",
    "21": "Guyane", "22": "Outre-Mer",
  };
  const TYPE_LABELS: Record<string, string> = {
    "01": "Compétitions Fédérales (juvenis)",
    "03": "Grands Prix Jeunes",
  };

  // Match LGPIDF → FFG Officiel por data (DD/MM/YYYY <-> YYYY-MM-DD)
  // Cada entry FFG ganha a "supplementary" info do LGPIDF (PDFs, inscritos, tee-times)
  function findMatchingLgpidf(ffgEntry: FFGResIndexEntry): LGPIDFTournament | null {
    if (!ffgEntry.dateIso) return null;
    const lgEntries = lgpidfIndex?.tournaments || [];
    for (const lgEntry of lgEntries) {
      const lg = lgpidfData.get(`${lgEntry.year}_${lgEntry.slug}`);
      if (!lg) continue;
      // Match por data (FFG dateIso === LGPIDF dateStart)
      if (lg.dateStart === ffgEntry.dateIso) {
        // Extra: também verificar se nomes têm palavras-chave em comum
        const ffgWords = ffgEntry.name.toLowerCase().split(/[\s-]+/);
        const lgWords = lg.tournament.toLowerCase().split(/[\s-]+/);
        const overlap = ffgWords.filter((w) => w.length > 3 && lgWords.includes(w));
        if (overlap.length >= 2) return lg;
      }
    }
    return null;
  }

  // Set de keys LGPIDF que já foram matched a um FFG (para não mostrar duplicado)
  const matchedLgpidfKeys = new Set<string>();
  for (const ffgEntry of ffgResVisible) {
    const lg = findMatchingLgpidf(ffgEntry);
    if (lg) matchedLgpidfKeys.add(`${lg.year}_${lg.slug}`);
  }

  // Lista visível LGPIDF: só torneios cujo JSON foi carregado E que NÃO bateram com FFG Officiel
  // (Os que bateram aparecem como sub-info dentro da entrada FFG correspondente)
  const lgVisible = (lgpidfIndex?.tournaments || [])
    .filter((t) => lgpidfData.has(`${t.year}_${t.slug}`))
    .filter((t) => !matchedLgpidfKeys.has(`${t.year}_${t.slug}`))
    .sort((a, b) => {
      // Ordenar por dateStart do JSON (não está no manifest, ler do data carregado)
      const aData = lgpidfData.get(`${a.year}_${a.slug}`);
      const bData = lgpidfData.get(`${b.year}_${b.slug}`);
      const aDate = aData?.dateStart || "";
      const bDate = bData?.dateStart || "";
      // Mais recente primeiro
      return bDate.localeCompare(aDate);
    });

  if (!visibleEntries.length && !lgVisible.length) {
    return (
      <div className="center-msg muted">
        Nenhum torneio FFGolf scrapado ainda.<br />
        <span className="fs-10">
          {catalog.tournaments.length} torneios mapeados no catálogo. Falta scrape:
          coloca os JSONs em <code>public/data/ffgolf/{`{ano}_{slug}.json`}</code>.
        </span>
      </div>
    );
  }

  // Resolver selecção actual (default: 1ª GG ou 1ª LGPIDF se não há GG)
  const effectiveSelection: Selection = selection || (
    visibleEntries.length > 0
      ? { kind: "gg", key: `${visibleEntries[0].year}_${visibleEntries[0].slug}` }
      : { kind: "lgpidf", key: `${lgVisible[0].year}_${lgVisible[0].slug}` }
  );

  const cur = effectiveSelection.kind === "gg" ? data.get(effectiveSelection.key) : null;
  const lgCur = effectiveSelection.kind === "lgpidf" ? lgpidfData.get(effectiveSelection.key) : null;
  const ffgCur = effectiveSelection.kind === "ffgres" ? ffgResData.get(effectiveSelection.key) : null;
  const ffgCurMeta = ffgCur ? ffgResIndex?.tournaments.find((t) => t.trnId === ffgCur.trnId) : null;

  // Agrupar GG por ano para sidebar
  // const ggYears = [...new Set(visibleEntries.map((e) => e.year))].sort((a, b) => b - a); // GG section removed
  const lgYears = [...new Set(lgVisible.map((e) => e.year))].sort((a, b) => b - a);

  return (
    <KidsLinkCtx.Provider value={kidsMap}>
      <DataSourcesProvider tournaments={[]}>
        <div className="tourn-layout">
          <Toolbar>
            <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />
            <ToolbarTitle>🇫🇷 FFG</ToolbarTitle>
            <DataSourcesChip sources={fileMeta} />
            {cur && cur.course?.name && <ToolbarMeta>📍 {cur.course.name}</ToolbarMeta>}
            {cur && (() => {
              const full = cur.players.filter((p) => p.rounds.length === cur.rounds).length;
              return <span className="chip ml-auto">{fmtFieldInfo(full, cur.rounds, shortTitle(cur))}</span>;
            })()}
            {lgCur && (
              <span className="chip ml-auto">
                📋 {lgCur.inscritosPdfs.reduce((s, p) => s + p.players.length, 0)} inscritos · {lgCur.players.length} resultados
              </span>
            )}
          </Toolbar>

          {/* ── Barra de filtros FFG (estilo FPGPage) ── */}
          {ffgResAll.length > 0 && (
            <div className="detail-toolbar" style={{ flexWrap: "nowrap", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-muted, #fafafa)", overflowX: "auto", whiteSpace: "nowrap", alignItems: "center" }}>
              <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180, maxWidth: 320 }}>
                <input
                  className="input"
                  placeholder="🔍 Pesquisar torneio..."
                  value={ffgFilterText}
                  onChange={(e) => setFfgFilterText(e.target.value)}
                  style={{ padding: "5px 26px 5px 10px", fontSize: 13, width: "100%", boxSizing: "border-box" }}
                />
                {ffgFilterText && (
                  <button
                    onClick={() => setFfgFilterText("")}
                    style={{ position: "absolute", right: 4, top: 4, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", fontSize: 16 }}
                    aria-label="Limpar pesquisa"
                  >×</button>
                )}
              </div>
              <select className="input" value={ffgFilterYear} onChange={(e) => setFfgFilterYear(e.target.value)} style={{ padding: "5px 8px", fontSize: 13 }}>
                <option value="all">📅 Todos os anos</option>
                {ffgYears.map((y) => <option key={y} value={y}>{y} ({ffgResAll.filter((t) => String(t.year) === y).length})</option>)}
              </select>
              <select className="input" value={ffgFilterType} onChange={(e) => setFfgFilterType(e.target.value)} style={{ padding: "5px 8px", fontSize: 13 }}>
                <option value="all">🏆 Todos os tipos</option>
                {ffgTypes.map((t) => <option key={t} value={t}>{TYPE_LABELS[t] || t} ({ffgResAll.filter((x) => x.typeCompetition === t).length})</option>)}
              </select>
              <select className="input" value={ffgFilterLigue} onChange={(e) => setFfgFilterLigue(e.target.value)} style={{ padding: "5px 8px", fontSize: 13 }}>
                <option value="all">🇫🇷 Todas as ligas</option>
                {ffgLigues.map((l) => <option key={l} value={l}>{LIGUE_LABELS[l] || l} ({ffgResAll.filter((t) => t.ligue === l).length})</option>)}
              </select>
              <span className="muted fs-12" style={{ marginLeft: 4 }}>
                {ffgResVisible.length} de {ffgResAll.length} torneios
              </span>
              {(ffgFilterText || ffgFilterYear !== "all" || ffgFilterLigue !== "all" || ffgFilterType !== "all") && (
                <button
                  onClick={() => { setFfgFilterText(""); setFfgFilterYear("all"); setFfgFilterLigue("all"); setFfgFilterType("all"); }}
                  className="chip"
                  style={{ cursor: "pointer", fontSize: 11 }}
                >
                  ✕ Limpar
                </button>
              )}
            </div>
          )}

          <div className="master-detail">
            <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
              {/* ── Item info: Catégories d'âge FFG ── */}
              {ffgCategories && (
                <button
                  className={`course-item ${effectiveSelection.kind === "categories" ? "active" : ""}`}
                  onClick={() => {
                    setSelection({ kind: "categories", key: "ffg-cats" });
                    md.onSelect();
                  }}
                  style={{ borderLeft: "3px solid var(--color-ffg-dark)" }}
                >
                  <div className="course-item-name">📚 Catégories d'âge FFG</div>
                  <div className="course-item-meta">
                    {ffgCategories.categories.length} categorias · Millésime → idade → U-age internacional
                  </div>
                  <div className="course-item-meta" style={{ fontSize: 10 }}>
                    Vademecum FFG · Cahier des charges
                  </div>
                </button>
              )}


              {/* ── Secção FFG Resultats (sistema central FFG, todas ligas) ── */}
              {ffgResVisible.length > 0 && [...new Set(ffgResVisible.map((t) => t.year || 0))].sort((a, b) => b - a).map((year) => {
                const yearEntries = ffgResVisible.filter((e) => (e.year || 0) === year);
                return (
                  <React.Fragment key={`ffgres-${year}`}>
                    <SidebarSectionTitle
                      dark
                      color="var(--color-ffg-dark)"
                      textColor="#ffffff"
                      borderColor="var(--color-ffg-mid)"
                      letterSpacing="0.08em"
                    >
                      🇫🇷 FFG Officiel — Grand Prix Jeunes
                    </SidebarSectionTitle>
                    <div
                      className="sidebar-year-label"
                      style={{
                        padding: "2px 10px",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        color: "#ffffff",
                        textTransform: "uppercase",
                        marginTop: 4,
                        background: "var(--color-ffg-dark)",
                      }}
                    >
                      {year || "Sem data"}
                    </div>
                    {yearEntries.map((entry) => {
                      const t = ffgResData.get(entry.trnId);
                      if (!t) return null;
                      const manuelPlayed = t.details.series.some((s) => s.players.some((p) => isM(p.name)));
                      const allPlayers = t.details.series.flatMap((s) => s.players);
                      const tHasT4 = allPlayers.some((p) => p.t4 != null);
                      const tHasT3 = allPlayers.some((p) => p.t3 != null);
                      const tRounds = tHasT4 ? 4 : tHasT3 ? 3 : 2;
                      const active = effectiveSelection.kind === "ffgres" && effectiveSelection.key === entry.trnId;
                      return (
                        <button
                          key={entry.trnId}
                          className={`course-item ${active ? "active" : ""}`}
                          onClick={() => {
                            setSelection({ kind: "ffgres", key: entry.trnId });
                            md.onSelect();
                          }}
                        >
                          <div className="course-item-name">{entry.name}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4, alignItems: "center" }}>
                            <span className="chip" style={{
                              fontSize: 9,
                              background: entry.typeCompetition === "01" ? "var(--color-ffg-dark)" : "var(--color-ffg-mid)",
                              color: "#fff",
                              padding: "1px 6px",
                              borderRadius: 8,
                            }}>
                              {entry.typeCompetition === "01" ? "Federal" : "GP Jeunes"}
                            </span>
                            <span className="chip" style={{
                              fontSize: 9,
                              background: "var(--bg-muted, #e5e7eb)",
                              color: "var(--text-2)",
                              padding: "1px 6px",
                              borderRadius: 8,
                            }}>
                              📍 {LIGUE_LABELS[entry.ligue] || entry.ligue}
                            </span>
                            <RoundPill nR={tRounds} />
                          </div>
                          {entry.date && (
                            <div className="course-item-meta" style={{ fontSize: 11, marginTop: 4 }}>📅 {entry.date}</div>
                          )}
                          <div className="course-item-meta">
                            🏆 {entry.totalPlayers} jog · {entry.seriesCount} séries
                          </div>
                          {manuelPlayed && (
                            <span style={{ display: "inline-block", marginTop: 4 }}>
                              <ManuelPill />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </React.Fragment>
                );
              })}

              {/* ── Secção LGPIDF (PDFs Paris-Île-de-France) ── */}
              {lgVisible.length > 0 && lgYears.map((year) => {
                const yearEntries = lgVisible.filter((e) => e.year === year);
                return (
                  <React.Fragment key={`lg-${year}`}>
                    <SidebarSectionTitle
                      dark
                      color="var(--color-ffg-mid, #002654)"
                      textColor="#ffffff"
                      borderColor="var(--color-ffg-dark)"
                      letterSpacing="0.08em"
                    >
                      🇫🇷 LGPIDF — Paris-Île-de-France (PDF)
                    </SidebarSectionTitle>
                    <div
                      className="sidebar-year-label"
                      style={{
                        padding: "2px 10px",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        color: "#ffffff",
                        textTransform: "uppercase",
                        marginTop: 4,
                        background: "var(--color-ffg-mid, #002654)",
                      }}
                    >
                      {year} · PDF
                    </div>
                    {yearEntries.map((entry) => {
                      const key = `${entry.year}_${entry.slug}`;
                      const t = lgpidfData.get(key);
                      if (!t) return null;
                      const inscritos = t.inscritosPdfs.reduce((s, p) => s + p.players.length, 0);
                      const manuelInscrito = t.inscritosPdfs.some((p) => p.players.some((pl) => isM(pl.name)));
                      const manuelPlayed = t.players.some((p) => isM(p.name));
                      const active = effectiveSelection.kind === "lgpidf" && effectiveSelection.key === key;
                      return (
                        <button
                          key={entry.slug}
                          className={`course-item ${active ? "active" : ""}`}
                          onClick={() => {
                            setSelection({ kind: "lgpidf", key });
                            md.onSelect();
                          }}
                        >
                          <div className="course-item-name">{entry.tournament}</div>
                          {t.course?.name && (
                            <div className="course-item-meta" style={{ fontWeight: 600, color: "var(--text-2)" }}>
                              ⛳ {t.course.name}
                              {t.course.metersTotal > 0 && ` · ${t.course.metersTotal.toLocaleString("pt-PT")} m`}
                            </div>
                          )}
                          {t.dateStart && (
                            <div className="course-item-meta" style={{ fontSize: 11 }}>
                              📅 {(() => {
                                const [y, m, d] = t.dateStart.split("-");
                                if (t.dateEnd && t.dateEnd !== t.dateStart) {
                                  const [, , d2] = t.dateEnd.split("-");
                                  return `${d}–${d2}/${m}/${y}`;
                                }
                                return `${d}/${m}/${y}`;
                              })()}
                            </div>
                          )}
                          <div className="course-item-meta">
                            {inscritos > 0 && <>📋 {inscritos} inscritos</>}
                            {t.players.length > 0 && <> · 🏆 {t.players.length} no leaderboard</>}
                            {entry.divisions.length > 0 && <> · {entry.divisions.join("/")}</>}
                          </div>
                          {(manuelInscrito || manuelPlayed) && (
                            <span style={{ display: "inline-block", marginTop: 4 }}>
                              <ManuelPill />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>

            <div className="course-detail" ref={md.detailRef}>
              {effectiveSelection.kind === "categories" && ffgCategories ? (
                <CategoriesView data={ffgCategories} />
              ) : cur ? (
                <>
                  <DetailHeader
                    title={`${cur.year} // ${shortTitle(cur)}`}
                    sub={
                      <>
                        <span className="muted">
                          {cur.tournament}
                          {cur.course?.name && (
                            <>
                              {" "}— 📍 {cur.course.name}
                              {cur.course.tee ? ` (${cur.course.tee})` : ""}
                            </>
                          )}
                        </span>
                        <ExtLink href={cur.source} className="tourn-ext-link" style={{ marginLeft: 8 }}>
                          🔗 Leaderboard oficial
                        </ExtLink>
                      </>
                    }
                  />
                  <FStats data={cur} />
                  <DivView data={cur} />
                </>
              ) : lgCur ? (
                <>
                  <DetailHeader
                    title={`${lgCur.year} // ${lgCur.tournament}`}
                    sub={
                      <span className="muted">
                        🇫🇷 LGPIDF · {lgCur.format || "PDF only"}
                        {lgCur.course?.name && <> · 📍 {lgCur.course.name}</>}
                      </span>
                    }
                  />
                  <LGPIDFView data={lgCur} />
                </>
              ) : ffgCur && ffgCurMeta ? (
                <>
                  <DetailHeader
                    title={`${ffgCurMeta.year || ""} // ${ffgCur.name}`}
                    sub={
                      <>
                          <span className="muted">
                          🇫🇷 FFG Officiel · {ffgCur.formule} · 📅 {ffgCur.date} · {ffgCur.details.series.length} séries
                        </span>
                        <ExtLink
                          href={`https://pages.ffgolf.org/resultats/`}
                          className="tourn-ext-link"
                          style={{ marginLeft: 8 }}
                        >
                          🔗 Ver no FFG (scorecards hole-by-hole)
                        </ExtLink>
                      </>
                    }
                  />
                  <FFGResView data={ffgCur} lgpidfSupp={findMatchingLgpidf(ffgCurMeta)} />
                </>
              ) : (
                <div className="center-msg muted">Dados não disponíveis</div>
              )}
            </div>
          </div>
        </div>
      </DataSourcesProvider>
    </KidsLinkCtx.Provider>
  );
}

export default function FFGPage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <Content />;
}
