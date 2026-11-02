/**
 * scripts/lib/desistentes.cjs
 *
 * Porta de entrada dos scripts Node para a regra dos desinscritos: carrega o
 * MESMO ficheiro que o site — src/data/desistentes.ts — e não uma cópia (como o
 * whs.cjs). Precisa de Node ≥ 22.18, que corre TypeScript directamente.
 */
"use strict";

let desistentes;
try {
  desistentes = require("../../src/data/desistentes.ts");
} catch (e) {
  throw new Error(
    `scripts/lib/desistentes.cjs: não consegui carregar src/data/desistentes.ts com o Node ${process.version} ` +
    `(precisa de Node ≥ 22.18, que corre TypeScript). Erro original: ${e.message}`,
  );
}

module.exports = desistentes;
