/**
 * scripts/aggregator/sources/ngf.js
 *
 * Adapter — Norges Golfforbund (Noruega), provas juvenis no GolfBox: o Srixon
 * Tour (U19) e o Junior NM por pancadas. Classes «Gutter/Jenter 13-15 år»,
 * «G19-klassen»/«J15-klassen». Lê public/data/ngf/{competitionId}.json
 * (scrape-golfbox-federacao.js --fed ngf). Detalhe: util/golfbox-federacao.js.
 */
const { fonteGolfboxFederacao } = require("../util/golfbox-federacao");

module.exports = fonteGolfboxFederacao({
  sourceId: "ngf",
  sourceLabel: "NGF Noruega (provas juvenis)",
  seriesLabel: "NGF Noruega",
  country: "NO",
  linkSite: "NGF Noruega",
});
