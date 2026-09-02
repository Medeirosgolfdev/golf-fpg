#!/usr/bin/env node
/**
 * update-cgss-draw-results.js
 * ═══════════════════════════════════════════════════════════════════════════
 * GENÉRICO: substitui uma entrada DRAW-ONLY com tcode placeholder 9xxxx pelos
 * RESULTADOS REAIS assim que a FPG os publicar. Por omissão CGSS (ccode 007,
 * cgss-draws-manual.json — convenção RALI/90071, Calheta/90072, OM NOS/90073);
 * `--ccode`/`--draws-file` servem outros circuitos com o mesmo padrão (PJA:
 * ccode 192 + pja-draws-manual.json, Torre/90101).
 *
 * Generalização do jobCalheta do update-calheta-portosanto-results.js — é a
 * 3ª vez que o fluxo se repete, por isso passou a script único parameterizado.
 * A metadata (nome/data/campo) e o field do draw vêm da PRÓPRIA entrada no
 * cgss-draws-manual.json (chave 007/{placeholder}) — nada é repetido aqui.
 *
 * Passos:
 *   1. Descoberta do tcode real: TournamentsLST (ClubCode 007 + --search) —
 *      só lista torneios já jogados; fallback: sondagem ClassifLST no range
 *      --probe-from..--probe-to.
 *   2. Verificação de IDENTIDADE por sobreposição de nomes com o field do
 *      draw. ⚠ Limiares altos de propósito (os sócios CGSS repetem-se de
 *      torneio para torneio — um torneio errado de 44 jogadores partilhava 30
 *      nomes com o draw do Calheta Viva): por defeito exige ≥50% dos nomes do
 *      draw presentes E ≥60% do tamanho do field em jogadores.
 *   3. Substitui o stub _drawOnly no pull-torneios{NNN}.json, re-chaveia o
 *      draw no cgss-draws-manual.json (drawOnly=false) e a casca no
 *      fpg-admissions-draws.json (se existir).
 *   4. Reconcilia os fedCodes dos draws com os federated_code oficiais dos
 *      scorecards (reconcile-draw-feds.js).
 *
 * PROTECÇÃO DE DADOS: nunca grava com resposta não-200, corpo "Server Error"
 * ou 0 jogadores com score. Entradas boas nunca são substituídas por vazio.
 *
 * COOKIES: DATAGOLF_SCORING_COOKIES / api/.scoring-datagolf-cookies.json e
 *          FPG_ADMISSIONS_COOKIES / api/.fpg-admissions-cookies.json.
 *          Validar antes: node scripts/test-datagolf-node.js → Result:"OK".
 *
 * USO:
 *   node scripts/update-cgss-draw-results.js --placeholder 90073 --search "OM NOS"
 *   node scripts/update-cgss-draw-results.js --placeholder 90073 --tcode 11055   # forçar
 *   node scripts/update-cgss-draw-results.js --placeholder 90101 --ccode 192  *        --draws-file pja-draws-manual.json --pull 000 --adopt-name --search "PJA"  *        --probe-from 10024 --probe-to 10040
 *      (o clube 192 vai em 10023 a 2026-09-02 — daí o range; o default 11051+
 *       é o do CGSS e não serve aqui)
 *   ... [--pull 001] [--probe-from 11051] [--probe-to 11090] [--min-rounds 2]
 *   ... [--min-overlap N] [--min-players N] [--dry-run]
 *
 * EXIT CODES: 0 = actualizado · 2 = ainda sem resultados publicados · 1 = erro.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { loadCookieHeader } = require("./lib/cookies");
const { Sessao, criarSessaoLista } = require("./lib/fpg-session");
const { lisbonCivilDayStr } = require("../lib/helpers.js");

const REPO = path.resolve(__dirname, "..");
const ADM = path.join(REPO, "public", "data", "fpg-admissions-draws.json");

const args = process.argv.slice(2);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes("--dry-run");
const PLACEHOLDER = String(argVal("--placeholder") || "");
if (!/^9\d{4}$/.test(PLACEHOLDER)) {
  console.error("uso: node scripts/update-cgss-draw-results.js --placeholder 9xxxx [--search STR] [--tcode N]");
  console.error("     [--ccode NNN] [--draws-file X.json] [--pull NNN] [--adopt-name] [--dry-run]");
  process.exit(1);
}
/* ⚠ Por omissão CGSS (007 + cgss-draws-manual.json) — o fluxo para que nasceu.
 * `--ccode`/`--draws-file` servem os outros circuitos que também vivem de draws
 * curados com tcode placeholder (PJA: 192 + pja-draws-manual.json). */
const CCODE = String(argVal("--ccode") || "007");
const CGSS = path.join(REPO, "public", "data", argVal("--draws-file") || "cgss-draws-manual.json");
/* Nome: por omissão manda o do draw curado (no CGSS a FPG publica "Torneio
 * NNNNN"); `--adopt-name` prefere o nome oficial quando a TournamentsLST o dá. */
const ADOPT_NAME = args.includes("--adopt-name");
/* Provas a 2 voltas: promover no fim do 1.º dia deixaria o torneio congelado
 * com uma ronda só (deixa de ser placeholder, logo o auto-descobridor nunca
 * mais lhe pega). `--min-rounds 2` faz o sábado sair 2 (= "ainda não") e a
 * promoção acontecer no domingo, com as duas voltas. */
const MIN_ROUNDS = parseInt(argVal("--min-rounds") || "1", 10);
const PULL = path.join(REPO, "public", "data", `pull-torneios${argVal("--pull") || "001"}.json`);
const SEARCH = argVal("--search") || "";
const PROBE_FROM = parseInt(argVal("--probe-from") || "11051", 10);
const PROBE_TO = parseInt(argVal("--probe-to") || "11090", 10);

/* ── entrada do draw (metadata + field) ─────────────────────────────────── */
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const cgssFile = JSON.parse(fs.readFileSync(CGSS, "utf8"));
const drawEntry = cgssFile.tournaments.find(t => String(t.ccode) === CCODE && String(t.tcode) === PLACEHOLDER);
if (!drawEntry) { console.error(`[cgss] ERRO: sem entrada ${CCODE}/${PLACEHOLDER} em ${path.basename(CGSS)}.`); process.exit(1); }
const META = { name: drawEntry.name, date: drawEntry.date, campo: drawEntry.campo };
/** tcode → nome oficial, preenchido pela TournamentsLST (usado com --adopt-name). */
const OFFICIAL_NAME = new Map();
const drawNames = new Set();
for (const r of Object.values(drawEntry.draws || {}))
  for (const g of r.groups || []) for (const p of g.players || []) drawNames.add(norm(p.nome));
const MIN_OVERLAP = parseInt(argVal("--min-overlap") || String(Math.ceil(drawNames.size * 0.5)), 10);
const MIN_PLAYERS = parseInt(argVal("--min-players") || String(Math.ceil(drawNames.size * 0.6)), 10);
const candidatesArg = argVal("--tcode");
let candidates = candidatesArg
  ? [String(candidatesArg)]
  : Array.from({ length: PROBE_TO - PROBE_FROM + 1 }, (_, i) => String(PROBE_FROM + i));

console.log(`[cgss] "${META.name}" (${META.date}) · placeholder ${CCODE}/${PLACEHOLDER} · field ${drawNames.size}`);
console.log(`[cgss] identidade: ≥${MIN_OVERLAP} nomes do draw e ≥${MIN_PLAYERS} jogadores.`);

/* ── HTTP (idêntico aos irmãos update-rali / update-calheta-portosanto) ── */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const ACK_CLASSIF = "8428ACK987";
const PAGE_SIZE = 150;
const RETRY_WAITS = [2000, 5000, 10000];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* `FPG_AUTH_MODE=publico` nem chega a ler os ficheiros de cookies (senão o log
 * anunciava credenciais que não vai usar). */
const MODO_AUTH = String(process.env.FPG_AUTH_MODE || "auto").toLowerCase();
const SO_PUBLICO = MODO_AUTH === "publico";
const cookieDG = SO_PUBLICO ? null : loadCookieHeader({
  envVars: ["DATAGOLF_SCORING_COOKIES", "DATAGOLF_COOKIES"],
  file: path.join(REPO, "api", ".scoring-datagolf-cookies.json"),
  label: "[cgss/datagolf]", exitOnFail: false,
});
const cookieFPG = SO_PUBLICO ? null : loadCookieHeader({
  envVars: ["FPG_ADMISSIONS_COOKIES"],
  file: path.join(REPO, "api", ".fpg-admissions-cookies.json"),
  label: "[cgss/fpg]", exitOnFail: false,
});
/* ⚠ AS COOKIES NÃO SÃO PRECISAS PARA LER RESULTADOS (2026-08-30). O gateway
 * `scoring.fpg.pt/lists/linkpage.aspx` emite sessão a quem chega sem
 * credenciais, e a `1PreparePage.aspx` faz o mesmo para a TournamentsLST —
 * ver scripts/lib/fpg-session.js. Como as cookies duram ~9h e morrem sempre a
 * meio da janela de scrapes, o canal PÚBLICO vai à frente e as cookies ficam
 * como fallback. `FPG_AUTH_MODE=cookies` inverte, `=publico` só usa o público. */
const HOST_PUBLICO = { id: "público (sem cookies)", publico: true, cookie: null, hasTournLST: true };
const HOST_DG = { id: "scoring.datagolf.pt", base: "https://scoring.datagolf.pt/pt", origin: "https://scoring.datagolf.pt", cookie: cookieDG, hasTournLST: true };
const HOST_FPG = { id: "scoring.fpg.pt", base: "https://scoring.fpg.pt/lists", origin: "https://scoring.fpg.pt", cookie: cookieFPG, hasTournLST: false };
const HOSTS = MODO_AUTH === "publico" ? [HOST_PUBLICO]
  : MODO_AUTH === "cookies" ? [HOST_DG, HOST_FPG, HOST_PUBLICO]
  : [HOST_PUBLICO, HOST_DG, HOST_FPG];
console.log(`[cgss] canais: ${HOSTS.map(h => h.id + (h.publico ? "" : h.cookie ? " (cookies)" : " (sem cookies)")).join(" → ")}`);

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
  console.error(`[cgss] ✗ ${host.id} · ${label}: HTTP ${status}${extra ? ` (${extra})` : ""} · ${bytes} bytes · tipo: ${classifyBody(text)}`);
  console.error(`[cgss]   corpo[0..300]: ${head}`);
}

/* ── canal público: sessão emitida pelo próprio gateway ──────────────────── */
const sessoesPub = new Map();   // "ccode/tcode" → Sessao | null
let sessaoLista;                // TournamentsLST (entra pela 1PreparePage)

async function sessaoPublica(pathname, body) {
  if (pathname.startsWith("tournaments.aspx")) {
    if (sessaoLista === undefined) sessaoLista = await criarSessaoLista().catch(() => null);
    return sessaoLista;
  }
  const k = `${CCODE}/${body.tcode}`;
  if (!sessoesPub.has(k)) {
    const s = new Sessao();
    const a = await s.abrir("classif", CCODE, body.tcode).catch(() => null);
    sessoesPub.set(k, a && a.ok ? s : null);
  }
  return sessoesPub.get(k);
}

async function postPublico(pathname, qs, body, label, { quiet } = {}) {
  let sess;
  try { sess = await sessaoPublica(pathname, body); }
  catch (e) { sess = null; if (!quiet) console.error(`[cgss] ✗ público · ${label}: sessão falhou: ${e.message}`); }
  if (!sess) return { ok: false, status: 0, error: "sem sessão pública" };
  try {
    const r = await sess.postPageMethod(pathname, body, { queryString: qs });
    if (!r.ok) {
      if (!quiet) console.error(`[cgss] ✗ público · ${label}: HTTP ${r.status} · Result=${r.result || "?"}`);
      return { ok: false, status: r.status, error: `Result=${r.result || "?"}` };
    }
    return { ok: true, status: 200, records: r.records || [], total: r.total ?? 0 };
  } catch (e) {
    if (!quiet) console.error(`[cgss] ✗ público · ${label}: rede falhou: ${e.message}`);
    return { ok: false, status: 0, error: `network: ${e.message}` };
  }
}

async function postJson(host, pathname, qs, body, label, { quiet } = {}) {
  if (host.publico) return postPublico(pathname, qs, body, label, { quiet });
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
      if (!quiet) console.error(`[cgss] ✗ ${host.id} · ${label}: rede falhou: ${msg}`);
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

async function warmup(host, tcode) {
  // No canal público o warmup é o próprio `Sessao.abrir` (segue os redirects à
  // mão e guarda a sessão emitida no caminho) — feito em `sessaoPublica`.
  if (host.publico) return true;
  const url = `${host.base}/linkpage.aspx?page=classif&club=${CCODE}&tourn=${tcode}&ack=${ACK_CLASSIF}`;
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

async function fetchClassif(host, tcode, round, { quiet } = {}) {
  const all = [];
  let startIndex = 0;
  while (true) {
    const body = {
      Classi: "1", tclub: CCODE, tcode: tcode,
      classiforder: "1", classiftype: "I", classifroundtype: "D",
      scoringtype: "1", round: String(round || 1),
      members: "0", playertypes: "0", gender: "0",
      minagemen: "0", maxagemen: "999", minageladies: "0", maxageladies: "999",
      minhcp: "-8", maxhcp: "99", idfilter: "-1",
      jtStartIndex: String(startIndex), jtPageSize: String(PAGE_SIZE), jtSorting: "score_id DESC",
    };
    const qs = `jtStartIndex=${startIndex}&jtPageSize=${PAGE_SIZE}&jtSorting=${encodeURIComponent("score_id DESC")}`;
    const r = await postJson(host, "classif.aspx/ClassifLST", qs, body, `classif ${CCODE}/${tcode} R${round || 1}`, { quiet });
    if (!r.ok) return { ok: false, records: all, error: r.error };
    all.push(...r.records);
    if (r.records.length < PAGE_SIZE) break;
    startIndex += PAGE_SIZE;
    await sleep(150);
  }
  return { ok: true, records: all };
}

async function fetchScorecard(host, tcode, scoreId, round) {
  const qs = `score_id=${scoreId}&tclub=${CCODE}&tcode=${tcode}&scoringtype=1&classiftype=I&classifround=${round}`;
  const body = { score_id: String(scoreId), tclub: CCODE, tcode: tcode, scoringtype: "1", classiftype: "I", classifround: String(round) };
  const r = await postJson(host, "classif.aspx/ScoreCard", qs, body, `scorecard ${scoreId}`);
  return (r.ok && r.records?.length > 0) ? r.records[0] : null;
}
async function fetchScorecardAggregate(host, tcode, scoreId) {
  const qs = `score_id=${scoreId}&tclub=${CCODE}&tcode=${tcode}&scoringtype=1&classiftype=I&classifround=`;
  const body = { score_id: String(scoreId), tclub: CCODE, tcode: tcode, scoringtype: "1", classiftype: "I", classifround: "" };
  const r = await postJson(host, "classifAgregate.aspx/ScoreCard", qs, body, `scorecard-agg ${scoreId}`);
  return (r.ok && r.records?.length > 0) ? r.records : null;
}

/* ⚠ ClubCode:"007" dá ERRO neste endpoint (memória cgss-draw-only-tournament)
 * — pede-se a lista geral (ClubCode:"0", sem TournName: o nome oficial pode
 * não bater com o do PDF do draw) ordenada por data desc, paginada até já só
 * vir coisa anterior à data do torneio, e filtra-se client-side por club_code.
 * Como raramente há mais do que um torneio CGSS por dia, clube+data chegam
 * para ordenar candidatos; a IDENTIDADE é sempre confirmada pela sobreposição
 * de nomes com o field do draw (há dias com principal + júnior 9B). */
async function tournLstRecent(host) {
  const out = [];
  for (let start = 0; start < 200; start += 50) {
    const body = {
      ClubCode: "0", dtIni: "", dtFim: "", CourseName: "", TournCode: "", TournName: "",
      jtStartIndex: String(start), jtPageSize: "50", jtSorting: "started_at DESC",
    };
    const qs = `jtStartIndex=${start}&jtPageSize=50&jtSorting=${encodeURIComponent("started_at DESC")}`;
    const r = await postJson(host, "tournaments.aspx/TournamentsLST", qs, body, `tournlst pág.${start / 50 + 1}`, { quiet: true });
    if (!r.ok) break;
    const recs = r.records.map((raw) => ({
      name: raw.description || "",
      ccode: raw.club_code || "",
      tcode: String(raw.code || ""),
      date: lisbonCivilDayStr(parseInt((raw.started_at || "").match(/\d+/)?.[0] || "0")),
    }));
    out.push(...recs);
    if (recs.length < 50) break;
    if (recs.every((x) => x.date < META.date)) break;
    await sleep(150);
  }
  return out;
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
const playerHasScore = (p) => typeof p.grossTotal === "number" && p.grossTotal > 0 && p.grossTotal < 900;
const anyResults = (players) => Array.isArray(players) && players.some(playerHasScore);
const overlap = (players) => players.reduce((s, p) => s + (drawNames.has(norm(p.name)) ? 1 : 0), 0);

async function scrapeTournament(host, tcode) {
  await warmup(host, tcode);
  await sleep(150);
  const c1 = await fetchClassif(host, tcode, 1);
  if (!c1.ok) return { ok: false, reason: c1.error };
  if (c1.records.length === 0) return { ok: true, empty: true };

  const players = c1.records.map(mapPlayer);
  let nRounds = 1;
  await sleep(150);
  const c2 = await fetchClassif(host, tcode, 2, { quiet: true });
  if (c2.ok && c2.records.length > 0) nRounds = 2;

  console.log(`[cgss]   ${host.id}: ${CCODE}/${tcode} → ${players.length} jogadores${nRounds > 1 ? ` (${nRounds}R)` : ""} — scorecards…`);
  let scOk = 0, scFail = 0;
  for (const p of players) {
    if (["NS", "DQ", "WD"].includes(p.pos) || !p.scoreId || p.scoreId === "0") continue;
    if (nRounds > 1) {
      const recs = await fetchScorecardAggregate(host, tcode, p.scoreId);
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
      const sc = await fetchScorecard(host, tcode, p.scoreId, 1);
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
  console.log(`[cgss]   ${host.id}: scorecards ${scOk} ok, ${scFail} falhas.`);

  const courseCount = {};
  for (const p of players) if (p.course) courseCount[p.course] = (courseCount[p.course] || 0) + 1;
  const campo = Object.keys(courseCount).sort((a, b) => courseCount[b] - courseCount[a])[0] || META.campo || "";

  return {
    ok: true,
    tournament: {
      name: (ADOPT_NAME && OFFICIAL_NAME.get(String(tcode))) || META.name, ccode: CCODE, tcode,
      date: META.date || "", campo,
      rounds: nRounds, playerCount: players.length, players,
    },
  };
}

function writeAtomic(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

/* ══ Main ════════════════════════════════════════════════════════════════ */
(async () => {
  // 1) descoberta primária: TournamentsLST (só lista torneios já jogados).
  //    Match por CLUBE (007) + DATA — nunca pelo nome, que no oficial pode
  //    diferir do PDF do draw. --search fica só como dica de ordenação quando
  //    o mesmo dia tem mais do que um torneio do clube.
  const dgHost = HOSTS.find(h => h.hasTournLST && (h.cookie || h.publico));
  if (dgHost && candidates.length > 1) {
    const recs = await tournLstRecent(dgHost);
    const hits = recs.filter(r => r.ccode === CCODE && r.date >= META.date);
    hits.sort((a, b) =>
      (a.date === META.date ? 0 : 1) - (b.date === META.date ? 0 : 1) ||
      (SEARCH && norm(b.name).includes(norm(SEARCH)) ? 1 : 0) - (SEARCH && norm(a.name).includes(norm(SEARCH)) ? 1 : 0));
    if (hits.length) {
      for (const h of hits) {
        console.log(`[cgss] TournamentsLST candidato: ${h.ccode}/${h.tcode} "${h.name}" (${h.date})`);
        if (h.name) OFFICIAL_NAME.set(String(h.tcode), h.name);
      }
      const hitTcodes = hits.map(h => h.tcode);
      candidates = [...hitTcodes, ...candidates.filter(t => !hitTcodes.includes(t))];
    } else {
      console.log(`[cgss] TournamentsLST: nenhum torneio ${CCODE} com data ≥ ${META.date} (normal se ainda não publicado) — sondagem directa.`);
    }
  }

  // 2) scrape + verificação de identidade (sondagem barata primeiro)
  let scraped = null;
  outer: for (const host of HOSTS) {
    // Um canal que já leu classificações é um canal VIVO: se nenhum candidato
    // bateu nele, repetir a varredura toda nos canais seguintes só martelava a
    // FPG (32 tcodes × 3 canais) para dar o mesmo "ainda não". Só se passa ao
    // canal seguinte quando este não conseguiu ler nada.
    let vivo = false;
    for (const tcode of candidates) {
      await warmup(host, tcode);
      await sleep(100);
      const probe = await fetchClassif(host, tcode, 1, { quiet: true });
      if (!probe.ok || probe.records.length === 0) { await sleep(150); continue; }
      vivo = true;
      const names = probe.records.map(mapPlayer);
      if (!anyResults(names)) { await sleep(150); continue; }
      const ov = overlap(names);
      if (drawNames.size > 0 && (ov < MIN_OVERLAP || names.length < MIN_PLAYERS)) {
        console.log(`[cgss]   ${CCODE}/${tcode}: ${names.length} jogadores, ${ov} do field — NÃO é este torneio, ignorado.`);
        await sleep(150);
        continue;
      }
      console.log(`[cgss] ✓ tcode real identificado: ${CCODE}/${tcode} (${ov}/${drawNames.size} nomes do draw presentes)`);
      const full = await scrapeTournament(host, tcode);
      if (full.ok && full.tournament && anyResults(full.tournament.players)) { scraped = full.tournament; break outer; }
    }
    if (vivo) { console.log(`[cgss] ${host.id}: canal vivo, nenhum candidato bate com o draw — não repito nos outros canais.`); break; }
  }

  if (!scraped) {
    console.log(`[cgss] Sem classificação publicada — ficheiros intactos. (exit 2)`);
    process.exit(2);
  }
  if ((scraped.rounds || 1) < MIN_ROUNDS) {
    console.log(`[cgss] ${CCODE}/${scraped.tcode}: só ${scraped.rounds || 1} de ${MIN_ROUNDS} rondas publicadas — ficheiros intactos, volto mais tarde. (exit 2)`);
    process.exit(2);
  }
  const nWith = scraped.players.filter(playerHasScore).length;
  console.log(`[cgss] ✓ "${META.name}": ${scraped.players.length} jogadores (${nWith} com gross) · tcode real ${scraped.tcode}.`);
  if (DRY) { console.log("[cgss] --dry-run: nada gravado."); process.exit(0); }

  // 3) pull-torneios{NNN}: remove placeholder + dup, insere real
  const pull = JSON.parse(fs.readFileSync(PULL, "utf8"));
  pull.tournaments = pull.tournaments.filter(t =>
    !(String(t.ccode) === CCODE && (String(t.tcode) === PLACEHOLDER || String(t.tcode) === scraped.tcode)));
  pull.tournaments.push(scraped);
  if (typeof pull.totalTournaments === "number") pull.totalTournaments = pull.tournaments.length;
  writeAtomic(PULL, pull);
  console.log(`[cgss] ${path.basename(PULL)}: placeholder ${PLACEHOLDER} → real ${scraped.tcode}.`);

  // 4) re-chavear o draw (drawOnly=false — a tab Draw fica ao lado dos resultados)
  try {
    cgssFile.tournaments = cgssFile.tournaments.filter(t => !(String(t.ccode) === CCODE && String(t.tcode) === scraped.tcode));
    drawEntry.tcode = scraped.tcode;
    drawEntry.drawOnly = false;
    cgssFile.total = cgssFile.tournaments.length;
    writeAtomic(CGSS, cgssFile);
    console.log(`[cgss] ${path.basename(CGSS)}: draw re-chaveado ${PLACEHOLDER} → ${scraped.tcode}.`);
  } catch (e) { console.warn(`[cgss] aviso: re-chavear ${path.basename(CGSS)} falhou: ${e.message}`); }

  // 5) re-chavear casca admissions (se existir)
  try {
    const adm = JSON.parse(fs.readFileSync(ADM, "utf8"));
    const entry = (adm.tournaments || []).find(t => String(t.ccode) === CCODE && String(t.tcode) === PLACEHOLDER);
    if (entry) {
      adm.tournaments = adm.tournaments.filter(t => !(String(t.ccode) === CCODE && String(t.tcode) === scraped.tcode));
      entry.tcode = scraped.tcode;
      if (typeof adm.total === "number") adm.total = adm.tournaments.length;
      writeAtomic(ADM, adm);
      console.log(`[cgss] fpg-admissions-draws.json: casca re-chaveada → ${scraped.tcode}.`);
    }
  } catch (e) { console.warn(`[cgss] aviso: re-chavear admissions falhou: ${e.message}`); }

  // 6) reconciliar fedCodes dos draws com os federated_code dos scorecards
  try {
    const { reconcileDrawFeds } = require("./reconcile-draw-feds");
    console.log("[cgss] a reconciliar fedCodes dos draws com os resultados…");
    reconcileDrawFeds({});
  } catch (e) { console.warn(`[cgss] aviso: reconciliação de feds falhou: ${e.message}`); }

  console.log("[cgss] ✓ Concluído. Verificar em /FPG e commitar public/data/.");
  process.exit(0);
})().catch(e => { console.error("[cgss] ERRO:", e.message); process.exit(1); });
