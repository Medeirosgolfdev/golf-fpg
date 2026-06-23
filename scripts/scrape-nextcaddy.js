/**
 * scripts/scrape-nextcaddy.js
 *
 * Scraper Node-puro para nextcaddy.com — plataforma das federações Andaluza
 * (RFGA, prefixo `AM`) e Madrid (FGM, prefixo `CM`).
 *
 * NÃO precisa de Playwright/browser. Usa endpoints públicos descobertos via
 * Symfony FOS Router (/js/routing):
 *
 *   - POST /getListadoClasificaciones (body: id=N) → HTML leaderboard
 *       Pos | Jogador | Licencia | Hcp | Nivel | J1 | HcpJ J1 | J2 | HcpJ J2 | Total | ±Par
 *   - POST /getListadoInscritos       (body: id=N) → HTML lista de inscritos
 *   - GET  /getListadoEstadisticas?id=N           → JSON estatísticas
 *   - GET  /stats/rounds/N                         → JSON [{roundNumber,roundId}]
 *   - GET  /stats/scoreTypes/N                     → JSON birdies/eagles per hole
 *   - GET  /tour/{id}                              → HTML page com metadata
 *   - GET  /competiciones-comite                   → discovery (todas as zonas RFGA+FGM)
 *
 * NOTA: distâncias/par/SI por buraco NÃO são expostos publicamente. Os scores
 * vêm em formato gross por ronda + sobrepar relativo. Para par absoluto cruzar
 * com outras fontes (BlueGolf, USKids course archives, etc.).
 *
 * USO:
 *   node scripts/scrape-nextcaddy.js --tour 61094
 *   node scripts/scrape-nextcaddy.js --tour 61094,61073
 *   node scripts/scrape-nextcaddy.js --discover                # /competiciones-comite (todos)
 *   node scripts/scrape-nextcaddy.js --discover --comite 1     # só Infantil y Juvenil
 *   node scripts/scrape-nextcaddy.js --discover --club AM00    # só RFGA
 *   node scripts/scrape-nextcaddy.js --scope scripts/nextcaddy-scope.json
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT_DIR = path.resolve(__dirname, "../public/data/nextcaddy");

/* ─── existingIsComplete — decide se um ficheiro já em disco deve ser saltado ──
 * Com --skip-existing, NÃO basta o ficheiro existir: um torneio descoberto
 * ANTES de ser jogado é gravado com leaderboard vazio e, sem isto, ficava
 * congelado vazio para sempre (skip-existing saltava-o em cada run, mesmo
 * depois de os resultados serem publicados).
 * Considera-se "completo" (saltável) se já tem jogadores no leaderboard OU
 * se é genuinamente PDF-only (nunca terá tabela HTML para parsear). Caso
 * contrário (vazio/futuro/ilegível) re-obtém-se a cada run até ter dados. */
function existingIsComplete(file) {
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    const hasPlayers = (d.leaderboard || []).some((c) => (c.players || []).length > 0);
    return hasPlayers || d.leaderboardPdfOnly === true;
  } catch {
    return false; // ilegível/truncado → re-obter
  }
}
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = "https://www.nextcaddy.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// HTTP keep-alive agent — reuse de conexões TCP/TLS, drasticamente reduz overhead em fetches sequenciais
const AGENT = new https.Agent({ keepAlive: true, maxSockets: 8, keepAliveMsecs: 5000 });

/* ─── HTTP helper ────────────────────────────────────────────── */

function httpReq(method, urlStr, opts) {
  opts = opts || {};
  const body = opts.body || null;
  const headers = Object.assign({
    "User-Agent": UA,
    "Accept": opts.accept || "text/html,application/json,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Referer": BASE + "/",
  }, opts.headers || {});
  if (body && method === "POST") {
    headers["Content-Type"] = headers["Content-Type"] || "application/x-www-form-urlencoded; charset=UTF-8";
    headers["Content-Length"] = Buffer.byteLength(body);
    headers["X-Requested-With"] = "XMLHttpRequest";
  }
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request({
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers,
      timeout: 25000,
      agent: AGENT,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, urlStr).toString();
        res.resume();
        httpReq(method, next, opts).then(resolve, reject);
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    if (body) req.write(body);
    req.end();
  });
}

const get = (u, o) => httpReq("GET", u, o);
const post = (u, body, o) => httpReq("POST", u, Object.assign({ body }, o || {}));

/* ─── Helpers de parsing ──────────────────────────────────────── */

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => {
      const map = { aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
                    ntilde: "ñ", Ntilde: "Ñ", lt: "<", gt: ">" };
      return map[name] || m;
    });
}

function stripTags(s) {
  if (!s) return "";
  return decodeEntities(String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function trCells(trHtml) {
  const cells = [];
  const re = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let m;
  while ((m = re.exec(trHtml)) !== null) cells.push(m[1]);
  return cells;
}

/* ─── parseClasificacionesMeta — extrai nomes das categorias do dropdown topo ─── */
// O HTML de getListadoClasificaciones tem um dropdown no topo com os nomes
// completos das categorias e contagens, ex:
//   <a class="header" href="#clasif_7_title">Clasificación Final Absoluta Indistinta</a>
//   <span class="description disabled">47 jugadores</span>
// Construímos um Map { catId → {name, jugadoresCount} }
function parseClasificacionesMeta(html) {
  const meta = {};
  const re = /<a\s+class="header"\s+href="#clasif_(\d+)_title">\s*([^<]+?)\s*<\/a>\s*<span\s+class="description[^"]*"[^>]*>\s*(\d+)\s+jugadores/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    meta[m[1]] = { name: stripTags(m[2]), jugadores: parseInt(m[3], 10) };
  }
  return meta;
}

/* ─── parsePdfsAttached — PDFs anexos no response (banderas, results) ── */
function parsePdfsAttached(html) {
  const out = new Set();
  for (const m of html.matchAll(/\/uploads\/[^"'\s)<>]+\.pdf/gi)) out.add(m[0]);
  return [...out];
}

/* ─── parseClasificaciones — leaderboard ─────────────────────── */

function parseClasificaciones(html) {
  const tables = [];
  const namesByCat = parseClasificacionesMeta(html);
  // Detectar caso "PDF only" (togglePDF sem tabela)
  const pdfOnly = /<object[^>]+togglePDF/.test(html) && !/<table[^>]+id="clasif_\d+_frontend"/.test(html);
  if (pdfOnly) {
    const pdfs = parsePdfsAttached(html);
    return { tables: [], pdfOnly: true, pdfs, names: namesByCat };
  }
  const tblRe = /<table[^>]+id="clasif_(\d+)_frontend"[\s\S]+?<\/table>/gi;
  let m;
  while ((m = tblRe.exec(html)) !== null) {
    const tblHtml = m[0];
    const categoryNum = parseInt(m[1], 10);
    const rows = [];
    const trRe = /<tr[^>]*>([\s\S]+?)<\/tr>/gi;
    let trM;
    let header = null;
    while ((trM = trRe.exec(tblHtml)) !== null) {
      const cells = trCells(trM[1]).map(stripTags);
      // Capture inscribedId from any /tarjeta-aux/N/-1 link in this row
      const tarjM = /href="\/tarjeta-aux\/(\d+)\/(-?\d+)"/.exec(trM[1]);
      const inscribedId = tarjM ? parseInt(tarjM[1], 10) : null;
      if (!header && cells.some((c) => /Pos/i.test(c)) && cells.some((c) => /Jugador/i.test(c))) {
        header = cells;
        continue;
      }
      if (cells.length < 4) continue;
      rows.push({ cells, inscribedId });
    }
    if (!header) continue;

    const idx = (re) => header.findIndex((c) => new RegExp(re, "i").test(c));
    const cPos = idx("^Pos");
    const cName = header.findIndex((c, i) => /Jugador/i.test(c) && i > 0);
    const cLicencia = idx("Licencia");
    const cHcp = idx("^Hcp$");
    const cNivel = idx("^Nivel$");
    const cTotal = idx("^Total");
    const roundCols = [];
    for (let i = 0; i < header.length; i++) {
      const m2 = /^J(\d+)$/.exec(header[i]);
      if (m2) roundCols.push({ round: parseInt(m2[1], 10), idx: i });
    }

    const players = [];
    for (const row of rows) {
      const r = row.cells;
      const pos = parseInt((r[cPos] || "").replace(/[^0-9]/g, ""), 10) || null;
      const name = (cName >= 0 ? r[cName] : null) || (r[1] || "").trim();
      const licencia = cLicencia >= 0 ? r[cLicencia] : null;
      const hcpStr = cHcp >= 0 ? r[cHcp] : null;
      const hcp = hcpStr && /^-?\d+(\.\d+)?$/.test(hcpStr) ? parseFloat(hcpStr) : null;
      const nivel = cNivel >= 0 ? r[cNivel] : null;
      const totalStr = cTotal >= 0 ? r[cTotal] : null;
      const total = totalStr && /^\d+$/.test(totalStr) ? parseInt(totalStr, 10) : null;
      const toParStr = cTotal >= 0 && r[cTotal + 1] ? r[cTotal + 1] : "";
      const toParM = /([+-]?\d+|E)/.exec(toParStr);
      let toPar = null;
      if (toParM) toPar = toParM[1] === "E" ? 0 : parseInt(toParM[1], 10);
      const rounds = roundCols.map((rc) => {
        const v = r[rc.idx];
        return { round: rc.round, gross: v && /^\d+$/.test(v) ? parseInt(v, 10) : null };
      });
      if (!name && !licencia) continue;
      players.push({ pos, name, licencia, hcp, nivel, rounds, total, toPar, inscribedId: row.inscribedId });
    }
    const meta = namesByCat[String(categoryNum)] || {};
    tables.push({ category: categoryNum, categoryName: meta.name || null, expectedJugadores: meta.jugadores || null, header, players });
  }
  return { tables, pdfOnly: false, pdfs: parsePdfsAttached(html), names: namesByCat };
}

/* ─── parseScorecard — extrai par/SI/metros + scores hole-by-hole ─── */

function parseScorecard(html) {
  // Detecta automaticamente 18H ou 9H baseado no header.
  // 18H: ["", "1", "2", ..., "9", "I", "10", ..., "18", "V", "T"] (22 cells)
  // 9H:  ["", "1", "2", ..., "9", "T"] (11 cells) ou ["", "1", ..., "9", "I", "T"] (12 cells)
  const trRe = /<tr[^>]*>([\s\S]+?)<\/tr>/gi;
  const allRows = [];
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const cells = trCells(m[1]).map(stripTags);
    if (cells.length >= 5) allRows.push(cells);
  }

  function isHeader18(r) {
    return r.length >= 19 && r.includes("I") && r.includes("V") && r.includes("T")
        && r.includes("1") && r.includes("18");
  }
  function isHeader9(r) {
    return r.length >= 10 && r.includes("T") && r.includes("1") && r.includes("9")
        && !r.includes("18") && !r.includes("V");
  }
  function isHeader(r) { return isHeader18(r) || isHeader9(r); }
  function numCells(row, skipFirstN) {
    const out = [];
    for (let k = skipFirstN; k < row.length; k++) {
      const v = row[k];
      if (/^-?\d+$/.test(v)) out.push(parseInt(v, 10));
      else if (v === "-" || v === "") out.push(null);
    }
    return out;
  }
  function holesOnly18(arr) {
    if (arr.length < 21) return arr;
    return [...arr.slice(0, 9), ...arr.slice(10, 19)];
  }
  function holesOnly9(arr) {
    // 9H: arr is [h1..h9, total] or [h1..h9, I_total, total]
    if (arr.length === 10) return arr.slice(0, 9);
    if (arr.length === 11) return arr.slice(0, 9);
    return arr.slice(0, 9);
  }

  const rounds = [];
  let par = null, si = null, meters = null;
  let nineHole = false;

  for (let i = 0; i < allRows.length; i++) {
    if (!isHeader(allRows[i])) continue;
    const is9H = !isHeader18(allRows[i]) && isHeader9(allRows[i]);
    if (is9H) nineHole = true;
    const holesOnly = is9H ? holesOnly9 : holesOnly18;
    const minScores = is9H ? 9 : 18;

    const block = allRows.slice(i + 1, i + 7);
    const metrosRow = block.find((rr) => /^Metros$/i.test(rr[0] || ""));
    const hcpRow = block.find((rr) => /^Hcp$/i.test(rr[0] || ""));
    const parRow = block.find((rr) => /^Par$/i.test(rr[0] || ""));
    if (!parRow) continue;

    if (par == null) {
      par = holesOnly(numCells(parRow, 1));
      if (hcpRow) si = holesOnly(numCells(hcpRow, 1));
      if (metrosRow) meters = holesOnly(numCells(metrosRow, 2));
    }

    const parIdx = allRows.indexOf(parRow);
    if (parIdx < 0 || parIdx + 1 >= allRows.length) continue;
    const scoresRow = allRows[parIdx + 1];
    const sNums = numCells(scoresRow, 1);
    if (sNums.length < minScores) continue;
    const scores = holesOnly(sNums);
    const total = sNums[sNums.length - 1] ?? null;
    rounds.push({ round: rounds.length + 1, scores, total });
    i = parIdx + 1;
  }
  return { par, si, meters, rounds, nineHole };
}

async function fetchScorecard(inscribedId) {
  // FAIL-FAST: timeout 6s, sem retries. Os que falharem são apanhados no patch mode.
  if (!inscribedId) return null;
  try {
    const r = await Promise.race([
      get(`${BASE}/tarjeta-aux/${inscribedId}/-1`),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout-fast")), 6000)),
    ]);
    if (r.status !== 200 || r.body.length < 5000) return null;
    return parseScorecard(r.body);
  } catch {
    return null;
  }
}

/* ─── parseInscritos — inscritos list ─────────────────────────── */

function parseInscritos(html) {
  const trRe = /<tr[^>]*>([\s\S]+?)<\/tr>/gi;
  let m;
  let header = null;
  const rows = [];
  while ((m = trRe.exec(html)) !== null) {
    const cells = trCells(m[1]).map(stripTags);
    if (!header && cells.some((c) => /Orden|Pos/i.test(c)) && cells.some((c) => /Jugador/i.test(c))) {
      header = cells;
      continue;
    }
    if (cells.length < 3) continue;
    rows.push(cells);
  }
  if (!header) return [];
  const idx = (re) => header.findIndex((c) => new RegExp(re, "i").test(c));
  const cOrden = idx("Orden|Pos");
  const cName = idx("Jugador");
  const cHcp = idx("^Hcp$|H[áa]ndicap");
  const cLicencia = idx("Licencia");
  const cNivel = idx("Nivel|Categor");
  const players = [];
  for (const r of rows) {
    const orden = cOrden >= 0 ? parseInt((r[cOrden] || "").replace(/[^0-9]/g, ""), 10) || null : null;
    const name = cName >= 0 ? r[cName] : null;
    const hcp = cHcp >= 0 && r[cHcp] && /^-?\d+(\.\d+)?$/.test(r[cHcp]) ? parseFloat(r[cHcp]) : null;
    const licencia = cLicencia >= 0 ? r[cLicencia] : null;
    const nivel = cNivel >= 0 ? r[cNivel] : null;
    if (!name && !licencia) continue;
    players.push({ orden, name, licencia, hcp, nivel });
  }
  return players;
}

/* ─── parseEstadisticas — JSON ────────────────────────────────── */

function parseEstadisticas(jsonStr) {
  try {
    const obj = JSON.parse(jsonStr);
    const stats = {};
    for (const [catId, catData] of Object.entries(obj)) {
      const cat = {};
      for (const [graphKey, gData] of Object.entries(catData)) {
        if (typeof gData !== "object" || !gData.datos) continue;
        try {
          const datosStr = String(gData.datos).replace(/'/g, '"');
          const parsed = JSON.parse(datosStr);
          cat[graphKey] = { id: gData.id, datos: parsed };
        } catch { /* skip */ }
      }
      stats[catId] = cat;
    }
    return stats;
  } catch {
    return null;
  }
}

/* ─── parseTourMeta — page metadata ───────────────────────────── */

function parseTourMeta(html) {
  const meta = { name: null, organizer: null, course: null, courseCode: null,
                 dateStart: null, dateEnd: null, format: null, categories: [] };
  const propsM = /data-symfony--ux-react--react-props-value="([^"]+)"/.exec(html);
  if (propsM) {
    const v = decodeEntities(propsM[1]);
    try {
      const obj = JSON.parse(v);
      if (obj.competitionName) meta.name = obj.competitionName;
    } catch { /* ignore */ }
  }
  const orgM = /data-content="(Organizado por [^"]+)"/.exec(html);
  if (orgM) meta.organizer = orgM[1].replace(/^Organizado por /, "");
  const clubM = /href="\/club\/([A-Z]{2}[A-Z0-9]+)"[^>]*>([^<]+)<\/a>/.exec(html);
  if (clubM) {
    meta.courseCode = clubM[1];
    meta.course = stripTags(clubM[2]);
  }
  const visible = stripTags(html.replace(/<script[\s\S]+?<\/script>|<style[\s\S]+?<\/style>/g, ""));
  const formatM = /(Medal Play[^|]{0,30}|Stableford[^|]{0,30}|Match Play[^|]{0,30})/i.exec(visible);
  if (formatM) meta.format = formatM[1].trim();
  const catList = visible.match(/(?:Alev[ií]n|Benjam[ií]n|Cadete|Infantil|Juvenil|Junior|Caballeros|Se[ñn]oras|Senior|Profesional)\s*(?:Masculino|Femenino)?/gi);
  if (catList) meta.categories = [...new Set(catList.map((c) => c.replace(/\s+/g, " ").trim()))];
  return meta;
}

/* ─── parseDiscoveryCard — extrai metadata por tour da página de listagem ─ */

function parseDiscoveryCards(html) {
  // Cada card tem padrão:
  //   <a href="/tour/{id}">{name}</a> ... DD MMM YYYY ... N vueltas ... AM{NN}/CM{NN}
  // Apanhamos cada bloco em torno do anchor.
  const found = [];
  const seen = new Set();
  const linkRe = /<a[^>]+href="\/tour\/(\d+)"[^>]*>([\s\S]{1,500}?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const id = parseInt(m[1], 10);
    if (seen.has(id)) continue;
    seen.add(id);
    const text = stripTags(m[2]);
    if (!text) continue;
    const ctx = stripTags(html.slice(m.index, m.index + 2000));
    const dateM = /(\d{1,2}\s+(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s+20\d{2})/i.exec(ctx);
    const vueltasM = /(\d+)\s+vueltas?/i.exec(ctx);
    const clubM = /\b([A-Z]{2}[A-Z0-9]{1,3})\b/.exec(ctx.slice(text.length));
    const yearM = dateM ? /(20\d{2})/.exec(dateM[1]) : null;
    found.push({
      tourId: id,
      name: text,
      date: dateM ? dateM[1] : null,
      rounds: vueltasM ? parseInt(vueltasM[1], 10) : null,
      clubCode: clubM ? clubM[1] : null,
      year: yearM ? parseInt(yearM[1], 10) : null,
    });
  }
  return found;
}

/* ─── parseHorarios — tee times por ronda (POST /getListadoHorarios) ─── */
// Cada ronda aparece num bloco delimitado por <h4 ... data-table-index="N"> seguido
// da tabela. Extracted inline em vez de exigir scrape-nextcaddy-horarios.js.
function parseHorarios(html) {
  const rounds = [];
  const splits = [];
  const headerRe = /<h4[^>]*data-table-index="(\d+)"/g;
  let m;
  while ((m = headerRe.exec(html)) !== null) splits.push({ round: parseInt(m[1], 10), idx: m.index });
  for (let i = 0; i < splits.length; i++) {
    const start = splits[i].idx;
    const end = i + 1 < splits.length ? splits[i + 1].idx : html.length;
    const segment = html.slice(start, end);
    const players = [];
    let lastTime = null, lastTee = null;
    const trRe = /<tr class="gradeX[^"]*">([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = trRe.exec(segment)) !== null) {
      const row = rowMatch[1];
      const tdNegrita = /<td class="negrita">([\s\S]*?)<\/td>/.exec(row);
      let time = null;
      if (tdNegrita) {
        const v = /<span class="visibleSearch">\s*([0-9:]+)\s*<\/span>/.exec(tdNegrita[1]);
        if (v) time = v[1];
      }
      const tdTee = /<td class="mobile hidden center aligned">([\s\S]*?)<\/td>/.exec(row);
      let tee = null;
      if (tdTee) {
        const t = /<span class="visibleSearch">\s*(\d+)\s*<\/span>/.exec(tdTee[1]);
        if (t) tee = parseInt(t[1], 10);
      }
      if (time) lastTime = time; else time = lastTime;
      if (tee != null) lastTee = tee; else tee = lastTee;
      const nameM = /<td class="nombre-horario"\s+data-ins="(\d+)"\s+data-jid="(\d+)">([\s\S]*?)<\/td>/.exec(row);
      if (!nameM) continue;
      const nameInner = /<div[^>]*>([\s\S]*?)(?:<\/div>|$)/.exec(nameM[3]);
      const name = stripTags(nameInner ? nameInner[1] : nameM[3]);
      const hcpM = /<td class="right aligned">\s*([+\-]?[0-9.]+)/.exec(row);
      const hcp = hcpM ? parseFloat(hcpM[1]) : null;
      const nivelM = /<td class="disabled center aligned mostrarNivel[^"]*">\s*([A-Z0-9]+)/.exec(row);
      const nivel = nivelM ? nivelM[1].trim() : null;
      players.push({ time, tee, name, hcp, ins: nameM[1], jid: nameM[2], nivel });
    }
    if (players.length > 0) rounds.push({ round: splits[i].round, players });
  }
  return rounds;
}

/* ─── scrapeTour — orquestra todos os endpoints por torneio ─── */

async function scrapeTour(tourId, opts) {
  opts = opts || {};
  const fetchScorecards = !!opts.scorecards;
  const scorecardConcurrency = opts.scorecardConcurrency || 4;

  const tasks = await Promise.all([
    get(`${BASE}/tour/${tourId}`),
    post(`${BASE}/getListadoClasificaciones`, `id=${tourId}`),
    post(`${BASE}/getListadoInscritos`, `id=${tourId}`),
    post(`${BASE}/getListadoHorarios`, `id=${tourId}`),
    get(`${BASE}/getListadoEstadisticas?id=${tourId}`, { accept: "application/json" }),
    get(`${BASE}/stats/rounds/${tourId}`, { accept: "application/json" }),
    get(`${BASE}/stats/scoreTypes/${tourId}`, { accept: "application/json" }),
  ]);
  const [pageR, clasR, inscR, horaR, estR, roundsR, scoreTypesR] = tasks;

  const meta = pageR.status === 200 ? parseTourMeta(pageR.body) : {};
  // parseClasificaciones agora devolve {tables, pdfOnly, pdfs, names}
  const clasParsed = clasR.status === 200 && clasR.body.length > 1000
    ? parseClasificaciones(clasR.body)
    : { tables: [], pdfOnly: false, pdfs: [], names: {} };
  const leaderboard = clasParsed.tables;
  const inscritos = inscR.status === 200 && inscR.body.length > 1000 ? parseInscritos(inscR.body) : [];
  const horarios = horaR.status === 200 && horaR.body.length > 500 ? parseHorarios(horaR.body) : [];
  const estadisticas = estR.status === 200 ? parseEstadisticas(estR.body) : null;
  let rounds = [];
  try { rounds = JSON.parse(roundsR.body); } catch { /* ignore */ }
  let scoreTypes = null;
  try { scoreTypes = JSON.parse(scoreTypesR.body); } catch { /* ignore */ }
  // PDFs: do clas response + da page (banderas, etc.)
  const pagePdfs = pageR.status === 200 ? parsePdfsAttached(pageR.body) : [];
  const allPdfs = [...new Set([...(clasParsed.pdfs || []), ...pagePdfs])];

  // Optionally fetch per-player scorecards (hole-by-hole) via /tarjeta-aux/{inscribedId}/-1
  // O par/SI/metros do campo é igual para todos os jogadores duma categoria — extrai da PRIMEIRA tarjeta e partilha.
  let courseScorecard = null;
  if (fetchScorecards && leaderboard.length > 0) {
    // Players podem aparecer em VÁRIAS categorias (Scratch + Hcp). Cache por inscribedId
    // para evitar fetches redundantes — fetch 1× e replicar resultado em todas as ocorrências.
    const allPlayers = leaderboard.flatMap((cat) => cat.players || []);
    const uniqueIds = [...new Set(allPlayers.filter((p) => p.inscribedId).map((p) => p.inscribedId))];
    const cache = new Map(); // inscribedId → scorecard

    if (uniqueIds.length > 0) {
      // Fetch first to get course par/SI/metros
      const firstSc = await fetchScorecard(uniqueIds[0]);
      cache.set(uniqueIds[0], firstSc);
      if (firstSc) {
        courseScorecard = { par: firstSc.par, si: firstSc.si, meters: firstSc.meters };
      }
      // Now fetch the rest — concurrency=4 + sem delay = ~600ms/fetch × 4 = ~150ms/fetch effective
      // Para 50 jogadores = ~8s. Throttling raro porque é HTTP keep-alive.
      let cursor = 1;
      async function worker() {
        while (cursor < uniqueIds.length) {
          const id = uniqueIds[cursor++];
          const sc = await fetchScorecard(id);
          cache.set(id, sc);
          // Sem delay — fail-fast já evita stalls
        }
      }
      const innerConc = scorecardConcurrency || 4;
      await Promise.all(Array.from({ length: innerConc }, () => worker()));

      // Aplicar scorecards do cache aos players (incluindo cópias em múltiplas categorias)
      for (const p of allPlayers) {
        if (!p.inscribedId) continue;
        const sc = cache.get(p.inscribedId);
        if (sc && sc.rounds) p.roundScores = sc.rounds;
      }
    }
  }

  return {
    tourId,
    url: `${BASE}/tour/${tourId}`,
    scrapedAt: new Date().toISOString(),
    meta,
    course: courseScorecard,   // { par[18], si[18], meters[18] } — só presente se --scorecards
    leaderboard,
    leaderboardPdfOnly: clasParsed.pdfOnly || false,
    categoryNames: clasParsed.names || {},  // { "1": {name:"Final Alevin Femenina", jugadores:5}, ... }
    inscritos,
    horarios,                  // [{round, players:[{time, tee, name, hcp, ins, jid, nivel}]}]
    estadisticas,
    roundIds: rounds,
    scoreTypes,
    pdfs: allPdfs,             // urls de PDFs (banderas, results, etc.) - apenas paths /uploads/...
  };
}

/* ─── discoverTours ──────────────────────────────────────────── */

async function discoverTours(opts) {
  opts = opts || {};
  const params = [];
  if (opts.comite != null && opts.comite !== "" && opts.comite !== "all") {
    params.push(`form%5Bcomite%5D=${encodeURIComponent(opts.comite)}`);
  }
  if (opts.year != null && opts.year !== "") {
    params.push(`form%5Banio%5D=${encodeURIComponent(opts.year)}`);
  }
  if (opts.provincia != null && opts.provincia !== "") {
    params.push(`form%5Bprovincia%5D=${encodeURIComponent(opts.provincia)}`);
  }
  if (opts.club) {
    // Club discovery: POST /competiciones-club/{code} com body "anio=YYYY"
    // (descoberto 2026-05-09 via inspecção do HTML — o dropdown faz
    // $("#anio").val(value); $("form").submit(); que vai POST para a mesma URL)
    const clubUrl = `${BASE}/competiciones-club/${opts.club}`;
    const body = opts.year ? `anio=${encodeURIComponent(opts.year)}` : "";
    const r = body ? await post(clubUrl, body) : await get(clubUrl);
    if (r.status !== 200) throw new Error(`Discovery failed: HTTP ${r.status}`);
    return parseDiscoveryCards(r.body);
  }
  const url = `${BASE}/competiciones-comite${params.length ? "?" + params.join("&") : ""}`;
  const r = await get(url);
  if (r.status !== 200) throw new Error(`Discovery failed: HTTP ${r.status}`);
  return parseDiscoveryCards(r.body);
}

/* ─── discoverToursMultiYear — varre todos os anos para um club/comite ── */

async function discoverToursMultiYear(opts) {
  opts = opts || {};
  const yearStart = parseInt(opts.yearStart || 2013, 10);
  const yearEnd = parseInt(opts.yearEnd || (new Date().getFullYear() + 1), 10);
  const seen = new Map(); // tourId → tour (dedup)
  for (let y = yearEnd; y >= yearStart; y--) {
    let tours;
    try {
      tours = await discoverTours({ ...opts, year: String(y) });
    } catch (e) {
      console.log(`  year ${y}: ERROR ${e.message}`);
      continue;
    }
    let added = 0;
    for (const t of tours) {
      if (!seen.has(t.tourId)) {
        seen.set(t.tourId, { ...t, discoveredYear: y });
        added++;
      }
    }
    console.log(`  year ${y}: ${tours.length} tours (${added} new)`);
    await new Promise((r) => setTimeout(r, 250));
  }
  return [...seen.values()];
}

/* ─── CLI ─────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);
  const getArg = (n, def) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : (def === undefined ? null : def); };
  const tourArg = getArg("tour");
  const scopeArg = getArg("scope");
  const discoverFlag = args.includes("--discover");
  const yearArg = getArg("year", null);
  const yearsArg = getArg("years", null);  // "all" ou "2020-2026" para varrer múltiplos anos
  const comiteArg = getArg("comite", null);
  const clubArg = getArg("club", null);
  const provinciaArg = getArg("provincia", null);
  const concurrency = parseInt(getArg("concurrency", "4"), 10);
  const skipExisting = args.includes("--skip-existing");
  const fetchScorecards = args.includes("--scorecards");
  const patchScorecards = args.includes("--patch-scorecards");  // 2ª passada: só completa scorecards em falta
  const outArg = getArg("out", null);
  const filterArg = getArg("filter", null);

  if (discoverFlag) {
    const tag = (clubArg ? `club-${clubArg}` :
                (comiteArg ? `comite-${comiteArg}` : "all")) +
                (yearArg ? `-y${yearArg}` : (yearsArg ? `-y${yearsArg}` : "")) +
                (provinciaArg ? `-p${provinciaArg}` : "");
    const out = outArg
      ? path.resolve(process.cwd(), outArg)
      : path.resolve(__dirname, `nextcaddy-scope-${tag}.json`);
    console.log(`Discover NextCaddy: ${clubArg ? `club=${clubArg}` : `comite=${comiteArg || "all"}`}, year=${yearArg || yearsArg || "current"}, provincia=${provinciaArg || "all"}`);
    let tours;
    if (yearsArg) {
      // Varrer múltiplos anos. "all" = 2013..nextYear; "2020-2026" = range
      let yStart, yEnd;
      if (yearsArg === "all") {
        yStart = 2013; yEnd = new Date().getFullYear() + 1;
      } else {
        const m = /^(\d{4})-(\d{4})$/.exec(yearsArg);
        if (!m) { console.error("--years must be 'all' or 'YYYY-YYYY'"); process.exit(1); }
        yStart = parseInt(m[1], 10); yEnd = parseInt(m[2], 10);
      }
      tours = await discoverToursMultiYear({ comite: comiteArg, club: clubArg, provincia: provinciaArg, yearStart: yStart, yearEnd: yEnd });
    } else {
      tours = await discoverTours({ comite: comiteArg, year: yearArg, club: clubArg, provincia: provinciaArg });
    }
    if (filterArg) {
      const re = new RegExp(filterArg, "i");
      const before = tours.length;
      tours = tours.filter((t) => re.test(t.name || ""));
      console.log(`  Filter "${filterArg}": ${before} → ${tours.length} tours`);
    }
    fs.writeFileSync(out, JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: clubArg ? `/competiciones-club/${clubArg}` : "/competiciones-comite",
      comite: comiteArg, year: yearArg, years: yearsArg, club: clubArg, provincia: provinciaArg,
      filter: filterArg,
      total: tours.length, tours,
    }, null, 2));
    console.log(`  ${tours.length} tours saved to ${out}`);
    for (const t of tours.slice(0, 15)) {
      console.log(`    ${t.tourId}: ${t.name.slice(0, 70)}${t.date ? " · " + t.date : ""}${t.rounds ? " · " + t.rounds + "R" : ""}${t.clubCode ? " · " + t.clubCode : ""}`);
    }
    return;
  }

  let tours = [];
  if (tourArg) tours = tourArg.split(",").map((s) => parseInt(s.trim(), 10));
  if (scopeArg) {
    const sc = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), scopeArg), "utf8"));
    tours = (sc.tours || sc.tournaments || sc).map((t) => t.tourId || t.id || t).filter(Boolean);
  }
  if (!tours.length) {
    console.log("Uso:");
    console.log("  --tour 61094");
    console.log("  --tour 61094,61073");
    console.log("  --scope path.json");
    console.log("  --discover                              # /competiciones-comite (RFGA+FGM, todas zonas)");
    console.log("  --discover --comite 1                   # só Infantil y Juvenil");
    console.log("  --discover --club AM00                  # só RFGA");
    console.log("  --discover --filter 'circuito juvenil'  # filtrar por nome");
    console.log("Flags: --concurrency N --skip-existing --out path.json --year YYYY --provincia N");
    process.exit(1);
  }

  console.log(`Scrape NextCaddy: ${tours.length} tour(s), concurrency=${concurrency}`);
  let ok = 0, fail = 0, skipped = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < tours.length) {
      const idx = cursor++;
      const tid = tours[idx];
      const outFile = path.join(OUT_DIR, `${tid}.json`);
      if (skipExisting && !patchScorecards && fs.existsSync(outFile) && existingIsComplete(outFile)) { skipped++; continue; }
      const t0 = Date.now();
      console.log(`  [${idx + 1}/${tours.length}] ${tid}: starting...`);
      try {
        let r;
        if (patchScorecards && fs.existsSync(outFile)) {
          // PATCH mode: lê JSON existente, fetcha só scorecards em falta
          r = JSON.parse(fs.readFileSync(outFile, "utf-8"));
          const allPlayers = (r.leaderboard || []).flatMap((c) => c.players || []);
          const missing = allPlayers.filter((p) => p.inscribedId && (!p.roundScores || p.roundScores.length === 0));
          const uniqueMissing = [...new Set(missing.map((p) => p.inscribedId))];
          if (uniqueMissing.length === 0) {
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            console.log(`  [${idx + 1}/${tours.length}] ${tid}: ${(r.meta && r.meta.name) || "?"} (já completo, ${elapsed}s)`);
            ok++; continue;
          }
          // Fetch missing IN SEQUENCE (concurrency 2 + 100ms)
          const cache = new Map();
          let pcursor = 0;
          async function pworker() {
            while (pcursor < uniqueMissing.length) {
              const id = uniqueMissing[pcursor++];
              const sc = await fetchScorecard(id);
              cache.set(id, sc);
              await new Promise((r) => setTimeout(r, 100));
            }
          }
          await Promise.all(Array.from({ length: 2 }, () => pworker()));
          // Aplicar aos players + actualizar course se ainda nao tem par
          let appliedCount = 0;
          for (const p of allPlayers) {
            if (!p.inscribedId) continue;
            const sc = cache.get(p.inscribedId);
            if (sc && sc.rounds && sc.rounds.length) {
              p.roundScores = sc.rounds;
              appliedCount++;
              // course pode ser {par: null,...} (truthy mas vazio) — usar par como teste real
              if ((!r.course || !Array.isArray(r.course.par)) && sc.par) r.course = { par: sc.par, si: sc.si, meters: sc.meters };
            }
          }
          r.scrapedAt = new Date().toISOString();
          fs.writeFileSync(outFile, JSON.stringify(r, null, 2));
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          const remaining = uniqueMissing.length - appliedCount;
          console.log(`  [${idx + 1}/${tours.length}] ${tid}: ${(r.meta && r.meta.name) || "?"} (patch +${appliedCount}/${uniqueMissing.length}${remaining > 0 ? `, ${remaining} ainda em falta` : ""}, ${elapsed}s)`);
          ok++; continue;
        }
        r = await scrapeTour(tid, { scorecards: fetchScorecards });
        fs.writeFileSync(outFile, JSON.stringify(r, null, 2));
        const allLbPlayers = (r.leaderboard || []).flatMap((t) => t.players || []);
        const uniqueLb = new Set(allLbPlayers.map((p) => p.inscribedId || p.licencia || p.name)).size;
        const uniqueSc = new Set(allLbPlayers.filter((p) => p.roundScores && p.roundScores.length).map((p) => p.inscribedId || p.licencia || p.name)).size;
        const inscCount = (r.inscritos || []).length;
        const horCount = (r.horarios || []).reduce((a, h) => a + (h.players || []).length, 0);
        const pdfCount = (r.pdfs || []).length;
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        const tag = `${(r.meta && r.meta.name) || "?"} (insc=${inscCount}, lb=${uniqueLb}${fetchScorecards ? `, sc=${uniqueSc}` : ""}, hor=${horCount}, pdf=${pdfCount}, ${elapsed}s)`;
        console.log(`  [${idx + 1}/${tours.length}] ${tid}: ${tag}`);
        ok++;
      } catch (e) {
        console.log(`  [${idx + 1}/${tours.length}] ${tid}: ERROR ${e.message}`);
        fail++;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  console.log(`\nDone: ok=${ok} fail=${fail} skipped=${skipped}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { scrapeTour, discoverTours, discoverToursMultiYear, parseClasificaciones, parseClasificacionesMeta, parsePdfsAttached, parseHorarios, parseInscritos, parseEstadisticas, parseTourMeta, parseDiscoveryCards, parseScorecard, fetchScorecard };
