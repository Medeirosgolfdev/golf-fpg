#!/usr/bin/env node
/**
 * build-federados-lite.js — escreve `public/data/federados-lite.json`: do
 * `federados.json` (~19 MB, toda a base FPG) só o que as páginas de torneios
 * usam por federado — nascimento, sexo, país (fora PT) e HCP:
 *
 *   { "_gerado": "...", "b": { fed: "AAAA-MM-DD" }, "s": { fed: "M"|"F" },
 *     "c": { fed: "ES" }, "h": { fed: 12.3 } }
 *
 * Os quatro mapas são exactamente os que os hooks `useFedBirthdates`,
 * `useFedGenders`, `useFedCountries` e `useFedHcp` (ui/InscricoesComponents)
 * montavam do ficheiro inteiro — mesmos filtros. Quem precisa de nomes, clubes
 * ou do registo todo (/jogadores, Draws, nomes→federado da /rfeg, scripts)
 * continua a ler o `federados.json`.
 *
 * Gerado — NÃO vai para o git (.gitignore). Corre no `predev` e no `prebuild`
 * (o Vercel corre o `npm run build`). Sem data no ficheiro: só muda quando os
 * dados mudam. À mão: node scripts/build-federados-lite.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeAtomic } = require("./lib/atomic-write");

const DATA_DIR = path.join(__dirname, "..", "public", "data");
const IN_FILE = path.join(DATA_DIR, "federados.json");
const OUT_FILE = path.join(DATA_DIR, "federados-lite.json");

/** O registo do federados.json → os quatro mapas (as regras dos hooks). */
function buildLite(feds) {
  const out = { _gerado: "scripts/build-federados-lite.js", b: {}, s: {}, c: {}, h: {} };
  const items = (feds && (feds.players || feds.federados || feds.records || (Array.isArray(feds) ? feds : []))) || [];
  for (const p of items) {
    const fed = String(p.federation_code || p.fed || "");
    if (!fed) continue;
    const dob = p.birthdate || p.dt_aniv || p.dob || "";
    if (typeof dob === "string" && /^\d{4}-\d{2}-\d{2}/.test(dob)) out.b[fed] = dob.slice(0, 10);
    const g = String(p.gender || p.sex || "").toUpperCase();
    if (g === "M" || g === "F") out.s[fed] = g;
    const cc = String(p.country_prefix || "").toUpperCase().trim().slice(0, 2);
    if (cc && cc !== "PT" && !cc.startsWith("@")) out.c[fed] = cc;
    const raw = p.hcp_index ?? p.hcp_exact;
    const v = typeof raw === "number" ? raw : parseFloat(raw);
    if (Number.isFinite(v) && v <= 54) out.h[fed] = v;
  }
  return out;
}

function main() {
  // Ilegível é erro (nunca «vazio»): sem o ficheiro, o build pára.
  const lite = buildLite(JSON.parse(fs.readFileSync(IN_FILE, "utf8")));
  const n = Object.keys(lite.b).length;
  if (n === 0) {
    console.error("[federados-lite] federados.json sem datas de nascimento — não gravado");
    process.exit(1);
  }
  const json = JSON.stringify(lite) + "\n";
  const prev = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, "utf8") : null;
  if (prev !== json) writeAtomic(OUT_FILE, json);
  console.log(`[federados-lite] ${n} nascimentos · ${Object.keys(lite.s).length} sexos · ${Object.keys(lite.c).length} países · ${Object.keys(lite.h).length} HCP · ${(json.length / 1e6).toFixed(2)} MB`);
}

if (require.main === module) main();
module.exports = { buildLite };
