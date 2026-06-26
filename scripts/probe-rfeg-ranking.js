/**
 * scripts/probe-rfeg-ranking.js
 *
 * PROBE do ranking público da RFEG:  https://rfegolf.es/RankingPagina/RankingList.aspx
 *
 * 3 dropdowns dependentes (SharePoint WebForms). ⚠ Os <select> usam
 * `onchange="__doPostBack(...)"` → POSTBACK COMPLETO (não async). E o ASP.NET tem
 * EnableEventValidation: cada valor de dropdown enviado TEM de estar registado no
 * __EVENTVALIDATION corrente, senão devolve erro 500. Por isso:
 *   - postbacks COMPLETOS (sem X-MicrosoftAjax)
 *   - enviar o VALOR DA OPÇÃO SELECCIONADA de cada select (nunca vazio)
 *   - SALTAR selects disabled (ddlFecha começa disabled; o browser não o envia)
 *   - encadear __VIEWSTATE/__EVENTVALIDATION frescos de cada resposta
 *
 * Fluxo:  ddlaño/ddlComite (15=Masc 16=Fem 17=Juvenil 18=Prof 19=P&P 20=Adaptado
 *   22=Por Hándicap) → __doPostBack(ddlComite) preenche ddlRanking →
 *   __doPostBack(ddlRanking) preenche ddlFecha → BTEnviar (image) → grelha.
 *
 * USO (no PC — o sandbox Cowork está bloqueado por política de rede):
 *   node scripts/probe-rfeg-ranking.js                       # default: Juvenil, ano recente
 *   node scripts/probe-rfeg-ranking.js --comite "Por Hándicap" --year 2026
 * Envia-me a pasta --out (./rfeg-ranking-probe): os .html + ranking-summary.json.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const argv = process.argv.slice(2);
function arg(name, def) { const i = argv.indexOf("--" + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def; }
const PAGE = "https://rfegolf.es/RankingPagina/RankingList.aspx";
const WANT_COMITE = arg("comite", "Juvenil");
const WANT_YEAR = arg("year", null);
const WANT_RANKING = arg("ranking", null);   // texto a procurar nas opções de ddlRanking
const OUT_DIR = path.resolve(arg("out", "./rfeg-ranking-probe"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

/* ─── HTTP (cookie jar + redirects) ───────────────────────────── */
const jar = {};
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
function store(res) { const sc = res.headers["set-cookie"]; if (sc) for (const l of sc) { const m = /^([^=]+)=([^;]*)/.exec(l); if (m) jar[m[1].trim()] = m[2].trim(); } }
function req(method, url, body, retries = 2) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = { "User-Agent": UA, "Accept": "text/html,*/*;q=0.8", "Accept-Language": "es-ES,es;q=0.9", "Cache-Control": "no-cache" };
    if (Object.keys(jar).length) headers["Cookie"] = cookieHeader();
    if (body != null) { headers["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8"; headers["Content-Length"] = Buffer.byteLength(body); headers["Origin"] = u.origin; headers["Referer"] = url; }
    const r = https.request({ method, hostname: u.hostname, path: u.pathname + u.search, headers, timeout: 30000 }, (res) => {
      store(res);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { const next = new URL(res.headers.location, url).toString(); res.resume(); req("GET", next, null, retries).then(resolve, reject); return; }
      const c = []; res.on("data", (x) => c.push(x)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(c).toString("utf8") }));
    });
    r.on("error", (e) => { if (retries > 0) setTimeout(() => req(method, url, body, retries - 1).then(resolve, reject), 1500); else reject(e); });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    if (body != null) r.write(body); r.end();
  });
}

/* ─── parsing ─────────────────────────────────────────────────── */
function decode(s) { return String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/<[^>]+>/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ").replace(/\s+/g, " ").trim(); }
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function inputs(html) {
  const o = []; const re = /<(input|select|textarea)\b([^>]*)>/gi; let m;
  while ((m = re.exec(html))) { const a = m[2]; const g = (x) => { const r = new RegExp(x + '\\s*=\\s*"([^"]*)"', "i").exec(a); return r ? r[1] : null; };
    o.push({ tag: m[1].toLowerCase(), name: g("name"), id: g("id"), type: (g("type") || (m[1].toLowerCase() === "select" ? "select" : "text")).toLowerCase(), value: g("value"), disabled: /\bdisabled\b/i.test(a) }); }
  return o;
}
function selectOptions(html, nameEnds) {
  const re = new RegExp('<select[^>]*name="([^"]*' + reEsc(nameEnds) + ')"[^>]*>([\\s\\S]*?)</select>', "i");
  const m = re.exec(html); if (!m) return { name: null, disabled: false, options: [] };
  const disabled = /\bdisabled\b/i.test(html.slice(m.index, m.index + m[0].indexOf(">") + 1));
  const opts = []; const ore = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi; let o;
  while ((o = ore.exec(m[2]))) { const v = /value="([^"]*)"/i.exec(o[1]); opts.push({ value: v ? v[1] : decode(o[2]), text: decode(o[2]), selected: /\bselected\b/i.test(o[1]) }); }
  return { name: m[1], disabled, options: opts };
}
function curSelected(sel) { const o = (sel.options || []).find((x) => x.selected) || (sel.options || [])[0]; return o ? o.value : ""; }
function tables(html) {
  const out = []; const re = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi; let m;
  while ((m = re.exec(html))) { const id = /\bid="([^"]*)"/i.exec(m[1]); const rows = m[2].match(/<tr\b[\s\S]*?<\/tr>/gi) || []; if (rows.length < 2) continue; out.push({ id: id ? id[1] : null, totalRows: rows.length, rows: rows.slice(0, 10).map((tr) => (tr.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || []).map(decode)) }); }
  return out.sort((a, b) => b.totalRows - a.totalRows);
}
const enc = (o) => Object.entries(o).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");

/* nomes dos 4 selects (estáveis entre postbacks) — resolvidos uma vez */
let NAMES = {};
function resolveNames(html) {
  NAMES = {
    year: selectOptions(html, "$ddlaño").name,
    comite: selectOptions(html, "$ddlComite").name,
    ranking: selectOptions(html, "$ddlRanking").name,
    fecha: selectOptions(html, "$ddlFecha").name,
    btn: (inputs(html).find((i) => i.name && i.name.endsWith("$BTEnviar")) || {}).name,
  };
}

/* Postback COMPLETO. Constrói o body a partir do HTML CORRENTE (hidden + valores
 * seleccionados de cada select activo), aplica `choose`, define __EVENTTARGET. */
async function postback(curHtml, eventTarget, choose, label, isSubmit) {
  const f = {};
  for (const i of inputs(curHtml)) {
    if (!i.name || i.disabled) continue;
    if (["image", "submit", "button"].includes(i.type)) continue;
    if (i.tag === "select") continue;               // selects tratados à parte
    f[i.name] = i.value || "";
  }
  for (const ends of ["$ddlaño", "$ddlComite", "$ddlRanking", "$ddlFecha"]) {
    const s = selectOptions(curHtml, ends);
    if (s.name && !s.disabled) f[s.name] = curSelected(s);   // valor REGISTADO (selected/1ª opção)
  }
  Object.assign(f, choose || {});
  f["__EVENTTARGET"] = eventTarget || ""; f["__EVENTARGUMENT"] = "";
  if (isSubmit && NAMES.btn) { f[NAMES.btn + ".x"] = "9"; f[NAMES.btn + ".y"] = "11"; }
  const r = await req("POST", PAGE, enc(f));
  fs.writeFileSync(path.join(OUT_DIR, label + ".html"), r.body);
  return r;
}

/* ─── main ────────────────────────────────────────────────────── */
(async () => {
  const summary = { page: PAGE, ranAt: new Date().toISOString(), steps: {} };
  console.log("PROBE ranking (postback completo) →", PAGE, "\nOUT:", OUT_DIR);

  let g;
  try { g = await req("GET", PAGE, null); } catch (e) { console.error("GET falhou:", e.message, "(host bloqueado? corre no PC)"); process.exit(1); }
  fs.writeFileSync(path.join(OUT_DIR, "01-page.html"), g.body);
  resolveNames(g.body);
  const ddlYear = selectOptions(g.body, "$ddlaño");
  const ddlComite = selectOptions(g.body, "$ddlComite");
  console.log(`\n[01 GET] ${g.status} ${g.body.length}b  selects: año=${!!NAMES.year} comite=${!!NAMES.comite} ranking=${!!NAMES.ranking} fecha=${!!NAMES.fecha} btn=${!!NAMES.btn}`);
  console.log("  comités:", ddlComite.options.filter((o) => o.value !== "-1").map((o) => `${o.value}=${o.text}`).join(" | "));
  summary.steps.get = { status: g.status, names: NAMES, ddlYear: ddlYear.options, ddlComite: ddlComite.options };

  const yearVal = (ddlYear.options.find((o) => WANT_YEAR ? o.text == WANT_YEAR : o.selected) || ddlYear.options[0] || {}).value;
  const comiteOpt = ddlComite.options.find((o) => o.value !== "-1" && new RegExp(reEsc(WANT_COMITE), "i").test(o.text)) || ddlComite.options.find((o) => o.value !== "-1");
  if (!comiteOpt || !NAMES.comite) { console.log("Sem comité — ver 01-page.html."); fs.writeFileSync(path.join(OUT_DIR, "ranking-summary.json"), JSON.stringify(summary, null, 2)); return; }
  console.log(`\n→ año=${yearVal}  comité="${comiteOpt.text}" (v=${comiteOpt.value})`);

  // 02: __doPostBack(ddlComite) → preenche ddlRanking
  const r2 = await postback(g.body, NAMES.comite, { [NAMES.year]: yearVal, [NAMES.comite]: comiteOpt.value }, "02-cascade-comite", false);
  const ddlRanking = selectOptions(r2.body, "$ddlRanking");
  const okR = r2.status === 200 && ddlRanking.options.some((o) => !/seleccione/i.test(o.text));
  console.log(`[02 comité] ${r2.status} ${r2.body.length}b → ddlRanking: ${ddlRanking.options.map((o) => o.text).filter((t) => !/seleccione/i.test(t)).join(" | ") || (r2.status !== 200 ? "(ERRO " + r2.status + " — ver 02)" : "(vazio)")}`);
  summary.steps.cascadeComite = { status: r2.status, ddlRanking: ddlRanking.options };

  if (!okR) {
    fs.writeFileSync(path.join(OUT_DIR, "ranking-summary.json"), JSON.stringify(summary, null, 2));
    console.log("\n⚠ A cascata do comité não devolveu rankings. Ver 02-cascade-comite.html (pode ser 500 de EventValidation).");
    return;
  }

  // 03: __doPostBack(ddlRanking) → preenche ddlFecha
  const rankOpt = ddlRanking.options.find((o) => !/seleccione/i.test(o.text) && (WANT_RANKING ? new RegExp(reEsc(WANT_RANKING), "i").test(o.text) : true)) || ddlRanking.options.find((o) => !/seleccione/i.test(o.text));
  const r3 = await postback(r2.body, NAMES.ranking, { [NAMES.ranking]: rankOpt.value }, "03-cascade-ranking", false);
  const ddlFecha = selectOptions(r3.body, "$ddlFecha");
  const fechaOpt = ddlFecha.options.find((o) => !/seleccione/i.test(o.text));
  console.log(`[03 ranking="${rankOpt.text}"] ${r3.status} ${r3.body.length}b → ddlFecha: ${ddlFecha.options.map((o) => o.text).filter((t) => !/seleccione/i.test(t)).slice(0, 8).join(" | ") || "(sem fecha / opcional)"}`);
  summary.steps.cascadeRanking = { status: r3.status, ranking: rankOpt.text, ddlFecha: ddlFecha.options };

  // 04: submit BTEnviar → grelha
  const choose4 = {}; if (fechaOpt && NAMES.fecha) choose4[NAMES.fecha] = fechaOpt.value;
  let r4 = await postback(r3.body, "", choose4, "04-ranking-grid", true);
  const redir = /(?:window\.location\s*=\s*"|pageRedirect\|\|)([^"|]+)/.exec(r4.body);
  if (redir) { const ru = new URL(decode(redir[1]).trim(), PAGE).toString(); console.log("  redirect →", ru); r4 = await req("GET", ru, null); fs.writeFileSync(path.join(OUT_DIR, "04-ranking-grid.html"), r4.body); }
  const tabs = tables(r4.body);
  console.log(`[04 grid] ${r4.status} ${r4.body.length}b`);
  console.log("  tabelas (top por nº linhas):");
  for (const t of tabs.slice(0, 5)) { console.log(`    #${t.id || "?"} (${t.totalRows} linhas):`); for (const row of t.rows.slice(0, 4)) console.log("       ", row.join(" | ")); }
  summary.steps.grid = { status: r4.status, bytes: r4.body.length, redirect: redir ? redir[1] : null, tables: tabs.slice(0, 5) };

  fs.writeFileSync(path.join(OUT_DIR, "ranking-summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n✓ Probe ranking terminado. Envia a pasta", OUT_DIR, ".");
  console.log("  Confirma: a grelha traz licença + clube + pontos? quantas linhas (completa ou paginada)?");
})();
