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
const { scrapeEdition, ggGet, GG, dateKey, inferCountry, normalizeName } = require('./scrape-fsga.js');

const OUT = path.join(__dirname, '..', 'public', 'data');

// Slug/nome legível por evento (fallback = slugify do título).
const SLUG_OVERRIDES = [
  // ⚠ O Worlds TEM de vir antes do `uajt`: o regex do Summer National apanha
  // "under armour" e mandaria as duas provas para o mesmo ficheiro.
  { re: /under armour world championship/i,            slug: 'uaworlds', name: 'The Junior Tour Powered by Under Armour — World Championship' },
  { re: /under armour|summer national championship/i, slug: 'uajt', name: 'The Junior Tour Powered by Under Armour — Summer National Championship' },
  { re: /campeonato nacional infantil juvenil/i,       slug: 'mexnacional', name: 'Campeonato Nacional Infantil Juvenil (México)' },
  { re: /champion of champions/i,                      slug: 'coc', name: '“Champion of Champions” World Championship' },
  { re: /reid trophy/i,                                slug: 'reidtrophy', name: 'Reid Trophy (English Boys’ U14 Open Amateur)' },
  { re: /juniors cup/i,                                slug: 'evianjc', name: 'The Amundi Evian Juniors Cup' },
];

// O <title> do GG traz entidades HTML (&#39; nas aspas de 'Champion of Champions').
function decodeEntities(s) {
  return (s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');
}
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
  // ⚠ O rótulo do escalão vem SEMPRE antes de "Round N"/"Final Round"; o campo
  // e a data vêm depois ("Boys 12-14 Final Round - Palmer Course (Sat…").
  // Cortar TUDO a partir de "Round"/"Final Rou…" resolve os três problemas de
  // uma vez: (a) o hífen do escalão "12-14" fica preservado (é antes do corte),
  // (b) a truncatura do GG — "Final Roun", "Round 2 (B9", "Final Round -" — não
  // deixa fantasmas, (c) não é preciso apanhar campo/data em separado.
  // `Rou\w*` cobre "Round"/"Roun"; o número da ronda é opcional (pode estar
  // truncado). Fallback: sem "Round" no label, tira só o " - campo" com espaços.
  let base = label.replace(/\s+(?:final\s+)?rou\w*.*$/i, '');
  if (base === label) base = label.replace(/\s+[-–]\s+.*$/, '');   // sem "Round" → tira " - campo"
  return base.replace(/\s+/g, ' ').trim();
}
function isFinalRound(label) { return /final\s+round/i.test(label); }
function roundNum(label) { const m = label.match(/round\s+(\d+)/i); return m ? +m[1] : (isFinalRound(label) ? 999 : 0); }
// Label que só identifica a RONDA ("Round 3 (Thu, July 23)") — nenhuma divisão.
// ⚠ Tirar os parênteses ANTES de decidir: "Round 1 (Tue, August 4)" não batia
// no regex e cada ronda virava uma DIVISÃO falsa (Reid Trophy 2026, quando o
// GG acrescentou o <select> de rondas a meio da prova — o ficheiro ficou com
// "Round 1"/"Round 2" como escalões, cada um com o leaderboard inteiro).
function isRoundOnlyLabel(label) {
  const noParen = (label || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const base = divisionBase(noParen);
  return !base || /^(final\s+round|round\s+\d+)$/i.test(base);
}

// Divisões que NÃO são o campeonato stroke-play por escalão (scrambles, side
// events, testes) — excluídas por serem 0-rondas e sujarem a apresentação.
// "Nations Cup" (Evian Juniors Cup) = classificação por PAÍS, sem jogadores nem cartões.
function isSideEvent(label) { return /\b(adult|scramble|nassau|prueba|par\s*3|nations\s*cup)\b/i.test(label); }
// Ordena escalões: Boys antes de Girls, idade crescente ("8U"→8, "13-14"→13, WAGR→999).
function divSortKey(label) {
  // Boys/Girls tanto no início ("Boys 13-14") como no fim ("Under 12 Girls").
  const g = /\bboys\b|\bvaronil\b/i.test(label) ? 0 : /\bgirls\b|\bfemenil\b/i.test(label) ? 1 : 2;
  const m = label.match(/\d+/);
  const age = /wagr/i.test(label) ? 999 : (m ? parseInt(m[0], 10) : 998);
  return g * 1000 + age;
}

// ─── Tee sheets (draws reais) ───────────────────────────────────────────────
// ⚠ O widget chama-se **`next_round`** — `tee_times`, `pairings`, `tee_sheet` e
// `tee_sheets` dão todos 404. A página "Tee Sheets" do microsite é anunciada no
// HTML da página de resultados por um input escondido `tee_sheet_button`, por
// isso descobre-se sozinha. Um `<select>` no widget lista as rondas
// (`&round_id=…`); cada uma traz a tabela `by_tee_times_table` com pares
// (hora, jogadores), e cada jogador leva a afiliação e a DIVISÃO — é isso que
// permite dar a cada escalão o seu draw.
//
// Porquê: sem isto o TournamentDetail só mostra draws ESTIMADOS (sintetizados
// do acumulado, e nunca para a R1, que não tem ronda anterior de onde inferir).
const txt = (h) => (h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/\s+/g, ' ').trim();

/**
 * Nome tal como vem no tee sheet → { name, hcp }.
 * A Evian Juniors Cup (microsite francês) escreve "APELIDO Nome (+1.3)": o
 * apelido em maiúsculas À FRENTE e o handicap colado entre parênteses. Sem
 * limpar, o nome do draw nunca casava com o do leaderboard e o miúdo ficava
 * com "(+1.3)" no nome. O "+" é handicap plus → negativo (convenção do
 * JobFile, igual ao GolfBox). Nomes normais ("Xavier Good") passam intactos.
 */
function cleanTeeName(raw) {
  let name = String(raw || '').replace(/\s+/g, ' ').trim();
  let hcp = null;
  const hm = name.match(/\s*\(\s*([+-]?)\s*(\d{1,2}(?:[.,]\d)?)\s*\)\s*$/);
  if (hm) {
    const v = parseFloat(hm[2].replace(',', '.'));
    hcp = hm[1] === '+' ? -v : v;
    name = name.slice(0, hm.index).trim();
  }
  // "SILVA PINTO Margarida" → "Margarida Silva Pinto": só quando há tokens em
  // MAIÚSCULAS à frente E pelo menos um token normal depois.
  const toks = name.split(' ');
  const isUpper = (t) => /\p{Lu}/u.test(t) && t === t.toUpperCase() && t.replace(/[^\p{L}]/gu, '').length >= 2;
  let k = 0;
  while (k < toks.length && isUpper(toks[k])) k++;
  if (k > 0 && k < toks.length && !toks.slice(k).some(isUpper)) {
    const title = (t) => t.toLowerCase().replace(/(^|[-'’\s])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
    name = [...toks.slice(k), ...toks.slice(0, k).map(title)].join(' ');
  }
  return { name, hcp };
}

/**
 * Uma ronda de tee sheet → [{ time, startHole, players:[{name, country, division}] }].
 * Suporta os DOIS layouts de coluna do GG sem assumir a largura do bloco:
 *   - `[Hora, Jogadores]`            (México / CoC / UA)
 *   - `[Hora, Buraco, Jogadores]`    (England Golf — Reid Trophy)
 * Estratégia: localizar as células que contêm `players_portrait` e, para cada
 * uma, ler a HORA (célula com relógio) e o BURACO de saída (célula com só um
 * inteiro) do bloco de células que a antecede. Antes assumia pares fixos (hora,
 * jogadores) e no layout de 3 colunas lia o buraco ("1") como se fosse a hora.
 */
function parseTeeSheet(html) {
  const groups = [];
  const seen = new Set();
  const TIME_RE = /\b\d{1,2}:\d{2}\s*(?:[ap]\.?\s*m\.?)?/i;
  for (const tm of html.matchAll(/<table[^>]*by_tee_times_table[\s\S]*?<\/table>/gi)) {
    for (const rm of tm[0].matchAll(/<tr[^>]*search_rows[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...rm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
      let blockStart = 0;   // início do bloco (hora/buraco) da group corrente
      for (let j = 0; j < cells.length; j++) {
        if (!/players_portrait/.test(cells[j])) continue;
        const prefix = cells.slice(blockStart, j).map((c) => txt(c));
        blockStart = j + 1;
        let time = prefix.find((c) => TIME_RE.test(c)) || prefix.find((c) => /\d/.test(c)) || '';
        const tm2 = time.match(TIME_RE); if (tm2) time = tm2[0].replace(/\s+/g, ' ').trim();
        let startHole = null;
        for (const c of prefix) { const hm = c.match(/^\s*(\d{1,2})\s*$/); if (hm && c !== time) { startHole = +hm[1]; break; } }
        const players = cells[j].split(/players_portrait/).slice(1).map((chunk) => {
          const { name, hcp } = cleanTeeName(txt(chunk.split('<span')[0]).replace(/^'>\s*/, ''));
          const country = txt((chunk.match(/affiliation_portrait'>([\s\S]*?)<\/span>/) || [])[1] || '');
          const division = txt((chunk.match(/answer_text'>([\s\S]*?)<\/div>/) || [])[1] || '');
          return { name, hcp, country: country || null, division: division || null };
        }).filter((p) => p.name);
        if (!players.length || !time) continue;
        // A tabela repete as linhas em variantes hidden-xs/visible-xs.
        const key = `${time}|${startHole}|${players[0].name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        groups.push({ time, startHole, players });
      }
    }
  }
  return groups;
}

/**
 * Tabela "por jogador" do tee sheet (`player_row`: Jogador | Tee Time | Tee |
 * Other Players) → Map<nameKey, tee>. É a ÚNICA fonte do tee de saída quando o
 * `tee_abbr` dos grupos vem vazio (Evian Juniors Cup: White = rapazes, Blue =
 * raparigas — daí o sexo, via `teeDivisions` no scope).
 */
function parsePlayerTees(html) {
  const out = new Map();
  for (const rm of html.matchAll(/<tr[^>]*class='player_row'[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tds = [...rm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    if (tds.length < 3) continue;
    const { name } = cleanTeeName(txt(tds[0].split('<span')[0]));
    const tee = txt(tds[2]);
    if (name && tee && !out.has(nameKey(name))) out.set(nameKey(name), tee);
  }
  return out;
}

/**
 * Roster de presenças — a MESMA página de "tee sheets" serve, em alguns
 * eventos, uma `attending_roster_table` em vez de horas de saída:
 *   <td class='name'><strong>Apelido, Nome</strong><br><i>País</i></td>
 * É a única fonte de NACIONALIDADE quando o leaderboard não traz afiliação
 * (UA Worlds: o v2tournaments vem sem `affiliation` e os 583 jogadores caíam
 * todos em "US", apesar de haver Venezuela, Colômbia, México, GB…).
 * @returns [{ name, country }] com o nome já em "Nome Apelido".
 */
function parseRoster(html) {
  const out = [];
  for (const tm of html.matchAll(/<table[^>]*attending_roster_table[\s\S]*?<\/table>/gi)) {
    for (const cm of tm[0].matchAll(/<td[^>]*class='[^']*name[^']*'[^>]*>([\s\S]*?)<\/td>/gi)) {
      const name = txt((cm[1].match(/<strong>([\s\S]*?)<\/strong>/) || [])[1] || '');
      const country = txt((cm[1].match(/<i>([\s\S]*?)<\/i>/) || [])[1] || '');
      if (name) out.push({ name: normalizeName(name), country: country || null });
    }
  }
  return out;
}

/** Chave de comparação de nomes entre fontes (sem acentos/pontuação). */
const nameKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** "Tue, August  6" (label de ronda do tee sheet) + ano → "2026-08-06".
 *  `anchorIso` (data ISO fiável do v2, quando existe) escolhe o ANO que deixa a
 *  data mais perto da âncora — um evento 30/Dez→02/Jan tem rondas em dois anos
 *  civis e carimbar todas com `year` invertia startDate/endDate. Sem ano nem
 *  âncora (evento no scope antes da R1 abrir), cai no ano corrente. */
const US_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function usDateToIso(label, year, anchorIso) {
  const m = /([a-z]{3})[a-z]*\.?\s+(\d{1,2})/i.exec(label || '');
  if (!m) return null;
  const mo = US_MONTHS[m[1].toLowerCase()];
  if (!mo) return null;
  const y0 = year || (anchorIso ? +anchorIso.slice(0, 4) : new Date().getUTCFullYear());
  const mk = (y) => `${y}-${String(mo).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`;
  if (!anchorIso) return mk(y0);
  let best = null, bestD = Infinity;
  for (const y of [y0 - 1, y0, y0 + 1]) {
    const iso = mk(y);
    const d = Math.abs(new Date(iso) - new Date(anchorIso));
    if (d < bestD) { bestD = d; best = iso; }
  }
  return best;
}

/**
 * Roster da página "List of Players" (widget `players`) → [{ name, club, countryName }].
 * É a ÚNICA fonte de país + clube por jogador em eventos England-Golf: o
 * leaderboard v2 não traz afiliação nenhuma e a tabela é `Handle | Home Club |
 * Country`. Também alimenta o campo pré-torneio (jogadores ainda sem score).
 * Mapeia as colunas pelos rótulos do cabeçalho (não por posição fixa).
 */
async function fetchRoster(lid, rosterPageId) {
  const html = await ggGet(`${GG}/leagues/${lid}/widgets/players?page_id=${rosterPageId}`);
  const th = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => txt(m[1]).toLowerCase());
  // Dois formatos de tabela: England = "Handle | Home Club | Country" (nome numa
  // coluna só); Optimist = "Last Name | First Name | Graduation Year | Country"
  // (nome partido em duas) — juntar First+Last senão o nome nunca casa com o
  // leaderboard e o país fica por aplicar.
  const iLast = th.findIndex((h) => /last\s*name/.test(h));
  const iFirst = th.findIndex((h) => /first\s*name/.test(h));
  const iName = Math.max(0, th.findIndex((h) => /handle|name|player/.test(h)));
  const iClub = th.findIndex((h) => /club/.test(h));
  const iCountry = th.findIndex((h) => /country|nation/.test(h));
  const iGrad = th.findIndex((h) => /grad/.test(h));
  const tbody = (html.match(/<tbody[\s\S]*?<\/tbody>/i) || [null])[0] || html;
  const out = [];
  for (const rm of tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tds = [...rm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => txt(c[1]));
    const name = iLast >= 0 && iFirst >= 0
      ? [tds[iFirst], tds[iLast]].filter(Boolean).join(' ')
      : tds[iName];
    if (!name) continue;
    const grad = iGrad >= 0 ? parseInt(tds[iGrad], 10) : NaN;
    out.push({
      name: normalizeName(name),
      club: iClub >= 0 ? (tds[iClub] || null) : null,
      countryName: iCountry >= 0 ? (tds[iCountry] || null) : null,
      gradYear: Number.isFinite(grad) && grad > 2000 && grad < 2050 ? grad : null,
    });
  }
  return out;
}

/**
 * Draws por DIVISÃO + países por jogador, a partir da página de tee sheets.
 * Os dois vêm do MESMO widget (cada evento publica um ou outro), por isso são
 * lidos numa só passagem.
 * @returns { draws: Map<divisão, {[ronda]: {...}}>, countries: Map<nome, país> }
 */
async function fetchTeeSheets(lid, teePageId) {
  const base = `${GG}/leagues/${lid}/widgets/next_round?page_id=${teePageId}`;
  const first = await ggGet(base);
  const opts = [...first.matchAll(/<option[^>]*value="([^"]*round_id=\d+)"[^>]*>([^<]+)</g)]
    .map((m) => ({ url: m[1].replace(/&amp;/g, '&'), label: decodeEntities(m[2]).trim() }));
  const rounds = opts.length ? opts : [{ url: null, label: 'Round 1' }];
  const byDiv = new Map();
  const countries = new Map();
  // Campo inteiro (nome → {name, country, hcp}) tirado dos grupos — é o que
  // semeia o torneio ANTES de haver leaderboard (modo pré-torneio).
  const field = new Map();
  const tees = new Map();   // nameKey → tee de saída (1.ª ronda em que aparece)
  // Datas de TODAS as rondas competitivas do <select> (ex: "Round 3 (Thu,
  // August  6)") — o v2tournaments só lista as rondas JÁ jogadas, por isso num
  // evento a decorrer o endDate vinha curto (a R3 só existe aqui).
  // ⚠ Escolher o parêntese COM mês: labels tipo "Round 4 (If Necessary) (Sun,
  // June 8)" têm um parêntese descritivo antes da data.
  const MONTH_RX = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
  const roundDateLabels = rounds
    .filter((r) => !/practice/i.test(r.label))
    .map((r) => [...r.label.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]).find((s) => MONTH_RX.test(s)))
    .filter(Boolean);
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    if (/practice/i.test(r.label)) continue;   // draw de ronda de treino não interessa
    const html = r.url ? await ggGet(GG + r.url) : first;
    for (const p of parseRoster(html)) {
      if (p.country && !countries.has(nameKey(p.name))) countries.set(nameKey(p.name), p.country);
    }
    for (const [k, t] of parsePlayerTees(html)) if (!tees.has(k)) tees.set(k, t);
    const groups = parseTeeSheet(html);
    if (!groups.length) { await new Promise((res) => setTimeout(res, 300)); continue; }
    for (const g of groups) for (const p of g.players) {
      const k = nameKey(p.name);
      if (!field.has(k)) field.set(k, { name: p.name, country: p.country, hcp: p.hcp ?? null });
      if (p.country && !countries.has(k)) countries.set(k, p.country);
    }
    const rNum = (r.label.match(/round\s+(\d+)/i) || [, String(i + 1)])[1];
    const date = (r.label.match(/\(([^)]+)\)/) || [])[1] || undefined;
    const mkRound = (gs) => ({
      round: Number(rNum), label: r.label, date,
      groups: gs.map((g) => ({ time: g.time, startHole: g.startHole ?? null, players: g.players.map((p) => ({ name: p.name })) })),
    });
    // Draw completo da ronda sob __ALL__ — fallback p/ eventos de 1 divisão, cujo
    // tee sheet não etiqueta escalão nenhum nos jogadores.
    if (!byDiv.has('__ALL__')) byDiv.set('__ALL__', {});
    byDiv.get('__ALL__')[rNum] = mkRound(groups);
    // Um flight pode juntar escalões diferentes → o grupo entra no draw de
    // TODAS as divisões representadas (é assim que o miúdo vê com quem joga).
    const divs = new Set(groups.flatMap((g) => g.players.map((p) => p.division).filter(Boolean)));
    for (const dv of divs) {
      if (!byDiv.has(dv)) byDiv.set(dv, {});
      byDiv.get(dv)[rNum] = mkRound(groups.filter((g) => g.players.some((p) => p.division === dv)));
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  return { draws: byDiv, countries, roundDateLabels, field, tees };
}

/**
 * Parte uma divisão ÚNICA em escalões pelo tee de saída (`teeDivisions`, ex:
 * { White: 'Boys U14', Blue: 'Girls U14' }) — para provas em que rapazes e
 * raparigas partilham leaderboard e draw e o GG não diz o sexo. Cada jogador
 * leva `tee` e `sex` (tirado do label). As posições são renumeradas DENTRO do
 * escalão pela ordem do leaderboard misto (empate = mesmo total). Os grupos do
 * draw entram no escalão de quem lá joga. Quem não tem tee conhecido fica numa
 * divisão com o label original (nunca se adivinha o sexo).
 */
function splitByTee(out, tees, teeDivisions) {
  if (out.divisions.length !== 1 || !tees.size) return 0;
  const src = out.divisions[0];
  const labelOf = (p) => teeDivisions[tees.get(nameKey(p.name))] || null;
  const labels = [...new Set(Object.values(teeDivisions))];
  const sexOf = (l) => (/\b(boys|rapazes)\b/i.test(l) ? 'M' : /\b(girls|raparigas)\b/i.test(l) ? 'F' : null);
  const posNum = (p) => { const n = parseInt(String(p.pos || '').replace(/^T/i, ''), 10); return Number.isFinite(n) ? n : Infinity; };
  const divs = [];
  for (const label of [...labels, null]) {
    const players = src.players.filter((p) => labelOf(p) === label);
    if (!players.length) continue;
    for (const p of players) {
      const t = tees.get(nameKey(p.name));
      if (t) p.tee = t;
      if (label && sexOf(label)) p.sex = sexOf(label);
    }
    if (players.some((p) => Number.isFinite(posNum(p)))) {
      players.sort((a, b) => posNum(a) - posNum(b));
      const ranked = players.filter((p) => Number.isFinite(posNum(p)));
      ranked.forEach((p, i) => {
        const tie = (q) => q && q.total != null && q.total === p.total;
        let r = i;
        while (r > 0 && tie(ranked[r - 1])) r--;
        const tied = tie(ranked[i - 1]) || tie(ranked[i + 1]);
        p.pos = `${tied ? 'T' : ''}${r + 1}`;
      });
    }
    const names = new Set(players.map((p) => nameKey(p.name)));
    const dv = { ...src, division: label || src.division, players };
    // Tee da divisão = o tee de saída de todos (quando é um só). Metros/CR/slope
    // lidos ANTES da separação vêm do cartão de um jogador do leaderboard misto
    // — só ficam na divisão cujo tee é esse; nas outras limpam-se (e o
    // applyTeeCards corre outra vez depois do split).
    const divTees = [...new Set(players.map((p) => p.tee).filter(Boolean))];
    if (divTees.length === 1 && src.teeName && divTees[0] !== src.teeName) {
      for (const k of ['meters', 'si', 'courseRating', 'slope', 'cardSource']) dv[k] = null;
      dv.teeName = divTees[0];
    } else if (divTees.length === 1 && !dv.teeName) dv.teeName = divTees[0];
    if (src.draws) {
      dv.draws = Object.fromEntries(Object.entries(src.draws).map(([rn, rd]) => [rn, {
        ...rd, groups: rd.groups.filter((g) => g.players.some((q) => names.has(nameKey(q.name)))),
      }]));
    }
    divs.push(dv);
  }
  if (!divs.length) return 0;   // leaderboard vazio → não deixar o ficheiro sem divisões
  out.divisions = divs;
  return divs.length;
}

/**
 * Cartão do TEE de uma volta (metros, par, CR, slope) — o link "expand tee
 * details" do cartão do jogador (`/tournaments2/nets/{id}?event_id=…`) devolve
 * um JS com a linha "White Tee / SLOPE®: 140 / Course Rating™: 72.0 / Campo" e
 * as linhas Meters|Yards e Par. É a ÚNICA fonte de metros por buraco POR TEE:
 * o course_statistics só dá o intervalo entre tees ("346-365").
 * @returns [{ teeName, courseRating, slope, meters[18], par[18] }] (uma por volta)
 */
async function fetchTeeCards(detailId) {
  const sc = await ggGet(`${GG}/tournaments2/details/${detailId}?player_stats_for_portal=true`);
  const links = [...new Set([...sc.matchAll(/href="(\/tournaments2\/nets\/[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&')))];
  const cards = [];
  for (const u of links) {
    const raw = await ggGet(GG + u);
    const h = raw.split('\\n').join('\n').split("\\'").join("'").split('\\/').join('/');
    const hdr = (h.match(/([^\n<>]*?)\s*Tee\s*\/\s*SLOPE[^:]*:\s*([\d.]+)\s*\/\s*Course Rating[^:]*:\s*([\d.]+)/i) || []);
    const cells = (row) => [...row.matchAll(/<td[^>]*>\s*(\d+)\s*<\/td>/g)].map((x) => +x[1]);
    const yRow = (h.match(/yardage_row[\s\S]*?<\/tr>/) || [''])[0];
    const pRow = (h.match(/par_row[\s\S]*?<\/tr>/) || [''])[0];
    const pick18 = (arr) => (arr.length >= 21 ? [...arr.slice(0, 9), ...arr.slice(10, 19)] : null);  // tira Out/In/Total
    let meters = pick18(cells(yRow));
    if (meters && /Yards/i.test(yRow) && !/Meters/i.test(yRow)) meters = meters.map((y) => Math.round(y * 0.9144));
    if (!hdr[1] || !meters) continue;
    // SI: só se o cartão trouxer uma linha de handicap/stroke index (o de 2025
    // da Evian não trazia) e for uma permutação válida de 1..18 que não seja
    // o preenchimento 1..18 seguido.
    const siRow = [...h.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)].map((m) => m[0])
      .find((r) => /tee_data/.test(r) && /(handicap|stroke\s*index|\bS\.?I\.?\b|\bHCP\b)/i.test(r) && !/yardage_row|par_row|SLOPE/i.test(r));
    const siCells = siRow ? cells(siRow) : [];
    const si = siCells.length >= 18 ? (siCells.length >= 21 ? pick18(siCells) : siCells.slice(0, 18)) : null;
    const siOk = si && new Set(si).size === 18 && si.every((v) => v >= 1 && v <= 18) && !si.every((v, i) => v === i + 1);
    cards.push({ teeName: decodeEntities(hdr[1]).trim(), slope: +hdr[2], courseRating: +hdr[3], meters, par: pick18(cells(pRow)), si: siOk ? si : null });
    await new Promise((res) => setTimeout(res, 200));
  }
  return cards;
}

/**
 * Preenche metros/tee/CR/slope de cada divisão a partir dos cartões de tee de
 * DOIS jogadores (o 1.º e o último com cartão). Só aplica se TODAS as voltas
 * lidas derem o mesmo tee e os mesmos metros — divisões com vários campos ou
 * tees (CoC: Faldo + Castle Hume) ficam como estão. Nunca escreve por cima de
 * um valor já preenchido (curado à mão ou vindo de outra fonte).
 */
async function applyTeeCards(out, knownPlaceholders = []) {
  for (const dv of out.divisions) {
    if (dv.meters && dv.courseRating != null) continue;
    const withCard = dv.players.filter((p) => p.detailId && (p.rounds || []).some((r) => (r.scores || []).length));
    const sample = [...new Set([withCard[0], withCard[withCard.length - 1]].filter(Boolean))];
    if (!sample.length) continue;
    let cards = [];
    try { for (const p of sample) cards.push(...await fetchTeeCards(p.detailId)); } catch (e) { console.log(`   ⚠ ${dv.division}: cartão de tee indisponível (${e.message})`); continue; }
    if (!cards.length) continue;
    const sig = (c) => `${c.teeName}|${c.meters.join(',')}|${c.courseRating}|${c.slope}`;
    if (new Set(cards.map(sig)).size !== 1) { console.log(`   ⚠ ${dv.division}: tees diferentes entre voltas/jogadores — metros não aplicados`); continue; }
    const c = cards[0];
    if (!dv.meters) dv.meters = c.meters;
    if (!dv.teeName) dv.teeName = c.teeName;
    if (dv.courseRating == null) dv.courseRating = c.courseRating;
    if (dv.slope == null) dv.slope = c.slope;
    if (!dv.si && c.si) dv.si = c.si;
    dv.cardSource = 'gg-tee-card';
    console.log(`   📐 ${dv.division}: tee ${c.teeName} · ${c.meters.reduce((a, b) => a + b, 0)} m · CR ${c.courseRating} / ${c.slope} · SI ${c.si ? c.si.join(',') : 'não publicado'}`);
  }
  // CR/slope POR OMISSÃO: tees com metros diferentes na mesma prova e todos com
  // a mesma avaliação (Optimist 2026: 4.925 m a 6.338 m, todos 72/144) não são
  // avaliações reais — ficam os metros, sai o CR/slope (senão o SD sai errado).
  const rated = out.divisions.filter((dv) => dv.cardSource === 'gg-tee-card' && dv.meters && dv.courseRating != null);
  const byRating = new Map();
  for (const dv of rated) {
    const k = `${dv.courseRating}/${dv.slope}`;
    if (!byRating.has(k)) byRating.set(k, []);
    byRating.get(k).push(dv);
  }
  const flagged = new Set(out.ggPlaceholderRatings || []);
  for (const [k, dvs] of byRating) {
    const lengths = new Set(dvs.map((dv) => dv.meters.reduce((a, b) => a + b, 0)));
    const known = knownPlaceholders.includes(k);
    if (lengths.size < 2 && !known) continue;
    for (const dv of dvs) { dv.courseRating = null; dv.slope = null; }
    flagged.add(k);
    console.log(known
      ? `   ⚠ CR/slope ${k} (${dvs.map((d) => d.division).join(', ')}) = valor por omissão já detectado numa fase irmã — não aplicado`
      : `   ⚠ CR/slope ${k} igual em ${lengths.size} tees de comprimentos diferentes (${dvs.map((d) => d.division).join(', ')}) — valor por omissão do GG, não aplicado`);
  }
  // Fica registado no ficheiro para as fases irmãs (Optimist 1-3: a fase 3 só
  // tem um tee com cartão e sozinha não o detectava).
  if (flagged.size) out.ggPlaceholderRatings = [...flagged];
}

/** Avaliações por omissão já detectadas noutros ficheiros do mesmo slug/ano (fases irmãs). */
function siblingPlaceholders(slug, year, selfFile) {
  const out = new Set();
  if (!slug || !year) return [];
  if (!/^[a-z0-9]+$/i.test(slug)) return [];   // slugs do scope são só letras/números
  const family = slug.replace(/\d+$/, '');     // optimist1/2/3 → optimist
  const re = new RegExp(`^${family}\\d*_${year}\\.json$`);
  for (const f of fs.readdirSync(OUT)) {
    if (!re.test(f) || path.join(OUT, f) === selfFile) continue;
    try { for (const k of JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')).ggPlaceholderRatings || []) out.add(k); } catch { /* ignora */ }
  }
  return [...out];
}

/** Descobre as divisões (label + v2tid) de uma página GolfGenius. */
async function discoverDivisions(pageUrl, leagueOverride) {
  const pid = (pageUrl.match(/pages\/(\d+)/) || [])[1];
  if (!pid) throw new Error(`URL sem /pages/{id}: ${pageUrl}`);
  const pageHtml = await ggGet(`${GG}/pages/${pid}`);
  const title = decodeEntities(((pageHtml.match(/<title>([^<]*)<\/title>/) || [])[1] || ''))
    .replace(/\s+/g, ' ').replace(/\s*Event\s*::.*$/i, '').trim();
  const lid = leagueOverride || (pageHtml.match(/leagues\/(\d+)/) || [])[1];
  // Página "Tee Sheets" do microsite — normalmente anunciada num input
  // escondido `tee_sheet_button`. ⚠ Em edições mais antigas (CoC 2024) esse
  // input vem VAZIO apesar de a página existir → fallback pelo link da navegação.
  const teePageId = (pageHtml.match(/tee_sheet_button[^>]*value="\/pages\/(\d+)"/) || [])[1]
    || (() => {
      for (const m of pageHtml.matchAll(/<a[^>]+href="[^"]*\/pages\/(\d+)"[^>]*>([\s\S]{0,150}?)<\/a>/g)) {
        // "Tee Sheets" (EN) ou "Départs" (microsites franceses — Evian Juniors Cup).
        if (/tee\s*(sheets?|times)|d[ée]parts/i.test(m[2].replace(/<[^>]+>/g, ' '))) return m[1];
      }
      return null;
    })()
    || null;
  // Página "List of Players" (roster) — link da navegação "List of Players"
  // (England) ou só "Players" (Optimist). Fonte de país + clube por jogador
  // (o leaderboard v2 não traz afiliação nesses eventos).
  const rosterPageId = (() => {
    for (const m of pageHtml.matchAll(/<a[^>]+href="[^"]*\/pages\/(\d+)"[^>]*>([\s\S]{0,150}?)<\/a>/g)) {
      const label = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (/^(list\s*of\s*)?players$/i.test(label) || /list\s*of\s*players/i.test(label)) return m[1];
    }
    return null;
  })();
  if (!lid) throw new Error(`leagueId não encontrado (página 100% JS?). Passar --league {id}. Título: "${title}"`);

  const widget = await ggGet(`${GG}/leagues/${lid}/widgets/tournament_results?page_id=${pid}`);
  const opts = [...widget.matchAll(/<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/g)]
    // ⚠ decodeEntities: os labels vêm com `&amp;` ("Boys 8 &amp; Under") e sem
    // isto o escalão ficava com a entidade crua no nome do tab e no ficheiro.
    .map((m) => ({ val: m[1], label: decodeEntities(m[2]).replace(/\s+/g, ' ').replace(/\.\.\.$/, '').trim() }));

  // Sem <select name=round> → divisão única: o v2tid está directo no widget.
  if (!opts.length) {
    const v2 = (widget.match(/v2tournaments\/(\d+)/) || [])[1];
    if (!v2) {
      // Prova por começar: ainda não há leaderboard, mas os tee sheets
      // (draws) já estão publicados → modo pré-torneio, o campo sai deles.
      if (teePageId) return { title, lid, divisions: [], teePageId, rosterPageId, preField: true };
      throw new Error('sem opções de ronda nem v2tid no widget');
    }
    return { title, lid, divisions: [{ label: title || 'Overall', v2tid: v2 }], teePageId, rosterPageId };
  }

  // Caso "uma vista, várias divisões" (Champion of Champions): o <select> só
  // muda de RONDA e o widget já traz TODAS as divisões empilhadas — um v2tid
  // por escalão. Aí o agrupamento por label não descobre nada; cada v2tid do
  // widget é uma divisão e o label vem do nome do próprio evento GG
  // ("54 Hole World Championship - Under 12 Boys" → "Under 12 Boys").
  if (opts.every((o) => isRoundOnlyLabel(o.label))) {
    const v2s = [...new Set([...widget.matchAll(/v2tournaments\/(\d+)/g)].map((m) => m[1]))];
    // Divisão ÚNICA com <select> de rondas (England Golf — Reid Trophy): o
    // widget base já é o leaderboard agregado do evento inteiro. Sem isto o
    // código caía no agrupamento por label e cada ronda virava uma divisão.
    if (v2s.length === 1) {
      return { title, lid, divisions: [{ label: title || 'Overall', v2tid: v2s[0] }], teePageId, rosterPageId };
    }
    if (v2s.length > 1) {
      const divisions = [];
      for (const v2 of v2s) {
        let label = `Div ${divisions.length + 1}`;
        try {
          const j = await ggGet(`${GG}/v2tournaments/${v2}`, 'application/json');
          const n = (j?.event?.name || '').replace(/\s+/g, ' ').trim();
          if (n) label = n.includes(' - ') ? n.slice(n.indexOf(' - ') + 3).trim() : n;
        } catch { /* sem nome → label genérico */ }
        if (isSideEvent(label)) { console.log(`   ↷ ${label}: side event — saltado`); continue; }
        divisions.push({ label, v2tid: v2 });
      }
      divisions.sort((a, b) => divSortKey(a.label) - divSortKey(b.label));
      console.log(`   ${divisions.length} divisão(ões) na mesma vista: ${divisions.map((d) => d.label).join(' · ')}`);
      return { title, lid, divisions, teePageId, rosterPageId };
    }
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
  return { title, lid, divisions, teePageId, rosterPageId };
}

/**
 * Merge ADITIVO com o que já está em disco. Numa prova a decorrer, um
 * re-scrape apanha jogadores a meio da volta e devolveria MENOS buracos do que
 * já tínhamos guardado; ao contrário, quando a volta fecha traz mais. Regra por
 * volta (casada pela DATA, não pelo índice — quem falta a uma ronda desalinhava
 * os dias): fica a versão com MAIS buracos; voltas que só existem em disco são
 * mantidas. O resto (posição, total, ±par) vem sempre do scrape novo, que é a
 * fonte autoritativa. Desligar com `--no-merge`.
 */
function mergeWithDisk(file, out) {
  if (!fs.existsSync(file)) return { kept: 0, restored: 0 };
  let prev;
  try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { kept: 0, restored: 0 }; }
  if (!Array.isArray(prev.divisions)) return { kept: 0, restored: 0 };

  // Datas só ALARGAM face ao disco: num hiccup do fetchTeeSheets (try/catch no
  // runOne) o run perdia a R3 do <select> e o endDate encolhia — e o sameAsDisk
  // committava a regressão. `--no-merge` é o escape hatch (ex: ronda cancelada
  // que ficou no select e deixou um endDate fantasma).
  const dts = [prev.startDate, prev.endDate, out.startDate, out.endDate]
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '')).sort();
  if (dts.length) { out.startDate = dts[0]; out.endDate = dts[dts.length - 1]; }

  const pKey = (p) => p.detailId || p.name;
  const prevByDiv = new Map(prev.divisions.map((dv) => [dv.division, { div: dv, players: new Map((dv.players || []).map((p) => [pKey(p), p])) }]));
  let kept = 0, restored = 0;

  for (const dv of out.divisions) {
    const prevEntry = prevByDiv.get(dv.division);
    if (!prevEntry) continue;
    // Metadados CURADOS À MÃO da divisão (metros/SI/tee do cartão oficial em
    // papel — o GG público não os expõe, logo o scrape novo traz sempre null)
    // sobrevivem ao re-scrape. Se um dia o motor os extrair, o valor novo
    // (não-null) ganha na mesma.
    for (const k of ['meters', 'si', 'teeName', 'courseRating', 'slope']) {
      if (dv[k] == null && prevEntry.div[k] != null) dv[k] = prevEntry.div[k];
    }
    const old = prevEntry.players;
    for (const p of dv.players) {
      const o = old.get(pKey(p));
      if (!o || !Array.isArray(o.rounds) || !o.rounds.length) continue;
      const byDate = new Map();
      for (const r of p.rounds || []) if (r.date) byDate.set(r.date, r);
      for (const r of o.rounds) {
        if (!r.date) continue;
        const cur = byDate.get(r.date);
        if (!cur) { byDate.set(r.date, r); restored++; continue; }
        if ((r.scores || []).length > (cur.scores || []).length) { byDate.set(r.date, r); kept++; }
      }
      // Voltas sem data (formatos antigos) não entram no merge — mantêm-se as novas.
      const undated = (p.rounds || []).filter((r) => !r.date);
      p.rounds = [...undated, ...[...byDate.values()].sort((a, b) => dateKey(a.date) - dateKey(b.date))]
        .map((r, i) => ({ ...r, day: i + 1 }));
    }
  }
  return { kept, restored };
}

/** Igualdade ignorando o carimbo `scrapedAt` (senão TODO o run "muda"). */
function sameAsDisk(file, out) {
  if (!fs.existsSync(file)) return false;
  try {
    const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
    const strip = (o) => { const { scrapedAt, ...rest } = o; return JSON.stringify(rest); };
    return strip(prev) === strip(out);
  } catch { return false; }
}

/** Scrape de UM evento. Devolve {file, changed}. */
async function runOne(opts) {
  const {
    pageUrl = null, v2Arg = null, leagueOverride = null, nameOverride = null,
    slugOverride = null, yearOverride = null, countryDefault = null,
    skipScorecards = false, profiles = false, noMerge = false,
  } = opts;

  let title, divisions, source, lid = leagueOverride, teePageId = null, rosterPageId = opts.rosterPage || null, preField = false;
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
    lid = disc.lid; teePageId = disc.teePageId;
    rosterPageId = rosterPageId || disc.rosterPageId;   // scope override > auto-descoberto
    preField = !!disc.preField;
    if (!divisions.length && !preField) throw new Error('nenhuma divisão descoberta');
  } else {
    throw new Error('sem pageUrl nem --v2tids');
  }

  // Slug/nome: override CLI → SLUG_OVERRIDES por título → slugify.
  let slug = slugOverride, name = nameOverride || title;
  if (!slug) for (const o of SLUG_OVERRIDES) if (o.re.test(title || '')) { slug = o.slug; if (!nameOverride) name = o.name; break; }
  if (!slug) slug = slugify(title);

  // profiles: enriquece cada jogador com DOB/clube/ano de graduação da ficha
  // GG (/profiles/{id}). Auto-ligado quando se dá --country (caso FMG México).
  // `--country none` = evento mundial sem afiliação fiável → sem país por
  // defeito (melhor `null` do que carimbar toda a gente como americana).
  const noDefaultCountry = String(countryDefault || '').toLowerCase() === 'none';
  const ed = { name, year: yearOverride, divisions };
  // Pré-torneio: não há leaderboard para o scrapeEdition ler → divisão única
  // vazia (o label é o mesmo que o discoverDivisions dará quando o leaderboard
  // abrir), semeada mais abaixo com o campo dos tee sheets.
  const out = preField
    ? { tournament: name, year: yearOverride, divisions: [{ division: title || 'Overall', tid: null, par: null, parTotal: null, players: [] }] }
    : await scrapeEdition(ed, {
      skipScorecards,
      profiles: profiles || (!!countryDefault && !noDefaultCountry),
      ...(noDefaultCountry ? { defaultCountry: null } : {}),
    });
  if (preField) console.log('   ⏳ leaderboard ainda fechado — modo pré-torneio (campo + draws dos tee sheets)');
  out.source = source;
  if (nameOverride) out.tournament = nameOverride;
  // Leaderboards FFG/Evian escrevem "APELIDO Nome" — o mesmo formato do tee
  // sheet. Normalizar para "Nome Apelido" para casar draw ↔ leaderboard ↔ outras
  // edições (o cleanTeeName só mexe quando há apelido em maiúsculas à frente).
  for (const dv of out.divisions) for (const p of dv.players) {
    const c = cleanTeeName(p.name);
    if (c.name && c.name !== p.name) p.name = c.name;
  }
  // Metros por buraco + tee + CR/slope por divisão (cartão de tee do jogador).
  const siblingsKnown = siblingPlaceholders(slug, out.year, path.join(OUT, `${slug}_${out.year || 'x'}.json`));
  if (!preField && !skipScorecards) await applyTeeCards(out, siblingsKnown);
  // Nº de etapa/fase (eventos multi-ficheiro por ano, ex: Optimist Phase 1-3):
  // vai para o JobFile como `stop` → id `{source}:{ano}:{stop}` no catálogo e
  // na MajorPage (mesmo mecanismo do EJT golfbox).
  if (opts.stop != null) out.stop = Number(opts.stop) || null;

  // País por defeito (ex: México → MX): o inferCountry do motor cai em "US"
  // quando a afiliação é só um clube sem país. Substitui esse fallback pelo país
  // do evento; afiliações com país reconhecível mantêm o seu código.
  if (countryDefault && !noDefaultCountry) for (const dv of out.divisions) for (const p of dv.players) {
    if (p.country === 'US') p.country = countryDefault;
  }

  // Draws REAIS a partir da página de tee sheets do microsite (quando existe).
  // Sem eles o TournamentDetail só mostra draws estimados do acumulado — e
  // nunca a R1, que não tem ronda anterior de onde inferir emparelhamentos.
  let teeByName = new Map();
  let teeField = new Map();
  let teeDraws = null;   // draw completo (todas as divisões) de cada ronda
  if (teePageId && lid && !opts.skipTeeSheets) {
    try {
      const { draws, countries, roundDateLabels, field, tees } = await fetchTeeSheets(lid, teePageId);
      teeByName = tees;
      teeField = field;
      teeDraws = draws.get('__ALL__') || null;
      if (!out.year && roundDateLabels.length) out.year = new Date().getUTCFullYear();
      // Pré-torneio (1 divisão): o campo é quem está nos draws.
      if (preField && out.divisions.length === 1) {
        out.divisions[0].players = [...field.values()].map((f) => ({
          pos: '', name: f.name, country: f.country ? inferCountry(f.country, null) : null,
          location: f.country || '', hcp: f.hcp, toPar: null, total: null, roundGross: [], rounds: [],
        }));
        console.log(`   👥 tee sheets: ${field.size} jogador(es) no campo pré-torneio`);
      }
      // Datas do tee sheet FUNDIDAS com as do v2 (min/max): num evento a
      // decorrer o v2 só tem as rondas jogadas e o endDate ficava curto.
      const anchor = out.startDate || out.endDate || null;
      const teeDates = (roundDateLabels || []).map((s) => usDateToIso(s, out.year, anchor)).filter(Boolean);
      const allDates = [...teeDates, out.startDate, out.endDate].filter(Boolean).sort();
      if (allDates.length) { out.startDate = allDates[0]; out.endDate = allDates[allDates.length - 1]; }
      let n = 0;
      for (const dv of out.divisions) {
        let d = draws.get(dv.division);
        // Evento de 1 divisão: o tee sheet não etiqueta escalão → usa o draw completo.
        if ((!d || !Object.keys(d).length) && out.divisions.length === 1) d = draws.get('__ALL__');
        if (d && Object.keys(d).length) { dv.draws = d; n++; }
      }
      if (n) console.log(`   🕘 tee sheets: draws reais em ${n}/${out.divisions.length} divisão(ões)`);
      // Nacionalidade pela roster — SÓ para quem o leaderboard não afiliou.
      // Não toca em quem já tem país resolvido pela afiliação (CoC, FSGA…).
      if (countries.size) {
        let nc = 0;
        for (const dv of out.divisions) for (const p of dv.players) {
          // Handicap do tee sheet ("APELIDO Nome (+1.3)") — o leaderboard v2 não o traz.
          const f = field.get(nameKey(p.name));
          if (f && f.hcp != null && p.hcp == null) p.hcp = f.hcp;
          if (p.location) continue;                 // já tinha afiliação → manda ela
          const c = countries.get(nameKey(p.name));
          if (!c) continue;
          p.location = c;
          const iso = inferCountry(c, p.country || null);
          if (iso && iso !== p.country) { p.country = iso; nc++; }
        }
        if (nc) console.log(`   🌍 roster: país corrigido em ${nc} jogador(es) (leaderboard sem afiliação)`);
      }
    } catch (e) { console.log(`   ⚠ tee sheets indisponíveis: ${e.message}`); }
  }

  // Roster (país + clube por jogador) da página "List of Players". Em eventos
  // England-Golf o leaderboard v2 não traz afiliação nenhuma; sem isto os
  // jogadores ficavam todos sem bandeira. E ANTES de haver scores, semeia o
  // campo (jogadores sem ronda) para o torneio já aparecer com os inscritos +
  // tee times, em vez de um ficheiro de 0 jogadores.
  if (rosterPageId && lid) {
    try {
      const roster = await fetchRoster(lid, rosterPageId);
      if (roster.length) {
        const byName = new Map(roster.map((r) => [nameKey(r.name), r]));
        for (const dv of out.divisions) for (const p of dv.players) {
          const r = byName.get(nameKey(p.name));
          if (!r) continue;
          if (r.club && !p.club) p.club = r.club;
          if (r.gradYear && p.gradYear == null) p.gradYear = r.gradYear;
          if (r.countryName) {
            if (!p.location) p.location = r.countryName;
            const iso = inferCountry(r.countryName, null);
            if (iso && (p.country == null || p.country === 'US')) p.country = iso;
          }
        }
        // Semear só faz sentido num evento de 1 divisão (todos os inscritos são dela).
        if (out.divisions.length === 1) {
          const dv = out.divisions[0];
          const have = new Set(dv.players.map((p) => nameKey(p.name)));
          let seeded = 0;
          for (const r of roster) {
            if (have.has(nameKey(r.name))) continue;
            dv.players.push({
              pos: '', name: r.name,
              country: r.countryName ? inferCountry(r.countryName, null) : null,
              location: r.countryName || '', club: r.club || null,
              toPar: null, total: null, roundGross: [], rounds: [],
            });
            seeded++;
          }
          if (seeded) console.log(`   👥 roster: +${seeded} inscrito(s) ainda sem score (campo pré-torneio) → ${dv.players.length} jogadores`);
        }
      }
    } catch (e) { console.log(`   ⚠ roster indisponível: ${e.message}`); }
  }

  // Prova a decorrer, divisão única: o leaderboard só lista quem JÁ tem cartão
  // (Evian 2026, R1: 6 de 83). Quem está nos tee sheets e ainda não jogou entra
  // no campo sem voltas — senão o ficheiro encolhia para meia dúzia.
  // Com `teeDivisions` e o leaderboard JÁ partido (Boys/Girls, como em 2025),
  // cada jogador sem cartão vai para o escalão do seu tee de saída.
  const teeDiv = opts.teeDivisions && Object.keys(opts.teeDivisions).length ? opts.teeDivisions : null;
  if (!preField && teeField.size && (out.divisions.length === 1 || teeDiv)) {
    const have = new Set(out.divisions.flatMap((dv) => dv.players.map((p) => nameKey(p.name))));
    let seeded = 0;
    for (const [k, f] of teeField) {
      if (have.has(k)) continue;
      const label = teeDiv ? teeDiv[teeByName.get(k)] : null;
      const dv = out.divisions.length === 1 ? out.divisions[0] : out.divisions.find((d) => d.division === label);
      if (!dv) continue;   // tee desconhecido num leaderboard já partido → não se adivinha o escalão
      dv.players.push({ pos: '', name: f.name, country: f.country ? inferCountry(f.country, null) : null,
        location: f.country || '', hcp: f.hcp ?? null, tee: teeByName.get(k) || undefined,
        toPar: null, total: null, roundGross: [], rounds: [] });
      seeded++;
    }
    if (seeded) console.log(`   👥 tee sheets: +${seeded} jogador(es) ainda sem cartão → ${out.divisions.map((d) => `${d.division} ${d.players.length}`).join(' · ')}`);
  }
  // Leaderboard já partido + tee sheet sem escalão: o draw de cada escalão são
  // os grupos onde joga alguém dele (o fallback __ALL__ só servia 1 divisão).
  if (teeDiv && out.divisions.length > 1 && teeDraws) {
    for (const dv of out.divisions) {
      if (dv.draws && Object.keys(dv.draws).length) continue;
      const names = new Set(dv.players.map((p) => nameKey(p.name)));
      dv.draws = Object.fromEntries(Object.entries(teeDraws).map(([rn, rd]) => [rn, {
        ...rd, groups: rd.groups.filter((g) => g.players.some((q) => names.has(nameKey(q.name)))),
      }]));
    }
  }

  // Escalões pelo tee de saída (scope `teeDivisions`) — DEPOIS de draws e roster.
  if (opts.teeDivisions && Object.keys(opts.teeDivisions).length) {
    const n = splitByTee(out, teeByName, opts.teeDivisions);
    if (n) console.log(`   🚻 escalões pelo tee: ${out.divisions.map((d) => `${d.division} ${d.players.length}j`).join(' · ')}`);
    // Cartões de tee de novo, agora por escalão (o do leaderboard misto só
    // servia o tee de quem o jogou).
    if (n && !preField && !skipScorecards) await applyTeeCards(out, siblingsKnown);
  }

  const yearKey = out.year || 'x';
  const file = path.join(OUT, `${slug}_${yearKey}.json`);
  if (!noMerge) {
    const m = mergeWithDisk(file, out);
    if (m.kept || m.restored) console.log(`   ↩ merge aditivo: ${m.kept} volta(s) mais completa(s) preservada(s), ${m.restored} volta(s) só em disco mantida(s)`);
  }
  // Guarda anti-encolhimento (regra da casa): a fonte às vezes responde com
  // meia dúzia de jogadores (leaderboard a abrir) — nunca gravar menos de
  // metade do que está em disco sem --force.
  if (fs.existsSync(file) && !opts.force) {
    try {
      const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
      const nPrev = (prev.divisions || []).reduce((a, dv) => a + (dv.players || []).length, 0);
      const nNew = out.divisions.reduce((a, dv) => a + (dv.players || []).length, 0);
      if (nPrev >= 10 && nNew < nPrev / 2) {
        console.log(`   ⛔ ${path.basename(file)}: ${nNew} jogadores contra ${nPrev} em disco — NÃO gravado (usar --force se for mesmo assim)`);
        return { file, changed: false };
      }
    } catch { /* ficheiro ilegível → segue */ }
  }
  const changed = !sameAsDisk(file, out);
  if (changed) writeJsonAtomic(file, out);
  const summary = out.divisions.map((dv) => {
    const nSc = dv.players.filter((p) => (p.rounds || []).some((r) => (r.scores || []).length)).length;
    return `${dv.division}:${dv.players.length}j(${nSc}sc)`;
  }).join(' · ');
  console.log(`\n   ${changed ? '✅' : '➖ (sem alterações)'} ${out.tournament} — ${out.divisions.length} divisão(ões) [${summary}] → ${file}`);
  return { file, changed };
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const skipScorecards = args.includes('--skip-scorecards');
  const noMerge = args.includes('--no-merge');
  const skipTeeSheets = args.includes('--skip-tee-sheets');
  const force = args.includes('--force');   // grava mesmo que o ficheiro encolha
  const scopeFile = getArg('--scope');
  const pageUrl = args.find((a) => /^https?:\/\/.*\/pages\/\d+/.test(a));
  const v2Arg = getArg('--v2tids');

  // Modo scope: lista de eventos a manter actualizados (usado pelo cron).
  // Cada entrada = os mesmos campos do CLI: {url|v2tids, slug, name, year,
  // league, country, skipScorecards, profiles, note}.
  let jobs;
  if (scopeFile) {
    const scope = JSON.parse(fs.readFileSync(path.isAbsolute(scopeFile) ? scopeFile : path.join(process.cwd(), scopeFile), 'utf8'));
    // --scope + --slug = correr só esse evento (inclui entradas `disabled` —
    // é o escape hatch para re-scrapar uma edição encerrada a pedido).
    const only = getArg('--slug');
    jobs = (Array.isArray(scope) ? scope : scope.events || [])
      .filter((e) => (only ? e.slug === only : !e.disabled))
      .map((e) => ({
        pageUrl: e.url || null, v2Arg: e.v2tids || null, leagueOverride: e.league || null,
        nameOverride: e.name || null, slugOverride: e.slug || null,
        yearOverride: e.year ? parseInt(e.year, 10) : null, countryDefault: e.country || null,
        skipScorecards: skipScorecards || !!e.skipScorecards, profiles: !!e.profiles, noMerge,
        skipTeeSheets: skipTeeSheets || !!e.skipTeeSheets, rosterPage: e.rosterPage || null, force,
        stop: e.stop != null ? e.stop : null,
        teeDivisions: e.teeDivisions || null,
      }));
    if (!jobs.length) { console.error(`Scope sem eventos a correr: ${scopeFile}`); process.exit(1); }
  } else if (pageUrl || v2Arg) {
    jobs = [{
      pageUrl, v2Arg, leagueOverride: getArg('--league'), nameOverride: getArg('--name'),
      slugOverride: getArg('--slug'), yearOverride: getArg('--year') ? parseInt(getArg('--year'), 10) : null,
      countryDefault: getArg('--country'), skipScorecards, profiles: args.includes('--profiles'), noMerge, skipTeeSheets, force,
      rosterPage: getArg('--roster-page'), stop: getArg('--stop'),
      // --tee-divisions "White=Boys U14,Blue=Girls U14"
      teeDivisions: getArg('--tee-divisions')
        ? Object.fromEntries(getArg('--tee-divisions').split(',').map((kv) => kv.split('=').map((x) => x.trim())))
        : null,
    }];
  } else {
    console.error('Uso: node scripts/scrape-golfgenius-node.js <pageUrl> [--league id] [--v2tids a,b] [--name] [--slug] [--year] [--country XX] [--skip-scorecards]');
    console.error('     node scripts/scrape-golfgenius-node.js --scope scripts/golfgenius-scope.json [--slug coc]');
    process.exit(1);
  }

  let nChanged = 0, nFail = 0;
  for (const job of jobs) {
    try {
      const res = await runOne(job);
      if (res.changed) nChanged++;
    } catch (e) {
      nFail++;
      console.error(`   ❌ ${job.slugOverride || job.pageUrl || job.v2Arg}: ${e.message}`);
    }
  }
  console.log(`\n🏁 Concluído — ${jobs.length} evento(s), ${nChanged} com novidades, ${nFail} falha(s).`);
  // Exit codes (convenção dos workflows): 0 = há novidades, 2 = nada novo, 1 = erro.
  if (nFail && !nChanged) process.exit(1);
  if (!nChanged) process.exit(2);
}

if (require.main === module) main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
module.exports = { discoverDivisions, runOne, fetchTeeSheets, parseTeeSheet, parseRoster, parsePlayerTees, splitByTee, cleanTeeName, applyTeeCards };
