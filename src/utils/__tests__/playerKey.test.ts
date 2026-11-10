import { describe, it, expect } from "vitest";
import { fedFpg, indexPlayers, isFedFpg, playerKey } from "../playerKey";

describe("isFedFpg / fedFpg — o federado FPG não se confunde com licenças de fora", () => {
  it("só dígitos, até 6", () => {
    expect(isFedFpg("52884")).toBe(true);
    expect(isFedFpg(" 4939 ")).toBe(true);
    expect(isFedFpg(52884)).toBe(true);
  });
  it("licença espanhola, licença FFG, chave virtual e vazio não são", () => {
    expect(isFedFpg("CMA8989869")).toBe(false);
    expect(isFedFpg("529638232")).toBe(false);
    expect(isFedFpg("kids:joao_iglesias")).toBe(false);
    expect(isFedFpg("")).toBe(false);
    expect(isFedFpg(null)).toBe(false);
    expect(fedFpg("CMA8989869")).toBeNull();
    expect(fedFpg(" 42068 ")).toBe("42068");
  });
});

describe("playerKey — federado, senão nome", () => {
  it("dois homónimos com federados diferentes têm chaves diferentes", () => {
    expect(playerKey("4939", "Pedro Aires")).not.toBe(playerKey("42068", "Pedro Aires"));
  });
  it("sem federado, «Apelido, Nome» e «Nome Apelido» dão a mesma chave", () => {
    expect(playerKey(null, "SILVA, João")).toBe(playerKey("", "João Silva"));
  });
  it("sem nada, vazia", () => {
    expect(playerKey(null, "")).toBe("");
  });
});

describe("indexPlayers — procurar sem trocar homónimos", () => {
  const lista = [
    { fed: "4939", name: "Pedro Aires", hcp: 5 },
    { fed: "42068", name: "AIRES, Pedro", hcp: 30 },
    { fed: null, name: "Rui Costa", hcp: 12 },
    { fed: "CMA8989869", name: "João Iglésias", hcp: 3 },
  ];
  const idx = indexPlayers(lista, (x) => x.fed, (x) => x.name);

  it("pelo federado, cada homónimo fica com o seu registo", () => {
    expect(idx.get("4939", "Pedro Aires")?.hcp).toBe(5);
    expect(idx.get("42068", "Pedro Aires")?.hcp).toBe(30);
  });
  it("um terceiro homónimo (outro federado FPG) não herda nenhum", () => {
    expect(idx.get("11111", "Pedro Aires")).toBeUndefined();
  });
  it("só pelo nome, não adivinha entre dois federados", () => {
    expect(idx.get(null, "Pedro Aires")).toBeUndefined();
  });
  it("sem federado de um dos lados, casa pelo nome", () => {
    expect(idx.get("50000", "Rui Costa")?.hcp).toBe(12);
    expect(idx.get(null, "Costa, Rui")?.hcp).toBe(12);
  });
  it("licença de fora não contradiz o federado FPG da mesma pessoa", () => {
    expect(idx.get("51234", "João Iglésias")?.hcp).toBe(3);
  });
});
