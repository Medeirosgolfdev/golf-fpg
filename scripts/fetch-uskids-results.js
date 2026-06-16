'use strict';

/**
 * fetch-uskids-results.js
 * Corre às 16:00 UTC todos os dias.
 * Para torneios em curso: busca scorecards completos.
 * Para históricos: busca na primeira execução e guarda.
 * Output: uskids-results.json com leaderboard + strokes buraco-a-buraco + par/yards reais
 *
 * Fonte do PAR/YARDS:
 *   GetMeta → flight_courses[flight_round_id].pars[]    = par real por buraco
 *   GetMeta → flight_courses[flight_round_id].lengths[]  = yards por buraco
 *   GetMeta → flight_rounds[flight_round_id]             = liga flight → course → round
 */

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ── Torneios históricos ─────────────
const HISTORICOS = [
  { t: 20895, name: 'Sandestin Championship 2026',
    date_inicio: '1/17/2026', date_fim: '1/18/2026', rondas: 2, ax: 1129,
    escalao_manuel: 7, age_groups: [4, 5, 6, 7],
    url_uskids: 'https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/516801/sandestin-championship-2026',
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=20895' },
  { t: 21004, name: 'Desert Shootout 2026',
    date_inicio: '2/21/2026', date_fim: '2/22/2026', rondas: 2, ax: 1129,
    escalao_manuel: 7, age_groups: [4, 5, 6, 7],
    url_uskids: 'https://tournaments.uskidsgolf.com/tournaments/regional/find-tournament/516958/desert-shootout-2026',
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=21004' },
  // Azata Golf 2026 (Espanha, 1 ronda). Sem age_groups → apanha Boys 9-12 (Guo Ziyang jogou Boys 12).
  // ⚠ Se "GetMeta falhou" no log, o ax 1129 (intl) não tem acesso — trocar para ax 2760 (mesmo de El Prat/Espanha).
  { t: 21931, name: 'Azata Golf 2026',
    date_inicio: '5/16/2026', date_fim: '5/16/2026', rondas: 1, ax: 1129,
    escalao_manuel: null,
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=21931' },
  { t: 18438, name: 'Marco Simone Invitational 2025',
    date_inicio: '3/15/2025', date_fim: '3/16/2025', rondas: 2, ax: 2739,
    escalao_manuel: null, age_groups: [2102, 2103, 2104, 2105],
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=2739&t=18438' },
  { t: 15573, name: 'Real Club de Golf El Prat 2023',
    date_inicio: '10/22/2023', date_fim: '10/22/2023', rondas: 1, ax: 2760,
    escalao_manuel: 2151, age_groups: [2150, 2151, 2152],
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=2760&t=15573' },
  { t: 19418, name: 'Venice Open 2025',
    date_inicio: '8/17/2025', date_fim: '8/17/2025', rondas: 3, ax: 1129,
    escalao_manuel: 2104, age_groups: [2102, 2103, 2104, 2105],
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=19418' },
  { t: 20175, name: 'Rome Classic 2025',
    date_inicio: '10/18/2025', date_fim: '10/18/2025', rondas: 2, ax: 1129,
    escalao_manuel: 2104, age_groups: [2103, 2104, 2105],
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=20175' },
  // ── Holiday Classic (Regional Championship, NC, 21-22 Dez, 2 rondas) ──
  // Sem age_groups → apanha Boys 9-12 (foco do tracker). Manuel não jogou.
  // ⚠ Se "GetMeta falhou" no log, o ax 1129 (intl) pode não ter acesso ao
  // microsite US — testar ax alternativo (ver outros regionais USA).
  { t: 8510,  name: 'Holiday Classic 2020',
    date_inicio: '12/21/2020', date_fim: '12/22/2020', rondas: 2, ax: 1129, escalao_manuel: null,
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=8510' },
  { t: 10306, name: 'Holiday Classic 2021',
    date_inicio: '12/21/2021', date_fim: '12/22/2021', rondas: 2, ax: 1129, escalao_manuel: null,
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=10306' },
  { t: 13273, name: 'Holiday Classic 2022',
    date_inicio: '12/21/2022', date_fim: '12/22/2022', rondas: 2, ax: 1129, escalao_manuel: null,
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=13273' },
  { t: 15480, name: 'Holiday Classic 2023',
    date_inicio: '12/21/2023', date_fim: '12/22/2023', rondas: 2, ax: 1129, escalao_manuel: null,
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=15480' },
  { t: 18000, name: 'Holiday Classic 2024',
    date_inicio: '12/21/2024', date_fim: '12/22/2024', rondas: 2, ax: 1129, escalao_manuel: null,
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=18000' },
  { t: 20878, name: 'Holiday Classic 2025',
    date_inicio: '12/21/2025', date_fim: '12/22/2025', rondas: 2, ax: 1129, escalao_manuel: null,
    url_resultados: 'https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=20878' },
];

const ESCALOES_PREFIXOS = ['boys 9', 'boys 10', 'boys 11', 'boys 12'];
const escalaoApanhar = (nome) => ESCALOES_PREFIXOS.some(p => nome.toLowerCase().startsWith(p));

/**
 * Torneios PREMIUM: descarregar TODOS os escalões (Boys 7+ até Girls 15-18),
 * ignorando o filtro Boys 9-12. Para torneios de referência onde queremos ver
 * o leaderboard completo (irmãs do Manuel, contexto internacional).
 *
 * Política: 4 séries × todos os anos disponíveis
 *   - European Championship (EURO)
 *   - World Championship    (WORLD)
 *   - Marco Simone Invitational (incluindo Local Tour)
 *   - Venice Open
 *
 * Para adicionar uma série nova: pôr o tcode aqui. Para ver tcodes
 * disponíveis: docs/api-fpg-endpoints.md ou USKIDS_KNOWN_TCODES no CLAUDE.md.
 */
const TORNEIOS_ALL_AGE_GROUPS = new Set([
  // European Championship
  8300, 13568, 15704, 18242, 21131,
  // World Championship
  11604, 14029, 15807, 18124, 21610,
  // Marco Simone (Invitational + Local Tour)
  18438, 21080, 21573,
  // Venice Open
  12229, 14302, 16428, 19418, 22243,
]);

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

// ══════════════════════════════════════
// Extrair PAR + YARDS de flight_courses (do GetMeta)
// ══════════════════════════════════════
// meta.flight_courses[flight_round_id] = { pars: [4,3,5,...], lengths: [168,75,...], course: 43 }
// meta.flight_rounds[flight_round_id]  = { flight: 232783, round: 1, course: 43, ... }
//
// Construir mapa: flightId → roundNum → { par[], yards[], courseName, totalPar, totalYards }

function construirMapaCursos(meta) {
  const flightCourses = meta.flight_courses || {};
  const flightRounds  = meta.flight_rounds  || {};
  const coursesRaw    = meta.courses        || {};
  const teeMarkersRaw = meta.teeMarkers     || {};

  // flightId → { roundNum → courseInfo }
  const mapa = {};

  for (const [frId, fc] of Object.entries(flightCourses)) {
    const fr = flightRounds[frId] || {};
    const flightId = String(fr.flight || '');
    const roundNum = fr.round || 1;
    const courseId = fc.course || fr.course || null;
    const courseName = courseId && coursesRaw[courseId] ? coursesRaw[courseId].name : '';

    const pars    = fc.pars    || [];
    const lengths = fc.lengths || [];

    // Construir array de buracos (filtrar zeros = não jogados)
    const holes = [];
    for (let i = 0; i < pars.length; i++) {
      if (pars[i] > 0 || lengths[i] > 0) {
        holes.push({ number: i + 1, par: pars[i] || 0, yards: lengths[i] || 0 });
      }
    }

    const totalPar   = holes.reduce((s, h) => s + h.par, 0);
    const totalYards = holes.reduce((s, h) => s + h.yards, 0);

    // Par array limpo (só buracos jogados) para compatibilidade com leaderboard
    const parClean = holes.map(h => h.par);

    if (!mapa[flightId]) mapa[flightId] = {};
    mapa[flightId][roundNum] = {
      flightRoundId: frId,
      courseId:       courseId ? String(courseId) : null,
      courseName,
      startingHole:  fr.starting_hole || '1',
      date:          fr.date || null,
      numHoles:      holes.length,
      totalPar,
      totalYards,
      par:           parClean,
      yards:         holes.map(h => h.yards),
      holes,
      pars_raw:      pars,
      lengths_raw:   lengths,
    };
  }

  return mapa;
}

// Buscar par/yards para um flight e ronda a partir do mapa construído do GetMeta
function buscarParDoMapa(mapaCursos, fid, ronda) {
  const flightInfo = mapaCursos[fid];
  if (!flightInfo) return { par: [], yards: [], courseName: '', totalPar: 0, totalYards: 0, numHoles: 0 };
  const roundInfo = flightInfo[ronda];
  if (!roundInfo) return { par: [], yards: [], courseName: '', totalPar: 0, totalYards: 0, numHoles: 0 };
  return {
    par:        roundInfo.par,
    yards:      roundInfo.yards,
    courseName: roundInfo.courseName,
    totalPar:   roundInfo.totalPar,
    totalYards: roundInfo.totalYards,
    numHoles:   roundInfo.numHoles,
    holes:      roundInfo.holes,
  };
}

// Parsear jogadores com strokes completos, todas as páginas
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

  // ═══ Construir mapa de cursos com PAR/YARDS reais ═══
  const mapaCursos = construirMapaCursos(meta);
  const nFlightRounds = Object.keys(meta.flight_courses || {}).length;
  const nComPar = Object.values(meta.flight_courses || {}).filter(fc => (fc.pars || []).some(p => p > 0)).length;
  console.log(`  🏌️ ${nFlightRounds} flight_rounds, ${nComPar} com par/yards reais`);

  // Determinar quais age_groups apanhar
  //   1. Se o torneio está em TORNEIOS_ALL_AGE_GROUPS (premium: EURO/WORLD/Marco
  //      Simone/Venice) → todos os escalões
  //   2. Senão se torneio.age_groups está definido → só esses
  //   3. Senão → apanha apenas Boys 9-12 via escalaoApanhar
  const isAllAgeGroups = TORNEIOS_ALL_AGE_GROUPS.has(torneio.t);
  const agsFiltro = (!isAllAgeGroups && torneio.age_groups) ? new Set(torneio.age_groups) : null;
  if (isAllAgeGroups) console.log(`  ⭐ Torneio PREMIUM — todos os escalões serão descarregados`);

  // Agrupar flights por age_group
  const flightsPorAG = {};
  for (const [fid, f] of Object.entries(flights)) {
    const ag = f.age_group;
    const agInfo = ageGroups[ag];
    if (!agInfo) continue;
    const nome = agInfo.name || '';
    const incluir = isAllAgeGroups
      ? true
      : agsFiltro
        ? agsFiltro.has(parseInt(ag))
        : escalaoApanhar(nome);
    if (incluir && !flightsPorAG[ag]) {
      flightsPorAG[ag] = { fid, nome, inscr: f.registered || 0 };
    }
  }

  // Log age_groups disponíveis
  const agDisp = [...new Set(Object.values(flights).map(f => f.age_group))]
    .map(ag => `${ag}=${ageGroups[ag]?.name ?? '?'}`).join(', ');
  console.log(`  📋 age_groups: ${agDisp}`);

  if (agsFiltro) {
    for (const ag of agsFiltro) {
      if (!flightsPorAG[ag]) {
        console.log(`  ⚠️  age_group ${ag} (${ageGroups[ag]?.name ?? '?'}) não encontrado`);
      }
    }
  }

  // Log cursos únicos encontrados
  const cursosVistos = new Set();
  for (const [fid] of Object.entries(flights)) {
    const fi = mapaCursos[fid];
    if (!fi) continue;
    for (const [rn, ri] of Object.entries(fi)) {
      if (ri.totalPar > 0) {
        const ck = `${ri.courseName}_${ri.numHoles}h`;
        if (!cursosVistos.has(ck)) {
          cursosVistos.add(ck);
          console.log(`  ⛳ ${ri.courseName || 'Course'}: ${ri.numHoles}h par ${ri.totalPar} | ${ri.totalYards}y`);
        }
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
      // Par e yards do mapa (GetMeta.flight_courses)
      const courseData = buscarParDoMapa(mapaCursos, fid, r);
      const par = courseData.par;
      await sleep(DELAY_MS);

      // Jogadores
      const jogadores = await buscarJogadores(page, fid, r, inscr);
      const leaderboard = calcularLeaderboard(jogadores, par);

      // Log portugueses
      const pt = leaderboard.filter(j => j.pais === 'PT');
      for (const j of pt)
        console.log(`    🇵🇹 ${j.nome} — ${j.score} (${j.to_par >= 0 ? '+' : ''}${j.to_par}) ${j.pontos > 0 ? j.pontos + 'pts' : ''}`);

      const parSource = par.length > 0 ? 'flight_courses' : 'estimated';
      console.log(`    R${r}: ${leaderboard.length} jog | par ${courseData.totalPar || '?'} (${parSource}) | ${courseData.totalYards || '?'}y | ${courseData.courseName || '?'}`);

      rondasData.push({
        ronda:       r,
        par,
        yards:       courseData.yards,
        campo:       courseData.courseName || null,
        holes:       courseData.holes || [],
        buracos:     courseData.numHoles || buracos,
        total_par:   courseData.totalPar || par.reduce((s, p) => s + p, 0) || null,
        total_yards: courseData.totalYards || null,
        par_source:  parSource,
        leaderboard,
      });
    }

    // Tee marker deste escalão
    const agTeeMarker = agInfo.tee_marker || null;

    escaloes.push({
      age_group:     parseInt(ag),
      nome,
      holes:         buracos,
      tee_marker:    agTeeMarker,
      is_manuel:     isManuel,
      rondas:        rondasData,
    });
  }

  // Ordenar: escalão do Manuel primeiro
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

  let emCurso = [];
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      emCurso = (cache.torneios || []).filter(estaEmCursoOuRecente);
    } catch {}
  }

  const outputActual = fs.existsSync(OUTPUT)
    ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8'))
    : { resultados: [] };
  const mapaActual = new Map((outputActual.resultados || []).map(r => [r.t, r]));
  const historicosNovos = HISTORICOS.filter(h => {
    const existente = mapaActual.get(h.t);
    if (!existente) return true;
    if (h.age_groups) {
      const agsTemos = new Set((existente.escaloes || []).map(e => e.age_group));
      if (h.age_groups.some(ag => !agsTemos.has(ag))) {
        console.log(`  ♻️  ${h.name} — age_groups desactualizados, vai re-processar`);
        return true;
      }
    }
    // Premium: torneios que devem ter TODOS os escalões. Se o que temos é só o
    // subset Boys 9-12 (ou outro filtro antigo), forçar re-processamento.
    // Heurística: se está em TORNEIOS_ALL_AGE_GROUPS e tem ≤ 5 escalões, falta-
    // -nos a versão completa (EURO+ costuma ter ~15 escalões).
    if (TORNEIOS_ALL_AGE_GROUPS.has(h.t) && (existente.escaloes || []).length < 10) {
      console.log(`  ♻️  ${h.name} — só ${(existente.escaloes || []).length} escalões, premium pede todos`);
      return true;
    }
    // Re-processar se não tem par/yards (versão antiga)
    const temPar = (existente.escaloes || []).some(e =>
      (e.rondas || []).some(r => r.par_source === 'flight_courses'));
    if (!temPar) {
      console.log(`  ♻️  ${h.name} — sem par/yards reais, vai re-processar`);
      return true;
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
// EOF
