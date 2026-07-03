#!/usr/bin/env node
/**
 * scrape-fsga.js — FSGA (Florida State Golf Association) championships hospedados
 * em GolfGenius. Node puro, sem Playwright. Produz o formato JobFile consumido
 * pela MajorPage (buildFsgaEntries → mesma apresentação que JOB/FM/Doral).
 *
 * Motivação: o utilizador deu o link directo do leaderboard
 *   https://www.golfgenius.com/v2tournaments/4708880  (72nd Boys' Junior Championship)
 * A FSGA NÃO expõe a `leagueId` no domínio público golfgenius.com (o portal
 * fsga.golfgenius.com é uma SPA e fsga.org está atrás de Cloudflare), por isso o
 * caminho do `course_analytics`/tee-sheet (usado no Future Masters) não funciona.
 * SOLUÇÃO: partir do v2tid directo e derivar o PAR de cada buraco a partir dos
 * marcadores do GolfGenius (birdie=círculo, bogey=quadrado…), como no
 * scrape-junior-orange-bowl.js. Sem leagueId não há metros/SI nem draws.
 *
 * ⚠ Torneio multi-campo: R1 no Roost Course, R2/R3 no Karoo Course — pares
 * hole-by-hole DIFERENTES (ambos total 72). Por isso cada ronda leva o SEU
 * `pars[18]` (consenso por campo), além do `par` ao nível da divisão.
 *
 * Pipeline por evento (v2tid):
 *   1. GET /v2tournaments/{v2tid} (JSON) → leaderboard (jogadores + rondas).
 *   2. GET /tournaments2/details/{detailId} por jogador → scorecard hole-by-hole
 *      + data + campo + par derivado dos marcadores.
 *   3. Reordena as rondas por data (R1 = mais antiga).
 *   4. Consenso de par por campo (moda por buraco) → `pars` de cada ronda +
 *      `par` da divisão (campo mais frequente).
 *
 * USO:
 *   node scripts/scrape-fsga.js                      # todas as EDITIONS
 *   node scripts/scrape-fsga.js 4708880              # um v2tid ad-hoc
 *   node scripts/scrape-fsga.js --skip-scorecards    # rápido (só leaderboard)
 *
 * Output: public/data/fsga_{year}.json
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const GG   = 'https://www.golfgenius.com';
const OUT  = path.join(__dirname, '..', 'public', 'data');
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DELAY_MS = 300;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Edições conhecidas ─────────────────────────────────────────────────────
// Cada edição pode ter VÁRIAS divisões (uma por v2tid). O leaderboard "Overall"
// (todos os jogadores) e as sub-divisões por idade partilham o mesmo campo/rondas;
// um jogador pode aparecer em duas divisões (ex: no Overall e no seu escalão),
// tal como no cross-trofeu do England Golf.
const EDITIONS = [
  {
    name: "72nd Boys' Junior Championship",
    divisions: [
      { label: 'Overall', v2tid: '4708880' }, // championship (168 jog, corte 78)
      { label: '13-15',   v2tid: '4739657' }, // (13-15) Division (33 jog)
    ],
  },
];

// ─── HTTP (com cookie de sessão para evitar 403 pontuais) ───────────────────
let _cookie = '';
async function warm() {
  if (_cookie) return;
  const r  = await fetch(`${GG}/`, { headers: { 'User-Agent': UA } });
  const sc = r.headers.get('set-cookie') || '';
  _cookie = sc.split(/,(?=\s*\w+=)/).map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
}
async function ggGet(url, accept = 'text/html,application/xhtml+xml') {
  await warm();
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept, ...(_cookie ? { Cookie: _cookie } : {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status} GET ${url}`);
  return accept.includes('json') ? r.json() : r.text();
}

function writeJsonAtomic(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

// ─── Normalização de nomes / país (portado do scrape-future-masters.js) ─────
function normalizeName(raw) {
  if (!raw) return raw;
  const comma = raw.indexOf(', ');
  if (comma > 0) return raw.slice(comma + 2) + ' ' + raw.slice(0, comma);
  return raw;
}
const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);
const COUNTRY_MAP = { Canada:'CA', Mexico:'MX', England:'GB-ENG', Scotland:'GB-SCT', Wales:'GB-WLS', France:'FR', Germany:'DE', Spain:'ES', Italy:'IT', Sweden:'SE', Portugal:'PT', China:'CN', Japan:'JP', 'South Korea':'KR', Korea:'KR', Australia:'AU', Colombia:'CO', Venezuela:'VE', Brazil:'BR', Argentina:'AR', 'Puerto Rico':'PR', Bahamas:'BS', 'Dominican Republic':'DO' };
function inferCountry(affiliation) {
  if (!affiliation) return 'US';
  // Afiliações FSGA são cidades (ex: "Ponte Vedra Beach (2026)"). Só marcamos
  // país estrangeiro quando o último segmento após ", " é um país conhecido.
  const clean = affiliation.replace(/\s*\(\d{4}\)\s*$/, '').trim();
  const parts = clean.split(', ');
  const last  = parts[parts.length - 1].trim();
  if (US_STATES.has(last)) return 'US';
  return COUNTRY_MAP[last] || 'US';
}

function parseToPar(str) {
  if (!str || str === '-' || str === 'NS') return null;
  if (str === 'E') return 0;
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}
function parseGross(str) {
  if (str == null || str === '-' || str === 'NS' || str === '') return null;
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}

// ─── Par a partir do marcador GolfGenius (classe da célula) ─────────────────
// simple_circle=birdie(+1) · double_circle=eagle(+2) · simple_square=bogey(−1)
// · double_square=double(−2) · sem marca=par(0). → par = score + ajuste.
function parAdjust(cls) {
  if (/double_circle/.test(cls)) return 2;
  if (/circle/.test(cls))        return 1;
  if (/double_square/.test(cls)) return -2;
  if (/square/.test(cls))        return -1;
  return 0;
}

// Chave de campo normalizada a partir do header ("Cabot Citrus Farms - Karoo
// Course (…)" → "karoo"; "Cabot Citrus Farms - Roost (…)" → "roost").
function courseKey(course) {
  const m = (course || '').replace(/\([^)]*\)/g, '').toLowerCase();
  if (/karoo/.test(m)) return 'karoo';
  if (/roost/.test(m)) return 'roost';
  return (m.split('-').pop() || m).replace(/course/g, '').replace(/\s+/g, ' ').trim() || 'course';
}

// ─── Parse do scorecard (HTML de tournaments2/details) ──────────────────────
// Uma <table class="detail_table"> por jogador, com uma header_row (data+campo)
// antes de cada ronda e uma net-line com os 18 buracos. Layout 18H:
//   [nome, h1-h9, Out, h10-h18, In, Total] = 22 células.
const HOLE_IDX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19];
function parseScorecard(html) {
  const rounds = [];
  const tableRe = /<table[^>]+class=["'][^"']*detail_table[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi;
  let tm;
  while ((tm = tableRe.exec(html)) !== null) {
    let curDate = '', curCourse = '';
    const rowRe = /<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/gi;
    let rm;
    while ((rm = rowRe.exec(tm[0])) !== null) {
      const rowHtml = rm[0];
      if (/class=["'][^"']*header_row[^"']*["']/.test(rowHtml)) {
        const txt = rowHtml.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        const dm  = txt.match(/([A-Za-z]+,\s+[A-Za-z]+\s+\d+)/);
        if (dm) { curDate = dm[1].replace(/\s+/g, ' ').trim(); curCourse = txt.slice(dm.index + dm[0].length).trim(); }
        continue;
      }
      // Células com class + texto
      const cells = [];
      const cellRe = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
      let c;
      while ((c = cellRe.exec(rowHtml)) !== null) {
        const cls = (c[1].match(/class=["']([^"']*)["']/) || [, ''])[1];
        const txt = c[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        cells.push({ txt, cls });
      }
      if (cells.length < 22) continue;
      const label = (cells[0].txt || '').toLowerCase().replace(/[a-z]+,.*$/i, '').trim();
      if (/^(par|yards?|yds?|metres?|meters?|si|hdcp|hcp|stroke index)$/.test(label)) continue;
      const scores = [], par = [];
      let ok = true;
      for (const i of HOLE_IDX) {
        const n = parseInt(cells[i].txt, 10);
        if (isNaN(n) || n < 1 || n > 15) { ok = false; break; }
        scores.push(n);
        par.push(n + parAdjust(cells[i].cls));
      }
      if (!ok || scores.length < 18) continue;
      const rowDateM = cells[0].txt.match(/([A-Za-z]+,\s+[A-Za-z]+\s+\d+)/);
      const date  = rowDateM ? rowDateM[1].replace(/\s+/g, ' ').trim() : curDate;
      const f9    = parseInt(cells[10].txt, 10) || scores.slice(0, 9).reduce((a, b) => a + b, 0);
      const b9    = parseInt(cells[20].txt, 10) || scores.slice(9).reduce((a, b) => a + b, 0);
      const gross = parseInt(cells[21].txt, 10) || f9 + b9;
      rounds.push({ date, course: curCourse, scores, par, f9, b9, gross });
    }
  }
  return rounds;
}

// Ordenação cronológica ("Tue, June 30" < "Wed, July 1" < "Thu, July 2").
const MONTHS = { january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12, jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
function dateKey(d) {
  if (!d) return 0;
  const m = d.replace(/^[A-Za-z]+,\s*/, '').trim().match(/([A-Za-z]+)\s+(\d+)/);
  if (!m) return 0;
  return (MONTHS[m[1].toLowerCase()] || 0) * 100 + (parseInt(m[2], 10) || 0);
}

async function fetchScorecard(detailId) {
  const html = await ggGet(`${GG}/tournaments2/details/${detailId}?player_stats_for_portal=true`);
  return parseScorecard(html);
}

// ─── Leaderboard via v2 JSON ────────────────────────────────────────────────
async function scrapeLeaderboard(v2tid) {
  const data = await ggGet(`${GG}/v2tournaments/${v2tid}`, 'application/json');
  const ev   = data.event;
  const aggs = (ev.scopes || []).flatMap((s) => s.aggregates || []);
  const players = aggs
    .filter((agg) => {
      const d = agg.disposition || '';
      if (d === 'DNS' || d === 'NS') return false;
      if (d === 'WD') return (agg.rounds || []).some((r) => parseGross(r.total) != null);
      return true;
    })
    .map((agg) => ({
      pos:        String(agg.position || agg.rank || ''),
      name:       normalizeName(agg.name || ''),
      country:    inferCountry(agg.affiliation || ''),
      location:   agg.affiliation || '',
      detailId:   agg.id_str,
      toPar:      parseToPar(agg.score),
      total:      parseGross(agg.total),
      roundGross: (agg.rounds || []).map((r) => parseGross(r.total)).filter((n) => n != null),
      rounds:     (agg.rounds || []).map((r, i) => ({ day: i + 1, scores: [], gross: parseGross(r.total) ?? 0 })),
      ...(agg.disposition ? { disposition: agg.disposition } : {}),
    }))
    .filter((p) => p.name && (p.total != null || p.roundGross.length > 0));
  players.sort((a, b) => {
    const pa = parseInt(String(a.pos).replace(/^T/i, ''), 10) || 9999;
    const pb = parseInt(String(b.pos).replace(/^T/i, ''), 10) || 9999;
    return pa - pb || (a.total ?? 999) - (b.total ?? 999);
  });
  const year = parseInt(((ev.rounds || [])[0]?.date || '').slice(0, 4), 10) || null;
  return { name: ev.name || `FSGA ${v2tid}`, year, nRounds: (ev.rounds || []).length, players };
}

// ─── Scrape de UMA divisão (v2tid) ──────────────────────────────────────────
async function scrapeDivision(v2tid, label, opts = {}) {
  const { skipScorecards = false } = opts;
  const lb = await scrapeLeaderboard(v2tid);
  console.log(`   ━ ${label} — ${lb.players.length} jogadores · ${lb.nRounds} rondas (v2tid ${v2tid})`);

  // Scorecards
  if (!skipScorecards) {
    let done = 0;
    for (let i = 0; i < lb.players.length; i++) {
      const p = lb.players[i];
      if (!p.detailId) { p.rounds = []; continue; }
      process.stdout.write(`\r     [${String(i + 1).padStart(3)}/${lb.players.length}] ${p.name.padEnd(26).slice(0, 26)}`);
      try {
        const parsed = await fetchScorecard(p.detailId);
        if (parsed.length) {
          parsed.sort((a, b) => dateKey(a.date) - dateKey(b.date));
          p.rounds = parsed.map((r, idx) => ({ day: idx + 1, scores: r.scores, gross: r.gross, date: r.date, course: r.course, pars: r.par, _ck: courseKey(r.course) }));
          done++;
        } else { p.rounds = []; }
      } catch { p.rounds = []; }
      await sleep(DELAY_MS);
    }
    process.stdout.write('\n');
    console.log(`     ✓ ${done}/${lb.players.length} scorecards`);
  }

  // Consenso de par por campo (moda por buraco) a partir de todas as rondas.
  const courseNames = new Set();
  const byCourse = new Map(); // ck → [ {votes[18]} ]
  for (const p of lb.players) for (const r of (p.rounds || [])) {
    if (r.course) courseNames.add(r.course);
    if (!r.pars || r.pars.length !== 18) continue;
    const ck = r._ck || courseKey(r.course);
    if (!byCourse.has(ck)) byCourse.set(ck, { count: 0, votes: Array.from({ length: 18 }, () => ({})) });
    const rec = byCourse.get(ck);
    rec.count++;
    r.pars.forEach((v, i) => { rec.votes[i][v] = (rec.votes[i][v] || 0) + 1; });
  }
  const consensus = new Map();
  for (const [ck, rec] of byCourse) {
    const par = rec.votes.map((v) => { let best = null, bn = -1; for (const k in v) if (v[k] > bn) { bn = v[k]; best = +k; } return best; });
    consensus.set(ck, { par: par.every((x) => x != null) ? par : null, count: rec.count });
  }
  // Substituir o par de cada ronda pelo consenso do seu campo (robusto vs cartões sem marcadores).
  for (const p of lb.players) for (const r of (p.rounds || [])) {
    const cons = consensus.get(r._ck || courseKey(r.course));
    if (cons && cons.par) r.pars = cons.par;
    delete r._ck; delete r.course; // limpar campos auxiliares (campo já implícito no par)
  }
  // Par da divisão = campo com mais rondas (o principal).
  let mainCk = null, mainN = -1;
  for (const [ck, cons] of consensus) if (cons.count > mainN) { mainN = cons.count; mainCk = ck; }
  const divPar = mainCk && consensus.get(mainCk).par ? consensus.get(mainCk).par : null;
  const parTotal = divPar ? divPar.reduce((a, b) => a + b, 0) : null;
  console.log(`     📏 pares por campo: ${[...consensus].map(([ck, c]) => `${ck}=${c.par ? c.par.reduce((a, b) => a + b, 0) : 'n/d'}(${c.count}r)`).join(', ')}`);

  const division = {
    division: label, tid: v2tid,
    par: divPar, parTotal,
    meters: null, si: null, teeName: null,   // sem leagueId → sem metros/SI
    players: lb.players,
  };
  return { division, name: lb.name, year: lb.year, courseNames: [...courseNames] };
}

// ─── Scrape completo de uma edição (várias divisões) ────────────────────────
async function scrapeEdition(ed, opts = {}) {
  console.log(`\n${'═'.repeat(60)}`);
  const divSpecs = ed.divisions || (ed.v2tid ? [{ label: 'Overall', v2tid: ed.v2tid }] : []);
  console.log(`🏌️  ${ed.name || 'FSGA'} — ${divSpecs.length} divisão(ões)`);
  const divisions = [];
  const courseNames = new Set();
  let name = ed.name || null, year = ed.year || null;
  for (const d of divSpecs) {
    const res = await scrapeDivision(d.v2tid, d.label, opts);
    divisions.push(res.division);
    res.courseNames.forEach((c) => courseNames.add(c));
    if (!name) name = res.name;
    if (!year) year = res.year;
  }
  return {
    tournament: name,
    year,
    source: `${GG}/v2tournaments/${divSpecs[0].v2tid}`,
    course: courseNamesLabel([...courseNames]),
    divisions,
    scrapedAt: new Date().toISOString(),
  };
}

// "Cabot Citrus Farms - Karoo Course (…)" + "… - Roost (…)" → "Cabot Citrus Farms (Karoo & Roost)"
function courseNamesLabel(courseNames) {
  if (!courseNames.length) return null;
  const base = courseNames[0].split(' - ')[0].replace(/\([^)]*\)/g, '').trim();
  const layouts = [...new Set(courseNames.map((c) => {
    const m = c.replace(/\([^)]*\)/g, '').split(' - ')[1] || '';
    return m.replace(/course/i, '').trim();
  }).filter(Boolean))];
  return layouts.length ? `${base} (${layouts.join(' & ')})` : base;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const skipScorecards = args.includes('--skip-scorecards');
  const idArgs = args.filter((a) => /^\d+$/.test(a));
  // v2tids na CLI → uma edição ad-hoc com essas divisões (labels = v2tid).
  const editions = idArgs.length
    ? [{ divisions: idArgs.map((id) => ({ label: id, v2tid: id })) }]
    : EDITIONS;

  for (const ed of editions) {
    try {
      const out = await scrapeEdition(ed, { skipScorecards });
      const yearKey = out.year || (ed.divisions || [])[0]?.v2tid || 'x';
      const file = path.join(OUT, `fsga_${yearKey}.json`);
      writeJsonAtomic(file, out);
      const summary = out.divisions.map((dv) => {
        const nSc = dv.players.filter((p) => (p.rounds || []).some((r) => (r.scores || []).length)).length;
        return `${dv.division}:${dv.players.length}j(${nSc}sc)`;
      }).join(' · ');
      console.log(`   ✅ ${out.divisions.length} divisão(ões) [${summary}] → ${file}`);
    } catch (e) {
      console.error(`   ❌ ${ed.name || ''}: ${e.message}`);
    }
  }
  console.log('\n🏁 Concluído.');
}

if (require.main === module) main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
module.exports = { parseScorecard, scrapeLeaderboard, scrapeDivision, scrapeEdition, courseKey, dateKey };
