/**
 * scripts/aggregator/sources/swissgolf.js
 *
 * Adapter — Swiss Golf (Suíça), provas juvenis no GolfBox: Junior Tour,
 * National Events U14, National Championships U10–U18 e finais U10–U18.
 * Lê public/data/swissgolf/{competitionId}.json (1 ficheiro POR PROVA, JobFile
 * do scrape-swissgolf.js) — o sourceKey é o nome do ficheiro.
 *
 * Divisões "Boys U14" / "Girls U18" / "Boys U18-U16" → sexo + idade MÁXIMA.
 * O GolfBox dá o ANO de nascimento, não a data → fonte FRACA (nome + país);
 * chave por jogador `gb{RefID}`. Traz o que o EGR não tem: clube, ano, handicap
 * do dia e as voltas buraco a buraco; o dedup genérico do EGR tira a versão
 * EGR da mesma prova (Mariana, 04/11/2026: «para enriquecer os dados do egr»).
 */
const path = require("path");
const { DATA_DIR } = require("../util/io");
const { buildJobfileSource } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "swissgolf",
  sourceLabel: "Swiss Golf (provas juvenis)",
  dirs: [path.join(DATA_DIR, "swissgolf")],
  pattern: /^\d+\.json$/,
  seriesId: "swissgolf-junior",
  seriesLabel: "Swiss Golf",
  defaultCountry: "CH",
  maxAgeInYear: 18,
  parseDiv: (divKey) => {
    const s = String(divKey || "");
    const sex = /boys|knaben|gar[cç]ons/i.test(s) ? "M" : /girls|m(ä|ae)dchen|filles/i.test(s) ? "F" : null;
    // «U18-U16» → a maior; «U12/U10» idem
    const us = [...s.matchAll(/\bU\s?(\d{1,2})\b/gi)].map((m) => +m[1]);
    return { ageMin: null, ageMax: us.length ? Math.max(...us) : 18, sex };
  },
});
