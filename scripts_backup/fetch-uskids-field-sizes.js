'use strict';

/**
 * fetch-uskids-field-sizes.js
 *
 * Usa Playwright (como os outros scripts USKids) para ir buscar
 * ao signupanytime os inscritos por escalão dos torneios relevantes.
 *
 * Uso:
 *   node scripts/fetch-uskids-field-sizes.js
 *   node scripts/fetch-uskids-field-sizes.js --min=5
 *   node scripts/fetch-uskids-field-sizes.js --force
 */

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIR    = path.join(__dirname, '..', 'public', 'data');
const OUTPUT = path.join(DIR, 'uskids-field-sizes.json');
const API    = 'https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx';
const IFRAME = 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=';
const DELAY  = 150;
const FORCE  = process.argv.includes('--force');
const MIN_ARG = process.argv.find(a => a.startsWith('--min='));
const MIN     = MIN_ARG ? parseInt(MIN_ARG.split('=')[1]) : 3;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pageJSON(page, url) {
  return page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }, url);
}

function loadMemberHistory() {
  const jogadores = {};
  let n = 1;
  while (true) {
    const p = path.join(DIR, `uskids-member-history-${String(n).padStart(3,'0')}.json`);
    if (!fs.existsSync(p)) break;
    try { Object.assign(jogadores, JSON.parse(fs.readFileSync(p, 'utf8')).jogadores || {}); } catch {}
    n++;
  }
  const legacy = path.join(DIR, 'uskids-member-history.json');
  if (n === 1 && fs.existsSync(legacy)) {
    try { Object.assign(jogadores, JSON.parse(fs.readFileSync(legacy, 'utf8')).jogadores || {}); } catch {}
  }
  return jogadores;
}

async function main() {
  console.log('⛳  USKids Field Sizes');
  console.log(`    ${new Date().toLocaleString('pt-PT')}\n`);

  // Contar popularidade dos t-codes no histórico
  const jogadores = loadMemberHistory();
  const counts = new Map();
  for (const j of Object.values(jogadores)) {
    for (const t of Object.keys(j.torneios || {})) {
      const n = parseInt(t);
      if (!isNaN(n)) counts.set(n, (counts.get(n) || 0) + 1);
    }
  }

  const toProcess = [...counts.entries()]
    .filter(([t, c]) => c >= MIN && t >= 7000)
    .sort(([a], [b]) => a - b)
    .map(([t]) => t);

  let output = {};
  if (fs.existsSync(OUTPUT) && !FORCE)
    try { output = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch {}
  const existing = new Set(Object.keys(output).filter(k => k !== '_gerado_em').map(Number));
  const toFetch  = FORCE ? toProcess : toProcess.filter(t => !existing.has(t));

  console.log(`Histórico: ${Object.keys(jogadores).length} jogadores`);
  console.log(`T-codes >= 7000 com >= ${MIN} jogadores: ${toProcess.length}`);
  console.log(`Em cache: ${existing.size} | A buscar: ${toFetch.length}\n`);

  if (!toFetch.length) { console.log('Nada a fazer.'); return; }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Inicializar sessão navegando para um torneio conhecido
  await page.goto(IFRAME + '18242', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(1000);
  console.log('Sessão inicializada\n');

  let fetched = 0, semDados = 0;
  const t0 = Date.now();

  try {
    for (let i = 0; i < toFetch.length; i++) {
      const tcode   = toFetch[i];
      const nJog    = counts.get(tcode);
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const eta     = i > 0 ? Math.round((Date.now()-t0)/i*(toFetch.length-i)/1000) : '?';

      process.stdout.write(`[${i+1}/${toFetch.length}] t=${tcode} (${nJog}jog) ${elapsed}s ETA ${eta}s ... `);

      let meta;
      try { meta = await pageJSON(page, `${API}?op=GetMeta&t=${tcode}`); }
      catch { semDados++; process.stdout.write('erro\n'); await sleep(DELAY); continue; }

      if (!meta?.tournament?.name) {
        semDados++;
        process.stdout.write('sem dados\n');
        await sleep(DELAY);
        continue;
      }

      const tn        = meta.tournament;
      const flights   = meta.flights    || {};
      const ageGroups = meta.age_groups || {};

      const escaloes = {};
      for (const [fid, fl] of Object.entries(flights)) {
        const agName = ageGroups[fl.age_group]?.name || fl.name || `flight ${fid}`;
        if (/girl/i.test(agName)) continue;
        // registered já vem no GetMeta — sem chamada extra
        const count = fl.registered || fl.players || 0;
        if (count > 0) escaloes[agName] = { fid: parseInt(fid), inscritos: count };
      }

      output[tcode] = {
        name: tn.name, start_date: tn.start_date || null,
        end_date: tn.end_date || null, rounds: tn.rounds || null,
        escaloes,
      };

      const resumo = Object.keys(escaloes).length
        ? Object.entries(escaloes).map(([ag,v]) => `${ag}: ${v.inscritos}`).join(', ')
        : '—';
      process.stdout.write(`${tn.name.slice(0,45)} [${resumo}]\n`);

      output._gerado_em = new Date().toISOString();
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf8');
      fetched++;

      await sleep(DELAY);
    }
  } finally {
    await browser.close();
  }

  const total = Object.keys(output).filter(k => k !== '_gerado_em').length;
  console.log(`\n✅  ${total} torneios | ${fetched} novos | ${semDados} sem dados | ${((Date.now()-t0)/60000).toFixed(1)} min`);
}

main().catch(err => { console.error(err); process.exit(1); });
