/**
 * scripts/aggregator/sources/evianjc.js
 *
 * Adapter — The Amundi Evian Juniors Cup (Evian Resort, França).
 * Lê evianjc_YYYY.json (JobFile GolfGenius, divisão única). Prova Sub-14 de
 * seleções nacionais. O GG não diz o sexo; o scraper parte o campo em
 * "Boys U14"/"Girls U14" pelo tee de saída (White/Blue, `teeDivisions` no
 * scope) → idade fixa Sub-14, sexo tirado do label.
 * País vem da afiliação do tee sheet ("Départs"). Fonte fraca (nome + país).
 * Scraper: scrape-golfgenius-node.js (scope `evianjc`).
 */
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "evianjc",
  sourceLabel: "The Amundi Evian Juniors Cup (Sub-14)",
  pattern: /^evianjc_\d{4}\.json$/,
  seriesId: "evianjc",
  seriesLabel: "Evian Juniors Cup",
  parseDiv: (divKey) => ({ ageMin: null, ageMax: 14, sex: parseSexAge(divKey).sex }),
});
