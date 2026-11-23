/**
 * scripts/lib/uskids-datas.js — datas e estado das provas USKids (21/11/2026).
 *
 * Um só sítio para o que estava copiado em quatro scripts (discovery, draws, field, results):
 *  - parsearDataISO: «11/22/2026» (M/D/AAAA da USKids) → «2026-11-22»; ISO passa como vem.
 *  - torneioParcial: prova gravada A DECORRER — gravada até ao último dia E com a última volta com
 *    menos jogadores do que a primeira (por jogar). Usado pelo índice dos resultados (`parciais`) e
 *    pelo resumo diário (uma prova a meio não tem vencedor: o líder da R1 não é o vencedor).
 */
"use strict";

function parsearDataISO(s) {
  if (!s) return null;
  if (s.includes('-')) return s;
  const [m, d, y] = s.split('/');
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

/** Um gravado no último dia já depois de acabar (ex. Big 5 2026) não conta. */
function torneioParcial(r) {
  const fim = parsearDataISO(r.date_fim || r.date_inicio);
  const gravado = String(r.ultima_atualizacao || '').slice(0, 10);
  if (!fim || !gravado || fim < gravado) return false;
  const n = (v) => (v?.leaderboard || []).length;
  return (r.escaloes || []).some(e => { const rs = e.rondas || []; return rs.length > 0 && n(rs[rs.length - 1]) < Math.max(1, n(rs[0])); });
}

module.exports = { parsearDataISO, torneioParcial };
