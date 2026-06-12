'use strict';

/**
 * discover-pt-tcodes.js
 *
 * Descobre tcodes do USKids Local Tour Portugal (2020-2026) varrendo o
 * histórico USKids dos jogadores PT que já temos em cache.
 *
 * Estratégia:
 *   1. Lista mids PT conhecidos (incluindo os 34 do Local Tour 2023)
 *   2. Para cada, lê o histórico em uskids-member-history-*.json + slim
 *   3. Filtra torneios cujo curso bate com nomes de campos PT
 *   4. Agrega tcodes por ano + curso
 *
 * Output: data-archive/pt-tcodes-discovered.json
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const DIR_ARCHIVE = path.join(__dirname, '..', 'data-archive');
const DIR_DATA    = path.join(__dirname, '..', 'public', 'data');
const OUT_PATH    = path.join(DIR_ARCHIVE, 'pt-tcodes-discovered.json');
const FINAL_PATH  = path.join(DIR_ARCHIVE, 'uskids-pt-local-tour-final.json');

// Whitelist de campos PT (estritamente Portugal)
const PT_KEYWORDS = [
  'ribagolfe', 'dolce campo real', 'quinta do peru', 'penha longa',
  'oitavos', 'aroeira', 'vilamoura', 'santo da serra', 'beloura',
  'lisbon sports', 'montado', 'estoril', 'troia',
  'belas clube de campo', 'belas golf',
  'sesimbra', 'palmares', 'morgado', 'amendoeira', 'salgados',
  'oeiras golf', 'vale do lobo', 'quinta do lago', 'penina',
  'quinta da marinha', 'porto', 'vidago', 'pinheiros altos',
  'monte rei', 'quinta da beloura', 'campo real',
];

// Blacklist de campos NÃO PT (para evitar falsos positivos — Madrid/Espanha)
const NOT_PT_KEYWORDS = [
  'centro nacional de golf', 'green sire', 'retamares', 'cabanillas',
  'el prat', 'real club de golf el prat',
];

function isPTcourse(s) {
  if (!s) return false;
  const lc = s.toLowerCase();
  if (NOT_PT_KEYWORDS.some(kw => lc.includes(kw))) return false;
  return PT_KEYWORDS.some(kw => lc.includes(kw));
}

// 1. Listar mids candidatos: os 34 do PT Local Tour + outros PT/ES/RU/FR vizinhos
const candidateMids = new Set();
if (fs.existsSync(FINAL_PATH)) {
  const fin = JSON.parse(fs.readFileSync(FINAL_PATH, 'utf8'));
  for (const j of fin.jogadores || []) candidateMids.add(String(j.memberID));
}
console.log(`▶ ${candidateMids.size} mids candidatos (PT Local Tour 2023)`);

// 2. Varrer todos os ficheiros member-history e o slim
const tcodeStats = new Map(); // tcode → {name, startDate, courses:Set, midsCount, hits:[mids]}

function recordTcode(tcode, tInfoFromGlobal, course, mid) {
  if (!tcodeStats.has(tcode)) {
    tcodeStats.set(tcode, {
      tcode,
      name: tInfoFromGlobal?.name || '',
      startDate: tInfoFromGlobal?.startDate || '',
      courses: new Set(),
      mids: new Set(),
    });
  }
  const st = tcodeStats.get(tcode);
  if (course) st.courses.add(course);
  st.mids.add(mid);
  if (!st.name && tInfoFromGlobal?.name) st.name = tInfoFromGlobal.name;
  if (!st.startDate && tInfoFromGlobal?.startDate) st.startDate = tInfoFromGlobal.startDate;
}

const files = glob.sync(path.join(DIR_ARCHIVE, 'uskids-member-history-*.json'));
console.log(`▶ A varrer ${files.length} ficheiros...`);

for (const fn of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(fn, 'utf8')); } catch (e) {
    console.warn(`  ⚠️ ${path.basename(fn)}: ${e.message.slice(0, 80)}`);
    continue;
  }
  const torneiosMap = d.torneios || {};

  for (const [mid, p] of Object.entries(d.jogadores || {})) {
    if (!candidateMids.has(mid)) continue; // Só candidatos
    for (const [tcode, t] of Object.entries(p.torneios || {})) {
      // Curso pode estar em t.rounds[rn].course ou herdado de torneiosMap
      let course = '';
      for (const rd of Object.values(t.rounds || {})) {
        if (rd?.course) { course = rd.course; break; }
      }
      const tGlobal = torneiosMap[tcode];
      // Critério: curso bate PT OR nome do torneio bate PT
      if (isPTcourse(course) || isPTcourse(tGlobal?.name)) {
        recordTcode(tcode, tGlobal, course, mid);
      }
    }
  }
}

// 3. Ordenar por data
function dateKey(s) {
  if (!s) return [0,0,0];
  const parts = s.split('/');
  if (parts.length === 3) return [parseInt(parts[2])||0, parseInt(parts[0])||0, parseInt(parts[1])||0];
  return [0,0,0];
}
const out = Array.from(tcodeStats.values())
  .map(s => ({
    tcode: s.tcode,
    name: s.name,
    startDate: s.startDate,
    courses: [...s.courses].sort(),
    midsCount: s.mids.size,
  }))
  .sort((a, b) => {
    const da = dateKey(a.startDate), db = dateKey(b.startDate);
    return da[0]-db[0] || da[1]-db[1] || da[2]-db[2];
  });

console.log(`\n▶ ${out.length} tcodes únicos em campos PT detectados\n`);
let prevYear = '';
for (const r of out) {
  const year = r.startDate.split('/').pop() || '?';
  if (year !== prevYear) { console.log(`\n--- ${year} ---`); prevYear = year; }
  const cs = r.courses.join(' | ').slice(0, 60);
  console.log(`  t=${String(r.tcode).padStart(6)}  ${r.startDate.padEnd(12)}  jog=${r.midsCount}  ${cs}  ${r.name ? `(${r.name.slice(0,40)})` : ''}`);
}

fs.writeFileSync(OUT_PATH, JSON.stringify({
  gerado_em: new Date().toISOString(),
  fonte: 'discover-pt-tcodes.js (cross-ref dos mids PT Local Tour 2023)',
  total: out.length,
  tcodes: out
}, null, 2));
console.log(`\n✓ ${OUT_PATH}`);
