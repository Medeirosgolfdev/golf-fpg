/**
 * scripts/discover-rfegolf-comps.js
 *
 * Brute-force discovery dos CompIds juvenis em rfegolf.es para os últimos N anos.
 *
 * Estratégia: para cada CompId no range, faz GET leve a CompetitionMicrosite.aspx
 * e extrai apenas o <title>. Filtra para nomes que tenham keywords juvenis
 * (Sub-*, Alevín, Benjamín, Infantil, Cadete, Junior, etc.) e ano dentro do range.
 *
 * USO:
 *   node scripts/discover-rfegolf-comps.js                       # default range 13000-16250
 *   node scripts/discover-rfegolf-comps.js --range 14500-16250
 *   node scripts/discover-rfegolf-comps.js --concurrency 6 --max 4000
 *
 * Output: scripts/rfegolf-scope.json com formato:
 *   { generatedAt, total, byYear, byCategory, tournaments: [{ compId, name, year, category, sex }] }
 *
 * Tempo estimado: ~10-30 min para range completo (concurrency 5).
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function httpGet(urlStr, retries) {
  if (retries === undefined) retries = 1;
  return new Promise(function (resolve, reject) {
    function attempt(n) {
      const url = new URL(urlStr);
      const req = https.request({
        method: "GET",
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
          "User-Agent": UA,
          "Accept": "text/html",
          "Accept-Language": "es-ES,es;q=0.9",
          "Cache-Control": "no-cache",
        },
        timeout: 15000,
      }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, urlStr).toString();
          res.resume();
          httpGet(next, retries).then(resolve, reject);
          return;
        }
        // For discovery, only need the first ~5KB to capture <title>
        const chunks = [];
        let total = 0;
        res.on("data", function (c) {
          if (total < 8000) {
            chunks.push(c);
            total += c.length;
          }
        });
        res.on("end", function () {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, body: buf.toString("utf8") });
        });
      });
      req.on("error", function (err) {
        if (n > 0) setTimeout(function () { attempt(n - 1); }, 1500);
        else reject(err);
      });
      req.on("timeout", function () { req.destroy(new Error("timeout")); });
      req.end();
    }
    attempt(retries);
  });
}

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&([a-z]+);/gi, function (m, name) {
      const map = { aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
                    ntilde: "ñ", Ntilde: "Ñ", Aacute: "Á", Eacute: "É", Iacute: "Í",
                    Oacute: "Ó", Uacute: "Ú", nbsp: " ", quot: "\"", apos: "'" };
      return map[name] || m;
    });
}

const JUVENIL_RE = /\b(?:sub[\s-]?\d+|alev[ií]n|benjam[ií]n|infantil|cadete|junior|jovenes?|jeunes?|juvenil)\b/i;
const ADULT_RE = /\b(?:senior|absoluto|absoluta|mid[\s-]?am(ateur)?|profesional|p[ií]tch|p\.\s?&\s?p|pares|dobles|matrimonio|matchplay)\b/i;

function isJuvenil(name) {
  if (!name) return false;
  // Keywords positive AND not have negative
  const lower = name.toLowerCase();
  if (!JUVENIL_RE.test(lower)) return false;
  // Allow Sub-XX even if "absoluto" appears alongside
  return true;
}

function extractYear(name) {
  // Match 4-digit year in the title, prefer one near the end
  const matches = (name || "").match(/\b(19|20)\d{2}\b/g);
  if (!matches) return null;
  return parseInt(matches[matches.length - 1], 10);
}

function extractCategory(name) {
  if (!name) return null;
  const m = name.match(/\bSub[\s-]?(\d+)\b/i);
  if (m) return "Sub-" + m[1];
  if (/\bAlev[ií]n\b/i.test(name)) return "Alevín";
  if (/\bBenjam[ií]n\b/i.test(name)) return "Benjamín";
  if (/\bInfantil\b/i.test(name)) return "Infantil";
  if (/\bCadete\b/i.test(name)) return "Cadete";
  if (/\bJunior\b/i.test(name)) return "Junior";
  if (/\bJuvenil\b/i.test(name)) return "Juvenil";
  return null;
}

function extractSex(name) {
  if (!name) return null;
  if (/\bMasculino\b/i.test(name)) return "M";
  if (/\bFemenino\b/i.test(name)) return "F";
  if (/\bMixto\b/i.test(name) || /\bMasculino\s+y\s+Femenino\b/i.test(name)) return "Mixto";
  return null;
}

async function probeCompId(cid) {
  const url = "https://rfegolf.es/CompetenciaPaginas/CompetitionMicrosite.aspx?CompId=" + cid;
  const r = await httpGet(url);
  if (r.status !== 200 || r.body.length < 1000) return { compId: cid, exists: false };
  // Look for <title> AND <h2 class="titulo_seccion">
  const titleM = /<title[^>]*>([\s\S]+?)<\/title>/i.exec(r.body);
  let name = titleM ? titleM[1] : "";
  name = decodeEntities(name).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  name = name.replace(/^Microsite del Torneo\s*/i, "").trim();
  // If name still looks like generic page header, mark as not found
  if (!name || /Sin Datos|Param.?Error|^Página/i.test(name) || name === "Microsite del Torneo") {
    return { compId: cid, exists: false };
  }
  return {
    compId: cid,
    exists: true,
    name,
    year: extractYear(name),
    category: extractCategory(name),
    sex: extractSex(name),
    juvenil: isJuvenil(name),
  };
}

async function main() {
  const args = process.argv.slice(2);
  function getArg(n, def) { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : def; }
  const rangeArg = getArg("range", "13000-16250");
  const concurrency = parseInt(getArg("concurrency", "5"), 10);
  const maxArg = parseInt(getArg("max", "0"), 10) || Infinity;
  const minYear = parseInt(getArg("min-year", "2021"), 10);
  // Resolve --out relative to CWD (onde o user corre o script). Default: scripts/rfegolf-scope.json
  const outArg = getArg("out", null);
  const outFile = outArg
    ? path.resolve(process.cwd(), outArg)
    : path.resolve(__dirname, "rfegolf-scope.json");
  const verboseInterval = parseInt(getArg("log-every", "100"), 10);

  const parts = rangeArg.split("-").map(function (s) { return parseInt(s.trim(), 10); });
  const ids = [];
  for (let i = parts[0]; i <= parts[1]; i++) ids.push(i);
  if (maxArg && ids.length > maxArg) ids.length = maxArg;

  console.log("Discover RFEGolf: range " + parts[0] + "-" + parts[1] + " (" + ids.length + " IDs), concurrency=" + concurrency);

  const results = [];
  let cursor = 0;
  let processed = 0;
  let lastLog = Date.now();

  async function worker() {
    while (cursor < ids.length) {
      const idx = cursor++;
      const cid = ids[idx];
      try {
        const r = await probeCompId(cid);
        if (r.exists) results.push(r);
      } catch (e) {
        // ignore
      }
      processed++;
      if (processed % verboseInterval === 0) {
        const elapsed = (Date.now() - lastLog) / 1000;
        console.log("  ... " + processed + "/" + ids.length + " probed, " + results.length + " hits, " + verboseInterval + " in " + elapsed.toFixed(1) + "s");
        lastLog = Date.now();
        // Save partial progress
        try {
          const partial = {
            generatedAt: new Date().toISOString(),
            partial: true,
            processed, total: ids.length,
            tournaments: results.filter(function (r) { return r.juvenil; }).sort(function (a, b) { return a.compId - b.compId; }),
          };
          fs.writeFileSync(outFile + ".partial", JSON.stringify(partial, null, 2));
        } catch (e) { /* ignore */ }
      }
      await new Promise(function (r) { setTimeout(r, 50); });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, function () { return worker(); }));

  // Filter to juvenile + within year range
  const currentYear = new Date().getFullYear();
  const tournaments = results
    .filter(function (r) { return r.juvenil; })
    .filter(function (r) { return !r.year || (r.year >= minYear && r.year <= currentYear + 2); })
    .sort(function (a, b) { return a.compId - b.compId; });

  // Stats
  const byYear = {};
  const byCategory = {};
  for (const t of tournaments) {
    if (t.year) byYear[t.year] = (byYear[t.year] || 0) + 1;
    if (t.category) byCategory[t.category] = (byCategory[t.category] || 0) + 1;
  }

  const scope = {
    generatedAt: new Date().toISOString(),
    range: parts[0] + "-" + parts[1],
    minYear,
    totalProbed: ids.length,
    totalExisting: results.length,
    totalJuvenil: tournaments.length,
    byYear,
    byCategory,
    tournaments,
  };
  fs.writeFileSync(outFile, JSON.stringify(scope, null, 2));
  console.log("\nDone. " + tournaments.length + " juvenile tournaments saved to " + outFile);
  console.log("byYear:", byYear);
  console.log("byCategory:", byCategory);
}

if (require.main === module) {
  main().catch(function (e) { console.error(e); process.exit(1); });
}

module.exports = { probeCompId, isJuvenil, extractYear, extractCategory, extractSex };
