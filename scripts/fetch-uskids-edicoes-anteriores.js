'use strict';
/**
 * fetch-uskids-edicoes-anteriores.js
 *
 * Fase 2 das edições anteriores USKids (20/10/2026): vai buscar à fonte os
 * escalões que a uskids-rich-flight-cache ainda não tem — a lista `faltam` do
 * public/data/uskids-edicoes/index.json (escrita pelo
 * build-uskids-edicoes-anteriores.js) — e no fim volta a montar as edições.
 *
 * Regras da USKids (docs/claude/uskids.md — já nos bloquearam a 12/09):
 *   - um pedido de cada vez (o scrape por flight é o do
 *     fetch-uskids-rich-players-node.js, sequencial) e uma pausa extra entre pedidos;
 *   - PARAR À PRIMEIRA RECUSA: HTTP 403/429/503 ou «Too many requests» (que vem
 *     em texto com HTTP 200) → nenhum pedido mais nesta corrida; grava-se o feito;
 *   - orçamento por corrida (--max-torneios, --max-pedidos): o resto fica para a
 *     noite seguinte (o workflow update-uskids-edicoes corre de madrugada).
 *
 *   node scripts/fetch-uskids-edicoes-anteriores.js [--max-torneios 20] [--max-pedidos 1500] [--pausa-ms 350]
 *   node scripts/fetch-uskids-edicoes-anteriores.js --t 18975,15923     # só estes
 *
 * Exit: 0 = avançou (ou parou numa recusa, com o feito gravado) · 2 = nada a fazer.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'public', 'data', 'uskids-edicoes', 'index.json');

function arg(nome, def) {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] : def;
}
const MAX_TORNEIOS = Number(arg('--max-torneios', 20));
const MAX_PEDIDOS = Number(arg('--max-pedidos', 1500));
const PAUSA_MS = Number(arg('--pausa-ms', 350));
const SO_T = arg('--t', '') ? new Set(arg('--t', '').split(',').map(Number).filter(Boolean)) : null;

// ── Guarda à volta do fetch: conta pedidos, pausa, pára à primeira recusa ──
let pedidos = 0;
let paragem = null; // motivo, quando pára
const fetchOriginal = globalThis.fetch;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
globalThis.fetch = async (url, opts) => {
  if (paragem) throw new Error(`parado: ${paragem}`);
  if (pedidos >= MAX_PEDIDOS) { paragem = `orçamento de ${MAX_PEDIDOS} pedidos`; throw new Error(paragem); }
  await sleep(PAUSA_MS);
  pedidos++;
  if (process.env.DEBUG_PEDIDOS) console.log('   ·', String(url).replace(/^.*\?op=/, ''));
  const r = await fetchOriginal(url, opts);
  const txt = await r.text();
  if ([403, 429, 503].includes(r.status) || /too many requests/i.test(txt.slice(0, 200))) {
    paragem = `recusa da fonte (HTTP ${r.status}: ${txt.slice(0, 60).replace(/\s+/g, ' ')})`;
    throw new Error(paragem);
  }
  return new Response(txt, { status: r.status, statusText: r.statusText, headers: r.headers });
};

const { fetchTournamentRichData, loadFlightCache, saveFlightCache, apiGet, API } = require('./fetch-uskids-rich-players-node.js');
const { escaloesDaProva } = require('./build-uskids-edicoes-anteriores.js');

async function main() {
  if (!fs.existsSync(INDEX)) {
    console.log('Sem índice — a correr o build primeiro.');
    execFileSync(process.execPath, [path.join(__dirname, 'build-uskids-edicoes-anteriores.js')], { stdio: 'inherit' });
  }
  const idx = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  let lista = (idx.faltam || []).filter(f => !SO_T || SO_T.has(f.t));
  if (!lista.length) { console.log('Nada em falta.'); process.exitCode = 2; return; }
  lista = lista.slice(0, MAX_TORNEIOS);
  console.log(`Em falta: ${(idx.faltam || []).length} torneios · nesta corrida: ${lista.length} (máx. ${MAX_PEDIDOS} pedidos, pausa ${PAUSA_MS} ms)`);

  const cache = loadFlightCache();
  let feitos = 0;
  for (const f of lista) {
    if (paragem) break;
    let escaloes = f.escaloes;
    if (!escaloes) {
      // Nem o meta temos: 1 pedido para saber que escalões a prova teve.
      try { escaloes = escaloesDaProva(await apiGet(`${API}?op=GetMeta&t=${f.t}`, f.t)); }
      catch (e) { console.warn(`  ⚠️ GetMeta(${f.t}): ${e.message}`); continue; }
    }
    if (!escaloes.length) continue;
    console.log(`▶ ${f.name} (t=${f.t}, ${f.date}) — ${escaloes.length} escalões: ${escaloes.join(', ')}`);
    const antes = cache.torneios[String(f.t)];
    const copia = antes ? JSON.parse(JSON.stringify(antes)) : null;
    await fetchTournamentRichData(new Map([[f.t, new Set(escaloes)]]), cache);
    if (paragem) {
      // Parou a meio deste torneio: um flight a meio ficaria na cache como
      // completo (e nunca mais seria pedido) → repor o estado de antes.
      if (copia) cache.torneios[String(f.t)] = copia; else delete cache.torneios[String(f.t)];
      break;
    }
    feitos++;
  }
  saveFlightCache(cache);
  console.log(`\nPedidos feitos: ${pedidos} · torneios completos nesta corrida: ${feitos}/${lista.length}`);
  if (paragem) console.log(`::warning::Edições USKids: parei — ${paragem}. O feito ficou gravado; o resto fica para a próxima corrida.`);

  // Voltar a montar as edições com o que entrou na cache.
  execFileSync(process.execPath, [path.join(__dirname, 'build-uskids-edicoes-anteriores.js')], { stdio: 'inherit' });
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
