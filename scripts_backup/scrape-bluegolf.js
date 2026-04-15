/**
 * scrape-bluegolf.js
 *
 * Playwright script para descarregar leaderboard + scorecards do BlueGolf.
 * Abre browser VISÍVEL para permitir resolver CAPTCHA manualmente.
 *
 * USO:
 *   node scrape-bluegolf.js "https://brjgt.bluegolf.com/.../contest/73/leaderboard.htm" output.json
 */

const { chromium } = require("playwright");
const fs = require("fs");

const DELAY_MS = 600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─── Esperar CAPTCHA ─── */
async function waitForHuman(page) {
  const title = await page.title();
  if (!title.toLowerCase().includes("confirm") && !title.toLowerCase().includes("human")) return;
  console.log("\n⏳ CAPTCHA detectado! Resolve no browser...");
  await page.waitForFunction(
    () => !document.title.toLowerCase().includes("confirm") && !document.title.toLowerCase().includes("human"),
    { timeout: 300_000 }
  );
  console.log("✅ CAPTCHA resolvido!\n");
  await sleep(1500);
}

/* ─── Extrair scorecard (seletores reais BlueGolf) ─── */
async function extractScorecard(page) {
  return page.evaluate(() => {
    const result = { name: "", country: "", pos: null, result: "", total: null, par: [], si: [], rounds: [] };

    // ── Nome: <h3> dentro de .bg-profile-header contém <a> com nome
    const nameLink = document.querySelector(".bg-profile-header h3 a");
    if (nameLink) {
      // Tirar só o texto do nome (ignorar ícones e flags)
      const clone = nameLink.cloneNode(true);
      clone.querySelectorAll("i, img, span, svg").forEach(el => el.remove());
      result.name = clone.textContent.replace(/\s+/g, " ").trim();
    }

    // ── País: <p class="mb-0 text-muted"> dentro de .bg-profile-header
    const countryEl = document.querySelector(".bg-profile-header p.text-muted");
    if (countryEl) result.country = countryEl.textContent.trim();

    // ── Posição e resultado: tabela scorecard-profile
    const profileCells = document.querySelectorAll("table.scorecard-profile tr");
    for (const tr of profileCells) {
      const tds = tr.querySelectorAll("td");
      if (tds.length < 2) continue;
      const label = tds[0].textContent.trim().toLowerCase();
      const val = tds[1].textContent.trim();
      if (label.includes("posi")) result.pos = parseInt(val, 10) || null;
      if (label.includes("resultado")) result.result = val;
      if (label.includes("tacada") || label.includes("stroke")) result.total = parseInt(val, 10) || null;
    }

    // ── Usar tabela DESKTOP (tem 18 buracos numa row)
    //    Está dentro de .row.d-none.d-md-block
    const desktopBlock = document.querySelector(".row.d-none.d-md-block");
    if (desktopBlock) {
      const table = desktopBlock.querySelector("table.bg-tbl-scorecard");
      if (table) {
        // Par: extrair dos data-par nos hidden inputs
        const holeInputs = table.querySelectorAll('input[type="hidden"][data-par]');
        for (const inp of holeInputs) {
          result.par.push(parseInt(inp.getAttribute("data-par"), 10));
        }

        // SI: row com label "tee.handicap" ou "Hcp" (está hidden por defeito)
        for (const tr of table.querySelectorAll("tr")) {
          const firstTd = tr.querySelector("td");
          if (!firstTd) continue;
          const label = firstTd.textContent.trim().toLowerCase();
          if (label.includes("handicap") || label === "hcp") {
            for (const td of Array.from(tr.querySelectorAll("td")).slice(1)) {
              const n = parseInt(td.textContent.trim(), 10);
              if (!isNaN(n) && n >= 1 && n <= 18) result.si.push(n);
            }
            break;
          }
        }

        // Scores: <tr class="scores"> — uma por round
        for (const tr of table.querySelectorAll("tr.scores")) {
          const tds = Array.from(tr.querySelectorAll("td")).slice(1); // skip label
          const scores = [];
          for (const td of tds) {
            const n = parseInt(td.textContent.trim(), 10);
            // Scores de golf 1-15; subtotais (Out/In/Total) são > 18
            if (!isNaN(n) && n >= 1 && n <= 15) {
              scores.push(n);
            }
            // Também ignorar NaN (células "&nbsp;" etc)
          }
          if (scores.length >= 9) {
            result.rounds.push(scores);
          }
        }
      }
    }

    // ── Fallback mobile: tabelas separadas front/back
    if (result.rounds.length === 0) {
      const allTables = document.querySelectorAll("table.bg-tbl-scorecard");
      const mobileScores = [];

      for (const table of allTables) {
        for (const tr of table.querySelectorAll("tr")) {
          if (tr.classList.contains("bg-light")) continue;
          const firstTd = tr.querySelector("td");
          if (!firstTd) continue;
          const label = firstTd.textContent.trim().toLowerCase();
          if (label.includes("volta") || label.includes("rd ") || label.includes("round")) {
            const scores = [];
            for (const td of Array.from(tr.querySelectorAll("td")).slice(1)) {
              const n = parseInt(td.textContent.trim(), 10);
              if (!isNaN(n) && n >= 1 && n <= 15) scores.push(n);
            }
            if (scores.length >= 9) mobileScores.push(scores);
          }
        }
        // Par fallback
        if (result.par.length === 0) {
          for (const inp of table.querySelectorAll('input[type="hidden"][data-par]')) {
            result.par.push(parseInt(inp.getAttribute("data-par"), 10));
          }
        }
      }

      // Mobile: front+back separados → combinar pares
      if (mobileScores.length >= 2 && mobileScores[0].length === 9) {
        for (let i = 0; i + 1 < mobileScores.length; i += 2) {
          result.rounds.push([...mobileScores[i], ...mobileScores[i + 1]]);
        }
      } else {
        result.rounds = mobileScores;
      }
    }

    return result;
  });
}

/* ─── Main ─── */
(async () => {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Uso: node scrape-bluegolf.js <leaderboard_url> [output.json]");
    process.exit(1);
  }

  const leaderboardUrl = args[0];
  const outFile = args[1] || "bluegolf_scorecards.json";

  const contestMatch = leaderboardUrl.match(/^(https?:\/\/.+\/contest\/\d+)/);
  if (!contestMatch) {
    console.error("URL inválida. Esperado: https://.../contest/NN/leaderboard.htm");
    process.exit(1);
  }
  const contestBase = contestMatch[1];

  console.log(`🏌️  BlueGolf Scorecard Scraper`);
  console.log(`   URL: ${leaderboardUrl}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  /* ═══ PASSO 1 — Leaderboard ═══ */
  console.log("📋 A carregar leaderboard...");
  await page.goto(leaderboardUrl, { waitUntil: "domcontentloaded" });
  await waitForHuman(page);
  await page.waitForLoadState("networkidle");

  const pageTitle = await page.title();
  const tournamentTitle = pageTitle.replace(/ \| .*$/, "").replace(" Leaderboard", "").trim();
  console.log(`   Torneio: ${tournamentTitle}`);

  // Extrair contestant IDs
  const contestants = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="contestant"]');
    const seen = new Map();
    for (const link of links) {
      const match = (link.getAttribute("href") || "").match(/contestant\/(\d+)/);
      if (!match) continue;
      const id = match[1];
      if (seen.has(id)) continue;
      const tr = link.closest("tr");
      const cells = tr ? Array.from(tr.querySelectorAll("td")).map(c => c.textContent.trim()) : [];
      seen.set(id, { id, name: link.textContent.trim(), cells });
    }
    return Array.from(seen.values());
  });

  console.log(`   Jogadores: ${contestants.length}\n`);

  if (contestants.length === 0) {
    const html = await page.content();
    fs.writeFileSync("debug_leaderboard.html", html);
    console.error("❌ Nenhum contestant. HTML guardado em debug_leaderboard.html");
    await browser.close();
    process.exit(1);
  }

  /* ═══ PASSO 2 — Scorecards ═══ */
  const players = [];
  let par = null;
  let si = null;

  for (let i = 0; i < contestants.length; i++) {
    const c = contestants[i];
    const url = `${contestBase}/contestant/${c.id}/scorecard.htm`;

    process.stdout.write(`\r🔍 [${i + 1}/${contestants.length}] ${c.name.padEnd(35).slice(0, 35)}`);

    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await waitForHuman(page);
      // Esperar pela tabela de scorecard
      await page.waitForSelector("table.bg-tbl-scorecard, table.scorecard-profile", { timeout: 12_000 }).catch(() => {});

      const sc = await extractScorecard(page);

      if (!par && sc.par.length >= 9) par = sc.par.length > 18 ? sc.par.slice(0, 18) : sc.par;
      if (!si && sc.si.length >= 9) si = sc.si.length > 18 ? sc.si.slice(0, 18) : sc.si;

      const name = sc.name || c.name;
      const rounds = sc.rounds.map((scores, idx) => {
        const f9 = scores.slice(0, 9).reduce((a, b) => a + b, 0);
        const b9 = scores.length > 9 ? scores.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
        const gross = scores.reduce((a, b) => a + b, 0);
        return { day: idx + 1, scores, f9, ...(scores.length > 9 ? { b9 } : {}), gross };
      });

      const total = rounds.length > 0 ? rounds.reduce((a, r) => a + r.gross, 0) : sc.total;
      const parTotal = par ? par.reduce((a, b) => a + b, 0) : 0;
      const result = parTotal > 0 && rounds.length > 0 ? total - parTotal * rounds.length : null;

      players.push({ name, country: sc.country || "", pos: sc.pos, result, total, rounds });

      const nRounds = rounds.length;
      const nHoles = nRounds > 0 ? rounds[0].scores.length : 0;
      if (nRounds === 0) {
        process.stdout.write(" ⚠️ sem scores");
      } else {
        process.stdout.write(` ✅ ${nRounds}R ${nHoles}H gross=${total}`);
      }
    } catch (err) {
      process.stdout.write(` ❌ ${err.message.slice(0, 40)}`);
      players.push({ name: c.name, country: "", pos: null, result: null, total: null, rounds: [], _error: err.message });
    }

    await sleep(DELAY_MS);
  }

  console.log("\n");
  await browser.close();

  /* ═══ PASSO 3 — Output ═══ */
  const parF9 = par ? par.slice(0, 9).reduce((a, b) => a + b, 0) : null;
  const parB9 = par && par.length > 9 ? par.slice(9).reduce((a, b) => a + b, 0) : null;
  const pTotal = par ? par.reduce((a, b) => a + b, 0) : null;

  const output = {
    tournament: tournamentTitle,
    category: "",
    course: "",
    year: new Date().getFullYear(),
    par: par || [],
    ...(si && si.length > 0 ? { si } : {}),
    parF9, parB9, parTotal: pTotal,
    players: players.sort((a, b) => {
      if (a.pos && b.pos) return a.pos - b.pos;
      if (a.total && b.total) return a.total - b.total;
      return 0;
    }),
  };

  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), "utf-8");

  const ok = players.filter(p => p.rounds.length > 0).length;
  const errs = players.filter(p => p._error).length;

  console.log(`✅ Concluído!`);
  console.log(`   ${players.length} jogadores | ${ok} com scorecards | ${errs} erros`);
  if (par) console.log(`   Par: [${par.join(",")}] = ${pTotal}`);
  if (si && si.length > 0) console.log(`   SI:  [${si.join(",")}]`);
  console.log(`   Ficheiro: ${outFile}`);
})();
