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

import React, { useMemo, useState } from "react";
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
        <h3 style={{ margin: "8px 0 10px", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Análise</h3>
        <div style={{ fontSize: 12, color: "var(--text-3)", padding: "12px 14px", background: "var(--bg-muted)", borderRadius: 6 }}>
          — sem scorecards hole-by-hole disponíveis para análise —
        </div>
      </section>
    );
  }

  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "8px 0 10px" }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Análise</h3>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>
          {valid.length} {valid.length === 1 ? "torneio" : "torneios"} com scorecard
          {fieldCards.length > 0 && <> · field {fieldCards.length}</>}
        </span>
      </div>

      {/* Selector de torneio/escalão como dropdown (em vez de N pills) */}
      {flightOpts.length > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>
            Torneio / escalão
          </label>
          <select
            value={selectedFlight}
            onChange={(e) => setSelectedFlight(e.target.value)}
            style={{
              flex: 1, maxWidth: 460, padding: "5px 8px",
              fontSize: 12, fontWeight: 500,
              border: "1px solid var(--border)", borderRadius: 6,
              background: "var(--bg)", color: "var(--text)",
              cursor: "pointer",
            }}
          >
            <option value="ALL">Todos os {valid.length} torneios</option>
            {flightOpts.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, borderBottom: "1px solid var(--border-light)" }}>
        {([
          { k: "scoring", l: "Scoring" },
          { k: "rounds", l: "Por Ronda" },
          { k: "ninesplit", l: "F9 vs B9" },
          { k: "holes", l: "Por Buraco" },
        ] as const).map((t) => (
          <button
            key={t.k}
            onClick={() => setSubTab(t.k)}
            style={{
              background: "none",
              border: "none",
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              color: subTab === t.k ? "var(--accent)" : "var(--text-2)",
              borderBottom: subTab === t.k ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1,
            }}
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
    { key: "birdies", label: "BIRDIES", pp: pp.birdies, fp: fp.birdies, n: player.birdies, color: "var(--medal-gold)" },
    { key: "pars", label: "PARS", pp: pp.pars, fp: fp.pars, n: player.pars, color: "var(--color-good-dark)" },
    { key: "bogeys", label: "BOGEYS", pp: pp.bogeys, fp: fp.bogeys, n: player.bogeys, color: "var(--color-warn)" },
    { key: "dbPlus", label: "DUPLO+", pp: pp.dbPlus, fp: fp.dbPlus, n: player.dbPlus, color: "var(--color-bad-dark)" },
  ];
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 10 }}>
        Distribuição de scoring · {player.total} buracos do jogador · field {field.total} buracos
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, justifyItems: "center" }}>
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
  if (entries.length === 0) return <div style={{ fontSize: 11, color: "var(--text-3)", padding: 10 }}>— sem rondas —</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
    { k: "birdies", pct: p.birdies, color: "var(--medal-gold)" },
    { k: "pars", pct: p.pars, color: "var(--color-good-light)" },
    { k: "bogeys", pct: p.bogeys, color: "var(--color-warn)" },
    { k: "dbPlus", pct: p.dbPlus, color: "var(--color-bad-dark)" },
  ].filter((s) => s.pct > 0);
  const tpColor = entry.toPar == null ? "var(--text-3)" : entry.toPar < 0 ? "var(--color-good-dark)" : entry.toPar > 0 ? "var(--color-warn)" : "var(--text-2)";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1.5fr) 90px 1fr 90px", alignItems: "center", gap: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {entry.tornLabel} <span style={{ color: "var(--text-3)", fontWeight: 400 }}>· R{entry.round}</span>
      </div>
      <div style={{ textAlign: "center", fontWeight: 700, color: tpColor, fontVariantNumeric: "tabular-nums" }}>
        {entry.gross != null ? `${entry.gross}` : "—"}
        {entry.toPar != null && <span style={{ fontSize: 10, marginLeft: 4 }}>({entry.toPar > 0 ? `+${entry.toPar}` : entry.toPar})</span>}
      </div>
      <div style={{ display: "flex", height: 14, borderRadius: 3, overflow: "hidden", gap: 1, background: "var(--bg-muted)" }}>
        {segs.map((s) => (
          <div key={s.k} style={{ flex: s.pct, background: s.color }} title={`${s.k}: ${s.pct.toFixed(0)}%`} />
        ))}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-3)", textAlign: "right" }}>
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
      <div style={{ padding: "14px 16px", border: "1px solid var(--border-light)", borderRadius: 6, background: "var(--bg)" }}>
        <div style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: 0.6, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: toPar == null ? "var(--text-3)" : toPar < 0 ? "var(--color-good-dark)" : toPar > 0 ? "var(--color-warn)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {toPar != null ? (toPar >= 0 ? `+${toPar.toFixed(1)}` : toPar.toFixed(1)) : "—"}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            ±par média
            {fieldToPar != null && <span> · field {fieldToPar >= 0 ? "+" : ""}{fieldToPar.toFixed(1)}</span>}
          </span>
        </div>
        <div style={{ display: "flex", height: 10, borderRadius: 3, overflow: "hidden", gap: 1, background: "var(--bg-muted)" }}>
          {(["eagles", "birdies", "pars", "bogeys", "dbPlus"] as const).map((k) => (
            <div key={k} style={{
              flex: (pp as Record<string, number>)[k],
              background: k === "eagles" ? "var(--score-eagle)" : k === "birdies" ? "var(--medal-gold)" : k === "pars" ? "var(--color-good-light)" : k === "bogeys" ? "var(--color-warn)" : "var(--color-bad-dark)",
            }} title={`${k}: ${(pp as Record<string, number>)[k].toFixed(0)}%`} />
          ))}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 5 }}>
          {dist.birdies}🐦 · {dist.pars} pars · {dist.bogeys}↑ · {dist.dbPlus}↑↑
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 10 }}>
        Consistência entre nove da frente (1–9) e nove do fundo (10–18).
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
    return <div style={{ fontSize: 11, color: "var(--text-3)", padding: 10 }}>— sem dados —</div>;
  }
  const maxAvg = Math.max(...allVals);
  const minAvg = Math.min(...allVals);
  const range = Math.max(maxAvg - minAvg, 0.5);

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 10 }}>
        Média de strokes por buraco — jogador (cor) vs field (cinzento).
      </div>
      <div className="scroll-x">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(18, minmax(20px, 1fr))", gap: 2, alignItems: "end", height: 160, minWidth: 360 }}>
          {rows.map((r) => {
            const pHeight = r.avg != null ? ((r.avg - minAvg) / range) * 100 : 0;
            const fHeight = r.fieldAvg != null ? ((r.fieldAvg - minAvg) / range) * 100 : 0;
            return (
              <div key={r.hole} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, height: "100%" }}>
                <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 1, width: "100%", justifyContent: "center" }}>
                  <div title={`Jogador ${r.hole}: ${r.avg?.toFixed(2) ?? "—"}`}
                    style={{ width: "40%", height: `${pHeight}%`, minHeight: r.avg != null ? 2 : 0, background: "var(--accent)", borderRadius: "2px 2px 0 0" }} />
                  <div title={`Field ${r.hole}: ${r.fieldAvg?.toFixed(2) ?? "—"}`}
                    style={{ width: "40%", height: `${fHeight}%`, minHeight: r.fieldAvg != null ? 2 : 0, background: "var(--text-3)", borderRadius: "2px 2px 0 0" }} />
                </div>
                <div style={{ fontSize: 9, color: "var(--text-3)" }}>{r.hole}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 10, color: "var(--text-3)", marginTop: 8, justifyContent: "center" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--accent)", borderRadius: 2, marginRight: 4 }} />jogador</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--text-3)", borderRadius: 2, marginRight: 4 }} />field (escalão)</span>
      </div>
    </div>
  );
}
