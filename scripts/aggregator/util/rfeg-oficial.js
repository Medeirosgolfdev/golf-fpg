/**
 * scripts/aggregator/util/rfeg-oficial.js — hándicap oficial actual e ranking
 * juvenil da RFEG nos juniores espanhóis (22/10/2026, «quero acompanhar os
 * espanhóis»).
 *
 * Não é uma fonte: não cria fichas nem torneios. Corre depois do matcher e só
 * acrescenta `junior.rfegOficial` a quem já existe — a regra de casamento
 * (licença → 6 dígitos finais → nome + ano de nascimento) e as guardas vivem
 * em scripts/lib/rfeg-oficial.js, partilhado com o scrape-federados-es.js.
 *
 * Entradas (opcionais — sem elas não faz nada):
 *   public/data/rfeg-hcp.json          (scripts/scrape-federados-es.js)
 *   public/data/rfeg-rankings/*.json   (scripts/scrape-rfeg-ranking.js)
 */
const path = require("path");
const fs = require("fs");
const { DATA_DIR, readJsonSafe } = require("./io");
const { carregarRankings, enriquecer } = require("../../lib/rfeg-oficial");

function enrichWithRfegOficial(res) {
  const hcpFile = readJsonSafe(path.join(DATA_DIR, "rfeg-hcp.json"), null);
  const dir = path.join(DATA_DIR, "rfeg-rankings");
  const linhas = fs.existsSync(dir) ? carregarRankings(dir) : [];
  if (!hcpFile && !linhas.length) return { disponivel: false };
  const st = enriquecer(res.juniors, { hcp: hcpFile?.byLicencia || {}, linhas });
  return { disponivel: true, ...st, linhas: linhas.length };
}

module.exports = { enrichWithRfegOficial };
