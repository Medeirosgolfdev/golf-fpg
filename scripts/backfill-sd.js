#!/usr/bin/env node
/**
 * backfill-sd.js — escreve o SD OFICIAL da FPG em cada volta dos ficheiros de
 * torneios: `roundScores[].sd` (ou `sd` no jogador, em formato flat).
 *
 * O site mostra este SD sempre que existe; sem ele calcula-o com o HCP da
 * inscrição (computeSD). Vem do WHS do jogador — output/{fed}/whs.json para
 * quem acompanhamos; data-archive/whs-sd.json para ~1.000 juniores descarregados
 * uma vez a 2026-09-15 (não se volta a pedir: só faria diferença em 9 buracos).
 * Uma volta sem correspondência segura fica sem `sd` (e perde um que tivesse).
 *
 * Como o backfill-pcc.js, existe porque os scrapes de resultados correm na
 * noite do torneio, antes de a FPG publicar o SD.
 *
 * USO:
 *   node scripts/backfill-sd.js            # dry-run
 *   node scripts/backfill-sd.js --apply
 *
 * EXIT: 0 = houve alterações · 2 = nada a fazer · 1 = erro.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");
const sdLib = require("./lib/official-sd");
const whs = require("./lib/whs.cjs");

const APPLY = process.argv.includes("--apply");

/** Põe `sd` a seguir ao `pcc` (ou ao `meters`) para os ficheiros ficarem legíveis. */
function withSd(obj, sd) {
  const anchor = "pcc" in obj ? "pcc" : "meters" in obj ? "meters" : null;
  const out = {};
  for (const k of Object.keys(obj)) {
    if (k === "sd") continue;
    out[k] = obj[k];
    if (k === anchor) out.sd = sd;
  }
  if (!("sd" in out)) out.sd = sd;
  return out;
}

/** SD calculado de uma volta — só para desempatar voltas do mesmo dia. */
function calc(v) {
  const rs = v.rs || {};
  const p = v.p;
  const par = rs.pars || p.par || [];
  return whs.roundDifferential({
    scores: rs.scores || p.scores, par, si: rs.si || p.si,
    cr: rs.courseRating ?? p.courseRating, slope: rs.slope ?? p.slope,
    hi: p.hcpExact, pcc: rs.pcc ?? p.pcc ?? 0, gross: v.gross,
    nholes: par.filter((x) => x > 0).length || p.nholes, date: v.date,
  }).sd;
}

function main() {
  const index = sdLib.loadIndex();
  const rowsCache = new Map();
  const rowsOf = (fed) => {
    if (!rowsCache.has(fed)) rowsCache.set(fed, [...(sdLib.whsRows(fed) || []), ...sdLib.indexRows(index, fed)]);
    return rowsCache.get(fed);
  };

  let voltas = 0, comSd = 0, escritas = 0, apagadas = 0, ficheiros = 0;
  for (const file of sdLib.tournamentFiles()) {
    let doc;
    try { doc = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {
      console.error(`[sd] ${path.basename(file)}: JSON inválido (${e.message}) — saltado.`);
      continue;
    }
    // Voltas agrupadas por jogador × torneio
    const grupos = new Map();
    for (const v of sdLib.roundsOf(doc)) {
      if (!grupos.has(v.p)) grupos.set(v.p, []);
      grupos.get(v.p).push(v);
    }
    let dirty = false;
    for (const vs of grupos.values()) {
      const sds = sdLib.matchPlayer(rowsOf(vs[0].fed), vs, calc);
      vs.forEach((v, i) => {
        voltas++;
        const sd = sds[i];
        const alvo = v.rs || v.p;
        if (sd == null) {
          if ("sd" in alvo) { delete alvo.sd; apagadas++; dirty = true; }
          return;
        }
        comSd++;
        if (alvo.sd === sd) return;
        if (v.rs) v.p.roundScores[v.i] = withSd(v.rs, sd);
        else v.t.players[v.t.players.indexOf(v.p)] = withSd(v.p, sd);
        escritas++; dirty = true;
      });
    }
    if (dirty) {
      ficheiros++;
      if (APPLY) {
        const hadNewline = fs.readFileSync(file, "utf8").endsWith("\n");
        writeJsonAtomic(file, doc);
        if (hadNewline) fs.appendFileSync(file, "\n");
      }
    }
  }

  const pct = voltas ? ((100 * comSd) / voltas).toFixed(1) : "0";
  console.log(`[sd] voltas com cartão: ${voltas} · com SD oficial: ${comSd} (${pct}%) · a escrever: ${escritas} · a apagar: ${apagadas} · em ${ficheiros} ficheiros`);
  if (!escritas && !apagadas) { console.log("[sd] nada a fazer."); return 2; }
  if (!APPLY) { console.log("[sd] DRY-RUN — nada foi escrito. Correr com --apply."); return 2; }
  return 0;
}

try {
  process.exit(main());
} catch (e) {
  console.error("[sd] ERRO:", e.stack || e.message);
  process.exit(1);
}
