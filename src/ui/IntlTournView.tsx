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
  accShowCols?: { esc?: boolean; fed?: boolean; tee?: boolean; club?: boolean; hcp?: boolean; age?: boolean; birthYear?: boolean };
  /**
   * Tabs colocadas ANTES das tabs de ronda, na MESMA barra (ex: Inscritos, Draw).
   * Produz uma progressão única estilo FPG:
   *   Inscritos → Draw → R1 → R2 → … → Resumo → 📋 Scorecards
   * Vazio/ausente = comportamento original (só rondas).
   */
  leadingTabs?: { key: string; label: string; content: React.ReactNode }[];
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
  leadingTabs,
}: IntlTournViewProps) {
  const nR = tournament.rounds || 1;
  const isMulti = nR > 1;
  const nLeading = leadingTabs?.length ?? 0;

  const nameDecoratorFn: ScorecardOptions["nameDecorator"] = useCallback(
    (name: string, content: React.ReactNode) => (
      <span className="inline-flex items-center">{content}<KidsLink nome={name} /></span>
    ), []);

  const renderNameFn = useCallback(
    (row: MultiRoundRow) => (
      <span className="tourn-pname inline-flex items-center">
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
    const trimmedPlayers = tournament.players
      .filter(p => (p.roundScores?.length ?? 0) >= cutAfterRound)
      .map(p => {
        const rs = (p.roundScores || []).filter(r => r.round <= cutAfterRound);
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
        };
      });
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

  // Tab labels das RONDAS (sem as leadingTabs).
  const roundTabLabels = useMemo(() => {
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
    // Não mostrar a tab "📋 Scorecards" quando a fonte não tem cartão hole-by-hole
    // (ex.: RFEGolf só-PDF → _noHbh): a grelha sairia vazia contra par-72 falso.
    if (!(tournament as { _noHbh?: boolean })._noHbh) baseLabels.push(COMBINED_TAB);
    return baseLabels;
  }, [isMulti, expanded, roundLabels, cutAfterRound, tournament]);

  // Barra única: [leadingTabs…, rondas…]. Estilo FPG (Inscritos → Draw → R1 → …).
  const combinedLabels = useMemo(
    () => [...(leadingTabs?.map(t => t.label) ?? []), ...roundTabLabels],
    [leadingTabs, roundTabLabels],
  );
  // Mostrar barra se há >1 tab no total (rondas multi OU leadingTabs presentes).
  const showTabBar = combinedLabels.length > 1;

  // Início: primeira tab de ronda (índice nLeading) — abre nos resultados, como a
  // FPG quando já há resultados; as leadingTabs (Inscritos/Draw) ficam à esquerda.
  const [tab, setTab] = useState(() => nLeading);
  const safeTab = Math.min(Math.max(tab, 0), Math.max(0, combinedLabels.length - 1));

  // Tab activa é uma leadingTab?
  const leadingActive = safeTab < nLeading;
  // Índice equivalente na lógica de rondas (descontando as leadingTabs).
  const rtab = Math.max(0, safeTab - nLeading);

  // Mapear `rtab` para entry de expanded (considerando tab Pre-Cut inserida).
  // Se rtab == cutAfterRound (a tab Pre-Cut), curT = preCutTourn.
  // Se rtab > cutAfterRound, descontar 1 ao indice antes de mapear a expanded.
  const isPreCutTab = isMulti && cutAfterRound != null && rtab === cutAfterRound;
  const expIdx = (cutAfterRound != null && rtab > cutAfterRound) ? rtab - 1 : rtab;
  const curT = isMulti
    ? (isPreCutTab && preCutTourn ? preCutTourn : expanded[Math.min(expIdx, expanded.length - 1)])
    : tournament;
  const isAcc      = !leadingActive && isMulti && !!(curT as any)?._isTotal;
  const isCombined = !leadingActive && isMulti && roundTabLabels[rtab] === COMBINED_TAB;

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
      {/* Tab bar única (leadingTabs + rondas) */}
      {showTabBar && (
        <div className="tab-bar">
          {combinedLabels.map((label, i) => (
            <button key={i} className={`tab-under${safeTab === i ? " active" : ""}`} onClick={() => setTab(i)}>{label}</button>
          ))}
        </div>
      )}

      {/* Content */}
      {leadingActive
        ? leadingTabs![safeTab].content
        : isCombined
          ? <AllRoundsScorecardLB tournament={tournament} escLookup={EMPTY_ESC_LOOKUP} playersDB={EMPTY_PLAYERS_DB} options={opts} />
          : isAcc
            ? (renderAccSection
                ? renderAccSection(accLB)
                : <>{accHeader}{accLB}{accExtra}</>
              )
            : (renderRoundSection
                ? renderRoundSection(roundLB, rtab)
                : <>{roundLB}{roundExtra?.(rtab)}</>
              )
      }
    </div>
  );
}
