import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { spliceDrawTcode } = createRequire(import.meta.url)("./draw-splice.js");

/** Um ficheiro de draws com a formatação real: jogadores numa linha só. */
const FICHEIRO = [
  '{',
  '  "total": 2,',
  '  "tournaments": [',
  '    {',
  '      "ccode": "192",',
  '      "tcode": "10013",',
  '      "name": "PJA Torre 2025",',
  '      "drawOnly": false,',
  '      "draws": {',
  '        "1": { "groups": [ { "teeTime": "08:00", "players": [',
  '          { "nome": "Manuel Sousa", "clube": null, "fed": null, "hcp": 12.3 }',
  '        ] } ] }',
  '      }',
  '    },',
  '    {',
  '      "ccode": "192",',
  '      "tcode": "90101",',
  '      "name": "PJA Torre 2026",',
  '      "drawOnly": true,',
  '      "draws": {',
  '        "1": { "groups": [ { "teeTime": "11:00", "players": [',
  '          { "nome": "João Rocha", "clube": null, "fed": null, "hcp": 4.1 }',
  '        ] } ] }',
  '      }',
  '    }',
  '  ]',
  '}',
].join("\r\n");

describe("spliceDrawTcode", () => {
  it("muda só o tcode e o drawOnly, sem tocar em mais nada", () => {
    const out = spliceDrawTcode(FICHEIRO, "192", "90101", "10024");
    const linhasMudadas = out.split("\r\n").filter((l, i) => l !== FICHEIRO.split("\r\n")[i]);
    expect(linhasMudadas).toEqual(['      "tcode": "10024",', '      "drawOnly": false,']);
  });

  it("preserva o CRLF (a re-serialização perdia-o)", () => {
    const out = spliceDrawTcode(FICHEIRO, "192", "90101", "10024");
    expect(out.match(/\r\n/g).length).toBe(FICHEIRO.match(/\r\n/g).length);
    expect(/(?<!\r)\n/.test(out)).toBe(false);
  });

  it("o resultado é o JSON que se queria", () => {
    const esperado = JSON.parse(FICHEIRO);
    const alvo = esperado.tournaments.find((t) => t.tcode === "90101");
    alvo.tcode = "10024"; alvo.drawOnly = false;
    expect(JSON.parse(spliceDrawTcode(FICHEIRO, "192", "90101", "10024"))).toEqual(esperado);
  });

  it("recusa quando o clube não bate — a FPG reutiliza tcodes entre clubes", () => {
    expect(spliceDrawTcode(FICHEIRO, "007", "90101", "10024")).toBeNull();
  });

  it("recusa quando o placeholder não existe ou aparece duas vezes", () => {
    expect(spliceDrawTcode(FICHEIRO, "192", "90999", "10024")).toBeNull();
    const duplicado = FICHEIRO.replace('"tcode": "10013"', '"tcode": "90101"');
    expect(spliceDrawTcode(duplicado, "192", "90101", "10024")).toBeNull();
  });

  it("chavetas dentro de strings não desalinham a contagem", () => {
    const comChaveta = FICHEIRO.replace("PJA Torre 2026", "PJA Torre {2026}");
    const out = spliceDrawTcode(comChaveta, "192", "90101", "10024");
    expect(JSON.parse(out).tournaments[1].name).toBe("PJA Torre {2026}");
    expect(JSON.parse(out).tournaments[1].tcode).toBe("10024");
  });

  it("funciona no ficheiro REAL do PJA (já promovido: o inverso)", () => {
    // O 192/10024 do repo veio deste splice — refaz-se ao contrário e tem de
    // voltar ao mesmo texto, o que prova que a operação não deixa resíduos.
    const raw = fs.readFileSync(path.join(REPO, "public/data/pja-draws-manual.json"), "utf8");
    expect(raw).toContain('"tcode": "10024"');
    const voltaAtras = spliceDrawTcode(raw.replace('"drawOnly": false,\r\n      "draws"', '"drawOnly": true,\r\n      "draws"'), "192", "10024", "10024");
    expect(voltaAtras).not.toBeNull();
    expect(JSON.parse(voltaAtras).tournaments.find((t) => t.tcode === "10024").drawOnly).toBe(false);
  });
});
