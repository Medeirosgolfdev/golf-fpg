const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  const url = "https://2025firstteemiamidoraljrclassic.golfgenius.com/leagues/486916/widgets/customized_tournament_results?division=Boys+8-9&page_id=5506943&shared=false";
  await page.goto(url, { waitUntil: "networkidle", timeout: 20000 }).catch(()=>{});
  await new Promise(r => setTimeout(r, 4000));
  const text = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log("BODY INNER TEXT:");
  console.log(text);
  console.log("\n--- HREFs no body ---");
  const hrefs = await page.$$eval('a', els => els.map(e => e.href).filter(h => h.includes("golfgenius") || h.includes("tournament")).slice(0, 10));
  console.log(hrefs);
  await browser.close();
})();
