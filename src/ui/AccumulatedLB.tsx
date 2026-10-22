/**
 * AccumulatedLB.tsx — Multi-round accumulated leaderboard
 *
 * Extracted from LeaderboardComponents.tsx
 * Displays accumulated scores across multiple rounds.
 */
import React, { useMemo } from "react";
import type { EscLookup } from "../utils/playerUtils";
import type { Tournament } from "../data/fpgTypes";
import { numGross, resolveEsc, playerDob, computeSD, playedParTotal, isRoundInProgress } from "../data/fpgUtils";
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
  showCourse,
}: {
  /** Campo na linha de informação (torneios com um campo por escalão). */
  showCourse?: boolean;
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
  // Par de uma volta: o par total ou a soma do par por buraco. Sem nenhum dos
  // dois (fonte sem par oficial) → sem par: nada de ±par nem «Par 72» inventado.
  const parOfPlayer = (p: (typeof rawPlayers)[number] | undefined): number | null =>
    p?.parTotal || p?.par?.reduce((a, b) => a + b, 0) || null;
  const parPerRound: number | null = parOfPlayer(complete[0]) ?? parOfPlayer(incomplete[0]);
  const semParBuraco = !rawPlayers.some((p) => p.roundScores?.some((rs) => rs.pars?.length));
  // Par do torneio = soma do par de CADA volta (13/10/2026 — PGA Golf Club
  // Invitational: R1 de 18 e R2 encurtada a 9; «Par × nRondas» dava 72 em vez
  // de 108). Sem pares por volta, fica o Par × nRondas de sempre.
  const sumRoundPars = (p: (typeof rawPlayers)[number] | undefined): number | null => {
    const rss = p?.roundScores || [];
    if (!rss.length || rss.some((rs) => !rs.pars?.length)) return null;
    return rss.reduce((s, rs) => s + rs.pars.reduce((a: number, b) => a + (b || 0), 0), 0);
  };
  const parRef = complete.find((p) => (p.roundScores?.length ?? 0) >= nRounds);
  const parTorneio = sumRoundPars(parRef) ?? (parPerRound != null ? parPerRound * nRounds : null);

  // useMemo ANTES do early return — regra dos hooks React
  const rows: MRRow[] = useMemo(() => {
    return rawPlayers.map((p) => {
      const esc = resolveEsc(p, escLookup, { tournamentDate: tournament.date, playersDB, fedBirthdates }) || tournament.escalao || "";
      const dob = playerDob(p, { playersDB, fedBirthdates });
      const roundScores = p.roundScores || [];
      // Posicionar cada ronda pelo seu número real (rounds[0]=R1, rounds[1]=R2, ...)
      // para que jogadores parciais mostrem "–" nas rondas que não jogaram
      const mappedRounds = Array.from({ length: nRounds }, (_, i) => {
        const rdNum = i + 1;
        const rs = roundScores.find((r) => r.round === rdNum);
        if (!rs) return undefined;
        // SD: o oficial da FPG ou, sem ele, o calculado com o HCP da inscrição.
        const { sd } = computeSD({
          ...p,
          sd: undefined,
          roundScores: [rs],
          scores: rs.scores,
          par: rs.pars,
          si: rs.si,
          // CR/Slope da volta ou, sem ele, o do jogador (FFG: vem da série) —
          // senão o Resumo ficava sem SD que as abas das voltas têm (22/10/2026).
          courseRating: rs.courseRating ?? p.courseRating,
          slope: rs.slope ?? p.slope,
          // PCC é por ronda — sem fallback ao do jogador (= PCC da R1).
          pcc: rs.pcc,
          nholes: rs.pars?.length,
          grossTotal: rs.gross,
        }, tournament.date);
        let eagles = 0,
          birdies = 0,
          pars = 0,
          bogeys = 0;
        for (let i = 0; i < (rs.pars?.length ? rs.scores?.length ?? 0 : 0); i++) {
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
          parPerRound: (playedParTotal(rs, parPerRound ?? 0) || parPerRound) ?? undefined,
          sd,
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
        parTotal: sumRoundPars(p) ?? (parPerRound != null ? parPerRound * (p._roundsPlayed ?? nRounds) : undefined),
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
  // A média só junta quem tem TODAS as voltas terminadas — com uma ronda a
  // decorrer (metade do campo com 9 buracos) o total médio não é comparável
  // com `Par × nRondas` e saía um "(−3.2)" enganador.
  // Buracos riscados (sem pancadas, mas com o gross oficial) NÃO são volta a
  // decorrer — o Torneio 50 Anos de Autonomia dizia «95 a decorrer» depois de
  // acabado (14/10/2026). A regra é a do isRoundInProgress (fpgUtils).
  // Sem par por buraco em todo o torneio, a volta acaba quando tem gross.
  const roundDone = (rs: { gross?: number | null; scores?: number[]; pars?: number[] }) =>
    (semParBuraco || !!rs.pars?.length) && (rs.gross ?? 0) > 0 && !isRoundInProgress(rs);
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
    parTorneio != null ? `Par ${parTorneio}` : null,
    avgGross != null
      ? `Média ${avgGross.toFixed(1)}` + (parTorneio != null ? ` (${avgGross - parTorneio >= 0 ? "+" : ""}${(avgGross - parTorneio).toFixed(1)})` : "")
      : null,
    // O campo só aqui quando cada escalão joga num campo diferente (o do
    // torneio já está no cabeçalho) — 14/10/2026.
    showCourse && tournament.campo ? `📍 ${tournament.campo}` : null,
    cr ? `CR ${cr}` : null,
    slope ? `Slope ${slope}${tournament._sdEstimate ? " (estimados)" : ""}` : null,
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
        showCols={{ ...(showColsProp ?? { esc: true, fed: true, tee: true }), ...(parPerRound == null ? { roundToPar: false } : {}) }}
        tournamentDate={tournament.date}
        sortable
        filterable
        extraColumns={extraColumns}
        renderName={renderName}
        sdEstimate={tournament._sdEstimate}
      />
    </div>
  );
}
