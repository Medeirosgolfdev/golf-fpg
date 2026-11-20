import { describe, it, expect } from "vitest";
import { nomeCurtoProva, coberturaMinima } from "../scoutModel";

describe("nomeCurtoProva (badges das provas com o Manuel)", () => {
  it("tira o escalão e põe o ano curto no fim", () => {
    expect(nomeCurtoProva("2025 Daily Mail WJGC - Boys 10-11")).toBe("DM WJGC '25");
    expect(nomeCurtoProva("Daily Mail WJGC 2026 - Boys 10-11")).toBe("DM WJGC '26");
    expect(nomeCurtoProva("Venice Open 2026")).toBe("Venice '26");
    expect(nomeCurtoProva("European Championship 2026")).toBe("EC '26");
  });
  it("corta nomes compridos", () => {
    expect(nomeCurtoProva("QUINTA DO PERU PJA Masters 2026")).toBe("QUINTA DO PERU… '26");
  });
  it("sem ano fica só o nome", () => {
    expect(nomeCurtoProva("Real Club de Golf El Prat")).toBe("El Prat");
  });
});

describe("coberturaMinima", () => {
  it("um terço do field, no mínimo 2", () => {
    expect(coberturaMinima(21)).toBe(7);
    expect(coberturaMinima(3)).toBe(2);
  });
});
