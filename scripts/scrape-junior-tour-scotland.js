/**
 * scripts/scrape-junior-tour-scotland.js
 *
 * Scraper Node-puro de Junior Tour Scotland (juniortourscotland.com).
 *
 * Estrutura do site (DotGolf + HTML colado do Excel):
 *   - /YEAR-events   → 1 tabela outer com 13 events (tabelas aninhadas em algumas células
 *                       para notas "Ballot/Closing Early") + 1 tabela de contactos
 *   - /YEAR-results  → PDFs por evento + tabelas inline
 *   - /YEAR-oom-s    → PDFs ("Boys OOM for web alyth.pdf") + texto descritivo
 *
 * v2 (2026-05-28): parser nesting-aware (strip nested tables) + download de PDFs.
 *
 * USO:
 *   node scripts/scrape-junior-tour-scotland.js                  # ano corrente
 *   node scripts/scrape-junior-tour-scotland.js --year 2025      # historico
 *   node scripts/scrape-junior-tour-scotland.js --year 2026,2025
 *   node scripts/scrape-junior-tour-scotland.js --year 2026 --download-pdfs
 *
 * Output:
 *   public/data/scotland-jts-{year}-events.json
 *   public/data/scotland-jts-{year}-results.json   (links + PDFs)
 *   public/data/scotland-jts-{year}-oom.json       (links + PDFs)
 *   public/data-archive/jts-pdfs/{year}/*.pdf      (se --download-pdfs)
 */

const fs = require("fs");
const path = require("path");

const OUT_DIR = path.resolve(__dirname, "../public/data");
const PDF_DIR_BASE = path.resolve(__dirname, "../public/data-archive/jts-pdfs");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = "https://www.juniortourscotland.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/* ──────────────────────── HTTP ──────────────────────── */

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return await res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/* ──────────────────────── HTML helpers ──────────────────────── */

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Strip nested tables: replace every `<table>...</table>` that has another `<table` inside
 * its boundary with just the inner text. Iterative — handles arbitrary nesting depth.
 */
function flattenNestedTables(html) {
  let prev = "";
  let cur = html;
  let safety = 20;
  while (cur !== prev && safety-- > 0) {
    prev = cur;
    // Match innermost <table>...</table> (no nested <table> inside)
    cur = cur.replace(/<table\b[^>]*>((?:(?!<\/?table\b)[\s\S])*?)<\/table>/gi, (full, inner) => {
      // If this is at the document-root level (we'll detect via depth scan later), keep it.
      // For now, just return the inner content as a marker we can find later.
      // Actually, we want to KEEP top-level tables. So mark inner tables differently.
      return "<!--TABLE_INNER_START-->" + inner + "<!--TABLE_INNER_END-->";
    });
  }
  // Replace the markers back with the inner content (effectively stripping inner tables)
  return cur
    .replace(/<!--TABLE_INNER_START-->/g, " ")
    .replace(/<!--TABLE_INNER_END-->/g, " ");
}

/**
 * Better approach: depth-aware tokenizer that splits the HTML into OUTER-level tables.
 */
function extractOuterTables(html) {
  const opens = [];
  for (const m of html.matchAll(/<table\b[^>]*>/gi)) opens.push({ kind: "open", pos: m.index, end: m.index + m[0].length });
  for (const m of html.matchAll(/<\/table\b[^>]*>/gi)) opens.push({ kind: "close", pos: m.index, end: m.index + m[0].length });
  opens.sort((a, b) => a.pos - b.pos);

  const outer = [];
  let depth = 0;
  let curStart = -1;
  for (const tok of opens) {
    if (tok.kind === "open") {
      if (depth === 0) curStart = tok.end;
      depth++;
    } else {
      depth--;
      if (depth === 0 && curStart !== -1) {
        outer.push(html.substring(curStart, tok.pos));
        curStart = -1;
      }
    }
  }
  return outer;
}

function extractRows(tableHtml) {
  // First flatten any nested tables so their <tr> aren't double-counted
  const flat = flattenNestedTables(tableHtml);
  const rows = [];
  for (const m of flat.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const c of m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      cells.push(stripTags(c[1]));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function extractLinks(html, filter = () => true) {
  const out = [];
  for (const m of html.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeEntities(m[1]);
    const text = stripTags(m[2]);
    if (filter(href, text)) out.push({ href, text });
  }
  return out;
}

/* ──────────────────────── parsers específicos ──────────────────────── */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_FULL = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Parse cell tipo "4th & 5th April" / "12th to 16th October" → range YYYY-MM-DD/DD
 */
function parseDateCell(s, year) {
  const t = s.toLowerCase().replace(/ /g, " ");
  // Find month
  let mon = 0;
  let monLen = 0;
  for (const [name, num] of Object.entries(MONTH_FULL)) {
    if (t.includes(name)) { mon = num; monLen = name.length; break; }
  }
  if (!mon) {
    for (const [name, num] of Object.entries(MONTHS)) {
      if (new RegExp(`\\b${name}\\b`).test(t)) { mon = num; break; }
    }
  }
  if (!mon) return { raw: s, start: null, end: null };

  const dayNums = [...t.matchAll(/(\d{1,2})(?:st|nd|rd|th)?/g)].map((m) => parseInt(m[1], 10));
  if (!dayNums.length) return { raw: s, start: null, end: null };

  const pad = (n) => String(n).padStart(2, "0");
  const start = `${year}-${pad(mon)}-${pad(dayNums[0])}`;
  const end = dayNums.length > 1 ? `${year}-${pad(mon)}-${pad(dayNums[dayNums.length - 1])}` : start;
  return { raw: s, start, end };
}

const HEADER_CELLS_EVENTS = ["event date", "event/venue", "wagr", "entries"];

function isEventsHeaderRow(row) {
  const joined = row.map((c) => c.toLowerCase()).join("|");
  return HEADER_CELLS_EVENTS.filter((h) => joined.includes(h)).length >= 2;
}

function parseEventsTable(rows, year) {
  const events = [];
  let header = null;
  for (const r of rows) {
    if (!header) {
      if (isEventsHeaderRow(r)) header = r.map((s) => s.toLowerCase());
      continue;
    }
    if (r.length < 2) continue;
    // Some rows may have fewer cells than header (variable rowspan). Pad with nulls.
    const padded = [...r];
    while (padded.length < (header.length || 10)) padded.push("");
    const dateCell = padded[0];
    const venueCell = padded[1];
    if (!dateCell || !venueCell) continue;
    if (/^\s*$/.test(dateCell)) continue;
    const dateInfo = parseDateCell(dateCell, year);
    events.push({
      dateRaw: dateCell,
      dateStart: dateInfo.start,
      dateEnd: dateInfo.end,
      venue: venueCell,
      wagrEgr: padded[2] || null,
      satSunSplit: padded[3] || null,
      fieldSize: padded[4] || null,
      entriesToDate: padded[5] || null,
      entriesClose: padded[6] || null,
      drawsAvailable: padded[7] || null,
      dogFriendly: padded[8] || null,
      extra: padded.slice(9).filter(Boolean),
    });
  }
  return events;
}

function parseEventsPage(html, year) {
  const tables = extractOuterTables(html);
  const allEvents = [];
  for (const tbl of tables) {
    const rows = extractRows(tbl);
    if (!rows.length) continue;
    // Skip contact/footer tables
    const flat = rows.flat().join(" ").toLowerCase();
    if (flat.includes("address:") || flat.includes("phone:") || flat.includes("email:")) continue;
    const parsed = parseEventsTable(rows, year);
    if (parsed.length) allEvents.push(...parsed);
  }
  return allEvents;
}

function findPdfsAndLinks(html) {
  // PDFs: scottishgolf.org uploads OR endsWith .pdf
  const pdfs = extractLinks(html, (href) => /\.pdf(\?|$)/i.test(href));
  // Other useful links (results pages, etc.)
  const otherLinks = extractLinks(html, (href, text) =>
    !/\.pdf(\?|$)/i.test(href) &&
    !/^(javascript:|mailto:|tel:|#)/i.test(href) &&
    text && text.length < 100 &&
    /(result|score|leaderboard|round|oom)/i.test(text + " " + href)
  );
  return { pdfs, otherLinks };
}

function parseResultsPage(html, year) {
  const { pdfs, otherLinks } = findPdfsAndLinks(html);
  // Also parse any inline tables (results summary)
  const inlineTables = [];
  for (const tbl of extractOuterTables(html)) {
    const rows = extractRows(tbl);
    const flat = rows.flat().join(" ").toLowerCase();
    if (flat.includes("address:") || flat.includes("phone:")) continue;
    if (rows.length >= 2) inlineTables.push({ rowCount: rows.length, headerRow: rows[0], rows: rows.slice(0, 30) });
  }
  return { year, pdfs, otherLinks, inlineTables };
}

function parseOomPage(html, year) {
  // OOM data lives in PDFs ("Boys OOM for web alyth.pdf") + descriptive text
  const { pdfs, otherLinks } = findPdfsAndLinks(html);

  // Also extract the qualification rules text (between known headings)
  let rulesText = null;
  const ruleMatch = html.match(/Order\s+of\s+Merit[\s\S]*?(?=<h\d|<\/(?:div|section))/i);
  if (ruleMatch) rulesText = stripTags(ruleMatch[0]).substring(0, 2000);

  return { year, pdfs, otherLinks, rulesText };
}

/* ──────────────────────── PDF download ──────────────────────── */

async function downloadPdfs(pdfs, year, opts = {}) {
  if (!pdfs.length) return [];
  const dir = path.join(PDF_DIR_BASE, String(year));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (const { href, text } of pdfs) {
    try {
      const url = href.startsWith("http") ? href : (href.startsWith("/") ? BASE + href : `${BASE}/${href}`);
      const buf = await fetchBuffer(url);
      const safe = (text || path.basename(url.split("?")[0]))
        .replace(/[^a-z0-9._-]+/gi, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase()
        .slice(0, 80);
      const fileName = safe.endsWith(".pdf") ? safe : safe + ".pdf";
      const target = path.join(dir, fileName);
      fs.writeFileSync(target, buf);
      out.push({ url, file: path.relative(path.resolve(__dirname, ".."), target), bytes: buf.length });
      if (opts.verbose) console.log(`    ↓ ${fileName} (${(buf.length / 1024).toFixed(1)}KB)`);
    } catch (e) {
      out.push({ url: href, error: e.message });
    }
  }
  return out;
}

/* ──────────────────────── main ──────────────────────── */

async function scrapeYear(year, opts) {
  console.log(`\n[JTS] ${year}: a descarregar...`);

  // 1) Events
  try {
    const html = await fetchText(`${BASE}/${year}-events`);
    const events = parseEventsPage(html, year);
    fs.writeFileSync(
      path.join(OUT_DIR, `scotland-jts-${year}-events.json`),
      JSON.stringify({ year, scrapedAt: new Date().toISOString(), source: `${BASE}/${year}-events`, events }, null, 2)
    );
    console.log(`  ✓ events: ${events.length}`);
  } catch (e) {
    console.error(`  ✗ events failed: ${e.message}`);
  }

  // 2) Results
  try {
    const html = await fetchText(`${BASE}/${year}-results`);
    const parsed = parseResultsPage(html, year);
    let pdfsDownloaded = [];
    if (opts.downloadPdfs && parsed.pdfs.length) {
      pdfsDownloaded = await downloadPdfs(parsed.pdfs, year, opts);
    }
    fs.writeFileSync(
      path.join(OUT_DIR, `scotland-jts-${year}-results.json`),
      JSON.stringify({ ...parsed, scrapedAt: new Date().toISOString(), source: `${BASE}/${year}-results`, pdfsDownloaded }, null, 2)
    );
    console.log(`  ✓ results: ${parsed.pdfs.length} PDFs, ${parsed.otherLinks.length} links, ${parsed.inlineTables.length} tables` + (pdfsDownloaded.length ? ` (${pdfsDownloaded.length} downloaded)` : ""));
  } catch (e) {
    console.error(`  ✗ results failed: ${e.message}`);
  }

  // 3) Order of Merit
  try {
    const html = await fetchText(`${BASE}/${year}-oom-s`);
    const parsed = parseOomPage(html, year);
    let pdfsDownloaded = [];
    if (opts.downloadPdfs && parsed.pdfs.length) {
      pdfsDownloaded = await downloadPdfs(parsed.pdfs, year, opts);
    }
    fs.writeFileSync(
      path.join(OUT_DIR, `scotland-jts-${year}-oom.json`),
      JSON.stringify({ ...parsed, scrapedAt: new Date().toISOString(), source: `${BASE}/${year}-oom-s`, pdfsDownloaded }, null, 2)
    );
    console.log(`  ✓ oom: ${parsed.pdfs.length} PDFs, ${parsed.otherLinks.length} links` + (pdfsDownloaded.length ? ` (${pdfsDownloaded.length} downloaded)` : ""));
  } catch (e) {
    console.error(`  ✗ oom failed: ${e.message}`);
  }
}

(async () => {
  const args = process.argv.slice(2);
  let years = [new Date().getFullYear()];
  const yearArg = args.find((_, i) => args[i - 1] === "--year");
  if (yearArg) years = yearArg.split(",").map((y) => parseInt(y, 10));
  const downloadPdfs = args.includes("--download-pdfs");
  const verbose = args.includes("--verbose") || args.includes("-v");
  for (const y of years) await scrapeYear(y, { downloadPdfs, verbose });
  console.log("\n[JTS] done.");
})().catch((e) => {
  console.error("[JTS] fatal:", e);
  process.exit(1);
});
