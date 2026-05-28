// scrape-manuel-missing-draws.js
//
// Wrapper que pega na lista de torneios FPG que o Manuel jogou MAS para os quais
// ainda não temos draws (lê `cobertura.fpg.torneiosSemDraw` em
// `public/data/manuel-pairings.json`) e invoca
// `scripts/scrape-fpg-admissions-draws-node.js --tcodes ccode:tcode,...`
// para tentar descarregar os draws em falta.
//
// Esperar resultado misto:
//   - Torneios Nacionais "000" → quase sempre publicam admissions+draws
//   - Torneios de clubes (007, 982, 003, etc.) → muitos não publicam draws.
//     O scraper marca como `_suspect` ou simplesmente não devolve groups.
//   - 54 torneios processados em ~4-8 min (concurrency 2).
//
// Uso:
//   node scripts/scrape-manuel-missing-draws.js               # tudo
//   node scripts/scrape-manuel-missing-draws.js --dry-run     # só lista os tcodes
//   node scripts/scrape-manuel-missing-draws.js --limit 10    # só primeiros 10
//   node scripts/scrape-manuel-missing-draws.js --concurrency 2
//
// Depois do scrape termina, re-corre `build-pairings-v2.js` para regenerar
// `manuel-pairings.json` com os novos draws.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PAIRINGS = path.join(ROOT, "public", "data", "manuel-pairings.json");
const SCRAPER = path.join(__dirname, "scrape-fpg-admissions-draws-node.js");
const BUILDER = path.join(__dirname, "pairings-build.js");

const args = process.argv.slice(2);
function argVal(flag, def) {
  const i = args.indexOf(flag);
  if (i === -1) return def;
  return args[i + 1] ?? def;
}
const DRY_RUN = args.includes("--dry-run");
const LIMIT = parseInt(argVal("--limit", "0"), 10);
const CONCURRENCY = argVal("--concurrency", "2");
const SKIP_REBUILD = args.includes("--skip-rebuild");

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function main() {
  if (!fs.existsSync(PAIRINGS)) {
    console.error(`[scrape-manuel-missing] não encontrei ${PAIRINGS}. Corre antes: node scripts/build-pairings-v2.js`);
    process.exit(1);
  }
  const data = readJSON(PAIRINGS);
  const sem = (data.cobertura && data.cobertura.fpg && data.cobertura.fpg.torneiosSemDraw) || [];
  if (sem.length === 0) {
    console.log("[scrape-manuel-missing] não há torneios sem draw — tudo coberto.");
    return;
  }

  // Converter "ccode-tcode" → "ccode:tcode" (formato esperado pelo scraper)
  let specs = sem.map(s => s.replace("-", ":"));
  if (LIMIT > 0) specs = specs.slice(0, LIMIT);

  // Distribuição por ccode (info para o user)
  const porCcode = new Map();
  for (const s of specs) {
    const cc = s.split(":")[0];
    porCcode.set(cc, (porCcode.get(cc) || 0) + 1);
  }
  console.log(`[scrape-manuel-missing] ${specs.length} torneios em falta:`);
  for (const [cc, n] of [...porCcode.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ccode ${cc}: ${n} torneios`);
  }

  if (DRY_RUN) {
    console.log("\n[dry-run] tcodes que seriam scrapados:");
    for (const s of specs) console.log(`  ${s}`);
    return;
  }

  // Construir a flag --tcodes
  const tcodesArg = specs.join(",");
  console.log(`\n[scrape-manuel-missing] a invocar scraper com ${specs.length} tcodes (concurrency=${CONCURRENCY})…`);
  console.log(`(Isto pode demorar 4-8 min. Cada torneio sem draw publicado vai falhar silenciosamente — é normal.)\n`);

  const child = spawn(
    process.execPath,
    [SCRAPER, "--tcodes", tcodesArg, "--concurrency", String(CONCURRENCY)],
    { stdio: "inherit" }
  );
  child.on("exit", (code) => {
    if (code !== 0 && code !== 2) {
      console.error(`[scrape-manuel-missing] scraper saiu com código ${code}`);
      process.exit(code);
    }
    console.log(`\n[scrape-manuel-missing] scraper terminou (código ${code}).`);
    if (SKIP_REBUILD) {
      console.log("[scrape-manuel-missing] --skip-rebuild: NÃO vou re-gerar manuel-pairings.json. Corre manualmente:");
      console.log("  node scripts/build-pairings-v2.js");
      return;
    }
    console.log("[scrape-manuel-missing] a re-gerar manuel-pairings.json…\n");
    const child2 = spawn(process.execPath, [BUILDER], { stdio: "inherit" });
    child2.on("exit", (c2) => {
      if (c2 !== 0) {
        console.error(`[scrape-manuel-missing] builder saiu com código ${c2}`);
        process.exit(c2);
      }
      console.log("\n[scrape-manuel-missing] pronto. Recarrega a página /draws no browser.");
    });
  });
}

main();
