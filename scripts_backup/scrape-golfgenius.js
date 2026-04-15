/**
 * scrape-golfgenius.js  v2
 *
 * Correções v2:
 *  - Coluna "total" no leaderboard corrigida (era R1, agora é a 4ª coluna)
 *  - Scorecard aguarda as 2 rondas (waitForFunction com 2 detail_table)
 *  - Boys 8-9: suporte a 9 buracos começando no buraco 10 (só back 9)
 *
 * USO:
 *   node scrape-golfgenius.js
 *   node scrape-golfgenius.js [output.json]
 */

const { chromium } = require("playwright");
const fs = require("fs");

/* ─── Config ───
   Uso: node scrape-golfgenius.js [output.json] [page_url]
   Exemplos:
     node scrape-golfgenius.js ftm_doral_2025.json
     node scrape-golfgenius.js ftm_doral_2024.json https://2024firstteemiamidoraljrclassic.golfgenius.com/pages/4894994
─── */
const DELAY_MS    = 400;

const DIVISIONS = [
  { key: "Boys+8-9",   label: "Boys 8-9",   name: "Boys 8 & 9 Division",   nineHoleOnly: true,  startingHole: 10 },
  { key: "Boys+10-11", label: "Boys 10-11", name: "Boys 10 & 11 Division", nineHoleOnly: false },
  { key: "Boys+12-13", label: "Boys 12-13", name: "Boys 12 & 13 Division", nineHoleOnly: false },
];

/* Par por buraco para cada divisão (fixo por campo/escalão)
   Fonte: Tournament Yardage Card 2025
   Boys 8-9  → Red Tiger   H10-H18
   Boys 10-11 → Golden Palm H1-H18
   Boys 12-13 → Silver Fox  H1-H18  */
const DIVISION_PAR = {
  "Boys+8-9":   { par: [5,3,5,4,3,4,3,4,5],                          parTotal: 36, startingHole: 10 },
  "Boys+10-11": { par: [4,5,4,5,4,4,3,4,3, 4,5,3,4,4,3,5,3,4],      parF9: 36, parB9: 35, parTotal: 71 },
  "Boys+12-13": { par: [4,4,5,3,4,4,3,4,4, 4,5,4,4,4,3,5,3,4],      parF9: 35, parB9: 36, parTotal: 71 },
};

// URLs por defeito (2025) — sobrepostos pelo argumento de linha de comandos
const DEFAULT_PAGE_URL = "https://2025firstteemiamidoraljrclassic.golfgenius.com/pages/5506943";
const DEFAULT_OUT      = "golfgenius_scorecards.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function widgetUrl(base, leagueId, pageId, divKey) {
  return (
    `${base}/leagues/${leagueId}/widgets/customized_tournament_results` +
    `?division=${divKey}&page_id=${pageId}&shared=false`
  );
}

/* ═══════════════════════════════════════════════════════════
   LEADERBOARD
   Colunas após a célula do jogador:
     [0] Total To Par  (+6 / E / -2)
     [1] R1 gross      (74)
     [2] R2 gross      (74)
     [3] T (total)     (148)
   ═══════════════════════════════════════════════════════════ */
async function fetchLeaderboard(page, base, leagueId, pageId, divKey) {
  await page.goto(widgetUrl(base, leagueId, pageId, divKey), { waitUntil: "domcontentloaded" });
  await page
    .waitForSelector('a[href*="tournaments2/details"]', { timeout: 20_000 })
    .catch(() => {});
  await sleep(800);

  return page.evaluate(() => {
    const players = [];
    const links = document.querySelectorAll('a[href*="tournaments2/details"]');

    for (const link of links) {
      const href = link.getAttribute("href") || "";
      const idMatch = href.match(/\/tournaments2\/details\/(\d+)/);
      if (!idMatch) continue;
      const id = idMatch[1];

      // Nome limpo
      const clone = link.cloneNode(true);
      clone.querySelectorAll("i, img, span, svg").forEach((el) => el.remove());
      const name = clone.textContent.replace(/\s+/g, " ").trim();
      if (!name) continue;

      // Linha da tabela
      const tr = link.closest("tr");
      if (!tr) {
        players.push({ id, name, country: "", birthYear: null, pos: null, toPar: null, grossTotal: null, r1Gross: null, r2Gross: null });
        continue;
      }

      const allCells = Array.from(tr.querySelectorAll("td"));
      const pos = parseInt(allCells[0]?.textContent.trim(), 10) || null;

      // País + ano nascimento (texto da célula do nome, fora do link)
      const nameCell = link.closest("td");
      let country = "";
      let birthYear = null;
      if (nameCell) {
        const afterLink = nameCell.textContent.replace(/\s+/g, " ").trim()
          .replace(name, "").trim();
        // "Mexico, 2032" | "United States, 2033" | "United States"
        const cyMatch = afterLink.match(/([A-Za-z][A-Za-z ]+?)(?:,\s*(\d{4}))?$/);
        if (cyMatch?.[1]?.trim().length > 1) {
          country = cyMatch[1].trim();
          birthYear = cyMatch[2] ? parseInt(cyMatch[2], 10) : null;
        }
      }

      // Células após a célula do nome
      const nameCellIdx = nameCell ? allCells.indexOf(nameCell) : 1;
      const after = allCells
        .slice(nameCellIdx + 1)
        .map((td) => td.textContent.replace(/\s+/g, " ").trim());

      // [0]=toPar  [1]=R1  [2]=R2  [3]=Total
      const toParTxt = after[0] || "";
      const toPar      = toParTxt === "E" ? 0 : parseInt(toParTxt, 10) || null;
      const r1Gross    = parseInt(after[1], 10) || null;
      const r2Gross    = parseInt(after[2], 10) || null;
      const grossTotal = parseInt(after[3], 10) || null;

      players.push({ id, name, country, birthYear, pos, toPar, grossTotal, r1Gross, r2Gross });
    }

    return players;
  });
}

/* ═══════════════════════════════════════════════════════════
/* ═══════════════════════════════════════════════════════════
   SCORECARD — intercepção do HTML bruto via page.route()
   O JS do Golf Genius remove a 2ª ronda do DOM após render.
   Capturamos o HTML antes do JS actuar.
   ═══════════════════════════════════════════════════════════ */
async function fetchScorecard(base, pageId, playerId, nineHoleOnly, startingHole) {
  const url =
    `${base}/tournaments2/details/${playerId}` +
    `?round_index=&player_stats_for_portal=true`;

  // O HTML bruto já contém as 2 rondas — fetch Node.js directo, sem browser
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Referer": `${base}/pages/${pageId}`,
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return parseScorecard(html, nineHoleOnly, startingHole);
}

/* ═══════════════════════════════════════════════════════════
   PARSE SCORECARD (regex sobre HTML bruto)
   18 buracos: [label, h1-h9, Out, h10-h18, In, Total] = 22 cols
   9 buracos (Boys 8-9, buraco 10): scores em células 11-19
   ═══════════════════════════════════════════════════════════ */
function parseScorecard(html, isNineHole, startingHole) {
  const rounds = [];
  const tableRe = /<table[^>]+class=["'][^"']*detail_table[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRe.exec(html)) !== null) {
    const tableHtml = tableMatch[0];

    /* ── Data + campo ── */
    const hm = /<tr[^>]+class=[\"']header_row[\"'][^>]*>([\s\S]*?)<\/tr>/i.exec(tableHtml);
    let date = "", course = "";
    if (hm) {
      const txt = hm[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
        cells.push(c[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim());

      if (cells.length < 22) continue;

      // Data de cada ronda vem de cells[0]
      const rowDateMatch = cells[0].match(/^([A-Za-z]+,\s+[A-Za-z]+\s+\d+)/);
      const rowDate = rowDateMatch ? rowDateMatch[1].trim() : date;

      if (!isNineHole) {
        /* 18 buracos */
        const front9 = [];
        for (let i = 1; i <= 9; i++) { const n = parseInt(cells[i], 10); if (!isNaN(n) && n >= 1 && n <= 15) front9.push(n); }
        const back9 = [];
        for (let i = 11; i <= 19; i++) { const n = parseInt(cells[i], 10); if (!isNaN(n) && n >= 1 && n <= 15) back9.push(n); }
        if (front9.length < 9 || back9.length < 9) continue;
        const f9    = parseInt(cells[10], 10) || front9.reduce((a, b) => a + b, 0);
        const b9    = parseInt(cells[20], 10) || back9.reduce((a, b) => a + b, 0);
        const gross = parseInt(cells[21], 10) || f9 + b9;
        rounds.push({ date: rowDate, course, ...(startingHole ? { startingHole } : {}), scores: [...front9, ...back9], f9, b9, gross });
      } else {
        /* 9 buracos — começa no buraco 10, scores em células 11-19
           cells[1-9] estão vazias, cells[11-19] têm os 9 scores     */
        const nine = [];
        for (let i = 11; i <= 19; i++) { const n = parseInt(cells[i], 10); if (!isNaN(n) && n >= 1 && n <= 15) nine.push(n); }
        if (nine.length < 9) continue;
        const gross = parseInt(cells[20], 10) || nine.reduce((a, b) => a + b, 0);
        rounds.push({ date: rowDate, course, startingHole: 10, scores: nine, gross });
      }
    }
  }

  return rounds;
}


/* ═══════════════════════════════════════════════════════════
   Main
   ═══════════════════════════════════════════════════════════ */
(async () => {
  const args = process.argv.slice(2);
  const outFile  = args[0] || DEFAULT_OUT;
  const pageUrl  = args[1] || DEFAULT_PAGE_URL;

  // Extrair BASE_URL e PAGE_ID do URL fornecido
  const urlMatch = pageUrl.match(/^(https?:\/\/[^\/]+)\/pages\/(\d+)/);
  if (!urlMatch) {
    console.error("❌ URL inválido. Esperado: https://...golfgenius.com/pages/NNNN");
    process.exit(1);
  }
  const BASE_URL = urlMatch[1];
  const PAGE_ID  = urlMatch[2];

  // Detectar LEAGUE_ID a partir do iframe da página de resultados
  console.log("🔍 A detectar League ID...");
  let LEAGUE_ID = null;
  try {
    const res = await fetch(`${BASE_URL}/pages/${PAGE_ID}`, {
      headers: { "User-Agent": "Mozilla/5.0 Chrome/120.0.0.0" }
    });
    const html = await res.text();
    // O iframe tem: /leagues/NNNNNN/widgets/customized_tournament_results
    const m = html.match(/\/leagues\/(\d+)\/widgets\/customized_tournament_results/);
    if (m) { LEAGUE_ID = m[1]; console.log(`   League ID: ${LEAGUE_ID}`); }
    else throw new Error("League ID não encontrado no HTML");
  } catch (err) {
    console.error("❌ Erro ao detectar League ID:", err.message);
    process.exit(1);
  }

  // Extrair ano do domínio
  const yearMatch = BASE_URL.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

  console.log(`\n🏌️  Golf Genius Scraper — First Tee Miami Doral Jr. Classic ${year}`);
  console.log(`   URL: ${pageUrl}`);
  console.log(`   Divisões: ${DIVISIONS.map((d) => d.label).join(", ")}`);
  console.log(`   Output: ${outFile}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  const allDivisions = [];

  for (const div of DIVISIONS) {
    console.log(`\n━━━ ${div.name} ━━━`);

    /* ── Leaderboard ── */
    let lbPlayers;
    try {
      lbPlayers = await fetchLeaderboard(page, BASE_URL, LEAGUE_ID, PAGE_ID, div.key);
    } catch (err) {
      console.error(`  ❌ Erro leaderboard: ${err.message}`);
      continue;
    }

    console.log(`  📋 Jogadores: ${lbPlayers.length}`);
    if (lbPlayers.length === 0) {
      console.warn("  ⚠️  Nenhum jogador encontrado.");
      continue;
    }

    /* ── Scorecards ── */
    const players = [];

    for (let i = 0; i < lbPlayers.length; i++) {
      const lb = lbPlayers[i];

      process.stdout.write(
        `\r  🔍 [${String(i + 1).padStart(2)}/${lbPlayers.length}] ` +
          lb.name.padEnd(28).slice(0, 28) + "  "
      );

      try {
        const rounds = await fetchScorecard(BASE_URL, PAGE_ID, lb.id, div.nineHoleOnly, div.startingHole);
        const nR = rounds.length;

        const formattedRounds = rounds.map((r, idx) => ({
          day: idx + 1,
          date: r.date,
          course: r.course || "",
          ...(r.startingHole ? { startingHole: r.startingHole } : {}),
          scores: r.scores,
          ...(r.f9 != null ? { f9: r.f9 } : {}),
          b9: r.b9,
          gross: r.gross,
        }));

        const computedTotal =
          formattedRounds.length > 0
            ? formattedRounds.reduce((a, r) => a + r.gross, 0)
            : null;
        // Preferir total do leaderboard (mais fiável); fallback para calculado
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
          birthYear: lb.birthYear,
          pos: lb.pos,
          toPar: lb.toPar,
          total,
          r1Gross: lb.r1Gross,
          r2Gross: lb.r2Gross,
          rounds: formattedRounds,
        });
      } catch (err) {
        process.stdout.write(`❌ ${err.message.slice(0, 30)}`);
        players.push({
          id: lb.id,
          name: lb.name,
          country: lb.country,
          birthYear: lb.birthYear,
          pos: lb.pos,
          toPar: lb.toPar,
          total: lb.grossTotal,
          r1Gross: lb.r1Gross,
          r2Gross: lb.r2Gross,
          rounds: [],
          _error: err.message,
        });
      }

      await sleep(DELAY_MS);
    }

    console.log();
    const ok   = players.filter((p) => p.rounds.length > 0).length;
    const ok2  = players.filter((p) => p.rounds.length >= 2).length;
    const errs = players.filter((p) => p._error).length;
    console.log(
      `  ✅ ${players.length} jogadores | ${ok} com scorecards | ${ok2} com 2 rondas | ${errs} erros`
    );

    const parInfo = DIVISION_PAR[div.key] || {};
    allDivisions.push({ division: div.label, name: div.name, ...parInfo, players });
  }

  await browser.close();

  /* ── Output JSON ── */
  const output = {
    tournament: `${year} First Tee Miami Doral Jr. Classic`,
    year,
    source: pageUrl,
    divisions: allDivisions,
  };

  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), "utf-8");

  const totalJ  = allDivisions.reduce((a, d) => a + d.players.length, 0);
  const totalOk = allDivisions.reduce(
    (a, d) => a + d.players.filter((p) => p.rounds.length > 0).length, 0
  );
  const total2r = allDivisions.reduce(
    (a, d) => a + d.players.filter((p) => p.rounds.length >= 2).length, 0
  );

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Concluído!");
  console.log(
    `   ${allDivisions.length} divisões | ${totalJ} jogadores | ${totalOk} com scorecards | ${total2r} com 2 rondas`
  );
  console.log(`   Ficheiro: ${outFile}`);
})();
