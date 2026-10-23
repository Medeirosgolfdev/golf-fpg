import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TournPName, type PlayersDB } from "../tournamentPrimitives";

// Entradas virtuais `kids:` do juniors-links.json (fpgPlayersDB.ts, 23/10/2026).
const pdb = {
  "54907": { name: "Manuel Medeiros", sex: "M" },
  "kids:manuel_medeiros": { name: "Manuel Medeiros", kidsHash: "630106", kidsId: "u630106", kidsFed: "52884", sex: "M" },
  "kids:joe_short": { name: "Joe Short", kidsHash: "Joe%20Short", kidsId: "u639218", country: "GB", sex: "M" },
} as unknown as PlayersDB;

describe("TournPName — seta ↗ pelas entradas do juniors-links", () => {
  it("vai directa à ficha /kids2/{id}, com a bandeira de quem não é federado", () => {
    const html = renderToStaticMarkup(<TournPName name="Joe Short" playersDB={pdb} />);
    expect(html).toContain('href="/kids2/u639218"');
    expect(html).toContain('aria-label="GB"');
  });
  it("o homónimo com outro federado (o pai do Manuel) não liga à ficha do filho", () => {
    expect(renderToStaticMarkup(<TournPName name="Manuel Medeiros" fed="54907" playersDB={pdb} />)).not.toContain("/kids2");
    expect(renderToStaticMarkup(<TournPName name="Manuel Medeiros" fed="52884" playersDB={pdb} />)).toContain('href="/kids2/u630106"');
  });
});
