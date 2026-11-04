/**
 * scripts/aggregator/sources/oegv.js
 *
 * Adapter — Österreichischer Golf-Verband (Áustria), provas juvenis: Austrian
 * Juniors Golf Tour, Austrian Girls & Boys, Wiener Meisterschaften Jugend… Lê
 * public/data/oegv/{torneioId}.json (scrape-oegv-nexxchange.js: golf.at +
 * classificação do nexxchange). Classes «Burschen/Mädchen U14»; as vistas
 * «Gesamt», «National», «WAGR», «CUT» repetem jogadores e o jobfile deixa cada
 * um no escalão. Traz o HANDICAP de cada jogador à data (hcpHistory); só a
 * última volta tem buraco a buraco. Detalhe: util/golfbox-federacao.js.
 */
const { fonteGolfboxFederacao } = require("../util/golfbox-federacao");

module.exports = fonteGolfboxFederacao({
  sourceId: "oegv",
  sourceLabel: "ÖGV Áustria (provas juvenis)",
  seriesLabel: "ÖGV Áustria",
  country: "AT",
  linkSite: "ÖGV Áustria",
});
