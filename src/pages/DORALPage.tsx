/**
 * FTMDoralPage.tsx — First Tee Miami Doral Jr. Classic Results
 * Lê ficheiros Golf Genius (sem par[], com divisions[], toPar directo)
 * Boys 8-9: 9 buracos (H10-H18) · Boys 10-11 / 12-13: 18 buracos
 */
import React, { useEffect, useState } from "react";
import { cachedFetch } from "../data/fetchCache";
import { scClass, SC } from "../utils/scoreDisplay";
import { tpColor, isManuel } from "../ui/tournamentPrimitives";
import { gf } from "../utils/flagUtils";
const isM = (name: string) => isManuel({ name });
import { fmtToPar, norm } from "../utils/format";
import { isCalUnlocked } from "../utils/authConstants";
import PasswordGate from "../ui/PasswordGate";
import SidebarToggle from "../ui/SidebarToggle";
import { useMasterDetail } from "../hooks/useMasterDetail";
import LoadingState from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";

/* ── Types ─────────────────────────────────────────────────── */
interface RoundGG {
  day: number;
  date: string;
  course: string;
  startingHole?: number;
  scores: number[];
  f9?: number;
  b9?: number;
  gross: number;
}
interface PlayerGG {
  id: string;
  name: string;
  country: string;
  birthYear?: number;
  pos: number | null;
  toPar: number | null;
  total: number | null;
  r1Gross?: number;
  r2Gross?: number;
  rounds: RoundGG[];
}
interface DivisionGG {
  division: string;
  name: string;
  par?: number[];
  parF9?: number;
  parB9?: number;
  parTotal?: number;
  startingHole?: number;
  players: PlayerGG[];
}
interface RawGG {
  tournament: string;
  year: number;
  source: string;
  divisions: DivisionGG[];
}

/* Entrada normalizada para uma divisão específica */
interface Entry {
  id: string;
  label: string;
  year: number;
  category: string;
  divisionName: string;
  nineHole: boolean;
  par: number[];
  parF9: number;
  parB9: number;
  parTotal: number;
  course: string;
  cr?: number;
  slope?: number;
  metres: number[];
  metresF9?: number;
  metresB9?: number;
  metresTotal?: number;
  sourceUrl: string;
  players: PlayerGG[];
}

/* ── Ficheiros de dados ─────────────────────────────────────── */
const DATA_FILES: { url: string; sourceUrl: string }[] = [
  {
    url: "/data/ftm_doral_2025.json",
    sourceUrl: "https://2025firstteemiamidoraljrclassic.golfgenius.com/pages/5506943",
  },
  {
    url: "/data/ftm_doral_2024.json",
    sourceUrl: "https://2024firstteemiamidoraljrclassic.golfgenius.com/pages/4894994",
  },
];


/* ── Metadados por divisão: campo, CR/Slope, metros por buraco ── */
interface DivMeta { course: string; cr?: number; slope?: number; metres: number[]; metresF9?: number; metresB9?: number; metresTotal: number }
const DIVISION_META: Record<string, DivMeta> = {
  // RED TIGER — 9H (H10-H18)
  "Boys 7 & Under": { course:"Red Tiger", metres:[215,79,210,160,84,155,78,165,210], metresTotal:1356 },
  "Boys 8-9":       { course:"Red Tiger", metres:[247,79,261,192,84,183,107,198,274], metresTotal:1625 },
  // RED TIGER — 9H (H1-H9)
  "Girls 7 & Under":{ course:"Red Tiger", metres:[215,73,210,160,210,55,165,102,174], metresTotal:1364 },
  "Girls 8-9":      { course:"Red Tiger", metres:[247,138,238,192,229,104,197,102,197], metresTotal:1644 },
  "Girls 10-11":    { course:"Red Tiger", metres:[362,137,343,192,312,104,210,102,248], metresTotal:2010 },
  // RED TIGER — 18H
  "Girls 14-15":    { course:"Red Tiger", metres:[467,146,428,248,445,142,316,117,329,428,145,411,294,129,315,146,255,447], metresF9:2638, metresB9:2570, metresTotal:5208 },
  "Girls 16-18":    { course:"Red Tiger", cr:75.0, slope:140, metres:[467,146,445,259,445,152,327,138,345,433,163,443,318,151,333,155,275,447], metresF9:2724, metresB9:2718, metresTotal:5442 },
  // GOLDEN PALM — 18H
  "Boys 10-11":     { course:"Golden Palm", cr:69.0, slope:130, metres:[275,417,324,404,296,326,132,270,127,264,425,104,251,303,113,443,139,273], metresF9:2571, metresB9:2315, metresTotal:4886 },
  "Girls 12-13":    { course:"Golden Palm", cr:71.0, slope:134, metres:[275,417,324,404,296,326,132,270,127,264,425,104,251,303,113,443,139,273], metresF9:2571, metresB9:2315, metresTotal:4886 },
  "Boys 14-15":     { course:"Golden Palm", cr:72.0, slope:136, metres:[354,475,354,493,356,353,133,361,164,302,494,137,314,367,134,487,159,356], metresF9:3043, metresB9:2750, metresTotal:5793 },
  // SILVER FOX — 18H
  "Boys 12-13":     { course:"Silver Fox", cr:74.0, slope:140, metres:[321,311,455,130,293,317,123,311,306,314,425,300,281,279,125,428,121,304], metresF9:2567, metresB9:2577, metresTotal:5144 },
  // BLUE MONSTER — 18H
  "Boys 16-18":     { course:"Blue Monster", cr:74.0, slope:140, metres:[511,348,359,161,346,368,398,483,169,512,298,539,180,401,122,286,375,396], metresF9:3143, metresB9:3109, metresTotal:6252 },
};

/* ── Normalização de nomes ──────────────────────────────────── */
/** Golf Genius devolve "Sobrenome, Nome" → converter para "Nome Sobrenome" */
function normalizeName(raw: string): string {
  const comma = raw.indexOf(",");
  if (comma === -1) return raw.trim();
  const last  = raw.slice(0, comma).trim();
  const first = raw.slice(comma + 1).trim();
  return first ? `${first} ${last}` : last;
}

/** Manuel Medeiros — mesmo critério que BJGTPage */
/** Ano de graduação → ano de nascimento real (graduação aos 18 anos) */
const gradToBirth = (gradYear: number) => gradYear - 18;


function normalizeFile(raw: RawGG, sourceUrl: string): Entry[] {
  return raw.divisions.map((div): Entry => {
    const nineHole = div.players.some(p => p.rounds.some(r => r.startingHole === 10 && r.scores.length === 9));
    // Reordenar rondas por data (mais antiga = R1)
    const players = div.players
      .filter(p => p.rounds.length > 0)
      .map(p => ({
        ...p,
        name: normalizeName(p.name),
        rounds: [...p.rounds].sort((a, b) => {
          // Ordenar por data real (o campo day pode estar errado no scraper)
          if (a.date && b.date) {
            const months: Record<string,number> = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12,
              January:1,February:2,March:3,April:4,June:6,July:7,August:8,September:9,October:10,November:11,December:12};
            const parse = (d: string) => {
              const parts = d.replace(/^[A-Za-z]+,\s+/, "").split(" ");
              return (months[parts[0]] ?? 0) * 100 + (parseInt(parts[1]) || 0);
            };
            return parse(a.date) - parse(b.date);
          }
          return a.day - b.day;
        }),
      }))
      .sort((a, b) => {
        const nR = Math.max(...div.players.map(p => p.rounds.length));
        const af = a.rounds.length === nR ? 0 : 1;
        const bf = b.rounds.length === nR ? 0 : 1;
        if (af !== bf) return af - bf;
        return (a.total ?? 999) - (b.total ?? 999);
      });
    const meta = DIVISION_META[div.division] ?? { course: "", metres: [], metresTotal: 0 };
    return {
      id: `${raw.year}_${div.division.replace(/\s+/g,"_")}`,
      label: `${raw.year} // ${div.division}`,
      year: raw.year,
      category: div.division,
      divisionName: div.name,
      nineHole,
      par: div.par ?? [],
      parF9: div.parF9 ?? 0,
      parB9: div.parB9 ?? 0,
      parTotal: div.parTotal ?? 0,
      course: meta.course,
      cr: meta.cr,
      slope: meta.slope,
      metres: meta.metres,
      metresF9: meta.metresF9,
      metresB9: meta.metresB9,
      metresTotal: meta.metresTotal || undefined,
      sourceUrl,
      players,
    };
  });
}

/* ── Evo: presença no ano anterior ─────────────────────────── */
interface EvoEntry { prevTotal: number; delta: number; from: string; to: string; pill: "UP" | "STAY"; prevPos: number | null; fieldSize: number }

function buildEvo(cur: Entry, all: Entry[]): Map<string, EvoEntry> {
  const evo = new Map<string, EvoEntry>();
  const prevYear = cur.year - 1;
  const prevEntries = all.filter(e => e.year === prevYear);
  if (!prevEntries.length) return evo;

  for (const p of cur.players) {
    if (!p.total) continue;
    for (const prev of prevEntries) {
      const match = prev.players.find(q => {
        const n1 = norm(p.name), n2 = norm(q.name);
        return n1 === n2 ||
          (n1.split(" ")[0] === n2.split(" ")[0] &&
           n1.split(" ")[n1.split(" ").length - 1] === n2.split(" ")[n2.split(" ").length - 1]);
      });
      if (!match?.total) continue;
      const nR = Math.max(...prev.players.map(q => q.rounds.length));
      const fieldSize = prev.players.filter(q => q.rounds.length === nR).length;
      evo.set(p.name, {
        prevTotal: match.total,
        delta: p.total - match.total,
        from: prev.category,
        to: cur.category,
        pill: prev.category === cur.category ? "STAY" : "UP",
        prevPos: match.pos,
        fieldSize,
      });
      break;
    }
  }
  return evo;
}

/* ── AccLB — Leaderboard acumulado ─────────────────────────── */
function AccLB({ entry, evo }: { entry: Entry; evo?: Map<string, EvoEntry> }) {
  const { players, nineHole, parTotal } = entry;
  const nR = Math.max(...players.map(p => p.rounds.length), 0);
  const hasEvo = evo && evo.size > 0;
  const prevYear = entry.year - 1;

  // Datas das rondas para sub-header (ex: "Dec 18")
  const roundDates = Array.from({ length: nR }, (_, i) => {
    const sample = players.find(p => p.rounds[i]?.date);
    if (!sample) return undefined;
    const d = sample.rounds[i].date.replace(/^[A-Za-z]+,\s+/, ""); // "December 18"
    const [mon, day] = d.split(" ");
    return mon ? `${mon.slice(0, 3)} ${day}` : undefined; // "Dec 18"
  });

  return (
    <div className="bjgt-chart-scroll">
      <table className="sc-table-modern" data-sc-table="1" style={{ width: "auto" }}>
        <thead><tr>
          <th className="hole-header" style={{ textAlign:"center", width:26, padding:"0 2px" }}>#</th>
          <th className="hole-header" style={{ textAlign:"left", paddingLeft:6, paddingRight:8 }}>Jogador</th>
          {!nineHole && <th className="hole-header" style={{ width:44, textAlign:"center" }}>Nasc.</th>}
          {Array.from({ length: nR }, (_, i) => (<React.Fragment key={i}>
            <th className="hole-header" style={{ width: roundDates[i] ? 52 : 30, textAlign:"center", padding:"0 1px" }}>
              R{i+1}{roundDates[i] ? <><br /><span className="th-sub">{roundDates[i]}</span></> : ""}
            </th>
            <th className="hole-header c-muted fs-10 fw-500" style={{ width:34, textAlign:"center", padding:"0 1px" }}>±par</th>
          </React.Fragment>))}
          <th className="hole-header col-total" style={{ width:34, padding:"0 3px" }}>Tot</th>
          <th className="hole-header" style={{ width:38, textAlign:"center", padding:"0 3px" }}>±Par</th>
          {hasEvo && <>
            <th className="hole-header" style={{ width:36, textAlign:"center", padding:"0 3px", borderLeft:"2px solid var(--border)" }}>{prevYear}</th>
            <th className="hole-header" style={{ width:34, textAlign:"center", padding:"0 3px" }}>Δ</th>
            <th className="hole-header" style={{ width:140, textAlign:"center", padding:"0 4px" }}>Percurso</th>
          </>}
        </tr></thead>
        <tbody>
          {players.map((p, idx) => {
            const incomplete = p.rounds.length < nR;
            const showPos = idx === 0 || p.pos !== players[idx-1]?.pos;
            const tp = p.toPar;
            const bg = isM(p.name)
              ? "var(--bg-success-subtle)"
              : p.country?.includes("Portugal") ? "rgba(var(--rgb-success), 0.06)" : undefined;
            const ev = hasEvo ? evo!.get(p.name) : undefined;
            return (
              <tr key={p.id} style={{ ...(bg ? { background: bg } : {}), ...(incomplete ? { opacity:0.5 } : {}) }}>
                <td className="fw-800 ta-center" style={{ color:"var(--text-3)", fontSize:11, padding:"0 2px" }}>
                  {incomplete ? "WD" : (showPos ? p.pos : "")}
                </td>
                <td style={{ whiteSpace:"nowrap", paddingLeft:6, paddingRight:8, fontSize:12, textAlign:"left" }}>
                  <span className="fw-700">{gf(p.country)} {p.name}</span>
                </td>
                {!nineHole && <td style={{ textAlign:"center" }}>
                  {p.birthYear
                    ? <span className="pill-birth">{gradToBirth(p.birthYear)}</span>
                    : <span className="c-muted fs-10">–</span>}
                </td>}
                {Array.from({ length: nR }, (_, i) => {
                  const r = p.rounds[i];
                  if (!r) return (<React.Fragment key={i}>
                    <td style={{ textAlign:"center", fontSize:12, padding:"0 1px" }} className="c-muted">–</td>
                    <td style={{ textAlign:"center", fontSize:10, padding:"0 1px" }} className="c-muted">–</td>
                  </React.Fragment>);
                  const rdTp = parTotal > 0 ? r.gross - parTotal : null;
                  const c = tpColor(rdTp);
                  return (<React.Fragment key={i}>
                    <td style={{ textAlign:"center", fontSize:12, fontWeight:600, padding:"0 1px" }}>{r.gross}</td>
                    <td style={{ textAlign:"center", fontSize:10, fontWeight:600, padding:"0 1px", color: c }}>
                      {rdTp != null ? fmtToPar(rdTp) : "–"}
                    </td>
                  </React.Fragment>);
                })}
                <td className="col-total fw-800" style={{ fontSize:13, padding:"0 3px" }}>{p.total ?? "–"}</td>
                <td className="fw-700" style={{
                  textAlign:"center", fontSize:12, padding:"0 3px",
                  color: tpColor(tp),
                }}>
                  {tp != null ? fmtToPar(tp) : "–"}
                </td>
                {hasEvo && (ev ? <>
                  <td style={{ textAlign:"center", fontSize:11, fontWeight:600, padding:"0 3px", borderLeft:"2px solid var(--border)" }}>{ev.prevTotal}</td>
                  <td style={{ textAlign:"center", fontSize:11, fontWeight:700, padding:"0 3px",
                    color: ev.delta < 0 ? "var(--good-dark)" : ev.delta > 0 ? SC.danger : "var(--text-3)" }}>
                    {ev.delta > 0 ? "+" : ""}{ev.delta}
                  </td>
                  <td style={{ textAlign:"center", padding:"0 4px" }}>
                    {ev.pill === "UP"
                      ? <span className="badge-evo-up">⬆ {ev.from}→{ev.to}{ev.prevPos != null ? ` · ${ev.prevPos}/${ev.fieldSize}` : ""}</span>
                      : <span className="badge-evo-eq">= {ev.from}{ev.prevPos != null ? ` · ${ev.prevPos}/${ev.fieldSize}` : ""}</span>}
                  </td>
                </> : <>
                  <td style={{ textAlign:"center", fontSize:11, padding:"0 3px", borderLeft:"2px solid var(--border)" }} className="c-muted">–</td>
                  <td className="c-muted" style={{ textAlign:"center", fontSize:11, padding:"0 3px" }}>–</td>
                  <td style={{ textAlign:"center", padding:"0 4px" }}><span className="badge-evo-new">novo</span></td>
                </>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── SCTable 9H — scorecard 9 buracos (H10-H18) ────────────── */
function SCTable9H({ entry, ri }: { entry: Entry; ri: number }) {
  const { par, parTotal, metres, metresTotal } = entry;
  const ws = entry.players.filter(p => p.rounds[ri]?.scores?.length === 9);
  if (!ws.length) return <EmptyState size="sm" message="Scorecards não disponíveis para esta ronda." />;
  const sorted = [...ws].sort((a, b) => a.rounds[ri].gross - b.rounds[ri].gross);
  let pos = 1;
  sorted.forEach((p, i) => {
    if (i > 0 && p.rounds[ri].gross > sorted[i-1].rounds[ri].gross) pos = i + 1;
    (p as any)._dp = pos;
  });
  return (
    <div className="bjgt-chart-scroll">
      <table className="sc-table-modern" data-sc-table="1">
        <thead><tr>
          <th className="hole-header" style={{ textAlign:"center", width:26 }}>#</th>
          <th className="hole-header" style={{ textAlign:"left", paddingLeft:6 }}>Jogador</th>
          <th className="hole-header col-total" style={{ width:32 }}>Tot</th>
          <th className="hole-header" style={{ width:30 }}>±</th>
          {[10,11,12,13,14,15,16,17,18].map(h => <th key={h} className="hole-header">{h}</th>)}
        </tr></thead>
        <tbody>
          {par.length > 0 && (
            <tr className="sep-row">
              <td></td>
              <td className="row-label par-label">PAR</td>
              <td className="col-total">{parTotal}</td>
              <td></td>
              {par.map((p, i) => <td key={i}>{p}</td>)}
            </tr>
          )}
          {metres.length > 0 && (
            <tr className="sep-row" style={{ opacity:0.6 }}>
              <td></td>
              <td className="row-label u-fs9-muted">m</td>
              <td className="col-total" style={{ fontSize:9 }}>{metresTotal}</td>
              <td></td>
              {metres.map((m, i) => <td key={i} className="u-fs9-muted">{m}</td>)}
            </tr>
          )}
          {sorted.map((p, idx) => {
            const r = p.rounds[ri];
            const dp = (p as any)._dp;
            const showP = idx === 0 || dp !== (sorted[idx-1] as any)._dp;
            const tp = parTotal > 0 ? r.gross - parTotal : null;
            const bg = isM(p.name) ? "var(--bg-success-subtle)" : p.country?.includes("Portugal") ? "rgba(var(--rgb-success), 0.06)" : undefined;
            return (
              <tr key={p.id} style={bg ? { background: bg } : undefined}>
                <td className="fw-800 ta-center" style={{ color:"var(--text-3)", fontSize:11 }}>{showP ? dp : ""}</td>
                <td className="row-label fw-700" style={{ whiteSpace:"nowrap", fontSize:11 }}>
                  {gf(p.country)} {p.name.length > 22 ? p.name.substring(0,20)+"…" : p.name}
                </td>
                <td className="col-total fw-700">{r.gross}</td>
                <td className="fw-700" style={{ fontSize:11, color: tpColor(tp) }}>
                  {tp != null ? fmtToPar(tp) : "–"}
                </td>
                {r.scores.map((sc, i) => (
                  <td key={i}><span className={`sc-score ${par[i] ? scClass(sc, par[i]) : ""}`}>{sc}</span></td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── SCTable 18H — scorecard 18 buracos com par ─────────────── */
function SCTable18H({ entry, ri }: { entry: Entry; ri: number }) {
  const { par, parF9, parB9, parTotal, metres, metresF9, metresB9, metresTotal } = entry;
  const hasPar = par.length >= 18;
  const hasMetres = metres.length >= 18;
  const ws = entry.players.filter(p => p.rounds[ri]?.scores?.length === 18);
  if (!ws.length) return <EmptyState size="sm" message="Scorecards não disponíveis para esta ronda." />;
  const sorted = [...ws].sort((a, b) => a.rounds[ri].gross - b.rounds[ri].gross);
  let pos = 1;
  sorted.forEach((p, i) => {
    if (i > 0 && p.rounds[ri].gross > sorted[i-1].rounds[ri].gross) pos = i + 1;
    (p as any)._dp = pos;
  });
  return (
    <div className="bjgt-chart-scroll">
      <table className="sc-table-modern" data-sc-table="1">
        <thead><tr>
          <th className="hole-header" style={{ textAlign:"center", width:26 }}>#</th>
          <th className="hole-header" style={{ textAlign:"left", paddingLeft:6 }}>Jogador</th>
          <th className="hole-header col-total" style={{ width:32 }}>Tot</th>
          <th className="hole-header" style={{ width:30 }}>±</th>
          {[1,2,3,4,5,6,7,8,9].map(h => <th key={h} className="hole-header">{h}</th>)}
          <th className="hole-header col-out fs-10">Out</th>
          {[10,11,12,13,14,15,16,17,18].map(h => <th key={h} className="hole-header">{h}</th>)}
          <th className="hole-header col-in fs-10">In</th>
        </tr></thead>
        <tbody>
          {hasPar && (
            <tr className="sep-row">
              <td></td>
              <td className="row-label par-label">PAR</td>
              <td className="col-total">{parTotal}</td>
              <td></td>
              {par.slice(0,9).map((p,i) => <td key={i}>{p}</td>)}
              <td className="col-out fw-600">{parF9}</td>
              {par.slice(9,18).map((p,i) => <td key={i}>{p}</td>)}
              <td className="col-in fw-600">{parB9}</td>
            </tr>
          )}
          {hasMetres && (
            <tr className="sep-row" style={{ opacity:0.6 }}>
              <td></td>
              <td className="row-label u-fs9-muted">m</td>
              <td className="col-total" style={{ fontSize:9 }}>{metresTotal}</td>
              <td></td>
              {metres.slice(0,9).map((m,i) => <td key={i} className="u-fs9-muted">{m}</td>)}
              <td className="col-out u-fs9-muted">{metresF9}</td>
              {metres.slice(9,18).map((m,i) => <td key={i} className="u-fs9-muted">{m}</td>)}
              <td className="col-in u-fs9-muted">{metresB9}</td>
            </tr>
          )}
          {sorted.map((p, idx) => {
            const r = p.rounds[ri];
            const f9 = r.f9 ?? r.scores.slice(0,9).reduce((a,b)=>a+b,0);
            const b9 = r.b9 ?? r.scores.slice(9).reduce((a,b)=>a+b,0);
            const tp = hasPar ? r.gross - parTotal : null;
            const dp = (p as any)._dp;
            const showP = idx === 0 || dp !== (sorted[idx-1] as any)._dp;
            const bg = isM(p.name) ? "var(--bg-success-subtle)" : p.country?.includes("Portugal") ? "rgba(var(--rgb-success), 0.06)" : undefined;
            return (
              <tr key={p.id} style={bg ? { background: bg } : undefined}>
                <td className="fw-800 ta-center" style={{ color:"var(--text-3)", fontSize:11 }}>{showP ? dp : ""}</td>
                <td className="row-label fw-700" style={{ whiteSpace:"nowrap", fontSize:11 }}>
                  {gf(p.country)} {p.name.length > 22 ? p.name.substring(0,20)+"…" : p.name}
                </td>
                <td className="col-total fw-700">{r.gross}</td>
                <td className="fw-700" style={{ fontSize:11, color: tpColor(tp) }}>
                  {tp != null ? fmtToPar(tp) : "–"}
                </td>
                {r.scores.slice(0,9).map((sc,i) => (
                  <td key={i}><span className={`sc-score ${hasPar ? scClass(sc, par[i]) : ""}`}>{sc}</span></td>
                ))}
                <td className="col-out fw-600">{f9}{hasPar && <span className="fs-8 c-text-3"> ({f9-parF9 > 0 ? "+" : ""}{f9-parF9 === 0 ? "E" : f9-parF9})</span>}</td>
                {r.scores.slice(9,18).map((sc,i) => (
                  <td key={i}><span className={`sc-score ${hasPar ? scClass(sc, par[9+i]) : ""}`}>{sc}</span></td>
                ))}
                <td className="col-in fw-600">{b9}{hasPar && <span className="fs-8 c-text-3"> ({b9-parB9 > 0 ? "+" : ""}{b9-parB9 === 0 ? "E" : b9-parB9})</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── FStats — resumo do field ───────────────────────────────── */
function FStats({ entry, ri }: { entry: Entry; ri: number | "all" }) {
  const { players } = entry;
  const nR = Math.max(...players.map(p => p.rounds.length), 0);
  const full = players.filter(p => p.rounds.length === nR);
  if (ri === "all") {
    const avg = full.length ? full.reduce((s, p) => s + (p.total ?? 0), 0) / full.length : 0;
    return (
      <div className="muted fs-10 mb-8">
        {full.length} jogadores ({nR}R){players.length > full.length ? ` + ${players.length - full.length} WD` : ""}
        {" · "}Média total: {avg.toFixed(1)}
        {" · "}Líder: {full[0]?.name} ({full[0]?.total})
      </div>
    );
  }
  const scores = players.filter(p => p.rounds[ri as number]).map(p => p.rounds[ri as number].gross);
  if (!scores.length) return null;
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  return (
    <div className="muted fs-10 mb-8">
      {scores.length} jogadores{" · "}Média R{(ri as number)+1}: {avg.toFixed(1)}
    </div>
  );
}

/* ── DivView — abas por ronda ───────────────────────────────── */
function DivView({ entry, evo }: { entry: Entry; evo?: Map<string, EvoEntry> }) {
  const { players, nineHole } = entry;
  const nR = Math.max(...players.map(p => p.rounds.length), 0);
  const [dt, setDt] = useState<number | "all">("all");

  // Etiqueta de data para cada ronda (do 1º jogador com scorecards)
  const roundLabel = (i: number) => {
    const sample = players.find(p => p.rounds[i]);
    if (sample?.rounds[i]?.date) {
      const d = sample.rounds[i].date.replace(/^[A-Za-z]+,\s+/, ""); // "December 19"
      return `R${i+1} · ${d}`;
    }
    return `R${i+1}`;
  };

  return (
    <div>
      <div className="escalao-pills mb-8" style={{ gap:4 }}>
        <button onClick={() => setDt("all")} className={`tourn-tab tourn-tab-sm${dt === "all" ? " active" : ""}`}>
          Acumulado
        </button>
        {Array.from({ length: nR }, (_, i) => (
          <button key={i} onClick={() => setDt(i)} className={`tourn-tab tourn-tab-sm${dt === i ? " active" : ""}`}>
            {roundLabel(i)}
          </button>
        ))}
      </div>

      {dt === "all" && (
        <div className="card">
          <div className="h-md fs-14">🏆 Leaderboard — {entry.label}</div>
          <FStats entry={entry} ri="all" />
          <AccLB entry={entry} evo={evo} />
        </div>
      )}

      {typeof dt === "number" && (
        <div className="card">
          <div className="h-md fs-14">🏆 {roundLabel(dt)} — Scorecards</div>
          <FStats entry={entry} ri={dt} />
          {nineHole
            ? <SCTable9H entry={entry} ri={dt} />
            : <SCTable18H entry={entry} ri={dt} />
          }
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN CONTENT
   ═══════════════════════════════════════════════════════════════ */
function Content() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [ti, setTi] = useState(0);
    const md = useMasterDetail();
  useEffect(() => {
    Promise.all(
      DATA_FILES.map(async ({ url, sourceUrl }) => {
        try {
          const res = await cachedFetch(url);  // fetchCache: partilhado com KIDSdataLoader
          if (!res.ok) return [] as Entry[];
          const raw: RawGG = await res.json();
          return normalizeFile(raw, sourceUrl);
        } catch {
          return [] as Entry[];
        }
      })
    ).then(results => {
      const all = results.flat();
      setEntries(all);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState />;
  if (!entries.length) return (
    <div className="center-msg muted">
      Nenhum ficheiro de dados encontrado.<br />
      <span className="fs-10">Coloca <code>ftm_doral_2025.json</code> em <code>public/data/</code></span>
    </div>
  );

  // Selecção válida
  const safeIdx = Math.min(ti, entries.length - 1);
  const cur = entries[safeIdx];
  const evo = cur ? buildEvo(cur, entries) : undefined;

  // Agrupar por ano para o sidebar
  const years = [...new Set(entries.map(e => e.year))].sort((a, b) => b - a);

  return (
    <div className="tourn-layout">

      {/* Toolbar */}
      <div className="toolbar">
        <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />
        <span className="toolbar-title">🇺🇸 Doral</span>
        {cur && <span className="toolbar-meta">📍 Doral Golf Resort</span>}
        {cur && (
          <span className="chip" style={{ marginLeft: "auto" }}>
            {cur.players.filter(p => p.rounds.length === Math.max(...cur.players.map(q => q.rounds.length))).length} field
            {" · "}{Math.max(...cur.players.map(p => p.rounds.length))}R
            {" · "}{cur.category}
          </span>
        )}
      </div>

      {/* Master-detail */}
      <div className="master-detail">

        {/* Sidebar */}
        <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
          {years.map(year => {
            const yearEntries = entries.filter(e => e.year === year);
            return (
              <React.Fragment key={year}>
                <div className="sidebar-section-title-dark" style={{
                  background: "var(--color-doral-dark)",
                  color: "var(--color-doral-text)",
                  borderBottom: "1px solid var(--color-doral-mid)",
                  letterSpacing: "0.08em",
                }}>
                  🇺🇸 First Tee Miami Doral Jr. Classic
                </div>
                <div className="sidebar-year-label" style={{
                  padding: "2px 10px",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  color: "#ffffff",
                  textTransform: "uppercase",
                  marginTop: 4,
                  background: "var(--color-doral-dark)",
                }}>
                  {year}
                </div>
                {yearEntries.map(entry => {
                  const idx = entries.indexOf(entry);
                  const nR = Math.max(...entry.players.map(p => p.rounds.length), 0);
                  const nP = entry.players.filter(p => p.rounds.length === nR).length;
                  const manuelPlayed = entry.players.some(p => isM(p.name));
                  return (
                    <button key={entry.id}
                      className={`course-item ${safeIdx === idx ? "active" : ""}`}
                      onClick={() => { setTi(idx); md.onSelect(); }}>
                      <div className="course-item-name">{entry.category}</div>
                      {entry.course && (
                        <div className="course-item-meta" style={{ fontWeight:600, color:"var(--text-2)" }}>
                          ⛳ {entry.course}
                        </div>
                      )}
                      <div className="course-item-meta">
                        {nP} jog · {nR}R{entry.nineHole ? " · 9H" : ""}
                        {entry.metresTotal ? ` · ${entry.metresTotal.toLocaleString("pt-PT")} m` : ""}
                      </div>
                      {(entry.cr != null || entry.slope != null) && (
                        <div className="course-item-meta" style={{ fontFamily:"monospace", fontSize:10, color:"var(--text-3)" }}>
                          CR {entry.cr?.toFixed(1)} · Slope {entry.slope}
                        </div>
                      )}
                      {manuelPlayed && (
                        <span style={{
                          display: "inline-block", marginTop: 4,
                          fontSize: 11, fontWeight: 700,
                          background: "var(--bg-success-subtle)", color: "var(--color-good-dark)",
                          borderRadius: 6, padding: "2px 8px",
                          border: "1px solid var(--color-good)",
                        }}>★ Manuel</span>
                      )}
                      <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className="tourn-ext-link" style={{ marginTop:4 }}
                        onClick={e => e.stopPropagation()}>
                        🔗 Leaderboard oficial
                      </a>
                    </button>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>

        {/* Detail */}
        <div className="course-detail" ref={md.detailRef}>
          {cur ? (
            <>
              <div className="detail-header">
                <h2 className="detail-title">{cur.label}</h2>
                <div className="detail-sub">
                  <span className="muted">📍 Doral Golf Resort — {cur.divisionName}</span>
                  <a href={cur.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="tourn-ext-link" style={{ marginLeft:8 }}>
                    🔗 Leaderboard oficial
                  </a>
                </div>
              </div>
              <DivView entry={cur} evo={evo} />
              {(() => {
                const manuelEvo = evo?.get([...evo.keys()].find(k => isM(k)) ?? "");
                if (!manuelEvo) return null;
                return (
                  <div className="card" style={{ background:"var(--bg-success-subtle)", border:"1px solid var(--good)", marginTop:8 }}>
                    <div className="h-md fs-14">🇵🇹 Manuel — Evolução Doral</div>
                    <div style={{ display:"flex", gap:16, flexWrap:"wrap", alignItems:"center" }}>
                      <div style={{ textAlign:"center", flex:"1 1 100px" }}>
                        <div className="muted fs-10">{cur.year - 1} ({manuelEvo.from})</div>
                        <div className="fw-900" style={{ fontSize:24 }}>{manuelEvo.prevTotal}</div>
                      </div>
                      <div style={{ fontSize:24, color:"var(--good-dark)" }}>→</div>
                      <div style={{ textAlign:"center", flex:"1 1 100px" }}>
                        <div className="muted fs-10">{cur.year} ({manuelEvo.to})</div>
                        <div className="fw-900" style={{ fontSize:24, color: manuelEvo.delta < 0 ? "var(--good-dark)" : "var(--text-3)" }}>
                          {manuelEvo.prevTotal + manuelEvo.delta}
                        </div>
                      </div>
                      <div style={{ textAlign:"center", flex:"1 1 80px" }}>
                        <div className="muted fs-10">Δ</div>
                        <div className="fw-900" style={{ fontSize:24, color: manuelEvo.delta < 0 ? "var(--good-dark)" : SC.danger }}>
                          {manuelEvo.delta > 0 ? "+" : ""}{manuelEvo.delta}
                        </div>
                        <div className="muted fs-10">pancadas (2R)</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="center-msg muted">Dados não disponíveis</div>
          )}
        </div>

      </div>
    </div>
  );
}

export default function FTMDoralPage() {
  const [unlocked, setUnlocked] = useState(() => isCalUnlocked());
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return <Content />;
}