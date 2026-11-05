/**
 * scripts/aggregator/sources/rockleague.js
 *
 * Adapter — Rock Golf League (ex-Robert Rock Junior Golf Tour), as provas com
 * WAGR: European Masters / World WAGR Series em La Manga (Espanha), Al Hamra
 * (Emirados) e Fairmont St Andrews (Escócia). Escalões U12 (9 e 18 buracos), U14,
 * U16 e U21, rapazes e raparigas. Pedido dela (04/11/2026): as provas sub-14 são
 * agora as mais importantes — a alternativa europeia ao USKids.
 *
 * Lê rockleague{n}_YYYY.json (1 ficheiro POR ETAPA, n = ordem no ano, como o
 * faldo/ejt/optimist). Scraper: scrape-golfgenius-node.js (entradas rockleague{n}
 * no scripts/golfgenius-scope.json).
 */
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  metrosPorConfirmar: true, // «meters» do GolfGenius sem marca de conversão — podem ser jardas
  sourceId: "rockleague",
  sourceLabel: "Rock Golf League (Robert Rock)",
  pattern: /^rockleague\d+_\d{4}\.json$/,
  seriesId: "rockleague",
  seriesLabel: "Rock Golf League",
  parseDiv: (divKey) => {
    // «Under 14 Boys Gross», «U21 Boys Gross», «14 and Under Boys», «U12 Boys - 18 Hole»
    const s = String(divKey);
    const m = s.match(/\bU(?:nder)?\s*(\d{2})\b/i) || s.match(/\b(\d{2})\s*(?:&|and)\s*under\b/i);
    return { ageMin: null, ageMax: m ? +m[1] : null, sex: parseSexAge(divKey).sex };
  },
});
