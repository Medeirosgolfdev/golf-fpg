/**
 * scripts/aggregator/sources/elg.js
 *
 * Adapter — EGA European Ladies' Team Championship. Lê elg_YYYY.json (JobFile do
 * scrape-golfbox.js). Torneio "open"/sénior feminino — a maioria são adultas, por
 * isso a porta de idade maxAgeInYear=18 filtra tudo o que não seja juvenil (só
 * entram as raparigas U18 que joguem pela selecção). Divisão única "Individual" →
 * sexo F. Fonte FRACA (nome+país+dobRange).
 * Scraper: scrape-golfbox.js <competitionId> (golfbox-scope.json).
 */
const { buildJobfileSource } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "elg",
  sourceLabel: "European Ladies' Team Championship",
  pattern: /^elg_\d{4}\.json$/,
  seriesId: "ega-ladies-team",
  seriesLabel: "ETC Ladies",
  maxAgeInYear: 18,
  parseDiv: () => ({ ageMin: null, ageMax: 18, sex: "F" }),
});
