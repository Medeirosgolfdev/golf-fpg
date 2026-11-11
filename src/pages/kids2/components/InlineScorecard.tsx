/**
 * kids2/components/InlineScorecard.tsx
 *
 * Mesmo conteúdo do ScorecardModal mas SEM overlay/popup — pensado para
 * ser embedido dentro de uma row de tabela como cartão que expande para baixo.
 *
 * Todas as rondas (R1, R2, R3...) numa tabela hole-by-hole, com a ronda
 * focada (origem do clique) destacada visualmente.
 */

import type { Tournament, Flight, Result, Junior } from "../data";
import { getKnownScorecard, mergeFlightWithKnown } from "../knownScorecards";
import CloseButton from "../../../ui/CloseButton";
import ToPar from "../../../ui/ToPar";
import { ScorecardLeaderboard, type ScorecardRow } from "../../../ui/ScorecardLeaderboard";
import { isNoCardGross } from "../../../data/intlCommon";
import { temCartao } from "../../../utils/classificacao";
import { cartaoDaVolta, toParDaVolta, parPorVoltaDaFonte, resumoResultado } from "../../../utils/voltasJogadas";
import { jardasParaMetros } from "../../../utils/jardas";

interface Props {
  tournament: Tournament;
  flight: Flight;
  result: Result;
  /** Ronda focada — destaca visualmente. */
  focusedRound: number;
  playerName: string;
  /** Botão fechar (opcional). */
  onClose?: () => void;
  /** Se passar o junior, o componente tenta enriquecer par/yards/strokes
   *  com os scorecards públicos hardcoded em `knownScorecards.ts` quando o
   *  canónico não os tem. Mostra rodapé "Fonte: …" quando algum dado vem do fallback. */
  junior?: Junior;
}

export default function InlineScorecard({ tournament, flight, result, focusedRound, playerName, onClose, junior }: Props) {
  // Fallback transparente para scorecards públicos hardcoded (WJGC26, EOWAGR25, etc.)
  const known = junior ? getKnownScorecard(junior, tournament) : null;
  const merged = mergeFlightWithKnown(flight, result, known);

  const parArr = merged.par.slice();
  const yardsArr = merged.yards;
  // (merged.si fica disponível para futura coluna SI no scorecard.)
  // Nas provas FPG o `yards` do flight já vem em METROS (bate com o `metros`
  // da volta); converter outra vez encurtava o campo 8,6 % (6034 m → «5517m»).
  const jaEmMetros = tournament.sourceId === "fpg";
  const metersArr = yardsArr.length > 0
    ? yardsArr.map((y) => (y && y > 0 ? (jaEmMetros ? y : jardasParaMetros(y)) : 0))
    : [];

  // Buracos de cada volta pelo que ela jogou (10/11/2026): as voltas de 9 da
  // USKids vêm com 9 pancadas seguidas e o par dos 18 buracos do campo (gross 35
  // dava «−37»), ou com o par só nos buracos 10–18 (o cartão saía sem pancadas).
  const allRounds = merged.rounds.filter((r) => r && (r.strokes?.length || typeof r.gross === "number"));
  const parEsperado = parPorVoltaDaFonte(result);
  const cartoes = allRounds.map((rd) => cartaoDaVolta(parArr, rd, { parEsperado }));
  // O desenho do cartão (9 ou 18 buracos, e quais) é o da 1.ª volta com buraco a buraco.
  const ref = cartoes.find((c) => c.temPancadas) ?? cartoes[0] ?? cartaoDaVolta(parArr, null, { parEsperado });
  const is9 = ref.nBuracos === 9;
  const effIndices = ref.buracos;
  const parEff = ref.par;
  const metersEff = metersArr.length > 0 ? effIndices.map((i) => metersArr[i] || 0) : [];

  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const totalPar = ref.parVolta ?? 0;
  const totalM = sum(metersEff);

  const roundRows = allRounds.map((rd, k) => {
    const c = cartoes[k];
    const strokesEff = effIndices.map((h) => { const j = c.buracos.indexOf(h); return j >= 0 ? c.pancadas[j] : 0; });
    // Gross ≥ 900 = sem cartão: a volta fica sem gross nem ±par.
    const gross = temCartao(rd.gross) ? rd.gross : isNoCardGross(rd.gross) ? 0 : sum(strokesEff);
    return {
      round: rd.round,
      strokesEff,
      gross,
      toPar: toParDaVolta(parArr, { ...rd, gross }, { parEsperado }),
      isFocused: rd.round === focusedRound,
    };
  });

  // Total e ±par com as regras do site (sem cartão → vazio; ±par pelas voltas jogadas).
  const resumo = resumoResultado({ totalGross: result.totalGross, toPar: result.toPar, rounds: allRounds }, parArr,
    { parTotal: tournament.parTotal, buracos: tournament.holesPerRound });
  const totalGross = resumo.total ?? 0;
  const totalToPar = resumo.toPar;

  // O cartão é o ScorecardLeaderboard global, com uma linha por ronda.
  const parForLb = parEff.some((p) => p > 0) ? parEff : [];
  const lbRows: ScorecardRow[] = roundRows.map((rr) => ({
    key: rr.round,
    pos: "",
    gross: rr.gross,
    toPar: rr.toPar,
    scores: rr.strokesEff,
    nameContent: <span className="fw-700">R{rr.round}</span>,
    rowBg: rr.isFocused ? "var(--bg-muted)" : undefined,
  }));

  return (
    <div className="u-bg-bg-card u-bd-1px-solid-border u-br-radius-lg u-p-12px-16px u-mt-6pxx">
      <div className="u-d-flex u-ai-baseline u-jc-space-between u-mb-10px u-gap-12px">
        <div>
          <div className="u-fs-fs-13 u-fw-700 u-c-text">{playerName}</div>
          <div className="u-fs-fs-11 u-c-text-3 u-mt-2px">
            {tournament.name || tournament.shortName} · {flight.label}
            {roundRows.length > 1 ? ` · ${roundRows.length} rondas` : ` · Ronda ${focusedRound}`}
            {tournament.course && <> · <span className="u-fst-italic">{tournament.course}</span></>}
          </div>
        </div>
        {onClose && (
          <CloseButton onClick={onClose} />
        )}
      </div>

      {totalGross > 0 && totalPar > 0 && totalToPar !== null && (
        <div className="u-d-flex u-gap-14px u-ai-baseline u-mb-10px u-p-6px-10px u-bg-bg u-br-radius u-bd-1px-solid-border-light">
          <div>
            <span className="u-fs-fs-10 u-c-text-3 u-ls-0_3px u-tt-uppercase">Total</span>
            <span className="u-fs-fs-20 u-fw-800 u-ml-6px u-c-text u-fvn-tabular-nums">{totalGross}</span>
          </div>
          <div>
            <span className="u-fs-fs-10 u-c-text-3 u-ls-0_3px u-tt-uppercase">±par</span>
            <ToPar v={totalToPar} className="u-fs-fs-14 u-ml-6px" />
          </div>
          <div className="u-ml-auto u-fs-fs-10 u-c-text-3">
            Par {totalPar}{totalM > 0 && ` · ${totalM}m`}{is9 && " · 9 buracos"}
          </div>
        </div>
      )}

      <ScorecardLeaderboard
        par={parForLb}
        holes={effIndices.length}
        startHole={is9 ? effIndices[0] + 1 : 1}
        teeMeters={metersEff.some((m) => m > 0) ? [{ teeName: "", meters: metersEff }] : undefined}
        rows={lbRows}
        showScorecard
      />

      {merged.fallbackSource && (
        <div className="u-mt-8px u-p-4px-8px u-fs-fs-10 u-c-text-3 u-fst-italic u-bt-1px-dashed-border-light">
          Fonte: {merged.fallbackSource}
        </div>
      )}
    </div>
  );
}
