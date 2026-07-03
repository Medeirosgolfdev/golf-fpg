/**
 * scripts/aggregator/sources/fsga.js
 *
 * Adapter — Florida State Golf Association (Boys' Junior Championship). Lê
 * fsga_YYYY.json (JobFile GolfGenius). Campeonato de rapazes → sexo "M"; a
 * divisão "Overall" não tem idade, a "13-15" traz o intervalo. Fonte fraca
 * (nome + país US). Scraper: scrape-fsga.js.
 */
const { buildJobfileSource } = require("../util/jobfile");

function parseDiv(divKey) {
  const s = String(divKey || "");
  const range = /(\d+)\s*(?:-|&|to)\s*(\d+)/.exec(s);
  if (range) return { ageMin: +range[1], ageMax: +range[2], sex: "M" };
  return { ageMin: null, ageMax: null, sex: "M" }; // "Overall"
}

module.exports = buildJobfileSource({
  sourceId: "fsga",
  sourceLabel: "Florida State Golf Association",
  pattern: /^fsga_\d{4}\.json$/,
  seriesId: "fsga-boys-junior",
  seriesLabel: "FSGA Boys' Junior Championship",
  defaultCountry: "US",
  parseDiv,
});
