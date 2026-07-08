/**
 * scripts/aggregator/sources/egtc.js
 *
 * Adapter — EGA European Girls' Team Championship (U18). Lê egtc_YYYY.json
 * (JobFile do scrape-golfbox.js). Divisão única "Individual" → sexo F forçado.
 * birthYear por jogador → dobRange anual. Fonte FRACA (nome+país+dobRange).
 * Scraper: scrape-golfbox.js <competitionId> (golfbox-scope.json).
 */
const { buildJobfileSource } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "egtc",
  sourceLabel: "European Girls' Team Championship",
  pattern: /^egtc_\d{4}\.json$/,
  seriesId: "ega-girls-team",
  seriesLabel: "ETC Girls",
  maxAgeInYear: 18,
  parseDiv: () => ({ ageMin: null, ageMax: 18, sex: "F" }),
});
