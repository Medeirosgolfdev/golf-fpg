import { describe, it, expect } from "vitest";
import { previsaoRival, fraseConfrontos, escalaoDaProva, escalaPorComparacoes } from "../scoutModel";
import type { ScoutTorneioRaw, ScoutComManuel } from "../scoutModel";

// Scout (04/11/2026): previsão de cada rival em relação ao Manuel.
describe("previsaoRival", () => {
  const manuel = { toParAno: 9.7, hcp: 6.4 };

  it("confrontos primeiro: o ±par do Manuel mais as pancadas por volta", () => {
    expect(previsaoRival({ vsMMedia: -8.6, nConfrontos: 3, toParAno: -0.1, hcp: 0.3 }, manuel))
      .toEqual({ toPar: 1.1, vsManuel: -8.6, fonte: "confrontos" });
  });

  it("sem confrontos: a média ao par do último ano", () => {
    expect(previsaoRival({ vsMMedia: null, nConfrontos: 0, toParAno: 0.9, hcp: null }, manuel))
      .toEqual({ toPar: 0.9, vsManuel: -8.8, fonte: "media" });
  });

  it("só com handicap: a diferença de handicap", () => {
    expect(previsaoRival({ vsMMedia: null, nConfrontos: 0, toParAno: null, hcp: 4.4 }, manuel))
      .toEqual({ toPar: 7.7, vsManuel: -2, fonte: "hcp" });
  });

  it("sem nada, null", () => {
    expect(previsaoRival({ vsMMedia: null, nConfrontos: 0, toParAno: null, hcp: null }, manuel)).toBeNull();
  });
});

describe("fraseConfrontos", () => {
  it("quem ganhou mais vezes e por quanto", () => {
    expect(fraseConfrontos(0, 7, 7, -10.8)).toBe("Ganhou 7 de 7 · 10.8 por volta à frente");
    expect(fraseConfrontos(3, 1, 4, 2.1)).toBe("O Manuel ganhou 3 de 4 · 2.1 por volta atrás");
    expect(fraseConfrontos(0, 0, 0, null)).toBe("");
  });
});

describe("escalaoDaProva", () => {
  it("o escalão USKids dá a idade", () => {
    expect(escalaoDaProva("Boys 12")).toBe("Sub 12");
    expect(escalaoDaProva("Girls 13-14")).toBe("Sub 14");
    expect(escalaoDaProva("Sub 14")).toBeNull();
  });
});

// A escala por comparações (04/11/2026): o caso Dmitrii × Antonio.
describe("escalaPorComparacoes", () => {
  const wc: ScoutTorneioRaw = ["2026-07-30", 1, 3, 159, 3, 208, -8, 54, null];
  const wcK: ScoutTorneioRaw = ["2026-07-30", 1, 61, 159, 3, 224, 8, 54, null];
  const local: ScoutTorneioRaw = ["2026-02-07", 2, 1, 4, 1, 65, -7, 18, null];
  const mD: ScoutComManuel[] = [["2026-08-13", "Venice Open 2026", 2, 9, -24, 3, 18]];
  it("quem perde para alguém que ganha ao Manuel fica atrás desse alguém", () => {
    const esc = escalaPorComparacoes([
      { key: "M", isManuel: true },
      { key: "D", isManuel: false, m: mD, u: [wc] },
      { key: "K", isManuel: false, u: [wcK, local] },
    ], "2025-01-01");
    const d = esc.get("D")!.vsManuel, k = esc.get("K")!.vsManuel;
    expect(d).toBeCloseTo(-8, 1);
    expect(k).toBeGreaterThan(d);            // o Antonio atrás do Dmitrii
    expect(k).toBeCloseTo(-8 + 16 / 3, 1);   // 224 − 208 em 3 voltas
  });
  it("sem provas em comum com ninguém, fica de fora", () => {
    const esc = escalaPorComparacoes([{ key: "M", isManuel: true }, { key: "X", isManuel: false, u: [local] }], "2025-01-01");
    expect(esc.has("X")).toBe(false);
  });
});
