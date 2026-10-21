/**
 * scripts/lib/course-aliases.cjs
 *
 * Porta de entrada dos scripts Node para a canonização de nomes de campo.
 * Carrega o MESMO ficheiro que o site — src/utils/courseAliases.ts — e não uma
 * cópia (como o scripts/lib/whs.cjs faz com o whsCalc.ts). Até 2026-10-20 havia
 * aqui uma cópia à mão da tabela, mais outra em lib/course-aliases.js, e já
 * tinham divergido (Tróia, Porto Santo, Oceânico Faldo só existiam nos scripts).
 *
 *   const ALIAS = require("./lib/course-aliases.cjs");          // de scripts/
 *   const ALIAS = require("../scripts/lib/course-aliases.cjs"); // de lib/
 *
 * Exporta (de src/utils/courseAliases.ts): norm, canonicalCourseName,
 * resolveAroeiraIIByPar, resolveSantoDaSerraByPar, canonicalSantoDaSerraNameOnly,
 * resolveRibagolfeKeyByPar/ByName, resolveSantoDaSerraKeyByPar/ByName,
 * resolveMultiloopKeyByPar/ByName, rotateAroeira2RecordIfNeeded,
 * rotateAroeira2ScorecardIfNeeded, AROEIRA2_OLD_PAR.
 *
 * Precisa de Node ≥ 22.18 (corre TypeScript; os workflows usam Node 24). O
 * courseAliases.ts só pode ter tipos/interfaces (nada de enum/namespace) e não
 * importa outros ficheiros do src — scripts/course-aliases-loader.test.js
 * parte se isto deixar de funcionar.
 */
"use strict";

let aliases;
try {
  aliases = require("../../src/utils/courseAliases.ts");
} catch (e) {
  throw new Error(
    `scripts/lib/course-aliases.cjs: não consegui carregar src/utils/courseAliases.ts com o Node ${process.version} ` +
    `(precisa de Node ≥ 22.18, que corre TypeScript). Erro original: ${e.message}`,
  );
}

module.exports = aliases;
