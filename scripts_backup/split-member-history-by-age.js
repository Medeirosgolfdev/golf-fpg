/**
 * split-member-history-by-age.js
 *
 * Lê todos os uskids-member-history-XXX.json e reorganiza por escalão,
 * mantendo ~75 jogadores por ficheiro.
 *
 * Output (em public/data/):
 *   uskids-mh-b6b8-001.json, -002.json, ...
 *   uskids-mh-b9b10-001.json, -002.json, ...
 *   uskids-mh-b11b12-001.json, -002.json, ...
 *   uskids-mh-b13-001.json, ...
 *   uskids-mh-b14plus-001.json, ...
 *
 * Todos os jogadores são mantidos (incluindo sem nome) — para match futuro.
 *
 * Uso: node scripts/split-member-history-by-age.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DIR         = path.join(__dirname, '..', 'public', 'data');
const PART_PREFIX = 'uskids-member-history-';
const PART_SIZE   = 75;

const GRUPOS = [
  { prefix: 'uskids-player-history-b6b8',    label: 'Boys 6-8',   minAge: 0,  maxAge: 8  },
  { prefix: 'uskids-player-history-b9b10',   label: 'Boys 9-10',  minAge: 9,  maxAge: 10 },
  { prefix: 'uskids-player-history-b11b12',  label: 'Boys 11-12', minAge: 11, maxAge: 12 },
  { prefix: 'uskids-player-history-b13',     label: 'Boys 13',    minAge: 13, maxAge: 13 },
  { prefix: 'uskids-player-history-b14plus', label: 'Boys 14+',   minAge: 14, maxAge: 99 },
];

function minAgeFromGroup(ag) {
  if (!ag) return null;
  const m = ag.match(/boys\s+(\d+)/i);
  return m ? parseInt(m[1]) : null;
}

/** Grupo de um jogador = idade MÁXIMA ≥9 que jogou (para não perder jogadores
 *  que jogaram muitos torneios novos mas depois subiram de escalão).
 *  Se nunca jogou ≥9, usa a idade dominante (mais frequente). */
function dominantMinAge(jogador) {
  const idades = {};
  for (const t of Object.values(jogador.torneios || {})) {
    const age = minAgeFromGroup(t.ageGroup);
    if (age != null) idades[age] = (idades[age] || 0) + 1;
  }
  const entries = Object.entries(idades);
  if (!entries.length) return null;
  // Preferir idade máxima entre 9-13
  const relevant = entries.filter(([a]) => parseInt(a) >= 9 && parseInt(a) <= 13);
  if (relevant.length) {
    return parseInt(relevant.sort((a,b) => parseInt(b[0])-parseInt(a[0]))[0][0]);
  }
  // Fallback: dominante (para quem nunca jogou ≥9)
  return parseInt(entries.sort((a,b) => b[1]-a[1])[0][0]);
}

// ── Apagar ficheiros de output anteriores ────────────────────────
for (const g of GRUPOS) {
  let n = 1;
  while (true) {
    const p = path.join(DIR, `${g.prefix}-${String(n).padStart(3,'0')}.json`);
    if (!fs.existsSync(p)) break;
    fs.unlinkSync(p);
    n++;
  }
}

// ── Carregar todos os ficheiros existentes ───────────────────────
console.log('\n📂 A carregar ficheiros de member history...');
let torneios = {};
let jogadores = {};
let nFicheiros = 0;
let n = 1;
while (true) {
  const p = path.join(DIR, `${PART_PREFIX}${String(n).padStart(3,'0')}.json`);
  if (!fs.existsSync(p)) break;
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    Object.assign(torneios, d.torneios || {});
    Object.assign(jogadores, d.jogadores || {});
    nFicheiros++;
  } catch(e) { console.error(`  ⚠️  Erro: ${e.message}`); }
  n++;
}
const totalJog = Object.keys(jogadores).length;
console.log(`  ${nFicheiros} ficheiros | ${totalJog} jogadores | ${Object.keys(torneios).length} torneios`);

// ── Distribuir jogadores pelos grupos ────────────────────────────
const gruposJog = GRUPOS.map(g => ({ ...g, ids: [] }));
let semGrupo = 0;

for (const [mid] of Object.entries(jogadores)) {
  const jog = jogadores[mid];
  const age = dominantMinAge(jog);
  if (age == null) {
    // Sem escalão definido → colocar no grupo mais próximo dos que tem torneios
    // (manter no b9b10 como fallback para não perder)
    const grpFallback = gruposJog.find(g => g.prefix === 'uskids-player-history-b9b10');
    if (grpFallback) grpFallback.ids.push(mid);
    else semGrupo++;
    continue;
  }
  const grp = gruposJog.find(g => age >= g.minAge && age <= g.maxAge);
  if (grp) grp.ids.push(mid);
  else semGrupo++;
}

// ── Escrever ficheiros por escalão em partes de ~75 ──────────────
console.log('\n💾 A escrever ficheiros por escalão...\n');
let totalFicheiros = 0;

for (const g of gruposJog) {
  if (g.ids.length === 0) {
    console.log(`  ⏭️  ${g.label}: 0 jogadores`);
    continue;
  }

  let part = 1;
  for (let i = 0; i < g.ids.length; i += PART_SIZE) {
    const chunk = g.ids.slice(i, i + PART_SIZE);
    const chunkJog = {};
    const chunkTorn = {};

    for (const mid of chunk) {
      chunkJog[mid] = jogadores[mid];
      for (const tid of Object.keys(jogadores[mid].torneios || {})) {
        if (torneios[tid] && !chunkTorn[tid]) chunkTorn[tid] = torneios[tid];
      }
    }

    const outPath = path.join(DIR, `${g.prefix}-${String(part).padStart(3,'0')}.json`);
    fs.writeFileSync(outPath, JSON.stringify({
      gerado_em: new Date().toISOString(),
      label: g.label,
      minAge: g.minAge,
      maxAge: g.maxAge,
      torneios: chunkTorn,
      jogadores: chunkJog,
    }), 'utf8');
    part++;
    totalFicheiros++;
  }

  const nParts = part - 1;
  const kb = g.ids.length; // aprox
  console.log(`  ✅  ${g.prefix.padEnd(25)} ${String(g.ids.length).padStart(5)} jog → ${nParts} ficheiro${nParts>1?'s':''}`);
}

if (semGrupo > 0) console.log(`\n  ⚠️  ${semGrupo} jogadores não distribuídos`);
console.log(`\n🏁 Concluído! ${totalFicheiros} ficheiros criados (${totalJog} jogadores no total)`);
