const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  // 1) Ir primeiro à página de RESULTS (para setar cookies/referer)
  console.log("Visitar página RESULTS de 2025...");
  await page.goto("https://2025firstteemiamidoraljrclassic.golfgenius.com/pages/5506943", { waitUntil: "domcontentloaded", timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  // 2) Ver iframe
  const iframes = await page.$$eval('iframe', els => els.map(e => e.src));
  console.log("iframes na pagina RESULTS:", iframes);
  // 3) Procurar elementos com link de detalhes (na pagina principal)
  let count = await page.evaluate(() => document.querySelectorAll('a[href*="tournaments2/details"]').length);
  console.log("links de detalhe na pagina principal:", count);
  // 4) Entrar no iframe se houver
  for (const iframe of page.frames()) {
    const url = iframe.url();
    if (url.includes("widgets") || url.includes("leagues")) {
      console.log("Frame url:", url);
      const c = await iframe.locator('a[href*="tournaments2/details"]').count().catch(() => 0);
      console.log("links de detalhe no frame:", c);
    }
  }
  await browser.close();
})();
