/**
 * DrivePage.tsx — DRIVE Tour & Challenge Results 2026
 * v8: FPG SD lookup + AGS fallback + all previous fixes
 */
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { scClass, SC, sdClassByHcp } from "../utils/scoreDisplay";
import { isCalUnlocked } from "../utils/authConstants";
import PasswordGate from "../ui/PasswordGate";
import LoadingState from "../ui/LoadingState";

/* ── Types ── */
interface Player {
  scoreId: string; pos: number | string | null; name: string; club: string;
  grossTotal: number | string | null; toPar: number | string | null;
  fed?: string; hcpExact?: number; hcpPlay?: number;
  course?: string; courseRating?: number; slope?: number; teeName?: string;
  nholes?: number; parTotal?: number;
  scores?: number[]; par?: number[]; si?: number[]; meters?: number[];
}
interface Tournament {
  name: string; ccode: string; tcode: string; date: string; campo: string; clube: string;
  series: "tour" | "challenge"; region: string; escalao: string | null; num: number;
  playerCount: number; players: Player[];
}
interface DriveData {
  lastUpdated: string; source: string; totalTournaments: number; totalPlayers: number;
  totalScorecards: number; tournaments: Tournament[];
}
interface PlayersDB { [fed: string]: { escalao?: string; name?: string; club?: { short?: string } } }
type SDLookup = Record<string, number>;
interface TStats {
  pos: number | string | null; gross: number; toPar: number;
  sd18: number | null; sdSource: "fpg" | "ags" | "raw" | null;
  nholes: number; birdies: number; pars: number; bogeys: number;
}
type SortKey = string;

/* ── Constants ── */
const REGIONS = [
  { id: "norte", label: "Norte", emoji: "🔵", color: "#2563eb", bg: "#dbeafe" },
  { id: "tejo", label: "Tejo", emoji: "🟡", color: "#a16207", bg: "#fef3c7" },
  { id: "sul", label: "Sul", emoji: "🟢", color: "#16a34a", bg: "#dcfce7" },
  { id: "madeira", label: "Madeira", emoji: "🟣", color: "#7c3aed", bg: "#ede9fe" },
  { id: "acores", label: "Açores", emoji: "🔴", color: "#dc2626", bg: "#fee2e2" },
];
const ESCALOES = ["Sub 10", "Sub 12", "Sub 14", "Sub 16", "Sub 18"];
const regionOf = (id: string) => REGIONS.find((r) => r.id === id);
const isManuel = (p: { name: string; fed?: string }) =>
  p.fed === "52884" || (p.name.includes("Manuel") && (p.name.includes("Medeiros") || p.name.includes("Goulartt")));

/* ── WHS Expected 9h SD table ── */
const EXP9: Record<number, number> = {
  0:1.2,1:1.7,2:2.2,3:2.8,4:3.3,5:3.8,6:4.3,7:4.8,8:5.4,9:5.9,
  10:6.4,11:6.9,12:7.4,13:8.0,14:8.5,15:9.0,16:9.5,17:10.0,18:10.6,
  19:11.1,20:11.6,21:12.2,22:12.7,23:13.2,24:13.7,25:14.2,26:14.8,
  27:15.3,28:15.8,29:16.3,30:16.8,31:17.4,32:17.9,33:18.4,34:18.9,
  35:19.4,36:20.0,37:20.5,38:21.0,39:21.5,40:22.0,41:22.6,42:23.1,
  43:23.6,44:24.1,45:24.6,46:25.2,47:25.7,48:26.2,49:26.7,50:27.2,
  51:27.8,52:28.3,53:28.8,54:29.3,
};
function expectedSD9(hi: number): number {
  const c = Math.min(54, Math.max(0, hi));
  const lo = Math.floor(c);
  const loV = EXP9[lo] ?? (lo * 0.52 + 1.2);
  const hiV = EXP9[Math.min(lo + 1, 54)] ?? ((lo + 1) * 0.52 + 1.2);
  return loV + (c - lo) * (hiV - loV);
}

/* ── AGS: Adjusted Gross Score (Net Double Bogey cap per hole) ── */
function calcAGS(
  scores: number[], parArr: number[], si: number[],
  cr: number, slope: number, hcp: number, nholes: number
): number {
  if (!scores.length || !parArr.length || !si.length || scores.length < nholes) {
    return scores.reduce((a, b) => a + b, 0);
  }
  const parT = parArr.reduce((a, b) => a + b, 0);
  const ch = Math.round(hcp * (slope / 113) + (cr - parT));
  const siOrder = Array.from({ length: nholes }, (_, i) => i).sort((a, b) => si[a] - si[b]);
  const strokes = new Array(nholes).fill(0);
  let rem = Math.max(0, ch);
  while (rem > 0) {
    for (const idx of siOrder) {
      if (rem <= 0) break;
      strokes[idx]++;
      rem--;
    }
  }
  let adj = 0;
  for (let i = 0; i < nholes; i++) {
    const ndb = parArr[i] + 2 + strokes[i];
    adj += Math.min(scores[i], ndb);
  }
  return adj;
}

/* ── Helpers ── */
const fmtTP = (v: number | null): string => {
  if (v == null) return "–";
  return v === 0 ? "E" : v > 0 ? "+" + v : "" + v;
};
const tpColor = (v: number | null | undefined): string | undefined => {
  if (v == null) return undefined;
  if (v < 0) return SC.danger;
  if (v === 0) return SC.good;
  return undefined;
};
const fmtDate = (d: string) => {
  if (!d) return "";
  const [, m, day] = d.split("-");
  return day + "/" + m;
};
const fmtSub = (v: number) => (v === 0 ? "(E)" : v > 0 ? "(+" + v + ")" : "(" + v + ")");

function isDNS(p: Player): boolean {
  const g = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
  if (g != null && g >= 900) return true;
  if (String(p.pos) === "NS" && p.scores?.every((s) => s === 0)) return true;
  return false;
}

function computeStats(p: Player, sdLookup: SDLookup): TStats | null {
  if (isDNS(p)) return null;
  const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
  if (gross == null || isNaN(gross as number)) return null;
  const g = gross as number;
  const parArr = p.par || [];
  const scores = p.scores || [];
  const si = p.si || [];
  const parT = p.parTotal || parArr.reduce((a, b) => a + b, 0);
  const tp = g - parT;
  const nh = p.nholes || scores.length || 18;
  const is9 = nh <= 9;

  let sd18: number | null = null;
  let sdSource: "fpg" | "ags" | "raw" | null = null;

  // 1) FPG lookup by scoreId
  const sid = String(p.scoreId);
  if (sdLookup[sid] != null) {
    sd18 = sdLookup[sid];
    sdSource = "fpg";
  }
  // 2) AGS calculation (needs SI data)
  else if (p.courseRating && p.slope && p.hcpExact != null && si.length >= nh && scores.length >= nh && parArr.length >= nh) {
    const adjGross = calcAGS(scores, parArr, si, p.courseRating, p.slope, p.hcpExact, nh);
    const rawSD = (113 / p.slope) * (adjGross - p.courseRating);
    sd18 = is9 ? rawSD + expectedSD9(p.hcpExact) : rawSD;
    sdSource = "ags";
  }
  // 3) Raw fallback (no SI)
  else if (p.courseRating && p.slope) {
    const rawSD = (113 / p.slope) * (g - p.courseRating);
    if (is9 && p.hcpExact != null) {
      sd18 = rawSD + expectedSD9(p.hcpExact);
    } else if (!is9) {
      sd18 = rawSD;
    }
    sdSource = sd18 != null ? "raw" : null;
  }

  let birdies = 0, pars = 0, bogeys = 0;
  for (let i = 0; i < scores.length && i < parArr.length; i++) {
    const d = scores[i] - parArr[i];
    if (d <= -1) birdies++;
    else if (d === 0) pars++;
    else bogeys++;
  }
  return { pos: p.pos, gross: g, toPar: tp, sd18, sdSource, nholes: nh, birdies, pars, bogeys };
}

function uniquePC(ts: Tournament[]): number {
  const s = new Set<string>();
  for (const t of ts) for (const p of t.players) if (!isDNS(p)) s.add(p.fed || p.name);
  return s.size;
}
function countEvents(ts: Tournament[]): number {
  const s = new Set<string>();
  for (const t of ts) s.add(t.region + "-" + t.num + "-" + t.date);
  return s.size;
}
const shortCampo = (c: string) =>
  c?.replace(/Vilamoura - /g, "").replace(/ \(.*\)/, "").replace(/ - .*/, "")
    .replace(/ Golf/g, "").replace(/Santo da Serra.*/, "Stº Serra") || "";

/* ── Sortable header ── */
function SortTh(props: {
  children: React.ReactNode; sortKey: SortKey; current: SortKey; dir: "asc" | "desc";
  onSort: (k: SortKey) => void; style?: React.CSSProperties; className?: string; colSpan?: number;
}) {
  const active = props.current === props.sortKey;
  return (
    <th colSpan={props.colSpan} className={props.className}
      style={{ ...props.style, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => props.onSort(props.sortKey)}>
      {props.children}{active && <span style={{ marginLeft: 2, fontSize: 8 }}>{props.dir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

/* ── Player name ── */
function PName(props: { name: string; fed?: string; playersDB?: PlayersDB; highlight?: boolean }) {
  const hasProfile = props.fed && props.playersDB && props.playersDB[props.fed];
  const truncName = props.name.length > 25 ? props.name.substring(0, 23) + "…" : props.name;
  const sty: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
    ...(hasProfile ? { cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 2 } : {}),
  };
  const handleClick = hasProfile ? () => window.open("/jogadores/" + props.fed, "_blank") : undefined;
  return (
    <span style={sty} onClick={handleClick}>
      {truncName}
      {props.highlight && <span style={{ marginLeft: 3, fontSize: 10 }}>⭐</span>}
    </span>
  );
}

/* ── SD cell ── */
function SDCell(props: { sd: number | null; sdSource: string | null; hcp: number | null; nholes: number; style?: React.CSSProperties }) {
  if (props.sd == null) return <td className="r" style={props.style}>–</td>;
  const cls = sdClassByHcp(props.sd, props.hcp);
  const is9 = props.nholes <= 9;
  const tip = props.sdSource === "fpg" ? "" : props.sdSource === "ags" ? "~" : "≈";
  return (
    <td className="r" style={props.style}>
      <span className={"p p-sm p-" + cls}>{props.sd.toFixed(1)}</span>
      {(is9 || tip) && <span style={{ fontSize: 7, color: "var(--text-muted)", marginLeft: 1 }}>{is9 && "*"}{tip}</span>}
    </td>
  );
}

/* ═══════════════════════════════════════════════════════
   RESUMO TABLE
   ═══════════════════════════════════════════════════════ */
function ResumoTable(props: { tournaments: Tournament[]; playersDB: PlayersDB; sdLookup: SDLookup }) {
  const { playersDB, sdLookup } = props;
  const sorted = useMemo(() => [...props.tournaments].sort((a, b) => a.date.localeCompare(b.date)), [props.tournaments]);
  const [sortKey, setSortKey] = useState<SortKey>("avgSD");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const handleSort = useCallback((k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }, [sortKey]);

  interface PRow {
    pKey: string; name: string; club: string; fed: string; escalao: string; hcp: number | null;
    results: Map<string, TStats | "dns">; jogos: number; bestSD: number | null; avgSD: number | null;
    totalBird: number; totalPars: number; totalBog: number;
  }

  const rows = useMemo(() => {
    const map = new Map<string, PRow>();
    for (const t of sorted) {
      const tKey = t.ccode + "-" + t.tcode;
      for (const p of t.players) {
        const pKey = p.fed || p.name;
        if (!map.has(pKey)) {
          let esc = t.escalao || "";
          if (!esc && p.fed && playersDB[p.fed]?.escalao) {
            const raw = playersDB[p.fed].escalao!;
            if (raw.startsWith("Sub")) esc = raw.replace("-", " ");
          }
          map.set(pKey, { pKey, name: p.name, club: p.club, fed: p.fed || "", escalao: esc,
            hcp: p.hcpExact ?? null, results: new Map(), jogos: 0, bestSD: null, avgSD: null,
            totalBird: 0, totalPars: 0, totalBog: 0 });
        }
        const row = map.get(pKey)!;
        if (p.hcpExact != null) row.hcp = p.hcpExact;
        if (isDNS(p)) {
          row.results.set(tKey, "dns");
        } else {
          const st = computeStats(p, sdLookup);
          if (st) {
            row.results.set(tKey, st);
            row.totalBird += st.birdies;
            row.totalPars += st.pars;
            row.totalBog += st.bogeys;
          }
        }
        row.jogos = [...row.results.values()].filter((v) => v !== "dns").length;
      }
    }
    for (const row of map.values()) {
      const sds: number[] = [];
      for (const r of row.results.values()) {
        if (r !== "dns" && r.sd18 != null) sds.push(r.sd18);
      }
      row.bestSD = sds.length ? Math.min(...sds) : null;
      row.avgSD = sds.length ? sds.reduce((s, v) => s + v, 0) / sds.length : null;
    }
    return [...map.values()];
  }, [sorted, playersDB, sdLookup]);

  const sortedRows = useMemo(() => {
    const mult = sortDir === "asc" ? 1 : -1;
    const INF = 9999;
    return [...rows].sort((a, b) => {
      if (sortKey === "name") return mult * a.name.localeCompare(b.name);
      if (sortKey === "fed") return mult * a.fed.localeCompare(b.fed);
      if (sortKey === "escalao") return mult * a.escalao.localeCompare(b.escalao);
      if (sortKey === "club") return mult * a.club.localeCompare(b.club);
      if (sortKey === "hcp") return mult * ((a.hcp ?? INF) - (b.hcp ?? INF));
      if (sortKey === "jogos") return mult * (a.jogos - b.jogos);
      if (sortKey === "bestSD") return mult * ((a.bestSD ?? INF) - (b.bestSD ?? INF));
      if (sortKey === "avgSD") return mult * ((a.avgSD ?? INF) - (b.avgSD ?? INF));
      if (sortKey === "totalBird") return mult * (a.totalBird - b.totalBird);
      if (sortKey === "totalPars") return mult * (a.totalPars - b.totalPars);
      if (sortKey === "totalBog") return mult * (a.totalBog - b.totalBog);
      const parts = sortKey.split("_");
      const field = parts[0];
      const tKey = parts.slice(1).join("_");
      const ra = a.results.get(tKey);
      const rb = b.results.get(tKey);
      const sa = ra && ra !== "dns" ? ra : null;
      const sb = rb && rb !== "dns" ? rb : null;
      let va: number, vb: number;
      if (field === "pos") { va = sa ? Number(sa.pos) || INF : INF; vb = sb ? Number(sb.pos) || INF : INF; }
      else if (field === "gross") { va = sa?.gross ?? INF; vb = sb?.gross ?? INF; }
      else if (field === "toPar") { va = sa?.toPar ?? INF; vb = sb?.toPar ?? INF; }
      else if (field === "sd") { va = sa?.sd18 ?? INF; vb = sb?.sd18 ?? INF; }
      else if (field === "bird") { va = sa?.birdies ?? -1; vb = sb?.birdies ?? -1; }
      else if (field === "par") { va = sa?.pars ?? -1; vb = sb?.pars ?? -1; }
      else if (field === "bog") { va = sa?.bogeys ?? INF; vb = sb?.bogeys ?? INF; }
      else { va = 0; vb = 0; }
      return mult * (va - vb);
    });
  }, [rows, sortKey, sortDir]);

  if (!sorted.length) return <div className="muted ta-center" style={{ padding: 24 }}>Sem torneios.</div>;

  const hs: React.CSSProperties = { fontSize: 11, padding: "6px 5px" };
  const cs: React.CSSProperties = { fontSize: 12, padding: "5px 5px", whiteSpace: "nowrap" };
  const bG = "3px solid var(--border)";
  const bS = "1px solid var(--border-light, #e5e7eb)";

  return (
    <div className="bjgt-chart-scroll">
      <table className="dtable" style={{ fontSize: 12, borderCollapse: "collapse", width: "auto" }}>
        <thead>
          <tr>
            <th colSpan={6} style={{ ...hs, borderBottom: "none" }}></th>
            {sorted.map((t) => {
              const tKey = t.ccode + "-" + t.tcode;
              const par = t.players.find((p) => !isDNS(p))?.parTotal || "?";
              const nh = t.players.find((p) => !isDNS(p))?.nholes || 18;
              const realCount = t.players.filter((p) => !isDNS(p)).length;
              return (
                <th key={tKey} colSpan={7} style={{ ...hs, textAlign: "center", borderLeft: bG, background: "var(--bg-hover)", lineHeight: 1.3 }}>
                  <div className="fw-800" style={{ fontSize: 13 }}>T{t.num} · {shortCampo(t.campo)}</div>
                  <div style={{ color: "var(--text-muted)", fontWeight: 500, fontSize: 10 }}>{fmtDate(t.date)} · Par {par} · {nh}h · {realCount} jog</div>
                </th>
              );
            })}
            <th colSpan={6} style={{ ...hs, borderLeft: bG, textAlign: "center", background: "var(--bg-hover)", fontSize: 12, fontWeight: 800 }}>Temporada</th>
          </tr>
          <tr>
            <SortTh sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, textAlign: "center", width: 26 }}>#</SortTh>
            <SortTh sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, textAlign: "left", paddingLeft: 6, minWidth: 155 }}>Jogador</SortTh>
            <SortTh sortKey="fed" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 52 }}>Fed</SortTh>
            <SortTh sortKey="escalao" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 52 }}>Esc.</SortTh>
            <SortTh sortKey="club" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, minWidth: 80 }}>Clube</SortTh>
            <SortTh sortKey="hcp" current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 42, borderRight: bG }}>HCP</SortTh>
            {sorted.map((t) => {
              const tKey = t.ccode + "-" + t.tcode;
              return (
                <React.Fragment key={tKey}>
                  <SortTh sortKey={"pos_" + tKey} current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 28, borderLeft: bG }}>#</SortTh>
                  <SortTh sortKey={"gross_" + tKey} current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 36, borderLeft: bS }}>Gross</SortTh>
                  <SortTh sortKey={"toPar_" + tKey} current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 32, borderLeft: bS }}>±Par</SortTh>
                  <SortTh sortKey={"sd_" + tKey} current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 40, borderLeft: bS }}>SD</SortTh>
                  <SortTh sortKey={"bird_" + tKey} current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>🐦</SortTh>
                  <SortTh sortKey={"par_" + tKey} current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>Par</SortTh>
                  <SortTh sortKey={"bog_" + tKey} current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>■</SortTh>
                </React.Fragment>
              );
            })}
            <SortTh sortKey="jogos" current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 32, borderLeft: bG }}>Jogos</SortTh>
            <SortTh sortKey="bestSD" current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 50, borderLeft: bS }}>Best SD</SortTh>
            <SortTh sortKey="avgSD" current={sortKey} dir={sortDir} onSort={handleSort} className="r" style={{ ...hs, width: 50, borderLeft: bS }}>Avg SD</SortTh>
            <SortTh sortKey="totalBird" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>🐦</SortTh>
            <SortTh sortKey="totalPars" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>Par</SortTh>
            <SortTh sortKey="totalBog" current={sortKey} dir={sortDir} onSort={handleSort} style={{ ...hs, width: 28, borderLeft: bS, textAlign: "center" }}>■</SortTh>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, idx) => {
            const bg = isManuel(row) ? "var(--bg-success-subtle)" : undefined;
            const escCls = row.escalao ? "p p-sm p-" + row.escalao.toLowerCase().replace(/\s+/g, "") : "";
            return (
              <tr key={row.pKey} style={bg ? { background: bg } : undefined}>
                <td className="fw-700 ta-center" style={{ ...cs, color: "var(--text-3)" }}>{idx + 1}</td>
                <td style={{ ...cs, paddingLeft: 6 }}>
                  <PName name={row.name} fed={row.fed || undefined} playersDB={playersDB} highlight={isManuel(row)} />
                </td>
                <td style={{ ...cs, fontSize: 10, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>{row.fed || "–"}</td>
                <td style={cs}>{row.escalao ? <span className={escCls} style={{ fontSize: 9 }}>{row.escalao}</span> : <span style={{ color: "var(--text-muted)", fontSize: 10 }}>–</span>}</td>
                <td style={{ ...cs, color: "var(--text-3)" }}>{row.club}</td>
                <td className="r" style={{ ...cs, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-3)", borderRight: bG }}>{row.hcp != null ? row.hcp.toFixed(1) : "–"}</td>
                {sorted.map((t) => {
                  const tKey = t.ccode + "-" + t.tcode;
                  const rv = row.results.get(tKey);
                  if (!rv) return <td key={tKey} colSpan={7} style={{ textAlign: "center", borderLeft: bG, ...cs }}></td>;
                  if (rv === "dns") return <td key={tKey} colSpan={7} style={{ textAlign: "center", borderLeft: bG, ...cs }}><span style={{ color: "var(--text-muted)", fontWeight: 600, fontSize: 11 }}>NS</span></td>;
                  return (
                    <React.Fragment key={tKey}>
                      <td className="r fw-700" style={{ borderLeft: bG, ...cs, color: "var(--text-3)" }}>{rv.pos}</td>
                      <td className="r fw-800" style={{ ...cs, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", borderLeft: bS }}>{rv.gross}</td>
                      <td className="r fw-700" style={{ ...cs, fontFamily: "'JetBrains Mono', monospace", color: tpColor(rv.toPar), borderLeft: bS }}>{fmtTP(rv.toPar)}</td>
                      <SDCell sd={rv.sd18} sdSource={rv.sdSource} hcp={row.hcp} nholes={rv.nholes} style={{ ...cs, borderLeft: bS }} />
                      <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{rv.birdies}</td>
                      <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{rv.pars}</td>
                      <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{rv.bogeys}</td>
                    </React.Fragment>
                  );
                })}
                <td className="r fw-700" style={{ borderLeft: bG, ...cs, fontSize: 13 }}>{row.jogos}</td>
                <td className="r" style={{ ...cs, borderLeft: bS }}>{row.bestSD != null ? <span className={"p p-sm p-" + sdClassByHcp(row.bestSD, row.hcp)}>{row.bestSD.toFixed(1)}</span> : "–"}</td>
                <td className="r" style={{ ...cs, borderLeft: bS }}>{row.avgSD != null ? <span className={"p p-sm p-" + sdClassByHcp(row.avgSD, row.hcp)}>{row.avgSD.toFixed(1)}</span> : "–"}</td>
                <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{row.totalBird}</td>
                <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{row.totalPars}</td>
                <td style={{ ...cs, borderLeft: bS, textAlign: "center" }}>{row.totalBog}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SCORECARD LEADERBOARD
   ═══════════════════════════════════════════════════════ */
function ScorecardLB(props: { tournament: Tournament; playersDB: PlayersDB }) {
  const { tournament, playersDB } = props;
  const players = tournament.players.filter((p) => !isDNS(p) && p.scores && p.scores.length > 0);
  if (!players.length) return <div className="muted ta-center" style={{ padding: 16 }}>Scorecards não disponíveis.</div>;
  const refP = players[0];
  const par = refP.par || [];
  const nh = par.length;
  const is9 = nh <= 9;
  const parF9 = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const parB9 = nh > 9 ? par.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
  const parTotal = par.reduce((a, b) => a + b, 0);
  const si = refP.si || [];

  const sorted = [...players].sort((a, b) => {
    const ag = typeof a.grossTotal === "string" ? parseInt(a.grossTotal) : (a.grossTotal as number ?? 999);
    const bg = typeof b.grossTotal === "string" ? parseInt(b.grossTotal) : (b.grossTotal as number ?? 999);
    return ag - bg;
  });
  let pos = 1;
  sorted.forEach((p, i) => {
    if (i > 0) {
      const prev = typeof sorted[i - 1].grossTotal === "string" ? parseInt(sorted[i - 1].grossTotal as string) : sorted[i - 1].grossTotal;
      const cur = typeof p.grossTotal === "string" ? parseInt(p.grossTotal as string) : p.grossTotal;
      if (cur !== prev) pos = i + 1;
    }
    (p as any)._dp = pos;
  });
  const grosses = sorted.map((p) => typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number)).filter((g) => !isNaN(g));
  const avg = grosses.length ? grosses.reduce((a, b) => a + b, 0) / grosses.length : 0;

  return (
    <div>
      <div className="muted fs-11 mb-8" style={{ padding: "0 4px" }}>
        {sorted.length} jogadores · Par {parTotal} · {nh}h · Média Rt: {avg.toFixed(1)} ({fmtTP(Math.round(avg - parTotal))})
        {refP.course && <> · 📍 {refP.course}</>}
        {refP.courseRating && <> · CR {refP.courseRating}</>}
        {refP.slope && <> · Slope {refP.slope}</>}
      </div>
      <div className="bjgt-chart-scroll">
        <table className="sc-table-modern" data-sc-table="1">
          <thead><tr>
            <th className="hole-header" style={{ textAlign: "center", width: 26 }}>#</th>
            <th className="hole-header" style={{ textAlign: "left", paddingLeft: 6 }}>Jogador</th>
            <th className="hole-header col-total" style={{ width: 30 }}>Tot</th>
            <th className="hole-header" style={{ width: 30 }}>±</th>
            {Array.from({ length: Math.min(9, nh) }, (_, i) => <th key={i} className="hole-header">{i + 1}</th>)}
            <th className="hole-header col-out fs-10">{is9 ? "Tot" : "Out"}</th>
            {!is9 && Array.from({ length: Math.min(9, nh - 9) }, (_, i) => <th key={i + 9} className="hole-header">{i + 10}</th>)}
            {!is9 && <th className="hole-header col-in fs-10">In</th>}
          </tr></thead>
          <tbody>
            <tr className="sep-row">
              <td></td><td className="row-label par-label">PAR</td><td className="col-total">{parTotal}</td><td></td>
              {par.slice(0, 9).map((p, i) => <td key={i}>{p}</td>)}
              <td className="col-out fw-600">{parF9}</td>
              {!is9 && par.slice(9, 18).map((p, i) => <td key={i}>{p}</td>)}
              {!is9 && <td className="col-in fw-600">{parB9}</td>}
            </tr>
            {si.length >= nh && (
              <tr className="meta-row sep-row">
                <td></td><td className="row-label par-label">S.I.</td><td></td><td></td>
                {si.slice(0, 9).map((s, i) => <td key={i}>{s}</td>)}
                <td className="col-out"></td>
                {!is9 && si.slice(9, 18).map((s, i) => <td key={i}>{s}</td>)}
                {!is9 && <td className="col-in"></td>}
              </tr>
            )}
            {sorted.map((p, idx) => {
              const scores = p.scores!;
              const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : (p.grossTotal as number);
              const tp = gross - parTotal;
              const f9 = scores.slice(0, 9).reduce((a, b) => a + b, 0);
              const b9 = !is9 ? scores.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
              const dp = (p as any)._dp;
              const showP = idx === 0 || dp !== (sorted[idx - 1] as any)._dp;
              const bg = isManuel(p) ? "var(--bg-success-subtle)" : undefined;
              return (
                <tr key={p.scoreId || idx} style={bg ? { background: bg } : undefined}>
                  <td className="fw-800 ta-center" style={{ color: "var(--text-3)", fontSize: 11 }}>{showP ? dp : ""}</td>
                  <td className="row-label" style={{ whiteSpace: "nowrap", paddingLeft: 6 }}>
                    <PName name={p.name} fed={p.fed} playersDB={playersDB} highlight={isManuel(p)} />
                  </td>
                  <td className="col-total">{gross}</td>
                  <td className="fw-700" style={{ color: tp < 0 ? SC.danger : tp === 0 ? SC.good : "var(--text-3)", fontSize: 12 }}>{fmtTP(tp)}</td>
                  {scores.slice(0, 9).map((sc, i) => <td key={i}><span className={"sc-score " + scClass(sc, par[i])}>{sc}</span></td>)}
                  <td className="col-out fw-600">{f9} <span className="fs-8 c-text-3">{fmtSub(f9 - parF9)}</span></td>
                  {!is9 && scores.slice(9, 18).map((sc, i) => <td key={i}><span className={"sc-score " + scClass(sc, par[9 + i])}>{sc}</span></td>)}
                  {!is9 && <td className="col-in fw-600">{b9} <span className="fs-8 c-text-3">{fmtSub(b9 - parB9)}</span></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   VIEWS
   ═══════════════════════════════════════════════════════ */
function RegionView(props: { tournaments: Tournament[]; playersDB: PlayersDB; sdLookup: SDLookup; label: string }) {
  const { playersDB, sdLookup, label } = props;
  const sorted = useMemo(() => [...props.tournaments].sort((a, b) => a.date.localeCompare(b.date)), [props.tournaments]);
  const [tab, setTab] = useState<"resumo" | number>("resumo");
  const cur = typeof tab === "number" ? sorted[tab] : null;
  return (
    <div style={{ padding: "0 12px 12px" }}>
      <div className="escalao-pills mb-8" style={{ gap: 4, flexWrap: "wrap" }}>
        <button onClick={() => setTab("resumo")} className={"tourn-tab tourn-tab-sm" + (tab === "resumo" ? " active" : "")}>📋 Resumo</button>
        {sorted.map((t, i) => (
          <button key={t.ccode + "-" + t.tcode} onClick={() => setTab(i)} className={"tourn-tab tourn-tab-sm" + (tab === i ? " active" : "")}>
            🏆 T{t.num} · {shortCampo(t.campo)} · {fmtDate(t.date)}
          </button>
        ))}
      </div>
      {tab === "resumo" ? (
        <div className="card">
          <div className="h-md fs-14">📋 {label} — Temporada 2026</div>
          <div className="muted fs-11 mb-8">{sorted.length} torneios · {uniquePC(props.tournaments)} jogadores · {sorted.reduce((a, t) => a + t.players.filter((p) => !isDNS(p)).length, 0)} presenças</div>
          <ResumoTable tournaments={sorted} playersDB={playersDB} sdLookup={sdLookup} />
        </div>
      ) : cur && (
        <div className="card">
          <div className="h-md fs-14">🏆 R1 — Scorecards</div>
          <div className="muted fs-11 mb-4">T{cur.num} · 📍 {cur.campo} · 📅 {fmtDate(cur.date)} · {cur.players.filter((p) => !isDNS(p)).length} jog · {cur.players[0]?.nholes || 18}h</div>
          <ScorecardLB tournament={cur} playersDB={playersDB} />
        </div>
      )}
    </div>
  );
}

function DriveTourView(props: { tournaments: Tournament[]; playersDB: PlayersDB; sdLookup: SDLookup }) {
  const { tournaments, playersDB, sdLookup } = props;
  const [ri, setRi] = useState(0);
  const avail = useMemo(() => { const s = new Set(tournaments.map((t) => t.region)); return REGIONS.filter((r) => s.has(r.id)); }, [tournaments]);
  const region = avail[ri]?.id;
  const rT = useMemo(() => tournaments.filter((t) => t.region === region), [tournaments, region]);
  if (!avail.length) return <div className="muted ta-center" style={{ padding: 24 }}>Sem torneios Drive Tour.</div>;
  return (
    <div>
      <div className="escalao-pills" style={{ padding: "8px 12px", flexWrap: "wrap" }}>
        {avail.map((reg, i) => {
          const rt = tournaments.filter((t) => t.region === reg.id);
          return (
            <button key={reg.id} className={"tourn-tab tourn-tab-sm" + (ri === i ? " active" : "")} onClick={() => setRi(i)}
              style={ri === i ? {} : { borderColor: reg.bg, color: reg.color, background: reg.bg }}>
              {reg.emoji} {reg.label} ({rt.length}T · {uniquePC(rt)} jog)
            </button>
          );
        })}
      </div>
      <RegionView tournaments={rT} playersDB={playersDB} sdLookup={sdLookup} label={"Drive Tour " + (regionOf(region)?.label || "")} />
    </div>
  );
}

function DriveChallengeView(props: { tournaments: Tournament[]; playersDB: PlayersDB; sdLookup: SDLookup }) {
  const { tournaments, playersDB, sdLookup } = props;
  const [ri, setRi] = useState(0);
  const [ei, setEi] = useState(0);
  const avail = useMemo(() => { const s = new Set(tournaments.map((t) => t.region)); return REGIONS.filter((r) => s.has(r.id)); }, [tournaments]);
  const region = avail[ri]?.id;
  const rT = useMemo(() => tournaments.filter((t) => t.region === region), [tournaments, region]);
  const avE = useMemo(() => { const s = new Set(rT.map((t) => t.escalao).filter(Boolean) as string[]); return ESCALOES.filter((e) => s.has(e)); }, [rT]);
  useEffect(() => { setEi(0); }, [ri]);
  const esc = avE[ei];
  const fT = useMemo(() => rT.filter((t) => t.escalao === esc), [rT, esc]);
  if (!avail.length) return <div className="muted ta-center" style={{ padding: 24 }}>Sem torneios Drive Challenge.</div>;
  return (
    <div>
      <div className="escalao-pills" style={{ padding: "8px 12px", flexWrap: "wrap" }}>
        {avail.map((reg, i) => {
          const rt = tournaments.filter((t) => t.region === reg.id);
          return (
            <button key={reg.id} className={"tourn-tab tourn-tab-sm" + (ri === i ? " active" : "")} onClick={() => setRi(i)}
              style={ri === i ? {} : { borderColor: reg.bg, color: reg.color, background: reg.bg }}>
              {reg.emoji} {reg.label} ({countEvents(rt)}T · {uniquePC(rt)} jog)
            </button>
          );
        })}
      </div>
      {avE.length > 0 && (
        <div className="escalao-pills" style={{ padding: "0 12px 8px", flexWrap: "wrap" }}>
          {avE.map((e, i) => (
            <button key={e} className={"tourn-tab tourn-tab-sm" + (ei === i ? " active" : "")} onClick={() => setEi(i)}>
              {e} ({uniquePC(rT.filter((t) => t.escalao === e))} jog)
            </button>
          ))}
        </div>
      )}
      <RegionView tournaments={fT} playersDB={playersDB} sdLookup={sdLookup} label={"Challenge " + (regionOf(region)?.label || "") + " " + (esc || "")} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════ */
function DriveContent() {
  const [data, setData] = useState<DriveData | null>(null);
  const [pdb, setPdb] = useState<PlayersDB>({});
  const [sdLookup, setSdLookup] = useState<SDLookup>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<"tour" | "challenge">("tour");

  useEffect(() => {
    Promise.all([
      fetch("/data/drive-data.json").then((r) => { if (!r.ok) throw new Error("drive " + r.status); return r.json(); }),
      fetch("/data/players.json").then((r) => r.ok ? r.json() : {}).catch(() => ({})),
      fetch("/data/drive-sd-lookup.json").then((r) => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([dd, pp, sd]) => {
      setData(dd as DriveData);
      setPdb(pp as PlayersDB);
      setSdLookup(sd as SDLookup);
      setLoading(false);
    }).catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const tourT = useMemo(() => data?.tournaments.filter((t) => t.series === "tour") ?? [], [data]);
  const challT = useMemo(() => data?.tournaments.filter((t) => t.series === "challenge") ?? [], [data]);

  if (loading) return <LoadingState />;
  if (error) return <div className="tourn-layout"><div className="notice-error" style={{ margin: 16 }}>Erro: {error}</div></div>;
  if (!data) return null;

  const sdCount = Object.keys(sdLookup).length;

  return (
    <div className="tourn-layout">
      <div className="toolbar">
        <div className="toolbar-left">
          <span className="tourn-toolbar-title">🏁 DRIVE 2026</span>
          <span className="tourn-toolbar-meta">Circuito Regional Juvenil</span>
          <div className="tourn-toolbar-sep" />
          <div className="escalao-pills">
            <button className={"tourn-tab tourn-tab-sm" + (series === "tour" ? " active" : "")} onClick={() => setSeries("tour")}>
              🏌️ Tour ({tourT.length})
            </button>
            <button className={"tourn-tab tourn-tab-sm" + (series === "challenge" ? " active" : "")} onClick={() => setSeries("challenge")}
              style={series === "challenge" ? {} : { background: "#ede9fe", color: "#7c3aed", borderColor: "#ede9fe" }}>
              ⚡ Challenge ({countEvents(challT)})
            </button>
          </div>
        </div>
        <div className="toolbar-right">
          {data.totalScorecards > 0 && <span className="chip" style={{ background: "#dcfce7", color: "#16a34a" }}>📊 {data.totalScorecards} sc</span>}
          <span className="chip">📅 {data.lastUpdated}</span>
        </div>
      </div>
      {series === "tour"
        ? <DriveTourView tournaments={tourT} playersDB={pdb} sdLookup={sdLookup} />
        : <DriveChallengeView tournaments={challT} playersDB={pdb} sdLookup={sdLookup} />}
      <div style={{ padding: "8px 12px", fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>
        scoring.datagolf.pt · {data.lastUpdated} · SD: FPG oficial{sdCount > 0 && " (" + sdCount + ")"} → AGS → aproximado · * inclui Expected SD 9h
      </div>
    </div>
  );
}

export default function DrivePage() {
  const [unlocked, setUnlocked] = useState(() => isCalUnlocked());
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return <DriveContent />;
}
