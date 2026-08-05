/**
 * scripts/aggregator/sources/ejt.js
 *
 * Adapter — Estonian Junior Tour (Estonian Golf Association), circuito de 6
 * etapas/ano por campos estónios. Lê ejt{n}_YYYY.json (1 ficheiro POR ETAPA,
 * JobFile do scrape-golfbox.js) — o sourceKey é o nome do ficheiro, por isso
 * cada etapa entra como torneio próprio sem código extra. Divisões "Boys U9"…
 * "Girls U21" → sexo M/F + idade MÁXIMA. Fonte FRACA (nome+país): o GolfBox
 * expõe ANO de nascimento (→ dobRange) mas não a data completa.
 * Scraper: scrape-golfbox.js (entradas "ejt1"…"ejt6" em scripts/golfbox-scope.json).
 */
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "ejt",
  sourceLabel: "Estonian Junior Tour",
  pattern: /^ejt\d_\d{4}\.json$/,
  seriesId: "estonian-junior-tour",
  seriesLabel: "Estonian Junior Tour",
  parseDiv: (divKey) => {
    // "Boys U9" / "Girls U21": U{n} = idade MÁXIMA (o parseSexAge genérico lê
    // o número como idade exacta porque o U está colado ao número).
    const base = parseSexAge(divKey);
    const m = /\bU\s?-?\s?(\d{1,2})\b/i.exec(divKey || "");
    return m ? { ageMin: null, ageMax: +m[1], sex: base.sex } : base;
  },
});
