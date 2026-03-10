/**
 * TorneiosAnalisePage.tsx — Análise Genérica de Torneios
 *
 * Lê automaticamente todos os ficheiros:
 *   /data/pull-torneios000.json
 *   /data/pull-torneios001.json
 *   /data/pull-torneios002.json
 *   ... (para quando aparecer um 404)
 *
 * Apresenta:
 *   • Sidebar com todos os torneios de todos os ficheiros, agrupados por mês/ano
 *   • Leaderboard com scorecard buraco-a-buraco
 *   • Tabs por ronda (R1, R2, ... + Acumulado para multi-ronda)
 *   • Suporte a 9H e 18H, 1 a N rondas
 */
import React, { useEffect, useState, useMemo } from "react";
import { useAppContext } from "../context/AppContext";
import { SC } from "../utils/scoreDisplay";
import { getTeeHex } from "../utils/teeColors";
import PillBadge from "../ui/PillBadge";
import { ScorecardLeaderboard, type ScorecardRow } from "../ui/ScorecardLeaderboard";
import { MultiRoundLeaderboard, type MultiRoundRow as MRRow } from "../ui/MultiRoundLeaderboard";
import { CrossSeasonTable, SortTh as CSortTh } from "../ui/CrossSeasonTable";
import {
  MANUEL_FED, isManuel, fmtTP,
  EscPill, TeeDot, TournPName, ESC_STYLE, SDPill,
  type PlayersDB,
} from "../ui/tournamentPrimitives";

/* ─────────────────────────────────────────────
   CONFIGURAÇÃO
   ───────────────────────────────────────────── */
const DATA_BASE_URL = "/data/pull-torneios";   // prefixo dos ficheiros
const DATA_EXT      = ".json";                  // extensão
const DATA_DIGITS   = 3;                        // 000, 001, 002 ...
const DATA_MAX      = 50;                       // segurança: parar após N ficheiros

type TournPill = "REGIONAL" | "NACIONAL" | "INTL" | "PJA";

/**
 * Mapa tcode → pill de torneio.
 * Adicionar aqui novos torneios conforme necessário.
 */
const TOURN_PILLS: Record<string, TournPill> = {
  "10444": "PJA",   // AT&T PEBBLE BEACH PRO-AM BY TITLEIST
  "10492": "PJA",   // Aroeira Master by Details
  "10036": "PJA",   // Ribagolfe Oaks Masters 2025
  "10019": "PJA",   // Race to Dunas G. Final
};

const PILL_STYLE_PJA = { bg: "#1e3a5f", color: "#fff" };

function TournPillBadge({ tcode, dynamicPills }: { tcode?: string; dynamicPills?: Record<string, TournPill> }) {
  if (!tcode) return null;
  const tcodes = tcode.split("+");
  const pill = tcodes.map(tc => TOURN_PILLS[tc] || dynamicPills?.[tc]).find(Boolean);
  if (!pill) return null;
  if (pill === "PJA") {
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "1px 6px",
        background: PILL_STYLE_PJA.bg, color: PILL_STYLE_PJA.color, whiteSpace: "nowrap",
      }}>PJA</span>
    );
  }
  return <PillBadge pill={pill} />;
}

/** Constrói o URL de um índice: 0 → /data/pull-torneios000.json */
function dataUrl(idx: number): string {
  return DATA_BASE_URL + String(idx).padStart(DATA_DIGITS, "0") + DATA_EXT;
}

/**
 * Carrega todos os ficheiros sequencialmente até 404 (ou DATA_MAX).
 * Retorna array com todos os torneios de todos os ficheiros, preservando
 * o campo _sourceFile para referência futura.
 */
async function loadAllFiles(): Promise<{ tournaments: Tournament[]; meta: FileMeta[] }> {
  const allTournaments: Tournament[] = [];
  const meta: FileMeta[] = [];

  for (let i = 0; i < DATA_MAX; i++) {
    const url = dataUrl(i);
    let resp: Response;
    try { resp = await fetch(url); } catch { break; }
    if (!resp.ok) break;  // 404 ou outro erro → parar

    const d: DriveData = await resp.json();
    const normalised = (d.tournaments || []).map(t => ({
      ...t,
      _sourceFile: url,
      _sourceIndex: i,
      players: t.players.map(normalizePlayer),
    }));
    allTournaments.push(...normalised);
    meta.push({
      file: url,
      index: i,
      lastUpdated: d.lastUpdated,
      source: d.source,
      count: normalised.length,
    });
  }

  return { tournaments: allTournaments, meta };
}

interface FileMeta {
  file: string; index: number;
  lastUpdated?: string; source?: string; count: number;
}

/* PlayersDB, MANUEL_FED importados de tournamentPrimitives */
type EscLookup = Map<string, string>; // fedCode → escalão normalizado

function buildEscLookup(playersDB: PlayersDB): EscLookup {
  const m = new Map<string, string>();
  for (const [fed, info] of Object.entries(playersDB)) {
    if (info.escalao) {
      m.set(fed, info.escalao.replace("-", " ").replace(/sub(\d)/i, "Sub $1").trim());
    }
  }
  return m;
}

function resolveEsc(p: Player, escLookup: EscLookup): string {
  // Prioridade 1: escalão gravado no próprio registo do torneio (histórico)
  const historic = (p as any).escalao || (p as any).ageCategory;
  if (historic) return historic.replace("-", " ").replace(/sub(\d)/i, "Sub $1").trim();
  // Prioridade 2: lookup atual (players.json) — só usado se não há dado histórico
  const fed = p.fedCode || (p as any).fed;
  if (fed && escLookup.has(fed)) return escLookup.get(fed)!;
  return "";
}

/* ─────────────────────────────────────────────
   TIPOS (subset do formato Drive)
   ───────────────────────────────────────────── */
export interface RoundScore {
  round: number; gross: number;
  scores: number[]; pars: number[]; si: number[]; meters: number[];
  courseRating?: number; slope?: number; teeName?: string; teeColorId?: number;
}
export interface Player {
  scoreId: string; pos: number | string | null; name: string; club: string;
  grossTotal: number | string | null; toPar: number | string | null;
  fedCode?: string; hcpExact?: number; hcpPlay?: number;
  course?: string; courseRating?: number; slope?: number; teeName?: string;
  nholes?: number; parTotal?: number;
  scores?: number[]; par?: number[]; si?: number[]; meters?: number[];
  roundScores?: RoundScore[];
}
export interface Tournament {
  name: string; ccode?: string; tcode: string; date: string;
  campo: string; clube?: string; circuit?: string; series?: string;
  region?: string; escalao?: string | null; num?: number;
  links?: Record<string, string>;
  rounds?: number; playerCount: number; players: Player[];
  _sourceFile?: string;
  _sourceIndex?: number;
}
interface DriveData {
  lastUpdated?: string; source?: string;
  totalTournaments: number; totalPlayers: number;
  tournaments: Tournament[];
}

/* ─────────────────────────────────────────────
   NORMALIZAÇÃO (como DrivePage)
   ───────────────────────────────────────────── */
/** Converte "SOBRENOME,Nome" → "Nome Sobrenome" (capitalização título) */
function formatPlayerName(raw: string): string {
  if (!raw) return raw;
  // Detectar formato "SOBRENOME,Nome" ou "SOBRENOME, Nome"
  const commaIdx = raw.indexOf(",");
  if (commaIdx > 0) {
    const last  = raw.substring(0, commaIdx).trim();
    const first = raw.substring(commaIdx + 1).trim();
    // Capitalizar cada palavra (ex: "IVO DE CARVALHO" → "Ivo de Carvalho")
    const cap = (s: string) => s.split(" ").map((w, i) => {
      const lower = w.toLowerCase();
      // Partículas que ficam minúsculas quando não são a primeira palavra
      if (i > 0 && ["de","da","do","das","dos","e","van","von","de la"].includes(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).join(" ");
    return `${cap(first)} ${cap(last)}`.trim();
  }
  return raw;
}

export function normalizePlayer(p: any): Player {
  const r1: RoundScore | undefined = p.roundScores?.[0];
  return {
    ...p,
    name: formatPlayerName(p.name),
    scores: p.scores || r1?.scores,
    par: p.par || r1?.pars,
    si: p.si || r1?.si,
    meters: p.meters || r1?.meters,
    courseRating: p.courseRating ?? r1?.courseRating,
    slope: p.slope ?? r1?.slope,
    teeName: p.teeName || r1?.teeName,
  };
}

/** Expand multi-round: 1 torneio → R1 + R2 + ... + Total */
export function expandMultiRound(t: Tournament): Tournament[] {
  const nRounds = t.rounds || 1;
  const hasMulti = t.players.some(p => (p.roundScores?.length ?? 0) > 1);
  if (nRounds <= 1 || !hasMulti) return [t];

  const out: Tournament[] = [];

  // Per-round entries
  for (let rd = 1; rd <= nRounds; rd++) {
    const rdPlayers: Player[] = [];
    for (const p of t.players) {
      const rs = p.roundScores?.find(r => r.round === rd);
      if (!rs) continue;
      const parT = p.parTotal || rs.pars.reduce((a, b) => a + b, 0);
      rdPlayers.push(normalizePlayer({
        ...p,
        scoreId: p.scoreId + "_R" + rd,
        grossTotal: rs.gross,
        toPar: rs.gross - parT,
        scores: rs.scores, par: rs.pars, si: rs.si, meters: rs.meters,
        courseRating: rs.courseRating, slope: rs.slope, teeName: rs.teeName,
        roundScores: [rs],
      }));
    }
    // Sort by gross for this round
    rdPlayers.sort((a, b) => numGross(a) - numGross(b));
    out.push({ ...t, players: rdPlayers, _roundLabel: `R${rd}` } as any);
  }

  // Total (accumulated) entry — jogadores incompletos vão para o fim
  const maxRounds = nRounds;
  const totalPlayers: Player[] = [];
  for (const p of t.players) {
    if (!p.roundScores?.length) continue;
    const nPlayed = p.roundScores.length;
    const incomplete = nPlayed < maxRounds;
    const gross = p.roundScores.reduce((s, rs) => s + rs.gross, 0);
    const parT = (p.parTotal || (p.roundScores[0]?.pars.reduce((a, b) => a + b, 0) || 0)) * nPlayed;
    totalPlayers.push(normalizePlayer({
      ...p,
      grossTotal: gross,
      toPar: gross - parT,
      _incomplete: incomplete,
      _roundsPlayed: nPlayed,
    } as any));
  }
  // Completos ordenados por gross; incompletos no fim ordenados por gross
  const complete   = totalPlayers.filter(p => !(p as any)._incomplete).sort((a, b) => numGross(a) - numGross(b));
  const incomplete = totalPlayers.filter(p =>  (p as any)._incomplete).sort((a, b) => numGross(a) - numGross(b));
  // Positions only for complete players
  let pos = 1;
  complete.forEach((p, i) => {
    if (i > 0 && numGross(p) !== numGross(complete[i - 1])) pos = i + 1;
    (p as any)._pos = pos;
  });
  incomplete.forEach(p => { (p as any)._pos = null; });
  out.push({ ...t, players: [...complete, ...incomplete], _roundLabel: "Acumulado", _isTotal: true } as any);

  return out;
}

function numGross(p: Player): number {
  return typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number) ?? 999;
}

/* fmtTP importado de tournamentPrimitives */

/* ─────────────────────────────────────────────
   AGRUPAMENTO AUTOMÁTICO DE RONDAS (Dia 1 / Dia 2 → torneio sintético)
   ───────────────────────────────────────────── */

/** "PJA TOUR Vale Pisão - Dia 1" → "PJA TOUR Vale Pisão" */
function extractBaseName(name: string): string {
  // Suporta: "– Dia 2", "- Dia1", " Dia 2", " Dia1", "- Round 1", etc.
  return name.replace(/\s*[-–]?\s*(?:dia|round|ronda)\s*\d+\s*$/i, "").trim();
}
function detectRoundNumber(name: string): number | null {
  const m = name.match(/[-–]?\s*(?:dia|round|ronda)\s*(\d+)\s*$/i);
  return m ? parseInt(m[1]) : null;
}

/** Detecta a série/circuito de um torneio */
function detectSeries(t: Tournament): string {
  if (t.circuit) return t.circuit;
  if (t.series)  return t.series;
  if (/PJA/i.test(t.name))  return "PJA Tour";
  if (/^WAGR/i.test(t.name)) return "WAGR Tour";
  if (/^WJGC/i.test(t.name)) return "WJGC";
  if (/^BJGT/i.test(t.name)) return "BJGT";
  return "Outros";
}

/** Funde N torneios (rondas separadas) num único torneio multi-ronda sintético */
function mergeTournamentRounds(rounds: Tournament[]): Tournament {
  // Ordenar por número da ronda, fallback por data
  const sorted = [...rounds].sort((a, b) => {
    const ra = detectRoundNumber(a.name) ?? 99;
    const rb = detectRoundNumber(b.name) ?? 99;
    if (ra !== rb) return ra - rb;
    return (a.date || "").localeCompare(b.date || "");
  });

  const nRounds = sorted.length;
  const byKey = new Map<string, { player: Player; rsArr: RoundScore[] }>();

  sorted.forEach((t, ri) => {
    for (const p of t.players) {
      const key = p.fedCode || ("name:" + p.name.toLowerCase().trim());
      const rs: RoundScore = {
        round: ri + 1,
        gross: numGross(p),
        scores: p.scores || p.roundScores?.[0]?.scores || [],
        pars: p.par || p.roundScores?.[0]?.pars || [],
        si: p.si || p.roundScores?.[0]?.si || [],
        meters: p.meters || p.roundScores?.[0]?.meters || [],
        courseRating: p.courseRating ?? p.roundScores?.[0]?.courseRating,
        slope: p.slope ?? p.roundScores?.[0]?.slope,
        teeName: p.teeName ?? p.roundScores?.[0]?.teeName,
      };
      if (byKey.has(key)) {
        byKey.get(key)!.rsArr.push(rs);
      } else {
        byKey.set(key, { player: p, rsArr: [rs] });
      }
    }
  });

  const refParTotal = sorted[0].players[0]?.parTotal
    || sorted[0].players[0]?.par?.reduce((a, b) => a + b, 0)
    || 72;

  const players: Player[] = [];
  for (const { player, rsArr } of byKey.values()) {
    const grossTotal = rsArr.reduce((s, r) => s + r.gross, 0);
    players.push({
      ...player,
      roundScores: rsArr,
      grossTotal,
      toPar: grossTotal - refParTotal * rsArr.length,
      parTotal: refParTotal,
      scores: rsArr[0]?.scores,
      par:    rsArr[0]?.pars,
      si:     rsArr[0]?.si,
      meters: rsArr[0]?.meters,
    });
  }

  const baseName  = extractBaseName(sorted[0].name);
  const lastDate  = sorted[sorted.length - 1].date;
  // Tcodes mostrados como "10370+10371"
  const tcodeList = sorted.map(t => t.tcode).join("+");

  return {
    ...sorted[0],
    name: baseName,
    date: lastDate,
    rounds: nRounds,
    playerCount: players.length,
    players,
    tcode: tcodeList,
    _sourceFile: sorted[0]._sourceFile,
    _sourceIndex: sorted[0]._sourceIndex,
    _isSynthetic: true,
    _subRounds: sorted,
  } as any;
}

/**
 * Constrói a lista de display: detecta pares "Dia 1/Dia 2" com mesmo ccode+baseName,
 * cria torneios sintéticos e esconde os originais da sidebar.
 */
function buildDisplayList(tournaments: Tournament[]): Tournament[] {
  // Agrupa apenas torneios com sufixo explícito "Dia N / Round N / Ronda N"
  // (com ou sem travessão). Evita fusões acidentais de edições anuais do mesmo torneio.
  const candidates = new Map<string, Tournament[]>();
  for (const t of tournaments) {
    if (detectRoundNumber(t.name) == null) continue;
    const base = extractBaseName(t.name);
    // Usar ccode + baseName como chave para evitar fusão entre torneios homónimos de clubes diferentes
    const key  = `${t.ccode || "?"}_${base.toLowerCase().trim()}`;
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key)!.push(t);
  }

  const hiddenTcodes = new Set<string>();
  const synthetics: Tournament[] = [];
  for (const group of candidates.values()) {
    if (group.length < 2) continue;
    group.forEach(t => hiddenTcodes.add(t.tcode));
    synthetics.push(mergeTournamentRounds(group));
  }

  const standalone = tournaments.filter(t => !hiddenTcodes.has(t.tcode));
  return [...standalone, ...synthetics].sort(
    (a, b) => (b.date || "").localeCompare(a.date || "")
  );
}

function fmtDate(d: string): string {
  if (!d) return "";
  // Suporta YYYY-MM-DD
  const parts = d.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const m = parseInt(parts[1]) - 1;
    return `${parseInt(parts[2])} ${months[m] || parts[1]} ${parts[0]}`;
  }
  return d;
}

/* ─────────────────────────────────────────────
   CÁLCULO SD (replicado do DrivePage)
   ───────────────────────────────────────────── */
const EXP9: Record<number, number> = {
  0:1.2,1:1.7,2:2.2,3:2.8,4:3.3,5:3.8,6:4.3,7:4.8,8:5.4,9:5.9,
  10:6.4,11:6.9,12:7.4,13:8.0,14:8.5,15:9.0,16:9.5,17:10.0,18:10.6,
  19:11.1,20:11.6,21:12.2,22:12.7,23:13.2,24:13.7,25:14.2,26:14.8,
  27:15.3,28:15.8,29:16.3,30:16.8,31:17.4,32:17.9,33:18.4,34:18.9,
  35:19.4,36:20.0,37:20.5,38:21.0,39:21.5,40:22.0,41:22.6,42:23.1,
  43:23.6,44:24.1,45:24.6,46:25.2,47:25.7,48:26.2,49:26.7,50:27.2,
  51:27.8,52:28.3,53:28.8,54:29.3,
};
function expectedSD9(hi: number): number {
  const c = Math.min(54, Math.max(0, hi));
  const lo = Math.floor(c);
  const loV = EXP9[lo] ?? (lo * 0.52 + 1.2);
  const hiV = EXP9[Math.min(lo + 1, 54)] ?? ((lo + 1) * 0.52 + 1.2);
  return loV + (c - lo) * (hiV - loV);
}
function calcAGS(scores: number[], parArr: number[], si: number[], cr: number, slope: number, hcp: number, nholes: number): number {
  if (!scores.length || !parArr.length || !si.length || scores.length < nholes) return scores.reduce((a, b) => a + b, 0);
  const parT = parArr.reduce((a, b) => a + b, 0);
  const ch = Math.round(hcp * (slope / 113) + (cr - parT));
  const siOrder = Array.from({ length: nholes }, (_, i) => i).sort((a, b) => si[a] - si[b]);
  const strokes = new Array(nholes).fill(0);
  let rem = Math.max(0, ch);
  while (rem > 0) { for (const idx of siOrder) { if (rem <= 0) break; strokes[idx]++; rem--; } }
  let adj = 0;
  for (let i = 0; i < nholes; i++) adj += Math.min(scores[i], parArr[i] + 2 + strokes[i]);
  return adj;
}
interface SDResult { sd: number | null; source: "ags" | "raw" | null }
function computeSD(p: Player): SDResult {
  const scores = p.scores || [];
  const parArr = p.par || [];
  const si = p.si || [];
  const nh = p.nholes || scores.length || (parArr.length > 0 ? parArr.length : 18);
  const is9 = nh <= 9;
  const cr = p.courseRating;
  const slope = p.slope;
  const hcp = p.hcpExact;
  const gross = numGross(p);
  if (!cr || !slope || gross == null || isNaN(gross)) return { sd: null, source: null };
  if (hcp != null && si.length >= nh && scores.length >= nh && parArr.length >= nh) {
    const ags = calcAGS(scores, parArr, si, cr, slope, hcp, nh);
    const raw = (113 / slope) * (ags - cr);
    const sd = is9 ? raw + expectedSD9(hcp) : raw;
    return { sd: Math.max(0, Math.round(sd * 10) / 10), source: "ags" };
  }
  if (!is9) {
    const sd = Math.max(0, Math.round((113 / slope) * (gross - cr) * 10) / 10);
    return { sd, source: "raw" };
  }
  if (hcp != null) {
    const raw = (113 / slope) * (gross - cr);
    const sd = Math.max(0, Math.round((raw + expectedSD9(hcp)) * 10) / 10);
    return { sd, source: "raw" };
  }
  return { sd: null, source: null };
}


/* ─────────────────────────────────────────────
   FILTROS DE JOGADORES (ScorecardLB — usa Player[])
   Nota: MultiRoundLeaderboard tem versão própria para MultiRoundRow[]
   ───────────────────────────────────────────── */
interface PlayerFilter {
  name: string; escs: string[]; tees: string[]; club: string;
}
const EMPTY_FILTER: PlayerFilter = { name: "", escs: [], tees: [], club: "" };

function filterPlayers(players: Player[], f: PlayerFilter, escLookup: EscLookup, playersDB: PlayersDB): Player[] {
  let ps = players;
  if (f.name) { const q = f.name.toLowerCase(); ps = ps.filter(p => p.name.toLowerCase().includes(q) || (p.club || "").toLowerCase().includes(q)); }
  if (f.escs.length) ps = ps.filter(p => f.escs.includes(resolveEsc(p, escLookup)));
  if (f.tees.length) ps = ps.filter(p => p.teeName != null && f.tees.includes(p.teeName));
  if (f.club) ps = ps.filter(p => p.club === f.club);
  return ps;
}
function toggleArr(arr: string[], v: string): string[] { return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]; }
function PlayerFilterBar({ players, filter, onChange, escLookup, playersDB, total }: {
  players: Player[]; filter: PlayerFilter; onChange: (f: PlayerFilter) => void;
  escLookup: EscLookup; playersDB: PlayersDB; total: number;
}) {
  const availEsc   = useMemo(() => { const s = new Set<string>(); for (const p of players) { const e = resolveEsc(p, escLookup); if (e) s.add(e); } return [...s].sort((a,b) => a.localeCompare(b)); }, [players, escLookup]);
  const availTees  = useMemo(() => { const s = new Set<string>(); for (const p of players) if (p.teeName) s.add(p.teeName); return [...s].sort(); }, [players]);
  const availClubs = useMemo(() => { const s = new Set<string>(); for (const p of players) if (p.club) s.add(p.club); return [...s].sort((a,b) => a.localeCompare(b,"pt")); }, [players]);
  const isActive = filter.name || filter.escs.length || filter.tees.length || filter.club;
  const filtered = useMemo(() => filterPlayers(players, filter, escLookup, playersDB), [players, filter, escLookup, playersDB]);
  const hasOpts = availClubs.length > 1 || availEsc.length > 1 || availTees.length > 1;
  if (total < 8 && !isActive) return null;
  const chip = (active: boolean, label: React.ReactNode, onClick: () => void, color?: string): React.ReactNode => (
    <button key={String(label)} onClick={onClick} style={{ fontSize:10, padding:"2px 8px", borderRadius:20,
      border:`1px solid ${active?(color||"var(--accent,#2563eb)"):"var(--border)"}`,
      background:active?(color||"var(--accent,#2563eb)"):"var(--bg-hover)", color:active?"#fff":"var(--text-muted)",
      cursor:"pointer", whiteSpace:"nowrap", fontWeight:active?700:500 }}>{label}</button>
  );
  return (
    <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:6, padding:"6px 0 8px", borderBottom:"1px solid var(--border)", marginBottom:8 }}>
      <div style={{ position:"relative", flexShrink:0 }}>
        <span style={{ position:"absolute", left:7, top:"50%", transform:"translateY(-50%)", fontSize:11, color:"var(--text-muted)", pointerEvents:"none" }}>🔍</span>
        <input type="text" placeholder="Nome ou clube…" value={filter.name} onChange={e => onChange({ ...filter, name:e.target.value })}
          style={{ fontSize:11, padding:"3px 8px 3px 22px", borderRadius:6, border:"1px solid var(--border)", background:"var(--bg-card,#fff)", color:"var(--text)", width:140, outline:"none" }} />
      </div>
      {hasOpts && <span style={{ color:"var(--border)", fontSize:11 }}>|</span>}
      {availEsc.length > 1 && availEsc.map(e => { const k = e.toLowerCase().replace(/[\s-]/g,""); const s = ESC_STYLE[k]; return chip(filter.escs.includes(e), e, () => onChange({ ...filter, escs:toggleArr(filter.escs,e) }), s?.bg); })}
      {availTees.length > 1 && availTees.map(t => { const hex = getTeeHex(t); return <React.Fragment key={t}>{chip(filter.tees.includes(t), <span style={{ display:"flex", alignItems:"center", gap:4 }}><span style={{ display:"inline-block", width:8, height:8, borderRadius:2, background:hex, border:"1px solid rgba(0,0,0,.18)" }} />{t}</span>, () => onChange({ ...filter, tees:toggleArr(filter.tees,t) }), hex)}</React.Fragment>; })}
      {availClubs.length > 2 && <select value={filter.club} onChange={e => onChange({ ...filter, club:e.target.value })} style={{ fontSize:11, padding:"3px 6px", borderRadius:6, border:`1px solid ${filter.club?"var(--accent,#2563eb)":"var(--border)"}`, background:"var(--bg-card,#fff)", color:"var(--text)", cursor:"pointer", fontWeight:filter.club?700:400 }}><option value="">Todos os clubes</option>{availClubs.map(c => <option key={c} value={c}>{c}</option>)}</select>}
      {isActive && <><span style={{ fontSize:10, color:"var(--text-muted)", marginLeft:2 }}>{filtered.length} de {total}</span><button onClick={() => onChange(EMPTY_FILTER)} style={{ fontSize:10, padding:"2px 8px", borderRadius:20, border:"1px solid var(--border)", background:"var(--bg-hover)", color:"var(--text-muted)", cursor:"pointer" }}>✕ limpar</button></>}
    </div>
  );
}

/* EscPill, TeeDot, isManuel importados de tournamentPrimitives */

/* PName — alias local */
const PName = ({ name, fedCode, playersDB }: { name: string; fedCode?: string; playersDB: PlayersDB }) =>
  <TournPName name={name} fedCode={fedCode} playersDB={playersDB} />;

/* SortKey — usado pelo ScorecardLB */
type SortKey = "pos" | "name" | "club" | "esc" | "hcp" | "gross" | "toPar" | "tee" | "sd";

/* ─────────────────────────────────────────────
   LEADERBOARD PRINCIPAL (1 ronda)
   Colunas idênticas ao Drive: ESC · FED · CLUBE · HCP · TEE · Tot · ± · SD · 🐦 · Par · ■
   ───────────────────────────────────────────── */
export function ScorecardLB({ tournament, escLookup, playersDB, siLabel, parLabelColSpan = 5 }: { tournament: Tournament; escLookup: EscLookup; playersDB: PlayersDB; siLabel?: string; parLabelColSpan?: number }) {
  const [sortKey, setSortKey] = useState<SortKey>("pos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showScorecard, setShowScorecard] = useState(true);
  const [filter, setFilter] = useState<PlayerFilter>(EMPTY_FILTER);

  // Reset filtros quando muda de torneio
  const [lastTcode, setLastTcode] = useState(tournament.tcode);
  if (tournament.tcode !== lastTcode) { setLastTcode(tournament.tcode); setFilter(EMPTY_FILTER); }

  const rawPlayers = tournament.players.filter(p => p.scores && p.scores.length > 0);
  if (!rawPlayers.length) return <div className="muted ta-center p-16">Scorecards não disponíveis.</div>;

  const refP = rawPlayers[0];
  const par = refP.par || [];
  const nh = par.length;
  const parTotal = par.reduce((a, b) => a + b, 0);
  const si = refP.si || [];

  const byGross = [...rawPlayers].sort((a, b) => numGross(a) - numGross(b));
  let posCounter = 1;
  byGross.forEach((p, i) => {
    if (i > 0 && numGross(p) !== numGross(byGross[i - 1])) posCounter = i + 1;
    (p as any)._pos = posCounter;
  });
  const grosses = byGross.map(p => numGross(p)).filter(g => !isNaN(g));
  const avg = grosses.length ? grosses.reduce((a, b) => a + b, 0) / grosses.length : 0;

  const filteredPlayers = useMemo(
    () => filterPlayers(rawPlayers, filter, escLookup, playersDB),
    [rawPlayers, filter, escLookup, playersDB]
  );

  function handleSort(k: SortKey) {
    if (k === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  const sorted = useMemo(() => [...filteredPlayers].sort((a, b) => {
    let av: any, bv: any;
    switch (sortKey) {
      case "pos":   av = (a as any)._pos ?? 999; bv = (b as any)._pos ?? 999; break;
      case "name":  av = a.name; bv = b.name; break;
      case "club":  av = a.club || ""; bv = b.club || ""; break;
      case "esc":   av = resolveEsc(a, escLookup) || ""; bv = resolveEsc(b, escLookup) || ""; break;
      case "hcp":   av = a.hcpExact ?? 999; bv = b.hcpExact ?? 999; break;
      case "gross": av = numGross(a); bv = numGross(b); break;
      case "toPar": av = numGross(a) - parTotal; bv = numGross(b) - parTotal; break;
      case "tee":   av = a.teeName || ""; bv = b.teeName || ""; break;
      case "sd":    av = computeSD(a).sd ?? 999; bv = computeSD(b).sd ?? 999; break;
      default:      av = 0; bv = 0;
    }
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === "asc" ? av - bv : bv - av;
  }), [filteredPlayers, sortKey, sortDir, parTotal, escLookup]);

  function SortableHdr({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) {
    const active = sortKey === k;
    return (
      <th className={"lb-sortable " + (className || "")}
        onClick={() => handleSort(k)}>
        {children}{active && <span style={{ marginLeft: 2, fontSize: 7 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
      </th>
    );
  }

  const rows: ScorecardRow[] = sorted.map((p, idx) => {
    const gross = numGross(p);
    const dp = (p as any)._pos;
    const showPos = idx === 0 || dp !== (sorted[idx - 1] as any)._pos;
    const medal = dp === 1 ? "🥇" : dp === 2 ? "🥈" : dp === 3 ? "🥉" : null;
    const posDisplay = sortKey === "pos" ? (showPos ? (medal ?? dp) : "") : (medal ?? dp);
    const esc = resolveEsc(p, escLookup) || tournament.escalao || "";
    const { sd, source } = computeSD(p);
    const rowManuel = isManuel(p);
    const rowBg = rowManuel ? "var(--bg-success-subtle)" : undefined;
    const stickyBg = rowManuel ? "var(--bg-manuel-sticky)" : undefined;

    // Birdies / pars / bogeys
    const scores = p.scores || [];
    let birds = 0, pars = 0, bogs = 0;
    for (let i = 0; i < scores.length && i < par.length; i++) {
      const d = scores[i] - par[i];
      if (d <= -1) birds++;
      else if (d === 0) pars++;
      else bogs++;
    }

    return {
      key: p.scoreId || idx,
      pos: posDisplay,
      gross,
      toPar: gross - parTotal,
      scores,
      rowBg,
      stickyBg,
      nameContent: <PName name={p.name} fedCode={p.fedCode} playersDB={playersDB} highlight={isManuel(p)} />,
      prefixCells: <>
        <td className="lb-esc">{esc ? <EscPill esc={esc} /> : <span className="muted">–</span>}</td>
        <td className="lb-fed">{p.fedCode || "–"}</td>
        <td className="lb-club">{p.club || "–"}</td>
        <td className="lb-hcp">{p.hcpExact != null ? p.hcpExact.toFixed(1) : "–"}</td>
        <td className="lb-tee"><TeeDot teeName={p.teeName} /></td>
      </>,
      postScorecardCells: <>
        <td className="lb-sd">
          {sd != null
            ? <SDPill sd={sd} source={source} hcp={p.hcpExact ?? null} />
            : <span className="muted">–</span>}
        </td>
        <td className="lb-bird">{birds || ""}</td>
        <td className="lb-par-stat">{pars || ""}</td>
        <td className="lb-bog">{bogs || ""}</td>
      </>,
    };
  });

  return (
    <ScorecardLeaderboard
      par={par}
      si={si.length >= nh ? si : undefined}
      siLabel={siLabel}
      rows={rows}
      parLabelColSpan={parLabelColSpan}
      postTotalColCount={0}
      showScorecard={showScorecard}
      onToggleScorecard={() => setShowScorecard(v => !v)}
      metaLine={<>
        <span>{rawPlayers.length} jog · Par {parTotal} · {nh}h</span>
        {avg > 0 && <span>· Média {avg.toFixed(1)} ({fmtTP(Math.round(avg - parTotal))})</span>}
        {refP.course && <span>· 📍 {refP.course}</span>}
        {refP.courseRating && <span>· CR {refP.courseRating}</span>}
        {refP.slope && <span>· Slope {refP.slope}</span>}
      </>}
      filterBar={
        <PlayerFilterBar
          players={rawPlayers} filter={filter} onChange={setFilter}
          escLookup={escLookup} playersDB={playersDB} total={rawPlayers.length}
        />
      }
      prefixHeaderCells={<>
        <SortableHdr k="esc"  className="lb-esc">ESC.</SortableHdr>
        <th className="lb-fed">FED</th>
        <SortableHdr k="club" className="lb-club">CLUBE</SortableHdr>
        <SortableHdr k="hcp"  className="lb-hcp">HCP</SortableHdr>
        <SortableHdr k="tee"  className="lb-tee">TEE</SortableHdr>
      </>}
      postScorecardHeaderCells={<>
        <SortableHdr k="sd" className="lb-sd">SD</SortableHdr>
        <th className="lb-bird">🐦</th>
        <th className="lb-par-stat">Par</th>
        <th className="lb-bog">■</th>
      </>}
      activeSortKey={sortKey}
      activeSortDir={sortDir}
      onSortPos={() => handleSort("pos")}
      onSortName={() => handleSort("name")}
    />
  );
}

/* ─────────────────────────────────────────────
   LEADERBOARD ACUMULADO (multi-ronda)
   ───────────────────────────────────────────── */
export function AccumulatedLB({ tournament, nRounds, escLookup, playersDB }: { tournament: Tournament; nRounds: number; escLookup: EscLookup; playersDB: PlayersDB }) {
  const rawPlayers = tournament.players;
  if (!rawPlayers.length) return <div className="muted ta-center p-16">Sem resultados.</div>;

  const complete   = rawPlayers.filter(p => !(p as any)._incomplete);
  const incomplete = rawPlayers.filter(p =>  (p as any)._incomplete);
  const parPerRound = complete[0]?.parTotal ?? 72;

  const rows: MRRow[] = useMemo(() => rawPlayers.map(p => {
    const esc = resolveEsc(p, escLookup) || tournament.escalao || "";
    const roundScores = p.roundScores || [];
    const mappedRounds = roundScores.map(rs => {
      const sdP: Player = { ...p, scores: rs.scores, par: rs.pars, si: rs.si,
        courseRating: rs.courseRating, slope: rs.slope, nholes: rs.pars?.length };
      const { sd } = computeSD(sdP);
      let birdies = 0, pars = 0, bogeys = 0;
      for (let i = 0; i < (rs.scores?.length ?? 0); i++) {
        const d = (rs.scores[i] || 0) - (rs.pars[i] || 0);
        if (d <= -1) birdies++; else if (d === 0) pars++; else bogeys++;
      }
      return {
        gross: rs.gross,
        parPerRound: rs.pars?.reduce((a, b) => a + b, 0) || parPerRound,
        sd, sdSource: null as string | null,
        birdies, pars, bogeys,
      };
    });
    return {
      key: p.scoreId || p.name,
      name: p.name,
      fed: p.fedCode,
      club: p.club || "",
      hcp: p.hcpExact ?? null,
      esc: esc || undefined,
      teeName: p.teeName,
      gross: numGross(p),
      parTotal: parPerRound * nRounds,
      isIncomplete: !!(p as any)._incomplete,
      isHighlighted: isManuel(p),
      rounds: mappedRounds,
    };
  }), [rawPlayers, escLookup, nRounds, parPerRound]);

  const info = `${complete.length} classif.${incomplete.length > 0 ? ` · ${incomplete.length} inc.` : ""} · ${nRounds}R · Par ${parPerRound * nRounds}`;

  return (
    <div>
      <div className="muted fs-11 mb-8 p-0-4px">{info}</div>
      <MultiRoundLeaderboard
        rows={rows}
        nRounds={nRounds}
        playersDB={playersDB}
        showCols={{ esc: true, fed: true, tee: true }}
        sortable
        filterable
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   TOURNAMENT DETAIL VIEW
   ───────────────────────────────────────────── */

/* ─────────────────────────────────────────────
   LINKS BAR — Draw / Classificação agrupados por escalão
   ───────────────────────────────────────────── */
type LinkGroup = { label: string; color: string; items: { name: string; url: string }[] };

function buildLinkGroups(links: Record<string, string>, escalao?: string | null): LinkGroup[] {
  const ESC_COLORS: Record<string, string> = {
    wagr:  "var(--accent, #2563eb)",
    sub16: "#2a5a18",
    sub14: "#5a9a40",
    sub12: "#2563eb",
  };
  const LABELS: Record<string, string> = {
    draw_wagr_r1: "Draw R1", draw_wagr_r2: "Draw R2", draw_wagr_r3: "Draw R3",
    results_wagr: "Classificação",
    draw_sub16_r1: "Draw R1", draw_sub16_r2: "Draw R2", draw_sub16: "Draw R1", results_sub16: "Classificação",
    draw_sub14: "Draw R1", draw_sub14_r2: "Draw R2", results_sub14: "Classificação",
    draw_sub12: "Draw R1", draw_sub12_r2: "Draw R2", results_sub12: "Classificação",
  };
  const GROUP_ORDER = ["wagr", "sub16", "sub14", "sub12"];
  const grouped: Record<string, { name: string; url: string }[]> = {};

  for (const [key, url] of Object.entries(links)) {
    const grp = GROUP_ORDER.find(g => key.includes(g)) || "outro";
    if (!grouped[grp]) grouped[grp] = [];
    grouped[grp].push({ name: LABELS[key] || key, url });
  }

  const GROUPLABELS: Record<string, string> = {
    wagr: "Tour / WAGR", sub16: "Sub 16", sub14: "Sub 14", sub12: "Sub 12", outro: "Outros"
  };

  // If escalao specified, only show relevant group + maybe wagr
  const esc = escalao?.toLowerCase().replace(/\s/g, "");
  const filteredOrder = esc
    ? GROUP_ORDER.filter(g => g === "wagr" || esc.includes(g))
    : GROUP_ORDER;

  return filteredOrder
    .filter(g => grouped[g]?.length)
    .map(g => ({
      label: GROUPLABELS[g] || g,
      color: ESC_COLORS[g] || "var(--text-muted)",
      items: grouped[g],
    }));
}

function LinksBar({ links, escalao }: { links?: Record<string, string>; escalao?: string | null }) {
  if (!links || Object.keys(links).length === 0) return null;
  const groups = buildLinkGroups(links, escalao);
  if (!groups.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
      {groups.map((g, gi) => (
        <React.Fragment key={g.label}>
          {gi > 0 && <span style={{ color: "var(--border)", fontSize: 12 }}>·</span>}
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginRight: 2 }}>{g.label}</span>
          {g.items.map(item => (
            <a key={item.name} href={item.url} target="_blank" rel="noopener noreferrer"
              className="tourn-ext-link"
              style={{ color: g.color, borderColor: g.color }}>
              {item.name} ↗
            </a>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

function TournamentDetail({ tournament, escLookup, playersDB }: { tournament: Tournament; escLookup: EscLookup; playersDB: PlayersDB }) {
  const isMulti = (tournament.rounds || 1) > 1 && tournament.players.some(p => (p.roundScores?.length ?? 0) > 1);
  const nRounds = tournament.rounds || 1;

  // Expanded list: R1, R2, ..., Acumulado
  const expanded = useMemo(() => expandMultiRound(tournament), [tournament]);

  // Tab labels
  const tabs = useMemo(() => {
    if (!isMulti) return ["Scorecard"];
    return expanded.map((t: any) => t._roundLabel || "?");
  }, [isMulti, expanded]);

  const [tab, setTab] = useState(0);
  // Reset tab when tournament changes
  const [lastTcode, setLastTcode] = useState(tournament.tcode);
  if (tournament.tcode !== lastTcode) {
    setLastTcode(tournament.tcode);
    setTab(0);
  }

  const curT = isMulti ? expanded[tab] : tournament;
  const curLabel: string = isMulti ? tabs[tab] : "Scorecard";
  const isAcc = isMulti && (curT as any)._isTotal;

  // Info about tournament
  const refPlayer = tournament.players[0];
  const nholes = refPlayer?.nholes || refPlayer?.par?.length || refPlayer?.roundScores?.[0]?.pars?.length || 18;
  const parTotal = refPlayer?.parTotal || refPlayer?.par?.reduce((a, b) => a + b, 0) || refPlayer?.roundScores?.[0]?.pars.reduce((a, b) => a + b, 0) || 0;

  const tabStyle = (i: number): React.CSSProperties => ({
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: tab === i ? 700 : 500,
    color: tab === i ? "var(--text)" : "var(--text-muted)",
    background: tab === i ? "var(--bg-card,#fff)" : "transparent",
    border: "none",
    borderBottom: tab === i ? "2px solid var(--accent, #2563eb)" : "2px solid transparent",
    cursor: "pointer",
    transition: "all .15s",
  });

  return (
    <div>
      {/* Cabeçalho */}
      <div className="detail-header">
        <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h2 className="detail-title" style={{ margin: 0 }}>{tournament.name}</h2>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {tournament.ccode && (
              <span title="tclub" style={{
                fontFamily: "monospace", fontSize: 10, fontWeight: 600,
                background: "var(--bg-hover,#f1f5f9)", color: "var(--text-muted)",
                border: "1px solid var(--border,#e2e8f0)",
                borderRadius: 4, padding: "1px 6px", letterSpacing: "0.02em",
                userSelect: "all", cursor: "text",
              }}>
                {tournament.ccode}
              </span>
            )}
            {tournament.tcode && (
              <span title="tcode" style={{
                fontFamily: "monospace", fontSize: 10, fontWeight: 700,
                background: "var(--accent,#2563eb)", color: "#fff",
                borderRadius: 4, padding: "1px 6px", letterSpacing: "0.02em",
                userSelect: "all", cursor: "text",
              }}>
                {tournament.tcode}
              </span>
            )}
            {(tournament as any)._isSynthetic
              ? ((tournament as any)._subRounds as Tournament[]).map((sr, i) => (
                  sr.ccode && sr.tcode
                    ? <a key={sr.tcode}
                        href={`https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=${sr.ccode}&tcode=${sr.tcode}`}
                        target="_blank" rel="noopener noreferrer"
                        title={`Abrir Dia ${i + 1} na Federação (tcode ${sr.tcode})`}
                        style={{
                          fontSize: 10, fontWeight: 600,
                          color: "var(--accent,#2563eb)",
                          border: "1px solid var(--accent,#2563eb)",
                          borderRadius: 4, padding: "1px 6px",
                          textDecoration: "none", whiteSpace: "nowrap", lineHeight: 1.6,
                        }}
                      >
                        Dia {i + 1} ↗
                      </a>
                    : null
                ))
              : tournament.ccode && tournament.tcode && (
                  <a
                    href={`https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=${tournament.ccode}&tcode=${tournament.tcode}`}
                    target="_blank" rel="noopener noreferrer"
                    title="Abrir classificação na Federação"
                    style={{
                      fontSize: 10, fontWeight: 600,
                      color: "var(--accent,#2563eb)",
                      border: "1px solid var(--accent,#2563eb)",
                      borderRadius: 4, padding: "1px 6px",
                      textDecoration: "none", whiteSpace: "nowrap", lineHeight: 1.6,
                    }}
                  >
                    Link Federação ↗
                  </a>
                )
            }
          </div>
        </div>
        <div className="detail-sub">
          {tournament.campo && <span className="muted">📍 {tournament.campo}</span>}
          <span className="muted" style={{ marginLeft: 8 }}>{fmtDate(tournament.date)}</span>
          <span className="chip" style={{ marginLeft: 8 }}>
            {tournament.playerCount} jog · {nRounds}R · {nholes}h · Par {parTotal}
          </span>

        </div>
        <LinksBar links={tournament.links} escalao={tournament.escalao} />
      </div>

      {/* Tabs */}
      {isMulti && (
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 12, gap: 2, overflowX: "auto" }}>
          {tabs.map((label: string, i: number) => (
            <button key={i} style={tabStyle(i)} onClick={() => setTab(i)}>{label}</button>
          ))}
        </div>
      )}

      {/* Conteúdo */}
      {isAcc
        ? <AccumulatedLB tournament={curT} nRounds={nRounds} escLookup={escLookup} playersDB={playersDB} />
        : <ScorecardLB tournament={curT} escLookup={escLookup} playersDB={playersDB} />
      }
    </div>
  );
}

/* ─────────────────────────────────────────────
   RANKING PJA
   Tabela simples de ranking: # · Jogador · Esc · Clube · Voltas · Pts
   Filtros: escalão + pesquisa nome
   Pontos: par=25, −1 por pancada acima, +1 abaixo (mín 0); GF×1.5
   Top 14 voltas por ano contam para o total.
   ───────────────────────────────────────────── */

function pjaPts(toPar: number, gf: boolean): number {
  return Math.max(0, 25 - toPar) * (gf ? 1.5 : 1);
}
function fmtPts(pts: number): string {
  return pts % 1 === 0 ? String(pts) : pts.toFixed(1);
}
function isGFTournament(t: Tournament): boolean {
  return /dunas/i.test(t.name) || /grande\s*final/i.test(t.name);
}

interface PJARound {
  roundKey: string;
  label: string;
  date: string;
}
interface PJATournCol {
  tournKey: string;
  name: string;
  date: string;
  campo: string;
  isGF: boolean;
  rounds: PJARound[];
  colSpan: number;
}
interface PJARoundResult {
  toPar: number;
  pts: number;
  inTop14: boolean;
}
interface PJAPRow {
  key: string;
  name: string;
  fedCode?: string;
  club: string;
  escalao: string;
  sex: string;
  hcp: number | null;
  results: Map<string, PJARoundResult>;
  allRounds: { roundKey: string; pts: number }[];
  total: number;
  voltas: number;
  eligible: boolean;
}

function PJARankingView({
  pjaList, playersDB, loading,
}: {
  pjaList: Tournament[];
  playersDB: PlayersDB;
  loading: boolean;
}) {
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const t of pjaList) if (t.date) s.add(t.date.substring(0, 4));
    return [...s].sort().reverse();
  }, [pjaList]);

  const [activeYear, setActiveYear] = useState<string>("");
  const year = activeYear || years[0] || "";

  const [sortKey, setSortKey] = useState("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterEsc, setFilterEsc] = useState<string[]>([]);
  const [filterName, setFilterName] = useState("");

  function handleSort(k: string) {
    if (k === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "name" || k === "club" || k === "escalao" ? "asc" : "desc"); }
  }
  function toggleEsc(e: string) {
    setFilterEsc(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }

  const yearTournaments: Tournament[] = useMemo(() =>
    pjaList
      .filter(t => (t.date || "").startsWith(year))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
  , [pjaList, year]);

  const tournCols: PJATournCol[] = useMemo(() => {
    const cols: PJATournCol[] = [];
    for (const t of yearTournaments) {
      const isSynth = !!(t as any)._isSynthetic;
      const subRounds: Tournament[] = (t as any)._subRounds || [];
      const isGF = isGFTournament(t);
      const tournKey = t.tcode + "_" + t.date;

      if (isSynth && subRounds.length > 1) {
        const rounds: PJARound[] = subRounds.map((sr, i) => ({
          roundKey: tournKey + "_r" + (i + 1),
          label: "R" + (i + 1),
          date: sr.date || t.date,
        }));
        cols.push({ tournKey, name: t.name, date: t.date || "", campo: t.campo || "", isGF, rounds, colSpan: rounds.length * 2 });
      } else {
        cols.push({ tournKey, name: t.name, date: t.date || "", campo: t.campo || "", isGF, rounds: [{ roundKey: tournKey + "_r1", label: "", date: t.date || "" }], colSpan: 2 });
      }
    }
    return cols;
  }, [yearTournaments]);

  const allRows: PJAPRow[] = useMemo(() => {
    const map = new Map<string, PJAPRow>();

    for (const t of yearTournaments) {
      const isSynth = !!(t as any)._isSynthetic;
      const subRounds: Tournament[] = (t as any)._subRounds || [];
      const isGF = isGFTournament(t);
      const tournKey = t.tcode + "_" + t.date;

      for (const p of t.players) {
        const playerKey = p.fedCode || ("name:" + p.name.toLowerCase().trim());

        if (!map.has(playerKey)) {
          const db = p.fedCode ? playersDB[p.fedCode] : null;
          const clubRaw = db?.club;
          const club = clubRaw
            ? (typeof clubRaw === "object" ? (clubRaw as any).short || "" : String(clubRaw))
            : (p.club || "");
          map.set(playerKey, {
            key: playerKey, name: p.name, fedCode: p.fedCode,
            club, escalao: db?.escalao || (p as any).escalao || "",
            sex: db?.sex || "", hcp: p.hcpExact ?? null,
            results: new Map(), allRounds: [], total: 0, voltas: 0, eligible: false,
          });
        }
        const row = map.get(playerKey)!;
        if (p.hcpExact != null) row.hcp = p.hcpExact;

        if (isSynth && subRounds.length > 1 && p.roundScores && p.roundScores.length > 0) {
          p.roundScores.forEach((rs: any, i: number) => {
            const parR = (rs.pars || []).reduce((a: number, b: number) => a + b, 0);
            if (!parR || !rs.gross) return;
            const tp = rs.gross - parR;
            const pts = pjaPts(tp, isGF);
            const roundKey = tournKey + "_r" + (i + 1);
            row.results.set(roundKey, { toPar: tp, pts, inTop14: false });
            row.allRounds.push({ roundKey, pts });
          });
        } else {
          const tp = typeof p.toPar === "string" ? parseInt(p.toPar) : p.toPar as number;
          const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal as number;
          if (tp == null || isNaN(tp) || gross == null || isNaN(gross) || gross >= 900) continue;
          const pts = pjaPts(tp, isGF);
          const roundKey = tournKey + "_r1";
          row.results.set(roundKey, { toPar: tp, pts, inTop14: false });
          row.allRounds.push({ roundKey, pts });
        }
      }
    }

    for (const row of map.values()) {
      const sorted = [...row.allRounds].sort((a, b) => b.pts - a.pts);
      const top14Keys = new Set(sorted.slice(0, 14).map(r => r.roundKey));
      for (const [rk, res] of row.results.entries()) {
        res.inTop14 = top14Keys.has(rk);
      }
      row.total = sorted.slice(0, 14).reduce((s, r) => s + r.pts, 0);
      row.voltas = row.allRounds.length;
      row.eligible = row.voltas >= 14;
    }

    return [...map.values()].filter(r => r.voltas > 0);
  }, [yearTournaments, playersDB]);

  const availEscs = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) if (r.escalao) s.add(r.escalao);
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [allRows]);

  const sortedRows = useMemo(() => {
    let rows = allRows;
    if (filterEsc.length) rows = rows.filter(r => filterEsc.includes(r.escalao));
    if (filterName.trim()) {
      const q = filterName.trim().toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.club.toLowerCase().includes(q));
    }
    const INF = 99999;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "name")    return mult * a.name.localeCompare(b.name, "pt");
      if (sortKey === "club")    return mult * a.club.localeCompare(b.club, "pt");
      if (sortKey === "escalao") return mult * a.escalao.localeCompare(b.escalao, "pt");
      if (sortKey === "voltas")  return mult * (a.voltas - b.voltas);
      if (sortKey.startsWith("toPar_")) {
        const rk = sortKey.slice(6);
        return mult * ((a.results.get(rk)?.toPar ?? INF) - (b.results.get(rk)?.toPar ?? INF));
      }
      if (sortKey.startsWith("pts_")) {
        const rk = sortKey.slice(4);
        return mult * ((a.results.get(rk)?.pts ?? -1) - (b.results.get(rk)?.pts ?? -1));
      }
      return mult * (a.total - b.total);
    });
  }, [allRows, filterEsc, filterName, sortKey, sortDir]);

  const chip = (active: boolean, label: React.ReactNode, onClick: () => void, color?: string) => (
    <button key={String(label)} onClick={onClick} style={{
      fontSize: 10, padding: "2px 8px", borderRadius: 20,
      border: `1px solid ${active ? (color || "var(--accent,#2563eb)") : "var(--border)"}`,
      background: active ? (color || "var(--accent,#2563eb)") : "var(--bg-hover)",
      color: active ? "#fff" : "var(--text-muted)",
      cursor: "pointer", whiteSpace: "nowrap", fontWeight: active ? 700 : 500,
    }}>{label}</button>
  );

  if (loading && pjaList.length === 0) return <div className="muted fs-11" style={{ padding: 24 }}>A carregar…</div>;
  if (!year) return <div className="muted fs-11" style={{ padding: 24 }}>Sem torneios PJA.</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px 10px", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>Ranking PJA</span>
        <div style={{ display: "flex", gap: 6 }}>
          {years.map(yr => (
            <button key={yr}
              className={"tourn-tab tourn-tab-sm" + (yr === year ? " active" : "")}
              onClick={() => { setActiveYear(yr); setFilterEsc([]); setFilterName(""); setSortKey("total"); setSortDir("desc"); }}
              style={yr === year ? {} : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}>
              {yr}
            </button>
          ))}
        </div>
        <span className="muted fs-11" style={{ marginLeft: 4 }}>Par=25pts · top 14 rondas · GF×1,5</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--text-muted)", pointerEvents: "none" }}>🔍</span>
          <input type="text" placeholder="Nome ou clube…" value={filterName}
            onChange={e => setFilterName(e.target.value)}
            style={{ fontSize: 11, padding: "3px 8px 3px 22px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card,#fff)", color: "var(--text)", width: 150, outline: "none" }} />
        </div>
        {availEscs.length > 1 && <span style={{ color: "var(--border)" }}>|</span>}
        {availEscs.map(e => {
          const k = e.toLowerCase().replace(/[\s-]/g, "");
          const s = ESC_STYLE[k];
          return chip(filterEsc.includes(e), e, () => toggleEsc(e), s?.bg);
        })}
        {(filterEsc.length > 0 || filterName) && <>
          <span className="muted fs-10">{sortedRows.length} de {allRows.length}</span>
          {chip(false, "✕ limpar", () => { setFilterEsc([]); setFilterName(""); })}
        </>}
        <span className="chip" style={{ marginLeft: "auto" }}>{allRows.length} jogadores · {tournCols.length} torneios</span>
      </div>

      {sortedRows.length === 0
        ? <div className="muted fs-11" style={{ padding: 16 }}>Sem dados para {year}.</div>
        : (
          <CrossSeasonTable
            identityHeaders={<>
              <CSortTh k="rank"    s={sortKey} d={sortDir} on={handleSort} className="cs-pos sticky-col-0">#</CSortTh>
              <CSortTh k="name"    s={sortKey} d={sortDir} on={handleSort} className="cs-name sticky-col-1">Jogador</CSortTh>
              <CSortTh k="escalao" s={sortKey} d={sortDir} on={handleSort} className="cs-esc">Esc.</CSortTh>
              <CSortTh k="club"    s={sortKey} d={sortDir} on={handleSort} className="cs-club cs-id-end">Clube</CSortTh>
            </>}
            groups={tournCols.map(tc => ({
              key: tc.tournKey,
              headerTh: (
                <th key={tc.tournKey} colSpan={tc.colSpan} className="cs-grp" style={{ lineHeight: 1.3 }}>
                  <div className="fw-800" style={{ fontSize: 12 }}>
                    {tc.name}
                    {tc.isGF && <span style={{ marginLeft: 5, fontSize: 9, color: "#f59e0b", fontWeight: 800 }}>★ GF×1.5</span>}
                  </div>
                  <div className="c-muted-fs10-fw5">
                    {fmtDate(tc.date)}{tc.campo ? " · " + tc.campo : ""}{tc.rounds.length > 1 ? ` · ${tc.rounds.length}R` : ""}
                  </div>
                </th>
              ),
              subHeaderThs: (
                <>
                  {tc.rounds.map(r => (
                    <React.Fragment key={r.roundKey}>
                      <CSortTh k={"toPar_" + r.roundKey} s={sortKey} d={sortDir} on={handleSort} className="cs-t-topar cs-grp">
                        {r.label ? <span style={{ fontSize: 10, fontWeight: 800, color: "var(--color-good-dark)" }}>{r.label}</span> : "±Par"}
                      </CSortTh>
                      <CSortTh k={"pts_" + r.roundKey} s={sortKey} d={sortDir} on={handleSort} className="cs-t-gross cs-col" style={{ color: "var(--color-warn-dark)", fontWeight: 700 }}>Pts</CSortTh>
                    </React.Fragment>
                  ))}
                </>
              ),
            }))}
            summaryGroupTh={<th className="cs-grp" colSpan={2} style={{ fontWeight: 800, fontSize: 12 }}>Ranking</th>}
            summarySubHeaders={<>
              <CSortTh k="voltas" s={sortKey} d={sortDir} on={handleSort} className="cs-s-games cs-grp">Voltas</CSortTh>
              <CSortTh k="total"  s={sortKey} d={sortDir} on={handleSort} className="cs-s-pts cs-col" style={{ color: "var(--color-warn-dark)", fontWeight: 800 }}>Total</CSortTh>
            </>}
          >
            {sortedRows.map((row, idx) => {
              const escCls = row.escalao ? "p p-sm p-" + row.escalao.toLowerCase().replace(/[\s-]/g, "") : "";
              return (
                <tr key={row.key} className={isManuel(row) ? "row-manuel" : undefined}>
                  <td className="cs-pos sticky-col-0">{idx + 1}</td>
                  <td className="cs-name sticky-col-1">
                    <PName name={row.name} fedCode={row.fedCode} playersDB={playersDB} />
                    {row.sex === "F" && <span style={{ marginLeft: 4, fontSize: 9, color: "#e879f9" }}>♀</span>}
                  </td>
                  <td className="cs-esc">
                    {row.escalao ? <span className={escCls + " fs-9"}>{row.escalao}</span> : <span className="muted">–</span>}
                  </td>
                  <td className="cs-club cs-id-end">{row.club || "–"}</td>

                  {tournCols.map(tc => {
                    const hasAny = tc.rounds.some(r => row.results.has(r.roundKey));
                    if (!hasAny) return <td key={tc.tournKey} colSpan={tc.colSpan} className="cs-grp" />;
                    return (
                      <React.Fragment key={tc.tournKey}>
                        {tc.rounds.map(r => {
                          const res = row.results.get(r.roundKey);
                          if (!res) return (
                            <React.Fragment key={r.roundKey}>
                              <td className="cs-t-topar cs-grp" />
                              <td className="cs-t-gross cs-col" />
                            </React.Fragment>
                          );
                          const tpStr = fmtTP(res.toPar);
                          const tpCol = res.toPar < 0 ? "var(--color-good)" : res.toPar === 0 ? "var(--color-ok,#2563eb)" : "var(--color-bad)";
                          return (
                            <React.Fragment key={r.roundKey}>
                              <td className="cs-t-topar cs-grp" style={{ color: tpCol }}>{tpStr}</td>
                              <td className="cs-t-gross cs-col" style={{ color: "var(--color-warn-dark)" }}>{fmtPts(res.pts)}</td>
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}

                  <td className="cs-s-games cs-grp">
                    {row.voltas}
                    {!row.eligible && <span title="< 14 rondas — não elegível para GF" style={{ marginLeft: 3, fontSize: 9, color: "#f59e0b" }}>⚠</span>}
                  </td>
                  <td className="cs-s-pts cs-col" style={{ fontWeight: 800, color: "var(--color-warn-dark)", fontVariantNumeric: "tabular-nums" }}>
                    {fmtPts(row.total)}
                  </td>
                </tr>
              );
            })}
          </CrossSeasonTable>
        )
      }
    </div>
  );
}


/* ─────────────────────────────────────────────
   MAIN CONTENT
   ───────────────────────────────────────────── */
function Content() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [fileMeta, setFileMeta] = useState<FileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("A carregar ficheiros...");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarMode, setSidebarMode] = useState<"month" | "circuit" | "pja-ranking">("month");
  const [filterManuel, setFilterManuel] = useState(false);
  const [escLookup, setEscLookup] = useState<EscLookup>(new Map());
  const [playersDB, setPlayersDB] = useState<PlayersDB>({});

  const { melhorias } = useAppContext();

  const tcodePills = useMemo<Record<string, TournPill>>(() => {
    const pills: Record<string, TournPill> = {};
    for (const playerData of Object.values(melhorias)) {
      if (typeof playerData !== "object" || !playerData) continue;
      for (const entry of Object.values(playerData as Record<string, any>)) {
        if (typeof entry !== "object" || !entry || Array.isArray(entry) || !entry.pill) continue;
        // Extrair TODOS os tcodes dos links desta entrada (ex: classificacao_d1 + classificacao_d2)
        for (const v of Object.values((entry as any).links || {})) {
          const match = String(v).match(/tcode=(\d+)/);
          if (match) pills[match[1]] = (entry as any).pill as TournPill;
        }
      }
    }
    return pills;
  }, [melhorias]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [pdbResp, linksResp] = await Promise.all([
          fetch("/data/players.json").catch(() => null),
          fetch("/data/tournament-links.json").catch(() => null),
        ]);
        if (pdbResp?.ok) {
          const pdb: PlayersDB = await pdbResp.json().catch(() => ({}));
          if (alive) { setEscLookup(buildEscLookup(pdb)); setPlayersDB(pdb); }
        }
        let externalLinks: Record<string, Record<string, string>> = {};
        if (linksResp?.ok) {
          externalLinks = await linksResp.json().catch(() => ({}));
        }

        const allT: Tournament[] = [];
        const meta: FileMeta[] = [];

        for (let i = 0; i < DATA_MAX; i++) {
          if (!alive) return;
          const url = dataUrl(i);
          let resp: Response;
          try { resp = await fetch(url); } catch { break; }
          if (!resp.ok) break;  // 404 → parar

          let d: DriveData;
          try { d = await resp.json(); }
          catch { break; }  // resposta não é JSON (ex: HTML de erro) → parar
          const normalised = (d.tournaments || []).map(t => {
            const extLinks = externalLinks[String(t.tcode)];
            return {
              ...t,
              _sourceFile: url,
              _sourceIndex: i,
              players: t.players.map(normalizePlayer),
              ...(extLinks ? { links: { ...(t.links || {}), ...extLinks } } : {}),
            };
          });
          allT.push(...normalised);
          meta.push({
            file: url, index: i,
            lastUpdated: d.lastUpdated,
            source: d.source,
            count: normalised.length,
          });
          if (alive) {
            setTournaments([...allT]);
            setFileMeta([...meta]);
            setLoadingMsg(`A carregar... ${meta.length} ficheiro(s) · ${allT.length} torneios`);
          }
        }

        if (alive) {
          if (allT.length === 0) {
            setError(`Ficheiro não encontrado: ${dataUrl(0)}`);
          }
          setLoading(false);
        }
      } catch {
        // erro inesperado — não mostrar stack trace técnico
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, []);

  const displayList = useMemo(() => buildDisplayList(tournaments), [tournaments]);
  const cur = displayList[selected];

  // Agrupamento por mês
  const { groups: monthGroups, groupKeys: monthKeys } = useMemo(() => {
    const g: Record<string, Tournament[]> = {};
    for (const t of displayList) {
      if (/PJA/i.test(t.name)) continue;
      const tcodes = t.tcode?.split("+") || [];
      if (tcodes.some(tc => TOURN_PILLS[tc] === "PJA")) continue;
      if (filterManuel && !t.players.some(p => p.fedCode === MANUEL_FED)) continue;
      const key = t.date ? t.date.substring(0, 7) : "?";
      if (!g[key]) g[key] = [];
      g[key].push(t);
    }
    return { groups: g, groupKeys: Object.keys(g).sort().reverse() };
  }, [displayList, filterManuel]);

  // Lista apenas PJA (para o modo circuito)
  const pjaList = useMemo(
    () => displayList.filter(t => {
      if (/PJA/i.test(t.name)) return true;
      // torneios com tcode definido como PJA no mapa estático
      const tcodes = t.tcode?.split("+") || [];
      return tcodes.some(tc => TOURN_PILLS[tc] === "PJA");
    }),
    [displayList]
  );

  const pjaByYear = useMemo(() => {
    const byYear: Record<string, Tournament[]> = {};
    for (const t of pjaList) {
      const yr = t.date ? t.date.substring(0, 4) : "?";
      if (!byYear[yr]) byYear[yr] = [];
      byYear[yr].push(t);
    }
    const years = Object.keys(byYear).sort().reverse();
    return { byYear, years };
  }, [pjaList]);

  function monthLabel(key: string): string {
    if (key === "?") return "Data desconhecida";
    const [yr, mo] = key.split("-");
    const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return `${months[parseInt(mo) - 1] || mo} ${yr}`;
  }

  function renderSidebarItem(t: Tournament) {
    const idx = displayList.indexOf(t);
    const isSynth = !!(t as any)._isSynthetic;
    const subRounds: Tournament[] = (t as any)._subRounds || [];
    const nR = t.rounds || 1;
    const nh = t.players[0]?.nholes
      || t.players[0]?.par?.length
      || t.players[0]?.roundScores?.[0]?.pars?.length
      || 18;
    const manuelPlayed = t.players.some(p => p.fedCode === MANUEL_FED);
    return (
      <button key={(t as any)._isSynthetic ? "synth_" + t.tcode : t.tcode + "_" + t.date}
        className={`course-item ${selected === idx ? "active" : ""}`}
        onClick={() => setSelected(idx)}>

        {/* Linha 1: título + badges fixos à direita */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 3 }}>
          <span className="course-item-name" style={{ flex: 1, minWidth: 0 }}>{t.name}</span>
          <div style={{ display: "flex", gap: 2, flexShrink: 0, alignItems: "center" }}>
            {isSynth ? (
              <>
                <span title="Torneio agrupado" style={{
                  fontFamily: "monospace", fontSize: 10, fontWeight: 700,
                  background: "#7c3aed", color: "#fff", borderRadius: 3, padding: "0 4px",
                }}>{nR}R ⛳</span>
                {subRounds.map((sr, i) => (
                  <span key={sr.tcode} title={`Dia ${i+1}: ${sr.tcode}`} style={{
                    fontFamily: "monospace", fontSize: 10, fontWeight: 600,
                    background: "var(--accent,#2563eb)", color: "#fff",
                    borderRadius: 3, padding: "0 4px", opacity: selected === idx ? 1 : 0.7,
                  }}>{sr.tcode}</span>
                ))}
              </>
            ) : (
              <>
                {t.ccode && (
                  <span title="ccode" style={{
                    fontFamily: "monospace", fontSize: 10, fontWeight: 600,
                    background: "rgba(0,0,0,0.08)", color: "var(--text-muted)",
                    borderRadius: 3, padding: "0 4px",
                  }}>{t.ccode}</span>
                )}
                {t.tcode && (
                  <span title="tcode" style={{
                    fontFamily: "monospace", fontSize: 10, fontWeight: 700,
                    background: "var(--accent,#2563eb)", color: "#fff",
                    borderRadius: 3, padding: "0 4px",
                    opacity: selected === idx ? 1 : 0.75,
                  }}>{t.tcode}</span>
                )}
                {t.ccode && t.tcode && (
                  <span
                    title="Abrir na Federação"
                    onClick={e => { e.stopPropagation(); window.open(`https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=${t.ccode}&tcode=${t.tcode}`, "_blank"); }}
                    style={{
                      fontSize: 10, fontWeight: 600, cursor: "pointer",
                      color: "var(--accent,#2563eb)", border: "1px solid var(--accent,#2563eb)",
                      borderRadius: 3, padding: "0 4px", lineHeight: 1.6,
                    }}
                  >↗</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Linha 2: campo · jog · R · h */}
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>
          {t.campo && <span>{t.campo} · </span>}
          <span>{t.playerCount} jog · {nR}R · {nh}h</span>
        </div>

        {/* Linha 3: escalão + pills + Manuel */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {t.escalao && <EscPill esc={t.escalao} />}
          <TournPillBadge tcode={t.tcode} dynamicPills={tcodePills} />
          {manuelPlayed && (
            <span title="Manuel participou neste torneio" style={{
              fontSize: 10, fontWeight: 700,
              background: "var(--bg-success-subtle)", color: "var(--color-good-dark)",
              borderRadius: 6, padding: "2px 8px",
              border: "1px solid var(--color-good)",
            }}>★ Manuel</span>
          )}
        </div>

        {!isSynth && t._sourceIndex !== undefined && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, opacity: 0.6 }}>
            📄 pull-torneios{String(t._sourceIndex).padStart(DATA_DIGITS, "0")}.json
          </div>
        )}
      </button>
    );
  }

  const lastUpdated = fileMeta.length > 0 ? fileMeta[fileMeta.length - 1].lastUpdated : undefined;

  return (
    <div className="tourn-layout">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)}
            title={sidebarOpen ? "Fechar painel" : "Abrir painel"}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <span className="toolbar-title">🏌️ Torneios</span>
          {!loading && (
            <>
              <div className="toolbar-sep" />
              <div className="escalao-pills">
                <button
                  className={"tourn-tab tourn-tab-sm" + (sidebarMode === "month" ? " active" : "")}
                  onClick={() => setSidebarMode("month")}
                  style={sidebarMode === "month" ? {} : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}>
                  Por data
                </button>
                <button
                  className={"tourn-tab tourn-tab-sm" + (sidebarMode === "circuit" ? " active" : "")}
                  onClick={() => { setSidebarMode("circuit"); setFilterManuel(false); }}
                  style={sidebarMode === "circuit" ? {} : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}>
                  🏆 PJA Tour
                </button>
                <button
                  className={"tourn-tab tourn-tab-sm" + (sidebarMode === "pja-ranking" ? " active" : "")}
                  onClick={() => { setSidebarMode("pja-ranking"); setFilterManuel(false); }}
                  style={sidebarMode === "pja-ranking" ? {} : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)" }}>
                  📊 Ranking
                </button>
                {sidebarMode === "month" && (
                  <button
                    className={"tourn-tab tourn-tab-sm" + (filterManuel ? " active" : "")}
                    onClick={() => setFilterManuel(v => !v)}
                    style={filterManuel ? { background: "var(--bg-success-subtle)", borderColor: "var(--color-good)", color: "var(--color-good-dark)", whiteSpace: "nowrap" } : { background: "var(--bg-muted)", color: "var(--text-2)", borderColor: "var(--border)", whiteSpace: "nowrap" }}>
                    ★ Manuel
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        <div className="toolbar-right">
          {loading
            ? <span className="muted fs-11" style={{ fontStyle: "italic" }}>{loadingMsg}</span>
            : <>
                <span className="chip">{displayList.length} torneios</span>
                <span className="chip" style={{ marginLeft: 4, background: "var(--bg-hover)" }}>
                  {fileMeta.length} ficheiro{fileMeta.length !== 1 ? "s" : ""}
                </span>
                {lastUpdated && <span className="muted fs-11" style={{ marginLeft: 8 }}>atualizado {lastUpdated}</span>}
              </>
          }
        </div>
      </div>

      {error && (
        <div style={{ padding: "16px 20px", color: "var(--danger)", fontWeight: 600, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Master-detail (modos "month" e "circuit") */}
      {sidebarMode !== "pja-ranking" && (
      <div className="master-detail">
        {/* Sidebar */}
        <div className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
          {loading && displayList.length === 0 && (
            <div className="muted fs-11" style={{ padding: "12px 16px", fontStyle: "italic" }}>
              A carregar...
            </div>
          )}

          {sidebarMode === "month"
            ? monthKeys.map(gk => (
                <React.Fragment key={gk}>
                  <div className="sidebar-section-title-dark">{monthLabel(gk)}</div>
                  {monthGroups[gk].map(t => renderSidebarItem(t))}
                </React.Fragment>
              ))
            : pjaByYear.years.length === 0
              ? <div className="muted fs-11" style={{ padding: "12px 16px", fontStyle: "italic" }}>Sem torneios PJA</div>
              : pjaByYear.years.map(yr => (
                  <React.Fragment key={yr}>
                    <div className="sidebar-section-title-dark">🏆 PJA Tour {yr}</div>
                    {pjaByYear.byYear[yr].map(t => renderSidebarItem(t))}
                  </React.Fragment>
                ))
          }
        </div>

        {/* Detail */}
        <div className="course-detail">
          {cur
            ? <TournamentDetail tournament={cur} escLookup={escLookup} playersDB={playersDB} />
            : !loading && <div className="center-msg muted">Selecciona um torneio</div>
          }
        </div>
      </div>
      )}

      {/* Ranking PJA */}
      {sidebarMode === "pja-ranking" && (
        <div style={{ flex: 1, overflow: "auto" }}>
          <PJARankingView pjaList={pjaList} playersDB={playersDB} loading={loading} />
        </div>
      )}
    </div>
  );
}

export default function TorneiosAnalisePage() {
  return <Content />;
}
