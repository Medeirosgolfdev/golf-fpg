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
            ffgolf_url: `${FFGOLF_BASE}/${section}/${year}/${slug}`,
            gg_page: null,
            gg_league: null,
          });
        }
      }
    }
  }

  await browser.close();

  const outPath = path.resolve(__dirname, "../public/data/ffgolf-catalog.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        years: args.years,
        total: catalog.length,
        with_gg: catalog.filter((c) => c.gg_page).length,
        tournaments: catalog,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`\n✅ ${catalog.length} torneios → ${outPath}`);
  console.log(`   ${catalog.filter((c) => c.gg_page).length} com GolfGenius ID`);
})();
