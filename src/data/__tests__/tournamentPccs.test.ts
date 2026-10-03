import { describe, it, expect } from "vitest";
import { tournamentPccs } from "../fpgUtils";

const jog = (...voltas: Array<{ round: number; gross: number | string; pcc?: number }>) => ({ roundScores: voltas });

describe("tournamentPccs", () => {
  it("devolve só as voltas com PCC diferente de 0", () => {
    const t = { players: [jog({ round: 1, gross: 80, pcc: -1 }, { round: 2, gross: 82 }), jog({ round: 1, gross: 90, pcc: -1 }, { round: 2, gross: 85 })] };
    expect(tournamentPccs(t)).toEqual([{ round: 1, pcc: -1 }]);
  });

  it("PCC 0 (campo ausente) não dá nada", () => {
    expect(tournamentPccs({ players: [jog({ round: 1, gross: 80 })] })).toEqual([]);
  });

  it("fica o valor da maioria dos cartões da volta", () => {
    const t = { players: [jog({ round: 1, gross: 80, pcc: 2 }), jog({ round: 1, gross: 81, pcc: 2 }), jog({ round: 1, gross: 79 })] };
    expect(tournamentPccs(t)).toEqual([{ round: 1, pcc: 2 }]);
  });

  it("ignora cartões por entregar (gross ≥ 900 ou texto)", () => {
    const t = { players: [jog({ round: 1, gross: 999, pcc: 0 }), jog({ round: 1, gross: "WD" }), jog({ round: 1, gross: 84, pcc: 1 })] };
    expect(tournamentPccs(t)).toEqual([{ round: 1, pcc: 1 }]);
  });

  it("sem torneio devolve lista vazia", () => {
    expect(tournamentPccs(null)).toEqual([]);
  });
});
