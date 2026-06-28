/**
 * scripts/scrape-mitarjeta.js
 *
 * Scraper Node-puro do live-scoring `mitarjeta.golf` — a plataforma onde a RFEG
 * publica os resultados ao vivo dos Campeonatos de España juvenis (La Manga,
 * Serena Golf, etc.). Ao contrário do portal `rfegolf.es` (que só publica PDFs
 * de classificação DEPOIS do evento), o mitarjeta dá:
 *
 *   - Leaderboard ronda-a-ronda (Pos, Nome, Al Par, Hoyo, Hoy, R1..Rn, Total)
 *   - Federação regional (bandera) + ficha-id do jogador
 *   - Cartão do campo: Par, Hándicap (SI) e METROS por buraco
 *   - Valor del campo (Course Rating) + Slope
 *
 * Com CR + Slope + gross por ronda, calcula o SCORE DIFFERENTIAL (SD) WHS de
 * cada jogador em cada ronda:  SD = (113 / Slope) × (Gross − CR − PCC).
 * (PCC não é publicado pelo mitarjeta → assumido 0; anotado em `sdAssumesPcc0`.)
 *
 * USO (PowerShell, na raiz C:\golf-fpg):
 *   node scripts/scrape-mitarjeta.js --cee2026                 # os 6 Campeonatos de España 2026
 *   node scripts/scrape-mitarjeta.js --torneos 380,381,382     # ids mitarjeta à escolha
 *   node scripts/scrape-mitarjeta.js --comp 16192,16187        # por CompId RFEG (usa o mapa)
 *   node scripts/scrape-mitarjeta.js --cee2026 --no-inject     # não tocar nos ficheiros rfegolf-resultats
 *   node scripts/scrape-mitarjeta.js --cee2026 --pretty
 *
 * Output:
 *   - public/data/mitarjeta/{torneo}.json   (rico: campo + metros + SD por ronda)
 *   - injecta um bloco `results` em public/data/rfegolf-resultats/{compId}.json
 *     (esquema que a página /rfeg já renderiza) — desligável com --no-inject
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { writeJsonAtomic } = require("./lib/atomic-write");

const OUT_DIR = path.resolve(__dirname, "../public/data/mitarjeta");
const RFEG_DIR = path.resolve(__dirname, "../public/data/rfegolf-resultats");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// Mapa CompId RFEG (rfegolf.es) → torneo mitarjeta. Campeonatos de España 2026.
const COMP_TO_TORNEO = {
  16195: 377, // Benjamín Femenino
  16194: 378, // Benjamín Masculino
  16193: 379, // Alevín Femenino
  16192: 380, // Alevín Masculino
  16189: 381, // Infantil Femenino
  16187: 382, // Infantil Masculino
};
const TORNEO_TO_COMP = Object.fromEntries(
  Object.entries(COMP_TO_TORNEO).map(([c, t]) => [t, parseInt(c, 10)])
);

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function httpGet(urlStr, retries = 2) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const url = new URL(urlStr);
      const req = https.request({
        method: "GET", hostname: url.hostname, path: url.pathname + url.search,
        headers: { "User-Agent": UA, "Accept": "text/html,*/*", "Accept-Language": "es-ES,es;q=0.9" },
        timeout: 25000,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, urlStr).toString();
          res.resume(); httpGet(next, retries).then(resolve, reject); return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      });
      req.on("error", (e) => { if (n > 0) setTimeout(() => attempt(n - 1), 1500); else reject(e); });
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.end();
    };
    attempt(retries);
  });
}

function strip(s) {
  return String(s == null ? "" : s)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ")
    .replace(/\s+/g, " ").trim();
}
function cellsOf(trHtml) {
  return [...trHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => m[1]);
}
function tablesOf(html) {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => m[0]);
}
/** "+2"/"Par"/"E"/"-1" → number (0 para par/E). null se vazio/"-". */
function parseToPar(s) {
  const t = strip(s);
  if (!t || t === "-") return null;
  if (/^(par|e)$/i.test(t)) return 0;
  const n = parseInt(t.replace("+", ""), 10);
  return Number.isNaN(n) ? null : n;
}
function parseGross(s) {
  const t = strip(s);
  if (!t || t === "-") return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

/* ── parse da página de classificação ───────────────────────────── */
function parseClasificacion(html, torneo) {
  // Cabeçalho do campo: "Campo: NOME , ... Valor del campo: CR | Slope: SL"
  let course = null, courseRating = null, slope = null;
  const ci = html.indexOf("Campo:");
  if (ci >= 0) {
    const seg = strip(html.slice(ci, ci + 220).replace(/ASC:[\s\S]*$/, ""));
    // Nome do campo = entre "Campo:" e a 1ª vírgula (ou "Valor del campo").
    const nm = /Campo:\s*([^,|<]+?)\s*(?:,|Valor del campo|$)/i.exec(seg);
    if (nm) course = nm[1].trim() || null;
    const m2 = /Valor del campo:\s*([\d.]+)\s*\|\s*Slope:\s*(\d+)/i.exec(seg);
    if (m2) { courseRating = parseFloat(m2[1]); slope = parseInt(m2[2], 10); }
  }

  // Título
  let name = null;
  const tm = /<title>([\s\S]*?)<\/title>/i.exec(html);
  if (tm) name = strip(tm[1]).replace(/\s*-\s*Real Federaci.*$/i, "").trim();

  const tables = tablesOf(html);

  // Cartão do campo = última tabela com linhas [hole, par, si, meters]
  const perHole = [];
  const ht = tables[tables.length - 1] || "";
  for (const trM of ht.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const c = cellsOf(trM[0]).map(strip);
    if (c.length === 4 && /^\d+$/.test(c[0]) && /^\d+$/.test(c[1])) {
      perHole.push({ hole: +c[0], par: +c[1], si: +c[2], meters: +c[3] });
    }
  }
  const parTotal = perHole.reduce((a, h) => a + h.par, 0) || null;
  const metersTotal = perHole.reduce((a, h) => a + h.meters, 0) || null;

  // Leaderboard = tabela com linhas id="jugador-NNN"
  const lbTable = tables.find((t) => /id="jugador-\d+"/.test(t)) || "";
  const leaderboard = [];
  for (const trM of lbTable.matchAll(/<tr[^>]*id="jugador-(\d+)"[\s\S]*?<\/tr>/gi)) {
    const tr = trM[0];
    const c = cellsOf(tr).map(strip);
    if (c.length < 9) continue;
    // c: [star, region, "", pos, name, toPar, thru, today, R1, R2, R3, total]
    const fichaM = /\/ficha\/(\d+)/.exec(tr);
    const flagM = /class="flag"[^>]*title="([^"]*)"/i.exec(tr) || /class="flag"[^>]*alt="([^"]*)"/i.exec(tr);
    const posRaw = c[3] || null;
    const posNum = posRaw ? parseInt(String(posRaw).replace(/^T/i, ""), 10) : null;
    // O "*" no nome do mitarjeta = saída no buraco 10 (confirmado vs horários).
    // Removê-lo do nome; a saída fica registada via startHole (dos tee times).
    const hadStar = /\*/.test(c[4] || "");
    const name2 = (c[4] || "").replace(/\s*\*\s*/g, " ").replace(/\s+/g, " ").trim() || null;
    if (!name2) continue;
    const toPar = parseToPar(c[5]);
    const thru = parseInt(strip(c[6]), 10);
    const today = parseToPar(c[7]);
    // round grosses via class="golpesronda"
    const rounds = [...tr.matchAll(/class="golpesronda"[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => parseGross(m[1]));
    const total = parseGross(c[c.length - 1]);
    leaderboard.push({
      fichaId: fichaM ? fichaM[1] : null,
      pos: posNum, posRaw,
      name: name2, hadStar,
      region: flagM ? strip(flagM[1]) : null,
      toPar, thru: Number.isNaN(thru) ? null : thru, today,
      rounds, total,
    });
  }

  return { name, course, courseRating, slope, perHole, parTotal, metersTotal, leaderboard };
}

/** Conta as rondas declaradas via selector da página estadísticas (Ronda 1..N). */
async function fetchDeclaredRounds(torneo) {
  try {
    const r = await httpGet("https://mitarjeta.golf/torneos/estadisticas/" + torneo);
    const rs = [...r.body.matchAll(/\/torneos\/estadisticas\/\d+\/(\d+)"/g)].map((m) => +m[1]);
    return rs.length ? Math.max(...rs) : null;
  } catch (e) { return null; }
}

/* ── tee times / draw ───────────────────────────────────────────
 * Página /torneos/horarios/{torneo} — tabela [Tee, Hora, Jugador].
 * Uma linha com Tee+Hora abre um grupo; as linhas seguintes (Tee/Hora vazios)
 * acumulam mais jogadores no mesmo grupo. mitarjeta só publica a Ronda 1
 * (o param de ronda é ignorado — os draws de J2/J3 saem como PDFs depois). */
function parseHorarios(html) {
  let round = 1;
  const rm = /Salidas\s+ronda\s+(\d+)/i.exec(html);
  if (rm) round = parseInt(rm[1], 10);
  const table = (tablesOf(html)[0]) || "";
  const groups = [];
  let cur = null;
  for (const trM of table.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const c = cellsOf(trM[0]).map(strip);
    if (c.length < 3) continue;
    const tee = c[0], time = c[1], player = c[2];
    if (/^Tee$/i.test(tee) || /^Jugador$/i.test(player)) continue; // header
    if (tee && time) {
      cur = { tee: parseInt(tee, 10) || tee, time, players: [] };
      if (player) cur.players.push(player);
      groups.push(cur);
    } else if (cur && player) {
      cur.players.push(player);
    }
  }
  return groups.length ? { round, groups } : null;
}

async function fetchTeeTimes(torneo) {
  try {
    const r = await httpGet("https://mitarjeta.golf/torneos/horarios/" + torneo);
    if (r.status !== 200 || r.body.length < 1000) return { r1: null, all: [] };
    // A página linka as outras rondas: <a href="/torneos/horarios/{t}/{subid}">Ronda N</a>.
    // mitarjeta = mesmo backend do livegolfscoring → seguimos os links para apanhar
    // TODAS as rondas (antes só vinha a R1 da página base; J2/J3 ficavam de fora).
    const roundMap = {};
    const re = new RegExp(`<a[^>]*href="/torneos/horarios/${torneo}/(\\d+)"[^>]*>\\s*Ronda\\s*(\\d+)\\s*</a>`, "gi");
    let m; while ((m = re.exec(r.body)) !== null) roundMap[parseInt(m[2], 10)] = m[1];
    const all = [];
    for (const rn of Object.keys(roundMap).map(Number).sort((a, b) => a - b)) {
      const rr = await httpGet("https://mitarjeta.golf/torneos/horarios/" + torneo + "/" + roundMap[rn]);
      if (rr.status !== 200) continue;
      const parsed = parseHorarios(rr.body);
      if (parsed && parsed.groups.length) all.push({ round: rn, groups: parsed.groups });
    }
    // Sem links de ronda (ou só uma) → a própria página base é a tabela (R1).
    if (!all.length) { const base = parseHorarios(r.body); if (base && base.groups.length) all.push(base); }
    const r1 = all.find((x) => x.round === 1) || all[0] || null;
    return { r1, all };
  } catch (e) { return { r1: null, all: [] }; }
}

/* ── hole-by-hole (cartões) ──────────────────────────────────────
 * Página /torneos/hoyoahoyo/{torneo}/{ronda} — tabela com 1 linha por jogador
 * (id="jugador-{fichaId}"). Cabeçalho marca as colunas de buraco (1..18); as
 * outras (T Par, Out, In, T, Par) são ignoradas. Devolve { fichaId: number[] }
 * com os strokes por buraco dessa ronda (0 = não jogado). */
function parseHoyoAHoyo(html) {
  const table = (tablesOf(html)[0]) || "";
  const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
  // Cabeçalho: colunas cujo texto é um número 1..18 são buracos.
  let holeCols = [];
  for (const tr of rows) {
    const c = cellsOf(tr).map(strip);
    if (c.some((x) => /Nombre/i.test(x)) && c.some((x) => /^Par$/i.test(x))) {
      holeCols = c.map((x, i) => ({ x, i })).filter((o) => /^\d{1,2}$/.test(o.x) && +o.x >= 1 && +o.x <= 18).map((o) => o.i);
      break;
    }
  }
  const out = {};
  if (!holeCols.length) return out;
  for (const tr of rows) {
    const idM = /id="jugador-(\d+)"/.exec(tr);
    if (!idM) continue;
    const c = cellsOf(tr).map(strip);
    const scores = holeCols.map((ci) => { const n = parseInt(c[ci], 10); return Number.isNaN(n) ? 0 : n; });
    if (scores.some((s) => s > 0)) out[idM[1]] = scores;
  }
  return out;
}

async function fetchHbh(torneo, round) {
  try {
    const r = await httpGet("https://mitarjeta.golf/torneos/hoyoahoyo/" + torneo + "/" + round);
    if (r.status !== 200 || r.body.length < 1000) return {};
    return parseHoyoAHoyo(r.body);
  } catch (e) { return {}; }
}

function round1(x) { return Math.round(x * 10) / 10; }
/** SD WHS = (113/slope) × (gross − CR − PCC). PCC=0. null se faltar CR/Slope/gross. */
function scoreDifferential(gross, cr, slope) {
  if (gross == null || gross <= 0 || cr == null || !slope) return null;
  return round1((113 / slope) * (gross - cr));
}

function deriveSexo(name) {
  if (/Femenino/i.test(name || "")) return "F";
  if (/Masculino/i.test(name || "")) return "M";
  return "";
}
function deriveCategoria(name) {
  const m = /(Benjam[íi]n|Alev[íi]n|Infantil|Cadete|Junior|Juvenil)/i.exec(name || "");
  return m ? m[1] : "";
}

async function scrapeTorneo(torneo) {
  const url = "https://mitarjeta.golf/torneos/clasificacion/" + torneo;
  const r = await httpGet(url);
  if (r.status !== 200 || r.body.length < 2000) {
    return { torneo, ok: false, error: "status=" + r.status + " size=" + r.body.length };
  }
  const p = parseClasificacion(r.body, torneo);
  const declaredRounds = await fetchDeclaredRounds(torneo);
  const tt = await fetchTeeTimes(torneo);
  const teeTimes = tt.r1;            // R1 (startHole + retro-compat)
  const teeTimesAll = tt.all;        // todas as rondas (draw multi-ronda)
  const compId = TORNEO_TO_COMP[torneo] || null;

  // hole-by-hole por ronda (1..declaredRounds) → { round: { fichaId: scores[] } }
  const nR = declaredRounds || Math.max(...p.leaderboard.map((x) => x.rounds.length), 1);
  const hbhByRound = {};
  for (let rn = 1; rn <= nR; rn++) hbhByRound[rn] = await fetchHbh(torneo, rn);

  // Buraco de saída (R1) por jogador, a partir dos tee times.
  const startHoleByName = {};
  if (teeTimes) for (const grp of teeTimes.groups) {
    const sh = parseInt(grp.tee, 10);
    if (!Number.isNaN(sh)) for (const pn of grp.players) startHoleByName[normName(pn)] = sh;
  }

  // SD + scorecard por jogador/ronda
  const players = p.leaderboard.map((pl) => {
    const rounds = pl.rounds
      .map((g, i) => {
        const rn = i + 1;
        const scores = (pl.fichaId && hbhByRound[rn] && hbhByRound[rn][pl.fichaId]) || null;
        return { round: rn, gross: g, sd: scoreDifferential(g, p.courseRating, p.slope), scores };
      })
      .filter((x) => x.gross != null);
    const validSd = rounds.map((x) => x.sd).filter((x) => x != null);
    // startHole: tee times (fiável) com fallback ao "*" (= buraco 10).
    const startHole = startHoleByName[normName(pl.name)] ?? (pl.hadStar ? 10 : null);
    return {
      pos: pl.pos, posRaw: pl.posRaw, fichaId: pl.fichaId,
      name: pl.name, region: pl.region, startHole,
      toPar: pl.toPar, thru: pl.thru, today: pl.today,
      rounds, total: pl.total,
      bestSd: validSd.length ? Math.min(...validSd) : null,
    };
  });

  return {
    torneo, compId, ok: true,
    source: "mitarjeta.golf",
    url,
    name: p.name,
    scrapedAt: new Date().toISOString(),
    declaredRounds,
    sdFormula: "SD = (113 / Slope) × (Gross − CR − PCC)",
    sdAssumesPcc0: true,
    course: {
      name: p.course,
      courseRating: p.courseRating,
      slope: p.slope,
      holes: p.perHole.length || null,
      parTotal: p.parTotal,
      metersTotal: p.metersTotal,
      perHole: p.perHole,
    },
    teeTimes,
    teeTimesAll,
    players,
  };
}

/** Nome normalizado para casar leaderboard ↔ admitidos (ignora acentos, vírgulas,
 *  e o sufixo "*" dos convidados). */
function normName(s) {
  return (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/\*/g, "").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
}

/** Injecta o leaderboard + scorecards no rfegolf-resultats/{compId}.json.
 *  - top-level coursePar/_rfegCourseSi/_rfegCourseMeters (par/SI/metros REAIS)
 *  - results[0].players com hbh (holeScores) + HCP/dob/clube (de admitidos). */
function injectIntoRfeg(rich, pretty) {
  const compId = rich.compId;
  if (!compId) return false;
  const file = path.join(RFEG_DIR, compId + ".json");
  if (!fs.existsSync(file)) return false;
  let detail;
  try { detail = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return false; }

  // Par/SI/metros por buraco (REAIS — nunca placeholder)
  const perHole = rich.course.perHole || [];
  const parArr = perHole.map((h) => h.par);
  const siArr = perHole.map((h) => h.si);
  const metersArr = perHole.map((h) => h.meters);

  // mapa nome→admitido (HCP, dob, clube, licencia, catEdad, sexo)
  const admMap = new Map();
  for (const a of (detail.inscritos && detail.inscritos.admitidos) || []) {
    const k = normName(a.name);
    if (k && !admMap.has(k)) admMap.set(k, a);
  }

  const group = {
    label: rich.course.name || "Clasificación General",
    sexo: deriveSexo(rich.name),
    categoria: deriveCategoria(rich.name),
    pdfUrl: rich.url, // fonte = mitarjeta (não há PDF)
    nRounds: rich.declaredRounds || Math.max(...rich.players.map((p) => p.rounds.length), 1),
    courseRating: rich.course.courseRating,
    slope: rich.course.slope,
    source: "mitarjeta.golf",
    parTotal: rich.course.parTotal,
    metersTotal: rich.course.metersTotal,
    perHole,
    players: rich.players.map((p) => {
      const a = admMap.get(normName(p.name)) || null;
      const holeScores = {};
      for (const r of p.rounds) if (r.scores && r.scores.length) holeScores[r.round] = r.scores;
      return {
        pos: p.pos,
        name: p.name,
        toPar: p.toPar == null ? 0 : p.toPar,
        hoy: p.today == null ? 0 : p.today,
        rounds: p.rounds.map((r) => r.gross),
        total: p.total,
        // enriquecimento (de admitidos):
        hcp: a ? a.hcp : null,
        dob: a ? a.dob : null,
        licencia: a ? a.licencia : null,
        club: a ? a.club : null,
        catEdad: a ? a.catEdad : null,
        sexo: a ? a.sexo : null,
        // scorecard + SD:
        holeScores,
        startHole: p.startHole, // saída R1 (1 ou 10) — para colorir a célula
        region: p.region,
        sd: p.rounds.map((r) => r.sd),
        bestSd: p.bestSd,
      };
    }),
  };

  detail.results = [group];
  detail.mitarjetaTorneo = rich.torneo;
  // par/SI/metros REAIS a nível de torneio (lidos pelo conversor + tabela de inscritos)
  detail.coursePar = parArr.length ? parArr : null;
  detail.parConfidence = parArr.length ? "high" : undefined;
  detail._rfegCourseSi = siArr.length ? siArr : null;
  detail._rfegCourseMeters = metersArr.length ? metersArr : null;
  if (rich.teeTimes) detail.teeTimes = rich.teeTimes;                         // R1 (startHole + retro-compat)
  if (rich.teeTimesAll && rich.teeTimesAll.length) detail.teeTimesAll = rich.teeTimesAll; // draw multi-ronda (R1/R2/R3)
  detail.scrapedAt = rich.scrapedAt;
  // nome real do campo + par/metros (corrige o "course" lixo do microsite)
  detail.meta = detail.meta || {};
  if (rich.course.name) detail.meta.course = rich.course.name;
  detail.meta.parTotal = rich.course.parTotal;
  detail.meta.metersTotal = rich.course.metersTotal;

  writeJsonAtomic(file, detail, { spaces: pretty ? 2 : 0 });
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (n) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : null; };
  const pretty = args.includes("--pretty");
  const noInject = args.includes("--no-inject");

  let torneos = [];
  if (args.includes("--cee2026")) torneos = Object.values(COMP_TO_TORNEO);
  else if (getArg("torneos")) torneos = getArg("torneos").split(",").map((s) => parseInt(s.trim(), 10));
  else if (getArg("comp")) {
    torneos = getArg("comp").split(",").map((s) => COMP_TO_TORNEO[parseInt(s.trim(), 10)]).filter(Boolean);
  } else {
    console.log("Uso: --cee2026 | --torneos 380,381 | --comp 16192,16187");
    console.log("Flags: --no-inject  --pretty");
    process.exit(1);
  }
  torneos = [...new Set(torneos)].filter(Boolean);

  console.log("mitarjeta scrape: " + torneos.length + " torneios\n");
  let ok = 0, fail = 0;
  for (const t of torneos) {
    try {
      const rich = await scrapeTorneo(t);
      if (!rich.ok) { fail++; console.log("  torneo " + t + ": FAIL " + rich.error); continue; }
      writeJsonAtomic(path.join(OUT_DIR, t + ".json"), rich, { spaces: pretty ? 2 : 0 });
      let injected = false;
      if (!noInject) injected = injectIntoRfeg(rich, pretty);
      ok++;
      const c = rich.course;
      const withSd = rich.players.filter((p) => p.bestSd != null).length;
      const ttRounds = Array.isArray(rich.teeTimesAll) ? rich.teeTimesAll.length : (rich.teeTimes ? 1 : 0);
      const ttGroups = Array.isArray(rich.teeTimesAll)
        ? rich.teeTimesAll.reduce((a, r) => a + (r.groups ? r.groups.length : 0), 0)
        : (rich.teeTimes ? rich.teeTimes.groups.length : 0);
      console.log(
        "  torneo " + t + (rich.compId ? " (CompId " + rich.compId + ")" : "") + ": " + rich.name
      );
      console.log(
        "     campo=" + (c.name || "?") + " | par=" + c.parTotal + " | metros=" + c.metersTotal +
        " | CR=" + c.courseRating + " | Slope=" + c.slope +
        " | jogadores=" + rich.players.length + " | c/SD=" + withSd +
        " | tee-times=" + ttRounds + " ronda(s)/" + ttGroups + " grupos" +
        (injected ? " | injectado em rfegolf-resultats/" + rich.compId + ".json" : "")
      );
    } catch (e) {
      fail++; console.log("  torneo " + t + ": ERROR " + e.message);
    }
  }
  console.log("\nFeito: ok=" + ok + " fail=" + fail);
  console.log("Ricos → public/data/mitarjeta/{torneo}.json" + (noInject ? "" : "  (+ injectado nos rfegolf-resultats)"));

  // Reconstrói o índice RFEG (sidebar: nome do campo + contagem de resultados).
  if (!noInject && ok > 0) {
    try {
      require("child_process").execFileSync(
        process.execPath, [path.resolve(__dirname, "build-rfegolf-index.js")],
        { stdio: "inherit" }
      );
    } catch (e) { console.log("(aviso: falhou rebuild do índice — corre `node scripts/build-rfegolf-index.js`)"); }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
