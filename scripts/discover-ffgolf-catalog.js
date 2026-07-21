/**
 * scripts/discover-ffgolf-catalog.js
 *
 * Descobre o catálogo completo de torneios juvenis FFGolf de um ou mais anos,
 * percorrendo as 3 secções públicas em ffgolf.org:
 *   - national-international
 *   - equipes-de-france
 *   - grands-prix-jeunes
 *
 * Para cada torneio, abre a página /page-scores-tournoi e extrai o iframe
 * GolfGenius (gg_page).
 *
 * USO:
 *   node scripts/discover-ffgolf-catalog.js --year 2025
 *   node scripts/discover-ffgolf-catalog.js --year 2025 --year 2026
 *   node scripts/discover-ffgolf-catalog.js --year 2026 --headless
 *
 * Output: public/data/ffgolf-catalog.json
 *
 * REQUISITOS: npm install playwright
 *
 * NOTA: o site lista APENAS os torneios "com resultados publicados". Alguns
 * Championnats de France (U12/Benjamins) podem não aparecer na listagem,
 * mas o URL directo /jeunes/calendrier-resultats/{circuito}/{ano}/{slug}/page-scores-tournoi
 * funciona se conhecermos o slug. Slugs conhecidos hardcoded em KNOWN_SLUGS abaixo.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const FFGOLF_BASE = "https://www.ffgolf.org/golf-amateur/jeunes/calendrier-resultats";
const SECTIONS = ["national-international", "equipes-de-france", "grands-prix-jeunes"];

/** Slugs conhecidos que NÃO aparecem na listagem pública mas existem como página
 *  /page-scores-tournoi (verificados manualmente em 2026-05). Se souberes mais,
 *  acrescenta aqui — não é "adivinhar", é completar a partir de URLs reais. */
const KNOWN_SLUGS = {
  "national-international": {
    2025: [
      "championnat-de-france-des-jeunes-u12-garcons-trophee-crocodile",
      "championnat-de-france-des-jeunes-u12-filles-trophee-crocodile",
      "championnat-de-france-des-jeunes-benjamins",
      "championnat-de-france-des-jeunes-benjamines",
      "championnat-de-france-minimes-garcons-coupe-yan-le-quellec2",
      "championnat-de-france-minimes-filles",
    ],
    2026: [],
  },
};

function parseArgs(argv) {
  const args = { years: [], headless: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--year") args.years.push(parseInt(argv[++i], 10));
    else if (argv[i] === "--headless") args.headless = true;
  }
  if (!args.years.length) args.years = [new Date().getFullYear()];
  return args;
}

async function listSlugsInListing(page, section, year) {
  const url = `${FFGOLF_BASE}/${section}/${year}`;
  console.log(`  📋 Listing ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // Forçar lazy-load das listagens (algumas páginas só renderizam após scroll)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);

  const slugs = await page.evaluate(({ sec, yr }) => {
    const set = new Set();
    document.querySelectorAll("a").forEach((a) => {
      const h = a.getAttribute("href") || "";
      const re = new RegExp(`/${sec}/${yr}/([a-z0-9\\-]+)`);
      const m = h.match(re);
      if (m) set.add(m[1]);
    });
    return [...set].sort();
  }, { sec: section, yr: year });
  return slugs;
}

async function getGgIdsForTournament(page, section, year, slug) {
  const url = `${FFGOLF_BASE}/${section}/${year}/${slug}/page-scores-tournoi`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    const data = await page.evaluate(() => {
      const ggSrc = [...document.querySelectorAll("iframe")]
        .map((f) => f.src)
        .find((s) => s && s.includes("golfgenius"));
      if (!ggSrc) return null;
      const pageMatch = ggSrc.match(/pages\/(\d+)/);
      const leagueMatch = ggSrc.match(/leagues\/(\d+)/);
      const title = document.title.replace(/ : .*$| \| .*$/, "").trim();
      return {
        gg_page: pageMatch ? pageMatch[1] : null,
        gg_league: leagueMatch ? leagueMatch[1] : null,
        gg_iframe: ggSrc.split("?")[0],
        title,
      };
    });
    return data;
  } catch (e) {
    console.log(`    ⚠ erro em ${slug}: ${e.message.slice(0, 80)}`);
    return null;
  }
}

(async () => {
  const args = parseArgs(process.argv);
  console.log(`🔎 Descobrir catálogo FFGolf — anos: ${args.years.join(", ")}`);
  const browser = await chromium.launch({ headless: args.headless });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const catalog = [];

  for (const year of args.years) {
    for (const section of SECTIONS) {
      console.log(`\n— ${section} ${year} —`);
      const listed = await listSlugsInListing(page, section, year);
      const known = (KNOWN_SLUGS[section]?.[year] || []).filter(s => !listed.includes(s));
      const allSlugs = [...listed, ...known];
      console.log(`  ${listed.length} listados + ${known.length} conhecidos = ${allSlugs.length} torneios`);

      for (const slug of allSlugs) {
        const gg = await getGgIdsForTournament(page, section, year, slug);
        if (gg && gg.gg_page) {
          console.log(`    ✓ ${slug} → ${gg.gg_page}`);
          catalog.push({
            year,
            section,
            slug,
            ffgolf_url: `${FFGOLF_BASE}/${section}/${year}/${slug}`,
            ffgolf_scores_url: `${FFGOLF_BASE}/${section}/${year}/${slug}/page-scores-tournoi`,
            ...gg,
          });
        } else {
          console.log(`    ✗ ${slug} (sem iframe golfgenius)`);
          catalog.push({
            year,
            section,
            slug,
            // SEM `title`: o ffgolf.org não no-lo deu. Não se deriva do slug —
            // seria um nome inventado a passar por oficial. Quem consome tem de
            // aguentar a ausência (a FFGPage cai no nome do torneio scrapado).
            ffgolf_url: `${FFGOLF_BASE}/${section}/${year}/${slug}`,
            gg_page: null,
            gg_league: null,
          });
        }
      }
    }
  }

  await browser.close();

  // ── Merge com o catálogo existente (cron-safe) ──────────────────────────
  // O run só descobre os anos pedidos; sobrescrever o ficheiro apagaria os
  // outros anos. Regras: entradas frescas ganham por (year|section|slug);
  // entradas antigas não redescobertas MANTÊM-SE (o site delista torneios
  // antigos, mas os dados continuam válidos e o scraper salta o que já tem).
  const outPath = path.resolve(__dirname, "../public/data/ffgolf-catalog.json");
  let existing = { years: [], tournaments: [] };
  try { existing = JSON.parse(fs.readFileSync(outPath, "utf-8")); } catch { /* 1º run */ }

  const keyOf = (t) => `${t.year}|${t.section}|${t.slug}`;
  const merged = new Map((existing.tournaments || []).map((t) => [keyOf(t), t]));
  let nNew = 0, nUpd = 0, nKept = 0;
  for (const t of catalog) {
    const k = keyOf(t);
    if (!merged.has(k)) nNew++;
    else nUpd++;
    const prev = merged.get(k) || {};
    // Fresco ganha, mas sem perder campos curados que o discovery não traz.
    const next = { ...prev, ...t };
    // ⚠ NUNCA deixar um null fresco apagar um gg_page/gg_league já conhecido.
    // O ffgolf.org falha de forma intermitente (404 no /page-scores-tournoi,
    // iframe `next_round` em vez do leaderboard, manutenção) e o spread acima
    // dava-lhe poder de apagar ids bons — incluindo os preenchidos à mão para
    // torneios que o site nunca publica (ex: CFJ U12 Garçons 2026). Um id só
    // muda quando a descoberta traz OUTRO id, nunca para nada.
    for (const f of ["gg_page", "gg_league", "gg_iframe"]) {
      if (!t[f] && prev[f]) {
        next[f] = prev[f];
        if (f === "gg_page") nKept++;
      }
    }
    merged.set(k, next);
  }
  const tournaments = [...merged.values()].sort((a, b) =>
    (b.year - a.year) || String(a.section).localeCompare(b.section) || String(a.slug).localeCompare(b.slug));
  const years = [...new Set([...(existing.years || []), ...args.years])].sort();

  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        years,
        total: tournaments.length,
        with_gg: tournaments.filter((c) => c.gg_page).length,
        tournaments,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`\n✅ ${catalog.length} descobertos (${nNew} novos, ${nUpd} actualizados) → catálogo com ${tournaments.length} torneios em ${outPath}`);
  console.log(`   ${tournaments.filter((c) => c.gg_page).length} com GolfGenius ID`);
  if (nKept) console.log(`   🔒 ${nKept} gg_page preservados (descoberta veio vazia — id antigo mantido)`);

  // ── Aviso: torneios dos anos pedidos que continuam sem GolfGenius ID ─────
  // O scrape-ffgolf.js filtra `t.gg_page` e salta estes EM SILÊNCIO. Sem este
  // bloco, um torneio que o ffgolf.org nunca publica (slug renomeado pelo
  // patrocinador, /page-scores-tournoi inexistente) desaparece do site sem
  // ninguém dar por isso — foi o caso do CFJ U12 Garçons 2026, que só foi
  // notado por alguém encontrar o link do GolfGenius à mão.
  const mudos = tournaments
    .filter((t) => args.years.includes(t.year) && !t.gg_page)
    .sort((a, b) => String(a.slug).localeCompare(b.slug));
  if (mudos.length) {
    console.log(`\n⚠️  ${mudos.length} torneio(s) SEM gg_page nos anos ${args.years.join(", ")} — serão saltados pelo scrape:`);
    for (const t of mudos) console.log(`   ✗ ${t.year} ${t.section}/${t.slug}`);
    console.log(`\n   Para resolver um destes: encontra a página GolfGenius do torneio`);
    console.log(`   (golfgenius.com/pages/{id}) e preenche o "gg_page" da entrada no`);
    console.log(`   catálogo — o merge acima já garante que não volta a ser apagado.`);
  }
})();
