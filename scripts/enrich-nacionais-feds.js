#!/usr/bin/env node
/**
 * enrich-nacionais-feds.js
 *
 * Enriquece `fpg-nacionais-historico.json` com `fedCode` e `dob` sintético
 * (derivado de age + ano do torneio) por jogador, baseado em `nacionais-feds.json`
 * (score_id → federated_code, scrapado via ScoreCard endpoint).
 *
 * Permite à JovensAnaliseView:
 *   - Aplicar regra "só portugueses podem ser campeões" via lookup byFed em
 *     players-nationality.json
 *   - Mostrar badges A1/A2 (ano do escalão) via yearInEscalao(dob, year)
 *
 * O dob é sintético (ano-only): `${year - age}-06-01`. Aproximação suficiente
 * para A1/A2 (depende só do ano de nascimento).
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
  const feds = loadJson("nacionais-feds.json");
  const fedByScoreId = feds.fedByScoreId || {};

  const historico = loadJson("fpg-nacionais-historico.json");

  let enriched = 0;
  let withAge = 0;
  let roundsFixed = 0;
  for (const t of historico.tournaments || []) {
    const tournYear = parseInt((t.date || "").slice(0, 4));
    // Fix `rounds` campo: derivar do máximo de roundScores observados.
    // Bug histórico: chunk5 hardcodava rounds=1 mesmo em torneios de 2-3 rondas.
    let maxRounds = 1;
    for (const p of t.players || []) {
      const realRounds = (p.roundScores || []).filter(
        (r) => typeof r.gross === "number" && r.gross > 0 && r.gross < 300,
      ).length;
      if (realRounds > maxRounds) maxRounds = realRounds;
    }
    if (t.rounds !== maxRounds) {
      t.rounds = maxRounds;
      roundsFixed++;
    }
    for (const p of t.players || []) {
      // 1. fedCode lookup
      const fed = fedByScoreId[p.scoreId];
      if (fed) {
        p.fedCode = fed;
        enriched++;
      }
      // 2. Synth DOB from age + tourn year
      if (typeof p.age === "number" && p.age > 0 && tournYear) {
        const yob = tournYear - p.age;
        if (yob >= 1980 && yob <= 2030) {
          p.dob = `${yob}-06-01`;
          withAge++;
        }
      }
    }
  }

  historico.lastEnrichedAt = new Date().toISOString();
  historico.enrichmentNotes = "fedCode + dob + rounds fix";

  fs.writeFileSync(
    path.join(DATA_DIR, "fpg-nacionais-historico.json"),
    JSON.stringify(historico, null, 2),
  );

  console.log("[ok] fpg-nacionais-historico.json enriquecido");
  console.log("     " + enriched + " fedCodes adicionados");
  console.log("     " + withAge + " dob sintéticos derivados de age");
  console.log("     " + roundsFixed + " torneios com rounds corrigido");
}

main();
