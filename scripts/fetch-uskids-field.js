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
const { extrairAncoras, fundirAncoras, aplicarDatasInscricao } = require('./lib/uskids-reg-dates');
const { criarPlano, proximoIntervalo, aplicarResultado } = require('./lib/uskids-scan-plan');

// ── Filtros de descoberta ─────────────────────
// A classificação (tipo do GetMeta + palavras-chave + excepções por tcode)
// vive em scripts/lib/uskids-classify.js, com testes.
const { incluirTorneio, FORCAR_INCLUIR, TIPO_LABEL } = require('./lib/uskids-classify');

// Prefixos de escalão — apanha "Boys 12", "Boys 13-14", "Boys 13 & Under", etc.
const ESCALOES_PREFIXOS = ['boys 9', 'boys 10', 'boys 11', 'boys 12', 'boys 13'];
const escalaoComNomes = (nome) => ESCALOES_PREFIXOS.some(p => nome.toLowerCase().startsWith(p));

// ── Varredura de tcodes (Fase 1) ─────────────────────
// Os tcodes do signupanytime são sequenciais por criação, mas só uma fatia
// pertence à conta internacional (ax=1129) — daí os buracos. Medido 2026-08-23:
// na zona viva (t>=23061) o maior buraco real é de 15 tcodes; abaixo do topo
// conhecido há buracos de 600+ (21610→22243). A zona já conhecida é varrida por
// inteiro (Passagem A) e a fronteira segue o plano de scan-plan.js, que nunca
// desiste definitivamente num buraco.
const SCAN_CONCURRENCY   = 5;    // pedidos GetMeta em paralelo
const DELAY_SCAN   = 60;
const DELAY_FETCH  = 400;
// Redescobrir se cache tiver mais de 3 dias
const CACHE_MAX_DIAS = 0; // temporário: forçar redescoberta na próxima corrida

const DIR        = path.join(__dirname, '..', 'public', 'data');
const CACHE_PATH = path.join(DIR, 'uskids-discovery-cache.json');
const OUTPUT     = path.join(DIR, 'uskids-field.json');
const ANCHORS    = path.join(DIR, 'uskids-pid-anchors.json');

const IFRAME_URL = (t, ax = 1129) =>
  `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=${ax}&t=${t}`;
const API = 'https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx';
const UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ─────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────

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

function cacheDesactualizada() {
  if (!fs.existsSync(CACHE_PATH)) return true;
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    if (!cache.gerado_em) return true;
    const dias = (Date.now() - new Date(cache.gerado_em).getTime()) / 86400000;
    return dias >= CACHE_MAX_DIAS;
  } catch { return true; }
}

/** ⚠ O `pid` (chave do flight_players) é um auto-incremento GLOBAL da tabela de
 *  inscrições do signupanytime, não um índice do flight: ordena-se sempre pela
 *  ordem real de inscrição (verificado 2026-08-23 contra os nossos firstSeen no
 *  Belgium Invitational — 7/7 na ordem certa, de 15 Mai a 5 Ago). É a ÚNICA
 *  pista sobre quando cada miúdo se inscreveu: a API não publica data de
 *  inscrição em lado nenhum (GetPlayerTeeTimes só dá nome/país/cidade/tee, e
 *  não há op= de registos — testados 9). Guardá-lo permite datar por
 *  interpolação (ver estimarDatasInscricao). */
function parsearJogadores(flightPlayers) {
  return Object.entries(flightPlayers || {})
    .filter(([, p]) => p.status === 1)
    .map(([pid, p]) => ({
      nome:   `${p.first || ''} ${p.last || ''}`.trim(),
      pais:   (p.country || '').toUpperCase(),
      cidade: p.place || '',
      pid:    Number(pid) || null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Janela (dias) durante a qual uma desinscrição continua visível. */
const REMOVED_WINDOW_DAYS = 60;

/** Normaliza nome para matching entre recolhas (lowercase + whitespace colapsado). */
function normNome(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Carrega o field anterior para preservar firstSeen e o histórico cumulativo
 *  de desinscrições (removed).
 *  Retorna { firstSeenMap, prevByEscalao, prevRemoved } */
function carregarFieldAnterior() {
  const empty = { firstSeenMap: new Map(), prevByEscalao: new Map(), prevRemoved: new Map() };
  try {
    if (!fs.existsSync(OUTPUT)) return empty;
    const prev = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
    const fsMap = new Map();      // "t:nomeNorm" → firstSeen
    const byEsc = new Map();      // "t:escalaoNome" → Map(nomeNorm → {nome, pais})
    const remMap = new Map();     // "t:escalaoNome" → Map(nomeNorm → {nome, removedAt, pais})
    for (const t of (prev.torneios || [])) {
      for (const e of (t.escaloes || [])) {
        const escKey = `${t.t}:${e.nome}`;
        const set = new Map();
        for (const j of (e.jogadores || [])) {
          const norm = normNome(j.nome);
          fsMap.set(`${t.t}:${norm}`, j.firstSeen || prev.gerado_em || null);
          set.set(norm, { nome: j.nome, pais: j.pais ?? null });
        }
        if (set.size) byEsc.set(escKey, set);
        // Preservar desinscrições já registadas (formato cumulativo {nome,removedAt,pais})
        if (Array.isArray(e.removed) && e.removed.length) {
          const inner = new Map();
          for (const r of e.removed) {
            if (!r) continue;
            // Compatibilidade com formato antigo (string[]) — sem removedAt
            const obj = typeof r === 'string'
              ? { nome: r, removedAt: prev.gerado_em || null, pais: null }
              : { nome: r.nome, removedAt: r.removedAt || prev.gerado_em || null, pais: r.pais ?? null };
            if (obj.nome) inner.set(normNome(obj.nome), obj);
          }
          if (inner.size) remMap.set(escKey, inner);
        }
      }
    }
    return { firstSeenMap: fsMap, prevByEscalao: byEsc, prevRemoved: remMap };
  } catch { return empty; }
}

/** Aplica firstSeen e calcula removed cumulativo (desinscrições) por escalão.
 *  - novas saídas: estava na recolha anterior e já não está → removedAt = agora
 *  - preserva saídas anteriores ainda dentro da janela de REMOVED_WINDOW_DAYS dias
 *  - quem voltou a inscrever-se é retirado da lista */
function aplicarFirstSeen(resultados, { firstSeenMap, prevByEscalao, prevRemoved }) {
  const agora = new Date().toISOString();
  const agoraMs = Date.now();
  for (const t of resultados) {
    for (const e of (t.escaloes || [])) {
      // firstSeen
      if (e.jogadores) {
        for (const j of e.jogadores) {
          const key = `${t.t}:${normNome(j.nome)}`;
          j.firstSeen = firstSeenMap.get(key) || agora;
        }
      }
      if (!e.jogadores) continue; // sem lista de nomes → não há tracking de saídas

      const escKey = `${t.t}:${e.nome}`;
      const curSet = new Set(e.jogadores.map(j => normNome(j.nome)));

      // Acumulador de desinscrições: começa com as preservadas (ainda na janela)
      const acc = new Map(); // nomeNorm → {nome, removedAt, pais}
      const prevRem = prevRemoved.get(escKey);
      if (prevRem) {
        for (const [nk, obj] of prevRem) {
          if (curSet.has(nk)) continue; // re-inscreveu-se → sai da lista
          const ageMs = obj.removedAt ? (agoraMs - new Date(obj.removedAt).getTime()) : 0;
          if (ageMs / 86400_000 > REMOVED_WINDOW_DAYS) continue; // fora da janela
          acc.set(nk, obj);
        }
      }

      // Novas saídas nesta recolha (preserva nome e país originais)
      const prevSet = prevByEscalao.get(escKey);
      if (prevSet) {
        for (const [nk, info] of prevSet) {
          if (curSet.has(nk) || acc.has(nk)) continue;
          acc.set(nk, { nome: info.nome, removedAt: agora, pais: info.pais ?? null });
        }
      }

      if (acc.size) {
        e.removed = [...acc.values()].sort((a, b) =>
          String(b.removedAt || '').localeCompare(String(a.removedAt || '')));
      } else {
        delete e.removed;
      }
    }
  }
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

/** GetMeta por HTTP directo (sem browser) — a API do signupanytime é pública
 *  server-side. É ~15× mais rápido que um page.goto por tcode, o que torna
 *  viável varrer milhares de tcodes por corrida. Devolve o objecto tournament
 *  ou null quando o tcode não existe. */
async function metaTournament(t) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctl = new AbortController();
    const to  = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch(`${API}?op=GetMeta&t=${t}`, {
        headers: {
          'User-Agent': UA,
          'Accept':     'application/json, text/javascript, */*; q=0.01',
          'Referer':    IFRAME_URL(t),
        },
        signal: ctl.signal,
      });
      clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      // ⚠ Um tcode que não existe responde HTTP 200 com CORPO VAZIO. Chamar
      // r.json() aí lança, e tratar essa excepção como falha de rede faz cada
      // tcode inexistente custar 3 tentativas × 12 s — a varredura da fronteira
      // (toda ela vazia, por definição) deixava de acabar em tempo útil.
      const txt = (await r.text()).trim();
      if (!txt) return null;                    // não existe
      let j;
      try { j = JSON.parse(txt); } catch { return null; }   // lixo ⇒ não existe
      return j?.tournament?.name ? j.tournament : null;
    } catch {
      clearTimeout(to);
      // ⚠ Ao fim das tentativas devolvemos ERRO, não null: um tcode que não
      // responde NÃO é um tcode vazio. Confundir os dois faz uma falha de rede
      // parecer o fim da fronteira e trunca a varredura em silêncio.
      if (attempt === 3) return ERRO;
      await sleep(400 * attempt);
    }
  }
  return ERRO;
}

/** Sentinela: o tcode não respondeu (≠ o tcode não existe). */
const ERRO = Symbol('erro-rede');

/** Varre [de..ate] em paralelo. `registar(t, tournament)` decide o que guardar.
 *  Devolve { total, ultimoT, erros } contando TODOS os torneios existentes
 *  (mesmo os não-internacionais) — é isso que diz se a fronteira tem vida.
 *  Um intervalo com erros a mais é repetido uma vez antes de contar como vazio. */
async function varrerIntervalo(de, ate, registar) {
  const ts = [];
  for (let t = de; t <= ate; t++) ts.push(t);
  const achados = [];
  let erros = 0;
  let i = 0;
  async function worker() {
    while (i < ts.length) {
      const t  = ts[i++];
      const tn = await metaTournament(t);
      if (tn === ERRO) erros++;
      else if (tn) achados.push([t, tn]);
      await sleep(DELAY_SCAN);
    }
  }
  await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker));
  achados.sort((a, b) => a[0] - b[0]);
  let ultimoT = 0;
  for (const [t, tn] of achados) { ultimoT = t; registar(t, tn); }
  return { total: achados.length, ultimoT, erros };
}

/** Fracção de tcodes que não responderam a partir da qual o intervalo não é de
 *  confiança — é repetido antes de poder contar como vazio. */
const ERRO_TOLERADO = 0.25;

/** varrerIntervalo com uma repetição quando a rede estragou o intervalo. */
async function varrerIntervaloFiavel(de, ate, registar) {
  let r = await varrerIntervalo(de, ate, registar);
  const n = ate - de + 1;
  if (r.total === 0 && r.erros > n * ERRO_TOLERADO) {
    console.warn(`   ⚠️  t=${de}…${ate}: ${r.erros}/${n} sem resposta — a repetir`);
    await sleep(2000);
    const r2 = await varrerIntervalo(de, ate, registar);
    r = { total: r2.total, ultimoT: r2.ultimoT, erros: r.erros + r2.erros,
          degradado: r2.total === 0 && r2.erros > n * ERRO_TOLERADO };
  }
  return r;
}

// ─────────────────────────────────────────────
// FASE 1: DESCOBERTA
// ─────────────────────────────────────────────

async function descobrirTorneios() {
  console.log('\n🔍 FASE 1 — Descoberta');

  let cache = { ultimo_t: 21079, varredura_max_t: 0, torneios: [], gerado_em: null };
  if (fs.existsSync(CACHE_PATH)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch {}
  }

  // Filtrar logo à entrada: remove excluídos de runs anteriores
  const conhecidos = new Map(
    cache.torneios
      .filter(t => incluirTorneio(t.t, t.name, t.type))
      .map(t => [t.t, t])
  );
  let encontrados = 0;

  const guardar = (t, tn) => {
    conhecidos.set(t, {
      t, name: tn.name.trim(),
      date_inicio: tn.start_date, date_fim: tn.end_date,
      rondas: tn.rounds, campo: tn.courses || null, fee_18: tn.fee_18 || null,
      tour: tn.tour || null, type: tn.type ?? null,
    });
  };

  /** Chamado para CADA tcode que existe (internacional ou não). Filtra e regista. */
  const registar = (t, tn) => {
    const nome    = tn.name.trim();
    const incluir = incluirTorneio(t, nome, tn.type);
    if (!incluir || diasAte(tn.start_date) < -30) return;
    if (!conhecidos.has(t)) {
      const cls = TIPO_LABEL[tn.type] ? ` [${TIPO_LABEL[tn.type]}]` : '';
      console.log(`  ✅ NOVO  t=${t}  ${tn.start_date}  ${nome}${cls}`);
      encontrados++;
    }
    guardar(t, tn);
  };

  // Garantir que todos os FORCAR_INCLUIR estão na cache
  for (const t of FORCAR_INCLUIR) {
    if (conhecidos.has(t)) continue;
    const tn = await metaTournament(t);
    if (tn) { guardar(t, tn); console.log(`   ✅ Forçado: t=${t} ${tn.name.trim()}`); }
    else console.warn(`   ⚠️  Forçado t=${t} sem meta`);
  }

  const tKnownMax = Math.max(0, cache.varredura_max_t || 0, ...conhecidos.keys());

  // ── Passagem A: zona já conhecida (âncora → maior t conhecido) ───────────
  // Sem paragem antecipada. Entre torneios conhecidos há buracos enormes de
  // tcodes de outras contas (21610→22243 = 632 vazios): era aí que a varredura
  // antiga morria ao fim de 100 misses e nunca mais descobria nada (último
  // torneio novo: 6 Jul 2026).
  const tStartA = (cache.ultimo_t || 0) + 1;
  if (tStartA <= tKnownMax) {
    console.log(`   ↻ Passagem A: t=${tStartA}…${tKnownMax} (zona conhecida, varrida por inteiro)`);
    await varrerIntervalo(tStartA, tKnownMax, registar);
  }

  // ── Passagem B: fronteira (acima do maior t conhecido) ───────────────────
  // A paragem NUNCA é definitiva — ver scripts/lib/uskids-scan-plan.js. A rede
  // densa segue o último tcode vivo (margem dinâmica) e, se um buraco absurdo a
  // interromper, as sondas de salto procuram vida muito mais à frente e a densa
  // retoma. Só termina quando as sondas esgotam o alcance sem achar nada.
  let plano = criarPlano({ inicio: tKnownMax + 1 });
  console.log(`   ⏩ Passagem B: t=${tKnownMax + 1}… (densa até últimoVivo+${plano.margemDensa}, sondas até +${plano.tectoSonda})`);
  // Disjuntor: com o servidor em baixo cada intervalo custa minutos e a
  // varredura comeria a corrida inteira (incl. a Fase 2, que é o que alimenta a
  // página). Ao fim de DEGRADADOS_SEGUIDOS abandona-se a fronteira — mas o
  // motivo fica 'rede-degradada', NÃO 'fronteira-esgotada': é uma corrida
  // falhada, não uma fronteira que acabou, e o canário grita por causa disso.
  const DEGRADADOS_SEGUIDOS = 3;
  let degradados = 0, seguidos = 0, abortou = false;
  for (;;) {
    const iv = proximoIntervalo(plano);
    if (!iv) break;
    const r = await varrerIntervaloFiavel(iv.de, iv.ate, registar);
    if (r.degradado) { degradados++; seguidos++; } else seguidos = 0;
    if (seguidos >= DEGRADADOS_SEGUIDOS) {
      console.warn(`   ⛔ ${seguidos} intervalos seguidos sem resposta — fronteira abandonada nesta corrida`);
      abortou = true;
      break;
    }
    plano = aplicarResultado(plano, iv, r);
  }
  cache.varredura_max_t = Math.max(tKnownMax, plano.ultimoVivo);
  cache.varredura = {
    fim: abortou ? 'rede-degradada' : plano.motivo,
    blocos: plano.blocosDensos, sondas: plano.sondas,
    retomas: plano.retomas, intervalos_degradados: degradados,
  };
  console.log(`   📡 Fronteira: último tcode vivo t=${cache.varredura_max_t}` +
              ` (${plano.blocosDensos} blocos, ${plano.sondas} sondas` +
              `${plano.retomas ? `, ${plano.retomas} retomas após buraco` : ''}` +
              `${degradados ? `, ⚠️ ${degradados} intervalos degradados` : ''})`);

  const activos = [...conhecidos.values()]
    .filter(t => diasAte(t.date_inicio) >= -30)
    .sort((a, b) => (parsearDataISO(a.date_inicio)||'').localeCompare(parsearDataISO(b.date_inicio)||''));

  cache.torneios  = activos;
  cache.gerado_em = new Date().toISOString();

  // Âncora: t mais baixo entre torneios com data >= hoje - 60 dias
  // Assim na próxima varredura começa de um ponto sensato e não perde inserções tardias
  const dataAncora = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const tRelevantes = activos
    .filter(t => (parsearDataISO(t.date_inicio) ?? '') >= dataAncora)
    .map(t => t.t)
    .filter(Boolean);
  if (tRelevantes.length) {
    cache.ultimo_t = Math.min(...tRelevantes) - 1;
    console.log(`   📌 Âncora próxima corrida: t=${cache.ultimo_t + 1} (torneio mais antigo dos próximos 60d)`);
  }

  // ── Canário ─────────────────────────────────────────────────────────────
  // A avaria de 2026 durou 7 semanas porque NADA gritou: o workflow ficava
  // verde a descobrir zero torneios. Estes dois carimbos são o que torna uma
  // paragem visível — o passo "Canário" do uskids-field.yml falha o job (e o
  // GitHub manda email) quando ficam estagnados.
  const hojeISO = new Date().toISOString().slice(0, 10);
  // Arrancar o contador na primeira corrida: sem carimbo inicial,
  // dias_sem_descoberta ficaria null para sempre até haver um torneio novo —
  // e o canário nunca dispararia se a varredura partisse já a seguir.
  if (encontrados > 0 || !cache.ultima_descoberta) cache.ultima_descoberta = hojeISO;
  if (cache.varredura_max_t > (cache.fronteira_max_t_visto || 0)) {
    cache.fronteira_max_t_visto = cache.varredura_max_t;
    cache.fronteira_avancou_em  = hojeISO;
  }
  const idade = (d) => d ? Math.floor((Date.parse(hojeISO) - Date.parse(d)) / 86400000) : null;
  cache.dias_sem_descoberta = idade(cache.ultima_descoberta);
  cache.dias_sem_avanco     = idade(cache.fronteira_avancou_em);

  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');

  console.log(`   ✓ ${activos.length} torneios (${encontrados} novos)`);
  console.log(`   🐤 Canário: ${cache.dias_sem_descoberta ?? '?'}d sem torneios novos · ` +
              `${cache.dias_sem_avanco ?? '?'}d sem a fronteira avançar\n`);
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
      tour: tn.tour || torneio.tour || null, type: tn.type ?? torneio.type ?? null,
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
    tour: tn.tour || torneio.tour || null, type: tn.type ?? torneio.type ?? null,
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
    // Fase 1: descoberta (só se cache tiver mais de 3 dias, ou --force-discovery)
    const forceDiscovery = process.argv.includes('--force-discovery');
    if (forceDiscovery || cacheDesactualizada()) {
      if (forceDiscovery) {
        console.log('\n🔄 --force-discovery activo');
        // Recuar ultimo_t para apanhar torneios que foram excluídos em varreduras anteriores.
        // Só recua UMA VEZ — controlado pelo flag rescanned_from_21238 na cache.
        if (fs.existsSync(CACHE_PATH)) {
          try {
            const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
            if (!cache.rescanned_from_21238 && (cache.ultimo_t || 0) > 21238) {
              cache.ultimo_t = 21238;
              cache.gerado_em = null;
              fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
              console.log('   ↩️  ultimo_t recuado para 21238 (one-time)');
            } else if (cache.rescanned_from_21238) {
              console.log('   ✓ Rescan 21238 já feito — sem recuo');
            }
          } catch {}
        }
      }
      torneios = await descobrirTorneios();
    } else {
      const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      torneios = cache.torneios || [];
      const diasCache = Math.round((Date.now() - new Date(cache.gerado_em).getTime()) / 86400000);
      console.log(`\n📂 Cache com ${torneios.length} torneios (há ${diasCache}d — próxima descoberta em ${CACHE_MAX_DIAS - diasCache}d)`);
    }

    // Carregar field anterior para preservar firstSeen
    const prevMap = carregarFieldAnterior();
    console.log(`   📦 ${prevMap.firstSeenMap.size} jogadores com firstSeen do run anterior`);

    // Fase 2: inscritos (só torneios futuros ou em curso)
    console.log(`\n📋 FASE 2 — Inscritos (${torneios.filter(t=>diasAte(t.date_inicio)>=-1).length} torneios)`);
    const resultados = [];
    for (const torneio of torneios.filter(t => diasAte(t.date_inicio) >= -1)) {
      resultados.push(await processarTorneio(page, torneio));
      await sleep(DELAY_FETCH);
    }

    // Aplicar firstSeen a todos os jogadores
    aplicarFirstSeen(resultados, prevMap);

    // Datar as inscrições pelo pid (ver scripts/lib/uskids-reg-dates.js).
    // As âncoras acumulam-se entre corridas: cada jogador que aparece num
    // torneio que já seguíamos data um ponto da escala global de pids, e é
    // dessa escala que sai a data dos torneios acabados de descobrir — onde o
    // firstSeen diria "hoje" para o campo inteiro.
    let ancoras = [];
    try { ancoras = JSON.parse(fs.readFileSync(ANCHORS, 'utf8')).ancoras || []; } catch {}
    ancoras = fundirAncoras(ancoras, extrairAncoras(resultados));
    const st = aplicarDatasInscricao(resultados, ancoras);
    fs.writeFileSync(ANCHORS, JSON.stringify({
      gerado_em: new Date().toISOString(), total: ancoras.length, ancoras,
    }, null, 2), 'utf8');
    console.log(`
📅 Datas de inscrição: ${st.obs} observadas · ${st.est} estimadas` +
                `${st.fora ? ` (${st.fora} fora do intervalo calibrado)` : ''}` +
                `${st.sem ? ` · ${st.sem} sem data` : ''} — ${ancoras.length} âncoras`);

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
