#!/usr/bin/env node
/**
 * build-kids-tracked-names.js — Gera public/data/kids-tracked-names.json,
 * índice fino com TODOS os nomes que aparecem em alguma fonte /kids
 * (USKids, WJGC, EOWAGR, Doral, FFG França, RFEG Espanha, FCG Catalunha,
 * NextCaddy, FPG Nacionais).
 *
 * Uso:
 *   node scripts/build-kids-tracked-names.js
 *   node scripts/build-kids-tracked-names.js --dry-run
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

// Top-level files (USKids, WJGC/EOWAGR/Doral, FPG nacionais, slims)
const topFiles = fs.readdirSync(DATA).filter(f =>
  f.startsWith("wjgc_") ||
  f.startsWith("eowagr") ||
  f.startsWith("ftm_doral") ||
  f.startsWith("uskids_torneios_completos") ||
  f === "uskids-results.json" ||
  f === "uskids-member-history-slim.json" ||
  f === "fpg-nacionais-historico.json" ||
  f === "ffgolf-juniors-slim.json" ||
  f === "spain-players.json" ||
  f === "rfegolf-rivals.json" ||
  f === "fcg-rivals.json" ||
  f === "gg_ffgolf_all.json"
);

const subDirs = ["ffgolf", "ffgolf-resultats", "rfegolf-livegolfscoring",
                 "rfegolf-resultats", "nextcaddy", "fcg"];
const subFiles = [];
for (const d of subDirs) {
  const dirPath = path.join(DATA, d);
  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    for (const f of fs.readdirSync(dirPath)) {
      if (f.endsWith(".json")) subFiles.push(d + "/" + f);
    }
  }
}

const sources = [...topFiles, ...subFiles];
console.log(`Fontes: ${topFiles.length} top-level + ${subFiles.length} em subdirs = ${sources.length}`);

const names = new Map();

// 1. Member-history-slim — fonte mais rica de memberIds
try {
  const slim = JSON.parse(fs.readFileSync(path.join(DATA, "uskids-member-history-slim.json"), "utf8"));
  for (const memberId in (slim.jogadores || {})) {
    const j = slim.jogadores[memberId];
    if (j && j.name) names.set(norm(j.name), memberId);
  }
  console.log("Member-history slim: " + names.size + " memberIds");
} catch (e) {
  console.log("Slim member-history não disponível: " + e.message);
}

// 2. Outras fontes — vários formatos de nome
const otherFiles = sources.filter(f => f !== "uskids-member-history-slim.json");
let extraNames = 0;
const NAME_RE = /"(?:name|nome|playerName|player_name|Nombre)"\s*:\s*"([^"]+)"|"first"\s*:\s*"([^"]+)"\s*,\s*"last"\s*:\s*"([^"]+)"|"prenom"\s*:\s*"([^"]+)"\s*,\s*"nom"\s*:\s*"([^"]+)"|"nom"\s*:\s*"([^"]+)"\s*,\s*"prenom"\s*:\s*"([^"]+)"/g;
for (const f of otherFiles) {
  try {
    const txt = fs.readFileSync(path.join(DATA, f), "utf8");
    let m;
    while ((m = NAME_RE.exec(txt))) {
      const nm = m[1]
        || (m[2] && m[3] ? m[2] + " " + m[3] : null)
        || (m[4] && m[5] ? m[4] + " " + m[5] : null)
        || (m[6] && m[7] ? m[7] + " " + m[6] : null);
      if (!nm) continue;
      if (nm.length < 4 || nm.length > 80) continue;
      if (!/[a-zÀ-ſ]/i.test(nm)) continue;
      // Skip names without spaces that look like venue/club
      if (!/\s/.test(nm) && /golf|club|course|championship|tournament/i.test(nm)) continue;
      const key = norm(nm);
      if (!names.has(key)) {
        names.set(key, null);
        extraNames++;
      }
    }
  } catch (e) { /* ignore */ }
}
console.log("Outros JSONs (" + otherFiles.length + "): +" + extraNames + " nomes");
console.log("Total nomes: " + names.size);

const obj = {};
for (const [k, v] of names) obj[k] = v;

const json = JSON.stringify({
  _comment: "Gerado por scripts/build-kids-tracked-names.js. Lookup por nome normalizado (lowercase, espaços únicos, sem diacríticos) → memberId USKids se conhecido, senão null.",
  generatedAt: new Date().toISOString(),
  totalNames: names.size,
  names: obj,
}, null, 0);

if (dryRun) {
  console.log("\n--dry-run. Ficheiro teria ~" + (json.length / 1024).toFixed(1) + " KB.");
  process.exit(0);
}

fs.writeFileSync(OUT, json);
console.log("\n" + OUT + " escrito (" + (json.length / 1024).toFixed(1) + " KB).");
