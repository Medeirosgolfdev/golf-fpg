#!/usr/bin/env node
/**
 * scripts/fix-jardas-golfgenius.js
 *
 * Correcção única (idempotente) das distâncias gravadas em JARDAS como se fossem
 * metros nas provas GolfGenius de campos britânicos e americanos (pendente de
 * 03/11/2026, resolvido a 04/11/2026). Confirmado no cartão dos clubes:
 *   - Conwy (Faldo 2026): GG 6667 «m» = 6667 jd no cartão (White, CR 71.9);
 *   - Porters Park (Reid Trophy 2026): GG 6198 «m»; os tees do clube vão de
 *     6066 a 6520 jd — 6198 m seriam 6778 jd, mais do que o tee mais comprido.
 * Ficheiros: england_* (England Golf — sempre jardas), reidtrophy_*, faldo2/3/6/7
 * (Reino Unido), uaworlds_*, uajt_*, optimist1–3_* (EUA). Ficam como estão: Faldo
 * Itália/Bélgica, Faldo Madeira, Evian, GolfBox (metros), condados ingleses (o
 * leitor já converte), Irlanda e Rock League (por confirmar).
 *
 * Daqui para a frente os leitores convertem sozinhos: `jardas: true` no
 * golfgenius-scope.json (scrape-golfgenius-node.js) e o scrape-england-golf.js.
 * Cada divisão/ficheiro convertido fica marcado `distancias: "convertidas de
 * jardas"` e não volta a ser convertido.
 *
 * Uso: node scripts/fix-jardas-golfgenius.js [--dry-run]
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");
const { jardasParaMetrosJob } = require("./scrape-golfgenius-node");

const DATA = path.join(__dirname, "..", "public", "data");
const ALVO = /^(england|reidtrophy|faldo[2367]|uaworlds|uajt|optimist[123])_.*\.json$/;
const MARCA = "convertidas de jardas";
const dry = process.argv.includes("--dry-run");

const m = (a) => (Array.isArray(a) ? a.map((y) => (Number.isFinite(y) && y > 0 ? Math.round(y * 0.9144) : y)) : a);
const soma = (a) => a.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);

/** Ficheiro England Golf (uma prova por ficheiro, distâncias no topo). */
function converterEngland(d) {
  if (d.distancias === MARCA) return false;
  if (Array.isArray(d.meters)) { d.meters = m(d.meters); d.metersTotal = soma(d.meters); }
  for (const c of d.courses || []) if (Array.isArray(c.meters)) { c.meters = m(c.meters); c.metersTotal = soma(c.meters); }
  for (const p of d.players || []) for (const r of p.rounds || []) {
    if (Array.isArray(r.metersPlayed)) r.metersPlayed = m(r.metersPlayed);
    if (Number.isFinite(r.metersTotalPlayed)) r.metersTotalPlayed = Math.round(r.metersTotalPlayed * 0.9144);
  }
  d.distancias = MARCA;
  return true;
}

let n = 0;
for (const f of fs.readdirSync(DATA).filter((x) => ALVO.test(x)).sort()) {
  const p = path.join(DATA, f);
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  const antes = JSON.stringify(d);
  if (Array.isArray(d.divisions)) jardasParaMetrosJob(d);
  else converterEngland(d);
  if (JSON.stringify(d) === antes) continue;
  n++;
  const tot = Array.isArray(d.divisions) ? (d.divisions.find((x) => Array.isArray(x.meters)) || {}).meters : d.meters;
  console.log(`  ${f}: ${Array.isArray(tot) ? `agora ${soma(tot)} m` : "convertido"}`);
  if (!dry) writeJsonAtomic(p, d);
}
console.log(`${n} ficheiro(s) ${dry ? "a converter (dry-run)" : "convertidos"}`);
