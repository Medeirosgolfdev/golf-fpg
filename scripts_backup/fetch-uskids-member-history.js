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
 * Output: public/data-archive/uskids-member-history.json
 *
 * Uso:
 *   node fetch-uskids-member-history.js            # processa novos + actualiza histórico
 *   node fetch-uskids-member-history.js --clean    # re-match nomes offline
 *   node fetch-uskids-member-history.js --force    # re-fetch todos (ignora cache)
 */

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ── Config ───────────────────────────────────
const DIR    = path.join(__dirname, '..', 'public', 'data-archive');
const OUTPUT = path.join(DIR, 'uskids-member-history.json');
const RESULTS_PATH = path.join(__dirname, '..', 'public', 'data', 'uskids-results.json');

// Torneios a rastrear.
// Para torneios com flights conhecidos, especifica-os manualmente.
// Para os restantes (sem entrada aqui), os flights são auto-descobertos
// via GetMeta filtrando escalões Boys 9-13.
const FLIGHTS_MANUAL = {
  18242: [
    { fid: 234338, ag: 'Boys 9' },
    { fid: 234339, ag: 'Boys 10' },
    { fid: 234340, ag: 'Boys 11' },
    { fid: 234341, ag: 'Boys 12' },
  ],
  19418: [
    { fid: 250227, ag: 'Boys 9' },
    { fid: 250228, ag: 'Boys 10' },
    { fid: 250229, ag: 'Boys 11' },
    { fid: 250230, ag: 'Boys 12' },
  ],
  20175: [
    { fid: 260328, ag: 'Boys 9' },
    { fid: 260329, ag: 'Boys 10' },
    { fid: 260330, ag: 'Boys 11' },
    { fid: 260331, ag: 'Boys 12' },
  ],
  21080: [
    { fid: 272798, ag: 'Boys 9' },
    { fid: 272799, ag: 'Boys 10' },
    { fid: 272800, ag: 'Boys 11' },
    { fid: 272801, ag: 'Boys 12' },
  ],
  21131: [
    { fid: 273490, ag: 'Boys 9' },
    { fid: 273491, ag: 'Boys 10' },
    { fid: 273492, ag: 'Boys 11' },
    { fid: 273493, ag: 'Boys 12' },
  ],
};

// Todos os torneios a processar (os manuais + os novos para auto-descoberta)
const ALL_TCODES = [
  // já configurados manualmente acima
  18242, 19418, 20175, 21080, 21131,
  // novos — flights serão auto-descobertos via GetMeta
  8300, 11604, 12229, 13568, 14029, 14218,
  15573, 15704, 16705, 16428, 18438, 18124,
  21004,
];

// Prefixos de escalão a incluir na auto-descoberta
const ESCALOES_BOYS = ['boys 9', 'boys 10', 'boys 11', 'boys 12', 'boys 13'];
const escalaoValido = (nome) =>
  ESCALOES_BOYS.some(p => (nome || '').toLowerCase().startsWith(p));

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

// Auto-descobre os flights Boys 9-13 de um torneio via GetMeta
async function descobrirFlights(page, tcode) {
  try {
    const meta = await pageJSON(page, `${API}?op=GetMeta&t=${tcode}`);
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
  } catch (err) {
    console.warn(`    ⚠️ GetMeta falhou para t=${tcode}: ${err.message}`);
    return [];
  }
}

async function pageJSON(page, url) {
  return page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }, url);
}

function strokesKey(arr) {
  if (!arr || !arr.length) return '';
  return arr.join(',');
}

function parseDate(s) {
  if (!s) return '';
  if (s.includes('-')) return s;
  const p = s.split('/');
  return p.length === 3 ? `${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}` : '';
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
            if (sk) fp.set(`${tcode}:R${rn}:${sk}`, {
              name: j.nome, country: j.pais, place: j.cidade || '',
            });
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

// ── Re-match offline (--clean) ───────────────

function cleanAndRematch() {
  console.log('\n🧹  Modo --clean: re-match nomes\n');
  if (!fs.existsSync(OUTPUT)) { console.log('Ficheiro não encontrado:', OUTPUT); return; }

  const cache = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
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
  fs.writeFileSync(OUTPUT, JSON.stringify(cache, null, 2), 'utf8');

  const total = Object.keys(cache.jogadores).length;
  const named = Object.values(cache.jogadores).filter(j => j.name && j.name !== '?' && j.name !== null).length;
  console.log(`  Já tinham nome: ${already} | Novos matches: ${matched} | AgeGroups fixed: ${agFixed}`);
  console.log(`  Total: ${total} jogadores (${named} com nome)\n`);
}

// ── Main ─────────────────────────────────────

async function main() {
  const forceAll = process.argv.includes('--force');

  if (process.argv.includes('--clean')) { cleanAndRematch(); return; }

  const tcodes = [...ALL_TCODES];

  console.log('══════════════════════════════════════');
  console.log('📊  USKids Member History');
  console.log(`    ${new Date().toLocaleString('pt-PT')}`);
  console.log(`    ${tcodes.length} torneios a processar`);
  if (forceAll) console.log('    ⚠️  Modo --force: re-fetch de todos os membros');
  console.log('══════════════════════════════════════');

  // Carregar cache existente
  let cache = { gerado_em: null, torneios: {}, jogadores: {} };
  if (fs.existsSync(OUTPUT)) {
    try { cache = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch {}
  }
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

  let matched = 0, unmatched = 0, skipped = 0;

  try {
    // ══════════════════════════════════════════════
    // FASE 1: Nomes directos + Fingerprints + member IDs
    // ══════════════════════════════════════════════

    for (const tcode of tcodes) {
      await initPage(page, tcode);

      // Usar flights manuais se existirem, senão auto-descobrir via GetMeta
      let flights = FLIGHTS_MANUAL[tcode];
      if (!flights || flights.length === 0) {
        flights = await descobrirFlights(page, tcode);
        await sleep(DELAY_MS);
      }

      const tournLabel = cache.torneios[tcode]?.name || `t=${tcode}`;
      console.log(`\n▶ ${tournLabel} (${flights.length} flights)`);

      for (const { fid, ag } of flights) {
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
        let directNames = 0;

        try {
          const totalPages = Math.ceil((memberIds.length || 20) / 20);
          for (let p = 1; p <= totalPages; p++) {
            const d = await pageJSON(page, `${API}?op=GetPlayerTeeTimes&f=${fid}&r=1&p=${p}&t=0`);

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
                  break;
                }
              }

              // ── Estratégia 2: fingerprint de strokes (fallback) ──
              for (const [rn, rd] of Object.entries(pl.rounds || {})) {
                const sk = strokesKey(rd.strokes);
                if (sk) fpMap.set(`R${rn}:${sk}`, info);
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

        console.log(`    → ${memberIds.length} membros | ${fpMap.size} fingerprints | ${directNames} nomes directos`);
      }

      if (!cache.torneios[tcode] || !cache.torneios[tcode].name) {
        // Tentar obter nome do torneio do GetMeta
        try {
          const meta = await pageJSON(page, `${API}?op=GetMeta&t=${tcode}`);
          cache.torneios[tcode] = { name: meta?.tournament?.name || `t=${tcode}` };
        } catch {
          cache.torneios[tcode] = { name: `t=${tcode}` };
        }
        await sleep(DELAY_MS);
      }
    }

    console.log(`\n  🗺️  Nomes directos por node_id: ${memberNameMap.size}/${allMemberIds.size}`);

    // ══════════════════════════════════════════════
    // FASE 2: Histórico + matching
    // Processa:
    //   A) Membros completamente novos
    //   B) Membros em cache mas que aparecem num torneio novo para eles
    // ══════════════════════════════════════════════

    // Determinar quais membros precisam de re-fetch
    const toProcess = [];
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

    const nNovos      = toProcess.filter(x => x.isNew).length;
    const nActualizar = toProcess.filter(x => !x.isNew).length;

    console.log(`\n══════════════════════════════════════`);
    console.log(`📊 FASE 2 — Histórico de jogadores`);
    console.log(`   Total inscritos: ${allMemberIds.size}`);
    console.log(`   Novos:           ${nNovos}`);
    console.log(`   A actualizar:    ${nActualizar} (já em cache mas torneio novo)`);
    console.log(`   Em cache OK:     ${allMemberIds.size - toProcess.length}`);
    console.log(`══════════════════════════════════════\n`);

    let processed = 0;

    for (const { mid, isNew } of toProcess) {
      processed++;
      const midStr = String(mid);

      try {
        const data = await pageJSON(page, `${API}?op=GetMemberTournamentResults&m=${mid}`);
        const tids = Object.keys(data);

        if (tids.length === 0) { continue; }

        // Verificar ageGroup — saltar Girls
        const latestT = Object.values(data).sort((a, b) =>
          parseDate(b.t_start_date).localeCompare(parseDate(a.t_start_date)))[0];
        const ag = latestT?.p_age_group || '';
        if (ag.startsWith('Girls') || ag.includes('Girl')) { skipped++; continue; }

        // ── Matching de nome (3 estratégias) ──────────────────────

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
        if (playerMatch && playerName !== '?') matched++; else unmatched++;

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

      if (processed % 50 === 0) {
        cache.gerado_em = new Date().toISOString();
        fs.mkdirSync(DIR, { recursive: true });
        fs.writeFileSync(OUTPUT, JSON.stringify(cache, null, 2), 'utf8');
        console.log(`  💾 Checkpoint: ${Object.keys(cache.jogadores).length} jogadores`);
      }
    }

    if (skipped) console.log(`\n  🚫 ${skipped} Girls/outros ignorados`);

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
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(cache, null, 2), 'utf8');

  const total      = Object.keys(cache.jogadores).length;
  const named      = Object.values(cache.jogadores).filter(j => j.name && j.name !== '?').length;
  const totalEntries = Object.values(cache.jogadores)
    .reduce((s, j) => s + Object.keys(j.torneios).length, 0);

  console.log('\n══════════════════════════════════════');
  console.log('✅  uskids-member-history.json');
  console.log(`    ${total} jogadores (${named} com nome, ${total - named} sem nome)`);
  console.log(`    ${totalEntries} entradas de torneio`);
  console.log(`    Matched: ${matched} | Unmatched: ${unmatched} | AgeGroups fixed: ${agFixed}`);
  console.log('══════════════════════════════════════');
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
