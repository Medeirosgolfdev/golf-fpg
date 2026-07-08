/**
 * scripts/aggregator/sources/eym.js
 *
 * Adapter — European Young Masters (EGA), U16 misto (2 rapazes + 2 raparigas por
 * federação). Lê eym_YYYY.json (JobFile do scrape-golfbox.js, plataforma GolfBox
 * Livescoring). Divisões "Boys"/"Girls" → sexo M/F + idade máx 16. O GolfBox expõe
 * ANO de nascimento por jogador → dobRange anual (evidência de matching); sem data
 * completa continua a ser fonte fraca (nome+país), como o avtrophy.
 * Scraper: scrape-golfbox.js <competitionId> (5204492 = 2025, RCF La Boulie).
 */
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "eym",
  sourceLabel: "European Young Masters",
  pattern: /^eym_\d{4}\.json$/,
  seriesId: "european-young-masters",
  seriesLabel: "European Young Masters",
  parseDiv: (divKey) => {
    // "Boys"/"Girls" sem idade no label — o evento é U16.
    const base = parseSexAge(divKey);
    return { ageMin: null, ageMax: 16, sex: base.sex };
  },
});
