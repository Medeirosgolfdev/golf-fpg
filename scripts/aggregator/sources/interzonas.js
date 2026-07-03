/**
 * scripts/aggregator/sources/interzonas.js
 *
 * Adapter — Campeonato Nacional Interzonas Lorena Ochoa (Federación Mexicana de
 * Golf), prova por equipas com classificação individual geral. Lê
 * interzonas_YYYY.json (JobFile GolfGenius, divisão "Individual General" mista).
 * Traz `dob` da ficha GG → matching FORTE por nome+DOB. Scraper:
 * scrape-golfgenius-node.js --country MX.
 */
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "interzonas",
  sourceLabel: "Nacional Interzonas (México)",
  pattern: /^interzonas_\d{4}\.json$/,
  seriesId: "mex-interzonas",
  seriesLabel: "Nacional Interzonas Lorena Ochoa (México)",
  defaultCountry: "MX",
  parseDiv: parseSexAge,
});
