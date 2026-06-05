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
    allowed.add(d.toISOString().slice(0, 7));
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
function loadCookies() {
  if (process.env.DATAGOLF_SCORING_COOKIES) {
    log("cookies de env DATAGOLF_SCORING_COOKIES");
    return process.env.DATAGOLF_SCORING_COOKIES;
  }
  const fp = path.join(REPO_ROOT, "api", ".scoring-datagolf-cookies.json");
  if (fs.existsSync(fp)) {
    const j = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (j.cookieHeader) {
      log(`cookies de ${fp.replace(REPO_ROOT, ".")}`);
      return j.cookieHeader;
    }
  }
  console.error(`${R}ERRO: nenhum cookie configurado. Define DATAGOLF_SCORING_COOKIES ou cria api/.scoring-datagolf-cookies.json${X}`);
  process.exit(1);
}

const COOKIE = loadCookies();

// ═══════════════════════════════════════════════════════════
// FETCH WRAPPER
// ═══════════════════════════════════════════════════════════
async function dgPost(pathname, bodyObj, queryString = "") {
  const url = `${BASE_URL}/${pathname}${queryString ? "?" + queryString : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Origin": "https://scoring.datagolf.pt",
      "Referer": `${BASE_URL}/tournaments.aspx`,
      "User-Agent": UA,
      "Cookie": COOKIE,
    },
    body: JSON.stringify(bodyObj),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${pathname}`);
  const json = await res.json();
  const d = json.d || json;
  if (d.Result === "ERROR") throw new Error(`FPG erro: ${d.Message || "unknown"}`);
  return d;
}

// ═══════════════════════════════════════════════════════════
// FASE 1 — DESCOBRIR TORNEIOS (drive + aquapor)
// ═══════════════════════════════════════════════════════════
const regionMap = { "982": "madeira", "983": "acores", "985": "tejo", "987": "norte", "988": "sul", "000": "nacional" };
const getYear = r => {
  const ms = parseInt((r.started_at || "").match(/\d+/)?.[0] || "0");
  return new Date(ms).getFullYear();
};
const getMonthKey = r => {
  const ms = parseInt((r.started_at || "").match(/\d+/)?.[0] || "0");
  return new Date(ms).toISOString().slice(0, 7);
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
  const d = await dgPost("tournaments.aspx/TournamentsLST", body, qs);
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

function parseTournament(raw, circuit) {
  const desc = raw.description || "";
  const cc = raw.club_code || "";
  const tc = raw.code || "";
  const dateMs = parseInt((raw.started_at || "").match(/\d+/)?.[0] || "0");
  const dateStr = new Date(dateMs).toISOString().split("T")[0];

  let series = circuit === "aquapor" ? "aquapor" : "tour";
  if (/challenge/i.test(desc)) series = "challenge";

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
})().catch(err => {
  console.error(`${R}ERRO FATAL:${X} ${err.stack || err.message}`);
  process.exit(1);
});
