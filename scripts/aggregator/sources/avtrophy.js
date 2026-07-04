/**
 * scripts/aggregator/sources/avtrophy.js
 *
 * Adapter — Belgian International Golf Championship U14 (Albert Vermeiren Trophy),
 * organizado pela Royal Belgian Golf Federation. Lê avtrophy_YYYY.json (JobFile
 * do scrape-golfbox.js, plataforma GolfBox Livescoring). Divisões "Boys U14"/
 * "Girls U14" → sexo M/F + idade máx 14. Fonte FRACA (nome+país): o GolfBox expõe
 * ANO de nascimento por jogador mas não a data completa, por isso não há chave
 * forte (dob) — funde por nome+país como o UA/FSGA.
 * Scraper: scrape-golfbox.js <competitionId>.
 */
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "avtrophy",
  sourceLabel: "Belgian Intl U14 — Albert Vermeiren Trophy",
  pattern: /^avtrophy_\d{4}\.json$/,
  seriesId: "belgian-intl-u14",
  seriesLabel: "BEL U14 (Albert Vermeiren)",
  parseDiv: (divKey) => {
    // "Boys U14" / "Girls U14": U14 = idade MÁXIMA (o parseSexAge genérico lê
    // "14" como idade exacta porque o U está colado ao número).
    const base = parseSexAge(divKey);
    const m = /\bU\s?-?\s?(\d{1,2})\b/i.exec(divKey || "");
    return m ? { ageMin: null, ageMax: +m[1], sex: base.sex } : base;
  },
});
