const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: "Mozilla/5.0 Chrome/120.0.0.0" });
  const page = await context.newPage();

  // Primeiro visitar o widget para apanhar cookies
  await page.goto("https://2018doralpublix.golfgenius.com/leagues/108933/widgets/customized_tournament_results?page_id=1568091&shared=false", { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 1500));
  // E visitar UM v2tournament para apanhar mais cookies (como faz o scraper)
  await page.goto("https://2018doralpublix.golfgenius.com/v2tournaments/1165258?called_from=widgets%2Fcustomized_tournament_results", { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 1500));

  for (const [label, id] of [["Boys 7&U Trebor", "405998941"], ["Boys 8-9 Luke", "405998972"], ["Girls 7&U Alexandra", "405998943"]]) {
    const url = `https://2018doralpublix.golfgenius.com/tournaments2/details/${id}?round_index=&player_stats_for_portal=true`;
    const res = await context.request.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 Chrome/120.0.0.0",
        "Accept": "text/html,application/xhtml+xml",
        "Referer": "https://2018doralpublix.golfgenius.com/pages/1568091",
      }
    });
    const html = await res.text();
    const status = res.status();
    const detail = (html.match(/class=["'][^"']*detail_table/g) || []).length;
    const hasName = html.includes(label.split(" ").slice(-1)[0]);
    console.log(`${label} ${id}: status=${status} size=${html.length} detail_tables=${detail} hasName=${hasName}`);
    // Mostrar fragmento se < 2000 chars
    if (html.length < 5000) {
      console.log("HTML small:", html.slice(0, 500));
    }
  }
  await browser.close();
})();
