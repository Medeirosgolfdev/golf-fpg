'use strict';

/**
 * resolve-pt-local-tour-names.js
 *
 * Pega na lista de 34 memberIDs do Local Tour PT 2023 (gerada por
 * fetch-uskids-pt-local-tour.js --with-history) e resolve os nomes via:
 *
 *   Estratégia 1: lookup directo nos 46 ficheiros uskids-member-history-XXX.json
 *                 (instantâneo, ~7 jogadores resolvidos)
 *   Estratégia 2: fingerprint de strokes — para cada mid em pt-local-tour-history,
 *                 percorrer os torneios flagship dele (Marco/Venice/Europeu...) e
 *                 fazer match contra uskids-results.json + uskids_torneios_completos*.json
 *                 onde os nomes estão (mas os mids não)
 *
 * Output: public/data-archive/uskids-pt-local-tour-resolved.json
 *   {
 *     gerado_em, total: 34, resolvidos: N, pendentes: 34-N,
 *     jogadores: [{ memberID, name, country, totalTorneiosUSKids, ptTorneios:[tids],
 *                   resolvedBy: "direct|fingerprint|none" }, ...]
 *   }
 *
 * Uso:  node scripts/resolve-pt-local-tour-names.js
 */

const fs   = require('fs');
const path = require('path');
const glob = require('glob');

const DIR_ARCHIVE = path.join(__dirname, '..', 'public', 'data-archive');
const DIR_DATA    = path.join(__dirname, '..', 'public', 'data');
const HIST_PATH   = path.join(DIR_ARCHIVE, 'uskids-pt-local-tour-history.json');
const RESULTS_PATH = path.join(DIR_DATA, 'uskids-results.json');
const OUT_PATH    = path.join(DIR_ARCHIVE, 'uskids-pt-local-tour-resolved.json');

const TARGET_PT_TIDS = ['13702', '13703', '13704', '13705', '13706', '13707'];

function strokesKey(arr) {
  if (!arr || !arr.length) return '';
  return arr.join(',');
}

(async () => {
  // 1. Carregar pt-local-tour-history (input principal)
  console.log('▶ A carregar pt-local-tour-history.json...');
  const ptHist = JSON.parse(fs.readFileSync(HIST_PATH, 'utf8'));
  const ptMids = Object.keys(ptHist.jogadores);
  console.log(`  ${ptMids.length} memberIDs PT`);

  // 2. Estratégia 1: lookup directo nos 46 ficheiros existentes
  console.log('\n▶ Estratégia 1: lookup directo nos 46 ficheiros member-history...');
  const directMatches = new Map(); // mid → {name, country, fonte}
  const memberFiles = glob.sync(path.join(DIR_ARCHIVE, 'uskids-member-history-*.json'));
  let scanned = 0;
  for (const fn of memberFiles) {
    scanned++;
    let d;
    try { d = JSON.parse(fs.readFileSync(fn, 'utf8')); } catch { continue; }
    for (const mid of ptMids) {
      if (directMatches.has(mid)) continue;
      const p = d.jogadores?.[mid];
      if (p && p.name && p.name !== '?') {
        directMatches.set(mid, {
          name: p.name,
          country: p.country || '',
          fonte: path.basename(fn)
        });
      }
    }
  }
  console.log(`  Ficheiros varridos: ${scanned}`);
  console.log(`  Matches directos: ${directMatches.size}/${ptMids.length}`);

  // 3. Estratégia 2: fingerprint de strokes
  console.log('\n▶ Estratégia 2: fingerprint de strokes contra uskids-results.json...');
  const fingerprints = new Map(); // strokesKey → {name, country, tid, round}

  if (fs.existsSync(RESULTS_PATH)) {
    const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
    for (const tourn of results.resultados || []) {
      const tid = String(tourn.t);
      for (const esc of tourn.escaloes || []) {
        for (const ronda of esc.rondas || []) {
          const rn = ronda.ronda;
          for (const j of ronda.leaderboard || []) {
            const sk = strokesKey(j.strokes);
            if (!sk) continue;
            fingerprints.set(`${tid}:R${rn}:${sk}`, {
              name: j.nome,
              country: j.pais || '',
              tid, round: rn
            });
          }
        }
      }
    }
  }

  // Também varrer uskids_torneios_completos para nomes
  const completos = glob.sync(path.join(DIR_DATA, 'uskids_torneios_completos*.json'));
  let extraFp = 0;
  for (const fn of completos) {
    let d;
    try { d = JSON.parse(fs.readFileSync(fn, 'utf8')); } catch { continue; }
    // v2 formato
    if (d.signupanytime_t) {
      const tid = String(d.signupanytime_t);
      for (const [_fid, fl] of Object.entries(d.flights || {})) {
        for (const [_pid, pl] of Object.entries(fl.flight_players || {})) {
          const name = `${(pl.first||'').trim()} ${(pl.last||'').trim()}`.trim();
          if (!name) continue;
          const country = (pl.country || '').toUpperCase();
          for (const [rkey, r] of Object.entries(pl.rounds || {})) {
            const rn = String(rkey).replace(/^r/i, '');
            const sk = strokesKey(r.strokes);
            if (sk) {
              fingerprints.set(`${tid}:R${rn}:${sk}`, { name, country, tid, round: rn });
              extraFp++;
            }
          }
        }
      }
    }
    // v1 formato
    if (Array.isArray(d)) {
      for (const t of d) {
        const tid = String(t.t || '');
        for (const fl of t.flights || []) {
          for (const [_rkey, rdata] of Object.entries(fl.rounds_data || {})) {
            for (const [_pid, pl] of Object.entries(rdata.flight_players || {})) {
              const name = `${(pl.first||'').trim()} ${(pl.last||'').trim()}`.trim();
              if (!name) continue;
              const country = (pl.country || '').toUpperCase();
              for (const [rkey, r] of Object.entries(pl.rounds || {})) {
                const sk = strokesKey(r.strokes);
                if (sk) {
                  fingerprints.set(`${tid}:R${rkey}:${sk}`, { name, country, tid, round: rkey });
                  extraFp++;
                }
              }
            }
          }
        }
      }
    }
  }
  console.log(`  Fingerprints construídos: ${fingerprints.size} (${extraFp} extra de torneios_completos)`);

  // Tentar fingerprint match para cada mid não resolvido
  const fpMatches = new Map();
  for (const mid of ptMids) {
    if (directMatches.has(mid)) continue;
    const p = ptHist.jogadores[mid];
    for (const [tid, t] of Object.entries(p.torneios || {})) {
      for (const [rn, r] of Object.entries(t.rounds || {})) {
        const sk = strokesKey(r.strokes);
        if (!sk) continue;
        const hit = fingerprints.get(`${tid}:R${rn}:${sk}`);
        if (hit && hit.name) {
          fpMatches.set(mid, { ...hit, viaTid: tid, viaRound: rn });
          break;
        }
      }
      if (fpMatches.has(mid)) break;
    }
  }
  console.log(`  Matches por fingerprint: ${fpMatches.size}`);

  // 4. Compilar output final
  const resolved = ptMids.map(mid => {
    const p = ptHist.jogadores[mid];
    let info = directMatches.get(mid);
    let by = 'direct';
    if (!info) {
      info = fpMatches.get(mid);
      by = info ? 'fingerprint' : 'none';
    }
    const ptTids = Object.keys(p.torneios || {}).filter(t => TARGET_PT_TIDS.includes(t));
    return {
      memberID: mid,
      name: info?.name || null,
      country: info?.country || p.country || null,
      totalTorneiosUSKids: p.totalTorneios || 0,
      ptTorneios: ptTids,
      ageGroupHoje: p.ageGroup,
      resolvedBy: by,
      _source: info?.fonte || info?.viaTid || null
    };
  });

  const out = {
    gerado_em: new Date().toISOString(),
    total: resolved.length,
    resolvidos: resolved.filter(r => r.name).length,
    pendentes: resolved.filter(r => !r.name).length,
    jogadores: resolved.sort((a, b) =>
      (a.country || 'zz').localeCompare(b.country || 'zz') ||
      (a.name || 'zz').localeCompare(b.name || 'zz')
    )
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\n✓ ${out.resolvidos}/${out.total} resolvidos, ${out.pendentes} pendentes`);
  console.log(`  → ${OUT_PATH}`);

  // Print summary
  console.log(`\n=== JOGADORES RESOLVIDOS ===`);
  for (const j of out.jogadores) {
    const n = (j.name || '???').padEnd(32);
    const c = (j.country || '?').padEnd(3);
    const by = j.resolvedBy.padEnd(11);
    console.log(`  ${j.memberID.toString().padStart(8)} | ${n} | ${c} | ${by} | ${j.totalTorneiosUSKids}t total | PT: ${j.ptTorneios.length}/6`);
  }
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
