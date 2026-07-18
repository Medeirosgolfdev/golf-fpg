#!/usr/bin/env node
/**
 * fix-wjgc-override-keys.js — repara os sourceKeys `wjgc:` do
 * `juniors-overrides.json` depois de o país de um jogador mudar nos ficheiros
 * bluegolf.
 *
 * O adapter `wjgc` (BlueGolf: brjgt/eowagr/fcg/jwgc) não tem chave forte — o
 * sourceKey é `{nome minúsculo}|{ISO2 do país}`. Quando a resolução de país
 * muda (ex: "Bangkok, CA" deixou de dar 🇺🇸 e passou a Tailândia), a chave muda
 * com ela e os `forceMerge`/`notDuplicates` que a citavam deixam de casar — o
 * agregador avisa "forceMerge: alguns sourceKeys não encontrados" e o merge
 * silenciosamente não acontece.
 *
 * Este script recalcula as chaves a partir dos ficheiros actuais e reescreve as
 * que mudaram, casando por NOME (só quando o nome resolve para exactamente uma
 * chave — ambíguos ficam para revisão manual).
 *
 *   node scripts/fix-wjgc-override-keys.js [--dry-run]
 */
const fs = require("fs");
const path = require("path");
const { DATA, DATA_DIR, readJsonSafe, listFiles } = require("./aggregator/util/io");
const { displayName, countryToIso2 } = require("./aggregator/util/names");
const { writeJsonAtomic } = require("./lib/atomic-write");

const OVERRIDES = path.join(DATA_DIR, "juniors-overrides.json");
const dryRun = process.argv.includes("--dry-run");

// Chaves wjgc actuais, indexadas por nome (mesma fórmula do adapter).
const byName = new Map(); // nome minúsculo -> Set<key>
const allKeys = new Set();
for (const pat of [DATA.brjgtPattern, DATA.bjgtPattern, DATA.fcgWorldPattern, DATA.jwgcPattern, DATA.eowagrPattern].filter(Boolean)) {
  for (const file of listFiles(DATA_DIR, pat)) {
    const d = readJsonSafe(file, null);
    for (const p of (d && d.players) || []) {
      const name = displayName(p.name || "");
      if (!name) continue;
      const key = `${name.toLowerCase()}|${countryToIso2(p.country || "") || ""}`;
      allKeys.add(key);
      const n = name.toLowerCase();
      if (!byName.has(n)) byName.set(n, new Set());
      byName.get(n).add(key);
    }
  }
}

const ov = JSON.parse(fs.readFileSync(OVERRIDES, "utf8"));
const fixed = [], ambiguous = [], gone = [];

/** Percorre qualquer array de sourceKeys dentro do JSON de overrides. */
function repair(arr) {
  for (let i = 0; i < arr.length; i++) {
    const k = arr[i];
    if (typeof k !== "string" || !k.startsWith("wjgc:")) continue;
    const bare = k.slice(5);
    if (allKeys.has(bare)) continue; // ainda válida
    const name = bare.split("|")[0];
    const cands = [...(byName.get(name) || [])];
    if (cands.length === 1) {
      fixed.push(`${k} → wjgc:${cands[0]}`);
      arr[i] = `wjgc:${cands[0]}`;
    } else if (cands.length > 1) {
      ambiguous.push(`${k} → ${cands.map((c) => "wjgc:" + c).join(" | ")}`);
    } else {
      gone.push(k);
    }
  }
}

function walk(node) {
  if (Array.isArray(node)) {
    if (node.every((x) => typeof x === "string")) repair(node);
    else node.forEach(walk);
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node)) walk(v);
  }
}
walk(ov);

if (fixed.length) console.log("Corrigidas:\n" + fixed.map((s) => "  " + s).join("\n"));
if (ambiguous.length) console.log("\n⚠ Ambíguas (rever à mão):\n" + ambiguous.map((s) => "  " + s).join("\n"));
if (gone.length) console.log("\n⚠ Sem correspondência nos dados actuais:\n" + gone.map((s) => "  " + s).join("\n"));
if (fixed.length && !dryRun) writeJsonAtomic(OVERRIDES, ov);
console.log(`\n${dryRun ? "[dry-run] " : ""}${fixed.length} corrigidas · ${ambiguous.length} ambíguas · ${gone.length} sem match`);
