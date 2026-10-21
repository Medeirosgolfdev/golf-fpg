"use strict";

// Canonização de nomes de campo para o pipeline (lib/process-data.js).
// Tudo vem de src/utils/courseAliases.ts — a fonte única, a mesma do site —
// através de scripts/lib/course-aliases.cjs (o Node ≥ 22.18 corre TypeScript).
// Até 2026-10-20 este ficheiro tinha a sua própria cópia do Santo da Serra e da
// rotação do Aroeira No.2.
const A = require("../scripts/lib/course-aliases.cjs");

module.exports = {
  canonicalCourseName: A.canonicalCourseName,
  rotateAroeira2RecordIfNeeded: A.rotateAroeira2RecordIfNeeded,
  resolveAroeiraIIByPar: A.resolveAroeiraIIByPar,
  resolveSantoDaSerraByPar: A.resolveSantoDaSerraByPar,
  canonicalSantoDaSerraNameOnly: A.canonicalSantoDaSerraNameOnly,
  AROEIRA2_OLD_PAR: A.AROEIRA2_OLD_PAR,
};
