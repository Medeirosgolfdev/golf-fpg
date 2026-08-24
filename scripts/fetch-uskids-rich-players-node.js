'use strict';

/**
 * fetch-uskids-rich-players-node.js
 *
 * Pipeline RICA por jogador. Para cada memberID alvo:
 *   1. GetMemberTournamentResults → lista de tcodes da carreira
 *   2. GetMeta (cached) → mapear age_group → flight_id por torneio
 *   3. GetPlayerTeeTimes (cached) → extrair TODOS os campos ricos
 *      (teeMarkerName, teeMarkerColor, startTime, startHole, groupNumber,
 *       playerNumber, status, points, place(cidade), handicap, driverLength,
 *       liveScoringId, flightRound)
 *   4. Escrever data-archive/uskids-rich-players/{memberID}.json
 *
 * Lista de jogadores alvo (por defeito): uniao de
 *   - public/data/uskids-member-history-slim.json (jogadores actualmente tracked)
 *   - quaisquer memberIDs novos descobertos via GetTournamentPlayers nos
 *     torneios listados em ALL_TCODES_DISCOVERY (em curso / recentes)
 *
 * SEM filtros de TOP-N nem de idade — queremos a carreira completa.
 *
 * Pivot por jogador (vs by-tournament): cada jogador num ficheiro permite
 *   diffs git limpos, incremental fácil (skip ficheiros recentes), e UI
 *   pode carregar selectivamente "ficha do jogador" sem ler tudo.
 *
 * Node puro + fetch — signupanytime.com é público server-side (sem CORS,
 * sem cookies). Compatível com Node 18+ e com GitHub Actions ubuntu-latest.
 *
 * CLI:
 *   node fetch-uskids-rich-players-node.js                # default: skip-existing, since-days=14
 *   node fetch-uskids-rich-players-node.js --players 630106,591440
 *   node fetch-uskids-rich-players-node.js --since-days 30
 *   node fetch-uskids-rich-players-node.js --force-rebuild   # ignora todos os caches
 *   node fetch-uskids-rich-players-node.js --concurrency 4
 *   node fetch-uskids-rich-players-node.js --limit 10        # smoke test
 *   node fetch-uskids-rich-players-node.js --discovery-only  # só descobre novos mids, não escreve players
 *
 * Exit codes:
 *   0 — escreveu pelo menos 1 ficheiro novo/actualizado (commit)
 *   2 — sem novidades (skip commit, NÃO é erro)
 *   1 — erro fatal
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── Paths ────────────────────────────────────
const ROOT          = path.join(__dirname, '..');
const SLIM_PATH     = path.join(ROOT, 'public', 'data', 'uskids-member-history-slim.json');
const OUT_DIR       = path.join(ROOT, 'data-archive', 'uskids-rich-players');
// A cache é GZIPADA (2505 torneios de meta+flights crus dão ~84 MB em JSON e
// cresciam ~20 MB/semana). Em claro passou os 100 MB do GitHub a 17 Ago 2026 e
// o push era REJEITADO — com ele ia abaixo o commit inteiro, incluindo as
// fichas dos jogadores desse run. Gzipada são ~8 MB e o histórico do repo
// deixa de levar um blob de 100+ MB por semana. Custo: ~1 s por checkpoint.
const FLIGHT_CACHE  = path.join(ROOT, 'data-archive', 'uskids-rich-flight-cache.json.gz');
const FLIGHT_CACHE_LEGACY = path.join(ROOT, 'data-archive', 'uskids-rich-flight-cache.json');
const RESULTS_PATH  = path.join(ROOT, 'public', 'data', 'uskids-results.json');
const RUN_SUMMARY   = path.join(ROOT, 'data-archive', 'uskids-rich-run-summary.json');

// ── Orçamento de tempo ───────────────────────
// O run completo (Fase 2: milhares de torneios × tee-times paginados) não cabe
// no limite de 6h do GitHub Actions → o job era cancelado a meio e NADA era
// committado (nem a cache aquecida), recomeçando a frio todas as semanas.
// Com um prazo, o script pára graciosamente, grava a cache + ficheiros feitos e
// sai com exit 0 para o step de commit persistir o progresso; --since-days 14
// faz as semanas seguintes continuarem de onde ficaram até apanhar o atraso.
let DEADLINE = Infinity;
const pastDeadline = () => Date.now() > DEADLINE;

// ── Config ───────────────────────────────────
const API         = 'https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx';
const UA          = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const REFERER     = (t) => `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t || 0}`;
const FRESH_DAYS  = 15;   // re-fetch flight data se torneio ≤ 15 dias ou no futuro
const DELAY_MS    = 150;  // entre chamadas API
const DELAY_HIST  = 100;
const TIMEOUT_MS  = 20000;
const MAX_RETRIES = 3;

// Torneios em curso / recentes a varrer para descobrir memberIDs NOVOS que ainda
// não estão no slim. Idêntico ao ALL_TCODES do fetch-uskids-member-history.js,
// mas só os recentes/futuros — para os antigos confiamos no que já está no slim.
const ALL_TCODES_DISCOVERY = [
  21080, 21131, 21610, 22243, 22187,     // World/Euro/Venice/RWB 2026
  18242, 19418, 20175,                    // edições 2025 (Manuel tracked)
  21004,                                  // Desert Shootout 2026
];

// ── Fingerprinting (mesmas constantes do fetch-uskids-member-history.js) ─
const MIN_FINGERPRINT_HOLES    = 6;
const MIN_FINGERPRINT_DISTINCT = 3;

function strokesKey(arr) {
  if (!arr || !arr.length) return '';
  const pos = arr.filter(v => Number(v) > 0);
  if (pos.length < MIN_FINGERPRINT_HOLES) return '';
  if (new Set(pos).size < MIN_FINGERPRINT_DISTINCT) return '';
  return pos.join(',');
}

function parseDate(s) {
  if (!s) return '';
  if (String(s).includes('-')) return String(s);
  const p = String(s).split('/');
  return p.length === 3 ? `${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}` : '';
}

function parsePlace(p) {
  if (p == null) return null;
  const m = String(p).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// "Boys 9", "Boys 9-10", "Girls 11" → menor número
function parseAgeNum(ag) {
  const nums = String(ag).match(/\d+/g);
  return nums ? Math.min(...nums.map(Number)) : null;
}

function anoDoTorneio(meta) {
  const sd = meta?.tournament?.start_date || meta?.start_date || '';
  const m  = String(sd).match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function flightNeedsRefetch(dateStr) {
  const iso = parseDate(dateStr);
  if (!iso) return true;
  const t = Date.parse(iso + 'T00:00:00Z');
  if (Number.isNaN(t)) return true;
  const ageDays = (Date.now() - t) / 86400000;
  return ageDays <= FRESH_DAYS; // recente OU futuro (ageDays < 0)
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── HTTP helpers (Node 18+ fetch) ────────────
async function apiGet(url, refererTcode = 0) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const ctl = new AbortController();
    const to  = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': UA,
          'Accept':     'application/json, text/javascript, */*; q=0.01',
          'Referer':    REFERER(refererTcode),
        },
        signal: ctl.signal,
      });
      clearTimeout(to);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (err) {
      clearTimeout(to);
      if (attempt === MAX_RETRIES) throw err;
      await sleep(500 * attempt);
    }
  }
}

async function apiPost(url, refererTcode = 0) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const ctl = new AbortController();
    const to  = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent':     UA,
          'Accept':         'application/json, text/javascript, */*; q=0.01',
          'Content-Type':   'application/x-www-form-urlencoded; charset=UTF-8',
          'Referer':        REFERER(refererTcode),
          'Origin':         'https://www.signupanytime.com',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: '',
        signal: ctl.signal,
      });
      clearTimeout(to);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (err) {
      clearTimeout(to);
      if (attempt === MAX_RETRIES) throw err;
      await sleep(500 * attempt);
    }
  }
}

// GetPlayerTeeTimes — descoberta 2026-05-12: POST + t=1 (final results, funciona
// para tcodes encerrados E vivos) + params extra pt=undefined&jbgr={ts}&c=1.
// Fallback para t=0 (live tee times) se t=1 vier vazio.
async function getPlayerTeeTimes(tcode, fid, round, pageNum) {
  const jbgr = Date.now();
  const u1 = `${API}?op=GetPlayerTeeTimes&f=${fid}&r=${round}&p=${pageNum}&t=1&pt=undefined&jbgr=${jbgr}&c=1`;
  let d = await apiPost(u1, tcode);
  if (d?.flight_players && Object.keys(d.flight_players).length) return d;
  try {
    const u0 = `${API}?op=GetPlayerTeeTimes&f=${fid}&r=${round}&p=${pageNum}&t=0&pt=undefined&jbgr=${jbgr}&c=1`;
    d = await apiPost(u0, tcode);
  } catch {}
  return d;
}

// ── Cache helpers ────────────────────────────
function loadFlightCache() {
  // .gz é a fonte de verdade; o .json em claro só é lido para migrar caches
  // antigas (o primeiro save grava .gz e apaga o .json).
  const src = fs.existsSync(FLIGHT_CACHE) ? FLIGHT_CACHE
            : fs.existsSync(FLIGHT_CACHE_LEGACY) ? FLIGHT_CACHE_LEGACY
            : null;
  if (!src) return { gerado_em: null, torneios: {} };
  try {
    const raw = fs.readFileSync(src);
    const txt = src === FLIGHT_CACHE ? zlib.gunzipSync(raw).toString('utf8')
                                     : raw.toString('utf8');
    if (src === FLIGHT_CACHE_LEGACY) console.log('  ↻ a migrar flight-cache legada (.json → .json.gz)');
    return JSON.parse(txt);
  } catch (e) {
    console.warn(`  ⚠️ flight-cache ilegível (${e.message}) — vai re-descobrir`);
    return { gerado_em: null, torneios: {} };
  }
}

function saveFlightCache(fc) {
  fc.gerado_em = new Date().toISOString();
  fs.mkdirSync(path.dirname(FLIGHT_CACHE), { recursive: true });
  // tmp+rename: a cache é gravada de 10 em 10 torneios e um run interrompido a
  // meio da escrita deixaria um .gz truncado (= re-descobrir tudo do zero).
  const tmp = `${FLIGHT_CACHE}.tmp`;
  fs.writeFileSync(tmp, zlib.gzipSync(Buffer.from(JSON.stringify(fc), 'utf8')));
  fs.renameSync(tmp, FLIGHT_CACHE);
  if (fs.existsSync(FLIGHT_CACHE_LEGACY)) fs.rmSync(FLIGHT_CACHE_LEGACY);
}

function loadSlimMids() {
  if (!fs.existsSync(SLIM_PATH)) {
    console.warn(`  ⚠️ slim não encontrado em ${SLIM_PATH} — começa de zero`);
    return new Set();
  }
  // O slim tem ~35 MB mas chave por chave o V8 lida bem com JSON.parse uma vez.
  const slim = JSON.parse(fs.readFileSync(SLIM_PATH, 'utf8'));
  return new Set(Object.keys(slim.jogadores || {}));
}

function loadResultsFingerprints() {
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

// ── Match (flightId, round) → flight_course (par[18] + lengths[18]) ─────
// O `meta.flight_courses` é indexado por `flight_round_id` (NÃO por flight_id).
// Para mapear, cruzar com `meta.flight_rounds[frId]`:
//   meta.flight_rounds[frId] = { flight: fid, round: r, ... }
// Retorna { pars, lengths } onde lengths é em JARDAS (×0.9144 para metros).
// Em flights 9H, pars[] tem 18 entries mas só 9 com par>0 — alinhar pelo par>0.
function findFlightCourse(meta, flightId, round) {
  if (!meta?.flight_rounds || !meta?.flight_courses) return null;
  const targetFid = String(flightId);
  const targetRound = parseInt(round, 10);
  for (const [frId, fro] of Object.entries(meta.flight_rounds)) {
    if (String(fro.flight) === targetFid && parseInt(fro.round, 10) === targetRound) {
      const fc = meta.flight_courses[frId];
      if (fc) return { pars: fc.pars, lengths: fc.lengths };
    }
  }
  return null;
}

// Quantas rondas tem este flight? Lê do meta (mais fiável que meta.tournament).
function flightRoundCount(meta, flightId) {
  const fl = meta?.flights?.[String(flightId)];
  if (!fl) return null;
  const n = parseInt(fl.round_count ?? fl.active ?? 0, 10);
  if (Number.isFinite(n) && n > 0) return n;
  // Fallback: contar entradas em meta.flight_rounds com esta flight
  let count = 0;
  for (const fro of Object.values(meta?.flight_rounds || {})) {
    if (String(fro.flight) === String(flightId)) count++;
  }
  return count || null;
}

// ── Match (memberID, tcode, p_age_group) → flight_id ─────────────────────
function findFlightForAgeGroup(meta, ageGroupName) {
  if (!meta?.flights || !meta?.age_groups) return null;
  const target = String(ageGroupName || '').trim().toLowerCase();
  for (const [fid, fl] of Object.entries(meta.flights)) {
    const agId   = fl.age_group;
    const agName = (meta.age_groups[agId]?.name || '').toLowerCase().trim();
    if (agName === target) return String(fid);
  }
  // Fallback: match parcial (ex: "Boys 9" vs "Boys 9 & Under")
  for (const [fid, fl] of Object.entries(meta.flights)) {
    const agId   = fl.age_group;
    const agName = (meta.age_groups[agId]?.name || '').toLowerCase().trim();
    if (agName && (agName.startsWith(target) || target.startsWith(agName))) return String(fid);
  }
  return null;
}

// Match memberID → pid local do flight via fingerprint de strokes.
// pl.rounds[rn].strokes (do GetPlayerTeeTimes) vs memberData.p_rounds[rn].strokes
// (do GetMemberTournamentResults). Se houver match, devolve o pid.
function findPidForMember(memberPlayerData, flightPlayers) {
  if (!memberPlayerData?.p_rounds || !flightPlayers) return null;
  // Construir fingerprint do membro
  const memberFps = {};
  for (const [rn, rd] of Object.entries(memberPlayerData.p_rounds)) {
    const sk = strokesKey(rd.strokes);
    if (sk) memberFps[rn] = sk;
  }
  if (Object.keys(memberFps).length === 0) return null;

  // Iterar pids do flight
  for (const [pid, pl] of Object.entries(flightPlayers)) {
    let allMatch = true;
    let matchCount = 0;
    for (const [rn, sk] of Object.entries(memberFps)) {
      const plSk = strokesKey(pl?.rounds?.[rn]?.strokes);
      if (plSk === sk) {
        matchCount++;
      } else if (plSk) {
        // Strokes diferentes na mesma ronda → não é o jogador
        allMatch = false;
        break;
      }
    }
    if (allMatch && matchCount > 0) return pid;
  }
  return null;
}

// ── Discovery: GetTournamentPlayers para encontrar memberIDs novos ───────
async function discoverNewMids(tcodes, knownMids) {
  const novos = new Set();
  for (const tcode of tcodes) {
    let meta;
    try {
      meta = await apiGet(`${API}?op=GetMeta&t=${tcode}`, tcode);
    } catch (err) {
      console.warn(`  ⚠️ GetMeta(${tcode}): ${err.message}`);
      continue;
    }
    await sleep(DELAY_MS);

    const flights = meta?.flights || {};
    for (const fid of Object.keys(flights)) {
      let tp;
      try {
        tp = await apiGet(`${API}?op=GetTournamentPlayers&t=${tcode}&f=${fid}`, tcode);
      } catch {
        await sleep(DELAY_MS); continue;
      }
      await sleep(DELAY_MS);

      for (const mid of (tp?.PlayerNodeId || [])) {
        const midStr = String(mid);
        if (!knownMids.has(midStr)) novos.add(midStr);
      }
    }
  }
  return novos;
}

// ── Phase 1: descobrir tcodes que cada player jogou ──────────────────────
async function fetchMemberCareers(mids, concurrency = 4) {
  const careers = new Map();  // mid → { p_age_group_latest, name?, country?, torneios: {tcode: {... raw GetMemberTournamentResults entry ...}} }
  const arr = Array.from(mids);
  const total = arr.length;
  let done = 0;

  async function processOne(mid) {
    try {
      const data = await apiGet(`${API}?op=GetMemberTournamentResults&m=${mid}`, 0);
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        careers.set(mid, data);
      }
    } catch (err) {
      console.warn(`  ❌ m=${mid}: ${err.message}`);
    } finally {
      done++;
      if (done % 100 === 0) console.log(`  ⌛ careers ${done}/${total}`);
      await sleep(DELAY_HIST);
    }
  }

  // Worker pool
  const workers = [];
  let i = 0;
  let stoppedEarly = false;
  for (let w = 0; w < concurrency; w++) {
    workers.push((async () => {
      while (i < arr.length) {
        if (pastDeadline()) { stoppedEarly = true; break; }
        const mid = arr[i++];
        await processOne(mid);
      }
    })());
  }
  await Promise.all(workers);
  if (stoppedEarly) console.log(`  ⏱️ prazo atingido — ${done}/${total} carreiras (${total - done} adiadas p/ próximo run)`);
  return careers;
}

// ── Phase 2: para cada tcode jogado, fetch meta + flights necessários ────
async function fetchTournamentRichData(tcodeAgeMap, flightCache, opts = {}) {
  const tournRich = new Map(); // tcode → { meta, flights: {fid: {ageGroup, players: {pid: {...}}}} }
  const tcodes = Array.from(tcodeAgeMap.keys());
  let done = 0;

  for (const tcode of tcodes) {
    // Prazo atingido: gravar a cache aquecida até aqui e parar. Os tcodes já
    // cacheados continuam a servir; os restantes ficam para o próximo run.
    if (pastDeadline()) {
      saveFlightCache(flightCache);
      console.log(`  ⏱️ prazo atingido — ${done}/${tcodes.length} torneios enriquecidos (cache gravada; resto no próximo run)`);
      break;
    }
    done++;
    const ageGroups = tcodeAgeMap.get(tcode);
    const cached = flightCache.torneios[String(tcode)];

    const ageGroupsArr = Array.from(ageGroups);
    if (cached && !flightNeedsRefetch(cached.startDate) && !opts.forceRebuild) {
      const hasAll = ageGroupsArr.every(ag =>
        Object.values(cached.flights || {}).some(fl => fl.ageGroup === ag)
      );
      if (hasAll) {
        tournRich.set(String(tcode), cached);
        if (done % 25 === 0) console.log(`  ⌛ tcodes ${done}/${tcodes.length} [cache]`);
        continue;
      }
    }

    // Fetch meta
    let meta;
    try {
      meta = await apiGet(`${API}?op=GetMeta&t=${tcode}`, tcode);
    } catch (err) {
      console.warn(`  ⚠️ GetMeta(${tcode}): ${err.message}`);
      continue;
    }
    await sleep(DELAY_MS);

    const tournData = {
      // ⚠ TEM de incluir flights + flight_rounds + flight_courses para que
      // findFlightForAgeGroup() e findFlightCourse() funcionem na Phase 3.
      // Sem isto, todos os campos ricos do jogador ficam null em cascata.
      meta: meta ? {
        tournament:     meta.tournament,
        courses:        meta.courses,
        age_groups:     meta.age_groups,
        flights:        meta.flights,
        flight_rounds:  meta.flight_rounds,
        flight_courses: meta.flight_courses,
      } : null,
      name:      meta?.tournament?.name || `t=${tcode}`,
      startDate: meta?.tournament?.start_date || '',
      year:      anoDoTorneio(meta),
      flights:   { ...(cached?.flights || {}) },  // preserva ageGroups previamente cacheados
    };

    for (const ag of ageGroupsArr) {
      const fid = findFlightForAgeGroup(meta, ag);
      if (!fid) {
        console.warn(`  ⚠️ t=${tcode}: sem flight p/ "${ag}"`);
        continue;
      }
      // Se já cacheado para este (tcode, fid) e ainda fresco, skip refetch.
      if (cached?.flights?.[fid] && !flightNeedsRefetch(cached.startDate) && !opts.forceRebuild) {
        tournData.flights[fid] = cached.flights[fid];
        continue;
      }

      // GetTournamentPlayers para saber quantos paginar
      let memberIds = [];
      try {
        const tp = await apiGet(`${API}?op=GetTournamentPlayers&t=${tcode}&f=${fid}`, tcode);
        memberIds = tp?.PlayerNodeId || [];
      } catch (err) {
        console.warn(`    ⚠️ GetTournamentPlayers(t=${tcode}, f=${fid}): ${err.message}`);
        continue;
      }
      await sleep(DELAY_MS);

      // Distâncias e par do tee jogado, por ronda. Indexado por round number.
      // Cada entry: { pars: number[18], lengths: number[18] } — lengths em JARDAS.
      const coursesByRound = {};

      const flightData = {
        ageGroup:    ag,
        memberIds,
        players:     {},   // pid → flight_player completo (todos os campos)
        rounds:      {},   // ronda → array de strokes etc (opcional, deriva dos players)
        coursesByRound,    // par+yards do tee jogado por ronda
      };

      const totalPages = Math.max(1, Math.ceil((memberIds.length || 20) / 20));
      // numRounds: o campo correcto no JSON da API é `meta.tournament.rounds`
      // (sem _count). Tentamos primeiro o flight-specific (round_count) e só
      // depois o tournament-level. Hardcoded 4 era catastrófico em torneios
      // de 1 ronda (Tour Championships locais), iterava R2/R3/R4 inexistentes.
      const tournRounds = parseInt(meta?.tournament?.rounds ?? meta?.tournament?.rounds_count ?? 0, 10);
      const flRounds   = flightRoundCount(meta, fid);
      const numRounds  = (flRounds && tournRounds)
        ? Math.min(flRounds, tournRounds)   // flight pode ter menos rondas que o tournament
        : (flRounds || tournRounds || 4);

      // Pre-popular coursesByRound a partir do meta (mesmo para rondas que não
      // tenham scores ainda — útil para torneios futuros / em curso).
      for (let r = 1; r <= numRounds; r++) {
        const fc = findFlightCourse(meta, fid, r);
        if (fc) coursesByRound[r] = fc;
      }

      // Iterar TODAS as rondas + páginas para apanhar todos os jogadores.
      // GetPlayerTeeTimes devolve por ronda; precisamos de fazer 1 chamada por
      // (round × page) e fundir os rounds num único pl.rounds por pid.
      for (let round = 1; round <= numRounds; round++) {
        let roundHasData = false;
        let firstPageFailed = false;
        for (let p = 1; p <= totalPages; p++) {
          let d;
          try {
            d = await getPlayerTeeTimes(tcode, fid, round, p);
          } catch (err) {
            // Se a 1ª página falha (ex: 500 porque a ronda nem existe), saltar
            // a ronda inteira em vez de espalhar 500s por todas as páginas.
            if (p === 1) {
              console.warn(`    ⚠️ R${round}: primeira página falhou (${String(err.message).slice(0,40)}) — saltar ronda`);
              firstPageFailed = true;
              break;
            }
            console.warn(`    ⚠️ GetPlayerTeeTimes(t=${tcode}, f=${fid}, r=${round}, p=${p}): ${err.message}`);
            continue;
          }
          // Se nenhuma data útil na primeira página, ronda provavelmente vazia
          if (p === 1 && (!d?.flight_players || Object.keys(d.flight_players).length === 0)) {
            firstPageFailed = true;
            break;
          }
          if (!d?.flight_players) { await sleep(DELAY_MS); continue; }
          roundHasData = true;

          for (const [pid, pl] of Object.entries(d.flight_players)) {
            if (!flightData.players[pid]) {
              flightData.players[pid] = {
                first:         pl.first,
                last:          pl.last,
                country:       pl.country,
                place:         pl.place,
                status:        pl.status,
                points:        pl.points,
                pointsAll:     pl.points_all,
                tiebreaker:    pl.tiebreaker,
                comments:      pl.comments,
                isCaptain:     pl.is_captain,
                isNewPlayer:   pl.is_new_player,
                handicap:      pl.handicap,
                driverLength:  pl.driverLength,
                team:          pl.team,
                teeMarkerName: pl.teeMarkerName,
                teeMarkerColor: pl.teeMarkerColor,
                // node_id se exposto em algum campo (cobertos os mais comuns)
                nodeId: pl.node_id || pl.member_id || pl.member_node_id || pl.memberId || pl.nodeId || pl.mid || null,
                rounds:        {},
              };
            }
            // Merge round data
            for (const [rn, rd] of Object.entries(pl.rounds || {})) {
              if (!flightData.players[pid].rounds[rn]) {
                flightData.players[pid].rounds[rn] = {
                  strokes:       rd.strokes,
                  numStrokes:    rd.num_strokes,
                  numHoles:      rd.num_holes,
                  startHole:     rd.start_hole,
                  startTime:     rd.start_time,
                  groupNumber:   rd.group_number,
                  playerNumber:  rd.player_number,
                  liveScoringId: rd.live_scoring_id,
                  flightRound:   rd.flight_round,
                };
              }
            }
          }
          await sleep(DELAY_MS);
        }
        // Se a ronda actual não respondeu (firstPageFailed) e já tínhamos
        // dados numa ronda anterior, assumir que rondas seguintes não existem
        // e sair do loop. Evita bombardear HTTP 500 em rondas inexistentes.
        if (firstPageFailed && round > 1) {
          break;
        }
        // Se a ronda 1 falhou, removê-la do coursesByRound (o meta tinha-a mas
        // o GetPlayerTeeTimes diz que está vazia — pode ser bug do meta).
        if (firstPageFailed && round === 1) {
          delete coursesByRound[round];
        }
      }

      tournData.flights[fid] = flightData;
    }

    tournRich.set(String(tcode), tournData);
    flightCache.torneios[String(tcode)] = tournData;

    if (done % 10 === 0) {
      saveFlightCache(flightCache);
      console.log(`  ⌛ tcodes ${done}/${tcodes.length} [checkpoint]`);
    }
  }

  saveFlightCache(flightCache);
  return tournRich;
}

// ── Phase 3: para cada player, construir o ficheiro {memberID}.json ─────
function buildPlayerFile(mid, careerData, tournRich, resultsFP) {
  const out = {
    memberID:  String(mid),
    name:      null,
    country:   null,
    place:     null,
    ageGroup:  null,
    lastUpdated: new Date().toISOString(),
    totalTorneios: 0,
    torneios: {},
  };

  let ageGroupLatest = null;
  let dateLatest     = '';

  for (const [tcode, t] of Object.entries(careerData)) {
    const tcodeStr = String(tcode);
    const rich  = tournRich.get(tcodeStr);
    const ag    = t.p_age_group || '';
    const richFlightId = rich ? findFlightForAgeGroup(rich.meta, ag) : null;
    const richFlight   = richFlightId ? rich.flights[richFlightId] : null;

    // Match mid → pid usando fingerprint de strokes
    let pid = null;
    let richPlayer = null;
    if (richFlight?.players) {
      pid = findPidForMember(t, richFlight.players);
      if (pid) richPlayer = richFlight.players[pid];
    }

    // Capturar nome/país do richPlayer (fonte mais fiável) ou de results
    if (!out.name && richPlayer) {
      out.name = `${(richPlayer.first || '').trim()} ${(richPlayer.last || '').trim()}`.trim() || null;
      out.country = (richPlayer.country || '').toUpperCase() || null;
      out.place = richPlayer.place || null;
    }
    if (!out.name) {
      // Tenta via fingerprint do uskids-results.json
      for (const [rn, rd] of Object.entries(t.p_rounds || {})) {
        const sk = strokesKey(rd.strokes);
        if (!sk) continue;
        const m = resultsFP.get(`${tcode}:R${rn}:${sk}`);
        if (m) { out.name = m.name; out.country = m.country; out.place = m.place; break; }
      }
    }

    // Determinar ageGroup mais recente
    const isoDate = parseDate(t.t_start_date);
    if (isoDate > dateLatest) {
      dateLatest     = isoDate;
      ageGroupLatest = ag || ageGroupLatest;
    }

    // Construir entry do torneio (merge: dados da carreira + dados ricos)
    const ronds = {};
    // Começa com dados básicos do GetMemberTournamentResults
    for (const [rn, rd] of Object.entries(t.p_rounds || {})) {
      ronds[rn] = {
        strokes:     rd.strokes,
        numStrokes:  rd.num_strokes,
        numHoles:    rd.num_holes,
        course:      rd.course_name,
      };
    }
    // Enriquece com dados do GetPlayerTeeTimes (se houver pid match)
    if (richPlayer?.rounds) {
      for (const [rn, rd] of Object.entries(richPlayer.rounds)) {
        ronds[rn] = {
          ...(ronds[rn] || {}),
          strokes:       rd.strokes || ronds[rn]?.strokes,
          numStrokes:    rd.numStrokes ?? ronds[rn]?.numStrokes,
          numHoles:      rd.numHoles ?? ronds[rn]?.numHoles,
          startHole:     rd.startHole,
          startTime:     rd.startTime,
          groupNumber:   rd.groupNumber,
          playerNumber:  rd.playerNumber,
          liveScoringId: rd.liveScoringId,
          flightRound:   rd.flightRound,
        };
      }
    }

    // ── Distâncias e par do tee jogado, por ronda ────────────────────────
    // Vêm de `meta.flight_courses` cruzado com `meta.flight_rounds` em
    // fetchTournamentRichData → guardamos em `coursesByRound`. Lengths são
    // em JARDAS (UI: ×0.9144 para metros). Em flights 9H, pars[18] tem
    // zeros nos buracos não jogados — alinhar pelo par>0.
    const coursesByRound = richFlight?.coursesByRound || {};
    for (const rn of Object.keys(ronds)) {
      const fc = coursesByRound[rn] || coursesByRound[parseInt(rn, 10)];
      if (fc) {
        ronds[rn].pars  = fc.pars;     // par[18]
        ronds[rn].yards = fc.lengths;  // yards[18]
      }
    }

    // Agregado por flight (par/yards mais detalhados do que t_pars/t_yards
    // do GetMemberTournamentResults, que descrevem o percurso "tipo" e não
    // o tee específico jogado).
    const flightCourses = {};
    for (const [rn, fc] of Object.entries(coursesByRound)) {
      flightCourses[rn] = { pars: fc.pars, lengths: fc.lengths };
    }

    out.torneios[tcodeStr] = {
      tcode:         tcodeStr,
      name:          t.t_name,
      type:          t.t_type,
      startDate:     t.t_start_date,
      endDate:       t.t_end_date,
      totalRounds:   t.t_rounds,
      holesPerRound: t.t_holes_per_round,
      par:           t.t_pars,            // par do percurso "tipo" (GetMemberTournamentResults)
      yards:         t.t_yards,           // yards do percurso "tipo"
      flightCourses,                       // ← NOVO: par+yards por ronda DO TEE JOGADO
      ageGroup:      ag,
      flightId:      richFlightId,
      pid,
      place:         t.p_place,
      totalStrokes:  t.p_strokes,
      points:        t.p_points,
      status:        richPlayer?.status ?? null,
      teeMarkerName: richPlayer?.teeMarkerName ?? null,
      teeMarkerColor: richPlayer?.teeMarkerColor ?? null,
      handicap:      richPlayer?.handicap ?? null,
      driverLength:  richPlayer?.driverLength ?? null,
      pointsAll:     richPlayer?.pointsAll ?? null,
      tiebreaker:    richPlayer?.tiebreaker ?? null,
      isCaptain:     richPlayer?.isCaptain ?? null,
      isNewPlayer:   richPlayer?.isNewPlayer ?? null,
      rounds:        ronds,
    };
  }

  out.ageGroup = ageGroupLatest;
  out.totalTorneios = Object.keys(out.torneios).length;
  return out;
}

// ── Args ─────────────────────────────────────
function parseArgs(argv) {
  const args = {
    players:       null,         // Set<string> | null (null = todos os mids do slim)
    sinceDays:     14,            // re-fetch flight data se torneio ≤ N dias
    forceRebuild:  false,         // ignora caches e re-fetch tudo
    skipExisting:  true,          // não sobrescreve {mid}.json se já existe (e player não tem novos torneios)
    concurrency:   4,             // workers paralelos em fetchMemberCareers
    limit:         null,          // máx N players (smoke test)
    discoveryOnly: false,         // só descobre novos mids, não escreve players
    forceFetchAll: false,         // re-fetch TODOS os mids do slim (ignora skip-existing)
    maxRuntimeMin: 0,             // prazo de execução em minutos (0 = sem limite)
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--players':      args.players = new Set(argv[++i].split(',').map(s => s.trim()).filter(Boolean)); break;
      case '--since-days':   args.sinceDays = parseInt(argv[++i], 10); break;
      case '--force-rebuild': args.forceRebuild = true; break;
      case '--no-skip-existing': args.skipExisting = false; break;
      case '--concurrency':  args.concurrency = parseInt(argv[++i], 10); break;
      case '--limit':        args.limit = parseInt(argv[++i], 10); break;
      case '--discovery-only': args.discoveryOnly = true; break;
      case '--force-fetch-all': args.forceFetchAll = true; break;
      case '--max-runtime-min': args.maxRuntimeMin = parseFloat(argv[++i]) || 0; break;
      case '--help': case '-h':
        console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 40).join('\n'));
        process.exit(0);
    }
  }
  return args;
}

// ── Output: comparar/escrever {memberID}.json apenas se mudou ────────────
function writePlayerIfChanged(mid, newData) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${mid}.json`);
  // Comparar conteúdo (ignorando lastUpdated) para evitar diffs no git apenas
  // por timestamp.
  let existing = null;
  if (fs.existsSync(outPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    } catch {}
  }

  const a = { ...newData, lastUpdated: 'X' };
  const b = existing ? { ...existing, lastUpdated: 'X' } : null;
  if (b && JSON.stringify(a) === JSON.stringify(b)) {
    return false; // sem mudanças
  }

  fs.writeFileSync(outPath, JSON.stringify(newData, null, 2), 'utf8');
  return true;
}

// ── Main ─────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.maxRuntimeMin > 0) DEADLINE = Date.now() + args.maxRuntimeMin * 60000;

  console.log('══════════════════════════════════════');
  console.log('📊  USKids Rich Players (Node-puro)');
  console.log(`    ${new Date().toLocaleString('pt-PT')}`);
  console.log(`    sinceDays=${args.sinceDays} | concurrency=${args.concurrency} | forceRebuild=${args.forceRebuild}`);
  if (args.players) console.log(`    players explícitos: ${args.players.size}`);
  if (args.limit)   console.log(`    limit: ${args.limit}`);
  if (args.maxRuntimeMin > 0) console.log(`    ⏱️ prazo: ${args.maxRuntimeMin} min`);
  console.log('══════════════════════════════════════');

  // 1. Determinar lista alvo de memberIDs
  let knownMids = loadSlimMids();
  console.log(`\n📂 Slim: ${knownMids.size} jogadores tracked`);

  // 2. Descobrir mids novos em torneios em curso (a não ser que --players explícito)
  if (!args.players && !args.discoveryOnly) {
    console.log(`\n🔍 Discovery em ${ALL_TCODES_DISCOVERY.length} torneios recentes...`);
    const novos = await discoverNewMids(ALL_TCODES_DISCOVERY, knownMids);
    if (novos.size) {
      console.log(`  ✨ +${novos.size} novos memberIDs descobertos`);
      for (const m of novos) knownMids.add(m);
    } else {
      console.log(`  📍 Nenhum novo memberID descoberto`);
    }
  } else if (args.discoveryOnly) {
    console.log(`\n🔍 Discovery only — só procuro novos mids e termino`);
    const novos = await discoverNewMids(ALL_TCODES_DISCOVERY, knownMids);
    console.log(`  ${novos.size} novos memberIDs`);
    if (novos.size) {
      const debugFile = path.join(ROOT, 'data-archive', 'uskids-rich-newmids.json');
      fs.writeFileSync(debugFile, JSON.stringify([...novos], null, 2));
      console.log(`  💾 ${debugFile}`);
    }
    process.exit(novos.size ? 0 : 2);
  }

  // 3. Aplicar --players e --limit
  let mids;
  if (args.players) {
    mids = args.players;
  } else {
    mids = knownMids;
  }
  if (args.limit) {
    mids = new Set([...mids].slice(0, args.limit));
  }

  // 4. Aplicar --skip-existing: remove da lista os que já têm ficheiro recente
  if (args.skipExisting && !args.forceFetchAll && !args.forceRebuild) {
    const cutoffIso = new Date(Date.now() - args.sinceDays * 86400000).toISOString();
    let skipped = 0;
    mids = new Set([...mids].filter(mid => {
      const f = path.join(OUT_DIR, `${mid}.json`);
      if (!fs.existsSync(f)) return true;
      try {
        const d = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (d.lastUpdated && d.lastUpdated > cutoffIso) {
          skipped++;
          return false;
        }
      } catch {}
      return true;
    }));
    console.log(`\n⏭️  Skip-existing: ${skipped} jogadores com ficheiro recente (<${args.sinceDays}d) → ignorados`);
  }

  console.log(`\n🎯 ${mids.size} jogadores a processar`);
  if (mids.size === 0) {
    console.log('  📍 Nada a fazer.');
    process.exit(2);
  }

  // 5. Phase 1: fetch carreira de cada player
  console.log('\n══════════════════════════════════════');
  console.log('PHASE 1 — GetMemberTournamentResults por player');
  console.log('══════════════════════════════════════');
  const careers = await fetchMemberCareers(mids, args.concurrency);
  console.log(`  ✅ ${careers.size} carreiras obtidas`);

  // 6. Cruzar para mapa tcode → Set(ageGroups)
  const tcodeAgeMap = new Map();
  for (const [mid, career] of careers) {
    for (const [tcode, t] of Object.entries(career)) {
      const ag = t.p_age_group || '';
      if (!tcodeAgeMap.has(String(tcode))) tcodeAgeMap.set(String(tcode), new Set());
      tcodeAgeMap.get(String(tcode)).add(ag);
    }
  }
  console.log(`  📊 ${tcodeAgeMap.size} torneios únicos na união das carreiras`);

  // 7. Phase 2: fetch GetMeta + GetPlayerTeeTimes por (tcode, flight) único
  console.log('\n══════════════════════════════════════');
  console.log('PHASE 2 — GetMeta + GetPlayerTeeTimes (cached)');
  console.log('══════════════════════════════════════');
  const flightCache = loadFlightCache();
  const tournRich = await fetchTournamentRichData(tcodeAgeMap, flightCache, {
    forceRebuild: args.forceRebuild,
  });
  console.log(`  ✅ ${tournRich.size} tcodes com dados ricos`);

  // 8. Phase 3: construir ficheiros por player
  console.log('\n══════════════════════════════════════');
  console.log('PHASE 3 — Escrever ficheiros por player');
  console.log('══════════════════════════════════════');
  const resultsFP = loadResultsFingerprints();
  console.log(`  📄 ${resultsFP.size} fingerprints do uskids-results.json`);

  let written = 0, unchanged = 0;
  for (const [mid, career] of careers) {
    const playerFile = buildPlayerFile(mid, career, tournRich, resultsFP);
    if (writePlayerIfChanged(mid, playerFile)) {
      written++;
    } else {
      unchanged++;
    }
  }

  // 9. Resumo + run summary
  const summary = {
    generatedAt: new Date().toISOString(),
    midsProcessed: mids.size,
    careersFetched: careers.size,
    tcodesEnriched: tournRich.size,
    filesWritten: written,
    filesUnchanged: unchanged,
    config: {
      sinceDays: args.sinceDays,
      concurrency: args.concurrency,
      forceRebuild: args.forceRebuild,
    },
  };
  fs.writeFileSync(RUN_SUMMARY, JSON.stringify(summary, null, 2));

  console.log('\n══════════════════════════════════════');
  console.log(`✅  ${written} ficheiros escritos (${unchanged} sem alterações)`);
  console.log(`    Output: data-archive/uskids-rich-players/`);
  console.log(`    Cache:  data-archive/uskids-rich-flight-cache.json.gz`);
  console.log('══════════════════════════════════════');

  process.exit(written === 0 ? 2 : 0);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
