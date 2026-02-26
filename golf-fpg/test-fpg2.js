#!/usr/bin/env node
/**
 * test-fpg2.js — Diagnóstico avançado FPG
 * 
 * Testa:
 *  1. Se o URL mudou (PlayerWHS.aspx vs PlayerResults.aspx)
 *  2. Se o SSO scoring.fpg.pt precisa de warmup diferente
 *  3. Tenta corrigir a sessão e re-testar
 * 
 * Corre: node test-fpg2.js [federado]
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const FED = process.argv[2] || "52884";
const SESSION = path.join(process.cwd(), "session.json");

const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m", RESET = "\x1b[0m", BOLD = "\x1b[1m";
const ok = (msg) => console.log(`  ${GREEN}✓${RESET} ${msg}`);
const fail = (msg) => console.log(`  ${RED}✗${RESET} ${msg}`);
const warn = (msg) => console.log(`  ${YELLOW}⚠${RESET} ${msg}`);
const info = (msg) => console.log(`  ${CYAN}ℹ${RESET} ${msg}`);
const step = (n, msg) => console.log(`\n${BOLD}[${n}] ${msg}${RESET}`);

async function testUrl(page, url, label) {
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    const status = resp?.status();
    const finalUrl = page.url();
    const title = await page.title();
    const redirected = finalUrl !== url;
    
    console.log(`    ${status === 200 ? GREEN : RED}HTTP ${status}${RESET} — ${label}`);
    if (redirected) console.log(`    → Redireccionado para: ${finalUrl}`);
    if (title.includes("Error") || title.includes("error")) console.log(`    → Título: ${RED}${title}${RESET}`);
    
    return { status, finalUrl, title, redirected, ok: status === 200 && !title.includes("Error") };
  } catch (err) {
    console.log(`    ${RED}ERRO${RESET} — ${label}: ${err.message}`);
    return { status: 0, ok: false, error: err.message };
  }
}

async function testApi(page, apiPath, body, label) {
  try {
    const result = await page.evaluate(async ({ apiPath, body }) => {
      try {
        const res = await fetch(apiPath, {
          method: "POST",
          headers: {
            "x-requested-with": "XMLHttpRequest",
            "accept": "application/json, text/javascript, */*; q=0.01",
            "content-type": "application/json; charset=utf-8"
          },
          body: JSON.stringify(body)
        });
        const text = await res.text();
        return { status: res.status, text: text.slice(0, 500) };
      } catch (err) {
        return { status: 0, text: err.message };
      }
    }, { apiPath, body });
    
    const isOk = result.status === 200;
    let resultOK = false;
    
    if (isOk) {
      try {
        const json = JSON.parse(result.text);
        const payload = json?.d ?? json;
        resultOK = payload?.Result === "OK";
        const count = payload?.Records?.length || 0;
        console.log(`    ${GREEN}HTTP ${result.status}${RESET} — ${label} — Result=${payload?.Result}, ${count} registos`);
        if (count > 0) {
          const r = payload.Records[0];
          info(`  1º: score_id=${r.score_id}, date=${r.event_date || r.played_date || "?"}`);
        }
      } catch {
        console.log(`    ${GREEN}HTTP ${result.status}${RESET} — ${label} — resposta não-JSON`);
        info(`  ${result.text.slice(0, 150)}`);
      }
    } else {
      console.log(`    ${RED}HTTP ${result.status}${RESET} — ${label}`);
      info(`  ${result.text.slice(0, 200)}`);
    }
    
    return { ...result, resultOK };
  } catch (err) {
    console.log(`    ${RED}ERRO${RESET} — ${label}: ${err.message}`);
    return { status: 0, resultOK: false };
  }
}

(async () => {
  console.log(`\n${BOLD}═══ Diagnóstico Avançado FPG — ${new Date().toLocaleString("pt-PT")} ═══${RESET}`);
  console.log(`  Federado: ${FED}\n`);

  if (!fs.existsSync(SESSION)) {
    fail("session.json NÃO EXISTE");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: SESSION });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  // ─── 1. Test URLs that might have changed ───
  step("1/5", "Testar URLs (antigos vs possíveis novos)");
  
  // Warmup my.fpg.pt first
  await page.goto("https://my.fpg.pt/Home/Results.aspx", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  
  const urls = [
    [`https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=${FED}`, "PlayerWHS.aspx (actual)"],
    [`https://scoring.fpg.pt/lists/PlayerResults.aspx?no=${FED}`, "PlayerResults.aspx (novo?)"],
    [`https://scoring.fpg.pt/lists/PlayerHCP.aspx?no=${FED}`, "PlayerHCP.aspx"],
    [`https://scoring.fpg.pt/lists/`, "Directório /lists/"],
    [`https://scoring.fpg.pt/`, "Root scoring.fpg.pt"],
  ];
  
  const results = {};
  for (const [url, label] of urls) {
    results[label] = await testUrl(page, url, label);
    await page.waitForTimeout(300);
  }

  // ─── 2. Check if SSO needs different warmup ───
  step("2/5", "Tentar SSO warmup alternativo");
  
  // Some ASP.NET SSO flows require visiting a specific handshake URL
  const ssoUrls = [
    "https://scoring.fpg.pt/",
    "https://scoring.fpg.pt/default.aspx",
    "https://scoring.fpg.pt/Home.aspx",
    "https://my.fpg.pt/Home/ScoringRedirect.aspx",
    "https://my.fpg.pt/Scoring/",
  ];
  
  for (const url of ssoUrls) {
    const r = await testUrl(page, url, url.replace("https://", ""));
    if (r.ok && r.redirected && r.finalUrl.includes("scoring")) {
      ok(`Encontrado SSO redirect via ${url} → ${r.finalUrl}`);
    }
    await page.waitForTimeout(300);
  }

  // Check cookies after warmup
  const cookies = await context.cookies();
  const scoringCookies = cookies.filter(c => c.domain.includes("scoring"));
  if (scoringCookies.length > 0) {
    ok(`scoring.fpg.pt agora tem ${scoringCookies.length} cookies:`);
    scoringCookies.forEach(c => info(`  ${c.name}=${c.value.slice(0, 15)}... (domain: ${c.domain})`));
  } else {
    fail("scoring.fpg.pt continua sem cookies — SSO não está a propagar");
  }

  // ─── 3. Re-test with warm session ───
  step("3/5", "Re-testar APIs com sessão aquecida");
  
  // Navigate to scoring first to establish session
  await page.goto("https://scoring.fpg.pt/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  
  // Try the old URL
  const whsBody = { fed_code: String(FED), jtStartIndex: "0", jtPageSize: "5" };
  
  await page.goto(`https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=${FED}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(500);
  const api1 = await testApi(page, `PlayerWHS.aspx/HCPWhsFederLST?fed_code=${FED}&jtStartIndex=0&jtPageSize=5`, whsBody, "PlayerWHS → HCPWhsFederLST");
  
  // Try alternative API names
  await page.goto(`https://scoring.fpg.pt/lists/PlayerResults.aspx?no=${FED}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(500);
  
  const altApis = [
    ["PlayerResults.aspx/HCPWhsFederLST", whsBody, "PlayerResults → HCPWhsFederLST"],
    ["PlayerResults.aspx/GetResults", whsBody, "PlayerResults → GetResults"],
    ["PlayerResults.aspx/PlayerResultsLST", whsBody, "PlayerResults → PlayerResultsLST"],
    ["PlayerResults.aspx/GetPlayerResults", whsBody, "PlayerResults → GetPlayerResults"],
    ["PlayerResults.aspx/HCPResultsFederLST", whsBody, "PlayerResults → HCPResultsFederLST"],
  ];
  
  for (const [apiPath, body, label] of altApis) {
    const r = await testApi(page, apiPath, body, label);
    if (r.resultOK) {
      ok(`\n  ★★★ ENCONTRADO! O endpoint correcto é: ${YELLOW}${apiPath}${RESET} ★★★`);
      break;
    }
  }

  // ─── 4. Inspect page source for clues ───
  step("4/5", "Inspeccionar código-fonte das páginas");
  
  for (const pageName of ["PlayerWHS.aspx", "PlayerResults.aspx"]) {
    const url = `https://scoring.fpg.pt/lists/${pageName}?no=${FED}`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
      await page.waitForTimeout(500);
      
      const pageInfo = await page.evaluate(() => {
        const body = document.body.innerHTML;
        const scripts = [...document.querySelectorAll("script")].map(s => s.textContent || s.src).filter(Boolean);
        
        // Find API endpoints in scripts
        const apiMatches = [];
        for (const s of scripts) {
          const matches = s.match(/['"]([\w]+\.aspx\/[\w]+)['"]/g);
          if (matches) apiMatches.push(...matches);
        }
        
        // Find jtable config
        const jtableMatch = body.match(/jtable\s*\(\s*\{[\s\S]*?\}\s*\)/);
        const listAction = body.match(/listAction\s*:\s*['"]([^'"]+)['"]/);
        const actions = [...body.matchAll(/Action\s*:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
        
        return {
          hasError: body.includes("Runtime Error") || body.includes("Server Error"),
          errorMsg: body.includes("Runtime Error") ? body.match(/Description:([^<]+)/)?.[1]?.trim() : null,
          apiEndpoints: apiMatches.slice(0, 10),
          listAction: listAction?.[1] || null,
          actions: actions.slice(0, 10),
          bodyLen: body.length,
          hasJtable: body.includes("jtable"),
          hasjQuery: typeof jQuery !== "undefined",
          scriptCount: scripts.length,
        };
      });
      
      info(`${pageName}:`);
      if (pageInfo.hasError) {
        warn(`  Erro: ${pageInfo.errorMsg || "Server Error"}`);
      } else {
        info(`  Body: ${pageInfo.bodyLen} chars, ${pageInfo.scriptCount} scripts, jtable: ${pageInfo.hasJtable}`);
        if (pageInfo.listAction) ok(`  listAction: ${YELLOW}${pageInfo.listAction}${RESET}`);
        if (pageInfo.actions.length) info(`  Actions: ${pageInfo.actions.join(", ")}`);
        if (pageInfo.apiEndpoints.length) info(`  API refs: ${pageInfo.apiEndpoints.join(", ")}`);
      }
    } catch (err) {
      warn(`${pageName}: ${err.message}`);
    }
  }

  // ─── 5. Non-headless test suggestion ───
  step("5/5", "Teste interactivo (headful)");
  info("A abrir browser visível para comparar...");
  
  await browser.close();
  
  // Launch headful to let user see
  const browser2 = await chromium.launch({ headless: false });
  const context2 = await browser2.newContext({ storageState: SESSION });
  const page2 = await context2.newPage();
  
  await page2.goto("https://my.fpg.pt/Home/Results.aspx", { waitUntil: "domcontentloaded" });
  await page2.waitForTimeout(2000);
  await page2.goto(`https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=${FED}`, { waitUntil: "domcontentloaded" });
  
  const headfulStatus = await page2.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    hasError: document.body.innerHTML.includes("Error"),
    bodyPreview: document.body.innerText.slice(0, 200)
  }));
  
  info(`Browser visível:`);
  info(`  URL: ${headfulStatus.url}`);
  info(`  Título: ${headfulStatus.title}`);
  info(`  Erro: ${headfulStatus.hasError ? "SIM" : "não"}`);
  info(`  Preview: ${headfulStatus.bodyPreview.replace(/\n/g, " ").slice(0, 150)}`);
  
  console.log(`\n  ${YELLOW}O browser ficou aberto.${RESET}`);
  console.log(`  ${YELLOW}1. Tenta navegar manualmente para scoring.fpg.pt${RESET}`);
  console.log(`  ${YELLOW}2. Compara com o teu browser normal${RESET}`);
  console.log(`  ${YELLOW}3. Carrega ENTER aqui para fechar${RESET}\n`);
  
  await new Promise(resolve => process.stdin.once("data", resolve));
  
  // Save updated session after manual navigation
  await context2.storageState({ path: SESSION });
  ok("Sessão actualizada");
  await browser2.close();
  
  console.log(`\n${BOLD}═══ FIM ═══${RESET}\n`);
})();
