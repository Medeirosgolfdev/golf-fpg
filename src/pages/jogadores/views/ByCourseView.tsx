/**
 * src/pages/jogadores/views/ByCourseView.tsx
 *
 * Vista "⛳ Campos": tabela de campos com linha expansível SEMPRE rica
 * (eclectic, hole stats, evolução, rondas + scorecards). A antiga dualidade
 * "Por campo" simples vs "Análise por campo" foi consolidada em 2026-08-15
 * (a TeeSummaryTable do modo simples morreu — o EclecticSection já cobre o
 * resumo por tee); o deep-link legado ?view=by_course_analysis mapeia aqui.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlayerPageData, CourseData, RoundData } from "../../../data/playerDataLoader";
import { norm } from "../../../utils/format";
import { normKey } from "../../../utils/teeColors";
import { fmtStb } from "../../../utils/scoreDisplay";
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

function ByCourseRow({ course, data, openScorecard, openScorecardId }: {
  course: CourseData; data: PlayerPageData;
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

  // Auto-seleccionar o tee com mais voltas quando se abre o detalhe (caso o
  // utilizador ainda não tenha feito escolha explícita). Assim os gráficos
  // aparecem logo, em vez de exigir um clique prévio.
  useEffect(() => {
    if (!open || activeTee) return;
    const keys = Object.keys(holeStats);
    if (keys.length === 0) return;
    const best = keys.reduce((a, b) => ((holeStats[a]?.nRounds ?? 0) >= (holeStats[b]?.nRounds ?? 0) ? a : b));
    setActiveTee(best);
  }, [open, activeTee, holeStats]);

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
              {/* Rounds table — com tee activo, as rondas com scorecard já aparecem no
                  bloco do Eclético (com HCP/Stb/SD à direita). Aqui mostramos apenas rondas SEM
                  scorecard (para não perder dados) e todas as rondas sem tee seleccionado. */}
              {(() => {
                const hasCardIds = new Set(
                  activeTee
                    ? course.rounds.filter(r => normKey(r.tee || "") === activeTee && data.HOLES[r.scoreId]).map(r => r.scoreId)
                    : []
                );
                const rowsToShow = activeTee
                  ? roundsView.filter(r => !hasCardIds.has(r.scoreId))
                  : roundsView;
                if (rowsToShow.length === 0) return null;
                return (
                  <CourseRoundsTable
                    rows={rowsToShow}
                    data={data}
                    courseName={course.course}
                    note={activeTee ? "Rondas sem scorecard detalhado neste tee:" : null}
                    openScorecardId={openScorecardId}
                    openScorecard={openScorecard}
                  />
                );
              })()}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Tabela de rondas dentro do detalhe do campo (ordenável — regra do projecto) ─── */
type CourseRoundsSortKey = "date" | "event" | "holes" | "hcp" | "tee" | "meters" | "gross" | "stb" | "sd";

function CourseRoundsTable({ rows, data, courseName, note, openScorecardId, openScorecard }: {
  rows: RoundData[]; data: PlayerPageData; courseName: string; note: string | null;
  openScorecardId: string | null; openScorecard: (id: string) => void;
}) {
  const { sortKey, sortDir, toggleSort } = useSort<CourseRoundsSortKey>("date", "desc", {
    gross: "asc", sd: "asc", hcp: "asc", meters: "desc", stb: "desc", holes: "desc",
  });
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "date": return dir * (a.dateSort - b.dateSort);
        case "event": return dir * (a.eventName || "").localeCompare(b.eventName || "", "pt");
        case "holes": return dir * (a.holeCount - b.holeCount);
        case "hcp": return dir * ((a.hi ?? 999) - (b.hi ?? 999));
        case "tee": return dir * (a.tee || "").localeCompare(b.tee || "");
        case "meters": return dir * ((a.meters ?? 0) - (b.meters ?? 0));
        case "gross": return dir * ((a.gross ?? 999) - (b.gross ?? 999));
        case "stb": return dir * ((a.stb ?? -999) - (b.stb ?? -999));
        case "sd": return dir * ((a.sd ?? 999) - (b.sd ?? 999));
        default: return dir * (a.dateSort - b.dateSort);
      }
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className="mt-8">
      {note && <div className="muted fs-11 mb-4">{note}</div>}
      <table className="dt-compact">
        <colgroup>
          <col className="col-p12" /><col className="col-p19" /><col className="col-p7" /><col className="col-p8" />
          <col className="col-p15" /><col className="col-p10" /><col className="col-p12" />
          <col className="col-p9" /><col className="col-p8" />
        </colgroup>
        <thead>
          <tr>
            <SortableHdr k="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Data</SortableHdr>
            <SortableHdr k="event" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Prova</SortableHdr>
            <SortableHdr k="holes" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Bur.</SortableHdr>
            <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">HCP</SortableHdr>
            <SortableHdr k="tee" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Tee</SortableHdr>
            <SortableHdr k="meters" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Dist.</SortableHdr>
            <SortableHdr k="gross" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Gross</SortableHdr>
            <SortableHdr k="stb" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Stb</SortableHdr>
            <SortableHdr k="sd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">SD</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <RoundRow key={r.scoreId} r={r} data={data} courseName={courseName}
              isOpen={openScorecardId === r.scoreId}
              onToggle={() => openScorecard(openScorecardId === r.scoreId ? "" : r.scoreId)} />
          ))}
        </tbody>
      </table>
    </div>
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

export default function ByCourseView({ data, search, sort }: {
  data: PlayerPageData; search: string; sort: CourseSort;
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
            {/* key = nome do campo (único em DATA) — com o índice na key, reordenar
                remontava as linhas e perdia o estado aberto/tee seleccionado. */}
            {list.map(c => (
              <ByCourseRow key={c.course} course={c} data={data}
                openScorecard={setOpenScorecardId} openScorecardId={openScorecardId} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
