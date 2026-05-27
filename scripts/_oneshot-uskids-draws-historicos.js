'use strict';

/**
 * _oneshot-uskids-draws-historicos.js  (corrida única, descartável)
 *
 * Descarrega draws (pairings) de torneios USKids PASSADOS onde o Manuel
 * jogou, no escalão dele + adjacentes ±1. Faz merge no
 * public/data/uskids-draws.json existente — não substitui torneios já lá.
 *
 * Eliminar o ficheiro após confirmação visual do output.
 *
 * Para torneios passados o endpoint é o mesmo do field/results
 * (GetPlayerTeeTimes) mas convém forçar t=1 (final) na URL — algumas
 * versões devolvem flight_players vazio com t=0 para torneios encerrados.
 * O script tenta primeiro POST t=1, e cai para GET t=0 como fallback.
 *
 * Identificação do escalão: via GetMeta procurando "Boys N" no
 * age_groups.{id}.name. Adjacentes ±1: mesma estratégia.
 */

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ── Lista de torneios passados do Manuel ────────────────────────────────
// Cada entry: { t, ax, idade_manuel, name (informativo) }
const HISTORICOS = [
  { t: 15573, ax: 2760, idade_manuel:  9, name: 'Real Club de Golf El Prat 2023' },
  { t: 19418, ax: 1129, idade_manuel: 11, name: 'Venice Open 2025' },
  { t: 20175, ax: 1129, idade_manuel: 11, name: 'Rome Classic 2025' },
  { t: 21080, ax: 2739, idade_manuel: 11, name: 'Marco Simone Invitational 2026' },
];

const DELAY_MS = 400;
const DIR    = path.join(__dirname, '..', 'public', 'data');
const OUTPUT = path.join(DIR, 'uskids-draws.json');

const IFRAME_URL = (t, ax) =>
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
  const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0);
  const alvo = new Date(iso + 'T00:00:00Z');
  return Math.round((alvo - hoje) / 86400000);
}

function idadeDoEscalao(nome) {
  if (!nome) return null;
  const m = nome.match(/^Boys\s+(\d+)\s*$/i);
  return m ? parseInt(m[1], 10) : null;
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

async function pageJSON(page, url, method = 'GET') {
  return page.evaluate(async (args) => {
    const r = await fetch(args.u, { credentials: 'include', method: args.method });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }, { u: url, method });
}

/**
 * Tenta GetPlayerTeeTimes com t=1 (POST, final results) primeiro; cai para
 * GET t=0 se vier vazio ou erro. Devolve flight_players agregado de todas
 * as páginas.
 */
async function fetchFlightRound(page, fid, ronda, totalEstim) {
  const totalPags = Math.max(1, Math.ceil((totalEstim || 60) / 20) + 1);

  // Tentar t=1 POST primeiro (final results — funciona para torneios encerrados)
  const collected = {};
  let viaT1 = false;
  for (let p = 1; p <= totalPags; p++) {
    try {
      await sleep(DELAY_MS);
      const jbgr = Date.now();
      const url = `${API}?op=GetPlayerTeeTimes&f=${fid}&r=${ronda}&p=${p}&t=1&pt=undefined&jbgr=${jbgr}&c=1`;
      const d = await pageJSON(page, url, 'POST');
      const fp = d?.flight_players || {};
      const keys = Object.keys(fp);
      if (!keys.length) {
        if (p === 1) break; // sem dados em t=1 → cair para t=0
        break;
      }
      viaT1 = true;
      for (const k of keys) collected[k] = fp[k];
      if (keys.length < 20) break;
    } catch {
      if (p === 1) break;
      break;
    }
  }

  if (viaT1 && Object.keys(collected).length) return { players: collected, via: 't=1' };

  // Fallback t=0 GET
  for (let p = 1; p <= totalPags; p++) {
    try {
      await sleep(DELAY_MS);
      const url = `${API}?op=GetPlayerTeeTimes&f=${fid}&r=${ronda}&p=${p}&t=0`;
      const d = await pageJSON(page, url, 'GET');
      const fp = d?.flight_players || {};
      const keys = Object.keys(fp);
      if (!keys.length) break;
      for (const k of keys) collected[k] = fp[k];
      if (keys.length < 20) break;
    } catch { break; }
  }
  return { players: collected, via: 't=0' };
}

function extrairGrupos(flightPlayers, ronda) {
  const grupos = new Map();
  for (const j of Object.values(flightPlayers || {})) {
    if (j.status !== 1) continue;
    const rd = j.rounds?.[String(ronda)] || j.rounds?.[ronda] || {};
    const grp = rd.group_number || 0;
    const tt  = rd.start_time   || '';
    const sh  = rd.start_hole   || rd.starting_hole || 1;
    const cn  = rd.course_name  || rd.course || '';
    if (!grp && !tt) continue;
    const key = `${grp}|${tt}|${sh}`;
    if (!grupos.has(key)) {
      grupos.set(key, {
        group_number: grp,
        tee_time:     tt,
        start_hole:   sh,
        course:       cn,
        jogadores:    [],
      });
    }
    grupos.get(key).jogadores.push({
      nome:   `${j.first || ''} ${j.last || ''}`.trim(),
      pais:   (j.country || '').toUpperCase(),
      cidade: j.place || '',
    });
  }
  for (const g of grupos.values()) {
    g.jogadores.sort((a, b) => a.nome.localeCompare(b.nome));
  }
  return [...grupos.values()].sort((a, b) => {
    if (a.tee_time !== b.tee_time) return a.tee_time.localeCompare(b.tee_time);
    if (a.group_number !== b.group_number) return a.group_number - b.group_number;
    return a.start_hole - b.start_hole;
  });
}

async function processarTorneio(page, hist) {
  console.log(`\n▶ ${hist.name} (t=${hist.t}, ax=${hist.ax}, Manuel=Boys ${hist.idade_manuel})`);

  let meta;
  try {
    const metaP = esperarGetMeta(page, hist.t, 15000);
    await page.goto(IFRAME_URL(hist.t, hist.ax), { waitUntil: 'domcontentloaded', timeout: 18000 });
    meta = await metaP;
  } catch (err) {
    console.warn(`  ⚠️ GetMeta falhou: ${err.message}`);
    return null;
  }

  const tn        = meta.tournament || {};
  const ageGroups = meta.age_groups || {};
  const flights   = meta.flights    || {};
  const rondas    = tn.rounds || 1;

  // Construir lookup flight por nome de age_group
  const flightPorNome = {}; // "Boys 11" → { fid, age_group, inscritos }
  for (const [fid, f] of Object.entries(flights)) {
    const ag = ageGroups[f.age_group];
    if (!ag?.name) continue;
    if (!flightPorNome[ag.name]) {
      flightPorNome[ag.name] = {
        fid: parseInt(fid),
        age_group: parseInt(f.age_group),
        inscritos: f.registered || 60,
      };
    }
  }

  // Encontrar alvos
  const alvos = [];
  const alvoNomes = [
    `Boys ${hist.idade_manuel}`,
    `Boys ${hist.idade_manuel - 1}`,
    `Boys ${hist.idade_manuel + 1}`,
  ];
  for (let i = 0; i < alvoNomes.length; i++) {
    const nome = alvoNomes[i];
    const f = flightPorNome[nome];
    if (!f) {
      if (i === 0) console.warn(`  ⚠️  Escalão Manuel "${nome}" não encontrado nos flights`);
      else        console.log(`  · Adjacente "${nome}" não existe neste torneio`);
      continue;
    }
    alvos.push({
      age_group: f.age_group,
      nome,
      flight_id: f.fid,
      is_manuel: i === 0,
      adjacent: i > 0,
      totalEstim: f.inscritos,
    });
  }
  if (!alvos.length) {
    console.warn(`  ✗ Sem alvos encontrados — saltar.`);
    return null;
  }
  console.log(`  alvos: ${alvos.map(a => (a.is_manuel ? '★' : '·') + a.nome).join(', ')}`);

  const escaloes = [];
  for (const alvo of alvos) {
    const tag = alvo.is_manuel ? '★' : '·';
    console.log(`  ${tag} ${alvo.nome} (ag=${alvo.age_group}, f=${alvo.flight_id})`);

    const rondasData = [];
    let temAlgumDraw = false;
    let viaUsado = '?';
    for (let r = 1; r <= rondas; r++) {
      const { players, via } = await fetchFlightRound(page, alvo.flight_id, r, alvo.totalEstim);
      viaUsado = via;
      const grupos = extrairGrupos(players, r);
      if (grupos.length) temAlgumDraw = true;
      const nJogs = grupos.reduce((s, g) => s + g.jogadores.length, 0);
      const ptCount = grupos.reduce(
        (s, g) => s + g.jogadores.filter(j => j.pais === 'PT').length, 0);
      console.log(`    R${r} (${via}): ${grupos.length} grupos | ${nJogs} jogadores${ptCount ? `  🇵🇹 ${ptCount}` : ''}`);
      rondasData.push({ ronda: r, grupos });
    }
    if (!temAlgumDraw) {
      console.log(`    · sem grupos extraídos (provavelmente endpoint não devolve pairings para este histórico)`);
    }

    escaloes.push({
      age_group:  alvo.age_group,
      nome:       alvo.nome,
      flight_id:  alvo.flight_id,
      is_manuel:  alvo.is_manuel,
      adjacent:   alvo.adjacent,
      rondas:     rondasData,
      _via:       viaUsado, // diagnostic — remover na próxima limpeza se quiseres
    });
  }

  escaloes.sort((a, b) => {
    if (a.is_manuel && !b.is_manuel) return -1;
    if (!a.is_manuel && b.is_manuel) return 1;
    return a.age_group - b.age_group;
  });

  return {
    t:              hist.t,
    name:           tn.name || hist.name,
    date_inicio:    tn.start_date || null,
    date_fim:       tn.end_date   || null,
    campo:          tn.courses    || null,
    rondas_total:   rondas,
    escaloes,
    ultima_atualizacao: new Date().toISOString(),
  };
}

async function main() {
  console.log('══════════════════════════════════════');
  console.log('🎯  USKids Draws — HISTÓRICOS Manuel (one-shot)');
  console.log(`    ${new Date().toLocaleString('pt-PT')}`);
  console.log('══════════════════════════════════════');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const novos = [];
  try {
    for (const h of HISTORICOS) {
      const res = await processarTorneio(page, h);
      if (res) novos.push(res);
      await sleep(DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  // Merge no uskids-draws.json existente
  let prev = { torneios: [] };
  if (fs.existsSync(OUTPUT)) {
    try { prev = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch {}
  }
  const mapa = new Map((prev.torneios || []).map(r => [r.t, r]));
  for (const r of novos) mapa.set(r.t, r);

  const todos = [...mapa.values()].sort((a, b) =>
    (parsearDataISO(a.date_inicio) || '').localeCompare(parsearDataISO(b.date_inicio) || ''));

  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({
    gerado_em: new Date().toISOString(),
    manuel_focus: true,
    janela_dias_antes: prev.janela_dias_antes ?? 3,
    torneios: todos,
  }, null, 2), 'utf8');

  console.log('\n══════════════════════════════════════');
  console.log(`✅  uskids-draws.json — ${todos.length} torneios totais`);
  console.log(`    (${novos.length} históricos novos/actualizados)`);
  console.log('══════════════════════════════════════');
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
