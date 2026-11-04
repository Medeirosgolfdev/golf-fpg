/**
 * scripts/aggregator/util/golfbox-federacao.js
 *
 * Fonte kids2 de uma federação lida pelo scripts/scrape-golfbox-federacao.js
 * (GolfBox, 1 ficheiro POR PROVA em public/data/{sourceId}/{competitionId}.json,
 * JobFile). O sourceKey é o nome do ficheiro.
 *
 * Classes «Boys U14», «Girls U18-U16», «Boys» (= overall): sexo + idade MÁXIMA;
 * sem «U» a idade fica em aberto, para o escalão com idade ganhar ao overall no
 * `umaDivisaoPorJogador` do jobfile.js. O GolfBox dá o ANO de nascimento, não a
 * data → fonte FRACA (nome + país); chave por jogador `gb{RefID}`.
 */
const path = require("path");
const { DATA_DIR } = require("./io");
const { buildJobfileSource } = require("./jobfile");

function parseDivGolfbox(divKey) {
  const s = String(divKey || "");
  const sex = /boys|knaben|gar[cç]ons|jongens/i.test(s) ? "M" : /girls|m(ä|ae)dchen|filles|meisjes/i.test(s) ? "F" : null;
  // «U18-U16» → a maior; «U12/U10» idem
  const us = [...s.matchAll(/\bU\s?(\d{1,2})\b/gi)].map((m) => +m[1]);
  return { ageMin: null, ageMax: us.length ? Math.max(...us) : null, sex };
}

/** @param {{sourceId:string, sourceLabel:string, seriesLabel:string, country:string}} o */
function fonteGolfboxFederacao(o) {
  return buildJobfileSource({
    sourceId: o.sourceId,
    sourceLabel: o.sourceLabel,
    dirs: [path.join(DATA_DIR, o.sourceId)],
    pattern: /^\d+\.json$/,
    seriesId: `${o.sourceId}-junior`,
    seriesLabel: o.seriesLabel,
    defaultCountry: o.country,
    maxAgeInYear: 18,
    parseDiv: parseDivGolfbox,
  });
}

module.exports = { fonteGolfboxFederacao, parseDivGolfbox };
