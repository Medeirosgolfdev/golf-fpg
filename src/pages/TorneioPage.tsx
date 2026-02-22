/**
 * TorneioPage.tsx — GG26
 *
 * Redesigned: results are derived LIVE from player scorecards.
 * When a player's WHS data includes a round at the tournament course
 * on a tournament date, it automatically appears in the leaderboard.
 *
 * Static JSON results (torneio-greatgolf.json) are used as fallback
 * for international players without federation numbers.
 */
import { useEffect, useMemo, useState } from "react";
import type { PlayersDb } from "../data/types";
import { loadPlayerData, type PlayerPageData, type HoleScores } from "../data/playerDataLoader";
import { deepFixMojibake } from "../utils/fixEncoding";
import TeePill from "../ui/TeePill";
import LeaderboardView from "./LeaderboardView";
import {
  normalizeTournament,
  type NormalizedTournament,
  type PlayerHoles,
  type LiveRound,
  deriveResults,
  isoToDD,
  findDrawEntry,
  isPja,
  birthYear,
  escalaoFromYear,
  calcDaySD,
  playerCategory as catOf,
  dayKeys,
} from "../utils/tournamentTypes";
import tournData from "../../torneio-greatgolf.json";

/* ── Normalized tournament data (static baseline) ── */
const NORM_BASE = normalizeTournament(tournData as Record<string, unknown>);

/* ── Legacy constants (used by AnalysisView, kept for compat) ── */
const PJA = NORM_BASE.pjaFeds;
const COURSE = NORM_BASE.categories[0].courseData;
const HOLES = COURSE.holes;
const ALL_DRAW = NORM_BASE.allDraw;

/* ── Types ── */
type TournView = "draw" | "leaderboard" | "analysis";

interface RecentRound {
  date: string;
  dateSort: number;
  course: string;
  gross: number;
  par: number;
  sd: number | null;
}

interface PlayerForm {
  fed: string | null;
  name: string;
  club: string;
  hcpExact: number | null;
  escalao: string;
  teeColor: string;
  recentRounds: RecentRound[];
  daysSinceLast: number | null;
  avgSD5: number | null;
  trend: "up" | "stable" | "down" | "unknown";
  /** Per-day results: d1Gross, d1SD, etc. (legacy, kept for AnalysisView) */
  d1Gross: number | null;
  d1ToPar: number | null;
  d1SD: number | null;
  d1Pos: number | null;
  predictedGross: number | null;
  category: string;
}

/* ── Helpers ── */
function fmtToPar(tp: number | null): string {
  if (tp == null) return "-";
  return tp === 0 ? "E" : tp > 0 ? `+${tp}` : String(tp);
}

function scoreClass(score: number | null, par: number): string {
  if (score == null) return "";
  const diff = score - par;
  if (diff <= -2) return "sc-eagle";
  if (diff === -1) return "sc-birdie";
  if (diff === 0) return "sc-par";
  if (diff === 1) return "sc-bogey";
  if (diff === 2) return "sc-dbogey";
  return "sc-worse";
}

function ScoreDot({ score, par }: { score: number | null; par: number }) {
  if (score == null) return <span className="sc-dot sc-empty">·</span>;
  const cls = scoreClass(score, par);
  const shape = (score - par) < 0 ? "sc-dot sc-circle" : "sc-dot sc-square";
  return <span className={`${shape} ${cls}`}>{score}</span>;
}

function fmtHcp(v: number | null): string {
  if (v == null) return "-";
  return v > 0 ? v.toFixed(1) : `+${Math.abs(v).toFixed(1)}`;
}

function trendFromRounds(rounds: RecentRound[]): "up" | "stable" | "down" | "unknown" {
  const sds = rounds.filter(r => r.sd != null).slice(0, 6).map(r => r.sd!);
  if (sds.length < 3) return "unknown";
  const recent3 = sds.slice(0, 3);
  const older3 = sds.slice(3, 6);
  if (older3.length === 0) return "unknown";
  const avgRecent = recent3.reduce((a, b) => a + b, 0) / recent3.length;
  const avgOlder = older3.reduce((a, b) => a + b, 0) / older3.length;
  const diff = avgRecent - avgOlder;
  if (diff < -1.5) return "up";
  if (diff > 1.5) return "down";
  return "stable";
}

/** Check if a course name matches the tournament course */
function isTournCourse(courseName: string, norm: NormalizedTournament): boolean {
  const lower = courseName.toLowerCase();
  return norm.courseMatch.every(kw => lower.includes(kw));
}

/* ── Password Gate ── */
const CAL_STORAGE_KEY = "cal_unlocked";

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  const check = () => {
    if (pw === "machico") {
      localStorage.setItem(CAL_STORAGE_KEY, "1");
      window.dispatchEvent(new Event("storage"));
      onUnlock();
    }
    else { setError(true); setTimeout(() => setError(false), 1500); }
  };

  return (
    <div className="pw-gate">
      <div className="pw-icon">🔒</div>
      <div className="pw-title">Acesso restrito</div>
      <div className="pw-sub">Este separador requer password</div>
      <div className="pw-row">
        <input type="password" value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === "Enter" && check()}
          placeholder="Password…" autoFocus
          className={`tourn-pw-input${error ? " tourn-pw-error" : ""}`} />
        <button onClick={check} className="pw-btn">Entrar</button>
      </div>
      {error && <div className="fs-11 fw-600 c-danger">Password incorrecta</div>}
    </div>
  );
}

/* ── Draw View ── */
type DrawCat = "all" | "wagr" | "sub14" | "sub12";

function PlayerLink({ fed, name, onSelect }: { fed: string | null; name: string; onSelect?: (fed: string) => void }) {
  if (fed && onSelect) return <span className="tourn-pname tourn-pname-link" onClick={() => onSelect(fed)}>{name}</span>;
  return <span className="tourn-pname">{name}</span>;
}

function DrawTable({ draw, onSelectPlayer }: { draw: import("../utils/tournamentTypes").DrawEntry[]; onSelectPlayer?: (fed: string) => void }) {
  const groups = new Set(draw.map(d => `${d.time}-${d.group}`)).size;
  return (
    <>
      <div className="tourn-meta">{draw.length} jogadores · {groups} grupos</div>
      <div className="tourn-scroll">
        <table className="tourn-draw">
          <thead>
            <tr>
              <th className="col-w60">Hora</th>
              <th className="col-w80">Tee</th>
              <th>Jogador</th>
              <th className="r col-w70">HCP Ex.</th>
              <th className="r col-w60">HCP Jg</th>
            </tr>
          </thead>
          <tbody>
            {draw.map((d, i) => {
              const prev = draw[i - 1];
              const next = draw[i + 1];
              const isGroupStart = !prev || d.time !== prev.time || d.group !== prev.group;
              const isGroupEnd = !next || d.time !== next.time || d.group !== next.group;
              const year = birthYear(NORM_BASE, d.fed);
              const esc = escalaoFromYear(year);
              const pja = isPja(NORM_BASE, d.fed);
              const showTeeBadge = isGroupStart || d.teeColor !== prev?.teeColor;

              return (
                <tr key={i} className={`tourn-draw-row${isGroupStart ? " tourn-group-first" : ""}${isGroupEnd ? " tourn-group-last" : ""}${d.sex === "F" ? " tourn-female-row" : ""}`}>
                  <td className="tourn-draw-time">{isGroupStart ? d.time : ""}</td>
                  <td className="tourn-draw-tee">{showTeeBadge && <TeePill name={d.teeColor} />}</td>
                  <td className="tourn-draw-player">
                    <PlayerLink fed={d.fed} name={d.name} onSelect={onSelectPlayer} />
                    {pja && <span className="jog-pill tourn-pill-pja">PJA</span>}
                    {!d.fed && <span className="jog-pill tourn-pill-intl">INTL</span>}
                    {d.sex === "F" && <span className="jog-pill jog-pill-sex-F">♀</span>}
                    {esc && <span className={`jog-pill jog-pill-escalao jog-pill-escalao-${esc.toLowerCase().replace("-", "")}`}>{esc}</span>}
                    {year && <span className="jog-pill jog-pill-birth">{year}</span>}
                    <span className="jog-pill jog-pill-club">{d.club}</span>
                  </td>
                  <td className="r tourn-draw-hcp">{fmtHcp(d.hcpExact)}</td>
                  <td className="r tourn-draw-hcp">{d.hcpPlay != null ? (d.hcpPlay > 0 ? String(d.hcpPlay) : `+${Math.abs(d.hcpPlay)}`) : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DrawView({ players, onSelectPlayer }: { players: PlayersDb; onSelectPlayer?: (fed: string) => void }) {
  const [cat, setCat] = useState<DrawCat>("all");
  const [day, setDay] = useState<1 | 2>(2);

  const wagrDraw = NORM_BASE.draws.wagr?.[`d${day}`] || NORM_BASE.draws.wagr?.d1 || [];
  const sub14Draw = day === 2 ? (NORM_BASE.draws.sub14?.d1 || null) : null;
  const sub12Draw = day === 2 ? (NORM_BASE.draws.sub12?.d1 || null) : null;
  const allDraw = [...wagrDraw, ...(sub14Draw || []), ...(sub12Draw || [])].sort((a, b) => a.time.localeCompare(b.time) || a.group - b.group);

  const cats: { key: DrawCat; label: string; count: number }[] = [
    { key: "all", label: "Todos", count: allDraw.length },
    { key: "wagr", label: "WAGR", count: wagrDraw.length },
  ];
  if (sub14Draw) cats.push({ key: "sub14", label: "Sub-14", count: sub14Draw.length });
  if (sub12Draw) cats.push({ key: "sub12", label: "Sub-12", count: sub12Draw.length });

  const effectiveCat = (cat === "sub14" && !sub14Draw) || (cat === "sub12" && !sub12Draw) ? "all" : cat;

  let activeDraw: import("../utils/tournamentTypes").DrawEntry[];
  if (effectiveCat === "wagr") activeDraw = wagrDraw;
  else if (effectiveCat === "sub14") activeDraw = sub14Draw || [];
  else if (effectiveCat === "sub12") activeDraw = sub12Draw || [];
  else activeDraw = allDraw;

  return (
    <div className="tourn-section">
      <div className="d-flex gap-6 mb-10">
        <button className={`tourn-tab fs-11${day === 1 ? " tourn-tab-active" : ""}`} onClick={() => setDay(1)} style={{ padding: "4px 12px" }}>
          R1 — {NORM_BASE.dates[0]?.split("-").reverse().slice(0, 2).join("/") || ""}
        </button>
        {NORM_BASE.draws.wagr?.d2 && (
          <button className={`tourn-tab fs-11${day === 2 ? " tourn-tab-active" : ""}`} onClick={() => setDay(2)} style={{ padding: "4px 12px" }}>
            R2 — {NORM_BASE.dates[1]?.split("-").reverse().slice(0, 2).join("/") || ""}
          </button>
        )}
      </div>
      <div className="tourn-tabs">
        {cats.map(c => (
          <button key={c.key} className={`tourn-tab${effectiveCat === c.key ? " tourn-tab-active" : ""}`} onClick={() => setCat(c.key)}>
            {c.label} <span className="op-6 fs-11">({c.count})</span>
          </button>
        ))}
      </div>
      <DrawTable draw={activeDraw} onSelectPlayer={onSelectPlayer} />
    </div>
  );
}

/* ── Analysis View (mostly unchanged, uses legacy D1 + playerHistory) ── */
type AnalysisCat = "wagr" | "sub14" | "sub12";
const TREND_ICONS: Record<string, string> = { up: "📈", stable: "➡️", down: "📉", unknown: "–" };
const TREND_LABELS: Record<string, string> = { up: "Em forma", stable: "Estável", down: "Em baixa", unknown: "Sem dados" };

function AnalysisView({ norm, players, holeDataByDay, playerHistory, onSelectPlayer }: {
  norm: NormalizedTournament;
  players: PlayersDb;
  holeDataByDay: Record<string, Map<string, PlayerHoles>>;
  playerHistory: Map<string, PlayerForm>;
  onSelectPlayer?: (fed: string) => void;
}) {
  const [cat, setCat] = useState<AnalysisCat>("wagr");

  const allForms = Array.from(playerHistory.values());
  const catForms = allForms.filter(f => f.category === cat);

  /* D1 from live results */
  const wagrD1 = norm.results.wagr?.d1 || [];
  const classified = wagrD1.filter(r => r.status === "OK" && r.gross != null);

  /* KPIs */
  const wagrForms = allForms.filter(f => f.category === "wagr");
  const grosses = classified.map(r => r.gross!);
  const avg = grosses.length > 0 ? grosses.reduce((a, b) => a + b, 0) / grosses.length : 0;
  const sds = wagrForms.filter(f => f.d1SD != null).map(f => f.d1SD!);
  const avgSD = sds.length > 0 ? sds.reduce((a, b) => a + b, 0) / sds.length : null;
  const sdStdDev = sds.length > 2 ? Math.sqrt(sds.reduce((s, v) => s + (v - avgSD!) ** 2, 0) / sds.length) : null;
  const under = classified.filter(r => r.toPar! <= 0).length;
  const pjaResults = classified.filter(r => r.fed && PJA.has(r.fed));

  const sorted = [...catForms].sort((a, b) => {
    if (a.d1Pos != null && b.d1Pos != null) return a.d1Pos - b.d1Pos;
    if (a.d1Pos != null) return -1;
    if (b.d1Pos != null) return 1;
    const tOrd: Record<string, number> = { up: 0, stable: 1, unknown: 2, down: 3 };
    return (tOrd[a.trend] ?? 2) - (tOrd[b.trend] ?? 2);
  });

  /* Hole difficulty from WAGR D1 holeData */
  const wagrHoles = holeDataByDay["wagr_d1"] || new Map();
  const holeDiff = HOLES.map((h, i) => {
    const scores: number[] = [];
    wagrHoles.forEach(ph => { if (ph.holes[i] != null) scores.push(ph.holes[i]!); });
    const a = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : null;
    return { hole: h.h, par: h.par, si: h.si, m: h.m, avg: a, n: scores.length,
      birdies: scores.filter(s => s < h.par).length,
      pars: scores.filter(s => s === h.par).length,
      bogeys: scores.filter(s => s > h.par).length };
  });

  const catCounts = {
    wagr: allForms.filter(f => f.category === "wagr").length,
    sub14: allForms.filter(f => f.category === "sub14").length,
    sub12: allForms.filter(f => f.category === "sub12").length,
  };

  return (
    <div className="tourn-section">
      <div className="tourn-tabs tourn-mb14">
        {(["wagr", "sub14", "sub12"] as AnalysisCat[]).filter(c => catCounts[c] > 0).map(c => (
          <button key={c} className={`tourn-tab${cat === c ? " tourn-tab-active" : ""}`} onClick={() => setCat(c)}>
            {c === "wagr" ? "WAGR" : c === "sub14" ? "Sub-14" : "Sub-12"} <span className="op-6 fs-11">({catCounts[c]})</span>
          </button>
        ))}
      </div>

      {cat === "wagr" && grosses.length > 0 && (
        <div className="tourn-kpis">
          {[
            { label: "Melhor Gross", val: Math.min(...grosses), sub: classified.find(r => r.gross === Math.min(...grosses))?.name },
            { label: "Média Campo", val: avg.toFixed(1), sub: `${classified.length} jog.` },
            { label: "Under/Even", val: `${under} de ${classified.length}` },
            { label: "SD Médio", val: avgSD?.toFixed(1) ?? "–", sub: sdStdDev ? `σ ${sdStdDev.toFixed(1)}` : undefined },
            { label: "Média PJA", val: pjaResults.length > 0 ? (pjaResults.reduce((a, r) => a + r.gross!, 0) / pjaResults.length).toFixed(1) : "–", sub: `${pjaResults.length} jog.` },
          ].map((k, i) => (
            <div key={i} className="tourn-kpi">
              <div className="tourn-kpi-lbl">{k.label}</div>
              <div className="tourn-kpi-val">{k.val}</div>
              {k.sub && <div className="tourn-kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {sorted.length > 0 ? (
        <>
          <h3 className="tourn-h3">Forma dos Jogadores — {cat === "wagr" ? "WAGR" : cat === "sub14" ? "Sub-14" : "Sub-12"}</h3>
          <div className="tourn-meta">{sorted.length} jogadores com histórico na app · dados pré-torneio</div>
          <div className="tourn-scroll">
            <table className="tourn-table tourn-form-table">
              <thead>
                <tr>
                  {cat === "wagr" && <th className="r col-w30">Pos</th>}
                  <th>Jogador</th>
                  <th className="r col-w42">HCP</th>
                  {cat === "wagr" && <th className="r col-w40">D1</th>}
                  {cat === "wagr" && <th className="r col-w40">SD</th>}
                  <th className="r col-w45">Últ. Jg</th>
                  <th className="col-w220">Últimas Rondas (SD)</th>
                  <th className="col-w60">Forma</th>
                  <th className="r col-w50">R2 Est.</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f, i) => {
                  const pja = isPja(norm, f.fed);
                  const female = ALL_DRAW.find(d => d.fed === f.fed)?.sex === "F";
                  return (
                    <tr key={i} className={female ? "tourn-female-row" : ""}>
                      {cat === "wagr" && <td className="r tourn-mono fw-700">{f.d1Pos ?? "–"}</td>}
                      <td>
                        <PlayerLink fed={f.fed} name={f.name} onSelect={onSelectPlayer} />
                        {pja && <span className="jog-pill tourn-pill-pja ml-4">PJA</span>}
                        <span className={`jog-pill jog-pill-escalao jog-pill-escalao-${f.escalao.toLowerCase().replace("-", "")} ml-4 fs-9`}>{f.escalao}</span>
                      </td>
                      <td className="r tourn-mono">{fmtHcp(f.hcpExact)}</td>
                      {cat === "wagr" && (
                        <td className="r tourn-mono fw-700">
                          {f.d1Gross != null ? <><span>{f.d1Gross}</span> <span className={`${f.d1ToPar! <= 0 ? "tp-under" : "tp-over1"} fs-10`}>({fmtToPar(f.d1ToPar)})</span></> : "–"}
                        </td>
                      )}
                      {cat === "wagr" && (
                        <td className="r tourn-mono fs-11">
                          {f.d1SD != null ? <span className={`${f.d1SD <= 0 ? "tp-under" : f.d1SD <= 5 ? "tp-over1" : "tp-over2"} fw-600`}>{f.d1SD.toFixed(1)}</span> : "–"}
                        </td>
                      )}
                      <td className="r fs-11">
                        {f.daysSinceLast != null ? <span style={{ color: f.daysSinceLast <= 7 ? "#16a34a" : f.daysSinceLast <= 21 ? "#e67e22" : "var(--color-danger)" }}>{f.daysSinceLast}d</span> : "–"}
                      </td>
                      <td>
                        <div className="tourn-sparkline">
                          {f.recentRounds.slice(0, 5).reverse().map((r, ri) => (
                            <span key={ri} className={`tourn-spark-dot ${r.sd != null ? (r.sd <= 0 ? "spark-green" : r.sd <= 10 ? "spark-amber" : "spark-red") : "spark-grey"}`}
                              title={`${r.date} · ${r.course}\nGross: ${r.gross} · Par: ${r.par} · SD: ${r.sd?.toFixed(1) ?? "–"}`}>
                              {r.sd != null ? r.sd.toFixed(1) : "?"}
                            </span>
                          ))}
                          {f.avgSD5 != null && <span className="tourn-spark-avg">μ{f.avgSD5.toFixed(1)}</span>}
                        </div>
                      </td>
                      <td className="tourn-trend">
                        <span className={`tourn-trend-badge trend-${f.trend}`}>
                          {TREND_ICONS[f.trend]} {TREND_LABELS[f.trend]}
                        </span>
                      </td>
                      <td className="r tourn-mono fw-700 fs-13">{f.predictedGross ?? "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="tourn-meta empty-state-sm">⏳ A carregar dados de jogadores...</div>
      )}

      {cat === "wagr" && holeDiff[0]?.n > 0 && <>
        <h3 className="tourn-h3">Dificuldade por Buraco</h3>
        <div className="tourn-meta">{holeDiff[0].n} scorecards · ordenado do mais fácil ao mais difícil</div>
        <div className="tourn-scroll">
          <table className="tourn-table tourn-form-table">
            <thead>
              <tr>
                <th className="col-w40">Buraco</th>
                <th className="r col-w30">Par</th>
                <th className="r col-w30">SI</th>
                <th className="r col-w50">Dist</th>
                <th className="r col-w50">Média</th>
                <th className="r col-w50">vs Par</th>
                <th className="col-w180">Distribuição</th>
              </tr>
            </thead>
            <tbody>
              {[...holeDiff].sort((a, b) => ((a.avg ?? 0) - a.par) - ((b.avg ?? 0) - b.par)).map((h, i) => {
                const vp = h.avg != null ? h.avg - h.par : null;
                return (
                  <tr key={i}>
                    <td className="tourn-mono fw-700">{h.hole}</td>
                    <td className="r">{h.par}</td>
                    <td className="r c-muted">{h.si}</td>
                    <td className="r tourn-mono">{h.m}</td>
                    <td className="r tourn-mono fw-700">{h.avg?.toFixed(1) ?? "–"}</td>
                    <td className="r">
                      {vp != null && <span style={{ color: vp <= 0 ? "#16a34a" : vp < 0.5 ? "#e67e22" : "var(--color-danger)", fontWeight: 600 }}>
                        {vp > 0 ? `+${vp.toFixed(2)}` : vp.toFixed(2)}
                      </span>}
                    </td>
                    <td>
                      {h.n > 0 && (
                        <div className="tourn-distrib">
                          {h.birdies > 0 && <span className="tourn-d-birdie" style={{ flex: h.birdies }}>{h.birdies}</span>}
                          {h.pars > 0 && <span className="tourn-d-par" style={{ flex: h.pars }}>{h.pars}</span>}
                          {h.bogeys > 0 && <span className="tourn-d-bogey" style={{ flex: h.bogeys }}>{h.bogeys}</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Main Component — with LIVE result derivation
   ═══════════════════════════════════════════════ */

export default function TorneioPage({ players, onSelectPlayer }: { players: PlayersDb; onSelectPlayer?: (fed: string) => void }) {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(CAL_STORAGE_KEY) === "1");
  const [view, setView] = useState<TournView>("leaderboard");
  const [loading, setLoading] = useState(false);
  const [loadCount, setLoadCount] = useState(0);

  /* Live-derived state */
  const [liveNorm, setLiveNorm] = useState<NormalizedTournament>(NORM_BASE);
  const [holeDataByDay, setHoleDataByDay] = useState<Record<string, Map<string, PlayerHoles>>>({});
  const [playerHistory, setPlayerHistory] = useState<Map<string, PlayerForm>>(new Map());

  const fedList = useMemo(() => [...new Set(ALL_DRAW.filter(d => d.fed).map(d => d.fed!))], []);
  const TOURN_DATE = new Date(NORM_BASE.dates[0]);

  /* Tournament dates in DD-MM-YYYY format (for matching player rounds) */
  const tournDatesDD = useMemo(() =>
    new Set(NORM_BASE.dates.map(d => isoToDD(d))),
    [],
  );

  useEffect(() => {
    if (!unlocked || Object.keys(holeDataByDay).length > 0) return;
    setLoading(true);
    let count = 0;

    const loadAll = async () => {
      const fMap = new Map<string, PlayerForm>();
      const liveRounds: LiveRound[] = [];

      for (let i = 0; i < fedList.length; i += 4) {
        const batch = fedList.slice(i, i + 4);
        const results = await Promise.allSettled(batch.map(fed => loadPlayerData(fed)));

        results.forEach((res, j) => {
          const fed = batch[j];
          if (res.status !== "fulfilled") return;
          const data: PlayerPageData = res.value;
          deepFixMojibake(data);
          const drawEntry = ALL_DRAW.find(dd => dd.fed === fed);
          if (!drawEntry) return;

          /* ── Extract ALL rounds ── */
          const allRounds: RecentRound[] = [];
          for (const c of data.DATA) {
            for (const r of c.rounds) {
              const g = typeof r.gross === "number" ? r.gross : null;
              if (g == null || g <= 0 || r.holeCount !== 18) continue;
              const sd = typeof r.sd === "number" ? r.sd : null;
              allRounds.push({
                date: r.date,
                dateSort: r.dateSort,
                course: c.course,
                gross: g,
                par: typeof r.par === "number" ? r.par : 72,
                sd,
              });
            }
          }
          allRounds.sort((a, b) => b.dateSort - a.dateSort);

          /* ── Tournament rounds → LiveRound + holes ── */
          for (const c of data.DATA) {
            if (!isTournCourse(c.course, NORM_BASE)) continue;
            for (const r of c.rounds) {
              if (!tournDatesDD.has(r.date)) continue;
              const g = typeof r.gross === "number" ? r.gross : null;
              if (g == null || g <= 0 || r.holeCount !== 18) continue;

              // Extract holes
              const hs: HoleScores | undefined = data.HOLES[r.scoreId];
              const holes18 = (hs?.g && hs.g.length >= 18) ? hs.g.slice(0, 18) : null;

              liveRounds.push({
                fed,
                name: drawEntry.name,
                club: drawEntry.club,
                dateDD: r.date,
                gross: g,
                par: typeof r.par === "number" ? r.par : 72,
                holes: holes18,
                scoreId: r.scoreId,
              });
            }
          }

          /* ── Pre-tournament form (for AnalysisView) ── */
          const preTourn = allRounds.filter(r => !tournDatesDD.has(r.date));
          const recent = preTourn.slice(0, 15);

          const lastDate = recent.length > 0 ? new Date(recent[0].dateSort) : null;
          const daysSince = lastDate ? Math.round((TOURN_DATE.getTime() - lastDate.getTime()) / 86400000) : null;

          const recentSDs = recent.filter(r => r.sd != null).slice(0, 5).map(r => r.sd!);
          const avgSD5 = recentSDs.length > 0 ? recentSDs.reduce((a, b) => a + b, 0) / recentSDs.length : null;

          /* D1 result (from live rounds) */
          const d1DateDD = NORM_BASE.catDates.wagr?.d1 ? isoToDD(NORM_BASE.catDates.wagr.d1) : null;
          const d1Round = liveRounds.find(lr => lr.fed === fed && lr.dateDD === d1DateDD);
          const sex = drawEntry.sex || "M";
          const d1SD = d1Round ? calcDaySD(d1Round.gross, NORM_BASE, drawEntry.teeColor, sex) : null;
          const pCat = catOf(NORM_BASE, fed, drawEntry.name);

          /* Prediction */
          let predicted: number | null = null;
          const tr = NORM_BASE.teeRatings[`${drawEntry.teeColor}_${sex}`] || NORM_BASE.teeRatings[`${drawEntry.teeColor}_M`] || { cr: 72, slope: 113 };
          if (avgSD5 != null && d1SD != null) {
            predicted = Math.round(tr.cr + (d1SD * 0.4 + avgSD5 * 0.6) * tr.slope / 113);
          } else if (avgSD5 != null) {
            predicted = Math.round(tr.cr + avgSD5 * tr.slope / 113);
          } else if (d1Round) {
            predicted = d1Round.gross;
          }

          fMap.set(fed, {
            fed, name: drawEntry.name, club: drawEntry.club,
            hcpExact: drawEntry.hcpExact,
            escalao: escalaoFromYear(birthYear(NORM_BASE, fed)),
            teeColor: drawEntry.teeColor,
            recentRounds: recent,
            daysSinceLast: daysSince,
            avgSD5,
            trend: trendFromRounds(recent),
            d1Gross: d1Round?.gross ?? null,
            d1ToPar: d1Round ? d1Round.gross - (NORM_BASE.categories[0].courseData.par) : null,
            d1SD: d1SD != null ? Math.round(d1SD * 10) / 10 : null,
            d1Pos: null, // filled after deriveResults
            predictedGross: predicted,
            category: pCat,
          });

          count++;
          setLoadCount(count);
        });
      }

      /* ── Derive live results from all collected rounds ── */
      const { results: liveResults, holeDataByDay: hdbd } = deriveResults(NORM_BASE, liveRounds);

      /* Update d1Pos in playerHistory from derived positions */
      const wagrD1 = liveResults.wagr?.d1 || [];
      for (const r of wagrD1) {
        if (r.fed && fMap.has(r.fed)) {
          const f = fMap.get(r.fed)!;
          f.d1Pos = r.pos;
          f.d1Gross = r.gross;
          f.d1ToPar = r.toPar;
        }
      }

      /* Create updated NORM with live results */
      const updatedNorm: NormalizedTournament = {
        ...NORM_BASE,
        results: liveResults,
      };

      setLiveNorm(updatedNorm);
      setHoleDataByDay(hdbd);
      setPlayerHistory(fMap);
      setLoading(false);
    };

    loadAll();
  }, [unlocked]);

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  /* Count total scorecards loaded */
  const totalScorecards = Object.values(holeDataByDay).reduce((s, m) => s + m.size, 0);

  return (
    <div className="tourn-page">
      {/* Header */}
      <div className="tourn-header">
        <div className="tourn-header-top">
          <span className="tourn-pill-intl fs-9" style={{ padding: "2px 6px" }}>🌍 INTL</span>
          <h2 className="tourn-title">GG26</h2>
        </div>
        <div className="tourn-header-info">
          <span>📍 {NORM_BASE.course}</span>
          <span>📅 {NORM_BASE.dates.join(" → ")}</span>
          <span>👥 {ALL_DRAW.length} jogadores</span>
          <span>🏌️ {NORM_BASE.totalDays} dias</span>
          {loading && <span className="tourn-loading">⏳ Scorecards {loadCount}/{fedList.length}</span>}
          {!loading && totalScorecards > 0 && <span className="tourn-loaded">✓ {totalScorecards} scorecards</span>}
        </div>
        {/* External links */}
        {NORM_BASE.links && (() => {
          const links = NORM_BASE.links;
          const groups: { label: string; keys: string[]; labels: Record<string, string> }[] = [
            { label: "WAGR", keys: ["draw_wagr_r1", "draw_wagr_r2", "draw_wagr_r3", "results_wagr"],
              labels: { draw_wagr_r1: "Draw R1", draw_wagr_r2: "Draw R2", draw_wagr_r3: "Draw R3", results_wagr: "Results" }},
            { label: "Sub-14", keys: ["draw_sub14", "draw_sub14_r2", "results_sub14"],
              labels: { draw_sub14: "Draw R1", draw_sub14_r2: "Draw R2", results_sub14: "Results" }},
            { label: "Sub-12", keys: ["draw_sub12", "draw_sub12_r2", "results_sub12"],
              labels: { draw_sub12: "Draw R1", draw_sub12_r2: "Draw R2", results_sub12: "Results" }},
          ];
          return (
            <div className="tourn-ext-links">
              {groups.map(g => {
                const available = g.keys.filter(k => links[k]);
                if (available.length === 0) return null;
                return (
                  <span key={g.label} className="tourn-ext-group">
                    <span className="tourn-ext-group-label">{g.label}</span>
                    {available.map(k => (
                      <a key={k} href={links[k]} target="_blank" rel="noopener noreferrer" className="tourn-ext-link">
                        {g.labels[k] || k}<span className="fs-9 op-6"> ↗</span>
                      </a>
                    ))}
                  </span>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Tabs */}
      <div className="tourn-tabs">
        {([
          { key: "draw" as const, label: "Draw", icon: "📋" },
          { key: "leaderboard" as const, label: "Leaderboard", icon: "🏆" },
          { key: "analysis" as const, label: "Análise", icon: "📊" },
        ]).map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={`tourn-tab${view === t.key ? " tourn-tab-active" : ""}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {view === "draw" && <DrawView players={players} onSelectPlayer={onSelectPlayer} />}
      {view === "leaderboard" && <LeaderboardView norm={liveNorm} players={players} holeDataByDay={holeDataByDay} onSelectPlayer={onSelectPlayer} />}
      {view === "analysis" && <AnalysisView norm={liveNorm} players={players} holeDataByDay={holeDataByDay} playerHistory={playerHistory} onSelectPlayer={onSelectPlayer} />}
    </div>
  );
}
