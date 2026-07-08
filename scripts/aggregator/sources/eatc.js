/**
 * scripts/aggregator/sources/eatc.js
 *
 * Adapter — EGA European Amateur Team Championship (homens). Lê eatc_YYYY.json
 * (JobFile do scrape-golfbox.js). Torneio "open"/sénior masculino — a maioria são
 * adultos, por isso a porta de idade maxAgeInYear=18 filtra tudo o que não seja
 * juvenil (só entram os rapazes U18 que joguem pela selecção). Divisão única
 * "Individuals" → sexo M. Fonte FRACA (nome+país+dobRange).
 * Scraper: scrape-golfbox.js <competitionId> (golfbox-scope.json).
 */
const { buildJobfileSource } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "eatc",
  sourceLabel: "European Amateur Team Championship",
  pattern: /^eatc_\d{4}\.json$/,
  seriesId: "ega-mens-team",
  seriesLabel: "ETC Men",
  maxAgeInYear: 18,
  parseDiv: () => ({ ageMin: null, ageMax: 18, sex: "M" }),
});
