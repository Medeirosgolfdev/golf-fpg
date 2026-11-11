import React, { useState, useMemo } from "react";
import type { PlayerPageData, RoundData, HoleScores } from "../data/playerDataLoader";
import { norm, fmtToPar, fmtSign, fmtDateSpan } from "../utils/format";
import { sumArr } from "../utils/mathUtils";
import { resumoJogado } from "../utils/parJogado";
import { temCartao } from "../utils/classificacao";
import { scClass, toParClass } from "../utils/scoreDisplay";
import { getTeeHex, textOnColor } from "../utils/teeColors";
import { GrossCell, CountPill, RoundNumericCells, MUTED } from "./tableCells";
import { useSort, compareNullsLast } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";
import TeeDate from "./TeeDate";
import { Tint } from "./DataStyle";
import RoundScorecard from "./RoundScorecard";
import { CourseLink } from "./jogadoresHelpers";

type RoundExt = RoundData & { course: string };

function TournRoundRow({ r, idx: _idx, data }: {
  r: RoundExt; idx: number; data: PlayerPageData;
}) {
  const [scOpen, setScOpen] = React.useState(false);
  const holes = data.HOLES[String(r.scoreId)];

  return (
    <>
      <tr onClick={r.hasCard && holes ? () => setScOpen(v => !v) : undefined}
        className={r.hasCard && holes ? "roundRow u-cur-pointer" : "roundRow u-cur-default"}>
        <td>
          <TeeDate date={r.date} tee={r.tee || ""} />
          <span className="muted fs-10 ml-4">#{r.scoreId}</span>
        </td>
        <RoundNumericCells r={r} />
      </tr>
      {scOpen && holes && (
        <tr>
          <td colSpan={8} className="bg-page p-0">
            <div className="scroll-x u-m-6px-8px u-bd-1px-solid-border u-br-radius-xl u-bg-bg-card u-p-10px u-ov-hidden">
              <RoundScorecard r={r} holes={holes} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* Comparação de voltas: linhas na grelha global do cartão (.sc-table-ec, a do
   eclético) — rótulo, buracos, Out/In/Total por classe, sem estilos à mão. */
function CompRow({ label, hc: _hc, is9, frontEnd, cells, outVal, inVal, totalVal, head, sepRow, className }: {
  label: string; hc: number; is9: boolean; frontEnd: number;
  cells: string[]; outVal?: string; inVal?: string; totalVal?: string;
  /** Linha do cabeçalho (Buraco): células <th>. */
  head?: boolean; sepRow?: boolean;
  className?: string;
}) {
  const C = head ? "th" : "td";
  const h = head ? "hole-header " : "";
  return (
    <tr className={[className, sepRow ? "sep-row" : ""].filter(Boolean).join(" ") || undefined}>
      <C className="row-label">{label}</C>
      {cells.map((c, i) => (
        <React.Fragment key={i}>
          <C className={head ? "hole-header" : undefined}>{c}</C>
          {i === frontEnd - 1 && !is9 && <C className={h + "col-out"}>{outVal}</C>}
        </React.Fragment>
      ))}
      <C className={h + (is9 ? "col-total" : "col-in")}>{inVal}</C>
      {!is9 && <C className={h + "col-total"}>{totalVal}</C>}
    </tr>
  );
}

/* Comparison table: score row with circles */
function CompScoreRow({ label, labelBg, labelFg, gross, par, hc, is9, frontEnd, backStart }: {
  label: string; labelBg: string; labelFg: string;
  gross: (number | null)[]; par: (number | null)[] | null;
  hc: number; is9: boolean; frontEnd: number; backStart: number;
}) {
  // O ±par dos totais em linha (ao lado do gross), não empilhado por baixo.

  // Total de um troço: pancadas dos buracos jogados e ±par contra o par DESSES
  // buracos (10/11/2026 — um cartão com buracos em branco era comparado com o
  // par do troço inteiro). Sem par, só as pancadas; sem buracos, vazio.
  const troco = (from: number, to: number, zeroE = false) => {
    const r = resumoJogado(gross, par, from, to);
    if (!r.jogados) return null;
    return (
      <span title={r.completo ? undefined : `${r.jogados} de ${r.buracos} buracos no cartão`}>
        {r.pancadas}
        {r.toPar != null && <span className={`sc-topar ${toParClass(r.toPar)} u-d-inline u-ml-4px`}>{zeroE ? fmtToPar(r.toPar, "") : fmtSign(r.toPar)}</span>}
      </span>
    );
  };

  return (
    <tr className="ec-round-row">
      <td className="row-label"><Tint className="p" bg={labelBg} fg={labelFg}>{label}</Tint></td>
      {Array.from({ length: hc }, (_, i) => {
        const gv = gross[i];
        const pv = par ? par[i] : null;
        const cls = gv != null && gv > 0 && pv != null ? scClass(gv, pv) : "";
        return (
          <React.Fragment key={i}>
            <td>
              {gv != null && gv > 0
                ? <span className={`sc-score ${cls}`}>{gv}</span>
                : ""}
            </td>
            {i === frontEnd - 1 && !is9 && <td className="col-out">{troco(0, frontEnd)}</td>}
          </React.Fragment>
        );
      })}
      <td className={is9 ? "col-total" : "col-in"}>{troco(is9 ? 0 : backStart, hc)}</td>
      {!is9 && <td className="col-total">{troco(0, hc, true)}</td>}
    </tr>
  );
}

/* Comparison table: delta row (last vs first) */
function CompDeltaRow({ first, last, hc, is9, frontEnd, backStart }: {
  first: (number | null)[]; last: (number | null)[];
  hc: number; is9: boolean; frontEnd: number; backStart: number;
}) {

  // Cor e peso em utilitários (!important): a linha `.sc-table-ec .ec-ref-row td`
  // é cinzenta e mais específica do que as classes de tom.
  const fmtDelta = (d: number | null) => {
    if (d == null) return { text: "", color: "u-c-text-muted", weight: "u-fw-400" };
    if (d === 0) return { text: "=", color: "u-c-text-muted", weight: "u-fw-400" };
    return { text: fmtSign(d), color: d <= 0 ? "u-c-color-good" : "u-c-color-danger", weight: "u-fw-600" };
  };

  // Δ de um troço: só os buracos jogados nas DUAS voltas (10/11/2026 — somar 18
  // buracos de uma contra 13 da outra dava uma diferença sem sentido).
  const ambos = (i: number) => (last[i] ?? 0) > 0 && (first[i] ?? 0) > 0;
  const deltaTroco = (from: number, to: number): number | null => {
    let d = 0, n = 0;
    for (let i = from; i < to; i++) if (ambos(i)) { d += last[i]! - first[i]!; n++; }
    return n ? d : null;
  };

  return (
    <tr className="ec-ref-row bt-heavy">
      <td className="row-label">Δ</td>
      {Array.from({ length: hc }, (_, i) => {
        const d = ambos(i) ? last[i]! - first[i]! : null;
        const f = fmtDelta(d);
        return (
          <React.Fragment key={i}>
            <td className={`${f.color} ${f.weight}`}>{f.text}</td>
            {i === frontEnd - 1 && !is9 && (() => {
              const fo = fmtDelta(deltaTroco(0, frontEnd));
              return <td className={`col-out ${fo.color} ${fo.weight}`}>{fo.text}</td>;
            })()}
          </React.Fragment>
        );
      })}
      {(() => {
        const fi = fmtDelta(deltaTroco(is9 ? 0 : backStart, hc));
        return <td className={`${is9 ? "col-total" : "col-in"} ${fi.color} ${fi.weight}`}>{fi.text}</td>;
      })()}
      {!is9 && (() => {
        const ft = fmtDelta(deltaTroco(0, hc));
        return <td className={`col-total ${ft.color}`}>{ft.text}</td>;
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
        <table className="sc-table-ec sc-grid">
          <thead>
            <CompRow label="Buraco" hc={hc} is9={is9} frontEnd={frontEnd}
              cells={Array.from({ length: hc }, (_, i) => String(i + 1))}
              outVal="Out" inVal={is9 ? "TOTAL" : "In"} totalVal={is9 ? undefined : "TOTAL"}
              head
            />
          </thead>
          <tbody>
            {allSameCourse && meters && meters.some(v => v != null && Number(v) > 0) && (
              <CompRow label="Metros" hc={hc} is9={is9} frontEnd={frontEnd}
                cells={meters.slice(0, hc).map(v => v != null ? String(v) : "")}
                outVal={String(sumArr(meters, 0, frontEnd))}
                inVal={String(is9 ? sumArr(meters, 0, hc) : sumArr(meters, backStart, hc))}
                totalVal={is9 ? undefined : String(sumArr(meters, 0, hc))}
                className="ec-ref-row"
              />
            )}
            {allSameCourse && si && si.some(v => v != null) && (
              <CompRow label="S.I." hc={hc} is9={is9} frontEnd={frontEnd}
                cells={si.slice(0, hc).map(v => v != null ? String(v) : "")}
                outVal="" inVal="" totalVal={is9 ? undefined : ""}
                className="ec-ref-row"
              />
            )}
            {allSameCourse && par && par.some(v => v != null) && (
              <CompRow label="Par" hc={hc} is9={is9} frontEnd={frontEnd}
                cells={par.slice(0, hc).map(v => v != null ? String(v) : "–")}
                outVal={String(sumArr(par, 0, frontEnd))}
                inVal={String(is9 ? sumArr(par, 0, hc) : sumArr(par, backStart, hc))}
                totalVal={is9 ? undefined : String(sumArr(par, 0, hc))}
                className="ec-ref-row"
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
                          outVal={String(sumArr(ownH!.m, 0, frontEnd))}
                          inVal={String(is9 ? sumArr(ownH!.m, 0, hc) : sumArr(ownH!.m, backStart, hc))}
                          totalVal={is9 ? undefined : String(sumArr(ownH!.m, 0, hc))}
                          className="ec-ref-row"
                        />
                      )}
                      {ownH!.p && ownH!.p.some(v => v != null) && (
                        <CompRow label="Par" hc={hc} is9={is9} frontEnd={frontEnd}
                          cells={ownH!.p.slice(0, hc).map(v => v != null ? String(v) : "–")}
                          outVal={String(sumArr(ownH!.p, 0, frontEnd))}
                          inVal={String(is9 ? sumArr(ownH!.p, 0, hc) : sumArr(ownH!.p, backStart, hc))}
                          totalVal={is9 ? undefined : String(sumArr(ownH!.p, 0, hc))}
                          className="ec-ref-row"
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
    // Volta «sem cartão» (≥ 900) não é o melhor resultado de ninguém.
    if (temCartao(g) && isFinite(p) && p > 0) {
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

  // Torneio aberto pela sua CHAVE, não pelo índice da linha (10/11/2026): ao
  // ordenar ou pesquisar, ficava aberto o torneio que passava a ocupar a linha.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const itemKey = (it: { type: string; rounds: RoundExt[] }) => `${it.type}:${it.rounds[0]?.scoreId ?? ""}`;
  const { sortKey, sortDir, toggleSort } = useSort<"torneio" | "campo" | "rondas" | "melhor" | "datas">("datas", "desc", {
    rondas: "desc", melhor: "asc",
  });

  const sortedItems = useMemo(() => {
    let sorted = [...items];
    const dir = sortDir === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      let av: number | null, bv: number | null;
      const al = a.rounds[a.rounds.length - 1]?.dateSort || 0;
      const bl = b.rounds[b.rounds.length - 1]?.dateSort || 0;
      switch (sortKey) {
        case "torneio": return dir * a.name.localeCompare(b.name, "pt");
        case "campo": return dir * a.course.localeCompare(b.course, "pt");
        case "rondas": av = a.rounds.length; bv = b.rounds.length; break;
        case "melhor": {
          const ab = eventBest(a.rounds), bb = eventBest(b.rounds);
          av = ab ? ab.toPar : null; bv = bb ? bb.toPar : null; break;
        }
        case "datas": av = al; bv = bl; break;
        default: av = al; bv = bl;
      }
      return compareNullsLast(av, bv, dir);
    });
    return sorted;
  }, [items, sortKey, sortDir]);

  return (
    <div className="card">
      <div className="scroll-x">
        <table className="dtable dtable-lg dtable-dense u-table-layout-fixed">
          <colgroup>
            <col className="u-w-108px" /><col className="u-w-64px" />
            <col /><col /><col className="u-w-72px" />
          </colgroup>
          <thead>
            <tr>
              <SortableHdr k="datas" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Datas</SortableHdr>
              <SortableHdr k="rondas" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Rondas</SortableHdr>
              <SortableHdr k="torneio" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Torneio</SortableHdr>
              <SortableHdr k="campo" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Campo</SortableHdr>
              <SortableHdr k="melhor" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r">Melhor</SortableHdr>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((it) => {
              const key = itemKey(it);
              const start = it.rounds[0]?.date || "";
              const end = it.rounds[it.rounds.length - 1]?.date || "";
              const isOpen = openKey === key;
              const best = eventBest(it.rounds);
              const sortedRounds = isOpen ? it.rounds.slice().sort((a, b) => a.dateSort - b.dateSort) : [];
              // Tee representativo do torneio (última ronda) → cor do pill de contagem
              const repTee = it.rounds[it.rounds.length - 1]?.tee || "";
              return (
                <React.Fragment key={key}>
                  <tr>
                    <td className="u-c-text-2 u-fvn-tabular-nums u-ws-nowrap">
                      <span className="fs-11">{fmtDateSpan(start, end)}</span>
                    </td>
                    <td className="r"><CountPill count={it.rounds.length} tee={repTee} /></td>
                    <td>
                      <button className="courseBtn" onClick={() => setOpenKey(isOpen ? null : key)}>{it.name}</button>
                    </td>
                    <td><CourseLink name={it.course} /></td>
                    <td className="r">
                      {best
                        ? <GrossCell gross={best.gross} par={best.gross - best.toPar} />
                        : MUTED}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="details open">
                      <td className="inner" colSpan={5}>
                        <div className="innerWrap">
                          <table className="dtable dt-compact">
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
                                // Só as voltas com cartão (10/11/2026): o 999 «sem cartão»
                                // entrava na soma, e o par somava também as voltas sem gross.
                                const withGross = sortedRounds.filter(r => temCartao(r.gross));
                                if (withGross.length < 2) return null;
                                const totalGross = withGross.reduce((a, r) => a + Number(r.gross), 0);
                                const totalStb = sortedRounds.reduce((a, r) => a + (r.stb ?? 0), 0);
                                const semPar = withGross.some(r => !(Number(r.par) > 0));
                                const totalPar = semPar ? 0 : withGross.reduce((a, r) => a + Number(r.par), 0);
                                return (
                                  <tr className="bg-detail fw-700 bt-heavy">
                                    <td colSpan={5} className="r fw-700 c-text-2">Total ({withGross.length} voltas)</td>
                                    <td className="r"><GrossCell gross={totalGross} par={totalPar || null} /></td>
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
