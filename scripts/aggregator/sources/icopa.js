/**
 * scripts/aggregator/sources/icopa.js
 *
 * Adapter — Copa Bobby Díaz (Federación Mexicana de Golf, escalões 7-15).
 * Lê icopa_YYYY.json (JobFile GolfGenius, Varonil/Femenil por idade). Traz `dob`
 * da ficha GG → matching FORTE por nome+DOB. Scraper: scrape-golfgenius-node.js
 * --country MX.
 */
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "icopa",
  sourceLabel: "Copa Bobby Díaz (México)",
  pattern: /^icopa_\d{4}\.json$/,
  seriesId: "mex-copa-bobby-diaz",
  seriesLabel: "Copa Bobby Díaz (México)",
  defaultCountry: "MX",
  parseDiv: parseSexAge,
});
