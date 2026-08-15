/**
 * src/pages/jogadores/views/ByCourseView.tsx
 *
 * Vistas "Por campo" e "Análise por campo": tabela de campos com linha
 * expansível (eclectic, hole stats, resumo por tee, rondas + scorecards).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlayerPageData, CourseData, RoundData } from "../../../data/playerDataLoader";
import { norm } from "../../../utils/format";
import { normKey } from "../../../utils/teeColors";
import { numSafe, meanArr, minArr } from "../../../utils/mathUtils";
import { fmtStb, sdClassByHcp } from "../../../utils/scoreDisplay";
import { useSort } from "../../../hooks/useSort";
import SortableHdr from "../../../ui/SortableHdr";
import { HoleBadge, GrossCell, SdCell, CountPill, RoundNumericCells } from "../../../ui/tableCells";
import TeePill from "../../../ui/TeePill";
import TeeDate from "../../../ui/TeeDate";
import AroeiraNotice, { countRotatedRounds } from "../../../ui/AroeiraNotice";
import { PillBadge } from "../../../ui/PillBadge";
import HoleStatsSection from "../../../ui/HoleStatsSection";
import { ScorecardTable } from "../../../ui/ScorecardTable";
import { EclecticSection } from "../../../ui/EclecticSection";
import { findCourseKey } from "../../../ui/jogadoresHelpers";
import { EventInfo, effectivePill } from "../eventInfo";
import { scHostStyle, type CourseSort } from "../shared";
import CoursePerformanceSection from "./CoursePerformanceSection";

/* ─── Tee Summary Table (compact, for simple by_course view) ─── */
function TeeSummaryTable({ rounds }: { rounds: RoundData[] }) {
  const { sortKey, sortDir, toggleSort } = useSort<"rondas" | "melhor" | "media_gr" | "media_stb" | "media_sd">("rondas", "desc", {
    melhor: "asc", media_gr: "asc", media_sd: "asc", media_stb: "desc",
  });

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
    let result = Object.values(map);
    const dir = sortDir === "asc" ? 1 : -1;
    result.sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "rondas": av = a.count; bv = b.count; break;
        case "melhor": av = minArr(a.gross) ?? 999; bv = minArr(b.gross) ?? 999; break;
        case "media_gr": av = meanArr(a.gross) ?? 0; bv = meanArr(b.gross) ?? 0; break;
        case "media_stb": av = meanArr(a.stb) ?? 0; bv = meanArr(b.stb) ?? 0; break;
        case "media_sd": av = meanArr(a.sd) ?? 0; bv = meanArr(b.sd) ?? 0; break;
        default: av = a.count; bv = b.count;
      }
      return dir * (av - bv);
    });
    return result;
  }, [rounds, sortKey, sortDir]);

  if (tees.length <= 1) return null; // No point showing if only 1 tee

  return (
    <div className="mb-10">
      <div className="sc-bar-head"><span>Resumo por Tee</span></div>
      <table className="dtable ec-summary" style={{ marginBottom: 0 }}>
        <thead>
          <tr>
            <th>Tee</th>
            <SortableHdr k="rondas" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Rondas</SortableHdr>
            <SortableHdr k="melhor" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Melhor</SortableHdr>
            <SortableHdr k="media_gr" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Média Gr.</SortableHdr>
            <SortableHdr k="media_stb" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Média Stb</SortableHdr>
            <SortableHdr k="media_sd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Média SD</SortableHdr>
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
                <td className="r fw-600 cb-par-ok">{minG ?? "–"}</td>
                <td className="r fw-600">{avgG?.toFixed(1) ?? "–"}</td>
                <td className="r fw-600">{avgStb?.toFixed(1) ?? "–"}</td>
                <td className="r">{avgSd != null ? (
                  <span className={`p p-sm p-${sdClassByHcp(avgSd, meanArr(t.hi) ?? null)}`}>
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
  const courseLinkKey = findCourseKey(course.course);

  // Na análise por campo, auto-seleccionar o tee com mais voltas quando se abre o detalhe
  // (caso o utilizador ainda não tenha feito escolha explícita). Assim os gráficos aparecem
  // logo, em vez de exigir um clique prévio.
  useEffect(() => {
    if (!open || !isAnalysis || activeTee) return;
    const keys = Object.keys(holeStats);
    if (keys.length === 0) return;
    const best = keys.reduce((a, b) => ((holeStats[a]?.nRounds ?? 0) >= (holeStats[b]?.nRounds ?? 0) ? a : b));
    setActiveTee(best);
  }, [open, isAnalysis, activeTee, holeStats]);

  // Handler de clique manual num tee — só muda o filtro (sem scroll automático).
  // Toggle: clicar no tee já activo limpa o filtro.
  const handleSelectTee = useCallback((tk: string) => {
    setActiveTee(prev => (prev === tk ? null : tk));
  }, []);

  return (
    <>
      {/* Summary row */}
      <tr className={open ? "pa-row-open" : ""}>
        <td>
          <CountPill count={course.count} tee={last?.tee || ""} />
        </td>
        <td>
          <div className="rowHead">
            <button type="button" className="courseBtn" onClick={() => setOpen(v => !v)}>{course.course}</button>
 {courseLinkKey && <a href={`/campos/${courseLinkKey}`} className="courseLink fs-10 ml-4" title="Ver campo" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>↗</a>}
            <PillBadge pill={course.rounds.map(r => effectivePill(r, course.course)).find(Boolean) || ""} />
            <AroeiraNotice
              compact
              courseName={course.course}
              rotatedCount={countRotatedRounds(course.rounds, data.HOLES as Record<string, { _rotated?: number }>)}
              totalRounds={course.rounds.length}
            />
          </div>
        </td>
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
              {/* Nota de unificação + rotação para campos Aroeira (No.1 e No.2) */}
              <AroeiraNotice
                courseName={course.course}
                rotatedCount={countRotatedRounds(course.rounds, data.HOLES as Record<string, { _rotated?: number }>)}
                totalRounds={course.rounds.length}
              />
              {isAnalysis && (
                <>
                  {/* Eclectic */}
                  {ecList.length > 0 && (
                    <EclecticSection ecList={ecList} ecDet={ecDet}
                      courseRounds={course.rounds} holesData={data.HOLES}
                      activeTee={activeTee} onSelectTee={handleSelectTee} />
                  )}
                  {/* Hole Stats for active tee (logo a seguir ao Eclético, por ser o detalhe do tee seleccionado) */}
                  {activeTee && holeStats[activeTee] && (
                    <div id="hole-stats-section">
                      <HoleStatsSection stats={holeStats[activeTee]} />
                    </div>
                  )}
                  {/* Course Performance Analysis (agnóstico ao tee seleccionado) */}
                  <CoursePerformanceSection rounds={roundsView} />
                </>
              )}
              {/* Tee Summary — só no modo não-análise (no modo análise o EclecticSection já cobre) */}
              {!isAnalysis && <TeeSummaryTable rounds={course.rounds} />}
              {/* Rounds table — no modo análise com tee activo, as rondas com scorecard já aparecem no
                  bloco do Eclético (com HCP/Stb/SD à direita). Aqui mostramos apenas rondas SEM scorecard
                  (para não perder dados) e todas as rondas no modo não-análise ou sem tee seleccionado. */}
              {(() => {
                const hasCardIds = new Set(
                  isAnalysis && activeTee
                    ? course.rounds.filter(r => normKey(r.tee || "") === activeTee && data.HOLES[r.scoreId]).map(r => r.scoreId)
                    : []
                );
                const rowsToShow = isAnalysis && activeTee
                  ? roundsView.filter(r => !hasCardIds.has(r.scoreId))
                  : roundsView;
                if (rowsToShow.length === 0) return null;
                return (
              <div className="mt-8">
                {isAnalysis && activeTee && (
                  <div className="muted fs-11 mb-4">Rondas sem scorecard detalhado neste tee:</div>
                )}
                <table className="dt-compact">
                  <colgroup>
                    <col className="col-p12" /><col className="col-p19" /><col className="col-p7" /><col className="col-p8" />
                    <col className="col-p15" /><col className="col-p10" /><col className="col-p12" />
                    <col className="col-p9" /><col className="col-p8" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Data</th><th>Prova</th><th className="r">Bur.</th><th className="r">HCP</th>
                      <th>Tee</th><th className="r">Dist.</th><th className="r">Gross</th>
                      <th className="r">Stb</th><th className="r">SD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsToShow.map(r => {
                      return (
                        <RoundRow key={r.scoreId} r={r} data={data} courseName={course.course}
                          isOpen={openScorecardId === r.scoreId}
                          onToggle={() => openScorecard(openScorecardId === r.scoreId ? "" : r.scoreId)} />
                      );
                    })}
                  </tbody>
                </table>
              </div>
                );
              })()}
            </div>
          </td>
        </tr>
      )}
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
          <div className="muted fs-10">#{r.scoreId}</div>
        </td>
        <td className="col-prova" onClick={e => e.stopPropagation()}>
          <EventInfo name={r.eventName} origin={r.scoreOrigin} pill={effectivePill(r, courseName)} links={r._links}
            fed={data.CURRENT_FED} tcode={r.tcode} ccode={r.ccode} course={courseName} />
        </td>
        <RoundNumericCells r={r} />
      </tr>
      {isOpen && holes && (
        <tr>
          <td colSpan={9} className="bg-page p-0">
            <div className="scroll-x" style={scHostStyle}>
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

export default function ByCourseView({ data, search, sort, isAnalysis }: {
  data: PlayerPageData; search: string; sort: CourseSort; isAnalysis: boolean;
}) {
  const [openScorecardId, setOpenScorecardId] = useState<string | null>(null);
  type ColKey = "course" | "voltas" | "ultima" | "gross" | "stb" | "sd";

  const dropdownToCol = (s: CourseSort): { key: ColKey; dir: "asc" | "desc" } => {
    if (s === "name_asc") return { key: "course", dir: "asc" };
    if (s === "last_desc") return { key: "ultima", dir: "desc" };
    return { key: "voltas", dir: "desc" };
  };

  const initial = dropdownToCol(sort);
  const [sortKey, setSortKey] = useState<ColKey>(initial.key);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initial.dir);

  useEffect(() => {
    const m = dropdownToCol(sort);
    setSortKey(m.key);
    setSortDir(m.dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  const defaultDirMap: Record<ColKey, "asc" | "desc"> = {
    course: "asc", voltas: "desc", ultima: "desc", gross: "asc", stb: "desc", sd: "asc",
  };
  const toggleSort = useCallback((k: ColKey) => {
    if (k === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(defaultDirMap[k]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey]);

  const list = useMemo(() => {
    const term = norm(search);
    let l = data.DATA.slice();
    if (term) l = l.filter(c => norm(c.course).includes(term));

    const dir = sortDir === "asc" ? 1 : -1;
    l.sort((a, b) => {
      let av: number, bv: number;
      const lastA = a.rounds[0];
      const lastB = b.rounds[0];
      switch (sortKey) {
        case "course": return dir * a.course.localeCompare(b.course, "pt");
        case "voltas": av = a.count; bv = b.count; break;
        case "ultima": av = a.lastDateSort; bv = b.lastDateSort; break;
        case "gross": av = (lastA?.gross ?? 999); bv = (lastB?.gross ?? 999); break;
        case "stb": av = (lastA?.stb ?? -999); bv = (lastB?.stb ?? -999); break;
        case "sd": av = (lastA?.sd ?? 999); bv = (lastB?.sd ?? 999); break;
        default: av = a.count; bv = b.count;
      }
      if (av === bv) {
        const tieDate = b.lastDateSort - a.lastDateSort;
        return tieDate !== 0 ? tieDate : a.course.localeCompare(b.course, "pt");
      }
      return dir * (av - bv);
    });
    return l;
  }, [data, search, sortKey, sortDir]);

  return (
    <div className="card">
      <div className="scroll-x">
        <table className="dtable-lg dtable-roomy" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "72px" }} /><col /><col style={{ width: "72px" }} />
            <col style={{ width: "44px" }} /><col style={{ width: "46px" }} /><col style={{ width: "92px" }} />
            <col style={{ width: "60px" }} /><col style={{ width: "64px" }} /><col style={{ width: "44px" }} /><col style={{ width: "54px" }} />
          </colgroup>
          <thead>
            <tr>
              <SortableHdr k="voltas" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Voltas</SortableHdr>
              <SortableHdr k="course" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Campo</SortableHdr>
              <SortableHdr k="ultima" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Última</SortableHdr>
              <th className="r">Bur.</th><th className="r">HCP</th><th>Tee</th>
              <th className="r">Dist.</th>
              <SortableHdr k="gross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Gross</SortableHdr>
              <SortableHdr k="stb" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Stb</SortableHdr>
              <SortableHdr k="sd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">SD</SortableHdr>
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
