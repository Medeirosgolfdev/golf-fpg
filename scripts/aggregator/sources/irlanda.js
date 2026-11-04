/**
 * scripts/aggregator/sources/irlanda.js
 *
 * Adapter — Golf Ireland (Irlanda), campeonatos juvenis no GolfGenius: Irish
 * Boys'/Girls' Open, Irish U14/U16, os Opens provinciais (Leinster, Munster,
 * Ulster, Connacht) U14–U18. Lê public/data/irlanda/irl-{pageId}_{ano}.json
 * (scrape-golf-ireland.js; o país dos jogadores vem da EGR, nunca o «US» por
 * omissão do GolfGenius). Classes «Boys Under 16 Championship», «U18 Girls»…
 * → sexo + idade máxima. Fonte FRACA (nome + país).
 */
const path = require("path");
const { DATA_DIR } = require("../util/io");
const { buildJobfileSource } = require("../util/jobfile");
const { parseDivGolfbox } = require("../util/golfbox-federacao");

module.exports = buildJobfileSource({
  sourceId: "irlanda",
  sourceLabel: "Golf Ireland (campeonatos juvenis)",
  dirs: [path.join(DATA_DIR, "irlanda")],
  pattern: /^irl-\d+_\d{4}\.json$/,
  seriesId: "golf-ireland",
  seriesLabel: "Golf Ireland",
  maxAgeInYear: 18,
  linkSite: "Golf Ireland",
  parseDiv: (divKey) => {
    const r = parseDivGolfbox(divKey);
    // «Under 16» / «U-16»
    const u = /\bunder\s?(\d{1,2})\b/i.exec(divKey || "");
    return u && r.ageMax == null ? { ...r, ageMax: +u[1] } : r;
  },
});
