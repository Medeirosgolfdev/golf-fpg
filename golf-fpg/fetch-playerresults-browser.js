/**
 * fetch-playerresults-browser.js
 *
 * Cola na consola do browser em scoring.fpg.pt (com login activo)
 *
 * O problema com o Manuel (52884): o scoring.fpg.pt usa os dados do
 * scoring.datagolf.pt como fonte. O nfed 52884 pode ter um club_code
 * diferente do esperado, ou os dados do Manuel estão no datagolf com
 * um id diferente.
 *
 * Este script:
 *  1. Busca PlayerResults para vários nfeds (incluindo Manuel)
 *  2. Descobre os campos disponíveis
 *  3. Tenta encontrar o nfed correcto do Manuel
 *  4. Descarrega o JSON completo
 */

const BASE = 'https://scoring.fpg.pt/lists';

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-requested-with': 'XMLHttpRequest' },
    body: JSON.stringify(body)
  });
  return r.json();
}

function dl(obj, name) {
  const b = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click();
  console.log(`📥 ${name} descarregado`);
}

async function fetchResults(fed, pages = 5) {
  const all = [];
  for (let p = 0; p < pages; p++) {
    try {
      const d = await post(`${BASE}/PlayerResults.aspx/ResultsLST`, {
        fed_code: String(fed), jtStartIndex: String(p * 100), jtPageSize: '100'
      });
      const recs = d?.d?.Records || d?.Records || [];
      all.push(...recs);
      if (recs.length < 100) break;
      await new Promise(r => setTimeout(r, 200));
    } catch(e) { break; }
  }
  return all;
}

async function run() {
  console.log('%c📊 PlayerResults Explorer', 'color:green;font-weight:bold;font-size:14px');

  // ── 1. Manuel e outros nfeds para comparar ────────────────────
  const NFEDS = {
    '52884': 'Manuel Medeiros',
    '49085': 'Jogador conhecido',
    '52880': 'Jogador próximo de Manuel',
    '52856': 'Jogador próximo de Manuel',
    '53150': 'Jogador próximo de Manuel',
  };

  const allData = {};

  for (const [fed, nome] of Object.entries(NFEDS)) {
    console.log(`\nA buscar ${nome} (${fed})...`);
    const recs = await fetchResults(fed);
    allData[fed] = { nome, count: recs.length, records: recs };

    if (recs.length > 0) {
      console.log(`  ✅ ${recs.length} registos`);
      console.log(`  Campos: ${Object.keys(recs[0]).join(', ')}`);
      console.log(`  Último: ${JSON.stringify(recs[recs.length-1]).slice(0,200)}`);
    } else {
      console.log(`  ❌ 0 registos ou erro`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // ── 2. Descobrir club_code do Manuel ──────────────────────────
  console.log('\n── Tentativa: descobrir nfed alternativo do Manuel ──');
  // Na FPG, o nfed federativo pode diferir do id interno do datagolf
  // Tentar com diferentes variações
  for (const fed of ['52884', '762810', '630106']) {
    const r = await post(`${BASE}/PlayerResults.aspx/ResultsLST`, {
      fed_code: fed, jtStartIndex: '0', jtPageSize: '10'
    });
    const recs = r?.d?.Records || r?.Records || [];
    console.log(`  nfed=${fed}: ${recs.length > 0 ? recs.length + ' registos ✅' : r?.d?.Result || r?.Result || 'sem dados'}`);
    if (recs.length > 0) {
      console.log(`  → ${JSON.stringify(recs[0])}`);
    }
  }

  // ── 3. Descarregar dados disponíveis ──────────────────────────
  dl(allData, 'playerresults-exploration.json');

  // ── 4. Tentar SingleScoreLST directamente no datagolf ─────────
  console.log('\n── SingleScoreLST (datagolf, sem CORS do fpg.pt) ──');
  // Abrir iframe do datagolf para bypass CORS
  const iframe = document.createElement('iframe');
  iframe.src = 'https://scoring.datagolf.pt/pt/PlayerResults.aspx';
  iframe.style.cssText = 'position:fixed;top:0;right:0;width:400px;height:200px;border:2px solid red;z-index:9999;background:white;';
  document.body.appendChild(iframe);
  console.log('  ⏳ Iframe aberto para scoring.datagolf.pt...');
  console.log('  Aguardar 3 segundos e tentar chamada...');

  await new Promise(r => setTimeout(r, 3000));

  try {
    // Tentar via iframe contentWindow
    const iw = iframe.contentWindow;
    if (iw) {
      const r = await iw.fetch('/pt/SingleScoreLST.aspx/GetSingleScoreRecords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
        body: JSON.stringify({ fed_code: '52884', jtStartIndex: '0', jtPageSize: '100' })
      });
      const data = await r.json();
      const recs = data?.d?.Records || data?.Records || [];
      console.log(`  ✅ SingleScore via iframe: ${recs.length} registos`);
      if (recs.length > 0) {
        console.log(`  Campos: ${Object.keys(recs[0]).join(', ')}`);
        dl({ records: recs }, 'singlescores-52884.json');
      }
    }
  } catch(e) {
    console.log(`  ❌ iframe approach: ${e.message}`);
  }

  iframe.remove();

  console.log('\n✅ Concluído! Verifica os downloads.');
}

run();
