/**
 * scripts/discover-england-golf-events.js
 *
 * Lista os eventos publicados pelo England Golf no GolfGenius e propoe entradas
 * novas para `public/data/england-golf-catalog.json`.
 *
 * PORQUE EXISTE: o catalogo e curado a mao e os ids do GolfGenius mudam TODOS os
 * anos (ate o subdominio: eg-carristrophy25 -> eg-carristrophy26). Sem isto, um
 * ano novo simplesmente nunca entra -- foi o que aconteceu a 2026, que ficou com
 * uma unica entrada desde Maio.
 *
 * FONTE: o directorio publico do England Golf
 *   /leagues/36129/customer_directories/10291/directory_iframe
 * E uma app React, por isso e preciso browser (o HTML cru vem vazio). Cada cartao
 * de evento da DUAS paginas: o link "Results" do proprio cartao e a pagina de
 * aterragem para onde /ggid/{ggid} redirecciona.
 *
 * ⚠ NEM SEMPRE SAO A MESMA, e a de aterragem nem sempre serve. No Carris Trophy
 * 2026 a aterragem e /pages/6135942 ("Leaderboard"), onde o dropdown de eventos
 * vem VAZIO e o scraper salta o torneio; o "Results" do cartao (/pages/5644445)
 * abre a vista certa, com as 4 rondas e 195 jogadores. Por isso propoe-se o
 * "Results" primeiro e a aterragem so como alternativa -- e imprimem-se as duas.
 *
 * ⚠ O GolfGenius devolve 403 a `page.goto` directo em /pages/{id} vindo de um
 * browser automatizado, mas serve o directorio e os widgets normalmente. Por isso
 * a resolucao ggid -> pagina e feita por `fetch` dentro do contexto do browser.
 *
 * USO:
 *   node scripts/discover-england-golf-events.js              # so juvenis (default)
 *   node scripts/discover-england-golf-events.js --all        # todos os eventos
 *   node scripts/discover-england-golf-events.js --year 2027
 *   node scripts/discover-england-golf-events.js --json out.json
 *
 * Exit codes: 0 = ha eventos por acrescentar | 2 = nada novo | 1 = erro.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const DIRECTORY_URL =
  "https://www.golfgenius.com/leagues/36129/customer_directories/10291/directory_iframe?league=36129";

/* Eventos juvenis: os que interessam ao site. Deliberadamente largo -- e melhor
   propor a mais e descartar do que perder uma prova nova. */
const JUNIOR_RX =
  /\b(boys|girls|junior|youth|schools|carris|mcgregor|reid|bronte|u1[0-8]|under\s*1[0-8])\b/i;
/* Provas de adultos que batem no regex acima por causa de "Boys'/Girls'" no nome
   de uma prova de campeoes de condado que junta todos os escaloes. */
const NOT_JUNIOR_RX = /champion of champions|senior|women's amateur|men's amateur/i;

function parseArgs(argv) {
  const a = { all: false, year: new Date().getFullYear(), json: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--all") a.all = true;
    else if (argv[i] === "--year") a.year = parseInt(argv[++i], 10);
    else if (argv[i] === "--json") a.json = argv[++i];
  }
  return a;
}

/* Opcoes de launch sensiveis ao ambiente (ver scrape-england-golf.js). */
function launchOptions() {
  const opts = { headless: true };
  const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (exe) opts.executablePath = exe;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy) {
    opts.proxy = { server: proxy };
    opts.args = ["--disable-quic", "--disable-http2", "--ssl-version-max=tls1.2"];
  }
  return opts;
}

async function discover() {
  const browser = await chromium.launch(launchOptions());
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1024 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    locale: "en-GB",
    timezoneId: "Europe/London",
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = { runtime: {} };
  });
  const page = await ctx.newPage();
  try {
    await page.goto(DIRECTORY_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(9000);
    // o directorio carrega por scroll
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
    }

    const events = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      document.querySelectorAll('a[href*="/ggid/"]').forEach((a) => {
        const title = (a.textContent || "").trim().replace(/\s+/g, " ");
        if (!title || /^(view|checkout|register|sign in)$/i.test(title)) return;
        const ggid = (a.getAttribute("href") || "").match(/\/ggid\/([^/?]+)/);
        if (!ggid) return;
        const key = title + "|" + ggid[1];
        if (seen.has(key)) return;
        seen.add(key);
        // pagina "Results" do cartao, como alternativa a de aterragem
        let node = a, card = null;
        for (let up = 0; up < 8 && node; up++) {
          node = node.parentElement;
          if (node && node.querySelector('a[href^="/pages/"]')) { card = node; break; }
        }
        const results = card
          ? [...card.querySelectorAll('a[href^="/pages/"]')]
              .filter((x) => /result/i.test(x.textContent || ""))
              .map((x) => (x.getAttribute("href") || "").match(/\/pages\/(\d+)/)?.[1])[0] || null
          : null;
        out.push({ title, ggid: ggid[1], resultsPage: results });
      });
      return out;
    });

    // ggid -> pagina de aterragem (redirect), resolvido dentro do browser
    for (const ev of events) {
      ev.landingPage = await page.evaluate(async (ggid) => {
        try {
          const r = await fetch(
            "/ggid/" + ggid + "/guest?from_directory=true&skip_ggid=true",
            { redirect: "follow", credentials: "include" }
          );
          return (r.url || "").match(/\/pages\/(\d+)/)?.[1] || null;
        } catch { return null; }
      }, ev.ggid);
    }
    return events;
  } finally {
    await browser.close();
  }
}

(async () => {
  const args = parseArgs(process.argv);
  let events;
  try {
    events = await discover();
  } catch (e) {
    console.error("erro na descoberta: " + e.message);
    process.exit(1);
  }
  if (!events.length) {
    console.error("directorio devolveu 0 eventos -- provavelmente falhou a carregar");
    process.exit(1);
  }

  const catPath = path.resolve(__dirname, "../public/data/england-golf-catalog.json");
  const cat = JSON.parse(fs.readFileSync(catPath, "utf-8"));
  const known = new Set(
    (cat.tournaments || []).map((t) => String(t.gg_page))
  );

  const yy = String(args.year).slice(2);
  let list = events;
  if (!args.all) list = list.filter((e) => JUNIOR_RX.test(e.title) && !NOT_JUNIOR_RX.test(e.title));
  // os ggid do England Golf terminam no ano a 2 digitos (carris26, reid26, ...)
  list = list.filter((e) => e.ggid.includes(yy));

  const missing = list.filter(
    (e) => !known.has(String(e.landingPage)) && !known.has(String(e.resultsPage))
  );
  // Preferir o "Results" do cartao a pagina de aterragem (ver cabecalho).
  const pageFor = (e) => String(e.resultsPage || e.landingPage || "");

  console.log(
    events.length + " eventos no directorio | " + list.length + " juvenis de " +
    args.year + " | " + missing.length + " por acrescentar ao catalogo\n"
  );
  for (const e of missing) {
    console.log(
      "  " + e.ggid.padEnd(12) + " page=" + (pageFor(e) || "?").padEnd(9) +
      " (alt=" + String(e.landingPage === e.resultsPage ? "-" : e.landingPage || "-").padEnd(9) + ") " + e.title
    );
  }
  if (missing.length) {
    console.log("\nEntradas a colar em public/data/england-golf-catalog.json (rever section/gender/ageGroup):");
    console.log(
      JSON.stringify(
        missing.map((e) => ({
          year: args.year,
          section: "REVER",
          gender: "REVER",
          ageGroup: "REVER",
          slug: e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + args.year,
          title: e.title + " " + args.year,
          gg_base: "https://www.golfgenius.com",
          gg_page: pageFor(e),
        })),
        null, 2
      )
    );
  }
  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify(events, null, 2), "utf-8");
    console.log("\nlista completa -> " + args.json);
  }
  process.exit(missing.length ? 0 : 2);
})();
