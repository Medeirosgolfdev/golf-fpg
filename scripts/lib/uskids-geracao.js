'use strict';

/**
 * uskids-geracao.js — regras do seguimento da carreira dos rivais USKids.
 *
 * 1. GERAÇÕES 2012-2015 — nos torneios importantes (ALL_TCODES) guarda-se a
 *    carreira de TODOS os rapazes nascidos entre 2012 e 2015 (a do Manuel, as
 *    duas acima e a de baixo), não só o top-5. O escalão USKids depende de uma data de corte
 *    que varia entre torneios (Marco Simone 2026 → Boys 11; European 2026 →
 *    Boys 12, os dois em 2026), por isso a geração de 2014 num torneio do ano
 *    Y está em "Boys (Y-2014)" ou "Boys (Y-2015)": aceitam-se os dois.
 *
 * 2. NOMES PELA ORDEM — o GetTournamentPlayers devolve os memberIDs do torneio
 *    inteiro (todas as flights, não só a pedida), ordenados flight a flight
 *    pela ordem do GetMeta e, dentro de cada flight, por apelido e nome. Os
 *    flight_players do GetPlayerTeeTimes têm o nome mas não o memberID (a
 *    chave é o id da inscrição). Reproduzindo a mesma ordenação, a posição i
 *    de um lado é a posição i do outro. Validado a 2026-09-18 no Venice Open
 *    2026 (t=22243): 187/187 nomes conhecidos batem certo, 0 falhas. É a
 *    única maneira de dar nome a quem ainda não jogou nada que tenhamos
 *    (inscritos em torneios futuros vindos só de Local Tours americanos).
 */

const ANO_NASC_MANUEL = 2014; // = MANUEL_BIRTH_YEAR (src/constants/manuel.ts)

/** Idades cobertas por um nome de escalão: "Boys 12" → [12,12]; "Boys 13-14"
 *  → [13,14]; "Boys 7 & Under" → [0,7]; "Boys 15-18" → [15,18]. */
function idadesDoEscalao(ag) {
  const s = String(ag || '');
  const nums = (s.match(/\d+/g) || []).map(Number);
  if (!nums.length) return null;
  if (/under/i.test(s)) return [0, nums[0]];
  return [Math.min(...nums), Math.max(...nums)];
}

// Gerações seguidas por inteiro (18/09, Mariana: "o top-5 é muito redutor").
// 2012-2013: os que o Manuel vai apanhar nos Boys 13-14; 2015: os que jogam com
// ele quando a data de corte o põe um escalão abaixo.
const GERACOES = { de: ANO_NASC_MANUEL - 2, ate: ANO_NASC_MANUEL + 1 }; // 2012-2015

/** true se o escalão `ag` de um torneio do ano `ano` tem miúdos nascidos entre
 *  `ger.de` e `ger.ate`. Um nascido em N está em "Boys (ano−N)" ou, com a data
 *  de corte, em "Boys (ano−N−1)". */
function escalaoDaGeracao(ag, ano, ger = GERACOES) {
  if (!ano || !/^boys/i.test(String(ag || '').trim())) return false;
  const faixa = idadesDoEscalao(ag);
  if (!faixa) return false;
  const [lo, hi] = faixa;
  const idadeMin = ano - ger.ate - 1;
  const idadeMax = ano - ger.de;
  return lo <= idadeMax && hi >= idadeMin;
}

/** Ano de uma data USKids ("12/21/2026" ou "2026-12-21"). */
function anoDaData(s) {
  const m = String(s || '').match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

// Só letras e dígitos contam: a USKids escreve o mesmo nome com aspas num sítio
// e parênteses noutro (Humberto "Tres" Izquierdo ≡ Humberto (Tres) Izquierdo).
const normNome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// A mesma criança aparece com versões do nome diferentes (cadastro vs
// inscrição): "Martín Andrés Troccoli Vivas" ≡ "Martín Troccoli-Vivas". Conta
// como o mesmo se o primeiro nome e o último apelido coincidem (ou um nome
// contém todas as palavras do outro).
function mesmoNome(a, b) {
  const A = normNome(a).split(' ').filter(Boolean);
  const B = normNome(b).split(' ').filter(Boolean);
  if (!A.length || !B.length) return false;
  if (A.join(' ') === B.join(' ')) return true;
  const [curto, longo] = A.length <= B.length ? [A, B] : [B, A];
  if (curto.every(t => longo.includes(t))) return true;
  return A[0] === B[0] && A[A.length - 1] === B[B.length - 1];
}

/** Ordenação usada pela USKids dentro de cada flight (apelido, depois nome). */
function compararPorApelido(a, b) {
  return (a.last || '').localeCompare(b.last || '') || (a.first || '').localeCompare(b.first || '');
}

/**
 * Associa memberIDs a nomes pela ordem.
 * @param memberIds  lista do GetTournamentPlayers (torneio inteiro, pela ordem da API)
 * @param blocos     um array de jogadores {first,last,country,place} por flight,
 *                   pela ordem das flights no GetMeta (cada bloco em qualquer ordem)
 * @param conhecido  (mid) → nome já sabido por outra via, ou null — serve de prova
 * @returns { mapa: {mid: {name,country,place}}, confirmados, motivo }
 *          mapa vazio + motivo quando a associação não é segura.
 */
function associarPorOrdem(memberIds, blocos, conhecido = () => null) {
  const ordenados = blocos.flatMap(b => [...b].sort(compararPorApelido));
  if (!memberIds.length) return { mapa: {}, confirmados: 0, motivo: 'sem memberIDs' };
  if (ordenados.length !== memberIds.length) {
    return { mapa: {}, confirmados: 0, motivo: `contagens diferentes (${memberIds.length} memberIDs vs ${ordenados.length} jogadores)` };
  }
  const mapa = {};
  let confirmados = 0;
  for (let i = 0; i < memberIds.length; i++) {
    const pl = ordenados[i];
    const name = `${(pl.first || '').trim()} ${(pl.last || '').trim()}`.trim();
    const mid = String(memberIds[i]);
    const antes = conhecido(mid);
    if (antes && antes !== '?') {
      // Uma única discordância prova que a ordem não é a esperada → nada.
      if (!mesmoNome(antes, name)) {
        return { mapa: {}, confirmados, motivo: `discordância em m=${mid}: "${antes}" vs "${name}"` };
      }
      confirmados++;
    }
    mapa[mid] = { name, country: (pl.country || '').toUpperCase(), place: pl.place || '' };
  }
  return { mapa, confirmados, motivo: null };
}

module.exports = {
  ANO_NASC_MANUEL, GERACOES, idadesDoEscalao, escalaoDaGeracao, anoDaData,
  compararPorApelido, associarPorOrdem, mesmoNome,
};
