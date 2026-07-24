/**
 * scripts/analyze-major-veterans.js  (ad-hoc, análise)
 *
 * Percorre TODOS os ficheiros de dados que alimentam a /major (mesma lógica de
 * leitura de build-major-catalog.js) e, por jogador (nome normalizado), conta:
 *  - nº de torneios internacionais em que apareceu (= "internacionalizações")
 *  - nº de ANOS distintos (regularidade / assiduidade)
 *  - nº de SÉRIES distintas (diversidade de circuitos)
 *  - lista dos torneios (série+ano) e países vistos.
 *
 * Cada jogador conta UMA vez por torneio-edição (dedup por nome, igual ao
 * veteranIndex do catálogo). Não faz merge cross-nome (homónimos/variações
 * ficam separados, tal como no catálogo).
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "public", "data");

function normName(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
/** Chave que funde "Apelido, Nome" ↔ "Nome Apelido" e ignora ordem dos tokens:
 *  ordena os tokens alfabeticamente. Reduz variantes de ordenação de nome. */
function nameKey(s) {
  const n = normName(s).replace(/,/g, " ").replace(/\s+/g, " ").trim();
  return n.split(" ").filter(Boolean).sort().join(" ");
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")); } catch { return null; }
}
function listFiles(re) {
  try { return fs.readdirSync(DATA_DIR).filter((f) => re.test(f)); } catch { return []; }
}
const hasScores = (p) => Array.isArray(p.rounds) && p.rounds.some((r) => Array.isArray(r.scores) && r.scores.length > 0);

// player -> record
const P = new Map();
function add(entryId, series, year, names) {
  const seen = new Set();
  for (const raw of names) {
    const k = nameKey(raw);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    let r = P.get(k);
    if (!r) { r = { name: raw, entries: new Set(), years: new Set(), series: new Set(), tourns: [] }; P.set(k, r); }
    // preferir a variante de nome mais longa (mais completa) para display
    if (String(raw).length > String(r.name).length) r.name = raw;
    r.entries.add(entryId);
    r.years.add(year);
    r.series.add(series);
    r.tourns.push(`${series} ${year}`);
  }
}

/* 1) BLUEGOLF: bjgt / eowagr / fcg / jwgc */
{
  const files = [
    ...listFiles(/^brjgt.*\.json$/).map((f) => ({ file: f, series: "bjgt" })),
    ...listFiles(/^eowagr25_contest\d+\.json$/).map((f) => ({ file: f, series: "eowagr" })),
    ...listFiles(/^fcg\d+_.*\.json$/).map((f) => ({ file: f, series: "fcg" })),
    ...listFiles(/^jwgc\d+_.*\.json$/).map((f) => ({ file: f, series: "jwgc" })),
  ];
  const byKey = new Map();
  for (const { file, series } of files) {
    const d = readJson(file);
    if (!d || !Array.isArray(d.players)) continue;
    const year = Number(d.year);
    if (!year) continue;
    const key = `${series}:${year}`;
    if (!byKey.has(key)) byKey.set(key, { series, year, divs: [] });
    byKey.get(key).divs.push(d);
  }
  for (const [key, { series, year, divs }] of byKey) {
    const valid = divs.flatMap((d) => d.players.filter((p) => p.total != null && Array.isArray(p.rounds) && p.rounds.length > 0));
    add(key, series, year, valid.map((p) => p.name));
  }
}

/* 2) DORAL */
for (const file of listFiles(/^ftm_doral_\d+\.json$/)) {
  const d = readJson(file);
  if (!d || !Array.isArray(d.divisions)) continue;
  const year = Number(d.year) || Number((file.match(/(\d{4})/) || [])[1]);
  if (!year) continue;
  const players = d.divisions.flatMap((dv) => dv.players || []);
  const valid = players.filter((p) => p.total != null);
  add(`doral:${year}`, "doral", year, valid.map((p) => p.name));
}

/* 3) GOLFGENIUS / JobFile */
const GG_SOURCES = [
  { prefix: "orangebowl_", source: "job", union: false },
  { prefix: "ftm_fm_", source: "fm", union: true },
  { prefix: "fsga_", source: "fsga", union: true },
  { prefix: "uajt_", source: "uajt", union: true },
  { prefix: "mexnacional_", source: "mexnacional", union: true },
  { prefix: "uaworlds_", source: "uaworlds", union: true },
  { prefix: "coc_", source: "coc", union: true },
  { prefix: "icopa_", source: "icopa", union: true },
  { prefix: "interzonas_", source: "interzonas", union: true },
  { prefix: "avtrophy_", source: "avtrophy", union: true },
  { prefix: "ebtc2_", source: "ebtc2", union: true },
  { prefix: "egtc_", source: "egtc", union: true },
  { prefix: "elg_", source: "elg", union: true },
  { prefix: "eatc_", source: "eatc", union: true },
  { prefix: "eatc2_", source: "eatc2", union: true },
  { prefix: "eym_", source: "eym", union: true },
];
for (const src of GG_SOURCES) {
  const re = new RegExp(`^${src.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\d+\\.json$`);
  for (const file of listFiles(re)) {
    const f = readJson(file);
    if (!f || !Array.isArray(f.divisions)) continue;
    const year = Number(f.year) || Number((file.match(/(\d{4})/) || [])[1]);
    if (!year) continue;
    const players = f.divisions.flatMap((dv) => dv.players || []);
    const valid = players.filter((p) => (p.total != null) || (src.union && hasScores(p)));
    if (valid.length === 0) continue;
    add(`${src.source}:${year}`, src.source, year, valid.map((p) => p.name));
  }
}

// Construir ranking
const rows = [...P.values()].map((r) => ({
  name: r.name,
  torneios: r.entries.size,
  anos: r.years.size,
  series: r.series.size,
  anosSpan: Math.max(...r.years) - Math.min(...r.years),
  anosList: [...r.years].sort((a, b) => a - b),
  seriesList: [...r.series],
  detalhe: r.tourns.sort(),
}));

console.log(`Total jogadores distintos na /major: ${rows.length}`);
console.log(`Total torneios-edição: ${new Set([...P.values()].flatMap((r) => [...r.entries])).size}`);

console.log("\n═══ TOP 25 — MAIS INTERNACIONALIZAÇÕES (nº de torneios internacionais) ═══");
const byTorneios = [...rows].sort((a, b) => b.torneios - a.torneios || b.anos - a.anos || a.name.localeCompare(b.name));
byTorneios.slice(0, 25).forEach((r, i) => {
  console.log(`${String(i + 1).padStart(2)}. ${r.name.padEnd(32)} ${r.torneios} torneios · ${r.anos} anos · ${r.series} séries  [${r.detalhe.join(", ")}]`);
});

console.log("\n═══ TOP 25 — MAIS ASSÍDUOS (nº de anos distintos, depois torneios) ═══");
const byAnos = [...rows].sort((a, b) => b.anos - a.anos || b.torneios - a.torneios || a.name.localeCompare(b.name));
byAnos.slice(0, 25).forEach((r, i) => {
  console.log(`${String(i + 1).padStart(2)}. ${r.name.padEnd(32)} ${r.anos} anos (${r.anosList.join("/")}) · ${r.torneios} torneios · ${r.series} séries`);
});

console.log("\n═══ TOP 15 — MAIS SÉRIES/CIRCUITOS DISTINTOS ═══");
const bySeries = [...rows].sort((a, b) => b.series - a.series || b.torneios - a.torneios || a.name.localeCompare(b.name));
bySeries.slice(0, 15).forEach((r, i) => {
  console.log(`${String(i + 1).padStart(2)}. ${r.name.padEnd(32)} ${r.series} séries [${r.seriesList.join(", ")}] · ${r.torneios} torneios`);
});

// Contexto: Manuel + posição de alguns nomes
console.log("\n═══ CONTEXTO ═══");
const rank = [...rows].sort((a, b) => b.torneios - a.torneios || b.anos - a.anos || a.name.localeCompare(b.name));
function show(substr) {
  const idx = rank.findIndex((r) => normName(r.name).includes(substr));
  if (idx < 0) { console.log(`  (não encontrado: ${substr})`); return; }
  const r = rank[idx];
  console.log(`  #${idx + 1} ${r.name} — ${r.torneios} torneios · ${r.anos} anos · ${r.series} séries [${r.detalhe.join(", ")}]`);
}
["medeiros", "dmitrii elchaninov", "morgan chaney", "nicolas pape"].forEach(show);
console.log(`\n  Distribuição: jogadores com ≥2 torneios = ${rows.filter(r=>r.torneios>=2).length}; com 1 só = ${rows.filter(r=>r.torneios===1).length}`);
