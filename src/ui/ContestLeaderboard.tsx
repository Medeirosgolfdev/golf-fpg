/**
 * ContestLeaderboard — Contest results table with round-by-round scorecards
 */
import { useState } from "react";
import { fmtToPar } from "../utils/format";
import { scClass } from "../utils/scoreDisplay";
import { flag } from "../utils/flagUtils";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";
import EvoBadge from "./EvoBadge";
import TabRow from "./TabRow";
import { RoundPill } from "./PillBadge";
import { tpColor } from "./tournamentPrimitives";
import { SC } from "../utils/scoreDisplay";

export interface ContestData {
  label: string;
  parArr: number[];
  par: number;
  nRounds: number;
  players: ContestPlayer[];
}

export interface ContestPlayer {
  n: string; // name
  co: string; // country (ISO-2 / EN / PT name)
  fl?: string; // flag emoji (legacy; render derives from `co` via flag())
  isM?: boolean; // is Manuel
  p: number | string; // position
  t: number; // total gross
  tp: number; // to par
  rd: RoundData[]; // rounds
}

export interface RoundData {
  g: number; // gross
  s?: number[]; // scores (18 holes)
}

export interface EvoEntry {
  n: string; // name
  y25: number; // 2025 score
  y26: number; // 2026 score
  delta: number; // difference
  from: string; // from course name
  to: string; // to course name
  pill?: string; // badge pill
}

interface ContestLeaderboardProps {
  contest: ContestData;
  evo?: EvoEntry[];
}

export default function ContestLeaderboard({
  contest,
  evo,
}: ContestLeaderboardProps) {
  const [roundTab, setRoundTab] = useState<number>(0); // 0=accumulated, 1,2,3=rounds
  // Accumulated-view sort: "pos" (default) keeps the position order; "n"/"tot"/"tp"
  // plus per-round keys ("r0", "r1", …) sort by the respective column.
  const { sortKey, sortDir, toggleSort } = useSort<string>("pos");
  const par = contest.parArr;
  const parF = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const parB = par.slice(9).reduce((a, b) => a + b, 0);
  const parT = contest.par;
  const players = contest.players.filter(p => p.rd.length > 0);
  const nR = contest.nRounds;
  const fieldAvg =
    players.length > 0
      ? players.filter(p => p.rd.length === nR).reduce((s, p) => s + p.t, 0) /
        players.filter(p => p.rd.length === nR).length
      : 0;
  const leader = players[0];
  const manuel = players.find(p => p.isM);

  // For round-specific view, sort by that round's gross
  const sortedForRound =
    roundTab > 0
      ? [...players]
          .filter(p => p.rd[roundTab - 1])
          .sort(
            (a, b) =>
              (a.rd[roundTab - 1]?.g ?? 999) - (b.rd[roundTab - 1]?.g ?? 999)
          )
      : players;

  // Accumulated view: sortable by header (default "pos" preserves position order).
  const accSorted = (() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (p: ContestPlayer, idx: number): number | string => {
      if (sortKey === "pos") return idx; // preserve original (position) order
      if (sortKey === "n") return p.n.toLowerCase();
      if (sortKey === "tot") return p.t;
      if (sortKey === "tp") return p.tp;
      if (sortKey.startsWith("r")) return p.rd[Number(sortKey.slice(1))]?.g ?? Infinity;
      return idx;
    };
    return players
      .map((p, idx) => ({ p, idx }))
      .sort((a, b) => {
        const va = val(a.p, a.idx);
        const vb = val(b.p, b.idx);
        if (typeof va === "string" || typeof vb === "string") {
          return String(va).localeCompare(String(vb)) * dir || a.idx - b.idx;
        }
        return (va - vb) * dir || a.idx - b.idx;
      })
      .map(x => x.p);
  })();

  const hasScores = (ri: number) =>
    players.some(p => (p.rd[ri]?.s?.length ?? 0) > 0);

  return (
    <>
      {/* Sub-tabs: Accumulated + per-round */}
      <TabRow
        tabs={[
          { key: 0, label: "Acumulado" },
          ...Array.from({ length: nR }, (_, i) => ({
            key: i + 1,
            label: `R${i + 1}`,
          })),
        ]}
        active={roundTab}
        onChange={setRoundTab}
      />

      {/* Meta */}
      <div className="muted fs-10 mb-8">
        {players.filter(p => p.rd.length === nR).length} jogadores
        {nR > 1 && (
          <>
            {" "}
            · <RoundPill nR={nR} />
          </>
        )}{" "}
        · Par {parT}
        {roundTab === 0 && (
          <>
            {" "}
            · Média: {fieldAvg.toFixed(1)} ({fmtToPar(
              Math.round(fieldAvg - parT * nR)
            )}) · Líder: {leader?.n} ({leader?.t})
          </>
        )}
      </div>

      {/* ── ACCUMULATED VIEW ── */}
      {roundTab === 0 && (
        <div className="card">
          <div className="h-md fs-14">🏆 Leaderboard — {contest.label}</div>
          <div className="tourn-scroll">
            <table className="dtable-lg">
              <thead>
                <tr>
                  <SortableHdr k="pos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="col-w30">
                    #
                  </SortableHdr>
                  <SortableHdr k="n" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="ta-left" style={{ minWidth: 120 }}>
                    Jogador
                  </SortableHdr>
                  {Array.from({ length: nR }, (_, i) => (
                    <SortableHdr key={i} k={`r${i}`} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r w-40">
                      R{i + 1}
                    </SortableHdr>
                  ))}
                  <SortableHdr k="tot" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r col-w50 fw-700">
                    Tot
                  </SortableHdr>
                  <SortableHdr k="tp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="r w-40">
                    ±Par
                  </SortableHdr>
                </tr>
              </thead>
              <tbody>
                {accSorted.map((p, idx) => {
                  const isM = p.isM;
                  const isWD = typeof p.p !== "number";
                  // Only dedupe repeated position labels when rows are in position order.
                  const prevP = idx > 0 ? accSorted[idx - 1].p : null;
                  const showPos = sortKey !== "pos" || p.p !== prevP;
                  return (
                    <tr
                      key={idx}
                      style={{
                        background: isM ? "var(--bg-success-subtle)" : undefined,
                        opacity: isWD ? 0.5 : 1,
                      }}
                    >
                      <td
                        className="fw-800"
                        style={{
                          color:
                            typeof p.p === "number" && p.p <= 3
                              ? "var(--color-warn-dark)"
                              : "var(--text-3)",
                        }}
                      >
                        {showPos ? (isWD ? "WD" : p.p) : ""}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {flag(p.co)}{" "}
                        <span className={isM ? "fw-800" : "fw-600"}>
                          {p.n}
                        </span>
                      </td>
                      {Array.from({ length: nR }, (_, i) => (
                        <td key={i} className="r mono">
                          {p.rd[i]?.g ?? "–"}
                        </td>
                      ))}
                      <td className="r fw-800 mono">{p.t}</td>
                      <td className="r fw-700" style={{ color: tpColor(p.tp) }}>
                        {isWD ? "–" : fmtToPar(p.tp)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PER-ROUND SCORECARD VIEW ── */}
      {roundTab > 0 && (
        <div className="card">
          <div className="h-md fs-14">📋 Round {roundTab} — Scorecards</div>
          {!hasScores(roundTab - 1) ? (
            <div className="muted fs-12" style={{ padding: 16 }}>
              Scores buraco a buraco não disponíveis para esta ronda (apenas
              totais).
            </div>
          ) : (
            <div className="bjgt-chart-scroll">
              <table className="sc-table-modern" data-sc-table="1">
                <thead>
                  <tr>
                    <th
                      className="hole-header ta-c"
                      style={{ width: 30 }}
                    >
                      Pos
                    </th>
                    <th className="hole-header ta-left">Jogador</th>
                    <th className="hole-header col-total" style={{ width: 32 }}>
                      Tot
                    </th>
                    <th className="hole-header" style={{ width: 32 }}>
                      ±Par
                    </th>
                    {par.slice(0, 9).map((_, i) => (
                      <th key={i} className="hole-header">
                        {i + 1}
                      </th>
                    ))}
                    <th className="hole-header col-out">OUT</th>
                    {par.slice(9).map((_, i) => (
                      <th key={i} className="hole-header">
                        {i + 10}
                      </th>
                    ))}
                    <th className="hole-header col-in">IN</th>
                  </tr>
                  <tr className="meta-row">
                    <td colSpan={2} className="row-label c-muted fs-10">
                      Par
                    </td>
                    <td className="col-total">{parT}</td>
                    <td></td>
                    {par.slice(0, 9).map((p, i) => (
                      <td key={i}>{p}</td>
                    ))}
                    <td className="col-out fw-600">{parF}</td>
                    {par.slice(9).map((p, i) => (
                      <td key={i}>{p}</td>
                    ))}
                    <td className="col-in fw-600">{parB}</td>
                  </tr>
                </thead>
                <tbody>
                  {sortedForRound
                    .filter(p => (p.rd[roundTab - 1]?.s?.length ?? 0) > 0)
                    .map((p, idx) => {
                      const rd = p.rd[roundTab - 1];
                      const s = rd.s ?? [];
                      const f9 = s
                        .slice(0, 9)
                        .reduce((a: number, b: number) => a + b, 0);
                      const b9 = s
                        .slice(9)
                        .reduce((a: number, b: number) => a + b, 0);
                      const tp = rd.g - parT;
                      const isM = p.isM;
                      return (
                        <tr
                          key={idx}
                          style={{
                            background: isM
                              ? "var(--bg-success-subtle)"
                              : undefined,
                          }}
                        >
                          <td
                            className="fw-700 ta-c"
                            style={{
                              color:
                                idx < 3
                                  ? "var(--color-warn-dark)"
                                  : "var(--text-3)",
                            }}
                          >
                            {idx + 1}
                          </td>
                          <td
                            className="row-label fw-700"
                            style={{ whiteSpace: "nowrap" }}
                          >
                            {flag(p.co)} {p.n}
                          </td>
                          <td className="col-total">{rd.g}</td>
                          <td className="fw-700" style={{ color: tpColor(tp) }}>
                            {fmtToPar(tp)}
                          </td>
                          {s.slice(0, 9).map((sc: number, i: number) => (
                            <td key={i}>
                              <span
                                className={`sc-score ${scClass(
                                  sc,
                                  par[i]
                                )}`}
                              >
                                {sc}
                              </span>
                            </td>
                          ))}
                          <td className="col-out fw-600">{f9}</td>
                          {s.slice(9).map((sc: number, i: number) => (
                            <td key={i}>
                              <span
                                className={`sc-score ${scClass(
                                  sc,
                                  par[9 + i]
                                )}`}
                              >
                                {sc}
                              </span>
                            </td>
                          ))}
                          <td className="col-in fw-600">{b9}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Manuel highlight (if in this contest) ── */}
      {manuel && evo && evo.length > 0 && roundTab === 0 && (() => {
        const mEvo = evo.find(e => e.n.includes("Manuel"));
        if (!mEvo) return null;
        return (
          <div
            className="card"
            style={{
              background: "var(--bg-success-subtle)",
              border: "1px solid var(--good)",
            }}
          >
            <div className="h-md fs-14">🇵🇹 Manuel — Evolução WJGC</div>
            <div
              className="d-flex"
              style={{
                gap: 16,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div className="ta-c" style={{ flex: "1 1 100px" }}>
                <div className="muted fs-10">2025</div>
                <div className="fw-900 fs-24">{mEvo.y25}</div>
                <div className="muted fs-10">{mEvo.from}</div>
              </div>
              <div className="fs-24" style={{ color: "var(--good-dark)" }}>
                →
              </div>
              <div className="ta-c" style={{ flex: "1 1 100px" }}>
                <div className="muted fs-10">2026</div>
                <div
                  className="fw-900 fs-24"
                  style={{
                    color:
                      mEvo.delta < 0
                        ? "var(--good-dark)"
                        : "var(--text-3)",
                  }}
                >
                  {mEvo.y26}
                </div>
                <div className="muted fs-10">{mEvo.to}</div>
              </div>
              <div className="ta-c" style={{ flex: "1 1 80px" }}>
                <div className="muted fs-10">Δ</div>
                <div
                  className="fw-900 fs-24"
                  style={{
                    color:
                      mEvo.delta < 0
                        ? "var(--good-dark)"
                        : SC.danger,
                  }}
                >
                  {mEvo.delta > 0 ? "+" : ""}
                  {mEvo.delta}
                </div>
                <div className="muted fs-10">pancadas</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Cross-year evolution table ── */}
      {evo && evo.length > 0 && roundTab === 0 && (
        <div className="card">
          <div className="h-md fs-14">📈 Evolução 2025 → 2026</div>
          <div className="muted fs-10 mb-8">{evo.length} jogadores em ambas as edições</div>
          <div className="tourn-scroll">
            <table className="dtable-lg">
              <thead>
                <tr>
                  <th className="ta-left" style={{ minWidth: 120 }}>
                    Jogador
                  </th>
                  <th className="r col-w55">2025</th>
                  <th className="r col-w55">2026</th>
                  <th className="r col-w45">Δ</th>
                  <th className="col-w70">Percurso</th>
                </tr>
              </thead>
              <tbody>
                {evo.map((e, idx) => {
                  const isM = e.n.includes("Manuel");
                  return (
                    <tr
                      key={idx}
                      style={{
                        background: isM
                          ? "var(--bg-success-subtle)"
                          : undefined,
                      }}
                    >
                      <td
                        className={isM ? "fw-800" : "fw-600"}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        {e.n}
                      </td>
                      <td className="r mono">{e.y25}</td>
                      <td className="r mono">{e.y26}</td>
                      <td
                        className="r fw-700"
                        style={{
                          color:
                            e.delta < 0
                              ? "var(--good-dark)"
                              : e.delta > 0
                                ? SC.danger
                                : "var(--text-3)",
                        }}
                      >
                        {e.delta > 0 ? "+" : ""}
                        {e.delta}
                      </td>
                      <td>
                        <EvoBadge
                          pill={e.pill as "UP" | "EQ" | "NEW"}
                          from={e.from}
                          to={e.to}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
