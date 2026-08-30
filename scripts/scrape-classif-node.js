#!/usr/bin/env node
/**
 * scripts/scrape-classif-node.js (2026-04-22)
 * ═════════════════════════════════════════════════════════════════════════
 * Substitui pull-torneios.js (browser console F12 em scoring.datagolf.pt).
 *
 * Pipeline em Node puro (sem Playwright, sem browser):
 *   1. GET linkpage.aspx?page=classif (warmup de sessão ASP.NET)
 *   2. POST classif.aspx/ClassifLST  (classificação paginada)
 *   3. POST classifAgregate.aspx/ScoreCard ou classif.aspx/ScoreCard por jogador
 *      (scorecard hole-by-hole)
 *
 * Cookies usadas: scoring.datagolf.pt (capturadas por refresh-all-cookies.js).
 *
 * SCOPE: argumentos CLI --tclub / --tcode ou --scope <ficheiro.json>.
 * Compatível com formato POR_CODIGO do antigo pull-torneios.js:
 *   [ { "tclub": "000", "tcode": "10825" }, ... ]
 *
 * OUTPUT: --out <path> (default: public/data/pull-torneios-node.json)
 *   Formato idêntico ao pull-torneiosNNN.json:
 *   { lastUpdated, source, totalTournaments, totalPlayers, totalScorecards,
 *     tournaments: [ { ccode, tcode, name, date, campo, circuit, series,
 *                      region, escalao, num, rounds, playerCount, players } ] }
 *
 * USAGE:
 *   node scripts/scrape-classif-node.js --tclub 000 --tcode 10825
 *   node scripts/scrape-classif-node.js --scope scripts/classif-batch.json --out public/data/pull-torneios002.json
 *   node scripts/scrape-classif-node.js --tclub 982 --tcode 10223 --concurrency 2
 *
 * EXIT CODES:
 *   0 — sucesso (qualquer quantidade de dados)
 *   1 — erro fatal
 *   2 — sem novidades (novo output == anterior)
 * ═════════════════════════════════════════════════════════════════════════
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");

/* ── CLI ────────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
function argVal(flag, def) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; }

const CLI_TCLUB = argVal("--tclub", null);
const CLI_TCODE = argVal("--tcode", null);
const CLI_TCODES = argVal("--tcodes", null);
const SCOPE_FILE = argVal("--scope", null);
const AUTO_FROM_TRACKING = args.includes("--auto-from-tracking");
// Default: pull-torneios002.json (próximo número livre depois do 001.json).
// A FPGPage lê automaticamente pull-torneios000, 001, 002, ... até 404. Para
// os torneios novos ficarem visíveis na UI, têm de acabar num destes ficheiros.
// O script faz merge aditivo (preserva torneios antigos, actualiza/adiciona).
const OUT_FILE = argVal("--out", path.join(REPO, "public", "data", "pull-torneios002.json"));
const CONCURRENCY = parseInt(argVal("--concurrency", "2"), 10);
const DELAY_MS = parseInt(argVal("--delay", "150"), 10);
const PAGE_SIZE = parseInt(argVal("--page-size", "150"), 10);

/* ── Cookies (scoring.datagolf.pt) ──────────────────────────────────────── */
const { loadCookieHeader } = require("./lib/cookies");
const { lisbonCivilDayStr } = require("../lib/helpers");
// ⚠ Opcional desde 2026-08-30: o caminho sem cookies (ver o fallback no
// warmupLinkpage) cobre leaderboard + scorecards de um torneio conhecido, por
// isso a falta de cookies já não é motivo para abortar.
const COOKIE = loadCookieHeader({
  exitOnFail: false,
  envVars: ["DATAGOLF_SCORING_COOKIES", "DATAGOLF_COOKIES"],
  file: path.join(REPO, "api", ".scoring-datagolf-cookies.json"),
  label: "[classif]",
});

/* ── Scope ──────────────────────────────────────────────────────────────── */
let scope = [];
if (AUTO_FROM_TRACKING) {
  // Lê public/data/fpg-tournaments-tracking.json e filtra torneios que
  // precisam de classif/scorecards (status "missing_classif",
  // "missing_scorecards") OU que estão a decorrer ("in_progress") — para
  // apanhar resultados parciais no próprio dia/fim-de-semana do torneio.
  // Só "future" (ainda não começou) fica de fora. O merge é aditivo e
  // preserva dados antigos contra respostas vazias, por isso scrapar um
  // torneio a meio é seguro (não apaga nada).
  const trackingFile = path.join(REPO, "public", "data", "fpg-tournaments-tracking.json");
  if (!fs.existsSync(trackingFile)) {
    console.error(`[classif] ERRO: tracking em falta: ${trackingFile}. Corre build-tournaments-tracking.js primeiro.`);
    process.exit(1);
  }
  const tracking = JSON.parse(fs.readFileSync(trackingFile, "utf8"));
  const wanted = new Set(["missing_classif", "missing_scorecards", "in_progress"]);
  scope = (tracking.tournaments || [])
    .filter(t => wanted.has(t.status))
    .map(t => ({
      tclub: String(t.ccode).padStart(3, "0"),
      tcode: String(t.tcode),
      // Metadata do tracking — usada como fallback se TournamentsLST não
      // devolver o torneio (ex: torneio arquivado). Evita "NÃO ENCONTRADO".
      name: t.name,
      date: t.date,
      rounds: t.rounds,
    }));
  console.log(`[classif] Scope auto-from-tracking: ${scope.length} torneios (missing_classif/scorecards/in_progress)`);
  if (scope.length === 0) {
    console.log("[classif] ✓ Nada a processar — todos os torneios elegíveis já têm classif+scorecards");
    process.exit(2);
  }
} else if (SCOPE_FILE) {
  const fp = path.isAbsolute(SCOPE_FILE) ? SCOPE_FILE : path.join(REPO, SCOPE_FILE);
  if (!fs.existsSync(fp)) { console.error(`[classif] ERRO: scope não existe: ${fp}`); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
  scope = Array.isArray(raw) ? raw : (raw.torneios || raw.tournaments || []);
  console.log(`[classif] Scope de ${fp}: ${scope.length} torneios`);
} else if (CLI_TCODES) {
  const tclub = CLI_TCLUB || "000";
  scope = CLI_TCODES.split(",").map(t => t.trim()).filter(Boolean).map(tcode => ({ tclub, tcode }));
  console.log(`[classif] Batch tcodes: tclub=${tclub} | ${scope.length} torneios`);
} else if (CLI_TCLUB && CLI_TCODE) {
  scope = [{ tclub: CLI_TCLUB, tcode: CLI_TCODE }];
  console.log(`[classif] Single: tclub=${CLI_TCLUB} tcode=${CLI_TCODE}`);
} else {
  console.error("[classif] ERRO: usa --auto-from-tracking, --scope <ficheiro.json>, --tcodes A,B,C ou --tclub X --tcode Y");
  process.exit(1);
}

// --limit N: processar só os primeiros N do scope (que pode vir já ordenado
// por prioridade, ex: recent-tournaments-scrape-scope.json por nº de nossos
// desc). Capa o tempo por run em automação — o merge é aditivo, por isso runs
// seguintes continuam a drenar o scope à medida que ele encolhe.
const LIMIT = parseInt(argVal("--limit", "0"), 10);
if (LIMIT > 0 && scope.length > LIMIT) {
  console.log(`[classif] --limit ${LIMIT}: a processar os primeiros ${LIMIT} de ${scope.length}`);
  scope = scope.slice(0, LIMIT);
}

/* ── HTTP helpers ───────────────────────────────────────────────────────── */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BASE = "https://scoring.datagolf.pt/pt";
const ACK_CLASSIF = "8428ACK987";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Fallback público: sessão auto-gerada ────────────────────────────────
   O gateway `scoring.fpg.pt/lists/linkpage.aspx` (ack universal) emite ele
   próprio um ASP.NET_SessionId + DG_Lists_URL a quem chega SEM credenciais, e
   com essa sessão os PageMethods respondem Result:OK — leaderboard e scorecard
   buraco-a-buraco incluídos. Medido a 2026-08-30, no dia em que o caminho
   habitual (scoring.datagolf.pt/pt + cookies gravadas) dava 500 em tudo: os
   cookies tinham 7 horas e o browser da utilizadora abria o mesmo URL sem
   problema — porque um browser aceita o Set-Cookie e nós não.
   Ver scripts/lib/fpg-session.js. */
const { Sessao, parseMetaClassif, criarSessaoLista } = require("./lib/fpg-session");
let SESSAO = null;        // != null → estamos no caminho sem cookies
let SESSAO_META = null;   // nome/campo/data lidos da própria página
let SESSAO_LISTA;         // undefined = por tentar · null = indisponível

async function warmupLinkpage(tclub, tcode) {
  // Activa sessão ASP.NET antes de POSTs a PageMethods
  const url = `${BASE}/linkpage.aspx?page=classif&club=${tclub}&tourn=${tcode}&ack=${ACK_CLASSIF}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9",
        ...(COOKIE ? { "Cookie": COOKIE } : {}),
        "Referer": `${BASE}/`,
      },
      redirect: "follow",
    });
    const html = await res.text();
    // ⚠ HTTP 200 NÃO é prova de sessão útil. Sem cookies válidas este linkpage
    // devolve 200 na mesma (medido 2026-08-30) e só o PageMethod a seguir é
    // que rebenta — o warmup dava-se por bom e o fallback nunca corria.
    // O teste é o CONTEÚDO: a página real traz Torneio/Campo/Data.
    if (res.ok && parseMetaClassif(html).name) { SESSAO = null; SESSAO_META = null; return true; }
  } catch { /* cai no fallback */ }

  // Caminho habitual em baixo (ou cookies mortas) → sessão auto-gerada.
  try {
    const sess = new Sessao();
    const abriu = await sess.abrir("classif", tclub, tcode);
    if (abriu.ok) {
      SESSAO = sess;
      SESSAO_META = parseMetaClassif(abriu.html);
      console.log(`[classif] sem cookies: sessão auto-gerada em scoring.fpg.pt/lists` +
                  (SESSAO_META && SESSAO_META.name ? ` — ${SESSAO_META.name}` : ""));
      return true;
    }
  } catch { /* nada a fazer */ }
  SESSAO = null;
  return false;
}

async function postPageMethod(pathname, qs, body) {
  if (SESSAO) {
    // ⚠ os params extra vão na query string E no body — o servidor rejeita
    // (500) se só forem num dos sítios.
    const r = await SESSAO.postPageMethod(pathname, body, { queryString: qs });
    return { ok: r.ok, status: r.status, result: r.result, records: r.records, total: r.total ?? 0 };
  }
  const url = `${BASE}/${pathname}${qs ? "?" + qs : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Origin": "https://scoring.datagolf.pt",
      "Referer": `${BASE}/Classifications.aspx`,
      "Cookie": COOKIE,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  let json;
  try { json = await res.json(); } catch (e) { return { ok: false, error: "bad-json" }; }
  const d = json.d || json;
  return { ok: d.Result === "OK", result: d.Result, records: d.Records || [], total: d.TotalRecordCount ?? 0 };
}

/* ── Tournament discovery (resolve name/date/etc) ──────────────────────── */
async function resolveTournament(tclub, tcode) {
  const body = {
    ClubCode: String(tclub),
    dtIni: "", dtFim: "",
    CourseName: "",
    TournCode: String(tcode),
    TournName: "",
    jtStartIndex: "0", jtPageSize: "25", jtSorting: "started_at DESC",
  };
  const qs = "jtStartIndex=0&jtPageSize=25&jtSorting=" + encodeURIComponent("started_at DESC");
  // Sem cookies o TournamentsLST tem entrada própria (ver criarSessaoLista):
  // uma sessão SEPARADA da do classif, porque o DG_Lists_URL guarda o contexto
  // da página e as duas pisavam-se.
  let r;
  if (SESSAO) {
    if (SESSAO_LISTA === undefined) {
      SESSAO_LISTA = await criarSessaoLista().catch(() => null);
      if (SESSAO_LISTA) console.log("[classif] sem cookies: lista de torneios também");
    }
    if (!SESSAO_LISTA) return null;
    const x = await SESSAO_LISTA.postPageMethod("tournaments.aspx/TournamentsLST", body, { queryString: qs });
    r = { ok: x.ok, records: x.records };
  } else {
    r = await postPageMethod("tournaments.aspx/TournamentsLST", qs, body);
  }
  if (!r.ok) return null;
  return r.records.find(rec =>
    String(rec.code) === String(tcode) && String(rec.club_code) === String(tclub)
  ) || null;
}

/* ── Classif list (paginated) ───────────────────────────────────────────── */
// roundType: "D" = classificação por DIA (posições de UMA ronda);
//            "A" = AGREGADA/acumulada (posições do total até à ronda `round`).
// ⚠ Em multi-ronda TEM de ser "A" para o `pos` bater com o gross acumulado —
// a "D"/round=1 dá as posições só do 1º dia (ficavam presas à R1).
async function fetchClassif(tclub, tcode, round, roundType) {
  const allRecords = [];
  let startIndex = 0;
  while (true) {
    const body = {
      Classi: "1",
      tclub: String(tclub), tcode: String(tcode),
      classiforder: "1", classiftype: "I", classifroundtype: roundType || "D",
      scoringtype: "1", round: String(round || 1),
      members: "0", playertypes: "0", gender: "0",
      minagemen: "0", maxagemen: "999",
      minageladies: "0", maxageladies: "999",
      minhcp: "-8", maxhcp: "99",
      idfilter: "-1",
      jtStartIndex: String(startIndex),
      jtPageSize: String(PAGE_SIZE),
      jtSorting: "score_id DESC",
    };
    const qs = "jtStartIndex=" + startIndex + "&jtPageSize=" + PAGE_SIZE + "&jtSorting=" + encodeURIComponent("score_id DESC");
    const r = await postPageMethod("classif.aspx/ClassifLST", qs, body);
    if (!r.ok) return { records: allRecords, error: r.error || `Result=${r.result}` };
    allRecords.push(...r.records);
    if (r.records.length < PAGE_SIZE) break;
    startIndex += PAGE_SIZE;
    await sleep(DELAY_MS);
  }
  return { records: allRecords, error: null };
}

/** Par do campo, tirado de qualquer jogador da prova que o traga.
 *  O par nao varia entre jogadores — so falta em quem nao e federado FPG. */
function parDoTorneio(t) {
  for (const p of (t.players || [])) if (typeof p.parTotal === "number") return p.parTotal;
  return null;
}

/* ── Scorecards ─────────────────────────────────────────────────────────── */
async function fetchScorecard(scoreId, tclub, tcode, round) {
  const qs = `score_id=${scoreId}&tclub=${tclub}&tcode=${tcode}&scoringtype=1&classiftype=I&classifround=${round}`;
  const body = {
    score_id: String(scoreId), tclub: String(tclub), tcode: String(tcode),
    scoringtype: "1", classiftype: "I", classifround: String(round),
  };
  const r = await postPageMethod("classif.aspx/ScoreCard", qs, body);
  return (r.ok && r.records?.length > 0) ? r.records[0] : null;
}

async function fetchScorecardAggregate(scoreId, tclub, tcode) {
  const qs = `score_id=${scoreId}&tclub=${tclub}&tcode=${tcode}&scoringtype=1&classiftype=I&classifround=`;
  const body = {
    score_id: String(scoreId), tclub: String(tclub), tcode: String(tcode),
    scoringtype: "1", classiftype: "I", classifround: "",
  };
  const r = await postPageMethod("classifAgregate.aspx/ScoreCard", qs, body);
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

/** PCC oficial da volta (campo `cba` do ScoreCard, −1..+3). O site usa-o no
 *  SD: (113/slope)×(AGS − CR − PCC). Só emitido quando ≠ 0 para não inchar
 *  os JSON (ausente = 0 no cálculo). */
function extractPcc(rec) {
  const v = rec.cba ?? rec.pcc;
  if (v == null) return {};
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? { pcc: n } : {};
}

/* ── Tournament parser (igual ao pull-torneios.js browser) ──────────────── */
const regionMap = {
  "982": "madeira", "983": "acores", "984": "acores",
  "985": "tejo", "987": "norte", "988": "sul", "000": "nacional",
};
function detectCircuit(raw) {
  if ((raw.acronym || "").startsWith("FPG_D")) return "drive";
  if (/aquapor/i.test(raw.description || "") || /aquapor/i.test(raw.acronym || "")) return "aquapor";
  return "tour";
}
function parseTournament(raw, circuit) {
  const desc = raw.description || "";
  const dateMs = parseInt((raw.started_at || "").match(/\d+/)?.[0] || "0");
  const dateStr = dateMs ? lisbonCivilDayStr(dateMs) : ""; // epoch = meia-noite Lisboa; UTC dava dia -1 no verão
  let series = circuit === "aquapor" ? "aquapor" : "tour";
  if (/challenge/i.test(desc)) series = "challenge";
  const escMatch = desc.match(/Sub\s*(\d+)/i);
  const numMatch = desc.match(/(\d+)º/);
  return {
    name: desc, ccode: raw.club_code || "", tcode: raw.code || "",
    date: dateStr, campo: raw.course_description || "",
    clube: raw.club_code || "", circuit, series,
    region: regionMap[raw.club_code] || "outro",
    escalao: escMatch ? "Sub " + escMatch[1] : null,
    num: numMatch ? parseInt(numMatch[1]) : 1,
    rounds: raw.rounds || 1,
    playerCount: 0, players: [],
  };
}
function mapPlayer(r) {
  const pos = r.classif_pos;
  const grossStr = r.gross_total;
  const toParStr = r.to_par_total;
  const isNS = pos === "NS" || grossStr === "NS" || r.score_status_id === 99;
  let grossNum = null;
  if (grossStr && !["NS","NR","DQ"].includes(grossStr)) {
    grossNum = parseInt(grossStr);
    if (isNaN(grossNum)) grossNum = null;
  }
  let toParNum = null;
  if (toParStr && !["NS","NR","DQ","PAR"].includes(toParStr)) {
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
    hcpPlay:  r.play_hcp  != null ? Number(r.play_hcp)  : undefined,
    fedCode: null, courseRating: null, slope: null,
    teeName: null, teeColorId: null, parTotal: null, nholes: null, course: null,
    roundScores: [],
  };
}

/* ── Process um torneio (resolve → classif → scorecards) ────────────────── */
async function processOne(spec, idx, total) {
  const { tclub, tcode } = spec;
  const label = `[${idx+1}/${total}] ${tclub}/${tcode}`;

  // 0. warmup
  await warmupLinkpage(tclub, tcode);
  await sleep(DELAY_MS);

  // 1. resolve — tenta via TournamentsLST (metadata completa: campo, rondas, etc)
  // ⚠ Sem cookies isto usa uma sessão SEPARADA (SESSAO_LISTA). Reaproveitar a
  // do classif dava Result:ERROR: o POST ao tournaments.aspx reescreve o
  // DG_Lists_URL (o contexto de página) e o classif a seguir perde o seu.
  const raw = await resolveTournament(tclub, tcode);
  let t;
  if (raw) {
    const circuit = spec.circuit || detectCircuit(raw);
    t = parseTournament(raw, circuit);
  } else {
    // Fallback: torneio não retornado pelo TournamentsLST (arquivo, removido
    // do índice, etc.). Usar metadata mínima do spec (pode vir do tracking
    // com name/date/rounds) e tentar classif na mesma. A classif.aspx/ClassifLST
    // funciona directamente via tclub/tcode — não depende de resolve.
    // No caminho sem cookies o TournamentsLST nunca responde (medido com os 3
    // acks): a metadata vem da própria página de classificações.
    if (!SESSAO_META) console.warn(`${label} não no TournamentsLST — tentar classif com fallback de metadata`);
    t = {
      name: (SESSAO_META && SESSAO_META.name) || spec.name || `${tclub}/${tcode}`,
      ccode: String(tclub).padStart(3, "0"),
      tcode: String(tcode),
      date: (SESSAO_META && SESSAO_META.date) || spec.date || "",
      campo: (SESSAO_META && SESSAO_META.campo) || "",
      clube: String(tclub).padStart(3, "0"),
      circuit: spec.circuit || "tour",
      series: "tour",
      region: regionMap[String(tclub).padStart(3, "0")] || "outro",
      escalao: null, num: 1,
      rounds: spec.rounds || 1,
      playerCount: 0, players: [],
    };
  }

  // 2. classif R1 (per-dia — descobre jogadores + detecta multi-ronda)
  const { records: recs1, error: err1 } = await fetchClassif(t.ccode, t.tcode, 1, "D");
  if (err1) { console.warn(`${label} ${t.name}  → erro classif: ${err1}`); return t; }
  if (recs1.length === 0) { console.log(`${label} ${t.name}  → 0 jogadores (futuro?)`); return t; }

  t.players = recs1.map(mapPlayer);
  t.playerCount = t.players.length;

  // Auto-detectar multi-ronda
  let nRounds = t.rounds || 1;
  if (nRounds <= 1) {
    await sleep(DELAY_MS);
    const probe = await fetchClassif(t.ccode, t.tcode, 2, "D");
    if (!probe.error && probe.records.length > 0) {
      nRounds = 2; t.rounds = 2;
    }
  }

  // Em multi-ronda, as POSIÇÕES corretas vêm da classificação AGREGADA ("A") —
  // o fetch inicial usa "D"/round=1 (posições só do 1º dia). Sem isto o `pos`
  // ficava preso à R1 enquanto o gross já era acumulado (ex: Manuel no Miramar
  // 2026 aparecia 2º da R1 com o total da R2). Re-mapeia pos/gross/toPar do
  // agregado; os scorecards (buraco-a-buraco) continuam a vir da secção abaixo.
  if (nRounds > 1) {
    await sleep(DELAY_MS);
    const agg = await fetchClassif(t.ccode, t.tcode, nRounds, "A");
    if (!agg.error && agg.records.length > 0) {
      t.players = agg.records.map(mapPlayer);
      t.playerCount = t.players.length;
    }
  }

  console.log(`${label} ${t.name.slice(0, 60)} → ${t.playerCount} jogadores${nRounds > 1 ? ` (${nRounds}R)` : ""}`);

  // 3. scorecards
  let scOk = 0, scFail = 0, scSkipped = 0;
  for (const p of t.players) {
    if (["NS","DQ","WD"].includes(p.pos) || !p.scoreId || p.scoreId === "0") {
      scSkipped++;
      continue;
    }

    if (nRounds > 1) {
      const recs = await fetchScorecardAggregate(p.scoreId, t.ccode, t.tcode);
      if (recs?.length > 0) {
        const sc0 = recs[0];
        if (!p.fedCode && sc0.federated_code) {
          p.fedCode = sc0.federated_code; p.courseRating = sc0.course_rating; p.slope = sc0.slope;
          p.teeName = sc0.tee_name; p.teeColorId = sc0.tee_color_id;
          p.parTotal = sc0.par_total; p.nholes = sc0.nholes; p.course = sc0.course_description;
        }
        recs.forEach((sc, i) => {
          const hd = extractHoleData(sc);
          p.roundScores.push({
            round: i + 1, gross: sc.gross_total, ...hd, ...extractPcc(sc),
            courseRating: sc.course_rating, slope: sc.slope,
            teeName: sc.tee_name, teeColorId: sc.tee_color_id,
          });
        });
        scOk++;
      } else scFail++;
    } else {
      const sc = await fetchScorecard(p.scoreId, t.ccode, t.tcode, 1);
      if (sc) {
        const hd = extractHoleData(sc);
        if (!p.fedCode && sc.federated_code) {
          p.fedCode = sc.federated_code; p.courseRating = sc.course_rating; p.slope = sc.slope;
          p.teeName = sc.tee_name; p.teeColorId = sc.tee_color_id;
          p.parTotal = sc.par_total; p.nholes = sc.nholes; p.course = sc.course_description;
        }
        p.roundScores.push({
          round: 1, gross: sc.gross_total, ...hd, ...extractPcc(sc),
          courseRating: sc.course_rating, slope: sc.slope,
          teeName: sc.tee_name, teeColorId: sc.tee_color_id,
        });
        scOk++;
      } else scFail++;
    }

    // Recalcular gross/toPar em multi-ronda
    if (nRounds > 1 && p.roundScores.length > 1) {
      const sumGross = p.roundScores.reduce((s, r) => s + (r.gross || 0), 0);
      p.grossTotal = sumGross;
      // ⚠ `p.parTotal || 0` era um bug: os jogadores sem federado FPG vêm sem
      // parTotal, o par virava 0 e o toPar ficava IGUAL ao gross — dai os
      // "+220" ao lado dos "+4" nas tabelas. O par e do CAMPO, igual para
      // todos, por isso usa-se o dos outros jogadores da mesma prova; se
      // ninguem o tiver, toPar fica null (desconhecido), nunca o gross.
      const parRonda = p.parTotal ?? parDoTorneio(t);
      p.toPar = parRonda != null ? sumGross - parRonda * p.roundScores.length : null;
    }
    await sleep(DELAY_MS);
  }
  t.scOk = scOk; t.scFail = scFail;
  const skipNote = scSkipped > 0 ? `, ${scSkipped} saltados (NS/DQ/WD)` : "";
  console.log(`${label}   scorecards: ${scOk} ok, ${scFail} falhas${skipNote}`);
  return t;
}

/* ── Concurrency pool ───────────────────────────────────────────────────── */
async function runPool(items, workerFn, concurrency) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try { results[i] = await workerFn(items[i], i, items.length); }
      catch (e) { console.error(`item ${i} erro:`, e.message); results[i] = null; }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/* ── Main ───────────────────────────────────────────────────────────────── */
(async () => {
  console.log(`[classif] Concurrency=${CONCURRENCY} Delay=${DELAY_MS}ms PageSize=${PAGE_SIZE}`);
  console.log(`[classif] Output: ${OUT_FILE}`);
  const t0 = Date.now();

  const processed = await runPool(scope, processOne, CONCURRENCY);
  const scrapedTournaments = processed.filter(t => t != null);

  // Limpar campos internos (scOk/scFail)
  scrapedTournaments.forEach(t => { delete t.scOk; delete t.scFail; });

  // Merge aditivo: se OUT_FILE já existe, combina com o existente por
  // ccode/tcode. Novos scrapes substituem entradas antigas (presume-se mais
  // recentes e completos). Entradas antigas que não foram re-scraped ficam.
  // Se um scrape novo trouxe 0 jogadores (classif arquivada), NÃO sobrescreve
  // uma entrada antiga com jogadores — evita regressões.
  let existing = [];
  if (fs.existsSync(OUT_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
      existing = prev.tournaments || [];
    } catch (e) {
      console.warn(`[classif] Aviso: falhou ler ${OUT_FILE}: ${e.message}`);
    }
  }

  const byKey = new Map();
  for (const t of existing) byKey.set(`${t.ccode}/${t.tcode}`, t);

  let added = 0, updated = 0, preserved = 0;
  for (const fresh of scrapedTournaments) {
    const k = `${fresh.ccode}/${fresh.tcode}`;
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, fresh);
      added++;
    } else {
      // Regressão: não sobrescrever dados bons por novo vazio
      const freshCount = fresh.playerCount || 0;
      const prevCount = prev.playerCount || 0;
      if (freshCount === 0 && prevCount > 0) {
        preserved++;
        continue;
      }
      byKey.set(k, fresh);
      updated++;
    }
  }

  const tournaments = [...byKey.values()].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const totalPlayers = tournaments.reduce((s, t) => s + (t.playerCount || 0), 0);
  const totalScorecards = tournaments.reduce((s, t) =>
    s + (t.players?.filter(p => p.roundScores && p.roundScores.length > 0).length || 0), 0);

  const now = new Date();
  const lastUpdated = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  console.log(`[classif] Merge: ${added} novos · ${updated} actualizados · ${preserved} preservados contra novo vazio`);

  const output = {
    lastUpdated,
    source: "scrape-classif-node.js (Node puro, linkpage + classif.aspx/ClassifLST)",
    totalTournaments: tournaments.length,
    totalPlayers, totalScorecards,
    tournaments,
  };

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[classif] ═══════════════════════════════════════`);
  console.log(`[classif] ✓ Concluído em ${dt}s`);
  console.log(`[classif]   ${tournaments.length} torneios · ${totalPlayers} jogadores · ${totalScorecards} scorecards`);

  // Comparar com output existente para decidir exit code
  let previousOutput = null;
  if (fs.existsSync(OUT_FILE)) {
    try {
      previousOutput = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
    } catch {}
  }
  const normalize = o => {
    if (!o) return "";
    const cp = { ...o };
    delete cp.lastUpdated;  // timestamps não contam para diff
    return JSON.stringify(cp);
  };
  if (previousOutput && normalize(previousOutput) === normalize(output)) {
    console.log(`[classif] ✓ Dados iguais ao existente — sem novidades (exit 2)`);
    process.exit(2);
  }

  const dir = path.dirname(OUT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Escrita atómica: escrever para ficheiro temporário e fazer rename.
  // Evita que uma interrupção (Ctrl+C, kill, crash) deixe o ficheiro final
  // truncado a meio — se a escrita for interrompida, o ficheiro original fica
  // intacto e o .tmp é apenas descartado na próxima corrida.
  const tmp = OUT_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(output, null, 2));
  fs.renameSync(tmp, OUT_FILE);
  console.log(`[classif] \u2713 Gravado ${OUT_FILE}`);
  process.exit(0);
})().catch(e => {
  console.error("[classif] ERRO fatal:", e);
  process.exit(1);
});
