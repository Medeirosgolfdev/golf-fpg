import { describe, it, expect } from "vitest";
import { compareNomeCampo } from "../nomeCampo";

describe("compareNomeCampo", () => {
  it("o «The» do início não conta para a ordem", () => {
    const nomes = ["The San Roque Club", "Santo da Serra", "San Roque - New Course", "The Alto Club (Sotogrande)", "Belas"];
    expect([...nomes].sort(compareNomeCampo)).toEqual([
      "The Alto Club (Sotogrande)", "Belas", "San Roque - New Course", "The San Roque Club", "Santo da Serra",
    ]);
  });
});
