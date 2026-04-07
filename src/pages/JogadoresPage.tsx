import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import type { Player, Course, SexFilter } from "../data/types";
import { useAppContext } from "../context/AppContext";
import { norm, shortDate, fD, fD2, firstName, fmtSign, fmtToPar } from "../utils/format";
import { getTeeHex, textOnColor, normKey, teeBorder } from "../utils/teeColors";
import { clubShort, clubLong, hcpDisplay } from "../utils/playerUtils";
import { numSafe, meanArr, stdevArr, sumArr, minArr, maxArr, linearSlope } from "../utils/mathUtils";
import { scClass, fmtGrossDelta, fmtStb, sdClassByHcp, fmtSdVal, sc2, sc3m, SC, toParClass } from "../utils/scoreDisplay";
import {
  type PlayerPageData, type CourseData, type RoundData,
  type EclecticEntry, type HoleStatsData,
  type CrossPlayerData, type HcpInfo, type HoleScores,
} from "../data/playerDataLoader";
import { usePlayerData } from "../data/usePlayerData";
import SexBadge from "../ui/SexBadge";
import TeePill from "../ui/TeePill";
import TeeDate from "../ui/TeeDate";
import ScoreCircle from "../ui/ScoreCircle";
import LoadingState from "../ui/LoadingState";
import SidebarToggle from "../ui/SidebarToggle";
import { useMasterDetail } from "../hooks/useMasterDetail";
import { loadPlayerStats, daysSince, type PlayerStatsDb } from "../data/playerStatsTypes";
import { calcSD } from "../utils/whsCalc";
import { PillBadge } from "../ui/PillBadge";

/* ────────────────────────────────────────────────────────────────────────────────────
   Utility functions (port from client JS)
   ──────────────────────────────────────────────────────────────────────────────────── */


type SortKey = "name" | "hcp" | "club" | "escalao" | "ranking" | "rounds";
type ViewKey = "by_course" | "by_course_analysis" | "by_date" | "by_tournament" | "analysis";
type CourseSort = "last_desc" | "count_desc" | "name_asc";

/* —— Course key lookup: course display name → courseKey for /campos/:courseKey —— */
let _courseKeyMap: Map<string, string> = new Map();
function buildCourseKeyMap(courses: Course[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of courses) {
    m.set(norm(c.master.name), c.courseKey);
    m.set(norm(c.courseKey), c.courseKey);
  }
  return m;
}
function findCourseKey(courseName: string): string | null {
  return _courseKeyMap.get(norm(courseName)) ?? null;
}
/** Normaliza escalão para classe CSS: "Sénior" → "senior", "Sub-14" → "sub14" */
function escCls(esc: string): string {
  return esc.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const scHostStyle: React.CSSProperties = { margin: "6px 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", background: "var(--bg-card)", padding: 10, overflow: "hidden" };

/* ────────────────────────────────────────────────────────────────────────────────────────
   Micro-components
   ──────────────────────────────────────────────────────────────────────────────────────── */

function GrossCell({ gross, par }: { gross: number | null; par: number | null }) {
  const { text, delta, cls } = fmtGrossDelta(gross, par);
  if (!text) return null;
  return <><b>{text}</b>{delta && <span className={`score-delta ${cls}`}>{delta}</span>}</>;
}

function SdCell({ round }: { round: RoundData }) {
  const { text, cls } = fmtSdVal(round);
  if (!text) return null;
  return <span className={`p p-${cls}`}>{text}</span>;
}

function HoleBadge({ hc }: { hc: number }) {
  return hc === 9
    ? <span className="hb hb9">9</span>
    : <span className="hb hb18">18</span>;
}

/** Retorna a pill efectiva: usa _pill dos dados ou auto-detecta INTL */
function effectivePill(round: { _pill?: string; course?: string; scoreOrigin?: string }, courseName?: string): string {
  if (round._pill) return round._pill;
  const o = (round.scoreOrigin || "").trim().toUpperCase();
  if (o === "INTERN") return "INTL";
  const c = (courseName || round.course || "").trim().toUpperCase();
  if (c === "INTERNACIONAL" || c === "INTERNATIONAL") return "INTL";
  return "";
}

/* ScoreCircle imported from src/ui/ */

/* ─── Origin Pill (EDS / Treino / Extra / Import / Indiv) ─── */
const ORIGIN_MAP: Record<string, { label: string; cls: string }> = {
  EDS:     { label: "EDS",     cls: "p p-sm p-origin p-eds" },
  IMPORT:  { label: "IMPORT",  cls: "p p-sm p-origin p-import" },
  INDIV:   { label: "INDIV",   cls: "p p-sm p-origin p-indiv" },
  TREINO:  { label: "TREINO",  cls: "p p-sm p-origin p-treino" },
  EXTRA:   { label: "EXTRA",   cls: "p p-sm p-origin p-extra" },
};
function OriginPill({ origin }: { origin?: string }) {
  if (!origin) return null;
  const key = origin.trim().toUpperCase();
  // "Torn" = torneio normal, "Intern" = tratado pelo effectivePill/PillBadge
  if (!key || key === "TORN" || key === "INTERN") return null;
  const entry = ORIGIN_MAP[key];
  if (!entry) return null;
  return <span className={entry.cls}>{entry.label}</span>;
}

/* ─── External Links (classificação, etc.) ─── */
function LinkBtns({ links }: { links?: Record<string, string> }) {
  if (!links || Object.keys(links).length === 0) return null;
  return (
    <>
      {Object.entries(links).map(([label, url]) => (
        <a
          key={label}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={label.replace(/_/g, " ")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: 10, marginLeft: 4, color: "var(--chart-2)", textDecoration: "none",
            verticalAlign: "middle",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          🔗
        </a>
      ))}
    </>
  );
}

/* ─── Combined event info: name + EDS badge + pill + links ─── */
function EventInfo({ name, origin, pill, links }: {
  name?: string; origin?: string; pill?: string; links?: Record<string, string>;
}) {
  return (
    <>
      <span className="muted">{name || ""}</span>
      <OriginPill origin={origin} />
      <PillBadge pill={pill} />
      <LinkBtns links={links} />
    </>
  );
}

/* ─── Course name link → /campos/:courseKey (abre em nova janela) ─── */
function CourseLink({ name }: { name: string }) {
  const key = findCourseKey(name);
  if (!key) return <>{name}</>;
  return (
    <a href={`/campos/${key}`} className="courseLink" title={`Ver campo: ${name}`}
       target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
      {name}
    </a>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   By Date View
   ──────────────────────────────────────────────────────────────────────────────────────── */

function ByDateView({ data, search }: {
  data: PlayerPageData; search: string;
}) {
  const [openScorecardId, setOpenScorecardId] = useState<string | null>(null);

  const all = useMemo(() => {
    const term = norm(search);
    let rounds: (RoundData & { course: string })[] = [];
    data.DATA.forEach(c => {
      c.rounds.forEach(r => {
        rounds.push({ ...r, course: c.course });
      });
    });
    if (term) {
      rounds = rounds.filter(x =>
        norm(x.course).includes(term) || norm(x.eventName || "").includes(term)
      );
    }
    rounds.sort((a, b) => (b.dateSort - a.dateSort) || String(b.scoreId).localeCompare(String(a.scoreId)));
    return rounds;
  }, [data, search]);

  return (
    <div className="table-wrap">
      <table className="dtable-lg">
        <colgroup>
          <col className="col-p9" /><col className="col-p18" /><col className="col-p13" />
          <col className="col-p6" /><col className="col-p7" /><col className="col-p10" />
          <col className="col-p8" /><col className="col-p9" /><col className="col-p7" /><col className="col-p7" />
        </colgroup>
        <thead>
          <tr>
            <th>Data</th><th>Campo</th><th>Prova</th>
            <th className="r">Bur.</th><th className="r">HCP</th><th>Tee</th>
            <th className="r">Dist.</th><th className="r">Gross</th><th className="r">Stb</th><th className="r">SD</th>
          </tr>
        </thead>
        <tbody>
          {all.map((r, idx) => {
            const isOpen = openScorecardId === r.scoreId;
            const toggle = () => setOpenScorecardId(isOpen ? null : r.scoreId);
            const holes = data.HOLES[String(r.scoreId)];
            const courseKey = norm(r.course);
            const teeKey = r.teeKey || normKey(r.tee || "");
            const ecEntry = data.ECDET?.[courseKey]?.[teeKey] || null;
            const year = r.date ? r.date.slice(-4) : null;
            const prevYear = idx > 0 && all[idx - 1].date ? all[idx - 1].date.slice(-4) : null;
            const showYearBar = year && prevYear && year !== prevYear;

            return (
              <React.Fragment key={r.scoreId}>
                {showYearBar && (
                  <tr>
                    <td colSpan={10} style={{ padding: 0, background: "var(--bg-header)", borderBottom: "2px solid var(--border)" }}>
                      <div className="uppercase" style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "var(--text-2)", letterSpacing: "0.04em" }}>
                        {year}
                      </div>
                    </td>
                  </tr>
                )}
                <tr className={`roundRow${isOpen ? " pa-row-open" : ""}`}
                  onClick={() => r.hasCard && toggle()}
                  style={{ cursor: r.hasCard ? "pointer" : "default" }}>
                  <td>
                    {r.hasCard
                      ? <a href="#" onClick={e => { e.preventDefault(); toggle(); }}><TeeDate date={r.date} tee={r.tee || ""} /></a>
                      : <TeeDate date={r.date} tee={r.tee || ""} />}
                    <div className="muted fs-10">#{r.scoreId}</div>
                  </td>
                  <td><CourseLink name={r.course} /></td>
                  <td><EventInfo name={r.eventName} origin={r.scoreOrigin} pill={effectivePill(r)} links={r._links} /></td>
                  <td className="r"><HoleBadge hc={r.holeCount} /></td>
                  <td className="r">{r.hi ?? ""}</td>
                  <td><TeePill name={r.tee || ""} /></td>
                  <td className="r muted">{r.meters ? `${r.meters}m` : ""}</td>
                  <td className="r"><GrossCell gross={r.gross} par={r.par} /></td>
                  <td className="r">{fmtStb(r.stb, r.holeCount)}</td>
                  <td className="r"><SdCell round={r} /></td>
                </tr>
                {isOpen && holes && (
                  <tr>
                    <td colSpan={10} className="bg-page p-0">
                      <div className="scHost" style={scHostStyle}>
                        <ScorecardTable
                          holes={holes}
                          courseName={r.course}
                          date={r.date}
                          tee={r.tee || ""}
                          hi={r.hi}
                          links={r._links}
                          pill={effectivePill(r)}
                          eclecticEntry={ecEntry}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      {all.length === 0 && <div className="muted p-16">Nenhuma ronda encontrada</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   By Course View
   ──────────────────────────────────────────────────────────────────────────────────────── */

/* ─── Tee Summary Table (compact, for simple by_course view) ─── */
function TeeSummaryTable({ rounds }: { rounds: RoundData[] }) {
  const tees = useMemo(() => {
    const map: Record<string, { tee: string; count: number; gross: number[]; stb: number[]; sd: number[]; hi: (number | null)[] }> = {};
    rounds.forEach(r => {
      const tk = normKey(r.tee || "?");
      if (!map[tk]) map[tk] = { tee: r.tee || "?", count: 0, gross: [], stb: [], sd: [], hi: [] };
      map[tk].count++;
      const g = numSafe(r.gross);
      if (g != null && g > 30) map[tk].gross.push(g);
      const s = numSafe(r.stb);
      if (s != null) map[tk].stb.push(s);
      const d = numSafe(r.sd);
      if (d != null) map[tk].sd.push(d);
      map[tk].hi.push(r.hi != null ? Number(r.hi) : null);
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [rounds]);

  if (tees.length <= 1) return null; // No point showing if only 1 tee

  return (
    <div className="card mb-10">
      <div className="sc-bar-head"><span>Resumo por Tee</span></div>
      <table className="dtable-lg" style={{ fontSize: 12, marginBottom: 0 }}>
        <thead>
          <tr>
            <th>Tee</th>
            <th className="r">Rondas</th>
            <th className="r">Melhor</th>
            <th className="r">Média Gr.</th>
            <th className="r">Média Stb</th>
            <th className="r">Média SD</th>
          </tr>
        </thead>
        <tbody>
          {tees.map(t => {
            const avgG = meanArr(t.gross);
            const minG = minArr(t.gross);
            const avgStb = meanArr(t.stb);
            const avgSd = meanArr(t.sd);
            return (
              <tr key={t.tee}>
                <td><TeePill name={t.tee} /></td>
                <td className="r fw-600">{t.count}</td>
                <td className="r cb-par-ok">{minG ?? "–"}</td>
                <td className="r fw-600">{avgG?.toFixed(1) ?? "–"}</td>
                <td className="r">{avgStb?.toFixed(1) ?? "–"}</td>
                <td className="r">{avgSd != null ? (
                  <span className={`p p-${sdClassByHcp(avgSd, meanArr(t.hi) ?? null)}`}>
                    {avgSd.toFixed(1)}
                  </span>
                ) : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ByCourseRow({ course, data, isAnalysis, openScorecard, openScorecardId }: {
  course: CourseData; data: PlayerPageData; isAnalysis: boolean;
  openScorecard: (id: string) => void; openScorecardId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [activeTee, setActiveTee] = useState<string | null>(null);
  const last = course.rounds[0];
  const courseKey = norm(course.course);

  // Filter rounds by active tee
  const roundsView = useMemo(() => {
    let rr = course.rounds;
    if (activeTee) rr = rr.filter(r => normKey(r.tee || "") === activeTee);
    return rr;
  }, [course.rounds, activeTee]);

  const ecList = data.EC[courseKey] || [];
  const ecDet = data.ECDET[courseKey] || {};
  const holeStats = data.HOLE_STATS[courseKey] || {};
  const lastHex = getTeeHex(last?.tee || "");
  const courseLinkKey = findCourseKey(course.course);

  return (
    <>
      {/* Summary row */}
      <tr className={open ? "pa-row-open" : ""}>
        <td>
          <div className="rowHead">
            <div className="count" style={{ background: lastHex, color: textOnColor(lastHex), border: teeBorder(lastHex) }}>{course.count}</div>
            <button type="button" className="courseBtn" onClick={() => setOpen(v => !v)}>{course.course}</button>
 {courseLinkKey && <a href={`/campos/${courseLinkKey}`} className="courseLink fs-10 ml-4" title="Ver campo" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>↗</a>}
            <PillBadge pill={course.rounds.map(r => effectivePill(r, course.course)).find(Boolean) || ""} />
          </div>
        </td>
        <td className="r"><b>{course.count}</b></td>
        <td>{last && <TeeDate date={last.date} tee={last.tee || ""} />}</td>
        <td className="r">{last && <HoleBadge hc={last.holeCount} />}</td>
        <td className="r">{last?.hi ?? ""}</td>
        <td>{last && <TeePill name={last.tee || ""} />}</td>
        <td className="r muted">{last?.meters ? `${last.meters}m` : ""}</td>
        <td className="r">{last && <GrossCell gross={last.gross} par={last.par} />}</td>
        <td className="r">{last ? fmtStb(last.stb, last.holeCount) : ""}</td>
        <td className="r">{last && <SdCell round={last} />}</td>
      </tr>
      {/* Detail row */}
      {open && (
        <tr className="details open">
          <td className="inner" colSpan={10}>
            <div className="innerWrap">
              {isAnalysis && (
                <>
                  {activeTee && (
                    <div className="actions mb-10">
                      <button className="btn btnGhost" onClick={() => setActiveTee(null)}>Limpar filtro tee</button>
                    </div>
                  )}
                  {/* Eclectic */}
                  {ecList.length > 0 && (
                    <EclecticSection ecList={ecList} ecDet={ecDet} holeStats={holeStats}
                      courseRounds={course.rounds} holesData={data.HOLES}
                      activeTee={activeTee} onSelectTee={setActiveTee} />
                  )}
                  {/* Course Performance Analysis */}
                  <CoursePerformanceSection rounds={roundsView} />
                  {/* Hole Stats for active tee */}
                  {activeTee && holeStats[activeTee] && (
                    <HoleStatsSection stats={holeStats[activeTee]} />
                  )}
                </>
              )}
              {/* Tee Summary (for all views when multiple tees) */}
              <TeeSummaryTable rounds={course.rounds} />
              {/* Rounds table */}
              <div className="innerTable">
                <table className="dt-compact">
                  <colgroup>
                    <col className="col-p17" /><col className="col-p8" /><col className="col-p9" />
                    <col className="col-p15" /><col className="col-p11" /><col className="col-p14" />
                    <col className="col-p10" /><col className="col-p10" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Data</th><th className="r">Bur.</th><th className="r">HCP</th>
                      <th>Tee</th><th className="r">Dist.</th><th className="r">Gross</th>
                      <th className="r">Stb</th><th className="r">SD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roundsView.map(r => {
                      return (
                        <RoundRow key={r.scoreId} r={r} data={data} courseName={course.course}
                          isOpen={openScorecardId === r.scoreId}
                          onToggle={() => openScorecard(openScorecardId === r.scoreId ? "" : r.scoreId)} />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Native Scorecard Table ─── */

const linkLabels: Record<string, string> = {
  classificacao: "Classificação", classificacao_d1: "Classif. D1", classificacao_d2: "Classif. D2",
  leaderboard: "Leaderboard", scorecard: "Scorecard", resultados: "Resultados",
  fpg_scoring: "FPG Scoring", noticia_teetimes: "Notícia", link: "Ver torneio",
};

interface ScorecardTableProps {
  holes: HoleScores;
  courseName: string;
  date: string;
  tee: string;
  hi?: number | null;
  links?: Record<string, string> | null;
  pill?: string;
  eclecticEntry?: EclecticEntry | null;
}

function ScorecardTable({ holes, courseName, date, tee, hi, links, pill, eclecticEntry }: ScorecardTableProps) {
  const { g: gross, p: par, si, m: meters, hc: holeCount } = holes;
  const is9 = holeCount === 9;
  const frontEnd = is9 ? holeCount : 9;
  const totalHoles = Math.min(holeCount, gross.length);

  const teeHex_ = getTeeHex(tee || "");
  const teeFg_ = textOnColor(teeHex_);

  const parTotal = sumArr(par, 0, totalHoles);
  const grossTotal = sumArr(gross, 0, totalHoles);
  const metersTotal = meters ? sumArr(meters, 0, totalHoles) : 0;
  const toPar = grossTotal - parTotal;
  const toParStr = fmtSign(toPar);

  // Date pill label (DD/MM)
  const datePill = date ? date.substring(0, 5).replace("-", "/") : "Gross";

  // Links
  const linkEntries = links ? Object.entries(links).filter(([, v]) => typeof v === "string" && v.startsWith("http")) : [];

  return (
    <div className="sc-modern" style={{ "--tee-color": teeHex_, "--tee-fg": teeFg_ } as React.CSSProperties}>
      {/* Header */}
      <div className={`sc-header ${teeFg_ === "#fff" ? "sc-header-dark" : "sc-header-light"}`} style={{ background: teeHex_, border: teeBorder(teeHex_) }}>
        <div className="sc-header-left">
          <div className="sc-title"><CourseLink name={courseName} /></div>
          <div className="sc-subtitle">
            <span>{date}</span>
            <span>Tee {tee}</span>
            {hi != null && <span>HCP {hi}</span>}
            {metersTotal > 0 && <span>{metersTotal}m</span>}
            {pill && <PillBadge pill={pill} />}
          </div>
          {linkEntries.length > 0 && (
            <div className="sc-links">
              {linkEntries.map(([label, url]) => (
                <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="sc-ext-link" title={linkLabels[label] || label}>
                  🔗 {linkLabels[label] || label}
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="sc-header-right">
          <div className="sc-stat">
            <div className="sc-stat-label">PAR</div>
            <div className="sc-stat-value">{parTotal || "–"}</div>
          </div>
          <div className="v-sep" />
          <div className="sc-stat">
            <div className="sc-stat-label">RESULTADO</div>
            <div className="sc-stat-value">{grossTotal || "–"}</div>
          </div>
          <div className="v-sep" />
          <div className="sc-stat sc-stat-score">
            <div className="sc-stat-label">SCORE</div>
            <div className="sc-stat-value">{toParStr}</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <table className="sc-table-modern" data-sc-table="1">
        <thead>
          <tr>
            <th className="hole-header sim-br-sep">Buraco</th>
            {Array.from({ length: totalHoles }, (_, h) => (
              <React.Fragment key={h}>
                <th className="hole-header">{h + 1}</th>
                {h === frontEnd - 1 && !is9 && <th className="hole-header col-out fs-10">Out</th>}
              </React.Fragment>
            ))}
            <th className={`hole-header col-${is9 ? "total" : "in"} fs-10`}>{is9 ? "TOTAL" : "In"}</th>
            {!is9 && <th className="hole-header col-total">TOTAL</th>}
          </tr>
        </thead>
        <tbody>
          {/* Metros row */}
          {meters && meters.some(v => v != null && v > 0) && (
            <tr className="meta-row">
              <td className="row-label c-muted fs-10 fw-400">Metros</td>
              {Array.from({ length: totalHoles }, (_, h) => (
                <React.Fragment key={h}>
                  <td>{meters[h] != null && meters[h]! > 0 ? meters[h] : ""}</td>
                  {h === frontEnd - 1 && !is9 && (
                    <td className="col-out fw-600">{sumArr(meters, 0, frontEnd)}</td>
                  )}
                </React.Fragment>
              ))}
              <td className={`col-${is9 ? "total" : "in"} fw-600`}>
                {is9 ? sumArr(meters, 0, totalHoles) : sumArr(meters, 9, totalHoles)}
              </td>
              {!is9 && <td className="col-total c-muted fs-10">{metersTotal}</td>}
            </tr>
          )}

          {/* S.I. row */}
          {si && si.some(v => v != null && v > 0) && (
            <tr className="meta-row">
              <td className="row-label c-muted fs-10 fw-400">S.I.</td>
              {Array.from({ length: totalHoles }, (_, h) => (
                <React.Fragment key={h}>
                  <td>{si[h] != null && si[h]! > 0 ? si[h] : ""}</td>
                  {h === frontEnd - 1 && !is9 && <td className="col-out" />}
                </React.Fragment>
              ))}
              <td className={`col-${is9 ? "total" : "in"}`} />
              {!is9 && <td className="col-total" />}
            </tr>
          )}

          {/* Par row */}
          <tr className="sep-row">
            <td className="row-label par-label">Par</td>
            {Array.from({ length: totalHoles }, (_, h) => (
              <React.Fragment key={h}>
                <td>{par[h] != null && par[h]! > 0 ? par[h] : "–"}</td>
                {h === frontEnd - 1 && !is9 && (
                  <td className="col-out fw-700">{sumArr(par, 0, frontEnd)}</td>
                )}
              </React.Fragment>
            ))}
            <td className={`col-${is9 ? "total" : "in"} fw-700`}>
              {is9 ? parTotal : sumArr(par, 9, totalHoles)}
            </td>
            {!is9 && <td className="col-total">{parTotal || "–"}</td>}
          </tr>

          {/* Gross row */}
          <tr>
            <td className="row-label">
              <span className="p" style={{ background: teeHex_, color: teeFg_, border: teeBorder(teeHex_) }}>{datePill}</span>
            </td>
            {Array.from({ length: totalHoles }, (_, h) => {
              const g = gross[h];
              const p = par[h];
              const cls = scClass(g, p);
              return (
                <React.Fragment key={h}>
                  <td>
                    {g != null && g > 0
                      ? <span className={`sc-score ${cls}`}>{g}</span>
                      : "–"}
                  </td>
                  {h === frontEnd - 1 && !is9 && (() => {
                    const outG = sumArr(gross, 0, frontEnd);
                    const outP = sumArr(par, 0, frontEnd);
                    const outTP = outG - outP;
                    const tpCls = toParClass(outTP);
                    return (
                      <td className="col-out fw-700">
                        {outG}<span className={`sc-topar ${tpCls}`}>{fmtSign(outTP)}</span>
                      </td>
                    );
                  })()}
                </React.Fragment>
              );
            })}
            {(() => {
              const inG = is9 ? grossTotal : sumArr(gross, 9, totalHoles);
              const inP = is9 ? parTotal : sumArr(par, 9, totalHoles);
              const inTP = inG - inP;
              const inCls = toParClass(inTP);
              return (
                <td className={`col-${is9 ? "total" : "in"} fw-700`}>
                  {inG}<span className={`sc-topar ${inCls}`}>{fmtSign(inTP)}</span>
                </td>
              );
            })()}
            {!is9 && (() => {
              const totCls = toParClass(toPar);
              return (
                <td className="col-total">
                  {grossTotal}<span className={`sc-topar ${totCls}`}>{toParStr}</span>
                </td>
              );
            })()}
          </tr>

          {/* Eclectic + Delta rows */}
          {eclecticEntry && eclecticEntry.holes && eclecticEntry.holes.length >= totalHoles && (
            <EclecticRows
              gross={gross}
              par={par}
              eclectic={eclecticEntry}
              holeCount={totalHoles}
              is9={is9}
              frontEnd={frontEnd}
            />
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Eclectic + Delta rows (sub-component of ScorecardTable) ─── */

function EclecticRows({ gross, par, eclectic, holeCount, is9, frontEnd }: {
  gross: (number | null)[];
  par: (number | null)[];
  eclectic: EclecticEntry;
  holeCount: number;
  is9: boolean;
  frontEnd: number;
}) {
  const ecArr = eclectic.holes.slice(0, holeCount).map(h => h?.best ?? null);
  const parArr = eclectic.holes.slice(0, holeCount).map((h, i) => h?.par ?? par[i]);
  const ecBorder = { borderTop: "2px solid var(--border)" } as const;

  const sumEc = sumArr(ecArr, 0, holeCount);
  const sumGross = sumArr(gross, 0, holeCount);

  return (
    <>
      {/* Eclectic row */}
      <tr>
 <td className="row-label fw-700 fs-10" style={{ color: "var(--chart-2)", ...ecBorder }}>Eclético</td>
        {Array.from({ length: holeCount }, (_, h) => {
          const ev = ecArr[h];
          const cls = scClass(ev, parArr[h]);
          return (
            <React.Fragment key={h}>
              <td style={ecBorder}>
                {ev != null ? <span className={`sc-score ${cls}`}>{ev}</span> : ""}
              </td>
              {h === frontEnd - 1 && !is9 && (() => {
                const outEc = sumArr(ecArr, 0, frontEnd);
                const outP = sumArr(parArr, 0, frontEnd);
                const outTP = outEc - outP;
                const tpCls = toParClass(outTP);
                return (
                  <td className="col-out" style={{ fontWeight: 700, ...ecBorder }}>
                    {outEc}<span className={`sc-topar ${tpCls}`}>{fmtSign(outTP)}</span>
                  </td>
                );
              })()}
            </React.Fragment>
          );
        })}
        {(() => {
          const inEc = is9 ? sumEc : sumArr(ecArr, 9, holeCount);
          const inP = is9 ? sumArr(parArr, 0, holeCount) : sumArr(parArr, 9, holeCount);
          const inTP = inEc - inP;
          const inCls = toParClass(inTP);
          return (
            <td className={`col-${is9 ? "total" : "in"}`} style={{ fontWeight: 700, ...ecBorder }}>
              {inEc}<span className={`sc-topar ${inCls}`}>{fmtSign(inTP)}</span>
            </td>
          );
        })()}
        {!is9 && (() => {
          const ecTP = sumEc - sumArr(parArr, 0, holeCount);
          const totCls = toParClass(ecTP);
          return (
            <td className="col-total" style={ecBorder}>
              {sumEc}<span className={`sc-topar ${totCls}`}>{fmtSign(ecTP)}</span>
            </td>
          );
        })()}
      </tr>

      {/* Δ (delta) row */}
      <tr className="bg-detail">
 <td className="row-label fw-700 fs-10 c-text-3" >Δ</td>
        {Array.from({ length: holeCount }, (_, h) => {
          const gv = gross[h];
          const ev = ecArr[h];
          const diff = gv != null && gv > 0 && ev != null ? ev - gv : null;
          const dc = diff != null ? (diff <= 0 ? { color: SC.good, fontWeight: 700 } : { color: SC.danger, fontWeight: 600 }) : { color: "var(--text-muted)" };
          return (
            <React.Fragment key={h}>
              <td style={dc}>
                {diff != null ? (diff === 0 ? "=" : (diff > 0 ? "+" : "") + diff) : ""}
              </td>
              {h === frontEnd - 1 && !is9 && (() => {
                const dOut = sumArr(ecArr, 0, frontEnd) - sumArr(gross, 0, frontEnd);
                return (
 <td className="col-out fw-600" style={{ color: sc2(dOut, 0) }}>
                    {dOut === 0 ? "=" : (dOut > 0 ? "+" : "") + dOut}
                  </td>
                );
              })()}
            </React.Fragment>
          );
        })}
        {(() => {
          const dIn = (is9 ? sumEc : sumArr(ecArr, 9, holeCount)) - (is9 ? sumGross : sumArr(gross, 9, holeCount));
          return (
 <td className={`col-${is9 ? "total" : "in"} fw-600`} style={{ color: sc2(dIn, 0) }}>
              {dIn === 0 ? "=" : (dIn > 0 ? "+" : "") + dIn}
            </td>
          );
        })()}
        {!is9 && (() => {
          const totalDiff = sumEc - sumGross;
          return (
            <td className="col-total" style={{ color: sc2(totalDiff, 0) }}>
              {fmtSign(totalDiff)}
            </td>
          );
        })()}
      </tr>
    </>
  );
}

/* ─── Scorecard wrapper that resolves HOLES data and renders ScorecardTable ─── */

function RoundRow({ r, data, courseName, isOpen, onToggle }: {
  r: RoundData; data: PlayerPageData; courseName: string; isOpen: boolean; onToggle: () => void;
}) {
  const holes = data.HOLES[String(r.scoreId)];
  const courseKey = norm(courseName);
  const teeKey = r.teeKey || normKey(r.tee || "");
  const ecEntry = data.ECDET?.[courseKey]?.[teeKey] || null;
  return (
    <>
      <tr className="roundRow" onClick={r.hasCard ? onToggle : undefined}
          style={{ cursor: r.hasCard ? "pointer" : "default" }}>
        <td>
          {r.hasCard
            ? <a href="#" onClick={e => { e.preventDefault(); onToggle(); }}><TeeDate date={r.date} tee={r.tee || ""} /></a>
            : <TeeDate date={r.date} tee={r.tee || ""} />}
          <OriginPill origin={r.scoreOrigin} />
          <PillBadge pill={effectivePill(r, courseName)} />
          <LinkBtns links={r._links} />
          <div className="muted fs-10">#{r.scoreId}</div>
        </td>
        <td className="r"><HoleBadge hc={r.holeCount} /></td>
        <td className="r">{r.hi ?? ""}</td>
        <td><TeePill name={r.tee || ""} /></td>
        <td className="r muted">{r.meters ? `${r.meters}m` : ""}</td>
        <td className="r"><GrossCell gross={r.gross} par={r.par} /></td>
        <td className="r">{fmtStb(r.stb, r.holeCount)}</td>
        <td className="r"><SdCell round={r} /></td>
      </tr>
      {isOpen && holes && (
        <tr>
          <td colSpan={8} className="bg-page p-0">
            <div className="scHost" style={scHostStyle}>
              <ScorecardTable
                holes={holes}
                courseName={courseName}
                date={r.date}
                tee={r.tee || ""}
                hi={r.hi}
                links={r._links}
                pill={effectivePill(r, courseName)}
                eclecticEntry={ecEntry}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ByCourseView({ data, search, sort, isAnalysis }: {
  data: PlayerPageData; search: string; sort: CourseSort; isAnalysis: boolean;
}) {
  const [openScorecardId, setOpenScorecardId] = useState<string | null>(null);
  const list = useMemo(() => {
    const term = norm(search);
    let l = data.DATA.slice();
    if (term) l = l.filter(c => norm(c.course).includes(term));
    if (sort === "name_asc") l.sort((a, b) => a.course.localeCompare(b.course, "pt"));
    else if (sort === "last_desc") l.sort((a, b) => (b.lastDateSort - a.lastDateSort) || (b.count - a.count));
    else l.sort((a, b) => (b.count - a.count) || a.course.localeCompare(b.course, "pt"));
    return l;
  }, [data, search, sort]);

  return (
    <div className="card">
      <div className="table-wrap">
        <table className="dtable-lg">
          <colgroup>
            <col className="col-p26" /><col className="col-p6" /><col className="col-p9" />
            <col className="col-p6" /><col className="col-p7" /><col className="col-p12" />
            <col className="col-p8" /><col className="col-p9" /><col className="col-p7" /><col className="col-p7" />
          </colgroup>
          <thead>
            <tr>
              <th>Campo</th><th className="r">Voltas</th><th>Última</th>
              <th className="r">Bur.</th><th className="r">HCP</th><th>Tee</th>
              <th className="r">Dist.</th><th className="r">Gross</th><th className="r">Stb</th><th className="r">SD</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c, i) => (
              <ByCourseRow key={c.course + i} course={c} data={data}
                isAnalysis={isAnalysis} openScorecard={setOpenScorecardId} openScorecardId={openScorecardId} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   Eclectic Section (inside course detail)
   ──────────────────────────────────────────────────────────────────────────────────────── */

function EclecticSection({ ecList, ecDet, holeStats, courseRounds, holesData, activeTee, onSelectTee }: {
  ecList: EclecticEntry[]; ecDet: Record<string, EclecticEntry>;
  holeStats: Record<string, HoleStatsData>;
  courseRounds: RoundData[]; holesData: Record<string, HoleScores>;
  activeTee: string | null; onSelectTee: (tk: string) => void;
}) {
  return (
    <div className="ecBlock">
      <div className="h-sm">Eclético (gross) por tee</div>
      <div className="ecHint">Clique num tee na tabela de buracos para ver análise e filtrar rondas.</div>

      {/* Summary table */}
      <div className="card mb-10">
        <table className="ec-sum">
          <thead>
            <tr><th>Tee</th><th className="r">Rondas</th><th className="r">Par</th>
              <th className="r">Eclético</th><th className="r">vs Par</th>
              <th className="r">Melhor Gr.</th><th className="r">Média Gr.</th></tr>
          </thead>
          <tbody>
            {ecList.map(ex => {
              const hs = holeStats[ex.teeKey];
              const tp = ex.toPar;
              const tpStr = tp == null ? "" : (fmtSign(tp));
              const tpCol = tp == null ? "" : (tp > 0 ? SC.danger : tp < 0 ? SC.good : SC.muted);
              return (
                <tr key={ex.teeKey} className="pointer" onClick={() => onSelectTee(ex.teeKey)}>
                  <td><TeePill name={ex.teeName} /></td>
                  <td className="r fw-600">{hs?.nRounds ?? ""}</td>
                  <td className="r">{ex.totalPar}</td>
                  <td className="r c-blue-13">{ex.totalGross}</td>
 <td className="r fw-700" style={{ color: tpCol }}>{tpStr}</td>
                  <td className="r fw-600">{hs?.bestRound?.gross ?? "–"}</td>
                  <td className="r">{hs?.avgGross?.toFixed(1) ?? "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Hole-by-hole scorecard per tee */}
      {ecList.map(ec => {
        const isActive = ec.teeKey === activeTee;
        const det = ecDet[ec.teeKey] || ec;
        const parArr = det.holes?.map(h => h.par) || [];
        const hc = ec.holeCount;
        const is9 = hc === 9;
        const hx = getTeeHex(ec.teeName), fg = textOnColor(hx);

        // Get individual round scores for this tee
        const teeRounds = courseRounds
          .filter(r => normKey(r.tee || "") === ec.teeKey && holesData[r.scoreId])
          .sort((a, b) => b.dateSort - a.dateSort);

        return (
          <div key={ec.teeKey} className={`ecPillBlock ${isActive ? "ecActive" : ""} overflow-hidden br-lg mt-8`}
 style={{ border: isActive ? "2px solid " + hx : "1px solid var(--border-light)" }}>
 <div className="pointer fw-600 fs-12" style={{ padding: "6px 10px", background: isActive ? hx + "10" : "var(--bg-detail)" }}
              onClick={() => onSelectTee(ec.teeKey)}>
              <TeePill name={ec.teeName} />{" "}
              <span className="cb-blue-800">{ec.totalGross}</span>
              <span className="muted ml-6">par {ec.totalPar}</span>
            </div>
            {/* Eclectic hole-by-hole table */}
            <div className="scroll-x">
 <table className="sc-table-ec fs-11 w-full" >
                <thead>
                  <tr>
                    <th className="row-label col-w60">Bur.</th>
                    {Array.from({ length: Math.min(hc, 9) }, (_, i) => <th key={i + 1}>{i + 1}</th>)}
                    <th className="col-out">OUT</th>
                    {!is9 && Array.from({ length: 9 }, (_, i) => <th key={i + 10}>{i + 10}</th>)}
                    {!is9 && <th className="col-in">IN</th>}
                    <th className="col-total">TOT</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Par row */}
                  <tr className="bg-success">
                    <td className="row-label fw-700 fs-10">Par</td>
                    {Array.from({ length: Math.min(hc, 9) }, (_, i) => <td key={i}>{parArr[i] ?? ""}</td>)}
                    <td className="col-out fw-700">{sumArr(parArr, 0, Math.min(hc, 9))}</td>
                    {!is9 && Array.from({ length: 9 }, (_, i) => <td key={i + 9}>{parArr[i + 9] ?? ""}</td>)}
                    {!is9 && <td className="col-in fw-700">{sumArr(parArr, 9, 18)}</td>}
                    <td className="col-total fw-900">{sumArr(parArr, 0, hc)}</td>
                  </tr>
                  {/* Eclectic row */}
                  <tr className="bt-heavy">
                    <td className="row-label cb-blue-10">Eclético</td>
                    {ec.holes.slice(0, Math.min(hc, 9)).map((h, i) => (
                      <td key={i}>{h.best != null ? <ScoreCircle gross={h.best} par={parArr[i]} /> : "–"}</td>
                    ))}
                    <td className="col-out fw-700">
                      {sumArr(ec.holes.map(h => h.best), 0, Math.min(hc, 9))}
                    </td>
                    {!is9 && ec.holes.slice(9, 18).map((h, i) => (
                      <td key={i + 9}>{h.best != null ? <ScoreCircle gross={h.best} par={parArr[i + 9]} /> : "–"}</td>
                    ))}
                    {!is9 && <td className="col-in fw-700">{sumArr(ec.holes.map(h => h.best), 9, 18)}</td>}
                    <td className="col-total fw-900 fs-13">{ec.totalGross}</td>
                  </tr>
                  {/* Individual round rows */}
                  {teeRounds.map(tr => {
                    const trH = holesData[tr.scoreId];
                    if (!trH?.g) return null;
                    const trG = trH.g;
                    const trDate = tr.date ? tr.date.substring(0, 5).replace("-", "/") : "";
                    return (
                      <tr key={tr.scoreId} style={{ background: hx + "0A" }}>
                        <td className="row-label fs-10">
 <span className="p p-sm" style={{ background: hx, color: fg, padding: "1px 6px" }}>{trDate}</span>
                        </td>
                        {Array.from({ length: Math.min(hc, 9) }, (_, i) => (
                          <td key={i}><ScoreCircle gross={trG[i]} par={parArr[i]} size="small" /></td>
                        ))}
                        <td className="col-out fw-600 fs-10">{sumArr(trG, 0, Math.min(hc, 9))}</td>
                        {!is9 && Array.from({ length: 9 }, (_, i) => (
                          <td key={i + 9}><ScoreCircle gross={trG[i + 9]} par={parArr[i + 9]} size="small" /></td>
                        ))}
                        {!is9 && <td className="col-in fw-600 fs-10">{sumArr(trG, 9, hc)}</td>}
                        <td className="col-total fs-11-fw700">{sumArr(trG, 0, hc)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   Hole Stats Section
   ──────────────────────────────────────────────────────────────────────────────────────── */

/* ─── Course Performance Analysis (KPIs + Conclusion) ─── */
function CoursePerformanceSection({ rounds }: { rounds: RoundData[] }) {
  const stats = useMemo(() => {
    const r18 = rounds.filter(r => r.holeCount === 18 && (r.sd != null || r.stb != null));
    const r9 = rounds.filter(r => r.holeCount === 9 && (r.sd != null || r.stb != null));
    if (r18.length + r9.length < 2) return null;

    interface NormRound { sd: number | null; stb: number | null; hi: number | null; tee: string; date: string; dateSort: number; holeCount: number; gross: number | null; par: number | null }
    const allNorm: NormRound[] = [];
    r18.forEach(r => allNorm.push({
      sd: r.sd != null ? Number(r.sd) : null, stb: r.stb != null ? Number(r.stb) : null,
      hi: r.hi, tee: r.tee || "?", date: r.date || "", dateSort: r.dateSort,
      holeCount: 18, gross: r.gross ? Number(r.gross) : null, par: r.par ? Number(r.par) : null
    }));
    r9.forEach(r => allNorm.push({
      sd: r.sd != null ? Number(r.sd) : null, stb: r.stb != null ? Number(r.stb) + 17 : null,
      hi: r.hi, tee: r.tee || "?", date: r.date || "", dateSort: r.dateSort,
      holeCount: 9, gross: null, par: null
    }));
    allNorm.sort((a, b) => a.dateSort - b.dateSort);

    const sdArr = allNorm.map(r => r.sd).filter((x): x is number => x != null && !isNaN(x));
    const stbArr = allNorm.map(r => r.stb).filter((x): x is number => x != null && !isNaN(x));

    // Trend: linear regression on SD
    let trendLabel = "➡️ Estável", trendCls = "trend-flat";
    if (sdArr.length >= 3) {
      const slope = linearSlope(sdArr)!;
      if (slope < -0.3) { trendLabel = "📈 A melhorar"; trendCls = "trend-up"; }
      else if (slope > 0.3) { trendLabel = "📉 A piorar"; trendCls = "trend-down"; }
    }

    // By tee breakdown
    const teeMap: Record<string, { tee: string; sds: number[]; stbs: number[]; grosses: number[]; pars: number[]; count: number }> = {};
    allNorm.forEach(r => {
      if (!teeMap[r.tee]) teeMap[r.tee] = { tee: r.tee, sds: [], stbs: [], grosses: [], pars: [], count: 0 };
      if (r.sd != null && !isNaN(r.sd)) teeMap[r.tee].sds.push(r.sd);
      if (r.stb != null && !isNaN(r.stb)) teeMap[r.tee].stbs.push(r.stb);
      if (r.gross != null && r.par != null) { teeMap[r.tee].grosses.push(r.gross); teeMap[r.tee].pars.push(r.par); }
      teeMap[r.tee].count++;
    });
    const teeArr = Object.values(teeMap).sort((a, b) => b.count - a.count);

    // Conclusion (native React elements)
    const grossArr18 = allNorm.filter(r => r.gross != null && r.par != null);
    const conclusion: React.ReactNode[] = [];
    if (grossArr18.length >= 2) {
      const avgG = meanArr(grossArr18.map(r => r.gross!))!;
      const avgP = meanArr(grossArr18.map(r => r.par!))!;
      const diff = avgG - avgP;
      const bestG = minArr(grossArr18.map(r => r.gross!))!;
      const bestP = grossArr18.reduce((a, r) => r.gross! < a.gross! ? r : a).par;
      conclusion.push(<span key="avg">Em média fazes <b>{avgG.toFixed(0)} pancadas</b> neste campo (<b>{fmtSign(diff, 0)} vs par</b>). </span>);
      conclusion.push(<span key="best">O teu melhor resultado foi <b>{bestG}</b> (par {bestP}). </span>);
    }
    if (stbArr.length >= 2) {
      const avgStb = meanArr(stbArr)!;
      if (avgStb >= 36) conclusion.push(<span key="stb">A tua média Stableford de <b>{avgStb.toFixed(0)}</b> mostra que jogas <b className="c-par-ok">consistentemente bem</b> aqui. </span>);
      else if (avgStb >= 30) conclusion.push(<span key="stb">A tua média Stableford de <b>{avgStb.toFixed(0)}</b> mostra desempenho <b>sólido</b>. </span>);
      else conclusion.push(<span key="stb">A tua média Stableford de <b>{avgStb.toFixed(0)}</b> sugere <b className="c-eagle">espaço para melhorar</b> neste campo. </span>);
    }
    if (trendCls === "trend-up") conclusion.push(<span key="trend">A tendência é <b className="c-par-ok">positiva</b> — estás a melhorar neste campo. </span>);
    else if (trendCls === "trend-down") conclusion.push(<span key="trend">A tendência é <b className="c-birdie">negativa</b> — os resultados recentes pioraram. </span>);
    if (teeArr.length > 1) {
      const bestTee = teeArr.reduce((a, b) => (meanArr(b.stbs) ?? 0) > (meanArr(a.stbs) ?? 0) ? b : a);
      if (bestTee.stbs.length >= 2) conclusion.push(<span key="tee">Os tees <b>{bestTee.tee}</b> são onde tens melhores resultados (Stb {meanArr(bestTee.stbs)!.toFixed(0)}). </span>);
    }

    return {
      has9: r9.length > 0, r18Count: r18.length, r9Count: r9.length,
      totalRounds: allNorm.length,
      sdArr, stbArr,
      avgSd: meanArr(sdArr), minSd: minArr(sdArr), maxSd: maxArr(sdArr),
      avgStb: meanArr(stbArr), maxStb: maxArr(stbArr),
      trendLabel, trendCls,
      conclusion,
    };
  }, [rounds]);

  if (!stats) return null;

  return (
    <div className="card">
      <div className="h-md">
        Análise de Performance
        {stats.has9 && <span className="muted fs-11 fw-400"> (Stb de 9h normalizado: +17)</span>}
      </div>
      <div className="caKpis">
        {stats.sdArr.length >= 2 && (
          <>
            <div className="caKpi"><div className="caKpiVal">{stats.avgSd!.toFixed(1)}</div><div className="caKpiLbl">Média SD</div></div>
            <div className="caKpi"><div className="caKpiVal best">{stats.minSd!.toFixed(1)}</div><div className="caKpiLbl">Melhor SD</div></div>
            <div className="caKpi"><div className="caKpiVal worst">{stats.maxSd!.toFixed(1)}</div><div className="caKpiLbl">Pior SD</div></div>
          </>
        )}
        {stats.stbArr.length >= 2 && (
          <>
            <div className="caKpi"><div className="caKpiVal">{stats.avgStb!.toFixed(1)}</div><div className="caKpiLbl">Média Stb</div></div>
            <div className="caKpi"><div className="caKpiVal best">{stats.maxStb}</div><div className="caKpiLbl">Melhor Stb</div></div>
          </>
        )}
        <div className="caKpi">
          <div className="caKpiVal">{stats.totalRounds}</div>
          <div className="caKpiLbl">Rondas{stats.has9 ? ` (${stats.r18Count}×18h + ${stats.r9Count}×9h)` : ""}</div>
        </div>
        {stats.sdArr.length >= 3 && (
          <div className={`caKpi ${stats.trendCls}`}>
            <div className="caKpiVal">{stats.trendLabel}</div>
            <div className="caKpiLbl">Tendência SD</div>
          </div>
        )}
      </div>
      {stats.conclusion.length > 0 && (
        <div className="conclusion-box">
          <div className="h-sm-warn">💡 Resumo</div>
          <div className="caConcText">{stats.conclusion}</div>
        </div>
      )}
    </div>
  );
}

function HoleStatsSection({ stats }: { stats: HoleStatsData }) {
  const pctF = (n: number, tot: number) => tot ? (n / tot * 100).toFixed(0) : "0";

  const td = stats.totalDist;
  const parOrBetter = td ? (td.eagle + td.birdie + td.par) : 0;
  const dblOrWorse = td ? (td.double + td.triple) : 0;
  const parOrBetterPct = td?.total ? parOrBetter / td.total * 100 : 0;
  const dblOrWorsePct = td?.total ? dblOrWorse / td.total * 100 : 0;

  const slColor = sc3m(stats.totalStrokesLost, 5, 12);
  const pobCol = sc3m(parOrBetterPct, 40, 60, "desc");
  const dowCol = sc3m(dblOrWorsePct, 5, 15);

  // By par type
  const parTypes = [3, 4, 5].filter(p => stats.byParType[p]);
  const worstPT = parTypes.length > 1
    ? parTypes.reduce((a, b) => (stats.byParType[a]?.avgVsPar ?? 0) > (stats.byParType[b]?.avgVsPar ?? 0) ? a : b)
    : null;

  // Strengths & weaknesses
  const ranked = stats.holes
    .filter(h => h.avg != null && h.par != null && h.n >= 2)
    .map(h => ({ h: h.h, par: h.par!, si: h.si, avg: h.avg!, diff: h.avg! - h.par!, n: h.n, dist: h.dist, strokesLost: h.strokesLost ?? 0 }))
    .sort((a, b) => a.diff - b.diff);
  const strengths = ranked.filter(h => h.diff <= 0.15).slice(0, 4);
  const weaknesses = [...ranked].sort((a, b) => b.strokesLost - a.strokesLost).filter(h => h.strokesLost > 0.2).slice(0, 4);

  // Hole-by-hole table
  const hc = stats.holeCount;
  const is9 = hc === 9;
  const fe = is9 ? hc : 9;
  const parArr = stats.holes.slice(0, hc).map(x => x.par ?? 0);

  const cs: React.CSSProperties = { padding: "4px 6px", textAlign: "center", fontSize: 11, borderBottom: "1px solid var(--bg-hover)" };
  const colL: React.CSSProperties = { ...cs, textAlign: "left", paddingLeft: 8, borderRight: "2px solid var(--border-light)", whiteSpace: "nowrap", minWidth: 70 };
  const colOut: React.CSSProperties = { ...cs, background: "var(--bg-muted)", borderLeft: "1px solid var(--border-light)", borderRight: "1px solid var(--border-light)" };
  const colIn: React.CSSProperties = { ...colOut };
  const colTot: React.CSSProperties = { ...cs, background: "var(--bg-muted)", borderLeft: "1px solid var(--border-light)", fontWeight: 800 };

  return (
    <div className="card">
      <div className="h-md">📊 Análise de Performance <span className="muted fs-11">({stats.nRounds} rondas)</span></div>

      {/* Diagnosis cards */}
      <div className="haDiag">
        <div className="haDiagCard">
          <div className="haDiagIcon" style={{ background: slColor + "20", color: slColor }}>🎯</div>
          <div className="haDiagBody">
            <div className="haDiagVal" style={{ color: slColor }}>{fD(stats.totalStrokesLost)}</div>
            <div className="haDiagLbl">pancadas perdidas p/ volta vs par</div>
          </div>
        </div>
        <div className="haDiagCard">
          <div className="haDiagIcon" style={{ background: pobCol + "20", color: pobCol }}>⛳</div>
          <div className="haDiagBody">
            <div className="haDiagVal" style={{ color: pobCol }}>{parOrBetterPct.toFixed(0)}%</div>
            <div className="haDiagLbl">par ou melhor ({parOrBetter}/{td?.total ?? 0} buracos)</div>
          </div>
        </div>
        <div className="haDiagCard">
          <div className="haDiagIcon" style={{ background: dowCol + "20", color: dowCol }}>💣</div>
          <div className="haDiagBody">
            <div className="haDiagVal" style={{ color: dowCol }}>{dblOrWorsePct.toFixed(0)}%</div>
            <div className="haDiagLbl">double bogey ou pior ({dblOrWorse}/{td?.total ?? 0})</div>
          </div>
        </div>
        {stats.f9b9 && (() => {
          const diff9 = stats.f9b9.b9.strokesLost - stats.f9b9.f9.strokesLost;
          const worse9 = diff9 > 0.3 ? "Back 9" : diff9 < -0.3 ? "Front 9" : null;
          if (!worse9) return null;
          return (
            <div className="haDiagCard">
              <div className="haDiagIcon diag-bg-purple">🔄</div>
              <div className="haDiagBody">
                <div className="haDiagVal c-purple">{worse9}</div>
                <div className="haDiagLbl">custa mais {Math.abs(diff9).toFixed(1)} panc./volta (F9: {fD(stats.f9b9!.f9.strokesLost)}, B9: {fD(stats.f9b9!.b9.strokesLost)})</div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* By par type */}
      {parTypes.length > 1 && (
        <div className="haParTypes">
          <div className="h-sm">Desempenho por Tipo de Buraco</div>
          <div className="haParGrid">
            {parTypes.map(pt => {
              const g = stats.byParType[pt];
              const isWorst = pt === worstPT && (g.avgVsPar ?? 0) > 0.3;
              const distTotal = g.dist.eagle + g.dist.birdie + g.dist.par + g.dist.bogey + g.dist.double + g.dist.triple;
              const vpCol = sc3m(g.avgVsPar ?? 0, 0, 0.4);
              const segs = [
                { n: g.dist.eagle + g.dist.birdie, cls: "seg-birdie", label: "Birdie+" },
                { n: g.dist.par, cls: "seg-par", label: "Par" },
                { n: g.dist.bogey, cls: "seg-bogey", label: "Bogey" },
                { n: g.dist.double + g.dist.triple, cls: "seg-double", label: "Double+" },
              ];
              return (
                <div key={pt} className="haParCard"
                  style={{ borderColor: isWorst ? SC.danger : "var(--border)", background: isWorst ? "var(--bg-danger)" : "var(--bg-card)" }}>
                  {isWorst && <div className="haParAlert">⚠️ Área a melhorar</div>}
                  <div className="haParHead">Par {pt} <span className="muted">({g.nHoles} buracos)</span></div>
                  <div className="haParAvg" style={{ color: vpCol }}>{fD2(g.avgVsPar ?? 0)} <span style={{ fontSize: 10, color: "var(--text-3)" }}>média vs par</span></div>
                  <div className="haParStat">{fD(g.strokesLostPerRound)} <span>pancadas/volta</span></div>
                  {distTotal > 0 && (
                    <div className="haParDist">
                      <div className="haParDistBar">
                        {segs.map(sg => sg.n > 0 ? <div key={sg.cls} className={`haDistSeg ${sg.cls}`} style={{ width: `${(sg.n / distTotal * 100).toFixed(1)}%` }} title={`${sg.label}: ${sg.n}`} /> : null)}
                      </div>
                      <div className="haParDistNums">{pctF(g.dist.eagle + g.dist.birdie, distTotal)}% birdie+ · {pctF(g.dist.par, distTotal)}% par · {pctF(g.dist.bogey, distTotal)}% bogey · {pctF(g.dist.double + g.dist.triple, distTotal)}% double+</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Strengths & weaknesses */}
      {ranked.length >= 4 && (
        <div className="haTopWrap">
          <div className="haTopCol haTopStrength">
            <div className="h-sm"><span className="c-par-ok">💪 Pontos Fortes</span></div>
            {strengths.length === 0
              ? <div className="haTopEmpty">Nenhum buraco consistentemente ao par ou melhor.</div>
              : strengths.map(bh => {
                  const pobN = bh.dist ? bh.dist.eagle + bh.dist.birdie + bh.dist.par : 0;
                  const pobPct = bh.n ? Math.round(pobN / bh.n * 100) : 0;
                  return (
                    <div key={bh.h} className="haTopItem">
                      <div className="haTopHole">{bh.h}</div>
                      <div className="haTopDetail">
                        <div><b>Bur. {bh.h}</b> · Par {bh.par}{bh.si ? ` · SI ${bh.si}` : ""}</div>
                        <div className="haTopMeta">
                          <span className="cb-par-ok">{fD2(bh.diff)}</span> média vs par · <span className="c-par-ok">{pobPct}% par ou melhor</span>
                        </div>
                      </div>
                    </div>
                  );
                })
            }
          </div>
          <div className="haTopCol haTopWeakness">
            <div className="h-sm"><span className="c-birdie">🔻 Onde Perdes Mais Pancadas</span></div>
            {weaknesses.length === 0
              ? <div className="haTopEmpty">Sem buracos com perdas significativas.</div>
              : <>
                  {weaknesses.map(wh => {
                    const dblN = wh.dist ? wh.dist.double + wh.dist.triple : 0;
                    const dblPct = wh.n ? Math.round(dblN / wh.n * 100) : 0;
                    return (
                      <div key={wh.h} className="haTopItem">
                        <div className="haTopHole haTopHoleRed">{wh.h}</div>
                        <div className="haTopDetail">
                          <div><b>Bur. {wh.h}</b> · Par {wh.par}{wh.si ? ` · SI ${wh.si}` : ""}</div>
                          <div className="haTopMeta">
                            <span className="cb-birdie">{fD(wh.strokesLost)}</span> pancadas/volta
                            {dblPct > 0 && <> · <span className="c-birdie">{dblPct}% double+</span></>}
                            {" "}· Média {wh.avg.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {(() => {
                    const totalWeakSL = weaknesses.reduce((a, w) => a + w.strokesLost, 0);
                    return (
                      <div className="haTopSummary">Estes {weaknesses.length} buracos custam-te <b>{totalWeakSL.toFixed(1)} pancadas por volta</b> ({Math.round(totalWeakSL / stats.totalStrokesLost * 100)}% do total).</div>
                    );
                  })()}
                </>
            }
          </div>
        </div>
      )}

      {/* Scoring distribution bar */}
      {td && td.total > 0 && (
        <div className="haDistSection">
          <div className="h-sm">Distribuição de Scoring</div>
          <div className="haDistBar">
            {td.eagle > 0 && <div className="haDistSeg seg-eagle" style={{ width: `${(td.eagle / td.total * 100).toFixed(1)}%` }} title={`Eagle+: ${td.eagle}`} />}
            {td.birdie > 0 && <div className="haDistSeg seg-birdie" style={{ width: `${(td.birdie / td.total * 100).toFixed(1)}%` }} title={`Birdie: ${td.birdie}`} />}
            {td.par > 0 && <div className="haDistSeg seg-par" style={{ width: `${(td.par / td.total * 100).toFixed(1)}%` }} title={`Par: ${td.par}`} />}
            {td.bogey > 0 && <div className="haDistSeg seg-bogey" style={{ width: `${(td.bogey / td.total * 100).toFixed(1)}%` }} title={`Bogey: ${td.bogey}`} />}
            {td.double > 0 && <div className="haDistSeg seg-double" style={{ width: `${(td.double / td.total * 100).toFixed(1)}%` }} title={`Double: ${td.double}`} />}
            {td.triple > 0 && <div className="haDistSeg seg-triple" style={{ width: `${(td.triple / td.total * 100).toFixed(1)}%` }} title={`Triple+: ${td.triple}`} />}
          </div>
          <div className="haDistLegend">
            {td.eagle > 0 && <span className="haLeg"><span className="haLegDot seg-eagle" />Eagle+ {(td.eagle / td.total * 100).toFixed(1)}%</span>}
            {td.birdie > 0 && <span className="haLeg"><span className="haLegDot seg-birdie" />Birdie {(td.birdie / td.total * 100).toFixed(1)}%</span>}
            <span className="haLeg"><span className="haLegDot seg-par" />Par {(td.par / td.total * 100).toFixed(1)}%</span>
            {td.bogey > 0 && <span className="haLeg"><span className="haLegDot seg-bogey" />Bogey {(td.bogey / td.total * 100).toFixed(1)}%</span>}
            {td.double > 0 && <span className="haLeg"><span className="haLegDot seg-double" />Double {(td.double / td.total * 100).toFixed(1)}%</span>}
            {td.triple > 0 && <span className="haLeg"><span className="haLegDot seg-triple" />Triple+ {(td.triple / td.total * 100).toFixed(1)}%</span>}
          </div>
        </div>
      )}

      {/* Hole-by-hole table */}
      <div className="haTableSection">
        <div className="card">
          <div className="sc-bar-head"><span>Detalhe Buraco a Buraco</span></div>
          <div className="scroll-x">
 <table className="w-full fs-11 bc-collapse">
              <tbody>
                {/* Buraco row */}
                <tr className="bg-detail">
 <td className="fw-700 fs-11" style={{ ...colL, color: "var(--text-3)", borderBottom: "1px solid var(--border-light)" }}>Buraco</td>
                  {stats.holes.slice(0, hc).map((_, i) => (
                    <React.Fragment key={i}>
 <td className="fw-700 fs-11" style={{ ...cs, color: "var(--text-3)", borderBottom: "1px solid var(--border-light)" }}>{i + 1}</td>
 {i === fe - 1 && !is9 && <td className="fw-700 fs-10" style={{ ...colOut, color: "var(--text-3)", borderBottom: "1px solid var(--border-light)" }}>Out</td>}
                    </React.Fragment>
                  ))}
 <td className="fw-700 fs-10" style={{ ...(is9 ? colTot : colIn), color: "var(--text-3)", borderBottom: "1px solid var(--border-light)" }}>{is9 ? "TOTAL" : "In"}</td>
 {!is9 && <td className="fs-11" style={{ ...colTot, color: "var(--text-2)", borderBottom: "1px solid var(--border-light)" }}>TOTAL</td>}
                </tr>
                {/* SI row */}
                {stats.holes.some(h => h.si != null) && (
                  <tr>
 <td className="fs-10" style={{ ...colL, color: "var(--text-muted)" }}>S.I.</td>
                    {stats.holes.slice(0, hc).map((h, i) => (
                      <React.Fragment key={i}>
 <td className="fs-10" style={{ ...cs, color: "var(--text-muted)" }}>{h.si ?? ""}</td>
                        {i === fe - 1 && !is9 && <td style={colOut} />}
                      </React.Fragment>
                    ))}
                    <td style={is9 ? colTot : colIn} />
                    {!is9 && <td style={colTot} />}
                  </tr>
                )}
                {/* Par row */}
                <tr>
 <td className="fw-600 fs-11" style={{ ...colL, color: "var(--text-muted)", borderBottom: "2px solid var(--border)" }}>Par</td>
                  {stats.holes.slice(0, hc).map((h, i) => (
                    <React.Fragment key={i}>
                      <td style={{ ...cs, borderBottom: "2px solid var(--border)" }}>{h.par ?? ""}</td>
 {i === fe - 1 && !is9 && <td className="fw-700" style={{ ...colOut, borderBottom: "2px solid var(--border)" }}>{sumArr(parArr, 0, fe)}</td>}
                    </React.Fragment>
                  ))}
 <td className="fw-700" style={{ ...(is9 ? colTot : colIn), borderBottom: "2px solid var(--border)" }}>
                    {is9 ? sumArr(parArr, 0, hc) : sumArr(parArr, 9, hc)}
                  </td>
                  {!is9 && <td style={{ ...colTot, borderBottom: "2px solid var(--border)" }}>{sumArr(parArr, 0, hc)}</td>}
                </tr>
                {/* Avg row */}
                <tr>
 <td className="fw-700" style={{ ...colL, color: "var(--text)" }}>Média</td>
                  {stats.holes.slice(0, hc).map((h, i) => {
                    const vp = h.avg != null && h.par != null ? h.avg - h.par : null;
                    const col = vp == null ? SC.muted : vp <= -0.1 ? SC.good : vp <= 0.3 ? SC.muted : SC.danger;
                    return (
                      <React.Fragment key={i}>
 <td className="fw-700" style={{ ...cs, color: col }}>{h.avg?.toFixed(1) ?? ""}</td>
 {i === fe - 1 && !is9 && <td className="fw-700" style={{ ...colOut }}>{(stats.holes.slice(0, fe).reduce((s, x) => s + (x.avg ?? 0), 0)).toFixed(1)}</td>}
                      </React.Fragment>
                    );
                  })}
 <td className="fw-700" style={{ ...(is9 ? colTot : colIn) }}>
                    {(is9 ? stats.holes.slice(0, hc) : stats.holes.slice(9, hc)).reduce((s, x) => s + (x.avg ?? 0), 0).toFixed(1)}
                  </td>
 {!is9 && <td className="fw-900" style={{ ...colTot }}>{stats.holes.slice(0, hc).reduce((s, x) => s + (x.avg ?? 0), 0).toFixed(1)}</td>}
                </tr>
                {/* Best row */}
                <tr>
 <td className="fw-700 fs-10" style={{ ...colL, color: SC.good }}>Melhor</td>
                  {stats.holes.slice(0, hc).map((h, i) => {
                    const cls = h.best != null && h.par != null ? scClass(h.best, h.par) : "";
                    return (
                      <React.Fragment key={i}>
                        <td style={cs}>{h.best != null ? <span className={`sc-score ${cls}`}>{h.best}</span> : ""}</td>
                        {i === fe - 1 && !is9 && <td style={colOut} />}
                      </React.Fragment>
                    );
                  })}
                  <td style={is9 ? colTot : colIn} />
                  {!is9 && <td style={colTot} />}
                </tr>
                {/* Worst row */}
                <tr>
 <td className="fw-700 fs-10" style={{ ...colL, color: SC.danger }}>Pior</td>
                  {stats.holes.slice(0, hc).map((h, i) => {
                    const cls = h.worst != null && h.par != null ? scClass(h.worst, h.par) : "";
                    return (
                      <React.Fragment key={i}>
                        <td style={cs}>{h.worst != null ? <span className={`sc-score ${cls}`}>{h.worst}</span> : ""}</td>
                        {i === fe - 1 && !is9 && <td style={colOut} />}
                      </React.Fragment>
                    );
                  })}
                  <td style={is9 ? colTot : colIn} />
                  {!is9 && <td style={colTot} />}
                </tr>
                {/* Strokes lost row */}
                <tr>
 <td className="fw-700 fs-10" style={{ ...colL, color: "var(--text-3)" }}>Panc. perd.</td>
                  {stats.holes.slice(0, hc).map((h, i) => {
                    const sl = h.strokesLost ?? 0;
                    let slBg = "";
                    if (sl <= -0.3) slBg = "rgba(22,163,74,0.2)";
                    else if (sl <= 0.15) slBg = "";
                    else if (sl <= 0.4) slBg = "rgba(220,38,38,0.1)";
                    else if (sl <= 0.7) slBg = "rgba(220,38,38,0.2)";
                    else slBg = "rgba(220,38,38,0.35)";
                    const slCol = sl <= -0.3 ? SC.good : sl <= 0.15 ? SC.muted : SC.danger;
                    return (
                      <React.Fragment key={i}>
 <td className="fw-700 fs-10" style={{ ...cs, background: slBg, color: slCol }}>{h.n > 0 ? fD(sl) : ""}</td>
                        {i === fe - 1 && !is9 && (() => {
                          const outSL = stats.holes.slice(0, fe).reduce((s, x) => s + (x.strokesLost ?? 0), 0);
 return <td className="fw-700 fs-10" style={{ ...colOut, color: sc2(outSL, 0) }}>{fD(outSL)}</td>;
                        })()}
                      </React.Fragment>
                    );
                  })}
                  {(() => {
                    const inSL = (is9 ? stats.holes.slice(0, hc) : stats.holes.slice(9, hc)).reduce((s, x) => s + (x.strokesLost ?? 0), 0);
 return <td className="fw-700 fs-10" style={{ ...(is9 ? colTot : colIn), color: sc2(inSL, 0) }}>{fD(inSL)}</td>;
                  })()}
 {!is9 && <td className="fw-900 fs-11" style={{ ...colTot, color: sc2(stats.totalStrokesLost, 0) }}>{fD(stats.totalStrokesLost)}</td>}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   Analysis View — KPIs, Histogram, Trajectory, Records, WHS, Last 20, Cross
   ──────────────────────────────────────────────────────────────────────────────────────── */

function AnalysisView({ data }: { data: PlayerPageData }) {
  const [histPeriod, setHistPeriod] = useState(12);
  const [recPeriod, setRecPeriod] = useState(12);
  const [trajPeriod, setTrajPeriod] = useState(12);

  // Flatten all rounds desc
  const allRoundsDesc = useMemo(() => {
    const arr: (RoundData & { course: string })[] = [];
    data.DATA.forEach(c => c.rounds.forEach(r => arr.push({ ...r, course: c.course })));
    arr.sort((a, b) => (b.dateSort || 0) - (a.dateSort || 0));
    return arr;
  }, [data]);

  const rounds18 = useMemo(() => allRoundsDesc.filter(r => r.holeCount === 18 || (r as RoundData & { hc?: number }).hc === 18), [allRoundsDesc]);
  const rounds18g = useMemo(() => rounds18.filter(r => numSafe(r.gross) != null && Number(r.gross) > 50 && Number(r.gross) < 200), [rounds18]);

  // KPIs
  const last5 = rounds18g.slice(0, 5);
  const last20 = rounds18g.slice(0, 20);
  const grossAll = rounds18g.map(r => Number(r.gross));
  const kpiGross5 = meanArr(last5.map(r => r.gross));
  const kpiGross20 = meanArr(last20.map(r => r.gross));
  const _kpiSigma = stdevArr(grossAll);
  const sorted = [...grossAll].sort((a, b) => a - b);
  const n20 = sorted.length ? Math.max(1, Math.floor(sorted.length * 0.2)) : 0;
  const _best20 = n20 ? meanArr(sorted.slice(0, n20)) : null;

  // whs20 = last 20 rounds WITH a valid SD (real WHS window — treino rounds count too)
  const whs20 = useMemo(() =>
    allRoundsDesc.filter(r => numSafe(r.sd) != null).slice(0, 20),
    [allRoundsDesc]
  );

  // whsPosMap: scoreId → position 1-20 in the WHS window
  const whsPosMap = useMemo(() => {
    const m = new Map<string, number>();
    whs20.forEach((r, i) => m.set(r.scoreId, i + 1));
    return m;
  }, [whs20]);

  // Display table: all non-training rounds up to (and including) the 20th WHS round + a few extra
  const last20Table = useMemo(() => {
    const nonTraining = allRoundsDesc.filter(r => !r._isTreino);
    // Find index of the 20th WHS round in the full list
    const last20thId = whs20.length === 20 ? whs20[19].scoreId : null;
    const cutoffIdx  = last20thId
      ? nonTraining.findIndex(r => r.scoreId === last20thId)
      : -1;
    const showUntil = Math.max(25, cutoffIdx + 4);
    return nonTraining.slice(0, showUntil);
  }, [allRoundsDesc, whs20]);

  // Best 8 SD in WHS window — Map<scoreId, rank (1-8)>
  const best8 = useMemo(() => {
    const indexed = whs20.map(r => ({ id: r.scoreId, sd: numSafe(r.sd)! }))
      .sort((a, b) => a.sd - b.sd);
    const map = new Map<string, number>();
    indexed.slice(0, 8).forEach((x, rank) => map.set(x.id, rank + 1));
    return map;
  }, [whs20]);

  // Period filter for analysis — only 18-hole rounds with valid gross (consistent with KPI cards)
  function filterByPeriod(months: number): (RoundData & { course: string })[] {
    if (months <= 0) return rounds18g;
    const cutoff = Date.now() - months * 30.44 * 24 * 3600 * 1000;
    return rounds18g.filter(r => r.dateSort >= cutoff);
  }

  // ── Extra KPI calculations ───────────────────────────────────────────────
  const rounds18sd = useMemo(() =>
    rounds18.filter(r => numSafe(r.sd) != null).slice(0, 20), [rounds18]);
  const sdLast5  = useMemo(() => meanArr(rounds18sd.slice(0, 5).map(r => Number(r.sd))), [rounds18sd]);
  const sdLast20 = useMemo(() => meanArr(rounds18sd.map(r => Number(r.sd))), [rounds18sd]);
  const sdSigma  = useMemo(() => stdevArr(rounds18sd.map(r => Number(r.sd))), [rounds18sd]);
  const bestSdRound = useMemo(() => {
    const valid = rounds18.filter(r => numSafe(r.sd) != null);
    if (!valid.length) return null;
    return valid.reduce((best, r) => Number(r.sd) < Number(best.sd) ? r : best);
  }, [rounds18]);
  const sdTrend = useMemo(() => {
    const recent = rounds18sd.slice(0, 10);
    if (recent.length < 3) return null;
    const chronological = [...recent].reverse().map(r => Number(r.sd));
    const slope = linearSlope(chronological);
    return slope != null ? { slope, n: recent.length } : null;
  }, [rounds18sd]);

  return (
    <div className="an-wrap">

      {/* ── KPIs ── */}
      <CollapseCard title="Indicadores" icon="📊" defaultOpen={false}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <KPICard title="SD Médio · Últ. 5" val={sdLast5?.toFixed(1) ?? null}
            delta={sdLast5 != null && sdLast20 != null ? sdLast5 - sdLast20 : null}
            deltaLabel="vs últ. 20"
            sub={`${Math.min(5, rounds18sd.length)} rondas com SD`}
            tip="Média do Score Diferencial das últimas 5 rondas de 18B. Negativo = a melhorar vs média longa." />
          <KPICard title="SD Médio · Últ. 20" val={sdLast20?.toFixed(1) ?? null}
            sub={`${rounds18sd.length} rondas com SD`}
            tip="Média dos Score Diferenciais das últimas 20 rondas de 18 buracos." />
          <KPICard title="Consistência (σ SD)" val={sdSigma?.toFixed(1) ?? null}
            sub="Desvio padrão do SD"
            tip="Desvio padrão do Score Diferencial. Menor = mais consistente." />
          <KPICard title="Melhor SD (carreira)"
            val={bestSdRound ? Number(bestSdRound.sd).toFixed(1) : null}
            sub={bestSdRound ? `${shortDate(bestSdRound.date)} · ${(bestSdRound as any).course ?? ""}` : undefined}
            accent="var(--color-good)"
            tip="Melhor Score Diferencial de sempre." />
          <KPICard title="Gross Médio · Últ. 5" val={kpiGross5?.toFixed(1) ?? null}
            delta={kpiGross5 != null && kpiGross20 != null ? kpiGross5 - kpiGross20 : null}
            deltaLabel="vs últ. 20"
            sub={`${last5.length} rondas 18B`} />
          <KPICard title="Tendência SD (últ. 10)"
            val={sdTrend != null ? `${sdTrend.slope > 0 ? "+" : ""}${sdTrend.slope.toFixed(2)}` : null}
            sub={sdTrend ? `por ronda · ${sdTrend.n} rondas analisadas` : "mín. 3 rondas necessárias"}
            accent={sdTrend != null
              ? sdTrend.slope < -0.1 ? "var(--color-good)"
              : sdTrend.slope > 0.1  ? "var(--color-danger)"
              : "var(--text-3)" : undefined}
            tip="Inclinação da regressão linear dos SDs das últimas 10 rondas. Negativo = a melhorar por ronda jogada. Independente do tempo." />
        </div>
      </CollapseCard>

      {/* ── Histogram + Trajectory + Records ── */}
      <CollapseCard title="Distribuição · Trajectória · Recordes" icon="📈" defaultOpen={false}>
        <div className="an-grid3" style={{ marginBottom: 0 }}>
          <HistogramCard rounds={filterByPeriod(histPeriod)} period={histPeriod} setPeriod={setHistPeriod} />
          <TrajectoryCard rounds={filterByPeriod(trajPeriod)} period={trajPeriod} setPeriod={setTrajPeriod} />
          <RecordsCard rounds={filterByPeriod(recPeriod)} period={recPeriod} setPeriod={setRecPeriod} />
        </div>
      </CollapseCard>

      {/* ── WHS Detail ── */}
      <CollapseCard title="Handicap — Detalhe WHS" icon="🏌️" defaultOpen={false}>
        <WHSDetail hcp={data.HCP_INFO} bare />
      </CollapseCard>

      {/* ── Round Simulator (SD + Próxima Ronda combinados) ── */}
      <CollapseCard title="Simulador de Rondas" icon="🎯" defaultOpen={false}>
        <RoundSimulator hcp={data.HCP_INFO} whs20={whs20} playerData={data} bare />
      </CollapseCard>

      {/* ── Last 20 Table ── */}
      <CollapseCard title="Janela WHS — Últimas Rondas" icon="📋" defaultOpen={false}>
        <Last20Table data={data} last20Table={last20Table} best8={best8} whsPosMap={whsPosMap} bare />
      </CollapseCard>

      {/* ── Cross Analysis ── */}
      <CollapseCard title="Análise por Campo" icon="🗺️" defaultOpen={false}>
        <CrossAnalysis data={data} bare />
      </CollapseCard>

    </div>
  );
}

/* ─── KPI Card ─── */
function KPICard({ title, val, sub, delta, deltaLabel, tip, accent }: {
  title: string; val: string | null; sub?: string;
  delta?: number | null; deltaLabel?: string;
  tip?: string; accent?: string;
}) {
  const dColor = delta == null ? undefined
    : delta < -0.05 ? "var(--color-good)"
    : delta > 0.05  ? "var(--color-danger)"
    : "var(--text-3)";
  return (
    <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--bg-detail)",
      display: "flex", flexDirection: "column", gap: 3, minWidth: 120 }}>
      <div className="uppercase" style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em" }}>
        {title}{tip && <span className="kpi-info" title={tip} style={{ marginLeft: 4 }}>ℹ</span>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ?? "var(--text-1)", lineHeight: 1.1 }}>
        {val ?? <span style={{ color: "var(--text-3)" }}>–</span>}
      </div>
      {delta != null && (
        <div style={{ fontSize: 11, fontWeight: 700, color: dColor }}>
          {delta > 0 ? "+" : ""}{delta.toFixed(1)} {deltaLabel ?? "vs média"}
        </div>
      )}
      {sub && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ─── Histogram ─── */
function HistogramCard({ rounds, period, setPeriod }: {
  rounds: (RoundData & { course: string })[]; period: number; setPeriod: (n: number) => void;
}) {
  const bins = useMemo(() => {
    const defs = [
      { label: "Excepcional (≤0)", min: -999, max: 0, color: "var(--tier-exceptional)" },
      { label: "Bom (+1 a +5)", min: 1, max: 5, color: "var(--tier-good)" },
      { label: "Razoável (+6 a +10)", min: 6, max: 10, color: "var(--tier-fair)" },
      { label: "Difícil (+11 a +15)", min: 11, max: 15, color: "var(--chart-4)" },
      { label: "Fraco (+16 a +20)", min: 16, max: 20, color: "var(--tier-weak)" },
      { label: "Mau (+21 a +25)", min: 21, max: 25, color: "var(--tier-bad)" },
      { label: "Desastroso (>+25)", min: 26, max: 999, color: "var(--color-danger-dark)" },
    ];
    const diffs: number[] = [];
    for (const r of rounds) {
      if (r.gross != null && r.par != null && Number(r.par) > 0) {
        const diff = Number(r.gross) - Number(r.par);
        diffs.push(diff);
      }
    }
    let maxCount = 0;
    const result = defs.map(d => {
      const count = diffs.filter(v => v >= d.min && v <= d.max).length;
      if (count > maxCount) maxCount = count;
      return { ...d, count };
    });
    const avg = meanArr(diffs) ?? 0;
    const sorted = [...diffs].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)] || 0;
    return { bins: result, maxCount, total: diffs.length, avg, median };
  }, [rounds]);

  return (
    <div className="card">
      <div className="d-flex justify-between items-center mb-8">
        <div className="h-xs m-0">Desempenho vs Par</div>
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>
      {bins.total === 0 ? <div className="muted">Sem dados</div> :
        <>
          {bins.bins.map(b => (
            <div key={b.label} className="an-hist-row">
              <div className="an-hist-label">{b.label}</div>
              <div className="an-hist-bar-wrap">
                <div className="an-hist-bar" style={{
                  width: `${bins.maxCount > 0 ? Math.max(4, (b.count / bins.maxCount) * 100) : 4}%`,
                  background: b.color
                }}>{b.count > 0 ? b.count : ""}</div>
              </div>
            </div>
          ))}
          <div className="muted mt-6 ta-c fs-11">
            {bins.total} rondas · Média: +{bins.avg.toFixed(1)} · Mediana: +{bins.median.toFixed(0)}
          </div>
        </>
      }
    </div>
  );
}

/* ─── Trajectory ─── */
function TrajectoryCard({ rounds, period, setPeriod }: {
  rounds: (RoundData & { course: string })[]; period: number; setPeriod: (n: number) => void;
}) {
  const stats = useMemo(() => {
    const grosses: number[] = [];
    for (const r of rounds) {
      if (r.gross != null) {
        grosses.push(Number(r.gross));
      }
    }
    if (grosses.length < 3) return null;
    const overall = grosses.reduce((a, b) => a + b, 0) / grosses.length;
    const last5 = grosses.slice(0, Math.min(5, grosses.length));
    const last5avg = last5.reduce((a, b) => a + b, 0) / last5.length;
    const last10 = grosses.slice(0, Math.min(10, grosses.length));
    const last10avg = last10.reduce((a, b) => a + b, 0) / last10.length;
    const diff5 = last5avg - overall;
    const diff10 = last10avg - overall;
    return { overall: overall.toFixed(1), last5: last5avg.toFixed(1), last10: last10avg.toFixed(1), diff5, diff10, n: grosses.length };
  }, [rounds]);

  return (
    <div className="card">
      <div className="d-flex justify-between items-center mb-8">
        <div className="h-xs m-0">Trajectória</div>
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>
      {!stats ? <div className="muted">Poucos dados</div> : (
        <div className="grid-3-tc">
          <div className="bg-detail br-lg jog-cross-pad">
            <div className="muted fs-10">ÚLTIMAS 5</div>
            <div className="kpi-val">{stats.last5}</div>
 <div className="fw-600 fs-11" style={{ color: sc3m(stats.diff5, 1, 1) }}>
              {fmtSign(stats.diff5, 1)}
            </div>
          </div>
          <div className="bg-detail br-lg jog-cross-pad">
            <div className="muted fs-10">ÚLTIMAS 10</div>
            <div className="kpi-val">{stats.last10}</div>
 <div className="fw-600 fs-11" style={{ color: sc3m(stats.diff10, 1, 1) }}>
              {fmtSign(stats.diff10, 1)}
            </div>
          </div>
          <div className="bg-detail br-lg jog-cross-pad">
            <div className="muted fs-10">CARREIRA</div>
            <div className="kpi-val">{stats.overall}</div>
            <div className="muted fs-10">{stats.n} rondas</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Records ─── */
function RecordsCard({ rounds, period, setPeriod }: {
  rounds: (RoundData & { course: string })[]; period: number; setPeriod: (n: number) => void;
}) {
  const records = useMemo(() => {
    const r18 = rounds.filter(r => r.holeCount === 18 && numSafe(r.gross) != null && Number(r.gross) > 50 && Number(r.gross) < 200);
    if (r18.length === 0) return null;
    const byGross = [...r18].sort((a, b) => Number(a.gross) - Number(b.gross));
    const bySd = [...r18].filter(r => r.sd != null).sort((a, b) => Number(a.sd) - Number(b.sd));
    const byStb = [...r18].filter(r => r.stb != null).sort((a, b) => Number(b.stb!) - Number(a.stb!));
    return {
      bestGross: byGross[0],
      bestSd: bySd[0],
      bestStb: byStb[0],
      worstGross: byGross[byGross.length - 1],
    };
  }, [rounds]);

  function RecLine({ label, r, field }: { label: string; r: RoundData & { course: string } | undefined; field: "gross" | "sd" | "stb" }) {
    if (!r) return null;
    const val = field === "gross" ? r.gross : field === "sd" ? r.sd : r.stb;
    return (
      <div className="jog-field-line">
        <span>{label}</span>
        <span><b>{val}</b> <span className="muted">({shortDate(r.date)} · {r.course})</span></span>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="d-flex justify-between items-center mb-8">
        <div className="h-xs m-0">Recordes Pessoais</div>
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>
      {!records ? <div className="muted">Sem dados</div> : (
        <div>
          <RecLine label="🏆 Melhor Gross" r={records.bestGross} field="gross" />
          <RecLine label="📉 Melhor SD" r={records.bestSd} field="sd" />
          <RecLine label="⭐ Melhor Stb" r={records.bestStb} field="stb" />
          <RecLine label="💀 Pior Gross" r={records.worstGross} field="gross" />
        </div>
      )}
    </div>
  );
}

/* ─── WHS Detail ─── */
/* ─── Reusable collapsible card wrapper ─── */
function CollapseCard({ title, icon, defaultOpen = false, children, badge }: {
  title: string; icon?: string; defaultOpen?: boolean;
  children: React.ReactNode; badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => (e.key === "Enter" || e.key === " ") && setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", marginBottom: open ? 12 : 0 }}
      >
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        <span className="h-xs" style={{ margin: 0, flex: 1 }}>{title}</span>
        {badge}
        <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 4 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && children}
    </div>
  );
}

function WHSDetail({ hcp, bare }: { hcp: HcpInfo; bare?: boolean }) {
  const Wrap = ({ children }: { children: React.ReactNode }) =>
    bare ? <>{children}</> : <div className="card"><div className="h-xs">Handicap — Detalhe WHS</div>{children}</div>;
  if (hcp.current == null) {
    return <Wrap><div className="muted">Sem dados WHS disponíveis</div></Wrap>;
  }
  return (
    <Wrap>
      <div className="jog-record-grid">
        <div className="card-stat-green">
          <div className="muted fs-10">MÍNIMO ATINGIDO</div>
          <div className="jog-big-val c-par-ok">{hcp.lowHcp?.toFixed(1) ?? "–"}</div>
        </div>
        <div className="card-stat-blue">
          <div className="muted fs-10">ACTUAL</div>
          <div className="jog-big-val c-blue">{hcp.current.toFixed(1)}</div>
          {hcp.lowHcp != null && (
 <div className="fs-11 fw-600" style={{ color: SC.danger }}>+{(hcp.current - hcp.lowHcp).toFixed(1)} do mínimo</div>
          )}
        </div>
        <div className="card-stat-detail">
          <div className="muted fs-10">MÉDIA {hcp.qtyCalc || 8} MELHORES</div>
          <div className="jog-big-val c-text-3">{hcp.scoreAvg?.toFixed(1) ?? "–"}</div>
        </div>
      </div>
 <div className="fs-11 c-text-3 d-flex" style={{ gap: 14, borderTop: "1px solid var(--bg)", paddingTop: 8 }}>
        {hcp.softCap != null && <span>Soft cap: <b>{hcp.softCap.toFixed(1)}</b></span>}
        {hcp.hardCap != null && <span>Hard cap: <b>{hcp.hardCap.toFixed(1)}</b></span>}
        {hcp.qtyScores != null && hcp.qtyCalc != null && (
          <span>Cálculo: <b>{hcp.qtyCalc}</b> de <b>{hcp.qtyScores}</b> scores
            {hcp.adjustTotal != null && hcp.adjustTotal !== 0 && ` (ajuste: ${hcp.adjustTotal})`}
          </span>
        )}
      </div>
    </Wrap>
  );
}

/* ─── SD Simulator ─── */
function whsQtyCalc(nSds: number): number {
  if (nSds < 3) return 0;
  if (nSds <= 5) return 1;
  if (nSds <= 8) return 2;
  if (nSds <= 11) return 3;
  if (nSds <= 14) return 4;
  if (nSds <= 16) return 5;
  if (nSds <= 18) return 6;
  if (nSds === 19) return 7;
  return 8;
}

/* ─── Round Simulator: SD directo ou Campo+Tee+Gross, múltiplas rondas sequenciais ─── */
function RoundSimulator({ hcp, whs20, playerData, bare }: {
  hcp: HcpInfo;
  whs20: (RoundData & { course: string })[];
  playerData: PlayerPageData;
  bare?: boolean;
}) {
  type SimRound = {
    id: string; mode: 'sd' | 'course';
    sdInput: string; courseKey: string; teeId: string; grossInput: string;
  };
  type PoolEntry = {
    eid: string; sd: number; adj: number;
    isSimulated: boolean; roundIdx: number;
    origRound?: RoundData & { course: string };
  };
  type RoundResult = {
    roundId: string; roundIdx: number;
    sd: number | null; sdInPool: number | null;
    exceptionalAdj: number; exceptionalDiff: number;
    hiBeforeRound: number; hiAfterRound: number; delta: number;
    entersTop: boolean; topRank: number | null;
    poolBefore: PoolEntry[]; poolAfter: PoolEntry[];
    displaced: PoolEntry | null;
    courseName: string; teeLabel: string;
    cr: number | null; slope: number | null; par: number | null;
    gross: number | null; valid: boolean;
  };

  const { simCourses: courses } = useAppContext();
  const { fedId: urlFedId }     = useParams<{ fedId?: string }>();
  const currentHI               = hcp.current;
  const nextIdRef               = useRef(1);
  const newId                   = () => `sr_${nextIdRef.current++}`;
  const storageKey              = urlFedId ? `sim_rounds_v2_${urlFedId}` : null;
  const [savedTs, setSavedTs]   = useState<number | null>(null);

  // ── Dados de campos ──
  const playedNormSet = useMemo(() => {
    const s = new Set<string>();
    playerData.DATA.forEach(c => s.add(norm(c.course)));
    return s;
  }, [playerData]);

  const allRatedCourses = useMemo(() => {
    if (!courses?.length) return [];
    const valid = courses.filter(c =>
      c.master.tees.some(t =>
        t.ratings.holes18?.courseRating != null && t.ratings.holes18?.slopeRating != null
      )
    );
    const played   = valid.filter(c => playedNormSet.has(norm(c.master.name)));
    const unplayed = valid.filter(c => !playedNormSet.has(norm(c.master.name)));
    unplayed.sort((a, b) => a.master.name.localeCompare(b.master.name));
    return [...played, ...unplayed];
  }, [courses, playedNormSet]);

  const defaultCourseKey = allRatedCourses[0]?.courseKey ?? '';

  // ── Estado das rondas — carregado do localStorage se existir ──
  const [rounds, setRounds] = useState<SimRound[]>(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return [{ id: 'sr_0', mode: 'sd', sdInput: '', courseKey: '', teeId: '', grossInput: '' }];
  });

  // Actualizar courseKey default quando cursos carregam
  useEffect(() => {
    if (defaultCourseKey) {
      setRounds(prev => prev.map(r => r.courseKey ? r : { ...r, courseKey: defaultCourseKey }));
    }
  }, [defaultCourseKey]);

  // ── Ajuste sistema ──
  const currentRawAvg = useMemo(() => {
    const qty = whsQtyCalc(whs20.length);
    if (qty === 0 || currentHI == null) return null;
    const sorted = whs20.map(r => numSafe(r.sd)).filter((v): v is number => v != null)
      .map(Number).sort((a, b) => a - b);
    return meanArr(sorted.slice(0, qty)) ?? null;
  }, [whs20, currentHI]);
  const totalAdjustment = (currentHI != null && currentRawAvg != null) ? currentHI - currentRawAvg : 0;

  // ── Pool inicial ──
  const initialPool = useMemo((): PoolEntry[] =>
    whs20.map(r => ({
      eid: r.scoreId, sd: numSafe(r.sd) ?? 0, adj: 0,
      isSimulated: false, roundIdx: -1, origRound: r,
    })).filter(e => !isNaN(e.sd)),
  [whs20]);

  // ── Helpers campos/tees ──
  function getValidTees(courseKey: string) {
    const c = allRatedCourses.find(x => x.courseKey === courseKey);
    if (!c) return [];
    return c.master.tees.filter(t =>
      t.ratings.holes18?.courseRating != null && t.ratings.holes18?.slopeRating != null
    );
  }
  function getEffectiveTeeId(r: SimRound) {
    return r.teeId || getValidTees(r.courseKey)[0]?.teeId || '';
  }
  function getTeeRatings(courseKey: string, teeId: string) {
    const c    = allRatedCourses.find(x => x.courseKey === courseKey);
    const tees = getValidTees(courseKey);
    const tee  = tees.find(t => t.teeId === teeId) ?? tees[0] ?? null;
    return {
      cr: tee?.ratings.holes18?.courseRating ?? null,
      slope: tee?.ratings.holes18?.slopeRating ?? null,
      par: tee?.ratings.holes18?.par ?? 72,
      teeName: tee?.teeName ?? '',
      courseName: c?.master.name ?? '',
    };
  }

  // ── Mutações de rondas ──
  function addRound() {
    const last = rounds[rounds.length - 1];
    setRounds(prev => [...prev, {
      id: newId(), mode: last?.mode ?? 'sd', sdInput: '',
      courseKey: last?.courseKey || defaultCourseKey,
      teeId: '', grossInput: '',
    }]);
  }
  function removeRound(id: string) {
    setRounds(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  }
  function updateRound(id: string, patch: Partial<SimRound>) {
    setRounds(prev => prev.map(r =>
      r.id === id
        ? { ...r, ...patch, ...(patch.courseKey && patch.courseKey !== r.courseKey ? { teeId: '' } : {}) }
        : r
    ));
  }
  function clearAll() {
    setRounds([{ id: newId(), mode: 'sd', sdInput: '', courseKey: defaultCourseKey, teeId: '', grossInput: '' }]);
    if (storageKey) localStorage.removeItem(storageKey);
    setSavedTs(null);
  }

  // ── Persistência ──
  function saveNow() {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(rounds));
      setSavedTs(Date.now());
    } catch {}
  }
  function loadSaved() {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setRounds(parsed);
      }
    } catch {}
  }
  const hasSaved = !!storageKey && (() => {
    try { return !!localStorage.getItem(storageKey); } catch { return false; }
  })();

  // ── Simulação sequencial ──
  const simResults = useMemo(() => {
    if (currentHI == null || initialPool.length === 0) return null;
    const initSorted = [...initialPool].sort((a, b) => (a.sd + a.adj) - (b.sd + b.adj));
    const initQty    = whsQtyCalc(initialPool.length);
    const oldTopIds  = new Set(initSorted.slice(0, initQty).map(e => e.eid));
    let pool: PoolEntry[] = [...initialPool];
    let curHI = currentHI;
    const results: RoundResult[] = [];

    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i];
      let sd: number | null = null;
      let cr: number | null = null, slope: number | null = null, par: number | null = null;
      let gross: number | null = null;
      let courseName = '', teeLabel = '';

      if (round.mode === 'sd') {
        const v = parseFloat(round.sdInput.replace(',', '.'));
        if (!isNaN(v)) sd = v;
        courseName = 'Ronda simulada';
      } else {
        const teeId = getEffectiveTeeId(round);
        const rat   = getTeeRatings(round.courseKey, teeId);
        cr = rat.cr; slope = rat.slope; par = rat.par;
        courseName = rat.courseName; teeLabel = rat.teeName;
        const g = parseInt(round.grossInput);
        if (!isNaN(g) && cr != null && slope != null) {
          gross = g; sd = Math.round(calcSD(g, cr, slope) * 10) / 10;
        }
      }

      const poolBefore = [...pool];
      if (sd == null) {
        results.push({
          roundId: round.id, roundIdx: i, sd: null, sdInPool: null,
          exceptionalAdj: 0, exceptionalDiff: 0,
          hiBeforeRound: curHI, hiAfterRound: curHI, delta: 0,
          entersTop: false, topRank: null,
          poolBefore, poolAfter: pool, displaced: null,
          courseName, teeLabel, cr, slope, par, gross, valid: false,
        });
        break;
      }

      const exceptionalDiff = curHI - sd;
      const exceptionalAdj  = exceptionalDiff >= 10 ? -2 : exceptionalDiff >= 7 ? -1 : 0;
      const newEntry: PoolEntry = { eid: round.id, sd, adj: exceptionalAdj, isSimulated: true, roundIdx: i };
      const kept     = pool.slice(0, 19).map(e => ({ ...e, adj: e.adj + exceptionalAdj }));
      const displaced = pool.length >= 20 ? { ...pool[19], adj: pool[19].adj + exceptionalAdj } : null;
      const newPool: PoolEntry[] = [newEntry, ...kept];

      const adjEntries = newPool.map(e => ({ eid: e.eid, adjSd: e.sd + e.adj }))
        .filter(x => !isNaN(x.adjSd)).sort((a, b) => a.adjSd - b.adjSd);
      const qty       = whsQtyCalc(newPool.length);
      const topSlice  = adjEntries.slice(0, qty);
      const entersTop = topSlice.some(x => x.eid === round.id);
      const topRank   = entersTop ? topSlice.findIndex(x => x.eid === round.id) + 1 : null;
      const avg       = meanArr(topSlice.map(x => x.adjSd));
      const newHI     = avg != null ? Math.round((avg + totalAdjustment) * 10) / 10 : curHI;

      results.push({
        roundId: round.id, roundIdx: i, sd, sdInPool: sd + exceptionalAdj,
        exceptionalAdj, exceptionalDiff,
        hiBeforeRound: curHI, hiAfterRound: newHI, delta: newHI - curHI,
        entersTop, topRank,
        poolBefore, poolAfter: newPool, displaced,
        courseName, teeLabel, cr, slope, par, gross, valid: true,
      });
      pool = newPool; curHI = newHI;
    }
    return { results, finalPool: pool, finalHI: curHI, oldTopIds };
  }, [rounds, initialPool, currentHI, totalAdjustment, allRatedCourses]);

  // ── Top-N do pool final ──
  const { finalTopIds, finalTopRanks } = useMemo(() => {
    if (!simResults) return { finalTopIds: new Set<string>(), finalTopRanks: new Map<string, number>() };
    const sorted = [...simResults.finalPool]
      .map(e => ({ eid: e.eid, adjSd: e.sd + e.adj }))
      .sort((a, b) => a.adjSd - b.adjSd);
    const qty = whsQtyCalc(simResults.finalPool.length);
    const topIds   = new Set(sorted.slice(0, qty).map(x => x.eid));
    const topRanks = new Map<string, number>();
    sorted.slice(0, qty).forEach((x, i) => topRanks.set(x.eid, i + 1));
    return { finalTopIds: topIds, finalTopRanks: topRanks };
  }, [simResults]);

  // ── Tabela gross→HCP (última ronda em modo Campo válida) ──
  const grossTable = useMemo(() => {
    if (!simResults) return null;
    const validRes = simResults.results.filter(r => r.valid);
    if (!validRes.length) return null;
    const last = validRes[validRes.length - 1];
    if (last.cr == null || last.slope == null) return null;
    const { cr, slope, par = 72, poolBefore, hiBeforeRound, roundIdx, gross: enteredGross } = last;
    const rows: { gross: number; sd: number; newHI: number; delta: number; entersTop: boolean; toPar: number; exceptionalAdj: number; isEntered: boolean }[] = [];
    for (let g = par - 10; g <= par + 35; g++) {
      const sd      = Math.round(calcSD(g, cr!, slope!) * 10) / 10;
      const excDiff = hiBeforeRound - sd;
      const excAdj  = excDiff >= 10 ? -2 : excDiff >= 7 ? -1 : 0;
      const newEntry = { eid: '__gt__', sd, adj: excAdj, isSimulated: true, roundIdx: -1 };
      const kept     = poolBefore.slice(0, 19).map(e => ({ ...e, adj: e.adj + excAdj }));
      const newPool  = [newEntry, ...kept];
      const adjE     = newPool.map(e => ({ eid: e.eid, adjSd: e.sd + e.adj })).filter(x => !isNaN(x.adjSd)).sort((a, b) => a.adjSd - b.adjSd);
      const qty      = whsQtyCalc(newPool.length);
      const entersTop = adjE.slice(0, qty).some(x => x.eid === '__gt__');
      const avg      = meanArr(adjE.slice(0, qty).map(x => x.adjSd));
      if (avg == null) continue;
      const newHI = Math.round((avg + totalAdjustment) * 10) / 10;
      rows.push({ gross: g, sd, newHI, delta: newHI - hiBeforeRound, entersTop, toPar: g - par!, exceptionalAdj: excAdj, isEntered: g === enteredGross });
    }
    return { rows, par, cr, slope, roundIdx };
  }, [simResults, totalAdjustment]);

  // ── Rondas deslocadas ──
  const displacedEntries = useMemo(() =>
    simResults?.results.filter(r => r.valid && r.displaced).map(r => r.displaced!) ?? [],
  [simResults]);

  // ── Exportar PDF ──
  function exportPDF() {
    if (!simResults) return;
    const validRes   = simResults.results.filter(r => r.valid);
    const finalHIv   = simResults.finalHI;
    const finalDelta = finalHIv - (currentHI ?? 0);
    const playerName = (playerData as any)?.META?.name ?? '';
    const fedNum     = (playerData as any)?.META?.fed ?? urlFedId ?? '';
    const dateStr    = new Date().toLocaleDateString('pt-PT');
    const timeStr    = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

    // Cores das pills de SD — replicam exactamente .p-sd-excellent / .p-sd-good / .p-sd-poor
    const SD_EXCELLENT = { bg: '#22c55e', fg: '#fff' };   // sd ≤ HI
    const SD_GOOD      = { bg: '#fef08a', fg: '#713f12' }; // sd ≤ HI+3
    const SD_POOR      = { bg: '#ef4444', fg: '#fff' };   // sd > HI+3

    function sdColor(sd: number, hi: number | null) {
      if (hi == null || !isFinite(sd)) return { bg: '#e5e7eb', fg: '#6b7280' };
      if (sd <= hi)     return SD_EXCELLENT;
      if (sd <= hi + 3) return SD_GOOD;
      return SD_POOR;
    }
    function sdPill(sd: number, hi: number | null, adj = 0) {
      const displaySd = sd + adj;
      const c = sdColor(displaySd, hi);
      const adjNote = adj !== 0 ? `<span style="font-size:9px;opacity:.8;margin-left:3px">(${adj > 0 ? '+' : ''}${adj})</span>` : '';
      return `<span style="background:${c.bg};color:${c.fg};border-radius:6px;padding:2px 7px;font-size:11px;font-weight:700;display:inline-block;white-space:nowrap">${displaySd.toFixed(1)}${adjNote}</span>`;
    }

    const goodClr    = '#16a34a';
    const badClr     = '#dc2626';
    const excClr     = '#b45309';
    const neutralClr = '#374151';
    const mutedClr   = '#9ca3af';

    function deltaColor(d: number) { return d < -0.05 ? goodClr : d > 0.05 ? badClr : neutralClr; }
    function deltaBg(d: number)    { return d < -0.05 ? '#f0fdf4' : d > 0.05 ? '#fef2f2' : '#f9fafb'; }
    function deltaBorder(d: number){ return d < -0.05 ? '#86efac' : d > 0.05 ? '#fca5a5' : '#e5e7eb'; }

    // ── Timeline ─────────────────────────────────────────────────────────
    const tlItems = [
      `<div class="tl-box tl-start">
        <div class="tl-lbl">Actual</div>
        <div class="tl-hi" style="color:${neutralClr}">${currentHI!.toFixed(1)}</div>
        <div class="tl-sub">${whsQtyCalc(initialPool.length)} mel./${initialPool.length}</div>
      </div>`,
    ];
    validRes.forEach((r, i) => {
      tlItems.push(
        `<div class="tl-arrow">→</div>
        <div class="tl-box" style="background:${deltaBg(r.delta)};border-color:${deltaBorder(r.delta)}">
          <div class="tl-lbl">R${i + 1}${r.exceptionalAdj !== 0 ? ' ⚡' : ''}</div>
          <div class="tl-hi" style="color:${deltaColor(r.delta)}">${r.hiAfterRound.toFixed(1)}</div>
          <div class="tl-sub" style="color:${deltaColor(r.delta)}">${r.delta > 0 ? '+' : ''}${r.delta.toFixed(1)}</div>
        </div>`
      );
    });
    if (validRes.length > 1) {
      tlItems.push(
        `<div class="tl-arrow" style="font-weight:700">═</div>
        <div class="tl-box tl-final" style="background:${deltaBg(finalDelta)};border:2px solid ${deltaBorder(finalDelta)}">
          <div class="tl-lbl">Final</div>
          <div class="tl-hi" style="color:${deltaColor(finalDelta)};font-size:26px">${finalHIv.toFixed(1)}</div>
          <div class="tl-sub" style="color:${deltaColor(finalDelta)}">${finalDelta > 0 ? '+' : ''}${finalDelta.toFixed(1)} total</div>
        </div>`
      );
    }

    // ── Cards de ronda ────────────────────────────────────────────────────
    const roundCards = validRes.map((r, i) => {
      const clr = deltaColor(r.delta);
      const brd = r.exceptionalAdj !== 0 ? excClr : r.delta < -0.05 ? goodClr : r.delta > 0.05 ? badClr : '#d1d5db';
      const modeLabel = r.cr != null
        ? `⛳ <b>${r.courseName}</b>${r.teeLabel ? ` — ${r.teeLabel}` : ''} <span style="color:${mutedClr};font-size:10px">CR ${r.cr} / Slope ${r.slope} / Par ${r.par}</span>`
        : `📊 SD directo`;
      const inputLine = r.gross != null
        ? `Gross: <b>${r.gross}</b> pancadas`
        : `SD introduzido: <b>${r.sd!.toFixed(1)}</b>`;
      const topBadge = r.entersTop
        ? `<span style="background:#16a34a;color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">★ top-${r.topRank ?? ''}</span> `
        : '';
      const excBadge = r.exceptionalAdj !== 0
        ? `<span style="background:${excClr};color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">⚡ Exceptional ${r.exceptionalAdj === -2 ? '−2' : '−1'}</span>`
        : '';

      return `
      <div style="border:1px solid ${brd};border-left:5px solid ${brd};border-radius:8px;background:${deltaBg(r.delta)};padding:12px 16px;margin-bottom:10px;page-break-inside:avoid">
        <!-- Cabeçalho da ronda -->
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
          <span style="background:${brd};color:#fff;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">${i + 1}</span>
          <span style="font-size:13px;color:${neutralClr}">${modeLabel}</span>
          <span style="margin-left:auto">${topBadge}${excBadge}</span>
        </div>
        <!-- Dados -->
        <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
          <!-- Input + SD pill -->
          <div>
            <div style="font-size:10px;color:${mutedClr};text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Input → SD</div>
            <div style="font-size:12px;display:flex;align-items:center;gap:8px">
              ${inputLine} &nbsp;→&nbsp; ${sdPill(r.sd!, r.hiBeforeRound)}
            </div>
          </div>
          <!-- HCP antes -->
          <div style="text-align:center">
            <div style="font-size:10px;color:${mutedClr};text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">HCP antes</div>
            <div style="font-size:20px;font-weight:700;color:${neutralClr}">${r.hiBeforeRound.toFixed(1)}</div>
          </div>
          <div style="font-size:18px;color:${mutedClr}">→</div>
          <!-- HCP depois -->
          <div style="text-align:center">
            <div style="font-size:10px;color:${mutedClr};text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">HCP depois</div>
            <div style="font-size:28px;font-weight:900;color:${clr};line-height:1">${r.hiAfterRound.toFixed(1)}</div>
          </div>
          <!-- Variação -->
          <div style="text-align:center">
            <div style="font-size:10px;color:${mutedClr};text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Δ HCP</div>
            <div style="font-size:20px;font-weight:800;color:${clr}">${r.delta > 0 ? '+' : ''}${r.delta.toFixed(1)}</div>
          </div>
          ${r.exceptionalAdj !== 0 ? `
          <div style="background:rgba(180,83,9,.08);border:1px solid ${excClr};border-radius:6px;padding:7px 11px;font-size:11px;color:${excClr};max-width:280px;line-height:1.5">
            <b>Exceptional Score (Regra 5.9):</b> SD ${r.sd!.toFixed(1)} está ${r.exceptionalDiff.toFixed(1)} pancadas abaixo do HI ${r.hiBeforeRound.toFixed(1)}.
            Redução de <b>${r.exceptionalAdj}</b> aplicada a todos os ${r.poolAfter.length} SDs.
          </div>` : ''}
        </div>
      </div>`;
    }).join('');

    // ── Tabela WHS final ──────────────────────────────────────────────────
    const poolQty  = whsQtyCalc(simResults.finalPool.length);
    const poolRows = simResults.finalPool.map((e, i) => {
      const r      = e.origRound;
      const isTop  = finalTopIds.has(e.eid);
      const rank   = finalTopRanks.get(e.eid);
      const hasAdj = e.adj !== 0;
      const res    = e.isSimulated ? validRes.find(x => x.roundId === e.eid) : null;
      const rowBg  = e.isSimulated ? '#eff6ff' : isTop ? '#f0fdf4' : i % 2 === 0 ? '#fff' : '#fafafa';
      const lBorder = e.isSimulated ? '#93c5fd' : isTop ? '#86efac' : 'transparent';
      const dateLabel   = e.isSimulated ? `<b style="color:#2563eb">▶ Nova ${(res?.roundIdx ?? 0) + 1}</b>` : (r?.date ?? '—');
      const courseLabel = e.isSimulated ? (res?.courseName ?? '—') : (r?.course ?? '—');
      const hiRef       = e.isSimulated ? (res?.hiBeforeRound ?? currentHI!) : (r?.hi ?? currentHI!);
      const sdOrigPill  = sdPill(e.sd, hiRef ?? currentHI!);
      const sdAdjPill   = hasAdj ? sdPill(e.sd, hiRef ?? currentHI!, e.adj) : '—';
      return `<tr style="background:${rowBg};border-left:3px solid ${lBorder}">
        <td style="padding:5px 8px;color:${mutedClr};font-size:11px;font-weight:700">${i + 1}</td>
        <td style="padding:5px 8px;font-size:11px">${dateLabel}</td>
        <td style="padding:5px 8px;font-size:11px">${courseLabel}${res?.teeLabel ? ` <span style="color:${mutedClr}">— ${res.teeLabel}</span>` : ''}</td>
        <td style="padding:5px 8px;font-size:11px;text-align:right">${r?.hi ?? ''}</td>
        <td style="padding:5px 8px;text-align:right">${sdOrigPill}</td>
        <td style="padding:5px 8px;text-align:right">${sdAdjPill}</td>
        <td style="padding:5px 8px;text-align:center;font-size:11px;font-weight:700;color:${isTop ? goodClr : mutedClr}">${isTop ? `★ #${rank}` : '–'}</td>
      </tr>`;
    }).join('');

    const hasDisplaced = displacedEntries.length > 0;
    const displRows = displacedEntries.map(e => {
      const r = e.origRound;
      const wasTop = simResults.oldTopIds.has(e.eid);
      return `<tr style="opacity:.4">
        <td style="padding:5px 8px;color:${badClr};font-size:11px;font-weight:700">out</td>
        <td style="padding:5px 8px;font-size:11px">${r?.date ?? '—'}</td>
        <td style="padding:5px 8px;font-size:11px">${r?.course ?? '—'}</td>
        <td style="padding:5px 8px;font-size:11px;text-align:right">${r?.hi ?? ''}</td>
        <td style="padding:5px 8px;text-align:right">${sdPill(e.sd, currentHI!)}</td>
        <td style="padding:5px 8px;text-align:right;color:${mutedClr}">—</td>
        <td style="padding:5px 8px;text-align:center;color:${wasTop ? badClr : mutedClr};font-size:11px">${wasTop ? '★ saiu' : '–'}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="pt"><head>
<meta charset="utf-8">
<title>Simulação WHS${playerName ? ' — ' + playerName : ''}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#111827;margin:0;padding:32px 28px;background:#fff}
  h1{font-size:21px;font-weight:900;margin:0 0 3px;letter-spacing:-.3px;color:#111827}
  .meta{font-size:12px;color:${mutedClr};margin:0 0 18px}
  /* KPIs topo */
  .kpis{display:flex;gap:12px;margin-bottom:22px;flex-wrap:wrap}
  .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:10px 18px;text-align:center;min-width:90px}
  .kpi-lbl{font-size:10px;color:${mutedClr};text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
  .kpi-val{font-size:26px;font-weight:900;line-height:1}
  /* Timeline */
  .timeline{display:flex;align-items:stretch;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:22px}
  .tl-box{padding:10px 14px;text-align:center;min-width:82px;display:flex;flex-direction:column;justify-content:center;background:#f9fafb;border:1px solid #e5e7eb}
  .tl-box.tl-start{background:#f3f4f6;border:none}
  .tl-box.tl-final{min-width:90px}
  .tl-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:${mutedClr};font-weight:600;margin-bottom:2px}
  .tl-hi{font-size:21px;font-weight:900;line-height:1}
  .tl-sub{font-size:11px;font-weight:700;margin-top:2px}
  .tl-arrow{display:flex;align-items:center;padding:0 5px;background:#f3f4f6;color:${mutedClr};font-size:15px}
  /* Secções */
  .sec{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${mutedClr};margin:20px 0 8px;padding-bottom:5px;border-bottom:1.5px solid #e5e7eb}
  /* Tabela */
  table{width:100%;border-collapse:collapse}
  thead tr{background:#f3f4f6}
  thead th{padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;font-weight:700;color:#6b7280;text-align:left;border-bottom:2px solid #e5e7eb}
  thead th.r{text-align:right} thead th.c{text-align:center}
  tbody tr{border-bottom:1px solid #f3f4f6}
  .legend{display:flex;gap:14px;margin-bottom:8px;font-size:11px;color:#6b7280;flex-wrap:wrap}
  .dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:middle}
  footer{margin-top:24px;font-size:10px;color:${mutedClr};border-top:1px solid #f3f4f6;padding-top:10px}
  @media print{body{padding:16px 14px}tr{page-break-inside:avoid}.sec{margin-top:14px}}
</style></head>
<body>
  <h1>Simulação WHS${playerName ? ' — ' + playerName : ''}</h1>
  <p class="meta">${fedNum ? 'Federado #' + fedNum + ' · ' : ''}${dateStr} às ${timeStr} · ${validRes.length} ronda${validRes.length !== 1 ? 's' : ''} simulada${validRes.length !== 1 ? 's' : ''}${validRes.some(r => r.exceptionalAdj !== 0) ? ' · ⚡ Exceptional Score' : ''}</p>

  <!-- KPIs -->
  <div class="kpis">
    <div class="kpi">
      <div class="kpi-lbl">HCP Actual</div>
      <div class="kpi-val" style="color:${neutralClr}">${currentHI!.toFixed(1)}</div>
    </div>
    <div class="kpi" style="border-color:${deltaBorder(finalDelta)}">
      <div class="kpi-lbl">HCP Final</div>
      <div class="kpi-val" style="color:${deltaColor(finalDelta)}">${finalHIv.toFixed(1)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Variação Total</div>
      <div class="kpi-val" style="color:${deltaColor(finalDelta)}">${finalDelta > 0 ? '+' : ''}${finalDelta.toFixed(1)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Janela WHS</div>
      <div class="kpi-val" style="color:${neutralClr}">${whsQtyCalc(simResults.finalPool.length)}/${simResults.finalPool.length}</div>
    </div>
  </div>

  <!-- Timeline -->
  <div class="sec">Evolução do Handicap Index</div>
  <div class="timeline">${tlItems.join('')}</div>

  <!-- Rondas -->
  <div class="sec">Detalhe das rondas simuladas</div>
  ${roundCards}

  <!-- Tabela WHS -->
  <div class="sec">Janela WHS final — ${simResults.finalPool.length} rondas (top-${poolQty} entram no cálculo)</div>
  <div class="legend">
    <span><span class="dot" style="background:#bfdbfe"></span>Ronda simulada</span>
    <span><span class="dot" style="background:#bbf7d0"></span>Entra no top-${poolQty}</span>
    <span>${sdPill(currentHI! - 1, currentHI!)} SD ≤ HI (excelente)</span>
    <span>${sdPill(currentHI! + 1, currentHI!)} SD ≤ HI+3 (bom)</span>
    <span>${sdPill(currentHI! + 5, currentHI!)} SD > HI+3 (fraco)</span>
  </div>
  <table>
    <thead><tr>
      <th>#</th><th>Data</th><th>Campo</th>
      <th class="r">HCP</th><th class="r">SD orig.</th><th class="r">SD adj.</th><th class="c">Top</th>
    </tr></thead>
    <tbody>
      ${poolRows}
      ${hasDisplaced ? `<tr><td colspan="7" style="padding:4px 8px;background:#f3f4f6;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${mutedClr}">Deslocadas — saíram da janela</td></tr>${displRows}` : ''}
    </tbody>
  </table>

  <div class="footer">Simulação WHS · SD colorizados: verde = SD ≤ HI (excelente), amarelo = SD ≤ HI+3 (bom), vermelho = SD &gt; HI+3 (fraco) · ⚡ Exceptional Score conforme Regra 5.9 · Os valores são estimativas.</div>
</body></html>`;

    const win = window.open('', '_blank', 'width=960,height=750');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 500);
  }

  if (currentHI == null) return null;

  const validResults = simResults?.results.filter(r => r.valid) ?? [];
  const finalHI      = simResults?.finalHI ?? currentHI;
  const finalDelta   = finalHI - currentHI;
  const finalDColor  = finalDelta < -0.05 ? 'var(--color-good)' : finalDelta > 0.05 ? 'var(--color-danger)' : 'var(--text-2)';
  const qtyCalcCur   = whsQtyCalc(initialPool.length);

  // Cor da borda esquerda do card de ronda
  function roundBorderColor(result?: RoundResult): string {
    if (!result?.valid) return 'var(--border)';
    if (result.exceptionalAdj !== 0) return 'var(--color-warn, #e07b00)';
    if (result.delta < -0.05) return 'var(--color-good)';
    if (result.delta >  0.05) return 'var(--color-danger)';
    return 'var(--border)';
  }

  const inner = (
    <div>
      {/* ── Toolbar: guardar / carregar / PDF / limpar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="muted fs-11">
          Simula rondas sequencialmente — SD directo ou Campo+Tee+Gross.
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {savedTs && (
            <span style={{ fontSize: 10, color: 'var(--color-good)', fontWeight: 600 }}>
              ✓ guardado
            </span>
          )}
          {storageKey && (
            <button onClick={saveNow}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--line)',
                background: 'transparent', cursor: 'pointer', color: 'var(--text-2)', fontWeight: 600 }}>
              💾 Guardar
            </button>
          )}
          {storageKey && hasSaved && (
            <button onClick={loadSaved}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--line)',
                background: 'transparent', cursor: 'pointer', color: 'var(--text-2)' }}>
              📂 Repor
            </button>
          )}
          {validResults.length > 0 && (
            <button onClick={exportPDF}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--line)',
                background: 'transparent', cursor: 'pointer', color: 'var(--chart-2)', fontWeight: 600 }}>
              📄 PDF
            </button>
          )}
          <button onClick={clearAll}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--line)',
              background: 'transparent', cursor: 'pointer', color: 'var(--text-3)' }}>
            ✕ Limpar
          </button>
        </div>
      </div>

      {/* ── Cards das rondas ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {rounds.map((round, idx) => {
          const teeId      = getEffectiveTeeId(round);
          const validTees  = getValidTees(round.courseKey);
          const ratings    = getTeeRatings(round.courseKey, teeId);
          const grossNum   = parseInt(round.grossInput);
          const computedSd = round.mode === 'course' && !isNaN(grossNum) && ratings.cr != null && ratings.slope != null
            ? Math.round(calcSD(grossNum, ratings.cr!, ratings.slope!) * 10) / 10 : null;
          const result     = simResults?.results[idx];
          const hiRef      = result?.hiBeforeRound ?? currentHI;
          const borderClr  = roundBorderColor(result);

          return (
            <div key={round.id} style={{
              border: '1px solid var(--border)',
              borderLeft: `4px solid ${borderClr}`,
              borderRadius: 'var(--radius-xl)',
              background: 'var(--bg-card)',
              padding: '10px 14px',
              transition: 'border-color .15s',
            }}>
              {/* Cabeçalho */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                {/* Número */}
                <span style={{
                  background: borderClr === 'var(--border)' ? 'var(--bg-detail)' : borderClr,
                  color: borderClr === 'var(--border)' ? 'var(--text-2)' : '#fff',
                  borderRadius: '50%', width: 22, height: 22,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, flexShrink: 0,
                }}>{idx + 1}</span>

                {/* Toggle SD / Campo */}
                <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line)', fontSize: 11 }}>
                  {(['sd', 'course'] as const).map(m => (
                    <button key={m} onClick={() => updateRound(round.id, { mode: m })}
                      style={{
                        padding: '3px 10px', border: 'none', cursor: 'pointer',
                        background: round.mode === m ? 'var(--chart-2)' : 'transparent',
                        color: round.mode === m ? '#fff' : 'var(--text-2)',
                        fontWeight: round.mode === m ? 700 : 400,
                      }}>
                      {m === 'sd' ? '📊 SD' : '⛳ Campo'}
                    </button>
                  ))}
                </div>

                {/* Resultado inline */}
                {result?.valid && (
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {result.exceptionalAdj !== 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: '#fff', borderRadius: 4, padding: '2px 6px',
                        background: result.exceptionalAdj === -2 ? 'var(--color-danger)' : 'var(--color-warn, #e07b00)',
                      }}>⚡ {result.exceptionalAdj === -2 ? '−2' : '−1'}</span>
                    )}
                    {result.entersTop && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-good)' }}>★ top-{finalTopRanks.get(round.id) ? `#${finalTopRanks.get(round.id)}` : ''}</span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>HCP</span>
                    <span style={{
                      fontSize: 18, fontWeight: 800, lineHeight: 1,
                      color: result.delta < -0.05 ? 'var(--color-good)' : result.delta > 0.05 ? 'var(--color-danger)' : 'var(--text-1)',
                    }}>{result.hiAfterRound.toFixed(1)}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: result.delta < -0.05 ? 'var(--color-good)' : result.delta > 0.05 ? 'var(--color-danger)' : 'var(--text-3)',
                    }}>({result.delta > 0 ? '+' : ''}{result.delta.toFixed(1)})</span>
                  </div>
                )}

                {/* Remover */}
                {rounds.length > 1 && (
                  <button onClick={() => removeRound(round.id)} title="Remover"
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer',
                      color: 'var(--text-3)', fontSize: 18, padding: '0 2px', lineHeight: 1, marginLeft: result?.valid ? 0 : 'auto' }}>
                    ×
                  </button>
                )}
              </div>

              {/* Inputs */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {round.mode === 'sd' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                    SD:
                    <input type="number" step="0.1" placeholder="ex: 28.5"
                      value={round.sdInput}
                      onChange={e => updateRound(round.id, { sdInput: e.target.value })}
                      style={{ width: 90, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)',
                        background: 'var(--bg-card)', color: 'var(--text-1)', fontSize: 14, fontWeight: 700 }}
                    />
                  </label>
                ) : (
                  <>
                    <select className="select" value={round.courseKey}
                      onChange={e => updateRound(round.id, { courseKey: e.target.value })}
                      style={{ minWidth: 180, maxWidth: 320 }}>
                      {allRatedCourses.map(c => (
                        <option key={c.courseKey} value={c.courseKey}>
                          {playedNormSet.has(norm(c.master.name)) ? '★ ' : ''}{c.master.name}
                        </option>
                      ))}
                    </select>
                    <select className="select" value={teeId}
                      onChange={e => updateRound(round.id, { teeId: e.target.value })}>
                      {validTees.map(t => (
                        <option key={t.teeId} value={t.teeId}>
                          {t.teeName} — CR {t.ratings.holes18!.courseRating} / Slope {t.ratings.holes18!.slopeRating}
                        </option>
                      ))}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                      Gross:
                      <input type="number" step="1" placeholder="ex: 85"
                        value={round.grossInput}
                        onChange={e => updateRound(round.id, { grossInput: e.target.value })}
                        style={{ width: 80, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)',
                          background: 'var(--bg-card)', color: 'var(--text-1)', fontSize: 14, fontWeight: 700 }}
                      />
                    </label>
                    {computedSd != null && (
                      <span className={`p p-${sdClassByHcp(computedSd, hiRef)}`} style={{ fontSize: 13, fontWeight: 800 }}>
                        SD {computedSd.toFixed(1)}
                      </span>
                    )}
                    {ratings.cr != null && (
                      <span className="muted fs-11">CR {ratings.cr} / Slope {ratings.slope} / Par {ratings.par}</span>
                    )}
                  </>
                )}
              </div>

              {/* Exceptional score notice */}
              {result?.valid && result.exceptionalAdj !== 0 && (
                <div style={{
                  marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 11, lineHeight: 1.6,
                  background: 'var(--bg-warn, rgba(224,123,0,0.08))',
                  border: `1px solid ${result.exceptionalAdj === -2 ? 'var(--color-danger)' : 'var(--color-warn, #e07b00)'}`,
                  color: result.exceptionalAdj === -2 ? 'var(--color-danger)' : 'var(--color-warn, #e07b00)',
                }}>
                  ⚡ <b>Exceptional Score:</b> SD {result.sd!.toFixed(1)} é <b>{result.exceptionalDiff.toFixed(1)} pancadas</b> abaixo do HI {result.hiBeforeRound.toFixed(1)}
                  {' '}→ redução de <b>{result.exceptionalAdj}</b> aplicada a todos os {result.poolAfter.length} SDs da janela (Regra 5.9)
                </div>
              )}
            </div>
          );
        })}

        {/* Adicionar ronda */}
        <button onClick={addRound}
          style={{
            border: '1px dashed var(--line)', borderRadius: 'var(--radius-xl)',
            background: 'transparent', cursor: 'pointer',
            padding: '8px 16px', color: 'var(--text-3)', fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          + Adicionar ronda
        </button>
      </div>

      {/* ── Timeline ── */}
      {validResults.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'stretch', gap: 0,
          marginBottom: 16, borderRadius: 10, overflow: 'hidden',
          border: '1px solid var(--border)',
        }}>
          {/* HCP actual */}
          <div style={{ padding: '12px 16px', background: 'var(--bg-detail)', textAlign: 'center', minWidth: 80, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>Actual</div>
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{currentHI.toFixed(1)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{qtyCalcCur} mel./{initialPool.length}</div>
          </div>

          {validResults.map((r, i) => (
            <React.Fragment key={r.roundId}>
              {/* Seta */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', background: 'var(--bg-detail)', color: 'var(--text-3)' }}>→</div>
              {/* Ronda */}
              <div style={{
                padding: '10px 14px', textAlign: 'center', minWidth: 90,
                background: r.delta < -0.05 ? 'rgba(34,197,94,0.08)' : r.delta > 0.05 ? 'rgba(239,68,68,0.08)' : 'var(--bg-card)',
                borderLeft: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>
                  Ronda {i + 1}{r.exceptionalAdj !== 0 ? ' ⚡' : ''}
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1, color: r.delta < -0.05 ? 'var(--color-good)' : r.delta > 0.05 ? 'var(--color-danger)' : 'var(--text-1)' }}>
                  {r.hiAfterRound.toFixed(1)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: r.delta < -0.05 ? 'var(--color-good)' : r.delta > 0.05 ? 'var(--color-danger)' : 'var(--text-3)', marginTop: 2 }}>
                  {r.delta > 0 ? '+' : ''}{r.delta.toFixed(1)}
                </div>
              </div>
            </React.Fragment>
          ))}

          {/* HCP final (se >1 ronda) */}
          {validResults.length > 1 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', background: 'var(--bg-detail)', color: 'var(--text-3)', fontWeight: 700 }}>═</div>
              <div style={{
                padding: '10px 16px', textAlign: 'center', minWidth: 90,
                background: 'var(--bg-detail)', borderLeft: `3px solid ${finalDColor}`,
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>Final</div>
                <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1, color: finalDColor }}>{finalHI.toFixed(1)}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: finalDColor, marginTop: 2 }}>
                  {finalDelta > 0 ? '+' : ''}{finalDelta.toFixed(1)} total
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tabela Gross→HCP ── */}
      {grossTable && (
        <div style={{ marginBottom: 16 }}>
          <div className="muted fs-11 mb-6">
            Tabela de impacto — ronda {grossTable.roundIdx + 1}
            {grossTable.roundIdx > 0 && <span> (após {grossTable.roundIdx} ronda{grossTable.roundIdx > 1 ? 's' : ''} já simulada{grossTable.roundIdx > 1 ? 's' : ''})</span>}
            {' — '}CR {grossTable.cr} / Slope {grossTable.slope} / Par {grossTable.par}
          </div>
          <div className="table-wrap">
            <table className="dtable" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th className="r">Pancadas</th><th className="r">Ao par</th>
                  <th className="r">SD</th><th className="r">HCP</th>
                  <th className="r">Δ</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {grossTable.rows.map(row => {
                  const dc    = row.delta < -0.05 ? 'var(--color-good)' : row.delta > 0.05 ? 'var(--color-danger)' : 'var(--text-3)';
                  const hiRef = simResults!.results[grossTable.roundIdx]?.hiBeforeRound ?? currentHI;
                  return (
                    <tr key={row.gross} style={{
                      background: row.isEntered
                        ? 'var(--bg-active, rgba(59,130,246,0.10))'
                        : row.entersTop ? 'var(--bg-success)' : undefined,
                      opacity: row.delta > 0.7 ? 0.55 : 1,
                      outline: row.isEntered ? '2px solid var(--chart-2)' : undefined,
                    }}>
                      <td className="r fw-700">{row.gross}{row.isEntered && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--chart-2)', fontWeight: 700 }}>◀</span>}</td>
                      <td className="r muted">{row.toPar >= 0 ? '+' : ''}{row.toPar}</td>
                      <td className="r">
                        <span className={`p p-${sdClassByHcp(row.sd, hiRef)}`} style={{ fontSize: 11 }}>{row.sd.toFixed(1)}</span>
                        {row.exceptionalAdj !== 0 && <span style={{ fontSize: 9, marginLeft: 3, color: 'var(--color-warn, #e07b00)', fontWeight: 700 }}>⚡{row.exceptionalAdj}</span>}
                      </td>
                      <td className="r fw-700" style={{ color: dc }}>{row.newHI.toFixed(1)}</td>
                      <td className="r fw-700" style={{ color: dc }}>{row.delta > 0 ? '+' : ''}{row.delta.toFixed(1)}</td>
                      <td style={{ fontSize: 11 }}>
                        {row.entersTop ? <span className="c-par-ok fw-600">★ top-{whsQtyCalc(simResults!.finalPool.length)}</span>
                          : row.delta < -0.05 ? <span style={{ color: 'var(--color-good)' }}>↓ melhora</span>
                          : row.delta > 0.05 ? <span style={{ color: 'var(--color-danger)' }}>↑ agrava</span>
                          : <span className="muted">= sem impacto</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Janela WHS final ── */}
      {simResults && validResults.length > 0 && (
        <div className="table-wrap">
          <div className="muted fs-11 mb-6">
            Janela WHS após simulação — ★ = top-{whsQtyCalc(simResults.finalPool.length)} SDs ·{' '}
            <span style={{ color: 'var(--color-good)', fontWeight: 600 }}>Verde</span> = ronda simulada ·{' '}
            SD adj. = valor após redução excepcional
          </div>
          <table className="dtable" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th className="r">WHS#</th><th>Data</th><th>Campo</th>
                <th className="r">HCP</th><th>Tee</th><th className="r">Gross</th>
                <th className="r">SD</th><th className="r">SD adj.</th><th className="r">Top</th>
              </tr>
            </thead>
            <tbody>
              {simResults.finalPool.map((entry, i) => {
                const r      = entry.origRound;
                const adjSd  = entry.sd + entry.adj;
                const isTop  = finalTopIds.has(entry.eid);
                const wasTop = simResults.oldTopIds.has(entry.eid);
                const entered = isTop && !wasTop && !entry.isSimulated;
                const exited  = !isTop && wasTop;
                const hasAdj  = entry.adj !== 0;
                const res     = entry.isSimulated ? validResults.find(x => x.roundId === entry.eid) : null;
                return (
                  <tr key={entry.eid + i} style={{
                    background: entry.isSimulated ? 'var(--bg-success)' : undefined,
                    fontWeight: entry.isSimulated ? 600 : undefined,
                  }}>
                    <td className="r" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>{i + 1}</td>
                    <td>
                      {entry.isSimulated
                        ? <span style={{ color: 'var(--color-good)', fontWeight: 700 }}>Nova {res ? res.roundIdx + 1 : ''}</span>
                        : r ? <TeeDate date={r.date} tee={r.tee || ''} /> : '—'}
                    </td>
                    <td>
                      {entry.isSimulated
                        ? <span className="muted">{res?.courseName ?? '—'}</span>
                        : r ? <CourseLink name={r.course} /> : '—'}
                    </td>
                    <td className="r">{r?.hi ?? ''}</td>
                    <td>{r?.tee ? <TeePill name={r.tee} /> : ''}</td>
                    <td className="r">{r?.gross != null ? <GrossCell gross={r.gross} par={r.par} /> : '—'}</td>
                    <td className="r">
                      <span className={`p p-${sdClassByHcp(entry.sd, currentHI)}`} style={{ fontSize: 11 }}>
                        {entry.sd.toFixed(1)}
                      </span>
                    </td>
                    <td className="r">
                      {hasAdj ? (
                        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                          <span className={`p p-${sdClassByHcp(adjSd, currentHI)}`} style={{ fontSize: 11, fontWeight: 700 }}>
                            {adjSd.toFixed(1)}
                          </span>
                          <span style={{ fontSize: 9, color: 'var(--text-3)', textDecoration: 'line-through' }}>
                            {entry.sd.toFixed(1)}
                          </span>
                        </span>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="r">
                      {isTop
                        ? <><span className="c-par-ok">★</span>{' '}<span className="fw-700">#{finalTopRanks.get(entry.eid)}</span>
                            {entered && <span style={{ color: 'var(--color-good)', marginLeft: 3, fontWeight: 800 }}>↑</span>}</>
                        : exited ? <span style={{ color: 'var(--color-danger)', fontWeight: 800 }}>✕</span>
                        : <span className="muted">–</span>}
                    </td>
                  </tr>
                );
              })}
              {displacedEntries.length > 0 && <>
                <tr>
                  <td colSpan={9} style={{ padding: '4px 8px', background: 'var(--bg-header)', fontSize: 10, color: 'var(--text-3)', fontWeight: 700, letterSpacing: '.05em' }}>
                    DESLOCADAS — saíram da janela
                  </td>
                </tr>
                {displacedEntries.map((entry, i) => {
                  const r = entry.origRound;
                  const wasTop = simResults.oldTopIds.has(entry.eid);
                  return (
                    <tr key={entry.eid + '_out_' + i} style={{ opacity: 0.38 }}>
                      <td className="r" style={{ fontSize: 11, color: 'var(--color-danger)', fontWeight: 700 }}>out</td>
                      <td>{r ? <TeeDate date={r.date} tee={r.tee || ''} /> : '—'}</td>
                      <td>{r ? <CourseLink name={r.course} /> : '—'}</td>
                      <td className="r">{r?.hi ?? ''}</td>
                      <td>{r?.tee ? <TeePill name={r.tee} /> : ''}</td>
                      <td className="r">{r?.gross != null ? <GrossCell gross={r.gross} par={r.par} /> : '—'}</td>
                      <td className="r"><span className={`p p-${sdClassByHcp(entry.sd, currentHI)}`} style={{ fontSize: 11 }}>{entry.sd.toFixed(1)}</span></td>
                      <td className="r"><span className="muted">—</span></td>
                      <td className="r">{wasTop ? <span style={{ color: 'var(--color-danger)' }}>★ saiu</span> : <span className="muted">–</span>}</td>
                    </tr>
                  );
                })}
              </>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return bare ? inner : (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="h-xs fs-18 mb-4">🎯 Simulador de Rondas</div>
      {inner}
    </div>
  );
}

/* ─── Last 20 Table with scorecard expansion ─── */
type L20SortKey = "whs" | "date" | "course" | "event" | "holes" | "hcp" | "tee" | "meters" | "gross" | "stb" | "sd" | "rank";

function L20SortTh({ col, label, cur, dir, onSort, className }: {
  col: L20SortKey; label: string; cur: L20SortKey; dir: 1 | -1;
  onSort: (c: L20SortKey) => void; className?: string;
}) {
  const active = cur === col;
  return (
    <th className={className}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => onSort(col)}>
      {label}
      <span style={{ marginLeft: 3, opacity: active ? 1 : 0.25, fontSize: 10 }}>
        {active ? (dir === -1 ? "↓" : "↑") : "↕"}
      </span>
    </th>
  );
}

function Last20Table({ data, last20Table, best8, whsPosMap, bare: _bare }: {
  data: PlayerPageData;
  last20Table: (RoundData & { course: string })[];
  best8: Map<string, number>;
  whsPosMap: Map<string, number>;
  bare?: boolean;
}) {
  const [openSc, setOpenSc] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<L20SortKey>("date");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  // Rows outside the WHS window (no whs pos) AND after the last WHS round → fade
  const fadingIds = useMemo(() => {
    const s = new Set<string>();
    // Fade rows that are not in the WHS window and come after the last WHS round
    let pastWindow = false;
    for (const r of last20Table) {
      if (whsPosMap.has(r.scoreId)) { if (whsPosMap.get(r.scoreId) === 20) pastWindow = true; }
      else if (pastWindow) s.add(r.scoreId);
    }
    return s;
  }, [last20Table, whsPosMap]);

  function handleSort(col: L20SortKey) {
    if (col === sortKey) setSortDir(d => (d === -1 ? 1 : -1));
    else { setSortKey(col); setSortDir(col === "date" ? -1 : col === "gross" || col === "hcp" || col === "sd" ? 1 : -1); }
  }

  const sortedRows = useMemo(() => {
    const arr = [...last20Table];
    arr.sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "whs": av = whsPosMap.get(a.scoreId) ?? 999; bv = whsPosMap.get(b.scoreId) ?? 999; break;
        case "date": av = a.dateSort; bv = b.dateSort; break;
        case "course": return sortDir * a.course.localeCompare(b.course, "pt");
        case "event": return sortDir * (a.eventName || "").localeCompare(b.eventName || "", "pt");
        case "holes": av = a.holeCount; bv = b.holeCount; break;
        case "hcp": av = a.hi ?? 999; bv = b.hi ?? 999; break;
        case "tee": return sortDir * (a.tee || "").localeCompare(b.tee || "");
        case "meters": av = a.meters ?? 0; bv = b.meters ?? 0; break;
        case "gross": av = a.gross ?? 999; bv = b.gross ?? 999; break;
        case "stb": av = a.stb ?? -999; bv = b.stb ?? -999; break;
        case "sd": av = a.sd ?? 999; bv = b.sd ?? 999; break;
        case "rank": av = best8.get(a.scoreId) ?? 999; bv = best8.get(b.scoreId) ?? 999; break;
        default: av = a.dateSort; bv = b.dateSort;
      }
      return sortDir * (av - bv);
    });
    return arr;
  }, [last20Table, sortKey, sortDir, best8, whsPosMap]);

  const thProps = { cur: sortKey, dir: sortDir, onSort: handleSort };
  const _whsMax = whsPosMap.size;

  return (
    <div className="card">
      <div className="h-xs fs-18 mb-8">📋 Últimas 20 rondas</div>
      <div className="muted mb-8 fs-11">
        <b>WHS#</b> = posição na janela WHS (só rondas com SD contam) · ★ = top-8 SDs · <b>*</b> = Stableford normalizado 9B→18B · <span style={{ opacity: 0.45 }}>Esbatido</span> = fora da janela · Clica nos cabeçalhos para ordenar
      </div>
      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <L20SortTh col="whs" label="WHS#" {...thProps} className="r" />
              <L20SortTh col="date" label="Data" {...thProps} />
              <L20SortTh col="course" label="Campo" {...thProps} />
              <L20SortTh col="event" label="Prova" {...thProps} />
              <L20SortTh col="holes" label="Bur." {...thProps} className="r" />
              <L20SortTh col="hcp" label="HCP" {...thProps} className="r" />
              <L20SortTh col="tee" label="Tee" {...thProps} />
              <L20SortTh col="meters" label="Dist." {...thProps} className="r" />
              <L20SortTh col="gross" label="Gross" {...thProps} className="r" />
              <L20SortTh col="stb" label="Stb" {...thProps} className="r" />
              <L20SortTh col="sd" label="SD" {...thProps} className="r" />
              <L20SortTh col="rank" label="Top 8" {...thProps} className="r" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              const rank = best8.get(r.scoreId);
              const isBest8 = rank != null;
              const isFading = fadingIds.has(r.scoreId);
              const isOpen = openSc === r.scoreId;
              const holes = data.HOLES[String(r.scoreId)];

              // Eclectic entry
              const courseKey = norm(r.course);
              const teeKey = r.teeKey || normKey(r.tee || "");
              const ecEntry = data.ECDET?.[courseKey]?.[teeKey] || null;

              return (
                <React.Fragment key={r.scoreId}>
                  <tr style={{
                    ...(isBest8 ? { background: "var(--bg-success)" } : {}),
                    ...(isFading ? { opacity: 0.4 } : {}),
                  }}>
                    <td className="r" style={{ fontSize: 11, fontWeight: 700, color: whsPosMap.get(r.scoreId) != null ? "var(--text-2)" : "var(--text-4)" }}>
                      {whsPosMap.get(r.scoreId) ?? "–"}
                    </td>
                    <td>
                      {holes ? (
                        <a href="#" className="dateLink" onClick={e => { e.preventDefault(); setOpenSc(isOpen ? null : r.scoreId); }}>
                          <TeeDate date={r.date} tee={r.tee || ""} />
                        </a>
                      ) : (
                        <TeeDate date={r.date} tee={r.tee || ""} />
                      )}
                    </td>
                    <td><CourseLink name={r.course} /></td>
                    <td className="fs-11"><EventInfo name={r.eventName} origin={r.scoreOrigin} pill={effectivePill(r)} links={r._links} /></td>
                    <td className="r"><HoleBadge hc={r.holeCount} /></td>
                    <td className="r">{r.hi ?? ""}</td>
                    <td><TeePill name={r.tee || ""} /></td>
                    <td className="r muted">{r.meters ? `${r.meters}m` : ""}</td>
                    <td className="r"><GrossCell gross={r.gross} par={r.par} /></td>
                    <td className="r">{fmtStb(r.stb, r.holeCount)}</td>
                    <td className="r"><SdCell round={r} /></td>
                    <td className="r">
                      {isBest8 && (
                        <><span className="c-par-ok">★</span>{" "}<span className="fw-700">#{rank}</span></>
                      )}
                    </td>
                  </tr>
                  {isOpen && holes && (
                    <tr>
                      <td colSpan={12} className="bg-page p-0">
                        <div className="scHost" style={scHostStyle}>
                          <ScorecardTable
                            holes={holes}
                            courseName={r.course}
                            date={r.date}
                            tee={r.tee || ""}
                            hi={r.hi}
                            links={r._links}
                            pill={effectivePill(r)}
                            eclecticEntry={ecEntry}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Cross Analysis ─── */
function CrossAnalysis({ data, bare: _bare }: { data: PlayerPageData; bare?: boolean }) {
  const keys = Object.keys(data.CROSS_DATA);
  const [activeEsc, setActiveEsc] = useState<string>("");
  const [sexFilter, setSexFilter] = useState("all");
  const [hcpMax, setHcpMax] = useState("all");

  const byEscalao = useMemo(() => {
    const map: Record<string, CrossPlayerData[]> = {};
    for (const fed in data.CROSS_DATA) {
      const p = data.CROSS_DATA[fed];
      const esc = p.escalao || "Sem escalão";
      if (!map[esc]) map[esc] = [];
      map[esc].push(p);
    }
    return map;
  }, [data.CROSS_DATA]);

  const escOrder = ["Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18", "Absoluto", "Sénior", "Sem escalão"];
  const escalaos = escOrder.filter(e => byEscalao[e]?.length >= 1);

  useEffect(() => {
    if (!activeEsc && escalaos.length > 0) {
      const cur = data.CROSS_DATA[data.CURRENT_FED]?.escalao || "";
      setActiveEsc(escalaos.find(e => e === cur) || escalaos[0]);
    }
  }, [escalaos, activeEsc, data]);

  if (keys.length < 2) return null;

  const players = (byEscalao[activeEsc] || [])
    .filter(p => {
      if (sexFilter !== "all" && p.sex !== sexFilter) return false;
      if (hcpMax !== "all" && (p.currentHcp == null || p.currentHcp > Number(hcpMax))) return false;
      return true;
    })
    .sort((a, b) => (a.currentHcp ?? 999) - (b.currentHcp ?? 999));

  const curYear = new Date().getFullYear();

  return (
    <div className="card mt-24">
 <div className="h-xs fs-18 mb-16">📊 Cross-Análise por Escalão</div>
      {/* Tabs */}
      <div className="escalao-pills jog-cross-wrap">
        {escalaos.map(esc => (
          <button key={esc} className={`p p-filter${esc === activeEsc ? " active" : ""}`}
            onClick={() => setActiveEsc(esc)}>
            {esc} <span className="p-filter-count">{byEscalao[esc].length}</span>
          </button>
        ))}
      </div>
      {/* Filters */}
      <div className="jog-cross-filter">
        <select className="mini-badge"
          value={sexFilter} onChange={e => setSexFilter(e.target.value)}>
          <option value="all">Sexo</option>
          <option value="M">Masc.</option>
          <option value="F">Fem.</option>
        </select>
        <select className="mini-badge"
          value={hcpMax} onChange={e => setHcpMax(e.target.value)}>
          <option value="all">HCP máx</option>
          {[0, 3, 6, 9, 12, 15, 18, 21, 25, 28, 31, 38, 45].map(v => (
            <option key={v} value={v}>{v === 0 ? "Scratch (≤0)" : `≤ ${v}`}</option>
          ))}
        </select>
        <span className="muted fw-600 fs-11">{players.length} jogadores</span>
      </div>
      {/* Ranking table */}
      <div className="table-wrap">
        <table className="dtable cross-table">
          <thead>
            <tr>
              <th className="r" style={{ width: 28 }}>#</th>
              <th>Jogador</th>
              <th className="r">HCP</th>
              <th className="r">Últ.SD</th>
              <th className="r">M.SD</th>
              <th className="r">Torneios</th>
              <th className="r">Total</th>
              {[curYear - 3, curYear - 2, curYear - 1, curYear].map(y => (
                <th key={y} className="r">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => {
              const isCurrent = p.fed === data.CURRENT_FED;
              return (
                <tr key={p.fed} className={isCurrent ? "cross-current" : ""}>
                  <td className="r"><b>{i + 1}</b></td>
                  <td>
                    <Link
                      to={`/jogadores/${p.fed}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="courseLink"
                      style={{ fontWeight: isCurrent ? 700 : undefined }}
                      onClick={e => e.stopPropagation()}
                    >
                      {p.name}
                    </Link>
                    {" "}<span className="muted fs-10">{p.fed}</span>
                    {p.birthYear && <span className="p p-sm p-birth ml-4">{p.birthYear}</span>}
                    {p.club && <span className="p p-sm p-club ml-4">{p.club}</span>}
                  </td>
                  <td className="r"><b>{p.currentHcp?.toFixed(1) ?? "–"}</b></td>
                  <td className="r">
                    {p.lastSD != null
                      ? <span className={`p p-${sdClassByHcp(p.lastSD, p.currentHcp)}`}>{p.lastSD.toFixed(1)}</span>
                      : "–"}
                  </td>
                  <td className="r">
                    {p.avgSD20 != null
                      ? <span className={`p p-${sdClassByHcp(p.avgSD20, p.currentHcp)}`}>{p.avgSD20.toFixed(1)}</span>
                      : "–"}
                  </td>
                  <td className="r">{p.numTournaments}</td>
                  <td className="r"><b>{p.numRounds ?? ""}</b></td>
                  {[curYear - 3, curYear - 2, curYear - 1, curYear].map((y, yi) => {
                    const yearFields = ["rounds3YearsAgo", "rounds2YearsAgo", "roundsLastYear", "roundsCurrentYear"] as const;
                    const val = p[yearFields[yi]];
                    return <td key={y} className="r">{val ?? ""}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* HCP Evolution Chart */}
      <HcpEvolutionChart players={players} currentFed={data.CURRENT_FED} escName={activeEsc} />

      {/* Common Courses */}
      <CommonCourses players={players} currentFed={data.CURRENT_FED} escName={activeEsc} />
    </div>
  );
}

/* ─── HCP Evolution SVG Chart ─── */
function HcpEvolutionChart({ players, currentFed, escName }: {
  players: CrossPlayerData[]; currentFed: string; escName: string;
}) {
  const [period, setPeriod] = useState(12);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const chartPlayers = useMemo(() =>
    players.filter(p => p.hcpHistory && p.hcpHistory.length >= 2),
    [players]
  );

  const cutoff = period > 0 ? Date.now() - period * 30.44 * 86400000 : 0;

  const togglePlayer = (fed: string) => {
    setHidden(prev => {
      const n = new Set(prev);
      n.has(fed) ? n.delete(fed) : n.add(fed);
      return n;
    });
  };

  if (chartPlayers.length < 1) return null;

  const W = 800, H = 280;
  const PAD = { top: 20, right: 20, bottom: 30, left: 45 };
  const visiblePlayers = chartPlayers.filter(p => !hidden.has(p.fed));

  let allPts: { d: number; h: number }[] = [];
  visiblePlayers.forEach(p => {
    allPts = allPts.concat((p.hcpHistory || []).filter(pt => pt.d >= cutoff));
  });
  if (allPts.length === 0) return null;

  const minD = Math.min(...allPts.map(p => p.d));
  const maxD = Math.max(...allPts.map(p => p.d));
  const minH = Math.min(...allPts.map(p => p.h));
  const maxH = Math.max(...allPts.map(p => p.h));
  const rangeD = maxD - minD || 1;
  const rangeH = maxH - minH || 1;
  const padH = rangeH * 0.1;

  const xPos = (d: number) => PAD.left + ((d - minD) / rangeD) * (W - PAD.left - PAD.right);
  const yPos = (h: number) => H - PAD.bottom - ((h - (minH - padH)) / (rangeH + 2 * padH)) * (H - PAD.top - PAD.bottom);

  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)", "var(--chart-9)", "var(--chart-10)"];

  return (
    <div className="mt-20">
      <div className="h-md flex-center-gap12">
        Evolução HCP — {escName}
        <select className="mini-badge"
          value={period} onChange={e => setPeriod(Number(e.target.value))}>
          <option value={0}>Total</option>
          <option value={36}>3 anos</option>
          <option value={24}>2 anos</option>
          <option value={12}>1 ano</option>
          <option value={6}>6 meses</option>
        </select>
        <span className="muted fs-11 fw-400">(clica na legenda para mostrar/esconder)</span>
      </div>
 <svg viewBox={`0 0 ${W} ${H}`} className="br-lg w-full" style={{ maxHeight: 300, background: "var(--bg)", border: "1px solid var(--border-light)" }}>
        {Array.from({ length: 5 }, (_, i) => {
          const val = minH - padH + (rangeH + 2 * padH) * (i / 4);
          const vy = yPos(val);
          return (
            <g key={i}>
              <line x1={PAD.left} y1={vy} x2={W - PAD.right} y2={vy} stroke="var(--border-light)" strokeWidth={0.5} />
              <text x={PAD.left - 4} y={vy + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">{val.toFixed(1)}</text>
            </g>
          );
        })}
        {visiblePlayers.map((p, pi) => {
          const pts = (p.hcpHistory || []).filter(pt => pt.d >= cutoff).sort((a, b) => a.d - b.d);
          if (pts.length < 2) return null;
          const col = colors[pi % colors.length];
          const isCur = p.fed === currentFed;
          const d = pts.map(pt => `${xPos(pt.d)},${yPos(pt.h)}`).join(" L ");
          return (
            <g key={p.fed}>
              <path d={`M ${d}`} fill="none" stroke={col} strokeWidth={isCur ? 2.5 : 1.2} opacity={isCur ? 1 : 0.6} />
              {pts.map((pt, j) => (
                <circle key={j} cx={xPos(pt.d)} cy={yPos(pt.h)} r={isCur ? 3 : 1.5} fill={col} opacity={isCur ? 1 : 0.5}>
                  <title>{p.name}: HCP {pt.h} ({new Date(pt.d).toLocaleDateString("pt-PT")})</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
 <div className="d-flex mt-6 fs-11" style={{ flexWrap: "wrap", gap: "4px 12px" }}>
        {chartPlayers.map((p, pi) => {
          const col = colors[pi % colors.length];
          const isHidden = hidden.has(p.fed);
          const isCur = p.fed === currentFed;
          return (
 <span key={p.fed} className="pointer" style={{ opacity: isHidden ? 0.3 : 1, fontWeight: isCur ? 700 : 400 }}
              onClick={() => togglePlayer(p.fed)}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "var(--radius-xs)", background: col, marginRight: 3 }} />
              {firstName(p.name)} {p.currentHcp != null ? `(${p.currentHcp.toFixed(1)})` : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Common Courses ─── */
function CommonCourses({ players, currentFed, escName }: {
  players: CrossPlayerData[]; currentFed: string; escName: string;
}) {
  const [openCard, setOpenCard] = useState<number | null>(null);

  const commonCT = useMemo(() => {
    const map: Record<string, { course: string; tee: string; players: { name: string; fed: string; best: number | null; avg: number; worst: number | null; count: number; rounds: RoundData[] }[] }> = {};
    for (const p of players) {
      if (!p.courseTee) continue;
      for (const ctk in p.courseTee) {
        const ct = p.courseTee[ctk];
        if (!ct.course || ct.course.toUpperCase() === "NONE" || !ct.course.trim()) continue;
        if (!map[ctk]) map[ctk] = { course: ct.course, tee: ct.tee || "?", players: [] };
        map[ctk].players.push({
          name: p.name, fed: p.fed, best: ct.best, avg: ct.avg,
          worst: ct.worst, count: ct.count, rounds: (ct.rounds || []) as RoundData[]
        });
      }
    }
    return Object.values(map)
      .filter(c => c.players.length >= 2)
      .map(c => { c.players.sort((a, b) => (a.best ?? 999) - (b.best ?? 999)); return c; })
      .sort((a, b) => b.players.length - a.players.length)
      .slice(0, 25);
  }, [players]);

  if (commonCT.length === 0) return null;

  return (
    <div className="mt-20">
      <div className="h-md">Campos em Comum (mesmo tee) — {escName}</div>
      <div className="muted fs-11 mb-8">Ordenado pela melhor ronda. Clica num campo para ver detalhes.</div>
      {commonCT.map((cc, ci) => {
        const isOpen = openCard === ci;
        const groupBest = Math.min(...cc.players.map(p => p.best ?? 999));
        const groupWorst = Math.max(...cc.players.map(p => p.worst ?? 0));
        const gRange = (groupWorst - groupBest) || 1;
        return (
          <div key={ci} className="mb-4">
            <div className="card-detail pointer"
              onClick={() => setOpenCard(isOpen ? null : ci)}>
              <div className="flex-center-gap8">
 <span className="fs-10" style={{ transition: "transform .2s", transform: isOpen ? "rotate(90deg)" : "" }}>▶</span>
                <span className="fw-700">⛳ {cc.course}</span>
                <TeePill name={cc.tee} />
                <span className="muted fs-11">{cc.players.length} jogadores</span>
              </div>
 <div className="d-flex fs-11 mt-4" style={{ flexWrap: "wrap", gap: "2px 10px" }}>
                {cc.players.map((mp, mr) => {
                  const isCur = mp.fed === currentFed;
                  const medal = mr === 0 ? "🥇" : mr === 1 ? "🥈" : mr === 2 ? "🥉" : `${mr + 1}º`;
                  return (
                    <span key={mp.fed} style={{ fontWeight: isCur ? 700 : 400, color: isCur ? SC.good : undefined }}>
                      {medal} {firstName(mp.name)} <b>{mp.best ?? "–"}</b>
                    </span>
                  );
                })}
              </div>
            </div>
            {isOpen && (
              <div className="card-detail-inner">
                <table className="dtable" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}>#</th><th>Jogador</th><th className="r">Voltas</th>
                      <th className="r c-par-ok">★ Melhor</th><th className="r">Média</th>
                      <th className="r c-birdie">Pior</th><th className="r">Ampl.</th>
                      <th className="col-mw120">Distribuição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cc.players.map((cp, bi) => {
                      const isCur = cp.fed === currentFed;
                      const ampl = cp.best != null && cp.worst != null ? cp.worst - cp.best : null;
                      const barLeft = cp.best != null ? ((cp.best - groupBest) / gRange * 100) : 0;
                      let barW = cp.best != null && cp.worst != null ? ((cp.worst - cp.best) / gRange * 100) : 5;
                      if (barW < 3) barW = 3;
                      const avgM = cp.avg != null ? ((cp.avg - groupBest) / gRange * 100) : 50;
                      const bCol = isCur ? SC.good : SC.muted;
                      return (
                        <tr key={cp.fed} className={isCur ? "cross-current" : ""}>
                          <td><b>{bi + 1}</b></td>
                          <td>
                            <Link
                              to={`/jogadores/${cp.fed}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="courseLink"
                              style={{ fontWeight: isCur ? 700 : undefined }}
                              onClick={e => e.stopPropagation()}
                            >
                              {cp.name}
                            </Link>
                          </td>
                          <td className="r">{cp.count}</td>
                          <td className="r cb-par-ok">{cp.best ?? "–"}</td>
                          <td className="r">{cp.avg.toFixed(1)}</td>
 <td className="r fw-600" style={{ color: SC.danger }}>{cp.worst ?? "–"}</td>
                          <td className="r">{ampl ?? "–"}</td>
                          <td>
                            <div className="progress-track-sm">
                              <div style={{ position: "absolute", top: 2, height: 10, borderRadius: "var(--radius-xs)", background: bCol, opacity: 0.3, left: `${barLeft}%`, width: `${barW}%` }} />
                              <div style={{ position: "absolute", top: 0, width: 2, height: 14, background: bCol, left: `${avgM}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-10 fs-11-fw700 c-text-2">
                  Histórico de rondas — {cc.course} ({cc.tee})
                </div>
                {cc.players.map(hp => {
                  const isCur = hp.fed === currentFed;
                  if (!hp.rounds?.length) return null;
                  return (
 <div key={hp.fed} className="br-default mt-6" style={{ padding: "6px 8px", border: isCur ? "1px solid var(--border-current-good)" : "1px solid var(--border-light)", background: isCur ? "var(--bg-success)" : "var(--bg)" }}>
                      <div className="fw-600 fs-11 mb-4">
                        {hp.name} <span className="muted">({hp.rounds.length} ronda{hp.rounds.length > 1 ? "s" : ""})</span>
                      </div>
 <div className="flex-wrap-gap8 gap-4" >
                        {hp.rounds.map((rd: RoundData, ri: number) => {
                          const isBest = rd.gross === hp.best;
                          return (
                            <div key={ri} style={{ padding: "3px 8px", borderRadius: "var(--radius)", fontSize: 11, background: isBest ? "var(--bg-success-strong)" : "var(--bg-card)", border: `1px solid ${isBest ? "var(--border-best)" : "var(--border-light)"}`, display: "flex", gap: 6, alignItems: "center" }}>
                              <span className="c-text-3">{rd.date || "–"}</span>
                              <span className="fw-700">{rd.gross}{rd.par ? <span className={`score-delta ${(rd.gross! - rd.par) > 0 ? "pos" : (rd.gross! - rd.par) < 0 ? "neg" : ""} fs-9`} style={{ marginLeft: 2 }}>{fmtSign(rd.gross! - rd.par)}</span> : null}</span>
                              {rd.sd != null && <span className="c-text-3">SD {rd.sd}</span>}
                              {isBest && <span>★</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
function PeriodSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
 <select className="br-default c-text-2 fs-11" style={{ padding: "2px 6px", border: "1px solid var(--border)", background: "var(--bg-card)" }}
      value={value} onChange={e => onChange(Number(e.target.value))}>
      <option value={3}>3 meses</option>
      <option value={6}>6 meses</option>
      <option value={9}>9 meses</option>
      <option value={12}>1 ano</option>
      <option value={24}>2 anos</option>
      <option value={36}>3 anos</option>
      <option value={0}>Total</option>
    </select>
  );
}

/* ─── Tournament Comparison Scorecard ─── */
function TournamentComparison({ rounds, holesData }: {
  rounds: (RoundData & { course: string })[];
  holesData: Record<string, HoleScores>;
}) {
  // Find reference data for par/meters/SI
  let refData: HoleScores | null = null;
  for (const r of rounds) {
    const h = holesData[String(r.scoreId)];
    if (h?.p?.some(v => v != null)) { refData = h; break; }
  }
  if (!refData) return null;

  const hc = refData.hc || 18;
  const is9 = hc === 9;
  const frontEnd = is9 ? hc : 9;
  const backStart = is9 ? 0 : 9;

  const par = refData.p;
  const meters = refData.m;
  const si = refData.si;
  const tee = rounds[0]?.tee || "";
  const hx = getTeeHex(tee);
  const _fgT = textOnColor(hx);
  const totalPar = par ? sumArr(par, 0, hc) : null;
  const totalDist = meters ? sumArr(meters, 0, hc) : null;
  const hcpLabel = rounds[0]?.hi ?? "";
  const allSameTee = rounds.every(r => (r.tee || "") === tee);
  const teeLabel = allSameTee ? `Tee ${tee}` : "Tees variados";

  // Detect multi-course tournament
  const allSameCourse = rounds.every(r => norm(r.course) === norm(rounds[0].course));

  // Per-round holes data (for own-par coloring when courses differ)
  const perRoundHoles = rounds.map(r => holesData[String(r.scoreId)] || null);

  // Gather gross arrays per round
  const roundGross: ((number | null)[] | null)[] = perRoundHoles.map(h => h?.g || null);

  // Build header info
  const headerText = `Scorecard comparativo · HCP ${hcpLabel} · ${teeLabel}${totalDist && allSameTee ? ` · ${totalDist}m` : ""}`;

  return (
    <div className="card mt-12">
      <div className="sc-bar-head">
        <span>{headerText}{!allSameCourse && <span className="muted fs-10 ml-6">(campos diferentes — par/metros por ronda)</span>}</span>
        <span>Par {totalPar || ""}</span>
      </div>
      <div className="scroll-x">
 <table className="w-full fs-12 bc-collapse">
          <thead>
            <CompRow label="Buraco" hc={hc} is9={is9} frontEnd={frontEnd}
              cells={Array.from({ length: hc }, (_, i) => String(i + 1))}
              outVal="Out" inVal={is9 ? "TOTAL" : "In"} totalVal={is9 ? undefined : "TOTAL"}
 className="fw-700 fs-11 bb-light c-text-3" style={{ background: "var(--bg-detail)" }}
            />
          </thead>
          <tbody>
            {/* Metros e Par: apenas se todos no mesmo campo */}
            {allSameCourse && meters && meters.some(v => v != null && Number(v) > 0) && (
              <CompRow label="Metros" hc={hc} is9={is9} frontEnd={frontEnd}
                cells={meters.slice(0, hc).map(v => v != null ? String(v) : "")}
                outVal={String(sumArr(meters, 0, frontEnd))} outWeight={600}
                inVal={String(is9 ? sumArr(meters, 0, hc) : sumArr(meters, backStart, hc))} inWeight={600}
                totalVal={is9 ? undefined : String(sumArr(meters, 0, hc))}
                className="c-muted fs-10"
              />
            )}
            {allSameCourse && si && si.some(v => v != null) && (
              <CompRow label="S.I." hc={hc} is9={is9} frontEnd={frontEnd}
                cells={si.slice(0, hc).map(v => v != null ? String(v) : "")}
                outVal="" inVal="" totalVal={is9 ? undefined : ""}
                className="c-muted fs-10"
              />
            )}
            {allSameCourse && par && par.some(v => v != null) && (
              <CompRow label="Par" hc={hc} is9={is9} frontEnd={frontEnd}
                cells={par.slice(0, hc).map(v => v != null ? String(v) : "–")}
                outVal={String(sumArr(par, 0, frontEnd))} outWeight={700}
                inVal={String(is9 ? sumArr(par, 0, hc) : sumArr(par, backStart, hc))} inWeight={700}
                totalVal={is9 ? undefined : String(sumArr(par, 0, hc))}
                className="fw-600 c-muted fs-11 bt-heavy"
                sepRow
              />
            )}
            {/* Each round — quando campos diferem, metros/par aparecem uma vez por campo */}
            {rounds.map((rd, ri) => {
              const gross = roundGross[ri];
              if (!gross) return null;
              const dateFmt = rd.date ? rd.date.substring(0, 5).replace("-", "/") : `V${ri + 1}`;
              const rdHx = getTeeHex(rd.tee || "");
              const rdFg = textOnColor(rdHx);
              const ownPar = !allSameCourse ? (perRoundHoles[ri]?.p || null) : par;
              const ownH = perRoundHoles[ri];
              // Só mostrar cabeçalho de campo quando muda (evita duplicar Palheiro)
              const prevCourse = ri > 0 ? norm(rounds[ri - 1].course) : null;
              const showCourseHeader = !allSameCourse && ownH && norm(rd.course) !== prevCourse;
              return (
                <React.Fragment key={rd.scoreId}>
                  {showCourseHeader && (
                    <>
                      {ownH!.m && ownH!.m.some(v => v != null && Number(v) > 0) && (
                        <CompRow label={`m (${rd.course.split(" ")[0]})`} hc={hc} is9={is9} frontEnd={frontEnd}
                          cells={ownH!.m.slice(0, hc).map(v => v != null ? String(v) : "")}
                          outVal={String(sumArr(ownH!.m, 0, frontEnd))} outWeight={600}
                          inVal={String(is9 ? sumArr(ownH!.m, 0, hc) : sumArr(ownH!.m, backStart, hc))} inWeight={600}
                          totalVal={is9 ? undefined : String(sumArr(ownH!.m, 0, hc))}
                          className="c-muted fs-10"
                        />
                      )}
                      {ownH!.p && ownH!.p.some(v => v != null) && (
                        <CompRow label="Par" hc={hc} is9={is9} frontEnd={frontEnd}
                          cells={ownH!.p.slice(0, hc).map(v => v != null ? String(v) : "–")}
                          outVal={String(sumArr(ownH!.p, 0, frontEnd))} outWeight={700}
                          inVal={String(is9 ? sumArr(ownH!.p, 0, hc) : sumArr(ownH!.p, backStart, hc))} inWeight={700}
                          totalVal={is9 ? undefined : String(sumArr(ownH!.p, 0, hc))}
                          className="fw-600 c-muted fs-11 bt-heavy"
                          sepRow
                        />
                      )}
                    </>
                  )}
                  <CompScoreRow label={dateFmt} labelBg={rdHx} labelFg={rdFg}
                    gross={gross} par={ownPar} hc={hc} is9={is9} frontEnd={frontEnd} backStart={backStart} />
                </React.Fragment>
              );
            })}
            {/* Delta row */}
            {rounds.length >= 2 && roundGross[0] && roundGross[rounds.length - 1] && (
              <CompDeltaRow first={roundGross[0]!} last={roundGross[rounds.length - 1]!}
                hc={hc} is9={is9} frontEnd={frontEnd} backStart={backStart} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* Comparison table helper: generic row */
function CompRow({ label, hc: _hc, is9, frontEnd, cells, outVal, inVal, totalVal, style, sepRow, outWeight, inWeight, className }: {
  label: string; hc: number; is9: boolean; frontEnd: number;
  cells: string[]; outVal?: string; inVal?: string; totalVal?: string;
  style?: React.CSSProperties; sepRow?: boolean; outWeight?: number; inWeight?: number;
  className?: string;
}) {
  const cs: React.CSSProperties = { padding: "4px 6px", textAlign: "center", fontSize: 12, borderBottom: "1px solid var(--bg-hover)", ...style };
  const colLabel: React.CSSProperties = { ...cs, textAlign: "left", paddingLeft: 8, borderRight: "2px solid var(--border-light)" };
  const colOut: React.CSSProperties = { ...cs, background: "var(--bg-muted)", borderLeft: "1px solid var(--border-light)", borderRight: "1px solid var(--border-light)", fontWeight: outWeight };
  const colIn: React.CSSProperties = { ...colOut, fontWeight: inWeight };
  const colTot: React.CSSProperties = { ...cs, background: "var(--bg-muted)", borderLeft: "1px solid var(--border-light)", fontWeight: 800 };
  if (sepRow) { cs.borderBottom = "2px solid var(--border)"; colLabel.borderBottom = "2px solid var(--border)"; colOut.borderBottom = "2px solid var(--border)"; colIn.borderBottom = "2px solid var(--border)"; colTot.borderBottom = "2px solid var(--border)"; }
  return (
    <tr className={className}>
      <td style={colLabel}>{label}</td>
      {cells.map((c, i) => (
        <React.Fragment key={i}>
          <td style={cs}>{c}</td>
          {i === frontEnd - 1 && !is9 && <td style={colOut}>{outVal}</td>}
        </React.Fragment>
      ))}
      <td style={is9 ? colTot : colIn}>{inVal}</td>
      {!is9 && <td style={colTot}>{totalVal}</td>}
    </tr>
  );
}

/* Comparison table: score row with circles */
function CompScoreRow({ label, labelBg, labelFg, gross, par, hc, is9, frontEnd, backStart }: {
  label: string; labelBg: string; labelFg: string;
  gross: (number | null)[]; par: (number | null)[] | null;
  hc: number; is9: boolean; frontEnd: number; backStart: number;
}) {
  const cs: React.CSSProperties = { padding: "4px 6px", textAlign: "center", fontSize: 12, borderBottom: "1px solid var(--bg-hover)" };
  const colLabel: React.CSSProperties = { ...cs, textAlign: "left", paddingLeft: 8, borderRight: "2px solid var(--border-light)" };
  const colOut: React.CSSProperties = { ...cs, background: "var(--bg-muted)", borderLeft: "1px solid var(--border-light)", borderRight: "1px solid var(--border-light)", fontWeight: 700 };
  const colIn: React.CSSProperties = { ...colOut };
  const colTot: React.CSSProperties = { ...cs, background: "var(--bg-muted)", borderLeft: "1px solid var(--border-light)", fontWeight: 800 };

  const toParSpan = (g: number, p: number) => {
    const tp = g - p;
    const cls = toParClass(tp);
    return <span className={`sc-topar ${cls}`}>{fmtSign(tp)}</span>;
  };

  const totalG = sumArr(gross, 0, hc);
  const totalP = par ? sumArr(par, 0, hc) : 0;
  const tp = par ? totalG - totalP : null;

  return (
    <tr>
      <td style={colLabel}><span className="p" style={{ background: labelBg, color: labelFg }}>{label}</span></td>
      {Array.from({ length: hc }, (_, i) => {
        const gv = gross[i];
        const pv = par ? par[i] : null;
        const cls = gv != null && gv > 0 && pv != null ? scClass(gv, pv) : "";
        return (
          <React.Fragment key={i}>
            <td style={cs}>
              {gv != null && gv > 0
 ? <span className={`sc-score ${cls} ai-center jc-center fw-700 fs-12`} style={{ display: "inline-flex", width: 26, height: 26 }}>{gv}</span>
                : ""}
            </td>
            {i === frontEnd - 1 && !is9 && (
              <td style={colOut}>
                {sumArr(gross, 0, frontEnd)}
                {par && toParSpan(sumArr(gross, 0, frontEnd), sumArr(par, 0, frontEnd))}
              </td>
            )}
          </React.Fragment>
        );
      })}
      <td style={is9 ? colTot : colIn}>
        {is9 ? totalG : sumArr(gross, backStart, hc)}
        {par && toParSpan(is9 ? totalG : sumArr(gross, backStart, hc), is9 ? totalP : sumArr(par, backStart, hc))}
      </td>
      {!is9 && (
        <td style={colTot}>
          {totalG}
          {tp != null && <span className={`sc-topar ${toParClass(tp)}`}>{fmtToPar(tp, "")}</span>}
        </td>
      )}
    </tr>
  );
}

/* Comparison table: delta row (last vs first) */
function CompDeltaRow({ first, last, hc, is9, frontEnd, backStart }: {
  first: (number | null)[]; last: (number | null)[];
  hc: number; is9: boolean; frontEnd: number; backStart: number;
}) {
  const cs: React.CSSProperties = { padding: "4px 6px", textAlign: "center", fontSize: 11, borderBottom: "1px solid var(--bg-hover)" };
  const colLabel: React.CSSProperties = { ...cs, textAlign: "left", paddingLeft: 8, borderRight: "2px solid var(--border-light)", fontWeight: 700, color: "var(--text-3)" };
  const colOut: React.CSSProperties = { ...cs, background: "var(--bg-muted)", borderLeft: "1px solid var(--border-light)", borderRight: "1px solid var(--border-light)" };
  const colIn: React.CSSProperties = { ...colOut };
  const colTot: React.CSSProperties = { ...cs, background: "var(--bg-muted)", borderLeft: "1px solid var(--border-light)" };

  const fmtDelta = (d: number | null) => {
    if (d == null) return { text: "", color: "var(--text-muted)", weight: 400 as const };
    if (d === 0) return { text: "=", color: "var(--text-muted)", weight: 400 as const };
    return { text: fmtSign(d), color: sc2(d, 0), weight: 600 as const };
  };

  return (
    <tr className="bg-detail bt-heavy">
      <td style={colLabel}>Δ</td>
      {Array.from({ length: hc }, (_, i) => {
        const d = last[i] != null && first[i] != null ? last[i]! - first[i]! : null;
        const f = fmtDelta(d);
        return (
          <React.Fragment key={i}>
            <td style={{ ...cs, color: f.color, fontWeight: f.weight }}>{f.text}</td>
            {i === frontEnd - 1 && !is9 && (() => {
              const dOut = sumArr(last, 0, frontEnd) - sumArr(first, 0, frontEnd);
              const fo = fmtDelta(dOut);
              return <td style={{ ...colOut, color: fo.color, fontWeight: fo.weight }}>{fo.text}</td>;
            })()}
          </React.Fragment>
        );
      })}
      {(() => {
        const dIn = (is9 ? sumArr(last, 0, hc) : sumArr(last, backStart, hc)) - (is9 ? sumArr(first, 0, hc) : sumArr(first, backStart, hc));
        const fi = fmtDelta(dIn);
        return <td style={{ ...(is9 ? colTot : colIn), color: fi.color, fontWeight: fi.weight }}>{fi.text}</td>;
      })()}
      {!is9 && (() => {
        const dTot = sumArr(last, 0, hc) - sumArr(first, 0, hc);
        const ft = fmtDelta(dTot);
        return <td style={{ ...colTot, color: ft.color }}>{ft.text}</td>;
      })()}
    </tr>
  );
}

/* ─── Tournament Round Row (with expandable scorecard + eclectic injection) ─── */
function TournRoundRow({ r, idx: _idx, data }: {
  r: RoundData & { course: string }; idx: number; data: PlayerPageData;
}) {
  const [scOpen, setScOpen] = useState(false);
  const holes = data.HOLES[String(r.scoreId)];
  const courseKey = norm(r.course);
  const teeKey = r.teeKey || normKey(r.tee || "");
  const ecEntry = data.ECDET?.[courseKey]?.[teeKey] || null;

  return (
    <>
      <tr className="roundRow" onClick={r.hasCard && holes ? () => setScOpen(v => !v) : undefined}
        style={{ cursor: r.hasCard && holes ? "pointer" : "default" }}>
        <td>
          <TeeDate date={r.date} tee={r.tee || ""} />
          <OriginPill origin={r.scoreOrigin} />
          {String(r.scoreId).startsWith("extra_")
            ? <span className="muted fs-10 ml-4">Extra</span>
            : <span className="muted fs-10 ml-4">#{r.scoreId}</span>}
        </td>
        <td className="r"><HoleBadge hc={r.holeCount} /></td>
        <td className="r">{r.hi ?? ""}</td>
        <td><TeePill name={r.tee || ""} /></td>
        <td className="r muted">{r.meters ? `${r.meters}m` : ""}</td>
        <td className="r"><GrossCell gross={r.gross} par={r.par} /></td>
        <td className="r">{fmtStb(r.stb, r.holeCount)}</td>
        <td className="r"><SdCell round={r} /></td>
      </tr>
      {scOpen && holes && (
        <tr>
          <td colSpan={8} className="bg-page p-0">
            <div className="scHost" style={scHostStyle}>
              <ScorecardTable
                holes={holes}
                courseName={r.course}
                date={r.date}
                tee={r.tee || ""}
                hi={r.hi}
                links={r._links}
                pill={effectivePill(r)}
                eclecticEntry={ecEntry}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   By Tournament View
   ──────────────────────────────────────────────────────────────────────────────────────── */

function ByTournamentView({ data, search }: { data: PlayerPageData; search: string }) {
  const items = useMemo(() => {
    const term = norm(search);

    /* ─── nameSimilarity (port from helpers.js) ─── */
    function nameSimilarity(name1: string, name2: string, course1?: string, course2?: string): number {
      if (!name1 || !name2) return 0;
      let n1 = norm(name1).replace(/internancional|internaccional|interacional/g, "internacional");
      let n2 = norm(name2).replace(/internancional|internaccional|interacional/g, "internacional");
      if (n1 === n2) return 1;
      const awayKw = ["away", "internacional", "international", "tour", "viagem", "estrangeiro", "abroad"];
      const has1 = awayKw.some(k => n1.includes(k));
      const has2 = awayKw.some(k => n2.includes(k));
      if (has1 && has2) {
        const stop = ["away", "internacional", "international", "tour", "viagem", "estrangeiro", "de", "do", "da", "em", "no", "na", "abroad"];
        const w1 = n1.split(/\s+/).filter(w => w.length > 2 && !stop.includes(w));
        const w2 = n2.split(/\s+/).filter(w => w.length > 2 && !stop.includes(w));
        if (w1.length > 0 && w2.length > 0) {
          if (w1.some(a => w2.some(b => a === b || a.includes(b) || b.includes(a)))) return 0.95;
        }
        if (w1.length === 0 && w2.length === 0) {
          if (course1 && course2 && norm(course1) === norm(course2)) return 0.95;
          return 0.8;
        }
      }
      const patterns = [/\bd[1-9]\b/g, /\bdia\s*[1-9]\b/gi, /\b[1-9]a?\s*(volta|ronda|dia)\b/gi, /\b(primeira|segunda|terceira|quarta)\s*(volta|ronda)\b/gi];
      let base1 = n1, base2 = n2;
      for (const p of patterns) { base1 = base1.replace(p, ""); base2 = base2.replace(p, ""); }
      base1 = base1.replace(/\s+/g, " ").trim();
      base2 = base2.replace(/\s+/g, " ").trim();
      if (base1 === base2 && base1.length > 5) return 1;
      const words1 = n1.split(/\s+/).filter(w => w.length > 2);
      const words2 = n2.split(/\s+/).filter(w => w.length > 2);
      if (!words1.length || !words2.length) return 0;
      let common = 0;
      for (const w of words1) { if (words2.some(w2 => w2.includes(w) || w.includes(w2))) common++; }
      return common / Math.max(words1.length, words2.length);
    }

    type RoundExt = RoundData & { course: string };

    /* 1. Flatten all named non-training rounds */
    const allRoundsWithNames: RoundExt[] = [];
    data.DATA.forEach(c => c.rounds.forEach(r => {
      if (r.eventName && r.dateSort && !r._isTreino) {
        allRoundsWithNames.push({ ...r, course: c.course });
      }
    }));
    allRoundsWithNames.sort((a, b) => a.dateSort - b.dateSort);

    /* 2. Group by similarity + _group override */
    type Group = { name: string; courses: string[]; rounds: RoundExt[]; _group: string };
    const globalGroups: Group[] = [];

    for (const r of allRoundsWithNames) {
      let found = false;
      for (const group of globalGroups) {
        const rGroup = r._group || "";
        const gGroup = group._group || "";
        // _group override
        if (rGroup || gGroup) {
          if (rGroup !== gGroup) continue;
          group.rounds.push(r);
          if (!group.courses.includes(r.course)) group.courses.push(r.course);
          found = true;
          break;
        }
        // Similarity + day gap
        const similarity = nameSimilarity(r.eventName, group.name, r.course, group.courses[0]);
        let minGap = 999;
        for (const gr of group.rounds) {
          const gap = Math.abs((r.dateSort - gr.dateSort) / 86400000);
          if (gap < minGap) minGap = gap;
        }
        const sameCourse = group.courses.some(gc => norm(gc) === norm(r.course));
        const bothAway = /away|internacional|international|tour|viagem|estrangeiro|abroad/i.test(r.eventName) &&
          /away|internacional|international|tour|viagem|estrangeiro|abroad/i.test(group.name);
        // Impede fusão entre séries distintas (ex: Drive Tour vs Drive Challenge)
        const isTour = /\btour\b/i.test(r.eventName);
        const isChallenge = /\bchallenge\b/i.test(r.eventName);
        const gIsTour = /\btour\b/i.test(group.name);
        const gIsChallenge = /\bchallenge\b/i.test(group.name);
        const crossSeries = (isTour && gIsChallenge) || (isChallenge && gIsTour);
        if (!crossSeries && ((similarity >= 0.3 && minGap <= 2) ||
          (sameCourse && minGap <= 2 && bothAway && group.rounds.length < 4))) {
          group.rounds.push(r);
          if (!group.courses.includes(r.course)) group.courses.push(r.course);
          found = true;
          break;
        }
      }
      if (!found) {
        globalGroups.push({ name: r.eventName, courses: [r.course], rounds: [r], _group: r._group || "" });
      }
    }

    /* 3. Build items from groups */
    type TournItem = { type: string; course: string; name: string; rounds: RoundExt[] };
    const items: TournItem[] = [];
    const placeholders = ["internacional", "away", "estrangeiro", "tour", "abroad"];

    for (const g of globalGroups) {
      if (g.rounds.length >= 2) {
        const realCourses = g.courses.filter(c => !placeholders.some(p => norm(c) === p));
        const finalCourse = realCourses.length > 0
          ? (realCourses.length === 1 ? realCourses[0] : realCourses.join(", "))
          : g.courses[0];
        items.push({
          type: "event", course: finalCourse,
          name: g._group || g.name,
          rounds: g.rounds.sort((a, b) => a.dateSort - b.dateSort),
        });
      } else if (g.rounds.length === 1 && g.rounds[0]._showInTournament) {
        items.push({ type: "event", course: g.courses[0], name: g.name, rounds: g.rounds });
      }
    }

    /* 4. Clusters of unnamed rounds on consecutive days */
    function dayFloor(ts: number) { return Math.floor(ts / 86400000) * 86400000; }
    data.DATA.forEach(c => {
      const rr = c.rounds.filter(x => x.dateSort && !x.eventName && !x._isTreino)
        .sort((a, b) => a.dateSort - b.dateSort);
      if (rr.length < 2) return;
      let cur: RoundExt[] = [{ ...rr[0], course: c.course }];
      for (let i = 1; i < rr.length; i++) {
        const gap = (dayFloor(rr[i].dateSort) - dayFloor(rr[i - 1].dateSort)) / 86400000;
        if (gap <= 1) {
          cur.push({ ...rr[i], course: c.course });
        } else {
          if (cur.length >= 2) items.push({ type: "cluster", course: c.course, name: "Torneio (nome não explícito)", rounds: cur });
          cur = [{ ...rr[i], course: c.course }];
        }
      }
      if (cur.length >= 2) items.push({ type: "cluster", course: c.course, name: "Torneio (nome não explícito)", rounds: cur });
    });

    /* 5. Filter + sort */
    let result = items;
    if (term) result = result.filter(it => norm(it.course).includes(term) || norm(it.name).includes(term));
    result.sort((a, b) => {
      const al = a.rounds[a.rounds.length - 1]?.dateSort || 0;
      const bl = b.rounds[b.rounds.length - 1]?.dateSort || 0;
      return (bl - al) || (b.rounds.length - a.rounds.length) || a.course.localeCompare(b.course);
    });
    return result;
  }, [data, search]);

  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="card">
      <div className="table-wrap">
        <table className="dtable-lg">
          <colgroup>
            <col className="col-p46" /><col className="col-p34" />
            <col className="col-p10" /><col className="col-p10" />
          </colgroup>
          <thead>
            <tr><th>Torneio</th><th>Campo</th><th className="r">Rondas</th><th>Datas</th></tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const start = it.rounds[0]?.date || "";
              const end = it.rounds[it.rounds.length - 1]?.date || "";
              const dateStr = start && end && start !== end ? `${start} → ${end}` : (end || start);
              const isOpen = openIdx === idx;
              const sortedRounds = isOpen ? it.rounds.slice().sort((a, b) => a.dateSort - b.dateSort) : [];
              return (
                <React.Fragment key={idx}>
                  <tr>
                    <td>
                      <button className="courseBtn" onClick={() => setOpenIdx(isOpen ? null : idx)}>{it.name}</button>
                      <OriginPill origin={it.rounds[0]?.scoreOrigin} />
                      <PillBadge pill={it.rounds.map(r => effectivePill(r)).find(Boolean) || ""} />
                      <LinkBtns links={it.rounds.find(r => r._links)?._links} />
                    </td>
                    <td><b><CourseLink name={it.course} /></b></td>
                    <td className="r"><b>{it.rounds.length}</b></td>
                    <td className="muted">{dateStr}</td>
                  </tr>
                  {isOpen && (
                    <tr className="details open">
                      <td className="inner" colSpan={4}>
                        <div className="innerWrap">
                          <table className="dt-compact">
                            <thead>
                              <tr>
                                <th>Volta</th><th className="r">Bur.</th><th className="r">HCP</th>
                                <th>Tee</th><th className="r">Dist.</th><th className="r">Gross</th>
                                <th className="r">Stb</th><th className="r">SD</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedRounds.map((r, j) => {
                                return (
                                  <TournRoundRow key={r.scoreId} r={r} idx={j} data={data} />
                                );
                              })}
                              {/* Total row */}
                              {(() => {
                                const withGross = sortedRounds.filter(r => r.gross != null);
                                if (withGross.length < 2) return null;
                                const totalGross = withGross.reduce((a, r) => a + Number(r.gross), 0);
                                const totalStb = sortedRounds.reduce((a, r) => a + (r.stb ?? 0), 0);
                                const totalPar = sortedRounds.reduce((a, r) => a + (Number(r.par) || 0), 0);
                                const toPar = totalPar ? totalGross - totalPar : null;
                                const toParStr = fmtToPar(toPar, "");
                                const toParCls = toPar != null ? (toPar > 0 ? "pos" : toPar < 0 ? "neg" : "") : "";
                                return (
                                  <tr className="bg-detail fw-700 bt-heavy">
                                    <td colSpan={5} className="r fw-700 c-text-2">Total ({withGross.length} voltas)</td>
                                    <td className="r"><b>{totalGross}</b><span className={`score-delta ${toParCls}`}>{toParStr}</span></td>
                                    <td className="r">{totalStb || ""}</td>
                                    <td></td>
                                  </tr>
                                );
                              })()}
                            </tbody>
                          </table>
                          {/* Comparative scorecard (all rounds side by side) */}
                          <TournamentComparison
                            rounds={sortedRounds}
                            holesData={data.HOLES}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   Player Detail — data loading + view switching
   ──────────────────────────────────────────────────────────────────────────────────────── */

function PlayerDetail({ fedId, selected, onMetaLoaded }: { fedId: string; selected: { fed: string } & Player; onMetaLoaded?: (meta: PlayerPageData["META"]) => void }) {
  const { data, loading, error } = usePlayerData(fedId);
  const [searchParams, setSearchParams] = useSearchParams();

  const VALID_VIEWS: ViewKey[] = ["by_course", "by_course_analysis", "by_date", "by_tournament", "analysis"];
  const paramView = searchParams.get("view") as ViewKey | null;

  const [view, setViewState] = useState<ViewKey>(
    paramView && VALID_VIEWS.includes(paramView) ? paramView : "by_course"
  );
  const setView = (v: ViewKey) => {
    setViewState(v);
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set("view", v); return n; }, { replace: true });
  };

  const [courseSearch, setCourseSearch] = useState("");
  const [courseSort, setCourseSort] = useState<CourseSort>("last_desc");

  // Reset search + view quando muda de jogador; notify parent when player data loads
  useEffect(() => {
    setCourseSearch("");
    const pv = searchParams.get("view") as ViewKey | null;
    setViewState(pv && VALID_VIEWS.includes(pv) ? pv : "by_course");
    if (data?.META) onMetaLoaded?.(data.META);
  }, [data]);

  // Stats (safe even when data is null)
  const totalCourses = data?.DATA.length ?? 0;
  const totalRounds = data?.DATA.reduce((a, c) => a + c.count, 0) ?? 0;
  const curYear = String(new Date().getFullYear());
  const roundsThisYear = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    data.DATA.forEach(c => c.rounds.forEach(r => {
      if (r.date && r.date.slice(-4) === curYear) n++;
    }));
    return n;
  }, [data, curYear]);

  // Current HCP = post-round value from HCP_INFO (not pre-round r.hi)
  const latestHcp = data?.HCP_INFO?.current != null ? Number(data.HCP_INFO.current) : null;
  const meta = data?.META;

  return (
    <div className="pa-page">
      {/* Header: name + controls on same row, pills below */}
      <div className="detail-header">
        <div className="detail-header-top">
          <h2 className="detail-title">
            {selected.name}
            <a
              href={`https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=${selected.fed}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Ver ficha WHS no FPG Scoring"
              style={{ marginLeft: 8, fontSize: 14, color: "var(--chart-2)", textDecoration: "none", verticalAlign: "middle" }}
              onClick={e => e.stopPropagation()}
            >🔗</a>
            <a
              href={`https://my.fpg.pt/Home/PlayerWHS.aspx?no=${selected.fed}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Ver ficha WHS no My FPG"
              style={{ marginLeft: 4, fontSize: 14, color: "var(--chart-2)", textDecoration: "none", verticalAlign: "middle" }}
              onClick={e => e.stopPropagation()}
            >🔗</a>
          </h2>
          {data && (
            <div className="pa-controls-left">
              <input className="input" placeholder="Pesquisar campo…" value={courseSearch}
                onChange={e => setCourseSearch(e.target.value)} />
              <select className="select" value={view}
                onChange={e => setView(e.target.value as ViewKey)}>
                <option value="by_course">Por campo</option>
                <option value="by_course_analysis">Análise por campo</option>
                <option value="by_date">Por data</option>
                <option value="by_tournament">Por torneio</option>
                <option value="analysis">Análises</option>
              </select>
              {(view === "by_course" || view === "by_course_analysis") && (
                <select className="select" value={courseSort}
                  onChange={e => setCourseSort(e.target.value as CourseSort)}>
                  <option value="last_desc">Mais recente</option>
                  <option value="count_desc">Mais jogados</option>
                  <option value="name_asc">Nome A–Z</option>
                </select>
              )}
            </div>
          )}
        </div>
        <div className="jog-pills">
          <span className="p p-fed">#{selected.fed}</span>
          {latestHcp != null && <span className="p p-muted">HCP {hcpDisplay(latestHcp)}</span>}
          <SexBadge sex={selected.sex} size="md" />
          {selected.dob && <span className="p p-birth">{selected.dob.slice(0, 4)}</span>}
          {selected.escalao && <span className={`p p-${escCls(meta?.escalao || selected.escalao)}`}>{meta?.escalao || selected.escalao}</span>}
          {(meta?.club || clubLong(selected)) && <span className="p p-club">{meta?.club || clubLong(selected)}</span>}
          {selected.tags?.filter(t => t !== "no-priority").map(t => (
            <span key={t} className="p p-outline">{t}</span>
          ))}
          {totalCourses > 0 && <span className="p p-outline">{totalCourses} campos</span>}
          {totalRounds > 0 && <span className="p p-outline">{totalRounds} voltas</span>}
          {roundsThisYear > 0 && <span className="p p-outline" title={`Rondas em ${curYear}`}>{roundsThisYear} em {curYear}</span>}
          {meta?.lastUpdate && <span className="muted fs-11">Últ. act.: {meta.lastUpdate}</span>}
        </div>
      </div>

      {loading ? (
        <LoadingState size="sm" message="A carregar análise…" />
      ) : error || !data ? (
        <div className="player-embed-error">Não foi possível carregar: {error}</div>
      ) : (
        <>
          {/* View content */}
          <div className="pa-content">
            {(view === "by_course" || view === "by_course_analysis") && (
              <ByCourseView data={data} search={courseSearch} sort={courseSort}
                isAnalysis={view === "by_course_analysis"} />
            )}
            {view === "by_date" && (
              <ByDateView data={data} search={courseSearch} />
            )}
            {view === "by_tournament" && (
              <ByTournamentView data={data} search={courseSearch} />
            )}
            {view === "analysis" && (
              <AnalysisView data={data} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   Main Page — Jogadores (master-detail)
   ──────────────────────────────────────────────────────────────────────────────────────── */

export default function JogadoresPage() {
  const { players, simCourses: courses } = useAppContext();
  const { fed: urlFed } = useParams<{ fed?: string }>();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sexFilter, setSexFilter] = useState<SexFilter>("ALL");
  const [escalaoFilter, setEscalaoFilter] = useState<Set<string>>(new Set());
  const [regionFilter, setRegionFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [selectedFed, setSelectedFed] = useState<string | null>(urlFed ?? null);
    const isMobileInit = typeof window !== "undefined" && window.innerWidth <= 768;
  const md = useMasterDetail(!(isMobileInit && urlFed));
  const [playerMeta, setPlayerMeta] = useState<PlayerPageData["META"] | null>(null);
  const rankingMode = sortKey === "ranking";
  const [statsDb, setStatsDb] = useState<PlayerStatsDb>({});
  const [newFilter, setNewFilter] = useState(false);
  const NEW_DAYS = 7; // threshold: "novo" = última ronda há ≤7 dias

  useEffect(() => { loadPlayerStats().then(setStatsDb); }, []);


  /* Ref para distinguir navegação interna (selectPlayer) de externa (URL directo) */
  const internalNav = React.useRef(false);

  /* Sync URL param → selectedFed (só limpa q em navegação externa) */
  useEffect(() => {
    if (urlFed && players[urlFed]) {
      setSelectedFed(urlFed);
      if (!internalNav.current) {
        setQ("");
      }
      internalNav.current = false;
    }
  }, [urlFed, players]);

  /* Helper: select player and update URL */
  const selectPlayer = (fed: string | null) => {
    setSelectedFed(fed);
    if (fed) {
      internalNav.current = true;
      navigate(`/jogadores/${fed}`, { replace: true });
    } else {
      navigate("/jogadores", { replace: true });
    }
  };

  // Populate course key map for course links
  useEffect(() => {
    if (courses?.length) {
      _courseKeyMap = buildCourseKeyMap(courses);
    }
  }, [courses]);

  // Reset meta when player changes
  useEffect(() => { setPlayerMeta(null); }, [selectedFed]);

  const allPlayers = useMemo(() =>
    Object.entries(players).map(([fed, p]) => ({ fed, ...p })),
    [players]);

  const escaloes = useMemo(() => {
    const order = ["Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18", "Sub-21", "Sub-24", "Absoluto", "Sénior", "Outros"];
    const present = new Set<string>();
    allPlayers.forEach(p => p.escalao && present.add(p.escalao));
    return order.filter(e => present.has(e));
  }, [allPlayers]);

  const regions = useMemo(() => {
    const s = new Set<string>();
    allPlayers.forEach(p => p.region && s.add(p.region));
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [allPlayers]);

  const toggleEscalao = (esc: string) => {
    setEscalaoFilter(prev => {
      const next = new Set(prev);
      if (next.has(esc)) next.delete(esc);
      else next.add(esc);
      return next;
    });
  };

  const clearEscalao = () => {
    setEscalaoFilter(new Set());
  };

  const escalaoCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    let list = allPlayers;
    const qq = norm(q);
    if (qq) {
      const words = qq.split(/\s+/).filter(Boolean);
      list = list.filter(p => {
        const haystack = norm([p.name, clubShort(p), p.escalao, p.fed, p.region, ...(p.tags || [])].join(" "));
        return words.every(w => haystack.includes(w));
      });
    }
    if (sexFilter !== "ALL") list = list.filter(p => p.sex === sexFilter);
    if (regionFilter !== "ALL") list = list.filter(p => p.region === regionFilter);
    list = list.filter(p => !p.tags?.includes("hidden"));
    for (const p of list) {
      if (p.escalao) map[p.escalao] = (map[p.escalao] || 0) + 1;
    }
    return map;
  }, [allPlayers, q, sexFilter, regionFilter]);

  const filtered = useMemo(() => {
    const qq = norm(q);
    let list = allPlayers;
    if (qq) {
      const words = qq.split(/\s+/).filter(Boolean);
      list = list.filter(p => {
        const haystack = norm([p.name, clubShort(p), p.escalao, p.fed, p.region, ...(p.tags || [])].join(" "));
        return words.every(w => haystack.includes(w));
      });
    }
    if (sexFilter !== "ALL") list = list.filter(p => p.sex === sexFilter);
    if (escalaoFilter.size > 0) list = list.filter(p => escalaoFilter.has(p.escalao));
    if (regionFilter !== "ALL") list = list.filter(p => p.region === regionFilter);
    list = list.filter(p => !p.tags?.includes("hidden"));
    if (newFilter) list = list.filter(p => { const d = daysSince(statsDb[p.fed]); return d != null && d <= NEW_DAYS; });
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "name": return a.name.localeCompare(b.name, "pt");
        case "hcp": return (a.hcp ?? 999) - (b.hcp ?? 999);
        case "club": return clubShort(a).localeCompare(clubShort(b), "pt");
        case "escalao": return a.escalao.localeCompare(b.escalao, "pt");
        case "ranking": {
          return (a.hcp ?? 999) - (b.hcp ?? 999);
        }
        case "rounds": {
          const ra = statsDb[a.fed]?.roundsTotal ?? 0;
          const rb = statsDb[b.fed]?.roundsTotal ?? 0;
          return rb - ra;
        }
        default: return 0;
      }
    });
  }, [allPlayers, q, sexFilter, escalaoFilter, regionFilter, sortKey, newFilter, statsDb]);

  // Ranking positions based on HCP (global, not filtered)
  const rankings = useMemo(() => {
    const withHcp = allPlayers
      .filter(p => p.hcp != null)
      .sort((a, b) => (a.hcp ?? 999) - (b.hcp ?? 999));
    const map = new Map<string, number>();
    withHcp.forEach((p, i) => map.set(p.fed, i + 1));
    return map;
  }, [allPlayers]);

  useEffect(() => {
    if (filtered.length === 0) return;
    // If no selection → select first. If selected player exists in allPlayers (even if hidden), keep it.
    if (!selectedFed) {
      selectPlayer(filtered[0].fed);
    } else if (!allPlayers.some(p => p.fed === selectedFed)) {
      selectPlayer(filtered[0].fed);
    }
  }, [filtered, allPlayers]);

  const selected = useMemo(() => {
    if (!selectedFed) return null;
    return allPlayers.find(p => p.fed === selectedFed) ?? null;
  }, [allPlayers, selectedFed]);

  return (
    <div className="jogadores-page">
      <div className="toolbar">
        <div className="toolbar-left">
          <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Jogadores" />
          <input className="input" value={q} onChange={e => { setQ(e.target.value); setSelectedFed(null); }}
            placeholder="Nome, clube, n.º federado…" />
          <select className="select" value={sexFilter} onChange={e => setSexFilter(e.target.value as SexFilter)}>
            <option value="ALL">Sexo</option><option value="M">Masculino</option><option value="F">Feminino</option>
          </select>
          <div className="escalao-pills">
            {escalaoFilter.size > 0 && (
              <button className="p p-esc-clear" onClick={clearEscalao} title="Limpar filtros">✕</button>
            )}
            {escaloes.map(esc => {
              const active = escalaoFilter.has(esc);
              const cls = escCls(esc);
              const count = escalaoCountMap[esc] || 0;
              if (count === 0 && !active) return null;
              return (
                <button
                  key={esc}
                  className={`p p-esc-filter p-${cls}${active ? " active" : ""}`}
                  onClick={() => toggleEscalao(esc)}
                  title={`${esc} (${count})`}
                >
                  {esc.replace("Sub-", "S")}{count > 0 && <span className="p-filter-count">{count}</span>}
                </button>
              );
            })}
          </div>
          <select className="select" value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
            <option value="ALL">Região</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {Object.keys(statsDb).length > 0 && (() => {
            const newCount = allPlayers.filter(p => { const d = daysSince(statsDb[p.fed]); return d != null && d <= NEW_DAYS; }).length;
            if (newCount === 0) return null;
            return (
              <button
                className={`p p-esc-filter p-novo${newFilter ? " active" : ""}`}
                onClick={() => setNewFilter(v => !v)}
                title={`${newCount} jogadores com rondas nos últimos ${NEW_DAYS} dias`}
                style={{ background: newFilter ? "var(--color-good)" : undefined, color: newFilter ? "#fff" : undefined, borderColor: newFilter ? "var(--color-good)" : "var(--border-best)", gap: 3 }}
              >
                🟢 Novos<span className="p-filter-count">{newCount}</span>
              </button>
            );
          })()}
          <select className="select" value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
            <option value="name">Nome</option><option value="hcp">Handicap</option>
            <option value="club">Clube</option><option value="escalao">Escalão</option>
            <option value="ranking">🏆 Ranking</option>
            <option value="rounds">Voltas</option>
          </select>
        </div>
        <div className="toolbar-right">
          <div className="chip">{filtered.length} jogadores</div>
        </div>
      </div>

      <div className="master-detail">
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          {filtered.map(p => {
            const isActive = selected?.fed === p.fed;
            const displayClub = (isActive && playerMeta?.club) ? playerMeta.club : clubShort(p);
            const displayEscalao = (isActive && playerMeta?.escalao) ? playerMeta.escalao : p.escalao;
            const displayHcp = (isActive) ? (playerMeta?.latestHcp ?? null) : p.hcp;
            const rank = rankings.get(p.fed);

            return (
              <button key={p.fed} className={`course-item ${isActive ? "active" : ""}`}
                onClick={() => { selectPlayer(p.fed); md.onSelect(); }}>
                <div className="course-item-name flex-center">
                  {rankingMode && rank != null && (
                    <span className={`sidebar-rank ${rank <= 3 ? "sidebar-rank-top3" : rank <= 10 ? "sidebar-rank-top10" : "sidebar-rank-rest"}`}>
                      {rank}
                    </span>
                  )}
                  <span className="flex-1">
                    {p.name}
                    <SexBadge sex={p.sex} size="sm" />
                    {(() => { const d = daysSince(statsDb[p.fed]); return d != null && d <= NEW_DAYS ? <span className="new-round-dot" title={`Ronda há ${d}d`} /> : null; })()}
                  </span>
                  {rankingMode && displayHcp != null && (
                    <span className={`sidebar-sd ${displayHcp <= 5 ? "sidebar-sd-good" : displayHcp <= 15 ? "sidebar-sd-ok" : "sidebar-sd-high"}`}>
                      {hcpDisplay(displayHcp)}
                    </span>
                  )}
                </div>
                <div className="course-item-meta">
                  {[displayClub, displayEscalao, ...(p.tags?.filter(t => t !== "no-priority") || [])].filter(Boolean).join(" · ") || `#${p.fed}`}
                  {displayHcp != null && ` · HCP ${hcpDisplay(displayHcp)}`}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="muted p-16">Nenhum jogador encontrado</div>}
        </div>

        <div className="course-detail jog-detail" ref={md.detailRef}>
          {selected ? (
              <PlayerDetail key={selected.fed} fedId={selected.fed} selected={selected} onMetaLoaded={setPlayerMeta} />
          ) : (
            <div className="muted p-24">Seleciona um jogador</div>
          )}
        </div>
      </div>
    </div>
  );
}
