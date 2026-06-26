/**
 * scripts/probe-rfeg-handicap.js  (v2)
 *
 * PROBE do serviço público de consulta de hándicap da RFEG:
 *   https://rfegolf.es/paginasservicios/serviciohandicap.aspx
 *
 * v1 dissecava o form mas submetia no botão errado (o search do cabeçalho) e o
 * BTEnviar real é um IMAGE button dentro de um UpdatePanel SharePoint — por isso
 * a pesquisa nunca disparava. v2 corrige:
 *   - usa o botão certo `…$ctl00$BTEnviar` com coordenadas .x/.y (image button)
 *   - mantém TODOS os hidden SharePoint (__VIEWSTATE, __EVENTVALIDATION,
 *     __REQUESTDIGEST, MSO*) tal como o browser
 *   - tenta full-postback (parse fácil) e, se não render, fallback async
 *     (X-MicrosoftAjax: Delta=true + ScriptManager1=upInscritos|BTEnviar + __ASYNCPOST)
 *
 * Resultado conhecido da página (descoberto via dump v1):
 *   - pesquisa por LICENÇA  → painel único: lblConsultaNombre / lblConsultaHandicap /
 *     lblConsultaHandicapmundial / lblHpStatus (Estado) / lblConsultaModificacion
 *   - pesquisa por APELIDO  → grelha `PanelGridHandicaps` (LISTA de federados)
 *
 * USO (corre no PC — o sandbox Cowork está bloqueado por política de rede):
 *   node scripts/probe-rfeg-handicap.js                          # search handicap (licença + apelido)
 *   node scripts/probe-rfeg-handicap.js --surname FERNANDEZ --licencia 1100050485
 *   node scripts/probe-rfeg-handicap.js --url https://rfegolf.es/RankingPagina/RankingList.aspx   # só dissecar
 *
 * Depois envia-me a pasta --out (./rfeg-probe-out): os .html + probe-summary.json.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

/* ─── args ─────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
}
const SURNAME = arg("surname", "GARCIA");
const LICENCIA = arg("licencia", "1100050485");
const OUT_DIR = path.resolve(arg("out", "./rfeg-probe-out"));
const PAGE_URL = arg("url", "https://rfegolf.es/paginasservicios/serviciohandicap.aspx");
const DISSECT_ONLY = PAGE_URL.toLowerCase().indexOf("serviciohandicap") < 0;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

/* ─── HTTP (GET/POST, cookie jar, segue redirects) ─────────────── */
const cookieJar = {};
function cookieHeader() { return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join("; "); }
function storeCookies(res) {
  const sc = res.headers["set-cookie"]; if (!sc) return;
  for (const line of sc) { const m = /^([^=]+)=([^;]*)/.exec(line); if (m) cookieJar[m[1].trim()] = m[2].trim(); }
}
function request(method, urlStr, body, extraHeaders, retries = 2) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "http:" ? http : https;
    const headers = {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
    };
    if (Object.keys(cookieJar).length) headers["Cookie"] = cookieHeader();
    if (body != null) {
      headers["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8";
      headers["Content-Length"] = Buffer.byteLength(body);
      headers["Origin"] = url.origin;
      headers["Referer"] = urlStr;
    }
    Object.assign(headers, extraHeaders || {});
    const req = lib.request({
      method, hostname: url.hostname, port: url.port || (url.protocol === "http:" ? 80 : 443),
      path: url.pathname + url.search, headers, timeout: 30000,
    }, (res) => {
      storeCookies(res);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, urlStr).toString();
        res.resume(); request("GET", next, null, extraHeaders, retries).then(resolve, reject); return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", (err) => { if (retries > 0) setTimeout(() => request(method, urlStr, body, extraHeaders, retries - 1).then(resolve, reject), 1500); else reject(err); });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    if (body != null) req.write(body);
    req.end();
  });
}

/* ─── parsing ──────────────────────────────────────────────────── */
function parseInputs(html) {
  const inputs = []; const re = /<(input|select|textarea)\b([^>]*)>/gi; let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase(); const attrs = m[2];
    const get = (a) => { const r = new RegExp(a + '\\s*=\\s*"([^"]*)"', "i").exec(attrs); return r ? r[1] : null; };
    inputs.push({ tag, name: get("name"), id: get("id"),
      type: (get("type") || (tag === "select" ? "select" : tag === "textarea" ? "textarea" : "text")).toLowerCase(),
      value: get("value") });
  }
  return inputs;
}
function decode(s){return String(s||"").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&aacute;/g,"á").replace(/&eacute;/g,"é").replace(/&iacute;/g,"í").replace(/&oacute;/g,"ó").replace(/&uacute;/g,"ú").replace(/&ntilde;/g,"ñ");}
function txt(s){return decode(String(s||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());}
function spanText(html, idEnds) {
  const re = new RegExp('<span[^>]*id="[^"]*' + idEnds + '"[^>]*>([\\s\\S]*?)</span>', "i");
  const m = re.exec(html); return m ? txt(m[1]) : null;
}
function scanScripts(html) {
  const hits = []; const P = [
    [/[\w./-]+\.asmx(\/[A-Za-z]\w+)?/gi, "asmx"], [/\.aspx\/[A-Z]\w+/gi, "PageMethod (.aspx/Method)"],
    [/listAction\s*[:=]\s*['"][^'"]+['"]/gi, "jTable listAction"], [/[A-Za-z]\w*LST\b/g, "*LST method"],
    [/PageMethods\.\w+/gi, "PageMethods"], [/Sys\.WebForms\.PageRequestManager/gi, "UpdatePanel"],
    [/jtStartIndex|jtPageSize|jtSorting/gi, "jTable params"], [/\$\.(ajax|getJSON|post)\s*\(/gi, "jQuery ajax"],
  ];
  for (const [re, label] of P) { const f = new Set(); let m; while ((m = re.exec(html)) !== null) f.add(m[0]); if (f.size) hits.push({ label, samples: [...f].slice(0, 10) }); }
  return hits;
}
function allTables(html) {
  const out = []; const re = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi; let m;
  while ((m = re.exec(html)) !== null) {
    const idM = /\bid="([^"]*)"/i.exec(m[1]); const rows = m[2].match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    if (rows.length < 1) continue;
    out.push({ id: idM ? idM[1] : null, totalRows: rows.length,
      rows: rows.slice(0, 12).map((tr) => (tr.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || []).map(txt)) });
  }
  return out;
}
function extractById(html, idEnds) {
  // devolve o innerHTML aproximado de um <div id="...idEnds"> (até ao fecho — heurístico)
  const re = new RegExp('<div[^>]*id="[^"]*' + idEnds + '"[^>]*>', "i");
  const m = re.exec(html); if (!m) return null;
  const start = m.index + m[0].length;
  // corta um bloco generoso; suficiente para inspeccionar a grelha
  return html.slice(start, start + 8000);
}

/* ─── postback builders ────────────────────────────────────────── */
function formFields(inputs) {
  // mapa name→value de TODOS os inputs não-image (mimics browser), hidden mantém valor
  const o = {};
  for (const inp of inputs) {
    if (!inp.name) continue;
    if (inp.type === "image" || inp.type === "submit" || inp.type === "button") continue;
    o[inp.name] = inp.value || "";
  }
  return o;
}
function encodeBody(obj) {
  return Object.entries(obj).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
}

/* parse de resposta (full ou async) → campos do registo único + grelha */
function parseHandicapResult(html) {
  return {
    nombre: spanText(html, "lblConsultaNombre"),
    handicap: spanText(html, "lblConsultaHandicap"),
    handicapMundial: spanText(html, "lblConsultaHandicapmundial"),
    estado: spanText(html, "lblHpStatus"),
    modificacion: spanText(html, "lblConsultaModificacion"),
    error: spanText(html, "lblError"),
    gridRaw: extractById(html, "PanelGridHandicaps"),
    gridTables: allTables(extractById(html, "PanelGridHandicaps") || ""),
  };
}

/* ─── main ─────────────────────────────────────────────────────── */
(async () => {
  const summary = { pageUrl: PAGE_URL, ranAt: new Date().toISOString(), steps: {} };
  console.log("PROBE v2 →", PAGE_URL, "\nOUT:", OUT_DIR);

  let getRes;
  try { getRes = await request("GET", PAGE_URL, null); }
  catch (e) { console.error("GET falhou:", e.message, "\n(host bloqueado? corre no PC.)"); process.exit(1); }
  fs.writeFileSync(path.join(OUT_DIR, "01-page.html"), getRes.body);
  console.log(`\n[GET] status=${getRes.status} bytes=${getRes.body.length} cookies=${Object.keys(cookieJar).join(",") || "(none)"}`);
  if (getRes.status !== 200) { console.error("GET != 200, ver 01-page.html"); process.exit(1); }

  const inputs = parseInputs(getRes.body);
  const scripts = scanScripts(getRes.body);
  summary.steps.get = { status: getRes.status, bytes: getRes.body.length, scriptHits: scripts };

  /* ── modo dissecar-só (ex: RankingList.aspx) ── */
  if (DISSECT_ONLY) {
    console.log("\n=== DISSECT (sem submit) ===");
    console.log("campos visíveis:");
    for (const inp of inputs) if (inp.type !== "hidden") console.log(`  ${inp.name || "-"} | ${inp.id || "-"} | ${inp.type} | ${inp.value || ""}`);
    console.log("hidden:", inputs.filter(i => i.type === "hidden").map(i => i.name).join(", "));
    if (scripts.length) { console.log("\nscripts/AJAX/jTable:"); for (const s of scripts) console.log(`  ${s.label}: ${s.samples.join("  ")}`); }
    const tabs = allTables(getRes.body).sort((a, b) => b.totalRows - a.totalRows).slice(0, 5);
    console.log("\ntabelas (top 5 por nº de linhas):");
    for (const t of tabs) { console.log(`  #${t.id || "?"} (${t.totalRows} linhas):`); for (const r of t.rows.slice(0, 4)) console.log("     ", r.join(" | ")); }
    summary.steps.dissect = { visibleInputs: inputs.filter(i => i.type !== "hidden"), hidden: inputs.filter(i => i.type === "hidden").map(i => i.name), tables: tabs };
    fs.writeFileSync(path.join(OUT_DIR, "probe-summary.json"), JSON.stringify(summary, null, 2));
    console.log("\n✓ Dissect terminado. Envia 01-page.html + probe-summary.json.");
    return;
  }

  /* ── descobrir prefixo da WebPart + IDs do UpdatePanel/ScriptManager ── */
  const licInp = inputs.find((i) => i.name && i.name.endsWith("$txt_H_Licencia"));
  if (!licInp) { console.error("Não encontrei txt_H_Licencia — a página mudou. Ver 01-page.html."); process.exit(1); }
  const P = licInp.name.replace(/\$txt_H_Licencia$/, "");      // ctl00$m$g_<guid>$ctl00
  const fLic = P + "$txt_H_Licencia", fNom = P + "$txt_H_Nombre", fAp1 = P + "$txt_H_Apellido1", fAp2 = P + "$txt_H_Apellido2";
  const btn = P + "$BTEnviar";
  const smM = /PageRequestManager\._initialize\('([^']+)'/.exec(getRes.body);
  const sm = smM ? smM[1] : "ctl00$ScriptManager1";
  const upM = new RegExp("'t(" + P.replace(/[$]/g, "\\$") + "\\$up\\w+)'").exec(getRes.body);
  const updatePanel = upM ? upM[1] : (P + "$upInscritos");
  console.log("\n=== contrato ===");
  console.log("  prefixo WebPart :", P);
  console.log("  campos          :", "lic=" + fLic);
  console.log("  botão (image)   :", btn);
  console.log("  ScriptManager   :", sm);
  console.log("  UpdatePanel     :", updatePanel);
  summary.contract = { prefix: P, fLic, fNom, fAp1, fAp2, btn, sm, updatePanel };

  const empty = (p) => (!p.handicap || p.handicap === "-----") && (!p.gridTables || !p.gridTables.length || !p.gridTables.some(t => t.totalRows > 0));

  // A pesquisa resolve numa URL GET limpa: ServicioHandicap.aspx?HLic=… ou ?HAp1=…
  // (descoberto via pageRedirect/window.location no dump v2). Fazemos GET directo;
  // se vier vazio, tentamos um async postback e seguimos qualquer pageRedirect.
  async function fetchResult(params, label) {
    const qs = Object.entries(params).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
    const url = PAGE_URL + "?" + qs;
    let res = await request("GET", url, null);
    let parsed = parseHandicapResult(res.body);
    let mode = "get";

    if (empty(parsed)) {
      // fallback: async postback do BTEnviar na própria página de query-string
      const ins = parseInputs(res.body);
      const licInp2 = ins.find((i) => i.name && i.name.endsWith("$txt_H_Licencia"));
      if (licInp2) {
        const P2 = licInp2.name.replace(/\$txt_H_Licencia$/, ""); const btn2 = P2 + "$BTEnviar";
        const smM = /PageRequestManager\._initialize\('([^']+)'/.exec(res.body); const sm2 = smM ? smM[1] : "ctl00$ScriptManager1";
        const upM = new RegExp("'t(" + P2.replace(/[$]/g, "\\$") + "\\$up\\w+)'").exec(res.body); const up2 = upM ? upM[1] : (P2 + "$upInscritos");
        const base = formFields(ins); base["__EVENTTARGET"] = ""; base["__EVENTARGUMENT"] = "";
        base[sm2] = up2 + "|" + btn2; base["__ASYNCPOST"] = "true"; base[btn2 + ".x"] = "9"; base[btn2 + ".y"] = "11";
        const r2 = await request("POST", url, encodeBody(base), { "X-MicrosoftAjax": "Delta=true", "X-Requested-With": "XMLHttpRequest" });
        const redir = /pageRedirect\|\|([^|]+)\|/.exec(r2.body);
        if (redir) { const rurl = new URL(decodeURIComponent(redir[1]), PAGE_URL).toString(); res = await request("GET", rurl, null); parsed = parseHandicapResult(res.body); mode = "get→redirect"; }
        else { res = r2; parsed = parseHandicapResult(r2.body); mode = "async"; }
      }
    }
    const fn = "res-" + label.replace(/[^A-Za-z0-9_-]/g, "_") + "-" + mode.replace(/[^a-z]/g, "") + ".html";
    fs.writeFileSync(path.join(OUT_DIR, fn), res.body);
    console.log(`\n[${label}] (${url}) mode=${mode} status=${res.status} bytes=${res.body.length} → ${fn}`);
    console.log("  registo único:", JSON.stringify({ nombre: parsed.nombre, handicap: parsed.handicap, handicapMundial: parsed.handicapMundial, estado: parsed.estado, modificacion: parsed.modificacion }));
    console.log("  lblError:", parsed.error);
    if (parsed.gridTables && parsed.gridTables.length && parsed.gridTables.some(t => t.totalRows > 0)) {
      console.log("  GRELHA PanelGridHandicaps:");
      for (const t of parsed.gridTables) { if (!t.totalRows) continue; console.log(`    tabela #${t.id || "?"} (${t.totalRows} linhas):`); for (const r of t.rows.slice(0, 10)) console.log("       ", r.join(" | ")); }
    } else {
      console.log("  GRELHA: vazia (gridRaw len=" + ((parsed.gridRaw || "").length) + ")");
    }
    return { url, mode, status: res.status, parsed: { ...parsed, gridRaw: (parsed.gridRaw || "").slice(0, 6000) } };
  }

  // licenças de teste: seguramente ACTIVAS (juniores vistos hoje), um de cada formato
  const TEST_LICS = arg("licencia", null)
    ? [arg("licencia", null)]
    : ["1106478321", "AM51917193", "CM11939859", LICENCIA];
  summary.steps.bySurname = await fetchResult({ HAp1: SURNAME }, "apellido-" + SURNAME);
  summary.steps.byLicencia = [];
  for (const lic of TEST_LICS) summary.steps.byLicencia.push(await fetchResult({ HLic: lic }, "licencia-" + lic));

  fs.writeFileSync(path.join(OUT_DIR, "probe-summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n✓ Probe v2 terminado. Envia a pasta", OUT_DIR, "(search-*.html + probe-summary.json).");
  console.log("  Confirma: (a) por licença → handicap preenchido? (b) por apelido → grelha com que COLUNAS (licença/nome/club/hcp/cat)? (c) há cap/paginação p/ apelidos comuns?");
})();
