#!/usr/bin/env node
/**
 * fetch-player-results-server.js
 *
 * Servidor local que:
 *  1. Serve o browser-script ao browser via /browser-script.js
 *  2. Recebe os resultados do browser e guarda em disco
 *  3. Mantém estado entre sessões (checkpoint automático)
 *
 * Uso:
 *   node fetch-player-results-server.js           # começa do zero
 *   node fetch-player-results-server.js --resume  # retoma checkpoint
 *
 * Depois no browser (scoring.fpg.pt, F12 Console):
 *   fetch("http://localhost:3457/browser-script.js").then(r=>r.text()).then(eval)
 *
 * Output: public/data/player-results-all.json
 */

'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT       = 3457;
const ROOT       = path.join(__dirname, '..');
const OUT        = path.join(ROOT, 'public', 'data', 'player-results-all.json');
const STATE_FILE = path.join(ROOT, 'public', 'data', 'player-results-state.json');
const PLAYERS    = path.join(ROOT, 'public', 'data', 'players.json');

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', X = '\x1b[0m', B = '\x1b[1m', D = '\x1b[2m';

const args = process.argv.slice(2);
const resume = args.includes('--resume');

// ── Carregar lista de feds ────────────────────────────────────────
let allFeds;
if (fs.existsSync(PLAYERS)) {
  const players = JSON.parse(fs.readFileSync(PLAYERS, 'utf8'));
  allFeds = Object.keys(players);
  console.log(`${D}players.json: ${allFeds.length} jogadores${X}`);
} else {
  // fallback: lista hardcoded
  allFeds = ["2195", "2217", "6437", "8334", "9572", "20292", "20877", "27849", "28845", "28894", "29593", "30970", "31111", "31408", "31550", "31745", "31830", "31831", "31899", "32252", "32263", "32437", "32543", "32579", "33193", "33403", "33628", "33811", "33815", "33823", "33956", "34029", "34082", "34166", "34186", "34238", "34270", "34430", "34895", "35085", "35233", "35404", "35596", "35715", "35814", "35849", "35874", "36028", "36148", "36413", "36638", "36678", "36810", "36811", "36832", "36844", "36864", "36901", "36995", "37010", "37152", "37216", "37318", "37561", "37570", "37633", "37678", "37680", "37704", "37875", "38006", "38082", "38233", "38253", "38315", "38334", "38375", "38424", "38580", "38633", "38668", "38718", "38722", "38976", "39055", "39097", "39116", "39375", "39439", "39465", "39468", "39524", "39552", "39701", "39878", "39900", "39986", "40093", "40112", "40115", "40196", "40318", "40390", "40407", "40444", "40452", "40473", "40492", "40534", "40563", "40645", "40656", "40682", "40754", "40761", "40910", "40928", "40957", "40958", "40981", "40990", "40992", "41080", "41108", "41121", "41124", "41130", "41131", "41173", "41294", "41461", "41593", "41608", "41609", "41612", "41613", "41744", "41799", "41875", "42068", "42178", "42205", "42273", "42374", "42684", "42690", "42845", "42908", "42920", "42952", "42985", "43053", "43221", "43359", "43732", "43810", "43832", "43846", "43904", "43968", "43972", "44018", "44019", "44160", "44406", "44453", "44615", "44617", "44649", "44677", "44681", "44722", "44821", "44844", "44890", "44891", "44934", "45009", "45278", "45340", "45343", "45356", "45366", "45393", "45424", "45425", "45429", "45439", "45475", "45499", "45608", "45647", "45812", "45869", "45918", "46009", "46026", "46037", "46038", "46079", "46153", "46195", "46296", "46297", "46299", "46308", "46309", "46310", "46311", "46314", "46395", "46414", "46415", "46437", "46475", "46480", "46481", "46482", "46489", "46577", "46589", "46591", "46606", "46706", "46853", "46873", "46948", "47002", "47003", "47078", "47341", "47374", "47495", "47552", "47556", "47576", "47677", "47697", "47810", "47819", "47869", "48021", "48045", "48046", "48052", "48102", "48113", "48132", "48164", "48297", "48470", "48529", "48531", "48622", "48628", "48629", "48705", "48791", "48794", "48933", "48946", "48971", "48990", "49011", "49012", "49066", "49076", "49085", "49087", "49124", "49205", "49209", "49215", "49296", "49300", "49328", "49329", "49342", "49528", "49628", "49714", "49717", "49770", "49926", "50011", "50042", "50053", "50087", "50189", "50193", "50215", "50247", "50299", "50398", "50450", "50451", "50467", "50485", "50526", "50528", "50594", "50628", "50648", "50671", "50703", "50761", "50786", "50831", "50919", "51074", "51081", "51150", "51180", "51182", "51313", "51352", "51430", "51523", "51524", "51612", "51671", "51803", "51804", "51937", "51940", "51949", "52011", "52048", "52069", "52077", "52088", "52168", "52229", "52270", "52393", "52431", "52487", "52488", "52647", "52663", "52713", "52724", "52773", "52798", "52815", "52856", "52880", "52884", "52956", "52984", "53150", "53172", "53304", "53532", "53548", "53645", "53646", "53687", "53696", "53714", "53715", "53728", "53749", "53755", "53780", "53838", "53847", "53900", "53932", "53981", "54232", "54241", "54255", "54264", "54281", "54330", "54476", "54550", "54551", "54713", "54757", "54774", "54809", "54845", "54888", "55056", "55065", "55093", "55094", "55147", "55188", "55269", "55270", "55301", "55398", "55466", "55498", "55539", "55540", "55697", "55727", "55914", "55954", "56026", "56048", "56072", "56118", "56491", "56527", "56604", "56632", "56641", "56647", "56654", "56696", "56705", "56717", "56718", "56728", "56749", "56765", "56803", "56943", "56944", "56984", "57110", "57134", "57291", "57356", "57454", "57640", "57756", "57903", "57904", "58043", "58051", "58327", "58429", "58431", "58484", "58580", "58581", "58760", "58833", "58886", "58936", "58937", "58960", "58962", "58969", "58984", "59008", "59128", "59252"];
  console.log(`${D}Lista hardcoded: ${allFeds.length} jogadores${X}`);
}

// ── Estado ────────────────────────────────────────────────────────
let state = {
  gerado_em: '',
  total_jogadores: 0,
  total_registos: 0,
  done_feds: {},   // fed -> true (já processados)
  jogadores: {}     // fed -> {count, records}
};

if (resume && fs.existsSync(STATE_FILE)) {
  state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const n = Object.keys(state.done_feds).length;
  console.log(`${Y}Retomando: ${n} feitos, ${allFeds.length - n} por fazer${X}`);
}

// Feds ainda por fazer
let pendingFeds = allFeds.filter(f => !state.done_feds[f]);
let fedIdx = 0;

function saveState() {
  state.gerado_em = new Date().toISOString();
  state.total_jogadores = Object.keys(state.jogadores).length;
  state.total_registos = Object.values(state.jogadores).reduce((s, j) => s + j.count, 0);
  fs.mkdirSync(path.dirname(STATE_FILE), {recursive: true});
  fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
  // Também guardar o output final (sem done_feds para não ser enorme)
  const out = {
    gerado_em: state.gerado_em,
    total_jogadores: state.total_jogadores,
    total_registos: state.total_registos,
    jogadores: state.jogadores
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
}

// ── Browser script ────────────────────────────────────────────────
const BROWSER_SCRIPT = `
(async () => {
const SERVER  = 'http://localhost:3457';
const BASE    = 'https://scoring.fpg.pt/lists';
const DELAY   = 100;
const PAGE    = 500;

async function post(body) {
  const r = await fetch(BASE + '/PlayerResults.aspx/ResultsLST', {
    method: 'POST',
    headers: {'Content-Type':'application/json; charset=utf-8','x-requested-with':'XMLHttpRequest'},
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  return d?.d?.Records || d?.Records || [];
}

async function fetchAll(fed) {
  const all = [];
  for (let p = 0; p < 20; p++) {
    const recs = await post({fed_code: String(fed), jtStartIndex: String(p*PAGE), jtPageSize: String(PAGE)});
    all.push(...recs);
    if (recs.length < PAGE) break;
    await new Promise(r => setTimeout(r, DELAY));
  }
  return all;
}

function simplify(recs) {
  return recs.map(r => ({
    date: r.score_dateStr?.slice(0,10),
    tourn: r.tournament_description,
    course: r.course_description,
    par: r.par_total, holes: r.hole_count,
    gross: r.gross_total === 998 ? null : r.gross_total,
    toPar: r.calc_field2, stb: r.calculated_stablnet_total,
    hcpDay: r.exact_hcp, hcpAfter: r.calculated_exact_hcp,
    playHcp: r.play_hcp, diff: r.score_differential,
    origin: r.score_origin, status: r.status_name,
    qualifying: r.hcp_qualifying_name === 'Sim',
    tid: r.tournament_id,
  }));
}

// UI
const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;top:16px;right:16px;z-index:99999;background:#1a2e1a;color:#e8eddf;border:2px solid #3fb950;border-radius:10px;padding:14px 18px;font-family:monospace;font-size:12px;min-width:320px;';
panel.innerHTML = '<b style="color:#3fb950">📊 PlayerResults → disco</b><div id="_st" style="margin:6px 0;color:#8b949e">A iniciar...</div><div style="background:#21262d;border-radius:3px;height:4px;margin-bottom:5px"><div id="_bar" style="background:#3fb950;height:4px;border-radius:3px;width:0%;transition:width .2s"></div></div><div id="_inf" style="color:#484f58;font-size:11px"></div>';
document.body.appendChild(panel);
const st  = t => document.getElementById('_st').textContent = t;
const inf = t => document.getElementById('_inf').textContent = t;
const bar = p => document.getElementById('_bar').style.width = p + '%';

// Verificar sessão FPG
st('A verificar sessão FPG...');
try {
  const test = await post({fed_code: '49085', jtStartIndex: '0', jtPageSize: '1'});
  if (!test.length) throw new Error('sem dados');
} catch(e) {
  st('❌ Sessão FPG inválida: ' + e.message); return;
}

// Verificar servidor local
st('A verificar servidor local...');
try {
  const r = await fetch(SERVER + '/ping');
  if (!r.ok) throw new Error('offline');
} catch(e) {
  st('❌ Servidor local offline. Corre: node fetch-player-results-server.js'); return;
}

// Buscar lista de feds do servidor
const {feds, resume} = await (await fetch(SERVER + '/feds')).json();
st('Sessão OK · ' + feds.length + ' jogadores por processar...');

let done = 0, total = feds.length;
const t0 = Date.now();

for (const fed of feds) {
  let recs = [];
  try {
    recs = await fetchAll(fed);
  } catch(e) {
    if (e.message.includes('500')) {
      st('⚠️ Sessão expirou ao jogador ' + done);
      await fetch(SERVER + '/checkpoint', {method:'POST'});
      return;
    }
  }

  if (recs.length > 0) {
    await fetch(SERVER + '/save', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({fed, records: simplify(recs)})
    });
  }

  done++;
  const pct = Math.round(done/total*100);
  const s   = Math.round((Date.now()-t0)/1000);
  const eta = done > 0 ? Math.round((Date.now()-t0)/done*(total-done)/1000) : '?';
  bar(pct);
  inf(pct + '% · ' + done + '/' + total + ' · ' + s + 's · ETA ' + eta + 's');

  await new Promise(r => setTimeout(r, DELAY));
}

await fetch(SERVER + '/done', {method:'POST'});
st('✅ Concluído!');
})();
`;

// ── Servidor HTTP ─────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // GET /ping
  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, pending: pendingFeds.length}));
    return;
  }

  // GET /feds — devolve lista de feds pendentes
  if (req.method === 'GET' && req.url === '/feds') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({feds: pendingFeds, total: allFeds.length, done: Object.keys(state.done_feds).length}));
    return;
  }

  // GET /browser-script.js
  if (req.method === 'GET' && req.url === '/browser-script.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    res.end(BROWSER_SCRIPT);
    return;
  }

  // POST /save — recebe resultados de um jogador
  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const {fed, records} = JSON.parse(body);
        state.jogadores[fed] = {count: records.length, records};
        state.done_feds[fed] = true;
        const total = Object.keys(state.done_feds).length;
        const pct = Math.round(total / allFeds.length * 100);
        process.stdout.write(`\r  ${G}${pct}%${X} ${total}/${allFeds.length} · ${fed} (${records.length}r)      `);
        if (total % 50 === 0) { saveState(); process.stdout.write('\n  💾 checkpoint\n'); }
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ok: true}));
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({error: e.message})); }
    });
    return;
  }

  // POST /checkpoint — guardar estado intermédio
  if (req.method === 'POST' && req.url === '/checkpoint') {
    saveState();
    console.log(`\n${Y}Checkpoint guardado (${Object.keys(state.done_feds).length} feitos)${X}`);
    console.log(`Retomar: node fetch-player-results-server.js --resume`);
    res.writeHead(200); res.end(JSON.stringify({ok: true}));
    return;
  }

  // POST /done — concluído
  if (req.method === 'POST' && req.url === '/done') {
    saveState();
    const n = Object.keys(state.jogadores).length;
    const r = state.total_registos;
    console.log(`\n${B}${G}===========================================${X}`);
    console.log(`${G}✅  player-results-all.json${X}`);
    console.log(`    ${n} jogadores com dados`);
    console.log(`    ${r} registos totais`);
    console.log(`${B}${G}===========================================${X}`);
    res.writeHead(200); res.end(JSON.stringify({ok: true}));
    server.close();
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`${B}${G}===========================================${X}`);
  console.log(`${G}📊 PlayerResults Server · porta ${PORT}${X}`);
  console.log(`   ${allFeds.length} jogadores · ${pendingFeds.length} por processar`);
  console.log(`${B}${G}===========================================${X}`);
  console.log('');
  console.log('No browser (scoring.fpg.pt, F12 Console):');
  console.log(`  ${G}fetch("http://localhost:${PORT}/browser-script.js").then(r=>r.text()).then(eval)${X}`);
  console.log('');
});
