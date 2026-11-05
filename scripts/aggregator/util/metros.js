"use strict";
/**
 * Distância do tee em METROS — um só formato para todas as fontes.
 *
 *   flight.metros  = comprimento do tee do escalão numa volta (só os buracos jogados)
 *   round.metros   = o mesmo, por jogador e volta, quando a fonte o dá e difere do flight
 *
 * Valores fora de [MIN, MAX] por buraco médio são lixo (metros a zero, SI 1..18…) e ficam null.
 */

const JARDA = 0.9144;
// por buraco: um par 3 de miúdos de 6 anos tem ~40 m; um buraco de adultos raramente passa 600 m
const MIN_POR_BURACO = 30;
const MAX_POR_BURACO = 650;

/** Soma metros de um array por buraco (zeros = não jogado). null se não houver nada válido. */
function somaMetros(arr) {
  if (!Array.isArray(arr)) return null;
  const v = arr.map(Number).filter((x) => Number.isFinite(x) && x > 0);
  if (!v.length) return null;
  const tot = v.reduce((a, b) => a + b, 0);
  return validar(tot, v.length);
}

/** Igual a somaMetros, mas o array vem em jardas. */
function metrosDeJardas(arr) {
  if (!Array.isArray(arr)) return null;
  return somaMetros(arr.map((y) => (Number(y) > 0 ? Number(y) * JARDA : 0)));
}

/** Total já somado (metros) para `buracos` buracos. null se não fizer sentido. */
function validar(total, buracos) {
  const t = Number(total), n = Number(buracos) || 18;
  if (!Number.isFinite(t) || t <= 0) return null;
  const m = t / n;
  if (m < MIN_POR_BURACO || m > MAX_POR_BURACO) return null;
  return Math.round(t);
}

module.exports = { somaMetros, metrosDeJardas, validar, JARDA };
