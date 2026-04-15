#!/usr/bin/env node
/**
 * test-login-auto.js — Testar se o login SSO da FPG pode ser automatizado
 *
 * Estratégia: abrir browser Playwright, navegar para o login,
 * tentar preencher user/pass automaticamente e verificar se funciona.
 *
 * Uso:
 *   node test-login-auto.js
 *     → Abre janela, pausa para login manual, depois testa APIs na MESMA sessão
 *
 *   node test-login-auto.js --auto
 *     → Tenta login automático (lê FPG_USER e FPG_PASSWORD do ambiente ou pede-os)
 *
 *   node test-login-auto.js --inspect-login
 *     → Só abre a página de login e imprime a estrutura do formulário (sem tentar logar)
 */

const { chromium } = require("playwright");
const fs = require("fs");
const readline = require("readline");

const args = process.argv.slice(2);
const AUTO_LOGIN    = args.includes("--auto");
const INSPECT_ONLY  = args.includes("--inspect-login");
const HEADLESS      = args.includes("--headless");

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m", B = "\x1b[1m", X = "\x1b[0m";

function ok(m)   { console.log(`  ${G}✓${X} ${m}`); }
function fail(m) { console.log(`  ${R}✗${X} ${m}`); }
function warn(m) { console.log(`  ${Y}⚠${X} ${m}`); }
function info(m) { console.log(`  ${C}→${X} ${m}`); }
function title(m){ console.log(`\n${B}══ ${m} ══${X}`); }

function question(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(prompt, ans => { rl.close(); resolve(ans.trim()); }));
}

// ─────────────────────────────────────────────────────────────────
// Parte 1: Inspecionar a página de login
// Perceber a estrutura do formulário SSO
// ─────────────────────────────────────────────────────────────────
async function inspectLoginPage(page) {
  title("Inspecionar estrutura da página de login");

  await page.goto("https://area.my.fpg.pt/login/", { waitUntil: "domcontentloaded", timeout: 20000 });
  const finalUrl = page.url();
  info(`URL final após goto: ${finalUrl}`);

  // Verificar se há redirect SSO externo (SAML, OAuth, etc.)
  if (!finalUrl.includes("fpg.pt")) {
    warn(`Redireccionado para fora de fpg.pt: ${finalUrl}`);
    warn(`Este é provavelmente um SSO externo — pode ser mais difícil de automatizar`);
  }

  // Mapear todos os inputs da página
  const formInfo = await page.evaluate(() => {
    const forms = [...document.querySelectorAll("form")];
    const inputs = [...document.querySelectorAll("input, button, select")];
    const links = [...document.querySelectorAll("a")].filter(a => a.href).slice(0, 10);

    return {
      url: location.href,
      title: document.title,
      forms: forms.map(f => ({
        action: f.action,
        method: f.method,
        id: f.id,
        className: f.className,
      })),
      inputs: inputs.map(i => ({
        type: i.type,
        name: i.name,
        id: i.id,
        placeholder: i.placeholder,
        className: i.className,
        value: i.type === "password" ? "***" : (i.value || ""),
        autocomplete: i.autocomplete,
      })),
      links: links.map(a => ({ href: a.href, text: a.innerText.trim().substring(0, 50) })),
      // Verificar se há iframes (SSO incorporado)
      iframes: [...document.querySelectorAll("iframe")].map(f => f.src),
      // Verificar meta redirects
      metaRefresh: document.querySelector('meta[http-equiv="refresh"]')?.content || null,
      // Verificar se há javascript redirect
      bodyText: document.body.innerText.substring(0, 500),
    };
  });

  console.log(`\n  ${B}Página de login:${X}`);
  console.log(`    URL:    ${formInfo.url}`);
  console.log(`    Título: ${formInfo.title}`);
  console.log(`    Forms:  ${formInfo.forms.length}`);
  formInfo.forms.forEach((f, i) => {
    console.log(`      Form ${i+1}: action="${f.action}" method="${f.method}" id="${f.id}"`);
  });

  console.log(`\n  ${B}Inputs encontrados (${formInfo.inputs.length}):${X}`);
  formInfo.inputs.forEach(inp => {
    const icon = inp.type === "submit" || inp.type === "button" ? "🔘" :
                 inp.type === "email" || inp.type === "text" ? "📝" :
                 inp.type === "password" ? "🔒" : "⬜";
    console.log(`    ${icon} type="${inp.type}" id="${inp.id}" name="${inp.name}" placeholder="${inp.placeholder}" autocomplete="${inp.autocomplete}"`);
  });

  if (formInfo.iframes.length > 0) {
    warn(`Iframes detectados — pode ser SSO incorporado:`);
    formInfo.iframes.forEach(src => warn(`  iframe: ${src}`));
  }

  if (formInfo.links.length > 0) {
    console.log(`\n  ${B}Links (primeiros 10):${X}`);
    formInfo.links.forEach(l => {
      if (l.href.includes("login") || l.href.includes("auth") || l.href.includes("oauth")) {
        info(`  🔑 ${l.text} → ${l.href}`);
      }
    });
  }

  // Verificar se a URL mudou (redirect SSO externo)
  if (finalUrl !== "https://area.my.fpg.pt/login/") {
    warn(`URL mudou durante o carregamento: ${finalUrl}`);
    // Verificar se é OAuth/SAML
    if (finalUrl.includes("oauth") || finalUrl.includes("saml") || finalUrl.includes("sso") ||
        finalUrl.includes("openid") || finalUrl.includes("authorize")) {
      warn(`Detectado fluxo OAuth/SAML — login automático MUITO mais complexo`);
      warn(`Vai precisar de simular o fluxo completo de autorização`);
    }
  }

  return formInfo;
}

// ─────────────────────────────────────────────────────────────────
// Parte 2: Tentar login automático
// ─────────────────────────────────────────────────────────────────
async function tryAutoLogin(page, user, password) {
  title("Tentar login automático");

  info(`Utilizador: ${user}`);
  await page.goto("https://area.my.fpg.pt/login/", { waitUntil: "domcontentloaded", timeout: 20000 });

  // Tentar encontrar o campo de email/username
  const emailSelectors = [
    "input[type='email']",
    "input[name='email']",
    "input[name='username']",
    "input[name='user']",
    "input[id*='email']",
    "input[id*='user']",
    "input[autocomplete='email']",
    "input[autocomplete='username']",
  ];

  let emailField = null;
  for (const sel of emailSelectors) {
    if (await page.locator(sel).count() > 0) {
      emailField = sel;
      ok(`Campo email encontrado: ${sel}`);
      break;
    }
  }

  if (!emailField) {
    fail("Campo de email/username não encontrado");
    // Tirar screenshot para diagnóstico
    await page.screenshot({ path: "login-debug.png" });
    info("Screenshot guardado: login-debug.png");
    return false;
  }

  // Preencher email
  await page.fill(emailField, user);
  await page.waitForTimeout(500);

  // Tentar encontrar campo de password (pode aparecer só depois do email)
  const passSelectors = [
    "input[type='password']",
    "input[name='password']",
    "input[name='pass']",
    "input[id*='pass']",
  ];

  let passField = null;
  for (const sel of passSelectors) {
    if (await page.locator(sel).count() > 0) {
      passField = sel;
      ok(`Campo password encontrado: ${sel}`);
      break;
    }
  }

  if (!passField) {
    // Alguns logins mostram password só depois de submeter o email (tipo Google)
    info("Campo password não visível ainda — tentar submeter email primeiro...");
    const nextBtn = await page.locator("button[type='submit'], input[type='submit'], button:has-text('Seguinte'), button:has-text('Next'), button:has-text('Continue')").first();
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
      await page.waitForTimeout(2000);
      for (const sel of passSelectors) {
        if (await page.locator(sel).count() > 0) {
          passField = sel;
          ok(`Campo password apareceu após submit email: ${sel}`);
          break;
        }
      }
    }
  }

  if (!passField) {
    fail("Campo de password não encontrado");
    await page.screenshot({ path: "login-debug-pass.png" });
    info("Screenshot guardado: login-debug-pass.png");
    return false;
  }

  await page.fill(passField, password);
  await page.waitForTimeout(500);

  // Submit
  const submitSelectors = [
    "button[type='submit']",
    "input[type='submit']",
    "button:has-text('Entrar')",
    "button:has-text('Login')",
    "button:has-text('Sign in')",
    "button:has-text('Iniciar')",
  ];

  let submitted = false;
  for (const sel of submitSelectors) {
    if (await page.locator(sel).count() > 0) {
      info(`Submeter com: ${sel}`);
      await page.locator(sel).first().click();
      submitted = true;
      break;
    }
  }

  if (!submitted) {
    info("Botão submit não encontrado — tentar Enter no campo password");
    await page.locator(passField).press("Enter");
  }

  // Aguardar navegação após login
  try {
    await page.waitForURL(url => !url.includes("/login"), { timeout: 15000 });
    ok(`Login submetido — URL: ${page.url()}`);
  } catch {
    const url = page.url();
    const hasError = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes("incorrecta") || text.includes("inválid") ||
             text.includes("incorrect") || text.includes("invalid") ||
             text.includes("erro") || text.includes("error");
    });
    if (hasError) {
      fail("Credenciais incorrectas ou erro no login");
    } else {
      warn(`Login não concluído, URL: ${url}`);
    }
    await page.screenshot({ path: "login-debug-after.png" });
    info("Screenshot guardado: login-debug-after.png");
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────
// Parte 3: Verificar se scoring.fpg.pt funciona após login
// Testar na MESMA sessão de browser (contexto contínuo)
// ─────────────────────────────────────────────────────────────────
async function testApisAfterLogin(page) {
  title("Testar APIs após login (mesma sessão)");

  // Navegar para scoring.fpg.pt
  info("Navegar para scoring.fpg.pt...");
  await page.goto("https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884",
    { waitUntil: "domcontentloaded", timeout: 20000 }
  );
  const url = page.url();

  if (url.includes("login") || url.includes("Login")) {
    fail(`Redireccionado para login — sessão não propagou para scoring.fpg.pt: ${url}`);
    fail("Os domínios my.fpg.pt e scoring.fpg.pt podem ter sessões independentes!");
    return false;
  }

  const rowCount = await page.evaluate(() => document.querySelectorAll("table tr").length);
  if (rowCount > 2) {
    ok(`scoring.fpg.pt funciona! ${rowCount} linhas na tabela`);
  } else {
    warn(`Página carregou mas sem dados (${rowCount} linhas)`);
    const title = await page.title();
    info(`Título: ${title}`);
  }

  // Testar a API directamente (o que o browser-script faz)
  info("Testar API: HCPWhsFederLST (jTable endpoint)...");
  const apiResult = await page.evaluate(async () => {
    try {
      const resp = await fetch("/lists/PlayerWHS.aspx/HCPWhsFederLST", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ fed_code: "52884", jtStartIndex: 0, jtPageSize: 5, jtSorting: "" }),
      });
      const json = await resp.json();
      const d = json.d || json;
      return { status: resp.status, result: d.Result, count: d.Records?.length || 0, sample: d.Records?.[0] };
    } catch (e) {
      return { error: e.message };
    }
  });

  if (apiResult.error) {
    fail(`Erro na API: ${apiResult.error}`);
  } else if (apiResult.result === "OK") {
    ok(`API WHS funcionou! ${apiResult.count} registos`);
    if (apiResult.sample) {
      ok(`Exemplo: ${JSON.stringify(apiResult.sample).substring(0, 100)}`);
    }
    return true;
  } else {
    fail(`API falhou: status=${apiResult.status}, result=${apiResult.result}`);
  }

  // Testar scoring.datagolf.pt na mesma sessão
  title("Testar scoring.datagolf.pt (mesma sessão)");
  info("Navegar para scoring.datagolf.pt...");
  await page.goto(
    "https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=988&tcode=10292",
    { waitUntil: "domcontentloaded", timeout: 20000 }
  );

  const dgTitle = await page.title();
  const hasJq = await page.evaluate(() => typeof jQuery !== "undefined");
  const dgRows = await page.evaluate(() => document.querySelectorAll("#ctl00_Content_GridView1 tr").length);

  info(`Título: "${dgTitle}", jQuery: ${hasJq}, Linhas: ${dgRows}`);

  if (dgTitle === "Param Error" || dgTitle === "Runtime Error") {
    fail(`Erro ASP.NET: "${dgTitle}" — scoring.datagolf.pt TAMBÉM precisa de sessão própria?`);
    // Verificar se há redirect de login
    const dgUrl = page.url();
    if (dgUrl.includes("login")) {
      fail(`Redireccionado para login em datagolf.pt — sessão independente!`);
    }
  } else if (dgRows > 1) {
    ok(`scoring.datagolf.pt funciona! ${dgRows} linhas`);
  } else {
    warn(`scoring.datagolf.pt carregou (${dgTitle}) mas sem tabela`);
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────
(async () => {
  console.log(`${B}🔑 Teste de Login Automático FPG${X}`);
  console.log(`  Modo: ${AUTO_LOGIN ? "automático" : INSPECT_ONLY ? "só inspecção" : "manual (tu fazes login)"}`);

  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: HEADLESS ? 0 : 100,  // Modo visual mais lento para conseguirmos ver
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  try {
    // ── Modo: só inspecionar o formulário ──
    if (INSPECT_ONLY) {
      await inspectLoginPage(page);
      console.log(`\n${Y}Para tentar login automático: node test-login-auto.js --auto${X}`);
      console.log(`Para login manual: node test-login-auto.js (sem flags)${X}`);
      await browser.close();
      return;
    }

    // ── Modo: login automático ──
    if (AUTO_LOGIN) {
      // Primeiro inspecionar para perceber a estrutura
      const formInfo = await inspectLoginPage(page);

      // Obter credenciais
      let user = process.env.FPG_USER || "";
      let password = process.env.FPG_PASSWORD || "";

      if (!user)     user     = await question(`\n  Email FPG: `);
      if (!password) password = await question(`  Password FPG: `);

      const loginOk = await tryAutoLogin(page, user, password);
      if (!loginOk) {
        fail("Login automático falhou. Usa o modo manual (sem --auto).");
        await browser.close();
        process.exit(1);
      }

    // ── Modo: login manual ──
    } else {
      title("Login manual — abre a janela e faz login tu");
      await page.goto("https://area.my.fpg.pt/login/", { waitUntil: "domcontentloaded", timeout: 20000 });

      console.log(`\n  ${Y}O browser abriu. Faz login manualmente.${X}`);
      console.log(`  ${Y}Depois de fazeres login, navega para:${X}`);
      console.log(`  ${Y}  https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884${X}`);
      console.log(`  ${Y}Quando vires a tabela, volta aqui e carrega ENTER.${X}\n`);
      await question("  → Carrega ENTER quando estiveres na tabela: ");
    }

    // ── Testar APIs na sessão activa ──
    const apiOk = await testApisAfterLogin(page);

    // ── Guardar sessão actualizada ──
    if (apiOk) {
      title("Guardar sessão");
      await context.storageState({ path: "session-fresh.json" });
      ok("session-fresh.json guardado!");
      info("Este session.json tem a sessão activa — mas vai expirar!");
      info("Para GitHub Actions precisas de automatizar o login (--auto) OU usar self-hosted runner.");
    }

    // ── Resultado final ──
    title("Conclusão");
    if (apiOk) {
      ok(`${G}${B}FUNCIONA na mesma sessão${X}`);
      ok("O Playwright consegue aceder à API quando o login é feito no MESMO contexto de browser");
      info("Para GitHub Actions: precisamos de automatizar o login (--auto) OU");
      info("usar um self-hosted runner onde a sessão está sempre activa.");
    } else {
      fail("APIs não funcionaram mesmo após login");
      fail("Os domínios podem ter sessões totalmente independentes");
    }

  } catch (err) {
    console.error(`\n${R}Erro inesperado: ${err.message}${X}`);
    console.error(err.stack);
  } finally {
    await browser.close();
  }
})();
