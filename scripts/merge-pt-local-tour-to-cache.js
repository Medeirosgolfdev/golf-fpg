'use strict';

/**
 * merge-pt-local-tour-to-cache.js
 *
 * Pega nos 34 jogadores descobertos do USKids Local Tour Portugal 2023
 * (já com nomes resolvidos via canonical + histórico USKids completo) e
 * mescla-os nos ficheiros uskids-member-history-XXX.json (a fonte que
 * alimenta o KIDSdataLoader → KIDSPage).
 *
 * Inputs:
 *   data-archive/uskids-pt-local-tour-history.json  (34 jogadores, histórico USKids completo)
 *   data-archive/uskids-pt-local-tour-final.json    (mid → nome canónico)
 *   data-archive/uskids-member-history-*.json       (46 ficheiros existentes)
 *
 * Acções:
 *   - Para mids JÁ existentes nos 46 ficheiros: actualizar nome + country se estavam "?" ou vazios.
 *   - Para mids NOVOS: adicionar a um ficheiro novo `uskids-member-history-047.json`.
 *
 * Depois corre:  node scripts/build-member-history-slim.js
 *   para regenerar `public/data/uskids-member-history-slim.json` que é o que a app consome.
 *
 * Uso:
 *   node scripts/merge-pt-local-tour-to-cache.js          (dry-run)
 *   node scripts/merge-pt-local-tour-to-cache.js --apply  (escrever ficheiros)
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const APPLY = process.argv.includes('--apply');

const DIR_ARCHIVE = path.join(__dirname, '..', 'data-archive');
const PT_HIST  = path.join(DIR_ARCHIVE, 'uskids-pt-local-tour-history.json');
const PT_FINAL = path.join(DIR_ARCHIVE, 'uskids-pt-local-tour-final.json');

const ptHist  = JSON.parse(fs.readFileSync(PT_HIST,  'utf8'));
const ptFinal = JSON.parse(fs.readFileSync(PT_FINAL, 'utf8'));

// Mapa canónico mid → {name, country}
const canonicalByMid = new Map();
for (const j of ptFinal.jogadores || []) {
  canonicalByMid.set(String(j.memberID), { name: j.name, country: j.country });
}
console.log(`▶ Canonical names: ${canonicalByMid.size}`);

// Carregar todos os 46 ficheiros e construir índice mid → fileNum
const memberFiles = glob.sync(path.join(DIR_ARCHIVE, 'uskids-member-history-*.json')).sort();
const midToFile = new Map();   // mid → filename onde está
const cachedTorneios = new Map(); // mid → Set(tcodes já presentes)
const files = {};              // filename → parsed JSON (lazy load)

console.log(`▶ A varrer ${memberFiles.length} ficheiros member-history existentes...`);
for (const fn of memberFiles) {
  let d;
  try { d = JSON.parse(fs.readFileSync(fn, 'utf8')); } catch { continue; }
  files[fn] = d;
  for (const mid of Object.keys(d.jogadores || {})) {
    if (!midToFile.has(mid)) midToFile.set(mid, fn);
    const existing = cachedTorneios.get(mid) || new Set();
    Object.keys(d.jogadores[mid].torneios || {}).forEach(t => existing.add(t));
    cachedTorneios.set(mid, existing);
  }
}

// Para cada mid em pt-local-tour
let nameUpdated = 0, midsNew = 0, torneiosAdded = 0;
const newMids = [];

for (const [mid, ph] of Object.entries(ptHist.jogadores || {})) {
  const canon = canonicalByMid.get(mid);
  if (!canon) {
    console.warn(`  ⚠️ mid ${mid} sem nome canónico (skip)`);
    continue;
  }

  const existingFn = midToFile.get(mid);

  if (existingFn) {
    // Mid já existe → actualizar nome/country se necessário + adicionar torneios PT em falta
    const cached = files[existingFn].jogadores[mid];
    let updated = false;

    if (!cached.name || cached.name === '?') {
      cached.name = canon.name;
      nameUpdated++;
      updated = true;
    }
    if (!cached.country) {
      cached.country = canon.country;
      updated = true;
    }

    // Adicionar torneios PT em falta
    const existingTids = cachedTorneios.get(mid) || new Set();
    for (const [tid, t] of Object.entries(ph.torneios || {})) {
      if (existingTids.has(tid)) continue;
      cached.torneios = cached.torneios || {};
      cached.torneios[tid] = {
        name: ptHist.torneios?.[tid]?.name || '',
        startDate: ptHist.torneios?.[tid]?.startDate || '',
        ageGroup: t.ageGroup,
        place: t.place,
        totalStrokes: t.totalStrokes,
        rounds: t.rounds || {}
      };
      torneiosAdded++;
      updated = true;
    }

    if (updated) {
      console.log(`  ✎ mid ${mid} (${canon.name}): actualizado em ${path.basename(existingFn)}`);
    }
  } else {
    // Mid completamente novo
    midsNew++;
    newMids.push({ mid, canon, ph });
    console.log(`  + mid ${mid} (${canon.name}) — NOVO`);
  }
}

console.log(`\n▶ Sumário:`);
console.log(`  Nomes actualizados (de "?" para real):  ${nameUpdated}`);
console.log(`  Torneios PT adicionados a mids existentes: ${torneiosAdded}`);
console.log(`  Mids completamente novos: ${midsNew}`);

if (newMids.length) {
  // Criar novo ficheiro 047
  const newFileNum = String(memberFiles.length + 1).padStart(3, '0');
  const newFilePath = path.join(DIR_ARCHIVE, `uskids-member-history-${newFileNum}.json`);
  const newFileData = {
    gerado_em: new Date().toISOString(),
    fonte: 'merge-pt-local-tour-to-cache.js (USKids Local Tour PT 2023)',
    torneios: ptHist.torneios || {},
    jogadores: {}
  };
  for (const { mid, canon, ph } of newMids) {
    newFileData.jogadores[mid] = {
      name: canon.name,
      country: canon.country,
      ageGroup: ph.ageGroup,
      totalTorneios: ph.totalTorneios || Object.keys(ph.torneios || {}).length,
      torneios: ph.torneios || {}
    };
  }
  console.log(`\n▶ Novo ficheiro proposto: ${newFilePath}`);
  console.log(`  Conterá ${newMids.length} jogadores novos.`);

  if (APPLY) {
    fs.writeFileSync(newFilePath, JSON.stringify(newFileData, null, 2));
    console.log(`  ✓ Escrito.`);
  }
}

if (APPLY) {
  // Escrever de volta os ficheiros que foram tocados
  let touched = 0;
  for (const [fn, d] of Object.entries(files)) {
    // Determinar se algum mid neste ficheiro foi tocado
    let dirty = false;
    for (const [mid] of Object.entries(d.jogadores || {})) {
      if (canonicalByMid.has(mid)) { dirty = true; break; }
    }
    if (dirty) {
      fs.writeFileSync(fn, JSON.stringify(d, null, 2));
      touched++;
    }
  }
  console.log(`\n  ✓ ${touched} ficheiros existentes actualizados.`);
  console.log(`\n  Próximo passo: corre \`node scripts/build-member-history-slim.js\` para regenerar o slim.`);
} else {
  console.log(`\n  DRY-RUN — nada escrito. Para aplicar: node scripts/merge-pt-local-tour-to-cache.js --apply`);
}
