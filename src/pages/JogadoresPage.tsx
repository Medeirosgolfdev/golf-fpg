import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import type { Player, PlayersDb, Course } from "../data/types";
import { norm, shortDate } from "../utils/format";
import { getTeeHex, textOnColor, normKey, teeBorder } from "../utils/teeColors";
import { clubShort, clubLong, hcpDisplay } from "../utils/playerUtils";
import { numSafe, meanArr, stdevArr, sumArr } from "../utils/mathUtils";
import { scClass, fmtGrossDelta, fmtStb, sdClassByHcp, fmtSdVal, sc2, sc3m, SC } from "../utils/scoreDisplay";
import {
  loadPlayerData,
  type PlayerPageData, type CourseData, type RoundData,
  type EclecticEntry, type HoleStatsData,
  type CrossPlayerData, type HcpInfo, type HoleScores,
} from "../data/playerDataLoader";
import PillBadge from "../ui/PillBadge";
import TeePill from "../ui/TeePill";
import TeeDate from "../ui/TeeDate";
import { deepFixMojibake } from "../utils/fixEncoding";

/* ────────────────────────────────────────────────────────────────────────────────────
   Utility functions (port from client JS)
   ──────────────────────────────────────────────────────────────────────────────────── */

type Props = { players: PlayersDb; courses?: Course[] };
type SexFilter = "ALL" | "M" | "F";
type SortKey = "name" | "hcp" | "club" | "escalao" | "ranking";
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

const scHostStyle: React.CSSProperties = { margin: "6px 8px", border: "1px solid var(--line, #d5dac9)", borderRadius: "var(--radius-xl)", background: "var(--bg-card)", padding: 10, overflow: "hidden" };

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
  return <span className={`sd-pill ${cls}`}>{text}</span>;
}

function HoleBadge({ hc }: { hc: number }) {
  return hc === 9
    ? <span className="hb hb9">9</span>
    : <span className="hb hb18">18</span>;
}

function ScoreCircle({ gross, par, size = "normal" }: { gross: number | null; par: number | null; size?: "normal" | "small" }) {
 if (gross == null || gross <= 0) return <span className="c-border" style={{ fontSize: "9px" }}>NR</span>;
  const cls = par != null ? scClass(gross, par) : "";
  const sizeStyle = size === "small" ? { fontSize: "10px", width: "20px", height: "20px" } : {};
  return <span className={`sc-score ${cls}`} style={sizeStyle}>{gross}</span>;
}

/* ─── EDS / Score Origin Badge ─── */
function EdsBadge({ origin }: { origin?: string }) {
  if (!origin) return null;
  const o = origin.trim();
  // Only show badges for non-tournament origins
  if (!o || o === "Torn" || o === "") return null;
  const sub = o === "EDS" || o === "Individuais" ? " eds-badge-eds" : o === "Extra" ? " eds-badge-extra" : "";
  return <span className={`eds-badge${sub}`}>{o}</span>;
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
      <EdsBadge origin={origin} />
      <PillBadge pill={pill} />
      <LinkBtns links={links} />
    </>
  );
}

/* ─── Course name link → /campos/:courseKey ─── */
function CourseLink({ name }: { name: string }) {
  const key = findCourseKey(name);
  if (!key) return <>{name}</>;
  return (
    <Link to={`/campos/${key}`} className="courseLink" title={`Ver campo: ${name}`} onClick={e => e.stopPropagation()}>
      {name}
    </Link>
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
    <div className="pa-table-wrap">
      <table className="pa-table">
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
          {all.map(r => {
            const isOpen = openScorecardId === r.scoreId;
            const toggle = () => setOpenScorecardId(isOpen ? null : r.scoreId);
            const holes = data.HOLES[String(r.scoreId)];
            const courseKey = norm(r.course);
            const teeKey = r.teeKey || normKey(r.tee || "");
            const ecEntry = data.ECDET?.[courseKey]?.[teeKey] || null;

            return (
              <React.Fragment key={r.scoreId}>
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
                  <td><EventInfo name={r.eventName} origin={r.scoreOrigin} pill={r._pill} links={r._links} /></td>
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
                          pill={r._pill}
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

  const avg = (a: number[]) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  const mn = (a: number[]) => a.length ? Math.min(...a) : null;

  return (
    <div className="card-bordered mb-10">
      <div className="sc-bar-head"><span>Resumo por Tee</span></div>
      <table className="pa-table" style={{ fontSize: 12, marginBottom: 0 }}>
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
            const avgG = avg(t.gross);
            const minG = mn(t.gross);
            const avgStb = avg(t.stb);
            const avgSd = avg(t.sd);
            return (
              <tr key={t.tee}>
                <td><TeePill name={t.tee} /></td>
                <td className="r fw-600">{t.count}</td>
                <td className="r cb-par-ok">{minG ?? "–"}</td>
                <td className="r fw-600">{avgG?.toFixed(1) ?? "–"}</td>
                <td className="r">{avgStb?.toFixed(1) ?? "–"}</td>
                <td className="r">{avgSd != null ? (
                  <span className={`sd-pill ${sdClassByHcp(avgSd, avg(t.hi.filter((x): x is number => x != null)) ?? null)}`}>
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

function ByCourseRow({ course, idx, data, isAnalysis, openScorecard, openScorecardId }: {
  course: CourseData; idx: number; data: PlayerPageData; isAnalysis: boolean;
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

  return (
    <>
      {/* Summary row */}
      <tr className={open ? "pa-row-open" : ""}>
        <td>
          <div className="rowHead">
            <div className="count" style={{ background: getTeeHex(last?.tee || ""), color: textOnColor(getTeeHex(last?.tee || "")), border: teeBorder(getTeeHex(last?.tee || "")) }}>{course.count}</div>
            <button type="button" className="courseBtn" onClick={() => setOpen(v => !v)}>{course.course}</button>
 {findCourseKey(course.course) && <Link to={`/campos/${findCourseKey(course.course)}`} className="courseLink fs-10 ml-4" title="Ver campo" onClick={e => e.stopPropagation()}>↗</Link>}
            <PillBadge pill={course.rounds.find(r => r._pill)?._pill} />
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
  const toParStr = toPar > 0 ? `+${toPar}` : String(toPar);

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
              <span className="sc-pill" style={{ background: teeHex_, color: teeFg_, border: teeBorder(teeHex_) }}>{datePill}</span>
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
                    const tpCls = outTP > 0 ? "sc-topar-pos" : outTP < 0 ? "sc-topar-neg" : "sc-topar-zero";
                    return (
                      <td className="col-out fw-700">
                        {outG}<span className={`sc-topar ${tpCls}`}>{outTP > 0 ? "+" : ""}{outTP}</span>
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
              const inCls = inTP > 0 ? "sc-topar-pos" : inTP < 0 ? "sc-topar-neg" : "sc-topar-zero";
              return (
                <td className={`col-${is9 ? "total" : "in"} fw-700`}>
                  {inG}<span className={`sc-topar ${inCls}`}>{inTP > 0 ? "+" : ""}{inTP}</span>
                </td>
              );
            })()}
            {!is9 && (() => {
              const totCls = toPar > 0 ? "sc-topar-pos" : toPar < 0 ? "sc-topar-neg" : "sc-topar-zero";
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
  const ecBorder = { borderTop: "2px solid var(--border-heavy)" } as const;

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
                const tpCls = outTP > 0 ? "sc-topar-pos" : outTP < 0 ? "sc-topar-neg" : "sc-topar-zero";
                return (
                  <td className="col-out" style={{ fontWeight: 700, ...ecBorder }}>
                    {outEc}<span className={`sc-topar ${tpCls}`}>{outTP > 0 ? "+" : ""}{outTP}</span>
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
          const inCls = inTP > 0 ? "sc-topar-pos" : inTP < 0 ? "sc-topar-neg" : "sc-topar-zero";
          return (
            <td className={`col-${is9 ? "total" : "in"}`} style={{ fontWeight: 700, ...ecBorder }}>
              {inEc}<span className={`sc-topar ${inCls}`}>{inTP > 0 ? "+" : ""}{inTP}</span>
            </td>
          );
        })()}
        {!is9 && (() => {
          const ecTP = sumEc - sumArr(parArr, 0, holeCount);
          const totCls = ecTP > 0 ? "sc-topar-pos" : ecTP < 0 ? "sc-topar-neg" : "sc-topar-zero";
          return (
            <td className="col-total" style={ecBorder}>
              {sumEc}<span className={`sc-topar ${totCls}`}>{ecTP > 0 ? "+" : ""}{ecTP}</span>
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
              {totalDiff > 0 ? "+" : ""}{totalDiff}
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
          <EdsBadge origin={r.scoreOrigin} />
          <PillBadge pill={r._pill} />
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
                pill={r._pill}
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
    <div className="pa-card">
      <div className="pa-table-wrap">
        <table className="pa-table">
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
              <ByCourseRow key={c.course + i} course={c} idx={i} data={data}
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
      <div className="ecTitle">Eclético (gross) por tee</div>
      <div className="ecHint">Clique num tee na tabela de buracos para ver análise e filtrar rondas.</div>

      {/* Summary table */}
      <div className="card-bordered mb-10">
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
              const tpStr = tp == null ? "" : (tp > 0 ? `+${tp}` : String(tp));
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
 <span className="sc-pill fs-10" style={{ background: hx, color: fg, padding: "1px 6px" }}>{trDate}</span>
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

    interface NormRound { sd: number | null; stb: number | null; hi: any; tee: string; date: string; dateSort: number; holeCount: number; gross: number | null; par: number | null }
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

    const avg = (a: number[]) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
    const min2 = (a: number[]) => a.length ? Math.min(...a) : null;
    const max2 = (a: number[]) => a.length ? Math.max(...a) : null;

    // Trend: linear regression on SD
    let trendLabel = "➡️ Estável", trendCls = "trend-flat";
    if (sdArr.length >= 3) {
      const n = sdArr.length;
      let sx = 0, sy = 0, sxy = 0, sx2 = 0;
      for (let i = 0; i < n; i++) { sx += i; sy += sdArr[i]; sxy += i * sdArr[i]; sx2 += i * i; }
      const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
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
      const avgG = avg(grossArr18.map(r => r.gross!))!;
      const avgP = avg(grossArr18.map(r => r.par!))!;
      const diff = avgG - avgP;
      const bestG = min2(grossArr18.map(r => r.gross!))!;
      const bestP = grossArr18.reduce((a, r) => r.gross! < a.gross! ? r : a).par;
      conclusion.push(<span key="avg">Em média fazes <b>{avgG.toFixed(0)} pancadas</b> neste campo (<b>{diff >= 0 ? "+" : ""}{diff.toFixed(0)} vs par</b>). </span>);
      conclusion.push(<span key="best">O teu melhor resultado foi <b>{bestG}</b> (par {bestP}). </span>);
    }
    if (stbArr.length >= 2) {
      const avgStb = avg(stbArr)!;
      if (avgStb >= 36) conclusion.push(<span key="stb">A tua média Stableford de <b>{avgStb.toFixed(0)}</b> mostra que jogas <b className="c-par-ok">consistentemente bem</b> aqui. </span>);
      else if (avgStb >= 30) conclusion.push(<span key="stb">A tua média Stableford de <b>{avgStb.toFixed(0)}</b> mostra desempenho <b>sólido</b>. </span>);
      else conclusion.push(<span key="stb">A tua média Stableford de <b>{avgStb.toFixed(0)}</b> sugere <b className="c-eagle">espaço para melhorar</b> neste campo. </span>);
    }
    if (trendCls === "trend-up") conclusion.push(<span key="trend">A tendência é <b className="c-par-ok">positiva</b> — estás a melhorar neste campo. </span>);
    else if (trendCls === "trend-down") conclusion.push(<span key="trend">A tendência é <b className="c-birdie">negativa</b> — os resultados recentes pioraram. </span>);
    if (teeArr.length > 1) {
      const bestTee = teeArr.reduce((a, b) => (avg(b.stbs) ?? 0) > (avg(a.stbs) ?? 0) ? b : a);
      if (bestTee.stbs.length >= 2) conclusion.push(<span key="tee">Os tees <b>{bestTee.tee}</b> são onde tens melhores resultados (Stb {avg(bestTee.stbs)!.toFixed(0)}). </span>);
    }

    return {
      has9: r9.length > 0, r18Count: r18.length, r9Count: r9.length,
      totalRounds: allNorm.length,
      sdArr, stbArr,
      avgSd: avg(sdArr), minSd: min2(sdArr), maxSd: max2(sdArr),
      avgStb: avg(stbArr), maxStb: max2(stbArr),
      trendLabel, trendCls,
      conclusion,
    };
  }, [rounds]);

  if (!stats) return null;

  return (
    <div className="courseAnalysis">
      <div className="caTitle">
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
        <div className="caConclusion">
          <div className="caConcTitle">💡 Resumo</div>
          <div className="caConcText">{stats.conclusion}</div>
        </div>
      )}
    </div>
  );
}

function HoleStatsSection({ stats }: { stats: HoleStatsData }) {
  const fD = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(1);
  const fD2 = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
  const pctF = (n: number, tot: number) => tot ? (n / tot * 100).toFixed(0) : "0";

  const td = stats.totalDist;
  const parOrBetter = td ? (td.eagle + td.birdie + td.par) : 0;
  const dblOrWorse = td ? (td.double + td.triple) : 0;
  const parOrBetterPct = td?.total ? parOrBetter / td.total * 100 : 0;
  const dblOrWorsePct = td?.total ? dblOrWorse / td.total * 100 : 0;

  const slColor = sc3(stats.totalStrokesLost, 5, 12);
  const pobCol = sc3(parOrBetterPct, 40, 60, "desc");
  const dowCol = sc3(dblOrWorsePct, 5, 15);

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

  const cs: React.CSSProperties = { padding: "4px 6px", textAlign: "center", fontSize: 11, borderBottom: "1px solid var(--bg-hover)" };
  const colL: React.CSSProperties = { ...cs, textAlign: "left", paddingLeft: 8, borderRight: "2px solid var(--border-light)", whiteSpace: "nowrap", minWidth: 70 };
  const colOut: React.CSSProperties = { ...cs, background: "var(--bg-muted)", borderLeft: "1px solid var(--border-light)", borderRight: "1px solid var(--border-light)" };
  const colIn: React.CSSProperties = { ...colOut };
  const colTot: React.CSSProperties = { ...cs, background: "var(--bg-muted)", borderLeft: "1px solid var(--border-light)", fontWeight: 800 };

  return (
    <div className="holeAnalysis">
      <div className="haTitle">📊 Análise de Performance <span className="muted fs-11">({stats.nRounds} rondas)</span></div>

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
          <div className="haSubTitle">Desempenho por Tipo de Buraco</div>
          <div className="haParGrid">
            {parTypes.map(pt => {
              const g = stats.byParType[pt];
              const isWorst = pt === worstPT && (g.avgVsPar ?? 0) > 0.3;
              const distTotal = g.dist.eagle + g.dist.birdie + g.dist.par + g.dist.bogey + g.dist.double + g.dist.triple;
              const vpCol = sc3(g.avgVsPar ?? 0, 0, 0.4);
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
            <div className="haTopTitle"><span className="c-par-ok">💪 Pontos Fortes</span></div>
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
            <div className="haTopTitle"><span className="c-birdie">🔻 Onde Perdes Mais Pancadas</span></div>
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
          <div className="haSubTitle">Distribuição de Scoring</div>
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
        <div className="card-bordered">
          <div className="sc-bar-head"><span>Detalhe Buraco a Buraco</span></div>
          <div className="scroll-x">
 <table className="w-full fs-11" style={{ borderCollapse: "collapse" }}>
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
 <td className="fw-600 fs-11" style={{ ...colL, color: "var(--text-muted)", borderBottom: "2px solid var(--border-heavy)" }}>Par</td>
                  {stats.holes.slice(0, hc).map((h, i) => (
                    <React.Fragment key={i}>
                      <td style={{ ...cs, borderBottom: "2px solid var(--border-heavy)" }}>{h.par ?? ""}</td>
 {i === fe - 1 && !is9 && <td className="fw-700" style={{ ...colOut, borderBottom: "2px solid var(--border-heavy)" }}>{sumArr(stats.holes.slice(0, fe).map(x => x.par ?? 0), 0, fe)}</td>}
                    </React.Fragment>
                  ))}
 <td className="fw-700" style={{ ...(is9 ? colTot : colIn), borderBottom: "2px solid var(--border-heavy)" }}>
                    {is9 ? sumArr(stats.holes.slice(0, hc).map(x => x.par ?? 0), 0, hc) : sumArr(stats.holes.slice(0, hc).map(x => x.par ?? 0), 9, hc)}
                  </td>
                  {!is9 && <td style={{ ...colTot, borderBottom: "2px solid var(--border-heavy)" }}>{sumArr(stats.holes.slice(0, hc).map(x => x.par ?? 0), 0, hc)}</td>}
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

  const rounds18 = useMemo(() => allRoundsDesc.filter(r => r.holeCount === 18 || (r as any).hc === 18), [allRoundsDesc]);
  const rounds18g = useMemo(() => rounds18.filter(r => numSafe(r.gross) != null && Number(r.gross) > 50), [rounds18]);

  // KPIs
  const last5 = rounds18g.slice(0, 5);
  const last20 = rounds18g.slice(0, 20);
  const grossAll = rounds18g.map(r => Number(r.gross));
  const kpiGross5 = meanArr(last5.map(r => r.gross));
  const kpiGross20 = meanArr(last20.map(r => r.gross));
  const kpiSigma = stdevArr(grossAll);
  const sorted = [...grossAll].sort((a, b) => a - b);
  const n20 = sorted.length ? Math.max(1, Math.floor(sorted.length * 0.2)) : 0;
  const best20 = n20 ? meanArr(sorted.slice(0, n20)) : null;

  // Last 20 (non-training) for table
  const last20Table = useMemo(() =>
    allRoundsDesc.filter(r => !(r as any)._isTreino).slice(0, 20),
    [allRoundsDesc]
  );

  // Best 8 SD in last 20 — Map<index, rank (1-8)>
  const best8 = useMemo(() => {
    const indexed = last20Table.map((r, i) => ({ idx: i, sd: numSafe(r.sd) }))
      .filter(x => x.sd != null)
      .sort((a, b) => a.sd! - b.sd!);
    const map = new Map<number, number>();
    indexed.slice(0, 8).forEach((x, rank) => map.set(x.idx, rank + 1));
    return map;
  }, [last20Table]);

  // Period filter for analysis
  function filterByPeriod(months: number): (RoundData & { course: string })[] {
    if (months <= 0) return allRoundsDesc;
    const cutoff = Date.now() - months * 30.44 * 24 * 3600 * 1000;
    return allRoundsDesc.filter(r => r.dateSort >= cutoff);
  }

  return (
    <div className="pa-card">
      <div className="an-wrap">
        {/* KPI Grid */}
        <div className="an-grid">
          <KPICard title="Média (últimas 5)" val={kpiGross5?.toFixed(1) ?? null}
            sub={`Gross 18B (${last5.length} rondas)`}
            tip="Média do gross das últimas 5 rondas de 18 buracos." />
          <KPICard title="Média (últimas 20)" val={kpiGross20?.toFixed(1) ?? null}
            sub={`Gross 18B (${last20.length} rondas)`}
            tip="Média do gross das últimas 20 rondas de 18 buracos." />
          <KPICard title="Best 20% (média)" val={best20?.toFixed(1) ?? null}
            sub={`Gross 18B (${n20} de ${sorted.length})`}
            tip="Média dos melhores 20% dos resultados gross." />
          <KPICard title="Consistência (σ)" val={kpiSigma?.toFixed(2) ?? null}
            sub={`Gross 18B (${sorted.length} rondas)`}
            tip="Desvio padrão do gross. Menor = mais consistente." />
        </div>

        {/* Row: Histogram + Trajectory + Records */}
        <div className="an-grid3">
          <HistogramCard rounds={filterByPeriod(histPeriod)} period={histPeriod} setPeriod={setHistPeriod} />
          <TrajectoryCard rounds={filterByPeriod(trajPeriod)} period={trajPeriod} setPeriod={setTrajPeriod} />
          <RecordsCard rounds={filterByPeriod(recPeriod)} period={recPeriod} setPeriod={setRecPeriod} />
        </div>

        {/* WHS Detail */}
        <WHSDetail hcp={data.HCP_INFO} />

        {/* Last 20 Table */}
        <Last20Table data={data} last20Table={last20Table} best8={best8} />

        {/* Cross Analysis */}
        <CrossAnalysis data={data} />
      </div>
    </div>
  );
}

/* ─── KPI Card ─── */
function KPICard({ title, val, sub, tip }: { title: string; val: string | null; sub: string; tip?: string }) {
  return (
    <div className="an-card">
      <div className="an-k-title">{title}{tip && <span className="kpi-info" title={tip}>ℹ️</span>}</div>
      <div className="an-k-val">{val ? <b>{val}</b> : <span className="muted">–</span>}</div>
      {sub && <div className="an-k-sub muted">{sub}</div>}
    </div>
  );
}

/* ─── Histogram ─── */
function HistogramCard({ rounds, period, setPeriod }: {
  rounds: (RoundData & { course: string })[]; period: number; setPeriod: (n: number) => void;
}) {
  const bins = useMemo(() => {
    const defs = [
      { label: "Excepcional (≤0)", min: -999, max: 0, color: "#0d9488" },
      { label: "Bom (+1 a +5)", min: 1, max: 5, color: "#22c55e" },
      { label: "Razoável (+6 a +10)", min: 6, max: 10, color: "#3b82f6" },
      { label: "Difícil (+11 a +15)", min: 11, max: 15, color: "var(--chart-4)" },
      { label: "Fraco (+16 a +20)", min: 16, max: 20, color: "#f97316" },
      { label: "Mau (+21 a +25)", min: 21, max: 25, color: "#ef4444" },
      { label: "Desastroso (>+25)", min: 26, max: 999, color: "var(--color-danger-dark)" },
    ];
    const diffs: number[] = [];
    for (const r of rounds) {
      if (r.gross != null && r.par != null && Number(r.par) > 0) {
        let diff = Number(r.gross) - Number(r.par);
        if (r.holeCount === 9) diff *= 2;
        diffs.push(diff);
      }
    }
    let maxCount = 0;
    const result = defs.map(d => {
      const count = diffs.filter(v => v >= d.min && v <= d.max).length;
      if (count > maxCount) maxCount = count;
      return { ...d, count };
    });
    const avg = diffs.length ? (diffs.reduce((a, b) => a + b, 0) / diffs.length) : 0;
    const sorted = [...diffs].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)] || 0;
    return { bins: result, maxCount, total: diffs.length, avg, median };
  }, [rounds]);

  return (
    <div className="an-card">
      <div className="d-flex justify-between items-center mb-8">
        <div className="an-k-title m-0">Desempenho vs Par</div>
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
        grosses.push(r.holeCount === 9 ? Number(r.gross) * 2 : Number(r.gross));
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
    <div className="an-card">
      <div className="d-flex justify-between items-center mb-8">
        <div className="an-k-title m-0">Trajectória</div>
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>
      {!stats ? <div className="muted">Poucos dados</div> : (
        <div className="grid-3-tc">
          <div className="bg-detail br-lg jog-cross-pad">
            <div className="muted fs-10">ÚLTIMAS 5</div>
            <div className="kpi-value">{stats.last5}</div>
 <div className="fw-600 fs-11" style={{ color: sc3m(stats.diff5, 1, 1) }}>
              {stats.diff5 > 0 ? "+" : ""}{stats.diff5.toFixed(1)}
            </div>
          </div>
          <div className="bg-detail br-lg jog-cross-pad">
            <div className="muted fs-10">ÚLTIMAS 10</div>
            <div className="kpi-value">{stats.last10}</div>
 <div className="fw-600 fs-11" style={{ color: sc3m(stats.diff10, 1, 1) }}>
              {stats.diff10 > 0 ? "+" : ""}{stats.diff10.toFixed(1)}
            </div>
          </div>
          <div className="bg-detail br-lg jog-cross-pad">
            <div className="muted fs-10">CARREIRA</div>
            <div className="kpi-value">{stats.overall}</div>
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
    const r18 = rounds.filter(r => r.holeCount === 18 && numSafe(r.gross) != null && Number(r.gross) > 50);
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
    <div className="an-card">
      <div className="d-flex justify-between items-center mb-8">
        <div className="an-k-title m-0">Recordes Pessoais</div>
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
function WHSDetail({ hcp }: { hcp: HcpInfo }) {
  if (hcp.current == null) {
    return <div className="an-card"><div className="an-k-title">Handicap — Detalhe WHS</div><div className="muted">Sem dados WHS disponíveis</div></div>;
  }
  return (
    <div className="an-card">
      <div className="an-k-title">Handicap — Detalhe WHS</div>
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
    </div>
  );
}

/* ─── Last 20 Table with scorecard expansion ─── */
function Last20Table({ data, last20Table, best8 }: {
  data: PlayerPageData;
  last20Table: (RoundData & { course: string })[];
  best8: Map<number, number>;
}) {
  const [openSc, setOpenSc] = useState<string | null>(null);

  return (
    <div className="an-card">
      <div className="an-k-title">Últimas 20 rondas</div>
      <div className="muted mb-8 fs-11">
        Os 8 melhores SD das últimas 20 estão assinalados com ★ · <b>*</b> = Stableford normalizado 9B→18B (+17 pts WHS)
      </div>
      <div className="pa-table-wrap">
        <table className="an-table">
          <thead>
            <tr>
              <th>Data</th><th>Campo</th><th>Prova</th>
              <th className="r">Bur.</th><th className="r">HCP</th><th>Tee</th>
              <th className="r">Dist.</th><th className="r">Gross</th><th className="r">Stb</th>
              <th className="r">SD</th><th className="r">Top 8</th>
            </tr>
          </thead>
          <tbody>
            {last20Table.map((r, i) => {
              const rank = best8.get(i);
              const isBest8 = rank != null;
              const isOpen = openSc === r.scoreId;
              const holes = data.HOLES[String(r.scoreId)];

              // Eclectic entry
              const courseKey = norm(r.course);
              const teeKey = r.teeKey || normKey(r.tee || "");
              const ecEntry = data.ECDET?.[courseKey]?.[teeKey] || null;

              return (
                <React.Fragment key={r.scoreId}>
                  <tr style={isBest8 ? { background: "var(--bg-success)" } : undefined}>
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
                    <td className="fs-11"><EventInfo name={r.eventName} origin={r.scoreOrigin} pill={r._pill} links={r._links} /></td>
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
                      <td colSpan={11} className="bg-page p-0">
                        <div className="scHost" style={scHostStyle}>
                          <ScorecardTable
                            holes={holes}
                            courseName={r.course}
                            date={r.date}
                            tee={r.tee || ""}
                            hi={r.hi}
                            links={r._links}
                            pill={r._pill}
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
function CrossAnalysis({ data }: { data: PlayerPageData }) {
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
    <div className="an-card" style={{ marginTop: 24 }}>
 <div className="an-k-title fs-18" style={{ marginBottom: 16 }}>📊 Cross-Análise por Escalão</div>
      {/* Tabs */}
      <div className="cross-tabs jog-cross-wrap">
        {escalaos.map(esc => (
          <button key={esc} className={`cross-tab ${esc === activeEsc ? "active" : ""}`}
            onClick={() => setActiveEsc(esc)}>
            {esc} <span className="cross-tab-count">{byEscalao[esc].length}</span>
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
      <div className="pa-table-wrap">
        <table className="an-table cross-table">
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
                    {isCurrent ? <b>{p.name}</b> : p.name}
                    {" "}<span className="muted fs-10">{p.fed}</span>
                    {p.birthYear && <span className="hd-pill hd-birth fs-9 ml-4" style={{ padding: "1px 5px" }}>{p.birthYear}</span>}
                    {p.club && <span className="hd-pill hd-club fs-9 ml-4" style={{ padding: "1px 5px" }}>{p.club}</span>}
                  </td>
                  <td className="r"><b>{p.currentHcp?.toFixed(1) ?? "–"}</b></td>
                  <td className={`r ${p.lastSD != null && p.currentHcp != null ? sdClassByHcp(p.lastSD, p.currentHcp) : ""}`}>
                    {p.lastSD?.toFixed(1) ?? "–"}
                  </td>
                  <td className="r">{p.avgSD20?.toFixed(1) ?? "–"}</td>
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

  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)", "#c2410c", "#6366f1"];

  return (
    <div className="mt-20">
      <div className="cross-section-title flex-center-gap12">
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
              <text x={PAD.left - 4} y={vy + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)">{val.toFixed(1)}</text>
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
              {p.name.split(" ")[0]} {p.currentHcp != null ? `(${p.currentHcp.toFixed(1)})` : ""}
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
    const map: Record<string, { course: string; tee: string; players: { name: string; fed: string; best: number | null; avg: number; worst: number | null; count: number; rounds: any[] }[] }> = {};
    for (const p of players) {
      if (!p.courseTee) continue;
      for (const ctk in p.courseTee) {
        const ct = p.courseTee[ctk];
        if (!ct.course || ct.course.toUpperCase() === "NONE" || !ct.course.trim()) continue;
        if (!map[ctk]) map[ctk] = { course: ct.course, tee: ct.tee || "?", players: [] };
        map[ctk].players.push({
          name: p.name, fed: p.fed, best: ct.best, avg: ct.avg,
          worst: ct.worst, count: ct.count, rounds: ct.rounds || []
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
      <div className="cross-section-title">Campos em Comum (mesmo tee) — {escName}</div>
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
                      {medal} {mp.name.split(" ")[0]} <b>{mp.best ?? "–"}</b>
                    </span>
                  );
                })}
              </div>
            </div>
            {isOpen && (
              <div className="card-detail-inner">
                <table className="an-table" style={{ fontSize: 12 }}>
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
                          <td>{isCur ? <b>{cp.name}</b> : cp.name}</td>
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
 <div key={hp.fed} className="br-default mt-6" style={{ padding: "6px 8px", border: isCur ? "1px solid var(--color-good)" : "1px solid var(--border-light)", background: isCur ? "var(--bg-success)" : "var(--bg)" }}>
                      <div className="fw-600 fs-11 mb-4">
                        {hp.name} <span className="muted">({hp.rounds.length} ronda{hp.rounds.length > 1 ? "s" : ""})</span>
                      </div>
 <div className="flex-wrap-gap8 gap-4" >
                        {hp.rounds.map((rd: any, ri: number) => {
                          const isBest = rd.gross === hp.best;
                          return (
                            <div key={ri} style={{ padding: "3px 8px", borderRadius: "var(--radius)", fontSize: 11, background: isBest ? "var(--bg-success-strong)" : "var(--bg-card)", border: `1px solid ${isBest ? "var(--border-success)" : "var(--border-light)"}`, display: "flex", gap: 6, alignItems: "center" }}>
                              <span className="c-text-3">{rd.date || "–"}</span>
                              <span className="fw-700">{rd.gross}{rd.par ? <span className={`score-delta fs-9 ${(rd.gross - rd.par) > 0 ? "pos" : (rd.gross - rd.par) < 0 ? "neg" : ""}`} style={{ marginLeft: 2 }}>{(rd.gross - rd.par) > 0 ? "+" : ""}{rd.gross - rd.par}</span> : null}</span>
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
 <select className="select fs-11" style={{ padding: "2px 6px" }}
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
  const fgT = textOnColor(hx);
  const totalPar = par ? sumArr(par, 0, hc) : null;
  const totalDist = meters ? sumArr(meters, 0, hc) : null;
  const hcpLabel = rounds[0]?.hi ?? "";
  const allSameTee = rounds.every(r => (r.tee || "") === tee);
  const teeLabel = allSameTee ? `Tee ${tee}` : "Tees variados";

  // Gather gross arrays per round
  const roundGross: ((number | null)[] | null)[] = rounds.map(r => {
    const h = holesData[String(r.scoreId)];
    return h?.g || null;
  });

  // Build header info
  const headerText = `Scorecard comparativo · HCP ${hcpLabel} · ${teeLabel}${totalDist && allSameTee ? ` · ${totalDist}m` : ""}`;

  return (
    <div className="card-bordered mt-12">
      <div className="sc-bar-head">
        <span>{headerText}</span>
        <span>Par {totalPar || ""}</span>
      </div>
      <div className="scroll-x">
 <table className="w-full fs-12" style={{ borderCollapse: "collapse" }}>
          <thead>
            <CompRow label="Buraco" hc={hc} is9={is9} frontEnd={frontEnd}
              cells={Array.from({ length: hc }, (_, i) => String(i + 1))}
              outVal="Out" inVal={is9 ? "TOTAL" : "In"} totalVal={is9 ? undefined : "TOTAL"}
 className="fw-700 fs-11 bb-light c-text-3" style={{ background: "var(--bg-detail)" }}
            />
          </thead>
          <tbody>
            {/* Metros */}
            {meters && meters.some(v => v != null && Number(v) > 0) && (
              <CompRow label="Metros" hc={hc} is9={is9} frontEnd={frontEnd}
                cells={meters.slice(0, hc).map(v => v != null ? String(v) : "")}
                outVal={String(sumArr(meters, 0, frontEnd))} outWeight={600}
                inVal={String(is9 ? sumArr(meters, 0, hc) : sumArr(meters, backStart, hc))} inWeight={600}
                totalVal={is9 ? undefined : String(sumArr(meters, 0, hc))}
                className="c-muted fs-10"
              />
            )}
            {/* S.I. */}
            {si && si.some(v => v != null) && (
              <CompRow label="S.I." hc={hc} is9={is9} frontEnd={frontEnd}
                cells={si.slice(0, hc).map(v => v != null ? String(v) : "")}
                outVal="" inVal="" totalVal={is9 ? undefined : ""}
                className="c-muted fs-10"
              />
            )}
            {/* Par */}
            {par && par.some(v => v != null) && (
              <CompRow label="Par" hc={hc} is9={is9} frontEnd={frontEnd}
                cells={par.slice(0, hc).map(v => v != null ? String(v) : "–")}
                outVal={String(sumArr(par, 0, frontEnd))} outWeight={700}
                inVal={String(is9 ? sumArr(par, 0, hc) : sumArr(par, backStart, hc))} inWeight={700}
                totalVal={is9 ? undefined : String(sumArr(par, 0, hc))}
                className="fw-600 c-muted fs-11 bt-heavy"
                sepRow
              />
            )}
            {/* Each round */}
            {rounds.map((rd, ri) => {
              const gross = roundGross[ri];
              if (!gross) return null;
              const dateFmt = rd.date ? rd.date.substring(0, 5).replace("-", "/") : `V${ri + 1}`;
              const rdHx = getTeeHex(rd.tee || "");
              const rdFg = textOnColor(rdHx);
              return (
                <CompScoreRow key={rd.scoreId} label={dateFmt} labelBg={rdHx} labelFg={rdFg}
                  gross={gross} par={par} hc={hc} is9={is9} frontEnd={frontEnd} backStart={backStart} />
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
function CompRow({ label, hc, is9, frontEnd, cells, outVal, inVal, totalVal, style, sepRow, outWeight, inWeight }: {
  label: string; hc: number; is9: boolean; frontEnd: number;
  cells: string[]; outVal?: string; inVal?: string; totalVal?: string;
  style?: React.CSSProperties; sepRow?: boolean; outWeight?: number; inWeight?: number;
}) {
  const cs: React.CSSProperties = { padding: "4px 6px", textAlign: "center", fontSize: 12, borderBottom: "1px solid var(--bg-hover)", ...style };
  const colLabel: React.CSSProperties = { ...cs, textAlign: "left", paddingLeft: 8, borderRight: "2px solid var(--border-light)" };
  const colOut: React.CSSProperties = { ...cs, background: "var(--bg-muted)", borderLeft: "1px solid var(--border-light)", borderRight: "1px solid var(--border-light)", fontWeight: outWeight };
  const colIn: React.CSSProperties = { ...colOut, fontWeight: inWeight };
  const colTot: React.CSSProperties = { ...cs, background: "var(--bg-muted)", borderLeft: "1px solid var(--border-light)", fontWeight: 800 };
  if (sepRow) { cs.borderBottom = "2px solid var(--border-heavy)"; colLabel.borderBottom = "2px solid var(--border-heavy)"; colOut.borderBottom = "2px solid var(--border-heavy)"; colIn.borderBottom = "2px solid var(--border-heavy)"; colTot.borderBottom = "2px solid var(--border-heavy)"; }
  return (
    <tr>
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
    const cls = tp > 0 ? "sc-topar-pos" : tp < 0 ? "sc-topar-neg" : "sc-topar-zero";
    return <span className={`sc-topar ${cls}`}>{tp > 0 ? "+" : ""}{tp}</span>;
  };

  const totalG = sumArr(gross, 0, hc);
  const totalP = par ? sumArr(par, 0, hc) : 0;
  const tp = par ? totalG - totalP : null;

  return (
    <tr>
      <td style={colLabel}><span className="sc-pill" style={{ background: labelBg, color: labelFg }}>{label}</span></td>
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
          {tp != null && <span className={`sc-topar ${tp > 0 ? "sc-topar-pos" : tp < 0 ? "sc-topar-neg" : "sc-topar-zero"}`}>{tp > 0 ? "+" : ""}{tp === 0 ? "E" : tp}</span>}
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
    return { text: d > 0 ? `+${d}` : String(d), color: sc2(d, 0), weight: 600 as const };
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
function TournRoundRow({ r, idx, data }: {
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
          <EdsBadge origin={r.scoreOrigin} />
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
                pill={r._pill}
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
        if ((similarity >= 0.3 && minGap <= 2) ||
          (sameCourse && minGap <= 2 && bothAway && group.rounds.length < 4)) {
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
    <div className="pa-card">
      <div className="pa-table-wrap">
        <table className="pa-table">
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
              return (
                <React.Fragment key={idx}>
                  <tr>
                    <td>
                      <button className="courseBtn" onClick={() => setOpenIdx(isOpen ? null : idx)}>{it.name}</button>
                      <EdsBadge origin={it.rounds[0]?.scoreOrigin} />
                      <PillBadge pill={it.rounds.find(r => r._pill)?._pill} />
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
                              {it.rounds.slice().sort((a, b) => a.dateSort - b.dateSort).map((r, j) => {
                                return (
                                  <TournRoundRow key={r.scoreId} r={r} idx={j} data={data} />
                                );
                              })}
                              {/* Total row */}
                              {(() => {
                                const sorted = it.rounds.slice().sort((a, b) => a.dateSort - b.dateSort);
                                const withGross = sorted.filter(r => r.gross != null);
                                if (withGross.length < 2) return null;
                                const totalGross = withGross.reduce((a, r) => a + Number(r.gross), 0);
                                const totalStb = sorted.reduce((a, r) => a + (r.stb ?? 0), 0);
                                const totalPar = sorted.reduce((a, r) => a + (Number(r.par) || 0), 0);
                                const toPar = totalPar ? totalGross - totalPar : null;
                                const toParStr = toPar != null ? (toPar > 0 ? `+${toPar}` : toPar === 0 ? "E" : String(toPar)) : "";
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
                            rounds={it.rounds.slice().sort((a, b) => a.dateSort - b.dateSort)}
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
  const [data, setData] = useState<PlayerPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("by_course");
  const [courseSearch, setCourseSearch] = useState("");
  const [courseSort, setCourseSort] = useState<CourseSort>("last_desc");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setCourseSearch("");

    loadPlayerData(fedId)
      .then(d => { if (!cancelled) { deepFixMojibake(d); setData(d); setLoading(false); onMetaLoaded?.(d.META); } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });

    return () => { cancelled = true; };
  }, [fedId]);

  // Stats (safe even when data is null)
  const totalCourses = data?.DATA.length ?? 0;
  const totalRounds = data?.DATA.reduce((a, c) => a + c.count, 0) ?? 0;

  // Current HCP = post-round value from HCP_INFO (not pre-round r.hi)
  const latestHcp = data?.HCP_INFO?.current != null ? Number(data.HCP_INFO.current) : null;
  const meta = data?.META;

  return (
    <div className="pa-page">
      {/* Header: name + controls on same row, pills below */}
      <div className="detail-header">
        <div className="detail-header-top">
          <h2 className="detail-title">{selected.name}</h2>
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
          <span className="jog-pill jog-pill-fed">#{selected.fed}</span>
          {latestHcp != null && <span className="jog-pill jog-pill-hcp">HCP {hcpDisplay(latestHcp)}</span>}
          <span className={`jog-pill jog-pill-sex-${selected.sex}`}>{selected.sex === "M" ? "Masculino" : selected.sex === "F" ? "Feminino" : selected.sex}</span>
          {selected.dob && <span className="jog-pill jog-pill-birth">{selected.dob.slice(0, 4)}</span>}
          {selected.escalao && <span className="jog-pill jog-pill-escalao">{meta?.escalao || selected.escalao}</span>}
          {(meta?.club || clubLong(selected)) && <span className="jog-pill jog-pill-club">{meta?.club || clubLong(selected)}</span>}
          {selected.region && <span className="jog-pill jog-pill-region">{selected.region}</span>}
          {selected.tags?.filter(t => t !== "no-priority").map(t => (
            <span key={t} className="jog-pill jog-pill-tag">{t}</span>
          ))}
          {totalCourses > 0 && <span className="jog-pill jog-pill-stats">{totalCourses} campos</span>}
          {totalRounds > 0 && <span className="jog-pill jog-pill-stats">{totalRounds} voltas</span>}
          {meta?.lastUpdate && <span className="jog-pill jog-pill-update">Últ. act.: {meta.lastUpdate}</span>}
        </div>
      </div>

      {loading ? (
        <div className="player-embed-loading">A carregar análise…</div>
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

export default function JogadoresPage({ players, courses }: Props) {
  const { fed: urlFed } = useParams<{ fed?: string }>();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sexFilter, setSexFilter] = useState<SexFilter>("ALL");
  const [escalaoFilter, setEscalaoFilter] = useState<Set<string>>(new Set());
  const [regionFilter, setRegionFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const DEFAULT_FED = "52884";
  const [selectedFed, setSelectedFed] = useState<string | null>(urlFed ?? DEFAULT_FED);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [playerMeta, setPlayerMeta] = useState<PlayerPageData["META"] | null>(null);
  const rankingMode = sortKey === "ranking";


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
  }, [urlFed]);

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
  if (courses?.length && _courseKeyMap.size === 0) {
    _courseKeyMap = buildCourseKeyMap(courses);
  }

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
    selectPlayer(null);
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
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "name": return a.name.localeCompare(b.name, "pt");
        case "hcp": return (a.hcp ?? 999) - (b.hcp ?? 999);
        case "club": return clubShort(a).localeCompare(clubShort(b), "pt");
        case "escalao": return a.escalao.localeCompare(b.escalao, "pt");
        case "ranking": {
          return (a.hcp ?? 999) - (b.hcp ?? 999);
        }
        default: return 0;
      }
    });
  }, [allPlayers, q, sexFilter, escalaoFilter, regionFilter, sortKey]);

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
    if (!selectedFed && filtered.length > 0) {
      const def = filtered.find(p => p.fed === DEFAULT_FED);
      selectPlayer(def ? def.fed : filtered[0].fed);
    }
  }, [filtered, selectedFed]);

  const selected = useMemo(() => {
    if (!selectedFed) return null;
    return allPlayers.find(p => p.fed === selectedFed) ?? null;
  }, [allPlayers, selectedFed]);

  return (
    <div className="jogadores-page">
      <div className="toolbar">
        <div className="toolbar-left">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)} title={sidebarOpen ? "Fechar painel" : "Abrir painel"}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <input className="input" value={q} onChange={e => { setQ(e.target.value); setSelectedFed(null); }}
            placeholder="Nome, clube, n.º federado…" />
          <select className="select" value={sexFilter} onChange={e => setSexFilter(e.target.value as SexFilter)}>
            <option value="ALL">Sexo</option><option value="M">Masculino</option><option value="F">Feminino</option>
          </select>
          <div className="escalao-pills">
            {escalaoFilter.size > 0 && (
              <button className="escalao-pill escalao-pill-clear" onClick={clearEscalao} title="Limpar filtros">✕</button>
            )}
            {escaloes.map(esc => {
              const active = escalaoFilter.has(esc);
              const cls = esc.toLowerCase().replace(/[^a-z0-9]/g, "");
              const count = escalaoCountMap[esc] || 0;
              return (
                <button
                  key={esc}
                  className={`escalao-pill escalao-pill-${cls}${active ? " escalao-pill-active" : ""}`}
                  onClick={() => toggleEscalao(esc)}
                  title={`${esc} (${count})`}
                >
                  {esc.replace("Sub-", "S")}{count > 0 && <span className="escalao-pill-count">{count}</span>}
                </button>
              );
            })}
          </div>
          <select className="select" value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
            <option value="ALL">Região</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="select" value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
            <option value="name">Nome</option><option value="hcp">Handicap</option>
            <option value="club">Clube</option><option value="escalao">Escalão</option>
            <option value="ranking">🏆 Ranking</option>
          </select>
        </div>
        <div className="toolbar-right">
          <div className="chip">{filtered.length} jogadores</div>
        </div>
      </div>

      <div className="master-detail">
        <div className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
          {filtered.map(p => {
            const isActive = selected?.fed === p.fed;
            const displayClub = (isActive && playerMeta?.club) ? playerMeta.club : clubShort(p);
            const displayEscalao = (isActive && playerMeta?.escalao) ? playerMeta.escalao : p.escalao;
            const displayHcp = (isActive) ? (playerMeta?.latestHcp ?? null) : p.hcp;
            const rank = rankings.get(p.fed);

            return (
              <button key={p.fed} className={`course-item ${isActive ? "active" : ""}`}
                onClick={() => selectPlayer(p.fed)}>
                <div className="course-item-name flex-center">
                  {rankingMode && rank != null && (
                    <span className={`sidebar-rank ${rank <= 3 ? "sidebar-rank-top3" : rank <= 10 ? "sidebar-rank-top10" : "sidebar-rank-rest"}`}>
                      {rank}
                    </span>
                  )}
                  <span className="flex-1">
                    {p.name}
                    <span className={`jog-sex-inline jog-sex-${p.sex}`}>{p.sex}</span>
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

        <div className="course-detail jog-detail">
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
