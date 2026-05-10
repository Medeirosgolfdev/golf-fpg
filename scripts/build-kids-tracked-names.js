#!/usr/bin/env node
/**
 * build-kids-tracked-names.js v3 — Gera public/data/kids-tracked-names.json
 *
 * USA APENAS as mesmas fontes que o KIDSdataLoader carrega para criar rivais.
 * Sem isso, o ↗ Kids aparece em jogadores que não estão em /kids.
 *
 * Fases (espelham buildAutoRivals em src/data/KIDSdataLoader.ts):
 *   - phase 1 core: USKids/WJGC/EOWAGR/Doral/completos/results
 *   - phase 2 history: uskids-member-history-slim.json
 *   - phase 2.5 esp: rfegolf-rivals.json (curado)
 *   - phase 2.6 fcg: fcg-rivals.json (curado)
 *   - phase 4 ffgolf: ffgolf-juniors-slim + gg_champ/internationaux
 *
 * NÃO inclui (são fontes ENRICH-ONLY que não criam rivais):
 *   - jovens_*.json, pull-torneios*.json, fpg-nacionais-historico.json
 *   - spain-players.json (50K federados, só ~1292 viram rivais via match)
 *   - subdirs ffgolf-resultats/, rfegolf-livegolfscoring/, nextcaddy/, fcg/, etc.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");
const OUT = path.join(DATA, "kids-tracked-names.json");
const dryRun = process.argv.includes("--dry-run");

const norm = s => (s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { return null; }
}

const names = new Map();   // normName → memberId | null
const meta = new Map();    // normName → { sex?, country? }

function addName(displayName, memberId) {
  if (!displayName) return false;
  const k = norm(displayName);
  if (!k) return false;
  if (memberId) names.set(k, memberId);
  else if (!names.has(k)) names.set(k, null);
  return true;
}

function setMeta(displayName, fields) {
  const k = norm(displayName);
  if (!k) return;
  const ex = meta.get(k) || {};
  for (const key in fields) {
    if (fields[key] && !ex[key]) ex[key] = fields[key];
  }
  meta.set(k, ex);
}

// Filtro: nome plausível de jogador (não categoria/curso/torneio)
const SKIP_RE = /\b(golf|club|course|championship|tournament|copa|campionat|torneo|prova|circuito|trophy|trofeo|cadete|infantil|alev[íi]n|benjam[íi]n|juvenil|juniors?|sub[\s-]?\d|u\d{1,2}|escalao|categoria|category|handicap|scratch|masculin[ao]|femenin[ao]|general)\b/i;
function isPlayerName(nm) {
  if (!nm) return false;
  if (nm.length < 4 || nm.length > 80) return false;
  if (!/[a-zÀ-ſ]/i.test(nm)) return false;
  if (!/\s/.test(nm)) return false;
  if (SKIP_RE.test(nm)) return false;
  return true;
}

// 1. USKids member-history-slim — fonte canónica de Boys 9-13
const slim = loadJson(path.join(DATA, "uskids-member-history-slim.json"));
if (slim?.jogadores) {
  for (const memberId in slim.jogadores) {
    const j = slim.jogadores[memberId];
    if (j?.name) addName(j.name, memberId);
  }
  console.log(`[1] member-history-slim: ${names.size} memberIds`);
}

// 2. USKids/WJGC/EOWAGR/Doral/completos/results — só TOP-LEVEL files
const NAME_RE_GENERIC = /"name"\s*:\s*"([^"]+)"|"first"\s*:\s*"([^"]+)"\s*,\s*"last"\s*:\s*"([^"]+)"/g;
function scanGeneric(p) {
  const txt = fs.readFileSync(p, "utf8");
  let m;
  while ((m = NAME_RE_GENERIC.exec(txt))) {
    const nm = m[1] || (m[2] && m[3] ? m[2] + " " + m[3] : null);
    if (isPlayerName(nm)) addName(nm);
  }
}
const phase1Files = fs.readdirSync(DATA).filter(f =>
  f.startsWith("wjgc_") ||
  f.startsWith("eowagr") ||
  f.startsWith("ftm_doral") ||
  f.startsWith("uskids_torneios_completos") ||
  f === "uskids-results.json"
);
const before1 = names.size;
for (const f of phase1Files) scanGeneric(path.join(DATA, f));
console.log(`[2] Phase 1 core (${phase1Files.length} ficheiros): +${names.size - before1}`);

// 3. FFGolf juniors-slim (curado) + meta sex
const ffSlim = loadJson(path.join(DATA, "ffgolf-juniors-slim.json"));
if (ffSlim?.tournaments) {
  // formato: { tournaments: [ { players: [{ name, sex?, ... }] } ] }
  let c = 0;
  for (const t of ffSlim.tournaments) {
    for (const p of (t.players || [])) {
      if (p?.name && isPlayerName(p.name)) {
        addName(p.name);
        if (p.sex === "M" || p.sex === "F") setMeta(p.name, { sex: p.sex });
        if (p.flag) setMeta(p.name, { country: p.flag });
        c++;
      }
    }
  }
  console.log(`[3] ffgolf-juniors-slim: +${c} (alguns dups)`);
}

// 4. gg_champ_france_benjamins/benjamines/internationaux_u18 — FFG GolfGenius
const ggFiles = ["gg_champ_france_benjamins_2025.json", "gg_champ_france_benjamines_2025.json", "gg_internationaux_france_u18_gar_ons_2026.json"];
for (const f of ggFiles) {
  const d = loadJson(path.join(DATA, f));
  if (!d) continue;
  const txt = JSON.stringify(d);
  let m;
  const re = /"(?:name|playerName)"\s*:\s*"([^"]+)"/g;
  while ((m = re.exec(txt))) {
    if (isPlayerName(m[1])) addName(m[1]);
  }
}

// 5. RFEG rivals + FCG rivals (curados) — formato {torneios:{[tid]:{players:[{n,...}]}}}
for (const file of ["rfegolf-rivals.json", "fcg-rivals.json"]) {
  const d = loadJson(path.join(DATA, file));
  if (!d?.torneios) continue;
  const before = names.size;
  for (const tid in d.torneios) {
    const t = d.torneios[tid];
    for (const r of (t.players || [])) {
      // Format "GARCIA TEROL, Adriana" → "Adriana Garcia Terol"
      let n = r?.n || r?.name || r?.nombre;
      if (!n) continue;
      const m = String(n).match(/^([A-Z][A-Za-z\s'-]+),\s*(.+)$/);
      if (m) n = m[2].trim() + " " + m[1].trim().replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase());
      if (isPlayerName(n)) {
        addName(n);
        if (r.sex === "M" || r.sex === "F") setMeta(n, { sex: r.sex });
        if (r.dob) setMeta(n, { dob: r.dob });
      }
    }
  }
  console.log(`[5] ${file}: +${names.size - before}`);
}

// 6. FFG resultats meta — usar APENAS para enriquecer com sex/country os
//    nomes que JÁ estão em `names` (das fontes acima). Não adiciona novos nomes.
//    Isto resolve o caso Castro Marim onde os jogadores FFG vêm de pull-
//    torneios002 mas o sex está no FFG resultats.
const ffgolfResultats = path.join(DATA, "ffgolf-resultats");
if (fs.existsSync(ffgolfResultats)) {
  const FFG_BLOCK = /"name"\s*:\s*"([^"]+)"\s*,[^{}]{0,400}?"nameNom"\s*:\s*"[^"]+"\s*,\s*"namePrenom"\s*:\s*"([^"]+)"[^{}]{0,400}?"sex"\s*:\s*"([MF])"(?:[^{}]{0,300}?"nationality"\s*:\s*(?:"([A-Z]{2,3})"|null))?/g;
  let enriched = 0;
  for (const f of fs.readdirSync(ffgolfResultats)) {
    if (!f.endsWith(".json")) continue;
    try {
      const txt = fs.readFileSync(path.join(ffgolfResultats, f), "utf8");
      let mm;
      while ((mm = FFG_BLOCK.exec(txt))) {
        const tokens = mm[1].split(" ");
        const surname = tokens.length > 1 ? tokens.slice(0, -1).join(" ") : tokens[0];
        const fullName = mm[2] + " " + surname;
        const k = norm(fullName);
        // Só enrich se o nome JÁ está em `names` (i.e. foi criado por outras fontes)
        if (names.has(k)) {
          setMeta(fullName, { sex: mm[3], country: mm[4] || undefined });
          enriched++;
        }
      }
    } catch (e) { /* ignore */ }
  }
  console.log(`[6] ffgolf-resultats meta enrich: ${enriched} matches`);
}

console.log(`\n══ Total nomes (rivais reais): ${names.size} ══`);

const obj = {};
for (const [k, v] of names) obj[k] = v;

const metaObj = {};
let metaCount = 0;
for (const [k, m] of meta) {
  if (names.has(k) && (m.sex || m.country)) {
    metaObj[k] = m;
    metaCount++;
  }
}
console.log(`Meta (sex/country): ${metaCount} entries`);

const json = JSON.stringify({
  _comment: "Índice de rivais REAIS de /kids (mesmas fontes do KIDSdataLoader). Lookup: nome normalizado → memberId USKids ou null. Meta contém sex/country quando disponível.",
  generatedAt: new Date().toISOString(),
  totalNames: names.size,
  names: obj,
  meta: metaObj,
}, null, 0);

if (dryRun) {
  console.log(`\n--dry-run. ${(json.length / 1024).toFixed(1)} KB.`);
  process.exit(0);
}
fs.writeFileSync(OUT, json);
console.log(`\n${OUT} escrito (${(json.length / 1024).toFixed(1)} KB).`);
