/**
 * scripts/scrape-ffgolf-calendar-jeunes.js
 *
 * Enumera torneios juvenis FFG pela **API de pesquisa do calendário** do
 * www.ffgolf.org (mais completa que o `liste-competitions` do portal resultats,
 * que deixa dezenas de fora) e ROTEIA cada torneio para o sink de resultados
 * certo — tudo por `fetch` puro, sem browser.
 *
 * Descoberta-chave (2026-07-04): cada página `/page-scores-tournoi` embute no HTML
 * ESTÁTICO uma de duas coisas:
 *   • `resultats-details/{partKey(32hex)}/{trnId}` → resultados no portal
 *     pages.ffgolf.org/resultats (a maioria dos GP Jeunes regionais). Buscamos e
 *     parseamos com o parser existente → grava `03-{ligue}-{trnId}.json` (formato
 *     do scraper resultats → aparece no /ffg secção "FFG Resultats").
 *   • `golfgenius.com/(pages|leagues|v2tournaments)/{id}` → resultados no GolfGenius
 *     (GP National / Majeur). NÃO scrapamos aqui — adicionamos ao
 *     `ffgolf-catalog.json` (merge NÃO-destrutivo) para o `scrape-ffgolf.js` o
 *     apanhar → grava `ffgolf/{year}_{slug}.json` (aparece no /ffg secção GG).
 *
 * O `api_id` da pesquisa NÃO é o trnId dos resultados — o trnId/partKey/ggPage
 * reais só vêm do HTML da página page-scores.
 *
 * Depois desta correr:
 *   node scripts/scrape-ffgolf.js --headless --year <ano>       # apanha os GG novos do catálogo
 *   node scripts/build-ffgolf-resultats-index.js                # reindexa portal
 *   node scripts/build-ffgolf-juniors-slim.js                   # slim p/ kids2
 *
 * USO:
 *   node scripts/scrape-ffgolf-calendar-jeunes.js                       # ano corrente, desde Jan
 *   node scripts/scrape-ffgolf-calendar-jeunes.js --start-month 2025-01 # recuar
 *   node scripts/scrape-ffgolf-calendar-jeunes.js --skip-existing       # não re-fetch portal já em disco
 *   node scripts/scrape-ffgolf-calendar-jeunes.js --category 87988 --max 5
 *
 * Exit codes: 0 = novidade (portal gravado OU catálogo GG alterado), 2 = nada novo, 1 = erro.
 */
const fs = require("fs");
const path = require("path");
const main = require("./scrape-ffgolf-resultats.js"); // httpRequest/parseDetailsHtml/enrichWithLinks

const OUT_DIR = path.resolve(__dirname, "../public/data/ffgolf-resultats");
const CATALOG_PATH = path.resolve(__dirname, "../public/data/ffgolf-catalog.json");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const TYPE_GP_JEUNES = "03";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name, def = null) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : def; };
const category = getArg("category", "87988"); // GP Jeunes
const startMonth = getArg("start-month", `${new Date().getFullYear()}-01`);
const maxArg = parseInt(getArg("max", "0"), 10) || Infinity;
const skipExisting = args.includes("--skip-existing");

// ── Mapa região→código de liga (derivado do disco) + tabela www ──
function buildRegionCodeMap() {
  const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "");
  const counts = {};
  for (const f of fs.readdirSync(OUT_DIR)) {
    const m = f.match(/^\d{1,2}-(\d{1,2})-\d+\.json$/);
    if (!m) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8"));
      const reg = j.details?.series?.[0]?.players?.[0]?.region || j.details?.series?.[0]?.players?.[0]?.rte_lib_cou;
      if (!reg) continue;
      const rn = norm(reg);
      (counts[rn] = counts[rn] || {})[m[1]] = (counts[rn]?.[m[1]] || 0) + 1;
    } catch { /* ignore */ }
  }
  const map = {};
  for (const rn in counts) map[rn] = Object.entries(counts[rn]).sort((a, b) => b[1] - a[1])[0][0].padStart(2, "0");
  return { map, norm };
}
// nome-de-liga-www → código (regiões com múltiplos códigos: escolhe-se canónico; é só agrupamento)
const WWW_LEAGUE_CODE = {
  PARISILEDEFRANCE: "01", AUVERGNERHONEALPES: "02", NOUVELLEAQUITAINE: "03",
  PACA: "04", PROVENCEALPESCOTEDAZUR: "04", OCCITANIE: "06", HAUTSDEFRANCE: "07",
  GRANDEST: "08", NORMANDIE: "09", BRETAGNE: "10", BOURGOGNEFCOMTE: "13",
  BOURGOGNEFRANCHECOMTE: "13", REUNION: "14", CORSE: "15", PAYSDELALOIRE: "16",
  CENTREVALDELOIRE: "12",
};
function ligueCodeFor(leagueName, regionMap) {
  const rn = regionMap.norm(leagueName);
  return WWW_LEAGUE_CODE[rn] || regionMap.map[rn] || "00";
}
function existingFileForTrn(trnId) {
  const f = fs.readdirSync(OUT_DIR).find((n) => new RegExp(`^\\d{1,2}-\\d{1,2}-${trnId}\\.json$`).test(n));
  return f ? path.join(OUT_DIR, f) : null;
}

// ── Fetch helpers ─────────────────────────────────────────────
async function fetchSearchPage(offset, limit) {
  const url = `https://www.ffgolf.org/search/tournament/amateur_tournament/${category}` +
    `?search%5Bstart_month%5D=${encodeURIComponent(startMonth)}&offset=${offset}&limit=${limit}`;
  const res = await main.httpRequest("GET", url, {
    headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Accept": "application/json" },
  });
  if (res.status !== 200) throw new Error(`search HTTP ${res.status}`);
  return JSON.parse(res.body);
}

/** Lê o HTML da página de scores e devolve o sink dos resultados. */
async function resolveSink(scoresUrl) {
  const url = scoresUrl.startsWith("http") ? scoresUrl : `https://www.ffgolf.org${scoresUrl}`;
  const res = await main.httpRequest("GET", url, { headers: { "User-Agent": UA } });
  if (res.status !== 200) return null;
  const gg = res.body.match(/golfgenius\.com\/(pages|leagues|v2tournaments)\/(\d+)/i);
  if (gg) return { kind: "gg", ggKind: gg[1].toLowerCase(), ggId: gg[2] };
  const p = res.body.match(/resultats-details\/([a-f0-9]{32})\/(\d+)/i);
  if (p) return { kind: "portal", partKey: p[1], trnId: p[2] };
  return null;
}

/** Busca+parseia o HTML dos resultados do portal (iframe GET, sem cookies). */
async function fetchPortalDetails({ partKey, trnId }) {
  const url = `https://pages.ffgolf.org/resultats/resultats-details/${partKey}/${trnId}`;
  const res = await main.httpRequest("GET", url, { headers: { "User-Agent": UA, "Referer": "https://pages.ffgolf.org/resultats/" } });
  if (res.status !== 200) throw new Error(`details HTTP ${res.status}`);
  if (/pas encore publiés|n'est pas disponible/i.test(res.body)) return null;
  return main.parseDetailsHtml(res.body, trnId);
}

/** Extrai {section, year, slug} da URL do botão scores. */
function parseScoresUrl(u) {
  const m = u.match(/calendrier-resultats\/([^/]+)\/(\d{4})\/([^/]+)\//);
  return m ? { section: m[1], year: parseInt(m[2], 10), slug: m[3] } : null;
}

// ── Catálogo GolfGenius — merge NÃO-destrutivo ────────────────
function loadCatalog() {
  try {
    const j = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
    return { wrap: j, list: Array.isArray(j) ? j : (j.tournaments || []) };
  } catch { return { wrap: { generated_at: null, tournaments: [] }, list: [] }; }
}
function saveCatalog(cat) {
  const wrap = Array.isArray(cat.wrap) ? cat.list : { ...cat.wrap, tournaments: cat.list, total: cat.list.length, with_gg: cat.list.filter((c) => c.gg_page).length, updated_at: new Date().toISOString() };
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(wrap, null, 2), "utf-8");
}
/** Adiciona/actualiza uma entrada GG sem apagar as existentes. Devolve true se mudou. */
function upsertCatalogGG(cat, { year, section, slug, title, ggKind, ggId }) {
  const gg_page = ggKind === "pages" ? ggId : null;
  const gg_league = ggKind === "leagues" ? ggId : null;
  const gg_v2 = ggKind === "v2tournaments" ? ggId : null;
  const existing = cat.list.find((e) => e.slug === slug && e.year === year);
  if (existing) {
    // só actualiza se ainda não tinha id GG (nunca sobrescrever curadoria manual não-vazia)
    if (!existing.gg_page && !existing.gg_league && (gg_page || gg_league || gg_v2)) {
      Object.assign(existing, { gg_page: gg_page || existing.gg_page, gg_league: gg_league || existing.gg_league, gg_v2: gg_v2 || existing.gg_v2 });
      return true;
    }
    return false;
  }
  cat.list.push({
    year, section, slug, title,
    gg_page, gg_league, ...(gg_v2 ? { gg_v2 } : {}),
    ffgolf_url: `https://www.ffgolf.org/golf-amateur/jeunes/calendrier-resultats/${section}/${year}/${slug}/page-scores-tournoi`,
    source: "calendar-jeunes",
  });
  return true;
}

// ── Main ──────────────────────────────────────────────────────
(async () => {
  console.log(`🇫🇷 FFG Calendar Jeunes — categoria ${category}, desde ${startMonth}`);
  const regionMap = buildRegionCodeMap();
  const catalog = loadCatalog();

  // 1) enumerar (paginado)
  const docs = [];
  const PAGE = 50;
  for (let offset = 0; ; offset += PAGE) {
    const j = await fetchSearchPage(offset, PAGE);
    docs.push(...(j.documents || []));
    if (offset + PAGE >= (j.numFound || 0) || !(j.documents || []).length) break;
    await sleep(300);
  }
  console.log(`   ${docs.length} torneios na pesquisa\n`);

  let savedPortal = 0, ggAdded = 0, skipped = 0, noScores = 0, noResults = 0, errors = 0;
  for (const d of docs) {
    if (savedPortal + ggAdded >= maxArg) break;
    const scoresBtn = (d.buttons || []).find((b) => /scores/i.test(b.name));
    if (!scoresBtn) { noScores++; continue; }
    try {
      const sink = await resolveSink(scoresBtn.url);
      await sleep(250);
      if (!sink) { noScores++; continue; }

      if (sink.kind === "gg") {
        const meta = parseScoresUrl(scoresBtn.url);
        if (!meta) { errors++; continue; }
        const changed = upsertCatalogGG(catalog, { ...meta, title: (d.name || "").trim(), ggKind: sink.ggKind, ggId: sink.ggId });
        if (changed) { ggAdded++; console.log(`🏷️  catálogo GG  ${sink.ggKind}/${sink.ggId}  ${(d.name || "").trim().slice(0, 44)}`); }
        else skipped++;
        continue;
      }

      // portal
      const existing = existingFileForTrn(sink.trnId);
      if (existing && skipExisting) { skipped++; continue; }
      const ligue = existing ? path.basename(existing).match(/^\d{1,2}-(\d{1,2})-/)[1] : ligueCodeFor(d.league?.name, regionMap);
      const outPath = existing || path.join(OUT_DIR, `${TYPE_GP_JEUNES}-${ligue}-${sink.trnId}.json`);
      const details = await fetchPortalDetails(sink);
      await sleep(250);
      const nPlayers = details ? details.series.reduce((s, x) => s + (x.players?.length || 0), 0) : 0;
      if (!nPlayers) { noResults++; continue; }
      const record = main.enrichWithLinks({
        trnId: sink.trnId, partKey: sink.partKey, name: (d.name || "").trim(),
        formule: d.play_formula?.name || null,
        date: (d.start_date || "").slice(0, 10).split("-").reverse().join("/"),
        details, typeCompetition: TYPE_GP_JEUNES, ligue,
      });
      fs.writeFileSync(outPath, JSON.stringify(record, null, 2), "utf-8");
      savedPortal++;
      console.log(`💾 portal  ${TYPE_GP_JEUNES}-${ligue}-${sink.trnId}  ${(d.name || "").trim().slice(0, 40)}  (${nPlayers} jog)`);
    } catch (e) {
      errors++;
      console.log(`⚠ ${(d.name || "").trim().slice(0, 40)}: ${String(e.message).slice(0, 70)}`);
    }
  }

  if (ggAdded) saveCatalog(catalog);
  console.log(`\n✅ Portal gravados: ${savedPortal} · GG no catálogo: ${ggAdded} · Skipped: ${skipped} · Sem resultados publicados: ${noScores + noResults} · Erros: ${errors}`);
  process.exit(savedPortal + ggAdded > 0 ? 0 : 2);
})().catch((e) => { console.error("❌", e); process.exit(1); });
