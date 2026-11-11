import { describe, it, expect } from "vitest";
import type { Player, Tournament } from "../fpgTypes";
import {
  cartaoCompleto, chaveDoCampo, dificuldadePorBuraco, parValido, resumoDaVolta, resumoDoTotal,
} from "../dificuldadeBuraco";

const PAR = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]; // 72
const cartao = (extra: number[]): number[] => PAR.map((p, i) => p + (extra[i] ?? 0));

function jogador(name: string, scores: number[], mais: Partial<Player> = {}): Player {
  const gross = scores.reduce((a, b) => a + b, 0);
  return { name, scoreId: name, pos: null, grossTotal: gross, toPar: gross - 72, scores, par: PAR, ...mais } as Player;
}
const volta = (players: Player[], mais: Partial<Tournament> = {}): Tournament =>
  ({ name: "Prova", date: "2026-05-01", campo: "Campo", tcode: "1", players, playerCount: players.length, ...mais } as Tournament);

describe("dificuldadePorBuraco", () => {
  it("dá a média do campo por buraco contra o par", () => {
    const gs = dificuldadePorBuraco([volta([
      jogador("A", cartao([0])), jogador("B", cartao([1])), jogador("C", cartao([2])),
    ])]);
    expect(gs).toHaveLength(1);
    const d = gs[0];
    expect(d.par).toEqual(PAR);
    expect(d.tee).toBeNull();
    expect(d.metros).toBeNull();
    expect(d.buracos[0]).toEqual({ media: 5, vsPar: 1, n: 3 });
    expect(d.buracos[1]).toEqual({ media: 4, vsPar: 0, n: 3 });
    expect(d.comCartao).toBe(3);
  });

  it("não há média com menos de 3 cartões", () => {
    expect(dificuldadePorBuraco([volta([jogador("A", cartao([])), jogador("B", cartao([]))])])).toEqual([]);
  });

  it("não mistura campos: um grupo por tee (par, nome do tee e metros)", () => {
    const m1 = PAR.map(() => 300), m2 = PAR.map(() => 250);
    const am = ["A", "B", "C", "D"].map((n) => jogador(n, cartao([1]), { teeName: "Amarelas", meters: m1 }));
    const vm = ["E", "F", "G"].map((n) => jogador(n, cartao([3]), { teeName: "Vermelhas", meters: m2 }));
    const gs = dificuldadePorBuraco([volta([...am, ...vm])]);
    // Do que tem mais cartões para o que tem menos.
    expect(gs.map((g) => [g.tee, g.comCartao, g.metros])).toEqual([["Amarelas", 4, 5400], ["Vermelhas", 3, 4500]]);
    expect(gs[0].buracos[0].media).toBe(5);
    expect(gs[1].buracos[0].media).toBe(7);
    expect(gs[0].chave).toBe(chaveDoCampo(am[0]));
    expect(gs[0].chave).not.toBe(gs[1].chave);
    // Um tee com menos de 3 cartões fica de fora — e não entra na média dos outros.
    const so2 = dificuldadePorBuraco([volta([...am, ...vm.slice(0, 2)])]);
    expect(so2.map((g) => g.tee)).toEqual(["Amarelas"]);
    expect(so2[0].buracos[0].n).toBe(4);
    // Pares diferentes no mesmo tee também se separam.
    const outroPar = ["H", "I", "J"].map((n) => jogador(n, cartao([]), { teeName: "Amarelas", meters: m1, par: [5, ...PAR.slice(1)] }));
    expect(dificuldadePorBuraco([volta([...am, ...outroPar])])).toHaveLength(2);
  });

  it("sem par oficial fica sem bloco (nada de par inventado)", () => {
    const semPar = ["A", "B", "C"].map((n) => jogador(n, cartao([]), { par: [] }));
    expect(dificuldadePorBuraco([volta(semPar)])).toEqual([]);
    expect(parValido([4, 4, 4])).toBe(false);
    expect(parValido(PAR.map(() => 0))).toBe(false);
    expect(parValido(PAR.slice(0, 9))).toBe(true);
  });

  it("buracos por jogar (zeros) não entram na média; sem cartão não conta", () => {
    const meio = jogador("C", PAR.map((p, i) => (i < 9 ? p : 0)));
    const wd = jogador("D", PAR.map(() => 0), { grossTotal: 999 });
    const [d] = dificuldadePorBuraco([volta([jogador("A", cartao([])), jogador("B", cartao([])), meio, wd])]);
    expect(d.buracos[0].n).toBe(3);
    expect(d.buracos[17].n).toBe(2);
    expect(d.comCartao).toBe(3);
  });

  it("várias voltas: junta os cartões e conta cada jogador uma vez", () => {
    const r1 = volta([jogador("A", cartao([0])), jogador("B", cartao([2])), jogador("C", cartao([1]))]);
    const r2 = volta([jogador("A", cartao([1])), jogador("B", cartao([1])), jogador("C", cartao([1]))]);
    const [d] = dificuldadePorBuraco([r1, r2]);
    expect(d.buracos[0]).toEqual({ media: 5, vsPar: 1, n: 6 });
    expect(d.comCartao).toBe(3);
    // O mínimo é de JOGADORES: dois jogadores em duas voltas (4 cartões) não fazem um campo.
    expect(dificuldadePorBuraco([volta(r1.players.slice(0, 2)), volta(r2.players.slice(0, 2))])).toEqual([]);
  });
});

describe("resumo do campo", () => {
  it("volta: quem a acabou e a média", () => {
    const r = resumoDaVolta(volta([jogador("A", cartao([])), jogador("B", cartao([2])), jogador("C", cartao([]), { grossTotal: 999 }), jogador("D", cartao([]), { _wd: true })]));
    expect(r).toEqual({ jogadores: 2, outros: 2, media: 73 });
  });

  it("acumulado: só quem jogou todas as voltas; o líder é o do menor total", () => {
    const r = resumoDoTotal(volta([
      jogador("A", [], { grossTotal: 150 }), jogador("B", [], { grossTotal: 146 }),
      jogador("C", [], { grossTotal: 74, _cut: true }), jogador("D", [], { grossTotal: 70, _incomplete: true }),
    ]));
    expect(r.jogadores).toBe(2);
    expect(r.outros).toBe(2);
    expect(r.media).toBe(148);
    expect(r.lider).toEqual({ nome: "B", total: 146 });
  });
});

describe("cartão do jogador", () => {
  it("cartaoCompleto: só com todos os buracos jogados e par oficial", () => {
    expect(cartaoCompleto(jogador("A", cartao([])))).toEqual({ scores: PAR, par: PAR });
    expect(cartaoCompleto(jogador("A", PAR.map((p, i) => (i === 17 ? 0 : p))))).toBeNull();
    expect(cartaoCompleto(jogador("A", cartao([]), { par: [] }))).toBeNull();
    expect(cartaoCompleto(undefined)).toBeNull();
  });
});
