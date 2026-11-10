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
    ? yardsArr.map((y) => (y && y > 0 ? (jaEmMetros ? y : Math.round(y * 0.9144)) : 0))
    : [];

  const holesFromPar = parArr.filter((p) => p > 0).length;
  const allRounds = merged.rounds.filter((r) => r && (r.strokes?.length || typeof r.gross === "number"));
  const firstStrokes = allRounds[0]?.strokes || [];
  const holesFromStrokes = firstStrokes.filter((s) => s > 0).length;
  const holes = holesFromPar > 0 ? holesFromPar : (holesFromStrokes <= 9 && holesFromStrokes > 0 ? 9 : 18);
  const is9 = holes <= 9;

  let effIndices: number[];
  if (is9 && parArr.length === 18) {
    effIndices = parArr.map((p, i) => (p > 0 ? i : -1)).filter((i) => i >= 0);
    if (effIndices.length !== 9) {
      effIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    }
  } else if (is9) {
    effIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  } else {
    effIndices = Array.from({ length: 18 }, (_, i) => i);
  }

  const parEff = effIndices.map((i) => parArr[i] || 0);
  const metersEff = metersArr.length > 0 ? effIndices.map((i) => metersArr[i] || 0) : [];

  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const frontPar = is9 ? sum(parEff) : sum(parEff.slice(0, 9));
  const backPar = is9 ? 0 : sum(parEff.slice(9));
  const totalPar = frontPar + backPar;
  const frontM = is9 ? sum(metersEff) : sum(metersEff.slice(0, 9));
  const backM = is9 ? 0 : sum(metersEff.slice(9));
  const totalM = frontM + backM;

  const roundRows = allRounds.map((rd) => {
    const strokes = (rd.strokes || []).slice();
    const strokesEff = effIndices.map((i) => strokes[i] || 0);
    const front = is9 ? sum(strokesEff) : sum(strokesEff.slice(0, 9));
    const back = is9 ? 0 : sum(strokesEff.slice(9));
    const gross = (rd.gross && rd.gross > 0) ? rd.gross : front + back;
    return {
      round: rd.round,
      strokesEff,
      front, back, gross,
      isFocused: rd.round === focusedRound,
    };
  });

  const totalGross = result.totalGross
    || (roundRows.length > 0 && roundRows.every((r) => r.gross > 0)
      ? roundRows.reduce((s, r) => s + r.gross, 0)
      : 0);
  const totalToPar = result.toPar
    ?? (totalGross > 0 && totalPar > 0 && roundRows.length > 0
      ? totalGross - totalPar * roundRows.length
      : null);

  // O cartão é o ScorecardLeaderboard global, com uma linha por ronda.
  const parForLb = parEff.some((p) => p > 0) ? parEff : [];
  const lbRows: ScorecardRow[] = roundRows.map((rr) => ({
    key: rr.round,
    pos: "",
    gross: rr.gross,
    toPar: rr.gross > 0 && totalPar > 0 ? rr.gross - totalPar : null,
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
