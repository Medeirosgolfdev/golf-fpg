/**
 * FieldPlayerDetail — scorecard view for BJGT field players
 */
import React from "react";
import {
  fmtSign,
  fmtToPar,
  firstName,
} from "../utils/format";
import { FL } from "../utils/flagUtils";
import { meanArr } from "../utils/mathUtils";
import { scClass, toParClass, sc3m, tpColorDark } from "../utils/scoreDisplay";
import KpiCard from "./KpiCard";
import EmptyState from "./EmptyState";
import { FIELD_2025, VP_PAR, FIELD_CARDS } from "../data/rivalData";
import { tpColor } from "./tournamentPrimitives";
import type { RivalPlayer } from "./bjgtAnalysisTypes";

interface FieldPlayerDetailProps {
  playerName: string;
  onBack: () => void;
  T: Array<{
    id: string;
    name: string;
    short: string;
    date: string;
    par: number;
    rounds: number;
  }>;
  D: RivalPlayer[];
}

export default function FieldPlayerDetail({
  playerName,
  onBack,
  T,
  D,
}: FieldPlayerDetailProps) {
  const card = FIELD_CARDS.find(c => c.name === playerName);
  const lbEntry = FIELD_2025.leaderboard.find(p => p.name === playerName);
  const rival = D.find(d => d.n === playerName);

  if (!lbEntry && !rival)
    return (
      <div className="tourn-section">
        <button
          className="p p-filter active mb-8"
          onClick={onBack}
          title="Voltar à lista"
        >
          ← Voltar
        </button>
        <EmptyState
          size="sm"
          message={`Sem dados disponíveis para ${playerName}`}
        />
      </div>
    );

  const par = VP_PAR;
  const FH = FIELD_2025.holes;
  const frontPar = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const backPar = par.slice(9).reduce((a, b) => a + b, 0);
  const totalPar = frontPar + backPar;
  const sm = (arr: number[], f: number, t: number) =>
    arr.slice(f, t).reduce((a, b) => a + b, 0);

  /* ── Sub-total cell with ±par annotation ── */
  const SubCell = ({
    gross,
    parVal,
    cls,
  }: {
    gross: number;
    parVal: number;
    cls: string;
  }) => {
    const tp = gross - parVal;
    return (
      <td className={`${cls} fw-700`}>
        {gross}
        <span className={`sc-topar ${toParClass(tp)}`}>{fmtSign(tp)}</span>
      </td>
    );
  };

  /* ── Shared table header ── */
  const THead = () => (
    <thead>
      <tr>
        <th className="hole-header ta-left">Buraco</th>
        {par.slice(0, 9).map((_, i) => (
          <th key={i} className="hole-header">
            {i + 1}
          </th>
        ))}
        <th className="hole-header col-out fs-10">Out</th>
        {par.slice(9).map((_, i) => (
          <th key={i + 9} className="hole-header">
            {i + 10}
          </th>
        ))}
        <th className="hole-header col-in fs-10">In</th>
        <th className="hole-header col-total">TOTAL</th>
      </tr>
    </thead>
  );

  /* ── Par row ── */
  const ParRow = ({ sep }: { sep?: boolean }) => (
    <tr className={sep ? "sep-row" : "meta-row"}>
      <td className="row-label par-label">Par</td>
      {par.slice(0, 9).map((p, i) => (
        <td key={i}>{p}</td>
      ))}
      <td className="col-out fw-600">{frontPar}</td>
      {par.slice(9).map((p, i) => (
        <td key={i + 9}>{p}</td>
      ))}
      <td className="col-in fw-600">{backPar}</td>
      <td className="col-total">{totalPar}</td>
    </tr>
  );

  /* ── Gross row with sc-score circles + ±par subtotals ── */
  const GrossRow = ({
    holes,
    label,
  }: {
    holes: number[];
    label: string;
  }) => {
    const front = sm(holes, 0, 9),
      back = sm(holes, 9, 18),
      total = front + back;
    return (
      <tr>
        <td className="row-label fw-700">{label}</td>
        {holes.slice(0, 9).map((g, i) => (
          <td key={i}>
            <span className={`sc-score ${scClass(g, par[i])}`}>{g}</span>
          </td>
        ))}
        <SubCell gross={front} parVal={frontPar} cls="col-out" />
        {holes.slice(9).map((g, i) => (
          <td key={i + 9}>
            <span className={`sc-score ${scClass(g, par[i + 9])}`}>{g}</span>
          </td>
        ))}
        <SubCell gross={back} parVal={backPar} cls="col-in" />
        <SubCell gross={total} parVal={totalPar} cls="col-total" />
      </tr>
    );
  };

  /* ── vs Field row ── */
  const VsFieldRow = ({ holes }: { holes: number[] }) => (
    <tr className="meta-row">
      <td className="row-label c-muted fs-10 fw-400">vs Field</td>
      {holes.map((g, i) => {
        const diff = g - FH[i].fAvg;
        const col =
          diff <= -0.5
            ? "var(--color-good)"
            : diff >= 0.5
              ? "var(--color-danger)"
              : "var(--text-muted)";
        return (
          <React.Fragment key={i}>
            <td className="fs-10 fw-600" style={{ color: col }}>
              {fmtSign(diff, 1)}
            </td>
            {i === 8 && <td className="col-out" />}
          </React.Fragment>
        );
      })}
      <td className="col-in" />
      <td className="col-total" />
    </tr>
  );

  /* ── Difficulty rank row ── */
  const DiffRow = () => (
    <tr className="meta-row">
      <td className="row-label c-muted fs-10 fw-400">Dific.</td>
      {par.map((_, i) => {
        const rank = FIELD_2025.diffRank.indexOf(i + 1) + 1;
        const col =
          rank <= 3
            ? "var(--color-danger)"
            : rank >= 16
              ? "var(--color-good)"
              : "var(--text-muted)";
        return (
          <React.Fragment key={i}>
            <td className="fs-10 fw-600" style={{ color: col }}>
              {rank}
            </td>
            {i === 8 && <td className="col-out" />}
          </React.Fragment>
        );
      })}
      <td className="col-in" />
      <td className="col-total" />
    </tr>
  );

  /* ── Field Average row ── */
  const FieldAvgRow = () => (
    <tr className="meta-row">
      <td className="row-label c-muted fs-10 fw-400">Avg Field</td>
      {FH.map((h, i) => (
        <React.Fragment key={i}>
          <td className="fs-10 c-muted">{h.fAvg.toFixed(1)}</td>
          {i === 8 && (
            <td className="col-out c-muted">
              {FH.slice(0, 9)
                .reduce((a, x) => a + x.fAvg, 0)
                .toFixed(1)}
            </td>
          )}
        </React.Fragment>
      ))}
      <td className="col-in c-muted">
        {FH.slice(9)
          .reduce((a, x) => a + x.fAvg, 0)
          .toFixed(1)}
      </td>
      <td className="col-total fs-10 c-muted">
        {FH.reduce((a, x) => a + x.fAvg, 0).toFixed(1)}
      </td>
    </tr>
  );

  /* ── Single round scorecard ── */
  const renderScorecard = (holes: number[], label: string, idx: number) => {
    const total = sm(holes, 0, 18),
      tp = total - totalPar;
    return (
      <div key={idx} className="mb-12">
        <div className="tourn-meta fw-700 mb-4">
          {label} — {total} ({fmtToPar(tp)})
        </div>
        <div className="scroll-x">
          <table className="sc-table-modern" data-sc-table="1">
            <THead />
            <tbody>
              <DiffRow />
              <FieldAvgRow />
              <ParRow sep />
              <GrossRow holes={holes} label={label} />
              <VsFieldRow holes={holes} />
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Collect tournament results from Rivais
  const tournResults: {
    name: string;
    short: string;
    date: string;
    par: number;
    pos: number | string;
    total: number | null;
    tp: number | null;
    rounds: number[];
  }[] = [];
  if (rival) {
    for (const t of T) {
      const res = rival.r[t.id];
      if (res)
        tournResults.push({
          name: t.name,
          short: t.short,
          date: t.date,
          par: t.par,
          pos: res.p,
          total: res.t,
          tp: res.tp,
          rounds: res.rd,
        });
    }
  }

  const completedResults = tournResults.filter(r => r.tp != null);
  const allRounds = completedResults.flatMap(r => r.rounds);
  const bestTp = completedResults.length
    ? Math.min(...completedResults.map(r => r.tp!))
    : null;
  const bestRound = allRounds.length ? Math.min(...allRounds) : null;
  const avgRound = allRounds.length ? meanArr(allRounds) ?? 0 : null;

  // Player avg per hole (across BJGT rounds)
  const playerHoleAvg = card
    ? par.map((_, i) => {
        const scores = card.rounds.map(rd => rd[i]);
        return meanArr(scores) ?? 0;
      })
    : null;

  // Scoring distribution
  const scoringStats = card
    ? (() => {
        let eagles = 0,
          birdies = 0,
          pars = 0,
          bogeys = 0,
          doubles = 0,
          worse = 0;
        for (const rd of card.rounds)
          for (let i = 0; i < 18; i++) {
            const d = rd[i] - par[i];
            if (d <= -2) eagles++;
            else if (d === -1) birdies++;
            else if (d === 0) pars++;
            else if (d === 1) bogeys++;
            else if (d === 2) doubles++;
            else worse++;
          }
        return {
          eagles,
          birdies,
          pars,
          bogeys,
          doubles,
          worse,
          total: card.rounds.length * 18,
        };
      })()
    : null;

  return (
    <div className="tourn-section">
      <button className="p p-filter mb-12" onClick={onBack}>
        ← Análise
      </button>

      <div className="d-flex items-center gap-8 mb-12">
        <span className="fw-800 fs-15">
          {lbEntry?.country ||
            (rival
              ? (FL as Record<string, string>)[rival.co] || ""
              : "")}{" "}
          {playerName}
        </span>
        {lbEntry && <span className="p p-outline">BJGT #{lbEntry.pos}</span>}
        <span className="p p-sub12">Sub-12</span>
        {rival?.co && <span className="p p-outline">{rival.co}</span>}
      </div>

      {/* KPIs */}
      <div
        className="kpis"
        style={{
          gridTemplateColumns: `repeat(${card ? 5 : 4}, 1fr)`,
          marginBottom: 16,
        }}
      >
        {lbEntry && (
          <KpiCard
            label="BJGT Total"
            value={lbEntry.total}
            sub={`${fmtToPar(lbEntry.result)} · #${lbEntry.pos}`}
          />
        )}
        {bestTp != null && (
          <KpiCard
            label="Melhor ±Par"
            value={fmtToPar(bestTp)}
            color={bestTp <= 0 ? "var(--color-good-dark)" : undefined}
          />
        )}
        {bestRound != null && (
          <KpiCard
            label="Melhor Ronda"
            value={bestRound}
            color="var(--color-good-dark)"
          />
        )}
        {avgRound != null && (
          <KpiCard label="Média Ronda" value={avgRound.toFixed(1)} />
        )}
        {card && (
          <KpiCard
            label="Eclético BJGT"
            value={card.eclTotal}
            sub={fmtToPar(card.eclTotal - totalPar)}
            color="var(--color-good-dark)"
          />
        )}
      </div>

      {/* ── Scoring distribution ── */}
      {scoringStats && (
        <div className="d-flex items-center gap-8 mb-16 flex-wrap">
          <span className="fs-10 fw-600 c-text-3">
            Distribuição ({scoringStats.total} buracos):
          </span>
          {[
            { label: "Eagle+", val: scoringStats.eagles, cls: "eagle" },
            { label: "Birdie", val: scoringStats.birdies, cls: "birdie" },
            { label: "Par", val: scoringStats.pars, cls: "par" },
            { label: "Bogey", val: scoringStats.bogeys, cls: "bogey" },
            { label: "Double", val: scoringStats.doubles, cls: "double" },
            { label: "Triple+", val: scoringStats.worse, cls: "triple" },
          ]
            .filter(s => s.val > 0)
            .map(s => (
              <span key={s.label} className="d-flex items-center gap-4">
                <span className={`sc-score ${s.cls}`}>{s.val}</span>
                <span className="fs-10 fw-600 c-text-3">
                  {s.label} (
                  {(
                    (s.val / scoringStats.total) *
                    100
                  ).toFixed(0)}
                  %)
                </span>
              </span>
            ))}
        </div>
      )}

      {/* ── Tournament history ── */}
      {tournResults.length > 0 && (
        <div className="mb-16">
          <div className="tourn-meta fw-700 mb-6">Historial de Torneios</div>
          <div className="tourn-scroll">
            <table className="bc-collapse">
              <thead>
                <tr>
                  <th>Torneio</th>
                  <th>Data</th>
                  <th className="r">Par</th>
                  <th className="r">Pos</th>
                  {Array.from(
                    {
                      length: Math.max(
                        ...tournResults.map(r => r.rounds.length)
                      ),
                    },
                    (_, i) => (
                      <th key={i} className="r">
                        R{i + 1}
                      </th>
                    )
                  )}
                  <th className="r">Total</th>
                  <th className="r">±Par</th>
                </tr>
              </thead>
              <tbody>
                {tournResults.map((r, i) => {
                  const mx = Math.max(
                    ...tournResults.map(x => x.rounds.length)
                  );
                  return (
                    <tr key={i}>
                      <td className="fw-700 fs-12">{r.short}</td>
                      <td className="fs-11 c-text-3">{r.date}</td>
                      <td className="r mono">{r.par}</td>
                      <td className="r mono fw-700">
                        {typeof r.pos === "number" ? `#${r.pos}` : r.pos}
                      </td>
                      {Array.from({ length: mx }, (_, j) => {
                        const rd = r.rounds[j];
                        if (rd == null) return <td key={j} />;
                        const rdTp = rd - r.par;
                        const col = tpColorDark(rdTp, 5);
                        return (
                          <td
                            key={j}
                            className="r mono fw-600"
                            style={{ color: col }}
                          >
                            {rd}
                          </td>
                        );
                      })}
                      <td className="r mono fw-800">{r.total ?? "–"}</td>
                      <td
                        className="r fw-700"
                        style={{ color: tpColorDark(r.tp, 15) }}
                      >
                        {fmtToPar(r.tp)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BJGT Comparative scorecard ── */}
      {card && (
        <>
          <div className="tourn-meta fw-700 mb-6">
            BJGT 2025 — Scorecard Comparativo
          </div>
          <div className="scroll-x mb-16">
            <table className="sc-table-modern" data-sc-table="1">
              <THead />
              <tbody>
                <DiffRow />
                <FieldAvgRow />
                <ParRow sep />
                {card.rounds.map((rd, i) => (
                  <GrossRow key={i} holes={rd} label={`R${i + 1}`} />
                ))}
                <GrossRow holes={card.ecl} label="ECL" />
                {playerHoleAvg && (
                  <tr className="meta-row">
                    <td className="row-label c-muted fs-10 fw-600">Média</td>
                    {playerHoleAvg.map((avg, i) => {
                      const diff = avg - par[i];
                      const col =
                        diff <= -0.3
                          ? "var(--color-good)"
                          : diff >= 0.5
                            ? "var(--color-danger)"
                            : "var(--text-muted)";
                      return (
                        <React.Fragment key={i}>
                          <td className="fs-10 fw-600" style={{ color: col }}>
                            {avg.toFixed(1)}
                          </td>
                          {i === 8 && (
                            <td className="col-out fw-600">
                              {playerHoleAvg
                                .slice(0, 9)
                                .reduce((a, b) => a + b, 0)
                                .toFixed(1)}
                            </td>
                          )}
                        </React.Fragment>
                      );
                    })}
                    <td className="col-in fw-600">
                      {playerHoleAvg
                        .slice(9)
                        .reduce((a, b) => a + b, 0)
                        .toFixed(1)}
                    </td>
                    <td className="col-total fs-10 fw-700">
                      {playerHoleAvg
                        .reduce((a, b) => a + b, 0)
                        .toFixed(1)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="tourn-meta fw-700 mb-6">Rondas Individuais</div>
          {card.rounds.map((rd, i) =>
            renderScorecard(rd, `R${i + 1}`, i)
          )}
        </>
      )}

      {!card && lbEntry && (
        <div className="tourn-meta mb-12">
          BJGT 2025: {lbEntry.rounds.join("-")} = {lbEntry.total} (
          {fmtToPar(lbEntry.result)}) — scorecard buraco-a-buraco não disponível
        </div>
      )}
    </div>
  );
}
