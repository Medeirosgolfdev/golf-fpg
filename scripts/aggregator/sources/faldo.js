/**
 * scripts/aggregator/sources/faldo.js
 *
 * Adapter — Faldo Junior Tour Europa (GolfGenius, directório «Faldo Junior Tour
 * Europe»). Lê faldo{n}_YYYY.json (1 ficheiro POR ETAPA, como o ejt/optimist).
 * Não são todas as etapas: só as europeias com força WAGR ≥ 20 (pedido da
 * Mariana, 02/11/2026 — perceber o nível para preparar 2027). A etapa da Madeira
 * fica na sua fonte (`faldomadeira`).
 *
 * Divisões: Boys/Girls 16 & Under e 21 & Under, mais as gerais «(WAGR)» e
 * «Overall Leaderboard» com as mesmas voltas — o umaDivisaoPorJogador deixa
 * cada jogador só no escalão. «16 & Under» / «16 and Under» = idade máx. 16 (o
 * parseSexAge leria 16–16); as gerais ficam com 21.
 * Scraper: scrape-golfgenius-node.js (entradas faldo1…faldo11 no scope).
 */
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "faldo",
  sourceLabel: "Faldo Junior Tour Europa",
  pattern: /^faldo\d+_\d{4}\.json$/,
  seriesId: "faldo",
  seriesLabel: "Faldo Junior Tour Europa",
  parseDiv: (divKey) => {
    const m = String(divKey).match(/(\d+)\s*(?:&|and)\s*under/i);
    return { ageMin: null, ageMax: m ? +m[1] : 21, sex: parseSexAge(divKey).sex };
  },
});
