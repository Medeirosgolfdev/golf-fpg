import { describe, it, expect } from "vitest";
import { todayIso } from "../format";

/** «Hoje» é o dia em Portugal, não em UTC (auditoria 20/10/2026). */
describe("todayIso", () => {
  it("hora de verão: 23:30 UTC já é o dia seguinte em Lisboa", () => {
    expect(todayIso(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
  });
  it("inverno: Lisboa = UTC", () => {
    expect(todayIso(new Date("2026-01-01T23:30:00Z"))).toBe("2026-01-01");
    expect(todayIso(new Date("2026-01-02T00:10:00Z"))).toBe("2026-01-02");
  });
});
