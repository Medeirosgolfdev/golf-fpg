/**
 * Testes das funções puras do scraper NextCaddy: parsing de datas espanholas
 * (parseSpanishDate) e detecção de provas de jovens (isYouthTournament).
 * Estas alimentam meta.dateStart/dateEnd e o auto-fetch de cartões hbh.
 */
// describe/it/expect são globais (vitest.config.ts → test.globals = true)
const { parseSpanishDate, isYouthTournament } = require("./scrape-nextcaddy.js");

describe("parseSpanishDate", () => {
  it("formato das discovery cards (DD mmm YYYY)", () => {
    expect(parseSpanishDate("21 jun 2026")).toMatchObject({ start: "2026-06-21", end: "2026-06-21" });
    expect(parseSpanishDate("01 ene 2026")).toMatchObject({ start: "2026-01-01", end: "2026-01-01" });
  });

  it("data por extenso dentro do nome do torneio", () => {
    expect(parseSpanishDate("Torneo Infantil Fin de Curso Pitch&Putt - Domingo 21 Junio 2026"))
      .toMatchObject({ start: "2026-06-21", end: "2026-06-21" });
    expect(parseSpanishDate("21 de junio de 2026")).toMatchObject({ start: "2026-06-21" });
  });

  it("ranges → dateStart < dateEnd", () => {
    expect(parseSpanishDate("21-22 Junio 2026")).toMatchObject({ start: "2026-06-21", end: "2026-06-22" });
    expect(parseSpanishDate("del 21 al 23 de junio 2026")).toMatchObject({ start: "2026-06-21", end: "2026-06-23" });
    expect(parseSpanishDate("Sábado 20 y Domingo 21 de Junio 2026")).toMatchObject({ start: "2026-06-20", end: "2026-06-21" });
  });

  it("não inventa datas — sem mês reconhecível devolve null", () => {
    expect(parseSpanishDate("LOS GALLOS 21-06")).toBeNull();
    expect(parseSpanishDate("Gran Premio sin fecha")).toBeNull();
    expect(parseSpanishDate("")).toBeNull();
    expect(parseSpanishDate(null)).toBeNull();
  });

  it("não confunde prefixos de palavras com meses (mayor ≠ mayo)", () => {
    // "MAYOR" começa por "may" mas só aceitamos match EXACTO do token de mês
    expect(parseSpanishDate("XXXVI CAMPEONATO JUVENIL DE CyL 2025 (HCP MAYOR DE 36,0)")).toBeNull();
  });
});

describe("isYouthTournament", () => {
  it("apanha escalões de jovens pelo nome", () => {
    expect(isYouthTournament({ name: "Torneo Infantil Fin de Curso Pitch&Putt" })).toBe(true);
    expect(isYouthTournament({ name: "Campeonato Alevín de Andalucía" })).toBe(true);
    expect(isYouthTournament({ name: "Liga Benjamín y Alevín de CyL" })).toBe(true);
    expect(isYouthTournament({ name: "Campeonato Sub-16 Masculino" })).toBe(true);
  });

  it("não marca provas de adultos", () => {
    expect(isYouthTournament({ name: "Gran Premio Caballeros Scratch" })).toBe(false);
    expect(isYouthTournament({ name: "Memorial Senior de Sevilla" })).toBe(false);
  });

  it("também olha para as categorias", () => {
    expect(isYouthTournament({ name: "Torneo de Clausura", categories: ["Infantil", "Caballeros"] })).toBe(true);
  });
});
