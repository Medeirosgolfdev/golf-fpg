#!/usr/bin/env node
/**
 * scrape-jovens-node.js — Scraper de torneios juvenis (FPG) em Node puro.
 *
 * Descobre torneios cujo nome contém "Jovens" OU "PJA" no ano pedido (default
 * ano corrente), faz fetch de classificações + scorecards, e MERGE incremental
 * com o ficheiro existente em public/data/jovens_YYYY.json. Os termos são
 * configuráveis via flag --search "Termo1,Termo2".
 *
 * Princípio: nunca perder dados já persistidos. Se a re-fetch de um torneio
 * vier com menos info (ex: um jogador deixou de ter scorecard), mantém-se o
 * que já temos.
 *
 * Fonte dos cookies (por ordem):
 *   1. env DATAGOLF_SCORING_COOKIES (produção/Actions)
 *   2. ficheiro api/.scoring-datagolf-cookies.json (dev local)
 *
 * Output:
 *   public/data/jovens_YYYY.json
 *
 * Exit codes:
 *   0  → sucesso com dados novos (workflow deve committar)
 *   2  → sucesso mas nada novo (workflow NÃO committar, não é erro)
 *   1  → erro real
 *
 * Uso:
 *   node scripts/scrape-jovens-node.js                     # ano corrente, termos default
 *   node scripts/scrape-jovens-node.js --year 2025         # ano específico
 *   node scripts/scrape-jovens-node.js --refetch-all       # re-fetch mesmo torneios já completos
 *   node scripts/scrape-jovens-node.js --search "Jovens"   # só Jovens (sem PJA)
 *   node scripts/scrape-jovens-node.js --search "PJA"      # só PJA
 *   node scripts/scrape-jovens-node.js --extra-tcodes 007:11010
 *                                                           # força fetch de tcodes específicos
 *                                                           # (útil quando o nome do torneio não
 *                                                           #  contém nenhum dos termos pesquisados)
 *
 * Flags/convenções:
 *   - tcodes 99xxx são sintéticos (placeholders manuais, ex: Regionais com
 *     draw por email). O scrape NUNCA os toca — se aparecerem em `existing`
 *     são preservados sem refetch.
 *   - Se a API devolve 0 torneios mas o ficheiro existente tem torneios
 *     reais (não-sintéticos), o script aborta com exit 1 em vez de escrever
 *     um ficheiro vazio — defesa contra cookies expirados a fazer wipe.
 *   - HTTP 500 em `tournaments.aspx/*` é sinal canónico de cookies expirados:
 *     o script faz retry e, se persistir, aborta com instruções claras em
 *     vez de stack trace bruto.
 */

"use strict";
const fs = require("fs");
const path = require("path");
const { writeAtomic } = require("../lib/atomic-write");
const { lisbonCivilDayStr } = require("../lib/helpers");

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════
const REPO_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(REPO_ROOT, "public", "data");
const BASE_URL = "https://scoring.datagolf.pt/pt";
const UA = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36";
const ACK_TOURNLIST = "XH256YF45T";

const argv = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = argv.indexOf(flag);
  return i < 0 ? def : (argv[i + 1] || def);
};
const hasFlag = flag => argv.includes(flag);

// Termos de pesquisa. A FPG usa "Jovens" (plural) nos campeonatos nacionais
// e regionais; "PJA" prefixa torneios da Portuguese Junior Amateurs (PJA Tour,
// PJA Masters, PJA Race, etc.) que também são juvenis. Case-insensitive
// substring match server-side. Override via flag --search "Termo1,Termo2".
const SEARCH_TERMS = String(getArg("--search", "Jovens,PJA"))
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const YEAR = Number(getArg("--year", new Date().getFullYear()));
const REFETCH_ALL = hasFlag("--refetch-all");
// Janela em que re-fazemos fetch a um torneio já guardado (por ex: inscrições
// a mudar, resultados a serem carregados). Fora dessa janela, saltamos.
const REFETCH_DAYS = Number(getArg("--refetch-days", 21));
const DELAY = 100; // ms entre pedidos

// --extra-tcodes "ccode:tcode,ccode:tcode" — força fetch destes torneios mesmo
// que nenhum dos SEARCH_TERMS os encontre. Útil para Regionais que a FPG
// indexa com nome alternativo (ex: "Regional Sub 10/12") e por isso escapam
// aos filtros `TournName=...`. Aceita também só "tcode" (assume ccode=000).
const EXTRA_TCODES_RAW = getArg("--extra-tcodes", "");
const EXTRA_TCODES = EXTRA_TCODES_RAW
  ? EXTRA_TCODES_RAW.split(",").map(s => {
      const parts = s.trim().split(":");
      return parts.length === 2
        ? { ccode: parts[0].trim(), tcode: parts[1].trim() }
        : { ccode: "000", tcode: parts[0].trim() };
    }).filter(x => x.tcode)
  : [];

// Tcodes sintéticos (placeholder para torneios sem entrada na FPG, ex:
// Regionais com draw por email/PDF). Convencionados: 99xxx. O scrape NUNCA
// os toca — se forem encontrados em `existing` são preservados sem refetch.
const SYNTHETIC_TCODE = tcode => /^99\d{3}$/.test(String(tcode || ""));

const OUTPUT_FILE = path.join(OUTPUT_DIR, `jovens_${YEAR}.json`);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Cores ─────────────────────────────────────────────────
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m", X = "\x1b[0m";
const log  = m => console.log(`${C}[scrape-jovens]${X} ${m}`);
const ok   = m => console.log(`${G}[scrape-jovens] ✓${X} ${m}`);
const warn = m => console.log(`${Y}[scrape-jovens] ⚠${X} ${m}`);
const info = m => console.log(`  ${m}`);

// ═══════════════════════════════════════════════════════════
// COOKIES
// ═══════════════════════════════════════════════════════════
const { loadCookieHeader } = require("./lib/cookies");
// ⚠ Opcionais desde 2026-08-30 — ver o roteador público mais abaixo.
const COOKIE = loadCookieHeader({
  exitOnFail: false,
  envVars: ["DATAGOLF_SCORING_COOKIES"],
  file: path.join(REPO_ROOT, "api", ".scoring-datagolf-cookies.json"),
  label: "[jovens]",
});

// ═══════════════════════════════════════════════════════════
// WARMUP — entry-gate cross-domain (copiado de scrape-fpg-admissions-draws-node.js
// Fonte 3, linha 350). Reactiva sessão ASP.NET expirada por inactividade antes
// do primeiro POST. O `ack` é universal — não é o hash dinâmico do browser.
// Se falhar, o script continua; o erro real é apanhado em dgPost com mensagem
// detalhada sobre cookies expirados.
// ═══════════════════════════════════════════════════════════
async function warmupEntryGate() {
  const warmupUrl = `https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=${ACK_TOURNLIST}`;
  try {
    const r = await fetch(warmupUrl, {
      headers: {
        "User-Agent": UA, ...(COOKIE ? { "Cookie": COOKIE } : {}),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9",
      },
      redirect: "follow",
    });
    await r.text();
    log(`warmup entry-gate HTTP ${r.status}`);
  } catch (e) {
    warn(`warmup entry-gate falhou: ${e.message} — continuar mesmo assim`);
  }
}

// ═══════════════════════════════════════════════════════════
// FETCH WRAPPER
// ═══════════════════════════════════════════════════════════
// Erro estruturado do FPG — agora na lib partilhada (scripts/lib/fpg-http.js)
const { makeFpgPost, FpgHttpError } = require("./lib/fpg-http");

const dgPostAuth = COOKIE ? makeFpgPost({
  baseUrl: BASE_URL,
  cookie: COOKIE,
  ua: UA,
  origin: "https://scoring.datagolf.pt",
  referer: `${BASE_URL}/tournaments.aspx`,
}) : null;

/* Caminho público (sem credenciais): os gateways com o `ack` universal emitem
   a própria sessão ASP.NET. Tenta-se o habitual primeiro e, num HTTP 500,
   repete-se sem credenciais antes de desistir. Ver scripts/lib/fpg-session.js. */
const { criarRoteador } = require("./lib/fpg-session");
const ROTA = criarRoteador({ dgPost: dgPostAuth, info: log });
const dgPost = (pathname, body, qs) => ROTA.post(pathname, body, qs);

// ═══════════════════════════════════════════════════════════
// FASE 1 — DESCOBERTA
// ═══════════════════════════════════════════════════════════
const regionMap = { "982": "madeira", "983": "acores", "985": "tejo", "987": "norte", "988": "sul", "000": "nacional" };

const getMs = r => parseInt((r.started_at || "").match(/\d+/)?.[0] || "0");
const getYear = r => new Date(getMs(r)).getFullYear();
const getDateStr = r => lisbonCivilDayStr(getMs(r)); // epoch = meia-noite Lisboa; UTC dava dia -1 no verão

async function tournSearchPage(term, startIndex, pageSize) {
  // Formato ISO "YYYY-MM-DD" é o único que funciona em AMBOS dtIni e dtFim.
  // Descoberto 2026-04-18: dtFim em "DD/MM/YYYY" dá HTTP 500; ISO funciona.
  const body = {
    ClubCode: "0",
    dtIni: `${YEAR}-01-01`,
    dtFim: `${YEAR}-12-31`,
    CourseName: "",
    TournCode: "",
    TournName: term,
    jtStartIndex: String(startIndex),
    jtPageSize: String(pageSize),
    jtSorting: "started_at DESC",
  };
  const qs = `jtStartIndex=${startIndex}&jtPageSize=${pageSize}&jtSorting=${encodeURIComponent("started_at DESC")}`;
  const d = await dgPost("tournaments.aspx/TournamentsLST", body, qs);
  return { records: d.Records || [], total: d.TotalRecordCount || 0 };
}

// Lookup directo por tcode (ignora o filtro TournName). Usado para
// `--extra-tcodes`, onde sabemos o código do torneio mas o nome pode não
// conter nenhum dos SEARCH_TERMS (ex: "Campeonato Regional Sub 10/12 2026").
async function tournLookupByCode(ccode, tcode) {
  const body = {
    ClubCode: String(ccode || "0"), dtIni: "", dtFim: "",
    CourseName: "", TournCode: String(tcode), TournName: "",
    jtStartIndex: "0", jtPageSize: "10", jtSorting: "started_at DESC",
  };
  const qs = `jtStartIndex=0&jtPageSize=10&jtSorting=${encodeURIComponent("started_at DESC")}`;
  const d = await dgPost("tournaments.aspx/TournamentsLST", body, qs);
  return (d.Records || []).find(r => String(r.code) === String(tcode)) || null;
}

async function tournSearchAll() {
  const PAGE = 100;
  // Dedupe por club_code/code — um torneio pode em teoria casar com mais do
  // que um termo (ex: "PJA Jovens ..."), mas só queremos uma entrada.
  const seen = new Map();
  for (const term of SEARCH_TERMS) {
    const first = await tournSearchPage(term, 0, PAGE);
    info(`"${term}" em ${YEAR}: ${first.total} total`);
    for (const r of first.records) seen.set(`${r.club_code}/${r.code}`, r);
    let offset = PAGE;
    while (offset < first.total) {
      await sleep(DELAY);
      const page = await tournSearchPage(term, offset, PAGE);
      for (const r of page.records) seen.set(`${r.club_code}/${r.code}`, r);
      offset += PAGE;
    }
    await sleep(DELAY);
  }
  // Defesa — servidor pode devolver fora do ano (rara mas barato proteger)
  return [...seen.values()].filter(r => getYear(r) === YEAR);
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
      const d = await dgPost("classif.aspx/ClassifLST", body, qs);
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
    const d = await dgPost("classif.aspx/ScoreCard", body, qs);
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
    const d = await dgPost("classifAgregate.aspx/ScoreCard", body, qs);
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

function parseTournament(raw) {
  const desc = raw.description || "";
  const cc = raw.club_code || "";
  const tc = raw.code || "";
  const dateStr = getDateStr(raw);

  let escalao = null;
  const escMatch = desc.match(/Sub\s*[- ]?\s*(\d+)/i);
  if (escMatch) escalao = `Sub ${escMatch[1]}`;

  // Sexo frequentemente vem no sufixo (" H" ou " S" ou " M" ou " F")
  let sex = null;
  if (/\s[HhMm]$/.test(desc)) sex = "M";
  else if (/\s[SsFf]$/.test(desc)) sex = "F";

  let num = null;
  const numMatch = desc.match(/^\s*(\d+)[ºª]/);
  if (numMatch) num = parseInt(numMatch[1]);

  return {
    name: desc, ccode: cc, tcode: tc, date: dateStr,
    campo: raw.course_description || "",
    clube: cc, series: "jovens",
    region: regionMap[cc] || "outro",
    escalao, sex, num,
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

// ═══════════════════════════════════════════════════════════
// PROCESSAR TORNEIO — fetch classif + scorecards
// ═══════════════════════════════════════════════════════════
async function processTournament(t, label) {
  const { records, error } = await fetchClassif(t.ccode, t.tcode, 1);
  if (error) {
    warn(`${label} ${t.name} → ERRO classif: ${error}`);
    return t;
  }
  if (records.length === 0) {
    info(`${label} ${t.name} → 0 jogadores (futuro?)`);
    return t;
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

  return t;
}

// ═══════════════════════════════════════════════════════════
// MERGE INCREMENTAL
// ═══════════════════════════════════════════════════════════
const tKey = t => `${t.ccode}/${t.tcode}`;

function loadExisting() {
  if (!fs.existsSync(OUTPUT_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
  } catch (e) {
    warn(`ficheiro existente corrompido, ignorar: ${e.message}`);
    return null;
  }
}

// Decidir se vale a pena re-fetch de um torneio já guardado.
// Política: se o torneio começou nos últimos REFETCH_DAYS dias, ou no futuro,
// re-fetch (pode ter inscrições novas / resultados a chegar). Caso contrário,
// saltar — já está settled.
function shouldRefetch(existing, apiRec, nowMs) {
  if (REFETCH_ALL) return true;
  const startMs = getMs(apiRec);
  const deltaDays = (nowMs - startMs) / (1000 * 60 * 60 * 24);
  if (deltaDays <= REFETCH_DAYS) return true;       // recente ou futuro
  if (!existing.players || existing.players.length === 0) return true; // incompleto
  return false;
}

// Para cada jogador no fetch novo, se já temos roundScores guardadas e o
// novo fetch não as tem, mantemos as antigas (defensivo contra falhas
// transitórias do endpoint de scorecard).
function mergePlayers(oldPlayers, newPlayers) {
  if (!oldPlayers || oldPlayers.length === 0) return newPlayers;
  const byScoreId = new Map(oldPlayers.map(p => [String(p.scoreId || ""), p]));
  return newPlayers.map(np => {
    const op = byScoreId.get(String(np.scoreId || ""));
    if (!op) return np;
    const merged = { ...np };
    // Preservar roundScores antigos se os novos estão vazios
    if ((!np.roundScores || np.roundScores.length === 0) && op.roundScores?.length > 0) {
      merged.roundScores = op.roundScores;
      merged.parTotal = op.parTotal ?? np.parTotal;
      merged.nholes = op.nholes ?? np.nholes;
      merged.course = op.course ?? np.course;
      merged.courseRating = op.courseRating ?? np.courseRating;
      merged.slope = op.slope ?? np.slope;
      merged.teeName = op.teeName ?? np.teeName;
      merged.teeColorId = op.teeColorId ?? np.teeColorId;
      merged.fedCode = op.fedCode ?? np.fedCode;
      merged.grossTotal = op.grossTotal ?? np.grossTotal;
      merged.toPar = op.toPar ?? np.toPar;
    }
    return merged;
  });
}

function countScorecards(tournaments) {
  let s = 0;
  for (const t of tournaments) for (const p of (t.players || [])) s += (p.roundScores?.length || 0);
  return s;
}
function countPlayers(tournaments) {
  return tournaments.reduce((s, t) => s + (t.playerCount || (t.players?.length || 0)), 0);
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
(async () => {
  log(`═══ Scrape Jovens — ${YEAR} ═══`);
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  info(`Output: ${OUTPUT_FILE.replace(REPO_ROOT, ".")}`);

  // Fase 0 — warmup: reactivar a sessão ASP.NET antes do primeiro POST.
  // Especialmente importante em GitHub Actions, onde podem passar 12+ horas
  // entre a captura dos cookies e o run agendado.
  await warmupEntryGate();

  const existing = loadExisting();
  const existingByKey = new Map((existing?.tournaments || []).map(t => [tKey(t), t]));
  if (existing) {
    info(`Ficheiro existente: ${existing.totalTournaments || 0}T / ${existing.totalPlayers || 0}J / ${existing.totalScorecards || 0}SC`);
  } else {
    info("Ficheiro ainda não existe — vai criar do zero");
  }

  // Fase 1 — descoberta
  log(`FASE 1: descobrir torneios (termos: ${SEARCH_TERMS.map(t => `"${t}"`).join(", ")})`);
  const apiRecords = await tournSearchAll();
  ok(`${apiRecords.length} torneios em ${YEAR} (após dedupe entre termos)`);

  // Fase 1b — juntar tcodes explícitos (--extra-tcodes) que a pesquisa "Jovens"
  // não encontrou. Cada entrada é resolvida via lookup directo por TournCode.
  if (EXTRA_TCODES.length > 0) {
    log(`FASE 1b: lookup de ${EXTRA_TCODES.length} tcode(s) extra`);
    const alreadyIn = new Set(apiRecords.map(r => `${r.club_code}/${r.code}`));
    for (const { ccode, tcode } of EXTRA_TCODES) {
      const key = `${ccode}/${tcode}`;
      if (alreadyIn.has(key)) { info(`  ${key} → já estava na pesquisa`); continue; }
      try {
        const rec = await tournLookupByCode(ccode, tcode);
        if (!rec) { warn(`  ${key} → não existe no servidor FPG`); continue; }
        apiRecords.push(rec);
        info(`  ${key} → "${rec.description}" (${getDateStr(rec)})`);
      } catch (e) {
        warn(`  ${key} → ERRO: ${e.message}`);
      }
      await sleep(DELAY);
    }
  }

  // SENTINELA ANTI-WIPE: se a API devolveu 0 resultados mas o ficheiro existente
  // tem torneios reais (não-sintéticos), isto é suspeito — provavelmente cookies
  // expirados, ou resposta vazia temporária. NUNCA escrever um ficheiro vazio
  // por cima de dados reais. Sai com exit 1 para o workflow falhar visivelmente.
  const existingRealCount = (existing?.tournaments || []).filter(t => !SYNTHETIC_TCODE(t.tcode)).length;
  if (apiRecords.length === 0 && existingRealCount > 0) {
    console.error(`${R}ABORTAR: API devolveu 0 torneios mas ficheiro tem ${existingRealCount} torneio(s) real(is).${X}`);
    console.error(`${R}Possíveis causas: cookies expirados, servidor em manutenção, filtro TournName demasiado estrito.${X}`);
    console.error(`${R}Se é intencional (ano sem torneios), apaga public/data/jovens_${YEAR}.json antes de correr.${X}`);
    process.exit(1);
  }

  if (apiRecords.length === 0 && (!existing || existing.tournaments.length === 0)) {
    // Criar ficheiro vazio se não existir ainda
    const empty = {
      lastUpdated: new Date().toISOString().slice(0, 10).split("-").reverse().join("/"),
      source: "scoring.datagolf.pt", circuit: "jovens", year: YEAR, searchTerm: SEARCH_TERMS.join(","),
      totalTournaments: 0, totalPlayers: 0, totalScorecards: 0, tournaments: [],
    };
    if (!existing) {
      writeAtomic(OUTPUT_FILE, JSON.stringify(empty, null, 2));
      ok(`Ficheiro vazio criado (nenhum torneio em ${YEAR} ainda)`);
      process.exit(0);
    }
    info(`Nenhum torneio na API; ficheiro existente mantém-se`);
    process.exit(2);
  }

  // Caso edge: API devolveu 0 mas existing só tinha torneios sintéticos (99xxx).
  // Os sintéticos são preservados sem tocar — saimos sem commit.
  if (apiRecords.length === 0 && existingRealCount === 0) {
    info(`Nenhum torneio real na API; ${existing.tournaments.length} sintético(s) preservado(s)`);
    process.exit(2);
  }

  // Fase 2 — processar torneios
  log("FASE 2: processar classificações + scorecards");
  const nowMs = Date.now();
  const mergedByKey = new Map(existingByKey); // começa com tudo o que já temos
  let processed = 0, skipped = 0, errors = 0;

  for (let i = 0; i < apiRecords.length; i++) {
    const raw = apiRecords[i];
    const t = parseTournament(raw);
    const key = tKey(t);
    const label = `[${i + 1}/${apiRecords.length}] ${key}`;
    const prev = existingByKey.get(key);

    // Proteger tcodes sintéticos (99xxx): convencionados para torneios que
    // não existem no scoring da FPG. Se a API por acaso devolver um desses
    // (improvável, mas defensivo), ignora e preserva a entrada manual.
    if (SYNTHETIC_TCODE(t.tcode)) {
      info(`${label} ${t.name} → skip (tcode sintético)`);
      skipped++;
      continue;
    }

    if (prev && !shouldRefetch(prev, raw, nowMs)) {
      info(`${label} ${t.name} → skip (já settled há > ${REFETCH_DAYS}d)`);
      skipped++;
      continue;
    }

    try {
      const updated = await processTournament(t, label);
      // Merge com versão anterior (preservar scorecards antigos se o novo falhou)
      if (prev) {
        updated.players = mergePlayers(prev.players, updated.players);
        updated.playerCount = updated.players.length;
      }
      mergedByKey.set(key, updated);
      processed++;
    } catch (e) {
      warn(`${label} ERRO: ${e.message}`);
      errors++;
    }
    await sleep(DELAY);
  }

  // Construir output final
  const merged = [...mergedByKey.values()].sort((a, b) => a.date.localeCompare(b.date));
  const now = new Date();
  const lastUpdated = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  const newData = {
    lastUpdated,
    source: "scoring.datagolf.pt",
    circuit: "jovens",
    year: YEAR,
    searchTerm: SEARCH_TERMS.join(","),
    totalTournaments: merged.length,
    totalPlayers: countPlayers(merged),
    totalScorecards: countScorecards(merged),
    tournaments: merged,
  };

  // ─── Comparar totais (ignorando lastUpdated) ──────────────
  console.log("");
  log("═══ RESUMO ═══");
  info(`Torneios processados: ${processed} | saltados: ${skipped} | erros: ${errors}`);
  const oT = existing
    ? { t: existing.totalTournaments || 0, p: existing.totalPlayers || 0, s: existing.totalScorecards || 0 }
    : { t: 0, p: 0, s: 0 };
  const nT = { t: newData.totalTournaments, p: newData.totalPlayers, s: newData.totalScorecards };
  info(`Antes:  ${oT.t}T / ${oT.p}J / ${oT.s}SC`);
  info(`Agora:  ${nT.t}T / ${nT.p}J / ${nT.s}SC`);

  const gainedInfo = (nT.t > oT.t) || (nT.p > oT.p) || (nT.s > oT.s);

  // Comparar JSON sem lastUpdated para decidir escrita
  const oldJson = existing ? JSON.stringify(existing, (k, v) => k === "lastUpdated" ? undefined : v, 2) : null;
  const newJson = JSON.stringify(newData, (k, v) => k === "lastUpdated" ? undefined : v, 2);

  if (oldJson === newJson) {
    console.log(`${Y}Nada mudou — sem commit${X}`);
    process.exit(2);
  }

  writeAtomic(OUTPUT_FILE, JSON.stringify(newData, null, 2));
  ok(`Escrito ${path.basename(OUTPUT_FILE)}`);

  if (!gainedInfo) {
    console.log(`${Y}Ficheiro modificado mas sem ganho de totais — sem commit${X}`);
    process.exit(2);
  }

  console.log(`${G}✓ Há mais dados — seguro fazer commit${X}`);
  process.exit(0);
})().catch(err => {
  if (err instanceof FpgHttpError && err.status === 500) {
    console.error("");
    console.error(`${R}═══ COOKIES EXPIRADOS (HTTP 500) ═══${X}`);
    console.error(`${R}Endpoint ${err.pathname} devolveu 500 após retries.${X}`);
    console.error(`${R}Causa canónica: cookies do scoring.datagolf.pt expirados.${X}`);
    console.error("");
    console.error(`${Y}Como refrescar:${X}`);
    console.error(`  1. Abrir Chrome 90 (ou Firefox com SameSite off)`);
    console.error(`  2. Navegar: https://scoring.datagolf.pt/pt/tournaments.aspx`);
    console.error(`  3. F12 → Application → Cookies → copiar ASP.NET_SessionId + DG_Lists_URL`);
    console.error(`  4. Actualizar GitHub Secret DATAGOLF_SCORING_COOKIES`);
    console.error(`     (e api/.scoring-datagolf-cookies.json se estás a correr local)`);
    console.error("");
    console.error(`${Y}NB: não se escreveu nada em disco — ficheiro existente preservado.${X}`);
    process.exit(1);
  }
  console.error(`${R}ERRO FATAL:${X} ${err.stack || err.message}`);
  process.exit(1);
});
