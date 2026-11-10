import { describe, it, expect } from "vitest";
import type { Tee } from "../../data/types";
import { teeChoiceKey, isTeeChoiceKey, findTeeByChoice, teeChoiceOptions } from "../teeChoice";

const tee = (teeId: string, sex: "M" | "F" | "U", teeName: string, total: number, cr: number, sl: number): Tee => ({
  teeId, sex, teeName,
  scorecardMeta: { teeColor: "#ffd400" },
  ratings: { holes18: { par: 72, courseRating: cr, slopeRating: sl } },
  holes: [],
  distances: { total, front9: null, back9: null, holesCount: 18, complete18: true },
});

// Praia d'El-Rey: o tee de Homens e o de Senhoras têm o MESMO teeId.
const AMARELAS_M = tee("ncourse-002-1__U__amarelas", "M", "Amarelas", 5800, 70.3, 123);
const AMARELAS_F = tee("ncourse-002-1__U__amarelas", "F", "Amarelas", 5800, 76.1, 131);
const BRANCAS = tee("ncourse-002-1__U__brancas", "M", "Brancas", 6200, 72.5, 128);
const TEES = [BRANCAS, AMARELAS_M, AMARELAS_F];

describe("teeChoice", () => {
  it("a chave distingue Homens e Senhoras com o mesmo teeId", () => {
    expect(teeChoiceKey(AMARELAS_M)).not.toBe(teeChoiceKey(AMARELAS_F));
    expect(isTeeChoiceKey(teeChoiceKey(AMARELAS_F))).toBe(true);
    expect(isTeeChoiceKey("3")).toBe(false);
    expect(isTeeChoiceKey("")).toBe(false);
  });

  it("findTeeByChoice devolve o tee do sexo escolhido", () => {
    expect(findTeeByChoice(TEES, teeChoiceKey(AMARELAS_F))).toBe(AMARELAS_F);
    expect(findTeeByChoice(TEES, teeChoiceKey(AMARELAS_M))).toBe(AMARELAS_M);
  });

  it("um teeId solto só serve quando é de um único tee; chave de outro campo não casa", () => {
    expect(findTeeByChoice(TEES, BRANCAS.teeId)).toBe(BRANCAS);
    expect(findTeeByChoice(TEES, AMARELAS_M.teeId)).toBeUndefined();
    expect(findTeeByChoice(TEES, "outro-campo__U__amarelas|F")).toBeUndefined();
    expect(findTeeByChoice(TEES, "3")).toBeUndefined();
    expect(findTeeByChoice(TEES, null)).toBeUndefined();
  });

  it("teeChoiceOptions: uma opção por sexo, com chaves diferentes e o sexo no texto", () => {
    const opts = teeChoiceOptions(TEES);
    const amarelas = opts.filter((o) => o.label.startsWith("Amarelas"));
    expect(amarelas.map((o) => o.label)).toEqual(["Amarelas · M", "Amarelas · F"]);
    expect(new Set(opts.map((o) => o.key)).size).toBe(opts.length);
    expect(opts.find((o) => o.tee === BRANCAS)?.label).toBe("Brancas");
  });
});
