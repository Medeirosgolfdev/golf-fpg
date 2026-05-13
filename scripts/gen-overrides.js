'use strict';
// gen-overrides.js
// Le resolved-missing-names.json (output do browser-resolve-829.js MODE: RESOLVE)
// e produz public/data-archive/resolved-names-overrides.json — um mapping
// pequeno (~30KB) {mid: {name, country, via}} que o build-slim-with-overrides
// usa para preencher nomes "?" sem precisar de tocar nos chunks de 89 MB.
//
// Auto-detecta resolved-missing-names.json em Downloads ou data-archive
// (escolhe o de maior count). Tambem aceita checkpoints.
//
// Uso:
//   node scripts/gen-overrides.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR_ARCHIVE = path.join(ROOT, 'public', 'data-archive');
const OUT = path.join(DIR_ARCHIVE, 'resolved-names-overrides.json');

const home = process.env.USERPROFILE || process.env.HOME || '';
const dirs = [
  DIR_ARCHIVE,
  path.join(home, 'Downloads'),
  path.join(home, 'Transferencias'),
].filter(function (d) { try { return fs.existsSync(d); } catch (e) { return false; } });

const FILE_RX = /^resolved-missing-names(?:-checkpoint-\d+)?\.json$/;

function listCandidates() {
  const out = [];
  for (const dir of dirs) {
    let entries; try { entries = fs.readdirSync(dir); } catch (e) { continue; }
    for (const f of entries) {
      if (!FILE_RX.test(f)) continue;
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
  return out;
}

const cands = listCandidates();
if (!cands.length) {
  console.error('ERRO: nenhum resolved-missing-names*.json encontrado.');
  process.exit(1);
}
cands.sort(function (a, b) { return b.resolved - a.resolved || b.mtime - a.mtime; });
const chosen = cands[0];
console.log('> Candidatos: ' + cands.length);
for (const c of cands) {
  const tag = c === chosen ? '*' : ' ';
  console.log('  ' + tag + ' ' + c.name.padEnd(48) + ' ' + String(c.resolved).padStart(4) + '/' + String(c.count).padStart(4) + 'res  (' + path.basename(c.dir) + ')');
}

const data = JSON.parse(fs.readFileSync(chosen.full, 'utf8'));
const overrides = {};
let n = 0;
for (const r of (data.results || [])) {
  if (!r.resolved || !r.name) continue;
  const mid = String(r.mid);
  overrides[mid] = { name: r.name, country: (r.country || '').toUpperCase(), via: r.via || null };
  n++;
}

const out = {
  gerado_em: new Date().toISOString(),
  source: chosen.name,
  total: n,
  overrides: overrides,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('> Escrito ' + OUT);
console.log('  ' + n + ' overrides (mid -> name) gravados (' + Math.round(fs.statSync(OUT).size / 1024) + ' KB)');
console.log('');
console.log('Proximo passo: node scripts/build-slim-with-overrides.js');
