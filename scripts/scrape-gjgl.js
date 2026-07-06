/**
 * scripts/scrape-gjgl.js — Scraper Global Junior Golf Live (GJGL)
 *
 * Node puro com fetch built-in. Sem Playwright, sem cheerio.
 *
 * O GJGL é WordPress + The Events Calendar para o calendário, mas os resultados
 * vivem num endpoint legacy PHP:
 *   https://globaljuniorgolflive.com/gjgdb/2021liveScoringresponsive.php?tournamentid={N}
 *
 * Cada torneio tem:
 *   • Um tournamentid interno (ex: 335 = Portuguese Junior Classics 2026)
 *   • Escalões: U14, U18, U23 (filtros via &ak=14|18|23)
 *   • Géneros: gender=0 (all) / 1 (boys) / 2 (girls)
 *   • Leaderboard inline na tabela HTML
 *   • Scorecards hole-by-hole (Score/Difference/PAR) per player
 *
 * Phases:
 *   1) Discovery — para cada slug do catalog: fetch /tournament/{slug}/ →
 *      extrair tournamentid + course + dates do HTML
 *   2) Scrape — para cada (tournamentid, ak in [14,18,23]):
 *      a) fetch livescoring HTML
 *      b) parse leaderboard (pos, country gif id, name, rN, hole, toPar, total, age)
 *      c) parse scorecards inline (player cards com tabelas Round N: Score/Diff/PAR)
 *      d) merge → DivisionData
 *   3) Write — public/data/gjgl/gjgl_{slug}.json
 *
 * Output schema:
 * {
 *   tournament, slug, year, country, section,
 *   tour_url, livescoring_url, gjgl_tournamentid,
 *   start_date, end_date, course,
 *   rounds: int,
 *   par: number[18]|null, parTotal,
 *   divisions: [
 *     { ageGroup: "U14", ak: 14, players: [
 *         { pos, country, countryGif, gender, name, club?, hcp?,
 *           r1, r2, r3, hole, toPar, total,
 *           rounds: [{ day, scores[18]|null, par[18]|null, gross }]
 *         }
 *       ]
 *     }
 *   ]
 * }
 *
 * USO:
 *   node scripts/scrape-gjgl.js                          # tudo (discovery + scrape)
 *   node scripts/scrape-gjgl.js --year 2025              # filtrar por ano
 *   node scripts/scrape-gjgl.js --slug gjg-portuguese-junior-classics-2026-portugal
 *   node scripts/scrape-gjgl.js --slugs A,B,C            # vários slugs
 *   node scripts/scrape-gjgl.js --skip-existing          # idempotente
 *   node scripts/scrape-gjgl.js --discovery-only         # só descobrir tournamentids
 *   node scripts/scrape-gjgl.js --aks 14                 # só U14 (default: 14,18,23)
 *   node scripts/scrape-gjgl.js --tid 335 --slug X       # ad-hoc (skip discovery)
 *   node scripts/scrape-gjgl.js --concurrency 4          # paralelismo (default 3)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "public/data/gjgl-catalog.json");
const OUT_DIR = path.join(ROOT, "public/data/gjgl");
const GJGL_BASE = "https://globaljuniorgolflive.com";

const DEFAULT_AKS = [14, 18, 23];

const COUNTRY_GIF_MAP = {
  // mapeamento ssl.globaljuniorgolf.com/data/nationen/{n}.gif → ISO country
  // Inferido a partir de samples observados em torneios reais (2025-2026).
  // Adicionar mais à medida que aparecem novos códigos.
  "10": "AUT", "17": "BEL", "47": "DNK", "57": "EST", "60": "FIN",
  "61": "FRA", "65": "DEU", "75": "GBR", "138": "PRT", "160": "ESP",
  "166": "CHE", "181": "ENG", "182": "FIN", "218": "USA", "256": "CYP",
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parseArgs(argv) {
  const args = { aks: DEFAULT_AKS, concurrency: 3 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--year") { args.year = parseInt(next, 10); i++; }
    else if (a === "--slug") { args.slug = next; i++; }
    else if (a === "--slugs") { args.slugs = next.split(","); i++; }
    else if (a === "--tid") { args.tid = parseInt(next, 10); i++; }
    else if (a === "--aks") { args.aks = next.split(",").map(n => parseInt(n, 10)); i++; }
    else if (a === "--skip-existing") { args.skipExisting = true; }
    else if (a === "--discovery-only") { args.discoveryOnly = true; }
    else if (a === "--allow-future") { args.allowFuture = true; }
    else if (a === "--concurrency") { args.concurrency = parseInt(next, 10); i++; }
    else if (a === "--out-dir") { args.outDir = next; i++; }
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(0, 40).join("\n"));
      process.exit(0);
    }
  }
  return args;
}

function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error(`Catalog not found: ${CATALOG_PATH}`);
  }
  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Write `content` to `finalPath` atomically and verify it round-trips as JSON.
 *  Writes to `tmpPath`, fsyncs, re-reads + JSON.parse to confirm no truncation,
 *  then renames over the target. Throws if verification fails. */
function writeFileAtomicVerified(tmpPath, finalPath, content) {
  const fd = fs.openSync(tmpPath, "w");
  try {
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  // Verify integrity before committing the rename.
  const readBack = fs.readFileSync(tmpPath, "utf8");
  JSON.parse(readBack); // throws on truncation/corruption
  if (readBack.length !== Buffer.byteLength(content)) {
    // length mismatch (multi-byte chars) is fine as long as JSON.parse passed;
    // only guard against obviously short writes.
    if (readBack.length < content.length / 2) {
      throw new Error(`short write: ${readBack.length} < ${content.length}`);
    }
  }
  fs.renameSync(tmpPath, finalPath);
}

async function fetchText(url, { retries = 2, timeoutMs = 30000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; golf-fpg-scraper/1.0)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(800 * (attempt + 1));
    }
  }
  throw lastErr;
}

/* ─────────────────────────────────────────────────────────────────
   Phase 1: Discovery — descobrir tournamentid + course + datas
   por cada tournament page
   ───────────────────────────────────────────────────────────────── */

async function discoverTournament(slug) {
  const url = `${GJGL_BASE}/tournament/${slug}/`;
  let html;
  try {
    html = await fetchText(url);
  } catch (err) {
    return { slug, error: `discovery_fetch_failed: ${err.message}` };
  }

  // tournamentid (extracted from LIVE SCORING or RESULTS link)
  const tidMatch = html.match(/tournamentid=(\d+)/);
  const tid = tidMatch ? parseInt(tidMatch[1], 10) : null;

  // Dates: "Nov 19 - Nov 22 2026" or similar
  const dateMatch = html.match(/([A-Z][a-z]{2})\s+(\d{1,2})\s*[-–]\s*(?:([A-Z][a-z]{2})\s+)?(\d{1,2})\s+(\d{4})/);
  let startDate = null, endDate = null;
  if (dateMatch) {
    const [, mon1, d1, mon2, d2, y] = dateMatch;
    startDate = isoDate(y, mon1, d1);
    endDate = isoDate(y, mon2 || mon1, d2);
  }

  // Course name: the venue logo's <img alt> follows the pattern
  //   "{Course Name} – Logo"  (en-dash) or "{Course Name} - Logo" (hyphen)
  // e.g. alt="West Cliffs Golf Course – Logo". Confirmed via Chrome 2026-05-19.
  // Exclude the site logo ("Global Junior Golf Logo") and tournament-series
  // logos (which start with "Logo ...").
  let course = null;
  const altRe = /<img[^>]*\balt="([^"]*?)\s*[–-]\s*Logo"[^>]*>/gi;
  let am;
  while ((am = altRe.exec(html)) !== null) {
    const cand = am[1].trim();
    if (!cand) continue;
    if (/global\s+junior\s+golf/i.test(cand)) continue; // site logo
    if (/^logo\b/i.test(cand)) continue;                // tournament-series logo
    course = cand;
    break;
  }

  // Age classes: "Age Classes: 14, 12-18, 19-23"
  const ageClassesMatch = html.match(/Age\s*Classes\s*:\s*([0-9,\s-–]+)/i);
  const ageClasses = ageClassesMatch ? ageClassesMatch[1].trim() : null;

  return { slug, tid, startDate, endDate, course, ageClasses };
}

function isoDate(year, monAbbr, day) {
  const M = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06",
              Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };
  const mm = M[monAbbr] || "01";
  return `${year}-${mm}-${String(day).padStart(2, "0")}`;
}

/* ─────────────────────────────────────────────────────────────────
   Entry list — HCP + Grad Year (ano de graduação ≈ idade) por jogador.
   Fonte: /gjgdb/2021entryList.php?tournamentid={tid}&gender={1=boys|2=girls}
   Colunas: Name(Last, First) / Nation(gif) / Grad Year / HCP / AG.
   O GJGL NÃO publica metros/distâncias em lado nenhum (confirmado 2026-05-19);
   a entry list é a única fonte extra de HCP e idade dos jogadores.
   Match com o leaderboard é por nome normalizado (não há playerKey aqui).
   ───────────────────────────────────────────────────────────────── */

function normNameKey(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normaliza "Last, First" e "First Last" para a mesma chave ordenada por tokens. */
function nameMatchKey(name) {
  const cleaned = normNameKey(name).replace(/[(),.]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = cleaned.split(" ").filter(Boolean).sort();
  return tokens.join(" ");
}

async function scrapeEntryList(tid) {
  const map = new Map(); // nameMatchKey -> { hcp, hcpRaw, gradYear, ag, nationGif }
  for (const gender of [1, 2]) {
    const url = `${GJGL_BASE}/gjgdb/2021entryList.php?tournamentid=${tid}&gender=${gender}`;
    let html;
    try { html = await fetchText(url); } catch { continue; }
    parseEntryListHtml(html, map);
  }
  return map;
}

function parseEntryListHtml(html, map) {
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm;
  while ((rm = rowRe.exec(html)) !== null) {
    const cells = [];
    const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let cm;
    while ((cm = cellRe.exec(rm[1])) !== null) cells.push(cm[1]);
    if (cells.length < 5) continue;
    const name = stripTags(cells[0]).trim();
    if (!name || /name\s*,?\s*first/i.test(name)) continue; // header row
    const gifMatch = (cells[1] || "").match(/nationen\/(\d+)\.gif/);
    const gradYearRaw = stripTags(cells[2]).trim();
    const gradYear = /^\d{4}$/.test(gradYearRaw) ? parseInt(gradYearRaw, 10) : null;
    const hcpRaw = stripTags(cells[3]).trim();           // ex: "+1.0", "-0.9", "+5.9"
    const hcp = hcpRaw && /[-+]?\d/.test(hcpRaw) ? parseFloat(hcpRaw) : null;
    const ag = stripTags(cells[4]).trim() || null;
    const key = nameMatchKey(name);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { hcp, hcpRaw, gradYear, ag, nationGif: gifMatch ? gifMatch[1] : null });
    }
  }
}

/* ─────────────────────────────────────────────────────────────────
   Phase 2: Scrape — leaderboard + scorecards do livescoring page
   ───────────────────────────────────────────────────────────────── */

async function scrapeDivision(tid, ak) {
  const url = `${GJGL_BASE}/gjgdb/2021liveScoringresponsive.php?tournamentid=${tid}&gender=0&dak=0&ak=${ak}`;
  let html;
  try {
    html = await fetchText(url);
  } catch (err) {
    return { ak, error: `fetch_failed: ${err.message}`, players: [] };
  }
  return parseDivisionHtml(html, ak);
}

function parseDivisionHtml(html, ak) {
  const players = [];
  const tableMatch = html.match(/<table[^>]*class="[^"]*ranking[^"]*"[^>]*>([\s\S]*?)<\/table>/i)
    || html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);

  // Extract leaderboard rows. Each row has:
  //  <tr>
  //    <td class="pos">1</td>
  //    <td><img src=".../nationen/N.gif"></td>
  //    <td><a href="javascript:displayPlayer('player_X_Y')">Name, First (m)</a></td>
  //    <td>R1</td><td>R2</td>...<td>Hole</td><td>ToPar</td><td>Total</td><td>AgeGroup</td>
  //  </tr>
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  const rows = [];
  while ((rowMatch = rowRe.exec(html)) !== null) {
    rows.push(rowMatch[1]);
  }

  for (const rowHtml of rows) {
    if (!/displayPlayer/.test(rowHtml)) continue;

    const cells = [];
    const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let cm;
    while ((cm = cellRe.exec(rowHtml)) !== null) cells.push(cm[1]);

    if (cells.length < 6) continue;

    const pos = stripTags(cells[0]).trim();

    // Locate the NAME cell dynamically: the cell that contains the displayPlayer link.
    // Real GJGL row layout (confirmed via Chrome 2026-05-19):
    //   [0]Pos  [1]<img nationen/N.gif>  [2]<!-- /* CountryName */ -->  [3]Name+displayPlayer
    //   [4..]R1..Rn  [Hole]  [ToPar]  [Total]  [AgeGroup]  [AG]
    // cell[2] is a non-empty HTML comment with the country name, so a fixed
    // cells[2]||cells[3] picked the WRONG cell → playerKey was null → scorecards
    // never matched → rounds=0. Find the name cell by its content instead.
    const nameIdx = cells.findIndex(c => /displayPlayer/.test(c));
    if (nameIdx < 0) continue;
    const nameCell = cells[nameIdx];
    const playerKey = (nameCell.match(/player_([^']+)'/) || [])[1] || null;
    const nameRaw = stripTags(nameCell).trim();
    const gMatch = nameRaw.match(/\(([mf])\)\s*$/i);
    const gender = gMatch ? gMatch[1].toLowerCase() : null;
    const name = nameRaw.replace(/\s*\([mf]\)\s*$/i, "").trim();

    // Country: prefer the text comment in an earlier cell (/* Portugal */),
    // fallback to the flag-gif id mapping.
    const gifMatch = (cells.slice(0, nameIdx).join("")).match(/nationen\/(\d+)\.gif/);
    const countryGif = gifMatch ? gifMatch[1] : null;
    let country = null;
    for (let ci = 0; ci < nameIdx; ci++) {
      const cm2 = stripTags(cells[ci]).match(/\/\*\s*([^*]+?)\s*\*\//);
      if (cm2) { country = cm2[1].trim(); break; }
    }
    if (!country) country = countryGif ? (COUNTRY_GIF_MAP[countryGif] || `gif:${countryGif}`) : null;

    // Numeric cells start immediately AFTER the name cell.
    const numericCells = cells.slice(nameIdx + 1).map(c => stripTags(c).trim());
    // Drop trailing duplicate Age columns: keep all but they're parsed by position
    // Typical layout: R1, R2, R3, Hole, ToPar, Total, AgeGroupRaw, AG
    const len = numericCells.length;
    if (len < 5) continue;

    // Determine rounds count: total numeric cells minus 5 trailing (Hole, ToPar, Total, AG, AG)
    // OR minus 4 if no duplicate AG column.
    let nRounds;
    if (len >= 8) nRounds = len - 5; // R1..Rn + Hole + ToPar + Total + AgeGroup + AG
    else nRounds = len - 4;          // R1..Rn + Hole + ToPar + Total + AgeGroup

    const rs = [];
    for (let i = 0; i < nRounds; i++) rs.push(parseScore(numericCells[i]));
    const hole = parseInt(numericCells[nRounds], 10);
    const toPar = parseToPar(numericCells[nRounds + 1]);
    const total = parseInt(numericCells[nRounds + 2], 10);
    const ageGroup = numericCells[nRounds + 3] || null;

    players.push({
      pos: pos === "*" ? null : (parseInt(pos, 10) || null),
      tiedFlag: pos === "*",
      country, countryGif,
      gender,
      name,
      playerKey,
      rounds_scores: rs,           // array of R1..Rn gross (number or null)
      hole: Number.isNaN(hole) ? null : hole,
      toPar,
      total: Number.isNaN(total) ? null : total,
      ageGroup,
    });
  }

  // Parse per-player scorecards (panels emitted inline below the leaderboard)
  // Each panel starts with: <div id="player_X_Y" ...> or <... displayPlayer('player_X_Y')>
  // Inside: <table> rows for Round N with Score/Difference/PAR
  const scorecards = parsePlayerScorecards(html);

  // Attach scorecards to players by playerKey
  for (const p of players) {
    if (!p.playerKey) continue;
    const sc = scorecards.get(p.playerKey);
    if (sc) {
      p.club = sc.club;
      p.hcp = sc.hcp;
      p.rounds = sc.rounds;
    } else {
      p.rounds = p.rounds_scores.map((gross, i) => ({
        day: i + 1,
        scores: null, par: null, gross,
      }));
    }
    delete p.rounds_scores;
  }

  return { ak, ageGroup: `U${ak}`, players };
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

function parseScore(s) {
  if (!s || s === "-" || s === "") return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

function parseToPar(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (t === "0" || t === "E") return 0;
  if (/^WD|NR|DQ|MC|NS$/i.test(t.replace(/^\+/, ""))) return t.replace(/^\+/, "");
  const m = t.match(/([+-]?\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/* Parse scorecard panels — each player has 1+ Round tables with Score/Difference/PAR.
 *
 * The GJGL livescoring HTML emits each player's scorecard inside an element
 * (typically <div> or <tr>) with id="player_Name_Last". The content includes
 * nested <table>s with Round tables. We don't try to match balanced tags —
 * we slice the HTML between consecutive id="player_..." anchors and parse
 * each slice independently. Anything after the last anchor is dropped.
 */
function parsePlayerScorecards(html) {
  const out = new Map();

  const anchorRe = /id\s*=\s*"player_([^"]+)"/gi;
  const anchors = [];
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    anchors.push({ key: m[1], start: m.index });
  }
  if (!anchors.length) return out;

  for (let i = 0; i < anchors.length; i++) {
    const { key, start } = anchors[i];
    const end = i + 1 < anchors.length ? anchors[i + 1].start : html.length;
    const slice = html.slice(start, end);

    // Club / HCP — search robustly: label can be in <td>, <strong>, <th>, etc.
    const club = matchLabelValue(slice, /club/i);
    const hcpRaw = matchLabelValue(slice, /^\s*hcp\b/i);
    const hcp = hcpRaw ? parseFloat(hcpRaw) : null;

    const rounds = parseRoundsInPanel(slice);
    out.set(key, { club, hcp: Number.isNaN(hcp) ? null : hcp, rounds });
  }

  return out;
}

/* Find "Label: value" patterns in a slice of HTML. The label and value live
 * in adjacent cells (any combination of <td>, <th>, <strong>, <b>). We scan
 * all <td>/<th> cells in order and return the cell that follows the matching
 * label cell. */
function matchLabelValue(slice, labelRe) {
  const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
  const cells = [];
  let m;
  while ((m = cellRe.exec(slice)) !== null) cells.push(stripTags(m[1]).trim());
  for (let i = 0; i < cells.length - 1; i++) {
    if (labelRe.test(cells[i].replace(/[:\s]+$/, ""))) {
      return cells[i + 1] || null;
    }
  }
  return null;
}

function parseRoundsInPanel(inner) {
  const rounds = [];
  // Find all <table> ... </table> in the panel
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  const tables = inner.match(tableRe) || [];

  let currentRoundNum = 0;
  for (const tbl of tables) {
    const roundMatch = tbl.match(/Round\s+(\d+)/i);
    if (!roundMatch) continue; // not a round table
    const day = parseInt(roundMatch[1], 10);
    if (day === currentRoundNum) continue; // duplicate (template emits twice in some pages)
    currentRoundNum = day;

    // Extract numeric rows. Each row is: <tr><td>Label</td><td>v1</td>...<td>vN</td><td>Total</td></tr>
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows = [];
    let rm;
    while ((rm = rowRe.exec(tbl)) !== null) rows.push(rm[1]);

    let scoreRow = null, parRow = null;
    for (const r of rows) {
      const label = stripTags(r.split(/<\/td>/i)[0]).trim().toLowerCase();
      if (/^score/.test(label)) scoreRow = r;
      else if (/^par/.test(label)) parRow = r;
    }
    if (!scoreRow || !parRow) continue;

    const scores = extractRowNumbers(scoreRow);
    const pars = extractRowNumbers(parRow);
    if (!scores.length || !pars.length) continue;

    // Last cell is total; the rest are hole-by-hole
    const gross = scores[scores.length - 1];
    const parTotal = pars[pars.length - 1];
    const holeScores = scores.slice(0, scores.length - 1);
    const holePars = pars.slice(0, pars.length - 1);

    // Normalise to 18 holes (pad with null if 9H)
    const scores18 = pad18(holeScores);
    const par18 = pad18(holePars);

    rounds.push({ day, scores: scores18, par: par18, gross, parTotal });
  }
  return rounds;
}

function extractRowNumbers(rowHtml) {
  const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
  const cells = [];
  let m;
  while ((m = cellRe.exec(rowHtml)) !== null) cells.push(stripTags(m[1]).trim());
  // Skip the first cell (label)
  return cells.slice(1).map(c => {
    if (!c || c === "-") return null;
    const n = parseInt(c.replace(/^[+]/, ""), 10);
    return Number.isNaN(n) ? null : n;
  }).filter(x => x !== null && !isNaN(x));
}

function pad18(arr) {
  if (arr.length >= 18) return arr.slice(0, 18);
  return [...arr, ...Array(18 - arr.length).fill(null)];
}

/* ─────────────────────────────────────────────────────────────────
   Phase 3: Pipeline — orchestrate discovery + scrape + write
   ───────────────────────────────────────────────────────────────── */

async function processTournament(t, args) {
  const outPath = path.join(args.outDir || OUT_DIR, `gjgl_${t.slug}.json`);

  if (args.skipExisting && fs.existsSync(outPath)) {
    console.log(`  ↷ skip (exists): ${t.slug}`);
    return { slug: t.slug, status: "skipped" };
  }

  // Discovery
  let tid = args.tid;
  let startDate, endDate, course, ageClasses;
  if (!tid) {
    const disc = await discoverTournament(t.slug);
    if (disc.error) {
      console.log(`  ✗ discovery: ${t.slug} — ${disc.error}`);
      return { slug: t.slug, status: "discovery_failed", error: disc.error };
    }
    if (!disc.tid) {
      console.log(`  ⚠ no tournamentid for ${t.slug} (probably no results published yet)`);
      return { slug: t.slug, status: "no_tid" };
    }
    tid = disc.tid;
    startDate = disc.startDate;
    endDate = disc.endDate;
    ageClasses = disc.ageClasses;
    course = disc.course;
  }

  if (args.discoveryOnly) {
    return { slug: t.slug, status: "discovered", tid, startDate, endDate, ageClasses };
  }

  // Guard: eventos futuros não têm resultados reais. A página do evento futuro
  // na GJGL reaponta o link de live-scoring para o `tournamentid` da edição do
  // ano anterior — se scrapássemos, gravaríamos os resultados do ano passado com
  // uma data futura (torneios-fantasma). Só scrapamos resultados quando o evento
  // já começou. Override explícito via `--allow-future` (ex: re-scrape manual).
  if (!args.allowFuture && startDate) {
    const todayISO = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, hora local
    if (startDate > todayISO) {
      console.log(`  ⏭ futuro (${startDate}): ${t.slug} — sem resultados reais ainda, saltado`);
      return { slug: t.slug, status: "future", tid, startDate, endDate };
    }
  }

  // Scrape each age group
  const divisions = [];
  let detectedRounds = 0;
  let firstPar = null;
  for (const ak of args.aks) {
    const div = await scrapeDivision(tid, ak);
    if (div.error) {
      console.log(`    · U${ak}: ${div.error}`);
      continue;
    }
    if (!div.players.length) continue;
    divisions.push(div);
    // Detect rounds count + par from first player with full scorecard
    for (const p of div.players) {
      if (p.rounds && p.rounds.length > detectedRounds) detectedRounds = p.rounds.length;
      if (!firstPar && p.rounds && p.rounds[0] && p.rounds[0].par && p.rounds[0].par.some(x => x)) {
        firstPar = p.rounds[0].par;
      }
    }
  }

  if (!divisions.length) {
    console.log(`  ⚠ no division data for ${t.slug} (tid=${tid})`);
    return { slug: t.slug, status: "empty", tid };
  }

  // Enrich players with HCP + Grad Year from the entry list (matched by name).
  let entryMatched = 0, entryTotal = 0;
  try {
    const entryMap = await scrapeEntryList(tid);
    entryTotal = entryMap.size;
    if (entryMap.size) {
      for (const div of divisions) {
        for (const p of div.players) {
          const e = entryMap.get(nameMatchKey(p.name));
          if (e) {
            if (e.hcp != null && p.hcp == null) p.hcp = e.hcp;
            if (e.hcpRaw) p.hcpRaw = e.hcpRaw;
            if (e.gradYear) {
              p.gradYear = e.gradYear;
              // Estimativa de ano de nascimento: grad year - 18 (fim do secundário ~18 anos)
              p.birthYearEst = e.gradYear - 18;
            }
            entryMatched++;
          }
        }
      }
    }
  } catch (err) {
    console.log(`    · entry list failed: ${err.message}`);
  }

  const out = {
    tournament: t.title,
    slug: t.slug,
    year: t.year,
    country: t.country,
    section: t.section,
    tour_url: `${GJGL_BASE}/tournament/${t.slug}/`,
    livescoring_url: `${GJGL_BASE}/gjgdb/2021liveScoringresponsive.php?tournamentid=${tid}`,
    entrylist_url: `${GJGL_BASE}/gjgdb/2021entryList.php?tournamentid=${tid}`,
    gjgl_tournamentid: tid,
    start_date: startDate,
    end_date: endDate,
    course: course || null,
    ageClassesRaw: ageClasses,
    rounds: detectedRounds || 0,
    par: firstPar,
    parTotal: firstPar ? firstPar.filter(x => x).reduce((a, b) => a + b, 0) : null,
    divisions,
    scrapedAt: new Date().toISOString(),
  };

  ensureDir(args.outDir || OUT_DIR);
  // Atomic + verified write: write to .tmp, re-parse to confirm integrity,
  // fsync, then rename over the target. Prevents truncated JSON files if the
  // process is interrupted (e.g. the libuv shutdown assertion on Windows).
  const json = JSON.stringify(out, null, 2);
  const tmpPath = outPath + ".tmp";
  writeFileAtomicVerified(tmpPath, outPath, json);
  const totalPlayers = divisions.reduce((a, d) => a + d.players.length, 0);
  console.log(`  ✓ ${t.slug} — tid=${tid} divs=${divisions.length} players=${totalPlayers} rounds=${detectedRounds} entry=${entryMatched}/${entryTotal}`);
  return { slug: t.slug, status: "ok", tid, players: totalPlayers };
}

async function runQueueConcurrent(items, worker, concurrency) {
  const results = [];
  let idx = 0;
  const runners = Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
    while (idx < items.length) {
      const i = idx++;
      try { results[i] = await worker(items[i]); }
      catch (err) { results[i] = { slug: items[i].slug, status: "error", error: err.message }; }
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  const catalog = loadCatalog();

  let tournaments = catalog.tournaments;
  if (args.year) tournaments = tournaments.filter(t => t.year === args.year);
  if (args.slug) tournaments = tournaments.filter(t => t.slug === args.slug);
  if (args.slugs) tournaments = tournaments.filter(t => args.slugs.includes(t.slug));

  if (!tournaments.length) {
    console.log("No tournaments match filters.");
    process.exit(1);
  }

  console.log(`GJGL scrape: ${tournaments.length} tournaments, aks=[${args.aks.join(",")}], concurrency=${args.concurrency}`);
  ensureDir(args.outDir || OUT_DIR);

  const results = await runQueueConcurrent(tournaments, t => processTournament(t, args), args.concurrency);

  const ok = results.filter(r => r && r.status === "ok").length;
  const skipped = results.filter(r => r && r.status === "skipped").length;
  const empty = results.filter(r => r && r.status === "empty").length;
  const failed = results.filter(r => r && (r.status === "discovery_failed" || r.status === "error")).length;
  const noTid = results.filter(r => r && r.status === "no_tid").length;

  console.log("\nDone. ok=" + ok + " skipped=" + skipped + " empty=" + empty + " failed=" + failed + " no_tid=" + noTid);

  if (!args.discoveryOnly) {
    const tidMap = {};
    for (const r of results) {
      if (r && r.tid) tidMap[r.slug] = r.tid;
    }
    if (Object.keys(tidMap).length) {
      let changed = false;
      for (const t of catalog.tournaments) {
        if (tidMap[t.slug] && t.gjgl_tournamentid !== tidMap[t.slug]) {
          t.gjgl_tournamentid = tidMap[t.slug];
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
        console.log("Catalog updated with " + Object.keys(tidMap).length + " tournamentids.");
      }
    }
  }

  process.exit(failed > 0 && ok === 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(function(err) { console.error(err); process.exit(1); });
}

module.exports = { parseDivisionHtml, discoverTournament, scrapeDivision, scrapeEntryList, parseEntryListHtml, nameMatchKey };
