/**
 * scripts/backfill-nextcaddy-dates.js
 *
 * Preenche meta.dateStart / meta.dateEnd / meta.dateText nos ficheiros já
 * gravados em public/data/nextcaddy/*.json. A data nunca era extraída pelo
 * scraper antigo (parseTourMeta deixava dateStart/dateEnd a null), pelo que
 * 2000+ torneios ficaram sem data — incluindo na página /rfeg/nextcaddy/{id}.
 *
 * Fontes de data, por ordem de fiabilidade:
 *   1. Discovery scope (scripts/nextcaddy-scope-all.json) — campo `date` por
 *      tourId, formato "DD mmm YYYY" (ex: "21 jun 2026"). É a fonte autoritativa
 *      e cobre praticamente todos os torneios.
 *   2. Nome do torneio — muitos trazem a data por extenso ("... Domingo 21
 *      Junio 2026"). Fallback quando o scope não tem o tourId.
 *
 * Idempotente: por omissão só preenche ficheiros SEM dateStart. Com --force
 * recalcula todos (útil se a fonte melhorar).
 *
 * USO:
 *   node scripts/backfill-nextcaddy-dates.js            # preenche em falta
 *   node scripts/backfill-nextcaddy-dates.js --force    # recalcula todos
 *   node scripts/backfill-nextcaddy-dates.js --dry-run  # só relata, não grava
 */

const fs = require("fs");
const path = require("path");
const { parseSpanishDate } = require("./scrape-nextcaddy.js");

let writeJsonAtomic;
try {
  ({ writeJsonAtomic } = require("./lib/atomic-write.js"));
} catch {
  writeJsonAtomic = (fp, data) => fs.writeFileSync(fp, JSON.stringify(data, null, 2));
}

const OUT_DIR = path.resolve(__dirname, "../public/data/nextcaddy");

/* Carrega o campo `date` de TODOS os ficheiros de scope/discovery em scripts/
 * (nextcaddy-scope-*.json + nextcaddy-juvenil*.json). Cada discovery cobre um
 * comité/clube/ano diferente, por isso maximizamos a cobertura unindo todos.
 * O scope-all (mais recente/abrangente) tem prioridade — carregado primeiro. */
function loadScopeDates() {
  const byId = new Map();
  const all = fs.readdirSync(__dirname)
    .filter((f) => /^nextcaddy-(scope|juvenil).*\.json$/.test(f));
  // Prioridade: scope-all primeiro, depois os restantes
  all.sort((a, b) => (b.includes("scope-all") ? 1 : 0) - (a.includes("scope-all") ? 1 : 0));
  for (const f of all) {
    let sc;
    try { sc = JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8")); } catch { continue; }
    const tours = sc.tours || sc.tournaments || sc;
    if (!Array.isArray(tours)) continue;
    for (const t of tours) {
      const id = t && (t.tourId || t.id);
      if (id && t.date && !byId.has(id)) byId.set(id, t.date);
    }
  }
  return byId;
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");

  const scopeDates = loadScopeDates();
  console.log(`Datas no discovery scope: ${scopeDates.size}`);

  const files = fs.readdirSync(OUT_DIR).filter((f) => /^\d+\.json$/.test(f));
  let filled = 0, already = 0, unresolved = 0, fromScope = 0, fromName = 0;
  const misses = [];

  for (const f of files) {
    const fp = path.join(OUT_DIR, f);
    let d;
    try { d = JSON.parse(fs.readFileSync(fp, "utf8")); } catch { continue; }
    if (!d.meta) d.meta = {};
    if (d.meta.dateStart && !force) { already++; continue; }

    const tourId = d.tourId || parseInt(f, 10);
    const scopeDate = scopeDates.get(tourId);
    let parsed = scopeDate ? parseSpanishDate(scopeDate) : null;
    let origin = "scope";
    if (!parsed) { parsed = parseSpanishDate(d.meta.name); origin = "name"; }

    if (!parsed) {
      unresolved++;
      if (misses.length < 30) misses.push(`${tourId}: ${(d.meta.name || "?").slice(0, 60)}`);
      continue;
    }

    d.meta.dateStart = parsed.start;
    d.meta.dateEnd = parsed.end;
    d.meta.dateText = parsed.text;
    if (origin === "scope") fromScope++; else fromName++;
    filled++;
    if (!dryRun) writeJsonAtomic(fp, d);
  }

  console.log(`\nFicheiros: ${files.length}`);
  console.log(`  preenchidos: ${filled} (scope=${fromScope}, nome=${fromName})`);
  console.log(`  já tinham data: ${already}`);
  console.log(`  sem data resolúvel: ${unresolved}`);
  if (misses.length) {
    console.log(`\nSem data (amostra):`);
    for (const m of misses) console.log(`  ${m}`);
  }
  if (dryRun) console.log(`\n[dry-run] nada gravado.`);
}

if (require.main === module) main();

module.exports = { loadScopeDates };
