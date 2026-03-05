'use strict';

/**
 * fetch-uskids-field.js
 * Corre 1x por dia (07:00 UTC).
 * Lê a lista de torneios da cache de descoberta e actualiza
 * vagas + nomes de inscritos → uskids-field.json
 */

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ESCALOES_COM_NOMES = new Set([2103, 2104, 2105, 2114, 2106]);
// Boys 10=2103  Boys 11=2104  Boys 12=2105  Boys 13=2114  Boys 13-14=2106

const DELAY_MS   = 400;
const DIR        = path.join(__dirname, '..', 'public', 'data');
const CACHE_PATH = path.join(DIR, 'uskids-discovery-cache.json');
const OUTPUT     = path.join(DIR, 'uskids-field.json');

const IFRAME_URL = (t) =>
  `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t}`;
const API = 'https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parsearDataISO(s) {
  if (!s) return null;
  if (s.includes('-')) return s;
  const [m, d, y] = s.split('/');
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function diasAte(dateStr) {
  const iso = parsearDataISO(dateStr);
  if (!iso) return 999;
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
}

function parsearJogadores(flightPlayers) {
  return Object.values(flightPlayers || {})
    .filter(p => p.status === 1)
    .map(p => ({
      nome:   `${p.first || ''} ${p.last || ''}`.trim(),
      pais:   (p.country || '').toUpperCase(),
      cidade: p.place || '',
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

function esperarGetMeta(page, t, ms = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    const handler = async (response) => {
      if (!response.url().includes(`op=GetMeta&t=${t}`)) return;
      clearTimeout(timer);
      page.off('response', handler);
      try { resolve(await response.json()); } catch (e) { reject(e); }
    };
    page.on('response', handler);
  });
}

async function pageJSON(page, url) {
  return page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }, url);
}

async function processarTorneio(page, torneio) {
  const dias = diasAte(torneio.date_inicio);
  console.log(`\n▶ ${torneio.name} (t=${torneio.t}) — ${dias >= 0 ? `daqui a ${dias} dias` : 'em curso/recente'}`);

  let meta;
  try {
    const metaP = esperarGetMeta(page, torneio.t, 12000);
    await page.goto(IFRAME_URL(torneio.t), { waitUntil: 'domcontentloaded', timeout: 15000 });
    meta = await metaP;
  } catch (err) {
    console.warn(`  ⚠️  GetMeta falhou: ${err.message}`);
    return { ...torneio, erro: err.message, escaloes: [], ultima_atualizacao: new Date().toISOString() };
  }

  const tn        = meta.tournament;
  const ageGroups = meta.age_groups || {};
  const flights   = meta.flights    || {};

  if (!Object.keys(flights).length) {
    console.log(`  · Sem flights publicados ainda`);
    return {
      t: torneio.t, name: tn.name || torneio.name,
      date_inicio: tn.start_date, date_fim: tn.end_date,
      rondas: tn.rounds, campo: tn.courses || null, fee_18: tn.fee_18 || null,
      total_inscritos: 0, total_maximo: 0, sem_flights: true, escaloes: [],
      ultima_atualizacao: new Date().toISOString(),
    };
  }

  console.log(`  ✓ ${Object.keys(flights).length} flights | ${tn.players_9}×9H + ${tn.players_18}×18H`);

  const flightsPorAG = {};
  for (const [fid, f] of Object.entries(flights))
    if (!flightsPorAG[f.age_group]) flightsPorAG[f.age_group] = { fid, f };

  const escaloes = [];
  for (const [ag, { fid, f }] of Object.entries(flightsPorAG)) {
    const agInfo  = ageGroups[ag] || {};
    const nome    = agInfo.name   || `age_group_${ag}`;
    const inscr   = f.registered  || 0;
    const max     = f.max_entry   || 0;

    const escalao = {
      age_group: parseInt(ag), nome,
      genero:    agInfo.gender          || null,
      holes:     agInfo.holes_per_round || 18,
      flight_id: parseInt(fid),
      inscritos: inscr, maximo: max,
      vagas:     max - inscr,
      pct_cheio: max > 0 ? Math.round((inscr / max) * 100) : 0,
      jogadores: null, paises: null,
    };

    if (ESCALOES_COM_NOMES.has(parseInt(ag)) && inscr > 0) {
      try {
        await sleep(DELAY_MS);
        const d    = await pageJSON(page, `${API}?op=GetPlayerTeeTimes&f=${fid}&r=1&p=1&t=0`);
        const jogs = parsearJogadores(d.flight_players);
        const cp   = {};
        for (const j of jogs) cp[j.pais] = (cp[j.pais] || 0) + 1;
        escalao.paises    = Object.entries(cp).sort((a,b) => b[1]-a[1]).map(([pais,n]) => ({pais,n}));
        escalao.jogadores = jogs;
        const pt = jogs.filter(j => j.pais === 'PT');
        console.log(`  ✓ ${nome}: ${jogs.length}/${max}${pt.length ? '  🇵🇹 '+pt.map(j=>j.nome).join(', ') : ''}`);
      } catch {
        console.log(`  · ${nome}: ${inscr}/${max} (nomes indisponíveis)`);
      }
    } else {
      console.log(`  · ${nome}: ${inscr}/${max}`);
    }
    escaloes.push(escalao);
  }

  escaloes.sort((a,b) =>
    a.genero !== b.genero ? (a.genero === 'Boys' ? -1 : 1) : a.age_group - b.age_group
  );

  return {
    t: torneio.t, name: tn.name || torneio.name,
    date_inicio: tn.start_date, date_fim: tn.end_date,
    rondas: tn.rounds, campo: tn.courses || null, fee_18: tn.fee_18 || null,
    total_inscritos: escaloes.reduce((s,e) => s + e.inscritos, 0),
    total_maximo:    escaloes.reduce((s,e) => s + e.maximo,    0),
    escaloes, ultima_atualizacao: new Date().toISOString(),
  };
}

async function main() {
  console.log('══════════════════════════════════════');
  console.log('📋  USKids Field (Inscritos)');
  console.log(`    ${new Date().toLocaleString('pt-PT')}`);
  console.log('══════════════════════════════════════');

  if (!fs.existsSync(CACHE_PATH)) {
    console.error('❌  Cache de descoberta não encontrada. Corre primeiro fetch-uskids-discovery.js');
    process.exit(1);
  }

  const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  const torneios = (cache.torneios || []).filter(t => diasAte(t.date_inicio) >= -1);
  console.log(`\n   ${torneios.length} torneios a processar`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const resultados = [];
  try {
    for (const torneio of torneios) {
      resultados.push(await processarTorneio(page, torneio));
      await sleep(DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({
    gerado_em: new Date().toISOString(),
    torneios:  resultados,
  }, null, 2), 'utf8');

  console.log('\n══════════════════════════════════════');
  console.log('✅  uskids-field.json actualizado');
  console.log('\n📊  Resumo Boys 12:');
  for (const t of resultados) {
    if (t.erro || t.sem_flights) { console.log(`  ⏳ ${t.name}`); continue; }
    const b12 = t.escaloes.find(e => e.nome === 'Boys 12');
    if (!b12) continue;
    const pt = (b12.jogadores || []).filter(j => j.pais === 'PT');
    console.log(`  ${t.name}: ${b12.inscritos}/${b12.maximo} (${b12.vagas} vagas)${pt.length ? '  🇵🇹 '+pt.map(j=>j.nome).join(', ') : ''}`);
  }
  console.log('══════════════════════════════════════');
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
