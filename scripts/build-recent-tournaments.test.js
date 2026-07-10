import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { toIsoDate, cleanTournName } = require("./build-recent-tournaments.js");

describe("build-recent-tournaments helpers", () => {
  describe("toIsoDate", () => {
    it("converte DD-MM-YYYY das voltas WHS para ISO", () => {
      expect(toIsoDate("08-07-2026")).toBe("2026-07-08");
      expect(toIsoDate("31-12-2024")).toBe("2024-12-31");
    });
    it("não mexe em datas já ISO nem em vazios", () => {
      expect(toIsoDate("2026-07-08")).toBe("2026-07-08");
      expect(toIsoDate("")).toBe("");
    });
  });

  describe("cleanTournName", () => {
    it("remove sufixos de dia/ronda (D2, D3, R2, Dia 2)", () => {
      expect(cleanTournName("CAMP. JUVENIL - T.V.P.M. (Escalão A) D3")).toBe("CAMP. JUVENIL - T.V.P.M. (Escalão A)");
      expect(cleanTournName("Taça Kendall R2")).toBe("Taça Kendall");
      expect(cleanTournName("Torneio X - Dia 2")).toBe("Torneio X");
    });
    it("preserva escalão e nomes sem marcador de dia", () => {
      expect(cleanTournName("CAMP. JUVENIL - T.V.P.M. (Escalão A)")).toBe("CAMP. JUVENIL - T.V.P.M. (Escalão A)");
      expect(cleanTournName("108ª Lisbon Cup")).toBe("108ª Lisbon Cup");
    });
  });
});
