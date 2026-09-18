'use strict';

/**
 * fill-uskids-names-by-order.js — dá nome aos jogadores do histórico USKids que
 * ficaram "?" (sem nome), das gerações seguidas (podeEntrar).
 *
 * Porque ficam sem nome: o histórico (GetMemberTournamentResults) não traz o
 * nome; o fetch-uskids-member-history.js descobre-o por impressão digital de
 * pancadas — mas só guarda cartões dos Boys 10-13, e os miúdos de 2012-2015
 * apareciam nos torneios antigos em escalões mais novos (Boys 6-9).
 *
 * Como: a lista do GetTournamentPlayers vem flight a flight e, dentro de cada
 * flight, por apelido+nome (ver scripts/lib/uskids-geracao.js). Como já sabemos
 * o escalão de cada memberID (`escaloes` na flight-cache), o bloco de um escalão
 * é um troço contíguo da lista. Basta pedir as flight_players DESSE escalão,
 * ordenar por apelido e emparelhar — não o torneio inteiro. Um nome já sabido
 * no mesmo bloco que não bata anula o bloco (associarPorOrdem).
 *
 * Uso:
 *   node scripts/fill-uskids-names-by-order.js --simular   # plano, 0 pedidos
 *   node scripts/fill-uskids-names-by-order.js             # pede e grava
 *
 * Pára à primeira recusa (HTTP 429) e grava o que já veio. Depois correr
 * split-member-history.js --from-chunks e build-member-history-slim.js.
 */

const fs = require('fs');
const { chromium } = require('playwright');
const { loadCache, writeSharded, initPage, pageJSON, API, FLIGHT_CACHE, ehRecusa } =
  require('./fetch-uskids-member-history');
const { podeEntrar, anoDaData, associarPorOrdem } = require('./lib/uskids-geracao');

const DELAY = 1200;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const simular = process.argv.includes('--simular');

async function main() {
  const cache = loadCache();
  const fc = JSON.parse(fs.readFileSync(FLIGHT_CACHE, 'utf8'));
  const semNome = Object.values(cache.jogadores).filter(j => !j.name || j.name === '?');

  // (tcode, escalão) → memberIDs sem nome que lá estão. Só gerações seguidas e
  // só torneios com escalões e lista guardados.
  const blocos = new Map();
  let foraDaRegra = 0, semEscaloes = 0;
  for (const j of semNome) {
    const opcoes = [];
    for (const [tc, t] of Object.entries(j.torneios || {})) {
      const ag = fc.torneios[tc]?.escaloes?.[j.memberId];
      if (!ag) continue;
      if (!podeEntrar(ag, anoDaData(t.startDate))) continue;
      opcoes.push(`${tc}|${ag}`);
    }
    if (!opcoes.length) {
      const temRegra = Object.values(j.torneios || {}).some(t => podeEntrar(t.ageGroup, anoDaData(t.startDate)));
      if (temRegra) semEscaloes++; else foraDaRegra++;
      continue;
    }
    for (const k of opcoes) {
      if (!blocos.has(k)) blocos.set(k, new Set());
      blocos.get(k).add(j.memberId);
    }
  }

  // Escolha gulosa: o bloco que resolve mais "?" de uma vez, até cobrir todos.
  const porResolver = new Set([...blocos.values()].flatMap(s => [...s]));
  const plano = [];
  while (porResolver.size) {
    let melhor = null, ganho = 0;
    for (const [k, s] of blocos) {
      const g = [...s].filter(m => porResolver.has(m)).length;
      if (g > ganho) { melhor = k; ganho = g; }
    }
    if (!melhor) break;
    plano.push(melhor);
    for (const m of blocos.get(melhor)) porResolver.delete(m);
  }

  const inscritosNoBloco = (tc, ag) =>
    Object.values(fc.torneios[tc].escaloes).filter(a => a === ag).length;
  const pedidos = plano.reduce((n, k) => {
    const [tc, ag] = k.split('|');
    return n + Math.ceil(inscritosNoBloco(tc, ag) / 20);
  }, 0) + new Set(plano.map(k => k.split('|')[0])).size; // + 1 GetMeta por torneio

  console.log(`Sem nome: ${semNome.length} · das gerações seguidas e com escalões guardados: ${new Set([...blocos.values()].flatMap(s => [...s])).size}`);
  console.log(`  fora da regra (não interessam): ${foraDaRegra} · da regra mas sem escalões guardados: ${semEscaloes}`);
  console.log(`Plano: ${plano.length} escalões em ${new Set(plano.map(k => k.split('|')[0])).size} torneios · ~${pedidos} pedidos (~${Math.round(pedidos * DELAY / 60000)} min)`);
  for (const k of plano) {
    const [tc, ag] = k.split('|');
    console.log(`  ${fc.torneios[tc].name} · ${ag}: ${blocos.get(k).size} sem nome em ${inscritosNoBloco(tc, ag)} inscritos`);
  }
  if (simular || !plano.length) return;

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  })).newPage();
  let nomeados = 0, recusados = 0;
  const metaDe = new Map();
  try {
    await initPage(page, plano[0].split('|')[0]);
    for (const k of plano) {
      const [tc, ag] = k.split('|');
      const t = fc.torneios[tc];
      try {
        if (!metaDe.has(tc)) {
          metaDe.set(tc, await pageJSON(page, `${API}?op=GetMeta&t=${tc}`));
          await sleep(DELAY);
        }
        const meta = metaDe.get(tc);
        const fid = Object.entries(meta.flights || {})
          .find(([, fl]) => (meta.age_groups?.[fl.age_group]?.name || fl.name) === ag)?.[0];
        if (!fid) { console.log(`  ⚠️ ${t.name} · ${ag}: escalão não encontrado`); recusados++; continue; }

        const nomes = [];
        for (let p = 1; p <= 20; p++) {
          const d = await pageJSON(page,
            `${API}?op=GetPlayerTeeTimes&f=${fid}&r=1&p=${p}&t=0&pt=undefined&jbgr=${Date.now()}&c=1`, 'POST');
          await sleep(DELAY);
          const e = Object.values(d?.flight_players || {});
          for (const pl of e) nomes.push({ first: pl.first || '', last: pl.last || '', country: pl.country || '', place: pl.place || '' });
          if (e.length < 20) break;
        }

        // O bloco do escalão = memberIDs da lista guardada com este escalão, pela ordem.
        const lista = Object.values(t.flights || {}).find(fl => fl.memberIds?.length)?.memberIds || [];
        const bloco = lista.filter(m => t.escaloes[String(m)] === ag);
        const conhecido = (mid) => cache.jogadores[mid]?.name || null;
        const { mapa, confirmados, motivo } = associarPorOrdem(bloco, [nomes], conhecido);
        if (motivo) { console.log(`  ⚠️ ${t.name} · ${ag}: recusado — ${motivo}`); recusados++; continue; }

        let aqui = 0;
        for (const [mid, info] of Object.entries(mapa)) {
          const j = cache.jogadores[mid];
          if (j && (!j.name || j.name === '?')) {
            j.name = info.name;
            if (!j.country && info.country) j.country = info.country;
            aqui++;
          }
        }
        nomeados += aqui;
        console.log(`  ✅ ${t.name} · ${ag}: ${aqui} nomes novos (${confirmados} confirmados)`);
      } catch (err) {
        if (ehRecusa(err)) { console.warn('  ⛔ USKids recusou (HTTP 429) — paro e gravo o que já veio'); break; }
        console.warn(`  ❌ ${t.name} · ${ag}: ${err.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  if (nomeados) {
    cache.gerado_em = new Date().toISOString();
    writeSharded(cache);
  }
  console.log(`\n${nomeados} jogadores passaram a ter nome · ${recusados} escalões recusados`);
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
