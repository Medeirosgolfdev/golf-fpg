#!/usr/bin/env node
/**
 * fpg-calendario.js
 *
 * Descobre torneios FPG via site público competicoes.fpg.pt (WordPress + plugin
 * "The Events Calendar"). Ao contrário de TournamentsLST (scoring.datagolf.pt),
 * este site expõe torneios FUTUROS com inscrições abertas.
 *
 * Fonte: GET /wp-json/tribe/events/v1/events  (sem cookies, totalmente público)
 *
 * Fluxo:
 *   1. Paginar pela API até obter todos os eventos (filtro start_date = hoje).
 *   2. Filtrar client-side por --search, --category, ou --regex no título.
 *   3. Para cada evento filtrado, fetch do HTML e extrair cada
 *      linkpage.aspx?page=admissions&club={ccode}&tourn={tcode}&ack={ack}
 *      → dá-nos (ccode, tcode, ack) de cada escalão.
 *   4. (opcional, --admissions) chamar tournAdmissions para contagem de inscritos
 *      e status (usa cookies scoring.fpg.pt se existirem).
 *   5. Output: tabela na consola + JSON em public/data/fpg-calendario-{filtro}.json.
 *
 * Uso típico:
 *   # próximos torneios em Santo da Serra (default — até fim do ano corrente)
 *   node scripts/fpg-calendario.js
 *
 *   # procurar por outro termo
 *   node scripts/fpg-calendario.js --search "Porto Santo"
 *   node scripts/fpg-calendario.js --search "Madeira"
 *
 *   # filtrar por categoria WP
 *   node scripts/fpg-calendario.js --category drive-tour
 *   node scripts/fpg-calendario.js --category campeonatos-nacionais
 *
 *   # filtrar por ccode (região nos URLs FPG)
 *   node scripts/fpg-calendario.js --ccode 982         # Madeira
 *   node scripts/fpg-calendario.js --ccode 988         # Sul
 *   node scripts/fpg-calendario.js --ccode 000         # Nacional
 *
 *   # janela temporal (default: hoje → 31-Dez do ano corrente)
 *   node scripts/fpg-calendario.js --from 2026-04-17 --to 2026-12-31
 *   node scripts/fpg-calendario.js --months-ahead 3
 *
 *   # chamar admissions para ter contagem de inscritos (mais lento)
 *   node scripts/fpg-calendario.js --admissions
 *
 *   # sem filtro (todos os torneios futuros)
 *   node scripts/fpg-calendario.js --all
 *
 * Exit codes:
 *   0 → sucesso
 *   1 → erro (rede, parse)
 */

"use strict";
const fs   = require("fs");
const path = require("path");
const { parseAdmissions } = require("./fpg-admissions-draw-parser.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const API_BASE  = "https://competicoes.fpg.pt/wp-json/tribe/events/v1/events";
const UA        = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36 (fpg-calendario)";

// ─── CLI ───
const argv = process.argv.slice(2);
const hasFlag = f => argv.includes(f);
const getArg  = (f, def) => { const i = argv.indexOf(f); return (i < 0) ? def : (argv[i + 1] || def); };

const SEARCH        = argv.includes("--all") ? "" : getArg("--search", "Santo da Serra");
const CATEGORY      = getArg("--category", "");    // slug WP, ex: drive-tour
const CCODE_FILTER  = getArg("--ccode", "");       // ex: 982 → filtra após extrair
const REGEX_FILTER  = getArg("--regex", "");       // regex aplicado ao título
const MONTHS_AHEAD  = Number(getArg("--months-ahead", 0));
const DATE_FROM     = getArg("--from", "");        // YYYY-MM-DD
const DATE_TO       = getArg("--to", "");          // YYYY-MM-DD
const FETCH_ADM     = hasFlag("--admissions");
const NO_JSON       = hasFlag("--no-json");
const VERBOSE       = hasFlag("--verbose") || hasFlag("-v");
const LIMIT         = Number(getArg("--limit", 0)); // corta após N páginas (debug)
const OUT_PATH      = getArg("--out", "");

// ─── Janela temporal ───
function todayISO() { return new Date().toISOString().slice(0, 10); }
function plusMonthsISO(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
const START = DATE_FROM || todayISO();
const END   = DATE_TO   || (MONTHS_AHEAD > 0
  ? plusMonthsISO(MONTHS_AHEAD)
  : `${new Date().getFullYear()}-12-31`);

// ─── Cores ───
const G="\x1b[32m", R="\x1b[31m", Y="\x1b[33m", C="\x1b[36m", M="\x1b[35m", B="\x1b[34m", D="\x1b[90m", X="\x1b[0m";
const log  = m => console.log(`${C}[fpg-cal]${X} ${m}`);
const ok   = m => console.log(`${G}[fpg-cal] ✓${X} ${m}`);
const warn = m => console.log(`${Y}[fpg-cal] ⚠${X} ${m}`);
const errf = m => console.log(`${R}[fpg-cal] ✗${X} ${m}`);

// ═══════════════════════════════════════════════════════════
// COOKIES (só para --admissions)
// ═══════════════════════════════════════════════════════════
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
// FASE 1 — LISTAR EVENTOS via API The Events Calendar
// ═══════════════════════════════════════════════════════════
async function fetchEventsPage(page) {
  const qp = new URLSearchParams({
    per_page:   "50",
    page:       String(page),
    start_date: START,
    end_date:   END,
    status:     "publish",
  });
  if (SEARCH)   qp.set("search", SEARCH);
  if (CATEGORY) qp.set("categories", CATEGORY);

  const url = `${API_BASE}?${qp}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    // The Events Calendar devolve 404 quando a página está acima do total
    if (r.status === 404 && /rest_post_invalid_page_number/.test(text)) return { events: [], end: true };
    throw new Error(`HTTP ${r.status} em ${url}`);
  }
  const j = await r.json();
  return {
    events: j.events || [],
    total:  j.total ?? null,
    totalPages: j.total_pages ?? null,
    end: false,
  };
}

async function fetchAllEvents() {
  const all = [];
  let page = 1, totalPages = null, total = null;
  while (true) {
    const res = await fetchEventsPage(page);
    if (res.end) break;
    all.push(...res.events);
    if (totalPages === null) { totalPages = res.totalPages; total = res.total; }
    if (res.events.length < 50) break;
    if (totalPages && page >= totalPages) break;
    if (LIMIT && page >= LIMIT) { warn(`--limit ${LIMIT} alcançado (paragem antecipada)`); break; }
    page++;
    await sleep(120);
  }
  return { events: all, total, totalPages };
}

// ═══════════════════════════════════════════════════════════
// FASE 2 — EXTRAIR CCODE/TCODE DE CADA PÁGINA DE EVENTO
// ═══════════════════════════════════════════════════════════
const LINKPAGE_RE = /https?:\/\/scoring\.fpg\.pt\/lists\/linkpage\.aspx\?page=(admissions|draw|classif)&(?:club|tourn)=[^"'<\s]*/gi;
// Também captura com ordem invertida dos params (alguns têm ack antes de tourn)
const PARAMS_RE = /[?&](page|club|tourn|ack|round)=([^&"'<\s]+)/gi;

function extractFpgLinksFromHtml(html) {
  const matches = html.match(LINKPAGE_RE) || [];
  const links = [];
  for (const m of matches) {
    const params = {};
    let p;
    PARAMS_RE.lastIndex = 0;
    while ((p = PARAMS_RE.exec(m)) !== null) params[p[1]] = decodeURIComponent(p[2]);
    links.push({ raw: m, ...params });
  }
  return links;
}

async function fetchEventHtml(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return r.text();
}

/** Agrupa os links em torneios únicos por (ccode,tcode). */
function groupLinksByTournament(links) {
  const map = new Map(); // key = ccode|tcode
  for (const l of links) {
    if (!l.club || !l.tourn) continue;
    const key = `${l.club}|${l.tourn}`;
    if (!map.has(key)) map.set(key, { ccode: l.club, tcode: l.tourn, admissionsAck: null, drawAck: null, classifAck: null });
    const t = map.get(key);
    if (l.page === "admissions") t.admissionsAck = l.ack;
    else if (l.page === "draw")  t.drawAck      = l.ack;
    else if (l.page === "classif") t.classifAck = l.ack;
  }
  return [...map.values()];
}

// ═══════════════════════════════════════════════════════════
// FASE 3 — ADMISSIONS (opcional)
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
      return { ok: false, status: r.status, html, reason: "Param_Errors (cookies inválidos/expirados)" };
    }
    return { ok: true, status: r.status, html };
  } catch (e) {
    return { ok: false, status: 0, reason: e.message };
  }
}

// ═══════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════
const sleep = ms => new Promise(r => setTimeout(r, ms));

function shortDate(iso) { return (iso || "").slice(0, 10); }

function matchesFilter(ev) {
  if (REGEX_FILTER) {
    const re = new RegExp(REGEX_FILTER, "i");
    if (!re.test(ev.title || "")) return false;
  }
  return true;
}

function titleOfEvent(ev) {
  if (typeof ev.title === "string") return ev.title;
  if (ev.title?.rendered) return ev.title.rendered;
  return "";
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
(async () => {
  log(`═══ Calendário FPG — fonte: ${API_BASE} ═══`);
  log(`Janela: ${START} → ${END}`);
  if (SEARCH)       log(`Filtro --search:   "${SEARCH}"`);
  if (CATEGORY)     log(`Filtro --category: ${CATEGORY}`);
  if (REGEX_FILTER) log(`Filtro --regex:    /${REGEX_FILTER}/i`);
  if (CCODE_FILTER) log(`Filtro --ccode:    ${CCODE_FILTER}`);

  // Fase 1: API
  log("");
  log("FASE 1: listar eventos via API...");
  let events, total, totalPages;
  try {
    const res = await fetchAllEvents();
    events = res.events;
    total = res.total;
    totalPages = res.totalPages;
  } catch (e) {
    errf(`Falha na API: ${e.message}`);
    process.exit(1);
  }
  ok(`${events.length} eventos devolvidos ${total != null ? `(total: ${total}, páginas: ${totalPages})` : ""}`);

  if (events.length === 0) {
    warn("Sem eventos no filtro/janela.");
    process.exit(0);
  }

  // Filtros adicionais client-side (não cobertos pela API)
  const filtered = events.filter(ev => matchesFilter({ title: titleOfEvent(ev) }));
  if (filtered.length !== events.length) log(`Após filtro --regex: ${filtered.length} eventos`);

  // Fase 2: Fetch HTML de cada evento + extrair ccode/tcode
  log("");
  log("FASE 2: extrair ccode/tcode de cada página...");
  const results = [];
  for (const ev of filtered) {
    const title = titleOfEvent(ev);
    const url   = ev.url;
    if (!url) {
      warn(`Evento "${title}" sem url — ignorado`);
      continue;
    }
    let html;
    try {
      html = await fetchEventHtml(url);
    } catch (e) {
      warn(`${title} → ${e.message}`);
      continue;
    }
    const links = extractFpgLinksFromHtml(html);
    const tournaments = groupLinksByTournament(links);
    if (tournaments.length === 0) {
      warn(`${title} — nenhum linkpage.aspx encontrado no HTML`);
      continue;
    }
    // aplicar filtro por ccode, se definido
    const keepTourns = CCODE_FILTER
      ? tournaments.filter(t => String(t.ccode).padStart(3, "0") === String(CCODE_FILTER).padStart(3, "0"))
      : tournaments;
    if (keepTourns.length === 0) {
      if (VERBOSE) warn(`${title} — nenhum tcode com ccode=${CCODE_FILTER}`);
      continue;
    }
    ok(`${title.slice(0, 60).padEnd(60)}  ${keepTourns.length} tcode(s)`);
    if (VERBOSE) {
      for (const t of keepTourns) console.log(`     → club=${t.ccode} tourn=${t.tcode} admAck=${t.admissionsAck || "—"}`);
    }

    for (const t of keepTourns) {
      results.push({
        eventTitle: title,
        eventSlug:  ev.slug || null,
        eventUrl:   url,
        eventDate:  shortDate(ev.start_date),
        eventEndDate: shortDate(ev.end_date),
        categories: (ev.categories || []).map(c => c.slug || c.name).filter(Boolean),
        ccode: t.ccode,
        tcode: t.tcode,
        admissionsAck: t.admissionsAck,
        drawAck:       t.drawAck,
        classifAck:    t.classifAck,
        admissionsUrl: `https://scoring.fpg.pt/lists/tournAdmissions.aspx?ccode=${t.ccode}&tcode=${t.tcode}`,
        admissionsLinkpage: t.admissionsAck
          ? `https://scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=${t.ccode}&tourn=${t.tcode}&ack=${t.admissionsAck}`
          : null,
        classifLinkpage: `https://scoring.fpg.pt/lists/linkpage.aspx?page=classif&club=${t.ccode}&tourn=${t.tcode}&ack=${t.classifAck || "8428ACK987"}`,
        admissionsStatus: null,
        totalInscritos:   null,
        reservas:         null,
      });
    }
    await sleep(150);
  }

  // Fase 3: admissions (opcional)
  if (FETCH_ADM && results.length > 0) {
    log("");
    log("FASE 3: obter estado das inscrições...");
    const adm = loadAdmissionsCookies();
    if (adm) log(`Cookies admissions: ${adm.source}`);
    else    warn("Sem cookies admissions — vai tentar sem (pode devolver Param_Errors)");

    for (const t of results) {
      const res = await fetchAdmissionsHTML(t.ccode, t.tcode, adm?.cookie);
      if (!res.ok) {
        t.admissionsStatus = `Erro: ${res.reason}`;
        warn(`  ${t.ccode}/${t.tcode} ${t.eventTitle.slice(0,45)} → ${res.reason}`);
        await sleep(150);
        continue;
      }
      const parsed = parseAdmissions(res.html);
      t.admissionsStatus = parsed.status || (parsed.totalInscritos != null ? "—" : "sem status");
      t.totalInscritos   = parsed.totalInscritos;
      t.reservas         = parsed.reservas;
      ok(`  ${t.ccode}/${t.tcode} ${t.eventTitle.slice(0,45).padEnd(45)} → ${parsed.status || "—"} (${parsed.totalInscritos || 0}${parsed.reservas ? "+" + parsed.reservas : ""})`);
      await sleep(200);
    }
  }

  // ─── Tabela ───
  console.log("");
  console.log(C + "═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════" + X);
  console.log(C + `Torneios futuros encontrados: ${results.length}` + X);
  console.log(C + "═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════" + X);
  if (results.length === 0) {
    console.log(D + "  (nada)" + X);
  } else {
    console.log(D + "  Data        ccode  tcode  Torneio" + " ".repeat(60 - 7) + "Estado                Inscritos" + X);
    console.log(D + "  ──────────  ─────  ─────  " + "─".repeat(60) + "  ──────────────────  ─────────" + X);
    results.sort((a, b) => (a.eventDate || "").localeCompare(b.eventDate || ""));
    for (const t of results) {
      const d = (t.eventDate || "?").padEnd(10);
      const cc = String(t.ccode).padStart(3, "0").padEnd(5);
      const tc = String(t.tcode).padEnd(5);
      const nm = (t.eventTitle || "").padEnd(60).slice(0, 60);
      const est = (t.admissionsStatus || "—").padEnd(18).slice(0, 18);
      const insc = t.totalInscritos != null
        ? `${t.totalInscritos}${t.reservas ? "+" + t.reservas : ""}`
        : "—";
      console.log(`  ${d}  ${cc}  ${tc}  ${nm}  ${est}  ${insc}`);
    }
  }

  // ─── JSON ───
  if (!NO_JSON) {
    const filterLabel = SEARCH
      ? SEARCH.replace(/\s+/g, "-").toLowerCase()
      : (CATEGORY || CCODE_FILTER || "todos");
    const defaultOut = path.join(REPO_ROOT, "public", "data", `fpg-calendario-${filterLabel}.json`);
    const finalOut = OUT_PATH || defaultOut;
    const payload = {
      generated: new Date().toISOString(),
      source: API_BASE,
      scope: {
        from: START, to: END,
        search: SEARCH || null,
        category: CATEGORY || null,
        ccode: CCODE_FILTER || null,
        regex: REGEX_FILTER || null,
      },
      total: results.length,
      tournaments: results,
    };
    fs.mkdirSync(path.dirname(finalOut), { recursive: true });
    fs.writeFileSync(finalOut, JSON.stringify(payload, null, 2));
    console.log("");
    log(`JSON → ${path.relative(REPO_ROOT, finalOut)}`);
  }

  process.exit(0);
})().catch(e => {
  errf("FATAL: " + (e.stack || e.message));
  process.exit(1);
});
