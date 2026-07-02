#!/usr/bin/env node
/**
 * probe-admissions-sources.js (v4 — 2026-04-22)
 * ═════════════════════════════════════════════════════════════════════════
 * Probe abrangente do padrão linkpage.aspx cross-domain + PageMethod POST.
 *
 * Cobre:
 *   [GET]  linkpage?page=admissions  → inscrições
 *   [GET]  linkpage?page=draw&round  → pairings/tee times (R1, R2, R3)
 *   [GET]  linkpage?page=classif     → página jTable (estrutura, sem dados)
 *   [POST] Classifications.aspx/GetClassifications → dados da classificação
 *
 * Em ambos os domínios gémeos (scoring.fpg.pt + scoring.datagolf.pt) com
 * cookies de cada domínio. Suporta múltiplos (ccode,tcode) por run.
 *
 * USAGE:
 *   node scripts/probe-admissions-sources.js                          # suite default
 *   node scripts/probe-admissions-sources.js --tcode 10941 --ccode 000
 *   node scripts/probe-admissions-sources.js --tcode 10825 --ccode 000 --raw
 *
 * SUITE DEFAULT (se nenhum --tcode for passado, corre os 3 casos):
 *   • 10941 ccode=000 — Sub-12 H Aroeira 2026 (FUTURO, 1-Mai, admissions activo)
 *   • 10223 ccode=982 — Drive Challenge Madeira Sub-12 (PASSADO 1 ronda, com draw)
 *   • 10825 ccode=000 — Campeonato Nacional Clubes Sub-14 (PASSADO 3 rondas, classif completa)
 * ═════════════════════════════════════════════════════════════════════════
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO, "tmp");

const args = process.argv.slice(2);
function argVal(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : def;
}
const SINGLE_TCODE = argVal("--tcode", null);
const SINGLE_CCODE = argVal("--ccode", null);
const DUMP_RAW = args.includes("--raw");

if (DUMP_RAW) fs.mkdirSync(OUT_DIR, { recursive: true });

/* ── Casos de teste ─────────────────────────────────────────────────────── */
const SUITE = SINGLE_TCODE
  ? [{ tcode: SINGLE_TCODE, ccode: SINGLE_CCODE || "000", label: "custom" }]
  : [
      { tcode: "10941", ccode: "000", label: "Sub-12 H Aroeira 2026 (futuro, admissions)" },
      { tcode: "10223", ccode: "982", label: "Drive Madeira Sub-12 (passado, 1 ronda)" },
      { tcode: "10825", ccode: "000", label: "Nac. Clubes Sub-14 (passado, 3 rondas)" },
    ];

/* ── Cookies ─────────────────────────────────────────────────────────────── */
function readCookieFile(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")).cookieHeader || ""; } catch { return ""; }
}
const cookieScoringFpg = readCookieFile(path.join(REPO, "api/.fpg-admissions-cookies.json"));
const cookieScoringDg  = readCookieFile(path.join(REPO, "api/.scoring-datagolf-cookies.json"));

console.log("Cookies (len): fpg=" + cookieScoringFpg.length + " · datagolf=" + cookieScoringDg.length);
console.log("Suite: " + SUITE.map(s => `[${s.label}] tcode=${s.tcode} ccode=${s.ccode}`).join(" | "));
console.log();

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const baseHeaders = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
};

/* ── Cookie jar ──────────────────────────────────────────────────────────── */
const jar = new Map();
function jarAbsorb(urlStr, setCookieList) {
  if (!setCookieList || setCookieList.length === 0) return 0;
  const host = new URL(urlStr).hostname;
  if (!jar.has(host)) jar.set(host, new Map());
  const m = jar.get(host);
  let added = 0;
  for (const raw of setCookieList) {
    const seg = raw.split(";")[0].trim();
    const eq = seg.indexOf("=");
    if (eq < 0) continue;
    const name = seg.slice(0, eq).trim();
    const value = seg.slice(eq + 1).trim();
    if (!m.has(name) || m.get(name) !== value) added++;
    m.set(name, value);
  }
  return added;
}
function jarToHeader(urlStr, baseCookieHeader = "") {
  const host = new URL(urlStr).hostname;
  const combined = new Map();
  if (baseCookieHeader) baseCookieHeader.split(";").forEach(p => {
    const seg = p.trim();
    const eq = seg.indexOf("=");
    if (eq > 0) combined.set(seg.slice(0, eq).trim(), seg.slice(eq + 1).trim());
  });
  const jarForHost = jar.get(host);
  if (jarForHost) for (const [k, v] of jarForHost) combined.set(k, v);
  return [...combined.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/* ── Heurística melhorada (regex /g, pesos, sinais distintivos pareados) ── */
function analyseHtml(html) {
  const tables = [];
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let m; let idx = 0;
  while ((m = tableRe.exec(html))) {
    const inner = m[1];
    const trCount = (inner.match(/<tr\b/gi) || []).length;
    const firstRowMatch = inner.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/i);
    let headers = [];
    if (firstRowMatch) {
      const cells = firstRowMatch[1].match(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
      headers = cells.map(c => c.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim().toLowerCase()).filter(Boolean);
    }
    tables.push({ idx, trCount, headerCount: headers.length, headers: headers.slice(0, 10) });
    idx++;
  }
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const formCount = (html.match(/<form\b/gi) || []).length;
  const iframes = (html.match(/<iframe\b[^>]*>/gi) || []).map(t => {
    const s = t.match(/src=["']([^"']+)["']/i); return s ? s[1] : null;
  }).filter(Boolean);
  const hasJTable = /jtable|hik-jtable/i.test(html);
  const hasGridView = /GridView/i.test(html);

  // Sinais distintivos por tipo (requer ≥2 sinais; reduz falsos positivos):
  const SIGNALS = {
    admissions: [/\bn.\s*fed/, /\bnome\b/, /\bclube\b/, /\bvac\b/, /\bhcp\b/, /\bregisto\b/],
    draw:       [/\btee\b/, /\bhora\b/, /\bburaco\b/, /\bpartida/, /\bgrupo\b/, /club\/equipa/],
    classif:    [/\bpos\b/, /\bposi[cç][aã]o\b/, /\bgross\b/, /\bnet\b/, /\btotal\b/, /\bthru\b/, /\br1\b/, /\br2\b/, /\br3\b/],
  };
  const scoreTable = (t) => {
    const joined = " " + t.headers.join(" | ") + " ";
    let best = { type: null, hits: 0 };
    for (const [type, sigs] of Object.entries(SIGNALS)) {
      let hits = 0;
      for (const rx of sigs) if (rx.test(joined)) hits++;
      if (hits > best.hits) best = { type, hits };
    }
    return best;
  };

  let dataTable = null, dataTableType = null, bestScore = 0;
  for (const t of tables) {
    const s = scoreTable(t);
    // Requer ≥2 sinais distintivos + pelo menos 2 linhas de dados
    if (s.hits >= 2 && t.trCount >= 2) {
      const score = s.hits * 100 + t.trCount;
      if (score > bestScore) { dataTable = t; dataTableType = s.type; bestScore = score; }
    }
  }
  // Fallback genérico: maior tabela não-header
  if (!dataTable) {
    const big = tables.filter(t => t.trCount >= 5).sort((a, b) => b.trCount - a.trCount)[0];
    if (big) { dataTable = big; dataTableType = "generic"; }
  }
  return {
    title: titleM ? titleM[1].replace(/<[^>]+>/g, "").trim().slice(0, 100) : "",
    tableCount: tables.length,
    tables: tables.slice(0, 5),
    dataTableRows: dataTable ? dataTable.trCount - 1 : 0,
    dataTableType,
    dataTableHeaders: dataTable ? dataTable.headers.slice(0, 8) : [],
    forms: formCount,
    iframes: iframes.slice(0, 3),
    hasJTable, hasGridView,
  };
}

/* ── GET probe ───────────────────────────────────────────────────────────── */
async function probeGet(p) {
  const hdrs = { ...baseHeaders };
  const cookieHeader = jarToHeader(p.url, p.cookie || "");
  if (cookieHeader) hdrs.Cookie = cookieHeader;
  if (p.referer) hdrs.Referer = p.referer;

  let res, txt;
  const t0 = Date.now();
  try {
    res = await fetch(p.url, { headers: hdrs, redirect: "follow" });
    txt = await res.text();
  } catch (e) {
    console.log(`    ❌ FETCH: ${e.cause?.code || e.message}`);
    return { status: "fetch-error", error: e.message };
  }
  const dt = Date.now() - t0;
  const setCookieList = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (setCookieList.length > 0) jarAbsorb(res.url, setCookieList);
  const paramErr = /Param_Errors|Err=999/.test(txt);
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  console.log(`    HTTP ${res.status}${res.redirected ? ` →(redir)` : ""} · ${dt}ms · ${txt.length}B`);
  if (paramErr) console.log("    ⚠ Param_Errors");

  if (DUMP_RAW) {
    const slug = p.name.replace(/[^a-z0-9]+/gi, "_").slice(0, 70);
    fs.writeFileSync(path.join(OUT_DIR, `probe-${slug}.html`), txt);
  }

  if (ct.includes("html") || /<html/i.test(txt.slice(0, 500))) {
    const a = analyseHtml(txt);
    if (a.title) console.log(`    <title>: ${a.title}`);
    const typeLabel = a.dataTableType ? ` type=${a.dataTableType}` : "";
    console.log(`    tabelas=${a.tableCount} jTable=${a.hasJTable} dataTableRows=${a.dataTableRows}${typeLabel}`);
    if (a.dataTableRows > 0) console.log(`    headers=[${a.dataTableHeaders.join(" | ")}]`);
    return { status: res.status, paramErr, type: "html", ...a, body: txt };
  }
  return { status: res.status, paramErr, type: "other" };
}

/* ── POST probe (para PageMethods tipo GetClassifications) ──────────────── */
async function probePost(p) {
  const hdrs = {
    ...baseHeaders,
    "Content-Type": "application/json; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Origin": p.origin || new URL(p.url).origin,
    "Referer": p.referer || p.url,
  };
  const cookieHeader = jarToHeader(p.url, p.cookie || "");
  if (cookieHeader) hdrs.Cookie = cookieHeader;

  let res, txt;
  const t0 = Date.now();
  try {
    res = await fetch(p.url, { method: "POST", headers: hdrs, body: JSON.stringify(p.body || {}) });
    txt = await res.text();
  } catch (e) {
    console.log(`    ❌ POST: ${e.cause?.code || e.message}`);
    return { status: "fetch-error", error: e.message };
  }
  const dt = Date.now() - t0;
  console.log(`    HTTP ${res.status} · ${dt}ms · ${txt.length}B`);

  if (DUMP_RAW) {
    const slug = p.name.replace(/[^a-z0-9]+/gi, "_").slice(0, 70);
    fs.writeFileSync(path.join(OUT_DIR, `probe-${slug}.json`), txt);
  }

  try {
    const j = JSON.parse(txt);
    const inner = j.d || j;
    const result = inner.Result;
    const total = inner.TotalRecordCount;
    const recCount = Array.isArray(inner.Records) ? inner.Records.length : null;
    console.log(`    Result=${result} · TotalRecordCount=${total} · Records.length=${recCount}`);
    if (Array.isArray(inner.Records) && inner.Records.length > 0) {
      const keys = Object.keys(inner.Records[0]).slice(0, 8);
      console.log(`    record keys: [${keys.join(", ")}]`);
    }
    return { status: res.status, type: "json", result, total, recCount, json: j };
  } catch {
    console.log(`    (não-JSON, 200 chars): ${txt.slice(0, 200).replace(/\s+/g, " ")}`);
    return { status: res.status, type: "non-json", preview: txt.slice(0, 400) };
  }
}

/* ── Ack tokens documentados ─────────────────────────────────────────────── */
const ACK_ADMISSIONS = "XH256YF450";
const ACK_DRAW_CLASSIF = "8428ACK987";

/* ── Run suite ───────────────────────────────────────────────────────────── */
async function runSuite() {
  const results = [];

  for (const { tcode, ccode, label } of SUITE) {
    console.log("█".repeat(80));
    console.log(`█ tcode=${tcode} ccode=${ccode} · ${label}`);
    console.log("█".repeat(80));

    const caseResults = { tcode, ccode, label, groups: {} };

    // ── ADMISSIONS ──
    console.log("\n📋 ADMISSIONS");
    for (const [dom, cookie] of [["fpg", cookieScoringFpg], ["datagolf", cookieScoringDg]]) {
      const hostPath = dom === "fpg" ? "scoring.fpg.pt/lists" : "scoring.datagolf.pt/pt";
      const url = `https://${hostPath}/linkpage.aspx?page=admissions&club=${ccode}&tourn=${tcode}&ack=${ACK_ADMISSIONS}`;
      const name = `admissions_${dom}_${tcode}`;
      console.log(`  [${dom}] ${name}`);
      const r = await probeGet({ url, cookie, referer: `https://${hostPath.split("/")[0]}/`, name });
      (caseResults.groups.admissions = caseResults.groups.admissions || {})[dom] = r;
    }

    // ── DRAW R1/R2/R3 ──
    console.log("\n📊 DRAW");
    for (const round of [1, 2, 3]) {
      for (const [dom, cookie] of [["fpg", cookieScoringFpg], ["datagolf", cookieScoringDg]]) {
        const hostPath = dom === "fpg" ? "scoring.fpg.pt/lists" : "scoring.datagolf.pt/pt";
        const url = `https://${hostPath}/linkpage.aspx?page=draw&club=${ccode}&tourn=${tcode}&round=${round}&ack=${ACK_DRAW_CLASSIF}`;
        const name = `draw_r${round}_${dom}_${tcode}`;
        console.log(`  [${dom}/r${round}] ${name}`);
        const r = await probeGet({ url, cookie, referer: `https://${hostPath.split("/")[0]}/`, name });
        const key = `draw_r${round}`;
        (caseResults.groups[key] = caseResults.groups[key] || {})[dom] = r;
      }
    }

    // ── CLASSIF (linkpage GET + POST ClassifLST) ──
    // Endpoint real descoberto 2026-04-22: /pt/classif.aspx/ClassifLST (minúsculo!)
    // NÃO Classifications.aspx/GetClassifications como o CLAUDE.md dizia.
    // Body com ~20 campos, jt* na query string + duplicados no body.
    console.log("\n🏆 CLASSIF — GET linkpage (warmup) + POST classif.aspx/ClassifLST");
    for (const [dom, cookie] of [["fpg", cookieScoringFpg], ["datagolf", cookieScoringDg]]) {
      const hostRoot = dom === "fpg" ? "scoring.fpg.pt" : "scoring.datagolf.pt";
      const hostPath = dom === "fpg" ? `${hostRoot}/lists` : `${hostRoot}/pt`;
      // 1. GET linkpage (warmup + carregar jTable shell)
      const getUrl = `https://${hostPath}/linkpage.aspx?page=classif&club=${ccode}&tourn=${tcode}&ack=${ACK_DRAW_CLASSIF}`;
      const nameGet = `classif_get_${dom}_${tcode}`;
      console.log(`  [${dom}] GET ${nameGet}`);
      const rGet = await probeGet({ url: getUrl, cookie, referer: `https://${hostRoot}/`, name: nameGet });
      (caseResults.groups.classif_get = caseResults.groups.classif_get || {})[dom] = rGet;

      if (rGet.paramErr) {
        console.log(`  [${dom}] POST classif SKIPPED (GET linkpage deu Param_Errors)`);
        continue;
      }

      // 2. POST classif.aspx/ClassifLST
      const jtQs = "jtStartIndex=0&jtPageSize=100&jtSorting=" + encodeURIComponent("score_id DESC");
      const postUrl = `https://${hostPath}/classif.aspx/ClassifLST?${jtQs}`;
      const namePost = `classif_post_${dom}_${tcode}`;
      // Body completo (todos os filtros em default abertos)
      const classifBody = {
        Classi: "1",
        tclub: String(ccode),
        tcode: String(tcode),
        classiforder: "1",
        classiftype: "I",
        classifroundtype: "D",
        scoringtype: "1",
        round: "1",
        members: "0",
        playertypes: "0",
        gender: "0",
        minagemen: "0", maxagemen: "999",
        minageladies: "0", maxageladies: "999",
        minhcp: "-8", maxhcp: "99",
        idfilter: "-1",
        jtStartIndex: "0",
        jtPageSize: "100",
        jtSorting: "score_id DESC",
      };
      console.log(`  [${dom}] POST ${namePost}`);
      const rPost = await probePost({
        url: postUrl,
        cookie,
        origin: `https://${hostRoot}`,
        referer: `https://${hostPath}/Classifications.aspx?ccode=${ccode}&tcode=${tcode}`,
        body: classifBody,
        name: namePost,
      });
      (caseResults.groups.classif_post = caseResults.groups.classif_post || {})[dom] = rPost;
    }

    results.push(caseResults);
    console.log();
  }

  /* ── Matriz resumo ──────────────────────────────────────────────────────── */
  console.log("█".repeat(80));
  console.log("█ MATRIZ RESUMO");
  console.log("█".repeat(80));

  for (const c of results) {
    console.log(`\n▶ tcode=${c.tcode} ccode=${c.ccode} [${c.label}]`);
    const rows = [];
    const put = (page, fpg, dg) => rows.push({ page, fpg, dg });

    const adm = c.groups.admissions || {};
    put("admissions", fmt(adm.fpg), fmt(adm.datagolf));
    for (const r of [1, 2, 3]) {
      const d = c.groups[`draw_r${r}`] || {};
      put(`draw r${r}`, fmt(d.fpg), fmt(d.datagolf));
    }
    const cGet = c.groups.classif_get || {};
    put("classif GET (shell)", fmt(cGet.fpg), fmt(cGet.datagolf));
    const cPost = c.groups.classif_post || {};
    put("classif POST (data)", fmtPost(cPost.fpg), fmtPost(cPost.datagolf));

    console.log("  page                        │ scoring.fpg.pt         │ scoring.datagolf.pt");
    console.log("  " + "─".repeat(80));
    for (const r of rows) {
      console.log(`  ${r.page.padEnd(28)}│ ${r.fpg.padEnd(23)}│ ${r.dg.padEnd(23)}`);
    }

    // Diff check: fpg vs datagolf dataTableRows
    const divergent = [];
    for (const [page, g] of Object.entries(c.groups)) {
      if (!g.fpg || !g.datagolf) continue;
      const a = g.fpg.dataTableRows ?? g.fpg.recCount ?? 0;
      const b = g.datagolf.dataTableRows ?? g.datagolf.recCount ?? 0;
      if (a !== b) divergent.push(`${page}: fpg=${a} ≠ dg=${b}`);
    }
    if (divergent.length === 0) {
      console.log("  ✓ fpg e datagolf concordam em todos os contagens");
    } else {
      console.log("  ⚠ Divergências: " + divergent.join(", "));
    }
  }

  console.log();
  console.log("Legenda:");
  console.log("  N (type)     → GET devolveu tabela com N linhas, tipo detectado pela heurística");
  console.log("  PE           → Param_Errors (página rejeita request)");
  console.log("  vazio        → resposta 200 mas sem tabela de dados (ex: torneio sem draw publicado)");
  console.log("  POST ok/N    → PageMethod devolveu Result:'OK' + N registos");
}

function fmt(r) {
  if (!r) return "—";
  if (r.paramErr) return "PE";
  if (r.error) return "ERR";
  if (r.dataTableRows > 0) return `${r.dataTableRows} (${r.dataTableType || "?"})`;
  if (r.status === 200) return "200 vazio";
  return String(r.status);
}
function fmtPost(r) {
  if (!r) return "— (skip)";
  if (r.error) return "ERR";
  if (r.result === "OK") return `POST ok ${r.recCount ?? "?"}/${r.total ?? "?"}`;
  if (r.status !== 200) return `HTTP ${r.status}`;
  return `POST ${r.result || "???"}`;
}

runSuite().catch(e => { console.error(e); process.exit(1); });
