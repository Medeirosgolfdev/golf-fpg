/**
 * scripts/lib/ffg-jogador.cjs
 *
 * Porta de entrada dos scripts Node para a limpeza dos jogadores do portal FFG
 * (lugares de equipa «JOUEUR A…», escapes «J\E9r\E9my», «Amalie (U18)»).
 * Carrega o MESMO ficheiro que o site — src/data/ffg/ffgJogador.ts — como o
 * whs.cjs. Precisa de Node ≥ 22.18 (corre TypeScript).
 */
"use strict";

let mod;
try {
  mod = require("../../src/data/ffg/ffgJogador.ts");
} catch (e) {
  throw new Error(
    `scripts/lib/ffg-jogador.cjs: não consegui carregar src/data/ffg/ffgJogador.ts com o Node ${process.version} ` +
    `(precisa de Node ≥ 22.18, que corre TypeScript). Erro original: ${e.message}`,
  );
}

module.exports = mod;
