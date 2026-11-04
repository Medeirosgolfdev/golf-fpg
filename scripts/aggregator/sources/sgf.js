/**
 * scripts/aggregator/sources/sgf.js
 *
 * Adapter — Svenska Golfförbundet (Suécia), provas juvenis de nível nacional no
 * GolfBox: Svenska Juniortouren Elit, a Final e o ANNIKA Invitational Europe.
 * Classes «Pojkar»/«Flickor». Lê public/data/sgf/{competitionId}.json
 * (scrape-golfbox-federacao.js --fed sgf). Detalhe: util/golfbox-federacao.js.
 */
const { fonteGolfboxFederacao, parseDivGolfbox } = require("../util/golfbox-federacao");

module.exports = fonteGolfboxFederacao({
  sourceId: "sgf",
  sourceLabel: "SGF Suécia (provas juvenis)",
  seriesLabel: "SGF Suécia",
  country: "SE",
  linkSite: "SGF Suécia",
  // o ANNIKA Invitational Europe é só de raparigas e a classe não o diz
  parseDiv: (d) => {
    const r = parseDivGolfbox(d);
    return !r.sex && /annika invitational/i.test(d || "") ? { ...r, sex: "F" } : r;
  },
});
