#!/usr/bin/env node
/**
 * extract-courses.js
 *
 * Percorre output/<fed>/scorecards/*.json e extrai campos unicos.
 * Compara com master-courses.json para separar PT de internacionais.
 * Gera public/data/away-courses.json para o React consumir.
 *
 * Também guarda a lista de jogadores (nfed) que jogaram em cada campo,
 * para o merge-courses.js poder mostrar quem jogou lá ao decidir merges.
 *
 * Uso:
 *   node scripts/extract-courses.js
 */

const fs   = require("fs");
const path = require("path");

function readJSON(fpath) {
  let txt = fs.readFileSync(fpath, "utf-8");
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
  return JSON.parse(txt);
}

const outputRoot    = path.join(process.cwd(), "output");
const masterPath    = path.join(process.cwd(), "public", "data", "master-courses.json");
const melhoriasPath = path.join(process.cwd(), "melhorias.json");
const aliasPath     = path.join(process.cwd(), "course-aliases.json");
const outPath       = path.join(process.cwd(), "public", "data", "away-courses.json");

/* ── Helpers ── */

function norm(s) {
  return String(s || "").trim().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function toCourseKey(name) {
  return `away-${norm(name).replace(/\s+/g, "-")}`;
}

function toNum(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = Number(v); return isNaN(n) ? null : n; }
  return null;
}

/* ── 1. Master-courses PT ── */

const masterNames = new Set();
if (fs.existsSync(masterPath)) {
  try {
    const master = readJSON(masterPath);
    for (const c of (master.courses || []))
      masterNames.add(norm(c.master?.name || ""));
    console.log(`  Master: ${masterNames.size} campos PT carregados`);
  } catch (e) { console.warn("  Aviso master-courses:", e.message); }
}

/* ── 2. Aliases (gerado por merge-courses.js) ── */

let ALIASES      = {};   // normVariant → normCanonical
let NAME_OVERRIDES = {}; // courseKey   → nome customizado

if (fs.existsSync(aliasPath)) {
  try {
    const saved    = readJSON(aliasPath);
    ALIASES        = saved.aliases       || {};
    NAME_OVERRIDES = saved.nameOverrides || {};
    const n = Object.keys(ALIASES).length;
    const o = Object.keys(NAME_OVERRIDES).length;
    if (n) console.log(`  Aliases: ${n} merge(s) carregados`);
    if (o) console.log(`  Nomes personalizados: ${o}`);
  } catch (e) { console.warn("  Aviso course-aliases:", e.message); }
}

/* ── 3. País por campo (melhorias.json) ── */

const countryMap = {};
if (fs.existsSync(melhoriasPath)) {
  try {
    const melhorias = readJSON(melhoriasPath);
    for (const [, pdata] of Object.entries(melhorias)) {
      if (!pdata || typeof pdata !== "object") continue;
      let country = "";
      for (const [key, entry] of Object.entries(pdata)) {
        if (key.startsWith("_")) {
          country = (entry?.pais) || "";
          continue;
        }
        if (entry?.scorecard?.course_description && country)
          countryMap[norm(entry.scorecard.course_description)] = country;
        if (Array.isArray(entry) && key === "extra_rounds")
          for (const r of entry)
            if (r?.campo && r?.pais) countryMap[norm(r.campo)] = r.pais;
      }
    }
    console.log(`  Melhorias: ${Object.keys(countryMap).length} campos com país`);
  } catch (e) { console.warn("  Aviso melhorias:", e.message); }
}

/* ── 4. Percorrer scorecards ── */

// courseMap: normKey → { name, courseKey, country, tees: Map, players: Set<nfed> }
const courseMap  = new Map();
let totalFiles   = 0;
let totalCourses = 0;

if (fs.existsSync(outputRoot)) {
  const dirs = fs.readdirSync(outputRoot).filter(d =>
    fs.statSync(path.join(outputRoot, d)).isDirectory() && /^\d+$/.test(d)
  );

  for (const fedDir of dirs) {
    const scDir = path.join(outputRoot, fedDir, "scorecards");
    if (!fs.existsSync(scDir)) continue;

    for (const f of fs.readdirSync(scDir).filter(f => f.endsWith(".json"))) {
      totalFiles++;
      // O nome do ficheiro é o nfed do jogador
      const nfed = path.basename(f, ".json");

      try {
        const raw  = readJSON(path.join(scDir, f));
        const recs = raw.Records || (Array.isArray(raw) ? raw : []);

        for (const rec of recs) {
          const courseName = (rec.course_description || "").trim();
          const teeName    = (rec.tee_name || "").trim();
          const cr         = toNum(rec.course_rating);
          const slope      = toNum(rec.slope);
          if (!courseName || !cr || !slope) continue;

          const courseNorm = norm(courseName);
          if (masterNames.has(courseNorm)) continue;

          const normKey = ALIASES[courseNorm] || courseNorm;
          const teeKey  = `${teeName}|${cr}|${slope}`;

          if (!courseMap.has(normKey)) {
            courseMap.set(normKey, {
              name:      courseName,
              courseKey: toCourseKey(courseName),
              country:   countryMap[normKey] || countryMap[courseNorm] || "",
              tees:      new Map(),
              players:   new Set(),  // ← novo: quem jogou aqui
            });
            totalCourses++;
          }

          const entry = courseMap.get(normKey);

          // Actualizar país
          if (!entry.country && (countryMap[normKey] || countryMap[courseNorm]))
            entry.country = countryMap[normKey] || countryMap[courseNorm];

          // Registar jogador
          entry.players.add(nfed);

          // Tee
          if (!entry.tees.has(teeKey)) {
            const holes = [];
            for (let i = 1; i <= 18; i++) {
              const par    = toNum(rec[`par_${i}`]);
              const si     = toNum(rec[`stroke_index_${i}`]);
              const meters = toNum(rec[`meters_${i}`]);
              if (par || meters) holes.push({ hole: i, par, si, distance: meters });
            }
            entry.tees.set(teeKey, {
              teeName, cr, slope, holes,
              teeColorId: rec.tee_color_id || null,
            });
          }
        }
      } catch {}
    }
  }
}

console.log(`  Scorecards processados: ${totalFiles}`);
console.log(`  Campos internacionais: ${totalCourses}`);

/* ── 5. Extra_rounds do melhorias.json ── */

if (fs.existsSync(melhoriasPath)) {
  try {
    const melhorias = readJSON(melhoriasPath);
    for (const [nfed, pdata] of Object.entries(melhorias)) {
      if (!Array.isArray(pdata?.extra_rounds)) continue;
      for (const round of pdata.extra_rounds) {
        if (!round?.campo || !round?.dias) continue;
        const campo     = round.campo.trim();
        const categoria = round.categoria || "Default";
        const pais      = round.pais || "";
        const normKey   = ALIASES[norm(campo)] || norm(campo);

        if (!courseMap.has(normKey)) {
          courseMap.set(normKey, {
            name: campo, courseKey: toCourseKey(campo),
            country: pais, tees: new Map(), players: new Set(),
          });
          totalCourses++;
        }
        const entry = courseMap.get(normKey);
        if (!entry.country && pais) entry.country = pais;
        entry.players.add(nfed);

        const best = (round.dias || []).reduce((prev, d) => {
          const ph   = Array.isArray(d.par_holes) ? d.par_holes.length : 0;
          const prevH = prev && Array.isArray(prev.par_holes) ? prev.par_holes.length : 0;
          return ph > prevH ? d : prev;
        }, null);
        if (!best?.par_holes) continue;

        const teeKey = `${categoria}|0|0`;
        if (!entry.tees.has(teeKey)) {
          const holeStart = (() => {
            const m = String(best.hole_range || "").match(/^(\d+)/);
            return m ? parseInt(m[1], 10) : 1;
          })();
          entry.tees.set(teeKey, {
            teeName: categoria, cr: null, slope: null,
            holes: best.par_holes.map((p, i) => ({
              hole: holeStart + i, par: p,
              si:       best.stroke_index_holes?.[i] ?? null,
              distance: best.meters_holes?.[i]       ?? null,
            })),
            teeColorId: null,
          });
        }
      }
    }
  } catch {}
}

/* ── 6. Converter para Course[] e gravar ── */

function sumHoles(holes, s, e, field) {
  let total = 0, any = false;
  for (const h of holes)
    if (h.hole >= s && h.hole <= e && h[field] != null) { total += h[field]; any = true; }
  return any ? total : null;
}

const courses = [];
for (const [, { name, courseKey, country, tees, players }] of courseMap) {
  const teeArr = [];
  let idx = 0;
  for (const [, t] of tees) {
    const n       = t.holes.length;
    const is18    = n === 18;
    const pT      = sumHoles(t.holes, 1, 18, "par");
    const pF      = sumHoles(t.holes, 1,  9, "par");
    const pB      = sumHoles(t.holes, 10, 18, "par");
    const dT      = sumHoles(t.holes, 1, 18, "distance");
    const dF      = sumHoles(t.holes, 1,  9, "distance");
    const dB      = sumHoles(t.holes, 10, 18, "distance");

    teeArr.push({
      teeId: `${courseKey}-${idx++}`,
      sex:   "U",
      teeName: t.teeName,
      ratings: {
        holes18: { par: is18 ? pT : null, courseRating: t.cr, slopeRating: t.slope },
        ...(pF != null ? { holes9Front: { par: pF, courseRating: t.cr ? +(t.cr/2).toFixed(1) : null, slopeRating: t.slope } } : {}),
        ...(pB != null ? { holes9Back:  { par: pB, courseRating: t.cr ? +(t.cr/2).toFixed(1) : null, slopeRating: t.slope } } : {}),
      },
      holes:     t.holes,
      distances: { total: dT, front9: dF, back9: dB, holesCount: n, complete18: is18 },
    });
  }
  if (!teeArr.length) continue;

  const displayName = NAME_OVERRIDES[courseKey] || name;

  courses.push({
    courseKey,
    master: {
      courseId: courseKey,
      name:     displayName,
      country:  country || undefined,
      links:    { fpg: null, scorecards: null },
      tees:     teeArr,
      // Lista de jogadores — usada pelo merge-courses.js, não exposta no React
      _players: [...players].sort(),
    },
  });
}

courses.sort((a, b) => a.master.name.localeCompare(b.master.name, "pt"));

const dir = path.dirname(outPath);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ courses }, null, 2), "utf-8");

console.log(`\n  Gravado: ${outPath}`);
console.log(`  ${courses.length} campos, ${courses.reduce((n, c) => n + c.master.tees.length, 0)} tees`);
console.log(`  Campos com país: ${courses.filter(c => c.master.country).length}/${courses.length}`);
