/**
 * scrape-eowagr25-all.js
 *
 * Descarrega TODOS os escalões do European Open WAGR (BlueGolf), descobrindo-os
 * automaticamente a partir do evento (não é preciso saber os nº de contest).
 * Corre sequencialmente — um browser, um escalão de cada vez. Resolve CAPTCHA
 * manualmente quando aparece (browser visível).
 *
 * Descobertas incorporadas (sessão 2026-05):
 *   • Auto-discovery: lê o seletor de flights da página de um contest semente
 *     (CONTESTS[0]) e apanha Boys + Girls + todas as idades.
 *   • Captura `yards` por buraco (input[data-distance]) → distâncias no scorecard
 *     (o site converte depois yards→metros).
 *   • Grava `category` (nome do escalão) em cada ficheiro.
 *
 * USO:
 *   node scrape-eowagr25-all.js                  # Firefox (defeito)
 *   BROWSER=chrome node scrape-eowagr25-all.js   # forçar Chrome real
 *   (Firefox precisa de: npx playwright install firefox)
 *
 * Ficheiros gerados (1 por escalão): eowagr25_contest<id>.json
 * Depois: copiar para public/data/ e registar no array URLS do BJGTPage.
 */

const { chromium, firefox } = require("playwright");
const fs = require("fs");

/* ─── Torneios a descarregar ─── */
const CONTESTS = [
  {
    url: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/13/leaderboard.htm",
    out: "eowagr25_contest13.json",
  },
  {
    url: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/77/leaderboard.htm",
    out: "eowagr25_contest77.json",
  },
  {
    url: "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/121/leaderboard.htm",
    out: "eowagr25_contest121.json",
  },
];

const DELAY_MS = 700;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─── CAPTCHA ─── */
/** Verifica o estado HTTP real da navegação. 403/429 = bloqueio do servidor. */
function checkBlocked(resp, url) {
  const status = resp ? resp.status() : 0;
  if (status === 403 || status === 429) {
    console.error(`\n🚫 BlueGolf devolveu HTTP ${status} — bloqueio de servidor (Cloudflare/IP).`);
    console.error(`   URL: ${url}`);
    console.error("   Não é cache local. Teste decisivo: abre este URL no teu Chrome normal.");
    console.error("   • Se também der 403 → bloqueio de IP: muda de IP (hotspot 4G / VPN) ou espera.");
    console.error("   • Se abrir normalmente → deteção de automação: avisa-me que ligo via CDP ao teu Chrome.\n");
    throw new Error(`BlueGolf HTTP ${status}`);
  }
}

async function waitForHuman(page) {
  const title = (await page.title()).toLowerCase();
  if (!title.includes("confirm") && !title.includes("human")) return;
  console.log("\n⏳ CAPTCHA detectado! Resolve no browser...");
  await page.waitForFunction(
    () =>
      !document.title.toLowerCase().includes("confirm") &&
      !document.title.toLowerCase().includes("human"),
    { timeout: 300_000 }
  );
  console.log("✅ CAPTCHA resolvido!\n");
  await sleep(1500);
}

/* ─── Extrair scorecard ─── */
async function extractScorecard(page) {
  return page.evaluate(() => {
    const result = {
      name: "",
      country: "",
      pos: null,
      result: "",
      total: null,
      par: [],
      si: [],
      yards: [],
      rounds: [],
    };

    /* Nome */
    const nameSelectors = [
      ".bg-profile-header h3 a",
      ".bg-profile-header h2 a",
      ".player-name a",
      ".player-name",
      "h3.contestant-name",
      ".contestant-name",
    ];
    for (const sel of nameSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const clone = el.cloneNode(true);
        clone.querySelectorAll("i, img, span.flag-icon, svg").forEach((x) => x.remove());
        const txt = clone.textContent.replace(/\s+/g, " ").trim();
        if (txt.length > 1) { result.name = txt; break; }
      }
    }

    /* País */
    for (const sel of [
      ".bg-profile-header p.text-muted",
      ".bg-profile-header .text-muted",
      ".player-country",
      ".contestant-country",
    ]) {
      const el = document.querySelector(sel);
      if (el) { result.country = el.textContent.trim(); break; }
    }

    /* Posição / resultado / total */
    for (const tr of document.querySelectorAll(
      "table.scorecard-profile tr, table.player-profile tr"
    )) {
      const tds = tr.querySelectorAll("td");
      if (tds.length < 2) continue;
      const label = tds[0].textContent.trim().toLowerCase();
      const val = tds[1].textContent.trim();
      if (label.includes("posi")) result.pos = parseInt(val, 10) || null;
      if (label.includes("resultado") || label.includes("result")) result.result = val;
      if (label.includes("tacada") || label.includes("stroke") || label.includes("total"))
        result.total = parseInt(val, 10) || null;
    }

    /* Parser de tabela */
    function parseTable(table) {
      const localPar = [], localSi = [], localYards = [], localRounds = [];

      for (const inp of table.querySelectorAll('input[type="hidden"][data-par]'))
        localPar.push(parseInt(inp.getAttribute("data-par"), 10));

      // Distâncias (yards) — input hidden com data-distance, por ordem dos buracos.
      for (const inp of table.querySelectorAll('input[type="hidden"][data-distance]')) {
        const v = parseInt(inp.getAttribute("data-distance"), 10);
        if (!isNaN(v) && v > 0) localYards.push(v);
      }

      if (localPar.length === 0) {
        for (const tr of table.querySelectorAll("tr")) {
          const first = tr.querySelector("td, th");
          if (first && first.textContent.trim().toLowerCase() === "par") {
            for (const td of Array.from(tr.querySelectorAll("td, th")).slice(1)) {
              const n = parseInt(td.textContent.trim(), 10);
              if (!isNaN(n) && n >= 3 && n <= 5) localPar.push(n);
            }
            break;
          }
        }
      }

      for (const tr of table.querySelectorAll("tr")) {
        const first = tr.querySelector("td, th");
        if (!first) continue;
        const label = first.textContent.trim().toLowerCase();
        if (label === "hcp" || label.includes("handicap")) {
          for (const td of Array.from(tr.querySelectorAll("td, th")).slice(1)) {
            const n = parseInt(td.textContent.trim(), 10);
            if (!isNaN(n) && n >= 1 && n <= 18) localSi.push(n);
          }
          break;
        }
      }

      const scoreRows = table.querySelectorAll("tr.scores");
      if (scoreRows.length > 0) {
        for (const tr of scoreRows) {
          const scores = [];
          for (const td of Array.from(tr.querySelectorAll("td")).slice(1)) {
            const n = parseInt(td.textContent.trim(), 10);
            if (!isNaN(n) && n >= 1 && n <= 15) scores.push(n);
          }
          if (scores.length >= 9) localRounds.push(scores);
        }
      } else {
        for (const tr of table.querySelectorAll("tr")) {
          const first = tr.querySelector("td");
          if (!first) continue;
          const label = first.textContent.trim().toLowerCase();
          if (label.match(/^(volta|rd|round)\s*\d/) || label.match(/^r\s*\d$/)) {
            const scores = [];
            for (const td of Array.from(tr.querySelectorAll("td")).slice(1)) {
              const n = parseInt(td.textContent.trim(), 10);
              if (!isNaN(n) && n >= 1 && n <= 15) scores.push(n);
            }
            if (scores.length >= 9) localRounds.push(scores);
          }
        }
      }
      return { par: localPar, si: localSi, yards: localYards, rounds: localRounds };
    }

    /* Desktop block */
    const desktopBlock =
      document.querySelector(".row.d-none.d-md-block") ||
      document.querySelector(".d-none.d-md-flex") ||
      document.querySelector(".desktop-scorecard");

    if (desktopBlock) {
      const table = desktopBlock.querySelector(
        "table.bg-tbl-scorecard, table.scorecard-table, table"
      );
      if (table) {
        const p = parseTable(table);
        if (p.par.length > 0) result.par = p.par.slice(0, 18);
        if (p.si.length > 0) result.si = p.si.slice(0, 18);
        if (p.yards.length > 0) result.yards = p.yards.slice(0, 18);
        if (p.rounds.length > 0) result.rounds = p.rounds;
      }
    }

    /* Fallback mobile */
    if (result.rounds.length === 0) {
      const allTables = document.querySelectorAll(
        "table.bg-tbl-scorecard, table.scorecard-table"
      );
      const mobileRounds = [];
      for (const table of allTables) {
        const p = parseTable(table);
        if (result.par.length === 0 && p.par.length > 0) result.par = p.par.slice(0, 18);
        if (result.si.length === 0 && p.si.length > 0) result.si = p.si.slice(0, 18);
        if (result.yards.length === 0 && p.yards.length > 0) result.yards = p.yards.slice(0, 18);
        mobileRounds.push(...p.rounds);
      }
      if (mobileRounds.length >= 2 && mobileRounds[0].length === 9) {
        for (let i = 0; i + 1 < mobileRounds.length; i += 2)
          result.rounds.push([...mobileRounds[i], ...mobileRounds[i + 1]]);
      } else if (mobileRounds.length > 0) {
        result.rounds = mobileRounds;
      }
    }

    return result;
  });
}

/* ─── Scrape um contest ─── */
async function scrapeContest(page, contestUrl, outFile, category) {
  const contestMatch = contestUrl.match(/^(https?:\/\/.+\/contest\/\d+)/);
  if (!contestMatch) throw new Error("URL inválida: " + contestUrl);
  const contestBase = contestMatch[1];
  const contestId = contestUrl.match(/contest\/(\d+)/)[1];

  console.log(`\n${"═".repeat(60)}`);
  console.log(`📋 Contest ${contestId} → ${outFile}`);
  console.log(`   URL: ${contestUrl}`);

  const resp = await page.goto(contestUrl, { waitUntil: "domcontentloaded" });
  checkBlocked(resp, contestUrl);
  await waitForHuman(page);
  await page.waitForLoadState("networkidle");

  const pageTitle = await page.title();
  const tournamentTitle = pageTitle
    .replace(/ \| .*$/, "")
    .replace(" Leaderboard", "")
    .trim();
  console.log(`   Torneio: ${tournamentTitle}`);

  /* Contestants */
  const contestants = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="contestant"], a[href*="player"]');
    const seen = new Map();
    for (const link of links) {
      const href = link.getAttribute("href") || "";
      const match = href.match(/contestant\/(\d+)/);
      if (!match) continue;
      const id = match[1];
      if (seen.has(id)) continue;
      const clone = link.cloneNode(true);
      clone.querySelectorAll("i, img, span.flag-icon, svg").forEach((el) => el.remove());
      const name = clone.textContent.replace(/\s+/g, " ").trim();
      seen.set(id, { id, name });
    }
    return Array.from(seen.values());
  });

  console.log(`   Jogadores: ${contestants.length}\n`);

  if (contestants.length === 0) {
    const html = await page.content();
    const debugFile = `debug_contest${contestId}.html`;
    fs.writeFileSync(debugFile, html);
    console.error(`   ❌ Nenhum contestant. HTML guardado em ${debugFile}`);
    return;
  }

  /* Scorecards */
  const players = [];
  let par = null;
  let si = null;
  let yards = null;

  for (let i = 0; i < contestants.length; i++) {
    const c = contestants[i];
    const url = `${contestBase}/contestant/${c.id}/scorecard.htm`;

    process.stdout.write(
      `\r   🔍 [${String(i + 1).padStart(2)}/${contestants.length}] ${c.name.padEnd(32).slice(0, 32)}`
    );

    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await waitForHuman(page);
      await page
        .waitForSelector(
          "table.bg-tbl-scorecard, table.scorecard-table, table.scorecard-profile",
          { timeout: 12_000 }
        )
        .catch(() => {});

      const sc = await extractScorecard(page);

      if (!par && sc.par.length >= 9) par = sc.par.slice(0, 18);
      if (!si && sc.si.length >= 9) si = sc.si.slice(0, 18);
      if (!yards && sc.yards && sc.yards.length >= 9) yards = sc.yards.slice(0, 18);

      const name = sc.name && sc.name.length > 1 ? sc.name : c.name;
      const rounds = sc.rounds.map((scores, idx) => {
        const f9 = scores.slice(0, 9).reduce((a, b) => a + b, 0);
        const b9 = scores.length > 9 ? scores.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
        const gross = scores.reduce((a, b) => a + b, 0);
        return { day: idx + 1, scores, f9, ...(scores.length > 9 ? { b9 } : {}), gross };
      });

      const total =
        rounds.length > 0 ? rounds.reduce((a, r) => a + r.gross, 0) : sc.total;
      const parTotal = par ? par.reduce((a, b) => a + b, 0) : 0;
      const result =
        parTotal > 0 && rounds.length > 0 ? total - parTotal * rounds.length : null;

      players.push({ name, country: sc.country || "", pos: sc.pos, result, total, rounds });

      const nR = rounds.length;
      const nH = nR > 0 ? rounds[0].scores.length : 0;
      process.stdout.write(
        nR === 0 ? " ⚠️  sem scores" : ` ✅ ${nR}R ${nH}H gross=${total}`
      );
    } catch (err) {
      process.stdout.write(` ❌ ${err.message.slice(0, 35)}`);
      players.push({
        name: c.name,
        country: "",
        pos: null,
        result: null,
        total: null,
        rounds: [],
        _error: err.message,
      });
    }

    await sleep(DELAY_MS);
  }

  console.log("\n");

  /* Output */
  const parF9 = par ? par.slice(0, 9).reduce((a, b) => a + b, 0) : null;
  const parB9 = par && par.length > 9 ? par.slice(9).reduce((a, b) => a + b, 0) : null;
  const parTotal = par ? par.reduce((a, b) => a + b, 0) : null;

  const output = {
    tournament: tournamentTitle,
    category: category || "",
    course: "",
    year: 2025,
    par: par || [],
    ...(si && si.length > 0 ? { si } : {}),
    ...(yards && yards.length > 0 ? { yards } : {}),
    parF9,
    parB9,
    parTotal,
    players: players.sort((a, b) => {
      if (a.pos != null && b.pos != null) return a.pos - b.pos;
      if (a.total != null && b.total != null) return a.total - b.total;
      return 0;
    }),
  };

  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), "utf-8");

  const ok = players.filter((p) => p.rounds.length > 0).length;
  const errs = players.filter((p) => p._error).length;
  console.log(`   ✅ ${players.length} jogadores | ${ok} com scorecards | ${errs} erros`);
  if (par) console.log(`   Par: [${par.join(",")}] = ${parTotal}`);
  console.log(`   Ficheiro: ${outFile}`);
}

/* ─── Descobrir TODOS os escalões (contests) do evento ───
 * A partir de um contest semente, lê o seletor de flights/divisões da página
 * (links para /contest/<id>/) e devolve todos os escalões (Boys + Girls + todas
 * as idades). Assim não é preciso saber os números à mão. */
async function discoverContests(page, seedUrl) {
  const resp = await page.goto(seedUrl, { waitUntil: "domcontentloaded" });
  checkBlocked(resp, seedUrl);
  await waitForHuman(page);
  await page.waitForLoadState("networkidle").catch(() => {});
  const found = await page.evaluate(() => {
    const out = new Map();
    for (const a of document.querySelectorAll('a[href*="/contest/"]')) {
      const href = a.getAttribute("href") || "";
      if (/contestant|player|scorecard/i.test(href)) continue; // ignora links de jogador
      const m = href.match(/contest\/(\d+)/);
      if (!m) continue;
      const id = m[1];
      const name = a.textContent.replace(/\s+/g, " ").trim();
      if (!out.has(id) || (name && !out.get(id).name)) out.set(id, { id, name });
    }
    return Array.from(out.values());
  });
  const base = (seedUrl.match(/^(https?:\/\/.+\/event\/[^/]+)/) || [])[1];
  if (!base) return [];
  return found.map((c) => ({ ...c, url: `${base}/contest/${c.id}/leaderboard.htm` }));
}

/* ─── Main ─── */
const EVENT_SEED = CONTESTS[0].url;

(async () => {
  console.log(`🏌️  BlueGolf Multi-Contest Scraper — EO WAGR (auto-discovery)\n`);

  // Browser: FIREFOX por defeito — fingerprint diferente, pode contornar o
  // bloqueio do BlueGolf que apanha o Chromium. Para forçar Chrome:
  //   BROWSER=chrome node scripts/scrape-eowagr25-all.js
  const useChrome = /^(chrome|chromium)$/i.test(process.env.BROWSER || "");
  let browser, context;
  if (useChrome) {
    const launchArgs = { headless: false, args: ["--disable-blink-features=AutomationControlled"] };
    browser = await chromium.launch({ ...launchArgs, channel: "chrome" }).catch(() => chromium.launch(launchArgs));
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "pt-PT",
      viewport: { width: 1366, height: 900 },
    });
  } else {
    browser = await firefox.launch({ headless: false }).catch((e) => {
      console.error("\n❌ Firefox do Playwright não instalado. Corre primeiro:\n   npx playwright install firefox\n");
      throw e;
    });
    // Firefox: UA nativo (um UA de Chrome num motor Firefox seria suspeito).
    context = await browser.newContext({ locale: "pt-PT", viewport: { width: 1366, height: 900 } });
  }
  // Esconder navigator.webdriver (sinal típico de automação).
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  // 1) Descobrir todos os escalões do evento (a partir do contest semente).
  let contests = [];
  try {
    contests = await discoverContests(page, EVENT_SEED);
    console.log(`   🔎 ${contests.length} escalões descobertos no evento\n`);
  } catch (e) {
    console.warn(`   ⚠️  Discovery falhou (${e.message}) — uso a lista fixa\n`);
  }
  // Fallback à lista hardcoded se a descoberta não devolver nada.
  if (!contests.length) {
    contests = CONTESTS.map((c) => ({ id: (c.url.match(/contest\/(\d+)/) || [])[1], name: "", url: c.url }));
  }

  // 2) Scrape de cada escalão → eowagr25_contest<id>.json
  for (const c of contests) {
    const outFile = `eowagr25_contest${c.id}.json`;
    try {
      await scrapeContest(page, c.url, outFile, c.name);
    } catch (err) {
      console.error(`\n❌ Erro no contest ${c.url}:\n   ${err.message}`);
    }
  }

  await browser.close();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`🏁 Concluído — ${contests.length} escalões:`);
  for (const c of contests) {
    const outFile = `eowagr25_contest${c.id}.json`;
    console.log(`   ${fs.existsSync(outFile) ? "✅" : "❌"} ${outFile}${c.name ? `  (${c.name})` : ""}`);
  }
})();
