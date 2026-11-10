import { describe, it, expect } from "vitest";
import { signupanytimeUrl, signupAx, SIGNUP_AX_INTL } from "../signupanytime";

describe("signupanytime", () => {
  it("o caminho tem sempre /plugins/links e o ax internacional por omissão", () => {
    expect(signupanytimeUrl(21080)).toBe(
      "https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=21080",
    );
    expect(signupAx("21080")).toBe(SIGNUP_AX_INTL);
  });

  it("El Prat e Marco Simone 2025 têm o seu ax", () => {
    expect(signupanytimeUrl("15573")).toContain("ax=2760&t=15573");
    expect(signupanytimeUrl(18438)).toContain("ax=2739&t=18438");
  });

  it("vista de inscritos e ax explícito", () => {
    expect(signupanytimeUrl(21080, "field")).toContain("v=field&fmt=nohead&ax=1129");
    expect(signupanytimeUrl(21080, "field", 2739)).toContain("ax=2739&t=21080");
  });
});
