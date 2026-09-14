'use strict';

/**
 * uskids-frontier.js — como se procuram torneios novos no signupanytime, e
 * quanto se pede por dia. Tudo PURO (sem I/O, sem relógio implícito): o
 * fetch-uskids-field.js liga isto ao mundo real.
 *
 * Porque é que a varredura antiga (Passagem A + densa +1500 + sondas +20000)
 * saiu, em Setembro de 2026 — medido, não suposto:
 *
 *  • Os números (tcodes) são TODOS da USKids e seguidos. O "buraco de 632"
 *    (21610→22243) que justificava varrer às cegas não existia: em 12 números
 *    amostrados lá dentro, 11 são torneios USKG (Local Tours, State
 *    Invitationals…) e 1 não existe. O código antigo chamava "vazio" a tudo o
 *    que o filtro excluía.
 *  • Um número que ainda não existe responde HTTP 200 com o CORPO VAZIO; na
 *    zona viva o maior falhanço seguido medido é de 15 números.
 *  • A USKids cria ~6 números por dia (23588 a 23/08 → 23714 a 14/09).
 *  • Em 6 meses de histórico, NENHUM torneio apareceu atrás da fronteira por
 *    si — os 87 "atrás" caem todos em dias em que mudámos as regras.
 *  • A varredura antiga fazia 4.400–6.000 pedidos por dia, 5 em paralelo,
 *    sem pausa — e foi isso que levou a USKids a bloquear-nos (12/09), no
 *    GitHub e, em teste, também no PC de casa.
 *
 * O que fica, por ordem de importância:
 *  1. FRONTEIRA — do último número que existe para a frente, um de cada vez,
 *     até MARGEM números seguidos inexistentes. Um número que não responde
 *     PÁRA a procura (não se passa à frente de um número por confirmar) e fica
 *     para a corrida seguinte, que recomeça no mesmo sítio.
 *  2. BURACOS — números inexistentes deixados para trás pela fronteira são
 *     revistos durante DIAS_BURACO dias (o caso teórico de um torneio criado
 *     escondido e publicado depois; nunca observado).
 *  3. CATÁLOGO — tudo o que existe fica guardado (incluindo o que se exclui),
 *     para que uma mudança de regras se aplique em casa, sem pedidos. O
 *     catálogo enche-se para trás aos poucos (BACKFILL_POR_CORRIDA por
 *     corrida) até PISO_BACKFILL.
 */

const MARGEM = 40;                 // números seguidos inexistentes = fronteira esgotada
const MAX_PEDIDOS_FRONTEIRA = 300; // tecto por corrida (normal: ~6 novos + 40)
const DIAS_BURACO = 7;
const BACKFILL_POR_CORRIDA = 150;
// Números abaixo disto são torneios que já se jogaram (criados antes de Mar/2026).
const PISO_BACKFILL = 22240;

// ── Fronteira ────────────────────────────────────────────────────────────

/** Estado inicial: a procura começa no número a seguir ao último que existe. */
function criarFronteira({ ultimoExistente, margem = MARGEM, maxPedidos = MAX_PEDIDOS_FRONTEIRA }) {
  return { cursor: ultimoExistente + 1, ultimoExistente, seguidos: 0, pedidos: 0,
           margem, maxPedidos, fim: null, buracosNovos: [] };
}

/** Próximo número a pedir, ou null quando a procura terminou. */
function proximoNumero(st) {
  return st.fim ? null : st.cursor;
}

/**
 * Aplica o resultado de UM pedido.
 * @param {'existe'|'nao-existe'|'erro'|'recusa'} resultado
 */
function aplicarResultado(st, t, resultado) {
  const s = { ...st, pedidos: st.pedidos + 1, buracosNovos: [...st.buracosNovos] };
  if (resultado === 'recusa') return { ...s, fim: 'rate-limit' };
  // Não se passa à frente de um número por confirmar: a corrida seguinte
  // recomeça em ultimoExistente + 1 e volta a pedi-lo.
  if (resultado === 'erro') return { ...s, fim: 'sem-resposta' };
  if (resultado === 'existe') {
    // Os inexistentes entre o último que existia e este ficaram para trás.
    for (let b = s.ultimoExistente + 1; b < t; b++) s.buracosNovos.push(b);
    s.ultimoExistente = t;
    s.seguidos = 0;
  } else {
    s.seguidos += 1;
  }
  s.cursor = t + 1;
  if (s.seguidos >= s.margem) s.fim = 'fronteira';
  else if (s.pedidos >= s.maxPedidos) s.fim = 'orcamento';
  return s;
}

// ── Buracos ──────────────────────────────────────────────────────────────

const diasEntre = (a, b) =>
  Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * Divide os buracos guardados ({t: 'YYYY-MM-DD' em que foi visto}) em
 * `rever` (ainda dentro da janela, e não vistos hoje) e `expirados`.
 */
function buracosARever(buracos, hoje, dias = DIAS_BURACO) {
  const rever = [], expirados = [];
  for (const [t, desde] of Object.entries(buracos || {})) {
    const idade = diasEntre(desde, hoje);
    if (idade >= dias) expirados.push(Number(t));
    else if (idade > 0) rever.push(Number(t));
  }
  return { rever: rever.sort((a, b) => a - b), expirados };
}

// ── Catálogo para trás ───────────────────────────────────────────────────

/** Números a pedir nesta corrida, do cursor para baixo, sem os já catalogados. */
function planoBackfill({ cursor, piso = PISO_BACKFILL, orcamento = BACKFILL_POR_CORRIDA, catalogados }) {
  const out = [];
  for (let t = cursor; t >= piso && out.length < orcamento; t--) {
    if (!catalogados.has(t)) out.push(t);
  }
  return out;
}

// ── Inscritos (Fase 2): quem se pede hoje ────────────────────────────────

const DIAS_PERTO = 30;   // começa dentro de 30 dias → todos os dias

/**
 * Decide, torneio a torneio, o que fazer hoje:
 *   'completo'  — metadados + lista de nomes de todos os escalões;
 *   'contagens' — metadados; os nomes só onde o nº de inscritos mudou;
 *   'manter'    — nada: fica o registo anterior (0 pedidos).
 *
 * Todos os dias: os do Manuel, os marcados para seguir de perto e os que
 * começam dentro de DIAS_PERTO dias. Os restantes, uma vez por semana, cada um
 * no seu dia (t % 7), para o trabalho se espalhar. Um torneio novo, ou cujo
 * registo anterior falhou, pede-se já e por inteiro. No dia da semana de cada
 * torneio a lista de nomes é refeita por inteiro — é isso que apanha uma troca
 * (sai um, entra outro) que deixa a contagem igual.
 *
 * @param {object[]} torneios  {t, date_inicio} (datas ISO ou M/D/YYYY já convertidas p/ `diasAte`)
 * @param {Map} prev           t → registo anterior no field.json
 * @param {object} o           {diaSemana, diarios:Set<t>, doManuel:Set<t>, diasAte:fn}
 */
function planearFase2(torneios, prev, { diaSemana, diarios, doManuel, diasAte }) {
  const plano = new Map();
  for (const tr of torneios) {
    const p = prev.get(tr.t);
    const slot = tr.t % 7 === diaSemana;
    if (!p || p.erro || p.stale || !(p.escaloes || []).length) { plano.set(tr.t, 'completo'); continue; }
    const diario = doManuel.has(tr.t) || diarios.has(tr.t) || diasAte(tr.date_inicio) <= DIAS_PERTO;
    if (slot) plano.set(tr.t, 'completo');
    else plano.set(tr.t, diario ? 'contagens' : 'manter');
  }
  return plano;
}

/** Ordem de trabalho: primeiro o que é diário, depois por data. */
function ordemFase2(torneios, plano, { doManuel, diarios, dataISO }) {
  const peso = (t) => doManuel.has(t.t) ? 0 : diarios.has(t.t) ? 1 : plano.get(t.t) === 'manter' ? 3 : 2;
  return [...torneios].sort((a, b) =>
    peso(a) - peso(b) || (dataISO(a.date_inicio) || '').localeCompare(dataISO(b.date_inicio) || ''));
}

module.exports = {
  MARGEM, MAX_PEDIDOS_FRONTEIRA, DIAS_BURACO, BACKFILL_POR_CORRIDA, PISO_BACKFILL, DIAS_PERTO,
  criarFronteira, proximoNumero, aplicarResultado,
  buracosARever, planoBackfill, planearFase2, ordemFase2,
};
