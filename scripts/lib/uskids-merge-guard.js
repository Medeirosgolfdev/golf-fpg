'use strict';

/**
 * uskids-merge-guard.js
 *
 * Guarda anti-degradação para o merge do histórico USKids.
 *
 * PORQUÊ: a API `GetMemberTournamentResults` devolve por vezes entradas
 * INCOMPLETAS para torneios que já tínhamos completos — arrays vazios
 * (`par: []`), arrays de zeros (`yards: [0,0,…]`), `place`/`totalStrokes`/
 * `points` a 0, nomes a `'?'` e tee times genéricos (`08:00`, grupo 0).
 * Não são `null`, por isso passam por qualquer fallback do género `x ?? y`.
 *
 * O `fetch-uskids-member-history.js` fazia
 *   `{ ...torneiosExistentes, ...torneiosNovos }`
 * — um spread RASO, onde cada torneio novo substitui o antigo INTEIRO. Um
 * scrape degradado apagava dados bons já em cache. Aconteceu a 2026-07-19:
 * um run da GitHub Action substituiu 61 campos válidos (par/yards/strokes/
 * place/tee times) por versões vazias, confirmado contra a própria API.
 *
 * REGRA: entre o valor em cache e o novo, vence o mais "rico". Em empate
 * (ambos igualmente preenchidos) vence o NOVO — a API é a fonte e uma
 * correcção legítima tem de poder passar. Rondas e torneios são unidos,
 * nunca substituídos em bloco.
 */

/**
 * Quão "preenchido" está um valor. Maior = mais informação.
 *   ausente → -1 | vazio/zero → 0 | preenchido → 1 (arrays: nº de entradas úteis)
 */
function fieldRichness(v) {
  if (v === null || v === undefined) return -1;
  if (Array.isArray(v)) {
    return v.filter(x => x !== 0 && x !== null && x !== undefined && x !== '').length;
  }
  if (typeof v === 'string') return (v === '' || v === '?') ? 0 : 1;
  if (typeof v === 'number') return v === 0 ? 0 : 1;
  if (typeof v === 'object') return Object.keys(v).length ? 1 : 0;
  return 1;
}

/** Escolhe entre o valor em cache e o novo. Empate → novo. */
function pickRicher(oldV, newV) {
  if (newV === undefined) return oldV;
  if (oldV === undefined) return newV;
  return fieldRichness(newV) >= fieldRichness(oldV) ? newV : oldV;
}

/**
 * Quão completa é uma ronda: buracos com pancadas + gross + nº de buracos.
 * Serve para julgar a ronda como UNIDADE antes de fundir campo-a-campo.
 */
function roundCompleteness(r) {
  if (!r) return -1;
  return fieldRichness(r.strokes)
    + (fieldRichness(r.gross) > 0 ? 1 : 0)
    + (fieldRichness(r.holes) > 0 ? 1 : 0);
}

/**
 * Funde uma ronda campo-a-campo (strokes, gross, startTime, group, …).
 *
 * Antes do merge por campo, compara a ronda como um todo: numa ronda
 * degradada campos como `startTime` continuam "preenchidos" (o genérico
 * "08:00") e ganhariam o empate, contaminando uma ronda boa com o tee time
 * errado. Se a ronda nova é globalmente mais pobre, fica a antiga intacta.
 */
function mergeRound(oldR, newR) {
  if (!oldR) return newR;
  if (!newR) return oldR;
  if (roundCompleteness(newR) < roundCompleteness(oldR)) return oldR;
  const out = {};
  for (const k of new Set([...Object.keys(oldR), ...Object.keys(newR)])) {
    out[k] = pickRicher(oldR[k], newR[k]);
  }
  return out;
}

/** Funde um torneio: campos por riqueza, rondas por união. */
function mergeTournament(oldT, newT) {
  if (!oldT) return newT;
  if (!newT) return oldT;
  const out = {};
  for (const k of new Set([...Object.keys(oldT), ...Object.keys(newT)])) {
    if (k === 'rounds') continue;
    out[k] = pickRicher(oldT[k], newT[k]);
  }
  const oldRounds = oldT.rounds || {};
  const newRounds = newT.rounds || {};
  const rounds = {};
  for (const rn of new Set([...Object.keys(oldRounds), ...Object.keys(newRounds)])) {
    rounds[rn] = mergeRound(oldRounds[rn], newRounds[rn]);
  }
  out.rounds = rounds;
  return out;
}

/**
 * Substitui `{ ...torneiosExistentes, ...torneiosNovos }`.
 * União dos tcodes; os que existem dos dois lados são fundidos.
 */
function mergeTournamentMaps(oldMap, newMap) {
  const a = oldMap || {};
  const b = newMap || {};
  const out = {};
  for (const tid of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[tid] = mergeTournament(a[tid], b[tid]);
  }
  return out;
}

module.exports = {
  fieldRichness, pickRicher, roundCompleteness,
  mergeRound, mergeTournament, mergeTournamentMaps,
};
