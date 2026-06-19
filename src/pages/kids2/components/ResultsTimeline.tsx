/**
 * kids2/components/ResultsTimeline.tsx
 *
 * Tabela cronológica de TODOS os torneios do jogador, agrupada por ano.
 * Filter pills de fonte/circuito no topo.
 */

import React, { useMemo, useState } from "react";
import type { CanonicalData, Junior, Tournament, Flight, Result } from "../data";
import { getSharedTournamentIds } from "../data";
import { useSort } from "../../../hooks/useSort";
import SortableHdr from "../../../ui/SortableHdr";
import InlineScorecard from "./InlineScorecard";
import { categorizeTournamentLinks } from "../tournamentLinks";
import { RoundPill, NineHPill } from "../../../ui/PillBadge";

type ResKey = "date" | "type" | "pos" | "name" | "flight" | "rounds" | "toPar" | "vsM";

interface Props {
  data: CanonicalData;
  junior: Junior;
  filterTids?: Set<string> | null;
}

interface Row {
  tid: string;
  tournament: Tournament;
  flight: Flight;
  result: Result;
  year: string;
  date: string;
  vsManuelDiff: number | null;
  /** Posição do Manuel neste mesmo torneio (se também jogou) — null se não. */
  manuelPos: number | null;
  /** Top % = pos/fieldSize. null se faltar pos ou fieldSize. */
  topPct: number | null;
}

const MONTHS_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const SOURCE_LABELS: Record<string, string> = {
  uskids: "USKids", fpg: "FPG", rfeg: "RFEG", ffgolf: "FFG", wjgc: "WJGC", eowagr: "EOWAGR", doral: "Doral",
};

export default function ResultsTimeline({ data, junior, filterTids }: Props) {
  // Por default todos os anos com torneios ficam abertos (incluindo "?" para
  // torneios sem date). Antes só abria o ano corrente, mas isso escondia
  // torneios marcantes mencionados nos KPIs de carreira.
  const [expandedYears, setExpandedYears] = useState<Set<string> | "ALL">("ALL");
  // Cartão expandido inline: chave = tid + flightKey, valor = ronda focada.
  // Substitui o modal antigo. Permite expand/collapse no sítio.
  const [expandedScorecard, setExpandedScorecard] = useState<{ key: string; row: Row; round: number } | null>(null);
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set());

  const isManuel = data.manuel?.id === junior.id;
  const allRows = useMemo<Row[]>(() => {
    // Só calcula vsManuelDiff quando NÃO estamos a ver a ficha do próprio Manuel
    const manuelSharedIds = !isManuel && data.manuel
      ? new Set(getSharedTournamentIds(junior, data.manuel))
      : new Set<string>();
    const out: Row[] = [];
    for (const tid of junior.tournamentIds) {
      if (filterTids && !filterTids.has(tid)) continue;
      const t = data.tournamentById.get(tid);
      if (!t) continue;
      for (const f of t.flights) {
        const r = f.results.find((x) => x.juniorId === junior.id);
        if (!r) continue;
        const date = t.date || t.startDate || "";
        let vsManuelDiff: number | null = null;
        let manuelPos: number | null = null;
        if (!isManuel && manuelSharedIds.has(tid) && data.manuel) {
          // SÓ contar como confronto se Manuel jogou no MESMO flight (mesmo escalão).
          // Senão o diff/pos são ilusórios — escalões diferentes não comparam.
          const mR = f.results.find((rr) => rr.juniorId === data.manuel!.id);
          if (mR?.totalGross != null && r.totalGross != null) {
            vsManuelDiff = r.totalGross - mR.totalGross;
          }
          if (mR && typeof mR.pos === "number") manuelPos = mR.pos;
        }
        const fs = f.fieldSize ?? null;
        const topPct = typeof r.pos === "number" && fs && fs > 0
          ? Math.round((r.pos / fs) * 100)
          : null;
        out.push({ tid, tournament: t, flight: f, result: r, year: date.slice(0, 4) || "?", date, vsManuelDiff, manuelPos, topPct });
      }
    }
    out.sort((a, b) => b.date.localeCompare(a.date));
    return out;
  }, [data, junior, filterTids, isManuel]);

  const sourcesAvailable = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allRows) {
      const s = r.tournament.sourceId || "?";
      m.set(s, (m.get(s) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [allRows]);

  const rows = useMemo(() => {
    if (activeSources.size === 0) return allRows;
    return allRows.filter((r) => activeSources.has(r.tournament.sourceId));
  }, [allRows, activeSources]);

  const byYear = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      let arr = m.get(r.year);
      if (!arr) { arr = []; m.set(r.year, arr); }
      arr.push(r);
    }
    return m;
  }, [rows]);

  const toggleSource = (s: string) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  if (allRows.length === 0) return null;

  const allYears = Array.from(byYear.keys()).sort((a, b) => b.localeCompare(a));

  const toggleYear = (y: string) => {
    setExpandedYears((prev) => {
      // Estado "ALL" expande implicitamente todos os anos. Ao clicar para
      // colapsar um, materializa-se o Set explícito (todos menos este).
      const baseSet = prev === "ALL" ? new Set(allYears) : new Set(prev);
      if (baseSet.has(y)) baseSet.delete(y); else baseSet.add(y);
      return baseSet;
    });
  };

  const isYearExpanded = (y: string) => expandedYears === "ALL" || expandedYears.has(y);

  const years = allYears;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "8px 0 10px", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--text)" }}>Resultados</h3>
        <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
          {rows.length}{activeSources.size > 0 ? ` de ${allRows.length}` : ""} {rows.length === 1 ? "resultado" : "resultados"}
        </span>
      </div>

      {sourcesAvailable.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10, padding: "8px 10px", background: "var(--bg-muted)", borderRadius: 6, alignItems: "center" }}>
          <span style={{ fontSize: "var(--fs-10)", fontWeight: 700, color: "var(--text-3)", letterSpacing: 0.4, textTransform: "uppercase", marginRight: 2 }}>
            Fonte
          </span>
          {sourcesAvailable.map(([src, count]) => {
            const active = activeSources.has(src);
            return (
              <button
                key={src}
                onClick={() => toggleSource(src)}
                style={{
                  fontSize: "var(--fs-11)",
                  padding: "2px 9px",
                  borderRadius: 999,
                  border: `1px solid ${active ? "var(--color-info-dark)" : "var(--border-light)"}`,
                  background: active ? "var(--color-info-dark)" : "var(--bg)",
                  color: active ? "var(--bg)" : "var(--text-2)",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
                title={`Filtrar: ${SOURCE_LABELS[src] || src}`}
              >
                {SOURCE_LABELS[src] || src} <span style={{ opacity: 0.7, marginLeft: 3 }}>{count}</span>
              </button>
            );
          })}
          {activeSources.size > 0 && (
            <button
              onClick={() => setActiveSources(new Set())}
              style={{
                fontSize: "var(--fs-11)",
                padding: "2px 9px",
                borderRadius: 999,
                border: "1px solid var(--color-danger-dark)",
                background: "var(--bg)",
                color: "var(--color-danger-dark)",
                cursor: "pointer",
                fontWeight: 600,
              }}
              title="Limpar filtros de fonte"
            >
              ✕ limpar
            </button>
          )}
        </div>
      )}

      {years.map((y) => {
        const yearRows = byYear.get(y)!;
        const wins = yearRows.filter((r) => r.result.pos === 1).length;
        const manuelEncounters = yearRows.filter((r) => r.vsManuelDiff != null).length;
        const expanded = isYearExpanded(y);
        return (
          <div key={y} style={{ marginBottom: 10 }}>
            <div
              onClick={() => toggleYear(y)}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                padding: "6px 8px",
                background: "var(--bg-muted)",
                borderRadius: 4,
                cursor: "pointer",
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: "var(--fs-13)", fontWeight: 700 }}>{expanded ? "▼" : "▶"} {y}</span>
              <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
                {yearRows.length} torneios · {wins} vitórias{manuelEncounters > 0 ? ` · ${manuelEncounters}× vs Manuel` : ""}
              </span>
            </div>
            {expanded && (
              <YearTable
                rows={yearRows}
                expandedKey={expandedScorecard?.key || null}
                onOpenRound={(row, round) => {
                  const key = row.tid + "|" + row.flight.flightKey;
                  // Toggle: clicar na mesma row colapsa
                  setExpandedScorecard((prev) =>
                    prev && prev.key === key && prev.round === round
                      ? null
                      : { key, row, round }
                  );
                }}
                expandedScorecardNode={(row) => {
                  if (!expandedScorecard) return null;
                  const key = row.tid + "|" + row.flight.flightKey;
                  if (expandedScorecard.key !== key) return null;
                  return (
                    <InlineScorecard
                      tournament={expandedScorecard.row.tournament}
                      flight={expandedScorecard.row.flight}
                      result={expandedScorecard.row.result}
                      focusedRound={expandedScorecard.round}
                      playerName={junior.canonicalName}
                      junior={junior}
                      onClose={() => setExpandedScorecard(null)}
                    />
                  );
                }}
              />
            )}
          </div>
        );
      })}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, padding: "8px 10px", fontSize: "var(--fs-10)", color: "var(--text-3)", background: "var(--bg-muted)", borderRadius: 6 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ background: "var(--medal-gold-bg)", color: "var(--medal-gold-fg)", fontWeight: 700, padding: "1px 5px", borderRadius: 3, fontSize: "var(--fs-10)" }}>🏆 #1</span> ouro
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ background: "var(--medal-silver-bg)", color: "var(--medal-silver-fg)", fontWeight: 700, padding: "1px 5px", borderRadius: 3, fontSize: "var(--fs-10)" }}>🏆 #2</span> prata
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ background: "var(--medal-bronze-bg)", color: "var(--medal-bronze-fg)", fontWeight: 700, padding: "1px 5px", borderRadius: 3, fontSize: "var(--fs-10)" }}>🏆 #3</span> bronze
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ background: "var(--bg-success-subtle, #ecfdf5)", border: "1px solid var(--border-success, #97c459)", color: "var(--color-good-dark)", fontWeight: 700, padding: "1px 4px", borderRadius: 3, fontSize: "var(--fs-10)" }}>±N</span>
          diff vs Manuel
        </span>
        <span style={{ marginLeft: "auto" }}>
          Clique nos scores sublinhados para ver scorecard hole-by-hole · Cabeçalhos clicáveis para ordenar
        </span>
      </div>
    </section>
  );
}


function YearTable({ rows, onOpenRound, expandedKey, expandedScorecardNode }: {
  rows: Row[];
  onOpenRound: (row: Row, round: number) => void;
  expandedKey: string | null;
  expandedScorecardNode: (row: Row) => React.ReactNode;
}) {
  const { sortKey, sortDir, toggleSort } = useSort<ResKey>("date", "desc", {
    pos: "asc", date: "desc", toPar: "asc", vsM: "asc", rounds: "asc",
  });

  const sorted = useMemo(() => {
    const arr = [...rows];
    const sign = sortDir === "asc" ? 1 : -1;
    const safeNum = (v: any) => (typeof v === "number" ? v : Number.POSITIVE_INFINITY);
    arr.sort((a, b) => {
      switch (sortKey) {
        case "date":   return sign * a.date.localeCompare(b.date);
        case "type":   return sign * (a.tournament.sourceId || "").localeCompare(b.tournament.sourceId || "");
        case "pos":    return sign * (safeNum(a.result.pos) - safeNum(b.result.pos));
        case "name":   return sign * (a.tournament.name || "").localeCompare(b.tournament.name || "");
        case "flight": return sign * (a.flight.label || "").localeCompare(b.flight.label || "");
        case "rounds": {
          const ta = a.result.totalGross ?? safeNum(null);
          const tb = b.result.totalGross ?? safeNum(null);
          return sign * (ta - tb);
        }
        case "toPar":  return sign * (safeNum(a.result.toPar) - safeNum(b.result.toPar));
        case "vsM":    return sign * (safeNum(a.vsManuelDiff) - safeNum(b.vsManuelDiff));
        default: return 0;
      }
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  return (
    <table className="dtable-sm">
      <thead>
        <tr>
          <SortableHdr<ResKey> k="date"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ width: 56 }}>Data</SortableHdr>
          <SortableHdr<ResKey> k="type"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ width: 56 }}>Tipo</SortableHdr>
          <SortableHdr<ResKey> k="pos"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ width: 50, textAlign: "center" }}>Pos</SortableHdr>
          <SortableHdr<ResKey> k="name"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Torneio</SortableHdr>
          <SortableHdr<ResKey> k="flight" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ width: 70 }}>Escalão</SortableHdr>
          <SortableHdr<ResKey> k="rounds" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ width: 80, textAlign: "right" }}>Rondas</SortableHdr>
          <SortableHdr<ResKey> k="toPar"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ width: 42, textAlign: "right" }}>±par</SortableHdr>
          <SortableHdr<ResKey> k="vsM"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ width: 46, textAlign: "right" }}>vs M</SortableHdr>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => {
          const rowKey = r.tid + "|" + r.flight.flightKey;
          const isExpanded = expandedKey === rowKey;
          return (
            <React.Fragment key={r.tid + r.flight.flightKey}>
              <ResultRow r={r} onOpenRound={onOpenRound} isExpanded={isExpanded} />
              {isExpanded && (
                <tr>
                  <td colSpan={8} style={{ padding: "0 4px 8px 4px" }}>
                    {expandedScorecardNode(r)}
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// "Cor Manuel" — token oficial reservado no projecto. Partilhado com as 2
// colunas Manuel em MatchupVsManuel. Definido em tokens.css como
// --bg-success-subtle (comentário literal "highlight row Manuel"). Mesma
// cor que .row-manuel em App.css.
const MANUEL_TINT = "color-mix(in srgb, var(--bg-success-subtle) 35%, transparent)";

function ResultRow({ r, onOpenRound, isExpanded }: { r: Row; onOpenRound: (row: Row, round: number) => void; isExpanded?: boolean }) {
  const bg = r.vsManuelDiff != null
    ? MANUEL_TINT
    : isExpanded ? "var(--bg-muted)" : undefined;
  const parTotal = r.flight.par?.reduce((a, b) => a + (b || 0), 0) || r.tournament.parTotal;
  const rounds = r.result.rounds || [];
  const grosses = rounds.map((rd) => rd.gross).filter((g): g is number => typeof g === "number");
  const total = r.result.totalGross ?? (grosses.length ? grosses.reduce((a, b) => a + b, 0) : null);
  const toPar = r.result.toPar ?? (total != null && parTotal && grosses.length ? total - parTotal * grosses.length : null);
  const categorizedLinks = categorizeTournamentLinks(r.tournament);
  const roundsWithStrokes = new Set(rounds.filter((rd) => rd.strokes && rd.strokes.some((s) => s > 0)).map((rd) => rd.round));
  return (
    <tr style={{ background: bg }}>
      <td style={{ color: "var(--text-3)" }}>{fmtDate(r.date)}</td>
      <td>
        <span style={{ fontSize: "var(--fs-9)", padding: "1px 5px", borderRadius: 3, background: "var(--bg)", border: "1px solid var(--border-light)" }}>
          {SOURCE_LABELS[r.tournament.sourceId] || r.tournament.sourceId}
        </span>
      </td>
      <td style={{ textAlign: "center" }}>
        <PosBadgeSmall pos={r.result.pos} />
        {r.topPct != null && (
          <div style={{
            fontSize: "var(--fs-9)", marginTop: 1,
            color: r.topPct <= 10 ? "var(--medal-gold-strong)" : r.topPct <= 25 ? "var(--text-2)" : "var(--text-3)",
            fontWeight: r.topPct <= 25 ? 700 : 400,
          }} title={`Posição como percentil do field (#${r.result.pos}/${r.flight.fieldSize})`}>
            top {r.topPct}%
          </div>
        )}
      </td>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          <span>{r.tournament.name || r.tournament.shortName || r.tid}</span>
          {(() => {
            const nR = (r.result.rounds || []).filter((rd) => typeof rd.gross === "number").length;
            return <RoundPill nR={nR} />;
          })()}
          <ScoringPill tournament={r.tournament} flight={r.flight} />
          {(() => {
            const is9 = r.tournament.holesPerRound === 9 ||
              (Array.isArray(r.flight.par) && r.flight.par.filter((p) => p > 0).length === 9);
            return is9 ? <NineHPill /> : null;
          })()}
          {categorizedLinks.map((l) => (
            <a
              key={l.key + l.url}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              title={`Abrir em ${l.label}`}
              style={{
                fontSize: "var(--fs-9)", padding: "1px 5px", borderRadius: 3, fontWeight: 700,
                background: "var(--bg)", color: `var(${l.colorVar})`,
                border: `1px solid var(${l.colorVar})`,
                textDecoration: "none", lineHeight: 1.4,
                whiteSpace: "nowrap",
              }}
            >
              {l.label} ↗
            </a>
          ))}
        </div>
        {/* Field size REAL (do aggregator) — não confundir com results.length que
            é apenas o nº de juniores trackados nos canónicos (sub-conjunto). */}
        {(() => {
          const fs = r.flight.fieldSize;
          if (typeof fs === "number" && fs > 0) {
            return (
              <div style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", marginTop: 1 }}>
                field {fs} {fs === 1 ? "jogador" : "jogadores"}
              </div>
            );
          }
          return null;
        })()}
      </td>
      <td style={{ color: "var(--text-3)" }}>{r.flight.label}</td>
      <td style={{ textAlign: "right" }}>
        {rounds.length > 0 ? (
          rounds.map((rd, i) => {
            const g = rd.gross;
            const clickable = roundsWithStrokes.has(rd.round);
            return (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: "var(--text-3)" }}>·</span>}
                {clickable && typeof g === "number" ? (
                  <button
                    onClick={() => onOpenRound(r, rd.round)}
                    style={{
                      background: "none", border: "none", padding: "0 2px", fontSize: "var(--fs-11)",
                      color: "var(--color-info-dark, #1e3a8a)", cursor: "pointer",
                      textDecoration: "underline", fontWeight: 600, fontVariantNumeric: "tabular-nums",
                    }}
                    title="Ver scorecard buraco-a-buraco"
                  >{g}</button>
                ) : (
                  <span>{g ?? "—"}</span>
                )}
              </React.Fragment>
            );
          })
        ) : (total ?? "—")}
      </td>
      <td style={{ textAlign: "right", color: toPar != null && toPar < 0 ? "var(--color-good-dark)" : toPar != null && toPar > 0 ? "var(--color-danger-dark)" : "var(--text-3)", fontWeight: toPar != null && toPar < 0 ? 700 : 400 }}>
        {toPar == null ? "—" : toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : String(toPar)}
      </td>
      <td style={{ textAlign: "right" }}>
        {r.vsManuelDiff != null && (
          <span style={{ background: "var(--bg-success-subtle, #ecfdf5)", color: "var(--color-good-dark)", fontWeight: 700, padding: "1px 4px", borderRadius: 3, fontSize: "var(--fs-10)", border: "1px solid var(--border-success, #97c459)" }}
            title={r.manuelPos != null ? `Manuel ficou em #${r.manuelPos}` : "Manuel também jogou"}>
            {r.vsManuelDiff === 0 ? "0" : r.vsManuelDiff > 0 ? `+${r.vsManuelDiff}` : String(r.vsManuelDiff)}
          </span>
        )}
        {r.manuelPos != null && (
          <div style={{ fontSize: "var(--fs-9)", color: "var(--color-good-dark)", marginTop: 1, fontWeight: 600 }}>
            ★M #{r.manuelPos}
          </div>
        )}
      </td>
    </tr>
  );
}


function PosBadgeSmall({ pos }: { pos: number | null | undefined }) {
  if (typeof pos !== "number") return <span style={{ color: "var(--text-3)" }}>—</span>;
  if (pos <= 3) {
    const bg = pos === 1 ? "var(--medal-gold-bg)" : pos === 2 ? "var(--medal-silver-bg)" : "var(--medal-bronze-bg)";
    const fg = pos === 1 ? "var(--medal-gold-fg)" : pos === 2 ? "var(--medal-silver-fg)" : "var(--medal-bronze-fg)";
    return <span style={{ background: bg, color: fg, fontWeight: 700, padding: "1px 5px", borderRadius: 3, fontSize: "var(--fs-10)" }}>🏆 #{pos}</span>;
  }
  return <span style={{ color: "var(--text-3)" }}>#{pos}</span>;
}

/** Pill SCRATCH/HANDICAP — SÓ se aplica a torneios RFEG, onde o eixo
 *  scratch vs handicap é metadado oficial publicado pela federação. Outras
 *  federações (USKids, FPG, FFG, BJGT, ...) não publicam este atributo
 *  formalmente — não mostramos o pill nesses casos para não criar leitura
 *  falsa. Quando RFEG, cor: SCRATCH=âmbar (gross), HANDICAP=info (net). */
function ScoringPill({ tournament, flight }: { tournament: Tournament; flight: Flight }) {
  if (tournament.sourceId !== "rfeg") return null;
  const st = (tournament.extra as any)?.scoringType as string | undefined;
  if (!st) return null;
  const isScratch = /SCRATCH/i.test(st);
  void flight; // reservado para futuras heurísticas (flight-level override)
  return (
    <span title={isScratch ? "Competição scratch (gross)" : "Competição com handicap (net)"} style={{
      fontSize: "var(--fs-9)", padding: "1px 5px", borderRadius: 3, fontWeight: 700,
      background: isScratch ? "var(--bg-warn-subtle, var(--bg-warn))" : "var(--bg-info-subtle, #eff6ff)",
      color: isScratch ? "var(--color-warn-dark, var(--color-warn-dark))" : "var(--color-info-dark, #1e3a8a)",
      border: `1px solid ${isScratch ? "var(--color-warn-dark, var(--color-warn-dark))" : "var(--color-info-dark, #1e3a8a)"}`,
      lineHeight: 1.4,
    }}>
      {isScratch ? "SCRATCH" : "HCP"}
    </span>
  );
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  const mn = parseInt(m, 10);
  if (!mn || !d) return iso;
  return `${d.padStart(2, "0")} ${MONTHS_ABBR[mn - 1] || ""}`;
}
