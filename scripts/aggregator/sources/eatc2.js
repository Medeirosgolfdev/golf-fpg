/**
 * scripts/aggregator/sources/eatc2.js
 *
 * Adapter — EGA European Amateur Team Championship, Div. 2 (homens). Lê
 * eatc2_YYYY.json (JobFile do scrape-golfbox.js). Torneio "open"/sénior
 * masculino — a maioria são adultos, por isso a porta de idade maxAgeInYear=18
 * filtra tudo o que não seja juvenil (só entram os rapazes U18 que joguem pela
 * selecção). Divisão única "Individual" → sexo M. Fonte FRACA (nome+país+dobRange).
 * Scraper: scrape-golfbox.js <competitionId> (golfbox-scope.json).
 */
const { buildJobfileSource } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "eatc2",
  sourceLabel: "European Amateur Team Championship, Div. 2",
  pattern: /^eatc2_\d{4}\.json$/,
  seriesId: "ega-mens-team-div2",
  seriesLabel: "ETC Men 2",
  maxAgeInYear: 18,
  parseDiv: () => ({ ageMin: null, ageMax: 18, sex: "M" }),
});
