/**
 * scripts/scrape-ffgolf-all-jeunes.js
 *
 * Orquestrador: scrape TUDO O QUE É JUVENIL no portal pages.ffgolf.org/resultats/
 * — todas as ligas (22) × todos os anos (2015-presente) × tipos relevantes para
 * youth golf:
 *
 *   - Type 03: Grands Prix Jeunes (todas as ligas)
 *   - Type 01: Compétitions fédérales (com filtro de nome para juvenis)
 *
 * Reusa as funções HTTP/parsing do scrape-ffgolf-resultats.js para evitar
 * duplicação. Salva em public/data/ffgolf-resultats/ com nome
 * <type>-<ligue>-<trnId>.json (já compatível com build-ffgolf-resultats-index.js).
 *
 * USO:
 *   node scripts/scrape-ffgolf-all-jeunes.js                         # tudo desde 2023
 *   node scripts/scrape-ffgolf-all-jeunes.js --since 2020            # desde 2020
 *   node scripts/scrape-ffgolf-all-jeunes.js --ligues 01,02,09       # só algumas ligas
 *   node scripts/scrape-ffgolf-all-jeunes.js --types 03              # só GP Jeunes
 *   node scripts/scrape-ffgolf-all-jeunes.js --types 01,03           # GP Jeunes + Fédérales
 *   node scripts/scrape-ffgolf-all-jeunes.js --max 10                # limita 10 torneios
 *   node scripts/scrape-ffgolf-all-jeunes.js --skip-existing         # não re-fetch
 *
 * Pausa de 500ms entre requests para não martelar o servidor.
 *
 * O scraper já existente é REUSADO via require — assim não duplicamos código.
 * Se preferes correr 1 ligua/ano isolado, usa o scrape-ffgolf-resultats.js directo.
 */

const fs = require("fs");
const path = require("path");

// Reusar funções do scraper principal (que agora exporta as funções via module.exports)
const main = require("./scrape-ffgolf-resultats.js");

const OUT_DIR = path.resolve(__dirname, "../public/data/ffgolf-resultats");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Configuração ──────────────────────────────────────────────
const ALL_LIGUES = ["01","02","03","04","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22"];
const TYPE_GP_JEUNES = "03";
const TYPE_FEDERAL = "01";

// Keywords para filtrar competições federales que são para juvenis.
// Filtra muito mais restritamente para evitar apanhar Mid-Amateurs, Seniors, Coupe Ganay, etc.
const JUVENIL_INCLUDE = [
  /\bu(8|10|12|14|16|18)\b/i,
  /\bjeunes?\b/i,
  /\bjuniors?\b/i,
  /\bbenjamins?\b/i,
  /\bbenjamines?\b/i,
  /\bminimes?\b/i,
  /\bcadets?\b/i,
  /\bcadettes?\b/i,
  /école de golf/i,
  /ecole de golf/i,
  /poucets/i,
];
// Excluir mesmo que tenha keyword jeune — filtra adultos misturados
const JUVENIL_EXCLUDE = [
  /seniors?/i,
  /mid[- ]?am(ateurs?)?/i,
  /messieurs/i,
  /dames/i,
  /coupe ganay/i,
  /trophée esmond/i,
  /trophée carlhian/i,
  /espoir/i,  // "Championnat Departemental Espoir" não é só juvenil
];

function isJuvenil(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  // Tem que ter keyword juvenil...
  if (!JUVENIL_INCLUDE.some((re) => re.test(lower))) return false;
  // ...e NÃO ter keyword adulta
  if (JUVENIL_EXCLUDE.some((re) => re.test(lower))) return false;
  return true;
}

// ── Args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name, def = null) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : def; };
const since = parseInt(getArg("since", "2023"), 10);
const liguesArg = getArg("ligues", null);
const typesArg = getArg("types", "03");
const maxArg = parseInt(getArg("max", "0"), 10) || Infinity;
const skipExisting = args.includes("--skip-existing");

// Normalizar para 2 dígitos com leading zero — endpoints FFG esperam "01", "03", etc.
const ligues = liguesArg
  ? liguesArg.split(",").map((s) => s.trim().padStart(2, "0"))
  : ALL_LIGUES;
const types = typesArg.split(",").map((s) => s.trim().padStart(2, "0"));
const currentYear = new Date().getFullYear();
const years = [];
for (let y = currentYear; y >= since; y--) years.push(String(y));

console.log(`🇫🇷 Scrape FFG All Jeunes`);
console.log(`   Ligas: ${ligues.length} (${ligues.join(",")})`);
console.log(`   Anos: ${years.join(", ")}`);
console.log(`   Tipos: ${types.join(", ")}`);
console.log(`   Skip existing: ${skipExisting}`);
console.log(`   Max: ${maxArg === Infinity ? "∞" : maxArg}`);

// ── Loop principal ───────────────────────────────────────────
(async () => {
  if (!main || !main.bootstrap) {
    console.error("❌ scrape-ffgolf-resultats.js não exportou as funções esperadas.");
    console.error("   Verifica que o módulo tem `module.exports = { bootstrap, listCompetitions, ... }`.");
    process.exit(1);
  }

  const ctx = await main.bootstrap();
  const summary = {
    scrapedAt: new Date().toISOString(),
    years, ligues, types,
    totalListed: 0,
    totalSaved: 0,
    totalSkipped: 0,
    totalErrors: 0,
    tournaments: [],
  };

  // Tipos NACIONAIS — endpoint ignora ligue, basta correr 1 vez (com ligue=00 ou qualquer)
  // Tipos REGIONAIS (03 GP Jeunes, 08 Compétitions Ligue) — iterar todas as 22 ligas
  const NATIONAL_TYPES = new Set(["01", "02", "04", "05"]); // CF, GP, Trophées Seniors, Classics Mid-Am
  // 03 = GP Jeunes (regional), 06=Entreprise, 07=par Golf, 08=Ligue (regional)

  // Set de combinações (typeCompetition, annee) já visitadas para tipos nacionais
  // — evita re-listar 22 vezes o mesmo
  const visitedNational = new Set();

  let savedCount = 0;
  outer: for (const annee of years) {
    for (const typeCompetition of types) {
      const liguesForType = NATIONAL_TYPES.has(typeCompetition) ? ["00"] : ligues;
      for (const ligue of liguesForType) {
        if (savedCount >= maxArg) break outer;
        const visitKey = `${typeCompetition}|${ligue}|${annee}`;
        if (NATIONAL_TYPES.has(typeCompetition)) {
          if (visitedNational.has(`${typeCompetition}|${annee}`)) continue;
          visitedNational.add(`${typeCompetition}|${annee}`);
        }
        try {
          const tournaments = await main.listCompetitions(ctx, { typeCompetition, ligue, annee });
          summary.totalListed += tournaments.length;
          const tag = `t=${typeCompetition} l=${ligue} y=${annee}`;
          console.log(`📋 ${tag} → ${tournaments.length} torneios`);

          for (const t of tournaments) {
            if (savedCount >= maxArg) break;
            if (!t.trnId || !t.partKey) {
              summary.totalSkipped++;
              continue;
            }
            // Filtro de juvenil para tipo 01 (Compétitions Fédérales)
            if (typeCompetition === TYPE_FEDERAL && !isJuvenil(t.name)) {
              summary.totalSkipped++;
              continue;
            }
            const outPath = path.join(OUT_DIR, `${typeCompetition}-${ligue}-${t.trnId}.json`);
            if (skipExisting && fs.existsSync(outPath)) {
              summary.totalSkipped++;
              continue;
            }
            try {
              const details = await main.getTournamentDetails(ctx, { trnId: t.trnId, partKey: t.partKey, typeCompetition, ligue });
              const enriched = main.enrichWithLinks ? main.enrichWithLinks({ ...t, details, typeCompetition, ligue }) : { ...t, details };
              fs.writeFileSync(outPath, JSON.stringify(enriched, null, 2), "utf-8");
              const totalPlayers = details.series.reduce((s, x) => s + x.players.length, 0);
              const trnDate = t.date || "—";
              console.log(`   💾 [${tag}] ${trnDate} ${t.name.slice(0, 45)}: ${details.series.length}s/${totalPlayers}j`);
              summary.tournaments.push({ ...t, typeCompetition, ligue, totalPlayers, file: path.basename(outPath) });
              summary.totalSaved++;
              savedCount++;
              await new Promise((r) => setTimeout(r, 500));
            } catch (e) {
              console.log(`   ❌ [${tag}] ${t.name}: ${e.message.slice(0, 80)}`);
              summary.totalErrors++;
            }
          }
        } catch (e) {
          console.log(`   ⚠ list ${visitKey}: ${e.message.slice(0, 80)}`);
          summary.totalErrors++;
        }
      }
    }
  }

  const summaryPath = path.join(OUT_DIR, `_index-all-jeunes.json`);
  console.log(`\n✅ Listed: ${summary.totalListed} · Saved: ${summary.totalSaved} · Skipped: ${summary.totalSkipped} · Errors: ${summary.totalErrors}`);
  console.log(`   Index: ${summaryPath}`);
})();
