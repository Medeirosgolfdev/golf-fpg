#!/usr/bin/env node
/**
 * build-course-player-names.js
 *
 * Resolve TODOS os fed codes que aparecem em `_players` dos campos
 * (away-courses.json + master-courses.json + course-players.json) para o
 * nome do jogador, e escreve um mapa compacto em
 * `public/data/course-player-names.json`.
 *
 * ⚠ Os campos PORTUGUESES guardam o `_players` em course-players.json (o
 * master-courses.json tem _players vazio para eles). Sem ler esse ficheiro,
 * todos os jogadores de campos PT apareciam como NÚMERO de federado.
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

/** Recolhe fed codes de course-players.json — `_players` dos campos PT.
 *  Formato: { players: { [courseKey]: { [fed]: rounds } } }. É AQUI que vivem
 *  os jogadores dos campos portugueses do master (o master-courses.json tem
 *  _players vazio para esses), por isso sem este passo apareciam como número. */
function collectFromCoursePlayers(fileName) {
  let doc;
  try {
    doc = readJson(fileName);
  } catch {
    return new Set();
  }
  const byCourse = doc?.players ?? {};
  const codes = new Set();
  for (const perCourse of Object.values(byCourse)) {
    if (perCourse && typeof perCourse === "object") {
      for (const k of Object.keys(perCourse)) codes.add(k);
    }
  }
  return codes;
}

function main() {
  const codes = new Set([
    ...collectFedCodes("away-courses.json"),
    ...collectFedCodes("master-courses.json"),
    ...collectFromCoursePlayers("course-players.json"),
  ]);

  // ── construir índices de nome / dob / sexo ─────────────────────────────
  const playerNames = {};
  const playerDob = {};
  const playerSex = {};
  try {
    const players = readJson("players.json");
    for (const [k, v] of Object.entries(players)) {
      if (v && typeof v === "object") {
        if (v.name) playerNames[k] = v.name;
        if (v.dob) playerDob[k] = v.dob;
        if (v.sex === "M" || v.sex === "F") playerSex[k] = v.sex;
      }
    }
  } catch {/* opcional */}

  const fedNames = {};
  const fedDob = {};
  const fedSex = {};
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
      if (!code) continue;
      if (p?.name && !(code in fedNames)) fedNames[code] = p.name;
      if (p?.birthdate && !(code in fedDob)) fedDob[code] = p.birthdate;
      if ((p?.gender === "M" || p?.gender === "F") && !(code in fedSex)) fedSex[code] = p.gender;
    }
  }

  // ── resolver ────────────────────────────────────────────────────────────
  const map = {};
  const dobMap = {};
  const sexMap = {};
  const unresolved = [];
  for (const code of codes) {
    // Ignorar "nomes" placeholder iguais ao próprio código (entradas por
    // preencher em players.json) — preferir o nome real dos federados.
    const fromPlayers = playerNames[code] && playerNames[code] !== code ? playerNames[code] : null;
    const name = fromPlayers || fedNames[code];
    if (name) map[code] = name;
    else unresolved.push(code);
    const dob = playerDob[code] || fedDob[code];
    if (dob) dobMap[code] = dob;
    const sex = playerSex[code] || fedSex[code];
    if (sex) sexMap[code] = sex;
  }

  // saída ordenada por código para diffs estáveis
  const order = (m) => {
    const o = {};
    for (const k of Object.keys(m).sort((a, b) => a.localeCompare(b))) o[k] = m[k];
    return o;
  };
  const ordered = order(map);

  const out = {
    generated: new Date().toISOString(),
    source: "players.json + federados.json + federados-inativos.json",
    total: Object.keys(ordered).length,
    names: ordered,
    // dob (YYYY-MM-DD) e sexo — usados pela CamposPage para o escalão à data da
    // volta (KPIs por tee: melhor Sub-12/14/16… em cada cor). Só os que existem.
    dob: order(dobMap),
    sex: order(sexMap),
  };

  const outPath = path.join(DATA, "course-player-names.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 0) + "\n");

  console.log(`Códigos referenciados: ${codes.size}`);
  console.log(`Resolvidos: ${Object.keys(ordered).length} | Não resolvidos: ${unresolved.length}`);
  if (unresolved.length) console.log("Não resolvidos:", unresolved.sort().join(", "));
  console.log(`Escrito: public/data/course-player-names.json`);
}

main();
