/**
 * scripts/aggregator/sources/faldomadeira.js
 *
 * Adapter — Faldo Junior Tour Madeira (Clube de Golf Santo da Serra).
 * Lê faldomadeira_YYYY.json (JobFile GolfGenius). O GG não diz sexo, escalão
 * nem HCP: o scraper parte o campo em "Boys"/"Girls" pelo tee de saída
 * (White/Yellow, `teeDivisions` no scope) e junta HCP + dob + clube dos
 * portugueses pelos federados FPG (`fpgFederados`) → matching forte nome+DOB
 * para eles; estrangeiros só por nome. Escalões 16&U e 21&U → idade máx. 21.
 * Scraper: scrape-golfgenius-node.js (scope `faldomadeira`).
 */
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "faldomadeira",
  sourceLabel: "Faldo Junior Tour Madeira",
  pattern: /^faldomadeira_\d{4}\.json$/,
  seriesId: "faldomadeira",
  seriesLabel: "Faldo Junior Tour Madeira",
  parseDiv: (divKey) => ({ ageMin: null, ageMax: 21, sex: parseSexAge(divKey).sex }),
});
