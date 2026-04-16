#!/usr/bin/env node
/**
 * extract-courses.js
 *
 * Percorre output/<fed>/scorecards/*.json e extrai campos únicos.
 * Compara com master-courses.json para separar PT de internacionais.
 * Aplica course-aliases.json para deduplicar e excluir variantes PT.
 * Gera public/data/away-courses.json para o React consumir.
 *
 * NOVIDADES v2:
 *  - Suporte a `blacklist` em course-aliases.json (ex: "NONE", "Internacional")
 *  - Popula `_players` em cada campo: quem jogou e a data mais recente
 *    (lê output/<nfed>/analysis/data.json, gerado pelo make-scorecards-ui.js)
 *
 * Uso:
 *   node extract-courses.js
 *
 * Requer:
 *   - output/  com pastas de jogadores (geradas por golf-all.js)
 *   - public/data/master-courses.json (catálogo FPG)
 *   - course-aliases.json (aliases, ptVariants, blacklist, nameOverrides)
 *   - melhorias.json (para país dos campos away)
 */

const fs   = require("fs");
const path = require("path");

/** Ler JSON de ficheiro, removendo BOM se existir */
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
const cachePath     = path.join(process.cwd(), "output", "extract-courses-cache.json");

/* ── Cache: fingerprint baseado nos mtimes dos inputs ── */

function computeCacheFingerprint() {
  const parts = [];

  // 1. Config files
  for (const fp of [masterPath, melhoriasPath, aliasPath]) {
    try { parts.push(`${fp}:${fs.statSync(fp).mtimeMs}`); }
    catch { parts.push(`${fp}:missing`); }
  }

  // 2. Scorecard dirs — usar mtime da pasta (muda quando ficheiros são adicionados/removidos)
  //    + mtime do analysis/data.json de cada jogador
  if (fs.existsSync(outputRoot)) {
    const dirs = fs.readdirSync(outputRoot).filter(d => {
      const full = path.join(outputRoot, d);
      return fs.statSync(full).isDirectory() && /^\d+$/.test(d);
    }).sort();

    for (const d of dirs) {
      // Aceita ambos os formatos — usa o mais recente
      const scDir = path.join(outputRoot, d, "scorecards");
      const scJson = path.join(outputRoot, d, "scorecards.json");
      try { parts.push(`sc:${d}:${fs.statSync(scDir).mtimeMs}`); }
      catch { /* sem dir antigo */ }
      try { parts.push(`scj:${d}:${fs.statSync(scJson).mtimeMs}`); }
      catch { /* sem scorecards.json novo */ }

      const dataP = path.join(outputRoot, d, "analysis", "data.json");
      try { parts.push(`dj:${d}:${fs.statSync(dataP).mtimeMs}`); }
      catch { /* sem data.json */ }
    }
  }

  return parts.join("|");
}

const forceExtract = process.argv.includes("--force");
const fingerprint  = computeCacheFingerprint();

// Verificar cache
if (!forceExtract && fs.existsSync(cachePath) && fs.existsSync(outPath)) {
  try {
    const cached = readJSON(cachePath);
    if (cached._fingerprint === fingerprint) {
      console.log("  Extract-courses: cache válido — nada mudou");
      process.exit(0);
    }
  } catch { /* cache corrompido, continuar */ }
}

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

/** Converte nomes em MAIÚSCULAS para Title Case */
function titleCase(s) {
  if (!s || s.length <= 4) return s;
  if (s !== s.toUpperCase()) return s;
  const stop = new Set([
    "de","da","do","dos","das","del","el","la","los","las",
    "the","of","and","e","y","i","a","por","con","sur","em",
  ]);
  return s.toLowerCase().split(/\s+/).map((w, i) =>
    (i === 0 || !stop.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w
  ).join(" ");
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

/* ── 2. Carregar course-aliases.json ── */

let aliasMap = {}, nameOverridesMap = {}, blackSet = new Set(), courseKeyCountryMap = {}, extraLinksMap = {};

if (fs.existsSync(aliasPath)) {
  try {
    const ad = readJSON(aliasPath);
    aliasMap         = ad.aliases       || {};
    nameOverridesMap = ad.nameOverrides || {};

    // ptVariants: nomes alternativos de campos PT → excluir dos away
    const ptv = ad.ptVariants || {};
    let ptCount = 0;
    for (const [k] of Object.entries(ptv)) {
      if (k !== "_note") { masterNames.add(k); ptCount++; }
    }

    // blacklist: nomes de lixo/inválidos
    for (const name of (ad.blacklist || [])) {
      blackSet.add(norm(name));
    }

    // countryMap: courseKey → país (pesquisado e mantido manualmente)
    courseKeyCountryMap = ad.countryMap || {};

    // extraLinks: courseKey → [{label, url}] — links adicionais configurados manualmente
    extraLinksMap = ad.extraLinks || {};

    const aliasCount = Object.keys(aliasMap).filter(k => !k.startsWith("_comment")).length;
    console.log(`  Aliases: ${aliasCount} · PT variants: ${ptCount} · Blacklist: ${blackSet.size} · nameOverrides: ${Object.keys(nameOverridesMap).length}`);
  } catch (e) {
    console.warn("  Aviso: nao consegui ler course-aliases.json:", e.message);
  }
} else {
  console.warn("  Aviso: course-aliases.json nao encontrado");
}

/**
 * Resolve um nome normalizado seguindo a cadeia de aliases.
 * Devolve o canonical norm (o último da cadeia).
 */
function resolveAlias(n, maxHops = 8) {
  let cur = n;
  for (let i = 0; i < maxHops; i++) {
    const next = aliasMap[cur];
    if (!next || next === cur) break;
    cur = next;
  }
  // Se não resolveu, tentar sem anos (ex: "marco simone invitational 2026" → "marco simone invitational")
  if (cur === n) {
    const stripped = n.replace(/\b20\d{2}\b/g, "").replace(/\s+/g, " ").trim();
    if (stripped !== n) return resolveAlias(stripped, maxHops);
  }
  return cur;
}

/**
 * Devolve true se o campo deve ser excluído:
 *   - está na blacklist (nome inválido/lixo)
 *   - é campo PT (master + ptVariants)
 * Verifica tanto o norm original como o canonical depois de resolver aliases.
 */
function shouldExclude(courseNorm) {
  if (blackSet.has(courseNorm)) return true;
  if (masterNames.has(courseNorm)) return true;
  const canonical = resolveAlias(courseNorm);
  if (blackSet.has(canonical)) return true;
  return masterNames.has(canonical);
}

/* ── 3. Carregar melhorias.json para país ── */

const countryMap = {}; // norm(courseName) -> país
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
    console.log(`  Melhorias: ${Object.keys(countryMap).length} campos com país`);
  } catch (e) {
    console.warn("  Aviso: nao consegui ler melhorias.json:", e.message);
  }
}

/* ── 4. Percorrer TODOS os scorecards ── */

// courseMap: courseKey -> { name, country, tees: Map<teeKey, teeData> }
// teeKey = "teeName|courseRating|slope"  — garante unicidade real por configuração
const courseMap = new Map();

let totalFiles   = 0;
let totalCourses = 0;

if (fs.existsSync(outputRoot)) {
  const dirs = fs.readdirSync(outputRoot).filter(d => {
    const full = path.join(outputRoot, d);
    return fs.statSync(full).isDirectory() && /^\d+$/.test(d);
  });

  // Carregar scorecards de ambos os formatos (novo + antigo) via helper unificado
  const { loadScorecardsByScoreId } = require("../lib/helpers");
  for (const fedDir of dirs) {
    const baseDir = path.join(outputRoot, fedDir);
    const cardMap = loadScorecardsByScoreId(baseDir);
    if (cardMap.size === 0) continue;

    for (const [, rec] of cardMap.entries()) {
      totalFiles++;
      try {
        const recs = [rec]; // wrap em array para manter o loop seguinte intacto
        for (const rec of recs) {
          const courseName = (rec.course_description || "").trim();
          const teeName    = (rec.tee_name || "").trim();
          const cr         = toNum(rec.course_rating);
          const slope      = toNum(rec.slope);
          if (!courseName || !cr || !slope) continue;

          const courseNorm = norm(courseName);
          if (shouldExclude(courseNorm)) continue;

          const canonicalNorm = resolveAlias(courseNorm);
          if (shouldExclude(canonicalNorm)) continue;

          const courseKey = `away-${canonicalNorm.replace(/\s+/g, "-")}`;
          // teeKey único por configuração real (nome + ratings)
          const teeKey = `${teeName}|${cr}|${slope}`;

          if (!courseMap.has(courseKey)) {
            const displayName = nameOverridesMap[courseKey] || titleCase(courseName) || courseName;
            const country = courseKeyCountryMap[courseKey] || countryMap[canonicalNorm] || countryMap[courseNorm] || "";
            courseMap.set(courseKey, { name: displayName, country, tees: new Map() });
            totalCourses++;
          }

          const entry = courseMap.get(courseKey);
          if (!entry.country) {
            entry.country = countryMap[canonicalNorm] || countryMap[courseNorm] || "";
          }

          if (!entry.tees.has(teeKey)) {
            const holes = [];
            for (let i = 1; i <= 18; i++) {
              const par    = toNum(rec[`par_${i}`]);
              const si     = toNum(rec[`stroke_index_${i}`]);
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

// Aplicar países do courseKeyCountryMap a entradas já criadas
for (const [courseKey, entry] of courseMap) {
  if (courseKeyCountryMap[courseKey]) {
    entry.country = courseKeyCountryMap[courseKey];
  }
}

/* ── 5. Incluir extra_rounds do melhorias.json ── */

if (fs.existsSync(melhoriasPath)) {
  try {
    const melhorias = readJSON(melhoriasPath);
    for (const [, pdata] of Object.entries(melhorias)) {
      if (typeof pdata !== "object" || pdata === null) continue;
      const extraRounds = pdata.extra_rounds;
      if (!Array.isArray(extraRounds)) continue;
      for (const round of extraRounds) {
        if (!round || !round.campo || !round.dias) continue;
        const campo     = round.campo.trim();
        const categoria = round.categoria || "Default";
        const pais      = round.pais || "";

        const campoNorm = norm(campo);
        if (shouldExclude(campoNorm)) continue;

        const canonicalNorm = resolveAlias(campoNorm);
        if (shouldExclude(canonicalNorm)) continue;

        const courseKey = `away-${canonicalNorm.replace(/\s+/g, "-")}`;

        if (!courseMap.has(courseKey)) {
          const displayName = nameOverridesMap[courseKey] || titleCase(campo) || campo;
          courseMap.set(courseKey, { name: displayName, country: pais || countryMap[canonicalNorm] || "", tees: new Map() });
          totalCourses++;
        }
        const entry = courseMap.get(courseKey);
        if (!entry.country && pais) entry.country = pais;

        const dias = round.dias || [];
        const best = dias.reduce((prev, d) => {
          const ph    = Array.isArray(d.par_holes) ? d.par_holes.length : 0;
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
            hole:     holeStart + i,
            par:      p,
            si:       best.stroke_index_holes ? best.stroke_index_holes[i] || null : null,
            distance: best.meters_holes ? best.meters_holes[i] || null : null,
          }));
          entry.tees.set(teeKey, {
            teeName:    categoria,
            cr:         null,
            slope:      null,
            holes,
            teeColorId: null,
          });
        }
      }
    }
  } catch {}
}

/* ── 5.5. Construir _players: quem jogou em cada campo away ──────────────
 *
 * Lê output/<nfed>/analysis/data.json (gerado pelo make-scorecards-ui.js,
 * passo 2 do pipeline — corre ANTES deste script).
 *
 * Para cada round com scoreOrigin "Intern" ou "Extra" regista o nfed e
 * a data mais recente em que jogou nesse campo.
 *
 * Formato relevante em data.json:
 *   DATA[].rounds[].{ course, scoreOrigin, date: "DD-MM-YYYY" }
 */

/** "DD-MM-YYYY" → "YYYY-MM-DD" (comparável lexicograficamente) */
function toIsoDate(d) {
  if (!d || !/^\d{2}-\d{2}-\d{4}$/.test(d)) return null;
  const [dd, mm, yyyy] = d.split("-");
  return `${yyyy}-${mm}-${dd}`;
}

// playersMap: courseKey → Map<nfed, latestIsoDate | null>
const playersMap = new Map();

if (fs.existsSync(outputRoot)) {
  const dirs = fs.readdirSync(outputRoot).filter(d => {
    const full = path.join(outputRoot, d);
    return fs.statSync(full).isDirectory() && /^\d+$/.test(d);
  });

  let scanned = 0;

  for (const fedDir of dirs) {
    const dataPath = path.join(outputRoot, fedDir, "analysis", "data.json");
    if (!fs.existsSync(dataPath)) continue;

    try {
      const data    = readJSON(dataPath);
      const nfed    = String(data.CURRENT_FED || fedDir);
      const entries = data.DATA || [];
      scanned++;

      for (const entry of entries) {
        for (const r of (entry.rounds || [])) {
          // Apenas rounds internacionais
          if (r.scoreOrigin !== "Intern" && r.scoreOrigin !== "Extra") continue;

          const courseName = (r.course || entry.course || "").trim();
          if (!courseName) continue;

          const courseNorm = norm(courseName);
          if (shouldExclude(courseNorm)) continue;

          const canonicalNorm = resolveAlias(courseNorm);
          if (shouldExclude(canonicalNorm)) continue;

          const courseKey = `away-${canonicalNorm.replace(/\s+/g, "-")}`;
          const isoDate   = toIsoDate(r.date);

          if (!playersMap.has(courseKey)) playersMap.set(courseKey, new Map());
          const pm       = playersMap.get(courseKey);
          const existing = pm.get(nfed);
          // Guardar apenas a data mais recente por jogador
          if (!existing || (isoDate && isoDate > existing)) {
            pm.set(nfed, isoDate);
          }
        }
      }
    } catch {}
  }

  const withPlayers = [...playersMap.values()].filter(m => m.size > 0).length;
  const totalLinks  = [...playersMap.values()].reduce((s, m) => s + m.size, 0);
  console.log(`  Jogadores escaneados para _players: ${scanned}`);
  console.log(`  _players: ${totalLinks} ligações jogador↔campo em ${withPlayers} campos`);
}

/* ── 6. Converter para formato Course[] e gravar ── */

function sumHoles(holes, start, end, field) {
  let total = 0, any = false;
  for (const h of holes) {
    if (h.hole >= start && h.hole <= end && h[field] != null) {
      total += h[field];
      any    = true;
    }
  }
  return any ? total : null;
}

const courses = [];
let coursesWithPlayers = 0;

for (const [courseKey, { name, country, tees }] of courseMap) {
  const teeArr = [];
  let idx = 0;

  for (const [, t] of tees) {
    const n         = t.holes.length;
    const is18      = n === 18;
    const parTotal  = sumHoles(t.holes, 1,  18, "par");
    const parFront  = sumHoles(t.holes, 1,   9, "par");
    const parBack   = sumHoles(t.holes, 10, 18, "par");
    const distTotal = sumHoles(t.holes, 1,  18, "distance");
    const distFront = sumHoles(t.holes, 1,   9, "distance");
    const distBack  = sumHoles(t.holes, 10, 18, "distance");

    teeArr.push({
      teeId:   `${courseKey}-${idx++}`,
      sex:     "U",
      teeName: t.teeName,
      ratings: {
        holes18: { par: is18 ? parTotal : null, courseRating: t.cr, slopeRating: t.slope },
        ...(parFront != null ? { holes9Front: { par: parFront, courseRating: t.cr ? +(t.cr / 2).toFixed(1) : null, slopeRating: t.slope } } : {}),
        ...(parBack  != null ? { holes9Back:  { par: parBack,  courseRating: t.cr ? +(t.cr / 2).toFixed(1) : null, slopeRating: t.slope } } : {}),
      },
      holes: t.holes,
      distances: {
        total:      distTotal,
        front9:     distFront,
        back9:      distBack,
        holesCount: n,
        complete18: is18,
      },
    });
  }

  if (teeArr.length === 0) continue;

  // _players: nfed → data mais recente ISO em que jogou aqui
  const pm       = playersMap.get(courseKey);
  const _players = pm && pm.size > 0 ? Object.fromEntries(pm) : undefined;
  if (_players) coursesWithPlayers++;

  courses.push({
    courseKey,
    master: {
      courseId: courseKey,
      name,
      ...(country  ? { country }  : {}),
      links: {
        fpg: null,
        scorecards: null,
        ...(extraLinksMap[courseKey]?.length ? { extra: extraLinksMap[courseKey] } : {}),
      },
      tees: teeArr,
      ...(_players ? { _players } : {}),
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
console.log(`  Campos com país: ${courses.filter(c => c.master.country).length}/${courses.length}`);
console.log(`  Campos com _players: ${coursesWithPlayers}/${courses.length}`);

// Gravar cache fingerprint
try {
  fs.writeFileSync(cachePath, JSON.stringify({ _fingerprint: fingerprint }), "utf-8");
} catch { /* ignorar — cache é opcional */ }
