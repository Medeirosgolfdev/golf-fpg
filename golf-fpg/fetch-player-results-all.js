/**
 * fetch-player-results-all.js
 *
 * Cola na consola do browser em scoring.fpg.pt (com login activo).
 * 
 * Descarrega PlayerResults para:
 *  - Manuel (52884) — carreira completa
 *  - Lista de nfeds configurável
 *
 * CAMPOS DISPONÍVEIS (34 por registo):
 *  id                     — id interno do score
 *  tournament_id          — id do torneio (JOIN para ver outros jogadores!)
 *  score_dateStr          — "YYYY-MM-DD HH:MM:SS"
 *  tournament_description — nome do torneio
 *  course_description     — nome do campo
 *  par_total              — par do percurso
 *  hole_count             — 9 ou 18
 *  exact_hcp              — HCP exacto NO DIA
 *  calculated_exact_hcp   — HCP calculado após a ronda
 *  play_hcp               — HCP de jogo (int)
 *  calculated_play_hcp    — HCP de jogo calculado
 *  calculated_stablnet_total — STB calculado
 *  gross_total            — gross (998 = ND/NS)
 *  cba_value              — CBA ajustment
 *  score_differential     — WHS score differential (para calc HCP!)
 *  calc_field1            — gross calculado
 *  calc_field2            — to-par formatado (ex: "+7", "E")
 *  calc_hcp_index         — HCP index calculado
 *  calc_course_hcp        — course HCP calculado
 *  calc_stablnet_total    — STB calculado alternativo
 *  score_origin           — "Torn"|"Intern"|"Indiv"|"EDS"
 *  hcp_qualifying_round   — 1 se conta para HCP
 *  hcp_qualifying_name    — "Sim"|"Não"
 *  status_name            — "OK"|"ND"|"NS"|"DQ"
 *  federation_code        — nfed do jogador
 *
 * NOTA IMPORTANTE: tournament_id=2 devolve todos os jogadores do torneio
 * quando qualquer deles é o fed_code! É possível usar para descobrir
 * os outros jogadores de torneios internacionais.
 *
 * Uso: cola em scoring.fpg.pt → F12 → Console
 */

const BASE = 'https://scoring.fpg.pt/lists';
const PAGE = 500;

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-requested-with': 'XMLHttpRequest' },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  return d?.d?.Records || d?.Records || [];
}

function dl(obj, name) {
  const b = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click();
  console.log(`📥 ${name}`);
}

async function fetchAll(fed) {
  const all = [];
  for (let p = 0; p < 20; p++) { // max 10000 records
    const recs = await post(`${BASE}/PlayerResults.aspx/ResultsLST`, {
      fed_code: String(fed), jtStartIndex: String(p * PAGE), jtPageSize: String(PAGE)
    });
    all.push(...recs);
    if (recs.length < PAGE) break;
    await new Promise(r => setTimeout(r, 200));
  }
  return all;
}

async function run() {
  console.log('%c📊 PlayerResults — Fetch All', 'color:green;font-weight:bold;font-size:14px');

  // ── Config: nfeds a descarregar ───────────────────────────────
  const TARGETS = [
    { fed: '52884', name: 'Manuel Medeiros' },
    // Adicionar mais jogadores aqui se necessário:
    // { fed: '49085', name: 'Outro jogador' },
  ];

  const allData = {};

  for (const { fed, name } of TARGETS) {
    console.log(`\n▶ ${name} (${fed})...`);
    const recs = await fetchAll(fed);
    console.log(`  ✅ ${recs.length} registos`);

    // Análise rápida
    if (recs.length > 0) {
      const origins = {};
      const statuses = {};
      recs.forEach(r => {
        origins[r.score_origin] = (origins[r.score_origin]||0) + 1;
        statuses[r.status_name] = (statuses[r.status_name]||0) + 1;
      });
      console.log(`  Origins: ${JSON.stringify(origins)}`);
      console.log(`  Statuses: ${JSON.stringify(statuses)}`);

      // Score differentials WHS
      const diffs = recs.filter(r => r.score_differential != null).map(r => r.score_differential);
      if (diffs.length > 0) {
        const sorted = [...diffs].sort((a,b)=>a-b);
        console.log(`  Diffs: min=${sorted[0]} max=${sorted[sorted.length-1]} count=${diffs.length}`);
      }

      // Torneios internacionais (Intern)
      const intl = recs.filter(r => r.score_origin === 'Intern');
      if (intl.length > 0) {
        console.log(`  Internacionais (${intl.length}):`);
        intl.forEach(r => console.log(`    [${r.score_dateStr?.slice(0,10)}] ${r.tournament_description} | gross=${r.gross_total} | diff=${r.score_differential}`));
      }
    }

    allData[fed] = { name, count: recs.length, records: recs };
  }

  // ── Download JSON completo ────────────────────────────────────
  dl(allData, 'player-results-complete.json');

  // ── Download apenas Manuel com campos úteis ───────────────────
  if (allData['52884']) {
    const manuel = allData['52884'].records;

    // Formato simplificado para integrar na app
    const simplified = manuel.map(r => ({
      date: r.score_dateStr?.slice(0, 10),
      tourn: r.tournament_description,
      course: r.course_description,
      par: r.par_total,
      holes: r.hole_count,
      gross: r.gross_total === 998 ? null : r.gross_total,
      toPar: r.calc_field2,  // "+7", "E", "-1"
      stb: r.calculated_stablnet_total,
      hcpDay: r.exact_hcp,
      hcpAfter: r.calculated_exact_hcp,
      playHcp: r.play_hcp,
      diff: r.score_differential,
      origin: r.score_origin,  // Torn|Intern|Indiv|EDS
      status: r.status_name,   // OK|ND|NS|DQ
      qualifying: r.hcp_qualifying_name === 'Sim',
      tid: r.tournament_id,
    }));

    dl({ records: simplified }, 'manuel-results-simplified.json');

    // ── Análise: Evolution de HCP ──────────────────────────────
    console.log('\n── Evolução de HCP do Manuel ──');
    const byDate = manuel
      .filter(r => r.calculated_exact_hcp != null && r.status_name === 'OK')
      .sort((a,b) => (a.score_dateStr||'').localeCompare(b.score_dateStr||''));
    byDate.forEach(r => {
      console.log(`  ${r.score_dateStr?.slice(0,10)} | HCP ${r.exact_hcp} → ${r.calculated_exact_hcp} | diff=${r.score_differential} | ${r.tournament_description?.slice(0,40)}`);
    });
  }

  console.log('\n✅ Concluído!');
}

run();
