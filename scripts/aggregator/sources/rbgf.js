/**
 * scripts/aggregator/sources/rbgf.js
 *
 * Adapter — Royal Belgian Golf Federation (Bélgica), provas juvenis no GolfBox:
 * Junior U12 & U14, Junior Opens (54 buracos), National Juniors Championship,
 * Junior Masters e finais U12/U14. Lê public/data/rbgf/{competitionId}.json
 * (scrape-golfbox-federacao.js --fed rbgf). O Albert Vermeiren Trophy, que é da
 * mesma federação, continua na fonte `avtrophy`. Detalhe: util/golfbox-federacao.js.
 */
const { fonteGolfboxFederacao } = require("../util/golfbox-federacao");

module.exports = fonteGolfboxFederacao({
  sourceId: "rbgf",
  sourceLabel: "RBGF Bélgica (provas juvenis)",
  seriesLabel: "RBGF Bélgica",
  country: "BE",
});
