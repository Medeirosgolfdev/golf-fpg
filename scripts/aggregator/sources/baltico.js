/**
 * scripts/aggregator/sources/baltico.js
 *
 * Adapter — provas juvenis dos Bálticos no GolfBox: Letónia (federação: BTA
 * Latvijas Junioru golfa tūre e Latvian Junior Open) e o Lithuanian Junior
 * Open (no calendário do clube que o organiza). A Estónia tem fontes próprias
 * (`ejo`, `ejt`). Lê public/data/baltico/{competitionId}.json
 * (scrape-golfbox-federacao.js --fed baltico). Detalhe: util/golfbox-federacao.js.
 */
const { fonteGolfboxFederacao } = require("../util/golfbox-federacao");

module.exports = fonteGolfboxFederacao({
  sourceId: "baltico",
  sourceLabel: "Bálticos — Letónia e Lituânia (provas juvenis)",
  seriesLabel: "Bálticos",
  country: null,
  linkSite: "GolfBox",
});
