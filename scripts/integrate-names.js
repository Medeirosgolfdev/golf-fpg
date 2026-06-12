'use strict';
// Versao limpa de integrate-resolved-names.js que aceita o ficheiro final
// (resolved-missing-names.json) OU o ultimo checkpoint cumulativo
// (resolved-missing-names-checkpoint-XXX.json). Escolhe o que tem MAIS results.
//
// Uso:
//   node scripts/integrate-names.js              (dry-run)
//   node scripts/integrate-names.js --apply      (escreve)
//   node scripts/integrate-names.js --apply --force (sobrescreve nomes existentes)
//
// Output:
//   - N ficheiros uskids-member-history-XXX.json modificados
//   - data-archive/integrate-names-report.json com sumario

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

const ROOT = path.join(__dirname, '..');
const DIR_ARCHIVE = path.join(ROOT, 'data-archive');
const SOURCE = path.join(DIR_ARCHIVE, 'resolved-missing-names.json');
const REPORT = path.join(DIR_ARCHIVE, 'integrate-names-report.json');

const home = process.env.USERPROFILE || process.env.HOME || '';
const searchDirs = [
  DIR_ARCHIVE,
  path.join(home, 'Downloads'),
  path.join(home, 'Transferencias'),
].filter(function (d) { try { return fs.existsSync(d); } catch (e) { return false; } });

function listCandidates() {
  const out = [];
  for (const dir of searchDirs) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch (e) { continue; }
    for (const f of entries) {
      if (f === 'resolved-missing-names.json' || /^resolved-missing-names-checkpoint-\d+\.json$/.test(f)) {
        const full = path.join(dir, f);
        try {
          const st = fs.statSync(full);
          const d = JSON.parse(fs.readFileSync(full, 'utf8'));
          const count = Array.isArray(d.results) ? d.results.length : 0;
          const resolved = Array.isArray(d.results) ? d.results.filter(function (r) { return r.resolved; }).length : 0;
          out.push({ full: full, dir: dir, name: f, mtime: st.mtimeMs, count: count, resolved: resolved });
        } catch (e) {}
      }
    }
  }
  return out;
}

const cands = listCandidates();
if (!cands.length) {
  console.error('ERRO: nenhum resolved-missing-names*.json encontrado.');
  console.error('Faz o scrape: F12 -> cola scripts/browser-resolve-829.js, aguarda ~55min.');
  process.exit(1);
}
cands.sort(function (a, b) { return b.count - a.count || b.mtime - a.mtime; });
const chosen = cands[0];
console.log('> Candidatos resolved-names: ' + cands.length);
for (const c of cands) {
  const tag = c === chosen ? '*' : ' ';
  console.log('  ' + tag + ' ' + c.name.padEnd(48) + ' ' + String(c.count).padStart(4) + 'r/' + String(c.resolved).padStart(4) + 'res  (' + path.basename(c.dir) + ')');
}

if (chosen.full !== SOURCE) {
  fs.copyFileSync(chosen.full, SOURCE);
  console.log('> Copiado ' + chosen.full + ' -> ' + SOURCE);
}

const data = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const resolvedHits = (data.results || []).filter(function (r) { return r.resolved && r.name; });
console.log('> resolved-missing-names.json: ' + (data.results || []).length + ' processados, ' + resolvedHits.length + ' com nome resolvido');

if (!resolvedHits.length) {
  console.log('Nada para aplicar - sai.');
  process.exit(0);
}

const toApply = new Map();
for (const r of resolvedHits) {
  toApply.set(String(r.mid), { name: r.name, country: r.country || '' });
}

const memberFiles = glob.sync(path.join(DIR_ARCHIVE, 'uskids-member-history-*.json')).sort();
console.log('> A varrer ' + memberFiles.length + ' ficheiros member-history...');

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

const fileModifications = new Map();
const midsFound = new Set();

for (const fn of memberFiles) {
  let d;
  try { d = JSON.parse(fs.readFileSync(fn, 'utf8')); } catch (e) { continue; }
  let dirty = false;
  for (const [mid, info] of toApply.entries()) {
    if (midsFound.has(mid) && !FORCE) continue;
    const player = d.jogadores ? d.jogadores[mid] : null;
    if (!player) continue;
    midsFound.add(mid);

    const currentName = player.name;
    const hasGoodName = currentName && currentName !== '?' && currentName.trim() !== '';

    if (hasGoodName && !FORCE) {
      summary.total_skipped_already_named++;
      summary.skipped_details.push({ mid: mid, file: path.basename(fn), existing: currentName, would_set: info.name });
      continue;
    }

    player.name = info.name;
    if (info.country && !player.country) player.country = info.country;
    summary.total_applied++;
    summary.applied_by_file[path.basename(fn)] = (summary.applied_by_file[path.basename(fn)] || 0) + 1;
    summary.applied_details.push({ mid: mid, file: path.basename(fn), previous: currentName || '(vazio)', new_name: info.name, new_country: info.country });
    dirty = true;
  }
  if (dirty) fileModifications.set(fn, d);
}

for (const mid of toApply.keys()) {
  if (!midsFound.has(mid)) {
    summary.total_not_found++;
    summary.not_found.push(mid);
  }
}

console.log('');
console.log('> Resumo:');
console.log('  Aplicados:                ' + summary.total_applied);
console.log('  Ja tinham nome (skipped): ' + summary.total_skipped_already_named);
console.log('  Nao encontrados:          ' + summary.total_not_found);
console.log('  Ficheiros a modificar:    ' + fileModifications.size);

if (summary.total_applied > 0 && APPLY) {
  for (const [fn, d] of fileModifications) {
    fs.writeFileSync(fn, JSON.stringify(d, null, 2));
    console.log('  > ' + path.basename(fn) + ': +' + summary.applied_by_file[path.basename(fn)] + ' nomes');
  }
}

fs.writeFileSync(REPORT, JSON.stringify(summary, null, 2));
console.log('');
console.log('  -> Relatorio: ' + REPORT);

if (!APPLY) {
  console.log('');
  console.log('DRY-RUN - para aplicar: node scripts/integrate-names.js --apply');
  if (summary.total_skipped_already_named > 0) {
    console.log('         (--force para sobrescrever nomes existentes)');
  }
  console.log('');
  console.log('Exemplos de mudancas propostas (primeiras 10):');
  for (const e of summary.applied_details.slice(0, 10)) {
    console.log('  ' + e.mid.padStart(8) + '  "' + e.previous + '" -> "' + e.new_name + '" (' + e.new_country + ')  em ' + e.file);
  }
} else {
  console.log('');
  console.log('OK Pronto. Proximo passo: node scripts/build-member-history-slim.js (regenerar slim).');
}
