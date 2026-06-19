const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: "Mozilla/5.0 Chrome/120.0.0.0" });
  const page = await context.newPage();
  await page.goto("https://2018doralpublix.golfgenius.com/leagues/108933/widgets/customized_tournament_results?page_id=1568091&shared=false", { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 1500));
  await page.goto("https://2018doralpublix.golfgenius.com/v2tournaments/1165258?called_from=widgets%2Fcustomized_tournament_results", { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 1500));

  for (const [label, id] of [["Boys7U_Trebor_OK", "405998941"], ["Boys89_Luke_FAIL", "405998972"]]) {
    const url = `https://2018doralpublix.golfgenius.com/tournaments2/details/${id}?round_index=&player_stats_for_portal=true`;
    const res = await context.request.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 Chrome/120.0.0.0", "Accept": "text/html,application/xhtml+xml", "Referer": "https://2018doralpublix.golfgenius.com/pages/1568091" }
    });
    const html = await res.text();
    // Extrair detail_tables
    const tableRe = /<table[^>]+class=["'][^"']*detail_table[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi;
    const tables = [];
    let m;
    while ((m = tableRe.exec(html)) !== null) tables.push(m[0]);
    console.log(`${label}: ${tables.length} detail_tables`);
    for (let i = 0; i < tables.length; i++) {
      const t = tables[i];
      // Contar <tr>
      const trs = (t.match(/<tr/g) || []).length;
      console.log(`  table[${i}]: ${trs} <tr>s, size=${t.length}`);
      // Procurar header_row e contar células
      const headerMatch = /<tr[^>]+class=["']header_row["'][^>]*>([\s\S]*?)<\/tr>/i.exec(t);
      console.log(`  header_row: ${!!headerMatch}`);
      if (headerMatch) {
        const headerTxt = headerMatch[1].replace(/<[^>]+>/g, "|").replace(/\s+/g, " ").trim().slice(0, 200);
        console.log(`  header text:`, headerTxt);
      }
    }
    // Salvar HTML completo
    const fname = `/tmp/${label}.html`;
    fs.writeFileSync(fname, html);
    console.log(`  saved to ${fname}`);
  }
  await browser.close();
})();
