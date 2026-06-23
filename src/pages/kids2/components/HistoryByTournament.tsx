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
import { useSort } from "../../../hooks/useSort";
import SortableHdr from "../../../ui/SortableHdr";
import { getTournWeight, formatStars } from "../tournWeight";
import { categorizeTournamentLinks } from "../tournamentLinks";
import { tpColor } from "../../../ui/tournamentPrimitives";
import { fmtToPar } from "../../../utils/format";

type EdSortKey = "year" | "flight" | "pos" | "rounds" | "toPar" | "topPct";

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

    const ms: Array<{ seriesId: string; editions: Edition[]; label: string; score: number; stars: number }> = [];
    const oo: Edition[] = [...singles];
    for (const [sid, eds] of bySeries) {
      if (eds.length >= 2) {
        eds.sort((a, b) => (a.tournament.date || "").localeCompare(b.tournament.date || ""));
        const label = data.seriesById.get(sid)?.label || eds[0].tournament.seriesLabel || sid;
        const wins = eds.filter((e) => e.result.pos === 1).length;
        const podiums = eds.filter((e) => typeof e.result.pos === "number" && e.result.pos <= 3).length;
        // Usar peso da edição mais recente como representativo da série.
        // Score: estrelas dominam (★ = 1000pts), depois vitórias/pódios/frequência.
        const lastEd = eds[eds.length - 1];
        const lastFlight = lastEd.flight;
        const lastFlightFs = typeof lastFlight.fieldSize === "number" && lastFlight.fieldSize > 0 ? lastFlight.fieldSize : lastFlight.results.length;
        const stars = getTournWeight(lastEd.tournament, lastFlightFs).stars;
        const score = stars * 1000 + wins * 50 + podiums * 5 + eds.length;
        ms.push({ seriesId: sid, editions: eds, label, score, stars });
      } else {
        oo.push(...eds);
      }
    }
    // Ordenar séries: estrelas desc, depois score composto desc
    ms.sort((a, b) => {
      if (b.stars !== a.stars) return b.stars - a.stars;
      return b.score - a.score;
    });

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
        <h3 style={{ margin: 0, fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--text)" }}>Histórico por torneio</h3>
        <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
          {multiSeries.length} {multiSeries.length === 1 ? "série recorrente" : "séries recorrentes"} · {totalWins} vitórias totais
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {displayedSeries.map((s) => (
          <SeriesRow key={s.seriesId} label={s.label} editions={s.editions} data={data} />
        ))}
      </div>

      {hiddenSeriesCount > 0 && (
        <button
          onClick={() => setShowAllSeries(true)}
          style={{
            marginTop: 8,
            width: "100%",
            padding: "6px 10px",
            fontSize: "var(--fs-12)",
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
          <div style={{ fontSize: "var(--fs-11)", color: "var(--text-3)", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
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
                  fontSize: "var(--fs-11)",
                  padding: "3px 9px",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius)",
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

function SeriesRow({ label, editions, data }: { label: string; editions: Edition[]; data: CanonicalData }) {
  const manuel = data.manuel;
  const [expanded, setExpanded] = useState(false);
  const { sortKey, sortDir, toggleSort } = useSort<EdSortKey>("year", "desc", {
    year: "desc", flight: "asc", pos: "asc", rounds: "asc", toPar: "asc", topPct: "asc",
  });
  const wins = editions.filter((e) => e.result.pos === 1).length;
  const podiums = editions.filter((e) => typeof e.result.pos === "number" && e.result.pos <= 3).length;
  const last = editions[editions.length - 1];
  const lastPos = last?.result.pos;
  const trend = computeSeriesTrend(editions);

  // Prestígio da série — usa o peso da edição mais recente (representativa)
  const tournWeight = useMemo(() => {
    const fs = typeof last.flight.fieldSize === "number" && last.flight.fieldSize > 0 ? last.flight.fieldSize : last.flight.results.length;
    return getTournWeight(last.tournament, fs);
  }, [last.tournament, last.flight]);

  const sortedEditions = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    const getVal = (ed: Edition, key: EdSortKey): string | number => {
      const parTotal = ed.flight.par?.reduce((a, b) => a + (b || 0), 0) || ed.tournament.parTotal;
      const rounds = ed.result.rounds || [];
      const grosses = rounds.map((r) => r.gross).filter((g): g is number => typeof g === "number");
      const total = ed.result.totalGross ?? (grosses.length ? grosses.reduce((a, b) => a + b, 0) : null);
      const toPar = ed.result.toPar ?? (total != null && parTotal && rounds.length ? total - parTotal * rounds.length : null);
      switch (key) {
        case "year": return ed.tournament.date || "";
        case "flight": return (ed.flight.label || "").toLowerCase();
        case "pos": return typeof ed.result.pos === "number" ? ed.result.pos : Number.POSITIVE_INFINITY;
        case "rounds": return total ?? Number.POSITIVE_INFINITY;
        case "toPar": return toPar ?? Number.POSITIVE_INFINITY;
        case "topPct": {
          const pos = ed.result.pos;
          const fs = ed.flight.fieldSize ?? null;
          if (typeof pos !== "number" || !fs || fs <= 0) return Number.POSITIVE_INFINITY;
          return pos / fs;
        }
      }
    };
    return [...editions].sort((a, b) => {
      const va = getVal(a, sortKey);
      const vb = getVal(b, sortKey);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * mul;
      return String(va).localeCompare(String(vb)) * mul;
    });
  }, [editions, sortKey, sortDir]);

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
        <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)", flexShrink: 0, width: 12 }}>
          {expanded ? "▼" : "▶"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", flexWrap: "wrap" }}>
            <div style={{ fontSize: "var(--fs-13)", fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {label}
            </div>
            <span
              title={`Prestígio: ${tournWeight.stars}/5 · rondas ${tournWeight.parts.rounds.toFixed(2)} · field ${tournWeight.parts.field.toFixed(2)}${tournWeight.parts.nations != null ? ` · nações ${tournWeight.parts.nations.toFixed(2)}` : " · (sem nationsCount)"}`}
              style={{
                fontSize: "var(--fs-11)", letterSpacing: 0.5, color: "var(--medal-gold-strong)", flexShrink: 0,
              }}
            >
              {formatStars(tournWeight.stars)}
            </span>
            <SeriesScoringPill tournament={last.tournament} />
            <SeriesNineHolesPill tournament={last.tournament} flight={last.flight} />
          </div>
          <div style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", marginTop: 1 }}>
            {editions.length} {editions.length === 1 ? "edição" : "edições"}
            {wins > 0 && <> · <span style={{ color: "var(--color-warn-dark, var(--color-warn-dark))", fontWeight: 700 }}>🏆 {wins}</span></>}
            {podiums > wins && <> · {podiums} pódios</>}
            {fmtYearRange(editions)}
          </div>
        </div>
        <Sparkline editions={editions} />
        <div style={{ flexShrink: 0, minWidth: 50, textAlign: "right" }}>
          <PosBadge pos={lastPos} />
          <div style={{ fontSize: "var(--fs-9)", color: "var(--text-3)", marginTop: 1 }}>{fmtYear(last?.tournament.date)}</div>
        </div>
        {trend && (
          <span style={{
            fontSize: "var(--fs-10)", padding: "2px 7px", borderRadius: 10, fontWeight: 700,
            background: trend.bg, color: trend.fg, border: `1px solid ${trend.fg}`,
            whiteSpace: "nowrap", flexShrink: 0,
          }} title={trend.title}>
            {trend.icon} {trend.label}
          </span>
        )}
      </div>

      {expanded && (
        <div style={{ padding: "8px 12px" }}>
          <table className="dtable-sm">
            <thead>
              <tr>
                <SortableHdr k="year" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Ano</SortableHdr>
                <SortableHdr k="flight" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Escalão</SortableHdr>
                <SortableHdr k="pos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "center" }}>Pos</SortableHdr>
                <SortableHdr k="topPct" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "center" }} title="Posição como percentil do field">Top%</SortableHdr>
                <SortableHdr k="rounds" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "right" }}>Rondas</SortableHdr>
                <SortableHdr k="toPar" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: "right" }}>±par</SortableHdr>
                {manuel && manuel.id !== editions[0]?.result.juniorId && <th style={{ textAlign: "center", width: 60 }} title="Posição do Manuel quando também jogou">M</th>}
                <th style={{ textAlign: "right" }}>↗</th>
              </tr>
            </thead>
            <tbody>
              {sortedEditions.map((ed, i) => {
                const parTotal = ed.flight.par?.reduce((a, b) => a + (b || 0), 0) || ed.tournament.parTotal;
                const rounds = ed.result.rounds || [];
                const grosses = rounds.map((r) => r.gross).filter((g): g is number => typeof g === "number");
                const total = ed.result.totalGross ?? (grosses.length ? grosses.reduce((a, b) => a + b, 0) : null);
                const toPar = ed.result.toPar ?? (total != null && parTotal && rounds.length ? total - parTotal * rounds.length : null);
                const fs = ed.flight.fieldSize ?? null;
                const topPct = typeof ed.result.pos === "number" && fs && fs > 0
                  ? Math.round((ed.result.pos / fs) * 100)
                  : null;
                // Só conta como "Manuel também esteve" se jogou no MESMO flight
                // (escalão) que o junior — escalões diferentes não são confronto.
                const manuelPos = manuel && manuel.id !== ed.result.juniorId
                  ? findManuelPosInFlight(ed.flight, manuel.id)
                  : null;
                const links = categorizeTournamentLinks(ed.tournament);
                return (
                  <tr key={i} style={{ borderTop: "1px solid var(--border-light)" }}>
                    <td style={tdC}>{fmtYear(ed.tournament.date)}</td>
                    <td style={{ ...tdC, color: "var(--text-3)" }}>{ed.flight.label}</td>
                    <td style={{ ...tdC, textAlign: "center" }}><PosBadge pos={ed.result.pos} /></td>
                    <td style={{ ...tdC, textAlign: "center", color: topPct != null ? (topPct <= 10 ? "var(--medal-gold-strong)" : topPct <= 25 ? "var(--text-2)" : "var(--text-3)") : "var(--text-3)" }}>
                      {topPct != null ? `${topPct}%` : "—"}
                    </td>
                    <td style={{ ...tdC, textAlign: "right" }}>
                      {grosses.length ? grosses.join("·") : total ?? "—"}
                      {total != null && grosses.length > 1 && <span style={{ color: "var(--text-3)", marginLeft: 4 }}>({total})</span>}
                    </td>
                    <td style={{ ...tdC, textAlign: "right", color: tpColor(toPar) ?? "var(--text-3)", fontWeight: toPar != null && toPar !== 0 ? 700 : 400 }}>
                      {fmtToPar(toPar)}
                    </td>
                    {manuel && manuel.id !== ed.result.juniorId && (
                      <td style={{ ...tdC, textAlign: "center" }}>
                        {manuelPos != null ? (
                          <span title={`Manuel ficou em #${manuelPos} neste torneio`} style={{
                            fontSize: "var(--fs-10)", padding: "1px 5px", borderRadius: 3,
                            background: "var(--bg-success-subtle, #ecfdf5)", color: "var(--color-good-dark)",
                            fontWeight: 700, border: "1px solid var(--color-good-dark)",
                            whiteSpace: "nowrap",
                          }}>★M #{manuelPos}</span>
                        ) : <span style={{ color: "var(--text-3)" }}>—</span>}
                      </td>
                    )}
                    <td style={{ ...tdC, textAlign: "right" }}>
                      <span style={{ display: "inline-flex", gap: 3, flexWrap: "nowrap" }}>
                        {links.map((l) => (
                          <a key={l.key + l.url} href={l.url} target="_blank" rel="noreferrer"
                            title={`Abrir em ${l.label}`}
                            style={{
                              fontSize: "var(--fs-9)", padding: "1px 4px", borderRadius: 3, fontWeight: 700,
                              color: `var(${l.colorVar})`, border: `1px solid var(${l.colorVar})`,
                              textDecoration: "none", lineHeight: 1.3, background: "var(--bg)",
                              whiteSpace: "nowrap",
                            }}
                          >{l.label}</a>
                        ))}
                      </span>
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
    return <div style={{ width: 120, fontSize: "var(--fs-10)", color: "var(--text-3)", textAlign: "center" }}>—</div>;
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
        const color = pt.pos === 1 ? "var(--medal-gold-strong)" : pt.pos === 2 ? "var(--medal-silver-strong)" : pt.pos === 3 ? "var(--medal-bronze-strong)" : "var(--text-2)";
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
      fontSize: "var(--fs-11)",
      padding: "3px 9px",
      borderRadius: "var(--radius)",
      background: "var(--bg)",
      border: `1px solid ${isTop3 ? trophyColor(pos) : "var(--border-light)"}`,
      color: "var(--text-2)",
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
    }} title={`${ed.tournament.name || ""} · ${ed.flight.label}`}>
      <span style={{ color: "var(--text-3)", fontSize: "var(--fs-10)" }}>{fmtYear(ed.tournament.date)}</span>
      <span style={{ fontWeight: 600 }}>{shorten(ed.tournament.name || "")}</span>
      <PosBadge pos={pos} small />
    </span>
  );
}

function PosBadge({ pos, small }: { pos: number | null | undefined; small?: boolean }) {
  if (typeof pos !== "number") return <span style={{ fontSize: small ? 10 : 11, color: "var(--text-3)" }}>—</span>;
  if (pos <= 3) {
    const bg = pos === 1 ? "var(--medal-gold-bg)" : pos === 2 ? "var(--medal-silver-bg)" : "var(--medal-bronze-bg)";
    const fg = pos === 1 ? "var(--medal-gold-fg)" : pos === 2 ? "var(--medal-silver-fg)" : "var(--medal-bronze-fg)";
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

/** Procura a posição do Manuel APENAS no flight indicado. Devolve null se não
 *  jogou nesse escalão (jogou em flight diferente = não é confronto). */
function findManuelPosInFlight(flight: Flight, manuelId: string): number | null {
  const r = flight.results.find((x) => x.juniorId === manuelId);
  if (r && typeof r.pos === "number") return r.pos;
  return null;
}

function trophyColor(pos: number | null | undefined): string {
  if (pos === 1) return "var(--medal-gold-strong)";
  if (pos === 2) return "var(--medal-silver-strong)";
  if (pos === 3) return "var(--medal-bronze-strong)";
  return "var(--border)";
}

/** Pill SCRATCH/HCP no header de uma série — usa o tournament.extra.scoringType
 *  da edição mais recente como representativo de toda a série. */
function SeriesScoringPill({ tournament }: { tournament: Tournament }) {
  const st = (tournament.extra as any)?.scoringType as string | undefined;
  if (!st) return null;
  const isScratch = /SCRATCH/i.test(st);
  return (
    <span title={isScratch ? "Competição scratch (gross)" : "Competição com handicap (net)"} style={{
      fontSize: "var(--fs-9)", padding: "1px 5px", borderRadius: 3, fontWeight: 700,
      background: isScratch ? "var(--bg-warn-subtle, var(--bg-warn))" : "var(--bg-info-subtle, var(--bg-info))",
      color: isScratch ? "var(--color-warn-dark, var(--color-warn-dark))" : "var(--color-info-dark, var(--color-navy))",
      border: `1px solid ${isScratch ? "var(--color-warn-dark, var(--color-warn-dark))" : "var(--color-info-dark, var(--color-navy))"}`,
      lineHeight: 1.4, flexShrink: 0,
    }}>
      {isScratch ? "SCRATCH" : "HCP"}
    </span>
  );
}

function SeriesNineHolesPill({ tournament, flight }: { tournament: Tournament; flight: Flight }) {
  const is9 = tournament.holesPerRound === 9 ||
    (Array.isArray(flight.par) && flight.par.filter((p) => p > 0).length === 9);
  if (!is9) return null;
  return (
    <span title="Torneio de 9 buracos" style={{
      fontSize: "var(--fs-9)", padding: "1px 5px", borderRadius: 3, fontWeight: 700,
      background: "var(--bg-muted)", color: "var(--text-2)",
      border: "1px solid var(--border-light)", lineHeight: 1.4, flexShrink: 0,
    }}>
      9H
    </span>
  );
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
    return { label: "dono", icon: "👑", bg: "var(--bg-warn-subtle, var(--bg-warn))", fg: "var(--color-warn-dark, var(--color-warn-dark))", title: "Última(s) edição(ões) ganhou — dono da série" };
  }
  if (wins >= 3 && wins / validPos.length >= 0.6) {
    return { label: "dono", icon: "👑", bg: "var(--bg-warn-subtle, var(--bg-warn))", fg: "var(--color-warn-dark, var(--color-warn-dark))", title: `${wins} vitórias em ${validPos.length} edições` };
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
      return { label: "a piorar", icon: "▼", bg: "var(--bg-warn-subtle, var(--bg-warn))", fg: "var(--color-warn-dark, var(--color-warn-dark))", title: `Posição piorou de média #${avg1.toFixed(0)} para #${avg2.toFixed(0)}` };
    }
  }

  if (validPos.every((p) => p <= 10)) {
    return { label: "consistente", icon: "●", bg: "var(--bg-info-subtle, var(--bg-info))", fg: "var(--color-info-dark, var(--color-navy))", title: "Sempre em top-10 nesta série" };
  }

  return null;
}
