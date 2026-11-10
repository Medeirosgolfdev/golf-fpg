import { describe, it, expect } from "vitest";
import { indicesDoMelhor, arredondar } from "../melhorValor";

describe("melhorValor", () => {
  it("o mais baixo por omissão; o mais alto com «high»", () => {
    expect(indicesDoMelhor([80, 76, 91])).toEqual([1]);
    expect(indicesDoMelhor([40, 55, 38], "high")).toEqual([1]);
  });

  it("handicap plus é negativo: −3,5 é melhor do que −2,4", () => {
    expect(indicesDoMelhor([-2.4, -3.5])).toEqual([1]);
  });

  it("vazios não entram e não mexem nos índices", () => {
    expect(indicesDoMelhor([null, 80, undefined, 76])).toEqual([3]);
    expect(indicesDoMelhor([NaN, 80])).toEqual([]);
  });

  it("menos de dois valores, ou todos iguais: ninguém é o melhor", () => {
    expect(indicesDoMelhor([80])).toEqual([]);
    expect(indicesDoMelhor([85, 85])).toEqual([]);
    expect(indicesDoMelhor([])).toEqual([]);
  });

  it("empatados no melhor ficam todos", () => {
    expect(indicesDoMelhor([76, 80, 76])).toEqual([0, 2]);
  });

  it("arredondar às casas mostradas", () => {
    expect(arredondar(84.4)).toBe(84);
    expect(arredondar(0.724, 2)).toBe(0.72);
  });
});
