/**
 * kids2/components/HistoryByTournament.tsx
 *
 * Histórico de séries (torneios que se repetem) com evolução visual:
 *   • Sparkline horizontal de posições ao longo dos anos
 *   • Cada edição é um ponto colorido (ouro/prata/bronze para top-3)
 *   • Trend pill (dono / a subir / a piorar / consistente)
 *
 * Lista limitada a TOP_SERIES; resto colapsado em "ver mais". Edições únicas
 * (séries de 1 edição) ficam separadas no fim, em formato compacto.
 */

import React, { useMemo, useState } from "react";
import type { CanonicalData, Junior, Tournament, Flight, Result } from "../data";

interface Props {
  data: CanonicalData;
  junior: Junior;
  filterTids?: Set<string> | null;
}

interface Edition {
  tournament: Tournament;
  flight: Flight;
  result: Result;
}

const TOP_SERIES_DEFAULT = 8;

export default function HistoryByTournament({ data, junior, filterTids }: Props) {
  const [showAllSeries, setShowAllSeries] = useState(false);
  const [showAllOneOffs, setShowAllOneOffs] = useState(false);

  const { multiSeries, oneOffs, totalWins } = useMemo(() => {
    const bySeries = new Map<string, Edition[]>();
    const singles: Edition[] = [];

    for (const tid of junior.tournamentIds) {
      if (filterTids && !filterTids.has(tid)) continue;
      const t = data.tournamentById.get(tid);
      if (!t) continue;
      let flight: Flight | null = null;
      let result: Result | null = null;
      for (const f of t.flights) {
        const r = f.results.find((x) => x.juniorId === junior.id);
        if (r) { flight = f; result = r; break; }
      }
      if (!flight || !result) continue;
      const ed: Edition = { tournament: t, flight, result };
      if (t.seriesId) {
        let arr = bySeries.get(t.seriesId);
        if (!arr) { arr = []; bySeries.set(t.seriesId, arr); }
        arr.push(ed);
      } else {
        singles.push(ed);
      }
    }

    const ms: Array<{ seriesId: string; editions: Edition[]; label: string; score: number }> = [];
    const oo: Edition[] = [...singles];
    for (const [sid, eds] of bySeries) {
      if (eds.length >= 2) {
        eds.sort((a, b) => (a.tournament.date || "").localeCompare(b.tournament.date || ""));
        const label = data.seriesById.get(sid)?.label || eds[0].tournament.seriesLabel || sid;
        const wins = eds.filter((e) => e.result.pos === 1).length;
        const podiums = eds.filter((e) => typeof e.result.pos === "number" && e.result.pos <= 3).length;
        const score = eds.length * 10 + wins * 50 + podiums * 5;
        ms.push({ seriesId: sid, editions: eds, label, score });
      } else {
        oo.push(...eds);
      }
    }
    ms.sort((a, b) => b.score - a.score);

    let wins = 0;
    for (const tid of junior.tournamentIds) {
      const t = data.tournamentById.get(tid);
      if (!t) continue;
      for (const f of t.flights) {
        const r = f.results.find((x) => x.juniorId === junior.id);
        if (r?.pos === 1) wins++;
      }
    }

    return { multiSeries: ms, oneOffs: oo, totalWins: wins };
  }, [data, junior, filterTids]);

  if (multiSeries.length === 0 && oneOffs.length === 0) return null;

  const displayedSeries = showAllSeries ? multiSeries : multiSeries.slice(0, TOP_SERIES_DEFAULT);
  const hiddenSeriesCount = multiSeries.length - displayedSeries.length;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "8px 0 10px" }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Histórico por torneio</h3>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>
          {multiSeries.length} {multiSeries.length === 1 ? "série recorrente" : "séries recorrentes"} · {totalWins} vitórias totais
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {displayedSeries.map((s) => (
          <SeriesRow key={s.seriesId} label={s.label} editions={s.editions} />
        ))}
      </div>

      {hiddenSeriesCount > 0 && (
        <button
          onClick={() => setShowAllSeries(true)}
          style={{
            marginTop: 8,
            width: "100%",
            padding: "6px 10px",
            fontSize: 12,
            background: "var(--bg-muted)",
            border: "1px solid var(--border-light)",
            borderRadius: 6,
            color: "var(--text-2)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Ver mais {hiddenSeriesCount} {hiddenSeriesCount === 1 ? "série" : "séries"} →
        </button>
      )}

      {oneOffs.length > 0 && (
        <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--bg-muted)", border: "1px solid var(--border-light)", borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Edições únicas · {oneOffs.length}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(showAllOneOffs ? oneOffs : oneOffs.slice(0, 16))
              .slice()
              .sort((a, b) => (b.tournament.date || "").localeCompare(a.tournament.date || ""))
              .map((ed, i) => (
                <OneOffPill key={i} ed={ed} />
              ))}
            {!showAllOneOffs && oneOffs.length > 16 && (
              <button
                onClick={() => setShowAllOneOffs(true)}
                style={{
                  fontSize: 11,
                  padding: "3px 9px",
                  border: "1px solid var(--border-light)",
                  borderRadius: 999,
                  background: "var(--bg)",
                  color: "var(--text-2)",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                +{oneOffs.length - 16} →
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function SeriesRow({ label, editions }: { label: string; editions: Edition[] }) {
  const [expanded, setExpanded] = useState(false);
  const wins = editions.filter((e) => e.result.pos === 1).length;
  const podiums = editions.filter((e) => typeof e.result.pos === "number" && e.result.pos <= 3).length;
  const last = editions[editions.length - 1];
  const lastPos = last?.result.pos;
  const trend = computeSeriesTrend(editions);

  return (
    <div style={{
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      overflow: "hidden",
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 12px",
          gap: 10,
          cursor: "pointer",
          background: expanded ? "var(--bg-muted)" : "transparent",
          borderBottom: expanded ? "1px solid var(--border-light)" : "none",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0, width: 12 }}>
          {expanded ? "▼" : "▶"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {label}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 1 }}>
            {editions.length} {editions.length === 1 ? "edição" : "edições"}
            {wins > 0 && <> · <span style={{ color: "var(--color-warn-dark, #92400e)", fontWeight: 700 }}>🏆 {wins}</span></>}
            {podiums > wins && <> · {podiums} pódios</>}
            {fmtYearRange(editions)}
          </div>
        </div>
        <Sparkline editions={editions} />
        <div style={{ flexShrink: 0, minWidth: 50, textAlign: "right" }}>
          <PosBadge pos={lastPos} />
          <div style={{ fontSize: 9, color: "var(--text-3)", marginTop: 1 }}>{fmtYear(last?.tournament.date)}</div>
        </div>
        {trend && (
          <span style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 10, fontWeight: 700,
            background: trend.bg, color: trend.fg, border: `1px solid ${trend.fg}`,
            whiteSpace: "nowrap", flexShrink: 0,
          }} title={trend.title}>
            {trend.icon} {trend.label}
          </span>
        )}
      </div>

      {expanded && (
        <div style={{ padding: "8px 12px" }}>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ color: "var(--text-3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3 }}>
                <th style={tdH}>Ano</th>
                <th style={tdH}>Escalão</th>
                <th style={{ ...tdH, textAlign: "center" }}>Pos</th>
                <th style={{ ...tdH, textAlign: "right" }}>Rondas</th>
                <th style={{ ...tdH, textAlign: "right" }}>±par</th>
              </tr>
            </thead>
            <tbody>
              {editions.slice().reverse().map((ed, i) => {
                const parTotal = ed.flight.par?.reduce((a, b) => a + (b || 0), 0) || ed.tournament.parTotal;
                const rounds = ed.result.rounds || [];
                const grosses = rounds.map((r) => r.gross).filter((g): g is number => typeof g === "number");
                const total = ed.result.totalGross ?? (grosses.length ? grosses.reduce((a, b) => a + b, 0) : null);
                const toPar = ed.result.toPar ?? (total != null && parTotal && rounds.length ? total - parTotal * rounds.length : null);
                return (
                  <tr key={i} style={{ borderTop: "1px solid var(--border-light)" }}>
                    <td style={tdC}>{fmtYear(ed.tournament.date)}</td>
                    <td style={{ ...tdC, color: "var(--text-3)" }}>{ed.flight.label}</td>
                    <td style={{ ...tdC, textAlign: "center" }}><PosBadge pos={ed.result.pos} /></td>
                    <td style={{ ...tdC, textAlign: "right" }}>
                      {grosses.length ? grosses.join("·") : total ?? "—"}
                      {total != null && grosses.length > 1 && <span style={{ color: "var(--text-3)", marginLeft: 4 }}>({total})</span>}
                    </td>
                    <td style={{ ...tdC, textAlign: "right", color: toPar != null && toPar < 0 ? "var(--color-good-dark)" : toPar != null && toPar > 0 ? "var(--color-danger-dark)" : "var(--text-3)", fontWeight: toPar != null && toPar !== 0 ? 700 : 400 }}>
                      {toPar == null ? "—" : toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : String(toPar)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const tdH: React.CSSProperties = { padding: "4px 6px", textAlign: "left", fontWeight: 600 };
const tdC: React.CSSProperties = { padding: "5px 6px", textAlign: "left" };

function Sparkline({ editions }: { editions: Edition[] }) {
  const positions = editions.map((e) => (typeof e.result.pos === "number" ? e.result.pos : null));
  const validPositions = positions.filter((p): p is number => p !== null);
  if (validPositions.length === 0) {
    return <div style={{ width: 120, fontSize: 10, color: "var(--text-3)", textAlign: "center" }}>—</div>;
  }
  const maxPos = Math.max(...validPositions, 10);
  const w = 140;
  const h = 22;
  const padX = 4;
  const padY = 3;
  const usableW = w - padX * 2;
  const usableH = h - padY * 2;

  const pts = positions.map((p, i) => {
    const x = padX + (positions.length === 1 ? usableW / 2 : (i / (positions.length - 1)) * usableW);
    const y = p == null ? null : padY + Math.min(usableH, ((p - 1) / Math.max(1, maxPos - 1)) * usableH);
    return { x, y, pos: p, ed: editions[i] };
  });

  let path = "";
  let pathStarted = false;
  for (const pt of pts) {
    if (pt.y === null) continue;
    if (!pathStarted) {
      path += `M ${pt.x} ${pt.y}`;
      pathStarted = true;
    } else {
      path += ` L ${pt.x} ${pt.y}`;
    }
  }

  return (
    <svg width={w} height={h} style={{ flexShrink: 0 }}>
      <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} stroke="var(--border-light)" strokeWidth={1} />
      {path && <path d={path} stroke="var(--text-3)" strokeWidth={1.5} fill="none" opacity={0.6} />}
      {pts.map((pt, i) => {
        if (pt.y === null) return null;
        const color = pt.pos === 1 ? "#BA7517" : pt.pos === 2 ? "#7A7873" : pt.pos === 3 ? "#993C1D" : "var(--text-2)";
        return (
          <circle key={i} cx={pt.x} cy={pt.y} r={pt.pos && pt.pos <= 3 ? 4 : 3} fill={color}>
            <title>{fmtYear(pt.ed.tournament.date)}: #{pt.pos}</title>
          </circle>
        );
      })}
    </svg>
  );
}

function OneOffPill({ ed }: { ed: Edition }) {
  const pos = ed.result.pos;
  const isTop3 = typeof pos === "number" && pos <= 3;
  return (
    <span style={{
      fontSize: 11,
      padding: "3px 9px",
      borderRadius: 999,
      background: "var(--bg)",
      border: `1px solid ${isTop3 ? trophyColor(pos) : "var(--border-light)"}`,
      color: "var(--text-2)",
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
    }} title={`${ed.tournament.name || ""} · ${ed.flight.label}`}>
      <span style={{ color: "var(--text-3)", fontSize: 10 }}>{fmtYear(ed.tournament.date)}</span>
      <span style={{ fontWeight: 600 }}>{shorten(ed.tournament.name || "")}</span>
      <PosBadge pos={pos} small />
    </span>
  );
}

function PosBadge({ pos, small }: { pos: number | null | undefined; small?: boolean }) {
  if (typeof pos !== "number") return <span style={{ fontSize: small ? 10 : 11, color: "var(--text-3)" }}>—</span>;
  if (pos <= 3) {
    const bg = pos === 1 ? "#FAEEDA" : pos === 2 ? "#D3D1C7" : "#F5C4B3";
    const fg = pos === 1 ? "#854F0B" : pos === 2 ? "#2C2C2A" : "#993C1D";
    return (
      <span style={{
        background: bg,
        color: fg,
        fontWeight: 700,
        padding: small ? "1px 5px" : "2px 6px",
        borderRadius: 4,
        fontSize: small ? 10 : 11,
      }}>🏆 #{pos}</span>
    );
  }
  return <span style={{ fontSize: small ? 10 : 11, color: "var(--text-3)", fontWeight: 600 }}>#{pos}</span>;
}

function trophyColor(pos: number | null | undefined): string {
  if (pos === 1) return "#BA7517";
  if (pos === 2) return "#7A7873";
  if (pos === 3) return "#993C1D";
  return "var(--border)";
}

function fmtYear(iso: string | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 4);
}

function fmtYearRange(editions: Edition[]): React.ReactNode {
  if (editions.length === 0) return null;
  const yrs = editions.map((e) => fmtYear(e.tournament.date)).filter((y) => y !== "—");
  if (yrs.length === 0) return null;
  const first = yrs[0];
  const last = yrs[yrs.length - 1];
  if (first === last) return <> · {first}</>;
  return <> · {first}–{last}</>;
}

function shorten(s: string): string {
  return s.replace(/\b20\d{2}\b/g, "").replace(/\s+/g, " ").trim().slice(0, 28);
}

interface SeriesTrend {
  label: string;
  icon: string;
  bg: string;
  fg: string;
  title: string;
}

function computeSeriesTrend(editions: Edition[]): SeriesTrend | null {
  if (editions.length < 2) return null;
  const positions = editions.map((e) => (typeof e.result.pos === "number" ? e.result.pos : null));
  const validPos = positions.filter((p): p is number => p !== null);
  if (validPos.length < 2) return null;

  const tail2 = positions.slice(-2);
  const wins = validPos.filter((p) => p === 1).length;
  if (tail2.every((p) => p === 1)) {
    return { label: "dono", icon: "👑", bg: "var(--bg-warn-subtle, #fffbeb)", fg: "var(--color-warn-dark, #92400e)", title: "Última(s) edição(ões) ganhou — dono da série" };
  }
  if (wins >= 3 && wins / validPos.length >= 0.6) {
    return { label: "dono", icon: "👑", bg: "var(--bg-warn-subtle, #fffbeb)", fg: "var(--color-warn-dark, #92400e)", title: `${wins} vitórias em ${validPos.length} edições` };
  }

  if (validPos.length >= 3) {
    const last = validPos[validPos.length - 1];
    const prev = validPos.slice(0, -1);
    const avgPrev = prev.reduce((a, b) => a + b, 0) / prev.length;
    if (last <= 3 && last < avgPrev - 5) {
      return { label: `recuperou`, icon: "↗️", bg: "var(--bg-success-subtle, #ecfdf5)", fg: "var(--color-good-dark)", title: `Última edição #${last} — média anterior #${avgPrev.toFixed(0)}` };
    }
  }

  const half = Math.floor(validPos.length / 2);
  if (half >= 1) {
    const firstHalf = validPos.slice(0, half);
    const secondHalf = validPos.slice(-half);
    const avg1 = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avg2 = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const delta = avg2 - avg1;
    if (delta < -3) {
      return { label: "a subir", icon: "▲", bg: "var(--bg-success-subtle, #ecfdf5)", fg: "var(--color-good-dark)", title: `Posição melhorou de média #${avg1.toFixed(0)} para #${avg2.toFixed(0)}` };
    }
    if (delta > 3) {
      return { label: "a piorar", icon: "▼", bg: "var(--bg-warn-subtle, #fffbeb)", fg: "var(--color-warn-dark, #92400e)", title: `Posição piorou de média #${avg1.toFixed(0)} para #${avg2.toFixed(0)}` };
    }
  }

  if (validPos.every((p) => p <= 10)) {
    return { label: "consistente", icon: "●", bg: "var(--bg-info-subtle, #eff6ff)", fg: "var(--color-info-dark, #1e3a8a)", title: "Sempre em top-10 nesta série" };
  }

  return null;
}
