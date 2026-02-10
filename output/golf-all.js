// golf-all.js — Pipeline completo de scorecards FPG
// Combina: login.js + download-fpg.js + download-scorecards.js + make-scorecards-ui.js
//
// Uso:
//   node golf-all.js [opções] <NUM_FEDERADO> [<NUM_FEDERADO> ...]
//
// Opções:
//   --login          Forçar passo de login (abre browser para login manual)
//   --refresh        Actualizar: re-descarrega lista WHS + só scorecards novos
//   --skip-download  Saltar downloads (usar dados já existentes)
//   --skip-render    Saltar geração do HTML final
//   --force          Re-descarregar TUDO (lista + todos os scorecards)
//
// Exemplos:
//   node golf-all.js 52884                      # Um atleta (primeira vez)
//   node golf-all.js --refresh 52884 12345      # Apanhar novos scorecards
//   node golf-all.js --login 52884              # Forçar login + pipeline
//   node golf-all.js --skip-download 52884      # Só gerar HTML (dados já existem)
//   node golf-all.js --force 52884              # Re-descarregar tudo
//
// Requisitos: npm install playwright
// Nota: make-scorecards-ui.js deve estar na mesma pasta para o passo de render.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { chromium } = require("playwright");

// ===== PARSE ARGUMENTOS =====
const args = process.argv.slice(2);
let doLoginFlag = false;
let skipDownload = false;
let skipRender = false;
let forceFlag = false;
let refreshFlag = false;
const fedCodes = [];

for (const a of args) {
  if (a === "--login")         { doLoginFlag = true; continue; }
  if (a === "--refresh")       { refreshFlag = true; continue; }
  if (a === "--skip-download") { skipDownload = true; continue; }
  if (a === "--skip-render")   { skipRender = true; continue; }
  if (a === "--force")         { forceFlag = true; continue; }
  if (/^\d+$/.test(a))        { fedCodes.push(a); continue; }
  console.error(`Argumento desconhecido: ${a}`);
  process.exit(1);
}

if (fedCodes.length === 0) {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  golf-all.js — Pipeline completo de scorecards FPG  ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  Uso:                                                ║
║    node golf-all.js [opções] <FED> [<FED> ...]       ║
║                                                      ║
║  Opções:                                             ║
║    --login          Forçar login manual               ║
║    --refresh        Apanhar novos (recomendado)       ║
║    --skip-download  Saltar downloads                  ║
║    --skip-render    Saltar geração HTML               ║
║    --force          Re-descarregar tudo               ║
║                                                      ║
║  Exemplos:                                           ║
║    node golf-all.js 52884                            ║
║    node golf-all.js --refresh 52884 12345            ║
║    node golf-all.js --skip-download 52884            ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
`);
  process.exit(0);
}

// ===== HELPERS DE LOG =====
const BLUE = "\x1b[34m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function logStep(icon, msg)  { console.log(`\n${BLUE}${icon}${RESET} ${BOLD}${msg}${RESET}`); }
function logOK(msg)          { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function logWarn(msg)        { console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }
function logErr(msg)         { console.error(`  ${RED}✗${RESET} ${msg}`); }
function logInfo(msg)        { console.log(`  ${DIM}${msg}${RESET}`); }

// ===== PASSO 1: LOGIN =====
async function doLogin() {
  logStep("🔑", "LOGIN — Abrir browser para login manual");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`
  ${YELLOW}╭──────────────────────────────────────────────────╮${RESET}
  ${YELLOW}│  INSTRUÇÕES DE LOGIN:                            │${RESET}
  ${YELLOW}│                                                  │${RESET}
  ${YELLOW}│  1. Faz login manualmente (user/pass)            │${RESET}
  ${YELLOW}│  2. Navega para:                                 │${RESET}
  ${YELLOW}│     https://my.fpg.pt/Home/Results.aspx          │${RESET}
  ${YELLOW}│  3. Confirma que consegues abrir:                │${RESET}
  ${YELLOW}│     https://scoring.fpg.pt/lists/PlayerWHS.aspx  │${RESET}
  ${YELLOW}│  4. Volta aqui e carrega ENTER                   │${RESET}
  ${YELLOW}╰──────────────────────────────────────────────────╯${RESET}
`);

  await page.goto("https://area.my.fpg.pt/login/", { waitUntil: "domcontentloaded" });

  await new Promise((resolve) => {
    process.stdin.once("data", resolve);
  });

  await context.storageState({ path: "session.json" });
  logOK("Sessão guardada em session.json");
  await browser.close();
}

// ===== PASSO 2: DOWNLOAD WHS LIST =====
async function downloadWHS(page, fedCode, outDir) {
  logStep("📋", `[${fedCode}] Descarregar lista WHS`);

  const whsPath = path.join(outDir, "whs-list.json");
  if (!forceFlag && !refreshFlag && fs.existsSync(whsPath)) {
    const raw = JSON.parse(fs.readFileSync(whsPath, "utf-8"));
    const count = raw?.Records?.length || 0;
    logOK(`Já existe (${count} registos) — a saltar. Usa --refresh para actualizar.`);
    return true;
  }

  // Aquecer SSO
  await page.goto("https://my.fpg.pt/Home/Results.aspx", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.goto(`https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=${fedCode}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  const pageSize = 100;
  let startIndex = 0;
  const all = [];

  while (true) {
    const jtStartIndex = String(startIndex);
    const jtPageSize = String(pageSize);

    const url =
      `PlayerWHS.aspx/HCPWhsFederLST?fed_code=${fedCode}` +
      `&jtStartIndex=${jtStartIndex}&jtPageSize=${jtPageSize}`;

    const result = await page.evaluate(async ({ url, FED_CODE, jtStartIndex, jtPageSize }) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-requested-with": "XMLHttpRequest",
          "accept": "application/json, text/javascript, */*; q=0.01",
          "content-type": "application/json; charset=utf-8"
        },
        body: JSON.stringify({
          fed_code: String(FED_CODE),
          jtStartIndex: String(jtStartIndex),
          jtPageSize: String(jtPageSize)
        })
      });
      const text = await res.text();
      return { status: res.status, text };
    }, { url, FED_CODE: fedCode, jtStartIndex, jtPageSize });

    if (result.status !== 200) {
      fs.writeFileSync(path.join(outDir, "whs-list-raw.txt"), result.text, "utf-8");
      logErr(`HTTP ${result.status} — ver ${outDir}/whs-list-raw.txt`);
      return false;
    }

    const json = JSON.parse(result.text);
    const payload = json?.d ?? json;

    if (payload?.Result !== "OK") {
      fs.writeFileSync(path.join(outDir, "whs-list-debug.json"), JSON.stringify(payload, null, 2), "utf-8");
      logErr(`Resposta inesperada — ver ${outDir}/whs-list-debug.json`);
      return false;
    }

    const records = payload.Records || [];
    all.push(...records);

    if (records.length < pageSize) break;
    startIndex += pageSize;
  }

  const final = { Result: "OK", Records: all };
  fs.writeFileSync(whsPath, JSON.stringify(final, null, 2), "utf-8");
  logOK(`${all.length} registos → ${whsPath}`);
  return true;
}

// ===== PASSO 3: DOWNLOAD SCORECARDS =====
async function downloadScorecards(page, fedCode, outDir) {
  logStep("🃏", `[${fedCode}] Descarregar scorecards`);

  const inputFile = path.join(outDir, "whs-list.json");
  if (!fs.existsSync(inputFile)) {
    logErr(`Não encontrei: ${inputFile}`);
    return false;
  }

  const raw = JSON.parse(fs.readFileSync(inputFile, "utf-8"));
  const records = raw?.Records || [];

  if (records.length === 0) {
    logWarn("Lista WHS vazia — nada para descarregar.");
    return true;
  }

  const scorecardsDir = path.join(outDir, "scorecards");
  fs.mkdirSync(scorecardsDir, { recursive: true });

  const failed = [];
  let ok = 0;
  let skipped = 0;

  async function fetchOne(r) {
    const scoreId = r.score_id;
    const scoringType = r.scoring_type_id;
    const competitionType = r.competition_type_id;

    const url =
      `PlayerWHS.aspx/ScoreCard?score_id=${scoreId}` +
      `&scoringtype=${scoringType}` +
      `&competitiontype=${competitionType}`;

    const result = await page.evaluate(async ({ url, scoreId, scoringType, competitionType }) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-requested-with": "XMLHttpRequest",
          "content-type": "application/json; charset=utf-8"
        },
        body: JSON.stringify({
          score_id: String(scoreId),
          scoringtype: String(scoringType),
          competitiontype: String(competitionType)
        })
      });
      const text = await res.text();
      return { status: res.status, text };
    }, { url, scoreId, scoringType, competitionType });

    if (result.status !== 200) return null;

    try {
      const json = JSON.parse(result.text);
      return json?.d ?? json;
    } catch {
      return null;
    }
  }

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const filePath = path.join(scorecardsDir, `${r.score_id}.json`);

    if (!forceFlag && fs.existsSync(filePath)) {
      ok++;
      skipped++;
      continue;
    }

    let data = await fetchOne(r);

    // retry 1x
    if (!data) {
      await new Promise(res => setTimeout(res, 500));
      data = await fetchOne(r);
    }

    if (!data || data.Result !== "OK") {
      failed.push(r.score_id);
      continue;
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    ok++;

    // Progresso a cada 20
    if ((i + 1) % 20 === 0) {
      logInfo(`Progresso: ${i + 1}/${records.length} (${ok} OK, ${failed.length} falhas)`);
    }
  }

  fs.writeFileSync(
    path.join(outDir, "failed-scorecards.json"),
    JSON.stringify(failed, null, 2),
    "utf-8"
  );

  logOK(`${ok} scorecards (${skipped} já existiam, ${failed.length} falhas)`);
  if (failed.length > 0) {
    logWarn(`Falhas: ver ${outDir}/failed-scorecards.json`);
  }
  return true;
}

// ===== PASSO 4: GERAR HTML (chama make-scorecards-ui.js) =====
function generateUI(fedCode) {
  logStep("🎨", `[${fedCode}] Gerar relatório HTML`);

  const uiScript = path.join(process.cwd(), "make-scorecards-ui.js");
  if (!fs.existsSync(uiScript)) {
    logErr(`Não encontrei: ${uiScript}`);
    logInfo("Coloca make-scorecards-ui.js na mesma pasta deste script.");
    return false;
  }

  try {
    execSync(`node "${uiScript}" ${fedCode}`, {
      stdio: "inherit",
      cwd: process.cwd()
    });
    logOK(`Relatório gerado em output/${fedCode}/analysis/by-course-ui.html`);
    return true;
  } catch (err) {
    logErr(`Erro ao gerar HTML: ${err.message}`);
    return false;
  }
}

// ===== MAIN =====
(async () => {
  const sessionPath = path.join(process.cwd(), "session.json");
  const needLogin = doLoginFlag || !fs.existsSync(sessionPath);

  console.log(`
${BOLD}╔══════════════════════════════════════════════════════╗${RESET}
${BOLD}║       golf-all.js — Pipeline FPG Scorecards         ║${RESET}
${BOLD}╠══════════════════════════════════════════════════════╣${RESET}
${BOLD}║${RESET}  Federados: ${fedCodes.join(", ").padEnd(39)}${BOLD}║${RESET}
${BOLD}║${RESET}  Login:     ${(needLogin ? "Sim" : "Sessão existente").padEnd(39)}${BOLD}║${RESET}
${BOLD}║${RESET}  Modo:      ${(skipDownload ? "Só render" : forceFlag ? "Forçar tudo" : refreshFlag ? "Refresh (novos)" : "Normal").padEnd(39)}${BOLD}║${RESET}
${BOLD}║${RESET}  Download:  ${(skipDownload ? "Saltar" : "Sim").padEnd(39)}${BOLD}║${RESET}
${BOLD}║${RESET}  Render:    ${(skipRender ? "Saltar" : "Sim").padEnd(39)}${BOLD}║${RESET}
${BOLD}║${RESET}  Forçar:    ${(forceFlag ? "Sim" : "Não").padEnd(39)}${BOLD}║${RESET}
${BOLD}╚══════════════════════════════════════════════════════╝${RESET}
`);

  // PASSO 1: Login (se necessário)
  if (needLogin && !skipDownload) {
    await doLogin();
  }

  let browser, context, page;

  // PASSO 2 & 3: Downloads
  if (!skipDownload) {
    if (!fs.existsSync(sessionPath)) {
      logErr("Não existe session.json — corre primeiro com --login");
      process.exit(1);
    }

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ storageState: sessionPath });
    page = await context.newPage();
    page.setDefaultTimeout(60000);

    for (const fed of fedCodes) {
      const outDir = path.join(process.cwd(), "output", fed);
      fs.mkdirSync(outDir, { recursive: true });

      // Aquecer sessão (uma vez por federado)
      await page.goto("https://my.fpg.pt/Home/Results.aspx", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      await page.goto(`https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=${fed}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      const whsOk = await downloadWHS(page, fed, outDir);
      if (!whsOk) {
        logErr(`[${fed}] Falha no download WHS — a saltar scorecards.`);
        continue;
      }

      await downloadScorecards(page, fed, outDir);
    }

    await browser.close();
  }

  // PASSO 4: Render HTML
  if (!skipRender) {
    for (const fed of fedCodes) {
      generateUI(fed);
    }
  }

  // RESUMO
  logStep("📊", "RESUMO FINAL");
  for (const fed of fedCodes) {
    const outDir = path.join(process.cwd(), "output", fed);
    const whsPath = path.join(outDir, "whs-list.json");
    const scDir = path.join(outDir, "scorecards");
    const htmlPath = path.join(outDir, "analysis", "by-course-ui.html");

    const whsCount = fs.existsSync(whsPath)
      ? (JSON.parse(fs.readFileSync(whsPath, "utf-8"))?.Records?.length || 0)
      : 0;
    const scCount = fs.existsSync(scDir)
      ? fs.readdirSync(scDir).filter(f => f.endsWith(".json")).length
      : 0;
    const hasHtml = fs.existsSync(htmlPath);

    console.log(`
  ${BOLD}Federado ${fed}:${RESET}
    WHS registos:  ${whsCount}
    Scorecards:    ${scCount}
    HTML gerado:   ${hasHtml ? GREEN + "✓" + RESET + " " + htmlPath : RED + "✗" + RESET}
`);
  }

  console.log(`${GREEN}${BOLD}Concluído!${RESET}\n`);
  process.exit(0);
})();
