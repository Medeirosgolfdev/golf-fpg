/**
 * scripts/aggregator/sources/stars5.js
 *
 * Adapter — 5 Stars Junior Cup by Adrian Meronk (Polónia), o circuito juvenil
 * polaco no GolfBox (customer 2299). Classes «U14 Boys», «U18 Girls»; as vistas
 * «EGR/WAGR Man/Woman» repetem jogadores e o jobfile deixa cada um no escalão;
 * o U25 sai pelo ano de nascimento. Lê public/data/stars5/{competitionId}.json
 * (scrape-golfbox-federacao.js --fed stars5). Detalhe: util/golfbox-federacao.js.
 */
const { fonteGolfboxFederacao } = require("../util/golfbox-federacao");

module.exports = fonteGolfboxFederacao({
  sourceId: "stars5",
  sourceLabel: "5 Stars Junior Cup (Polónia)",
  seriesLabel: "5 Stars Junior Cup",
  country: "PL",
  linkSite: "5 Stars Junior Cup",
});
