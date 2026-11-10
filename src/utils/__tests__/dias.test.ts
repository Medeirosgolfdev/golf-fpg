import { describe, it, expect } from "vitest";
import { addDaysIso, diaIso, diasEntre } from "../dias";

describe("dias — contas com dias do calendário", () => {
  it("lê as datas dos torneios (ISO ou DD/MM/AAAA)", () => {
    expect(diaIso("2026-09-12")).toBe("2026-09-12");
    expect(diaIso("2026-09-12T10:30:00")).toBe("2026-09-12");
    expect(diaIso("7/11/2026")).toBe("2026-11-07");
    expect(diaIso("")).toBeNull();
    expect(diaIso("Setembro")).toBeNull();
  });
  it("soma dias e passa o mês e o ano", () => {
    expect(addDaysIso("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("a mudança da hora não come um dia", () => {
    expect(addDaysIso("2026-10-24", 2)).toBe("2026-10-26");
    expect(diasEntre("2026-10-24", "2026-10-26")).toBe(2);
  });
  it("dias entre duas datas, com sinal", () => {
    expect(diasEntre("2026-09-12", "2026-11-10")).toBe(59);
    expect(diasEntre("2026-11-10", "2026-09-12")).toBe(-59);
    expect(diasEntre("2026-09-12T08:00:00", "2026-09-12")).toBe(0);
  });
  it("data ilegível não dá número", () => {
    expect(diasEntre("12/09/2026", "2026-11-10")).toBeNull();
    expect(diasEntre(null, "2026-11-10")).toBeNull();
    expect(addDaysIso("sem data", 1)).toBe("sem data");
  });
});
