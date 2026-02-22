/**
 * TorneioPage.tsx — GG26
 *
 * Includes LeaderboardView (merged) for multi-day leaderboards.
 * Results are derived LIVE from player scorecards.
 */
import React, { useEffect, useMemo, useState } from "react";
import type { PlayersDb } from "../data/types";
import { loadPlayerData, type PlayerPageData, type HoleScores } from "../data/playerDataLoader";
import { deepFixMojibake } from "../utils/fixEncoding";
import { SC } from "../utils/scoreDisplay";
import TeePill from "../ui/TeePill";
import {
  normalizeTournament,
  type NormalizedTournament,
  type TournCategory,
  type ResultEntry,
  type PlayerHoles,
  type AccumulatedRow,
  type LiveRound,
  deriveResults,
  isoToDD,
  findDrawEntry,
  isPja,
  isFemale,
  birthYear,
  escalaoFromYear,
  calcDaySD,
  playerCategory as catOf,
  dayKeys,
  dayLabel,
  availableDays,
  computeAccumulated,
  getTeeRating,
} from "../utils/tournamentTypes";
import tournData from "../../torneio-greatgolf.json";
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
  return <span className={`${cls} fw-700`}>{fmtToPar(tp)}</span>;
}

function SdSpan({ sd }: { sd: number | null }) {
  if (sd == null) return <span>–</span>;
  const cls = sd <= 0 ? "tp-under" : sd <= 5 ? "tp-over1" : sd <= 15 ? "" : "tp-over2";
  return <span className={`${cls} fw-600`}>{sd.toFixed(1)}</span>;
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
          <div className="tourn-meta mt-10 fw-600" style={{ color: "var(--color-loading)" }}>
            ⏳ Resultados {dayLabel(dayKey)} ainda não disponíveis — lista de partida
          </div>
          <div className="tourn-meta">{dayDraws.length} jogadores</div>
        </div>
      );
    }
    return <div className="tourn-meta empty-state-sm">Sem resultados para {dayLabel(dayKey)}</div>;
  }

  return (
    <>
      <div className="tourn-meta flex-center-gap6 flex-wrap">
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
              <th className="r tourn-sum-col sortable col-w48" onClick={() => sort.toggle("sd")}>SD{sort.arrow("sd")}</th>
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
                  <td className="r tourn-sum-val fs-11"><SdSpan sd={r.sd} /></td>
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
              {r.name} <span className="c-muted">— {r.club}</span>
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
    return <div className="tourn-meta empty-state-sm">Sem resultados acumulados</div>;
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
              <th className="r col-w30">#</th>
              <th className="sortable col-mw180" onClick={() => sort.toggle("name")}>Jogador{sort.arrow("name")}</th>

              {/* Per-day columns */}
              {daysAvailable.map(dk => (
                <th key={dk} colSpan={3} className="tourn-day-group-hdr ta-c lb-sep fw-400">
                  {dayLabel(dk)}
                </th>
              ))}

              {/* Totals */}
              <th colSpan={3} className="tourn-day-group-hdr ta-c lb-sep-navy bg-muted">
                Total
              </th>
            </tr>
            <tr>
              <th></th>
              <th></th>
              {daysAvailable.map(dk => (
                <React.Fragment key={dk}>
                  <th className="r sortable col-w42 lb-sep" onClick={() => sort.toggle(`${dk}_gross`)}>
                    Gross{sort.arrow(`${dk}_gross`)}
                  </th>
                  <th className="r sortable col-w42" onClick={() => sort.toggle(`${dk}_par`)}>
                    ±Par{sort.arrow(`${dk}_par`)}
                  </th>
                  <th className="r sortable col-w42" onClick={() => sort.toggle(`${dk}_sd`)}>
                    SD{sort.arrow(`${dk}_sd`)}
                  </th>
                </React.Fragment>
              ))}
              <th className="r sortable col-w42 fw-800 lb-sep-navy" onClick={() => sort.toggle("total")}>
                Gross{sort.arrow("total")}
              </th>
              <th className="r sortable col-w42 fw-800" onClick={() => sort.toggle("totalPar")}>
                ±Par{sort.arrow("totalPar")}
              </th>
              <th className="r sortable col-w48 fw-800" onClick={() => sort.toggle("avgSD")}>
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
                      <td className="r tourn-mono lb-muted-bold">{r.pos}</td>
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
                            <td className="r tourn-mono lb-sep">
 {day?.gross ?? <span className="c-text-3 c-border" >–</span>}
                            </td>
                            <td className="r"><ToParSpan tp={day?.toPar ?? null} /></td>
                            <td className="r fs-11"><SdSpan sd={day?.sd ?? null} /></td>
                          </React.Fragment>
                        );
                      })}
                      <td className="r tourn-mono lb-total-sep">
                        {r.totalGross}
                      </td>
                      <td className="r"><ToParSpan tp={r.totalToPar} /></td>
                      <td className="r fs-12"><SdSpan sd={r.avgSD} /></td>
                    </tr>
                  );
                })}
                {incompleteRows.length > 0 && completeRows.length > 0 && (
                  <tr>
                    <td colSpan={99} className="lb-day-header">
                      Não completaram todas as voltas ({incompleteRows.length})
                    </td>
                  </tr>
                )}
                {incompleteRows.map((r, i) => {
                  const female = isFemale(norm, r.fed, r.name);
                  return (
                    <tr key={`i-${i}`} className={`${female ? "tourn-female-row" : ""} op-6`}>
                      <td className="r tourn-mono c-muted">–</td>
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
                            <td className="r tourn-mono lb-sep">
 {day?.gross ?? <span className="c-text-3 c-border" >DNS</span>}
                            </td>
                            <td className="r"><ToParSpan tp={day?.toPar ?? null} /></td>
                            <td className="r fs-11"><SdSpan sd={day?.sd ?? null} /></td>
                          </React.Fragment>
                        );
                      })}
                      <td className="r tourn-mono lb-total-sep c-muted">
                        {r.totalGross}
                      </td>
                      <td className="r c-muted">{fmtToPar(r.totalToPar)}</td>
                      <td className="r fs-12 c-muted">{r.avgSD?.toFixed(1) ?? "–"}</td>
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


  return (
    <>
      <div className="tourn-meta">{rows.length} jogadores · {norm.categories.length} categorias · {dayLabel(dayKey)} · ordenado por Score Differential</div>

      <div className="tourn-scroll">
        <table className="tourn-table tourn-form-table">
          <thead>
            <tr>
              <th className="r col-w30">#</th>
              <th className="sortable col-mw180" onClick={() => sort.toggle("name")}>Jogador{sort.arrow("name")}</th>
              <th className="sortable col-w70" onClick={() => sort.toggle("cat")}>Categ.{sort.arrow("cat")}</th>
              <th className="col-w65">Tee</th>
              <th className="r sortable col-w50" onClick={() => sort.toggle("gross")}>Gross{sort.arrow("gross")}</th>
              <th className="r sortable col-w50" onClick={() => sort.toggle("toPar")}>±Par{sort.arrow("toPar")}</th>
              <th className="r sortable col-w50" onClick={() => sort.toggle("sd")}>SD{sort.arrow("sd")}</th>
              <th className="col-w55">Pos Cat</th>
              <th className="col-w130">Clube</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const female = isFemale(norm, r.fed, r.name);
              return (
                <tr key={i} className={female ? "tourn-female-row" : ""}>
                  <td className="r tourn-mono lb-muted-bold">{i + 1}</td>
                  <td>
                    <div className="tourn-lb-pills">
                      <PlayerLink fed={r.fed} name={r.name} onSelect={onSelectPlayer} />
                      <PlayerPills norm={norm} fed={r.fed} name={r.name} />
                    </div>
                  </td>
                  <td>
                    <span className={`cat-badge cat-badge-${r.catKey}`}>
                      {r.catLabel}
                    </span>
                  </td>
                  <td><TeePill name={r.tee} /></td>
                  <td className="r tourn-mono fw-700">{r.gross}</td>
                  <td className="r"><ToParSpan tp={r.toPar} /></td>
                  <td className="r fs-11"><SdSpan sd={r.sd} /></td>
                  <td className="r tourn-mono fs-12">{r.pos}</td>
                  <td className="fs-11 c-text-3">{r.club}</td>
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


  return (
    <>
      <div className="tourn-meta">{allRows.length} jogadores · Acumulado cross-categoria · ordenado por SD médio</div>
      <div className="tourn-scroll">
        <table className="tourn-table tourn-form-table">
          <thead>
            <tr>
              <th className="r col-w30">#</th>
              <th className="sortable col-mw180" onClick={() => sort.toggle("name")}>Jogador{sort.arrow("name")}</th>
              <th className="sortable col-w70" onClick={() => sort.toggle("cat")}>Categ.{sort.arrow("cat")}</th>
              <th className="r sortable col-w50" onClick={() => sort.toggle("total")}>Total{sort.arrow("total")}</th>
              <th className="r sortable col-w50" onClick={() => sort.toggle("totalPar")}>±Par{sort.arrow("totalPar")}</th>
              <th className="r sortable col-w55" onClick={() => sort.toggle("avgSD")}>SD̄{sort.arrow("avgSD")}</th>
              <th className="col-w50">Dias</th>
              <th className="col-w130">Clube</th>
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
                      <td className="r tourn-mono lb-muted-bold">{pos}</td>
                      <td><div className="tourn-lb-pills"><PlayerLink fed={r.fed} name={r.name} onSelect={onSelectPlayer} /><PlayerPills norm={norm} fed={r.fed} name={r.name} /></div></td>
                      <td><span className={`cat-badge cat-badge-${r.catKey}`}>{r.catLabel}</span></td>
                      <td className="r tourn-mono fw-800">{r.totalGross}</td>
                      <td className="r"><ToParSpan tp={r.totalToPar} /></td>
                      <td className="r fs-12"><SdSpan sd={r.avgSD} /></td>
                      <td className="r tourn-mono fs-11">{r.daysPlayed}</td>
                      <td className="fs-11 c-text-3">{r.club}</td>
                    </tr>
                  );
                })}
                {incompleteRows.length > 0 && completeRows.length > 0 && (
                  <tr>
                    <td colSpan={99} className="lb-day-header">
                      Não completaram todas as voltas ({incompleteRows.length})
                    </td>
                  </tr>
                )}
                {incompleteRows.map((r, i) => (
                  <tr key={`i-${i}`} className={`${isFemale(norm, r.fed, r.name) ? "tourn-female-row" : ""} op-6`}>
                    <td className="r tourn-mono c-muted">–</td>
                    <td><div className="tourn-lb-pills"><PlayerLink fed={r.fed} name={r.name} onSelect={onSelectPlayer} /><PlayerPills norm={norm} fed={r.fed} name={r.name} /></div></td>
                    <td><span className={`cat-badge cat-badge-${r.catKey}`}>{r.catLabel}</span></td>
                    <td className="r tourn-mono fw-800 c-muted">{r.totalGross}</td>
                    <td className="r c-muted">{fmtToPar(r.totalToPar)}</td>
                    <td className="r fs-12 c-muted">{r.avgSD?.toFixed(1) ?? "–"}</td>
                    <td className="r tourn-mono fs-11">{r.daysPlayed}</td>
                    <td className="fs-11 c-text-3">{r.club}</td>
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

function LeaderboardView({ norm, players, holeDataByDay, onSelectPlayer }: {
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
      {/* ── Compact filter bar ── */}
      <div className="detail-toolbar">
        {/* Category pills */}
        <div className="escalao-pills">
          <button className={`filter-pill${lbCat === "all" ? " active" : ""}`}
            onClick={() => { setLbCat("all"); setEscFilter("all"); setPjaOnly(false); }}>
            Todos<span className="filter-pill-count">{totalCount}</span>
          </button>
          {norm.categories.map(c => (
            <button key={c.key} className={`filter-pill${lbCat === c.key ? " active" : ""}`}
              onClick={() => { setLbCat(c.key); setEscFilter("all"); setPjaOnly(false); }}>
              {c.label}<span className="filter-pill-count">{catCounts[c.key] || 0}</span>
            </button>
          ))}
        </div>

        {/* Day dropdown */}
        <select className="select" value={effectiveDayView}
          onChange={e => setDayView(e.target.value)}>
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
        <button className={`filter-pill${pjaOnly ? " active" : ""}`}
          onClick={() => setPjaOnly(p => !p)}>
          PJA<span className="filter-pill-count">{pjaCount}</span>
        </button>

        {/* Escalão filter (WAGR only) */}
        {lbCat === "wagr" && escOptions.length > 0 && (
          <select className="select" value={escFilter} onChange={e => setEscFilter(e.target.value)}>
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
      <div className="detail-toolbar">
        {/* Day pills */}
        <div className="escalao-pills">
          <button className={`filter-pill${day === 1 ? " active" : ""}`} onClick={() => setDay(1)}>
            R1 — {NORM_BASE.dates[0]?.split("-").reverse().slice(0, 2).join("/") || ""}
          </button>
          {NORM_BASE.draws.wagr?.d2 && (
            <button className={`filter-pill${day === 2 ? " active" : ""}`} onClick={() => setDay(2)}>
              R2 — {NORM_BASE.dates[1]?.split("-").reverse().slice(0, 2).join("/") || ""}
            </button>
          )}
        </div>
        {/* Category pills */}
        <div className="escalao-pills">
          {cats.map(c => (
            <button key={c.key} className={`filter-pill${effectiveCat === c.key ? " active" : ""}`} onClick={() => setCat(c.key)}>
              {c.label}<span className="filter-pill-count">{c.count}</span>
            </button>
          ))}
        </div>
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
      <div className="detail-toolbar">
        <div className="escalao-pills">
          {(["wagr", "sub14", "sub12"] as AnalysisCat[]).filter(c => catCounts[c] > 0).map(c => (
            <button key={c} className={`filter-pill${cat === c ? " active" : ""}`} onClick={() => setCat(c)}>
              {c === "wagr" ? "WAGR" : c === "sub14" ? "Sub-14" : "Sub-12"}<span className="filter-pill-count">{catCounts[c]}</span>
            </button>
          ))}
        </div>
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
                        {f.daysSinceLast != null ? <span style={{ color: f.daysSinceLast <= 7 ? SC.good : f.daysSinceLast <= 21 ? SC.warn : SC.danger }}>{f.daysSinceLast}d</span> : "–"}
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
 {vp != null && <span className="fw-600" style={{ color: vp <= 0 ? SC.good : vp < 0.5 ? SC.warn : SC.danger }}>
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarQ, setSidebarQ] = useState("");
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

  /* Sidebar: filtered draw list */
  const sidebarPlayers = useMemo(() => {
    const q = sidebarQ.trim().toLowerCase();
    const list = ALL_DRAW.map(d => ({
      ...d,
      pja: isPja(NORM_BASE, d.fed),
      year: birthYear(NORM_BASE, d.fed),
      escalao: escalaoFromYear(birthYear(NORM_BASE, d.fed)),
      cat: catOf(NORM_BASE, d.fed, d.name),
    }));
    if (!q) return list;
    return list.filter(d => d.name.toLowerCase().includes(q) || d.club?.toLowerCase().includes(q));
  }, [sidebarQ]);

  return (
    <div className="tourn-layout">
      {/* ── Toolbar ── */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)} title={sidebarOpen ? "Fechar painel" : "Abrir painel"}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <span className="tourn-pill-intl fs-9" style={{ padding: "2px 6px" }}>🌍 INTL</span>
          <span className="tourn-toolbar-title">GG26</span>
          <span className="tourn-toolbar-meta">📍 {NORM_BASE.course}</span>
          <span className="tourn-toolbar-meta">📅 {NORM_BASE.dates.join(" → ")}</span>
          <div className="tourn-toolbar-sep" />
          <div className="escalao-pills">
            {([
              { key: "draw" as const, label: "📋 Draw" },
              { key: "leaderboard" as const, label: "🏆 Leaderboard" },
              { key: "analysis" as const, label: "📊 Análise" },
            ]).map(t => (
              <button key={t.key} onClick={() => setView(t.key)}
                className={`filter-pill${view === t.key ? " active" : ""}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-right">
          <span className="chip">{ALL_DRAW.length} jogadores · {NORM_BASE.totalDays} dias</span>
          {loading && <span className="tourn-loading fs-11">⏳ {loadCount}/{fedList.length}</span>}
          {!loading && totalScorecards > 0 && <span className="tourn-loaded fs-11">✓ {totalScorecards} sc</span>}
        </div>
      </div>

      {/* ── External links bar ── */}
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
        const hasAny = groups.some(g => g.keys.some(k => links[k]));
        if (!hasAny) return null;
        return (
          <div className="detail-toolbar-sub">
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

      {/* ── Master-detail ── */}
      <div className="master-detail">
        {/* Sidebar: player list */}
        <div className={`sidebar${sidebarOpen ? "" : " sidebar-closed"}`}>
          <div className="sidebar-section-title">
            <input className="input" value={sidebarQ} onChange={e => setSidebarQ(e.target.value)}
              placeholder="Pesquisar jogador…" style={{ width: "100%" }} />
          </div>
          {sidebarPlayers.map((d, i) => (
            <button key={i} className="course-item"
              onClick={() => d.fed ? onSelectPlayer?.(d.fed) : undefined}
              style={{ cursor: d.fed ? "pointer" : "default" }}>
              <div className="course-item-name">
                {d.name}
                {d.pja && <span className="jog-pill tourn-pill-pja">PJA</span>}
                {!d.fed && <span className="jog-pill tourn-pill-intl">INTL</span>}
              </div>
              <div className="course-item-meta">
                {[d.club, d.escalao, d.hcpExact != null ? `HCP ${d.hcpExact.toFixed(1)}` : null].filter(Boolean).join(" · ")}
              </div>
            </button>
          ))}
          {sidebarPlayers.length === 0 && <div className="muted p-16">Nenhum jogador</div>}
        </div>

        {/* Detail: content */}
        <div className="course-detail">
          {view === "draw" && <DrawView players={players} onSelectPlayer={onSelectPlayer} />}
          {view === "leaderboard" && <LeaderboardView norm={liveNorm} players={players} holeDataByDay={holeDataByDay} onSelectPlayer={onSelectPlayer} />}
          {view === "analysis" && <AnalysisView norm={liveNorm} players={players} holeDataByDay={holeDataByDay} playerHistory={playerHistory} onSelectPlayer={onSelectPlayer} />}
        </div>
      </div>
    </div>
  );
}
