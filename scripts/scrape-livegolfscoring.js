/**
 * scripts/scrape-livegolfscoring.js
 *
 * Scraper de rfegolf.livegolfscoring.es — fonte primária dos resultados RFEGolf.
 * Tem leaderboard estruturado em HTML + scorecards hole-by-hole + par + meters
 * por buraco (não precisa de parsing PDF).
 *
 * URLs:
 *   /torneos/clasificacion/{id}      → leaderboard final/em curso
 *   /torneos/hoyoahoyo/{id}/{r}      → scorecards por ronda
 *   /torneos/estadisticas/{id}       → metros + SI + par + média por buraco
 *   /torneos/horarios/{id}/{r}       → tee times por ronda
 *
 * O ID é interno (1-400+ em 2026). Não há mapeamento directo com CompId RFEGolf
 * — temos de scrap por nome+data e depois cruzar.
 *
 * USO:
 *   node scripts/scrape-livegolfscoring.js --id 322
 *   node scripts/scrape-livegolfscoring.js --range 1-400 --concurrency 5
 *   node scripts/scrape-livegolfscoring.js --seasons 2025,2026 --skip-existing
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT_DIR = path.resolve(__dirname, "../public/data/rfegolf-livegolfscoring");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const AGENT = new https.Agent({ keepAlive: true, maxSockets: 8 });

function httpGet(urlStr, retries = 2) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      const url = new URL(urlStr);
      const req = https.request({
        method: "GET", hostname: url.hostname, path: url.pathname + url.search,
        headers: { "User-Agent": UA, "Accept": "text/html,*/*", "Accept-Language": "es-ES,es;q=0.9" },
        timeout: 20000, agent: AGENT,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, urlStr).toString();
          res.resume();
          httpGet(next, retries).then(resolve, reject); return;
        }
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      });
      req.on("error", err => { if (n > 0) setTimeout(() => attempt(n - 1), 1000); else reject(err); });
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.end();
    }
    attempt(retries);
  });
}

function decodeEntities(s) {
  return String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}
function stripTags(s) { return decodeEntities(String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()); }

function parseHoyoAHoyo(html) {
  // Par real do campo está na primeira <tr class="hoyoahoyopares">
  let par = null;
  const parTr = /<tr[^>]*class="[^"]*hoyoahoyopares[^"]*"[^>]*>([\s\S]+?)<\/tr>/i.exec(html);
  if (parTr) {
    const nums = stripTags(parTr[1]).split(/\s+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    if (nums.length >= 21) {
      par = [...nums.slice(0, 9), ...nums.slice(10, 19)];
    }
  }

  // Players: cada <tr class="altrow"> ou similar tem 1 jogador
  const players = [];
  const trRe = /<tr[^>]*(?:class="(?:altrow|altrow_alt)"|id="jugador-\d+")[^>]*>([\s\S]+?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const block = m[1];
    const idM = /id="(?:star|jugador|fichalink)-(\d+)"/.exec(block);
    const memberId = idM ? idM[1] : null;
    const blockText = stripTags(block);
    const re = /^[> ]*(T?\d+|\d+|—)?\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü\s,'\.-]+?)\s+\*?\s*([+\-]\d+|E|Par)\s+((?:\d+\s+){19,21}\d+)\s+([+\-]\d+|E|Par)/;
    const r = re.exec(blockText);
    if (!r) continue;
    const posStr = r[1] ? r[1].replace(/^T/, "") : "";
    const pos = posStr ? parseInt(posStr, 10) : null;
    const name = r[2].trim().replace(/\s{2,}/g, " ");
    const tpRaw = r[3];
    const numsStr = r[4].trim();
    const hoyRaw = r[5];
    const nums = numsStr.split(/\s+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    let scores = null, total = null, halves = null;
    if (nums.length >= 21) {
      scores = [...nums.slice(0, 9), ...nums.slice(10, 19)];
      halves = [nums[9], nums[19]];
      total = nums[20];
    }
    const toPar = (tpRaw === "E" || tpRaw === "Par") ? 0 : parseInt(tpRaw, 10);
    const hoy = (hoyRaw === "E" || hoyRaw === "Par") ? 0 : parseInt(hoyRaw, 10);
    players.push({ memberId, pos, name, toPar, hoy, scores, halves, total });
  }

  return { par, players };
}

/* Tabela /torneos/estadisticas/{id}: por buraco Mtrs (metros) + Hdp (SI) + Par +
 * Media (score médio do torneio). É a UNICA fonte de DISTANCIAS por buraco no LGS
 * (o hoyoahoyo só tem par). Markup: <table class="board estadisticas"> com 18 <tr>,
 * cada um com <td> Hoyo - Mtrs - Hdp - Par - Media - Eagles - Birdies - ... */
function parseEstadisticas(html) {
  const tblM = /<table[^>]*class="[^"]*estadisticas[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!tblM) return null;
  const meters = new Array(18).fill(null), si = new Array(18).fill(null), par = new Array(18).fill(null), avg = new Array(18).fill(null);
  let found = 0, m;
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  while ((m = trRe.exec(tblM[1])) !== null) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => stripTags(c[1]));
    if (cells.length < 5) continue;
    const hole = parseInt(cells[0], 10);
    if (!(hole >= 1 && hole <= 18)) continue;
    const i = hole - 1;
    const mt = parseInt(cells[1], 10); if (!isNaN(mt)) meters[i] = mt;
    const hd = parseInt(cells[2], 10); if (!isNaN(hd)) si[i] = hd;
    const pr = parseInt(cells[3], 10); if (!isNaN(pr)) par[i] = pr;
    const av = parseFloat(String(cells[4]).replace(",", ".")); if (!isNaN(av)) avg[i] = av;
    found++;
  }
  if (found < 9) return null;
  const metersTotal = meters.reduce((a, b) => a + (b || 0), 0) || null;
  return { meters, si, par, avg, metersTotal, holes: found };
}

function parseTorneoMeta(html) {
  const rounds = [];
  const optRe = /<option value="\/torneos\/hoyoahoyo\/\d+\/(\d+)"[^>]*>([^<]+)<\/option>/gi;
  let m;
  while ((m = optRe.exec(html)) !== null) {
    rounds.push({ round: parseInt(m[1], 10), label: m[2].trim() });
  }
  let name = null;
  const nm = /<h1[^>]*>([^<]+)<\/h1>/.exec(html);
  if (nm) name = stripTags(nm[1]);
  if (!name) {
    const nm2 = /<title[^>]*>([^<]+)<\/title>/.exec(html);
    if (nm2) name = stripTags(nm2[1]).replace(/\s*-\s*Real Federación.+$/i, "").trim();
  }
  let course = null;
  const cm = /<span[^>]*class="nombre_campo"[^>]*>([^<]+)<\/span>/.exec(html);
  if (cm) course = stripTags(cm[1]);
  let dateRange = null;
  const dm = /Del\s+(\d+\s+[a-z]+)\s+al\s+(\d+\s+[a-z]+(?:\s+\d{4})?)/i.exec(html);
  if (dm) dateRange = `${dm[1]} - ${dm[2]}`;
  return { name, course, dateRange, rounds };
}

async function scrapeTorneo(id) {
  // Carrega hoyoahoyo (sem ronda) — tem o select de rondas + título
  const main = await httpGet(`https://rfegolf.livegolfscoring.es/torneos/hoyoahoyo/${id}`);
  if (main.status !== 200 || main.body.length < 1000) {
    return { id, ok: false, error: `hoyoahoyo status=${main.status}` };
  }
  if (!/jugador-\d+|hoyoahoyopares|selectRonda/i.test(main.body)) {
    return { id, ok: false, error: "no_data" };
  }
  const meta = parseTorneoMeta(main.body);

  // 2. Para cada ronda, fetch hoyoahoyo
  const rounds = meta.rounds.length > 0 ? meta.rounds : [{ round: 1, label: "Ronda 1" }];
  const roundsData = [];
  for (const r of rounds) {
    const hoy = await httpGet(`https://rfegolf.livegolfscoring.es/torneos/hoyoahoyo/${id}/${r.round}`);
    if (hoy.status !== 200) continue;
    const parsed = parseHoyoAHoyo(hoy.body);
    roundsData.push({ round: r.round, label: r.label, par: parsed.par, players: parsed.players });
  }

  // 3. Estatísticas por buraco — metros + SI + par + média (distâncias jogadas).
  let course = null;
  try {
    const est = await httpGet(`https://rfegolf.livegolfscoring.es/torneos/estadisticas/${id}`);
    if (est.status === 200) course = parseEstadisticas(est.body);
  } catch (e) { /* sem estatísticas publicadas — ok */ }

  return { id, ok: true, scrapedAt: new Date().toISOString(), meta, course, rounds: roundsData };
}

const LGS_BASE = "https://rfegolf.livegolfscoring.es";

/* Descoberta por LISTAGEM de temporada: /competiciones/temporada/{ano} lista
 * TODAS as competições da época. Extrai os IDs do padrão /torneos/{tipo}/{id}. */
async function discoverSeasonIds(years) {
  const ids = new Set();
  for (const y of years) {
    try {
      const r = await httpGet(`${LGS_BASE}/competiciones/temporada/${y}`);
      if (r.status !== 200) { console.log(`  temporada ${y}: HTTP ${r.status}`); continue; }
      let n = 0;
      for (const m of r.body.matchAll(/\/torneos\/(?:clasificacion|hoyoahoyo|horarios)\/(\d+)/gi)) {
        const id = parseInt(m[1], 10);
        if (id > 0 && !ids.has(id)) { ids.add(id); n++; }
      }
      console.log(`  temporada ${y}: ${n} competições`);
    } catch (e) { console.log(`  temporada ${y}: erro ${e.message}`); }
  }
  return [...ids];
}

async function main() {
  const args = process.argv.slice(2);
  function getArg(n, def) { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : (def === undefined ? null : def); }
  const idArg = getArg("id", null);
  const rangeArg = getArg("range", null);
  const seasonsArg = getArg("seasons", null);
  const skipExisting = args.includes("--skip-existing");
  const pretty = args.includes("--pretty");
  const concurrency = parseInt(getArg("concurrency", "5"), 10);

  let ids = [];
  if (idArg) ids = idArg.split(",").map(s => parseInt(s.trim(), 10));
  else if (rangeArg) {
    const p = rangeArg.split("-").map(s => parseInt(s.trim(), 10));
    for (let i = p[0]; i <= p[1]; i++) ids.push(i);
  }
  if (seasonsArg) {
    const years = seasonsArg.split(",").map(s => s.trim()).filter(Boolean);
    console.log(`Discovery por temporada: ${years.join(", ")}`);
    const found = await discoverSeasonIds(years);
    for (const id of found) if (!ids.includes(id)) ids.push(id);
    console.log(`  → ${found.length} IDs descobertos (total a processar: ${ids.length})`);
  }
  if (!ids.length) {
    console.log("Uso: --id 322 | --range 1-400 | --seasons 2025,2026 [--concurrency 5] [--skip-existing]");
    process.exit(1);
  }

  console.log(`livegolfscoring.es scrape: ${ids.length} ids, concurrency=${concurrency}`);
  let ok = 0, fail = 0, skip = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      const out = path.join(OUT_DIR, id + ".json");
      if (skipExisting && fs.existsSync(out)) { skip++; continue; }
      try {
        const result = await scrapeTorneo(id);
        if (result.ok) {
          fs.writeFileSync(out, JSON.stringify(result, null, pretty ? 2 : 0));
          ok++;
          const nP = result.rounds.reduce((a, r) => a + (r.players?.length || 0), 0);
          const mt = result.course ? `, ${result.course.metersTotal}m` : "";
          console.log(`  ${id}: ${result.meta.name?.slice(0, 48) || "?"} (${result.rounds.length} R, ${nP} entries${mt})`);
        } else {
          fail++;
        }
      } catch (e) { fail++; }
    }
  }
  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  console.log(`\nDone: ok=${ok} fail=${fail} skip=${skip}`);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { scrapeTorneo, parseEstadisticas, parseHoyoAHoyo, httpGet };
