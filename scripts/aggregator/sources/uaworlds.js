/**
 * scripts/aggregator/sources/uaworlds.js
 *
 * Adapter — The Junior Tour Powered by Under Armour, **World Championship**
 * (uagolftour.com/worlds). Lê uaworlds_YYYY.json (JobFile GolfGenius, escalões
 * Boys/Girls 8&Under→15-18). Fonte fraca (nome + país US).
 * Scraper: scrape-golfgenius-node.js.
 *
 * ⚠ Prova DIFERENTE do `uajt` (Summer National Championship) da mesma tour —
 * partilham nome comercial mas são eventos distintos, com campos e datas
 * próprios; manter fontes separadas para o kids2 não fundir participações.
 */
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "uaworlds",
  sourceLabel: "The Junior Tour (Under Armour) — World Championship",
  pattern: /^uaworlds_\d{4}\.json$/,
  seriesId: "ua-worlds",
  seriesLabel: "Under Armour World Championship",
  defaultCountry: "US",
  parseDiv: parseSexAge,
});
