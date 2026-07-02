/**
 * AnaliseSection — secção de análise estilo Masters.com dentro do detalhe
 * de um jogador na KIDSPage.
 *
 * Quatro sub-tabs:
 *   1. Scoring — donuts eagles/birdies/pars/bogeys/DB+ vs field
 *   2. Por Ronda — R1..Rn em donuts, com totais
 *   3. F9 vs B9 — split consistência front/back
 *   4. Por Buraco — scoring vs par por buraco (bar chart)
 *
 * O "field" é o conjunto de scorecards no MESMO tid do torneio seleccionado
 * (que já inclui o escalão no sufixo — `usk{tcode}_b{n}`, `wjgc26`, etc.).
 */
import React, { useMemo, useState } from "react";
import type { AutoScorecard } from "../../data/KIDSdataLoader";
import { getScorecardsByTid, uskTournNames } from "../../data/KIDSdataLoader";
import {
  distFromRounds,
  distPct,
  perRoundDists,
  nineSplit,
  holeByHoleStats,
  aggregateField,
  type ScoringDist,
} from "../../utils/analysisStats";
import { normName } from "../../data/KIDSdataLoader";
import ComparisonDonut from "../../ui/ComparisonDonut";

type SubTab = "scoring" | "rounds" | "ninesplit" | "holes";

interface Props {
  playerName: string;
  scorecards: AutoScorecard[];   // do jogador seleccionado
  tornName?: (tid: string) => string;  // resolver nome bonito do tid → opcional
}

export default function AnaliseSection({ playerName, scorecards, tornName }: Props) {
  // Só tornam-se analisáveis scorecards com par hole-by-hole completo
  const valid = useMemo(
    () => scorecards.filter(sc => sc.par && sc.par.length === 18 && sc.rounds.length > 0),
    [scorecards],
  );

  const [selectedTid, setSelectedTid] = useState<string>("ALL");
  const [subTab, setSubTab] = useState<SubTab>("scoring");

  // Opções do selector de torneio
  const tournOpts = useMemo(() => {
    const m = new Map<string, AutoScorecard>();
    for (const sc of valid) m.set(sc.tid, sc);
    return Array.from(m.values()).map(sc => ({
      tid: sc.tid,
      label: labelOfTid(sc.tid, tornName),
    }));
  }, [valid, tornName]);

  // Scorecards a usar (player side)
  const playerCards = useMemo(
    () => selectedTid === "ALL" ? valid : valid.filter(sc => sc.tid === selectedTid),
    [valid, selectedTid],
  );

  // Flatten para análise agregada (quando "ALL")
  const aggregated = useMemo(() => aggregatePlayer(playerCards), [playerCards]);

  // Field scorecards para comparação (exclui o próprio jogador)
  const fieldData = useMemo(() => {
    const normPlayer = normName(playerName);
    const fieldCards: { normName: string; par: readonly number[]; rounds: readonly (readonly number[])[] }[] = [];
    const tids = selectedTid === "ALL"
      ? Array.from(new Set(valid.map(sc => sc.tid)))
      : [selectedTid];
    for (const tid of tids) {
      for (const sc of getScorecardsByTid(tid)) {
        if (!sc.par || sc.par.length !== 18) continue;
        fieldCards.push({ normName: sc.normName, par: sc.par, rounds: sc.rounds });
      }
    }
    return aggregateField(fieldCards, normPlayer);
  }, [valid, selectedTid, playerName]);

  if (valid.length === 0) {
    return (
      <div className="fs-11 c-text-3 p-10">
        — sem scorecards hole-by-hole disponíveis para análise —
      </div>
    );
  }

  return (
    <div>
      {/* Selector de torneio */}
      {tournOpts.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <button
            onClick={() => setSelectedTid("ALL")}
            className={"tourn-tab tourn-tab-sm" + (selectedTid === "ALL" ? " active" : " tourn-tab-muted")}
          >
            Todos ({valid.length})
          </button>
          {tournOpts.map(o => (
            <button
              key={o.tid}
              onClick={() => setSelectedTid(o.tid)}
              className={"tourn-tab tourn-tab-sm" + (selectedTid === o.tid ? " active" : " tourn-tab-muted")}
              title={o.tid}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, borderBottom: "1px solid var(--border-light)", paddingBottom: 8 }}>
        {([
          { k: "scoring",   l: "Scoring"   },
          { k: "rounds",    l: "Por Ronda" },
          { k: "ninesplit", l: "F9 vs B9"  },
          { k: "holes",     l: "Por Buraco"},
        ] as const).map(t => (
          <button
            key={t.k}
            onClick={() => setSubTab(t.k)}
            className={"tab-under" + (subTab === t.k ? " active" : "")}
            style={{ background: "none", border: "none", padding: "4px 10px", fontSize: "var(--fs-13)", fontWeight: 600, cursor: "pointer", color: subTab === t.k ? "var(--accent)" : "var(--text-2)" }}
          >
            {t.l}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {subTab === "scoring"   && <ScoringPane player={aggregated.dist} field={fieldData.dist} />}
      {subTab === "rounds"    && <RoundsPane  cards={playerCards} />}
      {subTab === "ninesplit" && <NineSplitPane cards={playerCards} fieldCards={
        selectedTid === "ALL"
          ? valid.flatMap(sc => getScorecardsByTid(sc.tid).filter(f => f.normName !== normName(playerName)))
          : getScorecardsByTid(selectedTid).filter(f => f.normName !== normName(playerName))
      } />}
      {subTab === "holes"     && <HolesPane player={aggregated} field={fieldData} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Helpers privados
   ───────────────────────────────────────────────────────────────── */

function labelOfTid(tid: string, resolver?: (t: string) => string): string {
  if (resolver) return resolver(tid);
  // Usa uskTournNames quando aplicável
  const m = tid.match(/^usk(\d+)/);
  if (m) {
    const meta = uskTournNames.get(`usk${m[1]}`);
    if (meta) {
      const ag = tid.match(/_b(\d+)/)?.[1];
      return ag ? `${meta.short} · B${ag}` : meta.short;
    }
  }
  return tid;
}

function aggregatePlayer(cards: AutoScorecard[]): {
  dist: ScoringDist;
  holeAvg: (number | null)[];
  nRounds: number;
  totalCards: number;
} {
  // Para múltiplos torneios, agrega todas as rondas com os respectivos pars
  const holeSum = new Array<number>(18).fill(0);
  const holeN   = new Array<number>(18).fill(0);
  let dist = { eagles:0, birdies:0, pars:0, bogeys:0, dbPlus:0, total:0 };
  let nRounds = 0;

  for (const sc of cards) {
    const d = distFromRounds(sc.rounds, sc.par);
    dist = {
      eagles:  dist.eagles  + d.eagles,
      birdies: dist.birdies + d.birdies,
      pars:    dist.pars    + d.pars,
      bogeys:  dist.bogeys  + d.bogeys,
      dbPlus:  dist.dbPlus  + d.dbPlus,
      total:   dist.total   + d.total,
    };
    for (const rd of sc.rounds) {
      if (rd.every(v => !v)) continue;
      nRounds++;
      for (let i = 0; i < Math.min(18, rd.length); i++) {
        const s = rd[i];
        if (s && s > 0) { holeSum[i] += s; holeN[i]++; }
      }
    }
  }
  const holeAvg = holeSum.map((s, i) => holeN[i] > 0 ? s / holeN[i] : null);
  return { dist, holeAvg, nRounds, totalCards: cards.length };
}

/* ═════════════════════════════════════════
   SCORING PANE — donuts estilo Masters
   ═════════════════════════════════════════ */

function ScoringPane({ player, field }: { player: ScoringDist; field: ScoringDist }) {
  const pp = distPct(player);
  const fp = distPct(field);
  const rows = [
    { key: "eagles",  label: "EAGLES",  pp: pp.eagles,  fp: fp.eagles,  n: player.eagles,  color: "var(--score-eagle)"        },
    { key: "birdies", label: "BIRDIES", pp: pp.birdies, fp: fp.birdies, n: player.birdies, color: "var(--score-birdie)"       },
    { key: "pars",    label: "PARS",    pp: pp.pars,    fp: fp.pars,    n: player.pars,    color: "var(--score-par-seg)"      },
    { key: "bogeys",  label: "BOGEYS",  pp: pp.bogeys,  fp: fp.bogeys,  n: player.bogeys,  color: "var(--score-bogey-border)" },
    { key: "dbPlus",  label: "DUPLO+",  pp: pp.dbPlus,  fp: fp.dbPlus,  n: player.dbPlus,  color: "var(--score-double)"       },
  ];
  return (
    <div>
      <div style={{ fontSize: "var(--fs-11)", color: "var(--text-3)", marginBottom: 10 }}>
        Distribuição de scoring · {player.total} buracos · field {field.total} buracos (escalão)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, justifyItems: "center" }}>
        {rows.map(r => (
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

function RoundsPane({ cards }: { cards: AutoScorecard[] }) {
  // Achata: uma entry por torneio-ronda
  const entries: { tid: string; tornLabel: string; round: number; gross: number | null; toPar: number | null; dist: ScoringDist }[] = [];
  for (const sc of cards) {
    const prs = perRoundDists(sc.rounds, sc.par);
    prs.forEach((prd, i) => {
      entries.push({
        tid: sc.tid,
        tornLabel: labelOfTid(sc.tid),
        round: i + 1,
        gross: prd.gross,
        toPar: prd.toPar,
        dist: prd.dist,
      });
    });
  }
  if (entries.length === 0) return <div className="fs-11 c-text-3 p-10">— sem rondas —</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {entries.map((e, i) => (
        <RoundBar key={i} entry={e} />
      ))}
    </div>
  );
}

function RoundBar({ entry }: { entry: { tid: string; tornLabel: string; round: number; gross: number | null; toPar: number | null; dist: ScoringDist } }) {
  const p = distPct(entry.dist);
  const segs = [
    { k: "eagles",  pct: p.eagles,  color: "var(--score-eagle)"        },
    { k: "birdies", pct: p.birdies, color: "var(--score-birdie)"       },
    { k: "pars",    pct: p.pars,    color: "var(--score-par-seg)"      },
    { k: "bogeys",  pct: p.bogeys,  color: "var(--score-bogey-border)" },
    { k: "dbPlus",  pct: p.dbPlus,  color: "var(--score-double)"       },
  ].filter(s => s.pct > 0);
  const tpColor = entry.toPar == null ? "var(--text-3)" : entry.toPar < 0 ? "var(--color-good-dark)" : entry.toPar > 0 ? "var(--color-warn)" : "var(--text-2)";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 80px 1fr 80px", alignItems: "center", gap: 10, fontSize: "var(--fs-12)" }}>
      <div style={{ fontWeight: 600, color: "var(--text)" }}>
        {entry.tornLabel} <span style={{ color: "var(--text-3)", fontWeight: 400 }}>· R{entry.round}</span>
      </div>
      <div style={{ textAlign: "center", fontWeight: 700, color: tpColor }}>
        {entry.gross != null ? `${entry.gross}` : "—"}
        {entry.toPar != null && <span style={{ fontSize: "var(--fs-10)", marginLeft: 4 }}>({entry.toPar > 0 ? `+${entry.toPar}` : entry.toPar})</span>}
      </div>
      <div style={{ display: "flex", height: 14, borderRadius: 3, overflow: "hidden", gap: 1, background: "var(--bg-muted)" }}>
        {segs.map(s => (
          <div key={s.k} style={{ flex: s.pct, background: s.color }} title={`${s.k}: ${s.pct.toFixed(0)}%`} />
        ))}
      </div>
      <div style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", textAlign: "right" }}>
        {entry.dist.birdies}🐦 · {entry.dist.bogeys + entry.dist.dbPlus}↑
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════
   NINE SPLIT PANE — F9 vs B9
   ═════════════════════════════════════════ */

function NineSplitPane({ cards, fieldCards }: { cards: AutoScorecard[]; fieldCards: { par: readonly number[]; rounds: readonly (readonly number[])[] }[] }) {
  // Agrega por jogador (player vs field)
  const pAgg = nineAggregate(cards);
  const fAgg = nineAggregate(fieldCards as AutoScorecard[]);

  const item = (label: string, toPar: number | null, dist: ScoringDist, fieldToPar: number | null) => {
    const pp = distPct(dist);
    return (
      <div style={{ padding: "12px 16px", border: "1px solid var(--border-light)", borderRadius: "var(--radius)" }}>
        <div style={{ fontSize: "var(--fs-11)", color: "var(--text-3)", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: "var(--fs-28)", fontWeight: 800, color: toPar == null ? "var(--text-3)" : toPar < 0 ? "var(--color-good-dark)" : toPar > 0 ? "var(--color-warn)" : "var(--text)" }}>
            {toPar != null ? (toPar >= 0 ? `+${toPar.toFixed(1)}` : toPar.toFixed(1)) : "—"}
          </span>
          <span style={{ fontSize: "var(--fs-11)", color: "var(--text-3)" }}>
            ±par média
            {fieldToPar != null && <span> · field {fieldToPar >= 0 ? "+" : ""}{fieldToPar.toFixed(1)}</span>}
          </span>
        </div>
        {/* Mini barra de distribuição */}
        <div style={{ display: "flex", height: 10, borderRadius: 3, overflow: "hidden", gap: 1, background: "var(--bg-muted)" }}>
          {(["eagles","birdies","pars","bogeys","dbPlus"] as const).map(k => (
            <div key={k} style={{
              flex: (pp as Record<string, number>)[k],
              background: k === "eagles" ? "var(--score-eagle)" : k === "birdies" ? "var(--score-birdie)" : k === "pars" ? "var(--score-par-seg)" : k === "bogeys" ? "var(--score-bogey-border)" : "var(--score-double)",
            }} title={`${k}: ${(pp as Record<string, number>)[k].toFixed(0)}%`} />
          ))}
        </div>
        <div style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", marginTop: 4 }}>
          {dist.birdies}🐦 · {dist.pars} pars · {dist.bogeys}↑ · {dist.dbPlus}↑↑
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ fontSize: "var(--fs-11)", color: "var(--text-3)", marginBottom: 10 }}>
        Consistência entre nove da frente e nove do fundo.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {item("FRONT 9 (1-9)", pAgg.frontToParAvg, pAgg.front, fAgg.frontToParAvg)}
        {item("BACK 9 (10-18)", pAgg.backToParAvg, pAgg.back, fAgg.backToParAvg)}
      </div>
    </div>
  );
}

function nineAggregate(cards: AutoScorecard[]): ReturnType<typeof nineSplit> {
  // Junta todas as rondas de todos os cards num só nineSplit, respeitando o par de cada ronda.
  // Como nineSplit assume par único, simulamos passando ronda-a-ronda.
  const accFront = { eagles:0, birdies:0, pars:0, bogeys:0, dbPlus:0, total:0 };
  const accBack  = { eagles:0, birdies:0, pars:0, bogeys:0, dbPlus:0, total:0 };
  const frontTps: number[] = [], backTps: number[] = [];
  const frontGs: number[] = [], backGs: number[] = [];

  for (const sc of cards) {
    const ns = nineSplit(sc.rounds, sc.par);
    Object.assign(accFront, {
      eagles: accFront.eagles + ns.front.eagles,
      birdies: accFront.birdies + ns.front.birdies,
      pars:    accFront.pars    + ns.front.pars,
      bogeys:  accFront.bogeys  + ns.front.bogeys,
      dbPlus:  accFront.dbPlus  + ns.front.dbPlus,
      total:   accFront.total   + ns.front.total,
    });
    Object.assign(accBack, {
      eagles: accBack.eagles + ns.back.eagles,
      birdies: accBack.birdies + ns.back.birdies,
      pars:    accBack.pars    + ns.back.pars,
      bogeys:  accBack.bogeys  + ns.back.bogeys,
      dbPlus:  accBack.dbPlus  + ns.back.dbPlus,
      total:   accBack.total   + ns.back.total,
    });
    if (ns.frontToParAvg != null) frontTps.push(ns.frontToParAvg);
    if (ns.backToParAvg  != null) backTps.push(ns.backToParAvg);
    if (ns.frontAvg      != null) frontGs.push(ns.frontAvg);
    if (ns.backAvg       != null) backGs.push(ns.backAvg);
  }
  const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return {
    front: accFront, back: accBack,
    frontAvg: avg(frontGs), backAvg: avg(backGs),
    frontToParAvg: avg(frontTps), backToParAvg: avg(backTps),
  };
}

/* ═════════════════════════════════════════
   HOLES PANE — gráfico de barras por buraco
   ═════════════════════════════════════════ */

function HolesPane({ player, field }: {
  player: { holeAvg: (number | null)[]; dist: ScoringDist };
  field:  { holeAvg: (number | null)[] };
}) {
  // Calcula os 18 datapoints com média de avgs dos cards agregados
  // Como precisamos de par, usamos o par médio inferido — mas o avg-toPar
  // por buraco já é calculável se todos os cards partilharem o mesmo par. Para
  // torneios diferentes, mostramos avg absoluto (strokes) em vez de toPar.
  const rows = player.holeAvg.map((avg, i) => ({
    hole: i + 1,
    avg,
    fieldAvg: field.holeAvg[i] ?? null,
  }));
  const maxAvg = Math.max(...rows.map(r => Math.max(r.avg ?? 0, r.fieldAvg ?? 0)));
  const minAvg = Math.min(...rows.filter(r => r.avg != null || r.fieldAvg != null).map(r => Math.min(r.avg ?? 99, r.fieldAvg ?? 99)));
  const range = Math.max(maxAvg - minAvg, 0.5);

  return (
    <div>
      <div style={{ fontSize: "var(--fs-11)", color: "var(--text-3)", marginBottom: 10 }}>
        Média de strokes por buraco — jogador (verde) vs field (cinza).
      </div>
      <div className="scroll-x">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(18, minmax(20px, 1fr))", gap: 2, alignItems: "end", height: 140, minWidth: 360 }}>
          {rows.map(r => {
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
                <div style={{ fontSize: "var(--fs-9)", color: "var(--text-3)" }}>{r.hole}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: "var(--fs-10)", color: "var(--text-3)", marginTop: 8, justifyContent: "center" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--accent)", borderRadius: "var(--radius-xs)", marginRight: 4 }} />jogador</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--text-3)", borderRadius: "var(--radius-xs)", marginRight: 4 }} />field (escalao)</span>
      </div>
    </div>
  );
}
