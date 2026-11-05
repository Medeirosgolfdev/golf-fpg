/**
 * tamanhoDoField — o field de um escalão USKids (05/11/2026). O uskids-field-sizes.json
 * guarda os inscritos do dia em que leu a prova e nunca os actualiza (Venice Open 2026
 * Boys 12: 6 inscritos guardados, 31 jogaram).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { tamanhoDoField } = require("./uskids.js");

// Como o adapter os produz: o jogador é o playerSourceKey
const res = (n) => Array.from({ length: n }, (_, i) => ({ playerSourceKey: `uskids:${i}`, playerName: `J${i}` }));

describe("tamanhoDoField", () => {
  it("inscritos guardados antigos (6) e 31 nos resultados → 31 (caso Venice 2026 Boys 12)", () => {
    expect(tamanhoDoField([6], res(31))).toBe(31);
  });
  it("resultados só dos jogadores seguidos (4) e 40 inscritos → 40", () => {
    expect(tamanhoDoField([40], res(4))).toBe(40);
  });
  it("o maior entre os dois ficheiros de inscritos e os resultados", () => {
    expect(tamanhoDoField([12, 21], res(18))).toBe(21);
  });
  it("o mesmo jogador repetido nos resultados conta uma vez", () => {
    expect(tamanhoDoField([], [{ playerSourceKey: "uskids:1" }, { playerSourceKey: "uskids:1" }, { playerSourceKey: "uskids:2" }])).toBe(2);
  });
  it("sem inscritos nem resultados → null", () => {
    expect(tamanhoDoField([], [])).toBe(null);
  });
});
