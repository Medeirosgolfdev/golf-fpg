#!/usr/bin/env node
/**
 * update-rali-2026-results.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Substitui a entrada DRAW-ONLY do "Torneio CGSS RALI 2026" (Santo da Serra,
 * ccode 007, tcode PLACEHOLDER 90071) pelos RESULTADOS REAIS, assim que a FPG
 * os publicar.
 *
 * Contexto: o draw foi inserido manualmente a 2026-07-31 (o CGSS só envia draws
 * por email) com um tcode sintético 90071. O torneio real tem o tcode REAL
 * FIXO E CONHECIDO 11050. Este script:
 *   1. Vai DIRECTO às classificações do tcode 11050 (SEM TournamentsLST — o
 *      passo de "descoberta" foi eliminado porque o tcode é conhecido; era o
 *      que dava HTTP 500).
 *   2. Tenta OS DOIS hosts gémeos até um devolver resultados:
 *        · scoring.datagolf.pt/pt  (cookies DATAGOLF_SCORING_COOKIES)
 *        · scoring.fpg.pt/lists     (cookies FPG_ADMISSIONS_COOKIES)
 *      Warmup linkpage → POST classif.aspx/ClassifLST → scorecards por jogador.
 *   3. Substitui a entrada 90071 em pull-torneios001.json pela real (mesmo
 *      "sítio": ccode 007 → tab Santo da Serra). Remove duplicados.
 *   4. Re-chaveia o draw em cgss-draws-manual.json de 90071 → tcode real, para
 *      a tab "Draw R1" continuar a aparecer ao lado dos resultados.
 *
 * PROTECÇÃO DE DADOS: nunca grava se a resposta não for 200, se o corpo contiver
 * "Server Error", ou se o parsing devolver 0 jogadores com score. Um ficheiro
 * de resultados bons NUNCA é substituído por vazio.
 *
 * COOKIES:
 *   datagolf → env DATAGOLF_SCORING_COOKIES  ou api/.scoring-datagolf-cookies.json
 *   fpg      → env FPG_ADMISSIONS_COOKIES     ou api/.fpg-admissions-cookies.json
 *   Validar antes: node scripts/test-datagolf-node.js  → Result:"OK".
 *
 * USO:
 *   node scripts/update-rali-2026-results.js            # tcode fixo 11050, os 2 hosts
 *   node scripts/update-rali-2026-results.js --tcode N  # forçar outro tcode
 *   node scripts/update-rali-2026-results.js --dry-run  # não grava, só relata
 *
 * EXIT CODES: 0 = actualizado (há resultados) · 2 = ainda sem resultados
 *             (torneio por jogar / não publicado) · 1 = erro.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { loadCookieHeader } = require("./lib/cookies");

const REPO = path.resolve(__dirname, "..");
const PULL = path.join(REPO, "public", "data", "pull-torneios001.json");
const CGSS = path.join(REPO, "public", "data", "cgss-draws-manual.json");

const CCODE = "007";
const PLACEHOLDER_TCODE = "90071";
const REAL_TCODE_DEFAULT = "11050";   // tcode REAL conhecido do RALI 2026

const args = process.argv.slice(2);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes("--dry-run");
const TCODE = String(argVal("--tcode") || REAL_TCODE_DEFAULT);

/* ── HTTP config ────────────────────────────────────────────────────────── */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const ACK_CLASSIF = "8428ACK987";
const PAGE_SIZE = 150;
const RETRY_WAITS = [2000, 5000, 10000];   // espera crescente entre tentativas (5xx)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ── Cookies (ambos os hosts; nenhum é fatal isoladamente) ──────────────── */
const cookieDG = loadCookieHeader({
  envVars: ["DATAGOLF_SCORING_COOKIES", "DATAGOLF_COOKIES"],
  file: path.join(REPO, "api", ".scoring-datagolf-cookies.json"),
  label: "[rali/datagolf]", exitOnFail: false,
});
const cookieFPG = loadCookieHeader({
  envVars: ["FPG_ADMISSIONS_COOKIES"],
  file: path.join(REPO, "api", ".fpg-admissions-cookies.json"),
  label: "[rali/fpg]", exitOnFail: false,
});

// Tenta datagolf primeiro (secret já provado no update-classif) e fpg a seguir.
const HOSTS = [
  { id: "scoring.datagolf.pt", base: "https://scoring.datagolf.pt/pt", origin: "https://scoring.datagolf.pt", cookie: cookieDG },
  { id: "scoring.fpg.pt",      base: "https://scoring.fpg.pt/lists",   origin: "https://scoring.fpg.pt",      cookie: cookieFPG },
];
for (const h of HOSTS) if (!h.cookie) console.warn(`[rali] aviso: sem cookies para ${h.id} — vou tentar na mesma (páginas podem ser públicas).`);
if (!HOSTS.some(h => h.cookie)) { console.error("[rali] ERRO: sem cookies para nenhum host (datagolf nem fpg)."); process.exit(1); }

/* ── Diagnóstico de resposta falhada (status + bytes + 300 chars + tipo) ── */
function classifyBody(text) {
  const t = text || "";
  if (/Server Error/i.test(t)) return "Server Error (sessão/cookies rejeitados ou erro do servidor)";
  if (/(iniciar sess|área\s+reservada|type=["']?password|name=["']?password|<form[^>]*login)/i.test(t))
    return "HTML de login (falta cookie de autenticação)";
  if (/Param[_ ]?Error/i.test(t)) return "Param Error (sessão não aquecida / parâmetros inválidos)";
  return "desconhecido";
}
function logFailure(host, label, status, text, extra) {
  const bytes = Buffer.byteLength(text || "", "utf8");
  const head = (text || "").replace(/\s+/g, " ").trim().slice(0, 300);
  console.error(`[rali] ✗ ${host.id} · ${label}: HTTP ${status}${extra ? ` (${extra})` : ""} · ${bytes} bytes · tipo: ${classifyBody(text)}`);
  console.error(`[rali]   corpo[0..300]: ${head}`);
}

/* ── POST a PageMethod, com retry em 5xx e logging diagnóstico ──────────── */
async function postJson(host, pathname, qs, body, label) {
  const url = `${host.base}/${pathname}${qs ? "?" + qs : ""}`;
  for (let attempt = 0; attempt <= RETRY_WAITS.length; attempt++) {
    let res, text;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/json; charset=utf-8",
          "X-Requested-With": "XMLHttpRequest",
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "pt-PT,pt;q=0.9",
          "Origin": host.origin,
          "Referer": `${host.base}/Classifications.aspx`,
          "Cookie": (host.cookie || "").trim(),
        },
        body: JSON.stringify(body),
      });
      text = await res.text();
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (attempt < RETRY_WAITS.length) {
        console.warn(`[rali] ${host.id} · ${label}: erro de rede (${msg}) — retry em ${RETRY_WAITS[attempt] / 1000}s`);
        await sleep(RETRY_WAITS[attempt]);
        continue;
      }
      console.error(`[rali] ✗ ${host.id} · ${label}: rede falhou após ${RETRY_WAITS.length + 1} tentativas: ${msg}`);
      return { ok: false, status: 0, error: `network: ${msg}` };
    }

    // 5xx → retry com espera crescente
    if (res.status >= 500) {
      if (attempt < RETRY_WAITS.length) {
        console.warn(`[rali] ${host.id} · ${label}: HTTP ${res.status} (tentativa ${attempt + 1}/${RETRY_WAITS.length + 1}) — retry em ${RETRY_WAITS[attempt] / 1000}s`);
        await sleep(RETRY_WAITS[attempt]);
        continue;
      }
      logFailure(host, label, res.status, text);
      return { ok: false, status: res.status, error: `HTTP ${res.status}`, serverError: /Server Error/i.test(text || "") };
    }
    if (res.status !== 200) {
      logFailure(host, label, res.status, text);
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }

    // Protecção: corpo com "Server Error" mesmo em 200 = sessão rejeitada
    if (/Server Error/i.test(text || "")) {
      logFailure(host, label, 200, text, "corpo contém 'Server Error'");
      return { ok: false, status: 200, error: "server-error-body", serverError: true };
    }
    let json;
    try { json = JSON.parse(text); }
    catch { logFailure(host, label, 200, text, "corpo não é JSON"); return { ok: false, status: 200, error: "bad-json" }; }
    const d = json.d || json;
    if (d.Result !== "OK") {
      logFailure(host, label, 200, text, `Result=${d.Result || "?"}`);
      return { ok: false, status: 200, error: `Result=${d.Result || "?"}` };
    }
    return { ok: true, status: 200, records: d.Records || [], total: d.TotalRecordCount ?? 0 };
  }
}

/* ── Warmup linkpage (activa sessão ASP.NET antes dos PageMethods) ──────── */
async function warmup(host) {
  const url = `${host.base}/linkpage.aspx?page=classif&club=${CCODE}&tourn=${TCODE}&ack=${ACK_CLASSIF}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9",
        "Referer": `${host.origin}/`,
        "Cookie": (host.cookie || "").trim(),
      },
      redirect: "follow",
    });
    await res.text();
    return res.ok;
  } catch { return false; }
}

/* ── Classif paginada ───────────────────────────────────────────────────── */
async function fetchClassif(host, round) {
  const all = [];
  let startIndex = 0;
  while (true) {
    const body = {
      Classi: "1", tclub: CCODE, tcode: TCODE,
      classiforder: "1", classiftype: "I", classifroundtype: "D",
      scoringtype: "1", round: String(round || 1),
      members: "0", playertypes: "0", gender: "0",
      minagemen: "0", maxagemen: "999", minageladies: "0", maxageladies: "999",
      minhcp: "-8", maxhcp: "99", idfilter: "-1",
      jtStartIndex: String(startIndex), jtPageSize: String(PAGE_SIZE), jtSorting: "score_id DESC",
    };
    const qs = `jtStartIndex=${startIndex}&jtPageSize=${PAGE_SIZE}&jtSorting=${encodeURIComponent("score_id DESC")}`;
    const r = await postJson(host, "classif.aspx/ClassifLST", qs, body, `classif R${round || 1}`);
    if (!r.ok) return { ok: false, records: all, error: r.error };
    all.push(...r.records);
    if (r.records.length < PAGE_SIZE) break;
    startIndex += PAGE_SIZE;
    await sleep(150);
  }
  return { ok: true, records: all };
}

/* ── Scorecards ─────────────────────────────────────────────────────────── */
async function fetchScorecard(host, scoreId, round) {
  const qs = `score_id=${scoreId}&tclub=${CCODE}&tcode=${TCODE}&scoringtype=1&classiftype=I&classifround=${round}`;
  const body = { score_id: String(scoreId), tclub: CCODE, tcode: TCODE, scoringtype: "1", classiftype: "I", classifround: String(round) };
  const r = await postJson(host, "classif.aspx/ScoreCard", qs, body, `scorecard ${scoreId}`);
  return (r.ok && r.records?.length > 0) ? r.records[0] : null;
}
async function fetchScorecardAggregate(host, scoreId) {
  const qs = `score_id=${scoreId}&tclub=${CCODE}&tcode=${TCODE}&scoringtype=1&classiftype=I&classifround=`;
  const body = { score_id: String(scoreId), tclub: CCODE, tcode: TCODE, scoringtype: "1", classiftype: "I", classifround: "" };
  const r = await postJson(host, "classifAgregate.aspx/ScoreCard", qs, body, `scorecard-agg ${scoreId}`);
  return (r.ok && r.records?.length > 0) ? r.records : null;
}

function extractHoleData(rec) {
  const n = rec.nholes || 18;
  const scores = [], pars = [], si = [], meters = [];
  for (let h = 1; h <= n; h++) {
    scores.push(rec[`gross_${h}`] != null ? Number(rec[`gross_${h}`]) : 0);
    pars.push(rec[`par_${h}`] != null ? Number(rec[`par_${h}`]) : 0);
    si.push(rec[`stroke_index_${h}`] != null ? Number(rec[`stroke_index_${h}`]) : 0);
    meters.push(rec[`meters_${h}`] != null ? Number(rec[`meters_${h}`]) : 0);
  }
  return { scores, pars, si, meters };
}
function extractPcc(rec) {
  const v = rec.cba ?? rec.pcc;
  if (v == null) return {};
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? { pcc: n } : {};
}
function mapPlayer(r) {
  const pos = r.classif_pos;
  const grossStr = r.gross_total;
  const toParStr = r.to_par_total;
  const isNS = pos === "NS" || grossStr === "NS" || r.score_status_id === 99;
  let grossNum = null;
  if (grossStr && !["NS", "NR", "DQ"].includes(grossStr)) { grossNum = parseInt(grossStr); if (isNaN(grossNum)) grossNum = null; }
  let toParNum = null;
  if (toParStr && !["NS", "NR", "DQ", "PAR"].includes(toParStr)) { toParNum = parseInt(String(toParStr).replace("+", "")); if (isNaN(toParNum)) toParNum = null; }
  if (toParStr === "PAR") toParNum = 0;
  return {
    scoreId: String(r.score_id || ""),
    pos: isNS ? "NS" : (isNaN(Number(pos)) ? pos : Number(pos)),
    name: (r.player_name || "").trim(),
    club: (r.player_club_description || "").trim(),
    grossTotal: isNS ? 999 : grossNum,
    toPar: isNS ? null : toParNum,
    hcpExact: r.exact_hcp != null ? Number(r.exact_hcp) : undefined,
    hcpPlay: r.play_hcp != null ? Number(r.play_hcp) : undefined,
    fedCode: null, courseRating: null, slope: null,
    teeName: null, teeColorId: null, parTotal: null, nholes: null, course: null,
    roundScores: [],
  };
}

/* ── Um jogador tem resultado real (não NS/sentinela)? ──────────────────── */
const playerHasScore = (p) => typeof p.grossTotal === "number" && p.grossTotal > 0 && p.grossTotal < 900;
const anyResults = (players) => Array.isArray(players) && players.some(playerHasScore);

/* ── Processa um host: warmup → classif → scorecards → tournament ───────── */
async function processHost(host, meta) {
  console.log(`[rali] → tentar host ${host.id} (ccode ${CCODE}, tcode ${TCODE})…`);
  await warmup(host);
  await sleep(150);

  const c1 = await fetchClassif(host, 1);
  if (!c1.ok) { console.warn(`[rali]   ${host.id}: classif falhou (${c1.error}).`); return { ok: false, reason: c1.error }; }
  if (c1.records.length === 0) { console.log(`[rali]   ${host.id}: 0 jogadores (torneio ainda não publicado).`); return { ok: true, empty: true }; }

  const players = c1.records.map(mapPlayer);

  // Detectar 2ª ronda (o RALI é 1 ronda, mas confirmamos por segurança).
  let nRounds = 1;
  await sleep(150);
  const c2 = await fetchClassif(host, 2);
  if (c2.ok && c2.records.length > 0) nRounds = 2;

  console.log(`[rali]   ${host.id}: ${players.length} jogadores${nRounds > 1 ? ` (${nRounds}R)` : ""} — a descarregar scorecards…`);

  let scOk = 0, scFail = 0;
  for (const p of players) {
    if (["NS", "DQ", "WD"].includes(p.pos) || !p.scoreId || p.scoreId === "0") continue;
    if (nRounds > 1) {
      const recs = await fetchScorecardAggregate(host, p.scoreId);
      if (recs?.length > 0) {
        const sc0 = recs[0];
        if (!p.fedCode && sc0.federated_code) {
          p.fedCode = sc0.federated_code; p.courseRating = sc0.course_rating; p.slope = sc0.slope;
          p.teeName = sc0.tee_name; p.teeColorId = sc0.tee_color_id;
          p.parTotal = sc0.par_total; p.nholes = sc0.nholes; p.course = sc0.course_description;
        }
        recs.forEach((sc, i) => {
          p.roundScores.push({ round: i + 1, gross: sc.gross_total, ...extractHoleData(sc), ...extractPcc(sc), courseRating: sc.course_rating, slope: sc.slope, teeName: sc.tee_name, teeColorId: sc.tee_color_id });
        });
        const sumGross = p.roundScores.reduce((s, r) => s + (r.gross || 0), 0);
        p.grossTotal = sumGross;
        p.toPar = sumGross - ((p.parTotal || 0) * p.roundScores.length);
        scOk++;
      } else scFail++;
    } else {
      const sc = await fetchScorecard(host, p.scoreId, 1);
      if (sc) {
        if (!p.fedCode && sc.federated_code) {
          p.fedCode = sc.federated_code; p.courseRating = sc.course_rating; p.slope = sc.slope;
          p.teeName = sc.tee_name; p.teeColorId = sc.tee_color_id;
          p.parTotal = sc.par_total; p.nholes = sc.nholes; p.course = sc.course_description;
        }
        p.roundScores.push({ round: 1, gross: sc.gross_total, ...extractHoleData(sc), ...extractPcc(sc), courseRating: sc.course_rating, slope: sc.slope, teeName: sc.tee_name, teeColorId: sc.tee_color_id });
        scOk++;
      } else scFail++;
    }
    await sleep(150);
  }
  console.log(`[rali]   ${host.id}: scorecards ${scOk} ok, ${scFail} falhas.`);

  // campo real: mais comum entre os scorecards; fallback ao curado do draw
  const courseCount = {};
  for (const p of players) if (p.course) courseCount[p.course] = (courseCount[p.course] || 0) + 1;
  const campo = Object.keys(courseCount).sort((a, b) => courseCount[b] - courseCount[a])[0] || meta.campo || "";

  const tournament = {
    name: meta.name || `Torneio CGSS RALI 2026`,
    ccode: CCODE, tcode: TCODE,
    date: meta.date || "",
    campo,
    rounds: nRounds,
    playerCount: players.length,
    players,
  };
  return { ok: true, tournament };
}

/* ── Escrita atómica ────────────────────────────────────────────────────── */
function writeAtomic(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

/* ══ Main ════════════════════════════════════════════════════════════════ */
(async () => {
  console.log(`[rali] tcode fixo: ${TCODE}${argVal("--tcode") ? " (via --tcode)" : " (default conhecido)"} · ccode ${CCODE}`);

  // Metadata curada do placeholder (nome/data/campo) — carregada já para
  // etiquetar o torneio sem depender do TournamentsLST.
  const pull = JSON.parse(fs.readFileSync(PULL, "utf8"));
  const placeholder = pull.tournaments.find(t => String(t.ccode) === CCODE && String(t.tcode) === PLACEHOLDER_TCODE);
  const meta = {
    name: placeholder?.name || "Torneio CGSS RALI 2026",
    date: placeholder?.date || "2026-08-01",
    campo: placeholder?.campo || "Santo da Serra - Machico-Desertas",
  };

  // 1) Tentar cada host até um devolver resultados.
  let scraped = null;
  const diagnostics = [];
  for (const host of HOSTS) {
    const r = await processHost(host, meta);
    if (r.ok && r.tournament && anyResults(r.tournament.players)) { scraped = r.tournament; break; }
    diagnostics.push(`${host.id}: ${r.empty ? "0 jogadores" : (r.reason || "sem resultados válidos")}`);
  }

  // 2) PROTECÇÃO: sem resultados válidos em NENHUM host → não gravar nada.
  if (!scraped) {
    console.log(`[rali] Sem classificação publicada em nenhum host — ficheiros intactos. (exit 2)`);
    console.log(`[rali]   ${diagnostics.join(" · ")}`);
    process.exit(2);
  }

  const nWith = scraped.players.filter(playerHasScore).length;
  console.log(`[rali] ✓ Resultados obtidos: ${scraped.players.length} jogadores (${nWith} com gross) · campo "${scraped.campo}".`);

  if (DRY) { console.log("[rali] --dry-run: nada gravado."); process.exit(0); }

  // 3) Merge em pull-torneios001.json (remove placeholder 90071 + dup do tcode real)
  const before = pull.tournaments.length;
  pull.tournaments = pull.tournaments.filter(t =>
    !(String(t.ccode) === CCODE && (String(t.tcode) === PLACEHOLDER_TCODE || String(t.tcode) === TCODE)));
  pull.tournaments.push(scraped);
  if (typeof pull.totalTournaments === "number") pull.totalTournaments = pull.tournaments.length;
  writeAtomic(PULL, pull);
  console.log(`[rali] pull-torneios001.json: ${before} → ${pull.tournaments.length} torneios (placeholder ${PLACEHOLDER_TCODE} → real ${TCODE}).`);

  // 4) Re-chavear o draw (mantém a tab "Draw R1" ao lado dos resultados)
  try {
    const cgss = JSON.parse(fs.readFileSync(CGSS, "utf8"));
    const entry = (cgss.tournaments || []).find(t => String(t.ccode) === CCODE && String(t.tcode) === PLACEHOLDER_TCODE);
    if (entry) {
      cgss.tournaments = cgss.tournaments.filter(t => !(String(t.ccode) === CCODE && String(t.tcode) === TCODE));
      entry.tcode = TCODE;
      entry.drawOnly = false;
      cgss.total = cgss.tournaments.length;
      writeAtomic(CGSS, cgss);
      console.log(`[rali] cgss-draws-manual.json: draw re-chaveado ${PLACEHOLDER_TCODE} → ${TCODE}.`);
    }
  } catch (e) {
    console.warn(`[rali] aviso: falhou re-chavear cgss-draws-manual.json: ${e.message}`);
  }

  console.log("[rali] ✓ Concluído. Verificar em /FPG (filtro Santo da Serra) e commitar public/data/.");
  process.exit(0);
})().catch(e => { console.error("[rali] ERRO:", e.message); process.exit(1); });
