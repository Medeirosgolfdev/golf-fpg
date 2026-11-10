import { describe, it, expect } from "vitest";
import { semBandeira, clubeEhPais } from "../clubePais";

describe("clubePais", () => {
  it("tira a bandeira do início", () => {
    expect(semBandeira("🇮🇹 IT")).toBe("IT");
    expect(semBandeira("IT")).toBe("IT");
    expect(semBandeira(null)).toBe("");
  });

  it("código de país (com ou sem bandeira) é país; um clube a sério não", () => {
    expect(clubeEhPais("IT")).toBe(true);
    expect(clubeEhPais("🇮🇹 IT")).toBe(true);
    expect(clubeEhPais("GB-ENG")).toBe(true);
    expect(clubeEhPais("Santo da Serra")).toBe(false);
    expect(clubeEhPais("")).toBe(false);
    expect(clubeEhPais("ZZ")).toBe(false); // sem bandeira conhecida
  });
});
