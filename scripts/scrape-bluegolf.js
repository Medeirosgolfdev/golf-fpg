/**
 * scrape-bluegolf.js
 *
 * Playwright script para descarregar leaderboard + scorecards do BlueGolf.
 * Abre browser VISÍVEL para permitir resolver CAPTCHA manualmente.
 *
 * USO:
 *   node scrape-bluegolf.js "https://brjgt.bluegolf.com/.../contest/73/leaderboard.htm" output.json
 *     → modo "contest": scrape de UM leaderboard específico para um ficheiro
 *
 *   node scrape-bluegolf.js "https://www.bluegolf.com/junior/events/brjgt243/index.html"
 *     → modo "event": descobre todos os contests do evento e gera 1 JSON por
 *       contest com nome auto-derivado (ex: brjgt243_boys_10-11.json).
 *       Pode-se passar um directório como 2º arg para guardar lá os outputs.
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const DELAY_MS = 600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Extrai número da ronda do label (ex: "Round 1", "R2", "Day 3 - Feb 27").
 *  Devolve null se não conseguir parsear. */
function extractRoundNum(label) {
  if (!label || typeof label !== "string") return null;
  const m = /\b(?:round|rd|day|volta|r)\s*[\.#]?\s*(\d+)/i.exec(label);
  if (m) return parseInt(m[1], 10);
  const m2 = /\d+/.exec(label);
  if (m2) return parseInt(m2[0], 10);
  return null;
}

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

    const nameLink = document.querySelector(".bg-profile-header h3 a");
    if (nameLink) {
      const clone = nameLink.cloneNode(true);
      clone.querySelectorAll("i, img, span, svg").forEach(el => el.remove());
      result.name = clone.textContent.replace(/\s+/g, " ").trim();
    }

    const countryEl = document.querySelector(".bg-profile-header p.text-muted");
    if (countryEl) result.country = countryEl.textContent.trim();

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

    const desktopBlock = document.querySelector(".row.d-none.d-md-block");
    if (desktopBlock) {
      const table = desktopBlock.querySelector("table.bg-tbl-scorecard");
      if (table) {
        const holeInputs = table.querySelectorAll('input[type="hidden"][data-par]');
        for (const inp of holeInputs) {
          result.par.push(parseInt(inp.getAttribute("data-par"), 10));
        }
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
        for (const tr of table.querySelectorAll("tr.scores")) {
          const allTds = Array.from(tr.querySelectorAll("td"));
          const labelTd = allTds[0];
          const label = labelTd ? labelTd.textContent.trim() : "";
          const tds = allTds.slice(1);
          const scores = [];
          for (const td of tds) {
            const n = parseInt(td.textContent.trim(), 10);
            if (!isNaN(n) && n >= 1 && n <= 15) scores.push(n);
          }
          if (scores.length >= 9) {
            result.rounds.push({ scores, label });
          }
        }
      }
    }

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
        if (result.par.length === 0) {
          for (const inp of table.querySelectorAll('input[type="hidden"][data-par]')) {
            result.par.push(parseInt(inp.getAttribute("data-par"), 10));
          }
        }
      }
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

/* ─── Detectar contests dentro de uma página de evento ─────────────────
 * A página `/junior/events/{slug}/index.html` tipicamente lista os escalões
 * ("Boys 10-11", "Boys 12-13", etc.). Cada um tem um link para o leaderboard
 * do contest correspondente. Devolve [{ url, label }]. */
async function discoverContests(page, eventUrl) {
  await page.goto(eventUrl, { waitUntil: "domcontentloaded" });
  await waitForHuman(page);
  await page.waitForLoadState("networkidle");

  const contests = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    // Procurar TODOS os links que apontem para contest/N/leaderboard*
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") || "";
      const abs = a.href;
      // Match contest/N/leaderboard.htm OR contest/N (raiz do contest)
      const m = abs.match(/\/contest\/(\d+)(?:\/(?:leaderboard|index)\.htm)?(?:[?#].*)?$/i);
      if (!m) continue;
      const contestId = m[1];
      if (seen.has(contestId)) continue;
      seen.add(contestId);
      // Tentar capturar label do link ou do row pai
      let label = (a.textContent || "").replace(/\s+/g, " ").trim();
      const tr = a.closest("tr");
      if (tr && (!label || label.length < 3)) {
        // Procurar primeira <td> com texto significativo
        const firstTd = Array.from(tr.querySelectorAll("td")).find(td => (td.textContent || "").trim().length > 0);
        if (firstTd) label = firstTd.textContent.replace(/\s+/g, " ").trim();
      }
      // URL canónico do leaderboard
      const base = abs.replace(/\/(?:leaderboard|index)\.htm.*$/i, "").replace(/\/+$/, "");
      out.push({ url: `${base}/leaderboard.htm`, contestId, label: label || `contest ${contestId}` });
    }
    return out;
  });
  return contests;
}

/* ─── Scrape de UM contest (leaderboard + scorecards) — devolve {output, info} */
async function scrapeContest(page, leaderboardUrl) {
  const contestMatch = leaderboardUrl.match(/^(https?:\/\/.+\/contest\/\d+)/);
  if (!contestMatch) throw new Error(`URL inválida (sem /contest/N/): ${leaderboardUrl}`);
  const contestBase = contestMatch[1];

  console.log(`\n📋 ${leaderboardUrl}`);
  await page.goto(leaderboardUrl, { waitUntil: "domcontentloaded" });
  await waitForHuman(page);
  await page.waitForLoadState("networkidle");

  const pageTitle = await page.title();
  const tournamentTitle = pageTitle.replace(/ \| .*$/, "").replace(" Leaderboard", "").trim();
  console.log(`   Torneio: ${tournamentTitle}`);

  const meta = await page.evaluate(() => {
    const out = { category: "", course: "" };
    const titleEls = [
      ...document.querySelectorAll(".bg-event-title, .event-title, h1, h2, .breadcrumb-item.active"),
    ];
    for (const el of titleEls) {
      const txt = (el.textContent || "").trim();
      const m = /\b(Boys|Girls)\s+(\d+)(?:\s*[-–]\s*(\d+))?/i.exec(txt);
      if (m) {
        const prefix = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
        out.category = m[3] ? `${prefix} ${m[2]}-${m[3]}` : `${prefix} ${m[2]}`;
        break;
      }
    }
    const courseEl = document.querySelector(".bg-event-course, .event-course, [data-course]");
    if (courseEl) out.course = (courseEl.textContent || "").trim();
    return out;
  });
  let category = meta.category;
  if (!category) {
    const m = /\b(Boys|Girls)\s+(\d+)(?:\s*[-–]\s*(\d+))?/i.exec(tournamentTitle);
    if (m) {
      const prefix = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
      category = m[3] ? `${prefix} ${m[2]}-${m[3]}` : `${prefix} ${m[2]}`;
    }
  }
  const course = meta.course || "";
  console.log(`   Categoria: ${category || "(não detectada)"} | Course: ${course || "(não detectado)"}`);

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

  console.log(`   Jogadores: ${contestants.length}`);
  if (contestants.length === 0) {
    return null;
  }

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
      await page.waitForSelector("table.bg-tbl-scorecard, table.scorecard-profile", { timeout: 12_000 }).catch(() => {});

      const sc = await extractScorecard(page);
      if (!par && sc.par.length >= 9) par = sc.par.length > 18 ? sc.par.slice(0, 18) : sc.par;
      if (!si && sc.si.length >= 9) si = sc.si.length > 18 ? sc.si.slice(0, 18) : sc.si;

      const name = sc.name || c.name;
      const enrichedRounds = sc.rounds.map((rd, idx) => ({
        scores: rd.scores, label: rd.label || "", origIdx: idx,
        roundNum: extractRoundNum(rd.label) || (idx + 1),
      }));
      enrichedRounds.sort((a, b) => a.roundNum - b.roundNum);
      const rounds = enrichedRounds.map((rd, idx) => {
        const scores = rd.scores;
        const f9 = scores.slice(0, 9).reduce((a, b) => a + b, 0);
        const b9 = scores.length > 9 ? scores.slice(9, 18).reduce((a, b) => a + b, 0) : 0;
        const gross = scores.reduce((a, b) => a + b, 0);
        return { day: idx + 1, scores, f9, ...(scores.length > 9 ? { b9 } : {}), gross, label: rd.label || undefined };
      });
      const total = rounds.length > 0 ? rounds.reduce((a, r) => a + r.gross, 0) : sc.total;
      const parTotal = par ? par.reduce((a, b) => a + b, 0) : 0;
      const result = parTotal > 0 && rounds.length > 0 ? total - parTotal * rounds.length : null;

      players.push({ name, country: sc.country || "", pos: sc.pos, result, total, rounds });
      const nRounds = rounds.length;
      const nHoles = nRounds > 0 ? rounds[0].scores.length : 0;
      process.stdout.write(nRounds === 0 ? " ⚠️ sem scores" : ` ✅ ${nRounds}R ${nHoles}H gross=${total}`);
    } catch (err) {
      process.stdout.write(` ❌ ${err.message.slice(0, 40)}`);
      players.push({ name: c.name, country: "", pos: null, result: null, total: null, rounds: [], _error: err.message });
    }
    await sleep(DELAY_MS);
  }
  console.log("");

  const parF9 = par ? par.slice(0, 9).reduce((a, b) => a + b, 0) : null;
  const parB9 = par && par.length > 9 ? par.slice(9).reduce((a, b) => a + b, 0) : null;
  const pTotal = par ? par.reduce((a, b) => a + b, 0) : null;
  let outYear = new Date().getFullYear();
  const yrMatch = /\b(20\d{2})\b/.exec(tournamentTitle);
  if (yrMatch) outYear = +yrMatch[1];

  const output = {
    tournament: tournamentTitle,
    category, course, year: outYear,
    source: leaderboardUrl,
    par: par || [],
    ...(si && si.length > 0 ? { si } : {}),
    parF9, parB9, parTotal: pTotal,
    players: players.sort((a, b) => {
      if (a.pos && b.pos) return a.pos - b.pos;
      if (a.total && b.total) return a.total - b.total;
      return 0;
    }),
  };
  return { output, category, tournamentTitle, year: outYear, parTotal: pTotal };
}

/** Slugifica "Boys 10-11" → "boys_10-11" para usar no nome do ficheiro. */
function slugCategory(cat) {
  return (cat || "").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_\-]/g, "");
}

/** Slug do evento a partir da URL — ex: "brjgt243" de
 *  "https://www.bluegolf.com/junior/events/brjgt243/index.html". */
function slugEvent(eventUrl) {
  const m = eventUrl.match(/\/events\/([^\/]+)/i);
  return m ? m[1].toLowerCase() : "event";
}

/* ─── Main ─── */
(async () => {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Uso:");
    console.error("  node scrape-bluegolf.js <leaderboard_url> [output.json]");
    console.error("  node scrape-bluegolf.js <event_index_url>  [output_dir]");
    process.exit(1);
  }

  const url = args[0];
  const isContest = /\/contest\/\d+/.test(url);
  const isEvent = !isContest && /\/(?:junior\/)?events?\/[^\/]+\/(?:index\.htm|$)/i.test(url);

  if (!isContest && !isEvent) {
    console.error("URL não reconhecida. Esperado:");
    console.error("  https://.../contest/NN/leaderboard.htm  (contest individual)");
    console.error("  https://www.bluegolf.com/junior/events/SLUG/index.html (evento c/ vários contests)");
    process.exit(1);
  }

  console.log(`🏌️  BlueGolf Scraper · ${isEvent ? "MODO EVENTO" : "MODO CONTEST"}`);
  console.log(`   URL: ${url}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  if (isContest) {
    const outFile = args[1] || "bluegolf_scorecards.json";
    const res = await scrapeContest(page, url);
    if (!res) {
      console.error("❌ Nenhum contestant.");
      await browser.close(); process.exit(1);
    }
    fs.writeFileSync(outFile, JSON.stringify(res.output, null, 2), "utf-8");
    console.log(`✅ Ficheiro: ${outFile}`);
    await browser.close();
    return;
  }

  // MODO EVENTO
  const outDir = args[1] || ".";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const evSlug = slugEvent(url);

  console.log("🔎 A descobrir contests...");
  const contests = await discoverContests(page, url);
  console.log(`   ${contests.length} contests encontrados:`);
  contests.forEach((c, i) => console.log(`   ${i + 1}. ${c.label}  →  ${c.url}`));

  if (contests.length === 0) {
    console.error("\n❌ Nenhum contest descoberto na página de evento.");
    await browser.close(); process.exit(1);
  }

  const summary = [];
  for (const c of contests) {
    try {
      const res = await scrapeContest(page, c.url);
      if (!res) { summary.push({ contestId: c.contestId, label: c.label, status: "empty" }); continue; }
      const catSlug = slugCategory(res.category) || `contest_${c.contestId}`;
      const fname = `${evSlug}_${catSlug}.json`;
      const fpath = path.join(outDir, fname);
      fs.writeFileSync(fpath, JSON.stringify(res.output, null, 2), "utf-8");
      summary.push({ contestId: c.contestId, label: c.label, category: res.category, file: fname, players: res.output.players.length });
      console.log(`   💾 ${fname}  (${res.output.players.length} jogadores)`);
    } catch (err) {
      summary.push({ contestId: c.contestId, label: c.label, status: "error", error: err.message });
      console.log(`   ❌ ${c.label}: ${err.message}`);
    }
  }

  console.log("\n📊 Resumo:");
  summary.forEach(s => console.log(`   • ${s.label}  →  ${s.file || s.status || s.error}`));
  await browser.close();
})();
