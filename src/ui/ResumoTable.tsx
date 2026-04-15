import React, { useMemo, useCallback, useState } from "react";
import { useSort } from "../hooks/useSort";
import { sdClassByHcp } from "../utils/scoreDisplay";
import { fmtDateShort, fmtHcp } from "../utils/format";
import { escPillCls } from "../utils/playerUtils";
import { calcAGS, expectedSD9 } from "../utils/whsCalc";
import { CrossSeasonTable, SortTh as _CSortTh } from "./CrossSeasonTable";
import { isManuel, fmtTP, tpColor, TournPName, type PlayersDB } from "./tournamentPrimitives";
import { isDNS } from "./driveUtils";

// Wrapper que aceita style (não incluído nos props originais de SortTh)
const CSortTh = _CSortTh as React.ComponentType<
  React.ComponentProps<typeof _CSortTh> & { style?: React.CSSProperties }
>;

/* ── Types ── */
interface TStats {
  pos: number | string | null;
  gross: number;
  toPar: number;
  sd18: number | null;
  sdSource: "fpg" | "ags" | "raw" | null;
  nholes: number;
  birdies: number;
  pars: number;
  bogeys: number;
}

interface Player {
  scoreId: string;
  pos: number | string | null;
  name: string;
  club: string;
  grossTotal: number | string | null;
  toPar: number | string | null;
  fed?: string;
  fedCode?: string;
  hcpExact?: number;
  hcpPlay?: number;
  course?: string;
  courseRating?: number;
  slope?: number;
  teeName?: string;
  nholes?: number;
  parTotal?: number;
  scores?: number[];
  par?: number[];
  si?: number[];
  meters?: number[];
  roundScores?: Array<{
    round: number;
    gross: number;
    scores: number[];
    pars: number[];
    si: number[];
    meters: number[];
    courseRating: number;
    slope: number;
    teeName: string;
    teeColorId?: number;
  }>;
  _incomplete?: boolean;
  _wd?: boolean;
  _roundsPlayed?: number;
  _dp?: number;
}

interface Tournament {
  name: string;
  ccode: string;
  tcode: string;
  date: string;
  campo: string;
  clube: string;
  series: "tour" | "challenge" | "aquapor";
  region: string;
  escalao: string | null;
  num: number;
  playerCount: number;
  players: Player[];
  rounds?: number;
  nholes?: number;
  par?: number[];
  _multiGroup?: string;
  _roundLabel?: string;
  _totalRounds?: number;
  _isIncomplete?: boolean;
}

type SDLookup = Record<string, number>;
type EscLookup = Map<string, string>;
type SortKey = string;

/* ── Helper Functions ── */

function computeStats(p: Player, sdLookup: SDLookup): TStats | null {
  if (isDNS(p)) return null;
  const gross = typeof p.grossTotal === "string" ? parseInt(p.grossTotal) : p.grossTotal;
  if (gross == null || isNaN(gross as number)) return null;
  const g = gross as number;

  // Flat fields may be absent when player uses roundScores format;
  // fall back to roundScores[0] for single-round tournaments
  const rs0 = p.roundScores?.[0];
  const parArr = p.par?.length ? p.par : rs0?.pars || [];
  const scores = p.scores?.length ? p.scores : rs0?.scores || [];
  const si = p.si?.length ? p.si : rs0?.si || [];
  const cr = p.courseRating ?? rs0?.courseRating;
  const slope = p.slope ?? rs0?.slope;

  const parT = p.parTotal || parArr.reduce((a, b) => a + b, 0);
  const tp = g - parT;
  const nh = p.nholes || scores.length || parArr.length || 18;
  const is9 = nh <= 9;

  let sd18: number | null = null;
  let sdSource: "fpg" | "ags" | "raw" | null = null;

  // Skip SD calculation for multi-round combined entries (nholes > 18)
  if (nh <= 18) {
    // 1) FPG lookup by scoreId
    const sid = String(p.scoreId);
    if (sdLookup[sid] != null) {
      sd18 = sdLookup[sid];
      sdSource = "fpg";
    }
    // 2) AGS calculation (needs SI data)
    else if (cr && slope && p.hcpExact != null && si.length >= nh && scores.length >= nh && parArr.length >= nh) {
      const adjGross = calcAGS(scores, parArr, si, cr, slope, p.hcpExact, nh);
      const rawSD = (113 / slope) * (adjGross - cr);
      sd18 = is9 ? rawSD + expectedSD9(p.hcpExact) : rawSD;
      sdSource = "ags";
    }
    // 3) Raw fallback (no SI)
    else if (cr && slope) {
      const rawSD = (113 / slope) * (g - cr);
      if (is9 && p.hcpExact != null) {
        sd18 = rawSD + expectedSD9(p.hcpExact);
      } else if (!is9) {
        sd18 = rawSD;
      }
      sdSource = sd18 != null ? "raw" : null;
    }
  }

  let birdies = 0,
    pars = 0,
    bogeys = 0;
  // If player has multiple roundScores, count across all rounds
  if (p.roundScores && p.roundScores.length > 1) {
    for (const rs of p.roundScores) {
      const rScores = rs.scores || [];
      const rPars = rs.pars || [];
      for (let i = 0; i < rScores.length && i < rPars.length; i++) {
        const d = rScores[i] - rPars[i];
        if (d <= -1) birdies++;
        else if (d === 0) pars++;
        else bogeys++;
      }
    }
  } else {
    for (let i = 0; i < scores.length && i < parArr.length; i++) {
      const d = scores[i] - parArr[i];
      if (d <= -1) birdies++;
      else if (d === 0) pars++;
      else bogeys++;
    }
  }
  return { pos: p.pos, gross: g, toPar: tp, sd18, sdSource, nholes: nh, birdies, pars, bogeys };
}

const drivePoints = (pos: number | string | null): number => {
  if (pos == null) return 0;
  const n = Number(pos);
  if (isNaN(n) || n <= 0) return 0;
  const map: Record<number, number> = {
    1: 100,
    2: 70,
    3: 53,
    4: 40,
    5: 34,
    6: 30,
    7: 27,
    8: 24,
    9: 22,
    10: 20,
    11: 18,
    12: 17,
    13: 16,
    14: 15,
    15: 14,
    16: 13,
    17: 12,
    18: 11,
    19: 10,
  };
  return n <= 19 ? map[n] : n <= 24 ? 9 : n <= 30 ? 8 : n <= 40 ? 7 : n <= 50 ? 6 : 5;
};

const shortCampo = (c: string) =>
  c
    ?.replace(/Vilamoura - /g, "")
    .replace(/ \(.*\)/, "")
    .replace(/ - .*/, "")
    .replace(/ Golf/g, "")
    .replace(/Santo da Serra.*/, "Stº Serra") || "";

/* ── PName component ── */
const PName = (props: { name: string; fed?: string; playersDB?: PlayersDB; highlight?: boolean }) => (
  <TournPName
    name={props.name}
    fed={props.fed}
    playersDB={props.playersDB}
    highlight={props.highlight}
  />
);

/* ── SD cell ── */
function SDCell(props: {
  sd: number | null;
  sdSource: string | null;
  hcp: number | null;
  nholes: number;
  style?: React.CSSProperties;
}) {
  if (props.sd == null) return <td className="r" style={props.style}>–</td>;
  const cls = sdClassByHcp(props.sd, props.hcp);
  const is9 = props.nholes <= 9;
  const tip = props.sdSource === "fpg" ? "" : props.sdSource === "ags" ? "~" : "≈";
  return (
    <td className="r" style={props.style}>
      <span className={"p p-sm p-" + cls}>{props.sd.toFixed(1)}</span>
      {(is9 || tip) && (
        <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 1 }}>
          {is9 && "*"}
          {tip}
        </span>
      )}
    </td>
  );
}

/* ═══════════════════════════════════════════════════════
   RESUMO TABLE
   ═══════════════════════════════════════════════════════ */
export function ResumoTable(props: {
  tournaments: Tournament[];
  playersDB: PlayersDB;
  sdLookup: SDLookup;
  escLookup?: EscLookup;
  mergeByEvent?: boolean;
}) {
  const { playersDB, sdLookup } = props;
  const globalEscLookup = props.escLookup;
  const mergeByEvent = !!props.mergeByEvent;
  const sorted = useMemo(
    () => [...props.tournaments].sort((a, b) => a.date.localeCompare(b.date)),
    [props.tournaments]
  );
  const { sortKey, sortDir, toggleSort: handleSort } = useSort<SortKey>("totalPts", "desc");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // Chave de coluna — inline, sem useCallback
  const mkKey = (t: Tournament) =>
    mergeByEvent
      ? String(t.num) + "|" + String(t.region) + "|" + String(t.date)
      : t.ccode + "-" + t.tcode + "-" + t.date;

  // Torneios visíveis (colunas da tabela)
  const visibleSorted = useMemo(() => {
    if (mergeByEvent) {
      // Uma coluna por evento físico (num+region+date), ignorar duplicados por escalão
      const seen = new Set<string>();
      return sorted.filter((t) => {
        if (t._multiGroup && t._roundLabel !== "Resumo") return false;
        const k = String(t.num) + "|" + String(t.region) + "|" + String(t.date);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    return sorted.filter((t) => {
      if (!t._multiGroup) return true;
      if (t._roundLabel === "Resumo") return true;
      return expandedGroups.has(t._multiGroup);
    });
  }, [sorted, expandedGroups, mergeByEvent]);

  interface PRow {
    pKey: string;
    name: string;
    club: string;
    fed: string;
    escalao: string;
    hcp: number | null;
    results: Map<string, TStats | "dns">;
    jogos: number;
    bestSD: number | null;
    avgSD: number | null;
    totalBird: number;
    totalPars: number;
    totalBog: number;
    totalPts: number;
  }

  // Build escalao lookup from Challenge tournament data
  const challEscLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of sorted) {
      if (t.escalao) {
        for (const p of t.players) {
          const fed = p.fed || p.fedCode;
          if (fed && !m.has(fed)) m.set(fed, t.escalao);
        }
      }
    }
    return m;
  }, [sorted]);

  const rows = useMemo(() => {
    const map = new Map<string, PRow>();
    const totalKeys = new Set<string>();
    for (const t of sorted) {
      if (t._roundLabel === "Resumo") totalKeys.add(mkKey(t));
    }
    for (const t of sorted) {
      const tKey = mkKey(t);
      const isTotal = totalKeys.has(tKey);
      for (const p of t.players) {
        const pKey = p.fed || p.name;
        if (!map.has(pKey)) {
          let esc = t.escalao || "";
          if (!esc && p.fed) {
            if (globalEscLookup?.has(p.fed)) {
              esc = globalEscLookup.get(p.fed)!;
            } else if (playersDB[p.fed]?.escalao) {
              const raw = playersDB[p.fed].escalao!;
              esc = raw.startsWith("Sub") ? raw.replace("-", " ") : raw;
            } else if (challEscLookup.has(p.fed)) {
              esc = challEscLookup.get(p.fed)!;
            }
          }
          map.set(pKey, {
            pKey,
            name: p.name,
            club: p.club,
            fed: p.fed || "",
            escalao: esc,
            hcp: p.hcpExact ?? null,
            results: new Map(),
            jogos: 0,
            bestSD: null,
            avgSD: null,
            totalBird: 0,
            totalPars: 0,
            totalBog: 0,
            totalPts: 0,
          });
        }
        const row = map.get(pKey)!;
        if (p.hcpExact != null) row.hcp = p.hcpExact;
        if (!row.escalao && t.escalao) row.escalao = t.escalao;
        if (!row.escalao && p.fed && globalEscLookup?.has(p.fed))
          row.escalao = globalEscLookup.get(p.fed)!;
        if (!row.escalao && p.fed && challEscLookup.has(p.fed))
          row.escalao = challEscLookup.get(p.fed)!;
        if (isDNS(p)) {
          row.results.set(tKey, "dns");
        } else {
          const st = computeStats(p, sdLookup);
          if (st) {
            row.results.set(tKey, st);
            if (!isTotal) {
              row.totalBird += st.birdies;
              row.totalPars += st.pars;
              row.totalBog += st.bogeys;
            }
            // Assign points: only for single-round events OR the "Total" of a multi-round event
            // (not for individual R1/R2 entries)
            const isRoundEntry = t._roundLabel && t._roundLabel !== "Resumo";
            if (!isRoundEntry) {
              row.totalPts += drivePoints(p.pos);
            }
          }
        }
        row.jogos = [...row.results.entries()]
          .filter(([k, v]) => v !== "dns" && !totalKeys.has(k)).length;
      }
    }
    for (const row of map.values()) {
      const sds: number[] = [];
      for (const [tKey, r] of row.results.entries()) {
        if (!totalKeys.has(tKey) && r !== "dns" && r.sd18 != null) sds.push(r.sd18);
      }
      row.bestSD = sds.length ? Math.min(...sds) : null;
      row.avgSD = sds.length ? sds.reduce((s, v) => s + v, 0) / sds.length : null;
    }
    return [...map.values()];
  }, [sorted, playersDB, sdLookup, challEscLookup, globalEscLookup]);

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
      if (sortKey === "totalPts") return mult * (a.totalPts - b.totalPts);
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
      if (field === "pos") {
        va = sa ? Number(sa.pos) || INF : INF;
        vb = sb ? Number(sb.pos) || INF : INF;
      } else if (field === "gross") {
        va = sa?.gross ?? INF;
        vb = sb?.gross ?? INF;
      } else if (field === "toPar") {
        va = sa?.toPar ?? INF;
        vb = sb?.toPar ?? INF;
      } else if (field === "sd") {
        va = sa?.sd18 ?? INF;
        vb = sb?.sd18 ?? INF;
      } else if (field === "bird") {
        va = sa?.birdies ?? -1;
        vb = sb?.birdies ?? -1;
      } else if (field === "par") {
        va = sa?.pars ?? -1;
        vb = sb?.pars ?? -1;
      } else if (field === "bog") {
        va = sa?.bogeys ?? INF;
        vb = sb?.bogeys ?? INF;
      } else {
        va = 0;
        vb = 0;
      }
      return mult * (va - vb);
    });
  }, [rows, sortKey, sortDir]);

  // Build group headers for CrossSeasonTable — DEVE ficar antes de qualquer return (regra dos hooks)
  interface GroupHeader {
    key: string;
    label: string;
    colSpan: number;
    isMulti: boolean;
    groupId?: string;
    tournament: Tournament;
    isExpanded: boolean;
  }
  const groupHeaders = useMemo(() => {
    const headers: GroupHeader[] = [];
    const seenGroups = new Set<string>();
    for (const t of visibleSorted) {
      if (t._multiGroup) {
        if (seenGroups.has(t._multiGroup)) continue;
        seenGroups.add(t._multiGroup);
        const entries = visibleSorted.filter((vt) => vt._multiGroup === t._multiGroup);
        const isExpanded = expandedGroups.has(t._multiGroup);
        headers.push({
          key: t._multiGroup,
          label: "T" + t.num + " · " + shortCampo(t.campo),
          colSpan: entries.length * 7,
          isMulti: true,
          groupId: t._multiGroup,
          tournament: t,
          isExpanded,
        });
      } else {
        headers.push({
          key: t.tcode,
          label: "T" + t.num + " · " + shortCampo(t.campo),
          colSpan: 7,
          isMulti: false,
          tournament: t,
          isExpanded: false,
        });
      }
    }
    return headers;
  }, [visibleSorted, expandedGroups]);

  if (!sorted.length) return <div className="muted ta-c p-24">Sem torneios.</div>;

  return (
    <CrossSeasonTable
      identityHeaders={
        <>
          <CSortTh k="name" s={sortKey} d={sortDir} on={handleSort} className="cs-pos sticky-col-0">
            #
          </CSortTh>
          <CSortTh
            k="name"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-name sticky-col-1"
          >
            Jogador
          </CSortTh>
          <CSortTh k="fed" s={sortKey} d={sortDir} on={handleSort} className="cs-fed">
            Fed
          </CSortTh>
          <CSortTh k="escalao" s={sortKey} d={sortDir} on={handleSort} className="cs-esc">
            Esc.
          </CSortTh>
          <CSortTh k="club" s={sortKey} d={sortDir} on={handleSort} className="cs-club">
            Clube
          </CSortTh>
          <CSortTh
            k="hcp"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-hcp cs-id-end"
          >
            HCP
          </CSortTh>
        </>
      }
      groups={groupHeaders.map((gh) => {
        const t = gh.tournament;
        const nh = t.players.find((p) => !isDNS(p))?.nholes || 18;
        const realCount = t.players.filter((p) => !isDNS(p) && !p._incomplete).length;
        const parSrc = gh.isMulti
          ? visibleSorted.find((vt) => vt._multiGroup === gh.groupId && vt._roundLabel !== "Resumo")
          : t;
        const par = (parSrc || t).players.find((p) => !isDNS(p))?.parTotal || "?";
        return {
          key: gh.key,
          headerTh: (
            <th key={gh.key} colSpan={gh.colSpan} className="cs-grp" style={{ lineHeight: 1.3 }}>
              <div className="fw-800 fs-13 gap-4" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span>{gh.label}</span>
                {gh.isMulti && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroup(gh.groupId!);
                    }}
                    className="btn"
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      width: 20,
                      height: 18,
                      padding: 0,
                      background: gh.isExpanded ? "var(--bg-success-strong)" : undefined,
                      color: gh.isExpanded ? "var(--color-good)" : "var(--text-muted)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                    title={gh.isExpanded ? "Colapsar rondas" : "Expandir R1/R2"}
                  >
                    {gh.isExpanded ? "−" : "+"}
                  </button>
                )}
              </div>
              <div className="c-muted fs-10-fw5">
                {fmtDateShort(t.date)} · Par {par} · {nh}h · {realCount} jog
                {gh.isMulti && <> · {t._totalRounds}R</>}
              </div>
            </th>
          ),
          subHeaderThs: (
            <>
              {visibleSorted
                .filter((vt) => (gh.isMulti ? vt._multiGroup === gh.groupId : vt.tcode === gh.key))
                .map((vt) => {
                  const tKey = mkKey(vt);
                  const roundLabel = vt._roundLabel;
                  const isRoundCol = roundLabel && roundLabel !== "Resumo";
                  const isTotalCol = roundLabel === "Resumo";
                  const bg = isTotalCol
                    ? "var(--bg-warn-subtle)"
                    : isRoundCol
                      ? "var(--bg-success-subtle)"
                      : undefined;
                  return (
                    <React.Fragment key={tKey}>
                      <CSortTh
                        k={"pos_" + tKey}
                        s={sortKey}
                        d={sortDir}
                        on={handleSort}
                        className="cs-t-pos cs-grp"
                        style={bg ? { background: bg } : undefined}
                      >
                        {roundLabel ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              color: isTotalCol ? "var(--color-warn-dark)" : "var(--color-good-dark)",
                            }}
                          >
                            {isTotalCol ? "Σ" : roundLabel}
                          </span>
                        ) : (
                          "#"
                        )}
                      </CSortTh>
                      <CSortTh
                        k={"gross_" + tKey}
                        s={sortKey}
                        d={sortDir}
                        on={handleSort}
                        className="cs-t-gross cs-col"
                        style={bg ? { background: bg } : undefined}
                      >
                        Gross
                      </CSortTh>
                      <CSortTh
                        k={"toPar_" + tKey}
                        s={sortKey}
                        d={sortDir}
                        on={handleSort}
                        className="cs-t-topar cs-col"
                        style={bg ? { background: bg } : undefined}
                      >
                        ±Par
                      </CSortTh>
                      <CSortTh
                        k={"sd_" + tKey}
                        s={sortKey}
                        d={sortDir}
                        on={handleSort}
                        className="cs-t-sd cs-col"
                        style={bg ? { background: bg } : undefined}
                      >
                        SD
                      </CSortTh>
                      <CSortTh
                        k={"bird_" + tKey}
                        s={sortKey}
                        d={sortDir}
                        on={handleSort}
                        className="cs-t-stat cs-col"
                        style={bg ? { background: bg } : undefined}
                      >
                        🐦
                      </CSortTh>
                      <CSortTh
                        k={"par_" + tKey}
                        s={sortKey}
                        d={sortDir}
                        on={handleSort}
                        className="cs-t-stat cs-col"
                        style={bg ? { background: bg } : undefined}
                      >
                        Par
                      </CSortTh>
                      <CSortTh
                        k={"bog_" + tKey}
                        s={sortKey}
                        d={sortDir}
                        on={handleSort}
                        className="cs-t-stat cs-col"
                        style={bg ? { background: bg } : undefined}
                      >
                        ■
                      </CSortTh>
                    </React.Fragment>
                  );
                })}
            </>
          ),
        };
      })}
      summaryGroupTh={
        <th className="cs-grp u-fw8-fs12" colSpan={7}>
          Temporada
        </th>
      }
      summarySubHeaders={
        <>
          <CSortTh
            k="jogos"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-s-games cs-grp"
          >
            Jogos
          </CSortTh>
          <CSortTh
            k="totalPts"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-s-pts cs-col"
            style={{ color: "var(--color-warn-dark)" }}
          >
            Pts
          </CSortTh>
          <CSortTh
            k="bestSD"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-s-sd cs-col"
          >
            Best SD
          </CSortTh>
          <CSortTh
            k="avgSD"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-s-sd cs-col"
          >
            Avg SD
          </CSortTh>
          <CSortTh
            k="totalBird"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-s-stat cs-col"
          >
            🐦
          </CSortTh>
          <CSortTh
            k="totalPars"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-s-stat cs-col"
          >
            Par
          </CSortTh>
          <CSortTh
            k="totalBog"
            s={sortKey}
            d={sortDir}
            on={handleSort}
            className="cs-s-stat cs-col"
          >
            ■
          </CSortTh>
        </>
      }
    >
      {sortedRows.map((row, idx) => {
        const cls = escPillCls(row.escalao);
        return (
          <tr key={row.pKey} className={isManuel(row) ? "row-manuel" : undefined}>
            <td className="cs-pos sticky-col-0">{idx + 1}</td>
            <td className="cs-name sticky-col-1">
              <PName
                name={row.name}
                fed={row.fed || undefined}
                playersDB={playersDB}
                highlight={isManuel(row)}
              />
            </td>
            <td className="cs-fed">{row.fed || "–"}</td>
            <td className="cs-esc">
              {row.escalao ? (
                <span className={cls + " fs-10"}>{row.escalao}</span>
              ) : (
                <span className="c-muted fs-10">–</span>
              )}
            </td>
            <td className="cs-club">{row.club}</td>
            <td className="cs-hcp cs-id-end">{fmtHcp(row.hcp)}</td>
            {visibleSorted.map((t) => {
              const tKey = mkKey(t);
              const rv = row.results.get(tKey);
              const isTotalCol = t._roundLabel === "Resumo";
              const isRoundCol = t._roundLabel && t._roundLabel !== "Resumo";
              const colBg = isTotalCol
                ? "var(--bg-warn-subtle)"
                : isRoundCol
                  ? "var(--bg-success-subtle)"
                  : undefined;
              if (!rv)
                return (
                  <td
                    key={tKey}
                    colSpan={7}
                    className="cs-grp"
                    style={colBg ? { background: colBg } : undefined}
                  />
                );
              if (rv === "dns")
                return (
                  <td
                    key={tKey}
                    colSpan={7}
                    className="cs-grp"
                    style={colBg ? { background: colBg } : undefined}
                  >
                    <span className="muted fw-600 fs-11">NS</span>
                  </td>
                );
              return (
                <React.Fragment key={tKey}>
                  <td
                    className="cs-t-pos cs-grp"
                    style={colBg ? { background: colBg } : undefined}
                  >
                    {rv.pos}
                  </td>
                  <td
                    className="cs-t-gross cs-col"
                    style={colBg ? { background: colBg } : undefined}
                  >
                    {rv.gross}
                  </td>
                  <td
                    className="cs-t-topar cs-col"
                    style={{
                      color: tpColor(rv.toPar),
                      ...(colBg ? { background: colBg } : {}),
                    }}
                  >
                    {fmtTP(rv.toPar)}
                  </td>
                  <SDCell
                    sd={rv.sd18}
                    sdSource={rv.sdSource}
                    hcp={row.hcp}
                    nholes={rv.nholes}
                    style={{
                      ...(colBg ? { background: colBg } : {}),
                      borderLeft: "1px solid var(--border-light)",
                    }}
                  />
                  <td className="cs-t-stat cs-col" style={colBg ? { background: colBg } : undefined}>
                    {rv.birdies}
                  </td>
                  <td className="cs-t-stat cs-col" style={colBg ? { background: colBg } : undefined}>
                    {rv.pars}
                  </td>
                  <td className="cs-t-stat cs-col" style={colBg ? { background: colBg } : undefined}>
                    {rv.bogeys}
                  </td>
                </React.Fragment>
              );
            })}
            <td className="cs-s-games cs-grp">{row.jogos}</td>
            <td className="cs-s-pts cs-col">{row.totalPts > 0 ? row.totalPts : "–"}</td>
            <td className="cs-s-sd cs-col">
              {row.bestSD != null ? (
                <span className={"p p-sm p-" + sdClassByHcp(row.bestSD, row.hcp)}>
                  {row.bestSD.toFixed(1)}
                </span>
              ) : (
                "–"
              )}
            </td>
            <td className="cs-s-sd cs-col">
              {row.avgSD != null ? (
                <span className={"p p-sm p-" + sdClassByHcp(row.avgSD, row.hcp)}>
                  {row.avgSD.toFixed(1)}
                </span>
              ) : (
                "–"
              )}
            </td>
            <td className="cs-s-stat cs-col">{row.totalBird}</td>
            <td className="cs-s-stat cs-col">{row.totalPars}</td>
            <td className="cs-s-stat cs-col">{row.totalBog}</td>
          </tr>
        );
      })}
    </CrossSeasonTable>
  );
}
