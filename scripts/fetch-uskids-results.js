'use strict';

/**
 * fetch-uskids-results.js
 * Corre às 16:00 UTC todos os dias.
 * Detecta torneios em curso (hoje ou ontem) e vai buscar
 * scorecards buraco-a-buraco → uskids-results.json
 *
 * Também inclui torneios históricos do Manuel (adicionar t= abaixo).
 */

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ── Torneios históricos do Manuel ──────────────
// Preencher com os t= quando tiveres a lista completa
const HISTORICOS = [
  { t: 15573, name: 'Real Club de Golf El Prat 2023', date_inicio: '10/22/2023', date_fim: '10/22/2023', rondas: 1, ax: 2760 },
  { t: 19418, name: 'Venice Open 2025',               date_inicio: '8/17/2025',  date_fim: '8/17/2025',  rondas: 2, ax: 1129 },
  { t: 20175, name: 'Rome Classic 2025',              date_inicio: '10/18/2025', date_fim: '10/18/2025', rondas: 2, ax: 1129 },
];

// Escalões a capturar nos resultados
// Boys 8=2101  Boys 9=2102  Boys 10=2103  Boys 11=2104  Boys 12=2105
// Boys 13=2114  Boys 13-14=2106
const ESCALOES_RESULTADOS = new Set([2101, 2102, 2103, 2104, 2105, 2114, 2106]);

const DELAY_MS   = 400;
const DIR        = path.join(__dirname, '..', 'public', 'data');
const CACHE_PATH = path.join(DIR, 'uskids-discovery-cache.json');
const OUTPUT     = path.join(DIR, 'uskids-results.json');

const IFRAME_URL = (t, ax = 1129) =>
  `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=${ax}&t=${t}`;
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

function estaEmCursoOuRecente(t) {
  const diasInicio = diasAte(t.date_inicio);
  const diasFim    = diasAte(t.date_fim || t.date_inicio);
  // Em curso: começou há ≤1 dia e ainda não terminou há mais de 1 dia
  return diasInicio <= 1 && diasFim >= -1;
}

function parsearScorecard(flightPlayers) {
  return Object.values(flightPlayers || {})
    .filter(p => p.status === 1)
    .map(p => {
      const rondas = {};
      for (const [r, rd] of Object.entries(p.rounds || {})) {
        rondas[r] = {
          strokes:    (rd.strokes || []).filter((_, i) => i < (rd.num_holes || 18)),
          total:      rd.num_strokes  || 0,
          buracos:    rd.num_holes    || 18,
          start_hole: rd.start_hole   || 1,
          start_time: rd.start_time   || '',
          grupo:      rd.group_number || 0,
        };
      }
      return {
        nome:    `${p.first || ''} ${p.last || ''}`.trim(),
        pais:    (p.country || '').toUpperCase(),
        cidade:  p.place  || '',
        pontos:  p.points || 0,
        score:   p.score  || 0,
        tee:     p.teeMarkerName || '',
        rondas,
      };
    })
    .sort((a, b) => b.pontos - a.pontos);
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

async function processarResultados(page, torneio) {
  console.log(`\n▶ ${torneio.name} (t=${torneio.t})`);

  let meta;
  try {
    const metaP = esperarGetMeta(page, torneio.t, 12000);
    await page.goto(IFRAME_URL(torneio.t, torneio.ax ?? 1129), { waitUntil: 'domcontentloaded', timeout: 15000 });
    meta = await metaP;
  } catch (err) {
    console.warn(`  ⚠️  GetMeta falhou: ${err.message}`);
    return null;
  }

  const ageGroups = meta.age_groups || {};
  const flights   = meta.flights    || {};
  const rondas    = meta.tournament?.rounds || torneio.rondas || 2;

  const flightsPorAG = {};
  for (const [fid, f] of Object.entries(flights))
    if (!flightsPorAG[f.age_group]) flightsPorAG[f.age_group] = { fid, f };

  const escaloes = [];
  for (const [ag, { fid }] of Object.entries(flightsPorAG)) {
    if (!ESCALOES_RESULTADOS.has(parseInt(ag))) continue;
    const nome = ageGroups[ag]?.name || `ag_${ag}`;

    const rondasData = [];
    for (let r = 1; r <= rondas; r++) {
      try {
        await sleep(DELAY_MS);
        const d    = await pageJSON(page, `${API}?op=GetPlayerTeeTimes&f=${fid}&r=${r}&p=1&t=0`);
        const jogs = parsearScorecard(d.flight_players);
        rondasData.push({ ronda: r, jogadores: jogs });

        const pt = jogs.filter(j => j.pais === 'PT');
        if (pt.length) {
          console.log(`  🇵🇹 ${nome} R${r}:`);
          for (const j of pt)
            console.log(`     ${j.nome}  ${j.pontos}pts  score:${j.score}`);
        } else {
          console.log(`  · ${nome} R${r}: ${jogs.length} jogadores`);
        }
      } catch {
        rondasData.push({ ronda: r, jogadores: [] });
      }
    }
    escaloes.push({ age_group: parseInt(ag), nome, rondas: rondasData });
  }

  return {
    t:           torneio.t,
    name:        meta.tournament?.name || torneio.name,
    date_inicio: meta.tournament?.start_date || torneio.date_inicio,
    date_fim:    meta.tournament?.end_date   || torneio.date_fim,
    campo:       meta.tournament?.courses    || null,
    escaloes,
    ultima_atualizacao: new Date().toISOString(),
  };
}

async function main() {
  console.log('══════════════════════════════════════');
  console.log('🏆  USKids Results');
  console.log(`    ${new Date().toLocaleString('pt-PT')}`);
  console.log('══════════════════════════════════════');

  // Torneios em curso (da cache de descoberta)
  let emCurso = [];
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      emCurso = (cache.torneios || []).filter(estaEmCursoOuRecente);
    } catch {}
  }

  // Juntar históricos (sempre processados se ainda não estiverem no output)
  const outputActual = fs.existsSync(OUTPUT)
    ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8'))
    : { resultados: [] };
  const jaTemos = new Set((outputActual.resultados || []).map(r => r.t));

  const historicosNovos = HISTORICOS.filter(h => !jaTemos.has(h.t));
  const aProcessar = [...emCurso, ...historicosNovos];

  if (!aProcessar.length) {
    console.log('\n   Sem torneios em curso nem históricos novos. Nada a fazer.');
    return;
  }

  console.log(`\n   Em curso: ${emCurso.length} | Históricos novos: ${historicosNovos.length}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const novosResultados = [];
  try {
    for (const torneio of aProcessar) {
      const resultado = await processarResultados(page, torneio);
      if (resultado) novosResultados.push(resultado);
      await sleep(DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  // Merge com resultados existentes (actualiza em curso, mantém históricos)
  const mapaResultados = new Map((outputActual.resultados || []).map(r => [r.t, r]));
  for (const r of novosResultados) mapaResultados.set(r.t, r);

  const todos = [...mapaResultados.values()]
    .sort((a, b) => (parsearDataISO(b.date_inicio)||'').localeCompare(parsearDataISO(a.date_inicio)||''));

  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({
    gerado_em: new Date().toISOString(),
    resultados: todos,
  }, null, 2), 'utf8');

  console.log('\n══════════════════════════════════════');
  console.log(`✅  uskids-results.json — ${todos.length} torneios`);
  console.log('══════════════════════════════════════');
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
