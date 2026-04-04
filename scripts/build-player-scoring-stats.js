'use strict';

/**
 * build-player-scoring-stats.js
 *
 * Lê uskids-member-history-slim.json e calcula as estatísticas de scoring
 * buraco-a-buraco para cada jogador — distribuição Eagle/Birdie/Par/Bogey/Duplo/Triple+
 * e médias por par 3/4/5.
 *
 * Apenas usa torneios Boys 9–13 com par[] disponível e strokes válidos.
 * A chave de output é o nome normalizado (lowercase, sem acentos, sem espaços duplos)
 * para facilitar o lookup na KIDSPage.
 *
 * Output: public/data/uskids-player-scoring-stats.json
 *
 * Uso:
 *   node scripts/build-player-scoring-stats.js
 *   node scripts/build-player-scoring-stats.js --min-holes=54   (mínimo de buracos para incluir)
 */

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────
const DATA_DIR  = path.join(__dirname, '..', 'public', 'data');
const INPUT     = path.join(DATA_DIR, 'uskids-member-history-slim.json');
const OUTPUT    = path.join(DATA_DIR, 'uskids-player-scoring-stats.json');
const MIN_HOLES = parseInt(
  (process.argv.find(a => a.startsWith('--min-holes=')) || '').split('=')[1] || '18'
);

// ── Helpers ───────────────────────────────────────────────────────

/** Normalização igual à do KIDSdataLoader (normName) */
function normName(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // remover acentos
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Carregar slim.json ────────────────────────────────────────────
if (!fs.existsSync(INPUT)) {
  console.error(`❌ Ficheiro não encontrado: ${INPUT}`);
  console.error('   Corre primeiro: node scripts/build-member-history-slim.js');
  process.exit(1);
}

console.log('══════════════════════════════════════════════');
console.log('📊  build-player-scoring-stats.js');
console.log(`    ${new Date().toLocaleString('pt-PT')}`);
console.log(`    Mínimo de buracos: ${MIN_HOLES}`);
console.log('══════════════════════════════════════════════\n');

const slim = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const sharedTorneios = slim.torneios || {};
const jogadores      = slim.jogadores || {};

console.log(`  Torneios partilhados: ${Object.keys(sharedTorneios).length}`);
console.log(`  Jogadores: ${Object.keys(jogadores).length}\n`);

// ── Estrutura de acumulação por jogador ──────────────────────────
// key: normName → stats
const statsMap = {};

let nJogadores = 0;
let nEntradas  = 0;
let nBuracos   = 0;

for (const player of Object.values(jogadores)) {
  if (!player.name || player.name === '?' || player.name === null) continue;

  // Acumuladores para este jogador
  let e=0, b=0, p=0, bo=0, d=0, w=0;
  const byPar = {
    3: { sum: 0, n: 0, under: 0 },
    4: { sum: 0, n: 0, under: 0 },
    5: { sum: 0, n: 0, under: 0 },
  };
  let nRounds  = 0;
  let grossSum = 0;
  let bestGross = null;
  let underParRounds = 0;

  for (const [tcodeStr, tourn] of Object.entries(player.torneios || {})) {
    // Só Boys 9–13
    const agMatch = (tourn.ageGroup || '').match(/boys\s+(\d+)/i);
    if (!agMatch) continue;
    const minAge = parseInt(agMatch[1]);
    if (minAge < 9 || minAge > 13) continue;

    // Dados partilhados do torneio (par[])
    const shared = sharedTorneios[tcodeStr];
    if (!shared) continue;
    const parArr = shared.par;
    if (!Array.isArray(parArr) || parArr.length === 0) continue;

    const holesPerRound = shared.holesPerRound || parArr.length;

    for (const rnd of Object.values(tourn.rounds || {})) {
      const strokes = rnd.strokes;
      if (!Array.isArray(strokes)) continue;
      if (strokes.length < holesPerRound) continue;
      if (!strokes.some(s => s > 0)) continue;

      // Calcular gross da ronda
      let gross = 0;
      let parTotal = 0;
      let validHoles = 0;

      for (let i = 0; i < holesPerRound; i++) {
        const s = strokes[i];
        const par = parArr[i];
        if (!s || s <= 0 || !par || par <= 0) continue;

        const diff = s - par;
        if (diff <= -2)      e++;
        else if (diff === -1) b++;
        else if (diff === 0)  p++;
        else if (diff === 1)  bo++;
        else if (diff === 2)  d++;
        else                  w++;

        // Por tipo de par
        if (par === 3 || par === 4 || par === 5) {
          byPar[par].sum += s;
          byPar[par].n++;
          if (diff < 0) byPar[par].under++;
        }

        gross    += s;
        parTotal += par;
        validHoles++;
      }

      if (validHoles < holesPerRound * 0.8) continue; // ignorar rondas incompletas (< 80% dos buracos)

      nRounds++;
      grossSum += gross;
      if (bestGross === null || gross < bestGross) bestGross = gross;
      if (gross < parTotal) underParRounds++;

      nBuracos += validHoles;
    }

    nEntradas++;
  }

  const tot = e + b + p + bo + d + w;
  if (tot < MIN_HOLES) continue;  // não tem buracos suficientes

  const normN = normName(player.name);

  // Se já existe entrada com o mesmo nome normalizado, acumular
  if (statsMap[normN]) {
    const ex = statsMap[normN];
    ex.e  += e;  ex.b  += b;  ex.p  += p;
    ex.bo += bo; ex.d  += d;  ex.w  += w;
    ex.n  += nRounds;
    ex.gs += grossSum;
    if (bestGross !== null && (ex.best === null || bestGross < ex.best)) ex.best = bestGross;
    ex.upr += underParRounds;
    for (const pp of [3,4,5]) {
      ex.bp[pp].sum   += byPar[pp].sum;
      ex.bp[pp].n     += byPar[pp].n;
      ex.bp[pp].under += byPar[pp].under;
    }
  } else {
    statsMap[normN] = {
      name: player.name,   // nome original para display
      e, b, p, bo, d, w,   // contagens por categoria
      n:   nRounds,        // nº de rondas com scorecard
      gs:  grossSum,       // soma de grosses (para calcular média)
      best: bestGross,     // melhor ronda
      upr: underParRounds, // rondas sub-par
      bp: {                // by par
        3: { ...byPar[3] },
        4: { ...byPar[4] },
        5: { ...byPar[5] },
      },
    };
    nJogadores++;
  }
}

// ── Limpar e compactar output ─────────────────────────────────────
// Remover campos intermédios, calcular médias finais
const output = {};
for (const [normN, s] of Object.entries(statsMap)) {
  const tot = s.e + s.b + s.p + s.bo + s.d + s.w;
  if (tot < MIN_HOLES) continue;

  // by_par: só incluir se tiver dados
  const bp = {};
  for (const pp of [3, 4, 5]) {
    if (s.bp[pp].n > 0) {
      bp[pp] = {
        avg:   parseFloat((s.bp[pp].sum / s.bp[pp].n).toFixed(3)),
        n:     s.bp[pp].n,
        under: s.bp[pp].under,
      };
    }
  }

  output[normN] = {
    name: s.name,
    e:    s.e,
    b:    s.b,
    p:    s.p,
    bo:   s.bo,
    d:    s.d,
    w:    s.w,
    tot,
    n:    s.n,                                                          // rondas com scorecard
    avg:  s.n > 0 ? parseFloat((s.gs / s.n).toFixed(2)) : null,        // média por ronda
    best: s.best,                                                       // melhor ronda
    upr:  s.upr,                                                        // rondas sub-par
    ...(Object.keys(bp).length > 0 ? { bp } : {}),
  };
}

// ── Gravar ────────────────────────────────────────────────────────
const outputStr = JSON.stringify({ gerado_em: new Date().toISOString(), jogadores: output });
const outputMB  = (Buffer.byteLength(outputStr, 'utf8') / 1024).toFixed(0);
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(OUTPUT, outputStr, 'utf8');

const nOut = Object.keys(output).length;
console.log('══════════════════════════════════════════════');
console.log('✅  uskids-player-scoring-stats.json');
console.log(`    ${nJogadores} jogadores processados → ${nOut} com dados suficientes`);
console.log(`    ${nEntradas} entradas torneio processadas`);
console.log(`    ${nBuracos.toLocaleString()} buracos totais`);
console.log(`    Tamanho: ${outputMB} KB`);
console.log('══════════════════════════════════════════════');
