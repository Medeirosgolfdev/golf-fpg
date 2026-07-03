/**
 * scripts/aggregator/sources/uajt.js
 *
 * Adapter — The Junior Tour Powered by Under Armour (Summer National
 * Championship). Lê uajt_YYYY.json (JobFile GolfGenius, escalões Boys/Girls
 * 8U→15-18). Fonte fraca (nome + país US). Scraper: scrape-golfgenius-node.js.
 */
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "uajt",
  sourceLabel: "The Junior Tour (Under Armour)",
  pattern: /^uajt_\d{4}\.json$/,
  seriesId: "ua-junior-tour",
  seriesLabel: "Under Armour Junior Tour",
  defaultCountry: "US",
  parseDiv: parseSexAge,
});
