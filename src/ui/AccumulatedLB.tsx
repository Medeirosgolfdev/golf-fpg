/**
 * AccumulatedLB.tsx — Multi-round accumulated leaderboard
 *
 * Extracted from LeaderboardComponents.tsx
 * Displays accumulated scores across multiple rounds.
 */
import React, { useMemo, useState } from "react";
import type { EscLookup } from "../utils/playerUtils";
import type { Tournament } from "../data/fpgTypes";
import { numGross, resolveEsc, playerDob, computeSD, playedParTotal, isRoundInProgress } from "../data/fpgUtils";
import { MultiRoundLeaderboard } from "./MultiRoundLeaderboard";
import { RoundPill } from "./PillBadge";
import { HoleBadge } from "./tableCells";
import { InfoGroup, InfoItem, RatingFontes, TeeDistances } from "./InfoLine";
import EmptyState from "./EmptyState";
import { isManuel, type PlayersDB } from "./tournamentPrimitives";
import { useFedBirthdates } from "./InscricoesComponents";
import type { MultiRoundRow as MRRow, MRRound, ExtraColumn } from "./multiRoundTypes";
import { medalNet, stablefordNet } from "../utils/whsCalc";
import { modoDaModalidade, type ModoClassif } from "../data/fpgModalidades";

/** As mesmas três modalidades do tab da volta (ScorecardLB). */
const MODOS: Array<{ key: ModoClassif; label: string; title: string }> = [
  { key: "stroke", label: "Stroke Play", title: "Pancadas, sem handicap" },
  { key: "medalNet", label: "Medal Net", title: "Pancadas menos o HCP de jogo, somadas as voltas" },
  { key: "stbNet", label: "Stableford Net", title: "Pontos Stableford com o HCP de jogo, somadas as voltas" },
];

export function AccumulatedLB({
  tournament,
  nRounds,
  escLookup,
  playersDB,
  showCols: showColsProp,
  extraColumns,
  renderName,
  showCourse,
  modalidade,
}: {
  /** Modalidade oficial da prova (FPG/Termos) — o selector abre nela. */
  modalidade?: string | null;
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

  // Classificados = quem acabou (sem cortados nem desistentes). Antes contava
  // os cortados/WD como «classif.» e, por lhes faltar a última volta, como
  // «a decorrer» num torneio já acabado (50 Anos de Autonomia: «13 a decorrer»).
  const complete = rawPlayers.filter((p) => !p._incomplete && !p._cut && !p._wd);
  const incomplete = rawPlayers.filter((p) => p._incomplete && !p._wd);
  const nCut = rawPlayers.filter((p) => p._cut && !p._wd).length;
  const nWd = rawPlayers.filter((p) => p._wd).length;
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

  // Medal Net / Stableford Net: soma das voltas com o HCP de jogo do jogador
  // (a FPG guarda um por jogador, não por volta). Só com HCP de jogo na maioria
  // do campo e SI nos cartões.
  const modoDaProva = modoDaModalidade(modalidade);
  const [modoEscolhido, setModo] = useState<ModoClassif | null>(null);
  // A escolha vale até mudar de torneio.
  const [lastTcode, setLastTcode] = useState(tournament.tcode);
  if (tournament.tcode !== lastTcode) { setLastTcode(tournament.tcode); setModo(null); }
  const comHcpJogo = complete.filter((p) => p.hcpPlay != null);
  const temModos = comHcpJogo.length > 0 && comHcpJogo.length * 2 >= complete.length
    && comHcpJogo.some((p) => p.roundScores?.some((rs) => rs.si?.length && rs.pars?.length));
  const modo: ModoClassif = temModos ? (modoEscolhido ?? modoDaProva ?? "stroke") : "stroke";
  const valorModo = useMemo(() => {
    const m = new Map<string, number | null>();
    if (modo === "stroke") return m;
    for (const p of rawPlayers) {
      const rss = p.roundScores || [];
      const ok = p.hcpPlay != null && rss.length > 0 && rss.every((rs) => (rs.gross ?? 0) > 0 && (rs.gross ?? 0) < 900);
      let v: number | null = null;
      if (ok) {
        v = 0;
        for (const rs of rss) {
          if (modo === "medalNet") v += medalNet(rs.gross, p.hcpPlay!);
          else if (rs.scores?.some((x) => x > 0) && rs.si?.length && rs.pars?.length) v += stablefordNet(rs.scores, rs.pars, rs.si, p.hcpPlay!);
          else { v = null; break; }
        }
      }
      m.set(p.scoreId || p.name, v);
    }
    return m;
  }, [rawPlayers, modo]);
  const rankBy = useMemo(() => modo === "stroke" ? undefined : {
    label: modo === "medalNet" ? "Net" : "Pts",
    higherIsBetter: modo === "stbNet",
    value: (r: MRRow) => valorModo.get(r.key || r.name) ?? null,
  }, [modo, valorModo]);

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

  // Buracos de cada volta e distância por tee (como na linha da volta, 22/10/2026).
  const holesCount = new Map<number, number>();
  const teeDist = new Map<string, number>();
  for (const p of rawPlayers) {
    for (const rs of p.roundScores ?? []) {
      const n = rs.pars?.length || rs.scores?.length || 0;
      if (n) holesCount.set(n, (holesCount.get(n) ?? 0) + 1);
      const tn = rs.teeName || p.teeName;
      const m = rs.meters?.length ? rs.meters : p.meters;
      if (tn && m && m.length >= n && n > 0 && !teeDist.has(tn)) {
        const off = n === 9 && m.length >= 18 && rs.startHole === 10 ? 9 : 0;
        const tot = m.slice(off, off + n).reduce((a, b) => a + (b || 0), 0);
        if (tot > 0) teeDist.set(tn, tot);
      }
    }
  }
  const holesPerRound = [...holesCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const fmtDelta = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;

  // Early return seguro — useMemo já foi chamado acima
  if (!rawPlayers.length) return <EmptyState size="sm" message="Sem resultados." />;

  return (
    <div>
      <div className="lb-info-line info-line">
        <InfoGroup>
          <InfoItem v={complete.length} l="classif." />
          {incomplete.length > 0 && <InfoItem v={incomplete.length} l="inc." muted />}
          {nCut > 0 && <InfoItem v={nCut} l="cut" muted />}
          {nWd > 0 && <InfoItem v={nWd} l="WD" muted />}
          {nEmCurso > 0 && <InfoItem v={nEmCurso} l="a decorrer" muted />}
        </InfoGroup>
        <InfoGroup>
          {nRounds > 1 && <RoundPill nR={nRounds} />}
          {holesPerRound && <HoleBadge hc={holesPerRound} />}
          {teeDist.size > 0 && <TeeDistances list={[...teeDist.entries()].map(([tee, meters]) => ({ tee, meters }))} />}
          {parTorneio != null && <InfoItem pre="Par" v={parTorneio} />}
        </InfoGroup>
        <InfoGroup>
          {avgGross != null && <InfoItem pre="Média" v={avgGross.toFixed(1)} l={parTorneio != null ? `(${fmtDelta(avgGross - parTorneio)})` : undefined} />}
        </InfoGroup>
        <InfoGroup>
          {/* O campo só aqui quando cada escalão joga num campo diferente (o do
              torneio já está no cabeçalho) — 14/10/2026. */}
          {showCourse && tournament.campo && <InfoItem v={`📍 ${tournament.campo}`} />}
          {cr && <InfoItem pre="CR" v={cr} />}
          {slope && <InfoItem pre="Slope" v={slope} l={tournament._sdEstimate ? "(estimados)" : undefined} title={tournament._sdEstimate} />}
        </InfoGroup>
        <RatingFontes list={tournament._ratingFontes} />
        {temModos && (
          <div className="segmented-toggle seg-sm" role="tablist" aria-label="Modalidade da classificação">
            {MODOS.map((m) => (
              <button key={m.key} role="tab" aria-selected={modo === m.key}
                title={modoDaProva === m.key ? `${m.title} — a modalidade desta prova` : m.title}
                className={`seg-btn${modo === m.key ? " active" : ""}`} onClick={() => setModo(m.key)}>
                <span className="seg-label">{m.label}{modoDaProva === m.key ? " ✓" : ""}</span>
              </button>
            ))}
          </div>
        )}
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
        rankBy={rankBy}
      />
    </div>
  );
}
