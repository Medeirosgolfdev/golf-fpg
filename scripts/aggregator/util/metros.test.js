import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { somaMetros, metrosDeJardas, validar } = require("./metros.js");

describe("metros do tee", () => {
  it("soma os buracos jogados (zeros = não jogado)", () => {
    expect(somaMetros([300, 400, 0, 150])).toBe(850);
    expect(somaMetros([0, 0])).toBeNull();
    expect(somaMetros(null)).toBeNull();
  });
  it("converte jardas para metros", () => {
    expect(metrosDeJardas([100, 100])).toBe(183);
  });
  it("recusa totais absurdos (média por buraco fora de 30–650 m)", () => {
    expect(validar(61346, 18)).toBeNull();
    expect(validar(200, 18)).toBeNull();
    expect(validar(5279, 18)).toBe(5279);
    expect(validar(1882, 9)).toBe(1882);
  });
});
