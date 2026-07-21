#!/usr/bin/env node
/**
 * scrape-golfgenius-node.js — Scraper GolfGenius Node-puro (SEM Playwright) para
 * eventos hospedados numa página `/pages/{id}` com VÁRIAS divisões (escalões).
 *
 * Porquê: o GolfGenius devolve 403 a browsers automatizados (Playwright) mas
 * responde normalmente a `fetch` puro. O `scrape-junior-orange-bowl.js`
 * (Playwright) parte-se em eventos multi-divisão (o switch de divisão é
 * client-side). Este scraper descobre as divisões pela API e usa o MESMO motor
 * do `scrape-fsga.js` (leaderboard v2tournaments + scorecards + par derivado dos
 * marcadores). Output: JobFile (o formato que a `MajorPage` já consome).
 *
 * Descoberta de divisões (Node-puro):
 *   1. GET /pages/{id}                                   → leagueId + título
 *   2. GET /leagues/{lid}/widgets/tournament_results?page_id={id}
 *        → <select name="round"> com uma opção por (divisão × ronda)
 *   3. Agrupa por divisão, escolhe a vista AGREGADA ("Final Round" = todas as
 *      rondas) de cada divisão; GET do widget com &round={optVal} → v2tid dessa
 *      divisão (leaderboard multi-ronda, como o FSGA).
 *   4. scrapeEdition() do scrape-fsga.js faz o resto (scorecards + par por campo).
 *
 * ⚠ Páginas 100% JS (sem leagueId no HTML, ex: a hub "Resultados" do México)
 *   não expõem o leagueId → passar `--league {id}` (obtido do widget/rede) ou
 *   `--v2tids a,b,c` directamente.
 *
 * USO:
 *   node scripts/scrape-golfgenius-node.js "https://www.golfgenius.com/pages/12770450567004716088"
 *   node scripts/scrape-golfgenius-node.js "https://www.golfgenius.com/pages/5989156" --league 123456
 *   node scripts/scrape-golfgenius-node.js --v2tids 4708880,4739657 --slug fsga --name "72nd Boys' Junior"
 *   node scripts/scrape-golfgenius-node.js <url> --skip-scorecards   # rápido (só leaderboards)
 *
 * Output: public/data/{slug}_{ano}.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { scrapeEdition, ggGet, GG } = require('./scrape-fsga.js');

const OUT = path.join(__dirname, '..', 'public', 'data');

// Slug/nome legível por evento (fallback = slugify do título).
const SLUG_OVERRIDES = [
  { re: /under armour|summer national championship/i, slug: 'uajt', name: 'The Junior Tour Powered by Under Armour — Summer National Championship' },
  { re: /campeonato nacional infantil juvenil/i,       slug: 'mexnacional', name: 'Campeonato Nacional Infantil Juvenil (México)' },
];
function slugify(s) {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'evento';
}

function writeJsonAtomic(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

// Divisão-base a partir do label da opção: remove " Final Round"/" Round N" e o
// sufixo de campo (" - Fazio Course"). "Boys 13-14 Final Round - Fazio" → "Boys 13-14".
function divisionBase(label) {
  return label
    .replace(/\s*[-–]\s*[^-–]*$/,'')                 // tira o " - {campo}" final
    .replace(/\s*(final\s+round|round\s+\d+)\s*$/i, '') // tira " Final Round"/" Round N"
    // tira o sufixo de data "(Mon, July 20)" dos eventos por-fase (CFJ) — o
    // <select> do GG trunca labels longos com "..." e deixava "(Mon, Jul" solto
    .replace(/\s*\((?:mon|tue|wed|thu|fri|sat|sun)[^)]*\)?\s*$/i, '')
    .replace(/\s+/g, ' ').trim();
}
function isFinalRound(label) { return /final\s+round/i.test(label); }
function roundNum(label) { const m = label.match(/round\s+(\d+)/i); return m ? +m[1] : (isFinalRound(label) ? 999 : 0); }

// Divisões que NÃO são o campeonato stroke-play por escalão (scrambles, side
// events, testes) — excluídas por serem 0-rondas e sujarem a apresentação.
function isSideEvent(label) { return /\b(adult|scramble|nassau|prueba|par\s*3)\b/i.test(label); }
// Ordena escalões: Boys antes de Girls, idade crescente ("8U"→8, "13-14"→13, WAGR→999).
function divSortKey(label) {
  const g = /^\s*boys|^\s*var/i.test(label) ? 0 : /^\s*girls|^\s*fem/i.test(label) ? 1 : 2;
  const m = label.match(/\d+/);
  const age = /wagr/i.test(label) ? 999 : (m ? parseInt(m[0], 10) : 998);
  return g * 1000 + age;
}

/** Descobre as divisões (label + v2tid) de uma página GolfGenius. */
async function discoverDivisions(pageUrl, leagueOverride) {
  const pid = (pageUrl.match(/pages\/(\d+)/) || [])[1];
  if (!pid) throw new Error(`URL sem /pages/{id}: ${pageUrl}`);
  const pageHtml = await ggGet(`${GG}/pages/${pid}`);
  const title = ((pageHtml.match(/<title>([^<]*)<\/title>/) || [])[1] || '')
    .replace(/\s+/g, ' ').replace(/\s*Event\s*::.*$/i, '').trim();
  const lid = leagueOverride || (pageHtml.match(/leagues\/(\d+)/) || [])[1];
  if (!lid) throw new Error(`leagueId não encontrado (página 100% JS?). Passar --league {id}. Título: "${title}"`);

  const widget = await ggGet(`${GG}/leagues/${lid}/widgets/tournament_results?page_id=${pid}`);
  const opts = [...widget.matchAll(/<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/g)]
    .map((m) => ({ val: m[1], label: m[2].replace(/\s+/g, ' ').replace(/\.\.\.$/, '').trim() }));

  // Sem <select name=round> → divisão única: o v2tid está directo no widget.
  if (!opts.length) {
    const v2 = (widget.match(/v2tournaments\/(\d+)/) || [])[1];
    if (!v2) throw new Error('sem opções de ronda nem v2tid no widget');
    return { title, lid, divisions: [{ label: title || 'Overall', v2tid: v2 }] };
  }

  // Agrupa opções por divisão, escolhe a vista agregada (Final Round) de cada.
  const byDiv = new Map();
  for (const o of opts) {
    const base = divisionBase(o.label) || o.label;
    const cur = byDiv.get(base);
    if (!cur || roundNum(o.label) > roundNum(cur.label)) byDiv.set(base, o);
  }
  // Só o campeonato stroke-play por escalão; ordenado Boys→Girls, idade crescente.
  const chosen = [...byDiv.entries()].filter(([base]) => !isSideEvent(base))
    .sort((a, b) => divSortKey(a[0]) - divSortKey(b[0]));
  console.log(`   ${chosen.length} divisão(ões) (de ${byDiv.size}; side events excluídos): ${chosen.map(([b]) => b).join(' · ')}`);

  const divisions = [];
  for (const [base, o] of chosen) {
    const w = await ggGet(`${GG}/leagues/${lid}/widgets/tournament_results?page_id=${pid}&round=${o.val}`);
    const v2 = (w.match(/v2tournaments\/(\d+)/) || [])[1];
    if (!v2) { console.log(`   ⚠ ${base}: sem v2tid (opção ${o.val}) — saltado`); continue; }
    divisions.push({ label: base, v2tid: v2 });
  }
  return { title, lid, divisions };
}

async function main() {
  const args = process.argv.slice(2);
  const skipScorecards = args.includes('--skip-scorecards');
  const getArg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const leagueOverride = getArg('--league');
  const nameOverride = getArg('--name');
  const slugOverride = getArg('--slug');
  const yearOverride = getArg('--year') ? parseInt(getArg('--year'), 10) : null;
  const v2Arg = getArg('--v2tids');
  const pageUrl = args.find((a) => /^https?:\/\/.*\/pages\/\d+/.test(a));

  let title, divisions, source;
  if (v2Arg) {
    // Aceita `id,id,...` (labels genéricos) ou `Label=id,Label=id,...` (curado,
    // ex: divisões México "Varonil 18=4582829,Femenil 18=4582833,…").
    divisions = v2Arg.split(',').map((pair, i) => {
      const eq = pair.indexOf('=');
      return eq >= 0
        ? { label: pair.slice(0, eq).trim(), v2tid: pair.slice(eq + 1).trim() }
        : { label: `Div ${i + 1}`, v2tid: pair.trim() };
    });
    title = nameOverride || 'GolfGenius Event';
    source = `${GG}/v2tournaments/${divisions[0].v2tid}`;
  } else if (pageUrl) {
    console.log(`\n${'═'.repeat(60)}\n🔎 A descobrir divisões: ${pageUrl}`);
    const disc = await discoverDivisions(pageUrl, leagueOverride);
    title = disc.title; divisions = disc.divisions; source = pageUrl;
    if (!divisions.length) throw new Error('nenhuma divisão descoberta');
  } else {
    console.error('Uso: node scripts/scrape-golfgenius-node.js <pageUrl> [--league id] [--v2tids a,b] [--name] [--slug] [--year] [--skip-scorecards]');
    process.exit(1);
  }

  // Slug/nome: override CLI → SLUG_OVERRIDES por título → slugify.
  let slug = slugOverride, name = nameOverride || title;
  if (!slug) for (const o of SLUG_OVERRIDES) if (o.re.test(title || '')) { slug = o.slug; if (!nameOverride) name = o.name; break; }
  if (!slug) slug = slugify(title);

  // --profiles: enriquece cada jogador com DOB/clube/ano de graduação da ficha
  // GG (/profiles/{id}). Auto-ligado quando se dá --country (caso FMG México).
  const withProfiles = args.includes('--profiles') || !!getArg('--country');
  const ed = { name, year: yearOverride, divisions };
  const out = await scrapeEdition(ed, { skipScorecards, profiles: withProfiles });
  out.source = source;
  if (nameOverride) out.tournament = nameOverride;

  // País por defeito (ex: México → MX): o inferCountry do motor cai em "US"
  // quando a afiliação é só um clube sem país. Substitui esse fallback pelo país
  // do evento; afiliações com país reconhecível mantêm o seu código.
  const countryDefault = getArg('--country');
  if (countryDefault) for (const dv of out.divisions) for (const p of dv.players) {
    if (p.country === 'US') p.country = countryDefault;
  }

  const yearKey = out.year || 'x';
  const file = path.join(OUT, `${slug}_${yearKey}.json`);
  writeJsonAtomic(file, out);
  const summary = out.divisions.map((dv) => {
    const nSc = dv.players.filter((p) => (p.rounds || []).some((r) => (r.scores || []).length)).length;
    return `${dv.division}:${dv.players.length}j(${nSc}sc)`;
  }).join(' · ');
  console.log(`\n   ✅ ${out.tournament} — ${out.divisions.length} divisão(ões) [${summary}] → ${file}`);
  console.log('🏁 Concluído.');
}

if (require.main === module) main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
module.exports = { discoverDivisions };
