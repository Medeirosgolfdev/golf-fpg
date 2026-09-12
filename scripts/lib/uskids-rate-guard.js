'use strict';

/**
 * Defesas do monitor de field USKids contra uma fonte que recusa ou degrada.
 *
 * Tudo aqui é PURO (sem I/O, sem relógio implícito) para ser testável — o
 * `fetch-uskids-field.js` liga estas funções ao mundo real.
 *
 * Contexto (2026-09-12): o signupanytime aplicou rate limit e o
 * `uskids-field.json` passou de 2018 inscritos para ZERO, num commit que o
 * workflow deu por bom. Três peças, cada uma a travar a avaria num ponto
 * diferente:
 *
 *  1. `ehRateLimit`      — reconhecer a recusa (vem em TEXTO, HTTP 200).
 *  2. `deveVarrerProfundo` — não martelar a fonte todos os dias com a
 *                            varredura cara, que é o que nos levou ao limite.
 *  3. `perdaNosComuns`   — nunca gravar um build que perdeu inscritos.
 */

/** Perda de inscritos tolerada antes de recusar a escrita. */
const PERDA_MAXIMA = 0.30;

/** De quantos em quantos dias corre a varredura profunda (Passagem A + sondas). */
const DIAS_VARREDURA_PROFUNDA = 7;

/**
 * O signupanytime responde ao rate limit com "Too many requests" em TEXTO e
 * HTTP 200 — não com 429. Passar esse corpo ao JSON.parse dá um erro de
 * sintaxe que se lê como "torneio sem dados"; é preciso reconhecê-lo pelo que é.
 */
function ehRateLimit(txt) {
  return /too many requests/i.test(String(txt || '').slice(0, 200));
}

/** Erro identificável, para o chamador distinguir recusa de falha de rede. */
function erroRateLimit() {
  const e = new Error('rate limit (Too many requests)');
  e.rateLimited = true;
  return e;
}

/**
 * A varredura profunda (Passagem A + sondas de salto) corre de
 * `intervaloDias` em `intervaloDias` dias; a densa, que é a que descobre,
 * corre sempre. Uma cache sem marca corre já.
 *
 * @param {object} o
 * @param {string|null} o.ultima  data ISO (YYYY-MM-DD) da última profunda
 * @param {string} o.hoje         data ISO de hoje
 * @param {boolean} [o.forcar]    --full-scan
 */
function deveVarrerProfundo({ ultima, hoje, intervaloDias = DIAS_VARREDURA_PROFUNDA, forcar = false }) {
  if (forcar) return { correr: true, porque: '--full-scan', dias: 0 };
  if (!ultima) return { correr: true, porque: 'primeira vez', dias: Infinity };
  const dias = Math.floor(
    (new Date(`${hoje}T00:00:00Z`).getTime() - new Date(`${ultima}T00:00:00Z`).getTime()) / 86400000,
  );
  return dias >= intervaloDias
    ? { correr: true, porque: `${dias}d desde a última`, dias }
    : { correr: false, porque: null, dias };
}

/** Map t → nº de inscritos, a partir da lista de torneios do field.json. */
function inscritosPorTorneio(torneios) {
  const m = new Map();
  for (const t of (torneios || [])) {
    let jog = 0;
    for (const e of (t.escaloes || [])) jog += (e.jogadores || []).length;
    m.set(t.t, jog);
  }
  return m;
}

/**
 * Perda de inscritos medida SÓ nos torneios presentes nos dois lados.
 *
 * ⚠ Sobre o total não serve: um torneio que se joga sai do radar e leva os
 * inscritos com ele. A 2026-08-01 um único evento a sair fez o total cair 39%
 * (1500→916) num run perfeitamente bom — nos torneios comuns os inscritos até
 * subiram (913→916). Medir o total recusaria esse dia e congelaria o ficheiro
 * em silêncio, que é a falha que esta guarda existe para evitar.
 *
 * Devolve `perda: 0` quando não há base de comparação (nada em comum, ou disco
 * vazio) — sem histórico não se pode acusar ninguém de encolher.
 */
function perdaNosComuns(torneiosAntigos, torneiosNovos) {
  const a = inscritosPorTorneio(torneiosAntigos);
  const b = inscritosPorTorneio(torneiosNovos);
  let antes = 0, agora = 0, comuns = 0;
  for (const [t, jog] of b) {
    if (!a.has(t)) continue;
    comuns++;
    antes += a.get(t);
    agora += jog;
  }
  return { antes, agora, comuns, perda: antes > 0 ? 1 - agora / antes : 0 };
}

/** Recusa-se a gravar? (a decisão, isolada do I/O) */
function deveRecusarEscrita(torneiosAntigos, torneiosNovos, { max = PERDA_MAXIMA, forcar = false } = {}) {
  const r = perdaNosComuns(torneiosAntigos, torneiosNovos);
  return { ...r, recusar: !forcar && r.antes > 0 && r.perda > max };
}

module.exports = {
  PERDA_MAXIMA, DIAS_VARREDURA_PROFUNDA,
  ehRateLimit, erroRateLimit,
  deveVarrerProfundo,
  inscritosPorTorneio, perdaNosComuns, deveRecusarEscrita,
};
