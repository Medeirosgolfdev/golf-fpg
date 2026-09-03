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
import { displayName, fmtToPar, norm } from "../utils/format";
import { flag } from "../utils/flagUtils";
import { tpColor } from "../ui/tournamentPrimitives";
import { formatPlayerName } from "../utils/playerUtils";
import { IntlTournView } from "../ui/IntlTournView";
import DrawTab from "../ui/DrawTab";
import type { FpgDraw, FpgDrawFlight, FpgAdmissions, FpgAdmissionPlayer } from "../data/nacional2026Loader";
import AdmissionsTab from "../ui/AdmissionsTab";
import { useFedByName, loadFedByName, fedByNameKeys, type FedByNameEntry } from "../ui/InscricoesComponents";
import { loadGolfboxPlayers, golfboxLookup, type GolfboxEntry } from "../ui/InscricoesComponents";
import type { PlayersDB } from "../ui/tournamentPrimitives";
import type { Tournament as FPGTournament, Player as FPGPlayer, RoundScore as FPGRoundScore, ScorecardOptions } from "./FPGPage";
import { RFEGFederationsView } from "./rfeg/FederationsView";
import { RFEGPlayersView } from "./rfeg/PlayersView";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitEntry, CircuitConfig, CircuitDivision, CircuitInscritoRow, CircuitSex, CircuitLink } from "../ui/circuit/types";
import { tournamentFamilyKey } from "../ui/circuit/pastEditions";
import { vetKey } from "../utils/normName";

/** Normaliza nome/texto ES para matching: NFKD, sem diacríticos, vírgulas/pontos → espaço.
 *  ⚠ Diferente do `norm` partilhado (format.ts), que tira apóstrofos em vez de vírgulas. */
const normEs = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();

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
  /** Fingerprint de roster (nomes normalizados, ordenados+únicos) gerado pelo
   *  build do índice. Permite confirmar "é o mesmo evento?" por JOGADORES no
   *  buildRfegEntries sem carregar as divisões. Vazio p/ torneios só-inscritos. */
  roster?: string[];
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
  rounds?: { round: number; gross: number | null; scores?: number[]; meters?: number[] | null }[];
  total?: number | null;
  toPar?: number | null;
  teeMeters?: number | null;   // distância total do tee deste jogador (rapazes/raparigas jogam tees distintos)
  courseHcp?: number | null;   // hándicap de campo (do "HcpJuego" NextCaddy) — deriva CR/Slope
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
   *  a partir dos scores hole-by-hole, para RFEGolf vem como null; para mitarjeta
   *  vem do cartão do campo). */
  coursePar?: number[] | null;
  parConfidence?: "high" | "medium" | "low";
  /** mitarjeta.golf (Campeonatos de España juvenis ao vivo): id do torneo +
   *  SI/metros reais por buraco + draw R1. Quando presente, o conversor usado é
   *  mitarjetaToFPGTournament (scorecards hole-by-hole + HCP + idade). */
  mitarjetaTorneo?: number;
  _rfegCourseSi?: number[] | null;
  _rfegCourseMeters?: number[] | null;
  teeTimes?: { round: number; groups: Array<{ tee: number | string; time: string; players: string[] }> };
  /** Draw multi-ronda (mitarjeta): todas as rondas. R1 também vem em `teeTimes`
   *  (retro-compat). Populado por scrape-mitarjeta.js (segue os links de ronda). */
  teeTimesAll?: Array<{ round: number; groups: Array<{ tee: number | string; time: string; players: string[] }> }>;
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
    // ── mitarjeta extras (cartão do campo) ──
    source?: string;
    parTotal?: number | null;
    metersTotal?: number | null;
    perHole?: Array<{ hole: number; par: number; si: number; meters: number }>;
    players: Array<{
      pos: number | null;
      name: string;
      toPar: number;
      hoy: number;
      rounds: number[];
      total: number;
      // ── mitarjeta enrichment (opcional) ──
      hcp?: number | null;
      dob?: string | null;
      licencia?: string | null;
      club?: string | null;
      catEdad?: string | null;
      sexo?: string | null;
      holeScores?: Record<string, number[]>; // round → strokes[18]
      startHole?: number | null;             // saída R1 (1 ou 10)
      region?: string | null;
      sd?: Array<number | null>;
      bestSd?: number | null;
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

/** Ano/mês/dia de uma data, nos DOIS formatos que aqui se cruzam: "19/07/2008"
 *  (fontes espanholas) e "2008-07-19" (ISO — federados FPG e as datas dos
 *  torneios). ⚠ Antes só o primeiro era aceite, com dois efeitos: os
 *  portugueses, cuja ficha vem da FPG em ISO, ficavam sem idade nenhuma; e a
 *  data do TORNEIO (também ISO) caía sempre no `else`, ou seja, a idade era
 *  calculada à data de hoje em vez de à data em que se jogou. */
function ymd(s: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!s) return null;
  const dmy = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (dmy) return { y: +dmy[3], m: +dmy[2], d: +dmy[1] };
  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return { y: +iso[1], m: +iso[2], d: +iso[3] };
  return null;
}

function ageAt(dob: string | null, ref: string | null | undefined): number | null {
  const b = ymd(dob);
  if (!b) return null;
  const r = ymd(ref);
  const today = new Date();
  const ry = r ? r.y : today.getFullYear();
  const rmm = r ? r.m : today.getMonth() + 1;
  const rd = r ? r.d : today.getDate();
  let age = ry - b.y;
  if (rmm < b.m || (rmm === b.m && rd < b.d)) age--;
  return age;
}

/** Converte uma data "DD/MM/YYYY" (formato das fontes España) para ISO
 *  "YYYY-MM-DD". Deixa passar valores já-ISO e devolve null se não reconhecer.
 *  O AdmissionsTab partilhado — e os utils `ageAtDate`/`escalaoAtDate` que ele usa —
 *  assumem dob/datas em ISO (a federados.json FPG é ISO). Sem esta conversão,
 *  `parseInt(dob.slice(0,4))` lia o DIA ("01/02/2016" → 1) e `new Date(dob)`
 *  ficava Invalid (idade "? anos"). */
function esDateToIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t : null;
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
      country?: string | null; region?: string | null;
      /** Ronda A DECORRER: buracos já jogados ("scores" com nulls nos que
       *  faltam), quantos são, e a soma parcial. O "total" fica null — um
       *  cartão a meio não é uma volta. */
      holesPlayed?: number | null; partialGross?: number | null;
    }> }>;
    course?: { meters?: (number | null)[]; si?: (number | null)[]; par?: (number | null)[]; courseRating?: number | null; slope?: number | null } | null;
  },
  dobLookup?: DobLookup,
  /** Federados FPG por nome — só consultado para quem a bandeira da fonte diz
   *  ser português (ver `ptFed` abaixo). */
  fedByName?: Map<string, FedByNameEntry>,
  /** Fichas GolfBox (EGA + federações nórdicas) por nome — DOB/licença dos
   *  ESTRANGEIROS, que a fonte espanhola não conhece. */
  golfbox?: Map<string, GolfboxEntry[]>,
): FPGTournament {
  const norm = normEs;
  const lookupByName: Record<string, DobLookupEntry> = {};
  if (dobLookup) for (const e of Object.values(dobLookup)) if (e.name) lookupByName[norm(e.name)] = e;

  // Nº de buracos do campo (9 ou 18). Benjamín/Alevín (sub-10/12) jogam 9 buracos;
  // tudo o resto 18. Detecta-se pelo par[] que o scraper produz. 18 buracos = path
  // original intocado.
  const rawPar = lgs.rounds[0]?.par;
  const courseHoles: number = rawPar && rawPar.length === 9 ? 9 : 18;
  const par = rawPar && (rawPar.length === 18 || rawPar.length === 9) ? rawPar : new Array(courseHoles).fill(4);
  const parTotal = par.reduce((a, b) => a + b, 0);
  const numRounds = lgs.rounds.length;
  // Rondas EFECTIVAMENTE jogadas: uma ronda só com SCORES reais conta. Uma ronda
  // agendada mas ainda por jogar pode (a) vir vazia, OU (b) trazer já a lista de
  // jogadores como PLACEHOLDERS do draw (tee times) com `scores/total: null`
  // (`_partial`). Filtrar por `players.length` não chegava — a R3 placeholder do
  // Campeonato de España juvenil 2026 contava como jogada → toda a gente ficava
  // incompleta (→ WD) e pos/toPar/total liam-se da ronda sem scores (→ "--").
  // Uma ronda A DECORRER conta como jogada desde que alguém já tenha buracos
  // entregues ("partialGross") — é o que põe os resultados de hoje na página,
  // em vez de esperar que a volta feche.
  const roundIsPlayed = (r: { players: Array<{ total: number | null; partialGross?: number | null }> }) =>
    (r.players ?? []).some((p) => (p.total != null && p.total > 0 && p.total < 999)
      || (p.partialGross != null && p.partialGross > 0));
  const playedRoundsArr = lgs.rounds.filter(roundIsPlayed);
  const playedRounds = playedRoundsArr.length || numRounds;
  // Voltas FECHADAS. ⚠ NÃO basta "alguém já tem total": a meio do segundo dia
  // os primeiros grupos já entregaram (15 de 120) e isso fazia a ronda contar
  // como fechada — toda a gente que ainda não saiu ficava "incompleta" e a
  // aparecer como **WD**, o líder da véspera incluído. Uma ronda está a decorrer
  // enquanto houver cartões a meio, ou enquanto menos de metade do campo tiver
  // entregue (uma ronda acabada tem quase toda a gente, tirando WD genuínos).
  const roundEmCurso = (r: { players: Array<{ total: number | null; partialGross?: number | null }> }) => {
    const ps = r.players ?? [];
    if (!ps.length) return false;
    const comTotal = ps.filter((p) => p.total != null && p.total > 0 && p.total < 999).length;
    if (!comTotal) return false;
    const parciais = ps.filter((p) => p.partialGross != null && p.partialGross > 0).length;
    // Cartões a meio são o sinal directo. O limiar cobre o intervalo em que
    // ninguém está no campo (uns já entregaram, outros ainda não saíram): numa
    // ronda fechada quase toda a gente tem total, tirando os WD.
    return parciais > 0 || comTotal < ps.length * 0.85;
  };
  const closedRounds = lgs.rounds.filter((r) =>
    (r.players ?? []).some((p) => p.total != null && p.total > 0 && p.total < 999) && !roundEmCurso(r)).length;
  const sliceH = <T,>(a: T[] | undefined | null): T[] => (a || []).slice(0, courseHoles);
  // teeName com a distância total → o scorecard só desenha a linha de METROS quando
  // o jogador tem teeName (ScorecardLB agrupa metros por tee). Sem isto, os torneios
  // livegolfscoring (par/metros reais no `course`) NÃO mostravam a linha de metros.
  const lgsMetersTotal = sliceH(lgs.course?.meters).reduce((a: number, b) => a + (b || 0), 0);
  const lgsTeeLabel: string | undefined = lgsMetersTotal > 0 ? `${lgsMetersTotal} m` : undefined;

  // Agregar por jogador (key = memberId ou nome) com scores hbh por ronda
  type Acc = { name: string; pos: number | null; toPar: number; total: number; rounds: FPGRoundScore[]; country: string | null; region: string | null };
  const agg: Record<string, Acc> = {};
  for (const r of lgs.rounds) {
    for (const p of r.players) {
      const key = p.memberId || p.name;
      if (!agg[key]) agg[key] = { name: p.name, pos: null, toPar: 0, total: 0, rounds: [], country: null, region: null };
      if (p.country && !agg[key].country) agg[key].country = p.country;
      if (p.region && !agg[key].region) agg[key].region = p.region;
      // Aceitar a ronda com total válido mesmo SEM scorecard buraco-a-buraco —
      // rondas preenchidas pela classificação geral (quando o hoyoahoyo não listou
      // o jogador) só trazem o total. Contam para gross/standings; o scorecard
      // dessa ronda fica em branco. Sem isto, um 2º/3º classificado ausente de
      // R1/R2 caía como "incompleto" e o top-3 do Resumo saía errado.
      const hasCard = !!(p.scores && p.scores.length === courseHoles);
      const emCurso = p.total == null && p.partialGross != null && p.partialGross > 0;
      if ((p.total != null && p.total > 0 && p.total < 999) || emCurso) {
        agg[key].rounds.push({
          round: r.round, gross: emCurso ? (p.partialGross as number) : (p.total as number),
          scores: hasCard ? (p.scores as number[]) : [], pars: r.par || par,
          si: sliceH(lgs.course?.si) as number[], meters: sliceH(lgs.course?.meters) as number[], teeName: lgsTeeLabel,
          courseRating: lgs.course?.courseRating ?? undefined,
          slope: lgs.course?.slope ?? undefined,
          // Volta a meio: o gross é a soma dos buracos ENTREGUES, não uma volta.
          // Fica fora do total do torneio (ver `total` mais abaixo) e o cartão
          // mostra só os buracos jogados.
          ...(emCurso ? { _emCurso: true, _holesPlayed: p.holesPlayed ?? null } : {}),
        } as FPGRoundScore);
      }
    }
  }
  // Rondas de cada jogador por ordem (o backfill da classificação pode chegar fora de ordem)
  for (const a of Object.values(agg)) a.rounds.sort((x, y) => x.round - y.round);
  // Pos/toPar/total da última ronda COM jogadores (não a última agendada — que
  // pode estar vazia num evento em curso e zerava o leaderboard).
  const lastR = playedRoundsArr[playedRoundsArr.length - 1];
  if (lastR) {
    for (const p of lastR.players) {
      const key = p.memberId || p.name;
      if (agg[key]) {
        agg[key].pos = p.pos;
        agg[key].toPar = p.toPar;
        // Só VOLTAS FECHADAS somam para o total do torneio — somar o parcial de
        // quem vai no buraco 12 dava um "total" que não é resultado nenhum.
        agg[key].total = agg[key].rounds
          .filter((x) => !(x as { _emCurso?: boolean })._emCurso)
          .reduce((a, b) => a + b.gross, 0);
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
    // Português num torneio espanhol: a fonte local não o conhece (sem licença
    // RFEG), mas nós temos a ficha dele na FPG. Só se aplica a quem a BANDEIRA
    // da fonte marca como PT — cruzar por nome sem essa garantia apanharia
    // homónimos espanhóis.
    const ptFed = a.country === "PT" && fedByName
      ? fedByNameKeys(a.name).map((k) => fedByName.get(k)).find(Boolean)
      : undefined;
    // Estrangeiro sem ficha local: procurar no roster GolfBox, exigindo a
    // nacionalidade da bandeira (um homónimo de outro país não serve).
    const gb = !e && !ptFed ? golfboxLookup(golfbox, a.name, a.country) : undefined;
    const club = e?.club ? displayName(e.club) : (ptFed?.club ? displayName(ptFed.club) : (gb?.club ? displayName(gb.club) : ""));
    const dobRef = e?.dob || ptFed?.dob || gb?.dob || null;
    const age = dobRef ? ageAt(dobRef, dateRef) : null;
    const escLabel = escaloEsForPlayer(e?.catEdad, dobRef, dateRef);
    const sex: "M" | "F" | null = (e?.sex || ptFed?.sex) === "M" ? "M" : (e?.sex || ptFed?.sex) === "F" ? "F" : null;
    // "Incompleto" (→ WD) mede-se só contra as voltas FECHADAS: quem ainda não
    // saiu para a ronda de hoje não é um desistente.
    const incomplete = a.rounds.filter((x) => !(x as { _emCurso?: boolean })._emCurso).length < closedRounds;
    // HCP via lookup global (LGS não tem HCP no JSON)
    const lic = (e?.licencia || "").toUpperCase();
    // ⚠ `lic && …` devolve a STRING VAZIA quando não há licença — não null.
    // Testar `!= null` deixava passar essa string e o HCP do federado português
    // nunca era usado (coluna a "—" em todos os nossos).
    const hcpEs = lic ? (lgs as any)._hcpLookup?.[lic]?.hcp : undefined;   // eslint-disable-line @typescript-eslint/no-explicit-any
    const hcp = typeof hcpEs === "number" ? hcpEs : (ptFed?.hcp ?? undefined);
    // Bandeira do leaderboard oficial (o LGS marca-a na linha de cada jogador).
    // Vai na coluna do clube — mesmo padrão do BJGT/England, que também não têm
    // clube dos estrangeiros; a região ("Andalucía") serve de clube quando o
    // lookup não traz nenhum. Sem isto os 7 portugueses deste torneio eram
    // indistinguíveis no meio de 120 nomes.
    // ⚠ Só ESTRANGEIROS levam bandeira — mesma convenção do `rfegForeignFlag`:
    // estamos no circuito espanhol, os espanhóis são o default.
    const clubLabel = club || a.region || "";
    const flagEmoji = a.country && a.country !== "ES" ? flag(a.country) : "";
    return {
      scoreId: `lgs-${lgs.id}-${idx}`,
      pos: a.pos ?? idx + 1,
      name: formatPlayerName(a.name),
      club: [flagEmoji, clubLabel].filter(Boolean).join(" ") || "—",
      _isPortuguese: a.country === "PT",
      _country: a.country || undefined,
      fed: e?.licencia || ptFed?.fed || gb?.memberId || undefined,
      fedCode: e?.licencia || ptFed?.fed || gb?.memberId || undefined,
      grossTotal: a.total || null,
      toPar: a.toPar,
      hcpExact: hcp != null ? hcp : undefined,
      escalao: escLabel,
      dob: dobRef || undefined,
      _sex: sex,
      _age: age,
      nholes: courseHoles,
      parTotal,
      courseRating: lgs.course?.courseRating ?? undefined,
      slope: lgs.course?.slope ?? undefined,
      scores: a.rounds[0]?.scores || [],
      par,
      si: sliceH(lgs.course?.si),
      meters: sliceH(lgs.course?.meters),
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
    // Só as rondas JOGADAS geram abas de resultados (uma R3 ainda por jogar não
    // cria uma aba "R3" vazia a dizer "sem scorecards"). O draw da R3 aparece à
    // mesma, como aba "Draw R3" intercalada (ver roundDraws em rfegLoadDivisions).
    rounds: playedRounds,
    // Ronda a decorrer (se houver): o acumulado desconta-a ao decidir quem está
    // incompleto, para não marcar como eliminado quem ainda nem saiu.
    _openRound: lgs.rounds.find(roundEmCurso)?.round,
    playerCount: players.length,
    players,
  };
}

function lgsScorecardOptions(): ScorecardOptions {
  // Vista coerente para ES (todos os 3 sources):
  // - ESC visível (idade → Sub-N, pill colorido global)
  // - HCP visível (coluna própria, sortable)
  // - CLUBE escondido (irrelevante em ES — não conhecemos os clubes)
  // - SD visível quando há CR/Slope (Valor del campo) — cai para "–" quando o
  //   torneio não os publica (ou ainda não foi re-scrapado)
  // - TEE escondido
  // - noPlayerLink: licenças espanholas (AM12345...) não correspondem a fed codes
  //   FPG — não criar link /jogadores/{fed} a apontar para nada útil.
  return {
    hideHCP: false,
    hideEsc: false,
    hideClub: true,
    hideSD: false,
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
/** Termo oficial RFEG para o escalão. Sub-12 → "Alevín", etc. */
function ageToEscalaoEs(age: number | null): string | null {
  const subN = ageToSubN(age);
  if (!subN) return null;
  return SUB_TO_ES_TERM[subN] || subN;
}

/** Variantes de caixa/acento dos termos RFEG → forma canónica (a fonte traz
 *  "Alevín" e "ALEVIN" misturados; sem isto a UI mostrava as duas grafias). */
const ES_TERM_CANON: Record<string, string> = {
  benjamin: "Benjamín", alevin: "Alevín", infantil: "Infantil",
  cadete: "Cadete", junior: "Junior", juvenil: "Juvenil", absoluto: "Absoluto",
};
function canonEscaloEs(s: string | null | undefined): string | null {
  if (!s) return null;
  const k = s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s-]/g, "");
  return ES_TERM_CANON[k] || s.trim();
}
/** Extrai o ano (4 dígitos) de uma data "DD/MM/YYYY" ou ISO "YYYY-MM-DD". */
function yearOf(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /(\d{4})/.exec(s);
  return m ? parseInt(m[1], 10) : null;
}
/** Escalão RFEG canónico de um jogador.
 *  1) idade-no-ano = anoTorneio − anoNascimento (NÃO a idade exacta à data do
 *     torneio — senão o mesmo ano de nascimento parte-se em duas categorias
 *     consoante o aniversário caia antes/depois do torneio: ex. dois nascidos
 *     em 2015 apareciam como Alevín e Benjamín no mesmo campeonato).
 *  2) Fallback: categoria da fonte (catEdad/nivel), normalizada.
 *
 *  ⚠ A ordem já foi a inversa ("a categoria da fonte é oficial, logo manda").
 *  Não manda: o `catEdad` do `licencia-dob-lookup` é um RETRATO da última prova
 *  em que vimos o jogador, que pode ser de há anos — e o escalão muda todos os
 *  anos. Num torneio de 2026 apareciam "Infantil" e "Alevín" em miúdos nascidos
 *  em 2008-2010 (Sub-18/Sub-16), porque a categoria guardada era de 2021-2024.
 *  Com DOB, a idade-no-ano é a verdade e a categoria da fonte não acrescenta
 *  nada; sem DOB, é tudo o que temos. */
function escaloEsForPlayer(
  catEdad: string | null | undefined,
  dob: string | null | undefined,
  ref: string | null | undefined,
): string | null {
  const by = yearOf(dob), ty = yearOf(ref);
  if (by != null && ty != null) {
    const calc = ageToEscalaoEs(ty - by);
    if (calc) return calc;
  }
  return canonEscaloEs(catEdad);
}

/* ── ncToFPGTournament ────────────────────────────────────────
 * Converte JSON NextCaddy (já adaptado para RFEGDetail por adaptNextCaddy)
 * em FPGTournament — mesma estrutura uniforme para IntlTournView.
 *
 * Requer que o JSON tenha sido scrapado com `--scorecards` (popula roundScores
 * em cada player + course.par[]). Se estiver vazio, devolve null. */
/** Deriva CR/Slope por sexo a partir da relação linear WHS entre HI e hándicap
 *  de campo: CH = HI'·(Slope/113) + (CR − Par). O NextCaddy não publica CR/Slope,
 *  mas expõe o CH (coluna oculta "HcpJuego") → a regressão de CH sobre HI recupera
 *  o declive `a` e o intercepto `b`: CR = Par + b, Slope = 113·a.
 *  ⚠ Torneios de 9 buracos usam o índice de 9h = HI/2, logo o CH escala com HI/2
 *  → o declive é Slope9/(2·113) e Slope9 = 226·a (senão vinha metade e era rejeitado).
 *  Cada sexo joga o seu tee → CR/Slope próprios. Exige ≥4 pares e ajuste apertado
 *  (o CH é inteiro → R² alto confirma o modelo); senão devolve null (sem coluna SD). */
function ncDeriveRatings(
  players: RFEGPlayer[],
  parTotal: number,
  is9: boolean,
): Record<"M" | "F", { cr: number; slope: number } | null> {
  const slopeDivisor = is9 ? 226 : 113;  // 9h: CH baseado em HI/2
  const fit = (sx: "M" | "F"): { cr: number; slope: number } | null => {
    const pts: [number, number][] = [];
    for (const p of players) {
      const s = p.sexo === "M" ? "M" : p.sexo === "F" ? "F" : null;
      if (s !== sx) continue;
      const hi = typeof p.hcp === "number" ? p.hcp : null;
      const ch = p.courseHcp;
      if (hi == null || ch == null || Number.isNaN(ch)) continue;
      pts.push([hi, ch]);
    }
    if (pts.length < 4) return null;
    const n = pts.length;
    const mx = pts.reduce((a, q) => a + q[0], 0) / n;
    const my = pts.reduce((a, q) => a + q[1], 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
    if (sxx === 0) return null;
    const a = sxy / sxx, b = my - a * mx;
    const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
    const slope = a * slopeDivisor, cr = parTotal + b;
    // Sanidade WHS: Slope plausível + CR perto do par + ajuste apertado.
    if (r2 < 0.9 || !(slope > 55 && slope < 165) || Math.abs(cr - parTotal) > 14) return null;
    return { cr: Math.round(cr * 10) / 10, slope: Math.round(slope * 10) / 10 };
  };
  return { M: fit("M"), F: fit("F") };
}

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

  // Nº de buracos: NextCaddy tem torneios de 9 buracos (pitch&putt, alevíns) cujo
  // course.par/scores têm length 9. Detetar 9 vs 18 em vez de assumir 18 — assumir
  // 18 dropava TODOS os cartões de 9 (filtro scores.length===18) e mostrava par-72
  // fake. par18/si18/meters18 mantêm o nome mas guardam 9 OU 18 valores conforme o campo.
  const holeCount = (detail.coursePar && (detail.coursePar.length === 9 || detail.coursePar.length === 18))
    ? detail.coursePar.length
    : (players.some((p) => (p.rounds || []).some((r) => {
        const s = (r as { scores?: number[] }).scores;
        return Array.isArray(s) && s.length === 9;
      })) ? 9 : 18);
  const meters18 = (detail._ncCourseMeters && detail._ncCourseMeters.length === holeCount) ? detail._ncCourseMeters : [];
  // ⚠ Pitch & Putt → TODOS os buracos são PAR 3. O par do NextCaddy é INFERIDO dos
  // scores (infer-nextcaddy-par.js) e nestes torneios de escola infantil (HCP 54,
  // muitos 5-7 num par-3) dava par 4/5 — inventava um par 40 e estragava ±/Média.
  // Detecta-se por nome/formato ("P&P"/"Pitch & Putt") OU por TODOS os buracos
  // serem curtos (≤150 m = campo par-3). Nesse caso força par 3 em cada buraco.
  const ncIsPitchAndPutt = (() => {
    const txt = `${detail.meta?.name ?? ""} ${(detail.meta as { style?: string | null })?.style ?? ""} ${detail.meta?.course ?? ""}`.toLowerCase();
    if (/p\s*&\s*p\b|p\s*y\s*p\b|pitch\s*&?\s*\s*putt|pitch\s+and\s+putt/.test(txt)) return true;
    return meters18.length === holeCount && meters18.every((m) => typeof m === "number" && m > 0 && m <= 150);
  })();
  const par18 = ncIsPitchAndPutt
    ? new Array(holeCount).fill(3)
    : ((detail.coursePar && detail.coursePar.length === holeCount) ? detail.coursePar : new Array(holeCount).fill(4));
  const parTotal = par18.reduce((a, b) => a + b, 0);
  const si18 = (detail._ncCourseSi && detail._ncCourseSi.length === holeCount) ? detail._ncCourseSi : [];

  const norm = normEs;
  const lookupByName: Record<string, DobLookupEntry> = {};
  if (dobLookup) for (const e of Object.values(dobLookup)) if (e.name) lookupByName[norm(e.name)] = e;

  // Para Espanha: clube irrelevante. Mapeamos:
  //  - escalao = Sub-N derivado da idade (pill colorido global, sortable)
  //  - hcpExact = HCP número (coluna sortable)
  //  - club = clube real (ESCONDIDO via hideClub)
  const dateRef = detail.meta.dateStart || null;

  // CR/Slope por sexo derivados do hándicap de campo (coluna "HcpJuego") — a
  // NextCaddy não os publica. Alimentam a coluna SD (via computeSD).
  const ncRatings = ncDeriveRatings(players, parTotal, holeCount <= 9);

  const fpgPlayers: FPGPlayer[] = players.map((p, idx) => {
    const e = (p.licencia && dobLookup && dobLookup[p.licencia.trim()]) || lookupByName[norm(p.name || "")] || null;
    const dob = p.dob || e?.dob || null;
    const age = ageAt(dob, dateRef);
    // Termo RFEG (Alevín, Benjamín, etc.) — coerência: sempre o termo da
    // federação espanhola, nunca "Sub-N". EscPill tem mapeamento ES→Sub-N CSS,
    // logo "Alevín" recebe a mesma cor que "Sub-12". Categoria oficial da fonte
    // primeiro; fallback por cohort de ano (não idade exacta) — ver escaloEsForPlayer.
    const escLabel = escaloEsForPlayer(p.catEdad || e?.catEdad, dob, dateRef);
    const club = (p.club || e?.club || "").toString();
    const sex: "M" | "F" | null = (p.sexo === "M" ? "M" : p.sexo === "F" ? "F" : (e?.sex === "M" ? "M" : e?.sex === "F" ? "F" : null));
    const rating = sex ? ncRatings[sex] : null;   // CR/Slope do tee deste sexo (SD)
    // Metros do TEE deste jogador (rapazes jogam das amarelas, raparigas das
    // vermelhas → distâncias diferentes), vindos do cartão dele. Fallback à
    // distância do campo. O teeName mostra a distância total para diferenciar tees.
    const playerMeters: number[] = (() => {
      for (const r of (p.rounds || [])) {
        const m = (r as { meters?: number[] | null }).meters;
        if (Array.isArray(m) && m.length === holeCount) return m;
      }
      return meters18;
    })();
    const playerMetersTotal = playerMeters.reduce((a, b) => a + (b || 0), 0);
    const teeLabel = playerMetersTotal > 0 ? `${playerMetersTotal} m` : (meters18.length ? "Tour" : undefined);
    const roundScores: FPGRoundScore[] = (p.rounds || [])
      // Exigir pelo menos um buraco com golpes > 0: um inscrito que NÃO jogou (WD/
      // DNS) traz o cartão a zeros (18×0), que passava o teste de comprimento e dava
      // gross 0 → ± = 0−72 = −72 na vista de ronda. Rondas a zeros = não jogadas.
      .filter((r) => {
        const s = (r as { scores?: number[] }).scores;
        return Array.isArray(s) && s.length === holeCount && s.some((x) => x > 0);
      })
      .map((r) => {
        const rm = (r as { meters?: number[] | null }).meters;
        const mm = (Array.isArray(rm) && rm.length === holeCount) ? rm : playerMeters;
        return {
          round: r.round,
          gross: (r.gross != null) ? r.gross : ((r as any).scores.reduce((a: number, b: number) => a + b, 0) || 0),
          scores: (r as any).scores,
          pars: par18,
          si: si18,
          meters: mm,
          teeName: teeLabel,
          courseRating: rating?.cr,
          slope: rating?.slope,
        };
      });
    const incomplete = roundScores.length < nRounds;
    // Gross/toPar a partir dos CARTÕES reais (soma das rondas), NÃO de `p.total`/
    // `p.toPar`: em torneios Stableford o NextCaddy põe os PONTOS em `p.total`
    // (ex: 18 pts), que apareciam como gross e davam um ± absurdo (18−36 = −18)
    // a contradizer o scorecard. Sem cartões (só inscrito) cai no `p.total` como
    // antes. A ordem do leaderboard é por `pos` (classificação oficial), logo
    // continua correcta mesmo em Stableford (o pos não vem do gross).
    const grossSum = roundScores.reduce((s, r) => s + (r.gross || 0), 0);
    const grossTotal = grossSum > 0 ? grossSum : (typeof p.total === "number" ? p.total : null);
    const toPar = grossSum > 0 ? grossSum - parTotal * roundScores.length : (p.toPar ?? null);
    return {
      scoreId: `nc-${detail.compId}-${idx}`,
      pos: p.pos ?? idx + 1,
      name: formatPlayerName(p.name || ""),
      club: club ? displayName(club) : "—",
      fed: p.licencia || undefined,
      fedCode: p.licencia || undefined,
      grossTotal,
      toPar,
      hcpExact: p.hcp ?? undefined,
      courseRating: rating?.cr,
      slope: rating?.slope,
      escalao: escLabel,
      // Fields extra usados pelo nameDecorator (M/F badge) + filtros (sex/age)
      _sex: sex,
      _age: age,
      teeName: teeLabel,
      nholes: holeCount,
      parTotal,
      scores: roundScores[0]?.scores || [],
      par: par18,
      si: si18,
      meters: playerMeters,
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

  const norm = normEs;
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
    const subN = escaloEsForPlayer(ins?.catEdad, dobStr, dateRef);
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
    // RFEGolf publica ~65% só em PDF: temos os TOTAIS por ronda mas NÃO o cartão
    // hole-by-hole (scores/par/si/meters vazios). Marca para o IntlTournView NÃO
    // mostrar a tab "📋 Scorecards" (grelha vazia contra par-72 falso = parece partido).
    _noHbh: true,
  } as FPGTournament;
}

/* ── mitarjetaToFPGTournament ───────────────────────────────────
 * Campeonatos de España juvenis com live scoring no mitarjeta.golf (injectado
 * por scripts/scrape-mitarjeta.js). Ao contrário do RFEGolf-PDF, traz hole-by-hole
 * REAL + par/SI/metros REAIS do cartão do campo + HCP/idade (de admitidos). Modelo
 * = ncToFPGTournament. NUNCA fabrica par 4×18 — sem par, o array fica vazio (a
 * linha de PAR não aparece). */
function mitarjetaToFPGTournament(detail: RFEGDetail, dobLookup?: DobLookup): FPGTournament | null {
  const group = (detail.results || []).find((r) => r.players && r.players.length > 0);
  if (!group) return null;

  // Par/SI/metros REAIS (9 ou 18 buracos). Vazios → sem placeholder.
  const valid = (a?: number[] | null) => Array.isArray(a) && (a.length === 18 || a.length === 9);
  const par = valid(detail.coursePar) ? (detail.coursePar as number[]) : [];
  const si = valid(detail._rfegCourseSi) ? (detail._rfegCourseSi as number[]) : [];
  const meters = valid(detail._rfegCourseMeters) ? (detail._rfegCourseMeters as number[]) : [];
  const nHoles = par.length || (group.perHole ? group.perHole.length : 18);
  const parTotal = par.reduce((a, b) => a + b, 0); // 0 quando não há par

  // Rondas REALMENTE jogadas (não as declaradas): num torneio a decorrer só há
  // R1 — usar as declaradas marcaria todos como incompletos (WD) e apagaria o total.
  const nRounds = Math.max(
    ...group.players.map((p) => (p.rounds || []).filter((g) => g != null && g > 0).length),
    1,
  );
  const courseRating = group.courseRating ?? undefined;
  const slope = group.slope ?? undefined;

  const norm = normEs;
  const lookupByName: Record<string, DobLookupEntry> = {};
  if (dobLookup) for (const e of Object.values(dobLookup)) if (e.name) lookupByName[norm(e.name)] = e;

  const dateRef = detail.meta.dateStart || null;

  const players: FPGPlayer[] = group.players.map((p, idx) => {
    const e = (p.licencia && dobLookup && dobLookup[p.licencia.trim()]) || lookupByName[norm(p.name || "")] || null;
    const dob = p.dob || e?.dob || null;
    const age = ageAt(dob, dateRef);
    // Termo RFEG (Alevín/Benjamín/Infantil): categoria oficial canonizada +
    // fallback por cohort de ano (mesma função usada no resto da página).
    const escLabel = escaloEsForPlayer(p.catEdad, dob, dateRef) || ageToEscalaoEs(age);
    const startHole = p.startHole ?? undefined;
    const club = (p.club || e?.club || "").toString();
    const sex: "M" | "F" | null = (p.sexo === "M" ? "M" : p.sexo === "F" ? "F" : (e?.sex === "M" ? "M" : e?.sex === "F" ? "F" : null));

    const roundScores: FPGRoundScore[] = (p.rounds || [])
      .map((gross, i) => {
        const rn = i + 1;
        const sc = (p.holeScores && p.holeScores[String(rn)]) || [];
        return {
          round: rn,
          gross: (gross != null && gross > 0) ? gross : (sc.reduce((a, b) => a + b, 0) || 0),
          scores: sc.length === nHoles ? sc : [],
          pars: par,
          si,
          meters,
          courseRating,
          slope,
          startHole,
          teeName: meters.length ? "Camp." : undefined,
        };
      })
      .filter((r) => r.gross > 0);

    return {
      scoreId: `mitarjeta-${detail.compId}-${idx}`,
      pos: p.pos ?? idx + 1,
      name: formatPlayerName(p.name || ""),
      club: club ? displayName(club) : "—",
      fed: p.licencia || e?.licencia || undefined,
      fedCode: p.licencia || e?.licencia || undefined,
      grossTotal: p.total ?? null,
      toPar: p.toPar ?? null,
      hcpExact: p.hcp ?? undefined,
      escalao: escLabel || undefined,
      courseRating,
      slope,
      startHole,
      _sex: sex,
      _age: age,
      teeName: meters.length ? "Camp." : undefined,
      nholes: nHoles,
      parTotal: parTotal || undefined,
      scores: roundScores[0]?.scores || [],
      par,
      si,
      meters,
      roundScores,
      // Torneio AO VIVO: não marcar WD por terem jogado menos rondas que o total
      // (apagaria o total). WD real virá quando o mitarjeta o indicar.
      _wd: false,
      _roundsPlayed: roundScores.length,
    } as FPGPlayer & { _sex: "M" | "F" | null; _age: number | null };
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


/* ── NextCaddy adapter ─────────────────────────────────── */

interface NCRoundScore {
  round: number;
  scores?: number[];
  total?: number | null;
  meters?: number[] | null;   // metros do TEE deste jogador (rapazes/raparigas jogam tees distintos)
}
interface NCPlayer {
  pos?: number | null;
  name: string | null;
  licencia?: string | null;
  hcp?: number | null;
  nivel?: string | null;
  rounds?: { round: number; gross: number | null }[];
  /** Hándicap de juego (= de campo) por ronda, da coluna oculta "HcpJuego J{n}". */
  hcpJuego?: { round: number; ch: number | null }[];
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
  leaderboard: { category: number; categoryName?: string | null; players: NCPlayer[] }[];
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
    dateIso?: string | null;
    year?: number | null;
    rounds: { round: number; label: string }[];
  };
  rounds: LgsRound[];
  course?: { meters: (number | null)[]; si: (number | null)[]; par: (number | null)[]; avg?: (number | null)[]; metersTotal?: number | null; holes?: number } | null;
  horarios?: LgsHorarioRound[];
}

interface LgsHorarioRound {
  round: number;
  subid: string | null;
  groups: { teeTime: string | null; startHole: number | null; players: string[] }[];
}

function adaptLgs(lgs: LgsDetail, dobLookup?: DobLookup, hcpLookup?: HcpLookup, fedByName?: Map<string, FedByNameEntry>, golfbox?: Map<string, GolfboxEntry[]>): RFEGDetail {
  const norm = normEs;
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
    country: string | null; region: string | null;
  }> = {};
  // Só rondas com SCORES reais (a R3 de um evento em curso pode trazer jogadores
  // placeholder do draw com total=null → não é uma ronda jogada). Sem isto, o
  // leaderboard agregado zerava pos/toPar/total (→ "--") e somava um 0 fantasma.
  const lgsRoundIsPlayed = (r: { players: Array<{ total: number | null }> }) =>
    (r.players ?? []).some((p) => p.total != null && p.total > 0 && p.total < 999);
  const lgsPlayedRounds = lgs.rounds.filter(lgsRoundIsPlayed);
  const lastR = lgsPlayedRounds[lgsPlayedRounds.length - 1];
  for (const r of lgsPlayedRounds) {
    for (const p of r.players) {
      const key = p.memberId || p.name;
      if (!playerAgg[key]) {
        playerAgg[key] = { name: p.name, pos: null, rounds: [], toPar: 0, hoy: 0, total: 0, country: null, region: null };
      }
      playerAgg[key].rounds.push(p.total ?? 0);
      const pc = (p as { country?: string | null; region?: string | null });
      if (pc.country && !playerAgg[key].country) playerAgg[key].country = pc.country;
      if (pc.region && !playerAgg[key].region) playerAgg[key].region = pc.region;
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
    nRounds,
    courseRating: ((lgs.course as { courseRating?: number | null } | null)?.courseRating ?? null) as number | null,
    slope: ((lgs.course as { slope?: number | null } | null)?.slope ?? null) as number | null,
    players: aggregated.map(a => {
      // Cruzar nome → licencia/dob/club/hcp (dob+hcp lookups) para o Draw partilhado
      // mostrar ESC/Nasc./FED/Clube/HCP como na FPG (o draw LGS só traz nomes).
      const e = lookupByName[norm(a.name)];
      const lic = (e?.licencia || "").toUpperCase();
      const hcpEs = lic && hcpLookup ? (hcpLookup[lic]?.hcp ?? null) : null;
      // Português: a ficha vem da FPG (ver o gémeo em lgsToFPGTournament). É o
      // que dá ESC/Nasc./FED/Clube/HCP aos nossos nas tabs de Draw e Inscrições.
      const ptFed = a.country === "PT" && fedByName
        ? fedByNameKeys(a.name).map((k) => fedByName.get(k)).find(Boolean)
        : undefined;
      const gb = !e && !ptFed ? golfboxLookup(golfbox, a.name, a.country) : undefined;
      const hcp = typeof hcpEs === "number" ? hcpEs : (ptFed?.hcp ?? null);
      return {
        pos: a.pos,
        name: a.name,
        toPar: a.toPar,
        hoy: a.hoy,
        rounds: a.rounds,
        total: a.total,
        licencia: e?.licencia ?? ptFed?.fed ?? gb?.memberId ?? null,
        dob: e?.dob ?? ptFed?.dob ?? gb?.dob ?? null,
        club: e?.club ?? ptFed?.club ?? gb?.club ?? a.region ?? null,
        hcp,
        country: a.country,
      };
    }),
  };

  return {
    compId: lgs.id,
    ok: true,
    scrapedAt: lgs.scrapedAt,
    meta: {
      name: lgs.meta.name,
      // Usar a data ISO real (com ano) para o cálculo de idade ser à DATA DO
      // TORNEIO (histórica). O dateRange ("25 junio - 27 junio") não tem ano e
      // é impossível de parsear → caía na data de hoje. Ver bug idade ES.
      dateStart: lgs.meta.dateIso || lgs.meta.dateRange,
      dateEnd: lgs.meta.dateIso || lgs.meta.dateRange,
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
        // Mesmo enriquecimento do leaderboard: sem ele os nossos apareciam na
        // lista de inscritos sem federado, clube, HCP nem data de nascimento.
        const ptFed = a.country === "PT" && fedByName
          ? fedByNameKeys(a.name).map((k) => fedByName.get(k)).find(Boolean)
          : undefined;
        const gb = !e && !ptFed ? golfboxLookup(golfbox, a.name, a.country) : undefined;
        return {
          pos: a.pos, name: a.name,
          licencia: e?.licencia || ptFed?.fed || gb?.memberId || null,
          // País real da bandeira do leaderboard (o default "ESPAÑA" fazia da
          // lista inteira espanhóis, num torneio com 19 nacionalidades).
          pais: a.country || "ESPAÑA",
          hcp: ptFed?.hcp ?? null,
          catEdad: e?.catEdad || null,
          sexo: e?.sex || ptFed?.sex || null,
          club: e?.club || ptFed?.club || gb?.club || a.region || null,
          dob: e?.dob || ptFed?.dob || gb?.dob || null,
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
    _lgsHorarios: lgs.horarios || null,
  } as RFEGDetail & { _lgsRounds: LgsRound[]; _lgsCourse: LgsDetail["course"]; _lgsHorarios: LgsHorarioRound[] | null };
}
type DobLookup = Record<string, DobLookupEntry>;

/** Sexo a partir do nome da categoria NextCaddy ("Alevín Masculino Scratch",
 *  "Scratch Señoras", "Caballeros"…). Devolve null quando não é identificável. */
function ncCatSex(name?: string | null): "M" | "F" | null {
  const s = (name || "").toLowerCase();
  if (/femenin|femenal|se[ñn]oras?|damas|girls|chicas|femenina/.test(s)) return "F";
  if (/masculin|masculina|caballeros?|varonil|boys|chicos/.test(s)) return "M";
  return null;
}

function adaptNextCaddy(nc: NCDetail, dobLookup?: DobLookup, hcpLookup?: HcpLookup): RFEGDetail {
  // Data: o NextCaddy não a expõe nos endpoints, mas muitos nomes trazem-na no fim
  // (ex.: "...9P3 HOYOS 13-06-26"). Extrai DD-MM-YY[YY] / DD/MM/YYYY do nome.
  const ncDate: string | null = (() => {
    const m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?!\d)/.exec(nc.meta?.name || "");
    if (!m) return null;
    const day = parseInt(m[1], 10), month = parseInt(m[2], 10);
    let y = m[3]; if (y.length === 2) y = (parseInt(y, 10) >= 70 ? "19" : "20") + y;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  })();
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

  // Distância do tee de cada jogador (do cartão dele). Mapas p/ cruzar com
  // inscritos (por licencia) e draw (por inscribedId), já que esses não trazem cartão.
  const teeMetersByLic: Record<string, number> = {};
  const teeMetersByIns: Record<string, number> = {};
  // Info por inscribedId para enriquecer o Draw como na FPG (escalão + ±/Tot por ronda).
  const drawInfoByIns: Record<string, { dob: string | null; name: string | null; rounds: { round: number; gross: number | null; toPar: number | null }[] }> = {};
  const ncParTotal = Array.isArray(nc.course?.par) ? nc.course!.par!.reduce((a, b) => a + (b || 0), 0) : 0;
  const lbPlayers: RFEGPlayer[] = [];
  // O NextCaddy publica o MESMO torneio em classificações Scratch E Handicap
  // (ex: "Alevín Masculino Scratch" + "Alevín Masculino Handicap"). Nas Handicap,
  // pos/total/toPar são LÍQUIDOS (gross − hcp de jogo). O dedup abaixo mantém a
  // primeira ocorrência por licença — ordenar as Scratch primeiro garante que a
  // linha que sobrevive traz as pancadas reais, nunca o resultado líquido.
  const ncCatClass = (name?: string | null): number => {
    const s = (name || "").toLowerCase();
    if (/scratch/.test(s)) return 0;
    if (/h[aá]ndicap|\bhcp\b|\bneto\b/.test(s)) return 2;
    return 1;
  };
  const ncCats = [...(nc.leaderboard || [])].sort(
    (a, b) => ncCatClass(a.categoryName) - ncCatClass(b.categoryName),
  );
  for (const cat of ncCats) {
    // Sexo derivado do NOME da categoria scrapada ("Alevín Masculino", "Scratch
    // Señoras", "Caballeros"…). É a fonte fiável — o lookup por licença (e.sex) só
    // resolve os jogadores no roster e deixava a maioria com sexo null, impedindo
    // a separação M/F. A categoria manda; o lookup é fallback.
    const catSex = ncCatSex(cat.categoryName);
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
            meters: Array.isArray(r.meters) ? r.meters : null,   // metros do tee deste jogador
          }))
        : (p.rounds || []);
      const teeM = rs.find((r) => Array.isArray(r.meters) && r.meters.length)?.meters || null;
      const teeMetersTotal = teeM ? teeM.reduce((a, b) => a + (b || 0), 0) : null;
      if (teeMetersTotal) {
        if (p.licencia) teeMetersByLic[p.licencia.trim().toUpperCase()] = teeMetersTotal;
        if (p.inscribedId) teeMetersByIns[String(p.inscribedId)] = teeMetersTotal;
      }
      if (p.inscribedId) {
        drawInfoByIns[String(p.inscribedId)] = {
          dob: e ? e.dob : null,
          name: p.name ?? null,
          rounds: rs.map((r) => {
            const g = typeof r.total === "number" ? r.total
              : (Array.isArray(r.scores) ? (r.scores.filter((x) => x > 0).reduce((a, b) => a + b, 0) || null) : null);
            return { round: r.round, gross: g, toPar: (g != null && ncParTotal) ? g - ncParTotal : null };
          }),
        };
      }
      // Hándicap de campo (do "HcpJuego"): 1º valor não-nulo (é constante entre
      // rondas). Serve para derivar CR/Slope por regressão contra o HI.
      const courseHcp = (p.hcpJuego || []).map((h) => h.ch).find((c) => c != null) ?? null;
      lbPlayers.push({
        pos: p.pos ?? null,
        name: p.name,
        licencia: p.licencia ?? null,
        pais: "ESPAÑA",
        // Fallback ao lookup global se o player não tem HCP no torneio
        hcp: p.hcp ?? hcpFromLookup(p.licencia ?? null),
        catEdad: p.nivel ?? (e ? e.catEdad : null),
        sexo: catSex ?? (e ? e.sex : null),
        courseHcp,
        club: e ? e.club : null,
        dob: e ? e.dob : null,
        estado: null,
        rounds,
        total: p.total ?? null,
        toPar: p.toPar ?? null,
        teeMeters: teeMetersTotal,
      });
    }
  }
  // Limpeza dos inscritos NextCaddy: o getListadoInscritos devolve a lista 2× e a
  // 2ª cópia tem colunas diferentes ("Fecha Inscripción") → a `licencia` vem a ser o
  // timestamp e a licencia real cai no `nivel`. Sem isto, cada jogador aparecia 2×
  // (um com timestamp) e o cabeçalho "Jugador" entrava como jogador. Corrigido no
  // scraper, mas aplicamos aqui também para os dados JÁ scrapados (sem re-scrape).
  const _isTs = (v?: string | null) => /^\d{2}-\d{2}-\d{2}\b/.test(String(v || "").trim());
  const _looksLic = (v?: string | null) => /^[A-Za-z]{1,4}\d{3,}/.test(String(v || "").trim());
  const _ncSeen = new Map<string, number>();
  const cleanedInscritos: NonNullable<typeof nc.inscritos> = [];
  for (const p of (nc.inscritos || [])) {
    if (!p.name || /^(jugador|licencia|nivel|fecha)/i.test(String(p.name).trim())) continue;
    let licencia = p.licencia ?? null;
    let nivel = p.nivel ?? null;
    if (_isTs(licencia)) { if (_looksLic(nivel)) { licencia = nivel; nivel = null; } else licencia = null; }
    if (_isTs(nivel)) nivel = null;
    const cp = { ...p, licencia, nivel };
    const key = p.name.trim().toLowerCase().replace(/\s+/g, " ");
    const idx = _ncSeen.get(key);
    if (idx == null) { _ncSeen.set(key, cleanedInscritos.length); cleanedInscritos.push(cp); }
    else if (!_looksLic(cleanedInscritos[idx].licencia) && _looksLic(licencia)) cleanedInscritos[idx] = cp;
  }
  const inscPlayers: RFEGPlayer[] = cleanedInscritos.map((p) => {
    const e = enrich(p.licencia ?? null);
    const lic = (p.licencia || "").trim().toUpperCase();
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
      teeMeters: (lic && teeMetersByLic[lic]) || null,   // cruzado com o cartão (torneios já jogados)
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
      dateStart: ncDate,
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
    // Distância do tee por jogador (cruzada por inscribedId) para a tab Draw
    _teeMetersByIns: teeMetersByIns,
    // Info (dob/escalão + resultado por ronda) por inscribedId para enriquecer o Draw
    _drawInfoByIns: drawInfoByIns,
    // Guardar SI e metros do NextCaddy para o adapter ncToFPGTournament passar
    // adiante. Aceitar 9 OU 18 buracos (pitch&putt/alevíns são de 9) — exigir 18
    // descartava o SI/metros dos torneios de 9.
    _ncCourseSi: (nc.course?.si && Array.isArray(nc.course.si) && (nc.course.si.length === 9 || nc.course.si.length === 18)) ? nc.course.si : null,
    _ncCourseMeters: (nc.course?.meters && Array.isArray(nc.course.meters) && (nc.course.meters.length === 9 || nc.course.meters.length === 18)) ? nc.course.meters : null,
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
  const norm = normEs;
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

/** Converte o draw do mitarjeta (`detail.teeTimes`: Tee/Hora/Jogadores da R1) para
 *  o MESMO shape `NCHorario[]` que o DrawSaidaView já consome → DrawTab partilhado.
 *  (O mitarjeta só publica o sorteio da R1; os draws de J2/J3 saem em PDF depois.) */
function teeTimesToHorarios(tt?: RFEGDetail["teeTimes"]): NCHorario[] | null {
  if (!tt || !tt.groups || !tt.groups.length) return null;
  const players: NCHorario["players"] = [];
  for (const g of tt.groups) {
    const tee = typeof g.tee === "number" ? g.tee : (parseInt(String(g.tee), 10) || null);
    for (const name of g.players) {
      players.push({ time: g.time || null, tee, name, hcp: null });
    }
  }
  return players.length ? [{ round: tt.round || 1, players }] : null;
}

/** Versão multi-ronda: converte `teeTimesAll` (todas as rondas) em NCHorario[],
 *  uma entrada por ronda — alimenta o MESMO DrawTab com tabs R1/R2/R3. */
function teeTimesAllToHorarios(all?: RFEGDetail["teeTimesAll"]): NCHorario[] | null {
  if (!Array.isArray(all) || !all.length) return null;
  const out: NCHorario[] = [];
  for (const tt of all) {
    const one = teeTimesToHorarios(tt);
    if (one && one[0] && one[0].players.length) out.push(one[0]);
  }
  return out.length ? out : null;
}

/** Converte os horarios do livegolfscoring (`_lgsHorarios`: grupos de saída por
 *  ronda — hora · buraco · jogadores) para o MESMO shape `NCHorario[]` que o
 *  DrawSaidaView → DrawTab partilhado consome. Antes o LGS usava um DrawView
 *  genérico (texto "hora · buraco · nomes"); agora usa a tabela rica da FPG. */
function lgsHorariosToHorarios(hor?: LgsHorarioRound[] | null): NCHorario[] | null {
  if (!Array.isArray(hor) || !hor.length) return null;
  const out: NCHorario[] = [];
  for (const rd of hor) {
    const players: NCHorario["players"] = [];
    for (const g of (rd.groups || [])) {
      for (const name of (g.players || [])) {
        players.push({ time: g.teeTime || null, tee: g.startHole ?? null, name, hcp: null });
      }
    }
    if (players.length) out.push({ round: rd.round || (out.length + 1), players });
  }
  return out.length ? out : null;
}

/* ── DrawSaidaView ──────────────────────────────────────────
 * Tab "Draw saída" do RFEGPage — reusa o componente DrawTab partilhado para
 * coerência visual com FPG. NextCaddy → `_ncHorarios`; mitarjeta → `teeTimes`.
 * Ambos convertidos para NCHorario[] → FpgDraw shape. */
function DrawSaidaView({ detail, entry, onlyRound }: {
  detail: RFEGDetail & {
    _ncHorarios?: NCHorario[] | null;
    _lgsHorarios?: LgsHorarioRound[] | null;
    _teeMetersByIns?: Record<string, number>;
    _drawInfoByIns?: Record<string, { dob: string | null; name: string | null; rounds: { round: number; gross: number | null; toPar: number | null }[] }>;
  };
  entry: RFEGIndexEntry;
  /** Se definido, renderiza SÓ esta ronda (sem os chips R1/R2/R3) — usado quando o
   *  draw de cada ronda é uma aba própria intercalada na barra principal. */
  onlyRound?: number;
}) {
  const teeByIns = detail._teeMetersByIns || {};
  const drawInfo = detail._drawInfoByIns || {};
  // NextCaddy traz `_ncHorarios`; livegolfscoring traz `_lgsHorarios`; mitarjeta
  // (CEE) traz `teeTimes` — todos convertidos ao mesmo shape para alimentar o
  // MESMO DrawTab partilhado (= FPG), em vez de tabelas próprias / texto simples.
  const horarios = useMemo(
    () => detail._ncHorarios ?? lgsHorariosToHorarios(detail._lgsHorarios)
      ?? teeTimesAllToHorarios(detail.teeTimesAll) ?? teeTimesToHorarios(detail.teeTimes),
    [detail._ncHorarios, detail._lgsHorarios, detail.teeTimesAll, detail.teeTimes],
  );
  const [activeRoundState, setActiveRound] = useState<number>(1);
  // Em modo `onlyRound` (aba por ronda na barra principal), a ronda é fixa.
  const activeRound = onlyRound ?? activeRoundState;
  const isNc = !!detail._ncHorarios;

  // mitarjeta (CEE) e livegolfscoring: o draw dos tee times só traz NOMES.
  // Enriquecemos por nome a partir do leaderboard (detail.results) — fed / dob /
  // clube / HCP / país — para preencher as MESMAS colunas que o DrawTab mostra
  // na FPG.
  //
  // ⚠ A chave tem de existir nas DUAS ordens do nome. A fonte escreve
  // "MORTON, Frankie" e o DrawTab pesquisa com `norm(p.nome)`, onde `p.nome` já
  // passou por `formatPlayerName` → "Frankie Morton". Só com a primeira chave o
  // cruzamento falhava em TODA a gente e as colunas ±/Tot ficavam a "–".
  const mitaByName = useMemo(() => {
    type Info = { name: string; fed: string | null; dobIso: string | null; club: string | null; hcp: number | null; gross: number; toPar: number | null; country: string | null };
    const m = new Map<string, Info>();
    if (isNc) return m;
    const grp = (detail.results || []).find((r) => r.players && r.players.length > 0);
    for (const p of (grp?.players || [])) {
      const r1 = Array.isArray(p.rounds) ? (p.rounds.find((g) => g != null && g > 0) ?? 0) : 0;
      const info: Info = {
        name: formatPlayerName(p.name),
        fed: p.licencia || null,
        dobIso: esDateToIso(p.dob),
        club: p.club || null,
        hcp: typeof p.hcp === "number" ? p.hcp : null,
        gross: r1,
        toPar: typeof p.toPar === "number" ? p.toPar : null,
        country: ((p as { country?: string | null }).country) || null,
      };
      for (const k of [norm(p.name), norm(formatPlayerName(p.name))]) {
        if (k && !m.has(k)) m.set(k, info);
      }
    }
    return m;
  }, [isNc, detail.results]);

  // Gross de CADA ronda por jogador (livegolfscoring). O `mitaByName` só guarda
  // "a primeira ronda com valor", o que servia o mitarjeta (1 ronda) mas fazia o
  // draw da R2 mostrar os resultados da R1 — e a R1 ficar sem nenhum quando o
  // cruzamento por nome falhava. Aqui a ronda é explícita (`r.round`).
  const lgsGrossByRound = useMemo(() => {
    const byRound = new Map<number, Map<string, { gross: number; toPar: number | null }>>();
    const rounds = (detail as { _lgsRounds?: LgsRound[] })._lgsRounds;
    if (!Array.isArray(rounds)) return byRound;
    const parTotal = Array.isArray(detail.coursePar) && detail.coursePar.length
      ? detail.coursePar.reduce((a: number, b) => a + (b || 0), 0)
      : null;
    for (const r of rounds) {
      const m = new Map<string, { gross: number; toPar: number | null }>();
      for (const p of (r.players || [])) {
        if (p.total == null || p.total <= 0 || p.total >= 999) continue;
        // ±par DESTA ronda (gross − par do campo). O `toPar` do leaderboard é o
        // acumulado do torneio e no draw de uma ronda seria enganador.
        const rec = { gross: p.total, toPar: parTotal != null ? p.total - parTotal : null };
        for (const k of [norm(p.name), norm(formatPlayerName(p.name))]) if (k && !m.has(k)) m.set(k, rec);
      }
      if (m.size) byRound.set(r.round, m);
    }
    return byRound;
  }, [detail]);

  // Enriquecer como a FPG: playersDB (escalão via dob) + resultados ±/Tot da ronda.
  // NextCaddy cruza o jogador do draw (jid) com o leaderboard via inscribedId (ins);
  // mitarjeta cruza por nome (mitaByName).
  const drawPlayersDB = useMemo<PlayersDB>(() => {
    const db: PlayersDB = {};
    if (isNc) {
      for (const rd of (horarios || [])) {
        for (const p of rd.players) {
          if (!p.jid || !p.ins) continue;
          const info = drawInfo[String(p.ins)];
          if (!info) continue;
          const esc = escaloEsForPlayer(null, info.dob, detail.meta.dateStart) || undefined;
          db[p.jid] = { dob: info.dob || undefined, escalao: esc, name: info.name || undefined, country: "ES" };
        }
      }
    } else {
      // mitarjeta/LGS: dob (ISO) por fed → o DrawTab calcula ESC + Nasc.
      // ⚠ Só entram jogadores COM licença: as chaves do playersDB são lidas
      // como federados (o DrawTab resolve o fed por nome a partir daqui), por
      // isso uma chave sintética para os estrangeiros aparecia como número de
      // federado na coluna FED. O país deles vai na própria linha do draw.
      for (const info of mitaByName.values()) {
        if (info.fed) db[info.fed] = { dob: info.dobIso || undefined, country: info.country || "ES" };
      }
    }
    return db;
  }, [isNc, horarios, drawInfo, detail.meta.dateStart, mitaByName]);

  const drawResults = useMemo<Map<string, { gross: number; toPar: number | null }>>(() => {
    const m = new Map<string, { gross: number; toPar: number | null }>();
    if (isNc) {
      const rd = (horarios || []).find((x) => x.round === activeRound) || (horarios || [])[0];
      for (const p of (rd?.players || [])) {
        if (!p.jid || !p.ins) continue;
        const rr = drawInfo[String(p.ins)]?.rounds.find((x) => x.round === activeRound);
        if (rr && rr.gross != null) m.set(p.jid, { gross: rr.gross, toPar: rr.toPar });
      }
    } else if (lgsGrossByRound.size) {
      // livegolfscoring: o gross é o DA RONDA que este draw mostra. Uma ronda
      // ainda por jogar não tem entrada → colunas ±/Tot a "–", como deve ser.
      const byName = lgsGrossByRound.get(activeRound);
      if (byName) {
        for (const [key, rec] of byName) m.set(key, rec);
        for (const [key, info] of mitaByName) {
          const rec = byName.get(key);
          if (rec && info.fed) m.set(info.fed, rec);
        }
      }
    } else {
      // mitarjeta só tem R1 — indexar por fed (autoritativo) E por nome normalizado.
      for (const [key, info] of mitaByName) {
        if (info.gross > 0) {
          const rec = { gross: info.gross, toPar: info.toPar };
          if (info.fed) m.set(info.fed, rec);
          m.set(key, rec);
        }
      }
    }
    return m;
  }, [isNc, horarios, drawInfo, activeRound, mitaByName, lgsGrossByRound]);

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
      const dist = p.ins ? teeByIns[String(p.ins)] : undefined;   // distância do tee (cruzada do cartão)
      const info = isNc ? undefined : mitaByName.get(norm(p.name)); // mitarjeta: cruzar por nome
      flights[flights.length - 1].players.push({
        nome: formatPlayerName(p.name),
        clube: info?.club ? displayName(info.club) : null,   // NC não expõe clube; mitarjeta sim
        fed: isNc ? (p.jid || null) : (info?.fed || null),   // jid NC / licencia mitarjeta
        hcp: isNc ? p.hcp : (info?.hcp ?? null),
        tee: dist ? `${dist} m` : null, // DrawTab mostra p.tee — aqui a distância do jogador (NC)
        // Conterrâneos destacados como nos draws internacionais do MAJOR
        // (`.row-portuguese`) — num campo de 120 é o que os torna visíveis.
        isPortuguese: info?.country === "PT",
        country: info?.country || null,
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
      entry.source === "nextcaddy" || entry.source === "livegolfscoring"
        ? "Sem tee times publicados para este torneio."
        : "Tee times ainda não disponíveis. Consulta o Microsite oficial."
    } />;
  }
  if (!drawForRound) return <EmptyState message="Sem dados de draw para esta ronda." />;

  return (
    <div>
      {onlyRound == null && horarios.length > 1 && (
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
        tournamentDate={esDateToIso(detail.meta.dateStart) ?? detail.meta.dateStart}
        playersDB={drawPlayersDB}
        results={drawResults}
      />
    </div>
  );
}

function TournamentDetail({ entry, dobLookup, hcpLookup }: { entry: RFEGIndexEntry; dobLookup?: DobLookup; hcpLookup?: HcpLookup }) {
  // Fichas FPG por nome — preenchem os PORTUGUESES, que a fonte espanhola não conhece.
  const fedByName = useFedByName();
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
          setData(adaptLgs(d as LgsDetail, dobLookup, hcpLookup, fedByName));
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
      } as any, dobLookup, fedByName);
    }
    if (entry.source === "nextcaddy") return ncToFPGTournament(data, dobLookup);
    if (entry.source === "rfegolf") return data.mitarjetaTorneo
      ? mitarjetaToFPGTournament(data, dobLookup)
      : rfegolfToFPGTournament(data, dobLookup);
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
              // mitarjeta traz CR+Slope → mostrar a coluna SD (WHS) no scorecard
              scOptions={{ ...lgsScorecardOptions(), hideSD: !data.mitarjetaTorneo }}
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
              <AdmissionsTab
                admissions={{
                  totalInscritos: currentList.length,
                  players: currentList.map((p, i) => {
                    return {
                      pos: p.pos ?? i + 1,
                      fed: p.licencia,
                      nome: p.name || "",
                      clube: p.club,
                      hcp: p.hcp,
                      vac: null,
                      dataInscricao: null,
                      status: "confirmed" as const,
                      dob: esDateToIso(p.dob),
                      country: rfegPlayerFlag(p.name, p.pais),
                      escalao: escaloEsForPlayer(p.catEdad, p.dob, m.dateStart),
                      teeName: p.teeMeters ? `${p.teeMeters} m` : null,
                    };
                  }),
                } as FpgAdmissions}
                date={esDateToIso(m.dateStart) ?? m.dateStart}
                hidePostCols
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

/* ⚠ Os lookups TÊM de ser esperados, não lidos do estado do React.
 *
 * O `rfegLoadDivisions` recebia-os por parâmetro, portanto ficava com o valor
 * que existisse no instante em que o CircuitShell o chama — e o shell CACHEIA o
 * que ele devolve. Numa ligação em que os JSON chegam depois desse instante, o
 * torneio ficava permanentemente sem licenças, clubes, HCP nem datas de
 * nascimento (Inscrições e Draw completamente a "–"), enquanto noutra máquina,
 * com os ficheiros já em cache, aparecia tudo. Estas funções devolvem a MESMA
 * promessa partilhada do `cachedFetchJson`, por isso não há download a mais. */
function loadDobLookup(): Promise<DobLookup | undefined> {
  return cachedFetchJson<DobLookupFile>("/data/licencia-dob-lookup.json")
    .then((d) => d?.lookup).catch(() => undefined);
}
function loadHcpLookup(): Promise<HcpLookup | undefined> {
  return cachedFetchJson<HcpLookupFile>("/data/licencia-hcp-lookup.json")
    .then((d) => d?.lookup).catch(() => undefined);
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
 * Categorías/Federaciones vivem como specialItems (menu INFO do shell) e o
 * Draw NC/LGS entra como abas "Draw R{n}" via roundDraws — paridade completa
 * com a legacy.
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
  // América Latina (frequentes na RFEG)
  "PARAGUAY": "PY", "URUGUAY": "UY", "CHILE": "CL", "COLOMBIA": "CO", "PERU": "PE",
  "PERÚ": "PE", "VENEZUELA": "VE", "ECUADOR": "EC", "BOLIVIA": "BO", "CUBA": "CU",
  "COSTA RICA": "CR", "GUATEMALA": "GT", "PANAMA": "PA", "PANAMÁ": "PA",
  "REPUBLICA DOMINICANA": "DO", "REPÚBLICA DOMINICANA": "DO", "HONDURAS": "HN",
  "EL SALVADOR": "SV", "NICARAGUA": "NI",
};

/** País a mostrar como BANDEIRA na página de Espanha — só ESTRANGEIROS com país
 *  CONHECIDO. Estamos no circuito espanhol: os espanhóis são o default e NÃO levam
 *  bandeira; destaca-se apenas quem NÃO é espanhol (o inverso do habitual).
 *  ⚠ Só emite bandeira para nomes de país RECONHECIDOS em ES_COUNTRY_CODE. "EXTRANJERO"
 *  (estrangeiro sem país concreto) e valores não mapeados → SEM bandeira: a fonte RFEG
 *  marca "EXTRANJERO" mesmo a espanhóis de federações regionais (ex.: Xan Iribarne,
 *  Federación Vasca) — uma 🏳️ genérica seria enganadora. Estrangeiros genuínos cuja
 *  fonte não dá o país são marcados via RFEG_NAT_OVERRIDE (por nome). */
function rfegForeignFlag(pais: string | null | undefined): string | undefined {
  if (!pais) return undefined;
  const raw = pais.trim().toUpperCase();
  // O LGS já nos dá o país em ISO-2 (ou "GB-ENG"), vindo da bandeira que a
  // própria fonte marca na linha; o microsite RFEG dá o nome por extenso em
  // espanhol. Aceitar os dois — só com a tabela de nomes, um "PT" não resolvia
  // e a lista de inscritos ficava sem bandeira nenhuma.
  if (/^[A-Z]{2}(-[A-Z]{3})?$/.test(raw)) return raw === "ES" ? undefined : raw;
  const code = ES_COUNTRY_CODE[raw];
  if (!code || code === "ES") return undefined;
  return code;
}

/** Nacionalidades CURADAS — a fonte RFEG é pouco fiável para estrangeiros: marca-os
 *  ora como "EXTRANJERO" (sem país), ora até como "ESPAÑA" (porque jogam com licença
 *  espanhola). Estes overrides, por nome normalizado (ver rfegNatNorm), têm prioridade
 *  sobre `pais`. Estender conforme se confirmem casos. */
const RFEG_NAT_OVERRIDE: Record<string, string> = {
  // Irmãos russos: o RFEG marca-os EXTRANJERO/ESPAÑA (no Campeonato Nacional,
  // "EXTRANJERO" impede a atribuição do título) — mas são russos.
  "dmitrii elchaninov": "RU",
  "elchaninov nikita": "RU",
};
/** Normaliza um nome para chave de override: minúsculas, sem acentos, vírgula→espaço,
 *  e tokens ORDENADOS — assim casa independentemente da ordem ("ELCHANINOV , DMITRII"
 *  e "Dmitrii Elchaninov" dão a mesma chave). O primeiro nome mantém os irmãos
 *  distintos (Dmitrii ≠ Nikita). */
function rfegNatNorm(name: string | null | undefined): string {
  return (name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/,/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
}
/** Bandeira a mostrar para um jogador na página de Espanha: override curado de
 *  nacionalidade primeiro, senão a regra geral (só estrangeiros levam bandeira). */
function rfegPlayerFlag(name: string | null | undefined, pais: string | null | undefined): string | undefined {
  const ov = RFEG_NAT_OVERRIDE[rfegNatNorm(name)];
  if (ov) return ov;
  return rfegForeignFlag(pais);
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
    country: rfegPlayerFlag(p.name, p.pais),
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

function NCHighlights({ rows, hasPdf }: { rows: NCHighlightRow[]; hasPdf?: boolean }) {
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
        {hasPdf
          ? "⚠ Resultados finais só publicados em PDF (ver link no cabeçalho). Destaques de live-scoring registados durante o jogo:"
          : "⚠ Sem leaderboard publicado na plataforma — apenas destaques de live-scoring registados durante o jogo:"}
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
  t: RFEGIndexEntry, dobLookup?: DobLookup, hcpLookup?: HcpLookup, fedByName?: Map<string, FedByNameEntry>,
): Promise<CircuitDivision[]> {
  const raw = await cachedFetchJson<RFEGDetail | NCDetail | LgsDetail>(`/data/${t.filePath}`);
  if (!raw) return [];
  // ⚠ ESPERAR pelas fichas FPG em vez de usar o que o estado do React já tiver:
  // o federados.json tem 18 MB e chega sempre depois desta função, cujo
  // resultado o CircuitShell CACHEIA — os portugueses ficavam para sempre sem
  // federado, clube nem HCP. A promessa é partilhada (mesma cache dos outros
  // hooks de federados), por isso não é um download a mais.
  const [fbn, dob, hcp, gbx] = await Promise.all([
    fedByName && fedByName.size ? Promise.resolve(fedByName) : loadFedByName().catch(() => undefined),
    dobLookup && Object.keys(dobLookup).length ? Promise.resolve(dobLookup) : loadDobLookup(),
    hcpLookup && Object.keys(hcpLookup).length ? Promise.resolve(hcpLookup) : loadHcpLookup(),
    loadGolfboxPlayers().catch(() => undefined),
  ]);

  let data: RFEGDetail;
  if (t.source === "nextcaddy") data = adaptNextCaddy(raw as NCDetail, dob, hcp);
  else if (t.source === "livegolfscoring") data = adaptLgs(raw as LgsDetail, dob, hcp, fbn, gbx);
  else if (t.source === "golfdirecto") data = adaptFcg(raw as unknown as FCGDetail, dob, hcp) as unknown as RFEGDetail;
  else { const d = raw as RFEGDetail; data = { ...d, coursePar: d.coursePar ?? null }; }

  let results: FPGTournament | null = null;
  if (t.source === "livegolfscoring" && (data as unknown as { _lgsRounds?: unknown[] })._lgsRounds?.length) {
    results = lgsToFPGTournament({
      id: data.compId,
      meta: { name: data.meta.name, course: data.meta.course, dateRange: data.meta.dateStart, dateIso: data.meta.dateStart },
      rounds: (data as unknown as { _lgsRounds: unknown[] })._lgsRounds,
      course: (data as unknown as { _lgsCourse?: unknown })._lgsCourse,
      _hcpLookup: hcp,
    } as any, dob, fbn, gbx); // eslint-disable-line @typescript-eslint/no-explicit-any
  } else if (t.source === "nextcaddy") results = ncToFPGTournament(data, dob);
  else if (t.source === "rfegolf") results = data.mitarjetaTorneo
    ? mitarjetaToFPGTournament(data, dob)
    : rfegolfToFPGTournament(data, dob);
  else if (t.source === "golfdirecto") results = fcgToFPGTournament(data as unknown as MinimalRFEGShape, dob) as unknown as FPGTournament | null;

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
        // mitarjeta.golf é live scoring (não um PDF) → label/ícone de clasificación.
        const isMita = g.source === "mitarjeta.golf";
        links.push(isMita
          ? { label: g.label ? `Clasificación · ${g.label}` : "Clasificación", url: g.pdfUrl, icon: "🔗", title: "Resultados ao vivo (mitarjeta.golf)" }
          : { label: g.label ? `PDF · ${g.label}` : "Resultados PDF", url: g.pdfUrl, icon: "📄", title: "Resultados oficiais em PDF" });
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
      const ncPdfs = (raw as unknown as { pdfs?: unknown[] }).pdfs;
      if (hl.length) customResults = <NCHighlights rows={hl} hasPdf={Array.isArray(ncPdfs) && ncPdfs.length > 0} />;
    }
  }

  // Unificação com a FPGPage: TODAS as fontes España renderizam os inscritos e o
  // draw pelos MESMOS componentes partilhados (AdmissionsTab / DrawTab via
  // DrawSaidaView), via os hooks renderInscritos/renderDrawSection do CircuitShell
  // (mesmo padrão que a DrivePage usa). hidePostCols esconde VAC/Registo/Status
  // (que o NextCaddy/España não têm). Cada jogador traz dob/escalão/país/tee como
  // overrides; o tee mostra a distância do cartão (rapazes/raparigas jogam tees ≠).
  const buildAdmissions = (): FpgAdmissions => {
    // ⚠ As listas RFEG sobrepõem-se: `provisional` é o SUPERCONJUNTO (admitidos ∪
    // reservas ∪ bajas ∪ noAdmitidos) com `estado` por jogador. Iterar TODAS as
    // listas duplicava cada jogador (um admitido aparecia em `admitidos` E em
    // `provisional`). Mostramos só o campo real: admitidos+invitados (confirmados)
    // + reservas (pendentes), e desduplicamos por licença (fallback nome). Fallback
    // à `provisional` quando ainda não houve corte de admissão (torneio futuro só
    // com lista provisional).
    const ins = data.inscritos;
    const confirmedSrc = (ins.admitidos.length || ins.invitados.length)
      ? [...ins.admitidos, ...ins.invitados]
      : ins.provisional;
    const groups: Array<{ list: RFEGPlayer[]; status: "confirmed" | "reserva" }> = [
      { list: confirmedSrc, status: "confirmed" },
      { list: ins.reservas, status: "reserva" },
    ];
    const players: FpgAdmissionPlayer[] = [];
    const seen = new Set<string>();
    for (const { list, status } of groups) {
      for (const p of (list || [])) {
        const key = (p.licencia || p.name || "").trim().toLowerCase();
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        players.push({
          pos: p.pos ?? null,
          fed: p.licencia,
          nome: p.name || "",
          clube: p.club,
          hcp: p.hcp,
          vac: null,
          dataInscricao: null,
          status,
          dob: esDateToIso(p.dob),
          country: rfegPlayerFlag(p.name, p.pais),
          escalao: escaloEsForPlayer(p.catEdad, p.dob, data.meta.dateStart),
          teeName: p.teeMeters ? `${p.teeMeters} m` : null,
        });
      }
    }
    return {
      players,
      totalInscritos: players.filter((p) => p.status === "confirmed").length,
      reservas: players.filter((p) => p.status === "reserva").length,
    };
  };

  const horarios = (data as unknown as { _ncHorarios?: unknown[] })._ncHorarios;
  const hasNcDraw = t.source === "nextcaddy" && Array.isArray(horarios) && horarios.length > 0;
  // mitarjeta (CEE): o draw da R1 vem em `detail.teeTimes` (ver scrape-mitarjeta.js).
  // É renderizado pelo MESMO `DrawSaidaView` → `DrawTab` partilhado (= FPG/NextCaddy),
  // que agora também lê `detail.teeTimes` além dos `_ncHorarios` do NextCaddy.
  const hasMitarjetaDraw = !!((data.teeTimes && data.teeTimes.groups && data.teeTimes.groups.length)
    || (data.teeTimesAll && data.teeTimesAll.some((r) => r.groups && r.groups.length)));
  // livegolfscoring: o draw (`_lgsHorarios`) passa a usar o MESMO DrawSaidaView →
  // DrawTab partilhado (= FPG), em vez do DrawView genérico de texto do CircuitShell.
  const hasLgsDraw = t.source === "livegolfscoring"
    && (() => {
      const hor = (data as unknown as { _lgsHorarios?: LgsHorarioRound[] | null })._lgsHorarios;
      return Array.isArray(hor) && hor.some((r) => (r.groups || []).some((g) => (g.players || []).length));
    })();
  const hasDrawSection = hasNcDraw || hasMitarjetaDraw || hasLgsDraw;
  // CR+Slope reais → mostrar a coluna SD (WHS) no scorecard. Antes só o mitarjeta
  // a mostrava; o livegolfscoring agora também traz CR/Slope (re-scrape), por isso
  // basta o campo ter courseRating+slope (qualquer fonte).
  const hasRating = !!results?.players?.some((p) => p.courseRating != null && p.slope != null);

  // Draws POR RONDA → abas "Draw R{n}" intercaladas com os resultados na barra
  // principal (Inscrições · Draw R1 · R1 · Draw R2 · R2 · Draw R3 · Resumo · …),
  // em vez de uma aba "Draw" única com sub-menu de chips. O MESMO DrawSaidaView →
  // DrawTab partilhado (= FPG) é reusado por ronda (prop `onlyRound`). Inclui
  // rondas ainda por jogar (ex: Draw R3 só com os pairings, sem resultados).
  const drawHorarios = hasDrawSection
    ? (((data as unknown as { _ncHorarios?: NCHorario[] | null })._ncHorarios)
        ?? lgsHorariosToHorarios((data as unknown as { _lgsHorarios?: LgsHorarioRound[] | null })._lgsHorarios)
        ?? teeTimesAllToHorarios(data.teeTimesAll)
        ?? teeTimesToHorarios(data.teeTimes))
    : null;
  const roundDraws = (drawHorarios ?? [])
    .filter((r) => r.players && r.players.length)
    .map((r) => ({ round: r.round, render: () => <DrawSaidaView detail={data} entry={t} onlyRound={r.round} /> }));

  const division: CircuitDivision = {
    key: "main",
    escalao: t.category ?? "—",
    sex: rfegSex(t.sex),
    results: results ?? undefined,
    customResults,
    inscritos: lists.length ? { lists } : undefined,
    renderInscritos: lists.length
      ? () => <AdmissionsTab admissions={buildAdmissions()} date={esDateToIso(data.meta.dateStart) ?? data.meta.dateStart} hidePostCols />
      : undefined,
    // Draw por ronda intercalado (ver roundDraws acima) — sem aba "Draw" agregada.
    roundDraws: roundDraws.length ? roundDraws : undefined,
    links: links.length ? links : undefined,
    // SD (WHS) visível quando o campo tem CR+Slope reais (mitarjeta OU livegolfscoring).
    scOptions: { ...lgsScorecardOptions(), hideSD: !(data.mitarjetaTorneo || hasRating) },
  };

  // NextCaddy junta rapazes e raparigas no MESMO tour (o leaderboard vem em
  // categorias "Alevín Masculino"/"Femenino" etc.). Separar em 2 tabs M/F — só
  // as PANCADAS (gross); a ordenação já é a Scratch do leaderboard. Só divide
  // quando há resultados com ambos os sexos (senão fica a divisão única).
  if (t.source === "nextcaddy" && results && (results.players?.length ?? 0) > 0) {
    const sexOf = (p: FPGPlayer): "M" | "F" | null => {
      const s = (p as FPGPlayer & { _sex?: "M" | "F" | null })._sex;
      return s === "M" || s === "F" ? s : null;
    };
    const males = results.players.filter((p) => sexOf(p) === "M");
    const females = results.players.filter((p) => sexOf(p) === "F");
    const unknown = results.players.filter((p) => sexOf(p) == null);
    if (males.length > 0 && females.length > 0) {
      const escLbl = t.category ?? division.escalao;
      const mkSex = (sx: "M" | "F", plist: FPGPlayer[]): CircuitDivision => ({
        ...division,
        key: sx,
        sex: sx,
        tabLabel: `${escLbl} ${sx}`,
        results: { ...results, players: plist, playerCount: plist.length },
      });
      // Sexo desconhecido (raro depois de ncCatSex) → fica com os rapazes para
      // não desaparecer do leaderboard.
      return [mkSex("M", [...males, ...unknown]), mkSex("F", females)];
    }
  }

  return [division];
}

/** Nome "base" do torneio = nome SEM o escalão e o sexo. Junta as várias
 *  categorias/sexos do MESMO campeonato (ex: "Campeonato de España Alevín
 *  Masculino 2026" → "Campeonato de España 2026"). */
function rfegBaseName(t: RFEGIndexEntry): string {
  let n = t.name || "";
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (t.category) {
    n = n.replace(new RegExp(`\\b${t.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), " ");
    // Strip adicional SEM acentos: o nome pode trazer o escalão sem acento
    // ("Campeonato Andalucia Alevin") enquanto a categoria é acentuada ("Alevín")
    // → o \b…\b acima não casava e a Andaluzia Alevín ficava fora do grupo.
    const catF = fold(t.category);
    n = n.replace(/[\p{L}]+/gu, (w) => (fold(w) === catF ? " " : w));
  }
  n = n.replace(/\b(Masculino|Femenino|Masculina|Femenina|Mascul\.?|Femen\.?|Masc\.?|Fem\.?)\b/gi, " ");
  return n
    .replace(/\([\s.,íÍ]*\)/g, " ")                 // parênteses que ficaram vazios/lixo
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+y\s+(?=\d{4}|$)/gi, " ")           // " y 2026" / " y " órfão
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Ordem dos escalões nas tabs (mais novos primeiro); Sub-N pela idade. */
function ceeEscOrder(cat?: string | null): number {
  const k = (cat || "").toLowerCase();
  if (k.startsWith("benjam")) return 10;
  if (k.startsWith("alev")) return 12;
  if (k.startsWith("infant")) return 14;
  if (k.startsWith("cadet")) return 16;
  if (k.startsWith("juven")) return 18;
  const m = /sub[\s-]?(\d+)/.exec(k);
  if (m) return parseInt(m[1], 10);
  return 99;
}

/** ms de dateStart (ISO) — para medir a janela temporal de um grupo. */
function rfegStartMs(t: RFEGIndexEntry): number | null {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(t.dateStartIso ?? t.dateStart ?? ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

/** Sub-agrupa torneios de um balde por PROXIMIDADE de datas: um intervalo > `win`
 *  dias entre torneios consecutivos inicia um novo cluster. Isola um straggler
 *  distante (mesmo nome-base noutra altura do ano — ex: "Sub-18 Femenino" em
 *  Março no mesmo balde que o campeonato juvenil de Junho) sem destruir o
 *  agrupamento do evento compacto. Torneios sem data ficam cada um no seu cluster. */
function clusterByDate(group: RFEGIndexEntry[], win: number): RFEGIndexEntry[][] {
  const dated = group
    .map((t) => ({ t, ms: rfegStartMs(t) }))
    .filter((x): x is { t: RFEGIndexEntry; ms: number } => x.ms != null)
    .sort((a, b) => a.ms - b.ms);
  const clusters: RFEGIndexEntry[][] = [];
  let cur: RFEGIndexEntry[] = [];
  let prevMs = 0;
  for (const x of dated) {
    if (cur.length && (x.ms - prevMs) / 86400000 > win) { clusters.push(cur); cur = []; }
    cur.push(x.t);
    prevMs = x.ms;
  }
  if (cur.length) clusters.push(cur);
  for (const t of group) if (rfegStartMs(t) == null) clusters.push([t]);
  return clusters;
}

const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Janela máxima (dias) para um grupo ser "o mesmo evento" e não uma SÉRIE
 *  (Puntuável/Circuito espalhado por meses). */
const RFEG_GROUP_WINDOW_DAYS = 16;

/** Sobreposição de rosters = |A∩B| / min(|A|,|B|) (coef. de sobreposição, não
 *  Jaccard: robusto a tamanhos muito diferentes). 0 se algum estiver vazio. */
function rosterOverlap(a?: string[], b?: string[]): number {
  if (!a?.length || !b?.length) return 0;
  const small = a.length <= b.length ? a : b;
  const big = new Set(a.length <= b.length ? b : a);
  let hit = 0;
  for (const k of small) if (big.has(k)) hit++;
  return hit / small.length;
}

/** Sobreposição a partir da qual dois eventos com o mesmo nome+ano se consideram
 *  o MESMO evento (duplicado a deduplicar), e não dois eventos distintos. */
const RFEG_ROSTER_SAME_MIN = 0.85;

const MESES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
/** Mês (label ES) de uma data ISO ("2026-05-…") ou string espanhola ("07 mayo",
 *  "31 mayo - 03 junio"). "" se não der para extrair. */
function esMonthLabel(dateStr?: string): string {
  if (!dateStr) return "";
  const iso = /^\d{4}-(\d{2})/.exec(dateStr);
  if (iso) { const i = +iso[1] - 1; return (i >= 0 && i < 12) ? MESES_ES[i] : ""; }
  const norm = dateStr.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const m = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/.exec(norm);
  if (!m) return "";
  const w = m[1] === "setiembre" ? "septiembre" : m[1];
  return MESES_ES[["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"].indexOf(w)] || "";
}

/** Resolve colisões de nome+ano dentro de um balde, confirmadas por JOGADORES:
 *  - se dois têm o mesmo nome E os MESMOS jogadores (roster ≥ 0.85) → é o mesmo
 *    evento duplicado: fica só o mais rico (mais jogadores/rondas), os outros caem;
 *  - se têm o mesmo nome mas jogadores DIFERENTES (eventos distintos) → anexa o mês
 *    para a sidebar não mostrar texto idêntico 2×.
 *  Devolve a lista já filtrada (pode ter menos entradas que a de entrada). */
/** "Dia Mês" (ES) da data de início — desambigua stops de SÉRIE no mesmo mês
 *  (ex: "3 Junio" vs "10 Junio"). Cai no mês só se não conseguir extrair o dia. */
function esDayMonthLabel(dateStr?: string): string {
  const mes = esMonthLabel(dateStr);
  if (!mes || !dateStr) return mes;
  const iso = /^\d{4}-\d{2}-(\d{2})/.exec(dateStr);
  const day = iso ? String(+iso[1]) : (/\b(\d{1,2})\b/.exec(dateStr)?.[1] ?? "");
  return day ? `${day} ${mes}` : mes;
}

function resolveEntryNameCollisions(
  list: CircuitEntry[],
  rosterOf: (e: CircuitEntry) => string[] | undefined,
): CircuitEntry[] {
  const richness = (e: CircuitEntry) => (e.playerCount ?? 0) * 1000 + (e.roundsCount ?? 0);
  const byName = new Map<string, CircuitEntry[]>();
  for (const e of list) {
    const arr = byName.get(e.name) ?? [];
    arr.push(e);
    byName.set(e.name, arr);
  }
  const dropped = new Set<CircuitEntry>();
  for (const arr of byName.values()) {
    if (arr.length < 2) continue;
    // 1) Dedup só da MESMA INSTÂNCIA: mesmos jogadores (roster ≥ 0.85) E mesma data
    //    de início. O guard da data é crítico — uma SÉRIE recorrente (ex: "VOBS
    //    Competition" semanal) tem os mesmos habituais a jogar → rosters muito
    //    sobrepostos entre stops DIFERENTES; sem o guard, apagaríamos stops reais.
    const survivors: CircuitEntry[] = [];
    for (const e of arr) {
      const twin = survivors.find((s) =>
        !!e.dateStart && s.dateStart === e.dateStart
        && rosterOverlap(rosterOf(s), rosterOf(e)) >= RFEG_ROSTER_SAME_MIN);
      if (!twin) { survivors.push(e); continue; }
      // Mesma instância duplicada: fica a mais rica, a outra é descartada.
      if (richness(e) > richness(twin)) {
        dropped.add(twin);
        survivors[survivors.indexOf(twin)] = e;
      } else {
        dropped.add(e);
      }
    }
    // 2) Os que sobrevivem são eventos/stops DISTINTOS com o mesmo nome → data no
    //    label. Mês se todos forem de meses diferentes (mais limpo); senão dia+mês
    //    (para stops de série no mesmo mês ficarem distinguíveis).
    if (survivors.length > 1) {
      const months = survivors.map((e) => esMonthLabel(e.dateStart));
      const monthsUnique = months.every(Boolean) && new Set(months).size === months.length;
      for (const e of survivors) {
        const lbl = monthsUnique ? esMonthLabel(e.dateStart) : esDayMonthLabel(e.dateStart);
        if (lbl) e.name = `${e.name} · ${lbl}`;
      }
    }
  }
  return list.filter((e) => !dropped.has(e));
}

function buildRfegEntries(index: RFEGIndex, dobLookup?: DobLookup, hcpLookup?: HcpLookup, twins?: Record<string, number>, lgsSuppressed?: Record<string, number>): CircuitEntry[] {
  // Mostrar também torneios FUTUROS/em curso que ainda só têm inscritos
  // (leaderboardPlayers === 0 mas counts.admitidos > 0) — ex: Campeonatos de
  // España já com lista de inscritos antes de serem jogados.
  // Dedup gémeos RFEGolf<->LGS ANTES de agrupar (id sem compId nas entradas `grp-`,
  // por isso tem de ser aqui e não no caller):
  //  • Por defeito o LGS (rico, hbh+metros) é canónico e o RFEGolf só-PDF é suprimido
  //    (`twins[compId]`).
  //  • EXCEPÇÃO: quando o RFEGolf tem mitarjeta com ≥ rondas jogadas que o LGS (live
  //    scoring à frente do scrape LGS — ex: R3 do CEE juvenil só no mitarjeta), é o
  //    LGS que se suprime (`lgsSuppressed[lgsId]`) e fica o RFEGolf+mitarjeta.
  const visible = index.tournaments.filter(
    (t) => t.category
      && ((t.leaderboardPlayers || 0) > 0 || (t.counts?.admitidos || 0) > 0)
      && !(t.source === "rfegolf" && twins?.[String(t.id)] != null)
      && !(t.source === "livegolfscoring" && lgsSuppressed?.[String(t.id)] != null),
  );

  const single = (t: RFEGIndexEntry): CircuitEntry => ({
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
    hasResults: (t.leaderboardPlayers || 0) > 0,
    // Sem resultados ainda → mostrar nº de inscritos na sidebar.
    playerCount: t.leaderboardPlayers || t.counts?.admitidos || undefined,
    roundsCount: t.nRounds ?? undefined,
    divisionCount: 1,
    loadDivisions: () => rfegLoadDivisions(t, dobLookup, hcpLookup),
  });

  // Agrupar por (fonte | ano | nome-base). Um grupo é UM campeonato dividido por
  // categoria/sexo (combinável) quando: ≥2 torneios, varia categoria OU sexo, cada
  // (categoria,sexo) é ÚNICO (senão é circuito/multi-stop — "Circuito Zona C" repete
  // Juvenil M) e as datas estão dentro de uma janela curta (senão é uma SÉRIE —
  // "Puntuable Nacional" espalhado por meses). Caso contrário, fica avulso.
  const byKey = new Map<string, RFEGIndexEntry[]>();
  for (const t of visible) {
    // slugify no nome-base → chave insensível a acentos ("Andalucia"/"Andalucía"
    // colapsam) e a maiúsculas, para o mesmo campeonato não partir em baldes.
    const key = `${t.source}|${t.year ?? "?"}|${slugify(rfegBaseName(t))}`;
    const arr = byKey.get(key) ?? [];
    arr.push(t);
    byKey.set(key, arr);
  }

  const entries: CircuitEntry[] = [];
  const usedGrpIds = new Set<string>();

  for (const group of byKey.values()) {
   // Cada balde produz as suas entradas num array local para podermos desambiguar
   // os labels em colisão (mesmo nome+ano) só entre si, antes de juntar ao total.
   const localEntries: CircuitEntry[] = [];
   // Roster por entrada (union dos torneios que a compõem) → alimenta a
   // resolução de colisões por JOGADORES no fim do balde.
   const rosterByEntry = new Map<CircuitEntry, string[]>();
   const pushLocal = (e: CircuitEntry, roster: string[]) => {
     localEntries.push(e);
     if (roster.length) rosterByEntry.set(e, roster);
   };
   for (const cluster of clusterByDate(group, RFEG_GROUP_WINDOW_DAYS)) {
    const catSex = cluster.map((t) => `${t.category}|${/F/i.test(t.sex || "") ? "F" : "M"}`);
    const variesCatOrSex = new Set(cluster.map((t) => t.category)).size > 1
      || new Set(cluster.map((t) => (/F/i.test(t.sex || "") ? "F" : "M"))).size > 1;
    const ms = cluster.map(rfegStartMs).filter((x): x is number => x != null);
    const spanDays = ms.length ? (Math.max(...ms) - Math.min(...ms)) / 86400000 : 0;
    // O cluster ainda pode ser uma SÉRIE (stops encadeados a < janela cada, mas a
    // abranger meses) — o guard de span mantém-na como entradas avulsas.
    if (cluster.length < 2 || !variesCatOrSex
        || new Set(catSex).size !== catSex.length
        || spanDays > RFEG_GROUP_WINDOW_DAYS) {
      for (const t of cluster) pushLocal(single(t), t.roster ?? []);
      continue;
    }

    // Combinar: divisões = tabs "Benjamín M / Benjamín F / Alevín M / …".
    const sorted = [...cluster].sort(
      (a, b) => (ceeEscOrder(a.category) - ceeEscOrder(b.category))
        || ((/F/i.test(a.sex || "") ? 1 : 0) - (/F/i.test(b.sex || "") ? 1 : 0)),
    );
    const baseRaw = rfegBaseName(sorted[0]) || sorted[0].name || "España";
    const year = sorted[0].year;
    const name = (year != null && !baseRaw.includes(String(year))) ? `${baseRaw} ${year}` : baseRaw;
    const sexes = new Set(sorted.map((t) => (/F/i.test(t.sex || "") ? "F" : "M")));
    const showSex = sexes.size > 1; // só anexa M/F à tab quando há ambos
    const starts = sorted.map((t) => t.dateStartIso ?? t.dateStart).filter(Boolean).sort();
    const ends = sorted.map((t) => t.dateEndIso ?? t.dateEnd).filter(Boolean).sort();
    // Id único: vários clusters/baldes podem reduzir ao mesmo nome-base+ano
    // (ex: campeonato juvenil de Junho vs Sub-16 P&P de Maio → ambos "Campeonato
    // de España 2026"). Desambigua por ano-mês de início, depois por contador.
    let grpId = `${sorted[0].source}:grp-${slugify(name)}`;
    if (usedGrpIds.has(grpId)) {
      const ym = (starts[0] ?? "").slice(0, 7).replace(/-/g, "");
      let cand = ym ? `${grpId}-${ym}` : `${grpId}-2`;
      for (let k = 2; usedGrpIds.has(cand); k++) cand = `${grpId}-${ym || "x"}-${k}`;
      grpId = cand;
    }
    usedGrpIds.add(grpId);
    const grpEntry: CircuitEntry = {
      id: grpId,
      year,
      name,
      source: sorted[0].source,
      // Deep-link vindo de fora (ex: painel de torneios de um jogador) usa o id
      // da prova; sem esta lista não bateria com nenhuma entrada da sidebar.
      memberIds: sorted.map((t) => `${t.source}:${t.id}`),
      dateStart: starts[0] ?? undefined,
      dateEnd: ends[ends.length - 1] ?? undefined,
      federation: sorted.find((t) => t.federation)?.federation ?? undefined,
      // NextCaddy: cada tour junta M+F (dividido em tabs por categoria) → Mixed,
      // para o filtro de sexo ao nível do grupo não o esconder ao filtrar F.
      sex: (showSex || sorted[0].source === "nextcaddy") ? "Mixed" : (sexes.has("F") ? "F" : "M"),
      // Escalões contidos → o filtro de escalão continua a apanhar a entrada
      // combinada (lazy) e o dropdown mantém as opções.
      escaloes: [...new Set(sorted.map((t) => t.category).filter((c): c is string => !!c))],
      hasManuel: sorted.some((t) => t.hasManuel),
      hasPt: sorted.some((t) => t.hasPt),
      hasResults: sorted.some((t) => (t.leaderboardPlayers || 0) > 0),
      playerCount: sorted.reduce((s, t) => s + (t.leaderboardPlayers || t.counts?.admitidos || 0), 0) || undefined,
      roundsCount: Math.max(0, ...sorted.map((t) => t.nRounds ?? 0)) || undefined,
      divisionCount: sorted.length,
      loadDivisions: async () => {
        const per = await Promise.all(sorted.map(async (ct) => {
          const divs = await rfegLoadDivisions(ct, dobLookup, hcpLookup);
          // O torneio combinado não tem `sourceUrl` (é multi-escalão), por isso o
          // link oficial de cada categoria — que numa entry avulsa vinha do
          // `sourceUrl` — é reposto AQUI como link da divisão (microsite RFEG),
          // a juntar ao link de clasificación (mitarjeta) já em `d.links`.
          const official = { label: "Microsite oficial", url: rfegSourceUrl(ct), icon: "🏛️", title: "Microsite RFEG do torneio" };
          return divs.map((d, i) => {
            // Sexo: preferir o da PRÓPRIA divisão (NextCaddy dividido por categoria
            // M/F) sobre o do índice (que para o NextCaddy é null). Anexa M/F à tab
            // quando o grupo varia de sexo (showSex, ex: RFEGolf España) OU a divisão
            // já é sexuada (NextCaddy) — evita "Alevín M" redundante em grupos só-M.
            const dSex = (d.sex === "M" || d.sex === "F") ? d.sex : rfegSex(ct.sex);
            const escLbl = ct.category ?? d.escalao ?? "—";
            const withSex = showSex || d.sex === "M" || d.sex === "F";
            return {
              ...d,
              key: `${ct.source}:${ct.id}:${i}`,
              escalao: ct.category ?? d.escalao,
              sex: dSex,
              tabLabel: withSex ? `${escLbl} ${dSex === "F" ? "F" : "M"}` : escLbl,
              links: [...(d.links ?? []), official],
            };
          });
        }));
        return per.flat();
      },
    };
    pushLocal(grpEntry, [...new Set(sorted.flatMap((t) => t.roster ?? []))]);
   }
   // Colisões de nome+ano dentro deste balde: dedup se forem o MESMO evento
   // (mesmos jogadores) ou mês no label se forem eventos DIFERENTES.
   const resolved = resolveEntryNameCollisions(localEntries, (e) => rosterByEntry.get(e));
   for (const e of resolved) entries.push(e);
  }

  return entries;
}

const RFEG_CONFIG: CircuitConfig = {
  routeBase: "/rfeg",
  title: "🇪🇸 España",
  color: "var(--color-rfeg-red)",
  grouping: "year",
  sourceColors: { rfegolf: "var(--color-rfeg-red)", livegolfscoring: "#00aa55", golfdirecto: "#0066cc", nextcaddy: "var(--color-rfeg-yellow)" },
  sourceLabels: { rfegolf: "RFEGolf", livegolfscoring: "LGS", golfdirecto: "FCG", nextcaddy: "NextCaddy" },
  filters: { search: true, year: true, escalao: true, sex: true, source: true, toggles: ["manuel", "pt", "top10", "veteranos", "results"], defaultToggles: ["results"] },
  veteranoThreshold: 3,
  // "Edições anteriores": família pelo nome do torneio (sem ano) — os
  // Campeonatos recorrem e agrupam-se; os tours de nome único ficam singletons
  // (a tab esconde-se). Só é útil quando há ≥2 anos com o mesmo nome.
  editionKey: (e) => tournamentFamilyKey(e.name),
  loadingMessage: "A carregar dados...",
};

/* ── veteranIndex pré-calculado (páginas lazy) ──────────────────────────
 * O CircuitShell só consegue contar presenças (toggle ✦ Veteranos) a partir
 * das divisões EAGER. A RFEG é lazy (centenas de torneios carregados sob
 * demanda), por isso fornecemos um índice pré-calculado a partir dos
 * agregados de rivais (rfegolf-rivals + fcg-rivals), que já trazem a lista
 * de jogadores por torneio sem precisar de abrir cada ficheiro de detalhe.
 *
 * ⚠ As chaves TÊM de bater com `vetKey(player.name)` do shell (índice de
 * veteranos): o leaderboard formata os nomes via formatPlayerName() (reordena
 * "APELIDO, Nome" e Title-Case), por isso aplicamos a MESMA transformação aqui
 * antes da chave. Usamos o `vetKey` partilhado (normName + tokens ordenados),
 * tolerante à ordem nome/apelido. */
interface RfegRivalsFile {
  torneios?:
    | Record<string, { players?: { n?: string }[] }>
    | { players?: { n?: string }[] }[];
}

const normNameVet = vetKey;

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
  const [lgsSuppressed, setLgsSuppressed] = useState<Record<string, number>>({});
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
    cachedFetchJson<{ twins: Record<string, number>; lgsSuppressed?: Record<string, number> }>("/data/rfegolf-lgs-twins.json").then((d) => { if (d && d.twins) setTwins(d.twins); if (d && d.lgsSuppressed) setLgsSuppressed(d.lgsSuppressed); }).catch(() => {});
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
      // O dedup de gémeos RFEGolf<->LGS agora corre DENTRO de buildRfegEntries
      // (antes de agrupar), por isso apanha também as entradas combinadas `grp-…`.
      return buildRfegEntries(index, dobLookup, hcpLookup, twins, lgsSuppressed);
    },
    [index, dobLookup, hcpLookup, twins, lgsSuppressed],
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
    if (params.source) {
      const direct = `${params.source}:${idStr}`;
      if (entries.some((e) => e.id === direct)) return direct;
      // Prova fundida numa entrada combinada (`grp-…`) → seleccionar o grupo.
      return entries.find((e) => e.memberIds?.includes(direct))?.id ?? direct;
    }
    return entries.find((e) => e.id.endsWith(`:${idStr}`) || e.memberIds?.some((m) => m.endsWith(`:${idStr}`)))?.id;
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
