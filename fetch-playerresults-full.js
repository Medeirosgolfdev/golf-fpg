/**
 * fetch-playerresults-full.js
 *
 * Cola na consola do browser em scoring.fpg.pt (com login activo)
 * Descarrega o PlayerResults completo do Manuel e explora a estrutura.
 *
 * Uso: F12 → Console → colar → ENTER
 */

const FED     = '52884';   // Manuel
const BASE    = 'https://scoring.fpg.pt/lists';
const PAGE_SZ = 500;

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-requested-with': 'XMLHttpRequest' },
    body: JSON.stringify(body)
  });
  return res.json();
}

function dl(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}

async function run() {
  console.log('%c📥 Fetch PlayerResults completo', 'color:green;font-weight:bold;font-size:14px');

  // ── 1. PlayerResults — todas as páginas ──────────────────────
  console.log('\n1. PlayerResults (ResultsLST) — todas as páginas...');
  const allRecords = [];
  let page = 0;
  while (true) {
    const d = await postJSON(`${BASE}/PlayerResults.aspx/ResultsLST`, {
      fed_code: FED,
      jtStartIndex: String(page * PAGE_SZ),
      jtPageSize: String(PAGE_SZ)
    });
    const recs = d?.d?.Records || d?.Records || [];
    allRecords.push(...recs);
    console.log(`  Página ${page+1}: ${recs.length} registos (total: ${allRecords.length})`);
    if (recs.length < PAGE_SZ) break;
    page++;
    await new Promise(r => setTimeout(r, 200));
  }

  if (allRecords.length > 0) {
    console.log(`\n✅ ${allRecords.length} registos totais`);
    console.log('Campos disponíveis:', Object.keys(allRecords[0]));
    console.log('Primeiro registo:', JSON.stringify(allRecords[0], null, 2));
    console.log('Último registo:', JSON.stringify(allRecords[allRecords.length-1], null, 2));

    // Analisar campos interessantes
    const campos = new Set(allRecords.flatMap(r => Object.keys(r)));
    console.log('\n📋 Todos os campos:', [...campos].join(', '));

    // Ver quantos têm scorecard
    const comScore = allRecords.filter(r => r.score_detail || r.scorecard || r.hole_scores);
    console.log(`   Com scorecard: ${comScore.length}`);

    // Ver tournament_ids únicos
    const tids = [...new Set(allRecords.map(r => r.tournament_id))];
    console.log(`   tournament_ids únicos: ${tids.length} → [${tids.slice(0,10).join(',')}...]`);

    dl({ total: allRecords.length, records: allRecords }, `playerresults-${FED}.json`);
    console.log('📥 playerresults-52884.json descarregado!');
  }

  // ── 2. SingleScoreLST — scores individuais/EDS ───────────────
  console.log('\n2. SingleScoreLST — scores individuais...');
  try {
    const ss = await postJSON(`https://scoring.datagolf.pt/pt/SingleScoreLST.aspx/GetSingleScoreRecords`, {
      fed_code: FED, jtStartIndex: '0', jtPageSize: '500'
    });
    const ssRecs = ss?.d?.Records || ss?.Records || [];
    console.log(`✅ SingleScore: ${ssRecs.length} registos`);
    if (ssRecs.length > 0) {
      console.log('Campos:', Object.keys(ssRecs[0]).join(', '));
      console.log('Primeiro:', JSON.stringify(ssRecs[0], null, 2));
      dl({ records: ssRecs }, `singlescores-${FED}.json`);
    }
  } catch(e) { console.log(`❌ SingleScore: ${e.message}`); }

  // ── 3. TournAdmissions — inscrições ──────────────────────────
  console.log('\n3. TournAdmissions — inscrições em torneios...');
  // Tentar variações de parâmetros
  for (const params of [
    `?no=${FED}`,
    `?fed_code=${FED}`,
    `?no=${FED}&year=2026`,
    `?club=985&tcode=12345`,
    ``
  ]) {
    try {
      const res = await fetch(`https://scoring.datagolf.pt/pt/tournAdmissions.aspx${params}`);
      const text = await res.text();
      if (res.status === 200 && !text.includes('Runtime Error') && !text.includes('DOCTYPE')) {
        console.log(`  ✅ tournAdmissions${params}: ${text.length} bytes`);
        console.log(`  Preview: ${text.slice(0,200)}`);
        dl({ params, content: text }, `tournadmissions${params.replace(/[?&=]/g,'_')}.json`);
        break;
      } else {
        console.log(`  ❌ tournAdmissions${params}: ${res.status} ${text.slice(0,80)}`);
      }
    } catch(e) { console.log(`  💥 ${params}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 100));
  }

  // ── 4. PlayerResults — tentar outros jogadores ───────────────
  console.log('\n4. Testar com outro nfed (para confirmar estrutura)...');
  try {
    const d2 = await postJSON(`${BASE}/PlayerResults.aspx/ResultsLST`, {
      fed_code: '49085', jtStartIndex: '0', jtPageSize: '10'
    });
    const r2 = d2?.d?.Records || [];
    console.log(`  nfed 49085: ${r2.length} registos`);
    if (r2[0]) console.log('  Campos:', Object.keys(r2[0]).join(', '));
  } catch(e) { console.log(`  ❌ ${e.message}`); }

  // ── 5. HandicapsLST — ver se temos mais info de HCP ──────────
  console.log('\n5. HandicapsLST...');
  try {
    const hcp = await postJSON(`https://scoring.datagolf.pt/pt/FederatedsList.aspx/HandicapsLST`, {
      fed_code: FED, jtStartIndex: '0', jtPageSize: '100'
    });
    const hr = hcp?.d?.Records || hcp?.Records || [];
    console.log(`  ✅ HandicapsLST: ${hr.length} registos`);
    if (hr[0]) {
      console.log('  Campos:', Object.keys(hr[0]).join(', '));
      console.log('  Primeiro:', JSON.stringify(hr[0]));
    }
    if (hr.length) dl({ records: hr }, `handicaps-${FED}.json`);
  } catch(e) { console.log(`  ❌ ${e.message}`); }

  // ── 6. Federated ViewFedDET — perfil completo ─────────────────
  console.log('\n6. Federated ViewFedDET — perfil completo...');
  try {
    const fed = await postJSON(`https://scoring.datagolf.pt/pt/Federated.aspx/ViewFedDET`, {
      fed_code: FED
    });
    console.log(`  ✅ ViewFedDET: ${JSON.stringify(fed).length} bytes`);
    console.log('  Dados:', JSON.stringify(fed?.d || fed, null, 2).slice(0, 500));
    dl(fed, `federated-det-${FED}.json`);
  } catch(e) { console.log(`  ❌ ${e.message}`); }

  console.log('\n✅ Concluído!');
}

run();
