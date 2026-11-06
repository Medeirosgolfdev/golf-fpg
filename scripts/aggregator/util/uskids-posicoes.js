/**
 * scripts/aggregator/util/uskids-posicoes.js — posições certas nos escalões USKids (05/11/2026).
 *
 * Três erros juntavam «dois leaderboards» no mesmo escalão (19 escalões com dois vencedores):
 *  1. Escalões grandes divididos por dois campos (World Championship 2023 Boys 10: 222
 *     jogadores, vencedores com 208 e 234). O histórico de membros diz só «Boys 10» e o lugar
 *     oficial de cada um no SEU leaderboard → `separarLeaderboards` reparte-os pelos lugares:
 *     num leaderboard, o lugar de um jogador = 1 + nº de jogadores com total menor.
 *  2. Quem falhou o cut tem a volta que não jogou com gross −18 e lugares que recomeçam em 1
 *     (World Championship 2024). A volta ≤ 0 sai no adapter; aqui ficam depois de quem acabou.
 *  3. Os jogadores que só vêm dos ficheiros de resultados eram ordenados só entre eles (lugar 1
 *     de novo) e juntos ao escalão que já tinha lugares oficiais → `refazerPosicoes`.
 */

const nVoltas = (r) => (r.rounds || []).filter((x) => typeof x.gross === 'number' && x.gross > 0).length;

/** Lugares com empates partilhados («T5») por ordem do total; devolve Map(result → pos). */
function lugaresPorTotal(lista, primeiro = 1) {
  const ord = [...lista].sort((a, b) => a.totalGross - b.totalGross);
  const out = new Map();
  ord.forEach((r, i) => {
    const prev = i > 0 ? ord[i - 1] : null;
    out.set(r, prev && prev.totalGross === r.totalGross ? out.get(prev) : primeiro + i);
  });
  return out;
}

/** Os lugares oficiais destes resultados formam UM leaderboard coerente? */
function coerente(lista) {
  const ord = [...lista].sort((a, b) => a.pos - b.pos || a.totalGross - b.totalGross);
  for (let i = 1; i < ord.length; i++) {
    const a = ord[i - 1], b = ord[i];
    if (b.totalGross < a.totalGross) return false;
    if (a.pos === b.pos && a.totalGross !== b.totalGross) return false;
  }
  // o lugar não pode passar o nº de jogadores com total menor + 1 (lugares a mais = buracos de
  // jogadores que não temos — normal quando só seguimos parte do field)
  return true;
}

/**
 * Reparte resultados com lugares oficiais por DOIS leaderboards. Só para quem acabou todas as
 * voltas. Devolve [A, B] ou null se não houver partição em que cada lugar = 1 + nº de jogadores
 * do mesmo leaderboard com total menor (exige o leaderboard completo nos dois lados).
 */
function separarLeaderboards(lista) {
  const grupos = [];
  const porChave = new Map();
  for (const r of [...lista].sort((a, b) => a.pos - b.pos || a.totalGross - b.totalGross)) {
    const k = `${r.pos}|${r.totalGross}`;
    let g = porChave.get(k);
    if (!g) { g = { pos: r.pos, total: r.totalGross, rs: [] }; porChave.set(k, g); grupos.push(g); }
    g.rs.push(r);
  }
  const visto = new Set();
  const escolha = [];
  // dfs(i, cA, cB, lastA, lastB): cada grupo vai para A, para B, ou reparte-se (empate igual nos dois)
  function dfs(i, cA, cB, lA, lB) {
    if (i === grupos.length) return cA > 0 && cB > 0;
    const key = `${i}|${cA}|${cB}|${lA}|${lB}`;
    if (visto.has(key)) return false;
    visto.add(key);
    const g = grupos[i], k = g.rs.length;
    const podeA = cA + 1 === g.pos && g.total > lA, podeB = cB + 1 === g.pos && g.total > lB;
    if (podeA && dfs(i + 1, cA + k, cB, g.total, lB)) { escolha[i] = [k, 0]; return true; }
    if (podeB && dfs(i + 1, cA, cB + k, lA, g.total)) { escolha[i] = [0, k]; return true; }
    if (podeA && podeB) {
      for (let a = 1; a < k; a++) if (dfs(i + 1, cA + a, cB + k - a, g.total, g.total)) { escolha[i] = [a, k - a]; return true; }
    }
    return false;
  }
  if (!dfs(0, 0, 0, -Infinity, -Infinity)) return null;
  const A = [], B = [];
  grupos.forEach((g, i) => { const [a] = escolha[i]; g.rs.forEach((r, j) => (j < a ? A : B).push(r)); });
  return [A, B];
}

/** Lugar oficial = veio do histórico de membros (`_slim`) com lugar. */
const oficial = (r) => r._slim && typeof r.pos === 'number';

/**
 * Acerta as posições de um escalão sem estragar os lugares oficiais (que já trazem os
 * desempates). Devolve true se mudou alguma coisa.
 *  - Quem acabou todas as voltas e veio só dos ficheiros de resultados (sem lugar oficial):
 *    lugar = 1 + nº de jogadores com total menor (empate partilhado).
 *  - Quem jogou menos voltas (cut, desistência) e tem um lugar que choca com os de quem
 *    acabou: passa para depois deles, por nº de voltas e total.
 *  - Um jogador do histórico sem lugar (desclassificado) continua sem lugar.
 */
function refazerPosicoes(results) {
  const comTotal = results.filter((r) => typeof r.totalGross === 'number' && r.totalGross > 0);
  if (!comTotal.length) return false;
  const max = Math.max(...comTotal.map(nVoltas));
  const contam = (r) => !r._slim || typeof r.pos === 'number';
  const cheios = comTotal.filter((r) => nVoltas(r) === max && contam(r));
  const parciais = comTotal.filter((r) => nVoltas(r) < max && contam(r));
  let mudou = false;
  const set = (r, p) => { if (r.pos !== p) { r.pos = p; mudou = true; } };
  for (const r of cheios) {
    if (oficial(r)) continue;
    set(r, 1 + cheios.filter((o) => o.totalGross < r.totalGross).length);
  }
  if (!parciais.length) return mudou;
  const maxCheio = Math.max(cheios.length, ...cheios.map((r) => r.pos || 0));
  const parciaisOk = parciais.every((r) => oficial(r) && r.pos > maxCheio) && coerente(parciais);
  if (!parciaisOk) {
    let base = maxCheio + 1;
    const porVoltas = new Map();
    for (const r of parciais) { const n = nVoltas(r); if (!porVoltas.has(n)) porVoltas.set(n, []); porVoltas.get(n).push(r); }
    for (const n of [...porVoltas.keys()].sort((a, b) => b - a)) {
      const l = porVoltas.get(n);
      for (const [r, p] of lugaresPorTotal(l, base)) set(r, p);
      base += l.length;
    }
  }
  return mudou;
}

/**
 * Impressão digital de um jogador numa prova: as pancadas das voltas jogadas, por ordem.
 * É igual no histórico de membros e nos flights da USKids (o `pid` dos flights é local,
 * não é o memberID — os cartões são a única ligação segura). null sem cartões.
 */
function cartaoDe(rounds) {
  const vs = (rounds || [])
    .filter((r) => Array.isArray(r.strokes) && r.strokes.some((v) => v > 0) && !(typeof r.gross === 'number' && r.gross <= 0))
    .sort((a, b) => a.round - b.round)
    .map((r) => r.strokes.filter((v) => v > 0).join('.'));
  return vs.length ? vs.join('|') : null;
}

/**
 * Reparte um escalão pelos flights da USKids (World Championship 2017/2023, World Teen
 * 2022/2023: flights «A» e «B» com leaderboards próprios). `div` vem do
 * `uskids-flights-divididos.json` (build-uskids-flights-divididos.js).
 * Cada jogador vai para o flight cujos cartões têm o dele; sem cartão nesse flight (a cache
 * só tem um dos dois) → o outro. Devolve null quando não dá para decidir com certeza:
 *  - não são exactamente 2 flights com inscritos, ou nenhum tem cartões;
 *  - um cartão que não está em nenhum dos dois flights com cartões;
 *  - flights com nº de voltas diferente: é o cut (World 2024 — o «B» é quem não passou),
 *    não outro leaderboard; aí vale o `refazerPosicoes`.
 * Quem não tem cartão nenhum (não jogou) fica em `semCartao`.
 */
function dividirPorFlights(results, div) {
  const fls = (div?.flights || []).filter((f) => f.inscritos > 0);
  if (fls.length !== 2) return null;
  const cartoes = new Map(fls.filter((f) => Array.isArray(f.cartoes) && f.cartoes.length).map((f) => [f, new Set(f.cartoes)]));
  if (!cartoes.size) return null;
  const semCache = fls.filter((f) => !cartoes.has(f));
  const grupos = new Map(fls.map((f) => [f, []]));
  const semCartao = [];
  for (const r of results) {
    const c = cartaoDe(r.rounds);
    if (!c) { semCartao.push(r); continue; }
    let alvo = [...cartoes].find(([, s]) => s.has(c))?.[0];
    if (!alvo) {
      if (semCache.length !== 1) return null;
      alvo = semCache[0];
    }
    grupos.get(alvo).push(r);
  }
  const voltas = (l) => Math.max(0, ...l.map(nVoltas));
  const [va, vb] = fls.map((f) => voltas(grupos.get(f)));
  if (!va || !vb || va !== vb) return null;
  // o flight base é o «A» (o par do escalão é o dele); o outro ganha um flight próprio
  const ordem = [...fls].sort((a, b) => (a.nome === 'A' ? -1 : b.nome === 'A' ? 1 : 0));
  return { flights: ordem.map((f) => ({ flight: f, results: grupos.get(f) })), semCartao };
}

module.exports = { separarLeaderboards, refazerPosicoes, coerente, nVoltas, oficial, cartaoDe, dividirPorFlights };
