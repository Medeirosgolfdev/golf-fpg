'use strict';

/**
 * fetch-uskids-pt-local-tour.js  (v2 — 2026-05-12)
 *
 * Enumera TODOS os participantes (todos os escalões, Boys + Girls) dos
 * torneios USKids Local Tour Portugal Jan-Abril 2023:
 *   13702  Dolce Campo Real             1/22/2023
 *   13703  Ribagolfe Oaks                1/28/2023
 *   13704  Ribagolfe Lakes               1/29/2023
 *   13705  Ribagolfe Oaks                2/25/2023
 *   13706  Ribagolfe Lakes               2/26/2023
 *   13707  Dolce Campo Real (Tour Ch.)   4/16/2023
 *
 * v2 fixes:
 *   - Phase 1: fallback via GetPlayerTeeTimes quando GetTournamentPlayers
 *     vem vazio. Retries com backoff. Log detalhado por flight.
 *   - Phase 2: parsing correcto do GetMemberTournamentResults (formato real:
 *     { [tcode]: { t_name, t_start_date, p_age_group, p_rounds:{...}, ... } })
 *
 * Outputs:
 *   data-archive/uskids-pt-local-tour-participants.json
 *   data-archive/uskids-pt-local-tour-history.json   (com --with-history)
 *
 * Uso:
 *   node scripts/fetch-uskids-pt-local-tour.js
 *   node scripts/fetch-uskids-pt-local-tour.js --with-history
 *   node scripts/fetch-uskids-pt-local-tour.js --headless
 */

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ── Config ───────────────────────────────────
const TARGET_TCODES = [13702, 13703, 13704, 13705, 13706, 13707];

const DIR = path.join(__dirname, '..', 'data-archive');
const OUT_PARTICIPANTS = path.join(DIR, 'uskids-pt-local-tour-participants.json');
const OUT_HISTORY      = path.join(DIR, 'uskids-pt-local-tour-history.json');

const API = 'https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx';
const IFRAME_URL = (t) =>
  `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t}`;

const DELAY_MS   = 250;
const DELAY_HIST = 150;

const WITH_HISTORY = process.argv.includes('--with-history');
const HEADLESS     = process.argv.includes('--headless') || process.env.HEADLESS === 'true';

// ── Helpers ──────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function pageJSON(page, url, method = 'GET') {
  return page.evaluate(async ({ u, m }) => {
    const r = await fetch(u, { method: m, credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }, { u: url, m: method });
}

async function pageJSONRetry(page, url, label = '', maxRetries = 2, method = 'GET') {
  let lastErr;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await pageJSON(page, url, method);
    } catch (err) {
      lastErr = err;
      if (i < maxRetries) await sleep(800 * (i + 1));
    }
  }
  throw lastErr;
}

async function initPage(page, tcode) {
  await page.goto(IFRAME_URL(tcode), { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(500);
}

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

function parseDateUS(s) {
  if (!s) return '';
  if (s.includes('-')) return s;
  const p = s.split('/');
  return p.length === 3 ? `${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}` : '';
}

// ── Fase 1: enumerar participantes ───────────
async function enumeratePT(page) {
  const tournInfo = {};
  const jogadores = {};
  // Nomes capturados por (tcode, fid, strokesKey) — para matching posterior por strokes
  const nameByStrokes = {}; // tcode:ageGroup:strokesKey → {name, country, place_text}

  for (const tcode of TARGET_TCODES) {
    console.log(`\n▶ tcode ${tcode}`);
    await initPage(page, tcode);

    let meta;
    try {
      meta = await pageJSONRetry(page, `${API}?op=GetMeta&t=${tcode}`, 'GetMeta');
    } catch (err) {
      console.warn(`  ⚠️ GetMeta falhou: ${err.message}`);
      continue;
    }
    await sleep(DELAY_MS);

    const tournName = meta?.tournament?.name || meta?.tournament_name || `t=${tcode}`;
    const startDate = meta?.tournament?.start_date || meta?.start_date || '';
    tournInfo[tcode] = { name: tournName, startDate, flights: [] };
    console.log(`  📅 ${tournName} (${startDate})`);

    const flightsObj = meta?.flights || {};
    const ageGroups  = meta?.age_groups || {};
    const flightList = [];
    for (const [fid, fl] of Object.entries(flightsObj)) {
      const agId   = fl.age_group;
      const agName = ageGroups[agId]?.name || fl.name || '?';
      flightList.push({ fid: parseInt(fid, 10), ageGroupName: agName, ageGroupId: agId });
    }
    flightList.sort((a, b) => a.ageGroupName.localeCompare(b.ageGroupName));

    for (const fl of flightList) {
      const { fid, ageGroupName } = fl;
      tournInfo[tcode].flights.push(fl);

      // 1) GetTournamentPlayers — pode vir vazio para tcodes antigos
      let memberIds = [];
      try {
        const tp = await pageJSONRetry(page, `${API}?op=GetTournamentPlayers&t=${tcode}&f=${fid}`, 'GetTournamentPlayers');
        memberIds = (tp.PlayerNodeId || []).map(String);
      } catch (err) {}
      await sleep(DELAY_MS);

      // 2) GetPlayerTeeTimes — sempre tentar, é a fonte de nomes E mids alternativos
      const totalPages = Math.max(1, Math.ceil((memberIds.length || 40) / 20));
      let collectedFromTeeTimes = 0;
      let pageEmptyStreak = 0;

      for (let p = 1; p <= totalPages + 2; p++) {
        let d;
        // Endpoint correcto (descoberto via Chrome DevTools 2026-05-12):
        // POST com t=1 (final results) + pt=undefined&jbgr={timestamp}&c=1
        const jbgr = Date.now();
        try {
          d = await pageJSONRetry(
            page,
            `${API}?op=GetPlayerTeeTimes&f=${fid}&r=1&p=${p}&t=1&pt=undefined&jbgr=${jbgr}&c=1`,
            `GetPlayerTeeTimes p${p}`,
            2,
            'POST'
          );
        } catch (err) {
          break;
        }
        await sleep(DELAY_MS);

        const flightPlayers = d?.flight_players || {};
        const keys = Object.keys(flightPlayers);
        if (keys.length === 0) {
          pageEmptyStreak++;
          if (pageEmptyStreak >= 2) break;
          continue;
        }
        pageEmptyStreak = 0;

        for (const [pid, pl] of Object.entries(flightPlayers)) {
          const name    = `${(pl.first || '').trim()} ${(pl.last || '').trim()}`.trim();
          const country = (pl.country || '').toUpperCase();
          const cityText = pl.place || '';  // este "place" é cidade, NÃO posição
          // strokes da R1
          const r1 = pl.rounds?.[1] || pl.rounds?.['1'];
          const strokes = r1?.strokes || pl.strokes || pl.scores || null;

          // Guardar nome por strokes para matching posterior.
          // IMPORTANTE: ignorar strokes inválidos (todos zero = WD) — colidem todos.
          if (name && strokes && Array.isArray(strokes) && strokes.length) {
            const nonZero = strokes.filter(s => Number(s) > 0).length;
            const sumStrokes = strokes.reduce((a, b) => a + (Number(b) || 0), 0);
            if (nonZero >= 5 && sumStrokes >= 20) {
              const sk = strokes.join(',');
              const key = `${tcode}:${ageGroupName}:${sk}`;
              // Se já existir uma entrada com o mesmo key (estranho), só sobrescrever se for primeira vez
              if (!nameByStrokes[key]) {
                nameByStrokes[key] = { name, country, cityText };
              }
            }
          }

          // O pid do flight_players NÃO é o memberID global.
          // memberIDs vem do GetTournamentPlayers e é a fonte canónica.
          const candidateIds = [
            pl.node_id, pl.member_id, pl.member_node_id,
            pl.memberId, pl.nodeId, pl.mid, pid
          ].filter(Boolean).map(String);

          let mid = null;
          for (const cid of candidateIds) {
            if (memberIds.includes(cid)) { mid = cid; break; }
          }
          // Se não der match directo, guardar o pid + strokes para mapeamento via Phase 2
          if (!mid) {
            if (memberIds.length === 0) mid = pid; // sem lista canónica → usar pid
            else continue;
          }

          if (!jogadores[mid]) {
            jogadores[mid] = {
              memberID: mid,
              name: name || null,
              country: country || null,
              ageGroups: new Set(),
              torneios: {},
              fingerprints: {}
            };
            collectedFromTeeTimes++;
          }
          if (!jogadores[mid].name && name) jogadores[mid].name = name;
          if (!jogadores[mid].country && country) jogadores[mid].country = country;
          jogadores[mid].ageGroups.add(ageGroupName);
          jogadores[mid].torneios[tcode] = { ag: ageGroupName, place };
          if (strokes && Array.isArray(strokes) && strokes.length) {
            jogadores[mid].fingerprints[`${tcode}:R1`] = strokes;
          }
        }
      }

      // 3) Registar memberIDs do PlayerNodeId que não apareceram no flight_players
      let added_unresolved = 0;
      for (const mid of memberIds) {
        if (jogadores[mid]) {
          jogadores[mid].ageGroups.add(ageGroupName);
          if (!jogadores[mid].torneios[tcode]) {
            jogadores[mid].torneios[tcode] = { ag: ageGroupName, place: null };
          }
          continue;
        }
        jogadores[mid] = {
          memberID: mid,
          name: null,
          country: null,
          ageGroups: new Set([ageGroupName]),
          torneios: { [tcode]: { ag: ageGroupName, place: null } },
          fingerprints: {},
          _unresolved: true
        };
        added_unresolved++;
      }
      console.log(`  ⛳ ${ageGroupName.padEnd(18)} f=${fid} | nodeIDs=${memberIds.length} teeTimes=${collectedFromTeeTimes} unresolved=${added_unresolved}`);
    }
  }

  return { tournInfo, jogadores, nameByStrokes };
}

// ── Fase 2 (opcional): histórico completo de cada memberID ──
async function fetchHistory(page, jogadores) {
  const result = { gerado_em: new Date().toISOString(), torneios: {}, jogadores: {} };
  const mids = Object.keys(jogadores);
  let i = 0, ok = 0, errs = 0;

  for (const mid of mids) {
    i++;
    process.stdout.write(`\r  [${i}/${mids.length}] mid ${mid} (ok=${ok} err=${errs})`.padEnd(70));
    try {
      const data = await pageJSONRetry(page, `${API}?op=GetMemberTournamentResults&m=${mid}`, 'GetMemberTournamentResults');
      const tids = Object.keys(data || {});
      const playerRow = jogadores[mid];

      let inferredName = playerRow.name;
      let inferredCountry = playerRow.country;
      if (!inferredCountry) {
        for (const tid of tids) {
          const t = data[tid];
          if (t.p_country) { inferredCountry = String(t.p_country).toUpperCase(); break; }
        }
      }

      const sortedT = tids
        .map(tid => ({ tid, t: data[tid] }))
        .sort((a, b) => parseDateUS(b.t.t_start_date).localeCompare(parseDateUS(a.t.t_start_date)));
      const latestAgeGroup = sortedT[0]?.t?.p_age_group || [...playerRow.ageGroups][0] || null;

      result.jogadores[mid] = {
        memberID: mid,
        name: inferredName,
        country: inferredCountry,
        ageGroup: latestAgeGroup,
        totalTorneios: tids.length,
        torneios: {}
      };

      for (const tid of tids) {
        const t = data[tid];
        if (!result.torneios[tid]) {
          result.torneios[tid] = {
            name: t.t_name || '?',
            startDate: t.t_start_date || '',
            endDate: t.t_end_date || '',
            holesPerRound: t.t_holes_per_round || null,
            par: t.t_pars || null,
            yards: t.t_yards || null
          };
        }
        const rounds = {};
        for (const [rn, rd] of Object.entries(t.p_rounds || {})) {
          rounds[rn] = {
            gross: rd.num_strokes ?? null,
            strokes: rd.strokes || [],
            course: rd.course_name || '',
            startHole: rd.start_hole ?? null,
            startTime: rd.start_time || '',
            holes: rd.num_holes ?? (rd.strokes ? rd.strokes.length : 0)
          };
        }
        result.jogadores[mid].torneios[tid] = {
          ageGroup: t.p_age_group || '',
          status:   t.p_status ?? null,
          place:    t.p_place ?? null,
          totalStrokes: t.p_strokes ?? null,
          points:   t.p_points ?? null,
          rounds
        };
      }
      ok++;
    } catch (err) {
      errs++;
      console.warn(`\n  ⚠️ mid=${mid}: ${err.message}`);
    }
    await sleep(DELAY_HIST);
  }
  console.log(`\n  ✓ Histórico: ${ok} OK, ${errs} erros`);
  return result;
}

// ── Main ─────────────────────────────────────
(async () => {
  ensureDir();
  const browser = await chromium.launch({ headless: HEADLESS });
  const page    = await browser.newPage();

  console.log(`Local Tour PT — tcodes ${TARGET_TCODES.join(', ')}`);
  console.log(`Headless: ${HEADLESS}, with history: ${WITH_HISTORY}`);

  const { tournInfo, jogadores, nameByStrokes } = await enumeratePT(page);

  // Tentar resolver nomes via strokes (pid não bate com memberID global)
  let resolvedCount = 0;
  for (const [mid, p] of Object.entries(jogadores)) {
    if (p.name) continue;
    for (const [tcode, t] of Object.entries(p.torneios || {})) {
      const ag = t.ag;
      const sk = (p.fingerprints?.[`${tcode}:R1`] || []).join(',');
      if (!sk) continue;
      const hit = nameByStrokes[`${tcode}:${ag}:${sk}`];
      if (hit) {
        p.name = hit.name;
        p.country = hit.country;
        p._resolvedVia = `strokes match ${tcode}:${ag}`;
        delete p._unresolved;
        resolvedCount++;
        break;
      }
    }
  }
  console.log(`\n  Resolvidos por matching de strokes: ${resolvedCount}`);

  const out = {
    gerado_em: new Date().toISOString(),
    target_tcodes: TARGET_TCODES,
    torneios: tournInfo,
    jogadores: Object.fromEntries(
      Object.entries(jogadores).map(([mid, p]) => [mid, {
        ...p,
        ageGroups: [...p.ageGroups].sort(),
        fingerprints: Object.keys(p.fingerprints || {}).length ? p.fingerprints : undefined
      }])
    ),
    nameByStrokes
  };

  fs.writeFileSync(OUT_PARTICIPANTS, JSON.stringify(out, null, 2));
  console.log(`\n✓ ${Object.keys(jogadores).length} participantes únicos`);
  console.log(`  → ${OUT_PARTICIPANTS}`);

  if (WITH_HISTORY) {
    console.log(`\n▶ A descarregar histórico completo de ${Object.keys(jogadores).length} jogadores...`);
    const hist = await fetchHistory(page, jogadores);

    // Pós-processamento PRIORIDADE 1: lookup directo nos 46 ficheiros member-history
    // (mais fiável que strokes match — usa o memberID canónico do USKids)
    let resolvedFromCache = 0;
    try {
      const glob = require('glob');
      const memberFiles = glob.sync(path.join(DIR, 'uskids-member-history-*.json'));
      for (const fn of memberFiles) {
        let d;
        try { d = JSON.parse(fs.readFileSync(fn, 'utf8')); } catch { continue; }
        for (const mid of Object.keys(hist.jogadores)) {
          if (hist.jogadores[mid].name) continue;
          const cached = d.jogadores?.[mid];
          if (cached && cached.name && cached.name !== '?') {
            hist.jogadores[mid].name = cached.name;
            hist.jogadores[mid].country = cached.country || hist.jogadores[mid].country;
            hist.jogadores[mid]._resolvedVia = `cache:${path.basename(fn)}`;
            if (jogadores[mid]) {
              jogadores[mid].name = cached.name;
              jogadores[mid].country = cached.country || jogadores[mid].country;
              delete jogadores[mid]._unresolved;
            }
            resolvedFromCache++;
          }
        }
      }
    } catch (err) {
      console.warn(`  ⚠️ Lookup nos 46 ficheiros falhou: ${err.message}`);
    }
    console.log(`  Resolvidos via cache (46 ficheiros): ${resolvedFromCache}`);

    // Pós-processamento PRIORIDADE 2: strokes match (só strokes VÁLIDOS — não WD)
    let postResolved = 0;
    for (const [mid, hp] of Object.entries(hist.jogadores || {})) {
      if (hp.name) continue;
      for (const tcode of TARGET_TCODES.map(String)) {
        const t = hp.torneios?.[tcode];
        if (!t) continue;
        const ag = t.ageGroup;
        const rounds = t.rounds || {};
        for (const rn of Object.keys(rounds)) {
          const strokes = rounds[rn]?.strokes;
          if (!strokes || !strokes.length) continue;
          // FILTRO: strokes têm de ter ≥5 não-zero e soma ≥20 (evita WD/DNS colisions)
          const nonZero = strokes.filter(s => Number(s) > 0).length;
          const sumStrokes = strokes.reduce((a, b) => a + (Number(b) || 0), 0);
          if (nonZero < 5 || sumStrokes < 20) continue;
          const sk = strokes.join(',');
          const hit = nameByStrokes[`${tcode}:${ag}:${sk}`];
          if (hit) {
            hp.name = hit.name;
            hp.country = hit.country || hp.country;
            hp._resolvedVia = `strokes match ${tcode}:${ag}:R${rn}`;
            if (jogadores[mid]) {
              jogadores[mid].name = hit.name;
              jogadores[mid].country = hit.country || jogadores[mid].country;
              delete jogadores[mid]._unresolved;
            }
            postResolved++;
            break;
          }
        }
        if (hp.name) break;
      }
    }
    console.log(`  Resolvidos por strokes match: ${postResolved}`);
    const stillPending = Object.values(hist.jogadores).filter(p => !p.name).length;
    console.log(`  Total resolvidos: ${Object.keys(hist.jogadores).length - stillPending}/${Object.keys(hist.jogadores).length}, pendentes: ${stillPending}`);

    // re-escrever participants.json com nomes propagados
    const out2 = {
      gerado_em: new Date().toISOString(),
      target_tcodes: TARGET_TCODES,
      torneios: tournInfo,
      jogadores: Object.fromEntries(
        Object.entries(jogadores).map(([mid, p]) => [mid, {
          ...p,
          ageGroups: [...p.ageGroups].sort(),
          fingerprints: Object.keys(p.fingerprints || {}).length ? p.fingerprints : undefined
        }])
      ),
      nameByStrokes
    };
    fs.writeFileSync(OUT_PARTICIPANTS, JSON.stringify(out2, null, 2));

    fs.writeFileSync(OUT_HISTORY, JSON.stringify(hist, null, 2));
    console.log(`  → ${OUT_HISTORY}`);
  } else {
    console.log(`\nDica: corre com --with-history para descarregar o GetMemberTournamentResults de cada um.`);
  }

  await browser.close();
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
