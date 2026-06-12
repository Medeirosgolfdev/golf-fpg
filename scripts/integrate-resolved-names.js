'use strict';
// Node script — corre no terminal/PowerShell, NÃO no browser.

/**
 * integrate-resolved-names.js
 *
 * Aplica os nomes resolvidos pelo `browser-resolve-missing-names.js` de volta
 * aos ficheiros `data-archive/uskids-member-history-*.json`.
 *
 * Para cada mid em `resolved-missing-names.json` com `resolved: true`:
 *   - Procura o mid em todos os ficheiros member-history
 *   - Actualiza `name` e `country` SE estavam vazios/"?"
 *   - Não sobrescreve nomes já válidos (defensive)
 *
 * Input: data-archive/resolved-missing-names.json
 *        (auto-detecta em Downloads e move automaticamente)
 *
 * Output:
 *   - N ficheiros uskids-member-history-XXX.json modificados in-place
 *   - data-archive/integrate-resolved-names-report.json com sumário
 *
 * Uso:
 *   node scripts/integrate-resolved-names.js          (dry-run)
 *   node scripts/integrate-resolved-names.js --apply  (escreve)
 *   node scripts/integrate-resolved-names.js --apply --force  (sobrescreve TODOS, mesmo nomes existentes)
 *
 * Depois corre `node scripts/build-member-history-slim.js` para regenerar slim.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

const ROOT = path.join(__dirname, '..');
const DIR_ARCHIVE = path.join(ROOT, 'data-archive');
const SOURCE = path.join(DIR_ARCHIVE, 'resolved-missing-names.json');
const REPORT = path.join(DIR_ARCHIVE, 'integrate-resolved-names-report.json');
const SOURCE_FILENAME = 'resolved-missing-names.json';

// Auto-detectar e mover de Downloads se necessário
if (!fs.existsSync(SOURCE)) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [
    path.join(home, 'Downloads', SOURCE_FILENAME),
    path.join(home, 'Transferências', SOURCE_FILENAME),
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
    console.error(`ERRO: ${SOURCE} não existe.`);
    console.error('Faz o scrape: abre Chrome, F12 → cola scripts/browser-resolve-missing-names.js');
    console.error('e depois move o JSON descarregado de Downloads para data-archive/.');
    process.exit(1);
  }
}

const data = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const resolvedHits = (data.results || []).filter(r => r.resolved && r.name);
console.log(`▶ Resolved-missing-names.json: ${data.results?.length || 0} mids processados, ${resolvedHits.length} com nome resolvido`);

if (!resolvedHits.length) {
  console.log('Nada para aplicar — sai.');
  process.exit(0);
}

// Construir Map<mid, {name, country}>
const toApply = new Map();
for (const r of resolvedHits) {
  toApply.set(String(r.mid), { name: r.name, country: r.country || '' });
}

// Varrer ficheiros member-history
const memberFiles = glob.sync(path.join(DIR_ARCHIVE, 'uskids-member-history-*.json')).sort();
console.log(`▶ A varrer ${memberFiles.length} ficheiros member-history…`);

const summary = {
  gerado_em: new Date().toISOString(),
  total_to_apply: toApply.size,
  total_applied: 0,
  total_skipped_already_named: 0,
  total_not_found: 0,
  applied_by_file: {},
  applied_details: [],
  skipped_details: [],
  not_found: [],
};

const fileModifications = new Map(); // filename → {data, dirty}
const midsFound = new Set();

for (const fn of memberFiles) {
  let d;
  try { d = JSON.parse(fs.readFileSync(fn, 'utf8')); } catch (e) {
    console.warn(`  ⚠️ ${path.basename(fn)}: ${e.message.slice(0, 80)}`);
    continue;
  }
  let dirty = false;
  for (const [mid, info] of toApply.entries()) {
    if (midsFound.has(mid)) continue; // já tratado noutro ficheiro
    const player = d.jogadores?.[mid];
    if (!player) continue;
    midsFound.add(mid);

    const currentName = player.name;
    const hasGoodName = currentName && currentName !== '?' && currentName.trim() !== '';

    if (hasGoodName && !FORCE) {
      summary.total_skipped_already_named++;
      summary.skipped_details.push({ mid, file: path.basename(fn), existing: currentName, would_set: info.name });
      continue;
    }

    player.name = info.name;
    if (info.country && !player.country) player.country = info.country;
    summary.total_applied++;
    summary.applied_by_file[path.basename(fn)] = (summary.applied_by_file[path.basename(fn)] || 0) + 1;
    summary.applied_details.push({ mid, file: path.basename(fn), previous: currentName || '(vazio)', new_name: info.name, new_country: info.country });
    dirty = true;
  }
  if (dirty) fileModifications.set(fn, d);
}

// mids no source mas que não foram encontrados em nenhum ficheiro
for (const mid of toApply.keys()) {
  if (!midsFound.has(mid)) {
    summary.total_not_found++;
    summary.not_found.push(mid);
  }
}

console.log(`\n▶ Resumo:`);
console.log(`  Aplicados:                ${summary.total_applied}`);
console.log(`  Já tinham nome (skipped): ${summary.total_skipped_already_named}`);
console.log(`  Não encontrados:          ${summary.total_not_found}`);
console.log(`  Ficheiros a modificar:    ${fileModifications.size}`);

if (summary.total_applied > 0 && APPLY) {
  for (const [fn, d] of fileModifications) {
    fs.writeFileSync(fn, JSON.stringify(d, null, 2));
    console.log(`  ✓ ${path.basename(fn)}: +${summary.applied_by_file[path.basename(fn)]} nomes`);
  }
}

fs.writeFileSync(REPORT, JSON.stringify(summary, null, 2));
console.log(`\n  → Relatório: ${REPORT}`);

if (!APPLY) {
  console.log(`\nDRY-RUN — para aplicar: node scripts/integrate-resolved-names.js --apply`);
  if (summary.total_skipped_already_named > 0) {
    console.log(`         (--force para sobrescrever nomes existentes)`);
  }
  console.log('\nExemplos de mudanças propostas:');
  for (const e of summary.applied_details.slice(0, 10)) {
    console.log(`  ${e.mid.padStart(8)}  "${e.previous}" → "${e.new_name}" (${e.new_country})  em ${e.file}`);
  }
} else {
  console.log(`\n✓ Pronto. Próximo passo: \`node scripts/build-member-history-slim.js\` para regenerar slim.`);
}
