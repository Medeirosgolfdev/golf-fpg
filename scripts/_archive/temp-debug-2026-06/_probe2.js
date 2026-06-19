const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 Chrome/120.0.0.0" });
  const page = await ctx.newPage();
  const url = "https://2018doralpublix.golfgenius.com/v2tournaments/1368578?called_from=widgets%2Fcustomized_tournament_results&hide_totals=false&player_stats_for_portal=true";
  console.log("Visitar:", url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
  // Capturar estados em diferentes momentos
  for (const [label, ms] of [["t=1500", 1500], ["t=3000", 3000], ["t=5000", 5000]]) {
    await new Promise(r => setTimeout(r, ms - (label === "t=1500" ? 0 : (label === "t=3000" ? 1500 : 2000))));
    const txt = await page.evaluate(() => {
      const h = document.querySelector("h1, h2, h3, .division-title, .tournament-name");
      const headerTxt = h ? h.innerText.replace(/\s+/g, " ").trim().slice(0, 60) : "n/a";
      const players = Array.from(document.querySelectorAll('a[href*="tournaments2/details"]')).map(a => a.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
      return { header: headerTxt, count: players.length, first3: players.slice(0, 3), last: players[players.length-1] || "" };
    });
    console.log(label, JSON.stringify(txt));
  }
  await browser.close();
})();
