#!/usr/bin/env node
/**
 * santo-da-serra-tournaments.js
 *
 * Descobre torneios do CGSS Santo da Serra (ccode=007): próximos, a decorrer e passados.
 * Para torneios futuros/a decorrer, consulta o estado das inscrições.
 *
 * Endpoints:
 *   1. POST scoring.datagolf.pt/pt/tournaments.aspx/TournamentsLST (ClubCode="007")
 *      → lista de torneios organizados pelo SDS
 *   2. GET  scoring.fpg.pt/lists/tournAdmissions.aspx?ccode=007&tcode=X
 *      → estado das inscrições (status + contagem + jogadores)
 *   3. [opcional --test-acks] GET scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=007&tourn=X&ack=Y
 *      → compara 3 acks (universal admissions, universal classif, específico do link)
 *
 * Cookies necessários:
 *   - api/.scoring-datagolf-cookies.json   (ou env DATAGOLF_SCORING_COOKIES)
 *   - api/.fpg-admissions-cookies.json     (ou env FPG_ADMISSIONS_COOKIES)
 *
 * Uso:
 *   node scripts/santo-da-serra-tournaments.js                       # últimos 12 meses + futuros
 *   node scripts/santo-da-serra-tournaments.js --months-back 24      # últimos 24 meses + futuros
 *   node scripts/santo-da-serra-tournaments.js --all-years           # sem limite temporal
 *   node scripts/santo-da-serra-tournaments.js --no-admissions       # só lista, sem consultar inscrições
 *   node scripts/santo-da-serra-tournaments.js --test-acks           # compara acks num torneio sample
 *   node scripts/santo-da-serra-tournaments.js --verbose             # imprime campos completos do primeiro record
 *   node scripts/santo-da-serra-tournaments.js --no-json             # não escreve public/data/santo-da-serra-tournaments.json
 *   node scripts/santo-da-serra-tournaments.js --ccode 988           # outro clube (default 007)
 *
 * Output: consola + public/data/santo-da-serra-tournaments.json
 *
 * Exit codes:
 *   0 → sucesso
 *   1 → erro (cookies em falta, HTTP falha, etc.)
 */

"use strict";
const fs   = require("fs");
const path = require("path");
const { parseAdmissions } = require("./fpg-admissions-draw-parser.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const UA = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36";

// ─── CLI ───
const argv = process.argv.slice(2);
const hasFlag = f => argv.includes(f);
const getArg = (f, def) => {
  const i = argv.indexOf(f);
  return (i < 0) ? def : (argv[i + 1] || def);
};

const CCODE        = String(getArg("--ccode", "007")).padStart(3, "0");
const CLUB_NAME    = CCODE === "007" ? "CGSS Santo da Serra" : `Clube ${CCODE}`;
const MONTHS_BACK  = hasFlag("--all-years") ? 9999 : Number(getArg("--months-back", 12));
const NO_ADM       = hasFlag("--no-admissions");
const TEST_ACKS    = hasFlag("--test-acks");
const VERBOSE      = hasFlag("--verbose") || hasFlag("-v");
const NO_JSON      = hasFlag("--no-json");
const OUT_PATH     = getArg("--out", path.join(REPO_ROOT, "public", "data", "santo-da-serra-tournaments.json"));

// Acks documentados no CLAUDE.md + o ack específico que o user forneceu
const ACKS = {
  "admissions-universal": "XH256YF450", // universal p/ page=admissions
  "classif-universal":    "8428ACK987", // universal p/ page=classif, page=draw
  "link-fornecido":       "1FNPJLI3J1", // ack do link https://scoring-pt.datagolf.pt/scripts/classif.asp?tourn=11004&club=007&ack=1FNPJLI3J1
};

// ─── Cores ───
const G="\x1b[32m", R="\x1b[31m", Y="\x1b[33m", C="\x1b[36m", M="\x1b[35m", B="\x1b[34m", D="\x1b[90m", X="\x1b[0m";
const log  = m => console.log(`${C}[SDS]${X} ${m}`);
const ok   = m => console.log(`${G}[SDS] ✓${X} ${m}`);
const warn = m => console.log(`${Y}[SDS] ⚠${X} ${m}`);
const err  = m => console.log(`${R}[SDS] ✗${X} ${m}`);

// ═══════════════════════════════════════════════════════════
// COOKIES
// ═══════════════════════════════════════════════════════════
function loadScoringCookies() {
  if (process.env.DATAGOLF_SCORING_COOKIES) {
    return { cookie: process.env.DATAGOLF_SCORING_COOKIES, source: "env DATAGOLF_SCORING_COOKIES" };
  }
  const fp = path.join(REPO_ROOT, "api", ".scoring-datagolf-cookies.json");
  if (fs.existsSync(fp)) {
    const j = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (j.cookieHeader) return { cookie: j.cookieHeader, source: "api/.scoring-datagolf-cookies.json" };
  }
  return null;
}

function loadAdmissionsCookies() {
  if (process.env.FPG_ADMISSIONS_COOKIES) {
    return { cookie: process.env.FPG_ADMISSIONS_COOKIES, source: "env FPG_ADMISSIONS_COOKIES" };
  }
  const fp = path.join(REPO_ROOT, "api", ".fpg-admissions-cookies.json");
  if (fs.existsSync(fp)) {
    const j = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (j.cookieHeader) return { cookie: j.cookieHeader, source: "api/.fpg-admissions-cookies.json" };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// FASE 1 — LISTA DE TORNEIOS
// ═══════════════════════════════════════════════════════════
async function fetchTournamentsPage(clubCode, startIndex, cookie) {
  const qs = `jtStartIndex=${startIndex}&jtPageSize=50&jtSorting=${encodeURIComponent("started_at DESC")}`;
  const body = {
    ClubCode: String(clubCode),
    dtIni: "", dtFim: "", CourseName: "", TournCode: "", TournName: "",
    jtStartIndex: String(startIndex), jtPageSize: "50", jtSorting: "started_at DESC",
  };
  const r = await fetch(`https://scoring.datagolf.pt/pt/tournaments.aspx/TournamentsLST?${qs}`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Origin": "https://scoring.datagolf.pt",
      "Referer": "https://scoring.datagolf.pt/pt/tournaments.aspx",
      "Cookie": cookie,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} em TournamentsLST`);
  const j = await r.json();
  const d = j.d || {};
  if (d.Result !== "OK") throw new Error(`TournamentsLST erro: ${d.Message || JSON.stringify(j).slice(0, 200)}`);
  return { records: d.Records || [], total: d.TotalRecordCount || 0 };
}

async function fetchAllTournaments(clubCode, cookie) {
  const all = [];
  let startIndex = 0;
  let total = null;
  while (true) {
    const page = await fetchTournamentsPage(clubCode, startIndex, cookie);
    all.push(...page.records);
    total ??= page.total;
    if (page.records.length === 0 || all.length >= total) break;
    startIndex += 50;
    await sleep(120);
  }
  return { records: all, total: total ?? all.length };
}

// ═══════════════════════════════════════════════════════════
// PARSE / CLASSIFICAÇÃO
// ═══════════════════════════════════════════════════════════
function parseMsDate(s) {
  if (!s) return null;
  const m = String(s).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0]);
  if (!n) return null;
  return new Date(n);
}

function ymd(d) { return d ? d.toISOString().slice(0, 10) : null; }

function classify(d) {
  if (!d) return { status: "unknown", diffDays: null };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tDay = new Date(d); tDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((tDay - today) / 86400000);
  if (diffDays < -1) return { status: "past",     diffDays };
  if (diffDays >= -1 && diffDays <= 1) return { status: "ongoing", diffDays };
  return { status: "upcoming", diffDays };
}

// ═══════════════════════════════════════════════════════════
// FASE 2 — ADMISSIONS (tournAdmissions.aspx directo, como /api/inscricoes)
// ═══════════════════════════════════════════════════════════
async function fetchAdmissionsHTML(ccode, tcode, cookie) {
  const url = `https://scoring.fpg.pt/lists/tournAdmissions.aspx?ccode=${ccode}&tcode=${tcode}`;
  const headers = {
    "User-Agent":                UA,
    "Accept":                    "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language":           "pt-PT,pt;q=0.9",
    "Upgrade-Insecure-Requests": "1",
    "Referer":                   "https://scoring.fpg.pt/lists/tournaments.aspx",
  };
  if (cookie) headers["Cookie"] = cookie;
  try {
    const r = await fetch(url, { headers, redirect: "follow" });
    const html = await r.text();
    if (!r.ok) return { ok: false, status: r.status, html, reason: `HTTP ${r.status}` };
    if (/Param_Errors|Err=999|Err=998/.test(html)) {
      return { ok: false, status: r.status, html, reason: "Param_Errors (cookies inválidos ou expirados)" };
    }
    return { ok: true, status: r.status, html };
  } catch (e) {
    return { ok: false, status: 0, reason: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// FASE 3 — ADMISSIONS via linkpage (para teste de acks)
// ═══════════════════════════════════════════════════════════
async function fetchAdmissionsViaLinkpage(ccode, tcode, ack, cookie) {
  const url = `https://scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=${ccode}&tourn=${tcode}&ack=${ack}`;
  const headers = {
    "User-Agent":                UA,
    "Accept":                    "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language":           "pt-PT,pt;q=0.9",
    "Upgrade-Insecure-Requests": "1",
  };
  if (cookie) headers["Cookie"] = cookie;
  try {
    const r = await fetch(url, { headers, redirect: "follow" });
    const html = await r.text();
    const finalUrl = r.url || url;
    if (!r.ok) return { ok: false, status: r.status, html, finalUrl, reason: `HTTP ${r.status}` };
    if (/Param_Errors|Err=999|Err=998/.test(html)) {
      return { ok: false, status: r.status, html, finalUrl, reason: "Param_Errors" };
    }
    return { ok: true, status: r.status, html, finalUrl };
  } catch (e) {
    return { ok: false, status: 0, reason: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════
const sleep = ms => new Promise(r => setTimeout(r, ms));

function printTournamentRow(t) {
  const estado = (t.admissionsStatus || "—").padEnd(22).slice(0, 22);
  const insc = t.totalInscritos != null
    ? `${t.totalInscritos}${t.reservas ? "+" + t.reservas : ""}`
    : "—";
  const d = (t.date || "?").padEnd(10);
  const tc = String(t.tcode || "?").padEnd(6);
  const nm = (t.name || "").padEnd(58).slice(0, 58);
  const campo = (t.campo || "").slice(0, 22).padEnd(22);
  console.log(`  ${d} ${tc} ${nm} ${campo}  ${estado}  ${insc}`);
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
(async () => {
  const title = `Torneios de ${CLUB_NAME} (ccode=${CCODE})`;
  log(`═══ ${title} ═══`);
  log(`Âmbito temporal: ${MONTHS_BACK >= 9999 ? "sem limite (todos os anos)" : `últimos ${MONTHS_BACK} meses + futuros`}`);

  // ── Cookies ──
  const scor = loadScoringCookies();
  if (!scor) {
    err("Sem cookies para scoring.datagolf.pt. Actualiza api/.scoring-datagolf-cookies.json.");
    process.exit(1);
  }
  log(`Cookies TournamentsLST: ${scor.source}`);

  const adm = loadAdmissionsCookies();
  if (NO_ADM) {
    log("Admissions: desactivado (--no-admissions)");
  } else if (adm) {
    log(`Cookies admissions:      ${adm.source}`);
  } else {
    warn("Sem cookies admissions — vai tentar sem (pode devolver Param_Errors)");
  }

  // ── Fase 1 ──
  log("");
  log("FASE 1: procurar torneios via TournamentsLST...");
  let records, total;
  try {
    const res = await fetchAllTournaments(CCODE, scor.cookie);
    records = res.records;
    total = res.total;
  } catch (e) {
    // Fallback: sem filtro de clube + filtrar localmente
    warn(`TournamentsLST com ClubCode=${CCODE} falhou: ${e.message}`);
    warn("A tentar fallback com ClubCode='0' + filtro client-side...");
    try {
      const res = await fetchAllTournaments("0", scor.cookie);
      const filtered = res.records.filter(r => String(r.club_code || "").padStart(3, "0") === CCODE);
      records = filtered;
      total   = res.total;
      ok(`Fallback: ${res.records.length} total → ${filtered.length} filtrados por club_code=${CCODE}`);
    } catch (e2) {
      err(`Fallback falhou também: ${e2.message}`);
      process.exit(1);
    }
  }
  ok(`${records.length} torneios devolvidos (total no endpoint: ${total})`);

  if (VERBOSE && records[0]) {
    log("Campos do primeiro record: " + Object.keys(records[0]).join(", "));
    log("Exemplo completo:");
    console.log(JSON.stringify(records[0], null, 2).split("\n").map(l => "   " + l).join("\n"));
  }

  // ── Filtro âmbito temporal ──
  const cutoff = MONTHS_BACK >= 9999 ? null
    : new Date(new Date().getFullYear(), new Date().getMonth() - MONTHS_BACK, 1);
  const sds = records
    .filter(r => String(r.club_code || "").padStart(3, "0") === CCODE) // sanity
    .filter(r => {
      if (!cutoff) return true;
      const d = parseMsDate(r.started_at);
      return d && d >= cutoff;
    });
  if (sds.length !== records.length) {
    log(`Após filtro temporal: ${sds.length} torneios`);
  }

  // ── Enriquecer ──
  const out = sds.map(r => {
    const d = parseMsDate(r.started_at);
    const c = classify(d);
    return {
      tcode: String(r.code || ""),
      ccode: String(r.club_code || "").padStart(3, "0"),
      name:  r.description || "",
      date:  ymd(d),
      campo: r.course_description || null,
      acronym: r.acronym || null,
      rounds:  r.rounds ?? null,
      classif: c.status,
      diffDays: c.diffDays,
      admissionsStatus: null,
      totalInscritos:   null,
      reservas:         null,
      admissionsLink:   `https://scoring.fpg.pt/lists/tournAdmissions.aspx?ccode=${String(r.club_code || "").padStart(3,"0")}&tcode=${r.code}`,
      classifLink:      `https://scoring.fpg.pt/lists/linkpage.aspx?page=classif&club=${String(r.club_code || "").padStart(3,"0")}&tourn=${r.code}&ack=${ACKS["classif-universal"]}`,
      _raw: VERBOSE ? r : undefined,
    };
  });

  // ordenar por data (ascendente — antigos primeiro, futuros no fim)
  out.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  // ── Fase 2 — admissions ──
  if (!NO_ADM) {
    log("");
    log("FASE 2: obter estado das inscrições (só upcoming + ongoing)...");
    const upcoming = out.filter(t => t.classif === "upcoming" || t.classif === "ongoing");
    log(`  ${upcoming.length} torneios a consultar`);
    for (const t of upcoming) {
      const res = await fetchAdmissionsHTML(t.ccode, t.tcode, adm?.cookie);
      if (!res.ok) {
        t.admissionsStatus = `Erro: ${res.reason}`;
        warn(`  ${t.tcode.padEnd(6)} ${t.name.slice(0,50)} → ${res.reason}`);
        await sleep(150);
        continue;
      }
      const parsed = parseAdmissions(res.html);
      t.admissionsStatus = parsed.status || (parsed.totalInscritos != null ? "—" : "sem status");
      t.totalInscritos   = parsed.totalInscritos;
      t.reservas         = parsed.reservas;
      ok(`  ${t.tcode.padEnd(6)} ${t.name.slice(0,50).padEnd(50)} → ${parsed.status || "—"} (${parsed.totalInscritos}${parsed.reservas ? "+" + parsed.reservas : ""} inscritos)`);
      await sleep(200);
    }
  }

  // ── Fase 3 — test acks (opcional) ──
  if (TEST_ACKS) {
    log("");
    log("FASE 3: comparar acks num torneio sample...");
    const sample = out.find(t => t.classif === "upcoming") ||
                   out.find(t => t.classif === "ongoing")  ||
                   out[out.length - 1]; // fallback: último (possivelmente passado recente)
    if (!sample) {
      warn("Sem torneios para teste de acks");
    } else {
      log(`  Sample: ccode=${sample.ccode} tcode=${sample.tcode} — "${sample.name}"`);
      for (const [label, ack] of Object.entries(ACKS)) {
        const res = await fetchAdmissionsViaLinkpage(sample.ccode, sample.tcode, ack, adm?.cookie);
        if (!res.ok) {
          warn(`    ack ${label.padEnd(22)} (${ack}) → ${res.reason}`);
          continue;
        }
        const p = parseAdmissions(res.html);
        const bytes = (res.html || "").length;
        ok(`    ack ${label.padEnd(22)} (${ack}) → HTTP ${res.status}, ${bytes}B, status="${p.status || "?"}", ${p.totalInscritos}+${p.reservas} inscritos, ${p.players.length} parsed`);
        if (res.finalUrl !== `https://scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=${sample.ccode}&tourn=${sample.tcode}&ack=${ack}`) {
          console.log(`      → redireccionou para ${D}${res.finalUrl}${X}`);
        }
        await sleep(250);
      }
    }
  }

  // ── Imprimir tabela ──
  const byStatus = { ongoing: [], upcoming: [], past: [], unknown: [] };
  for (const t of out) byStatus[t.classif].push(t);

  console.log("");
  console.log(C + "═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════" + X);
  console.log(C + title + X);
  console.log(C + "═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════" + X);
  console.log(D + "  Data       Tcode  Nome" + " ".repeat(58 - 4) + "Campo" + " ".repeat(22 - 5) + "  Status inscrições        Inscritos" + X);
  console.log(D + "  ──────────  ──────  " + "─".repeat(58) + " " + "─".repeat(22) + "  ──────────────────────  ─────────" + X);

  if (byStatus.ongoing.length) {
    console.log(`\n${M}● A DECORRER (${byStatus.ongoing.length})${X}`);
    for (const t of byStatus.ongoing) printTournamentRow(t);
  }
  if (byStatus.upcoming.length) {
    console.log(`\n${G}○ PRÓXIMOS (${byStatus.upcoming.length})${X}`);
    for (const t of byStatus.upcoming) printTournamentRow(t);
  }
  if (byStatus.past.length) {
    console.log(`\n${Y}✓ PASSADOS (${byStatus.past.length})${X}`);
    for (const t of byStatus.past) printTournamentRow(t);
  }
  if (byStatus.unknown.length) {
    console.log(`\n${R}? SEM DATA (${byStatus.unknown.length})${X}`);
    for (const t of byStatus.unknown) printTournamentRow(t);
  }

  // ── JSON ──
  if (!NO_JSON) {
    const payload = {
      generated: new Date().toISOString(),
      source: "scoring.datagolf.pt/pt/tournaments.aspx/TournamentsLST + scoring.fpg.pt/lists/tournAdmissions.aspx",
      clubCode: CCODE,
      clubName: CLUB_NAME,
      scope: {
        monthsBack: MONTHS_BACK >= 9999 ? null : MONTHS_BACK,
        allYears: MONTHS_BACK >= 9999,
      },
      counts: {
        total: out.length,
        ongoing: byStatus.ongoing.length,
        upcoming: byStatus.upcoming.length,
        past: byStatus.past.length,
        unknown: byStatus.unknown.length,
      },
      tournaments: out.map(t => { const { _raw, ...rest } = t; return rest; }),
    };
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
    console.log("");
    log(`JSON → ${path.relative(REPO_ROOT, OUT_PATH)}`);
  }

  // Resumo
  console.log("");
  log(`═══ RESUMO ═══`);
  log(`${out.length} torneios  │  ${byStatus.upcoming.length} próximos  │  ${byStatus.ongoing.length} a decorrer  │  ${byStatus.past.length} passados  │  ${byStatus.unknown.length} s/data`);

  process.exit(0);
})().catch(e => {
  err("FATAL: " + (e.stack || e.message));
  process.exit(1);
});
