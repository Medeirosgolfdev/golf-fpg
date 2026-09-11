/**
 * Testes para o cálculo de escalão FPG (year-based).
 *
 * Regra FPG (confirmada): o escalão é atribuído no início do ano civil e
 * baseia-se na idade que o jogador FAZ durante esse ano (year − yearOfBirth),
 * não na idade real à data do torneio.
 *
 * Exemplos críticos:
 *   - Joe Short (nascido 2015 ou similar) no Greatgolf U12 de 16/02/2026:
 *     idade exacta = 10, idadeNoAno = 2026−2015 = 11 → Sub 12 (não Sub 10).
 *   - Jogador nascido 2012-12-15 em torneio 2027-01-10:
 *     idade exacta = 12 (ainda não fez 15 em Jan), idadeNoAno = 2027−2012 = 15 → Sub 16.
 *
 * Fronteiras adultas (confirmadas empiricamente sobre `federados.json`,
 * 15.050 records, 100% encaixam):
 *     Sub 21 ............ 19–21
 *     Sub 24 ............ 22–24
 *     Absoluto .......... 25–49   (FPG: "MidAmateur")
 *     Sénior ............ 50–69   (FPG: "Senior")
 *     Super Sénior ...... 70+     (FPG: "SuperSenior")
 */
import { describe, it, expect } from "vitest";
import { escalaoAtDate, ageAtDate, anoEscalao } from "../format";

describe("escalaoAtDate — regra FPG year-based (year − yearOfBirth)", () => {
  describe("casos óbvios year-based", () => {
    it("nascido em 2015, torneio em 2026 (qualquer mês) → Sub 12", () => {
      expect(escalaoAtDate("2015-01-01", "2026-01-01")).toBe("Sub 12");
      expect(escalaoAtDate("2015-06-15", "2026-02-16")).toBe("Sub 12");
      expect(escalaoAtDate("2015-12-31", "2026-12-31")).toBe("Sub 12");
    });

    it("nascido em 2014, torneio em 2026 → Sub 12 (2º ano)", () => {
      expect(escalaoAtDate("2014-04-29", "2026-04-17")).toBe("Sub 12");
      expect(escalaoAtDate("2014-01-15", "2026-10-01")).toBe("Sub 12");
    });

    it("nascido em 2017, torneio em 2026 → Sub 10 (faz 9 em 2026)", () => {
      expect(escalaoAtDate("2017-08-15", "2026-04-01")).toBe("Sub 10");
    });

    it("nascido em 2012, torneio em 2026 → Sub 14 (faz 14 em 2026)", () => {
      expect(escalaoAtDate("2012-12-31", "2026-01-05")).toBe("Sub 14");
    });
  });

  describe("casos onde year-based diverge de idade exacta (o bug que corrigimos)", () => {
    it("Joe Short: nasc 2015-12-15, torneio 2026-02-16 → Sub 12 (NÃO Sub 10)", () => {
      expect(escalaoAtDate("2015-12-15", "2026-02-16")).toBe("Sub 12");
      expect(ageAtDate("2015-12-15", "2026-02-16")).toBe(10);
    });

    it("jogador nasc Dez 2014, torneio Jan 2027 → Sub 14 (NÃO Sub 12)", () => {
      expect(escalaoAtDate("2014-12-15", "2027-01-10")).toBe("Sub 14");
      expect(ageAtDate("2014-12-15", "2027-01-10")).toBe(12);
    });

    it("jogador nasc Nov 2010, torneio Mar 2026 → Sub 16 (NÃO Sub 14)", () => {
      expect(escalaoAtDate("2010-11-20", "2026-03-05")).toBe("Sub 16");
    });
  });

  describe("aceita formatos variados de data", () => {
    it("aceita apenas o ano como string", () => {
      expect(escalaoAtDate("2015-06-15", "2026")).toBe("Sub 12");
    });

    it("aceita número (ano directo)", () => {
      expect(escalaoAtDate("2015-06-15", 2026)).toBe("Sub 12");
    });

    it("aceita datetime ISO completo", () => {
      expect(escalaoAtDate("2015-06-15", "2026-02-16T10:30:00Z")).toBe("Sub 12");
    });
  });

  describe("limites de escalão", () => {
    it("escalões juvenis (Sub 10..Sub 18) — fronteiras por idade-no-ano", () => {
      expect(escalaoAtDate("2016-01-01", "2026-01-01")).toBe("Sub 10");
      expect(escalaoAtDate("2015-01-01", "2026-01-01")).toBe("Sub 12");
      expect(escalaoAtDate("2014-01-01", "2026-01-01")).toBe("Sub 12");
      expect(escalaoAtDate("2013-01-01", "2026-01-01")).toBe("Sub 14");
      expect(escalaoAtDate("2012-01-01", "2026-01-01")).toBe("Sub 14");
      expect(escalaoAtDate("2011-01-01", "2026-01-01")).toBe("Sub 16");
      expect(escalaoAtDate("2010-01-01", "2026-01-01")).toBe("Sub 16");
      expect(escalaoAtDate("2009-01-01", "2026-01-01")).toBe("Sub 18");
      expect(escalaoAtDate("2008-01-01", "2026-01-01")).toBe("Sub 18");
    });

    it("Sub 21 cobre 19-21 anos", () => {
      expect(escalaoAtDate("2007-01-01", "2026-01-01")).toBe("Sub 21");
      expect(escalaoAtDate("2006-01-01", "2026-01-01")).toBe("Sub 21");
      expect(escalaoAtDate("2005-01-01", "2026-01-01")).toBe("Sub 21");
    });

    it("Sub 24 cobre 22-24 anos", () => {
      expect(escalaoAtDate("2004-01-01", "2026-01-01")).toBe("Sub 24");
      expect(escalaoAtDate("2003-01-01", "2026-01-01")).toBe("Sub 24");
      expect(escalaoAtDate("2002-01-01", "2026-01-01")).toBe("Sub 24");
    });

    it("Absoluto cobre 25-49 anos (FPG: MidAmateur)", () => {
      expect(escalaoAtDate("2001-01-01", "2026-01-01")).toBe("Absoluto");
      expect(escalaoAtDate("1990-01-01", "2026-01-01")).toBe("Absoluto");
      expect(escalaoAtDate("1977-01-01", "2026-01-01")).toBe("Absoluto");
    });

    it("Sénior cobre 50-69 anos (FPG: Senior)", () => {
      expect(escalaoAtDate("1976-01-01", "2026-01-01")).toBe("Sénior");
      expect(escalaoAtDate("1965-10-14", "2026-05-08")).toBe("Sénior");
      expect(escalaoAtDate("1957-01-01", "2026-01-01")).toBe("Sénior");
    });

    it("Super Sénior cobre 70+ (FPG: SuperSenior)", () => {
      expect(escalaoAtDate("1956-01-01", "2026-01-01")).toBe("Super Sénior");
      expect(escalaoAtDate("1940-01-01", "2026-01-01")).toBe("Super Sénior");
    });

    it("aceita dob no formato DD/MM/YYYY das fontes ES/FR", () => {
      // Regressão: o `slice(0,4)` lia "19/0" como ano 19 e o Martin Rosende
      // (n. 19/07/2008), com 18 anos, aparecia como "Super Sénior" na /rfeg.
      expect(escalaoAtDate("19/07/2008", "2026-09-02")).toBe("Sub 18");
      expect(escalaoAtDate("01/02/2016", "2026-01-01")).toBe("Sub 10");
      expect(escalaoAtDate("31/12/2014", 2026)).toBe("Sub 12");
    });

    it("fronteiras 24/25, 49/50, 69/70 (regressão do bug que mostrava Sub 24 para todos os adultos)", () => {
      expect(escalaoAtDate("2002-12-31", "2026-01-01")).toBe("Sub 24");
      expect(escalaoAtDate("2001-12-31", "2026-01-01")).toBe("Absoluto");
      expect(escalaoAtDate("1977-12-31", "2026-01-01")).toBe("Absoluto");
      expect(escalaoAtDate("1976-12-31", "2026-01-01")).toBe("Sénior");
      expect(escalaoAtDate("1957-12-31", "2026-01-01")).toBe("Sénior");
      expect(escalaoAtDate("1956-12-31", "2026-01-01")).toBe("Super Sénior");
    });
  });

  describe("inputs inválidos", () => {
    it("retorna null para dob ausente", () => {
      expect(escalaoAtDate(null, "2026-01-01")).toBeNull();
      expect(escalaoAtDate("", "2026-01-01")).toBeNull();
      expect(escalaoAtDate(undefined, "2026-01-01")).toBeNull();
    });

    it("retorna null para data ausente", () => {
      expect(escalaoAtDate("2015-06-15", null)).toBeNull();
      expect(escalaoAtDate("2015-06-15", undefined)).toBeNull();
    });

    it("retorna null para strings não-parseáveis", () => {
      expect(escalaoAtDate("xxxx-01-01", "2026-01-01")).toBeNull();
      expect(escalaoAtDate("2015-06-15", "invalid")).toBeNull();
    });

    it("retorna null se idade calculada é negativa (nascimento posterior ao torneio)", () => {
      expect(escalaoAtDate("2030-01-01", "2026-01-01")).toBeNull();
    });
  });
});

describe("anoEscalao — 1º vs 2º ano do escalão (year-based)", () => {
  it("2026: jogador nasc 2014 em Sub-12 → 2A (faz 12 em 2026)", () => {
    expect(anoEscalao("2014-04-29", "Sub-12", 2026)).toBe("2A");
  });

  it("2026: jogador nasc 2015 em Sub-12 → 1A (faz 11 em 2026)", () => {
    expect(anoEscalao("2015-06-15", "Sub-12", 2026)).toBe("1A");
  });

  it("aceita data em formato YYYY-MM-DD", () => {
    expect(anoEscalao("2014-04-29", "Sub-12", "2026-04-17")).toBe("2A");
  });

  it("aceita escalão com espaço (Sub 12) ou hífen (Sub-12)", () => {
    expect(anoEscalao("2014-01-01", "Sub 12", 2026)).toBe("2A");
    expect(anoEscalao("2014-01-01", "Sub-12", 2026)).toBe("2A");
  });

  it("cai para ano actual se não dado", () => {
    const r = anoEscalao("2014-04-29", "Sub-12");
    expect(r === "1A" || r === "2A").toBe(true);
  });
});
