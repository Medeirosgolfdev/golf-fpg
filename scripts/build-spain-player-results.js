/**
 * scripts/build-spain-player-results.js
 *
 * Indice por LICENCA dos torneios + resultado de cada jogador espanhol, para a
 * PlayersView (/rfeg/info/jugadores) mostrar ao clicar num jogador.
 *
 * Le DIRECTAMENTE os ficheiros de resultado (nao os "rivals"), porque o pipeline
 * rivals descarta resultado valido:
 *   - NextCaddy: rivals exige course.par com 9/18 valores e descarta o torneio
 *     inteiro se faltar; mas o leaderboard (licenca+pos+total+toPar) existe na
 *     mesma. Aqui le-se o leaderboard sem esse filtro (recupera ~5x mais).
 *   - RFEGolf: os resultados vivem em results[].players mas SEM licenca (so nome,
 *     do PDF). Casa-se o nome contra inscritos (que tem nome + licenca).
 *   - FCG (golfdirecto): reutiliza fcg-rivals.json (ja tem license + pos/total).
 *
 * LiveGolfScoring NAO entra: nao expoe licenca (so nome/memberId).
 *
 * Output: public/data/spain-player-results.json
 *   byLicencia: { "<LIC_UPPER>": [ { tid, src, id, name, ageGroup, year,
 *                                    dateIso, pos, total, toPar, scoring } ] }
 *   src/id -> rota: /rfeg/{src}/{id}  (nextcaddy/{tourId}, rfegolf/{compId}, golfdirecto/{gameId})
 *
 * USO: node scripts/build-spain-player-results.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const NC_DIR = path.join(REPO, "public", "data", "nextcaddy");
const RFEG_DIR = path.join(REPO, "public", "data", "rfegolf-resultats");
const FCG_RIVALS = path.join(REPO, "public", "data", "fcg-rivals.json");
const IDX_FILE = path.join(REPO, "public", "data", "rfegolf-resultats-index.json");
const OUT = path.join(REPO, "public", "data", "spain-player-results.json");
const TWINS_FILE = path.join(REPO, "public", "data", "rfegolf-lgs-twins.json");

function normName(s) {
  return String(s || "").toLowerCase().normalize("NFD")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
function parseEsDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || "").trim());
  return m ? (m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0")) : null;
}
function ageGroupFromNorm(t) {
  let m = t.match(/sub[\s-]?(\d+)/); if (m) return "Sub-" + m[1];
  if (/benjamin/.test(t)) return "Benjamín";
  if (/alevin/.test(t)) return "Alevín";
  if (/infantil/.test(t)) return "Infantil";
  if (/cadete/.test(t)) return "Cadete";
  if (/junior/.test(t)) return "Junior";
  if (/juvenil/.test(t)) return "Juvenil";
  return null;
}
const ageGroupFrom = (name) => ageGroupFromNorm(normName(name));
const isHcpCat = (c) => /\bhandicap\b|\bhcp\b|\bstableford\b/i.test(String(c || ""));
const isLicFmt = (s) => typeof s === "string" && /^[A-Z]{1,4}[-\dA-Z]{6,}$/.test(s.trim()) && !/^\d{2}-\d{2}-\d{2}/.test(s);
const isDateFmt = (s) => typeof s === "string" && /^\d{2}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(s);
function ncLicencia(p) {
  let lic = p.licencia ? String(p.licencia).trim() : "";
  const niv = p.nivel ? String(p.nivel).trim() : "";
  if (isDateFmt(lic) && isLicFmt(niv)) lic = niv;
  if (!lic || isDateFmt(lic)) return null;
  return lic;
}
function readJsonRaw(file) {
  const raw = fs.readFileSync(file, "utf-8");
  try { return JSON.parse(raw); }
  catch (e) {
    try { return JSON.parse(raw.slice(0, raw.lastIndexOf("}") + 1)); } catch (e2) { throw e; }
  }
}

const dateByKey = {};
try {
  const idx = readJsonRaw(IDX_FILE);
  for (const t of (idx.tournaments || [])) {
    const iso = t.dateStartIso || (t.dateStart ? parseEsDate(t.dateStart) : null);
    const yr = t.year != null ? t.year : (iso ? parseInt(iso.slice(0, 4), 10) : null);
    if (t.source != null && t.id != null) dateByKey[t.source + ":" + t.id] = { dateIso: iso, year: yr };
  }
  console.log("[index] " + Object.keys(dateByKey).length + " datas de torneio carregadas");
} catch (e) {
  console.warn("[index] sem datas de fallback: " + e.message);
}

const ncDateByTour = {};
(function () {
  const MES = { ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06", jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12" };
  let scopeFiles = [];
  try { scopeFiles = fs.readdirSync(__dirname).filter(function (f) { return /^nextcaddy-scope.*\.json$/.test(f); }); } catch (e) {}
  for (const f of scopeFiles) {
    try {
      const sc = JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf-8"));
      for (const t of (sc.tours || sc.tournaments || [])) {
        const id = t.tourId || t.id; if (!id || ncDateByTour[id]) continue;
        const m = /(\d{1,2})\s+(\w{3,4})\s+(\d{4})/.exec(t.date || "");
        if (m && MES[m[2].toLowerCase()]) ncDateByTour[id] = m[3] + "-" + MES[m[2].toLowerCase()] + "-" + m[1].padStart(2, "0");
      }
    } catch (e) {}
  }
})();

const byLicencia = {};
let totalRows = 0;
function add(lic, dedupKey, row) {
  if (!lic) return;
  const key = String(lic).trim().toUpperCase();
  if (!key) return;
  const arr = byLicencia[key] || (byLicencia[key] = []);
  const ix = arr.findIndex(function (r) { return r._k === dedupKey; });
  if (ix >= 0) {
    if (arr[ix].scoring === "hcp" && row.scoring !== "hcp") { row._k = dedupKey; arr[ix] = row; }
    return;
  }
  row._k = dedupKey;
  arr.push(row);
  totalRows++;
}

// 1) NextCaddy
let ncFiles = [];
try { ncFiles = fs.readdirSync(NC_DIR).filter(function (f) { return /^\d+\.json$/.test(f); }); } catch (e) {}
let ncKept = 0, ncErr = 0;
for (const f of ncFiles) {
  let d; try { d = readJsonRaw(path.join(NC_DIR, f)); } catch (e) { ncErr++; continue; }
  const tourId = d.tourId || parseInt(f, 10);
  const tName = (d.meta && d.meta.name) || ("NextCaddy " + tourId);
  const dateIso = (d.meta && d.meta.dateIso) || ncDateByTour[tourId] || (dateByKey["nextcaddy:" + tourId] || {}).dateIso || null;
  const year = dateIso ? parseInt(dateIso.slice(0, 4), 10) : ((dateByKey["nextcaddy:" + tourId] || {}).year != null ? dateByKey["nextcaddy:" + tourId].year : null);
  const lb = Array.isArray(d.leaderboard) ? d.leaderboard : [];
  let any = false;
  for (const block of lb) {
    const players = Array.isArray(block.players) ? block.players : [];
    if (!players.length) continue;
    let catName = block.categoryName || null;
    if (!catName && d.meta && Array.isArray(d.meta.categories) && typeof block.category === "number") catName = d.meta.categories[block.category] || null;
    if (!catName) catName = (players[0] && (players[0].nivel || players[0].catEdad)) || tName;
    const ageGroup = ageGroupFrom(catName) || ageGroupFrom(tName);
    const scoring = isHcpCat(catName) ? "hcp" : "scratch";
    const ageKey = (ageGroup || "x").replace(/[\s-]/g, "").toLowerCase();
    for (const p of players) {
      const lic = ncLicencia(p);
      if (!lic) continue;
      if (p.pos == null && p.total == null) continue;
      add(lic, "nc" + tourId + "|" + ageKey, {
        tid: "nc" + tourId + "_" + ageKey, src: "nextcaddy", id: String(tourId),
        name: tName, ageGroup: ageGroup, year: year, dateIso: dateIso,
        pos: p.pos != null ? p.pos : null, total: (typeof p.total === "number" ? p.total : null), toPar: (p.toPar == null ? null : p.toPar),
        scoring: scoring,
      });
      any = true;
    }
  }
  if (any) ncKept++;
}
console.log("[nextcaddy] " + ncKept + " torneios com resultado (erros de leitura: " + ncErr + ")");

// Gemeos RFEGolf<->LGS: nacional RFEGolf (resultados so PDF) que tem gemeo
// LiveGolfScoring (hbh + metros) -> o link do jogador aponta para o LGS rico.
let twinsByComp = {};
try { twinsByComp = (readJsonRaw(TWINS_FILE).twins) || {}; } catch (e) { /* sem mapa */ }

// 2) RFEGolf
let rfFiles = [];
try { rfFiles = fs.readdirSync(RFEG_DIR).filter(function (f) { return /^\d+\.json$/.test(f); }); } catch (e) {}
let rfKept = 0, rfErr = 0;
for (const f of rfFiles) {
  let d; try { d = readJsonRaw(path.join(RFEG_DIR, f)); } catch (e) { rfErr++; continue; }
  if (!d || !d.ok) continue;
  const compId = d.compId || parseInt(f, 10);
  const tName = (d.meta && d.meta.name) || ("RFEGolf " + compId);
  const dateIso = parseEsDate(d.meta && d.meta.dateStart) || (dateByKey["rfegolf:" + compId] || {}).dateIso || null;
  const year = dateIso ? parseInt(dateIso.slice(0, 4), 10) : ((dateByKey["rfegolf:" + compId] || {}).year != null ? dateByKey["rfegolf:" + compId].year : null);
  const nameToLic = {};
  const ins = d.inscritos || {};
  for (const list of Object.keys(ins)) {
    if (!Array.isArray(ins[list])) continue;
    for (const p of ins[list]) {
      if (p && p.licencia && p.name) { const n = normName(p.name); if (!nameToLic[n]) nameToLic[n] = String(p.licencia).trim(); }
    }
  }
  const groups = Array.isArray(d.results) ? d.results : [];
  let any = false;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const players = Array.isArray(g.players) ? g.players : [];
    if (!players.length) continue;
    const catLabel = g.categoria || g.label || tName;
    const ageGroup = ageGroupFrom(catLabel) || ageGroupFrom(tName);
    const scoring = (isHcpCat(g.label) || isHcpCat(g.categoria)) ? "hcp" : "scratch";
    const catKey = (normName(g.categoria || g.label || String(gi)).replace(/\s+/g, "").slice(0, 12)) || String(gi);
    for (const p of players) {
      const lic = nameToLic[normName(p.name)];
      if (!lic) continue;
      if (p.pos == null && p.total == null) continue;
      const twinLgs = twinsByComp[String(compId)];
      add(lic, "rfeg" + compId + "|" + catKey, {
        tid: "rfeg" + compId + "_" + catKey,
        src: twinLgs != null ? "livegolfscoring" : "rfegolf",
        id: twinLgs != null ? String(twinLgs) : String(compId),
        name: tName, ageGroup: ageGroup, year: year, dateIso: dateIso,
        pos: p.pos != null ? p.pos : null, total: (typeof p.total === "number" ? p.total : null), toPar: (p.toPar == null ? null : p.toPar),
        scoring: scoring,
      });
      any = true;
    }
  }
  if (any) rfKept++;
}
console.log("[rfegolf] " + rfKept + " torneios com resultado casado (erros de leitura: " + rfErr + ")");

// 3) FCG via fcg-rivals.json
let fcgRows = 0;
try {
  const d = readJsonRaw(FCG_RIVALS);
  for (const [tid, t] of Object.entries(d.torneios || {})) {
    const m = /^fcg([^_]+)_/.exec(tid);
    const id = m ? m[1] : null;
    const ageKey = normName(t.ageGroup || "x").replace(/[\s-]/g, "") || "x";
    for (const p of (t.players || [])) {
      const lic = p.license || p.lic || null;
      if (!lic) continue;
      if (p.p == null && p.t == null) continue;
      add(lic, "fcg" + id + "|" + ageKey, {
        tid: tid, src: "golfdirecto", id: id ? String(id) : null,
        name: t.name || tid, ageGroup: t.ageGroup || null, year: t.year != null ? t.year : null, dateIso: t.dateIso || null,
        pos: p.p != null ? p.p : null, total: p.t != null ? p.t : null, toPar: p.tp != null ? p.tp : null, scoring: "scratch",
      });
      fcgRows++;
    }
  }
  console.log("[fcg] " + fcgRows + " linhas");
} catch (e) { console.warn("[fcg] saltado: " + e.message); }

for (const key of Object.keys(byLicencia)) {
  const arr = byLicencia[key];
  arr.sort(function (a, b) { return (b.dateIso || "").localeCompare(a.dateIso || ""); });
  for (const r of arr) delete r._k;
}

const out = {
  generatedAt: new Date().toISOString(),
  source: "scripts/build-spain-player-results.js",
  totalLicencias: Object.keys(byLicencia).length,
  totalRows: totalRows,
  byLicencia: byLicencia,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
const sizeMB = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
console.log("Built: " + out.totalLicencias + " licencas, " + totalRows + " linhas -> " + path.relative(REPO, OUT) + " (" + sizeMB + " MB)");
