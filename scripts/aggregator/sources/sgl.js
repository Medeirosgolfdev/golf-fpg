/**
 * scripts/aggregator/sources/sgl.js
 *
 * Adapter — Suomen Golfliitto (Finlândia), provas juvenis no GolfBox: FootJoy
 * Finnish Junior Tour, Junior SM por pancadas, Finnish International Junior
 * (U14/U16) e a qualificação do JR SM. Classes «Pojat/Tytöt U18», «Tytöt-16».
 * Lê public/data/sgl/{competitionId}.json (scrape-golfbox-federacao.js --fed sgl).
 * Detalhe: util/golfbox-federacao.js.
 */
const { fonteGolfboxFederacao } = require("../util/golfbox-federacao");

module.exports = fonteGolfboxFederacao({
  sourceId: "sgl",
  sourceLabel: "Golfliitto Finlândia (provas juvenis)",
  seriesLabel: "Golfliitto Finlândia",
  country: "FI",
  linkSite: "Golfliitto Finlândia",
});
