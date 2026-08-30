import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { rankResults } = require("../util/rank.js");

/* O England Golf traz o `data-rank` cru do GolfGenius, que conta as DUAS linhas
   que o GG poe por jogador. Estes testes fixam o que o adapter passou a fazer
   com ele: deitar fora e reconstruir a posicao dos totais. */
const p = (name, total, rounds, pos = null) =>
  ({ playerName: name, pos, status: "OK", totalGross: total, rounds });
const r18 = (gross) => ({ round: 1, gross, strokes: Array(18).fill(4) });

describe("england — posicao reconstruida dos totais (o data-rank do GG vem a dobrar)", () => {
  it("ignora o data-rank 1,3,5 e devolve 1,2,2,4 com o empate a partilhar lugar", () => {
    // Caso real do Reid Trophy 2026: totais 212, 213, 213 saiam como 1, 3, 5.
    const res = [
      p("Marcus Karim", 212, [r18(212)], 1),
      p("Freddie Buck", 213, [r18(213)], 3),
      p("Alan Rode", 213, [r18(213)], 5),
      p("Quarto", 214, [r18(214)], 7),
    ];
    rankResults(res, 18);
    expect(res.map((x) => x.pos)).toEqual([1, 2, 2, 4]);
  });

  it("o ultimo de um field de 144 fica em 144, nao em 288", () => {
    const res = Array.from({ length: 144 }, (_, i) =>
      p("J" + i, 200 + i, [r18(200 + i)], 2 * i + 1)
    );
    rankResults(res, 18);
    expect(Math.max(...res.map((x) => x.pos))).toBe(144);
  });

  it("quem nao tem cartao fica sem posicao e marcado DNS", () => {
    const res = [p("Jogou", 212, [r18(212)], 1), p("Nao jogou", null, [], 3)];
    rankResults(res, 18);
    expect(res[0].pos).toBe(1);
    expect(res[1].pos).toBeNull();
    expect(res[1].status).toBe("DNS");
  });

  it("quem nao completou todas as rondas nao ganha o 1o lugar com menos voltas", () => {
    const res = [
      p("Tres voltas", 636, [r18(212), { round: 2, gross: 212, strokes: Array(18).fill(4) },
                             { round: 3, gross: 212, strokes: Array(18).fill(4) }], 1),
      p("Uma volta", 212, [r18(212)], 3),
    ];
    rankResults(res, 18);
    expect(res[0].pos).toBe(1);
    expect(res[1].pos).toBeNull();
    expect(res[1].status).toBe("CUT");
  });
});
