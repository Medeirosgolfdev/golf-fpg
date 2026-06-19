const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  // Testar os 2 jogadores (Boys 7&U funciona, Boys 8-9 não)
  for (const [name, id] of [["Trebor 7&U OK", "405998941"], ["Luke 8-9 FAIL", "405998972"]]) {
    const url = `https://2018doralpublix.golfgenius.com/tournaments2/details/${id}?round_index=&player_stats_for_portal=true`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await new Promise(r => setTimeout(r, 2500));
    const html = await page.content();
    const detailTables = (html.match(/class=["'][^"']*detail_table/g) || []).length;
    console.log(name, "html size:", html.length, "detail_tables:", detailTables);
    if (detailTables === 0) {
      // What tables ARE there?
      const tableClasses = await page.$$eval('table[class]', els => els.map(e => e.className).slice(0,5));
      console.log("  tables:", tableClasses);
      // Look for scores in body text
      const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g," ").slice(0, 500));
      console.log("  body:", txt);
    }
  }
  await browser.close();
})();
