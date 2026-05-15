const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 Chrome/120.0.0.0" });
  const page = await ctx.newPage();
  // Boys 8-9 — tentar URL v2 directa
  const url = "https://2025firstteemiamidoraljrclassic.golfgenius.com/v2tournaments/4222404?called_from=widgets%2Fcustomized_tournament_results&hide_totals=false&player_stats_for_portal=true";
  await page.goto(url, { waitUntil: "networkidle", timeout: 20000 }).catch(()=>{});
  await new Promise(r => setTimeout(r, 3000));
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log("BODY TEXT (3000 chars):");
  console.log(txt);
  console.log("\n--- HREFs ---");
  const hrefs = await page.$$eval('a', els => els.map(e => e.href).filter(h => h.includes("player") || h.includes("score") || h.includes("v2tournament")).slice(0, 15));
  console.log(hrefs);
  await browser.close();
})();
