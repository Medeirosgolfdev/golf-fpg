'use strict';

/**
 * fetch-uskids-draws.js
 *
 * Descarrega o DRAW (pairings/tee times) de torneios USKids em 3 fontes:
 *   1. Manuel inscrito (field.json) — escalão dele + adjacentes ±1.
 *   2. Histórico onde o Manuel jogou (member-history/results) — dele + ±1.
 *   3. Escalão do Manuel em provas que ele NÃO jogou (uskids-results.json) —
 *      só o escalão exacto dele, calculado pela data. Assim o draw do escalão
 *      do Manuel aparece mesmo quando ele salta a prova (ex: t=21666 Boys 12).
 *      Desligável com --skip-sem-manuel.
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
const DIR         = path.join(__dirname, '..', 'public', 'data');
const FIELD_PATH  = path.join(DIR, 'uskids-field.json');
const SLIM_PATH   = path.join(DIR, 'uskids-member-history-slim.json');
const RESULTS_PATH= path.join(DIR, 'uskids-results.json');
const OUTPUT      = path.join(DIR, 'uskids-draws.json');

// IDs USKids do Manuel (actual + legacy) — ver src/constants/manuel.ts
const MANUEL_IDS = ['630106', '605933'];

/**
 * Deriva a lista de torneios PASSADOS onde o Manuel jogou, a partir dos dados
 * já scrapados (member-history-slim + uskids-results). Cada entry:
 *   { t, idadeManuel, name }
 * Assim o backfill de draws históricos mantém-se automaticamente actualizado
 * quando o Manuel joga um torneio novo — sem editar este script à mão.
 * O escalão ("Boys N") dá a idade; adjacentes ±1 são descobertos via GetMeta.
 */
function idadeDeAgeGroup(nome) {
  const m = String(nome || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
function historicosManuel() {
  const out = new Map(); // t → { t, idadeManuel, name }
  // 1) member-history-slim (fonte autoritativa da carreira)
  try {
    const slim = JSON.parse(fs.readFileSync(SLIM_PATH, 'utf8'));
    for (const mid of MANUEL_IDS) {
      const j = slim.jogadores?.[mid];
      if (!j) continue;
      for (const [tc, tv] of Object.entries(j.torneios || {})) {
        const idade = idadeDeAgeGroup(tv.ageGroup);
        if (idade == null) continue;
        out.set(String(tc), { t: parseInt(tc, 10), idadeManuel: idade, name: slim.torneios?.[tc]?.name || `t=${tc}` });
      }
    }
  } catch { /* slim pode não existir — sem histórico é aceitável */ }
  // 2) uskids-results (complementa escalões que o slim não cobre)
  try {
    const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
    for (const t of results.resultados || []) {
      if (out.has(String(t.t))) continue;
      for (const e of t.escaloes || []) {
        const jogou = (e.rondas || []).some(r =>
          (r.leaderboard || r.jogadores || []).some(j => isManuelByName(j.nome)));
        if (!jogou) continue;
        const idade = idadeDeAgeGroup(e.nome || e.age_group);
        if (idade != null) out.set(String(t.t), { t: t.t, idadeManuel: idade, name: t.name });
        break;
      }
    }
  } catch { /* results pode não existir */ }
  return [...out.values()];
}

// ── Escalão do Manuel por data (espelho de escalaoManuelParaData em manuel.ts) ──
// month 0-indexed (Abril = 3). Conta o aniversário (29 Abr) para o off-by-one.
const MANUEL_DOB = { year: 2014, month: 3, day: 29 };
function escalaoManuelDeData(dateStr) {
  if (!dateStr) return null;
  let dt;
  if (String(dateStr).includes('/')) {
    const [m, d, y] = String(dateStr).split('/').map(Number);
    dt = new Date(y, m - 1, d);
  } else {
    dt = new Date(dateStr);
  }
  if (isNaN(dt.getTime())) return null;
  const anoT = dt.getFullYear();
  const aniversario = new Date(anoT, MANUEL_DOB.month, MANUEL_DOB.day);
  return anoT - MANUEL_DOB.year - (dt < aniversario ? 1 : 0);
}

/**
 * Fonte 3: torneios do uskids-results.json onde o escalão do Manuel (calculado
 * pela data) EXISTE, mesmo que ele não tenha jogado. Permite mostrar o draw do
 * escalão dele em provas que ele saltou (ex: t=21666 Veteran Qualifier, Boys 12).
 * Cada entry: { t, idadeManuel, name, date_inicio, date_fim }.
 */
function resultadosComEscalaoManuel() {
  const out = [];
  try {
    const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
    for (const t of results.resultados || []) {
      const idade = escalaoManuelDeData(t.date_inicio || t.date);
      if (idade == null) continue;
      const existe = (t.escaloes || []).some(e =>
        (e.nome || e.age_group) === `Boys ${idade}` || idadeDoEscalao(e.nome) === idade);
      if (!existe) continue;
      out.push({
        t: t.t, idadeManuel: idade, name: t.name,
        date_inicio: t.date_inicio || t.date,
        date_fim: t.date_fim || t.date_inicio || t.date,
      });
    }
  } catch { /* results pode não existir */ }
  return out;
}

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
/**
 * Tenta primeiro POST t=1 (final results — o único que devolve pairings para
 * torneios ENCERRADOS; o GET t=0 devolve `flight_players: {}` silenciosamente
 * depois de o torneio fechar). Cai para GET t=0 para torneios em curso/futuros
 * onde o t=1 ainda não está populado. Devolve { players, via }.
 */
async function fetchFlightRound(page, fid, ronda, totalEstim) {
  const totalPags = Math.max(1, Math.ceil((totalEstim || 60) / 20) + 1);

  // 1) POST t=1 (torneios encerrados)
  const collected = {};
  let viaT1 = false;
  for (let p = 1; p <= totalPags; p++) {
    try {
      await sleep(DELAY_MS);
      const url = `${API}?op=GetPlayerTeeTimes&f=${fid}&r=${ronda}&p=${p}&t=1&pt=undefined&jbgr=${Date.now()}&c=1`;
      const d = await pageJSON(page, url, 'POST');
      const fp = d?.flight_players || {};
      const keys = Object.keys(fp);
      if (!keys.length) break;
      viaT1 = true;
      for (const k of keys) collected[k] = fp[k];
      if (keys.length < 20) break;
    } catch { break; }
  }
  if (viaT1 && Object.keys(collected).length) return { players: collected, via: 't=1' };

  // 2) Fallback GET t=0 (torneios em curso / futuros)
  for (let p = 1; p <= totalPags; p++) {
    try {
      await sleep(DELAY_MS);
      const d = await pageJSON(page, `${API}?op=GetPlayerTeeTimes&f=${fid}&r=${ronda}&p=${p}&t=0`);
      const fp = d?.flight_players || {};
      const keys = Object.keys(fp);
      if (!keys.length) break;
      for (const k of keys) collected[k] = fp[k];
      if (keys.length < 20) break; // última página
    } catch { break; }
  }
  return { players: collected, via: 't=0' };
}

/**
 * Descobre os escalões alvo (Manuel + adjacentes ±1) a partir do meta do
 * signupanytime, para torneios PASSADOS que já não estão no field.json.
 * `idadeManuel` = idade do escalão do Manuel neste torneio (ex: 12 → "Boys 12").
 */
function alvosDoMeta(meta, idadeManuel, opts = {}) {
  const ageGroups = meta.age_groups || {};
  const flights   = meta.flights    || {};
  const flightPorNome = {}; // "Boys 11" → { fid, age_group, inscritos }
  for (const [fid, f] of Object.entries(flights)) {
    const ag = ageGroups[f.age_group];
    if (!ag?.name || flightPorNome[ag.name]) continue;
    flightPorNome[ag.name] = { fid: parseInt(fid, 10), age_group: parseInt(f.age_group, 10), inscritos: f.registered || 60 };
  }
  const alvos = [];
  // exactOnly: só o escalão do Manuel (Fonte 3 — provas sem ele). Caso normal: ±1.
  const nomes = opts.exactOnly
    ? [`Boys ${idadeManuel}`]
    : [`Boys ${idadeManuel}`, `Boys ${idadeManuel - 1}`, `Boys ${idadeManuel + 1}`];
  nomes.forEach((nome, i) => {
    const f = flightPorNome[nome];
    if (!f) return;
    alvos.push({ age_group: f.age_group, nome, flight_id: f.fid, is_manuel: i === 0, adjacent: i > 0, totalEstim: f.inscritos });
  });
  return alvos;
}

// ── Processar um torneio completo ────────────────────────────────────────
// `spec` = { torneio, alvos } (via field.json) OU { torneio, idadeManuel } (histórico).
async function processarTorneio(page, spec) {
  const { torneio, idadeManuel, soExato } = spec;
  let { alvos } = spec;
  const ax = torneio.ax || 1129;
  console.log(`\n▶ ${torneio.name} (t=${torneio.t}) — ${diasAte(torneio.date_inicio)}d`);

  let meta;
  try {
    const metaP = esperarGetMeta(page, torneio.t, 15000);
    await page.goto(IFRAME_URL(torneio.t, ax), { waitUntil: 'domcontentloaded', timeout: 18000 });
    meta = await metaP;
  } catch (err) {
    console.warn(`  ⚠️  GetMeta falhou: ${err.message}`);
    return null;
  }

  const tn     = meta.tournament || {};
  const rondas = tn.rounds || torneio.rondas || 2;

  // Histórico: descobrir alvos a partir do meta (o field.json já não os tem)
  if (!alvos && idadeManuel != null) {
    alvos = alvosDoMeta(meta, idadeManuel, { exactOnly: soExato });
    if (!alvos.length) { console.warn(`  ✗ Escalão "Boys ${idadeManuel}" não encontrado nos flights — saltar.`); return null; }
    console.log(`  alvos: ${alvos.map(a => (a.is_manuel ? '★' : '·') + a.nome).join(', ')}`);
  }
  if (!alvos || !alvos.length) return null;

  const escaloes = [];
  for (const alvo of alvos) {
    const tag = alvo.is_manuel ? '★' : '·';
    console.log(`  ${tag} ${alvo.nome} (ag=${alvo.age_group}, f=${alvo.flight_id})`);

    // Total estimado de inscritos (para paginação)
    const inscrEstim = alvo.totalEstim || 60;

    const rondasData = [];
    let temAlgumDraw = false;
    for (let r = 1; r <= rondas; r++) {
      const { players, via } = await fetchFlightRound(page, alvo.flight_id, r, inscrEstim);
      const grupos = extrairGrupos(players, r);
      const nJogs  = grupos.reduce((s, g) => s + g.jogadores.length, 0);
      if (grupos.length) temAlgumDraw = true;
      const ptCount = grupos.reduce(
        (s, g) => s + g.jogadores.filter(j => j.pais === 'PT').length, 0);
      console.log(`    R${r} (${via}): ${grupos.length} grupos | ${nJogs} jogadores${ptCount ? `  🇵🇹 ${ptCount}` : ''}`);
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

  // Merge com output anterior primeiro — para saber que torneios já têm draw
  let outputAnterior = { torneios: [] };
  if (fs.existsSync(OUTPUT)) {
    try { outputAnterior = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch {}
  }
  const jaTemDraw = new Set(
    (outputAnterior.torneios || [])
      .filter(t => (t.escaloes || []).some(e => (e.rondas || []).some(r => (r.grupos || []).length)))
      .map(t => t.t)
  );

  const aProcessar = [];   // { torneio, alvos? , idadeManuel? }
  const skipHistorico = process.argv.includes('--skip-historico');
  const forceHistorico = process.argv.includes('--force-historico');

  // ── Fonte 1: torneios FUTUROS / EM CURSO do field.json (com alvos) ──
  if (fs.existsSync(FIELD_PATH)) {
    const field = JSON.parse(fs.readFileSync(FIELD_PATH, 'utf8'));
    const candidatos = (field.torneios || []).filter(eElegivel);
    console.log(`\n   Field: ${candidatos.length} torneios elegíveis (≤ ${DIAS_ANTES}d no futuro ou em curso)`);
    for (const t of candidatos) {
      const alvos = escaloesAlvoParaTorneio(t);
      if (!alvos.length) { console.log(`   · t=${t.t} ${t.name} — Manuel não inscrito`); continue; }
      for (const a of alvos) {
        const esc = (t.escaloes || []).find(e => e.age_group === a.age_group);
        a.totalEstim = esc?.inscritos || 60;
      }
      aProcessar.push({ torneio: t, alvos });
      console.log(`   ✓ t=${t.t} ${t.name} → ${alvos.map(a => (a.is_manuel ? '★' : '') + a.nome).join(', ')}`);
    }
  } else {
    console.warn(`   ⚠️  ${FIELD_PATH} não existe — só backfill histórico.`);
  }

  // ── Fonte 2: torneios PASSADOS onde o Manuel jogou (backfill via GetMeta) ──
  // Salta os que já têm draw guardado (não muda) a menos que --force-historico.
  if (!skipHistorico) {
    const hist = historicosManuel();
    const idsField = new Set(aProcessar.map(x => x.torneio.t));
    let n = 0;
    for (const h of hist) {
      if (idsField.has(h.t)) continue;                       // já vai ser processado via field
      if (jaTemDraw.has(h.t) && !forceHistorico) continue;   // já tem draw → não re-scrapa
      aProcessar.push({ torneio: { t: h.t, name: h.name, date_inicio: null, date_fim: null }, idadeManuel: h.idadeManuel });
      console.log(`   ⏳ histórico t=${h.t} ${h.name} (Boys ${h.idadeManuel})`);
      n++;
    }
    console.log(`\n   Histórico: ${hist.length} torneios do Manuel, ${n} por scrapar${forceHistorico ? ' (--force-historico)' : ''}.`);
  }

  // ── Fonte 3: escalão do Manuel em provas que ele NÃO jogou (pedido 2026-07-29) ──
  // Todos os torneios do uskids-results.json onde "Boys {idade do Manuel}" existe.
  // Só o escalão exacto dele (soExato) — "pelo menos o escalão do Manuel".
  const skipSemManuel = process.argv.includes('--skip-sem-manuel');
  if (!skipHistorico && !skipSemManuel) {
    const alvo3 = resultadosComEscalaoManuel();
    const idsJa = new Set(aProcessar.map(x => x.torneio.t));
    let n3 = 0;
    for (const r of alvo3) {
      if (idsJa.has(r.t)) continue;                          // já vai via field/histórico
      if (jaTemDraw.has(r.t) && !forceHistorico) continue;   // já tem draw → não re-scrapa
      aProcessar.push({
        torneio: { t: r.t, name: r.name, date_inicio: r.date_inicio, date_fim: r.date_fim },
        idadeManuel: r.idadeManuel,
        soExato: true,
      });
      console.log(`   ➕ sem-Manuel t=${r.t} ${r.name} (Boys ${r.idadeManuel})`);
      n3++;
    }
    console.log(`\n   Escalão do Manuel s/ participação: ${alvo3.length} candidatos, ${n3} por scrapar.`);
  }

  if (!aProcessar.length) {
    console.log('\n   Nada para descarregar.');
    if (!fs.existsSync(OUTPUT)) {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(OUTPUT, JSON.stringify({
        gerado_em: new Date().toISOString(), manuel_focus: true, janela_dias_antes: DIAS_ANTES, torneios: [],
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
    for (const spec of aProcessar) {
      const res = await processarTorneio(page, spec);
      if (res) novos.push(res);
      await sleep(DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  const mapa = new Map((outputAnterior.torneios || []).map(r => [r.t, r]));
  for (const r of novos) mapa.set(r.t, r);

  // Cull: manter permanentemente qualquer torneio que TENHA draw (os históricos
  // do Manuel não desaparecem); os futuros/em-curso ainda sem draw ficam se
  // terminaram há ≤ 14 dias (janela para backfill enquanto o draw não sai).
  const HOJE_LIMITE = -14;
  const temDraw = t => (t.escaloes || []).some(e => (e.rondas || []).some(r => (r.grupos || []).length));
  const todos = [...mapa.values()]
    .filter(t => temDraw(t) || diasAte(t.date_fim || t.date_inicio) >= HOJE_LIMITE)
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
