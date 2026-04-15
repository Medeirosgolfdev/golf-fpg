#!/usr/bin/env node
/**
 * test-fpg.js — Diagnóstico da ligação à FPG
 * 
 * Testa sessão, endpoints e estrutura das respostas.
 * Corre: node test-fpg.js [federado]
 *        node test-fpg.js 52884
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const FED = process.argv[2] || "52884";
const SESSION = path.join(process.cwd(), "session.json");

const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", CYAN = "\x1b[36m", RESET = "\x1b[0m", BOLD = "\x1b[1m", DIM = "\x1b[2m";
const ok = (msg) => console.log(`  ${GREEN}✓${RESET} ${msg}`);
const fail = (msg) => console.log(`  ${RED}✗${RESET} ${msg}`);
const warn = (msg) => console.log(`  ${YELLOW}⚠${RESET} ${msg}`);
const info = (msg) => console.log(`  ${CYAN}ℹ${RESET} ${msg}`);
const step = (n, msg) => console.log(`\n${BOLD}[${n}] ${msg}${RESET}`);

(async () => {
  console.log(`\n${BOLD}═══ Diagnóstico FPG — ${new Date().toISOString().slice(0,16)} ═══${RESET}`);
  console.log(`  Federado: ${FED}`);
  let allOk = true;

  // ─── 1. Session file ───
  step("1/7", "Verificar session.json");
  if (!fs.existsSync(SESSION)) {
    fail("session.json NÃO EXISTE — corre 'node login.js' ou 'node golf-all.js --login'");
    process.exit(1);
  }
  const session = JSON.parse(fs.readFileSync(SESSION, "utf-8"));
  const cookies = session.cookies || [];
  ok(`session.json encontrado (${cookies.length} cookies)`);

  // Check key cookies
  const domains = [...new Set(cookies.map(c => c.domain))];
  info(`Domínios: ${domains.join(", ")}`);

  const aspSession = cookies.find(c => c.name === "ASP.NET_SessionId" && c.domain === "my.fpg.pt");
  const scoringSession = cookies.find(c => c.name === "ASP.NET_SessionId" && c.domain === "scoring.fpg.pt");
  const userToken = cookies.find(c => c.name === "userToken");

  if (aspSession) ok(`Cookie my.fpg.pt ASP.NET_SessionId: ${aspSession.value.slice(0,8)}...`);
  else { fail("FALTA cookie ASP.NET_SessionId para my.fpg.pt"); allOk = false; }

  if (scoringSession) ok(`Cookie scoring.fpg.pt ASP.NET_SessionId: ${scoringSession.value.slice(0,8)}...`);
  else warn("Cookie scoring.fpg.pt — pode ser criado pelo SSO warmup");

  if (userToken) ok(`Cookie userToken: ${userToken.value.slice(0,20)}...`);
  else warn("Sem userToken — pode ser normal");

  // Check session age
  const sessionStat = fs.statSync(SESSION);
  const ageHours = (Date.now() - sessionStat.mtimeMs) / 3600000;
  if (ageHours > 24) warn(`session.json tem ${ageHours.toFixed(0)}h — sessão provavelmente expirada!`);
  else if (ageHours > 8) warn(`session.json tem ${ageHours.toFixed(1)}h — pode estar expirada`);
  else ok(`session.json tem ${ageHours.toFixed(1)}h — recente`);

  // ─── 2. Launch browser ───
  step("2/7", "Abrir browser com sessão");
  let browser, context, page;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ storageState: SESSION });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    ok("Browser headless lançado");
  } catch (err) {
    fail(`Erro ao lançar browser: ${err.message}`);
    process.exit(1);
  }

  // ─── 3. Test my.fpg.pt ───
  step("3/7", "Navegar para my.fpg.pt/Home/Results.aspx");
  try {
    const resp = await page.goto("https://my.fpg.pt/Home/Results.aspx", { waitUntil: "domcontentloaded", timeout: 15000 });
    const status = resp?.status();
    const url = page.url();

    if (status === 200) ok(`HTTP ${status}`);
    else { fail(`HTTP ${status}`); allOk = false; }

    if (url.includes("login") || url.includes("Login") || url.includes("signin")) {
      fail(`REDIRECCIONADO para login: ${url}`);
      warn("→ Sessão expirada! Corre: node login.js");
      allOk = false;
    } else {
      ok(`URL final: ${url}`);
    }

    const title = await page.title();
    info(`Título: ${title}`);
  } catch (err) {
    fail(`Erro: ${err.message}`);
    allOk = false;
  }

  await page.waitForTimeout(500);

  // ─── 4. Test scoring.fpg.pt ───
  step("4/7", `Navegar para scoring.fpg.pt/lists/PlayerWHS.aspx?no=${FED}`);
  try {
    const resp = await page.goto(`https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=${FED}`, { waitUntil: "domcontentloaded", timeout: 15000 });
    const status = resp?.status();
    const url = page.url();

    if (status === 200) ok(`HTTP ${status}`);
    else { fail(`HTTP ${status}`); allOk = false; }

    if (url.includes("login") || url.includes("Login")) {
      fail(`REDIRECCIONADO para login: ${url}`);
      allOk = false;
    } else {
      ok(`URL final: ${url}`);
    }

    const title = await page.title();
    info(`Título: ${title}`);

    // Check if scoring page has expected structure
    const hasTable = await page.evaluate(() => {
      return {
        hasJTable: !!document.querySelector(".jtable"),
        hasScoring: document.body.innerHTML.includes("PlayerWHS") || document.body.innerHTML.includes("HCPWhs"),
        bodyLen: document.body.innerHTML.length,
        bodyPreview: document.body.innerText.slice(0, 200)
      };
    });
    if (hasTable.hasJTable) ok("Encontrou .jtable na página");
    else warn(`Sem .jtable — bodyLen=${hasTable.bodyLen}`);
    info(`Preview: ${hasTable.bodyPreview.replace(/\n/g, " ").slice(0, 120)}...`);
  } catch (err) {
    fail(`Erro: ${err.message}`);
    allOk = false;
  }

  await page.waitForTimeout(500);

  // ─── 5. Test WHS API ───
  step("5/7", "Testar API WHS (HCPWhsFederLST)");
  try {
    const result = await page.evaluate(async ({ FED }) => {
      try {
        const res = await fetch(`PlayerWHS.aspx/HCPWhsFederLST?fed_code=${FED}&jtStartIndex=0&jtPageSize=5`, {
          method: "POST",
          headers: {
            "x-requested-with": "XMLHttpRequest",
            "accept": "application/json, text/javascript, */*; q=0.01",
            "content-type": "application/json; charset=utf-8"
          },
          body: JSON.stringify({
            fed_code: String(FED),
            jtStartIndex: "0",
            jtPageSize: "5"
          })
        });
        const text = await res.text();
        return { status: res.status, text: text.slice(0, 1000), ok: true };
      } catch (err) {
        return { status: 0, text: err.message, ok: false };
      }
    }, { FED });

    if (!result.ok) {
      fail(`Fetch falhou: ${result.text}`);
      allOk = false;
    } else if (result.status !== 200) {
      fail(`HTTP ${result.status}`);
      info(`Resposta: ${result.text.slice(0, 300)}`);
      allOk = false;
    } else {
      ok(`HTTP ${result.status}`);
      try {
        const json = JSON.parse(result.text);
        const payload = json?.d ?? json;
        if (payload?.Result === "OK") {
          const recs = payload.Records || [];
          ok(`Result=OK, ${recs.length} registos (pedimos 5)`);
          if (recs.length > 0) {
            const r = recs[0];
            info(`1º registo: score_id=${r.score_id}, date=${r.event_date || r.played_date}, course=${r.course_name || "?"}`);
            info(`Campos: ${Object.keys(r).join(", ")}`);
          }
        } else {
          fail(`Result=${payload?.Result} (esperado: OK)`);
          info(`Resposta: ${JSON.stringify(payload).slice(0, 300)}`);
          allOk = false;
        }
      } catch (e) {
        fail(`Resposta não é JSON: ${result.text.slice(0, 200)}`);
        allOk = false;
      }
    }
  } catch (err) {
    fail(`Erro: ${err.message}`);
    allOk = false;
  }

  // ─── 6. Test Scorecard API ───
  step("6/7", "Testar API Scorecard (ScoreCard)");
  try {
    // Get a score_id to test with
    const whsPath = path.join(process.cwd(), "output", FED, "whs-list.json");
    let testScoreId = null, testScoringType = null, testCompType = null;

    if (fs.existsSync(whsPath)) {
      const whs = JSON.parse(fs.readFileSync(whsPath, "utf-8"));
      const recs = whs?.Records || [];
      if (recs.length > 0) {
        const last = recs[recs.length - 1]; // último (mais recente)
        testScoreId = last.score_id;
        testScoringType = last.scoring_type_id;
        testCompType = last.competition_type_id;
        info(`A testar com score_id=${testScoreId} (${last.event_date || last.played_date})`);
      }
    }

    // Also try to fetch from the fresh API call
    if (!testScoreId) {
      const freshResult = await page.evaluate(async ({ FED }) => {
        const res = await fetch(`PlayerWHS.aspx/HCPWhsFederLST?fed_code=${FED}&jtStartIndex=0&jtPageSize=1`, {
          method: "POST",
          headers: { "x-requested-with": "XMLHttpRequest", "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({ fed_code: String(FED), jtStartIndex: "0", jtPageSize: "1" })
        });
        return await res.text();
      }, { FED });
      const j = JSON.parse(freshResult);
      const p = j?.d ?? j;
      if (p?.Records?.[0]) {
        const r = p.Records[0];
        testScoreId = r.score_id;
        testScoringType = r.scoring_type_id;
        testCompType = r.competition_type_id;
        info(`A testar com score_id=${testScoreId} (da API fresh)`);
      }
    }

    if (!testScoreId) {
      warn("Não consegui obter um score_id para testar");
    } else {
      const scResult = await page.evaluate(async ({ scoreId, scoringType, competitionType }) => {
        try {
          const res = await fetch(`PlayerWHS.aspx/ScoreCard?score_id=${scoreId}&scoringtype=${scoringType}&competitiontype=${competitionType}`, {
            method: "POST",
            headers: { "x-requested-with": "XMLHttpRequest", "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              score_id: String(scoreId),
              scoringtype: String(scoringType),
              competitiontype: String(competitionType)
            })
          });
          const text = await res.text();
          return { status: res.status, text: text.slice(0, 1500), ok: true };
        } catch (err) {
          return { status: 0, text: err.message, ok: false };
        }
      }, { scoreId: testScoreId, scoringType: testScoringType, competitionType: testCompType });

      if (!scResult.ok) {
        fail(`Fetch falhou: ${scResult.text}`);
        allOk = false;
      } else if (scResult.status === 500) {
        fail(`HTTP 500 — Server error interno da FPG`);
        info(`Resposta: ${scResult.text.slice(0, 300)}`);
        warn("Isto pode significar que a API mudou ou o servidor está com problemas");
        allOk = false;
      } else if (scResult.status !== 200) {
        fail(`HTTP ${scResult.status}`);
        info(`Resposta: ${scResult.text.slice(0, 300)}`);
        allOk = false;
      } else {
        ok(`HTTP ${scResult.status}`);
        try {
          const json = JSON.parse(scResult.text);
          const payload = json?.d ?? json;
          if (payload?.Result === "OK") {
            ok("Result=OK — scorecard obtido com sucesso");
            const holes = payload.Records?.[0];
            if (holes) {
              info(`Campos: ${Object.keys(holes).join(", ")}`);
              info(`Buracos: ${payload.Records?.length || 0} registos`);
            }
          } else {
            fail(`Result=${payload?.Result}`);
            info(`Resposta: ${JSON.stringify(payload).slice(0, 300)}`);
            allOk = false;
          }
        } catch (e) {
          fail(`Resposta não é JSON: ${scResult.text.slice(0, 200)}`);
          allOk = false;
        }
      }
    }
  } catch (err) {
    fail(`Erro: ${err.message}`);
    allOk = false;
  }

  // ─── 7. Check for URL/structure changes ───
  step("7/7", "Verificar alterações na estrutura do site");
  try {
    // Check if main page has changed
    const check = await page.evaluate(() => {
      const scripts = [...document.querySelectorAll("script[src]")].map(s => s.src);
      const links = [...document.querySelectorAll("link[href]")].filter(l => l.rel === "stylesheet").map(l => l.href);
      const meta = document.querySelector('meta[name="generator"]')?.content;
      return {
        scripts: scripts.filter(s => s.includes("fpg") || s.includes("scoring")).slice(0, 5),
        styles: links.filter(l => l.includes("fpg") || l.includes("scoring")).slice(0, 5),
        generator: meta || "n/a",
        url: window.location.href,
        hasjQuery: typeof jQuery !== "undefined",
        hasJtable: typeof jQuery !== "undefined" && typeof jQuery.fn?.jtable !== "undefined"
      };
    });
    info(`URL actual: ${check.url}`);
    info(`Generator: ${check.generator}`);
    info(`jQuery: ${check.hasjQuery ? "sim" : "NÃO"}, jTable: ${check.hasJtable ? "sim" : "NÃO"}`);
    if (check.scripts.length) info(`Scripts FPG: ${check.scripts.join(", ")}`);

    // Try alternate endpoints that might indicate a migration
    const altUrls = [
      "https://scoring.fpg.pt/api/",
      "https://scoring.fpg.pt/v2/",
      "https://new.fpg.pt/",
      "https://scoring.fpg.pt/lists/PlayerWHS.aspx",
    ];
    for (const u of altUrls.slice(0, 2)) {
      try {
        const r = await page.evaluate(async (url) => {
          try {
            const res = await fetch(url, { method: "HEAD" });
            return { status: res.status, redirect: res.url !== url ? res.url : null };
          } catch { return { status: "erro" }; }
        }, u);
        if (r.redirect) warn(`${u} → redireciona para ${r.redirect}`);
        else info(`${u} → HTTP ${r.status}`);
      } catch {}
    }
  } catch (err) {
    warn(`Não consegui verificar estrutura: ${err.message}`);
  }

  // ─── Resumo ───
  await browser.close();

  console.log(`\n${BOLD}═══ RESULTADO ═══${RESET}`);
  if (allOk) {
    console.log(`${GREEN}${BOLD}  ✓ Tudo OK — FPG está acessível e a responder normalmente${RESET}`);
    console.log(`  Corre: ${CYAN}node golf-all.js --refresh ${FED}${RESET}`);
  } else {
    console.log(`${RED}${BOLD}  ✗ Problemas detectados${RESET}`);
    console.log(`\n  Soluções possíveis:`);
    console.log(`  ${CYAN}1.${RESET} Sessão expirada → ${YELLOW}node login.js${RESET}`);
    console.log(`  ${CYAN}2.${RESET} Servidor em baixo → esperar e tentar mais tarde`);
    console.log(`  ${CYAN}3.${RESET} API mudou → ver output acima para detalhes`);
    console.log(`  ${CYAN}4.${RESET} Testar manualmente → abrir ${YELLOW}https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=${FED}${RESET} no browser`);
  }
  console.log();
})();
