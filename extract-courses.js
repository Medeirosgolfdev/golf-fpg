#!/usr/bin/env node
/**
 * extract-courses.js
 *
 * Percorre output/*/scorecards/*.json e extrai campos unicos.
 * Compara com master-courses.json para separar PT de internacionais.
 * Gera public/data/away-courses.json para o React consumir.
 *
 * Uso:
 *   node extract-courses.js
 *
 * Requer:
 *   - output/  com pastas de jogadores (geradas por golf-all.js)
 *   - public/data/master-courses.json (catalogo FPG)
 *   - melhorias.json (para pais dos campos away)
 */

const fs = require("fs");
const path = require("path");

/** Ler JSON de ficheiro, removendo BOM se existir */
function readJSON(fpath) {
  let txt = fs.readFileSync(fpath, "utf-8");
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
  return JSON.parse(txt);
}

const outputRoot = path.join(process.cwd(), "output");
const masterPath = path.join(process.cwd(), "public", "data", "master-courses.json");
const melhoriasPath = path.join(process.cwd(), "melhorias.json");
const outPath = path.join(process.cwd(), "public", "data", "away-courses.json");

/* ── Helpers ── */

function norm(s) {
  return String(s || "").trim().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function toNum(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = Number(v); return isNaN(n) ? null : n; }
  return null;
}

/* ── 1. Carregar master-courses para identificar campos PT ── */

const masterNames = new Set();
if (fs.existsSync(masterPath)) {
  try {
    const master = readJSON(masterPath);
    for (const c of (master.courses || [])) {
      masterNames.add(norm(c.master?.name || ""));
    }
    console.log(`  Master: ${masterNames.size} campos PT carregados`);
  } catch (e) {
    console.warn("  Aviso: nao consegui ler master-courses.json:", e.message);
  }
}

/* ── 2. Carregar melhorias.json para pais ── */

const countryMap = {}; // norm(courseName) -> pais
if (fs.existsSync(melhoriasPath)) {
  try {
    const melhorias = readJSON(melhoriasPath);
    for (const [, pdata] of Object.entries(melhorias)) {
      if (typeof pdata !== "object" || pdata === null) continue;
      let currentCountry = "";
      for (const [key, entry] of Object.entries(pdata)) {
        if (key.startsWith("_")) {
          if (typeof entry === "object" && entry !== null) {
            const p = entry.pais;
            currentCountry = (typeof p === "string" && p) ? p : "";
          }
          continue;
        }
        if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
          const sc = entry.scorecard;
          if (sc && typeof sc === "object") {
            const cd = sc.course_description;
            if (cd && currentCountry) countryMap[norm(cd)] = currentCountry;
          }
        }
        if (Array.isArray(entry) && key === "extra_rounds") {
          for (const item of entry) {
            if (item && item.campo && item.pais) {
              countryMap[norm(item.campo)] = item.pais;
            }
          }
        }
      }
    }
    console.log(`  Melhorias: ${Object.keys(countryMap).length} campos com pais`);
  } catch (e) {
    console.warn("  Aviso: nao consegui ler melhorias.json:", e.message);
  }
}

/* ── 3. Percorrer TODOS os scorecards ── */

// courseMap: normKey -> { name, tees: Map<teeKey, teeData> }
const courseMap = new Map();

let totalFiles = 0;
let totalCourses = 0;

if (fs.existsSync(outputRoot)) {
  const dirs = fs.readdirSync(outputRoot).filter(d => {
    const full = path.join(outputRoot, d);
    return fs.statSync(full).isDirectory() && /^\d+$/.test(d);
  });

  for (const fedDir of dirs) {
    const scDir = path.join(outputRoot, fedDir, "scorecards");
    if (!fs.existsSync(scDir)) continue;

    const files = fs.readdirSync(scDir).filter(f => f.endsWith(".json"));
    for (const f of files) {
      totalFiles++;
      try {
        const raw = readJSON(path.join(scDir, f));
        const recs = raw.Records || (Array.isArray(raw) ? raw : []);
        for (const rec of recs) {
          const courseName = (rec.course_description || "").trim();
          const teeName = (rec.tee_name || "").trim();
          const cr = toNum(rec.course_rating);
          const slope = toNum(rec.slope);
          if (!courseName || !cr || !slope) continue;

          const courseNorm = norm(courseName);

          // Saltar campos que estao no master (PT)
          if (masterNames.has(courseNorm)) continue;

          // Chave de agrupamento
          const courseKey = `away-${courseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}`;
          const teeKey = `${teeName}|${cr}|${slope}`;

          if (!courseMap.has(courseKey)) {
            courseMap.set(courseKey, {
              name: courseName,
              country: countryMap[courseNorm] || "",
              tees: new Map(),
            });
            totalCourses++;
          }

          const entry = courseMap.get(courseKey);
          // Actualizar pais se necessario
          if (!entry.country && countryMap[courseNorm]) {
            entry.country = countryMap[courseNorm];
          }

          // Extrair tee data
          if (!entry.tees.has(teeKey)) {
            const holes = [];
            for (let i = 1; i <= 18; i++) {
              const par = toNum(rec[`par_${i}`]);
              const si = toNum(rec[`stroke_index_${i}`]);
              const meters = toNum(rec[`meters_${i}`]);
              if (par || meters) {
                holes.push({ hole: i, par, si, distance: meters });
              }
            }

            entry.tees.set(teeKey, {
              teeName,
              cr,
              slope,
              holes,
              teeColorId: rec.tee_color_id || null,
            });
          }
        }
      } catch {}
    }
  }
}

console.log(`  Scorecards processados: ${totalFiles}`);
console.log(`  Campos internacionais encontrados: ${totalCourses}`);

/* ── 4. Tambem incluir extra_rounds do melhorias.json ── */

if (fs.existsSync(melhoriasPath)) {
  try {
    const melhorias = readJSON(melhoriasPath);
    for (const [, pdata] of Object.entries(melhorias)) {
      if (typeof pdata !== "object" || pdata === null) continue;
      const extraRounds = pdata.extra_rounds;
      if (!Array.isArray(extraRounds)) continue;
      for (const round of extraRounds) {
        if (!round || !round.campo || !round.dias) continue;
        const campo = round.campo.trim();
        const categoria = round.categoria || "Default";
        const pais = round.pais || "";
        const courseKey = `away-${campo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}`;

        if (!courseMap.has(courseKey)) {
          courseMap.set(courseKey, { name: campo, country: pais, tees: new Map() });
          totalCourses++;
        }
        const entry = courseMap.get(courseKey);
        if (!entry.country && pais) entry.country = pais;

        // Usar o melhor dia
        const dias = round.dias || [];
        const best = dias.reduce((prev, d) => {
          const ph = Array.isArray(d.par_holes) ? d.par_holes.length : 0;
          const prevH = prev && Array.isArray(prev.par_holes) ? prev.par_holes.length : 0;
          return ph > prevH ? d : prev;
        }, null);
        if (!best || !best.par_holes) continue;

        const teeKey = `${categoria}|0|0`;
        if (!entry.tees.has(teeKey)) {
          let holeStart = 1;
          if (best.hole_range) {
            const m = String(best.hole_range).match(/^(\d+)/);
            if (m) holeStart = parseInt(m[1], 10);
          }
          const holes = best.par_holes.map((p, i) => ({
            hole: holeStart + i,
            par: p,
            si: best.stroke_index_holes ? best.stroke_index_holes[i] || null : null,
            distance: best.meters_holes ? best.meters_holes[i] || null : null,
          }));
          entry.tees.set(teeKey, {
            teeName: categoria,
            cr: null,
            slope: null,
            holes,
            teeColorId: null,
          });
        }
      }
    }
  } catch {}
}

/* ── 5. Converter para formato Course[] e gravar ── */

function sumHoles(holes, start, end, field) {
  let total = 0, any = false;
  for (const h of holes) {
    if (h.hole >= start && h.hole <= end && h[field] != null) {
      total += h[field];
      any = true;
    }
  }
  return any ? total : null;
}

const courses = [];
for (const [courseKey, { name, country, tees }] of courseMap) {
  const teeArr = [];
  let idx = 0;
  for (const [, t] of tees) {
    const n = t.holes.length;
    const is18 = n === 18;
    const parTotal = sumHoles(t.holes, 1, 18, "par");
    const parFront = sumHoles(t.holes, 1, 9, "par");
    const parBack = sumHoles(t.holes, 10, 18, "par");
    const distTotal = sumHoles(t.holes, 1, 18, "distance");
    const distFront = sumHoles(t.holes, 1, 9, "distance");
    const distBack = sumHoles(t.holes, 10, 18, "distance");

    teeArr.push({
      teeId: `${courseKey}-${idx++}`,
      sex: "U",
      teeName: t.teeName,
      ratings: {
        holes18: { par: is18 ? parTotal : null, courseRating: t.cr, slopeRating: t.slope },
        ...(parFront != null ? { holes9Front: { par: parFront, courseRating: t.cr ? +(t.cr / 2).toFixed(1) : null, slopeRating: t.slope } } : {}),
        ...(parBack != null ? { holes9Back: { par: parBack, courseRating: t.cr ? +(t.cr / 2).toFixed(1) : null, slopeRating: t.slope } } : {}),
      },
      holes: t.holes,
      distances: {
        total: distTotal,
        front9: distFront,
        back9: distBack,
        holesCount: n,
        complete18: is18,
      },
    });
  }

  if (teeArr.length === 0) continue;

  courses.push({
    courseKey,
    master: {
      courseId: courseKey,
      name,
      country: country || undefined,
      links: { fpg: null, scorecards: null },
      tees: teeArr,
    },
  });
}

courses.sort((a, b) => a.master.name.localeCompare(b.master.name, "pt"));

// Gravar
const dir = path.dirname(outPath);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ courses }, null, 2), "utf-8");

console.log(`\n  Gravado: ${outPath}`);
console.log(`  ${courses.length} campos, ${courses.reduce((n, c) => n + c.master.tees.length, 0)} tees`);
console.log(`  Campos com pais: ${courses.filter(c => c.master.country).length}/${courses.length}`);
