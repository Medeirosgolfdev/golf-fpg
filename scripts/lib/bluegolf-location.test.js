import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { splitGradYearCountry } = require("./bluegolf-location.js");

const c = (s) => splitGradYearCountry(s).country;
const h = (s) => splitGradYearCountry(s).hometown;

describe("splitGradYearCountry — formato base", () => {
  it("separa o ano de graduação da localidade", () => {
    expect(splitGradYearCountry("2031, Japan")).toEqual({ gradYear: 2031, country: "Japan", hometown: "Japan" });
  });
  it("mantém o formato simples bjgt/wjgc (só país)", () => {
    expect(splitGradYearCountry("Portugal")).toEqual({ gradYear: null, country: "Portugal", hometown: "Portugal" });
  });
  it("string vazia", () => {
    expect(splitGradYearCountry("")).toEqual({ gradYear: null, country: "", hometown: "" });
  });
});

describe("sigla de estado → EUA/Canadá", () => {
  it("cidade americana", () => {
    expect(splitGradYearCountry("2028, Rancho Santa Fe, CA")).toEqual({
      gradYear: 2028, country: "United States", hometown: "Rancho Santa Fe, CA",
    });
  });
  it("província canadiana", () => expect(c("2031, Richmond, BC")).toBe("Canada"));
  it("sem vírgula antes da sigla", () => expect(c("Burlington WA")).toBe("United States"));
  it("territórios têm bandeira própria", () => {
    expect(c("Tamuning, GU")).toBe("Guam");
    expect(c("Saipan, MP")).toBe("Northern Mariana Islands");
  });
});

describe("cidade estrangeira com sigla de estado dos EUA (lixo do formulário)", () => {
  // O campo é preenchido pelo inscrito: a sigla não torna o miúdo americano.
  it.each([
    ["2032, Bangkok, CA", "Thailand", "Bangkok"],
    ["2032, Hong Kong, FL", "Hong Kong", "Hong Kong"],
    ["2032, Mexico City, NM", "Mexico", "Mexico City"],
    ["2032, Shenzhen, CA", "China", "Shenzhen"],
    ["Auckland, GA", "New Zealand", "Auckland"],
    ["Seoul, CA", "South Korea", "Seoul"],
  ])("%s → %s", (raw, country, hometown) => {
    expect(c(raw)).toBe(country);
    expect(h(raw)).toBe(hometown);
  });
});

describe("cidade sem país", () => {
  it.each([
    ["Auckland", "New Zealand"],
    ["Tokyo", "Japan"],
    ["宇都宮", "Japan"],
    ["Morelia", "Mexico"],
    ["Taipei", "Taiwan"],
    ["Rarotonga", "Cook Islands"],
  ])("%s → %s", (raw, country) => expect(c(raw)).toBe(country));
});

describe("nomes ambíguos ficam com os EUA quando há sigla de estado", () => {
  // Existem London/Melbourne/Panama City/Ontario nos EUA — a sigla manda.
  it.each([
    ["London, KY", "United States"],
    ["Melbourne, FL", "United States"],
    ["Panama City Beach, FL", "United States"],
    ["Ontario, CA", "United States"],
    ["La Canada, CA", "United States"],
  ])("%s → %s", (raw, country) => expect(c(raw)).toBe(country));

  it("mas sem sigla resolvem para o país estrangeiro", () => {
    expect(c("London")).toBe("United Kingdom");
    expect(c("Melbourne")).toBe("Australia");
  });
});

describe("país dentro da própria string", () => {
  it.each([
    ["2032, Bangkok, Thailand, CA", "Thailand"],
    ["New Taipei City, Taiwan (R.O.C.)", "Taiwan"],
    ["Richmond, British Columbia, Canada", "Canada"],
    ["Durban - South Africa", "South Africa"],
    ["Cap Cana Dominican Republic", "Dominican Republic"],
    ["Mandaue, Ph", "Philippines"],
    ["Okinawa Chatan JPN", "Japan"],
  ])("%s → %s", (raw, country) => expect(c(raw)).toBe(country));
});

describe("lixo no fim", () => {
  it("ano repetido depois da província", () => expect(c("Calgary, AB 2027")).toBe("Canada"));
  it("localidade desconhecida fica como está (sem inventar país)", () => {
    expect(c("Bellavista Golf & Country Club")).toBe("Bellavista Golf & Country Club");
  });
});
