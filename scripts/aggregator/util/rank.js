/**
 * scripts/aggregator/util/rank.js
 *
 * Reconstroi as POSICOES de uma lista de resultados a partir dos totais.
 *
 * Duas fontes precisam disto, por razoes diferentes:
 *   - bluegolf (wjgc/bjgt/fcg/jwgc): a BlueGolf so imprime a posicao do PRIMEIRO
 *     de cada empate, os restantes vem em branco.
 *   - england (GolfGenius): o `data-rank` da leaderboard conta TODAS as linhas
 *     da tabela, e o GG poe DUAS linhas por jogador (gross + sub-linha). Dava
 *     posicoes 1, 3, 5, 7... com 144 jogadores a acabar no lugar 288, e os
 *     empates nunca partilhavam lugar. A /england nunca mostrou isto porque o
 *     `loadT` da pagina ja recalculava; o kids2 e que consumia o valor cru.
 *
 * Regras (as mesmas que a UI aplica): ordena por total, empates PARTILHAM o
 * lugar e ocupam-no (1, 2, 2, 4); quem nao completou todas as rondas fica sem
 * posicao e passa a CUT; quem nao tem total nenhum fica DNS.
 *
 * ⚠ Muta os objectos recebidos (pos/status) e NAO reordena o array.
 */

function rankResults(results, holesPerRound) {
  const withRounds = results.filter((r) => r.rounds.length > 0 && r.totalGross != null);
  if (!withRounds.length) return;
  const maxR = Math.max(...withRounds.map((r) => r.rounds.length));
  const isComplete = (r) =>
    r.status !== "DNS" &&
    r.rounds.length === maxR &&
    r.rounds.every((rd) =>
      rd.gross != null &&
      (!Array.isArray(rd.strokes) || rd.strokes.filter((s) => s > 0).length >= holesPerRound)
    );

  const ranked = withRounds
    .map((r) => ({ r, complete: isComplete(r) }))
    .sort((a, b) => (a.complete !== b.complete ? (a.complete ? -1 : 1) : a.r.totalGross - b.r.totalGross));

  let pos = 1;
  ranked.forEach((entry, i) => {
    if (!entry.complete) {
      entry.r.pos = null;
      if (entry.r.status === "OK") entry.r.status = "CUT"; // não terminou
      return;
    }
    const prev = ranked[i - 1];
    if (i > 0 && prev && prev.complete && entry.r.totalGross > prev.r.totalGross) pos = i + 1;
    entry.r.pos = pos;
  });

  // Sem total não há posição possível (inscrito que não jogou).
  for (const r of results) {
    if (r.totalGross == null || r.rounds.length === 0) {
      r.pos = null;
      if (r.status === "OK") r.status = "DNS";
    }
  }
}

module.exports = { rankResults };
