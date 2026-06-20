'use strict';

/**
 * fetch-uskids-member-history.js
 *
 * Busca o histórico completo de torneios USKids para rapazes Boys 9-12
 * inscritos nos torneios/flights especificados.
 *
 * Mapeamento memberID → nome (3 estratégias por ordem de prioridade):
 *   1. Mapa directo node_id → nome extraído do GetPlayerTeeTimes
 *   2. Fingerprint de strokes via GetPlayerTeeTimes
 *   3. Fingerprint de strokes via uskids-results.json
 *
 * Output: chunks numerados data-archive/uskids-member-history-NNN.json
 *   (escritos directamente, sem monolítico — ver writeSharded(); o monolítico
 *    passava o limite de string do V8 com 11k+ jogadores).
 *
 * Filtros de volume (ver constantes MAX_AGE_TODAY e TOP_N_PER_FLIGHT):
 *   - Ignora flights de torneios antigos cujas crianças hoje teriam ≥ 18 anos.
 *   - Só guarda o histórico de quem ficou no top-N de cada escalão.
 *   Afecta apenas o seguimento da carreira dos rivais — os resultados dos
 *   torneios vêm de pipelines separados e ficam intactos.
 *
 * Uso:
 *   node fetch-uskids-member-history.js               # processa novos + actualiza histórico
 *   node fetch-uskids-member-history.js --clean       # re-match nomes offline
 *   node fetch-uskids-member-history.js --force       # re-fetch todos os descobertos (ignora cache)
 *   node fetch-uskids-member-history.js --refresh-all # re-fetch TODOS os memberIDs em cache
 *                                                     # (apanha torneios novos fora dos ALL_TCODES;
 *                                                     #  ~2.600 jogadores × 150ms ≈ 7-10 minutos)
 */

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ── Config ───────────────────────────────────
const DIR    = path.join(__dirname, '..', 'data-archive');
const OUTPUT = path.join(DIR, 'uskids-member-history.json');
const RESULTS_PATH = path.join(__dirname, '..', 'public', 'data', 'uskids-results.json');
// Cache da Fase 1 (flights + member IDs + fingerprints). Para torneios FECHADOS
// estes dados nunca mudam, por isso são persistidos aqui e relidos em runs
// futuros — só torneios recentes/a decorrer voltam a ser obtidos da net.
const FLIGHT_CACHE = path.join(DIR, 'uskids-flight-cache.json');
const FLIGHT_CACHE_FRESH_DAYS = 15; // re-obter da net se o torneio terminou há ≤ N dias OU ainda decorre

// Torneios a rastrear.
// Para torneios com flights conhecidos, especifica-os manualmente.
// Para os restantes (sem entrada aqui), os flights são auto-descobertos
// via GetMeta filtrando escalões Boys 9-13.
// ⚠ FLIGHTS_MANUAL DESACTIVADO (2026-06-12). Estas listas fixavam Boys 9-12 e
// sobrepunham-se à auto-descoberta — o que impedia apanhar Boys 13 e forçava
// Boys 9. Com a nova janela 10-13 (ver ESCALOES_BOYS) preferimos a auto-
// descoberta via GetMeta para TODOS os torneios, que respeita o filtro de
// escalões automaticamente. Fids antigos preservados aqui só para referência:
//   18242 (EC2025):  234338/9/40/41 = Boys 9/10/11/12
//   19418 (Venice25):250227/8/9/30  = Boys 9/10/11/12
//   20175 (Rome25):  260328/9/30/31 = Boys 9/10/11/12
//   21080 (Marco26): 272798/9/800/801 = Boys 9/10/11/12
//   21131 (EC2026):  273490/1/2/3   = Boys 9/10/11/12
const FLIGHTS_MANUAL = {};

// Todos os torneios a processar. Para cada tcode, os flights Boys 9-13 são
// auto-descobertos via GetMeta — então adicionar uma linha basta.
// Lista expandida para incluir TODAS as edições passadas das séries relevantes
// (European, World, Venice, Rome Classic, Red White & Blue, Holiday Classic,
// Marco Simone, El Prat 2023). Quem está no field destes torneios fica em cache
// e a sua carreira completa é puxada via GetMemberTournamentResults.
const ALL_TCODES = [
  // ── Flights manuais já configurados ──
  18242, 19418, 20175, 21080, 21131,

  // ── European Championship (2014-2026) ──
  144, 1084, 2079, 3361, 5095, 6713, 8300, 13568, 15704,
  // 18242 já listado, 21131 já listado

  // ── World Championship (2013-2026) ──
  35, 205, 1189, 2250, 3669, 5375, 6901, 8194, 9793,
  11604, 14029, 15807, 18124, 21610,

  // ── Venice Open (2015-2026) ──
  1076, 2585, 4010, 5663, 7315, 9086, 10240,
  12229, 14302, 16428, 22243,
  // 19418 já listado

  // ── Rome Classic (2021-2025) ──
  9386, 12578, 14670, 16795,
  // 20175 já listado

  // ── Marco Simone Invitational (2025-2026) ──
  18438,
  // 21080 já listado

  // ── Red White & Blue Invitational (2016-2026) ──
  2508, 3772, 4967, 7170, 8192, 10118, 12093, 14218, 16705, 18719, 22187,

  // ── Holiday Classic (2013-2025) ──
  115, 509, 1964, 3235, 3777, 5047, 7644, 8510, 10306, 13273, 15480, 18000, 20878,

  // ── El Prat 2023 (USKids Open Spain) ──
  15573,

  // ── Irish Open (Irlanda, 2021-2026) ──
  8660, 11307, 13470, 16020, 18978, // 2021, 2022, 2023, 2024, 2025
  21455, // 2026

  // ── Paris Invitational (França, 2025-2026) ──
  18975, // 2025
  21795, // 2026

  // ── Belgium Invitational (Bélgica, 2026 — novo torneio europeu) ──
  22480, // 2026

  // ── 2026 USA (já estavam) ──
  21004, // Desert Shootout 2026
];

// Prefixos de escalão a incluir na auto-descoberta.
// Política 2026-06-12: Manuel (n. 2014) já tem 12 anos → deixámos de seguir
// Boys 9 (demasiado novo) e passámos a incluir Boys 13. Janela = 10-13.
const ESCALOES_BOYS = ['boys 10', 'boys 11', 'boys 12', 'boys 13'];
const escalaoValido = (nome) =>
  ESCALOES_BOYS.some(p => (nome || '').toLowerCase().startsWith(p));

// ── Filtros de redução de volume ─────────────
// O tracker segue rivais do Manuel (nascido 2014). Torneios antigos (ex:
// European Championship 2015/2016) devolvem crianças "Boys 9" nascidas em
// ~2006 — hoje com ~20 anos, fora do âmbito. Filtramos a dois níveis:
//
//  1. MAX_AGE_TODAY — ignora flights cujas crianças hoje teriam ≥ N anos,
//     estimando o ano de nascimento a partir do ano do torneio e do escalão.
//     Corta flights inteiros ANTES de puxar a carreira (poupa fetches).
//  2. TOP_N_PER_FLIGHT — só guarda o histórico de quem ficou no top-N de
//     pelo menos um dos torneios onde foi descoberto. 0 = sem limite.
//
// NOTA: estes filtros só afectam o seguimento da CARREIRA individual dos
// rivais (tab Rivais / H2H / DOB na KIDSPage). Os resultados/leaderboards
// dos torneios vêm de pipelines separados (uskids-results.json e
// uskids_torneios_completos*) e NÃO são afectados.
const CURRENT_YEAR       = new Date().getFullYear();
const MAX_AGE_TODAY      = 18; // ignorar flights com crianças hoje ≥ 18 anos
const TOP_N_PER_FLIGHT   = 5; // guardar só top-5 de cada escalão (0 = sem limite)

// Torneios "FULL FIELD" — guardar a carreira de TODOS os jogadores, não só o
// top-5. Para os torneios onde o Manuel jogou, queremos a ficha completa de
// todos os adversários (não apenas o pódio). Quando um membro novo é
// descoberto num destes tcodes, o filtro TOP_N é ignorado para ele.
// Adicionar aqui o tcode de cada torneio relevante (ver tabela no CLAUDE.md).
const FULL_FIELD_TCODES = new Set([
  21080, // Marco Simone Invitational 2026
  18438, // Marco Simone Invitational 2025
  18242, // European Championship 2025
  21131, // European Championship 2026 (26 Mai 2026)
  19418, // Venice Open 2025
  20175, // Rome Classic 2025
  // ── Irish Open (todos os anos) ──
  8660, 11307, 13470, 16020, 18978, // 2021-2025
  21455, // 2026
  // ── Paris Invitational ──
  18975, // 2025
  21795, // 2026
  // ── Belgium Invitational ──
  22480, // 2026
  // ── Preparados para correr DEPOIS de ocorrerem ──
  21610, // World Championship 2026 (Set 2026)
  22243, // Venice Open 2026 (Ago 2026)
]);

// Restrição de escalões por torneio: quando um tcode está aqui, só os
// escalões listados são processados (em vez de todos os Boys 9-13 da
// auto-descoberta). Útil para torneios grandes onde só interessam alguns
// escalões. Prefixos em minúsculas (startsWith).
const ESCALOES_POR_TORNEIO = {
  21004: ['boys 10', 'boys 11', 'boys 12', 'boys 13'], // Desert Shootout 2026 — 10-13
};

// Manuel nunca é filtrado (2 contas USKids — ver MANUEL_PLAYER_IDS em
// src/constants/manuel.ts). Mantido como allowlist independente dos filtros.
const MANUEL_MIDS = new Set(['630106', '605933']);

const DELAY_MS   = 200;
const DELAY_HIST = 150;

const IFRAME_URL = (t) =>
  `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t}`;
const API = 'https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Helpers ──────────────────────────────────

async function initPage(page, tcode) {
  await page.goto(IFRAME_URL(tcode), { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(500);
}

// Extrai os flights Boys 9-13 de uma meta (GetMeta) já obtida.
function parseFlights(meta) {
  if (!meta) return [];
  const flights   = meta.flights    || {};
  const ageGroups = meta.age_groups || {};
  const resultado = [];
  for (const [fid, fl] of Object.entries(flights)) {
    const agId   = fl.age_group;
    const agName = ageGroups[agId]?.name || fl.name || '';
    if (escalaoValido(agName)) {
      resultado.push({ fid: parseInt(fid), ag: agName });
    }
  }
  resultado.sort((a, b) => a.ag.localeCompare(b.ag));
  return resultado;
}

// Ano do torneio a partir da meta (start_date em "M/D/YYYY" ou "YYYY-MM-DD").
function anoDoTorneio(meta) {
  const sd = meta?.tournament?.start_date || meta?.start_date || '';
  const m  = String(sd).match(/(\d{4})/); // o ano é o único bloco de 4 dígitos
  return m ? parseInt(m[1], 10) : null;
}

// Menor idade implícita no nome do escalão ("Boys 13-14" → 13, "Boys 9" → 9).
// Usamos a menor para a decisão de corte ser conservadora (não dropar flights
// que ainda contêm crianças suficientemente novas).
function parseAgeNum(ag) {
  const nums = String(ag).match(/\d+/g);
  return nums ? Math.min(...nums.map(Number)) : null;
}

// Posição numérica a partir de p_place ("T5" → 5, "1" → 1, 3 → 3).
function parsePlace(p) {
  if (p == null) return null;
  const m = String(p).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

async function pageJSON(page, url, method = 'GET') {
  return page.evaluate(async ({ u, m }) => {
    const r = await fetch(u, { method: m, credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }, { u: url, m: method });
}

// GetPlayerTeeTimes com endpoint correcto descoberto via Chrome DevTools 2026-05-12:
// POST + t=1 (final results, funciona para tcodes encerrados E vivos) +
// params extra obrigatórios pt=undefined&jbgr={timestamp}&c=1.
// Fallback automático para t=0 (live tee times) se t=1 vier vazio.
async function getPlayerTeeTimes(page, fid, round, pageNum) {
  const jbgr = Date.now();
  // Tentar t=1 primeiro (universal — funciona para closed e most live)
  let d = await pageJSON(
    page,
    `${API}?op=GetPlayerTeeTimes&f=${fid}&r=${round}&p=${pageNum}&t=1&pt=undefined&jbgr=${jbgr}&c=1`,
    'POST'
  );
  if (d?.flight_players && Object.keys(d.flight_players).length) return d;
  // Fallback: t=0 (legacy — live tee times sem resultados finais)
  try {
    d = await pageJSON(
      page,
      `${API}?op=GetPlayerTeeTimes&f=${fid}&r=${round}&p=${pageNum}&t=0&pt=undefined&jbgr=${jbgr}&c=1`,
      'POST'
    );
  } catch {}
  return d;
}

// Constrói uma chave de "impressão digital" a partir dos strokes de uma ronda.
//
// ⚠ CRUZAMENTO DE SEGURANÇA (crítico — não remover):
// Arrays de strokes degenerados NÃO servem como fingerprint porque colidem
// entre centenas de jogadores e fazem o matchPlayer colar o mesmo nome a
// dezenas de member IDs distintos. Casos degenerados observados nos dados:
//   • [0,0,0,...]   → inscrito mas sem cartão submetido (137+ membros colidem)
//   • [-1,-1,-1,..] → placeholder DNS/DNF da USKids (209+ membros colidem)
//   • rondas com poucos buracos reais ou sem variância (ex: tudo 4)
// Em qualquer destes casos devolvemos '' → a ronda é ignorada como fingerprint
// (matchPlayer faz `if (!sk) continue;`). Só rondas REAIS e discriminativas
// produzem chave.
const MIN_FINGERPRINT_HOLES = 6;   // mínimo de buracos jogados (>0) para confiar
const MIN_FINGERPRINT_DISTINCT = 3; // mínimo de valores distintos (rejeita "tudo igual")
function strokesKey(arr) {
  if (!arr || !arr.length) return '';
  // Só buracos efectivamente jogados (strokes > 0). Filtra 0 e -1.
  const pos = arr.filter(v => Number(v) > 0);
  if (pos.length < MIN_FINGERPRINT_HOLES) return '';
  if (new Set(pos).size < MIN_FINGERPRINT_DISTINCT) return '';
  return pos.join(',');
}

function parseDate(s) {
  if (!s) return '';
  if (s.includes('-')) return s;
  const p = s.split('/');
  return p.length === 3 ? `${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}` : '';
}

// ── Cache da Fase 1 (flights + fingerprints) ─────────────────────────
// Descobrir quem está em cada flight + os fingerprints de strokes é caro
// (GetPlayerTeeTimes paginado para centenas de flights). Persistimos isso e
// só re-obtemos da net os torneios recentes/a decorrer (ver flightNeedsRefetch).
function loadFlightCache() {
  try {
    if (fs.existsSync(FLIGHT_CACHE)) return JSON.parse(fs.readFileSync(FLIGHT_CACHE, 'utf8'));
  } catch (e) {
    console.warn(`  ⚠️ flight-cache ilegível (${e.message}) — vai re-descobrir tudo`);
  }
  return { gerado_em: null, torneios: {} };
}
function saveFlightCache(fc) {
  try {
    fc.gerado_em = new Date().toISOString();
    fs.writeFileSync(FLIGHT_CACHE, JSON.stringify(fc));
    console.log(`  💾 flight-cache gravada: ${Object.keys(fc.torneios || {}).length} torneios`);
  } catch (e) {
    console.warn(`  ⚠️ falha ao gravar flight-cache: ${e.message}`);
  }
}
// true = TEM de ir à net (torneio terminou há ≤ N dias, está no futuro, ou data desconhecida).
function flightNeedsRefetch(dateStr) {
  const iso = parseDate(dateStr);
  if (!iso) return true;                       // sem data fiável → re-obter por segurança
  const t = Date.parse(iso + 'T00:00:00Z');
  if (Number.isNaN(t)) return true;
  const ageDays = (Date.now() - t) / 86400000;
  return ageDays <= FLIGHT_CACHE_FRESH_DAYS;   // recente OU futuro (ageDays < 0)
}

/**
 * Constrói fingerprints a partir do uskids-results.json.
 */
function buildResultsFingerprints() {
  const fp = new Map();
  if (!fs.existsSync(RESULTS_PATH)) return fp;
  try {
    const data = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
    for (const tourn of data.resultados || []) {
      const tcode = String(tourn.t);
      for (const esc of tourn.escaloes || []) {
        for (const ronda of esc.rondas || []) {
          const rn = ronda.ronda;
          for (const j of ronda.leaderboard || []) {
            const sk = strokesKey(j.strokes);
            if (!sk) continue;
            const key = `${tcode}:R${rn}:${sk}`;
            const info = { name: j.nome, country: j.pais, place: j.cidade || '' };
            // Cruzamento de segurança: se esta chave já existe com outro nome,
            // é ambígua → marcar null para matchPlayer nunca a usar.
            if (fp.has(key)) {
              const prev = fp.get(key);
              if (prev && prev.name !== info.name) fp.set(key, null);
            } else {
              fp.set(key, info);
            }
          }
        }
      }
    }
  } catch {}
  return fp;
}

/**
 * Tenta identificar um jogador pelos strokes.
 */
function matchPlayer(memberData, apiFingerprints, resultsFP, memberFlights) {
  // 1. API fingerprints (torneio fonte)
  for (const { tcode, fid } of memberFlights) {
    const fpMap = apiFingerprints.get(`${tcode}:${fid}`);
    if (!fpMap) continue;
    const tournData = memberData[String(tcode)];
    if (!tournData || !tournData.p_rounds) continue;
    for (const [rn, rd] of Object.entries(tournData.p_rounds)) {
      const sk = strokesKey(rd.strokes);
      if (!sk) continue;
      const match = fpMap.get(`R${rn}:${sk}`);
      if (match) return match;
    }
  }
  // 2. Fallback: uskids-results.json
  for (const [tid, t] of Object.entries(memberData)) {
    if (!t.p_rounds) continue;
    for (const [rn, rd] of Object.entries(t.p_rounds)) {
      const sk = strokesKey(rd.strokes);
      if (!sk) continue;
      const match = resultsFP.get(`${tid}:R${rn}:${sk}`);
      if (match) return match;
    }
  }
  return null;
}

// ── Cache loading ────────────────────────────
//
// Prioridade (por esta ordem):
//   1. monolítico uskids-member-history.json (deixado pelo fetch anterior, local)
//   2. chunks uskids-member-history-XXX.json (deixados por split-member-history.js,
//      é o estado em git após runs da GitHub Action)
//
// Isto garante que a cache incremental continua a funcionar na Action
// mesmo depois do split ter apagado o monolítico.
function loadCache() {
  const empty = { gerado_em: null, torneios: {}, jogadores: {} };
  if (fs.existsSync(OUTPUT)) {
    try { return JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch {}
  }
  // Fallback: reconstituir a partir dos chunks numerados.
  const chunkRe = /^uskids-member-history-\d{3,}\.json$/;
  const files = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter(f => chunkRe.test(f)).sort()
    : [];
  if (!files.length) return empty;
  console.log(`📂 Monolítico ausente — a reconstruir cache a partir de ${files.length} chunks`);
  const merged = { gerado_em: null, torneios: {}, jogadores: {} };
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      Object.assign(merged.torneios, d.torneios || {});
      Object.assign(merged.jogadores, d.jogadores || {});
      if (d.gerado_em && (!merged.gerado_em || d.gerado_em > merged.gerado_em)) {
        merged.gerado_em = d.gerado_em;
      }
    } catch (err) {
      console.warn(`   ⚠️  ${f}: ${err.message}`);
    }
  }
  return merged;
}

// ── Escrita em chunks numerados ──────────────
// O monolítico (`uskids-member-history.json`) deixou de ser escrito: com
// 11k+ jogadores o `JSON.stringify` do objecto inteiro passa o limite duro
// do V8 para strings (536.870.888 chars ≈ 512 MB) e rebenta com
// `RangeError: Invalid string length`. Em vez disso escrevemos directamente
// chunks `uskids-member-history-NNN.json` ≤ ~85 MB cada — o mesmo formato
// que `split-member-history.js` produzia e que `loadCache()` e
// `build-member-history-slim.js` já sabem reler.
const SHARD_TARGET_MB   = 85;
const SHARD_TARGET_SIZE  = SHARD_TARGET_MB * 1024 * 1024;
const SHARD_RE = /^uskids-member-history-\d{3,}\.json$/;

function writeSharded(cacheObj) {
  fs.mkdirSync(DIR, { recursive: true });
  const geradoEm  = cacheObj.gerado_em || new Date().toISOString();
  const torneios  = cacheObj.torneios || {};
  const jogadores = cacheObj.jogadores || {};
  const mids = Object.keys(jogadores);

  // Apagar chunks antigos (o número de chunks varia de corrida para corrida).
  // Apaga-se antes de escrever para não deixar chunks órfãos de uma corrida
  // anterior maior.
  for (const f of fs.readdirSync(DIR)) {
    if (SHARD_RE.test(f)) fs.unlinkSync(path.join(DIR, f));
  }

  // Overhead fixo = envelope + `torneios` partilhado (duplicado em cada chunk;
  // build-member-history-slim.js faz merge). Aqui é pequeno (só {name}).
  const envelope = { gerado_em: geradoEm, torneios, jogadores: {} };
  const fixedOverhead = Buffer.byteLength(JSON.stringify(envelope), 'utf8');
  const playersBudget = Math.max(SHARD_TARGET_SIZE - fixedOverhead, 1024 * 1024);

  let chunkIdx = 1;
  let slice = {};
  let sliceSize = 0;
  const written = [];

  const flush = () => {
    if (!Object.keys(slice).length) return;
    const nnn = String(chunkIdx++).padStart(3, '0');
    const outPath = path.join(DIR, `uskids-member-history-${nnn}.json`);
    // Sem indentação — ficheiros de cache, não precisam de ser human-readable.
    const str = JSON.stringify({ gerado_em: geradoEm, torneios, jogadores: slice });
    fs.writeFileSync(outPath, str, 'utf8');
    written.push({ path: outPath, size: Buffer.byteLength(str, 'utf8') });
    slice = {};
    sliceSize = 0;
  };

  for (const mid of mids) {
    const entryStr  = JSON.stringify({ [mid]: jogadores[mid] });
    const entrySize = Buffer.byteLength(entryStr, 'utf8') - 2 + 1; // descontar {} + vírgula
    if (sliceSize + entrySize > playersBudget && Object.keys(slice).length > 0) flush();
    slice[mid] = jogadores[mid];
    sliceSize += entrySize;
  }
  flush();

  // Garantir que nenhum chunk excede 100 MB (GitHub rejeita ≥100 MB).
  const maxSize = written.reduce((m, w) => Math.max(m, w.size), 0);
  if (maxSize >= 100 * 1024 * 1024) {
    throw new Error(
      `Chunk excede 100 MB (${(maxSize / 1048576).toFixed(1)} MB). ` +
      `Baixar SHARD_TARGET_MB (actual: ${SHARD_TARGET_MB}).`
    );
  }
  return written;
}

// ── Re-match offline (--clean) ───────────────

function cleanAndRematch() {
  console.log('\n🧹  Modo --clean: re-match nomes\n');
  const cache = loadCache();
  if (!Object.keys(cache.jogadores).length) {
    console.log('Sem dados (nem monolítico nem chunks).');
    return;
  }
  const resultsFP = buildResultsFingerprints();

  let matched = 0, already = 0, agFixed = 0;

  for (const j of Object.values(cache.jogadores)) {
    if (!j.name || j.name === '?' || j.name === null || String(j.name).startsWith('[unknown')) {
      for (const [tid, t] of Object.entries(j.torneios || {})) {
        if (j.name && j.name !== '?' && j.name !== null) break;
        for (const [rn, rd] of Object.entries(t.rounds || {})) {
          if (!rd.strokes || !rd.strokes.length) continue;
          const m = resultsFP.get(`${tid}:R${rn}:${strokesKey(rd.strokes)}`);
          if (m) { j.name = m.name; j.country = m.country; j.place = m.place; matched++; break; }
        }
      }
    } else { already++; }

    // Fix ageGroup (most recent)
    const ts = Object.values(j.torneios || {}).sort((a, b) => parseDate(b.startDate).localeCompare(parseDate(a.startDate)));
    if (ts.length && ts[0].ageGroup && ts[0].ageGroup !== j.ageGroup) { j.ageGroup = ts[0].ageGroup; agFixed++; }
  }

  cache.gerado_em = new Date().toISOString();
  const chunks = writeSharded(cache);
  console.log(`  💾 ${chunks.length} chunks escritos`);

  const total = Object.keys(cache.jogadores).length;
  const named = Object.values(cache.jogadores).filter(j => j.name && j.name !== '?' && j.name !== null).length;
  console.log(`  Já tinham nome: ${already} | Novos matches: ${matched} | AgeGroups fixed: ${agFixed}`);
  console.log(`  Total: ${total} jogadores (${named} com nome)\n`);
}

// ── Main ─────────────────────────────────────

async function main() {
  const forceAll   = process.argv.includes('--force');
  const refreshAll = process.argv.includes('--refresh-all');

  if (process.argv.includes('--clean')) { cleanAndRematch(); return; }

  // --tcode N[,M,...] — processar SÓ estes torneios (em vez de ALL_TCODES).
  // Útil para apanhar um jogador novo num torneio específico sem re-scrapar
  // toda a lista (ex: --tcode 21931 para o Azata Golf). Flights auto-
  // descobertos via GetMeta (Boys 9-13). Não toca na rede dos restantes.
  const tcodeArgIdx = process.argv.indexOf('--tcode');
  const onlyTcodes = (tcodeArgIdx !== -1 && process.argv[tcodeArgIdx + 1])
    ? process.argv[tcodeArgIdx + 1].split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean)
    : null;

  // Em modo --refresh-all não precisamos de descobrir memberIDs novos —
  // iteramos sobre todos os já em cache. Saltamos completamente a Fase 1.
  const tcodes = refreshAll ? [] : (onlyTcodes || [...ALL_TCODES]);

  console.log('══════════════════════════════════════');
  console.log('📊  USKids Member History');
  console.log(`    ${new Date().toLocaleString('pt-PT')}`);
  if (refreshAll) {
    console.log('    🔄  Modo --refresh-all: re-fetch de TODOS os memberIDs em cache');
    console.log('         (apanha torneios novos fora dos ALL_TCODES)');
  } else {
    console.log(`    ${tcodes.length} torneios a processar`);
    if (forceAll) console.log('    ⚠️  Modo --force: re-fetch de todos os membros descobertos');
  }
  console.log('══════════════════════════════════════');

  // Carregar cache existente (monolítico ou chunks — ver loadCache())
  let cache = loadCache();
  const existingMembers = new Set(Object.keys(cache.jogadores));
  console.log(`\n📂 Cache: ${existingMembers.size} jogadores`);

  // Fingerprints do uskids-results.json
  const resultsFP = buildResultsFingerprints();
  console.log(`  📄 ${resultsFP.size} fingerprints do uskids-results.json`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Mapa directo: memberID (node_id) → { name, country, place }
  // Construído a partir do GetPlayerTeeTimes — funciona mesmo sem scores
  const memberNameMap = new Map();

  const apiFingerprints = new Map(); // "tcode:fid" → Map(strokesKey → info)
  const memberFlights   = new Map(); // memberID → [{ tcode, fid, ageGroup }]
  const allMemberIds    = new Set();

  // Para saber quais torneios cada membro já tem em cache
  // memberID → Set(tcode)
  const cachedTorneios = new Map();
  for (const [mid, j] of Object.entries(cache.jogadores)) {
    cachedTorneios.set(mid, new Set(Object.keys(j.torneios || {})));
  }

  let matched = 0, unmatched = 0, skipped = 0, skippedTopN = 0;

  try {
    // ══════════════════════════════════════════════
    // FASE 1: Nomes directos + Fingerprints + member IDs
    // ══════════════════════════════════════════════

    const flightCache = loadFlightCache();
    let cacheHits = 0, cacheMiss = 0;

    for (const tcode of tcodes) {
      // ── Reaproveitar da flight-cache (sem rede) se o torneio já fechou ──
      // Excepção: em modo --tcode forçamos re-descoberta (ignora cache) para
      // a política de escalões actual (10-13) ser aplicada de imediato.
      const cachedT = flightCache.torneios[String(tcode)];
      if (cachedT && !flightNeedsRefetch(cachedT.date) && !onlyTcodes) {
        if (!cache.torneios[tcode] || !cache.torneios[tcode].name) {
          cache.torneios[tcode] = { name: cachedT.name || `t=${tcode}` };
        }
        const cYear = cachedT.year || anoDoTorneio({ start_date: cachedT.date });
        const cFlights = cachedT.flights || {};
        console.log(`\n▶ ${cachedT.name || `t=${tcode}`}${cYear ? ` (${cYear})` : ''} (${Object.keys(cFlights).length} flights) [cache]`);
        for (const [fidStr, fl] of Object.entries(cFlights)) {
          const fid = parseInt(fidStr, 10);
          const ag  = fl.ag || '';
          // Re-aplicar o filtro de escalões global (exclui Boys 9, inclui 13).
          if (!escalaoValido(ag)) continue;
          // Re-aplicar filtro de idade (CURRENT_YEAR muda entre runs).
          if (cYear) {
            const ageNum = parseAgeNum(ag);
            if (ageNum != null && (CURRENT_YEAR - (cYear - ageNum)) >= MAX_AGE_TODAY) continue;
          }
          // Re-aplicar restrição de escalões por torneio.
          const escRestric = ESCALOES_POR_TORNEIO[tcode];
          if (escRestric && !escRestric.some(p => ag.toLowerCase().startsWith(p))) continue;
          // Reconstruir fpMap (entradas ambíguas não foram persistidas).
          const fpMap = new Map();
          for (const [k, info] of Object.entries(fl.fp || {})) if (info) fpMap.set(k, info);
          apiFingerprints.set(`${tcode}:${fid}`, fpMap);
          // Nomes directos por node_id (poucos, mas preservados).
          for (const [mid, info] of Object.entries(fl.direct || {})) {
            if (info && !memberNameMap.has(String(mid))) memberNameMap.set(String(mid), info);
          }
          for (const mid of fl.memberIds || []) {
            allMemberIds.add(mid);
            if (!memberFlights.has(mid)) memberFlights.set(mid, []);
            memberFlights.get(mid).push({ tcode, fid, ageGroup: ag });
          }
          console.log(`  ⛳ ${ag} (flight ${fid}) — ${(fl.memberIds || []).length} membros | ${fpMap.size} fingerprints [cache]`);
        }
        cacheHits++;
        continue; // próximo torneio — não tocou na rede
      }
      cacheMiss++;

      await initPage(page, tcode);

      // GetMeta uma vez por torneio → nome + ano (para o filtro de idade) +
      // flights (auto-descoberta quando não há flights manuais).
      let meta = null;
      try {
        meta = await pageJSON(page, `${API}?op=GetMeta&t=${tcode}`);
        await sleep(DELAY_MS);
      } catch (err) {
        console.warn(`    ⚠️ GetMeta falhou para t=${tcode}: ${err.message}`);
      }

      if (!cache.torneios[tcode] || !cache.torneios[tcode].name) {
        cache.torneios[tcode] = { name: meta?.tournament?.name || `t=${tcode}` };
      }

      const tournYear = anoDoTorneio(meta);
      let flights = FLIGHTS_MANUAL[tcode];
      if (!flights || flights.length === 0) flights = parseFlights(meta);

      // Entrada nova da flight-cache para este torneio (preenchida por flight abaixo).
      const fcEntry = {
        name: cache.torneios[tcode].name,
        date: meta?.tournament?.start_date || meta?.start_date || '',
        year: tournYear || null,
        flights: {},
      };
      flightCache.torneios[String(tcode)] = fcEntry;

      const tournLabel = cache.torneios[tcode].name;
      console.log(`\n▶ ${tournLabel}${tournYear ? ` (${tournYear})` : ''} (${flights.length} flights)`);

      for (const { fid, ag } of flights) {
        // ── Filtro de idade: ignorar flights de crianças hoje ≥ MAX_AGE_TODAY ──
        if (tournYear) {
          const ageNum = parseAgeNum(ag);
          if (ageNum != null) {
            const birthYear = tournYear - ageNum;
            const ageToday  = CURRENT_YEAR - birthYear;
            if (ageToday >= MAX_AGE_TODAY) {
              console.log(`  ⏭️  ${ag} (flight ${fid}) — nasc.~${birthYear}, hoje ~${ageToday} anos ≥ ${MAX_AGE_TODAY} → ignorado`);
              continue;
            }
          }
        }

        // ── Restrição de escalões por torneio (se configurada) ──
        const escRestric = ESCALOES_POR_TORNEIO[tcode];
        if (escRestric && !escRestric.some(p => (ag || '').toLowerCase().startsWith(p))) {
          console.log(`  ⏭️  ${ag} (flight ${fid}) — fora dos escalões configurados p/ t=${tcode}`);
          continue;
        }

        console.log(`  ⛳ ${ag} (flight ${fid})`);

        // Member IDs via GetTournamentPlayers
        let memberIds = [];
        try {
          const tp = await pageJSON(page, `${API}?op=GetTournamentPlayers&t=${tcode}&f=${fid}`);
          memberIds = tp.PlayerNodeId || [];
        } catch (err) {
          console.warn(`    ⚠️ GetTournamentPlayers falhou: ${err.message}`);
          continue;
        }
        await sleep(DELAY_MS);

        // GetPlayerTeeTimes — extrai nomes directos E fingerprints de strokes
        const fpKey = `${tcode}:${fid}`;
        const fpMap = new Map();
        const directMap = {};
        let directNames = 0;

        try {
          const totalPages = Math.ceil((memberIds.length || 20) / 20);
          for (let p = 1; p <= totalPages; p++) {
            const d = await getPlayerTeeTimes(page, fid, 1, p);
            if (!d) continue;

            for (const [pid, pl] of Object.entries(d.flight_players || {})) {
              const name    = `${(pl.first || '').trim()} ${(pl.last || '').trim()}`.trim();
              const country = (pl.country || '').toUpperCase();
              const place   = pl.place || '';
              const info    = { name, country, place };

              if (!name) continue;

              // ── Estratégia 1: mapeamento directo por node_id ──
              // O GetPlayerTeeTimes pode expor o node_id do membro em vários campos.
              // Tentamos os mais comuns; o primeiro que bater com um memberID conhecido ganha.
              const candidateIds = [
                pl.node_id, pl.member_id, pl.member_node_id,
                pl.memberId, pl.nodeId, pl.mid,
                pid,            // às vezes o próprio key do flight_player é o node_id
              ].filter(Boolean).map(String);

              for (const cid of candidateIds) {
                if (memberIds.map(String).includes(cid)) {
                  if (!memberNameMap.has(cid)) {
                    memberNameMap.set(cid, info);
                    directNames++;
                  }
                  directMap[cid] = info;
                  break;
                }
              }

              // ── Estratégia 2: fingerprint de strokes (fallback) ──
              for (const [rn, rd] of Object.entries(pl.rounds || {})) {
                const sk = strokesKey(rd.strokes);
                if (!sk) continue;
                const fkey = `R${rn}:${sk}`;
                // Cruzamento de segurança: chave partilhada por nomes diferentes
                // dentro do mesmo flight → ambígua → null (matchPlayer ignora).
                if (fpMap.has(fkey)) {
                  const prev = fpMap.get(fkey);
                  if (prev && prev.name !== info.name) fpMap.set(fkey, null);
                } else {
                  fpMap.set(fkey, info);
                }
              }
            }
            await sleep(DELAY_MS);
          }
        } catch (err) {
          console.warn(`    ⚠️ GetPlayerTeeTimes falhou: ${err.message}`);
        }

        apiFingerprints.set(fpKey, fpMap);

        for (const mid of memberIds) {
          allMemberIds.add(mid);
          if (!memberFlights.has(mid)) memberFlights.set(mid, []);
          memberFlights.get(mid).push({ tcode, fid, ageGroup: ag });
        }

        // Persistir este flight na flight-cache (omitindo fingerprints ambíguos = null).
        const fpObj = {};
        for (const [k, v] of fpMap) if (v) fpObj[k] = v;
        fcEntry.flights[fid] = { ag, memberIds, fp: fpObj, direct: directMap };

        console.log(`    → ${memberIds.length} membros | ${fpMap.size} fingerprints | ${directNames} nomes directos`);
      }
    }

    if (!refreshAll) {
      saveFlightCache(flightCache);
      console.log(`  📦 Flight-cache: ${cacheHits} torneios reaproveitados, ${cacheMiss} obtidos da net`);
      console.log(`\n  🗺️  Nomes directos por node_id: ${memberNameMap.size}/${allMemberIds.size}`);
    }

    // ══════════════════════════════════════════════
    // FASE 2: Histórico + matching
    // Processa:
    //   A) Membros completamente novos (modo default)
    //   B) Membros em cache mas que aparecem num torneio novo para eles
    //   C) [--refresh-all] TODOS os memberIDs em cache (para apanhar
    //      torneios novos fora dos ALL_TCODES)
    // ══════════════════════════════════════════════

    // Em --refresh-all a Fase 1 foi saltada; precisamos de inicializar a
    // página numa URL signupanytime válida para que pageJSON() tenha contexto.
    if (refreshAll) {
      const seedTcode = ALL_TCODES[0];
      console.log(`\n  🌐 Init page (seed t=${seedTcode}) para sessão signupanytime...`);
      await initPage(page, seedTcode);
    }

    // Determinar quais membros precisam de re-fetch
    const toProcess = [];
    if (refreshAll) {
      // Iterar sobre TODOS os memberIDs em cache, independentemente de
      // aparecerem em ALL_TCODES neste run. Marcamos isNew=false porque
      // têm sempre entrada prévia (o name é preservado pelo fallback
      // "cached.name" em Phase 2).
      for (const midStr of existingMembers) {
        toProcess.push({ mid: midStr, isNew: false });
      }
    } else {
      for (const mid of allMemberIds) {
        const midStr = String(mid);
        if (forceAll || !existingMembers.has(midStr)) {
          // Novo ou --force
          toProcess.push({ mid, isNew: true });
        } else {
          // Já em cache — verificar se aparece em algum torneio que ainda não tem
          const cached = cachedTorneios.get(midStr) || new Set();
          const mFlights = memberFlights.get(mid) || [];
          const hasNewTourn = mFlights.some(({ tcode }) => !cached.has(String(tcode)));
          if (hasNewTourn) toProcess.push({ mid, isNew: false });
        }
      }
    }

    const nNovos      = toProcess.filter(x => x.isNew).length;
    const nActualizar = toProcess.filter(x => !x.isNew).length;

    console.log(`\n══════════════════════════════════════`);
    console.log(`📊 FASE 2 — Histórico de jogadores`);
    if (refreshAll) {
      console.log(`   Modo --refresh-all`);
      console.log(`   Total em cache:  ${existingMembers.size}`);
      console.log(`   A re-fetch:      ${toProcess.length}`);
    } else {
      console.log(`   Total inscritos: ${allMemberIds.size}`);
      console.log(`   Novos:           ${nNovos}`);
      console.log(`   A actualizar:    ${nActualizar} (já em cache mas torneio novo)`);
      console.log(`   Em cache OK:     ${allMemberIds.size - toProcess.length}`);
    }
    console.log(`══════════════════════════════════════\n`);

    let processed = 0;

    for (const { mid, isNew } of toProcess) {
      processed++;
      const midStr = String(mid);

      try {
        const data = await pageJSON(page, `${API}?op=GetMemberTournamentResults&m=${mid}`);
        const tids = Object.keys(data);

        if (tids.length === 0) { continue; }

        // ── Matching de nome (3 estratégias) — RESOLVIDO ANTES dos filtros
        // para podermos escrever o nome de TODOS os jogadores descobertos,
        // mesmo os que vão ser ignorados (Girls / fora do top-N). ──

        // 1. Mapa directo por node_id (funciona mesmo sem scores)
        let playerMatch = memberNameMap.get(midStr) || null;

        // 2. Fingerprint de strokes (API + results.json)
        if (!playerMatch) {
          const mFlights = memberFlights.get(mid) || [];
          playerMatch = matchPlayer(data, apiFingerprints, resultsFP, mFlights);
        }

        // 3. Tentar recuperar nome do próprio histórico se já estava em cache
        if (!playerMatch && existingMembers.has(midStr)) {
          const cached = cache.jogadores[midStr];
          if (cached?.name && cached.name !== '?') {
            playerMatch = { name: cached.name, country: cached.country || '', place: cached.place || '' };
          }
        }

        const playerName    = playerMatch?.name    || '?';
        const playerCountry = playerMatch?.country || '';
        const playerPlace   = playerMatch?.place   || '';

        // Verificar ageGroup — saltar Girls (escreve o nome para visibilidade)
        const latestT = Object.values(data).sort((a, b) =>
          parseDate(b.t_start_date).localeCompare(parseDate(a.t_start_date)))[0];
        const ag = latestT?.p_age_group || '';
        if (ag.startsWith('Girls') || ag.includes('Girl')) {
          console.log(`  🚺 [${processed}/${toProcess.length}] ${playerName} | ${ag} — Girls, ignorado`);
          skipped++; continue;
        }

        // ── Filtro TOP-N: só guardar quem ficou no top-N de pelo menos um
        // dos torneios onde foi descoberto. Aplica-se apenas a membros NOVOS
        // em modo default (cache existente e --refresh-all já são curados).
        // Manuel nunca é filtrado.
        if (!refreshAll && isNew && TOP_N_PER_FLIGHT > 0 && !MANUEL_MIDS.has(midStr)) {
          const discoverTcodes = new Set((memberFlights.get(mid) || []).map(f => String(f.tcode)));
          // Se foi descoberto num torneio FULL FIELD, guardar sempre (sem top-N).
          const isFullField = [...discoverTcodes].some(tc => FULL_FIELD_TCODES.has(parseInt(tc, 10)));
          if (!isFullField) {
            let bestPlace = Infinity;
            for (const tid of tids) {
              if (!discoverTcodes.has(String(tid))) continue;
              const pl = parsePlace(data[tid]?.p_place);
              if (pl != null && pl < bestPlace) bestPlace = pl;
            }
            if (bestPlace > TOP_N_PER_FLIGHT) {
              console.log(`  🚫 [${processed}/${toProcess.length}] ${playerName} | ${ag} — fora do top-${TOP_N_PER_FLIGHT} (melhor: ${bestPlace})`);
              skippedTopN++; continue;
            }
          }
        }

        if (playerName !== '?') matched++; else unmatched++;

        // ── Construir entrada do jogador ──────────────────────────
        // Se já existia em cache, partir dela para preservar torneios anteriores
        const entradaExistente = cache.jogadores[midStr] || null;
        const torneiosExistentes = entradaExistente?.torneios || {};

        const torneiosNovos = {};
        for (const tid of tids) {
          const t = data[tid];
          const rounds = {};
          for (const [rn, rd] of Object.entries(t.p_rounds || {})) {
            rounds[rn] = {
              strokes:   rd.strokes,
              course:    rd.course_name,
              startHole: rd.start_hole,
              startTime: rd.start_time,
              group:     rd.group_number,
              gross:     rd.num_strokes,
              holes:     rd.num_holes,
            };
          }
          torneiosNovos[tid] = {
            name:        t.t_name,
            type:        t.t_type,
            startDate:   t.t_start_date,
            endDate:     t.t_end_date,
            totalRounds: t.t_rounds,
            holesPerRound: t.t_holes_per_round,
            par:         t.t_pars,
            yards:       t.t_yards,
            ageGroup:    t.p_age_group,
            status:      t.p_status,
            place:       t.p_place,
            totalStrokes: t.p_strokes,
            points:      t.p_points,
            rounds,
          };
        }

        // Merge: API devolve o histórico completo, mas preservamos
        // eventuais campos extra que possamos ter adicionado manualmente
        const torneiosMerged = { ...torneiosExistentes, ...torneiosNovos };

        cache.jogadores[midStr] = {
          memberId: mid,
          name:     playerName !== '?' ? playerName : (entradaExistente?.name || '?'),
          country:  playerCountry || entradaExistente?.country || '',
          place:    playerPlace   || entradaExistente?.place   || '',
          ageGroup: ag,
          totalTorneios: Object.keys(torneiosMerged).length,
          torneios: torneiosMerged,
        };

        const label  = playerName !== '?' ? '✅' : '❓';
        const tag    = isNew ? 'NOVO' : 'UPD';
        const nTorns = Object.keys(torneiosMerged).length;
        console.log(`  ${label} [${processed}/${toProcess.length}][${tag}] ${playerName} | ${ag} | ${nTorns} torneios`);

      } catch (err) {
        console.warn(`  ❌ [${processed}/${toProcess.length}] m=${mid}: ${err.message}`);
      }

      await sleep(DELAY_HIST);

      if (processed % 250 === 0) {
        cache.gerado_em = new Date().toISOString();
        const chunks = writeSharded(cache);
        console.log(`  💾 Checkpoint: ${Object.keys(cache.jogadores).length} jogadores em ${chunks.length} chunks`);
      }
    }

    if (skipped) console.log(`\n  🚫 ${skipped} Girls/outros ignorados`);
    if (skippedTopN) console.log(`  🚫 ${skippedTopN} fora do top-${TOP_N_PER_FLIGHT} ignorados`);

  } finally {
    await browser.close();
  }

  // ── Fix ageGroups (most recent) ──
  let agFixed = 0;
  for (const j of Object.values(cache.jogadores)) {
    const ts = Object.values(j.torneios || {}).sort((a, b) =>
      parseDate(b.startDate).localeCompare(parseDate(a.startDate)));
    if (ts.length && ts[0].ageGroup && ts[0].ageGroup !== j.ageGroup) {
      j.ageGroup = ts[0].ageGroup; agFixed++;
    }
    j.totalTorneios = Object.keys(j.torneios || {}).length;
  }

  // ── Salvar ──
  cache.gerado_em = new Date().toISOString();
  const chunksFinais = writeSharded(cache);

  const total      = Object.keys(cache.jogadores).length;
  const named      = Object.values(cache.jogadores).filter(j => j.name && j.name !== '?').length;
  const totalEntries = Object.values(cache.jogadores)
    .reduce((s, j) => s + Object.keys(j.torneios).length, 0);

  const maxChunk = chunksFinais.reduce((m, w) => Math.max(m, w.size), 0);
  console.log('\n══════════════════════════════════════');
  console.log(`✅  uskids-member-history-NNN.json (${chunksFinais.length} chunks, maior ${(maxChunk / 1048576).toFixed(1)} MB)`);
  console.log(`    ${total} jogadores (${named} com nome, ${total - named} sem nome)`);
  console.log(`    ${totalEntries} entradas de torneio`);
  console.log(`    Matched: ${matched} | Unmatched: ${unmatched} | AgeGroups fixed: ${agFixed}`);
  console.log(`    Filtros: idade <${MAX_AGE_TODAY} anos hoje | top-${TOP_N_PER_FLIGHT} por escalão (${skippedTopN} cortados)`);
  console.log('══════════════════════════════════════');
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
