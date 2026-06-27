/**
 * IntlTournView — Shared tournament view for international pages (BJGT, DORAL)
 *
 * Encapsulates the common pattern:
 *   1. Tab state (R1 · R2 · Resumo · 📋 Scorecards)
 *   2. expandMultiRound
 *   3. nameDecorator + renderName with KidsLink
 *   4. Switching between AllRoundsScorecardLB / AccumulatedLB / ScorecardLB
 *
 * Page-specific elements (HoleDiff, ManuelDay, evo columns, FStats, card wrappers)
 * are injected via props — either simple slots or full render-section callbacks.
 */

import React, { useMemo, useState, useCallback } from "react";
import { EMPTY_ESC_LOOKUP, EMPTY_PLAYERS_DB } from "./tournamentPrimitives";
import { AccumulatedLB, ScorecardLB, AllRoundsScorecardLB } from "./LeaderboardComponents";
import { expandMultiRound, type Tournament as FPGTournament, type ScorecardOptions } from "../pages/FPGPage";
import type { MultiRoundRow, ExtraColumn } from "./multiRoundTypes";
import { KidsLink } from "./KidsLink";

const COMBINED_TAB = "📋 Scorecards";

export interface IntlTournViewProps {
  /** FPG-format tournament (produced by page-specific adapter) */
  tournament: FPGTournament;
  /** Scorecard display options (hideHCP, hideSD, clubLabel, etc.) */
  scOptions: ScorecardOptions;
  /** Custom round labels, e.g. ["R1 · 25 Fev", "R2 · 26 Fev", "R3 · 27 Fev"] */
  roundLabels?: string[];
  /** Extra columns for AccumulatedLB (evo year-on-year comparison) */
  evoCols?: ExtraColumn<MultiRoundRow & { _pos?: number | null }>[];
  /** Content rendered above the accumulated leaderboard (e.g. EvoSummary) */
  accHeader?: React.ReactNode;
  /** Content rendered after each round tab (e.g. HoleDiff, ManuelDay) */
  roundExtra?: (roundIndex: number) => React.ReactNode;
  /** Content rendered after the accumulated tab (e.g. HoleDiff "all") */
  accExtra?: React.ReactNode;
  /** siLabel override for ScorecardLB (default: "SI") */
  siLabel?: string;
  /**
   * Advanced: full control over round section rendering.
   * Receives the ScorecardLB element and the round index. Replaces default rendering + roundExtra.
   */
  renderRoundSection?: (leaderboard: React.ReactNode, roundIndex: number) => React.ReactNode;
  /**
   * Advanced: full control over accumulated section rendering.
   * Receives the AccumulatedLB element. Replaces accHeader + default rendering + accExtra.
   */
  renderAccSection?: (leaderboard: React.ReactNode) => React.ReactNode;
  /** Override das colunas do AccumulatedLB (default: { esc: false, fed: false, tee: false }). */
  accShowCols?: { esc?: boolean; fed?: boolean; tee?: boolean; club?: boolean; hcp?: boolean };
}

export function IntlTournView({
  tournament,
  scOptions,
  roundLabels,
  evoCols,
  accHeader,
  roundExtra,
  accExtra,
  siLabel,
  renderRoundSection,
  renderAccSection,
  accShowCols,
}: IntlTournViewProps) {
  const nR = tournament.rounds || 1;
  const isMulti = nR > 1;

  const nameDecoratorFn: ScorecardOptions["nameDecorator"] = useCallback(
    (name: string, content: React.ReactNode) => (
      <span className="inline-flex items-center">{content}<KidsLink nome={name} /></span>
    ), []);

  const renderNameFn = useCallback(
    (row: MultiRoundRow) => (
      <span className="fw-700 inline-flex items-center">
        {row.countryFlag} {row.name}<KidsLink nome={row.name} />
      </span>
    ), []);

  // Merge nameDecorator into options
  const opts = useMemo(
    () => ({ ...scOptions, nameDecorator: nameDecoratorFn }),
    [scOptions, nameDecoratorFn],
  );

  // expandMultiRound: [R1_tourn, R2_tourn, ..., Resumo_tourn]
  const expanded = useMemo(() => expandMultiRound(tournament), [tournament]);

  // Cut detection (vem do expandMultiRound -- _cutAfterRound no _isTotal entry)
  const cutAfterRound = useMemo(() => {
    const tot = expanded.find((t: any) => (t as any)._isTotal);
    return (tot as any)?._cutAfterRound as number | undefined;
  }, [expanded]);

  /** Construir tournament Pre-Cut: todos os jogadores que jogaram >= cutAfterRound
   *  rondas, mas apenas com as rondas 1..cutAfterRound (corta as posteriores).
   *  Total e toPar recalculados para essas rondas apenas.
   *  Inclui TODOS os jogadores que ainda nao foram cortados (i.e. os que vao
   *  passar ao R+1, e tambem os que vao ser cortados). */
  const preCutTourn = useMemo(() => {
    if (!cutAfterRound) return null;
    // Só entram jogadores com score VÁLIDO em TODAS as rondas 1..cutAfterRound
    // (i.e. tinham total acumulado no momento do cut). Quem falta uma ronda
    // inicial (ex: dados em falta no scrape, ou saltou a ronda) NÃO tem score de
    // cut: incluí-lo somava menos rondas do que o par descontado
    // (parPerRound × cutAfterRound) → toPar absurdo (1 ronda de 73 vs par 138 =
    // −65) e ordenava-o em 1º lugar. Excluir é o correcto: a vista Pré-Cut é a
    // classificação que decidiu o cut, e ele não tinha total de 2 rondas.
    const wanted = Array.from({ length: cutAfterRound }, (_, i) => i + 1);
    const trimmedPlayers = tournament.players
      .map(p => {
        const rs = (p.roundScores || []).filter(r => r.round <= cutAfterRound);
        const hasAll = wanted.every(rd =>
          rs.some(r => r.round === rd && (r.gross || 0) > 0 && (r.gross || 0) < 999));
        const parPerRound = p.parTotal || (rs[0]?.pars?.reduce((a, b) => a + b, 0) || 0);
        const parT = parPerRound * cutAfterRound;
        const gross = rs.reduce((s, r) => s + (r.gross || 0), 0);
        return {
          ...p,
          roundScores: rs,
          grossTotal: gross,
          toPar: gross - parT,
          parTotal: parPerRound, // PAR POR RONDA
          _wd: false,
          _cut: false,
          _incomplete: false,
          _roundsPlayed: cutAfterRound,
          _hasAll: hasAll,
        };
      })
      .filter(p => p._hasAll);
    // Ordenar por gross (acumulado das primeiras cutAfterRound rondas)
    trimmedPlayers.sort((a, b) => (a.grossTotal ?? 99999) - (b.grossTotal ?? 99999));
    let pos = 1;
    trimmedPlayers.forEach((p, i) => {
      if (i > 0 && (p.grossTotal ?? 0) !== (trimmedPlayers[i - 1].grossTotal ?? 0)) pos = i + 1;
      (p as any)._pos = pos;
    });
    return {
      ...tournament,
      players: trimmedPlayers,
      rounds: cutAfterRound,
      _roundLabel: `Resumo Pré-Cut (R1–R${cutAfterRound})`,
      _isTotal: true,
    } as any;
  }, [tournament, cutAfterRound]);

  // Tab labels
  const tabLabels = useMemo(() => {
    if (!isMulti) return ["Scorecard"];
    const baseLabels: string[] = [];
    expanded.forEach((t: any, i: number) => {
      if ((t as any)._isTotal) baseLabels.push("Resumo");
      else {
        const rl = roundLabels?.[i];
        baseLabels.push(rl || (t as any)._roundLabel || `R${i + 1}`);
      }
    });
    // Inserir "Pré-Cut" depois da ronda do cut, se aplicavel
    if (cutAfterRound && cutAfterRound < expanded.length) {
      baseLabels.splice(cutAfterRound, 0, `Pré-Cut R1–R${cutAfterRound}`);
    }
    baseLabels.push(COMBINED_TAB);
    return baseLabels;
  }, [isMulti, expanded, roundLabels, cutAfterRound]);

  const [tab, setTab] = useState(0);

  // Mapear `tab` index para entry de expanded (considerando tab Pre-Cut inserida).
  // Se tab == cutAfterRound (a tab Pre-Cut), curT = preCutTourn.
  // Se tab > cutAfterRound, descontar 1 ao indice antes de mapear a expanded.
  const isPreCutTab = isMulti && cutAfterRound != null && tab === cutAfterRound;
  const expIdx = (cutAfterRound != null && tab > cutAfterRound) ? tab - 1 : tab;
  const curT = isMulti
    ? (isPreCutTab && preCutTourn ? preCutTourn : expanded[Math.min(expIdx, expanded.length - 1)])
    : tournament;
  const isAcc      = isMulti && !!(curT as any)?._isTotal;
  const isCombined = isMulti && tabLabels[tab] === COMBINED_TAB;

  // Na tab Pré-Cut o "torneio" só tem cutAfterRound rondas — o cabeçalho
  // (Par, pílula de rondas, média) tem de usar cutAfterRound e não nR (total do
  // torneio), senão mostra "Par 207 · 3R" e médias a −56 numa vista de 2 rondas.
  const accNRounds = isPreCutTab && preCutTourn ? (cutAfterRound as number) : nR;

  // Build the leaderboard elements for render-section callbacks
  const accLB = (
    <AccumulatedLB
      tournament={curT} nRounds={accNRounds}
      escLookup={EMPTY_ESC_LOOKUP} playersDB={EMPTY_PLAYERS_DB}
      showCols={accShowCols ?? { esc: false, fed: false, tee: false }}
      extraColumns={evoCols}
      renderName={renderNameFn}
    />
  );

  const roundLB = (
    <ScorecardLB
      tournament={curT}
      escLookup={EMPTY_ESC_LOOKUP} playersDB={EMPTY_PLAYERS_DB}
      siLabel={siLabel}
      options={opts}
    />
  );

  return (
    <div>
      {/* Tab bar */}
      {isMulti && (
        <div className="tab-bar">
          {tabLabels.map((label, i) => (
            <button key={i} className={`tab-under${tab === i ? " active" : ""}`} onClick={() => setTab(i)}>{label}</button>
          ))}
        </div>
      )}

      {/* Content */}
      {isCombined
        ? <AllRoundsScorecardLB tournament={tournament} escLookup={EMPTY_ESC_LOOKUP} playersDB={EMPTY_PLAYERS_DB} options={opts} />
        : isAcc
          ? (renderAccSection
              ? renderAccSection(accLB)
              : <>{accHeader}{accLB}{accExtra}</>
            )
          : (renderRoundSection
              ? renderRoundSection(roundLB, tab)
              : <>{roundLB}{roundExtra?.(tab)}</>
            )
      }
    </div>
  );
}
