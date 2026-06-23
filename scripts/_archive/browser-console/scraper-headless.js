#!/usr/bin/env node
/**
 * scraper-headless.js — Substituto do fpg-bridge-drive.js para correr sem browser manual
 *
 * Em vez de:
 *   Terminal (servidor :3456) + Browser Console (paste manual)
 *
 * Faz tudo num só processo Node.js com Playwright headless:
 *   1. Carrega session.json (cookies da sessão FPG)
 *   2. Navega para scoring.datagolf.pt e faz scrape dos torneios
 *   3. Navega para scoring.fpg.pt e descarrega perfis de jogadores
 *   4. Escreve os ficheiros de dados (drive-data.json, output/{fed}/, etc.)
 *
 * Uso:
 *   node scraper-headless.js --tournaments --players --new-players
 *   node scraper-headless.js --tournaments
 *   node scraper-headless.js --players --feds 47078 59252
 *
 * Variáveis de ambiente:
 *   HEADLESS=true     Correr sem janela (para GitHub Actions)
 *   SESSION_PATH=...  Caminho para session.json (default: ./session.json)
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// ── Configuração ──
const HEADLESS = process.env.HEADLESS === "true";
const SESSION_PATH = process.env.SESSION_PATH || path.join(process.cwd(), "session.json");
const DATAGOLF_URL = "https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=988&tcode=10292";
const FPG_URL = "https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884";

// ── Parse args (igual ao fpg-bridge-drive.js) ──
const args = process.argv.slice(2);
let doTournaments = false, doPlayers = false;
let allPlayersFlag = false, newPlayersFlag = false;
let refreshFlag = false, forceFlag = false, qualifOnly = false, skipSD = false;
let concurrency = 8;
const explicitFeds = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--tournaments")   { doTournaments = true; continue; }
  if (a === "--players")       { doPlayers = true; continue; }
  if (a === "--all-players")   { allPlayersFlag = true; doPlayers = true; continue; }
  if (a === "--new-players")   { newPlayersFlag = true; doPlayers = true; continue; }
  if (a === "--refresh")       { refreshFlag = true; continue; }
  if (a === "--force")         { forceFlag = true; continue; }
  if (a === "--qualif-only")   { qualifOnly = true; continue; }
  if (a === "--skip-sd")       { skipSD = true; continue; }
  if (a === "--concurrency")   { concurrency = parseInt(args[++i]) || 8; continue; }
  if (a === "--feds")          { while (i + 1 < args.length && /^\d+$/.test(args[i + 1])) explicitFeds.push(args[++i]); continue; }
  if (/^\d+$/.test(a))         { explicitFeds.push(a); continue; }
}

if (!doTournaments && !doPlayers && explicitFeds.length === 0) {
  console.log("Uso: node scraper-headless.js --tournaments --players --new-players");
  process.exit(1);
}

// ── Cores ──
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m", B = "\x1b[1m", X = "\x1b[0m";

// ── Lista de torneios DRIVE (sincronizada com fpg-bridge-drive.js) ──
const DRIVE_TOURNAMENTS = [
  { name: "3º Torneio Drive Tour Norte – Vale Pisão", ccode: "987", tcode: "10208", date: "2026-02-28", clube: "FPG_DNorte", campo: "Vale Pisão" },
  { name: "2º Torneio Drive Tour Madeira - Santo da Serra", ccode: "982", tcode: "10199", date: "2026-02-07", clube: "FPG_DM", campo: "Santo da Serra" },
  { name: "2º Torneio Drive Tour Sul – Vila Sol", ccode: "988", tcode: "10293", date: "2026-02-01", clube: "FPG_DRIVE", campo: "Vila Sol" },
  { name: "1º Torneio Drive Tour Sul – Laguna G.C.", ccode: "988", tcode: "10292", date: "2026-01-11", clube: "FPG_DRIVE", campo: "Vilamoura - Laguna" },
  { name: "1º Torneio Drive Tour Tejo – Montado", ccode: "985", tcode: "10202", date: "2026-01-04", clube: "FPG_DTejo", campo: "Montado" },
  { name: "1º Torneio Drive Tour Norte – Estela GC", ccode: "987", tcode: "10206", date: "2026-01-04", clube: "FPG_DNorte", campo: "Estela" },
  { name: "1º Torneio Drive Tour Madeira - Palheiro Golf", ccode: "982", tcode: "10198", date: "2026-01-03", clube: "FPG_DM", campo: "Palheiro Golf" },
  // ... (incluir lista completa do fpg-bridge-drive.js)
];

// ──────────────────────────────────────────────────────────────────
// FASE 1: Scrape de torneios (scoring.datagolf.pt)
// ──────────────────────────────────────────────────────────────────
async function scrapeTournaments(page) {
  console.log(`\n${B}═══ Fase 1: Torneios (${DRIVE_TOURNAMENTS.length} torneios) ═══${X}`);

  const results = [];

  for (const tournament of DRIVE_TOURNAMENTS) {
    const url = `https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=${tournament.ccode}&tcode=${tournament.tcode}`;
    console.log(`  ${C}→${X} ${tournament.name}`);

    try {
      // Navegar para a página de classificações do torneio
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Aguardar jQuery estar disponível (necessário para o scraper)
      await page.waitForFunction(() => typeof jQuery !== "undefined", { timeout: 10000 });

      // Injectar e correr o scraper via page.evaluate()
      // Este é o equivalente headless do drive-scraper-v6.js
      const data = await page.evaluate(async (t) => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        // Extrair classificações da página actual
        const players = [];
        const rows = document.querySelectorAll("#ctl00_Content_GridView1 tr:not(:first-child)");

        for (const row of rows) {
          const cells = row.querySelectorAll("td");
          if (cells.length < 5) continue;

          const pos = cells[0]?.textContent?.trim();
          const name = cells[1]?.textContent?.trim();
          const fedLink = cells[1]?.querySelector("a");
          const fedMatch = fedLink?.href?.match(/no=(\d+)/);
          const fed = fedMatch ? fedMatch[1] : null;
          const hcp = cells[2]?.textContent?.trim();
          const gross = cells[3]?.textContent?.trim();
          const net = cells[4]?.textContent?.trim();

          if (!name) continue;
          players.push({ pos, name, fed, hcp, gross, net });
        }

        // Extrair scorecards individuais (se existirem links)
        const scorecards = [];
        for (const p of players) {
          if (!p.fed) continue;
          try {
            // Cada jogador pode ter um link de scorecard
            const scUrl = `/pt/ScoreCard.aspx?ccode=${t.ccode}&tcode=${t.tcode}&no=${p.fed}`;
            const resp = await fetch(scUrl);
            if (!resp.ok) continue;
            const html = await resp.text();
            // Parsing básico do scorecard HTML
            // (lógica completa a portar do drive-scraper-v6.js)
            scorecards.push({ fed: p.fed, html });
            await sleep(150); // evitar rate limiting
          } catch (e) {
            // scorecard indisponível
          }
        }

        return { players, scorecards, count: players.length };
      }, tournament);

      results.push({
        ...tournament,
        players: data.players,
        scorecards: data.scorecards,
        totalPlayers: data.count
      });

      console.log(`    ${G}✓${X} ${data.count} jogadores`);
      await new Promise(r => setTimeout(r, 300)); // delay entre torneios

    } catch (err) {
      console.error(`    ${R}✗${X} Erro em ${tournament.name}: ${err.message}`);
      results.push({ ...tournament, players: [], error: err.message });
    }
  }

  // Guardar drive-data.json
  const outPath = path.join(process.cwd(), "public", "data", "drive-data.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const output = {
    updatedAt: new Date().toISOString(),
    tournaments: results,
    totalScorecards: results.reduce((s, t) => s + (t.scorecards?.length || 0), 0)
  };
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n  ${G}✓${X} Guardado: ${outPath}`);
  console.log(`  ${G}✓${X} ${results.length} torneios, ${output.totalScorecards} scorecards`);

  return output;
}

// ──────────────────────────────────────────────────────────────────
// FASE 2: Download de perfis de jogadores (scoring.fpg.pt)
// ──────────────────────────────────────────────────────────────────
async function downloadPlayers(page, feds) {
  console.log(`\n${B}═══ Fase 2: Jogadores (${feds.length} jogadores) ═══${X}`);

  let processed = 0, skipped = 0, failed = 0;

  for (const fed of feds) {
    const outDir = path.join(process.cwd(), "output", fed);

    // Verificar se deve saltar (--refresh sem alterações)
    if (refreshFlag && !forceFlag) {
      const existingWHS = getExistingWHSCount(fed);
      // Verificar count actual via página
      try {
        const countUrl = `https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=${fed}`;
        await page.goto(countUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        const newCount = await page.evaluate(() => {
          const rows = document.querySelectorAll("#ctl00_Content_GridView1 tr:not(:first-child)");
          return rows.length;
        });
        if (newCount === existingWHS) {
          console.log(`  ${Y}○${X} ${fed} — saltado (${existingWHS} rondas, sem alterações)`);
          skipped++;
          continue;
        }
      } catch { /* continuar */ }
    }

    console.log(`  ${C}→${X} Jogador ${fed} (${processed + 1}/${feds.length})`);

    try {
      // 1. WHS list
      const whsUrl = `https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=${fed}`;
      await page.goto(whsUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

      const whsData = await page.evaluate(() => {
        const rows = document.querySelectorAll("#ctl00_Content_GridView1 tr");
        const headers = [...rows[0]?.querySelectorAll("th") || []].map(h => h.textContent.trim());
        const records = [];
        for (let i = 1; i < rows.length; i++) {
          const cells = [...rows[i].querySelectorAll("td")].map(c => c.textContent.trim());
          if (cells.length === 0) continue;
          const record = {};
          headers.forEach((h, j) => record[h] = cells[j]);
          records.push(record);
        }
        return { Records: records };
      });

      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, "whs-list.json"),
        JSON.stringify(whsData, null, 2)
      );

      // 2. Scorecards individuais
      const scorecardsDir = path.join(outDir, "scorecards");
      fs.mkdirSync(scorecardsDir, { recursive: true });

      const existingIds = forceFlag ? [] : getExistingScoreIds(fed);
      let newSC = 0;

      for (const record of whsData.Records) {
        const scoreId = record["ScoreId"] || record["ID"] || record["scoreId"];
        if (!scoreId || existingIds.includes(String(scoreId))) continue;
        if (qualifOnly && record["Tipo"] !== "Qualif") continue;

        try {
          const scUrl = `https://scoring.fpg.pt/lists/ScoreCard.aspx?scoreId=${scoreId}`;
          await page.goto(scUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

          const scData = await page.evaluate(() => {
            // Extrair dados do scorecard da página
            const info = {};
            const rows = document.querySelectorAll("table tr");
            // ... parsing específico da estrutura do scoring.fpg.pt
            return info;
          });

          fs.writeFileSync(
            path.join(scorecardsDir, `${scoreId}.json`),
            JSON.stringify(scData, null, 2)
          );
          newSC++;
          await new Promise(r => setTimeout(r, 150));

        } catch (e) {
          // scorecard individual falhou
        }
      }

      console.log(`    ${G}✓${X} ${fed} — ${whsData.Records.length} rondas, ${newSC} SC novos`);
      processed++;

    } catch (err) {
      console.error(`    ${R}✗${X} ${fed} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n  Processados: ${processed} | Saltados: ${skipped} | Falhas: ${failed}`);
}

// ── Utilitários ──
function getExistingScoreIds(fed) {
  const dir = path.join(process.cwd(), "output", fed, "scorecards");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => f.replace(".json", ""));
}

function getExistingWHSCount(fed) {
  const p = path.join(process.cwd(), "output", fed, "whs-list.json");
  if (!fs.existsSync(p)) return 0;
  try { return JSON.parse(fs.readFileSync(p, "utf-8"))?.Records?.length || 0; } catch { return 0; }
}

function resolvePlayerList(driveData) {
  if (explicitFeds.length > 0) return explicitFeds;

  const existingDrivePath = path.join(process.cwd(), "public", "data", "drive-data.json");
  const source = driveData || (fs.existsSync(existingDrivePath) ? JSON.parse(fs.readFileSync(existingDrivePath, "utf-8")) : null);
  if (!source) { console.error(`${R}Sem drive-data.json${X}`); return []; }

  const playersDB = fs.existsSync("players.json") ? JSON.parse(fs.readFileSync("players.json", "utf-8")) : {};
  const allFeds = new Set();
  for (const t of source.tournaments) {
    for (const p of t.players) { if (p.fed) allFeds.add(p.fed); }
  }

  if (newPlayersFlag) {
    const missing = [...allFeds].filter(f => !playersDB[f]);
    console.log(`  Novos jogadores: ${missing.length} (de ${allFeds.size} total)`);
    return missing;
  }
  if (allPlayersFlag) return [...allFeds];
  return [];
}

// ──────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────
(async () => {
  // Verificar session.json
  if (!fs.existsSync(SESSION_PATH)) {
    console.error(`${R}Erro: session.json não encontrado em ${SESSION_PATH}${X}`);
    console.error(`Corre primeiro: node login.js`);
    process.exit(1);
  }

  const sessionState = JSON.parse(fs.readFileSync(SESSION_PATH, "utf-8"));
  const startTime = Date.now();

  console.log(`${B}🏌️  DRIVE Headless Scraper${X}`);
  console.log(`  Modo: ${HEADLESS ? "headless (GitHub Actions)" : "com janela (local)"}`);
  console.log(`  Torneios: ${doTournaments} | Jogadores: ${doPlayers}`);

  // Lançar browser Playwright com sessão existente
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: HEADLESS ? ["--no-sandbox", "--disable-dev-shm-usage"] : []
  });

  const context = await browser.newContext({
    storageState: sessionState,  // Injectar cookies da sessão FPG
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  // Verificar se a sessão ainda é válida
  console.log(`\n${C}Verificando sessão...${X}`);
  try {
    await page.goto("https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884", {
      waitUntil: "domcontentloaded", timeout: 15000
    });
    const isLoggedIn = await page.evaluate(() => {
      // Verificar se a página tem conteúdo autenticado (não redirect para login)
      return !document.URL.includes("login") && !document.URL.includes("Login");
    });
    if (!isLoggedIn) {
      console.error(`${R}Sessão expirada! Actualiza o FPG_SESSION_JSON no GitHub.${X}`);
      console.error(`Corre localmente: node login.js`);
      process.exit(1);
    }
    console.log(`  ${G}✓${X} Sessão válida`);
  } catch (err) {
    console.error(`${R}Erro ao verificar sessão: ${err.message}${X}`);
    process.exit(1);
  }

  let driveData = null;

  // Fase 1: Torneios
  if (doTournaments) {
    try {
      driveData = await scrapeTournaments(page);
    } catch (err) {
      console.error(`${R}Fase 1 falhou: ${err.message}${X}`);
      process.exit(1);
    }
  }

  // Fase 2: Jogadores
  if (doPlayers || explicitFeds.length > 0) {
    const feds = resolvePlayerList(driveData);
    if (feds.length === 0) {
      console.log(`${Y}Nenhum jogador para descarregar.${X}`);
    } else {
      try {
        await downloadPlayers(page, feds);
      } catch (err) {
        console.error(`${R}Fase 2 falhou: ${err.message}${X}`);
      }
    }
  }

  // Guardar sessão actualizada (cookies podem ter sido renovadas durante a sessão)
  await context.storageState({ path: SESSION_PATH });
  console.log(`\n  ${G}✓${X} session.json actualizado`);

  // Exportar para GitHub Actions output (para actualizar o Secret)
  if (process.env.GITHUB_OUTPUT) {
    const sessionContent = fs.readFileSync(SESSION_PATH, "utf-8");
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `session_json=${sessionContent}\n`);
  }

  await browser.close();

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n${G}${B}✓ CONCLUÍDO em ${elapsed} min${X}`);
})();
