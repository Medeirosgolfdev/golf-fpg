#!/usr/bin/env node
/**
 * build-course-player-names.js
 *
 * Resolve TODOS os fed codes que aparecem em `_players` dos campos
 * (away-courses.json + master-courses.json) para o nome do jogador, e
 * escreve um mapa compacto em `public/data/course-player-names.json`.
 *
 * Motivo: o `_players` de cada campo é apenas `{ nfed: data }` — não guarda
 * o nome. Em runtime, a CamposPage resolvia o nome via players.json, mas os
 * jogadores que não estão em players.json (a maioria — federados que não
 * seguimos) apareciam como NÚMERO de federado em vez de nome. Este mapa
 * resolve esses códigos contra a base completa de federados, garantindo que
 * a UI mostra SEMPRE o nome.
 *
 * Fontes de nome, por ordem de prioridade:
 *   1. players.json          (jogadores seguidos)
 *   2. federados.json        (federados activos, ~16k)
 *   3. federados-inativos.json (federados inactivos, ~43k)
 *
 * Reproduzível: correr sempre que away-courses.json / master-courses.json
 * forem regenerados pelo pipeline.
 *
 *   node scripts/build-course-player-names.js
 */
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "public", "data");
const ARCHIVE = path.join(__dirname, "..", "data-archive");
// Lê de public/data, com fallback para data-archive (ficheiros pesados arquivados)
const readJson = (f) => {
  const primary = path.join(DATA, f);
  const fallback = path.join(ARCHIVE, f);
  const fp = fs.existsSync(primary) ? primary : fallback;
  return JSON.parse(fs.readFileSync(fp, "utf8"));
};

/** Recolhe todos os fed codes presentes em _players de um ficheiro de campos. */
function collectFedCodes(fileName) {
  let doc;
  try {
    doc = readJson(fileName);
  } catch {
    return new Set();
  }
  const courses = doc?.courses ?? [];
  const codes = new Set();
  for (const c of courses) {
    const pl = c?.master?._players;
    if (pl && typeof pl === "object") {
      for (const k of Object.keys(pl)) codes.add(k);
    }
  }
  return codes;
}

function main() {
  const codes = new Set([
    ...collectFedCodes("away-courses.json"),
    ...collectFedCodes("master-courses.json"),
  ]);

  // ── construir índices de nome ──────────────────────────────────────────
  const playerNames = {};
  try {
    const players = readJson("players.json");
    for (const [k, v] of Object.entries(players)) {
      if (v && typeof v === "object" && v.name) playerNames[k] = v.name;
    }
  } catch {/* opcional */}

  const fedNames = {};
  for (const file of ["federados.json", "federados-inativos.json"]) {
    let doc;
    try {
      doc = readJson(file);
    } catch {
      continue;
    }
    const list = Array.isArray(doc) ? doc : doc?.players ?? [];
    for (const p of list) {
      const code = p?.federation_code;
      if (code && p?.name && !(code in fedNames)) fedNames[code] = p.name;
    }
  }

  // ── resolver ────────────────────────────────────────────────────────────
  const map = {};
  const unresolved = [];
  for (const code of codes) {
    const name = playerNames[code] || fedNames[code];
    if (name) map[code] = name;
    else unresolved.push(code);
  }

  // saída ordenada por código para diffs estáveis
  const ordered = {};
  for (const k of Object.keys(map).sort((a, b) => a.localeCompare(b))) ordered[k] = map[k];

  const out = {
    generated: new Date().toISOString(),
    source: "players.json + federados.json + federados-inativos.json",
    total: Object.keys(ordered).length,
    names: ordered,
  };

  const outPath = path.join(DATA, "course-player-names.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 0) + "\n");

  console.log(`Códigos referenciados: ${codes.size}`);
  console.log(`Resolvidos: ${Object.keys(ordered).length} | Não resolvidos: ${unresolved.length}`);
  if (unresolved.length) console.log("Não resolvidos:", unresolved.sort().join(", "));
  console.log(`Escrito: public/data/course-player-names.json`);
}

main();
