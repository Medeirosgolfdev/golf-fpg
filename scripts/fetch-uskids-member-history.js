'use strict';

/**
 * fetch-uskids-member-history.js
 * 
 * Busca o histórico completo de torneios USKids para rapazes Boys 9-12
 * inscritos nos torneios/flights especificados.
 *
 * Mapeamento memberID → nome por fingerprint de strokes:
 *   1. GetPlayerTeeTimes (strokes do torneio fonte)
 *   2. uskids-results.json (fallback para torneios anteriores)
 *
 * Output: public/data/uskids-member-history.json
 *
 * Uso:
 *   node fetch-uskids-member-history.js           # todos os torneios/flights definidos
 *   node fetch-uskids-member-history.js --clean    # re-match nomes offline
 */

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ── Config ───────────────────────────────────
const DIR    = path.join(__dirname, '..', 'public', 'data');
const OUTPUT = path.join(DIR, 'uskids-member-history.json');
const RESULTS_PATH = path.join(DIR, 'uskids-results.json');

// Flights específicos por torneio (Boys 9, 10, 11, 12)
const FLIGHTS = {
  21080: [
    { fid: 272798, ag: 'Boys 9' },
    { fid: 272799, ag: 'Boys 10' },
    { fid: 272800, ag: 'Boys 11' },
    { fid: 272801, ag: 'Boys 12' },
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
  18242: [
    { fid: 234338, ag: 'Boys 9' },
    { fid: 234339, ag: 'Boys 10' },
    { fid: 234340, ag: 'Boys 11' },
    { fid: 234341, ag: 'Boys 12' },
  ],
  21131: [
    { fid: 273490, ag: 'Boys 9' },
    { fid: 273491, ag: 'Boys 10' },
    { fid: 273492, ag: 'Boys 11' },
    { fid: 273493, ag: 'Boys 12' },
  ],
};

// Nomes dos torneios (para logs e metadata)
const TOURN_NAMES = {
  21080: 'Marco Simone Invitational 2026',
  19418: 'Venice Open 2025',
  20175: 'Rome Classic 2025',
  18242: 'European Championship 2025',
  21131: 'European Championship 2026',
};

const DELAY_MS   = 200;
const DELAY_HIST = 150;

const IFRAME_URL = (t) =>
  `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t}`;
const API = 'https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Helpers ──────────────────────────────────

async function initPage(page, tcode) {
  // Navegar para o iframe do torneio para inicializar cookies/sessão
  await page.goto(IFRAME_URL(tcode), { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(500);
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
          for (const jog of ronda.leaderboard || []) {
            const strokes = jog.strokes;
            if (strokes && strokes.length >= 9) {
              fp.set(`${tcode}:R${rn}:${strokesKey(strokes)}`, {
                name: jog.nome,
                country: (jog.pais || '').toUpperCase(),
                place: jog.cidade || '',
              });
            }
          }
        }
      }
    }
    console.log(`  📄 ${fp.size} fingerprints do uskids-results.json`);
  } catch (e) {
    console.warn(`  ⚠️ Erro a ler uskids-results.json: ${e.message}`);
  }
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
    // Re-match unnamed
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
  if (process.argv.includes('--clean')) { cleanAndRematch(); return; }

  const tcodes = Object.keys(FLIGHTS).map(Number);

  console.log('══════════════════════════════════════');
  console.log('📊  USKids Member History');
  console.log(`    ${new Date().toLocaleString('pt-PT')}`);
  console.log(`    Torneios: ${tcodes.map(t => TOURN_NAMES[t] || t).join(', ')}`);
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

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const apiFingerprints = new Map(); // "tcode:fid" → Map(strokesKey → info)
  const memberFlights = new Map();   // memberID → [{ tcode, fid, ageGroup }]
  const allMemberIds = new Set();

  try {
    // ══════════════════════════════════════════════
    // FASE 1: Fingerprints + member IDs por flight
    // ══════════════════════════════════════════════

    for (const tcode of tcodes) {
      const flights = FLIGHTS[tcode];
      console.log(`\n▶ ${TOURN_NAMES[tcode] || 't=' + tcode}`);

      // Inicializar sessão
      await initPage(page, tcode);

      for (const { fid, ag } of flights) {
        console.log(`  ⛳ ${ag} (flight ${fid})`);

        // Member IDs
        let memberIds = [];
        try {
          const tp = await pageJSON(page, `${API}?op=GetTournamentPlayers&t=${tcode}&f=${fid}`);
          memberIds = tp.PlayerNodeId || [];
        } catch (err) {
          console.warn(`    ⚠️ GetTournamentPlayers falhou: ${err.message}`);
          continue;
        }
        await sleep(DELAY_MS);

        // Fingerprints via GetPlayerTeeTimes
        const fpKey = `${tcode}:${fid}`;
        const fpMap = new Map();

        try {
          const totalPages = Math.ceil((memberIds.length || 20) / 20);
          for (let p = 1; p <= totalPages; p++) {
            const d = await pageJSON(page, `${API}?op=GetPlayerTeeTimes&f=${fid}&r=1&p=${p}&t=0`);
            for (const [pid, pl] of Object.entries(d.flight_players || {})) {
              const name = `${(pl.first || '').trim()} ${(pl.last || '').trim()}`.trim();
              const country = (pl.country || '').toUpperCase();
              const place = pl.place || '';
              const info = { name, country, place };
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

        console.log(`    → ${memberIds.length} membros | ${fpMap.size} fingerprints`);
      }

      // Guardar metadata do torneio
      cache.torneios[tcode] = { name: TOURN_NAMES[tcode] || '' };
    }

    // ══════════════════════════════════════════════
    // FASE 2: Histórico + matching
    // ══════════════════════════════════════════════

    const newIds = [...allMemberIds].filter(id => !existingMembers.has(String(id)));

    console.log(`\n══════════════════════════════════════`);
    console.log(`📊 FASE 2 — Histórico de jogadores`);
    console.log(`   Total: ${allMemberIds.size} | Novos: ${newIds.length} | Cache: ${allMemberIds.size - newIds.length}`);
    console.log(`══════════════════════════════════════\n`);

    let processed = 0, matched = 0, unmatched = 0, skipped = 0;

    for (const mid of newIds) {
      processed++;
      try {
        const data = await pageJSON(page, `${API}?op=GetMemberTournamentResults&m=${mid}`);
        const tids = Object.keys(data);

        if (tids.length === 0) { continue; }

        // Verificar ageGroup — saltar Girls e escalões fora de Boys 9-12
        const latestT = Object.values(data).sort((a, b) => parseDate(b.t_start_date).localeCompare(parseDate(a.t_start_date)))[0];
        const ag = latestT?.p_age_group || '';
        if (ag.startsWith('Girls') || ag.includes('Girl')) { skipped++; continue; }

        // Match nome
        const mFlights = memberFlights.get(mid) || [];
        const playerMatch = matchPlayer(data, apiFingerprints, resultsFP, mFlights);

        const playerName = playerMatch ? playerMatch.name : '?';
        const playerCountry = playerMatch ? playerMatch.country : '';
        const playerPlace = playerMatch ? playerMatch.place : '';
        if (playerMatch) matched++; else unmatched++;

        // Guardar
        cache.jogadores[String(mid)] = {
          memberId: mid,
          name: playerName,
          country: playerCountry,
          place: playerPlace,
          ageGroup: ag,
          totalTorneios: tids.length,
          torneios: {},
        };

        for (const tid of tids) {
          const t = data[tid];
          const rounds = {};
          for (const [rn, rd] of Object.entries(t.p_rounds || {})) {
            rounds[rn] = {
              strokes: rd.strokes,
              course: rd.course_name,
              startHole: rd.start_hole,
              startTime: rd.start_time,
              group: rd.group_number,
              gross: rd.num_strokes,
              holes: rd.num_holes,
            };
          }
          cache.jogadores[String(mid)].torneios[tid] = {
            name: t.t_name, type: t.t_type,
            startDate: t.t_start_date, endDate: t.t_end_date,
            totalRounds: t.t_rounds, holesPerRound: t.t_holes_per_round,
            par: t.t_pars, yards: t.t_yards,
            ageGroup: t.p_age_group, status: t.p_status,
            place: t.p_place, totalStrokes: t.p_strokes,
            points: t.p_points, rounds,
          };
        }

        const label = playerName === '?' ? '❓' : '✅';
        console.log(`  ${label} [${processed}/${newIds.length}] ${playerName} | ${ag} | ${tids.length} torneios`);

      } catch (err) {
        console.warn(`  ❌ [${processed}/${newIds.length}] m=${mid}: ${err.message}`);
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
    const ts = Object.values(j.torneios || {}).sort((a, b) => parseDate(b.startDate).localeCompare(parseDate(a.startDate)));
    if (ts.length && ts[0].ageGroup && ts[0].ageGroup !== j.ageGroup) { j.ageGroup = ts[0].ageGroup; agFixed++; }
  }

  // ── Salvar ──
  cache.gerado_em = new Date().toISOString();
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(cache, null, 2), 'utf8');

  const total = Object.keys(cache.jogadores).length;
  const named = Object.values(cache.jogadores).filter(j => j.name && j.name !== '?' && j.name !== null).length;
  const totalEntries = Object.values(cache.jogadores).reduce((s, j) => s + Object.keys(j.torneios).length, 0);

  console.log('\n══════════════════════════════════════');
  console.log('✅  uskids-member-history.json');
  console.log(`    ${total} jogadores (${named} com nome, ${total - named} sem nome)`);
  console.log(`    ${totalEntries} entradas de torneio`);
  console.log(`    Matched: ${matched} | Unmatched: ${unmatched} | AgeGroups fixed: ${agFixed}`);
  console.log('══════════════════════════════════════');
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
