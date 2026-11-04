/**
 * scripts/aggregator/sources/swissgolf.js
 *
 * Adapter — Swiss Golf (Suíça), provas juvenis no GolfBox: Junior Tour,
 * National Events U14, National Championships U10–U18 e finais U10–U18.
 * Lê public/data/swissgolf/{competitionId}.json (scrape-golfbox-federacao.js
 * --fed swissgolf). Traz o que o EGR não tem: clube, ano, handicap do dia e as
 * voltas buraco a buraco; o dedup genérico do EGR tira a versão EGR da mesma
 * prova (Mariana, 04/11/2026: «para enriquecer os dados do egr»).
 * Detalhe: util/golfbox-federacao.js.
 */
const { fonteGolfboxFederacao } = require("../util/golfbox-federacao");

module.exports = fonteGolfboxFederacao({
  sourceId: "swissgolf",
  sourceLabel: "Swiss Golf (provas juvenis)",
  seriesLabel: "Swiss Golf",
  country: "CH",
  linkSite: "Swiss Golf",
});
