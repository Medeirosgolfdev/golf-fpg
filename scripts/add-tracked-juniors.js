#!/usr/bin/env node
/**
 * add-tracked-juniors.js — Revê e expande a lista de jogadores seguidos.
 *
 * Acrescenta ao players.json os juniores competitivos da base de federados
 * activos, mantendo os atuais e os "órfãos" (fed codes que já têm histórico
 * em output/<nfed>/ mas não estão em players.json).
 *
 * CRITÉRIO (definido com a Mariana 2026-06-13):
 *   - Sub-10: NÃO seguir (decisão 2026-06-13 — demasiado novos, sem interesse)
 *   - Sub-12: TODOS com HCP válido
 *   - Sub-14, Sub-16, Sub-18: HCP <= 26
 *   - Sub-21: HCP <= 18 (só a elite)
 *   - + manter TODOS os atuais
 *   - + readicionar TODOS os órfãos (têm dados em output/), EXCEPTO Sub-10
 *
 * Também faz PRUNE: remove os Sub-10 que tínhamos auto-adicionado antes
 * (tags auto-junior / orfao-readd), tornando o script idempotente.
 *
 * "HCP válido" = hcp_exact numérico < 99 (99 / "Sem HCP" = não conta).
 *
 * As entradas novas ficam com tag "auto-junior" (juniores) ou "orfao-readd"
 * (órfãos não-juniores) — ambas não-negativas, portanto o
 * cleanup-players-json.js mantém-nas. O escalão é convertido para o formato
 * "Sub-NN" para que o cleanup as trate como jovens (KEEP garantido).
 *
 * Uso:
 *   node scripts/add-tracked-juniors.js            # DRY RUN (não escreve)
 *   node scripts/add-tracked-juniors.js --apply     # aplica + backup
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply");

// players.json existe na raiz E em public/data — manter ambos sincronizados.
const PLAYERS_PATHS = [
  path.join(ROOT, "players.json"),
  path.join(ROOT, "public", "data", "players.json"),
].filter((p) => fs.existsSync(p));

const FEDERADOS = path.join(ROOT, "public", "data", "federados.json");
// Inactivos: ficheiro pesado movido para data-archive/ em 2026-06-12 — sem este
// fallback os órfãos sem cadastro activo ficavam com name = nº de federado.
const FEDERADOS_INATIVOS = [
  path.join(ROOT, "public", "data", "federados-inativos.json"),
  path.join(ROOT, "data-archive", "federados-inativos.json"),
].find((p) => fs.existsSync(p)) || null;
const OUTPUT = path.join(ROOT, "output");

const useColor = process.stdout.isTTY;
const G = useColor ? "\x1b[32m" : "", R = useColor ? "\x1b[31m" : "",
      Y = useColor ? "\x1b[33m" : "", C = useColor ? "\x1b[36m" : "",
      X = useColor ? "\x1b[0m" : "";

/* ── helpers ─────────────────────────────────────────────────────────── */

function readJson(fp) {
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}

/** "SUB10" → "Sub-10"; "SUB21" → "Sub-21"; restantes inalterados. */
function escalaoFromAgeLevel(al) {
  const m = String(al || "").match(/^SUB(\d+)$/i);
  return m ? `Sub-${m[1]}` : (al || "");
}

function hcpNum(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) && n < 99 ? n : null;
}

/** Critério de junior competitivo a seguir. */
function meetsCriteria(al, hcp) {
  const a = String(al || "").toUpperCase();
  if (a === "SUB10") return false; // sem Sub-10 (decisão 2026-06-13)
  if (a === "SUB12") return hcp != null;
  if (a === "SUB14" || a === "SUB16" || a === "SUB18") return hcp != null && hcp <= 26;
  if (a === "SUB21") return hcp != null && hcp <= 18;
  return false;
}

/** Constrói uma entrada players.json a partir de um registo de federado. */
function entryFromFed(f, tag) {
  const hcp = hcpNum(f.hcp_exact);
  return {
    name: f.name || "?",
    nfed: String(f.federation_code),
    dob: f.birthdate || "",
    sex: f.gender || "M",
    hcp,
    escalao: escalaoFromAgeLevel(f.age_level),
    club: {
      code: f.club_code || "",
      short: f.acronym || "",
      long: f.club_name || "",
    },
    region: f.region || "",
    tags: [tag],
    altNames: [],
    extra: {},
    lastRound: null,
  };
}

/* ── carregar dados ──────────────────────────────────────────────────── */

if (PLAYERS_PATHS.length === 0) {
  console.error(`${R}ERRO: players.json não encontrado${X}`);
  process.exit(1);
}

// players.json canónico = o primeiro existente (raiz tem prioridade)
const players = readJson(PLAYERS_PATHS[0]);
const beforeCount = Object.keys(players).length;

// índice de federados por federation_code
// fedById = só ACTIVOS (alimenta o critério de juniores do passo 1);
// inativosById = fallback usado apenas para resolver órfãos (passo 2) —
// senão os órfãos sem cadastro activo ficam com name = nº de federado.
function loadFedIndex(file) {
  const map = new Map();
  if (!file || !fs.existsSync(file)) return map;
  const doc = readJson(file);
  const list = Array.isArray(doc) ? doc : doc.players || [];
  for (const f of list) {
    const code = String(f.federation_code);
    if (code && !map.has(code)) map.set(code, f);
  }
  return map;
}
const fedById = loadFedIndex(FEDERADOS);
const inativosById = loadFedIndex(FEDERADOS_INATIVOS);

// órfãos: pastas output/<nfed> com data.json mas sem entrada em players.json
const orphans = new Set();
if (fs.existsSync(OUTPUT)) {
  for (const dir of fs.readdirSync(OUTPUT)) {
    if (!/^\d+$/.test(dir)) continue;
    if (players[dir]) continue;
    const fp = path.join(OUTPUT, dir, "analysis", "data.json");
    if (fs.existsSync(fp)) orphans.add(dir);
  }
}

/* ── selecção ────────────────────────────────────────────────────────── */

const added = [];          // {fed, name, escalao, tag, reason}
const skippedNoFed = [];   // órfãos sem registo de federado (nome desconhecido)
const addedByEsc = {};

// 0) PRUNE — remover Sub-10 que tínhamos auto-adicionado (decisão 2026-06-13).
//    Só toca em entradas com as NOSSAS tags (auto-junior / orfao-readd) para
//    não apagar nada curado à mão.
const pruned = [];
for (const [code, p] of Object.entries(players)) {
  const tags = p.tags || [];
  const auto = tags.includes("auto-junior") || tags.includes("orfao-readd");
  if (auto && p.escalao === "Sub-10") {
    delete players[code];
    pruned.push({ fed: code, name: p.name });
  }
}

// 0.5) REPARAÇÃO — entradas nossas que ficaram com nome-placeholder
//      (name = nº de federado, criadas quando o fed não tinha cadastro nos
//      activos). Re-resolve contra activos + inactivos, preservando tags e
//      campos curados (altNames/extra/lastRound).
const repaired = [];
for (const [code, p] of Object.entries(players)) {
  const tags = p.tags || [];
  const auto = tags.includes("auto-junior") || tags.includes("orfao-readd");
  if (!auto || p.name !== code) continue;
  const f = fedById.get(code) || inativosById.get(code);
  if (!f || !f.name) continue;
  const entry = entryFromFed(f, tags[0] || "orfao-readd");
  players[code] = {
    ...entry,
    tags,
    altNames: p.altNames || [],
    extra: p.extra || {},
    lastRound: p.lastRound ?? null,
  };
  repaired.push({ fed: code, name: entry.name });
}

// 1) Juniores competitivos da base de federados activos
for (const [code, f] of fedById.entries()) {
  if (players[code]) continue;
  const hcp = hcpNum(f.hcp_exact);
  if (!meetsCriteria(f.age_level, hcp)) continue;
  const entry = entryFromFed(f, "auto-junior");
  players[code] = entry;
  added.push({ fed: code, name: entry.name, escalao: entry.escalao, reason: "junior" });
  addedByEsc[entry.escalao] = (addedByEsc[entry.escalao] || 0) + 1;
  orphans.delete(code); // já tratado
}

// 2) Órfãos (mantêm-se sempre — já têm histórico scrapado), EXCEPTO Sub-10
for (const code of orphans) {
  if (players[code]) continue;
  const f = fedById.get(code) || inativosById.get(code);
  if (f && /^SUB10$/i.test(String(f.age_level || ""))) continue; // sem Sub-10
  if (f) {
    const isJ = /^SUB\d+$/i.test(String(f.age_level || ""));
    const entry = entryFromFed(f, isJ ? "auto-junior" : "orfao-readd");
    players[code] = entry;
    added.push({ fed: code, name: entry.name, escalao: entry.escalao, reason: "orfao" });
    addedByEsc[entry.escalao || "Outros"] = (addedByEsc[entry.escalao || "Outros"] || 0) + 1;
  } else {
    // sem registo de federado: criar entrada mínima para não perder o histórico
    players[code] = {
      name: code, nfed: code, dob: "", sex: "M", hcp: null,
      escalao: "", club: { code: "", short: "", long: "" }, region: "",
      tags: ["orfao-readd"], altNames: [], extra: {}, lastRound: null,
    };
    added.push({ fed: code, name: `(fed ${code})`, escalao: "", reason: "orfao-sem-cadastro" });
    skippedNoFed.push(code);
  }
}

const afterCount = Object.keys(players).length;

/* ── relatório ───────────────────────────────────────────────────────── */

console.log(`${C}=== REVISÃO DA LISTA DE JOGADORES ===${X}`);
console.log(`Antes:         ${beforeCount}`);
console.log(`Sub-10 removidos: ${R}${pruned.length}${X}`);
console.log(`Nomes-placeholder reparados: ${G}${repaired.length}${X}`);
for (const r of repaired) console.log(`  ${String(r.fed).padStart(6)} → ${r.name}`);
console.log(`Acrescentados: ${G}${added.length}${X}`);
console.log(`Depois:        ${G}${afterCount}${X}`);
console.log("");

const juniores = added.filter((a) => a.reason === "junior").length;
const orfaos = added.filter((a) => a.reason.startsWith("orfao")).length;
console.log(`  juniores novos (critério): ${juniores}`);
console.log(`  órfãos readicionados:      ${orfaos}`);
if (skippedNoFed.length) {
  console.log(`  ${Y}órfãos sem cadastro (nome=fed): ${skippedNoFed.length}${X}`);
}
console.log("");
console.log("Acrescentados por escalão:");
const ESC_ORDER = ["Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18", "Sub-21",
                   "Sub-24", "Absoluto", "MidAmateur", "Senior", "SuperSenior", "", "Outros"];
for (const esc of ESC_ORDER) {
  const k = esc || "Outros";
  if (addedByEsc[esc] != null) console.log(`  ${(esc || "(s/escalão)").padEnd(14)} ${addedByEsc[esc]}`);
  else if (esc === "Outros" && addedByEsc["Outros"]) console.log(`  Outros         ${addedByEsc["Outros"]}`);
}

// Relatório dos hidden / no-scrape existentes (não são tocados por este script;
// só listados para decisão manual).
const hiddenList = [], noScrapeList = [];
for (const [code, p] of Object.entries(players)) {
  const t = p.tags || [];
  if (t.includes("hidden")) hiddenList.push({ fed: code, name: p.name, escalao: p.escalao });
  if (t.includes("no-scrape")) noScrapeList.push({ fed: code, name: p.name, escalao: p.escalao, hcp: p.hcp });
}
console.log("");
console.log(`${C}=== hidden / no-scrape existentes (não alterados) ===${X}`);
console.log(`hidden (escondidos da UI):   ${hiddenList.length}`);
console.log(`no-scrape (UI mas congelados): ${noScrapeList.length}`);
if (noScrapeList.length) {
  noScrapeList.sort((a, b) => (a.escalao || "").localeCompare(b.escalao || ""));
  for (const m of noScrapeList) {
    console.log(`  ${String(m.fed).padStart(6)} ${(m.escalao || "").padEnd(8)} hcp=${m.hcp}  ${m.name}`);
  }
}

if (!APPLY) {
  console.log("");
  console.log(`${Y}=== DRY RUN ===${X}  (nada escrito)`);
  console.log("Para aplicar: node scripts/add-tracked-juniors.js --apply");
  process.exit(0);
}

/* ── escrita (backup + ambos os ficheiros) ───────────────────────────── */

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const serialized = JSON.stringify(players, null, 2);
for (const fp of PLAYERS_PATHS) {
  const backup = `${fp}.backup-${stamp}`;
  fs.copyFileSync(fp, backup);
  fs.writeFileSync(fp, serialized);
  console.log(`${G}✓${X} ${path.relative(ROOT, fp)}  (backup: ${path.basename(backup)})`);
}
console.log(`${G}✓ players.json actualizado — ${afterCount} jogadores${X}`);
console.log("");
console.log("Próximos passos sugeridos:");
console.log("  1. node scripts/cleanup-players-json.js          # rever (dry-run)");
console.log("  2. node scripts/fpg-scrape-node.js --all --concurrency 3   # scrape dos novos");
console.log("  3. npm test && npm run build");
