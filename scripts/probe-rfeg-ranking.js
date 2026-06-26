/**
 * scripts/probe-rfeg-ranking.js
 *
 * PROBE do ranking público da RFEG:  https://rfegolf.es/RankingPagina/RankingList.aspx
 *
 * 3 dropdowns dependentes (SharePoint + UpdatePanel, autopostback em cada onchange):
 *   ddlaño (2009-2026) → ddlComite (15=Masculino 16=Femenino 17=Juvenil 18=Profesionales
 *   19=Pitch&Putt 20=Golf Adaptado 22=Por Hándicap) → ddlRanking (depende do Comité) →
 *   ddlFecha (depende do Ranking) → BTEnviar (image) → grelha de jogadores.
 *
 * Ao contrário do serviço de hcp (cap 20), um ranking é uma LISTA ORDENADA (sem cap
 * por apelido) e pode trazer clube/pontos. Este probe conduz a cascata ASP.NET com
 * encadeamento de ViewState e captura a grelha:
 *   01 GET                         → opções de ddlaño/ddlComite
 *   02 async: seleccionar Comité   → opções de ddlRanking
 *   03 async: seleccionar Ranking  → opções de ddlFecha
 *   04 submit BTEnviar             → grelha (segue redirect tipo ?…= se existir)
 *
 * USO (no PC — o sandbox Cowork está bloqueado por política de rede):
 *   node scripts/probe-rfeg-ranking.js                       # default: Juvenil, ano mais recente
 *   node scripts/probe-rfeg-ranking.js --comite "Por Hándicap" --year 2026
 *   node scripts/probe-rfeg-ranking.js --comite Masculino
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
const OUT_DIR = path.resolve(arg("out", "./rfeg-ranking-probe"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

/* ─── HTTP (cookie jar + redirects) ───────────────────────────── */
const jar = {};
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
function store(res) { const sc = res.headers["set-cookie"]; if (sc) for (const l of sc) { const m = /^([^=]+)=([^;]*)/.exec(l); if (m) jar[m[1].trim()] = m[2].trim(); } }
function req(method, url, body, extra, retries = 2) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = { "User-Agent": UA, "Accept": "text/html,*/*;q=0.8", "Accept-Language": "es-ES,es;q=0.9", "Cache-Control": "no-cache" };
    if (Object.keys(jar).length) headers["Cookie"] = cookieHeader();
    if (body != null) { headers["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8"; headers["Content-Length"] = Buffer.byteLength(body); headers["Origin"] = u.origin; headers["Referer"] = url; }
    Object.assign(headers, extra || {});
    const r = https.request({ method, hostname: u.hostname, path: u.pathname + u.search, headers, timeout: 30000 }, (res) => {
      store(res);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { const next = new URL(res.headers.location, url).toString(); res.resume(); req("GET", next, null, extra, retries).then(resolve, reject); return; }
      const c = []; res.on("data", (x) => c.push(x)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(c).toString("utf8") }));
    });
    r.on("error", (e) => { if (retries > 0) setTimeout(() => req(method, url, body, extra, retries - 1).then(resolve, reject), 1500); else reject(e); });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    if (body != null) r.write(body); r.end();
  });
}

/* ─── parsing ─────────────────────────────────────────────────── */
function decode(s) { return String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/<[^>]+>/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ").replace(/\s+/g, " ").trim(); }
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function inputs(html) { const o = []; const re = /<(input|select|textarea)\b([^>]*)>/gi; let m; while ((m = re.exec(html))) { const a = m[2]; const g = (x) => { const r = new RegExp(x + '\\s*=\\s*"([^"]*)"', "i").exec(a); return r ? r[1] : null; }; o.push({ tag: m[1].toLowerCase(), name: g("name"), id: g("id"), type: (g("type") || (m[1].toLowerCase() === "select" ? "select" : "text")).toLowerCase(), value: g("value") }); } return o; }
function formFields(ins) { const o = {}; for (const i of ins) { if (!i.name || ["image", "submit", "button"].includes(i.type)) continue; o[i.name] = i.value || ""; } return o; }
function selectOptions(html, nameEnds) {
  const re = new RegExp('<select[^>]*name="([^"]*' + reEsc(nameEnds) + ')"[^>]*>([\\s\\S]*?)</select>', "i");
  const m = re.exec(html); if (!m) return { name: null, options: [] };
  const opts = []; const ore = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi; let o;
  while ((o = ore.exec(m[2]))) { const v = /value="([^"]*)"/i.exec(o[1]); opts.push({ value: v ? v[1] : decode(o[2]), text: decode(o[2]), selected: /\bselected\b/i.test(o[1]) }); }
  return { name: m[1], options: opts };
}
/* actualiza fields com os hidden vindos de uma resposta async (delta pipe-delimited) */
function updateHiddenFromDelta(fields, body) {
  const re = /\|hiddenField\|([^|]+)\|([^|]*)\|/g; let m, n = 0;
  while ((m = re.exec(body))) { fields[m[1]] = m[2]; n++; }
  // fallback: resposta veio como página inteira (não-async)
  if (!n) for (const i of inputs(body)) if (i.type === "hidden" && i.name) fields[i.name] = i.value || "";
  return n;
}
function tables(html) {
  const out = []; const re = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi; let m;
  while ((m = re.exec(html))) { const id = /\bid="([^"]*)"/i.exec(m[1]); const rows = m[2].match(/<tr\b[\s\S]*?<\/tr>/gi) || []; if (rows.length < 2) continue; out.push({ id: id ? id[1] : null, totalRows: rows.length, rows: rows.slice(0, 10).map((tr) => (tr.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || []).map(decode)) }); }
  return out.sort((a, b) => b.totalRows - a.totalRows);
}
const enc = (o) => Object.entries(o).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");

/* ─── main ────────────────────────────────────────────────────── */
(async () => {
  const summary = { page: PAGE, ranAt: new Date().toISOString(), steps: {} };
  console.log("PROBE ranking →", PAGE, "\nOUT:", OUT_DIR);

  // 01 GET
  let g;
  try { g = await req("GET", PAGE, null); } catch (e) { console.error("GET falhou:", e.message, "(host bloqueado? corre no PC)"); process.exit(1); }
  fs.writeFileSync(path.join(OUT_DIR, "01-page.html"), g.body);
  const ins = inputs(g.body);
  const ddlYear = selectOptions(g.body, "$ddlaño");
  const ddlComite = selectOptions(g.body, "$ddlComite");
  const ddlRanking0 = selectOptions(g.body, "$ddlRanking");
  const ddlFecha0 = selectOptions(g.body, "$ddlFecha");
  const btn = (ins.find((i) => i.name && i.name.endsWith("$BTEnviar")) || {}).name;
  const smM = /PageRequestManager\._initialize\('([^']+)'/.exec(g.body); const sm = smM ? smM[1] : "ctl00$ScriptManager1";
  const up = (new RegExp("'t(ctl00\\$m\\$g_[0-9a-f_]+\\$ctl00\\$up\\w+)'").exec(g.body) || [])[1] || null;
  console.log(`\n[01 GET] ${g.status} ${g.body.length}b`);
  console.log("  ddlaño  :", ddlYear.options.map((o) => o.value).filter(Boolean).join(", "));
  console.log("  ddlComite:", ddlComite.options.map((o) => `${o.value}=${o.text}`).join(" | "));
  console.log("  BTEnviar:", btn, "| ScriptManager:", sm, "| UpdatePanel:", up || "(?)");
  summary.steps.get = { status: g.status, ddlYear: ddlYear.options, ddlComite: ddlComite.options, btn, sm, up };

  const yearOpt = ddlYear.options.find((o) => o.value && (WANT_YEAR ? o.text == WANT_YEAR : !/seleccione|completos/i.test(o.text))) || ddlYear.options.find((o) => o.value);
  const comiteOpt = ddlComite.options.find((o) => o.value && o.value !== "-1" && new RegExp(reEsc(WANT_COMITE), "i").test(o.text)) || ddlComite.options.find((o) => o.value && o.value !== "-1");
  if (!comiteOpt || !ddlComite.name) { console.log("Sem comité seleccionável — ver 01-page.html."); fs.writeFileSync(path.join(OUT_DIR, "ranking-summary.json"), JSON.stringify(summary, null, 2)); return; }
  console.log(`\n→ año=${yearOpt ? yearOpt.text : "?"}  comité="${comiteOpt.text}" (v=${comiteOpt.value})`);

  // estado de form encadeado (hidden + selects)
  const fields = formFields(ins);
  if (yearOpt) fields[ddlYear.name] = yearOpt.value;
  const asyncHdr = { "X-MicrosoftAjax": "Delta=true", "X-Requested-With": "XMLHttpRequest" };
  function smVal(target) { return (up ? up + "|" : "") + target; }

  async function asyncSelect(targetName, value, label) {
    fields[targetName] = value;
    const body = enc(Object.assign({}, fields, { [sm]: smVal(targetName), __ASYNCPOST: "true", __EVENTTARGET: targetName, __EVENTARGUMENT: "" }));
    const r = await req("POST", PAGE, body, asyncHdr);
    fs.writeFileSync(path.join(OUT_DIR, label + ".html"), r.body);
    updateHiddenFromDelta(fields, r.body);
    return r;
  }

  // 02 cascata: seleccionar Comité → ddlRanking
  const r2 = await asyncSelect(ddlComite.name, comiteOpt.value, "02-cascade-comite");
  const ddlRanking = selectOptions(r2.body, "$ddlRanking");
  console.log(`[02 comité] ${r2.status} ${r2.body.length}b → ddlRanking: ${ddlRanking.options.map((o) => o.text).filter((t) => !/seleccione/i.test(t)).join(" | ") || "(não apareceu — ver 02)"}`);
  summary.steps.cascadeComite = { status: r2.status, ddlRanking: ddlRanking.options };

  const rankOpt = ddlRanking.options.find((o) => o.value && !/seleccione/i.test(o.text));
  let ddlFecha = ddlFecha0;
  if (rankOpt && ddlRanking.name) {
    // 03 cascata: seleccionar Ranking → ddlFecha
    const r3 = await asyncSelect(ddlRanking.name, rankOpt.value, "03-cascade-ranking");
    ddlFecha = selectOptions(r3.body, "$ddlFecha");
    console.log(`[03 ranking="${rankOpt.text}"] ${r3.status} ${r3.body.length}b → ddlFecha: ${ddlFecha.options.map((o) => o.text).filter((t) => !/seleccione/i.test(t)).slice(0, 6).join(" | ") || "(vazio)"}`);
    summary.steps.cascadeRanking = { status: r3.status, ranking: rankOpt.text, ddlFecha: ddlFecha.options };
  } else {
    console.log("  (sem ranking seleccionável — submeto só com comité)");
  }
  const fechaOpt = (ddlFecha.options || []).find((o) => o.value && !/seleccione/i.test(o.text));
  if (fechaOpt && ddlFecha.name) fields[ddlFecha.name] = fechaOpt.value;
  if (rankOpt && ddlRanking.name) fields[ddlRanking.name] = rankOpt.value;

  // 04 submit BTEnviar (full postback + segue redirect; fallback async)
  const submit = Object.assign({}, fields, { __EVENTTARGET: "", __EVENTARGUMENT: "" });
  if (btn) { submit[btn + ".x"] = "9"; submit[btn + ".y"] = "11"; }
  let r4 = await req("POST", PAGE, enc(submit));
  const redir = /(?:window\.location\s*=\s*"|pageRedirect\|\|)([^"|]+)/.exec(r4.body);
  if (redir) { const ru = new URL(decode(redir[1]).trim(), PAGE).toString(); console.log("  redirect →", ru); r4 = await req("GET", ru, null); }
  fs.writeFileSync(path.join(OUT_DIR, "04-ranking-grid.html"), r4.body);
  let tabs = tables(r4.body);
  if (!tabs.some((t) => t.totalRows > 3)) {
    // fallback async submit
    const ba = enc(Object.assign({}, fields, { [sm]: smVal(btn || ""), __ASYNCPOST: "true", __EVENTTARGET: btn || "", __EVENTARGUMENT: "", [btn + ".x"]: "9", [btn + ".y"]: "11" }));
    const r4b = await req("POST", PAGE, ba, asyncHdr);
    fs.writeFileSync(path.join(OUT_DIR, "04b-ranking-grid-async.html"), r4b.body);
    const t2 = tables(r4b.body); if (t2.some((t) => t.totalRows > 3)) { r4 = r4b; tabs = t2; }
  }
  console.log(`[04 grid] ${r4.status} ${r4.body.length}b`);
  console.log("  tabelas (top por nº linhas):");
  for (const t of tabs.slice(0, 4)) { console.log(`    #${t.id || "?"} (${t.totalRows} linhas):`); for (const row of t.rows.slice(0, 4)) console.log("       ", row.join(" | ")); }
  summary.steps.grid = { status: r4.status, bytes: r4.body.length, redirect: redir ? redir[1] : null, tables: tabs.slice(0, 5) };

  fs.writeFileSync(path.join(OUT_DIR, "ranking-summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n✓ Probe ranking terminado. Envia a pasta", OUT_DIR, ".");
  console.log("  Confirma: a grelha traz licença + clube + pontos? quantas linhas (lista completa ou paginada)?");
})();
