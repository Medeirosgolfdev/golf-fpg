#!/usr/bin/env node
/**
 * update-oeiras-green-valley.js
 *
 * Actualiza o campo `ncourse-105-1` do master-courses.json com o scorecard
 * NOVO (pós-remodelação) publicado pela FPG, e renomeia-o para o nome actual
 * "Oeiras Green Valley" (era só "Oeiras").
 *
 * Fonte (scorecard oficial, ncourse=105-1):
 *   https://scoring-pt.datagolf.pt/scripts/show_card.asp?ncourse=105-1&stat=Y&Club=ALL&ack=XH256YF45T
 *
 * O que mudou face aos dados antigos (medido contra o master de 2026-02-12):
 *   - Brancas: b2 455→485, b4 375→322, b6 180→159 · total 6590→6502 · CR 74.2→75.0
 *   - Verdes:  b6 110→105 · total 3910→3900   (M e F)
 *   - Azuis F: CR 75.5→76.0
 *   - Par (37+37=74) e Stroke Index mantêm-se iguais aos que já tínhamos.
 *
 * Layout: campo de 9 buracos jogado 2× (buracos 10-18 repetem 1-9 com o SI
 * par). 6 tees; a FPG só publica rating de Senhoras para Azuis/Vermelhas/
 * Verdes/Roxas — os tees M/F existentes no master reflectem isso (6 M + 4 F).
 *
 * Actualização CIRÚRGICA (distâncias, par, SI, CR/Slope, totais e o `avg` do
 * teeOrder) — preserva teeId, teeIndex, ordem e quaisquer campos extra, para
 * não partir referências existentes. Idempotente; escrita atómica.
 *
 *   node scripts/update-oeiras-green-valley.js [--dry-run]
 *
 * Depois: `node scripts/build-course-players.js` (o alias "oeiras" →
 * "Oeiras Green Valley" em scripts/lib/course-aliases.cjs garante que as
 * voltas antigas, cujo nome de campo na FPG é "Oeiras", continuam a ligar).
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "public", "data", "master-courses.json");
const KEY = "ncourse-105-1";
const NAME = "Oeiras Green Valley";
const DRY = process.argv.includes("--dry-run");

/* ── Scorecard oficial (9 buracos; 10-18 repetem) ─────────────────────── */
const PAR9 = [4, 5, 5, 4, 4, 3, 5, 3, 4];                                  // Σ 37
const SI18 = [17, 13, 1, 11, 5, 15, 7, 9, 3, 18, 14, 2, 12, 6, 16, 8, 10, 4];
const DIST9 = {
  BRANCAS:   [335, 485, 490, 322, 380, 159, 515, 195, 370],                // Σ 3251
  AMARELAS:  [310, 420, 470, 290, 350, 140, 490, 175, 345],                // Σ 2990
  AZUIS:     [290, 395, 450, 270, 330, 120, 465, 150, 325],                // Σ 2795
  VERMELHAS: [275, 370, 425, 225, 270, 105, 435, 120, 305],                // Σ 2530
  VERDES:    [200, 280, 310, 205, 200, 105, 320, 115, 215],                // Σ 1950
  ROXAS:     [150, 220, 220, 150, 150,  70, 240,  75, 160],                // Σ 1435
};
/** OUT publicado no cartão — guarda contra gralhas na tabela acima. */
const OUT_OFICIAL = { BRANCAS: 3251, AMARELAS: 2990, AZUIS: 2795, VERMELHAS: 2530, VERDES: 1950, ROXAS: 1435 };
/** C.Rat / Slope de 18 buracos, por tee e sexo (a FPG não publica os de 9). */
const RATINGS = {
  BRANCAS:   { M: [75.0, 135] },
  AMARELAS:  { M: [72.4, 129] },
  AZUIS:     { M: [70.4, 125], F: [76.0, 131] },
  VERMELHAS: { M: [67.8, 119], F: [72.8, 124] },
  VERDES:    { M: [62.6, 109], F: [65.8, 109] },
  ROXAS:     { M: [58.8, 100], F: [60.6,  97] },
};

function main() {
  // Guardas: par e OUT têm de bater com o cartão publicado.
  const par9 = PAR9.reduce((a, b) => a + b, 0);
  if (par9 !== 37) throw new Error(`PAR9 soma ${par9}, esperado 37`);
  for (const [tee, nine] of Object.entries(DIST9)) {
    const out = nine.reduce((a, b) => a + b, 0);
    if (out !== OUT_OFICIAL[tee]) throw new Error(`${tee}: OUT ${out} ≠ ${OUT_OFICIAL[tee]} (cartão FPG)`);
  }

  const doc = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const course = (doc.courses || []).find((c) => c.courseKey === KEY);
  if (!course) throw new Error(`courseKey ${KEY} não encontrado no master-courses.json`);

  const changes = [];
  if (course.master.name !== NAME) {
    changes.push(`nome "${course.master.name}" → "${NAME}"`);
    course.master.name = NAME;
  }

  for (const tee of course.master.tees || []) {
    const key = String(tee.teeName || "").toUpperCase();
    const nine = DIST9[key];
    if (!nine) { console.warn(`  aviso: tee "${tee.teeName}" sem distâncias no cartão — ignorado`); continue; }
    const dist18 = nine.concat(nine);
    const par18 = PAR9.concat(PAR9);
    const label = `${tee.sex} ${tee.teeName}`;

    // Buracos
    tee.holes = dist18.map((m, i) => {
      const prev = (tee.holes || [])[i] || {};
      if (prev.distance !== m) changes.push(`${label}: b${i + 1} m ${prev.distance}→${m}`);
      if (prev.par !== par18[i]) changes.push(`${label}: b${i + 1} par ${prev.par}→${par18[i]}`);
      if (prev.si !== SI18[i]) changes.push(`${label}: b${i + 1} SI ${prev.si}→${SI18[i]}`);
      return { ...prev, hole: i + 1, par: par18[i], si: SI18[i], distance: m };
    });

    // Distâncias
    const outSum = nine.reduce((a, b) => a + b, 0);
    const total = outSum * 2;
    if (tee.distances?.total !== total) changes.push(`${label}: total ${tee.distances?.total}→${total}`);
    tee.distances = { ...(tee.distances || {}), total, front9: outSum, back9: outSum, holesCount: 18, complete18: true };

    // Média por buraco (usada pelo teeOrder da UI)
    if (tee.scorecardMeta?.teeOrder) tee.scorecardMeta.teeOrder.avg = total / 18;

    // Ratings de 18 buracos
    const r = RATINGS[key]?.[tee.sex];
    if (!r) { console.warn(`  aviso: sem C.Rat/Slope no cartão para ${label} — ratings mantidos`); continue; }
    tee.ratings = tee.ratings || {};
    const h18 = tee.ratings.holes18 || {};
    if (h18.courseRating !== r[0]) changes.push(`${label}: CR ${h18.courseRating}→${r[0]}`);
    if (h18.slopeRating !== r[1]) changes.push(`${label}: Slope ${h18.slopeRating}→${r[1]}`);
    tee.ratings.holes18 = { ...h18, par: 74, courseRating: r[0], slopeRating: r[1] };
  }

  if (!changes.length) { console.log(`${NAME}: já actualizado — nada a fazer.`); return; }
  console.log(`${NAME} (${KEY}) — ${changes.length} alterações:`);
  for (const c of changes) console.log("  " + c);
  if (DRY) { console.log("\n--dry-run: nada gravado."); return; }

  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(doc));
  fs.renameSync(tmp, FILE);
  console.log(`\nGravado: ${FILE}`);
  console.log("Próximo: node scripts/build-course-players.js && node scripts/build-course-player-names.js");
}

main();
