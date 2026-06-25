/**
 * scripts/probe-rfeg-handicap.js
 *
 * PROBE do serviço público de consulta de hándicap da RFEG:
 *   https://rfegolf.es/paginasservicios/serviciohandicap.aspx
 *   (espelho interno: http://82.223.130.155:3001/PaginasServicios/ServicioHandicap.aspx)
 *
 * OBJECTIVO: descobrir o "contrato" exacto do form ASP.NET WebForms para depois
 * construir o enumerador por apelido (censo de federados espanhóis). Este script
 * NÃO scrapa nada em massa — só faz 1 GET + 2 POSTs de teste e despeja tudo para
 * inspecção. Corre-o no PC (este host tem acesso ao rfegolf.es; o sandbox Cowork
 * NÃO — está bloqueado por política de rede).
 *
 * O que faz:
 *   1. GET da página → captura cookies (ASP.NET_SessionId) + form completo.
 *   2. Disseca o form: <form action>, TODOS os <input>/<select>/<textarea>
 *      (name/id/type/value), hidden fields (__VIEWSTATE / __EVENTVALIDATION /
 *      __VIEWSTATEGENERATOR / __EVENTTARGET), e scan dos <script> inline à procura
 *      de .asmx / PageMethods / UpdatePanel / ScriptResource (caso seja AJAX e não
 *      postback clássico).
 *   3. Heurística: identifica candidatos a campo "licencia" / "apellidos" / "nombre"
 *      e ao botão de submit (por id/name a conter lic/apell/nombre/buscar/consultar).
 *   4. POST de teste A: pesquisa por APELIDO (default "GARCIA") — para ver se devolve
 *      uma LISTA de federados (ideal para enumeração) ou correspondência única.
 *   5. POST de teste B: pesquisa por LICENÇA (default uma que já temos) — para ver o
 *      formato de resultado por licença directa.
 *   6. Guarda o HTML cru de cada resposta em --out e imprime um resumo + primeiras
 *      linhas de qualquer tabela de resultados encontrada.
 *
 * USO (no PC):
 *   node scripts/probe-rfeg-handicap.js
 *   node scripts/probe-rfeg-handicap.js --surname FERNANDEZ --licencia 1100050485
 *   node scripts/probe-rfeg-handicap.js --mirror            # usa o espelho por IP (HTTP :3001)
 *   node scripts/probe-rfeg-handicap.js --out ./rfeg-probe-out
 *
 * Depois envia-me o conteúdo de --out (os 3 .html + o probe-summary.json) e eu
 * finalizo o enumerador com os nomes de campo reais.
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
const USE_MIRROR = argv.includes("--mirror");
const SURNAME = arg("surname", "GARCIA");
const LICENCIA = arg("licencia", "1100050485");
const OUT_DIR = path.resolve(arg("out", "./rfeg-probe-out"));

const HOST_HTTPS = "https://rfegolf.es/paginasservicios/serviciohandicap.aspx";
const HOST_MIRROR = "http://82.223.130.155:3001/PaginasServicios/ServicioHandicap.aspx";
const PAGE_URL = USE_MIRROR ? HOST_MIRROR : HOST_HTTPS;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

/* ─── HTTP (GET/POST, cookie jar, segue redirects) ─────────────── */
const cookieJar = {};
function cookieHeader() {
  return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join("; ");
}
function storeCookies(res) {
  const sc = res.headers["set-cookie"];
  if (!sc) return;
  for (const line of sc) {
    const m = /^([^=]+)=([^;]*)/.exec(line);
    if (m) cookieJar[m[1].trim()] = m[2].trim();
  }
}
function request(method, urlStr, body, retries = 2) {
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
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = Buffer.byteLength(body);
      headers["Origin"] = url.origin;
      headers["Referer"] = urlStr;
    }
    const req = lib.request({
      method,
      hostname: url.hostname,
      port: url.port || (url.protocol === "http:" ? 80 : 443),
      path: url.pathname + url.search,
      headers,
      timeout: 30000,
    }, (res) => {
      storeCookies(res);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, urlStr).toString();
        res.resume();
        request("GET", next, null, retries).then(resolve, reject);
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", (err) => { if (retries > 0) setTimeout(() => request(method, urlStr, body, retries - 1).then(resolve, reject), 1500); else reject(err); });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    if (body != null) req.write(body);
    req.end();
  });
}

/* ─── parsing do form ──────────────────────────────────────────── */
function parseInputs(html) {
  const inputs = [];
  const re = /<(input|select|textarea)\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const get = (a) => { const r = new RegExp(a + '\\s*=\\s*"([^"]*)"', "i").exec(attrs); return r ? r[1] : null; };
    inputs.push({
      tag,
      name: get("name"),
      id: get("id"),
      type: (get("type") || (tag === "select" ? "select" : tag === "textarea" ? "textarea" : "text")).toLowerCase(),
      value: get("value"),
    });
  }
  return inputs;
}
function parseFormAction(html) {
  const m = /<form\b[^>]*\baction\s*=\s*"([^"]*)"/i.exec(html);
  return m ? m[1] : null;
}
function scanScripts(html) {
  const hits = [];
  const patterns = [
    [/[\w./-]+\.asmx(\/[\w]+)?/gi, "asmx web service"],
    [/PageMethods\.\w+/gi, "PageMethods (script service)"],
    [/ScriptResource\.axd/gi, "ScriptResource (AJAX)"],
    [/Sys\.WebForms\.PageRequestManager/gi, "UpdatePanel / partial postback"],
    [/\/api\/[\w./-]+/gi, "possible REST endpoint"],
    [/\$\.(ajax|get|post)\s*\(/gi, "jQuery ajax"],
    [/fetch\s*\(\s*['"][^'"]+['"]/gi, "fetch() call"],
  ];
  for (const [re, label] of patterns) {
    const found = new Set();
    let m;
    while ((m = re.exec(html)) !== null) found.add(m[0]);
    if (found.size) hits.push({ label, samples: [...found].slice(0, 8) });
  }
  return hits;
}
function pickField(inputs, ...needles) {
  // devolve o name do primeiro input de texto cujo id/name contém um dos needles
  for (const inp of inputs) {
    if (!inp.name) continue;
    if (!["text", "search", "textarea"].includes(inp.type)) continue;
    const hay = ((inp.id || "") + " " + (inp.name || "")).toLowerCase();
    if (needles.some((n) => hay.includes(n))) return inp;
  }
  return null;
}
function pickButton(inputs, ...needles) {
  for (const inp of inputs) {
    if (!inp.name) continue;
    if (!["submit", "button", "image"].includes(inp.type)) continue;
    const hay = ((inp.id || "") + " " + (inp.name || "") + " " + (inp.value || "")).toLowerCase();
    if (needles.some((n) => hay.includes(n))) return inp;
  }
  return null;
}
function hidden(inputs) {
  const o = {};
  for (const inp of inputs) if (inp.type === "hidden" && inp.name) o[inp.name] = inp.value || "";
  return o;
}
function firstTablePreview(html) {
  // qualquer <table> com >1 linha; devolve as primeiras 6 linhas como matriz de células
  const tables = [];
  const re = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const rowsHtml = m[1].match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    if (rowsHtml.length < 2) continue;
    const rows = rowsHtml.slice(0, 6).map((tr) => {
      const cells = tr.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || [];
      return cells.map((c) => c.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());
    });
    const idM = /<table\b[^>]*\bid="([^"]*)"/i.exec(m[0]);
    tables.push({ id: idM ? idM[1] : null, totalRows: rowsHtml.length, preview: rows });
  }
  return tables.sort((a, b) => b.totalRows - a.totalRows).slice(0, 4);
}

/* ─── postback ASP.NET ─────────────────────────────────────────── */
function buildPostBody(hiddenFields, fieldName, value, button) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(hiddenFields)) params.set(k, v);
  if (button && button.name) {
    // se for submit clássico, manda o name=value do botão; senão usa __EVENTTARGET
    params.set(button.name, button.value || "Buscar");
  } else {
    params.set("__EVENTTARGET", "");
    params.set("__EVENTARGUMENT", "");
  }
  if (fieldName) params.set(fieldName, value);
  return params.toString();
}

/* ─── main ─────────────────────────────────────────────────────── */
(async () => {
  const summary = { pageUrl: PAGE_URL, ranAt: new Date().toISOString(), steps: {} };
  console.log("PROBE RFEG hándicap →", PAGE_URL);
  console.log("OUT:", OUT_DIR);

  /* 1. GET */
  let getRes;
  try {
    getRes = await request("GET", PAGE_URL, null);
  } catch (e) {
    console.error("FALHOU o GET:", e.message);
    console.error("Se for ECONNREFUSED/403 podes estar num host bloqueado. Tenta no PC, ou --mirror.");
    process.exit(1);
  }
  fs.writeFileSync(path.join(OUT_DIR, "01-page.html"), getRes.body);
  console.log(`\n[GET] status=${getRes.status} bytes=${getRes.body.length} cookies=${Object.keys(cookieJar).join(",") || "(none)"}`);
  summary.steps.get = { status: getRes.status, bytes: getRes.body.length, cookies: Object.keys(cookieJar) };

  if (getRes.status !== 200) {
    console.error("GET não devolveu 200 — não dá para dissecar o form. Vê 01-page.html.");
    fs.writeFileSync(path.join(OUT_DIR, "probe-summary.json"), JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  const inputs = parseInputs(getRes.body);
  const action = parseFormAction(getRes.body);
  const hiddenFields = hidden(inputs);
  const scripts = scanScripts(getRes.body);

  const licField = pickField(inputs, "licen", "numlic", "nlic");
  const apeField = pickField(inputs, "apell", "apel");
  const nomField = pickField(inputs, "nombre", "nom");
  const button = pickButton(inputs, "buscar", "consult", "submit", "btn", "aceptar");

  console.log("\n=== FORM ===");
  console.log("action:", action);
  console.log("hidden fields:", Object.keys(hiddenFields).map((k) => k + (hiddenFields[k] ? `(${hiddenFields[k].length}b)` : "(empty)")).join(", "));
  console.log("\ncampos visíveis (name | id | type | value):");
  for (const inp of inputs) {
    if (inp.type === "hidden") continue;
    console.log(`  ${inp.name || "-"} | ${inp.id || "-"} | ${inp.type} | ${inp.value || ""}`);
  }
  console.log("\nheurística:");
  console.log("  campo licença  →", licField ? `${licField.name}` : "(não encontrado)");
  console.log("  campo apelidos →", apeField ? `${apeField.name}` : "(não encontrado)");
  console.log("  campo nome     →", nomField ? `${nomField.name}` : "(não encontrado)");
  console.log("  botão submit   →", button ? `${button.name} = "${button.value || ""}"` : "(não encontrado)");
  if (scripts.length) {
    console.log("\n⚠ scripts/AJAX detectados (pode não ser postback clássico):");
    for (const s of scripts) console.log(`  ${s.label}: ${s.samples.join("  ")}`);
  }
  summary.steps.form = {
    action,
    hiddenFields: Object.keys(hiddenFields),
    visibleInputs: inputs.filter((i) => i.type !== "hidden"),
    heuristics: {
      licencia: licField ? licField.name : null,
      apellidos: apeField ? apeField.name : null,
      nombre: nomField ? nomField.name : null,
      button: button ? { name: button.name, value: button.value } : null,
    },
    scriptHits: scripts,
  };

  const postUrl = action ? new URL(action, PAGE_URL).toString() : PAGE_URL;

  /* 2. POST por APELIDO */
  if (apeField) {
    try {
      const body = buildPostBody(hiddenFields, apeField.name, SURNAME, button);
      const res = await request("POST", postUrl, body);
      fs.writeFileSync(path.join(OUT_DIR, "02-by-surname.html"), res.body);
      const tables = firstTablePreview(res.body);
      console.log(`\n[POST apelido="${SURNAME}"] status=${res.status} bytes=${res.body.length} → 02-by-surname.html`);
      console.log("  tabelas encontradas:", tables.map((t) => `${t.id || "?"}(${t.totalRows} linhas)`).join(", ") || "nenhuma");
      if (tables[0]) { console.log("  preview da maior tabela:"); for (const r of tables[0].preview) console.log("   ", r.join(" | ")); }
      summary.steps.bySurname = { status: res.status, bytes: res.body.length, tables: tables.map((t) => ({ id: t.id, totalRows: t.totalRows, preview: t.preview })) };
    } catch (e) {
      console.error("POST apelido falhou:", e.message);
      summary.steps.bySurname = { error: e.message };
    }
  } else {
    console.log("\n[POST apelido] saltado — não identifiquei o campo de apelidos (vê os campos acima e corrige a heurística).");
  }

  /* re-GET para refrescar ViewState antes do 2º POST (ASP.NET invalida-o por request) */
  let h2 = hiddenFields, b2 = button;
  try {
    const fresh = await request("GET", PAGE_URL, null);
    const fi = parseInputs(fresh.body);
    h2 = hidden(fi);
    b2 = pickButton(fi, "buscar", "consult", "submit", "btn", "aceptar") || button;
  } catch (_) {}

  /* 3. POST por LICENÇA */
  if (licField) {
    try {
      const body = buildPostBody(h2, licField.name, LICENCIA, b2);
      const res = await request("POST", postUrl, body);
      fs.writeFileSync(path.join(OUT_DIR, "03-by-licencia.html"), res.body);
      const tables = firstTablePreview(res.body);
      console.log(`\n[POST licencia="${LICENCIA}"] status=${res.status} bytes=${res.body.length} → 03-by-licencia.html`);
      console.log("  tabelas encontradas:", tables.map((t) => `${t.id || "?"}(${t.totalRows} linhas)`).join(", ") || "nenhuma");
      if (tables[0]) { console.log("  preview:"); for (const r of tables[0].preview) console.log("   ", r.join(" | ")); }
      summary.steps.byLicencia = { status: res.status, bytes: res.body.length, tables: tables.map((t) => ({ id: t.id, totalRows: t.totalRows, preview: t.preview })) };
    } catch (e) {
      console.error("POST licença falhou:", e.message);
      summary.steps.byLicencia = { error: e.message };
    }
  } else {
    console.log("\n[POST licença] saltado — não identifiquei o campo de licença.");
  }

  fs.writeFileSync(path.join(OUT_DIR, "probe-summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n✓ Probe terminado. Envia-me a pasta", OUT_DIR, "(3 .html + probe-summary.json).");
  console.log("  O que confirmar: (a) apelido devolve LISTA? (b) há paginação? (c) que colunas vêm (licença/nome/clube/hcp/cat)?");
})();
