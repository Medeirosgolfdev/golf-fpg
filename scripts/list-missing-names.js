'use strict';
// Node script — corre no terminal/PowerShell, NÃO no browser.

/**
 * list-missing-names.js
 *
 * Lista todos os mids da cache USKids que estão sem nome (`name: "?"` ou null)
 * ou suspeitos (nome muito curto / ALL CAPS). Output ordenado por relevância
 * (mais torneios USKids primeiro → mais valor em resolver).
 *
 * Output: imprime no terminal (com `--out <path>` grava em JSON)
 *         + estrutura array-of-mids no fim, pronto a copiar para o
 *         CONFIG.MIDS de `browser-resolve-missing-names.js`.
 *
 * Uso:
 *   node scripts/list-missing-names.js                    (top 20)
 *   node scripts/list-missing-names.js --top=100          (top 100)
 *   node scripts/list-missing-names.js --out=missing.json (grava JSON)
 *   node scripts/list-missing-names.js --verify           (lista mids COM nome, para verificar)
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const ROOT = path.join(__dirname, '..');
const ARCHIVE = path.join(ROOT, 'data-archive');

const argTop = (process.argv.find(a => a.startsWith('--top=')) || '').split('=')[1];
const TOP = argTop ? parseInt(argTop, 10) : 20;
const argOut = (process.argv.find(a => a.startsWith('--out=')) || '').split('=')[1];
const OUT = argOut ? path.resolve(argOut) : null;
const VERIFY_MODE = process.argv.includes('--verify');

function isUnnamed(name) {
  return !name || name === '?' || name.trim() === '';
}

function isSuspicious(name) {
  if (!name || name === '?') return false; // unnamed != suspicious
  // ALL CAPS (>80% maiúsculas) → suspeito (signupanytime às vezes devolve)
  const letters = name.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < 3) return false;
  const upper = letters.replace(/[a-zà-ÿ]/g, '').length;
  if (upper / letters.length > 0.8) return true;
  return false;
}

const files = glob.sync(path.join(ARCHIVE, 'uskids-member-history-*.json')).sort();
console.log(`▶ A varrer ${files.length} ficheiros...`);

const unnamed = [];   // {mid, totalTorneios, file, country}
const suspicious = [];
const named = [];

for (const fn of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(fn, 'utf8')); } catch (e) {
    console.warn(`  ⚠️ ${path.basename(fn)}: ${e.message.slice(0, 80)}`);
    continue;
  }
  const fileLabel = path.basename(fn);
  for (const [mid, p] of Object.entries(d.jogadores || {})) {
    const totalT = Object.keys(p.torneios || {}).length;
    const country = p.country || '';
    const entry = { mid, name: p.name, totalT, country, file: fileLabel, ageGroup: p.ageGroup };
    if (isUnnamed(p.name)) unnamed.push(entry);
    else if (isSuspicious(p.name)) suspicious.push(entry);
    else named.push(entry);
  }
}

// Ordenar por nº de torneios (decrescente — mais valor em resolver/verificar)
unnamed.sort((a, b) => b.totalT - a.totalT);
suspicious.sort((a, b) => b.totalT - a.totalT);
named.sort((a, b) => b.totalT - a.totalT);

console.log(`\n▶ Sumário:`);
console.log(`  Sem nome ("?" ou null): ${unnamed.length}`);
console.log(`  Suspeitos (ALL CAPS):   ${suspicious.length}`);
console.log(`  Nomeados:               ${named.length}`);
console.log(`  Total:                  ${unnamed.length + suspicious.length + named.length}\n`);

if (VERIFY_MODE) {
  console.log(`▶ TOP ${TOP} nomeados (para verificação cross-check):`);
  for (const e of named.slice(0, TOP)) {
    console.log(`  ${e.mid.padStart(8)}  ${e.name.padEnd(32)} ${e.country || '??'}  ${e.totalT}t  (${e.file})`);
  }
  const midsToVerify = named.slice(0, TOP).map(e => e.mid);
  console.log(`\nCONFIG.MIDS para verify (cola em browser-resolve-missing-names.js):`);
  console.log(`MIDS: [${midsToVerify.map(m => `"${m}"`).join(', ')}],`);
  if (OUT) {
    fs.writeFileSync(OUT, JSON.stringify({ mode: 'verify', mids: midsToVerify, details: named.slice(0, TOP) }, null, 2));
    console.log(`\n✓ Escrito ${OUT}`);
  }
} else {
  console.log(`▶ TOP ${TOP} sem nome (ordenado por nº torneios — mais valor em resolver):`);
  for (const e of unnamed.slice(0, TOP)) {
    console.log(`  ${e.mid.padStart(8)}  ${(e.ageGroup || '?').padEnd(18)} ${e.country || '??'}  ${e.totalT}t  (${e.file})`);
  }
  const midsToResolve = unnamed.slice(0, TOP).map(e => e.mid);
  console.log(`\nCONFIG.MIDS para resolve (cola em browser-resolve-missing-names.js):`);
  console.log(`MIDS: [${midsToResolve.map(m => `"${m}"`).join(', ')}],`);

  if (suspicious.length) {
    console.log(`\n▶ Suspeitos (ALL CAPS, top 10):`);
    for (const e of suspicious.slice(0, 10)) {
      console.log(`  ${e.mid.padStart(8)}  ${e.name.padEnd(32)} ${e.country || '??'}  ${e.totalT}t`);
    }
  }

  if (OUT) {
    fs.writeFileSync(OUT, JSON.stringify({
      gerado_em: new Date().toISOString(),
      total_unnamed: unnamed.length,
      total_suspicious: suspicious.length,
      top: unnamed.slice(0, TOP),
      suspicious_sample: suspicious.slice(0, 50),
    }, null, 2));
    console.log(`\n✓ Escrito ${OUT}`);
  }
}
