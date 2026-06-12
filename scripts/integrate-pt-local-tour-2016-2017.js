'use strict';
// ⚠️ ESTE SCRIPT É NODE.JS — corre no terminal/PowerShell, NÃO no browser!
//    No browser dá: "require is not defined".
//    No browser usa scripts/browser-scrape-pt-local-tour-2016-2017.js

/**
 * integrate-pt-local-tour-2016-2017.js
 *
 * Integra os 11 torneios USKids Local Tour PT 2016+2017 no ecosistema:
 *   1) Cria `public/data/uskids_torneios_completos(30..40).json`
 *   2) Actualiza TORNEIOS_COMPLETOS_COUNT 29 → 40
 *
 * Uso:
 *   node scripts/integrate-pt-local-tour-2016-2017.js          (dry-run)
 *   node scripts/integrate-pt-local-tour-2016-2017.js --apply  (escreve)
 */

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'data-archive', 'pt-local-tour-2016-2017.json');
const OUTDIR = path.join(ROOT, 'public', 'data');
const USKIDS_PAGE = path.join(ROOT, 'src', 'pages', 'USKIDSPage.tsx');
const LOADER = path.join(ROOT, 'src', 'data', 'KIDSdataLoader.ts');

// Ordem cronológica
const TCODE_ORDER = [
  '3120', '3121', '3123', '3124', '3125',          // 2016
  '4168', '4169', '4173', '4170', '4171', '4172',  // 2017 (cronológico: Jul, Jul, Ago, Set, Set, Set)
];
const START_INDEX = 30;       // próximo livre depois do (29) El Prat
const NEW_COUNT = 40;         // 29 → 40 (29 + 11 novos = 40)

if (!fs.existsSync(SOURCE)) {
  console.error(`ERRO: ${SOURCE} não existe.`);
  console.error('Corre primeiro o browser-scrape-pt-local-tour-2016-2017.js.');
  process.exit(1);
}

const all = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
console.log(`▶ Carregado ${SOURCE} com ${Object.keys(all).length} tcodes`);

const writes = [];
TCODE_ORDER.forEach((tc, i) => {
  const fileNum = START_INDEX + i;
  const fileName = `uskids_torneios_completos(${fileNum}).json`;
  const filePath = path.join(OUTDIR, fileName);
  const data = all[tc];
  if (!data) {
    console.error(`  ⚠️ tcode ${tc} não está no ficheiro source — saltado.`);
    return;
  }
  writes.push({ filePath, fileName, tc, data });
  const nPlayers = Object.values(data.flights || {}).reduce((s, f) => s + Object.keys(f.flight_players || {}).length, 0);
  console.log(`  ${fileName}: tcode=${tc} ${data.name} ${data.start_date} flights=${Object.keys(data.flights).length} jogadores=${nPlayers}`);
});

// Smart bump: nunca BAIXAR o contador — usa o máximo entre NEW_COUNT e o número
// real de ficheiros existentes (evita regredir).
const glob = require('glob');
const existing = glob.sync(path.join(OUTDIR, 'uskids_torneios_completos(*).json'))
  .map(f => parseInt((f.match(/\((\d+)\)/) || [, '0'])[1]))
  .filter(n => n > 0);
const maxExisting = existing.length ? Math.max(...existing) : 0;
const finalCount = Math.max(maxExisting, NEW_COUNT);
console.log(`\n▶ Ficheiros existentes: ${existing.length}, max index: ${maxExisting}, contador final: ${finalCount}`);

// Patch TORNEIOS_COMPLETOS_COUNT
const usPage = fs.readFileSync(USKIDS_PAGE, 'utf8');
const usPagePatched = usPage.replace(/const\s+TORNEIOS_COMPLETOS_COUNT\s*=\s*\d+\s*;/, `const TORNEIOS_COMPLETOS_COUNT = ${finalCount};`);
const loader = fs.readFileSync(LOADER, 'utf8');
const loaderPatched = loader.replace(
  /(\.\.\.Array\.from\(\{\s*length:\s*)\d+(\s*\},\s*\(_,\s*i\)\s*=>\s*\(\{\s*kind:\s*"completo")/,
  `$1${finalCount}$2`
);
console.log(`▶ USKIDSPage.tsx: ${usPage !== usPagePatched ? `TORNEIOS_COMPLETOS_COUNT → ${finalCount}` : 'sem mudanças'}`);
console.log(`▶ KIDSdataLoader.ts: ${loader !== loaderPatched ? `length → ${finalCount}` : 'sem mudanças'}`);

if (!APPLY) {
  console.log(`\nDRY-RUN — para aplicar: node scripts/integrate-pt-local-tour-2016-2017.js --apply`);
  process.exit(0);
}

for (const w of writes) {
  fs.writeFileSync(w.filePath, JSON.stringify(w.data, null, 2));
  console.log(`  ✓ ${w.fileName}`);
}
if (usPage !== usPagePatched) fs.writeFileSync(USKIDS_PAGE, usPagePatched);
if (loader !== loaderPatched) fs.writeFileSync(LOADER, loaderPatched);
console.log(`\n✓ Pronto. Corre \`npm test && npm run build\` antes de commit.`);
