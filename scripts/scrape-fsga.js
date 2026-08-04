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
const COUNTRY_MAP = { Canada:'CA', Mexico:'MX', England:'GB-ENG', Scotland:'GB-SCT', Wales:'GB-WLS', France:'FR', Germany:'DE', Spain:'ES', Italy:'IT', Sweden:'SE', Portugal:'PT', China:'CN', Japan:'JP', 'South Korea':'KR', Korea:'KR', Australia:'AU', Colombia:'CO', Venezuela:'VE', Brazil:'BR', Argentina:'AR', 'Puerto Rico':'PR', Bahamas:'BS', 'Dominican Republic':'DO',
  // Eventos internacionais (Champion of Champions) declaram a afiliação como
  // PAÍS, não como cidade — sem estas entradas caíam todos no fallback "US".
  Ireland:'IE', 'Northern Ireland':'GB-NIR', 'Great Britain and Ireland':'GB', 'Isle of Man':'IM', 'United States':'US', 'United States of America':'US',
  Belgium:'BE', Netherlands:'NL', Denmark:'DK', Norway:'NO', Finland:'FI', Iceland:'IS', Austria:'AT', Switzerland:'CH', Poland:'PL', 'Czech Republic':'CZ', Czechia:'CZ', Slovakia:'SK', Slovenia:'SI', Croatia:'HR', Hungary:'HU', Bulgaria:'BG', Romania:'RO', Greece:'GR', Turkey:'TR', Malta:'MT', Luxembourg:'LU', Estonia:'EE', Latvia:'LV', Lithuania:'LT', Ukraine:'UA', Kazakhstan:'KZ',
  'South Africa':'ZA', Zimbabwe:'ZW', Zambia:'ZM', Botswana:'BW', Egypt:'EG', Morocco:'MA', Kenya:'KE', Nigeria:'NG',
  'United Kingdom':'GB', 'Great Britain':'GB', 'Golf Ireland':'IE', Azerbaijan:'AZ', 'Türkiye':'TR', Turkiye:'TR',
  // Formas longas ISO que a roster do GolfGenius usa (UA Worlds).
  'Russian Federation':'RU', Russia:'RU', 'Korea, Republic of':'KR', Bolivia:'BO', Barbados:'BB',
  India:'IN', 'Hong Kong':'HK', 'Hong Kong, China':'HK', Singapore:'SG', Malaysia:'MY', Thailand:'TH', Philippines:'PH', Indonesia:'ID', Vietnam:'VN', Taiwan:'TW', 'Chinese Taipei':'TW', 'New Zealand':'NZ', 'United Arab Emirates':'AE', Israel:'IL', Chile:'CL', Peru:'PE', Uruguay:'UY', Paraguay:'PY', Ecuador:'EC', Panama:'PA', 'Costa Rica':'CR', Guatemala:'GT', Jamaica:'JM' };
// `fallback` = o que devolver quando a afiliação não identifica país nenhum.
// Default "US" (as afiliações FSGA/UA são cidades americanas), mas eventos
// mundiais passam `null` — no CoC 2023 o GG não publica afiliação NENHUMA e
// carimbar 243 miúdos de 40 países como americanos seria pior que não saber.
function inferCountry(affiliation, fallback = 'US') {
  if (!affiliation) return fallback;
  // Afiliações FSGA são cidades (ex: "Ponte Vedra Beach (2026)"). Só marcamos
  // país estrangeiro quando a afiliação inteira, ou o último segmento após
  // ", ", é um país conhecido ("Hong Kong, China" bate como um todo).
  const clean = affiliation.replace(/\s*\(\d{4}\)\s*$/, '').trim();
  if (COUNTRY_MAP[clean]) return COUNTRY_MAP[clean];
  const parts = clean.split(', ');
  const last  = parts[parts.length - 1].trim();
  if (US_STATES.has(last)) return 'US';
  return COUNTRY_MAP[last] || fallback;
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
  // Vocabulário alternativo (visto no Champion of Champions 2026): a célula
  // nomeia o resultado — par-hole / birdie-hole / eagle-hole / plusN-hole.
  // Sem isto TODAS as células contavam como par e o par saía = ao score (o
  // U12 Girls dava "par 82"). ⚠ `starting-hole` não é marcador de resultado.
  if (/\b(double-eagle|albatross)-hole\b/.test(cls)) return 3;
  if (/\beagle-hole\b/.test(cls))  return 2;
  if (/\bbirdie-hole\b/.test(cls)) return 1;
  const plus = cls.match(/\bplus(\d)-hole\b/);
  if (plus) return -Number(plus[1]);
  return 0;
}

// Chave de campo normalizada a partir do header ("Cabot Citrus Farms - Karoo
// Course (…)" → "karoo"; "Cabot Citrus Farms - Roost (…)" → "roost").
function courseKey(course) {
  const m = (course || '').replace(/\([^)]*\)/g, '').toLowerCase();
  if (/karoo/.test(m)) return 'karoo';
  if (/roost/.test(m)) return 'roost';
  // ⚠ Nome COMPLETO (sem o tee entre parênteses) como chave. Ficar-se pelo
  // último segmento depois do "-" fundia campos distintos que partilham o
  // sufixo — no CoC "Faldo - World Championship" e "Castle Hume - World
  // Championship" davam ambos "world championship" e misturavam os pares.
  return m.replace(/\s+/g, ' ').trim() || 'course';
}

// ─── Parse do scorecard (HTML de tournaments2/details) ──────────────────────
// Uma <table class="detail_table"> por jogador, com uma header_row (data+campo)
// antes de cada ronda e uma net-line com os 18 buracos. Layout 18H:
//   [nome, h1-h9, Out, h10-h18, In, Total] = 22 células.
// ⚠ Divisões de 9 buracos (ex: CoC "Under 9" = 27 buracos em 3 voltas de 9)
// usam a MESMA tabela de 18 colunas com metade em branco → lê-se cada nine em
// separado e a ronda fica com 9 scores + `startingHole` (1 ou 10).
const F9_IDX = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const B9_IDX = [11, 12, 13, 14, 15, 16, 17, 18, 19];
// ⚠ O tecto por buraco tem de aguentar um desastre real: no CoC 2026 o
// Maximilian Oberlin fez **17** no buraco 8 da R2 e, com o antigo tecto de 15,
// o nine inteiro era rejeitado — ficava só o back nine e a volta de 100 entrava
// como uma volta de 9 buracos. Só interessa rejeitar células vazias/não
// numéricas (buraco por jogar); 30 é um tecto anti-lixo, não uma regra de golfe.
function readNine(cells, idxs) {
  const scores = [], par = [];
  for (const i of idxs) {
    const n = parseInt(cells[i].txt, 10);
    if (isNaN(n) || n < 1 || n > 30) return null;
    scores.push(n);
    par.push(n + parAdjust(cells[i].cls));
  }
  return { scores, par };
}
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
      const front = readNine(cells, F9_IDX), back = readNine(cells, B9_IDX);
      if (!front && !back) continue;
      const scores = [...(front?.scores || []), ...(back?.scores || [])];
      const par    = [...(front?.par || []),    ...(back?.par || [])];
      const startingHole = front ? 1 : 10;
      const rowDateM = cells[0].txt.match(/([A-Za-z]+,\s+[A-Za-z]+\s+\d+)/);
      const date  = rowDateM ? rowDateM[1].replace(/\s+/g, ' ').trim() : curDate;
      const sum   = (a) => a.reduce((x, y) => x + y, 0);
      const f9    = front ? (parseInt(cells[10].txt, 10) || sum(front.scores)) : null;
      const b9    = back  ? (parseInt(cells[20].txt, 10) || sum(back.scores))  : null;
      const gross = front && back ? (parseInt(cells[21].txt, 10) || f9 + b9) : (f9 ?? b9);
      rounds.push({ date, course: curCourse, scores, par, f9, b9, gross, startingHole });
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
  // O detail page linka o perfil do jogador (/profiles/{id}) — captura-se aqui
  // para depois buscar a DOB/clube sem re-fetch (usado no enriquecimento MX).
  const profileId = (html.match(/profiles\/(\d+)/) || [])[1] || null;
  // Nacionalidade real: o detail page mostra a bandeira do jogador como
  // `flag-icon-{cc}` (ISO alpha-2, ex: gb, pt, es). Serve para corrigir o
  // fallback "US" do inferCountry (afiliação só com clube, sem país) — caso
  // Faldo (GolfGenius só expõe o clube). Ignora o genérico 'xx'/'un'.
  const fc = (html.match(/flag-icon-([a-z]{2})\b/) || [])[1] || null;
  const flagCountry = fc && fc !== 'xx' && fc !== 'un' ? fc.toUpperCase() : null;
  return { rounds: parseScorecard(html), profileId, flagCountry };
}

// Ficha do jogador (/profiles/{id}) — algumas federações (ex: FMG México) expõem
// DATE OF BIRTH, CLUB e AÑO DE GRADUACIÓN. Devolve {dob:"YYYY-MM-DD", club, gradYear}.
async function fetchProfile(profileId) {
  const html = await ggGet(`${GG}/profiles/${profileId}`);
  const txt = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const dobRaw = (txt.match(/DATE OF BIRTH\s*([0-3]?\d\/[0-1]?\d\/\d{4})/i) || txt.match(/(?:FECHA DE NACIMIENTO|NACIMIENTO)\s*([0-3]?\d\/[0-1]?\d\/\d{4})/i) || [])[1] || null;
  // Formato GG México = DD/MM/YYYY. Converter para ISO YYYY-MM-DD.
  let dob = null;
  if (dobRaw) { const [d, m, y] = dobRaw.split('/'); if (y && m && d) dob = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; }
  const club = (txt.match(/CLUB\s+([A-Za-zÀ-ÿ0-9'’.\- ]{2,40}?)\s+(?:DATE OF BIRTH|AÑO|AGE|View|Player)/i) || [])[1]?.trim() || null;
  const gradYear = (txt.match(/(?:AÑO DE GRADUACIÓN|GRADUATION YEAR)\s*(\d{4})/i) || [])[1] || null;
  return { dob, club, gradYear };
}

// ─── Ordem cronológica das rondas ───────────────────────────────────────────
// `ev.rounds` e `agg.rounds` partilham id/nome mas NÃO vêm ordenados quando o
// evento está a decorrer. Ordena qualquer lista de rondas pela data declarada
// em `ev.rounds` (fallback: número no nome "R2"). No-op quando já está em ordem.
function sortRounds(rounds, evRounds) {
  const byId = new Map(), byName = new Map();
  for (const r of evRounds || []) {
    if (r.id != null) byId.set(String(r.id), r.date || '');
    if (r.name) byName.set(String(r.name), r.date || '');
  }
  const dateOf = (r) => byId.get(String(r.id)) || byName.get(String(r.name)) || r.date || '';
  const numOf  = (r) => parseInt(String(r.name || '').replace(/\D/g, ''), 10) || 0;
  return [...(rounds || [])].sort((a, b) => {
    const da = dateOf(a), db = dateOf(b);
    if (da && db && da !== db) return da < db ? -1 : 1;
    return numOf(a) - numOf(b);
  });
}

// ─── Leaderboard via v2 JSON ────────────────────────────────────────────────
async function scrapeLeaderboard(v2tid, opts = {}) {
  const defaultCountry = opts.defaultCountry === undefined ? 'US' : opts.defaultCountry;
  const data = await ggGet(`${GG}/v2tournaments/${v2tid}`, 'application/json');
  const ev   = data.event;
  const aggs = (ev.scopes || []).flatMap((s) => s.aggregates || []);
  // ⚠ O GG NÃO devolve as rondas por ordem cronológica: num evento em curso a
  // ronda a decorrer vem PRIMEIRO (medido no CoC 2026: R3,R1,R2). Sem isto, a
  // R1 ficava com o gross da ronda em curso ("-") e o dia 1 saía a zero.
  const evRounds  = sortRounds(ev.rounds || [], ev.rounds || []);
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
      country:    inferCountry(agg.affiliation || '', defaultCountry),
      location:   agg.affiliation || '',
      detailId:   agg.id_str,
      toPar:      parseToPar(agg.score),
      total:      parseGross(agg.total),
      roundGross: sortRounds(agg.rounds || [], ev.rounds || []).map((r) => parseGross(r.total)).filter((n) => n != null),
      rounds:     sortRounds(agg.rounds || [], ev.rounds || []).map((r, i) => ({ day: i + 1, scores: [], gross: parseGross(r.total) ?? 0 })),
      ...(agg.disposition ? { disposition: agg.disposition } : {}),
    }))
    .filter((p) => p.name && (p.total != null || p.roundGross.length > 0));
  players.sort((a, b) => {
    const pa = parseInt(String(a.pos).replace(/^T/i, ''), 10) || 9999;
    const pb = parseInt(String(b.pos).replace(/^T/i, ''), 10) || 9999;
    return pa - pb || (a.total ?? 999) - (b.total ?? 999);
  });
  const year = parseInt((evRounds[0]?.date || '').slice(0, 4), 10) || null;
  // Datas das rondas (ISO) — alimentam o startDate/endDate do JobFile, que o
  // catálogo MAJOR prefere a derivar das voltas dos jogadores (num evento por
  // começar não há voltas nenhumas e o torneio ficava SEM data na sidebar).
  const roundDates = evRounds.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || ''));
  return { name: ev.name || `FSGA ${v2tid}`, year, nRounds: evRounds.length, players, roundDates };
}

// ─── Scrape de UMA divisão (v2tid) ──────────────────────────────────────────
async function scrapeDivision(v2tid, label, opts = {}) {
  const { skipScorecards = false } = opts;
  const lb = await scrapeLeaderboard(v2tid, opts);
  console.log(`   ━ ${label} — ${lb.players.length} jogadores · ${lb.nRounds} rondas (v2tid ${v2tid})`);

  // Scorecards
  if (!skipScorecards) {
    let done = 0;
    for (let i = 0; i < lb.players.length; i++) {
      const p = lb.players[i];
      if (!p.detailId) { p.rounds = []; continue; }
      process.stdout.write(`\r     [${String(i + 1).padStart(3)}/${lb.players.length}] ${p.name.padEnd(26).slice(0, 26)}`);
      try {
        const { rounds: parsed, profileId, flagCountry } = await fetchScorecard(p.detailId);
        if (profileId) p.profileId = profileId;
        // Corrige só o fallback "US" do inferCountry com a bandeira real do
        // detail page (não sobrepõe países já resolvidos por afiliação).
        if (flagCountry && (p.country === 'US' || p.country == null)) p.country = flagCountry;
        if (parsed.length) {
          parsed.sort((a, b) => dateKey(a.date) - dateKey(b.date));
          // A chave de consenso distingue o nine jogado: numa divisão de 9
          // buracos o front e o back do MESMO campo têm pares diferentes.
          p.rounds = parsed.map((r, idx) => ({
            day: idx + 1, scores: r.scores, gross: r.gross, date: r.date, course: r.course, pars: r.par,
            ...(r.scores.length === 9 ? { startingHole: r.startingHole } : {}),
            _ck: courseKey(r.course) + (r.scores.length === 9 ? (r.startingHole === 10 ? '|b9' : '|f9') : ''),
          }));
          done++;
        } else { p.rounds = []; }
      } catch { p.rounds = []; }
      await sleep(DELAY_MS);
    }
    process.stdout.write('\n');
    console.log(`     ✓ ${done}/${lb.players.length} scorecards`);
  }

  // Enriquecimento por ficha de jogador (DOB/clube) — só quando pedido e há
  // profileId (ex: FMG México). Um fetch por jogador; guarda dob/club/gradYear.
  if (opts.profiles) {
    let nDob = 0;
    for (let i = 0; i < lb.players.length; i++) {
      const p = lb.players[i];
      if (!p.profileId) continue;
      process.stdout.write(`\r     [dob ${i + 1}/${lb.players.length}] ${p.name.padEnd(26).slice(0, 26)}`);
      try {
        const prof = await fetchProfile(p.profileId);
        if (prof.dob) { p.dob = prof.dob; nDob++; }
        if (prof.club) p.club = prof.club;
        if (prof.gradYear) p.gradYear = prof.gradYear;
      } catch { /* perfil indisponível */ }
      await sleep(DELAY_MS);
    }
    process.stdout.write('\n');
    console.log(`     ✓ ${nDob}/${lb.players.length} DOBs`);
  }

  // Consenso de par por campo (moda por buraco) a partir de todas as rondas.
  const courseNames = new Set();
  const byCourse = new Map(); // ck → { count, votes[nHoles] }
  for (const p of lb.players) for (const r of (p.rounds || [])) {
    if (r.course) courseNames.add(r.course);
    const nH = r.pars ? r.pars.length : 0;
    if (nH !== 18 && nH !== 9) continue;   // 9 = divisões de 9 buracos (CoC Under 9)
    const ck = r._ck || courseKey(r.course);
    if (!byCourse.has(ck)) byCourse.set(ck, { count: 0, votes: Array.from({ length: nH }, () => ({})) });
    const rec = byCourse.get(ck);
    if (rec.votes.length !== nH) continue;
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
  return { division, name: lb.name, year: lb.year, courseNames: [...courseNames], roundDates: lb.roundDates || [] };
}

// ─── Scrape completo de uma edição (várias divisões) ────────────────────────
async function scrapeEdition(ed, opts = {}) {
  console.log(`\n${'═'.repeat(60)}`);
  const divSpecs = ed.divisions || (ed.v2tid ? [{ label: 'Overall', v2tid: ed.v2tid }] : []);
  console.log(`🏌️  ${ed.name || 'FSGA'} — ${divSpecs.length} divisão(ões)`);
  const divisions = [];
  const courseNames = new Set();
  const allDates = [];
  let name = ed.name || null, year = ed.year || null;
  for (const d of divSpecs) {
    const res = await scrapeDivision(d.v2tid, d.label, opts);
    divisions.push(res.division);
    res.courseNames.forEach((c) => courseNames.add(c));
    allDates.push(...(res.roundDates || []));
    if (!name) name = res.name;
    if (!year) year = res.year;
  }
  // startDate/endDate do evento = min/max das datas de ronda de TODAS as
  // divisões (ISO ordena lexicograficamente). O catálogo MAJOR usa-os directos.
  allDates.sort();
  return {
    tournament: name,
    year,
    ...(allDates.length ? { startDate: allDates[0], endDate: allDates[allDates.length - 1] } : {}),
    source: `${GG}/v2tournaments/${divSpecs[0].v2tid}`,
    course: courseNamesLabel([...courseNames]),
    divisions,
    scrapedAt: new Date().toISOString(),
  };
}

// "Cabot Citrus Farms - Karoo Course (…)" + "… - Roost (…)" → "Cabot Citrus Farms (Karoo & Roost)"
function courseNamesLabel(courseNames) {
  if (!courseNames.length) return null;
  // Campos REALMENTE diferentes (CoC: "Faldo - World Championship" +
  // "Castle Hume - World Championship") → listar os dois, não só o primeiro.
  const bases = [...new Set(courseNames.map((c) => c.replace(/\([^)]*\)/g, '').split(' - ')[0].trim()).filter(Boolean))];
  if (bases.length > 1) return bases.join(' & ');
  // ⚠ Tirar os parênteses ANTES do split (mesma ordem da linha `bases`): em
  // "Porters Park (Reid Trophy - Men)" o split primeiro cortava a meio do
  // parêntese e o campo saía "Porters Park (Reid Trophy".
  const base = bases[0] || courseNames[0].replace(/\([^)]*\)/g, '').trim();
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
module.exports = { parseScorecard, scrapeLeaderboard, scrapeDivision, scrapeEdition, courseKey, dateKey, ggGet, courseNamesLabel, fetchProfile, inferCountry, normalizeName, GG };
