#!/usr/bin/env node
/**
 * compare-kids-tracked-vs-rivals.js — Diagnóstico do `kids-tracked-names.json`.
 *
 * Mostra o gap entre nomes no índice e os rivais REAIS que entram em /kids
 * (post-merge do buildAutoRivals). Cada nome no tracked-names que NÃO seja
 * rival real produz uma seta ↗ no FPGPage que leva a uma página vazia.
 *
 * Estratégia: simular as fases do KIDSdataLoader que CRIAM rivais (não as
 * que apenas enriquecem):
 *   - Phase 1 core: USKids/WJGC/EOWAGR/Doral/completos (com filtros de idade)
 *   - Phase 2: member-history-slim (Boys 9-13 ±1 escalão Manuel)
 *   - Phase 4: ffgolf-juniors-slim + gg_ffgolf_all
 *   - Phase 3 enrich: spain-players via fuzzy match (só os que casam)
 *
 * Saída:
 *   - Total nomes em kids-tracked-names.json
 *   - Total nomes que são rivais reais (estimativa conservadora)
 *   - Nomes "fantasma" (têm ↗ mas sem perfil)
 *
 * Uso:
 *   node scripts/compare-kids-tracked-vs-rivals.js
 *   node scripts/compare-kids-tracked-vs-rivals.js --top 30   (mostrar primeiros N fantasmas)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");

const args = process.argv.slice(2);
const topN = parseInt(args[args.indexOf("--top") + 1] || "20", 10);

const norm = s => (s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { return null; }
}

// ── 1. Conjunto de RIVAIS REAIS (estimativa próxima de buildAutoRivals) ──
const realRivals = new Set();

// 1a. USKids member-history-slim — fonte canónica de Boys 9-13
const slim = loadJson(path.join(DATA, "uskids-member-history-slim.json"));
if (slim?.jogadores) {
  for (const memberId in slim.jogadores) {
    const j = slim.jogadores[memberId];
    if (!j?.name) continue;
    realRivals.add(norm(j.name));
  }
  console.log(`[1a] member-history-slim: ${Object.keys(slim.jogadores).length} jogadores`);
}

// 1b. WJGC/EOWAGR/Doral/completos — todos os name fields (sem age filter
//      — o KIDSdataLoader filtra por escalão mas para ESTIMAR aceitamos todos)
const NAME_RE = /"(?:name)"\s*:\s*"([^"]+)"|"first"\s*:\s*"([^"]+)"\s*,\s*"last"\s*:\s*"([^"]+)"/g;
function scanFile(p) {
  const txt = fs.readFileSync(p, "utf8");
  const found = new Set();
  let m;
  while ((m = NAME_RE.exec(txt))) {
    const nm = m[1] || (m[2] && m[3] ? m[2] + " " + m[3] : null);
    if (!nm) continue;
    if (nm.length < 4 || nm.length > 80) continue;
    if (!/[a-zÀ-ſ]/i.test(nm)) continue;
    if (!/\s/.test(nm) && /golf|club|course|championship/i.test(nm)) continue;
    found.add(norm(nm));
  }
  return found;
}
for (const f of fs.readdirSync(DATA)) {
  if (!(f.startsWith("wjgc_") || f.startsWith("eowagr") ||
        f.startsWith("ftm_doral") || f.startsWith("uskids_torneios_completos") ||
        f === "uskids-results.json")) continue;
  const before = realRivals.size;
  for (const n of scanFile(path.join(DATA, f))) realRivals.add(n);
  console.log(`[1b] ${f}: +${realRivals.size - before} nomes (total ${realRivals.size})`);
}

// 1c. FFGolf juniors-slim
const ffSlim = loadJson(path.join(DATA, "ffgolf-juniors-slim.json"));
if (ffSlim?.jogadores) {
  let c = 0;
  for (const k in ffSlim.jogadores) {
    const j = ffSlim.jogadores[k];
    if (j?.name) { realRivals.add(norm(j.name)); c++; }
  }
  console.log(`[1c] ffgolf-juniors-slim: ${c} jogadores`);
}

// 1d. RFEG rivals (curados) + FCG rivals (curados)
for (const file of ["rfegolf-rivals.json", "fcg-rivals.json"]) {
  const d = loadJson(path.join(DATA, file));
  if (!d) continue;
  let c = 0;
  // formato pode variar — tentar várias keys
  const list = d.rivais || d.players || d.jogadores || d;
  if (Array.isArray(list)) {
    for (const r of list) {
      const n = r?.n || r?.name || r?.nombre;
      if (n) { realRivals.add(norm(n)); c++; }
    }
  } else if (typeof list === "object") {
    for (const k in list) {
      const r = list[k];
      const n = r?.n || r?.name || r?.nombre || k;
      if (n) { realRivals.add(norm(n)); c++; }
    }
  }
  console.log(`[1d] ${file}: ${c} jogadores`);
}

// 1e. gg_ffgolf_all — torneios FFG hospedados em GolfGenius
const ggFfg = loadJson(path.join(DATA, "gg_ffgolf_all.json"));
if (ggFfg) {
  const before = realRivals.size;
  // gg formato pode ser diverso
  const txt = JSON.stringify(ggFfg);
  let m;
  const re = /"(?:name|playerName)"\s*:\s*"([^"]+)"/g;
  while ((m = re.exec(txt))) {
    if (m[1] && m[1].length > 4 && m[1].length < 80 && /\s/.test(m[1])) {
      realRivals.add(norm(m[1]));
    }
  }
  console.log(`[1e] gg_ffgolf_all: +${realRivals.size - before} nomes`);
}

console.log(`\n══ RIVAIS REAIS estimados: ${realRivals.size} ══\n`);

// ── 2. Carregar kids-tracked-names.json (índice usado pelo FPGPage) ──
const tracked = loadJson(path.join(DATA, "kids-tracked-names.json"));
if (!tracked?.names) {
  console.error("kids-tracked-names.json não encontrado ou inválido.");
  process.exit(1);
}
const trackedSet = new Set(Object.keys(tracked.names));
console.log(`Tracked-names actual: ${trackedSet.size}`);

// ── 3. Diff ──
const ghosts = [...trackedSet].filter(n => !realRivals.has(n));
const missing = [...realRivals].filter(n => !trackedSet.has(n));

console.log(`\n══ ANÁLISE ══`);
console.log(`Tracked com perfil REAL:  ${trackedSet.size - ghosts.length} (${((1 - ghosts.length / trackedSet.size) * 100).toFixed(1)}%)`);
console.log(`Tracked SEM perfil (fantasma → ↗ vazio): ${ghosts.length}`);
console.log(`Rivais reais NÃO em tracked (perdem ↗): ${missing.length}`);

if (ghosts.length > 0) {
  console.log(`\n── Primeiros ${topN} fantasmas (têm ↗ mas sem perfil em /kids) ──`);
  for (const g of ghosts.slice(0, topN)) console.log("  - " + g);
}

if (missing.length > 0 && missing.length < 50) {
  console.log(`\n── Rivais reais que perdem ↗ no FPGPage ──`);
  for (const g of missing.slice(0, topN)) console.log("  - " + g);
}

console.log(`\nPara aplicar a limpeza (manter só nomes com perfil real):`);
console.log(`  Editar build-kids-tracked-names.js para usar a mesma lógica deste diagnóstico,`);
console.log(`  ou correr: node scripts/compare-kids-tracked-vs-rivals.js --rebuild`);
