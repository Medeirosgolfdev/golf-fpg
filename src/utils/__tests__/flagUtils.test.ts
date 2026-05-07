import { describe, it, expect } from "vitest";
import { flag, normPaisDisplay } from "../flagUtils";

describe("flag — bandeira para nomes canónicos", () => {
  it("apanha bandeiras para nomes EN canónicos do CODE_TO_DISPLAY", () => {
    expect(flag("Tunisia")).not.toBe("🏳️");
    expect(flag("Czechia")).not.toBe("🏳️");
    expect(flag("DR Congo")).not.toBe("🏳️");
    expect(flag("Bermuda")).not.toBe("🏳️");
    expect(flag("Bosnia & Herzegovina")).not.toBe("🏳️");
    expect(flag("Cayman Islands")).not.toBe("🏳️");
    expect(flag("Cabo Verde")).not.toBe("🏳️");
    expect(flag("Saudi Arabia")).not.toBe("🏳️");
    expect(flag("Trinidad & Tobago")).not.toBe("🏳️");
    expect(flag("Dominican Rep.")).not.toBe("🏳️");
    expect(flag("UAE")).not.toBe("🏳️");
    expect(flag("Mozambique")).not.toBe("🏳️");
    expect(flag("Eswatini")).not.toBe("🏳️");
    expect(flag("Belarus")).not.toBe("🏳️");
    expect(flag("Réunion")).not.toBe("🏳️");
  });

  it("apanha bandeiras para nomes EN básicos", () => {
    expect(flag("Portugal")).toBe("🇵🇹");
    expect(flag("Russia")).toBe("🇷🇺");
    expect(flag("Vietnam")).toBe("🇻🇳");
    expect(flag("France")).toBe("🇫🇷");
    expect(flag("United Kingdom")).toBe("🇬🇧");
    expect(flag("Estonia")).toBe("🇪🇪");
  });

  it("apanha bandeiras para variantes/aliases", () => {
    expect(flag("Russian Federation")).toBe("🇷🇺");
    expect(flag("Viet Nam")).toBe("🇻🇳");
    expect(flag("Federação Russa")).toBe("🇷🇺");
    expect(flag("Franca")).toBe("🇫🇷");
    expect(flag("França")).toBe("🇫🇷");
    expect(flag("Estônia")).toBe("🇪🇪");
  });

  it("normPaisDisplay normaliza variantes para o nome canónico", () => {
    // Nomes que JÁ são canónicos
    expect(normPaisDisplay("Russia")).toBe("Russia");
    expect(normPaisDisplay("Vietnam")).toBe("Vietnam");
    expect(normPaisDisplay("Tunisia")).toBe("Tunisia");
    expect(normPaisDisplay("Cayman Islands")).toBe("Cayman Islands");
    // Nomes alternativos: "Czechia" e "Czech Republic" devem normalizar igual
    expect(normPaisDisplay("Czechia")).toBe(normPaisDisplay("Czech Republic"));
    expect(normPaisDisplay("Czech Republic")).toBe("Czech Republic");
  });

  it("normPaisDisplay devolve '' para placeholders FPG (NN/XX/@1-@4)", () => {
    expect(normPaisDisplay("NN")).toBe("");
    expect(normPaisDisplay("XX")).toBe("");
    expect(normPaisDisplay("nn")).toBe("");
    expect(normPaisDisplay("xx")).toBe("");
    expect(normPaisDisplay("@1")).toBe("");
    expect(normPaisDisplay("@2")).toBe("");
    expect(normPaisDisplay("?")).toBe("");
    expect(normPaisDisplay("-")).toBe("");
  });
});
