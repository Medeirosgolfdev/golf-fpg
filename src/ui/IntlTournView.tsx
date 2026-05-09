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

  // Tab labels
  const tabLabels = useMemo(() => {
    if (!isMulti) return ["Scorecard"];
    return [
      ...expanded.map((t: any, i: number) => {
        if ((t as any)._isTotal) return "Resumo";
        const rl = roundLabels?.[i];
        return rl || (t as any)._roundLabel || `R${i + 1}`;
      }),
      COMBINED_TAB,
    ];
  }, [isMulti, expanded, roundLabels]);

  const [tab, setTab] = useState(0);

  const curT       = isMulti ? expanded[Math.min(tab, expanded.length - 1)] : tournament;
  const isAcc      = isMulti && !!(curT as any)?._isTotal;
  const isCombined = isMulti && tabLabels[tab] === COMBINED_TAB;

  // Build the leaderboard elements for render-section callbacks
  const accLB = (
    <AccumulatedLB
      tournament={curT} nRounds={nR}
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
