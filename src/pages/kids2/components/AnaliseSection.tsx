/**
 * kids2/components/AnaliseSection.tsx
 *
 * Análise hole-by-hole estilo Masters — porta a AnaliseSection da KIDSPage
 * mas alimentada pela camada de dados canónica (juniors.json + tournaments).
 *
 * Quatro sub-tabs:
 *   • Scoring  — donuts eagles/birdies/pars/bogeys/duplo+ (jogador vs field)
 *   • Por Ronda — uma barra por ronda com gross + ±par + distribuição
 *   • F9 vs B9 — split consistência front/back
 *   • Por Buraco — bar chart por buraco (jogador vs field)
 *
 * Field = todos os outros jogadores nos mesmos flights (mesmo escalão e ronda).
 */

import { useMemo, useState } from "react";
import type { CanonicalData, Junior, Tournament, Flight } from "../data";
import { normName } from "../data";
import {
  distFromRounds,
  distPct,
  perRoundDists,
  nineSplit,
  aggregateField,
  type ScoringDist,
} from "../../../utils/analysisStats";
import { fmtToPar } from "../../../utils/format";
import { tpColor } from "../../../ui/tournamentPrimitives";
import ComparisonDonut from "../../../ui/ComparisonDonut";

type SubTab = "scoring" | "rounds" | "ninesplit" | "holes";

interface Props {
  data: CanonicalData;
  junior: Junior;
  filterTids?: Set<string> | null;
}

// Scorecard derivado do canónico — usado tanto para o jogador como para o field.
interface DerivedCard {
  tid: string;
  flightKey: string;
  tornLabel: string;
  flightLabel: string;
  par: readonly number[];
  rounds: readonly (readonly number[])[];
  normName: string;
}

/** Extrai scorecards 18H completos de um junior. */
function extractJuniorScorecards(junior: Junior, data: CanonicalData, filterTids?: Set<string> | null): DerivedCard[] {
  const out: DerivedCard[] = [];
  for (const tid of junior.tournamentIds) {
    if (filterTids && !filterTids.has(tid)) continue;
    const t = data.tournamentById.get(tid);
    if (!t) continue;
    for (const f of t.flights) {
      const r = f.results.find((x) => x.juniorId === junior.id);
      if (!r) continue;
      const par = f.par || [];
      if (par.length !== 18 || par.filter((p) => p > 0).length !== 18) continue;
      const rounds = (r.rounds || [])
        .map((rd) => rd.strokes || [])
        .filter((s) => s.length === 18 && s.some((v) => v > 0));
      if (rounds.length === 0) continue;
      out.push({
        tid,
        flightKey: f.flightKey,
        tornLabel: t.name || t.shortName || tid,
        flightLabel: f.label,
        par,
        rounds,
        normName: normName(junior.canonicalName),
      });
    }
  }
  return out;
}

/** Extrai scorecards do field (todos os outros jogadores nos mesmos flights). */
function extractFieldCards(data: CanonicalData, flights: Array<{ tournament: Tournament; flight: Flight }>, excludeNormName: string): DerivedCard[] {
  const out: DerivedCard[] = [];
  for (const { tournament: t, flight: f } of flights) {
    const par = f.par || [];
    if (par.length !== 18 || par.filter((p) => p > 0).length !== 18) continue;
    for (const r of f.results) {
      const j = data.juniorById.get(r.juniorId);
      if (!j) continue;
      const nn = normName(j.canonicalName);
      if (nn === excludeNormName) continue;
      const rounds = (r.rounds || [])
        .map((rd) => rd.strokes || [])
        .filter((s) => s.length === 18 && s.some((v) => v > 0));
      if (rounds.length === 0) continue;
      out.push({
        tid: t.id,
        flightKey: f.flightKey,
        tornLabel: t.name || t.shortName || t.id,
        flightLabel: f.label,
        par,
        rounds,
        normName: nn,
      });
    }
  }
  return out;
}

export default function AnaliseSection({ data, junior, filterTids }: Props) {
  const valid = useMemo(() => extractJuniorScorecards(junior, data, filterTids), [data, junior, filterTids]);
  const [selectedFlight, setSelectedFlight] = useState<string>("ALL");
  const [subTab, setSubTab] = useState<SubTab>("scoring");

  // Opções de selector — uma por flight (tid + flightKey)
  const flightOpts = useMemo(() => {
    const m = new Map<string, { key: string; tid: string; flightKey: string; label: string }>();
    for (const sc of valid) {
      const key = `${sc.tid}__${sc.flightKey}`;
      if (!m.has(key)) {
        m.set(key, {
          key,
          tid: sc.tid,
          flightKey: sc.flightKey,
          label: `${shortenTournLabel(sc.tornLabel)} · ${sc.flightLabel}`,
        });
      }
    }
    return Array.from(m.values());
  }, [valid]);

  // Scorecards do jogador filtrados
  const playerCards = useMemo(
    () => selectedFlight === "ALL" ? valid : valid.filter((sc) => `${sc.tid}__${sc.flightKey}` === selectedFlight),
    [valid, selectedFlight],
  );

  // Flights a usar para field
  const flightsForField = useMemo(() => {
    const out: Array<{ tournament: Tournament; flight: Flight }> = [];
    const targetKeys = new Set(playerCards.map((sc) => `${sc.tid}__${sc.flightKey}`));
    for (const tid of new Set(playerCards.map((sc) => sc.tid))) {
      const t = data.tournamentById.get(tid);
      if (!t) continue;
      for (const f of t.flights) {
        if (targetKeys.has(`${tid}__${f.flightKey}`)) out.push({ tournament: t, flight: f });
      }
    }
    return out;
  }, [data, playerCards]);

  const fieldCards = useMemo(
    () => extractFieldCards(data, flightsForField, normName(junior.canonicalName)),
    [data, flightsForField, junior.canonicalName],
  );

  // Agregado do jogador
  const aggregated = useMemo(() => {
    const holeSum = new Array<number>(18).fill(0);
    const holeN = new Array<number>(18).fill(0);
    let dist: ScoringDist = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, dbPlus: 0, total: 0 };

    for (const sc of playerCards) {
      const d = distFromRounds(sc.rounds, sc.par);
      dist = {
        eagles: dist.eagles + d.eagles,
        birdies: dist.birdies + d.birdies,
        pars: dist.pars + d.pars,
        bogeys: dist.bogeys + d.bogeys,
        dbPlus: dist.dbPlus + d.dbPlus,
        total: dist.total + d.total,
      };
      for (const rd of sc.rounds) {
        for (let i = 0; i < Math.min(18, rd.length); i++) {
          const s = rd[i];
          if (s && s > 0) { holeSum[i] += s; holeN[i]++; }
        }
      }
    }
    const holeAvg = holeSum.map((s, i) => holeN[i] > 0 ? s / holeN[i] : null);
    return { dist, holeAvg };
  }, [playerCards]);

  // Field agregado
  const fieldAgg = useMemo(
    () => aggregateField(fieldCards, normName(junior.canonicalName)),
    [fieldCards, junior.canonicalName],
  );

  if (valid.length === 0) {
    return (
      <section>
        <h3 className="u-m-8px-0-10px u-fs-fs-14 u-fw-700 u-c-text">Análise</h3>
        <div className="u-fs-fs-12 u-c-text-3 u-p-12px-16px u-bg-bg-muted u-br-radius">
          — sem scorecards hole-by-hole disponíveis para análise —
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="u-d-flex u-ai-baseline u-jc-space-between u-m-8px-0-10px">
        <h3 className="u-m-0 u-fs-fs-14 u-fw-700 u-c-text">Análise</h3>
        <span className="u-fs-fs-11 u-c-text-3">
          {valid.length} {valid.length === 1 ? "torneio" : "torneios"} com scorecard
          {fieldCards.length > 0 && <> · field {fieldCards.length}</>}
        </span>
      </div>

      {/* Selector de torneio/escalão como dropdown (em vez de N pills) */}
      {flightOpts.length > 1 && (
        <div className="u-d-flex u-gap-8px u-ai-center u-mb-10px">
          <label className="u-fs-fs-11 u-c-text-3 u-fw-600">
            Torneio / escalão
          </label>
          <select
            value={selectedFlight}
            onChange={(e) => setSelectedFlight(e.target.value)}
            className="u-fl-1 u-maxw-460px u-p-4px-8px u-fs-fs-12 u-fw-500 u-bd-1px-solid-border u-br-radius u-bg-bg u-c-text u-cur-pointer"
          >
            <option value="ALL">Todos os {valid.length} torneios</option>
            {flightOpts.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="tabbar-under">
        {([
          { k: "scoring", l: "Scoring" },
          { k: "rounds", l: "Por Ronda" },
          { k: "ninesplit", l: "F9 vs B9" },
          { k: "holes", l: "Por Buraco" },
        ] as const).map((t) => (
          <button
            key={t.k}
            onClick={() => setSubTab(t.k)}
            className={"tab-under" + (subTab === t.k ? " active" : "")}
          >
            {t.l}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {subTab === "scoring" && <ScoringPane player={aggregated.dist} field={fieldAgg.dist} />}
      {subTab === "rounds" && <RoundsPane cards={playerCards} />}
      {subTab === "ninesplit" && <NineSplitPane cards={playerCards} fieldCards={fieldCards} />}
      {subTab === "holes" && <HolesPane player={aggregated} field={fieldAgg} />}
    </section>
  );
}

function shortenTournLabel(s: string): string {
  return s.replace(/\b20\d{2}\b/g, "").replace(/\s+/g, " ").trim().slice(0, 28) || s;
}

/* ═════════════════════════════════════════
   SCORING PANE — donuts
   ═════════════════════════════════════════ */

function ScoringPane({ player, field }: { player: ScoringDist; field: ScoringDist }) {
  const pp = distPct(player);
  const fp = distPct(field);
  const rows = [
    { key: "eagles", label: "EAGLES+", pp: pp.eagles, fp: fp.eagles, n: player.eagles, color: "var(--score-eagle)" },
    { key: "birdies", label: "BIRDIES", pp: pp.birdies, fp: fp.birdies, n: player.birdies, color: "var(--score-birdie)" },
    { key: "pars", label: "PARS", pp: pp.pars, fp: fp.pars, n: player.pars, color: "var(--score-par-seg)" },
    { key: "bogeys", label: "BOGEYS", pp: pp.bogeys, fp: fp.bogeys, n: player.bogeys, color: "var(--score-bogey-border)" },
    { key: "dbPlus", label: "DUPLO+", pp: pp.dbPlus, fp: fp.dbPlus, n: player.dbPlus, color: "var(--score-double)" },
  ];
  return (
    <div>
      <div className="u-fs-fs-11 u-c-text-3 u-mb-10px">
        Distribuição de scoring · {player.total} buracos do jogador · field {field.total} buracos
      </div>
      <div className="u-d-grid u-grid-template-columns-t0day u-gap-12px u-justify-items-center">
        {rows.map((r) => (
          <ComparisonDonut
            key={r.key}
            label={r.label}
            playerPct={r.pp}
            fieldPct={field.total > 0 ? r.fp : null}
            caption={`${r.n} buracos`}
            playerColor={r.color}
            size={130}
          />
        ))}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════
   ROUNDS PANE — uma mini-entry por ronda
   ═════════════════════════════════════════ */

function RoundsPane({ cards }: { cards: DerivedCard[] }) {
  const entries: { tornLabel: string; round: number; gross: number | null; toPar: number | null; dist: ScoringDist }[] = [];
  for (const sc of cards) {
    const prs = perRoundDists(sc.rounds, sc.par);
    prs.forEach((prd, i) => {
      entries.push({
        tornLabel: shortenTournLabel(sc.tornLabel),
        round: i + 1,
        gross: prd.gross,
        toPar: prd.toPar,
        dist: prd.dist,
      });
    });
  }
  if (entries.length === 0) return <div className="u-fs-fs-11 u-c-text-3 u-p-10px">— sem rondas —</div>;

  return (
    <div className="u-d-flex u-fd-column u-gap-8px">
      {entries.map((e, i) => (
        <RoundBar key={i} entry={e} />
      ))}
    </div>
  );
}

function RoundBar({ entry }: { entry: { tornLabel: string; round: number; gross: number | null; toPar: number | null; dist: ScoringDist } }) {
  const p = distPct(entry.dist);
  const segs = [
    { k: "eagles", pct: p.eagles, color: "var(--score-eagle)" },
    { k: "birdies", pct: p.birdies, color: "var(--score-birdie)" },
    { k: "pars", pct: p.pars, color: "var(--score-par-seg)" },
    { k: "bogeys", pct: p.bogeys, color: "var(--score-bogey-border)" },
    { k: "dbPlus", pct: p.dbPlus, color: "var(--score-double)" },
  ].filter((s) => s.pct > 0);
  const tpCol = entry.toPar == null ? "var(--text-3)" : tpColor(entry.toPar) ?? "var(--text-2)";
  return (
    <div className="u-d-grid u-grid-template-columns-17av9 u-ai-center u-gap-10px u-fs-fs-12">
      <div className="u-fw-600 u-c-text u-ov-hidden u-tov-ellipsis u-ws-nowrap">
        {entry.tornLabel} <span className="u-c-text-3 u-fw-400">· R{entry.round}</span>
      </div>
      <div style={{ textAlign: "center", fontWeight: 700, color: tpCol, fontVariantNumeric: "tabular-nums" }}>
        {entry.gross != null ? `${entry.gross}` : "—"}
        {entry.toPar != null && <span className="u-fs-fs-10 u-ml-4px">({fmtToPar(entry.toPar)})</span>}
      </div>
      <div className="u-d-flex u-h-14px u-br-radius-sm u-ov-hidden u-gap-1px u-bg-bg-muted">
        {segs.map((s) => (
          <div key={s.k} style={{ flex: s.pct, background: s.color }} title={`${s.k}: ${s.pct.toFixed(0)}%`} />
        ))}
      </div>
      <div className="u-fs-fs-10 u-c-text-3 u-ta-right">
        {entry.dist.birdies}🐦 · {entry.dist.bogeys + entry.dist.dbPlus}↑
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════
   NINE SPLIT PANE — F9 vs B9
   ═════════════════════════════════════════ */

function NineSplitPane({ cards, fieldCards }: { cards: DerivedCard[]; fieldCards: DerivedCard[] }) {
  const pAgg = nineAggregate(cards);
  const fAgg = nineAggregate(fieldCards);

  const item = (label: string, toPar: number | null, dist: ScoringDist, fieldToPar: number | null) => {
    const pp = distPct(dist);
    return (
      <div className="u-p-14px-16px u-bd-1px-solid-border-light u-br-radius u-bg-bg">
        <div className="u-fs-fs-11 u-c-text-3 u-ls-0_6px u-fw-700 u-mb-4px u-tt-uppercase">{label}</div>
        <div className="u-d-flex u-ai-baseline u-gap-8px u-mb-10px">
          <span style={{ fontSize: "var(--fs-28)", fontWeight: 800, color: toPar == null ? "var(--text-3)" : tpColor(toPar) ?? "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {toPar != null ? (toPar >= 0 ? `+${toPar.toFixed(1)}` : toPar.toFixed(1)) : "—"}
          </span>
          <span className="u-fs-fs-11 u-c-text-3">
            ±par média
            {fieldToPar != null && <span> · field {fieldToPar >= 0 ? "+" : ""}{fieldToPar.toFixed(1)}</span>}
          </span>
        </div>
        <div className="u-d-flex u-h-10px u-br-radius-sm u-ov-hidden u-gap-1px u-bg-bg-muted">
          {(["eagles", "birdies", "pars", "bogeys", "dbPlus"] as const).map((k) => (
            <div key={k} style={{
              flex: (pp as Record<string, number>)[k],
              background: k === "eagles" ? "var(--score-eagle)" : k === "birdies" ? "var(--score-birdie)" : k === "pars" ? "var(--score-par-seg)" : k === "bogeys" ? "var(--score-bogey-border)" : "var(--score-double)",
            }} title={`${k}: ${(pp as Record<string, number>)[k].toFixed(0)}%`} />
          ))}
        </div>
        <div className="u-fs-fs-10 u-c-text-3 u-mt-4px">
          {dist.birdies}🐦 · {dist.pars} pars · {dist.bogeys}↑ · {dist.dbPlus}↑↑
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="u-fs-fs-11 u-c-text-3 u-mb-10px">
        Consistência entre nove da frente (1–9) e nove do fundo (10–18).
      </div>
      <div className="u-d-grid u-grid-template-columns-1fr-1fr u-gap-12px">
        {item("FRONT 9 (1-9)", pAgg.frontToParAvg, pAgg.front, fAgg.frontToParAvg)}
        {item("BACK 9 (10-18)", pAgg.backToParAvg, pAgg.back, fAgg.backToParAvg)}
      </div>
    </div>
  );
}

function nineAggregate(cards: DerivedCard[]) {
  const accFront = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, dbPlus: 0, total: 0 };
  const accBack = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, dbPlus: 0, total: 0 };
  const frontTps: number[] = [], backTps: number[] = [];

  for (const sc of cards) {
    const ns = nineSplit(sc.rounds, sc.par);
    accFront.eagles += ns.front.eagles;
    accFront.birdies += ns.front.birdies;
    accFront.pars += ns.front.pars;
    accFront.bogeys += ns.front.bogeys;
    accFront.dbPlus += ns.front.dbPlus;
    accFront.total += ns.front.total;
    accBack.eagles += ns.back.eagles;
    accBack.birdies += ns.back.birdies;
    accBack.pars += ns.back.pars;
    accBack.bogeys += ns.back.bogeys;
    accBack.dbPlus += ns.back.dbPlus;
    accBack.total += ns.back.total;
    if (ns.frontToParAvg != null) frontTps.push(ns.frontToParAvg);
    if (ns.backToParAvg != null) backTps.push(ns.backToParAvg);
  }
  const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return {
    front: accFront, back: accBack,
    frontToParAvg: avg(frontTps), backToParAvg: avg(backTps),
  };
}

/* ═════════════════════════════════════════
   HOLES PANE — média por buraco
   ═════════════════════════════════════════ */

function HolesPane({ player, field }: {
  player: { holeAvg: (number | null)[]; dist: ScoringDist };
  field: { holeAvg: (number | null)[] };
}) {
  const rows = player.holeAvg.map((avg, i) => ({
    hole: i + 1,
    avg,
    fieldAvg: field.holeAvg[i] ?? null,
  }));
  const allVals = rows.flatMap((r) => [r.avg, r.fieldAvg]).filter((v): v is number => v != null);
  if (allVals.length === 0) {
    return <div className="u-fs-fs-11 u-c-text-3 u-p-10px">— sem dados —</div>;
  }
  const maxAvg = Math.max(...allVals);
  const minAvg = Math.min(...allVals);
  const range = Math.max(maxAvg - minAvg, 0.5);

  return (
    <div>
      <div className="u-fs-fs-11 u-c-text-3 u-mb-10px">
        Média de strokes por buraco — jogador (cor) vs field (cinzento).
      </div>
      <div className="scroll-x">
        <div className="u-d-grid u-grid-template-columns-1ncbo u-gap-2px u-ai-end u-h-160px u-minw-360px">
          {rows.map((r) => {
            const pHeight = r.avg != null ? ((r.avg - minAvg) / range) * 100 : 0;
            const fHeight = r.fieldAvg != null ? ((r.fieldAvg - minAvg) / range) * 100 : 0;
            return (
              <div key={r.hole} className="u-d-flex u-fd-column u-ai-center u-gap-2px u-h-100pc">
                <div className="u-fl-1 u-d-flex u-ai-flex-end u-gap-1px u-w-100pc u-jc-center">
                  <div title={`Jogador ${r.hole}: ${r.avg?.toFixed(2) ?? "—"}`}
                    style={{ width: "40%", height: `${pHeight}%`, minHeight: r.avg != null ? 2 : 0, background: "var(--accent)", borderRadius: "2px 2px 0 0" }} />
                  <div title={`Field ${r.hole}: ${r.fieldAvg?.toFixed(2) ?? "—"}`}
                    style={{ width: "40%", height: `${fHeight}%`, minHeight: r.fieldAvg != null ? 2 : 0, background: "var(--text-3)", borderRadius: "2px 2px 0 0" }} />
                </div>
                <div className="u-fs-fs-9 u-c-text-3">{r.hole}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="u-d-flex u-gap-14px u-fs-fs-10 u-c-text-3 u-mt-8px u-jc-center">
        <span><span className="u-d-inline-block u-w-10px u-h-10px u-bg-accent u-br-radius-xs u-mr-4px" />jogador</span>
        <span><span className="u-d-inline-block u-w-10px u-h-10px u-bg-text-3 u-br-radius-xs u-mr-4px" />field (escalão)</span>
      </div>
    </div>
  );
}
