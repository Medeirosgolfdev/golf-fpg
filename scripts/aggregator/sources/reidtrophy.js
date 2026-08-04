/**
 * scripts/aggregator/sources/reidtrophy.js
 *
 * Adapter — Reid Trophy (English Boys' U14 Open Amateur, England Golf).
 * Lê reidtrophy_YYYY.json (JobFile GolfGenius, divisão única "Reid Trophy").
 * O label da divisão não traz sexo nem idade → parseDiv fixo: rapazes, U14
 * (é a definição do torneio). País vem do roster "List of Players" do GG
 * (campo internacional forte: ~1/3 do field vem de fora de Inglaterra, incl.
 * portugueses) — daí não haver `defaultCountry`.
 * Fonte fraca (nome + país). Scraper: scrape-golfgenius-node.js.
 * Edições 2023-25 vivem no formato england_reid-trophy-*.json (adapter england).
 */
const { buildJobfileSource } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "reidtrophy",
  sourceLabel: "Reid Trophy (English Boys' U14 Open Amateur)",
  pattern: /^reidtrophy_\d{4}\.json$/,
  seriesId: "reidtrophy",
  seriesLabel: "Reid Trophy",
  parseDiv: () => ({ ageMin: null, ageMax: 14, sex: "M" }),
});
