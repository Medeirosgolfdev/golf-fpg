/**
 * scrape-orange-bowl.js
 *
 * Descarrega scorecards dos 4 Junior Orange Bowl (59th-62nd, 2023-2026).
 *
 * USO:  node scrape-orange-bowl.js
 * REQUISITOS: npm install playwright
 */

const { chromium } = require("playwright");
const fs = require("fs");

const BASE = "https://www.golfgenius.com";
const DELAY_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ═══════════════════════════════════════════════════════════
   LEADERBOARD via Playwright (widget renderizado por JS)
   ═══════════════════════════════════════════════════════════ */
async function fetchLeaderboard(page, leagueId, base = BASE) {
  // Tentar ambos os formatos de widget
  let url = `${base}/leagues/${leagueId}/widgets/tournament_results?shared=false`;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  let found = await page
    .waitForSelector('a[href*="tournaments2/details"]', { timeout: 15_000 })
    .catch(() => null);

  // Fallback: tentar customized_tournament_results (formato Doral)
  if (!found) {
    url = `${base}/leagues/${leagueId}/widgets/customized_tournament_results?shared=false`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    found = await page
      .waitForSelector('a[href*="tournaments2/details"]', { timeout: 15_000 })
      .catch(() => null);
  }

  await sleep(1500);

  // Detectar divisões (Boys/Girls/etc) — NÃO o dropdown de rondas
  const divisionOptions = await page.evaluate(() => {
    const opts = [];

    // 1. Links de torneio/divisão clicáveis (ex: "Boys", "Girls", "Nations Cup")
    //    GolfGenius usa vários selectores para estes
    const selectors = [
      '.tournament_name a',
      '.tournament_selector a', 
      'a.tournament_name',
      '.event-tab',
      '[data-tournament-id]',
    ];
    
    const seen = new Set();
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        const href = el.getAttribute('href') || '';
        // Filtrar: ignorar links de jogadores e rondas
        if (!text || text.length > 120 || seen.has(text)) return;
        if (href.includes('tournaments2/details')) return; // link de jogador!
        if (text.match(/^Round\s+\d|^\d{1,2}\s+(jan|fev|mar|apr|mai|jun|jul|aug|sep|oct|nov|dec)/i)) return;
        seen.add(text);
        opts.push({ type: 'link', label: text });
      });
    }

    // 2. Se não encontrou, procurar links clicáveis com texto de divisão
    if (opts.length === 0) {
      document.querySelectorAll('a, div[onclick], button').forEach((el) => {
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        const href = el.getAttribute('href') || '';
        if (!text || text.length > 120 || seen.has(text)) return;
        if (href.includes('tournaments2/details')) return;
        if (text.match(/boys|girls|garçon|fille|nation|team|équipe|mixed|mixte/i) &&
            !text.match(/Round\s+\d/i)) {
          seen.add(text);
          opts.push({ type: 'clickable', label: text });
        }
      });
    }

    // 3. Dropdown <select> — só usar se NÃO parece rondas (Round/Date)
    if (opts.length === 0) {
      document.querySelectorAll('select').forEach(sel => {
        const options = [...sel.options];
        const looksLikeRounds = options.some(o => /Round\s+\d/i.test(o.textContent));
        if (looksLikeRounds) return; // Ignorar dropdown de rondas
        options.forEach((o, i) => {
          if (o.value && o.textContent.trim()) {
            opts.push({ type: 'select', index: i, label: o.textContent.trim(), value: o.value });
          }
        });
      });
    }

    return opts;
  });

  if (divisionOptions.length > 1) {
    console.log(`  📂 ${divisionOptions.length} divisões: ${divisionOptions.map(d => d.label).join(', ')}`);
  }

  // Extrair jogadores de cada divisão
  const allPlayers = [];
  const seenIds = new Set();

  async function extractCurrentPlayers(division) {
    await sleep(1200);
    const players = await page.evaluate((div) => {
      const result = [];
      const links = document.querySelectorAll('a[href*="tournaments2/details"]');
      for (const link of links) {
        const href = link.getAttribute("href") || "";
        const idMatch = href.match(/\/tournaments2\/details\/(\d+)/);
        if (!idMatch) continue;
        const id = idMatch[1];
        const clone = link.cloneNode(true);
        clone.querySelectorAll("i, img, span.flag, svg").forEach((el) => el.remove());
        const name = clone.textContent.replace(/\s+/g, " ").trim();
        if (!name) continue;
        let country = "";
        const flagImg = link.querySelector("img[src*=flag]") || link.closest("td")?.querySelector("img[src*=flag]");
        if (flagImg) {
          const src = flagImg.getAttribute("src") || "";
          const cc = src.match(/flags\/4x3\/([a-z-]+)/);
          if (cc) country = cc[1].toUpperCase();
        }
        const tr = link.closest("tr");
        if (!tr) { result.push({ id, name, country, division: div, pos: null, toPar: null, grossTotal: null, roundScores: [] }); continue; }
        const allCells = Array.from(tr.querySelectorAll("td"));
        const pos = parseInt(allCells[0]?.textContent.trim(), 10) || null;
        const nameCell = link.closest("td");
        const nameCellIdx = nameCell ? allCells.indexOf(nameCell) : 1;
        const after = allCells.slice(nameCellIdx + 1).map((td) => td.textContent.replace(/\s+/g, " ").trim());
        const toParTxt = after[0] || "";
        const toPar = toParTxt === "E" ? 0 : parseInt(toParTxt, 10) || null;
        const roundScores = [];
        let grossTotal = null;
        for (let i = 1; i < after.length; i++) { const n = parseInt(after[i], 10); if (!isNaN(n) && n >= 20 && n <= 200) roundScores.push(n); }
        if (roundScores.length > 1) { grossTotal = roundScores.pop(); } else if (roundScores.length === 1) { grossTotal = roundScores[0]; }
        result.push({ id, name, country, division: div, pos, toPar, grossTotal, roundScores });
      }
      return result;
    }, division);
    return players;
  }

  if (divisionOptions.length <= 1) {
    // Só 1 divisão ou nenhuma — extrair directamente
    const label = divisionOptions[0]?.label || "";
    const players = await extractCurrentPlayers(label);
    return players;
  }

  // Iterar por cada divisão
  for (const opt of divisionOptions) {
    try {
      if (opt.type === 'select') {
        await page.selectOption('select', opt.value);
      } else {
        // Clicar no link/botão que contém o texto da divisão
        const el = await page.locator(`a, div[onclick], button`).filter({ hasText: opt.label }).first();
        if (el) {
          await el.click();
        } else {
          console.log(`    → ${opt.label}: não encontrado`);
          continue;
        }
      }
      await sleep(1500);
      // Esperar que os jogadores carreguem
      await page.waitForSelector('a[href*="tournaments2/details"]', { timeout: 10_000 }).catch(() => {});
      await sleep(800);

      const players = await extractCurrentPlayers(opt.label);
      let newCount = 0;
      for (const p of players) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          allPlayers.push(p);
          newCount++;
        }
      }
      if (newCount > 0) {
        console.log(`    → ${opt.label}: +${newCount} jogadores`);
      }
    } catch (err) {
      console.log(`    → ${opt.label}: ❌ ${err.message.slice(0, 40)}`);
    }
  }

  return allPlayers;
}

/* ═══════════════════════════════════════════════════════════
   SCORECARD via fetch directo (HTML bruto)
   ═══════════════════════════════════════════════════════════ */
async function fetchScorecard(pageId, playerId, base = BASE) {
  const url =
    `${base}/tournaments2/details/${playerId}` +
    `?round_index=&player_stats_for_portal=true`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      Referer: `${base}/pages/${pageId}`,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return parseScorecard(html);
}

/* ═══════════════════════════════════════════════════════════
   PARSE SCORECARD (regex sobre HTML bruto)
   Detecta automaticamente 9 ou 18 buracos
   ═══════════════════════════════════════════════════════════ */
function parseScorecard(html) {
  const rounds = [];
  const tableRe =
    /<table[^>]+class=["'][^"']*detail_table[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRe.exec(html)) !== null) {
    const tableHtml = tableMatch[0];

    /* ── Data + campo ── */
    const hm =
      /<tr[^>]+class=[\"']header_row[\"'][^>]*>([\s\S]*?)<\/tr>/i.exec(
        tableHtml
      );
    let date = "",
      course = "";
    if (hm) {
      const txt = hm[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const dm = txt.match(/^([A-Za-z]+,\s+[A-Za-z]+\s+\d+)/);
      if (dm) date = dm[1].trim();
      course = txt.replace(dm?.[0] || "", "").trim();
    }

    /* ── Linhas de scores ── */
    const rowRe = /<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/gi;
    let rm;
    while ((rm = rowRe.exec(tableHtml)) !== null) {
      const rowHtml = rm[0];
      if (/class=[\"'][^\"']*header_row[^\"']*[\"']/.test(rowHtml)) continue;

      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells = [];
      let c;
      while ((c = cellRe.exec(rowHtml)) !== null)
        cells.push(
          c[1]
            .replace(/<[^>]+>/g, "")
            .replace(/&nbsp;/g, " ")
            .trim()
        );

      if (cells.length < 12) continue; // mínimo para 9 buracos

      const rowDateMatch = cells[0].match(
        /^([A-Za-z]+,\s+[A-Za-z]+\s+\d+)/
      );
      const rowDate = rowDateMatch ? rowDateMatch[1].trim() : date;

      if (cells.length >= 22) {
        /* 18 buracos: [label, h1-h9, Out, h10-h18, In, Total] */
        const front9 = [];
        for (let i = 1; i <= 9; i++) {
          const n = parseInt(cells[i], 10);
          if (!isNaN(n) && n >= 1 && n <= 15) front9.push(n);
        }
        const back9 = [];
        for (let i = 11; i <= 19; i++) {
          const n = parseInt(cells[i], 10);
          if (!isNaN(n) && n >= 1 && n <= 15) back9.push(n);
        }

        if (front9.length >= 9 && back9.length >= 9) {
          const f9 =
            parseInt(cells[10], 10) || front9.reduce((a, b) => a + b, 0);
          const b9 =
            parseInt(cells[20], 10) || back9.reduce((a, b) => a + b, 0);
          const gross = parseInt(cells[21], 10) || f9 + b9;
          rounds.push({
            date: rowDate,
            course,
            scores: [...front9, ...back9],
            f9,
            b9,
            gross,
          });
          continue;
        }

        /* 9 buracos back nine (tipo Boys 8-9 Doral) */
        const nine = [];
        for (let i = 11; i <= 19; i++) {
          const n = parseInt(cells[i], 10);
          if (!isNaN(n) && n >= 1 && n <= 15) nine.push(n);
        }
        if (nine.length >= 9) {
          const gross =
            parseInt(cells[20], 10) || nine.reduce((a, b) => a + b, 0);
          rounds.push({
            date: rowDate,
            course,
            startingHole: 10,
            scores: nine,
            gross,
          });
          continue;
        }
      }

      /* 9 buracos front nine: [label, h1-h9, Out] = 11 cols */
      if (cells.length >= 11 && cells.length < 22) {
        const nine = [];
        for (let i = 1; i <= 9; i++) {
          const n = parseInt(cells[i], 10);
          if (!isNaN(n) && n >= 1 && n <= 15) nine.push(n);
        }
        if (nine.length >= 9) {
          const gross =
            parseInt(cells[10], 10) || nine.reduce((a, b) => a + b, 0);
          rounds.push({ date: rowDate, course, scores: nine, gross });
        }
      }
    }
  }

  return rounds;
}

/* ═══════════════════════════════════════════════════════════
   DETECTAR EVENTS (categorias/divisões) via widget
   ═══════════════════════════════════════════════════════════ */
async function detectEvents(page, leagueId) {
  const url = `${BASE}/leagues/${leagueId}/widgets/tournament_results?shared=false`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await sleep(2000);

  // Extrair event_ids das chamadas XHR que o widget faz
  return page.evaluate(() => {
    // Procurar tabs/botões de divisões
    const tabs = [];
    document
      .querySelectorAll(
        ".tournament_name, .event-tab, [data-event-id], [class*=tab]"
      )
      .forEach((el) => {
        const text = el.textContent.trim();
        const eid = el.dataset?.eventId;
        if (eid) tabs.push({ eventId: eid, label: text });
      });

    // Procurar event_ids no HTML
    const html = document.documentElement.innerHTML;
    const eventIds = [
      ...new Set(
        [...html.matchAll(/event_id[=:]\s*["']?(\d{10,})["']?/g)].map(
          (m) => m[1]
        )
      ),
    ];

    return { tabs, eventIds };
  });
}

/* ═══════════════════════════════════════════════════════════
   SCRAPE UM TORNEIO COMPLETO
   ═══════════════════════════════════════════════════════════ */
async function scrapeTournament(browser, tournament) {
  const { title, gg_page } = tournament;
  const pageId = gg_page;
  const base = tournament.base || BASE;

  // Auto-resolver league ID se não fornecido
  let leagueId = tournament.gg_league;
  if (!leagueId) {
    console.log(`  🔍 A resolver League ID para ${title}...`);
    try {
      const res = await fetch(`${base}/pages/${pageId}`, {
        headers: { "User-Agent": "Mozilla/5.0 Chrome/120.0.0.0" },
      });
      const html = await res.text();
      const lm = html.match(/leagues\/(\d+)\/widgets/);
      // Também tentar customized_tournament_results
      const lm2 = !lm ? html.match(/leagues\/(\d+)\/widgets\/customized_tournament_results/) : null;
      const foundLm = lm || lm2;
      if (foundLm) {
        leagueId = foundLm[1];
        console.log(`   League ID: ${leagueId}`);
      } else {
        console.error(`  ❌ League ID não encontrado para ${title}`);
        return null;
      }
    } catch (err) {
      console.error(`  ❌ Erro ao resolver league: ${err.message}`);
      return null;
    }
  }

  console.log(`\n${"━".repeat(60)}`);
  console.log(`🏌️  ${title}`);
  console.log(`   Base: ${base}`);
  console.log(`   Page: ${pageId}  |  League: ${leagueId}`);
  console.log(`${"━".repeat(60)}`);

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  /* ── Leaderboard ── */
  let lbPlayers;
  try {
    lbPlayers = await fetchLeaderboard(page, leagueId, base);
  } catch (err) {
    console.error(`  ❌ Erro leaderboard: ${err.message}`);
    await context.close();
    return null;
  }

  console.log(`  📋 Jogadores no leaderboard: ${lbPlayers.length}`);
  if (lbPlayers.length === 0) {
    console.warn("  ⚠️  Nenhum jogador encontrado.");
    await context.close();
    return null;
  }

  /* ── Scorecards ── */
  const players = [];

  for (let i = 0; i < lbPlayers.length; i++) {
    const lb = lbPlayers[i];

    process.stdout.write(
      `\r  🔍 [${String(i + 1).padStart(2)}/${lbPlayers.length}] ` +
        lb.name.padEnd(30).slice(0, 30) + "  "
    );

    try {
      const rounds = await fetchScorecard(pageId, lb.id, base);
      const nR = rounds.length;

      const formattedRounds = rounds.map((r, idx) => ({
        day: idx + 1,
        date: r.date,
        course: r.course || "",
        ...(r.startingHole ? { startingHole: r.startingHole } : {}),
        scores: r.scores,
        ...(r.f9 != null ? { f9: r.f9 } : {}),
        ...(r.b9 != null ? { b9: r.b9 } : {}),
        gross: r.gross,
      }));

      const computedTotal =
        formattedRounds.length > 0
          ? formattedRounds.reduce((a, r) => a + r.gross, 0)
          : null;
      const total = lb.grossTotal ?? computedTotal;

      if (nR === 0) {
        process.stdout.write("⚠️  sem scores");
      } else {
        process.stdout.write(
          `✅ ${nR}R ${formattedRounds.map((r) => r.gross).join("+")}=${total}`
        );
      }

      players.push({
        id: lb.id,
        name: lb.name,
        country: lb.country,
        pos: lb.pos,
        toPar: lb.toPar,
        total,
        roundScores: lb.roundScores,
        rounds: formattedRounds,
      });
    } catch (err) {
      process.stdout.write(`❌ ${err.message.slice(0, 30)}`);
      players.push({
        id: lb.id,
        name: lb.name,
        country: lb.country,
        pos: lb.pos,
        toPar: lb.toPar,
        total: lb.grossTotal,
        roundScores: lb.roundScores,
        rounds: [],
        _error: err.message,
      });
    }

    await sleep(DELAY_MS);
  }

  console.log();
  const ok = players.filter((p) => p.rounds.length > 0).length;
  const errs = players.filter((p) => p._error).length;
  console.log(
    `  ✅ ${players.length} jogadores | ${ok} com scorecards | ${errs} erros`
  );

  await context.close();

  return {
    tournament: title,
    source: `${base}/pages/${pageId}`,
    base,
    gg_page: pageId,
    gg_league: leagueId,
    ffgolf_url: tournament.ffgolf_url || "",
    scrapedAt: new Date().toISOString(),
    players,
  };
}

/* ═══════════════════════════════════════════════════════════
   TORNEIOS CONHECIDOS (ffgolf → GolfGenius)
   ═══════════════════════════════════════════════════════════ */
const KNOWN_TOURNAMENTS = [
  { title: "59th Junior Orange Bowl 2023", gg_page: "3944736",             gg_league: null, base: "https://2023jrorangebowl.golfgenius.com", year: 2023 },
  { title: "60th Junior Orange Bowl 2024", gg_page: "4536721",             gg_league: null, base: "https://jobgolf.golfgenius.com",          year: 2024 },
  { title: "61st Junior Orange Bowl 2025", gg_page: "11271329517282569244", gg_league: null, year: 2025 },
  { title: "62nd Junior Orange Bowl 2026", gg_page: "11918494145733242107", gg_league: null, year: 2026 },
];

/* ═══════════════════════════════════════════════════════════
   MERGE / DEDUP — nunca perde dados entre runs
   ═══════════════════════════════════════════════════════════ */
function mergePlayers(existingPlayers, newPlayers) {
  const byId = new Map();
  for (const p of existingPlayers) {
    byId.set(p.id, { ...p, rounds: [...(p.rounds || [])] });
  }
  for (const p of newPlayers) {
    if (!byId.has(p.id)) { byId.set(p.id, { ...p }); continue; }
    const existing = byId.get(p.id);
    const roundKeys = new Set(
      existing.rounds.map((r) => `${r.date}_${r.gross}_${(r.scores || []).join(",")}`)
    );
    for (const r of p.rounds || []) {
      const key = `${r.date}_${r.gross}_${(r.scores || []).join(",")}`;
      if (!roundKeys.has(key)) { existing.rounds.push(r); roundKeys.add(key); }
    }
    existing.rounds.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    existing.rounds.forEach((r, i) => (r.day = i + 1));
    if (existing.rounds.length > 0) existing.total = existing.rounds.reduce((a, r) => a + (r.gross || 0), 0);
    if (p.toPar != null) existing.toPar = p.toPar;
    if (p.pos != null) existing.pos = p.pos;
    if (p.country && !existing.country) existing.country = p.country;
    delete existing._error;
  }
  return [...byId.values()];
}

function mergeAndSave(fname, newResult) {
  let merged = newResult;
  if (fs.existsSync(fname)) {
    try {
      const existing = JSON.parse(fs.readFileSync(fname, "utf-8"));
      const mergedPlayers = mergePlayers(existing.players || [], newResult.players || []);
      merged = { ...existing, ...newResult, players: mergedPlayers };
      const np = mergedPlayers.length - (existing.players || []).length;
      const nr = mergedPlayers.reduce((a, p) => a + p.rounds.length, 0) -
        (existing.players || []).reduce((a, p) => a + (p.rounds || []).length, 0);
      console.log(`  💾 ${fname} (merge: ${np >= 0 ? "+" : ""}${np} jogadores, ${nr >= 0 ? "+" : ""}${nr} rondas)`);
    } catch (e) { console.log(`  💾 ${fname} (novo)`); }
  } else { console.log(`  💾 ${fname} (novo)`); }
  fs.writeFileSync(fname, JSON.stringify(merged, null, 2), "utf-8");
}

function mergeAndSaveCombined(outFile, newResults) {
  let all = [];
  if (fs.existsSync(outFile)) { try { all = JSON.parse(fs.readFileSync(outFile, "utf-8")); } catch (e) {} }
  for (const nr of newResults) {
    const idx = all.findIndex((t) => t.gg_page === nr.gg_page && t.gg_league === nr.gg_league);
    if (idx >= 0) { all[idx] = { ...all[idx], ...nr, players: mergePlayers(all[idx].players || [], nr.players || []) }; }
    else { all.push(nr); }
  }
  fs.writeFileSync(outFile, JSON.stringify(all, null, 2), "utf-8");
}

/* ═══════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════ */
(async () => {
  const args = process.argv.slice(2);

  let tournaments = [];

  if (args.length > 0 && args[0].endsWith(".json")) {
    const mapFile = args[0];
    if (!fs.existsSync(mapFile)) { console.error(`❌ Ficheiro não encontrado: ${mapFile}`); process.exit(1); }
    const map = JSON.parse(fs.readFileSync(mapFile, "utf-8"));
    const seen = new Set();
    for (const t of map) { const key = `${t.gg_league}_${t.gg_page}`; if (!seen.has(key)) { seen.add(key); tournaments.push(t); } }
  }

  if (args.includes("--url")) {
    const url = args[args.indexOf("--url") + 1];
    const m = url.match(/pages\/(\d+)/);
    if (!m) { console.error("❌ URL inválido"); process.exit(1); }
    const pageId = m[1];
    const res = await fetch(`${BASE}/pages/${pageId}`, { headers: { "User-Agent": "Mozilla/5.0 Chrome/120.0.0.0" } });
    const html = await res.text();
    const lm = html.match(/leagues\/(\d+)\/widgets/);
    const titleM = html.match(/<title>([^<]+)/);
    tournaments = [{ title: titleM?.[1]?.trim() || "Unknown", gg_page: pageId, gg_league: lm?.[1] || null }];
  }

  if (args.length === 0) {
    tournaments = [...KNOWN_TOURNAMENTS];
    console.log(`📋 A usar ${tournaments.length} Junior Orange Bowl (2023-2026)`);
  }

  if (tournaments.length === 0) { console.error("❌ Nenhum torneio"); process.exit(1); }

  console.log(`\n🏌️  Junior Orange Bowl Scraper`);
  console.log(`   Torneios: ${tournaments.length}`);
  console.log(`   ${tournaments.map((t) => t.title).join("\n   ")}\n`);

  const browser = await chromium.launch({ headless: false });
  const allResults = [];

  for (const t of tournaments) {
    const result = await scrapeTournament(browser, t);
    if (result) {
      allResults.push(result);
      const slug = t.title.replace(/[^a-zA-Z0-9]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").toLowerCase().slice(0, 60);
      mergeAndSave(`gg_${slug}.json`, result);
    }
  }

  await browser.close();

  if (allResults.length > 0) {
    const outFile = "gg_orange_bowl_all.json";
    mergeAndSaveCombined(outFile, allResults);

    const totalJ = allResults.reduce((a, t) => a + t.players.length, 0);
    const totalOk = allResults.reduce((a, t) => a + t.players.filter((p) => p.rounds.length > 0).length, 0);
    console.log(`\n${"━".repeat(60)}`);
    console.log(`✅ Concluído! ${allResults.length} torneios | ${totalJ} jogadores | ${totalOk} com scorecards`);
    console.log(`   Ficheiro combinado: ${outFile}`);
  }
})();
