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
function isRoundOnlyLabel(label) {
  const base = divisionBase(label);
  return !base || /^(final\s+round|round\s+\d+)$/i.test(base);
}

// Divisões que NÃO são o campeonato stroke-play por escalão (scrambles, side
// events, testes) — excluídas por serem 0-rondas e sujarem a apresentação.
function isSideEvent(label) { return /\b(adult|scramble|nassau|prueba|par\s*3)\b/i.test(label); }
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

/** Uma ronda de tee sheet → [{ time, players:[{name, country, division}] }]. */
function parseTeeSheet(html) {
  const groups = [];
  const seen = new Set();
  for (const tm of html.matchAll(/<table[^>]*by_tee_times_table[\s\S]*?<\/table>/gi)) {
    for (const rm of tm[0].matchAll(/<tr[^>]*search_rows[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...rm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
      // Cada linha traz DUAS colunas de (hora, jogadores) lado a lado.
      for (let i = 0; i + 1 < cells.length; i += 2) {
        const time = txt(cells[i]);
        if (!/\d/.test(time)) continue;
        const players = cells[i + 1].split(/players_portrait/).slice(1).map((chunk) => {
          const name = txt(chunk.split('<span')[0]).replace(/^'>\s*/, '').trim();
          const country = txt((chunk.match(/affiliation_portrait'>([\s\S]*?)<\/span>/) || [])[1] || '');
          const division = txt((chunk.match(/answer_text'>([\s\S]*?)<\/div>/) || [])[1] || '');
          return { name, country: country || null, division: division || null };
        }).filter((p) => p.name);
        if (!players.length) continue;
        // A tabela repete as linhas em variantes hidden-xs/visible-xs.
        const key = `${time}|${players[0].name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        groups.push({ time, players });
      }
    }
  }
  return groups;
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
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    const html = r.url ? await ggGet(GG + r.url) : first;
    for (const p of parseRoster(html)) {
      if (p.country && !countries.has(nameKey(p.name))) countries.set(nameKey(p.name), p.country);
    }
    const groups = parseTeeSheet(html);
    if (!groups.length) { await new Promise((res) => setTimeout(res, 300)); continue; }
    const roundNum = (r.label.match(/round\s+(\d+)/i) || [, String(i + 1)])[1];
    const date = (r.label.match(/\(([^)]+)\)/) || [])[1] || undefined;
    // Um flight pode juntar escalões diferentes → o grupo entra no draw de
    // TODAS as divisões representadas (é assim que o miúdo vê com quem joga).
    const divs = new Set(groups.flatMap((g) => g.players.map((p) => p.division).filter(Boolean)));
    for (const dv of divs) {
      if (!byDiv.has(dv)) byDiv.set(dv, {});
      const mine = groups.filter((g) => g.players.some((p) => p.division === dv));
      byDiv.get(dv)[roundNum] = {
        round: Number(roundNum), label: r.label, date,
        groups: mine.map((g) => ({ time: g.time, startHole: null, players: g.players.map((p) => ({ name: p.name })) })),
      };
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  return { draws: byDiv, countries };
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
        if (/tee\s*sheets?/i.test(m[2].replace(/<[^>]+>/g, ' '))) return m[1];
      }
      return null;
    })()
    || null;
  if (!lid) throw new Error(`leagueId não encontrado (página 100% JS?). Passar --league {id}. Título: "${title}"`);

  const widget = await ggGet(`${GG}/leagues/${lid}/widgets/tournament_results?page_id=${pid}`);
  const opts = [...widget.matchAll(/<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/g)]
    // ⚠ decodeEntities: os labels vêm com `&amp;` ("Boys 8 &amp; Under") e sem
    // isto o escalão ficava com a entidade crua no nome do tab e no ficheiro.
    .map((m) => ({ val: m[1], label: decodeEntities(m[2]).replace(/\s+/g, ' ').replace(/\.\.\.$/, '').trim() }));

  // Sem <select name=round> → divisão única: o v2tid está directo no widget.
  if (!opts.length) {
    const v2 = (widget.match(/v2tournaments\/(\d+)/) || [])[1];
    if (!v2) throw new Error('sem opções de ronda nem v2tid no widget');
    return { title, lid, divisions: [{ label: title || 'Overall', v2tid: v2 }] };
  }

  // Caso "uma vista, várias divisões" (Champion of Champions): o <select> só
  // muda de RONDA e o widget já traz TODAS as divisões empilhadas — um v2tid
  // por escalão. Aí o agrupamento por label não descobre nada; cada v2tid do
  // widget é uma divisão e o label vem do nome do próprio evento GG
  // ("54 Hole World Championship - Under 12 Boys" → "Under 12 Boys").
  if (opts.every((o) => isRoundOnlyLabel(o.label))) {
    const v2s = [...new Set([...widget.matchAll(/v2tournaments\/(\d+)/g)].map((m) => m[1]))];
    if (v2s.length > 1) {
      const divisions = [];
      for (const v2 of v2s) {
        let label = `Div ${divisions.length + 1}`;
        try {
          const j = await ggGet(`${GG}/v2tournaments/${v2}`, 'application/json');
          const n = (j?.event?.name || '').replace(/\s+/g, ' ').trim();
          if (n) label = n.includes(' - ') ? n.slice(n.indexOf(' - ') + 3).trim() : n;
        } catch { /* sem nome → label genérico */ }
        divisions.push({ label, v2tid: v2 });
      }
      divisions.sort((a, b) => divSortKey(a.label) - divSortKey(b.label));
      console.log(`   ${divisions.length} divisão(ões) na mesma vista: ${divisions.map((d) => d.label).join(' · ')}`);
      return { title, lid, divisions, teePageId };
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
  return { title, lid, divisions, teePageId };
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

  const pKey = (p) => p.detailId || p.name;
  const prevByDiv = new Map(prev.divisions.map((dv) => [dv.division, new Map((dv.players || []).map((p) => [pKey(p), p]))]));
  let kept = 0, restored = 0;

  for (const dv of out.divisions) {
    const old = prevByDiv.get(dv.division);
    if (!old) continue;
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

  let title, divisions, source, lid = leagueOverride, teePageId = null;
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
    if (!divisions.length) throw new Error('nenhuma divisão descoberta');
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
  const out = await scrapeEdition(ed, {
    skipScorecards,
    profiles: profiles || (!!countryDefault && !noDefaultCountry),
    ...(noDefaultCountry ? { defaultCountry: null } : {}),
  });
  out.source = source;
  if (nameOverride) out.tournament = nameOverride;

  // País por defeito (ex: México → MX): o inferCountry do motor cai em "US"
  // quando a afiliação é só um clube sem país. Substitui esse fallback pelo país
  // do evento; afiliações com país reconhecível mantêm o seu código.
  if (countryDefault && !noDefaultCountry) for (const dv of out.divisions) for (const p of dv.players) {
    if (p.country === 'US') p.country = countryDefault;
  }

  // Draws REAIS a partir da página de tee sheets do microsite (quando existe).
  // Sem eles o TournamentDetail só mostra draws estimados do acumulado — e
  // nunca a R1, que não tem ronda anterior de onde inferir emparelhamentos.
  if (teePageId && lid && !opts.skipTeeSheets) {
    try {
      const { draws, countries } = await fetchTeeSheets(lid, teePageId);
      let n = 0;
      for (const dv of out.divisions) {
        const d = draws.get(dv.division);
        if (d && Object.keys(d).length) { dv.draws = d; n++; }
      }
      if (n) console.log(`   🕘 tee sheets: draws reais em ${n}/${out.divisions.length} divisão(ões)`);
      // Nacionalidade pela roster — SÓ para quem o leaderboard não afiliou.
      // Não toca em quem já tem país resolvido pela afiliação (CoC, FSGA…).
      if (countries.size) {
        let nc = 0;
        for (const dv of out.divisions) for (const p of dv.players) {
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

  const yearKey = out.year || 'x';
  const file = path.join(OUT, `${slug}_${yearKey}.json`);
  if (!noMerge) {
    const m = mergeWithDisk(file, out);
    if (m.kept || m.restored) console.log(`   ↩ merge aditivo: ${m.kept} volta(s) mais completa(s) preservada(s), ${m.restored} volta(s) só em disco mantida(s)`);
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
  const scopeFile = getArg('--scope');
  const pageUrl = args.find((a) => /^https?:\/\/.*\/pages\/\d+/.test(a));
  const v2Arg = getArg('--v2tids');

  // Modo scope: lista de eventos a manter actualizados (usado pelo cron).
  // Cada entrada = os mesmos campos do CLI: {url|v2tids, slug, name, year,
  // league, country, skipScorecards, profiles, note}.
  let jobs;
  if (scopeFile) {
    const scope = JSON.parse(fs.readFileSync(path.isAbsolute(scopeFile) ? scopeFile : path.join(process.cwd(), scopeFile), 'utf8'));
    const only = getArg('--slug');   // --scope + --slug = correr só esse evento
    jobs = (Array.isArray(scope) ? scope : scope.events || [])
      .filter((e) => !e.disabled && (!only || e.slug === only))
      .map((e) => ({
        pageUrl: e.url || null, v2Arg: e.v2tids || null, leagueOverride: e.league || null,
        nameOverride: e.name || null, slugOverride: e.slug || null,
        yearOverride: e.year ? parseInt(e.year, 10) : null, countryDefault: e.country || null,
        skipScorecards: skipScorecards || !!e.skipScorecards, profiles: !!e.profiles, noMerge,
        skipTeeSheets: skipTeeSheets || !!e.skipTeeSheets,
      }));
    if (!jobs.length) { console.error(`Scope sem eventos a correr: ${scopeFile}`); process.exit(1); }
  } else if (pageUrl || v2Arg) {
    jobs = [{
      pageUrl, v2Arg, leagueOverride: getArg('--league'), nameOverride: getArg('--name'),
      slugOverride: getArg('--slug'), yearOverride: getArg('--year') ? parseInt(getArg('--year'), 10) : null,
      countryDefault: getArg('--country'), skipScorecards, profiles: args.includes('--profiles'), noMerge, skipTeeSheets,
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
module.exports = { discoverDivisions, runOne, fetchTeeSheets, parseTeeSheet, parseRoster };
