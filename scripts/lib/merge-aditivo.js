'use strict';

/**
 * merge-aditivo.js — gravação ADITIVA para fontes que apagam o passado.
 *
 * O EGR e o WAGR só mostram ~2 anos: os pontos caducam e os jogadores somem da
 * classificação de um evento antigo; a ficha de jogador EGR só lista a janela
 * do ranking. Regravar por cima apagava o que já tínhamos. Regra (Mariana,
 * 19/09): "deve ser aditivo e nunca subtractivo" — o que vem da fonte
 * actualiza; o que só existia no ficheiro fica.
 */

const fs = require('fs');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Conteúdo anterior de um ficheiro JSON, ou null. */
function lerAnterior(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * Junta duas listas por chave: as entradas novas substituem as antigas com a
 * mesma chave; as antigas que já não vêm ficam (marcadas `_mantido: true`).
 * A ordem é a nova, com as mantidas no fim.
 */
function juntarPorChave(antigos, novos, chaveDe) {
  const lista = Array.isArray(novos) ? [...novos] : [];
  const vistos = new Set(lista.map(chaveDe).filter(Boolean));
  for (const a of Array.isArray(antigos) ? antigos : []) {
    const k = chaveDe(a);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    lista.push({ ...a, _mantido: true });
  }
  return lista;
}

/** Jogadores de uma classificação (EGR/WAGR): chave = id do jogador, senão nome+país. */
const chaveJogador = (p) => (p && (p.id != null && p.id !== '' ? `id:${p.id}` : `n:${norm(p.name)}|${norm(p.country)}`)) || null;

/** Eventos de uma ficha de jogador: chave = id do evento, senão nome+data. */
const chaveEvento = (e) => (e && (e.eventId ? `id:${e.eventId}` : `n:${norm(e.event)}|${e.startDateRaw || ''}`)) || null;

module.exports = { lerAnterior, juntarPorChave, chaveJogador, chaveEvento };
