/**
 * scripts/scrape-fcg.js
 *
 * Scraper Node-puro do golfdirecto.com — plataforma da Federació Catalana de
 * Golf (FCGolf, prefixo licença `CB`) para tee times, leaderboards e
 * scorecards hbh dos torneios juvenis (e outros).
 *
 * Endpoints públicos descobertos via Chrome MCP em 2026-05-09:
 *   - GET /web/home/game/{gameId}
 *       → metadata + categories[] (cada uma com _id, name, gender)
 *   - GET /web/home/score/ranking/entry?game=X&category=Y
 *       → leaderboard por categoria (player, view.day, view.acc, previous[])
 *   - GET /web/home/score/player/{pid}/result?game=X&category=Y
 *       → scorecard hbh COMPLETO (gameTee.par1-18, score.gross1-18, ...)
 *   - GET /web/home/card?game=X
 *       → tee times + grupos
 *   - GET /web/home/player?game=X
 *       → lista global de inscritos
 *   - GET /web/home/statistics?game=X&handicap=net[&category[]=N&gender=M&teeColor=Z]
 *       → estatísticas (eagles/birdies/etc)
 *
 * Sem auth. Headers normais de browser bastam.
 *
 * USO:
 *   node scripts/scrape-fcg.js --game 6809f9d7523b9365e3b183c3
 *   node scripts/scrape-fcg.js --games 6809f9d7523b9365e3b183c3,680a4a31523b9365e346a9b8
 *   node scripts/scrape-fcg.js --scope scripts/fcg-scope.json
 *   node scripts/scrape-fcg.js --scope scripts/fcg-scope.json --skip-existing
 *   node scripts/scrape-fcg.js --game 6809f9d7523b9365e3b183c3 --skip-scorecards
 *
 * Output: public/data/fcg/{gameId}.json (formato cru golfdirecto, slimmed).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const REPO = path.resolve(__dirname, "..");
const OUT_DIR = path.resolve(REPO, "public", "data", "fcg");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = "https://www.golfdirecto.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const AGENT = new https.Agent({ keepAlive: true, maxSockets: 8, keepAliveMsecs: 5000 });

/* ── CLI ────────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
function argVal(flag, def) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; }
function argFlag(flag) { return args.indexOf(flag) >= 0; }

const CLI_GAME = argVal("--game", null);
const CLI_GAMES = argVal("--games", null);
const SCOPE_FILE = argVal("--scope", null);
const SKIP_EXISTING = argFlag("--skip-existing");
const SKIP_SCORECARDS = argFlag("--skip-scorecards");
const SKIP_CARD = argFlag("--skip-card");
const CONCURRENCY = parseInt(argVal("--concurrency", "3"), 10);
const DELAY_MS = parseInt(argVal("--delay", "100"), 10);
const VERBOSE = argFlag("--verbose") || argFlag("-v");

/* ── HTTP helper ────────────────────────────────────────────────────────── */
function httpGet(urlStr, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const headers = Object.assign({
      "User-Agent": UA,
      "Accept": opts.accept || "application/json,text/html,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,ca;q=0.8,en;q=0.7",
      "Referer": opts.referer || (BASE + "/"),
    }, opts.headers || {});

    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: "GET",
      headers: headers,
      agent: AGENT,
      timeout: opts.timeout || 30000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({ statusCode: res.statusCode, headers: res.headers, body: body });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function fetchJson(urlPath, opts) {
  const url = urlPath.indexOf("http") === 0 ? urlPath : (BASE + urlPath);
  const r = await httpGet(url, opts);
  if (r.statusCode === 200) {
    try { return JSON.parse(r.body); }
    catch (e) { throw new Error("JSON parse error: " + e.message + "; body[0..200]=" + r.body.slice(0, 200)); }
  }
  throw new Error("HTTP " + r.statusCode + " for " + url + "; body[0..200]=" + r.body.slice(0, 200));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── golfdirecto API wrappers ───────────────────────────────────────────── */

async function fetchGame(gameId) {
  return fetchJson("/web/home/game/" + gameId);
}

async function fetchCard(gameId) {
  return fetchJson("/web/home/card?game=" + gameId);
}

async function fetchRanking(gameId, categoryId) {
  return fetchJson("/web/home/score/ranking/entry?game=" + gameId + "&category=" + categoryId);
}

async function fetchPlayerScorecard(playerId, gameId, categoryId) {
  return fetchJson("/web/home/score/player/" + playerId + "/result?game=" + gameId + "&category=" + categoryId);
}

/* ── Slim helpers ───────────────────────────────────────────────────────── */

function slimGameTee(t) {
  if (!t) return null;
  const out = {
    color: t.color || null,
    gender: t.gender || null,
    lap: t.lap || null,
    rating: t.rating == null ? null : t.rating,
    slope: t.slope == null ? null : t.slope,
    par: t.par == null ? null : t.par,
    par1_18: [], hcp1_18: [], meters1_18: [],
  };
  for (let i = 1; i <= 18; i++) {
    out.par1_18.push(t["par" + i] == null ? null : t["par" + i]);
    out.hcp1_18.push(t["hcp" + i] == null ? null : t["hcp" + i]);
    out.meters1_18.push(t["meters" + i] == null ? null : t["meters" + i]);
  }
  return out;
}

function slimGross(score) {
  if (!score) return null;
  const arr = [];
  for (let i = 1; i <= 18; i++) arr.push(score["gross" + i] == null ? null : score["gross" + i]);
  return arr;
}

/* ── Scrape de um game completo ─────────────────────────────────────────── */

async function scrapeGame(gameId) {
  const startedAt = Date.now();
  console.log("[scrape] " + gameId + " ─ start");

  const gameRes = await fetchGame(gameId);
  if (gameRes.code !== 0 || !gameRes.data) {
    throw new Error("Game fetch failed code=" + gameRes.code + ": " + JSON.stringify(gameRes).slice(0, 200));
  }
  const game = gameRes.data;
  const categories = (game.categories || []).map((c) => ({
    _id: c._id,
    name: c.name,
    gender: c.gender || null,
    ageMin: c.ageMin == null ? null : c.ageMin,
    ageMax: c.ageMax == null ? null : c.ageMax,
    hcpMin: c.hcpMin == null ? null : c.hcpMin,
    hcpMax: c.hcpMax == null ? null : c.hcpMax,
    teeColor: c.teeColor || null,
  }));

  console.log("[scrape] " + gameId + " ─ \"" + game.name + "\" (" + (game.tournament && game.tournament.name || "?") + ") ─ " + categories.length + " categories, status=" + game.status);

  let card = null;
  if (!SKIP_CARD) {
    try {
      const cardRes = await fetchCard(gameId);
      if (cardRes.code === 0) card = cardRes.data;
      else console.warn("[scrape] " + gameId + " ─ card code=" + cardRes.code);
    } catch (e) {
      console.warn("[scrape] " + gameId + " ─ card error: " + e.message);
    }
    await sleep(DELAY_MS);
  }

  const out = {
    gameId: gameId,
    fetchedAt: new Date().toISOString(),
    game: {
      _id: game._id,
      name: game.name,
      status: game.status,
      scheduleStartDate: game.scheduleStartDate,
      scheduleEndDate: game.scheduleEndDate,
      federation: game.federation,
      lap: game.lap,
      pointMode: game.pointMode,
      defaultTeeColorMale: game.defaultTeeColorMale,
      defaultTeeColorFemale: game.defaultTeeColorFemale,
      tournament: game.tournament ? {
        _id: game.tournament._id,
        name: game.tournament.name,
        clientName: game.tournament.client && game.tournament.client.name,
        isSingleGame: !!game.tournament.__isSingleGame,
      } : null,
      club: game.club ? {
        _id: game.club._id,
        name: game.club.name,
        city: game.club.city,
        state: game.club.state,
        country: game.club.country,
      } : null,
      course: game.course ? {
        _id: game.course._id,
        name: game.course.name,
        isShort: !!game.course.isShort,
        isPitchAndPutt: !!game.course.isPitchAndPutt,
      } : null,
      teesMale: game.teesMale || [],
      teesFemale: game.teesFemale || [],
    },
    categories: [],
    card: card,
  };

  for (const cat of categories) {
    const catOut = Object.assign({}, cat, { players: [], rankingError: null, scorecardErrors: [] });
    console.log("[scrape] " + gameId + " ─ category \"" + cat.name + "\" (" + cat._id + ")");

    let rankingData = null;
    try {
      const rankRes = await fetchRanking(gameId, cat._id);
      if (rankRes.code === 0) {
        rankingData = rankRes.data;
      } else {
        catOut.rankingError = "code=" + rankRes.code + " msg=" + (rankRes.message || "");
        console.warn("[scrape] " + gameId + "/" + cat._id + " ─ ranking " + catOut.rankingError);
      }
    } catch (e) {
      catOut.rankingError = e.message;
      console.warn("[scrape] " + gameId + "/" + cat._id + " ─ ranking error: " + e.message);
    }
    await sleep(DELAY_MS);

    if (!Array.isArray(rankingData)) {
      out.categories.push(catOut);
      continue;
    }

    catOut.players = rankingData.map((entry) => ({
      _id: entry.player && entry.player._id,
      firstName: entry.player && entry.player.firstName,
      surname: entry.player && entry.player.surname,
      gender: entry.player && entry.player.gender,
      license: entry.player && entry.player.license,
      country: entry.player && entry.player.country,
      hcpExact: entry.player && entry.player.hcpExact,
      hcpGame: entry.player && entry.player.hcpGame,
      gameTeeColor: entry.player && entry.player.gameTee && entry.player.gameTee.color,
      isCardFinished: !!entry.isCardFinished,
      isCardClosed: !!entry.isCardClosed,
      teeTimeHour: entry.teeTimeHour,
      teeTime: entry.teeTime,
      teeNumber: entry.teeNumber,
      view: entry.view ? { day: entry.view.day, acc: entry.view.acc } : null,
      previous: Array.isArray(entry.previous) ? entry.previous.map((p) => ({ day: p.day, acc: p.acc })) : [],
      scorecard: null,
    }));

    if (!SKIP_SCORECARDS) {
      const players = catOut.players;
      const queue = players.slice();

      const fetchOne = async (p) => {
        if (!p._id) return;
        try {
          const scRes = await fetchPlayerScorecard(p._id, gameId, cat._id);
          if (scRes.code === 0 && scRes.data) {
            const d = scRes.data;
            // Slim: gameTee + gross1-18 (playerResult/entryResult são iguais
            // entre si e duplicam dados que já temos no ranking view).
            p.scorecard = {
              gameTee: slimGameTee(d.gameTee || (d.player && d.player.gameTee)),
              gross: slimGross(d.score),
            };
          } else {
            catOut.scorecardErrors.push({ playerId: p._id, error: "code=" + scRes.code });
          }
        } catch (e) {
          catOut.scorecardErrors.push({ playerId: p._id, error: e.message });
        }
      };

      const runNext = async () => {
        while (queue.length > 0) {
          const p = queue.shift();
          await fetchOne(p);
          if (DELAY_MS > 0) await sleep(DELAY_MS);
        }
      };

      const workers = [];
      for (let i = 0; i < CONCURRENCY; i++) workers.push(runNext());
      await Promise.all(workers);

      const ok = players.filter((p) => p.scorecard).length;
      const errs = catOut.scorecardErrors.length;
      console.log("[scrape] " + gameId + "/" + cat._id + " ─ " + ok + "/" + players.length + " scorecards ok, " + errs + " errors");
    }

    out.categories.push(catOut);
  }

  const totalSecs = Math.round((Date.now() - startedAt) / 1000);
  console.log("[scrape] " + gameId + " ─ done in " + totalSecs + "s");
  return out;
}

/* ── Run ────────────────────────────────────────────────────────────────── */

function loadScope(scopeFile) {
  const fp = path.isAbsolute(scopeFile) ? scopeFile : path.resolve(REPO, scopeFile);
  const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
  if (Array.isArray(raw)) return raw.map((r) => typeof r === "string" ? r : r.gameId).filter(Boolean);
  if (raw && Array.isArray(raw.games)) return raw.games.map((g) => g.gameId || g).filter(Boolean);
  if (raw && Array.isArray(raw.tournaments)) {
    const ids = [];
    for (const t of raw.tournaments) {
      for (const g of (t.games || [])) {
        if (g.gameId) ids.push(g.gameId);
      }
    }
    return ids;
  }
  throw new Error("Scope file " + fp + " has unsupported shape");
}

async function main() {
  let games = [];
  if (CLI_GAME) games.push(CLI_GAME);
  if (CLI_GAMES) games.push.apply(games, CLI_GAMES.split(",").map((s) => s.trim()).filter(Boolean));
  if (SCOPE_FILE) games.push.apply(games, loadScope(SCOPE_FILE));
  games = Array.from(new Set(games));

  if (games.length === 0) {
    // Distinguir "não me disseste o que scrapar" de "o scope existe mas está
    // vazio" — o segundo é um estado normal (fonte degradada, ver a guarda do
    // discover-fcg-scope.js) e imprimir o usage aqui mandava uma pista errada
    // para os logs do workflow.
    if (SCOPE_FILE) {
      console.log(`[fcg] scope ${SCOPE_FILE} sem jogos — nada para scrapar.`);
      process.exit(2);
    }
    console.error("Usage: scrape-fcg.js --game <ID> | --games <ID1,ID2> | --scope <file>");
    process.exit(2);
  }

  console.log("[fcg] " + games.length + " games to scrape, concurrency=" + CONCURRENCY + ", skip-existing=" + SKIP_EXISTING);

  let okCount = 0, skipped = 0, errs = 0;
  for (const gameId of games) {
    const outFile = path.join(OUT_DIR, gameId + ".json");
    if (SKIP_EXISTING && fs.existsSync(outFile)) {
      skipped++;
      if (VERBOSE) console.log("[fcg] " + gameId + " ─ skip (exists)");
      continue;
    }
    try {
      const out = await scrapeGame(gameId);
      fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
      const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
      console.log("[fcg] " + gameId + " ─ wrote " + path.relative(REPO, outFile) + " (" + kb + " KB)");
      okCount++;
    } catch (e) {
      console.error("[fcg] " + gameId + " ─ FAILED: " + e.message);
      errs++;
    }
  }

  console.log("[fcg] done: ok=" + okCount + ", skipped=" + skipped + ", errors=" + errs);
  // Exit codes:
  //   1 = falha total (nenhum game processado com sucesso, nem novo nem em disco)
  //   2 = "sem novidades" (todos os games já existiam em disco)
  //   0 = sucesso (pelo menos 1 ok ou 1 skipped). Errors parciais são tolerados
  //       porque a discovery cross-domain (catgolf → golfdirecto) ocasionalmente
  //       devolve gameIds futuros que o scoring ainda não criou (HTTP 400
  //       "Game not found"). Esses IDs voltam a ser tentados na próxima corrida.
  if (errs === games.length) process.exit(1);
  if (okCount === 0 && skipped === games.length) process.exit(2);
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error("[fcg] FATAL:", e.stack || e); process.exit(1); });
}

module.exports = { scrapeGame, fetchGame, fetchCard, fetchRanking, fetchPlayerScorecard, slimGameTee, slimGross };
