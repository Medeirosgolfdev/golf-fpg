/**
 * scripts/aggregator/sources/optimist.js
 *
 * Adapter — Optimist International Junior Golf Championships (PGA National até
 * 2024, Trump National Doral 2025-26). Lê optimist{1..3}_YYYY.json (JobFile do
 * scrape-golfgenius-node.js): 3 fases por ano, por escalões — Phase 1 = Boys
 * 10-11/12-13 + Girls 10-12 (o universo do Manuel), Phase 2 = 14-15/13-14,
 * Phase 3 = 16-18/15-18. ~600 miúdos de 25+ países por edição.
 *
 * Fonte fraca (nome + país do roster GG "Players"); o Graduation Year do
 * roster dá um dobRange de 2 anos (grad−19..grad−18) via dobRangeFromGrad —
 * evidência compatível no Pass 2 do matcher, como o birthYearEst do gjgl.
 */
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "optimist",
  sourceLabel: "Optimist International Junior Golf Championships",
  pattern: /^optimist[123]_\d{4}\.json$/,
  seriesId: "optimist-intl",
  seriesLabel: "Optimist International",
  parseDiv: parseSexAge,
  dobRangeFromGrad: true,
});
