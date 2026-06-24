/**
 * RFEGPage.tsx — Tracker de torneios juvenis espanhois
 *
 * Agrega 2 fontes:
 *  - rfegolf.es (Campeonatos Nacionais) via scripts/scrape-rfegolf-node.js
 *  - nextcaddy.com (RFGA Andaluzia + FGM Madrid) via scripts/scrape-nextcaddy.js
 *
 * Layout master/detail (igual FPGPage / FFGPage): sidebar com torneios agrupados
 * por ano + DetailHeader + tabela de inscritos/resultados.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cachedFetchJson } from "../data/fetchCache";
import { adaptFcg, fcgToFPGTournament, type FCGDetail, type MinimalRFEGShape } from "../data/fcgAdapter";
import { useMasterDetail } from "../hooks/useMasterDetail";
import { useSort } from "../hooks/useSort";
import { useKidsLinkMap } from "../hooks/useKidsLinkMap";
import { KidsLink, KidsLinkCtx } from "../ui/KidsLink";
import DetailHeader from "../ui/DetailHeader";
import EmptyState from "../ui/EmptyState";
import LoadingState from "../ui/LoadingState";
import SidebarToggle from "../ui/SidebarToggle";
import SidebarSectionTitle from "../ui/SidebarSectionTitle";
import { Toolbar, ToolbarTitle, ToolbarMeta } from "../ui/Toolbar";
import { RoundPill, EscPill, YearPill, ManuelPill, SUB_TO_ES_TERM } from "../ui/PillBadge";
import SortableHdr from "../ui/SortableHdr";
import SexBadge from "../ui/SexBadge";
import ExtLink from "../ui/ExternalLink";
import { ScorecardLeaderboard, type ScorecardRow } from "../ui/ScorecardLeaderboard";
import { isManuelByName as isM } from "../constants/manuel";
import { displayName, fmtToPar } from "../utils/format";
import { tpColor } from "../ui/tournamentPrimitives";
import { flag } from "../utils/flagUtils";
import { formatPlayerName } from "../utils/playerUtils";
import { IntlTournView } from "../ui/IntlTournView";
import DrawTab from "../ui/DrawTab";
import type { FpgDraw, FpgDrawFlight } from "../data/nacional2026Loader";
import type { Tournament as FPGTournament, Player as FPGPlayer, RoundScore as FPGRoundScore, ScorecardOptions } from "./FPGPage";
import { RFEGFederationsView } from "./rfeg/FederationsView";
import { RFEGPlayersView } from "./rfeg/PlayersView";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitEntry, CircuitConfig, CircuitDivision, CircuitInscritoRow, CircuitSex, CircuitLink } from "../ui/circuit/types";

/* ── Types ──────────────────────────────────────────────── */

interface RFEGIndexEntry {
  source: "rfegolf" | "nextcaddy" | "livegolfscoring" | "golfdirecto";
  id: number | string;
  compId?: number;
  tourId?: number;
  file: string;
  filePath: string;
  name: string;
  year: number | null;
  category: string | null;
  sex: string | null;
  dateStart: string | null;
  dateEnd: string | null;
  dateStartIso: string | null;
  dateEndIso: string | null;
  course: string | null;
  courseClubId?: number | null;
  courseCode?: string | null;
  organizer?: string | null;
  format?: string | null;
  categories?: string[];
  mode?: string | null;
  style?: string | null;
  hcpLimitMen?: number | null;
  hcpLimitWomen?: number | null;
  counts: {
    admitidos: number;
    reservas: number;
    bajas: number;
    invitados: number;
    noAdmitidos: number;
    provisional: number;
  };
  leaderboardPlayers?: number;
  /** Número de rondas (LGS expõe; NC/RFEGolf ficam undefined). */
  nRounds?: number;
  /** Federação organizadora (RFEGolf detail meta.federation). */
  federation?: string | null;
  /** Pré-computados pelo build do índice (páginas lazy): há Manuel / portugueses? */
  hasManuel?: boolean;
  hasPt?: boolean;
  scrapedAt: string | null;
}

interface RFEGIndex {
  generatedAt: string;
  source?: string;
  total: number;
  totalCompetitions?: number;
  byYear: Record<string, number>;
  byCategory: Record<string, number>;
  bySource?: Record<string, number>;
  tournaments: RFEGIndexEntry[];
}

interface RFEGPlayer {
  pos: number | null;
  name: string | null;
  licencia: string | null;
  pais: string | null;
  hcp: number | null;
  catEdad: string | null;
  sexo: string | null;
  club: string | null;
  dob: string | null;
  estado: string | null;
  rounds?: { round: number; gross: number | null; scores?: number[] }[];
  total?: number | null;
  toPar?: number | null;
}

interface RFEGDetail {
  compId: number;
  ok: boolean;
  scrapedAt: string;
  meta: {
    name: string | null;
    dateStart: string | null;
    dateEnd: string | null;
    course: string | null;
    courseClubId: number | null;
    players: number | null;
    hcpLimitMen: number | null;
    hcpLimitWomen: number | null;
    mode: string | null;
    style: string | null;
    category: string | null;
    sex: string | null;
    federation: string | null;
    federationCatId: number | null;
  };
  /** Par real do campo (vem do JSON quando disponível — para NextCaddy é inferido
   *  a partir dos scores hole-by-hole, para RFEGolf vem como null). */
  coursePar?: number[] | null;
  parConfidence?: "high" | "medium" | "low";
  inscritos: {
    admitidos: RFEGPlayer[];
    reservas: RFEGPlayer[];
    bajas: RFEGPlayer[];
    invitados: RFEGPlayer[];
    noAdmitidos: RFEGPlayer[];
    provisional: RFEGPlayer[];
    counts: RFEGIndexEntry["counts"];
  };
  /** Leaderboards finais parseados a partir dos PDFs anexos em ListaResultados.aspx.
   *  Cada grupo tem categoria/sexo + array de jogadores com R1..Rn + total + ±par.
   *  Vazio quando a federação ainda não publicou PDFs (~65% dos torneios). */
  results?: Array<{
    label: string;
    sexo: string;
    categoria: string;
    pdfUrl: string;
    nRounds: number | null;
    courseRating: number | null;
    slope: number | null;
    players: Array<{
      pos: number | null;
      name: string;
      toPar: number;
      hoy: number;
      rounds: number[];
      total: number;
    }>;
  }>;
}

type ListKind = "admitidos" | "reservas" | "bajas" | "invitados" | "noAdmitidos" | "provisional";

const LIST_LABELS: Record<ListKind, string> = {
  admitidos: "Admitidos",
  reservas: "Reservas",
  bajas: "Bajas",
  invitados: "Invitados",
  noAdmitidos: "No admitidos",
  provisional: "Provisional",
};

type SortKey = "pos" | "nome" | "licencia" | "pais" | "hcp" | "catEdad" | "club" | "nasc";

/* ── Helpers ───────────────────────────────────────────── */

function dateRange(d1: string | null, d2: string | null): string {
  if (!d1 && !d2) return "—";
  if (d1 && d2 && d1 !== d2) return `${d1} → ${d2}`;
  return d1 || d2 || "—";
}

function catPillClass(cat: string | null): string {
  if (!cat) return "p p-muted p-sm";
  if (/Sub-?1[0-2]|Alev|Benjam/i.test(cat)) return "p p-sub10 p-sm";
  if (/Sub-?1[34]|Infan/i.test(cat)) return "p p-sub12 p-sm";
  if (/Sub-?1[56]|Cadet/i.test(cat)) return "p p-sub14 p-sm";
  return "p p-sm";
}

function ageAt(dob: string | null, ref: string | null | undefined): number | null {
  if (!dob) return null;
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(dob);
  if (!m) return null;
  const dobY = parseInt(m[3], 10);
  const dobM = parseInt(m[2], 10);
  const dobD = parseInt(m[1], 10);
  const refMatch = ref ? /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(ref) : null;
  const today = new Date();
  const ry = refMatch ? parseInt(refMatch[3], 10) : today.getFullYear();
  const rmm = refMatch ? parseInt(refMatch[2], 10) : today.getMonth() + 1;
  const rd = refMatch ? parseInt(refMatch[1], 10) : today.getDate();
  let age = ry - dobY;
  if (rmm < dobM || (rmm === dobM && rd < dobD)) age--;
  return age;
}

/* ── lgsToFPGTournament ──────────────────────────────────────
 * Converte JSON livegolfscoring para FPGTournament — permite reusar
 * IntlTournView (mesmo componente que FFGPage usa) para aspecto consistente
 * com FPG/FFG: cabeçalho, tabs R1/R2/Resumo, scorecard global com cores. */
function lgsToFPGTournament(
  lgs: {
    id: number;
    meta: { name: string | null; course: string | null; dateRange: string | null; year?: number | null; dateIso?: string | null };
    rounds: Array<{ round: number; label: string; par: number[] | null; players: Array<{
      memberId?: string | null; pos: number | null; name: string; toPar: number; hoy: number;
      scores: number[] | null; halves: number[] | null; total: number | null;
    }> }>;
    course?: { meters?: (number | null)[]; si?: (number | null)[]; par?: (number | null)[] } | null;
  },
  dobLookup?: DobLookup,
): FPGTournament {
  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  const lookupByName: Record<string, DobLookupEntry> = {};
  if (dobLookup) for (const e of Object.values(dobLookup)) if (e.name) lookupByName[norm(e.name)] = e;

  const par = lgs.rounds[0]?.par && lgs.rounds[0].par!.length === 18 ? lgs.rounds[0].par! : new Array(18).fill(4);
  const parTotal = par.reduce((a, b) => a + b, 0);
  const numRounds = lgs.rounds.length;

  // Agregar por jogador (key = memberId ou nome) com scores hbh por ronda
  type Acc = { name: string; pos: number | null; toPar: number; total: number; rounds: FPGRoundScore[] };
  const agg: Record<string, Acc> = {};
  for (const r of lgs.rounds) {
    for (const p of r.players) {
      const key = p.memberId || p.name;
      if (!agg[key]) agg[key] = { name: p.name, pos: null, toPar: 0, total: 0, rounds: [] };
      if (p.scores && p.scores.length === 18 && p.total != null) {
        agg[key].rounds.push({
          round: r.round, gross: p.total,
          scores: p.scores, pars: r.par || par,
          si: lgs.course?.si || [], meters: lgs.course?.meters || [], teeName: undefined,
        });
      }
    }
  }
  // Pos/toPar/total da última ronda
  const lastR = lgs.rounds[lgs.rounds.length - 1];
  if (lastR) {
    for (const p of lastR.players) {
      const key = p.memberId || p.name;
      if (agg[key]) {
        agg[key].pos = p.pos;
        agg[key].toPar = p.toPar;
        agg[key].total = agg[key].rounds.reduce((a, b) => a + b.gross, 0);
      }
    }
  }

  const sortedAcc = Object.values(agg).sort((a, b) => {
    if (a.pos == null && b.pos == null) return a.toPar - b.toPar;
    if (a.pos == null) return 1;
    if (b.pos == null) return -1;
    return a.pos - b.pos;
  });

  const dateRef = lgs.meta.dateIso || lgs.meta.dateRange || null;
  // Lookup HCP global injectado via dobLookup (efetivamente o terceiro arg do adapter).
  // Como esta função foi criada antes de termos hcpLookup, lemos via campo extra.
  const players: FPGPlayer[] = sortedAcc.map((a, idx) => {
    const e = lookupByName[norm(a.name)];
    const club = e?.club ? displayName(e.club) : "";
    const age = e?.dob ? ageAt(e.dob, dateRef) : null;
    const escLabel = ageToEscalaoEs(age);
    const sex: "M" | "F" | null = e?.sex === "M" ? "M" : e?.sex === "F" ? "F" : null;
    const incomplete = a.rounds.length < numRounds;
    // HCP via lookup global (LGS não tem HCP no JSON)
    const lic = (e?.licencia || "").toUpperCase();
    const hcp = lic && (lgs as any)._hcpLookup?.[lic]?.hcp;
    return {
      scoreId: `lgs-${lgs.id}-${idx}`,
      pos: a.pos ?? idx + 1,
      name: formatPlayerName(a.name),
      club: club || "—",
      fed: e?.licencia || undefined,
      fedCode: e?.licencia || undefined,
      grossTotal: a.total || null,
      toPar: a.toPar,
      hcpExact: hcp != null ? hcp : undefined,
      escalao: escLabel,
      dob: e?.dob || undefined,
      _sex: sex,
      _age: age,
      nholes: 18,
      parTotal,
      scores: a.rounds[0]?.scores || [],
      par,
      si: lgs.course?.si || [],
      meters: lgs.course?.meters || [],
      roundScores: a.rounds,
      _wd: incomplete,
      _roundsPlayed: a.rounds.length,
    } as FPGPlayer & { _sex: "M" | "F" | null; _age: number | null };
  });

  return {
    name: lgs.meta.name || `Torneio ${lgs.id}`,
    tcode: String(lgs.id),
    date: lgs.meta.dateIso || lgs.meta.dateRange || "",
    campo: lgs.meta.course || "",
    rounds: numRounds,
    playerCount: players.length,
    players,
  };
}

function lgsScorecardOptions(): ScorecardOptions {
  // Vista coerente para ES (todos os 3 sources):
  // - ESC visível (idade → Sub-N, pill colorido global)
  // - HCP visível (coluna própria, sortable)
  // - CLUBE escondido (irrelevante em ES — não conhecemos os clubes)
  // - SD escondido (não temos CR/slope)
  // - TEE escondido
  // - noPlayerLink: licenças espanholas (AM12345...) não correspondem a fed codes
  //   FPG — não criar link /jogadores/{fed} a apontar para nada útil.
  return {
    hideHCP: false,
    hideEsc: false,
    hideClub: true,
    hideSD: true,
    hideTee: true,
    showAge: true,
    noPlayerLink: true,
  };
}

/* ── Helpers de conversão idade → Sub-N (escalão FPG/RFEG) ──────
 * Todos os adapters (LGS/NC/RFEGolf) usam isto para preencher
 * player.escalao com "Sub-N" → renderiza como pill colorido (EscPill). */
function ageToSubN(age: number | null): string | null {
  if (age == null || age < 0) return null;
  if (age <= 10) return "Sub-10";
  if (age <= 12) return "Sub-12";
  if (age <= 14) return "Sub-14";
  if (age <= 16) return "Sub-16";
  if (age <= 18) return "Sub-18";
  if (age <= 21) return "Sub-21";
  if (age <= 25) return "Sub-25";
  return null;
}
function dobToSubN(dob: string | null, ref: string | null | undefined): string | null {
  return ageToSubN(ageAt(dob, ref));
}
/** Termo oficial RFEG para o escalão. Sub-12 → "Alevín", etc. */
function ageToEscalaoEs(age: number | null): string | null {
  const subN = ageToSubN(age);
  if (!subN) return null;
  return SUB_TO_ES_TERM[subN] || subN;
}

/* ── ncToFPGTournament ────────────────────────────────────────
 * Converte JSON NextCaddy (já adaptado para RFEGDetail por adaptNextCaddy)
 * em FPGTournament — mesma estrutura uniforme para IntlTournView.
 *
 * Requer que o JSON tenha sido scrapado com `--scorecards` (popula roundScores
 * em cada player + course.par[]). Se estiver vazio, devolve null. */
function ncToFPGTournament(
  detail: RFEGDetail & { _ncCourseSi?: number[] | null; _ncCourseMeters?: number[] | null },
  dobLookup?: DobLookup,
): FPGTournament | null {
  const players = detail.inscritos.admitidos;
  // Determinar nº de rondas a partir do max round encontrado
  let nRounds = 0;
  for (const p of players) {
    for (const r of (p.rounds || [])) {
      if (r.round > nRounds) nRounds = r.round;
    }
  }
  if (nRounds === 0) return null;

  const par18 = (detail.coursePar && detail.coursePar.length === 18 ? detail.coursePar : new Array(18).fill(4));
  const parTotal = par18.reduce((a, b) => a + b, 0);
  const si18 = (detail._ncCourseSi && detail._ncCourseSi.length === 18) ? detail._ncCourseSi : [];
  const meters18 = (detail._ncCourseMeters && detail._ncCourseMeters.length === 18) ? detail._ncCourseMeters : [];

  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  const lookupByName: Record<string, DobLookupEntry> = {};
  if (dobLookup) for (const e of Object.values(dobLookup)) if (e.name) lookupByName[norm(e.name)] = e;

  // Para Espanha: clube irrelevante. Mapeamos:
  //  - escalao = Sub-N derivado da idade (pill colorido global, sortable)
  //  - hcpExact = HCP número (coluna sortable)
  //  - club = clube real (ESCONDIDO via hideClub)
  const dateRef = detail.meta.dateStart || null;

  const fpgPlayers: FPGPlayer[] = players.map((p, idx) => {
    const e = (p.licencia && dobLookup && dobLookup[p.licencia.trim()]) || lookupByName[norm(p.name || "")] || null;
    const dob = p.dob || e?.dob || null;
    const age = ageAt(dob, dateRef);
    // Termo RFEG (Alevín, Benjamín, etc.) — coerência: sempre o termo da
    // federação espanhola, nunca "Sub-N". EscPill tem mapeamento ES→Sub-N CSS,
    // logo "Alevín" recebe a mesma cor que "Sub-12".
    const escLabel = ageToEscalaoEs(age);
    const club = (p.club || e?.club || "").toString();
    const sex: "M" | "F" | null = (p.sexo === "M" ? "M" : p.sexo === "F" ? "F" : (e?.sex === "M" ? "M" : e?.sex === "F" ? "F" : null));
    const roundScores: FPGRoundScore[] = (p.rounds || [])
      .filter((r) => Array.isArray((r as any).scores) && (r as any).scores.length === 18)
      .map((r) => ({
        round: r.round,
        gross: (r.gross != null) ? r.gross : ((r as any).scores.reduce((a: number, b: number) => a + b, 0) || 0),
        scores: (r as any).scores,
        pars: par18,
        si: si18,
        meters: meters18,
        teeName: meters18.length ? "Tour" : undefined,
      }));
    const incomplete = roundScores.length < nRounds;
    return {
      scoreId: `nc-${detail.compId}-${idx}`,
      pos: p.pos ?? idx + 1,
      name: formatPlayerName(p.name || ""),
      club: club ? displayName(club) : "—",
      fed: p.licencia || undefined,
      fedCode: p.licencia || undefined,
      grossTotal: p.total ?? null,
      toPar: p.toPar ?? null,
      hcpExact: p.hcp ?? undefined,
      escalao: escLabel,
      // Fields extra usados pelo nameDecorator (M/F badge) + filtros (sex/age)
      _sex: sex,
      _age: age,
      teeName: meters18.length ? "Tour" : undefined,
      nholes: 18,
      parTotal,
      scores: roundScores[0]?.scores || [],
      par: par18,
      si: si18,
      meters: meters18,
      roundScores,
      _wd: incomplete,
      _roundsPlayed: roundScores.length,
    } as FPGPlayer & { _sex: "M" | "F" | null; _age: number | null };
  });

  return {
    name: detail.meta.name || `NextCaddy ${detail.compId}`,
    tcode: String(detail.compId),
    date: detail.meta.dateStart || "",
    campo: detail.meta.course || "",
    rounds: nRounds,
    playerCount: fpgPlayers.length,
    players: fpgPlayers,
  };
}

/* ── rfegolfToFPGTournament ─────────────────────────────────────
 * Converte RFEGolf microsite results (PDF parsed) em FPGTournament. Sem hbh,
 * apenas totais por ronda — IntlTournView mostra "Resumo" mas as tabs Rn
 * mostram só totais. Útil para uniformidade visual. */
function rfegolfToFPGTournament(detail: RFEGDetail, dobLookup?: DobLookup): FPGTournament | null {
  const results = (detail.results || []).filter(r => r.players && r.players.length > 0);
  if (results.length === 0) return null;
  // Concatenar todos os groups de resultados (categorias)
  const allRows = results.flatMap(g => g.players.map(p => ({ ...p, _label: g.label })));
  const nRounds = Math.max(...results.map(r => r.nRounds || 0), 1);
  const par18 = new Array(18).fill(4);  // RFEGolf não expõe par
  const parTotal = par18.reduce((a, b) => a + b, 0);

  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  const lookupByName: Record<string, DobLookupEntry> = {};
  if (dobLookup) for (const e of Object.values(dobLookup)) if (e.name) lookupByName[norm(e.name)] = e;

  // Inscritos do PRÓPRIO torneio: têm HCP + DOB + licença exactos e casam ~100%
  // por nome com a tabela de resultados (que vem do PDF, só com o nome). Fonte
  // preferida sobre o dobLookup global (que falha em homónimos/nomes ausentes).
  const insByName: Record<string, RFEGPlayer> = {};
  for (const list of Object.values(detail.inscritos || {})) {
    if (!Array.isArray(list)) continue;
    for (const ins of list as RFEGPlayer[]) {
      if (ins && ins.name) { const k = norm(ins.name); if (!insByName[k]) insByName[k] = ins; }
    }
  }

  const dateRef = detail.meta.dateStart || null;
  const players: FPGPlayer[] = allRows.map((p, idx) => {
    const nm = norm(p.name || "");
    const ins = insByName[nm];
    const e = lookupByName[nm];
    const dobStr = ins?.dob || e?.dob || null;
    // Escalão ES: preferir a categoria oficial do inscrito (Alevín/Infantil/…),
    // senão calcular pela DOB à data do torneio.
    const subN = ins?.catEdad || (dobStr ? dobToSubN(dobStr, dateRef) : null) || null;
    const hcpExact = (typeof ins?.hcp === "number") ? ins.hcp : null;
    const roundScores: FPGRoundScore[] = (p.rounds || [])
      .map((g, i) => ({
        round: i + 1,
        gross: g,
        scores: [],
        pars: par18,
        si: [],
        meters: [],
        teeName: undefined,
      }))
      .filter(r => r.gross != null && r.gross > 0);
    const incomplete = roundScores.length < nRounds;
    return {
      scoreId: `rfeg-${detail.compId}-${idx}`,
      pos: p.pos ?? idx + 1,
      name: formatPlayerName(p.name || ""),
      club: ins?.club ? displayName(ins.club) : (e?.club ? displayName(e.club) : "—"),
      fed: ins?.licencia || e?.licencia || undefined,
      fedCode: ins?.licencia || e?.licencia || undefined,
      grossTotal: p.total ?? null,
      toPar: p.toPar ?? null,
      escalao: subN,
      hcpExact,
      dob: ins?.dob || e?.dob || undefined,
      nholes: 18,
      parTotal,
      scores: [],
      par: par18,
      si: [],
      meters: [],
      roundScores,
      _wd: incomplete,
      _roundsPlayed: roundScores.length,
    } as FPGPlayer;
  });

  return {
    name: detail.meta.name || `RFEGolf ${detail.compId}`,
    tcode: String(detail.compId),
    date: detail.meta.dateStart || "",
    campo: detail.meta.course || "",
    rounds: nRounds,
    playerCount: players.length,
    players,
  };
}


/* ── PlayerTable ─────────────────────────────────────────── */

function PlayerTable({ players, dateRef, coursePar }: { players: RFEGPlayer[]; dateRef?: string | null; coursePar?: number[] | null; parConfidence?: "high" | "medium" | "low" }) {
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("pos");

  const enriched = useMemo(() => players.map((p) => ({
    ...p,
    _name: formatPlayerName(p.name || ""),
    _club: p.club ? displayName(p.club) : "",
    _flag: p.pais ? flag(p.pais) : "🏳️",
    _age: ageAt(p.dob, dateRef),
    _dobIso: (() => {
      const m = p.dob ? /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(p.dob) : null;
      return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
    })(),
  })), [players, dateRef]);

  const sorted = useMemo(() => {
    const INF = 9999;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...enriched].sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "pos":      v = (a.pos ?? INF) - (b.pos ?? INF); break;
        case "nome":     v = (a._name || "").localeCompare(b._name || "", "pt"); break;
        case "licencia": v = (a.licencia || "").localeCompare(b.licencia || ""); break;
        case "pais":     v = (a.pais || "").localeCompare(b.pais || "", "es"); break;
        case "hcp":      v = (a.hcp ?? INF) - (b.hcp ?? INF); break;
        case "catEdad":  v = (a.catEdad || "").localeCompare(b.catEdad || ""); break;
        case "club":     v = (a.club || "").localeCompare(b.club || "", "es"); break;
        case "nasc":     v = (a._dobIso || "").localeCompare(b._dobIso || ""); break;
      }
      return mult * v;
    });
  }, [enriched, sortKey, sortDir]);

  if (!players.length) return <EmptyState size="sm" message="Lista vazia." />;

  const hasResults = sorted.some((p) => p.rounds && p.rounds.length > 0);
  const maxRounds = hasResults ? Math.max(0, ...sorted.map((p) => (p.rounds || []).length)) : 0;

  // Em torneios single-round com scores hole-by-hole, mostramos scorecard expandido.
  const allHaveSingleRoundScores = hasResults && maxRounds === 1 &&
    sorted.every((p) => {
      const r = (p.rounds || [])[0];
      return r && Array.isArray(r.scores) && r.scores.length > 0;
    });
  const singleRoundLen = allHaveSingleRoundScores
    ? Math.max(...sorted.map((p) => ((p.rounds || [])[0]?.scores?.length || 0)))
    : 0;
  const showHoleByHole = allHaveSingleRoundScores && (singleRoundLen === 9 || singleRoundLen === 18);

  // Par real: vem em `coursePar` quando o JSON do torneio tem par[] (NextCaddy
  // inferido por scripts/infer-nextcaddy-par.js a partir dos scores top-50%, ou
  // RFEGolf quando suportar). Fallback: array vazio → ScorecardLeaderboard
  // assume par 4 e os scores aparecem coloridos como par.
  const par: number[] = (coursePar && Array.isArray(coursePar) && (coursePar.length === 9 || coursePar.length === 18))
    ? coursePar
    : [];

  const rows: ScorecardRow[] = sorted.map((p, i) => {
    const isManuel = p._name ? isM(p._name) : false;
    const cat = p.catEdad ? p.catEdad.replace(/^Sub\s*/i, "Sub-") : null;

    const prefixForResults = (
      <>
        <td className="lb-esc">
          {cat ? <EscPill esc={cat} /> : <span className="muted">—</span>}
        </td>
        <td className="lb-fed">{p.licencia ?? "—"}</td>
        <td className="lb-club" title={p._club || (p.club ?? "")}>{p._club || "—"}</td>
        <td className="lb-hcp">{p.hcp == null ? "—" : p.hcp.toFixed(1)}</td>
      </>
    );
    const prefixForInscritos = (
      <>
        <td className="lb-esc">
          {cat ? <EscPill esc={cat} /> : <span className="muted">—</span>}
        </td>
        <td className="lb-fed">{p.licencia ?? "—"}</td>
        <td className="lb-club" title={p._club || (p.club ?? "")}>{p._club || "—"}</td>
        <td className="lb-hcp">{p.hcp == null ? "—" : p.hcp.toFixed(1)}</td>
        <td style={{ textAlign: "center", padding: "6px 8px" }}>
          {p.sexo === "M" || p.sexo === "F" ? <SexBadge sex={p.sexo} /> : <span className="muted">—</span>}
        </td>
        <td title={p.dob ? `${p.dob} (${p._age ?? "?"} anos à data)` : ""}
            style={{ textAlign: "center", padding: "6px 8px", whiteSpace: "nowrap" }}>
          {p.dob ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <YearPill year={parseInt(p.dob.slice(-4), 10)} />
              {p._age != null && <span className="muted fs-10">({p._age})</span>}
            </span>
          ) : <span className="muted">—</span>}
        </td>
        <td title={p.pais ?? ""} style={{ padding: "6px 8px", textAlign: "center", fontSize: "var(--fs-18)" }}>
          {p._flag}
        </td>
      </>
    );

    const postForResults = (
      <>
        <td style={{ textAlign: "center", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
          <span style={{ color: tpColor(p.toPar) }}>{fmtToPar(p.toPar)}</span>
        </td>
        <td style={{ textAlign: "center", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
          {p.total ?? "—"}
        </td>
        {!showHoleByHole && Array.from({ length: maxRounds }, (_, idx) => {
          const r = (p.rounds || []).find((x) => x.round === idx + 1);
          return (
            <td key={`r${idx}`} style={{ textAlign: "center", fontFamily: "var(--font-mono)" }}>
              {r && r.gross != null ? r.gross : "—"}
            </td>
          );
        })}
      </>
    );
    const postForInscritos = (
      <td style={{ padding: "6px 8px", textAlign: "center" }}>
        {p.estado
          ? <span style={{ background: "var(--bg-muted)", color: "var(--text-muted)", fontSize: "var(--fs-10)", padding: "1px 6px", borderRadius: 10, border: "1px solid var(--border-light)" }}>{p.estado}</span>
          : <span className="muted fs-10">✓</span>}
      </td>
    );

    const r0 = showHoleByHole ? (p.rounds || [])[0] : null;
    const rowScores = (r0 && Array.isArray(r0.scores)) ? r0.scores : undefined;

    return {
      key: `${p.licencia ?? "-"}-${i}`,
      pos: p.pos ?? i + 1,
      gross: p.total ?? 0,
      toPar: p.toPar ?? null,
      scores: rowScores ?? [],
      isManuel,
      sortPos: p.pos ?? null,
      sortName: p._name || "",
      fedCode: p.licencia ?? undefined,
      nameContent: (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: isManuel ? 700 : 500 }}>
          {p._name || "—"}
          {p._name && <KidsLink nome={p._name} />}
        </span>
      ),
      prefixCells: hasResults ? prefixForResults : prefixForInscritos,
      postScorecardCells: hasResults ? postForResults : postForInscritos,
    };
  });

  const prefixHeaderCells = hasResults ? (
    <>
      <SortableHdr k="catEdad" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-esc">CAT</SortableHdr>
      <SortableHdr k="licencia" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-fed">LICENCIA</SortableHdr>
      <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-club">CLUBE</SortableHdr>
      <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-hcp">HCP</SortableHdr>
    </>
  ) : (
    <>
      <SortableHdr k="catEdad" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-esc">CAT</SortableHdr>
      <SortableHdr k="licencia" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-fed">LICENCIA</SortableHdr>
      <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-club">CLUBE</SortableHdr>
      <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-hcp">HCP</SortableHdr>
      <th style={{ padding: "7px 8px", textAlign: "center" }}>Sx</th>
      <SortableHdr k="nasc" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "center" }}>Nasc.</SortableHdr>
      <SortableHdr k="pais" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 4px", textAlign: "center", width: 32 }} title="País">🏳️</SortableHdr>
    </>
  );
  const postScorecardHeaderCells = hasResults ? (
    <>
      <th style={{ padding: "7px 8px", textAlign: "center", fontWeight: 700 }}>±Par</th>
      <th style={{ padding: "7px 8px", textAlign: "center", fontWeight: 700 }}>Total</th>
      {!showHoleByHole && Array.from({ length: maxRounds }, (_, i) => (
        <th key={`r${i}`} style={{ padding: "7px 8px", textAlign: "center" }}>R{i + 1}</th>
      ))}
    </>
  ) : (
    <th style={{ padding: "7px 8px", textAlign: "center" }}>Status</th>
  );
  const postColCount = hasResults ? (showHoleByHole ? 2 : 2 + maxRounds) : 1;

  return (
    <ScorecardLeaderboard
      par={showHoleByHole ? (par.length ? par : new Array(singleRoundLen).fill(4)) : []}
      rows={rows}
      prefixHeaderCells={prefixHeaderCells}
      postScorecardHeaderCells={postScorecardHeaderCells}
      postScorecardColCount={postColCount}
      showScorecard={showHoleByHole}
      onSortPos={() => toggleSort("pos")}
      onSortName={() => toggleSort("nome")}
      activeSortKey={sortKey}
      activeSortDir={sortDir}
    />
  );
}

/* ── NextCaddy adapter ─────────────────────────────────── */

interface NCRoundScore {
  round: number;
  scores?: number[];
  total?: number | null;
}
interface NCPlayer {
  pos?: number | null;
  name: string | null;
  licencia?: string | null;
  hcp?: number | null;
  nivel?: string | null;
  rounds?: { round: number; gross: number | null }[];
  roundScores?: NCRoundScore[];
  total?: number | null;
  toPar?: number | null;
  inscribedId?: number | null;
}
interface NCInsc {
  orden?: number | null;
  name: string | null;
  licencia?: string | null;
  hcp?: number | null;
  nivel?: string | null;
}
interface NCHorario {
  round: number;
  players: Array<{
    time: string | null;
    tee: number | null;
    name: string;
    hcp: number | null;
    nivel?: string | null;
    ins?: string;
    jid?: string;
  }>;
}
interface NCDetail {
  tourId: number;
  scrapedAt: string;
  meta: {
    name: string | null;
    course: string | null;
    courseCode?: string | null;
    organizer?: string | null;
    format?: string | null;
    categories?: string[];
  };
  /** Horarios (draw / tee times). Populado por scripts/scrape-nextcaddy-horarios.js. */
  horarios?: NCHorario[];
  /** par[] inferido a partir dos scores (script infer-nextcaddy-par.js).
   *  parInferred=true assinala que não vem da fonte directa.
   *  parConfidence ∈ {high, medium, low} indica quanto se pode confiar no par. */
  course?: {
    par?: number[] | null;
    si?: number[] | null;
    meters?: number[] | null;
    parTotal?: number;
    parInferred?: boolean;
    // total-high/total-low: só o par TOTAL foi inferido (sem par por buraco).
    parConfidence?: "high" | "medium" | "low" | "total-high" | "total-low";
  };
  leaderboard: { category: number; players: NCPlayer[] }[];
  inscritos: NCInsc[];
  /** Resultados publicados só em PDF (sem tabela HTML parseável). */
  leaderboardPdfOnly?: boolean;
  /** Destaques de live-scoring (birdies/eagles/hole-in-one por jogador+buraco),
   *  capturados mesmo quando o leaderboard final só sai em PDF. */
  scoreTypes?: Record<string, { scoreTypeKey?: string; players?: { playerName?: string; holeNumber?: number }[] }>;
}

interface DobLookupEntry { name: string | null; dob: string; dobIso: string; sex: string | null; club: string | null; catEdad: string | null; licencia?: string | null }

/* livegolfscoring.es format — fonte primária dos resultados/scorecards RFEGolf */
interface LgsPlayer {
  memberId?: string | null;
  pos: number | null;
  name: string;
  toPar: number;
  hoy: number;
  scores: number[] | null;
  halves: number[] | null;
  total: number | null;
}
interface LgsRound {
  round: number;
  label: string;
  par: number[] | null;
  players: LgsPlayer[];
}
interface LgsDetail {
  id: number;
  ok: boolean;
  scrapedAt: string;
  meta: {
    name: string | null;
    course: string | null;
    dateRange: string | null;
    rounds: { round: number; label: string }[];
  };
  rounds: LgsRound[];
  course?: { meters: (number | null)[]; si: (number | null)[]; par: (number | null)[]; avg?: (number | null)[]; metersTotal?: number | null; holes?: number } | null;
}

function adaptLgs(lgs: LgsDetail, dobLookup?: DobLookup, hcpLookup?: HcpLookup): RFEGDetail {
  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  const lookupByName: Record<string, DobLookupEntry> = {};
  if (dobLookup) {
    for (const e of Object.values(dobLookup)) {
      if (e.name) lookupByName[norm(e.name)] = e;
    }
  }
  // Anexar hcpLookup ao detail para o adapter LGS-FPG poder usar
  void hcpLookup; // injectado depois via adaptLgs e flag detail._hcpLookup

  // Construir leaderboard agregado a partir das rondas — somar totals de cada
  // ronda por player. Cada ronda do PDF/livegolfscoring é gross dessa ronda.
  const playerAgg: Record<string, {
    name: string; pos: number | null;
    rounds: number[]; toPar: number; hoy: number; total: number;
  }> = {};
  const lastR = lgs.rounds[lgs.rounds.length - 1];
  for (const r of lgs.rounds) {
    for (const p of r.players) {
      const key = p.memberId || p.name;
      if (!playerAgg[key]) {
        playerAgg[key] = { name: p.name, pos: null, rounds: [], toPar: 0, hoy: 0, total: 0 };
      }
      playerAgg[key].rounds.push(p.total ?? 0);
    }
  }
  // Pos/toPar/total da última ronda (acumulado)
  if (lastR) {
    for (const p of lastR.players) {
      const key = p.memberId || p.name;
      if (playerAgg[key]) {
        playerAgg[key].pos = p.pos;
        playerAgg[key].toPar = p.toPar;
        playerAgg[key].hoy = p.hoy;
        // Total acumulado = sum das rondas
        playerAgg[key].total = playerAgg[key].rounds.reduce((a, b) => a + b, 0);
      }
    }
  }

  const aggregated = Object.values(playerAgg).sort((a, b) => {
    if (a.pos == null && b.pos == null) return a.toPar - b.toPar;
    if (a.pos == null) return 1;
    if (b.pos == null) return -1;
    return a.pos - b.pos;
  });

  const par = lgs.rounds[0]?.par || null;
  const nRounds = lgs.rounds.length;

  // Construir results group único agregado (R1..Rn) para mostrar no leaderboard
  const resultsGroup = {
    label: "Clasificación Final",
    sexo: "" as string,
    categoria: "" as string,
    pdfUrl: `https://rfegolf.livegolfscoring.es/torneos/clasificacion/${lgs.id}`,
    nRounds, courseRating: null as number | null, slope: null as number | null,
    players: aggregated.map(a => ({
      pos: a.pos,
      name: a.name,
      toPar: a.toPar,
      hoy: a.hoy,
      rounds: a.rounds,
      total: a.total,
    })),
  };

  return {
    compId: lgs.id,
    ok: true,
    scrapedAt: lgs.scrapedAt,
    meta: {
      name: lgs.meta.name,
      dateStart: lgs.meta.dateRange,
      dateEnd: lgs.meta.dateRange,
      course: lgs.meta.course,
      courseClubId: null,
      players: aggregated.length,
      hcpLimitMen: null, hcpLimitWomen: null,
      mode: "Individual", style: "Stroke Play",
      category: null, sex: null,
      federation: "RFEGolf",
      federationCatId: null,
    },
    coursePar: par,
    parConfidence: par ? "high" : undefined,
    inscritos: {
      admitidos: aggregated.map(a => {
        const e = lookupByName[norm(a.name)];
        return {
          pos: a.pos, name: a.name,
          licencia: e?.licencia || null,
          pais: "ESPAÑA",
          hcp: null,
          catEdad: e?.catEdad || null,
          sexo: e?.sex || null,
          club: e?.club || null,
          dob: e?.dob || null,
          estado: null,
        };
      }),
      reservas: [], bajas: [], invitados: [], noAdmitidos: [], provisional: [],
      counts: {
        admitidos: aggregated.length,
        reservas: 0, bajas: 0, invitados: 0, noAdmitidos: 0, provisional: 0,
      },
    },
    results: [resultsGroup],
    /** Rondas hbh com par real — usado pela vista hbh quando expandida */
    _lgsRounds: lgs.rounds,
    _lgsCourse: lgs.course || null,
  } as RFEGDetail & { _lgsRounds: LgsRound[]; _lgsCourse: LgsDetail["course"] };
}
type DobLookup = Record<string, DobLookupEntry>;

function adaptNextCaddy(nc: NCDetail, dobLookup?: DobLookup, hcpLookup?: HcpLookup): RFEGDetail {
  const enrich = (licencia: string | null) => {
    if (!licencia || !dobLookup) return null;
    return dobLookup[licencia.trim()] || null;
  };
  // Helper: HCP via lookup global se o player não tem (cross-reference torneios)
  const hcpFromLookup = (licencia: string | null): number | null => {
    if (!licencia || !hcpLookup) return null;
    const key = licencia.trim().toUpperCase();
    return hcpLookup[key]?.hcp ?? null;
  };

  const lbPlayers: RFEGPlayer[] = [];
  for (const cat of (nc.leaderboard || [])) {
    for (const p of (cat.players || [])) {
      const e = enrich(p.licencia ?? null);
      // NextCaddy expõe scores hole-by-hole em p.roundScores[]; o campo p.rounds[] vem sempre vazio.
      const rs = (p.roundScores || []) as NCRoundScore[];
      const rounds = rs.length > 0
        ? rs.map((r) => ({
            round: r.round,
            gross: typeof r.total === "number"
              ? r.total
              : (Array.isArray(r.scores) ? (r.scores.filter((x) => x > 0).reduce((a, b) => a + b, 0) || null) : null),
            scores: Array.isArray(r.scores) ? r.scores : undefined,
          }))
        : (p.rounds || []);
      lbPlayers.push({
        pos: p.pos ?? null,
        name: p.name,
        licencia: p.licencia ?? null,
        pais: "ESPAÑA",
        // Fallback ao lookup global se o player não tem HCP no torneio
        hcp: p.hcp ?? hcpFromLookup(p.licencia ?? null),
        catEdad: p.nivel ?? (e ? e.catEdad : null),
        sexo: e ? e.sex : null,
        club: e ? e.club : null,
        dob: e ? e.dob : null,
        estado: null,
        rounds,
        total: p.total ?? null,
        toPar: p.toPar ?? null,
      });
    }
  }
  const inscPlayers: RFEGPlayer[] = (nc.inscritos || []).map((p) => {
    const e = enrich(p.licencia ?? null);
    return {
      pos: p.orden ?? null,
      name: p.name,
      licencia: p.licencia ?? null,
      pais: "ESPAÑA",
      hcp: p.hcp ?? hcpFromLookup(p.licencia ?? null),
      catEdad: p.nivel ?? (e ? e.catEdad : null),
      sexo: e ? e.sex : null,
      club: e ? e.club : null,
      dob: e ? e.dob : null,
      estado: null,
    };
  });
  // Deduplicar por licencia: o NextCaddy às vezes lista o mesmo jogador em
  // múltiplas categorias (Scratch + Hcp) ou repete inscritos. Mantém a primeira
  // ocorrência (que tem normalmente os scores reais).
  const dedupBy = (arr: RFEGPlayer[]): RFEGPlayer[] => {
    const seen = new Set<string>();
    const out: RFEGPlayer[] = [];
    for (const p of arr) {
      const key = (p.licencia || "").trim().toLowerCase()
                || ("name:" + (p.name || "").trim().toLowerCase());
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  };
  const admitidos = dedupBy(lbPlayers.length > 0 ? lbPlayers : inscPlayers);
  return {
    compId: nc.tourId,
    ok: true,
    scrapedAt: nc.scrapedAt,
    meta: {
      name: nc.meta?.name ?? null,
      dateStart: null,
      dateEnd: null,
      course: nc.meta?.course ?? null,
      courseClubId: null,
      players: admitidos.length,
      hcpLimitMen: null,
      hcpLimitWomen: null,
      mode: "Individual",
      style: nc.meta?.format ?? null,
      category: null,
      sex: null,
      federation: nc.meta?.organizer ?? null,
      federationCatId: null,
    },
    coursePar: (nc.course?.par && Array.isArray(nc.course.par) && nc.course.par.length > 0) ? nc.course.par : null,
    parConfidence: nc.course?.parConfidence,
    // Horarios (draw / tee times) — passar adiante para a tab Draw saída
    _ncHorarios: Array.isArray(nc.horarios) ? nc.horarios : null,
    // Guardar SI e metros do NextCaddy para o adapter ncToFPGTournament passar adiante
    _ncCourseSi: (nc.course?.si && Array.isArray(nc.course.si) && nc.course.si.length === 18) ? nc.course.si : null,
    _ncCourseMeters: (nc.course?.meters && Array.isArray(nc.course.meters) && nc.course.meters.length === 18) ? nc.course.meters : null,
    inscritos: {
      admitidos,
      reservas: [],
      bajas: [],
      invitados: [],
      noAdmitidos: [],
      provisional: [],
      counts: {
        admitidos: admitidos.length,
        reservas: 0,
        bajas: 0,
        invitados: 0,
        noAdmitidos: 0,
        provisional: 0,
      },
    },
  } as RFEGDetail & { _ncCourseSi?: number[] | null; _ncCourseMeters?: number[] | null };
}

/* ── TournamentDetail ──────────────────────────────────── */

/* ── ResultsTable ────────────────────────────────────────
   Renderiza leaderboard final RFEGolf. Quando há grupos
   (Final + Categoria + Sexo separados), tem selector.
   ⚠ LEGACY — substituído por IntlTournView na refactor 2026-05-09.
   Mantido como fallback para casos em que o adapter rfegolfToFPGTournament
   não consiga produzir um FPGTournament válido. */
// @ts-expect-error TS6133: kept as legacy fallback, will be re-wired if rfegolfToFPGTournament cannot produce results
function ResultsTable({ results, dobLookup, dateRef }: {
  results: NonNullable<RFEGDetail["results"]>;
  dobLookup?: DobLookup;
  dateRef?: string | null;
}) {
  const groups = results.filter(r => r.players && r.players.length > 0);
  const [groupIdx, setGroupIdx] = useState(0);
  const { sortKey, sortDir, toggleSort } = useSort<"pos" | "nome" | "club" | "toPar" | "total" | "nasc" | "r1" | "r2" | "r3" | "r4">("pos");

  if (groups.length === 0) return <EmptyState message="Sem resultados publicados." />;

  const g = groups[Math.min(groupIdx, groups.length - 1)];
  const nR = g.nRounds || (g.players[0]?.rounds?.length ?? 0);

  // Enriquecer com dobLookup por nome (RFEGolf não dá licencia no PDF)
  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  const lookupByName: Record<string, DobLookupEntry> = {};
  if (dobLookup) {
    for (const e of Object.values(dobLookup)) {
      if (e.name) lookupByName[norm(e.name)] = e;
    }
  }

  const enriched = g.players.map((p) => {
    const e = lookupByName[norm(p.name)];
    return {
      ...p,
      _dob: e?.dob || null,
      _sex: e?.sex || null,
      _club: e?.club || null,
      _licencia: e?.licencia || null,
      _age: e?.dobIso ? (() => {
        const dobY = parseInt(e.dobIso!.slice(0, 4), 10);
        const refY = dateRef && /(\d{4})/.exec(dateRef) ? parseInt(/(\d{4})/.exec(dateRef)![1], 10) : new Date().getFullYear();
        return refY - dobY;
      })() : null,
    };
  });

  const sorted = useMemo(() => {
    const mult = sortDir === "asc" ? 1 : -1;
    return [...enriched].sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "pos":   v = (a.pos ?? 9999) - (b.pos ?? 9999); break;
        case "nome":  v = a.name.localeCompare(b.name); break;
        case "club":  v = (a._club || "").localeCompare(b._club || ""); break;
        case "toPar": v = a.toPar - b.toPar; break;
        case "total": v = a.total - b.total; break;
        case "nasc":  v = (a._dob || "").localeCompare(b._dob || ""); break;
        case "r1":    v = (a.rounds[0] ?? 9999) - (b.rounds[0] ?? 9999); break;
        case "r2":    v = (a.rounds[1] ?? 9999) - (b.rounds[1] ?? 9999); break;
        case "r3":    v = (a.rounds[2] ?? 9999) - (b.rounds[2] ?? 9999); break;
        case "r4":    v = (a.rounds[3] ?? 9999) - (b.rounds[3] ?? 9999); break;
      }
      return mult * v;
    });
  }, [enriched, sortKey, sortDir]);

  return (
    <div>
      {groups.length > 1 && (
        <div className="detail-toolbar" style={{ flexWrap: "wrap", gap: 4, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
          {groups.map((gr, i) => (
            <button
              key={i}
              type="button"
              className={`tourn-tab ${i === groupIdx ? "active" : ""}`}
              onClick={() => setGroupIdx(i)}
            >
              {gr.label} <span className="chip" style={{ marginLeft: 4, fontSize: "var(--fs-10)" }}>{gr.players.length}</span>
            </button>
          ))}
        </div>
      )}
      {(g.courseRating || g.slope) && (
        <div style={{ padding: "6px 12px", fontSize: "var(--fs-12)" }} className="muted">
          {g.courseRating && <>CR {g.courseRating} </>}
          {g.slope && <>· Slope {g.slope} </>}
          {g.pdfUrl && <ExtLink href={g.pdfUrl} className="tourn-ext-link">📄 PDF original</ExtLink>}
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="dtable">
          <thead>
            <tr>
              <SortableHdr k="pos" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as any)}>#</SortableHdr>
              <SortableHdr k="nome" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as any)}>Jogador</SortableHdr>
              <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as any)}>Clube</SortableHdr>
              <th>Sx</th>
              <SortableHdr k="nasc" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as any)} style={{ textAlign: "center" }}>Nasc.</SortableHdr>
              <SortableHdr k="toPar" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as any)} style={{ textAlign: "center" }}>±Par</SortableHdr>
              {Array.from({ length: nR }, (_, i) => (
                <SortableHdr key={i} k={`r${i+1}` as any} sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as any)} style={{ textAlign: "center" }}>R{i+1}</SortableHdr>
              ))}
              <SortableHdr k="total" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as any)} style={{ textAlign: "center" }}>Total</SortableHdr>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const manuel = isM(p.name);
              return (
                <tr key={i} className={manuel ? "row-manuel" : ""}>
                  <td style={{ padding: "4px 8px" }}>{p.pos ?? "—"}</td>
                  <td style={{ padding: "4px 8px", fontWeight: manuel ? 700 : 500 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {formatPlayerName(p.name)}
                      <KidsLink nome={formatPlayerName(p.name)} />
                    </span>
                  </td>
                  <td style={{ padding: "4px 8px" }} title={p._club || ""}>{p._club ? displayName(p._club) : <span className="muted">—</span>}</td>
                  <td style={{ padding: "4px 8px", textAlign: "center" }}>
                    {p._sex === "M" || p._sex === "F" ? <SexBadge sex={p._sex} /> : <span className="muted">—</span>}
                  </td>
                  <td style={{ padding: "4px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                    {p._dob ? (
                      <>
                        <YearPill year={parseInt(p._dob.slice(-4), 10)} />
                        {p._age != null && <span className="muted fs-10" style={{ marginLeft: 4 }}>({p._age})</span>}
                      </>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td style={{ padding: "4px 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontWeight: 700, color: tpColor(p.toPar) }}>
                    {fmtToPar(p.toPar)}
                  </td>
                  {Array.from({ length: nR }, (_, ri) => (
                    <td key={ri} style={{ padding: "4px 8px", textAlign: "center", fontFamily: "var(--font-mono)" }}>
                      {p.rounds[ri] ?? "—"}
                    </td>
                  ))}
                  <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                    {p.total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type RFEGTab = "scorecards" | "inscritos" | "draw";

/* ── DrawSaidaView ──────────────────────────────────────────
 * Tab "Draw saída" do RFEGPage — reusa o componente DrawTab partilhado para
 * coerência visual com FPG. Converte NC horarios → FpgDraw shape. */
function DrawSaidaView({ detail, entry }: {
  detail: RFEGDetail & { _ncHorarios?: NCHorario[] | null };
  entry: RFEGIndexEntry;
}) {
  const horarios = detail._ncHorarios;
  const [activeRound, setActiveRound] = useState<number>(1);

  // Construir FpgDraw a partir dos NC horarios para a ronda activa
  const drawForRound = useMemo<FpgDraw | null>(() => {
    if (!horarios || horarios.length === 0) return null;
    const r = horarios.find(rd => rd.round === activeRound) || horarios[0];
    if (!r || !r.players || r.players.length === 0) return null;

    // Agrupar por (time, tee) → flights
    const flights: FpgDrawFlight[] = [];
    let curKey = "";
    for (const p of r.players) {
      const k = `${p.time}|${p.tee}`;
      if (k !== curKey) {
        flights.push({
          teeTime: p.time || "",
          startHole: p.tee != null ? p.tee : null,
          tee: null,
          players: [],
        });
        curKey = k;
      }
      flights[flights.length - 1].players.push({
        nome: formatPlayerName(p.name),
        clube: null,                    // NC não expõe clube no draw
        fed: p.jid || null,             // jid NC ≠ fed FPG, mas dá identidade única
        hcp: p.hcp,
      });
    }
    return {
      name: detail.meta.name || `Tour ${entry.id}`,
      date: detail.meta.dateStart || undefined,
      totalJogadores: r.players.length,
      groups: flights,
    };
  }, [horarios, activeRound, detail, entry]);

  if (!horarios || horarios.length === 0) {
    return <EmptyState message={
      entry.source === "nextcaddy"
        ? "Sem horarios publicados para este torneio."
        : "Tee times disponíveis apenas para torneios NextCaddy. Para LGS/RFEGolf, consulta o Microsite oficial."
    } />;
  }
  if (!drawForRound) return <EmptyState message="Sem dados de draw para esta ronda." />;

  return (
    <div>
      {horarios.length > 1 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
          {horarios.map(r => (
            <button
              key={r.round}
              type="button"
              className={`chip ${activeRound === r.round ? "active" : ""}`}
              onClick={() => setActiveRound(r.round)}
              style={{ cursor: "pointer", fontSize: "var(--fs-12)", padding: "3px 10px" }}
            >
              R{r.round} · {r.players.length} jog
            </button>
          ))}
        </div>
      )}
      <DrawTab
        draw={drawForRound}
        roundNum={activeRound}
        tournamentDate={detail.meta.dateStart}
        playersDB={undefined}
      />
    </div>
  );
}

function TournamentDetail({ entry, dobLookup, hcpLookup }: { entry: RFEGIndexEntry; dobLookup?: DobLookup; hcpLookup?: HcpLookup }) {
  const [data, setData] = useState<RFEGDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<RFEGTab>("scorecards");
  const [list, setList] = useState<ListKind>("admitidos");

  useEffect(() => {
    setData(null);
    setError(null);
    setList("admitidos");
    setTab("scorecards");
    cachedFetchJson<RFEGDetail | NCDetail | LgsDetail>(`/data/${entry.filePath}`)
      .then((d) => {
        if (!d) { setError("Ficheiro não encontrado"); return; }
        if (entry.source === "nextcaddy") {
          setData(adaptNextCaddy(d as NCDetail, dobLookup, hcpLookup));
        } else if (entry.source === "livegolfscoring") {
          setData(adaptLgs(d as LgsDetail, dobLookup, hcpLookup));
        } else if (entry.source === "golfdirecto") {
          setData(adaptFcg(d as unknown as FCGDetail, dobLookup, hcpLookup) as unknown as RFEGDetail);
        } else {
          const detail = d as RFEGDetail;
          setData({ ...detail, coursePar: detail.coursePar ?? null });
        }
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [entry.filePath, entry.source, dobLookup, hcpLookup]);

  // FPGTournament uniforme — usado pelo IntlTournView na tab Resultados (scorecards).
  // Construído por adapter consoante a fonte.
  const fpgTournament: FPGTournament | null = useMemo(() => {
    if (!data) return null;
    if (entry.source === "livegolfscoring" && (data as any)._lgsRounds?.length > 0) {
      return lgsToFPGTournament({
        id: data.compId,
        meta: { name: data.meta.name, course: data.meta.course, dateRange: data.meta.dateStart, dateIso: data.meta.dateStart },
        rounds: (data as any)._lgsRounds,
        course: (data as any)._lgsCourse,
        _hcpLookup: hcpLookup,
      } as any, dobLookup);
    }
    if (entry.source === "nextcaddy") return ncToFPGTournament(data, dobLookup);
    if (entry.source === "rfegolf") return rfegolfToFPGTournament(data, dobLookup);
    if (entry.source === "golfdirecto") {
      const fpg = fcgToFPGTournament(data as unknown as MinimalRFEGShape, dobLookup);
      return fpg as unknown as FPGTournament | null;
    }
    return null;
  }, [data, entry.source, dobLookup, hcpLookup]);

  if (error) return <EmptyState message={`Erro: ${error}`} />;
  if (!data) return <LoadingState message="A carregar dados..." />;

  const m = data.meta;
  const c = data.inscritos.counts;
  const sourceUrl = entry.source === "rfegolf"
    ? `https://rfegolf.es/CompetenciaPaginas/CompetitionMicrosite.aspx?CompId=${entry.compId}`
    : entry.source === "nextcaddy"
      ? `https://www.nextcaddy.com/tour/${entry.tourId}`
      : entry.source === "golfdirecto"
        ? `https://www.golfdirecto.com/micro/game/${entry.id}/summary?lang=es`
        : `https://rfegolf.livegolfscoring.es/torneos/clasificacion/${entry.id}`;
  const scoringUrl = entry.source === "rfegolf"
    ? `https://rfegolf.es/CompetenciaPaginas/LiveScoring.aspx?CompId=${entry.compId}`
    : entry.source === "nextcaddy"
      ? `https://www.nextcaddy.com/tour/${entry.tourId}/clasificaciones`
      : entry.source === "golfdirecto"
        ? `https://www.golfdirecto.com/micro/game/${entry.id}/ranking/entry?lang=es`
        : `https://rfegolf.livegolfscoring.es/torneos/hoyoahoyo/${entry.id}`;

  const listsAvailable: ListKind[] = (Object.keys(c) as ListKind[]).filter((k) => c[k] > 0);
  const effectiveList: ListKind = c[list] > 0 ? list : (listsAvailable[0] || "admitidos");
  const currentList = data.inscritos[effectiveList];

  const hasResults = fpgTournament !== null && fpgTournament.players.length > 0;
  const inscritosTotal = listsAvailable.reduce((s, k) => s + c[k], 0);
  // Sem resultados (ex: torneio futuro só com inscritos) → abrir directamente na
  // tab Inscritos em vez de na de Resultados (que estaria vazia/desactivada).
  const effectiveTab: RFEGTab = (tab === "scorecards" && !hasResults && inscritosTotal > 0) ? "inscritos" : tab;
  const sourceLabel = entry.source === "rfegolf" ? "RFEGolf" : entry.source === "nextcaddy" ? "NextCaddy" : entry.source === "golfdirecto" ? "FCG" : "LGS";

  return (
    <>
      <DetailHeader
        title={`${entry.year ?? ""} // ${m.name || entry.name}`}
        sub={
          <>
            <span className="muted">
              🇪🇸 {sourceLabel}
              {m.style && <> · {m.style}</>}
              {m.mode && <> · {m.mode}</>}
              <> · 📅 {dateRange(m.dateStart, m.dateEnd)}</>
              {m.course && <> · 📍 {m.course}</>}
            </span>
            <ExtLink href={sourceUrl} className="tourn-ext-link" style={{ marginLeft: 8 }}>
              🔗 Microsite oficial
            </ExtLink>
            <ExtLink href={scoringUrl} className="tourn-ext-link" style={{ marginLeft: 4 }}>
              📊 Live scoring
            </ExtLink>
          </>
        }
      />

      <div className="card" style={{ margin: "8px 0", padding: "8px 12px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: "var(--fs-13)" }}>
        {entry.category && <span className={catPillClass(entry.category)}>{entry.category}</span>}
        {(() => {
          // Pill de sexo: usa SexBadge (componente global, NUNCA símbolos Unicode).
          // Prioridade a entry.sex; se vazio, derivar das categorias do JSON
          // detalhado (NextCaddy lista "Señoras"/"Caballeros" que o index não
          // converte para M/F/Mixto).
          let sx = entry.sex as string | null;
          const cats = ((entry.categories || []) as string[]);
          if (!sx && cats.length) {
            const hasM = cats.some(c => /Caballeros|Masculino/i.test(c));
            const hasF = cats.some(c => /Señoras|Senoras|Femenino/i.test(c));
            sx = hasM && hasF ? "Mixto" : hasM ? "M" : hasF ? "F" : null;
          }
          if (!sx) return null;
          if (sx === "M") return <SexBadge sex="M" />;
          if (sx === "F") return <SexBadge sex="F" />;
          // Mixto: dois badges lado-a-lado (não há SexBadge "Mixto")
          return (
            <span style={{ display: "inline-flex", gap: 2 }}>
              <SexBadge sex="M" />
              <SexBadge sex="F" />
            </span>
          );
        })()}
        {(m.hcpLimitMen != null) && <span className="muted" title="Limite hcp masculino">Hcp <SexBadge sex="M" /> ≤ {m.hcpLimitMen}</span>}
        {(m.hcpLimitWomen != null) && <span className="muted" title="Limite hcp femenino">Hcp <SexBadge sex="F" /> ≤ {m.hcpLimitWomen}</span>}
        {m.federation && <span className="muted">🏛️ {m.federation}</span>}
      </div>

      {/* ── Tabs principais (3): Resultados/Scorecards | Inscritos | Draw ── */}
      <div className="detail-toolbar" style={{ flexWrap: "wrap", gap: 4, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
        <button
          type="button"
          className={`tourn-tab ${effectiveTab === "scorecards" ? "active" : ""}`}
          onClick={() => setTab("scorecards")}
          disabled={!hasResults}
          style={{ opacity: hasResults ? 1 : 0.4 }}
          title="Resultados ronda-a-ronda + scorecards"
        >
          📋 Resultados {hasResults && <span className="chip" style={{ marginLeft: 4, fontSize: "var(--fs-10)" }}>{fpgTournament!.players.length}</span>}
        </button>
        <button
          type="button"
          className={`tourn-tab ${effectiveTab === "inscritos" ? "active" : ""}`}
          onClick={() => setTab("inscritos")}
          disabled={inscritosTotal === 0}
          style={{ opacity: inscritosTotal > 0 ? 1 : 0.4 }}
        >
          👥 Inscritos <span className="chip" style={{ marginLeft: 4, fontSize: "var(--fs-10)" }}>{inscritosTotal}</span>
        </button>
        <button
          type="button"
          className={`tourn-tab ${effectiveTab === "draw" ? "active" : ""}`}
          onClick={() => setTab("draw")}
          title="Draw / Tee times (em construção)"
        >
          🕐 Draw saída
        </button>
      </div>

      {/* ── Conteúdo da tab ───────────────────────────────────────── */}
      <div style={{ marginTop: 8 }}>
        {effectiveTab === "scorecards" && (
          hasResults ? (
            <IntlTournView
              tournament={fpgTournament!}
              scOptions={lgsScorecardOptions()}
              siLabel={entry.source === "livegolfscoring" ? "m" : "SI"}
              // Para Espanha: ESC visível (Sub-N pill), HCP visível, CLUBE escondido
              accShowCols={{ esc: true, fed: false, tee: false, club: false, hcp: true, age: true, birthYear: false }}
            />
          ) : (
            <EmptyState message="Sem resultados publicados — ver tab Inscritos." />
          )
        )}

        {effectiveTab === "inscritos" && (
          listsAvailable.length === 0 ? (
            <EmptyState message="Sem inscritos publicados." />
          ) : (
            <>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                {(Object.keys(c) as ListKind[]).map((k) => {
                  const enabled = c[k] > 0;
                  const active = effectiveList === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!enabled}
                      className={`chip ${active ? "active" : ""}`}
                      onClick={() => { if (enabled) setList(k); }}
                      style={{ cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : 0.4, fontSize: "var(--fs-11)", padding: "3px 8px" }}
                    >
                      {LIST_LABELS[k]} ({c[k]})
                    </button>
                  );
                })}
              </div>
              <PlayerTable
                players={currentList}
                dateRef={m.dateStart}
                coursePar={data.coursePar}
                parConfidence={data.parConfidence}
              />
            </>
          )
        )}

        {effectiveTab === "draw" && (
          <DrawSaidaView detail={data} entry={entry} />
        )}
      </div>

      <p className="muted" style={{ marginTop: 16, fontSize: "var(--fs-11)" }}>
        Fonte: {sourceLabel.toLowerCase()} · ID {entry.id} · scrape: {data.scrapedAt}
      </p>
    </>
  );
}

/* ── RFEGCategoriesView (Categorías de edad RFEG — info no body) ─────── */

interface RFEGCategory {
  /** Nome oficial RFEG (ALEVÍN, INFANTIL, CADETE, BENJAMÍN, ...). */
  name: string;
  /** Equivalente moderno Sub-N (Sub-10, Sub-12, ...). */
  subN: string;
  /** Idades (anos cumpridos no ano civil). */
  age: string;
  /** Faixa de millésime (ano de nascimento) para o ano de referência (2026). */
  millesime: string;
  /** Equivalente internacional (U-age). */
  intl: string;
  /** Equivalente FPG (escalão português). */
  fpg: string;
  /** Equivalente FFG (categoria francesa). */
  ffg: string;
  /** Cor do pill (matches catPillClass). */
  pillClass?: string;
}

/**
 * Categorias oficiais da RFEG (Real Federación Española de Golf).
 *
 * Fonte: art. comum do regulamento RFEG (imagem original do utilizador
 * "CADETE: 15 y 16 años | INFANTIL: 13 y 14 años | ALEVÍN: 11 y 12 años |
 * BENJAMIN: ..., 7, 8, 9 y 10 años") + dados que aparecem nos torneios
 * scrapados (rfegolf-resultats-index.json contém Benjamín, Alevín, Infantil,
 * Cadete, Junior, Juvenil, Sub-14/16/18/21/25).
 *
 * O ano civil é o critério (igual à FPG): para o ano Y, "Sub-N" significa
 * (Y - ano de nascimento) ≤ N. As tradicionais Benjamín/Alevín/Infantil/Cadete
 * são intervalos exactos.
 *
 * Nota: a tabela usa 2026 como ano de referência; os millésimes deslocam +1
 * por cada ano que passa.
 */
const RFEG_CATEGORIES: RFEGCategory[] = [
  {
    name: "BENJAMÍN",
    subN: "Sub-10",
    age: "≤ 10 anos (7, 8, 9, 10)",
    millesime: "2016-2019",
    intl: "U10",
    fpg: "Sub-10",
    ffg: "Poucet / Poussin",
    pillClass: "p p-sub10 p-sm",
  },
  {
    name: "ALEVÍN",
    subN: "Sub-12",
    age: "11-12 anos",
    millesime: "2014-2015",
    intl: "U12",
    fpg: "Sub-12",
    ffg: "Poussin",
    pillClass: "p p-sub10 p-sm",
  },
  {
    name: "INFANTIL",
    subN: "Sub-14",
    age: "13-14 anos",
    millesime: "2012-2013",
    intl: "U14",
    fpg: "Sub-14",
    ffg: "Benjamin",
    pillClass: "p p-sub12 p-sm",
  },
  {
    name: "CADETE",
    subN: "Sub-16",
    age: "15-16 anos",
    millesime: "2010-2011",
    intl: "U16",
    fpg: "Sub-16",
    ffg: "Minime",
    pillClass: "p p-sub14 p-sm",
  },
  {
    name: "JUNIOR / BOY",
    subN: "Sub-18",
    age: "17-18 anos",
    millesime: "2008-2009",
    intl: "U18",
    fpg: "Sub-18",
    ffg: "Cadet",
    pillClass: "p p-sm",
  },
  {
    name: "JUVENIL",
    subN: "Sub-21",
    age: "≤ 21 anos (regra ampla)",
    millesime: "≥ 2005",
    intl: "U21",
    fpg: "Sub-21",
    ffg: "Espoir",
    pillClass: "p p-sm p-muted",
  },
  {
    name: "SUB-25",
    subN: "Sub-25",
    age: "≤ 25 anos",
    millesime: "≥ 2001",
    intl: "U25",
    fpg: "Sub-25",
    ffg: "—",
    pillClass: "p p-sm p-muted",
  },
];

function RFEGCategoriesView({ catCounts }: { catCounts: Record<string, number> }) {
  const refYear = 2026;
  return (
    <div className="p-12-16">
      <DetailHeader
        title="📚 Categorías de edad RFEG"
        sub={
          <>
            <span className="muted">
              Real Federación Española de Golf — categorias oficiais por idade (ano de
              referência {refYear})
            </span>
            <ExtLink
              href="https://rfegolf.es/"
              className="tourn-ext-link"
              style={{ marginLeft: 8 }}
            >
              🔗 rfegolf.es
            </ExtLink>
          </>
        }
      />

      <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-muted, #fff7e6)", border: "1px solid var(--border, var(--color-rfeg-yellow))", borderRadius: 6, fontSize: "var(--fs-12)" }}>
        <strong>⚠ Espanha não tem federação única.</strong> A RFEG (federação
        nacional) coexiste com 17 federações autonómicas (Andalucía, Madrid,
        Catalunya, Valencia, ...). Os resultados aparecem dispersos por três
        plataformas: <code>rfegolf.es</code> (campeonatos nacionais),{" "}
        <code>livegolfscoring.es</code> (scorecards hbh) e{" "}
        <code>nextcaddy.com</code> (circuitos regionais Andaluzia/Madrid).
      </div>

      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table className="dtable">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Categoría RFEG</th>
              <th>Sub-N moderno</th>
              <th>Idade</th>
              <th>Millésime ({refYear})</th>
              <th>Internacional</th>
              <th>FPG 🇵🇹</th>
              <th>FFG 🇫🇷</th>
              <th>Torneios no índice</th>
            </tr>
          </thead>
          <tbody>
            {RFEG_CATEGORIES.map((c) => {
              const subShort = c.subN.replace("Sub-", "");
              const subRfeg = `Sub-${subShort}`;
              // Conta torneios para este escalão (somando o nome tradicional + Sub-N)
              const traditionalKey = c.name === "JUNIOR / BOY" ? "Junior" : (c.name === "BENJAMÍN" ? "Benjamín" : c.name === "ALEVÍN" ? "Alevín" : c.name === "INFANTIL" ? "Infantil" : c.name === "CADETE" ? "Cadete" : c.name === "JUVENIL" ? "Juvenil" : c.name);
              const trad = catCounts[traditionalKey] || 0;
              const sub = catCounts[subRfeg] || 0;
              const total = trad + sub;
              return (
                <tr key={c.name}>
                  <td>
                    <span className={c.pillClass || "p p-sm"}>{c.name}</span>
                  </td>
                  <td style={{ textAlign: "center", fontFamily: "var(--font-mono)" }}>
                    <strong>{c.subN}</strong>
                  </td>
                  <td style={{ textAlign: "center" }}>{c.age}</td>
                  <td style={{ textAlign: "center", fontFamily: "var(--font-mono)" }}>
                    {c.millesime}
                  </td>
                  <td style={{ textAlign: "center", fontFamily: "var(--font-mono)" }}>
                    {c.intl}
                  </td>
                  <td style={{ textAlign: "center" }}>{c.fpg}</td>
                  <td style={{ textAlign: "center", color: "var(--text-2)" }}>
                    {c.ffg}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    {total > 0 ? (
                      <span title={`${trad} como "${traditionalKey}" + ${sub} como "${subRfeg}"`}>
                        {total}
                        {trad > 0 && sub > 0 && (
                          <span className="muted" style={{ fontSize: "var(--fs-10)" }}>
                            {" "}({trad}+{sub})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 8 }}>📐 Critério de cálculo do escalão</h3>
        <p className="fs-12">
          Tal como na FPG, o escalão é determinado pelo <strong>ano civil</strong>
          {" "}(year-based), não pela idade exacta na data do torneio. A fórmula é:
        </p>
        <pre style={{
          padding: 12,
          background: "var(--bg-muted, #f5f5f5)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          fontSize: "var(--fs-12)",
          overflow: "auto",
        }}>
          {`escalão = ano_torneio − ano_nascimento

p.ex. jogador nascido em 2014, em 2026:
  escalão = 2026 − 2014 = 12 → ALEVÍN (Sub-12)`}
        </pre>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 8 }}>🗂️ Nomenclatura dupla</h3>
        <p className="fs-12">
          Nos torneios scrapados aparecem <em>simultaneamente</em> as duas
          nomenclaturas:
        </p>
        <ul style={{ fontSize: "var(--fs-12)", marginTop: 8 }}>
          <li>
            <strong>Tradicional</strong> — nomes históricos (Benjamín, Alevín,
            Infantil, Cadete, Junior, Juvenil). Usados sobretudo nos campeonatos
            regionais e em torneios mais antigos. Vêm directamente do nome do
            torneio na <code>rfegolf.es</code>.
          </li>
          <li>
            <strong>Moderno Sub-N</strong> — Sub-14, Sub-16, Sub-18, Sub-21, Sub-25.
            Usados em campeonatos nacionais juvenis recentes e nos
            inter-territoriais. Aparecem em "Campeonato Nacional Sub 16
            Masculino", etc.
          </li>
        </ul>
        <p className="muted fs-11" style={{ marginTop: 8 }}>
          A coluna <strong>Torneios no índice</strong> soma ocorrências das duas
          nomenclaturas. Em algumas categorias (p.ex. Sub-21/Juvenil) os
          critérios de idade variam ligeiramente entre torneios — verificar
          regulamento específico.
        </p>
      </div>

      <div className="muted fs-11" style={{ marginTop: 24 }}>
        <strong>Notas:</strong>
        <ul style={{ marginTop: 4 }}>
          <li>
            <em>Benjamín</em> abrange tipicamente 7-10 anos (raramente &lt;7,
            depende do clube/comité). O critério é só o limite superior.
          </li>
          <li>
            <em>Juvenil</em> é o termo histórico amplo para idades 17-21+ — em
            alguns torneios é equivalente a Sub-18, noutros estende até Sub-21.
          </li>
          <li>
            <em>Junior</em> e <em>Boy/Girl</em> são intercambiáveis em RFEG;
            <em> Boy</em> aparece em torneios internacionais.
          </li>
          <li>
            Distância de saída e número de buracos são definidos pelo Comité da
            prova (regulamento RFEG Art. comum).
          </li>
        </ul>
      </div>
    </div>
  );
}

/* ── Página principal ──────────────────────────────────── */

interface DobLookupFile {
  generatedAt: string;
  totalLicencias: number;
  lookup: DobLookup;
}

/** Lookup global de HCP por licença (gerado por build-licencia-hcp-lookup.js).
 *  Usado para preencher HCP em falta nos players (cross-reference entre torneios). */
interface HcpLookupEntry { hcp: number; source: string; tourneyId?: number; dateIso?: string | null }
type HcpLookup = Record<string, HcpLookupEntry>;
interface HcpLookupFile {
  generatedAt: string;
  total: number;
  lookup: HcpLookup;
}

export function RFEGPageLegacy() {
  const [index, setIndex] = useState<RFEGIndex | null>(null);
  const [dobLookup, setDobLookup] = useState<DobLookup | undefined>(undefined);
  const [hcpLookup, setHcpLookup] = useState<HcpLookup | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const md = useMasterDetail(true);
  const navigate = useNavigate();
  const params = useParams<{ source?: string; id?: string; compId?: string }>();
  const { kidsMap } = useKidsLinkMap();

  const [filterText, setFilterText] = useState("");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSex, setFilterSex] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  /** Quando true, mostra a vista de categorias em vez do detalhe de torneio. */
  const [showCategories, setShowCategories] = useState(false);
  const [showFederations, setShowFederations] = useState(false);

  useEffect(() => {
    cachedFetchJson<RFEGIndex>("/data/rfegolf-resultats-index.json")
      .then((d) => {
        if (!d) {
          setError("Ficheiro rfegolf-resultats-index.json não encontrado. Corre `node scripts/build-rfegolf-index.js`.");
          return;
        }
        setIndex(d);
      })
      .catch((e) => setError(String(e?.message ?? e)));
    // Lookup DOB (RFEGolf → NextCaddy enriquecimento). Falha silenciosamente — é opcional.
    cachedFetchJson<DobLookupFile>("/data/licencia-dob-lookup.json")
      .then((d) => { if (d && d.lookup) setDobLookup(d.lookup); })
      .catch(() => {});
    // Lookup HCP global — agrega HCP de todos os torneios para preencher onde falta.
    cachedFetchJson<HcpLookupFile>("/data/licencia-hcp-lookup.json")
      .then((d) => { if (d && d.lookup) setHcpLookup(d.lookup); })
      .catch(() => {});
  }, []);

  /** Sinónimos: dado um termo canónico (Alevín), devolver lista de aliases
   *  reais que aparecem no dataset (Alevín + Sub-12). Declarado antes de
   *  `visible` (que o usa) para evitar ReferenceError em hot-reload. */
  const categoryAliases = useMemo<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {};
    for (const [sub, es] of Object.entries(SUB_TO_ES_TERM)) {
      const canonical = es;
      m[canonical] = m[canonical] || [];
      m[canonical].push(es, sub);
    }
    return m;
  }, []);

  const visible = useMemo(() => {
    if (!index) return [];
    let arr = index.tournaments;
    (window as any).__RFEG_DEBUG = {
      total: index.tournaments.length,
      rfegolf: index.tournaments.filter((t) => t.source === "rfegolf").length,
      rfegWithAdm: index.tournaments.filter((t) => t.source === "rfegolf" && (t.counts?.admitidos || 0) > 0).length,
      has16187: index.tournaments.some((t) => t.id === 16187),
      generatedAt: (index as any).generatedAt,
    };
    // Filtrar torneios SEM dados úteis OU não-juvenis — poluem o sidebar.
    // Regras estritas:
    //   A. SÓ JUVENIS — `category` tem de estar preenchida (Alevín/Benjamín/Infantil/
    //      Cadete/Junior/Juvenil/Sub-N). Torneios de adultos (Caballeros, Señoras,
    //      Senior, Empresas, Liga Social, etc.) ficam fora porque o build-rfegolf-index
    //      não atribui categoria a torneios cujo nome+categories não tem escalão.
    //   B. COM RESULTADOS *ou* INSCRITOS. leaderboardPlayers > 0 (LGS/NC/FCG já
    //      têm classificação) OU counts.admitidos > 0 (microsite rfegolf, que
    //      nunca traz leaderboard mas expõe a lista de inscritos com idade+hcp —
    //      o único sítio onde aparecem os Campeonatos de España e os futuros).
    //      Os rfegolf-só-inscritos são suprimidos quando já existe uma entrada
    //      COM resultados (LGS/NC) do mesmo torneio (mesmo nome+ano) — evita
    //      duplicar o campeonato passado que já tem classificação noutra fonte.
    const norm = (n?: string | null, y?: number | null) =>
      (n || "").toLowerCase().replace(/\s+/g, " ").trim() + "|" + (y ?? "");
    const resultKeys = new Set(
      index.tournaments
        .filter((t) => t.source !== "rfegolf" && (t.leaderboardPlayers || 0) > 0)
        .map((t) => norm(t.name, t.year)),
    );
    arr = arr.filter((t) => {
      if (!t.category) return false;
      const hasResults = (t.leaderboardPlayers || 0) > 0;
      const hasInscritos = (t.counts?.admitidos || 0) > 0;
      if (!hasResults && !hasInscritos) return false;
      if (t.source === "rfegolf" && !hasResults && resultKeys.has(norm(t.name, t.year))) return false;
      return true;
    });
    if (filterYear !== "all") arr = arr.filter((t) => String(t.year) === filterYear);
    if (filterCategory !== "all") {
      // O filtro guarda o termo canónico (ex: "Alevín"); aceitar tanto "Alevín"
      // como "Sub-12" no dataset → bater em qualquer alias.
      const aliases = new Set(categoryAliases[filterCategory] || [filterCategory]);
      arr = arr.filter((t) => t.category != null && aliases.has(t.category));
    }
    if (filterSex !== "all") {
      // M só M; F só F. "Mixto" foi removido do dropdown — usar "all" (M+F)
      // que mostra tudo (incluindo Mixto).
      arr = arr.filter((t) => t.sex === filterSex);
    }
    if (filterSource !== "all") arr = arr.filter((t) => t.source === filterSource);
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      arr = arr.filter((t) =>
        (t.name || "").toLowerCase().includes(q) ||
        (t.course || "").toLowerCase().includes(q),
      );
    }
    return arr;
  }, [index, filterYear, filterCategory, filterSex, filterSource, filterText]);

  const selectedSource = params.source as ("rfegolf" | "nextcaddy" | "livegolfscoring" | undefined);
  const selectedId = params.id ? parseInt(params.id, 10) : (params.compId ? parseInt(params.compId, 10) : null);
  const cur = useMemo(() => {
    if (!index) return null;    if (selectedId && selectedSource) {
      return index.tournaments.find((t) => t.source === selectedSource && t.id === selectedId) || null;
    }
    if (selectedId) {
      return index.tournaments.find((t) => t.source === "rfegolf" && t.id === selectedId)
          || index.tournaments.find((t) => t.id === selectedId)
          || null;
    }
    return visible[0] || null;
  }, [index, selectedId, selectedSource, visible]);

  const years = useMemo(() => {
    if (!index) return [];
    const set = new Set<string>();
    for (const t of index.tournaments) set.add(t.year ? String(t.year) : "—");
    return [...set].sort((a, b) => {
      if (a === "—") return 1;
      if (b === "—") return -1;
      return parseInt(b, 10) - parseInt(a, 10);
    });
  }, [index]);
  /** Categorias agrupadas: Sub-N e termo RFEG são contados juntos sob a chave
   *  RFEG (Alevín, Benjamín, etc). Resultado é Map<termoRFEG, count>. */
  const categories = useMemo<Array<{ key: string; count: number }>>(() => {
    if (!index) return [];
    const merged: Record<string, number> = {};
    for (const [cat, n] of Object.entries(index.byCategory)) {
      // Mapear Sub-N → termo RFEG; manter Alevín etc. como estão
      const canonical = SUB_TO_ES_TERM[cat] || cat;
      merged[canonical] = (merged[canonical] || 0) + n;
    }
    // Ordenar pelo nº de torneios (descendente)
    return Object.entries(merged)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  }, [index]);
  if (error) return <EmptyState message={`Erro: ${error}`} />;
  if (!index) return <LoadingState message="A carregar índice RFEGolf..." />;

  const totalCount = index.total ?? index.totalCompetitions ?? index.tournaments.length;

  return (
    <KidsLinkCtx.Provider value={kidsMap}>
    <div className="tourn-layout">
      <Toolbar>
        <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />
        <ToolbarTitle>🇪🇸 RFEG</ToolbarTitle>
        <input
          className="input"
          placeholder="🔍 Pesquisar..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          style={{ padding: "3px 8px", fontSize: "var(--fs-12)", width: 160, marginLeft: 8 }}
        />
        <select className="input" value={filterYear} onChange={(e) => setFilterYear(e.target.value)} style={{ padding: "3px 6px", fontSize: "var(--fs-12)" }}>
          <option value="all">📅 Anos</option>
          {years.map((y) => <option key={y} value={y}>{y} ({index.byYear[y] ?? "?"})</option>)}
        </select>
        <select className="input" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ padding: "3px 6px", fontSize: "var(--fs-12)" }}>
          <option value="all">🏆 Categorias</option>
          {categories.map(({ key, count }) => (
            <option key={key} value={key}>{key} ({count})</option>
          ))}
        </select>
        <select className="input" value={filterSex} onChange={(e) => setFilterSex(e.target.value)} style={{ padding: "3px 6px", fontSize: "var(--fs-12)" }}>
          <option value="all">M+F</option>
          <option value="M">Masculino</option>
          <option value="F">Femenino</option>
        </select>
        <select className="input" value={filterSource} onChange={(e) => setFilterSource(e.target.value)} style={{ padding: "3px 6px", fontSize: "var(--fs-12)" }}>
          <option value="all">Fontes</option>
          <option value="livegolfscoring">LGS (hbh)</option>
          <option value="rfegolf">RFEGolf</option>
          <option value="nextcaddy">NextCaddy</option>
        </select>
        {(filterText || filterYear !== "all" || filterCategory !== "all" || filterSex !== "all" || filterSource !== "all") && (
          <button
            onClick={() => { setFilterText(""); setFilterYear("all"); setFilterCategory("all"); setFilterSex("all"); setFilterSource("all"); }}
            className="chip"
            style={{ cursor: "pointer", fontSize: "var(--fs-11)" }}
          >✕</button>
        )}
        {cur && cur.course && <ToolbarMeta>📍 {cur.course}</ToolbarMeta>}
        <span className="chip ml-auto">{visible.length} de {totalCount}</span>
      </Toolbar>

      <div className="master-detail">
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          {/* ── Item info: Categorías de edad RFEG ── */}
          <button
            className={`course-item ${showCategories ? "active" : ""}`}
            onClick={() => {
              setShowCategories(true);
              setShowFederations(false);
              md.onSelect();
            }}
            style={{ borderLeft: "3px solid var(--color-rfeg-red)" }}
          >
            <div className="course-item-name">📚 Categorías de edad RFEG</div>
            <div className="course-item-meta">
              {RFEG_CATEGORIES.length} categorias · Benjamín → Sub-25
            </div>
            <div className="course-item-meta" style={{ fontSize: "var(--fs-10)" }}>
              Tradicional + Sub-N · Equiv. FPG/FFG/Internacional
            </div>
          </button>

          {/* ── Item info: Federaciones de Golf España ── */}
          <button
            className={`course-item ${showFederations ? "active" : ""}`}
            onClick={() => {
              setShowFederations(true);
              setShowCategories(false);
              md.onSelect();
            }}
            style={{ borderLeft: "3px solid var(--color-rfeg-red)" }}
          >
            <div className="course-item-name">🏛️ Federaciones de Golf España</div>
            <div className="course-item-meta">
              19 territoriais · 4 NextCaddy · 13 sites próprios
            </div>
            <div className="course-item-meta" style={{ fontSize: "var(--fs-10)" }}>
              RFEG + Andaluza/Madrid/Canaria/CyL/Catalana/...
            </div>
          </button>

          {years.map((y, yIdx) => {
            const yearEntries = visible.filter((t) => (t.year ? String(t.year) : "—") === y);
            if (yearEntries.length === 0) return null;
            return (
              <React.Fragment key={`rfeg-${y}`}>
                
{yIdx === 0 && (
                  <SidebarSectionTitle dark color="var(--color-rfeg-red)" textColor="#ffffff" borderColor="var(--color-rfeg-yellow)" letterSpacing="0.08em">
                    🇪🇸 RFEG — Torneios juvenis
                  </SidebarSectionTitle>
                )}
                <div className="sidebar-year-label" style={{ padding: "2px 10px", fontSize: "var(--fs-10)", fontWeight: 700, letterSpacing: "0.05em", color: "#ffffff", textTransform: "uppercase", marginTop: 4, background: "var(--color-rfeg-red)" }}>{y}</div>
                {yearEntries.map((entry) => {
                  const active = cur?.id === entry.id && cur?.source === entry.source;
                  const sourceColor = entry.source === "rfegolf" ? "var(--color-rfeg-red)" : entry.source === "livegolfscoring" ? "#0a5" : entry.source === "golfdirecto" ? "#0066cc" : "var(--color-rfeg-yellow)";
                  const sourceFg = entry.source === "rfegolf" || entry.source === "livegolfscoring" || entry.source === "golfdirecto" ? "#fff" : "#000";
                  const sourceLabel = entry.source === "rfegolf" ? "RFEGolf" : entry.source === "livegolfscoring" ? "LGS" : entry.source === "golfdirecto" ? "FCG" : "NextCaddy";
                  return (
                    <button
                      key={`${entry.source}-${entry.id}`}
                      className={`course-item ${active && !showCategories ? "active" : ""}`}
                      onClick={() => { setShowCategories(false); setShowFederations(false); navigate(`/rfeg/${entry.source}/${entry.id}`); md.onSelect(); }}
                    >
                      <div className="course-item-name">{entry.name}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4, alignItems: "center" }}>
                        <span className="chip" style={{ fontSize: "var(--fs-9)", background: sourceColor, color: sourceFg, padding: "1px 6px", borderRadius: 8 }}>{sourceLabel}</span>
                        {entry.category && (() => {
                          const cat = SUB_TO_ES_TERM[entry.category] || entry.category;
                          return <EscPill esc={cat} />;
                        })()}
                        {entry.sex === "M" && <SexBadge sex="M" />}
                        {entry.sex === "F" && <SexBadge sex="F" />}
                        {entry.sex === "Mixto" && (
                          <span style={{ display: "inline-flex", gap: 2 }}>
                            <SexBadge sex="M" />
                            <SexBadge sex="F" />
                          </span>
                        )}
                        {((entry.leaderboardPlayers || 0) > 0) && (
                          <RoundPill nR={entry.nRounds && entry.nRounds > 0 ? entry.nRounds : 1} />
                        )}
                      </div>
                      {entry.dateStart && (
                        <div className="course-item-meta" style={{ fontSize: "var(--fs-11)", marginTop: 4 }}>📅 {dateRange(entry.dateStart, entry.dateEnd)}</div>
                      )}
                      {entry.course && (
                        <div className="course-item-meta" style={{ fontWeight: 600, color: "var(--text-2)" }}>📍 {entry.course.length > 50 ? entry.course.slice(0, 50) + "…" : entry.course}</div>
                      )}
                      {entry.counts && entry.counts.admitidos > 0 && (
                        <div className="course-item-meta" style={{ fontSize: "var(--fs-11)", marginTop: 2 }}>
                          🏌️ {entry.counts.admitidos} {entry.source === "livegolfscoring" || entry.source === "golfdirecto" ? "jogadores" : "inscritos"}
                        </div>
                      )}
                    </button>
                  );
                })}
              </React.Fragment>
            );
          })}
          {visible.length === 0 && (
            <div style={{ padding: 20, textAlign: "center" }}>
              <EmptyState size="sm" message="Sem torneios para os filtros actuais." />
            </div>
          )}
        </div>

        <div className="course-detail">
          {showFederations ? (
            <RFEGFederationsView />
          ) : showCategories ? (
            <RFEGCategoriesView catCounts={index.byCategory} />
          ) : cur ? (
            <TournamentDetail entry={cur} dobLookup={dobLookup} hcpLookup={hcpLookup} />
          ) : (
            <EmptyState message="Escolhe um torneio na barra lateral." />
          )}
        </div>
      </div>
    </div>
    </KidsLinkCtx.Provider>
  );
}

/* ════════════════════════════════════════════════════════════════════
 * RFEGPage (NOVO) — assente no CircuitShell partilhado.
 * Reusa os adaptadores/conversores acima (adaptNextCaddy/adaptLgs/adaptFcg,
 * ncToFPGTournament/lgsToFPGTournament/rfegolfToFPGTournament/fcgToFPGTournament).
 * Carregamento LAZY do detalhe por torneio (centenas no índice).
 * RFEGPageLegacy fica preservada acima como referência até validação.
 * TODO: Categorías/Federaciones (special views) e Draw (NC horarios) — ver
 *       docs/circuit-shell-CONTINUAR.md.
 * ════════════════════════════════════════════════════════════════════ */

function rfegSex(s: string | null | undefined): CircuitSex | undefined {
  return s === "M" ? "M" : s === "F" ? "F" : (s === "Mixto" || s === "Mixed") ? "Mixed" : undefined;
}

/** O RFEGolf devolve o país por extenso em espanhol ("ESPAÑA", "PORTUGAL").
 *  Convertemos para código ISO-2 para a função flag() (que aceita ISO/EN/PT). */
const ES_COUNTRY_CODE: Record<string, string> = {
  "ESPANA": "ES", "ESPAÑA": "ES", "PORTUGAL": "PT", "FRANCIA": "FR", "ITALIA": "IT",
  "ALEMANIA": "DE", "INGLATERRA": "GB", "ESCOCIA": "GB", "GALES": "GB", "REINO UNIDO": "GB",
  "IRLANDA": "IE", "BELGICA": "BE", "BÉLGICA": "BE", "HOLANDA": "NL", "PAISES BAJOS": "NL",
  "SUECIA": "SE", "SUIZA": "CH", "POLONIA": "PL", "CHINA": "CN", "REPUBLICA CHECA": "CZ",
  "REPÚBLICA CHECA": "CZ", "DINAMARCA": "DK", "NORUEGA": "NO", "FINLANDIA": "FI",
  "AUSTRIA": "AT", "ESTADOS UNIDOS": "US", "MARRUECOS": "MA", "ANDORRA": "AD",
  "LUXEMBURGO": "LU", "RUSIA": "RU", "MEXICO": "MX", "MÉXICO": "MX", "ARGENTINA": "AR",
  "BRASIL": "BR", "JAPON": "JP", "JAPÓN": "JP", "COREA DEL SUR": "KR", "AUSTRALIA": "AU",
  "CANADA": "CA", "CANADÁ": "CA", "SUDAFRICA": "ZA", "SUDÁFRICA": "ZA",
};

function rfegCountryCode(pais: string | null | undefined): string | undefined {
  if (!pais) return undefined;
  const t = pais.trim();
  if (!t) return undefined;
  return ES_COUNTRY_CODE[t.toUpperCase()] ?? t; // desconhecido passa tal-qual (flag() trata)
}

function rfegInscritoRow(p: RFEGPlayer): CircuitInscritoRow {
  return {
    pos: p.pos ?? undefined,
    name: p.name ? formatPlayerName(p.name) : "—",
    club: p.club ? displayName(p.club) : undefined,
    fed: p.licencia ?? undefined,
    hcp: p.hcp,
    escalao: p.catEdad ?? undefined,
    sex: p.sexo === "M" || p.sexo === "F" ? p.sexo : undefined,
    country: rfegCountryCode(p.pais),
    dob: p.dob ?? undefined,
    status: p.estado ?? undefined,
  };
}

function rfegSourceUrl(t: RFEGIndexEntry): string {
  return t.source === "rfegolf"
    ? `https://rfegolf.es/CompetenciaPaginas/CompetitionMicrosite.aspx?CompId=${t.compId}`
    : t.source === "nextcaddy"
      ? `https://www.nextcaddy.com/tour/${t.tourId}`
      : t.source === "golfdirecto"
        ? `https://www.golfdirecto.com/micro/game/${t.id}/summary?lang=es`
        : `https://rfegolf.livegolfscoring.es/torneos/clasificacion/${t.id}`;
}

/* ── Destaques NextCaddy (item #2) ──────────────────────────────────────
 * Mesmo quando o leaderboard final só sai em PDF, o NextCaddy regista em tempo
 * real birdies/eagles/hole-in-one por jogador. Surgimos isso como tabela de
 * destaques — é o único sinal de desempenho disponível nesses torneios só-PDF. */
type NCHighlightRow = { name: string; eagle: number; birdie: number; ace: number; pts: number };

function ncHighlightRows(scoreTypes: NCDetail["scoreTypes"]): NCHighlightRow[] {
  const m = new Map<string, NCHighlightRow>();
  const bump = (raw: string, key: "eagle" | "birdie" | "ace") => {
    const name = formatPlayerName((raw || "").trim());
    if (!name) return;
    const r = m.get(name) ?? { name, eagle: 0, birdie: 0, ace: 0, pts: 0 };
    r[key]++;
    m.set(name, r);
  };
  for (const [type, v] of Object.entries(scoreTypes || {})) {
    const key = type === "eagle" ? "eagle" : type === "hole_in_one" ? "ace" : type === "birdie" ? "birdie" : null;
    if (!key) continue;
    for (const p of v?.players ?? []) if (p?.playerName) bump(p.playerName, key);
  }
  const rows = [...m.values()];
  for (const r of rows) r.pts = r.ace * 100 + r.eagle * 10 + r.birdie;
  return rows.sort((a, b) => b.pts - a.pts);
}

function NCHighlights({ rows }: { rows: NCHighlightRow[] }) {
  const { sortKey, sortDir, toggleSort } = useSort<"name" | "ace" | "eagle" | "birdie">("name");
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: NCHighlightRow): string | number => (sortKey === "name" ? r.name.toLowerCase() : r[sortKey]);
    return [...rows].sort((a, b) => { const va = val(a), vb = val(b); return va < vb ? -dir : va > vb ? dir : 0; });
  }, [rows, sortKey, sortDir]);
  const hdr = (k: "name" | "ace" | "eagle" | "birdie", label: string) => (
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>{label}</SortableHdr>
  );
  return (
    <div>
      <p className="muted" style={{ fontSize: "var(--fs-13)", margin: "0 0 8px" }}>
        ⚠ Resultados finais só publicados em PDF (ver link no cabeçalho). Destaques de live-scoring registados durante o jogo:
      </p>
      <div className="bjgt-chart-scroll">
        <table className="sc-lb">
          <thead><tr>{hdr("name", "Jogador")}{hdr("ace", "🏌 HiO")}{hdr("eagle", "🦅 Eagle")}{hdr("birdie", "🐦 Birdie")}</tr></thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} className={isM(r.name) ? "row-manuel" : undefined}>
                <td className="lb-name fw-700" style={{ textAlign: "left" }}>{r.name}{isM(r.name) && <> <ManuelPill /></>}</td>
                <td>{r.ace || "—"}</td>
                <td>{r.eagle || "—"}</td>
                <td>{r.birdie || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── NCResultsLeaderboard ────────────────────────────────────────────────
 * Leaderboard de TOTAIS (sem scorecard buraco-a-buraco). Usado quando a fonte
 * dá pos/total/±par por jogador mas não os scores hole-by-hole (ex: NextCaddy
 * Liguillas, cujo leaderboard é real mas sem cartões). Mesmo aspecto .sc-lb que
 * o resto da app, via ScorecardLeaderboard sem scorecard. Colunas vazias ocultas. */
function NCResultsLeaderboard({ players }: { players: RFEGPlayer[] }) {
  type K = "pos" | "nome" | "toPar" | "total" | "hcp" | "club" | "fed";
  const { sortKey, sortDir, toggleSort } = useSort<K>("pos");
  const showFed = players.some((p) => !!p.licencia);
  const showClub = players.some((p) => !!p.club);
  const showHcp = players.some((p) => p.hcp != null);

  const enriched = useMemo(() => players.map((p) => ({
    ...p,
    _name: formatPlayerName(p.name || ""),
    _club: p.club ? displayName(p.club) : "",
  })), [players]);

  const sorted = useMemo(() => {
    const INF = 9999;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...enriched].sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "pos":   v = (a.pos ?? INF) - (b.pos ?? INF); break;
        case "nome":  v = (a._name || "").localeCompare(b._name || "", "pt"); break;
        case "toPar": v = (a.toPar ?? INF) - (b.toPar ?? INF); break;
        case "total": v = (a.total ?? INF) - (b.total ?? INF); break;
        case "hcp":   v = (a.hcp ?? INF) - (b.hcp ?? INF); break;
        case "club":  v = (a._club || "").localeCompare(b._club || "", "es"); break;
        case "fed":   v = (a.licencia || "").localeCompare(b.licencia || ""); break;
      }
      return mult * v;
    });
  }, [enriched, sortKey, sortDir]);

  const rows: ScorecardRow[] = sorted.map((p, i) => {
    const manuel = p._name ? isM(p._name) : false;
    return {
      key: `${p.licencia ?? "-"}-${i}`,
      pos: p.pos ?? i + 1,
      gross: p.total ?? 0,
      toPar: p.toPar ?? null,
      isManuel: manuel,
      sortPos: p.pos ?? null,
      sortName: p._name || "",
      fedCode: p.licencia ?? undefined,
      nameContent: (
        <span className="tourn-pname" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {p._name || "—"}
          {(p.sexo === "M" || p.sexo === "F") && <SexBadge sex={p.sexo} />}
          {manuel && <ManuelPill />}
          {p._name && <KidsLink nome={p._name} />}
        </span>
      ),
      prefixCells: (
        <>
          {showFed && <td className="lb-fed">{p.licencia ?? "—"}</td>}
          {showClub && <td className="lb-club" title={p._club}>{p._club || "—"}</td>}
          {showHcp && <td className="lb-hcp">{p.hcp != null ? p.hcp.toFixed(1) : "—"}</td>}
        </>
      ),
    };
  });

  return (
    <ScorecardLeaderboard
      par={[]}
      rows={rows}
      showScorecard={false}
      prefixHeaderCells={
        <>
          {showFed && <SortableHdr k="fed" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as K)} className="lb-fed">LICENCIA</SortableHdr>}
          {showClub && <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as K)} className="lb-club">CLUBE</SortableHdr>}
          {showHcp && <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as K)} className="lb-hcp">HCP</SortableHdr>}
        </>
      }
      onSortPos={() => toggleSort("pos")}
      onSortName={() => toggleSort("nome")}
      onSortToPar={() => toggleSort("toPar")}
      onSortGross={() => toggleSort("total")}
      activeSortKey={sortKey === "nome" ? "name" : sortKey === "total" ? "gross" : sortKey}
      activeSortDir={sortDir}
    />
  );
}

/** Carrega o detalhe de um torneio e constrói a sua (única) divisão. */
async function rfegLoadDivisions(
  t: RFEGIndexEntry, dobLookup?: DobLookup, hcpLookup?: HcpLookup,
): Promise<CircuitDivision[]> {
  const raw = await cachedFetchJson<RFEGDetail | NCDetail | LgsDetail>(`/data/${t.filePath}`);
  if (!raw) return [];

  let data: RFEGDetail;
  if (t.source === "nextcaddy") data = adaptNextCaddy(raw as NCDetail, dobLookup, hcpLookup);
  else if (t.source === "livegolfscoring") data = adaptLgs(raw as LgsDetail, dobLookup, hcpLookup);
  else if (t.source === "golfdirecto") data = adaptFcg(raw as unknown as FCGDetail, dobLookup, hcpLookup) as unknown as RFEGDetail;
  else { const d = raw as RFEGDetail; data = { ...d, coursePar: d.coursePar ?? null }; }

  let results: FPGTournament | null = null;
  if (t.source === "livegolfscoring" && (data as unknown as { _lgsRounds?: unknown[] })._lgsRounds?.length) {
    results = lgsToFPGTournament({
      id: data.compId,
      meta: { name: data.meta.name, course: data.meta.course, dateRange: data.meta.dateStart, dateIso: data.meta.dateStart },
      rounds: (data as unknown as { _lgsRounds: unknown[] })._lgsRounds,
      course: (data as unknown as { _lgsCourse?: unknown })._lgsCourse,
      _hcpLookup: hcpLookup,
    } as any, dobLookup); // eslint-disable-line @typescript-eslint/no-explicit-any
  } else if (t.source === "nextcaddy") results = ncToFPGTournament(data, dobLookup);
  else if (t.source === "rfegolf") results = rfegolfToFPGTournament(data, dobLookup);
  else if (t.source === "golfdirecto") results = fcgToFPGTournament(data as unknown as MinimalRFEGShape, dobLookup) as unknown as FPGTournament | null;

  const lists = (Object.keys(LIST_LABELS) as ListKind[])
    .map((k) => ({ key: k, label: LIST_LABELS[k], players: (data.inscritos[k] || []).map(rfegInscritoRow) }))
    .filter((l) => l.players.length > 0);

  // Links de PDF originais — o RFEGolf publica ~65% dos resultados só em PDF.
  // Cada grupo de resultados traz o seu pdfUrl; juntamos os únicos como links
  // de ação no header (renderizados pelo CircuitShell via division.links).
  const links: CircuitLink[] = [];
  if (t.source === "rfegolf") {
    const seen = new Set<string>();
    for (const g of data.results || []) {
      if (g.pdfUrl && !seen.has(g.pdfUrl)) {
        seen.add(g.pdfUrl);
        links.push({ label: g.label ? `PDF · ${g.label}` : "Resultados PDF", url: g.pdfUrl, icon: "📄", title: "Resultados oficiais em PDF" });
      }
    }
  }

  // NextCaddy sem scorecard hbh: muitas Liguillas TÊM leaderboard real (pos/
  // total/±par) mas sem cartões → ncToFPGTournament devolve null. Nesse caso
  // mostramos o leaderboard de totais (NCResultsLeaderboard) em vez de cair nos
  // "destaques". Os destaques (NCHighlights) ficam só para torneios mesmo
  // só-PDF (sem qualquer leaderboard) — e mesmo aí têm nomes por PAR de jogadores
  // (o live-scoring regista o flight, não o indivíduo), por isso são último recurso.
  let customResults: React.ReactNode = undefined;
  if (t.source === "nextcaddy" && !results) {
    const admit = data.inscritos.admitidos;
    const hasTotals = admit.some((p) => p.total != null || p.toPar != null);
    if (hasTotals) {
      customResults = <NCResultsLeaderboard players={admit} />;
    } else {
      const hl = ncHighlightRows((raw as NCDetail).scoreTypes);
      if (hl.length) customResults = <NCHighlights rows={hl} />;
    }
  }

  const division: CircuitDivision = {
    key: "main",
    escalao: t.category ?? "—",
    sex: rfegSex(t.sex),
    results: results ?? undefined,
    customResults,
    inscritos: lists.length ? { lists } : undefined,
    links: links.length ? links : undefined,
    scOptions: lgsScorecardOptions(),
  };
  return [division];
}

function buildRfegEntries(index: RFEGIndex, dobLookup?: DobLookup, hcpLookup?: HcpLookup): CircuitEntry[] {
  return index.tournaments
    // Mostrar também torneios FUTUROS/em curso que ainda só têm inscritos
    // (leaderboardPlayers === 0 mas counts.admitidos > 0) — ex: Campeonatos de
    // España já com lista de inscritos antes de serem jogados.
    .filter((t) => t.category && ((t.leaderboardPlayers || 0) > 0 || (t.counts?.admitidos || 0) > 0))
    .map((t): CircuitEntry => ({
      id: `${t.source}:${t.id}`,
      year: t.year,
      name: t.name,
      source: t.source,
      course: t.course ?? undefined,
      // Usar sempre os campos ISO (uniformes) — dateStart/dateEnd cru vêm por
      // extenso nalgumas fontes (LGS: "01 mayo - 03 mayo") e ISO noutras.
      dateStart: t.dateStartIso ?? t.dateStart ?? undefined,
      dateEnd: t.dateEndIso ?? t.dateEnd ?? undefined,
      sourceUrl: rfegSourceUrl(t),
      hcpLimit: (t.hcpLimitMen != null || t.hcpLimitWomen != null)
        ? { men: t.hcpLimitMen ?? undefined, women: t.hcpLimitWomen ?? undefined }
        : undefined,
      escalao: t.category ?? undefined,
      sex: rfegSex(t.sex),
      federation: t.federation ?? undefined,
      hasManuel: t.hasManuel ?? undefined,
      hasPt: t.hasPt ?? undefined,
      // Sem resultados ainda → mostrar nº de inscritos na sidebar.
      playerCount: t.leaderboardPlayers || t.counts?.admitidos || undefined,
      roundsCount: t.nRounds ?? undefined,
      divisionCount: 1,
      loadDivisions: () => rfegLoadDivisions(t, dobLookup, hcpLookup),
    }));
}

const RFEG_CONFIG: CircuitConfig = {
  routeBase: "/rfeg",
  title: "🇪🇸 España",
  color: "var(--color-rfeg-red)",
  grouping: "year",
  sourceColors: { rfegolf: "var(--color-rfeg-red)", livegolfscoring: "#00aa55", golfdirecto: "#0066cc", nextcaddy: "var(--color-rfeg-yellow)" },
  sourceLabels: { rfegolf: "RFEGolf", livegolfscoring: "LGS", golfdirecto: "FCG", nextcaddy: "NextCaddy" },
  filters: { search: true, year: true, escalao: true, sex: true, source: true, toggles: ["manuel", "pt", "top10", "veteranos"] },
  veteranoThreshold: 3,
  loadingMessage: "A carregar dados...",
};

/* ── veteranIndex pré-calculado (páginas lazy) ──────────────────────────
 * O CircuitShell só consegue contar presenças (toggle ✦ Veteranos) a partir
 * das divisões EAGER. A RFEG é lazy (centenas de torneios carregados sob
 * demanda), por isso fornecemos um índice pré-calculado a partir dos
 * agregados de rivais (rfegolf-rivals + fcg-rivals), que já trazem a lista
 * de jogadores por torneio sem precisar de abrir cada ficheiro de detalhe.
 *
 * ⚠ As chaves TÊM de bater com `normName(player.name)` do shell: o leaderboard
 * formata os nomes via formatPlayerName() (reordena "APELIDO, Nome" e
 * Title-Case), por isso aplicamos a MESMA transformação aqui antes de
 * normalizar (lowercase + NFD sem diacríticos + espaços únicos). */
interface RfegRivalsFile {
  torneios?:
    | Record<string, { players?: { n?: string }[] }>
    | { players?: { n?: string }[] }[];
}

/** Replica EXACTA do normName interno do CircuitShell (manter em sincronia). */
function normNameVet(s: string): string {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

function buildRfegVetIndex(files: (RfegRivalsFile | null | undefined)[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of files) {
    if (!f?.torneios) continue;
    const tors = Array.isArray(f.torneios) ? f.torneios : Object.values(f.torneios);
    for (const t of tors) {
      const players = t?.players;
      if (!Array.isArray(players)) continue;
      const seen = new Set<string>(); // dedup por torneio (cross-divisão)
      for (const p of players) {
        const k = normNameVet(formatPlayerName(String(p?.n ?? "")));
        if (!k || seen.has(k)) continue;
        seen.add(k);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
  }
  return m;
}

export default function RFEGPage() {
  const [index, setIndex] = useState<RFEGIndex | null>(null);
  const [dobLookup, setDobLookup] = useState<DobLookup | undefined>(undefined);
  const [hcpLookup, setHcpLookup] = useState<HcpLookup | undefined>(undefined);
  const [twins, setTwins] = useState<Record<string, number>>({});
  const [vetIndex, setVetIndex] = useState<Map<string, number>>(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const params = useParams<{ source?: string; id?: string; compId?: string }>();

  useEffect(() => {
    cachedFetchJson<RFEGIndex>("/data/rfegolf-resultats-index.json")
      .then((d) => { if (!d) { setError("Ficheiro rfegolf-resultats-index.json não encontrado. Corre `node scripts/build-rfegolf-index.js`."); return; } setIndex(d); })
      .catch((e) => setError(String(e?.message ?? e)));
    cachedFetchJson<DobLookupFile>("/data/licencia-dob-lookup.json").then((d) => { if (d && d.lookup) setDobLookup(d.lookup); }).catch(() => {});
    cachedFetchJson<HcpLookupFile>("/data/licencia-hcp-lookup.json").then((d) => { if (d && d.lookup) setHcpLookup(d.lookup); }).catch(() => {});
    // Gémeos RFEGolf<->LGS: esconder o duplicado RFEGolf (só-PDF) quando há LGS rico.
    cachedFetchJson<{ twins: Record<string, number> }>("/data/rfegolf-lgs-twins.json").then((d) => { if (d && d.twins) setTwins(d.twins); }).catch(() => {});
    // Índice de veteranos (presenças por jogador) — agregados de rivais.
    Promise.all([
      cachedFetchJson<RfegRivalsFile>("/data/rfegolf-rivals.json").catch(() => null),
      cachedFetchJson<RfegRivalsFile>("/data/fcg-rivals.json").catch(() => null),
    ]).then(([a, b]) => {
      const m = buildRfegVetIndex([a, b]);
      if (m.size) setVetIndex(m);
    });
  }, []);

  const entries = useMemo(
    () => {
      if (!index) return [];
      const all = buildRfegEntries(index, dobLookup, hcpLookup);
      // Esconder o duplicado RFEGolf quando existe gémeo LGS (mais rico: hbh+metros).
      // O LGS é canónico; o RFEGolf só-PDF (par falso, sem scorecards) é suprimido.
      return all.filter((e) => {
        const [src, id] = e.id.split(":");
        return !(src === "rfegolf" && twins[id] != null);
      });
    },
    [index, dobLookup, hcpLookup, twins],
  );

  // Aterrar num URL RFEGolf com gémeo LGS → redirige para o LGS rico (hbh+metros).
  useEffect(() => {
    if (params.source === "rfegolf" && params.id && twins[params.id] != null) {
      navigate(`/rfeg/livegolfscoring/${twins[params.id]}`, { replace: true });
    }
  }, [params.source, params.id, twins, navigate]);

  // Vista informativa via URL: /rfeg/info/{key} (deep-linkável, persiste no reload).
  // "info" não colide com as fontes reais (rfegolf/nextcaddy/livegolfscoring/golfdirecto).
  const onInfo = params.source === "info";
  const selectedInfo = onInfo ? (params.id ?? null) : null;

  const selectedId = useMemo<string | undefined>(() => {
    if (onInfo) return undefined;
    const idStr = params.id ?? params.compId;
    if (!idStr) return undefined;
    if (params.source) return `${params.source}:${idStr}`;
    return entries.find((e) => e.id.endsWith(`:${idStr}`))?.id;
  }, [params.id, params.compId, params.source, entries, onInfo]);

  // Config + páginas informativas (menu INFO na toolbar do shell).
  const config = useMemo<CircuitConfig>(() => ({
    ...RFEG_CONFIG,
    veteranIndex: vetIndex.size ? vetIndex : undefined,
    specialItems: index ? [
      { key: "jugadores", label: "👥 Jugadores de España", render: () => <RFEGPlayersView /> },
      { key: "categorias", label: "📚 Categorías de edad", render: () => <RFEGCategoriesView catCounts={index.byCategory} /> },
      { key: "federaciones", label: "🏛️ Federaciones de España", render: () => <RFEGFederationsView /> },
    ] : [],
  }), [index, vetIndex]);

  if (error) return <EmptyState message={`Erro: ${error}`} />;
  if (!index) return <LoadingState message="A carregar índice RFEGolf..." />;

  return (
    <CircuitShell
      entries={entries}
      config={config}
      selectedId={selectedId}
      onSelectEntry={(e) => {
        const [src, id] = e.id.split(":");
        navigate(`/rfeg/${src}/${id}`);
      }}
      selectedInfo={selectedInfo}
      onSelectInfo={(key) => navigate(key ? `/rfeg/info/${key}` : "/rfeg")}
    />
  );
}
