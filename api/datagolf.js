/**
 * api/datagolf.js
 * ═════════════════════════════════════════════════════════════════════
 * Proxy serverless para obter dados FPG em tempo real.
 *
 *   • Primário:  golf-portugal.pt (API REST, sem auth)
 *   • Fallback:  scoring.datagolf.pt (PageMethods ASP.NET, precisa cookie)
 *
 * Porquê fallback? Ambas as fontes vão buscar os mesmos dados à FPG,
 * mas ocasionalmente uma ou outra falha (manutenção, rate-limit, sessão
 * ASP.NET expirada). Tentar as duas em sequência dá máxima robustez.
 *
 * A descoberta: golf-portugal.pt é um proxy em Google Cloud Run (Envoy)
 * que mantém cookies FPG rotativos — os headers expostos mostram
 * `x-cookie-provider: FPG` + `x-cookie-session-id` + `x-cookie-timestamp`.
 * Eles resolveram por nós o problema do login ASP.NET.
 *
 * ─── Endpoints expostos (API externa estável) ──────────────────────
 *   GET /api/datagolf?action=whs&fed=52884[&limit=200]
 *     → lista das rondas registadas no WHS
 *
 *   GET /api/datagolf?action=scorecard&score_id=4244840
 *     → scorecard hole-by-hole (par_1..18, gross_1..18, meters_1..18,
 *       stroke_index_1..18, stbgross_1..18, stbnet_1..18, bogey_1..18)
 *
 *   GET /api/datagolf?action=profile&fed=52884
 *     → perfil FPG (32 campos de cadastro)
 *
 *   GET /api/datagolf?action=handicaps&fed=52884
 *     → histórico de movimentos de HCP
 *
 * Resposta: { ok: boolean, data?, source?: "gp"|"datagolf", error? }
 * ═════════════════════════════════════════════════════════════════════
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36";
const GP_BASE = "https://golf-portugal.pt";

// Bases FPG — o cookie .datagolf-cookies.json indica qual usar via "host"
const DG_BASES = {
  "scoring.datagolf.pt": { base: "https://scoring.datagolf.pt/pt", pp: null },
  "my.fpg.pt":           { base: "https://my.fpg.pt/Home",         pp: "N"  },  // my.fpg.pt exige &pp=N
};
let DG_BASE = "https://scoring.datagolf.pt/pt";        // default — actualizado quando carregamos cookies
let DG_PP   = null;                                     // param extra (my.fpg.pt)

/* ═════════════════════════════════════════════════════════════════
   BACKEND 1 — golf-portugal.pt (primário)
   ───────────────────────────────────────────────────────────────── */

async function gpFetch(path, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(GP_BASE + path, {
        method:  "GET",
        headers: {
          "Accept":          "application/json",
          "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "User-Agent":      UA,
          "Referer":         GP_BASE + "/",
        },
      });
      if (!res.ok) {
        const txt = await res.text();
        lastErr = new Error("GP HTTP " + res.status + ": " + txt.slice(0, 150));
        // Retry só em 5xx; 4xx é cliente → não vale a pena
        if (res.status < 500) throw lastErr;
        if (i < retries) {
          await new Promise(r => setTimeout(r, 500 * (i + 1))); // 500ms, 1s
          continue;
        }
        throw lastErr;
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < retries && /(fetch|network|5\d\d)/i.test(e.message)) {
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// Clubs a tentar em sequência — o endpoint filtra pelo fed_code, o club
// code é maioritariamente ignorado. Ter vários dá-nos retry grátis quando
// o backend do golf-portugal.pt devolve 500 transitório "Failed to fetch
// player results" (observado).
const GP_CLUBS = ["144", "000", "001", "007", "170"];

const gpEndpoints = {
  whs:       (fed, club, limit) => `/api/clubs/${club}/players/${fed}/results?startIndex=0&limit=${limit || 200}`,
  scorecard: (id)               => `/api/scorecards/${id}`,
  profile:   (fed, club)        => `/api/clubs/${club}/players/${fed}`,
  handicaps: (fed, club)        => `/api/clubs/${club}/players/${fed}/handicaps`,
};

/** Tenta múltiplos clubs até um funcionar (resolve 500 transitório). */
async function gpTryClubs(builder, params) {
  let lastErr;
  for (const club of GP_CLUBS) {
    try {
      return await gpFetch(builder(params.fed || params.scoreId, club, params.limit));
    } catch (e) {
      lastErr = e;
      // Se não é erro HTTP 500, não vale a pena tentar outro club
      if (!/HTTP 5\d\d/.test(e.message)) throw e;
    }
  }
  throw lastErr;
}

/* ═════════════════════════════════════════════════════════════════
   BACKEND 2 — scoring.datagolf.pt (fallback)
   Requer cookie ASP.NET_SessionId. Obtemos fresh via GET a uma
   página que seta cookies (FederatedsList_V2.aspx funciona).
   ───────────────────────────────────────────────────────────────── */

let _dgSessionCache = { cookie: null, ts: 0 };
const DG_SESSION_TTL = 5 * 60 * 1000;   // 5 min — depois renova

/**
 * DESCOBERTA CRÍTICA: golf-portugal.pt expõe o cookie ASP.NET_SessionId
 * do seu pool no response header `x-cookie-session-id`. Esse cookie
 * AUTENTICA os PageMethods da FPG directamente!
 *
 * Source: https://golf-portugal.pt/api/clubs/144/players/52884/results
 *   → response.headers["x-cookie-session-id"] = "ASP.NET_SessionId=XYZ..."
 *
 * Isto elimina a necessidade de Playwright — basta fazer 1 call à API
 * deles para "roubar" uma sessão FPG válida. Eles mantêm-nas vivas por
 * nós e rotaivam-nas.
 */
async function dgGetSession() {
  if (_dgSessionCache.cookie && (Date.now() - _dgSessionCache.ts) < DG_SESSION_TTL) {
    return _dgSessionCache.cookie;
  }

  // 1) PREFERIDO (breakthrough 2026-04-14): cookies capturados manualmente
  //    do Chrome 90. Fonte: env var DATAGOLF_COOKIES (produção Vercel) ou
  //    ficheiro api/.datagolf-cookies.json (dev local).
  //    Estes são os nossos próprios cookies, válidos do nosso IP, sem
  //    dependência de golf-portugal.pt.
  try {
    let cookieHeader = null, host = null;
    if (process.env.DATAGOLF_COOKIES) {
      cookieHeader = process.env.DATAGOLF_COOKIES;
      host = process.env.DATAGOLF_HOST || "my.fpg.pt";
      console.log(`[datagolf] cookies lidos de env DATAGOLF_COOKIES (host=${host})`);
    } else {
      const path = require("path");
      const fs = require("fs");
      const fp = path.join(__dirname, ".datagolf-cookies.json");
      if (fs.existsSync(fp)) {
        const j = JSON.parse(fs.readFileSync(fp, "utf8"));
        if (j.cookieHeader) {
          cookieHeader = j.cookieHeader;
          host = j.host;
          console.log(`[datagolf] cookies lidos de ${fp} (host=${host || "default"})`);
        }
      }
    }
    if (cookieHeader) {
      _dgSessionCache = { cookie: cookieHeader, ts: Date.now() };
      if (host && DG_BASES[host]) {
        DG_BASE = DG_BASES[host].base;
        DG_PP   = DG_BASES[host].pp;
        console.log(`[datagolf] a usar base ${DG_BASE}${DG_PP ? " (pp=" + DG_PP + ")" : ""}`);
      }
      return cookieHeader;
    }
  } catch (e) {
    console.log("[datagolf] erro a ler cookies locais:", e.message);
  }

  // 2) Fallback: pedir ao golf-portugal.pt uma sessão FPG (via
  //    x-cookie-session-id). Só usar se response foi OK — caso contrário
  //    o header pode vir mas a sessão é inválida (observado: GP responde
  //    500 mas ainda expõe um session ID que falha Param_Errors quando
  //    usado para outros federados).
  try {
    const r = await fetch(GP_BASE + "/api/clubs/144/players/52884/results?startIndex=0&limit=1", {
      method: "GET",
      headers: { "Accept": "application/json", "User-Agent": UA, "Referer": GP_BASE + "/" },
    });
    if (r.ok) {
      const xSession = r.headers.get("x-cookie-session-id");
      if (xSession && xSession.startsWith("ASP.NET_SessionId=")) {
        _dgSessionCache = { cookie: xSession, ts: Date.now() };
        console.log("[datagolf] sessão obtida via golf-portugal (x-cookie-session-id)");
        return xSession;
      }
    } else {
      console.log("[datagolf] golf-portugal.pt devolveu HTTP " + r.status + " — ignorar session ID");
    }
  } catch (e) {
    console.log("[datagolf] falha a obter sessão via golf-portugal:", e.message);
  }

  // 3) Último recurso: GET simples (não chega para PageMethods mas pode funcionar para outros)
  const urls = [
    DG_BASE + "/FederatedsList_V2.aspx",
    DG_BASE + "/",
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, {
        headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "pt-PT,pt;q=0.9" },
        redirect: "follow",
      });
      const sc = r.headers.get("set-cookie") || "";
      const m = sc.match(/ASP\.NET_SessionId=([^;,\s]+)/i);
      if (m) {
        _dgSessionCache = { cookie: "ASP.NET_SessionId=" + m[1], ts: Date.now() };
        return _dgSessionCache.cookie;
      }
    } catch {}
  }
  return null;
}

async function dgCall(path, body, refererPath) {
  const cookie = await dgGetSession();  // seta também DG_BASE e DG_PP se vier de my.fpg.pt

  // Se o host activo é my.fpg.pt, anexar &pp=N à URL e ao body
  let fullPath = path;
  let fullBody = body;
  if (DG_PP) {
    fullPath = path.includes("?") ? `${path}&pp=${DG_PP}` : `${path}?pp=${DG_PP}`;
    fullBody = { ...body, pp: DG_PP };
    // my.fpg.pt rejeita jtSorting
    delete fullBody.jtSorting;
  }

  const origin = new URL(DG_BASE).origin;
  const res = await fetch(DG_BASE + fullPath, {
    method: "POST",
    headers: {
      "Content-Type":     "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent":       UA,
      "Accept":           "application/json, text/javascript, */*; q=0.01",
      "Accept-Language":  "pt-PT,pt;q=0.9",
      "Referer":          DG_BASE + (refererPath || "/FederatedsList_V2.aspx"),
      "Origin":           origin,
      ...(cookie ? { "Cookie": cookie } : {}),
    },
    body: JSON.stringify(fullBody),
  });
  const text = await res.text();
  if (!res.ok) throw new Error("DG HTTP " + res.status + ": " + text.slice(0, 150));
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error("DG non-JSON: " + text.slice(0, 150)); }
  const d = json.d || json;
  if (d.Result === "ERROR") throw new Error("DG: " + (d.Message || "erro"));
  return d;
}

/* ═════════════════════════════════════════════════════════════════
   NORMALIZAÇÃO — uniformiza as respostas de ambos os backends.
   O golf-portugal.pt devolve arrays directos ou { Result, Records }.
   O scoring.datagolf.pt devolve { Result, Records } (envelope jTable).
   Normalizamos sempre para array.
   ───────────────────────────────────────────────────────────────── */

function unwrap(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.Records)) return json.Records;
  return json;
}

/**
 * Normaliza um record WHS de my.fpg.pt para o formato que a UI espera
 * (baseado no formato devolvido por golf-portugal.pt / WhsRound em datagolfClient.ts).
 *
 * Os dois backends devolvem os mesmos dados mas com nomes de campos diferentes.
 * Aplicar apenas quando o source é my.fpg.pt.
 */
function normalizeFpgWhsRecord(r) {
  if (!r || typeof r !== "object") return r;
  // Se já tem os campos "canónicos", não é do formato FPG — devolver intacto
  if (r.tournament_description !== undefined || r.score_dateStr !== undefined) return r;

  return {
    // Preservar todos os campos originais…
    ...r,
    // …e por cima adicionar os campos canónicos que a UI consulta
    id:                         r.id ?? r.score_id,
    federation_code:            String(r.federated_code ?? ""),
    tournament_id:              r.tournament_id,
    tournament_description:     r.tourn_name ?? "",
    course_description:         r.course_description ?? "",
    score_date:                 r.hcp_date ?? r.mov_date ?? "",
    score_dateStr:              r.hcp_dateStr ?? r.mov_dateStr ?? "",
    hole_count:                 r.holes ?? 18,
    par_total:                  r.par ?? null,
    exact_hcp:                  r.exact_handicap,
    calculated_exact_hcp:       r.calc_calculated_hcp,
    play_hcp:                   r.play_handicap,
    calculated_play_hcp:        r.play_handicap,
    calc_hcp_index:             r.exact_handicap,   // aproximação — my.fpg.pt não expõe hcp_index separado
    calculated_stablnet_total:  r.stableford,
    gross_total:                null,               // não devolvido por HCPWhsFederLST; disponível via ScoreCard
    cba_value:                  r.cba,
    score_origin:               r.score_origin ?? "",
    status_name:                r.score_status ?? "",
    score_differential:         r.sgd,
    hcp_qualifying_round:       null,
    hcp_qualifying_name:        "",
  };
}

/* ═════════════════════════════════════════════════════════════════
   Wrapper que tenta datagolf (com os nossos cookies) → GP em caso de falha.
   Ordem invertida face à versão antiga: desde o breakthrough 2026-04-14,
   os nossos cookies .AspNet.ApplicationCookie fazem o datagolf funcionar
   à primeira e é muito mais rápido que perder 10-15s em retries do GP.
   ───────────────────────────────────────────────────────────────── */

// Detectar se temos cookies locais para o datagolf (mais rápido) ou
// temos de cair no GP sempre (quando não há cookies configurados).
function hasLocalDgCookies() {
  if (process.env.DATAGOLF_COOKIES) return true;
  try {
    const path = require("path");
    const fs = require("fs");
    const fp = path.join(__dirname, ".datagolf-cookies.json");
    if (!fs.existsSync(fp)) return false;
    const j = JSON.parse(fs.readFileSync(fp, "utf8"));
    return Boolean(j.cookieHeader);
  } catch { return false; }
}

async function callDatagolf(action, params) {
  if (action === "whs") {
    // my.fpg.pt rejeita jtPageSize > 100 com HTTP 500 (confirmado 2026-04-14).
    // Estratégia: 1º pedido aprende TotalRecordCount. Se houver mais páginas,
    // dispara-as em PARALELO (era sequencial antes).
    const PAGE = 100;
    const wanted = params.limit ? Number(params.limit) : 999;

    const firstPage = await dgCall(
      "/PlayerWHS.aspx/HCPWhsFederLST?fed_code=" + params.fed,
      { fed_code: params.fed, jtStartIndex: "0", jtPageSize: String(PAGE), jtSorting: "hcp_date DESC" },
      "/PlayerWHS.aspx?no=" + params.fed,
    );
    const total = Number(firstPage.TotalRecordCount ?? firstPage.totalRecordCount ?? 0);
    const firstRecs = firstPage.Records || firstPage.records || [];
    const target = Math.min(wanted, total || firstRecs.length);

    let allRecords = [...firstRecs];
    if (allRecords.length < target && firstRecs.length === PAGE) {
      // Calcular páginas em falta e disparar em paralelo
      const pageStarts = [];
      for (let s = PAGE; s < target; s += PAGE) pageStarts.push(s);
      const results = await Promise.all(pageStarts.map(start =>
        dgCall(
          "/PlayerWHS.aspx/HCPWhsFederLST?fed_code=" + params.fed,
          { fed_code: params.fed, jtStartIndex: String(start), jtPageSize: String(PAGE), jtSorting: "hcp_date DESC" },
          "/PlayerWHS.aspx?no=" + params.fed,
        ).then(p => p.Records || p.records || []).catch(() => [])
      ));
      results.forEach(recs => allRecords.push(...recs));
    }

    const normalized = allRecords.slice(0, target).map(normalizeFpgWhsRecord);
    return { Result: "OK", Records: normalized, TotalRecordCount: total };
  }
  if (action === "scorecard") {
    return await dgCall(
      "/PlayerWHS.aspx/ScoreCard?score_id=" + params.scoreId,
      { score_id: String(params.scoreId), scoringtype: "1", competitiontype: "10" },
      "/PlayerWHS.aspx?no=" + (params.fed || ""),
    );
  }
  throw new Error("datagolf não suporta action=" + action);
}

/* ═════════════════════════════════════════════════════════════════
   Cache server-side — evita chamadas repetidas à FPG quando o
   mesmo jogador/scorecard é pedido várias vezes numa mesma sessão.
   TTL 5 min para whs (pode haver rondas novas), 60 min para scorecards
   (imutáveis uma vez registados).
   ───────────────────────────────────────────────────────────────── */

const _respCache = new Map();
const RESP_TTL_WHS = 5 * 60 * 1000;          // 5 min
const RESP_TTL_SCORECARD = 60 * 60 * 1000;   // 60 min
const RESP_TTL_DEFAULT = 10 * 60 * 1000;

function respCacheKey(action, params) {
  if (action === "scorecard") return `sc:${params.scoreId}`;
  if (action === "whs")       return `whs:${params.fed}:${params.limit || "all"}`;
  if (action === "profile")   return `profile:${params.fed}`;
  if (action === "handicaps") return `hcps:${params.fed}`;
  return `${action}:${JSON.stringify(params)}`;
}
function respCacheGet(key) {
  const entry = _respCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) { _respCache.delete(key); return null; }
  return entry.value;
}
function respCacheSet(key, value, ttl) {
  _respCache.set(key, { value, ts: Date.now(), ttl });
}
function respCacheTtlFor(action) {
  if (action === "scorecard") return RESP_TTL_SCORECARD;
  if (action === "whs")       return RESP_TTL_WHS;
  return RESP_TTL_DEFAULT;
}

async function callGp(action, params) {
  if (action === "scorecard") {
    return await gpFetch(gpEndpoints.scorecard(params.scoreId));
  }
  const builder = gpEndpoints[action];
  if (!builder) throw new Error("GP endpoint desconhecido para action=" + action);
  return await gpTryClubs(builder, params);
}

// Watchdog — conta falhas recentes por backend. Se o datagolf falhar
// muitas vezes em pouco tempo, provavelmente os cookies expiraram.
const _watchdog = { dgFails: [], dgFailsSince: 0, lastAlerted: 0 };
function recordFail(backend) {
  if (backend !== "datagolf") return;
  const now = Date.now();
  _watchdog.dgFails.push(now);
  // Manter só os últimos 10 min
  _watchdog.dgFails = _watchdog.dgFails.filter(t => now - t < 10 * 60 * 1000);
  // Se >=5 falhas em 10 min e não alertámos nos últimos 30 min, alertar
  if (_watchdog.dgFails.length >= 5 && (now - _watchdog.lastAlerted) > 30 * 60 * 1000) {
    _watchdog.lastAlerted = now;
    console.error("\n" + "=".repeat(60));
    console.error("⚠️  WATCHDOG: datagolf falhou " + _watchdog.dgFails.length + " vezes em 10 min");
    console.error("    Provavelmente os cookies FPG expiraram.");
    console.error("    Refrescar: capturar cookies do Firefox e actualizar");
    console.error("    api/.datagolf-cookies.json ou secret FPG_COOKIES.");
    console.error("=".repeat(60) + "\n");
  }
}

async function tryBoth(action, params) {
  // Cache server-side — devolve imediatamente se resposta recente existe
  const cacheKey = respCacheKey(action, params);
  const cached = respCacheGet(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const errors = [];
  const dgSupports = (action === "whs" || action === "scorecard");
  const preferDg = dgSupports && hasLocalDgCookies();

  // Caminho rápido: se temos cookies locais E datagolf suporta este action,
  // tentar datagolf PRIMEIRO. Isto evita 10-15s de retries inúteis do GP
  // para jogadores que o GP não consegue processar.
  if (preferDg) {
    try {
      const d = await callDatagolf(action, params);
      const result = { data: unwrap(d), source: "datagolf" };
      respCacheSet(cacheKey, result, respCacheTtlFor(action));
      return result;
    } catch (e) {
      errors.push("datagolf: " + e.message.slice(0, 100));
      recordFail("datagolf");
    }
    // Fallback: tentar GP se datagolf falhou
    try {
      const json = await callGp(action, params);
      const result = { data: unwrap(json), source: "gp" };
      respCacheSet(cacheKey, result, respCacheTtlFor(action));
      return result;
    } catch (e) {
      errors.push("gp: " + e.message.slice(0, 100));
    }
  } else {
    // Sem cookies locais — comportamento histórico: GP primeiro, datagolf depois
    try {
      const json = await callGp(action, params);
      const result = { data: unwrap(json), source: "gp" };
      respCacheSet(cacheKey, result, respCacheTtlFor(action));
      return result;
    } catch (e) {
      errors.push("gp: " + e.message.slice(0, 100));
    }
    if (dgSupports) {
      try {
        const d = await callDatagolf(action, params);
        return { data: unwrap(d), source: "datagolf" };
      } catch (e) {
        errors.push("datagolf: " + e.message.slice(0, 100));
      recordFail("datagolf");
      }
    }
  }

  throw new Error("Ambos os backends falharam → " + errors.join(" | "));
}

/* ═════════════════════════════════════════════════════════════════
   HANDLER
   ───────────────────────────────────────────────────────────────── */

/* Debug: captura todos os Set-Cookie de várias páginas + tenta POST */
async function debugFpgDirect(fed) {
  const steps = [];
  const cookieJar = new Map();  // name → value

  const visit = async (url, label) => {
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent":      UA,
          "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-PT,pt;q=0.9",
          "Referer":         DG_BASE + "/",
          "Cookie":          [...cookieJar].map(([k, v]) => `${k}=${v}`).join("; "),
        },
        redirect: "manual",
      });
      // Capturar TODOS os Set-Cookie (pode ter múltiplos)
      const setCookies = [];
      // Node fetch devolve Set-Cookie como header único concatenado com vírgulas — mas só se houver
      // acesso a raw. Usamos getSetCookie() quando disponível.
      const sc = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""];
      for (const cookieStr of sc) {
        if (!cookieStr) continue;
        // Múltiplos cookies vêm concatenados com ", " — separar pelos nomes
        cookieStr.split(/,(?=\s*[A-Za-z_])/).forEach(one => {
          const m = one.match(/^\s*([^=]+)=([^;]+)/);
          if (m) {
            setCookies.push(m[1].trim() + "=" + m[2].trim().slice(0, 20) + "...");
            cookieJar.set(m[1].trim(), m[2].trim());
          }
        });
      }
      steps.push({ label, url: url.split("scoring.datagolf.pt")[1], status: r.status, setCookies, cookieJarSize: cookieJar.size });
    } catch (e) { steps.push({ label, error: e.message }); }
  };

  // 1) Home
  await visit(DG_BASE + "/", "GET /pt/");
  // 2) FederatedsList
  await visit(DG_BASE + "/FederatedsList_V2.aspx", "GET /FederatedsList_V2.aspx");
  // 3) PlayerWHS (página do jogador específico)
  await visit(DG_BASE + "/PlayerWHS.aspx?no=" + fed, "GET /PlayerWHS?no=" + fed);

  // 4) Tentar POST com VÁRIAS combinações de headers
  const cookieHeader = [...cookieJar].map(([k, v]) => `${k}=${v}`).join("; ");
  const baseHeaders = {
    "Content-Type":     "application/json; charset=utf-8",
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent":       UA,
    "Accept":           "application/json, text/javascript, */*; q=0.01",
    "Accept-Language":  "pt-PT,pt;q=0.9",
    "Referer":          DG_BASE + "/PlayerWHS.aspx?no=" + fed,
    "Origin":           "https://scoring.datagolf.pt",
    "Cookie":           cookieHeader,
  };
  const attempts = [
    { name: "plain",       extra: {} },
    { name: "+SecFetch",   extra: { "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty" } },
    { name: "+AcceptEnc",  extra: { "Accept-Encoding": "gzip, deflate, br" } },
    { name: "+Priority",   extra: { "Priority": "u=1, i" } },
    { name: "+AllBrowser", extra: {
        "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty",
        "Accept-Encoding": "gzip, deflate, br",
        "Priority": "u=1, i",
        "Sec-Ch-Ua": '"Chromium";v="124", "Not.A/Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
      } },
  ];

  for (const att of attempts) {
    try {
      const r = await fetch(DG_BASE + "/PlayerWHS.aspx/HCPWhsFederLST?fed_code=" + fed, {
        method: "POST",
        headers: { ...baseHeaders, ...att.extra },
        body: JSON.stringify({ fed_code: fed, jtStartIndex: "0", jtPageSize: "1", jtSorting: "hcp_date DESC" }),
      });
      const text = await r.text();
      let records = null, msg = null;
      try { const j = JSON.parse(text); const d = j.d || j; records = d.Records?.length; msg = d.Message?.slice(0, 80); } catch {}
      steps.push({ label: "POST " + att.name, status: r.status, records, msg });
      if (records != null && records > 0) break;
    } catch (e) { steps.push({ label: "POST " + att.name, error: e.message }); }
  }

  return steps;
}

module.exports = async function handler(req, res) {
  const url    = new URL(req.url, "http://localhost");
  const action = url.searchParams.get("action");
  const fed    = url.searchParams.get("fed");
  const scoreId= url.searchParams.get("score_id");
  const limit  = parseInt(url.searchParams.get("limit") || "200", 10);

  // CORS — permitir que o script de consola do my.fpg.pt envie cookies
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  // save_cookie: POST com { host, cookieHeader } — grava .datagolf-cookies.json
  if (action === "save_cookie" && req.method === "POST") {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!body.cookieHeader || !body.host) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "precisa de host e cookieHeader" }));
        return;
      }
      const fs = require("fs");
      const path = require("path");
      const out = {
        generated: new Date().toISOString(),
        source: `console script @ ${body.host}`,
        host: body.host,
        cookieHeader: body.cookieHeader,
        cookieNames: body.cookieHeader.split(";").map(s => s.trim().split("=")[0]).filter(Boolean),
      };
      fs.writeFileSync(path.join(__dirname, ".datagolf-cookies.json"), JSON.stringify(out, null, 2));
      // Invalidar cache em memória para que o próximo getSession() re-leia o ficheiro
      _dgSessionCache = { cookie: null, ts: 0 };
      console.log(`[datagolf] cookies guardados de ${body.host} (${out.cookieNames.length} cookies)`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, cookies: out.cookieNames }));
      return;
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
      return;
    }
  }

  // Debug: sequência completa GET+GET+GET → POST
  if (action === "debug_fpg_direct") {
    const f = fed || "52884";
    const steps = await debugFpgDirect(f);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ debug: steps }, null, 2));
    return;
  }
  // Debug: forçar uso do backend datagolf (para validar que o cookie roubado funciona)
  if (action === "force_datagolf") {
    const f = fed || "52884";
    try {
      const d = await dgCall(
        "/PlayerWHS.aspx/HCPWhsFederLST?fed_code=" + f,
        { fed_code: f, jtStartIndex: "0", jtPageSize: "3", jtSorting: "hcp_date DESC" },
        "/PlayerWHS.aspx?no=" + f,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, data: unwrap(d), source: "datagolf" }));
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
    }
    return;
  }

  const sendErr = (code, msg) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: msg }));
  };
  const sendOk = (data, source) => {
    res.writeHead(200, {
      "Content-Type":  "application/json",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
      "X-Data-Source": source,
    });
    res.end(JSON.stringify({ ok: true, data, source }));
  };

  try {
    let params;
    switch (action) {
      case "whs":
      case "results":
        if (!fed) return sendErr(400, "fed= obrigatório");
        params = { fed, limit };
        break;
      case "scorecard":
        if (!scoreId) return sendErr(400, "score_id= obrigatório");
        params = { scoreId, fed };
        break;
      case "profile":
      case "handicaps":
        if (!fed) return sendErr(400, "fed= obrigatório");
        params = { fed };
        break;
      default:
        return sendErr(400, "action= inválido. Usa whs|scorecard|profile|handicaps");
    }
    const { data, source } = await tryBoth(action, params);
    return sendOk(data, source);
  } catch (e) {
    sendErr(502, String(e?.message || e));
  }
};
