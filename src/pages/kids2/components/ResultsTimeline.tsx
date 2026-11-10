/**
 * kids2/components/ResultsTimeline.tsx
 *
 * Tabela cronológica de TODOS os torneios do jogador, agrupada por ano.
 * Filter pills de fonte/circuito no topo.
 */

import React, { useMemo, useState } from "react";
import type { CanonicalData, Junior, Tournament, Flight, Result } from "../data";
import { getSharedTournamentIds } from "../data";
import { useSort, compareNullsLast, compareTextNullsLast } from "../../../hooks/useSort";
import SortableHdr from "../../../ui/SortableHdr";
import InlineScorecard from "./InlineScorecard";
import { categorizeTournamentLinks } from "../tournamentLinks";
import { RoundPill, NineHPill, ScoringTag } from "../../../ui/PillBadge";
import { toneClass } from "../../../utils/scoreDisplay";
import ToPar from "../../../ui/ToPar";
import { fmtToPar, fmtDayMonth } from "../../../utils/format";
import ClearButton from "../../../ui/ClearButton";
import ExpandArrow from "../../../ui/ExpandArrow";
import ExtLink from "../../../ui/ExternalLink";
import { SOURCE_LABELS } from "../../../constants/kids2Sources";
import { MUTED } from "../../../ui/tableCells";
import { TrophyPos } from "../../../ui/PosBadge";
import { toggleSet } from "../../../utils/mathUtils";
import SectionTitle from "../../../ui/SectionTitle";
import { Tint } from "../../../ui/DataStyle";
import { resumoResultado, diferencaDeTotais, type ResumoResultado } from "../../../utils/voltasJogadas";

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
  /** Voltas, total e ±par com as regras do site (sem cartão, 9 buracos, voltas jogadas). */
  resumo: ResumoResultado;
  year: string;
  date: string;
  vsManuelDiff: number | null;
  /** O Manuel jogou no MESMO flight (há confronto, mesmo sem diferença para mostrar). */
  comManuel: boolean;
  /** Posição do Manuel neste mesmo torneio (se também jogou) — null se não. */
  manuelPos: number | null;
  /** Top % = pos/fieldSize. null se faltar pos ou fieldSize. */
  topPct: number | null;
}

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
        const opts = { parTotal: t.parTotal, buracos: t.holesPerRound };
        const resumo = resumoResultado(r, f.par, opts);
        let vsManuelDiff: number | null = null;
        let manuelPos: number | null = null;
        let comManuel = false;
        if (!isManuel && manuelSharedIds.has(tid) && data.manuel) {
          // SÓ contar como confronto se Manuel jogou no MESMO flight (mesmo escalão).
          // Senão o diff/pos são ilusórios — escalões diferentes não comparam.
          const mR = f.results.find((rr) => rr.juniorId === data.manuel!.id);
          // Só com total dos dois lados (≥ 900 = sem cartão) e o MESMO nº de voltas
          // (10/11/2026: 173 em 2 voltas contra 285 em 3 dava «−112»).
          if (mR) vsManuelDiff = diferencaDeTotais(resumo, resumoResultado(mR, f.par, opts));
          comManuel = !!mR;
          if (mR && typeof mR.pos === "number") manuelPos = mR.pos;
        }
        const fs = f.fieldSize ?? null;
        const topPct = typeof r.pos === "number" && fs && fs > 0
          ? Math.round((r.pos / fs) * 100)
          : null;
        out.push({ tid, tournament: t, flight: f, result: r, resumo, year: date.slice(0, 4) || "?", date, vsManuelDiff, comManuel, manuelPos, topPct });
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
    setActiveSources((prev) => toggleSet(prev, s));
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
      <SectionTitle right={<span>
        {rows.length}{activeSources.size > 0 ? ` de ${allRows.length}` : ""} {rows.length === 1 ? "resultado" : "resultados"}
      </span>}>
        Resultados
      </SectionTitle>

      {sourcesAvailable.length > 1 && (
        <div className="u-d-flex u-fwr-wrap u-gap-4px u-mb-10px u-p-8px-10px u-bg-bg-muted u-br-radius u-ai-center">
          <span className="u-fs-fs-10 u-fw-700 u-c-text-3 u-ls-0_4px u-tt-uppercase u-mr-2px">
            Fonte
          </span>
          {sourcesAvailable.map(([src, count]) => {
            const active = activeSources.has(src);
            return (
              <button
                key={src}
                type="button"
                onClick={() => toggleSource(src)}
                className={"tourn-tab tourn-tab-sm" + (active ? " active" : "")}
                aria-pressed={active}
                title={`Filtrar: ${SOURCE_LABELS[src] || src}`}
              >
                {SOURCE_LABELS[src] || src} <span className="u-op-0_7 u-ml-3px">{count}</span>
              </button>
            );
          })}
          {activeSources.size > 0 && (
            <ClearButton onClick={() => setActiveSources(new Set())} title="Limpar filtros de fonte" />
          )}
        </div>
      )}

      {years.map((y) => {
        const yearRows = byYear.get(y)!;
        const wins = yearRows.filter((r) => r.result.pos === 1).length;
        const manuelEncounters = yearRows.filter((r) => r.comManuel).length;
        const expanded = isYearExpanded(y);
        return (
          <div key={y} className="u-mb-10px">
            <div
              onClick={() => toggleYear(y)}
              className="u-d-flex u-ai-baseline u-jc-space-between u-p-6px-8px u-bg-bg-muted u-br-radius-sm u-cur-pointer u-mb-4px"
            >
              <span className="u-fs-fs-13 u-fw-700"><ExpandArrow open={expanded} /> {y}</span>
              <span className="u-fs-fs-11 u-c-text-3">
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
      <div className="u-d-flex u-fwr-wrap u-gap-10px u-mt-10px u-p-8px-10px u-fs-fs-10 u-c-text-3 u-bg-bg-muted u-br-radius">
        <span className="u-d-inline-flex u-ai-center u-gap-4px">
          <span className="u-bg-medal-gold-bg u-c-medal-gold-fg u-fw-700 u-p-1px-4px u-br-radius-sm u-fs-fs-10">🏆 #1</span> ouro
        </span>
        <span className="u-d-inline-flex u-ai-center u-gap-4px">
          <span className="u-bg-medal-silver-bg u-c-medal-silver-fg u-fw-700 u-p-1px-4px u-br-radius-sm u-fs-fs-10">🏆 #2</span> prata
        </span>
        <span className="u-d-inline-flex u-ai-center u-gap-4px">
          <span className="u-bg-medal-bronze-bg u-c-medal-bronze-fg u-fw-700 u-p-1px-4px u-br-radius-sm u-fs-fs-10">🏆 #3</span> bronze
        </span>
        <span className="u-d-inline-flex u-ai-center u-gap-4px">
          <span className="u-bg-bg-success-subtle u-bd-ci9jy u-c-color-good-dark u-fw-700 u-p-1px-4px u-br-radius-sm u-fs-fs-10">±N</span>
          diff vs Manuel
        </span>
        <span className="u-ml-auto">
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
    // Vazios (sem lugar, sem total, texto vazio) sempre no fim, nas duas direcções.
    const num = (v: unknown) => (typeof v === "number" ? v : null);
    arr.sort((a, b) => {
      switch (sortKey) {
        case "date":   return sign * a.date.localeCompare(b.date);
        case "type":   return compareTextNullsLast(a.tournament.sourceId, b.tournament.sourceId, sign);
        case "pos":    return compareNullsLast(num(a.result.pos), num(b.result.pos), sign);
        case "name":   return compareTextNullsLast(a.tournament.name, b.tournament.name, sign);
        case "flight": return compareTextNullsLast(a.flight.label, b.flight.label, sign);
        case "rounds": return compareNullsLast(a.resumo.total, b.resumo.total, sign);
        case "toPar":  return compareNullsLast(a.resumo.toPar, b.resumo.toPar, sign);
        case "vsM":    return compareNullsLast(num(a.vsManuelDiff), num(b.vsManuelDiff), sign);
        default: return 0;
      }
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  return (
    <table className="dtable dtable-sm">
      <thead>
        <tr>
          <SortableHdr<ResKey> k="date"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="u-w-56px">Data</SortableHdr>
          <SortableHdr<ResKey> k="type"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="u-w-56px">Tipo</SortableHdr>
          <SortableHdr<ResKey> k="pos"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="u-w-50px u-ta-center">Pos</SortableHdr>
          <SortableHdr<ResKey> k="name"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Torneio</SortableHdr>
          <SortableHdr<ResKey> k="flight" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="u-w-70px">Escalão</SortableHdr>
          <SortableHdr<ResKey> k="rounds" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="u-w-80px u-ta-right">Rondas</SortableHdr>
          <SortableHdr<ResKey> k="toPar"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="u-w-42px u-ta-right">±par</SortableHdr>
          <SortableHdr<ResKey> k="vsM"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="u-w-46px u-ta-right">vs M</SortableHdr>
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
                  <td colSpan={8} className="u-p-0-4px-8px-4px">
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

function ResultRow({ r, onOpenRound, isExpanded }: { r: Row; onOpenRound: (row: Row, round: number) => void; isExpanded?: boolean }) {
  // Linha com confronto com o Manuel → "cor Manuel" (a das colunas Manuel em
  // MatchupVsManuel, .k2-row-vs-manuel); aberta → fundo esbatido.
  const rowCls = r.comManuel
    ? "k2-row-vs-manuel"
    : isExpanded ? "k2-row-open" : undefined;
  // Total, ±par e voltas saem do resumo global (10/11/2026): total/gross ≥ 900
  // deixa de aparecer («1087», «+941») e o ±par de recurso é pelas voltas jogadas.
  const rounds = r.result.rounds || [];
  const { total, toPar, voltas } = r.resumo;
  const categorizedLinks = categorizeTournamentLinks(r.tournament);
  const roundsWithStrokes = new Set(rounds.filter((rd) => rd.strokes && rd.strokes.some((s) => s > 0)).map((rd) => rd.round));
  return (
    <tr className={rowCls}>
      <td className="u-c-text-3">{fmtDayMonth(r.date)}</td>
      <td>
        <span className="u-fs-fs-9 u-p-1px-4px u-br-radius-sm u-bg-bg u-bd-1px-solid-border-light">
          {SOURCE_LABELS[r.tournament.sourceId] || r.tournament.sourceId}
        </span>
      </td>
      <td className="u-ta-center">
        <PosBadgeSmall pos={r.result.pos} status={r.result.status} />
        {r.topPct != null && (
          <div className={"u-fs-fs-9 u-mt-1px " + (r.topPct <= 10 ? "u-fw-700 u-c-medal-gold-strong" : r.topPct <= 25 ? "u-fw-700 u-c-text-2" : "u-fw-400 u-c-text-3")}
            title={`Posição como percentil do field (#${r.result.pos}/${r.flight.fieldSize})`}>
            top {r.topPct}%
          </div>
        )}
      </td>
      <td>
        <div className="u-d-flex u-ai-center u-gap-4px u-fwr-wrap">
          <span>{r.tournament.name || r.tournament.shortName || r.tid}</span>
          <RoundPill nR={r.resumo.jogadas.length} />
          {/* SCRATCH/HCP só nas provas da RFEG — as outras federações não publicam este atributo. */}
          {r.tournament.sourceId === "rfeg" && <ScoringTag scoringType={(r.tournament.extra as any)?.scoringType} />}
          {/* 9H pelas voltas do PRÓPRIO jogador (`buracosDoFlight`): os escalões novos
              jogam 9 buracos em torneios cuja ficha diz 18 (British Kids 2021, Boys 7&U). */}
          {r.resumo.nBuracos === 9 && <NineHPill />}
          {categorizedLinks.map((l) => (
            <Tint as={ExtLink} key={l.key + l.url} href={l.url} fg={`var(${l.colorVar})`} bd={`var(${l.colorVar})`}
              title={`Abrir em ${l.label}`} className="src-link-tag"
            >
              {l.label} ↗
            </Tint>
          ))}
        </div>
        {/* Field size REAL (do aggregator) — não confundir com results.length que
            é apenas o nº de juniores trackados nos canónicos (sub-conjunto). */}
        {(() => {
          const fs = r.flight.fieldSize;
          if (typeof fs === "number" && fs > 0) {
            return (
              <div className="u-fs-fs-10 u-c-text-3 u-mt-1px">
                field {fs} {fs === 1 ? "jogador" : "jogadores"}
              </div>
            );
          }
          return null;
        })()}
      </td>
      <td className="u-c-text-3">{r.flight.label}</td>
      <td className="u-ta-right">
        {rounds.length > 0 ? (
          rounds.map((rd, i) => {
            const g = voltas[i]; // null = sem cartão (≥ 900) ou sem gross
            const clickable = roundsWithStrokes.has(rd.round);
            return (
              <React.Fragment key={i}>
                {i > 0 && <span className="u-c-text-3">·</span>}
                {clickable && g != null ? (
                  <button
                    onClick={() => onOpenRound(r, rd.round)}
                    className="u-bg-none u-bd-none u-p-0-2px u-fs-fs-11 u-c-var-color-info-dark-1e3a8a u-cur-pointer u-td-underline u-fw-600 u-fvn-tabular-nums"
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
      <td className={"u-ta-right " + (toPar != null && toPar < 0 ? "u-fw-700" : "u-fw-400") + " " + (toneClass(toPar) || "tone-muted")}>
        {fmtToPar(toPar)}
      </td>
      <td className="u-ta-right">
        {r.vsManuelDiff != null && (
          <ToPar v={r.vsManuelDiff} tone="neutral" kind="delta" className="p p-sm p-muted"
            title={r.manuelPos != null ? `Manuel ficou em #${r.manuelPos}` : "Manuel também jogou"} />
        )}
        {r.manuelPos != null && (
          <div className="u-fs-fs-9 u-c-color-good-dark u-mt-1px u-fw-600">
            ★M #{r.manuelPos}
          </div>
        )}
      </td>
    </tr>
  );
}


function PosBadgeSmall({ pos, status }: { pos: number | null | undefined; status?: string }) {
  if (typeof pos !== "number") {
    // Sem posição mas classificado como não-finalista → mostrar o motivo
    // (CUT/WD/DQ/DNS) em vez de "—", para a participação não desaparecer.
    if (status && status !== "OK") {
      return <span className="u-c-text-3 u-fw-700 u-fs-fs-9" title="Não classificado">{status}</span>;
    }
    return MUTED;
  }
  if (pos <= 3) return <TrophyPos pos={pos} small />;
  // Não-finalista com posição real: mostra "#45" (posição na leaderboard) em vez
  // de "CUT". O número fica IDÊNTICO ao das outras linhas (mesmo tamanho); o
  // motivo vai numa 2ª linha, a vermelho, + tooltip.
  const dnf = status && status !== "OK";
  if (dnf) {
    return (
      <span className="u-d-inline-flex u-fd-column u-ai-center u-lh-1_1" title={DNF_LABEL[status] || status}>
        <TrophyPos pos={pos} />
        <span className="u-fs-fs-9 u-fw-700 u-c-color-danger u-tt-lowercase">{status === "CUT" ? "cut" : status.toLowerCase()}</span>
      </span>
    );
  }
  return <TrophyPos pos={pos} />;
}

const DNF_LABEL: Record<string, string> = {
  CUT: "Não passou o corte (CUT)",
  WD: "Desistiu (WD)",
  DQ: "Desqualificado (DQ)",
  DNS: "Não compareceu (DNS)",
  IE: "Inelegível (IE)",
};


