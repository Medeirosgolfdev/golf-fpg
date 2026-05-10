#!/usr/bin/env node
/**
 * build-kids-links.js — Gera/actualiza public/data/kids-links.json cruzando
 *                       jogadores FPG-federados estrangeiros com nomes que
 *                       aparecem em /kids (USKids, WJGC, EOWAGR, Doral).
 *
 * O kids-links.json alimenta o TournPName (src/ui/tournamentPrimitives.tsx):
 * cada entry liga um nome de jogador (não-PT) a um kidsHash que abre
 * /kids#hash em nova aba. Sem entry → não há ↗ Kids na scorecard.
 *
 * Estratégia (conservadora, evita falsos positivos com nomes comuns):
 *   1. Lê players-nationality.json — todos os federados FPG com país ≠ PT
 *   2. Lê uskids-member-history-slim.json — extrai memberId por nome (lookup
 *      preciso para USKids; serve como confirmação de "este nome existe nas
 *      torneios USKids tracked").
 *   3. Lê todos os JSONs de /kids (wjgc_*, eowagr*, ftm_doral_*,
 *      uskids_torneios_completos*, uskids-results.json, member-history-slim).
 *      Constrói um Set de nomes presentes nessas fontes.
 *   4. Para cada federado não-PT cujo nome está no /kids data:
 *      - Se há memberId match → entry com kidsHash=memberId (preferido — link
 *        directo via ID único, robusto a ortografia).
 *      - Senão, e o primeiro nome NÃO é "James/John/Robert/William/Oliver…"
 *        (filtro de nomes ingleses muito comuns que produzem falsos positivos)
 *        → entry com kidsHash=encodeURIComponent(name).
 *   5. Faz merge com entries manuais existentes em kids-links.json. Entries
 *      manuais têm precedência (não são sobrepostas).
 *
 * Uso:
 *   node scripts/build-kids-links.js                # actualiza in-place
 *   node scripts/build-kids-links.js --dry-run      # mostra mas não escreve
 *
 * Quando correr:
 *   - Depois de actualizar players-nationality.json (refresh de federados)
 *   - Depois de adicionar novos JSONs de torneios internacionais a public/data/
 *   - Quando user reportar que um jogador estrangeiro não tem ↗ na FPG
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");

const dryRun = process.argv.includes("--dry-run");

// ── Helpers ─────────────────────────────────────────────────────
const norm = s => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
const COMMON_FIRST = new Set([
  "james", "john", "robert", "william", "oliver", "matthew",
  "christopher", "paul", "simon", "michael", "david", "richard",
]);

function readJsonStripNulls(p) {
  const buf = fs.readFileSync(p);
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0) end--;
  return JSON.parse(buf.subarray(0, end).toString("utf8"));
}

// ── 1. Carregar nationality lookup ──────────────────────────────
const nat = readJsonStripNulls(path.join(DATA, "players-nationality.json"));
const byFed = nat.byFed || {};
const info = nat.info || {};
console.log(`Nationality lookup: ${Object.keys(byFed).length} federados`);

// ── 2. Carregar member-history-slim (memberId precision) ────────
const slim = readJsonStripNulls(path.join(DATA, "uskids-member-history-slim.json"));
const memberIdByName = new Map();
for (const memberId in (slim.jogadores || {})) {
  const j = slim.jogadores[memberId];
  if (j?.name) memberIdByName.set(norm(j.name), memberId);
}
console.log(`Member-history slim: ${memberIdByName.size} memberIds`);

// ── 3. Construir Set de nomes em /kids data ─────────────────────
const kidsFiles = fs.readdirSync(DATA).filter(f =>
  f.startsWith("wjgc_") ||
  f.startsWith("eowagr") ||
  f.startsWith("ftm_doral") ||
  f.startsWith("uskids_torneios_completos") ||
  f === "uskids-results.json" ||
  f === "uskids-member-history-slim.json"
);
const kidsNames = new Set();
for (const f of kidsFiles) {
  try {
    const txt = fs.readFileSync(path.join(DATA, f), "utf8");
    const re = /"name"\s*:\s*"([^"]+)"|"first"\s*:\s*"([^"]+)"\s*,\s*"last"\s*:\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(txt))) {
      if (m[1]) kidsNames.add(norm(m[1]));
      else if (m[2] && m[3]) kidsNames.add(norm(m[2] + " " + m[3]));
    }
  } catch (e) { /* ignore unreadable */ }
}
console.log(`Kids data: ${kidsNames.size} nomes únicos em ${kidsFiles.length} ficheiros`);

// ── 4. Identificar candidatos ────────────────────────────────────
const candidates = [];
for (const fed in byFed) {
  const cc = byFed[fed];
  if (!cc || cc === "PT") continue;
  if (!/^[A-Z]{2}$/.test(cc)) continue;             // skip artefactos
  const nm = info[fed]?.name;
  if (!nm) continue;
  const nname = norm(nm);
  if (!kidsNames.has(nname)) continue;
  const memberId = memberIdByName.get(nname);
  const firstWord = nname.split(" ")[0];
  const isUncommon = !COMMON_FIRST.has(firstWord);
  if (!memberId && !isUncommon) continue;            // filtro de comuns
  candidates.push({
    name: nm,
    kidsHash: memberId || encodeURIComponent(nm),
    country: cc,
    fed,
    hasMemberId: !!memberId,
  });
}
console.log(`Candidatos: ${candidates.length}`);

// ── 5. Merge com kids-links.json existente ──────────────────────
const klPath = path.join(DATA, "kids-links.json");
const kl = JSON.parse(fs.readFileSync(klPath, "utf8"));
const existing = new Set(kl.players.map(p => norm(p.name)));
const additions = candidates
  .filter(c => !existing.has(norm(c.name)))
  .sort((a, b) => a.name.localeCompare(b.name, "pt"));

console.log(`\nNovos a adicionar (${additions.length}):`);
for (const a of additions) {
  const tag = a.hasMemberId ? "[memberId]" : "[name-hash]";
  console.log(`  - ${a.name.padEnd(30)} ${a.country}  ${tag}`);
}

if (additions.length === 0) {
  console.log("\nNenhuma alteração necessária.");
  process.exit(0);
}

if (dryRun) {
  console.log("\n--dry-run: não escrito.");
  process.exit(0);
}

for (const a of additions) {
  kl.players.push({ name: a.name, kidsHash: a.kidsHash, country: a.country });
}
fs.writeFileSync(klPath, JSON.stringify(kl, null, 2) + "\n");
console.log(`\nkids-links.json actualizado. Total entries: ${kl.players.length}`);
