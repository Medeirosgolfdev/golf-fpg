#!/usr/bin/env node
/**
 * verify-international-courses.js
 *
 * Verificação EXAUSTIVA da qualidade dos dados dos campos internacionais
 * (away-courses.json) e, de referência, dos campos PT (master-courses.json).
 *
 * Reporta, por tee e por campo:
 *   ERROS (provável bug nos dados):
 *     • SI não é permutação válida (duplicados / fora de 1..N) num tee 18H
 *     • par[] não soma ao par declarado nas ratings
 *     • distância total não bate com a soma dos buracos
 *     • tee 18H com buracos a 0/null (par ou distância)
 *   AVISOS (a rever, não necessariamente bug):
 *     • campo sem país
 *     • vários courseKeys com o MESMO nome canónico (fundem em runtime — ok,
 *       mas convém saber)
 *     • campos com par[] 18H idêntico e nomes diferentes (possível duplicado
 *       não fundido)
 *     • tee sem SI (0/null em todos os buracos)
 *
 *   node scripts/verify-international-courses.js            # away + master
 *   node scripts/verify-international-courses.js --away     # só away
 *   node scripts/verify-international-courses.js --json     # saída JSON
 */
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "public", "data");
const onlyAway = process.argv.includes("--away");
const asJson = process.argv.includes("--json");

function load(f) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")).courses || []; }
  catch (e) { console.error(`Não consegui ler ${f}: ${e.message}`); return []; }
}

function norm(s) {
  return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const errors = [];
const warns = [];
const E = (course, tee, msg) => errors.push({ course, tee, msg });
const W = (course, tee, msg) => warns.push({ course, tee, msg });

function checkTee(courseName, t) {
  const holes = t.holes || [];
  const n = holes.length;
  const tag = t.teeName || t.teeId;
  if (n !== 9 && n !== 18) { E(courseName, tag, `nº buracos invulgar: ${n}`); return; }

  // SI
  const si = holes.map(h => h && typeof h.si === "number" ? h.si : null);
  const siSet = si.filter(v => v != null && v > 0);
  if (siSet.length === 0) {
    W(courseName, tag, "sem SI (todos 0/null)");
  } else if (n === 18) {
    // permutação 1..18
    const sorted = [...siSet].sort((a, b) => a - b);
    const dups = sorted.some((v, i) => i > 0 && v === sorted[i - 1]);
    const outOfRange = siSet.some(v => v < 1 || v > 18);
    if (siSet.length === 18 && (dups || outOfRange || sorted.join() !== Array.from({ length: 18 }, (_, i) => i + 1).join())) {
      E(courseName, tag, `SI não é permutação 1-18: [${si.join(",")}]`);
    } else if (siSet.length !== 18) {
      W(courseName, tag, `SI incompleto (${siSet.length}/18 preenchidos)`);
    }
  }

  // par soma vs ratings
  const pars = holes.map(h => h && typeof h.par === "number" ? h.par : null);
  const parSum = pars.reduce((a, v) => a + (v || 0), 0);
  const declared = t.ratings?.holes18?.par ?? t.ratings?.holes9Front?.par ?? null;
  if (n === 18 && declared != null && parSum !== declared) {
    E(courseName, tag, `par soma ${parSum} ≠ par declarado ${declared}`);
  }
  if (n === 18 && pars.some(v => v == null || v === 0)) {
    E(courseName, tag, "buracos com par 0/null num tee 18H");
  }

  // distância
  const dist = holes.map(h => h && typeof h.distance === "number" ? h.distance : null);
  const distSum = dist.reduce((a, v) => a + (v || 0), 0);
  const declaredDist = t.distances?.total ?? null;
  if (declaredDist != null && distSum > 0 && Math.abs(distSum - declaredDist) > 5) {
    E(courseName, tag, `distância soma ${distSum} ≠ total ${declaredDist}`);
  }
  if (n === 18 && distSum === 0) {
    W(courseName, tag, "tee 18H sem distâncias (todas 0)");
  }
}

function run() {
  const away = load("away-courses.json");
  const master = onlyAway ? [] : load("master-courses.json");
  const all = [...away.map(c => ({ ...c, _src: "away" })), ...master.map(c => ({ ...c, _src: "master" }))];

  const byName = new Map();   // nome canónico → [courseKey]
  const byPar = new Map();    // par18 sig → [{name, key}]

  for (const c of all) {
    const m = c.master;
    const name = m.name;
    for (const t of (m.tees || [])) checkTee(name, t);
    if (c._src === "away" && !m.country) W(name, "", "sem país");

    const nn = norm(name);
    byName.set(nn, [...(byName.get(nn) || []), c.courseKey]);

    // assinatura de par 18H do primeiro tee 18H
    const t18 = (m.tees || []).find(t => (t.holes || []).length === 18);
    if (t18) {
      const sig = t18.holes.map(h => h.par).join(",");
      byPar.set(sig, [...(byPar.get(sig) || []), { name, key: c.courseKey }]);
    }
  }

  for (const [nn, keys] of byName) {
    if (keys.length > 1) W(nn, "", `${keys.length} courseKeys com o mesmo nome canónico: ${keys.join(", ")} (fundem em runtime)`);
  }
  for (const [, list] of byPar) {
    const names = [...new Set(list.map(x => norm(x.name)))];
    if (names.length > 1 && list.length > 1) {
      W(names.join(" | "), "", `par 18H idêntico em campos com nomes diferentes (possível duplicado): ${list.map(x => x.name).join(" / ")}`);
    }
  }

  if (asJson) { console.log(JSON.stringify({ errors, warns }, null, 2)); return; }

  console.log(`\nCampos: ${all.length} (away ${away.length}, master ${master.length})`);
  console.log(`\n=== ERROS (${errors.length}) ===`);
  for (const e of errors) console.log(`  ✗ ${e.course}${e.tee ? ` [${e.tee}]` : ""}: ${e.msg}`);
  if (errors.length === 0) console.log("  (nenhum)");
  console.log(`\n=== AVISOS (${warns.length}) ===`);
  for (const w of warns) console.log(`  • ${w.course}${w.tee ? ` [${w.tee}]` : ""}: ${w.msg}`);
  if (warns.length === 0) console.log("  (nenhum)");

  process.exitCode = errors.length > 0 ? 1 : 0;
}

run();
