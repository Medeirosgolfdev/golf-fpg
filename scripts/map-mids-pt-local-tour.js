'use strict';

/**
 * map-mids-pt-local-tour.js
 *
 * Cruza o ficheiro canónico de nomes (scrape directo via Chrome do signupanytime)
 * com o history.json dos 34 mids descobertos. Resolve mid → nome definitivamente
 * via match por (tcode, ageGroup, gross).
 *
 * Output: public/data-archive/uskids-pt-local-tour-final.json
 *   {
 *     gerado_em, total, jogadores: [{ memberID, name, country, ptTorneios:[...] }]
 *   }
 *
 * Uso:  node scripts/map-mids-pt-local-tour.js
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'public', 'data-archive');
const CANONICAL = path.join(DIR, 'uskids-pt-local-tour-2023-canonical.json');
const HISTORY   = path.join(DIR, 'uskids-pt-local-tour-history.json');
const OUT       = path.join(DIR, 'uskids-pt-local-tour-final.json');
const OUT_MD    = path.join(DIR, 'uskids-pt-local-tour-final.md');

const TARGET = ['13702','13703','13704','13705','13706','13707'];
const TORN_LABEL = {
  '13702': 'Dolce Campo Real (22/Jan/2023)',
  '13703': 'Ribagolfe Oaks (28/Jan/2023)',
  '13704': 'Ribagolfe Lakes (29/Jan/2023)',
  '13705': 'Ribagolfe Oaks (25/Fev/2023)',
  '13706': 'Ribagolfe Lakes (26/Fev/2023)',
  '13707': 'Dolce Campo Real – Tour Championship (16/Abr/2023)',
};

const canonical = JSON.parse(fs.readFileSync(CANONICAL, 'utf8'));
const history = JSON.parse(fs.readFileSync(HISTORY, 'utf8'));

// Construir índice: tcode → ageGroup → [{name, country, gross, used:false}]
const idx = {};
for (const [tcode, ag2list] of Object.entries(canonical.leaderboard)) {
  idx[tcode] = {};
  for (const [ag, players] of Object.entries(ag2list)) {
    idx[tcode][ag] = players.map(p => ({ ...p, used: false }));
  }
}

// Para cada mid em history, percorrer os 6 tcodes PT e tentar match
const out = { gerado_em: new Date().toISOString(), total: 0, jogadores: [] };
const stillUnresolved = [];

// Tracking global de nomes já atribuídos (a um mid)
const globalNameUsed = new Set();

function markNameUsedGlobally(name) {
  globalNameUsed.add(name);
  // Marcar `used: true` em TODAS as instâncias (cross-tcode) deste nome
  for (const tc of Object.keys(idx)) {
    for (const ag of Object.keys(idx[tc])) {
      for (const p of idx[tc][ag]) {
        if (p.name === name) p.used = true;
      }
    }
  }
}

// Ordenar mids pelo número de torneios PT (mais → menos) para resolver primeiro os
// mids "âncora" (presentes em muitos torneios) — facilita matching de últimos restantes
const sortedMids = Object.entries(history.jogadores || {}).sort((a, b) => {
  const aCount = TARGET.filter(tc => a[1].torneios?.[tc]).length;
  const bCount = TARGET.filter(tc => b[1].torneios?.[tc]).length;
  return bCount - aCount;
});

for (const [mid, hp] of sortedMids) {
  const ptApperances = TARGET
    .map(tc => ({ tc, t: hp.torneios?.[tc] }))
    .filter(x => x.t);

  let resolved = null;
  // Estratégia 1a: match exacto por (tcode, ageGroup, gross) ONDE O GROSS É ÚNICO
  // (evita falsos matches quando dois jogadores empatam — ex: Caleb vs Frederico 90)
  for (const { tc, t } of ptApperances) {
    const ag = t.ageGroup;
    const gross = t.totalStrokes ?? t.rounds?.[1]?.gross ?? t.rounds?.['1']?.gross;
    if (gross == null) continue;
    const pool = idx[tc]?.[ag] || [];
    const matches = pool.filter(p => !p.used && p.gross != null && Number(p.gross) === Number(gross));
    if (matches.length === 1) {
      markNameUsedGlobally(matches[0].name);
      resolved = { name: matches[0].name, country: matches[0].country, via: `${tc}:${ag}:gross=${gross}(único)` };
      break;
    }
  }

  // Estratégia 1b: match por gross mesmo com empate (último recurso, primeiro disponível)
  if (!resolved) {
    for (const { tc, t } of ptApperances) {
      const ag = t.ageGroup;
      const gross = t.totalStrokes ?? t.rounds?.[1]?.gross ?? t.rounds?.['1']?.gross;
      if (gross == null) continue;
      const pool = idx[tc]?.[ag] || [];
      const hit = pool.find(p => !p.used && p.gross != null && Number(p.gross) === Number(gross));
      if (hit) {
        markNameUsedGlobally(hit.name);
        resolved = { name: hit.name, country: hit.country, via: `${tc}:${ag}:gross=${gross}(empate)` };
        break;
      }
    }
  }

  // Estratégia 2: escalão com um único candidato (global) restante
  if (!resolved) {
    for (const { tc, t } of ptApperances) {
      const ag = t.ageGroup;
      const pool = (idx[tc]?.[ag] || []).filter(p => !p.used);
      if (pool.length === 1) {
        markNameUsedGlobally(pool[0].name);
        resolved = { name: pool[0].name, country: pool[0].country, via: `${tc}:${ag}:último restante` };
        break;
      }
    }
  }

  const ptTorneios = ptApperances.map(x => x.tc);

  if (resolved) {
    out.jogadores.push({
      memberID: mid,
      name: resolved.name,
      country: resolved.country,
      ptTorneios,
      totalTorneiosUSKids: hp.totalTorneios || 0,
      resolvedVia: resolved.via
    });
    out.total++;
  } else {
    // Diagnóstico: mostrar candidatos
    const candidates = [];
    for (const { tc, t } of ptApperances) {
      const ag = t.ageGroup;
      const remaining = (idx[tc]?.[ag] || []).filter(p => !p.used);
      candidates.push({ tc, ag, place: t.place, gross: t.totalStrokes, candidates: remaining.map(r => `${r.name}(${r.gross})`) });
    }
    stillUnresolved.push({
      memberID: mid,
      ptTorneios,
      totalTorneiosUSKids: hp.totalTorneios || 0,
      diagnostico: candidates
    });
  }
}

out.unresolved = stillUnresolved;
out.jogadores.sort((a, b) =>
  (a.country || 'zz').localeCompare(b.country || 'zz') ||
  (a.name || '').localeCompare(b.name || '')
);

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`\n✓ ${out.total}/${out.total + stillUnresolved.length} resolvidos`);
console.log(`  → ${OUT}`);

if (stillUnresolved.length) {
  console.log(`\n⚠️  ${stillUnresolved.length} pendentes:`);
  for (const u of stillUnresolved) {
    console.log(`  ${u.memberID}:`);
    for (const c of u.diagnostico) {
      console.log(`    ${c.tc} ${c.ag} place=${c.place} gross=${c.gross} → candidates: ${c.candidates.join(', ') || '(vazio)'}`);
    }
  }
}

// Markdown
const md = [];
md.push(`# USKids Local Tour Portugal 2023 — Mapeamento Final\n`);
md.push(`Gerado: ${new Date().toISOString()}`);
md.push(`Total resolvidos: ${out.total}/${out.total + stillUnresolved.length}\n`);

md.push(`## Jogadores (ordenados por país + nome)\n`);
md.push(`| memberID | Nome | País | Torneios PT | Total USKids | Via |`);
md.push(`|----------|------|:---:|:-----------:|:------------:|-----|`);
for (const j of out.jogadores) {
  md.push(`| \`${j.memberID}\` | **${j.name}** | ${j.country} | ${j.ptTorneios.length}/6 | ${j.totalTorneiosUSKids} | ${j.resolvedVia} |`);
}

if (stillUnresolved.length) {
  md.push(`\n## Pendentes ⚠️\n`);
  for (const u of stillUnresolved) {
    md.push(`- \`${u.memberID}\` — ${u.ptTorneios.join(',')} (${u.totalTorneiosUSKids} torneios totais)`);
  }
}

// Por torneio + escalão
md.push(`\n## Resultados por torneio × escalão\n`);
for (const tc of TARGET) {
  md.push(`\n### ${TORN_LABEL[tc]}\n`);
  const escs = canonical.leaderboard[tc] || {};
  for (const [ag, players] of Object.entries(escs)) {
    md.push(`**${ag}** (${players.length})`);
    for (const p of players) {
      // procurar mid para este (tc, ag, gross)
      const j = out.jogadores.find(j => j.name === p.name);
      const midStr = j ? `\`${j.memberID}\`` : '?';
      md.push(`- ${p.pos ?? '-'}. ${p.name} (${p.country}) ${p.gross ?? '—'} ${midStr}`);
    }
    md.push('');
  }
}

fs.writeFileSync(OUT_MD, md.join('\n'));
console.log(`  → ${OUT_MD}`);
