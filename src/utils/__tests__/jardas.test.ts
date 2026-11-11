import { describe, it, expect } from "vitest";
import { jardasParaMetros, metrosParaJardas, jardasParaMetrosPorBuraco, METROS_POR_JARDA } from "../jardas";
import { mhEdicoesDoEscalao, mhFamilia, MIN_GROSS_18H, MIN_GROSS_9H, type MHSlim } from "../../data/uskids/memberHistory";

describe("jardas ↔ metros (um só sítio)", () => {
  it("converte e arredonda ao metro", () => {
    expect(METROS_POR_JARDA).toBe(0.9144);
    expect(jardasParaMetros(100)).toBe(91);
    // Villa Padierna (WJGC 2026): os «5295» eram jardas → 4842 m ao total;
    // buraco a buraco dá os 4828 m das «Rojas» (arredonda-se por buraco).
    expect(jardasParaMetros(5295)).toBe(4842);
    expect(metrosParaJardas(4828)).toBe(5280);
    expect(jardasParaMetros(0)).toBe(0);
  });

  it("por buraco: sem distância fica 0", () => {
    expect(jardasParaMetrosPorBuraco([350, 0, null, undefined, 165])).toEqual([320, 0, 0, 0, 151]);
    expect(jardasParaMetrosPorBuraco([])).toEqual([]);
  });
});

describe("mhEdicoesDoEscalao — edições da mesma família de torneio, por escalão", () => {
  const volta = (gross: number, n: number) => ({ gross, strokes: Array.from({ length: 18 }, (_, i) => (i < n ? 4 : 0)) });
  const mh: MHSlim = {
    torneios: {
      t24: { name: "European Championship 2024", startDate: "2024-05-28", holesPerRound: 18, par: Array(18).fill(4),
        byEscalao: { "Boys 8": { par: Array(9).fill(4), yards: Array(9).fill(200) } } },
      t25: { name: "European Championship 2025", startDate: "2025-05-27", holesPerRound: 18, par: Array(18).fill(4) },
      pc: { name: "European Championship Parent/Child 2025", startDate: "2025-05-30", holesPerRound: 18, par: null },
      outro: { name: "Venice Open 2025", startDate: "2025-08-01", holesPerRound: 18, par: null },
      semAno: { name: "European Championship", startDate: "2020-01-01", holesPerRound: 18, par: null },
    },
    jogadores: {
      a: { name: "A", country: "PT", torneios: {
        // 9 buracos a 4 pancadas = 36 (gross igual à soma — é uma volta de 9, não um cartão cortado)
        t24: { ageGroup: "Boys 8", place: 3, rounds: { 1: volta(36, 9) } },
        t25: { ageGroup: "Boys 9", place: 5, rounds: { 1: volta(80, 18) } },
      } },
      b: { name: "B", country: "ES", torneios: { t25: { ageGroup: "Boys 9", place: 1, rounds: { 1: volta(75, 18) } } } },
    },
  };

  it("tira o ano do nome", () => {
    expect(mhFamilia("European Championship 2025")).toBe("European Championship");
    expect(mhFamilia("Venice Open")).toBe("Venice Open");
  });

  it("só a mesma família, com ano, sem Parent/Child; jogadores só do escalão", () => {
    const b9 = mhEdicoesDoEscalao(mh, "European Championship 2026", "Boys 9");
    expect(b9.map((e) => e.tcode).sort()).toEqual(["t24", "t25"]);
    const e25 = b9.find((e) => e.tcode === "t25")!;
    expect(e25.year).toBe("2025");
    expect(e25.jogadores.map(([id]) => id)).toEqual(["a", "b"]);
    expect(e25.hpr).toBe(18);
    expect(e25.minGross).toBe(MIN_GROSS_18H);
    // em 2024 ninguém do Boys 9 jogou
    expect(b9.find((e) => e.tcode === "t24")!.jogadores).toEqual([]);
  });

  it("o escalão que joga 9 buracos numa prova «de 18»: par e mínimo do escalão", () => {
    const [e] = mhEdicoesDoEscalao(mh, "European Championship 2026", "Boys 8").filter((x) => x.tcode === "t24");
    expect(e.hpr).toBe(9);
    expect(e.minGross).toBe(MIN_GROSS_9H);
    expect(e.par).toHaveLength(9);
    expect(e.yards).toHaveLength(9);
    expect(e.jogadores.map(([id]) => id)).toEqual(["a"]);
  });

  it("nome sem família → nada", () => {
    expect(mhEdicoesDoEscalao(mh, "2026", "Boys 9")).toEqual([]);
  });
});
