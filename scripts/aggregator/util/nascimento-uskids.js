/**
 * scripts/aggregator/util/nascimento-uskids.js — ano de nascimento ESTIMADO pelos
 * escalões USKids em que o junior jogou (02/11/2026, pedido dela: «a maioria
 * continua sem ter os dados»).
 *
 * Numa prova USKids do ano A, «Boys N»/«Girls N» = nascido em A−N−1 ou A−N.
 * Cruzam-se todas as provas do junior: ficam os anos em que TODAS concordam
 * (um ou dois). Medido a 02/11/2026 contra quem tem data real: acerta 121/126
 * quando dá um ano e 203/207 quando dá dois. O intervalo ao dia da ficha do
 * Kids 2 (dobInfo) falha ~40% — por isso não se usa aqui.
 *
 * Só escalões de idade exacta (ageMin === ageMax); «7 & Under», «13-14» e
 * «15-18» ficam de fora. Sem provas, ou sem nenhum ano comum a todas, → null.
 */
function anosPelosEscaloesUskids(junior, tById) {
  const votos = new Map();
  let n = 0;
  for (const tid of junior.tournamentIds || []) {
    const t = tById.get(tid);
    if (!t || t.sourceId !== "uskids") continue;
    const ano = +String(t.date || t.startDate || "").slice(0, 4);
    if (!ano) continue;
    for (const f of t.flights || []) {
      if (typeof f.ageMin !== "number" || f.ageMin !== f.ageMax) continue;
      if (!(f.results || []).some((r) => r.juniorId === junior.id)) continue;
      n++;
      for (const y of [ano - f.ageMin - 1, ano - f.ageMin]) votos.set(y, (votos.get(y) || 0) + 1);
    }
  }
  if (!n) return null;
  const anos = [...votos].filter(([, c]) => c === n).map(([y]) => y).sort((a, b) => a - b);
  return anos.length ? [anos[0], anos[anos.length - 1]] : null;
}

module.exports = { anosPelosEscaloesUskids };
