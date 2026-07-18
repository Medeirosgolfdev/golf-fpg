/**
 * api/inscricoes.js
 * Vercel Serverless Function — proxy para inscrições FPG
 *
 * GET /api/inscricoes?tcode=10941                (ccode default 000)
 * GET /api/inscricoes?ccode=179&tcode=10604      (torneios de clube)
 * GET /api/inscricoes?tcode=10941&raw=1          (HTML bruto para debug)
 *
 * Generalizado 2026-07-10: aceita QUALQUER (ccode, tcode) válido — antes só
 * os tcodes hardcoded do Nacional 2026. Usado pela verificação live dos
 * FEATURED_TOURNAMENTS (src/hooks/useLiveAdmissions.ts).
 *
 * ─── Autenticação (breakthrough 2026-04-14) ─────────────────────────
 * scoring.datagolf.pt exige dois cookies: ASP.NET_SessionId + DG_Lists_URL.
 * GET directo a tournAdmissions.aspx sem esses cookies devolve HTTP 500
 * ou redirect para Param_Errors.aspx?Err=999 (o servidor exige que o
 * browser tenha passado pelo 1EntryPage.aspx para validar um hash SHA-1
 * server-side — impossível replicar de Node puro).
 *
 * Solução: capturar cookies no Chrome 90 (com SameSite flags desactivadas)
 * e guardá-los em env var DATAGOLF_SCORING_COOKIES ou ficheiro local
 * api/.scoring-datagolf-cookies.json. Validade ~1 semana.
 *
 * Fallback #1: tentar x-cookie-session-id do golf-portugal.pt (pool
 * rotativo de sessões ASP.NET para scoring.datagolf.pt). Por vezes
 * funciona, mas não tem DG_Lists_URL — o servidor pode rejeitar.
 *
 * Fallback #2: sem cookie (página pode ter sessão implícita no primeiro GET).
 */

const TORNEIOS = {
  "10935": { nome: "Campeonato Nacional de Jovens Sub-18 H", escalao: "Sub-18", sex: "M" },
  "10936": { nome: "Campeonato Nacional de Jovens Sub-18 S", escalao: "Sub-18", sex: "F" },
  "10937": { nome: "Campeonato Nacional de Jovens Sub-16 H", escalao: "Sub-16", sex: "M" },
  "10938": { nome: "Campeonato Nacional de Jovens Sub-16 S", escalao: "Sub-16", sex: "F" },
  "10939": { nome: "Campeonato Nacional de Jovens Sub-14 H", escalao: "Sub-14", sex: "M" },
  "10940": { nome: "Campeonato Nacional de Jovens Sub-14 S", escalao: "Sub-14", sex: "F" },
  "10941": { nome: "Campeonato Nacional de Jovens Sub-12 H", escalao: "Sub-12", sex: "M" },
  "10942": { nome: "Campeonato Nacional de Jovens Sub-12 S", escalao: "Sub-12", sex: "F" },
  "10943": { nome: "Campeonato Nacional de Jovens Sub-10 H", escalao: "Sub-10", sex: "M" },
  "10944": { nome: "Campeonato Nacional de Jovens Sub-10 S", escalao: "Sub-10", sex: "F" },
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36";
const GP_BASE = "https://golf-portugal.pt";

// ═════════════════════════════════════════════════════════════════════
// COOKIES — scoring.datagolf.pt
// ═════════════════════════════════════════════════════════════════════
let _cookieCache = { cookie: null, source: null, ts: 0 };
const COOKIE_TTL = 5 * 60 * 1000; // 5 min

function loadLocalScoringCookies() {
  // 1) Env var específica de admissions (produção Vercel)
  if (process.env.FPG_ADMISSIONS_COOKIES) {
    return { cookie: process.env.FPG_ADMISSIONS_COOKIES, source: "env FPG_ADMISSIONS_COOKIES" };
  }
  // 2) Ficheiro local dedicado (dev) — scoring.fpg.pt/lists
  try {
    const path = require("path");
    const fs = require("fs");
    const fp = path.join(__dirname, ".fpg-admissions-cookies.json");
    if (fs.existsSync(fp)) {
      const j = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (j.cookieHeader) return { cookie: j.cookieHeader, source: "api/.fpg-admissions-cookies.json" };
    }
    // 3) Fallback: scoring.datagolf.pt cookies (se alguém os configurou — raramente válidos para /lists)
    const fp2 = path.join(__dirname, ".scoring-datagolf-cookies.json");
    if (fs.existsSync(fp2)) {
      const j = JSON.parse(fs.readFileSync(fp2, "utf8"));
      if (j.cookieHeader) return { cookie: j.cookieHeader, source: "api/.scoring-datagolf-cookies.json (fallback)" };
    }
  } catch (e) {
    console.log("[inscricoes] erro a ler cookies locais:", e.message);
  }
  return null;
}

/* Cookies de scoring.datagolf.pt — separados dos de scoring.fpg.pt/lists.
 * Só necessários para o fallback directo tournAdmissions.aspx (ccodes de clube,
 * que o gateway linkpage.aspx não serve). Em produção requer o env
 * DATAGOLF_SCORING_COOKIES no Vercel; sem ele o fallback é simplesmente
 * saltado e o comportamento é o antigo (502 nesses torneios). */
function loadDatagolfCookies() {
  if (process.env.DATAGOLF_SCORING_COOKIES) return process.env.DATAGOLF_SCORING_COOKIES;
  try {
    const path = require("path");
    const fs = require("fs");
    const fp = path.join(__dirname, ".scoring-datagolf-cookies.json");
    if (fs.existsSync(fp)) {
      const j = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (j.cookieHeader) return j.cookieHeader;
    }
  } catch (e) {
    console.log("[inscricoes] erro a ler cookies datagolf:", e.message);
  }
  return null;
}

async function gpBorrowSession() {
  // Tentar roubar um ASP.NET_SessionId válido do pool do golf-portugal.pt
  try {
    const r = await fetch(GP_BASE + "/api/clubs/144/players/52884/results?startIndex=0&limit=1", {
      headers: { "Accept": "application/json", "User-Agent": UA, "Referer": GP_BASE + "/" },
    });
    if (r.ok) {
      const xs = r.headers.get("x-cookie-session-id");
      if (xs && xs.startsWith("ASP.NET_SessionId=")) return xs;
    }
  } catch (e) {
    console.log("[inscricoes] gpBorrowSession falhou:", e.message);
  }
  return null;
}

async function getScoringCookie() {
  if (_cookieCache.cookie && (Date.now() - _cookieCache.ts) < COOKIE_TTL) {
    return _cookieCache.cookie;
  }
  // 1) Cookies manuais (preferido)
  const local = loadLocalScoringCookies();
  if (local) {
    console.log("[inscricoes] cookies de " + local.source);
    _cookieCache = { cookie: local.cookie, source: local.source, ts: Date.now() };
    return local.cookie;
  }
  // 2) Session-borrowing do golf-portugal.pt
  const borrowed = await gpBorrowSession();
  if (borrowed) {
    console.log("[inscricoes] session borrowed do golf-portugal.pt (sem DG_Lists_URL)");
    _cookieCache = { cookie: borrowed, source: "golf-portugal.pt", ts: Date.now() };
    return borrowed;
  }
  return null;
}

// ═════════════════════════════════════════════════════════════════════
// Parser HTML — tournAdmissions.aspx
// ═════════════════════════════════════════════════════════════════════
function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").replace(/\s+/g, " ").trim();
}
function parseNum(s) {
  if (!s || s === "-" || s === "\u2013") return null;
  const n = parseFloat(String(s).replace(",", "."));
  return isNaN(n) ? null : n;
}
/* Handicap com a conven\u00e7\u00e3o do golfe: "+5.1" \u00e9 PLUS (abaixo de scratch) e
   guarda-se NEGATIVO (-5.1) \u2014 \u00e9 assim que o resto do projecto o representa
   (fmtHcp formata negativos como "+5.1"). `parseFloat("+5.1")` devolvia 5.1
   e o sinal desaparecia em sil\u00eancio. Espelha parseHcp() de
   scripts/fpg-admissions-draw-parser.js e do vite.config.ts. */
function parseHcp(s) {
  if (!s || s === "-" || s === "\u2013") return null;
  const t = String(s).trim().replace(",", ".");
  const isPlus = t.startsWith("+");
  const n = parseFloat(isPlus ? t.slice(1) : t);
  if (isNaN(n)) return null;
  return isPlus && n !== 0 ? -n : n;
}
function extractCells(rowHtml) {
  const cells = [];
  const re = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
  let m;
  while ((m = re.exec(rowHtml)) !== null) cells.push(stripTags(m[1]));
  return cells;
}

function parseAdmissionsTable(html) {
  const jogadores = [];
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM;
  while ((trM = trRe.exec(clean)) !== null) rows.push(trM[1]);
  if (rows.length < 2) return jogadores;

  // Detectar a melhor header row nas primeiras 10 linhas
  let headerRowIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const joined = extractCells(rows[i]).join(" ").toLowerCase();
    let score = 0;
    if (/fed|lic/.test(joined))                  score += 3;
    if (/nome|jogador/.test(joined))             score += 3;
    if (/hcp|handicap|ndice|index/.test(joined)) score += 2;
    if (/\bvac\b/.test(joined))                  score += 2;
    if (/data|insc/.test(joined))                score += 2;
    if (/clube|assoc/.test(joined))              score += 1;
    if (score > bestScore) { bestScore = score; headerRowIdx = i; }
  }

  const headers = extractCells(rows[headerRowIdx]).map(c => c.toLowerCase());
  const iNome  = headers.findIndex(h => /nome|jogador/.test(h));
  const iFed   = headers.findIndex(h => /fed|lic/.test(h));
  const iHcp   = headers.findIndex(h => /hcp|handicap|ndice|index/.test(h));
  const iVac   = headers.findIndex(h => /\bvac\b/.test(h));
  const iClube = headers.findIndex(h => /clube|assoc/.test(h));
  const iData  = headers.findIndex(h => /data|insc/.test(h));

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdM;
    while ((tdM = tdRe.exec(rows[i])) !== null) cells.push(stripTags(tdM[1]));
    if (cells.length < 2) continue;

    let fed = iFed >= 0 ? ((cells[iFed] || "").match(/\b(\d{4,6})\b/) || [])[1] || null : null;
    let fedIdx = iFed;
    if (!fed) {
      for (let ci = 0; ci < cells.length; ci++) {
        const m = (cells[ci] || "").match(/\b(\d{4,6})\b/);
        if (m) { fed = m[1]; fedIdx = ci; break; }
      }
    }

    const nome = iNome >= 0
      ? (cells[iNome] || "")
      : (cells.find(c => c.length > 4 && /[a-záéíóúâêîôûãõç]/i.test(c) && !/^\d/.test(c)) || "");
    const clube = iClube >= 0 ? (cells[iClube] || "") : "";

    let hcp = iHcp >= 0 ? parseHcp(cells[iHcp] || "") : null;
    let vac = iVac >= 0 ? parseNum(cells[iVac] || "") : null;
    if ((hcp === null || vac === null) && fedIdx >= 0) {
      for (let ci = fedIdx + 1; ci < cells.length; ci++) {
        const v = parseNum(cells[ci]);
        if (v === null) continue;
        if (hcp === null && v >= -10 && v <= 54) { hcp = v; continue; }
        if (vac === null && v > 60) { vac = v; break; }
      }
    }

    let dataInscricao = iData >= 0 ? (cells[iData] || null) : null;
    if (!dataInscricao) {
      const dc = cells.find(c => /\d{4}\/\d{2}\/\d{2}/.test(c));
      if (dc) dataInscricao = dc;
    }

    if (!nome && !fed) continue;
    jogadores.push({ fed: fed || null, nome, clube, hcp, vac, dataInscricao });
  }
  return jogadores;
}

// ═════════════════════════════════════════════════════════════════════
// Fetch com várias estratégias de cookie (em ordem de preferência)
// ═════════════════════════════════════════════════════════════════════
async function fetchAdmissionsHTML(ccode, tcode) {
  // Gateway canónico linkpage.aspx (ack universal XH256YF450) — ir directo a
  // tournAdmissions.aspx é frágil ("Param Error" com sessão fria). O linkpage
  // aquece a sessão e redirecciona; redirect:"follow" apanha a resposta final.
  const fpgUrl = "https://scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=" + ccode + "&tourn=" + tcode + "&ack=XH256YF450";
  const baseHeaders = {
    "User-Agent":                UA,
    "Accept":                    "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language":           "pt-PT,pt;q=0.9",
    "Upgrade-Insecure-Requests": "1",
    "Referer":                   "https://competicoes.fpg.pt/",
  };

  const cookie = await getScoringCookie();

  // Tentativa 1: com cookies completos (ASP.NET_SessionId + DG_Lists_URL)
  if (cookie) {
    try {
      const r = await fetch(fpgUrl, {
        headers: { ...baseHeaders, "Cookie": cookie },
        redirect: "follow",
      });
      const html = await r.text();
      console.log("[inscricoes] " + ccode + "/" + tcode + " [com cookies] HTTP=" + r.status + " len=" + html.length);
      if (r.ok && html && !/Param_Errors|Err=999/.test(html)) {
        return { ok: true, html, status: r.status, via: "cookies" };
      }
      // Falhou → invalidar cache e tentar sem
      _cookieCache = { cookie: null, source: null, ts: 0 };
    } catch (e) {
      console.warn("[inscricoes] erro com cookies:", e.message);
    }
  }

  // Tentativa 2: sem cookie (sessão implícita)
  try {
    const r = await fetch(fpgUrl, { headers: baseHeaders, redirect: "follow" });
    const html = await r.text();
    console.log("[inscricoes] " + ccode + "/" + tcode + " [sem cookie] HTTP=" + r.status + " len=" + html.length);
    if (r.ok && html && !/Param_Errors|Err=999/.test(html)) {
      return { ok: true, html, status: r.status, via: "no-cookie" };
    }
  } catch (e) {
    console.error("[inscricoes] erro sem cookie:", e.message);
  }

  // Tentativa 3: URL DIRECTA tournAdmissions.aspx em scoring.datagolf.pt.
  // Obrigatória para ccodes de CLUBE (ex: 179 Amendoeira): o linkpage.aspx só
  // serve os ccodes do seu gateway (ex: 000 dos Nacionais) e devolve
  // Param_Errors.aspx?Err=400 para os restantes. É o mesmo fallback que o
  // scraper (scrape-fpg-admissions-draws-node.js, fetchLinkpage tentativa 3)
  // já fazia — sem ele a verificação live dava 502 em todos os torneios de
  // clube. Requer warmup do entry-gate, que seta DG_Lists_URL server-side.
  const cookieDg = loadDatagolfCookies();
  if (cookieDg) {
    const dgHeaders = { ...baseHeaders, "Cookie": cookieDg, "Referer": "https://scoring.datagolf.pt/" };
    try {
      const w = await fetch("https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T", {
        headers: dgHeaders, redirect: "follow",
      });
      await w.text();
      console.log("[inscricoes] datagolf warmup HTTP=" + w.status);
    } catch (e) {
      console.warn("[inscricoes] datagolf warmup falhou:", e.message);
    }
    try {
      const url = "https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=" + ccode + "&tcode=" + tcode;
      const r = await fetch(url, { headers: dgHeaders, redirect: "follow" });
      const html = await r.text();
      console.log("[inscricoes] " + ccode + "/" + tcode + " [datagolf directo] HTTP=" + r.status + " len=" + html.length);
      if (r.ok && html && !/Param_Errors|Err=999/.test(html)) {
        return { ok: true, html, status: r.status, via: "datagolf-directo" };
      }
      return { ok: false, html, status: r.status, via: "datagolf-directo" };
    } catch (e) {
      console.error("[inscricoes] erro datagolf directo:", e.message);
      return { ok: false, html: "", status: 0, via: "error", error: e.message };
    }
  }

  return { ok: false, html: "", status: 0, via: "sem-fallback-datagolf" };
}

// ═════════════════════════════════════════════════════════════════════
// Handler
// ═════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { tcode, raw } = req.query;
  const ccode = String(req.query.ccode || "000").padStart(3, "0");
  if (!tcode) return res.status(400).json({ error: "tcode obrigatorio" });
  if (!/^\d{3,6}$/.test(String(tcode)) || !/^\d{3}$/.test(ccode)) {
    return res.status(400).json({ error: "tcode/ccode invalido" });
  }

  // Meta conhecida (Nacional 2026) é opcional — qualquer (ccode,tcode) é aceite.
  const meta = TORNEIOS[tcode] || { nome: "Torneio " + ccode + "/" + tcode };

  const fpgUrl = "https://scoring.fpg.pt/lists/tournAdmissions.aspx?ccode=" + ccode + "&tcode=" + tcode;

  try {
    const result = await fetchAdmissionsHTML(ccode, tcode);

    if (raw === "1") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(result.status || 502).send(result.html || "");
    }

    if (!result.ok) {
      return res.status(502).json({
        error: "FPG HTTP " + result.status + (result.error ? " — " + result.error : ""),
        ccode, tcode, ...meta, totalInscritos: 0, jogadores: [], lastFetched: null, via: result.via,
      });
    }

    const jogadores = parseAdmissionsTable(result.html);
    console.log("[inscricoes] " + ccode + "/" + tcode + " -> " + jogadores.length + " inscritos (via " + result.via + ")");

    res.setHeader("Cache-Control", "no-cache");
    return res.status(200).json({
      ccode, tcode, ...meta,
      totalInscritos: jogadores.length,
      jogadores,
      lastFetched: new Date().toISOString(),
      fpgUrl,
      fromCache: false,
      via: result.via,
    });

  } catch (err) {
    console.error("[inscricoes] Erro " + ccode + "/" + tcode + ":", err);
    return res.status(500).json({
      error: String(err),
      ccode, tcode, ...meta, totalInscritos: 0, jogadores: [], lastFetched: null,
    });
  }
}
