'use strict';

/**
 * fetch-uskids-draws.js
 *
 * Descarrega o DRAW (pairings/tee times) de torneios USKids onde o Manuel
 * está inscrito, no escalão dele e nos escalões adjacentes (±1 idade).
 *
 * Corre no fim do workflow uskids-results.yml.
 *
 * Fonte de detecção do Manuel: public/data/uskids-field.json (gerado pelo
 * workflow uskids-field). Procura jogador com nome contendo "Manuel" +
 * "Medeiros" e país PT — apanha as 4 variantes documentadas.
 *
 * Janela: torneios com data de início ≤ 3 dias no futuro (e ainda não
 * terminados — date_fim ≥ ontem). Antes disso o draw raramente está
 * publicado; o script não falha, só salta sem gravar nada.
 *
 * Output: public/data/uskids-draws.json com estrutura agrupada por
 * (torneio → escalão → ronda → grupos) — cada grupo tem tee_time,
 * start_hole, course, e lista de jogadores.
 *
 * Fonte do draw:
 *   GET signupanytime LinksAJAX op=GetPlayerTeeTimes&f={fid}&r={r}&p={p}&t=0
 *   (mesmo endpoint que field/results — para torneios pré-jogo devolve nomes
 *   e tee times mas strokes vazios. Validado com fetch-uskids-field.js.)
 */

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ── Detecção do Manuel (espelho de src/constants/manuel.ts) ──────────────
const MANUEL_NAME_REGEX = /\bmanuel\b/i;
const MANUEL_SURNAME_REGEX = /\bmedeiros\b/i;
const MANUEL_FALSE_POSITIVE_FIRSTNAMES = /\b(joao|antonio|jose|pedro|miguel|ricardo|luis|carlos)\b/i;

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[.\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isManuelByName(name) {
  if (!name) return false;
  const n = normName(name);
  if (!MANUEL_NAME_REGEX.test(n)) return false;
  if (!MANUEL_SURNAME_REGEX.test(n)) return false;
  if (MANUEL_FALSE_POSITIVE_FIRSTNAMES.test(n)) return false;
  return true;
}

// ── Configuração ────────────────────────────────────────────────────────
const DELAY_MS = 400;
const DIR        = path.join(__dirname, '..', 'public', 'data');
const FIELD_PATH = path.join(DIR, 'uskids-field.json');
const OUTPUT     = path.join(DIR, 'uskids-draws.json');

/** Janela em dias antes do torneio para começar a tentar descarregar o draw. */
const DIAS_ANTES = 3;

const IFRAME_URL = (t, ax = 1129) =>
  `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=${ax}&t=${t}`;
const API = 'https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Utilitários de data ─────────────────────────────────────────────────
function parsearDataISO(s) {
  if (!s) return null;
  if (s.includes('-')) return s;
  const [m, d, y] = s.split('/');
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function diasAte(dateStr) {
  const iso = parsearDataISO(dateStr);
  if (!iso) return 999;
  // Comparar em dias civis (não com horas) para evitar off-by-one por timezone
  const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0);
  const alvo = new Date(iso + 'T00:00:00Z');
  return Math.round((alvo - hoje) / 86400000);
}

/** Torneio elegível para descarregar draw — está nos próximos DIAS_ANTES
 *  ou em curso (date_fim ≥ ontem). */
function eElegivel(t) {
  const inicio = diasAte(t.date_inicio);
  const fim    = diasAte(t.date_fim || t.date_inicio);
  return inicio <= DIAS_ANTES && fim >= -1;
}

// ── Identificar age groups de interesse a partir do field.json ───────────
/**
 * Extrai a idade de um nome de escalão tipo "Boys 12" → 12.
 * Devolve null para escalões com range ("Boys 13-14", "Boys 7 & Under") —
 * essas categorias não são consideradas adjacentes a um escalão single-year.
 */
function idadeDoEscalao(nome) {
  if (!nome) return null;
  const m = nome.match(/^Boys\s+(\d+)\s*$/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Devolve os escalões alvo para um torneio:
 *   - o escalão onde Manuel está inscrito (is_manuel: true)
 *   - os adjacentes ±1 idade (mesmo "Boys", idade ±1) que existam neste torneio
 * Cada item: { age_group, nome, flight_id, is_manuel, adjacent }.
 */
function escaloesAlvoParaTorneio(torneio) {
  const escs = torneio.escaloes || [];
  // Encontrar escalão(ões) com Manuel
  const manuelEscs = escs.filter(e => {
    const jogs = e.jogadores || [];
    return jogs.some(j => isManuelByName(j.nome) && (j.pais || '').toUpperCase() === 'PT');
  });
  if (!manuelEscs.length) return [];

  const alvo = [];
  for (const me of manuelEscs) {
    alvo.push({
      age_group: me.age_group,
      nome: me.nome,
      flight_id: me.flight_id,
      is_manuel: true,
      adjacent: false,
    });
    const idade = idadeDoEscalao(me.nome);
    if (idade == null) continue;
    for (const candidato of escs) {
      if (candidato.age_group === me.age_group) continue;
      const idC = idadeDoEscalao(candidato.nome);
      if (idC == null) continue;
      if (Math.abs(idC - idade) !== 1) continue;
      // Evitar duplicados
      if (alvo.some(a => a.age_group === candidato.age_group)) continue;
      alvo.push({
        age_group: candidato.age_group,
        nome: candidato.nome,
        flight_id: candidato.flight_id,
        is_manuel: false,
        adjacent: true,
      });
    }
  }
  return alvo;
}

// ── HTTP via Playwright ────────────────────────────────────────────────
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

// ── Extrair pairings de flight_players ─────────────────────────────────
/**
 * Agrupa jogadores por (group_number, tee_time, start_hole) → "grupo".
 * Devolve array ordenado por tee_time (string HH:MM ordena lexicograficamente).
 */
function extrairGrupos(flightPlayers, ronda) {
  const grupos = new Map(); // chave "g|t|h" → {group_number, tee_time, start_hole, course, jogadores}
  for (const j of Object.values(flightPlayers || {})) {
    if (j.status !== 1) continue;
    const rd = j.rounds?.[String(ronda)] || j.rounds?.[ronda] || {};
    const grp = rd.group_number || 0;
    const tt  = rd.start_time   || '';
    const sh  = rd.start_hole   || rd.starting_hole || 1;
    const cn  = rd.course_name  || rd.course || '';
    if (!grp && !tt) continue; // sem informação de pairing — salta
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
  // Ordenar jogadores dentro de cada grupo por nome para output estável
  for (const g of grupos.values()) {
    g.jogadores.sort((a, b) => a.nome.localeCompare(b.nome));
  }
  // Ordenar grupos por (tee_time, group_number, start_hole)
  return [...grupos.values()].sort((a, b) => {
    if (a.tee_time !== b.tee_time) return a.tee_time.localeCompare(b.tee_time);
    if (a.group_number !== b.group_number) return a.group_number - b.group_number;
    return a.start_hole - b.start_hole;
  });
}

// ── Descarregar todas as páginas de um flight num round ──────────────────
async function fetchFlightRound(page, fid, ronda, totalEstim) {
  const players = {};
  const totalPags = Math.max(1, Math.ceil((totalEstim || 60) / 20) + 1);
  for (let p = 1; p <= totalPags; p++) {
    try {
      await sleep(DELAY_MS);
      const d = await pageJSON(page, `${API}?op=GetPlayerTeeTimes&f=${fid}&r=${ronda}&p=${p}&t=0`);
      const fp = d?.flight_players || {};
      const keys = Object.keys(fp);
      if (!keys.length) break;
      for (const k of keys) players[k] = fp[k];
      if (keys.length < 20) break; // última página
    } catch { break; }
  }
  return players;
}

// ── Processar um torneio completo ────────────────────────────────────────
async function processarTorneio(page, torneio, alvos) {
  console.log(`\n▶ ${torneio.name} (t=${torneio.t}) — ${diasAte(torneio.date_inicio)}d`);

  let meta;
  try {
    const metaP = esperarGetMeta(page, torneio.t, 12000);
    await page.goto(IFRAME_URL(torneio.t, 1129), { waitUntil: 'domcontentloaded', timeout: 15000 });
    meta = await metaP;
  } catch (err) {
    console.warn(`  ⚠️  GetMeta falhou: ${err.message}`);
    return null;
  }

  const tn       = meta.tournament || {};
  const rondas   = tn.rounds || torneio.rondas || 2;

  const escaloes = [];
  for (const alvo of alvos) {
    const tag = alvo.is_manuel ? '★' : '·';
    console.log(`  ${tag} ${alvo.nome} (ag=${alvo.age_group}, f=${alvo.flight_id})`);

    // Obter total estimado de inscritos a partir do field.json (passado via alvo.totalEstim)
    const inscrEstim = alvo.totalEstim || 60;

    const rondasData = [];
    let temAlgumDraw = false;
    for (let r = 1; r <= rondas; r++) {
      const flightPlayers = await fetchFlightRound(page, alvo.flight_id, r, inscrEstim);
      const grupos = extrairGrupos(flightPlayers, r);
      const nJogs  = grupos.reduce((s, g) => s + g.jogadores.length, 0);
      if (grupos.length) temAlgumDraw = true;
      const ptCount = grupos.reduce(
        (s, g) => s + g.jogadores.filter(j => j.pais === 'PT').length, 0);
      console.log(`    R${r}: ${grupos.length} grupos | ${nJogs} jogadores${ptCount ? `  🇵🇹 ${ptCount}` : ''}`);
      rondasData.push({ ronda: r, grupos });
    }

    if (!temAlgumDraw) {
      console.log(`    · sem draw publicado ainda`);
    }

    escaloes.push({
      age_group:  alvo.age_group,
      nome:       alvo.nome,
      flight_id:  alvo.flight_id,
      is_manuel:  alvo.is_manuel,
      adjacent:   alvo.adjacent,
      rondas:     rondasData,
    });
  }

  // Manuel primeiro
  escaloes.sort((a, b) => {
    if (a.is_manuel && !b.is_manuel) return -1;
    if (!a.is_manuel && b.is_manuel) return 1;
    return a.age_group - b.age_group;
  });

  return {
    t:              torneio.t,
    name:           tn.name || torneio.name,
    date_inicio:    tn.start_date || torneio.date_inicio,
    date_fim:       tn.end_date   || torneio.date_fim,
    campo:          tn.courses    || torneio.campo || null,
    rondas_total:   rondas,
    escaloes,
    ultima_atualizacao: new Date().toISOString(),
  };
}

// ── MAIN ────────────────────────────────────────────────────────────────
async function main() {
  console.log('══════════════════════════════════════');
  console.log('🎯  USKids Draws (Manuel + adjacentes ±1)');
  console.log(`    ${new Date().toLocaleString('pt-PT')}`);
  console.log('══════════════════════════════════════');

  if (!fs.existsSync(FIELD_PATH)) {
    console.warn(`⚠️  ${FIELD_PATH} não existe — workflow uskids-field tem de correr primeiro.`);
    return;
  }

  const field = JSON.parse(fs.readFileSync(FIELD_PATH, 'utf8'));
  const candidatos = (field.torneios || []).filter(eElegivel);
  console.log(`\n   ${candidatos.length} torneios elegíveis (≤ ${DIAS_ANTES}d no futuro ou em curso)`);

  // Filtrar para apenas torneios onde Manuel está inscrito + calcular alvos
  const aProcessar = [];
  for (const t of candidatos) {
    const alvos = escaloesAlvoParaTorneio(t);
    if (!alvos.length) {
      console.log(`   · t=${t.t} ${t.name} — Manuel não inscrito`);
      continue;
    }
    // Anotar totalEstim em cada alvo (para paginação)
    for (const a of alvos) {
      const esc = (t.escaloes || []).find(e => e.age_group === a.age_group);
      a.totalEstim = esc?.inscritos || 60;
    }
    aProcessar.push({ torneio: t, alvos });
    console.log(`   ✓ t=${t.t} ${t.name} → ${alvos.length} escalões: ${alvos.map(a => (a.is_manuel ? '★' : '') + a.nome).join(', ')}`);
  }

  if (!aProcessar.length) {
    console.log('\n   Nada para descarregar.');
    // Mesmo assim, escrever ficheiro vazio se não existir (para o git diff funcionar)
    if (!fs.existsSync(OUTPUT)) {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(OUTPUT, JSON.stringify({
        gerado_em: new Date().toISOString(),
        manuel_focus: true,
        janela_dias_antes: DIAS_ANTES,
        torneios: [],
      }, null, 2), 'utf8');
      console.log(`   📝 Escreveu ${OUTPUT} vazio.`);
    }
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const novos = [];
  try {
    for (const { torneio, alvos } of aProcessar) {
      const res = await processarTorneio(page, torneio, alvos);
      if (res) novos.push(res);
      await sleep(DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  // Merge com output anterior — preserva torneios fora da janela actual
  let outputAnterior = { torneios: [] };
  if (fs.existsSync(OUTPUT)) {
    try { outputAnterior = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch {}
  }
  const mapa = new Map((outputAnterior.torneios || []).map(r => [r.t, r]));
  for (const r of novos) mapa.set(r.t, r);

  // Limpar torneios já terminados há muito (> 14 dias) — não fazem falta no draw
  const HOJE_LIMITE = -14;
  const todos = [...mapa.values()]
    .filter(t => diasAte(t.date_fim || t.date_inicio) >= HOJE_LIMITE)
    .sort((a, b) => (parsearDataISO(a.date_inicio) || '').localeCompare(parsearDataISO(b.date_inicio) || ''));

  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({
    gerado_em: new Date().toISOString(),
    manuel_focus: true,
    janela_dias_antes: DIAS_ANTES,
    torneios: todos,
  }, null, 2), 'utf8');

  console.log('\n══════════════════════════════════════');
  console.log(`✅  uskids-draws.json — ${todos.length} torneios`);
  console.log('══════════════════════════════════════');
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
