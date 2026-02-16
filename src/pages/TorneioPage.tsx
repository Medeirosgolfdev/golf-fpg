/**
 * TorneioPage.tsx — Greatgolf Junior Open with Luis Figo Foundation
 *
 * Tab protegido por password com:
 *  - Draw R1 — tabela com pills (ano, PJA, clube, HCP, escalão)
 *  - Leaderboard — classificação + scorecard buraco-a-buraco
 *  - Análise — KPIs, performance vs HCP, resumo PJA
 */
import { useEffect, useMemo, useState } from "react";
import type { PlayersDb } from "../data/types";
import { loadPlayerData, type PlayerPageData, type HoleScores } from "../data/playerDataLoader";
import TeePill from "../ui/TeePill";
import tournData from "../../torneio-greatgolf.json";

/* ─── Types ─── */
type TournView = "draw" | "leaderboard" | "analysis";

interface DrawEntry {
  time: string; tee: number; teeColor: string; group: number;
  name: string; fed: string | null; club: string;
  hcpExact: number | null; hcpPlay: number | null; sex: string;
}

interface ResultEntry {
  pos: number | null; name: string; fed: string | null; club: string;
  toPar: number | null; gross: number | null; total: number | null; status: string;
}

interface HoleInfo { h: number; par: number; si: number; m: number; }
type PlayerHoles = { fed: string | null; name: string; holes: (number | null)[]; gross: number; };

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
  d1Gross: number | null;
  d1ToPar: number | null;
  d1SD: number | null;
  d1Pos: number | null;
  predictedGross: number | null;
  category: "wagr" | "sub14" | "sub12";
}

/* ─── Statics ─── */
const PJA = new Set(tournData._pja_feds || []);
const COURSE = tournData.courseData as { par: number; cr: number; slope: number; holes: HoleInfo[] };
const HOLES = COURSE.holes;
const PAR_OUT = HOLES.slice(0, 9).reduce((s, h) => s + h.par, 0);
const PAR_IN = HOLES.slice(9).reduce((s, h) => s + h.par, 0);
const BIRTH = (tournData as any).birthYears as Record<string, number> || {};
const DRAW_R1 = (tournData as any).draw_r1 as DrawEntry[];
const DRAW_R2 = (tournData as any).draw_r2 as DrawEntry[] | undefined;
const DRAW_SUB14 = (tournData as any).draw_sub14 as DrawEntry[] | undefined;
const DRAW_SUB12 = (tournData as any).draw_sub12 as DrawEntry[] | undefined;
const ALL_DRAW = [...DRAW_R1, ...(DRAW_R2 || []), ...(DRAW_SUB14 || []), ...(DRAW_SUB12 || [])];
const D1 = tournData.results.d1 as ResultEntry[];
const D1_SUB14 = ((tournData.results as any).sub14 || []) as ResultEntry[];
const D1_SUB12 = ((tournData.results as any).sub12 || []) as ResultEntry[];

/* Course data per tee */
const COURSE_AMARELAS = (tournData as any).courseDataAmarelas as { par: number; cr: number; slope: number; holes: HoleInfo[] } | undefined;
const COURSE_VERMELHAS = (tournData as any).courseDataVermelhas as { par: number; cr: number; slope: number; holes: HoleInfo[] } | undefined;
const HOLES_AMARELAS = COURSE_AMARELAS?.holes || HOLES;
const HOLES_VERMELHAS = COURSE_VERMELHAS?.holes || HOLES;

/* Manual scorecards for international players (no WHS data) */
const MANUAL_HOLES: Record<string, PlayerHoles> = {};
const _mh = (tournData as any).manualHoles as Record<string, { d1: number[]; gross: number; toPar: number }> | undefined;
if (_mh) {
  for (const [name, md] of Object.entries(_mh)) {
    if (md.d1 && md.d1.length >= 18) {
      MANUAL_HOLES[name] = { fed: null, name, holes: md.d1, gross: md.gross };
    }
  }
}

/* Sub-category scorecards (stored by fed or name) */
const MANUAL_HOLES_SUB14: Record<string, PlayerHoles> = {};
const _mhS14 = (tournData as any).manualHolesSub14 as Record<string, { holes: number[]; gross: number }> | undefined;
if (_mhS14) {
  for (const [key, md] of Object.entries(_mhS14)) {
    if (md.holes && md.holes.length >= 18) {
      const entry = ALL_DRAW.find(d => d.fed === key || d.name === key);
      MANUAL_HOLES_SUB14[key] = { fed: entry?.fed ?? null, name: entry?.name ?? key, holes: md.holes, gross: md.gross };
    }
  }
}

const MANUAL_HOLES_SUB12: Record<string, PlayerHoles> = {};
const _mhS12 = (tournData as any).manualHolesSub12 as Record<string, { holes: number[]; gross: number }> | undefined;
if (_mhS12) {
  for (const [key, md] of Object.entries(_mhS12)) {
    if (md.holes && md.holes.length >= 18) {
      const entry = ALL_DRAW.find(d => d.fed === key || d.name === key);
      MANUAL_HOLES_SUB12[key] = { fed: entry?.fed ?? null, name: entry?.name ?? key, holes: md.holes, gross: md.gross };
    }
  }
}

/* ─── Helpers ─── */
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
  return "sc-worse";  /* triple+ = deep blue */
}

/* Render a score as a proper circle (under par) or square (over par) */
function ScoreDot({ score, par }: { score: number | null; par: number }) {
  if (score == null) return <span className="sc-dot sc-empty">·</span>;
  const cls = scoreClass(score, par);
  const shape = (score - par) < 0 ? "sc-dot sc-circle" : "sc-dot sc-square";
  return <span className={`${shape} ${cls}`}>{score}</span>;
}

function isFemale(fed: string | null, name: string): boolean {
  const d = ALL_DRAW.find(dd => (fed && dd.fed === fed) || dd.name === name);
  return d?.sex === "F";
}

/* Tee ratings for this tournament – all from master-courses.json */
const TEE_RATINGS: Record<string, { cr: number; slope: number; par: number }> = {
  "Brancas_M": { cr: COURSE.cr, slope: COURSE.slope, par: COURSE.par },                          // 71.8 / 135
  "Azuis_F":   { cr: ((tournData as any).courseDataAzuis?.cr as number) || 76.3,
                 slope: ((tournData as any).courseDataAzuis?.slope as number) || 139, par: 72 },   // 76.3 / 139
  "Amarelas_M":{ cr: ((tournData as any).courseDataAmarelas?.cr as number) || 70.6,
                 slope: ((tournData as any).courseDataAmarelas?.slope as number) || 132, par: 72 },// 70.6 / 132
  "Vermelhas_M":{ cr: ((tournData as any).courseDataVermelhas?.cr as number) || 66.1,
                  slope: ((tournData as any).courseDataVermelhas?.slope as number) || 123, par: 72},// 66.1 / 123
  "Vermelhas_F":{ cr: 71.8, slope: 129, par: 72 },                                                // 71.8 / 129
  "Azuis_M":   { cr: 69.8, slope: 130, par: 72 },                                                 // fallback
};

function teeRating(teeColor: string, sex: string): { cr: number; slope: number; par: number } {
  const key = `${teeColor}_${sex}`;
  return TEE_RATINGS[key] || TEE_RATINGS[`${teeColor}_M`] || TEE_RATINGS["Brancas_M"];
}

function calcSD(gross: number, teeColor: string, sex: string): number {
  const r = teeRating(teeColor, sex);
  return (113 / r.slope) * (gross - r.cr);
}

function playerCategory(fed: string | null, name: string): "wagr" | "sub14" | "sub12" {
  if (DRAW_SUB12?.find(d => d.fed === fed || d.name === name)) return "sub12";
  if (DRAW_SUB14?.find(d => d.fed === fed || d.name === name)) return "sub14";
  return "wagr";
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

function isPja(fed: string | null): boolean { return !!fed && PJA.has(fed); }
function birthYear(fed: string | null): number | null { return fed ? BIRTH[fed] ?? null : null; }

function escalaoFromDob(year: number | null): string {
  if (!year) return "";
  const age = 2026 - year;
  if (age <= 10) return "Sub-10";
  if (age <= 12) return "Sub-12";
  if (age <= 14) return "Sub-14";
  if (age <= 16) return "Sub-16";
  if (age <= 18) return "Sub-18";
  if (age <= 21) return "Sub-21";
  return "Absoluto";
}

function fmtHcp(v: number | null): string {
  if (v == null) return "-";
  return v > 0 ? v.toFixed(1) : `+${Math.abs(v).toFixed(1)}`;
}

function fmtHcpPlay(v: number | null): string {
  if (v == null) return "-";
  return v > 0 ? String(v) : `+${Math.abs(v)}`;
}

/* ─── Password Gate ─── */
function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  const check = () => {
    if (pw === tournData.password) onUnlock();
    else { setError(true); setTimeout(() => setError(false), 1500); }
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

/* ─── Draw View ─── */
type DrawCat = "all" | "wagr" | "sub14" | "sub12";

function DrawTable({ draw, onSelectPlayer }: { draw: DrawEntry[]; onSelectPlayer?: (fed: string) => void }) {
  const groups = new Set(draw.map(d => `${d.time}-${d.group}`)).size;
  return (
    <>
      <div className="tourn-meta">{draw.length} jogadores · {groups} grupos</div>
      <div className="tourn-scroll">
        <table className="tourn-draw">
          <thead>
            <tr>
              <th style={{ width: 60 }}>Hora</th>
              <th style={{ width: 80 }}>Tee</th>
              <th>Jogador</th>
              <th className="r" style={{ width: 70 }}>HCP Ex.</th>
              <th className="r" style={{ width: 60 }}>HCP Jg</th>
            </tr>
          </thead>
          <tbody>
            {draw.map((d, i) => {
              const prev = draw[i - 1];
              const next = draw[i + 1];
              const isGroupStart = !prev || d.time !== prev.time || d.group !== prev.group;
              const isGroupEnd = !next || d.time !== next.time || d.group !== next.group;
              const year = birthYear(d.fed);
              const esc = escalaoFromDob(year);
              const pja = isPja(d.fed);
              const showTeeBadge = isGroupStart || d.teeColor !== prev?.teeColor;

              return (
                <tr key={i} className={`tourn-draw-row${isGroupStart ? " tourn-group-first" : ""}${isGroupEnd ? " tourn-group-last" : ""}${d.sex === "F" ? " tourn-female-row" : ""}`}>
                  <td className="tourn-draw-time">{isGroupStart ? d.time : ""}</td>
                  <td className="tourn-draw-tee">
                    {showTeeBadge && <TeePill name={d.teeColor} />}
                  </td>
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
                  <td className="r tourn-draw-hcp">{fmtHcpPlay(d.hcpPlay)}</td>
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

  /* Sub-14 and Sub-12 only play on Day 2 */
  const wagrDraw = day === 1 ? DRAW_R1 : (DRAW_R2 || DRAW_R1);
  const sub14Draw = day === 2 ? DRAW_SUB14 : null;
  const sub12Draw = day === 2 ? DRAW_SUB12 : null;
  const allDraw = [...wagrDraw, ...(sub14Draw || []), ...(sub12Draw || [])].sort((a, b) => a.time.localeCompare(b.time) || a.group - b.group);

  const cats: { key: DrawCat; label: string; count: number }[] = [
    { key: "all", label: "Todos", count: allDraw.length },
    { key: "wagr", label: "WAGR", count: wagrDraw.length },
  ];
  if (sub14Draw) cats.push({ key: "sub14", label: "Sub-14", count: sub14Draw.length });
  if (sub12Draw) cats.push({ key: "sub12", label: "Sub-12", count: sub12Draw.length });

  /* Reset cat if switching to day 1 and was on sub-category */
  const effectiveCat = (cat === "sub14" && !sub14Draw) || (cat === "sub12" && !sub12Draw) ? "all" : cat;

  let activeDraw: DrawEntry[];
  if (effectiveCat === "wagr") activeDraw = wagrDraw;
  else if (effectiveCat === "sub14") activeDraw = sub14Draw || [];
  else if (effectiveCat === "sub12") activeDraw = sub12Draw || [];
  else activeDraw = allDraw;

  return (
    <div className="tourn-section">
      {/* Day selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button className={`tourn-tab${day === 1 ? " tourn-tab-active" : ""}`} onClick={() => setDay(1)} style={{ fontSize: 11, padding: "4px 12px" }}>R1 — 15 Fev</button>
        {DRAW_R2 && <button className={`tourn-tab${day === 2 ? " tourn-tab-active" : ""}`} onClick={() => setDay(2)} style={{ fontSize: 11, padding: "4px 12px" }}>R2 — 16 Fev</button>}
      </div>

      {/* Category filter */}
      <div className="tourn-tabs">
        {cats.map(c => (
          <button key={c.key} className={`tourn-tab${effectiveCat === c.key ? " tourn-tab-active" : ""}`} onClick={() => setCat(c.key)}>
            {c.label} <span style={{ opacity: .6, fontSize: 11 }}>({c.count})</span>
          </button>
        ))}
      </div>

      <DrawTable draw={activeDraw} onSelectPlayer={onSelectPlayer} />
    </div>
  );
}

/* ─── Leaderboard with hole-by-hole ─── */
function PlayerLink({ fed, name, onSelect }: { fed: string | null; name: string; onSelect?: (fed: string) => void }) {
  if (fed && onSelect) {
    return <span className="tourn-pname tourn-pname-link" onClick={() => onSelect(fed)}>{name}</span>;
  }
  return <span className="tourn-pname">{name}</span>;
}

function getPlayerHoles(holeData: Map<string, PlayerHoles>, fed: string | null, name: string, extraManual?: Record<string, PlayerHoles>): PlayerHoles | undefined {
  if (fed && holeData.has(fed)) return holeData.get(fed);
  if (holeData.has(name)) return holeData.get(name);
  if (extraManual) {
    if (fed && extraManual[fed]) return extraManual[fed];
    if (extraManual[name]) return extraManual[name];
  }
  if (MANUAL_HOLES[name]) return MANUAL_HOLES[name];
  return undefined;
}

type SortKey = "pos" | "name" | "gross" | "toPar" | "out" | "in" | "sd";
type SortDir = "asc" | "desc";
type LbCat = "all" | "wagr" | "sub14" | "sub12";

/* Combined results row (for "all" view) */
type CombinedRow = ResultEntry & { catLabel: string; catKey: string; tee: string; cr: number; slope: number; sd: number | null };

function AllResultsView({ players, onSelectPlayer }: { players: PlayersDb; onSelectPlayer?: (fed: string) => void }) {
  const [sortKey, setSortKey] = useState<string>("sd");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [pjaOnly, setPjaOnly] = useState(false);

  /* Merge all results with tee-aware SD */
  const rows: CombinedRow[] = [];
  const addRows = (results: ResultEntry[], catLabel: string, catKey: string, defaultTee: string, defaultCr: number, defaultSlope: number) => {
    for (const r of results) {
      if (r.status !== "OK") continue;
      /* Use actual tee for females in WAGR/Sub-14 */
      const drawEntry = ALL_DRAW.find(d => (r.fed && d.fed === r.fed) || d.name === r.name);
      const sex = drawEntry?.sex || "M";
      const teeColor = drawEntry?.teeColor || defaultTee;
      const { cr, slope } = teeRating(teeColor, sex);
      const sd = r.gross != null ? Math.round((113 / slope) * (r.gross - cr) * 10) / 10 : null;
      rows.push({ ...r, catLabel, catKey, tee: teeColor, cr, slope, sd });
    }
  };
  addRows(D1, "WAGR", "wagr", "Brancas", COURSE.cr, COURSE.slope);
  if (COURSE_AMARELAS) addRows(D1_SUB14, "Sub-14", "sub14", "Amarelas", COURSE_AMARELAS.cr, COURSE_AMARELAS.slope);
  if (COURSE_VERMELHAS) addRows(D1_SUB12, "Sub-12", "sub12", "Vermelhas", COURSE_VERMELHAS.cr, COURSE_VERMELHAS.slope);

  let filtered = pjaOnly ? rows.filter(r => r.fed && PJA.has(r.fed)) : rows;
  const pjaCount = rows.filter(r => r.fed && PJA.has(r.fed)).length;

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "toPar": return ((a.toPar ?? 999) - (b.toPar ?? 999)) * dir;
      case "gross": return ((a.gross ?? 999) - (b.gross ?? 999)) * dir;
      case "sd": return ((a.sd ?? 999) - (b.sd ?? 999)) * dir;
      case "name": return a.name.localeCompare(b.name) * dir;
      case "cat": return a.catLabel.localeCompare(b.catLabel) * dir;
      default: return 0;
    }
  });

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }
  const arrow = (key: string) => sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const catColors: Record<string, string> = { wagr: "#2e5a10", sub14: "#b8860b", sub12: "#c0392b" };

  return (
    <div className="tourn-section">
      <div className="tourn-meta">{rows.length} jogadores · 3 categorias · ordenado por Score Differential</div>
      <div className="tourn-tabs" style={{ marginBottom: 12 }}>
        <button className={`tourn-tab${!pjaOnly ? " tourn-tab-active" : ""}`} onClick={() => setPjaOnly(false)}>
          Todos <span style={{ opacity: .6, fontSize: 11 }}>({rows.length})</span>
        </button>
        <button className={`tourn-tab${pjaOnly ? " tourn-tab-active" : ""}`} onClick={() => setPjaOnly(p => !p)} style={{ background: pjaOnly ? "#046A38" : undefined, color: pjaOnly ? "#FFD700" : undefined }}>
          PJA <span style={{ opacity: .6, fontSize: 11 }}>({pjaCount})</span>
        </button>
      </div>
      <div className="tourn-scroll">
        <table className="tourn-table tourn-form-table">
          <thead>
            <tr>
              <th className="r" style={{ width: 30 }}>#</th>
              <th className="sortable" onClick={() => toggleSort("name")} style={{ minWidth: 180 }}>Jogador{arrow("name")}</th>
              <th className="sortable" onClick={() => toggleSort("cat")} style={{ width: 70 }}>Categ.{arrow("cat")}</th>
              <th style={{ width: 65 }}>Tee</th>
              <th className="r sortable" style={{ width: 50 }} onClick={() => toggleSort("gross")}>Gross{arrow("gross")}</th>
              <th className="r sortable" style={{ width: 50 }} onClick={() => toggleSort("toPar")}>±Par{arrow("toPar")}</th>
              <th className="r sortable" style={{ width: 50 }} onClick={() => toggleSort("sd")}>SD{arrow("sd")}</th>
              <th style={{ width: 55 }}>Pos Cat</th>
              <th style={{ width: 130 }}>Clube</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const pja = r.fed ? PJA.has(r.fed) : false;
              const female = isFemale(r.fed, r.name);
              const year = birthYear(r.fed);
              const esc = escalaoFromDob(year);
              return (
                <tr key={i} className={`${female ? "tourn-female-row" : ""}`}>
                  <td className="r tourn-mono" style={{ fontWeight: 700, opacity: .5 }}>{i + 1}</td>
                  <td>
                    <div className="tourn-lb-pills">
                      <PlayerLink fed={r.fed} name={r.name} onSelect={onSelectPlayer} />
                      {pja && <span className="jog-pill tourn-pill-pja">PJA</span>}
                      {!r.fed && <span className="jog-pill tourn-pill-intl">INTL</span>}
                      {female && <span className="jog-pill jog-pill-sex-F">♀</span>}
                      {year && <span className="jog-pill jog-pill-birth">{year}</span>}
                    </div>
                  </td>
                  <td><span style={{ fontSize: 11, fontWeight: 700, color: catColors[r.catKey] || "#333", background: `${catColors[r.catKey] || "#333"}15`, padding: "1px 6px", borderRadius: 3 }}>{r.catLabel}</span></td>
                  <td><TeePill name={r.tee} /></td>
                  <td className="r tourn-mono" style={{ fontWeight: 700 }}>{r.gross}</td>
                  <td className={`r tourn-mono`}>
                    <span className={r.toPar != null && r.toPar <= 0 ? "tp-under" : r.toPar != null && r.toPar! <= 5 ? "tp-over1" : "tp-over2"} style={{ fontWeight: 700 }}>
                      {fmtToPar(r.toPar)}
                    </span>
                  </td>
                  <td className="r tourn-mono" style={{ fontSize: 11 }}>
                    {r.sd != null ? (
                      <span className={r.sd <= 0 ? "tp-under" : r.sd <= 5 ? "tp-over1" : r.sd <= 15 ? "" : "tp-over2"} style={{ fontWeight: 600 }}>{r.sd.toFixed(1)}</span>
                    ) : "—"}
                  </td>
                  <td className="r tourn-mono" style={{ fontSize: 12 }}>{r.pos}</td>
                  <td style={{ fontSize: 11, color: "#888" }}>{r.club}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeaderboardView({ players, holeData, onSelectPlayer }: { players: PlayersDb; holeData: Map<string, PlayerHoles>; onSelectPlayer?: (fed: string) => void }) {
  const [lbCat, setLbCat] = useState<LbCat>("wagr");
  const [escFilter, setEscFilter] = useState<string>("all");
  const [pjaOnly, setPjaOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("pos");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  /* Category-dependent data */
  const catResults = lbCat === "sub14" ? D1_SUB14 : lbCat === "sub12" ? D1_SUB12 : D1;
  const catHoles = lbCat === "sub14" ? HOLES_AMARELAS : lbCat === "sub12" ? HOLES_VERMELHAS : HOLES;
  const catCourse = lbCat === "sub14" ? (COURSE_AMARELAS || COURSE) : lbCat === "sub12" ? (COURSE_VERMELHAS || COURSE) : COURSE;
  const catTeeName = lbCat === "sub14" ? "Amarelas" : lbCat === "sub12" ? "Vermelhas" : "Brancas";
  const catTotalM = catHoles.reduce((s, h) => s + h.m, 0);
  const catParOut = catHoles.slice(0, 9).reduce((s, h) => s + h.par, 0);
  const catParIn = catHoles.slice(9).reduce((s, h) => s + h.par, 0);
  const hasResults = catResults.some(r => r.status === "OK");
  const catDay = lbCat === "wagr" ? "Dia 1" : "Dia 2";

  const allClassified = catResults.filter(r => r.status === "OK");
  const others = catResults.filter(r => r.status !== "OK" && r.status !== "pending");
  const pjaCount = allClassified.filter(r => r.fed && PJA.has(r.fed)).length;

  /* Collect available escalões (WAGR only) */
  const escSet = new Set<string>();
  if (lbCat === "wagr") {
    allClassified.forEach(r => {
      const yr = birthYear(r.fed);
      const esc = escalaoFromDob(yr);
      if (esc) escSet.add(esc);
    });
  }
  const escOptions = ["Sub-10","Sub-12","Sub-14","Sub-16","Sub-18","Sub-21","Absoluto"].filter(e => escSet.has(e));

  /* Filter */
  let filtered = escFilter === "all" ? allClassified : allClassified.filter(r => escalaoFromDob(birthYear(r.fed)) === escFilter);
  if (pjaOnly) filtered = filtered.filter(r => r.fed && PJA.has(r.fed));

  /* For pending categories, show starting list from draw */
  let pendingDraw = !hasResults
    ? (lbCat === "sub14" ? DRAW_SUB14 : lbCat === "sub12" ? DRAW_SUB12 : null) || []
    : [];
  if (pjaOnly && pendingDraw.length > 0) pendingDraw = pendingDraw.filter(d => d.fed && PJA.has(d.fed));

  /* Enrich for sorting */
  const catManualHoles = lbCat === "sub14" ? MANUAL_HOLES_SUB14 : lbCat === "sub12" ? MANUAL_HOLES_SUB12 : undefined;
  const enriched = filtered.map(r => {
    const ph = getPlayerHoles(holeData, r.fed, r.name, catManualHoles);
    const hasHoles = ph && ph.holes.length >= 18;
    const outScore = hasHoles ? ph.holes.slice(0, 9).reduce((s, v) => s + (v ?? 0), 0) : null;
    const inScore = hasHoles ? ph.holes.slice(9, 18).reduce((s, v) => s + (v ?? 0), 0) : null;
    const drawEntry = ALL_DRAW.find(d => (r.fed && d.fed === r.fed) || d.name === r.name);
    const sex = drawEntry?.sex ?? "M";
    const teeColor = drawEntry?.teeColor ?? catTeeName;
    const sd = r.gross != null ? calcSD(r.gross, teeColor, sex) : null;
    return { ...r, ph, hasHoles, outScore, inScore, sd };
  });

  /* Sort */
  const sorted = [...enriched].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "pos": return ((a.pos ?? 999) - (b.pos ?? 999)) * dir;
      case "name": return a.name.localeCompare(b.name) * dir;
      case "gross": return ((a.gross ?? 999) - (b.gross ?? 999)) * dir;
      case "toPar": return ((a.toPar ?? 999) - (b.toPar ?? 999)) * dir;
      case "out": return ((a.outScore ?? 999) - (b.outScore ?? 999)) * dir;
      case "in": return ((a.inScore ?? 999) - (b.inScore ?? 999)) * dir;
      case "sd": return ((a.sd ?? 999) - (b.sd ?? 999)) * dir;
      default: return 0;
    }
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }
  const arrow = (key: SortKey) => sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  /* Category tab counts */
  const wagrCount = D1.filter(r => r.status === "OK").length || DRAW_R1.length;
  const sub14Count = D1_SUB14.some(r => r.status === "OK") ? D1_SUB14.filter(r => r.status === "OK").length : DRAW_SUB14?.length || 0;
  const sub12Count = D1_SUB12.some(r => r.status === "OK") ? D1_SUB12.filter(r => r.status === "OK").length : DRAW_SUB12?.length || 0;

  return (
    <div className="tourn-section">
      {/* Category tabs */}
      <div className="tourn-tabs" style={{ marginBottom: 8 }}>
        <button className={`tourn-tab${lbCat === "all" ? " tourn-tab-active" : ""}`} onClick={() => { setLbCat("all"); setEscFilter("all"); setPjaOnly(false); }}>
          Todos <span style={{ opacity: .6, fontSize: 11 }}>({wagrCount + sub14Count + sub12Count})</span>
        </button>
        <button className={`tourn-tab${lbCat === "wagr" ? " tourn-tab-active" : ""}`} onClick={() => { setLbCat("wagr"); setEscFilter("all"); setPjaOnly(false); }}>
          WAGR <span style={{ opacity: .6, fontSize: 11 }}>({wagrCount})</span>
        </button>
        {sub14Count > 0 && <button className={`tourn-tab${lbCat === "sub14" ? " tourn-tab-active" : ""}`} onClick={() => { setLbCat("sub14"); setEscFilter("all"); setPjaOnly(false); }}>
          Sub-14 <span style={{ opacity: .6, fontSize: 11 }}>({sub14Count})</span>
        </button>}
        {sub12Count > 0 && <button className={`tourn-tab${lbCat === "sub12" ? " tourn-tab-active" : ""}`} onClick={() => { setLbCat("sub12"); setEscFilter("all"); setPjaOnly(false); }}>
          Sub-12 <span style={{ opacity: .6, fontSize: 11 }}>({sub12Count})</span>
        </button>}
      </div>

      {/* Combined results view */}
      {lbCat === "all" && <AllResultsView players={players} onSelectPlayer={onSelectPlayer} />}

      {/* Category-specific view */}
      {lbCat !== "all" && <>
      <div className="tourn-meta" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {catDay} · Par {catCourse.par} · CR {catCourse.cr} / Slope {catCourse.slope} · Vilamoura – Laguna · <TeePill name={catTeeName} /> {catTotalM}m
      </div>

      {/* Sub-filters: PJA for all categories, escalão for WAGR only */}
      <div className="tourn-tabs" style={{ marginBottom: 12 }}>
        <button className={`tourn-tab${escFilter === "all" && !pjaOnly ? " tourn-tab-active" : ""}`} onClick={() => { setEscFilter("all"); setPjaOnly(false); }}>
          Todos <span style={{ opacity: .6, fontSize: 11 }}>({allClassified.length || pendingDraw.length})</span>
        </button>
        <button className={`tourn-tab${pjaOnly ? " tourn-tab-active" : ""}`} onClick={() => { setPjaOnly(p => !p); setEscFilter("all"); }} style={{ background: pjaOnly ? "#046A38" : undefined, color: pjaOnly ? "#FFD700" : undefined }}>
          PJA <span style={{ opacity: .6, fontSize: 11 }}>({pjaCount || pendingDraw.filter(d => d.fed && PJA.has(d.fed)).length})</span>
        </button>
        {lbCat === "wagr" && escOptions.map(esc => {
          const count = allClassified.filter(r => escalaoFromDob(birthYear(r.fed)) === esc).length;
          return (
            <button key={esc} className={`tourn-tab${escFilter === esc && !pjaOnly ? " tourn-tab-active" : ""}`} onClick={() => { setEscFilter(esc); setPjaOnly(false); }}>
              {esc} <span style={{ opacity: .6, fontSize: 11 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* ── Results table (when we have scores) ── */}
      {hasResults && (
        <>
          <div className="tourn-scroll">
            <table className="tourn-table tourn-scorecard">
              <thead>
                <tr className="tourn-course-hdr">
                  <th className="tourn-pos-col sortable" onClick={() => toggleSort("pos")}>Pos{arrow("pos")}</th>
                  <th className="tourn-lb-name-col sortable" onClick={() => toggleSort("name")}>Jogador{arrow("name")}</th>
                  <th className="r tourn-gross-col sortable" onClick={() => toggleSort("gross")}>Tot{arrow("gross")}</th>
                  <th className="r tourn-par-col sortable" onClick={() => toggleSort("toPar")}>±Par{arrow("toPar")}</th>
                  {catHoles.slice(0, 9).map(h => (
                    <th key={h.h} className="r tourn-hole-col">{h.h}</th>
                  ))}
                  <th className="r tourn-sum-col sortable" onClick={() => toggleSort("out")}>OUT{arrow("out")}</th>
                  {catHoles.slice(9).map(h => (
                    <th key={h.h} className={`r tourn-hole-col${h.h === 10 ? " tourn-in-border" : ""}`}>{h.h}</th>
                  ))}
                  <th className="r tourn-sum-col sortable" onClick={() => toggleSort("in")}>IN{arrow("in")}</th>
                  <th className="r tourn-sum-col sortable" onClick={() => toggleSort("sd")} style={{ width: 48 }}>SD{arrow("sd")}</th>
                </tr>
                <tr className="tourn-par-row">
                  <td></td><td className="tourn-lbl">Par</td>
                  <td className="r">{catCourse.par}</td><td></td>
                  {catHoles.slice(0, 9).map(h => <td key={h.h} className="r">{h.par}</td>)}
                  <td className="r">{catParOut}</td>
                  {catHoles.slice(9).map(h => <td key={h.h} className={`r${h.h === 10 ? " tourn-in-border" : ""}`}>{h.par}</td>)}
                  <td className="r">{catParIn}</td>
                  <td></td>
                </tr>
                <tr className="tourn-dist-row">
                  <td></td><td className="tourn-lbl">Metros</td>
                  <td></td><td></td>
                  {catHoles.slice(0, 9).map(h => <td key={h.h} className="r">{h.m}</td>)}
                  <td className="r">{catHoles.slice(0,9).reduce((s,h) => s+h.m, 0)}</td>
                  {catHoles.slice(9).map(h => <td key={h.h} className={`r${h.h === 10 ? " tourn-in-border" : ""}`}>{h.m}</td>)}
                  <td className="r">{catHoles.slice(9).reduce((s,h) => s+h.m, 0)}</td>
                  <td></td>
                </tr>
                <tr className="tourn-si-row">
                  <td></td><td className="tourn-lbl">SI</td>
                  <td></td><td></td>
                  {catHoles.slice(0, 9).map(h => <td key={h.h} className="r">{h.si}</td>)}
                  <td></td>
                  {catHoles.slice(9).map(h => <td key={h.h} className={`r${h.h === 10 ? " tourn-in-border" : ""}`}>{h.si}</td>)}
                  <td></td>
                  <td></td>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const pja = isPja(r.fed);
                  const drawEntry = ALL_DRAW.find(d => (r.fed && d.fed === r.fed) || d.name === r.name);
                  const female = isFemale(r.fed, r.name);
                  const year = birthYear(r.fed);
                  const esc = escalaoFromDob(year);
                  const outToPar = r.outScore != null ? r.outScore - catParOut : null;
                  const inToPar = r.inScore != null ? r.inScore - catParIn : null;

                  return (
                    <tr key={i} className={`tourn-player-row${female ? " tourn-female-row" : ""}`}>
                      <td className="r tourn-pos">{r.pos}</td>
                      <td className="tourn-lb-name-col">
                        <div className="tourn-lb-pills">
                          <PlayerLink fed={r.fed} name={r.name} onSelect={onSelectPlayer} />
                          {pja && <span className="jog-pill tourn-pill-pja">PJA</span>}
                          {!r.fed && <span className="jog-pill tourn-pill-intl">INTL</span>}
                          {female && <><span className="jog-pill jog-pill-sex-F">♀</span><TeePill name={drawEntry?.teeColor ?? "Azuis"} /></>}
                          {lbCat === "wagr" && esc && <span className={`jog-pill jog-pill-escalao jog-pill-escalao-${esc.toLowerCase().replace("-", "")}`}>{esc}</span>}
                          {year && <span className="jog-pill jog-pill-birth">{year}</span>}
                          {drawEntry && <span className="jog-pill jog-pill-stats">{fmtHcp(drawEntry.hcpExact)}</span>}
                        </div>
                      </td>
                      <td className={`r tourn-sum-val ${r.toPar != null && r.toPar <= 0 ? "tourn-sum-under" : "tourn-sum-over"}`}>{r.gross ?? "-"}</td>
                      <td className={`r tourn-sum-val ${r.toPar != null && r.toPar <= 0 ? "tourn-sum-under" : "tourn-sum-over"}`}>
                        <span className={`tourn-topar ${r.toPar != null && r.toPar <= 0 ? "tp-under" : r.toPar != null && r.toPar <= 5 ? "tp-over1" : "tp-over2"}`}>
                          {fmtToPar(r.toPar)}
                        </span>
                      </td>
                      {/* Front 9 */}
                      {r.hasHoles ? r.ph!.holes.slice(0, 9).map((sc, hi) => (
                        <td key={hi} className="tourn-hole-cell">
                          <ScoreDot score={sc} par={catHoles[hi].par} />
                        </td>
                      )) : Array.from({ length: 9 }, (_, hi) => (
                        <td key={hi} className="tourn-hole-cell tourn-no-data">·</td>
                      ))}
                      {/* OUT */}
                      <td className={`r tourn-sum-val ${outToPar != null && outToPar <= 0 ? "tourn-sum-under" : "tourn-sum-over"}`}>
                        {r.outScore != null ? <>{r.outScore} <span className={`tourn-half-par ${outToPar! <= 0 ? "tp-under" : "tp-over1"}`}>({fmtToPar(outToPar)})</span></> : "-"}
                      </td>
                      {/* Back 9 */}
                      {r.hasHoles ? r.ph!.holes.slice(9, 18).map((sc, hi) => (
                        <td key={hi + 9} className={`tourn-hole-cell${hi === 0 ? " tourn-in-border" : ""}`}>
                          <ScoreDot score={sc} par={catHoles[hi + 9].par} />
                        </td>
                      )) : Array.from({ length: 9 }, (_, hi) => (
                        <td key={hi + 9} className={`tourn-hole-cell tourn-no-data${hi === 0 ? " tourn-in-border" : ""}`}>·</td>
                      ))}
                      {/* IN */}
                      <td className={`r tourn-sum-val ${inToPar != null && inToPar <= 0 ? "tourn-sum-under" : "tourn-sum-over"}`}>
                        {r.inScore != null ? <>{r.inScore} <span className={`tourn-half-par ${inToPar! <= 0 ? "tp-under" : "tp-over1"}`}>({fmtToPar(inToPar)})</span></> : "-"}
                      </td>
                      {/* SD */}
                      <td className="r tourn-sum-val" style={{ fontSize: 11 }}>
                        {r.sd != null ? (
                          <span className={r.sd <= 0 ? "tp-under" : r.sd <= 5 ? "tp-over1" : r.sd <= 15 ? "" : "tp-over2"} style={{ fontWeight: 600 }}>{r.sd.toFixed(1)}</span>
                        ) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {others.length > 0 && (
            <div className="tourn-others">
              <div className="tourn-others-title">NÃO TERMINARAM / NÃO PARTIRAM</div>
              {others.map((r, i) => (
                <div key={i} className="tourn-other-line">
                  <span className={`tourn-status ${r.status === "NS" ? "tourn-ns" : "tourn-nd"}`}>{r.status}</span>
                  {r.name} <span style={{ color: "#aaa" }}>— {r.club}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Starting list (when no results yet) ── */}
      {!hasResults && pendingDraw.length > 0 && (
        <>
          <div className="tourn-meta" style={{ marginTop: 10, color: "#e67e22", fontWeight: 600 }}>⏳ Resultados ainda não disponíveis — lista de partida</div>
          <div className="tourn-scroll" style={{ marginTop: 8 }}>
            <table className="tourn-table tourn-scorecard">
              <thead>
                <tr className="tourn-course-hdr">
                  <th style={{ width: 40 }}>#</th>
                  <th>Jogador</th>
                  <th className="r" style={{ width: 60 }}>HCP Ex.</th>
                  <th className="r" style={{ width: 60 }}>HCP Jg</th>
                  {catHoles.slice(0, 9).map(h => (
                    <th key={h.h} className="r tourn-hole-col">{h.h}</th>
                  ))}
                  <th className="r tourn-sum-col">OUT</th>
                  {catHoles.slice(9).map(h => (
                    <th key={h.h} className={`r tourn-hole-col${h.h === 10 ? " tourn-in-border" : ""}`}>{h.h}</th>
                  ))}
                  <th className="r tourn-sum-col">IN</th>
                </tr>
                <tr className="tourn-par-row">
                  <td></td><td className="tourn-lbl">Par</td><td></td><td></td>
                  {catHoles.slice(0, 9).map(h => <td key={h.h} className="r">{h.par}</td>)}
                  <td className="r">{catParOut}</td>
                  {catHoles.slice(9).map(h => <td key={h.h} className={`r${h.h === 10 ? " tourn-in-border" : ""}`}>{h.par}</td>)}
                  <td className="r">{catParIn}</td>
                </tr>
                <tr className="tourn-dist-row">
                  <td></td><td className="tourn-lbl">Metros</td><td></td><td></td>
                  {catHoles.slice(0, 9).map(h => <td key={h.h} className="r">{h.m}</td>)}
                  <td className="r">{catHoles.slice(0,9).reduce((s,h) => s+h.m, 0)}</td>
                  {catHoles.slice(9).map(h => <td key={h.h} className={`r${h.h === 10 ? " tourn-in-border" : ""}`}>{h.m}</td>)}
                  <td className="r">{catHoles.slice(9).reduce((s,h) => s+h.m, 0)}</td>
                </tr>
                <tr className="tourn-si-row">
                  <td></td><td className="tourn-lbl">SI</td><td></td><td></td>
                  {catHoles.slice(0, 9).map(h => <td key={h.h} className="r">{h.si}</td>)}
                  <td></td>
                  {catHoles.slice(9).map(h => <td key={h.h} className={`r${h.h === 10 ? " tourn-in-border" : ""}`}>{h.si}</td>)}
                  <td></td>
                </tr>
              </thead>
              <tbody>
                {pendingDraw.map((d, i) => {
                  const year = birthYear(d.fed);
                  const esc = escalaoFromDob(year);
                  const female = d.sex === "F";
                  const pja = isPja(d.fed);
                  return (
                    <tr key={i} className={`tourn-player-row${female ? " tourn-female-row" : ""}`}>
                      <td className="r tourn-pos" style={{ opacity: .5 }}>{i + 1}</td>
                      <td className="tourn-lb-name-col">
                        <div className="tourn-lb-pills">
                          <PlayerLink fed={d.fed} name={d.name} onSelect={onSelectPlayer} />
                          {pja && <span className="jog-pill tourn-pill-pja">PJA</span>}
                          {!d.fed && <span className="jog-pill tourn-pill-intl">INTL</span>}
                          {female && <><span className="jog-pill jog-pill-sex-F">♀</span><TeePill name={d.teeColor} /></>}
                          {esc && <span className={`jog-pill jog-pill-escalao jog-pill-escalao-${esc.toLowerCase().replace("-", "")}`}>{esc}</span>}
                          {year && <span className="jog-pill jog-pill-birth">{year}</span>}
                          {d.hcpExact != null && <span className="jog-pill jog-pill-stats">{fmtHcp(d.hcpExact)}</span>}
                        </div>
                      </td>
                      <td className="r tourn-mono">{fmtHcp(d.hcpExact)}</td>
                      <td className="r tourn-mono">{fmtHcpPlay(d.hcpPlay)}</td>
                      {Array.from({ length: 9 }, (_, hi) => (
                        <td key={hi} className="tourn-hole-cell tourn-no-data">·</td>
                      ))}
                      <td className="r tourn-sum-val tourn-sum-over">-</td>
                      {Array.from({ length: 9 }, (_, hi) => (
                        <td key={hi + 9} className={`tourn-hole-cell tourn-no-data${hi === 0 ? " tourn-in-border" : ""}`}>·</td>
                      ))}
                      <td className="r tourn-sum-val tourn-sum-over">-</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      </>}
    </div>
  );
}

/* ─── Analysis ─── */
type AnalysisCat = "wagr" | "sub14" | "sub12";
const TREND_ICONS: Record<string, string> = { up: "📈", stable: "➡️", down: "📉", unknown: "—" };
const TREND_LABELS: Record<string, string> = { up: "Em forma", stable: "Estável", down: "Em baixa", unknown: "Sem dados" };

function AnalysisView({ players, holeData, playerHistory, onSelectPlayer }: { players: PlayersDb; holeData: Map<string, PlayerHoles>; playerHistory: Map<string, PlayerForm>; onSelectPlayer?: (fed: string) => void }) {
  const [cat, setCat] = useState<AnalysisCat>("wagr");

  /* Category data */
  const allForms = Array.from(playerHistory.values());
  const catForms = allForms.filter(f => f.category === cat);
  const classified = D1.filter(r => r.status === "OK" && r.gross != null);

  /* ── KPIs (WAGR only for D1 data) ── */
  const wagrForms = allForms.filter(f => f.category === "wagr");
  const grosses = classified.map(r => r.gross!);
  const avg = grosses.length > 0 ? grosses.reduce((a, b) => a + b, 0) / grosses.length : 0;
  const sds = wagrForms.filter(f => f.d1SD != null).map(f => f.d1SD!);
  const avgSD = sds.length > 0 ? sds.reduce((a, b) => a + b, 0) / sds.length : null;
  const sdStdDev = sds.length > 2 ? Math.sqrt(sds.reduce((s, v) => s + (v - avgSD!) ** 2, 0) / sds.length) : null;
  const under = classified.filter(r => r.toPar! <= 0).length;
  const pjaResults = classified.filter(r => r.fed && PJA.has(r.fed));

  /* Category player list: sorted by D1 pos (if available), then by trend quality */
  const sorted = [...catForms].sort((a, b) => {
    if (a.d1Pos != null && b.d1Pos != null) return a.d1Pos - b.d1Pos;
    if (a.d1Pos != null) return -1;
    if (b.d1Pos != null) return 1;
    const tOrd: Record<string, number> = { up: 0, stable: 1, unknown: 2, down: 3 };
    return (tOrd[a.trend] ?? 2) - (tOrd[b.trend] ?? 2);
  });

  /* Hole difficulty (WAGR scorecards) */
  const allHoleData = new Map(holeData);
  Object.entries(MANUAL_HOLES).forEach(([k, v]) => { if (!allHoleData.has(k)) allHoleData.set(k, v); });
  const holeDiff = HOLES.map((h, i) => {
    const scores: number[] = [];
    allHoleData.forEach(ph => { if (ph.holes[i] != null) scores.push(ph.holes[i]!); });
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
      {/* Category tabs */}
      <div className="tourn-tabs" style={{ marginBottom: 14 }}>
        {(["wagr", "sub14", "sub12"] as AnalysisCat[]).filter(c => catCounts[c] > 0).map(c => (
          <button key={c} className={`tourn-tab${cat === c ? " tourn-tab-active" : ""}`} onClick={() => setCat(c)}>
            {c === "wagr" ? "WAGR" : c === "sub14" ? "Sub-14" : "Sub-12"} <span style={{ opacity: .6, fontSize: 11 }}>({catCounts[c]})</span>
          </button>
        ))}
      </div>

      {/* KPIs (show D1 stats for WAGR) */}
      {cat === "wagr" && grosses.length > 0 && (
        <div className="tourn-kpis">
          {[
            { label: "Melhor Gross", val: Math.min(...grosses), sub: classified.find(r => r.gross === Math.min(...grosses))?.name },
            { label: "Média Campo", val: avg.toFixed(1), sub: `${classified.length} jog.` },
            { label: "Under/Even", val: `${under} de ${classified.length}` },
            { label: "SD Médio", val: avgSD?.toFixed(1) ?? "—", sub: sdStdDev ? `σ ${sdStdDev.toFixed(1)}` : undefined },
            { label: "Média PJA", val: pjaResults.length > 0 ? (pjaResults.reduce((a, r) => a + r.gross!, 0) / pjaResults.length).toFixed(1) : "—", sub: `${pjaResults.length} jog.` },
          ].map((k, i) => (
            <div key={i} className="tourn-kpi">
              <div className="tourn-kpi-lbl">{k.label}</div>
              <div className="tourn-kpi-val">{k.val}</div>
              {k.sub && <div className="tourn-kpi-sub">{k.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Player form table */}
      {sorted.length > 0 ? (
        <>
          <h3 className="tourn-h3">Forma dos Jogadores — {cat === "wagr" ? "WAGR" : cat === "sub14" ? "Sub-14" : "Sub-12"}</h3>
          <div className="tourn-meta">{sorted.length} jogadores com histórico na app · dados pré-torneio</div>
          <div className="tourn-scroll">
            <table className="tourn-table tourn-form-table">
              <thead>
                <tr>
                  {cat === "wagr" && <th className="r" style={{ width: 30 }}>Pos</th>}
                  <th>Jogador</th>
                  <th className="r" style={{ width: 42 }}>HCP</th>
                  {cat === "wagr" && <th className="r" style={{ width: 40 }}>D1</th>}
                  {cat === "wagr" && <th className="r" style={{ width: 40 }}>SD</th>}
                  <th className="r" style={{ width: 45 }}>Últ. Jg</th>
                  <th style={{ width: 220 }}>Últimas Rondas (SD)</th>
                  <th style={{ width: 60 }}>Forma</th>
                  <th className="r" style={{ width: 50 }}>R2 Est.</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f, i) => {
                  const pja = f.fed ? PJA.has(f.fed) : false;
                  const female = isFemale(f.fed, f.name);
                  return (
                    <tr key={i} className={`${female ? "tourn-female-row" : ""}`}>
                      {cat === "wagr" && <td className="r tourn-mono" style={{ fontWeight: 700 }}>{f.d1Pos ?? "—"}</td>}
                      <td>
                        <PlayerLink fed={f.fed} name={f.name} onSelect={onSelectPlayer} />
                        {pja && <span className="jog-pill tourn-pill-pja" style={{ marginLeft: 4 }}>PJA</span>}
                        <span className={`jog-pill jog-pill-escalao jog-pill-escalao-${f.escalao.toLowerCase().replace("-", "")}`} style={{ marginLeft: 4, fontSize: 9 }}>{f.escalao}</span>
                      </td>
                      <td className="r tourn-mono">{fmtHcp(f.hcpExact)}</td>
                      {cat === "wagr" && (
                        <td className="r tourn-mono" style={{ fontWeight: 700 }}>
                          {f.d1Gross != null ? (
                            <><span>{f.d1Gross}</span> <span className={f.d1ToPar! <= 0 ? "tp-under" : "tp-over1"} style={{ fontSize: 10 }}>({fmtToPar(f.d1ToPar)})</span></>
                          ) : "—"}
                        </td>
                      )}
                      {cat === "wagr" && (
                        <td className="r tourn-mono" style={{ fontSize: 11 }}>
                          {f.d1SD != null ? (
                            <span className={f.d1SD <= 0 ? "tp-under" : f.d1SD <= 5 ? "tp-over1" : "tp-over2"} style={{ fontWeight: 600 }}>{f.d1SD.toFixed(1)}</span>
                          ) : "—"}
                        </td>
                      )}
                      <td className="r" style={{ fontSize: 11 }}>
                        {f.daysSinceLast != null ? (
                          <span style={{ color: f.daysSinceLast <= 7 ? "#16a34a" : f.daysSinceLast <= 21 ? "#e67e22" : "#dc3545" }}>
                            {f.daysSinceLast}d
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        <div className="tourn-sparkline">
                          {f.recentRounds.slice(0, 5).reverse().map((r, ri) => (
                            <span key={ri} className={`tourn-spark-dot ${r.sd != null ? (r.sd <= 0 ? "spark-green" : r.sd <= 10 ? "spark-amber" : "spark-red") : "spark-grey"}`}
                              title={`${r.date} · ${r.course}\nGross: ${r.gross} · Par: ${r.par} · SD: ${r.sd?.toFixed(1) ?? "—"}`}>
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
                      <td className="r tourn-mono" style={{ fontWeight: 700, fontSize: 13 }}>
                        {f.predictedGross ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="tourn-meta" style={{ padding: 20, textAlign: "center" }}>⏳ A carregar dados de jogadores...</div>
      )}

      {/* Hole difficulty (WAGR scorecards) */}
      {cat === "wagr" && holeDiff[0].n > 0 && <>
        <h3 className="tourn-h3">Dificuldade por Buraco</h3>
        <div className="tourn-meta">{holeDiff[0].n} scorecards · ordenado do mais fácil ao mais difícil</div>
        <div className="tourn-scroll">
          <table className="tourn-table tourn-form-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>Buraco</th>
                <th className="r" style={{ width: 30 }}>Par</th>
                <th className="r" style={{ width: 30 }}>SI</th>
                <th className="r" style={{ width: 50 }}>Dist</th>
                <th className="r" style={{ width: 50 }}>Média</th>
                <th className="r" style={{ width: 50 }}>vs Par</th>
                <th style={{ width: 180 }}>Distribuição</th>
              </tr>
            </thead>
            <tbody>
              {[...holeDiff].sort((a, b) => ((a.avg ?? 0) - a.par) - ((b.avg ?? 0) - b.par)).map((h, i) => {
                const vp = h.avg != null ? h.avg - h.par : null;
                return (
                  <tr key={i}>
                    <td className="tourn-mono" style={{ fontWeight: 700 }}>{h.hole}</td>
                    <td className="r">{h.par}</td>
                    <td className="r" style={{ color: "#aaa" }}>{h.si}</td>
                    <td className="r tourn-mono">{h.m}</td>
                    <td className="r tourn-mono" style={{ fontWeight: 700 }}>{h.avg?.toFixed(1) ?? "—"}</td>
                    <td className="r">
                      {vp != null && <span style={{ color: vp <= 0 ? "#16a34a" : vp < 0.5 ? "#e67e22" : "#dc3545", fontWeight: 600 }}>
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

/* ─── Main ─── */
export default function TorneioPage({ players, onSelectPlayer }: { players: PlayersDb; onSelectPlayer?: (fed: string) => void }) {
  const [unlocked, setUnlocked] = useState(false);
  const [view, setView] = useState<TournView>("leaderboard");
  const [holeData, setHoleData] = useState<Map<string, PlayerHoles>>(new Map());
  const [playerHistory, setPlayerHistory] = useState<Map<string, PlayerForm>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadCount, setLoadCount] = useState(0);

  const fedList = useMemo(() => [...new Set(ALL_DRAW.filter(d => d.fed).map(d => d.fed!))], []);
  const TOURN_DATE = new Date((tournData.dates as string[])[0]); // 2026-02-15

  useEffect(() => {
    if (!unlocked || holeData.size > 0) return;
    setLoading(true);
    let count = 0;

    const loadAll = async () => {
      const hMap = new Map<string, PlayerHoles>();
      const fMap = new Map<string, PlayerForm>();

      for (let i = 0; i < fedList.length; i += 4) {
        const batch = fedList.slice(i, i + 4);
        const results = await Promise.allSettled(batch.map(fed => loadPlayerData(fed)));

        results.forEach((res, j) => {
          const fed = batch[j];
          if (res.status !== "fulfilled") return;
          const data: PlayerPageData = res.value;
          const drawEntry = ALL_DRAW.find(dd => dd.fed === fed);
          if (!drawEntry) return;

          /* ── Extract ALL recent rounds (pre-tournament) ── */
          /* Pipeline date format is DD-MM-YYYY, tournament dates are YYYY-MM-DD */
          const tournDatesDD = new Set((tournData.dates as string[]).map(d => {
            const [y, m, dd] = d.split("-");
            return `${dd}-${m}-${y}`;
          }));
          const allRounds: RecentRound[] = [];
          for (const c of data.DATA) {
            for (const r of c.rounds) {
              const g = typeof r.gross === "number" ? r.gross : null;
              if (g == null || g <= 0 || r.holeCount !== 18) continue;
              const sd = typeof r.sd === "number" ? r.sd : null;
              allRounds.push({
                date: r.date,           // DD-MM-YYYY from pipeline
                dateSort: r.dateSort,
                course: c.course,
                gross: g,
                par: typeof r.par === "number" ? r.par : 72,
                sd,
              });
            }
          }
          allRounds.sort((a, b) => b.dateSort - a.dateSort); // newest first

          /* Split: pre-tournament rounds vs tournament rounds */
          const preTourn = allRounds.filter(r => !tournDatesDD.has(r.date));
          const recent = preTourn.slice(0, 15);

          /* Days since last round */
          const lastDate = recent.length > 0 ? new Date(recent[0].dateSort) : null;
          const daysSince = lastDate ? Math.round((TOURN_DATE.getTime() - lastDate.getTime()) / 86400000) : null;

          /* Average SD of last 5 */
          const recentSDs = recent.filter(r => r.sd != null).slice(0, 5).map(r => r.sd!);
          const avgSD5 = recentSDs.length > 0 ? recentSDs.reduce((a, b) => a + b, 0) / recentSDs.length : null;

          /* D1 result */
          const d1 = D1.find(dd => dd.fed === fed);
          const sex = drawEntry.sex || "M";
          const d1SD = d1?.gross != null ? calcSD(d1.gross, drawEntry.teeColor, sex) : null;
          const cat = playerCategory(fed, drawEntry.name);

          /* Prediction: blend recent form + D1 (use player's actual tee ratings) */
          let predicted: number | null = null;
          const { cr, slope: sl } = teeRating(drawEntry.teeColor, sex);
          if (avgSD5 != null && d1SD != null) {
            const blendSD = d1SD * 0.4 + avgSD5 * 0.6;
            predicted = Math.round(cr + blendSD * sl / 113);
          } else if (avgSD5 != null) {
            predicted = Math.round(cr + avgSD5 * sl / 113);
          } else if (d1?.gross != null) {
            predicted = d1.gross;
          }

          const form: PlayerForm = {
            fed, name: drawEntry.name, club: drawEntry.club,
            hcpExact: drawEntry.hcpExact,
            escalao: escalaoFromDob(birthYear(fed)),
            teeColor: drawEntry.teeColor,
            recentRounds: recent,
            daysSinceLast: daysSince,
            avgSD5,
            trend: trendFromRounds(recent),
            d1Gross: d1?.gross ?? null,
            d1ToPar: d1?.toPar ?? null,
            d1SD: d1SD != null ? Math.round(d1SD * 10) / 10 : null,
            d1Pos: d1?.pos ?? null,
            predictedGross: predicted,
            category: cat,
          };
          fMap.set(fed, form);

          /* ── Tournament hole-by-hole (original logic) ── */
          for (const c of data.DATA) {
            const cLower = c.course.toLowerCase();
            if (!cLower.includes("laguna") && !cLower.includes("vilamoura")) continue;
            for (const r of c.rounds) {
              if (!tournDatesDD.has(r.date)) continue;
              const hs: HoleScores | undefined = data.HOLES[r.scoreId];
              if (!hs || !hs.g || hs.g.length < 18) continue;
              const holes18 = hs.g.slice(0, 18);
              const holesGross = holes18.reduce((s, v) => s + (v ?? 0), 0);
              const officialResult = D1.find(dd => dd.fed === fed);
              if (officialResult && officialResult.gross != null && holesGross !== officialResult.gross) {
                console.warn(`Scorecard mismatch for ${fed}: holes sum ${holesGross} vs official ${officialResult.gross}, skipping`);
                continue;
              }
              hMap.set(fed, { fed, name: drawEntry.name, holes: holes18, gross: r.gross as number });
            }
          }

          count++;
          setLoadCount(count);
        });
      }
      setHoleData(hMap);
      setPlayerHistory(fMap);
      setLoading(false);
    };

    loadAll();
  }, [unlocked]);

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="tourn-page">
      {/* Header */}
      <div className="tourn-header">
        <div className="tourn-header-top">
          <span className="tourn-pill-intl" style={{ fontSize: 9, padding: "2px 6px" }}>🌍 INTL</span>
          <h2 className="tourn-title">{tournData.name}</h2>
        </div>
        <div className="tourn-header-info">
          <span>📍 {tournData.course}</span>
          <span>📅 {tournData.dates.join(" → ")}</span>
          <span>👥 {ALL_DRAW.length} jogadores</span>
          <span>🏌️ 3 dias (D1 ✅ · D2 hoje)</span>
          {loading && <span className="tourn-loading">⏳ Scorecards {loadCount}/{fedList.length}</span>}
          {!loading && holeData.size > 0 && <span className="tourn-loaded">✓ {holeData.size + Object.keys(MANUAL_HOLES).length + Object.keys(MANUAL_HOLES_SUB14).length + Object.keys(MANUAL_HOLES_SUB12).length} scorecards</span>}
        </div>
        {/* External links – grouped by category */}
        {tournData.links && (() => {
          const links = tournData.links as Record<string, string>;
          const groups: { label: string; keys: string[]; labels: Record<string, string> }[] = [
            { label: "WAGR", keys: ["draw_wagr_r1","draw_wagr_r2","draw_wagr_r3","results_wagr"],
              labels: { draw_wagr_r1:"Draw R1", draw_wagr_r2:"Draw R2", draw_wagr_r3:"Draw R3", results_wagr:"Results" }},
            { label: "Sub-14", keys: ["draw_sub14","draw_sub14_r2","results_sub14"],
              labels: { draw_sub14:"Draw R1", draw_sub14_r2:"Draw R2", results_sub14:"Results" }},
            { label: "Sub-12", keys: ["draw_sub12","draw_sub12_r2","results_sub12"],
              labels: { draw_sub12:"Draw R1", draw_sub12_r2:"Draw R2", results_sub12:"Results" }},
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
                        {g.labels[k] || k}<span style={{ fontSize: 9, opacity: .6 }}> ↗</span>
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
      {view === "leaderboard" && <LeaderboardView players={players} holeData={holeData} onSelectPlayer={onSelectPlayer} />}
      {view === "analysis" && <AnalysisView players={players} holeData={holeData} playerHistory={playerHistory} onSelectPlayer={onSelectPlayer} />}
    </div>
  );
}
