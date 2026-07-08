/**
 * Testes das heurísticas do detector de duplicados de juniores.
 */
import { describe, it, expect } from "vitest";
import {
  nameRelation,
  bestNameRelation,
  evaluatePair,
  buildSuppressionSets,
  isSuppressed,
  normClub,
  licSuffix,
  rfegSuffixMatch,
  markAmbiguous,
  autoMergeEligible,
} from "./find-junior-duplicates.js";

describe("nameRelation", () => {
  it("nome exacto", () => {
    const r = nameRelation("dmitrii elchaninov", "dmitrii elchaninov");
    expect(r?.rel).toBe("nome exacto");
    expect(r?.pts).toBe(55);
  });

  it("nome invertido (Guo Ziyang ↔ Ziyang Guo)", () => {
    const r = nameRelation("ziyang guo", "guo ziyang");
    expect(r?.rel).toBe("nome invertido");
  });

  it("subset — middle name omitido (Manuel Medeiros ⊂ Manuel Goulartt Medeiros)", () => {
    const r = nameRelation("manuel medeiros", "manuel goulartt medeiros");
    expect(r?.rel).toBe("nome contido no outro");
    expect(r?.pts).toBe(45);
  });

  it("inicial + último nome (J. Smith ↔ John Smith)", () => {
    // normName transformaria "J. Smith" em "j smith"
    const r = nameRelation("j smith", "john smith");
    expect(r?.rel).toBe("inicial + último nome");
  });

  it("primeiro abreviado + último nome (Alex ↔ Alexander)", () => {
    const r = nameRelation("alex silva", "alexander silva");
    expect(r?.rel).toBe("primeiro abreviado + último nome");
  });

  it("apenas 1 dos sobrenomes (Tomás Silva ↔ Tomás Silva Costa é subset; caso não-subset partilha sobrenome)", () => {
    const r = nameRelation("tomas abreu silva", "tomas silva costa");
    expect(r?.rel).toBe("primeiro nome + sobrenome parcial");
  });

  it("primeiro+último iguais com middle diferente", () => {
    const r = nameRelation("joao pedro santos", "joao miguel santos");
    expect(r?.rel).toBe("primeiro+último nome");
  });

  it("nomes sem relação → null", () => {
    expect(nameRelation("joao santos", "pedro oliveira")).toBeNull();
  });

  it("apelidos iguais mas primeiro nome diferente → null (irmãos)", () => {
    expect(nameRelation("joao santos", "maria santos")).toBeNull();
  });

  it("nomes de token único não relacionam", () => {
    expect(nameRelation("joao", "joao santos")).toBeNull();
  });
});

describe("bestNameRelation", () => {
  it("escolhe a melhor relação entre variantes (aliases)", () => {
    const r = bestNameRelation(
      ["manuel medeiros", "manuel francisco medeiros"],
      ["manuel goulartt medeiros"],
    );
    expect(r?.rel).toBe("nome contido no outro");
  });
});

function mkEnt(over = {}) {
  return {
    id: over.id || "x1",
    nameVariants: over.nameVariants || ["manuel medeiros"],
    dob: over.dob ?? null,
    sex: over.sex ?? null,
    country: over.country ?? null,
    club: over.club ?? null,
    strong: over.strong || new Map(),
    rfegLics: over.rfegLics || [],
    keys: over.keys || [],
  };
}

describe("evaluatePair", () => {
  it("sexo contraditório mata o par", () => {
    const A = mkEnt({ sex: "M" });
    const B = mkEnt({ sex: "F" });
    expect(evaluatePair(A, B)).toBeNull();
  });

  it("DOB exacta diferente mata o par", () => {
    const A = mkEnt({ dob: "2014-04-29" });
    const B = mkEnt({ dob: "2014-05-13" });
    expect(evaluatePair(A, B)).toBeNull();
  });

  it("mesma DOB + mesmo nome = score alto (país diferente não penaliza com DOB igual)", () => {
    const A = mkEnt({ dob: "2014-04-29", country: "PT" });
    const B = mkEnt({ dob: "2014-04-29", country: "FR" });
    const r = evaluatePair(A, B);
    expect(r).not.toBeNull();
    // 55 (exacto) + 35 (dob) — sem penalização de país porque a DOB é igual
    expect(r.score).toBe(90);
    expect(r.evidence.some((e) => e.includes("multi-país"))).toBe(true);
  });

  it("chaves fortes conflituantes na mesma fonte penalizam e flagam", () => {
    const A = mkEnt({ strong: new Map([["fpg", "111"]]) });
    const B = mkEnt({ strong: new Map([["fpg", "222"]]) });
    const r = evaluatePair(A, B);
    expect(r).not.toBeNull();
    expect(r.flags.some((f) => f.includes("fpg"))).toBe(true);
    expect(r.score).toBe(55 - 25);
  });

  it("co-ocorrência no mesmo flight descarta o par", () => {
    const A = mkEnt({ id: "a" });
    const B = mkEnt({ id: "b" });
    const ctx = {
      flightsByJunior: new Map([
        ["a", new Set(["t1|f1"])],
        ["b", new Set(["t1|f1"])],
      ]),
      tournsByJunior: new Map([
        ["a", new Set(["t1"])],
        ["b", new Set(["t1"])],
      ]),
      includeCoplay: false,
    };
    expect(evaluatePair(A, B, ctx)).toBeNull();
  });

  it("mesmo torneio em flights diferentes penaliza mas reporta", () => {
    const A = mkEnt({ id: "a", dob: "2014-04-29" });
    const B = mkEnt({ id: "b", dob: "2014-04-29" });
    const ctx = {
      flightsByJunior: new Map([
        ["a", new Set(["t1|f1"])],
        ["b", new Set(["t1|f2"])],
      ]),
      tournsByJunior: new Map([
        ["a", new Set(["t1"])],
        ["b", new Set(["t1"])],
      ]),
      includeCoplay: false,
    };
    const r = evaluatePair(A, B, ctx);
    expect(r).not.toBeNull();
    expect(r.flags.some((f) => f.includes("mesmo torneio"))).toBe(true);
  });

  it("mesmo clube dá boost", () => {
    const A = mkEnt({ club: "CG Santo da Serra" });
    const B = mkEnt({ club: "cg santo da serra" });
    const r = evaluatePair(A, B);
    expect(r.evidence).toContain("mesmo clube");
  });
});

describe("supressão via overrides", () => {
  it("par em notDuplicates é suprimido", () => {
    const sets = buildSuppressionSets({
      notDuplicates: [{ sourceKeys: ["uskids:111", "fpg:222"], reason: "irmãos" }],
    });
    expect(isSuppressed(["uskids:111"], ["fpg:222"], sets)).toBe(true);
    expect(isSuppressed(["fpg:222"], ["uskids:111"], sets)).toBe(true);
    expect(isSuppressed(["uskids:111"], ["fpg:999"], sets)).toBe(false);
  });

  it("aceita formato array simples", () => {
    const sets = buildSuppressionSets({ notDuplicates: [["a:1", "b:2"]] });
    expect(isSuppressed(["a:1"], ["b:2"], sets)).toBe(true);
  });

  it("par já em forceMerge é suprimido", () => {
    const sets = buildSuppressionSets({
      forceMerge: [{ sourceKeys: ["uskids:630106", "fpg:52884"] }],
    });
    expect(isSuppressed(["uskids:630106"], ["fpg:52884"], sets)).toBe(true);
  });
});

describe("sufixo de licença RFEG", () => {
  it("extrai os últimos 6 dígitos", () => {
    expect(licSuffix("LV60968059")).toBe("968059");
    expect(licSuffix("AM84955303")).toBe("955303");
    expect(licSuffix("1119942416")).toBe("942416");
    expect(licSuffix("abc")).toBeNull();
  });

  it("mudança de clube: sufixo igual = mesmo jogador", () => {
    expect(rfegSuffixMatch(["LV60968059"], ["LV70968059"])).toBe(true);
    expect(rfegSuffixMatch(["AM84955303"], ["AM11955303"])).toBe(true);
    expect(rfegSuffixMatch(["LV60968059"], ["LV60123456"])).toBe(false);
    expect(rfegSuffixMatch([], ["LV70968059"])).toBe(false);
  });

  it("evaluatePair: sufixo RFEG igual dá boost em vez de penalização", () => {
    const A = mkEnt({
      strong: new Map([["rfeg", "LV60968059"]]),
      rfegLics: ["LV60968059"],
      dob: "2013-06-15",
    });
    const B = mkEnt({
      strong: new Map([["rfeg", "LV70968059"]]),
      rfegLics: ["LV70968059"],
      dob: "2013-06-15",
    });
    const r = evaluatePair(A, B);
    expect(r.flags).toHaveLength(0);
    expect(r.rfegSuffix).toBe(true);
    // 55 exacto + 35 dob + 30 sufixo = 120
    expect(r.score).toBe(120);
  });

  it("evaluatePair: sufixo RFEG diferente mantém a penalização", () => {
    const A = mkEnt({ strong: new Map([["rfeg", "LV60968059"]]), rfegLics: ["LV60968059"] });
    const B = mkEnt({ strong: new Map([["rfeg", "LV60123456"]]), rfegLics: ["LV60123456"] });
    const r = evaluatePair(A, B);
    expect(r.flags.some((f) => f.includes("rfeg"))).toBe(true);
    expect(r.rfegSuffix).toBe(false);
  });
});

describe("verificação de escalão/idade", () => {
  it("DOB impossível face aos escalões do outro lado mata o par", () => {
    // A nasceu em 2009; B só jogou flights U12 em 2025 → B nasceu ≥ 2012
    const A = mkEnt({ id: "a", dob: "2009-05-01" });
    const B = mkEnt({ id: "b" });
    const ctx = { birthBound: new Map([["b", { minBY: 2012, why: "Boys 12 2025" }]]) };
    expect(evaluatePair(A, B, ctx)).toBeNull();
  });

  it("jogar para cima é permitido (DOB mais nova que o escalão)", () => {
    // A nasceu em 2014 e o outro lado jogou U14 → compatível (joga para cima)
    const A = mkEnt({ id: "a", dob: "2014-04-29" });
    const B = mkEnt({ id: "b" });
    const ctx = { birthBound: new Map([["b", { minBY: 2011, why: "Sub 14 2026" }]]) };
    const r = evaluatePair(A, B, ctx);
    expect(r).not.toBeNull();
    expect(r.evidence).toContain("idade/escalão compatível");
  });

  it("sem DOB em nenhum lado, não há verificação (lower bounds não colidem)", () => {
    const A = mkEnt({ id: "a" });
    const B = mkEnt({ id: "b" });
    const ctx = { birthBound: new Map([["a", { minBY: 2014 }], ["b", { minBY: 2006 }]]) };
    const r = evaluatePair(A, B, ctx);
    expect(r).not.toBeNull();
    expect(r.evidence).not.toContain("idade/escalão compatível");
  });
});

describe("países diferentes com mesma DOB não penalizam", () => {
  it("subset + mesma DOB + países diferentes = certeza (regra 2026-07-08)", () => {
    const A = mkEnt({ nameVariants: ["camila pazos"], dob: "2011-09-02", country: "PT" });
    const B = mkEnt({ nameVariants: ["camila pazos de almeida"], dob: "2011-09-02", country: "ES" });
    const r = evaluatePair(A, B);
    // 45 subset + 35 dob, SEM −5 de país (dob igual explica o multi-país)
    expect(r.score).toBe(80);
    expect(r.dobEqual).toBe(true);
    expect(autoMergeEligible(r)).toBe(true);
  });
});

describe("markAmbiguous + autoMergeEligible", () => {
  const mkCand = (aId, bId, over = {}) => ({
    A: { id: aId, canonicalName: aId },
    B: { id: bId, canonicalName: bId },
    relPts: 45, score: 55, flags: [], evidence: [],
    dobEqual: false, countryEqual: true, clubEqual: false, rfegSuffix: false,
    ...over,
  });

  it("junior em vários pares fica ambíguo (caso Pablo Garcia)", () => {
    const cands = [
      mkCand("pablo albaladejo garcia", "pablo garcia"),
      mkCand("pablo valderrama garcia", "pablo garcia"),
      mkCand("pablo garcia ferrer", "pablo garcia"),
      mkCand("victor deschaumes", "victor goguyer deschaumes"),
    ];
    markAmbiguous(cands);
    expect(cands[0].ambiguous).toBe(true);
    expect(cands[1].ambiguous).toBe(true);
    expect(cands[2].ambiguous).toBe(true);
    expect(cands[3].ambiguous).toBeUndefined();
  });

  it("ambíguo COM certeza (DOB/sufixo) É elegível — cluster tipo Graciliano", () => {
    const c = mkCand("a", "b", { ambiguous: true, flags: ["⚠ ambíguo — a em 2 pares"], dobEqual: true });
    expect(autoMergeEligible(c)).toBe(true);
  });

  it("ambíguo SEM certeza nunca é elegível (caso Pablo Garcia)", () => {
    const c = mkCand("a", "b", { ambiguous: true, flags: ["⚠ ambíguo — b em 3 pares"], countryEqual: true, score: 70 });
    expect(autoMergeEligible(c)).toBe(false);
  });

  it("mesma DOB ou sufixo RFEG = elegível mesmo com score baixo", () => {
    expect(autoMergeEligible(mkCand("a", "b", { dobEqual: true, score: 50, countryEqual: false }))).toBe(true);
    expect(autoMergeEligible(mkCand("a", "b", { rfegSuffix: true, score: 50, countryEqual: false }))).toBe(true);
  });

  it("sem certeza exige corroboração (clube/país) e score ≥ mergeMin", () => {
    expect(autoMergeEligible(mkCand("a", "b", { score: 55, countryEqual: true }))).toBe(true);
    expect(autoMergeEligible(mkCand("a", "b", { score: 55, countryEqual: false }))).toBe(false);
    expect(autoMergeEligible(mkCand("a", "b", { score: 54, countryEqual: true }))).toBe(false);
  });

  it("relação de nome fraca (pts < 45) nunca auto-funde", () => {
    expect(autoMergeEligible(mkCand("a", "b", { relPts: 40, dobEqual: true }))).toBe(false);
  });

  it("flags de aviso (não-ambiguidade) bloqueiam o auto-merge mesmo com certeza", () => {
    expect(autoMergeEligible(mkCand("a", "b", { flags: ["⚠ mesmo torneio"], dobEqual: true }))).toBe(false);
  });
});

describe("normClub", () => {
  it("normaliza diacríticos e pontuação", () => {
    expect(normClub("C.G. Santo da Serra")).toBe("c g santo da serra");
    expect(normClub("LA CAÑADA")).toBe("la canada");
  });
});
