'use strict';

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ──────────────────────────────────────────────
// CONFIGURAÇÃO
// ──────────────────────────────────────────────

const KEYWORDS_INCLUIR = [
  // Grandes torneios internacionais
  'world championship', 'world van horn', 'van horn cup', 'european championship',
  'european van horn', 'world teen championship',
  // Torneios europeus
  'irish open', 'paris invitational', 'marco simone', 'venice open', 'venezia',
  'venice classic', 'andaluz', 'andalusia', 'sevilla', 'marbella', 'sotogrande',
  'valderrama', 'rome open', 'roma open',
  // Por país/região
  'european', 'australian', 'canadian', 'african', 'panama', 'vallarta',
  'jekyll', 'nordic', 'al hamra',
  // Por tipo de evento (só apanha o que não for excluído)
  'championship', 'invitational', 'masters', 'open',
  // Brasil
  'fazenda boa vista', 'palmer course',
];

const KEYWORDS_EXCLUIR = [
  'tour championship', 'parent/child', 'qualifier',
  'state invitational', 'state championship',
  'teen series', 'teen van horn',
  'girls invitational', 'girls championship', 'girls open', 'girl',
  'golf course', 'golf club', 'country club',
  'veteran', 'world golf village',
  'texas open',  // regional americano
  'thailand championship', 'korean championship',  // pouco relevantes
  // Estados americanos
  '(ca)', '(fl)', '(tx)', '(nv)', '(or)', '(wa)', '(al)', '(nh)', '(mo)',
  '(nj)', '(ne)', '(hi)', '(id)', '(ut)', '(co)', '(ga)', '(sc)', '(nc)',
  '(va)', '(oh)', '(mi)', '(in)', '(il)', '(wi)', '(mn)', '(ia)', '(ks)',
  '(ok)', '(ar)', '(la)', '(ms)', '(tn)', '(ky)', '(wv)', '(md)', '(de)',
  '(pa)', '(ny)', '(ct)', '(ri)', '(ma)', '(vt)', '(me)', '(az)',
];

// Excepções forçadas (entram sempre independentemente dos filtros)
const FORCAR_INCLUIR = new Set([
  21080, // Marco Simone Invitational 2026
  21573, // Marco Simone Golf & Country Club
  21199, // Fazenda Boa Vista Brasil
  21200, // Fazenda Boa Vista Brasil
  21133, // Jekyll Island Cup 2026
]);

// Escalões para os quais queremos NOMES dos inscritos
const ESCALOES_COM_NOMES = new Set([2103, 2104, 2105, 2114, 2106]);

// Range de descoberta
const T_MAX        = 23000;
const MISS_LIMIT   = 100;
const DELAY_SCAN   = 120;
const DELAY_FETCH  = 400;

// Ficheiros
const DIR          = path.join(__dirname, '..', 'public', 'data');
const OUTPUT_PATH  = path.join(DIR, 'uskids-field.json');
const CACHE_PATH   = path.join(DIR, 'uskids-discovery-cache.json');

const IFRAME_URL = (t) =>
  `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t}`;
const API = 'https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx';

// ──────────────────────────────────────────────
// UTILITÁRIOS
// ──────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function ehInternacional(name) {
  const n = name.toLowerCase();
  return KEYWORDS_INCLUIR.some(k => n.includes(k)) &&
        !KEYWORDS_EXCLUIR.some(k => n.includes(k));
}

function parsearDataISO(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [m, d, y] = parts;
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function diasParaTorneio(dateStr) {
  const iso = parsearDataISO(dateStr);
  if (!iso) return 999;
  const diff = new Date(iso) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function estaNoFuturo(dateStr) {
  return diasParaTorneio(dateStr) >= -14; // manter 2 semanas após terminar
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

function esperarGetMeta(page, t, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
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

// ──────────────────────────────────────────────
// MODO 1: DESCOBERTA (corre de 3 em 3 dias)
// ──────────────────────────────────────────────

async function descobrirTorneios(page) {
  console.log('\n🔍 MODO: DESCOBERTA DE NOVOS TORNEIOS');

  let cache = { ultimo_t: 21100, torneios: [] };
  if (fs.existsSync(CACHE_PATH)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); }
    catch { console.warn('Cache corrompida — a recomeçar'); }
  }

  const tInicio    = cache.ultimo_t + 1;
  const conhecidos = new Map(cache.torneios.map(t => [t.t, t]));
  let misses = 0, encontrados = 0;

  console.log(`   Desde t=${tInicio} | conhecidos: ${conhecidos.size}\n`);

  for (let t = tInicio; t <= T_MAX && misses < MISS_LIMIT; t++) {
    try {
      const metaPromise = esperarGetMeta(page, t, 8000);
      await page.goto(IFRAME_URL(t), { waitUntil: 'domcontentloaded', timeout: 10000 });
      const meta = await metaPromise;
      const tn = meta?.tournament;
      if (!tn?.name) { misses++; await sleep(DELAY_SCAN); continue; }
      misses = 0;

      const nome = tn.name.trim();
      const incluir = FORCAR_INCLUIR.has(t) || ehInternacional(nome);

      if (incluir && estaNoFuturo(tn.start_date)) {
        if (!conhecidos.has(t)) {
          console.log(`  ✅ NOVO t=${t}  ${tn.start_date}  ${nome}`);
          encontrados++;
        }
        conhecidos.set(t, {
          t, name: nome,
          date_inicio: tn.start_date, date_fim: tn.end_date,
          rondas: tn.rounds, campo: tn.courses || null,
        });
      }
      cache.ultimo_t = t;
    } catch { misses++; }
    await sleep(DELAY_SCAN);
  }

  const activos = [...conhecidos.values()].filter(t => estaNoFuturo(t.date_inicio));
  activos.sort((a, b) => (parsearDataISO(a.date_inicio) || '').localeCompare(parsearDataISO(b.date_inicio) || ''));

  cache.torneios  = activos;
  cache.gerado_em = new Date().toISOString();
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');

  console.log(`\n   ✓ ${activos.length} torneios (${encontrados} novos)`);
  return activos;
}

// ──────────────────────────────────────────────
// MODO 2: INSCRITOS (corre 1x/dia)
// ──────────────────────────────────────────────

async function recolherInscritos(page, torneios) {
  console.log(`\n📋 MODO: INSCRITOS — ${torneios.length} torneios`);
  const resultados = [];

  for (const torneio of torneios) {
    const dias = diasParaTorneio(torneio.date_inicio);
    // Só actualizar inscritos até ao início do torneio
    if (dias < 0) { console.log(`  · ${torneio.name} — já decorreu, a saltar`); continue; }

    console.log(`\n▶ ${torneio.name} (t=${torneio.t}) — daqui a ${dias} dias`);

    let meta;
    try {
      const metaP = esperarGetMeta(page, torneio.t, 12000);
      await page.goto(IFRAME_URL(torneio.t), { waitUntil: 'domcontentloaded', timeout: 15000 });
      meta = await metaP;
    } catch (err) {
      console.warn(`  ⚠️  GetMeta falhou: ${err.message}`);
      resultados.push({ ...torneio, erro: err.message, escaloes: [], ultima_atualizacao: new Date().toISOString() });
      continue;
    }

    const tn = meta.tournament;
    const ageGroups = meta.age_groups || {};
    const flights   = meta.flights    || {};

    if (!Object.keys(flights).length) {
      console.log(`  · Sem flights publicados ainda`);
      resultados.push({ t: torneio.t, name: tn.name || torneio.name,
        date_inicio: tn.start_date, date_fim: tn.end_date, rondas: tn.rounds,
        campo: tn.courses || null, fee_18: tn.fee_18 || null,
        total_inscritos: 0, total_maximo: 0, escaloes: [], sem_flights: true,
        ultima_atualizacao: new Date().toISOString() });
      continue;
    }

    const flightsPorAG = {};
    for (const [fid, f] of Object.entries(flights))
      if (!flightsPorAG[f.age_group]) flightsPorAG[f.age_group] = { fid, f };

    const escaloes = [];
    for (const [ag, { fid, f }] of Object.entries(flightsPorAG)) {
      const agInfo  = ageGroups[ag] || {};
      const nome    = agInfo.name || `age_group_${ag}`;
      const inscr   = f.registered || 0;
      const max     = f.max_entry  || 0;
      const escalao = {
        age_group: parseInt(ag), nome,
        genero: agInfo.gender || null, holes: agInfo.holes_per_round || 18,
        flight_id: parseInt(fid), inscritos: inscr, maximo: max,
        vagas: max - inscr, pct_cheio: max > 0 ? Math.round((inscr/max)*100) : 0,
        jogadores: null, paises: null,
      };

      if (ESCALOES_COM_NOMES.has(parseInt(ag)) && inscr > 0) {
        try {
          await sleep(DELAY_FETCH);
          const d = await pageJSON(page, `${API}?op=GetPlayerTeeTimes&f=${fid}&r=1&p=1&t=0`);
          const jogs = parsearJogadores(d.flight_players);
          const cp = {};
          for (const j of jogs) cp[j.pais] = (cp[j.pais]||0)+1;
          escalao.paises    = Object.entries(cp).sort((a,b)=>b[1]-a[1]).map(([pais,n])=>({pais,n}));
          escalao.jogadores = jogs;
          const pt = jogs.filter(j=>j.pais==='PT');
          console.log(`  ✓ ${nome}: ${jogs.length}/${max}${pt.length ? '  🇵🇹 '+pt.map(j=>j.nome).join(', ') : ''}`);
        } catch {
          console.log(`  · ${nome}: ${inscr}/${max} (nomes indisponíveis)`);
        }
      } else {
        console.log(`  · ${nome}: ${inscr}/${max}`);
      }
      escaloes.push(escalao);
    }

    escaloes.sort((a,b) => a.genero!==b.genero ? (a.genero==='Boys'?-1:1) : a.age_group-b.age_group);
    resultados.push({
      t: torneio.t, name: tn.name || torneio.name,
      date_inicio: tn.start_date, date_fim: tn.end_date, rondas: tn.rounds,
      campo: tn.courses||null, fee_18: tn.fee_18||null,
      total_inscritos: escaloes.reduce((s,e)=>s+e.inscritos,0),
      total_maximo:    escaloes.reduce((s,e)=>s+e.maximo,0),
      escaloes, ultima_atualizacao: new Date().toISOString(),
    });
    await sleep(DELAY_FETCH);
  }
  return resultados;
}

// ──────────────────────────────────────────────
// MODO 3: RESULTADOS (torneios a decorrer ou recentes)
// ──────────────────────────────────────────────

async function recolherResultados(page, torneios) {
  // Torneios que começaram há menos de 14 dias
  const emJogo = torneios.filter(t => {
    const dias = diasParaTorneio(t.date_inicio);
    return dias <= 0 && dias >= -14;
  });

  if (!emJogo.length) { console.log('\n🏆 Sem torneios em curso ou recentes'); return []; }
  console.log(`\n🏆 MODO: RESULTADOS — ${emJogo.length} torneios`);

  const resultados = [];

  for (const torneio of emJogo) {
    console.log(`\n▶ ${torneio.name} (t=${torneio.t})`);

    let meta;
    try {
      const metaP = esperarGetMeta(page, torneio.t, 12000);
      await page.goto(IFRAME_URL(torneio.t), { waitUntil: 'domcontentloaded', timeout: 15000 });
      meta = await metaP;
    } catch (err) {
      console.warn(`  ⚠️  GetMeta falhou`); continue;
    }

    const ageGroups = meta.age_groups || {};
    const flights   = meta.flights    || {};
    const rondas    = meta.tournament?.rounds || 2;
    const flightsPorAG = {};
    for (const [fid, f] of Object.entries(flights))
      if (!flightsPorAG[f.age_group]) flightsPorAG[f.age_group] = { fid, f };

    const escaloes = [];
    for (const [ag, { fid }] of Object.entries(flightsPorAG)) {
      if (!ESCALOES_COM_NOMES.has(parseInt(ag))) continue;
      const nome = ageGroups[ag]?.name || `ag_${ag}`;

      // Buscar scorecards de cada ronda
      const rondaResults = [];
      for (let r = 1; r <= rondas; r++) {
        try {
          await sleep(DELAY_FETCH);
          const d = await pageJSON(page, `${API}?op=GetPlayerTeeTimes&f=${fid}&r=${r}&p=1&t=0`);
          const jogadores = Object.values(d.flight_players || {})
            .filter(p => p.status === 1)
            .map(p => ({
              nome:   `${p.first||''} ${p.last||''}`.trim(),
              pais:   (p.country||'').toUpperCase(),
              total:  p.total_score ?? null,
              to_par: p.to_par     ?? null,
              pos:    p.position   ?? null,
            }))
            .sort((a,b) => (a.to_par??99) - (b.to_par??99));
          rondaResults.push({ ronda: r, jogadores });
          const pt = jogadores.filter(j=>j.pais==='PT');
          if (pt.length) console.log(`  🇵🇹 ${nome} R${r}: ${pt.map(j=>`${j.nome} (${j.to_par>=0?'+':''}${j.to_par})`).join(', ')}`);
        } catch { rondaResults.push({ ronda: r, jogadores: [] }); }
      }
      escaloes.push({ age_group: parseInt(ag), nome, rondas: rondaResults });
    }

    resultados.push({
      t: torneio.t, name: torneio.name,
      date_inicio: torneio.date_inicio, date_fim: torneio.date_fim,
      escaloes, ultima_atualizacao: new Date().toISOString(),
    });
  }
  return resultados;
}

// ──────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────

async function main() {
  const modo = process.argv[2] || 'inscritos'; // 'descoberta' | 'inscritos' | 'resultados' | 'tudo'

  console.log('══════════════════════════════════════════');
  console.log(`⛳  USKids Field Monitor — ${modo.toUpperCase()}`);
  console.log(`    ${new Date().toLocaleString('pt-PT')}`);
  console.log('══════════════════════════════════════════');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    // Carregar output existente
    let outputActual = { gerado_em: null, torneios: [], resultados: [] };
    if (fs.existsSync(OUTPUT_PATH)) {
      try { outputActual = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')); } catch {}
    }

    // Descoberta (obrigatória na primeira vez ou se modo === 'descoberta' / 'tudo')
    let listaTorneios;
    if (modo === 'descoberta' || modo === 'tudo' || !fs.existsSync(CACHE_PATH)) {
      listaTorneios = await descobrirTorneios(page);
    } else {
      const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      listaTorneios = cache.torneios || [];
      console.log(`\n📂 Cache: ${listaTorneios.length} torneios conhecidos`);
    }

    // Inscritos
    let torneiosActualizados = outputActual.torneios;
    if (modo === 'inscritos' || modo === 'tudo') {
      torneiosActualizados = await recolherInscritos(page, listaTorneios);
    }

    // Resultados
    let resultados = outputActual.resultados || [];
    if (modo === 'resultados' || modo === 'tudo') {
      const novosResultados = await recolherResultados(page, listaTorneios);
      // Merge: actualizar resultados existentes pelo t
      const map = new Map(resultados.map(r => [r.t, r]));
      for (const r of novosResultados) map.set(r.t, r);
      resultados = [...map.values()];
    }

    // Guardar
    const output = {
      gerado_em: new Date().toISOString(),
      modo_ultimo_run: modo,
      torneios: torneiosActualizados,
      resultados,
    };
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');

    // Resumo
    console.log('\n══════════════════════════════════════════');
    console.log('✅  uskids-field.json actualizado');
    if (torneiosActualizados.length) {
      console.log('\n📊  Torneios:');
      for (const t of torneiosActualizados) {
        if (t.sem_flights) { console.log(`  ⏳ ${t.name} (${t.date_inicio}) — sem flights`); continue; }
        if (t.erro) { console.log(`  ❌ ${t.name}: ${t.erro}`); continue; }
        const b12 = t.escaloes?.find(e=>e.nome==='Boys 12');
        const pt  = (b12?.jogadores||[]).filter(j=>j.pais==='PT');
        console.log(`  ✓ ${t.name}: ${t.total_inscritos}/${t.total_maximo}${b12?` | Boys 12: ${b12.inscritos}/${b12.maximo} (${b12.vagas} vagas)`:''}${pt.length?'  🇵🇹 '+pt.map(j=>j.nome).join(', '):''}`);
      }
    }
    if (resultados.length) {
      console.log('\n🏆  Resultados:');
      for (const r of resultados) console.log(`  ✓ ${r.name}`);
    }
    console.log('══════════════════════════════════════════');

  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
