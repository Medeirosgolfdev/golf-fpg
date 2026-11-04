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
  // inglês (também Male/Female, Man/Woman), alemão (Burschen/Mädchen), francês,
  // neerlandês, sueco (Pojkar/Flickor), dinamarquês (Drenge/Piger), norueguês
  // (Gutter/Jenter, «GU19»/«JU19», «G19-klassen»), finlandês (Pojat/Tytöt) e polaco
  const sex = /boys|knaben|burschen|gar[cç]ons|jongens|pojkar|drenge|gutter|pojat|ch[łl]opcy|\bmale\b|\bman\b|\bGU\d|\bG\d{2}-klass/i.test(s) ? "M"
    : /girls|m(ä|ae)dchen|filles|meisjes|flickor|piger|jenter|tyt[öo]t|dziewcz|female|wom[ae]n|\bJU\d|\bJ\d{2}-klass/i.test(s) ? "F" : null;
  // a idade máxima: «U18-U16» / «U12/U10» → a maior; «16-19 år» → 19;
  // «Tytöt-18» / «Girls-16» → 18 / 16; «G19-klassen» → 19
  const idades = [
    ...[...s.matchAll(/\bU\s?(\d{1,2})\b/gi)].map((m) => +m[1]),
    ...[...s.matchAll(/\b\d{1,2}\s*-\s*(\d{1,2})\s*år\b/gi)].map((m) => +m[1]),
    ...[...s.matchAll(/[a-zäöå]-(\d{2})\b/gi)].map((m) => +m[1]),
    ...[...s.matchAll(/\b[GJ](\d{2})-klass/gi)].map((m) => +m[1]),
  ];
  return { ageMin: null, ageMax: idades.length ? Math.max(...idades) : null, sex };
}

/** @param {{sourceId:string, sourceLabel:string, seriesLabel:string, country:string, linkSite:string}} o */
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
    // `parseDiv` da fonte por cima do genérico (ex.: provas só de raparigas)
    parseDiv: o.parseDiv || parseDivGolfbox,
    // o link de cada classe diz a federação, não «golfbox.dk»
    linkSite: o.linkSite,
  });
}

module.exports = { fonteGolfboxFederacao, parseDivGolfbox };
