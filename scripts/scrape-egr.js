/**
 * scripts/scrape-egr.js — Scraper Node-puro do European Golf Rankings.
 *
 * europeangolfrankings.com é HTML renderizado no servidor (sem JS, sem login).
 * Scrapa-se com `fetch` puro — NÃO precisa de browser/Playwright.
 *
 * É um meta-agregador de rankings juvenis europeus. Três vistas úteis:
 *   1. RANKING  — /ranking?per_page=100000 (rapazes) + /ranking_women (raparigas)
 *                 Todos os ~14k jogadores numa request cada: pontos EGR, país,
 *                 escalão ACTUAL, média de score, média-vs-CR, eventos a contar.
 *   2. EVENTS   — /events?year=Y&per_page=100000 lista todos os eventos do ano
 *                 (id, nome, escalão, país, datas, pontos). Cada /events/{id} dá
 *                 o leaderboard completo + CR/par/comprimento do campo.
 *   3. PLAYERS  — /players/{id} dá o histórico cross-circuito completo de um
 *                 jogador (posição, venue, R1-R4, pontos por evento) + clube.
 *
 * ⚠ NÃO há data de nascimento em lado nenhum. Só "Age Group" (escalão actual).
 *   A base de dados tem um campo `born` (dá para ordenar) mas nunca é mostrado.
 *   → matching no kids2 é FRACO (nome+país+clube), como england/gjgl.
 *
 * Outputs:
 *   public/data/egr-ranking.json              (ranking consolidado M+F)
 *   public/data/egr/events/egr_{id}.json      (1 por evento juvenil)
 *   public/data/egr/egr-events-index.json     (índice: archive por ano + scraped)
 *   public/data/egr/players/egr_{id}.json     (só com --players)
 *
 * CLI:
 *   node scripts/scrape-egr.js                       # ranking + eventos juvenis (anos recentes)
 *   node scripts/scrape-egr.js --ranking             # só o ranking
 *   node scripts/scrape-egr.js --events --year 2025 --year 2026
 *   node scripts/scrape-egr.js --events --max-age 18 # só escalões <= U18 (default)
 *   node scripts/scrape-egr.js --events --all-ages   # todos os escalões (inc. U21/U23/Adult)
 *   node scripts/scrape-egr.js --skip-existing       # não re-fetch eventos já guardados
 *   node scripts/scrape-egr.js --players --country Portugal
 *   node scripts/scrape-egr.js --players --id 45760,1414
 *   node scripts/scrape-egr.js --concurrency 6
 *
 * Exit codes: 0 = ok (há output), 2 = sem novidades, 1 = erro.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const BASE = "https://www.europeangolfrankings.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) golf-fpg-egr-scraper";
const DATA_DIR = path.resolve(__dirname, "..", "public", "data");
const EGR_DIR = path.join(DATA_DIR, "egr");
const EVENTS_DIR = path.join(EGR_DIR, "events");
const PLAYERS_DIR = path.join(EGR_DIR, "players");

// ─────────────────────────────────────────────────────────── CLI parsing ──

function parseArgs(argv) {
  const o = {
    ranking: false, events: false, players: false,
    years: [], maxAge: 18, allAges: false,
    skipExisting: false, concurrency: 5,
    country: null, ids: [], limit: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ranking") o.ranking = true;
    else if (a === "--events") o.events = true;
    else if (a === "--players") o.players = true;
    else if (a === "--year") o.years.push(parseInt(argv[++i], 10));
    else if (a === "--max-age") o.maxAge = parseInt(argv[++i], 10);
    else if (a === "--all-ages") o.allAges = true;
    else if (a === "--skip-existing") o.skipExisting = true;
    else if (a === "--concurrency") o.concurrency = Math.max(1, parseInt(argv[++i], 10) || 5);
    else if (a === "--country") o.country = argv[++i];
    else if (a === "--id" || a === "--ids") o.ids.push(...String(argv[++i]).split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--limit") o.limit = parseInt(argv[++i], 10);
    else if (a === "--help" || a === "-h") { o.help = true; }
  }
  // Defaults: sem flags de modo → ranking + eventos.
  if (!o.ranking && !o.events && !o.players) { o.ranking = true; o.events = true; }
  if (!o.years.length) { const y = new Date().getFullYear(); o.years = [y, y - 1]; }
  return o;
}

// ────────────────────────────────────────────────────────────── HTTP ──────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpGet(url, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "en" },
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(500 * (attempt + 1));
    }
  }
  throw new Error(`GET ${url} falhou: ${lastErr && lastErr.message}`);
}

// Corre `tasks` (array de funções () => Promise) com concorrência limitada.
async function pool(tasks, concurrency, onProgress) {
  const results = new Array(tasks.length);
  let idx = 0, done = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try { results[i] = await tasks[i](); }
      catch (err) { results[i] = { error: err.message }; }
      done++;
      if (onProgress) onProgress(done, tasks.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

// ──────────────────────────────────────────────────────── HTML helpers ────

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&aacute;": "á", "&eacute;": "é", "&iacute;": "í", "&oacute;": "ó", "&uacute;": "ú", "&ntilde;": "ñ" };
function decode(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => ENTITIES[m.toLowerCase()] || m)
    .replace(/�/g, ""); // remove replacement char de mojibake
}
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, "");
const stripTags = (html) => html.replace(/<[^>]+>/g, " ");
const clean = (s) => decode(stripTags(s)).replace(/\s+/g, " ").trim();

// Extrai o texto de cada <td> (na ordem) de um bloco <tr>.
function cellTexts(trHtml) {
  const cells = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = re.exec(trHtml)) !== null) cells.push(clean(m[1]));
  return cells;
}
function firstPlayerId(html) {
  const m = html.match(/\/players\/(\d+)/);
  return m ? m[1] : null;
}
const toNum = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/,/g, "").trim();
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
function splitLastFirst(nameCell) {
  // "DE LA RIVA VAZQUEZ, Jorge" → { last, first, display }
  const raw = decode(nameCell).trim();
  const ci = raw.indexOf(",");
  let last = raw, first = "";
  if (ci >= 0) { last = raw.slice(0, ci).trim(); first = raw.slice(ci + 1).trim(); }
  return { last, first, display: first ? `${first} ${titleCase(last)}` : titleCase(last), raw };
}
function titleCase(s) {
  // "DE LA RIVA VAZQUEZ" → "De La Riva Vazquez" (só se maioritariamente maiúsculas)
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const upper = (s.match(/[A-ZÀ-Þ]/g) || []).length;
  if (!letters.length || upper / letters.length < 0.6) return s;
  return s.toLowerCase().replace(/(^|[\s'-])([a-zà-ÿ])/g, (_, p, c) => p + c.toUpperCase());
}
// "U16" → 16, "U14" → 14, "Adult" → 99
function ageNum(ag) {
  if (!ag) return null;
  if (/adult/i.test(ag)) return 99;
  const m = String(ag).match(/U?(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

// ──────────────────────────────────────────────────── RANKING scraping ────

// Uma linha de ranking: [points, name, country, ageGroup, avgScore, avgToCR, eventsCounting]
function parseRankingRows(html, sex) {
  const body = stripComments(html);
  const tbl = (body.match(/<table[\s\S]*?<\/table>/i) || [body])[0];
  const rows = tbl.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const out = [];
  let rank = 0;
  for (const tr of rows) {
    if (!/\/players\/\d+/.test(tr)) continue; // salta header
    const id = firstPlayerId(tr);
    const cells = cellTexts(tr);
    if (cells.length < 7) continue;
    const nm = splitLastFirst(cells[1]);
    rank += 1;
    out.push({
      id,
      sex,
      name: nm.display,
      lastName: nm.last,
      firstName: nm.first,
      country: cells[2] || null,
      ageGroup: cells[3] || null,
      ageNum: ageNum(cells[3]),
      egrPoints: toNum(cells[0]),
      egrRankSex: rank, // posição dentro do ranking do próprio sexo
      avgScore: toNum(cells[4]),
      avgToCR: toNum(cells[5]),
      eventsCounting: toNum(cells[6]),
    });
  }
  return out;
}

async function scrapeRanking() {
  console.log("• Ranking: rapazes (/ranking) + raparigas (/ranking_women)…");
  const [menHtml, womenHtml] = await Promise.all([
    httpGet(`${BASE}/ranking?gender=M&per_page=100000`),
    httpGet(`${BASE}/ranking_women?per_page=100000`),
  ]);
  const men = parseRankingRows(menHtml, "M");
  const women = parseRankingRows(womenHtml, "F");
  console.log(`  → ${men.length} rapazes, ${women.length} raparigas`);
  const players = [...men, ...women];
  const out = {
    generated_at: new Date().toISOString(),
    source: "europeangolfrankings.com",
    note: "Ranking cross-circuito europeu. ageGroup = escalão ACTUAL (sem DOB). avgToCR = média do score menos o CR do campo (métrica de nível normalizada).",
    totalMen: men.length,
    totalWomen: women.length,
    players,
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  writeJsonAtomic(path.join(DATA_DIR, "egr-ranking.json"), out);
  console.log(`  ✔ escrito public/data/egr-ranking.json (${players.length} jogadores)`);
  return players;
}

// ───────────────────────────────────────────────── EVENTS archive/listing ─

const MONTHS = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
// "3. Jan" + ano → "2025-01-03"
function composeDate(raw, year) {
  if (!raw || !year) return null;
  const m = String(raw).match(/(\d{1,2})\.?\s*([A-Za-z]{3})/);
  if (!m) return null;
  const mm = MONTHS[m[2].toLowerCase()];
  if (!mm) return null;
  return `${year}-${mm}-${String(m[1]).padStart(2, "0")}`;
}

// Lista de eventos de um ano: [start, end, name(link), ageGroup, country, points]
function parseEventsArchive(html, year) {
  const body = stripComments(html);
  const rows = body.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const out = [];
  for (const tr of rows) {
    const m = tr.match(/\/events\/(\d+)/);
    if (!m) continue;
    const id = m[1];
    const cells = cellTexts(tr);
    if (cells.length < 6) continue;
    // cells: [startDate, endDate, name, ageGroup, country, egrPoints]
    out.push({
      id,
      year,
      name: cells[2] || null,
      ageGroup: cells[3] || null,
      ageNum: ageNum(cells[3]),
      country: cells[4] || null,
      startDateRaw: cells[0] || null,
      endDateRaw: cells[1] || null,
      startDate: composeDate(cells[0], year),
      endDate: composeDate(cells[1], year),
      egrPoints: toNum(cells[5]),
    });
  }
  return out;
}

// Parse de uma página de evento /events/{id}: metadados + leaderboard.
function parseEventPage(html, id) {
  const body = stripComments(html);
  const title = clean((body.match(/<title>([\s\S]*?)<\/title>/i) || [, ""])[1]).replace(/^European Golf Rankings:\s*/i, "");

  // Metadados: procurar por rótulos conhecidos no texto.
  const flat = clean(body);
  const grab = (label, re) => { const m = flat.match(re); return m ? m[1].trim() : null; };
  const meta = {
    name: title || null,
    venue: null,
    country: null,
    startDateRaw: grab("start", /Start Date:\s*([A-Za-z0-9 ,.]+?)\s+End Date/i),
    endDateRaw: grab("end", /End Date:\s*([A-Za-z0-9 ,.]+?)\s+(?:EGR|Age Group)/i),
    egrPointsPool: toNum(grab("pool", /Points:\s*([\d.,]+)/i)),
    ageGroup: grab("age", /Age Group:\s*(U\d+|Adult)/i),
    sex: /Age Group:[^/]*\/\s*Female/i.test(flat) ? "F" : (/Age Group:[^/]*\/\s*Male/i.test(flat) ? "M" : null),
    cr: toNum(grab("cr", /CR\s*:\s*([\d.]+)/i)),
    lengthMeters: toNum(grab("len", /Length\s*:\s*([\d.,]+)\s*Meters/i)),
    par: toNum(grab("par", /Par\s*:\s*(\d+)/i)),
    cutBonus: toNum(grab("cut", /Cut\/Scoring Bonus:\s*([\d.,]+)/i)),
  };
  meta.ageNum = ageNum(meta.ageGroup);
  meta.sourceUrl = null;

  // Cabeçalho: <h2><a href=EXTERNAL>TITLE</a> <p><b><a href=CLUB>Venue, City, Country</a></b></p></h2>
  // 1º <a> = link externo para a fonte oficial; 2º <a> = venue "Club, City, Country".
  const h2 = (body.match(/<h2[\s\S]*?<\/h2>/i) || [""])[0];
  const anchors = [...h2.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)];
  if (anchors.length) {
    const ext = decode(anchors[0][1]);
    if (ext && /^https?:/i.test(ext) && !/europeangolfrankings\.com/i.test(ext)) meta.sourceUrl = ext;
  }
  if (anchors.length > 1) {
    const venueLine = clean(anchors[1][2]);
    const parts = venueLine.split(",").map((s) => s.trim()).filter(Boolean);
    meta.venue = parts[0] || venueLine || null;
    if (parts.length > 1) meta.country = parts[parts.length - 1];
  }

  // Leaderboard: linhas <tr> com /players/{id}
  const tbl = (body.match(/<table[\s\S]*?<\/table>/i) || [body])[0];
  const rows = tbl.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const players = [];
  for (const tr of rows) {
    if (!/\/players\/\d+/.test(tr)) continue;
    const pid = firstPlayerId(tr);
    const cells = cellTexts(tr);
    // [egrPoints, pos, name, country, club, egrRank, ageGroup, R1, R2, R3, R4, total]
    if (cells.length < 12) continue;
    const nm = splitLastFirst(cells[2]);
    players.push({
      id: pid,
      pos: cells[1] || null,
      posNum: toNum((cells[1] || "").replace(/[^\d]/g, "")),
      name: nm.display,
      lastName: nm.last,
      firstName: nm.first,
      country: cells[3] || null,
      club: cells[4] || null,
      egrRank: toNum(cells[5]),
      ageGroup: cells[6] || null,
      r1: toNum(cells[7]),
      r2: toNum(cells[8]),
      r3: toNum(cells[9]),
      r4: toNum(cells[10]),
      total: toNum(cells[11]),
      egrPoints: toNum(cells[0]),
    });
  }
  return { id, ...meta, players };
}

async function scrapeEvents(opts) {
  fs.mkdirSync(EVENTS_DIR, { recursive: true });
  // 1. Enumerar eventos de cada ano pedido.
  const archive = [];
  for (const year of opts.years) {
    // ⚠ O filtro de ano só funciona via /events/search (o /events ignora-o).
    const url = `${BASE}/events/search?utf8=%E2%9C%93&date%5Byear%5D=${year}&date%5Bmonth%5D=&country=&federation=&gender=&per_page=100000`;
    const html = await httpGet(url);
    const list = parseEventsArchive(html, year);
    console.log(`• Archive ${year}: ${list.length} eventos`);
    archive.push(...list);
  }
  // 2. Filtrar juvenis (age <= maxAge) salvo --all-ages.
  let targets = archive.filter((e) => {
    if (opts.allAges) return true;
    return e.ageNum != null && e.ageNum <= opts.maxAge;
  });
  // --ids em modo events = backfill pontual: só esses eventos do archive
  // (ignora o filtro de idade — o id foi escolhido à mão). Ex: o R&A Junior
  // Open 2024 (9730), fora dos anos default.
  if (opts.ids && opts.ids.length) targets = archive.filter((e) => opts.ids.includes(String(e.id)));
  if (opts.limit) targets = targets.slice(0, opts.limit);
  console.log(`  → ${targets.length} eventos alvo (${opts.allAges ? "todos os escalões" : `<= U${opts.maxAge}`})`);

  // 3. Fetch de cada evento (skip-existing opcional).
  let scraped = 0, skipped = 0;
  const tasks = targets.map((ev) => async () => {
    const outFile = path.join(EVENTS_DIR, `egr_${ev.id}.json`);
    if (opts.skipExisting && fs.existsSync(outFile)) { skipped++; return { id: ev.id, skipped: true }; }
    const html = await httpGet(`${BASE}/events/${ev.id}`);
    const parsed = parseEventPage(html, ev.id);
    parsed.year = ev.year;
    parsed.archiveAgeGroup = ev.ageGroup;
    parsed.scrapedAt = new Date().toISOString();
    parsed.url = `${BASE}/events/${ev.id}`;
    writeJsonAtomic(outFile, parsed);
    scraped++;
    return { id: ev.id, players: parsed.players.length };
  });
  const results = await pool(tasks, opts.concurrency, (d, t) => {
    if (d % 20 === 0 || d === t) process.stdout.write(`\r  eventos ${d}/${t}   `);
  });
  process.stdout.write("\n");
  const errors = results.filter((r) => r && r.error);
  if (errors.length) console.warn(`  ⚠ ${errors.length} eventos com erro`);

  // 4. Índice.
  const index = {
    generated_at: new Date().toISOString(),
    years: opts.years,
    maxAge: opts.allAges ? null : opts.maxAge,
    totalArchive: archive.length,
    totalTargets: targets.length,
    scraped, skipped,
    events: archive.map((e) => ({
      ...e,
      scraped: fs.existsSync(path.join(EVENTS_DIR, `egr_${e.id}.json`)),
    })),
  };
  writeJsonAtomic(path.join(EGR_DIR, "egr-events-index.json"), index);
  console.log(`  ✔ ${scraped} eventos escritos, ${skipped} saltados. Índice: public/data/egr/egr-events-index.json`);

  buildPlayerEventsRollup();
  return scraped + skipped;
}

// Rollup compacto jogador→eventos (só resultados, sem hole scores) a partir de
// TODOS os egr_{id}.json em disco. Alimenta o detalhe do jogador na página /egr
// (lazy-load único de ~5MB) sem ter de carregar os 872 ficheiros de evento.
function buildPlayerEventsRollup() {
  const files = fs.existsSync(EVENTS_DIR) ? fs.readdirSync(EVENTS_DIR).filter((f) => /^egr_\d+\.json$/.test(f)) : [];
  const byPlayer = {};
  for (const f of files) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(EVENTS_DIR, f), "utf8")); } catch { continue; }
    for (const p of d.players || []) {
      if (!p.id) continue;
      (byPlayer[p.id] = byPlayer[p.id] || []).push({
        eventId: d.id, name: d.name, date: d.startDateRaw || null,
        ageGroup: d.ageGroup, sex: d.sex, country: d.country, club: p.club || null,
        cr: d.cr, par: d.par,
        pos: p.posNum != null ? p.posNum : p.pos,
        total: p.total, rounds: [p.r1, p.r2, p.r3, p.r4].filter((x) => x != null),
        egrPoints: p.egrPoints,
      });
    }
  }
  for (const id of Object.keys(byPlayer)) {
    byPlayer[id].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }
  writeJsonAtomic(path.join(EGR_DIR, "egr-player-events.json"), {
    generated_at: new Date().toISOString(),
    note: "Rollup jogador→eventos (só resultados) a partir dos eventos juvenis scraped. Para o detalhe da página /egr.",
    totalPlayers: Object.keys(byPlayer).length,
    players: byPlayer,
  }, { spaces: 0 });
  console.log(`  ✔ rollup jogador→eventos: ${Object.keys(byPlayer).length} jogadores → public/data/egr/egr-player-events.json`);
}

// ──────────────────────────────────────────────────── PLAYER profiles ─────

// Parse de /players/{id}: cabeçalho + histórico de eventos.
function parsePlayerPage(html, id) {
  const body = stripComments(html);
  const flat = clean(body);
  const grab = (re) => { const m = flat.match(re); return m ? m[1].trim() : null; };
  const nameHead = grab(/Details for\s+(.+?)\s+\(ID/i);
  const nm = nameHead ? splitLastFirst(nameHead) : { display: null, last: null, first: null };
  const prof = {
    id,
    egrId: grab(/\(ID\s+([A-Z0-9]+)\)/i),
    name: nm.display,
    lastName: nm.last,
    firstName: nm.first,
    country: grab(/Country:\s*([A-Za-z ,.'-]+?)\s+Golf Club/i),
    club: grab(/Golf Club\s*:\s*([A-Za-z0-9 ,.'&-]+?)\s+Age Group/i),
    ageGroup: grab(/Age Group:\s*(U\d+|Adult)/i),
    tournamentsPlayed: toNum(grab(/Tournaments Played\s*:\s*(\d+)/i)),
    egrRank: toNum(grab(/Ranking:\s*(\d+)/i)),
    egrPoints: toNum(grab(/Points:\s*([\d.,]+)/i)),
    avgScore: toNum(grab(/Average Score\s*:\s*([\d.]+)/i)),
    avgToCR: toNum(grab(/Avg\. to CR:\s*([\d.]+)/i)),
    events: [],
  };
  prof.ageNum = ageNum(prof.ageGroup);
  const tbl = (body.match(/<table[\s\S]*?<\/table>/i) || [body])[0];
  const rows = tbl.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const tr of rows) {
    if (!/\/events\/\d+/.test(tr)) continue;
    const em = tr.match(/\/events\/(\d+)/);
    const cells = cellTexts(tr);
    // 1ª <td> é uma checkbox (texto vazio) que marca se o evento CONTA p/ ranking.
    // cells: ["", pos, event, venue, country, startDate, R1, R2, R3, R4, egrPoints]
    const cb = tr.match(/<input[^>]*class="result"[^>]*>/i);
    const off = cb ? 1 : 0;
    if (cells.length < off + 6) continue;
    prof.events.push({
      eventId: em ? em[1] : null,
      counting: cb ? /checked/i.test(cb[0]) : null,
      pos: cells[off] || null,
      event: cells[off + 1] || null,
      venue: cells[off + 2] || null,
      country: cells[off + 3] || null,
      startDateRaw: cells[off + 4] || null,
      r1: toNum(cells[off + 5]), r2: toNum(cells[off + 6]), r3: toNum(cells[off + 7]), r4: toNum(cells[off + 8]),
      egrPoints: toNum(cells[cells.length - 1]),
    });
  }
  return prof;
}

async function scrapePlayers(opts, rankingPlayers) {
  fs.mkdirSync(PLAYERS_DIR, { recursive: true });
  let ids = [...opts.ids];
  if (opts.country && rankingPlayers) {
    const c = opts.country.toLowerCase();
    ids.push(...rankingPlayers.filter((p) => (p.country || "").toLowerCase() === c).map((p) => p.id));
  }
  ids = [...new Set(ids.filter(Boolean))];
  if (opts.limit) ids = ids.slice(0, opts.limit);
  if (!ids.length) { console.warn("  ⚠ --players sem ids (usar --id ou --country)"); return 0; }
  console.log(`• Perfis: ${ids.length} jogadores`);
  let done = 0;
  const tasks = ids.map((id) => async () => {
    const outFile = path.join(PLAYERS_DIR, `egr_${id}.json`);
    if (opts.skipExisting && fs.existsSync(outFile)) return { id, skipped: true };
    const html = await httpGet(`${BASE}/players/${id}`);
    const prof = parsePlayerPage(html, id);
    prof.scrapedAt = new Date().toISOString();
    prof.url = `${BASE}/players/${id}`;
    writeJsonAtomic(outFile, prof);
    return { id, events: prof.events.length };
  });
  await pool(tasks, opts.concurrency, (d, t) => { done = d; if (d % 10 === 0 || d === t) process.stdout.write(`\r  perfis ${d}/${t}   `); });
  process.stdout.write("\n");
  console.log(`  ✔ ${done} perfis escritos em public/data/egr/players/`);
  return done;
}

// ────────────────────────────────────────────────────────────── main ─────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^\/\*\*?/, ""));
    return;
  }
  fs.mkdirSync(EGR_DIR, { recursive: true });
  let produced = 0;
  let rankingPlayers = null;
  try {
    if (opts.ranking) { rankingPlayers = await scrapeRanking(); produced += rankingPlayers.length; }
    if (opts.events) produced += await scrapeEvents(opts);
    if (opts.players) {
      if (!rankingPlayers && opts.country) {
        const rk = path.join(DATA_DIR, "egr-ranking.json");
        if (fs.existsSync(rk)) rankingPlayers = JSON.parse(fs.readFileSync(rk, "utf8")).players;
      }
      produced += await scrapePlayers(opts, rankingPlayers);
    }
  } catch (err) {
    console.error("✖ Erro:", err.message);
    process.exitCode = 1;
    return;
  }
  if (!produced) { console.log("Sem novidades."); process.exitCode = 2; return; }
  console.log("Concluído.");
  process.exitCode = 0;
}

main();
