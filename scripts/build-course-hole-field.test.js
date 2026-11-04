import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { juntaFicha } = require("./build-course-hole-field.js");

// «Quem jogou aqui» da Previsão: birdies/pares/bogeys por buraco de cada
// campo e tee, a partir das fichas dos nossos jogadores seguidos.
describe("build-course-hole-field — juntaFicha", () => {
  it("conta birdie ou melhor / par / bogey ou pior por buraco, campo e tee", () => {
    const acc = {};
    const ficha = (g) => ({
      DATA: [{ rounds: [{ scoreId: "1", courseKey: "oeiras green valley", tee: "Vermelhas" }] }],
      HOLES: { 1: { g, p: [4, 4, 3] } },
    });
    juntaFicha(acc, "100", ficha([3, 4, 5]));
    juntaFicha(acc, "200", ficha([5, 0, 2])); // 0 = não jogado, fica de fora
    const t = acc["oeiras green valley"].VERMELHAS;
    expect(t.r).toBe(2);
    expect(t.jog.size).toBe(2);
    expect(t.h[0]).toEqual([2, 1, 0, 1]); // 3 (birdie) e 5 (bogey) num par 4
    expect(t.h[1]).toEqual([1, 0, 1, 0]); // só o par
    expect(t.h[2]).toEqual([2, 1, 0, 1]); // 5 num par 3 (pior que bogey) e 2 (birdie)
  });

  it("ignora voltas sem buraco a buraco", () => {
    const acc = {};
    juntaFicha(acc, "100", { DATA: [{ rounds: [{ scoreId: "9", courseKey: "x", tee: "AZUIS" }] }], HOLES: {} });
    expect(acc).toEqual({});
  });
});
