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
  const dropped = [];                 // linhas-jogador que falharam o parse forte — NUNCA descartadas em silêncio
  const trRe = /<tr[^>]*(?:class="(?:altrow|altrow_alt)"|id="jugador-\d+")[^>]*>([\s\S]+?)<\/tr>/gi;

  // Classe de nome tolerante: \p{L} apanha QUALQUER letra unicode (à/è/ï/ç/·, além
  // de áéíóúñü) — nomes catalães/estrangeiros deixam de fazer a linha falhar e
  // desaparecer (ex: PUJOLÀ, GONÇALVES, MÜLLER). Mantemos o parse forte (scorecard
  // completo) como caminho normal e um fallback que recupera/regista o resto.
  const NAME = "[\\p{L}\\s,'.\\-·]+?";
  const strictRe = new RegExp(`^[> ]*(T?\\d+|\\d+|—)?\\s+(${NAME})\\s+\\*?\\s*([+\\-]\\d+|E|Par)\\s+((?:\\d+\\s+){19,21}\\d+)\\s+([+\\-]\\d+|E|Par)`, "u");
  const looseRe = new RegExp(`^[> ]*(T?\\d+|\\d+|—)?\\s+(${NAME})\\s+\\*?\\s*([+\\-]\\d+|E|Par)\\s+(.+)$`, "u");
  const toTp = (raw) => (raw === "E" || raw === "Par") ? 0 : parseInt(raw, 10);

  let m;
  while ((m = trRe.exec(html)) !== null) {
    const block = m[1];
    // memberId: pode estar no próprio <tr id="jugador-N"> OU num <span id="star-N">
    // interno — procurar na linha INTEIRA (m[0]) para apanhar ambos os casos e
    // garantir a MESMA chave de jogador entre hoyoahoyo e backfill da classificação.
    const idM = /id="(?:star|jugador|fichalink)-(\d+)"/.exec(m[0]);
    const memberId = idM ? idM[1] : null;
    const blockText = stripTags(block);

    // ── Caminho normal: scorecard completo ──
    const r = strictRe.exec(blockText);
    if (r) {
      const posStr = r[1] ? r[1].replace(/^T/, "") : "";
      const pos = posStr ? parseInt(posStr, 10) : null;
      const name = r[2].trim().replace(/\s{2,}/g, " ");
      const nums = r[4].trim().split(/\s+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
      let scores = null, total = null, halves = null;
      if (nums.length >= 21) {
        scores = [...nums.slice(0, 9), ...nums.slice(10, 19)];
        halves = [nums[9], nums[19]];
        total = nums[20];
      }
      players.push({ memberId, pos, name, toPar: toTp(r[3]), hoy: toTp(r[5]), scores, halves, total });
      continue;
    }

    // ── Fallback: o parse forte falhou (nome com carácter inesperado, espaçamento,
    //    scorecard incompleto). Recuperamos o máximo possível em vez de descartar. ──
    const lr = looseRe.exec(blockText);
    if (lr) {
      const posStr = lr[1] ? lr[1].replace(/^T/, "") : "";
      const pos = posStr ? parseInt(posStr, 10) : null;
      const name = lr[2].trim().replace(/\s{2,}/g, " ");
      const tail = lr[4].trim();
      const tpTokens = tail.match(/[+\-]\d+|E|Par/g) || [];
      const hoyRaw = tpTokens.length ? tpTokens[tpTokens.length - 1] : null;
      const nums = tail.split(/\s+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
      let scores = null, total = null, halves = null;
      if (nums.length >= 21) {           // scorecard completo recuperado → jogador válido
        scores = [...nums.slice(0, 9), ...nums.slice(10, 19)];
        halves = [nums[9], nums[19]];
        total = nums[20];
      }
      players.push({ memberId, pos, name, toPar: toTp(lr[3]), hoy: hoyRaw ? toTp(hoyRaw) : 0, scores, halves, total, _partial: scores == null });
      dropped.push({ memberId, name, reason: scores == null ? "partial" : "recovered", text: blockText.slice(0, 140) });
      continue;
    }

    // ── Nem o fallback apanhou: registar para inspecção (NUNCA descartar calado). ──
    if (memberId || /[A-Za-z]{3,}/.test(blockText)) {
      dropped.push({ memberId, reason: "unparsed", text: blockText.slice(0, 140) });
    }
  }

  return { par, players, dropped };
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

/** Extrai "Valor del campo: 72.8 | Slope: 135" da página de classificação. */
function parseCourseValue(html) {
  let courseRating = null, slope = null;
  const cr = /Valor del campo:\s*([\d]+(?:[.,]\d+)?)/i.exec(html);
  if (cr) { const v = parseFloat(cr[1].replace(",", ".")); if (!isNaN(v)) courseRating = v; }
  const sl = /Slope:\s*([\d]+)/i.exec(html);
  if (sl) { const v = parseInt(sl[1], 10); if (!isNaN(v)) slope = v; }
  return { courseRating, slope };
}

function normNameLgs(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Página de classificação geral (/torneos/clasificacion/{id}). Tem, por jogador,
 * os TOTAIS de cada ronda (colunas 1,2,3) + total final de TODOS os jogadores —
 * incluindo os que o hoyoahoyo de alguma ronda não listou. Usa-se para PREENCHER
 * rondas em falta.
 *
 * Segurança contra leitura errada de colunas: só aceitamos os totais por ronda
 * quando a sua SOMA bate exactamente com o total final (auto-validação
 * aritmética). Se não bater, roundTotals=null e não se preenche nada — nunca se
 * inventa um score.
 */
function parseClasificacion(html, nRounds) {
  const out = [];
  const trRe = /<tr[^>]*(?:class="(?:altrow|altrow_alt)"|id="jugador-\d+")[^>]*>([\s\S]+?)<\/tr>/gi;
  const NAME = "[\\p{L}\\s,'.\\-·]+?";
  // pos + nome + ±AlPar + resto (hoyo, ±hoy, totais por ronda, total)
  const re = new RegExp(`^[> ]*(T?\\d+|\\d+|—)?\\s+(${NAME})\\s+([+\\-]\\d+|E|Par)\\s+(.+)$`, "u");
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const idM = /id="(?:star|jugador|fichalink)-(\d+)"/.exec(m[0]);
    const memberId = idM ? idM[1] : null;
    const blockText = stripTags(m[1]);
    const r = re.exec(blockText);
    if (!r) continue;
    const posStr = r[1] ? r[1].replace(/^T/, "") : "";
    const pos = posStr ? parseInt(posStr, 10) : null;
    const name = r[2].trim().replace(/\s{2,}/g, " ");
    const toPar = (r[3] === "E" || r[3] === "Par") ? 0 : parseInt(r[3], 10);
    // Inteiros SEM sinal no resto (ignora os ±toPar/±hoy). Inclui "hoyo" (18) à
    // cabeça, depois os totais por ronda e o total final.
    const ints = r[4].split(/\s+/).filter(t => /^\d+$/.test(t)).map(Number);
    let roundTotals = null, total = null;
    if (ints.length >= nRounds + 1) {
      const cand = ints.slice(-(nRounds + 1));        // [r1..rN, total]
      const t = cand[cand.length - 1];
      const rts = cand.slice(0, nRounds);
      if (rts.every(v => v > 0 && v < 999) && rts.reduce((a, b) => a + b, 0) === t) {
        roundTotals = rts; total = t;
      }
    }
    out.push({ memberId, name, pos, toPar, roundTotals, total });
  }
  return out;
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
    // Tornar visível qualquer linha que o parse forte não apanhou — antes
    // desapareciam em silêncio (ex: 2º classificado a sumir de R1/R2 → top-3 errado).
    const dr = parsed.dropped || [];
    if (dr.length) {
      const rec = dr.filter(d => d.reason === "recovered").length;
      const part = dr.filter(d => d.reason === "partial").length;
      const uns = dr.filter(d => d.reason === "unparsed").length;
      console.warn(`  ⚠ id=${id} R${r.round}: ${parsed.players.length} jogadores` +
        (rec ? `, +${rec} recuperados via fallback` : "") +
        (part ? `, ${part} parciais (sem scorecard completo)` : "") +
        (uns ? `, ${uns} linhas NÃO parseadas` : ""));
      for (const d of dr) {
        if (d.reason === "unparsed") console.warn(`      [unparsed] mid=${d.memberId || "?"} :: ${d.text}`);
      }
    }
    roundsData.push({ round: r.round, label: r.label, par: parsed.par, players: parsed.players });
  }

  // 3. Estatísticas por buraco — metros + SI + par + média (distâncias jogadas).
  let course = null;
  try {
    const est = await httpGet(`https://rfegolf.livegolfscoring.es/torneos/estadisticas/${id}`);
    if (est.status === 200) course = parseEstadisticas(est.body);
  } catch (e) { /* sem estatísticas publicadas — ok */ }

  // 3b. Página de classificação geral: Course Rating/Slope (Valor del campo) +
  //     totais por ronda de TODOS os jogadores. Cruzamos estes totais para
  //     PREENCHER rondas que o hoyoahoyo não listou (ex: 2º classificado ausente
  //     de R1/R2). Aditivo e defensivo: nunca sobrescreve o hoyoahoyo, e se a
  //     página falhar o output fica igual.
  let classification = [];
  try {
    const cls = await httpGet(`https://rfegolf.livegolfscoring.es/torneos/clasificacion/${id}`);
    if (cls.status === 200) {
      const cv = parseCourseValue(cls.body);
      if (cv.courseRating != null || cv.slope != null) {
        course = course || {};
        course.courseRating = cv.courseRating;
        course.slope = cv.slope;
      }
      classification = parseClasificacion(cls.body, rounds.length);
      let filled = 0;
      for (const cp of classification) {
        if (!cp.roundTotals) continue;                 // só os auto-validados (soma = total)
        for (let i = 0; i < cp.roundTotals.length; i++) {
          const rd = roundsData.find(x => x.round === i + 1);
          if (!rd) continue;
          const present = rd.players.some(p =>
            (cp.memberId && p.memberId === cp.memberId) ||
            (!cp.memberId && normNameLgs(p.name) === normNameLgs(cp.name)));
          if (present) continue;                        // já temos (hoyoahoyo manda)
          rd.players.push({
            memberId: cp.memberId, pos: null, name: cp.name,
            toPar: null, hoy: 0, scores: null, halves: null,
            total: cp.roundTotals[i], _fromClassif: true,
          });
          filled++;
        }
      }
      if (filled) console.warn(`  ↺ id=${id}: ${filled} ronda(s) preenchida(s) via classificação geral`);
      else if (classification.length) console.warn(`  · id=${id}: classificação lida (${classification.length} jogadores), 0 rondas em falta para preencher`);
    }
  } catch (e) { console.warn(`  ⚠ id=${id}: classificação geral indisponível (${e.message})`); }

  return { id, ok: true, scrapedAt: new Date().toISOString(), meta, course, rounds: roundsData, classification };
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
