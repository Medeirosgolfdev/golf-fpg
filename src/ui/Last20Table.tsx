import React, { useState, useMemo } from "react";
import type { PlayerPageData, RoundData, HoleScores } from "../data/playerDataLoader";
import { norm, shortDate, fmtSign, fmtToPar } from "../utils/format";
import { normKey } from "../utils/teeColors";
import { numSafe } from "../utils/mathUtils";
import { fmtStb, sdClassByHcp } from "../utils/scoreDisplay";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";
import TeeDate from "./TeeDate";
import TeePill from "./TeePill";
import { ScorecardTable } from "./ScorecardTable";
import { CourseLink } from "./jogadoresHelpers";

/** Sort keys for Last20 scorecard table */
export type L20SortKey = "whs" | "date" | "course" | "event" | "holes" | "hcp" | "tee" | "meters" | "gross" | "stb" | "sd" | "rank";

function GrossCell({ gross, par }: { gross: number | null; par: number | null }) {
  const { text, delta, cls } = (() => {
    if (gross == null || par == null) return { text: "", delta: "", cls: "" };
    if (gross <= 0 || par <= 0) return { text: "", delta: "", cls: "" };
    const g = Number(gross);
    const p = Number(par);
    const d = g - p;
    return {
      text: String(g),
      delta: d !== 0 ? fmtSign(d) : "",
      cls: d > 0 ? "pos" : d < 0 ? "neg" : "",
    };
  })();
  if (!text) return null;
  return <><b>{text}</b>{delta && <span className={`score-delta ${cls}`}>{delta}</span>}</>;
}

function SdCell({ round }: { round: RoundData }) {
  const val = numSafe(round.sd);
  if (val == null) return null;
  const cls = sdClassByHcp(val, round.hi);
  return <span className={`p p-${cls}`}>{val.toFixed(1)}</span>;
}

function HoleBadge({ hc }: { hc: number }) {
  return hc === 9
    ? <span className="hb hb9">9</span>
    : <span className="hb hb18">18</span>;
}

function effectivePill(round: { _pill?: string; course?: string; scoreOrigin?: string; eventName?: string }, courseName?: string): string {
  if (round._pill) return round._pill;
  const o = (round.scoreOrigin || "").trim().toUpperCase();
  if (o === "INTERN") return "INTL";
  const c = (courseName || round.course || "").trim().toUpperCase();
  if (c === "INTERNACIONAL" || c === "INTERNATIONAL") return "INTL";
  const ev = (round.eventName || "").trim();
  if (/regional/i.test(ev)) return "REGIONAL";
  if (/nacional/i.test(ev)) return "NACIONAL";
  return "";
}

function OriginPill({ origin }: { origin?: string }) {
  if (!origin) return null;
  const key = origin.trim().toUpperCase();
  if (!key || key === "TORN" || key === "INTERN") return null;
  const ORIGIN_MAP: Record<string, { label: string; cls: string }> = {
    EDS: { label: "EDS", cls: "p p-sm p-origin p-eds" },
    IMPORT: { label: "IMPORT", cls: "p p-sm p-origin p-import" },
    INDIV: { label: "INDIV", cls: "p p-sm p-origin p-indiv" },
    TREINO: { label: "TREINO", cls: "p p-sm p-origin p-treino" },
    EXTRA: { label: "EXTRA", cls: "p p-sm p-origin p-extra" },
  };
  const entry = ORIGIN_MAP[key];
  if (!entry) return null;
  return <span className={entry.cls}>{entry.label}</span>;
}

function EventInfo({ name, origin, pill }: {
  name?: string; origin?: string; pill?: string;
}) {
  return (
    <>
      <span className="muted">{name || ""}</span>
      <OriginPill origin={origin} />
    </>
  );
}

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

const scHostStyle: React.CSSProperties = { margin: "6px 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", background: "var(--bg-card)", padding: 10, overflow: "hidden", width: "fit-content", maxWidth: "calc(100% - 16px)" };

export function Last20Table({ data, last20Table, best8, whsPosMap, bare: _bare }: {
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
  const _whsMax = whsPosMap.size;

  return (
    <div className="card">
      <div className="h-xs fs-18 mb-8">📋 Últimas 20 rondas</div>
      <div className="muted mb-8 fs-11">
        <b>WHS#</b> = posição na janela WHS (só rondas com SD contam) · ★ = top-8 SDs · <b>*</b> = Stableford normalizado 9B→18B · <span style={{ opacity: 0.45 }}>Esbatido</span> = fora da janela · Clica nos cabeçalhos para ordenar
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
                        <><span className="c-par-ok">★</span>{" "}<span className="fw-700">#{rank}</span></>
                      )}
                    </td>
                  </tr>
                  {isOpen && holes && (
                    <tr>
                      <td colSpan={12} className="bg-page p-0">
                        <div className="scroll-x" style={scHostStyle}>
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
