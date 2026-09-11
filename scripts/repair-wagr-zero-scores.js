/**
 * scripts/repair-wagr-zero-scores.js
 *
 * Reparação one-off dos `wagr/events/wagr_{id}.json` escritos ANTES de
 * 2026-09-09, quando o `scrape-wagr.js` guardava `total: 0` / `r1: 0` nas
 * linhas "Participant" do WAGR (match play, provas por equipas, quem pontuou só
 * por participar — ~3% das linhas).
 *
 * **0 não é um score de golfe, é a ausência dele.** Guardado como 0, o jogador
 * aparecia com "0" na coluna TOTAL e subia ao topo de qualquer ordenação por
 * total. O scraper já normaliza na origem (`score()`); isto arruma o que ficou
 * em disco, sem re-fetch de milhares de páginas.
 *
 * Depois de correr, regenerar o rollup e o índice:
 *   node scripts/repair-wagr-zero-scores.js --apply
 *   node scripts/scrape-wagr.js --events --no-leaderboards   # refaz o rollup
 *   node scripts/build-wagr-events-list.js
 *
 * Sem `--apply` é dry-run (só conta). Idempotente.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const EVENTS_DIR = path.resolve(__dirname, "..", "public", "data", "wagr", "events");
const FIELDS = ["total", "r1", "r2", "r3", "r4"];

function main() {
  const apply = process.argv.includes("--apply");
  if (!fs.existsSync(EVENTS_DIR)) {
    console.error(`✖ ${EVENTS_DIR} não existe — nada a reparar.`);
    process.exitCode = 1;
    return;
  }
  const files = fs.readdirSync(EVENTS_DIR).filter((f) => /^wagr_\d+\.json$/.test(f));
  let touchedFiles = 0, touchedCells = 0;

  for (const f of files) {
    const file = path.join(EVENTS_DIR, f);
    let d;
    try { d = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    let n = 0;
    for (const p of d.players || []) {
      for (const k of FIELDS) if (p[k] === 0) { p[k] = null; n++; }
    }
    if (!n) continue;
    touchedFiles++;
    touchedCells += n;
    if (apply) writeJsonAtomic(file, d, { spaces: 0 });
  }

  console.log(
    `${apply ? "✔ reparados" : "(dry-run) reparariam-se"} ${touchedCells} valores 0→null ` +
    `em ${touchedFiles} de ${files.length} eventos.` +
    (apply ? "" : "  → correr com --apply")
  );
}
main();
