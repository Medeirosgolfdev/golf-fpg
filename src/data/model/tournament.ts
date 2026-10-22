/**
 * src/data/model/tournament.ts — formato, estado, buracos, cut e origem do par
 * de um torneio (`Tournament` no formato FPG, o que todas as fontes produzem)
 * e de uma divisão do CircuitShell.
 *
 * As funções dizem o MESMO que as inferências que já existiam (há testes):
 *  - resultados = algum jogador com voltas ou total (`jovensCandidates`);
 *  - a decorrer = `_openRound` (o `expandMultiRound` não procura cut nela);
 *  - cut = `_cutAfterRound` do `expandMultiRound` (aba «Pré-Cut»);
 *  - buracos = a regra do `ScorecardLB` (par mais comprido; sem par, cartões).
 * Os conversores gravam o resultado nos campos do modelo (`withTournamentModel`,
 * `withDivisionModel`); as inferências antigas continuam a funcionar ao lado.
 */
import type { Tournament, Player } from "../fpgTypes";
import { expandMultiRound } from "../fpgUtils";
import type { CutInfo, ParOrigin, TournamentFormat, TournamentModel, TournamentStatus } from "./types";

/* ── Resultados e estado ── */

/** Há resultados publicados? (algum jogador com voltas ou com total). */
export function tournamentHasResults(t: Pick<Tournament, "players">): boolean {
  return (t.players || []).some((p) => (p.roundScores?.length ?? 0) > 0 || p.grossTotal != null);
}

/** Estado pelos dados: volta aberta → `live`; com resultados → `finished`;
 *  sem resultados (só inscrições/draw) → `future`. */
export function tournamentStatus(t: Pick<Tournament, "players"> & { _openRound?: number }): TournamentStatus {
  if (t._openRound != null) return "live";
  return tournamentHasResults(t) ? "finished" : "future";
}

/* ── Formato ── */

/** Cartão buraco a buraco de um jogador (flat ou na 1.ª volta). */
function hasCard(p: Player): boolean {
  if ((p.scores ?? []).some((x) => typeof x === "number" && x > 0)) return true;
  return (p.roundScores ?? []).some((r) => (r.scores ?? []).some((x) => typeof x === "number" && x > 0));
}

/** Formato de um torneio: Clubes em match play 3-way → `matchplay-team`;
 *  Clubes por pancadas (grupos/categorias) → `stroke-team`; com resultados mas
 *  sem nenhum cartão → `totals`; o resto → `stroke`. */
export function tournamentFormat(t: Pick<Tournament, "players" | "series"> & { matchPlayResults?: unknown; _clubesEsc?: string }): TournamentFormat {
  if (t.matchPlayResults) return "matchplay-team";
  if (t._clubesEsc || t.series === "clubes") return "stroke-team";
  if (tournamentHasResults(t) && !(t.players || []).some(hasCard)) return "totals";
  return "stroke";
}

/* ── Buracos ── */

/** Nº de buracos que o leaderboard desenha (a regra do `ScorecardLB`): o par
 *  mais comprido dos jogadores; sem par, 18 se algum cartão passa de 9, 9 se
 *  há cartões; sem cartões, o `nholes` do 1.º jogador; senão null. */
export function tournamentHoles(t: Pick<Tournament, "players">): number | null {
  const ps = t.players || [];
  let par = 0;
  for (const p of ps) par = Math.max(par, (p.par?.length ? p.par : p.roundScores?.[0]?.pars)?.length ?? 0);
  if (par > 0) return par;
  const card = Math.max(0, ...ps.map((p) => (p.scores?.length ? p.scores : p.roundScores?.[0]?.scores)?.length ?? 0));
  if (card > 9) return 18;
  if (card > 0) return 9;
  return ps[0]?.nholes || null;
}

/* ── Origem do par ── */

const fullPar = (par: readonly unknown[] | null | undefined): boolean =>
  !!par && (par.length === 9 || par.length === 18) && par.every((x) => typeof x === "number" && x > 0);

/** De onde vem o par: algum jogador com par por buraco completo → `oficial`;
 *  só par total ou ±par da fonte → `total-only`; nada → `none`. */
export function tournamentParOrigin(t: Pick<Tournament, "players">): ParOrigin {
  const ps = t.players || [];
  if (ps.some((p) => fullPar(p.par) || (p.roundScores ?? []).some((r) => fullPar(r.pars)))) return "oficial";
  if (ps.some((p) => (p.parTotal ?? 0) > 0 || typeof p.toPar === "number")) return "total-only";
  return "none";
}

/* ── Cut ── */

/** Cut do torneio — o mesmo do `expandMultiRound` (aba «Pré-Cut»): volta do
 *  cut, linha (pior acumulado de quem passou) e nº de eliminados. null = sem
 *  cut (ou volta a decorrer, onde não se procura). */
export function tournamentCut(t: Tournament): CutInfo | null {
  const tot = expandMultiRound(t).find((x) => (x as { _isTotal?: boolean })._isTotal) as
    (Tournament & { _cutAfterRound?: number }) | undefined;
  const n = tot?._cutAfterRound;
  if (!tot || !n) return null;
  const passed = tot.players.filter((p) => !p._cut && !p._wd && (p.roundScores?.length ?? 0) >= n);
  const sums = passed.map((p) => {
    const rs = (p.roundScores ?? []).filter((r) => r.round <= n);
    return rs.length === n && rs.every((r) => r.gross > 0) ? rs.reduce((a, r) => a + r.gross, 0) : null;
  });
  const line = sums.length && sums.every((x) => x != null) ? Math.max(...(sums as number[])) : null;
  return { afterRound: n, line, out: tot.players.filter((p) => p._cut).length };
}

/* ── Tudo junto ── */

/** O modelo completo de um torneio. */
export function tournamentModel(t: Tournament): Required<TournamentModel> {
  return {
    format: tournamentFormat(t),
    status: tournamentStatus(t),
    holes: tournamentHoles(t),
    cut: tournamentCut(t),
    parOrigin: tournamentParOrigin(t),
  };
}

/** O torneio com os campos do modelo preenchidos (objecto novo; o original
 *  fica intacto — pode vir da cache de fetch, que é só de leitura). Um formato
 *  que o conversor conhece melhor do que os dados entra por `format`. */
export function withTournamentModel<T extends Tournament>(t: T, format?: TournamentFormat): T {
  const m = tournamentModel(t);
  return { ...t, ...m, ...(format ? { format } : {}) };
}
