/**
 * scripts/lib/drive-countback.cjs — desempate oficial FPG nos torneios Drive
 * ─────────────────────────────────────────────────────────────────────────
 * Nos torneios multi-ronda o `classif_pos` que a ClassifLST devolve é o da
 * RONDA 1, não o da classificação final — por isso o scrape-drive-node.js
 * recalcula as posições pelo gross agregado. Quando dois jogadores empatam,
 * a FPG NÃO partilha a posição: desempata por COUNTBACK sobre a última volta —
 * última volta → últimos 9 → 6 → 3 → 1 buraco.
 *
 * Medido contra o RankingsClassifLST oficial (2026-07-19): o countback
 * reproduz a ordem oficial em 20 dos 26 grupos de empate de 2026. Os 6 que
 * falham são TODOS do mesmo torneio (3º Drive Tour Norte – Vale Pisão,
 * 2026-02-28), cuja ordem não é explicada por R1, R2 nem countback — é uma
 * anomalia da fonte, não da regra.
 *
 * O critério anterior era ordem ALFABÉTICA, que trocava posições (e pontos:
 * ex. Tomás Sarmento 165 vs 94) sempre que havia empate.
 */
"use strict";

const BIG = 9999;

/** Soma dos últimos `n` buracos jogados (ignora buracos a 0/por jogar). */
function tailSum(scores, n) {
  if (!Array.isArray(scores)) return null;
  const played = scores.filter(x => typeof x === "number" && x > 0);
  if (played.length < n) return null;
  return played.slice(-n).reduce((s, x) => s + x, 0);
}

/**
 * Chaves de countback de um jogador, da mais forte para a mais fraca.
 * Ausência de dados (sem scorecard) → BIG, ficando atrás de quem os tem.
 */
function countbackKeys(p) {
  const rounds = p.roundScores || [];
  const last = rounds[rounds.length - 1];
  const scores = last?.scores || [];
  return [
    typeof last?.gross === "number" ? last.gross : BIG,
    tailSum(scores, 9) ?? BIG,
    tailSum(scores, 6) ?? BIG,
    tailSum(scores, 3) ?? BIG,
    tailSum(scores, 1) ?? BIG,
  ];
}

/** −1/0/1 comparando só o countback (sem o gross total). 0 = inseparável. */
function compareCountback(a, b) {
  const A = countbackKeys(a), B = countbackKeys(b);
  for (let i = 0; i < A.length; i++) {
    if (A[i] !== B[i]) return A[i] - B[i];
  }
  return 0;
}

/** Comparador completo de classificação: gross agregado → countback → nome. */
function compareForRanking(a, b) {
  const ga = typeof a.grossTotal === "number" ? a.grossTotal : BIG;
  const gb = typeof b.grossTotal === "number" ? b.grossTotal : BIG;
  if (ga !== gb) return ga - gb;
  const cb = compareCountback(a, b);
  if (cb !== 0) return cb;
  return String(a.name || "").localeCompare(String(b.name || ""));
}

/**
 * Atribui `pos` a uma lista já ORDENADA por compareForRanking.
 * Jogadores que o countback não consegue separar PARTILHAM a posição
 * (a FPG dá-lhes a média dos pontos dos lugares que ocupam — ver
 * sharedPoints em drive-points.cjs). Devolve a mesma lista.
 */
function assignPositions(sorted) {
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (
      j < sorted.length &&
      sorted[j].grossTotal === sorted[i].grossTotal &&
      compareCountback(sorted[i], sorted[j]) === 0
    ) j++;
    for (let k = i; k < j; k++) sorted[k].pos = i + 1;
    i = j;
  }
  return sorted;
}

/**
 * Posições SEM countback: quem tem o mesmo gross partilha o lugar (e depois
 * divide os pontos — ver sharedPoints). É a regra do Circuito AQUAPOR,
 * confirmada no 3º Aquapor 2026 (Vidago): dois a 146 → ambos 2º com 129,5
 * (=(165+94)/2) e três a 150 → todos 6º com 45,3 (=(53+45+38)/3).
 * O Drive Challenge/Tour, esse, desempata por countback (assignPositions).
 */
function assignPositionsSharingTies(players) {
  const sorted = [...players].sort((a, b) => {
    const ga = typeof a.grossTotal === "number" ? a.grossTotal : BIG;
    const gb = typeof b.grossTotal === "number" ? b.grossTotal : BIG;
    return ga - gb;
  });
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].grossTotal === sorted[i].grossTotal) j++;
    for (let k = i; k < j; k++) sorted[k].pos = i + 1;
    i = j;
  }
  return sorted;
}

module.exports = {
  countbackKeys, compareCountback, compareForRanking,
  assignPositions, assignPositionsSharingTies, tailSum,
};
