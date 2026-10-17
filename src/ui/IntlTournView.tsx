/**
 * IntlTournView — ADAPTADOR para o TournamentDetail (o único componente de
 * detalhe de torneio da app). Mantém a interface antiga das páginas
 * internacionais (França, Espanha, Global Junior, CircuitShell/MAJOR) e
 * traduz para as props do TournamentDetail: nome com a seta kids2, sem
 * cabeçalho próprio (as páginas têm o seu), sem previsão de draw (a regra de
 * emparelhamento é da FPG) e sem HCP/FED/ESC por omissão no Resumo.
 *
 * A aba activa vive no URL (?tab=…), como em todas as páginas de torneio.
 */
import React, { useCallback, useMemo } from "react";
import { EMPTY_ESC_LOOKUP, EMPTY_PLAYERS_DB } from "./tournamentPrimitives";
import type { Tournament as FPGTournament, ScorecardOptions } from "../pages/FPGPage";
import type { MultiRoundRow, ExtraColumn } from "./multiRoundTypes";
import { KidsLink } from "./KidsLink";
import { TournamentDetail, type TournamentDetailProps } from "../pages/fpg/TournamentDetail";

export interface IntlTournViewProps {
  tournament: FPGTournament;
  scOptions: ScorecardOptions;
  roundLabels?: string[];
  evoCols?: ExtraColumn<MultiRoundRow & { _pos?: number | null }>[];
  accHeader?: React.ReactNode;
  roundExtra?: (roundIndex: number) => React.ReactNode;
  accExtra?: React.ReactNode;
  siLabel?: string;
  renderRoundSection?: (leaderboard: React.ReactNode, roundIndex: number) => React.ReactNode;
  renderAccSection?: (leaderboard: React.ReactNode) => React.ReactNode;
  accShowCols?: TournamentDetailProps["accShowCols"];
  leadingTabs?: { key: string; label: string; content: React.ReactNode }[];
  roundDraws?: { round: number; render: () => React.ReactNode }[];
  trailingTabs?: { key: string; label: string; content: React.ReactNode }[];
  tabParam?: string;
  /** Obsoletos: a aba vive no URL (?tab=…) — aceites só por compatibilidade. */
  tabKey?: string;
  onTabKey?: (key: string) => void;
}

export function IntlTournView({
  tournament, scOptions, roundLabels, evoCols, accHeader, roundExtra, accExtra, siLabel,
  renderRoundSection, renderAccSection, accShowCols, leadingTabs, roundDraws, trailingTabs, tabParam,
}: IntlTournViewProps) {
  const nameDecorator: ScorecardOptions["nameDecorator"] = useCallback(
    (name: string, content: React.ReactNode) => <span className="inline-flex items-center">{content}<KidsLink nome={name} /></span>, []);
  const renderAccName = useCallback(
    (row: MultiRoundRow) => <span className="tourn-pname inline-flex items-center">{row.countryFlag} {row.name}<KidsLink nome={row.name} /></span>, []);
  const options = useMemo(() => ({ ...scOptions, nameDecorator }), [scOptions, nameDecorator]);
  return (
    <TournamentDetail
      tournament={tournament as unknown as TournamentDetailProps["tournament"]}
      escLookup={EMPTY_ESC_LOOKUP} playersDB={EMPTY_PLAYERS_DB}
      options={options}
      hideHeader synthDraws={false}
      roundLabels={roundLabels} siLabel={siLabel}
      accShowCols={accShowCols ?? { esc: false, fed: false, tee: false }}
      accExtraColumns={evoCols as TournamentDetailProps["accExtraColumns"]}
      accHeader={accHeader} accExtra={accExtra} roundExtra={roundExtra}
      renderRoundSection={renderRoundSection} renderAccSection={renderAccSection}
      renderAccName={renderAccName}
      leadingTabs={leadingTabs} roundDraws={roundDraws} extraTabs={trailingTabs} tabParam={tabParam}
    />
  );
}
