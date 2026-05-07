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
 *   4. Perfil do jogador — leitura rápida e comparação visual
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
import { loadPlayerStats, type PlayerStatsDb, type PlayerStats } from "../data/playerStatsTypes";
import { norm, fD2, firstName, shortName } from "../utils/format";
import { clubShort, hcpDisplay } from "../utils/playerUtils";
import { deepFixMojibake } from "../utils/fixEncoding";
import { sc3, sc3m, SC } from "../utils/scoreDisplay";
import { isTournamentRound } from "../utils/roundFilters";
import { calcCourseHcp, expectedSD9, calcStrokesPerHole, get9hRatings } from "../utils/whsCalc";
import { sortTees } from "../utils/teeUtils";
import { getTeeHex, textOnColor } from "../utils/teeColors";
import SectionErrorBoundary from "../ui/SectionErrorBoundary";
import LoadingState from "../ui/LoadingState";
import { useSort } from "../hooks/useSort";
import SortableHdr from "../ui/SortableHdr";
import StatsTable from "./comparar/StatsTable";
import ConsistencySection from "./comparar/ConsistencySection";
import ScoreDistribution from "./comparar/ScoreDistribution";
import PerfilJogadorSection from "./comparar/PerfilJogadorSection";
import { COLORS, COLORS_LIGHT } from "./comparar/types";
import type { AggStats, ScoreDistBucket, PerHoleStat, PeriodKey as _PeriodKey, RoundInPeriod } from "./comparar/types";
import { PERIOD_OPTIONS, buildPeriodSelector } from "./comparar/types";

// Re-export for backwards compatibility of local usages that used PeriodKey before.
type PeriodKey = _PeriodKey;


interface Slot {
  fed: string; player: Player;
  data: PlayerPageData | null; loading: boolean; error: string | null;
}

/* ─── Aggregate stats (tournament rounds only) ─── */

const emptyDistBucket = (): ScoreDistBucket =>
  ({ eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, total: 0 });

/**
 * Classifica um diff (gross − par) numa categoria da distribuição.
 * Usada pelo aggregateStats e potencialmente por outros agregadores.
 */
function bumpDist(d: ScoreDistBucket, diff: number): void {
  if      (diff <= -2) d.eagle++;
  else if (diff === -1) d.birdie++;
  else if (diff ===  0) d.par++;
  else if (diff ===  1) d.bogey++;
  else if (diff ===  2) d.double++;
  else                  d.triple++;
  d.total++;
}

/**
 * Agrega estatísticas de rondas de torneio.
 *
 * @param data      Dados pré-carregados do jogador.
 * @param inPeriod  Se passado, só considera rondas em que `inPeriod(r)` é true.
 *                  Construído uma vez por jogador via `buildPeriodSelector()`
 *                  para evitar off-by-one e empates em modos "últimas N rondas".
 */
function aggregateStats(data: PlayerPageData, inPeriod?: RoundInPeriod): AggStats | null {
  const dist = emptyDistBucket();
  const distByPar: Record<3 | 4 | 5, ScoreDistBucket> = {
    3: emptyDistBucket(), 4: emptyDistBucket(), 5: emptyDistBucket(),
  };
  const f9dist = emptyDistBucket();
  const b9dist = emptyDistBucket();

  const parTypeAcc: Record<number, { sumDiff: number; count: number }> = {};
  let grossSum = 0, nRounds = 0, nRoundsWithCard = 0, bestGross: number | null = null;
  let sopSum = 0;
  let f9diff = 0, b9diff = 0, fbN = 0;
  // Totais F9/B9 quando as 9 foram jogadas (gross por meia-volta).
  const f9gross: number[] = [], b9gross: number[] = [];
  // Acumuladores por buraco (1..18) para o gráfico buraco-a-buraco.
  const holeAcc: { g: number; p: number; n: number }[] = Array.from({ length: 18 }, () => ({ g: 0, p: 0, n: 0 }));
  const sdAll: { sd: number; dateSort: number; event: string }[] = [];
  const grossAll: number[] = [];

  for (const cd of data.DATA) {
    for (const r of cd.rounds) {
      // Filtro de período — primeiro de tudo, para evitar custos desnecessários.
      if (inPeriod && !inPeriod(r)) continue;
      // Filtro unificado (18h torneio + 9h credíveis). Ver isValidForStats().
      if (!isValidForStats(r)) continue;
      const g = Number(r.gross);
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
        let f9gSum = 0, b9gSum = 0, f9n = 0, b9n = 0;
        for (let i = 0; i < 18; i++) {
          const hg = holes.g[i];
          const hp = holes.p[i];
          if (hg == null || hp == null) continue;
          const diff = hg - hp;
          roundPar += hp;
          bumpDist(dist, diff);
          if (hp === 3 || hp === 4 || hp === 5) bumpDist(distByPar[hp as 3 | 4 | 5], diff);
          if (!parTypeAcc[hp]) parTypeAcc[hp] = { sumDiff: 0, count: 0 };
          parTypeAcc[hp].sumDiff += diff;
          parTypeAcc[hp].count++;
          if (i < 9) {
            f9 += diff; bumpDist(f9dist, diff);
            f9gSum += hg; f9n++;
          } else {
            b9 += diff; bumpDist(b9dist, diff);
            b9gSum += hg; b9n++;
          }
          // Acumular no balde por-índice-de-buraco
          holeAcc[i].g += hg;
          holeAcc[i].p += hp;
          holeAcc[i].n++;
        }
        sopSum += (g - roundPar);
        f9diff += f9; b9diff += b9; fbN++;
        if (f9n === 9) f9gross.push(f9gSum);
        if (b9n === 9) b9gross.push(b9gSum);
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

  const perHoleAvg: PerHoleStat[] = holeAcc.map(a => ({
    avg:    a.n > 0 ? a.g / a.n : null,
    parAvg: a.n > 0 ? a.p / a.n : null,
    n:      a.n,
  }));

  const avgArr = (arr: number[]): number | null => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

  return {
    totalStrokesOverPar: sopSum / nRounds,
    parOrBetterPct: pob,
    dblOrWorsePct: dow,
    byPar, nRounds, nRoundsWithCard,
    scoreDist: dist,
    distByPar,
    f9dist, b9dist,
    f9toParAvg: fbN > 0 ? f9diff / fbN : null,
    b9toParAvg: fbN > 0 ? b9diff / fbN : null,
    f9grossAvg: avgArr(f9gross),
    b9grossAvg: avgArr(b9gross),
    perHoleAvg,
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

function buildTourneyHoleStats(data: PlayerPageData, inPeriod?: RoundInPeriod): Map<string, { label: string; nR: number; stats: SimpleHoleStats }> {
  const map = new Map<string, { label: string; nR: number; stats: SimpleHoleStats }>();
  const grouped = new Map<string, { tee: string; course: string; nH: number; scoreIds: string[] }>();
  for (const cd of data.DATA) {
    for (const r of cd.rounds) {
      // Filtro unificado: aceita 18h torneio + 9h credíveis.
      if (inPeriod && !inPeriod(r)) continue;
      if (!isValidForStats(r)) continue;
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
  for (const [key, { tee, nH, scoreIds }] of grouped) {
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

/**
 * Gross máximo credível para 18 buracos.
 * Filtra erros de dados (999, 300, ...) e rondas de Pares/Foursomes
 * onde o gross pode ter ficado registado de forma absurda.
 * Nenhum jogador real de torneio faz mais de 130 num campo de 72.
 */
const MAX_CREDIBLE_GROSS = 130;

/**
 * Predicate único "ronda entra nas estatísticas da página Comparar".
 * Abrange:
 *  - 18h de torneio (via isTournamentRound), excluindo eventos de equipa
 *  - 9h credíveis (Drive Challenge etc.), excluindo EDS/Indiv/Treino
 * Usado tanto para computar o cutoff "Últimas N rondas" como para decidir
 * quais rondas entram nas agregações — garantindo que o cutoff e o que é
 * mostrado são consistentes (selecionar "20 rondas" mostra exactamente 20).
 */
function isValidForStats(r: RoundData): boolean {
  if (r._isTreino || r._isTeamEvent || r.gross == null) return false;
  const origin = (r.scoreOrigin || "").trim();
  if (origin === "EDS" || origin === "Indiv" || origin === "Treino") return false;
  // Defesa adicional: alguns ficheiros FPG têm eventName="EDS"/"Indiv" sem scoreOrigin correspondente.
  const ev = (r.eventName || "").trim();
  if (ev === "EDS" || ev === "Indiv") return false;
  const g = Number(r.gross);
  if (r.holeCount === 9) return g > 25 && g <= 70;
  if (r.holeCount === 18) return isTournamentRound(r) && g > 50 && g <= MAX_CREDIBLE_GROSS;
  return false;
}

/** Apanha todas as rondas válidas de um jogador, já achatadas. */
function validRoundsOf(data: PlayerPageData): RoundData[] {
  const out: RoundData[] = [];
  for (const cd of data.DATA) {
    for (const r of cd.rounds) {
      if (isValidForStats(r)) out.push(r);
    }
  }
  return out;
}

/* ─── Helpers visuais ─── */

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
      <div className="cmp-search-row mb-10" ref={ref}>
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
        <div className="d-flex flex-wrap gap-8">
          {slots.map((s, i) => {
            const ps = statsDb[s.fed];
            return (
              <span key={s.fed} className="p" style={{
                borderColor: COLORS[i], background: COLORS_LIGHT[i],
                display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", fontSize: 13, borderRadius: "var(--radius-pill)",
              }}>
                <span className="round shrink-0" style={{ width: 10, height: 10, background: COLORS[i] }} />
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
function buildHoleProfile(data: PlayerPageData, simCourses: Course[], inPeriod?: RoundInPeriod): HoleProfile {
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
  // Três índices de lookup para máxima cobertura
  const courseByNorm = new Map<string, Course>();
  const byCourseKey  = new Map<string, Course>();
  for (const c of simCourses) {
    courseByNorm.set(norm(c.master.name), c);
    byCourseKey.set(c.courseKey, c);
  }

  /** Verifica se um campo tem pelo menos um tee com dados de distância */
  function hasDist(c: Course): boolean {
    return c.master.tees.some(t => (t.holes ?? []).some(h => (h.distance ?? 0) > 0));
  }

  function findCourse(courseName: string): Course | undefined {
    const n = norm(courseName);

    // 1. Exacto por nome normalizado
    const exact = courseByNorm.get(n);
    if (exact) return exact;

    // 2. Por courseKey derivado: "away-" + n com espaços → hífens
    //    Ex: "Villa Padierna Flamingos" → "away-villa-padierna-flamingos"
    //    Apanha "away-villa-padierna-flamingos-espanha" por prefixo
    const derivedKey = "away-" + n.replace(/ /g, "-");
    for (const [ck, c] of byCourseKey) {
      if (ck.startsWith(derivedKey) || derivedKey.startsWith(ck)) {
        if (hasDist(c)) return c;
      }
    }

    // 3. Partial por nome — só se a chave for substantiva (≥12 chars) e houver distâncias
    for (const [key, c] of courseByNorm) {
      if (key.length >= 12 && (key.includes(n) || (n.includes(key)))) {
        if (hasDist(c)) return c;
      }
    }

    return undefined;
  }

  for (const cd of data.DATA) {
    const courseMatch = findCourse(cd.course);
    for (const r of cd.rounds) {
      // Usa isValidForStats — aceita 18h torneio + 9h credíveis (Drive Challenge, etc.).
      if (!isValidForStats(r)) continue;
      if (inPeriod && !inPeriod(r)) continue;
      const hd = data.HOLES[r.scoreId];
      if (!hd?.g || hd.g.length === 0) continue;

      // Percorremos apenas os buracos disponíveis — 9 em Drive Challenge, 18 em torneio normal.
      const nH = Math.min(hd.g.length, 18);

      // Distâncias: usar hd.m se tiver valores reais (>0).
      // Alguns scorecards internacionais têm hd.m=[0,0,...] — tratar como sem dados.
      const distByHole: (number | null)[] = Array(nH).fill(null);
      const hasRealMeters = hd.m != null && hd.m.some(v => v != null && v > 0);
      if (hasRealMeters) {
        for (let hi = 0; hi < nH; hi++) {
          distByHole[hi] = (hd.m![hi] ?? 0) > 0 ? hd.m![hi] : null;
        }
      } else if (courseMatch) {
        const teeNorm = norm(r.tee || "");
        const tee = courseMatch.master.tees.find(t => norm(t.teeName) === teeNorm)
          ?? courseMatch.master.tees[0];
        if (tee?.holes) {
          for (const h of tee.holes) {
            if (h.hole >= 1 && h.hole <= nH) distByHole[h.hole - 1] = h.distance ?? null;
          }
        }
      }

      for (let i = 0; i < nH; i++) {
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
const BOGEY_COLOR  = "var(--color-info)";
const DBL_COLOR    = "var(--color-info)";

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
      {/* Barra proporcional (visual) — só colorida */}
      <div style={{ display:"flex", height:13, borderRadius:6, overflow:"hidden", marginBottom:10 }}>
        {segs.map((seg, i) => seg.pct >= 1
          ? <div key={i} style={{ width:`${seg.pct}%`, background:seg.bg }}
              title={`${seg.label}: ${seg.n} (${seg.pct.toFixed(0)}%)`} />
          : null
        )}
      </div>
      {/* Stats em row livre — espaço fixo mínimo por item, sem interferência da barra */}
      <div style={{ display:"flex", gap:0, width:"100%" }}>
        {segs.map((seg, i) => {
          if (seg.n === 0) return null;
          const tc = seg.bg === PAR_COLOR ? "var(--text-2)" : seg.bg;
          // Ponto colorido que liga ao segmento da barra acima
          return (
            <div key={i} style={{ flex:"1 1 0", minWidth:52, paddingRight:6 }}>
              {/* Indicador de cor */}
              <div style={{ width:10, height:10, borderRadius:3, background:seg.bg, marginBottom:3 }} />
              <div style={{ fontSize:13, fontWeight:700, color:tc, lineHeight:1.2, whiteSpace:"nowrap" }}>
                {seg.n}
                <span style={{ fontSize:11, fontWeight:500, marginLeft:3, opacity:0.85 }}>
                  ({seg.pct.toFixed(0)}%)
                </span>
              </div>
              <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:1, whiteSpace:"nowrap" }}>
                {seg.label}
              </div>
            </div>
          );
        })}
      </div>
    </td>
  );
}

/** Soma todos os baldes de distância de um dado par para obter o total coerente */
function sumParBuckets(profile: HoleProfile | null, par: number): HoleBucket | null {
  if (!profile) return null;
  const buckets = PAR_BUCKETS[par] ?? [];
  const total: HoleBucket = { n:0,sumDiff:0,eagle:0,birdie:0,parScore:0,bogey:0,double:0,triple:0 };
  for (const bkt of buckets) {
    const b = profile.get(`${par}|${bkt}`);
    if (!b || b.n === 0) continue;
    total.n        += b.n;
    total.sumDiff  += b.sumDiff;
    total.eagle    += b.eagle;
    total.birdie   += b.birdie;
    total.parScore += b.parScore;
    total.bogey    += b.bogey;
    total.double   += b.double;
    total.triple   += b.triple;
  }
  return total.n > 0 ? total : null;
}

function HoleProfileSection({ slots, refTee, holesMode, period }: {
  slots: Slot[];
  refTee: Tee | null;
  holesMode: "18" | "front9" | "back9";
  period: PeriodKey;
}) {
  const { simCourses } = useAppContext();
  const loaded = slots.filter(s => s.player);

  const teeHex = refTee ? getTeeHex(refTee.teeName, refTee.scorecardMeta?.teeColor) : BOGEY_COLOR;
  const teeTextColor = textOnColor(teeHex);

  const profiles = useMemo(() => {
    return loaded.map(s => {
      if (!s.data) return null;
      // HoleProfile só considera 18h de torneio — selector aplicado a esse universo.
      const base = s.data.DATA.flatMap(cd =>
        cd.rounds.filter(r => isTournamentRound(r) && !r._isTeamEvent)
      );
      const inPeriod = buildPeriodSelector(period, base);
      return buildHoleProfile(s.data, simCourses, inPeriod);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, simCourses, period]);

  const holes = useMemo(() => {
    if (!refTee?.holes) return [];
    const all = [...refTee.holes].filter(h => h.par != null).sort((a, b) => a.hole - b.hole);
    if (holesMode === "front9") return all.filter(h => h.hole <= 9);
    if (holesMode === "back9") return all.filter(h => h.hole > 9);
    return all;
  }, [refTee, holesMode]);

  if (loaded.every(s => !s.data)) return null;

  const hasCourse    = !!refTee;
  const hasDistances = hasCourse && holes.some(h => (h.distance ?? 0) > 0);
  // Sem campo seleccionado: mostrar sempre os 3 tipos de par (o perfil existe independentemente)
  const parTypes: (3 | 4 | 5)[] = hasCourse
    ? ([3, 4, 5] as const).filter(p => holes.some(h => h.par === p))
    : [3, 4, 5];



  return (
    <div className="mt-20">
      <div className="flex-wrap-gap10 mb-14" style={{ alignItems:"center" }}>
        <span className="h-md">🔍 Perfil Histórico por Tipo de Buraco</span>
        <span className="muted fs-11" style={{ marginLeft:"auto" }}>
          Período: <b>{PERIOD_OPTIONS.find(o => o.key === period)?.label ?? period}</b>
        </span>
      </div>
      <div className="muted fs-11 mb-10">
        {hasCourse
          ? "Desempenho em torneios por par e distância — linhas destacadas = buracos deste campo."
          : "Desempenho histórico em torneios, por tipo de buraco. Selecciona um campo para ver os buracos específicos e comparar por distância."}
      </div>

      {/* ── Tabela resumo do período seleccionado ── */}
      {(() => {
        // Calcular resumo por jogador: rondas e buracos por par
        const summary = loaded.map((s) => {
          if (!s.data) return { name: s.player.name, nRondasTorneio: 0, nRondas9h: 0, nEDS: 0, nTreino: 0, nRondas: 0, nHolesTotal: 0, holesWithCard: 0, parTotals: { 3:0, 4:0, 5:0 } };

          // Selector do período (mesmo universo do buildHoleProfile: 18h torneio)
          const base = s.data.DATA.flatMap(cd =>
            cd.rounds.filter(r => isTournamentRound(r) && !r._isTeamEvent)
          );
          const inPeriod = buildPeriodSelector(period, base);

          let nRondasTorneio = 0; // torneio 18h (entra na análise)
          let nRondas9h = 0;       // 9 buracos (Drive Challenge, etc.)
          let nEDS = 0;            // EDS
          let nTreino = 0;         // Treinos / individuais
          let nHolesTotal = 0;
          const parTotals: Record<number, number> = { 3:0, 4:0, 5:0 };
          let holesWithCard = 0;

          for (const cd of s.data.DATA) {
            for (const r of cd.rounds) {
              if (!inPeriod(r)) continue;
              const origin = (r.scoreOrigin || "").trim();
              const hc = r.holeCount ?? 18;

              // Classificar a ronda
              if (origin === "EDS") {
                nEDS++;
              } else if (r._isTreino || origin === "Indiv" || origin === "Treino") {
                nTreino++;
              } else if (hc === 9) {
                nRondas9h++;
              } else if (isTournamentRound(r) && !r._isTeamEvent) {
                nRondasTorneio++;
                nHolesTotal += hc;
                const hd = s.data.HOLES[r.scoreId];
                if (hd?.p && hd.p.length > 0) {
                  const validP = hd.p.filter((p): p is number => p != null);
                  holesWithCard += validP.length;
                  for (const p of validP) {
                    if (p === 3 || p === 4 || p === 5) parTotals[p]++;
                  }
                }
              } else {
                nTreino++; // outros (equipas, etc.)
              }
            }
          }
          const nRondas = nRondasTorneio;

          return { name: s.player.name, nRondasTorneio, nRondas9h, nEDS, nTreino, nRondas, nHolesTotal, holesWithCard, parTotals };
        });

        // Sorting for data summary table
        const { sortKey, sortDir, toggleSort } = useSort<"name" | "9h" | "eds" | "outros" | "tourn18" | "buracos" | "par3" | "par4" | "par5" | "scorecard">("tourn18", "desc");
      
        const sortedSummary = [...summary].sort((a, b) => {
          let aVal: any = a.name, bVal: any = b.name;

          if (sortKey === "name") {
            aVal = a.name;
            bVal = b.name;
          } else if (sortKey === "9h") {
            aVal = a.nRondas9h;
            bVal = b.nRondas9h;
          } else if (sortKey === "eds") {
            aVal = a.nEDS;
            bVal = b.nEDS;
          } else if (sortKey === "outros") {
            aVal = a.nTreino;
            bVal = b.nTreino;
          } else if (sortKey === "tourn18") {
            aVal = a.nRondasTorneio;
            bVal = b.nRondasTorneio;
          } else if (sortKey === "buracos") {
            aVal = a.nHolesTotal;
            bVal = b.nHolesTotal;
          } else if (sortKey === "par3") {
            aVal = a.parTotals[3];
            bVal = b.parTotals[3];
          } else if (sortKey === "par4") {
            aVal = a.parTotals[4];
            bVal = b.parTotals[4];
          } else if (sortKey === "par5") {
            aVal = a.parTotals[5];
            bVal = b.parTotals[5];
          } else if (sortKey === "scorecard") {
            aVal = a.holesWithCard;
            bVal = b.holesWithCard;
          }

          if (typeof aVal === "string") {
            const cmp = aVal.localeCompare(bVal, "pt");
            return sortDir === "asc" ? cmp : -cmp;
          }

          aVal = aVal ?? 0;
          bVal = bVal ?? 0;
          const cmp = aVal - bVal;
          return sortDir === "asc" ? cmp : -cmp;
        });

        return (
          <div style={{
            border: "1px solid var(--border-light)", borderRadius: "var(--radius)",
            marginBottom: 18, overflow: "hidden",
          }}>
            {/* Cabeçalho */}
            <div style={{
              background: "var(--bg-header)", padding: "7px 14px",
              display: "flex", alignItems: "center", gap: 8,
              borderBottom: "1px solid var(--border-light)",
            }}>
              <span className="fs-12 fw-700">📋 Dados incluídos</span>
              <span className="muted fs-11">
                {period === "all"
                  ? "todos os torneios"
                  : PERIOD_OPTIONS.find(o => o.key === period)?.label}
              </span>
            </div>
            <div className="scroll-x">
              <table className="dtable-lg fs-12" style={{ width:"100%" }}>
                <thead>
                  <tr>
                    <SortableHdr k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Jogador</SortableHdr>
                    <SortableHdr k="9h" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Rondas de 9 buracos (Drive Challenge, etc.)">9h</SortableHdr>
                    <SortableHdr k="eds" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Rondas EDS (Equalized Differential Score)">EDS</SortableHdr>
                    <SortableHdr k="outros" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" title="Treinos, individuais e outras rondas não competitivas">Outros</SortableHdr>
                    <SortableHdr k="tourn18" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" style={{ background:"var(--bg-info-subtle)", borderLeft:"2px solid var(--color-info)" }} title="Rondas de torneio 18 buracos — usadas na análise abaixo">Torneio 18h</SortableHdr>
                    <SortableHdr k="buracos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" style={{ background:"var(--bg-info-subtle)" }}>Buracos</SortableHdr>
                    <SortableHdr k="par3" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" style={{ background:"var(--bg-info-subtle)" }} title="Buracos na análise (c/distância) / totais do scorecard">Par 3</SortableHdr>
                    <SortableHdr k="par4" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" style={{ background:"var(--bg-info-subtle)" }} title="Buracos na análise (c/distância) / totais do scorecard">Par 4</SortableHdr>
                    <SortableHdr k="par5" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" style={{ background:"var(--bg-info-subtle)" }} title="Buracos na análise (c/distância) / totais do scorecard">Par 5</SortableHdr>
                    <SortableHdr k="scorecard" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" style={{ background:"var(--bg-info-subtle)" }}>Com scorecard</SortableHdr>
                  </tr>
                </thead>
                <tbody>
                  {sortedSummary.map((s, i) => {
                    return (
                      <tr key={i}>
                        <td>
                          <span className="round shrink-0" style={{
                            width:8, height:8, background:COLORS[i],
                            display:"inline-block", marginRight:7, verticalAlign:"middle",
                          }} />
                          <span className="fw-600">{s.name}</span>
                        </td>
                        <td className="r mono">{s.nRondas9h > 0 ? s.nRondas9h : "–"}</td>
                        <td className="r mono">{s.nEDS > 0 ? s.nEDS : "–"}</td>
                        <td className="r mono">{s.nTreino > 0 ? s.nTreino : "–"}</td>
                        <td className="r mono fw-800"
                          style={{ background:"var(--bg-info-subtle)", borderLeft:"2px solid var(--color-info)" }}>
                          {s.nRondasTorneio}
                        </td>
                        <td className="r mono fw-600" style={{ background:"var(--bg-info-subtle)" }}>{s.nHolesTotal}</td>
                        {([3, 4, 5] as const).map(par => {
                          const analyzed = sumParBuckets(profiles[i], par)?.n ?? 0;
                          const total    = s.parTotals[par] ?? 0;
                          const mismatch = analyzed < total;
                          return (
                            <td key={par} className="r mono" style={{ background:"var(--bg-info-subtle)" }}>
                              {mismatch
                                ? <span title={`${analyzed} com distância / ${total} totais`}>
                                    <span style={{ fontWeight:700 }}>{analyzed}</span>
                                    <span className="muted fs-10" style={{ marginLeft:2 }}>/{total}</span>
                                  </span>
                                : <span style={{ fontWeight:600 }}>{total}</span>
                              }
                            </td>
                          );
                        })}
                        <td className="r mono" style={{ background:"var(--bg-info-subtle)", color: s.holesWithCard < s.nHolesTotal ? "var(--color-warn)" : undefined }}>
                          {s.holesWithCard < s.nHolesTotal
                            ? `${s.holesWithCard} / ${s.nHolesTotal}`
                            : s.holesWithCard}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

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
              background: "var(--bg-header)", padding: "10px 16px",
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              borderBottom: "1px solid var(--border)",
            }}>
              <span style={{ fontSize:15, fontWeight:800, letterSpacing:"-0.3px" }}>Par {par}</span>
              <span className="muted fs-12">
                {parHoles.length} buraco{parHoles.length !== 1 ? "s" : ""} neste campo
              </span>
              {hasCourse && hasDistances && parHoles.length > 0 && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginLeft:4 }}>
                  {parHoles.map(h => (
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
              {!hasCourse && (
                <span className="muted fs-11" style={{ fontStyle:"italic" }}>
                  selecciona um campo para ver os buracos específicos
                </span>
              )}
            </div>

            <div className="scroll-x">
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
                        background: (hasCourse && isUsed) ? "var(--bg-info-subtle, rgba(59,130,246,.06))" : undefined,
                      }}>
                        <td style={{ padding:"12px 14px" }}>
                          <span style={{ fontSize:14, fontWeight:700 }}>{bktLabel(bkt)}</span>
                          {isUsed && (
                            <div style={{ marginTop:6, display:"flex", flexWrap:"wrap", gap:6 }}>
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

                  {/* Linha total = soma dos baldes (coerente com as linhas acima) */}
                  <tr style={{ borderTop:"2px solid var(--border)", background:"var(--bg-header)" }}>
                    <td className="fw-700 fs-11 c-text-3">Todos Par {par}</td>
                    {loaded.map((_, i) => (
                      <BucketCell
                        key={i}
                        bucket={sumParBuckets(profiles[i], par)}
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

      {/* ── Tabela buraco a buraco — só quando há campo seleccionado com distâncias ── */}
      {hasCourse && hasDistances && (
        <>
          <div className="fs-12 fw-600 c-text-2 mb-8 mt-4">⛳ Buraco a Buraco — grupo de distância aplicado</div>
          <div className="scroll-x">
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
                      <td className="fw-600">P{hole.par}</td>
                      <td className="fs-11">
                        {dist ? `${dist}m` : "–"}
                        {bkt && (
                          <span className="muted ml-6 fs-10" >
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



function RoundPrepSection({ slots, period }: { slots: Slot[]; period: PeriodKey }) {
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
      <div className="h-md d-flex items-center gap-10 flex-wrap mb-14">
        <span>⛳ Preparar Ronda</span>
        {selectedCourse && <span className="muted fs-11 fw-400">{selectedCourse.master.name}</span>}
        {is9h && selectedCourse && <span className="chip fs-11">{holesMode === "front9" ? "Front 9" : "Back 9"}</span>}
      </div>

      {/* Configuração global */}
      <div className="d-flex flex-wrap gap-8 mb-14" style={{ alignItems: "flex-end" }}>
        {/* Campo */}
        <div style={{ position: "relative", minWidth: 220 }} ref={courseSearchRef}>
          <label className="fs-11 fw-600 c-text-3 mb-4" style={{ display: "block" }}>Campo</label>
          <input className="input w-full" 
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
        <div className="scroll-x mb-14">
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
                const teeHex = pc.tee ? getTeeHex(pc.tee.teeName, pc.tee.scorecardMeta?.teeColor) : "var(--text-muted)";
                const teeOptions = availableTees;
                if (pc.hi == null || !pc.ratings) {
                  return (
                    <tr key={i}>
                      <td>
                        <span className="round" style={{ width: 10, height: 10, background: COLORS[i], display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
                        <span className="fw-700">{firstName(pc.name)}</span>
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
                      <span className="fw-700">{firstName(pc.name)}</span>
                      <span className="c-text-3 fs-11 ml-6">{pc.escalao}</span>
                    </td>
                    <td>
                      <div className="d-flex items-center gap-6">
                        <span className="shrink-0" style={{ width: 10, height: 10, borderRadius: "50%", background: teeHex, display: "inline-block", border: "1px solid rgba(0,0,0,.2)" }} />
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
          <div className="scroll-x" style={{ overflowX: "auto" }}>
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

      {/* ── Perfil histórico por tipo de buraco — aparece sempre que há dados ── */}
      {loaded.some(s => s.data) && (
        <HoleProfileSection
          slots={slots}
          refTee={refTee ?? null}
          holesMode={holesMode}
          period={period}
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

/* StatsTable extraído para ./comparar/StatsTable.tsx */

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
    { label: "Forma", emoji: "🔥", getValue: (_a, ps) => ps?.formAlert === "hot" ? 1 : ps?.formAlert === "cold" ? -1 : 0, dir: "high" },
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
      <div className="gap-8" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
        {results.map(({ cat, winnerIdx, values }, ri) => (
          <div key={ri} style={{
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius)",
            padding: "8px 10px",
            background: winnerIdx >= 0 ? COLORS_LIGHT[winnerIdx] : "var(--bg-muted)",
            borderColor: winnerIdx >= 0 ? COLORS[winnerIdx] : undefined,
          }}>
            <div className="fs-11 fw-600 c-text-3 mb-4">{cat.emoji} {cat.label}</div>
            {loaded.map((_x, i) => {
              const v = values[i];
              const isWinner = winnerIdx === i;
              return (
                <div key={i} className="d-flex items-center gap-8" style={{ marginBottom: 2 }}>
                  <span className="round shrink-0" style={{ width: 8, height: 8, background: COLORS[i] }} />
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

/* ConsistencySection extraído para ./comparar/ConsistencySection.tsx */

/* ScoreDistribution extraído para ./comparar/ScoreDistribution.tsx */

/* ═══════════════════ § 7 BURACO A BURACO ═══════════════════ */

function HoleByHoleSection({ slots, period }: { slots: Slot[]; period: PeriodKey }) {
  const loaded = slots.filter(s => s.data);
  const [sel, setSel] = useState(0);

  const combos = useMemo(() => {
    if (loaded.length < 2) return [];
    const maps = loaded.map(s => {
      const inPeriod = buildPeriodSelector(period, validRoundsOf(s.data!));
      return buildTourneyHoleStats(s.data!, inPeriod);
    });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, period]);

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
      <div className="h-md d-flex items-center gap-10 flex-wrap">
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
      <div className="scroll-x mt-8">
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
                  const diffCol = diff == null ? undefined : sc3(diff, 0, 0.3);
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

function HeadToHeadSection({ slots, period }: { slots: Slot[]; period: PeriodKey }) {
  const loaded = slots.filter(s => s.data);
  const [showAll, setShowAll] = useState(false);

  const matches = useMemo(() => {
    if (loaded.length < 2) return [];
    // Selectors por jogador (modo "últimas N rondas" resolve-se por slot).
    // Usa isValidForStats — mesma definição do resto da página para garantir
    // que um duelo contabilizado aqui também conta nas estatísticas agregadas.
    const selectors = loaded.map(s => buildPeriodSelector(period, validRoundsOf(s.data!)));
    const eventMap = new Map<string, Map<number, RoundData & { course: string }>>();
    loaded.forEach((s, si) => {
      const inPeriod = selectors[si];
      for (const c of s.data!.DATA) for (const r of c.rounds) {
        if (!inPeriod(r)) continue;
        if (!isValidForStats(r)) continue;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, period]);

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

  // Sorting for H2H table
  const { sortKey, sortDir, toggleSort } = useSort<"date" | "tourn" | "p0" | "p1" | "p2" | "p3" | "delta">("date", "desc");

  const sortedMatches = [...matches].sort((a, b) => {
    let aVal: any = a.dateSort, bVal: any = b.dateSort;

    if (sortKey === "date") {
      aVal = a.dateSort;
      bVal = b.dateSort;
    } else if (sortKey === "tourn") {
      aVal = a.event;
      bVal = b.event;
    } else if (sortKey === "p0") {
      const aRes = a.results.find(r => r.idx === 0);
      const bRes = b.results.find(r => r.idx === 0);
      aVal = aRes?.gross ?? 999;
      bVal = bRes?.gross ?? 999;
    } else if (sortKey === "p1") {
      const aRes = a.results.find(r => r.idx === 1);
      const bRes = b.results.find(r => r.idx === 1);
      aVal = aRes?.gross ?? 999;
      bVal = bRes?.gross ?? 999;
    } else if (sortKey === "p2") {
      const aRes = a.results.find(r => r.idx === 2);
      const bRes = b.results.find(r => r.idx === 2);
      aVal = aRes?.gross ?? 999;
      bVal = bRes?.gross ?? 999;
    } else if (sortKey === "p3") {
      const aRes = a.results.find(r => r.idx === 3);
      const bRes = b.results.find(r => r.idx === 3);
      aVal = aRes?.gross ?? 999;
      bVal = bRes?.gross ?? 999;
    } else if (sortKey === "delta") {
      if (loaded.length === 2) {
        const r0a = a.results.find(r => r.idx === 0), r1a = a.results.find(r => r.idx === 1);
        const r0b = b.results.find(r => r.idx === 0), r1b = b.results.find(r => r.idx === 1);
        aVal = (r0a && r1a) ? Math.abs(r0a.gross - r1a.gross) : 999;
        bVal = (r0b && r1b) ? Math.abs(r0b.gross - r1b.gross) : 999;
      } else {
        aVal = 999;
        bVal = 999;
      }
    }

    if (typeof aVal === "string") {
      const cmp = aVal.localeCompare(bVal, "pt");
      return sortDir === "asc" ? cmp : -cmp;
    }

    aVal = aVal ?? 999;
    bVal = bVal ?? 999;
    const cmp = aVal - bVal;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const displayed = showAll ? sortedMatches : sortedMatches.slice(0, 20);

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
        <div className="gap-8" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
          <div style={{ background: "var(--bg-muted)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
            <div className="fs-11 fw-600 c-text-3 mb-4">Vitórias por 3+ pancadas</div>
            <div className="d-flex items-center gap-8">
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
      <div className="scroll-x cmp-result-list">
        <table className="dtable-lg">
          <thead><tr>
            <SortableHdr k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Data</SortableHdr>
            <SortableHdr k="tourn" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Torneio</SortableHdr>
            {loaded.map((s, i) => {
              const pKey = `p${i}` as "p0" | "p1" | "p2" | "p3";
              return <SortableHdr key={i} k={pKey} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r" style={{ color: COLORS[i] }}>{firstName(s.player.name)}</SortableHdr>;
            })}
            <SortableHdr k="delta" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Δ</SortableHdr>
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

function TournamentEvolutionSection({ slots, period }: { slots: Slot[]; period: PeriodKey }) {
  const [metric, setMetric] = useState<"sd" | "gross">("sd");
  const [showRounds, setShowRounds] = useState(false);
  const loaded = slots.filter(s => s.data);
  const isRankMode = period === "20r" || period === "10r";

  // Selector por jogador (modo "últimas N rondas" resolve-se por slot).
  const selectors = useMemo(() => loaded.map(s => buildPeriodSelector(period, validRoundsOf(s.data!))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [loaded, period]);

  const series = useMemo(() => {
    if (loaded.length < 2) return [];
    return loaded.map((s, i) => {
      const inPeriod = selectors[i];
      const pts: { d: number; dateStr: string; sd: number; gross: number; event: string; is9h: boolean; hi: number | null }[] = [];
      for (const cd of s.data!.DATA) {
        for (const r of cd.rounds) {
          if (!inPeriod(r)) continue;
          if (!isValidForStats(r)) continue;
          const is9h = r.holeCount === 9;
          const is18h = r.holeCount === 18;
          const gross = Number(r.gross);
          // Para gráficos, reforçar limite inferior 18h (≤50 é incredível em torneio).
          if (is18h && gross <= 50) continue;
          // SD: nunca usar sd=0 (placeholder FPG)
          const sd = r.sd != null && Number(r.sd) !== 0 && !isNaN(Number(r.sd)) ? Number(r.sd) : null;
          if (metric === "sd" && sd == null) continue;
          // HI ao momento da ronda — pode vir como string ("18.4") ou number (9.5).
          const hiRaw = r.hi;
          const hi = hiRaw != null && !isNaN(Number(hiRaw)) ? Number(hiRaw) : null;
          pts.push({ d: r.dateSort, dateStr: r.date, sd: sd ?? 0, gross, event: r.eventName, is9h, hi });
        }
      }
      pts.sort((a, b) => a.d - b.d);
      const rolling: { d: number; dateStr: string; rank: number; val: number; raw: number; event: string; is9h: boolean; hi: number | null; gross: number; sd: number }[] = [];
      const window = 5;
      for (let j = 0; j < pts.length; j++) {
        const start = Math.max(0, j - window + 1);
        const slice = pts.slice(start, j + 1);
        const avg = slice.reduce((s, p) => s + (metric === "sd" ? p.sd : p.gross), 0) / slice.length;
        rolling.push({
          d: pts[j].d, dateStr: pts[j].dateStr, rank: j + 1,
          val: avg, raw: metric === "sd" ? pts[j].sd : pts[j].gross,
          event: pts[j].event, is9h: pts[j].is9h, hi: pts[j].hi,
          gross: pts[j].gross, sd: pts[j].sd,
        });
      }
      return { name: s.player.name, color: COLORS[i], pts: rolling };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, selectors, metric]);

  if (loaded.length < 2) return null;
  const allPts = series.flatMap(s => s.pts);
  if (allPts.length < 4) return null;

  const W = 800, H = 280, PAD = { top: 20, right: 20, bottom: 44, left: 45 };
  // Dois modos de eixo X:
  // - Rank-based ("20r"/"10r"): X = índice da ronda 1..N por jogador. Ambas as linhas
  //   alinhadas, sempre com o mesmo número de pontos no eixo — evita a confusão de
  //   um jogador ter 20 rondas em 6 meses e o outro ter 20 em 3 anos.
  // - Time-based (tudo/2y/1y/6m): X = data. Eixo é partilhado no tempo real.
  const xDomainMin = isRankMode
    ? 1
    : Math.min(...allPts.map(p => p.d));
  const xDomainMax = isRankMode
    ? Math.max(...series.map(s => s.pts.length), 1)
    : Math.max(...allPts.map(p => p.d));
  const rangeD = Math.max(1, xDomainMax - xDomainMin);
  const xPosOf = (pt: { d: number; rank: number }) => {
    const v = isRankMode ? pt.rank : pt.d;
    return PAD.left + ((v - xDomainMin) / rangeD) * (W - PAD.left - PAD.right);
  };
  const allVals = allPts.map(p => p.val);
  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const rangeV = maxV - minV || 1, padV = rangeV * 0.15;
  const yPos = (v: number) => H - PAD.bottom - ((v - (minV - padV)) / (rangeV + 2 * padV)) * (H - PAD.top - PAD.bottom);
  const metricLabel = metric === "sd" ? "SD" : "Gross";

  // Série secundária: HCP Index ao longo do tempo por jogador.
  // Escala própria no lado direito (diferente do eixo principal de SD/Gross).
  const allHis = series.flatMap(s => s.pts.map(p => p.hi).filter((v): v is number => v != null));
  const showHcpLine = allHis.length >= 2 && metric === "sd";
  const minH = showHcpLine ? Math.min(...allHis) : 0;
  const maxH = showHcpLine ? Math.max(...allHis) : 0;
  const rangeH = Math.max(0.1, maxH - minH);
  const padH = rangeH * 0.15;
  const yPosH = (v: number) => H - PAD.bottom - ((v - (minH - padH)) / (rangeH + 2 * padH)) * (H - PAD.top - PAD.bottom);

  // Labels de eixo X
  const fmtDateShort = (ms: number) => new Date(ms).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "2-digit" });
  const xLabels: { x: number; text: string }[] = [];
  if (isRankMode) {
    const nTicks = Math.min(6, Math.ceil(xDomainMax));
    for (let k = 1; k <= nTicks; k++) {
      const rank = Math.round(1 + (xDomainMax - 1) * ((k - 1) / Math.max(1, nTicks - 1)));
      xLabels.push({ x: PAD.left + ((rank - 1) / rangeD) * (W - PAD.left - PAD.right), text: `#${rank}` });
    }
  } else {
    const nTicks = 5;
    for (let k = 0; k < nTicks; k++) {
      const d = xDomainMin + (rangeD * k) / (nTicks - 1);
      xLabels.push({ x: PAD.left + ((d - xDomainMin) / rangeD) * (W - PAD.left - PAD.right), text: fmtDateShort(d) });
    }
  }

  // Datas mínima e máxima efectivas por jogador — para mostrar nos KPIs.
  const dateRangeOf = (pts: { d: number }[]) => pts.length === 0
    ? null
    : { from: Math.min(...pts.map(p => p.d)), to: Math.max(...pts.map(p => p.d)) };

  return (
    <div className="card">
      <div className="h-md d-flex items-center gap-10 flex-wrap">
        Evolução em Torneios
        <select className="select" value={metric} onChange={e => setMetric(e.target.value as "sd" | "gross")}>
          <option value="sd">Score Differential</option>
          <option value="gross">Gross</option>
        </select>
        <span className="muted fs-10 fw-400">
          média móvel 5 rondas · {metric === "sd" ? "SD por ronda (não o HI)" : "gross por ronda"} ·
          período: <b>{PERIOD_OPTIONS.find(o => o.key === period)?.label ?? period}</b>
          {isRankMode && " · eixo por número da ronda (1 = mais antiga)"}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="cmp-radar-wrap-sm">
        {/* Linhas de Y */}
        {Array.from({ length: 5 }, (_, i) => {
          const val = minV - padV + (rangeV + 2 * padV) * (i / 4);
          return (
            <g key={`y${i}`}>
              <line x1={PAD.left} y1={yPos(val)} x2={W - PAD.right} y2={yPos(val)} stroke="var(--border-light)" strokeWidth={0.5} />
              <text x={PAD.left - 4} y={yPos(val) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">{val.toFixed(1)}</text>
            </g>
          );
        })}
        {/* Ticks do eixo X */}
        {xLabels.map((tk, i) => (
          <g key={`x${i}`}>
            <line x1={tk.x} x2={tk.x} y1={H - PAD.bottom} y2={H - PAD.bottom + 4} stroke="var(--border-medium)" strokeWidth={0.8} />
            <text x={tk.x} y={H - PAD.bottom + 16} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{tk.text}</text>
          </g>
        ))}
        {/* Séries principais — SD ou Gross */}
        {series.map((s, si) => {
          if (s.pts.length < 2) return null;
          const d = s.pts.map(pt => `${xPosOf(pt).toFixed(1)},${yPos(pt.val).toFixed(1)}`).join(" L ");
          return (
            <g key={si}>
              <path d={`M ${d}`} fill="none" stroke={s.color} strokeWidth={2} opacity={0.8} strokeLinejoin="round" />
              {s.pts.map((pt, j) => (
                <circle key={j} cx={xPosOf(pt)} cy={yPos(pt.val)} r={pt.is9h ? 3 : 2.5}
                  fill={pt.is9h ? "none" : s.color} stroke={s.color} strokeWidth={pt.is9h ? 1.5 : 0} opacity={0.7}>
                  <title>{s.name}: {metricLabel} {pt.raw.toFixed(1)}{pt.is9h ? " (9h)" : ""} — média {pt.val.toFixed(1)} — {pt.event} ({new Date(pt.d).toLocaleDateString("pt-PT")}){pt.hi != null ? ` · HI ${pt.hi.toFixed(1)}` : ""}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {/* Séries secundárias — HCP Index ao longo do tempo (linha a tracejado) */}
        {showHcpLine && series.map((s, si) => {
          const hiPts = s.pts.filter(p => p.hi != null);
          if (hiPts.length < 2) return null;
          const d = hiPts.map(pt => `${xPosOf(pt).toFixed(1)},${yPosH(pt.hi!).toFixed(1)}`).join(" L ");
          return (
            <g key={`hi${si}`} opacity={0.55}>
              <path d={`M ${d}`} fill="none" stroke={s.color} strokeWidth={1.4} strokeDasharray="5,3" />
            </g>
          );
        })}
        {/* Eixo Y direito para HCP */}
        {showHcpLine && (
          <>
            {Array.from({ length: 3 }, (_, i) => {
              const val = minH - padH + (rangeH + 2 * padH) * (i / 2);
              return (
                <text key={`hiY${i}`} x={W - PAD.right + 4} y={yPosH(val) + 3} fontSize={9} fill="var(--text-muted)">
                  {val.toFixed(1)}
                </text>
              );
            })}
            <text x={W - PAD.right + 4} y={PAD.top - 4} fontSize={10} fill="var(--text-muted)" fontWeight={700}>HI</text>
          </>
        )}
      </svg>
      {metric === "sd" && (
        <div className="muted fs-11 mt-4 mb-4">
          ℹ️ A linha sólida é o <strong>Score Differential</strong> por ronda (varia muito — pode ser 7 numa boa ronda e 24 numa má).
          {showHcpLine && <> A linha tracejada é o <strong>Handicap Index</strong> no momento da ronda (usa o eixo da direita).</>}
          {" "}O HI ≈ média das 8 melhores das últimas 20 × 96% — por isso rondas más individuais não disparam o HI.
          Pontos vazios = ronda de 9 buracos.
        </div>
      )}
      <div className="caKpis mt-8">
        {series.map((s, i) => {
          const last = s.pts.length > 0 ? s.pts[s.pts.length - 1].val : null;
          const first = s.pts.length > 0 ? s.pts[0].val : null;
          const delta = last != null && first != null ? last - first : null;
          const best = s.pts.length > 0 ? Math.min(...s.pts.map(p => p.raw)) : null;
          const dr = dateRangeOf(s.pts);
          return (
            <div key={i} className="caKpi" style={{ borderColor: s.color }}>
              <div className="caKpiVal" style={{ color: s.color }}>{last != null ? last.toFixed(1) : "–"}</div>
              <div className="caKpiLbl">{shortName(s.name)} · {s.pts.length} rondas</div>
              <div className="d-flex flex-wrap gap-8 jc-center mt-3" >
                {delta != null && <span className="fw-700 fs-10" style={{ color: sc3m(delta, 0, 0) }}>{delta > 0 ? "+" : ""}{delta.toFixed(1)}</span>}
                {best != null && <span className="fs-10 fw-600 c-text-3">melhor: {best.toFixed(metric === "sd" ? 1 : 0)}</span>}
              </div>
              {dr && (
                <div className="fs-10 c-text-3 mt-2">
                  {fmtDateShort(dr.from)} → {fmtDateShort(dr.to)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lista expansível das rondas contabilizadas — a utilizadora pode
          verificar exactamente o que está incluído no período. */}
      <div className="mt-12">
        <button
          className="btn-link fs-12"
          onClick={() => setShowRounds(v => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-primary)", fontWeight: 600 }}
        >
          {showRounds ? "▾ Esconder rondas contabilizadas" : `▸ Ver rondas contabilizadas (${series.reduce((s, x) => s + x.pts.length, 0)} no total)`}
        </button>
        {showRounds && (
          <div className="mt-8">
            {series.map((s, si) => (
              <div key={si} className="mb-14">
                <div className="fw-700 fs-12 mb-4" style={{ color: s.color }}>
                  <span className="round mr-6" style={{ width: 9, height: 9, background: s.color, display: "inline-block" }} />
                  {shortName(s.name)} · {s.pts.length} rondas
                </div>
                <div className="scroll-x">
                  <table className="dtable-lg fs-11">
                    <thead>
                      <tr>
                        <th className="r">#</th>
                        <th>Data</th>
                        <th>Torneio</th>
                        <th className="r">Bur.</th>
                        <th className="r">Gross</th>
                        <th className="r">SD</th>
                        <th className="r">HI no dia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Uma única ordenação desc (mais recente em cima).
                        const desc = [...s.pts].sort((a, b) => b.d - a.d);
                        const total = desc.length;
                        return desc.map((pt, idx) => {
                          const rankFromOldest = total - idx;  // oldest=1, newest=N
                          const isGoodSD = pt.sd > 0 && pt.sd <= 10;
                          const isBadSD  = pt.sd >= 17;
                          return (
                            <tr key={idx}>
                              <td className="r c-text-3 mono">{rankFromOldest}</td>
                              <td className="nowrap">{pt.dateStr}</td>
                              <td className="fs-11">{pt.event}{pt.is9h && <span className="chip fs-9 ml-6" style={{ verticalAlign: "middle" }}>9h</span>}</td>
                              <td className="r c-text-3">{pt.is9h ? 9 : 18}</td>
                              <td className="r mono">{pt.gross}</td>
                              <td className="r mono" style={{
                                color: isGoodSD ? SC.good : isBadSD ? SC.danger : "var(--text-2)",
                                fontWeight: isGoodSD || isBadSD ? 700 : 400,
                              }}>
                                {pt.sd > 0 ? pt.sd.toFixed(1) : "–"}
                              </td>
                              <td className="r c-text-3 mono">{pt.hi != null ? pt.hi.toFixed(1) : "–"}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <div className="muted fs-10 mt-6">
              SD em <span style={{ color: SC.good, fontWeight: 700 }}>verde</span> = ≤ 10 (ronda boa).
              SD em <span style={{ color: SC.danger, fontWeight: 700 }}>vermelho</span> = ≥ 17 (ronda fraca).
              O HCP Index (HI no dia) é o valor que estava em vigor no momento da ronda — repara como vai descendo apesar de algumas rondas más.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ MAIN ═══════════════════ */

export default function CompararPage() {
  const { players } = useAppContext();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [statsDb, setStatsDb] = useState<PlayerStatsDb>({});
  // Período único que filtra TODAS as análises da página.
  const [period, setPeriod] = useState<PeriodKey>("all");

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

  // Selector por slot (o modo "últimas N rondas" é por jogador).
  const selectors = useMemo<(RoundInPeriod | null)[]>(() => slots.map(s => {
    if (!s.data) return null;
    return buildPeriodSelector(period, validRoundsOf(s.data));
  }), [slots, period]);

  // Intervalo de datas efectivamente usado, para mostrar no header.
  const dateRange = useMemo(() => {
    const coveredStarts: number[] = [];
    const coveredEnds: number[] = [];
    slots.forEach((s, i) => {
      if (!s.data) return;
      const sel = selectors[i];
      const valid = validRoundsOf(s.data).filter(r => sel == null || sel(r));
      if (valid.length === 0) return;
      const dates = valid.map(r => r.dateSort);
      coveredStarts.push(Math.min(...dates));
      coveredEnds.push(Math.max(...dates));
    });
    if (coveredStarts.length === 0) return null;
    return {
      from: Math.min(...coveredStarts),
      to:   Math.max(...coveredEnds),
    };
  }, [slots, selectors]);

  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });

  const allAgg = useMemo(() => slots.map((s, i) => {
    if (!s.data) return null;
    try { return aggregateStats(s.data, selectors[i] ?? undefined); }
    catch (e) { console.error("[Comparar] aggregateStats error for", s.fed, e); return null; }
  }), [slots, selectors]);

  // Contar jogadores com amostra pequena (<5 rondas) no período.
  const smallSampleSlots = slots
    .map((s, i) => ({ s, n: allAgg[i]?.nRounds ?? 0, i }))
    .filter(x => x.s.data && x.n > 0 && x.n < 5);

  return (
    <div className="page-full">
      <PlayerSearch players={players} slots={slots} statsDb={statsDb} onAdd={addPlayer} onRemove={removePlayer} />

      {slots.length === 0 && (
        <div className="card empty-state">
          <div className="cmp-empty-icon">⚔️</div>
          <div className="h-md cmp-empty-title">Comparar Jogadores</div>
          <div className="muted fs-13 lh-16">
            Pesquisa e adiciona até 4 jogadores para comparar lado a lado.
          </div>
          <div className="muted fs-12 mt-4 c-text-3">
            📌 Todas as estatísticas consideram apenas rondas de torneio (sem EDS nem individuais).
          </div>
          <div className="cmp-feature-tags">
            {["⛳ Preparar Ronda", "Tabela detalhada", "🏅 Quem ganha em quê", "📖 Leitura rápida", "📐 Consistência", "Distribuição de scores", "Buraco a buraco", "⚔️ Duelos", "Evolução torneios"].map(label => (
              <span key={label} className="cmp-feature-tag">{label}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Barra única de PERÍODO — afecta TODAS as secções ── */}
      {slots.length >= 1 && !anyLoading && (
        <div className="card p-10 mb-12">
          <div className="d-flex items-center gap-10 flex-wrap">
            <span className="fw-700 fs-12">📅 Período de análise</span>
            <select
              className="select"
              value={period}
              onChange={e => setPeriod(e.target.value as PeriodKey)}
              title="Filtra TODAS as estatísticas, tabelas e gráficos desta página"
            >
              {PERIOD_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            {dateRange && (
              <span className="muted fs-11">
                {period === "all"
                  ? <>Todas as rondas — desde <b>{fmtDate(dateRange.from)}</b> até <b>{fmtDate(dateRange.to)}</b></>
                  : <>Cobre <b>{fmtDate(dateRange.from)}</b> → <b>{fmtDate(dateRange.to)}</b></>}
              </span>
            )}
            {slots.filter(s => s.data).length >= 1 && (
              <span className="fs-11 c-text-3" style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 6 }}>
                {slots.map((s, i) => {
                  const agg = allAgg[i];
                  if (!s.data || !agg) return null;
                  return (
                    <span key={s.fed} className="chip" style={{ borderColor: COLORS[i], color: COLORS[i] }}>
                      {firstName(s.player.name)}: {agg.nRounds} rondas
                    </span>
                  );
                })}
              </span>
            )}
          </div>
          <div className="muted fs-11 mt-4">
            {period === "all"
              ? "Todas as rondas contam: tabelas, buraco-a-buraco, duelos e evolução."
              : "Aplica-se a tudo: médias, distribuições, consistência, buraco-a-buraco, duelos e evolução."}
          </div>
        </div>
      )}

      {/* Aviso de amostra pequena */}
      {smallSampleSlots.length > 0 && period !== "all" && (
        <div className="card p-10 mb-12" style={{ borderLeft: `4px solid ${SC.warn}` }}>
          <div className="fw-700 fs-12" style={{ color: SC.warn }}>
            ⚠️ Amostra pequena no período escolhido
          </div>
          <div className="muted fs-11 mt-2">
            {smallSampleSlots.map((x, k) => (
              <span key={x.s.fed}>
                {k > 0 && " · "}
                <b style={{ color: COLORS[x.i] }}>{firstName(x.s.player.name)}</b> só tem {x.n} ronda{x.n === 1 ? "" : "s"}
              </span>
            ))}
            . Médias e distribuições podem não ser representativas — considera alargar o período.
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
          <RoundPrepSection slots={slots} period={period} />
        </SectionErrorBoundary>
      )}

      {slots.length >= 2 && !anyLoading && (<>
        <SectionErrorBoundary label="Stats Table">
          <StatsTable slots={slots} allAgg={allAgg} statsDb={statsDb} />
        </SectionErrorBoundary>
        <SectionErrorBoundary label="Category Scorecard">
          <CategoryScorecardSection slots={slots} allAgg={allAgg} statsDb={statsDb} />
        </SectionErrorBoundary>
        <SectionErrorBoundary label="Perfil do Jogador">
          <PerfilJogadorSection slots={slots} allAgg={allAgg} statsDb={statsDb} period={period} />
        </SectionErrorBoundary>
        <SectionErrorBoundary label="Consistência">
          <ConsistencySection slots={slots} allAgg={allAgg} period={period} />
        </SectionErrorBoundary>
        <SectionErrorBoundary label="Score Distribution">
          <ScoreDistribution slots={slots} allAgg={allAgg} />
        </SectionErrorBoundary>
        <SectionErrorBoundary label="Hole by Hole">
          <HoleByHoleSection slots={slots} period={period} />
        </SectionErrorBoundary>
        <SectionErrorBoundary label="Head to Head">
          <HeadToHeadSection slots={slots} period={period} />
        </SectionErrorBoundary>
        <SectionErrorBoundary label="Tournament Evolution">
          <TournamentEvolutionSection slots={slots} period={period} />
        </SectionErrorBoundary>
      </>)}

      {slots.length === 1 && !anyLoading && (
        <div className="card ta-c p-24">
          <div className="mb-8 fs-24">👆</div>
          <div className="muted">Adiciona
 outro jogador para começar a comparar.</div>
        </div>
      )}
    </div>
  );
}
