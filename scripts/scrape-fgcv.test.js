/**
 * scrape-fgcv.js — inscritos do golfcv.com e a decifra dos PDFs do Mastergolf
 * (fonte sem tabela de caracteres: substituição fixa dentro de cada PDF).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { lerInscritos, resolverDigitos } = require("./scrape-fgcv.js");

describe("FGCV — inscritos (admin-ajax cargar_inscritos)", () => {
  it("licença, nome, nível, sexo e handicap", () => {
    const html = `<table><tr><td>1</td><td>24/08/2026 13:37</td><td>LV06928706</td><td>FUERTES BURDEOS, MARTIN</td><td>C</td><td>M</td><td>40&euro;</td><td>Pagado - On line</td><td>&nbsp;-1.0</td></tr>
      <tr><td>2</td><td>18/08/2026 20:14</td><td>LV05372773</td><td>GAO , JIAYU</td><td>I</td><td>F</td><td>40&euro;</td><td>Pagado</td><td>&nbsp;12.5</td></tr></table>`;
    expect(lerInscritos(html)).toEqual([
      expect.objectContaining({ licencia: "LV06928706", name: "FUERTES BURDEOS, MARTIN", catEdad: "Cadete", sexo: "M", hcp: -1 }),
      expect.objectContaining({ licencia: "LV05372773", name: "GAO , JIAYU", catEdad: "Infantil", sexo: "F", hcp: 12.5 }),
    ]);
  });
});

describe("FGCV — mapa glifo→dígito pelas licenças", () => {
  // Cifra de brincar: 0→a 1→b … 9→j (o PDF real usa glifos arbitrários).
  const cifra = (s) => [...s].map((c) => "abcdefghij"[+c]).join("");
  const licencas = ["LV65939367", "LV06948742", "LV06962654", "LV51947791", "LV01189221"];
  it("resolve o mapa e decifra as licenças", () => {
    const mapa = resolverDigitos(licencas.map((l) => cifra(l.slice(2))), licencas);
    expect(mapa).not.toBeNull();
    const dec = (s) => [...s].map((c) => mapa[c]).join("");
    expect(dec(cifra("65939367"))).toBe("65939367");
    expect(dec("hg")).toBe("76");   // uma volta de 76, na mesma fonte
  });
  it("tolera uma licença que não está nos inscritos, só se lho permitirem", () => {
    const cifradas = [...licencas.slice(0, 4), "LV02054233"].map((l) => cifra(l.slice(2)));
    expect(resolverDigitos(cifradas, licencas.slice(0, 4), 0)).toBeNull();
    expect(resolverDigitos(cifradas, licencas.slice(0, 4), 1)).not.toBeNull();
  });
});
