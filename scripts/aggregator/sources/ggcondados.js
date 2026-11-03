/**
 * scripts/aggregator/sources/ggcondados.js
 *
 * Adapter — circuitos de juniores dos condados ingleses no GolfGenius (BB&O
 * Futures Tour, …). Lê public/data/gg-condados/{circuito}_{data}.json (JobFile
 * do scrape-gg-condados.js): uma prova de uma volta por ficheiro, escalões
 * U12/U14/U16 com o sexo no rótulo, e por jogador o `hcpJogo` (Gross − Net do
 * dia). Cada ficheiro traz a sua série (seriesId/seriesLabel).
 *
 * Fonte fraca (nome + país GB + clube); o matcher trata-a como o England.
 */
const path = require("path");
const { DATA_DIR } = require("../util/io");
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "ggcondados",
  sourceLabel: "Condados ingleses (GolfGenius)",
  dir: path.join(DATA_DIR, "gg-condados"),
  pattern: /^[a-z0-9-]+_\d{4}-\d{2}-\d{2}(?:_\w+)?\.json$/,
  seriesId: "ggc",
  seriesLabel: "Condados ingleses",
  defaultCountry: "GB",
  parseDiv: (divKey) => {
    const r = parseSexAge(divKey);
    return { ...r, ageMin: null };
  },
});
