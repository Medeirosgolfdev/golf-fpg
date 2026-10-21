'use strict';

/**
 * uskids-recusa.js — reconhecer a recusa do signupanytime e não deixar que um
 * scrape parcial esmague o que já temos.
 *
 * Regra da USKids (docs/claude/uskids.md; já nos bloquearam a 12/09/2026):
 * um pedido de cada vez e PARAR À PRIMEIRA RECUSA. Recusa = HTTP 403/429/503
 * ou «Too many requests» em TEXTO com HTTP 200 (é assim que o rate limit vem).
 *
 * Usado pelo fetch-uskids-results.js e pelo fetch-uskids-draws.js (Playwright:
 * os pedidos saem de dentro da página) e pelo fetch-uskids-rich-players-node.js.
 */

const STATUS_RECUSA = new Set([403, 429, 503]);

function ehRecusa(status, txt) {
  return STATUS_RECUSA.has(Number(status)) || /too many requests/i.test(String(txt || '').slice(0, 200));
}

function erroRecusa(motivo) {
  const e = new Error(`recusa da fonte — ${motivo}`);
  e.recusa = true;
  return e;
}

/**
 * fetch de dentro da página (Playwright) que reconhece a recusa.
 * Lança erro com `.recusa = true` na recusa; `HTTP nnn` noutros erros.
 */
async function pageJSONcomRecusa(page, url, method = 'GET') {
  const { status, text } = await page.evaluate(async (args) => {
    const r = await fetch(args.u, { credentials: 'include', method: args.method });
    return { status: r.status, text: await r.text() };
  }, { u: url, method });
  if (ehRecusa(status, text)) throw erroRecusa(`HTTP ${status}: ${String(text).slice(0, 60).replace(/\s+/g, ' ')}`);
  if (status < 200 || status >= 300) throw new Error('HTTP ' + status);
  return JSON.parse(text);
}

/** Resposta do GetMeta apanhada pelo listener da página → JSON, ou recusa. */
async function respostaJSONcomRecusa(response) {
  const status = response.status();
  const text = await response.text();
  if (ehRecusa(status, text)) throw erroRecusa(`HTTP ${status}: ${String(text).slice(0, 60).replace(/\s+/g, ' ')}`);
  return JSON.parse(text);
}

/** Jogadores de um torneio do uskids-results.json (por escalão, a ronda com mais). */
function contarJogadoresResultados(t) {
  let n = 0;
  for (const e of (t?.escaloes || [])) {
    n += Math.max(0, ...(e.rondas || []).map(r => (r.leaderboard || []).length));
  }
  return n;
}

/** Jogadores com draw de um torneio do uskids-draws.json (por escalão, a ronda com mais). */
function contarJogadoresDraw(t) {
  let n = 0;
  for (const e of (t?.escaloes || [])) {
    n += Math.max(0, ...(e.rondas || []).map(r => (r.grupos || []).reduce((s, g) => s + (g.jogadores || []).length, 0)));
  }
  return n;
}

/**
 * Guarda anti-encolhimento POR TORNEIO: o novo só substitui o antigo se não
 * perder mais de `maxPerda` dos jogadores nem um escalão que tinha jogadores.
 * Devolve { manter: boolean, antes, agora, motivo? }.
 */
function deveManterAntigo(antigo, novo, contar, { maxPerda = 0.15, force = false } = {}) {
  if (!antigo || force) return { manter: false, antes: antigo ? contar(antigo) : 0, agora: contar(novo) };
  const antes = contar(antigo);
  const agora = contar(novo);
  if (antes > 0 && agora < antes * (1 - maxPerda)) {
    return { manter: true, antes, agora, motivo: `${antes} → ${agora} jogadores` };
  }
  const escNovos = new Set((novo?.escaloes || []).map(e => e.age_group));
  const perdidos = (antigo.escaloes || []).filter(e => !escNovos.has(e.age_group) && contar({ escaloes: [e] }) > 0);
  if (perdidos.length) {
    return { manter: true, antes, agora, motivo: `perdia ${perdidos.length} escalão(ões): ${perdidos.map(e => e.nome).join(', ')}` };
  }
  return { manter: false, antes, agora };
}

module.exports = {
  STATUS_RECUSA, ehRecusa, erroRecusa,
  pageJSONcomRecusa, respostaJSONcomRecusa,
  contarJogadoresResultados, contarJogadoresDraw, deveManterAntigo,
};
