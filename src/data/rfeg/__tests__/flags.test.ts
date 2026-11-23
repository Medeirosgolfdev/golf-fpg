import { describe, it, expect } from "vitest";
import { rfegPlayerFlag } from "../flags";

describe("rfegPlayerFlag — portugueses com licença espanhola (23/11/2026)", () => {
  it("a lista única de portugueses por nome vale em Espanha, nas duas ordens do nome", () => {
    expect(rfegPlayerFlag("RIBEIRO CRISOSTOMO, SABRINA", "ESPAÑA")).toBe("PT");
    expect(rfegPlayerFlag("Sabrina Ribeiro Crisóstomo", null)).toBe("PT");
  });
  it("os overrides curados continuam primeiro e os espanhóis sem bandeira", () => {
    expect(rfegPlayerFlag("ELCHANINOV, DMITRII", "ESPAÑA")).toBe("RU");
    expect(rfegPlayerFlag("Ana Iturmendi Simon", "ESPAÑA")).toBeUndefined();
    expect(rfegPlayerFlag("Fulano", "PORTUGAL")).toBe("PT");
  });
});
