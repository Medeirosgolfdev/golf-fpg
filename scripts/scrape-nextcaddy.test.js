/**
 * Testes das funções puras do scraper NextCaddy: parsing de datas espanholas
 * (parseSpanishDate) e detecção de provas de jovens (isYouthTournament).
 * Estas alimentam meta.dateStart/dateEnd e o auto-fetch de cartões hbh.
 */
// describe/it/expect são globais (vitest.config.ts → test.globals = true)
const { parseSpanishDate, isYouthTournament, parseScorecard } = require("./scrape-nextcaddy.js");

// Constrói uma tabela HTML a partir de linhas (arrays de células) — replica a
// estrutura real das tarjetas do NextCaddy para testar parseScorecard offline.
function tarjetaHtml(rows) {
  const tr = (cells) => "<tr>" + cells.map((c) => `<td>${c}</td>`).join("") + "</tr>";
  return `<html><body><table>${rows.map(tr).join("")}</table></body></html>`;
}

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

describe("parseScorecard", () => {
  it("9 buracos jogados num template de 18 (Pitch&Putt duplicado) — caso 71639", () => {
    // Estrutura REAL da tarjeta /tarjeta-aux/2344915/-1 (campo de 9 par-3 mostrado
    // como 18: front-9 == back-9; jogador só tem 9 scores + total).
    const html = tarjetaHtml([
      ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "I", "10", "11", "12", "13", "14", "15", "16", "17", "18", "V", "T"],
      ["Metros", "M", "102", "109", "114", "107", "56", "92", "115", "66", "52", "813", "102", "109", "114", "107", "56", "92", "115", "66", "52", "813", "1626"],
      ["Hcp", "7", "5", "1", "3", "15", "13", "17", "11", "9", "-", "8", "6", "2", "4", "16", "14", "18", "12", "10", "-", "-"],
      ["Par", "3", "3", "3", "3", "3", "3", "3", "3", "3", "27", "3", "3", "3", "3", "3", "3", "3", "3", "3", "27", "54"],
      ["", "3", "4", "5", "4", "4", "4", "4", "2", "3", "33"],
      ["Neto", "N", "3", "3", "2", "3", "2", "2", "2", "4", "3", "24"],
    ]);
    const sc = parseScorecard(html);
    expect(sc.par).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3]);
    expect(sc.meters).toEqual([102, 109, 114, 107, 56, 92, 115, 66, 52]);
    expect(sc.si).toEqual([7, 5, 1, 3, 15, 13, 17, 11, 9]);
    expect(sc.nineHole).toBe(true);
    expect(sc.rounds).toHaveLength(1);
    expect(sc.rounds[0].scores).toEqual([3, 4, 5, 4, 4, 4, 4, 2, 3]);
    expect(sc.rounds[0].total).toBe(33);
  });

  it("18 buracos reais (não duplicado) — não trima", () => {
    const html = tarjetaHtml([
      ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "I", "10", "11", "12", "13", "14", "15", "16", "17", "18", "V", "T"],
      ["Par", "4", "4", "3", "4", "5", "4", "3", "4", "4", "35", "4", "3", "4", "4", "5", "4", "3", "4", "5", "36", "71"],
      ["", "5", "4", "3", "4", "6", "4", "3", "5", "4", "38", "4", "4", "5", "4", "5", "4", "3", "4", "5", "38", "76"],
    ]);
    const sc = parseScorecard(html);
    expect(sc.par).toHaveLength(18);
    expect(sc.nineHole).toBe(false);
    expect(sc.rounds[0].scores).toHaveLength(18);
    expect(sc.rounds[0].scores).toEqual([5, 4, 3, 4, 6, 4, 3, 5, 4, 4, 4, 5, 4, 5, 4, 3, 4, 5]);
    expect(sc.rounds[0].total).toBe(76);
  });

  it("9 buracos reais (header de 9 colunas)", () => {
    const html = tarjetaHtml([
      ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "T"],
      ["Par", "4", "4", "3", "4", "5", "4", "3", "4", "4", "35"],
      ["", "5", "4", "3", "4", "5", "4", "3", "4", "4", "36"],
    ]);
    const sc = parseScorecard(html);
    expect(sc.par).toEqual([4, 4, 3, 4, 5, 4, 3, 4, 4]);
    expect(sc.nineHole).toBe(true);
    expect(sc.rounds[0].scores).toEqual([5, 4, 3, 4, 5, 4, 3, 4, 4]);
    expect(sc.rounds[0].total).toBe(36);
  });
});
