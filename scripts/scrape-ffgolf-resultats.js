/**
 * scripts/scrape-ffgolf-resultats.js
 *
 * Scraper Node-puro do portal oficial FFG: pages.ffgolf.org/resultats/
 * Substitui o pipeline LGPIDF (PDFs concatenados) por dados estruturados HTML
 * vindos directamente do sistema central da Federação Francesa de Golf.
 *
 * COBRE TODAS AS LIGAS (22) DESDE 2015:
 *   - Compétitions fédérales (CF)
 *   - Grands Prix (GP)
 *   - Grands Prix Jeunes (GPJEUNES, codigo 03)
 *   - Grands Prix / Trophées Seniors
 *   - Classics Mid-Am
 *   - Compétitions Entreprise / par Golf / Ligue
 *
 * USO:
 *   node scripts/scrape-ffgolf-resultats.js                      # default: GP Jeunes Paris-IdF 2026
 *   node scripts/scrape-ffgolf-resultats.js --type 03 --ligue 01 --year 2026
 *   node scripts/scrape-ffgolf-resultats.js --type 03 --ligue all --year 2026
 *   node scripts/scrape-ffgolf-resultats.js --type 03 --ligue 01 --year 2025
 *   node scripts/scrape-ffgolf-resultats.js --trn 2601405022     # 1 torneio específico
 *
 * NOTAS DE INVESTIGAÇÃO (2026-05-06, descobertas via Chrome MCP):
 *   - GET /resultats/ retorna shell HTML — extrair glfPartKey (32 hex) de hidden input
 *     ou cookie de sessão.
 *   - POST /resultats/liste-competitions
 *       body: typeCompetition=<TYP>&ligue=<LIG>
 *       devolve HTML com <table id="resultats"> + linhas com link clickável.
 *       O nome do torneio + data + formula + um anchor com onclick={trnId} ou href.
 *   - POST /resultats/resultats-details
 *       body: glfPartKey=<32hex>&trnId=<num>&typeCompetition=<TYP>&ligue=<LIG>&iframe=1
 *       devolve HTML grande (~1.3MB) com várias <table id="resultatsSerie<N>">,
 *       uma por divisão. Headers: Clt|Nat|Prénom Nom|Idx|Club|T1|T2|T3|T4|Total
 *
 * Códigos de tipo de competição:
 *   01 = Compétitions fédérales      05 = Classics Mid-Am
 *   02 = Grands Prix                 06 = Compétitions Entreprise
 *   03 = Grands Prix Jeunes          07 = Compétitions par Golf
 *   04 = Trophées Seniors            08 = Compétitions Ligue
 *
 * Códigos de liga (regiões FR):
 *   01 = Paris-Île-de-France          12 = Centre-Val de Loire
 *   02 = Auvergne-Rhône-Alpes         13 = Bourgogne-F.-Comte
 *   03 = Nouvelle-Aquitaine           14 = Réunion
 *   04 = Provence-Alpes-Côte d'Azur   15 = Corse
 *   06 = Occitanie                    16 = Nouvelle-Calédonie
 *   07 = Hauts-de-France              17 = Guadeloupe
 *   08 = Grand-Est                    18 = Polynésie
 *   09 = Normandie                    19 = Clubs étrangers
 *   10 = Pays de la Loire             20 = Martinique
 *   11 = Bretagne                     21 = Guyane
 *                                     22 = Outre-Mer
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT_DIR = path.resolve(__dirname, "../public/data/ffgolf-resultats");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

/* ──────────────────────────────────────────────────────────────
   HTTP helpers (sem deps externas)
   ────────────────────────────────────────────────────────────── */

function httpRequest(method, urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const isPost = method === "POST";
    const body = opts.body || "";
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      "Referer": "https://pages.ffgolf.org/resultats/",
      ...(isPost ? {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Content-Length": Buffer.byteLength(body),
        "X-Requested-With": "XMLHttpRequest",
      } : {}),
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      ...(opts.headers || {}),
    };
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      port: 443,
      method,
      headers,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: buf.toString("utf-8"),
          setCookies: res.headers["set-cookie"] || [],
        });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    if (isPost) req.write(body);
    req.end();
  });
}

/** Junta múltiplos Set-Cookie em uma string para Cookie header */
function buildCookieJar(prevJar, setCookies) {
  const jar = { ...(prevJar || {}) };
  for (const sc of setCookies) {
    const [pair] = sc.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return jar;
}
function jarToHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

/* ──────────────────────────────────────────────────────────────
   Step 1 — bootstrap (apanhar cookies + glfPartKey)
   ────────────────────────────────────────────────────────────── */

async function bootstrap() {
  console.log("🔐 Bootstrap: GET /resultats/ ...");
  const res = await httpRequest("GET", "https://pages.ffgolf.org/resultats/");
  if (res.status !== 200) throw new Error(`Bootstrap falhou: HTTP ${res.status}`);
  const jar = buildCookieJar({}, res.setCookies);
  // Nota: o glfPartKey vem por torneio na listagem (atributo part-key="...")
  // — não é uma sessão global. Aqui só apanhamos os cookies de sessão (PHPSESSID).
  console.log(`   ✓ ${Object.keys(jar).length} cookies de sessão`);
  return { jar };
}

/* ──────────────────────────────────────────────────────────────
   Step 2 — listar competições
   ────────────────────────────────────────────────────────────── */

async function listCompetitions(ctx, { typeCompetition, ligue, annee }) {
  console.log(`📋 listCompetitions(type=${typeCompetition}, ligue=${ligue}, annee=${annee || "all"})`);
  const params = new URLSearchParams();
  params.set("typeCompetition", typeCompetition);
  params.set("ligue", ligue);
  if (annee) params.set("annee", annee);
  const res = await httpRequest("POST", "https://pages.ffgolf.org/resultats/liste-competitions", {
    body: params.toString(),
    cookie: jarToHeader(ctx.jar),
  });
  if (res.status !== 200) throw new Error(`listCompetitions HTTP ${res.status}`);
  // Actualizar jar
  ctx.jar = buildCookieJar(ctx.jar, res.setCookies);
  // Parsear HTML — procurar tabela #resultats
  const tournaments = parseListeCompetitionsHtml(res.body, annee);
  console.log(`   ✓ ${tournaments.length} torneios encontrados`);
  return tournaments;
}

/**
 * Parse <table id="resultats"> rows.
 * Estrutura confirmada (descoberta via Chrome MCP):
 *   <tr>
 *     <td><a id="view_resultats_<trnId>" href="javascript:void(0)"
 *            class="view_resultats"
 *            trn-id="<trnId>"
 *            part-key="<32hex>">Nome do torneio</a></td>
 *     <td>Simple</td>
 *     <td>21/03/2026</td>
 *     <td><a class="view_resultats" trn-id=... part-key=... /></td>
 *   </tr>
 *
 * O `part-key` é específico DESTE torneio — não é uma sessão global.
 * Tem de ser usado no POST resultats-details como `glfPartKey`.
 */
function parseListeCompetitionsHtml(html, yearFilter) {
  const list = [];
  const tableMatch = html.match(/<table[^>]*id=["']resultats["'][^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return list;
  const tbody = tableMatch[1];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(tbody))) {
    const row = rowMatch[1];
    if (/<th\b/i.test(row)) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 3) continue;
    const nameTxt = stripTags(cells[0]);
    const formuleTxt = stripTags(cells[1]);
    const dateTxt = stripTags(cells[2]);
    // Extrair trn-id e part-key — chaves com hífen em vez de data-* ou camelCase
    const trnMatch = row.match(/trn-id=["'](\d+)["']/i);
    const keyMatch = row.match(/part-key=["']([a-f0-9]{32})["']/i);
    const trnId = trnMatch ? trnMatch[1] : null;
    const partKey = keyMatch ? keyMatch[1] : null;
    if (yearFilter && !dateTxt.includes(String(yearFilter))) continue;
    list.push({ trnId, partKey, name: nameTxt, formule: formuleTxt, date: dateTxt });
  }
  return list;
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/* ──────────────────────────────────────────────────────────────
   Step 3 — detalhes de um torneio
   ────────────────────────────────────────────────────────────── */

async function getTournamentDetails(ctx, { trnId, partKey, typeCompetition, ligue }) {
  if (!partKey) throw new Error(`partKey em falta para trnId ${trnId}`);
  const params = new URLSearchParams();
  params.set("glfPartKey", partKey);
  params.set("trnId", trnId);
  params.set("typeCompetition", typeCompetition);
  params.set("ligue", ligue);
  params.set("iframe", "1");
  const res = await httpRequest("POST", "https://pages.ffgolf.org/resultats/resultats-details", {
    body: params.toString(),
    cookie: jarToHeader(ctx.jar),
  });
  if (res.status !== 200) throw new Error(`details HTTP ${res.status}`);
  ctx.jar = buildCookieJar(ctx.jar, res.setCookies);
  return parseDetailsHtml(res.body, trnId);
}

/**
 * Parse o HTML grande dos detalhes.
 *
 * Descoberta-chave: existe um <input type="hidden" id="joueursSerie"> com JSON
 * completo de TODOS os jogadores e TODOS os scorecards hole-by-hole. É a fonte
 * autoritativa — usar este em vez de parsear o HTML das tabelas.
 *
 * Estrutura do JSON:
 *   {
 *     "<serieId>": [
 *       {
 *         glf_cpt, cod_cpt, dte_cpt, num_ter, lib_cpt, heu_dep, typ_res, num_rep,
 *         num_ser, typ_ser, lib_typ_cpt, le_par, nb_trou_joue, lib_for, glf_org,
 *         lib_ter, par_ter (18 dígitos, par/buraco), num_cmp, ord_cmp,
 *         glf_lib_cou (clube), rte_lib_cou (região), lic_num (licença),
 *         nom_jou, pre_jou, joueur, nat_jou, glf_lic, sex_jou, idx_trf (hcp),
 *         lst_rge,
 *         sta_sco_1, score_1 (36 dígitos = 18 × 2 dígitos por buraco),
 *         sta_sco_2, score_2, sta_sco_3, score_3, sta_sco_4, score_4,
 *         tour1, tour2, tour3, tour4 (totais), total, clt, ...
 *       }
 *     ],
 *     ...
 *   }
 *
 * Tabela HTML é mantida como fallback quando o JSON não está acessível.
 */
function parseDetailsHtml(html, trnId) {
  const out = {
    trnId,
    series: [],
    courseInfo: null,
    rawTitle: null,
    rawDates: null,
    rawCourse: null,
  };
  // Title / dates — heurístico (rawTitle pode ser inútil, dteCpt do JSON é melhor)
  const titleMatch = html.match(/<h\d[^>]*>([^<]+)<\/h\d>/);
  if (titleMatch) out.rawTitle = titleMatch[1].trim();
  const datesMatch = html.match(/du\s+(\d{2}\/\d{2}\/\d{4})\s+au\s+(\d{2}\/\d{2}\/\d{4})/);
  if (datesMatch) out.rawDates = { start: datesMatch[1], end: datesMatch[2] };

  // Tentar extrair o input hidden joueursSerie (fonte autoritativa)
  // value="..." com HTML entity-escaped JSON
  const inpMatch = html.match(/<input[^>]*id=["']joueursSerie["'][^>]*value=["']([^"']*)["']/i);
  if (inpMatch) {
    try {
      const raw = inpMatch[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#039;/g, "'")
        .replace(/&apos;/g, "'");
      const json = JSON.parse(raw);
      // Cada chave é um serieId com array de jogadores
      for (const serieId of Object.keys(json)) {
        const rawPlayers = Array.isArray(json[serieId]) ? json[serieId] : [];
        const players = rawPlayers.map(parseFFGPlayer).filter(Boolean);
        // Course info comum a todos (do primeiro jogador)
        let lib_ter = null, par_ter = null, glf_org = null;
        if (rawPlayers[0]) {
          lib_ter = rawPlayers[0].lib_ter || null;
          par_ter = rawPlayers[0].par_ter || null;
          glf_org = rawPlayers[0].glf_org || null;
        }
        out.series.push({
          serieId,
          label: rawPlayers[0]?.lib_for || null,
          courseTerrain: lib_ter,
          parString: par_ter,
          parPerHole: par_ter ? par_ter.split("").map((c) => parseInt(c, 10)) : null,
          parTotal: par_ter ? par_ter.split("").map(Number).reduce((a, b) => a + b, 0) : null,
          glfOrg: glf_org,
          players,
        });
      }
      // Dates / course do primeiro jogador da primeira série
      const firstSerie = out.series.find((s) => s.players.length > 0);
      if (firstSerie && rawPlayers0(json)) {
        const fp = rawPlayers0(json);
        if (fp.dte_cpt) out.dateString = fp.dte_cpt;
        if (fp.lib_cpt) out.libCpt = fp.lib_cpt;
      }
      return out;
    } catch (e) {
      console.log(`   ⚠ Erro a parsear joueursSerie JSON: ${e.message.slice(0, 80)}`);
      // Cair para fallback HTML abaixo
    }
  }

  // Fallback: parsear tabelas HTML (sem hole-by-hole, só totais)
  const serieRe = /<table[^>]*id=["']resultatsSerie(\d+)["'][^>]*>([\s\S]*?)<\/table>/gi;
  let serieMatch;
  while ((serieMatch = serieRe.exec(html))) {
    const serieId = serieMatch[1];
    const tableHtml = serieMatch[2];
    const players = parseSerieRows(tableHtml);
    out.series.push({ serieId, label: null, players });
  }
  return out;
}

/** Devolve o primeiro jogador do JSON joueursSerie (de qualquer série) */
function rawPlayers0(json) {
  for (const k of Object.keys(json)) {
    if (Array.isArray(json[k]) && json[k].length > 0) return json[k][0];
  }
  return null;
}

/**
 * Converte 1 player do JSON joueursSerie para o formato output.
 * Decifra os scores hole-by-hole de cada round.
 *
 * score_X: string de 36 dígitos = 18 buracos × 2 dígitos por buraco.
 *          Ex: "040405060404040504050404050406040403" =
 *              [04, 04, 05, 06, 04, 04, 04, 05, 04, 05, 04, 04, 05, 04, 06, 04, 04, 03]
 *          Soma = 79 (T1 score)
 */
function parseFFGPlayer(p) {
  if (!p || !p.joueur) return null;
  const decodeScore = (s) => {
    if (!s || typeof s !== "string" || s.length < 36) return null;
    const out = [];
    for (let i = 0; i < 36; i += 2) out.push(parseInt(s.slice(i, i + 2), 10));
    return out;
  };
  const r1 = decodeScore(p.score_1);
  const r2 = decodeScore(p.score_2);
  const r3 = decodeScore(p.score_3);
  const r4 = decodeScore(p.score_4);
  return {
    classement: p.clt != null ? String(p.clt) : null,
    pos: p.clt != null ? Number(p.clt) : null,
    flag: p.nat_jou || "",
    name: p.joueur || `${p.pre_jou || ""} ${p.nom_jou || ""}`.trim(),
    nameNom: p.nom_jou || null,
    namePrenom: p.pre_jou || null,
    sex: p.sex_jou || null,
    nationality: p.nat_jou || null,
    license: p.lic_num || null,
    glfLic: p.glf_lic || null,
    hcp: p.idx_trf != null ? parseFloat(String(p.idx_trf).replace(",", ".")) : null,
    club: p.glf_lib_cou || "",
    region: p.rte_lib_cou || null,
    teeTime: p.heu_dep || null,
    statusR1: p.sta_sco_1 || null,
    statusR2: p.sta_sco_2 || null,
    statusR3: p.sta_sco_3 || null,
    statusR4: p.sta_sco_4 || null,
    t1: p.tour1 != null && p.tour1 !== "" ? parseInt(p.tour1, 10) : null,
    t2: p.tour2 != null && p.tour2 !== "" ? parseInt(p.tour2, 10) : null,
    t3: p.tour3 != null && p.tour3 !== "" ? parseInt(p.tour3, 10) : null,
    t4: p.tour4 != null && p.tour4 !== "" ? parseInt(p.tour4, 10) : null,
    total: p.total != null ? Number(p.total) : null,
    scoresR1: r1,
    scoresR2: r2,
    scoresR3: r3,
    scoresR4: r4,
  };
}

function parseSerieRows(tableHtml) {
  const players = [];
  // Headers para mapear índices
  const theadMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  let headers = [];
  if (theadMatch) {
    headers = [...theadMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => stripTags(m[1]));
  }
  // Body
  const tbodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return players;
  const tbody = tbodyMatch[1];
  const rowRe = /<tr[^>]*class=["']ligne["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(tbody))) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    if (cells.length < 6) continue;
    // Mapeamento típico: [0:Classement, 1:Clt, 2:Nat, 3:Prénom Nom, 4:Idx, 5:Club, 6:T1, 7:T2, 8:T3, 9:T4, 10:Total, 11:legend, 12:expand]
    const player = {
      classement: cells[0] || null,
      pos: parseIntOrNull(cells[1]),
      flag: cells[2] || "",
      name: cells[3] || "",
      hcp: parseFloatOrNull((cells[4] || "").replace(",", ".")),
      club: cells[5] || "",
      t1: parseIntOrNull(cells[6]),
      t2: parseIntOrNull(cells[7]),
      t3: parseIntOrNull(cells[8]),
      t4: parseIntOrNull(cells[9]),
      total: parseIntOrNull(cells[10]),
    };
    if (player.name) players.push(player);
  }
  return players;
}

function parseIntOrNull(s) {
  if (!s) return null;
  const n = parseInt(s.replace(/\D/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}
function parseFloatOrNull(s) {
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

/* ──────────────────────────────────────────────────────────────
   EXPORTS — para reutilização (orquestrador all-jeunes)
   ────────────────────────────────────────────────────────────── */
module.exports = {
  bootstrap,
  listCompetitions,
  getTournamentDetails,
  parseDetailsHtml,
  parseFFGPlayer,
  httpRequest,
};

/* ──────────────────────────────────────────────────────────────
   MAIN — só corre se chamado directamente, não quando importado
   ────────────────────────────────────────────────────────────── */
if (require.main === module) (async () => {
  const args = process.argv.slice(2);
  const getArg = (name, def = null) => {
    const i = args.indexOf("--" + name);
    return i >= 0 ? args[i + 1] : def;
  };

  const typeCompetition = getArg("type", "03");
  const ligue = getArg("ligue", "01");
  const annee = getArg("year", "2026");
  const trnArg = getArg("trn", null);

  try {
    const ctx = await bootstrap();

    if (trnArg) {
      // Para 1 torneio precisamos do partKey — temos de listar primeiro
      console.log(`\n🏌️  Trn único: ${trnArg} (precisamos da listagem para obter partKey)`);
      const tournaments = await listCompetitions(ctx, { typeCompetition, ligue, annee });
      const t = tournaments.find((x) => x.trnId === trnArg);
      if (!t) throw new Error(`trnId ${trnArg} não encontrado na listagem (type=${typeCompetition}, ligue=${ligue}, annee=${annee})`);
      const details = await getTournamentDetails(ctx, { trnId: t.trnId, partKey: t.partKey, typeCompetition, ligue });
      const outPath = path.join(OUT_DIR, `${typeCompetition}-${ligue}-${trnArg}.json`);
      fs.writeFileSync(outPath, JSON.stringify({ ...t, details }, null, 2), "utf-8");
      console.log(`   💾 ${outPath}`);
      console.log(`   ${details.series.length} série(s), ${details.series.reduce((s, x) => s + x.players.length, 0)} jogadores`);
    } else {
      // Listar e descarregar todos
      const tournaments = await listCompetitions(ctx, { typeCompetition, ligue, annee });
      const summary = {
        scrapedAt: new Date().toISOString(),
        typeCompetition, ligue, annee,
        total: tournaments.length,
        tournaments: [],
      };
      for (const t of tournaments) {
        if (!t.trnId) {
          console.log(`   ⚠ Sem trnId: ${t.name}`);
          continue;
        }
        if (!t.partKey) {
          console.log(`   ⚠ Sem partKey: ${t.name}`);
          continue;
        }
        try {
          const details = await getTournamentDetails(ctx, { trnId: t.trnId, partKey: t.partKey, typeCompetition, ligue });
          const outPath = path.join(OUT_DIR, `${typeCompetition}-${ligue}-${t.trnId}.json`);
          fs.writeFileSync(outPath, JSON.stringify({ ...t, details }, null, 2), "utf-8");
          const totalPlayers = details.series.reduce((s, x) => s + x.players.length, 0);
          console.log(`   💾 ${t.name.slice(0, 50)}: ${details.series.length} séries, ${totalPlayers} jogadores`);
          summary.tournaments.push({ ...t, totalPlayers, file: path.basename(outPath) });
          // pausa para não martelar o servidor
          await new Promise((r) => setTimeout(r, 500));
        } catch (e) {
          console.log(`   ❌ ${t.name}: ${e.message}`);
        }
      }
      const summaryPath = path.join(OUT_DIR, `_index-${typeCompetition}-${ligue}-${annee}.json`);
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
      console.log(`\n✅ ${summary.tournaments.length}/${tournaments.length} OK · index: ${summaryPath}`);
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    if (e.stack) console.error(e.stack.split("\n").slice(0, 5).join("\n"));
    process.exit(1);
  }
})();
