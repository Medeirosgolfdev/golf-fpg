#!/usr/bin/env node
/**
 * fetch-all-player-results.js  v4
 * Pedidos HTTPS directos com cookies do session.json — sem browser.
 *
 * Uso:
 *   node fetch-all-player-results.js
 *   node fetch-all-player-results.js --limit=10
 *   node fetch-all-player-results.js --fed=52884
 *   node fetch-all-player-results.js --resume=player-results-all-chk-100.json
 */

'use strict';
const https  = require('https');
const fs     = require('fs');
const path   = require('path');

const ROOT         = path.join(__dirname, '..');
const SESSION_PATH = path.join(ROOT, 'session.json');
const PLAYERS_PATH = path.join(ROOT, 'public', 'data', 'players.json');
const OUTPUT       = path.join(ROOT, 'public', 'data', 'player-results-all.json');
const HOST         = 'scoring.fpg.pt';
const ENDPOINT     = '/lists/PlayerResults.aspx/ResultsLST';
const DELAY        = 120;
const PAGE_SIZE    = 500;
const CHK_EVERY    = 100;

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k,v] = a.slice(2).split('='); return [k, v ?? true]; })
);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function buildCookieHeader(sessionPath) {
  const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const cookies = session.cookies || [];
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

function postJSON(cookieHeader, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: HOST,
      path: ENDPOINT,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'x-requested-with': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*',
        'Origin': 'https://scoring.fpg.pt',
        'Referer': 'https://scoring.fpg.pt/lists/PlayerWHS.aspx',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': cookieHeader,
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('JSON parse error: ' + data.slice(0,100))); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function fetchResults(cookieHeader, fed) {
  const all = [];
  for (let p = 0; p < 20; p++) {
    const data = await postJSON(cookieHeader, {
      fed_code: String(fed),
      jtStartIndex: String(p * PAGE_SIZE),
      jtPageSize: String(PAGE_SIZE)
    });
    const recs = data?.d?.Records || data?.Records || [];
    all.push(...recs);
    if (recs.length < PAGE_SIZE) break;
    await sleep(DELAY);
  }
  return all;
}

function simplify(recs) {
  return recs.map(r => ({
    date:       r.score_dateStr?.slice(0,10),
    tourn:      r.tournament_description,
    course:     r.course_description,
    par:        r.par_total,
    holes:      r.hole_count,
    gross:      r.gross_total === 998 ? null : r.gross_total,
    toPar:      r.calc_field2,
    stb:        r.calculated_stablnet_total,
    hcpDay:     r.exact_hcp,
    hcpAfter:   r.calculated_exact_hcp,
    playHcp:    r.play_hcp,
    diff:       r.score_differential,
    origin:     r.score_origin,
    status:     r.status_name,
    qualifying: r.hcp_qualifying_name === 'Sim',
    tid:        r.tournament_id,
  }));
}

async function main() {
  if (!fs.existsSync(SESSION_PATH)) { console.error('Erro: session.json nao encontrado'); process.exit(1); }
  if (!fs.existsSync(PLAYERS_PATH)) { console.error('Erro: players.json nao encontrado'); process.exit(1); }

  const cookieHeader = buildCookieHeader(SESSION_PATH);
  const session = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
  console.log(`Cookies: ${(session.cookies||[]).length}`);

  // Teste
  console.log('A verificar sessao...');
  try {
    const test = await fetchResults(cookieHeader, '49085');
    if (test.length === 0) {
      console.error('Sessao sem dados.\n');
      console.error('SOLUCAO: correr node login.js e durante o processo:');
      console.error('  1. Fazer login em area.my.fpg.pt');
      console.error('  2. Navegar para scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884');
      console.error('  3. Aguardar a tabela de rondas carregar completamente');
      console.error('  4. SO ENTAO carregar ENTER no terminal do login.js');
      process.exit(1);
    }
    console.log(`Sessao OK (49085: ${test.length} registos)\n`);
  } catch(e) {
    console.error('Sessao invalida:', e.message);
    process.exit(1);
  }

  const players = JSON.parse(fs.readFileSync(PLAYERS_PATH, 'utf8'));
  let feds = Object.keys(players);
  if (args.fed)        feds = [args.fed];
  else if (args.limit) feds = feds.slice(0, parseInt(args.limit));

  let result = { gerado_em: '', total_jogadores: 0, total_registos: 0, jogadores: {} };

  if (args.resume && fs.existsSync(args.resume)) {
    result = JSON.parse(fs.readFileSync(args.resume, 'utf8'));
    const done = new Set(Object.keys(result.jogadores));
    feds = feds.filter(f => !done.has(f));
    console.log(`Retomando: ${done.size} feitos, ${feds.length} por fazer`);
  }

  console.log(`${feds.length} jogadores a processar\n`);

  let done = 0, vazios = 0, erros = 0;
  const t0 = Date.now();

  for (const fed of feds) {
    const p    = players[fed];
    const nome = p.name || '?';
    const club = typeof p.club === 'object' ? (p.club?.short || '') : (p.club || '');

    try {
      const recs = await fetchResults(cookieHeader, fed);
      if (recs.length > 0) {
        result.jogadores[fed] = { nome, club, count: recs.length, records: simplify(recs) };
        result.total_registos += recs.length;
        process.stdout.write(`  OK [${done+1}] ${nome.slice(0,28).padEnd(28)} ${recs.length}r\n`);
      } else {
        vazios++;
      }
    } catch(e) {
      erros++;
      process.stdout.write(`  ERR [${done+1}] ${nome.slice(0,28)} ${e.message}\n`);
      if (e.message.includes('500') || e.message.includes('401')) {
        console.log('Sessao expirou! A guardar checkpoint...');
        const chk = OUTPUT.replace('.json', `-chk-${done}.json`);
        result.gerado_em = new Date().toISOString();
        result.total_jogadores = Object.keys(result.jogadores).length;
        fs.mkdirSync(path.dirname(chk), { recursive: true });
        fs.writeFileSync(chk, JSON.stringify(result, null, 2), 'utf8');
        console.log(`Checkpoint: ${path.basename(chk)}`);
        console.log(`Retomar: node fetch-all-player-results.js --resume=${path.basename(chk)}`);
        break;
      }
    }

    done++;

    if (done % 10 === 0) {
      const s   = Math.round((Date.now()-t0)/1000);
      const eta = done > 0 ? Math.round((Date.now()-t0)/done*(feds.length-done)/1000) : '?';
      console.log(`  -- ${done}/${feds.length} (${Math.round(done/feds.length*100)}%) | ${Object.keys(result.jogadores).length} com dados | ${s}s | ETA ${eta}s`);
    }

    if (done % CHK_EVERY === 0 && done > 0) {
      result.gerado_em = new Date().toISOString();
      result.total_jogadores = Object.keys(result.jogadores).length;
      const chk = OUTPUT.replace('.json', `-chk-${done}.json`);
      fs.mkdirSync(path.dirname(chk), { recursive: true });
      fs.writeFileSync(chk, JSON.stringify(result, null, 2), 'utf8');
      console.log(`  Checkpoint: ${path.basename(chk)}`);
    }

    await sleep(DELAY);
  }

  result.gerado_em = new Date().toISOString();
  result.total_jogadores = Object.keys(result.jogadores).length;
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf8');

  const mins = ((Date.now()-t0)/60000).toFixed(1);
  console.log(`\nConcluido em ${mins}min`);
  console.log(`${result.total_jogadores} jogadores com dados`);
  console.log(`${result.total_registos} registos totais`);
  console.log(`${vazios} sem dados | ${erros} erros`);
}

main().catch(e => { console.error(e); process.exit(1); });
