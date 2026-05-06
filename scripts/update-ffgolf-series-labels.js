/**
 * scripts/update-ffgolf-series-labels.js
 *
 * Update incremental: apenas adiciona `label` legível em cada série dos JSONs
 * já existentes (BENF, U12F, etc.). NÃO re-faz scrape dos jogadores/scorecards.
 *
 * Estratégia:
 *   1. Lê todos os public/data/ffgolf-resultats/<type>-<ligue>-<trnId>.json
 *   2. Agrupa por (typeCompetition, ligue, year) para minimizar listCompetitions
 *   3. Para cada grupo, faz 1× listCompetitions para apanhar partKeys actuais
 *   4. Para cada torneio, faz POST resultats-details
 *   5. Parse HTML — encontra label antes/dentro de cada <table id="resultatsSerie<N>">
 *      Padrão típico: "Résultat Brut, BENF, Simple Score maximum"
 *   6. Atualiza JSON só com `details.series[i].label = "BENF"` (preserva o resto)
 *
 * USO:
 *   node scripts/update-ffgolf-series-labels.js                   # tudo
 *   node scripts/update-ffgolf-series-labels.js --year 2026       # só 2026
 *   node scripts/update-ffgolf-series-labels.js --skip-existing   # só JSONs sem label
 *   node scripts/update-ffgolf-series-labels.js --max 50          # limita 50 torneios
 */

const fs = require("fs");
const path = require("path");
const main = require("./scrape-ffgolf-resultats.js");

const ROOT = path.resolve(__dirname, "../public/data/ffgolf-resultats");
const args = process.argv.slice(2);
const getArg = (n, d = null) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };
const yearFilter = getArg("year", null);
const maxArg = parseInt(getArg("max", "0"), 10) || Infinity;
const skipExisting = args.includes("--skip-existing");

console.log(`🏷  Update FFG series labels`);
console.log(`   Year filter: ${yearFilter || "(all)"}`);
console.log(`   Max: ${maxArg === Infinity ? "∞" : maxArg}`);
console.log(`   Skip existing labels: ${skipExisting}`);

// Extrai label de uma série a partir do HTML retornado por resultats-details
function extractSeriesLabels(html) {
  const labels = {};
  // Procurar padrão: "Résultat Brut, BENF, Simple..."
  // Cada label aparece antes da tabela `resultatsSerie<N>`. Vou usar regex global e mapear ordem.
  const serieIds = [...html.matchAll(/<table[^>]*id=["']resultatsSerie(\d+)["']/gi)].map((m) => m[1]);
  // Procurar todos os labels "Résultat Brut, XXX, Simple Score maximum"
  const labelMatches = [...html.matchAll(/Résultat\s+Brut,\s*([A-Z0-9]+),\s*\w+/g)].map((m) => m[1]);
  // Outro padrão: "Résultat Net, ..."
  const netLabels = [...html.matchAll(/Résultat\s+Net,\s*([A-Z0-9]+),\s*\w+/g)].map((m) => m[1]);
  // Os labels aparecem na mesma ordem das séries
  const all = labelMatches.length === serieIds.length ? labelMatches
    : netLabels.length === serieIds.length ? netLabels
    : labelMatches.length > 0 ? labelMatches
    : [];
  for (let i = 0; i < serieIds.length && i < all.length; i++) {
    labels[serieIds[i]] = all[i];
  }
  return labels;
}

(async () => {
  if (!main || !main.bootstrap) {
    console.error("❌ scrape-ffgolf-resultats.js não exportou as funções esperadas.");
    process.exit(1);
  }

  // Listar JSONs existentes
  const files = fs.readdirSync(ROOT).filter((f) => /^\d{2}-\d{2}-\d+\.json$/.test(f));
  console.log(`   ${files.length} ficheiros encontrados`);

  // Agrupar por (type, ligue, year)
  const groups = new Map();
  for (const file of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf-8"));
      const m = file.match(/^(\d{2})-(\d{2})-(\d+)\.json$/);
      if (!m) continue;
      const [, type, ligue, trnId] = m;
      const dateMatch = (j.date || "").match(/^\d{2}\/\d{2}\/(\d{4})$/);
      const year = dateMatch ? dateMatch[1] : null;
      if (yearFilter && year !== yearFilter) continue;
      // Skip se todas séries já têm label não-null e não vazio
      if (skipExisting && j.details?.series?.every((s) => s.label && !s.label.includes("Simple Score") && !s.label.includes("Score maximum"))) {
        continue;
      }
      const key = `${type}|${ligue}|${year}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ file, type, ligue, trnId, year, partKey: j.partKey, json: j });
    } catch (e) {
      console.log(`   ⚠ ${file}: ${e.message.slice(0, 80)}`);
    }
  }

  console.log(`   ${groups.size} grupos (typeCompetition, ligue, year)`);

  const ctx = await main.bootstrap();
  let updated = 0, skipped = 0, errors = 0;
  outer: for (const [key, entries] of groups) {
    const [type, ligue, year] = key.split("|");
    if (updated >= maxArg) break;
    let partKeyMap = new Map();
    try {
      const tournaments = await main.listCompetitions(ctx, { typeCompetition: type, ligue, annee: year });
      for (const t of tournaments) if (t.trnId && t.partKey) partKeyMap.set(t.trnId, t.partKey);
    } catch (e) {
      console.log(`⚠ list ${key}: ${e.message.slice(0, 80)}`);
    }

    for (const e of entries) {
      if (updated >= maxArg) break outer;
      const partKey = partKeyMap.get(e.trnId) || e.partKey;
      if (!partKey) { skipped++; continue; }
      try {
        // Faz POST resultats-details para apanhar o HTML completo
        const fd = new URLSearchParams();
        fd.set("glfPartKey", partKey);
        fd.set("trnId", e.trnId);
        fd.set("typeCompetition", type);
        fd.set("ligue", ligue);
        fd.set("iframe", "1");
        const res = await main.httpRequest("POST", "https://pages.ffgolf.org/resultats/resultats-details", {
          body: fd.toString(),
          cookie: Object.entries(ctx.jar).map(([k, v]) => `${k}=${v}`).join("; "),
        });
        if (res.status !== 200) { errors++; continue; }
        const labels = extractSeriesLabels(res.body);
        let changed = false;
        for (const s of e.json.details.series) {
          if (labels[s.serieId] && s.label !== labels[s.serieId]) {
            s.label = labels[s.serieId];
            changed = true;
          }
        }
        if (changed) {
          fs.writeFileSync(path.join(ROOT, e.file), JSON.stringify(e.json, null, 2), "utf-8");
          updated++;
          if (updated % 20 === 0) console.log(`   💾 ${updated}/${files.length}: ${e.file} → ${Object.values(labels).join(",")}`);
        } else {
          skipped++;
        }
        await new Promise((r) => setTimeout(r, 300));
      } catch (e2) {
        console.log(`   ❌ ${e.file}: ${e2.message.slice(0, 80)}`);
        errors++;
      }
    }
  }

  console.log(`\n✅ Updated: ${updated} · Skipped: ${skipped} · Errors: ${errors}`);
})();
