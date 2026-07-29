#!/usr/bin/env node
/**
 * scripts/pull-torneios-tail.cjs
 *
 * Imprime o caminho do ficheiro pull-torneios "cauda" onde novos torneios
 * devem ser escritos, mantendo cada ficheiro com ~TARGET torneios (rotação).
 *
 * Regra: o ficheiro de maior índice (pull-torneios00N.json) enquanto tiver
 * < TARGET torneios; quando enche, passa para N+1 (criado pelo scraper via
 * merge aditivo sobre existente vazio). Nunca reescreve os ficheiros mais
 * antigos — só faz crescer a cauda, preservando o histórico estável.
 *
 * A FPGPage lê 000..NNN automaticamente (pára após 2 falhas seguidas), por
 * isso a numeração contígua sem buracos é a única invariante a respeitar.
 *
 * USO:  node scripts/pull-torneios-tail.cjs [--target 120] [--data-dir public/data]
 * SAÍDA: caminho relativo ao repo (ex: public/data/pull-torneios006.json)
 */
"use strict";
const fs = require("fs");
const path = require("path");

function argVal(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : def;
}

const TARGET = parseInt(argVal("--target", "120"), 10) || 120;
const DATA_DIR = argVal("--data-dir", path.join("public", "data"));

const RE = /^pull-torneios(\d{3})\.json$/; // só os numerados 000..999 (ignora avulsos tipo pull-torneios-10685.json)

function countTournaments(fp) {
  try {
    const d = JSON.parse(fs.readFileSync(fp, "utf8"));
    return Array.isArray(d.tournaments) ? d.tournaments.length : 0;
  } catch {
    return 0; // ficheiro inexistente/ilegível conta como vazio
  }
}

function pad(n) { return String(n).padStart(3, "0"); }

function main() {
  let maxIdx = -1;
  for (const f of fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR) : []) {
    const m = RE.exec(f);
    if (m) maxIdx = Math.max(maxIdx, parseInt(m[1], 10));
  }

  if (maxIdx < 0) {
    // Nenhum ficheiro ainda — começar no 000.
    process.stdout.write(path.join(DATA_DIR, `pull-torneios${pad(0)}.json`));
    return;
  }

  const tailPath = path.join(DATA_DIR, `pull-torneios${pad(maxIdx)}.json`);
  const n = countTournaments(tailPath);
  if (n < TARGET) {
    process.stdout.write(tailPath); // ainda há espaço na cauda
  } else {
    process.stdout.write(path.join(DATA_DIR, `pull-torneios${pad(maxIdx + 1)}.json`)); // rodar para o próximo
  }
}

main();
