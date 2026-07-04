/**
 * scripts/scrape-ffgolf-gg-fetch.js
 *
 * Rota GolfGenius por `fetch` puro para os torneios FFG cujo `scrape-ffgolf.js`
 * (Playwright) devolve 0 jogadores. Causa (2026-07-04): a página `/pages/{gg_page}`
 * de alguns torneios (Internationaux U14, Grand Prix National U12…) embebe o
 * widget `next_round` em vez do leaderboard — o iframe não tem jogadores. Os
 * resultados vivem no widget `tournament_results` da league, que se busca por
 * `fetch` (o mesmo motor do scrape-golfgenius-node.js / scrape-fsga.js).
 *
 * Fluxo:
 *   1. discoverDivisions(/pages/{gg_page}, {gg_league}) → {title, lid, divisions}
 *   2. scrapeEdition() → JobFile (jogadores + rondas + par por campo, sem browser)
 *   3. converte JobFile → formato `ffgolf/{year}_{slug}.json` que a FFGPage lê
 *      (mesmo shape do scrape-ffgolf.js: course/courses/players/rounds).
 *
 * Só grava se houver jogadores (não cria ficheiros vazios). Complementa o
 * scrape-ffgolf.js: corre-se A SEGUIR, para os slugs que ele não conseguiu.
 *
 * USO:
 *   node scripts/scrape-ffgolf-gg-fetch.js                       # catálogo: só os sem ficheiro/vazios
 *   node scripts/scrape-ffgolf-gg-fetch.js --year 2026
 *   node scripts/scrape-ffgolf-gg-fetch.js --slug internationaux-de-france-u14-garcons-challenge-alexis-godillot
 *   node scripts/scrape-ffgolf-gg-fetch.js --force                # re-fetch mesmo com ficheiro já preenchido
 *   node scripts/scrape-ffgolf-gg-fetch.js --skip-scorecards      # rápido (só leaderboard)
 *
 * Exit codes: 0 = gravou algo, 2 = nada novo, 1 = erro.
 */
const fs = require("fs");
const path = require("path");
const { scrapeEdition, GG } = require("./scrape-fsga.js");
const { discoverDivisions } = require("./scrape-golfgenius-node.js");

const OUT_DIR = path.resolve(__dirname, "../public/data/ffgolf");
const CATALOG_PATH = path.resolve(__dirname, "../public/data/ffgolf-catalog.json");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const getArg = (n, d = null) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };
const yearArg = getArg("year") ? parseInt(getArg("year"), 10) : null;
const slugArg = getArg("slug");
const force = args.includes("--force");
const skipScorecards = args.includes("--skip-scorecards");

const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);
const toPos = (p) => { const n = parseInt(String(p.pos || "").replace(/^T/i, ""), 10); return isNaN(n) ? null : n; };

/** JobFile (scrapeEdition) → formato ffgolf/{year}_{slug}.json (lido pela FFGPage). */
function jobfileToFfgolf(jf, t, lid) {
  const players = [];
  const seenId = new Set();
  for (const dv of jf.divisions || []) {
    for (const p of dv.players || []) {
      if (p.detailId && seenId.has(p.detailId)) continue; // dedup entre divisões
      if (p.detailId) seenId.add(p.detailId);
      const rounds = (p.rounds || []).map((r, i) => {
        const scores = Array.isArray(r.scores) ? r.scores : [];
        return {
          round: i + 1,
          gross: r.gross,
          scores,
          f9: scores.length >= 9 ? sum(scores.slice(0, 9)) : 0,
          b9: scores.length >= 18 ? sum(scores.slice(9, 18)) : 0,
        };
      });
      players.push({
        id: p.detailId || null,
        pos: toPos(p),
        name: p.name,
        // ⚠ O v2tournaments API (e o widget/scorecard) NÃO expõem nacionalidade — só o
        // Playwright a tinha (flag-icon do DOM), mas o DOM destes torneios é o widget
        // errado (next_round). Sendo campeonatos da FFG (França), defaultamos FR;
        // preservamos qualquer país inferido ≠US (o motor cai em "US" por defeito).
        // Internacionais (incl. PT) podem ficar mal-flagados nestes torneios fetch-route.
        country: p.country && p.country !== "US" ? p.country : "FR",
        club: p.location || "",
        hcp: null,
        total: p.total ?? null,
        toPar: p.toPar ?? null,
        roundScores: p.roundGross || [],
        division: dv.division,
        rounds,
      });
    }
  }
  players.sort((a, b) => (a.total == null ? 1 : b.total == null ? -1 : a.total - b.total));

  // Campo principal = divisão com par definido + mais jogadores.
  const withPar = (jf.divisions || []).filter((d) => Array.isArray(d.par) && d.par.length === 18);
  const mainDiv = [...withPar].sort((a, b) => (b.players?.length || 0) - (a.players?.length || 0))[0] || null;
  const par = mainDiv?.par || [];
  const course = {
    name: jf.course || "", tee: mainDiv?.teeName || "",
    par, meters: [], si: [],
    parTotal: mainDiv?.parTotal || (par.length ? sum(par) : 0), metersTotal: 0,
  };
  const courses = withPar.map((d) => ({
    teeName: d.teeName || "", courseName: jf.course || "",
    par: d.par, meters: [], si: [], parTotal: d.parTotal || sum(d.par), metersTotal: 0,
  }));
  const nRounds = players.reduce((m, p) => Math.max(m, p.roundScores.length, p.rounds.length), 0);

  return {
    tournament: jf.tournament || t.title || t.slug,
    slug: t.slug, year: t.year, section: t.section || "grands-prix-jeunes",
    source: `${GG}/pages/${t.gg_page}`, gg_page: t.gg_page, gg_league: lid || t.gg_league || null,
    stats_page: null, scrapedAt: new Date().toISOString(),
    course, courses,
    rounds: nRounds,
    format: `${(jf.divisions || []).length} divisão(ões) via tournament_results (fetch)`,
    divisions: (jf.divisions || []).map((d) => d.division),
    players, events: [],
  };
}

function needsFetch(outPath) {
  if (force) return true;
  if (!fs.existsSync(outPath)) return true;
  try { return (JSON.parse(fs.readFileSync(outPath, "utf8")).players || []).length === 0; }
  catch { return true; }
}

(async () => {
  const cat = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  let list = (cat.tournaments || cat).filter((t) => t.gg_page);
  if (yearArg) list = list.filter((t) => t.year === yearArg);
  if (slugArg) list = list.filter((t) => t.slug === slugArg);

  console.log(`🇫🇷 FFG GolfGenius (fetch) — ${list.length} torneios GG no catálogo`);
  let saved = 0, skipped = 0, empty = 0, errors = 0;

  for (const t of list) {
    const outPath = path.join(OUT_DIR, `${t.year}_${t.slug}.json`);
    if (!needsFetch(outPath)) { skipped++; continue; }
    try {
      const disc = await discoverDivisions(`${GG}/pages/${t.gg_page}`, t.gg_league || undefined);
      if (!disc.divisions?.length) { console.log(`   ⚠ ${t.slug}: sem divisões`); empty++; continue; }
      // Dedup por v2tid: em torneios sem divisões reais, o <select> lista as RONDAS
      // (Qualification R1/R2/Final) e todas resolvem para o MESMO v2tid (o leaderboard
      // agregado). Sem isto, scrapávamos 3× e contávamos os jogadores 3×.
      const seenV2 = new Set();
      const divisions = disc.divisions.filter((d) => (seenV2.has(d.v2tid) ? false : seenV2.add(d.v2tid)));
      const jf = await scrapeEdition(
        { name: t.title || disc.title, year: t.year, divisions },
        { skipScorecards }
      );
      const ffg = jobfileToFfgolf(jf, t, disc.lid);
      if (!ffg.players.length) { console.log(`   ⚠ ${t.slug}: 0 jogadores mesmo por tournament_results`); empty++; continue; }
      const tmp = outPath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(ffg, null, 2), "utf8");
      fs.renameSync(tmp, outPath);
      saved++;
      console.log(`   💾 ${t.year}_${t.slug}: ${ffg.players.length} jogadores${ffg.course.par.length ? " (par OK)" : ""}`);
    } catch (e) {
      errors++;
      console.log(`   ❌ ${t.slug}: ${String(e.message).slice(0, 80)}`);
    }
  }

  console.log(`\n✅ Gravados: ${saved} · Já OK/saltados: ${skipped} · Sem jogadores: ${empty} · Erros: ${errors}`);
  process.exit(saved > 0 ? 0 : 2);
})().catch((e) => { console.error("❌", e); process.exit(1); });
