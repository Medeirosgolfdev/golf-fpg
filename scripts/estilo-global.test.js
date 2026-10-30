import { describe, it, expect } from "vitest";
import fs from "fs";
import estilo from "./lib/estilo-global.js";

/**
 * Trava do aspecto global (30/10/2026): nenhum .tsx pode ganhar estilos à mão,
 * cores hex, letra/cantos em número ou tabelas sem classe global — usa-se o que
 * está em App.css / tokens.css e nas peças de src/ui. Ficheiro novo começa em
 * zero. Depois de arrumar, `node scripts/estilo-global-baseline.js` aperta a trava.
 */
const { contar, BASELINE } = estilo;

describe("aspecto global", () => {
  it("nenhum ficheiro tem mais estilos à mão do que no baseline", () => {
    const base = JSON.parse(fs.readFileSync(BASELINE, "utf8")).ficheiros;
    const subiram = [];
    for (const [f, linha] of Object.entries(contar())) {
      for (const [k, n] of Object.entries(linha)) {
        const max = base[f]?.[k] ?? 0;
        if (n > max) subiram.push(`${f} — ${k}: ${n} (máximo ${max})`);
      }
    }
    expect(subiram).toEqual([]);
  });
});
