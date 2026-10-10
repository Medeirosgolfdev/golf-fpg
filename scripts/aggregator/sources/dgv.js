/**
 * scripts/aggregator/sources/dgv.js
 *
 * Adapter — Deutscher Golf Verband (Alemanha), provas juvenis: Deutsche
 * Meisterschaften AK 14/16/18, DM-Vorausscheide, Deutsche
 * Mannschaftsmeisterschaften (DMM) da juventude e German International
 * Amateur Championship / German Boys & Girls Open. Lê dgv_{tournamentNumber}.json
 * (1 ficheiro POR PROVA, JobFile do scrape-dgv.js) — o sourceKey é o nome do
 * ficheiro, por isso cada prova entra como torneio próprio.
 *
 * Divisão "AK 14 Jungen" / "AK 16 Mädchen" / "Boys" / "Girls" → sexo + idade
 * MÁXIMA (AK = Altersklasse; Boys/Girls internacionais = sub-18). Sem data de
 * nascimento → fonte FRACA (nome + país). Chave forte por dgvPlayerId
 * (`detailId` = "dgv{id}"), estável entre provas.
 *
 * Só contam as voltas INDIVIDUAIS: nas DMM o foursome (Vierer) dá uma pancada
 * por par e vem à parte em `teamRounds`, que o agregador ignora.
 * Scraper: scripts/scrape-dgv.js (workflow update-dgv.yml).
 */
const { buildJobfileSource } = require("../util/jobfile");

module.exports = buildJobfileSource({
  sourceId: "dgv",
  sourceLabel: "Deutscher Golf Verband (DM/DMM juvenis)",
  pattern: /^dgv_\d+\.json$/,
  seriesId: "dgv-jugend",
  seriesLabel: "DGV Jugend",
  defaultCountry: "DE",
  maxAgeInYear: 18,
  nameFn: (data) => String(data.tournament || "DGV").replace(/\s+/g, " ").trim(),
  parseDiv: (divKey) => {
    const s = String(divKey || "");
    const sex = /jungen|boys/i.test(s) ? "M" : /m(ä|ae)dchen|girls/i.test(s) ? "F" : null;
    const ak = /\bAK\s?(\d{1,2})\b/i.exec(s);
    return { ageMin: null, ageMax: ak ? +ak[1] : 18, sex };
  },
});
