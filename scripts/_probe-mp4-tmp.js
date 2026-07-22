const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" });
  const page = await ctx.newPage();
  await page.goto("https://www.golfgenius.com/pages/12891806910545703850", { waitUntil: "domcontentloaded", timeout: 60000 });
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    if (await page.evaluate(() => {
      const ifr = [...document.querySelectorAll("iframe")].find(f => /golfgenius/i.test(f.src||"")) || document.querySelectorAll("iframe")[0];
      return !!(ifr?.contentDocument?.querySelector("select"));
    })) break;
  }
  // forçar bracket: mudar para 1/16e
  await page.evaluate(() => {
    const ifr = [...document.querySelectorAll("iframe")].find(f => /golfgenius/i.test(f.src||"")) || document.querySelectorAll("iframe")[0];
    const sel = ifr.contentDocument.querySelector("select");
    const opt = [...sel.options].find(o => /1\/16e/.test(o.textContent));
    sel.value = opt.value; sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(6000);
  const ids = await page.evaluate(() => {
    const ifr = [...document.querySelectorAll("iframe")].find(f => /golfgenius/i.test(f.src||"")) || document.querySelectorAll("iframe")[0];
    const a = [...ifr.contentDocument.querySelectorAll("a.aggregate_bracket_match")].find(x => /DESRAYAUD/.test(x.textContent));
    if (!a) return null;
    const href = a.getAttribute("href");
    return { aggId: (href.match(/details\/(\d+)/)||[])[1], oppId: (href.match(/aggregate2_id=(\d+)/)||[])[1] };
  });
  console.log("ids:", JSON.stringify(ids));
  const html = await page.evaluate(async ({aggId, oppId}) => {
    const r = await fetch(`/tournaments2/details/${aggId}?aggregate2_id=${oppId}&is_bracket=true`, { headers: { "X-Requested-With": "XMLHttpRequest" } });
    return await r.text();
  }, ids);
  fs.writeFileSync(process.env.TEMP + "/mp-desrayaud.html", html);
  // linhas de estado + classes dos botões por buraco
  const rows = [...html.matchAll(/<tr class='(status_header_first|status_header|team\d)'[^>]*>([\s\S]*?)<\/tr>/g)];
  for (const r of rows) {
    const cells = [...r[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => c[1].replace(/<[^>]+>/g, "␀").replace(/\s+/g, " ").trim());
    console.log("--", r[1], "→", cells.slice(0, 20).join(" | ").slice(0, 400));
  }
  const btns = [...html.matchAll(/class='hole_result_(\w+)/g)].map(m=>m[1]);
  console.log("button suffixes:", JSON.stringify([...new Set(btns)]), "total:", btns.length);
  const seq = [...html.matchAll(/<td class='hole_dropdown[^>]*data-hole-nr='(\d+)'[^>]*>\s*<button class='hole_result_(\w+?)[ ']/g)].map(m=>m[1]+":"+m[2]);
  console.log("seq por buraco:", seq.join(" "));
  await browser.close();
})();
