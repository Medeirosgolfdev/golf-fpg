'use strict';

/**
 * fetch-uskids-field-sizes.js
 *
 * Lê todos os ficheiros uskids-member-history-*.json, extrai os t-codes únicos,
 * e para cada torneio vai buscar ao signupanytime:
 *   - nome do torneio
 *   - por escalão: número de jogadores inscritos e número que completou resultados
 *
 * Output: public/data/uskids-field-sizes.json
 *
 * Correr em Node.js (não precisa de browser/Playwright):
 *   node scripts/fetch-uskids-field-sizes.js
 *   node scripts/fetch-uskids-field-sizes.js --force   # re-fetch tudo
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

const DIR    = path.join(__dirname, '..', 'public', 'data');
const OUTPUT = path.join(DIR, 'uskids-field-sizes.json');
const API    = 'https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx';
const DELAY  = 250;
const FORCE  = process.argv.includes('--force');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function safeGet(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        clearTimeout(timer);
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

// ── 1. Carregar todos os ficheiros de member history ──────────────
function loadMemberHistory() {
  const torneios = {};
  const jogadores = {};
  let n = 1;
  while (true) {
    const p = path.join(DIR, `uskids-member-history-${String(n).padStart(3,'0')}.json`);
    if (!fs.existsSync(p)) break;
    try {
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      Object.assign(torneios, d.torneios || {});
      Object.assign(jogadores, d.jogadores || {});
    } catch {}
    n++;
  }
  // Fallback: ficheiro legado
  const legacy = path.join(DIR, 'uskids-member-history.json');
  if (n === 1 && fs.existsSync(legacy)) {
    try {
      const d = JSON.parse(fs.readFileSync(legacy, 'utf8'));
      Object.assign(torneios, d.torneios || {});
      Object.assign(jogadores, d.jogadores || {});
    } catch {}
  }
  return { torneios, jogadores };
}

// ── 2. Extrair t-codes únicos do histórico ────────────────────────
function extractTcodes(jogadores) {
  const tcodes = new Set();
  for (const j of Object.values(jogadores)) {
    for (const tcode of Object.keys(j.torneios || {})) {
      tcodes.add(parseInt(tcode));
    }
  }
  return [...tcodes].filter(t => !isNaN(t)).sort((a,b) => a-b);
}

// ── 3. Fetch GetMeta para um torneio ─────────────────────────────
async function fetchMeta(tcode) {
  const url = `${API}?op=GetMeta&t=${tcode}`;
  return safeGet(url);
}

// ── 4. Fetch GetTournamentPlayers para um flight ──────────────────
async function fetchFlightCount(tcode, fid) {
  const url = `${API}?op=GetTournamentPlayers&t=${tcode}&f=${fid}`;
  const d = await safeGet(url);
  if (!d) return 0;
  return (d.PlayerNodeId || []).length;
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('══════════════════════════════════════');
  console.log('⛳  USKids Field Sizes');
  console.log(`    ${new Date().toLocaleString('pt-PT')}`);
  console.log('══════════════════════════════════════\n');

  // Carregar output existente
  let output = {};
  if (fs.existsSync(OUTPUT) && !FORCE) {
    try { output = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch {}
  }
  const existingTcodes = new Set(Object.keys(output).map(Number));

  const { torneios: mhTorneios, jogadores } = loadMemberHistory();
  const allTcodes = extractTcodes(jogadores);

  // Adicionar tcodes do header do member history
  for (const t of Object.keys(mhTorneios)) {
    allTcodes.push(parseInt(t));
  }
  const uniqueTcodes = [...new Set(allTcodes)].sort((a,b)=>a-b);

  const toFetch = FORCE
    ? uniqueTcodes
    : uniqueTcodes.filter(t => !existingTcodes.has(t));

  console.log(`Total t-codes: ${uniqueTcodes.length} | Já em cache: ${existingTcodes.size} | A buscar: ${toFetch.length}\n`);

  let fetched = 0, skipped = 0;

  for (const tcode of toFetch) {
    const meta = await fetchMeta(tcode);
    if (!meta) { skipped++; await sleep(DELAY); continue; }

    const tn = meta.tournament || {};
    const flights   = meta.flights    || {};
    const ageGroups = meta.age_groups || {};

    const escaloes = {};
    for (const [fid, fl] of Object.entries(flights)) {
      const agId   = fl.age_group;
      const agName = ageGroups[agId]?.name || fl.name || `flight ${fid}`;
      // Ignorar Girls e escalões não relevantes
      if (/girl/i.test(agName)) continue;

      // Número de inscritos
      await sleep(DELAY);
      const count = await fetchFlightCount(tcode, parseInt(fid));

      escaloes[agName] = {
        fid: parseInt(fid),
        inscritos: count,
      };
    }

    output[tcode] = {
      name:        tn.name || `t=${tcode}`,
      start_date:  tn.start_date || null,
      end_date:    tn.end_date   || null,
      rounds:      tn.rounds     || null,
      escaloes,
    };

    fetched++;
    const nEsc = Object.keys(escaloes).length;
    console.log(`  ✅ [${fetched}/${toFetch.length}] t=${tcode} | ${output[tcode].name} | ${nEsc} escalões`);
    for (const [ag, info] of Object.entries(escaloes)) {
      console.log(`     ${ag}: ${info.inscritos} jog.`);
    }

    // Gravar checkpoint a cada 50
    if (fetched % 50 === 0) {
      output._gerado_em = new Date().toISOString();
      fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf8');
      console.log(`  💾 Checkpoint: ${fetched} torneios processados`);
    }

    await sleep(DELAY);
  }

  // Gravar final
  output._gerado_em = new Date().toISOString();
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf8');

  console.log('\n══════════════════════════════════════');
  console.log(`✅  uskids-field-sizes.json`);
  console.log(`    ${Object.keys(output).filter(k => k !== '_gerado_em').length} torneios`);
  console.log(`    ${fetched} novos | ${skipped} sem dados`);
  console.log('══════════════════════════════════════');
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
