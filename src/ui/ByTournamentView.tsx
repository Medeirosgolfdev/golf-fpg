import React, { useState, useMemo } from "react";
import type { PlayerPageData, RoundData, HoleScores } from "../data/playerDataLoader";
import { norm, fmtToPar, fmtSign } from "../utils/format";
import { sumArr } from "../utils/mathUtils";
import { scClass, toParClass, sc2 } from "../utils/scoreDisplay";
import { getTeeHex, textOnColor } from "../utils/teeColors";
import { numSafe } from "../utils/mathUtils";
import { fmtStb } from "../utils/scoreDisplay";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";
import TeeDate from "./TeeDate";
import TeePill from "./TeePill";
import { ScorecardTable } from "./ScorecardTable";
import { CourseLink } from "./jogadoresHelpers";

type RoundExt = RoundData & { course: string };

function TournRoundRow({ r, idx: _idx, data }: {
  r: RoundExt; idx: number; data: PlayerPageData;
}) {
  const [scOpen, setScOpen] = React.useState(false);
  const holes = data.HOLES[String(r.scoreId)];

  return (
    <>
      <tr className="roundRow" onClick={r.hasCard && holes ? () => setScOpen(v => !v) : undefined}
        style={{ cursor: r.hasCard && holes ? "pointer" : "default" }}>
        <td>
          <TeeDate date={r.date} tee={r.tee || ""} />
          <span className="muted fs-10 ml-4">#{r.scoreId}</span>
        </td>
        <td className="r">{r.holeCount === 9 ? "9" : "18"}</td>
        <td className="r">{r.hi ?? ""}</td>
        <td><TeePill name={r.tee || ""} /></td>
        <td className="r muted">{r.meters ? `${r.meters}m` : ""}</td>
        <td className="r">
          {r.gross != null && r.par != null && r.gross > 0 && r.par > 0
            ? <><b>{r.gross}</b><span className={`score-delta ${r.gross > r.par ? "pos" : r.gross < r.par ? "neg" : ""}`}>{r.gross > r.par ? "+" : ""}{r.gross - r.par}</span></>
            : ""}
        </td>
        <td className="r">{fmtStb(r.stb, r.holeCount)}</td>
        <td className="r">
          {r.sd != null ? <span className="p p-sm">{numSafe(r.sd)?.toFixed(1) ?? ""}</span> : ""}
        </td>
      </tr>
      {scOpen && holes && (
        <tr>
          <td colSpan={8} className="bg-page p-0">
            <div className="scroll-x" style={{ margin: "6px 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", background: "var(--bg-card)", padding: 10, overflow: "hidden" }}>
              <ScorecardTable
                holes={holes}
                courseName={r.course}
                date={r.date}
                tee={r.tee || ""}
                hi={r.hi}
                links={r._links}
                eclecticEntry={null}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* Comparison table helper: generic row */
function CompRow({ label, hc: _hc, is9, frontEnd, cells, outVal, inVal, totalVal, style, sepRow, outWeight, inWeight, className }: {
  label: string; hc: number; is9: boolean; frontEnd: number;
  cells: string[]; outVal?: string; inVal?: string; totalVal?: string;
  style?: React.CSSProperties; sepRow?: boolean; outWeight?: number; inWeight?: number;
  className?: string;
}) {
  const cs: React.CSSProperties = { padding: "5px 6px", textAlign: "center", fontSize: 12, borderBottom: "1px solid var(--border-light)", ...style };
  const colLabel: React.CSSProperties = { ...cs, textAlign: "left", paddingLeft: 8, borderRight: "1px solid var(--border-light)" };
  const colOut: React.CSSProperties = { ...cs, borderLeft: "1px solid var(--border-light)", borderRight: "1px solid var(--border-light)", fontWeight: outWeight };
  const colIn: React.CSSProperties = { ...colOut, fontWeight: inWeight };
  const colTot: React.CSSProperties = { ...cs, borderLeft: "1px solid var(--border)", fontWeight: 700 };
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
  const cs: React.CSSProperties = { padding: "5px 6px", textAlign: "center", fontSize: 12, borderBottom: "1px solid var(--border-light)" };
  const colLabel: React.CSSProperties = { ...cs, textAlign: "left", paddingLeft: 8, borderRight: "1px solid var(--border-light)" };
  const colOut: React.CSSProperties = { ...cs, borderLeft: "1px solid var(--border-light)", borderRight: "1px solid var(--border-light)", fontWeight: 700 };
  const colIn: React.CSSProperties = { ...colOut };
  const colTot: React.CSSProperties = { ...cs, borderLeft: "1px solid var(--border)", fontWeight: 700 };

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
                ? <span className={`sc-score ${cls}`}>{gv}</span>
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
  const cs: React.CSSProperties = { padding: "5px 6px", textAlign: "center", fontSize: 11, borderBottom: "1px solid var(--border-light)" };
  const colLabel: React.CSSProperties = { ...cs, textAlign: "left", paddingLeft: 8, borderRight: "1px solid var(--border-light)", fontWeight: 700, color: "var(--text-3)" };
  const colOut: React.CSSProperties = { ...cs, borderLeft: "1px solid var(--border-light)", borderRight: "1px solid var(--border-light)" };
  const colIn: React.CSSProperties = { ...colOut };
  const colTot: React.CSSProperties = { ...cs, borderLeft: "1px solid var(--border)" };

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

function TournamentComparison({ rounds, holesData }: {
  rounds: RoundExt[];
  holesData: Record<string, HoleScores>;
}) {
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

  const allSameCourse = rounds.every(r => norm(r.course) === norm(rounds[0].course));
  const perRoundHoles = rounds.map(r => holesData[String(r.scoreId)] || null);
  const roundGross: ((number | null)[] | null)[] = perRoundHoles.map(h => h?.g || null);
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
            {rounds.map((rd, ri) => {
              const gross = roundGross[ri];
              if (!gross) return null;
              const dateFmt = rd.date ? rd.date.substring(0, 5).replace("-", "/") : `V${ri + 1}`;
              const rdHx = getTeeHex(rd.tee || "");
              const rdFg = textOnColor(rdHx);
              const ownPar = !allSameCourse ? (perRoundHoles[ri]?.p || null) : par;
              const ownH = perRoundHoles[ri];
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

/* Melhor resultado do evento (relativo ao par) — usado na coluna "Melhor" da
   tabela de torneios e na sua ordenação. Escolhe a ronda com menor (gross−par)
   para ser justo entre campos/escalões diferentes. */
function eventBest(rounds: RoundExt[]): { gross: number; toPar: number } | null {
  let best: { gross: number; toPar: number } | null = null;
  for (const r of rounds) {
    const g = Number(r.gross), p = Number(r.par);
    if (isFinite(g) && isFinite(p) && g > 0 && p > 0) {
      const tp = g - p;
      if (best == null || tp < best.toPar) best = { gross: g, toPar: tp };
    }
  }
  return best;
}

export function ByTournamentView({ data, search }: { data: PlayerPageData; search: string }) {
  const items = useMemo(() => {
    const term = norm(search);

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

    const allRoundsWithNames: RoundExt[] = [];
    data.DATA.forEach(c => c.rounds.forEach(r => {
      if (r.eventName && r.dateSort && !r._isTreino) {
        allRoundsWithNames.push({ ...r, course: c.course });
      }
    }));
    allRoundsWithNames.sort((a, b) => a.dateSort - b.dateSort);

    type Group = { name: string; courses: string[]; rounds: RoundExt[]; _group: string };
    const globalGroups: Group[] = [];

    for (const r of allRoundsWithNames) {
      let found = false;
      for (const group of globalGroups) {
        const rGroup = r._group || "";
        const gGroup = group._group || "";
        if (rGroup || gGroup) {
          if (rGroup !== gGroup) continue;
          group.rounds.push(r);
          if (!group.courses.includes(r.course)) group.courses.push(r.course);
          found = true;
          break;
        }
        const similarity = nameSimilarity(r.eventName, group.name, r.course, group.courses[0]);
        let minGap = 999;
        for (const gr of group.rounds) {
          const gap = Math.abs((r.dateSort - gr.dateSort) / 86400000);
          if (gap < minGap) minGap = gap;
        }
        const sameCourse = group.courses.some(gc => norm(gc) === norm(r.course));
        const bothAway = /away|internacional|international|tour|viagem|estrangeiro|abroad/i.test(r.eventName) &&
          /away|internacional|international|tour|viagem|estrangeiro|abroad/i.test(group.name);
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
  const { sortKey, sortDir, toggleSort } = useSort<"torneio" | "campo" | "rondas" | "melhor" | "datas">("datas", "desc", {
    rondas: "desc", melhor: "asc",
  });

  const sortedItems = useMemo(() => {
    let sorted = [...items];
    const dir = sortDir === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      let av: number, bv: number;
      const al = a.rounds[a.rounds.length - 1]?.dateSort || 0;
      const bl = b.rounds[b.rounds.length - 1]?.dateSort || 0;
      switch (sortKey) {
        case "torneio": return dir * a.name.localeCompare(b.name, "pt");
        case "campo": return dir * a.course.localeCompare(b.course, "pt");
        case "rondas": av = a.rounds.length; bv = b.rounds.length; break;
        case "melhor": {
          const ab = eventBest(a.rounds), bb = eventBest(b.rounds);
          av = ab ? ab.toPar : 9999; bv = bb ? bb.toPar : 9999; break;
        }
        case "datas": av = al; bv = bl; break;
        default: av = al; bv = bl;
      }
      return dir * (av - bv);
    });
    return sorted;
  }, [items, sortKey, sortDir]);

  return (
    <div className="card">
      <div className="scroll-x">
        <table className="dtable-lg">
          <colgroup>
            <col className="col-p34" /><col className="col-p26" />
            <col className="col-p9" /><col className="col-p14" /><col className="col-p17" />
          </colgroup>
          <thead>
            <tr>
              <SortableHdr k="torneio" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Torneio</SortableHdr>
              <SortableHdr k="campo" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Campo</SortableHdr>
              <SortableHdr k="rondas" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Rondas</SortableHdr>
              <SortableHdr k="melhor" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Melhor</SortableHdr>
              <SortableHdr k="datas" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Datas</SortableHdr>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((it, idx) => {
              const start = it.rounds[0]?.date || "";
              const end = it.rounds[it.rounds.length - 1]?.date || "";
              const dateStr = start && end && start !== end ? `${start} → ${end}` : (end || start);
              const isOpen = openIdx === idx;
              const best = eventBest(it.rounds);
              const sortedRounds = isOpen ? it.rounds.slice().sort((a, b) => a.dateSort - b.dateSort) : [];
              return (
                <React.Fragment key={idx}>
                  <tr>
                    <td>
                      <button className="courseBtn" onClick={() => setOpenIdx(isOpen ? null : idx)}>{it.name}</button>
                    </td>
                    <td><b><CourseLink name={it.course} /></b></td>
                    <td className="r"><b>{it.rounds.length}</b></td>
                    <td className="r">
                      {best
                        ? <><b>{best.gross}</b><span className={`score-delta ${best.toPar > 0 ? "pos" : best.toPar < 0 ? "neg" : ""}`}>{best.toPar > 0 ? "+" : ""}{best.toPar}</span></>
                        : <span className="muted">—</span>}
                    </td>
                    <td style={{ color: "var(--text-2)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{dateStr}</td>
                  </tr>
                  {isOpen && (
                    <tr className="details open">
                      <td className="inner" colSpan={5}>
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
