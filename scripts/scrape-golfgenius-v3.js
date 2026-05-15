/**
 * scrape-golfgenius-v3.js — Scraper para First Tee Miami Doral Jr. Classic
 *
 * Sucessor do scrape-golfgenius.js (v2). Lida com o novo widget GolfGenius
 * (descoberto 2026-05-15) que mostra um seletor com hyperlinks
 * `/v2tournaments/{id}` em vez de listar todos os jogadores agregados via
 * `?division=` no widget customized_tournament_results.
 *
 * Fluxo (por edição):
 *   1) GET widget URL `/leagues/{leagueId}/widgets/customized_tournament_results?page_id=N`
 *      → extrair os 8-12 links `<a href="/v2tournaments/{tid}">{Label} - {Name} Division</a>`
 *      → cada link é uma divisão do torneio
 *   2) Para cada divisão: GET `/v2tournaments/{tid}` → extrair leaderboard
 *      (links `tournaments2/details/{playerId}` + nome + país + ano + pos +
 *      toPar + R1 + R2 + total)
 *   3) Para cada jogador: fetch HTML directo de `/tournaments2/details/{playerId}`
 *      → parsear scorecard hole-by-hole
 *
 * Suporta as 12 divisões: Boys/Girls × {7&Under, 8-9, 10-11, 12-13, 14-15, 16-18}.
 * Skip silencioso de divisões em falta numa edição.
 *
 * USO:
 *   node scrape-golfgenius-v3.js --year 2023
 *   node scrape-golfgenius-v3.js --all
 *   HEADLESS=false node scrape-golfgenius-v3.js --year 2024   # ver browser
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "doral-editions.json");
const OUTPUT_DIR  = path.join(__dirname, "..", "public", "data");
const DELAY_MS    = 300;
const HEADLESS    = process.env.HEADLESS !== "false";

/* Par canónico por divisão (Trump National Doral courses).
   Aplica-se a todas as edições — os campos/escalões mantêm-se entre anos. */
const DIVISION_PAR = {
  "Boys+7-Under":  { par: [5,3,5,4,3,4,3,4,5],                          parTotal: 36, startingHole: 10 },
  "Boys+8-9":      { par: [5,3,5,4,3,4,3,4,5],                          parTotal: 36, startingHole: 10 },
  "Girls+7-Under": { par: [5,3,5,4,5,3,4,3,4],                          parTotal: 36, startingHole: 1 },
  "Girls+8-9":     { par: [5,3,5,4,5,3,4,3,4],                          parTotal: 36, startingHole: 1 },
  "Girls+10-11":   { par: [5,3,5,4,5,3,4,3,4],                          parTotal: 36, startingHole: 1 },
  "Girls+14-15":   { par: [5,3,5,4,5,3,4,3,4, 5,3,5,4,3,4,3,4,5],      parF9: 36, parB9: 36, parTotal: 72 },
  "Girls+16-18":   { par: [5,3,5,4,5,3,4,3,4, 5,3,5,4,3,4,3,4,5],      parF9: 36, parB9: 36, parTotal: 72 },
  "Boys+10-11":    { par: [4,5,4,5,4,4,3,4,3, 4,5,3,4,4,3,5,3,4],      parF9: 36, parB9: 35, parTotal: 71 },
  "Girls+12-13":   { par: [4,5,4,5,4,4,3,4,3, 4,5,3,4,4,3,5,3,4],      parF9: 36, parB9: 35, parTotal: 71 },
  "Boys+14-15":    { par: [4,5,4,5,4,4,3,4,3, 4,5,3,4,4,3,5,3,4],      parF9: 36, parB9: 35, parTotal: 71 },
  "Boys+12-13":    { par: [4,4,5,3,4,4,3,4,4, 4,5,4,4,4,3,5,3,4],      parF9: 35, parB9: 36, parTotal: 71 },
  "Boys+16-18":    { par: [5,4,4,3,4,4,4,5,3, 5,3,5,3,4,3,4,4,4],      parF9: 36, parB9: 35, parTotal: 71 },
};

/* Mapeia label de divisão do widget → key canónica.
   Ex: "Boys 7 & Under" → "Boys+7-Under", "Boys 10-11" → "Boys+10-11",
       "Boys 14 & 15" → "Boys+14-15", "Girls 8-9" → "Girls+8-9" */
function labelToKey(label) {
  const m = label.split(" - ")[0].trim();
  if (/^(Boys|Girls)\s+7\s*&\s*Under$/i.test(m)) {
    const sex = m.split(/\s+/)[0];
    return `${sex}+7-Under`;
  }
  const ageRange = m.match(/^(Boys|Girls)\s+(\d+)\s*[&-]\s*(\d+)$/i);
  if (ageRange) return `${ageRange[1]}+${ageRange[2]}-${ageRange[3]}`;
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ═══════════════════════════════════════════════════════════
   parseArgs
   ═══════════════════════════════════════════════════════════ */
function parseArgs(argv) {
  const a = { year: null, all: false, url: null, out: null, league: null, division: null, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--year")        a.year = argv[++i];
    else if (v === "--all")    a.all = true;
    else if (v === "--url")    a.url = argv[++i];
    else if (v === "--out")    a.out = argv[++i];
    else if (v === "--league") a.league = argv[++i];
    else if (v === "--division") a.division = argv[++i];
    else if (v === "--limit")  a.limit = parseInt(argv[++i], 10);
  }
  return a;
}

/* ═══════════════════════════════════════════════════════════
   Detect League ID via fetch HTML (para edições 2024/2025 onde
   está null no config)
   ═══════════════════════════════════════════════════════════ */
async function detectLeagueId(pageUrl) {
  const res = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0 Chrome/120.0.0.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${pageUrl}`);
  const html = await res.text();
  const m = html.match(/\/leagues\/(\d+)\/widgets\/(?:customized_)?tournament_results/);
  if (!m) throw new Error(`League ID não detectado no HTML de ${pageUrl}`);
  return m[1];
}

/* ═══════════════════════════════════════════════════════════
   Step 1 — Descobrir divisões a partir do widget principal
   Devolve: [{divKey: "Boys+8-9", divLabel: "Boys 8-9", divFullName: "Boys 8 & 9 Division", v2tid: "4222404"}, ...]
   ═══════════════════════════════════════════════════════════ */
async function discoverDivisions(page, host, leagueId, pageId) {
  const url = `https://${host}/leagues/${leagueId}/widgets/customized_tournament_results?page_id=${pageId}&shared=false`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  // Aguardar pelos links de divisão (selector real) em vez de networkidle (que
  // nunca dispara — analytics em background).
  await page.waitForSelector('a[href*="/v2tournaments/"]', { timeout: 15000 }).catch(() => {});
  await sleep(1500);

  const links = await page.$$eval('a[href*="/v2tournaments/"]', els =>
    els.map(a => ({ href: a.getAttribute("href") || "", text: (a.textContent || "").replace(/\s+/g, " ").trim() }))
  );

  const divisions = [];
  const seen = new Set();
  for (const l of links) {
    const tidMatch = l.href.match(/\/v2tournaments\/(\d+)/);
    if (!tidMatch) continue;
    const v2tid = tidMatch[1];
    if (seen.has(v2tid)) continue;
    const parts = l.text.split(" - ");
    const divLabel = parts[0] || l.text;
    const divFullName = parts[1] || `${divLabel} Division`;
    const divKey = labelToKey(divLabel);
    if (!divKey) {
      console.warn(`  ⚠️  Divisão "${divLabel}" não mapeada para key — skip`);
      continue;
    }
    seen.add(v2tid);
    divisions.push({ divKey, divLabel, divFullName, v2tid });
  }
  return divisions;
}

/* ═══════════════════════════════════════════════════════════
   Step 2 — Leaderboard via v2tournaments URL
   ═══════════════════════════════════════════════════════════ */
async function fetchLeaderboardV2(page, host, v2tid) {
  const url = `https://${host}/v2tournaments/${v2tid}?called_from=widgets%2Fcustomized_tournament_results&hide_totals=false&player_stats_for_portal=true`;
  // domcontentloaded é instantâneo; networkidle nunca dispara aqui porque o
  // site mantém pedidos a analytics (GA, FB, LinkedIn) em background.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  // O leaderboard renderiza após o JS principal correr. Aguardar links de jogador.
  await page.waitForSelector('a[href*="tournaments2/details"]', { timeout: 15000 }).catch(() => {});
  await sleep(1200);

  return page.evaluate(() => {
    const players = [];
    const links = document.querySelectorAll('a[href*="tournaments2/details"]');
    for (const link of links) {
      const href = link.getAttribute("href") || "";
      const idMatch = href.match(/\/tournaments2\/details\/(\d+)/);
      if (!idMatch) continue;
      const id = idMatch[1];

      const clone = link.cloneNode(true);
      clone.querySelectorAll("i, img, span, svg").forEach((el) => el.remove());
      const name = clone.textContent.replace(/\s+/g, " ").trim();
      if (!name) continue;

      const tr = link.closest("tr");
      if (!tr) { players.push({ id, name, country: "", birthYear: null, pos: null, toPar: null, grossTotal: null, r1Gross: null, r2Gross: null }); continue; }

      const allCells = Array.from(tr.querySelectorAll("td"));
      const pos = parseInt(allCells[0]?.textContent.trim(), 10) || null;

      const nameCell = link.closest("td");
      let country = "", birthYear = null;
      if (nameCell) {
        const afterLink = nameCell.textContent.replace(/\s+/g, " ").trim().replace(name, "").trim();
        const cyMatch = afterLink.match(/([A-Za-z][A-Za-z ]+?)(?:,\s*(\d{4}))?$/);
        if (cyMatch?.[1]?.trim().length > 1) {
          country = cyMatch[1].trim();
          birthYear = cyMatch[2] ? parseInt(cyMatch[2], 10) : null;
        }
      }

      const nameCellIdx = nameCell ? allCells.indexOf(nameCell) : 1;
      const after = allCells.slice(nameCellIdx + 1).map((td) => td.textContent.replace(/\s+/g, " ").trim());

      const toParTxt = after[0] || "";
      const toPar     = toParTxt === "E" ? 0 : (toParTxt === "-" || toParTxt === "" ? null : (parseInt(toParTxt, 10) || null));
      const r1Gross   = parseInt(after[1], 10) || null;
      const r2Gross   = parseInt(after[2], 10) || null;
      const grossTotal = parseInt(after[3], 10) || null;

      players.push({ id, name, country, birthYear, pos, toPar, grossTotal, r1Gross, r2Gross });
    }
    return players;
  });
}

/* ═══════════════════════════════════════════════════════════
   Step 3 — Scorecard via context.request (mantém cookies da sessão
   Playwright). fetch() Node devolvia 403 Forbidden em algumas
   divisões mais antigas (descoberta 2026-05-15 edição 2018).
   ═══════════════════════════════════════════════════════════ */
async function fetchScorecard(context, host, pageId, playerId, nineHoleOnly, startingHole) {
  const url = `https://${host}/tournaments2/details/${playerId}?round_index=&player_stats_for_portal=true`;
  const res = await context.request.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Referer": `https://${host}/pages/${pageId}`,
    }
  });
  if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
  const html = await res.text();
  return parseScorecard(html, nineHoleOnly, startingHole);
}

function parseScorecard(html, isNineHole, startingHole) {
  const rounds = [];
  const tableRe = /<table[^>]+class=["'][^"']*detail_table[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRe.exec(html)) !== null) {
    const tableHtml = tableMatch[0];
    const hm = /<tr[^>]+class=["']header_row["'][^>]*>([\s\S]*?)<\/tr>/i.exec(tableHtml);
    let date = "", course = "";
    if (hm) {
      const txt = hm[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const dm = txt.match(/^([A-Za-z]+,\s+[A-Za-z]+\s+\d+)/);
      if (dm) date = dm[1].trim();
      course = txt.replace(dm?.[0] || "", "").trim();
    }
    const rowRe = /<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/gi;
    let rm;
    while ((rm = rowRe.exec(tableHtml)) !== null) {
      const rowHtml = rm[0];
      if (/class=["'][^"']*header_row[^"']*["']/.test(rowHtml)) continue;
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells = [];
      let c;
      while ((c = cellRe.exec(rowHtml)) !== null)
        cells.push(c[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim());
      if (cells.length < 22) continue;
      const rowDateMatch = cells[0].match(/^([A-Za-z]+,\s+[A-Za-z]+\s+\d+)/);
      const rowDate = rowDateMatch ? rowDateMatch[1].trim() : date;
      // Detectar dinamicamente onde os scores estão. As 22 células são:
      //   [0]=row label   [1..9]=holes 1-9   [10]=Out   [11..19]=holes 10-18   [20]=In   [21]=Total
      // Em torneios 9-hole, só uma metade tem scores (front ou back) e a outra está vazia.
      // Hardcodar startingHole por divisão não funciona (ex: Boys 8-9 jogou front-9
      // em 2018 e back-9 em 2024) — detectamos via contagem de scores válidos.
      const front9 = [];
      for (let i = 1; i <= 9; i++) { const n = parseInt(cells[i], 10); if (!isNaN(n) && n >= 1 && n <= 15) front9.push(n); }
      const back9 = [];
      for (let i = 11; i <= 19; i++) { const n = parseInt(cells[i], 10); if (!isNaN(n) && n >= 1 && n <= 15) back9.push(n); }

      if (!isNineHole && front9.length === 9 && back9.length === 9) {
        // 18 buracos
        const f9    = parseInt(cells[10], 10) || front9.reduce((a, b) => a + b, 0);
        const b9    = parseInt(cells[20], 10) || back9.reduce((a, b) => a + b, 0);
        const gross = parseInt(cells[21], 10) || f9 + b9;
        rounds.push({ date: rowDate, course, scores: [...front9, ...back9], f9, b9, gross });
      } else if (front9.length === 9 && back9.length === 0) {
        // 9 buracos jogados no front (holes 1-9)
        const gross = parseInt(cells[10], 10) || front9.reduce((a, b) => a + b, 0);
        rounds.push({ date: rowDate, course, startingHole: 1, scores: front9, gross });
      } else if (back9.length === 9 && front9.length === 0) {
        // 9 buracos jogados no back (holes 10-18)
        const gross = parseInt(cells[20], 10) || back9.reduce((a, b) => a + b, 0);
        rounds.push({ date: rowDate, course, startingHole: 10, scores: back9, gross });
      } else {
        // Scorecard incompleto/anómalo — skip
        continue;
      }
    }
  }
  return rounds;
}

/* ═══════════════════════════════════════════════════════════
   Scrape uma edição completa
   ═══════════════════════════════════════════════════════════ */
async function scrapeEdition(edition, page, context, opts = {}) {
  let leagueId = edition.leagueId;
  if (!leagueId) {
    console.log("  🔍 A detectar League ID via HTML...");
    leagueId = await detectLeagueId(edition.sourceUrl);
    console.log(`     League ID: ${leagueId}`);
  }
  const host = new URL(edition.sourceUrl).host;

  console.log(`  🔍 A descobrir divisões via widget...`);
  let divisions = await discoverDivisions(page, host, leagueId, edition.primaryPageId);
  console.log(`     ${divisions.length} divisões: ${divisions.map(d => d.divLabel).join(", ")}`);

  // Filtro --division (corre só uma)
  if (opts.division) {
    divisions = divisions.filter(d => d.divKey === opts.division);
    console.log(`     Filtro --division=${opts.division} aplicado → ${divisions.length} divisão(ões)`);
  }

  const allDivisions = [];
  for (const d of divisions) {
    console.log(`\n━━━ ${d.divLabel} (v2tid=${d.v2tid}) ━━━`);
    let lbPlayers = [];
    try {
      lbPlayers = await fetchLeaderboardV2(page, host, d.v2tid);
    } catch (err) {
      console.warn(`  ⚠️  Erro no leaderboard: ${err.message}`);
      continue;
    }
    if (lbPlayers.length === 0) { console.log("  (sem jogadores — skip)"); continue; }
    if (opts.limit && lbPlayers.length > opts.limit) {
      console.log(`  📋 ${lbPlayers.length} jogadores (limit=${opts.limit} — só primeiros ${opts.limit})`);
      lbPlayers = lbPlayers.slice(0, opts.limit);
    } else {
      console.log(`  📋 ${lbPlayers.length} jogadores`);
    }

    const parInfo = DIVISION_PAR[d.divKey] || {};
    const nineHoleOnly = parInfo.par && parInfo.par.length === 9;
    const startingHole = parInfo.startingHole || 1;

    const players = [];
    for (let i = 0; i < lbPlayers.length; i++) {
      const lb = lbPlayers[i];
      process.stdout.write(`\r  🔍 [${String(i + 1).padStart(2)}/${lbPlayers.length}] ${lb.name.padEnd(28).slice(0, 28)}  `);
      try {
        const rounds = await fetchScorecard(context, host, edition.primaryPageId, lb.id, nineHoleOnly, startingHole);
        const formattedRounds = rounds.map((r, idx) => ({
          day: idx + 1, date: r.date, course: r.course || "",
          ...(r.startingHole && r.startingHole !== 1 ? { startingHole: r.startingHole } : {}),
          scores: r.scores,
          ...(r.f9 != null ? { f9: r.f9 } : {}),
          b9: r.b9, gross: r.gross,
        }));
        const computedTotal = formattedRounds.length > 0 ? formattedRounds.reduce((a, r) => a + r.gross, 0) : null;
        const total = lb.grossTotal ?? computedTotal;
        if (formattedRounds.length === 0) process.stdout.write("⚠️  sem scores");
        else process.stdout.write(`✅ ${formattedRounds.length}R ${formattedRounds.map((r) => r.gross).join("+")}=${total}`);
        players.push({
          id: lb.id, name: lb.name, country: lb.country, birthYear: lb.birthYear,
          pos: lb.pos, toPar: lb.toPar, total,
          r1Gross: lb.r1Gross, r2Gross: lb.r2Gross,
          rounds: formattedRounds,
        });
      } catch (err) {
        process.stdout.write(`❌ ${err.message.slice(0, 30)}`);
        players.push({
          id: lb.id, name: lb.name, country: lb.country, birthYear: lb.birthYear,
          pos: lb.pos, toPar: lb.toPar, total: lb.grossTotal,
          r1Gross: lb.r1Gross, r2Gross: lb.r2Gross, rounds: [], _error: err.message,
        });
      }
      await sleep(DELAY_MS);
    }
    console.log();

    const ok = players.filter((p) => p.rounds.length > 0).length;
    console.log(`  ✅ ${players.length} jogadores | ${ok} com scorecards`);

    allDivisions.push({
      division: d.divLabel,
      name: d.divFullName,
      ...parInfo,
      players,
    });
  }

  return {
    tournament: edition.name,
    year: edition.year,
    source: edition.sourceUrl,
    divisions: allDivisions,
  };
}

/* ═══════════════════════════════════════════════════════════
   Main
   ═══════════════════════════════════════════════════════════ */
(async () => {
  const args = parseArgs(process.argv.slice(2));
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

  let editions = [];
  if (args.all) editions = config.editions;
  else if (args.year) {
    const e = config.editions.find((x) => String(x.year) === String(args.year));
    if (!e) { console.error(`❌ Ano ${args.year} não está no config.`); process.exit(1); }
    if (args.league) e.leagueId = args.league;
    editions = [e];
  } else if (args.url) {
    const ym = args.url.match(/\/(\d{4})/);
    const pm = args.url.match(/\/pages\/(\d+)/);
    if (!ym || !pm) { console.error("❌ URL inválido. Esperado: https://.../pages/NNNN"); process.exit(1); }
    editions = [{ year: parseInt(ym[1], 10), name: `${ym[1]} First Tee Miami Doral Jr. Classic`, leagueId: args.league || null, primaryPageId: pm[1], pageIds: [pm[1]], sourceUrl: args.url }];
  } else {
    console.error("USO: --year YYYY | --all | --url <pageUrl> [--league NNNN] [--out file.json]");
    process.exit(1);
  }

  console.log(`\n🏌️  Scraper Doral v3 — ${editions.length} edição(ões)`);
  console.log(`   Headless: ${HEADLESS}`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  for (const ed of editions) {
    console.log(`\n\n==== ${ed.year} - ${ed.name} ====`);
    try {
      const output = await scrapeEdition(ed, page, context, { division: args.division, limit: args.limit });
      const outFile = args.out || path.join(OUTPUT_DIR, `ftm_doral_${ed.year}.json`);
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, JSON.stringify(output, null, 2), "utf-8");
      const totalJ  = output.divisions.reduce((a, d) => a + d.players.length, 0);
      const totalOk = output.divisions.reduce((a, d) => a + d.players.filter((p) => p.rounds.length > 0).length, 0);
      console.log(`\n[OK] ${ed.year}: ${output.divisions.length} divisoes, ${totalJ} jogadores, ${totalOk} com scorecards`);
      console.log(`     -> ${outFile}`);
    } catch (err) {
      console.error(`\n[ERR] ${ed.year}: ${err.message}`);
    }
  }
  await browser.close();
  console.log("\nConcluido!");
})();
