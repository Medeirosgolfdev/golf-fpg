#!/usr/bin/env node
// scrape-future-masters.js — Future Masters Golf (GolfGenius, Node puro, sem Playwright)
//
// Pipeline por age group:
//   1. GET /pages/{pageId}   → extrai leagueId + par via course_analytics widget
//   2. GET /leagues/{lid}/widgets/tournament_results?page_id={pid} → extrai v2tid
//   3. GET /v2tournaments/{v2tid}  → leaderboard completo (jogadores + rondas)
//   4. GET /tournaments2/details/{id}?round_index={n} → scorecard buraco-a-buraco por jogador/ronda
//
// Par: endpoint course_analytics → forms course_statistics_* → POST → linhas hole/meters/par/SI
//   (mesmo padrão do scrape-england-golf.js, adaptado para Node puro sem Playwright)
//
// Checkpoint: grava após cada age group completo (leaderboard + scorecards).
//   Próxima corrida detecta age groups já feitos e salta-os.
//   --force-rescrape     : re-scrape tudo mesmo que já exista
//   --scorecards-only    : só buscar scorecards em falta (usa JSON existente)
//   --skip-scorecards    : só leaderboard, sem scorecards
//
// Uso:
//   node scripts/scrape-future-masters.js            # todas as épocas
//   node scripts/scrape-future-masters.js --year 2025
//   node scripts/scrape-future-masters.js --year 2024 --year 2025
//   node scripts/scrape-future-masters.js --year 2025 --scorecards-only
//   node scripts/scrape-future-masters.js --year 2025 --force-rescrape
//
// Output: public/data/ftm_fm_{year}.json

'use strict';
const fs   = require('fs');
const path = require('path');

// ─── Edições conhecidas ────────────────────────────────────────────────────
// Cada age group pode ser:
//   • uma string = pageId da página /pages/{id} (resolve league+v2tid+par automaticamente)
//   • um objecto { v2tid, leagueId?, pageId? } = quando só se tem o v2tid
//     (capturado do Network). ⚠ Sem leagueId NEM pageId, o par fica indisponível
//     (o course_analytics precisa do leagueId). Preencher pageId OU leagueId para ter par.
//   • null = sem dados publicados para esse age group
const EDITIONS = [
  {
    year: 2026,
    // pageIds obtidos do site oficial futuremastersgolf.com/Scoring/Age-Group/*
    // (2026-06-22). Resolvem league + v2tid + par/metros (course_analytics)
    // automaticamente. Os 4 escalões partilham a liga 12683907791899867163,
    // distinguidos pelo page_id. v2tids correspondentes (referência): 10U
    // 12819312035821008950 · 13-14 12819272936217131039 · 15-18 12819314883820533817.
    ageGroups: {
      '10 and Under': '12683728656330143910',
      '11 & 12':      '12683907823877241012',
      '13 & 14':      '12683915475898349755',
      '15-18':        '12683921987974740162',
    },
  },
  {
    year: 2025,
    ageGroups: {
      '10 and Under': '11614021115210381552',
      '11 & 12':      '11614029744437213430',
      '13 & 14':      '11614042080589920508',
      '15-18':        '11746921304647809384',
    },
  },
  {
    year: 2024,
    ageGroups: {
      '10 and Under': '10692455047448508598',
      '11 & 12':      '10694513796971509989',
      '13 & 14':      '10694529218387130603',
      '15-18':        '10694530206800034033',
    },
  },
  {
    year: 2023,
    ageGroups: {
      '10 and Under': null,
      '11 & 12':      '9624679156293843157',
      '13 & 14':      '9624724354650618086',
      '15-18':        null,
    },
  },
  {
    year: 2022,
    ageGroups: {
      '10 and Under': '8561463343989143977',
      '11 & 12':      '8561588945912084911',
      '13 & 14':      '8564004114403440683',
      '15-18':        '8564053247386466353',
    },
  },
  {
    year: 2021,
    ageGroups: {
      '10 and Under': '7505679327204227089',
      '11 & 12':      '7505776608347699230',
      '13 & 14':      '7505875070909167652',
      '15-18':        '7505953122578085930',
    },
  },
  {
    year: 2019,
    ageGroups: {
      '10 and Under': '5404589055734200496',
      '11 & 12':      null,
      '13 & 14':      '5404293261370079377',
      '15-18':        null,
    },
  },
];

const GG_BASE = 'https://www.golfgenius.com';

// ─── HTTP helpers ──────────────────────────────────────────────────────────

const BASE_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

let _cookie = '';

async function warmSession() {
  if (_cookie) return;
  const r = await fetch(`${GG_BASE}/`, { headers: BASE_HEADERS });
  const sc = r.headers.get('set-cookie') || '';
  _cookie = sc.split(/,(?=\s*\w+=)/).map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

function commonHeaders(extra = {}) {
  const h = { ...BASE_HEADERS, ...extra };
  if (_cookie) h['Cookie'] = _cookie;
  return h;
}

async function httpGet(url) {
  await warmSession();
  const r = await fetch(url, { headers: commonHeaders({ Accept: 'text/html,application/xhtml+xml' }) });
  if (!r.ok) throw new Error(`HTTP ${r.status} GET ${url}`);
  return r.text();
}

async function httpGetJson(url) {
  await warmSession();
  const r = await fetch(url, { headers: commonHeaders({ Accept: 'application/json' }) });
  if (!r.ok) throw new Error(`HTTP ${r.status} GET ${url}`);
  return r.json();
}

async function httpPost(url, formData) {
  await warmSession();
  const body = new URLSearchParams(formData).toString();
  const r = await fetch(url, {
    method:  'POST',
    headers: commonHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept':       'text/html,application/xhtml+xml',
    }),
    body,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} POST ${url}`);
  return r.text();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Escrita atómica ───────────────────────────────────────────────────────

function writeJsonAtomic(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

// Par do Dothan Country Club (18 buracos) — IDÊNTICO em todos os escalões e em
// todos os anos verificados (2024, 2025). Usado como fallback de PAR quando não
// há leagueId/pageId para correr o course_analytics (ex: 2026 só com v2tid). Os
// metros/SI variam por tee (escalão) → ficam vazios nesse caso; o par não muda.
const DOTHAN_PAR = [4, 4, 3, 5, 3, 4, 4, 4, 4, 5, 3, 4, 3, 4, 4, 4, 4, 4];
const DOTHAN_PAR_TOTAL = DOTHAN_PAR.reduce((a, b) => a + b, 0); // 70

// ─── Descoberta de IDs ─────────────────────────────────────────────────────

// Normaliza o valor de um age group (string pageId | objecto | null) num spec.
function normSpec(v) {
  if (v == null) return null;
  if (typeof v === 'string') return { pageId: v, v2tid: null, leagueId: null };
  return { pageId: v.pageId || null, v2tid: v.v2tid || null, leagueId: v.leagueId || null };
}

// URL pública dos resultados de um escalão (link "Resultados GolfGenius").
function sourceUrlFor(spec, v2tid) {
  if (spec?.pageId) return `${GG_BASE}/pages/${spec.pageId}`;
  return `${GG_BASE}/v2tournaments/${v2tid}?player_stats_for_portal=true`;
}

async function getLeagueId(pageId) {
  const html = await httpGet(`${GG_BASE}/pages/${pageId}`);
  const m = html.match(/\/leagues\/(\d+)/);
  if (!m) throw new Error(`leagueId não encontrado na página ${pageId}`);
  return m[1];
}

async function getV2Tid(leagueId, pageId) {
  const html = await httpGet(
    `${GG_BASE}/leagues/${leagueId}/widgets/tournament_results?page_id=${pageId}`,
  );
  const m = html.match(/v2tournaments\/(\d+)/);
  if (!m) throw new Error(`v2tid não encontrado (league=${leagueId}, page=${pageId})`);
  return m[1];
}

// ─── Par via course_analytics ──────────────────────────────────────────────
// Padrão descoberto no scrape-england-golf.js:
//   GET /leagues/{lid}/widgets/course_analytics?shared=false
//   → HTML com <form id="course_statistics_{eId}_{cId}_{tId}" action="...">
//   → POST a cada form → linhas: cells[0]=buraco, cells[1]=metros, cells[2]=par, cells[4]=SI

async function fetchCourseStats(leagueId) {
  let html;
  try {
    html = await httpGet(`${GG_BASE}/leagues/${leagueId}/widgets/course_analytics?shared=false`);
  } catch (e) {
    console.log(`      course_analytics falhou: ${e.message}`);
    return null;
  }

  // Encontrar todos os forms course_statistics_*
  const formRe = /<form[^>]*id="(course_statistics_[^"]+)"[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g;
  let fm;
  const forms = [];
  while ((fm = formRe.exec(html)) !== null) {
    const inputs = {};
    const inputRe = /<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g;
    let inp;
    while ((inp = inputRe.exec(fm[3])) !== null) inputs[inp[1]] = inp[2];
    const action = fm[2].startsWith('http') ? fm[2] : `${GG_BASE}${fm[2]}`;
    forms.push({ id: fm[1], action, inputs });
  }

  if (forms.length === 0) {
    console.log('      course_analytics: nenhum form course_statistics encontrado');
    return null;
  }

  console.log(`      course_analytics: ${forms.length} form(s) encontrado(s)`);

  // POST ao primeiro form (ou ao que tiver mais buracos)
  let best = null;
  for (const form of forms.slice(0, 4)) { // no máximo 4 tees
    try {
      const respHtml = await httpPost(form.action, form.inputs);
      await sleep(200);

      const rows = [];
      const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
      let tr;
      while ((tr = trRe.exec(respHtml)) !== null) {
        const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g;
        const cells = [];
        let c;
        while ((c = cellRe.exec(tr[1])) !== null)
          cells.push(c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
        const filtered = cells.filter(x => x);
        // Linha válida: cells[0]=nº buraco (1-18), cells[2]=par (3-5)
        if (filtered.length >= 3 && /^\d+$/.test(filtered[0]) && /^[345]$/.test(filtered[2])) {
          // ⚠ O course_analytics do Dothan CC (curso americano) devolve a
          // distância em JARDAS — converter para metros (×0.9144), como em todos
          // os outros ficheiros do projecto. Sem isto, a linha de distância
          // aparecia em yards rotulada como metros.
          const yards  = parseFloat(filtered[1]) || 0;
          const meters = Math.round(yards * 0.9144);
          const si     = parseInt(filtered[4] || filtered[3] || '0', 10) || 0;
          rows.push({ hole: +filtered[0], meters, par: +filtered[2], si });
        }
      }

      if (rows.length >= 9) {
        rows.sort((a, b) => a.hole - b.hole);
        const par    = rows.map(r => r.par);
        const meters = rows.map(r => r.meters);
        const si     = rows.map(r => r.si);
        const result = {
          par, meters, si,
          parTotal:    par.reduce((a, b) => a + b, 0),
          metersTotal: meters.reduce((a, b) => a + b, 0),
        };
        if (!best || par.length > best.par.length) best = result;
        if (par.length === 18) break; // já temos 18 buracos, não precisamos de mais tees
      }
    } catch (e) {
      console.log(`      form ${form.id}: ${e.message}`);
    }
  }

  if (best) {
    console.log(`      par: [${best.par.join(',')}] total=${best.parTotal} (${best.par.length}B)`);
  }
  return best;
}

// ─── Normalização de nomes ─────────────────────────────────────────────────

function normalizeName(raw) {
  if (!raw) return raw;
  const comma = raw.indexOf(', ');
  if (comma > 0) return raw.slice(comma + 2) + ' ' + raw.slice(0, comma);
  return raw;
}

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
  'WI','WY','DC',
]);

const COUNTRY_MAP = {
  'Canada':'CA','Thailand':'TH','Mexico':'MX','South Korea':'KR','Korea':'KR',
  'Japan':'JP','Australia':'AU','England':'GB-ENG','Scotland':'GB-SCT','Wales':'GB-WLS',
  'France':'FR','Germany':'DE','Spain':'ES','Italy':'IT','Sweden':'SE','Norway':'NO',
  'Denmark':'DK','Finland':'FI','Netherlands':'NL','Belgium':'BE','Switzerland':'CH',
  'Austria':'AT','Portugal':'PT','China':'CN','Taiwan':'TW','India':'IN','Brazil':'BR',
  'Argentina':'AR','Colombia':'CO','Venezuela':'VE','Philippines':'PH','Indonesia':'ID',
  'Malaysia':'MY','Singapore':'SG','New Zealand':'NZ','South Africa':'ZA',
  'Puerto Rico':'PR','Bahamas':'BS','Trinidad':'TT','Jamaica':'JM',
  'Dominican Republic':'DO','Chile':'CL','Peru':'PE','Uruguay':'UY',
  'Czech Republic':'CZ','Poland':'PL','Hungary':'HU','Romania':'RO',
  'Turkey':'TR','Israel':'IL','United Kingdom':'GB',
};

function inferCountry(affiliation) {
  if (!affiliation) return 'US';
  const parts = affiliation.split(', ');
  if (parts.length < 2) return 'US';
  const last = parts[parts.length - 1].trim();
  if (US_STATES.has(last)) return 'US';
  return COUNTRY_MAP[last] || last;
}

function parseToPar(str) {
  if (!str || str === '-' || str === 'NS') return null;
  if (str === 'E') return 0;
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}

function parseGross(str) {
  if (!str || str === '-' || str === 'NS' || str === '') return null;
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}

// ─── Parse de scorecard (HTML bruto de tournaments2/details) ──────────────
// ⚠ O detail page do Future Masters mete TODAS as rondas numa só <table
//   class="detail_table">, cada uma precedida de uma <tr class="header_row">
//   com a data. Os mais novos jogam 9 buracos: um dia o FRONT-9 (cells 1-9
//   preenchidas, 10-18 vazias), outro dia o BACK-9 (cells 11-19 preenchidas).
// Layout 18H:       [label, h1-h9, Out, h10-h18, In, Total] = 22 cols
// Layout 9H front:  cells 1-9 preenchidas, 11-19 vazias  (22 cols ou 11 cols)
// Layout 9H back:   cells 11-19 preenchidas, 1-9 vazias  (startingHole=10)

function parseScorecard(html) {
  const rounds = [];
  const tableRe = /<table[^>]+class=["'][^"']*detail_table[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRe.exec(html)) !== null) {
    const tableHtml = tableMatch[0];

    // Data/campo corrente — actualizado a cada header_row encontrada, para que
    // cada ronda dentro da MESMA tabela receba a sua própria data.
    let curDate = '', curCourse = '';

    const rowRe = /<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/gi;
    let rm;
    while ((rm = rowRe.exec(tableHtml)) !== null) {
      const rowHtml = rm[0];

      // header_row → actualiza data/campo correntes e segue
      if (/class=["'][^"']*header_row[^"']*["']/.test(rowHtml)) {
        const txt = rowHtml.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        const dm  = txt.match(/([A-Za-z]+,\s+[A-Za-z]+\s+\d+)/);
        if (dm) {
          curDate = dm[1].trim();
          curCourse = txt.slice(dm.index + dm[0].length).trim();
        }
        continue;
      }

      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells  = [];
      let c;
      while ((c = cellRe.exec(rowHtml)) !== null)
        cells.push(c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());

      if (cells.length < 11) continue;

      // Ignorar linhas de par/yards/SI (não são scores de jogador)
      const label = (cells[0] || '').toLowerCase().trim();
      if (/^(par|yards?|yds?|metres?|meters?|si|hdcp|hcp|stroke index)$/.test(label)) continue;

      // A célula do jogador (cells[0]) pode trazer a data ("Mon, June 23 - Li, Ethan").
      const rowDateMatch = cells[0].match(/([A-Za-z]+,\s+[A-Za-z]+\s+\d+)/);
      const rowDate      = rowDateMatch ? rowDateMatch[1].trim() : curDate;
      const course       = curCourse;

      const front9 = [];
      for (let i = 1; i <= 9; i++) { const n = parseInt(cells[i], 10); if (!isNaN(n) && n >= 1 && n <= 15) front9.push(n); }

      if (cells.length >= 22) {
        // Back-9: cells 11-19
        const back9 = [];
        for (let i = 11; i <= 19; i++) { const n = parseInt(cells[i], 10); if (!isNaN(n) && n >= 1 && n <= 15) back9.push(n); }

        if (front9.length >= 9 && back9.length >= 9) {
          // 18 buracos
          const f9    = parseInt(cells[10], 10) || front9.reduce((a, b) => a + b, 0);
          const b9    = parseInt(cells[20], 10) || back9.reduce((a, b) => a + b, 0);
          const gross = parseInt(cells[21], 10) || f9 + b9;
          rounds.push({ date: rowDate, course, scores: [...front9, ...back9], f9, b9, gross });
          continue;
        }
        if (back9.length >= 9) {
          // 9 buracos BACK nine (começa no buraco 10)
          const gross = parseInt(cells[20], 10) || back9.reduce((a, b) => a + b, 0);
          rounds.push({ date: rowDate, course, startingHole: 10, scores: back9, gross });
          continue;
        }
        if (front9.length >= 9) {
          // 9 buracos FRONT nine (linha de 22 células mas só a frente preenchida)
          const gross = parseInt(cells[10], 10) || front9.reduce((a, b) => a + b, 0);
          rounds.push({ date: rowDate, course, startingHole: 1, scores: front9, gross });
          continue;
        }
      }

      // 9 buracos front nine numa tabela estreita: [label, h1-h9, Out]
      if (cells.length >= 11 && cells.length < 22 && front9.length >= 9) {
        const gross = parseInt(cells[10], 10) || front9.reduce((a, b) => a + b, 0);
        rounds.push({ date: rowDate, course, startingHole: 1, scores: front9, gross });
      }
    }
  }

  return rounds;
}

// ─── Fetch scorecard de um jogador ────────────────────────────────────────
// ⚠ O parâmetro round_index é IGNORADO pelo servidor — o detail page devolve
//   SEMPRE todas as rondas do jogador na mesma tabela (ver parseScorecard).
//   Por isso basta UM fetch por jogador.

async function fetchPlayerScorecard(pageId, detailId) {
  const url = `${GG_BASE}/tournaments2/details/${detailId}?player_stats_for_portal=true`;
  const r   = await fetch(url, {
    headers: commonHeaders({
      Accept:  'text/html,application/xhtml+xml',
      Referer: pageId ? `${GG_BASE}/pages/${pageId}` : `${GG_BASE}/`,
    }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseScorecard(await r.text());
}

// Ordenação cronológica de datas tipo "Mon, June 23" / "Sat, June 28".
const FM_MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
function fmDateKey(d) {
  if (!d) return 0;
  const m = d.replace(/^[A-Za-z]+,\s*/, '').trim().match(/([A-Za-z]+)\s+(\d+)/);
  if (!m) return 0;
  return (FM_MONTHS[m[1].toLowerCase()] || 0) * 100 + (parseInt(m[2], 10) || 0);
}

// ─── Scrape leaderboard de um age group via v2 JSON API ───────────────────

async function scrapeLeaderboard(spec, divisionName) {
  let leagueId = spec.leagueId || null;
  let v2tid    = spec.v2tid || null;

  // Resolver o que faltar a partir do pageId (quando disponível).
  if (!leagueId && spec.pageId) { leagueId = await getLeagueId(spec.pageId); await sleep(350); }
  if (!v2tid) {
    if (!leagueId) throw new Error(`sem v2tid nem pageId para ${divisionName}`);
    v2tid = await getV2Tid(leagueId, spec.pageId); await sleep(350);
  }

  const data  = await httpGetJson(`${GG_BASE}/v2tournaments/${v2tid}`);
  const ev    = data.event;
  const allAggs = (ev.scopes || []).flatMap(s => s.aggregates || []);

  const players = allAggs
    .filter(agg => {
      const d = agg.disposition || '';
      if (d === 'DNS' || d === 'NS') return false;
      if (d === 'WD') return agg.rounds?.some(r => parseGross(r.total) != null);
      return true;
    })
    .map(agg => {
      const rounds = (agg.rounds || []).map((r, i) => ({
        day:    i + 1,
        scores: [],  // preenchido na fase de scorecards
        gross:  parseGross(r.total) ?? 0,
      }));
      const player = {
        pos:      String(agg.position || agg.rank || ''),
        name:     normalizeName(agg.name || ''),
        country:  inferCountry(agg.affiliation || ''),
        location: agg.affiliation || '',
        detailId: agg.id_str,
        toPar:    parseToPar(agg.score),
        total:    parseGross(agg.total),
        roundGross: (agg.rounds || []).map(r => parseGross(r.total)).filter(n => n != null),
        rounds,
      };
      if (agg.disposition) player.disposition = agg.disposition;
      return player;
    })
    .filter(p => p.name && (p.total != null || p.roundGross.length > 0));

  players.sort((a, b) => {
    const pa = parseInt(String(a.pos).replace(/^T/i, ''), 10) || 9999;
    const pb = parseInt(String(b.pos).replace(/^T/i, ''), 10) || 9999;
    return pa - pb || (a.total ?? 999) - (b.total ?? 999);
  });

  const nRounds = ev.rounds?.length || Math.max(...players.map(p => p.rounds.length), 0);
  console.log(`    → ${players.length} jogadores, ${nRounds} ronda(s) (v2tid: ${v2tid})`);

  return { leagueId, v2tid, players };
}

// ─── Fetch scorecards para todos os jogadores de uma divisão ─────────────

async function enrichScorecards(division, pageId, skipIfPresent = true) {
  const needsFetch = division.players.filter(p =>
    p.detailId &&
    p.rounds.length > 0 &&
    (!skipIfPresent || !p.rounds.some(r => r.scores && r.scores.length > 0)),
  );

  if (needsFetch.length === 0) {
    console.log(`    ${division.division}: scorecards já presentes`);
    return;
  }

  const nR = needsFetch[0]?.rounds.length || 1;
  console.log(`    ${division.division}: scorecards de ${needsFetch.length}/${division.players.length} jogadores (${nR}R)…`);

  let done = 0, skipped = 0, errors = 0;

  for (let i = 0; i < needsFetch.length; i++) {
    const p = needsFetch[i];

    try {
      // UM fetch devolve TODAS as rondas do jogador (o servidor ignora
      // round_index). Reconstruímos p.rounds a partir dos scorecards reais,
      // ordenados cronologicamente (R1 = data mais antiga). Isto corrige (a) o
      // bug de rondas duplicadas (antes lia-se sempre a 1ª) e (b) a ordem
      // errada do leaderboard v2 (ev.rounds vem como R3,R1,R2).
      const parsed = await fetchPlayerScorecard(pageId, p.detailId);

      if (parsed.length > 0) {
        parsed.sort((a, b) => fmDateKey(a.date) - fmDateKey(b.date));
        p.rounds = parsed.map((rnd, idx) => {
          const r = { day: idx + 1, scores: rnd.scores || [], gross: rnd.gross };
          if (rnd.date)         r.date = rnd.date;
          if (rnd.course)       r.course = rnd.course;
          if (rnd.f9   != null) r.f9 = rnd.f9;
          if (rnd.b9   != null) r.b9 = rnd.b9;
          if (rnd.startingHole) r.startingHole = rnd.startingHole;
          return r;
        });
        done++;
      } else {
        skipped++;
      }
    } catch (e) {
      errors++;
      if (errors <= 5) console.warn(`      ✗ ${p.name}: ${e.message}`);
      skipped++;
    }

    if ((i + 1) % 50 === 0) console.log(`      ${i + 1}/${needsFetch.length}…`);
    await sleep(400);
  }

  console.log(`    ${division.division}: ✓ ${done} OK, ${skipped} sem scores, ${errors} erros`);
}

// ─── Scrape completo de um age group (leaderboard + par + scorecards) ─────

async function scrapeAgeGroup(spec, divisionName, opts = {}) {
  const { skipScorecards = false, skipIfPresent = true } = opts;

  // 1. Leaderboard
  const { leagueId, v2tid, players } = await scrapeLeaderboard(spec, divisionName);

  // URL pública dos resultados deste escalão (link "Resultados GolfGenius" na UI).
  const source = sourceUrlFor(spec, v2tid);

  const division = { division: divisionName, source, leagueId, v2tid, players };

  // 2. Par via course_analytics (precisa de leagueId E de o campo já estar
  //    configurado no GolfGenius). Fallback para o par conhecido do Dothan CC.
  let stats = null;
  if (leagueId) {
    console.log(`    a buscar par via course_analytics…`);
    await sleep(300);
    stats = await fetchCourseStats(leagueId);
  }
  if (stats) {
    division.par      = stats.par;
    division.si       = stats.si;
    division.meters   = stats.meters;
    division.parTotal = stats.parTotal;
  } else {
    // Sem course_analytics (campo ainda não configurado, ex: torneio a arrancar).
    // Usar o par conhecido do Dothan CC (estável entre anos). Metros/SI ficam
    // por preencher (variam por tee) — re-correr quando o campo for publicado.
    division.par      = [...DOTHAN_PAR];
    division.parTotal = DOTHAN_PAR_TOTAL;
    console.log(`    ⚠ course_analytics indisponível → par via fallback Dothan CC (metros/SI em falta); re-correr quando publicado`);
  }

  // 3. Scorecards
  if (!skipScorecards && players.length > 0) {
    await enrichScorecards(division, spec.pageId, skipIfPresent);
  }

  return division;
}

// ─── Scrape de uma época completa, com checkpoint por age group ───────────

async function scrapeYear(year, ageGroups, opts = {}) {
  const { skipScorecards = false, scorecardsOnly = false, forceRescrape = false } = opts;

  const outPath = path.join(__dirname, '..', 'public', 'data', `ftm_fm_${year}.json`);

  // Carregar checkpoint existente
  let result = null;
  if (fs.existsSync(outPath)) {
    try {
      result = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      console.log(`  Checkpoint existente: ${result.divisions?.length || 0} age group(s) já gravados`);
    } catch (e) {
      console.warn(`  ⚠ Erro ao ler checkpoint: ${e.message} — começa do zero`);
    }
  }

  if (!result) {
    result = {
      tournament: 'Future Masters Golf',
      year,
      course:     'Dothan Country Club',
      scrapedAt:  new Date().toISOString(),
      divisions:  [],
    };
  }

  console.log(`\n=== ${year} ===`);

  for (const [group, rawSpec] of Object.entries(ageGroups)) {
    const spec = normSpec(rawSpec);
    if (!spec || (!spec.pageId && !spec.v2tid)) {
      console.log(`  ${group}: sem page ID / v2tid — ignorado`);
      continue;
    }

    const existingIdx = (result.divisions || []).findIndex(d => d.division === group);
    const existing    = existingIdx >= 0 ? result.divisions[existingIdx] : null;

    // Decidir o que fazer com este age group
    if (scorecardsOnly) {
      if (!existing) {
        console.log(`  ${group}: sem dados existentes em modo scorecards-only — ignorado`);
        continue;
      }
      console.log(`\n  ${group} (scorecards em falta)…`);
      if (!existing.source) existing.source = sourceUrlFor(spec, existing.v2tid);
      await enrichScorecards(existing, spec.pageId, true);

      // Actualizar par se não tiver
      if (!existing.par) {
        const stats = existing.leagueId ? (console.log(`    a buscar par…`), await fetchCourseStats(existing.leagueId)) : null;
        if (stats) {
          existing.par      = stats.par;
          existing.si       = stats.si;
          existing.meters   = stats.meters;
          existing.parTotal = stats.parTotal;
        } else {
          existing.par      = [...DOTHAN_PAR];
          existing.parTotal = DOTHAN_PAR_TOTAL;
        }
      }

      result.divisions[existingIdx] = existing;
      result.scrapedAt = new Date().toISOString();
      writeJsonAtomic(outPath, result);
      console.log(`    💾 checkpoint gravado`);
      await sleep(500);
      continue;
    }

    if (existing && !forceRescrape) {
      const withScores = existing.players?.filter(p => p.rounds?.some(r => r.scores?.length > 0)).length || 0;
      const total      = existing.players?.length || 0;

      if (withScores === total && total > 0 && existing.par) {
        console.log(`  ${group}: ✓ já completo (${total}j, par OK) — a saltar`);
        continue;
      }

      // Tem dados mas pode faltar scorecards ou par
      console.log(`\n  ${group}: checkpoint parcial (${withScores}/${total} scorecards, par=${existing.par ? 'OK' : 'FALTA'}) — a completar…`);

      if (!existing.source) existing.source = sourceUrlFor(spec, existing.v2tid);

      if (!existing.par) {
        const stats = existing.leagueId ? await fetchCourseStats(existing.leagueId) : null;
        if (stats) {
          existing.par      = stats.par;
          existing.si       = stats.si;
          existing.meters   = stats.meters;
          existing.parTotal = stats.parTotal;
        } else {
          existing.par      = [...DOTHAN_PAR];
          existing.parTotal = DOTHAN_PAR_TOTAL;
        }
      }

      if (!skipScorecards) await enrichScorecards(existing, spec.pageId, true);

      result.divisions[existingIdx] = existing;
      result.scrapedAt = new Date().toISOString();
      writeJsonAtomic(outPath, result);
      console.log(`    💾 checkpoint gravado`);
      await sleep(500);
      continue;
    }

    // Scrape completo do age group
    console.log(`\n  ${group} (${spec.pageId ? `page ${spec.pageId}` : `v2tid ${spec.v2tid}`})…`);
    try {
      const division = await scrapeAgeGroup(spec, group, { skipScorecards, skipIfPresent: true });

      if (division.players.length === 0) {
        console.log(`    ⚠ 0 jogadores — ignorado`);
      } else {
        if (existingIdx >= 0) {
          result.divisions[existingIdx] = division;
        } else {
          result.divisions.push(division);
        }

        result.scrapedAt = new Date().toISOString();
        writeJsonAtomic(outPath, result);

        const withSc = division.players.filter(p => p.rounds.some(r => r.scores?.length > 0)).length;
        console.log(`    💾 checkpoint gravado: ${division.players.length}j, ${withSc} scorecards, par=${division.par ? `[${division.par.join(',')}]` : 'N/A'}`);
      }
    } catch (e) {
      console.error(`    ✗ ERRO em ${group}: ${e.message}`);
      // Não grava checkpoint — o age group ficou incompleto
    }

    await sleep(700);
  }

  return result;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  const skipScorecards = args.includes('--skip-scorecards');
  const scorecardsOnly = args.includes('--scorecards-only');
  const forceRescrape  = args.includes('--force-rescrape');

  const yearArgs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--year' && args[i + 1]) yearArgs.push(parseInt(args[++i], 10));
  }

  const toScrape = yearArgs.length > 0
    ? EDITIONS.filter(e => yearArgs.includes(e.year))
    : EDITIONS;

  if (toScrape.length === 0) {
    console.error('Nenhuma época encontrada para os anos especificados.');
    process.exit(1);
  }

  if (skipScorecards)  console.log('Modo: só leaderboard (sem scorecards)');
  if (scorecardsOnly)  console.log('Modo: só scorecards em falta');
  if (forceRescrape)   console.log('Modo: re-scrape forçado (ignora checkpoint)');

  for (const { year, ageGroups } of toScrape) {
    const result = await scrapeYear(year, ageGroups, { skipScorecards, scorecardsOnly, forceRescrape });

    if (result?.divisions?.length > 0) {
      const summary = result.divisions.map(d => {
        const sc = d.players?.filter(p => p.rounds?.some(r => r.scores?.length > 0)).length || 0;
        return `${d.division}:${d.players?.length || 0}j(${sc}sc,par=${d.par ? d.par.length + 'B' : 'N/A'})`;
      }).join(' | ');
      console.log(`\n✓ ftm_fm_${year}.json  [${summary}]`);
    }
  }

  console.log('\nConcluído.');
}

if (require.main === module) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}

module.exports = { parseScorecard, fetchPlayerScorecard, enrichScorecards, fmDateKey, scrapeLeaderboard, getLeagueId, fetchCourseStats };
