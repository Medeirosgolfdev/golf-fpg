/**
 * scrape-eowagr25.js
 *
 * Playwright script para descarregar leaderboard + scorecards do
 * European Open WAGR 2025 (BlueGolf — subdomain bluegolfw).
 *
 * USO:
 *   node scrape-eowagr25.js
 *   node scrape-eowagr25.js [output.json]
 *
 * Output por defeito: eowagr25_scorecards.json
 */

const { chromium } = require("playwright");
const fs = require("fs");

/* ─── Config ─── */
const LEADERBOARD_URL =
  "https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/21/leaderboard.htm";
const DEFAULT_OUT = "eowagr25_scorecards.json";
const DELAY_MS = 700;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─── Esperar CAPTCHA ─── */
async function waitForHuman(page) {
  const title = await page.title();
  if (
    !title.toLowerCase().includes("confirm") &&
    !title.toLowerCase().includes("human")
  )
    return;
  console.log("\n⏳ CAPTCHA detectado! Resolve no browser...");
  await page.waitForFunction(
    () =>
      !document.title.toLowerCase().includes("confirm") &&
      !document.title.toLowerCase().includes("human"),
    { timeout: 300_000 }
  );
  console.log("✅ CAPTCHA resolvido!\n");
  await sleep(1500);
}

/* ─── Extrair scorecard ─────────────────────────────────────────────────────
   Compatível com bluegolf E bluegolfw — tenta seletores de ambos os layouts.
   ─────────────────────────────────────────────────────────────────────────── */
async function extractScorecard(page) {
  return page.evaluate(() => {
    const result = {
      name: "",
      country: "",
      pos: null,
      result: "",
      total: null,
      par: [],
      si: [],
      rounds: [],
    };

    /* ── Nome ──
       bluegolf:   .bg-profile-header h3 a
       bluegolfw:  .player-info h3, h2.player-name, ou similar               */
    const nameSelectors = [
      ".bg-profile-header h3 a",
      ".bg-profile-header h2 a",
      ".player-name a",
      ".player-name",
      "h3.contestant-name",
      ".contestant-name",
    ];
    for (const sel of nameSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const clone = el.cloneNode(true);
        clone.querySelectorAll("i, img, span.flag-icon, svg").forEach((x) => x.remove());
        const txt = clone.textContent.replace(/\s+/g, " ").trim();
        if (txt.length > 1) { result.name = txt; break; }
      }
    }

    /* ── País ── */
    const countrySelectors = [
      ".bg-profile-header p.text-muted",
      ".bg-profile-header .text-muted",
      ".player-country",
      ".contestant-country",
    ];
    for (const sel of countrySelectors) {
      const el = document.querySelector(sel);
      if (el) { result.country = el.textContent.trim(); break; }
    }

    /* ── Posição / resultado / total
       Tabela scorecard-profile (presente em ambas as versões)               */
    const profileRows = document.querySelectorAll(
      "table.scorecard-profile tr, table.player-profile tr"
    );
    for (const tr of profileRows) {
      const tds = tr.querySelectorAll("td");
      if (tds.length < 2) continue;
      const label = tds[0].textContent.trim().toLowerCase();
      const val = tds[1].textContent.trim();
      if (label.includes("posi")) result.pos = parseInt(val, 10) || null;
      if (label.includes("resultado") || label.includes("result"))
        result.result = val;
      if (label.includes("tacada") || label.includes("stroke") || label.includes("total"))
        result.total = parseInt(val, 10) || null;
    }

    /* ── Função auxiliar: extrair par e scores de uma tabela ── */
    function parseTable(table) {
      const localPar = [];
      const localSi = [];
      const localRounds = [];

      // Par via data-par nos hidden inputs
      for (const inp of table.querySelectorAll('input[type="hidden"][data-par]')) {
        localPar.push(parseInt(inp.getAttribute("data-par"), 10));
      }
      // Par alternativo: row com label "Par"
      if (localPar.length === 0) {
        for (const tr of table.querySelectorAll("tr")) {
          const firstTd = tr.querySelector("td, th");
          if (!firstTd) continue;
          if (firstTd.textContent.trim().toLowerCase() === "par") {
            for (const td of Array.from(tr.querySelectorAll("td, th")).slice(1)) {
              const n = parseInt(td.textContent.trim(), 10);
              if (!isNaN(n) && n >= 3 && n <= 5) localPar.push(n);
            }
            break;
          }
        }
      }

      // SI: row "Hcp" ou "handicap"
      for (const tr of table.querySelectorAll("tr")) {
        const firstTd = tr.querySelector("td, th");
        if (!firstTd) continue;
        const label = firstTd.textContent.trim().toLowerCase();
        if (label === "hcp" || label.includes("handicap")) {
          for (const td of Array.from(tr.querySelectorAll("td, th")).slice(1)) {
            const n = parseInt(td.textContent.trim(), 10);
            if (!isNaN(n) && n >= 1 && n <= 18) localSi.push(n);
          }
          break;
        }
      }

      // Scores: tr.scores ou rows com label "Volta N" / "Rd N" / "Round N"
      const scoreRows = table.querySelectorAll("tr.scores");
      if (scoreRows.length > 0) {
        for (const tr of scoreRows) {
          const scores = [];
          for (const td of Array.from(tr.querySelectorAll("td")).slice(1)) {
            const n = parseInt(td.textContent.trim(), 10);
            if (!isNaN(n) && n >= 1 && n <= 15) scores.push(n);
          }
          if (scores.length >= 9) localRounds.push(scores);
        }
      } else {
        // Fallback: rows com label de ronda
        for (const tr of table.querySelectorAll("tr")) {
          const firstTd = tr.querySelector("td");
          if (!firstTd) continue;
          const label = firstTd.textContent.trim().toLowerCase();
          if (
            label.match(/^(volta|rd|round)\s*\d/) ||
            label.match(/^r\s*\d$/)
          ) {
            const scores = [];
            for (const td of Array.from(tr.querySelectorAll("td")).slice(1)) {
              const n = parseInt(td.textContent.trim(), 10);
              if (!isNaN(n) && n >= 1 && n <= 15) scores.push(n);
            }
            if (scores.length >= 9) localRounds.push(scores);
          }
        }
      }

      return { par: localPar, si: localSi, rounds: localRounds };
    }

    /* ── Tentar bloco desktop primeiro ── */
    const desktopBlock =
      document.querySelector(".row.d-none.d-md-block") ||
      document.querySelector(".d-none.d-md-flex") ||
      document.querySelector(".desktop-scorecard");

    if (desktopBlock) {
      const table = desktopBlock.querySelector("table.bg-tbl-scorecard, table.scorecard-table, table");
      if (table) {
        const parsed = parseTable(table);
        if (parsed.par.length > 0) result.par = parsed.par.slice(0, 18);
        if (parsed.si.length > 0) result.si = parsed.si.slice(0, 18);
        if (parsed.rounds.length > 0) result.rounds = parsed.rounds;
      }
    }

    /* ── Fallback: todas as tabelas de scorecard ── */
    if (result.rounds.length === 0) {
      const allTables = document.querySelectorAll(
        "table.bg-tbl-scorecard, table.scorecard-table"
      );
      const mobileRounds = [];

      for (const table of allTables) {
        const parsed = parseTable(table);
        if (result.par.length === 0 && parsed.par.length > 0)
          result.par = parsed.par.slice(0, 18);
        if (result.si.length === 0 && parsed.si.length > 0)
          result.si = parsed.si.slice(0, 18);
        mobileRounds.push(...parsed.rounds);
      }

      // Mobile: front 9 + back 9 alternados → juntar pares
      if (
        mobileRounds.length >= 2 &&
        mobileRounds[0].length === 9
      ) {
        for (let i = 0; i + 1 < mobileRounds.length; i += 2) {
          result.rounds.push([...mobileRounds[i], ...mobileRounds[i + 1]]);
        }
      } else if (mobileRounds.length > 0) {
        result.rounds = mobileRounds;
      }
    }

    return result;
  });
}

/* ─── Main ─── */
(async () => {
  const args = process.argv.slice(2);
  const outFile = args[0] || DEFAULT_OUT;

  const leaderboardUrl = LEADERBOARD_URL;
  const contestMatch = leaderboardUrl.match(/^(https?:\/\/.+\/contest\/\d+)/);
  if (!contestMatch) {
    console.error("❌ URL inválida — não encontrou /contest/NN");
    process.exit(1);
  }
  const contestBase = contestMatch[1];

  console.log(`🏌️  BlueGolf Scorecard Scraper — EO WAGR 2025`);
  console.log(`   URL: ${leaderboardUrl}`);
  console.log(`   Output: ${outFile}\n`);

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
  const tournamentTitle = pageTitle
    .replace(/ \| .*$/, "")
    .replace(" Leaderboard", "")
    .trim();
  console.log(`   Torneio: ${tournamentTitle}`);

  /* Extrair contestant IDs — tenta seletores de ambos os layouts */
  const contestants = await page.evaluate(() => {
    const links = document.querySelectorAll(
      'a[href*="contestant"], a[href*="player"]'
    );
    const seen = new Map();
    for (const link of links) {
      const href = link.getAttribute("href") || "";
      const match = href.match(/contestant\/(\d+)/);
      if (!match) continue;
      const id = match[1];
      if (seen.has(id)) continue;
      const tr = link.closest("tr");
      const cells = tr
        ? Array.from(tr.querySelectorAll("td")).map((c) => c.textContent.trim())
        : [];
      // Nome: tirar texto limpo do link
      const clone = link.cloneNode(true);
      clone.querySelectorAll("i, img, span.flag-icon, svg").forEach((el) => el.remove());
      const name = clone.textContent.replace(/\s+/g, " ").trim();
      seen.set(id, { id, name, cells });
    }
    return Array.from(seen.values());
  });

  console.log(`   Jogadores encontrados: ${contestants.length}\n`);

  if (contestants.length === 0) {
    const html = await page.content();
    fs.writeFileSync("debug_leaderboard_eowagr.html", html);
    console.error(
      "❌ Nenhum contestant. HTML guardado em debug_leaderboard_eowagr.html"
    );
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

    process.stdout.write(
      `\r🔍 [${String(i + 1).padStart(2)}/${contestants.length}] ${c.name
        .padEnd(35)
        .slice(0, 35)}`
    );

    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await waitForHuman(page);
      await page
        .waitForSelector(
          "table.bg-tbl-scorecard, table.scorecard-table, table.scorecard-profile",
          { timeout: 12_000 }
        )
        .catch(() => {});

      const sc = await extractScorecard(page);

      // Guardar par e SI do primeiro jogador com dados completos
      if (!par && sc.par.length >= 9) par = sc.par.slice(0, 18);
      if (!si && sc.si.length >= 9) si = sc.si.slice(0, 18);

      const name = sc.name && sc.name.length > 1 ? sc.name : c.name;

      const rounds = sc.rounds.map((scores, idx) => {
        const f9 = scores.slice(0, 9).reduce((a, b) => a + b, 0);
        const b9 =
          scores.length > 9
            ? scores.slice(9, 18).reduce((a, b) => a + b, 0)
            : 0;
        const gross = scores.reduce((a, b) => a + b, 0);
        return {
          day: idx + 1,
          scores,
          f9,
          ...(scores.length > 9 ? { b9 } : {}),
          gross,
        };
      });

      const total =
        rounds.length > 0
          ? rounds.reduce((a, r) => a + r.gross, 0)
          : sc.total;

      // result = total - (par × nRondas)  [positivo = acima do par]
      const parTotal = par ? par.reduce((a, b) => a + b, 0) : 0;
      const result =
        parTotal > 0 && rounds.length > 0
          ? total - parTotal * rounds.length
          : null;

      players.push({
        name,
        country: sc.country || "",
        pos: sc.pos,
        result,
        total,
        rounds,
      });

      const nR = rounds.length;
      const nH = nR > 0 ? rounds[0].scores.length : 0;
      if (nR === 0) {
        process.stdout.write(" ⚠️  sem scores");
      } else {
        process.stdout.write(` ✅ ${nR}R ${nH}H gross=${total}`);
      }
    } catch (err) {
      process.stdout.write(` ❌ ${err.message.slice(0, 40)}`);
      players.push({
        name: c.name,
        country: "",
        pos: null,
        result: null,
        total: null,
        rounds: [],
        _error: err.message,
      });
    }

    await sleep(DELAY_MS);
  }

  console.log("\n");
  await browser.close();

  /* ═══ PASSO 3 — Output ═══ */
  const parF9 = par ? par.slice(0, 9).reduce((a, b) => a + b, 0) : null;
  const parB9 =
    par && par.length > 9 ? par.slice(9).reduce((a, b) => a + b, 0) : null;
  const parTotal = par ? par.reduce((a, b) => a + b, 0) : null;

  const output = {
    tournament: tournamentTitle,
    category: "",
    course: "",
    year: 2025,
    par: par || [],
    ...(si && si.length > 0 ? { si } : {}),
    parF9,
    parB9,
    parTotal,
    players: players.sort((a, b) => {
      if (a.pos != null && b.pos != null) return a.pos - b.pos;
      if (a.total != null && b.total != null) return a.total - b.total;
      return 0;
    }),
  };

  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), "utf-8");

  const ok = players.filter((p) => p.rounds.length > 0).length;
  const errs = players.filter((p) => p._error).length;

  console.log(`✅ Concluído!`);
  console.log(
    `   ${players.length} jogadores | ${ok} com scorecards | ${errs} erros`
  );
  if (par) console.log(`   Par: [${par.join(",")}] = ${parTotal}`);
  if (si && si.length > 0) console.log(`   SI:  [${si.join(",")}]`);
  console.log(`   Ficheiro: ${outFile}`);
})();
