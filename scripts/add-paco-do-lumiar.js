#!/usr/bin/env node
/**
 * add-paco-do-lumiar.js
 *
 * Adiciona (ou actualiza) o campo "Paço do Lumiar" ao master-courses.json.
 *
 * Porquê: o Paço do Lumiar é um campo PÚBLICO de 9 buracos par-3 (par 29) em
 * Lisboa onde MUITOS juniores regionais jogam (~900+ voltas no nosso histórico),
 * mas nunca esteve no master-courses.json — por isso essas voltas apareciam
 * como "sem campo" no cruzamento (build-course-players.js).
 *
 * Layout reconstruído a partir dos scorecards reais (HOLES.p/.si/.m das voltas):
 *   - 9 buracos par-3 (com 2 par-4: buracos 4 e 7) → par 29.
 *   - A FPG/o master representam-no como 18 buracos (os 9 jogados 2×) → par 58,
 *     consistente com as voltas de 18 buracos do histórico.
 *   - 3 tees: Brancas / Amarelas / Vermelhas (distâncias dos scorecards).
 *   - SI 1-18 oficial; CR/Slope desconhecidos (campo par-3 sem rating publicado).
 *
 * Idempotente: se já existir, substitui. Escrita atómica (tmp + rename).
 *
 *   node scripts/add-paco-do-lumiar.js
 *
 * Depois: re-correr `node scripts/build-course-players.js` para ligar as voltas.
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "public", "data", "master-courses.json");
const KEY = "paco-do-lumiar";
const NAME = "Paço do Lumiar";

// ── Layout (dos scorecards) ───────────────────────────────────────────────
const PAR9 = [3, 3, 3, 4, 3, 3, 4, 3, 3];                 // par 29 (buracos 4 e 7 = par 4)
const SI18 = [9, 17, 13, 1, 11, 5, 7, 15, 3, 10, 18, 14, 2, 12, 6, 8, 16, 4];
const DIST9 = {                                            // metros por buraco (9), por tee
  BRANCAS:   [158, 124, 112, 371, 85, 140, 299, 128, 144], // Σ 1561
  AMARELAS:  [138, 115, 94, 371, 81, 124, 281, 121, 134],   // Σ 1459
  VERMELHAS: [116, 106, 84, 357, 77, 112, 270, 105, 125],   // Σ 1352
};
const COLORS = { BRANCAS: "#ffffff", AMARELAS: "#ffff00", VERMELHAS: "#ff0000" };
const ORDER = ["BRANCAS", "AMARELAS", "VERMELHAS"];
const titleCase = (s) => s[0] + s.slice(1).toLowerCase();

function makeTee(name, sex, idx) {
  const nine = DIST9[name];
  const dist18 = nine.concat(nine);
  const par18 = PAR9.concat(PAR9);
  const holes = dist18.map((m, i) => ({ hole: i + 1, par: par18[i], si: SI18[i], distance: m }));
  const nineSum = nine.reduce((s, x) => s + x, 0);
  return {
    teeId: `${KEY}__${sex}__${name.toLowerCase()}`,
    sex,
    teeName: name,
    scorecardMeta: {
      teeColor: COLORS[name],
      teeIndex: idx,
      teeOrder: { oldIndex: idx, name: titleCase(name), color: COLORS[name] },
    },
    ratings: {
      holes18: { par: 58, courseRating: null, slopeRating: null },
      holes9Front: { par: 29, courseRating: null, slopeRating: null },
      holes9Back: { par: 29, courseRating: null, slopeRating: null },
    },
    holes,
    distances: { total: nineSum * 2, front9: nineSum, back9: nineSum, holesCount: 18, complete18: true },
  };
}

function main() {
  const tees = [];
  ORDER.forEach((n, i) => tees.push(makeTee(n, "M", i)));
  // Variantes femininas dos tees mais à frente (mesma jardagem), p/ filtro Sexo.
  ["AMARELAS", "VERMELHAS"].forEach((n) => tees.push(makeTee(n, "F", ORDER.indexOf(n))));

  const course = {
    courseKey: KEY,
    master: {
      courseId: KEY,
      name: NAME,
      numbers: { fpg: null, scorecards: null },
      links: { fpg: null, scorecards: null },
      tees,
    },
  };

  const doc = JSON.parse(fs.readFileSync(FILE, "utf8"));
  doc.courses = doc.courses || [];
  const at = doc.courses.findIndex((c) => c.courseKey === KEY);
  if (at >= 0) doc.courses[at] = course;
  else doc.courses.push(course);

  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(doc));
  fs.renameSync(tmp, FILE);
  console.log(`${at >= 0 ? "Actualizado" : "Adicionado"}: ${NAME} (par 58, 9×2 buracos, ${tees.length} tees).`);
  console.log(`master-courses.json agora tem ${doc.courses.length} campos.`);
  console.log("Próximo: node scripts/build-course-players.js");
}

main();
