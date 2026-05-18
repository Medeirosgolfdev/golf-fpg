/**
 * scripts/_diagnose-england-golf-fields.js
 *
 * Diagnóstico: capturar HTML real da Carris 2025 (England Golf) para descobrir
 * exactamente que campos existem (HCP, DOB, idade, distâncias por jogador, etc.)
 * que o scraper actual não está a apanhar.
 *
 * Resultado: imprime tudo o que encontra + grava /tmp/eng-diag-{leaderboard,detail,course}.html
 * para inspecção manual.
 *
 * USO:
 *   node scripts/_diagnose-england-golf-fields.js
 *
 * Em ~30 segundos imprime tudo o que precisamos para reescrever o scraper.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT_DIR = path.resolve(__dirname, "..", "diag-out");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = (n) => path.join(OUT_DIR, n);

// Replica do waitForIframeReady do scraper principal
async function waitForIframeReady(page, maxMs = 60000) {
  const start = Date.now();
  let lastDiag = null;
  while (Date.now() - start < maxMs) {
    const ready = await page.evaluate(() => {
      const iframes = [...document.querySelectorAll("iframe")];
      const ifr =
        iframes.find((f) => /\/leagues\/\d+|widgets\/tournament_results/i.test(f.src || "")) ||
        iframes.find((f) => /golfgenius/i.test(f.src || "") && !/\/campaigns\//.test(f.src || "")) ||
        iframes[0];
      const doc = ifr?.contentDocument;
      const sel = doc?.querySelector("select");
      const hasPlayers = doc?.querySelector('a[href*="tournaments2/details"]');
      const hasV2event = doc?.querySelector(".v2tournament-event");
      return {
        hasIframe: !!ifr,
        ifrSrc: ifr?.src?.slice(0, 80) || "",
        hasDoc: !!doc,
        selectOptions: sel ? sel.options.length : -1,
        hasPlayerLinks: !!hasPlayers,
        hasV2event: !!hasV2event,
      };
    });
    lastDiag = ready;
    if (ready.selectOptions > 0 || ready.hasPlayerLinks || ready.hasV2event) return ready;
    await sleep(800);
  }
  console.log(`   [waitForIframeReady timeout] ${JSON.stringify(lastDiag)}`);
  return null;
}

async function expandAllDivisions(page) {
  return page.evaluate(async () => {
    const ifr =
      [...document.querySelectorAll("iframe")].find((f) => /\/leagues\/\d+/i.test(f.src || "")) ||
      [...document.querySelectorAll("iframe")][0];
    const doc = ifr?.contentDocument;
    if (!doc) return 0;
    const links = [...doc.querySelectorAll("a.expand-tournament")];
    for (const link of links) {
      try { link.click(); } catch {}
    }
    await new Promise((r) => setTimeout(r, 3000));
    return links.length;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1024 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    locale: "en-GB",
    timezoneId: "Europe/London",
  });
  const page = await ctx.newPage();

  // Carris 2025 — torneio que sabemos que funciona
  const ggPage = "5527846";
  const ggBase = "https://eg-carristrophy25.golfgenius.com";
  console.log(`\n=== A abrir ${ggBase}/pages/${ggPage} ===`);
  await page.goto(`${ggBase}/pages/${ggPage}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  // Polling até iframe estar pronto (max 45s)
  await waitForIframeReady(page, 45000);
  // Expandir divisões (algumas torneios precisam disto para carregar jogadores)
  const expanded = await expandAllDivisions(page);
  console.log(`   expandAllDivisions: ${expanded} links clicados`);
  await sleep(2000);

  // 1) Capturar HTML do leaderboard (iframe interno)
  const lbInfo = await page.evaluate(() => {
    const ifr = [...document.querySelectorAll("iframe")].find((f) => /\/leagues\/\d+/.test(f.src || ""));
    if (!ifr) return { err: "no league iframe" };
    const doc = ifr.contentDocument;
    if (!doc) return { err: "iframe no doc" };

    // Cabeçalhos da tabela
    const headers = [...doc.querySelectorAll("thead th, table tr:first-child th")].map((th) =>
      th.textContent.replace(/\s+/g, " ").trim()
    );

    // Sample de 1 linha completa para ver estrutura de células
    const firstLink = doc.querySelector('a[href*="tournaments2/details"]');
    const sampleRow = firstLink?.closest("tr");
    const cells = sampleRow ? [...sampleRow.querySelectorAll("td, th")].map((c) => c.textContent.replace(/\s+/g, " ").trim()) : [];
    const cellsHtml = sampleRow ? [...sampleRow.querySelectorAll("td, th")].map((c) => c.outerHTML.slice(0, 300)) : [];

    // IDs disponíveis (primeiros 3 para testar)
    const ids = [...doc.querySelectorAll('a[href*="tournaments2/details"]')]
      .slice(0, 3)
      .map((a) => a.getAttribute("href").match(/details\/(\d+)/)?.[1])
      .filter(Boolean);

    return {
      iframeSrc: ifr.src,
      headers,
      sampleCells: cells,
      sampleCellsHtml: cellsHtml,
      ids,
      tableCount: doc.querySelectorAll("table").length,
      playerLinks: doc.querySelectorAll('a[href*="tournaments2/details"]').length,
      // Outras keywords úteis no DOM
      hasHandicap: /handicap|hcp/i.test(doc.body.innerHTML),
      hasAge: /\b(age|dob|birth|date of birth)\b/i.test(doc.body.innerHTML),
      hasYards: /\b(yard|yds|distance)\b/i.test(doc.body.innerHTML),
    };
  });

  console.log("\n=== LEADERBOARD ===");
  console.log("Player links:", lbInfo.playerLinks, "tables:", lbInfo.tableCount);
  console.log("Headers da tabela:", JSON.stringify(lbInfo.headers, null, 2));
  console.log("Sample row cells (texto):");
  lbInfo.sampleCells?.forEach((c, i) => console.log(`  col${i}: ${JSON.stringify(c).slice(0, 100)}`));
  console.log("Sample row cells (HTML, primeiros 300 chars):");
  lbInfo.sampleCellsHtml?.forEach((h, i) => console.log(`  col${i}: ${h}`));
  console.log("Keywords HTML body:", {
    handicap: lbInfo.hasHandicap,
    age: lbInfo.hasAge,
    yards: lbInfo.hasYards,
  });
  console.log("IDs amostra:", lbInfo.ids);

  // Gravar HTML do iframe completo para análise offline
  const iframeHTML = await page.evaluate(() => {
    const ifr = [...document.querySelectorAll("iframe")].find((f) => /\/leagues\/\d+/.test(f.src || ""));
    return ifr?.contentDocument?.documentElement?.outerHTML || "(no iframe)";
  });
  fs.writeFileSync(outFile("eng-diag-leaderboard.html"), iframeHTML, "utf8");
  console.log(`\nLeaderboard HTML gravado em ${outFile("eng-diag-leaderboard.html")} (${iframeHTML.length} bytes)`);

  // 2) Detail/scorecard page de UM jogador (server-side fetch para evitar CORS)
  if (lbInfo.ids?.length) {
    const pid = lbInfo.ids[0];
    const detailUrl = `https://www.golfgenius.com/tournaments2/details/${pid}?round_index=&player_stats_for_portal=true`;
    console.log(`\n=== DETAIL PAGE de jogador ${pid} ===`);
    console.log(`URL: ${detailUrl}`);
    const respDetail = await ctx.request.get(detailUrl);
    const detailHTML = await respDetail.text();
    fs.writeFileSync(outFile("eng-diag-detail.html"), detailHTML, "utf8");
    console.log(`Detail HTML gravado em ${outFile("eng-diag-detail.html")} (${detailHTML.length} bytes)`);

    // Procurar keywords úteis no detail
    const findings = {};
    const patterns = {
      handicap: /(handicap|hcp)[:<\s]*([+-]?\d+\.?\d*)/gi,
      age: /\b(age)[:<\s]*(\d+)/gi,
      dob: /(date\s+of\s+birth|dob|born|birthdate)[:<\s]*([^<]{1,30})/gi,
      yards: /(yard|yds|distance)[:<\s]*(\d+)/gi,
      meters: /(meter|metr|metres)[:<\s]*(\d+)/gi,
      tee: /(tee|marqueur)[:<\s]*([A-Z][A-Za-z]{2,20})/gi,
      country: /(country|nationality|nation)[:<\s]*([A-Z][A-Za-z]{2,30})/gi,
      gender: /(gender|sex)[:<\s]*(M|F|Male|Female)/gi,
    };
    for (const [key, pat] of Object.entries(patterns)) {
      const matches = [...detailHTML.matchAll(pat)].slice(0, 5);
      findings[key] = matches.map((m) => m[0].replace(/<[^>]+>/g, "").slice(0, 80));
    }
    console.log("\n=== Findings no detail page ===");
    console.log(JSON.stringify(findings, null, 2));
  }

  // 3) Tentar /player_profiles/{id} ou /players/{id} (URLs alternativos, server-side)
  if (lbInfo.ids?.length) {
    const pid = lbInfo.ids[0];
    // Também testar com memberId capturado (data-member-id="37343006" na coluna favorite)
    const memberId = lbInfo.memberId || "37343006";
    const eventId = lbInfo.eventId || "3854563";
    const variants = [
      `https://www.golfgenius.com/players/${pid}`,
      `https://www.golfgenius.com/player_profiles/${pid}`,
      `https://www.golfgenius.com/tournaments2/players/${pid}`,
      `https://www.golfgenius.com/tournaments2/details/${pid}?show_profile=true`,
      `https://www.golfgenius.com/players/${memberId}`,
      `https://www.golfgenius.com/members/${memberId}`,
      `https://www.golfgenius.com/member_profiles/${memberId}`,
      `https://www.golfgenius.com/profile/${memberId}`,
      `https://www.golfgenius.com/events/${eventId}/players/${memberId}`,
    ];
    console.log("\n=== A testar URLs alternativos para player profile (memberId=" + memberId + ") ===");
    for (const url of variants) {
      try {
        const r = await ctx.request.get(url);
        const len = (await r.text()).length;
        console.log(`  ${url.replace("https://www.golfgenius.com", "")} → HTTP ${r.status()}, ${len} bytes`);
      } catch (e) {
        console.log(`  ${url.replace("https://www.golfgenius.com", "")} → erro: ${e.message.slice(0, 60)}`);
      }
    }
  }

  // 4) Listar TODOS os widgets da league disponíveis (server-side fetch)
  console.log("\n=== A testar widgets adicionais da league ===");
  const leagueId = (await page.evaluate(() => {
    const ifr = [...document.querySelectorAll("iframe")].find((f) => /\/leagues\/(\d+)/.test(f.src || ""));
    return ifr?.src?.match(/leagues\/(\d+)/)?.[1];
  })) || "445532";
  const widgets = [
    "tournament_results", "scoreboard", "pairings", "tee_times", "tee_sheet",
    "course_analytics", "player_stats", "leaderboard", "divisions", "handicaps",
    "tournament_directory", "match_play_brackets", "skins", "stableford",
    "registrations", "registration_list", "rosters", "teams",
    "members", "member_list", "directory", "field", "field_list",
  ];
  for (const w of widgets) {
    try {
      const r = await ctx.request.get(`https://www.golfgenius.com/leagues/${leagueId}/widgets/${w}?shared=false`);
      const len = (await r.text()).length;
      console.log(`  ${w.padEnd(30)} → HTTP ${r.status()}, ${len} bytes`);
    } catch (e) {
      console.log(`  ${w.padEnd(30)} → erro: ${e.message.slice(0, 50)}`);
    }
  }

  await browser.close();
  console.log("\n=== FIM ===");
  console.log(`HTML files em ${OUT_DIR}\\`);
  console.log("  eng-diag-leaderboard.html");
  console.log("  eng-diag-detail.html");
})();
