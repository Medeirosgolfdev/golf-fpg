/**
 * DORALPage.tsx — First Tee Miami Doral Jr. Classic na /major
 *
 * 2026-07-02: UI standalone removida — /doral-legacy → redirect /major.
 * Este ficheiro exporta a evolução multi-ano (doralEvoFor) e a divisão do
 * CircuitShell (doralMajorDivision) consumidas pela MajorPage. Os dados
 * (ficheiros, metadados por escalão, normalização e conversão para o formato
 * FPG) vivem em src/data/major/doral.ts desde 21/10/2026.
 */
import { isManuelByName as isM } from "../constants/manuel";
import type { ScorecardOptions } from "./FPGPage";
import EvoBadge from "../ui/EvoBadge";
import type { ExtraColumn, MultiRoundRow } from "../ui/multiRoundTypes";
import { nameMatch, type EvoEntry } from "../hooks/useEvoComparison";
import { EvoSummary, tagEvo } from "../ui/evo";
import type { CircuitDivision } from "../ui/circuit/types";
import { intlScorecardOptions } from "../data/intlScorecard";
import { doralEntryToTournament, type DoralEntry } from "../data/major/doral";

/** EvoEntry estendido para Doral:
 *  - prevYear: ano de origem da comparação (mais recente onde participou)
 *  - history: lista completa de todas as edições anteriores (do mais
 *    recente para o mais antigo) — usada no tooltip da coluna "Ant."
 *  - delta sobrescreve o original: passa a ser MÉDIA DE STROKES VS PAR
 *    POR RONDA (em vez de gross total). Necessário porque alguns escalões
 *    jogam 3 rondas e outros 2, e o par muda entre Red Tiger / Golden
 *    Palm / Silver Fox / Blue Monster — só média toPar/ronda permite
 *    comparação justa cross-escalões.
 *  - deltaIsComparable: true se cur e ant têm o mesmo nº de rondas e mesmo
 *    par (i.e. mesmo escalão/configuração). Quando true, podemos mostrar
 *    o delta como diferença de gross total (mais intuitivo).
 *  - curAvgVsPar / refAvgVsPar: para o tooltip mostrar os valores brutos */
export type EvoEntryD = Omit<EvoEntry, "delta"> & {
  prevYear: number;
  history: { year: number; category: string; total: number; pos: number | null; parTotal: number; nR: number }[];
  /** Diff de avg-strokes-vs-par-por-ronda (negativo = melhorou). 1 decimal. */
  delta: number;
  deltaIsComparable: boolean;
  /** Diff absoluto de gross (só significativo se deltaIsComparable). */
  deltaGross: number;
  curAvgVsPar: number;
  refAvgVsPar: number;
};


/** Opções para ocultar colunas FPG-específicas e adaptar ao contexto Doral */
function doralScorecardOptions(entry: DoralEntry): ScorecardOptions {
  // Boys 8-9 (e Girls 7 & Under, etc.) começam no buraco 10 (back-9)
  const startHole = entry.players[0]?.rounds[0]?.startingHole === 10 ? 10 : 1;
  // SD só se esconde quando não há CR/slope
  const hasRating = entry.cr != null && entry.slope != null;
  return intlScorecardOptions({ hideSD: !hasRating, startHole });
}

/** Quantos regressados têm 1, 2, 3+ edições anteriores (para o resumo de evolução). */
function editionsBreakdown(evo: Map<string, EvoEntryD>): string {
  let solo = 0, twice = 0, veteran = 0;
  for (const e of evo.values()) {
    if (e.history.length === 1) solo++;
    else if (e.history.length === 2) twice++;
    else veteran++;
  }
  return [solo && `${solo} c/ 1 edição`, twice && `${twice} c/ 2`, veteran && `${veteran} c/ 3+`].filter(Boolean).join(", ");
}

/* ═══════════════════════════════════════════════════════════════
   Helpers para a página MAJOR (CircuitShell) — evolução multi-ano
   própria da Doral + CircuitDivision (results + evoCols + resumo de evolução).
   ═══════════════════════════════════════════════════════════════ */

/** Evolução multi-ano da Doral para uma DoralEntry (histórico de edições). Pura. */
export function doralEvoFor(cur: DoralEntry, entries: DoralEntry[]): Map<string, EvoEntryD> | undefined {
  const earlierYears = [...new Set(entries.map((e) => e.year))].filter((y) => y < cur.year).sort((a, b) => b - a);
  if (!earlierYears.length) return undefined;
  const fieldSizeMap = new Map<string, number>();
  for (const e of entries) {
    if (e.year >= cur.year) continue;
    const eNR = Math.max(...e.players.map((p) => p.rounds.length), 0);
    const n = e.players.filter((p) => p.rounds.length === eNR && p.total != null).length;
    fieldSizeMap.set(`${e.year}|${e.category}`, n);
  }
  const curNR = Math.max(...cur.players.map((p) => p.rounds.length), 0);
  const currentPlayers = cur.players.filter((p) => p.total != null && p.rounds.length === curNR);
  const curParTotal = cur.parTotal || 71;
  const curAvgVsPar = (total: number) => (total - curParTotal * curNR) / curNR;
  const evoMap = new Map<string, EvoEntryD>();
  for (const curP of currentPlayers) {
    const history: { year: number; category: string; total: number; pos: number | null; parTotal: number; nR: number }[] = [];
    for (const y of earlierYears) {
      const yearEntries = entries.filter((e) => e.year === y);
      for (const e of yearEntries) {
        const eNR = Math.max(...e.players.map((p) => p.rounds.length), 0);
        const refP = e.players.find((p) => p.total != null && p.rounds.length === eNR && nameMatch(curP.name, p.name));
        if (refP) { history.push({ year: y, category: e.category, total: refP.total!, pos: refP.pos ?? null, parTotal: e.parTotal || 71, nR: eNR }); break; }
      }
    }
    if (history.length === 0) continue;
    const mostRecent = history[0];
    const curAvgToPar = curAvgVsPar(curP.total!);
    const refAvgToPar = (mostRecent.total - mostRecent.parTotal * mostRecent.nR) / mostRecent.nR;
    const deltaAvg = Math.round((curAvgToPar - refAvgToPar) * 10) / 10;
    const deltaIsComparable = curNR === mostRecent.nR && curParTotal === mostRecent.parTotal;
    evoMap.set(curP.name, {
      otherValue: mostRecent.total, delta: deltaAvg, deltaIsComparable, deltaGross: curP.total! - mostRecent.total,
      curAvgVsPar: curAvgToPar, refAvgVsPar: refAvgToPar,
      from: mostRecent.category, to: cur.category,
      pill: mostRecent.category === cur.category ? "EQ" : "UP",
      prevPos: mostRecent.pos, fieldSize: fieldSizeMap.get(`${mostRecent.year}|${mostRecent.category}`),
      prevYear: mostRecent.year, history,
    });
  }
  return evoMap.size ? evoMap : undefined;
}

/** CircuitDivision de uma DoralEntry (results + evoCols multi-ano + EvoSummary). */
export function doralMajorDivision(entry: DoralEntry, evo: Map<string, EvoEntryD> | undefined): CircuitDivision {
  const hasEvo = !!evo && evo.size > 0;
  type RowWithPos = MultiRoundRow & { _pos?: number | null };
  const evoCols: ExtraColumn<RowWithPos>[] | undefined = hasEvo ? [
    {
      header: "Ant.", className: "ta-l fs-11 fw-600 lb-col-divider",
      headerStyle: { width: 72, textAlign: "left" as const, padding: "0 6px" },
      cell: (row: RowWithPos) => {
        const ev = evo!.get(row.name);
        if (!ev) return <span className="c-muted">–</span>;
        const tooltip = ev.history.map((h) => `${h.year}: ${h.total} (${h.category}${h.pos != null ? ` #${h.pos}` : ""})`).join("\n");
        const nEditions = ev.history.length;
        return (
          <span title={tooltip} className="inline-flex items-center gap-4">
            <span>{ev.otherValue}</span>
            {nEditions > 1 && <span className="evo-ed-count">{nEditions}×</span>}
          </span>
        );
      },
    },
    {
      header: "Δ", className: "ta-l fs-11 fw-700", headerStyle: { width: 60, textAlign: "left" as const, padding: "0 6px" },
      cell: (row: RowWithPos) => {
        const ev = evo!.get(row.name);
        if (!ev) return <span className="c-muted">–</span>;
        const value = ev.deltaIsComparable ? ev.deltaGross : ev.delta;
        const sign = value > 0 ? "+" : "";
        const suffix = ev.deltaIsComparable ? "" : <span className="c-muted fs-9 ml-1">/r</span>;
        const tooltip = ev.deltaIsComparable
          ? `Δ vs ${ev.prevYear} (gross ${ev.otherValue}, mesmo escalão e nº de rondas)`
          : `Δ média strokes-vs-par por ronda · ${ev.prevYear}: ${ev.refAvgVsPar.toFixed(1)} vs hoje ${ev.curAvgVsPar.toFixed(1)}`;
        return <span title={tooltip} className={value < 0 ? "c-good-dark" : value > 0 ? "c-danger" : "c-text-3"}>{sign}{value}{suffix}</span>;
      },
    },
    {
      header: "Percurso", className: "ta-l", headerStyle: { width: 160, textAlign: "left" as const, padding: "0 6px" },
      cell: (row: RowWithPos) => {
        const ev = evo!.get(row.name);
        return ev ? <EvoBadge pill={ev.pill} from={ev.from} to={ev.to} prevPos={ev.prevPos} fieldSize={ev.fieldSize} /> : <span className="c-muted">novo</span>;
      },
    },
  ] : undefined;
  const results = doralEntryToTournament(entry);
  tagEvo(results, evo);
  return {
    key: entry.id,
    escalao: entry.category,
    tabLabel: entry.category,
    hasManuel: entry.players.some((p) => isM(p.name)),
    links: entry.sourceUrl ? [{ label: "GolfGenius", url: entry.sourceUrl, icon: "🔗" }] : undefined,
    results,
    scOptions: doralScorecardOptions(entry),
    siLabel: "m",
    evoCols,
    accHeader: hasEvo ? <EvoSummary evo={evo!} what="já passaram pelo Doral" detail={editionsBreakdown(evo!) || undefined} /> : undefined,
  };
}
