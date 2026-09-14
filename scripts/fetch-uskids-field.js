'use strict';

/**
 * fetch-uskids-field.js
 * Corre 1x por dia (07:00 UTC).
 * Fase 1: procura torneios novos — só para a frente, um pedido de cada vez
 *         (lib/uskids-frontier.js) — e enche aos poucos o catálogo de números.
 * Fase 2: actualiza inscritos: todos os dias os que interessam, os restantes
 *         uma vez por semana (planearFase2).
 * Output: uskids-discovery-cache.json + uskids-tcode-catalog.json + uskids-field.json
 */

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { extrairAncoras, fundirAncoras, aplicarDatasInscricao } = require('./lib/uskids-reg-dates');
const {
  criarFronteira, proximoNumero, aplicarResultado, buracosARever, planoBackfill,
  planearFase2, ordemFase2, BACKFILL_POR_CORRIDA, PISO_BACKFILL,
} = require('./lib/uskids-frontier');
const {
  ehRateLimit, erroRateLimit, deveRecusarEscrita, PERDA_MAXIMA,
} = require('./lib/uskids-rate-guard');

// ── Filtros de descoberta ─────────────────────
// A classificação (tipo do GetMeta + palavras-chave + excepções por tcode)
// vive em scripts/lib/uskids-classify.js, com testes.
const { incluirTorneio, FORCAR_INCLUIR, TIPO_LABEL } = require('./lib/uskids-classify');

// Prefixos de escalão — apanha "Boys 12", "Boys 13-14", "Boys 13 & Under", etc.
const ESCALOES_PREFIXOS = ['boys 9', 'boys 10', 'boys 11', 'boys 12', 'boys 13'];
const escalaoComNomes = (nome) => ESCALOES_PREFIXOS.some(p => nome.toLowerCase().startsWith(p));

// ── Pedidos à USKids ─────────────────────
// Um de cada vez, com pausa. A varredura antiga (5 em paralelo, sem pausa,
// ~6.000 pedidos/dia) levou a USKids a bloquear-nos a 12/09/2026 — ver
// scripts/lib/uskids-frontier.js.
// ⚠ `USKIDS_DELAY_MS` existe só para os testes (0); em produção nunca se define.
const DELAY_SERIE     = Number(process.env.USKIDS_DELAY_MS ?? 1200);  // Fase 1, entre pedidos
const DELAY_FETCH     = 400;                                           // Fase 2, entre pedidos
const ORCAMENTO_FASE2 = 450;   // tecto de pedidos de inscritos por corrida

// ⚠ `USKIDS_DATA_DIR`, como o `USKIDS_API_BASE` abaixo, existe para os testes
// correrem a descoberta sem escrever por cima da cache real. Em produção
// nunca está definida.
const DIR        = process.env.USKIDS_DATA_DIR || path.join(__dirname, '..', 'public', 'data');
const CACHE_PATH = path.join(DIR, 'uskids-discovery-cache.json');
const OUTPUT     = path.join(DIR, 'uskids-field.json');
const ANCHORS    = path.join(DIR, 'uskids-pid-anchors.json');
const CATALOGO_PATH = path.join(DIR, 'uskids-tcode-catalog.json');
const SEGUIR_DIARIO = path.join(__dirname, 'uskids-seguir-diario.json');

const IFRAME_URL = (t, ax = 1129) =>
  `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=${ax}&t=${t}`;
// ⚠ `USKIDS_API_BASE` existe para os testes poderem exercitar a varredura
// contra um servidor local (ex: a simular rate limit) sem tocar no
// signupanytime. Em produção nunca está definida.
const API = process.env.USKIDS_API_BASE || 'https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx';
const UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ─────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const hojeISO = () => new Date().toISOString().slice(0, 10);

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
  const empty = { firstSeenMap: new Map(), prevByEscalao: new Map(), prevRemoved: new Map(), prevTorneios: new Map() };
  try {
    if (!fs.existsSync(OUTPUT)) return empty;
    const prev = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
    const fsMap = new Map();      // "t:nomeNorm" → firstSeen
    const byEsc = new Map();      // "t:escalaoNome" → Map(nomeNorm → {nome, pais})
    const remMap = new Map();     // "t:escalaoNome" → Map(nomeNorm → {nome, removedAt, pais})
    const prevT  = new Map();     // t → entrada COMPLETA do run anterior
    for (const t of (prev.torneios || [])) {
      prevT.set(t.t, t);
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
    return { firstSeenMap: fsMap, prevByEscalao: byEsc, prevRemoved: remMap, prevTorneios: prevT };
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

/** Nº de torneios que bateram no rate limit nesta corrida (ver guardaRateLimit). */
let rateLimitHits = 0;
/** Pedidos da Fase 2 nesta corrida (para o orçamento diário). */
let pedidosFase2 = 0;

function esperarGetMeta(page, t, ms = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    const handler = async (response) => {
      if (!response.url().includes(`op=GetMeta&t=${t}`)) return;
      clearTimeout(timer);
      page.off('response', handler);
      try {
        const txt = await response.text();
        if (ehRateLimit(txt)) return reject(erroRateLimit());
        resolve(JSON.parse(txt));
      } catch (e) { reject(e); }
    };
    page.on('response', handler);
  });
}

async function pageJSON(page, url) {
  pedidosFase2++;
  const { status, txt } = await page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include' });
    return { status: r.status, txt: await r.text() };
  }, url);
  // A recusa da fonte vem em texto ("Too many requests"): reconhecê-la aqui, em
  // vez de a deixar rebentar no JSON.parse como se fosse um erro de formato.
  if (ehRateLimit(txt)) throw erroRateLimit();
  if (status < 200 || status >= 300) throw new Error('HTTP ' + status);
  return JSON.parse(txt);
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
      // ⚠ "Too many requests" NÃO é um tcode inexistente. Tratá-lo como tal
      // fazia a varredura ler a zona sob rate limit como fronteira esgotada.
      // ⚠ Uma recusa NÃO se repete. As 3 tentativas existem para rede
      // instável; contra um rate limit multiplicam por 3 os pedidos contra um
      // servidor que já disse não — com concorrência 5 eram 15 pedidos só
      // para o bloco perceber que estava travado.
      if (ehRateLimit(txt)) { rateLimitHits++; return ERRO; }
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

/** Resultado de UM pedido GetMeta, na linguagem da fronteira
 *  ('existe' | 'nao-existe' | 'erro' | 'recusa'). */
async function consultar(t) {
  const antes = rateLimitHits;
  const tn = await metaTournament(t);
  if (rateLimitHits > antes) return { r: 'recusa' };
  if (tn === ERRO) return { r: 'erro' };
  return tn ? { r: 'existe', tn } : { r: 'nao-existe' };
}

// ─────────────────────────────────────────────
// FASE 1: DESCOBERTA
// ─────────────────────────────────────────────
// Só para a frente, um pedido de cada vez — o como e o porquê (medidos) estão
// em scripts/lib/uskids-frontier.js.

/** Catálogo de TODOS os números vistos, incluindo os que o filtro exclui. */
function lerCatalogo() {
  try { return JSON.parse(fs.readFileSync(CATALOGO_PATH, 'utf8')); }
  catch { return { entradas: {}, buracos: {}, backfill: null }; }
}

/** Uma entrada por linha: o ficheiro muda todos os dias e o diff tem de se ler. */
function gravarCatalogo(cat) {
  const linhas = Object.keys(cat.entradas).map(Number).sort((a, b) => a - b)
    .map(t => `    ${JSON.stringify(String(t))}: ${JSON.stringify(cat.entradas[t])}`);
  const txt = '{\n' +
    `  "gerado_em": ${JSON.stringify(cat.gerado_em || null)},\n` +
    `  "backfill": ${JSON.stringify(cat.backfill || null)},\n` +
    `  "buracos": ${JSON.stringify(cat.buracos || {})},\n` +
    `  "entradas": {\n${linhas.join(',\n')}\n  }\n}\n`;
  fs.writeFileSync(CATALOGO_PATH, txt, 'utf8');
}

const entradaCatalogo = (tn) => ({
  n: tn.name.trim(), ty: tn.type ?? null, tour: tn.tour || null,
  s: tn.start_date || null, e: tn.end_date || null, st: tn.status ?? null,
  r: tn.rounds ?? null, c: tn.courses || null, f: tn.fee_18 || null,
});

async function descobrirTorneios() {
  console.log('\n🔍 FASE 1 — Descoberta (só para a frente, um pedido de cada vez)');

  let cache = { torneios: [], gerado_em: null };
  if (fs.existsSync(CACHE_PATH)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch {}
  }
  const cat = lerCatalogo();
  cat.entradas = cat.entradas || {};
  cat.buracos  = cat.buracos  || {};
  // ⚠ NÃO chamar a esta variável `hojeISO`: ensombraria a função do módulo em
  // toda esta função (hoisting do const) — aconteceu a 2026-09-13.
  const hoje = hojeISO();
  const recusaInicial = rateLimitHits;
  const recusou = () => rateLimitHits > recusaInicial;
  let pedidos = 0, encontrados = 0;

  // Filtrar logo à entrada: as regras podem ter mudado desde a última corrida.
  const conhecidos = new Map(
    (cache.torneios || [])
      .filter(t => incluirTorneio(t.t, t.name, t.type, t.tour))
      .map(t => [t.t, t])
  );

  const guardar = (t, e) => {
    conhecidos.set(t, {
      t, name: e.n, date_inicio: e.s, date_fim: e.e,
      rondas: e.r, campo: e.c, fee_18: e.f, tour: e.tour, type: e.ty,
    });
  };
  /** Cada número que existe entra no catálogo; os que interessam, na lista. */
  const registar = (t, tn) => {
    const e = entradaCatalogo(tn);
    cat.entradas[t] = e;
    if (!incluirTorneio(t, e.n, e.ty, e.tour) || diasAte(e.s) < -30) return;
    if (!conhecidos.has(t)) {
      const cls = TIPO_LABEL[e.ty] ? ` [${TIPO_LABEL[e.ty]}]` : '';
      console.log(`  ✅ NOVO  t=${t}  ${e.s}  ${e.n}${cls}`);
      encontrados++;
    }
    guardar(t, e);
  };
  /** Um pedido, e a pausa a seguir. */
  const pedir = async (t) => {
    pedidos++;
    const x = await consultar(t);
    await sleep(DELAY_SERIE);
    return x;
  };

  // 0. Reclassificar o catálogo em casa — zero pedidos. É isto que faz uma
  //    mudança de regras (ex.: os Tour Championships dos EUA) valer logo para
  //    tudo o que já foi visto.
  let reclass = 0;
  for (const [ts, e] of Object.entries(cat.entradas)) {
    const t = Number(ts);
    if (conhecidos.has(t) || !incluirTorneio(t, e.n, e.ty, e.tour) || diasAte(e.s) < -30) continue;
    guardar(t, e);
    reclass++;
  }
  if (reclass) console.log(`   ♻️  ${reclass} torneios entram por reclassificação do catálogo (0 pedidos)`);

  // 1. Excepções forçadas que ainda não estão no catálogo.
  for (const t of FORCAR_INCLUIR) {
    if (conhecidos.has(t) || cat.entradas[t] || recusou()) continue;
    const x = await pedir(t);
    if (x.r === 'existe') registar(t, x.tn);
    else if (x.r !== 'nao-existe') console.warn(`   ⚠️  Forçado t=${t} sem resposta da fonte`);
  }

  // 2. Fronteira: do último número que existe para a frente.
  const inicio = Math.max(0, cache.varredura_max_t || 0,
    ...Object.keys(cat.entradas).map(Number), ...conhecidos.keys());
  let st = criarFronteira({ ultimoExistente: inicio });
  if (recusou()) st = { ...st, fim: 'rate-limit' };
  for (let t = proximoNumero(st); t != null; t = proximoNumero(st)) {
    const x = await pedir(t);
    if (x.r === 'existe') registar(t, x.tn);
    st = aplicarResultado(st, t, x.r);
  }
  for (const b of st.buracosNovos) cat.buracos[b] = hoje;
  console.log(`   📡 Fronteira: último número que existe t=${st.ultimoExistente}` +
              ` (${st.pedidos} pedidos, fim: ${st.fim})`);

  // 3. Buracos recentes deixados para trás pela fronteira.
  const { rever, expirados } = buracosARever(cat.buracos, hoje);
  for (const b of expirados) delete cat.buracos[b];
  let revistos = 0;
  for (const b of rever) {
    if (recusou()) break;
    const x = await pedir(b);
    if (x.r === 'erro' || x.r === 'recusa') break;
    revistos++;
    if (x.r === 'existe') {
      delete cat.buracos[b];
      registar(b, x.tn);
      console.log(`   🕳️  o buraco t=${b} passou a existir`);
    }
  }

  // 4. Catálogo para trás, aos poucos (--backfill N muda o orçamento).
  const iB = process.argv.indexOf('--backfill');
  const orcamento = (iB > 0 && Number(process.argv[iB + 1])) || BACKFILL_POR_CORRIDA;
  if (!cat.backfill) cat.backfill = { cursor: inicio - 1, piso: PISO_BACKFILL };
  const catalogados = new Set(Object.keys(cat.entradas).map(Number));
  const planoB = planoBackfill({ cursor: cat.backfill.cursor, piso: cat.backfill.piso, orcamento, catalogados });
  let noCatalogo = 0, interrompido = false;
  for (const t of planoB) {
    if (recusou()) { interrompido = true; break; }
    const x = await pedir(t);
    // Sem resposta: o cursor fica neste número e a corrida seguinte retoma-o.
    if (x.r === 'erro' || x.r === 'recusa') { interrompido = true; break; }
    if (x.r === 'existe') { registar(t, x.tn); noCatalogo++; }
    cat.backfill.cursor = t - 1;
  }
  // Tudo o que faltava já estava catalogado: chegou-se ao piso.
  if (!interrompido && planoB.length < orcamento) cat.backfill.cursor = cat.backfill.piso - 1;
  const faltam = Math.max(0, cat.backfill.cursor - cat.backfill.piso + 1);
  console.log(`   📚 Catálogo: ${Object.keys(cat.entradas).length} números` +
              ` (+${noCatalogo} para trás${faltam ? `; faltam ~${faltam} até t=${cat.backfill.piso}` : ', completo'})`);

  // ── Cache + canário ──────────────────────────────────────────────────────
  // `rede-degradada` e `rate-limit` são os valores que o canário
  // (lib/uskids-rate-guard.js → avaliarCanario) já sabe ler.
  const fim = recusou() ? 'rate-limit' : st.fim === 'sem-resposta' ? 'rede-degradada' : st.fim;
  cache.varredura_max_t = st.ultimoExistente;
  cache.varredura = {
    fim, pedidos, novos: encontrados, buracos_revistos: revistos,
    catalogo: Object.keys(cat.entradas).length, backfill_falta: faltam,
  };
  // Restos da varredura antiga (Passagem A / varredura profunda).
  delete cache.ultimo_t;
  delete cache.ultima_varredura_profunda;

  const activos = [...conhecidos.values()]
    .filter(t => diasAte(t.date_inicio) >= -30)
    .sort((a, b) => (parsearDataISO(a.date_inicio)||'').localeCompare(parsearDataISO(b.date_inicio)||''));
  cache.torneios  = activos;
  cache.gerado_em = new Date().toISOString();

  // A avaria de 2026 durou 7 semanas porque NADA gritou: estes dois carimbos
  // são o que torna uma paragem visível ao passo "Canário" do workflow.
  if (encontrados > 0 || !cache.ultima_descoberta) cache.ultima_descoberta = hoje;
  if (cache.varredura_max_t > (cache.fronteira_max_t_visto || 0)) {
    cache.fronteira_max_t_visto = cache.varredura_max_t;
    cache.fronteira_avancou_em  = hoje;
  }
  const idade = (d) => d ? Math.floor((Date.parse(hoje) - Date.parse(d)) / 86400000) : null;
  cache.dias_sem_descoberta = idade(cache.ultima_descoberta);
  cache.dias_sem_avanco     = idade(cache.fronteira_avancou_em);

  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  cat.gerado_em = cache.gerado_em;
  gravarCatalogo(cat);

  console.log(`   ✓ ${activos.length} torneios (${encontrados} novos) · ${pedidos} pedidos na Fase 1`);
  console.log(`   🐤 Canário: ${cache.dias_sem_descoberta ?? '?'}d sem torneios novos · ` +
              `${cache.dias_sem_avanco ?? '?'}d sem a fronteira avançar\n`);
  return activos;
}

// ─────────────────────────────────────────────
// FASE 2: INSCRITOS
// ─────────────────────────────────────────────

/** ⚠ Um torneio que falha NÃO pode apagar os inscritos que já tínhamos.
 *  A 2026-09-12 o signupanytime devolveu "Too many requests" aos 87 torneios e,
 *  como cada falha produzia uma entrada vazia e a escrita final era do ZERO, o
 *  uskids-field.json passou de 1,07 MB / 2018 inscritos para 39 KB / zero.
 *  Em caso de falha devolve-se a entrada ANTERIOR marcada `stale`. */
function preservarAnterior(torneio, prev, msg) {
  if (!prev || !(prev.escaloes || []).length) {
    return { ...torneio, erro: msg, escaloes: [], ultima_atualizacao: new Date().toISOString() };
  }
  console.warn(`  ♻️  mantido o registo anterior (${prev.escaloes.length} escalões)`);
  return { ...prev, erro: msg, stale: true, stale_desde: prev.ultima_atualizacao || null };
}

/** `modo`: 'completo' (nomes de todos os escalões) ou 'contagens' (nomes só
 *  onde o nº de inscritos mudou) — ver planearFase2. */
async function processarTorneio(page, torneio, prev, modo = 'completo') {
  const dias = diasAte(torneio.date_inicio);
  console.log(`\n▶ ${torneio.name} (t=${torneio.t}) — ${dias >= 0 ? `daqui a ${dias}d` : 'em curso'}`);

  let meta;
  try {
    // A página do signupanytime abre-se UMA vez por corrida — carregá-la custa
    // 13 pedidos (medido 14/09/2026). Daí em diante o GetMeta vai directo, da
    // própria página (same-origin): 1 pedido por torneio.
    if (page.url().startsWith('https://www.signupanytime.com/')) {
      meta = await pageJSON(page, `${API}?op=GetMeta&t=${torneio.t}`);
    } else {
      pedidosFase2 += 13;   // abrir a página custa 13 pedidos (medido 14/09/2026)
      const metaP = esperarGetMeta(page, torneio.t, 12000);
      await page.goto(IFRAME_URL(torneio.t, torneio.ax || 1129), { waitUntil: 'domcontentloaded', timeout: 15000 });
      meta = await metaP;
    }
  } catch (err) {
    console.warn(`  ⚠️  GetMeta falhou: ${err.message}`);
    if (err.rateLimited) rateLimitHits++;
    return preservarAnterior(torneio, prev, err.message);
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

    // Só contagens: se o nº de inscritos do escalão não mudou, a lista de nomes
    // é a de ontem — sem pedidos. Uma troca (sai um, entra outro) é apanhada no
    // refrescamento semanal, que vem sempre em modo 'completo'.
    const ePrev = modo === 'contagens'
      ? (prev?.escaloes || []).find(x => x.age_group === parseInt(ag) && x.jogadores && x.inscritos === inscr)
      : null;
    if (ePrev) {
      escalao.jogadores = ePrev.jogadores;
      escalao.paises    = ePrev.paises;
    } else if (escalaoComNomes(nome) && inscr > 0) {
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
      } catch (err) {
        // Uma recusa a meio de um torneio não pode deixá-lo com escalões sem
        // nomes: fica o registo anterior inteiro.
        if (err.rateLimited) {
          console.warn(`  ⛔ ${nome}: a fonte recusou — pára aqui`);
          rateLimitHits++;
          return preservarAnterior(torneio, prev, 'rate limit (Too many requests)');
        }
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

  // --only t1,t2 — actualiza SÓ esses torneios: sem descoberta (Fase 1) e sem
  // tocar nos restantes. São poucos pedidos e em série, o que serve para
  // refrescar os torneios que interessam quando a fonte corta a rajada diária
  // (Set 2026: o signupanytime bloqueia qualquer IP que faça a Fase 1 inteira).
  const iOnly = process.argv.indexOf('--only');
  const only = iOnly > 0
    ? new Set(String(process.argv[iOnly + 1] || '').split(',').map(Number).filter(Boolean))
    : null;

  let torneios;
  try {
    if (only) {
      let doCache = [], doField = [];
      try { doCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')).torneios || []; } catch {}
      try { doField = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')).torneios || []; } catch {}
      torneios = [...only].map(t => doCache.find(x => x.t === t) || doField.find(x => x.t === t)).filter(Boolean);
      console.log(`\n🎯 --only: ${torneios.map(t => `${t.name} (t=${t.t})`).join(' · ') || 'nenhum torneio conhecido'}`);
    } else {
      // Fase 1 todos os dias: agora custa ~50 pedidos (era ~6.000).
      torneios = await descobrirTorneios();
    }

    // Carregar field anterior para preservar firstSeen
    const prevMap = carregarFieldAnterior();
    console.log(`   📦 ${prevMap.firstSeenMap.size} jogadores com firstSeen do run anterior`);

    // Fase 2: inscritos (só torneios futuros ou em curso). Quem se pede hoje
    // decide-o planearFase2 (lib/uskids-frontier.js); com --only, tudo por inteiro.
    const aFazer = torneios.filter(t => diasAte(t.date_inicio) >= -1);
    let diarios = new Set();
    try { diarios = new Set(JSON.parse(fs.readFileSync(SEGUIR_DIARIO, 'utf8')).torneios.map(x => x.t)); } catch {}
    const doManuel = new Set([...prevMap.prevTorneios.values()]
      .filter(p => (p.escaloes || []).some(e => (e.jogadores || []).some(j => /manuel.*medeiros/i.test(j.nome))))
      .map(p => p.t));
    const plano2 = only
      ? new Map(aFazer.map(t => [t.t, 'completo']))
      : planearFase2(aFazer, prevMap.prevTorneios, { diaSemana: new Date().getUTCDay(), diarios, doManuel, diasAte });
    const conta = { completo: 0, contagens: 0, manter: 0 };
    for (const v of plano2.values()) conta[v]++;
    console.log(`\n📋 FASE 2 — Inscritos (${aFazer.length} torneios: ${conta.completo} por inteiro · ` +
                `${conta.contagens} só contagens · ${conta.manter} sem pedidos hoje)`);
    const resultados = [];
    for (const torneio of ordemFase2(aFazer, plano2, { doManuel, diarios, dataISO: parsearDataISO })) {
      const prev = prevMap.prevTorneios.get(torneio.t);
      const modo = plano2.get(torneio.t);
      if (modo === 'manter' && prev) { resultados.push(prev); continue; }
      // À primeira recusa da fonte, ou esgotado o orçamento do dia, não se pede
      // mais nada: os restantes ficam com o registo anterior (um torneio novo
      // sem registo espera pela corrida seguinte).
      if (rateLimitHits > 0 || pedidosFase2 >= ORCAMENTO_FASE2) {
        if (prev) resultados.push(rateLimitHits > 0
          ? preservarAnterior(torneio, prev, 'rate limit (Too many requests)') : prev);
        continue;
      }
      resultados.push(await processarTorneio(page, torneio, prev, modo));
      await sleep(DELAY_FETCH);
    }
    console.log(`   📨 ${pedidosFase2} pedidos na Fase 2`);

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

    // ── Guarda anti-encolhimento ───────────────────────────────────────────
    // Mesma política do scrape-federados-node.js e do discover-fcg-scope.js:
    // um run degradado nunca grava por cima de um bom. Sem ela, o rate limit
    // de 2026-09-12 apagou 2018 inscritos e o workflow ficou verde no commit.
    // A comparação é só sobre os torneios que estão nos DOIS lados — ver o
    // porquê (e o caso real de 2026-08-01) em lib/uskids-rate-guard.js.
    let anterior = {};
    try { anterior = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch {}
    const anteriores = anterior.torneios || [];
    // Com --only, os torneios não pedidos ficam exactamente como estavam em disco.
    let final = resultados;
    if (only) {
      const novos = new Map(resultados.map(t => [t.t, t]));
      final = anteriores.map(t => novos.get(t.t) ?? t);
      for (const t of resultados) if (!anteriores.some(a => a.t === t.t)) final.push(t);
    }
    const g = deveRecusarEscrita(anteriores, final, {
      max: PERDA_MAXIMA, forcar: process.argv.includes('--force'),
    });
    if (g.recusar) {
      console.error(`\n❌ Recusado: nos torneios que já seguíamos o build novo tem ${g.agora} ` +
                    `inscritos contra ${g.antes} em disco (perda de ${Math.round(g.perda * 100)}%).`);
      if (rateLimitHits) console.error(`   ${rateLimitHits} pedidos bateram no rate limit do signupanytime.`);
      console.error('   Ficheiro anterior preservado. Usar --force para gravar mesmo assim.');
      process.exitCode = 2;
      return;
    }
    let escNovo = 0, jogNovo = 0;
    for (const t of final) for (const e of (t.escaloes || [])) { escNovo++; jogNovo += (e.jogadores || []).length; }
    const novo = { esc: escNovo, jog: jogNovo };

    fs.writeFileSync(OUTPUT, JSON.stringify({
      // Um --only não é um run completo: o cabeçalho continua o do último run
      // inteiro (é o que o canário lê); a data de cada torneio vive no próprio.
      gerado_em: only ? (anterior.gerado_em || new Date().toISOString()) : new Date().toISOString(),
      // Prova de que a fonte nos recusou NESTE run — é o que permite ao
      // canário distinguir "a fonte cortou-nos" de "a rede falhou sem
      // explicação". Sem isto, os dois casos chegam lá iguais.
      rate_limit_hits: only ? (anterior.rate_limit_hits ?? 0) : rateLimitHits,
      torneios: final,
    }, null, 2), 'utf8');

    console.log('\n══════════════════════════════════════');
    console.log(`✅  uskids-field.json actualizado (${novo.esc} escalões · ${novo.jog} inscritos)`);
    if (rateLimitHits) console.log(`⚠️   ${rateLimitHits} torneios com rate limit — registos anteriores mantidos`);
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


if (require.main === module) {
  main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
}

// Exportado para os testes exercitarem o código REAL (não uma cópia).
module.exports = {
  consultar, metaTournament, preservarAnterior, descobrirTorneios,
  get rateLimitHits() { return rateLimitHits; },
};
