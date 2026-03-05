'use strict';

/**
 * fetch-uskids-field.js
 * Corre 1x por dia (07:00 UTC).
 * Fase 1: descobre novos torneios (se cache tiver mais de 3 dias ou não existir)
 * Fase 2: actualiza inscritos e vagas para todos os torneios futuros
 * Output: uskids-discovery-cache.json + uskids-field.json
 */

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ── Filtros de descoberta ─────────────────────
const KEYWORDS_INCLUIR = [
  'world championship', 'world van horn', 'van horn cup',
  'european championship', 'european van horn',
  'irish open', 'paris invitational',
  'marco simone', 'venice open', 'venice classic', 'venezia',
  'rome open', 'rome classic', 'terre dei consoli',
  'andaluz', 'andalusia', 'sevilla', 'marbella', 'sotogrande', 'valderrama',
  'european', 'australian', 'canadian', 'african',
  'panama', 'vallarta', 'jekyll', 'nordic', 'al hamra',
  'fazenda boa vista',
  'championship', 'invitational', 'masters', 'open',
];
const KEYWORDS_EXCLUIR = [
  'tour championship', 'parent/child', 'qualifier',
  'state invitational', 'state championship',
  'teen series', 'teen van horn', 'teen championship', 'world teen',
  'girls invitational', 'girls championship', 'girls open', 'girl',
  'golf course', 'golf club', 'country club',
  'veteran', 'world golf village', 'texas open',
  'thailand championship', 'korean championship',
  '(ca)','(fl)','(tx)','(nv)','(or)','(wa)','(al)','(nh)','(mo)',
  '(nj)','(ne)','(hi)','(id)','(ut)','(co)','(ga)','(sc)','(nc)',
  '(va)','(oh)','(mi)','(in)','(il)','(wi)','(mn)','(ia)','(ks)',
  '(ok)','(ar)','(la)','(ms)','(tn)','(ky)','(wv)','(md)','(de)',
  '(pa)','(ny)','(ct)','(ri)','(ma)','(vt)','(me)','(az)',
];
const FORCAR_INCLUIR = new Set([21080, 21199, 21200, 21133]); // 21080=Marco Simone Invitational 2026
const FORCAR_EXCLUIR  = new Set([21573]); // Marco Simone local tour

// Prefixos de escalão — apanha "Boys 12", "Boys 13-14", "Boys 13 & Under", etc.
const ESCALOES_PREFIXOS = ['boys 9', 'boys 10', 'boys 11', 'boys 12', 'boys 13'];
const escalaoComNomes = (nome) => ESCALOES_PREFIXOS.some(p => nome.toLowerCase().startsWith(p));

const T_MAX        = 23000;
const MISS_LIMIT   = 100;
const DELAY_SCAN   = 120;
const DELAY_FETCH  = 400;
// Redescobrir se cache tiver mais de 3 dias
const CACHE_MAX_DIAS = 3;

const DIR        = path.join(__dirname, '..', 'public', 'data');
const CACHE_PATH = path.join(DIR, 'uskids-discovery-cache.json');
const OUTPUT     = path.join(DIR, 'uskids-field.json');

const IFRAME_URL = (t, ax = 1129) =>
  `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=${ax}&t=${t}`;
const API = 'https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx';

// ─────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function ehInternacional(name) {
  const n = name.toLowerCase();
  return KEYWORDS_INCLUIR.some(k => n.includes(k)) &&
        !KEYWORDS_EXCLUIR.some(k => n.includes(k));
}

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

function cacheDesactualizada() {
  if (!fs.existsSync(CACHE_PATH)) return true;
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    if (!cache.gerado_em) return true;
    const dias = (Date.now() - new Date(cache.gerado_em).getTime()) / 86400000;
    return dias >= CACHE_MAX_DIAS;
  } catch { return true; }
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

// ─────────────────────────────────────────────
// FASE 1: DESCOBERTA
// ─────────────────────────────────────────────

async function descobrirTorneios(page) {
  console.log('\n🔍 FASE 1 — Descoberta');

  let cache = { ultimo_t: 21100, torneios: [], gerado_em: null };
  if (fs.existsSync(CACHE_PATH)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch {}
  }

  const tInicio    = cache.ultimo_t + 1;
  const conhecidos = new Map(cache.torneios.map(t => [t.t, t]));
  let misses = 0, encontrados = 0;

  // Garantir que todos os FORCAR_INCLUIR estão na cache (mesmo que já passaram na varredura)
  for (const t of FORCAR_INCLUIR) {
    if (!conhecidos.has(t)) {
      try {
        console.log(`   🔍 A forçar t=${t}...`);
        const metaP = esperarGetMeta(page, t, 8000);
        await page.goto(IFRAME_URL(t), { waitUntil: 'domcontentloaded', timeout: 10000 });
        const meta = await metaP;
        const tn = meta?.tournament;
        if (tn?.name) {
          conhecidos.set(t, {
            t, name: tn.name.trim(),
            date_inicio: tn.start_date, date_fim: tn.end_date,
            rondas: tn.rounds, campo: tn.courses || null, fee_18: tn.fee_18 || null,
          });
          console.log(`   ✅ Forçado: t=${t} ${tn.name}`);
          encontrados++;
        }
        await sleep(DELAY_SCAN);
      } catch (e) { console.warn(`   ⚠️ Falhou t=${t}: ${e.message}`); }
    }
  }

  console.log(`   Desde t=${tInicio} | conhecidos: ${conhecidos.size}`);

  for (let t = tInicio; t <= T_MAX && misses < MISS_LIMIT; t++) {
    try {
      const metaP = esperarGetMeta(page, t, 8000);
      await page.goto(IFRAME_URL(t), { waitUntil: 'domcontentloaded', timeout: 10000 });
      const meta = await metaP;
      const tn = meta?.tournament;
      if (!tn?.name) { misses++; await sleep(DELAY_SCAN); continue; }
      misses = 0;

      const nome    = tn.name.trim();
      const incluir = !FORCAR_EXCLUIR.has(t) && (FORCAR_INCLUIR.has(t) || ehInternacional(nome));
      const futuro  = diasAte(tn.start_date) >= -30;

      if (incluir && futuro) {
        if (!conhecidos.has(t)) {
          console.log(`  ✅ NOVO  t=${t}  ${tn.start_date}  ${nome}`);
          encontrados++;
        }
        conhecidos.set(t, {
          t, name: nome,
          date_inicio: tn.start_date, date_fim: tn.end_date,
          rondas: tn.rounds, campo: tn.courses || null, fee_18: tn.fee_18 || null,
        });
      }
      cache.ultimo_t = t;
    } catch { misses++; }
    await sleep(DELAY_SCAN);
  }

  const activos = [...conhecidos.values()]
    .filter(t => diasAte(t.date_inicio) >= -30)
    .sort((a, b) => (parsearDataISO(a.date_inicio)||'').localeCompare(parsearDataISO(b.date_inicio)||''));

  cache.torneios  = activos;
  cache.gerado_em = new Date().toISOString();
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');

  console.log(`   ✓ ${activos.length} torneios (${encontrados} novos)\n`);
  return activos;
}

// ─────────────────────────────────────────────
// FASE 2: INSCRITOS
// ─────────────────────────────────────────────

async function processarTorneio(page, torneio) {
  const dias = diasAte(torneio.date_inicio);
  console.log(`\n▶ ${torneio.name} (t=${torneio.t}) — ${dias >= 0 ? `daqui a ${dias}d` : 'em curso'}`);

  let meta;
  try {
    const metaP = esperarGetMeta(page, torneio.t, 12000);
    await page.goto(IFRAME_URL(torneio.t, torneio.ax || 1129), { waitUntil: 'domcontentloaded', timeout: 15000 });
    meta = await metaP;
  } catch (err) {
    console.warn(`  ⚠️  GetMeta falhou: ${err.message}`);
    return { ...torneio, erro: err.message, escaloes: [], ultima_atualizacao: new Date().toISOString() };
  }

  const tn        = meta.tournament;
  const ageGroups = meta.age_groups || {};
  const flights   = meta.flights    || {};

  if (!Object.keys(flights).length) {
    console.log(`  · Sem flights ainda`);
    return {
      t: torneio.t, name: tn.name || torneio.name,
      date_inicio: tn.start_date, date_fim: tn.end_date,
      rondas: tn.rounds, campo: tn.courses || null, fee_18: tn.fee_18 || null,
      total_inscritos: 0, total_maximo: 0, sem_flights: true, escaloes: [],
      ultima_atualizacao: new Date().toISOString(),
    };
  }

  const flightsPorAG = {};
  for (const [fid, f] of Object.entries(flights))
    if (!flightsPorAG[f.age_group]) flightsPorAG[f.age_group] = { fid, f };

  const escaloes = [];
  for (const [ag, { fid, f }] of Object.entries(flightsPorAG)) {
    const agInfo = ageGroups[ag] || {};
    const nome   = agInfo.name || `age_group_${ag}`;
    const inscr  = f.registered || 0;
    const max    = f.max_entry  || 0;

    const escalao = {
      age_group: parseInt(ag), nome,
      genero: agInfo.gender || null, holes: agInfo.holes_per_round || 18,
      flight_id: parseInt(fid), inscritos: inscr, maximo: max,
      vagas: max - inscr, pct_cheio: max > 0 ? Math.round((inscr/max)*100) : 0,
      jogadores: null, paises: null,
    };

    if (escalaoComNomes(nome) && inscr > 0) {
      try {
        // Buscar todas as páginas (cada página tem ~20 jogadores)
        const todosJogs = [];
        const totalPags = Math.ceil(inscr / 20);
        for (let p = 1; p <= totalPags; p++) {
          await sleep(DELAY_FETCH);
          const d = await pageJSON(page, `${API}?op=GetPlayerTeeTimes&f=${fid}&r=1&p=${p}&t=0`);
          todosJogs.push(...parsearJogadores(d.flight_players));
        }
        // Deduplicar por nome
        const vistos = new Set();
        const jogs = todosJogs.filter(j => { if (vistos.has(j.nome)) return false; vistos.add(j.nome); return true; });
        jogs.sort((a,b) => a.nome.localeCompare(b.nome));
        const cp = {};
        for (const j of jogs) cp[j.pais] = (cp[j.pais]||0)+1;
        escalao.paises    = Object.entries(cp).sort((a,b)=>b[1]-a[1]).map(([pais,n])=>({pais,n}));
        escalao.jogadores = jogs;
        const pt = jogs.filter(j=>j.pais==='PT');
        console.log(`  ✓ ${nome}: ${jogs.length}/${max}${pt.length?'  🇵🇹 '+pt.map(j=>j.nome).join(', '):''}`);
      } catch {
        console.log(`  · ${nome}: ${inscr}/${max} (nomes indisponíveis)`);
      }
    } else {
      console.log(`  · ${nome}: ${inscr}/${max}`);
    }
    escaloes.push(escalao);
  }

  escaloes.sort((a,b) => a.genero!==b.genero?(a.genero==='Boys'?-1:1):a.age_group-b.age_group);

  return {
    t: torneio.t, name: tn.name || torneio.name,
    date_inicio: tn.start_date, date_fim: tn.end_date,
    rondas: tn.rounds, campo: tn.courses||null, fee_18: tn.fee_18||null,
    total_inscritos: escaloes.reduce((s,e)=>s+e.inscritos,0),
    total_maximo:    escaloes.reduce((s,e)=>s+e.maximo,0),
    escaloes, ultima_atualizacao: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

async function main() {
  console.log('══════════════════════════════════════');
  console.log('⛳  USKids Field Monitor');
  console.log(`    ${new Date().toLocaleString('pt-PT')}`);
  console.log('══════════════════════════════════════');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  let torneios;
  try {
    // Fase 1: descoberta (só se cache tiver mais de 3 dias)
    if (cacheDesactualizada()) {
      torneios = await descobrirTorneios(page);
    } else {
      const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      torneios = cache.torneios || [];
      const diasCache = Math.round((Date.now() - new Date(cache.gerado_em).getTime()) / 86400000);
      console.log(`\n📂 Cache com ${torneios.length} torneios (há ${diasCache}d — próxima descoberta em ${CACHE_MAX_DIAS - diasCache}d)`);
    }

    // Fase 2: inscritos (só torneios futuros ou em curso)
    console.log(`\n📋 FASE 2 — Inscritos (${torneios.filter(t=>diasAte(t.date_inicio)>=-1).length} torneios)`);
    const resultados = [];
    for (const torneio of torneios.filter(t => diasAte(t.date_inicio) >= -1)) {
      resultados.push(await processarTorneio(page, torneio));
      await sleep(DELAY_FETCH);
    }

    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify({
      gerado_em: new Date().toISOString(),
      torneios: resultados,
    }, null, 2), 'utf8');

    console.log('\n══════════════════════════════════════');
    console.log('✅  uskids-field.json actualizado');
    console.log('\n📊  Boys 12:');
    for (const t of resultados) {
      if (t.erro || t.sem_flights) { console.log(`  ⏳ ${t.name}`); continue; }
      const b12 = t.escaloes.find(e => e.nome === 'Boys 12');
      if (!b12) continue;
      const pt = (b12.jogadores||[]).filter(j=>j.pais==='PT');
      console.log(`  ${t.name}: ${b12.inscritos}/${b12.maximo} (${b12.vagas} vagas)${pt.length?'  🇵🇹 '+pt.map(j=>j.nome).join(', '):''}`);
    }
    console.log('══════════════════════════════════════');

  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
