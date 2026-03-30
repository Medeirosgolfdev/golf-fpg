/**
 * CompararPage.tsx — Comparação entre jogadores (v3)
 *
 * NOTA: Todas as estatísticas são calculadas APENAS a partir de rondas
 *       de torneio (exclui EDS, treinos e individuais).
 *
 * Secções:
 *   0. Preparar Ronda — campo, tee, HCPs, tabela de strokes por buraco
 *   1. Radar chart — perfil comparativo visual
 *   2. Tabela comparativa lado a lado com highlight do melhor
 *   3. Painel "Quem Ganha em Quê" — scorecard de categorias
 *   4. Análise SWOT automática por jogador
 *   5. Consistência — std dev, sequências, dispersão
 *   6. Distribuição de scores (eagle→triple) com barras
 *   7. Buraco a buraco (gráfico + tabela) — só torneios
 *   8. Head-to-Head com ficha de duelos e dominância
 *   9. Evolução em torneios (SD / Gross) com média móvel
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Course, Player, PlayersDb, Tee } from "../data/types";
import { useAppContext } from "../context/AppContext";
import {
  loadPlayerData, type PlayerPageData, type RoundData,
  type HoleScores,
} from "../data/playerDataLoader";
import { loadPlayerStats, type PlayerStatsDb, type PlayerStats, daysSince } from "../data/playerStatsTypes";
import { norm, fD, fD2, firstName, shortName } from "../utils/format";
import { clubShort, hcpDisplay } from "../utils/playerUtils";
import { deepFixMojibake } from "../utils/fixEncoding";
import { sc3m, sc3, SC } from "../utils/scoreDisplay";
import { isTournamentRound } from "../utils/roundFilters";
import { calcCourseHcp, calcPlayingHcp , expectedSD9, calcStrokesPerHole, get9hRatings } from "../utils/whsCalc";
import { sortTees } from "../utils/teeUtils";
import { getTeeHex, textOnColor } from "../utils/teeColors";
import SectionErrorBoundary from "../ui/SectionErrorBoundary";
import LoadingState from "../ui/LoadingState";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
const COLORS_LIGHT = ["var(--bg-success-strong)", "var(--bg-info-strong)", "var(--bg-danger-strong)", "var(--bg-warn-strong)"];

interface Slot {
  fed: string; player: Player;
  data: PlayerPageData | null; loading: boolean; error: string | null;
}

/* ─── Aggregate stats (tournament rounds only) ─── */

interface AggStats {
  totalStrokesOverPar: number;
  parOrBetterPct: number;
  dblOrWorsePct: number;
  byPar: Record<number, { avgVsPar: number; slPerRound: number }>;
  nRounds: number;
  nRoundsWithCard: number;
  scoreDist: { eagle: number; birdie: number; par: number; bogey: number; double: number; triple: number; total: number };
  avgGross: number | null;
  bestGross: number | null;
  f9sl: number | null;
  b9sl: number | null;
  avgSD: number | null;
  bestSD: number | null;
  best8of20SD: number | null;
  last5AvgSD: number | null;
  grossStdDev: number | null;
  sdStdDev: number | null;
  longestStreak: number;
  grossSeries: number[];
  sdSeries: { sd: number; dateSort: number; event: string }[];
}

function aggregateStats(data: PlayerPageData): AggStats | null {
  const dist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, total: 0 };
  const parTypeAcc: Record<number, { sumDiff: number; count: number }> = {};
  let grossSum = 0, nRounds = 0, nRoundsWithCard = 0, bestGross: number | null = null;
  let sopSum = 0;
  let f9diff = 0, b9diff = 0, fbN = 0;
  const sdAll: { sd: number; dateSort: number; event: string }[] = [];
  const grossAll: number[] = [];

  for (const cd of data.DATA) {
    for (const r of cd.rounds) {
      // Aceitar 18h via isTournamentRound, e também 9h válidas (Drive Challenge, etc.)
      const is9h = r.holeCount === 9;
      if (is9h) {
        // Filtro manual para 9h: sem treino, sem equipa, gross credível
        if (r._isTreino || r._isTeamEvent || r.gross == null) continue;
        const o = (r.scoreOrigin || "").trim();
        if (o === "EDS" || o === "Indiv" || o === "Treino") continue;
        const g = Number(r.gross);
        if (g <= 25 || g > 70) continue; // limites credíveis para 9h
      } else {
        if (!isTournamentRound(r)) continue;
        if (r._isTeamEvent) continue;
      }
      const g = Number(r.gross);
      if (!is9h && g > MAX_CREDIBLE_GROSS) continue;
      grossSum += g;
      grossAll.push(g);
      nRounds++;
      if (bestGross === null || g < bestGross) bestGross = g;

      if (r.sd != null && !isNaN(Number(r.sd)) && Number(r.sd) !== 0) {
        sdAll.push({ sd: Number(r.sd), dateSort: r.dateSort, event: r.eventName });
      }

      const holes: HoleScores | undefined = data.HOLES[r.scoreId];
      if (holes && holes.g && holes.g.length >= 18) {
        nRoundsWithCard++;
        let roundPar = 0, f9 = 0, b9 = 0;
        for (let i = 0; i < 18; i++) {
          const hg = holes.g[i];
          const hp = holes.p[i];
          if (hg == null || hp == null) continue;
          const diff = hg - hp;
          roundPar += hp;
          if (diff <= -2) dist.eagle++;
          else if (diff === -1) dist.birdie++;
          else if (diff === 0) dist.par++;
          else if (diff === 1) dist.bogey++;
          else if (diff === 2) dist.double++;
          else dist.triple++;
          dist.total++;
          if (!parTypeAcc[hp]) parTypeAcc[hp] = { sumDiff: 0, count: 0 };
          parTypeAcc[hp].sumDiff += diff;
          parTypeAcc[hp].count++;
          if (i < 9) f9 += diff; else b9 += diff;
        }
        sopSum += (g - roundPar);
        f9diff += f9; b9diff += b9; fbN++;
      } else if (r.par != null) {
        sopSum += (g - Number(r.par));
      }
    }
  }

  if (nRounds < 1) return null;

  const byPar: Record<number, { avgVsPar: number; slPerRound: number }> = {};
  for (const pt of [3, 4, 5]) {
    const a = parTypeAcc[pt];
    if (!a || a.count === 0) continue;
    const avgVsPar = a.sumDiff / a.count;
    const holesPerRound = a.count / (nRoundsWithCard || 1);
    byPar[pt] = { avgVsPar, slPerRound: avgVsPar * holesPerRound };
  }

  const totalHoles = dist.total;
  const pob = totalHoles > 0 ? (dist.eagle + dist.birdie + dist.par) / totalHoles * 100 : 0;
  const dow = totalHoles > 0 ? (dist.double + dist.triple) / totalHoles * 100 : 0;

  // SD calculations
  sdAll.sort((a, b) => b.dateSort - a.dateSort);
  const avgSD = sdAll.length > 0 ? sdAll.reduce((s, x) => s + x.sd, 0) / sdAll.length : null;
  const bestSD = sdAll.length > 0 ? Math.min(...sdAll.map(x => x.sd)) : null;
  const last20 = sdAll.slice(0, 20);
  const best8of20SD = last20.length >= 8
    ? [...last20].sort((a, b) => a.sd - b.sd).slice(0, 8).reduce((s, x) => s + x.sd, 0) / 8
    : null;
  const last5 = sdAll.slice(0, 5);
  const last5AvgSD = last5.length >= 3 ? last5.reduce((s, x) => s + x.sd, 0) / last5.length : null;

  // Std dev of gross
  const grossMean = grossSum / nRounds;
  const grossStdDev = grossAll.length >= 3
    ? Math.sqrt(grossAll.reduce((s, g) => s + (g - grossMean) ** 2, 0) / grossAll.length)
    : null;

  // Std dev of SD
  const sdMean = avgSD ?? 0;
  const sdStdDev = sdAll.length >= 3
    ? Math.sqrt(sdAll.reduce((s, x) => s + (x.sd - sdMean) ** 2, 0) / sdAll.length)
    : null;

  // Longest streak of consecutive improving gross
  let longestStreak = 0, curStreak = 0;
  for (let i = 1; i < grossAll.length; i++) {
    if (grossAll[i] < grossAll[i - 1]) { curStreak++; longestStreak = Math.max(longestStreak, curStreak); }
    else curStreak = 0;
  }

  return {
    totalStrokesOverPar: sopSum / nRounds,
    parOrBetterPct: pob,
    dblOrWorsePct: dow,
    byPar, nRounds, nRoundsWithCard,
    scoreDist: dist,
    avgGross: grossSum / nRounds,
    bestGross,
    f9sl: fbN > 0 ? f9diff / fbN : null,
    b9sl: fbN > 0 ? b9diff / fbN : null,
    avgSD, bestSD, best8of20SD, last5AvgSD,
    grossStdDev, sdStdDev, longestStreak,
    grossSeries: grossAll,
    sdSeries: sdAll,
  };
}

/* ─── Hole-by-hole stats ─── */

interface SimpleHoleEntry { h: number; par: number | null; avg: number | null; strokesLost: number | null; }
interface SimpleHoleStats { teeName: string; holeCount: number; nRounds: number; avgGross: number | null; holes: SimpleHoleEntry[]; }

function buildTourneyHoleStats(data: PlayerPageData): Map<string, { label: string; nR: number; stats: SimpleHoleStats }> {
  const map = new Map<string, { label: string; nR: number; stats: SimpleHoleStats }>();
  const grouped = new Map<string, { tee: string; course: string; nH: number; scoreIds: string[] }>();
  for (const cd of data.DATA) {
    for (const r of cd.rounds) {
      // Aceitar 18h e 9h (Drive Challenge)
      const is9h = r.holeCount === 9;
      if (is9h) {
        if (r._isTreino || r._isTeamEvent || r.gross == null) continue;
        const o = (r.scoreOrigin || "").trim();
        if (o === "EDS" || o === "Indiv" || o === "Treino") continue;
        const g = Number(r.gross);
        if (g <= 25 || g > 70) continue;
      } else {
        if (!isTournamentRound(r)) continue;
        if (r._isTeamEvent) continue;
      }
      if (!data.HOLES[r.scoreId]) continue;
      const holes = data.HOLES[r.scoreId];
      const nH = r.holeCount ?? 18;
      if (!holes.g || holes.g.length < nH) continue;
      // chave inclui holeCount para não misturar 9h com 18h do mesmo campo/tee
      const key = cd.course.replace(/ /g, "_") + "|" + r.teeKey + "|" + nH;
      if (!grouped.has(key)) grouped.set(key, { tee: r.tee, course: cd.course, nH, scoreIds: [] });
      grouped.get(key)!.scoreIds.push(r.scoreId);
    }
  }
  for (const [key, { tee, course, nH, scoreIds }] of grouped) {
    if (scoreIds.length < 2) continue;
    const holeSums = Array.from({ length: nH }, () => ({ gSum: 0, pSum: 0, n: 0 }));
    let grossTotal = 0, grossN = 0;
    for (const sid of scoreIds) {
      const h = data.HOLES[sid];
      if (!h || h.g.length < nH) continue;
      let rGross = 0, rPar = 0, valid = true;
      for (let i = 0; i < nH; i++) {
        if (h.g[i] != null && h.p[i] != null) {
          holeSums[i].gSum += h.g[i]!; holeSums[i].pSum += h.p[i]!; holeSums[i].n++;
          rGross += h.g[i]!; rPar += h.p[i]!;
        } else { valid = false; }
      }
      if (valid) { grossTotal += rGross; grossN++; }
    }
    const holes: SimpleHoleEntry[] = holeSums.map((hs, i) => ({
      h: i + 1,
      par: hs.n > 0 ? Math.round(hs.pSum / hs.n) : null,
      avg: hs.n > 0 ? hs.gSum / hs.n : null,
      strokesLost: hs.n > 0 ? (hs.gSum / hs.n) - (hs.pSum / hs.n) : null,
    }));
    const ck = key.split("|")[0];
    const suffix9h = nH === 9 ? " (9h)" : "";
    map.set(key, { label: ck.replace(/_/g, " ") + " — " + tee + suffix9h, nR: scoreIds.length,
      stats: { teeName: tee, holeCount: nH, nRounds: scoreIds.length, avgGross: grossN > 0 ? grossTotal / grossN : null, holes } });
  }
  return map;
}

const pct = (v: number) => v.toFixed(0) + "%";

/**
 * Gross máximo credível para 18 buracos.
 * Filtra erros de dados (999, 300, ...) e rondas de Pares/Foursomes
 * onde o gross pode ter ficado registado de forma absurda.
 * Nenhum jogador real de torneio faz mais de 130 num campo de 72.
 */
const MAX_CREDIBLE_GROSS = 130;

/* ─── Helpers visuais ─── */
function sc3_local(val: number, lo: number, hi: number) {
  return val <= lo ? SC.good : val <= hi ? SC.warn : SC.danger;
}

/* ═══════════════════ SEARCH + CHIPS ═══════════════════ */

function FormBadge({ ps }: { ps?: PlayerStats }) {
  if (!ps) return null;
  if (ps.formAlert === "hot") return <span className="fs-10" title="Boa forma recente">🔥</span>;
  if (ps.formAlert === "cold") return <span className="fs-10" title="Má forma recente">❄️</span>;
  return null;
}

function TrendArrow({ ps }: { ps?: PlayerStats }) {
  if (!ps || ps.hcpTrend === "stable") return null;
  if (ps.hcpTrend === "up") return <span className="fs-10" style={{ color: SC.good }} title={`HCP ↓ ${ps.hcpDelta3m ?? ""} (3m)`}>↗</span>;
  return <span className="fs-10" style={{ color: SC.danger }} title={`HCP ↑ ${ps.hcpDelta3m != null ? `+${ps.hcpDelta3m}` : ""} (3m)`}>↘</span>;
}

function PlayerSearch({ players, slots, statsDb, onAdd, onRemove }: {
  players: PlayersDb; slots: Slot[]; statsDb: PlayerStatsDb;
  onAdd: (fed: string) => void; onRemove: (fed: string) => void;
}) {
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedFeds = new Set(slots.map(s => s.fed));
  const results = useMemo(() => {
    if (!q.trim()) return [];
    const words = norm(q).split(/\s+/).filter(Boolean);
    return Object.entries(players).filter(([fed, p]) => {
      if (selectedFeds.has(fed)) return false;
      return words.every(w => norm([p.name, clubShort(p), p.escalao, fed, p.region].join(" ")).includes(w));
    }).slice(0, 8).map(([fed, p]) => ({ fed, ...p }));
  }, [q, players, selectedFeds]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="mb-18">
      <div className="flex-center-gap8 mb-10" ref={ref}>
        <div className="cmp-search-wrap">
          <input className="input cmp-search-input" value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => q.trim() && setOpen(true)}
            placeholder="Pesquisar jogador…" disabled={slots.length >= 4} />
          {open && results.length > 0 && (
            <div className="cmp-dropdown">
              {results.map(p => {
                const ps = statsDb[p.fed];
                return (
                  <button key={p.fed} className="course-item" onClick={() => { onAdd(p.fed); setQ(""); setOpen(false); }}>
                    <div className="course-item-name">{p.name} <FormBadge ps={ps} /> <TrendArrow ps={ps} /></div>
                    <div className="course-item-meta">
                      {clubShort(p)} · {p.escalao} · HCP {hcpDisplay(p.hcp)}
                      {ps?.roundsLast12m != null && <span> · {ps.roundsLast12m} rondas 12m</span>}
                      {ps?.avgSD8 != null && <span> · SD8: {ps.avgSD8.toFixed(1)}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <span className="chip cmp-chip">{slots.length}/4</span>
      </div>
      {slots.length > 0 && (
        <div className="flex-wrap-gap8">
          {slots.map((s, i) => {
            const ps = statsDb[s.fed];
            return (
              <span key={s.fed} className="p" style={{
                borderColor: COLORS[i], background: COLORS_LIGHT[i],
                display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", fontSize: 13, borderRadius: "var(--radius-pill)",
              }}>
                <span className="round flex-shrink-0" style={{ width: 10, height: 10, background: COLORS[i] }} />
                <b>{shortName(s.player.name)}</b>
                <span className="muted fs-11">HCP {hcpDisplay(s.player.hcp)}</span>
                <FormBadge ps={ps} /><TrendArrow ps={ps} />
                {s.loading && <span className="fs-11">⏳</span>}
                <button onClick={() => onRemove(s.fed)} className="cmp-remove-btn" title="Remover">✕</button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}


/* ═══════════════════ § 0b PERFIL HISTÓRICO POR BURACO ═══════════════════ */

/** Agrupa distâncias em baldes por par (para afinação da comparação histórica) */
function distBucket(par: number, dist: number): string {
  if (par === 3) {
    if (dist < 120) return "≤119";
    if (dist < 155) return "120-154";
    if (dist < 185) return "155-184";
    return "185+";
  }
  if (par === 4) {
    if (dist < 290) return "≤289";
    if (dist < 340) return "290-339";
    if (dist < 390) return "340-389";
    return "390+";
  }
  // par 5
  if (dist < 440) return "≤439";
  if (dist < 490) return "440-489";
  return "490+";
}

interface HoleBucket {
  n: number; sumDiff: number;
  eagle: number; birdie: number; parScore: number;
  bogey: number; double: number; triple: number;
}
type HoleProfile = Map<string, HoleBucket>; // key: "par|bkt" ou "par|all"

/** Constrói perfil de desempenho por par+distância a partir de todos os torneios */
function buildHoleProfile(data: PlayerPageData, simCourses: Course[]): HoleProfile {
  const map: HoleProfile = new Map();
  const getB = (key: string): HoleBucket => {
    if (!map.has(key)) map.set(key, { n:0,sumDiff:0,eagle:0,birdie:0,parScore:0,bogey:0,double:0,triple:0 });
    return map.get(key)!;
  };
  const addTo = (b: HoleBucket, diff: number) => {
    b.n++; b.sumDiff += diff;
    if (diff <= -2) b.eagle++;
    else if (diff === -1) b.birdie++;
    else if (diff === 0) b.parScore++;
    else if (diff === 1) b.bogey++;
    else if (diff === 2) b.double++;
    else b.triple++;
  };
  // Lookup rápido de campos por nome normalizado
  const courseByNorm = new Map<string, Course>();
  for (const c of simCourses) courseByNorm.set(norm(c.master.name), c);

  for (const cd of data.DATA) {
    const courseMatch = courseByNorm.get(norm(cd.course));
    for (const r of cd.rounds) {
      if (!isTournamentRound(r) || r._isTeamEvent) continue;
      const hd = data.HOLES[r.scoreId];
      if (!hd?.g || hd.g.length < 18) continue;

      // Tentar obter distâncias por buraco a partir do campo/tee histórico
      const distByHole: (number | null)[] = Array(18).fill(null);
      if (courseMatch) {
        const teeNorm = norm(r.tee || "");
        const tee = courseMatch.master.tees.find(t => norm(t.teeName) === teeNorm)
          ?? courseMatch.master.tees[0];
        if (tee?.holes) {
          for (const h of tee.holes) {
            if (h.hole >= 1 && h.hole <= 18) distByHole[h.hole - 1] = h.distance ?? null;
          }
        }
      }

      for (let i = 0; i < 18; i++) {
        const hg = hd.g[i]; const hp = hd.p[i];
        if (hg == null || hp == null || hp < 3 || hp > 5) continue;
        const diff = hg - hp;
        const dist = distByHole[i];
        // Sempre acumular no balde "all" deste par
        addTo(getB(`${hp}|all`), diff);
        // E também no balde por distância, se disponível
        if (dist != null && dist > 0) addTo(getB(`${hp}|${distBucket(hp, dist)}`), diff);
      }
    }
  }
  return map;
}

/** Devolve o balde mais específico disponível (dist → all como fallback) */
function lookupHoleBucket(
  profile: HoleProfile | null,
  par: number,
  dist: number | null | undefined,
): HoleBucket | null {
  if (!profile) return null;
  if (dist != null && dist > 0) {
    const specific = profile.get(`${par}|${distBucket(par, dist)}`);
    if (specific && specific.n >= 5) return specific;    // mínimo 5 para ser representativo
  }
  return profile.get(`${par}|all`) ?? null;
}


/* ─── Constantes de baldes ─── */
const PAR_BUCKETS: Record<number, string[]> = {
  3: ["≤119", "120-154", "155-184", "185+"],
  4: ["≤289", "290-339", "340-389", "390+"],
  5: ["≤439", "440-489", "490+"],
};

function bktLabel(bkt: string): string {
  const m: Record<string, string> = {
    "≤119":"≤ 119m","120-154":"120–154m","155-184":"155–184m","185+":"≥ 185m",
    "≤289":"≤ 289m","290-339":"290–339m","340-389":"340–389m","390+":"≥ 390m",
    "≤439":"≤ 439m","440-489":"440–489m","490+":"≥ 490m",
  };
  return m[bkt] ?? bkt;
}

/* Célula de balde: avg grande + barra larga + percentagens legíveis — 1 coluna por jogador */
/* Cores de score alinhadas com ScoreCircle: verde=sub-par, azul=sobre-par */
const BIRDIE_COLOR = SC.good;
const PAR_COLOR    = "var(--border-medium)";
const BOGEY_COLOR  = "#3b82f6";
const DBL_COLOR    = "#1e40af";

/* Célula de balde redesenhada */
function BucketCell({ bucket, bold = false }: {
  bucket: HoleBucket | null; bold?: boolean;
}) {
  if (!bucket || bucket.n === 0) {
    return <td style={{ padding:"10px 20px", color:"var(--text-4)", fontSize:13 }}>—</td>;
  }
  const avg    = bucket.sumDiff / bucket.n;
  const avgStr = avg >= 0 ? `+${avg.toFixed(2)}` : avg.toFixed(2);
  const avgCol = avg <= 0 ? BIRDIE_COLOR : avg <= 0.5 ? BOGEY_COLOR : DBL_COLOR;

  const nBirdie = bucket.eagle + bucket.birdie;
  const nPar    = bucket.parScore;
  const nBogey  = bucket.bogey;
  const nDbl    = bucket.double + bucket.triple;

  const bPct   = nBirdie / bucket.n * 100;
  const pPct   = nPar    / bucket.n * 100;
  const bogPct = nBogey  / bucket.n * 100;
  const dblPct = nDbl    / bucket.n * 100;

  const segs = [
    { pct:bPct,   n:nBirdie, bg:BIRDIE_COLOR, label:"🐦 birdie+" },
    { pct:pPct,   n:nPar,    bg:PAR_COLOR,    label:"par"        },
    { pct:bogPct, n:nBogey,  bg:BOGEY_COLOR,  label:"+1 bogey"   },
    { pct:dblPct, n:nDbl,    bg:DBL_COLOR,    label:"+2 double+" },
  ];

  return (
    <td style={{ padding:"10px 20px", verticalAlign:"middle" }}>
      {/* Média vs par */}
      <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:10 }}>
        <span style={{
          fontSize: bold ? 19 : 17, fontWeight: bold ? 900 : 800,
          fontFamily:"'JetBrains Mono',monospace", color: avgCol,
        }}>{avgStr}</span>
        <span style={{ fontSize:11, color:"var(--text-muted)" }}>vs par · {bucket.n} buracos</span>
      </div>
      {/* Barra + labels alinhados: uma coluna por segmento, label por baixo do seu segmento */}
      <div style={{ display:"flex", alignItems:"flex-start" }}>
        {segs.map((seg, i) => {
          if (seg.pct < 1) return null;
          const isFirst  = i === 0 || segs.slice(0,i).every(s => s.pct < 1);
          const isLast   = i === segs.length-1 || segs.slice(i+1).every(s => s.pct < 1);
          const tc = seg.bg === PAR_COLOR ? "var(--text-2)" : seg.bg;
          return (
            <div key={i} style={{ width:`${seg.pct}%`, flexShrink:0 }}>
              {/* Segmento da barra */}
              <div
                style={{
                  height:13, background:seg.bg, width:"100%",
                  borderRadius: isFirst && isLast ? 6 : isFirst ? "6px 0 0 6px" : isLast ? "0 6px 6px 0" : 0,
                }}
                title={`${seg.label}: ${seg.n} (${seg.pct.toFixed(0)}%)`}
              />
              {/* Label por baixo — overflow visível para segmentos estreitos */}
              <div style={{ marginTop:5, overflow:"visible", whiteSpace:"nowrap" }}>
                <div style={{ fontSize:13, fontWeight:700, color:tc, lineHeight:1.2 }}>
                  {seg.n}
                  <span style={{ fontSize:11, fontWeight:500, marginLeft:3, opacity:0.85 }}>
                    ({seg.pct.toFixed(0)}%)
                  </span>
                </div>
                <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:1 }}>{seg.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </td>
  );
}

function HoleProfileSection({ slots, refTee, holesMode }: {
  slots: Slot[];
  refTee: Tee | null;
  holesMode: "18" | "front9" | "back9";
}) {
  const { simCourses } = useAppContext();
  const loaded = slots.filter(s => s.player);
  const teeHex = refTee ? getTeeHex(refTee.teeName, refTee.scorecardMeta?.teeColor) : BOGEY_COLOR;
  const teeTextColor = textOnColor(teeHex);

  const profiles = useMemo(
    () => loaded.map(s => s.data ? buildHoleProfile(s.data, simCourses) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, simCourses],
  );

  const holes = useMemo(() => {
    if (!refTee) return [];
    const all = [...(refTee.holes ?? [])].filter(h => h.par != null).sort((a, b) => a.hole - b.hole);
    if (holesMode === "front9") return all.filter(h => h.hole <= 9);
    if (holesMode === "back9") return all.filter(h => h.hole > 9);
    return all;
  }, [refTee, holesMode]);

  if (!refTee || holes.length === 0 || loaded.every(s => !s.data)) return null;

  const hasDistances = holes.some(h => (h.distance ?? 0) > 0);
  const parTypes = ([3, 4, 5] as const).filter(p => holes.some(h => h.par === p));

  const parColor = (p: number) =>
    p === 3 ? "var(--color-success)" : p === 4 ? "var(--color-info)" : "var(--color-warn)";

  return (
    <div style={{ marginTop: 20 }}>
      <div className="h-md mb-4">🔍 Perfil Histórico por Tipo de Buraco</div>
      <div className="muted fs-11 mb-16">
        Como cada jogador se comporta em torneios, agrupado por par e distância.
        As linhas em destaque correspondem às distâncias dos buracos deste campo.
      </div>

      {/* ── Uma tabela por par ── */}
      {parTypes.map(par => {
        const parHoles = holes.filter(h => h.par === par);
        const buckets  = PAR_BUCKETS[par];

        // Que baldes têm buracos deste campo?
        const usedBkts = new Set<string>();
        if (hasDistances) {
          for (const h of parHoles) {
            if (h.distance) usedBkts.add(distBucket(par, h.distance));
          }
        }

        return (
          <div key={par} style={{
            border: "1px solid var(--border)", borderRadius: "var(--radius)",
            marginBottom: 14, overflow: "hidden",
          }}>
            {/* Cabeçalho do par */}
            <div style={{
              background: "var(--bg-header)", padding: "8px 14px",
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            }}>
              <span className="fs-13 fw-700" style={{ color: parColor(par) }}>
                Par {par}
              </span>
              <span className="muted fs-11">
                {parHoles.length} buraco{parHoles.length !== 1 ? "s" : ""} neste campo
              </span>
              {hasDistances && parHoles.length > 0 && (
                <span className="muted fs-11">
                  ({parHoles.map(h => `B${h.hole}${h.distance ? ` ${h.distance}m` : ""}`).join("  ·  ")})
                </span>
              )}
            </div>

            <div className="table-wrap">
              <table className="dtable-lg fs-12" style={{ width:"100%" }}>
                <colgroup>
                  <col style={{ width: "22%" }} />
                  {loaded.map((_, i) => <col key={i} style={{ width: `${78 / loaded.length}%` }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th>Distância</th>
                    {loaded.map((s, i) => (
                      <th key={i} style={{ color: COLORS[i] }}>
                        {firstName(s.player.name)} — média · distribuição
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buckets.map(bkt => {
                    const isUsed = usedBkts.has(bkt);
                    const holesInBkt = isUsed
                      ? parHoles.filter(h => h.distance && distBucket(par, h.distance) === bkt)
                      : [];

                    return (
                      <tr key={bkt} style={{
                        background: isUsed ? "var(--bg-info-subtle, rgba(59,130,246,.06))" : undefined,
                      }}>
                        <td style={{ padding:"12px 14px" }}>
                          <span style={{ fontSize:14, fontWeight:700 }}>{bktLabel(bkt)}</span>
                          {isUsed && (
                            <div style={{ marginTop:5, display:"flex", flexWrap:"wrap", gap:4 }}>
                              {holesInBkt.map(h => (
                                <span key={h.hole} style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
                                  <span style={{
                                    padding:"2px 9px", borderRadius:20,
                                    background:teeHex, color:teeTextColor,
                                    fontSize:12, fontWeight:800,
                                  }}>B{h.hole}</span>
                                  {h.distance && (
                                    <span style={{ fontSize:12, fontWeight:600, color:"var(--text-2)" }}>
                                      {h.distance}m
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        {loaded.map((_, i) => (
                          <BucketCell
                            key={i}
                            bucket={profiles[i]?.get(`${par}|${bkt}`) ?? null}
                          />
                        ))}
                      </tr>
                    );
                  })}

                  {/* Linha total */}
                  <tr style={{ borderTop:"2px solid var(--border)", background:"var(--bg-header)" }}>
                    <td className="fw-700 fs-11 c-text-3">Todos Par {par}</td>
                    {loaded.map((_, i) => (
                      <BucketCell
                        key={i}
                        bucket={profiles[i]?.get(`${par}|all`) ?? null}
                        bold
                      />
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* ── Tabela buraco a buraco (só se tiver distâncias) ── */}
      {hasDistances && (
        <>
          <div className="fs-12 fw-600 c-text-2 mb-8 mt-4">⛳ Buraco a Buraco — grupo de distância aplicado</div>
          <div className="table-wrap">
            <table className="dtable-lg fs-12">
              <thead>
                <tr>
                  <th className="r">H</th>
                  <th>Par</th>
                  <th>Dist · Grupo</th>
                  <th className="r">SI</th>
                  {loaded.map((s, i) => (
                    <th key={i} style={{ color: COLORS[i] }}>{firstName(s.player.name)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holes.map(hole => {
                  const dist = hole.distance ?? null;
                  const bkt  = dist ? distBucket(hole.par!, dist) : null;
                  const usingAll = bkt != null && loaded.some((_, i) => {
                    const specific = profiles[i]?.get(`${hole.par}|${bkt}`);
                    return !specific || specific.n < 5;
                  });

                  return (
                    <tr key={hole.hole}>
                      <td className="r fw-700">{hole.hole}</td>
                      <td className="fw-600" style={{ color: parColor(hole.par!) }}>P{hole.par}</td>
                      <td className="fs-11">
                        {dist ? `${dist}m` : "–"}
                        {bkt && (
                          <span className="muted ml-6" style={{ fontSize: 10 }}>
                            {bktLabel(bkt)}
                            {usingAll && " *"}
                          </span>
                        )}
                      </td>
                      <td className="r muted">{hole.si ?? "–"}</td>
                      {loaded.map((_, i) => {
                        const b = lookupHoleBucket(profiles[i], hole.par!, dist);
                        if (!b || b.n === 0) return <td key={i} className="r muted">–</td>;
                        const avg = b.sumDiff / b.n;
                        const col = avg <= 0 ? SC.good : avg <= 0.6 ? SC.warn : SC.danger;
                        const avgStr = avg >= 0 ? `+${avg.toFixed(2)}` : avg.toFixed(2);
                        const bPct  = (b.eagle + b.birdie) / b.n * 100;
                        const bogPct= b.bogey / b.n * 100;
                        const dblPct= (b.double + b.triple) / b.n * 100;
                        return (
                          <td key={i}>
                            <span className="mono fw-700" style={{ color: col }}>{avgStr}</span>
                            <span className="muted fs-10 ml-6">
                              🐦{bPct.toFixed(0)}% +1:{bogPct.toFixed(0)}% +2:{dblPct.toFixed(0)}%
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="muted fs-11 mt-6">
            * sem dados suficientes no grupo de distância (mín. 5 buracos) — usada média total do par
          </div>
        </>
      )}

      <div className="muted fs-11 mt-10">
        Barra:{" "}
        <span style={{color:SC.good}}>■</span> birdie+{" "}
        <span style={{color:"var(--border-medium)"}}>■</span> par{" "}
        <span style={{color:SC.warn}}>■</span> bogey{" "}
        <span style={{color:SC.danger}}>■</span> double+ · apenas torneios (excl. EDS/Indiv/Treinos)
      </div>
    </div>
  );
}


/* ═══════════════════ § 0 PREPARAR RONDA ═══════════════════ */

/** WHS 2024 — Expected 9h Score Differential (igual ao SimuladorPage) */



function RoundPrepSection({ slots }: { slots: Slot[] }) {
  const { simCourses } = useAppContext();
  const [courseQ, setCourseQ] = useState("");
  const [courseOpen, setCourseOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [pcc, setPcc] = useState(0);
  const [allowance, setAllowance] = useState(100);
  const [holesMode, setHolesMode] = useState<"18" | "front9" | "back9">("18");
  // Tee por jogador: indexed by slot position (0-3)
  const [playerTeeIds, setPlayerTeeIds] = useState<Record<number, string>>({});
  const courseSearchRef = useRef<HTMLDivElement>(null);

  const is9h = holesMode === "front9" || holesMode === "back9";
  const loaded = slots.filter(s => s.player);

  // Course search
  const courseResults = useMemo(() => {
    if (!courseQ.trim()) return [];
    const words = norm(courseQ).split(/\s+/).filter(Boolean);
    return simCourses.filter(c =>
      words.every(w => norm(c.master.name + " " + (c.master.country ?? "")).includes(w))
    ).slice(0, 8);
  }, [courseQ, simCourses]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (courseSearchRef.current && !courseSearchRef.current.contains(e.target as Node)) setCourseOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Tees disponíveis para o modo actual
  const availableTees: Tee[] = useMemo(() => {
    if (!selectedCourse) return [];
    return sortTees(selectedCourse.master.tees.filter(t => {
      if (is9h) return get9hRatings(t, holesMode as "front9" | "back9") !== null;
      return t.ratings?.holes18?.courseRating && t.ratings?.holes18?.slopeRating;
    }));
  }, [selectedCourse, holesMode, is9h]);

  // Ao mudar campo ou modo: reset dos tees por jogador
  useEffect(() => {
    if (!selectedCourse) { setPlayerTeeIds({}); return; }
    if (availableTees.length === 0) { setPlayerTeeIds({}); return; }
    // Manter tee se ainda válido; caso contrário atribuir o primeiro disponível
    setPlayerTeeIds(prev => {
      const next: Record<number, string> = {};
      loaded.forEach((_, i) => {
        const cur = prev[i];
        next[i] = (cur && availableTees.find(t => t.teeId === cur)) ? cur : availableTees[0].teeId;
      });
      return next;
    });
  }, [selectedCourse, availableTees]);

  // Ao adicionar/remover jogadores: garantir que têm tee atribuído
  useEffect(() => {
    if (availableTees.length === 0) return;
    setPlayerTeeIds(prev => {
      const next = { ...prev };
      loaded.forEach((_, i) => {
        if (!next[i] || !availableTees.find(t => t.teeId === next[i])) {
          next[i] = availableTees[0].teeId;
        }
      });
      return next;
    });
  }, [loaded.length, availableTees]);

  const setPlayerTee = (playerIdx: number, teeId: string) => {
    setPlayerTeeIds(prev => ({ ...prev, [playerIdx]: teeId }));
  };

  // Ratings e tee por jogador
  const getTeeRatings = (tee: Tee | null) => {
    if (!tee) return null;
    if (!is9h) {
      const r = tee.ratings?.holes18;
      if (!r?.courseRating || !r?.slopeRating) return null;
      return { cr: r.courseRating, slope: r.slopeRating, par: r.par ?? 72 };
    }
    const r9 = get9hRatings(tee, holesMode as "front9" | "back9");
    return r9 ? { cr: r9.cr, slope: r9.slope, par: r9.par } : null;
  };

  // Cálculos WHS por jogador
  // FÓRMULA FPG 9h VERIFICADA em 08-03-2026 (3 jogadores, 3/3 ✅):
  //   effectiveHI = round(HI / 2)           ← round, não floor nem raw
  //   CourseHCP   = floor(effectiveHI × Slope/113 + CR − Par)
  //   CourseHCP   = max(1, CourseHCP)        ← FPG aplica mínimo 1 em competição
  const playerCalcs = useMemo(() => {
    return loaded.map((s, i) => {
      const tee = availableTees.find(t => t.teeId === playerTeeIds[i]) ?? availableTees[0] ?? null;
      const ratings = getTeeRatings(tee);
      const hi = s.player.hcp;
      const base = { name: s.player.name, escalao: s.player.escalao, hi, tee, ratings };
      if (hi == null || !ratings) return { ...base, effectiveHI: null, courseHcp: null, courseHcpRounded: null, playingHcp: null, targetGross: null, exp9hSD: null };

      const effectiveHI = is9h ? Math.round(hi / 2) : hi;
      const courseHcpRaw = calcCourseHcp(effectiveHI, ratings.slope, ratings.cr, ratings.par);
      const courseHcpRounded = Math.max(1, Math.floor(courseHcpRaw));
      const playingHcp = Math.max(1, Math.floor(courseHcpRaw * (allowance / 100)));
      const targetGross = Math.round(ratings.par + courseHcpRaw);
      const exp9hSD = is9h ? expectedSD9(hi) : null;

      return { ...base, effectiveHI, courseHcp: courseHcpRaw, courseHcpRounded, playingHcp, targetGross, exp9hSD };
    });
  }, [loaded, availableTees, playerTeeIds, allowance, is9h, holesMode]);

  // Buracos de referência para a tabela SI: tee do 1º jogador (ou primeiro disponível)
  const refTee = availableTees.find(t => t.teeId === playerTeeIds[0]) ?? availableTees[0] ?? null;
  const holesData = useMemo(() => {
    if (!refTee) return [];
    const all = [...refTee.holes]
      .filter(h => h.par != null && h.si != null)
      .sort((a, b) => a.hole - b.hole);
    if (holesMode === "front9") return all.filter(h => h.hole <= 9);
    if (holesMode === "back9") return all.filter(h => h.hole > 9);
    return all;
  }, [refTee, holesMode]);

  const hasHolesData = holesData.length > 0 && holesData.every(h => h.si != null);
  // Os buracos só são mostrados se todos os jogadores estão no mesmo tee
  const allSameTee = loaded.length > 0 && loaded.every((_, i) => playerTeeIds[i] === playerTeeIds[0]);

  return (
    <div className="card">
      {/* Header */}
      <div className="h-md flex-center-gap10 flex-wrap mb-14">
        <span>⛳ Preparar Ronda</span>
        {selectedCourse && <span className="muted fs-11 fw-400">{selectedCourse.master.name}</span>}
        {is9h && selectedCourse && <span className="chip fs-11">{holesMode === "front9" ? "Front 9" : "Back 9"}</span>}
      </div>

      {/* Configuração global */}
      <div className="flex-wrap-gap8 mb-14" style={{ alignItems: "flex-end" }}>
        {/* Campo */}
        <div style={{ position: "relative", minWidth: 220 }} ref={courseSearchRef}>
          <label className="fs-11 fw-600 c-text-3 mb-4" style={{ display: "block" }}>Campo</label>
          <input className="input" style={{ width: "100%" }}
            value={selectedCourse ? selectedCourse.master.name : courseQ}
            placeholder="Pesquisar campo…"
            onChange={e => { setCourseQ(e.target.value); setSelectedCourse(null); setCourseOpen(true); }}
            onFocus={() => !selectedCourse && setCourseOpen(true)}
          />
          {courseOpen && courseResults.length > 0 && (
            <div className="cmp-dropdown" style={{ top: "100%", zIndex: 50 }}>
              {courseResults.map(c => (
                <button key={c.courseKey} className="course-item" onClick={() => { setSelectedCourse(c); setCourseQ(""); setCourseOpen(false); }}>
                  <div className="course-item-name">{c.master.name}</div>
                  <div className="course-item-meta">{c.master.country ?? ""} · {c.master.tees.length} tees</div>
                </button>
              ))}
            </div>
          )}
          {selectedCourse && (
            <button className="cmp-remove-btn" style={{ position: "absolute", right: 8, top: 28 }}
              onClick={() => { setSelectedCourse(null); setCourseQ(""); setPlayerTeeIds({}); }}>✕</button>
          )}
        </div>

        {/* Buracos */}
        {selectedCourse && (
          <div>
            <label className="fs-11 fw-600 c-text-3 mb-4" style={{ display: "block" }}>Buracos</label>
            <select className="select" value={holesMode} onChange={e => {
              setHolesMode(e.target.value as "18" | "front9" | "back9");
              setPlayerTeeIds({});
            }}>
              <option value="18">18 Buracos</option>
              <option value="front9">Front 9</option>
              <option value="back9">Back 9</option>
            </select>
          </div>
        )}

        {/* PCC */}
        {selectedCourse && availableTees.length > 0 && (
          <div>
            <label className="fs-11 fw-600 c-text-3 mb-4" style={{ display: "block" }}>PCC</label>
            <select className="select" value={pcc} onChange={e => setPcc(Number(e.target.value))}>
              {[-3, -2, -1, 0, 1, 2, 3].map(v => <option key={v} value={v}>{v === 0 ? "PCC 0" : v > 0 ? `PCC +${v}` : `PCC ${v}`}</option>)}
            </select>
          </div>
        )}

        {/* Allowance */}
        {selectedCourse && availableTees.length > 0 && (
          <div>
            <label className="fs-11 fw-600 c-text-3 mb-4" style={{ display: "block" }}>Allowance</label>
            <select className="select" value={allowance} onChange={e => setAllowance(Number(e.target.value))}>
              <option value={100}>100%</option>
              <option value={95}>95%</option>
              <option value={90}>90%</option>
              <option value={85}>85%</option>
              <option value={75}>75%</option>
            </select>
          </div>
        )}
      </div>

      {selectedCourse && availableTees.length === 0 && (
        <div className="notice notice-warn mb-12 fs-12">
          ⚠ Sem tees com ratings para {is9h ? (holesMode === "front9" ? "Front 9" : "Back 9") : "18 buracos"}
        </div>
      )}

      {/* Nota informativa 9h */}
      {is9h && selectedCourse && availableTees.length > 0 && (
        <div className="notice notice-warn mb-12 fs-12">
          <strong>Regra WHS 9 buracos:</strong> Course HCP = <strong>floor( HI÷2 × Slope÷113 + CR−Par )</strong>.
          O SD da ronda combina-se com o <em>Expected SD 9h</em> (função do HI) para obter o SD 18h equivalente.
        </div>
      )}

      {/* ── Tabela por jogador com tee individual ── */}
      {loaded.length > 0 && selectedCourse && availableTees.length > 0 && (
        <div className="table-wrap mb-14">
          <table className="dtable-lg">
            <thead>
              <tr>
                <th>Jogador</th>
                <th>Tee</th>
                <th className="r">CR</th>
                <th className="r">Slope</th>
                <th className="r">Par</th>
                <th className="r">HI</th>
                {is9h && <th className="r">HI÷2</th>}
                <th className="r">Course HCP</th>
                <th className="r">Playing HCP{allowance !== 100 ? ` (${allowance}%)` : ""}</th>
                <th className="r">Target Gross</th>
                {is9h && <th className="r">Exp. SD 9h</th>}
              </tr>
            </thead>
            <tbody>
              {playerCalcs.map((pc, i) => {
                const teeHex = pc.tee ? getTeeHex(pc.tee.teeName, pc.tee.scorecardMeta?.teeColor) : "#888";
                const teeOptions = availableTees;
                if (pc.hi == null || !pc.ratings) {
                  return (
                    <tr key={i}>
                      <td>
                        <span className="round" style={{ width: 10, height: 10, background: COLORS[i], display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
                        <span style={{ fontWeight: 700 }}>{firstName(pc.name)}</span>
                        <span className="c-text-3 fs-11 ml-6">{pc.escalao}</span>
                      </td>
                      <td>
                        <select className="select select-sm" value={playerTeeIds[i] ?? ""} onChange={e => setPlayerTee(i, e.target.value)}>
                          {teeOptions.map(t => <option key={t.teeId} value={t.teeId}>{t.teeName} ({t.sex})</option>)}
                        </select>
                      </td>
                      <td className="r c-text-3" colSpan={is9h ? 8 : 6}>Sem HCP</td>
                    </tr>
                  );
                }
                return (
                  <tr key={i}>
                    <td>
                      <span className="round" style={{ width: 10, height: 10, background: COLORS[i], display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
                      <span style={{ fontWeight: 700 }}>{firstName(pc.name)}</span>
                      <span className="c-text-3 fs-11 ml-6">{pc.escalao}</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: teeHex, display: "inline-block", border: "1px solid rgba(0,0,0,.2)", flexShrink: 0 }} />
                        <select className="select select-sm" value={playerTeeIds[i] ?? ""} onChange={e => setPlayerTee(i, e.target.value)}>
                          {teeOptions.map(t => <option key={t.teeId} value={t.teeId}>{t.teeName} ({t.sex})</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="r mono fs-12">{pc.ratings.cr.toFixed(1)}</td>
                    <td className="r mono fs-12">{pc.ratings.slope}</td>
                    <td className="r mono fs-12">{pc.ratings.par}</td>
                    <td className="r mono">{pc.hi?.toFixed(1)}</td>
                    {is9h && <td className="r mono c-text-3">{pc.effectiveHI?.toFixed(2)}</td>}
                    <td className="r mono">{pc.courseHcp?.toFixed(2)} <span className="muted fs-11">= {pc.courseHcpRounded}</span></td>
                    <td className="r mono fw-700" style={{ color: COLORS[i] }}>{pc.playingHcp}</td>
                    <td className="r mono">{pc.targetGross}</td>
                    {is9h && <td className="r mono" style={{ color: "var(--color-info)" }}>{pc.exp9hSD?.toFixed(1) ?? "–"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabela SI — só quando todos jogadores no mesmo tee e há dados de buracos */}
      {hasHolesData && playerCalcs.some(p => p.courseHcpRounded != null) && (
        <>
          <div className="fs-12 fw-600 c-text-2 mb-6">
            Distribuição de Pancadas por Buraco
            {!allSameTee && <span className="muted fw-400 ml-6 fs-11">(SI do tee de {firstName(playerCalcs[0]?.name ?? "jogador 1")})</span>}
            <span className="muted fs-11 fw-400 ml-6">(Course HCP, não Playing HCP)</span>
          </div>
          <div className="table-wrap" style={{ overflowX: "auto" }}>
            <table className="dtable-lg" style={{ minWidth: 500 }}>
              <thead>
                <tr>
                  <th className="r">H</th>
                  <th className="r">Par</th>
                  <th className="r">SI</th>
                  {playerCalcs.map((pc, i) => (
                    <th key={i} className="r" style={{ color: COLORS[i] }}>
                      {firstName(pc.name)}
                      {pc.courseHcpRounded != null && <span className="fw-400 fs-10"> ({pc.courseHcpRounded})</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holesData.map((hole) => {
                  if (hole.par == null || hole.si == null) return null;
                  return (
                    <tr key={hole.hole}>
                      <td className="r fw-700">{hole.hole}</td>
                      <td className="r c-text-3">P{hole.par}</td>
                      <td className="r c-text-3">{hole.si}</td>
                      {playerCalcs.map((pc, i) => {
                        if (pc.courseHcpRounded == null) return <td key={i} className="r c-text-3">–</td>;
                        const hd = calcStrokesPerHole([{ hole: hole.hole, par: hole.par!, si: hole.si! }], pc.courseHcpRounded)[0];
                        const strokes = hd?.strokes ?? 0;
                        const maxScore = hd?.maxScore ?? (hole.par! + 2);
                        return (
                          <td key={i} className="r" title={`NDB máx: ${maxScore}`}
                            style={{ fontWeight: strokes > 0 ? 700 : 400, color: strokes > 0 ? COLORS[i] : "var(--text-3)" }}>
                            {strokes > 0 ? `+${strokes}` : "·"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr style={{ borderTop: "2px solid var(--border)", background: "var(--bg-header)" }}>
                  <td className="r fw-700 fs-11 c-text-3" colSpan={3}>HCP Jogo</td>
                  {playerCalcs.map((pc, i) => (
                    <td key={i} className="r fw-800" style={{ color: COLORS[i] }}>
                      {pc.courseHcpRounded != null ? pc.courseHcpRounded : "–"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="muted fs-11 mt-6">
            SI = Stroke Index · +1/+2 = pancadas de handicap neste buraco · NDB = Net Double Bogey = Par + 2 + pancadas
            {is9h && " · 9h: Course HCP = floor( (HI÷2) × Slope÷113 + CR−Par ) — compatível com FPG"}
          </div>
        </>
      )}

      {/* ── Perfil histórico por tipo de buraco ── */}
      {selectedCourse && refTee && loaded.some(s => s.data) && (
        <HoleProfileSection
          slots={slots}
          refTee={refTee}
          holesMode={holesMode}
        />
      )}

      {!selectedCourse && (
        <div className="muted fs-13 ta-c p-16" style={{ color: "var(--text-3)" }}>
          Selecciona um campo para ver os handicaps e a distribuição de pancadas.
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ § 2 TABELA COMPARATIVA ═══════════════════ */

function StatsTable({ slots, allAgg, statsDb }: { slots: Slot[]; allAgg: (AggStats | null)[]; statsDb: PlayerStatsDb }) {
  const loaded = slots.map((s, i) => ({ s, agg: allAgg[i], i })).filter(x => x.agg);
  if (loaded.length < 2) return null;

  type Row = { label: string; values: (string | null)[]; best?: "low" | "high"; emoji?: string; section?: string };
  const rows: Row[] = [];
  const val = (fn: (agg: AggStats | null) => string | null) => loaded.map(x => fn(x.agg));
  const pVal = (fn: (ps: PlayerStats | undefined) => string | null) => loaded.map(x => fn(statsDb[x.s.fed]));

  rows.push({ section: "Actividade", label: "Última ronda", emoji: "🕐", values: pVal(ps => { const d = daysSince(ps); if (d == null) return null; if (d <= 1) return "Hoje"; return `${d} dias`; }), best: "low" });
  rows.push({ label: "Rondas 12m", emoji: "📅", values: pVal(ps => ps?.roundsLast12m != null ? String(ps.roundsLast12m) : null), best: "high" });
  rows.push({ label: "Rondas 3m", emoji: "🗓️", values: pVal(ps => ps?.roundsLast3m != null ? String(ps.roundsLast3m) : null), best: "high" });
  rows.push({ label: "Tendência HCP", emoji: "📉", values: pVal(ps => { if (!ps) return null; const arrow = ps.hcpTrend === "up" ? "↗ A melhorar" : ps.hcpTrend === "down" ? "↘ A subir" : "→ Estável"; return ps.hcpDelta3m != null ? `${arrow} (${ps.hcpDelta3m > 0 ? "+" : ""}${ps.hcpDelta3m})` : arrow; }) });
  rows.push({ label: "Forma", emoji: "🔥", values: pVal(ps => { if (!ps?.formAlert) return "Normal"; return ps.formAlert === "hot" ? "🔥 Boa forma" : "❄️ Má forma"; }) });

  rows.push({ section: "Torneios", label: "Rondas Torneio", emoji: "🏟️", values: val((a) => a ? String(a.nRounds) : null), best: "high" });
  rows.push({ label: "Melhor Gross", emoji: "🏆", values: val((a) => a?.bestGross != null ? String(a.bestGross) : null), best: "low" });
  rows.push({ label: "Gross Médio", emoji: "📊", values: val((a) => a?.avgGross != null ? a.avgGross.toFixed(0) : null), best: "low" });
  rows.push({ label: "SD Médio", emoji: "📈", values: val((a) => a?.avgSD != null ? a.avgSD.toFixed(1) : null), best: "low" });
  rows.push({ label: "SD Últimas 5", emoji: "⭐", values: val((a) => a?.last5AvgSD != null ? a.last5AvgSD.toFixed(1) : null), best: "low" });
  rows.push({ label: "SD de Sempre", emoji: "💎", values: val((a) => a?.bestSD != null ? a.bestSD.toFixed(1) : null), best: "low" });

  rows.push({ section: "Análise", label: "Panc. s/ Par/Volta", emoji: "🎯", values: val((a) => a ? fD(a.totalStrokesOverPar) : null), best: "low" });
  rows.push({ label: "Par ou Melhor", emoji: "⛳", values: val((a) => a ? pct(a.parOrBetterPct) : null), best: "high" });
  rows.push({ label: "Dbl+ ou Pior", emoji: "⚠️", values: val((a) => a ? pct(a.dblOrWorsePct) : null), best: "low" });
  rows.push({ label: "Par 3 vs Par", emoji: "🟢", values: val((a) => a?.byPar[3] ? fD2(a.byPar[3].avgVsPar) : null), best: "low" });
  rows.push({ label: "Par 4 vs Par", emoji: "🔵", values: val((a) => a?.byPar[4] ? fD2(a.byPar[4].avgVsPar) : null), best: "low" });
  rows.push({ label: "Par 5 vs Par", emoji: "🟣", values: val((a) => a?.byPar[5] ? fD2(a.byPar[5].avgVsPar) : null), best: "low" });

  const bestIdx = rows.map(r => {
    const nums = r.values.map(v => v != null ? parseFloat(v.replace(/[+%↗↘→a-zA-ZÀ-ú🔥❄️ ()]/g, "")) : null);
    const valid = nums.filter((n): n is number => n != null && !isNaN(n));
    if (valid.length < 2) return -1;
    const target = r.best === "high" ? Math.max(...valid) : Math.min(...valid);
    return nums.indexOf(target);
  });

  return (
    <div className="card p-0 no-overflow">
      <div className="h-md p-14" style={{ paddingBottom: 0 }}>Comparação Detalhada <span className="muted fs-11 fw-400">(apenas torneios)</span></div>
      <div className="table-wrap mt-8">
        <table className="dtable-lg fs-13">
          <thead>
            <tr>
              <th style={{ minWidth: 140 }}>Métrica</th>
              {loaded.map(x => <th key={x.i} className="r" style={{ color: COLORS[x.i], minWidth: 80 }}>{firstName(x.s.player.name)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <React.Fragment key={ri}>
                {r.section && (
                  <tr>
                    <td colSpan={loaded.length + 1} className="fw-700 fs-11 c-text-3 uppercase" style={{ paddingTop: ri > 0 ? 12 : 6, paddingBottom: 2, borderBottom: "1px solid var(--border-light)", letterSpacing: "0.05em" }}>
                      {r.section}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="fw-600 fs-12"><span style={{ marginRight: 6 }}>{r.emoji}</span>{r.label}</td>
                  {loaded.map((x, ci) => {
                    const v = r.values[ci];
                    const isBest = bestIdx[ri] === ci;
                    return (
                      <td key={ci} className="r" style={{ fontWeight: isBest ? 800 : 400, color: isBest ? COLORS[x.i] : undefined, fontFamily: "'JetBrains Mono', monospace", background: isBest ? COLORS_LIGHT[x.i] : undefined }}>
                        {v ?? "–"}
                      </td>
                    );
                  })}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════ § 3 PAINEL "QUEM GANHA EM QUÊ" ═══════════════════ */

function CategoryScorecardSection({ slots, allAgg, statsDb }: { slots: Slot[]; allAgg: (AggStats | null)[]; statsDb: PlayerStatsDb }) {
  const loaded = slots.map((s, i) => ({ s, agg: allAgg[i], i })).filter(x => x.agg);
  if (loaded.length < 2) return null;

  type Cat = { label: string; emoji: string; getValue: (agg: AggStats, ps?: PlayerStats) => number | null; dir: "low" | "high" };
  const categories: Cat[] = [
    { label: "Gross Médio", emoji: "📊", getValue: a => a.avgGross, dir: "low" },
    { label: "Melhor Gross", emoji: "🏆", getValue: a => a.bestGross, dir: "low" },
    { label: "SD Médio", emoji: "📈", getValue: a => a.avgSD, dir: "low" },
    { label: "SD Últ. 5", emoji: "⭐", getValue: a => a.last5AvgSD, dir: "low" },
    { label: "Par 3", emoji: "🟢", getValue: a => a.byPar[3]?.avgVsPar ?? null, dir: "low" },
    { label: "Par 4", emoji: "🔵", getValue: a => a.byPar[4]?.avgVsPar ?? null, dir: "low" },
    { label: "Par 5", emoji: "🟣", getValue: a => a.byPar[5]?.avgVsPar ?? null, dir: "low" },
    { label: "Par ou Melhor%", emoji: "⛳", getValue: a => a.parOrBetterPct, dir: "high" },
    { label: "Dbl+ %", emoji: "⚠️", getValue: a => a.dblOrWorsePct, dir: "low" },
    { label: "Birdies %", emoji: "🐦", getValue: a => a.scoreDist.total > 0 ? a.scoreDist.birdie / a.scoreDist.total * 100 : null, dir: "high" },
    { label: "Consistência", emoji: "📐", getValue: a => a.grossStdDev, dir: "low" },
    { label: "Rondas", emoji: "🏟️", getValue: a => a.nRounds, dir: "high" },
    { label: "Front 9", emoji: "➡️", getValue: a => a.f9sl, dir: "low" },
    { label: "Back 9", emoji: "⬅️", getValue: a => a.b9sl, dir: "low" },
    { label: "Forma", emoji: "🔥", getValue: (a, ps) => ps?.formAlert === "hot" ? 1 : ps?.formAlert === "cold" ? -1 : 0, dir: "high" },
  ];

  const medals = loaded.map(() => 0);
  const results: { cat: Cat; winnerIdx: number; values: (number | null)[] }[] = [];

  for (const cat of categories) {
    const values = loaded.map(x => cat.getValue(x.agg!, statsDb[x.s.fed]));
    const valid = values.filter((v): v is number => v != null);
    if (valid.length < 2) { results.push({ cat, winnerIdx: -1, values }); continue; }
    const best = cat.dir === "low" ? Math.min(...valid) : Math.max(...valid);
    const winnerIdx = values.indexOf(best);
    // Only award if unique best
    const bestCount = values.filter(v => v === best).length;
    const winner = bestCount === 1 ? winnerIdx : -1;
    if (winner >= 0) medals[winner]++;
    results.push({ cat, winnerIdx: winner, values });
  }

  const maxMedals = Math.max(...medals);

  return (
    <div className="card">
      <div className="h-md mb-4">🏅 Quem Ganha em Quê</div>
      <div className="muted fs-11 mb-12">Categoria a categoria — quem tem a melhor métrica</div>

      {/* Scoreboard */}
      <div className="caKpis mb-14">
        {loaded.map((x, i) => (
          <div key={i} className="caKpi" style={{ borderColor: medals[i] === maxMedals && medals[i] > 0 ? COLORS[i] : undefined }}>
            <div className="caKpiVal" style={{ color: COLORS[i] }}>{medals[i]}</div>
            <div className="caKpiLbl">{firstName(x.s.player.name)} {medals[i] === maxMedals && medals[i] > 0 ? "🥇" : ""}</div>
          </div>
        ))}
      </div>

      {/* Grid de categorias */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
        {results.map(({ cat, winnerIdx, values }, ri) => (
          <div key={ri} style={{
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius)",
            padding: "8px 10px",
            background: winnerIdx >= 0 ? COLORS_LIGHT[winnerIdx] : "var(--bg-muted)",
            borderColor: winnerIdx >= 0 ? COLORS[winnerIdx] : undefined,
          }}>
            <div className="fs-11 fw-600 c-text-3 mb-4">{cat.emoji} {cat.label}</div>
            {loaded.map((x, i) => {
              const v = values[i];
              const isWinner = winnerIdx === i;
              return (
                <div key={i} className="flex-center-gap8" style={{ marginBottom: 2 }}>
                  <span className="round flex-shrink-0" style={{ width: 8, height: 8, background: COLORS[i] }} />
                  <span className="fs-11 mono" style={{ fontWeight: isWinner ? 800 : 400, color: isWinner ? COLORS[i] : "var(--text-2)" }}>
                    {v != null ? (Number.isInteger(v) ? v : v.toFixed(1)) : "–"}
                  </span>
                  {isWinner && <span className="fs-10">✓</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════ § 4 SWOT ═══════════════════ */

function SwotSection({ slots, allAgg, statsDb }: { slots: Slot[]; allAgg: (AggStats | null)[]; statsDb: PlayerStatsDb }) {
  const loaded = slots.map((s, i) => ({ s, agg: allAgg[i], i })).filter(x => x.agg);
  if (loaded.length < 2) return null;

  type SwotItem = { text: string; type: "S" | "W" | "O" | "T" };

  function buildSwot(idx: number): SwotItem[] {
    const agg = loaded[idx].agg!;
    const ps = statsDb[loaded[idx].s.fed];
    const others = loaded.filter((_, i) => i !== idx).map(x => x.agg!);
    const items: SwotItem[] = [];

    // ── FORÇAS ──
    // Best par type
    for (const pt of [3, 4, 5]) {
      const mine = agg.byPar[pt]?.avgVsPar;
      if (mine == null) continue;
      const allOthers = others.map(o => o.byPar[pt]?.avgVsPar).filter((v): v is number => v != null);
      if (allOthers.length > 0 && mine < Math.min(...allOthers) - 0.05) {
        items.push({ type: "S", text: `Melhor nos Par ${pt} (${fD2(mine)} vs par)` });
      }
    }
    if (agg.parOrBetterPct != null) {
      const allOthers = others.map(o => o.parOrBetterPct).filter(v => v != null);
      if (allOthers.length > 0 && agg.parOrBetterPct > Math.max(...allOthers) + 2) {
        items.push({ type: "S", text: `Mais pares ou melhor (${agg.parOrBetterPct.toFixed(0)}%)` });
      }
    }
    if (agg.bestSD != null) {
      const allOthers = others.map(o => o.bestSD).filter((v): v is number => v != null);
      if (allOthers.length > 0 && agg.bestSD < Math.min(...allOthers) - 0.5) {
        items.push({ type: "S", text: `Melhor SD de sempre (${agg.bestSD.toFixed(1)})` });
      }
    }
    if (agg.grossStdDev != null) {
      const allOthers = others.map(o => o.grossStdDev).filter((v): v is number => v != null);
      if (allOthers.length > 0 && agg.grossStdDev < Math.min(...allOthers) - 0.5) {
        items.push({ type: "S", text: `Mais consistente (σ gross ${agg.grossStdDev.toFixed(1)})` });
      }
    }
    if (agg.scoreDist.total > 0) {
      const birdiePct = agg.scoreDist.birdie / agg.scoreDist.total * 100;
      const allOthers = others.map(o => o.scoreDist.total > 0 ? o.scoreDist.birdie / o.scoreDist.total * 100 : 0);
      if (allOthers.length > 0 && birdiePct > Math.max(...allOthers) + 1) {
        items.push({ type: "S", text: `Mais birdies (${birdiePct.toFixed(1)}%)` });
      }
    }

    // ── FRAQUEZAS ──
    for (const pt of [3, 4, 5]) {
      const mine = agg.byPar[pt]?.avgVsPar;
      if (mine == null) continue;
      const allOthers = others.map(o => o.byPar[pt]?.avgVsPar).filter((v): v is number => v != null);
      if (allOthers.length > 0 && mine > Math.max(...allOthers) + 0.1) {
        items.push({ type: "W", text: `Pior nos Par ${pt} (${fD2(mine)} vs par)` });
      }
    }
    if (agg.dblOrWorsePct != null) {
      const allOthers = others.map(o => o.dblOrWorsePct).filter(v => v != null);
      if (allOthers.length > 0 && agg.dblOrWorsePct > Math.max(...allOthers) + 2) {
        items.push({ type: "W", text: `Mais doubles+ (${agg.dblOrWorsePct.toFixed(0)}%)` });
      }
    }
    if (agg.grossStdDev != null) {
      const allOthers = others.map(o => o.grossStdDev).filter((v): v is number => v != null);
      if (allOthers.length > 0 && agg.grossStdDev > Math.max(...allOthers) + 0.5) {
        items.push({ type: "W", text: `Menos consistente (σ gross ${agg.grossStdDev.toFixed(1)})` });
      }
    }
    if (agg.avgSD != null) {
      const allOthers = others.map(o => o.avgSD).filter((v): v is number => v != null);
      if (allOthers.length > 0 && agg.avgSD > Math.max(...allOthers) + 0.5) {
        items.push({ type: "W", text: `SD médio mais alto (${agg.avgSD.toFixed(1)})` });
      }
    }

    // ── OPORTUNIDADES ──
    if (ps?.hcpTrend === "up") {
      const delta = ps.hcpDelta3m != null ? ` (${ps.hcpDelta3m} nos últimos 3 meses)` : "";
      items.push({ type: "O", text: `HCP em queda — em progressão${delta}` });
    }
    if (ps?.formAlert === "hot") {
      items.push({ type: "O", text: "Forma recente excelente 🔥" });
    }
    if (agg.longestStreak >= 3) {
      items.push({ type: "O", text: `Sequência de ${agg.longestStreak} rondas consecutivas a melhorar` });
    }
    if (agg.last5AvgSD != null && agg.avgSD != null && agg.last5AvgSD < agg.avgSD - 1) {
      items.push({ type: "O", text: `Últimas 5 rondas muito acima da média (SD ${agg.last5AvgSD.toFixed(1)} vs avg ${agg.avgSD.toFixed(1)})` });
    }
    if (ps?.roundsLast12m != null && ps.roundsLast12m > 20) {
      items.push({ type: "O", text: `Elevado volume de jogo (${ps.roundsLast12m} rondas nos últimos 12 meses)` });
    }

    // ── AMEAÇAS ──
    if (ps?.hcpTrend === "down") {
      const delta = ps.hcpDelta3m != null ? ` (+${ps.hcpDelta3m} nos últimos 3 meses)` : "";
      items.push({ type: "T", text: `HCP em subida — tendência negativa${delta}` });
    }
    if (ps?.formAlert === "cold") {
      items.push({ type: "T", text: "Má forma recente ❄️" });
    }
    if (agg.grossStdDev != null && agg.grossStdDev > 5) {
      items.push({ type: "T", text: `Alta inconsistência (σ gross ${agg.grossStdDev.toFixed(1)}) — resultados imprevisíveis` });
    }
    if (agg.sdStdDev != null && agg.sdStdDev > 4) {
      items.push({ type: "T", text: `Alta variância de SD (σ ${agg.sdStdDev.toFixed(1)}) — rondas muito irregulares` });
    }
    if (ps?.roundsLast3m != null && ps.roundsLast3m < 2) {
      items.push({ type: "T", text: `Poucas rondas recentes (${ps.roundsLast3m} nos últimos 3 meses)` });
    }

    // Defaults if empty sections
    if (!items.find(x => x.type === "S")) items.push({ type: "S", text: "Dados insuficientes para identificar forças" });
    if (!items.find(x => x.type === "W")) items.push({ type: "W", text: "Dados insuficientes para identificar fraquezas" });
    if (!items.find(x => x.type === "O")) items.push({ type: "O", text: "Sem oportunidades identificadas no período" });
    if (!items.find(x => x.type === "T")) items.push({ type: "T", text: "Sem ameaças identificadas no período" });

    return items;
  }

  const swotConfig: Record<string, { label: string; bg: string; border: string; color: string }> = {
    S: { label: "💪 Forças", bg: "var(--bg-success)", border: "var(--border-success)", color: "var(--color-good-dark)" },
    W: { label: "⚠️ Fraquezas", bg: "var(--bg-danger)", border: "var(--border-danger)", color: "var(--color-danger-dark)" },
    O: { label: "🌱 Oportunidades", bg: "var(--bg-info)", border: "var(--border-info)", color: "var(--color-info)" },
    T: { label: "🎯 Ameaças", bg: "var(--bg-warn)", border: "var(--border-warn)", color: "var(--color-warn-dark)" },
  };

  return (
    <div className="card">
      <div className="h-md mb-12">🔍 Análise SWOT</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(loaded.length, 2)}, 1fr)`, gap: 16 }}>
        {loaded.map(({ s, i }) => {
          const items = buildSwot(i);
          return (
            <div key={i} style={{ border: `2px solid ${COLORS[i]}`, borderRadius: "var(--radius)", overflow: "hidden" }}>
              {/* Player header */}
              <div style={{ background: COLORS[i], padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>{firstName(s.player.name)}</span>
                <span style={{ color: "rgba(255,255,255,.75)", fontSize: 11 }}>HCP {hcpDisplay(s.player.hcp)} · {s.player.escalao}</span>
              </div>
              {/* SWOT grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                {(["S", "W", "O", "T"] as const).map(type => {
                  const cfg = swotConfig[type];
                  const typeItems = items.filter(x => x.type === type);
                  return (
                    <div key={type} style={{ background: cfg.bg, borderTop: `1px solid ${cfg.border}`, borderRight: type === "S" || type === "O" ? `1px solid ${cfg.border}` : undefined, padding: "10px 12px" }}>
                      <div className="uppercase" style={{ color: cfg.color, fontWeight: 700, fontSize: 11, marginBottom: 6, letterSpacing: "0.05em" }}>{cfg.label}</div>
                      <ul style={{ margin: 0, padding: "0 0 0 14px" }}>
                        {typeItems.map((item, j) => (
                          <li key={j} style={{ fontSize: 11, lineHeight: 1.5, color: "var(--text-2)", marginBottom: 3 }}>{item.text}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════ § 5 CONSISTÊNCIA ═══════════════════ */

function ConsistencySection({ slots, allAgg }: { slots: Slot[]; allAgg: (AggStats | null)[] }) {
  const loaded = slots.map((s, i) => ({ s, agg: allAgg[i], i })).filter(x => x.agg);
  if (loaded.length < 2) return null;

  return (
    <div className="card">
      <div className="h-md mb-12">📐 Consistência</div>

      {/* KPIs */}
      <div className="caKpis mb-16">
        {loaded.map(({ s, agg, i }) => {
          if (!agg) return null;
          const stdLabel = agg.grossStdDev != null ? agg.grossStdDev.toFixed(1) : "–";
          const stdColor = agg.grossStdDev == null ? undefined : sc3_local(agg.grossStdDev, 3, 5.5);
          return (
            <div key={i} className="caKpi" style={{ borderColor: COLORS[i] }}>
              <div className="caKpiVal" style={{ color: stdColor ?? COLORS[i] }}>{stdLabel}</div>
              <div className="caKpiLbl">{firstName(s.player.name)} · σ Gross</div>
              <div className="flex-wrap-gap8 jc-center mt-4">
                {agg.sdStdDev != null && <span className="fs-10 c-text-3">σ SD: {agg.sdStdDev.toFixed(1)}</span>}
                {agg.longestStreak > 0 && <span className="fs-10 c-text-3">Streak: {agg.longestStreak}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabela de consistência */}
      <div className="table-wrap">
        <table className="dtable-lg fs-12">
          <thead>
            <tr>
              <th>Métrica</th>
              {loaded.map(x => <th key={x.i} className="r" style={{ color: COLORS[x.i] }}>{firstName(x.s.player.name)}</th>)}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "σ Gross (desvio padrão)", key: "grossStdDev" as const, dir: "low" },
              { label: "σ SD (desvio padrão)", key: "sdStdDev" as const, dir: "low" },
              { label: "Intervalo Gross (max − min)", key: null, dir: "low" },
              { label: "Maior sequência crescente", key: "longestStreak" as const, dir: "high" },
              { label: "% dentro de ±3 do avg", key: null, dir: "high" },
            ].map((row, ri) => {
              const vals = loaded.map(({ agg }) => {
                if (!agg) return null;
                if (row.key) return agg[row.key] as number | null;
                if (row.label.includes("Intervalo") && agg.grossSeries.length > 1) {
                  return Math.max(...agg.grossSeries) - Math.min(...agg.grossSeries);
                }
                if (row.label.includes("±3") && agg.grossSeries.length > 0) {
                  const avg = agg.avgGross!;
                  const inRange = agg.grossSeries.filter(g => Math.abs(g - avg) <= 3).length;
                  return inRange / agg.grossSeries.length * 100;
                }
                return null;
              });
              const nums = vals.filter((v): v is number => v != null);
              const best = nums.length >= 2 ? (row.dir === "low" ? Math.min(...nums) : Math.max(...nums)) : null;

              return (
                <tr key={ri}>
                  <td className="fw-600 fs-11">{row.label}</td>
                  {vals.map((v, ci) => {
                    const isBest = v != null && best != null && v === best && nums.filter(n => n === best).length === 1;
                    const formatted = v == null ? "–" : row.label.includes("±3") ? `${v.toFixed(0)}%` : v.toFixed(1);
                    return (
                      <td key={ci} className="r mono" style={{
                        fontWeight: isBest ? 800 : 400,
                        color: isBest ? COLORS[ci] : undefined,
                        background: isBest ? COLORS_LIGHT[ci] : undefined,
                      }}>
                        {formatted}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mini sparklines de dispersão */}
      <div className="mt-14">
        <div className="fs-11 fw-600 c-text-3 mb-8">Dispersão de Gross (torneios)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {loaded.map(({ s, agg, i }) => {
            if (!agg || agg.grossSeries.length < 3) return null;
            const gs = agg.grossSeries;
            const mn = Math.min(...gs), mx = Math.max(...gs), rng = mx - mn || 1;
            const avg = agg.avgGross!;
            const W = 180, H = 50, pad = 8;
            const x = (j: number) => pad + (j / (gs.length - 1)) * (W - pad * 2);
            const y = (v: number) => H - pad - ((v - mn) / rng) * (H - pad * 2);
            return (
              <div key={i} style={{ border: `1px solid ${COLORS[i]}`, borderRadius: "var(--radius)", padding: 8, background: COLORS_LIGHT[i] }}>
                <div className="fs-11 fw-700 mb-4" style={{ color: COLORS[i] }}>{firstName(s.player.name)}</div>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
                  {/* avg line */}
                  <line x1={pad} x2={W - pad} y1={y(avg)} y2={y(avg)} stroke={COLORS[i]} strokeWidth={1} strokeDasharray="4,2" opacity={0.4} />
                  {/* points */}
                  {gs.map((g, j) => (
                    <circle key={j} cx={x(j)} cy={y(g)} r={3} fill={COLORS[i]} opacity={0.7}>
                      <title>Ronda {j + 1}: {g}</title>
                    </circle>
                  ))}
                  {/* labels */}
                  <text x={pad} y={H - 2} fontSize={9} fill="var(--text-3)">{mn}</text>
                  <text x={W - pad} y={H - 2} fontSize={9} fill="var(--text-3)" textAnchor="end">{mx}</text>
                  <text x={W / 2} y={y(avg) - 4} fontSize={9} fill={COLORS[i]} textAnchor="middle">avg {avg.toFixed(0)}</text>
                </svg>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ § 6 DISTRIBUIÇÃO DE SCORES ═══════════════════ */

function ScoreDistribution({ slots, allAgg }: { slots: Slot[]; allAgg: (AggStats | null)[] }) {
  const loaded = slots.map((s, i) => ({ s, agg: allAgg[i], i })).filter(x => x.agg && x.agg.scoreDist.total > 0);
  if (loaded.length < 2) return null;

  const cats = [
    { key: "eagle" as const, label: "Eagle", emoji: "🦅" },
    { key: "birdie" as const, label: "Birdie", emoji: "🐦" },
    { key: "par" as const, label: "Par", emoji: "✅" },
    { key: "bogey" as const, label: "Bogey", emoji: "🟡" },
    { key: "double" as const, label: "Double+", emoji: "🔴" },
    { key: "triple" as const, label: "Triple+", emoji: "⛔" },
  ];

  return (
    <div className="card p-16">
      <div className="h-md">Distribuição de Scores <span className="muted fs-11 fw-400">(apenas torneios)</span></div>
      <div className="flex-col-gap12 mt-8">
        {cats.map(cat => {
          const vals = loaded.map(x => { const d = x.agg!.scoreDist; return d.total > 0 ? (d[cat.key] / d.total * 100) : 0; });
          const maxVal = Math.max(...vals, 1);
          return (
            <div key={cat.key}>
              <div className="flex-center-gap8-mb4"><span className="cmp-stat-label">{cat.emoji} {cat.label}</span></div>
              <div className="flex-col-gap3">
                {loaded.map(x => {
                  const v = vals[x.i];
                  const barW = Math.max(2, (v / maxVal) * 100);
                  return (
                    <div key={x.i} className="flex-center-gap8">
                      <span className="fs-11 ta-right fw-600 flex-shrink-0" style={{ width: 60, color: COLORS[x.i] }}>{firstName(x.s.player.name)}</span>
                      <div className="cmp-distrib-track">
                        <div style={{ width: `${barW}%`, height: "100%", background: COLORS[x.i], borderRadius: "var(--radius-sm)", opacity: 0.75 }} />
                      </div>
                      <span className="ta-right fw-700 c-text-2 fs-11 mono" style={{ width: 46 }}>{v.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════ § 7 BURACO A BURACO ═══════════════════ */

function HoleByHoleSection({ slots }: { slots: Slot[] }) {
  const loaded = slots.filter(s => s.data);
  const [sel, setSel] = useState(0);

  const combos = useMemo(() => {
    if (loaded.length < 2) return [];
    const maps = loaded.map(s => buildTourneyHoleStats(s.data!));
    const allKeys = new Set<string>();
    maps.forEach(m => m.forEach((_, k) => allKeys.add(k)));
    const result: { label: string; nRounds: number[]; stats: (SimpleHoleStats | null)[] }[] = [];
    for (const k of allKeys) {
      const entries = maps.map(m => m.get(k) || null);
      if (entries.filter(Boolean).length < 2) continue;
      const first = entries.find(Boolean)!;
      result.push({ label: first.label, nRounds: entries.map(e => e?.nR ?? 0), stats: entries.map(e => e?.stats ?? null) });
    }
    result.sort((a, b) => b.nRounds.reduce((s, v) => s + v, 0) - a.nRounds.reduce((s, v) => s + v, 0));
    return result;
  }, [loaded]);

  if (loaded.length < 2 || combos.length === 0) return null;
  const combo = combos[Math.min(sel, combos.length - 1)];
  const refStats = combo.stats.find(Boolean)!;

  const W = 780, H = 200, PAD = { top: 20, right: 10, bottom: 40, left: 40 };
  const holeW = (W - PAD.left - PAD.right) / refStats.holes.length;
  const allAvgs: number[] = [];
  combo.stats.forEach(st => { if (st) st.holes.forEach(h => { if (h.avg != null && h.par != null) allAvgs.push(h.avg - h.par); }); });
  const minV = Math.min(-0.5, ...allAvgs), maxV = Math.max(1, ...allAvgs), range = maxV - minV;
  const yPos = (v: number) => PAD.top + ((maxV - v) / range) * (H - PAD.top - PAD.bottom);

  return (
    <div className="card">
      <div className="h-md flex-center-gap10 flex-wrap">
        Buraco a Buraco <span className="muted fs-11 fw-400">(torneios)</span>
        <select className="select" value={sel} onChange={e => setSel(Number(e.target.value))}>
          {combos.map((c, i) => <option key={i} value={i}>{c.label} ({c.nRounds.filter(n => n > 0).join("/")} rondas)</option>)}
        </select>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="cmp-radar-sm">
        <line x1={PAD.left} x2={W - PAD.right} y1={yPos(0)} y2={yPos(0)} stroke="var(--color-good)" strokeWidth={1} strokeDasharray="4,3" opacity={0.5} />
        {[-0.5, 0.5, 1.0].filter(v => v >= minV && v <= maxV).map(v => (
          <g key={v}><line x1={PAD.left} x2={W - PAD.right} y1={yPos(v)} y2={yPos(v)} stroke="var(--border-light)" strokeWidth={0.5} />
            <text x={PAD.left - 4} y={yPos(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">{v > 0 ? "+" : ""}{v.toFixed(1)}</text></g>
        ))}
        {refStats.holes.map((h, i) => (
          <React.Fragment key={i}>
            <text x={PAD.left + i * holeW + holeW / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--text)">{i + 1}</text>
            <text x={PAD.left + i * holeW + holeW / 2} y={H - 22} textAnchor="middle" fontSize={10} fill="var(--text-3)">P{h.par}</text>
          </React.Fragment>
        ))}
        {loaded.map((s, si) => {
          const st = combo.stats[si]; if (!st) return null;
          const pts = st.holes.filter(h => h.avg != null && h.par != null).map(h => ({ x: PAD.left + (h.h - 1) * holeW + holeW / 2, y: yPos(h.avg! - h.par!), val: h.avg! - h.par!, hole: h.h }));
          if (pts.length < 2) return null;
          const d = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ");
          return (<g key={si}>
            <path d={`M ${d}`} fill="none" stroke={COLORS[si]} strokeWidth={2.5} opacity={0.8} strokeLinejoin="round" />
            {pts.map((p, j) => (<circle key={j} cx={p.x} cy={p.y} r={3.5} fill={COLORS[si]} stroke="#fff" strokeWidth={1}><title>{shortName(s.player.name)}: Bur. {p.hole} {fD2(p.val)} vs par</title></circle>))}
          </g>);
        })}
      </svg>
      <div className="caKpis mt-6">
        {loaded.map((s, i) => {
          const st = combo.stats[i];
          return (
            <div key={i} className="caKpi" style={{ borderColor: COLORS[i] }}>
              <div className="caKpiVal" style={{ color: COLORS[i] }}>{st ? st.avgGross?.toFixed(0) ?? "–" : "–"}</div>
              <div className="caKpiLbl">{shortName(s.player.name)} · {st?.nRounds ?? 0} rondas</div>
            </div>
          );
        })}
      </div>
      <div className="table-wrap mt-8">
        <table className="dtable-lg">
          <thead><tr>
            <th className="r">H</th><th className="r">Par</th>
            {loaded.map((s, i) => (<React.Fragment key={s.fed}>
              <th className="r" style={{ color: COLORS[i] }}>{firstName(s.player.name)} Avg</th>
              <th className="r" style={{ color: COLORS[i] }}>vs Par</th>
            </React.Fragment>))}
          </tr></thead>
          <tbody>
            {refStats.holes.map((_, hi) => {
              const entries = loaded.map((_, si) => combo.stats[si]?.holes[hi] ?? null);
              const par = entries.map(e => e?.par ?? 0).find(p => p > 0) || 0;
              const avgs = entries.map(e => e?.avg != null && e?.par != null ? e.avg - e.par : null);
              const bestAvg = Math.min(...avgs.filter((v): v is number => v != null));
              return (<tr key={hi}>
                <td className="r"><b>{hi + 1}</b></td>
                <td className="r c-text-3">{par}</td>
                {entries.map((e, i) => {
                  const diff = e?.avg != null && e?.par != null ? e.avg - e.par : null;
                  const isBest = diff != null && diff === bestAvg && avgs.filter(v => v === bestAvg).length === 1;
                  const diffCol = diff == null ? undefined : sc3_local(diff, 0, 0.3);
                  return (<React.Fragment key={i}>
                    <td className="r" style={{ color: COLORS[i] }}>{e?.avg != null ? e.avg.toFixed(1) : "–"}</td>
                    <td className="r" style={{ color: diffCol }}>{diff != null ? (isBest ? <b>{fD2(diff)}</b> : fD2(diff)) : "–"}</td>
                  </React.Fragment>);
                })}
              </tr>);
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════ § 8 HEAD-TO-HEAD ═══════════════════ */

function HeadToHeadSection({ slots }: { slots: Slot[] }) {
  const loaded = slots.filter(s => s.data);
  const [showAll, setShowAll] = useState(false);

  /** Versão alargada de isTournamentRound que aceita 9 buracos (Drive Challenge, etc.) */
  function isValidH2HRound(r: RoundData): boolean {
    if ((r.holeCount !== 18 && r.holeCount !== 9) || r._isTreino || r._isTeamEvent) return false;
    if (r.gross == null || Number(r.gross) <= 30) return false;  // 30 para 9h (mínimo credível)
    if (r.holeCount === 18 && Number(r.gross) > MAX_CREDIBLE_GROSS) return false;
    if (r.holeCount === 9  && Number(r.gross) > 70) return false;  // máx credível para 9h
    const o = (r.scoreOrigin || "").trim();
    if (o === "EDS" || o === "Indiv" || o === "Treino") return false;
    const ev = (r.eventName || "").trim();
    if (ev === "EDS" || ev === "Indiv") return false;
    return true;
  }

  const matches = useMemo(() => {
    if (loaded.length < 2) return [];
    const eventMap = new Map<string, Map<number, RoundData & { course: string }>>();
    loaded.forEach((s, si) => {
      for (const c of s.data!.DATA) for (const r of c.rounds) {
        if (!isValidH2HRound(r)) continue;
        // Chave: nome do evento + data + nº buracos (evita colidir 9h com 18h do mesmo dia)
        const key = norm(r.eventName) + "|" + r.date + "|" + r.holeCount;
        if (!eventMap.has(key)) eventMap.set(key, new Map());
        eventMap.get(key)!.set(si, { ...r, course: c.course });
      }
    });
    type Match = { event: string; date: string; dateSort: number; course: string; holeCount: number; results: { idx: number; gross: number; sd: number | null }[] };
    const res: Match[] = [];
    for (const [, m] of eventMap) {
      if (m.size < 2) continue;
      const first = [...m.values()][0];
      const maxG = first.holeCount === 9 ? 70 : MAX_CREDIBLE_GROSS;
      const results = [...m.entries()].map(([idx, r]) => ({
        idx, gross: Number(r.gross), sd: r.sd != null ? Number(r.sd) : null,
      })).filter(r => r.gross > 30 && r.gross <= maxG);
      if (results.length < 2) continue;
      results.sort((a, b) => a.gross - b.gross);
      res.push({ event: first.eventName, date: first.date, dateSort: first.dateSort, course: first.course, holeCount: first.holeCount, results });
    }
    res.sort((a, b) => b.dateSort - a.dateSort);
    return res;
  }, [loaded]);

  if (loaded.length < 2 || matches.length === 0) return null;
  const wins = loaded.map(() => 0);
  const margins: { sum: number; count: number }[] = loaded.map(() => ({ sum: 0, count: 0 }));
  matches.forEach(m => {
    wins[m.results[0].idx]++;
    if (loaded.length === 2 && m.results.length === 2) {
      const diff = Math.abs(m.results[0].gross - m.results[1].gross);
      margins[m.results[0].idx].sum += diff;
      margins[m.results[0].idx].count++;
    }
  });
  const totalMatches = matches.length;
  const displayed = showAll ? matches : matches.slice(0, 20);

  // Dominance stats (2-player only)
  const dominanceData = loaded.length === 2 ? (() => {
    const bigWins0 = matches.filter(m => m.results[0]?.idx === 0 && m.results[1] && m.results[0].gross + 3 <= m.results[1].gross).length;
    const bigWins1 = matches.filter(m => m.results[0]?.idx === 1 && m.results[1] && m.results[0].gross + 3 <= m.results[1].gross).length;
    const closest = matches.reduce((best, m) => {
      if (m.results.length < 2) return best;
      const diff = Math.abs(m.results[0].gross - m.results[1].gross);
      return diff < (best?.diff ?? 999) ? { event: m.event, date: m.date, diff } : best;
    }, null as { event: string; date: string; diff: number } | null);
    return { bigWins0, bigWins1, closest };
  })() : null;

  return (
    <div className="card">
      <div className="h-md">⚔️ Head-to-Head ({totalMatches} torneios comuns)</div>

      {/* Win bar */}
      <div className="cmp-distrib-bar mb-12">
        {loaded.map((s, i) => {
          const w = totalMatches > 0 ? (wins[i] / totalMatches * 100) : 0;
          if (w === 0) return null;
          return (
            <div key={i} style={{ width: `${w}%`, background: COLORS[i], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
              {wins[i] > 0 && `${firstName(s.player.name)} ${wins[i]}`}
            </div>
          );
        })}
        {loaded.length === 2 && totalMatches - wins[0] - wins[1] > 0 && (
          <div style={{ width: `${(totalMatches - wins[0] - wins[1]) / totalMatches * 100}%`, background: "var(--border-light)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontWeight: 700, fontSize: 12 }}>
            {totalMatches - wins[0] - wins[1]}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="caKpis mb-12">
        {loaded.map((s, i) => (
          <div key={i} className="caKpi" style={{ borderColor: wins[i] === Math.max(...wins) ? COLORS[i] : undefined }}>
            <div className="caKpiVal" style={{ color: COLORS[i] }}>{wins[i]}</div>
            <div className="caKpiLbl">{firstName(s.player.name)} vitórias</div>
            {margins[i].count > 0 && <div className="fs-10 c-text-3">Margem média: {(margins[i].sum / margins[i].count).toFixed(1)}</div>}
          </div>
        ))}
        {loaded.length === 2 && (
          <div className="caKpi">
            <div className="caKpiVal">{totalMatches - wins[0] - wins[1]}</div>
            <div className="caKpiLbl">Empates</div>
          </div>
        )}
      </div>

      {/* Dominância (só 2 jogadores) */}
      {dominanceData && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          <div style={{ background: "var(--bg-muted)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
            <div className="fs-11 fw-600 c-text-3 mb-4">Vitórias por 3+ pancadas</div>
            <div className="flex-center-gap8">
              <span className="fw-700 mono" style={{ color: COLORS[0] }}>{dominanceData.bigWins0}</span>
              <span className="c-text-3 fs-11">{firstName(loaded[0].player.name)}</span>
              <span className="c-text-3 fs-11 mx-4">vs</span>
              <span className="fw-700 mono" style={{ color: COLORS[1] }}>{dominanceData.bigWins1}</span>
              <span className="c-text-3 fs-11">{firstName(loaded[1].player.name)}</span>
            </div>
          </div>
          {dominanceData.closest && (
            <div style={{ background: "var(--bg-muted)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
              <div className="fs-11 fw-600 c-text-3 mb-4">Duelo mais disputado</div>
              <div className="fs-12 fw-600">{dominanceData.closest.event}</div>
              <div className="fs-11 c-text-3">{dominanceData.closest.date} · Δ {dominanceData.closest.diff} pancada{dominanceData.closest.diff !== 1 ? "s" : ""}</div>
            </div>
          )}
        </div>
      )}

      {/* Tabela de duelos */}
      <div className="table-wrap cmp-result-list">
        <table className="dtable-lg">
          <thead><tr>
            <th>Data</th>
            <th>Torneio</th>
            {loaded.map((s, i) => <th key={i} className="r" style={{ color: COLORS[i] }}>{firstName(s.player.name)}</th>)}
            <th className="r">Δ</th>
            <th className="r">Vencedor</th>
          </tr></thead>
          <tbody>
            {displayed.map((m, mi) => {
              const bestGross = Math.min(...m.results.map(r => r.gross));
              const winnerIdx = m.results[0].idx;
              return (<tr key={mi} className="roundRow">
                <td className="c-text-3 nowrap">{m.date}</td>
                <td className="fs-12">
                  {m.event}
                  {m.holeCount === 9 && <span className="chip fs-10 ml-6" style={{ verticalAlign: "middle" }}>9h</span>}
                </td>
                {loaded.map((_, i) => {
                  const r = m.results.find(r => r.idx === i);
                  if (!r) return <td key={i} className="r c-text-3">–</td>;
                  return <td key={i} className="r mono" style={{ color: r.gross === bestGross ? COLORS[i] : undefined, fontWeight: r.gross === bestGross ? 800 : 400 }}>{r.gross}</td>;
                })}
                <td className="r c-text-3 mono">
                  {loaded.length === 2 ? (() => {
                    const r0 = m.results.find(r => r.idx === 0), r1 = m.results.find(r => r.idx === 1);
                    if (!r0 || !r1) return "–";
                    const diff = r0.gross - r1.gross;
                    return diff === 0 ? "=" : `${Math.abs(diff)}`;
                  })() : ""}
                </td>
                <td className="r">
                  <span className="round" style={{ width: 10, height: 10, background: COLORS[winnerIdx], display: "inline-block" }} />
                </td>
              </tr>);
            })}
          </tbody>
        </table>
      </div>
      {matches.length > 20 && (
        <button className="btn-link fs-12 mt-8" onClick={() => setShowAll(v => !v)}>
          {showAll ? "Mostrar menos ▲" : `Ver todos os ${matches.length} duelos ▼`}
        </button>
      )}
    </div>
  );
}

/* ═══════════════════ § 9 EVOLUÇÃO EM TORNEIOS ═══════════════════ */

function TournamentEvolutionSection({ slots }: { slots: Slot[] }) {
  const [period, setPeriod] = useState(12);
  const [metric, setMetric] = useState<"sd" | "gross">("sd");
  const loaded = slots.filter(s => s.data);

  const cutoff = period > 0 ? Date.now() - period * 30.44 * 86400000 : 0;

  const series = useMemo(() => {
    if (loaded.length < 2) return [];
    return loaded.map((s, i) => {
      const pts: { d: number; sd: number; gross: number; event: string; is9h: boolean }[] = [];
      for (const cd of s.data!.DATA) {
        for (const r of cd.rounds) {
          if (r.dateSort < cutoff) continue;
          if (r._isTreino || r._isTeamEvent) continue;
          const is9h = r.holeCount === 9;
          const is18h = r.holeCount === 18;
          if (!is9h && !is18h) continue;
          const o = (r.scoreOrigin || "").trim();
          if (o === "EDS" || o === "Indiv" || o === "Treino") continue;
          if (!is9h && !isTournamentRound(r)) continue;
          const gross = Number(r.gross);
          if (is18h && (gross <= 50 || gross > MAX_CREDIBLE_GROSS)) continue;
          if (is9h && (gross <= 25 || gross > 70)) continue;
          // SD: nunca usar sd=0 (placeholder FPG)
          const sd = r.sd != null && Number(r.sd) !== 0 && !isNaN(Number(r.sd)) ? Number(r.sd) : null;
          if (metric === "sd" && sd == null) continue;
          pts.push({ d: r.dateSort, sd: sd ?? 0, gross, event: r.eventName, is9h });
        }
      }
      pts.sort((a, b) => a.d - b.d);
      const rolling: { d: number; val: number; raw: number; event: string; is9h: boolean }[] = [];
      const window = 5;
      for (let j = 0; j < pts.length; j++) {
        const start = Math.max(0, j - window + 1);
        const slice = pts.slice(start, j + 1);
        const avg = slice.reduce((s, p) => s + (metric === "sd" ? p.sd : p.gross), 0) / slice.length;
        rolling.push({ d: pts[j].d, val: avg, raw: metric === "sd" ? pts[j].sd : pts[j].gross, event: pts[j].event, is9h: pts[j].is9h });
      }
      return { name: s.player.name, color: COLORS[i], pts: rolling };
    });
  }, [loaded, cutoff, metric]);

  if (loaded.length < 2) return null;
  const allPts = series.flatMap(s => s.pts);
  if (allPts.length < 4) return null;

  const W = 800, H = 260, PAD = { top: 20, right: 20, bottom: 30, left: 45 };
  const minD = Math.min(...allPts.map(p => p.d)), maxD = Math.max(...allPts.map(p => p.d));
  const allVals = allPts.map(p => p.val);
  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const rangeD = maxD - minD || 1, rangeV = maxV - minV || 1, padV = rangeV * 0.15;
  const xPos = (d: number) => PAD.left + ((d - minD) / rangeD) * (W - PAD.left - PAD.right);
  const yPos = (v: number) => H - PAD.bottom - ((v - (minV - padV)) / (rangeV + 2 * padV)) * (H - PAD.top - PAD.bottom);
  const metricLabel = metric === "sd" ? "SD" : "Gross";

  return (
    <div className="card">
      <div className="h-md flex-center-gap10 flex-wrap">
        Evolução em Torneios
        <select className="select" value={metric} onChange={e => setMetric(e.target.value as "sd" | "gross")}>
          <option value="sd">Score Differential</option>
          <option value="gross">Gross</option>
        </select>
        <select className="select" value={period} onChange={e => setPeriod(Number(e.target.value))}>
          <option value={0}>Total</option><option value={36}>3 anos</option><option value={24}>2 anos</option><option value={12}>1 ano</option><option value={6}>6 meses</option>
        </select>
        <span className="muted fs-10 fw-400">média móvel 5 rondas · {metric === "sd" ? "SD por ronda (não o HI)" : "gross por ronda"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="cmp-radar-wrap-sm">
        {Array.from({ length: 5 }, (_, i) => {
          const val = minV - padV + (rangeV + 2 * padV) * (i / 4);
          return (
            <g key={i}>
              <line x1={PAD.left} y1={yPos(val)} x2={W - PAD.right} y2={yPos(val)} stroke="var(--border-light)" strokeWidth={0.5} />
              <text x={PAD.left - 4} y={yPos(val) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">{val.toFixed(1)}</text>
            </g>
          );
        })}
        {series.map((s, si) => {
          if (s.pts.length < 2) return null;
          const d = s.pts.map(pt => `${xPos(pt.d).toFixed(1)},${yPos(pt.val).toFixed(1)}`).join(" L ");
          return (
            <g key={si}>
              <path d={`M ${d}`} fill="none" stroke={s.color} strokeWidth={2} opacity={0.8} strokeLinejoin="round" />
              {s.pts.map((pt, j) => (
                <circle key={j} cx={xPos(pt.d)} cy={yPos(pt.val)} r={pt.is9h ? 3 : 2.5}
                  fill={pt.is9h ? "none" : s.color} stroke={s.color} strokeWidth={pt.is9h ? 1.5 : 0} opacity={0.7}>
                  <title>{s.name}: SD {pt.raw.toFixed(1)}{pt.is9h ? " (9h)" : ""} — média {pt.val.toFixed(1)} — {pt.event} ({new Date(pt.d).toLocaleDateString("pt-PT")})</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {metric === "sd" && (
        <div className="muted fs-11 mt-4 mb-4">
          ℹ️ O <strong>Score Differential</strong> é calculado por ronda (não é o Handicap Index). O HI ≈ média das 8 melhores das últimas 20 × 96%.
          Pontos vazios = ronda de 9 buracos (SD não comparável directamente com 18h).
        </div>
      )}
      <div className="caKpis mt-8">
        {series.map((s, i) => {
          const last = s.pts.length > 0 ? s.pts[s.pts.length - 1].val : null;
          const first = s.pts.length > 0 ? s.pts[0].val : null;
          const delta = last != null && first != null ? last - first : null;
          const best = s.pts.length > 0 ? Math.min(...s.pts.map(p => p.raw)) : null;
          return (
            <div key={i} className="caKpi" style={{ borderColor: s.color }}>
              <div className="caKpiVal" style={{ color: s.color }}>{last != null ? last.toFixed(1) : "–"}</div>
              <div className="caKpiLbl">{shortName(s.name)} · {s.pts.length} rondas</div>
              <div className="flex-wrap-gap8 jc-center" style={{ marginTop: 3 }}>
                {delta != null && <span className="fw-700 fs-10" style={{ color: sc3m(delta, 0, 0) }}>{delta > 0 ? "+" : ""}{delta.toFixed(1)}</span>}
                {best != null && <span className="fs-10 fw-600 c-text-3">melhor: {best.toFixed(metric === "sd" ? 1 : 0)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════ MAIN ═══════════════════ */

export default function CompararPage() {
  const { players } = useAppContext();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [statsDb, setStatsDb] = useState<PlayerStatsDb>({});

  useEffect(() => { loadPlayerStats().then(setStatsDb); }, []);

  const addPlayer = (fed: string) => {
    if (slots.length >= 4 || slots.find(s => s.fed === fed)) return;
    const player = players[fed]; if (!player) return;
    setSlots(prev => [...prev, { fed, player, data: null, loading: true, error: null }]);
    loadPlayerData(fed)
      .then(data => {
        try { deepFixMojibake(data); } catch (e) { console.error("[Comparar] deepFixMojibake error for", fed, e); }
        setSlots(prev => prev.map(s => s.fed === fed ? { ...s, data, loading: false } : s));
      })
      .catch(err => {
        console.error("[Comparar] loadPlayerData error for", fed, err);
        setSlots(prev => prev.map(s => s.fed === fed ? { ...s, loading: false, error: err?.message || "Erro" } : s));
      });
  };
  const removePlayer = (fed: string) => setSlots(prev => prev.filter(s => s.fed !== fed));
  const anyLoading = slots.some(s => s.loading);

  const allAgg = useMemo(() => slots.map(s => {
    if (!s.data) return null;
    try { return aggregateStats(s.data); }
    catch (e) { console.error("[Comparar] aggregateStats error for", s.fed, e); return null; }
  }), [slots]);

  return (
    <div className="page-full">
      <PlayerSearch players={players} slots={slots} statsDb={statsDb} onAdd={addPlayer} onRemove={removePlayer} />

      {slots.length === 0 && (
        <div className="card empty-state">
          <div className="cmp-empty-icon">⚔️</div>
          <div className="h-md cmp-empty-title">Comparar Jogadores</div>
          <div className="muted fs-13-lh16">
            Pesquisa e adiciona até 4 jogadores para comparar lado a lado.
          </div>
          <div className="muted fs-12 mt-4 c-text-3">
            📌 Todas as estatísticas consideram apenas rondas de torneio (sem EDS nem individuais).
          </div>
          <div className="cmp-feature-tags">
            {["⛳ Preparar Ronda", "Perfil radar", "Tabela detalhada", "🏅 Quem ganha em quê", "🔍 SWOT", "📐 Consistência", "Distribuição de scores", "Buraco a buraco", "⚔️ Duelos", "Evolução torneios"].map(label => (
              <span key={label} className="cmp-feature-tag">{label}</span>
            ))}
          </div>
        </div>
      )}

      {anyLoading && (
        <div className="card ta-c p-24">
          <LoadingState message="A carregar dados dos jogadores…" />
        </div>
      )}

      {slots.filter(s => s.error).map(s => (
        <div key={s.fed} className="card ta-c notice-error">
          <div className="notice-error-msg">Erro ao carregar {s.player.name}: {s.error}</div>
        </div>
      ))}

      {/* Preparar Ronda — visível logo que haja 1 jogador */}
      {slots.length >= 1 && !anyLoading && (
        <SectionErrorBoundary label="Preparar Ronda">
          <RoundPrepSection slots={slots} />
        </SectionErrorBoundary>
      )}

      {slots.length >= 2 && !anyLoading && (<>
        <SectionErrorBoundary label="Stats Table">
          <StatsTable slots={slots} allAgg={allAgg} statsDb={statsDb} />
        </SectionErrorBoundary>
        <SectionErrorBoundary label="Category Scorecard">
          <CategoryScorecardSection slots={slots} allAgg={allAgg} statsDb={statsDb} />
        </SectionErrorBoundary>
        <SectionErrorBoundary label="SWOT">
          <SwotSection slots={slots} allAgg={allAgg} statsDb={statsDb} />
        </SectionErrorBoundary>
        <SectionErrorBoundary label="Consistência">
          <ConsistencySection slots={slots} allAgg={allAgg} />
        </SectionErrorBoundary>
        <SectionErrorBoundary label="Score Distribution">
          <ScoreDistribution slots={slots} allAgg={allAgg} />
        </SectionErrorBoundary>
        <SectionErrorBoundary label="Hole by Hole">
          <HoleByHoleSection slots={slots} />
        </SectionErrorBoundary>
        <SectionErrorBoundary label="Head to Head">
          <HeadToHeadSection slots={slots} />
        </SectionErrorBoundary>
        <SectionErrorBoundary label="Tournament Evolution">
          <TournamentEvolutionSection slots={slots} />
        </SectionErrorBoundary>
      </>)}

      {slots.length === 1 && !anyLoading && (
        <div className="card ta-c p-24">
          <div className="mb-8 fs-24">👆</div>
          <div className="muted">Adiciona mais jogadores para ver a comparação completa</div>
        </div>
      )}
    </div>
  );
}
