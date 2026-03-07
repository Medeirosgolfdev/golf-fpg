'use strict';

/**
 * fetch-uskids-results.js
 * Corre às 16:00 UTC todos os dias.
 * Para torneios em curso: busca scorecards completos.
 * Para históricos: busca na primeira execução e guarda.
 * Output: uskids-results.json com leaderboard + strokes buraco-a-buraco + par/SI
 */

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ── Torneios históricos do Manuel ─────────────
const HISTORICOS = [
  // ── Regionais 2026 já realizados ──
  // Sandestin Championship 2026 — JAN 17-18 — Sandestin, FL
  // { t: XXXXX, name: 'Sandestin Championship 2026',
  //   date_inicio: '1/17/2026', date_fim: '1/18/2026', rondas: 2, ax: XXXXX,
  //   escalao_manuel: null, age_groups: [],
  //   url_uskids: 'https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/516801/sandestin-championship-2026',
  //   url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=XXXXX&t=XXXXX' },
  //
  // Desert Shootout 2026 — FEB 21-22 — Phoenix, AZ
  { t: 20895, name: 'Sandestin Championship 2026',
    date_inicio: '1/17/2026', date_fim: '1/18/2026', rondas: 2, ax: 1129,
    escalao_manuel: 2104, age_groups: [2102, 2103, 2104, 2105],
    url_uskids: 'https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/516801/sandestin-championship-2026',
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=20895' },
  { t: 21004, name: 'Desert Shootout 2026',
    date_inicio: '2/21/2026', date_fim: '2/22/2026', rondas: 2, ax: 1129,
    escalao_manuel: 2104, age_groups: [2102, 2103, 2104, 2105],
    url_uskids: 'https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/516958/desert-shootout-2026',
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=21004' },
  {
    t: 18438, name: 'Marco Simone Invitational 2025',
    date_inicio: '3/15/2025', date_fim: '3/16/2025', rondas: 2, ax: 2739,
    escalao_manuel: null,
    age_groups: [2102, 2103, 2104, 2105],
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=2739&t=18438',
  },
  {
    t: 15573, name: 'Real Club de Golf El Prat 2023',
    date_inicio: '10/22/2023', date_fim: '10/22/2023', rondas: 1, ax: 2760,
    escalao_manuel: 2151,
    age_groups: [2150, 2151, 2152],
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=2760&t=15573',
  },
  {
    t: 19418, name: 'Venice Open 2025',
    date_inicio: '8/17/2025', date_fim: '8/17/2025', rondas: 3, ax: 1129,
    escalao_manuel: 2104,
    age_groups: [2102, 2103, 2104, 2105],
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=19418',
  },
  {
    t: 20175, name: 'Rome Classic 2025',
    date_inicio: '10/18/2025', date_fim: '10/18/2025', rondas: 2, ax: 1129,
    escalao_manuel: 2104,
    age_groups: [2103, 2104, 2105],
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=20175',
  },
];

// Prefixos de escalão a capturar (apanha "Boys 12", "Boys 13-14", "Boys 13 & Under", etc.)
const ESCALOES_PREFIXOS = ['boys 9', 'boys 10', 'boys 11', 'boys 12'];
const escalaoApanhar = (nome) => ESCALOES_PREFIXOS.some(p => nome.toLowerCase().startsWith(p));

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

function diasAte(s) {
  const iso = parsearDataISO(s);
  if (!iso) return 999;
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
}

function estaEmCursoOuRecente(t) {
  const ini = diasAte(t.date_inicio);
  const fim = diasAte(t.date_fim || t.date_inicio);
  return ini <= 1 && fim >= -1;
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

// Buscar par e SI do campo para um flight/ronda
async function buscarParSI(page, fid, ronda) {
  try {
    const d = await pageJSON(page, `${API}?op=GetCourseHoles&f=${fid}&r=${ronda}`);
    const holes = d?.holes ?? d?.course_holes ?? [];
    if (!holes.length) return { par: [], si: [] };
    return {
      par: holes.map(h => h.par ?? 0),
      si:  holes.map(h => h.stroke_index ?? h.si ?? 0),
    };
  } catch {
    return { par: [], si: [] };
  }
}

// Parsear todos os jogadores com strokes completos, todas as páginas
async function buscarJogadores(page, fid, ronda, total_inscritos) {
  const todos = [];
  const totalPags = Math.ceil((total_inscritos || 50) / 20) + 1;
  for (let p = 1; p <= totalPags; p++) {
    try {
      await sleep(DELAY_MS);
      const d = await pageJSON(page, `${API}?op=GetPlayerTeeTimes&f=${fid}&r=${ronda}&p=${p}&t=0`);
      const jogadores = Object.values(d.flight_players || {})
        .filter(j => j.status === 1)
        .map(j => {
          const rd = j.rounds?.[String(ronda)] || {};
          const strokes = (rd.strokes || []).filter((_, i) => i < (rd.num_holes || 18));
          return {
            nome:       `${j.first || ''} ${j.last || ''}`.trim(),
            pais:       (j.country || '').toUpperCase(),
            cidade:     j.place || '',
            tee:        j.teeMarkerName || '',
            pontos:     j.points   || 0,
            score:      rd.num_strokes || j.score || 0,
            buracos:    rd.num_holes   || strokes.length || 0,
            start_hole: rd.start_hole  || 1,
            start_time: rd.start_time  || '',
            grupo:      rd.group_number || 0,
            strokes,
          };
        });
      if (!jogadores.length) break;
      todos.push(...jogadores);
    } catch { break; }
  }
  // Deduplicar
  const vistos = new Set();
  return todos.filter(j => { if (vistos.has(j.nome)) return false; vistos.add(j.nome); return true; });
}

// Calcular to_par e ordenar leaderboard
function calcularLeaderboard(jogadores, par) {
  const totalPar = par.reduce((s, p) => s + p, 0) || 72;
  return jogadores
    .filter(j => j.score > 0)
    .map(j => ({
      ...j,
      to_par: j.score > 0 ? j.score - totalPar : null,
    }))
    .sort((a, b) => (a.score || 999) - (b.score || 999));
}

// ── Processar torneio completo ────────────────
async function processarTorneio(page, torneio) {
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

  // Determinar quais age_groups apanhar
  // Determinar quais age_groups apanhar
  // Se o torneio tem age_groups definidos → filtrar por ID numérico
  // Caso contrário → filtrar por nome (boys 9–12)
  const agsFiltro = torneio.age_groups ? new Set(torneio.age_groups) : null;

  // Agrupar flights por age_group (primeiro flight de cada AG)
  const flightsPorAG = {};
  for (const [fid, f] of Object.entries(flights)) {
    const ag = f.age_group;
    const agInfo = ageGroups[ag];
    if (!agInfo) continue;
    const nome = agInfo.name || '';
    const incluir = agsFiltro
      ? agsFiltro.has(parseInt(ag))
      : escalaoApanhar(nome);
    if (incluir && !flightsPorAG[ag]) {
      flightsPorAG[ag] = { fid, nome, inscr: f.registered || 0 };
    }
  }

  // Aviso se algum age_group configurado não foi encontrado
  if (agsFiltro) {
    for (const ag of agsFiltro) {
      if (!flightsPorAG[ag]) {
        const agInfo = ageGroups[ag];
        console.log(`  ⚠️  age_group ${ag} (${agInfo?.name ?? '?'}) não encontrado neste torneio`);
      }
    }
  }

  const escaloes = [];
  for (const [ag, { fid, nome, inscr }] of Object.entries(flightsPorAG)) {
    const agInfo   = ageGroups[ag] || {};
    const buracos  = agInfo.holes_per_round || 18;
    const isManuel = torneio.escalao_manuel
      ? parseInt(ag) === torneio.escalao_manuel
      : nome.toLowerCase().startsWith('boys 12');

    console.log(`  ${isManuel ? '★' : '·'} ${nome} (ag=${ag}, f=${fid})`);

    const rondasData = [];
    for (let r = 1; r <= rondas; r++) {
      // Par e SI
      const { par, si } = await buscarParSI(page, fid, r);
      await sleep(DELAY_MS);

      // Jogadores
      const jogadores = await buscarJogadores(page, fid, r, inscr);
      const leaderboard = calcularLeaderboard(jogadores, par);

      // Log portugueses
      const pt = leaderboard.filter(j => j.pais === 'PT');
      if (pt.length) {
        for (const j of pt)
          console.log(`    🇵🇹 ${j.nome} — ${j.score} (${j.to_par >= 0 ? '+' : ''}${j.to_par}) ${j.pontos > 0 ? j.pontos + 'pts' : ''}`);
      }
      console.log(`    R${r}: ${leaderboard.length} jogadores`);

      rondasData.push({
        ronda: r,
        par,
        si,
        buracos,
        total_par: par.reduce((s,p) => s+p, 0) || null,
        leaderboard,
      });
    }

    escaloes.push({
      age_group:     parseInt(ag),
      nome,
      holes:         buracos,
      is_manuel:     isManuel,
      rondas:        rondasData,
    });
  }

  // Ordenar: escalão do Manuel primeiro, depois por age_group
  escaloes.sort((a, b) => {
    if (a.is_manuel && !b.is_manuel) return -1;
    if (!a.is_manuel && b.is_manuel) return 1;
    return a.age_group - b.age_group;
  });

  return {
    t:              torneio.t,
    name:           meta.tournament?.name || torneio.name,
    date_inicio:    meta.tournament?.start_date || torneio.date_inicio,
    date_fim:       meta.tournament?.end_date   || torneio.date_fim,
    campo:          meta.tournament?.courses    || null,
    rondas_total:   rondas,
    escalao_manuel: torneio.escalao_manuel || null,
    url_resultados: torneio.url_resultados ||
      `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=${torneio.ax || 1129}&t=${torneio.t}`,
    escaloes,
    ultima_atualizacao: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
async function main() {
  console.log('══════════════════════════════════════');
  console.log('🏆  USKids Results');
  console.log(`    ${new Date().toLocaleString('pt-PT')}`);
  console.log('══════════════════════════════════════');

  // Torneios em curso da cache
  let emCurso = [];
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      emCurso = (cache.torneios || []).filter(estaEmCursoOuRecente);
    } catch {}
  }

  // Históricos ainda não processados OU com age_groups desactualizados
  const outputActual = fs.existsSync(OUTPUT)
    ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8'))
    : { resultados: [] };
  const mapaActual = new Map((outputActual.resultados || []).map(r => [r.t, r]));
  const historicosNovos = HISTORICOS.filter(h => {
    const existente = mapaActual.get(h.t);
    if (!existente) return true; // ainda não temos
    // Re-processar se os age_groups configurados não estão todos no output
    if (h.age_groups) {
      const agsTemos = new Set((existente.escaloes || []).map(e => e.age_group));
      if (h.age_groups.some(ag => !agsTemos.has(ag))) {
        console.log(`  ♻️  ${h.name} — age_groups desactualizados, vai re-processar`);
        return true;
      }
    }
    return false;
  });

  const aProcessar = [...emCurso, ...historicosNovos];

  console.log(`\n   Em curso: ${emCurso.length} | Históricos novos: ${historicosNovos.length}`);

  if (!aProcessar.length) {
    console.log('   Nada a fazer.');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const novos = [];
  try {
    for (const t of aProcessar) {
      const res = await processarTorneio(page, t);
      if (res) novos.push(res);
      await sleep(DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  // Merge com existentes
  const mapa = new Map((outputActual.resultados || []).map(r => [r.t, r]));
  for (const r of novos) mapa.set(r.t, r);

  const todos = [...mapa.values()]
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
