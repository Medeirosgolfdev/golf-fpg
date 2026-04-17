/**
 * AccumulatedLB.tsx — Multi-round accumulated leaderboard
 *
 * Extracted from LeaderboardComponents.tsx
 * Displays accumulated scores across multiple rounds.
 */
import React, { useMemo } from "react";
import type { EscLookup } from "../utils/playerUtils";
import type { Tournament } from "../data/fpgTypes";
import { numGross, resolveEsc, computeSD } from "../data/fpgUtils";
import { MultiRoundLeaderboard } from "./MultiRoundLeaderboard";
import { RoundPill } from "./PillBadge";
import EmptyState from "./EmptyState";
import { isManuel, type PlayersDB } from "./tournamentPrimitives";
import { useFedBirthdates } from "./InscricoesComponents";
import type { MultiRoundRow as MRRow, MRRound, ExtraColumn } from "./multiRoundTypes";

export function AccumulatedLB({
  tournament,
  nRounds,
  escLookup,
  playersDB,
  showCols: showColsProp,
  extraColumns,
  renderName,
}: {
  tournament: Tournament;
  nRounds: number;
  escLookup: EscLookup;
  playersDB: PlayersDB;
  showCols?: { esc?: boolean; fed?: boolean; tee?: boolean };
  extraColumns?: ExtraColumn<MRRow & { _pos?: number | null }>[];
  renderName?: (row: MRRow) => React.ReactNode;
}) {
  const rawPlayers = tournament.players;
  const fedBirthdates = useFedBirthdates();

  const complete = rawPlayers.filter((p) => !p._incomplete);
  const incomplete = rawPlayers.filter((p) => p._incomplete);
  const parPerRound = complete[0]?.parTotal ?? incomplete[0]?.parTotal ?? 72;

  // useMemo ANTES do early return — regra dos hooks React
  const rows: MRRow[] = useMemo(() => {
    return rawPlayers.map((p) => {
      const esc = resolveEsc(p, escLookup, { tournamentDate: tournament.date, playersDB, fedBirthdates }) || tournament.escalao || "";
      const roundScores = p.roundScores || [];
      // Posicionar cada ronda pelo seu número real (rounds[0]=R1, rounds[1]=R2, ...)
      // para que jogadores parciais mostrem "–" nas rondas que não jogaram
      const mappedRounds = Array.from({ length: nRounds }, (_, i) => {
        const rdNum = i + 1;
        const rs = roundScores.find((r) => r.round === rdNum);
        if (!rs) return undefined;
        const sdP = {
          ...p,
          scores: rs.scores,
          par: rs.pars,
          si: rs.si,
          courseRating: rs.courseRating,
          slope: rs.slope,
          nholes: rs.pars?.length,
          grossTotal: rs.gross,
        };
        const { sd } = computeSD(sdP);
        let birdies = 0,
          pars = 0,
          bogeys = 0;
        for (let i = 0; i < (rs.scores?.length ?? 0); i++) {
          const d = (rs.scores[i] || 0) - (rs.pars[i] || 0);
          if (d <= -1) birdies++;
          else if (d === 0) pars++;
          else bogeys++;
        }
        return {
          gross: rs.gross,
          parPerRound: rs.pars?.reduce((a, b) => a + b, 0) || parPerRound,
          sd,
          sdSource: null as string | null,
          birdies,
          pars,
          bogeys,
        };
      }) as MRRound[];
      return {
        key: p.scoreId || p.name,
        name: p.name,
        fed: p.fedCode,
        club: p.club || "",
        hcp: p.hcpExact ?? null,
        esc: esc || undefined,
        teeName: p.teeName,
        gross: numGross(p),
        parTotal: parPerRound * nRounds,
        isIncomplete: !!p._incomplete,
        isWD: !!p._wd,
        isHighlighted: isManuel(p),
        rounds: mappedRounds,
      };
    });
  }, [rawPlayers, escLookup, nRounds, parPerRound, playersDB, tournament.date, tournament.escalao, fedBirthdates]);

  // Referência para meta-informação do campo (mesmo que ScorecardLB)
  const refP0 = complete[0] ?? rawPlayers[0];
  const refRS = refP0?.roundScores?.find((rs) => rs.round === 1);
  const cr = refRS?.courseRating ?? refP0?.courseRating;
  const slope = refRS?.slope ?? refP0?.slope;
  const campo = tournament.campo || "";
  const grosses = complete.map((p) => numGross(p)).filter((g) => !isNaN(g) && g > 0);
  const avgGross = grosses.length
    ? grosses.reduce((a, b) => a + b, 0) / grosses.length
    : null;

  const infoParts: (string | null)[] = [
    `${complete.length} classif.`,
    incomplete.length > 0 ? `${incomplete.length} inc.` : null,
    nRounds > 1 ? `__ROUND_PILL__` : null,
    `Par ${parPerRound * nRounds}`,
    avgGross != null
      ? `Média ${avgGross.toFixed(1)} (${avgGross - parPerRound * nRounds >= 0 ? "+" : ""}${(avgGross - parPerRound * nRounds).toFixed(1)})`
      : null,
    campo ? `📍 ${campo}` : null,
    cr ? `CR ${cr}` : null,
    slope ? `Slope ${slope}` : null,
  ];
  const infoFiltered = infoParts.filter(Boolean) as string[];

  // Early return seguro — useMemo já foi chamado acima
  if (!rawPlayers.length) return <EmptyState size="sm" message="Sem resultados." />;

  return (
    <div>
      <div className="muted fs-11 mb-8 p-0-4px">
        {infoFiltered.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && " · "}
            {s === "__ROUND_PILL__" ? <RoundPill nR={nRounds} /> : s}
          </React.Fragment>
        ))}
      </div>
      <MultiRoundLeaderboard
        rows={rows}
        nRounds={nRounds}
        playersDB={playersDB}
        showCols={showColsProp ?? { esc: true, fed: true, tee: true }}
        sortable
        filterable
        extraColumns={extraColumns}
        renderName={renderName}
      />
    </div>
  );
}
