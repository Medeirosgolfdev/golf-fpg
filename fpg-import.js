#!/usr/bin/env node
/**
 * fpg-import.js — Importar dados descarregados pelo browser
 * 
 * Uso:
 *   node fpg-import.js <federado> [pasta-downloads]
 * 
 * Exemplos:
 *   node fpg-import.js 52884                           # Procura na pasta Downloads padrão
 *   node fpg-import.js 52884 C:\Users\Joao\Downloads   # Pasta específica
 * 
 * Espera encontrar:
 *   whs-list.json       — Lista de resultados WHS
 *   scorecards-all.json — Todos os scorecards num único ficheiro
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m", RESET = "\x1b[0m", BOLD = "\x1b[1m", DIM = "\x1b[2m";
const ok = (msg) => console.log(`  ${GREEN}✓${RESET} ${msg}`);
const fail = (msg) => console.log(`  ${RED}✗${RESET} ${msg}`);
const warn = (msg) => console.log(`  ${YELLOW}⚠${RESET} ${msg}`);
const info = (msg) => console.log(`  ${DIM}${msg}${RESET}`);

const fed = process.argv[2];
if (!fed || !/^\d+$/.test(fed)) {
  console.log(`Uso: node fpg-import.js <federado> [pasta-downloads]`);
  console.log(`  Ex: node fpg-import.js 52884`);
  process.exit(1);
}

// Encontrar pasta de downloads
const downloadsDir = process.argv[3] || path.join(os.homedir(), "Downloads");
const outDir = path.join(process.cwd(), "output", fed);
const scorecardsDir = path.join(outDir, "scorecards");

console.log(`\n${BOLD}═══ FPG Import — Federado ${fed} ═══${RESET}\n`);
info(`Downloads: ${downloadsDir}`);
info(`Output:    ${outDir}`);

// ── 1. Localizar e copiar whs-list.json ──
console.log(`\n${BOLD}[1/3] Lista WHS${RESET}`);
const whsSrc = path.join(downloadsDir, "whs-list.json");
const whsDst = path.join(outDir, "whs-list.json");

if (!fs.existsSync(whsSrc)) {
  fail(`Não encontrei: ${whsSrc}`);
  console.log(`\n  Verifica se descarregaste os ficheiros do browser.`);
  console.log(`  Os ficheiros devem estar na pasta: ${downloadsDir}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const whsData = JSON.parse(fs.readFileSync(whsSrc, "utf-8"));
const whsCount = whsData?.Records?.length || 0;

// Fazer backup do antigo se existir
if (fs.existsSync(whsDst)) {
  const oldData = JSON.parse(fs.readFileSync(whsDst, "utf-8"));
  const oldCount = oldData?.Records?.length || 0;
  if (whsCount > oldCount) {
    ok(`Novos registos: ${oldCount} → ${whsCount} (+${whsCount - oldCount})`);
  } else if (whsCount === oldCount) {
    info(`Mesmo número de registos: ${whsCount}`);
  } else {
    warn(`Menos registos? ${oldCount} → ${whsCount}`);
  }
  fs.copyFileSync(whsDst, whsDst + ".bak");
  info("Backup: whs-list.json.bak");
}

fs.copyFileSync(whsSrc, whsDst);
ok(`${whsCount} registos → ${whsDst}`);

// ── 2. Extrair scorecards individuais ──
console.log(`\n${BOLD}[2/3] Scorecards${RESET}`);
const scSrc = path.join(downloadsDir, "scorecards-all.json");

if (!fs.existsSync(scSrc)) {
  fail(`Não encontrei: ${scSrc}`);
  process.exit(1);
}

fs.mkdirSync(scorecardsDir, { recursive: true });

const scData = JSON.parse(fs.readFileSync(scSrc, "utf-8"));
const scoreIds = Object.keys(scData);

let newCount = 0, existCount = 0;
for (const id of scoreIds) {
  const filePath = path.join(scorecardsDir, `${id}.json`);
  if (fs.existsSync(filePath)) {
    existCount++;
  } else {
    newCount++;
  }
  // Sempre gravar (pode ter dados mais frescos)
  fs.writeFileSync(filePath, JSON.stringify(scData[id], null, 2), "utf-8");
}

ok(`${scoreIds.length} scorecards (${newCount} novos, ${existCount} actualizados)`);

// ── 3. Correr pipeline de processamento ──
console.log(`\n${BOLD}[3/3] Processar dados${RESET}`);

const golfAllPath = path.join(process.cwd(), "golf-all.js");
if (fs.existsSync(golfAllPath)) {
  info(`A correr: node golf-all.js --skip-download ${fed}`);
  try {
    execSync(`node golf-all.js --skip-download ${fed}`, { stdio: "inherit", cwd: process.cwd() });
  } catch (e) {
    warn(`Pipeline retornou erro (pode ser parcial)`);
  }
} else {
  warn("golf-all.js não encontrado — a saltar processamento");
  info("Corre manualmente: node golf-all.js --skip-download " + fed);
}

// ── Limpar downloads ──
console.log(`\n${BOLD}Concluído!${RESET}`);
ok(`whs-list.json: ${whsCount} registos`);
ok(`scorecards: ${scoreIds.length} (${newCount} novos)`);

if (newCount > 0) {
  console.log(`\n  ${GREEN}${BOLD}${newCount} scorecards novos importados!${RESET}`);
}

console.log(`\n  Os ficheiros originais ficaram em: ${downloadsDir}`);
console.log(`  Podes apagá-los se quiseres.\n`);
