/**
 * AccumulatedLB.tsx — Multi-round accumulated leaderboard
 *
 * Extracted from LeaderboardComponents.tsx
 * Displays accumulated scores across multiple rounds.
 */
import React, { useMemo } from "react";
import type { EscLookup } from "../utils/playerUtils";
import type { Tournament } from "../data/fpgTypes";
import { numGross, resolveEsc, computeSD, playedParTotal } from "../data/fpgUtils";
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
  showCols?: { esc?: boolean; fed?: boolean; tee?: boolean; club?: boolean; hcp?: boolean; age?: boolean; birthYear?: boolean };
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
      const dob = (p.fedCode && ((playersDB as any)?.[p.fedCode]?.dob || fedBirthdates.get(p.fedCode))) || (p as any).dob || null;
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
        let eagles = 0,
          birdies = 0,
          pars = 0,
          bogeys = 0;
        for (let i = 0; i < (rs.scores?.length ?? 0); i++) {
          const sc = rs.scores[i] || 0;
          if (sc <= 0) continue; // buraco não jogado (9H guardadas como 18 com zeros)
          const d = sc - (rs.pars[i] || 0);
          if (d <= -2) eagles++;
          else if (d === -1) birdies++;
          else if (d === 0) pars++;
          else bogeys++;
        }
        return {
          gross: rs.gross,
          // Par SÓ dos buracos jogados — numa volta a decorrer os restantes vêm
          // a zero e comparar 9 buracos com o par de 18 dava "36 (−36)".
          parPerRound: playedParTotal(rs, parPerRound) || parPerRound,
          sd,
          sdSource: null as string | null,
          eagles,
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
        dob,
        // Idade pré-calculada pelo adapter (mesma que as tabs R1/R2/R3 usam) —
        // evita divergência entre tabs por recalcular com datas diferentes.
        age: (p as { _age?: number | null })._age ?? null,
        teeName: p.teeName,
        gross: numGross(p),
        parTotal: parPerRound * (p._roundsPlayed ?? nRounds),
        toPar: p.toPar ?? null,
        isIncomplete: !!p._incomplete,
        isWD: !!p._wd,
        isCut: !!p._cut,
        isHighlighted: isManuel(p),
        // Marca conterrâneo (.row-portuguese) — usado em FFG e outras páginas intl.
        isPortuguese: !isManuel(p) && !!(p as any)._isPortuguese,
        rounds: mappedRounds,
      };
    }) as MRRow[];
  }, [rawPlayers, escLookup, nRounds, parPerRound, playersDB, tournament.date, tournament.escalao, fedBirthdates]);

  // Referência para meta-informação do campo (mesmo que ScorecardLB)
  const refP0 = complete[0] ?? rawPlayers[0];
  const refRS = refP0?.roundScores?.find((rs) => rs.round === 1);
  const cr = refRS?.courseRating ?? refP0?.courseRating;
  const slope = refRS?.slope ?? refP0?.slope;
  const campo = tournament.campo || "";
  // A média só junta quem tem TODAS as voltas terminadas — com uma ronda a
  // decorrer (metade do campo com 9 buracos) o total médio não é comparável
  // com `Par × nRondas` e saía um "(−3.2)" enganador.
  const roundDone = (rs: { scores?: number[]; pars?: number[] }) =>
    !!rs.pars?.length && (rs.scores || []).filter(Boolean).length === rs.pars.length;
  const fully = complete.filter((p) => {
    const rss = p.roundScores || [];
    return rss.length >= nRounds && rss.every(roundDone);
  });
  const nEmCurso = complete.length - fully.length;
  const grosses = (fully.length ? fully : complete).map((p) => numGross(p)).filter((g) => !isNaN(g) && g > 0);
  const avgGross = grosses.length
    ? grosses.reduce((a, b) => a + b, 0) / grosses.length
    : null;

  const infoParts: (string | null)[] = [
    `${complete.length} classif.`,
    incomplete.length > 0 ? `${incomplete.length} inc.` : null,
    nEmCurso > 0 ? `${nEmCurso} a decorrer` : null,
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
      <div className="lb-info-line">
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
        tournamentDate={tournament.date}
        sortable
        filterable
        extraColumns={extraColumns}
        renderName={renderName}
      />
    </div>
  );
}
