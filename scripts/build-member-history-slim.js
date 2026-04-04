'use strict';

/**
 * build-member-history-slim.js
 *
 * Lê todos os ficheiros uskids-member-history-XXX.json e produz
 * um único uskids-member-history-slim.json com:
 *
 *  - torneios (partilhados): name, startDate, holesPerRound, par[], yards[]
 *  - jogadores: name, country, ageGroup + por torneio: ageGroup, place, rounds{gross, strokes[]}
 *
 * Campos removidos de cada jogador×torneio:
 *   par[], yards[], type, endDate, totalRounds, totalStrokes, points, status,
 *   memberId, totalTorneios, place (cidade), rounds.course, rounds.startHole,
 *   rounds.startTime, rounds.group, rounds.holes
 *
 * Uso:
 *   node scripts/build-member-history-slim.js
 *   node scripts/build-member-history-slim.js --max-files=10   (para testar)
 *
 * Output: public/data/uskids-member-history-slim.json
 */

const fs   = require('fs');
const path = require('path');

// ── Configuração ──────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const OUTPUT   = path.join(DATA_DIR, 'uskids-member-history-slim.json');
const MAX_FILES = parseInt(
  (process.argv.find(a => a.startsWith('--max-files=')) || '').split('=')[1] || '999'
);

// ── Helpers ───────────────────────────────────────────────────────

/** Remove zeros do fim de um array de buracos (ex: 9-hole → só 9 valores) */
function trimTrailingZeros(arr) {
  if (!Array.isArray(arr)) return arr;
  let end = arr.length;
  while (end > 0 && arr[end - 1] === 0) end--;
  return arr.slice(0, end);
}

/** Combina dois arrays tomando o valor não-zero quando há conflito */
function mergeArrays(a, b) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  const len = Math.max(a.length, b.length);
  const out = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    out[i] = (a[i] || 0) !== 0 ? (a[i] || 0) : (b[i] || 0);
  }
  return trimTrailingZeros(out);
}

// ── Estruturas de dados ───────────────────────────────────────────

// torneios partilhados: tcode → { name, startDate, holesPerRound, par[], yards[] }
const torneios = {};

// jogadores: memberId → { name, country, ageGroup, torneios: { tcode → { ageGroup, place, rounds } } }
const jogadores = {};

let totalFicheiros = 0;
let totalJogadores = 0;
let totalEntradas  = 0;
let skippedNoName  = 0;

// ── Processar ficheiros ───────────────────────────────────────────

// Descobrir ficheiros disponíveis
const allFiles = fs.readdirSync(DATA_DIR)
  .filter(f => /^uskids-member-history-\d{3}\.json$/.test(f))
  .sort()
  .slice(0, MAX_FILES);

if (allFiles.length === 0) {
  console.error(`❌ Nenhum ficheiro uskids-member-history-XXX.json encontrado em:\n   ${DATA_DIR}`);
  process.exit(1);
}

console.log('══════════════════════════════════════════════');
console.log('🏌️  build-member-history-slim.js');
console.log(`   ${new Date().toLocaleString('pt-PT')}`);
console.log(`   ${allFiles.length} ficheiros a processar`);
console.log('══════════════════════════════════════════════\n');

for (const filename of allFiles) {
  const filepath = path.join(DATA_DIR, filename);
  const sizeMB = (fs.statSync(filepath).size / 1024 / 1024).toFixed(1);

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (err) {
    console.warn(`  ⚠️  ${filename}: erro ao ler (${err.message})`);
    continue;
  }

  const jogadoresNesteFicheiro = Object.keys(data.jogadores || {}).length;
  let entradasNesteFicheiro = 0;

  for (const [midStr, player] of Object.entries(data.jogadores || {})) {
    // Ignorar jogadores sem nome
    if (!player.name || player.name === '?' || player.name === null) {
      skippedNoName++;
      continue;
    }

    for (const [tcodeStr, tourn] of Object.entries(player.torneios || {})) {
      // ── Actualizar torneio partilhado ──
      if (!torneios[tcodeStr]) {
        torneios[tcodeStr] = {
          name:          tourn.name        || '',
          startDate:     tourn.startDate   || '',
          holesPerRound: tourn.holesPerRound || 18,
          par:           trimTrailingZeros(tourn.par)   || null,
          yards:         trimTrailingZeros(tourn.yards) || null,
        };
      } else {
        // Completar par/yards se em falta (podem aparecer noutra entrada)
        const t = torneios[tcodeStr];
        if (!t.par && tourn.par)   t.par   = trimTrailingZeros(tourn.par);
        if (!t.yards && tourn.yards) t.yards = trimTrailingZeros(tourn.yards);
        // Raro, mas pode haver entradas com arrays diferentes — merge seguro
        if (t.par && tourn.par)     t.par   = mergeArrays(t.par, trimTrailingZeros(tourn.par));
        if (t.yards && tourn.yards) t.yards = mergeArrays(t.yards, trimTrailingZeros(tourn.yards));
        // Garantir que o nome fica preenchido
        if (!t.name && tourn.name) t.name = tourn.name;
        if (!t.startDate && tourn.startDate) t.startDate = tourn.startDate;
      }

      // ── Rounds slim (só gross + strokes sem zeros no fim) ──
      const roundsSlim = {};
      for (const [rn, rnd] of Object.entries(tourn.rounds || {})) {
        if (!rnd.gross && (!rnd.strokes || !rnd.strokes.some(v => v > 0))) continue;
        roundsSlim[rn] = {};
        if (rnd.gross)   roundsSlim[rn].gross   = rnd.gross;
        if (rnd.strokes) roundsSlim[rn].strokes = trimTrailingZeros(rnd.strokes);
      }
      if (Object.keys(roundsSlim).length === 0) continue;

      // ── Actualizar jogador ──
      if (!jogadores[midStr]) {
        jogadores[midStr] = {
          name:     player.name,
          country:  player.country  || '',
          ageGroup: player.ageGroup || '',
          torneios: {},
        };
        totalJogadores++;
      } else {
        // Actualizar ageGroup com o mais recente (sobrescrever)
        // (os ficheiros podem ter versões diferentes do mesmo jogador)
        if (player.ageGroup) jogadores[midStr].ageGroup = player.ageGroup;
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

  console.log(`  ✅ ${filename} (${sizeMB} MB) → ${jogadoresNesteFicheiro} jogadores, ${entradasNesteFicheiro} entradas`);
}

// ── Output ────────────────────────────────────────────────────────

const output = {
  gerado_em: new Date().toISOString(),
  torneios,
  jogadores,
};

const outputStr = JSON.stringify(output);
const outputMB  = (Buffer.byteLength(outputStr, 'utf8') / 1024 / 1024).toFixed(2);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(OUTPUT, outputStr, 'utf8');

const nTorneios  = Object.keys(torneios).length;
const nJogadores = Object.keys(jogadores).length;

console.log('\n══════════════════════════════════════════════');
console.log('✅  uskids-member-history-slim.json');
console.log(`   ${totalFicheiros} ficheiros processados`);
console.log(`   ${nTorneios} torneios únicos`);
console.log(`   ${nJogadores} jogadores (${skippedNoName} sem nome ignorados)`);
console.log(`   ${totalEntradas} entradas jogador×torneio`);
console.log(`   Tamanho: ${outputMB} MB`);
console.log('══════════════════════════════════════════════');
