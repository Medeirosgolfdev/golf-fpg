/**
 * scrape-junior-orange-bowl.js  (v3 — multi-torneio, auto-detecção)
 *
 * Scraper GolfGenius genérico para o Junior Orange Bowl (e outros eventos GG
 * com a mesma estrutura, ex.: World Junior Girls). Cada URL gera o SEU ficheiro,
 * com nome e ano detetados do título da página — não é preciso preencher nada.
 *
 * Como funciona (investigado no Chrome, 2026-05):
 *  • /pages/<id> embute os escalões como widgets cujo data-url aponta a
 *    /v2tournaments/<TID>. Extraímos esses TIDs do DOM.
 *  • /v2tournaments/<TID>?called_from=widgets%2Fcustomized_tournament_results
 *    &hide_totals=false&player_stats_for_portal=true devolve o LEADERBOARD
 *    renderizado (Pos · Nome + "Cidade, Região, País" · ToPar · R1..Rn · Total).
 *  • Scorecards por buraco via /tournaments2/details/<id>.
 *  • O GolfGenius não bloqueia o Playwright (ao contrário do BlueGolf).
 *
 * ⚠ Ano: os subtítulos/subdomínios do GG são inconsistentes. O ORDINAL do
 * título é a âncora fiável (62nd = 2025 confirmado → ano = 1963 + ordinal para
 * o Junior Orange Bowl). Outros eventos usam o ano explícito do título.
 *
 * USO:
 *   node scripts/scrape-junior-orange-bowl.js                 # todas as EDITIONS
 *   node scripts/scrape-junior-orange-bowl.js <pageUrl>       # uma página
 *   BROWSER=chrome node scripts/scrape-junior-orange-bowl.js  # forçar Chrome
 *
 * Output: public/data/<slug>_<ano>.json
 */
const { chromium, firefox } = require("playwright");
const fs = require("fs");
const path = require("path");

/* ─── Páginas a scrapar (1 por edição/evento). Acrescenta URLs à vontade. ─── */
const EDITIONS = [
  "https://www.golfgenius.com/pages/12329997298456112138",      // JOB 62nd → 2026
  "https://www.golfgenius.com/pages/11271329517282569244",      // JOB 61st → 2025 (Results)
  "https://www.golfgenius.com/pages/4561596",                   // JOB 60th → 2024
  "https://2023jrorangebowl.golfgenius.com/pages/3956757",      // JOB 59th → 2023
  "https://www.golfgenius.com/pages/10741823397232167401",      // World Junior Girls 2024
  "https://www.golfgenius.com/pages/12770450567004716088",      // Under Armour Junior Tour — 2026 Summer National Championship
  "https://www.golfgenius.com/pages/5989156",                   // LXXV Campeonato Nacional Infantil Juvenil (México) → 2026
  // "https://www.golfgenius.com/pages/11271327908615990299",   // JOB 61st Tee Times (sem leaderboards — salta)
];

const OUT_DIR = path.join(__dirname, "..", "public", "data");
const DELAY_MS = 300;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const v2url = (base, tid) =>
  `${base}/v2tournaments/${tid}?called_from=widgets%2Fcustomized_tournament_results&hide_totals=false&player_stats_for_portal=true`;

/* ─── Nome/slug/ano a partir do título da página ─── */
const SLUG_OVERRIDES = [
  { re: /junior orange bowl/i, slug: "orangebowl", name: "Junior Orange Bowl International Championship", ordinalYear: (o) => 1964 + o, location: "Coral Gables, Florida, USA" }, // 62nd = 2026
  { re: /world junior girls/i, slug: "worldjrgirls", name: "World Junior Girls Golf Championship", location: "" },
  // The Junior Tour Powered by Under Armour — Summer National Championship (GolfGenius).
  // O ano vem explícito no título ("2026 Summer National Championship").
  { re: /under armour|summer national championship/i, slug: "uajt", name: "The Junior Tour Powered by Under Armour — Summer National Championship", location: "" },
  // Campeonato Nacional Infantil Juvenil (Federación Mexicana de Golf). O título
  // usa ordinal ROMANO ("LXXV" = 75); a edição LXXV = 2026 → ano = 1951 + ordinal.
  { re: /campeonato nacional infantil juvenil/i, slug: "mexnacional", name: "Campeonato Nacional Infantil Juvenil (México)", ordinalYear: (o) => 1951 + o, location: "México" },
];

// Ordinal romano → inteiro (ex: "LXXV" → 75). Devolve null se inválido.
function romanToInt(s) {
  const M = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const up = (s || "").toUpperCase();
  if (!/^[IVXLCDM]+$/.test(up)) return null;
  let total = 0;
  for (let i = 0; i < up.length; i++) {
    const cur = M[up[i]], next = M[up[i + 1]] || 0;
    total += cur < next ? -cur : cur;
  }
  return total || null;
}
function slugify(s) {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "evento";
}
function parseMeta(title) {
  const t = (title || "").replace(/\s*Event\s*::.*$/i, "").trim();
  const ym = t.match(/\b(19|20)\d{2}\b/);
  const om = t.match(/(\d+)(st|nd|rd|th)\b/i);
  // Ordinal árabe ("62nd") ou, em falta, romano no início do título ("LXXV …").
  let ordinal = om ? parseInt(om[1], 10) : null;
  if (ordinal == null) {
    const rm = t.match(/^\s*([IVXLCDM]{2,})\b/i);
    if (rm) ordinal = romanToInt(rm[1]);
  }
  let year = ym ? parseInt(ym[0], 10) : null;
  let name = t.replace(/(\d+)(st|nd|rd|th)\b/i, "").replace(/\b(19|20)\d{2}\b/, "").replace(/\bannual\b/i, "").replace(/\s+/g, " ").trim();
  let slug = null, override = null;
  for (const o of SLUG_OVERRIDES) { if (o.re.test(title)) { slug = o.slug; name = o.name; override = o; break; } }
  if (!slug) slug = slugify(name);
  // Ano fiável: override por ordinal (JOB) tem prioridade; senão ano explícito.
  if (override && override.ordinalYear && ordinal) year = override.ordinalYear(ordinal);
  const yearKey = year || (ordinal ? `ed${ordinal}` : "x");
  return { name, slug, year, yearKey, ordinal, location: override?.location || "" };
}

/* ─── Extrair TIDs (escalões) do DOM já carregado ─── */
async function extractTids(page) {
  return page.evaluate(() => {
    const tset = new Set();
    const scanAttrs = (doc) => {
      for (const el of doc.querySelectorAll("[data-url],[href],[src],[data-href]")) {
        const v = el.getAttribute("data-url") || el.getAttribute("href") || el.getAttribute("src") || el.getAttribute("data-href") || "";
        const m = v.match(/v2tournaments\/(\d+)/);
        if (m) tset.add(m[1]);
      }
    };
    const docs = [document];
    for (const ifr of document.querySelectorAll("iframe")) { try { if (ifr.contentDocument) docs.push(ifr.contentDocument); } catch { /* x-origin */ } }
    docs.forEach(scanAttrs);
    if (tset.size === 0) for (const doc of docs) for (const m of (doc.documentElement.outerHTML || "").matchAll(/v2tournaments\/(\d+)/g)) tset.add(m[1]);
    return [...tset];
  });
}

/* ─── Leaderboard de um escalão (v2tournaments) ─── */
async function fetchDivision(page, base, tid) {
  await page.goto(v2url(base, tid), { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForSelector("table tr", { timeout: 20_000 }).catch(() => {});
  await sleep(800);
  return page.evaluate(() => {
    let label = "";
    for (const h of document.querySelectorAll("h1,h2,h3,h4,.tournament-name,.event-name")) {
      const t = h.textContent.replace(/\s+/g, " ").trim();
      if (/boys|girls|men|women|division|championship/i.test(t) && t.length < 80) { label = t; break; }
    }
    const players = [];
    const seen = new Set();
    for (const tr of document.querySelectorAll("table tr")) {
      const tds = [...tr.querySelectorAll("td")];
      if (tds.length < 4) continue;
      const posTxt = tds[0].textContent.replace(/\s+/g, " ").trim();
      const isPos = /^(T?\d+|WD|DQ|DNS|MC|CUT|NS)$/i.test(posTxt);
      const link = tr.querySelector('a[href*="/details/"], a[href*="tournaments2/details"]');
      if (!isPos && !link) continue;
      const nameCell = link ? link.closest("td") : tds[1];
      if (!nameCell) continue;
      const a = nameCell.querySelector("a");
      const name = (a ? a.textContent : nameCell.textContent).replace(/\s+/g, " ").trim().split("  ")[0].trim();
      if (!name || seen.has(name + posTxt)) continue;
      const full = nameCell.textContent.replace(/\s+/g, " ").trim();
      const loc = name ? full.replace(name, "").trim().replace(/^[,·\-\s]+/, "") : "";
      const country = loc ? loc.split(",").map((s) => s.trim()).filter(Boolean).pop() : "";
      const detailHref = a ? (a.getAttribute("href") || "") : "";
      const detailId = (detailHref.match(/details\/(\d+)/) || [])[1] || null;
      const nameIdx = tds.indexOf(nameCell);
      const nums = tds.slice(nameIdx + 1).map((td) => td.textContent.replace(/\s+/g, " ").trim());
      const toParTxt = nums[0] || "";
      const toPar = toParTxt === "E" ? 0 : parseInt(toParTxt, 10);
      const total = nums.length ? (parseInt(nums[nums.length - 1], 10) || null) : null;
      const roundGross = nums.slice(1, -1).map((x) => parseInt(x, 10)).filter((n) => !isNaN(n));
      seen.add(name + posTxt);
      players.push({ pos: posTxt, name, country, location: loc, detailId, toPar: isNaN(toPar) ? null : toPar, total, roundGross });
    }
    return { label, players };
  });
}

/* ─── Scorecard por buraco (best-effort) ─── */
async function fetchScorecard(base, detailId, pageRef) {
  const url = `${base}/tournaments2/details/${detailId}?round_index=&player_stats_for_portal=true`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html", "Referer": pageRef } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseScorecard(await res.text());
}
/* Ajuste de par a partir do marcador GolfGenius:
   simple_circle=birdie(+1), double_circle=eagle(+2), simple_square=bogey(−1),
   double_square=double(−2), sem marca=par(0). → par[buraco] = score + ajuste. */
function parAdjust(cls) {
  if (/double_circle/.test(cls)) return 2;
  if (/circle/.test(cls)) return 1;
  if (/double_square/.test(cls)) return -2;
  if (/square/.test(cls)) return -1;
  return 0;
}
function parseScorecard(html) {
  const rounds = [];
  const tableRe = /<table[^>]+class=["'][^"']*detail_table[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi;
  let tm;
  while ((tm = tableRe.exec(html)) !== null) {
    const rowRe = /<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/gi;
    let rm;
    while ((rm = rowRe.exec(tm[0])) !== null) {
      if (/header_row/.test(rm[0])) continue;
      const cells = []; // { txt, cls }
      const cellRe = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
      let c;
      while ((c = cellRe.exec(rm[0])) !== null) {
        const cls = (c[1].match(/class=["']([^"']*)["']/) || [, ""])[1];
        const txt = c[2].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
        cells.push({ txt, cls });
      }
      if (cells.length < 22) continue;
      const holeIdx = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19]; // colunas dos 18 buracos
      const scores = [], par = [];
      let ok = true;
      for (const i of holeIdx) {
        const n = parseInt(cells[i].txt, 10);
        if (isNaN(n) || n < 1 || n > 15) { ok = false; break; }
        scores.push(n);
        par.push(n + parAdjust(cells[i].cls)); // par real derivado do marcador
      }
      if (!ok || scores.length < 18) continue;
      const f9 = parseInt(cells[10].txt, 10) || scores.slice(0, 9).reduce((a, b) => a + b, 0);
      const b9 = parseInt(cells[20].txt, 10) || scores.slice(9).reduce((a, b) => a + b, 0);
      const gross = parseInt(cells[21].txt, 10) || f9 + b9;
      rounds.push({ scores, par, f9, b9, gross });
    }
  }
  return rounds;
}

/* ─── Course analytics: par + distância (jardas→metros) + SI por buraco/tee ───
   Portado do scrape-england-golf.js. O widget tem 1 form por (curso, tee); cada
   POST devolve a tabela buraco-a-buraco. Detecta jardas (US) e converte ×0.9144. */
async function fetchCourseStats(page, base, leagueId) {
  const ctx = page.context();
  const headers = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": UA,
    "Referer": `${base}/leagues/${leagueId}/widgets/course_analytics?shared=false`,
  };
  let html;
  try { const r = await ctx.request.get(`${base}/leagues/${leagueId}/widgets/course_analytics?shared=false`, { headers }); html = await r.text(); }
  catch { return []; }
  const formBlocks = [...html.matchAll(/<form[^>]*id="(course_statistics_[^"]+)"[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)];
  if (!formBlocks.length) return [];
  const firstInt = (s) => { const n = (String(s).match(/\d+/g) || []).map(Number); return n.length ? Math.max(...n) : NaN; };
  const out = [];
  for (const fm of formBlocks) {
    const action = fm[2].startsWith("http") ? fm[2] : `${base}${fm[2]}`;
    const formData = {};
    for (const inp of fm[3].matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g)) formData[inp[1]] = inp[2];
    try {
      const resp = await ctx.request.post(action, { form: formData, headers });
      const h = await resp.text();
      // Unidade lida do CABEÇALHO da tabela (a coluna de distância é rotulada
      // "Yards"/"Meters"/"Mètre"). Mais fiável que varrer a página toda — um
      // toggle de unidades faz aparecer ambas as palavras no HTML.
      let unitYards = false;
      for (const tr of h.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
        const txt = tr[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").toLowerCase();
        if (/\bpar\b/.test(txt) && /(yard|m[eè]tr|verge)/.test(txt)) { unitYards = /yard/.test(txt); break; }
      }
      const teeMatch = h.match(/(?:Tee|Tees|Marqueurs)\s*[:<][\s\S]{0,200}?>([^<]+?)<\/(?:a|td|span|h[1-6])/i);
      const teeName = teeMatch ? teeMatch[1].replace(/\s+/g, " ").trim() : "";
      const courseHeader = h.match(/Course\s*:?\s*<[^>]*>([^<]+)/i) || h.match(/Course\s*:\s*([^<\n]+)/i);
      const courseName = courseHeader ? courseHeader[1].replace(/\s+/g, " ").trim() : "";
      const rows = [];
      for (const tr of h.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
        const cells = [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)]
          .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()).filter((x) => x);
        if (cells.length >= 11 && /^\d+$/.test(cells[0]) && /^\d+$/.test(cells[2])) {
          const dist = firstInt(cells[1]), si = firstInt(cells[4]);
          if (Number.isFinite(dist)) rows.push({ hole: +cells[0], dist, par: +cells[2], si: Number.isFinite(si) ? si : 0 });
        }
      }
      if (rows.length < 18) continue;
      rows.sort((a, b) => a.hole - b.hole);
      const par = rows.map((r) => r.par);
      const meters = rows.map((r) => (unitYards ? Math.round(r.dist * 0.9144) : r.dist));
      const si = rows.map((r) => r.si);
      out.push({ teeName, courseName, par, meters, si, parTotal: par.reduce((a, b) => a + b, 0), metersTotal: meters.reduce((a, b) => a + b, 0), unitYards });
    } catch { /* skip */ }
  }
  const seen = new Map();
  for (const r of out) { if (!r.metersTotal) continue; const k = `${r.parTotal}-${r.metersTotal}`; if (!seen.has(k)) seen.set(k, r); }
  return [...seen.values()];
}

/* ─── Scrape de uma página (evento/edição) ─── */
async function scrapeEdition(page, url) {
  const base = (url.match(/^(https?:\/\/[^/]+)/) || [])[1];
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  await sleep(2500);
  const meta = parseMeta(await page.title());
  console.log(`\n${"═".repeat(60)}\n🏌️  ${meta.name} — ${meta.yearKey}\n   ${url}`);

  // League ID → course analytics (par/distância/SI por buraco e tee).
  const leagueId = await page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-url],[src],[href]")) {
      const v = el.getAttribute("data-url") || el.getAttribute("src") || el.getAttribute("href") || "";
      const m = v.match(/\/leagues\/(\d+)\/widgets/); if (m) return m[1];
    }
    const m = (document.documentElement.outerHTML || "").match(/\/leagues\/(\d+)\/widgets/); return m ? m[1] : null;
  });
  const courses = leagueId ? await fetchCourseStats(page, base, leagueId).catch(() => []) : [];
  if (courses.length) console.log(`   📏 ${courses.length} tee(s): ${courses.map((c) => `${c.teeName || "?"} par${c.parTotal} ${c.metersTotal}m`).join(" | ")}`);

  const tids = await extractTids(page);
  console.log(`   🔎 ${tids.length} escalões (tids): ${tids.join(", ") || "(0 — página sem leaderboards, salto)"}`);
  if (!tids.length) return;

  const divisions = [];
  for (let d = 0; d < tids.length; d++) {
    const tid = tids[d];
    let div;
    try { div = await fetchDivision(page, base, tid); }
    catch (e) { console.error(`   ❌ tid ${tid}: ${e.message}`); continue; }
    const label = div.label || `Divisão ${d + 1}`;
    console.log(`   ━ ${label} (${div.players.length} jog)`);
    let sc = 0;
    for (let i = 0; i < div.players.length; i++) {
      const p = div.players[i];
      if (!p.detailId) { p.rounds = []; continue; }
      process.stdout.write(`\r     [${String(i + 1).padStart(3)}/${div.players.length}] ${p.name.padEnd(26).slice(0, 26)}`);
      try { p.rounds = (await fetchScorecard(base, p.detailId, url)).map((r, idx) => ({ day: idx + 1, ...r })); if (p.rounds.length) sc++; }
      catch { p.rounds = []; }
      await sleep(DELAY_MS);
    }
    process.stdout.write("\n");
    // ⚠ O detalhe GolfGenius (tournaments2/details) lista as rondas por ordem
    // INVERSA (mais recente primeiro). O leaderboard (roundGross) está
    // cronológico R1..Rn. Reordenar os scorecards para casar com roundGross,
    // senão "R1" mostraria a última ronda jogada.
    let fixed = 0;
    for (const p of div.players) {
      if (!p.rounds || p.rounds.length < 2) continue;
      let ordered = null;
      if (Array.isArray(p.roundGross) && p.roundGross.length >= p.rounds.length) {
        const pool = p.rounds.slice();
        const acc = [];
        for (const gross of p.roundGross) {
          const idx = pool.findIndex((r) => r.gross === gross);
          if (idx >= 0) acc.push(pool.splice(idx, 1)[0]); else break;
        }
        if (acc.length === p.rounds.length) ordered = acc;
      }
      if (!ordered) ordered = p.rounds.slice().reverse(); // fallback: GG é reverse-cronológico
      const changed = ordered.some((r, i) => r !== p.rounds[i]);
      p.rounds = ordered.map((r, i) => ({ ...r, day: i + 1 }));
      if (changed) fixed++;
    }
    if (fixed) console.log(`     ↩ ${fixed} jogador(es) com rondas reordenadas (R1 = 1º dia)`);
    // Par do campo por consenso (moda por buraco) a partir dos marcadores GolfGenius.
    const votes = Array.from({ length: 18 }, () => ({}));
    for (const p of div.players) for (const r of (p.rounds || [])) if (r.par && r.par.length === 18) r.par.forEach((v, i) => { votes[i][v] = (votes[i][v] || 0) + 1; });
    const coursePar = votes.map((v) => { let best = null, bn = -1; for (const k in v) if (v[k] > bn) { bn = v[k]; best = +k; } return best; });
    const hasPar = coursePar.every((x) => x != null);
    for (const p of div.players) for (const r of (p.rounds || [])) delete r.par; // par fica só ao nível da divisão
    const parTotalMarker = hasPar ? coursePar.reduce((a, b) => a + b, 0) : null;
    const nRounds = div.players.reduce((a, p) => a + (p.rounds ? p.rounds.length : 0), 0);
    // Emparelhar um curso (course_analytics) com este escalão. 1º por nome de
    // tee (Boys/Girls); se os tees não tiverem nome, usar comprimento: o tee
    // mais longo é dos rapazes (divisão 0), o mais curto das raparigas.
    const g = d === 0 ? /(boys|rapaz|men|male|black|blue|championship)/i : /(girls|rapar|women|female|ladies|red|forward)/i;
    const byLen = [...courses].sort((a, b) => (b.metersTotal || 0) - (a.metersTotal || 0));
    const course = courses.find((c) => c.teeName && g.test(c.teeName))
      || (byLen.length > 1 ? (d === 0 ? byLen[0] : byLen[byLen.length - 1]) : null)
      || courses[d] || courses[0] || null;
    // Preferir par do course_analytics (oficial) sobre o derivado dos marcadores.
    const finalPar = (course && course.par && course.par.length === 18) ? course.par : (hasPar ? coursePar : null);
    const parTotal = (course && course.parTotal) || parTotalMarker;
    console.log(`     ${sc}/${div.players.length} jog · ${nRounds} rondas · par ${finalPar ? `[${finalPar.join(",")}]=${parTotal}` : "n/d"}${course ? ` · ${course.metersTotal}m (${course.teeName || "?"})` : ""}`);
    divisions.push({
      division: label, tid,
      par: finalPar, parTotal,
      meters: course ? course.meters : null,
      si: course ? course.si : null,
      teeName: course ? course.teeName : null,
      metersTotal: course ? course.metersTotal : null,
      courseName: course ? (course.courseName || null) : null,
      players: div.players,
    });
  }

  // Localização: nome(s) de campo do course_analytics; senão fallback do override.
  const courseNames = [...new Set(courses.map((c) => c.courseName).filter(Boolean))];
  const location = courseNames.length ? courseNames.join(" / ") : (meta.location || "");
  if (location) console.log(`   📍 ${location}`);
  const output = { tournament: meta.name, year: meta.year, source: url, course: location || null, divisions };
  const outFile = path.join(OUT_DIR, `${meta.slug}_${meta.yearKey}.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), "utf-8");
  const nJ = divisions.reduce((a, d) => a + d.players.length, 0);
  console.log(`   ✅ ${divisions.length} escalões · ${nJ} jogadores → ${outFile}`);
}

/* ─── Main ─── */
(async () => {
  const args = process.argv.slice(2);
  const editions = (args[0] && /^https?:\/\//.test(args[0])) ? [args[0]] : EDITIONS;

  const useChrome = /^(chrome|chromium)$/i.test(process.env.BROWSER || "");
  let browser;
  if (useChrome) browser = await chromium.launch({ headless: false }).catch(() => chromium.launch({ headless: false, channel: "chrome" }));
  else browser = await firefox.launch({ headless: false }).catch(() => chromium.launch({ headless: false }));
  const context = await browser.newContext({ userAgent: UA, locale: "pt-PT", viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  for (const url of editions) {
    try { await scrapeEdition(page, url); }
    catch (e) { console.error(`❌ Erro em ${url}: ${e.message}`); }
  }
  await browser.close();
  console.log(`\n🏁 Concluído — ${editions.length} página(s). Ficheiros em public/data/<slug>_<ano>.json`);
})();
