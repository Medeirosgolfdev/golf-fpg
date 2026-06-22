#!/usr/bin/env node
/**
 * scrape-future-masters-all.js — Descarrega TUDO do Future Masters Golf de uma
 * vez: leaderboard + scorecards + par/metros + draws (tee sheet), para TODOS os
 * anos configurados, e auto-descobre o ano corrente a partir do site oficial.
 *
 * Porquê: o `scrape-future-masters.js` já faz a pipeline completa, mas os ids do
 * GolfGenius (pages/draw pages) mudam todos os anos. Este wrapper lê-os
 * automaticamente de `futuremastersgolf.com` (URLs estáveis por escalão), por
 * isso CADA ANO NOVO funciona sem editar a config — basta correr este script.
 *
 * Fluxo:
 *   1. Auto-descobre a edição corrente (4 escalões → resultsPageId + drawPageId)
 *      a partir de futuremastersgolf.com/{Scoring,Tee-Times}/Age-Group/{slug}.
 *   2. Junta com as edições históricas curadas (EDITIONS do script principal).
 *      — Anos já na config usam a config curada (tem fallbacks tipo v2tid do 11&12).
 *      — Um ano NOVO (ainda não na config) é adicionado automaticamente.
 *   3. Corre a pipeline completa (force-rescrape) para cada ano.
 *
 * Uso:
 *   node scripts/scrape-future-masters-all.js                 # tudo (todos os anos)
 *   node scripts/scrape-future-masters-all.js --no-discover   # só os anos da config
 *   node scripts/scrape-future-masters-all.js --year 2026     # só um ano (+ descoberta se for o corrente)
 *   node scripts/scrape-future-masters-all.js --current       # só o ano corrente descoberto (ideal p/ cron diário)
 *   node scripts/scrape-future-masters-all.js --skip-scorecards  # rápido (sem scorecards)
 *   node scripts/scrape-future-masters-all.js --only-new      # só anos NÃO presentes na config (descobertos)
 */

const { scrapeYear, EDITIONS, GG_BASE } = require('./scrape-future-masters.js');

const FMG = 'https://www.futuremastersgolf.com';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0', 'Accept': 'text/html' };

// Escalões do site oficial (slug estável) → nome interno usado na config.
const AGE_SLUGS = {
  '10 and Under': '10U',
  '11 & 12':      '1112',
  '13 & 14':      '1314',
  '15-18':        '1518',
};

async function getText(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

/** Lê o id do GolfGenius embutido no iframe de uma página FMG. */
function extractGgPageId(html) {
  return (html.match(/golfgenius\.com\/pages\/(\d+)/) || [])[1]
      || (html.match(/page_id=(\d+)/) || [])[1]
      || null;
}

/**
 * Auto-descobre a edição corrente do site oficial. Para cada escalão lê o
 * resultsPageId (/Scoring) e o drawPageId (/Tee-Times). O ano vem do título da
 * página de resultados do GolfGenius (ex: "2026 FM 11-12 Event").
 */
async function discoverCurrentEdition() {
  const ageGroups = {};
  let year = null;

  for (const [name, slug] of Object.entries(AGE_SLUGS)) {
    let pageId = null, drawPageId = null;
    try { pageId = extractGgPageId(await getText(`${FMG}/Scoring/Age-Group/${slug}`)); } catch { /* ignora */ }
    try { drawPageId = extractGgPageId(await getText(`${FMG}/Tee-Times/Age-Group/${slug}`)); } catch { /* ignora */ }

    // Ano a partir do título da página GolfGenius de resultados.
    if (!year && pageId) {
      try {
        const gg = await getText(`${GG_BASE}/pages/${pageId}`);
        const m = (gg.match(/<title>[\s\S]*?(20\d{2})/) || [])[1];
        if (m) year = parseInt(m, 10);
      } catch { /* ignora */ }
    }

    if (pageId || drawPageId) {
      const spec = {};
      if (pageId) spec.pageId = pageId;
      if (drawPageId) spec.drawPageId = drawPageId;
      ageGroups[name] = spec;
    }
  }

  if (!year || Object.keys(ageGroups).length === 0) return null;
  return { year, ageGroups };
}

/** Junta a descoberta com as edições curadas. Config curada manda nos anos que
 *  já tem (têm fallbacks, ex: v2tid do 11&12); descoberta adiciona anos novos. */
function mergeEditions(discovered, onlyNew) {
  const byYear = new Map(EDITIONS.map(e => [e.year, e]));
  if (discovered) {
    if (byYear.has(discovered.year)) {
      if (!onlyNew) console.log(`  ℹ ${discovered.year} já está na config curada — a usar essa (tem fallbacks).`);
    } else {
      console.log(`  ✓ ano novo descoberto: ${discovered.year} (${Object.keys(discovered.ageGroups).length} escalões) — adicionado automaticamente.`);
      byYear.set(discovered.year, discovered);
    }
  }
  let list = [...byYear.values()].sort((a, b) => b.year - a.year);
  if (onlyNew) {
    const known = new Set(EDITIONS.map(e => e.year));
    list = list.filter(e => !known.has(e.year));
  }
  return list;
}

async function main() {
  const args = process.argv.slice(2);
  const yearFilter = [];
  for (let i = 0; i < args.length; i++) if (args[i] === '--year') yearFilter.push(parseInt(args[++i], 10));
  const noDiscover    = args.includes('--no-discover');
  const onlyNew       = args.includes('--only-new');
  const currentOnly   = args.includes('--current');
  const skipScorecards = args.includes('--skip-scorecards');

  console.log('═══ Future Masters — descarga completa (leaderboard + scorecards + par + draws) ═══\n');

  let discovered = null;
  if (!noDiscover) {
    console.log('A auto-descobrir a edição corrente em futuremastersgolf.com…');
    try {
      discovered = await discoverCurrentEdition();
      if (discovered) {
        const eg = Object.entries(discovered.ageGroups)
          .map(([n, s]) => `${n}=${s.pageId || '—'}${s.drawPageId ? '/draw' : ''}`).join(', ');
        console.log(`  → ${discovered.year}: ${eg}`);
      } else {
        console.log('  ⚠ não foi possível auto-descobrir (site mudou?) — sigo só com a config.');
      }
    } catch (e) {
      console.log(`  ⚠ descoberta falhou (${e.message}) — sigo só com a config.`);
    }
  }

  let editions = mergeEditions(discovered, onlyNew);
  if (currentOnly) {
    if (!discovered) { console.log('\n--current pedido mas a descoberta falhou — nada a fazer.'); return; }
    editions = editions.filter(e => e.year === discovered.year);
  }
  if (yearFilter.length) editions = editions.filter(e => yearFilter.includes(e.year));

  if (editions.length === 0) {
    console.log('\nNada para fazer (sem anos a processar).');
    return;
  }

  console.log(`\nA processar ${editions.length} ano(s): ${editions.map(e => e.year).join(', ')}`);
  console.log(skipScorecards ? 'Modo: sem scorecards (rápido)\n' : 'Modo: completo (scorecards + draws)\n');

  // No modo completo, force-rescrape (refaz tudo, apanha correcções como
  // metros/rondas). No modo --skip-scorecards NÃO forçamos, para não apagar os
  // scorecards já gravados de anos completos (seria destrutivo).
  const forceRescrape = !skipScorecards;

  for (const ed of editions) {
    try {
      await scrapeYear(ed.year, ed.ageGroups, { forceRescrape, skipScorecards });
    } catch (e) {
      console.error(`✗ ${ed.year}: ${e.message}`);
    }
  }

  console.log('\n═══ Concluído. ═══');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
