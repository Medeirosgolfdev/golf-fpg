'use strict';
// build-slim-with-overrides.js
// Substituto do build-member-history-slim.js que aplica overrides do
// resolved-names-overrides.json para preencher nomes "?" sem precisar de
// re-escrever os chunks de 89 MB (que sao corrompidos pelo mount cap).
//
// Logica:
//   1) Le todos os chunks uskids-member-history-XXX.json
//   2) Le resolved-names-overrides.json (se existir)
//   3) Para cada player com name "?" ou vazio, consulta o overrides:
//      - se existir, usa o nome de la
//      - se nao, ignora o player (igual ao original)
//   4) Output: public/data/uskids-member-history-slim.json
//
// Uso:
//   node scripts/gen-overrides.js              (gera o overrides primeiro)
//   node scripts/build-slim-with-overrides.js  (depois gera o slim)

const fs   = require('fs');
const path = require('path');

const ARCHIVE_DIR  = path.join(__dirname, '..', 'data-archive');
const OVERRIDES    = path.join(ARCHIVE_DIR, 'resolved-names-overrides.json');
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

// Carregar overrides (opcional)
let overrides = {};
let overridesMeta = null;
if (fs.existsSync(OVERRIDES)) {
  try {
    const o = JSON.parse(fs.readFileSync(OVERRIDES, 'utf8'));
    overrides = o.overrides || {};
    overridesMeta = { source: o.source, total: o.total, gerado_em: o.gerado_em };
  } catch (e) {
    console.warn('  ! overrides nao parseou: ' + e.message);
  }
}

const torneios = {};
const jogadores = {};
let totalFicheiros = 0;
let totalJogadores = 0;
let totalEntradas  = 0;
let skippedNoName  = 0;
let appliedOverrides = 0;

const allFiles = fs.readdirSync(ARCHIVE_DIR)
  .filter(function (f) { return /^uskids-member-history-\d{3}\.json$/.test(f); })
  .sort()
  .slice(0, MAX_FILES);

if (allFiles.length === 0) {
  console.error('Nenhum ficheiro uskids-member-history-XXX.json em ' + ARCHIVE_DIR);
  process.exit(1);
}

console.log('=================================================');
console.log('build-slim-with-overrides.js');
console.log('  ' + new Date().toLocaleString('pt-PT'));
console.log('  ' + allFiles.length + ' ficheiros a processar');
if (overridesMeta) {
  console.log('  Overrides: ' + overridesMeta.total + ' (source: ' + overridesMeta.source + ')');
} else {
  console.log('  Overrides: (nenhum - comportamento igual ao original)');
}
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
    // Resolver nome via override se necessario
    let effectiveName = player.name;
    let effectiveCountry = player.country;
    if (!effectiveName || effectiveName === '?' || effectiveName === null) {
      const ov = overrides[midStr];
      if (ov && ov.name) {
        effectiveName = ov.name;
        if (!effectiveCountry && ov.country) effectiveCountry = ov.country;
        appliedOverrides++;
      } else {
        skippedNoName++;
        continue;
      }
    }

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
        // Se a entrada existente nao tem nome mas a actual tem (via override), actualiza
        if ((!jogadores[midStr].name || jogadores[midStr].name === '?') && effectiveName) {
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
console.log('  ' + appliedOverrides + ' overrides aplicados (mids que estavam "?")');
console.log('  ' + totalEntradas + ' entradas jogador x torneio');
console.log('  Tamanho: ' + outputMB + ' MB');
console.log('=================================================');
