import { describe, it, expect } from "vitest";
import { federadoPorNome, subNDoNome, clubeCompativel } from "../federadoPorNome";

// Casos reais do manuel-pairings.json (10/11/2026).
const BRITO = [
  { fed: "45394", dob: "2013-05-02" },                                   // o miúdo (inactivo, sem clube)
  { fed: "10591", dob: "1952-10-04", clubNorm: "alto – clube de golfe de portimao alto portimao" },
  { fed: "4359", dob: "1955-06-06", clubNorm: "ass. desp. e cultural da qta do lago assoc. qta.lago" },
];
const PAULINO = [
  { fed: "24036", dob: "1977-01-19", clubNorm: "lisbon sports club lisbon sc" },
  { fed: "49161", dob: "1976-03-26", clubNorm: "clube palheiro golfe palheiro" },
];

describe("federadoPorNome", () => {
  it("nome único → esse federado", () => {
    expect(federadoPorNome([{ fed: "51949" }], { clube: "Quinta do Peru" })?.fed).toBe("51949");
  });

  it("homónimos sem nada que os distinga → sem federado (nunca o primeiro)", () => {
    expect(federadoPorNome(BRITO, { clube: "PXO Clube", torneioNome: "Torneio de Inverno", data: "2023-07-16" })).toBeNull();
    expect(federadoPorNome(PAULINO)).toBeNull();
  });

  it("o clube aponta para um só", () => {
    expect(federadoPorNome(PAULINO, { clube: "Palheiro", torneioNome: "Torneio de Inverno CGSS", data: "2026-01-17" })?.fed).toBe("49161");
  });

  it("o escalão da própria prova exclui os mais velhos", () => {
    const pista = { clube: "PXO Clube", torneioNome: "6º Torn.Drive Challenge Madeira-Sto.da Serra-Sub10", data: "2023-07-16" };
    expect(federadoPorNome(BRITO, pista)?.fed).toBe("45394");
    // Só há adultos com aquele nome: num Sub 10 não é nenhum deles.
    expect(federadoPorNome(BRITO.slice(1), pista)).toBeNull();
    expect(federadoPorNome([BRITO[1]], pista)).toBeNull();
  });

  it("país estrangeiro: não se liga a um federado português pelo nome", () => {
    expect(federadoPorNome([{ fed: "51949" }], { pais: "ESP" })).toBeNull();
    expect(federadoPorNome([{ fed: "51949" }], { pais: "POR" })?.fed).toBe("51949");
  });

  it("subNDoNome e clubeCompativel", () => {
    expect(subNDoNome("Final Regional Drive Challenge Madeira- Sub 10")).toBe(10);
    expect(subNDoNome("Drive Tour Sub-12 e Sub-14")).toBe(14);
    expect(subNDoNome("Torneio CGSS São Martinho")).toBeNull();
    expect(clubeCompativel("Palheiro", "clube palheiro golfe palheiro")).toBe(true);
    expect(clubeCompativel("", "clube palheiro golfe palheiro")).toBe(false);
    // «POR»/«-» na coluna do clube não são clube; e só palavras inteiras.
    expect(clubeCompativel("POR", "oporto golf club porto")).toBe(false);
    expect(clubeCompativel("-", "alto - clube de golfe")).toBe(false);
    expect(clubeCompativel("Sul", "clube da peninsula")).toBe(false);
    expect(clubeCompativel("Santo da Serra", "clube de golf santo da serra cgss")).toBe(true);
    expect(clubeCompativel("Palheiro", undefined)).toBe(false);
  });
});
