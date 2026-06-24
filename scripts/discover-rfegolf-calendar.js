/**
 * scripts/discover-rfegolf-calendar.js
 *
 * Discovery dos torneios RFEGolf a partir do CALENDÁRIO oficial
 * (`rfegolf.es/CompetenciaPaginas/AllCompetitions.aspx`) — em vez do brute-force
 * por CompId (discover-rfegolf-comps.js). É muito mais completo e rápido: a página
 * lista TODAS as competições de cada ano, com data, CompId, clube e vencedor.
 *
 * A página é WebForms ASP.NET com 3 dropdowns AutoPostBack:
 *   - ddlAnnos           (ano: 2007..2029, 2031, 2036, 9999)
 *   - ddlTipoCompeticion (-1=Todas | Alto Nivel=Calendario RFEG | Regionales | Club)
 *   - ddlComites         (-1=Todos | 15 Masc | 16 Fem | 17 Juvenil | 18 Pro | 19 P&P | 20 Adaptado)
 *
 * Para cada ano fazemos um postback (EVENTTARGET=ddlAnnos) reutilizando o
 * ViewState/EventValidation do GET inicial, e parseamos as linhas da tabela.
 * Filtramos por keyword juvenil (mesmo critério do brute-force) por defeito —
 * apanha Sub-XX, Alevín/Benjamín/Infantil/Cadete/Junior/Juvenil, Puntuables e
 * Zonais Juvenis, independentemente do comité.
 *
 * USO:
 *   node scripts/discover-rfegolf-calendar.js                      # 2021..ano+1, juvenil
 *   node scripts/discover-rfegolf-calendar.js --years 2023-2027
 *   node scripts/discover-rfegolf-calendar.js --years 2024,2025,2026
 *   node scripts/discover-rfegolf-calendar.js --all-committees     # não filtra juvenil
 *   node scripts/discover-rfegolf-calendar.js --merge              # une ao rfegolf-scope.json
 *   node scripts/discover-rfegolf-calendar.js --out scripts/rfegolf-scope.json --merge
 *
 * Output (mesmo formato do discover-rfegolf-comps): { tournaments: [{compId,name,year,category,sex,...}] }
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { isJuvenil, extractYear, extractCategory, extractSex } = require("./discover-rfegolf-comps.js");

const BASE = "https://rfegolf.es/CompetenciaPaginas/AllCompetitions.aspx?Tipo=0";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function req(method, urlStr, body, headers) {
  return new Promise(function (resolve, reject) {
    const url = new URL(urlStr);
    const data = body || null;
    const r = https.request({
      method, hostname: url.hostname, path: url.pathname + url.search,
      headers: Object.assign({
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "es-ES,es;q=0.9",
      }, data ? {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(data),
      } : {}, headers || {}),
      timeout: 30000,
    }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        req("GET", new URL(res.headers.location, urlStr).toString()).then(resolve, reject);
        return;
      }
      const chunks = [];
      res.on("data", function (c) { chunks.push(c); });
      res.on("end", function () { resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8"), headers: res.headers }); });
    });
    r.on("error", reject);
    r.on("timeout", function () { r.destroy(new Error("timeout")); });
    if (data) r.write(data);
    r.end();
  });
}

function field(html, name) {
  const m = new RegExp('id="' + name + '"[^>]*value="([^"]*)"').exec(html)
        || new RegExp('name="' + name + '"[^>]*value="([^"]*)"').exec(html);
  return m ? m[1] : "";
}
/** Nome completo (com prefixo ctl00$...$GUID$...) de um dropdown pelo sufixo. */
function ctrlName(html, suffix) {
  const m = new RegExp('<select[^>]*name="([^"]*' + suffix + ')"').exec(html);
  return m ? m[1] : null;
}

function decode(s) {
  if (!s) return s;
  return s.replace(/<img[^>]*>/gi, "")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&([a-z]+);/gi, function (m, n) {
      const map = { aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", Ntilde: "Ñ",
        Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", uuml: "ü", quot: '"', apos: "'" };
      return map[n] || m;
    }).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** Parseia as linhas <tr> da tabela de competições. */
function parseRows(html) {
  const out = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html))) {
    const tr = m[1];
    const cid = /CompetitionMicrosite\.aspx\?CompId=(\d+)/i.exec(tr);
    if (!cid) continue;
    const dates = tr.match(/(\d{2}\/\d{2}\/\d{4})/g) || [];
    const nameM = /CompId=\d+'[^>]*>([\s\S]*?)<\/a>/i.exec(tr);
    const name = nameM ? decode(nameM[1]) : "";
    if (!name) continue;
    // Clube: link ClubId (clubes espanhóis) — clubes estrangeiros não têm ClubId.
    const clubM = /ClubMicrosite\.aspx\?ClubId=\d+'[^>]*>([\s\S]*?)<\/a>/i.exec(tr);
    // Último <td> = vencedor.
    const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    const winner = tds.length ? decode(tds[tds.length - 1].replace(/<\/?td[^>]*>/gi, "")) : "";
    out.push({
      compId: parseInt(cid[1], 10),
      name,
      startDate: dates[0] || null,
      endDate: dates[1] || dates[0] || null,
      club: clubM ? decode(clubM[1]) : null,
      winner: winner || null,
    });
  }
  // Dedup por compId (uma competição pode surgir 2× se o nome tem link ao próprio microsite).
  const seen = new Set(); const dedup = [];
  for (const t of out) { if (seen.has(t.compId)) continue; seen.add(t.compId); dedup.push(t); }
  return dedup;
}

function isoDate(dmy) {
  if (!dmy) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy);
  return m ? m[3] + "-" + m[2] + "-" + m[1] : null;
}

async function fetchYear(year, vs, allCommittees) {
  // Postback: muda o ano. Reutiliza o ViewState/EventValidation do GET inicial.
  const form = {
    "__EVENTTARGET": vs.ddlAnnos,
    "__EVENTARGUMENT": "",
    "__VIEWSTATE": vs.viewstate,
    "__VIEWSTATEGENERATOR": vs.gen,
    "__EVENTVALIDATION": vs.eventval,
  };
  form[vs.ddlAnnos] = String(year);
  form[vs.ddlTipo] = "-1";
  form[vs.ddlComites] = allCommittees ? "-1" : "17"; // 17 = Juvenil
  const body = Object.keys(form).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(form[k]); }).join("&");
  const r = await req("POST", BASE, body, { "Referer": BASE });
  return parseRows(r.body);
}

async function main() {
  const args = process.argv.slice(2);
  function getArg(n, def) { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : def; }
  const allCommittees = args.includes("--all-committees");
  const merge = args.includes("--merge");
  const outArg = getArg("out", null);
  const outFile = outArg ? path.resolve(process.cwd(), outArg) : path.resolve(__dirname, "rfegolf-scope.json");

  // Anos
  let years;
  const yearsArg = getArg("years", null);
  if (yearsArg && yearsArg.indexOf("-") >= 0) {
    const p = yearsArg.split("-").map(function (s) { return parseInt(s, 10); });
    years = []; for (let y = p[0]; y <= p[1]; y++) years.push(y);
  } else if (yearsArg) {
    years = yearsArg.split(",").map(function (s) { return parseInt(s.trim(), 10); });
  } else {
    const cy = new Date().getFullYear();
    years = []; for (let y = 2021; y <= cy + 1; y++) years.push(y);
  }

  console.log("Discover RFEGolf (calendário): anos " + years.join(", ") + (allCommittees ? " · todos os comités" : " · só Juvenil(17)"));

  // GET inicial → ViewState + nomes dos controls.
  const init = await req("GET", BASE);
  const vs = {
    viewstate: field(init.body, "__VIEWSTATE"),
    gen: field(init.body, "__VIEWSTATEGENERATOR"),
    eventval: field(init.body, "__EVENTVALIDATION"),
    ddlAnnos: ctrlName(init.body, "ddlAnnos"),
    ddlTipo: ctrlName(init.body, "ddlTipoCompeticion"),
    ddlComites: ctrlName(init.body, "ddlComites"),
  };
  if (!vs.viewstate || !vs.ddlAnnos) { console.error("Falha a extrair ViewState/controls do GET inicial."); process.exit(1); }

  const byId = new Map();
  for (const year of years) {
    let rows;
    try { rows = await fetchYear(year, vs, allCommittees); }
    catch (e) { console.warn("  " + year + ": erro (" + e.message + ")"); continue; }
    let kept = 0;
    for (const r of rows) {
      const juv = isJuvenil(r.name);
      // Com o comité Juvenil (17) o servidor já filtrou — mantemos tudo. Só
      // aplicamos o filtro por nome quando puxamos TODOS os comités (--all-committees).
      if (allCommittees && !juv) continue;
      const entry = {
        compId: r.compId,
        name: r.name,
        year: extractYear(r.name) || year,
        category: extractCategory(r.name),
        sex: extractSex(r.name),
        startDate: r.startDate, startDateIso: isoDate(r.startDate),
        endDate: r.endDate, endDateIso: isoDate(r.endDate),
        club: r.club, winner: r.winner,
        juvenil: juv,
        discoveredVia: "calendar",
      };
      byId.set(r.compId, entry);
      kept++;
    }
    console.log("  " + year + ": " + rows.length + " comps na página → " + kept + " guardados");
    await new Promise(function (r) { setTimeout(r, 300); });
  }

  let tournaments = Array.from(byId.values()).sort(function (a, b) { return a.compId - b.compId; });

  // Merge com scope existente (preferindo a entrada nova por compId).
  let added = 0;
  if (merge && fs.existsSync(outFile)) {
    const prev = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const m = new Map();
    for (const t of prev.tournaments || []) m.set(t.compId, t);
    const before = m.size;
    for (const t of tournaments) m.set(t.compId, Object.assign({}, m.get(t.compId), t));
    added = m.size - before;
    tournaments = Array.from(m.values()).sort(function (a, b) { return a.compId - b.compId; });
  }

  const byYear = {}; const byCategory = {};
  for (const t of tournaments) {
    if (t.year) byYear[t.year] = (byYear[t.year] || 0) + 1;
    if (t.category) byCategory[t.category] = (byCategory[t.category] || 0) + 1;
  }
  const scope = {
    generatedAt: new Date().toISOString(),
    source: "AllCompetitions.aspx (calendário oficial)",
    years, allCommittees,
    total: tournaments.length, byYear, byCategory,
    tournaments,
  };
  fs.writeFileSync(outFile, JSON.stringify(scope, null, 2));
  console.log("\nDone. " + tournaments.length + " torneios → " + outFile + (merge ? " (merge: +" + added + " novos)" : ""));
  console.log("byYear:", byYear);
}

if (require.main === module) main().catch(function (e) { console.error(e); process.exit(1); });

module.exports = { parseRows, fetchYear };
