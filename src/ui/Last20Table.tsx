import React, { useState, useMemo } from "react";
import type { PlayerPageData, RoundData } from "../data/playerDataLoader";
import { norm } from "../utils/format";
import { normKey } from "../utils/teeColors";
import { fmtStb } from "../utils/scoreDisplay";
import { GrossCell, SdCell, HoleBadge } from "./tableCells";
import { OriginPill, effectivePill } from "./eventInfo";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";
import TeeDate from "./TeeDate";
import TeePill from "./TeePill";
import { ScorecardTable } from "./ScorecardTable";
import { CourseLink } from "./jogadoresHelpers";

/** Sort keys for Last20 scorecard table */
export type L20SortKey = "whs" | "date" | "course" | "event" | "holes" | "hcp" | "tee" | "meters" | "gross" | "stb" | "sd" | "rank";





function EventInfo({ name, origin }: {
  name?: string; origin?: string; pill?: string;
}) {
  return (
    <>
      <span className="muted">{name || ""}</span>
      <OriginPill origin={origin} />
    </>
  );
}


export function Last20Table({ data, last20Table, best8, whsPosMap, bare }: {
  data: PlayerPageData;
  last20Table: (RoundData & { course: string })[];
  best8: Map<string, number>;
  whsPosMap: Map<string, number>;
  bare?: boolean;
}) {
  const [openSc, setOpenSc] = useState<string | null>(null);
  const { sortKey, sortDir, toggleSort } = useSort<L20SortKey>("date", "desc", {
    gross: "asc", hcp: "asc", sd: "asc", stb: "desc", meters: "desc",
    whs: "asc", rank: "asc", holes: "desc", date: "desc",
  });

  // Rows outside the WHS window (no whs pos) AND after the last WHS round → fade
  const fadingIds = useMemo(() => {
    const s = new Set<string>();
    let pastWindow = false;
    for (const r of last20Table) {
      if (whsPosMap.has(r.scoreId)) { if (whsPosMap.get(r.scoreId) === 20) pastWindow = true; }
      else if (pastWindow) s.add(r.scoreId);
    }
    return s;
  }, [last20Table, whsPosMap]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...last20Table];
    arr.sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "whs": av = whsPosMap.get(a.scoreId) ?? 999; bv = whsPosMap.get(b.scoreId) ?? 999; break;
        case "date": av = a.dateSort; bv = b.dateSort; break;
        case "course": return dir * a.course.localeCompare(b.course, "pt");
        case "event": return dir * (a.eventName || "").localeCompare(b.eventName || "", "pt");
        case "holes": av = a.holeCount; bv = b.holeCount; break;
        case "hcp": av = a.hi ?? 999; bv = b.hi ?? 999; break;
        case "tee": return dir * (a.tee || "").localeCompare(b.tee || "");
        case "meters": av = a.meters ?? 0; bv = b.meters ?? 0; break;
        case "gross": av = a.gross ?? 999; bv = b.gross ?? 999; break;
        case "stb": av = a.stb ?? -999; bv = b.stb ?? -999; break;
        case "sd": av = a.sd ?? 999; bv = b.sd ?? 999; break;
        case "rank": av = best8.get(a.scoreId) ?? 999; bv = best8.get(b.scoreId) ?? 999; break;
        default: av = a.dateSort; bv = b.dateSort;
      }
      return dir * (av - bv);
    });
    return arr;
  }, [last20Table, sortKey, sortDir, best8, whsPosMap]);

  const shProps = { sortKey, sortDir, onSort: toggleSort };

  return (
    // bare = já vive dentro de um CollapseCard com título próprio (AnalysisView)
    // — sem cartão-dentro-de-cartão nem título duplicado; a legenda mantém-se.
    <div className={bare ? undefined : "card"}>
      {!bare && <div className="h-xs fs-18 mb-8">📋 Últimas 20 rondas</div>}
      <div className="muted mb-8 fs-11">
        <b>WHS#</b> = posição na janela WHS (só rondas com SD contam) · ★ = top-8 SDs · <b>*</b> = Stableford normalizado 9B→18B · <span className="u-op-0_45">Esbatido</span> = fora da janela · Clica nos cabeçalhos para ordenar
      </div>
      <div className="scroll-x">
        <table className="dtable">
          <thead>
            <tr>
              <SortableHdr k="whs" {...shProps} className="r">WHS#</SortableHdr>
              <SortableHdr k="date" {...shProps}>Data</SortableHdr>
              <SortableHdr k="course" {...shProps}>Campo</SortableHdr>
              <SortableHdr k="event" {...shProps}>Prova</SortableHdr>
              <SortableHdr k="holes" {...shProps} className="r">Bur.</SortableHdr>
              <SortableHdr k="hcp" {...shProps} className="r">HCP</SortableHdr>
              <SortableHdr k="tee" {...shProps}>Tee</SortableHdr>
              <SortableHdr k="meters" {...shProps} className="r">Dist.</SortableHdr>
              <SortableHdr k="gross" {...shProps} className="r">Gross</SortableHdr>
              <SortableHdr k="stb" {...shProps} className="r">Stb</SortableHdr>
              <SortableHdr k="sd" {...shProps} className="r">SD</SortableHdr>
              <SortableHdr k="rank" {...shProps} className="r">Top 8</SortableHdr>
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
                    <td className="r" style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: whsPosMap.get(r.scoreId) != null ? "var(--text-2)" : "var(--text-4)" }}>
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
                    <td className="fs-11"><EventInfo name={r.eventName} origin={r.scoreOrigin} pill={effectivePill(r)} /></td>
                    <td className="r"><HoleBadge hc={r.holeCount} /></td>
                    <td className="r">{r.hi ?? ""}</td>
                    <td><TeePill name={r.tee || ""} /></td>
                    <td className="r muted">{r.meters ? `${r.meters}m` : ""}</td>
                    <td className="r"><GrossCell gross={r.gross} par={r.par} /></td>
                    <td className="r">{fmtStb(r.stb, r.holeCount)}</td>
                    <td className="r"><SdCell round={r} /></td>
                    <td className="r">
                      {isBest8 && (
                        <><span className="c-good">★</span>{" "}<span className="fw-700">#{rank}</span></>
                      )}
                    </td>
                  </tr>
                  {isOpen && holes && (
                    <tr>
                      <td colSpan={12} className="bg-page p-0">
                        <div className="scroll-x l20-sc-host">
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
