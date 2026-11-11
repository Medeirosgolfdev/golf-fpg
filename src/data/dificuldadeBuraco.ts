/**
 * dificuldadeBuraco — a «Dificuldade por buraco» de uma prova: a média do campo
 * em cada buraco, tirada dos cartões no formato comum (`Tournament` de uma volta,
 * como sai do `expandMultiRound`). Funções puras, sem React.
 *
 * A média só junta quem jogou o MESMO campo: o mesmo par por buraco e o mesmo
 * tee (nome do tee e metros, quando a fonte os dá). Numa prova com vários tees
 * sai um grupo por tee — nunca uma média a misturar campos diferentes. Um grupo
 * precisa de pelo menos 3 jogadores com cartão e de par oficial.
 *
 * Até 11/11/2026 esta conta vivia na BJGTPage, sobre o formato do BlueGolf.
 */
import type { Player, Tournament } from "./fpgTypes";
import { numGross } from "./fpgUtils";
import { temCartao } from "../utils/classificacao";
import { playerKey } from "../utils/playerKey";

export interface BuracoMedia {
  /** Média de pancadas no buraco (null = ninguém o jogou). */
  media: number | null;
  /** Média − par. */
  vsPar: number | null;
  /** Quantos cartões entram na média. */
  n: number;
}

export interface DificuldadeBuraco {
  /** Identifica o campo jogado (par + tee + metros) — ver `chaveDoCampo`. */
  chave: string;
  /** Nome do tee, quando a fonte o dá. */
  tee: string | null;
  /** Metros totais do tee, quando a fonte os dá. */
  metros: number | null;
  par: number[];
  buracos: BuracoMedia[];
  /** Jogadores com cartão buraco a buraco (em pelo menos uma das voltas). */
  comCartao: number;
}

/** Mínimo de JOGADORES com cartão para se falar em «média do campo». */
export const MIN_CARTOES = 3;

const parDe = (p: Player): number[] => (p.par?.length ? p.par : p.roundScores?.[0]?.pars) ?? [];
const scoresDe = (p: Player): number[] => (p.scores?.length ? p.scores : p.roundScores?.[0]?.scores) ?? [];
const metrosDe = (p: Player): number[] => (p.meters?.length ? p.meters : p.roundScores?.[0]?.meters) ?? [];
const teeDe = (p: Player): string => String(p.teeName ?? p.roundScores?.[0]?.teeName ?? "").trim().toLowerCase();

/** Par oficial e completo: 9 ou 18 buracos, todos par 3 a 6. */
export function parValido(par: readonly number[]): boolean {
  return (par.length === 9 || par.length === 18) && par.every((v) => v >= 3 && v <= 6);
}

/** Os jogadores de uma volta com cartão buraco a buraco (pelo menos um buraco jogado). */
function comBuracos(volta: Tournament): Player[] {
  return volta.players.filter((p) => scoresDe(p).some((v) => v > 0));
}

/** O campo que o jogador jogou nesta volta: par por buraco + tee + metros. */
export function chaveDoCampo(p: Player): string {
  const m = metrosDe(p);
  return [parDe(p).join(","), teeDe(p), m.some((v) => v > 0) ? m.join(",") : ""].join("|");
}

/** A média do campo por buraco, nas voltas dadas (uma = a volta; várias =
 *  todas): um grupo por tee, do que tem mais cartões para o que tem menos. */
export function dificuldadePorBuraco(voltas: readonly Tournament[]): DificuldadeBuraco[] {
  const porCampo = new Map<string, Player[]>();
  for (const v of voltas) for (const p of comBuracos(v)) {
    const k = chaveDoCampo(p);
    if (!porCampo.has(k)) porCampo.set(k, []);
    porCampo.get(k)!.push(p);
  }
  const grupos: DificuldadeBuraco[] = [];
  for (const [chave, cartoes] of porCampo) {
    const quem = new Set(cartoes.map((p) => playerKey(p.fed || p.fedCode, p.name)));
    if (quem.size < MIN_CARTOES) continue;   // jogadores, não cartões: 2 jogadores em 2 voltas não fazem um campo
    const par = parDe(cartoes[0]);
    if (!parValido(par)) continue;
    const soma = par.map(() => 0), n = par.map(() => 0);
    for (const p of cartoes) {
      const sc = scoresDe(p);
      for (let i = 0; i < par.length; i++) if (sc[i] > 0) { soma[i] += sc[i]; n[i]++; }
    }
    const buracos = par.map((pr, i): BuracoMedia => (n[i]
      ? { media: soma[i] / n[i], vsPar: soma[i] / n[i] - pr, n: n[i] }
      : { media: null, vsPar: null, n: 0 }));
    const m = metrosDe(cartoes[0]);
    const tee = String(cartoes[0].teeName ?? cartoes[0].roundScores?.[0]?.teeName ?? "").trim();
    grupos.push({
      chave, tee: tee || null,
      metros: m.some((v) => v > 0) ? m.reduce((a, b) => a + b, 0) : null,
      par, buracos, comCartao: quem.size,
    });
  }
  return grupos.sort((a, b) => b.comCartao - a.comCartao || String(a.tee).localeCompare(String(b.tee)));
}

export interface ResumoDoCampo {
  /** Jogadores que contam para a média (com resultado na volta / com todas as voltas). */
  jogadores: number;
  /** Os outros da lista (sem cartão, desistências, cut, voltas por jogar). */
  outros: number;
  /** Média de pancadas (da volta, ou do total das voltas). */
  media: number | null;
  /** O primeiro, pelo total — só no acumulado. */
  lider?: { nome: string; total: number };
}

/** Uma volta: quantos a acabaram e a média de pancadas. */
export function resumoDaVolta(volta: Tournament): ResumoDoCampo {
  const feitos = volta.players.filter((p) => !p._wd && temCartao(numGross(p)));
  const media = feitos.length ? feitos.reduce((s, p) => s + numGross(p), 0) / feitos.length : null;
  return { jogadores: feitos.length, outros: volta.players.length - feitos.length, media };
}

/** O acumulado (a entrada «Resumo» do `expandMultiRound`): só quem jogou todas as voltas. */
export function resumoDoTotal(total: Tournament): ResumoDoCampo {
  const completos = total.players
    .filter((p) => !p._wd && !p._cut && !p._incomplete && temCartao(numGross(p)))
    .sort((a, b) => numGross(a) - numGross(b));
  const media = completos.length ? completos.reduce((s, p) => s + numGross(p), 0) / completos.length : null;
  return {
    jogadores: completos.length,
    outros: total.players.length - completos.length,
    media,
    lider: completos[0] ? { nome: completos[0].name, total: numGross(completos[0]) } : undefined,
  };
}

/** Os buracos de um cartão por tipo de par: quantos, o ±par somado e as pancadas. */
export function porTipoDeBuraco(scores: readonly number[], par: readonly number[]): { par: number; n: number; total: number; media: number; scores: number[] }[] {
  return [3, 4, 5, 6].map((t) => {
    const idx = par.map((p, i) => (p === t ? i : -1)).filter((i) => i >= 0);
    const total = idx.reduce((s, i) => s + scores[i] - par[i], 0);
    return { par: t, n: idx.length, total, media: idx.length ? total / idx.length : 0, scores: idx.map((i) => scores[i]) };
  }).filter((x) => x.n > 0);
}

/** O cartão COMPLETO de um jogador numa volta (todos os buracos jogados, par oficial), ou null. */
export function cartaoCompleto(p: Player | null | undefined): { scores: number[]; par: number[] } | null {
  if (!p) return null;
  const par = parDe(p);
  const scores = scoresDe(p).slice(0, par.length);
  if (!parValido(par) || scores.length !== par.length || scores.some((v) => !(v > 0))) return null;
  return { scores, par };
}
