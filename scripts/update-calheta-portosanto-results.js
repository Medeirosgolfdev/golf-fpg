#!/usr/bin/env node
/**
 * update-calheta-portosanto-results.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Actualiza com RESULTADOS REAIS os dois torneios de 2026-08-08:
 *
 *  A) "Torneio de Golfe CALHETA VIVA 2026" — Santo da Serra (ccode 007).
 *     Draw inserido manualmente a 2026-08-07 (o CGSS só envia draws por email)
 *     com tcode PLACEHOLDER 90072 (convenção do RALI/90071). O tcode real NÃO
 *     é conhecido à partida:
 *       1. Descoberta primária: TournamentsLST com TournName "CALHETA"
 *          (resultado pequeno; a lista só publica torneios já jogados).
 *       2. Fallback: sondar ClassifLST nos tcodes 11051..11070 e aceitar o
 *          que tiver maior sobreposição de nomes com o field do draw (≥30).
 *     Depois: substitui o stub 90072 em pull-torneios001.json, re-chaveia o
 *     draw em cgss-draws-manual.json e a casca em fpg-admissions-draws.json
 *     (mesmos passos do update-rali-2026-results.js).
 *
 *  B) Torneio do Porto Santo Golfe (ccode 183) — tcode em princípio 10179
 *     (o 10178 foi o "VIII aniversário PXO" de 2026-08-01; os tcodes do 183
 *     são sequenciais por data). Sem draw prévio (o clube não publica).
 *       1. Descoberta primária: TournamentsLST ClubCode 183 (nome/data reais).
 *       2. Fallback: sondar 10179/10180/10181 e aceitar o primeiro com
 *          resultados (qualquer resultado nestes tcodes é novo — estão acima
 *          do máximo conhecido).
 *     Resultado entra em pull-torneios002.json (onde vivem os outros 183).
 *
 * PROTECÇÃO DE DADOS: nunca grava com resposta não-200, corpo "Server Error"
 * ou 0 jogadores com score. Entradas boas nunca são substituídas por vazio.
 *
 * COOKIES: DATAGOLF_SCORING_COOKIES / api/.scoring-datagolf-cookies.json e
 *          FPG_ADMISSIONS_COOKIES / api/.fpg-admissions-cookies.json.
 *          Validar antes: node scripts/test-datagolf-node.js → Result:"OK".
 *
 * USO:
 *   node scripts/update-calheta-portosanto-results.js               # ambos
 *   node scripts/update-calheta-portosanto-results.js --only calheta
 *   node scripts/update-calheta-portosanto-results.js --only portosanto
 *   node scripts/update-calheta-portosanto-results.js --cv-tcode N  # forçar
 *   node scripts/update-calheta-portosanto-results.js --ps-tcode N  # forçar
 *   node scripts/update-calheta-portosanto-results.js --dry-run
 *
 * EXIT CODES: 0 = pelo menos um actualizado · 2 = nenhum publicado ainda ·
 *             1 = erro.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { loadCookieHeader } = require("./lib/cookies");

const REPO = path.resolve(__dirname, "..");
const PULL_CV = path.join(REPO, "public", "data", "pull-torneios001.json");
const PULL_PS = path.join(REPO, "public", "data", "pull-torneios002.json");
const CGSS = path.join(REPO, "public", "data", "cgss-draws-manual.json");
const ADM = path.join(REPO, "public", "data", "fpg-admissions-draws.json");

const CV = {
  ccode: "007",
  placeholder: "90072",
  name: "Torneio de Golfe CALHETA VIVA 2026",
  date: "2026-08-08",
  campo: "Santo da Serra - Machico-Desertas",
  probeTcodes: Array.from({ length: 20 }, (_, i) => String(11051 + i)),
  // ⚠ limiar alto de propósito: os sócios CGSS repetem-se de torneio para
  // torneio — um torneio ERRADO de 44 jogadores partilhava 30 nomes com o
  // draw (11052, apanhado em dry-run 2026-08-07). O Calheta Viva tem 130
  // inscritos → o verdadeiro terá ≥60 nomes do draw E ≥80 jogadores.
  minOverlap: 60,
  minPlayers: 80,
};
const PS = {
  ccode: "183",
  date: "2026-08-08",
  probeTcodes: ["10179", "10180", "10181"],
  // Confirmado pelo draw oficial (Draw Oficial PXO.pdf, 2026-08-07): é o
  // "Torneio José Rosado", Porto Santo Golfe, 56 jogadores, shotgun 08:30.
  // O draw + stub _drawOnly já estão em cgss-draws-manual.json e
  // pull-torneios002.json com a chave REAL 183/10179 (sem placeholder).
  fallbackName: "Torneio José Rosado",
  campo: "Porto Santo Golfe",
};

const args = process.argv.slice(2);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes("--dry-run");
const ONLY = argVal("--only");
if (argVal("--cv-tcode")) CV.probeTcodes = [String(argVal("--cv-tcode"))];
if (argVal("--ps-tcode")) PS.probeTcodes = [String(argVal("--ps-tcode"))];

/* ── HTTP (idêntico ao update-rali-2026-results.js) ─────────────────────── */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const ACK_CLASSIF = "8428ACK987";
const PAGE_SIZE = 150;
const RETRY_WAITS = [2000, 5000, 10000];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const cookieDG = loadCookieHeader({
  envVars: ["DATAGOLF_SCORING_COOKIES", "DATAGOLF_COOKIES"],
  file: path.join(REPO, "api", ".scoring-datagolf-cookies.json"),
  label: "[wknd/datagolf]", exitOnFail: false,
});
const cookieFPG = loadCookieHeader({
  envVars: ["FPG_ADMISSIONS_COOKIES"],
  file: path.join(REPO, "api", ".fpg-admissions-cookies.json"),
  label: "[wknd/fpg]", exitOnFail: false,
});
const HOSTS = [
  { id: "scoring.datagolf.pt", base: "https://scoring.datagolf.pt/pt", origin: "https://scoring.datagolf.pt", cookie: cookieDG, hasTournLST: true },
  { id: "scoring.fpg.pt",      base: "https://scoring.fpg.pt/lists",   origin: "https://scoring.fpg.pt",      cookie: cookieFPG, hasTournLST: false },
];
for (const h of HOSTS) if (!h.cookie) console.warn(`[wknd] aviso: sem cookies para ${h.id} — tento na mesma.`);
if (!HOSTS.some(h => h.cookie)) { console.error("[wknd] ERRO: sem cookies para nenhum host."); process.exit(1); }

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
  console.error(`[wknd] ✗ ${host.id} · ${label}: HTTP ${status}${extra ? ` (${extra})` : ""} · ${bytes} bytes · tipo: ${classifyBody(text)}`);
  console.error(`[wknd]   corpo[0..300]: ${head}`);
}

async function postJson(host, pathname, qs, body, label, { quiet } = {}) {
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
      if (attempt < RETRY_WAITS.length) { await sleep(RETRY_WAITS[attempt]); continue; }
      if (!quiet) console.error(`[wknd] ✗ ${host.id} · ${label}: rede falhou: ${msg}`);
      return { ok: false, status: 0, error: `network: ${msg}` };
    }
    if (res.status >= 500) {
      if (attempt < RETRY_WAITS.length) { await sleep(RETRY_WAITS[attempt]); continue; }
      if (!quiet) logFailure(host, label, res.status, text);
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    if (res.status !== 200) {
      if (!quiet) logFailure(host, label, res.status, text);
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    if (/Server Error/i.test(text || "")) {
      if (!quiet) logFailure(host, label, 200, text, "corpo contém 'Server Error'");
      return { ok: false, status: 200, error: "server-error-body" };
    }
    let json;
    try { json = JSON.parse(text); }
    catch { if (!quiet) logFailure(host, label, 200, text, "corpo não é JSON"); return { ok: false, status: 200, error: "bad-json" }; }
    const d = json.d || json;
    if (d.Result !== "OK") {
      if (!quiet) logFailure(host, label, 200, text, `Result=${d.Result || "?"}`);
      return { ok: false, status: 200, error: `Result=${d.Result || "?"}` };
    }
    return { ok: true, status: 200, records: d.Records || [], total: d.TotalRecordCount ?? 0 };
  }
}

async function warmup(host, ccode, tcode) {
  const url = `${host.base}/linkpage.aspx?page=classif&club=${ccode}&tourn=${tcode}&ack=${ACK_CLASSIF}`;
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

async function fetchClassif(host, ccode, tcode, round, { quiet } = {}) {
  const all = [];
  let startIndex = 0;
  while (true) {
    const body = {
      Classi: "1", tclub: ccode, tcode: tcode,
      classiforder: "1", classiftype: "I", classifroundtype: "D",
      scoringtype: "1", round: String(round || 1),
      members: "0", playertypes: "0", gender: "0",
      minagemen: "0", maxagemen: "999", minageladies: "0", maxageladies: "999",
      minhcp: "-8", maxhcp: "99", idfilter: "-1",
      jtStartIndex: String(startIndex), jtPageSize: String(PAGE_SIZE), jtSorting: "score_id DESC",
    };
    const qs = `jtStartIndex=${startIndex}&jtPageSize=${PAGE_SIZE}&jtSorting=${encodeURIComponent("score_id DESC")}`;
    const r = await postJson(host, "classif.aspx/ClassifLST", qs, body, `classif ${ccode}/${tcode} R${round || 1}`, { quiet });
    if (!r.ok) return { ok: false, records: all, error: r.error };
    all.push(...r.records);
    if (r.records.length < PAGE_SIZE) break;
    startIndex += PAGE_SIZE;
    await sleep(150);
  }
  return { ok: true, records: all };
}

async function fetchScorecard(host, ccode, tcode, scoreId, round) {
  const qs = `score_id=${scoreId}&tclub=${ccode}&tcode=${tcode}&scoringtype=1&classiftype=I&classifround=${round}`;
  const body = { score_id: String(scoreId), tclub: ccode, tcode: tcode, scoringtype: "1", classiftype: "I", classifround: String(round) };
  const r = await postJson(host, "classif.aspx/ScoreCard", qs, body, `scorecard ${scoreId}`);
  return (r.ok && r.records?.length > 0) ? r.records[0] : null;
}
async function fetchScorecardAggregate(host, ccode, tcode, scoreId) {
  const qs = `score_id=${scoreId}&tclub=${ccode}&tcode=${tcode}&scoringtype=1&classiftype=I&classifround=`;
  const body = { score_id: String(scoreId), tclub: ccode, tcode: tcode, scoringtype: "1", classiftype: "I", classifround: "" };
  const r = await postJson(host, "classifAgregate.aspx/ScoreCard", qs, body, `scorecard-agg ${scoreId}`);
  return (r.ok && r.records?.length > 0) ? r.records : null;
}

/* ── TournamentsLST (só datagolf) — lista SÓ torneios já jogados ────────── */
const { lisbonCivilDayStr } = require("../lib/helpers.js");
async function tournLstRecent(host, { clubCode, tournName }) {
  const body = {
    ClubCode: String(clubCode || "0"), dtIni: "", dtFim: "", CourseName: "", TournCode: "",
    TournName: tournName || "",
    jtStartIndex: "0", jtPageSize: "50", jtSorting: "started_at DESC",
  };
  const qs = `jtStartIndex=0&jtPageSize=50&jtSorting=${encodeURIComponent("started_at DESC")}`;
  const r = await postJson(host, "tournaments.aspx/TournamentsLST", qs, body, `tournlst ${clubCode || tournName}`, { quiet: true });
  if (!r.ok) return [];
  return r.records.map((raw) => ({
    name: raw.description || "",
    ccode: raw.club_code || "",
    tcode: String(raw.code || ""),
    date: lisbonCivilDayStr(parseInt((raw.started_at || "").match(/\d+/)?.[0] || "0")),
    campo: raw.course_description || "",
    rounds: raw.rounds || 1,
  }));
}

/* ── mapPlayer + extractores (iguais ao update-rali) ────────────────────── */
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
const playerHasScore = (p) => typeof p.grossTotal === "number" && p.grossTotal > 0 && p.grossTotal < 900;
const anyResults = (players) => Array.isArray(players) && players.some(playerHasScore);

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/* ── scrape completo de um (ccode, tcode) num host ──────────────────────── */
async function scrapeTournament(host, ccode, tcode, meta) {
  await warmup(host, ccode, tcode);
  await sleep(150);
  const c1 = await fetchClassif(host, ccode, tcode, 1);
  if (!c1.ok) return { ok: false, reason: c1.error };
  if (c1.records.length === 0) return { ok: true, empty: true };

  const players = c1.records.map(mapPlayer);
  let nRounds = 1;
  await sleep(150);
  const c2 = await fetchClassif(host, ccode, tcode, 2, { quiet: true });
  if (c2.ok && c2.records.length > 0) nRounds = 2;

  console.log(`[wknd]   ${host.id}: ${ccode}/${tcode} → ${players.length} jogadores${nRounds > 1 ? ` (${nRounds}R)` : ""} — scorecards…`);
  let scOk = 0, scFail = 0;
  for (const p of players) {
    if (["NS", "DQ", "WD"].includes(p.pos) || !p.scoreId || p.scoreId === "0") continue;
    if (nRounds > 1) {
      const recs = await fetchScorecardAggregate(host, ccode, tcode, p.scoreId);
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
      const sc = await fetchScorecard(host, ccode, tcode, p.scoreId, 1);
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
  console.log(`[wknd]   ${host.id}: scorecards ${scOk} ok, ${scFail} falhas.`);

  const courseCount = {};
  for (const p of players) if (p.course) courseCount[p.course] = (courseCount[p.course] || 0) + 1;
  const campo = Object.keys(courseCount).sort((a, b) => courseCount[b] - courseCount[a])[0] || meta.campo || "";

  return {
    ok: true,
    tournament: {
      name: meta.name, ccode, tcode,
      date: meta.date || "", campo,
      rounds: nRounds, playerCount: players.length, players,
    },
  };
}

function writeAtomic(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

/* ── JOB A: Calheta Viva ────────────────────────────────────────────────── */
async function jobCalheta() {
  console.log(`[wknd] ══ CALHETA VIVA 2026 (007, placeholder ${CV.placeholder}) ══`);
  // field do draw (para verificação por sobreposição de nomes)
  const cgss = JSON.parse(fs.readFileSync(CGSS, "utf8"));
  const drawEntry = cgss.tournaments.find(t => t.ccode === CV.ccode &&
    (String(t.tcode) === CV.placeholder || norm(t.name) === norm(CV.name)));
  const drawNames = new Set();
  if (drawEntry) for (const r of Object.values(drawEntry.draws || {}))
    for (const g of r.groups || []) for (const p of g.players || []) drawNames.add(norm(p.nome));
  const overlap = (players) => players.reduce((s, p) => s + (drawNames.has(norm(p.name)) ? 1 : 0), 0);

  // 1) descoberta do tcode real
  let candidates = CV.probeTcodes;
  const dgHost = HOSTS.find(h => h.hasTournLST && h.cookie);
  if (dgHost && candidates.length > 1) {
    const recs = await tournLstRecent(dgHost, { clubCode: CV.ccode, tournName: "CALHETA" });
    const hit = recs.find(r => r.ccode === CV.ccode && /CALHETA\s*VIVA/i.test(r.name) && r.date >= "2026-08-01");
    if (hit) {
      console.log(`[wknd] TournamentsLST encontrou: ${hit.ccode}/${hit.tcode} "${hit.name}" (${hit.date})`);
      candidates = [hit.tcode, ...candidates.filter(t => t !== hit.tcode)];
    } else {
      console.log(`[wknd] TournamentsLST sem match (normal se ainda não publicado) — sondagem directa.`);
    }
  }

  // 2) scrape + verificação de identidade
  let scraped = null;
  for (const host of HOSTS) {
    for (const tcode of candidates) {
      const r = await scrapeTournamentIfMatches(host, tcode, overlap, drawNames.size);
      if (r) { scraped = r; break; }
      await sleep(200);
    }
    if (scraped) break;
  }
  async function scrapeTournamentIfMatches(host, tcode, overlapFn, nDraw) {
    // sondagem barata primeiro: só a classificação (sem scorecards)
    await warmup(host, CV.ccode, tcode);
    await sleep(100);
    const probe = await fetchClassif(host, CV.ccode, tcode, 1, { quiet: true });
    if (!probe.ok || probe.records.length === 0) return null;
    const names = probe.records.map(mapPlayer);
    if (!anyResults(names)) return null;
    const ov = overlapFn(names);
    if (nDraw > 0 && (ov < CV.minOverlap || names.length < CV.minPlayers)) {
      console.log(`[wknd]   ${CV.ccode}/${tcode}: ${names.length} jogadores, ${ov} do field do draw — NÃO é o Calheta Viva (exige ≥${CV.minOverlap} nomes e ≥${CV.minPlayers} jogadores), ignorado.`);
      return null;
    }
    console.log(`[wknd] ✓ tcode real identificado: ${CV.ccode}/${tcode} (${ov}/${nDraw} nomes do draw presentes)`);
    const full = await scrapeTournament(host, CV.ccode, tcode, { name: CV.name, date: CV.date, campo: CV.campo });
    return (full.ok && full.tournament && anyResults(full.tournament.players)) ? full.tournament : null;
  }

  if (!scraped) { console.log(`[wknd] Calheta Viva: sem classificação publicada — intacto.`); return false; }
  const nWith = scraped.players.filter(playerHasScore).length;
  console.log(`[wknd] ✓ Calheta Viva: ${scraped.players.length} jogadores (${nWith} com gross) · tcode ${scraped.tcode}.`);
  if (DRY) { console.log("[wknd] --dry-run: nada gravado."); return true; }

  // 3) pull-torneios001: remove placeholder + dup, insere real
  const pull = JSON.parse(fs.readFileSync(PULL_CV, "utf8"));
  pull.tournaments = pull.tournaments.filter(t =>
    !(String(t.ccode) === CV.ccode && (String(t.tcode) === CV.placeholder || String(t.tcode) === scraped.tcode)));
  pull.tournaments.push(scraped);
  if (typeof pull.totalTournaments === "number") pull.totalTournaments = pull.tournaments.length;
  writeAtomic(PULL_CV, pull);
  console.log(`[wknd] pull-torneios001.json: placeholder ${CV.placeholder} → real ${scraped.tcode}.`);

  // 4) re-chavear o draw
  try {
    const entry = cgss.tournaments.find(t => t.ccode === CV.ccode && String(t.tcode) === CV.placeholder);
    if (entry) {
      cgss.tournaments = cgss.tournaments.filter(t => !(t.ccode === CV.ccode && String(t.tcode) === scraped.tcode));
      entry.tcode = scraped.tcode;
      entry.drawOnly = false;
      cgss.total = cgss.tournaments.length;
      writeAtomic(CGSS, cgss);
      console.log(`[wknd] cgss-draws-manual.json: draw re-chaveado ${CV.placeholder} → ${scraped.tcode}.`);
    }
  } catch (e) { console.warn(`[wknd] aviso: re-chavear cgss falhou: ${e.message}`); }

  // 5) re-chavear casca admissions (se existir)
  try {
    const adm = JSON.parse(fs.readFileSync(ADM, "utf8"));
    const entry = (adm.tournaments || []).find(t => String(t.ccode) === CV.ccode && String(t.tcode) === CV.placeholder);
    if (entry) {
      adm.tournaments = adm.tournaments.filter(t => !(String(t.ccode) === CV.ccode && String(t.tcode) === scraped.tcode));
      entry.tcode = scraped.tcode;
      if (typeof adm.total === "number") adm.total = adm.tournaments.length;
      writeAtomic(ADM, adm);
      console.log(`[wknd] fpg-admissions-draws.json: casca re-chaveada → ${scraped.tcode}.`);
    }
  } catch (e) { console.warn(`[wknd] aviso: re-chavear admissions falhou: ${e.message}`); }
  return true;
}

/* ── JOB B: Porto Santo ─────────────────────────────────────────────────── */
async function jobPortoSanto() {
  console.log(`[wknd] ══ PORTO SANTO (183, candidatos ${PS.probeTcodes.join("/")}) ══`);
  let meta = null;
  let candidates = PS.probeTcodes;
  const dgHost = HOSTS.find(h => h.hasTournLST && h.cookie);
  if (dgHost) {
    const recs = await tournLstRecent(dgHost, { clubCode: PS.ccode });
    const hit = recs.find(r => r.ccode === PS.ccode && r.date >= "2026-08-02");
    if (hit) {
      console.log(`[wknd] TournamentsLST encontrou: ${hit.ccode}/${hit.tcode} "${hit.name}" (${hit.date})`);
      meta = { name: hit.name, date: hit.date, campo: hit.campo };
      candidates = [hit.tcode, ...candidates.filter(t => t !== hit.tcode)];
    }
  }

  let scraped = null;
  for (const host of HOSTS) {
    for (const tcode of candidates) {
      const r = await scrapeTournament(host, PS.ccode, tcode,
        meta || { name: PS.fallbackName, date: PS.date, campo: PS.campo });
      if (r.ok && r.tournament && anyResults(r.tournament.players)) { scraped = r.tournament; break; }
      await sleep(200);
    }
    if (scraped) break;
  }
  if (!scraped) { console.log(`[wknd] Porto Santo: sem classificação publicada — intacto.`); return false; }

  const nWith = scraped.players.filter(playerHasScore).length;
  console.log(`[wknd] ✓ Porto Santo: "${scraped.name}" ${scraped.players.length} jogadores (${nWith} com gross) · tcode ${scraped.tcode}.`);
  if (DRY) { console.log("[wknd] --dry-run: nada gravado."); return true; }

  const pull = JSON.parse(fs.readFileSync(PULL_PS, "utf8"));
  const existing = pull.tournaments.find(t => String(t.ccode) === PS.ccode && String(t.tcode) === scraped.tcode);
  if (existing && anyResults(existing.players) && !anyResults(scraped.players)) {
    console.log(`[wknd] Porto Santo: entrada existente tem resultados e o scrape não — intacto.`);
    return false;
  }
  pull.tournaments = pull.tournaments.filter(t => !(String(t.ccode) === PS.ccode && String(t.tcode) === scraped.tcode));
  pull.tournaments.push(scraped);
  if (typeof pull.totalTournaments === "number") pull.totalTournaments = pull.tournaments.length;
  writeAtomic(PULL_PS, pull);
  console.log(`[wknd] pull-torneios002.json: 183/${scraped.tcode} gravado.`);

  // draw curado do 183/10179 deixa de ser draw-only (a tab Draw fica ao lado
  // dos resultados; a chave já é a real, não há re-chaveamento)
  try {
    const cgss = JSON.parse(fs.readFileSync(CGSS, "utf8"));
    const entry = cgss.tournaments.find(t => String(t.ccode) === PS.ccode && String(t.tcode) === scraped.tcode);
    if (entry && entry.drawOnly) {
      entry.drawOnly = false;
      writeAtomic(CGSS, cgss);
      console.log(`[wknd] cgss-draws-manual.json: 183/${scraped.tcode} drawOnly=false.`);
    }
  } catch (e) { console.warn(`[wknd] aviso: flip drawOnly 183 falhou: ${e.message}`); }
  return true;
}

/* ══ Main ════════════════════════════════════════════════════════════════ */
(async () => {
  let updated = 0, attempted = 0;
  if (!ONLY || ONLY === "calheta") { attempted++; if (await jobCalheta()) updated++; }
  if (!ONLY || ONLY === "portosanto") { attempted++; if (await jobPortoSanto()) updated++; }
  if (updated === 0) { console.log("[wknd] Nenhum torneio actualizado (resultados ainda não publicados). exit 2"); process.exit(2); }
  console.log(`[wknd] ✓ ${updated}/${attempted} torneio(s) actualizado(s). Verificar /FPG e commitar public/data/.`);
  process.exit(0);
})().catch(e => { console.error("[wknd] ERRO:", e.message); process.exit(1); });
