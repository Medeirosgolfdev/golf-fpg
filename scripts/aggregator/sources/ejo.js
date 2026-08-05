/**
 * scripts/aggregator/sources/ejo.js
 *
 * Adapter — Estonian Junior Open (Estonian Golf Association, Rae Golf/White
 * Beach/etc.). Lê ejo_YYYY.json (JobFile do scrape-golfbox.js, plataforma
 * GolfBox Livescoring). Divisões "Boys U12"…"Girls U21" → sexo M/F + idade
 * MÁXIMA. Os ficheiros trazem `dob` COMPLETA por jogador (enriquecida pelo
 * scrape-golfbox.js via PlayersHandler/GetPlayers, opção `entries` no scope) →
 * matching por nome+DOB, como o fcg/mexnacional.
 * Scraper: scrape-golfbox.js (entrada "ejo" em scripts/golfbox-scope.json).
 */
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "ejo",
  sourceLabel: "Estonian Junior Open",
  pattern: /^ejo_\d{4}\.json$/,
  seriesId: "estonian-junior-open",
  seriesLabel: "Estonian Junior Open",
  parseDiv: (divKey) => {
    // "Boys U14" / "Girls U21": U{n} = idade MÁXIMA (o parseSexAge genérico lê
    // "14" como idade exacta porque o U está colado ao número).
    const base = parseSexAge(divKey);
    const m = /\bU\s?-?\s?(\d{1,2})\b/i.exec(divKey || "");
    return m ? { ageMin: null, ageMax: +m[1], sex: base.sex } : base;
  },
});
