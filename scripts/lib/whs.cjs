/**
 * scripts/lib/whs.cjs
 *
 * Porta de entrada dos scripts Node para as contas de handicap. Carrega o
 * MESMO ficheiro que o site — src/utils/whsCalc.ts — e não uma cópia: as contas
 * vivem num só sítio (decisão 2026-09-15).
 *
 *   const whs = require("./lib/whs.cjs");          // a partir de scripts/
 *   const whs = require("../scripts/lib/whs.cjs"); // a partir de lib/
 *
 * Precisa de Node ≥ 22.18, que corre TypeScript directamente (os workflows
 * usam Node 24). O whsCalc.ts só pode ter sintaxe que o Node sabe apagar:
 * tipos, interfaces e `type` — nada de `enum` nem `namespace`.
 */
"use strict";

let whs;
try {
  whs = require("../../src/utils/whsCalc.ts");
} catch (e) {
  throw new Error(
    `scripts/lib/whs.cjs: não consegui carregar src/utils/whsCalc.ts com o Node ${process.version} ` +
    `(precisa de Node ≥ 22.18, que corre TypeScript). Erro original: ${e.message}`,
  );
}

module.exports = whs;
