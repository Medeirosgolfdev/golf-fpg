import { describe, it, expect } from "vitest";
import { voltasGanhas, fraseVoltas, type ScoutComManuel } from "../scoutModel";

describe("confrontos volta a volta (20/11/2026)", () => {
  // Christian Chepishev × Manuel, como no juniors-scout.json.
  const m: ScoutComManuel[] = [
    ["2026-11-20", "Spanish Open 2026", 14, 13, 1, 1, 18, 0, 1],
    ["2026-03-14", "Marco Simone Invitational 2026", 10, null, -4, 2, 18, 1, 1],
    ["2026-02-25", "Daily Mail WJGC 2026 - Boys 10-11", 7, 9, -2, 3, 18, 2, 1],
    ["2025-02-25", "2025 Daily Mail WJGC - Boys 10-11", 28, 26, 5, 3, 18, 1, 2],
  ];
  it("soma as voltas ganhas de cada um", () => {
    expect(voltasGanhas(m)).toEqual({ ele: 4, manuel: 5, empates: 0, voltas: 9 });
    expect(fraseVoltas(voltasGanhas(m), "Christian")).toBe("Manuel 5–4 Christian · 9 voltas");
  });
  it("prova antiga sem a conta por volta: só entra se foi de uma volta", () => {
    expect(voltasGanhas([["2025-01-01", "x", 1, 2, -3, 1, 18], ["2025-01-02", "y", 1, 2, -3, 2, 18]]))
      .toEqual({ ele: 1, manuel: 0, empates: 0, voltas: 1 });
  });
});
