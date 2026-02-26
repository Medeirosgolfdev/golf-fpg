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
//   --skip-render    Saltar geração de dados
//   --force          Re-descarregar TUDO (lista + todos os scorecards)
//   --sync-players   Apenas sincronizar players.json com dados WHS existentes
//
// Exemplos:
//   node golf-all.js 52884                      # Um atleta (primeira vez)
//   node golf-all.js --refresh 52884 12345      # Apanhar novos scorecards
//   node golf-all.js --login 52884              # Forçar login + pipeline
//   node golf-all.js --skip-download 52884      # Só gerar dados (downloads já existem)
//   node golf-all.js --force 52884              # Re-descarregar tudo
//
// Requisitos: npm install playwright
// Nota: make-scorecards-ui.js deve estar na mesma pasta para o passo de render.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { chromium, firefox } = require("playwright");

/** Ler JSON de ficheiro, removendo BOM se existir */
function readJSON(fpath) {
  let txt = fs.readFileSync(fpath, "utf-8");
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
  return JSON.parse(txt);
}

// ===== PARSE ARGUMENTOS =====
const args = process.argv.slice(2);
let doLoginFlag = false;
let skipDownload = false;
let skipRender = false;
let forceFlag = false;
let refreshFlag = false;
const fedCodes = [];

let allFlag = false;
let priorityFlag = false;
let syncPlayersFlag = false;

for (const a of args) {
  if (a === "--login")         { doLoginFlag = true; continue; }
  if (a === "--refresh")       { refreshFlag = true; continue; }
  if (a === "--skip-download") { skipDownload = true; continue; }
  if (a === "--skip-render")   { skipRender = true; continue; }
  if (a === "--force")         { forceFlag = true; continue; }
  if (a === "--all")           { allFlag = true; continue; }
  if (a === "--priority")      { priorityFlag = true; continue; }
  if (a === "--sync-players")  { syncPlayersFlag = true; continue; }
  if (/^\d+$/.test(a))        { fedCodes.push(a); continue; }
  console.error(`Argumento desconhecido: ${a}`);
  process.exit(1);
}

// --all: ler todos os federados do players.json
if (allFlag && fedCodes.length === 0) {
  const pPath = path.join(process.cwd(), "players.json");
  if (fs.existsSync(pPath)) {
    const db = readJSON(pPath);
    fedCodes.push(...Object.keys(db));
    console.log(`--all: ${fedCodes.length} federados carregados de players.json`);
  } else {
    console.error("--all: não encontrei players.json");
    process.exit(1);
  }
}

// --priority: filtrar jogadores prioritários do players.json
if (priorityFlag && fedCodes.length === 0) {
  const pPath = path.join(process.cwd(), "players.json");
  if (fs.existsSync(pPath)) {
    const db = readJSON(pPath);
    for (const [k, v] of Object.entries(db)) {
      if (v.tags && v.tags.includes("no-priority")) continue;
      const isPJA = v.tags && v.tags.includes("PJA");
      const isMAD = v.region === "Madeira";
      const isS12 = v.escalao === "Sub-12" && v.hcp != null && v.hcp < 35;
      const isS14 = v.escalao === "Sub-14" && v.hcp != null && v.hcp < 25;
      if (isPJA || isMAD || isS12 || isS14) fedCodes.push(k);
    }
    console.log("--priority: " + fedCodes.length + " jogadores prioritários carregados");
  } else {
    console.error("--priority: não encontrei players.json");
    process.exit(1);
  }
}

// --sync-players: apenas sync players.json sem download ou render
if (syncPlayersFlag) {
  const pPath = path.join(process.cwd(), "players.json");
  if (fs.existsSync(pPath)) {
    const db = readJSON(pPath);
    const allFeds = Object.keys(db);
    console.log(`--sync-players: sincronizar ${allFeds.length} jogadores`);
    syncPlayersJson(allFeds);
    console.log("Sync concluído.");
    process.exit(0);
  } else {
    console.error("--sync-players: não encontrei players.json");
    process.exit(1);
  }
}

if (fedCodes.length === 0) {
  console.log(`
╔══════════════════════════════════════════════════════╗
║       golf-all.js — Pipeline FPG Scorecards         ║
╠══════════════════════════════════════════════════════╣
║  Uso: node golf-all.js [opcoes] <federados...>      ║
║                                                      ║
║  Opcoes:                                             ║
║    --priority       So jogadores prioritarios        ║
║    --all            Todos de players.json            ║
║    --refresh        Actualizar (so novos scorecards) ║
║    --force          Re-descarregar tudo              ║
║    --skip-download  So gerar HTML                    ║
║    --skip-render    So descarregar, sem HTML         ║
║    --login          Forcar novo login                ║
║    --sync-players   So sincronizar players.json      ║
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

// ===== LOGIN — integrado no MAIN (usa browser real via channel) =====

// ===== PASSO 2: DOWNLOAD WHS LIST =====
async function downloadWHS(page, fedCode, outDir) {
  logStep("📋", `[${fedCode}] Descarregar lista WHS`);

  const whsPath = path.join(outDir, "whs-list.json");
  if (!forceFlag && !refreshFlag && fs.existsSync(whsPath)) {
    const raw = readJSON(whsPath);
    const count = raw?.Records?.length || 0;
    logOK(`Já existe (${count} registos) — a saltar. Usa --refresh para actualizar.`);
    return true;
  }

  // Aquecer SSO
  await page.goto("https://my.fpg.pt/Home/Results.aspx", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.goto(`https://scoring.fpg.pt/lists/PlayerResults.aspx?no=${fedCode}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  const pageSize = 100;
  let startIndex = 0;
  const all = [];

  while (true) {
    const jtStartIndex = String(startIndex);
    const jtPageSize = String(pageSize);

    const url =
      `PlayerResults.aspx/ResultsLST?fed_code=${fedCode}` +
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
    // Normalizar: garantir que todos os registos têm score_id (a nova API pode usar "id")
    for (const r of records) {
      if (!r.score_id && r.id) r.score_id = r.id;
      if (!r.id && r.score_id) r.id = r.score_id;
    }
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

  const raw = readJSON(inputFile);
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
    const scoreId = r.score_id || r.id;
    const scoringType = r.scoring_type_id;
    const competitionType = r.competition_type_id;

    const url =
      `PlayerResults.aspx/ScoreCard?score_id=${scoreId}` +
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
    const filePath = path.join(scorecardsDir, `${r.score_id || r.id}.json`);

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
      failed.push(r.score_id || r.id);
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

// ===== GERAR DADOS (chama make-scorecards-ui.js em batch) =====
function generateUIBatch(fedList) {
  logStep("🎨", `Gerar dados para ${fedList.length} jogador(es)`);

  const uiScript = path.join(process.cwd(), "make-scorecards-ui.js");
  if (!fs.existsSync(uiScript)) {
    logErr(`Não encontrei: ${uiScript}`);
    logInfo("Coloca make-scorecards-ui.js na mesma pasta deste script.");
    return false;
  }

  try {
    const fedsArg = fedList.join(" ");
    execSync(`node "${uiScript}" ${fedsArg}`, {
      stdio: "inherit",
      cwd: process.cwd(),
      maxBuffer: 50 * 1024 * 1024
    });
    logOK(`${fedList.length} jogador(es) processado(s)`);
    return true;
  } catch (err) {
    logErr(`Erro ao gerar dados: ${err.message}`);
    return false;
  }
}

// ===== SYNC players.json com dados frescos dos scorecards =====
function syncPlayersJson(fedList) {
  const pPath = path.join(process.cwd(), "players.json");
  let playersDb = {};
  try { playersDb = readJSON(pPath); } catch {}

  let updated = 0;
  for (const fed of fedList) {
    const outDir = path.join(process.cwd(), "output", fed);
    const scDir = path.join(outDir, "scorecards");
    const whsPath = path.join(outDir, "whs-list.json");

    // Get current entry or create stub
    let entry = playersDb[fed];
    if (!entry) continue;
    if (typeof entry === "string") entry = { name: entry };

    let changed = false;

    // 1. Extract club from most recent scorecard
    if (fs.existsSync(scDir)) {
      const scFiles = fs.readdirSync(scDir).filter(f => f.endsWith(".json"));
      let latestClub = null;
      let latestClubCode = null;
      let latestDate = 0;
      for (const f of scFiles) {
        try {
          const sc = readJSON(path.join(scDir, f));
          const rec = (sc.Records || [])[0];
          if (!rec) continue;
          const dateMatch = String(rec.played_at || "").match(/Date\((\d+)\)/);
          const d = dateMatch ? Number(dateMatch[1]) : 0;
          if (d > latestDate && rec.player_acronym) {
            latestDate = d;
            latestClub = rec.player_acronym;
            latestClubCode = rec.player_club_code || null;
          }
        } catch {}
      }
      const currentClub = (typeof entry.club === "object" && entry.club) ? entry.club.short : (entry.club || "");
      if (latestClub && latestClub !== currentClub) {
        const oldClub = currentClub;
        // Preserve object structure if it was an object, update all fields
        if (typeof entry.club === "object" && entry.club) {
          entry.club.short = latestClub;
          entry.club.long = latestClub;
          if (latestClubCode) entry.club.code = String(latestClubCode);
        } else {
          entry.club = latestClub;
        }
        changed = true;
        console.log(`  [sync] ${fed}: clube ${oldClub || "?"} \u2192 ${latestClub}`);
      }
    }

    // 2. Extract latest HCP from WHS data
    if (fs.existsSync(whsPath)) {
      try {
        const whs = readJSON(whsPath);
        const rows = (whs?.d ?? whs)?.Records || whs?.Records || [];
        // Find most recent row — new_handicap is the post-round value
        // exact_handicap = prev_handicap (pre-round) — NOT more precise, do NOT use
        let latestHcp = null;
        let latestHcpDate = 0;
        for (const r of rows) {
          const dateMatch = String(r.played_at || r.hcp_date || r.mov_date || "").match(/Date\((\d+)\)/);
          const d = dateMatch ? Number(dateMatch[1]) : 0;
          const nh = r.new_handicap != null ? parseFloat(r.new_handicap) : null;
          if (d > latestHcpDate && nh != null && isFinite(nh)) {
            latestHcpDate = d;
            latestHcp = nh;
          }
        }
        if (latestHcp != null && latestHcp !== entry.hcp) {
          const oldHcp = entry.hcp;
          entry.hcp = latestHcp;
          changed = true;
          console.log(`  [sync] ${fed}: HCP ${oldHcp ?? "?"} → ${latestHcp}`);
        }
      } catch {}
    }

    // 3. Recalculate escalão from dob
    if (entry.dob) {
      const refYear = new Date().getFullYear();
      const y = Number(entry.dob.split("-")[0]);
      if (y) {
        const age = refYear - y;
        let esc = "";
        if (age >= 50) esc = "Sénior";
        else if (age >= 19) esc = "Absoluto";
        else if (age >= 17) esc = "Sub-18";
        else if (age >= 15) esc = "Sub-16";
        else if (age >= 13) esc = "Sub-14";
        else if (age >= 11) esc = "Sub-12";
        else esc = "Sub-10";
        if (esc && esc !== entry.escalao) {
          const oldEsc = entry.escalao;
          entry.escalao = esc;
          changed = true;
          console.log(`  [sync] ${fed}: escalão ${oldEsc || "?"} → ${esc}`);
        }
      }
    }

    if (changed) {
      playersDb[fed] = entry;
      updated++;
    }
  }

  if (updated > 0) {
    fs.writeFileSync(pPath, JSON.stringify(playersDb, null, 2), "utf-8");
    // Copiar para public/data/ (servido ao frontend)
    const publicPath = path.join(process.cwd(), "public", "data", "players.json");
    fs.mkdirSync(path.dirname(publicPath), { recursive: true });
    fs.copyFileSync(pPath, publicPath);
    console.log(`  ✓ players.json actualizado (${updated} jogador(es)) → public/data/`);
  }
}

// ===== MAIN =====
(async () => {
  const profileDir = path.join(process.cwd(), ".playwright-profile");

  console.log(`
${BOLD}╔══════════════════════════════════════════════════════╗${RESET}
${BOLD}║       golf-all.js — Pipeline FPG Scorecards         ║${RESET}
${BOLD}╠══════════════════════════════════════════════════════╣${RESET}
${BOLD}║${RESET}  Federados: ${fedCodes.join(", ").padEnd(39)}${BOLD}║${RESET}
${BOLD}║${RESET}  Modo:      ${(skipDownload ? "Só render" : forceFlag ? "Forçar tudo" : refreshFlag ? "Refresh (novos)" : "Normal").padEnd(39)}${BOLD}║${RESET}
${BOLD}║${RESET}  Download:  ${(skipDownload ? "Saltar" : "Sim").padEnd(39)}${BOLD}║${RESET}
${BOLD}║${RESET}  Render:    ${(skipRender ? "Saltar" : "Sim").padEnd(39)}${BOLD}║${RESET}
${BOLD}║${RESET}  Forçar:    ${(forceFlag ? "Sim" : "Não").padEnd(39)}${BOLD}║${RESET}
${BOLD}╚══════════════════════════════════════════════════════╝${RESET}
`);

  let browser, context, page;

  // PASSO 1 & 2 & 3: Downloads (usa browser real do utilizador via CDP)
  if (!skipDownload) {

    // === Detectar browser: Firefox primeiro (FPG SSO funciona melhor) ===
    let browserType = null;
    let channel = null;

    // Tentar Firefox primeiro
    try {
      const testB = await firefox.launch({ headless: true });
      await testB.close();
      browserType = firefox;
      channel = "firefox";
    } catch {}

    // Fallback para Chrome/Edge
    if (!browserType) {
      for (const ch of ["msedge", "chrome", "chromium"]) {
        try {
          const testB = await chromium.launch({ channel: ch, headless: true });
          await testB.close();
          browserType = chromium;
          channel = ch;
          break;
        } catch {}
      }
    }

    if (!browserType) {
      logErr("Nenhum browser detectado. Instala o Firefox: npx playwright install firefox");
      process.exit(1);
    }

    logInfo(`Browser detectado: ${channel}`);

    // Helper para lançar contexto persistente com o browser certo
    const launchCtx = (opts) => {
      if (channel === "firefox") {
        return browserType.launchPersistentContext(profileDir, opts);
      }
      return browserType.launchPersistentContext(profileDir, { ...opts, channel });
    };

    // Primeiro login: headful para o utilizador ver e fazer login
    if (doLoginFlag || !fs.existsSync(profileDir)) {
      logStep("🔑", "LOGIN — Abrir browser para login manual");

      context = await launchCtx({
        headless: false,
        viewport: { width: 1280, height: 800 },
      });
      page = context.pages()[0] || await context.newPage();

      console.log(`
  ${YELLOW}+----------------------------------------------------+${RESET}
  ${YELLOW}|  INSTRUCOES DE LOGIN (browser: ${channel.padEnd(19)}|${RESET}
  ${YELLOW}|                                                     |${RESET}
  ${YELLOW}|  1. Faz login em area.my.fpg.pt                     |${RESET}
  ${YELLOW}|  2. Navega para:                                    |${RESET}
  ${YELLOW}|     https://my.fpg.pt/Home/Results.aspx             |${RESET}
  ${YELLOW}|  3. Depois navega para:                             |${RESET}
  ${YELLOW}|     https://scoring.fpg.pt/lists/PlayerResults.aspx |${RESET}
  ${YELLOW}|  4. Confirma que VES a tabela de resultados         |${RESET}
  ${YELLOW}|  5. Volta aqui e carrega ENTER                      |${RESET}
  ${YELLOW}+----------------------------------------------------+${RESET}
`);

      await page.goto("https://area.my.fpg.pt/login/", { waitUntil: "domcontentloaded" });

      await new Promise((resolve) => { process.stdin.once("data", resolve); });

      // Testar scoring
      try {
        const testUrl = `https://scoring.fpg.pt/lists/PlayerResults.aspx?no=${fedCodes[0] || "52884"}`;
        await page.goto(testUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
        const title = await page.title();
        if (title.includes("Error")) {
          logWarn(`scoring.fpg.pt erro (${title}) — verifica se navegaste lá no browser`);
        } else {
          logOK(`scoring.fpg.pt funciona! (${title})`);
        }
      } catch (err) {
        logWarn(`Teste scoring: ${err.message}`);
      }

      logOK(`Perfil guardado em .playwright-profile/ (${channel})`);
      await context.close();
    }

    // Agora usar o perfil em headless para downloads
    logStep("📥", "Downloads");
    context = await launchCtx({
      headless: true,
      viewport: { width: 1280, height: 800 },
    });
    page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(60000);

    for (const fed of fedCodes) {
      const outDir = path.join(process.cwd(), "output", fed);
      fs.mkdirSync(outDir, { recursive: true });

      // Aquecer sessão
      await page.goto("https://my.fpg.pt/Home/Results.aspx", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      await page.goto(`https://scoring.fpg.pt/lists/PlayerResults.aspx?no=${fed}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      // Verificar se scoring respondeu OK
      const scoringTitle = await page.title();
      if (scoringTitle.includes("Error") || scoringTitle.includes("error")) {
        logErr(`[${fed}] scoring.fpg.pt retornou erro (${scoringTitle}).`);
        logWarn("Sessão expirada. Corre: node golf-all.js --login " + fed);
        continue;
      }

      logOK(`[${fed}] scoring.fpg.pt OK`);

      const whsOk = await downloadWHS(page, fed, outDir);
      if (!whsOk) {
        logErr(`[${fed}] Falha no download — a saltar scorecards.`);
        continue;
      }

      await downloadScorecards(page, fed, outDir);
    }

    await context.close();
  }

  // PASSO 4: Sync players.json com dados frescos (ANTES do render)
  syncPlayersJson(fedCodes);

  // PASSO 5: Render (batch)
  if (!skipRender) {
    generateUIBatch(fedCodes);
  }

  // PASSO 6: Extrair campos internacionais de todos os scorecards
  try {
    const extractScript = path.join(process.cwd(), "extract-courses.js");
    if (fs.existsSync(extractScript)) {
      logStep("\ud83c\udf0d", "Extrair campos internacionais");
      require(extractScript);
    }
  } catch (e) {
    logWarn(`extract-courses.js falhou: ${e.message}`);
  }

  // RESUMO
  logStep("📊", "RESUMO FINAL");
  for (const fed of fedCodes) {
    const outDir = path.join(process.cwd(), "output", fed);
    const whsPath = path.join(outDir, "whs-list.json");
    const scDir = path.join(outDir, "scorecards");
    const dataPath = path.join(outDir, "analysis", "data.json");

    const whsCount = fs.existsSync(whsPath)
      ? (readJSON(whsPath)?.Records?.length || 0)
      : 0;
    const scCount = fs.existsSync(scDir)
      ? fs.readdirSync(scDir).filter(f => f.endsWith(".json")).length
      : 0;
    const hasData = fs.existsSync(dataPath);

    console.log(`
  ${BOLD}Federado ${fed}:${RESET}
    WHS registos:  ${whsCount}
    Scorecards:    ${scCount}
    Dados gerados:   ${hasData ? GREEN + "✓" + RESET + " " + dataPath : RED + "✗" + RESET}
`);
  }

  console.log(`${GREEN}${BOLD}Concluído!${RESET}\n`);
  process.exit(0);
})();
