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
import { scClass, SC, sdClassByHcp } from "../utils/scoreDisplay";
import { getTeeHex, teeBorder } from "../utils/teeColors";

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
};

const PILL_STYLE: Record<TournPill, { bg: string; color: string; label: string }> = {
  PJA:      { bg: "#1e3a5f",           color: "#fff",     label: "PJA"         },
  REGIONAL: { bg: "var(--bg-warn-strong)", color: "var(--color-warn-dark)", label: "REGIONAL" },
  NACIONAL: { bg: "var(--bg-success-strong)", color: "var(--color-good-dark)", label: "🇵🇹 NACIONAL" },
  INTL:     { bg: "var(--bg-info)",    color: "var(--color-info)",  label: "🌍 INTL"   },
};

function TournPillBadge({ tcode, dynamicPills }: { tcode?: string; dynamicPills?: Record<string, TournPill> }) {
  if (!tcode) return null;
  const tcodes = tcode.split("+");
  const pill = tcodes.map(tc => TOURN_PILLS[tc] || dynamicPills?.[tc]).find(Boolean);
  if (!pill) return null;
  const s = PILL_STYLE[pill];
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, borderRadius: 20, padding: "1px 6px",
      background: s.bg, color: s.color, whiteSpace: "nowrap",
    }}>{s.label}</span>
  );
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

/* fedCode → { escalao, club, name, hcp, sex } */
interface PlayerInfo { escalao?: string; club?: { short?: string }; name?: string; hcpExact?: number; sex?: string }
type PlayersDB = Record<string, PlayerInfo>;
type EscLookup = Map<string, string>; // fedCode → escalão normalizado

const MANUEL_FED = "52884";

function buildEscLookup(playersDB: PlayersDB): EscLookup {
  const m = new Map<string, string>();
  for (const [fed, info] of Object.entries(playersDB)) {
    if (info.escalao) {
      // Normaliza: "Sub-12" → "Sub 12"
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
interface RoundScore {
  round: number; gross: number;
  scores: number[]; pars: number[]; si: number[]; meters: number[];
  courseRating?: number; slope?: number; teeName?: string; teeColorId?: number;
}
interface Player {
  scoreId: string; pos: number | string | null; name: string; club: string;
  grossTotal: number | string | null; toPar: number | string | null;
  fedCode?: string; hcpExact?: number; hcpPlay?: number;
  course?: string; courseRating?: number; slope?: number; teeName?: string;
  nholes?: number; parTotal?: number;
  scores?: number[]; par?: number[]; si?: number[]; meters?: number[];
  roundScores?: RoundScore[];
}
interface Tournament {
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
function normalizePlayer(p: any): Player {
  const r1: RoundScore | undefined = p.roundScores?.[0];
  return {
    ...p,
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
function expandMultiRound(t: Tournament): Tournament[] {
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

function fmtTP(v: number | null): string {
  if (v == null) return "–";
  if (v === 0) return "E";
  return v > 0 ? `+${v}` : `${v}`;
}

/* ─────────────────────────────────────────────
   AGRUPAMENTO AUTOMÁTICO DE RONDAS (Dia 1 / Dia 2 → torneio sintético)
   ───────────────────────────────────────────── */

/** "PJA TOUR Vale Pisão - Dia 1" → "PJA TOUR Vale Pisão" */
function extractBaseName(name: string): string {
  return name.replace(/\s*[-–]\s*(?:dia|round|ronda|r)\s*\d+\s*$/i, "").trim();
}
function detectRoundNumber(name: string): number | null {
  const m = name.match(/[-–]\s*(?:dia|round|ronda|r)\s*(\d+)\s*$/i);
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
  // 1. Agrupar candidatos a fusão
  const candidates = new Map<string, Tournament[]>();
  for (const t of tournaments) {
    if (detectRoundNumber(t.name) == null) continue;
    const base = extractBaseName(t.name);
    const key  = `${t.ccode || "?"}_${base.toLowerCase()}`;
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key)!.push(t);
  }

  // 2. Construir sintéticos (apenas grupos com ≥2 rondas)
  const hiddenTcodes = new Set<string>();
  const synthetics: Tournament[] = [];
  for (const group of candidates.values()) {
    if (group.length < 2) continue;
    group.forEach(t => hiddenTcodes.add(t.tcode));
    synthetics.push(mergeTournamentRounds(group));
  }

  // 3. Lista final: standalone + sintéticos, por data desc
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
function sdClass(sd: number, hcp: number | null | undefined): string {
  if (hcp == null) return "";
  if (sd <= hcp) return "sd-excellent";
  if (sd <= hcp + 3) return "sd-good";
  return "sd-poor";
}
function SDCell({ sd, source, hcp, style }: { sd: number | null; source: string | null; hcp?: number | null; style?: React.CSSProperties }) {
  if (sd == null) return <td className="r" style={style}>–</td>;
  const cls = sdClass(sd, hcp);
  const tip = source === "ags" ? "" : "≈";
  return (
    <td className="r" style={style}>
      <span className={cls ? `p p-sm p-${cls}` : ""}>{sd.toFixed(1)}</span>
      {tip && <span style={{ fontSize: 7, color: "var(--text-muted)", marginLeft: 1 }}>{tip}</span>}
    </td>
  );
}


/* ─────────────────────────────────────────────
   FILTROS DE JOGADORES
   ───────────────────────────────────────────── */
interface PlayerFilter {
  name: string;
  escs: string[];
  tees: string[];
  club: string;
}
const EMPTY_FILTER: PlayerFilter = { name: "", escs: [], tees: [], club: "" };

function filterPlayers(players: Player[], f: PlayerFilter, escLookup: EscLookup, playersDB: PlayersDB): Player[] {
  let ps = players;
  if (f.name) {
    const q = f.name.toLowerCase();
    ps = ps.filter(p => p.name.toLowerCase().includes(q) || (p.club || "").toLowerCase().includes(q));
  }
  if (f.escs.length) ps = ps.filter(p => f.escs.includes(resolveEsc(p, escLookup)));
  if (f.tees.length) ps = ps.filter(p => p.teeName != null && f.tees.includes(p.teeName));
  if (f.club) ps = ps.filter(p => p.club === f.club);
  return ps;
}

function toggleArr(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
}

function PlayerFilterBar({
  players, filter, onChange, escLookup, playersDB, total,
}: {
  players: Player[]; filter: PlayerFilter;
  onChange: (f: PlayerFilter) => void;
  escLookup: EscLookup; playersDB: PlayersDB; total: number;
}) {
  const availEsc = useMemo(() => {
    const s = new Set<string>();
    for (const p of players) { const e = resolveEsc(p, escLookup); if (e) s.add(e); }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [players, escLookup]);

  const availTees = useMemo(() => {
    const s = new Set<string>();
    for (const p of players) if (p.teeName) s.add(p.teeName);
    return [...s].sort();
  }, [players]);

  const availClubs = useMemo(() => {
    const s = new Set<string>();
    for (const p of players) if (p.club) s.add(p.club);
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [players]);

  const isActive = filter.name || filter.escs.length || filter.tees.length || filter.club;
  const filtered = useMemo(() => filterPlayers(players, filter, escLookup, playersDB), [players, filter, escLookup, playersDB]);
  const showing = filtered.length;
  const hasMultipleOptions = availClubs.length > 1 || availEsc.length > 1 || availTees.length > 1;

  if (total < 8 && !isActive) return null;

  const chip = (active: boolean, label: React.ReactNode, onClick: () => void, color?: string): React.ReactNode => (
    <button key={String(label)} onClick={onClick} style={{
      fontSize: 10, padding: "2px 8px", borderRadius: 20,
      border: `1px solid ${active ? (color || "var(--accent,#2563eb)") : "var(--border)"}`,
      background: active ? (color || "var(--accent,#2563eb)") : "var(--bg-hover)",
      color: active ? "#fff" : "var(--text-muted)",
      cursor: "pointer", whiteSpace: "nowrap", fontWeight: active ? 700 : 500,
      transition: "all .12s",
    }}>{label}</button>
  );

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6,
      padding: "6px 0 8px", borderBottom: "1px solid var(--border)", marginBottom: 8,
    }}>
      {/* Pesquisa */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--text-muted)", pointerEvents: "none" }}>🔍</span>
        <input
          type="text"
          placeholder="Nome ou clube…"
          value={filter.name}
          onChange={e => onChange({ ...filter, name: e.target.value })}
          style={{
            fontSize: 11, padding: "3px 8px 3px 22px", borderRadius: 6,
            border: "1px solid var(--border)", background: "var(--bg-card,#fff)",
            color: "var(--text)", width: 140, outline: "none",
          }}
        />
      </div>

      {/* Separador */}
      {hasMultipleOptions && <span style={{ color: "var(--border)", fontSize: 11 }}>|</span>}

      {/* Escalão chips */}
      {availEsc.length > 1 && availEsc.map(e => {
        const key = e.toLowerCase().replace(/[\s-]/g, "");
        const s = ESC_STYLE[key];
        return chip(filter.escs.includes(e), e, () => onChange({ ...filter, escs: toggleArr(filter.escs, e) }), s?.bg);
      })}

      {/* Tee chips */}
      {availTees.length > 1 && availTees.map(t => {
        const hex = getTeeHex(t);
        return chip(
          filter.tees.includes(t),
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: hex, border: "1px solid rgba(0,0,0,.18)" }} />
            {t}
          </span>,
          () => onChange({ ...filter, tees: toggleArr(filter.tees, t) }),
          hex,
        );
      })}

      {/* Clube dropdown */}
      {availClubs.length > 2 && (
        <select
          value={filter.club}
          onChange={e => onChange({ ...filter, club: e.target.value })}
          style={{
            fontSize: 11, padding: "3px 6px", borderRadius: 6,
            border: `1px solid ${filter.club ? "var(--accent,#2563eb)" : "var(--border)"}`,
            background: "var(--bg-card,#fff)", color: "var(--text)", cursor: "pointer",
            fontWeight: filter.club ? 700 : 400,
          }}
        >
          <option value="">Todos os clubes</option>
          {availClubs.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}

      {/* Resultado + limpar */}
      {isActive && (
        <>
          <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 2 }}>
            {showing} de {total}
          </span>
          <button onClick={() => onChange(EMPTY_FILTER)} style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 20,
            border: "1px solid var(--border)", background: "var(--bg-hover)",
            color: "var(--text-muted)", cursor: "pointer",
          }}>✕ limpar</button>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   ESCALÃO PILL — cores idênticas ao Drive (inline para não depender do CSS)
   Sub 10 → verde muito escuro  Sub 12 → verde escuro
   Sub 14 → verde médio         Sub 16 → verde claro   Sub 18 → verde pálido
   ───────────────────────────────────────────── */
const ESC_STYLE: Record<string, { bg: string; color: string }> = {
  "sub10":  { bg: "#2a5a18", color: "#fff" },
  "sub12":  { bg: "#3a7a28", color: "#fff" },
  "sub14":  { bg: "#5a9a40", color: "#fff" },
  "sub16":  { bg: "#7aba60", color: "#1a3a10" },
  "sub18":  { bg: "#a0d480", color: "#1a3a10" },
};
function EscPill({ esc }: { esc: string }) {
  if (!esc) return null;
  const key = esc.toLowerCase().replace(/[\s-]/g, "");
  const s = ESC_STYLE[key] ?? { bg: "var(--bg-hover)", color: "var(--text-muted)" };
  return (
    <span className="p p-sm" style={{ background: s.bg, color: s.color, borderColor: "transparent" }}>
      {esc}
    </span>
  );
}

/* ─────────────────────────────────────────────
   TEE DOT — quadrado colorido com tooltip (usa getTeeHex do projecto)
   ───────────────────────────────────────────── */
function TeeDot({ teeName }: { teeName?: string }) {
  if (!teeName) return <span className="muted">–</span>;
  const hex = getTeeHex(teeName);
  const border = teeBorder(hex) || "1px solid rgba(0,0,0,.18)";
  return (
    <span
      title={teeName}
      style={{
        display: "inline-block", width: 12, height: 12,
        borderRadius: 3, background: hex, border, verticalAlign: "middle",
        cursor: "default", flexShrink: 0,
      }}
    />
  );
}


/* ─────────────────────────────────────────────
   NOME DO JOGADOR — sublinhado + link se tiver perfil
   ───────────────────────────────────────────── */
function PName({ name, fedCode, playersDB }: { name: string; fedCode?: string; playersDB: PlayersDB }) {
  const hasProfile = !!(fedCode && playersDB[fedCode]);
  const sex = fedCode ? playersDB[fedCode]?.sex : undefined;
  const truncName = name.length > 28 ? name.substring(0, 26) + "…" : name;
  return (
    <span
      className={"tourn-pname" + (hasProfile ? " tourn-pname-link" : "")}
      style={{ fontSize: 12 }}
      onClick={hasProfile ? () => window.open("/jogadores/" + fedCode, "_blank") : undefined}>
      {truncName}
      {sex === "M" && <span className="jog-sex-inline jog-sex-M" style={{ marginLeft: 4 }}>M</span>}
      {sex === "F" && <span className="jog-sex-inline jog-sex-F" style={{ marginLeft: 4 }}>F</span>}
    </span>
  );
}

/* ─────────────────────────────────────────────
   SORTABLE HEADER
   ───────────────────────────────────────────── */
type SortKey = "pos" | "name" | "club" | "esc" | "hcp" | "gross" | "toPar" | "tee" | "sd";

function SortTh({ children, sortKey, current, dir, onSort, style, className }: {
  children: React.ReactNode; sortKey: SortKey; current: SortKey; dir: "asc" | "desc";
  onSort: (k: SortKey) => void; style?: React.CSSProperties; className?: string;
}) {
  const active = current === sortKey;
  return (
    <th className={className}
      style={{ ...style, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => onSort(sortKey)}>
      {children}
      {active && <span style={{ marginLeft: 2, fontSize: 8 }}>{dir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

/* ─────────────────────────────────────────────
   LEADERBOARD PRINCIPAL (1 ronda)
   Estilo Drive Tour: colunas FED · ESC · CLUBE · HCP · TEE + buraco-a-buraco
   ───────────────────────────────────────────── */
function ScorecardLB({ tournament, escLookup, playersDB }: { tournament: Tournament; escLookup: EscLookup; playersDB: PlayersDB }) {
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
  const is9 = nh <= 9;
  const parF9 = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const parB9 = !is9 ? par.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
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

  function SortableHH({ k, children, style }: { k: SortKey; children: React.ReactNode; style?: React.CSSProperties }) {
    return (
      <th className="hole-header" style={{ cursor: "pointer", userSelect: "none", ...style }}
        onClick={() => handleSort(k)}>
        {children}{sortKey === k && <span style={{ marginLeft: 2, fontSize: 7 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
      </th>
    );
  }

  return (
    <div>
      <div className="muted fs-11 mb-8 p-0-4px" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span>{rawPlayers.length} jog · Par {parTotal} · {nh}h</span>
        {avg > 0 && <span>· Média {avg.toFixed(1)} ({fmtTP(Math.round(avg - parTotal))})</span>}
        {refP.course && <span>· 📍 {refP.course}</span>}
        {refP.courseRating && <span>· CR {refP.courseRating}</span>}
        {refP.slope && <span>· Slope {refP.slope}</span>}
        <button onClick={() => setShowScorecard(v => !v)} style={{
          marginLeft: "auto", fontSize: 11, padding: "2px 8px", borderRadius: 4,
          border: "1px solid var(--border)", background: "var(--bg-hover)", cursor: "pointer",
        }}>
          {showScorecard ? "Ocultar scorecard" : "Ver scorecard"}
        </button>
      </div>
      <PlayerFilterBar
        players={rawPlayers} filter={filter} onChange={setFilter}
        escLookup={escLookup} playersDB={playersDB} total={rawPlayers.length}
      />
      <div className="bjgt-chart-scroll">
        <table className="sc-table-modern" data-sc-table="1">
          <thead>
            {showScorecard && <>
              {si.length >= nh && (
                <tr className="meta-row">
                  <td className="sticky-col-0" />
                  <td className="row-label par-label sticky-col-1" style={{ borderRight: 0 }}>S.I.</td>
                  <td style={{ borderLeft: 0, borderRight: 0 }}/><td style={{ borderLeft: 0, borderRight: 0 }}/><td style={{ borderLeft: 0, borderRight: 0 }}/><td style={{ borderLeft: 0, borderRight: 0 }}/><td style={{ borderLeft: 0, borderRight: 0 }}/>
                  <td style={{ borderLeft: 0, borderRight: 0 }}/><td style={{ borderLeft: 0, borderRight: 0 }}/><td style={{ borderLeft: 0, borderRight: 0 }}/>
                  {si.slice(0, 9).map((v, i) => <td key={i}>{v}</td>)}
                  <td className="col-out" />
                  {!is9 && si.slice(9, 18).map((v, i) => <td key={i}>{v}</td>)}
                  {!is9 && <td className="col-in" />}
                </tr>
              )}
              <tr className="sep-row">
                <td className="sticky-col-0" />
                <td className="row-label par-label sticky-col-1" style={{ borderRight: 0 }}>PAR</td>
                <td style={{ borderLeft: 0, borderRight: 0 }}/><td style={{ borderLeft: 0, borderRight: 0 }}/><td style={{ borderLeft: 0, borderRight: 0 }}/><td style={{ borderLeft: 0, borderRight: 0 }}/><td style={{ borderLeft: 0, borderRight: 0 }}/>
                <td className="col-total">{parTotal}</td>
                <td style={{ borderLeft: 0, borderRight: 0 }}/><td style={{ borderLeft: 0, borderRight: 0 }}/>
                {par.slice(0, 9).map((v, i) => <td key={i}>{v}</td>)}
                <td className="col-out fw-600">{parF9}</td>
                {!is9 && par.slice(9, 18).map((v, i) => <td key={i}>{v}</td>)}
                {!is9 && <td className="col-in fw-600">{parB9}</td>}
              </tr>
            </>}
            <tr>
              <th className="hole-header" style={{ width: 26, textAlign: "center", position: "sticky", left: 0, zIndex: 5, background: "var(--bg-card,#fff)", cursor: "pointer" }} onClick={() => handleSort("pos")}>
                #{sortKey === "pos" && <span style={{ marginLeft: 1, fontSize: 7 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
              </th>
              <th className="hole-header" style={{ textAlign: "left", paddingLeft: 6, position: "sticky", left: 26, zIndex: 5, background: "var(--bg-card,#fff)", boxShadow: "2px 0 4px rgba(0,0,0,.06)", minWidth: 135, cursor: "pointer" }} onClick={() => handleSort("name")}>
                Jogador{sortKey === "name" && <span style={{ marginLeft: 2, fontSize: 7 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
              </th>
              <SortableHH k="esc"   style={{ width: 52, borderLeft: 0, borderRight: 0 }}>ESC.</SortableHH>
              <th className="hole-header" style={{ width: 46, borderLeft: 0, borderRight: 0 }}>FED</th>
              <SortableHH k="club"  style={{ width: 70, whiteSpace: "nowrap", borderLeft: 0, borderRight: 0 }}>CLUBE</SortableHH>
              <SortableHH k="hcp"   style={{ width: 32, borderLeft: 0, borderRight: 0 }}>HCP</SortableHH>
              <SortableHH k="tee"   style={{ width: 20, borderLeft: 0, borderRight: 0 }}>TEE</SortableHH>
              <th className="hole-header col-total" style={{ width: 30 }}>Tot</th>
              <SortableHH k="toPar" style={{ width: 30, borderLeft: 0, borderRight: 0 }}>±</SortableHH>
              <SortableHH k="sd"    style={{ width: 38, borderLeft: 0, borderRight: 0 }}>SD</SortableHH>
              {showScorecard && <>
                {Array.from({ length: Math.min(9, nh) }, (_, i) => <th key={i} className="hole-header">{i + 1}</th>)}
                <th className="hole-header col-out fs-10">{is9 ? "Tot" : "Out"}</th>
                {!is9 && Array.from({ length: Math.min(9, nh - 9) }, (_, i) => <th key={i + 9} className="hole-header">{i + 10}</th>)}
                {!is9 && <th className="hole-header col-in fs-10">In</th>}
              </>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, idx) => {
              const scores = p.scores!;
              const gross = numGross(p);
              const tp = gross - parTotal;
              const f9 = scores.slice(0, 9).reduce((a, b) => a + b, 0);
              const b9 = !is9 ? scores.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
              const dp = (p as any)._pos;
              const showPos = idx === 0 || dp !== (sorted[idx - 1] as any)._pos;
              const tpColor = tp < 0 ? SC.danger : tp === 0 ? SC.good : undefined;
              const medal = dp === 1 ? "🥇" : dp === 2 ? "🥈" : dp === 3 ? "🥉" : null;
              const esc = resolveEsc(p, escLookup) || tournament.escalao || "";
              const { sd, source } = computeSD(p);
              return (
                <tr key={p.scoreId || idx}>
                  <td className="fw-800 ta-center" style={{ color: "var(--text-3)", fontSize: 11, position: "sticky", left: 0, zIndex: 2, background: "var(--bg-card,#fff)" }}>
                    {sortKey === "pos" ? (showPos ? (medal ?? dp) : "") : (medal ?? dp)}
                  </td>
                  <td className="row-label tourn-lb-name-col" style={{ whiteSpace: "nowrap", paddingLeft: 6, position: "sticky", left: 26, zIndex: 2, background: "var(--bg-card,#fff)", boxShadow: "2px 0 4px rgba(0,0,0,.06)", borderRight: 0 }}>
                    <PName name={p.name} fedCode={p.fedCode} playersDB={playersDB} />
                  </td>
                  <td style={{ borderLeft: 0, borderRight: 0 }}>{esc ? <EscPill esc={esc} /> : <span className="muted">–</span>}</td>
                  <td style={{ fontSize: 10, color: "var(--text-muted)", borderLeft: 0, borderRight: 0 }}>{p.fedCode || "–"}</td>
                  <td style={{ borderLeft: 0, borderRight: 0, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.club || "–"}</td>
                  <td className="ta-center" style={{ borderLeft: 0, borderRight: 0 }}>{p.hcpExact != null ? p.hcpExact.toFixed(1) : "–"}</td>
                  <td className="ta-center" style={{ borderLeft: 0, borderRight: 0 }}><TeeDot teeName={p.teeName} /></td>
                  <td className="col-total fw-800" style={{ fontSize: 13 }}>{gross}</td>
                  <td className="fw-700" style={{ color: tpColor, fontSize: 12, borderLeft: 0, borderRight: 0 }}>{fmtTP(tp)}</td>
                  <td className="ta-center" style={{ borderLeft: 0, borderRight: 0 }}>
                    {sd != null ? <span className={"p p-sm p-" + sdClassByHcp(sd, p.hcpExact ?? null)}>{sd.toFixed(1)}{source !== "ags" && <span style={{ fontSize: 7 }}> ≈</span>}</span> : <span className="muted">–</span>}
                  </td>
                  {showScorecard && <>
                    {scores.slice(0, 9).map((sc, i) => (
                      <td key={i}><span className={"sc-score " + scClass(sc, par[i])}>{sc || ""}</span></td>
                    ))}
                    <td className="col-out fw-600">{f9} <span className="fs-8 c-text-3">({fmtTP(f9 - parF9)})</span></td>
                    {!is9 && scores.slice(9, 18).map((sc, i) => (
                      <td key={i}><span className={"sc-score " + scClass(sc, par[9 + i])}>{sc || ""}</span></td>
                    ))}
                    {!is9 && <td className="col-in fw-600">{b9} <span className="fs-8 c-text-3">({fmtTP(b9 - parB9)})</span></td>}
                  </>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   LEADERBOARD ACUMULADO (multi-ronda)
   ───────────────────────────────────────────── */
function AccumulatedLB({ tournament, nRounds, escLookup, playersDB }: { tournament: Tournament; nRounds: number; escLookup: EscLookup; playersDB: PlayersDB }) {
  const [sortKey, setSortKey] = useState<SortKey>("pos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState<PlayerFilter>(EMPTY_FILTER);

  const rawPlayers = tournament.players;
  if (!rawPlayers.length) return <div className="muted ta-center p-16">Sem resultados.</div>;

  const complete   = rawPlayers.filter(p => !(p as any)._incomplete);
  const incomplete = rawPlayers.filter(p =>  (p as any)._incomplete);
  const parPerRound = complete[0]?.parTotal ?? 72;
  const parTotal = parPerRound * nRounds;

  const byGross = [...complete].sort((a, b) => numGross(a) - numGross(b));
  let posCounter = 1;
  byGross.forEach((p, i) => {
    if (i > 0 && numGross(p) !== numGross(byGross[i - 1])) posCounter = i + 1;
    (p as any)._pos = posCounter;
  });
  incomplete.forEach(p => { (p as any)._pos = null; });

  const filteredComplete   = useMemo(() => filterPlayers(complete,   filter, escLookup, playersDB), [complete,   filter, escLookup, playersDB]);
  const filteredIncomplete = useMemo(() => filterPlayers(incomplete, filter, escLookup, playersDB), [incomplete, filter, escLookup, playersDB]);

  function handleSort(k: SortKey) {
    if (k === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }
  function cmp(a: Player, b: Player): number {
    let av: any, bv: any;
    switch (sortKey) {
      case "pos":   av = (a as any)._pos ?? 999; bv = (b as any)._pos ?? 999; break;
      case "name":  av = a.name; bv = b.name; break;
      case "club":  av = a.club || ""; bv = b.club || ""; break;
      case "hcp":   av = a.hcpExact ?? 999; bv = b.hcpExact ?? 999; break;
      case "gross": av = numGross(a); bv = numGross(b); break;
      case "toPar": av = numGross(a) - parTotal; bv = numGross(b) - parTotal; break;
      case "tee":   av = a.teeName || ""; bv = b.teeName || ""; break;
      case "sd":    { const r0a = a.roundScores?.[0]; av = r0a ? (computeSD({ ...a, scores: r0a.scores, par: r0a.pars, si: r0a.si, courseRating: r0a.courseRating, slope: r0a.slope, nholes: r0a.pars?.length } as any).sd ?? 999) : 999; const r0b = b.roundScores?.[0]; bv = r0b ? (computeSD({ ...b, scores: r0b.scores, par: r0b.pars, si: r0b.si, courseRating: r0b.courseRating, slope: r0b.slope, nholes: r0b.pars?.length } as any).sd ?? 999) : 999; break; }
      default:      av = 0; bv = 0;
    }
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === "asc" ? av - bv : bv - av;
  }
  const sorted = useMemo(() => [...filteredComplete.sort(cmp), ...filteredIncomplete.sort(cmp)],
    [rawPlayers, filter, sortKey, sortDir, parTotal, escLookup]);

  function SortableHH({ k, children, style }: { k: SortKey; children: React.ReactNode; style?: React.CSSProperties }) {
    return (
      <th className="hole-header" style={{ cursor: "pointer", userSelect: "none", ...style }}
        onClick={() => handleSort(k)}>
        {children}{sortKey === k && <span style={{ marginLeft: 2, fontSize: 7 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
      </th>
    );
  }

  return (
    <div>
      <div className="muted fs-11 mb-8 p-0-4px">
        {complete.length} classif.{incomplete.length > 0 && <> · {incomplete.length} inc.</>} · {nRounds}R · Par {parTotal}
      </div>
      <PlayerFilterBar
        players={rawPlayers} filter={filter} onChange={setFilter}
        escLookup={escLookup} playersDB={playersDB} total={rawPlayers.length}
      />
      <div className="bjgt-chart-scroll">
        <table className="sc-table-modern" data-sc-table="1">
          <thead><tr>
            <th className="hole-header" style={{ width: 26, textAlign: "center", position: "sticky", left: 0, zIndex: 5, background: "var(--bg-card,#fff)", cursor: "pointer" }} onClick={() => handleSort("pos")}>
              #{sortKey === "pos" && <span style={{ marginLeft: 1, fontSize: 7 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
            </th>
            <th className="hole-header" style={{ textAlign: "left", paddingLeft: 6, position: "sticky", left: 26, zIndex: 5, background: "var(--bg-card,#fff)", boxShadow: "2px 0 4px rgba(0,0,0,.06)", minWidth: 135, cursor: "pointer" }} onClick={() => handleSort("name")}>
              Jogador{sortKey === "name" && <span style={{ marginLeft: 2, fontSize: 7 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
            </th>
            <SortableHH k="esc"   style={{ width: 52, borderLeft: 0, borderRight: 0 }}>ESC.</SortableHH>
            <th className="hole-header" style={{ width: 46, borderLeft: 0, borderRight: 0 }}>FED</th>
            <SortableHH k="club"  style={{ width: 70, whiteSpace: "nowrap", borderLeft: 0, borderRight: 0 }}>CLUBE</SortableHH>
            <SortableHH k="hcp"   style={{ width: 32, borderLeft: 0, borderRight: 0 }}>HCP</SortableHH>
            <SortableHH k="tee"   style={{ width: 20, borderLeft: 0, borderRight: 0 }}>TEE</SortableHH>
            <th className="hole-header col-total" style={{ width: 38 }}>Total</th>
            <SortableHH k="toPar" style={{ width: 30, borderLeft: 0, borderRight: 0 }}>±Par</SortableHH>
            <SortableHH k="sd"    style={{ width: 38, borderLeft: 0, borderRight: 0 }}>SD</SortableHH>
            {Array.from({ length: nRounds }, (_, r) => (
              <React.Fragment key={r}>
                <th className="hole-header col-out" style={{ width: 30 }}>R{r + 1}</th>
                <th className="hole-header" style={{ width: 26 }}>±</th>
              </React.Fragment>
            ))}
            <th className="hole-header" style={{ width: 24 }}>🐦</th>
            <th className="hole-header" style={{ width: 24 }}>Par</th>
            <th className="hole-header" style={{ width: 24 }}>■</th>
          </tr></thead>
          <tbody>
            {sorted.map((p, idx) => {
              const gross = numGross(p);
              const tp = gross - parTotal;
              const dp = (p as any)._pos;
              const isInc = !!(p as any)._incomplete;
              const tpColor = !isInc && (tp < 0 ? SC.danger : tp === 0 ? SC.good : undefined);
              const medal = !isInc && (dp === 1 ? "🥇" : dp === 2 ? "🥈" : dp === 3 ? "🥉" : null);
              const showPos = !isInc && (sortKey === "pos" ? (idx === 0 || dp !== (sorted[idx - 1] as any)._pos) : true);
              const rounds = p.roundScores || [];
              const ppt = p.parTotal || parPerRound;
              const esc = resolveEsc(p, escLookup) || tournament.escalao || "";
              const r0 = rounds[0];
              const sdP = r0 ? { ...p, scores: r0.scores, par: r0.pars, si: r0.si, courseRating: r0.courseRating, slope: r0.slope, nholes: r0.pars?.length } as any : p;
              const { sd, source } = computeSD(sdP);
              let birds = 0, pars = 0, bogs = 0;
              for (const rs of rounds) for (let i = 0; i < (rs.scores?.length ?? 0); i++) {
                const d = (rs.scores[i] || 0) - (rs.pars[i] || 0);
                if (d <= -1) birds++; else if (d === 0) pars++; else bogs++;
              }
              return (
                <tr key={p.scoreId || idx} style={isInc ? { background: "var(--bg-hover)", opacity: 0.7 } : undefined}>
                  <td className="fw-800 ta-center" style={{ fontSize: 11, color: "var(--text-3)", position: "sticky", left: 0, zIndex: 2, background: isInc ? "var(--bg-hover)" : "var(--bg-card,#fff)" }}>
                    {isInc ? <span style={{ fontSize: 9, color: "#dc2626", fontStyle: "italic" }}>WD</span>
                            : showPos ? (medal || dp) : ""}
                  </td>
                  <td className="row-label tourn-lb-name-col" style={{ whiteSpace: "nowrap", paddingLeft: 6, position: "sticky", left: 26, zIndex: 2, background: isInc ? "var(--bg-hover)" : "var(--bg-card,#fff)", boxShadow: "2px 0 4px rgba(0,0,0,.06)", borderRight: 0 }}>
                    <PName name={p.name} fedCode={p.fedCode} playersDB={playersDB} />
                  </td>
                  <td style={{ borderLeft: 0, borderRight: 0 }}>{esc ? <EscPill esc={esc} /> : <span className="muted">–</span>}</td>
                  <td style={{ fontSize: 10, color: "var(--text-muted)", borderLeft: 0, borderRight: 0 }}>{p.fedCode || "–"}</td>
                  <td style={{ borderLeft: 0, borderRight: 0, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.club || "–"}</td>
                  <td className="ta-center" style={{ borderLeft: 0, borderRight: 0 }}>{p.hcpExact != null ? p.hcpExact.toFixed(1) : "–"}</td>
                  <td className="ta-center" style={{ borderLeft: 0, borderRight: 0 }}><TeeDot teeName={p.teeName} /></td>
                  <td className="col-total fw-800" style={{ fontSize: 13, opacity: isInc ? 0.5 : 1 }}>{gross}</td>
                  <td className="fw-700" style={{ color: tpColor || undefined, fontSize: 12, opacity: isInc ? 0.5 : 1, borderLeft: 0, borderRight: 0 }}>{fmtTP(tp)}</td>
                  <td className="ta-center" style={{ borderLeft: 0, borderRight: 0 }}>
                    {sd != null ? <span className={"p p-sm p-" + sdClassByHcp(sd, p.hcpExact ?? null)}>{sd.toFixed(1)}</span> : <span className="muted">–</span>}
                  </td>
                  {Array.from({ length: nRounds }, (_, r) => {
                    const rs = rounds[r];
                    if (!rs) return <React.Fragment key={r}><td className="col-out muted ta-center">–</td><td className="muted ta-center">–</td></React.Fragment>;
                    const rtp = rs.gross - ppt;
                    const rtpColor = rtp < 0 ? SC.danger : rtp === 0 ? SC.good : undefined;
                    return (
                      <React.Fragment key={r}>
                        <td className="col-out fw-700">{rs.gross}</td>
                        <td className="fw-600" style={{ color: rtpColor }}>{fmtTP(rtp)}</td>
                      </React.Fragment>
                    );
                  })}
                  <td className="ta-center">{birds || "–"}</td>
                  <td className="ta-center">{pars || "–"}</td>
                  <td className="ta-center">{bogs || "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
  const [sidebarMode, setSidebarMode] = useState<"month" | "circuit">("month");
  const [filterManuel, setFilterManuel] = useState(false);
  const [escLookup, setEscLookup] = useState<EscLookup>(new Map());
  const [playersDB, setPlayersDB] = useState<PlayersDB>({});
  const [tcodePills, setTcodePills] = useState<Record<string, TournPill>>({});

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        // Carregar players.json em paralelo com os torneios (para escalões)
        // Load players.json + tournament-links.json in parallel
        const [pdbResp, linksResp, melhoriasResp] = await Promise.all([
          fetch("/data/players.json").catch(() => null),
          fetch("/data/tournament-links.json").catch(() => null),
          fetch("/data/melhorias.json").catch(() => null),
        ]);
        if (pdbResp?.ok) {
          const pdb: PlayersDB = await pdbResp.json().catch(() => ({}));
          if (alive) { setEscLookup(buildEscLookup(pdb)); setPlayersDB(pdb); }
        }
        if (melhoriasResp?.ok) {
          const mel = await melhoriasResp.json().catch(() => ({}));
          const pills: Record<string, TournPill> = {};
          for (const playerData of Object.values(mel)) {
            if (typeof playerData !== "object" || !playerData) continue;
            for (const entry of Object.values(playerData as Record<string, any>)) {
              if (typeof entry !== "object" || !entry || Array.isArray(entry) || !entry.pill) continue;
              for (const v of Object.values(entry.links || {})) {
                const m = String(v).match(/tcode=(\d+)/);
                if (m) { pills[m[1]] = entry.pill as TournPill; break; }
              }
            }
          }
          if (alive) setTcodePills(pills);
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
        <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexWrap: "wrap" }}>
          <span className="course-item-name" style={{ flex: "none" }}>{t.name}</span>
          <div style={{ display: "flex", gap: 3 }}>
            {isSynth ? (
              // Torneio sintético: badge "2R" + tcodes das rondas
              <>
                <span title="Torneio agrupado automaticamente" style={{
                  fontFamily: "monospace", fontSize: 9, fontWeight: 700,
                  background: "#7c3aed", color: "#fff",
                  borderRadius: 3, padding: "0 4px", letterSpacing: "0.01em",
                }}>{nR}R ⛳</span>
                {subRounds.map((sr, i) => (
                  <span key={sr.tcode} title={`Dia ${i+1}: ${sr.tcode}`} style={{
                    fontFamily: "monospace", fontSize: 9, fontWeight: 600,
                    background: "var(--accent,#2563eb)", color: "#fff",
                    borderRadius: 3, padding: "0 4px", opacity: selected === idx ? 1 : 0.7,
                  }}>{sr.tcode}</span>
                ))}
              </>
            ) : (
              <>
                {t.ccode && (
                  <span title="tclub" style={{
                    fontFamily: "monospace", fontSize: 9, fontWeight: 600,
                    background: "rgba(0,0,0,0.08)", color: "var(--text-muted)",
                    borderRadius: 3, padding: "0 4px", letterSpacing: "0.01em",
                  }}>{t.ccode}</span>
                )}
                {t.tcode && (
                  <span title="tcode" style={{
                    fontFamily: "monospace", fontSize: 9, fontWeight: 700,
                    background: "var(--accent,#2563eb)", color: "#fff",
                    borderRadius: 3, padding: "0 4px", letterSpacing: "0.01em",
                    opacity: selected === idx ? 1 : 0.7,
                  }}>{t.tcode}</span>
                )}
                {t.ccode && t.tcode && (
                  <span
                    title="Abrir classificação na Federação"
                    onClick={e => { e.stopPropagation(); window.open(`https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=${t.ccode}&tcode=${t.tcode}`, "_blank"); }}
                    style={{
                      fontSize: 9, fontWeight: 600, cursor: "pointer",
                      color: "var(--accent,#2563eb)",
                      border: "1px solid var(--accent,#2563eb)",
                      borderRadius: 3, padding: "0 4px",
                      whiteSpace: "nowrap", lineHeight: 1.6,
                    }}
                  >↗</span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="course-item-meta">
          {t.campo && <span>{t.campo}</span>}
          <span style={{ marginLeft: 4 }}>{t.playerCount} jog · {nR}R · {nh}h</span>
          <TournPillBadge tcode={t.tcode} dynamicPills={tcodePills} />
          {manuelPlayed && (
            <span title="Manuel participou neste torneio" style={{
              marginLeft: 6, fontSize: 9, fontWeight: 700,
              background: "var(--color-loading)", color: "#1a1a1a",
              borderRadius: 20, padding: "1px 6px",
            }}>★ Manuel</span>
          )}
        </div>
        {t.escalao && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{t.escalao}</div>
        )}
        {!isSynth && t._sourceIndex !== undefined && (
          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1, opacity: 0.6 }}>
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
          {/* Toggle modo */}
          {!loading && (
            <div style={{ display: "flex", gap: 3, marginLeft: 12 }}>
              {(["month", "circuit"] as const).map(mode => (
                <button key={mode} onClick={() => { setSidebarMode(mode); if (mode === "circuit") setFilterManuel(false); }} style={{
                  fontSize: 11, padding: "3px 10px", borderRadius: 5,
                  border: "1px solid var(--border)",
                  background: sidebarMode === mode ? "var(--accent)" : "var(--bg-hover)",
                  color: sidebarMode === mode ? "#fff" : "var(--text-muted)",
                  cursor: "pointer", fontWeight: sidebarMode === mode ? 700 : 400,
                }}>
                  {mode === "month" ? "Por data" : "PJA Tour"}
                </button>
              ))}
            </div>
          )}
          {/* Filtro Manuel — só no modo Por data */}
          {!loading && sidebarMode === "month" && (
            <button onClick={() => setFilterManuel(v => !v)} style={{
              marginLeft: 6, fontSize: 11, padding: "3px 10px", borderRadius: 5,
              border: `1px solid ${filterManuel ? "var(--color-loading)" : "var(--border)"}`,
              background: filterManuel ? "var(--color-loading)" : "var(--bg-hover)",
              color: filterManuel ? "#1a1a1a" : "var(--text-muted)",
              cursor: "pointer", fontWeight: filterManuel ? 700 : 400,
            }}>
              ★ Manuel
            </button>
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

      {/* Master-detail */}
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
    </div>
  );
}

export default function TorneiosAnalisePage() {
  return <Content />;
}
