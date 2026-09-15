#!/usr/bin/env node
/**
 * scripts/build-simulador-players.js
 *
 * Gera public/data/simulador-players.json — os jogadores do selector do
 * /simulador que NÃO estão no players.json, com nome, sexo, clube e HI do
 * cadastro FPG (federados.json). Poupa à página os 18 MB do cadastro.
 *
 * Duas fontes:
 *  - driveMadeira: quem jogou uma prova do Drive da Madeira (ccode 982) nos
 *    últimos N meses (default 12) — Drive Tour, ou Drive Challenge Sub-12/Sub-14;
 *    entram estejam ou não no players.json;
 *  - os escolhidos à mão de src/constants/simuladorPlayers.ts.
 *
 *   node scripts/build-simulador-players.js [--months 12]
 *
 * Corre no update-drive.yml e no update-federados.yml (as duas fontes).
 */
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");
const OUT = path.join(DATA, "simulador-players.json");
const MADEIRA_CCODE = "982";

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const months = Number(arg("--months", "12"));

/* Drive Tour: entram todos. Drive Challenge: só Sub-12 e Sub-14 — os mais
 * novos e os de 16/18 do Challenge não interessam ao selector (2026-09-15).
 * Os nomes da FPG variam ("Sub 12", "Sub12", "-Sub 14"). */
function entraNoSelector(name) {
  if (/drive\s*tour/i.test(name)) return true;
  return /drive\s*challenge/i.test(name) && /sub\s*1[24](?!\d)/i.test(name);
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

const playersRaw = readJson(path.join(DATA, "players.json"));
const inPlayers = new Set(
  (Array.isArray(playersRaw) ? playersRaw : Object.values(playersRaw)).map((p) => String(p.nfed)),
);

// Escolhidos à mão: os `fed: "…"` do ficheiro de constantes da app
const constSrc = fs.readFileSync(path.join(ROOT, "src", "constants", "simuladorPlayers.ts"), "utf8");
const named = [...constSrc.matchAll(/fed:\s*"(\d+)"/g)].map((m) => m[1]);

// Drive da Madeira nos últimos N meses
const since = new Date();
since.setMonth(since.getMonth() - months);
const sinceIso = since.toISOString().slice(0, 10);
const driveFeds = new Set();
for (const f of fs.readdirSync(DATA).filter((n) => /^drive-data-\d{4}-\d{2}\.json$/.test(n))) {
  for (const t of readJson(path.join(DATA, f)).tournaments || []) {
    if (String(t.ccode) !== MADEIRA_CCODE && !/madeira/i.test(t.name || "")) continue;
    if (!t.date || t.date < sinceIso) continue;
    if (!entraNoSelector(t.name || "")) continue;
    for (const p of t.players || []) {
      const fed = String(p.fedCode || "").trim();
      if (fed) driveFeds.add(fed);
    }
  }
}

const cadastro = new Map(readJson(path.join(DATA, "federados.json")).players.map((r) => [String(r.federation_code), r]));

const out = { months, players: {}, driveMadeira: [] };
const missing = [];
function add(fed) {
  if (inPlayers.has(fed)) return true;
  if (out.players[fed]) return true;
  const r = cadastro.get(fed);
  if (!r) { missing.push(fed); return false; }   // já não é federado activo
  out.players[fed] = {
    name: r.name,
    sex: r.gender === "M" || r.gender === "F" ? r.gender : null,
    hcp: r.hcp_exact ?? null,
    club: r.acronym || r.club_name || null,
  };
  return true;
}
named.forEach(add);
for (const fed of [...driveFeds].sort()) if (add(fed)) out.driveMadeira.push(fed);

writeJsonAtomic(OUT, out);
console.log(
  `✓ ${path.relative(ROOT, OUT)} — Drive Madeira desde ${sinceIso}: ${out.driveMadeira.length} jogadores · ` +
  `fora do players.json: ${Object.keys(out.players).length}`,
);
if (missing.length) console.log(`  ⚠ sem entrada no cadastro (inactivos?): ${missing.join(", ")}`);
