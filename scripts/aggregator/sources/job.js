/**
 * scripts/aggregator/sources/job.js
 *
 * Adapter — Junior Orange Bowl International Championship (Coral Gables, FL).
 * Lê orangebowl_YYYY.json (JobFile do scrape-junior-orange-bowl.js). Duas
 * divisões genéricas "Divisão 1" (Rapazes) e "Divisão 2" (Raparigas) — o rótulo
 * não codifica idade nem sexo, por isso o sexo deriva do ÍNDICE/número da divisão
 * (1→M, 2→F), espelhando o JOB_DIV_LABELS = ["Rapazes","Raparigas"] da MajorPage.
 * Sem birthYear/dob → fonte FRACA (nome+país), com detailId GG como chave forte
 * intra-fonte (por jogador×divisão), como o FSGA/UA.
 * Scraper: scrape-junior-orange-bowl.js.
 */
const { buildJobfileSource } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "job",
  sourceLabel: "Junior Orange Bowl International",
  pattern: /^orangebowl_\d{4}\.json$/,
  seriesId: "junior-orange-bowl",
  seriesLabel: "JOB (Junior Orange Bowl)",
  nameFn: (data) => `Junior Orange Bowl ${data.year || ""}`.trim(),
  parseDiv: (divKey) => {
    // "Divisão 2" → Raparigas (F); "Divisão 1" (e qualquer outra) → Rapazes (M).
    // Idade fica null (o torneio não a expõe por divisão; ~12-18).
    const isGirls = /\b2\s*$/.test(String(divKey || ""));
    return { ageMin: null, ageMax: null, sex: isGirls ? "F" : "M" };
  },
});
