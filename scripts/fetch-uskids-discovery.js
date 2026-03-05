'use strict';

/**
 * fetch-uskids-discovery.js
 * Corre de 3 em 3 dias.
 * Varre novos IDs no signupanytime, filtra torneios internacionais,
 * actualiza uskids-discovery-cache.json
 */

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ── Filtros ──────────────────────────────────
const KEYWORDS_INCLUIR = [
  'world championship', 'world van horn', 'van horn cup',
  'european championship', 'european van horn',
  'irish open', 'paris invitational',
  'marco simone', 'venice open', 'venice classic', 'venezia',
  'rome open', 'rome classic', 'terre dei consoli',
  'andaluz', 'andalusia', 'sevilla', 'marbella', 'sotogrande', 'valderrama',
  'european', 'australian', 'canadian', 'african',
  'panama', 'vallarta', 'jekyll', 'nordic', 'al hamra',
  'fazenda boa vista',
  'championship', 'invitational', 'masters', 'open',
];
const KEYWORDS_EXCLUIR = [
  'tour championship', 'parent/child', 'qualifier',
  'state invitational', 'state championship',
  'teen series', 'teen van horn',
  'girls invitational', 'girls championship', 'girls open', 'girl',
  'golf course', 'golf club', 'country club',
  'veteran', 'world golf village', 'texas open',
  'thailand championship', 'korean championship',
  '(ca)','(fl)','(tx)','(nv)','(or)','(wa)','(al)','(nh)','(mo)',
  '(nj)','(ne)','(hi)','(id)','(ut)','(co)','(ga)','(sc)','(nc)',
  '(va)','(oh)','(mi)','(in)','(il)','(wi)','(mn)','(ia)','(ks)',
  '(ok)','(ar)','(la)','(ms)','(tn)','(ky)','(wv)','(md)','(de)',
  '(pa)','(ny)','(ct)','(ri)','(ma)','(vt)','(me)','(az)',
];
const FORCAR_INCLUIR = new Set([21080, 21573, 21199, 21200, 21133]);

const T_MAX      = 23000;
const MISS_LIMIT = 100;
const DELAY_MS   = 120;

const DIR        = path.join(__dirname, '..', 'public', 'data');
const CACHE_PATH = path.join(DIR, 'uskids-discovery-cache.json');

const IFRAME_URL = (t) =>
  `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function ehInternacional(name) {
  const n = name.toLowerCase();
  return KEYWORDS_INCLUIR.some(k => n.includes(k)) &&
        !KEYWORDS_EXCLUIR.some(k => n.includes(k));
}

function parsearDataISO(s) {
  if (!s) return null;
  if (s.includes('-')) return s;
  const [m, d, y] = s.split('/');
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function estaNoFuturo(dateStr) {
  const iso = parsearDataISO(dateStr);
  if (!iso) return true;
  return new Date(iso) >= new Date(new Date().toDateString());
}

function esperarGetMeta(page, t, ms = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    const handler = async (response) => {
      if (!response.url().includes(`op=GetMeta&t=${t}`)) return;
      clearTimeout(timer);
      page.off('response', handler);
      try { resolve(await response.json()); } catch (e) { reject(e); }
    };
    page.on('response', handler);
  });
}

async function main() {
  console.log('══════════════════════════════════════');
  console.log('🔍  USKids Discovery');
  console.log(`    ${new Date().toLocaleString('pt-PT')}`);
  console.log('══════════════════════════════════════');

  let cache = { ultimo_t: 21100, torneios: [], gerado_em: null };
  if (fs.existsSync(CACHE_PATH)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch {}
  }

  const tInicio    = cache.ultimo_t + 1;
  const conhecidos = new Map(cache.torneios.map(t => [t.t, t]));
  let misses = 0, encontrados = 0;

  console.log(`\n   Desde t=${tInicio} | conhecidos: ${conhecidos.size}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    for (let t = tInicio; t <= T_MAX && misses < MISS_LIMIT; t++) {
      try {
        const metaP = esperarGetMeta(page, t, 8000);
        await page.goto(IFRAME_URL(t), { waitUntil: 'domcontentloaded', timeout: 10000 });
        const meta = await metaP;
        const tn = meta?.tournament;
        if (!tn?.name) { misses++; await sleep(DELAY_MS); continue; }
        misses = 0;

        const nome    = tn.name.trim();
        const incluir = FORCAR_INCLUIR.has(t) || ehInternacional(nome);

        if (incluir && estaNoFuturo(tn.start_date)) {
          if (!conhecidos.has(t)) {
            console.log(`  ✅ NOVO  t=${t}  ${tn.start_date}  ${nome}`);
            encontrados++;
          }
          conhecidos.set(t, {
            t, name: nome,
            date_inicio: tn.start_date,
            date_fim:    tn.end_date,
            rondas:      tn.rounds,
            campo:       tn.courses || null,
            fee_18:      tn.fee_18  || null,
          });
        }
        cache.ultimo_t = t;
      } catch { misses++; }
      await sleep(DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  // Remover torneios passados há mais de 30 dias
  const activos = [...conhecidos.values()].filter(t => {
    const iso = parsearDataISO(t.date_inicio);
    if (!iso) return true;
    const diff = (new Date() - new Date(iso)) / 86400000;
    return diff < 30;
  });
  activos.sort((a, b) =>
    (parsearDataISO(a.date_inicio)||'').localeCompare(parsearDataISO(b.date_inicio)||'')
  );

  cache.torneios  = activos;
  cache.gerado_em = new Date().toISOString();
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');

  console.log(`\n✅  ${activos.length} torneios (${encontrados} novos)`);
  console.log('\n📋  Lista actual:');
  for (const t of activos) {
    console.log(`   t=${t.t}  ${t.date_inicio}  ${t.name}`);
  }
  console.log('══════════════════════════════════════');
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
