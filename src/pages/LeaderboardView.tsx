/**
 * LeaderboardView.tsx — Leaderboard multi-dia para torneios
 *
 * Tabs: [Todos] [WAGR] [Sub-14] [Sub-12]
 * Dropdown: [Dia 1] [Dia 2] … [Acumulado]
 * Filtros: PJA, escalão (WAGR)
 *
 * - Dia específico: scorecard buraco-a-buraco + SD
 * - Acumulado: tabela resumo com colunas por dia + totais + SD médio
 * - "Todos" + dia: cross-categoria ordenado por SD
 * - "Todos" + acumulado: cross-categoria acumulado
 */
import { useMemo, useState } from "react";
import type { PlayersDb } from "../data/types";
import TeePill from "../ui/TeePill";
import {
  type NormalizedTournament,
  type TournCategory,
  type ResultEntry,
  type PlayerHoles,
  type AccumulatedRow,
  dayKeys,
  dayLabel,
  availableDays,
  computeAccumulated,
  calcDaySD,
  findDrawEntry,
  isFemale,
  isPja,
  birthYear,
  escalaoFromYear,
  getTeeRating,
} from "../utils/tournamentTypes";

/* ── Shared helpers ── */

function fmtToPar(tp: number | null): string {
  if (tp == null) return "-";
  return tp === 0 ? "E" : tp > 0 ? `+${tp}` : String(tp);
}

function fmtHcp(v: number | null): string {
  if (v == null) return "-";
  return v > 0 ? v.toFixed(1) : `+${Math.abs(v).toFixed(1)}`;
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

function PlayerLink({ fed, name, onSelect }: { fed: string | null; name: string; onSelect?: (fed: string) => void }) {
  if (fed && onSelect) return <span className="tourn-pname tourn-pname-link" onClick={() => onSelect(fed)}>{name}</span>;
  return <span className="tourn-pname">{name}</span>;
}

/** Pills de jogador: PJA, INTL, ♀, escalão, ano, HCP */
function PlayerPills({ norm, fed, name, showEscalao = true, showHcp = false }: {
  norm: NormalizedTournament; fed: string | null; name: string;
  showEscalao?: boolean; showHcp?: boolean;
}) {
  const pja = isPja(norm, fed);
  const female = isFemale(norm, fed, name);
  const year = birthYear(norm, fed);
  const esc = escalaoFromYear(year);
  const draw = findDrawEntry(norm, fed, name);

  return <>
    {pja && <span className="jog-pill tourn-pill-pja">PJA</span>}
    {!fed && <span className="jog-pill tourn-pill-intl">INTL</span>}
    {female && <><span className="jog-pill jog-pill-sex-F">♀</span><TeePill name={draw?.teeColor ?? "Azuis"} /></>}
    {showEscalao && esc && <span className={`jog-pill jog-pill-escalao jog-pill-escalao-${esc.toLowerCase().replace("-", "")}`}>{esc}</span>}
    {year && <span className="jog-pill jog-pill-birth">{year}</span>}
    {showHcp && draw && <span className="jog-pill jog-pill-stats">{fmtHcp(draw.hcpExact)}</span>}
  </>;
}

function ToParSpan({ tp }: { tp: number | null }) {
  const cls = tp != null && tp <= 0 ? "tp-under" : tp != null && tp <= 5 ? "tp-over1" : "tp-over2";
  return <span className={cls} style={{ fontWeight: 700 }}>{fmtToPar(tp)}</span>;
}

function SdSpan({ sd }: { sd: number | null }) {
  if (sd == null) return <span>–</span>;
  const cls = sd <= 0 ? "tp-under" : sd <= 5 ? "tp-over1" : sd <= 15 ? "" : "tp-over2";
  return <span className={cls} style={{ fontWeight: 600 }}>{sd.toFixed(1)}</span>;
}

type SortDir = "asc" | "desc";

function useSortable(initial: string, initialDir: SortDir = "asc") {
  const [key, setKey] = useState(initial);
  const [dir, setDir] = useState<SortDir>(initialDir);
  const toggle = (k: string) => {
    if (key === k) setDir(d => d === "asc" ? "desc" : "asc");
    else { setKey(k); setDir("asc"); }
  };
  const arrow = (k: string) => key === k ? (dir === "asc" ? " ▲" : " ▼") : "";
  return { key, dir, toggle, arrow };
}

/* ══════════════════════════════════════════
   DayScorecard — buraco-a-buraco para 1 dia
   ══════════════════════════════════════════ */

function DayScorecard({ norm, cat, dayKey, holeData, filters, onSelectPlayer }: {
  norm: NormalizedTournament;
  cat: TournCategory;
  dayKey: string;
  holeData: Map<string, PlayerHoles>;
  filters: { pjaOnly: boolean; escFilter: string };
  onSelectPlayer?: (fed: string) => void;
}) {
  const sort = useSortable("pos");

  const catResults = norm.results[cat.key]?.[dayKey] || [];
  const catHoles = cat.courseData.holes;
  const catParOut = catHoles.slice(0, 9).reduce((s, h) => s + h.par, 0);
  const catParIn = catHoles.slice(9).reduce((s, h) => s + h.par, 0);
  const catTotalM = catHoles.reduce((s, h) => s + h.m, 0);
  const hasResults = catResults.some(r => r.status === "OK");

  const catManualHoles = norm.manualHoles[cat.key]?.[dayKey] || {};

  /* Filter + enrich */
  let classified = catResults.filter(r => r.status === "OK");
  if (filters.pjaOnly) classified = classified.filter(r => isPja(norm, r.fed));
  if (filters.escFilter !== "all") {
    classified = classified.filter(r => escalaoFromYear(birthYear(norm, r.fed)) === filters.escFilter);
  }

  const enriched = classified.map(r => {
    const ph = getPlayerHoles(holeData, r.fed, r.name, catManualHoles);
    const hasHoles = ph && ph.holes.length >= 18;
    const outScore = hasHoles ? ph.holes.slice(0, 9).reduce((s, v) => s + (v ?? 0), 0) : null;
    const inScore = hasHoles ? ph.holes.slice(9, 18).reduce((s, v) => s + (v ?? 0), 0) : null;
    const draw = findDrawEntry(norm, r.fed, r.name);
    const sex = draw?.sex ?? "M";
    const teeColor = draw?.teeColor ?? cat.tee;
    const sd = r.gross != null ? calcDaySD(r.gross, norm, teeColor, sex) : null;
    return { ...r, ph, hasHoles, outScore, inScore, sd };
  });

  /* Sort */
  const sorted = [...enriched].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    switch (sort.key) {
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

  const others = catResults.filter(r => r.status !== "OK" && r.status !== "pending");

  if (!hasResults) {
    // Show pending draw
    const dayDraws = norm.draws[cat.key]?.[dayKey] || [];
    if (dayDraws.length > 0) {
      return (
        <div>
          <div className="tourn-meta" style={{ marginTop: 10, color: "#e67e22", fontWeight: 600 }}>
            ⏳ Resultados {dayLabel(dayKey)} ainda não disponíveis — lista de partida
          </div>
          <div className="tourn-meta">{dayDraws.length} jogadores</div>
        </div>
      );
    }
    return <div className="tourn-meta" style={{ padding: 20, textAlign: "center" }}>Sem resultados para {dayLabel(dayKey)}</div>;
  }

  return (
    <>
      <div className="tourn-meta" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {dayLabel(dayKey)} · Par {cat.courseData.par} · CR {cat.courseData.cr} / Slope {cat.courseData.slope} · <TeePill name={cat.tee} /> {catTotalM}m
      </div>

      <div className="tourn-scroll">
        <table className="tourn-table tourn-scorecard">
          <thead>
            <tr className="tourn-course-hdr">
              <th className="tourn-pos-col sortable" onClick={() => sort.toggle("pos")}>Pos{sort.arrow("pos")}</th>
              <th className="tourn-lb-name-col sortable" onClick={() => sort.toggle("name")}>Jogador{sort.arrow("name")}</th>
              <th className="r tourn-gross-col sortable" onClick={() => sort.toggle("gross")}>Tot{sort.arrow("gross")}</th>
              <th className="r tourn-par-col sortable" onClick={() => sort.toggle("toPar")}>±Par{sort.arrow("toPar")}</th>
              {catHoles.slice(0, 9).map(h => <th key={h.h} className="r tourn-hole-col">{h.h}</th>)}
              <th className="r tourn-sum-col sortable" onClick={() => sort.toggle("out")}>OUT{sort.arrow("out")}</th>
              {catHoles.slice(9).map(h => <th key={h.h} className={`r tourn-hole-col${h.h === 10 ? " tourn-in-border" : ""}`}>{h.h}</th>)}
              <th className="r tourn-sum-col sortable" onClick={() => sort.toggle("in")}>IN{sort.arrow("in")}</th>
              <th className="r tourn-sum-col sortable" onClick={() => sort.toggle("sd")} style={{ width: 48 }}>SD{sort.arrow("sd")}</th>
            </tr>
            {/* Par row */}
            <tr className="tourn-par-row">
              <td></td><td className="tourn-lbl">Par</td>
              <td className="r">{cat.courseData.par}</td><td></td>
              {catHoles.slice(0, 9).map(h => <td key={h.h} className="r">{h.par}</td>)}
              <td className="r">{catParOut}</td>
              {catHoles.slice(9).map(h => <td key={h.h} className={`r${h.h === 10 ? " tourn-in-border" : ""}`}>{h.par}</td>)}
              <td className="r">{catParIn}</td>
              <td></td>
            </tr>
            {/* Metros row */}
            <tr className="tourn-dist-row">
              <td></td><td className="tourn-lbl">Metros</td><td></td><td></td>
              {catHoles.slice(0, 9).map(h => <td key={h.h} className="r">{h.m}</td>)}
              <td className="r">{catHoles.slice(0, 9).reduce((s, h) => s + h.m, 0)}</td>
              {catHoles.slice(9).map(h => <td key={h.h} className={`r${h.h === 10 ? " tourn-in-border" : ""}`}>{h.m}</td>)}
              <td className="r">{catHoles.slice(9).reduce((s, h) => s + h.m, 0)}</td>
              <td></td>
            </tr>
            {/* SI row */}
            <tr className="tourn-si-row">
              <td></td><td className="tourn-lbl">SI</td><td></td><td></td>
              {catHoles.slice(0, 9).map(h => <td key={h.h} className="r">{h.si}</td>)}
              <td></td>
              {catHoles.slice(9).map(h => <td key={h.h} className={`r${h.h === 10 ? " tourn-in-border" : ""}`}>{h.si}</td>)}
              <td></td><td></td>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const female = isFemale(norm, r.fed, r.name);
              const outToPar = r.outScore != null ? r.outScore - catParOut : null;
              const inToPar = r.inScore != null ? r.inScore - catParIn : null;

              return (
                <tr key={i} className={`tourn-player-row${female ? " tourn-female-row" : ""}`}>
                  <td className="r tourn-pos">{r.pos}</td>
                  <td className="tourn-lb-name-col">
                    <div className="tourn-lb-pills">
                      <PlayerLink fed={r.fed} name={r.name} onSelect={onSelectPlayer} />
                      <PlayerPills norm={norm} fed={r.fed} name={r.name} showEscalao={cat.key === "wagr"} showHcp />
                    </div>
                  </td>
                  <td className={`r tourn-sum-val ${r.toPar != null && r.toPar <= 0 ? "tourn-sum-under" : "tourn-sum-over"}`}>{r.gross ?? "-"}</td>
                  <td className="r tourn-sum-val"><ToParSpan tp={r.toPar} /></td>
                  {/* Front 9 */}
                  {r.hasHoles ? r.ph!.holes.slice(0, 9).map((sc, hi) => (
                    <td key={hi} className="tourn-hole-cell"><ScoreDot score={sc} par={catHoles[hi].par} /></td>
                  )) : Array.from({ length: 9 }, (_, hi) => (
                    <td key={hi} className="tourn-hole-cell tourn-no-data">·</td>
                  ))}
                  <td className={`r tourn-sum-val ${outToPar != null && outToPar <= 0 ? "tourn-sum-under" : "tourn-sum-over"}`}>
                    {r.outScore != null ? <>{r.outScore} <span className={`tourn-half-par ${outToPar! <= 0 ? "tp-under" : "tp-over1"}`}>({fmtToPar(outToPar)})</span></> : "-"}
                  </td>
                  {/* Back 9 */}
                  {r.hasHoles ? r.ph!.holes.slice(9, 18).map((sc, hi) => (
                    <td key={hi + 9} className={`tourn-hole-cell${hi === 0 ? " tourn-in-border" : ""}`}><ScoreDot score={sc} par={catHoles[hi + 9].par} /></td>
                  )) : Array.from({ length: 9 }, (_, hi) => (
                    <td key={hi + 9} className={`tourn-hole-cell tourn-no-data${hi === 0 ? " tourn-in-border" : ""}`}>·</td>
                  ))}
                  <td className={`r tourn-sum-val ${inToPar != null && inToPar <= 0 ? "tourn-sum-under" : "tourn-sum-over"}`}>
                    {r.inScore != null ? <>{r.inScore} <span className={`tourn-half-par ${inToPar! <= 0 ? "tp-under" : "tp-over1"}`}>({fmtToPar(inToPar)})</span></> : "-"}
                  </td>
                  <td className="r tourn-sum-val" style={{ fontSize: 11 }}><SdSpan sd={r.sd} /></td>
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
  );
}

function getPlayerHoles(
  holeData: Map<string, PlayerHoles>,
  fed: string | null,
  name: string,
  manualHoles: Record<string, PlayerHoles>,
): PlayerHoles | undefined {
  if (fed && holeData.has(fed)) return holeData.get(fed);
  if (holeData.has(name)) return holeData.get(name);
  if (fed && manualHoles[fed]) return manualHoles[fed];
  if (manualHoles[name]) return manualHoles[name];
  return undefined;
}

/* ══════════════════════════════════════════
   AccumulatedTable — resumo multi-dia
   ══════════════════════════════════════════ */

function AccumulatedTable({ norm, cat, filters, onSelectPlayer }: {
  norm: NormalizedTournament;
  cat: TournCategory;
  filters: { pjaOnly: boolean; escFilter: string };
  onSelectPlayer?: (fed: string) => void;
}) {
  const sort = useSortable("total");

  const rows = useMemo(() => computeAccumulated(norm, cat.key), [norm, cat.key]);
  const daysAvailable = availableDays(norm, cat.key);

  /* Filter */
  let filtered = rows;
  if (filters.pjaOnly) filtered = filtered.filter(r => isPja(norm, r.fed));
  if (filters.escFilter !== "all") {
    filtered = filtered.filter(r => escalaoFromYear(birthYear(norm, r.fed)) === filters.escFilter);
  }

  /* Sort — incomplete players (fewer days) always at the bottom */
  const maxDays = daysAvailable.length;
  const sorted = [...filtered].sort((a, b) => {
    const aComplete = a.daysPlayed >= maxDays;
    const bComplete = b.daysPlayed >= maxDays;
    if (aComplete !== bComplete) return aComplete ? -1 : 1;
    // Within same completeness group, sort by days played desc, then by chosen key
    if (a.daysPlayed !== b.daysPlayed) return b.daysPlayed - a.daysPlayed;
    const dir = sort.dir === "asc" ? 1 : -1;
    switch (sort.key) {
      case "total": return (a.totalGross - b.totalGross) * dir;
      case "totalPar": return (a.totalToPar - b.totalToPar) * dir;
      case "avgSD": return ((a.avgSD ?? 999) - (b.avgSD ?? 999)) * dir;
      case "name": return a.name.localeCompare(b.name) * dir;
      default: {
        // Day-specific sort: "d1_gross", "d1_sd", etc.
        const [dk, field] = sort.key.split("_");
        const aDay = a.days[dk];
        const bDay = b.days[dk];
        if (field === "gross") return ((aDay?.gross ?? 999) - (bDay?.gross ?? 999)) * dir;
        if (field === "sd") return ((aDay?.sd ?? 999) - (bDay?.sd ?? 999)) * dir;
        if (field === "par") return ((aDay?.toPar ?? 999) - (bDay?.toPar ?? 999)) * dir;
        return 0;
      }
    }
  });

  if (daysAvailable.length === 0) {
    return <div className="tourn-meta" style={{ padding: 20, textAlign: "center" }}>Sem resultados acumulados</div>;
  }

  return (
    <>
      <div className="tourn-meta">
        {sorted.length} jogadores · {daysAvailable.length} dias com resultados · Acumulado
      </div>

      <div className="tourn-scroll">
        <table className="tourn-table tourn-form-table">
          <thead>
            <tr>
              <th className="r" style={{ width: 30 }}>#</th>
              <th className="sortable" onClick={() => sort.toggle("name")} style={{ minWidth: 180 }}>Jogador{sort.arrow("name")}</th>

              {/* Per-day columns */}
              {daysAvailable.map(dk => (
                <th key={dk} colSpan={3} className="tourn-day-group-hdr" style={{ textAlign: "center", borderLeft: "2px solid #e2e8f0" }}>
                  {dayLabel(dk)}
                </th>
              ))}

              {/* Totals */}
              <th colSpan={3} className="tourn-day-group-hdr" style={{ textAlign: "center", borderLeft: "2px solid #1e3a5f", background: "#f0f4f8" }}>
                Total
              </th>
            </tr>
            <tr>
              <th></th>
              <th></th>
              {daysAvailable.map(dk => (
                <React.Fragment key={dk}>
                  <th className="r sortable" style={{ width: 42, borderLeft: "2px solid #e2e8f0" }} onClick={() => sort.toggle(`${dk}_gross`)}>
                    Gross{sort.arrow(`${dk}_gross`)}
                  </th>
                  <th className="r sortable" style={{ width: 42 }} onClick={() => sort.toggle(`${dk}_par`)}>
                    ±Par{sort.arrow(`${dk}_par`)}
                  </th>
                  <th className="r sortable" style={{ width: 42 }} onClick={() => sort.toggle(`${dk}_sd`)}>
                    SD{sort.arrow(`${dk}_sd`)}
                  </th>
                </React.Fragment>
              ))}
              <th className="r sortable" style={{ width: 42, borderLeft: "2px solid #1e3a5f", fontWeight: 800 }} onClick={() => sort.toggle("total")}>
                Gross{sort.arrow("total")}
              </th>
              <th className="r sortable" style={{ width: 42, fontWeight: 800 }} onClick={() => sort.toggle("totalPar")}>
                ±Par{sort.arrow("totalPar")}
              </th>
              <th className="r sortable" style={{ width: 48, fontWeight: 800 }} onClick={() => sort.toggle("avgSD")}>
                SD̄{sort.arrow("avgSD")}
              </th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const completeRows = sorted.filter(r => r.daysPlayed >= maxDays);
              const incompleteRows = sorted.filter(r => r.daysPlayed < maxDays);
              return <>
                {completeRows.map((r, i) => {
                  const female = isFemale(norm, r.fed, r.name);
                  return (
                    <tr key={`c-${i}`} className={female ? "tourn-female-row" : ""}>
                      <td className="r tourn-mono" style={{ fontWeight: 700, opacity: .5 }}>{r.pos}</td>
                      <td>
                        <div className="tourn-lb-pills">
                          <PlayerLink fed={r.fed} name={r.name} onSelect={onSelectPlayer} />
                          <PlayerPills norm={norm} fed={r.fed} name={r.name} showEscalao={cat.key === "wagr"} />
                        </div>
                      </td>
                      {daysAvailable.map(dk => {
                        const day = r.days[dk];
                        return (
                          <React.Fragment key={dk}>
                            <td className="r tourn-mono" style={{ fontWeight: 600, borderLeft: "2px solid #e2e8f0" }}>
                              {day?.gross ?? <span style={{ color: "#ccc" }}>–</span>}
                            </td>
                            <td className="r"><ToParSpan tp={day?.toPar ?? null} /></td>
                            <td className="r" style={{ fontSize: 11 }}><SdSpan sd={day?.sd ?? null} /></td>
                          </React.Fragment>
                        );
                      })}
                      <td className="r tourn-mono" style={{ fontWeight: 800, fontSize: 14, borderLeft: "2px solid #1e3a5f" }}>
                        {r.totalGross}
                      </td>
                      <td className="r"><ToParSpan tp={r.totalToPar} /></td>
                      <td className="r" style={{ fontSize: 12 }}><SdSpan sd={r.avgSD} /></td>
                    </tr>
                  );
                })}
                {incompleteRows.length > 0 && completeRows.length > 0 && (
                  <tr>
                    <td colSpan={99} style={{ padding: "6px 8px", fontSize: 10, color: "#999", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, background: "#f8f8f6", borderTop: "2px solid #cbd5e1" }}>
                      Não completaram todas as voltas ({incompleteRows.length})
                    </td>
                  </tr>
                )}
                {incompleteRows.map((r, i) => {
                  const female = isFemale(norm, r.fed, r.name);
                  return (
                    <tr key={`i-${i}`} className={female ? "tourn-female-row" : ""} style={{ opacity: 0.6 }}>
                      <td className="r tourn-mono" style={{ color: "#aaa" }}>–</td>
                      <td>
                        <div className="tourn-lb-pills">
                          <PlayerLink fed={r.fed} name={r.name} onSelect={onSelectPlayer} />
                          <PlayerPills norm={norm} fed={r.fed} name={r.name} showEscalao={cat.key === "wagr"} />
                        </div>
                      </td>
                      {daysAvailable.map(dk => {
                        const day = r.days[dk];
                        return (
                          <React.Fragment key={dk}>
                            <td className="r tourn-mono" style={{ fontWeight: 600, borderLeft: "2px solid #e2e8f0" }}>
                              {day?.gross ?? <span style={{ color: "#ccc" }}>DNS</span>}
                            </td>
                            <td className="r"><ToParSpan tp={day?.toPar ?? null} /></td>
                            <td className="r" style={{ fontSize: 11 }}><SdSpan sd={day?.sd ?? null} /></td>
                          </React.Fragment>
                        );
                      })}
                      <td className="r tourn-mono" style={{ fontWeight: 800, fontSize: 14, borderLeft: "2px solid #1e3a5f", color: "#aaa" }}>
                        {r.totalGross}
                      </td>
                      <td className="r" style={{ color: "#aaa" }}>{fmtToPar(r.totalToPar)}</td>
                      <td className="r" style={{ fontSize: 12, color: "#aaa" }}>{r.avgSD?.toFixed(1) ?? "–"}</td>
                    </tr>
                  );
                })}
              </>;
            })()}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* Import React for Fragment usage in AccumulatedTable */
import React from "react";

/* ══════════════════════════════════════════
   AllResultsTable — cross-categoria (1 dia)
   ══════════════════════════════════════════ */

function AllResultsDayTable({ norm, dayKey, filters, onSelectPlayer }: {
  norm: NormalizedTournament;
  dayKey: string;
  filters: { pjaOnly: boolean };
  onSelectPlayer?: (fed: string) => void;
}) {
  const sort = useSortable("sd");

  /* Merge all categories for this day */
  const rows: (ResultEntry & { catLabel: string; catKey: string; tee: string; sd: number | null })[] = [];
  for (const cat of norm.categories) {
    const dayResults = norm.results[cat.key]?.[dayKey] || [];
    for (const r of dayResults) {
      if (r.status !== "OK" || r.gross == null) continue;
      const draw = findDrawEntry(norm, r.fed, r.name);
      const sex = draw?.sex || "M";
      const teeColor = draw?.teeColor || cat.tee;
      const sd = calcDaySD(r.gross, norm, teeColor, sex);
      rows.push({ ...r, catLabel: cat.label, catKey: cat.key, tee: teeColor, sd });
    }
  }

  let filtered = filters.pjaOnly ? rows.filter(r => isPja(norm, r.fed)) : rows;
  const pjaCount = rows.filter(r => isPja(norm, r.fed)).length;

  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    switch (sort.key) {
      case "sd": return ((a.sd ?? 999) - (b.sd ?? 999)) * dir;
      case "gross": return ((a.gross ?? 999) - (b.gross ?? 999)) * dir;
      case "toPar": return ((a.toPar ?? 999) - (b.toPar ?? 999)) * dir;
      case "name": return a.name.localeCompare(b.name) * dir;
      case "cat": return a.catLabel.localeCompare(b.catLabel) * dir;
      default: return 0;
    }
  });

  const catColors: Record<string, string> = { wagr: "#2e5a10", sub14: "#b8860b", sub12: "#c0392b" };

  return (
    <>
      <div className="tourn-meta">{rows.length} jogadores · {norm.categories.length} categorias · {dayLabel(dayKey)} · ordenado por Score Differential</div>

      <div className="tourn-scroll">
        <table className="tourn-table tourn-form-table">
          <thead>
            <tr>
              <th className="r" style={{ width: 30 }}>#</th>
              <th className="sortable" onClick={() => sort.toggle("name")} style={{ minWidth: 180 }}>Jogador{sort.arrow("name")}</th>
              <th className="sortable" onClick={() => sort.toggle("cat")} style={{ width: 70 }}>Categ.{sort.arrow("cat")}</th>
              <th style={{ width: 65 }}>Tee</th>
              <th className="r sortable" style={{ width: 50 }} onClick={() => sort.toggle("gross")}>Gross{sort.arrow("gross")}</th>
              <th className="r sortable" style={{ width: 50 }} onClick={() => sort.toggle("toPar")}>±Par{sort.arrow("toPar")}</th>
              <th className="r sortable" style={{ width: 50 }} onClick={() => sort.toggle("sd")}>SD{sort.arrow("sd")}</th>
              <th style={{ width: 55 }}>Pos Cat</th>
              <th style={{ width: 130 }}>Clube</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const female = isFemale(norm, r.fed, r.name);
              return (
                <tr key={i} className={female ? "tourn-female-row" : ""}>
                  <td className="r tourn-mono" style={{ fontWeight: 700, opacity: .5 }}>{i + 1}</td>
                  <td>
                    <div className="tourn-lb-pills">
                      <PlayerLink fed={r.fed} name={r.name} onSelect={onSelectPlayer} />
                      <PlayerPills norm={norm} fed={r.fed} name={r.name} />
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 700, color: catColors[r.catKey] || "#333", background: `${catColors[r.catKey] || "#333"}15`, padding: "1px 6px", borderRadius: 3 }}>
                      {r.catLabel}
                    </span>
                  </td>
                  <td><TeePill name={r.tee} /></td>
                  <td className="r tourn-mono" style={{ fontWeight: 700 }}>{r.gross}</td>
                  <td className="r"><ToParSpan tp={r.toPar} /></td>
                  <td className="r" style={{ fontSize: 11 }}><SdSpan sd={r.sd} /></td>
                  <td className="r tourn-mono" style={{ fontSize: 12 }}>{r.pos}</td>
                  <td style={{ fontSize: 11, color: "#888" }}>{r.club}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════
   AllAccumulatedTable — cross-categoria acumulado
   ══════════════════════════════════════════ */

function AllAccumulatedTable({ norm, filters, onSelectPlayer }: {
  norm: NormalizedTournament;
  filters: { pjaOnly: boolean };
  onSelectPlayer?: (fed: string) => void;
}) {
  const sort = useSortable("avgSD");

  /* Merge accumulated from all categories */
  const allRows: (AccumulatedRow & { catKey: string; catLabel: string })[] = [];
  for (const cat of norm.categories) {
    const rows = computeAccumulated(norm, cat.key);
    for (const r of rows) {
      allRows.push({ ...r, catKey: cat.key, catLabel: cat.label });
    }
  }

  let filtered = filters.pjaOnly ? allRows.filter(r => isPja(norm, r.fed)) : allRows;

  /* Compute max days per category */
  const maxDaysByCat: Record<string, number> = {};
  for (const cat of norm.categories) {
    maxDaysByCat[cat.key] = availableDays(norm, cat.key).length;
  }

  const sorted = [...filtered].sort((a, b) => {
    const aComplete = a.daysPlayed >= (maxDaysByCat[a.catKey] || 1);
    const bComplete = b.daysPlayed >= (maxDaysByCat[b.catKey] || 1);
    if (aComplete !== bComplete) return aComplete ? -1 : 1;
    if (a.daysPlayed !== b.daysPlayed) return b.daysPlayed - a.daysPlayed;
    const dir = sort.dir === "asc" ? 1 : -1;
    switch (sort.key) {
      case "avgSD": return ((a.avgSD ?? 999) - (b.avgSD ?? 999)) * dir;
      case "total": return (a.totalGross - b.totalGross) * dir;
      case "totalPar": return (a.totalToPar - b.totalToPar) * dir;
      case "name": return a.name.localeCompare(b.name) * dir;
      case "cat": return a.catLabel.localeCompare(b.catLabel) * dir;
      default: return 0;
    }
  });

  const catColors: Record<string, string> = { wagr: "#2e5a10", sub14: "#b8860b", sub12: "#c0392b" };

  return (
    <>
      <div className="tourn-meta">{allRows.length} jogadores · Acumulado cross-categoria · ordenado por SD médio</div>
      <div className="tourn-scroll">
        <table className="tourn-table tourn-form-table">
          <thead>
            <tr>
              <th className="r" style={{ width: 30 }}>#</th>
              <th className="sortable" onClick={() => sort.toggle("name")} style={{ minWidth: 180 }}>Jogador{sort.arrow("name")}</th>
              <th className="sortable" onClick={() => sort.toggle("cat")} style={{ width: 70 }}>Categ.{sort.arrow("cat")}</th>
              <th className="r sortable" style={{ width: 50 }} onClick={() => sort.toggle("total")}>Total{sort.arrow("total")}</th>
              <th className="r sortable" style={{ width: 50 }} onClick={() => sort.toggle("totalPar")}>±Par{sort.arrow("totalPar")}</th>
              <th className="r sortable" style={{ width: 55 }} onClick={() => sort.toggle("avgSD")}>SD̄{sort.arrow("avgSD")}</th>
              <th style={{ width: 50 }}>Dias</th>
              <th style={{ width: 130 }}>Clube</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const completeRows = sorted.filter(r => r.daysPlayed >= (maxDaysByCat[r.catKey] || 1));
              const incompleteRows = sorted.filter(r => r.daysPlayed < (maxDaysByCat[r.catKey] || 1));
              let pos = 0;
              return <>
                {completeRows.map((r, i) => {
                  pos++;
                  return (
                    <tr key={`c-${i}`} className={isFemale(norm, r.fed, r.name) ? "tourn-female-row" : ""}>
                      <td className="r tourn-mono" style={{ fontWeight: 700, opacity: .5 }}>{pos}</td>
                      <td><div className="tourn-lb-pills"><PlayerLink fed={r.fed} name={r.name} onSelect={onSelectPlayer} /><PlayerPills norm={norm} fed={r.fed} name={r.name} /></div></td>
                      <td><span style={{ fontSize: 11, fontWeight: 700, color: catColors[r.catKey] || "#333", background: `${catColors[r.catKey] || "#333"}15`, padding: "1px 6px", borderRadius: 3 }}>{r.catLabel}</span></td>
                      <td className="r tourn-mono" style={{ fontWeight: 800 }}>{r.totalGross}</td>
                      <td className="r"><ToParSpan tp={r.totalToPar} /></td>
                      <td className="r" style={{ fontSize: 12 }}><SdSpan sd={r.avgSD} /></td>
                      <td className="r tourn-mono" style={{ fontSize: 11 }}>{r.daysPlayed}</td>
                      <td style={{ fontSize: 11, color: "#888" }}>{r.club}</td>
                    </tr>
                  );
                })}
                {incompleteRows.length > 0 && completeRows.length > 0 && (
                  <tr>
                    <td colSpan={99} style={{ padding: "6px 8px", fontSize: 10, color: "#999", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, background: "#f8f8f6", borderTop: "2px solid #cbd5e1" }}>
                      Não completaram todas as voltas ({incompleteRows.length})
                    </td>
                  </tr>
                )}
                {incompleteRows.map((r, i) => (
                  <tr key={`i-${i}`} className={isFemale(norm, r.fed, r.name) ? "tourn-female-row" : ""} style={{ opacity: 0.6 }}>
                    <td className="r tourn-mono" style={{ color: "#aaa" }}>–</td>
                    <td><div className="tourn-lb-pills"><PlayerLink fed={r.fed} name={r.name} onSelect={onSelectPlayer} /><PlayerPills norm={norm} fed={r.fed} name={r.name} /></div></td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, color: catColors[r.catKey] || "#333", background: `${catColors[r.catKey] || "#333"}15`, padding: "1px 6px", borderRadius: 3 }}>{r.catLabel}</span></td>
                    <td className="r tourn-mono" style={{ fontWeight: 800, color: "#aaa" }}>{r.totalGross}</td>
                    <td className="r" style={{ color: "#aaa" }}>{fmtToPar(r.totalToPar)}</td>
                    <td className="r" style={{ fontSize: 12, color: "#aaa" }}>{r.avgSD?.toFixed(1) ?? "–"}</td>
                    <td className="r tourn-mono" style={{ fontSize: 11 }}>{r.daysPlayed}</td>
                    <td style={{ fontSize: 11, color: "#888" }}>{r.club}</td>
                  </tr>
                ))}
              </>;
            })()}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════
   LeaderboardView — Orquestrador principal
   ══════════════════════════════════════════ */

type LbCat = "all" | string;  // "all" | "wagr" | "sub14" | "sub12"
type DayView = string;         // "d1" | "d2" | ... | "acumulado"

export default function LeaderboardView({ norm, players, holeDataByDay, onSelectPlayer }: {
  norm: NormalizedTournament;
  players: PlayersDb;
  holeDataByDay: Record<string, Map<string, PlayerHoles>>;
  onSelectPlayer?: (fed: string) => void;
}) {
  const [lbCat, setLbCat] = useState<LbCat>("wagr");
  const [dayView, setDayView] = useState<DayView>("d1");
  const [pjaOnly, setPjaOnly] = useState(false);
  const [escFilter, setEscFilter] = useState("all");

  /* Active category object */
  const activeCat = norm.categories.find(c => c.key === lbCat);

  /* Days available for active category */
  const activeDays = useMemo(() => {
    if (lbCat === "all") {
      // Union of all days across categories
      const allDays = new Set<string>();
      for (const cat of norm.categories) {
        dayKeys(cat).forEach(dk => allDays.add(dk));
      }
      return [...allDays].sort();
    }
    return activeCat ? dayKeys(activeCat) : [];
  }, [lbCat, activeCat, norm]);

  /* Days that actually have results */
  const daysWithResults = useMemo(() => {
    if (lbCat === "all") {
      const allDays = new Set<string>();
      for (const cat of norm.categories) {
        availableDays(norm, cat.key).forEach(dk => allDays.add(dk));
      }
      return [...allDays].sort();
    }
    return activeCat ? availableDays(norm, activeCat.key) : [];
  }, [lbCat, activeCat, norm]);

  /* Auto-select latest day with results when switching category */
  const effectiveDayView = useMemo(() => {
    if (dayView === "acumulado") return "acumulado";
    if (activeDays.includes(dayView)) return dayView;
    // Default to latest day with results, or first day
    return daysWithResults[daysWithResults.length - 1] || activeDays[0] || "d1";
  }, [dayView, activeDays, daysWithResults]);

  /* Escalão options (WAGR only) */
  const escOptions = useMemo(() => {
    if (lbCat !== "wagr") return [];
    const escSet = new Set<string>();
    const wagrResults = norm.results.wagr || {};
    for (const dayResults of Object.values(wagrResults)) {
      for (const r of dayResults) {
        if (r.status !== "OK") continue;
        const yr = birthYear(norm, r.fed);
        const esc = escalaoFromYear(yr);
        if (esc) escSet.add(esc);
      }
    }
    return ["Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18", "Sub-21", "Absoluto"].filter(e => escSet.has(e));
  }, [lbCat, norm]);

  /* Category tab counts */
  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of norm.categories) {
      const allResults = norm.results[cat.key] || {};
      const uniquePlayers = new Set<string>();
      for (const dayResults of Object.values(allResults)) {
        for (const r of dayResults) {
          if (r.status === "OK") uniquePlayers.add(r.fed || r.name);
        }
      }
      // If no results yet, use draw count
      counts[cat.key] = uniquePlayers.size || Object.values(norm.draws[cat.key] || {}).reduce((s, d) => Math.max(s, d.length), 0);
    }
    return counts;
  }, [norm]);

  const totalCount = Object.values(catCounts).reduce((s, c) => s + c, 0);

  /* PJA count for filter badge */
  const pjaCount = useMemo(() => {
    if (lbCat === "all") {
      return norm.allDraw.filter(d => isPja(norm, d.fed)).length;
    }
    const catResults = norm.results[lbCat] || {};
    const feds = new Set<string>();
    for (const dayResults of Object.values(catResults)) {
      for (const r of dayResults) {
        if (r.status === "OK" && isPja(norm, r.fed)) feds.add(r.fed || r.name);
      }
    }
    return feds.size;
  }, [lbCat, norm]);

  const filters = { pjaOnly, escFilter };

  return (
    <div className="tourn-section">
      {/* ── Category tabs ── */}
      <div className="tourn-tabs" style={{ marginBottom: 8 }}>
        <button className={`tourn-tab${lbCat === "all" ? " tourn-tab-active" : ""}`}
          onClick={() => { setLbCat("all"); setEscFilter("all"); setPjaOnly(false); }}>
          Todos <span style={{ opacity: .6, fontSize: 11 }}>({totalCount})</span>
        </button>
        {norm.categories.map(c => (
          <button key={c.key} className={`tourn-tab${lbCat === c.key ? " tourn-tab-active" : ""}`}
            onClick={() => { setLbCat(c.key); setEscFilter("all"); setPjaOnly(false); }}>
            {c.label} <span style={{ opacity: .6, fontSize: 11 }}>({catCounts[c.key] || 0})</span>
          </button>
        ))}
      </div>

      {/* ── Day selector + filters ── */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        {/* Day dropdown */}
        <select
          className="select"
          value={effectiveDayView}
          onChange={e => setDayView(e.target.value)}
          style={{ minWidth: 130, fontWeight: 600 }}
        >
          {activeDays.map(dk => {
            const hasData = daysWithResults.includes(dk);
            const dateStr = norm.dates[parseInt(dk.replace("d", "")) - 1] || "";
            const dateLabel = dateStr ? ` — ${dateStr.split("-").reverse().slice(0, 2).join("/")}` : "";
            return (
              <option key={dk} value={dk}>
                {dayLabel(dk)}{dateLabel}{!hasData ? " (pendente)" : ""}
              </option>
            );
          })}
          {daysWithResults.length > 1 && (
            <option value="acumulado">📊 Acumulado</option>
          )}
        </select>

        {/* PJA filter */}
        <button
          className={`tourn-tab${pjaOnly ? " tourn-tab-active" : ""}`}
          onClick={() => setPjaOnly(p => !p)}
          style={{ background: pjaOnly ? "#046A38" : undefined, color: pjaOnly ? "#FFD700" : undefined, fontSize: 12, padding: "4px 10px" }}
        >
          PJA <span style={{ opacity: .6, fontSize: 10 }}>({pjaCount})</span>
        </button>

        {/* Escalão filter (WAGR only) */}
        {lbCat === "wagr" && escOptions.length > 0 && (
          <select className="select" value={escFilter} onChange={e => setEscFilter(e.target.value)} style={{ fontSize: 12 }}>
            <option value="all">Todos escalões</option>
            {escOptions.map(esc => <option key={esc} value={esc}>{esc}</option>)}
          </select>
        )}
      </div>

      {/* ── Content ── */}
      {lbCat === "all" ? (
        effectiveDayView === "acumulado"
          ? <AllAccumulatedTable norm={norm} filters={{ pjaOnly }} onSelectPlayer={onSelectPlayer} />
          : <AllResultsDayTable norm={norm} dayKey={effectiveDayView} filters={{ pjaOnly }} onSelectPlayer={onSelectPlayer} />
      ) : activeCat && (
        effectiveDayView === "acumulado"
          ? <AccumulatedTable norm={norm} cat={activeCat} filters={filters} onSelectPlayer={onSelectPlayer} />
          : <DayScorecard norm={norm} cat={activeCat} dayKey={effectiveDayView} holeData={holeDataByDay[`${activeCat.key}_${effectiveDayView}`] || new Map()} filters={filters} onSelectPlayer={onSelectPlayer} />
      )}
    </div>
  );
}
