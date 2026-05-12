'use strict';

/**
 * integrate-elprat-2023.js
 *
 * Integra o scrape do El Prat 2023 (t=15573) no ecosistema:
 *   1) Cria `public/data/uskids_torneios_completos(29).json` com o JSON v2
 *   2) Cruza com cache uskids-member-history-*.json existente:
 *      - Para cada jogador descoberto, procura nome em todos os ficheiros existentes
 *      - Adiciona mids novos a `uskids-member-history-048.json`
 *   3) Actualiza TORNEIOS_COMPLETOS_COUNT 28 → 29 em USKIDSPage.tsx + KIDSdataLoader.ts
 *
 * Uso:
 *   node scripts/integrate-elprat-2023.js          (dry-run)
 *   node scripts/integrate-elprat-2023.js --apply  (escreve)
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const APPLY = process.argv.includes('--apply');
const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'public', 'data-archive', 'elprat-2023.json');
const OUTDIR_PUBLIC = path.join(ROOT, 'public', 'data');
const OUTDIR_ARCHIVE = path.join(ROOT, 'public', 'data-archive');
const USKIDS_PAGE = path.join(ROOT, 'src', 'pages', 'USKIDSPage.tsx');
const LOADER = path.join(ROOT, 'src', 'data', 'KIDSdataLoader.ts');

const NEW_COMPLETO_INDEX = 29;
const NEW_MEMBER_INDEX = 48;
// NÃO baixar o contador se já existirem mais ficheiros (PT Local Tour 2016/2017
// adicionou ficheiros 30..40). Apenas garantir que count >= 29.
const MIN_COUNT_REQUIRED = 29;

if (!fs.existsSync(SOURCE)) {
  console.error(`ERRO: ${SOURCE} não existe.`);
  console.error('Corre primeiro o browser-scrape-elprat-2023.js e move o ficheiro descarregado para data-archive/.');
  process.exit(1);
}

const elprat = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
console.log(`▶ El Prat: ${elprat.name}, ${Object.keys(elprat.flights).length} flights`);

// Listar todos os jogadores descobertos (com pid local)
const playersDescobertos = [];
for (const [fid, fl] of Object.entries(elprat.flights)) {
  for (const [pid, pl] of Object.entries(fl.flight_players || {})) {
    const r1 = pl.rounds?.[1] || {};
    playersDescobertos.push({
      pid, fid, ageGroup: fl.category,
      name: `${pl.first || ''} ${pl.last || ''}`.trim(),
      country: (pl.country || '').toUpperCase(),
      gross: r1.num_strokes ?? null,
      strokes: r1.strokes || [],
    });
  }
}
console.log(`  ${playersDescobertos.length} jogadores nos 3 escalões`);

// Cross-reference contra os 47 ficheiros member-history existentes
// para descobrir os memberID globais via match de NOME+COUNTRY
const memberFiles = glob.sync(path.join(OUTDIR_ARCHIVE, 'uskids-member-history-*.json')).sort();
const nameToMid = new Map(); // "normalized name|country" → mid
function norm(s) {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

for (const fn of memberFiles) {
  let d;
  try { d = JSON.parse(fs.readFileSync(fn, 'utf8')); } catch { continue; }
  for (const [mid, p] of Object.entries(d.jogadores || {})) {
    if (!p.name || p.name === '?') continue;
    const key = `${norm(p.name)}|${(p.country || '').toUpperCase()}`;
    if (!nameToMid.has(key)) nameToMid.set(key, { mid, name: p.name, file: path.basename(fn) });
  }
}
console.log(`  ${nameToMid.size} nomes únicos em cache`);

// Para cada jogador descoberto no El Prat, tentar match
const matches = [];
const novos = [];
for (const p of playersDescobertos) {
  const key = `${norm(p.name)}|${p.country}`;
  const hit = nameToMid.get(key);
  if (hit) matches.push({ ...p, mid: hit.mid, fonte: hit.file });
  else novos.push(p);
}

const pad = (s, n) => String(s ?? '').padEnd(n);
const padL = (s, n) => String(s ?? '').padStart(n);
console.log(`\n▶ Matches: ${matches.length}/${playersDescobertos.length}`);
for (const m of matches) {
  console.log(`  ${padL(m.mid, 8)} ${pad(m.ageGroup, 8)} ${pad(m.name, 30)} ${m.country} gross=${m.gross} (cache: ${m.fonte})`);
}
console.log(`\n▶ Novos (sem mid global ainda): ${novos.length}`);
for (const n of novos) {
  console.log(`  ${pad(n.ageGroup, 8)} ${pad(n.name, 30)} ${n.country} pid_local=${n.pid} gross=${n.gross}`);
}

if (!APPLY) {
  console.log(`\nDRY-RUN — para aplicar: node scripts/integrate-elprat-2023.js --apply`);
  process.exit(0);
}

// Escrever uskids_torneios_completos(29).json
const completoPath = path.join(OUTDIR_PUBLIC, `uskids_torneios_completos(${NEW_COMPLETO_INDEX}).json`);
fs.writeFileSync(completoPath, JSON.stringify(elprat, null, 2));
console.log(`\n✓ ${path.basename(completoPath)} escrito`);

// Os "novos" jogadores não têm mid global — precisamos de GetMemberTournamentResults para os descobrir,
// mas pid local NÃO é memberID global. Vamos guardá-los num ficheiro auxiliar para tracking,
// mas não os adicionamos aos uskids-member-history-*.json (que precisam de mid real).
if (novos.length) {
  const auxPath = path.join(OUTDIR_ARCHIVE, 'elprat-2023-novos.json');
  fs.writeFileSync(auxPath, JSON.stringify({
    gerado_em: new Date().toISOString(),
    tcode: 15573,
    nota: 'Jogadores descobertos via El Prat 2023 sem mid global ainda. Para resolver, scrapar GetMemberTournamentResults nos pids destes flights ou cruzar com outras fontes.',
    novos
  }, null, 2));
  console.log(`✓ ${path.basename(auxPath)} escrito (${novos.length} jogadores sem mid global)`);
}

// Smart bump: contar quantos ficheiros uskids_torneios_completos(N).json existem
// realmente em public/data/ e usar o máximo entre o actual e MIN_COUNT_REQUIRED.
// Nunca BAIXA o contador (evita regredir e esconder ficheiros doutros pipelines).
const existing = glob.sync(path.join(OUTDIR_PUBLIC, 'uskids_torneios_completos(*).json'))
  .map(f => parseInt((f.match(/\((\d+)\)/) || [, '0'])[1]))
  .filter(n => n > 0);
const maxExisting = existing.length ? Math.max(...existing) : 0;
const finalCount = Math.max(maxExisting, MIN_COUNT_REQUIRED);
console.log(`\n▶ Ficheiros existentes: ${existing.length}, max index: ${maxExisting}, contador final: ${finalCount}`);

const usPage = fs.readFileSync(USKIDS_PAGE, 'utf8');
const usPagePatched = usPage.replace(/const\s+TORNEIOS_COMPLETOS_COUNT\s*=\s*\d+\s*;/, `const TORNEIOS_COMPLETOS_COUNT = ${finalCount};`);
const loader = fs.readFileSync(LOADER, 'utf8');
const loaderPatched = loader.replace(
  /(\.\.\.Array\.from\(\{\s*length:\s*)\d+(\s*\},\s*\(_,\s*i\)\s*=>\s*\(\{\s*kind:\s*"completo")/,
  `$1${finalCount}$2`
);
if (usPage !== usPagePatched) { fs.writeFileSync(USKIDS_PAGE, usPagePatched); console.log(`✓ USKIDSPage.tsx → ${finalCount}`); }
if (loader !== loaderPatched) { fs.writeFileSync(LOADER, loaderPatched); console.log(`✓ KIDSdataLoader.ts → ${finalCount}`); }

console.log(`\n✓ Pronto. Corre \`npm test && npm run build\` antes de commit.`);
