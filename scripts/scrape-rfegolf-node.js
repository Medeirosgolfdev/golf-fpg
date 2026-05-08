/**
 * scripts/scrape-rfegolf-node.js
 *
 * Scraper Node-puro do portal oficial RFEGolf (Real Federación Española de Golf):
 * `rfegolf.es/CompetenciaPaginas/*.aspx`. Cobre os Campeonatos de España, Internacionais
 * de España, Puntuables Nacionais e Zonais Juvenis.
 *
 * USO:
 *   node scripts/scrape-rfegolf-node.js --comp 15956
 *   node scripts/scrape-rfegolf-node.js --comp 14500 --pretty
 *   node scripts/scrape-rfegolf-node.js --scope scripts/rfegolf-scope.json
 *   node scripts/scrape-rfegolf-node.js --range 13500-16250 --filter juvenil
 *
 * O que apanha (para CADA CompId):
 *   - Metadata: nome, datas, campo, categoria, sexo, modalidade, hcp limit, federação organizadora
 *   - Inscritos (Admitidos): nome, licencia, país, hcp, categoria de idade, sexo,
 *     data de nascimento (campo gold!), clube de pertença
 *   - Reservas, bajas, invitados, no admitidos (também guarda as listas alternativas)
 *
 * O QUE NÃO APANHA (limitação conhecida):
 *   - Resultados ronda-a-ronda + scorecards: o portal carrega-os via __doPostBack
 *     ASP.NET na tab TabGeneral/TabHoyoAHoyo, e essa parte requer simulação completa
 *     da sessão ASP.NET com ViewState/EventValidation. Para já, capturamos dados de
 *     inscrição, datas, campo e metadados — que já são suficientes para tracking de
 *     rivais (DOB + categoria + clube + hcp por jogador é o feed mais valioso).
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT_DIR = path.resolve(__dirname, "../public/data/rfegolf-resultats");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

/* ────────────────────────────────────────────────────────────────
   HTTP helper (sem deps externas)
   ──────────────────────────────────────────────────────────────── */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function httpGet(urlStr, retries = 2) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const url = new URL(urlStr);
      const req = https.request({
        method: "GET",
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
          "User-Agent": UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
          "Referer": "https://rfegolf.es/CompetenciaPaginas/CompetitionSection.aspx",
          "Cache-Control": "no-cache",
        },
        timeout: 25000,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, urlStr).toString();
          res.resume();
          httpGet(next, retries).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, body: buf.toString("utf8") });
        });
      });
      req.on("error", (err) => {
        if (n > 0) setTimeout(() => attempt(n - 1), 1500);
        else reject(err);
      });
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.end();
    };
    attempt(retries);
  });
}

/* ────────────────────────────────────────────────────────────────
   Helpers de parsing
   ──────────────────────────────────────────────────────────────── */

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&([a-z]+);/gi, function (m, name) {
      var map = { aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
                  ntilde: "ñ", Ntilde: "Ñ", iexcl: "¡", iquest: "¿",
                  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú" };
      return map[name] || m;
    });
}

function stripTags(s) {
  if (!s) return "";
  return decodeEntities(String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function trCells(trHtml) {
  const cells = [];
  const re = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let m;
  while ((m = re.exec(trHtml)) !== null) cells.push(m[1]);
  return cells;
}

function findTableById(html, idPredicate) {
  const startRe = /<table\b[^>]*id="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = startRe.exec(html)) !== null) {
    const id = m[1];
    const matches = typeof idPredicate === "function" ? idPredicate(id) : id.includes(idPredicate);
    if (!matches) continue;
    const startIdx = m.index;
    let i = startRe.lastIndex;
    let depth = 1;
    const openRe = /<table\b/gi;
    const closeRe = /<\/table>/gi;
    while (depth > 0 && i < html.length) {
      openRe.lastIndex = i;
      closeRe.lastIndex = i;
      const openMatch = openRe.exec(html);
      const closeMatch = closeRe.exec(html);
      if (!closeMatch) return { id, html: html.slice(startIdx) };
      if (openMatch && openMatch.index < closeMatch.index) {
        depth++;
        i = openMatch.index + 6;
      } else {
        depth--;
        i = closeMatch.index + 8;
      }
    }
    return { id, html: html.slice(startIdx, i) };
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────
   parseMicrosite — lê metadata da CompetitionMicrosite.aspx
   ──────────────────────────────────────────────────────────────── */

function parseMicrosite(html) {
  const meta = {
    name: null, dateStart: null, dateEnd: null,
    course: null, courseAddress: null, courseClubId: null,
    players: null, hcpLimitMen: null, hcpLimitWomen: null,
    mode: null, style: null, category: null, sex: null,
    federation: null, federationCatId: null,
    region: null, imageBanner: null,
  };

  let m = /<h2[^>]*class="titulo_seccion"[^>]*>([\s\S]+?)<\/h2>/i.exec(html);
  if (m) {
    meta.name = stripTags(m[1])
      .replace(/^Resultados\/Clasificaciones del Torneo\s*/i, "")
      .replace(/^Microsite del Torneo\s*/i, "")
      .replace(/^RESULTADOS Y CLASIFICACIONES.*$/i, "")
      .trim();
  }
  if (!meta.name) {
    m = /<title[^>]*>([\s\S]+?)<\/title>/i.exec(html);
    if (m) meta.name = stripTags(m[1])
      .replace(/^Resultados\/Clasificaciones del Torneo\s*/i, "")
      .replace(/^Microsite del Torneo\s*/i, "")
      .trim();
  }

  const visible = stripTags(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
  );

  // grab(label) — extract value after `LABEL : ` until next known label or course
  function grab(labelPattern) {
    const re = new RegExp(labelPattern + "\\s*:\\s*([^:]+?)\\s+(?=Nº|N[°º]|Estilo|Modo|Categor|Sexo|Limitaci|Direcci|Tel\\b|Web\\b|RESULTADOS|MULTIMEDIA|Inscripción|REAL|CLUB|CAMPO|GOLF)", "i");
    const mm = re.exec(visible);
    return mm ? mm[1].trim().replace(/\s+$/, "") : null;
  }

  m = /Del\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+al\s+(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(visible);
  if (m) { meta.dateStart = m[1]; meta.dateEnd = m[2]; }
  else {
    m = /Fechas?\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(visible);
    if (m) { meta.dateStart = m[1]; meta.dateEnd = m[1]; }
  }

  const playersStr = grab("Nº\\s*Jugadores");
  meta.players = playersStr ? (parseInt(playersStr, 10) || null) : null;
  meta.style = grab("Estilo de Juego");
  meta.mode = grab("Modo de Juego");
  meta.category = grab("Categoría de Edad");
  meta.sex = grab("Sexo");

  m = /Limitaci[óo]n\s+H[áa]ndicap\s+Masculino\s*:?\s*(\d+(?:[.,]\d+)?)/i.exec(visible);
  if (m) meta.hcpLimitMen = parseFloat(m[1].replace(",", "."));
  m = /Limitaci[óo]n\s+H[áa]ndicap\s+Femenino\s*:?\s*(\d+(?:[.,]\d+)?)/i.exec(visible);
  if (m) meta.hcpLimitWomen = parseFloat(m[1].replace(",", "."));

  // Course: prefer the FIRST link to ClubMicrosite.aspx that appears AFTER an
  // info marker (so we ignore menu-links).
  const infoIdx = html.search(/INFORMACI[ÓO]N\s+GENERAL|Informaci[óo]n\s+El\s+Club|RESULTADOS\s+Y\s+HORARIOS/i);
  const searchHtml = infoIdx >= 0 ? html.slice(infoIdx) : html;
  m = /href="\/ClubPaginas\/ClubMicrosite\.aspx\?ClubId=(\d+)"[^>]*>([^<]+)<\/a>/i.exec(searchHtml);
  if (m) {
    const txt = stripTags(m[2]);
    if (txt && txt.length >= 4 && !/^(LISTA|CONTACT|TODAS)/i.test(txt)) {
      meta.courseClubId = parseInt(m[1], 10);
      meta.course = txt;
    }
  }
  if (!meta.course) {
    const limIdx = visible.search(/Limitaci[óo]n\s+H[áa]ndicap[^:]*:\s*\d+(?:[.,]\d+)?/i);
    const haystack = limIdx >= 0 ? visible.slice(limIdx) : visible;
    const reCourse = new RegExp(
      "(\\b(?:R\\.?C\\.?G\\.?|REAL\\s+CLUB(?:\\s+DE\\s+GOLF)?|CLUB\\s+DE\\s+GOLF|CAMPO\\s+DE\\s+GOLF|GOLF)\\s+[A-ZÁÉÍÓÚÑ &.\\-]{2,80})",
      "i"
    );
    const cm = reCourse.exec(haystack);
    if (cm) meta.course = cm[1].trim();
  }

  // Federation organising committee — scan body, prefer real committees
  const committeeMatches = [];
  const committeeRe = /href="\/CommitteePaginas\/CommitteeMicrosite\.aspx\?CatId=(\d+)"[^>]*>([\s\S]+?)<\/a>/gi;
  let cm3;
  while ((cm3 = committeeRe.exec(html)) !== null) {
    committeeMatches.push({ catId: parseInt(cm3[1], 10), text: stripTags(cm3[2]), idx: cm3.index });
  }
  const tournamentCommittees = committeeMatches.filter(function (c) {
    return /(Juvenil|Femenino|Masculino|Mid|Senior|Profesional|Pitch|Adapt)/i.test(c.text)
        && !/Escuela\s+Blume/i.test(c.text);
  });
  if (tournamentCommittees.length > 0) {
    const pick = tournamentCommittees[0];
    meta.federationCatId = pick.catId;
    meta.federation = pick.text;
  }

  m = /<img[^>]+src="([^"]+banners[^"]*\.(?:png|jpg))"[^>]+alt="([^"]*)"/i.exec(html);
  if (m) meta.imageBanner = { src: m[1], alt: m[2] };

  return meta;
}

/* ────────────────────────────────────────────────────────────────
   parseInscritos — lê grids da TabContainer
   ──────────────────────────────────────────────────────────────── */

function parseGridRows(html, gridIdSuffix) {
  const tbl = findTableById(html, function (id) {
    return id.endsWith("_" + gridIdSuffix) || id === gridIdSuffix;
  });
  if (!tbl) return null;
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(tbl.html)) !== null) rows.push(m[1]);
  return rows;
}

function parseInscritos(html, kind) {
  const map = {
    Admitidos: "GridParticipantes",
    Reservas: "GridReservas",
    Bajas: "GridBajas",
    Invitados: "GridInvitados",
    NoAdmitidos: "GridNoAdmitidos",
    Provisional: "GridInscritos",
  };
  const suffix = map[kind];
  if (!suffix) return null;
  const rows = parseGridRows(html, suffix);
  if (!rows || rows.length < 2) return [];

  let headerCells = [];
  const dataRows = [];
  for (const r of rows) {
    const cells = trCells(r).map(stripTags);
    if (cells.length >= 5 && headerCells.length === 0
        && /Nombre/i.test(cells.join(" ")) && /Licencia/i.test(cells.join(" "))) {
      headerCells = cells;
    } else {
      dataRows.push(cells);
    }
  }

  function idx(label) {
    return headerCells.findIndex(function (h) { return new RegExp(label, "i").test(h); });
  }
  const cols = {
    pos: -1,
    name: idx("Nombre"),
    licencia: idx("Licencia"),
    pais: idx("Pais|País"),
    hcp: idx("^Hp$|H\\.?p\\.?|H[áa]ndicap"),
    catEdad: idx("Cat\\.?\\s*Edad|Categor[íi]a"),
    sexo: idx("^Sexo$"),
    club: idx("Pertenenciente|Pertenec|Club"),
    dob: idx("Fecha\\s+Nacimiento|Nacimiento"),
    estado: idx("Estado"),
  };

  const players = [];
  for (const cells of dataRows) {
    if (cells.length < 5) continue;
    let pos = null;
    const idx2 = cells.findIndex(function (c) { return /^\d+$/.test(c); });
    if (idx2 >= 0) pos = parseInt(cells[idx2], 10);
    const name = cols.name >= 0 ? (cells[cols.name] || null) : null;
    const licencia = cols.licencia >= 0 ? (cells[cols.licencia] || null) : null;
    const pais = cols.pais >= 0 ? (cells[cols.pais] || null) : null;
    let hcp = null;
    if (cols.hcp >= 0) {
      const hv = (cells[cols.hcp] || "").replace(",", ".").trim();
      hcp = hv && hv !== "" ? parseFloat(hv) : null;
      if (Number.isNaN(hcp)) hcp = null;
    }
    const catEdad = cols.catEdad >= 0 ? (cells[cols.catEdad] || null) : null;
    const sexo = cols.sexo >= 0 ? (cells[cols.sexo] || null) : null;
    const club = cols.club >= 0 ? (cells[cols.club] || null) : null;
    const dob = cols.dob >= 0 ? (cells[cols.dob] || null) : null;
    const estado = cols.estado >= 0 ? (cells[cols.estado] || null) : null;

    if (!name && !licencia) continue;
    players.push({ pos, name, licencia, pais, hcp, catEdad, sexo, club, dob, estado });
  }
  return players;
}

/* ────────────────────────────────────────────────────────────────
   Main scrape function
   ──────────────────────────────────────────────────────────────── */

/** Parse Palmarés (winners by year) from PalmaresCompleto.aspx */
function parsePalmares(html) {
  const winners = [];
  // Look for the palmarés table — rows with <td>NAME</td><td>YEAR</td>
  const trRe = /<tr[^>]*>([\s\S]+?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const cells = trCells(m[1]).map(stripTags);
    if (cells.length < 2) continue;
    // Filter: need at least 2 cells, find a 4-digit year
    const yearCell = cells.find(function (c) { return /^\d{4}$/.test((c || "").trim()); });
    if (!yearCell) continue;
    const year = parseInt(yearCell.trim(), 10);
    if (year < 1900 || year > 2100) continue;
    // Winner is usually the cell BEFORE the year cell (or the only non-empty, non-year cell)
    let winner = "";
    let countryCode = null;
    const yearIdx = cells.indexOf(yearCell);
    if (yearIdx > 0) {
      winner = cells[yearIdx - 1] || "";
    } else {
      winner = cells.find(function (c) { return c && c.trim().length > 3 && c !== yearCell; }) || "";
    }
    winner = winner.trim();
    if (!winner) continue;
    // Extract country code in parens, e.g. "Jens Kristian Thysted (DEN)" → "DEN"
    const ccM = /\(([A-Z]{2,4})\)\s*$/.exec(winner);
    if (ccM) {
      countryCode = ccM[1];
      winner = winner.slice(0, ccM.index).trim();
    }
    winners.push({ year, winner, countryCode });
  }
  // Dedup + sort by year desc
  const seen = new Set();
  const unique = [];
  for (const w of winners) {
    const k = w.year + "|" + w.winner;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(w);
  }
  unique.sort(function (a, b) { return b.year - a.year; });
  return unique;
}

async function scrapeComp(compId) {
  const baseUrl = function (page) {
    return "https://rfegolf.es/CompetenciaPaginas/" + page + ".aspx?CompId=" + compId;
  };

  const micro = await httpGet(baseUrl("CompetitionMicrosite"));
  if (micro.status !== 200 || micro.body.length < 5000) {
    return { compId, ok: false, error: "Microsite status=" + micro.status + " size=" + micro.body.length };
  }
  const meta = parseMicrosite(micro.body);

  const live = await httpGet(baseUrl("LiveScoring"));
  if (live.status !== 200 || live.body.length < 5000) {
    return { compId, ok: false, error: "LiveScoring status=" + live.status + " size=" + live.body.length, meta };
  }
  const liveHtml = live.body;

  const admitidos = parseInscritos(liveHtml, "Admitidos") || [];
  const reservas = parseInscritos(liveHtml, "Reservas") || [];
  const bajas = parseInscritos(liveHtml, "Bajas") || [];
  const invitados = parseInscritos(liveHtml, "Invitados") || [];
  const noAdmitidos = parseInscritos(liveHtml, "NoAdmitidos") || [];
  const provisional = parseInscritos(liveHtml, "Provisional") || [];

  if (!meta.name) {
    const m = /<title[^>]*>([^<]+)<\/title>/i.exec(liveHtml);
    if (m) meta.name = stripTags(m[1]).replace(/^Resultados\/Clasificaciones del Torneo\s*/i, "").trim();
  }

  // Palmarés (vencedores por ano, preserved historically)
  let winners = [];
  try {
    const pal = await httpGet(baseUrl("PalmaresCompleto"));
    if (pal.status === 200 && pal.body.length > 5000) {
      winners = parsePalmares(pal.body);
    }
  } catch (e) { /* ignore */ }

  // Live leaderboard (ONLY exists during the tournament — wiped after).
  // Try to extract any rows from GridGeneral_GridEnCurso; fallback to empty.
  const liveLeaderboard = parseLiveLeaderboard(liveHtml);

  return {
    compId,
    ok: true,
    scrapedAt: new Date().toISOString(),
    meta,
    inscritos: {
      admitidos, reservas, bajas, invitados, noAdmitidos, provisional,
      counts: {
        admitidos: admitidos.length,
        reservas: reservas.length,
        bajas: bajas.length,
        invitados: invitados.length,
        noAdmitidos: noAdmitidos.length,
        provisional: provisional.length,
      },
    },
    palmares: winners,    // [{year, winner, countryCode}] — vencedores históricos
    leaderboard: liveLeaderboard,  // [{pos, name, totalToPar, total, ...}] — só durante torneio activo
  };
}

/** Parse live leaderboard from GridGeneral_GridEnCurso (only populated during tournament). */
function parseLiveLeaderboard(html) {
  const rows = parseGridRows(html, "GridEnCurso");
  if (!rows || rows.length < 2) return [];
  // Skip header rows and "no data" placeholder
  const result = [];
  for (const r of rows) {
    const cells = trCells(r).map(stripTags);
    if (cells.length < 4) continue;
    if (cells.some(function (c) { return /Todav[íi]a no/i.test(c); })) continue;
    // Try to find pos (numeric), name (with comma), total
    const posIdx = cells.findIndex(function (c) { return /^\d+$/.test(c) || /^T\d+$/.test(c); });
    const nameIdx = cells.findIndex(function (c) { return /[A-Z][^,]*,\s*[A-Z]/.test(c) && c.length > 5; });
    if (nameIdx < 0) continue;
    result.push({
      pos: posIdx >= 0 ? cells[posIdx] : null,
      name: cells[nameIdx],
      cells: cells, // raw cells for downstream parsing
    });
  }
  return result;
}

/* ────────────────────────────────────────────────────────────────
   CLI
   ──────────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);
  function getArg(n, def) { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : (def === undefined ? null : def); }
  const compArg = getArg("comp", null);
  const scopeArg = getArg("scope", null);
  const rangeArg = getArg("range", null);
  const filterArg = getArg("filter", null);
  const concurrencyArg = parseInt(getArg("concurrency", "3"), 10);
  const maxArg = parseInt(getArg("max", "0"), 10) || Infinity;
  const skipExisting = args.includes("--skip-existing");
  const pretty = args.includes("--pretty");
  const dryRun = args.includes("--dry");

  let comps = [];
  if (compArg) comps = compArg.split(",").map(function (s) { return parseInt(s.trim(), 10); });
  else if (scopeArg) {
    const scope = JSON.parse(fs.readFileSync(scopeArg, "utf8"));
    comps = (scope.tournaments || scope).map(function (t) { return t.compId || t.CompId || t; }).filter(Boolean);
  } else if (rangeArg) {
    const parts = rangeArg.split("-").map(function (s) { return parseInt(s.trim(), 10); });
    for (let i = parts[0]; i <= parts[1]; i++) comps.push(i);
  } else {
    console.log("Uso: --comp 15956 | --comp 15956,15957 | --scope path.json | --range 13500-16250");
    console.log("Flags: --concurrency N --max N --skip-existing --pretty --dry --filter juvenil");
    process.exit(1);
  }

  if (maxArg && comps.length > maxArg) comps = comps.slice(0, maxArg);

  console.log("RFEGolf scrape: " + comps.length + " CompIds, concurrency=" + concurrencyArg);
  if (dryRun) {
    console.log("DRY RUN — first 10 CompIds:", comps.slice(0, 10));
    return;
  }

  let okCount = 0, failCount = 0, skipped = 0;
  const failures = [];

  let cursor = 0;
  async function worker() {
    while (cursor < comps.length) {
      const idx = cursor++;
      const cid = comps[idx];
      const outFile = path.join(OUT_DIR, cid + ".json");
      if (skipExisting && fs.existsSync(outFile)) { skipped++; continue; }
      try {
        const result = await scrapeComp(cid);
        if (filterArg && result.ok) {
          const blob = (result.meta && result.meta.name ? result.meta.name : "") + " " +
                       (result.meta && result.meta.category ? result.meta.category : "");
          let keep = false;
          if (filterArg === "juvenil") {
            keep = /(sub-?\d+|alev[ií]n|benjam[ií]n|infantil|cadete|junior|jovenes?)/i.test(blob);
          } else {
            keep = blob.toLowerCase().includes(filterArg.toLowerCase());
          }
          if (!keep) { skipped++; continue; }
        }
        fs.writeFileSync(outFile, JSON.stringify(result, null, pretty ? 2 : 0));
        if (result.ok) okCount++;
        else { failCount++; failures.push({ cid, error: result.error }); }
        const palCount = result.palmares ? result.palmares.length : 0;
        const tag = result.ok
          ? ((result.meta && result.meta.name) || "?") + " (" + (result.inscritos ? result.inscritos.counts.admitidos : 0) + " adm, " + palCount + " palm)"
          : "FAIL: " + result.error;
        console.log("  [" + (idx + 1) + "/" + comps.length + "] " + cid + ": " + tag);
      } catch (e) {
        failCount++;
        failures.push({ cid, error: e.message });
        console.log("  [" + (idx + 1) + "/" + comps.length + "] " + cid + ": ERROR " + e.message);
      }
      await new Promise(function (r) { setTimeout(r, 100); });
    }
  }
  await Promise.all(Array.from({ length: concurrencyArg }, function () { return worker(); }));

  console.log("\nDone: ok=" + okCount + " fail=" + failCount + " skipped=" + skipped);
  if (failures.length) {
    console.log("Failures: " + failures.slice(0, 10).map(function (f) { return f.cid + ":" + f.error; }).join(", ") + (failures.length > 10 ? "..." : ""));
  }
  process.exit(okCount > 0 ? 0 : (skipped > 0 ? 2 : 1));
}

if (require.main === module) {
  main().catch(function (e) { console.error(e); process.exit(1); });
}

module.exports = { scrapeComp, parseMicrosite, parseInscritos, parsePalmares, parseLiveLeaderboard, parseGridRows, stripTags, findTableById };
