"use strict";
/**
 * Guarda de sanidade dos draws extraídos de PDF (add-cgss-draw.js).
 *
 * Um grupo de golfe tem no máximo 4 LUGARES. Um lugar é um jogador ou, nos
 * campeonatos de pares, um par (3 pares = 6 jogadores num grupo é legítimo).
 * O extractor python indica os lugares em `entries`; sem esse campo conta-se
 * jogadores. Um grupo acima disto é sinal de extracção baralhada (ex.: XIII
 * Barbeito 2026-09-12 com o pdftotext do xpdf — 38 e 31 num só grupo), e a
 * inbox de email publica sem ninguém ver: melhor recusar do que publicar.
 */
const MAX_GROUP_SLOTS = 4;

function groupSlots(g) {
  return typeof g.entries === "number" ? g.entries : (g.players || []).length;
}

/** Grupos com mais de `max` lugares → [{teeTime, startHole, slots, players}]. */
function oversizedGroups(groups, max = MAX_GROUP_SLOTS) {
  return (groups || [])
    .filter((g) => groupSlots(g) > max)
    .map((g) => ({ teeTime: g.teeTime, startHole: g.startHole, slots: groupSlots(g), players: (g.players || []).length }));
}

module.exports = { MAX_GROUP_SLOTS, groupSlots, oversizedGroups };
