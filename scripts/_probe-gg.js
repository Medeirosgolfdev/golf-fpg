const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1024 },
    locale: 'en-GB',
  });
  const page = await ctx.newPage();
  // Carris 2025 — sabemos que funciona (apanhou 172 jogadores)
  await page.goto('https://eg-carristrophy25.golfgenius.com/pages/5527846', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  // 1) Apanhar 1 playerId real do iframe
  const data = await page.evaluate(() => {
    const ifr = [...document.querySelectorAll('iframe')].find(f => /\/leagues\/\d+/.test(f.src || ""));
    const doc = ifr?.contentDocument;
    if (!doc) return { err: 'no iframe doc' };
    const links = [...doc.querySelectorAll('a[href*="tournaments2/details"]')];
    const ids = links.slice(0, 3).map(a => a.getAttribute('href').match(/details\/(\d+)/)?.[1]);
    // Apanhar 1 linha de tabela para ver TODAS as colunas
    const sampleRow = links[0]?.closest('tr');
    const rowHTML = sampleRow?.outerHTML || '';
    // Apanhar cabeçalho da tabela
    const tableHeaders = [...doc.querySelectorAll('th')].map(th => th.textContent.trim()).filter(t => t.length < 50);
    // Listar TODOS os links visíveis (navigation menu - identificar páginas auxiliares)
    const navLinks = [...doc.querySelectorAll('a')].map(a => ({
      text: a.textContent.trim().slice(0, 60),
      href: a.getAttribute('href')?.slice(0, 100) || ''
    })).filter(l => l.text && l.text.length > 2 && l.text.length < 60).slice(0, 50);
    return { ids, rowHTML, tableHeaders, navLinks };
  });
  console.log('---PLAYER IDS---');
  console.log(JSON.stringify(data.ids));
  console.log('---TABLE HEADERS---');
  console.log(JSON.stringify(data.tableHeaders, null, 2));
  console.log('---SAMPLE ROW HTML (first 3000 chars)---');
  console.log((data.rowHTML || '').slice(0, 3000));
  console.log('---NAV LINKS (50 first)---');
  console.log(JSON.stringify(data.navLinks, null, 2));

  await browser.close();
})();
