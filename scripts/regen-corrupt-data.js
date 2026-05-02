#!/usr/bin/env node
// scripts/regen-corrupt-data.js
// ─────────────────────────────────────────────────────────────────────────────
// Verifica todos os output/{fed}/analysis/data.json e re-gera só os corruptos.
//
// Quando o `golf-all.js --skip-download --all` corre em mounts virtiofs/Windows
// com files grandes (>4 MB), ocasionalmente alguns ficheiros saem truncados a
// meio. O `writeJsonAtomicVerified` (lib/atomic-write.js) tem agora 4 retries
// com backoff exponencial, mas para limpar ficheiros JÁ corruptos sem re-correr
// a pipeline inteira, usar este script.
//
// USAGE:
//   node scripts/regen-corrupt-data.js              # listar + regenerar
//   node scripts/regen-corrupt-data.js --dry-run    # só listar, não regenerar
//   node scripts/regen-corrupt-data.js --concurrency 3
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(REPO, "output");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run") || args.includes("-n");
const CONCURRENCY = (() => {
  const i = args.indexOf("--concurrency");
  return i >= 0 ? parseInt(args[i + 1], 10) : 1;
})();

function isJsonValid(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    JSON.parse(raw);
    return { ok: true, size: raw.length };
  } catch (e) {
    let size = 0;
    try { size = fs.statSync(filePath).size; } catch (_) {}
    return { ok: false, error: String(e.message || e).slice(0, 80), size };
  }
}

function listAllFeds() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.error("Directório output/ não existe:", OUTPUT_DIR);
    process.exit(1);
  }
  return fs.readdirSync(OUTPUT_DIR)
    .filter(f => /^\d+$/.test(f))
    .filter(f => fs.existsSync(path.join(OUTPUT_DIR, f, "analysis", "data.json")));
}

function findCorrupted() {
  const feds = listAllFeds();
  const corrupted = [];
  let n = 0;
  for (const fed of feds) {
    n++;
    if (n % 50 === 0) process.stdout.write(`  …verificados ${n}/${feds.length}\r`);
    const fp = path.join(OUTPUT_DIR, fed, "analysis", "data.json");
    const v = isJsonValid(fp);
    if (!v.ok) corrupted.push({ fed, size: v.size, error: v.error });
  }
  return { total: feds.length, corrupted };
}

async function regenOne(fed) {
  // Chamar `node make-scorecards-ui.js {fed}` (que chama preparePlayerData
  // + writeJsonAtomicVerified). Isto NÃO faz download — só re-gera o data.json
  // a partir dos ficheiros já em output/{fed}/.
  const script = path.join(REPO, "scripts", "make-scorecards-ui.js");
  if (!fs.existsSync(script)) {
    console.error("scripts/make-scorecards-ui.js não encontrado");
    process.exit(1);
  }
  const result = spawnSync("node", [script, fed], {
    cwd: REPO,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    fed,
    code: result.status,
    stdout: (result.stdout || "").slice(-200),
    stderr: (result.stderr || "").slice(-200),
  };
}

(async () => {
  console.log("[regen-corrupt-data] A verificar todos os data.json em " + OUTPUT_DIR);
  const t0 = Date.now();
  const { total, corrupted } = findCorrupted();
  console.log("\n[regen-corrupt-data] " + total + " jogadores · " + corrupted.length + " corruptos (" + Math.round(corrupted.length / total * 100) + "%)");

  if (corrupted.length === 0) {
    console.log("✓ Nada a fazer — todos os data.json estão íntegros.");
    process.exit(0);
  }

  console.log("\nFicheiros corruptos:");
  for (const c of corrupted) {
    console.log("  fed " + c.fed + " (" + Math.round(c.size / 1024) + " KB) — " + c.error);
  }

  if (DRY_RUN) {
    console.log("\n[--dry-run] não regenerei. Corre sem --dry-run para fixar.");
    process.exit(0);
  }

  console.log("\n[regen-corrupt-data] A regenerar " + corrupted.length + " ficheiros (concurrency=" + CONCURRENCY + ")…");
  let ok = 0, failed = 0;
  const queue = corrupted.slice();
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const r = await regenOne(item.fed);
      if (r.code === 0) {
        // Re-verificar
        const v = isJsonValid(path.join(OUTPUT_DIR, item.fed, "analysis", "data.json"));
        if (v.ok) {
          ok++;
          process.stdout.write(`  ✓ fed ${item.fed} ok (${ok + failed}/${corrupted.length})\r`);
        } else {
          failed++;
          console.log("  ✗ fed " + item.fed + " ainda corrupto após regen — " + v.error);
        }
      } else {
        failed++;
        console.log("  ✗ fed " + item.fed + " regen falhou (exit " + r.code + ") — " + r.stderr);
      }
    }
  });
  await Promise.all(workers);

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("\n\n[regen-corrupt-data] Concluído em " + dt + "s");
  console.log("  Re-gerados OK: " + ok);
  console.log("  Falhados:      " + failed);
  if (failed > 0) {
    console.log("\n⚠ Alguns ficheiros continuam a falhar. Re-correr o script ou investigar manualmente.");
    process.exit(2);
  }
})();
