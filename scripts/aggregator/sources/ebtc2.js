/**
 * scripts/aggregator/sources/ebtc2.js
 *
 * Adapter — EGA European Boys' Team Championship, Div. 2 (U18). Lê ebtc2_YYYY.json
 * (JobFile do scrape-golfbox.js). Divisão única "Individual" → sexo M forçado
 * (torneio masculino). Traz birthYear por jogador → dobRange anual (matching médio,
 * discrimina homónimos por ano). U18 já garante juniores, mas mantemos maxAgeInYear
 * por segurança. Fonte FRACA (nome+país+dobRange).
 * Scraper: scrape-golfbox.js <competitionId> (golfbox-scope.json).
 */
const { buildJobfileSource } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "ebtc2",
  sourceLabel: "European Boys' Team Championship Div. 2",
  pattern: /^ebtc2_\d{4}\.json$/,
  seriesId: "ega-boys-team-div2",
  seriesLabel: "ETC Boys (Div. 2)",
  maxAgeInYear: 18,
  parseDiv: () => ({ ageMin: null, ageMax: 18, sex: "M" }),
});
