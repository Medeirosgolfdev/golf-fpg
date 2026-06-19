const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  
  // Capture todas as XHRs
  page.on("response", async r => {
    const u = r.url();
    if (u.includes("tournament") || u.includes("widget") || u.includes("/leagues/")) {
      console.log("XHR:", r.status(), u.slice(0, 120));
    }
  });
  
  const url = "https://2025firstteemiamidoraljrclassic.golfgenius.com/leagues/486916/widgets/customized_tournament_results?division=Boys+8-9&page_id=5506943&shared=false";
  console.log("Going to:", url.slice(0, 80));
  await page.goto(url, { waitUntil: "networkidle", timeout: 20000 }).catch(e => console.log("goto err:", e.message.slice(0, 50)));
  await new Promise(r => setTimeout(r, 3000));
  
  const html = await page.content();
  console.log("HTML length:", html.length);
  console.log("HTML head 200:", html.slice(0, 200));
  // Procurar pistas
  const hasTournDetails = html.includes("tournaments2/details");
  console.log("contém 'tournaments2/details':", hasTournDetails);
  const hasJqueryAjax = html.match(/(?:csrf|authenticity)_token[^"]*"([^"]+)"/);
  console.log("csrf token:", hasJqueryAjax?.[1]?.slice(0, 30));
  
  await browser.close();
})();
