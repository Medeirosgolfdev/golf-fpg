/**
 * scripts/aggregator/sources/coc.js
 *
 * Adapter — 'Champion of Champions' World Championship (Lough Erne Resort,
 * Irlanda do Norte). Lê coc_YYYY.json (JobFile GolfGenius, escalões
 * "Under 7/9/12/14/15/19 Boys|Girls"). Convite mundial de campeões nacionais:
 * ~250 miúdos de 40+ países por edição, cada um com a bandeira do SEU país
 * (a afiliação no GG é o próprio país) — daí não haver `defaultCountry`.
 * Fonte fraca (nome + país). Scraper: scrape-golfgenius-node.js.
 */
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "coc",
  sourceLabel: "Champion of Champions World Championship",
  pattern: /^coc_\d{4}\.json$/,
  seriesId: "coc-world",
  seriesLabel: "Champion of Champions",
  parseDiv: parseSexAge,
});
