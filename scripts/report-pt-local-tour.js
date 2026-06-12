'use strict';

/**
 * report-pt-local-tour.js
 *
 * Gera um relatório legível dos 6 torneios USKids Local Tour PT 2023,
 * agrupado por (torneio × escalão), com place / country / strokes / nome
 * (quando resolvido via 46 ficheiros existentes).
 *
 * Inputs:
 *   data-archive/uskids-pt-local-tour-history.json
 *   data-archive/uskids-member-history-*.json  (para nomes)
 *
 * Outputs:
 *   data-archive/uskids-pt-local-tour-report.json
 *   data-archive/uskids-pt-local-tour-report.md
 *
 * Uso:  node scripts/report-pt-local-tour.js
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const DIR_ARCHIVE = path.join(__dirname, '..', 'data-archive');
const HIST_PATH     = path.join(DIR_ARCHIVE, 'uskids-pt-local-tour-history.json');
const RESOLVED_PATH = path.join(DIR_ARCHIVE, 'uskids-pt-local-tour-resolved.json');
const OUT_JSON      = path.join(DIR_ARCHIVE, 'uskids-pt-local-tour-report.json');
const OUT_MD        = path.join(DIR_ARCHIVE, 'uskids-pt-local-tour-report.md');

const TARGET = ['13702','13703','13704','13705','13706','13707'];
const TORN_NAME = {
  '13702': 'Dolce Campo Real (22/Jan/2023)',
  '13703': 'Ribagolfe Oaks (28/Jan/2023)',
  '13704': 'Ribagolfe Lakes (29/Jan/2023)',
  '13705': 'Ribagolfe Oaks (25/Fev/2023)',
  '13706': 'Ribagolfe Lakes (26/Fev/2023)',
  '13707': 'Dolce Campo Real – Tour Championship (16/Abr/2023)',
};

(async () => {
  const ptHist = JSON.parse(fs.readFileSync(HIST_PATH, 'utf8'));
  console.log(`▶ ${Object.keys(ptHist.jogadores).length} mids no histórico PT\n`);

  // Carregar nomes resolvidos por ordem de prioridade:
  // 1. history.json (a versão nova do fetch já propaga nomes via strokes match)
  // 2. resolved.json (output do resolve-pt-local-tour-names.js)
  // 3. lookup directo nos 46 ficheiros
  const nameByMid = new Map();

  // 1. history.json directo (tem nomes propagados pelo fetch v3)
  for (const [mid, p] of Object.entries(ptHist.jogadores || {})) {
    if (p.name) {
      nameByMid.set(mid, { name: p.name, country: p.country || '', via: 'history-strokes' });
    }
  }
  let fromHist = nameByMid.size;

  // 2. resolved.json (caso o fetch v3 não tenha resolvido tudo)
  if (fs.existsSync(RESOLVED_PATH)) {
    const resolved = JSON.parse(fs.readFileSync(RESOLVED_PATH, 'utf8'));
    for (const j of resolved.jogadores || []) {
      if (j.name && !nameByMid.has(String(j.memberID))) {
        nameByMid.set(String(j.memberID), { name: j.name, country: j.country || '', via: j.resolvedBy });
      }
    }
  }
  let fromResolved = nameByMid.size - fromHist;

  // 3. lookup directo nos 46 ficheiros (último recurso)
  const memberFiles = glob.sync(path.join(DIR_ARCHIVE, 'uskids-member-history-*.json'));
  for (const fn of memberFiles) {
    let d;
    try { d = JSON.parse(fs.readFileSync(fn, 'utf8')); } catch { continue; }
    for (const mid of Object.keys(ptHist.jogadores)) {
      if (nameByMid.has(mid)) continue;
      const p = d.jogadores?.[mid];
      if (p && p.name && p.name !== '?') {
        nameByMid.set(mid, { name: p.name, country: p.country || '', via: 'direct' });
      }
    }
  }
  let fromDirect = nameByMid.size - fromHist - fromResolved;

  console.log(`  Nomes resolvidos: ${nameByMid.size} (history: ${fromHist}, resolved.json: ${fromResolved}, lookup: ${fromDirect})`);

  // Construir buckets (tcode × ageGroup)
  const buckets = {}; // tcode → ageGroup → [{mid, name, country, place, strokes, gross}]

  for (const [mid, p] of Object.entries(ptHist.jogadores)) {
    const known = nameByMid.get(mid);
    const knownName = known?.name || null;
    const knownCountry = known?.country || p.country || null;

    for (const tid of TARGET) {
      const t = p.torneios?.[tid];
      if (!t) continue;
      const ag = t.ageGroup || '?';
      buckets[tid] = buckets[tid] || {};
      buckets[tid][ag] = buckets[tid][ag] || [];
      // R1 e R2 grosses
      const rounds = t.rounds || {};
      const rkeys = Object.keys(rounds).sort();
      const grosses = rkeys.map(rk => rounds[rk].gross).filter(g => g != null);
      const strokesR1 = rounds[rkeys[0]]?.strokes || [];
      buckets[tid][ag].push({
        mid,
        name: knownName || '???',
        country: knownCountry || '?',
        place: t.place ?? '?',
        status: t.status,
        totalStrokes: t.totalStrokes,
        grosses,
        strokesR1: strokesR1.slice(0, 18),
        resolved: !!knownName
      });
    }
  }

  // Ordenar dentro de cada bucket por place
  for (const tid of Object.keys(buckets)) {
    for (const ag of Object.keys(buckets[tid])) {
      buckets[tid][ag].sort((a, b) => {
        const pa = Number(a.place) || 999;
        const pb = Number(b.place) || 999;
        return pa - pb;
      });
    }
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify({
    gerado_em: new Date().toISOString(),
    torneios: TORN_NAME,
    buckets,
    resumo: {
      mids_totais: Object.keys(ptHist.jogadores).length,
      mids_resolvidos: nameByMid.size,
      mids_pendentes: Object.keys(ptHist.jogadores).length - nameByMid.size,
    }
  }, null, 2));
  console.log(`  → ${OUT_JSON}`);

  // Markdown report
  const md = [];
  md.push(`# USKids Local Tour Portugal 2023 — Participantes\n`);
  md.push(`Gerado: ${new Date().toISOString()}\n`);
  md.push(`Total: ${Object.keys(ptHist.jogadores).length} memberIDs únicos`);
  md.push(`Resolvidos: ${nameByMid.size} | Pendentes: ${Object.keys(ptHist.jogadores).length - nameByMid.size}\n`);

  // Tabela master: por torneio, por escalão
  for (const tid of TARGET) {
    md.push(`\n## ${TORN_NAME[tid]} (tcode ${tid})\n`);
    const torn = buckets[tid] || {};
    const ags = Object.keys(torn).sort();
    if (!ags.length) { md.push(`*sem dados*\n`); continue; }
    for (const ag of ags) {
      const rows = torn[ag];
      md.push(`### ${ag} — ${rows.length} jogador${rows.length === 1 ? '' : 'es'}\n`);
      md.push(`| Pos | Nome | País | mid | Rondas | Total |`);
      md.push(`|----:|------|:---:|-----|:------:|:-----:|`);
      for (const r of rows) {
        const ind = r.resolved ? '' : '⚠️ ';
        const grosses = r.grosses.join('+') || '—';
        md.push(`| ${r.place} | ${ind}${r.name} | ${r.country} | \`${r.mid}\` | ${grosses} | ${r.totalStrokes ?? '—'} |`);
      }
      md.push('');
    }
  }

  // Resumo por mid (vista alternativa: 1 linha por jogador)
  md.push(`\n## Resumo por jogador\n`);
  md.push(`| mid | Nome | País | Idade média | Torneios PT | Histórico USKids |`);
  md.push(`|-----|------|:---:|:----------:|:-----------:|:----------------:|`);
  const rows = [];
  for (const [mid, p] of Object.entries(ptHist.jogadores)) {
    const known = nameByMid.get(mid);
    const ptCount = TARGET.filter(t => p.torneios?.[t]).length;
    rows.push({
      mid,
      name: known?.name || '???',
      country: known?.country || p.country || '?',
      ageGroup: p.ageGroup || '?',
      ptCount,
      total: p.totalTorneios || 0,
      resolved: !!known
    });
  }
  rows.sort((a, b) => (a.country.localeCompare(b.country) || (b.ptCount - a.ptCount) || a.name.localeCompare(b.name)));
  for (const r of rows) {
    const ind = r.resolved ? '' : '⚠️ ';
    md.push(`| \`${r.mid}\` | ${ind}${r.name} | ${r.country} | ${r.ageGroup} | ${r.ptCount}/6 | ${r.total} |`);
  }

  fs.writeFileSync(OUT_MD, md.join('\n'));
  console.log(`  → ${OUT_MD}`);
  console.log(`\n✓ Pronto. Abre o .md para veres a tabela.`);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
