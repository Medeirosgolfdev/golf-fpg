/**
 * scripts/aggregator/sources/ggcondados.js
 *
 * Adapter — provas de juniores dos condados ingleses, de duas origens com o
 * mesmo formato (JobFile, uma prova por ficheiro, cada um com a sua série):
 *   - public/data/gg-condados/{circuito}_{data}_{evento}.json — circuitos no
 *     GolfGenius (BB&O Futures Tour, PING, Cheshire) — scrape-gg-condados.js;
 *   - public/data/ig-condados/{condado}_{data}_{compid}.json — campeonatos dos
 *     sites das associações de condado em intelligentgolf (Surrey, Kent,
 *     Lancashire…) — scrape-ig-condados.js (03/11/2026).
 * Por jogador o `hcpJogo` (handicap de jogo do dia; não é o HI). Os escalões
 * trazem o sexo no rótulo quando a fonte o diz.
 *
 * Fonte fraca (nome + país GB + clube); o matcher trata-a como o England.
 */
const path = require("path");
const { DATA_DIR } = require("../util/io");
const { buildJobfileSource, parseSexAge } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "ggcondados",
  sourceLabel: "Condados ingleses (GolfGenius + intelligentgolf)",
  dirs: [path.join(DATA_DIR, "gg-condados"), path.join(DATA_DIR, "ig-condados")],
  // o _estado.json do leitor dos condados não entra (começa por «_»)
  pattern: /^[a-z0-9-]+_\d{4}-\d{2}-\d{2}(?:_\w+)?\.json$/,
  seriesId: "ggc",
  seriesLabel: "Condados ingleses",
  defaultCountry: "GB",
  parseDiv: (divKey) => {
    const r = parseSexAge(divKey);
    return { ...r, ageMin: null };
  },
});
