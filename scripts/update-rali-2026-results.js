#!/usr/bin/env node
/**
 * update-rali-2026-results.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Substitui a entrada DRAW-ONLY do "Torneio CGSS RALI 2026" (Santo da Serra,
 * ccode 007, tcode PLACEHOLDER 90071) pelos RESULTADOS REAIS assim que a FPG
 * os publicar.
 *
 * Contexto: o draw foi inserido manualmente a 2026-07-31 (o CGSS só envia draws
 * por email) com um tcode sintético 90071. O torneio real tem o tcode REAL
 * 11050 (ccode 007, Santo da Serra), conhecido e FIXO. Este script:
 *   1. Vai DIRECTO às classificações do tcode 11050 (sem passar pelo
 *      TournamentsLST — esse passo era frágil e devolvia HTTP 500).
 *   2. Faz o scrape da classificação + scorecards (inline, Node puro).
 *   3. Substitui a entrada 90071 em pull-torneios001.json pelos resultados
 *      reais (mesmo "sítio": ccode 007 → tab Santo da Serra). Remove duplicados.
 *   4. Re-chaveia o draw em cgss-draws-manual.json de 90071 → tcode real, para
 *      a tab "Draw R1" continuar a aparecer ao lado dos resultados.
 *
 * HOST: scoring.datagolf.pt (o mesmo do resto da pipeline FPG). O endpoint de
 *       dados classif.aspx/ClassifLST funciona neste domínio; a página-shell
 *       Classifications.aspx?ccode=007&tcode=11050 é apenas o equivalente
 *       humano. Cookies: api/.scoring-datagolf-cookies.json (ou env
 *       DATAGOLF_SCORING_COOKIES). Validar antes:
 *       node scripts/test-datagolf-node.js  → Result:"OK".
 *
 * PROTECÇÃO DE DADOS: se a resposta não for 200, se o corpo contiver
 *       "Server Error", ou se o parsing devolver zero jogadores com gross
 *       real, o ficheiro JSON NÃO é escrito — nunca se substituem resultados
 *       bons por um ficheiro vazio.
 *
 * USO:
 *   node scripts/update-rali-2026-results.js            # tcode 11050 (default)
 *   node scripts/update-rali-2026-results.js --tcode N  # outro tcode
 *   node scripts/update-rali-2026-results.js --dry-run  # não grava, só relata
 *
 * EXIT CODES: 0 = actualizado (há resultados) · 2 = ainda sem resultados
 *             (torneio por jogar / não publicado — inofensivo) · 1 = erro real
 *             (sessão rejeitada, falta de cookies, HTTP não recuperável).
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
const DEFAULT_TCODE = "11050";                         // tcode REAL do RALI 2026 (fixo)
const TOURN_NAME = "Torneio CGSS RALI 2026";
const CAMPO = "Santo da Serra - Machico-Desertas";
const TARGET_DATE = "2026-08-01";

/* ── CLI ────────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes("--dry-run");
const TCODE = String(argVal("--tcode") || DEFAULT_TCODE);

/* ── HTTP config ────────────────────────────────────────────────────────── */
const BASE = "https://scoring.datagolf.pt/pt";
const ACK_CLASSIF = "8428ACK987";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
// Referer do próprio site (página-shell de classificações deste torneio).
const REFERER = `${BASE}/Classifications.aspx?ccode=${CCODE}&tcode=${TCODE}&classif_order=6`;
const RETRY_DELAYS = [2000, 5000, 10000];              // 5xx: 3 tentativas extra
const PAGE_SIZE = 150;
const DELAY_MS = 150;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Diagnóstico: distinguir "Server Error" de HTML de login ────────────── */
function diagnose(r) {
  if (r.netErr) return `erro de rede: ${r.netErr}`;
  const b = r.bodyHead || "";
  if (/Server Error/i.test(b))
    return "corpo contém 'Server Error' → sessão rejeitada pelo servidor (contexto ASP.NET em falta / cookies scoring.datagolf.pt expirados — refrescar DATAGOLF_SCORING_COOKIES)";
  if (r.result === "ERROR" || /Param_Errors|Err=999|\blogin\b/i.test(b))
    return "resposta de autenticação inválida (Param_Errors / HTML de login) → falta ou expirou o cookie de sessão — refrescar DATAGOLF_SCORING_COOKIES";
  return `HTTP ${r.status} não recuperável`;
}

/* ── HTTP: warmup + POST robusto (headers completos, log, retry 5xx) ────── */
async function warmupLinkpage(cookie) {
  const url = `${BASE}/linkpage.aspx?page=classif&club=${CCODE}&tourn=${TCODE}&ack=${ACK_CLASSIF}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9",
        "Referer": `${BASE}/`,
        "Cookie": cookie,
      },
      redirect: "follow",
    });
    await res.text();
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * POST a um PageMethod. Lê SEMPRE o corpo como texto primeiro (para poder medir
 * bytes, mostrar os primeiros 300 caracteres e detectar "Server Error").
 * Retry apenas em 5xx (e falhas de rede transitórias) — 3 tentativas extra com
 * espera crescente 2s/5s/10s. Erros de autenticação (200 + Result ERROR) NÃO
 * são retentados (refazer o pedido com o mesmo cookie mau não ajuda).
 */
async function postPageMethod(cookie, pathname, qs, body, label) {
  const url = `${BASE}/${pathname}${qs ? "?" + qs : ""}`;
  const headers = {
    "User-Agent": UA,
    "Content-Type": "application/json; charset=utf-8",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "pt-PT,pt;q=0.9",
    "Origin": "https://scoring.datagolf.pt",
    "Referer": REFERER,
    "Cookie": cookie,
  };

  let last = { ok: false, status: 0, bytes: 0, bodyHead: "", records: [] };
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      const text = await res.text();
      const bytes = Buffer.byteLength(text, "utf8");
      const bodyHead = text.slice(0, 300);

      if (res.status >= 500 && res.status < 600) {
        last = { ok: false, status: res.status, bytes, bodyHead, records: [] };
        if (attempt < RETRY_DELAYS.length) {
          const w = RETRY_DELAYS[attempt];
          console.warn(`${label}: HTTP ${res.status} (${bytes} bytes) — retry em ${w / 1000}s (${attempt + 1}/${RETRY_DELAYS.length})`);
          await sleep(w);
          continue;
        }
        return last;                                  // 5xx persistente
      }

      if (res.status !== 200) {
        return { ok: false, status: res.status, bytes, bodyHead, records: [] };
      }

      let json = null;
      try { json = JSON.parse(text); } catch { /* corpo não-JSON (HTML de login?) */ }
      if (!json) return { ok: false, status: 200, bytes, bodyHead, records: [] };

      const d = json.d || json;
      return {
        ok: d.Result === "OK",
        status: 200, bytes, bodyHead,
        result: d.Result, message: d.Message,
        records: d.Records || [], total: d.TotalRecordCount ?? 0,
      };
    } catch (e) {
      last = { ok: false, status: 0, bytes: 0, bodyHead: "", records: [], netErr: e.message };
      if (attempt < RETRY_DELAYS.length) {
        const w = RETRY_DELAYS[attempt];
        console.warn(`${label}: erro de rede (${e.message}) — retry em ${w / 1000}s (${attempt + 1}/${RETRY_DELAYS.length})`);
        await sleep(w);
        continue;
      }
      return last;                                    // rede persistentemente em baixo
    }
  }
  return last;
}

/* ── Classif (paginada) ─────────────────────────────────────────────────── */
async function fetchClassif(cookie, round) {
  const all = [];
  let startIndex = 0;
  while (true) {
    const body = {
      Classi: "1",
      tclub: CCODE, tcode: TCODE,
      classiforder: "1", classiftype: "I", classifroundtype: "D",
      scoringtype: "1", round: String(round || 1),
      members: "0", playertypes: "0", gender: "0",
      minagemen: "0", maxagemen: "999",
      minageladies: "0", maxageladies: "999",
      minhcp: "-8", maxhcp: "99",
      idfilter: "-1",
      jtStartIndex: String(startIndex), jtPageSize: String(PAGE_SIZE),
      jtSorting: "score_id DESC",
    };
    const qs = `jtStartIndex=${startIndex}&jtPageSize=${PAGE_SIZE}&jtSorting=${encodeURIComponent("score_id DESC")}`;
    const r = await postPageMethod(cookie, "classif.aspx/ClassifLST", qs, body, `[rali] classif R${round} p${startIndex / PAGE_SIZE + 1}`);
    if (!r.ok) return { ok: false, records: all, fail: r };
    all.push(...r.records);
    if (r.records.length < PAGE_SIZE) break;
    startIndex += PAGE_SIZE;
    await sleep(DELAY_MS);
  }
  return { ok: true, records: all, fail: null };
}

/* ── Scorecards ─────────────────────────────────────────────────────────── */
async function fetchScorecard(cookie, scoreId, round) {
  const qs = `score_id=${scoreId}&tclub=${CCODE}&tcode=${TCODE}&scoringtype=1&classiftype=I&classifround=${round}`;
  const body = { score_id: String(scoreId), tclub: CCODE, tcode: TCODE, scoringtype: "1", classiftype: "I", classifround: String(round) };
  const r = await postPageMethod(cookie, "classif.aspx/ScoreCard", qs, body, `[rali] scorecard ${scoreId} R${round}`);
  return (r.ok && r.records?.length > 0) ? r.records[0] : null;
}
async function fetchScorecardAggregate(cookie, scoreId) {
  const qs = `score_id=${scoreId}&tclub=${CCODE}&tcode=${TCODE}&scoringtype=1&classiftype=I&classifround=`;
  const body = { score_id: String(scoreId), tclub: CCODE, tcode: TCODE, scoringtype: "1", classiftype: "I", classifround: "" };
  const r = await postPageMethod(cookie, "classifAgregate.aspx/ScoreCard", qs, body, `[rali] scorecard-agg ${scoreId}`);
  return (r.ok && r.records?.length > 0) ? r.records : null;
}

/* ── Parsers (espelham scrape-classif-node.js) ──────────────────────────── */
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
  if (grossStr && !["NS", "NR", "DQ"].includes(grossStr)) {
    grossNum = parseInt(grossStr);
    if (isNaN(grossNum)) grossNum = null;
  }
  let toParNum = null;
  if (toParStr && !["NS", "NR", "DQ", "PAR"].includes(toParStr)) {
    toParNum = parseInt(String(toParStr).replace("+", ""));
    if (isNaN(toParNum)) toParNum = null;
  }
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

// Gross "real" = pancadas jogadas (exclui sentinelas ≥900: NS=999, sem-cartão).
const hasRealGross = (p) => typeof p.grossTotal === "number" && p.grossTotal > 0 && p.grossTotal < 900;

/* ── Merge em pull-torneios001.json (pura: recebe objecto, devolve objecto) ─ */
function mergePull(pull, scraped) {
  const before = pull.tournaments.length;
  const tournaments = pull.tournaments.filter((t) =>
    !(String(t.ccode) === CCODE && (String(t.tcode) === PLACEHOLDER_TCODE || String(t.tcode) === String(scraped.tcode))));
  tournaments.push(scraped);
  const totalPlayers = tournaments.reduce((s, t) => s + (t.playerCount || (t.players || []).length || 0), 0);
  const totalScorecards = tournaments.reduce((s, t) =>
    s + ((t.players || []).filter((p) => p.roundScores && p.roundScores.length > 0).length), 0);
  const out = { ...pull, tournaments, totalTournaments: tournaments.length, totalPlayers, totalScorecards };
  return { out, before, after: tournaments.length };
}

/* ── Re-chavear o draw (pura: recebe objecto, devolve objecto) ──────────── */
function rekeyDraw(cgss, realTcode) {
  const entry = (cgss.tournaments || []).find((t) => String(t.ccode) === CCODE && String(t.tcode) === PLACEHOLDER_TCODE);
  if (!entry) return { out: cgss, changed: false };
  const tournaments = (cgss.tournaments || [])
    .filter((t) => !(String(t.ccode) === CCODE && String(t.tcode) === String(realTcode)))
    .map((t) => (t === entry ? { ...t, tcode: String(realTcode), drawOnly: false } : t));
  return { out: { ...cgss, tournaments, total: tournaments.length }, changed: true };
}

function writeAtomic(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

/* ── Scrape completo de um torneio (classif + scorecards) ───────────────── */
async function scrapeTournament(cookie) {
  await warmupLinkpage(cookie);
  await sleep(DELAY_MS);

  // 1) Classif R1 — DIRECTO (sem TournamentsLST)
  const c1 = await fetchClassif(cookie, 1);
  if (!c1.ok) {
    const f = c1.fail || {};
    console.error("[rali] ClassifLST FALHOU — dados protegidos, nada será escrito.");
    console.error(`[rali]   HTTP: ${f.status}`);
    console.error(`[rali]   bytes: ${f.bytes}`);
    console.error(`[rali]   corpo (300): ${(f.bodyHead || "").replace(/\s+/g, " ").trim() || "(vazio)"}`);
    console.error(`[rali]   diagnóstico: ${diagnose(f)}`);
    return { fatal: true };
  }

  const players = c1.records.map(mapPlayer);
  if (players.length === 0) return { players: [], nRounds: 1, published: false };
  const realCount = players.filter(hasRealGross).length;
  if (realCount === 0) return { players, nRounds: 1, published: false };

  // 2) Multi-ronda? (RALI é 1 ronda, mas detecta na mesma)
  let nRounds = 1;
  await sleep(DELAY_MS);
  const probe = await fetchClassif(cookie, 2);
  if (probe.ok && probe.records.length > 0) nRounds = 2;

  // 3) Scorecards (não-fatal — enriquecem, não bloqueiam)
  let scOk = 0, scFail = 0, scSkip = 0;
  for (const p of players) {
    if (["NS", "DQ", "WD"].includes(p.pos) || !p.scoreId || p.scoreId === "0") { scSkip++; continue; }
    if (nRounds > 1) {
      const recs = await fetchScorecardAggregate(cookie, p.scoreId);
      if (recs?.length > 0) {
        const sc0 = recs[0];
        if (!p.fedCode && sc0.federated_code) {
          p.fedCode = sc0.federated_code; p.courseRating = sc0.course_rating; p.slope = sc0.slope;
          p.teeName = sc0.tee_name; p.teeColorId = sc0.tee_color_id;
          p.parTotal = sc0.par_total; p.nholes = sc0.nholes; p.course = sc0.course_description;
        }
        recs.forEach((sc, i) => {
          const hd = extractHoleData(sc);
          p.roundScores.push({ round: i + 1, gross: sc.gross_total, ...hd, ...extractPcc(sc), courseRating: sc.course_rating, slope: sc.slope, teeName: sc.tee_name, teeColorId: sc.tee_color_id });
        });
        scOk++;
      } else scFail++;
    } else {
      const sc = await fetchScorecard(cookie, p.scoreId, 1);
      if (sc) {
        const hd = extractHoleData(sc);
        if (!p.fedCode && sc.federated_code) {
          p.fedCode = sc.federated_code; p.courseRating = sc.course_rating; p.slope = sc.slope;
          p.teeName = sc.tee_name; p.teeColorId = sc.tee_color_id;
          p.parTotal = sc.par_total; p.nholes = sc.nholes; p.course = sc.course_description;
        }
        p.roundScores.push({ round: 1, gross: sc.gross_total, ...hd, ...extractPcc(sc), courseRating: sc.course_rating, slope: sc.slope, teeName: sc.tee_name, teeColorId: sc.tee_color_id });
        scOk++;
      } else scFail++;
    }
    if (nRounds > 1 && p.roundScores.length > 1) {
      const sumGross = p.roundScores.reduce((s, r) => s + (r.gross || 0), 0);
      p.grossTotal = sumGross;
      p.toPar = sumGross - ((p.parTotal || 0) * p.roundScores.length);
    }
    await sleep(DELAY_MS);
  }
  console.log(`[rali]   scorecards: ${scOk} ok, ${scFail} falhas${scSkip ? `, ${scSkip} saltados (NS/DQ/WD)` : ""}`);
  return { players, nRounds, published: true };
}

function buildTournament(players, nRounds) {
  return {
    name: TOURN_NAME, ccode: CCODE, tcode: TCODE,
    date: TARGET_DATE, campo: CAMPO,
    rounds: nRounds, playerCount: players.length, players,
  };
}

/* ── Main ───────────────────────────────────────────────────────────────── */
async function main() {
  const cookieRaw = loadCookieHeader({
    envVars: ["DATAGOLF_SCORING_COOKIES", "DATAGOLF_COOKIES"],
    file: path.join(REPO, "api", ".scoring-datagolf-cookies.json"),
    label: "scoring.datagolf.pt",
  });
  if (!cookieRaw) { console.error("[rali] ERRO: sem cookies scoring.datagolf.pt."); return 1; }
  const cookie = cookieRaw.trim();

  console.log(`[rali] Host: scoring.datagolf.pt · ccode ${CCODE} · tcode ${TCODE} (directo às classificações, sem TournamentsLST)`);

  const res = await scrapeTournament(cookie);
  if (res.fatal) return 1;                             // erro real (sessão/rede) — já logado
  if (!res.published) {
    console.log("[rali] Ainda sem classificação com gross real publicada (torneio por jogar / não publicado). Nada escrito. (exit 2)");
    return 2;
  }

  const nWith = res.players.filter(hasRealGross).length;
  console.log(`[rali] Scrape OK: ${res.players.length} jogadores (${nWith} com gross real)${res.nRounds > 1 ? ` · ${res.nRounds} rondas` : ""}.`);

  const scraped = buildTournament(res.players, res.nRounds);

  if (DRY) { console.log("[rali] --dry-run: nada gravado."); return 0; }

  // Merge em pull-torneios001.json (remove placeholder 90071 + dup do tcode real)
  const pull = JSON.parse(fs.readFileSync(PULL, "utf8"));
  const { out: pullOut, before, after } = mergePull(pull, scraped);
  writeAtomic(PULL, pullOut);
  console.log(`[rali] pull-torneios001.json: ${before} → ${after} torneios (placeholder ${PLACEHOLDER_TCODE} → real ${TCODE}).`);

  // Re-chavear o draw (mantém a tab "Draw R1" ao lado dos resultados)
  try {
    const cgss = JSON.parse(fs.readFileSync(CGSS, "utf8"));
    const { out: cgssOut, changed } = rekeyDraw(cgss, TCODE);
    if (changed) {
      writeAtomic(CGSS, cgssOut);
      console.log(`[rali] cgss-draws-manual.json: draw re-chaveado ${PLACEHOLDER_TCODE} → ${TCODE}.`);
    } else {
      console.log(`[rali] cgss-draws-manual.json: sem placeholder ${PLACEHOLDER_TCODE} para re-chavear (já feito?).`);
    }
  } catch (e) {
    console.warn(`[rali] aviso: falhou re-chavear cgss-draws-manual.json: ${e.message}`);
  }

  console.log("[rali] ✓ Concluído. Verificar em /FPG (filtro Santo da Serra) e commitar public/data/.");
  return 0;
}

/* Só corre quando invocado directamente — permite testar as funções puras. */
if (require.main === module) {
  main().then((code) => process.exit(code)).catch((e) => { console.error("[rali] ERRO:", e.message); process.exit(1); });
}

module.exports = {
  mapPlayer, extractHoleData, extractPcc, hasRealGross,
  buildTournament, mergePull, rekeyDraw,
  CCODE, PLACEHOLDER_TCODE, DEFAULT_TCODE,
};
