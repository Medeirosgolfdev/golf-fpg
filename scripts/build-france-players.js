#!/usr/bin/env node
/**
 * build-france-players.js — Gera public/data/france-players.json
 *
 * Slim file com metadata dos jogadores FR (license, club, region, hcp, sex)
 * extraída dos ficheiros FFG resultats. Análogo ao spain-players.json.
 *
 * Usado pelo KIDSdataLoader (Phase 5: france-enrich) para enriquecer rivais.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");
const OUT = path.join(DATA, "france-players.json");

const norm = s => (s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

const players = new Map(); // license → { license, name, sex, hcp, club, region, country, glfLic, dob? }

function add(rec) {
  if (!rec.license) return;
  const ex = players.get(rec.license);
  if (!ex) { players.set(rec.license, { ...rec }); return; }
  // Merge: preferir valores mais recentes/completos
  for (const k of Object.keys(rec)) {
    if (rec[k] != null && rec[k] !== "") ex[k] = rec[k];
  }
}

// FFG resultats — formato: { tournaments | series.players[{name, nameNom, namePrenom, sex, nationality, license, hcp, club, region}] }
function extractFromBlocks(txt) {
  // Captura cada bloco de jogador (até 600 chars de contexto)
  const RE = /\{[^{}]{0,1500}?"name"\s*:\s*"([^"]+)"[^{}]{0,1500}?\}/g;
  let m;
  while ((m = RE.exec(txt))) {
    const block = m[0];
    const name = m[1];
    const nomMatch = block.match(/"nameNom"\s*:\s*"([^"]+)"/);
    const prenomMatch = block.match(/"namePrenom"\s*:\s*"([^"]+)"/);
    const sexMatch = block.match(/"sex"\s*:\s*"([MF])"/);
    const natMatch = block.match(/"nationality"\s*:\s*"([A-Z]{2,3})"/);
    const licMatch = block.match(/"license"\s*:\s*"([^"]+)"/);
    const glfMatch = block.match(/"glfLic"\s*:\s*"([^"]+)"/);
    const hcpMatch = block.match(/"hcp"\s*:\s*([-\d.]+)/);
    const clubMatch = block.match(/"club"\s*:\s*"([^"]+)"/);
    const regionMatch = block.match(/"region"\s*:\s*"([^"]+)"/);
    if (!licMatch) continue;
    // Nome canónico "Prenom Apelido"
    const fullName = (prenomMatch && nomMatch)
      ? prenomMatch[1] + " " + nomMatch[1].replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase())
      : name;
    add({
      license: licMatch[1],
      name: fullName,
      sex: sexMatch?.[1],
      country: natMatch?.[1],
      glfLic: glfMatch?.[1],
      hcp: hcpMatch ? parseFloat(hcpMatch[1]) : undefined,
      club: clubMatch?.[1],
      region: regionMatch?.[1],
    });
  }
}

// Iterate ffgolf-resultats subdir
const dir = path.join(DATA, "ffgolf-resultats");
let nFiles = 0;
if (fs.existsSync(dir)) {
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    nFiles++;
    try {
      const txt = fs.readFileSync(path.join(dir, f), "utf8");
      extractFromBlocks(txt);
    } catch (e) { /* ignore */ }
  }
}

console.log(`Scaneados ${nFiles} ficheiros FFG resultats`);
console.log(`Total jogadores únicos (por license): ${players.size}`);

// Output: byName (normalized) → record + byLicense → record
const byName = {};
const byLicense = {};
for (const [lic, r] of players) {
  byLicense[lic] = r;
  if (r.name) {
    const k = norm(r.name);
    if (!byName[k]) byName[k] = r;
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  source: "scripts/build-france-players.js",
  totalPlayers: players.size,
  byName,
  byLicense,
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${OUT} escrito (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB).`);
