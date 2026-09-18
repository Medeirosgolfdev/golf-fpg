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
 * flight, por apelido (ver scripts/lib/uskids-geracao.js). Como se sabe o
 * escalão de cada memberID (`escaloes` na flight-cache), o bloco de um escalão
 * é um troço contíguo da lista: basta pedir as flight_players DESSE escalão e
 * emparelhar. Irmãos com o mesmo apelido ligam-se pelo nome (a USKids não os
 * ordena pelo primeiro nome); um nome conhecido sem par anula o bloco.
 *
 * Passos:
 *   1. Torneios seguidos sem `escaloes` guardados (edições antigas) → 2 pedidos
 *      (GetMeta + GetTournamentPlayers) e ficam guardados na flight-cache.
 *   2. Plano guloso: o bloco que resolve mais "?" de uma vez.
 *   3. Bloco recusado → os miúdos dele voltam ao plano com os OUTROS torneios.
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
const { podeEntrar, anoDaData, associarPorOrdem, escaloesPelaOrdem } = require('./lib/uskids-geracao');

const DELAY = 1200;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const simular = process.argv.includes('--simular');

const semNomeJ = (j) => !j.name || j.name === '?';
const listaDe = (t) => t.lista || Object.values(t.flights || {}).find(fl => fl.memberIds?.length)?.memberIds || [];

/** "?" das gerações seguidas → blocos (tcode|escalão) onde podem ser resolvidos. */
function blocosPorResolver(cache, fc, recusados) {
  const blocos = new Map();
  const semEscaloes = new Set();
  for (const j of Object.values(cache.jogadores)) {
    if (!semNomeJ(j)) continue;
    // O MIÚDO tem de ser das gerações seguidas; o escalão que dá o nome pode
    // ser qualquer um onde ele jogou (o nome é o mesmo).
    if (!Object.values(j.torneios || {}).some(t => podeEntrar(t.ageGroup, anoDaData(t.startDate)))) continue;
    for (const tc of Object.keys(j.torneios || {})) {
      const ft = fc.torneios[tc];
      if (!ft) continue;
      const ag = ft.escaloes?.[j.memberId];
      if (!ag) { if (!ft.escaloes) semEscaloes.add(tc); continue; }
      const k = `${tc}|${ag}`;
      if (recusados.has(k)) continue;
      if (!blocos.has(k)) blocos.set(k, new Set());
      blocos.get(k).add(j.memberId);
    }
  }
  return { blocos, semEscaloes };
}

function planear(blocos) {
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
  return plano;
}

async function main() {
  const cache = loadCache();
  const fc = JSON.parse(fs.readFileSync(FLIGHT_CACHE, 'utf8'));
  const recusados = new Set();
  let { blocos, semEscaloes } = blocosPorResolver(cache, fc, recusados);
  const nSem = Object.values(cache.jogadores).filter(semNomeJ).length;
  console.log(`Sem nome: ${nSem} · das gerações seguidas, resolúveis já: ${new Set([...blocos.values()].flatMap(s => [...s])).size}`);
  console.log(`Torneios sem escalões guardados a preparar (2 pedidos cada): ${semEscaloes.size}`);
  const plano0 = planear(blocos);
  console.log(`Plano inicial: ${plano0.length} escalões`);
  if (simular) {
    for (const tc of semEscaloes) console.log(`  + escalões: ${fc.torneios[tc].name}`);
    for (const k of plano0) { const [tc, ag] = k.split('|'); console.log(`  ${fc.torneios[tc].name} · ${ag}: ${blocos.get(k).size} sem nome`); }
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  })).newPage();
  let nomeados = 0, parar = false, fcMudou = false;
  const metaDe = new Map();
  const obterMeta = async (tc) => {
    if (!metaDe.has(tc)) { metaDe.set(tc, await pageJSON(page, `${API}?op=GetMeta&t=${tc}`)); await sleep(DELAY); }
    return metaDe.get(tc);
  };

  try {
    await initPage(page, [...semEscaloes][0] || plano0[0]?.split('|')[0] || '22243');

    // 1. Escalões das edições que não os tinham.
    for (const tc of semEscaloes) {
      try {
        const meta = await obterMeta(tc);
        const fid = Object.keys(meta.flights || {})[0];
        if (!fid) continue;
        const tp = await pageJSON(page, `${API}?op=GetTournamentPlayers&t=${tc}&f=${fid}`);
        await sleep(DELAY);
        const lista = tp?.PlayerNodeId || [];
        const conhecidoAg = (mid) => cache.jogadores[mid]?.torneios?.[tc]?.ageGroup || null;
        const { mapa, motivo } = escaloesPelaOrdem(meta, lista, conhecidoAg);
        if (motivo) { console.log(`  ⚠️ escalões ${fc.torneios[tc].name}: ${motivo}`); continue; }
        fc.torneios[tc].escaloes = mapa;
        fc.torneios[tc].lista = lista;
        fcMudou = true;
        console.log(`  🗂️ escalões ${fc.torneios[tc].name}: ${lista.length} inscritos`);
      } catch (err) {
        if (ehRecusa(err)) { console.warn('  ⛔ USKids recusou (HTTP 429) — paro e gravo o que já veio'); parar = true; break; }
        console.warn(`  ❌ escalões t=${tc}: ${err.message}`);
      }
    }

    // 2-3. Plano, execução e re-plano com os blocos recusados de fora.
    for (let volta = 1; !parar; volta++) {
      ({ blocos } = blocosPorResolver(cache, fc, recusados));
      const plano = planear(blocos);
      if (!plano.length) break;
      console.log(`\nVolta ${volta}: ${plano.length} escalões`);
      let progresso = false;
      for (const k of plano) {
        const [tc, ag] = k.split('|');
        const t = fc.torneios[tc];
        try {
          const meta = await obterMeta(tc);
          // Um escalão grande pode vir partido em várias flights com o mesmo
          // nome (World 2024 Boys 9: 2×61) — juntam-se pela ordem do GetMeta.
          const fids = Object.entries(meta.flights || {})
            .filter(([, fl]) => (meta.age_groups?.[fl.age_group]?.name || fl.name) === ag).map(([f]) => f);
          if (!fids.length) { recusados.add(k); console.log(`  ⚠️ ${t.name} · ${ag}: escalão não encontrado`); continue; }
          // Um bloco por flight: cada flight tem a sua ordem alfabética.
          const blocosNomes = [];
          for (const fid of fids) {
            const nomes = [];
            blocosNomes.push(nomes);
            for (let p = 1; p <= 20; p++) {
              const d = await pageJSON(page,
                `${API}?op=GetPlayerTeeTimes&f=${fid}&r=1&p=${p}&t=0&pt=undefined&jbgr=${Date.now()}&c=1`, 'POST');
              await sleep(DELAY);
              const e = Object.values(d?.flight_players || {});
              for (const pl of e) nomes.push({ first: pl.first || '', last: pl.last || '', country: pl.country || '', place: pl.place || '' });
              if (e.length < 20) break;
            }
          }
          const bloco = listaDe(t).filter(m => t.escaloes[String(m)] === ag);
          const conhecido = (mid) => cache.jogadores[mid]?.name || null;
          const { mapa, confirmados, motivo } = associarPorOrdem(bloco, blocosNomes, conhecido);
          if (motivo) { recusados.add(k); console.log(`  ⚠️ ${t.name} · ${ag}: recusado — ${motivo}`); continue; }
          let aqui = 0;
          for (const [mid, info] of Object.entries(mapa)) {
            const j = cache.jogadores[mid];
            if (j && semNomeJ(j)) {
              j.name = info.name;
              if (!j.country && info.country) j.country = info.country;
              aqui++;
            }
          }
          // Sem nomes novos (ex.: irmãos sem nenhum conhecido) → não voltar a tentar.
          if (!aqui) recusados.add(k); else progresso = true;
          nomeados += aqui;
          console.log(`  ✅ ${t.name} · ${ag}: ${aqui} nomes novos (${confirmados} confirmados)`);
        } catch (err) {
          if (ehRecusa(err)) { console.warn('  ⛔ USKids recusou (HTTP 429) — paro e gravo o que já veio'); parar = true; break; }
          recusados.add(k);
          console.warn(`  ❌ ${t.name} · ${ag}: ${err.message}`);
        }
      }
      if (!progresso && !recusados.size) break;
    }
  } finally {
    await browser.close();
  }

  if (fcMudou) { fc.gerado_em = new Date().toISOString(); fs.writeFileSync(FLIGHT_CACHE, JSON.stringify(fc)); }
  if (nomeados) { cache.gerado_em = new Date().toISOString(); writeSharded(cache); }
  const nFim = Object.values(cache.jogadores).filter(semNomeJ).length;
  console.log(`\n${nomeados} jogadores passaram a ter nome · sem nome: ${nSem} → ${nFim} · ${recusados.size} escalões recusados`);
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
