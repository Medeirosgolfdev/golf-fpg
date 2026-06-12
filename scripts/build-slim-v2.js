'use strict';
// build-slim-v2.js
//
// Sucessor de build-slim-with-overrides.js. Aplica DOIS niveis de overrides:
//
//   1) verify-corrections-overrides.json  (prioridade MAXIMA — sobre cache)
//      Corrige nomes errados ou normaliza casing/espacos. Aplicado mesmo quando
//      a cache tem nome valido. Filosofia: so' aplicar quando NAO muda info
//      semantica (preserva cross-matching com outras fontes).
//
//   2) resolved-names-overrides.json  (prioridade media — substitui '?')
//      Preenche nomes em falta (mids com "?"). So' aplica quando cache nao tem
//      nome valido.
//
//   3) Cache do chunk (prioridade base) — usa o nome do chunk se nao for '?'.
//
// Output: public/data/uskids-member-history-slim.json
//
// Uso:
//   node scripts/build-slim-v2.js
//   node scripts/build-slim-v2.js --max-files=10  (para testar)

const fs   = require('fs');
const path = require('path');

const ARCHIVE_DIR  = path.join(__dirname, '..', 'data-archive');
const RESOLVED     = path.join(ARCHIVE_DIR, 'resolved-names-overrides.json');
const CORRECTIONS  = path.join(ARCHIVE_DIR, 'verify-corrections-overrides.json');
const OUTPUT       = path.join(__dirname, '..', 'public', 'data', 'uskids-member-history-slim.json');
const MAX_FILES = parseInt(
  (process.argv.find(function (a) { return a.startsWith('--max-files='); }) || '').split('=')[1] || '999'
);

function trimTrailingZeros(arr) {
  if (!Array.isArray(arr)) return arr;
  let end = arr.length;
  while (end > 0 && arr[end - 1] === 0) end--;
  return arr.slice(0, end);
}
function mergeArrays(a, b) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  const len = Math.max(a.length, b.length);
  const out = new Array(len).fill(0);
  for (let i = 0; i < len; i++) out[i] = (a[i] || 0) !== 0 ? (a[i] || 0) : (b[i] || 0);
  return trimTrailingZeros(out);
}

// Carregar overrides
let resolvedOv = {};
let correctionsOv = {};
let resolvedMeta = null;
let correctionsMeta = null;

if (fs.existsSync(RESOLVED)) {
  try {
    const o = JSON.parse(fs.readFileSync(RESOLVED, 'utf8'));
    resolvedOv = o.overrides || {};
    resolvedMeta = { source: o.source, total: o.total };
  } catch (e) { console.warn('  ! resolved-overrides nao parseou: ' + e.message); }
}

if (fs.existsSync(CORRECTIONS)) {
  try {
    const c = JSON.parse(fs.readFileSync(CORRECTIONS, 'utf8'));
    correctionsOv = c.corrections || {};
    correctionsMeta = { total: c.total };
  } catch (e) { console.warn('  ! corrections-overrides nao parseou: ' + e.message); }
}

const torneios = {};
const jogadores = {};
let totalFicheiros = 0;
let totalJogadores = 0;
let totalEntradas  = 0;
let skippedNoName  = 0;
let appliedResolved = 0;
let appliedCorrections = 0;

const allFiles = fs.readdirSync(ARCHIVE_DIR)
  .filter(function (f) { return /^uskids-member-history-\d{3}\.json$/.test(f); })
  .sort()
  .slice(0, MAX_FILES);

if (allFiles.length === 0) {
  console.error('Nenhum ficheiro uskids-member-history-XXX.json em ' + ARCHIVE_DIR);
  process.exit(1);
}

console.log('=================================================');
console.log('build-slim-v2.js');
console.log('  ' + new Date().toLocaleString('pt-PT'));
console.log('  ' + allFiles.length + ' ficheiros a processar');
console.log('  Resolved overrides:    ' + (resolvedMeta ? resolvedMeta.total + ' (substitui \'?\')' : '(nenhum)'));
console.log('  Corrections overrides: ' + (correctionsMeta ? correctionsMeta.total + ' (forca sobre cache)' : '(nenhum)'));
console.log('=================================================\n');

for (const filename of allFiles) {
  const filepath = path.join(ARCHIVE_DIR, filename);
  const sizeMB = (fs.statSync(filepath).size / 1024 / 1024).toFixed(1);

  let data;
  try { data = JSON.parse(fs.readFileSync(filepath, 'utf8')); }
  catch (err) { console.warn('  ! ' + filename + ': erro ao ler (' + err.message.slice(0,80) + ')'); continue; }

  const jogadoresNesteFicheiro = Object.keys(data.jogadores || {}).length;
  let entradasNesteFicheiro = 0;

  for (const [midStr, player] of Object.entries(data.jogadores || {})) {
    // Resolver nome com prioridade: corrections > cache (se valido) > resolved
    let effectiveName = null;
    let effectiveCountry = null;
    let appliedVia = null;

    const cor = correctionsOv[midStr];
    if (cor && cor.name) {
      effectiveName = cor.name;
      effectiveCountry = cor.country || player.country;
      appliedVia = 'correction';
    } else if (player.name && player.name !== '?' && player.name.trim() !== '') {
      effectiveName = player.name;
      effectiveCountry = player.country;
      appliedVia = 'cache';
    } else {
      const res = resolvedOv[midStr];
      if (res && res.name) {
        effectiveName = res.name;
        effectiveCountry = res.country || null;
        appliedVia = 'resolved';
      }
    }

    if (!effectiveName) { skippedNoName++; continue; }
    if (appliedVia === 'correction') appliedCorrections++;
    else if (appliedVia === 'resolved') appliedResolved++;

    for (const [tcodeStr, tourn] of Object.entries(player.torneios || {})) {
      if (!torneios[tcodeStr]) {
        torneios[tcodeStr] = {
          name:          tourn.name        || '',
          startDate:     tourn.startDate   || '',
          holesPerRound: tourn.holesPerRound || 18,
          par:           trimTrailingZeros(tourn.par)   || null,
          yards:         trimTrailingZeros(tourn.yards) || null,
        };
      } else {
        const t = torneios[tcodeStr];
        if (!t.par && tourn.par)     t.par   = trimTrailingZeros(tourn.par);
        if (!t.yards && tourn.yards) t.yards = trimTrailingZeros(tourn.yards);
        if (t.par && tourn.par)      t.par   = mergeArrays(t.par, trimTrailingZeros(tourn.par));
        if (t.yards && tourn.yards)  t.yards = mergeArrays(t.yards, trimTrailingZeros(tourn.yards));
        if (!t.name && tourn.name)   t.name = tourn.name;
        if (!t.startDate && tourn.startDate) t.startDate = tourn.startDate;
      }

      const roundsSlim = {};
      for (const [rn, rnd] of Object.entries(tourn.rounds || {})) {
        if (!rnd.gross && (!rnd.strokes || !rnd.strokes.some(function (v) { return v > 0; }))) continue;
        roundsSlim[rn] = {};
        if (rnd.gross)   roundsSlim[rn].gross   = rnd.gross;
        if (rnd.strokes) roundsSlim[rn].strokes = trimTrailingZeros(rnd.strokes);
      }
      if (Object.keys(roundsSlim).length === 0) continue;

      if (!jogadores[midStr]) {
        jogadores[midStr] = {
          name:     effectiveName,
          country:  effectiveCountry || '',
          ageGroup: player.ageGroup || '',
          torneios: {},
        };
        totalJogadores++;
      } else {
        if (player.ageGroup) jogadores[midStr].ageGroup = player.ageGroup;
        // Se a entrada actual e' uma correction, FORCAR sobrescrever nome
        if (appliedVia === 'correction') {
          jogadores[midStr].name = effectiveName;
          if (effectiveCountry) jogadores[midStr].country = effectiveCountry;
        }
        // Se a entrada existente nao tem nome mas a actual tem, actualizar
        else if ((!jogadores[midStr].name || jogadores[midStr].name === '?') && effectiveName) {
          jogadores[midStr].name = effectiveName;
        }
        if (!jogadores[midStr].country && effectiveCountry) {
          jogadores[midStr].country = effectiveCountry;
        }
      }

      jogadores[midStr].torneios[tcodeStr] = {
        ageGroup: tourn.ageGroup || '',
        place:    (tourn.place != null && tourn.place > 0) ? tourn.place : null,
        rounds:   roundsSlim,
      };
      entradasNesteFicheiro++;
    }
  }

  totalFicheiros++;
  totalEntradas += entradasNesteFicheiro;

  console.log('  OK ' + filename + ' (' + sizeMB + ' MB) -> ' + jogadoresNesteFicheiro + ' jogadores, ' + entradasNesteFicheiro + ' entradas');
}

const output = { gerado_em: new Date().toISOString(), torneios: torneios, jogadores: jogadores };
const outputStr = JSON.stringify(output);
const outputMB  = (Buffer.byteLength(outputStr, 'utf8') / 1024 / 1024).toFixed(2);

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, outputStr, 'utf8');

const nTorneios  = Object.keys(torneios).length;
const nJogadores = Object.keys(jogadores).length;

console.log('\n=================================================');
console.log('uskids-member-history-slim.json escrito');
console.log('  ' + totalFicheiros + ' ficheiros processados');
console.log('  ' + nTorneios + ' torneios unicos');
console.log('  ' + nJogadores + ' jogadores (' + skippedNoName + ' sem nome ignorados)');
console.log('  ' + appliedResolved + ' resolved-overrides aplicados (mids que estavam \'?\')');
console.log('  ' + appliedCorrections + ' corrections aplicados (forca sobre cache)');
console.log('  ' + totalEntradas + ' entradas jogador x torneio');
console.log('  Tamanho: ' + outputMB + ' MB');
console.log('=================================================');
