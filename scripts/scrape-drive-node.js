#!/usr/bin/env node
/**
 * scrape-drive-node.js — Port Node puro do scrape-drive-aquapor-v8.js
 *
 * Usa os cookies capturados de scoring.datagolf.pt (Chrome 90) em vez de
 * browser console. Funciona em GitHub Actions, Windows Task Scheduler,
 * qualquer ambiente Node ≥ 20.
 *
 * Fonte dos cookies (por ordem):
 *   1. env DATAGOLF_SCORING_COOKIES (produção/Actions)
 *   2. ficheiro api/.scoring-datagolf-cookies.json (dev local)
 *
 * Output (mesmo formato que v8):
 *   public/data/drive-data-YYYY-MM.json
 *   public/data/aquapor-data-YYYY-MM.json
 *
 * Exit codes:
 *   0  → sucesso com mais informação que antes (workflow deve committar)
 *   2  → sucesso mas sem dados novos (workflow NÃO committar)
 *   1  → erro real
 *
 * Uso:
 *   node scripts/scrape-drive-node.js                        # mês corrente + anterior (rápido — para cron diário)
 *   node scripts/scrape-drive-node.js --months-back 0        # SÓ mês corrente
 *   node scripts/scrape-drive-node.js --months-back 6        # últimos 6 meses
 *   node scripts/scrape-drive-node.js --months-back 99       # ano inteiro (histórico completo)
 *   node scripts/scrape-drive-node.js --year-from 2022       # múltiplos anos (combina com months-back)
 */

"use strict";
const fs = require("fs");
const path = require("path");
const { writeAtomic } = require("../lib/atomic-write");
const { lisbonCivilDayStr } = require("../lib/helpers");
const { compareForRanking, assignPositions } = require("./lib/drive-countback.cjs");

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════
const REPO_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(REPO_ROOT, "public", "data");
const BASE_URL = "https://scoring.datagolf.pt/pt";
const UA = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36";

const argv = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = argv.indexOf(flag);
  if (i < 0) return def;
  return argv[i + 1] || def;
};
const hasFlag = flag => argv.includes(flag);

const YEAR_FROM = Number(getArg("--year-from", new Date().getFullYear()));
const YEAR_TO   = new Date().getFullYear();
// MONTHS_BACK: filtra torneios apenas do mês corrente + N meses anteriores.
// Default 1 = mês corrente e o anterior (suficiente para a corrida de fim-de-semana
// detectar torneios que mudam de mês). Usar 0 para só mês corrente. Usar 99 para
// histórico completo do ano (default antigo).
const MONTHS_BACK = Number(getArg("--months-back", 1));
const FORCE     = hasFlag("--force");
const DELAY     = 100;   // ms entre pedidos

// Calcular meses permitidos (formato "YYYY-MM")
function getAllowedMonths() {
  if (MONTHS_BACK >= 99) return null;  // null = sem filtro de mês
  const allowed = new Set();
  const now = new Date();
  for (let i = 0; i <= MONTHS_BACK; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    // Dia 1 à meia-noite LOCAL: usar o dia civil de Lisboa (não toISOString,
    // que em horário de verão UTC+1 recua para o mês anterior → "2026-06").
    allowed.add(lisbonCivilDayStr(d).slice(0, 7));
  }
  return allowed;
}
const ALLOWED_MONTHS = getAllowedMonths();

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Cores ─────────────────────────────────────────────────
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m", X = "\x1b[0m";
const log  = m => console.log(`${C}[scrape-drive]${X} ${m}`);
const ok   = m => console.log(`${G}[scrape-drive] ✓${X} ${m}`);
const warn = m => console.log(`${Y}[scrape-drive] ⚠${X} ${m}`);
const info = m => console.log(`  ${m}`);

// ═══════════════════════════════════════════════════════════
// COOKIES
// ═══════════════════════════════════════════════════════════
const { loadCookieHeader } = require("./lib/cookies");
// ⚠ Opcionais desde 2026-08-30: há um caminho público que não leva
// credencial nenhuma (ver "MODO PÚBLICO" abaixo). Sem cookies o scrape arranca
// já nesse modo em vez de abortar.
const COOKIE = loadCookieHeader({
  exitOnFail: false,
  envVars: ["DATAGOLF_SCORING_COOKIES"],
  file: path.join(REPO_ROOT, "api", ".scoring-datagolf-cookies.json"),
  label: "[drive]",
});

// ═══════════════════════════════════════════════════════════
// FETCH WRAPPER
// ═══════════════════════════════════════════════════════════
const { makeFpgPost } = require("./lib/fpg-http");
const dgPost = COOKIE ? makeFpgPost({
  baseUrl: BASE_URL,
  cookie: COOKIE,
  ua: UA,
  origin: "https://scoring.datagolf.pt",
  referer: `${BASE_URL}/tournaments.aspx`,
}) : null;

// ═══════════════════════════════════════════════════════════
// MODO PÚBLICO — sem cookies guardados (2026-08-30)
// ═══════════════════════════════════════════════════════════
/* Os gateways da FPG que levam o `ack` universal EMITEM eles próprios a
   sessão ASP.NET (ASP.NET_SessionId + DG_Lists_URL) a quem chega sem
   credenciais. Nunca foi preciso capturar cookies no Chrome 90 para este
   scrape: faltava ACEITAR a sessão em vez de reproduzir uma guardada — e o
   500 que se lia como "cookies expiraram" é, na origem,
   "Object reference not set to an instance of an object", o null-ref clássico
   de quem não tem sessão. Detalhe e medições em scripts/lib/fpg-session.js.

   ⚠ DUAS sessões, não uma: o DG_Lists_URL guarda o CONTEXTO da página. Um
   POST ao tournaments.aspx reescreve-o e o classif a seguir perde o seu
   (Result:ERROR logo depois de um warmup bem sucedido). Daí a lista ter
   sessão própria e cada torneio a sua. */
const { Sessao, criarSessaoLista } = require("./lib/fpg-session");
let MODO_PUBLICO = !COOKIE;
let SESSAO_LISTA;                       // undefined = por criar · null = falhou
const SESSOES_CLASSIF = new Map();      // "tclub/tcode" → Sessao

async function sessaoLista() {
  if (SESSAO_LISTA === undefined) SESSAO_LISTA = await criarSessaoLista().catch(() => null);
  return SESSAO_LISTA;
}

async function sessaoClassif(tclub, tcode) {
  const k = `${tclub}/${tcode}`;
  if (!SESSOES_CLASSIF.has(k)) {
    const sess = new Sessao();
    const abriu = await sess.abrir("classif", tclub, tcode).catch(() => null);
    SESSOES_CLASSIF.set(k, abriu && abriu.ok ? sess : null);
  }
  return SESSOES_CLASSIF.get(k);
}

/** Mesma assinatura e mesma forma de resposta do dgPost, sem credenciais. */
async function dgPostPublico(pathname, body, qs) {
  const lista = pathname.startsWith("tournaments.aspx");
  const sess = lista ? await sessaoLista() : await sessaoClassif(body.tclub, body.tcode);
  if (!sess) throw new Error(`sem sessão pública para ${pathname}`);
  const r = await sess.postPageMethod(pathname, body, { queryString: qs });
  if (!r.ok) throw new Error(`${pathname}: Result=${r.result || "?"} (público)`);
  return { Records: r.records, TotalRecordCount: r.total ?? 0, Result: "OK" };
}

/** Caminho habitual primeiro (metadata igual); público quando ele falha. */
async function dgPostSmart(pathname, body, qs) {
  if (MODO_PUBLICO) return dgPostPublico(pathname, body, qs);
  try {
    return await dgPost(pathname, body, qs);
  } catch (e) {
    // HTTP 500 aqui não distingue "cookies mortas" de "FPG em baixo" — em
    // qualquer dos casos vale a pena perguntar sem credenciais antes de
    // desistir. Se o público responder, é porque o problema era nosso.
    if (!e || e.status !== 500) throw e;
    const r = await dgPostPublico(pathname, body, qs).catch(() => null);
    if (!r) throw e;
    MODO_PUBLICO = true;
    info("cookies não autenticam — a seguir pelo caminho público (sem credenciais)");
    return r;
  }
}

// ═══════════════════════════════════════════════════════════
// FASE 1 — DESCOBRIR TORNEIOS (drive + aquapor)
// ═══════════════════════════════════════════════════════════
const regionMap = { "982": "madeira", "983": "acores", "985": "tejo", "987": "norte", "988": "sul", "000": "nacional" };
const getYear = r => {
  const ms = parseInt((r.started_at || "").match(/\d+/)?.[0] || "0");
  return Number(lisbonCivilDayStr(ms).slice(0, 4));
};
const getMonthKey = r => {
  const ms = parseInt((r.started_at || "").match(/\d+/)?.[0] || "0");
  return lisbonCivilDayStr(ms).slice(0, 7);
};
const isInScope = r => {
  const y = getYear(r);
  if (y < YEAR_FROM || y > YEAR_TO) return false;
  // Filtro adicional: se MONTHS_BACK definido, só meses recentes
  if (ALLOWED_MONTHS) {
    const m = getMonthKey(r);
    if (!ALLOWED_MONTHS.has(m)) return false;
  }
  return true;
};

async function tournSearchPage(TournName, startIndex) {
  const body = {
    ClubCode: "0", dtIni: "", dtFim: "", CourseName: "", TournCode: "",
    TournName: TournName || "",
    jtStartIndex: String(startIndex),
    jtPageSize: "50",
    jtSorting: "started_at DESC",
  };
  const qs = `jtStartIndex=${startIndex}&jtPageSize=50&jtSorting=${encodeURIComponent("started_at DESC")}`;
  const d = await dgPostSmart("tournaments.aspx/TournamentsLST", body, qs);
  return { records: d.Records || [], total: d.TotalRecordCount || 0 };
}

async function tournSearchAll(TournName) {
  const first = await tournSearchPage(TournName, 0);
  const all = [...first.records];
  const pages = Math.ceil(first.total / 50);
  info(`${TournName}: ${first.total} total (${pages} páginas)`);

  // Resultados ordenados por started_at DESC → parar quando tudo for anterior a YEAR_FROM
  let belowPages = 0;
  let offset = 50;
  while (offset < first.total) {
    await sleep(DELAY);
    const page = await tournSearchPage(TournName, offset);
    all.push(...page.records);
    const allBelow = page.records.length > 0 && page.records.every(r => getYear(r) < YEAR_FROM);
    if (allBelow) {
      if (++belowPages >= 2) {
        info(`  Parou na pág ${offset / 50 + 1}/${pages} (tudo anterior a ${YEAR_FROM})`);
        break;
      }
    } else {
      belowPages = 0;
    }
    offset += 50;
  }
  return all;
}

// ═══════════════════════════════════════════════════════════
// FASE 2 — CLASSIFICAÇÕES + SCORECARDS
// ═══════════════════════════════════════════════════════════
async function fetchClassif(tclub, tcode, round) {
  const allRecords = [];
  let startIndex = 0;
  const pageSize = 150;

  while (true) {
    const body = {
      Classi: "1", tclub: String(tclub), tcode: String(tcode),
      classiforder: "1", classiftype: "I", classifroundtype: "D",
      scoringtype: "1", round: String(round || 1),
      members: "0", playertypes: "0", gender: "0",
      minagemen: "0", maxagemen: "999",
      minageladies: "0", maxageladies: "999",
      minhcp: "-8", maxhcp: "99", idfilter: "-1",
      jtStartIndex: String(startIndex), jtPageSize: String(pageSize),
      jtSorting: "score_id DESC",
    };
    const qs = `jtStartIndex=${startIndex}&jtPageSize=${pageSize}&jtSorting=${encodeURIComponent("score_id DESC")}`;
    try {
      const d = await dgPostSmart("classif.aspx/ClassifLST", body, qs);
      const recs = d.Records || [];
      allRecords.push(...recs);
      if (recs.length < pageSize) break;
      startIndex += pageSize;
      await sleep(DELAY);
    } catch (e) {
      return { records: allRecords, error: e.message };
    }
  }
  return { records: allRecords, error: null };
}

async function fetchScorecard(scoreId, tclub, tcode, round) {
  const qs = `score_id=${scoreId}&tclub=${tclub}&tcode=${tcode}&scoringtype=1&classiftype=I&classifround=${round}`;
  const body = {
    score_id: String(scoreId), tclub: String(tclub), tcode: String(tcode),
    scoringtype: "1", classiftype: "I", classifround: String(round),
  };
  try {
    const d = await dgPostSmart("classif.aspx/ScoreCard", body, qs);
    return (d.Records && d.Records[0]) || null;
  } catch { return null; }
}

async function fetchScorecardAggregate(scoreId, tclub, tcode) {
  const qs = `score_id=${scoreId}&tclub=${tclub}&tcode=${tcode}&scoringtype=1&classiftype=I&classifround=`;
  const body = {
    score_id: String(scoreId), tclub: String(tclub), tcode: String(tcode),
    scoringtype: "1", classiftype: "I", classifround: "",
  };
  try {
    const d = await dgPostSmart("classifAgregate.aspx/ScoreCard", body, qs);
    return d.Records || null;
  } catch { return null; }
}

function extractHoleData(rec) {
  const n = rec.nholes || 18;
  const scores = [], pars = [], si = [], meters = [];
  for (let h = 1; h <= n; h++) {
    scores.push(rec[`gross_${h}`] != null ? Number(rec[`gross_${h}`]) : 0);
    pars.push(rec[`par_${h}`]     != null ? Number(rec[`par_${h}`])   : 0);
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

function parseTournament(raw, circuit) {
  const desc = raw.description || "";
  const cc = raw.club_code || "";
  const tc = raw.code || "";
  const dateMs = parseInt((raw.started_at || "").match(/\d+/)?.[0] || "0");
  const dateStr = lisbonCivilDayStr(dateMs); // epoch = meia-noite Lisboa; UTC dava dia -1 no verão

  let series = circuit === "aquapor" ? "aquapor" : "tour";
  // /\bchall/ (prefixo): os nomes longos vêm ABREVIADOS da FPG em pontos
  // arbitrários — "Drive Chall Tejo-Mosteiro-…", "Drive Challe Tejo-Power…".
  // Só /challenge/ deixava os Challenge do Tejo classificados como "tour"
  // (bug corrigido 2026-07-10).
  if (/\bchall/i.test(desc)) series = "challenge";

  let escalao = null;
  const escMatch = desc.match(/Sub\s*(\d+)/i);
  if (escMatch) escalao = `Sub ${escMatch[1]}`;

  let num = 1;
  const numMatch = desc.match(/(\d+)º/);
  if (numMatch) num = parseInt(numMatch[1]);

  return {
    name: desc, ccode: cc, tcode: tc, date: dateStr,
    campo: raw.course_description || "",
    clube: cc, series,
    region: regionMap[cc] || "outro",
    escalao, num,
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
    teeName: null, teeColorId: null,
    parTotal: null, nholes: null, course: null,
    roundScores: [],
  };
}

function buildOutput(tournaments, circuit, month) {
  const now = new Date();
  const lastUpdated = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  let tp = 0, ts = 0;
  for (const t of tournaments) {
    tp += t.playerCount;
    for (const p of t.players) ts += p.roundScores.length;
  }
  tournaments.sort((a, b) => a.date.localeCompare(b.date));
  return {
    lastUpdated, source: "scoring.datagolf.pt", circuit, month,
    totalTournaments: tournaments.length,
    totalPlayers: tp, totalScorecards: ts,
    tournaments,
  };
}

// ═══════════════════════════════════════════════════════════
// COMMIT CONTROL — escrever ficheiro apenas se mudou
// ═══════════════════════════════════════════════════════════
function totalsOf(data) {
  return {
    torneios: data?.totalTournaments || 0,
    jogadores: data?.totalPlayers || 0,
    scorecards: data?.totalScorecards || 0,
  };
}

let gainedInfo = false;
let filesWritten = 0;
let filesUnchanged = 0;

function writeIfChanged(filepath, newObj) {
  const newJson = JSON.stringify(newObj, (k, v) => (k === "lastUpdated") ? undefined : v, 2);
  let oldObj = null, oldJson = null;
  if (fs.existsSync(filepath)) {
    try {
      oldObj = JSON.parse(fs.readFileSync(filepath, "utf8"));
      oldJson = JSON.stringify(oldObj, (k, v) => (k === "lastUpdated") ? undefined : v, 2);
    } catch {}
  }
  if (oldJson === newJson) {
    filesUnchanged++;
    return;
  }
  writeAtomic(filepath, JSON.stringify(newObj, null, 2));
  filesWritten++;
  const nT = totalsOf(newObj);
  const oT = oldObj ? totalsOf(oldObj) : { torneios: 0, jogadores: 0, scorecards: 0 };
  const more = nT.torneios > oT.torneios || nT.jogadores > oT.jogadores || nT.scorecards > oT.scorecards;
  if (more) gainedInfo = true;
  const marker = oldObj ? (more ? `${G}MAIS${X}` : `${Y}MUDOU${X}`) : `${G}NOVO${X}`;
  info(`${marker} ${path.basename(filepath)} — ${nT.torneios}T/${nT.jogadores}J/${nT.scorecards}SC` +
       (oldObj ? ` (era ${oT.torneios}T/${oT.jogadores}J/${oT.scorecards}SC)` : ""));
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
(async () => {
  log(`═══ Scrape Drive+Aquapor — ${YEAR_FROM} a ${YEAR_TO} ═══`);
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Fase 1 — descoberta
  log("FASE 1: descobrir torneios");
  const driveAll = await tournSearchAll("drive");
  const drive = driveAll.filter(isInScope).filter(r => (r.acronym || "").startsWith("FPG_D"));
  ok(`DRIVE: ${drive.length} torneios no scope (de ${driveAll.length} total)`);

  const aquaporAll = await tournSearchAll("aquapor");
  const aquapor = aquaporAll.filter(isInScope);
  ok(`AQUAPOR: ${aquapor.length} torneios no scope (de ${aquaporAll.length} total)`);

  // Agrupar por mês
  const monthlyRaw = {};
  for (const r of drive)   { const m = getMonthKey(r); (monthlyRaw[m] ||= { drive: [], aquapor: [] }).drive.push(r); }
  for (const r of aquapor) { const m = getMonthKey(r); (monthlyRaw[m] ||= { drive: [], aquapor: [] }).aquapor.push(r); }
  const allMonths = Object.keys(monthlyRaw).sort().reverse();
  log(`${allMonths.length} meses com torneios: ${allMonths[0]} → ${allMonths[allMonths.length - 1]}`);

  // Fase 2+3 — processar e exportar mês a mês
  log("FASE 2+3: classificações, scorecards, export por mês");
  let tournIndex = 0;
  const tournTotal = drive.length + aquapor.length;

  for (const month of allMonths) {
    const monthData = monthlyRaw[month];
    const driveTournaments = [];
    const aquaporTournaments = [];

    const allTourns = [
      ...monthData.drive.map(r => ({ raw: r, circuit: "drive" })),
      ...monthData.aquapor.map(r => ({ raw: r, circuit: "aquapor" })),
    ];

    for (const { raw, circuit } of allTourns) {
      const t = parseTournament(raw, circuit);
      tournIndex++;
      const label = `[${tournIndex}/${tournTotal}] ${t.ccode}/${t.tcode}`;

      const { records, error } = await fetchClassif(t.ccode, t.tcode, 1);
      if (error) {
        warn(`${label} ${t.name} → ERRO: ${error}`);
        (circuit === "aquapor" ? aquaporTournaments : driveTournaments).push(t);
        await sleep(DELAY); continue;
      }
      if (records.length === 0) {
        info(`${label} ${t.name} → 0 jogadores (futuro?)`);
        (circuit === "aquapor" ? aquaporTournaments : driveTournaments).push(t);
        await sleep(DELAY); continue;
      }

      t.players = records.map(mapPlayer);
      t.playerCount = t.players.length;

      // Auto-detect 2 rondas
      let nRounds = t.rounds || 1;
      if (nRounds <= 1) {
        await sleep(DELAY);
        const probe = await fetchClassif(t.ccode, t.tcode, 2);
        if (!probe.error && probe.records.length > 0) {
          nRounds = 2; t.rounds = 2;
        }
      }

      info(`${label} ${t.name} → ${t.playerCount} jog${nRounds > 1 ? ` (${nRounds}R)` : ""}`);

      // Scorecards
      for (const p of t.players) {
        if (["NS", "DQ", "WD"].includes(p.pos) || !p.scoreId || p.scoreId === "0") continue;

        if (nRounds > 1) {
          const recs = await fetchScorecardAggregate(p.scoreId, t.ccode, t.tcode);
          if (recs?.length > 0) {
            const sc0 = recs[0];
            if (!p.fedCode && sc0.federated_code) {
              p.fedCode = sc0.federated_code;
              p.courseRating = sc0.course_rating; p.slope = sc0.slope;
              p.teeName = sc0.tee_name; p.teeColorId = sc0.tee_color_id;
              p.parTotal = sc0.par_total; p.nholes = sc0.nholes; p.course = sc0.course_description;
            }
            recs.forEach((sc, idx) => {
              const hd = extractHoleData(sc);
              p.roundScores.push({
                round: idx + 1, gross: sc.gross_total,
                scores: hd.scores, pars: hd.pars, si: hd.si, meters: hd.meters,
                ...extractPcc(sc),
                courseRating: sc.course_rating, slope: sc.slope,
                teeName: sc.tee_name, teeColorId: sc.tee_color_id,
              });
            });
          }
        } else {
          const sc = await fetchScorecard(p.scoreId, t.ccode, t.tcode, 1);
          if (sc) {
            const hd = extractHoleData(sc);
            if (!p.fedCode && sc.federated_code) {
              p.fedCode = sc.federated_code;
              p.courseRating = sc.course_rating; p.slope = sc.slope;
              p.teeName = sc.tee_name; p.teeColorId = sc.tee_color_id;
              p.parTotal = sc.par_total; p.nholes = sc.nholes; p.course = sc.course_description;
            }
            p.roundScores.push({
              round: 1, gross: sc.gross_total,
              scores: hd.scores, pars: hd.pars, si: hd.si, meters: hd.meters,
              ...extractPcc(sc),
              courseRating: sc.course_rating, slope: sc.slope,
              teeName: sc.tee_name, teeColorId: sc.tee_color_id,
            });
          }
        }
        await sleep(DELAY);

        if (nRounds > 1 && p.roundScores.length > 1) {
          const sumGross = p.roundScores.reduce((s, r) => s + (r.gross || 0), 0);
          const parT = p.parTotal || 0;
          p.grossTotal = sumGross;
          p.toPar = sumGross - (parT * p.roundScores.length);
        }
      }

      // ⚠ Posição AGREGADA nos multi-ronda (2026-07-10): o ClassifLST acima é
      // o da RONDA 1 — o `pos` que trazia NÃO era a classificação final, e os
      // pontos do ranking saíam errados (ex: 3º DT Tejo: pos 1 = Pedro Costa
      // Alemão em vez do Nuno Palmares; confirmado contra o RankingsClassifLST
      // oficial). Recalcular por grossTotal agregado.
      //
      // Desempate = COUNTBACK oficial (2026-07-19): última volta → últimos
      // 9 → 6 → 3 → 1 buraco. Reproduz o oficial em 20 dos 26 grupos de
      // empate de 2026 (o critério anterior — back-9 só de 18 buracos, depois
      // ordem alfabética — falhava em quase todos, ex. Tomás/James
      // empatados a 81: 165 vs 94 pts trocados). Ver scripts/lib/drive-countback.cjs.
      // Jogadores sem todas as rondas (WD a meio) vão para o fim (0 pts).
      // ⚠ Aquapor FICA DE FORA: não é classificação gross (no 2º Aquapor 2025
      // o 3º fez 143 e o 4º fez 141 — é com handicap), logo reordenar por
      // gross agregado corrompia a ordem oficial. Lá mantém-se o pos da FPG.
      if (nRounds > 1 && circuit !== "aquapor") {
        const hasGross = (p) => typeof p.grossTotal === "number" && p.grossTotal < 900;
        const complete = t.players.filter(p => hasGross(p) && (p.roundScores?.length || 0) >= nRounds).sort(compareForRanking);
        const partial = t.players.filter(p => hasGross(p) && (p.roundScores?.length || 0) < nRounds).sort(compareForRanking);
        assignPositions(complete);
        assignPositions(partial);
        for (const p of partial) p.pos += complete.length;
      }

      (circuit === "aquapor" ? aquaporTournaments : driveTournaments).push(t);
      await sleep(DELAY);
    }

    if (driveTournaments.length > 0) {
      const data = buildOutput(driveTournaments, "drive", month);
      writeIfChanged(path.join(OUTPUT_DIR, `drive-data-${month}.json`), data);
    }
    if (aquaporTournaments.length > 0) {
      const data = buildOutput(aquaporTournaments, "aquapor", month);
      writeIfChanged(path.join(OUTPUT_DIR, `aquapor-data-${month}.json`), data);
    }
  }

  // ─── Resumo final ──────────────────────────────────────
  console.log("");
  log("═══ RESUMO ═══");
  info(`${tournTotal} torneios processados`);
  info(`Ficheiros escritos: ${G}${filesWritten}${X} (${gainedInfo ? G + "contagens aumentaram" + X : Y + "mesmas contagens, conteúdo alterado" + X})`);
  info(`Ficheiros inalterados: ${filesUnchanged}`);

  if (filesWritten === 0) {
    console.log(`${Y}Nada mudou — sem commit${X}`);
    process.exit(2);
  }
  // Qualquer ficheiro escrito = conteúdo REALMENTE diferente do que está commitado.
  // `writeIfChanged` já ignora o `lastUpdated` no diff, por isso um ficheiro escrito
  // representa sempre uma mudança de dados real — novos torneios, novas rondas,
  // inscrições, ou correcções de hcp/posições/scorecards. Mesmo quando as contagens
  // (torneios/jogadores/scorecards) não aumentam, a mudança deve ser commitada.
  // (O gate antigo exigia aumento de contagem e engolia estas mudanças → o site
  // nunca recebia os torneios novos.)
  console.log(`${G}✓ ${filesWritten} ficheiro(s) com conteúdo novo — commit${X}`);
  process.exit(0);
})().catch(async err => {
  console.error(`${R}ERRO FATAL:${X} ${err.stack || err.message}`);
  // ⚠ Um HTTP 500 da FPG não é prova de que o problema seja nosso. A 2026-08-30
  // o `classif.aspx`/`TournamentsLST` ardeu para toda a gente (um entry gate
  // SEM credenciais dava o mesmo 500) e este scrape pintou o cron de vermelho
  // como se os cookies tivessem expirado — tinham 7 horas. Antes de sair 1,
  // repetir a pergunta sem credenciais: se a fonte está em baixo, sai 3 e o
  // workflow regista "fonte em baixo" em vez de acusar o nosso segredo.
  if (err && err.status === 500) {
    try {
      const { sondarFpg, explicar } = require("./lib/fpg-liveness");
      const sondas = await sondarFpg();
      if (sondas.fonteEmBaixo) {
        console.error(`${R}→${X} ${explicar("fonte-em-baixo", sondas)}`);
        process.exit(3);
      }
      console.error("→ o controlo SEM cookies respondeu: o 500 é do nosso segredo (cookies).");
    } catch (e) {
      console.error("→ sonda de liveness falhou:", e.message);
    }
  }
  process.exit(1);
});
