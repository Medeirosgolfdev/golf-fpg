/**
 * scripts/scrape-rfeg-ranking.js
 *
 * Scraper dos rankings nacionais públicos da RFEG:
 *   https://rfegolf.es/RankingPagina/RankingList.aspx
 *
 * A página é SharePoint WebForms com 3 dropdowns dependentes (postback COMPLETO via
 * __doPostBack; EnableEventValidation activo). Fluxo conduzido aqui:
 *   GET → __doPostBack(ddlComite) [com ddlaño+ddlComite] → ddlRanking popula
 *       → __doPostBack(ddlRanking) → ddlFecha popula → BTEnviar → GridRankingList.
 *
 * Grelha GridRankingList:  Puesto | Licencia | Nombre("APELLIDOS, NOMBRE") | Total(pontos)
 *   (sem clube nem DOB — esses só vêm das listas de inscritos dos torneios). Sem
 *   paginação: a lista vem completa.
 *
 * Comités (ddlComite): 15=Masculino 16=Femenino 17=Juvenil 18=Profesionales
 *   19=Pitch&Putt 20=Golf Adaptado 22=Por Hándicap.  Anos: 2009-2026.
 * Para cada (año,comité) o ddlRanking lista os rankings disponíveis (ex.: Juvenil →
 *   "RANKING NACIONAL CADETE/INFANTIL FEMENINO/MASCULINO {año}"); o VALUE da opção é
 *   o próprio nome.
 *
 * Output: public/data/rfeg-rankings/{año}_{comite}_{slug}.json
 *   { year, comite, comiteName, ranking, fecha, scrapedAt, players:[{puesto,licencia,nombre,total}] }
 * + índice public/data/rfeg-rankings-index.json.
 *
 * USO (no PC ou GitHub Actions — o sandbox Cowork está bloqueado por política):
 *   node scripts/scrape-rfeg-ranking.js                       # Juvenil, ano corrente
 *   node scripts/scrape-rfeg-ranking.js --years 2026,2025 --comites 17
 *   node scripts/scrape-rfeg-ranking.js --comites 15,16,17 --years 2026
 *   node scripts/scrape-rfeg-ranking.js --all                 # todos os comités, 2009-2026
 *   node scripts/scrape-rfeg-ranking.js --skip-existing
 * Exit: 0 = gravou · 2 = sem novidades · 1 = erro.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const argv = process.argv.slice(2);
const has = (f) => argv.includes("--" + f);
function arg(name, def) { const i = argv.indexOf("--" + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def; }
const PAGE = "https://rfegolf.es/RankingPagina/RankingList.aspx";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const OUT_DIR = path.resolve(__dirname, "../public/data/rfeg-rankings");
const INDEX = path.resolve(__dirname, "../public/data/rfeg-rankings-index.json");
const DELAY_MS = Math.max(0, parseInt(arg("delay", "400"), 10));
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const COMITE_NAMES = { 15: "Masculino", 16: "Femenino", 17: "Juvenil", 18: "Profesionales", 19: "Pitch&Putt", 20: "GolfAdaptado", 22: "PorHandicap" };
const CUR_YEAR = 2026; // sandbox sem Date.now; ajustar se necessário (ou passar --years)
const years = arg("years", null) ? arg("years").split(",").map((s) => s.trim()) : (has("all") ? Array.from({ length: 18 }, (_, i) => String(2026 - i)) : [String(CUR_YEAR)]);
const comites = arg("comites", null) ? arg("comites").split(",").map((s) => s.trim()) : (has("all") ? ["15", "16", "17", "18", "19", "20", "22"] : ["17"]);

/* ─── HTTP ─────────────────────────────────────────────────────── */
const jar = {};
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
function store(res) { const sc = res.headers["set-cookie"]; if (sc) for (const l of sc) { const m = /^([^=]+)=([^;]*)/.exec(l); if (m) jar[m[1].trim()] = m[2].trim(); } }
function http(method, url, body, retries = 2) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = { "User-Agent": UA, "Accept": "text/html,*/*;q=0.8", "Accept-Language": "es-ES,es;q=0.9", "Cache-Control": "no-cache" };
    if (Object.keys(jar).length) headers["Cookie"] = cookieHeader();
    if (body != null) { headers["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8"; headers["Content-Length"] = Buffer.byteLength(body); headers["Origin"] = u.origin; headers["Referer"] = url; }
    const r = https.request({ method, hostname: u.hostname, path: u.pathname + u.search, headers, timeout: 30000 }, (res) => {
      store(res);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { const next = new URL(res.headers.location, url).toString(); res.resume(); http("GET", next, null, retries).then(resolve, reject); return; }
      const c = []; res.on("data", (x) => c.push(x)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(c).toString("utf8") }));
    });
    r.on("error", (e) => { if (retries > 0) setTimeout(() => http(method, url, body, retries - 1).then(resolve, reject), 1500); else reject(e); });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    if (body != null) r.write(body); r.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─── parsing ─────────────────────────────────────────────────── */
function decode(s) { return String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/<[^>]+>/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ").replace(/&ordm;/g, "º").replace(/\s+/g, " ").trim(); }
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function inputs(html) { const o = []; const re = /<(input|select|textarea)\b([^>]*)>/gi; let m; while ((m = re.exec(html))) { const a = m[2]; const g = (x) => { const r = new RegExp(x + '\\s*=\\s*"([^"]*)"', "i").exec(a); return r ? r[1] : null; }; o.push({ tag: m[1].toLowerCase(), name: g("name"), type: (g("type") || (m[1].toLowerCase() === "select" ? "select" : "text")).toLowerCase(), value: g("value"), disabled: /\bdisabled\b/i.test(a) }); } return o; }
function selectOptions(html, ends) {
  const re = new RegExp('<select[^>]*name="([^"]*' + reEsc(ends) + ')"[^>]*>([\\s\\S]*?)</select>', "i");
  const m = re.exec(html); if (!m) return { name: null, disabled: false, options: [] };
  const disabled = /\bdisabled\b/i.test(html.slice(m.index, m.index + m[0].indexOf(">") + 1));
  const opts = []; const ore = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi; let o;
  while ((o = ore.exec(m[2]))) { const v = /value="([^"]*)"/i.exec(o[1]); opts.push({ value: v ? v[1] : decode(o[2]), text: decode(o[2]), selected: /\bselected\b/i.test(o[1]) }); }
  return { name: m[1], disabled, options: opts };
}
function curSelected(sel) { const o = (sel.options || []).find((x) => x.selected) || (sel.options || [])[0]; return o ? o.value : ""; }
const enc = (o) => Object.entries(o).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");

let NAMES = {};
function resolveNames(html) {
  NAMES = { year: selectOptions(html, "$ddlaño").name, comite: selectOptions(html, "$ddlComite").name, ranking: selectOptions(html, "$ddlRanking").name, fecha: selectOptions(html, "$ddlFecha").name, btn: (inputs(html).find((i) => i.name && i.name.endsWith("$BTEnviar")) || {}).name };
}
/* postback COMPLETO a partir do HTML corrente (mimics browser: selected values + skip disabled) */
async function postback(curHtml, eventTarget, choose, isSubmit) {
  const f = {};
  for (const i of inputs(curHtml)) { if (!i.name || i.disabled) continue; if (["image", "submit", "button"].includes(i.type)) continue; if (i.tag === "select") continue; f[i.name] = i.value || ""; }
  for (const ends of ["$ddlaño", "$ddlComite", "$ddlRanking", "$ddlFecha"]) { const s = selectOptions(curHtml, ends); if (s.name && !s.disabled) f[s.name] = curSelected(s); }
  Object.assign(f, choose || {});
  f["__EVENTTARGET"] = eventTarget || ""; f["__EVENTARGUMENT"] = "";
  if (isSubmit && NAMES.btn) { f[NAMES.btn + ".x"] = "9"; f[NAMES.btn + ".y"] = "11"; }
  return http("POST", PAGE, enc(f));
}

/* GridRankingList → players */
function parseRankingGrid(html) {
  const m = /<table[^>]*id="[^"]*GridRankingList"[^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!m) return [];
  const trs = m[1].match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const players = [];
  for (const tr of trs) {
    if (!/_GridOlympus/i.test(tr)) continue;            // só linhas de dados
    const tds = (tr.match(/<td\b[\s\S]*?<\/td>/gi) || []).map(decode);
    if (tds.length < 5) continue;
    // [0]=blank [1]=puesto [2]=licencia [3]=nombre [4]=total [5]=blank
    const licencia = (tds[2] || "").replace(/\s+/g, "");
    if (!licencia) continue;
    const puesto = parseInt((tds[1] || "").replace(/[^\d]/g, ""), 10);
    const total = parseInt((tds[4] || "").replace(/[^\d-]/g, ""), 10);
    players.push({ puesto: isNaN(puesto) ? null : puesto, licencia, nombre: tds[3] || "", total: isNaN(total) ? null : total });
  }
  return players;
}

const slug = (s) => decode(s).toUpperCase().replace(/RANKING NACIONAL\s*/i, "").replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/* ─── índice ───────────────────────────────────────────────────── */
function loadIndex() { try { return JSON.parse(fs.readFileSync(INDEX, "utf8")); } catch (e) { return { generatedAt: null, rankings: [] }; } }
function writeJsonAtomic(file, data) { const t = file + ".tmp"; fs.writeFileSync(t, JSON.stringify(data)); fs.renameSync(t, file); }

/* ─── exports (testes) ─────────────────────────────────────────── */
module.exports = { parseRankingGrid, slug, selectOptions, curSelected, decode };

/* ─── main ─────────────────────────────────────────────────────── */
if (require.main !== module) return;
(async () => {
  console.log(`RFEG rankings — years=[${years.join(",")}] comités=[${comites.join(",")}] delay=${DELAY_MS}ms`);
  const index = loadIndex();
  const idxByFile = new Map(index.rankings.map((r) => [r.file, r]));
  let wrote = 0, totalPlayers = 0, errors = 0;

  for (const year of years) {
    for (const comite of comites) {
      try {
        // GET fresco + seleccionar (año, comité)
        const g = await http("GET", PAGE, null); if (!NAMES.btn) resolveNames(g.body);
        await sleep(DELAY_MS);
        const comiteBase = await postback(g.body, NAMES.comite, { [NAMES.year]: year, [NAMES.comite]: comite }, false);
        const rankSel = selectOptions(comiteBase.body, "$ddlRanking");
        const rankings = rankSel.options.filter((o) => o.value && !/seleccione/i.test(o.text) && o.value !== "-1");
        console.log(`\n[${year} ${COMITE_NAMES[comite] || comite}] ${rankings.length} ranking(s): ${rankings.map((r) => r.text).join(" · ") || "(nenhum publicado)"}`);
        for (const r of rankings) {
          const file = `${year}_${comite}_${slug(r.text)}.json`;
          const fpath = path.join(OUT_DIR, file);
          if (has("skip-existing") && fs.existsSync(fpath)) { console.log(`   • ${r.text} — skip (existe)`); continue; }
          await sleep(DELAY_MS);
          // seleccionar ranking → ddlFecha; depois submeter
          const afterRank = await postback(comiteBase.body, NAMES.ranking, { [NAMES.ranking]: r.value }, false);
          const fechaSel = selectOptions(afterRank.body, "$ddlFecha");
          const fechaOpt = fechaSel.options.find((o) => o.value && !/seleccione/i.test(o.text));
          await sleep(DELAY_MS);
          const choose = {}; if (fechaOpt && NAMES.fecha) choose[NAMES.fecha] = fechaOpt.value;
          let grid = await postback(afterRank.body, "", choose, true);
          const redir = /(?:window\.location\s*=\s*"|pageRedirect\|\|)([^"|]+)/.exec(grid.body);
          if (redir) grid = await http("GET", new URL(decode(redir[1]).trim(), PAGE).toString(), null);
          const players = parseRankingGrid(grid.body);
          if (!players.length) { console.log(`   • ${r.text} — 0 jogadores (ver scope/fecha)`); continue; }
          const rec = { year: Number(year), comite: Number(comite), comiteName: COMITE_NAMES[comite] || comite, ranking: r.text, fecha: fechaOpt ? fechaOpt.text : null, scrapedAt: new Date().toISOString(), total: players.length, players };
          writeJsonAtomic(fpath, rec);
          idxByFile.set(file, { file, year: Number(year), comite: Number(comite), comiteName: rec.comiteName, ranking: r.text, total: players.length });
          wrote++; totalPlayers += players.length;
          console.log(`   • ${r.text} — ${players.length} jogadores → ${file}`);
        }
      } catch (e) { errors++; console.warn(`   ! ${year}/${comite} erro: ${e.message}`); }
    }
  }

  const out = { generatedAt: new Date().toISOString(), source: "scrape-rfeg-ranking.js", total: idxByFile.size, rankings: [...idxByFile.values()].sort((a, b) => b.year - a.year || a.comite - b.comite || a.ranking.localeCompare(b.ranking)) };
  writeJsonAtomic(INDEX, out);
  console.log(`\nDone: ${wrote} ranking(s) novos/actualizados, ${totalPlayers} jogadores, ${errors} erro(s). Índice: ${out.total} rankings.`);
  process.exit(wrote > 0 ? 0 : 2);
})();
