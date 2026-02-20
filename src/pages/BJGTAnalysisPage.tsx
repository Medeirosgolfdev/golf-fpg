/**
 * BJGTAnalysisPage.tsx — Análise Pré-Torneio: BJGT Daily Mail @ Villa Padierna
 *
 * Preparação para o Manuel (Sub-12).
 * Usa HOLE_STATS pré-calculado + HOLES/EC para eclético.
 * Inclui secção de rivais internacionais.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  loadPlayerData,
  type PlayerPageData,
  type RoundData,
  type HoleScores,
  type HoleStatsData,
  type HoleStatEntry,
  type EclecticEntry,
} from "../data/playerDataLoader";
import { deepFixMojibake } from "../utils/fixEncoding";
import { norm } from "../utils/format";
import { scClass } from "../utils/scoreDisplay";
import RivaisDashboard from "./RivaisDashboard";

/* ═══════════════════════════════════
   CONFIG
   ═══════════════════════════════════ */
const PLAYER_FED = "52884";
const PLAYER_NAME = "Manuel";
const COURSE_KEYWORDS = ["villa padierna", "flamingos"];
const TOURN = {
  name: "Daily Mail World Junior Golf Championship",
  dates: "24–27 Fev 2026",
  days: 3,
  location: "Villa Padierna — Flamingos Golf Club",
  city: "Málaga, Espanha",
};

/* Field data from 2025 BJGT VP Flamingos — 12 players × 3 days = 36 scorecards */
const FIELD_2025 = {
  nPlayers: 12, nRounds: 36, fieldAvg: 78.3, top5Avg: 73.0, top10Avg: 75.5,
  winner: { name: "Dmitrii Elchaninov", total: 205, result: -8 },
  holes: [
    { h:1,  par:5, fAvg:5.81, t5:5.33, fDbl:25.0, t5Dbl:13.3, fPob:44.4, t5Pob:66.7 },
    { h:2,  par:3, fAvg:3.11, t5:2.87, fDbl:0.0,  t5Dbl:0.0,  fPob:72.2, t5Pob:93.3 },
    { h:3,  par:4, fAvg:4.39, t5:4.00, fDbl:13.9, t5Dbl:0.0,  fPob:63.9, t5Pob:73.3 },
    { h:4,  par:3, fAvg:3.44, t5:3.53, fDbl:5.6,  t5Dbl:6.7,  fPob:52.8, t5Pob:46.7 },
    { h:5,  par:4, fAvg:4.17, t5:3.87, fDbl:8.3,  t5Dbl:0.0,  fPob:72.2, t5Pob:86.7 },
    { h:6,  par:5, fAvg:5.28, t5:5.00, fDbl:8.3,  t5Dbl:0.0,  fPob:66.7, t5Pob:73.3 },
    { h:7,  par:4, fAvg:4.14, t5:3.87, fDbl:5.6,  t5Dbl:0.0,  fPob:77.8, t5Pob:93.3 },
    { h:8,  par:3, fAvg:3.39, t5:3.00, fDbl:13.9, t5Dbl:0.0,  fPob:66.7, t5Pob:86.7 },
    { h:9,  par:4, fAvg:4.44, t5:4.20, fDbl:11.1, t5Dbl:6.7,  fPob:63.9, t5Pob:80.0 },
    { h:10, par:4, fAvg:4.89, t5:4.53, fDbl:25.0, t5Dbl:6.7,  fPob:44.4, t5Pob:66.7 },
    { h:11, par:5, fAvg:5.42, t5:5.20, fDbl:5.6,  t5Dbl:0.0,  fPob:52.8, t5Pob:60.0 },
    { h:12, par:3, fAvg:3.44, t5:3.27, fDbl:5.6,  t5Dbl:0.0,  fPob:58.3, t5Pob:66.7 },
    { h:13, par:4, fAvg:4.47, t5:4.27, fDbl:13.9, t5Dbl:6.7,  fPob:52.8, t5Pob:60.0 },
    { h:14, par:4, fAvg:4.22, t5:3.93, fDbl:11.1, t5Dbl:6.7,  fPob:69.4, t5Pob:86.7 },
    { h:15, par:5, fAvg:5.50, t5:5.07, fDbl:13.9, t5Dbl:6.7,  fPob:61.1, t5Pob:80.0 },
    { h:16, par:3, fAvg:3.28, t5:3.13, fDbl:11.1, t5Dbl:13.3, fPob:72.2, t5Pob:86.7 },
    { h:17, par:4, fAvg:4.19, t5:3.67, fDbl:5.6,  t5Dbl:0.0,  fPob:72.2, t5Pob:86.7 },
    { h:18, par:4, fAvg:4.69, t5:4.27, fDbl:16.7, t5Dbl:6.7,  fPob:41.7, t5Pob:60.0 },
  ],
  /* Difficulty rank: hardest first */
  diffRank: [10,1,18,15,13,9,4,12,11,8,3,6,16,14,17,5,7,2],
  leaderboard: [
    { name:"Dmitrii Elchaninov", pos:1, total:205, result:-8, rounds:[68,69,68], best:68 },
    { name:"Marcus Karim", pos:2, total:218, result:5, rounds:[74,73,71], best:71 },
    { name:"Harrison Barnett", pos:3, total:220, result:7, rounds:[77,71,72], best:71 },
    { name:"Julian Sepulveda", pos:4, total:223, result:10, rounds:[73,77,73], best:73 },
    { name:"Mihir Pasura", pos:5, total:229, result:16, rounds:[82,74,73], best:73 },
    { name:"Nicolas Pape", pos:6, total:231, result:18, rounds:[75,77,79], best:75 },
    { name:"Harry-James Odell", pos:7, total:231, result:18, rounds:[77,74,80], best:74 },
    { name:"Aronas Juodis", pos:8, total:232, result:19, rounds:[74,77,81], best:74 },
    { name:"Hugo Luque Reina", pos:9, total:237, result:24, rounds:[78,77,82], best:77 },
    { name:"Maxime Vervaet", pos:10, total:239, result:26, rounds:[83,77,79], best:77 },
  ],
};/* ═══════════════════════════════════
   HELPERS
   ═══════════════════════════════════ */
function matchesCourse(name: string): boolean {
  const n = norm(name);
  return COURSE_KEYWORDS.some(kw => n.includes(kw));
}
function fmtTP(tp: number | null | undefined): string {
  if (tp == null) return "–";
  return tp === 0 ? "E" : tp > 0 ? `+${tp}` : String(tp);
}
function ScoreCircle({ g, p, sm }: { g: number | null; p: number | null; sm?: boolean }) {
  if (g == null || g <= 0) return <span className="muted" style={{ fontSize: 9 }}>·</span>;
  return <span className={`sc-score ${scClass(g, p ?? 4)}`}
    style={sm ? { fontSize: 10, minWidth: 20, minHeight: 20 } : undefined}>{g}</span>;
}

/* ═══════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════ */
/* ═══ Password Gate (same as CalendarioPage) ═══ */
const CAL_STORAGE_KEY = "cal_unlocked";
const CAL_PASSWORD = "machico";

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const check = () => {
    if (pw === CAL_PASSWORD) {
      try { localStorage.setItem(CAL_STORAGE_KEY, "1"); } catch {}
      onUnlock();
    } else { setError(true); setTimeout(() => setError(false), 1500); }
  };
  return (
    <div className="tourn-pw-gate">
      <div style={{ fontSize: 32 }}>🔒</div>
      <div className="tourn-pw-title">Acesso restrito</div>
      <div className="tourn-pw-sub">Este separador requer password</div>
      <div className="tourn-pw-row">
        <input type="password" value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === "Enter" && check()}
          placeholder="Password…" autoFocus
          className={`tourn-pw-input${error ? " tourn-pw-error" : ""}`} />
        <button onClick={check} className="tourn-pw-btn">Entrar</button>
      </div>
      {error && <div style={{ fontSize: 11, color: "#dc3545", fontWeight: 600 }}>Password incorrecta</div>}
    </div>
  );
}

export default function BJGTAnalysisPage({ playerFed }: { playerFed?: string }) {
  const [unlocked, setUnlocked] = useState(() => {
    try { return localStorage.getItem(CAL_STORAGE_KEY) === "1"; } catch { return false; }
  });

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  return <BJGTContent playerFed={playerFed} />;
}

function BJGTContent({ playerFed }: { playerFed?: string }) {
  const { fed: urlFed } = useParams<{ fed?: string }>();
  const fed = urlFed || playerFed || PLAYER_FED;
  const [data, setData] = useState<PlayerPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"analise" | "rivais">("analise");

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null); setData(null);
    loadPlayerData(fed).then(d => {
      if (!alive) return;
      deepFixMojibake(d); setData(d); setLoading(false);
    }).catch(e => {
      if (!alive) return;
      setError(e.message); setLoading(false);
    });
    return () => { alive = false; };
  }, [fed]);

  /* ── Analysis ── */
  const A = useMemo(() => {
    if (!data) return null;

    // 1) Find VP courses
    const vpCourses = data.DATA.filter(c => matchesCourse(c.course));
    if (!vpCourses.length) return { err: "no_course", courses: data.DATA.map(c => c.course) };

    // 2) All rounds (no year filter!)
    const allR: (RoundData & { crs: string })[] = [];
    for (const c of vpCourses) for (const r of c.rounds) allR.push({ ...r, crs: c.course });
    allR.sort((a, b) => b.dateSort - a.dateSort);

    // 3) Find HOLE_STATS for this course (try each VP course name as key)
    let hs: HoleStatsData | null = null;
    let hsKey = "";
    for (const c of vpCourses) {
      // HOLE_STATS is keyed by course name → tee key
      const courseStats = data.HOLE_STATS?.[c.course];
      if (courseStats) {
        // Pick first tee with data
        const firstTee = Object.values(courseStats)[0];
        if (firstTee) { hs = firstTee; hsKey = c.course; break; }
      }
      // Try normalized key too
      const nk = norm(c.course);
      for (const [k, v] of Object.entries(data.HOLE_STATS || {})) {
        if (norm(k) === nk || norm(k).includes("villa padierna") || norm(k).includes("flamingos")) {
          const firstTee = Object.values(v)[0];
          if (firstTee) { hs = firstTee; hsKey = k; break; }
        }
      }
      if (hs) break;
    }

    // 4) Scorecards from HOLES
    const cards: { r: typeof allR[0]; h: HoleScores }[] = [];
    for (const r of allR) {
      const h = data.HOLES?.[r.scoreId];
      if (h?.g && h.g.length >= 9) cards.push({ r, h });
    }

    // 5) Eclectic from EC
    let ecl: EclecticEntry | null = null;
    for (const c of vpCourses) {
      const courseEc = data.EC?.[c.course];
      if (courseEc?.length) { ecl = courseEc[0]; break; }
      // Try by normalized key
      for (const [k, v] of Object.entries(data.EC || {})) {
        if (norm(k).includes("villa padierna") || norm(k).includes("flamingos")) {
          if (v?.length) { ecl = v[0]; break; }
        }
      }
      if (ecl) break;
    }

    // 6) If no HOLE_STATS, compute from scorecards
    let computed: HoleStatsData | null = null;
    if (!hs && cards.length > 0) {
      const nH = cards[0].h.g.length >= 18 ? 18 : 9;
      const c18 = cards.filter(c => c.h.g.length >= nH);
      if (c18.length > 0) {
        const p0 = c18[0].h;
        const holes: HoleStatEntry[] = Array.from({ length: nH }, (_, i) => {
          const par = p0.p[i] ?? 4;
          const si = p0.si?.[i] ?? (i + 1);
          const sc: number[] = [];
          for (const c of c18) { const s = c.h.g[i]; if (s != null && s > 0) sc.push(s); }
          const n = sc.length;
          const avg = n > 0 ? sc.reduce((a, b) => a + b, 0) / n : undefined;
          const best = n > 0 ? Math.min(...sc) : undefined;
          const worst = n > 0 ? Math.max(...sc) : undefined;
          const strokesLost = avg != null ? Math.max(0, avg - par) : 0;
          const dist = {
            eagle: sc.filter(s => s <= par - 2).length, birdie: sc.filter(s => s === par - 1).length,
            par: sc.filter(s => s === par).length, bogey: sc.filter(s => s === par + 1).length,
            double: sc.filter(s => s === par + 2).length, triple: sc.filter(s => s >= par + 3).length,
          };
          return { h: i + 1, par, si, n, avg, best, worst, strokesLost, dist };
        });
        const totalDist = holes.reduce((a, h) => {
          const d = h.dist!;
          a.eagle += d.eagle; a.birdie += d.birdie; a.par += d.par;
          a.bogey += d.bogey; a.double += d.double; a.triple += d.triple;
          a.total += Object.values(d).reduce((s, v) => s + v, 0);
          return a;
        }, { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, total: 0 });
        const totalPar = holes.reduce((s, h) => s + (h.par ?? 0), 0);
        const totalSL = holes.reduce((s, h) => s + (h.strokesLost ?? 0), 0);
        const grosses = c18.map(c => c.h.g.slice(0, nH).reduce((s: number, v) => s + (v ?? 0), 0)).filter(g => g > 0);
        const avgGross = grosses.length > 0 ? grosses.reduce((a, b) => a + b, 0) / grosses.length : null;
        const bestRound = grosses.length > 0 ? { gross: Math.min(...grosses), date: "" } : null;

        // byParType
        const byParType: HoleStatsData["byParType"] = {};
        for (const pt of [3, 4, 5]) {
          const pH = holes.filter(h => h.par === pt);
          if (!pH.length) continue;
          const wA = pH.filter(h => h.avg != null);
          const avgVP = wA.length ? wA.reduce((s, h) => s + (h.avg! - h.par!), 0) / wA.length : null;
          const slR = wA.reduce((s, h) => s + (h.strokesLost ?? 0), 0);
          const tot = wA.reduce((s, h) => s + Object.values(h.dist!).reduce((a, b) => a + b, 0), 0);
          const pob = wA.reduce((s, h) => s + (h.dist!.eagle + h.dist!.birdie + h.dist!.par), 0);
          const dblW = wA.reduce((s, h) => s + (h.dist!.double + h.dist!.triple), 0);
          const dist = wA.reduce((a, h) => {
            const d = h.dist!; a.eagle += d.eagle; a.birdie += d.birdie; a.par += d.par;
            a.bogey += d.bogey; a.double += d.double; a.triple += d.triple; return a;
          }, { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0 });
          byParType[String(pt)] = {
            par: pt, holes: pH, totalN: tot, avg: null,
            avgVsPar: avgVP, strokesLostPerRound: slR, nHoles: pH.length,
            parOrBetterPct: tot > 0 ? pob / tot * 100 : 0,
            doubleOrWorsePct: tot > 0 ? dblW / tot * 100 : 0,
            dist,
          };
        }

        const f9h = holes.slice(0, 9);
        const b9h = nH >= 18 ? holes.slice(9, 18) : [];
        const f9sl = f9h.reduce((s, h) => s + (h.strokesLost ?? 0), 0);
        const b9sl = b9h.reduce((s, h) => s + (h.strokesLost ?? 0), 0);
        const f9p = f9h.reduce((s, h) => s + (h.par ?? 0), 0);
        const b9p = b9h.reduce((s, h) => s + (h.par ?? 0), 0);
        const f9dbl = f9h.reduce((s, h) => s + (h.dist?.double ?? 0) + (h.dist?.triple ?? 0), 0);
        const b9dbl = b9h.reduce((s, h) => s + (h.dist?.double ?? 0) + (h.dist?.triple ?? 0), 0);
        const f9tot = f9h.reduce((s, h) => s + Object.values(h.dist!).reduce((a, b) => a + b, 0), 0);
        const b9tot = b9h.reduce((s, h) => s + Object.values(h.dist!).reduce((a, b) => a + b, 0), 0);

        computed = {
          teeName: cards[0].r.tee || "", teeKey: "", holeCount: nH, nRounds: c18.length,
          holes, totalDist, totalPar, totalStrokesLost: totalSL, byParType,
          f9b9: nH >= 18 ? {
            f9: { strokesLost: f9sl, par: f9p, dblPct: f9tot > 0 ? f9dbl / f9tot * 100 : 0 },
            b9: { strokesLost: b9sl, par: b9p, dblPct: b9tot > 0 ? b9dbl / b9tot * 100 : 0 },
          } : null,
          bestRound, worstRound: null, avgGross, trend: null,
        };
      }
    }

    const stats = hs || computed;
    if (!stats) return { err: "no_stats", courses: vpCourses.map(c => c.course), nRounds: allR.length, nCards: cards.length, hsKeys: Object.keys(data.HOLE_STATS || {}) };

    // 7) ALL 18-hole rounds with details
    type FullRound = { sd: number; ds: number; gross: number; par: number; course: string; meters: number | null; date: string; scoreId: string };
    const allTR: FullRound[] = [];
    for (const c of data.DATA) for (const r of c.rounds) {
      if (r.holeCount === 18 && r.gross != null && Number(r.gross) > 50 && r.sd != null)
        allTR.push({ sd: Number(r.sd), ds: r.dateSort, gross: Number(r.gross), par: r.par ? Number(r.par) : 72, course: c.course, meters: r.meters != null ? Number(r.meters) : null, date: r.date || "", scoreId: r.scoreId });
    }
    allTR.sort((a, b) => b.ds - a.ds);
    const hcp = data.HCP_INFO?.current != null ? Number(data.HCP_INFO.current) : null;
    const avgOf = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    // 8) VP HOLE PROFILE — par, meters, SI for each VP hole
    const nH = cards.length > 0 && cards[0].h.g.length >= 18 ? 18 : 9;
    const vpCards = cards.filter(c => c.h.g.length >= nH).slice(0, 5);
    const parArr = vpCards.length > 0 ? vpCards[0].h.p.slice(0, nH) : [];
    const siArr = vpCards.length > 0 ? vpCards[0].h.si?.slice(0, nH) ?? [] : [];
    const vpMeters = vpCards.length > 0 ? (vpCards[0].h.m?.slice(0, nH) ?? []) : [];

    // 9) CROSS-COURSE ANALYSIS: every hole from every recent scorecard
    type HoleSample = { par: number; meters: number | null; gross: number; ds: number; course: string };
    const allHoleSamples: HoleSample[] = [];
    // Collect from ALL scorecards (not just VP)
    for (const c of data.DATA) {
      for (const r of c.rounds) {
        if (r.holeCount !== 18) continue;
        const h = data.HOLES?.[r.scoreId];
        if (!h?.g || h.g.length < 18) continue;
        for (let i = 0; i < 18; i++) {
          const g = h.g[i], p = h.p[i], m = h.m?.[i] ?? null;
          if (g != null && g > 0 && p != null && p >= 3 && p <= 5) {
            allHoleSamples.push({ par: p, meters: m != null ? Number(m) : null, gross: g, ds: r.dateSort, course: c.course });
          }
        }
      }
    }

    // Group by par + distance band
    type DistBand = { key: string; label: string; par: number; minM: number; maxM: number; samples: HoleSample[]; avg: number; pobPct: number; dblPct: number; n: number };
    const bands: DistBand[] = [];
    const bandDefs = [
      { par: 3, minM: 0, maxM: 130, label: "Par 3 curto (<130m)" },
      { par: 3, minM: 130, maxM: 160, label: "Par 3 médio (130–160m)" },
      { par: 3, minM: 160, maxM: 999, label: "Par 3 longo (160m+)" },
      { par: 4, minM: 0, maxM: 300, label: "Par 4 curto (<300m)" },
      { par: 4, minM: 300, maxM: 350, label: "Par 4 médio (300–350m)" },
      { par: 4, minM: 350, maxM: 999, label: "Par 4 longo (350m+)" },
      { par: 5, minM: 0, maxM: 450, label: "Par 5 curto (<450m)" },
      { par: 5, minM: 450, maxM: 999, label: "Par 5 longo (450m+)" },
    ];
    for (const bd of bandDefs) {
      const s = allHoleSamples.filter(h => h.par === bd.par && h.meters != null && h.meters >= bd.minM && h.meters < bd.maxM);
      if (s.length < 3) continue;
      const avg = s.reduce((a, b) => a + b.gross, 0) / s.length;
      const pob = s.filter(h => h.gross <= h.par).length / s.length * 100;
      const dbl = s.filter(h => h.gross >= h.par + 2).length / s.length * 100;
      bands.push({ key: `${bd.par}-${bd.minM}`, label: bd.label, par: bd.par, minM: bd.minM, maxM: bd.maxM, samples: s, avg, pobPct: pob, dblPct: dbl, n: s.length });
    }

    // 10) VP HOLE → CROSS-REFERENCE: for each VP hole, find matching band
    type VPHoleProfile = { h: number; par: number; meters: number | null; si: number | null; eclBest: number | null; vpScores: number[]; vpAvg: number; band: DistBand | null; recentAvg: number | null; improving: boolean | null };
    const vpHoleProfiles: VPHoleProfile[] = [];
    for (let i = 0; i < nH; i++) {
      const par = parArr[i] ?? 4;
      const m = vpMeters[i] != null ? Number(vpMeters[i]) : null;
      const si = siArr[i] != null ? Number(siArr[i]) : null;
      const eclBest = ecl?.holes?.[i]?.best ?? null;
      const vpScores = vpCards.map(c => c.h.g[i]).filter((s): s is number => s != null && s > 0);
      const vpAvg = vpScores.length > 0 ? vpScores.reduce((a, b) => a + b, 0) / vpScores.length : par;
      // Find matching distance band
      let band: DistBand | null = null;
      if (m != null) {
        band = bands.find(b => b.par === par && m >= b.minM && m < b.maxM) ?? null;
      }
      // Recent improvement: compare last 3 months vs older samples in same band
      let recentAvg: number | null = null;
      let improving: boolean | null = null;
      if (band && band.samples.length >= 6) {
        const sorted = [...band.samples].sort((a, b) => b.ds - a.ds);
        const recent = sorted.slice(0, Math.ceil(sorted.length / 2));
        const older = sorted.slice(Math.ceil(sorted.length / 2));
        const rAvg = recent.reduce((a, b) => a + b.gross, 0) / recent.length;
        const oAvg = older.reduce((a, b) => a + b.gross, 0) / older.length;
        recentAvg = rAvg;
        improving = rAvg < oAvg - 0.2;
      }
      vpHoleProfiles.push({ h: i + 1, par, meters: m, si, eclBest, vpScores, vpAvg, band, recentAvg, improving });
    }

    // 11) DISTANCE EVOLUTION: course meters over time + gross
    type DistPoint = { ds: number; date: string; meters: number; gross: number; course: string };
    const distEvolution: DistPoint[] = allTR
      .filter(r => r.meters != null && r.meters > 3000)
      .map(r => ({ ds: r.ds, date: r.date, meters: r.meters!, gross: r.gross, course: r.course }))
      .sort((a, b) => a.ds - b.ds);
    // Average meters first half vs second half
    let metersGrowing: boolean | null = null;
    let metersDiff: number | null = null;
    if (distEvolution.length >= 6) {
      const half = Math.ceil(distEvolution.length / 2);
      const firstHalf = distEvolution.slice(0, half);
      const secondHalf = distEvolution.slice(half);
      const avgFirst = firstHalf.reduce((a, b) => a + b.meters, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a, b) => a + b.meters, 0) / secondHalf.length;
      metersDiff = avgSecond - avgFirst;
      metersGrowing = metersDiff > 50;
    }
    // Average gross for short vs long courses
    const medianMeters = distEvolution.length > 0 ? [...distEvolution].sort((a, b) => a.meters - b.meters)[Math.floor(distEvolution.length / 2)].meters : 0;
    const shortCourses = distEvolution.filter(r => r.meters < medianMeters);
    const longCourses = distEvolution.filter(r => r.meters >= medianMeters);
    const avgGrossShort = shortCourses.length > 0 ? shortCourses.reduce((a, b) => a + b.gross, 0) / shortCourses.length : null;
    const avgGrossLong = longCourses.length > 0 ? longCourses.reduce((a, b) => a + b.gross, 0) / longCourses.length : null;

    // 12) VP DAY-BY-DAY & PATTERNS (keep existing)
    type HolePattern = { h: number; par: number; scores: number[]; avg: number; best: number; worst: number; variance: number; dblCount: number; parOrBetter: number; isTrap: boolean; isStrength: boolean };
    const holePatterns: HolePattern[] = [];
    for (let i = 0; i < nH; i++) {
      const par = parArr[i] ?? 4;
      const scores = vpCards.map(c => c.h.g[i]).filter((s): s is number => s != null && s > 0);
      if (scores.length === 0) continue;
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const best = Math.min(...scores);
      const worst = Math.max(...scores);
      const variance = scores.length >= 2 ? Math.sqrt(scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length) : 0;
      const dblCount = scores.filter(s => s >= par + 2).length;
      const parOrBetter = scores.filter(s => s <= par).length;
      const isTrap = dblCount >= 2 || (scores.length >= 2 && avg >= par + 1.5);
      const isStrength = parOrBetter >= Math.ceil(scores.length * 0.5) && avg <= par + 0.5;
      holePatterns.push({ h: i + 1, par, scores, avg, best, worst, variance, dblCount, parOrBetter, isTrap, isStrength });
    }
    const trapHoles = holePatterns.filter(h => h.isTrap).sort((a, b) => (b.avg - b.par) - (a.avg - a.par));
    const strongHoles = holePatterns.filter(h => h.isStrength).sort((a, b) => (a.avg - a.par) - (b.avg - b.par));
    const volatileHoles = holePatterns.filter(h => h.variance >= 1.2 && !h.isTrap).sort((a, b) => b.variance - a.variance);

    type DaySummary = { idx: number; date: string; gross: number; f9: number; b9: number; doubles: number; pars: number; birdies: number };
    const daySummaries: DaySummary[] = vpCards.map((c, idx) => {
      const g = c.h.g.slice(0, nH);
      const p = c.h.p.slice(0, nH);
      const gross = g.reduce((a: number, b) => a + (b ?? 0), 0);
      const f9 = g.slice(0, 9).reduce((a: number, b) => a + (b ?? 0), 0);
      const b9 = nH >= 18 ? g.slice(9, 18).reduce((a: number, b) => a + (b ?? 0), 0) : 0;
      let doubles = 0, pars = 0, birdies = 0;
      for (let i = 0; i < nH; i++) {
        const s = g[i], par = p[i] ?? 4;
        if (s != null && s > 0) { if (s >= par + 2) doubles++; if (s <= par) pars++; if (s < par) birdies++; }
      }
      return { idx: idx + 1, date: c.r.date?.substring(0, 5) || "", gross, f9, b9, doubles, pars, birdies };
    });
    const bestDay = daySummaries.length > 0 ? daySummaries.reduce((a, b) => a.gross < b.gross ? a : b) : null;
    const worstDay = daySummaries.length > 0 ? daySummaries.reduce((a, b) => a.gross > b.gross ? a : b) : null;
    const f9avg = avgOf(daySummaries.map(d => d.f9));
    const b9avg = avgOf(daySummaries.map(d => d.b9));
    const f9par = parArr.slice(0, 9).reduce((a, b) => a + (b ?? 0), 0);
    const b9par = nH >= 18 ? parArr.slice(9, 18).reduce((a, b) => a + (b ?? 0), 0) : 0;

    // Recovery after double
    let goodRecovery = 0, badRecovery = 0, totalRecovery = 0;
    for (const c of vpCards) {
      const g = c.h.g.slice(0, nH); const p = c.h.p.slice(0, nH);
      for (let i = 0; i < nH - 1; i++) {
        const s = g[i], par = p[i] ?? 4, next = g[i + 1], nextPar = p[i + 1] ?? 4;
        if (s != null && s >= par + 2 && next != null && next > 0) { totalRecovery++; if (next <= nextPar + 1) goodRecovery++; else badRecovery++; }
      }
    }
    const recoveryRate = totalRecovery > 0 ? goodRecovery / totalRecovery * 100 : null;

    return { stats, cards, ecl, allR, hcp, holePatterns, trapHoles, strongHoles, volatileHoles, daySummaries, bestDay, worstDay, f9avg, b9avg, f9par, b9par, recoveryRate, goodRecovery, badRecovery, totalRecovery, vpCards, nH, parArr, vpHoleProfiles, bands, distEvolution, metersGrowing, metersDiff, avgGrossShort, avgGrossLong, medianMeters, allHoleSamples };
  }, [data]);

  /* ═══ RENDER ═══ */
  if (loading) return (
    <div className="tourn-page"><div style={{ textAlign: "center", padding: 60 }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🏌️</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#4a5940" }}>A carregar dados…</div>
    </div></div>
  );
  if (error) return (
    <div className="tourn-page"><Header />
      <div className="courseAnalysis" style={{ textAlign: "center", padding: 30 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontWeight: 700, color: "#dc2626" }}>Erro: {error}</div>
      </div>
    </div>
  );
  if (!A || "err" in A) {
    const info = A as any;
    return (
      <div className="tourn-page"><Header />
        <div className="courseAnalysis" style={{ textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>
          <div style={{ fontWeight: 700, color: "#4a5940", marginBottom: 8 }}>
            {info?.err === "no_course" ? "Sem campo Villa Padierna nos dados" : "Sem estatísticas de buracos disponíveis"}
          </div>
          <div className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
            {info?.err === "no_stats" && <>
              <div>Campo encontrado: {info.courses?.join(", ")}</div>
              <div>Rondas: {info.nRounds} · Scorecards: {info.nCards}</div>
              <div>HOLE_STATS keys: {info.hsKeys?.join(", ") || "nenhum"}</div>
            </>}
            {info?.err === "no_course" && <>
              Campos disponíveis: {info.courses?.join(", ") || "nenhum"}
            </>}
          </div>
        </div>
      </div>
    );
  }

  const { stats, cards, ecl, allR, hcp, holePatterns, trapHoles, strongHoles, volatileHoles, daySummaries, bestDay, worstDay, f9avg, b9avg, f9par, b9par, recoveryRate, goodRecovery, badRecovery, totalRecovery, vpCards, nH, parArr, vpHoleProfiles, bands, distEvolution, metersGrowing, metersDiff, avgGrossShort, avgGrossLong, medianMeters, allHoleSamples } = A;
  const S = stats;
  const tp = S.totalPar;
  const pobN = S.totalDist.eagle + S.totalDist.birdie + S.totalDist.par;
  const dowN = S.totalDist.double + S.totalDist.triple;
  const totN = S.totalDist.total || (pobN + S.totalDist.bogey + dowN);
  const pobP = totN > 0 ? pobN / totN * 100 : 0;
  const dowP = totN > 0 ? dowN / totN * 100 : 0;
  const worstPT = Object.values(S.byParType).length > 1
    ? Object.values(S.byParType).reduce((a, b) => (b.avgVsPar ?? 0) > (a.avgVsPar ?? 0) ? b : a) : null;

  return (
    <div className="tourn-page" style={{ maxWidth: tab === "rivais" ? 1800 : 960 }}>
      <Header />

      {/* ── Tab Bar ── */}
      <div className="tourn-tabs">
        {([["analise", "🏌️ Análise VP"], ["rivais", "🌍 Rivais"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`tourn-tab${tab === k ? " tourn-tab-active" : ""}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ═══ TAB: RIVAIS ═══ */}
      {tab === "rivais" && <RivaisDashboard />}

      {/* ═══ TAB: ANÁLISE VP ═══ */}
      {tab === "analise" && <>

      {/* ── Objectivo: O Eclético ── */}
      {ecl && (
        <div className="courseAnalysis" style={{ borderColor: "#16a34a", borderWidth: 2, background: "#f0fdf4" }}>
          <div className="caTitle" style={{ color: "#166534", fontSize: 14 }}>🎯 Objectivo: bater o eclético</div>
          <div className="caConcText" style={{ color: "#14532d", marginBottom: 10 }}>
            O ano passado fizeste <b>{daySummaries.map(d => d.gross).join(", ")}</b>. O eclético — o melhor que fizeste em cada buraco, espalhado nos {vpCards.length} dias — é <b>{ecl.totalGross}</b> ({fmtTP(ecl.toPar ?? ecl.totalGross - tp)}).
            Com mais um ano de força, maturidade e experiência, o objectivo é juntar tudo isso e aproximar-te desse número.
          </div>
          <div style={{
            padding: "12px 16px", borderRadius: 10,
            background: "linear-gradient(135deg, #1a2e1a, #2d4a2e)", color: "#fff",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Objectivo por ronda
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 900 }}>{ecl.totalGross}–{bestDay ? bestDay.gross : Math.round((ecl.totalGross + tp + 15) / 2)}</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>({fmtTP(ecl.toPar ?? ecl.totalGross - tp)} a {fmtTP(bestDay ? bestDay.gross - tp : 15)})</span>
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>
              Eclético → Melhor dia 2025{hcp != null ? ` · HCP actual: ${hcp.toFixed(1)}` : ""}
            </div>
          </div>
        </div>
      )}

      {/* ── O Field 2025 ── */}
      <div className="holeAnalysis">
        <div className="haTitle">🏆 O Field 2025 — Quem Jogou e Como</div>
        <div className="haDiag" style={{ marginBottom: 10 }}>
          <div className="haDiagCard">
            <div className="haDiagIcon" style={{ background: "#d9770620", color: "#d97706" }}>🥇</div>
            <div className="haDiagBody">
              <div className="haDiagVal" style={{ color: "#d97706" }}>{FIELD_2025.winner.total}</div>
              <div className="haDiagLbl">{FIELD_2025.winner.name} ({fmtTP(FIELD_2025.winner.result)})</div>
            </div>
          </div>
          <div className="haDiagCard">
            <div className="haDiagIcon" style={{ background: "#16a34a20", color: "#16a34a" }}>🏅</div>
            <div className="haDiagBody">
              <div className="haDiagVal" style={{ color: "#16a34a" }}>{FIELD_2025.top5Avg.toFixed(0)}</div>
              <div className="haDiagLbl">média Top 5 por ronda</div>
            </div>
          </div>
          <div className="haDiagCard">
            <div className="haDiagIcon" style={{ background: "#0369a120", color: "#0369a1" }}>📊</div>
            <div className="haDiagBody">
              <div className="haDiagVal" style={{ color: "#0369a1" }}>{FIELD_2025.fieldAvg.toFixed(0)}</div>
              <div className="haDiagLbl">média field ({FIELD_2025.nPlayers} jogadores)</div>
            </div>
          </div>
        </div>
        {/* Mini leaderboard */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 4, marginBottom: 6 }}>
          {FIELD_2025.leaderboard.slice(0, 5).map(p => (
            <div key={p.pos} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 6, background: p.pos <= 3 ? "#fef3c7" : "#f8fafc", border: "1px solid #e2e8f0" }}>
              <span style={{ fontWeight: 900, fontSize: 13, color: p.pos === 1 ? "#d97706" : "#64748b", minWidth: 16 }}>{p.pos}.</span>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.2 }}>{p.name.split(" ")[0]}</div>
                <div style={{ fontSize: 9, color: "#64748b" }}>{p.rounds.join("-")} = {p.total} ({fmtTP(p.result)})</div>
              </div>
            </div>
          ))}
        </div>
        {/* Context for Manuel */}
        {daySummaries.length > 0 && ecl && (
          <div className="caConclusion" style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
            <div className="caConcTitle" style={{ color: "#1e40af" }}>📍 Onde estava o Manuel?</div>
            <div className="caConcText" style={{ color: "#1e3a5f" }}>
              Fez <b>{daySummaries.map(d => d.gross).join(", ")}</b> (total {daySummaries.reduce((a, d) => a + d.gross, 0)}). 
              O eclético é <b>{ecl.totalGross}</b> — {ecl.totalGross <= FIELD_2025.leaderboard[4]?.total / 3
                ? "um número de Top 5 se o conseguir manter nos 3 dias!"
                : `mais perto do Top 10 (${FIELD_2025.top10Avg.toFixed(0)}/ronda) do que parece.`}
              {" "}Com mais um ano de evolução, o objectivo é claro.
            </div>
          </div>
        )}
      </div>

      {/* ── Dificuldade Real do Campo ── */}
      <div className="holeAnalysis">
        <div className="haTitle">🔥 Dificuldade Real — O que o Field Diz</div>
        <div className="muted" style={{ fontSize: 10, marginBottom: 8 }}>Baseado em {FIELD_2025.nRounds} rondas de {FIELD_2025.nPlayers} jogadores Sub-12. Não é o SI do campo — é onde estes miúdos realmente sofrem.</div>
        
        {/* Difficulty bars */}
        <div style={{ marginBottom: 12 }}>
          {FIELD_2025.holes.map(h => {
            const vsPar = h.fAvg - h.par;
            const maxVs = Math.max(...FIELD_2025.holes.map(x => x.fAvg - x.par));
            const barPct = Math.min(100, (vsPar / maxVs) * 100);
            const rank = FIELD_2025.diffRank.indexOf(h.h) + 1;
            const isHard = rank <= 5;
            const isEasy = rank >= 14;
            // Manuel's avg for this hole
            const manuelH = holePatterns.find(hp => hp.h === h.h);
            const manuelAvg = manuelH?.avg;
            const manuelVsField = manuelAvg != null ? manuelAvg - h.fAvg : null;
            return (
              <div key={h.h} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, fontSize: 10 }}>
                <span style={{ minWidth: 26, fontWeight: 800, color: isHard ? "#dc2626" : isEasy ? "#16a34a" : "#64748b" }}>#{h.h}</span>
                <span className="muted" style={{ minWidth: 24, fontSize: 9 }}>P{h.par}</span>
                <div style={{ flex: 1, height: 14, background: "#f1f5f9", borderRadius: 4, position: "relative", overflow: "hidden" }}>
                  <div style={{
                    width: `${barPct}%`, height: "100%", borderRadius: 4,
                    background: isHard ? "#dc2626" : vsPar > 0.4 ? "#f59e0b" : "#22c55e",
                    opacity: 0.7
                  }} />
                  <span style={{ position: "absolute", right: 4, top: 0, fontSize: 9, fontWeight: 700, lineHeight: "14px" }}>
                    {vsPar > 0 ? `+${vsPar.toFixed(2)}` : vsPar.toFixed(2)}
                  </span>
                </div>
                <span style={{ minWidth: 28, fontSize: 9, fontWeight: 700, color: "#0369a1" }}>T5:{h.t5.toFixed(1)}</span>
                {manuelAvg != null && (
                  <span style={{ minWidth: 32, fontSize: 9, fontWeight: 700, color: manuelVsField! > 0.3 ? "#dc2626" : manuelVsField! < -0.2 ? "#16a34a" : "#64748b" }}>
                    M:{manuelAvg.toFixed(1)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Insights */}
        {(() => {
          const hardest = FIELD_2025.holes.filter((_, i) => FIELD_2025.diffRank.indexOf(FIELD_2025.holes[i].h) < 3);
          const easiest = FIELD_2025.holes.filter((_, i) => FIELD_2025.diffRank.indexOf(FIELD_2025.holes[i].h) >= FIELD_2025.diffRank.length - 3);
          const t5zero = FIELD_2025.holes.filter(h => h.t5Dbl === 0 && h.fDbl > 10);
          return (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div className="caConclusion" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
                <div className="caConcTitle" style={{ color: "#991b1b" }}>🔴 Mais difíceis</div>
                <div className="caConcText" style={{ color: "#7f1d1d", fontSize: 11 }}>
                  {FIELD_2025.diffRank.slice(0, 4).map(h => `#${h}`).join(", ")} — todos sofrem aqui. Joga seguro, par é vitória.
                </div>
              </div>
              <div className="caConclusion" style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
                <div className="caConcTitle" style={{ color: "#166534" }}>🟢 Mais acessíveis</div>
                <div className="caConcText" style={{ color: "#14532d", fontSize: 11 }}>
                  {FIELD_2025.diffRank.slice(-4).map(h => `#${h}`).join(", ")} — aqui o Top 5 ataca. Oportunidade para ir buscar pancadas.
                </div>
              </div>
            </div>
          );
        })()}

        {/* Where top5 makes zero doubles but field struggles */}
        {(() => {
          const t5zero = FIELD_2025.holes.filter(h => h.t5Dbl === 0 && h.fDbl >= 10);
          if (t5zero.length === 0) return null;
          return (
            <div className="caConclusion" style={{ background: "#fef3c7", borderColor: "#fde68a", marginTop: 8 }}>
              <div className="caConcTitle" style={{ color: "#92400e" }}>💡 Onde o Top 5 nunca faz double</div>
              <div className="caConcText" style={{ color: "#78350f", fontSize: 11 }}>
                Nos buracos {t5zero.map(h => `#${h.h}`).join(", ")}, o Top 5 fez <b>0% doubles</b> enquanto o field fez {t5zero.map(h => `${h.fDbl.toFixed(0)}%`).join(", ")}. 
                A diferença não é talento — é decisão. Eles jogam seguro e evitam o erro grande.
              </div>
            </div>
          );
        })()}
      </div>
      {distEvolution.length >= 4 && (
        <div className="holeAnalysis">
          <div className="haTitle">📏 Distância e Evolução</div>
          {metersGrowing && metersDiff != null && (
            <div className="caConclusion" style={{ background: "#eff6ff", borderColor: "#bfdbfe", marginBottom: 10 }}>
              <div className="caConcTitle" style={{ color: "#1e40af" }}>📈 Está a jogar campos mais longos</div>
              <div className="caConcText" style={{ color: "#1e3a5f" }}>
                Distância média das rondas recentes é <b>+{metersDiff.toFixed(0)}m</b> acima das primeiras. Isto é crescimento real — mais força, mais distância.
              </div>
            </div>
          )}
          {avgGrossShort != null && avgGrossLong != null && (
            <div className="haDiag" style={{ marginBottom: 10 }}>
              <div className="haDiagCard">
                <div className="haDiagIcon" style={{ background: "#16a34a20", color: "#16a34a" }}>⛳</div>
                <div className="haDiagBody">
                  <div className="haDiagVal" style={{ color: "#16a34a" }}>{avgGrossShort.toFixed(0)}</div>
                  <div className="haDiagLbl">gross médio campos curtos (&lt;{medianMeters}m)</div>
                </div>
              </div>
              <div className="haDiagCard">
                <div className="haDiagIcon" style={{ background: "#dc262620", color: "#dc2626" }}>🏌️</div>
                <div className="haDiagBody">
                  <div className="haDiagVal" style={{ color: "#dc2626" }}>{avgGrossLong.toFixed(0)}</div>
                  <div className="haDiagLbl">gross médio campos longos (≥{medianMeters}m)</div>
                </div>
              </div>
              <div className="haDiagCard">
                <div className="haDiagIcon" style={{ background: "#d9770620", color: "#d97706" }}>📊</div>
                <div className="haDiagBody">
                  <div className="haDiagVal" style={{ color: "#d97706" }}>{Math.abs(avgGrossLong - avgGrossShort).toFixed(0)}</div>
                  <div className="haDiagLbl">pancadas extra em campos longos</div>
                </div>
              </div>
            </div>
          )}
          {/* Mini distance/gross scatter */}
          <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, marginBottom: 4 }}>RONDAS POR DISTÂNCIA</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {distEvolution.slice(-20).map((r, i) => {
              const vpCourse = r.course.toLowerCase().includes("villa") || r.course.toLowerCase().includes("flamingos");
              return (
                <div key={i} title={`${r.date} ${r.course} ${r.meters}m → ${r.gross}`}
                  style={{ width: 28, height: 28, borderRadius: vpCourse ? 999 : 4, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, border: vpCourse ? "2px solid #dc2626" : "1px solid #d5dac9",
                    background: r.gross <= 82 ? "#dcfce7" : r.gross <= 88 ? "#fef3c7" : "#fef2f2",
                    color: r.gross <= 82 ? "#166534" : r.gross <= 88 ? "#92400e" : "#991b1b" }}>
                  {r.gross}
                </div>
              );
            })}
          </div>
          <div className="muted" style={{ fontSize: 9, marginTop: 4 }}>Cada quadrado = 1 ronda · 🔴 = VP Flamingos · Hover para detalhes</div>
        </div>
      )}

      {/* ── Perfil por Distância: Como se sai em buracos assim? ── */}
      {bands.length > 0 && (
        <div className="holeAnalysis">
          <div className="haTitle">🔬 Perfil por Distância — Como te sais em buracos assim?</div>
          <div className="muted" style={{ fontSize: 10, marginBottom: 8 }}>Dados de {allHoleSamples.length} buracos jogados em todos os campos recentes, agrupados por tipo e distância.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            {bands.map(b => {
              // Find VP holes in this band
              const vpInBand = vpHoleProfiles.filter(h => h.band?.key === b.key);
              const avgCol = (b.avg - b.par) <= 0.3 ? "#16a34a" : (b.avg - b.par) <= 0.8 ? "#d97706" : "#dc2626";
              return (
                <div key={b.key} style={{ border: "1px solid #d5dac9", borderRadius: 10, padding: "10px 12px", background: "#fff" }}>
                  <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 4 }}>{b.label}</div>
                  <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: avgCol }}>{b.avg.toFixed(1)}</div>
                      <div className="muted" style={{ fontSize: 9 }}>média ({b.n} buracos)</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#16a34a" }}>{b.pobPct.toFixed(0)}%</div>
                      <div className="muted" style={{ fontSize: 9 }}>par ou melhor</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#dc2626" }}>{b.dblPct.toFixed(0)}%</div>
                      <div className="muted" style={{ fontSize: 9 }}>double+</div>
                    </div>
                  </div>
                  {vpInBand.length > 0 && (
                    <div style={{ fontSize: 10, color: "#0369a1", fontWeight: 600, borderTop: "1px solid #e2e8f0", paddingTop: 4 }}>
                      VP buracos nesta faixa: {vpInBand.map(h => `#${h.h}`).join(", ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── VP Buraco a Buraco: eclético + scores + cross-ref ── */}
      {vpHoleProfiles.length > 0 && (
        <div className="holeAnalysis">
          <div className="haTitle">🗺️ VP Flamingos — Manuel vs Field vs Top 5</div>
          <div className="muted" style={{ fontSize: 10, marginBottom: 8 }}>Cada buraco: os 3 dias do Manuel, o eclético, e como se compara com o field e os 5 melhores de 2025.</div>
          <div className="tourn-scroll">
          <table className="sc-table-modern" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th className="row-label">BUR.</th>
                <th>Par</th>
                {vpCards.map((_, i) => <th key={i}>D{i + 1}</th>)}
                <th style={{ background: "#dcfce7" }}>ECL</th>
                <th style={{ background: "#eff6ff" }}>μ M</th>
                <th style={{ background: "#fef3c7" }}>μ T5</th>
                <th style={{ background: "#f1f5f9" }}>μ Field</th>
                <th>Diff</th>
              </tr>
            </thead>
            <tbody>
              {vpHoleProfiles.map(h => {
                const fh = FIELD_2025.holes.find(x => x.h === h.h);
                const fieldAvg = fh?.fAvg ?? 0;
                const t5Avg = fh?.t5 ?? 0;
                const diff = h.vpAvg - fieldAvg;
                const diffCol = diff > 0.5 ? "#dc2626" : diff > 0.2 ? "#d97706" : diff < -0.2 ? "#16a34a" : "#64748b";
                return (
                  <tr key={h.h}>
                    <td className="row-label">{h.h}</td>
                    <td className="par-label">{h.par}</td>
                    {h.vpScores.map((s, i) => <td key={i}><ScoreCircle g={s} p={h.par} sm /></td>)}
                    {h.vpScores.length < vpCards.length && Array.from({ length: vpCards.length - h.vpScores.length }).map((_, i) => <td key={`e${i}`}>–</td>)}
                    <td style={{ background: "#dcfce7", fontWeight: 800 }}><ScoreCircle g={h.eclBest} p={h.par} sm /></td>
                    <td style={{ background: "#eff6ff", fontWeight: 700, fontSize: 10, color: (h.vpAvg - h.par) <= 0.3 ? "#16a34a" : (h.vpAvg - h.par) <= 1 ? "#d97706" : "#dc2626" }}>
                      {h.vpAvg.toFixed(1)}
                    </td>
                    <td style={{ background: "#fef3c7", fontSize: 10, fontWeight: 600, color: "#92400e" }}>
                      {t5Avg.toFixed(1)}
                    </td>
                    <td style={{ background: "#f1f5f9", fontSize: 10, color: "#64748b" }}>
                      {fieldAvg.toFixed(1)}
                    </td>
                    <td style={{ fontSize: 10, fontWeight: 800, color: diffCol }}>
                      {diff > 0 ? `+${diff.toFixed(1)}` : diff < 0 ? diff.toFixed(1) : "="}
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr style={{ borderTop: "2px solid #1c2617", fontWeight: 900 }}>
                <td className="row-label" colSpan={2}>TOTAL</td>
                {vpCards.map((_, i) => <td key={i} style={{ fontSize: 10 }}>{daySummaries[i]?.gross ?? "–"}</td>)}
                <td style={{ background: "#dcfce7" }}>{ecl?.totalGross ?? "–"}</td>
                <td style={{ background: "#eff6ff", fontSize: 10 }}>{daySummaries.length > 0 ? (daySummaries.reduce((a, d) => a + d.gross, 0) / daySummaries.length).toFixed(0) : "–"}</td>
                <td style={{ background: "#fef3c7", fontSize: 10 }}>{FIELD_2025.top5Avg.toFixed(0)}</td>
                <td style={{ background: "#f1f5f9", fontSize: 10 }}>{FIELD_2025.fieldAvg.toFixed(0)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
          </div>
          <div className="muted" style={{ fontSize: 9, marginTop: 4 }}>μ M = média Manuel · μ T5 = média Top 5 (2025) · μ Field = média {FIELD_2025.nPlayers} jogadores · Diff = Manuel vs Field</div>
          
          {/* Key takeaway: where Manuel loses most vs field */}
          {(() => {
            const diffs = vpHoleProfiles.map(h => {
              const fh = FIELD_2025.holes.find(x => x.h === h.h);
              return { h: h.h, diff: fh ? h.vpAvg - fh.fAvg : 0 };
            }).sort((a, b) => b.diff - a.diff);
            const losing = diffs.filter(d => d.diff > 0.3).slice(0, 4);
            const gaining = diffs.filter(d => d.diff < -0.2).slice(-3);
            if (losing.length === 0) return null;
            return (
              <div className="caConclusion" style={{ background: "#fef2f2", borderColor: "#fecaca", marginTop: 8 }}>
                <div className="caConcTitle" style={{ color: "#991b1b" }}>📉 Onde o Manuel perde mais vs o field</div>
                <div className="caConcText" style={{ color: "#7f1d1d" }}>
                  Buracos {losing.map(d => `#${d.h} (+${d.diff.toFixed(1)})`).join(", ")} — aqui perdes {losing.reduce((a, d) => a + d.diff, 0).toFixed(1)} pancadas por ronda vs a média.
                  {gaining.length > 0 && <> Mas nos buracos {gaining.map(d => `#${d.h}`).join(", ")} estás <b>melhor</b> que o field!</>}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Como foi o ano passado ── */}
      <div className="holeAnalysis">
        <div className="haTitle">📋 Como foi em {TOURN.dates.split("–")[0].trim()} 2025</div>

        {/* Day summary cards */}
        {daySummaries.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(daySummaries.length, 3)}, 1fr)`, gap: 8, marginBottom: 12 }}>
            {daySummaries.map(d => {
              const isBest = bestDay && d.idx === bestDay.idx;
              const isWorst = worstDay && d.idx === worstDay.idx && daySummaries.length > 1;
              const border = isBest ? "#16a34a" : isWorst ? "#dc2626" : "#d5dac9";
              const bg = isBest ? "#f0fdf4" : isWorst ? "#fef2f2" : "#fff";
              return (
                <div key={d.idx} style={{ border: `2px solid ${border}`, borderRadius: 10, padding: "10px 12px", background: bg }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <span style={{ fontWeight: 900, fontSize: 13 }}>Dia {d.idx}</span>
                    <span className="muted" style={{ fontSize: 10 }}>{d.date}</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: isBest ? "#16a34a" : isWorst ? "#dc2626" : "#1c2617" }}>{d.gross}</div>
                  <div className="muted" style={{ fontSize: 10, marginBottom: 6 }}>{fmtTP(d.gross - tp)}</div>
                  <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
                    <span>F9: <b>{d.f9}</b></span>
                    {nH >= 18 && <span>B9: <b>{d.b9}</b></span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, fontSize: 10, marginTop: 4, color: "#64748b" }}>
                    <span style={{ color: "#16a34a" }}>⛳{d.pars}</span>
                    <span style={{ color: "#dc2626" }}>💣{d.doubles}</span>
                    {d.birdies > 0 && <span style={{ color: "#d97706" }}>🐦{d.birdies}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Key insight: what made the best day better? */}
        {bestDay && worstDay && bestDay.idx !== worstDay.idx && (
          <div className="caConclusion" style={{ background: "#f0fdf4", borderColor: "#bbf7d0", marginBottom: 8 }}>
            <div className="caConcTitle" style={{ color: "#166534" }}>💡 O que fez a diferença no Dia {bestDay.idx}?</div>
            <div className="caConcText" style={{ color: "#14532d" }}>
              {bestDay.doubles < worstDay.doubles && <>Menos {worstDay.doubles - bestDay.doubles} double{worstDay.doubles - bestDay.doubles > 1 ? "s" : ""}. </>}
              {bestDay.pars > worstDay.pars && <>Mais {bestDay.pars - worstDay.pars} par{bestDay.pars - worstDay.pars > 1 ? "es" : ""} ou melhor. </>}
              {nH >= 18 && bestDay.b9 < worstDay.b9 - 2 && <>Back 9 mais controlado ({bestDay.b9} vs {worstDay.b9}). </>}
              A diferença entre um bom dia e um mau dia neste campo são os doubles — não as grandes jogadas.
            </div>
          </div>
        )}

        {/* F9 vs B9 */}
        {nH >= 18 && f9avg != null && b9avg != null && (
          <div className="haDiag" style={{ marginBottom: 8 }}>
            <div className="haDiagCard">
              <div className="haDiagIcon" style={{ background: "#0369a120", color: "#0369a1" }}>1️⃣</div>
              <div className="haDiagBody">
                <div className="haDiagVal" style={{ color: "#0369a1" }}>{f9avg.toFixed(0)}</div>
                <div className="haDiagLbl">média Front 9 ({fmtTP(Math.round(f9avg - f9par))})</div>
              </div>
            </div>
            <div className="haDiagCard">
              <div className="haDiagIcon" style={{ background: Math.round(b9avg) > Math.round(f9avg) + 2 ? "#dc262620" : "#16a34a20", color: Math.round(b9avg) > Math.round(f9avg) + 2 ? "#dc2626" : "#16a34a" }}>🔟</div>
              <div className="haDiagBody">
                <div className="haDiagVal" style={{ color: Math.round(b9avg) > Math.round(f9avg) + 2 ? "#dc2626" : "#1c2617" }}>{b9avg.toFixed(0)}</div>
                <div className="haDiagLbl">média Back 9 ({fmtTP(Math.round(b9avg - b9par))})</div>
              </div>
            </div>
            {Math.abs(f9avg - b9avg) > 2 && (
              <div className="haDiagCard">
                <div className="haDiagIcon" style={{ background: "#d9770620", color: "#d97706" }}>⚡</div>
                <div className="haDiagBody">
                  <div className="haDiagVal" style={{ color: "#d97706" }}>{Math.abs(f9avg - b9avg).toFixed(0)}</div>
                  <div className="haDiagLbl">{f9avg > b9avg ? "Front 9 custa mais — atenção à partida" : "Back 9 custa mais — gerir energia"}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recovery after double */}
        {totalRecovery >= 2 && recoveryRate != null && (
          <div className="caConclusion" style={{
            background: recoveryRate >= 60 ? "#f0fdf4" : recoveryRate >= 40 ? "#fef3c7" : "#fef2f2",
            borderColor: recoveryRate >= 60 ? "#bbf7d0" : recoveryRate >= 40 ? "#fde68a" : "#fecaca"
          }}>
            <div className="caConcTitle" style={{ color: recoveryRate >= 60 ? "#166534" : recoveryRate >= 40 ? "#92400e" : "#991b1b" }}>
              {recoveryRate >= 60 ? "💪" : "⚠️"} Recuperação após double
            </div>
            <div className="caConcText" style={{ color: recoveryRate >= 60 ? "#14532d" : recoveryRate >= 40 ? "#78350f" : "#7f1d1d" }}>
              Após um double, fizeste bogey ou melhor {goodRecovery} de {totalRecovery} vezes ({recoveryRate.toFixed(0)}%).
              {recoveryRate < 50 && <> Tendência para encadear buracos maus — pratica a rotina de reset: respira, esquece, joga o próximo buraco.</>}
              {recoveryRate >= 60 && <> Boa mentalidade — consegues isolar os maus buracos. Mantém essa força.</>}
            </div>
          </div>
        )}
      </div>

      {/* ── Buracos-chave: onde estudar na volta de treino ── */}
      <div className="holeAnalysis">
        <div className="haTitle">🔍 Mapa do Campo — Onde Estudar</div>

        {/* Trap holes */}
        {trapHoles.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="haSubTitle" style={{ color: "#dc2626" }}>🚨 Buracos Armadilha ({trapHoles.length})</div>
            <div className="muted" style={{ fontSize: 10, marginBottom: 6 }}>Fizeste double+ em 2 ou mais dias. Na volta de treino, estuda ESTES buracos com atenção.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 6 }}>
              {trapHoles.map(h => (
                <div key={h.h} style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 900, fontSize: 15 }}>#{h.h}</span>
                    <span className="muted" style={{ fontSize: 10 }}>Par {h.par}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, margin: "4px 0" }}>
                    {h.scores.map((s, i) => <ScoreCircle key={i} g={s} p={h.par} sm />)}
                  </div>
                  <div style={{ fontSize: 10, color: "#991b1b", fontWeight: 600 }}>
                    μ {h.avg.toFixed(1)} · {h.dblCount}× double+
                    {(() => { const fh = FIELD_2025.holes.find(x => x.h === h.h); return fh ? <span className="muted"> · field {fh.fAvg.toFixed(1)}</span> : null; })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Strong holes */}
        {strongHoles.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="haSubTitle" style={{ color: "#16a34a" }}>💪 Buracos Fortes ({strongHoles.length})</div>
            <div className="muted" style={{ fontSize: 10, marginBottom: 6 }}>Fizeste par ou melhor em metade dos dias ou mais. Aqui podes atacar.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 6 }}>
              {strongHoles.map(h => (
                <div key={h.h} style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 900, fontSize: 15 }}>#{h.h}</span>
                    <span className="muted" style={{ fontSize: 10 }}>Par {h.par}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, margin: "4px 0" }}>
                    {h.scores.map((s, i) => <ScoreCircle key={i} g={s} p={h.par} sm />)}
                  </div>
                  <div style={{ fontSize: 10, color: "#166534", fontWeight: 600 }}>
                    μ {h.avg.toFixed(1)} · {h.parOrBetter}× par ou melhor
                    {(() => { const fh = FIELD_2025.holes.find(x => x.h === h.h); return fh ? <span className="muted"> · T5 {fh.t5.toFixed(1)}</span> : null; })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Volatile holes */}
        {volatileHoles.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div className="haSubTitle" style={{ color: "#d97706" }}>🎲 Buracos Imprevisíveis ({volatileHoles.length})</div>
            <div className="muted" style={{ fontSize: 10, marginBottom: 6 }}>Grande oscilação entre dias. Precisa de um plano claro — escolhe a jogada segura.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 6 }}>
              {volatileHoles.slice(0, 4).map(h => (
                <div key={h.h} style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 900, fontSize: 15 }}>#{h.h}</span>
                    <span className="muted" style={{ fontSize: 10 }}>Par {h.par}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, margin: "4px 0" }}>
                    {h.scores.map((s, i) => <ScoreCircle key={i} g={s} p={h.par} sm />)}
                  </div>
                  <div style={{ fontSize: 10, color: "#92400e", fontWeight: 600 }}>
                    {h.best}–{h.worst} (var. {h.variance.toFixed(1)})
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Volta de Treino ── */}
      <div className="courseAnalysis" style={{ borderColor: "#0369a1", borderWidth: 2, background: "#eff6ff" }}>
        <div className="caTitle" style={{ color: "#1e40af", fontSize: 14 }}>🏌️ Checklist — Volta de Treino</div>
        <div className="caConcText" style={{ color: "#1e3a5f", lineHeight: 1.7 }}>
          {trapHoles.length > 0 && <p style={{ marginBottom: 6 }}>
            <b>1. Estudar buracos armadilha:</b> #{trapHoles.map(h => h.h).join(", #")} — ver onde é o perigo, identificar a jogada segura, testar yardages.
          </p>}
          {volatileHoles.length > 0 && <p style={{ marginBottom: 6 }}>
            <b>2. Definir estratégia para buracos incertos:</b> #{volatileHoles.slice(0, 4).map(h => h.h).join(", #")} — decidir antes de jogar: qual é o plano A?
          </p>}
          <p style={{ marginBottom: 6 }}>
            <b>{trapHoles.length + volatileHoles.length > 0 ? "3" : "1"}. Greens:</b> Ler os greens dos buracos mais difíceis. Os putts contam.
          </p>
          {nH >= 18 && f9avg != null && b9avg != null && Math.round(b9avg) > Math.round(f9avg) + 2 && <p style={{ marginBottom: 6 }}>
            <b>{trapHoles.length + volatileHoles.length > 0 ? "4" : "2"}. Gestão de energia:</b> O Back 9 custou mais ({b9avg!.toFixed(0)} vs {f9avg!.toFixed(0)} no Front). Água, banana, rotina entre holes.
          </p>}
          {strongHoles.length > 0 && <p style={{ marginBottom: 6 }}>
            <b>✅ Confirmar:</b> Buracos #{strongHoles.map(h => h.h).join(", #")} — foram os melhores. Uma passagem rápida para manter a confiança.
          </p>}
          <p style={{ marginBottom: 6 }}>
            <b>💡 Lição do Top 5 (2025):</b> Nos buracos {FIELD_2025.holes.filter(h => h.t5Dbl === 0 && h.fDbl >= 10).map(h => `#${h.h}`).join(", ")}, os 5 melhores fizeram <b>zero doubles</b>. A chave não é atacar — é evitar o erro grande.
          </p>
        </div>
      </div>

      {/* ── KPIs (haDiag style, same as JogadoresPage) ── */}
      <div className="holeAnalysis">
        <div className="haTitle">📊 Análise de Performance <span className="muted" style={{ fontSize: 11 }}>({S.nRounds} rondas · Vermelho par {tp})</span></div>
        <div className="haDiag">
          <div className="haDiagCard">
            <div className="haDiagIcon" style={{ background: "#dc262620", color: "#dc2626" }}>🏌️</div>
            <div className="haDiagBody">
              <div className="haDiagVal" style={{ color: "#1c2617" }}>{S.bestRound ? String(S.bestRound.gross) : "–"}</div>
              <div className="haDiagLbl">melhor gross {S.bestRound ? fmtTP(S.bestRound.gross - tp) : ""}</div>
            </div>
          </div>
          <div className="haDiagCard">
            <div className="haDiagIcon" style={{ background: "#0369a120", color: "#0369a1" }}>📊</div>
            <div className="haDiagBody">
              <div className="haDiagVal" style={{ color: "#0369a1" }}>{S.avgGross != null ? S.avgGross.toFixed(1) : "–"}</div>
              <div className="haDiagLbl">média gross {S.avgGross != null ? fmtTP(Math.round(S.avgGross - tp)) : ""}</div>
            </div>
          </div>
          <div className="haDiagCard">
            <div className="haDiagIcon" style={{ background: (S.totalStrokesLost <= 8 ? "#16a34a" : S.totalStrokesLost <= 14 ? "#d97706" : "#dc2626") + "20", color: S.totalStrokesLost <= 8 ? "#16a34a" : S.totalStrokesLost <= 14 ? "#d97706" : "#dc2626" }}>🎯</div>
            <div className="haDiagBody">
              <div className="haDiagVal" style={{ color: S.totalStrokesLost <= 8 ? "#16a34a" : S.totalStrokesLost <= 14 ? "#d97706" : "#dc2626" }}>+{S.totalStrokesLost.toFixed(1)}</div>
              <div className="haDiagLbl">pancadas perdidas p/ volta vs par</div>
            </div>
          </div>
          <div className="haDiagCard">
            <div className="haDiagIcon" style={{ background: (pobP >= 50 ? "#16a34a" : pobP >= 35 ? "#d97706" : "#dc2626") + "20", color: pobP >= 50 ? "#16a34a" : pobP >= 35 ? "#d97706" : "#dc2626" }}>⛳</div>
            <div className="haDiagBody">
              <div className="haDiagVal" style={{ color: pobP >= 50 ? "#16a34a" : pobP >= 35 ? "#d97706" : "#dc2626" }}>{pobP.toFixed(0)}%</div>
              <div className="haDiagLbl">par ou melhor ({pobN}/{totN} buracos)</div>
            </div>
          </div>
          <div className="haDiagCard">
            <div className="haDiagIcon" style={{ background: (dowP <= 8 ? "#16a34a" : dowP <= 18 ? "#d97706" : "#dc2626") + "20", color: dowP <= 8 ? "#16a34a" : dowP <= 18 ? "#d97706" : "#dc2626" }}>💣</div>
            <div className="haDiagBody">
              <div className="haDiagVal" style={{ color: dowP <= 8 ? "#16a34a" : dowP <= 18 ? "#d97706" : "#dc2626" }}>{dowP.toFixed(0)}%</div>
              <div className="haDiagLbl">double bogey ou pior ({dowN}/{totN})</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Eclético ── */}
      {ecl && ecl.holes.length > 0 && (
        <div className="ecBlock">
          <div className="ecTitle">Eclético (gross) por tee</div>
          <div className="ecHint">Clique num tee na tabela de buracos para ver análise e filtrar rondas.</div>
          {/* Tee header with color */}
          <div style={{ marginTop: 8, border: "2px solid #dc2626", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "6px 10px", background: "#dc262610", fontWeight: 600, fontSize: 12 }}>
              <span className="sc-pill" style={{ background: "#dc2626", color: "#fff", fontSize: 10, padding: "2px 10px" }}>Vermelho</span>{" "}
              <span style={{ color: "#0369a1", fontWeight: 800 }}>{ecl.totalGross}</span>
              <span className="muted" style={{ marginLeft: 6 }}>par {tp}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
            <table className="sc-table-modern" style={{ width: "100%" }}>
              <thead><tr>
                <th className="row-label" style={{ width: 60 }}>BUR.</th>
                {Array.from({ length: 9 }, (_, i) => <th key={i}>{i + 1}</th>)}
                <th className="col-out">OUT</th>
                {ecl.holeCount >= 18 && Array.from({ length: 9 }, (_, i) => <th key={i + 9}>{i + 10}</th>)}
                {ecl.holeCount >= 18 && <th className="col-in">IN</th>}
                <th className="col-total">TOT</th>
              </tr></thead>
              <tbody>
                <tr style={{ background: "#f0fdf4" }}>
                  <td className="row-label" style={{ fontWeight: 700, fontSize: 10, color: "#2e5a10" }}>Par</td>
                  {ecl.holes.slice(0, 9).map((h, i) => <td key={i}>{h.par}</td>)}
                  <td className="col-out" style={{ fontWeight: 700 }}>{ecl.holes.slice(0, 9).reduce((s, h) => s + (h.par ?? 0), 0)}</td>
                  {ecl.holeCount >= 18 && ecl.holes.slice(9, 18).map((h, i) => <td key={i}>{h.par}</td>)}
                  {ecl.holeCount >= 18 && <td className="col-in" style={{ fontWeight: 700 }}>{ecl.holes.slice(9, 18).reduce((s, h) => s + (h.par ?? 0), 0)}</td>}
                  <td className="col-total" style={{ fontWeight: 900 }}>{tp}</td>
                </tr>
                {vpHoleProfiles.length > 0 && vpHoleProfiles.some(h => h.meters != null) && (
                <tr style={{ background: "#f8fafc" }}>
                  <td className="row-label" style={{ fontWeight: 600, fontSize: 9, color: "#64748b" }}>m</td>
                  {Array.from({ length: 9 }, (_, i) => {
                    const m = vpHoleProfiles[i]?.meters;
                    return <td key={i} style={{ fontSize: 9, color: "#94a3b8" }}>{m ?? "–"}</td>;
                  })}
                  <td className="col-out" style={{ fontSize: 9, color: "#94a3b8" }}>{vpHoleProfiles.slice(0, 9).reduce((s, h) => s + (h.meters ?? 0), 0) || "–"}</td>
                  {ecl.holeCount >= 18 && Array.from({ length: 9 }, (_, i) => {
                    const m = vpHoleProfiles[i + 9]?.meters;
                    return <td key={i} style={{ fontSize: 9, color: "#94a3b8" }}>{m ?? "–"}</td>;
                  })}
                  {ecl.holeCount >= 18 && <td className="col-in" style={{ fontSize: 9, color: "#94a3b8" }}>{vpHoleProfiles.slice(9, 18).reduce((s, h) => s + (h.meters ?? 0), 0) || "–"}</td>}
                  <td className="col-total" style={{ fontSize: 9, color: "#94a3b8" }}>{vpHoleProfiles.reduce((s, h) => s + (h.meters ?? 0), 0) || "–"}</td>
                </tr>
                )}
                <tr style={{ borderTop: "2px solid #cbd5e1" }}>
                  <td className="row-label" style={{ color: "#0369a1", fontWeight: 700, fontSize: 10 }}>Eclético</td>
                  {ecl.holes.slice(0, 9).map((h, i) => <td key={i}><ScoreCircle g={h.best} p={h.par} /></td>)}
                  <td className="col-out" style={{ fontWeight: 700 }}>{ecl.holes.slice(0, 9).reduce((s, h) => s + (h.best ?? h.par ?? 0), 0)}</td>
                  {ecl.holeCount >= 18 && ecl.holes.slice(9, 18).map((h, i) => <td key={i}><ScoreCircle g={h.best} p={h.par} /></td>)}
                  {ecl.holeCount >= 18 && <td className="col-in" style={{ fontWeight: 700 }}>{ecl.holes.slice(9, 18).reduce((s, h) => s + (h.best ?? h.par ?? 0), 0)}</td>}
                  <td className="col-total" style={{ fontWeight: 900, fontSize: 13 }}>{ecl.totalGross}</td>
                </tr>
                {/* Individual day rows with tee-colored date pills */}
                {cards.filter(c => c.h.g.length >= (ecl!.holeCount >= 18 ? 18 : 9)).slice(0, 5).map(({ r, h }, idx) => {
                  const nH = ecl!.holeCount >= 18 ? 18 : 9;
                  const out = h.g.slice(0, 9).reduce((a: number, b) => a + (b ?? 0), 0);
                  const inn = nH >= 18 ? h.g.slice(9, 18).reduce((a: number, b) => a + (b ?? 0), 0) : 0;
                  const trDate = r.date ? r.date.substring(0, 5).replace("-", "/") : "";
                  return (
                    <tr key={idx} style={{ background: "#dc26260A" }}>
                      <td className="row-label" style={{ fontSize: 10 }}>
                        <span className="sc-pill" style={{ background: "#dc2626", color: "#fff", fontSize: 9, padding: "1px 6px" }}>{trDate}</span>
                      </td>
                      {h.g.slice(0, 9).map((s, i) => <td key={i}><ScoreCircle g={s} p={ecl!.holes[i]?.par} sm /></td>)}
                      <td className="col-out" style={{ fontWeight: 600, fontSize: 10 }}>{out}</td>
                      {nH >= 18 && h.g.slice(9, 18).map((s, i) => <td key={i}><ScoreCircle g={s} p={ecl!.holes[i + 9]?.par} sm /></td>)}
                      {nH >= 18 && <td className="col-in" style={{ fontWeight: 600, fontSize: 10 }}>{inn}</td>}
                      <td className="col-total" style={{ fontWeight: 700 }}>{out + inn}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Distribuição ── */}
      <div className="holeAnalysis">
        <div className="haTitle">Distribuição de Scores</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[
          { l: "Eagle+", n: S.totalDist.eagle, c: "eagle" }, { l: "Birdie", n: S.totalDist.birdie, c: "birdie" },
          { l: "Par", n: S.totalDist.par, c: "par" }, { l: "Bogey", n: S.totalDist.bogey, c: "bogey" },
          { l: "Double", n: S.totalDist.double, c: "double" }, { l: "Triple+", n: S.totalDist.triple, c: "triple" },
        ].map(x => (
          <div key={x.l} style={{ flex: Math.max(x.n, 1), textAlign: "center" }}>
            <div className={`sc-score ${x.c}`} style={{ width: "100%", borderRadius: 6, padding: "6px 0", fontSize: 16, fontWeight: 900 }}>{x.n}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", marginTop: 3 }}>{x.l}</div>
            <div style={{ fontSize: 9, color: "#cbd5e1" }}>{totN > 0 ? `${(x.n / totN * 100).toFixed(0)}%` : ""}</div>
          </div>
        ))}
      </div>
      </div>

      {/* ── Par types ── */}
      {Object.values(S.byParType).length > 1 && (
        <div className="holeAnalysis">
          <div className="haSubTitle">Desempenho por Tipo de Buraco</div>
          <div className="haParGrid" style={{ marginBottom: 16 }}>
            {[3, 4, 5].map(pt => S.byParType[String(pt)]).filter(Boolean).map(d => {
              const isW = worstPT === d;
              const col = (d.avgVsPar ?? 0) <= 0.1 ? "#16a34a" : (d.avgVsPar ?? 0) <= 0.4 ? "#d97706" : "#dc2626";
              return (
                <div key={d.par} className="haParCard" style={isW ? { borderColor: "#fca5a5", background: "#fef2f2" } : undefined}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontWeight: 900, fontSize: 15 }}>Par {d.par}</span>
                    <span className="muted">{d.nHoles} bur.</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: col }}>
                    {(d.avgVsPar ?? 0) >= 0 ? "+" : ""}{(d.avgVsPar ?? 0).toFixed(2)}
                  </div>
                  <div className="muted" style={{ marginBottom: 6, fontSize: 10 }}>média vs par por buraco</div>
                  <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 1 }}>
                    {d.parOrBetterPct > 0 && <div className="seg-birdie" style={{ flex: d.parOrBetterPct }} />}
                    {100 - d.parOrBetterPct - d.doubleOrWorsePct > 0 && <div className="seg-bogey" style={{ flex: 100 - d.parOrBetterPct - d.doubleOrWorsePct }} />}
                    {d.doubleOrWorsePct > 0 && <div className="seg-double" style={{ flex: d.doubleOrWorsePct }} />}
                  </div>
                  {isW && <div style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", marginTop: 4 }}>⚠ Tipo mais difícil</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── F9 vs B9 ── */}
      {S.f9b9 && Math.abs(S.f9b9.f9.strokesLost - S.f9b9.b9.strokesLost) > 0.3 && (
        <div className="haDiag" style={{ marginBottom: 16 }}>
          <div className="haDiagCard">
            <div className="haDiagIcon" style={{ background: "#7c3aed20", color: "#7c3aed" }}>🔄</div>
            <div className="haDiagBody">
              <div className="haDiagVal" style={{ color: "#7c3aed" }}>{S.f9b9.f9.strokesLost > S.f9b9.b9.strokesLost ? "Front 9" : "Back 9"}</div>
              <div className="haDiagLbl">custa mais {Math.abs(S.f9b9.f9.strokesLost - S.f9b9.b9.strokesLost).toFixed(1)} panc./ronda</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabela buraco a buraco ── */}
      <h3 className="tourn-h3">📊 Todos os Buracos</h3>
      <div className="tourn-scroll" style={{ marginBottom: 16 }}>
        <table className="tourn-table">
          <thead><tr>
            <th style={{ width: 40 }}>Bur.</th>
            <th className="r" style={{ width: 30 }}>Par</th>
            <th className="r" style={{ width: 30 }}>SI</th>
            <th className="r" style={{ width: 50 }}>Média</th>
            <th className="r" style={{ width: 50 }}>vs Par</th>
            <th className="r" style={{ width: 35 }}>Best</th>
            <th style={{ minWidth: 120 }}>Scores</th>
          </tr></thead>
          <tbody>
            {S.holes.map(h => {
              const vp = h.avg != null ? h.avg - (h.par ?? 4) : null;
              const bg = (h.strokesLost ?? 0) > 0.5 ? "#fef2f2" : (h.strokesLost ?? 0) <= 0 ? "#f0fdf4" : undefined;
              return (
                <tr key={h.h} style={{ background: bg }}>
                  <td style={{ fontWeight: 800 }}>{h.h}</td>
                  <td className="r">{h.par}</td>
                  <td className="r muted">{h.si}</td>
                  <td className="r tourn-mono" style={{ fontWeight: 700 }}>{h.avg?.toFixed(1) ?? "–"}</td>
                  <td className="r" style={{ fontWeight: 800, color: vp == null ? "#999" : vp <= 0 ? "#16a34a" : vp <= 0.4 ? "#d97706" : "#dc2626" }}>
                    {vp != null ? (vp >= 0 ? "+" : "") + vp.toFixed(2) : "–"}
                  </td>
                  <td className="r"><ScoreCircle g={h.best ?? null} p={h.par ?? 4} sm /></td>
                  <td>{h.dist && <MiniBar d={h.dist} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Plano de Jogo ── */}
      <div className="courseAnalysis" style={{ borderColor: "#1a2e1a", borderWidth: 2 }}>
        <div className="caTitle" style={{ fontSize: 15 }}>🗺️ Plano de Jogo — {TOURN.days} Dias em Málaga</div>
        <div className="caConcText" style={{ color: "#1c2617", lineHeight: 1.7 }}>
          {dowN > 0 && <p style={{ marginBottom: 8 }}>
            <b>🚨 Regra nº1:</b> Evitar doubles! Tiveste <b>{dowN}</b> em {totN} buracos.
            Quando estás em apuros, joga para o centro do green — um bogey é sempre melhor que um double.
          </p>}
          {worstPT && (worstPT.avgVsPar ?? 0) > 0.3 && <p style={{ marginBottom: 8 }}>
            <b>{worstPT.par === 3 ? "⛳" : worstPT.par === 4 ? "🏌️" : "🦅"} Par {worstPT.par}s:</b>{" "}
            {worstPT.par === 3 ? "Acerta no green — o centro dá-te par." :
              worstPT.par === 4 ? "A chave é um bom drive no fairway." :
              "Divide em 3 pancadas, não tentes chegar em 2."}
          </p>}
          {trapHoles.length > 0 && <p style={{ marginBottom: 8 }}>
            <b>🎯 Proteger:</b> Buracos #{trapHoles.map(h => h.h).join(", #")} — foram armadilha no ano passado. Joga seguro, o centro do green é o teu amigo.
          </p>}
          {strongHoles.length > 0 && <p style={{ marginBottom: 8 }}>
            <b>💪 Atacar:</b> Buracos #{strongHoles.map(h => h.h).join(", #")} — aqui jogas bem, confia!
          </p>}
          <p style={{ marginBottom: 8 }}>
            <b>🧠 São {TOURN.days} dias!</b> O torneio não se ganha no 1º dia. Paciência, rotina, água.
          </p>
          {bestDay && worstDay && bestDay.doubles < worstDay.doubles && <p>
            <b>💪</b> No teu melhor dia fizeste {bestDay.doubles} double{bestDay.doubles !== 1 ? "s" : ""}, no pior {worstDay.doubles}. A diferença está aí — evitar os buracos grandes é a chave.
          </p>}
          {recoveryRate != null && recoveryRate < 50 && <p>
            <b>🧘</b> Depois de um double, respira fundo. Rotina de reset: esquece o último, joga O PRÓXIMO buraco.
          </p>}
          <p style={{ marginBottom: 8 }}>
            <b>🏆 Benchmark:</b> O 5º lugar em 2025 fez {FIELD_2025.leaderboard[4]?.total} ({fmtTP(FIELD_2025.leaderboard[4]?.result)}), ou ~{FIELD_2025.top5Avg.toFixed(0)}/ronda. 
            {ecl && <> O teu eclético é {ecl.totalGross} — se juntares o melhor de cada buraco, é número de Top 5.</>}
          </p>
        </div>
      </div>

      </>}

      <div style={{ textAlign: "center", margin: "20px 0" }}>
        <Link to={`/jogadores/${fed}`} className="tourn-tab tourn-tab-active" style={{ textDecoration: "none", padding: "10px 24px" }}>
          Ver perfil completo do {PLAYER_NAME} →
        </Link>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════ */
function Header() {
  return (
    <div className="tourn-header">
      <div className="tourn-header-top">
        <h1 className="tourn-title">🇪🇸 {TOURN.name}</h1>
      </div>
      <div className="tourn-header-info">
        <span>📅 {TOURN.dates}</span>
        <span>📍 {TOURN.location}</span>
        <span>⛳ {TOURN.days} dias</span>
        <span>🏷️ {PLAYER_NAME} · Sub-12</span>
      </div>
    </div>
  );
}

function MiniBar({ d }: { d: { eagle: number; birdie: number; par: number; bogey: number; double: number; triple: number } }) {
  const tot = Object.values(d).reduce((a, b) => a + b, 0);
  if (!tot) return <span className="muted">–</span>;
  const segs = [
    { n: d.eagle + d.birdie, cls: "seg-birdie" },
    { n: d.par, cls: "seg-par" },
    { n: d.bogey, cls: "seg-bogey" },
    { n: d.double + d.triple, cls: "seg-double" },
  ];
  return (
    <div style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden", gap: 1 }}>
      {segs.filter(s => s.n > 0).map((s, i) => (
        <div key={i} className={s.cls} style={{ flex: s.n, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff" }}>
          {s.n}
        </div>
      ))}
    </div>
  );
}
