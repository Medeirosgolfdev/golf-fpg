/**
 * scripts/discover-fcg-scope.js
 *
 * Discovery dos torneios da Federació Catalana de Golf (catgolf.com) e
 * extracção dos game IDs de golfdirecto.com referenciados em cada página.
 *
 * Pipeline:
 *   1. GET /ca/campionats/{ano}                 → lista de slugs de torneios
 *   2. GET /ca/campionats/{slug}                → metadata + links golfdirecto
 *   3. extrair gameIds + categoryIds da regex `golfdirecto.com/micro/game/{ID}([?&]category={ID})?`
 *
 * Output: scripts/fcg-scope.json
 *   { generatedAt, source, totalTournaments, totalGames, tournaments: [...] }
 *
 * USO:
 *   node scripts/discover-fcg-scope.js                       # default: anos 2024,2025,2026
 *   node scripts/discover-fcg-scope.js --years 2025,2026
 *   node scripts/discover-fcg-scope.js --years 2024 --keep-non-juvenile
 *   node scripts/discover-fcg-scope.js --slug i-puntuable-zonal-juvenil-rfeg-masculi-2025-2025-02-01
 */

"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const REPO = path.resolve(__dirname, "..");
const SCOPE_OUT = path.join(REPO, "scripts", "fcg-scope.json");

const BASE = "https://www.catgolf.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const HTTP_AGENT = new http.Agent({ keepAlive: true, maxSockets: 6, keepAliveMsecs: 5000 });
const HTTPS_AGENT = new https.Agent({ keepAlive: true, maxSockets: 6, keepAliveMsecs: 5000 });

/* ── CLI ────────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
function argVal(flag, def) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; }
function argFlag(flag) { return args.indexOf(flag) >= 0; }

const CLI_YEARS = argVal("--years", "2024,2025,2026");
const CLI_SLUG = argVal("--slug", null);
const KEEP_NON_JUVENILE = argFlag("--keep-non-juvenile");
const DELAY_MS = parseInt(argVal("--delay", "300"), 10);

/* ── HTTP helper ────────────────────────────────────────────────────────── */
function httpGet(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const isHttps = url.protocol === "https:";
    const req = (isHttps ? https : http).request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: "GET",
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ca,es;q=0.9,en;q=0.8",
        "Referer": BASE + "/ca/",
      },
      agent: isHttps ? HTTPS_AGENT : HTTP_AGENT,
      timeout: 30000,
    }, (res) => {
      // Follow redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith("http") ? res.headers.location : (BASE + res.headers.location);
        res.resume();
        return httpGet(loc).then(resolve, reject);
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Parsing ────────────────────────────────────────────────────────────── */

// Lista anual: o HTML tem `<a href="/ca/campionats/{slug}">` (sem texto inline,
// o slug encoda a data como sufixo `-YYYY-MM-DD`).
function parseYearList(html) {
  const out = [];
  const RE = /href="\/ca\/campionats\/([a-z][a-z0-9-]+?)"/g;
  let m;
  const seen = new Set();
  while ((m = RE.exec(html)) !== null) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    // Extrair data do sufixo do slug (YYYY-MM-DD nos últimos 10 chars)
    const dateMatch = /-(\d{4})-(\d{2})-(\d{2})$/.exec(slug);
    const dateIso = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null;
    const dateRaw = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null;
    out.push({ slug, dateRaw, dateIso, name: null, url: BASE + "/ca/campionats/" + slug });
  }
  return out;
}

function dateIsoFromCat(dd_mm_yyyy) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dd_mm_yyyy);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Página de torneio: extrair organizador, sede, datas, tipos+categorias, links golfdirecto
function parseTournamentPage(html, slug) {
  const out = { slug, title: null, organizer: null, sede: null, dateStart: null, dateEnd: null, modalitat: null, tipus: null, agePills: [], games: [] };

  // Title (h1)
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(html);
  if (h1) out.title = h1[1].trim();

  // Metadata simples (li com "Organitzador:", "Seu:", "Data inici:", etc.)
  const meta = (rx) => { const m = rx.exec(html); return m ? m[1].trim() : null; };
  out.organizer = meta(/Organitzador:\s*([^<\n]+)</) || null;
  out.sede = (() => {
    const m = /Seu:\s*(?:<a[^>]*>)?([^<\n]+?)(?:<\/a>)?[\s,]/.exec(html);
    return m ? m[1].trim() : null;
  })();
  const dStart = meta(/Data inici:\s*([0-9-]+)\s*</);
  const dEnd = meta(/Data fi:\s*([0-9-]+)\s*</);
  out.dateStart = dStart && dateIsoFromCat(dStart);
  out.dateEnd = dEnd && dateIsoFromCat(dEnd);
  out.modalitat = meta(/Modalitat:\s*([^<\n]+)</);
  out.tipus = meta(/Tipus:\s*([^<\n]+)</);

  // Age pills (CAD/INF/ALV/BNJ etc) — costumam aparecer como <li>CAD</li>
  // Como há muitos <li> na sidebar, restrinjir aos que aparecem isolados (3-3 chars maiúscula)
  const PILL_RE = /<li[^>]*>\s*([A-Z]{3})\s*<\/li>/g;
  let pm; const validPills = new Set(["CAD", "INF", "ALV", "BNJ", "PRO", "SNR", "M-A", "MYR", "B&G"]);
  while ((pm = PILL_RE.exec(html)) !== null) {
    if (validPills.has(pm[1])) out.agePills.push(pm[1]);
  }
  out.agePills = Array.from(new Set(out.agePills));

  // Golfdirecto game IDs + category IDs
  // Pattern: golfdirecto.com/micro/game/{24hex}/{section}?lang=...&category={24hex}
  const GD_RE = /golfdirecto\.com\/micro\/game\/([0-9a-f]{24})(?:\/([a-z\/-]+))?(?:[?&][^"'\s]*?category=([0-9a-f]{24}))?[^"'\s]*/gi;
  const seen = new Map(); // gameId → { section, categories: Set }
  let gm;
  while ((gm = GD_RE.exec(html)) !== null) {
    const gameId = gm[1];
    const section = gm[2] || null;
    const catId = gm[3] || null;
    if (!seen.has(gameId)) seen.set(gameId, { gameId, sections: new Set(), categories: new Set() });
    if (section) seen.get(gameId).sections.add(section);
    if (catId) seen.get(gameId).categories.add(catId);
  }
  out.games = Array.from(seen.values()).map((g) => ({
    gameId: g.gameId,
    sections: Array.from(g.sections),
    hintCategories: Array.from(g.categories),
  }));

  return out;
}

function isJuvenile(t) {
  if (t.agePills && t.agePills.some((p) => ["CAD", "INF", "ALV", "BNJ", "B&G"].includes(p))) return true;
  const txt = ((t.title || "") + " " + (t.slug || "")).toLowerCase();
  return /\b(juvenil|sub-?\d+|infantil|alev[íi]|benjam[íi]|cadete|interclubs boys?|interclubs?\s+girls?|boys.*girls|pro-?am.*alev|pro-?am.*benjam|lliga juvenil|catalunya promeses)\b/.test(txt);
}

/* ── Main ───────────────────────────────────────────────────────────────── */

async function discoverYear(year) {
  const url = `${BASE}/ca/campionats/${year}`;
  console.log(`[disc] year ${year} ─ GET ${url}`);
  const r = await httpGet(url);
  if (r.statusCode !== 200) throw new Error(`HTTP ${r.statusCode} for ${url}`);
  const list = parseYearList(r.body);
  console.log(`[disc] year ${year} ─ ${list.length} tournaments listed`);
  return list;
}

async function discoverTournament(slugOrUrl) {
  const url = slugOrUrl.startsWith("http") ? slugOrUrl : `${BASE}/ca/campionats/${slugOrUrl}`;
  const r = await httpGet(url);
  if (r.statusCode !== 200) throw new Error(`HTTP ${r.statusCode} for ${url}`);
  const slug = slugOrUrl.startsWith("http") ? slugOrUrl.split("/").pop() : slugOrUrl;
  return parseTournamentPage(r.body, slug);
}

async function main() {
  if (CLI_SLUG) {
    const t = await discoverTournament(CLI_SLUG);
    console.log(JSON.stringify(t, null, 2));
    return;
  }

  const years = CLI_YEARS.split(",").map((s) => s.trim()).filter(Boolean);
  const allTourns = [];

  for (const year of years) {
    const list = await discoverYear(year);
    for (const t of list) {
      try {
        const det = await discoverTournament(t.slug);
        // Merge with year-list info
        det.dateRaw = t.dateRaw;
        det.dateIso = det.dateStart || t.dateIso;
        det.name = det.title || t.name;
        det.year = parseInt(year, 10);
        det.url = t.url;
        det.juvenile = isJuvenile(det);
        allTourns.push(det);
        if (det.games.length > 0) {
          console.log(`[disc]   ${t.slug} ─ ${det.games.length} game(s), juvenile=${det.juvenile}`);
        } else {
          console.log(`[disc]   ${t.slug} ─ no golfdirecto links (juvenile=${det.juvenile})`);
        }
      } catch (e) {
        console.warn(`[disc]   ${t.slug} ─ ERROR: ${e.message}`);
      }
      await sleep(DELAY_MS);
    }
  }

  // Filtrar para juveniles por default; se --keep-non-juvenile inclui tudo
  let final = allTourns;
  if (!KEEP_NON_JUVENILE) final = allTourns.filter((t) => t.juvenile);

  const totalGames = final.reduce((acc, t) => acc + t.games.length, 0);
  const out = {
    generatedAt: new Date().toISOString(),
    source: "scripts/discover-fcg-scope.js",
    years,
    keepNonJuvenile: KEEP_NON_JUVENILE,
    totalTournaments: final.length,
    totalGames,
    tournaments: final,
  };

  fs.writeFileSync(SCOPE_OUT, JSON.stringify(out, null, 2));
  console.log(`[disc] wrote ${path.relative(REPO, SCOPE_OUT)} ─ ${final.length} tournaments, ${totalGames} games`);
}

if (require.main === module) {
  main().catch((e) => { console.error("[disc] FATAL:", e.stack || e); process.exit(1); });
}

module.exports = { parseYearList, parseTournamentPage, isJuvenile, dateIsoFromCat };
