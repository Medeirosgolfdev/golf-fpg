#!/usr/bin/env node
/**
 * merge-nacionais-chunks.js
 *
 * Recombina os chunks v4 (`nacionais-v4-chunk{1..5}.json`) com o meta
 * (`nacionais-v4-meta.json`) num único `fpg-nacionais-historico.json`.
 *
 * Chunks 1-4: 160 Nacionais (118 Jovens + 42 Clubes) ccode=000
 * Chunk 5 (opcional): 46 Drive Tour Finals (de facto Nacional Sub-12+ 2018-2024)
 *                     + 3 ccode=988 (2025 Sub-10/12)
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "public", "data");

function loadJson(file) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    console.error("[ERR] não encontrado: " + file);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function main() {
  const meta = loadJson("nacionais-v4-meta.json");
  const tournaments = [];
  for (let i = 1; i <= 5; i++) {
    const file = "nacionais-v4-chunk" + i + ".json";
    const full = path.join(DATA_DIR, file);
    if (!fs.existsSync(full)) {
      if (i <= 4) {
        console.error("[ERR] chunk obrigatório em falta: " + file);
        process.exit(1);
      }
      console.log("  chunk " + i + "/5: (opcional, em falta — saltar)");
      continue;
    }
    const chunk = JSON.parse(fs.readFileSync(full, "utf8"));
    tournaments.push.apply(tournaments, chunk.tournaments);
    console.log("  chunk " + i + "/5: " + chunk.tournaments.length + " torneios");
  }
  tournaments.sort(function (a, b) {
    return (b.date || "").localeCompare(a.date || "");
  });

  // Verify no synth
  let synth = 0;
  for (const t of tournaments) {
    for (const p of t.players || []) {
      if (p.fedCode && String(p.fedCode).indexOf("synth-") === 0) synth++;
    }
  }
  if (synth > 0) {
    console.error("[ERR] " + synth + " fedCodes synth-* nos chunks — abortar");
    process.exit(1);
  }

  const totalPlayers = tournaments.reduce(function (s, t) {
    return s + (t.players || []).length;
  }, 0);
  const totalScorecards = tournaments.reduce(function (s, t) {
    return s + (t.players || []).reduce(function (s2, p) {
      return s2 + (p.roundScores || []).length;
    }, 0);
  }, 0);

  const out = Object.assign({}, meta, {
    totalTournaments: tournaments.length,
    totalPlayers: totalPlayers,
    totalScorecards: totalScorecards,
    tournaments: tournaments,
  });

  const outPath = path.join(DATA_DIR, "fpg-nacionais-historico.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("[ok] " + tournaments.length + " torneios escritos em " + path.relative(process.cwd(), outPath));
  console.log("     " + totalPlayers + " jogadores | " + totalScorecards + " scorecards | synth: 0 OK");
}

main();
