const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  const tests = [
    // 2025 com leagueId CORRETO
    "https://2025firstteemiamidoraljrclassic.golfgenius.com/leagues/486916/widgets/customized_tournament_results?division=Boys+8-9&page_id=5506943&shared=false",
    // 2025 via www
    "https://www.golfgenius.com/leagues/486916/widgets/customized_tournament_results?division=Boys+8-9&page_id=5506943&shared=false",
    // 2023 subdomínio
    "https://tftm-2023firstteemiamidoraljrclassic.golfgenius.com/leagues/365219/widgets/customized_tournament_results?division=Boys+8-9&page_id=4282619&shared=false",
    // 2023 — divisão sem espaço (talvez seja "Boys%208-9"?)
    "https://tftm-2023firstteemiamidoraljrclassic.golfgenius.com/leagues/365219/widgets/customized_tournament_results?division=Boys%208-9&page_id=4282619&shared=false",
  ];
  for (const u of tests) {
    try {
      await page.goto(u, { waitUntil: "domcontentloaded", timeout: 12000 });
      const found = await page.waitForSelector('a[href*="tournaments2/details"]', { timeout: 7000 }).catch(() => null);
      const count = await page.evaluate(() => document.querySelectorAll('a[href*="tournaments2/details"]').length);
      const host = new URL(u).host.slice(0, 45);
      console.log(host, "div=", decodeURIComponent(u.split("division=")[1].split("&")[0]), "found:", !!found, "count:", count);
    } catch (e) { console.log("ERR", u.slice(0, 50), e.message.slice(0, 60)); }
  }
  await browser.close();
})();
