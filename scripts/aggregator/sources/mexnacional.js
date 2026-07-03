/**
 * scripts/aggregator/sources/mexnacional.js
 *
 * Adapter — Campeonato Nacional Infantil Juvenil (Federación Mexicana de Golf).
 * Lê mexnacional_YYYY.json (JobFile GolfGenius). Divisões "Varonil/Femenil {idade}"
 * → sexo M/F + idade. País por defeito MX. **Traz `dob`** (ficha GG /profiles) →
 * matching FORTE por nome+DOB no identity-matcher (como o fcg catalão).
 * Scraper: scrape-golfgenius-node.js --country MX (perfis auto-ligados).
 */
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "mexnacional",
  sourceLabel: "Campeonato Nacional Infantil Juvenil (México)",
  pattern: /^mexnacional_\d{4}\.json$/,
  seriesId: "mex-nacional-infantil-juvenil",
  seriesLabel: "Nacional Infantil Juvenil (México)",
  defaultCountry: "MX",
  parseDiv: parseSexAge,
});
