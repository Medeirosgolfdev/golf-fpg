/**
 * scripts/aggregator/sources/dgu.js
 *
 * Adapter — Dansk Golf Union (Dinamarca), provas juvenis no GolfBox: Dormy Elite
 * Tour (Drenge U22 / Piger) e a Finale, o DM Juniorer (slagspil) e o Girls Only
 * Tour (só a Mesterrække). Classes «Drenge»/«Piger»; o Girls Only Tour é só de
 * raparigas e a classe «GOT Mesterrække» não o diz. Os adultos das classes
 * mistas («Herrer/Drenge») saem pelo ano de nascimento (maxAgeInYear 18).
 * Lê public/data/dgu/{competitionId}.json (scrape-golfbox-federacao.js --fed dgu).
 * Detalhe: util/golfbox-federacao.js.
 */
const { fonteGolfboxFederacao, parseDivGolfbox } = require("../util/golfbox-federacao");

module.exports = fonteGolfboxFederacao({
  sourceId: "dgu",
  sourceLabel: "DGU Dinamarca (provas juvenis)",
  seriesLabel: "DGU Dinamarca",
  country: "DK",
  linkSite: "DGU Dinamarca",
  parseDiv: (d) => {
    const r = parseDivGolfbox(d);
    return !r.sex && /\bGOT\b|girls only/i.test(d || "") ? { ...r, sex: "F" } : r;
  },
});
