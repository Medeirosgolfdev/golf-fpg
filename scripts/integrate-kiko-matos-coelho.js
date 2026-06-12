'use strict';
// Node script — corre no terminal/PowerShell, NÃO no browser.

/**
 * integrate-kiko-matos-coelho.js
 *
 * Integra o histórico do KIKO Matos Coelho (mid USKids 471043) na cache
 * `uskids-member-history-*.json` para ele aparecer na KIDSpage.
 *
 * Input:  data-archive/kiko-matos-coelho-471043-history.json
 *           (descarregado via Chrome scrape do GetMemberTournamentResults)
 *
 * Acções:
 *   - Verifica se o mid já existe em qualquer dos 47 ficheiros existentes:
 *     - SIM → actualiza nome + adiciona torneios em falta
 *     - NÃO → adiciona ao próximo ficheiro novo `uskids-member-history-048.json`
 *   - Depois corre `node scripts/build-member-history-slim.js` para regenerar o slim.
 *
 * Uso:
 *   node scripts/integrate-kiko-matos-coelho.js          (dry-run)
 *   node scripts/integrate-kiko-matos-coelho.js --apply  (escreve)
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const APPLY = process.argv.includes('--apply');
const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'data-archive', 'kiko-matos-coelho-471043-history.json');
const DIR_ARCHIVE = path.join(ROOT, 'data-archive');
const KIKO_FILENAME = 'kiko-matos-coelho-471043-history.json';

const KIKO_MID = '471043';
const KIKO_NAME = 'KIKO Matos Coelho';
const KIKO_COUNTRY = 'PT';

// Se SOURCE não existir, tentar auto-detectar e mover do Downloads
if (!fs.existsSync(SOURCE)) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [
    path.join(home, 'Downloads', KIKO_FILENAME),
    path.join(home, 'Transferências', KIKO_FILENAME),
    path.join(home, 'Downloads', '..', 'Downloads', KIKO_FILENAME),
  ];
  let moved = false;
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        fs.renameSync(c, SOURCE);
        console.log(`▶ Movido de ${c} → ${SOURCE}`);
        moved = true;
        break;
      } catch (e) {
        console.warn(`  ⚠️ Não consegui mover de ${c}: ${e.message}`);
      }
    }
  }
  if (!moved) {
    console.error(`ERRO: ${SOURCE} não existe e não encontrei ${KIKO_FILENAME} em Downloads.`);
    console.error('Faz o scrape: abre Chrome em signupanytime, F12 → cola scripts/browser-scrape-kiko.js');
    process.exit(1);
  }
}

const kiko = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const kikoData = kiko.jogadores?.[KIKO_MID];
const kikoTorneios = kiko.torneios || {};
if (!kikoData) {
  console.error(`ERRO: mid ${KIKO_MID} não está em ${SOURCE}`);
  process.exit(1);
}
console.log(`▶ KIKO Matos Coelho (mid ${KIKO_MID}): ${kikoData.totalTorneios} torneios USKids`);

// Procurar o mid nos 47 ficheiros existentes
const memberFiles = glob.sync(path.join(DIR_ARCHIVE, 'uskids-member-history-*.json')).sort();
let existingFile = null;
let existingEntry = null;
for (const fn of memberFiles) {
  try {
    const d = JSON.parse(fs.readFileSync(fn, 'utf8'));
    if (d.jogadores?.[KIKO_MID]) {
      existingFile = fn;
      existingEntry = d.jogadores[KIKO_MID];
      break;
    }
  } catch {}
}

if (existingFile) {
  console.log(`▶ KIKO já existe em ${path.basename(existingFile)} com ${Object.keys(existingEntry.torneios || {}).length} torneios`);
  // Comparar e adicionar em falta
  const newTids = Object.keys(kikoData.torneios).filter(tid => !existingEntry.torneios?.[tid]);
  console.log(`  Torneios em falta: ${newTids.length} (${newTids.join(', ')})`);
  if (APPLY && newTids.length) {
    const fileData = JSON.parse(fs.readFileSync(existingFile, 'utf8'));
    if (!fileData.jogadores[KIKO_MID].torneios) fileData.jogadores[KIKO_MID].torneios = {};
    if (!fileData.torneios) fileData.torneios = {};
    for (const tid of newTids) {
      fileData.jogadores[KIKO_MID].torneios[tid] = kikoData.torneios[tid];
      if (!fileData.torneios[tid]) fileData.torneios[tid] = kikoTorneios[tid];
    }
    // actualizar nome se estava "?"
    if (!fileData.jogadores[KIKO_MID].name || fileData.jogadores[KIKO_MID].name === '?') {
      fileData.jogadores[KIKO_MID].name = KIKO_NAME;
    }
    if (!fileData.jogadores[KIKO_MID].country) fileData.jogadores[KIKO_MID].country = KIKO_COUNTRY;
    fs.writeFileSync(existingFile, JSON.stringify(fileData, null, 2));
    console.log(`  ✓ Actualizado ${path.basename(existingFile)} com ${newTids.length} torneios novos`);
  }
} else {
  // Adicionar ao próximo ficheiro
  const fileNums = memberFiles.map(f => parseInt((f.match(/-(\d+)\.json$/) || [, '0'])[1])).filter(n => n > 0);
  const nextNum = (fileNums.length ? Math.max(...fileNums) : 0) + 1;
  const newFilePath = path.join(DIR_ARCHIVE, `uskids-member-history-${String(nextNum).padStart(3, '0')}.json`);
  console.log(`▶ KIKO é NOVO. Ficheiro: ${path.basename(newFilePath)}`);

  if (APPLY) {
    const newFile = {
      gerado_em: new Date().toISOString(),
      fonte: 'integrate-kiko-matos-coelho.js (USKids Local Tour PT 2017 — Oeiras Tour Championship)',
      torneios: kikoTorneios,
      jogadores: {
        [KIKO_MID]: {
          name: KIKO_NAME,
          country: KIKO_COUNTRY,
          ageGroup: kikoData.ageGroup,
          totalTorneios: kikoData.totalTorneios,
          torneios: kikoData.torneios
        }
      }
    };
    fs.writeFileSync(newFilePath, JSON.stringify(newFile, null, 2));
    console.log(`  ✓ Escrito ${path.basename(newFilePath)} com ${kikoData.totalTorneios} torneios`);
  }
}

if (!APPLY) {
  console.log(`\nDRY-RUN — para aplicar: node scripts/integrate-kiko-matos-coelho.js --apply`);
} else {
  console.log(`\n✓ Pronto. Próximo passo: \`node scripts/build-member-history-slim.js\` para regenerar o slim.`);
}
