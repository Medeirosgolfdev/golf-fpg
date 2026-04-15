#!/usr/bin/env node
/**
 * test-playwright-fpg.js — Diagnóstico de detecção de automação
 *
 * Testa SE os sites da FPG bloqueiam ou detectam o Playwright.
 * Corre com a sessão existente (session.json) e verifica vários cenários.
 *
 * Uso:
 *   node test-playwright-fpg.js
 *   node test-playwright-fpg.js --headless    (forçar modo headless)
 *   node test-playwright-fpg.js --no-session  (sem cookies, simular GitHub Actions a frio)
 *
 * Necessita:
 *   npm install playwright
 *   npx playwright install chromium
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const FORCE_HEADLESS = args.includes("--headless");
const NO_SESSION = args.includes("--no-session");
const SESSION_PATH = path.join(process.cwd(), "session.json");

// ── Cores ──
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m", B = "\x1b[1m", D = "\x1b[2m", X = "\x1b[0m";

function ok(msg)   { console.log(`  ${G}✓${X} ${msg}`); }
function fail(msg) { console.log(`  ${R}✗${X} ${msg}`); }
function warn(msg) { console.log(`  ${Y}⚠${X} ${msg}`); }
function info(msg) { console.log(`  ${C}→${X} ${msg}`); }
function title(msg){ console.log(`\n${B}══ ${msg} ══${X}`); }

// ─────────────────────────────────────────────────
// CENÁRIO 1: Sem nada — browser headless puro
// O que o GitHub Actions faria sem session.json
// ─────────────────────────────────────────────────
async function testRaw(browser) {
  title("Cenário 1: Playwright headless SEM sessão (simula GitHub Actions a frio)");

  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  const results = {};

  // Testar scoring.datagolf.pt (não precisa de login)
  info("scoring.datagolf.pt — página de classificações");
  try {
    const resp = await page.goto(
      "https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=988&tcode=10292",
      { waitUntil: "domcontentloaded", timeout: 15000 }
    );
    const status = resp.status();
    const url = page.url();
    const hasJQuery = await page.evaluate(() => typeof jQuery !== "undefined");
    const hasRows = await page.evaluate(() => {
      const rows = document.querySelectorAll("#ctl00_Content_GridView1 tr");
      return rows.length;
    });

    if (status === 200 && !url.includes("login") && hasRows > 0) {
      ok(`scoring.datagolf.pt acessível (${status}) — ${hasRows} linhas na tabela`);
      ok(`jQuery disponível: ${hasJQuery}`);
      results.datagolf = "ok";
    } else if (url.includes("login") || url.includes("Login")) {
      fail(`Redireccionado para login: ${url}`);
      results.datagolf = "redirect-login";
    } else if (hasRows === 0) {
      warn(`Página carregou (${status}) mas sem dados — possível bloqueio silencioso`);
      results.datagolf = "empty";
    } else {
      warn(`Status ${status}, URL: ${url}`);
      results.datagolf = "unknown";
    }
  } catch (e) {
    fail(`Erro: ${e.message}`);
    results.datagolf = "error";
  }

  // Testar scoring.fpg.pt (requer login)
  info("scoring.fpg.pt — PlayerWHS (sem cookies)");
  try {
    const resp = await page.goto(
      "https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884",
      { waitUntil: "domcontentloaded", timeout: 15000 }
    );
    const status = resp.status();
    const url = page.url();
    const text = await page.evaluate(() => document.body?.innerText?.substring(0, 200));

    if (url.includes("login") || url.includes("Login")) {
      warn(`Redireccionado para login (esperado sem sessão): ${url}`);
      results.fpg_no_session = "redirect-expected";
    } else if (status === 200) {
      // Verificar se tem dados ou página vazia/blocked
      const hasData = await page.evaluate(() => {
        const rows = document.querySelectorAll("table tr");
        return rows.length > 2;
      });
      if (hasData) {
        warn("scoring.fpg.pt acessível SEM login — dados públicos?");
        results.fpg_no_session = "public-data";
      } else {
        warn(`Status 200 mas sem dados. Texto: ${text?.substring(0, 100)}`);
        results.fpg_no_session = "empty-200";
      }
    } else {
      info(`Status: ${status}, URL: ${url}`);
      results.fpg_no_session = `status-${status}`;
    }
  } catch (e) {
    fail(`Erro: ${e.message}`);
    results.fpg_no_session = "error";
  }

  await ctx.close();
  return results;
}

// ─────────────────────────────────────────────────
// CENÁRIO 2: Com session.json (cookies injectadas)
// O que o GitHub Actions faria com o Secret
// ─────────────────────────────────────────────────
async function testWithSession(browser) {
  title("Cenário 2: Playwright COM session.json (simula GitHub Actions com Secret)");

  if (!fs.existsSync(SESSION_PATH)) {
    warn("session.json não encontrado — a saltar este cenário");
    warn("Corre 'node login.js' para criar a sessão");
    return {};
  }

  const sessionState = JSON.parse(fs.readFileSync(SESSION_PATH, "utf-8"));
  info(`Cookies carregadas: ${sessionState.cookies?.length || 0}`);

  const ctx = await browser.newContext({
    storageState: sessionState,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  const results = {};

  // Teste 1: scoring.fpg.pt — WHS list
  info("scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884");
  try {
    await page.goto(
      "https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884",
      { waitUntil: "domcontentloaded", timeout: 15000 }
    );
    const url = page.url();
    const isRedirected = url.includes("login") || url.includes("Login");
    const rowCount = await page.evaluate(() => {
      return document.querySelectorAll("table tr").length;
    });

    if (isRedirected) {
      fail(`Sessão expirada — redireccionado para: ${url}`);
      results.session_valid = false;
    } else if (rowCount > 2) {
      ok(`Sessão válida! ${rowCount} linhas na tabela WHS`);
      results.session_valid = true;
    } else {
      warn(`Página carregou mas sem dados (${rowCount} linhas). Sessão pode ter expirado.`);
      results.session_valid = "partial";
    }
  } catch (e) {
    fail(`Erro: ${e.message}`);
    results.session_valid = "error";
  }

  // Teste 2: API — chamada directa ao endpoint jTable
  if (results.session_valid === true) {
    info("Teste API: PlayerWHS.aspx/HCPWhsFederLST via page.evaluate()");
    try {
      const apiResult = await page.evaluate(async () => {
        const resp = await fetch("/lists/PlayerWHS.aspx/HCPWhsFederLST", {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ fed_code: "52884", jtStartIndex: 0, jtPageSize: 5, jtSorting: "" }),
        });
        if (!resp.ok) return { ok: false, status: resp.status };
        const json = await resp.json();
        const d = json.d || json;
        return {
          ok: d.Result === "OK",
          result: d.Result,
          count: d.Records?.length || 0,
          sample: d.Records?.[0]?.date || null,
        };
      });

      if (apiResult.ok) {
        ok(`API WHS funcionou! ${apiResult.count} registos, última ronda: ${apiResult.sample}`);
        results.api_whs = "ok";
      } else {
        fail(`API WHS falhou: Result=${apiResult.result}, Status=${apiResult.status}`);
        results.api_whs = "fail";
      }
    } catch (e) {
      fail(`Erro na API: ${e.message}`);
      results.api_whs = "error";
    }

    // Teste 3: ClassifLST (scoring.datagolf.pt)
    info("Teste API: scoring.datagolf.pt ClassifLST");
    try {
      await page.goto(
        "https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=988&tcode=10292",
        { waitUntil: "domcontentloaded", timeout: 15000 }
      );
      const jqResult = await page.waitForFunction(
        () => typeof jQuery !== "undefined",
        { timeout: 8000 }
      ).then(() => true).catch(() => false);

      if (!jqResult) {
        fail("jQuery não disponível — o scraper actual não funciona sem jQuery");
        results.datagolf_jquery = false;
      } else {
        const apiResult2 = await page.evaluate(async () => {
          return new Promise((resolve) => {
            jQuery.ajax({
              url: "/pt/classif.aspx/ClassifLST",
              type: "POST",
              dataType: "json",
              contentType: "application/json; charset=utf-8",
              data: JSON.stringify({
                Classi: "1", tclub: "988", tcode: "10292",
                classiforder: "1", classiftype: "I", classifroundtype: "D",
                scoringtype: "1", round: "1", members: "0", playertypes: "0",
                gender: "0", minagemen: "0", maxagemen: "999",
                minageladies: "0", maxageladies: "999",
                minhcp: "-8", maxhcp: "99", idfilter: "-1",
                jtStartIndex: 0, jtPageSize: 5, jtSorting: "",
              }),
              success: (json) => {
                const d = json?.d || json;
                resolve({ ok: d.Result === "OK", count: d.Records?.length || 0, sample: d.Records?.[0]?.player_name });
              },
              error: (xhr) => resolve({ ok: false, status: xhr.status }),
            });
          });
        });

        if (apiResult2.ok) {
          ok(`ClassifLST funcionou! ${apiResult2.count} jogadores, ex: "${apiResult2.sample}"`);
          results.datagolf_jquery = "ok";
        } else {
          fail(`ClassifLST falhou: status=${apiResult2.status}`);
          results.datagolf_jquery = "fail";
        }
      }
    } catch (e) {
      fail(`Erro ClassifLST: ${e.message}`);
      results.datagolf_jquery = "error";
    }
  }

  await ctx.close();
  return results;
}

// ─────────────────────────────────────────────────
// CENÁRIO 3: Detecção de automação
// Verifica sinais que os sites usam para detectar bots
// ─────────────────────────────────────────────────
async function testBotDetection(browser) {
  title("Cenário 3: Teste de detecção de automação (webdriver, headers, etc.)");

  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  const results = {};

  await page.goto("https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=988&tcode=10292",
    { waitUntil: "domcontentloaded", timeout: 15000 }
  );

  const signals = await page.evaluate(() => {
    return {
      // O sinal mais importante — Playwright define isto como true por defeito
      webdriver: navigator.webdriver,
      // Outros sinais comuns de bot detection
      plugins: navigator.plugins.length,
      languages: navigator.languages.length,
      userAgent: navigator.userAgent,
      // Cloudflare / Datadome costumam verificar isto
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      // Verificar se há challenge de bot
      pageTitle: document.title,
      bodyText: document.body?.innerText?.substring(0, 200),
      // Verificar se a página tem o conteúdo esperado ou uma challenge
      hasClassifTable: !!document.querySelector("#ctl00_Content_GridView1"),
      hasCloudflareCaptcha: !!document.querySelector("#challenge-form, #cf-challenge-running"),
      hasDatadomBlock: document.body?.innerHTML?.includes("datadome") || false,
    };
  });

  console.log(`\n  Sinais de detecção:`);
  console.log(`    navigator.webdriver  : ${signals.webdriver === true ? R + "TRUE (bot detectável!)" + X : G + "false (ok)" + X}`);
  console.log(`    navigator.plugins    : ${signals.plugins} (${signals.plugins === 0 ? Y + "0 = suspeito" + X : G + "ok" + X})`);
  console.log(`    navigator.languages  : ${signals.languages}`);
  console.log(`    hardwareConcurrency  : ${signals.hardwareConcurrency}`);
  console.log(`    Cloudflare challenge : ${signals.hasCloudflareCaptcha ? R + "SIM" + X : G + "não" + X}`);
  console.log(`    DataDome block       : ${signals.hasDatadomBlock ? R + "SIM" + X : G + "não" + X}`);
  console.log(`    Tabela de resultados : ${signals.hasClassifTable ? G + "presente" + X : R + "ausente" + X}`);
  console.log(`    Título da página     : "${signals.pageTitle}"`);

  results.webdriver_exposed = signals.webdriver === true;
  results.has_bot_challenge = signals.hasCloudflareCaptcha || signals.hasDatadomBlock;
  results.has_data = signals.hasClassifTable;

  if (signals.webdriver === true) {
    warn("navigator.webdriver=true! Os sites podem detectar que é automação.");
    warn("Solução: usar --chromium-flags ou playwright-extra com stealth plugin");
  } else {
    ok("navigator.webdriver não está exposto (bom sinal)");
  }

  if (!signals.hasClassifTable) {
    fail("Tabela de resultados não encontrada — possível bloqueio ou challenge");
  } else {
    ok("Tabela de resultados encontrada na página");
  }

  await ctx.close();
  return results;
}

// ─────────────────────────────────────────────────
// CENÁRIO 4: Stealth mode (contornar detecção)
// Usando playwright-extra + puppeteer-extra-plugin-stealth
// ─────────────────────────────────────────────────
async function testStealthMode() {
  title("Cenário 4: Stealth mode (puppeteer-extra-plugin-stealth)");

  // Verificar se playwright-extra está instalado
  try {
    require.resolve("playwright-extra");
    require.resolve("puppeteer-extra-plugin-stealth");
  } catch {
    warn("playwright-extra não está instalado. Para testar:");
    warn("  npm install playwright-extra puppeteer-extra-plugin-stealth");
    return { available: false };
  }

  const { chromium: chromiumExtra } = require("playwright-extra");
  const StealthPlugin = require("puppeteer-extra-plugin-stealth");
  chromiumExtra.use(StealthPlugin());

  const browser2 = await chromiumExtra.launch({ headless: true });
  const ctx = await browser2.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  await page.goto("https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=988&tcode=10292",
    { waitUntil: "domcontentloaded", timeout: 15000 }
  );

  const webdriver = await page.evaluate(() => navigator.webdriver);
  const hasTable = await page.evaluate(() => !!document.querySelector("#ctl00_Content_GridView1"));

  if (!webdriver) {
    ok("Stealth mode: navigator.webdriver oculto com sucesso!");
  } else {
    fail("Stealth mode: webdriver ainda visível");
  }

  if (hasTable) {
    ok("Tabela de resultados presente com stealth mode");
  } else {
    fail("Tabela ainda ausente mesmo com stealth");
  }

  await browser2.close();
  return { webdriver_hidden: !webdriver, has_data: hasTable };
}

// ─────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────
(async () => {
  console.log(`${B}🔬 Diagnóstico de automação FPG${X}`);
  console.log(`  Headless: ${FORCE_HEADLESS ? "forçado" : "não (janela visível)"}`);
  console.log(`  Sessão: ${NO_SESSION ? "ignorada" : (fs.existsSync(SESSION_PATH) ? "session.json presente" : "session.json AUSENTE")}`);

  const browser = await chromium.launch({
    headless: FORCE_HEADLESS,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled", // Tentar ocultar webdriver
    ],
  });

  const allResults = {};

  try {
    // Cenário 1: Sem sessão
    if (!NO_SESSION) { // sempre correr
      allResults.raw = await testRaw(browser);
    }

    // Cenário 2: Com sessão
    if (!NO_SESSION) {
      allResults.with_session = await testWithSession(browser);
    }

    // Cenário 3: Detecção
    allResults.bot_detection = await testBotDetection(browser);

    // Cenário 4: Stealth
    allResults.stealth = await testStealthMode();

  } finally {
    await browser.close();
  }

  // ── Relatório final ──
  title("Relatório Final");

  const s = allResults;

  // Conclusão sobre datagolf.pt
  const datagolfOk = s.raw?.datagolf === "ok" || s.with_session?.datagolf_jquery === "ok";
  console.log(`\n  scoring.datagolf.pt:`);
  if (datagolfOk) {
    ok("Acessível e scraping funcional via Playwright");
  } else if (s.bot_detection?.has_data) {
    ok("Página carrega mas pode precisar de jQuery para API");
  } else {
    fail("Bloqueado ou inacessível — precisas de investigar");
  }

  // Conclusão sobre fpg.pt
  console.log(`\n  scoring.fpg.pt:`);
  if (s.with_session?.session_valid === true) {
    ok("Sessão válida! Playwright com session.json funciona");
    if (s.with_session?.api_whs === "ok") {
      ok("API WHS acessível via page.evaluate()");
    }
  } else if (s.with_session?.session_valid === false) {
    fail("Sessão EXPIRADA — precisas de re-correr node login.js");
  } else if (!fs.existsSync(SESSION_PATH)) {
    warn("Sem session.json para testar autenticação");
  }

  // Conclusão sobre bot detection
  console.log(`\n  Detecção de automação:`);
  if (s.bot_detection?.webdriver_exposed) {
    warn("navigator.webdriver está exposto — site PODE detectar Playwright");
    warn("Recomendação: usar playwright-extra + stealth plugin");
    if (s.stealth?.webdriver_hidden) {
      ok("Stealth mode resolve este problema");
    }
  } else {
    ok("navigator.webdriver não exposto — automação difícil de detectar");
  }

  if (s.bot_detection?.has_bot_challenge) {
    fail("Cloudflare/DataDome detectado — automação vai ser bloqueada");
    fail("Solução: self-hosted runner com browser profile real, ou Cloudflare bypass");
  } else {
    ok("Sem Cloudflare/DataDome challenge detectado");
  }

  // Recomendação final
  console.log(`\n${B}══ Recomendação ══${X}`);
  if (s.with_session?.session_valid === true && !s.bot_detection?.has_bot_challenge) {
    ok(`${G}${B}VERDE${X} — GitHub Actions com session.json como Secret deve funcionar`);
    console.log(`     Passos: npm install playwright, npx playwright install chromium,`);
    console.log(`     guardar session.json como Secret FPG_SESSION_JSON no GitHub`);
  } else if (s.bot_detection?.has_bot_challenge) {
    fail(`${R}${B}BLOQUEADO${X} — Site tem protecção anti-bot activa`);
    console.log(`     Opções: 1) Self-hosted runner  2) Puppeteer stealth  3) API alternativa`);
  } else if (!fs.existsSync(SESSION_PATH)) {
    warn(`${Y}${B}SEM SESSÃO${X} — Corre primeiro: node login.js`);
  } else {
    warn(`${Y}${B}INCONCLUSIVO${X} — Corre sem --headless para ver o browser e investigar`);
  }

  console.log("");
  console.log(`${D}Resultados completos: ${JSON.stringify(allResults, null, 2)}${X}`);
})();
