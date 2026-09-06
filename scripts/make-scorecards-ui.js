// make-scorecards-ui.js (v46 - data.json only, no HTML)
// Usage: node make-scorecards-ui.js [FED ...] | --all
const fs = require("fs");
const path = require("path");

// --- Server-side modules ---
const { DEFAULT_TEE_COLORS } = require("../lib/tee-colors");
const { discoverPlayers } = require("../lib/players");
const { extractAllPlayerStats } = require("../lib/cross-stats");
const { preparePlayerData } = require("../lib/process-data");
const { writeJsonAtomicVerified } = require("../lib/atomic-write");

/* ——————————— processPlayer ——————————— */
function processPlayer(FED, allPlayers, crossStats) {
  const data = preparePlayerData(FED, allPlayers, crossStats);

  const {
    playerName,
    courses, holeScores,
    eclecticByCourse, eclecticDetails, courseHoleStats,
    hcpInfo,
    generatedDate, lastRoundDate, analysisDir
  } = data;

  // Ensure output directory
  if (!fs.existsSync(analysisDir)) fs.mkdirSync(analysisDir, { recursive: true });

  // Write data.json (used by React app)
  const nowDate = new Date().toLocaleDateString('pt-PT');
  const nowTime = new Date().toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'});
  const jsonData = {
    DATA: courses,
    // FRAG removed — scorecards render natively from HOLES data
    HOLES: holeScores,
    EC: eclecticByCourse,
    ECDET: eclecticDetails,
    HOLE_STATS: courseHoleStats,
    TEE: DEFAULT_TEE_COLORS,
    // ⚠ CROSS_DATA NÃO vai aqui — ver writeCrossData(). Era a mesma tabela
    // global de todos os jogadores repetida em cada data.json (9,4 MB × 678
    // ficheiros = 6,4 GB), o que sozinho enchia o Deployment Storage do
    // Vercel e obrigava cada ficha de jogador a descarregar 10 MB.
    CURRENT_FED: FED,
    HCP_INFO: hcpInfo,
    META: {
      lastUpdate: nowDate + " " + nowTime,
      lastRoundDate: lastRoundDate,
      generatedDate: generatedDate,
    }
  };
  const jsonPath = path.join(analysisDir, "data.json");
  // ⚠ Usar writeJsonAtomicVerified (não writeFileSync) — em mounts Windows
  // com ficheiros >4MB, writeFileSync sem fsync trunca aleatoriamente.
  // O verified faz fsync + verifica JSON parse + re-tenta uma vez se truncar.
  // indent=0 para compactar (data.json é grande, sem indentação economiza ~30%).
  writeJsonAtomicVerified(jsonPath, jsonData, 0);

  console.log("OK -> " + jsonPath);
}

/* ——————————— cross-data.json (tabela global, 1 cópia) ———————————
 * O `CROSS_DATA` é uma tabela indexada por federado — igual para todos os
 * jogadores. Vivia DENTRO de cada `output/{fed}/analysis/data.json`; agora é
 * um ficheiro único servido em `/data/cross-data.json` e carregado uma vez
 * pelo browser (o `playerDataLoader` funde-o com a ficha do jogador).
 * Escrito em TODOS os runs, mesmo incrementais: o `crossStats` é sempre
 * calculado sobre todos os jogadores descobertos em `output/`.
 */
function writeCrossData(crossStats) {
  const out = path.join(process.cwd(), "public", "data", "cross-data.json");
  writeJsonAtomicVerified(out, crossStats || {}, 0);
  const mb = (fs.statSync(out).size / 1048576).toFixed(2);
  console.log("OK -> " + out + " (" + Object.keys(crossStats || {}).length + " jogadores, " + mb + " MB)");
}

/* ——————————— Entry point ——————————— */
(async () => {
  const args = process.argv.slice(2).map(a => a.trim()).filter(Boolean);
  const outputRoot = path.join(process.cwd(), "output");

  let targetFeds = null;
  if (args.length === 0 || args[0] === "--all") {
    console.log("Modo: todos os jogadores");
  } else if (args.every(a => /^\d+$/.test(a))) {
    targetFeds = args;
    const preview = targetFeds.slice(0, 5).join(", ") + (targetFeds.length > 5 ? ", ... (" + targetFeds.length + " total)" : "");
    console.log("Modo: " + targetFeds.length + " jogador(es) [" + preview + "]");
  } else {
    console.log("\nUso:\n  node make-scorecards-ui.js <FED> [<FED> ...]   Gerar data.json\n  node make-scorecards-ui.js --all                Todos\n  node make-scorecards-ui.js                      Todos\n");
    process.exit(0);
  }

  const allPlayers = discoverPlayers(outputRoot, targetFeds ? targetFeds[0] : null);
  if (allPlayers.length === 0) {
    console.error("Nenhum jogador encontrado em output/");
    process.exit(1);
  }

  const toProcess = targetFeds
    ? allPlayers.filter(p => targetFeds.includes(p.fed))
    : allPlayers;

  if (toProcess.length === 0) {
    console.error("Nenhum dos FEDs indicados foi encontrado em output/");
    process.exit(1);
  }

  console.log("\nEncontrados " + allPlayers.length + " jogadores, a processar " + toProcess.length + "\n");
  const crossStats = extractAllPlayerStats(allPlayers, outputRoot);
  writeCrossData(crossStats);

  let ok = 0, fail = 0;
  for (const p of toProcess) {
    try {
      processPlayer(p.fed, allPlayers, crossStats);
      ok++;
    } catch (e) {
      console.error("Erro ao processar " + p.name + " (" + p.fed + "):", e.message || e);
      fail++;
    }
  }
  console.log("\n✓ " + ok + " jogador(es) processados" + (fail > 0 ? ", " + fail + " erro(s)" : "") + ".");
})();
