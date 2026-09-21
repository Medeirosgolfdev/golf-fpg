/**
 * scripts/aggregator/sources/evianjc.js
 *
 * Adapter — The Amundi Evian Juniors Cup (Evian Resort, França).
 * Lê evianjc_YYYY.json (JobFile GolfGenius, divisão única). Prova Sub-14 de
 * seleções nacionais; em 2026 rapazes e raparigas partilham o draw e o GG não
 * diz o sexo → idade fixa Sub-14 e sexo só se o label da divisão o trouxer
 * ("Boys"/"Girls", caso o leaderboard venha partido).
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
