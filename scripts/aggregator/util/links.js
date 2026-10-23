/**
 * scripts/aggregator/util/links.js
 *
 * Índice compacto para as setas ↗ (ligação de um jogador à ficha /kids2) das
 * páginas dos circuitos — 21/10/2026. Antes cada página de circuito descarregava
 * o juniors.json inteiro (~52 MB) só para isto; o `useKidsLinkMap`
 * (src/hooks/useKidsLinkMap.ts) lê agora este ficheiro (~1,4 MB).
 *
 * Saída (`public/data/juniors-links.json`, compacta):
 *   { schemaVersion, generatedAt,
 *     j: [[id, nome canónico, aliases?, memberId USKids?, fed FPG?, licença FFG?, país?, sexo?], …] }
 * Os campos opcionais vêm a 0 quando faltam e os zeros do fim são cortados.
 * O país e o sexo (23/10/2026) servem a /FPG (bandeira e sexo de quem não é
 * federado — `fpgPlayersDB.ts`), que antes os lia de dois ficheiros à parte
 * (kids-links.json, à mão, e kids-tracked-names.json, parado desde Maio).
 */

function buildLinks(juniors, generatedAt) {
  const j = [];
  for (const x of juniors) {
    if (!x?.id || !x.canonicalName) continue;
    const aliases = [...new Set((x.aliases || []).filter((a) => a && a !== x.canonicalName))];
    const row = [
      x.id,
      x.canonicalName,
      aliases.length ? aliases : 0,
      x.sources?.uskids?.memberId ? String(x.sources.uskids.memberId) : 0,
      x.sources?.fpg?.fed ? String(x.sources.fpg.fed) : 0,
      x.sources?.ffgolf?.lic ? String(x.sources.ffgolf.lic) : 0,
      x.country || x.nationality || 0,
      x.sex === "M" || x.sex === "F" ? x.sex : 0,
    ];
    while (row.length > 2 && !row[row.length - 1]) row.pop();
    j.push(row);
  }
  return { schemaVersion: 1, generatedAt, j };
}

module.exports = { buildLinks };
