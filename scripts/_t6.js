const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 Chrome/120.0.0.0" });
  const page = await ctx.newPage();
  
  // Para cada edição, visitar widget URL e extrair lista de divisões (links v2tournaments)
  const editions = [
    { year: 2025, league: "486916", pageId: "5506943", host: "2025firstteemiamidoraljrclassic.golfgenius.com" },
    { year: 2023, league: "365219", pageId: "4282619", host: "tftm-2023firstteemiamidoraljrclassic.golfgenius.com" },
    { year: 2021, league: "253290", pageId: "3122115", host: "2021firstteemiamidoral.golfgenius.com" },
    { year: 2019, league: "152395", pageId: "2050901", host: "2019doralpublix.golfgenius.com" },
    { year: 2018, league: "108933", pageId: "1568091", host: "2018doralpublix.golfgenius.com" },
  ];
  for (const e of editions) {
    const url = `https://${e.host}/leagues/${e.league}/widgets/customized_tournament_results?page_id=${e.pageId}&shared=false`;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 18000 });
      await new Promise(r => setTimeout(r, 2500));
      // 1) Tentar formato novo: links v2tournaments
      const v2 = await page.$$eval('a[href*="/v2tournaments/"]', els => els.map(a => ({ href: a.getAttribute("href"), text: a.textContent.replace(/\s+/g, " ").trim() })));
      // 2) Tentar formato antigo: links tournaments2/details
      const v1 = await page.$$eval('a[href*="tournaments2/details"]', els => els.length);
      console.log(`${e.year}: v2links=${v2.length} v1links=${v1}`);
      if (v2.length > 0) console.log("  exemplo v2:", v2[0]);
    } catch (err) { console.log(`${e.year}: ERR ${err.message.slice(0, 60)}`); }
  }
  await browser.close();
})();
