'use strict';

/**
 * split-pt-local-tour-completos.js
 *
 * Pega no ficheiro consolidado descarregado pelo browser-scrape
 * (`pt-local-tour-completos.json` em data-archive) e:
 *
 *   1. Divide-o em 6 ficheiros separados:
 *        public/data/uskids_torneios_completos(23).json  → tcode 13702
 *        public/data/uskids_torneios_completos(24).json  → tcode 13703
 *        public/data/uskids_torneios_completos(25).json  → tcode 13704
 *        public/data/uskids_torneios_completos(26).json  → tcode 13705
 *        public/data/uskids_torneios_completos(27).json  → tcode 13706
 *        public/data/uskids_torneios_completos(28).json  → tcode 13707
 *
 *   2. Actualiza TORNEIOS_COMPLETOS_COUNT de 22 para 28 em:
 *        src/pages/USKIDSPage.tsx
 *        src/data/KIDSdataLoader.ts
 *
 * Uso:
 *   node scripts/split-pt-local-tour-completos.js          (dry-run)
 *   node scripts/split-pt-local-tour-completos.js --apply  (escreve)
 */

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'public', 'data-archive', 'pt-local-tour-completos.json');
const OUTDIR = path.join(ROOT, 'public', 'data');
const USKIDS_PAGE = path.join(ROOT, 'src', 'pages', 'USKIDSPage.tsx');
const LOADER = path.join(ROOT, 'src', 'data', 'KIDSdataLoader.ts');

const TCODE_ORDER = ['13702', '13703', '13704', '13705', '13706', '13707'];
const START_INDEX = 23; // primeiro número de ficheiro
const NEW_COUNT = 28;

if (!fs.existsSync(SOURCE)) {
  console.error(`ERRO: ${SOURCE} não existe.`);
  console.error('Antes, corre o browser-scrape-pt-local-tour-completos.js na consola F12 do signupanytime e move o ficheiro descarregado para public/data-archive/');
  process.exit(1);
}

const all = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
console.log(`▶ Carregado ${SOURCE} com ${Object.keys(all).length} tcodes`);

// 1) Split em 6 ficheiros
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
  console.log(`  ${fileName}: tcode=${tc} ${data.name} ${data.start_date} flights=${Object.keys(data.flights).length}`);
});

// Smart bump: nunca BAIXAR o contador — usa o máximo entre NEW_COUNT e o número
// real de ficheiros existentes (evita regredir e esconder ficheiros doutros pipelines).
const glob = require('glob');
const existing = glob.sync(path.join(OUTDIR, 'uskids_torneios_completos(*).json'))
  .map(f => parseInt((f.match(/\((\d+)\)/) || [, '0'])[1]))
  .filter(n => n > 0);
const maxExisting = existing.length ? Math.max(...existing) : 0;
const finalCount = Math.max(maxExisting, NEW_COUNT);
console.log(`\n▶ Ficheiros existentes: ${existing.length}, max index: ${maxExisting}, contador final: ${finalCount}`);

// 2) Patch USKIDSPage.tsx
const usPageContent = fs.readFileSync(USKIDS_PAGE, 'utf8');
const usPagePatched = usPageContent.replace(
  /const\s+TORNEIOS_COMPLETOS_COUNT\s*=\s*\d+\s*;/,
  `const TORNEIOS_COMPLETOS_COUNT = ${finalCount};`
);
const usPageChanged = usPageContent !== usPagePatched;
console.log(`▶ USKIDSPage.tsx: ${usPageChanged ? `TORNEIOS_COMPLETOS_COUNT → ${finalCount}` : 'sem mudanças'}`);

// 3) Patch KIDSdataLoader.ts
const loaderContent = fs.readFileSync(LOADER, 'utf8');
const loaderPatched = loaderContent.replace(
  /(\.\.\.Array\.from\(\{\s*length:\s*)\d+(\s*\},\s*\(_,\s*i\)\s*=>\s*\(\{\s*kind:\s*"completo")/,
  `$1${finalCount}$2`
);
const loaderChanged = loaderContent !== loaderPatched;
console.log(`▶ KIDSdataLoader.ts: ${loaderChanged ? `length → ${finalCount}` : 'sem mudanças'}`);

if (!APPLY) {
  console.log(`\nDRY-RUN — para aplicar: node scripts/split-pt-local-tour-completos.js --apply`);
  process.exit(0);
}

// Escrever ficheiros
for (const w of writes) {
  fs.writeFileSync(w.filePath, JSON.stringify(w.data, null, 2));
  console.log(`  ✓ ${w.fileName}`);
}
if (usPageChanged) fs.writeFileSync(USKIDS_PAGE, usPagePatched);
if (loaderChanged) fs.writeFileSync(LOADER, loaderPatched);
console.log(`\n✓ Pronto. Corre \`npm test && npm run build\` antes de fazer commit.`);
