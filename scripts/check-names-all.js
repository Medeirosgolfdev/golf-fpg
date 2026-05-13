'use strict';
// check-names-all.js (v2: aceita multi-bucket via sufixos A/B/C/...)
// Versao actualizada de check-names.js que cruza TODOS os verified-names*.json
// (final + checkpoints + buckets A/B/C) com a cache. Dedup automatico por mid
// (preferindo o resolvido pela API se houver multiplas entradas).
//
// Pattern de ficheiros aceites:
//   verified-names.json                         (familia legacy)
//   verified-names-checkpoint-NNN.json
//   verified-names-A.json                       (bucket A)
//   verified-names-A-checkpoint-NNNN.json
//   verified-names-B.json                       (bucket B)
//   ...
//
// Procura em data-archive + Downloads. Para cada familia escolhe o ficheiro
// com mais results (defensivo contra checkpoints parciais).
//
// Uso:
//   node scripts/check-names-all.js

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const ROOT = path.join(__dirname, '..');
const DIR_ARCHIVE = path.join(ROOT, 'public', 'data-archive');
const REPORT = path.join(DIR_ARCHIVE, 'check-names-all-report.json');

const home = process.env.USERPROFILE || process.env.HOME || '';
const searchDirs = [
  DIR_ARCHIVE,
  path.join(home, 'Downloads'),
  path.join(home, 'Transferencias'),
].filter(function (d) { try { return fs.existsSync(d); } catch (e) { return false; } });

const FILE_RX = /^verified-names(?:-([A-Z]\d*))?(?:-checkpoint-\d+)?\.json$/;

function familyKey(filename) {
  const m = filename.match(FILE_RX);
  if (!m) return null;
  return m[1] || '_';
}

function listCandidates() {
  const out = [];
  for (const dir of searchDirs) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch (e) { continue; }
    for (const f of entries) {
      const fam = familyKey(f);
      if (fam == null) continue;
      const full = path.join(dir, f);
      try {
        const st = fs.statSync(full);
        const d = JSON.parse(fs.readFileSync(full, 'utf8'));
        const count = Array.isArray(d.results) ? d.results.length : 0;
        out.push({ full: full, dir: dir, name: f, family: fam, mtime: st.mtimeMs, count: count });
      } catch (e) {}
    }
  }
  return out;
}

const cands = listCandidates();
if (!cands.length) {
  console.error('ERRO: nenhum verified-names*.json encontrado.');
  process.exit(1);
}

const families = new Map();
for (const c of cands) {
  if (!families.has(c.family)) families.set(c.family, []);
  families.get(c.family).push(c);
}
const chosen = [];
console.log('> Candidatos: ' + cands.length + ' (' + families.size + ' familias)');
for (const [fam, list] of families) {
  list.sort(function (a, b) { return b.count - a.count || b.mtime - a.mtime; });
  const winner = list[0];
  chosen.push(winner);
  console.log('  Familia ' + (fam === '_' ? '(legacy)' : fam) + ':');
  for (const c of list) {
    const tag = c === winner ? '*' : ' ';
    console.log('    ' + tag + ' ' + c.name.padEnd(48) + ' ' + String(c.count).padStart(4) + 'r  (' + path.basename(c.dir) + ')');
  }
}

const allResults = new Map();
for (const c of chosen) {
  const d = JSON.parse(fs.readFileSync(c.full, 'utf8'));
  for (const r of (d.results || [])) {
    const mid = String(r.mid);
    const existing = allResults.get(mid);
    if (!existing || (!existing.resolved && r.resolved)) {
      allResults.set(mid, Object.assign({}, r, { _from: c.name }));
    }
  }
}
console.log('> Merge -> ' + allResults.size + ' mids unicos verificados');

const cacheMap = new Map();
const files = glob.sync(path.join(DIR_ARCHIVE, 'uskids-member-history-*.json')).sort();
console.log('> A varrer ' + files.length + ' ficheiros member-history...');
for (const fn of files) {
  let d; try { d = JSON.parse(fs.readFileSync(fn, 'utf8')); } catch (e) { continue; }
  const fileLabel = path.basename(fn);
  for (const entry of Object.entries(d.jogadores || {})) {
    const mid = entry[0];
    const p = entry[1];
    if (!cacheMap.has(mid)) cacheMap.set(mid, []);
    cacheMap.get(mid).push({ name: p.name, country: p.country, file: fileLabel });
  }
}

function normalize(s) {
  if (!s) return '';
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const summary = {
  gerado_em: new Date().toISOString(),
  total: allResults.size,
  resolved_by_api: 0,
  match_exact: 0,
  match_normalized: 0,
  mismatch: 0,
  not_in_cache: 0,
  api_unresolved: 0,
  details: [],
};

for (const [, r] of allResults) {
  const mid = String(r.mid);
  const apiName = r.resolved ? (r.name || '').trim() : null;
  const cacheEntries = cacheMap.get(mid) || [];

  if (!r.resolved) {
    summary.api_unresolved++;
    summary.details.push({ mid: mid, status: 'api_unresolved', reason: r.reason, _from: r._from });
    continue;
  }
  summary.resolved_by_api++;

  if (!cacheEntries.length) {
    summary.not_in_cache++;
    summary.details.push({ mid: mid, status: 'not_in_cache', api: apiName, country: r.country, _from: r._from });
    continue;
  }

  const cacheNames = Array.from(new Set(cacheEntries.map(function (c) { return c.name; }).filter(Boolean)));
  const cacheNorm = new Set(cacheNames.map(normalize));
  const apiNorm = normalize(apiName);
  const exact = cacheNames.filter(function (n) { return n === apiName; });

  let status;
  if (exact.length === cacheNames.length && cacheNames.length > 0) {
    status = 'match_exact';
    summary.match_exact++;
  } else if (cacheNorm.has(apiNorm)) {
    status = 'match_normalized';
    summary.match_normalized++;
  } else {
    status = 'mismatch';
    summary.mismatch++;
  }
  summary.details.push({ mid: mid, status: status, api: apiName, cache: cacheNames, _from: r._from });
}

console.log('');
console.log('> Resultados nao-exactos:');
let nNonExact = 0;
for (const d of summary.details) {
  if (d.status === 'match_exact') continue;
  nNonExact++;
  if (d.status === 'mismatch') {
    console.log('  XX ' + d.mid + ' cache="' + (d.cache || []).join(' | ') + '" vs api="' + d.api + '" MISMATCH');
  } else if (d.status === 'match_normalized') {
    console.log('  ~= ' + d.mid + ' cache="' + (d.cache || []).join(' | ') + '" vs api="' + d.api + '"');
  } else if (d.status === 'not_in_cache') {
    console.log('  ADD ' + d.mid + ' ' + d.api + ' (' + (d.country || '?') + ')');
  } else if (d.status === 'api_unresolved') {
    console.log('  NA ' + d.mid + ' (' + (d.reason || '-') + ')');
  }
}
if (!nNonExact) console.log('  (todos os mids tiveram match exacto)');

console.log('');
console.log('> Sumario consolidado:');
console.log('  Total mids unicos:   ' + summary.total);
console.log('  API resolveu:        ' + summary.resolved_by_api);
console.log('  API nao resolveu:    ' + summary.api_unresolved);
console.log('  Match exacto:        ' + summary.match_exact);
console.log('  Match normalizado:   ' + summary.match_normalized);
console.log('  Mismatch:            ' + summary.mismatch);
console.log('  Nao na cache:        ' + summary.not_in_cache);

fs.writeFileSync(REPORT, JSON.stringify(summary, null, 2));
console.log('');
console.log('  -> Relatorio: ' + REPORT);
