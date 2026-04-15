#!/usr/bin/env node
/**
 * run-scrape-drive-headless.js
 *
 * Wrapper Playwright que corre `scrape-drive-aquapor-v8.js` (script de browser
 * console) de forma automatizada, sem intervenção manual. Capta os outputs
 * mensais via `window._monthlyData` em vez do download do browser.
 *
 * Fonte: `scoring.datagolf.pt/pt/tournaments.aspx` (página pública, sem login)
 *
 * Output: escreve para `public/data/drive-data-YYYY-MM.json` e
 *         `public/data/aquapor-data-YYYY-MM.json`
 *
 * Uso:
 *   node scripts/run-scrape-drive-headless.js
 *   HEADLESS=false node scripts/run-scrape-drive-headless.js   (debug, browser visível)
 *
 * Exit codes:
 *   0  → concluído com sucesso
 *   1  → erro geral (script crash, timeout, etc.)
 *   2  → nada mudou (nenhum ficheiro novo/modificado — útil para workflows)
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const V8_SCRIPT = path.join(REPO_ROOT, "scrape-drive-aquapor-v8.js");
const OUTPUT_DIR = path.join(REPO_ROOT, "public", "data");
const URL = "https://scoring.datagolf.pt/pt/tournaments.aspx";
const HEADLESS = process.env.HEADLESS !== "false";
const TIMEOUT_MS = 60 * 60 * 1000; // 1 hora

// ── Colour helpers ──
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m", X = "\x1b[0m";

function sha1Short(buf) {
  return require("crypto").createHash("sha1").update(buf).digest("hex").slice(0, 10);
}

function totalsOf(data) {
  return {
    torneios: data?.totalTournaments ?? data?.tournaments?.length ?? 0,
    jogadores: data?.totalPlayers ?? 0,
    scorecards: data?.totalScorecards ?? 0,
  };
}

async function main() {
  if (!fs.existsSync(V8_SCRIPT)) {
    console.error(R + "ERRO: não encontrado " + V8_SCRIPT + X);
    process.exit(1);
  }
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const scriptSource = fs.readFileSync(V8_SCRIPT, "utf8");
  console.log(C + "→ Playwright: lançar Chromium (headless=" + HEADLESS + ")" + X);

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capturar logs da página para debug
  page.on("console", msg => {
    const t = msg.type();
    const txt = msg.text();
    if (t === "error") console.log(R + "[page error] " + txt + X);
    else if (t === "warning") console.log(Y + "[page warn] " + txt + X);
    else if (txt.startsWith("💾") || txt.startsWith("CONCLUÍDO") || txt.startsWith("═══")) {
      console.log(G + "[page] " + txt + X);
    } else {
      console.log("[page] " + txt);
    }
  });
  page.on("pageerror", err => console.log(R + "[pageerror] " + err.message + X));

  console.log(C + "→ Navegar " + URL + X);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // Esperar que a página carregue o script do tournaments (jTable, etc.)
  await page.waitForTimeout(3000);

  // Preparar flag de conclusão
  await page.evaluate(() => { window.__DONE__ = false; });

  // Injectar script v8 + marcar conclusão quando termina
  // O v8 escreve para window._monthlyData e chama downloadJSON() para cada mês.
  // Precisamos interceptar downloadJSON para não poluir o filesystem do headless
  // e capturar o JSON directamente — mas o v8 já escreve também em window._monthlyData,
  // por isso basta no-op do download e esperar que termine.
  const wrappedScript = `
    (async () => {
      try {
        // No-op nos downloads — ainda queremos que o script popule _monthlyData
        window.URL.createObjectURL = () => "blob:noop";
        const origClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function() { /* swallow */ };

        ${scriptSource}
      } finally {
        window.__DONE__ = true;
      }
    })();
  `;

  console.log(C + "→ Injectar v8 e esperar conclusão (timeout " + (TIMEOUT_MS/60000) + " min)" + X);
  await page.evaluate(wrappedScript);

  // Esperar até window.__DONE__ = true
  await page.waitForFunction(() => window.__DONE__ === true, { timeout: TIMEOUT_MS });

  // Ler window._monthlyData
  const monthlyData = await page.evaluate(() => window._monthlyData || {});
  const keys = Object.keys(monthlyData);
  console.log(C + "→ Capturados " + keys.length + " ficheiros mensais do browser" + X);

  if (keys.length === 0) {
    console.error(R + "ERRO: nenhum ficheiro capturado — script pode ter falhado" + X);
    await browser.close();
    process.exit(1);
  }

  // ─ Comparar com ficheiros existentes e escrever só os diferentes ─
  let written = 0;
  let unchanged = 0;
  let newTotals = { torneios: 0, jogadores: 0, scorecards: 0 };
  let oldTotals = { torneios: 0, jogadores: 0, scorecards: 0 };

  for (const key of keys) {
    // key = "drive_2026-03" ou "aquapor_2026-03"
    const [circuit, month] = key.split("_");
    const filename = `${circuit}-data-${month}.json`;
    const filepath = path.join(OUTPUT_DIR, filename);
    const newObj = monthlyData[key];

    // Remover campo `_gerado_em` ou timestamps antes de comparar, se houver
    const newJson = JSON.stringify(newObj, (k, v) => (k === "gerado_em" || k === "_gerado_em") ? undefined : v, 2);

    const nT = totalsOf(newObj);
    newTotals.torneios += nT.torneios;
    newTotals.jogadores += nT.jogadores;
    newTotals.scorecards += nT.scorecards;

    let oldJson = null;
    let oldObj = null;
    if (fs.existsSync(filepath)) {
      try {
        oldObj = JSON.parse(fs.readFileSync(filepath, "utf8"));
        oldJson = JSON.stringify(oldObj, (k, v) => (k === "gerado_em" || k === "_gerado_em") ? undefined : v, 2);
        const oT = totalsOf(oldObj);
        oldTotals.torneios += oT.torneios;
        oldTotals.jogadores += oT.jogadores;
        oldTotals.scorecards += oT.scorecards;
      } catch (e) {
        console.log(Y + "  aviso: " + filename + " existe mas não parseia — vai ser sobrescrito" + X);
      }
    }

    if (oldJson === newJson) {
      unchanged++;
      continue;
    }

    // Escrever ficheiro com JSON original (com timestamps)
    fs.writeFileSync(filepath, JSON.stringify(newObj, null, 2));
    written++;

    const oT = oldObj ? totalsOf(oldObj) : { torneios: 0, jogadores: 0, scorecards: 0 };
    const diffT = nT.torneios - oT.torneios;
    const diffS = nT.scorecards - oT.scorecards;
    const marker = oldJson === null ? G + "NOVO" : (diffS > 0 || diffT > 0 ? G + "MAIS" : Y + "MUDOU");
    console.log(`  ${marker}${X} ${filename} → ${nT.torneios}T/${nT.jogadores}J/${nT.scorecards}SC` +
                (oldJson !== null ? ` (era ${oT.torneios}T/${oT.jogadores}J/${oT.scorecards}SC, Δ ${diffT}T/${diffS}SC)` : ""));
  }

  await browser.close();

  // ─ Resumo final + exit code ─
  console.log("");
  console.log(C + "═══ RESUMO ═══" + X);
  console.log(`  Ficheiros capturados: ${keys.length}`);
  console.log(`  Escritos (novos ou modificados): ${G}${written}${X}`);
  console.log(`  Inalterados: ${unchanged}`);
  console.log(`  Totais novos: ${newTotals.torneios} torneios, ${newTotals.jogadores} jogadores, ${newTotals.scorecards} scorecards`);
  console.log(`  Totais antigos: ${oldTotals.torneios} torneios, ${oldTotals.jogadores} jogadores, ${oldTotals.scorecards} scorecards`);

  const gained = (newTotals.torneios > oldTotals.torneios) ||
                 (newTotals.jogadores > oldTotals.jogadores) ||
                 (newTotals.scorecards > oldTotals.scorecards);

  if (!gained && written === 0) {
    console.log(Y + "\nNada de novo — o workflow NÃO deve fazer commit." + X);
    process.exit(2);
  }

  if (!gained && written > 0) {
    console.log(Y + "\nFicheiros foram modificados mas totais não aumentaram." + X);
    console.log(Y + "Provavelmente refresh de scorecards já existentes. Sair com código 2 (sem commit)." + X);
    process.exit(2);
  }

  console.log(G + "\n✓ Há mais informação — seguro fazer commit." + X);
  process.exit(0);
}

main().catch(err => {
  console.error(R + "ERRO FATAL: " + (err.stack || err.message) + X);
  process.exit(1);
});
