#!/usr/bin/env node
/**
 * scripts/backfill-drive-positions.js (2026-07-19)
 * ─────────────────────────────────────────────────────────────────────────
 * Reaplica o desempate COUNTBACK (scripts/lib/drive-countback.cjs) às posições
 * dos torneios MULTI-RONDA já guardados em public/data/drive-data-*.json e
 * aquapor-data-*.json.
 *
 * Porquê: até 2026-07-19 o scrape-drive-node.js desempatava por back-9 (só em
 * voltas de 18) e, na falta disso, por ORDEM ALFABÉTICA — o que trocava
 * posições e pontos do ranking entre empatados (ex: Tomás Sarmento/James
 * Orrison empatados a 81 → 165 vs 94 pts trocados face ao oficial). O scraper
 * já ficou corrigido, mas os ficheiros históricos mantinham as posições velhas
 * e re-scrapar tudo era desnecessário: as posições derivam-se dos scorecards
 * que já temos.
 *
 * Só toca em torneios com >1 ronda (nos de ronda única a posição vem da FPG).
 *
 * USAGE:
 *   node scripts/backfill-drive-positions.js --dry-run   # só relatório
 *   node scripts/backfill-drive-positions.js             # aplica
 *   node scripts/backfill-drive-positions.js --year 2026
 * ─────────────────────────────────────────────────────────────────────────
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");
const { compareForRanking, assignPositions } = require("./lib/drive-countback.cjs");

const REPO = path.resolve(__dirname, "..");
const DATA = path.join(REPO, "public", "data");

const args = process.argv.slice(2);
const argVal = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const DRY = args.includes("--dry-run");
const YEAR = argVal("--year", null);

// ⚠ SÓ drive-data. O Circuito Aquapor NÃO é uma classificação gross (medido:
// no 2º Aquapor 2025 o 3º classificado fez 143 e o 4º fez 141) — reordená-lo
// por gross destruía a ordem oficial. Lá as posições da FPG ficam intactas.
const rx = YEAR
  ? new RegExp(`^drive-data-${YEAR}-\\d{2}\\.json$`)
  : /^drive-data-\d{4}-\d{2}\.json$/;

const files = fs.readdirSync(DATA).filter(f => rx.test(f)).sort();
let nFiles = 0, nTourn = 0, nChanged = 0, nPlayers = 0;

for (const f of files) {
  const file = path.join(DATA, f);
  let j;
  try { j = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }

  let fileChanged = false;
  for (const t of (j.tournaments || [])) {
    const nRounds = Math.max(0, ...(t.players || []).map(p => p.roundScores?.length || 0));
    if (nRounds <= 1) continue;
    nTourn++;

    const before = new Map((t.players || []).map(p => [p.name, p.pos]));
    const hasGross = (p) => typeof p.grossTotal === "number" && p.grossTotal < 900;
    const complete = (t.players || []).filter(p => hasGross(p) && (p.roundScores?.length || 0) >= nRounds).sort(compareForRanking);
    const partial = (t.players || []).filter(p => hasGross(p) && (p.roundScores?.length || 0) < nRounds).sort(compareForRanking);
    assignPositions(complete);
    assignPositions(partial);
    for (const p of partial) p.pos += complete.length;

    const moved = [...complete, ...partial].filter(p => before.get(p.name) !== p.pos);
    if (moved.length) {
      nChanged++;
      nPlayers += moved.length;
      fileChanged = true;
      console.log(`  ${t.date} "${t.name}": ${moved.length} posições alteradas`);
      for (const p of moved.slice(0, 6)) console.log(`      ${p.name}: ${before.get(p.name)} → ${p.pos}`);
      if (moved.length > 6) console.log(`      … +${moved.length - 6}`);
    }
  }

  if (fileChanged) {
    nFiles++;
    if (!DRY) writeJsonAtomic(file, j);
  }
}

console.log(`\n${DRY ? "[dry-run] " : ""}${nTourn} torneios multi-ronda · ${nChanged} com posições alteradas · ${nPlayers} jogadores · ${nFiles} ficheiros${DRY ? " (não gravados)" : " gravados"}`);
