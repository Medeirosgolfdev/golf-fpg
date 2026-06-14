#!/usr/bin/env node
/**
 * scrape-pp-whs-node.js — Histórico Pitch & Putt (voltas WHS + scorecards
 *                          buraco-a-buraco) dos NOSSOS jogadores.
 *
 * O subsistema P&P (scoring.fpg.pt/listspp/) tem páginas PlayerWHS públicas
 * (sem login!) idênticas ao /lists/ normal. Endpoints (todos POST):
 *
 *   /listspp/PlayerWHS.aspx/HCPWhsFederLST?fed_code=X   → lista de voltas P&P
 *   /listspp/PlayerWHS.aspx/ScoreCard?score_id=Y&...    → buraco-a-buraco
 *
 * ScoreCard (descoberto 2026-06-14): body {score_id, scoringtype,
 * competitiontype} com scoringtype/competitiontype TAMBÉM na query string —
 * valores vêm de `scoring_type_id` / `competition_type_id` da volta. Devolve
 * par_1..18, gross_1..18, meters_1..18 + course_rating, slope, tee_name,
 * play_hcp, played_at. P&P = 18 buracos par-3 (par 54).
 *
 * Scope (por defeito): os NOSSOS (players.json) que TÊM registo P&P
 * (intersecção com federados-pp.json). Flags para alargar/restringir.
 *
 * Output: public/data/pp-history/{fed}.json  (1 por jogador, lazy-load na UI)
 *       + public/data/pp-history-index.json  (slim: fed → {rounds,last,index})
 *
 * Cookies OPCIONAIS (público) — ver scrape-federados-pp-node.js. Mesmo
 * auto-warmup + retry/backoff com re-warm. IP frio (datacenter) costuma ser
 * bloqueado → correr do PC ou fornecer FPG_PP_COOKIES.
 *
 * Exit codes: 0 = gravou algo, 2 = nada novo, 1 = erro.
 *
 * Uso:
 *   node scripts/scrape-pp-whs-node.js                  # Nossos com registo P&P
 *   node scripts/scrape-pp-whs-node.js --all-nossos     # todos os players.json
 *   node scripts/scrape-pp-whs-node.js --juniors        # só Sub-* com registo P&P
 *   node scripts/scrape-pp-whs-node.js --feds 49085,52884
 *   node scripts/scrape-pp-whs-node.js --skip-existing  # salta ficheiros já existentes
 *   node scripts/scrape-pp-whs-node.js --no-scorecards  # só a lista de voltas (rápido)
 *   node scripts/scrape-pp-whs-node.js --limit 10       # smoke test
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const { loadCookieHeader } = require("./lib/cookies");
const { writeJsonAtomic }  = require("./lib/atomic-write");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");
const OUT_DIR   = path.join(DATA, "pp-history");
const INDEX_OUT = path.join(DATA, "pp-history-index.json");
const PLAYERS   = path.join(DATA, "players.json");
const FED_PP    = path.join(DATA, "federados-pp.json");
const COOKIES_PATH = path.join(ROOT, "api", ".fpg-pp-cookies.json");

const HOST = "https://scoring.fpg.pt/listspp";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── Args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
const ALL_NOSSOS  = args.includes("--all-nossos");
const JUNIORS     = args.includes("--juniors");
const SKIP_EXIST  = args.includes("--skip-existing");
const NO_SCARDS   = args.includes("--no-scorecards");
const FEDS_CLI    = argVal("--feds");
const LIMIT       = argVal("--limit") ? parseInt(argVal("--limit"), 10) : Infinity;
const DELAY_MS    = parseInt(argVal("--delay-ms") || "350", 10);
const SC_DELAY_MS = parseInt(argVal("--sc-delay-ms") || "180", 10);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Cookies opcionais ────────────────────────────────────────────
function loadOptionalCookies() {
  const env = process.env.FPG_PP_COOKIES || process.env.FPG_ADMISSIONS_COOKIES;
  if (env) { console.log("[pp-whs] cookies de env"); return env; }
  if (fs.existsSync(COOKIES_PATH)) return loadCookieHeader({ envVars: [], file: COOKIES_PATH, label: "[pp-whs]", exitOnFail: false });
  return null;
}

// ── Cookie jar ───────────────────────────────────────────────────
function addSetCookies(jar, res) {
  const arr = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const sc of arr) { const f = sc.split(";")[0]; const e = f.indexOf("="); if (e > 0) jar[f.slice(0, e).trim()] = f.slice(e + 1).trim(); }
}
const cookieHeader = (jar, extra) => { const p = Object.entries(jar).map(([k, v]) => `${k}=${v}`); if (extra) p.unshift(extra); return p.join("; "); };

// Warmup VIA LINKPAGE (gateway canónico). Ir directo a PlayerWHS.aspx?no=X dá
// HTTP 500 porque o servidor exige passar pelo linkpage primeiro (seta o cookie
// DG_Lists_URL de "entry context" + ASP.NET_SessionId). Descoberto 2026-06-14:
// o Phase 1 (federados) funcionava porque usava o linkpage; este não usava.
// Uma sessão aquecida pelo linkpage serve para TODO o /listspp/ (incl. PlayerWHS).
async function warmup(jar, extra) {
  let url = `${HOST}/linkpage.aspx?page=searchfed&club=All&ack=8428ACK987`;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html,*/*;q=0.8", "Accept-Language": "pt-PT,pt;q=0.9", "Cookie": cookieHeader(jar, extra), "Referer": `${HOST}/` },
      redirect: "manual",
    });
    addSetCookies(jar, res);
    const loc = res.headers.get("location");
    if ([301, 302, 303, 307, 308].includes(res.status) && loc) { url = new URL(loc, url).href; continue; }
    await res.text().catch(() => {});
    return res.status;
  }
  return -1;
}

async function postPM(jar, extra, pathname, qs, body, referer) {
  const res = await fetch(`${HOST}/${pathname}${qs ? "?" + qs : ""}`, {
    method: "POST",
    headers: {
      "User-Agent": UA, "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01", "Origin": "https://scoring.fpg.pt",
      "Referer": referer, "Cookie": cookieHeader(jar, extra),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
  const json = await res.json();
  const d = json.d || json;
  if (d.Result === "ERROR") throw new Error(`Result=ERROR ${d.Message || ""}`);
  return d;
}

// ── WHS round list (resiliente) ──────────────────────────────────
async function fetchRounds(jar, extra, fed) {
  const ref = `${HOST}/PlayerWHS.aspx?no=${fed}`;
  const all = [];
  let start = 0, total = null;
  while (true) {
    let d = null;
    for (let att = 0; att < 4 && !d; att++) {
      try {
        d = await postPM(jar, extra, "PlayerWHS.aspx/HCPWhsFederLST", `fed_code=${fed}&jtStartIndex=${start}&jtPageSize=100`,
          { fed_code: String(fed), jtStartIndex: String(start), jtPageSize: "100" }, ref);
      } catch (e) {
        if ((e.status === 500 || /ERROR/.test(e.message)) && att < 3) { await sleep(700 * (att + 1)); await warmup(jar, extra); }
        else throw e;
      }
    }
    total = d.TotalRecordCount;
    const recs = d.Records || [];
    all.push(...recs);
    start += 100;
    if (recs.length < 100 || (total && all.length >= total)) break;
    await sleep(150);
  }
  return all;
}

// ── ScoreCard buraco-a-buraco ────────────────────────────────────
async function fetchScorecard(jar, extra, fed, rec) {
  const sid = rec.score_id != null ? rec.score_id : rec.id;
  const st = rec.scoring_type_id != null ? rec.scoring_type_id : 1;
  const ct = rec.competition_type_id != null ? rec.competition_type_id : 10;
  const ref = `${HOST}/PlayerWHS.aspx?no=${fed}`;
  let d = null;
  for (let att = 0; att < 3 && !d; att++) {
    try {
      d = await postPM(jar, extra, "PlayerWHS.aspx/ScoreCard",
        `score_id=${sid}&scoringtype=${st}&competitiontype=${ct}`,
        { score_id: String(sid), scoringtype: String(st), competitiontype: String(ct) }, ref);
    } catch (e) {
      if (e.status === 500 && att < 2) { await sleep(500 * (att + 1)); } else return null;
    }
  }
  const r = Array.isArray(d.Records) ? d.Records[0] : (Array.isArray(d) ? d[0] : d);
  if (!r) return null;
  const arr = (pre) => Array.from({ length: 18 }, (_, i) => { const v = r[`${pre}_${i + 1}`]; return v == null ? null : Number(v); });
  return {
    par: arr("par"), gross: arr("gross"), meters: arr("meters"),
    parTotal: Number(r.par_total) || null, grossTotal: Number(r.gross_total) || null,
    courseRating: r.course_rating ?? null, slope: r.slope ?? null,
    teeName: r.tee_name ?? null, startHole: r.starting_hole_index ?? null,
    nholes: r.nholes ?? null, course: r.course_description ?? null,
  };
}

// ── Normalizar volta da lista WHS ────────────────────────────────
function trimRound(r) {
  return {
    scoreId: r.score_id != null ? r.score_id : r.id,
    date: r.hcp_dateStr || r.mov_dateStr || null,
    tourn: r.tourn_name || r.tournament_description || null,
    course: r.course_description || null,
    holes: r.holes ?? null,
    par: r.par ?? null,
    origin: r.score_origin || null,
    index: r.exact_handicap ?? null,
    playHcp: r.play_handicap ?? null,
    stableford: r.stableford ?? null,
    sd: r.sgd ?? null,
    scoringType: r.scoring_type_id ?? null,
    competitionType: r.competition_type_id ?? null,
  };
}

// ── Resolver scope ───────────────────────────────────────────────
function resolveScope() {
  if (FEDS_CLI) return FEDS_CLI.split(",").map(s => s.trim()).filter(Boolean);

  if (!fs.existsSync(PLAYERS)) { console.error(`[pp-whs] ERRO: ${PLAYERS} não existe.`); process.exit(1); }
  const players = JSON.parse(fs.readFileSync(PLAYERS, "utf8"));
  let feds = Object.keys(players);

  // Filtrar juniores (Sub-*) se pedido
  if (JUNIORS) feds = feds.filter(f => /sub-?\d/i.test(players[f]?.escalao || ""));

  if (ALL_NOSSOS) return feds;

  // Default: intersecção com federados-pp.json (quem tem registo P&P)
  if (fs.existsSync(FED_PP)) {
    const pp = JSON.parse(fs.readFileSync(FED_PP, "utf8"));
    const ppSet = new Set((pp.players || []).map(p => String(p.fed)));
    const inter = feds.filter(f => ppSet.has(String(f)));
    console.log(`[pp-whs] Scope: ${inter.length} Nossos com registo P&P (de ${feds.length} ${JUNIORS ? "juniores" : "Nossos"})`);
    return inter;
  }
  console.warn(`[pp-whs] ⚠ federados-pp.json ausente — sem filtro P&P. A usar todos os ${feds.length} (corre scrape-federados-pp-node.js primeiro para filtrar).`);
  return feds;
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const extra = loadOptionalCookies();
  let scope = resolveScope();
  if (LIMIT !== Infinity) scope = scope.slice(0, LIMIT);
  if (!scope.length) { console.log("[pp-whs] Scope vazio — nada a fazer."); process.exit(2); }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Index existente (preservado/actualizado incrementalmente)
  let index = {};
  if (fs.existsSync(INDEX_OUT)) { try { index = JSON.parse(fs.readFileSync(INDEX_OUT, "utf8")).players || {}; } catch {} }

  console.log(`[pp-whs] ${scope.length} jogadores · scorecards=${NO_SCARDS ? "não" : "sim"} · skip-existing=${SKIP_EXIST}`);

  // Sessão PARTILHADA aquecida UMA vez via linkpage (gateway canónico). Os
  // PageMethods de PlayerWHS reutilizam-na. Re-warm automático em 500 dentro
  // de fetchRounds. Ir directo à página do jogador (sem linkpage) dá 500.
  const jar = {};
  const wStatus = await warmup(jar, extra);
  console.log(`[pp-whs] Warmup linkpage: HTTP ${wStatus}, sessão=${Object.keys(jar).join(",") || "(cookies fornecidos)"}`);

  let wrote = 0, skipped = 0, empty = 0, failed = 0;
  const t0 = Date.now();

  for (let i = 0; i < scope.length; i++) {
    const fed = String(scope[i]);
    const outFile = path.join(OUT_DIR, `${fed}.json`);
    if (SKIP_EXIST && fs.existsSync(outFile)) { skipped++; continue; }

    let rounds;
    try {
      rounds = await fetchRounds(jar, extra, fed);
    } catch (e) {
      console.warn(`  [${i + 1}/${scope.length}] fed ${fed}: falha lista (${e.message})`);
      failed++;
      await sleep(DELAY_MS);
      continue;
    }

    if (!rounds.length) { empty++; await sleep(DELAY_MS); continue; }

    const out = {
      fed, name: rounds[0].player_name || null, generated: new Date().toISOString(),
      index: rounds[0].exact_handicap ?? null,
      rounds: [],
    };
    for (const r of rounds) {
      const round = trimRound(r);
      if (!NO_SCARDS && (round.holes ?? 18) > 0) {
        round.scorecard = await fetchScorecard(jar, extra, fed, r);
        if (SC_DELAY_MS) await sleep(SC_DELAY_MS);
      }
      out.rounds.push(round);
    }

    writeJsonAtomic(outFile, out);
    index[fed] = {
      name: out.name, rounds: out.rounds.length,
      last: out.rounds[0]?.date || null, index: out.index,
    };
    wrote++;
    process.stdout.write(`\r  [${i + 1}/${scope.length}] fed ${fed} · ${out.rounds.length} voltas · gravados ${wrote}   `);
    await sleep(DELAY_MS);
  }
  process.stdout.write("\n");

  // Gravar index
  writeJsonAtomic(INDEX_OUT, { generated: new Date().toISOString(), source: "scrape-pp-whs-node.js", players: index });

  console.log(`[pp-whs] ✓ ${wrote} gravados · ${skipped} saltados · ${empty} sem voltas P&P · ${failed} falhas · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(wrote > 0 ? 0 : 2);
}

main().catch(err => { console.error(`✗ Erro fatal: ${err.message}`); console.error(err.stack); process.exit(1); });
