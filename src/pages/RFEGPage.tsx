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
import { RoundPill, EscPill, YearPill } from "../ui/PillBadge";
import SortableHdr from "../ui/SortableHdr";
import SexBadge from "../ui/SexBadge";
import ExtLink from "../ui/ExternalLink";
import { ScorecardLeaderboard, type ScorecardRow } from "../ui/ScorecardLeaderboard";
import { isManuelByName as isM } from "../constants/manuel";
import { displayName } from "../utils/format";
import { flag } from "../utils/flagUtils";
import { formatPlayerName } from "../utils/playerUtils";
import { IntlTournView } from "../ui/IntlTournView";
import type { Tournament as FPGTournament, Player as FPGPlayer, RoundScore as FPGRoundScore, ScorecardOptions } from "./FPGPage";

/* ── Types ──────────────────────────────────────────────── */

interface RFEGIndexEntry {
  source: "rfegolf" | "nextcaddy" | "livegolfscoring";
  id: number;
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
          si: [], meters: [], teeName: undefined,
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

  const players: FPGPlayer[] = sortedAcc.map((a, idx) => {
    const e = lookupByName[norm(a.name)];
    const club = e?.club ? displayName(e.club) : "";
    const incomplete = a.rounds.length < numRounds;
    return {
      scoreId: `lgs-${lgs.id}-${idx}`,
      pos: a.pos ?? idx + 1,
      name: formatPlayerName(a.name),
      club: club || "—",
      fed: e?.licencia || undefined,
      fedCode: e?.licencia || undefined,
      grossTotal: a.total || null,
      toPar: a.toPar,
      hcpExact: undefined,
      nholes: 18,
      parTotal,
      scores: a.rounds[0]?.scores || [],
      par,
      si: [],
      meters: [],
      roundScores: a.rounds,
      _wd: incomplete,
      _roundsPlayed: a.rounds.length,
    } as FPGPlayer;
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
  return {
    hideHCP: true,
    hideSD: true,
    hideEsc: true,
    hideTee: true,
    clubLabel: "Clube",
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
        <td title={p.pais ?? ""} style={{ padding: "6px 8px", textAlign: "center", fontSize: 18 }}>
          {p._flag}
        </td>
      </>
    );

    const postForResults = (
      <>
        <td style={{ textAlign: "center", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
          {p.toPar == null
            ? "—"
            : (p.toPar === 0
                ? <span style={{ color: "var(--text-2)" }}>E</span>
                : (p.toPar > 0
                    ? <span style={{ color: "var(--color-bad, #c00)" }}>+{p.toPar}</span>
                    : <span style={{ color: "var(--color-good-dark, #0a0)" }}>{p.toPar}</span>))}
        </td>
        <td style={{ textAlign: "center", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
          {p.total ?? "—"}
        </td>
        {!showHoleByHole && Array.from({ length: maxRounds }, (_, idx) => {
          const r = (p.rounds || []).find((x) => x.round === idx + 1);
          return (
            <td key={`r${idx}`} style={{ textAlign: "center", fontFamily: "'JetBrains Mono', monospace" }}>
              {r && r.gross != null ? r.gross : "—"}
            </td>
          );
        })}
      </>
    );
    const postForInscritos = (
      <td style={{ padding: "6px 8px", textAlign: "center" }}>
        {p.estado
          ? <span style={{ background: "var(--bg-muted)", color: "var(--text-muted)", fontSize: 10, padding: "1px 6px", borderRadius: 10, border: "1px solid var(--border-light)" }}>{p.estado}</span>
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
  /** par[] inferido a partir dos scores (script infer-nextcaddy-par.js).
   *  parInferred=true assinala que não vem da fonte directa.
   *  parConfidence ∈ {high, medium, low} indica quanto se pode confiar no par. */
  course?: {
    par?: number[] | null;
    si?: number[] | null;
    meters?: number[] | null;
    parTotal?: number;
    parInferred?: boolean;
    parConfidence?: "high" | "medium" | "low";
  };
  leaderboard: { category: number; players: NCPlayer[] }[];
  inscritos: NCInsc[];
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
}

function adaptLgs(lgs: LgsDetail, dobLookup?: DobLookup): RFEGDetail {
  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  const lookupByName: Record<string, DobLookupEntry> = {};
  if (dobLookup) {
    for (const e of Object.values(dobLookup)) {
      if (e.name) lookupByName[norm(e.name)] = e;
    }
  }

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
  } as RFEGDetail & { _lgsRounds: LgsRound[] };
}
type DobLookup = Record<string, DobLookupEntry>;

function adaptNextCaddy(nc: NCDetail, dobLookup?: DobLookup): RFEGDetail {
  const enrich = (licencia: string | null) => {
    if (!licencia || !dobLookup) return null;
    return dobLookup[licencia.trim()] || null;
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
        hcp: p.hcp ?? null,
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
      hcp: p.hcp ?? null,
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
  };
}

/* ── TournamentDetail ──────────────────────────────────── */

/* ── ResultsTable ────────────────────────────────────────
   Renderiza leaderboard final RFEGolf. Quando há grupos
   (Final + Categoria + Sexo separados), tem selector. */
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

  const fmtTp = (n: number) => n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`;
  const tpClass = (n: number) => n === 0 ? "var(--text-2)" : n > 0 ? "var(--color-bad, #c00)" : "var(--color-good-dark, #0a0)";

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
              {gr.label} <span className="chip" style={{ marginLeft: 4, fontSize: 10 }}>{gr.players.length}</span>
            </button>
          ))}
        </div>
      )}
      {(g.courseRating || g.slope) && (
        <div style={{ padding: "6px 12px", fontSize: 12 }} className="muted">
          {g.courseRating && <>CR {g.courseRating} </>}
          {g.slope && <>· Slope {g.slope} </>}
          {g.pdfUrl && <ExtLink href={g.pdfUrl} className="tourn-ext-link">📄 PDF original</ExtLink>}
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
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
                  <td style={{ padding: "4px 8px", textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: tpClass(p.toPar) }}>
                    {fmtTp(p.toPar)}
                  </td>
                  {Array.from({ length: nR }, (_, ri) => (
                    <td key={ri} style={{ padding: "4px 8px", textAlign: "center", fontFamily: "'JetBrains Mono', monospace" }}>
                      {p.rounds[ri] ?? "—"}
                    </td>
                  ))}
                  <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
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

function TournamentDetail({ entry, dobLookup }: { entry: RFEGIndexEntry; dobLookup?: DobLookup }) {
  const [data, setData] = useState<RFEGDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<ListKind>("admitidos");
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    setList("admitidos");
    setShowResults(false);
    cachedFetchJson<RFEGDetail | NCDetail | LgsDetail>(`/data/${entry.filePath}`)
      .then((d) => {
        if (!d) {
          setError("Ficheiro não encontrado");
          return;
        }
        if (entry.source === "nextcaddy") {
          setData(adaptNextCaddy(d as NCDetail, dobLookup));
        } else if (entry.source === "livegolfscoring") {
          const adapted = adaptLgs(d as LgsDetail, dobLookup);
          setData(adapted);
          if (adapted.results && adapted.results.some(r => r.players && r.players.length > 0)) {
            setShowResults(true);
          }
        } else {
          // RFEGolf: actualmente sem par[] (limitação documentada do scraper).
          // Mantemos coursePar=null para que o ScorecardLeaderboard caia em fallback.
          const detail = d as RFEGDetail;
          setData({ ...detail, coursePar: detail.coursePar ?? null });
          // Se há resultados publicados, abrir directamente nessa tab.
          if (detail.results && detail.results.some(r => r.players && r.players.length > 0)) {
            setShowResults(true);
          }
        }
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [entry.filePath, entry.source, dobLookup]);

  if (error) return <EmptyState message={`Erro: ${error}`} />;
  if (!data) return <LoadingState message="A carregar dados..." />;

  const m = data.meta;
  const c = data.inscritos.counts;
  const sourceUrl = entry.source === "rfegolf"
    ? `https://rfegolf.es/CompetenciaPaginas/CompetitionMicrosite.aspx?CompId=${entry.compId}`
    : `https://www.nextcaddy.com/tour/${entry.tourId}`;
  const scoringUrl = entry.source === "rfegolf"
    ? `https://rfegolf.es/CompetenciaPaginas/LiveScoring.aspx?CompId=${entry.compId}`
    : `https://www.nextcaddy.com/tour/${entry.tourId}/clasificaciones`;

  const listsAvailable: ListKind[] = (Object.keys(c) as ListKind[]).filter((k) => c[k] > 0);
  const effectiveList: ListKind = c[list] > 0 ? list : (listsAvailable[0] || "admitidos");
  const currentList = data.inscritos[effectiveList];

  // Quando é LGS com resultados, render simplificado (estilo BJGT/FPG): IntlTournView
  // tem header e tabs próprios, não duplicamos.
  const hasLgs = entry.source === "livegolfscoring" && (data as any)._lgsRounds && (data as any)._lgsRounds.length > 0;
  if (hasLgs) {
    return (
      <IntlTournView
        tournament={lgsToFPGTournament({
          id: data.compId,
          meta: { name: m.name, course: m.course, dateRange: m.dateStart, dateIso: m.dateStart },
          rounds: (data as any)._lgsRounds,
        }, dobLookup)}
        scOptions={lgsScorecardOptions()}
        siLabel="m"
      />
    );
  }

  return (
    <>
      <DetailHeader
        title={`${entry.year ?? ""} // ${m.name || entry.name}`}
        sub={
          <>
            <span className="muted">
              🇪🇸 {entry.source === "rfegolf" ? "RFEGolf" : "NextCaddy"}
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

      <div className="card" style={{ margin: "8px 0", padding: "8px 12px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
        {m.category && <span className={catPillClass(m.category)}>{m.category}</span>}
        {m.sex && <span className="p p-sm">{m.sex}</span>}
        {(m.hcpLimitMen != null) && <span className="muted" title="Limite hcp masculino">Hcp♂ ≤ {m.hcpLimitMen}</span>}
        {(m.hcpLimitWomen != null) && <span className="muted" title="Limite hcp femenino">Hcp♀ ≤ {m.hcpLimitWomen}</span>}
        {m.players != null && <span className="muted">🏆 {m.players} jogadores limit</span>}
        {m.federation && <span className="muted">🏛️ {m.federation}</span>}
        {data.coursePar && data.coursePar.length > 0 && (
          <span className="muted" title={`Par total ${data.coursePar.reduce((a, b) => a + b, 0)} · ${data.parConfidence === "low" ? "confiança baixa (não bate com par_total)" : data.parConfidence === "medium" ? "confiança média (sem par_total)" : "confiança alta"} · inferido a partir dos scores top-50%`}>
            ⛳ Par {data.coursePar.reduce((a, b) => a + b, 0)} (inferido{data.parConfidence === "low" ? " · ⚠" : ""})
          </span>
        )}
      </div>

      <div className="detail-toolbar" style={{ flexWrap: "wrap", gap: 4, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
        {data.results && data.results.some(r => r.players && r.players.length > 0) && (
          <button
            type="button"
            className={`tourn-tab ${showResults ? "active" : ""}`}
            onClick={() => setShowResults(true)}
            title="Leaderboard final"
          >
            🏆 Resultados
            <span className="chip" style={{ marginLeft: 4, fontSize: 10 }}>
              {data.results.reduce((a, r) => a + (r.players?.length || 0), 0)}
            </span>
          </button>
        )}
        {(Object.keys(c) as ListKind[]).map((k) => {
          const enabled = c[k] > 0;
          const active = !showResults && effectiveList === k;
          return (
            <button
              key={k}
              type="button"
              disabled={!enabled}
              className={`tourn-tab ${active ? "active" : ""}`}
              onClick={() => { if (enabled) { setShowResults(false); setList(k); } }}
              style={{ cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : 0.4 }}
              title={`${LIST_LABELS[k]} (${c[k]})`}
            >
              {LIST_LABELS[k]} <span className="chip" style={{ marginLeft: 4, fontSize: 10 }}>{c[k]}</span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 8 }}>
        {showResults && data.results && data.results.some(r => r.players && r.players.length > 0) ? (
          <ResultsTable results={data.results} dobLookup={dobLookup} dateRef={m.dateStart} />
        ) : listsAvailable.length === 0 ? (
          <EmptyState message="Sem inscritos publicados ainda." />
        ) : (
          <PlayerTable
            players={currentList}
            dateRef={m.dateStart}
            coursePar={data.coursePar}
            parConfidence={data.parConfidence}
          />
        )}
      </div>

      <p className="muted" style={{ marginTop: 16, fontSize: 11 }}>
        Fonte: {entry.source === "rfegolf" ? "rfegolf.es" : "nextcaddy.com"} · ID {entry.id} · scrape: {data.scrapedAt}
      </p>
    </>
  );
}

/* ── Página principal ──────────────────────────────────── */

interface DobLookupFile {
  generatedAt: string;
  totalLicencias: number;
  lookup: DobLookup;
}

export default function RFEGPage() {
  const [index, setIndex] = useState<RFEGIndex | null>(null);
  const [dobLookup, setDobLookup] = useState<DobLookup | undefined>(undefined);
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
  }, []);

  const visible = useMemo(() => {
    if (!index) return [];
    let arr = index.tournaments;
    // Filtrar torneios SEM dados publicados — poluem o sidebar com entradas
    // vazias. Acontece em dois cenários:
    //   - Futuros: ainda não há inscritos publicados.
    //   - Passados duplicados: o microsite RFEGolf existe mas o leaderboard
    //     publicado está em livegolfscoring com outro id (ex: Sub-16 M/F 2026 =
    //     LGS 366+367, microsite RFEGolf 16209 fica vazio).
    // Mantemos só os com counts.admitidos > 0 OU leaderboardPlayers > 0.
    arr = arr.filter((t) => {
      const hasData = (t.counts?.admitidos || 0) > 0 || (t.leaderboardPlayers || 0) > 0;
      return hasData;
    });
    if (filterYear !== "all") arr = arr.filter((t) => String(t.year) === filterYear);
    if (filterCategory !== "all") arr = arr.filter((t) => t.category === filterCategory);
    if (filterSex !== "all") arr = arr.filter((t) => t.sex === filterSex);
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
  const categories = useMemo(() => {
    if (!index) return [];
    return Object.keys(index.byCategory);
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
          style={{ padding: "3px 8px", fontSize: 12, width: 160, marginLeft: 8 }}
        />
        <select className="input" value={filterYear} onChange={(e) => setFilterYear(e.target.value)} style={{ padding: "3px 6px", fontSize: 12 }}>
          <option value="all">📅 Anos</option>
          {years.map((y) => <option key={y} value={y}>{y} ({index.byYear[y] ?? "?"})</option>)}
        </select>
        <select className="input" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ padding: "3px 6px", fontSize: 12 }}>
          <option value="all">🏆 Categorias</option>
          {categories.map((c) => <option key={c} value={c}>{c} ({index.byCategory[c]})</option>)}
        </select>
        <select className="input" value={filterSex} onChange={(e) => setFilterSex(e.target.value)} style={{ padding: "3px 6px", fontSize: 12 }}>
          <option value="all">M+F</option>
          <option value="M">Masculino</option>
          <option value="F">Femenino</option>
          <option value="Mixto">Mixto</option>
        </select>
        <select className="input" value={filterSource} onChange={(e) => setFilterSource(e.target.value)} style={{ padding: "3px 6px", fontSize: 12 }}>
          <option value="all">Fontes</option>
          <option value="livegolfscoring">LGS (hbh)</option>
          <option value="rfegolf">RFEGolf</option>
          <option value="nextcaddy">NextCaddy</option>
        </select>
        {(filterText || filterYear !== "all" || filterCategory !== "all" || filterSex !== "all" || filterSource !== "all") && (
          <button
            onClick={() => { setFilterText(""); setFilterYear("all"); setFilterCategory("all"); setFilterSex("all"); setFilterSource("all"); }}
            className="chip"
            style={{ cursor: "pointer", fontSize: 11 }}
          >✕</button>
        )}
        {cur && cur.course && <ToolbarMeta>📍 {cur.course}</ToolbarMeta>}
        <span className="chip ml-auto">{visible.length} de {totalCount}</span>
      </Toolbar>

      <div className="master-detail">
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          {years.map((y, yIdx) => {
            const yearEntries = visible.filter((t) => (t.year ? String(t.year) : "—") === y);
            if (yearEntries.length === 0) return null;
            return (
              <React.Fragment key={`rfeg-${y}`}>
                {yIdx === 0 && (
                  <SidebarSectionTitle dark color="#aa151b" textColor="#ffffff" borderColor="#f1bf00" letterSpacing="0.08em">
                    🇪🇸 RFEG — Torneios juvenis
                  </SidebarSectionTitle>
                )}
                <div className="sidebar-year-label" style={{ padding: "2px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "#ffffff", textTransform: "uppercase", marginTop: 4, background: "#aa151b" }}>{y}</div>
                {yearEntries.map((entry) => {
                  const active = cur?.id === entry.id && cur?.source === entry.source;
                  const sourceColor = entry.source === "rfegolf" ? "#aa151b" : entry.source === "livegolfscoring" ? "#0a5" : "#f1bf00";
                  const sourceFg = entry.source === "rfegolf" || entry.source === "livegolfscoring" ? "#fff" : "#000";
                  const sourceLabel = entry.source === "rfegolf" ? "RFEGolf" : entry.source === "livegolfscoring" ? "LGS" : "NextCaddy";
                  return (
                    <button
                      key={`${entry.source}-${entry.id}`}
                      className={`course-item ${active ? "active" : ""}`}
                      onClick={() => { navigate(`/rfeg/${entry.source}/${entry.id}`); md.onSelect(); }}
                    >
                      <div className="course-item-name">{entry.name}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4, alignItems: "center" }}>
                        <span className="chip" style={{ fontSize: 9, background: sourceColor, color: sourceFg, padding: "1px 6px", borderRadius: 8 }}>{sourceLabel}</span>
                        {entry.category && <span className={catPillClass(entry.category)}>{entry.category}</span>}
                        {entry.sex && <span className="chip" style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8 }}>{entry.sex}</span>}
                        {(entry.leaderboardPlayers && entry.leaderboardPlayers > 0) ? <RoundPill nR={1} /> : null}
                      </div>
                      {entry.dateStart && (
                        <div className="course-item-meta" style={{ fontSize: 11, marginTop: 4 }}>📅 {dateRange(entry.dateStart, entry.dateEnd)}</div>
                      )}
                      {entry.course && (
                        <div className="course-item-meta" style={{ fontWeight: 600, color: "var(--text-2)" }}>📍 {entry.course.length > 50 ? entry.course.slice(0, 50) + "…" : entry.course}</div>
                      )}
                      {entry.counts && entry.counts.admitidos > 0 && (
                        <div className="course-item-meta" style={{ fontSize: 11, marginTop: 2 }}>
                          🏌️ {entry.counts.admitidos} {entry.source === "livegolfscoring" ? "resultados" : "inscritos"}
                          {entry.leaderboardPlayers && entry.source !== "livegolfscoring" ? ` · 📊 ${entry.leaderboardPlayers} resultados` : ""}
                        </div>
                      )}
                    </button>
                  );
                })}
              </React.Fragment>
            );
          })}
          {visible.length === 0 && (
            <div style={{ padding: 16 }}>
              <EmptyState size="sm" message="Sem torneios para os filtros actuais." />
            </div>
          )}
        </div>

        <div className="course-detail">
          {cur ? <TournamentDetail entry={cur} dobLookup={dobLookup} /> : <EmptyState message="Escolhe um torneio na barra lateral." />}
        </div>
      </div>
    </div>
    </KidsLinkCtx.Provider>
  );
}
