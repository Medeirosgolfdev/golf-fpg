/**
 * scripts/aggregator/util/hcp-historico.js — o HCP de cada jogador em cada prova,
 * com a data, para o `hcpHistory` da ficha (03/11/2026).
 *
 * As fontes liam o HCP de cada prova e guardavam só o último, sem data (Junes
 * Chirband ficava com um só HCP). Uma fonte regista cada valor pela chave do
 * jogador e, no fim, `aplicar` põe o histórico em cada RawPlayer (pela chave e
 * pelas chaves antigas que ele tenha). O identity-matcher junta os de todas as
 * fontes (mergeHcpHistory). Os «plus» vêm negativos, como no resto do Kids 2.
 */

/** @returns {{ registar: Function, aplicar: Function, total: () => number }} */
function criarHistorico(source) {
  const porChave = new Map(); // chave → [{ date, hcpExact, source, label }]
  return {
    /** Um HCP de uma prova. Sem data ISO ou fora de −10…54 não entra. */
    registar(key, date, hcp, label) {
      const d = String(date || "").slice(0, 10);
      if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(d) || typeof hcp !== "number" || hcp < -10 || hcp > 54) return;
      let arr = porChave.get(key);
      if (!arr) porChave.set(key, (arr = []));
      if (!arr.some((h) => h.date === d)) arr.push({ date: d, hcpExact: hcp, source, ...(label ? { label } : {}) });
    },
    /** Põe o histórico em cada jogador; `chavesDe(p)` dá as chaves dele. Devolve quantos o têm. */
    aplicar(players, chavesDe = (p) => [p.sourceKey]) {
      let n = 0;
      for (const p of players) {
        const hist = chavesDe(p).flatMap((k) => porChave.get(k) || []);
        if (!hist.length) continue;
        const ja = new Set((p.hcpHistory || []).map((h) => h.date));
        p.hcpHistory = [...(p.hcpHistory || []), ...hist.filter((h) => !ja.has(h.date))].sort((a, b) => b.date.localeCompare(a.date));
        n++;
      }
      return n;
    },
    total: () => porChave.size,
  };
}

module.exports = { criarHistorico };
