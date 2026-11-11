/**
 * scripts/lib/drive-points.cjs
 *
 * Porta de entrada dos scripts Node para os pontos do ranking Drive. Carrega o
 * MESMO ficheiro que o site — src/constants/drivePoints.ts — e não uma cópia:
 * as tabelas (Tour 8.º = 38, Challenge 8.º = 35, Finais a ×1.5), os empates e o
 * total do ranking vivem num só sítio. Até 11/11/2026 isto era um ESPELHO
 * escrito à mão, para manter sincronizado; conferido nesse dia que dava o mesmo
 * em todos os casos, passou a carregador (como scripts/lib/whs.cjs).
 *
 *   const dp = require("./lib/drive-points.cjs");   // a partir de scripts/
 *
 * Precisa de Node ≥ 22.18, que corre TypeScript directamente (os workflows usam
 * Node 24). Por isso o drivePoints.ts só pode ter sintaxe que o Node sabe apagar
 * (tipos e interfaces — nada de `enum` nem `namespace`) e não pode importar
 * outros ficheiros do `src` (`scripts/drive-points-loader.test.js` parte se
 * isto falhar).
 */
"use strict";

let dp;
try {
  dp = require("../../src/constants/drivePoints.ts");
} catch (e) {
  throw new Error(
    `scripts/lib/drive-points.cjs: não consegui carregar src/constants/drivePoints.ts com o Node ${process.version} ` +
    `(precisa de Node ≥ 22.18, que corre TypeScript). Erro original: ${e.message}`,
  );
}

module.exports = dp;
