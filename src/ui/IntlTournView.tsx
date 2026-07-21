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

import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
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
  /**
   * Draws POR RONDA, intercalados com as rondas de resultados na MESMA barra:
   *   Inscritos → Draw R1 → R1 → Draw R2 → R2 → … → Resumo → 📋 Scorecards
   * Cada "Draw R{n}" é inserido ANTES da ronda n. Pode incluir rondas ainda não
   * jogadas (sem aba de resultado correspondente — ex: Draw R3 só com pairings).
   * Ausente = comportamento original. Ignorado em torneios com Pré-Cut.
   */
  roundDraws?: { round: number; render: () => React.ReactNode }[];
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
  roundDraws,
}: IntlTournViewProps) {
  const nR = tournament.rounds || 1;
  const isMulti = nR > 1;

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

  // Cut detection (vem do expandMultiRound -- _cutAfterRound no _isTotal entry).
  // Cut após a R1 NÃO gera tab: "Pré-Cut R1–R1" seria idêntica à própria R1
  // (o acumulado de 1 ronda é a ronda) — só ordena tabs redundantes na barra.
  // A promoção dos jogadores cortados no Resumo (fpgUtils) mantém-se na mesma.
  const cutAfterRound = useMemo(() => {
    const tot = expanded.find((t: any) => (t as any)._isTotal);
    const n = (tot as any)?._cutAfterRound as number | undefined;
    return n != null && n >= 2 ? n : undefined;
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
    // inicial (dados em falta, ou saltou a ronda) NÃO tem score de cut: incluí-lo
    // somava menos rondas do que o par descontado (parPerRound × cutAfterRound) →
    // toPar absurdo (1 ronda de 73 vs par 138 = −65) e ordenava-o em 1º lugar.
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

  // ── Barra de abas: descritores ordenados ─────────────────────────────
  // Default: [leadingTabs…, rondas…] (Inscritos → Draw → R1 → … → Resumo).
  // Com `roundDraws` (e sem Pré-Cut): intercala "Draw R{n}" ANTES de cada ronda n
  //   Inscritos → Draw R1 → R1 → Draw R2 → R2 → … → Resumo → 📋 Scorecards
  // incluindo rondas de draw ainda sem resultado (ex: Draw R3 só com pairings).
  type TabDesc =
    | { kind: "leading"; label: string; li: number }
    | { kind: "draw"; label: string; render: () => React.ReactNode }
    | { kind: "round"; label: string; rtab: number };
  const { tabDescs, initialIdx } = useMemo(() => {
    const descs: TabDesc[] = [];
    (leadingTabs ?? []).forEach((t, li) => descs.push({ kind: "leading", label: t.label, li }));
    const draws = roundDraws ?? [];
    if (draws.length) {
      // Intercalar "Draw R{n}" ANTES de cada ronda de resultado R{n}, percorrendo
      // roundTabLabels e identificando o nº de ronda de cada aba (a mesma lógica
      // de mapeamento que o render usa). Tabs não-ronda (Pré-Cut, Resumo,
      // Scorecards) passam intactas — o Pré-Cut fica no sítio dele (entre R3 e R4).
      const drawByRound = new Map(draws.map(d => [d.round, d.render] as const));
      const used = new Set<number>();
      for (let rtab = 0; rtab < roundTabLabels.length; rtab++) {
        const isPreCut = cutAfterRound != null && rtab === cutAfterRound;
        const expIdx = (cutAfterRound != null && rtab > cutAfterRound) ? rtab - 1 : rtab;
        const isCombined = roundTabLabels[rtab] === COMBINED_TAB;
        const isTotal = !!(expanded[expIdx] as { _isTotal?: boolean } | undefined)?._isTotal;
        if (!isPreCut && !isCombined && !isTotal) {
          const roundNum = expIdx + 1; // expanded[expIdx] = ronda expIdx+1
          const dr = drawByRound.get(roundNum);
          if (dr) { descs.push({ kind: "draw", label: `Draw R${roundNum}`, render: dr }); used.add(roundNum); }
        }
        descs.push({ kind: "round", label: roundTabLabels[rtab], rtab });
      }
      // Draws de rondas SEM aba de resultado (ex: Draw R3 futura, só pairings) →
      // inseridos por ordem antes do Resumo, mantendo a sequência de rondas.
      const extra = draws.filter(d => !used.has(d.round)).sort((a, b) => a.round - b.round);
      if (extra.length) {
        let at = descs.findIndex(d => d.kind === "round" && (d.label === "Resumo" || d.label === COMBINED_TAB));
        if (at < 0) at = descs.length;
        descs.splice(at, 0, ...extra.map(d => ({ kind: "draw" as const, label: `Draw R${d.round}`, render: d.render })));
      }
    } else {
      roundTabLabels.forEach((lbl, i) => descs.push({ kind: "round", label: lbl, rtab: i }));
    }
    const fri = descs.findIndex(d => d.kind === "round");
    // Tab inicial: o RESUMO (classificação acumulada) quando existe — é a vista
    // que se quer ao abrir um torneio. Senão a primeira aba de ronda.
    const ri = descs.findIndex(d => d.kind === "round" && (roundTabLabels[d.rtab] ?? "").startsWith("Resumo"));
    return { tabDescs: descs, initialIdx: ri >= 0 ? ri : (fri < 0 ? 0 : fri) };
  }, [leadingTabs, roundDraws, roundTabLabels, isMulti, cutAfterRound, expanded]);

  // Mostrar barra se há >1 tab no total.
  const showTabBar = tabDescs.length > 1;

  // Início: Resumo (ou 1ª ronda) — e RESET ao trocar de torneio: a shell reusa
  // esta instância entre torneios, senão o índice de tab "colava" de um para o
  // outro e abria-se noutro torneio numa tab arbitrária.
  const [tab, setTab] = useState(initialIdx);
  const tournKey = `${(tournament as { tcode?: string }).tcode ?? ""}|${tournament.name}`;
  const prevTournKey = useRef(tournKey);
  useEffect(() => {
    if (prevTournKey.current !== tournKey) {
      prevTournKey.current = tournKey;
      setTab(initialIdx);
    }
  }, [tournKey, initialIdx]);
  const safeTab = Math.min(Math.max(tab, 0), Math.max(0, tabDescs.length - 1));
  const active = tabDescs[safeTab] ?? tabDescs[0];

  // Conteúdo de uma aba de RONDA (índice rtab em roundTabLabels) — reusa a lógica
  // de Pré-Cut / Resumo (acumulado) / Scorecards (combinado).
  const renderRoundContent = (rtab: number): React.ReactNode => {
    const isPreCutTab = isMulti && cutAfterRound != null && rtab === cutAfterRound;
    const expIdx = (cutAfterRound != null && rtab > cutAfterRound) ? rtab - 1 : rtab;
    const curT = isMulti
      ? (isPreCutTab && preCutTourn ? preCutTourn : expanded[Math.min(expIdx, expanded.length - 1)])
      : tournament;
    const isAcc = isMulti && !!(curT as any)?._isTotal;
    const isCombined = isMulti && roundTabLabels[rtab] === COMBINED_TAB;
    // Na tab Pré-Cut o "torneio" só tem cutAfterRound rondas — o cabeçalho usa
    // cutAfterRound e não nR (senão mostra "Par 207 · 3R" numa vista de 2 rondas).
    const accNRounds = isPreCutTab && preCutTourn ? (cutAfterRound as number) : nR;
    if (isCombined) {
      return <AllRoundsScorecardLB tournament={tournament} escLookup={EMPTY_ESC_LOOKUP} playersDB={EMPTY_PLAYERS_DB} options={opts} />;
    }
    if (isAcc) {
      const accLB = (
        <AccumulatedLB
          tournament={curT} nRounds={accNRounds}
          escLookup={EMPTY_ESC_LOOKUP} playersDB={EMPTY_PLAYERS_DB}
          showCols={accShowCols ?? { esc: false, fed: false, tee: false }}
          extraColumns={evoCols}
          renderName={renderNameFn}
        />
      );
      return renderAccSection ? renderAccSection(accLB) : <>{accHeader}{accLB}{accExtra}</>;
    }
    const roundLB = (
      <ScorecardLB
        tournament={curT}
        escLookup={EMPTY_ESC_LOOKUP} playersDB={EMPTY_PLAYERS_DB}
        siLabel={siLabel}
        options={opts}
      />
    );
    return renderRoundSection ? renderRoundSection(roundLB, rtab) : <>{roundLB}{roundExtra?.(rtab)}</>;
  };

  return (
    <div>
      {/* Tab bar única (leadingTabs + draws por ronda + rondas) */}
      {showTabBar && (
        <div className="tab-bar">
          {tabDescs.map((d, i) => (
            <button key={i} className={`tab-under${safeTab === i ? " active" : ""}`} onClick={() => setTab(i)}>{d.label}</button>
          ))}
        </div>
      )}

      {/* Content */}
      {active.kind === "leading"
        ? leadingTabs![active.li].content
        : active.kind === "draw"
          ? active.render()
          : renderRoundContent(active.rtab)}
    </div>
  );
}
