/**
 * scrape-faldo.js — Faldo Series (GolfGenius) → JobFiles + catálogo p/ /faldo.
 *
 * Node-puro. Reusa o motor GolfGenius (discoverDivisions + scrapeEdition) —
 * mesmo formato JobFile que o /major consome via jobDivisionToTournament.
 *
 * Lê scripts/faldo-scope.json (tours + eventos enumerados via browser) e, por
 * cada evento (página "Results" GolfGenius), descobre as divisões (escalões) e
 * scrapa o leaderboard (+ scorecards se não --skip-scorecards). Escreve:
 *   public/data/faldo/{tour}_{id}.json   — JobFile por etapa
 *   public/data/faldo-catalog.json        — índice p/ a FaldoPage (CircuitShell)
 *
 * USO:
 *   node scripts/scrape-faldo.js                       # tudo (com scorecards)
 *   node scripts/scrape-faldo.js --skip-scorecards     # rápido, só leaderboard
 *   node scripts/scrape-faldo.js --tier futures        # só um nível
 *   node scripts/scrape-faldo.js --tour futures        # só um circuito
 *   node scripts/scrape-faldo.js --only 12580933112004906713   # 1 evento
 *   node scripts/scrape-faldo.js --limit 3 --skip-scorecards   # smoke test
 *   node scripts/scrape-faldo.js --year 2026           # ano por defeito
 */

const fs = require("fs");
const path = require("path");
const { discoverDivisions } = require("./scrape-golfgenius-node.js");
const { scrapeEdition, GG } = require("./scrape-fsga.js");
const { writeJsonAtomic } = require("./lib/atomic-write.js");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "data", "faldo");
const CATALOG = path.join(ROOT, "public", "data", "faldo-catalog.json");
const SCOPE = path.join(__dirname, "faldo-scope.json");

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const has = (n) => process.argv.includes(n);

function isManuelName(name) {
  const s = (name || "").toLowerCase();
  return s.includes("manuel") && s.includes("medeiros");
}

async function main() {
  const skipScorecards = has("--skip-scorecards");
  const tierFilter = arg("--tier");
  const tourFilter = arg("--tour");
  const only = arg("--only");
  const limit = arg("--limit") ? parseInt(arg("--limit"), 10) : Infinity;
  const yearDefault = arg("--year") ? parseInt(arg("--year"), 10) : 2026;

  const scope = JSON.parse(fs.readFileSync(SCOPE, "utf8"));
  const tours = scope.tours || {};
  let events = (scope.events || []).filter((e) => {
    if (only) return e.id === only;
    if (tourFilter) return e.tour === tourFilter;
    if (tierFilter) return (tours[e.tour] || {}).tier === tierFilter;
    return true;
  });
  events = events.slice(0, limit);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Catálogo existente (merge aditivo — não perder etapas de tours ainda não corridos).
  let catalog = [];
  try { catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8")).events || []; } catch { /* novo */ }
  const byId = new Map(catalog.map((c) => [c.id, c]));

  console.log(`🏌️  Faldo Series · ${events.length} evento(s)${skipScorecards ? " · leaderboard-only" : " · com scorecards"}\n`);
  let ok = 0, fail = 0;

  for (const ev of events) {
    const meta = tours[ev.tour] || {};
    const pageUrl = `${GG}/pages/${ev.id}`;
    try {
      const disc = await discoverDivisions(pageUrl);
      if (!disc.divisions || !disc.divisions.length) throw new Error("sem divisões");
      const out = await scrapeEdition(
        { name: disc.title, year: yearDefault, divisions: disc.divisions },
        { skipScorecards }
      );
      out.source = pageUrl;
      out.tour = ev.tour;
      out.tier = meta.tier;
      out.region = meta.region;

      const file = path.join(OUT_DIR, `${ev.tour}_${ev.id}.json`);
      writeJsonAtomic(file, out);

      const allPlayers = out.divisions.flatMap((d) => d.players || []);
      const nSc = allPlayers.filter((p) => (p.rounds || []).some((r) => (r.scores || []).length)).length;
      byId.set(ev.id, {
        id: ev.id,
        tour: ev.tour,
        tier: meta.tier,
        tierLabel: meta.tierLabel,
        region: meta.region,
        file: `faldo/${ev.tour}_${ev.id}.json`,
        name: (out.tournament || "").replace(/&amp;/g, "&").trim(),
        course: out.course || null,
        year: out.year || yearDefault,
        divisionCount: out.divisions.length,
        playerCount: allPlayers.length,
        hasScorecards: nSc > 0,
        hasResults: allPlayers.some((p) => p.total != null || (p.rounds || []).length),
        hasManuel: allPlayers.some((p) => isManuelName(p.name)),
      });
      ok++;
      console.log(`   ✅ [${meta.tierLabel}·${meta.region}] ${(out.tournament || "").slice(0, 48).padEnd(48)} ${out.divisions.length}div ${allPlayers.length}j${nSc ? ` (${nSc}sc)` : ""}`);
    } catch (e) {
      fail++;
      console.log(`   ❌ ${ev.id}: ${e.message}`);
    }
  }

  const merged = [...byId.values()].sort((a, b) => (b.year - a.year) || a.tour.localeCompare(b.tour));
  writeJsonAtomic(CATALOG, { generatedAt: new Date().toISOString(), events: merged });
  console.log(`\n🏁 ${ok} ok · ${fail} falha(s) · catálogo: ${merged.length} etapas → ${path.relative(ROOT, CATALOG)}`);
  if (fail && !ok) process.exit(1);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
