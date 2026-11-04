/**
 * scripts/aggregator/sources/scottishgolf.js
 *
 * Adapter — Scottish Golf, campeonatos juvenis em stroke play (Boys'/Girls'
 * Open, Under 16 Open, Amateur e o Under 14 Open). Lê
 * public/data/scottishgolf/{competitionId}.json (scrape-scottishgolf.js, API
 * pública do scottishgolf.org). Divisões «Boys U16», «Girls U14»…; buraco a
 * buraco de todas as voltas; clube dos escoceses, país dos estrangeiros; sem
 * nascimento nem HCP (fonte fraca: nome + país). Detalhe: util/golfbox-federacao.js.
 */
const { fonteGolfboxFederacao } = require("../util/golfbox-federacao");

module.exports = fonteGolfboxFederacao({
  sourceId: "scottishgolf",
  sourceLabel: "Scottish Golf (campeonatos juvenis)",
  seriesLabel: "Scottish Golf",
  country: "GB-SCT",
  linkSite: "Scottish Golf",
});
