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

/**
 * REGRA DE ENTRADA (18/09, decidida com a Mariana — substitui o top-5): um
 * rapaz fica com a carreira completa se, num torneio seguido, o escalão dele
 *   • tem miúdos das gerações 2012-2015 (escalaoDaGeracao), ou
 *   • é Boys 10-13 e o torneio é do Manuel ou da lista "todos os jogadores".
 * Tudo o resto (raparigas, mais velhos, mais novos, edições antigas) fica de
 * fora — e, como o escalão se sabe pela ordem, fica de fora SEM pedido.
 */
function podeEntrar(ag, ano, { torneioDoManuel = false, listaTodos = false } = {}) {
  if (!/^boys/i.test(String(ag || '').trim())) return false;
  if (escalaoDaGeracao(ag, ano)) return true;
  if (!torneioDoManuel && !listaTodos) return false;
  const faixa = idadesDoEscalao(ag);
  return !!faixa && faixa[0] <= 13 && faixa[1] >= 10;
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
  if (A[A.length - 1] !== B[B.length - 1]) return false;
  // Mesmo apelido e o primeiro nome igual ou com uma gralha da USKids
  // ("Alexaner"/"Alexander", "Sameul"/"Samuel"): até 2 letras de diferença em
  // nomes de 5+ letras. "Benji"/"Harley" ou "Thomas"/"Siyang" continuam diferentes.
  return A[0] === B[0] || (Math.min(A[0].length, B[0].length) >= 5 && distancia(A[0], B[0]) <= 2);
}

/** Distância de edição (Levenshtein), com trocas de letras vizinhas a contar 1. */
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
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

/**
 * Escalão de cada memberID pela ordem (mesma descoberta que associarPorOrdem):
 * a lista do GetTournamentPlayers vem flight a flight pela ordem do GetMeta, e
 * o GetMeta diz quantos inscritos tem cada flight (`registered`). Cortando a
 * lista em blocos desses tamanhos sabe-se o escalão de cada um SEM pedir o
 * histórico — é o que permite não pedir as raparigas. Validado no Venice 2026:
 * 16 flights, `registered` = jogadores em todas, soma 268 = lista 268.
 * @param conhecido (mid) → escalão já sabido (cache), ou null — serve de prova
 * @returns { mapa: {mid: escalão}, motivo }  mapa vazio + motivo se não for seguro
 */
function escaloesPelaOrdem(meta, memberIds, conhecido = () => null) {
  const flights = Object.values(meta?.flights || {});
  const ags = meta?.age_groups || {};
  if (!flights.length || !memberIds?.length) return { mapa: {}, motivo: 'sem flights/memberIDs' };
  const soma = flights.reduce((s, fl) => s + (parseInt(fl.registered, 10) || 0), 0);
  if (soma !== memberIds.length) {
    return { mapa: {}, motivo: `contagens diferentes (${memberIds.length} memberIDs vs ${soma} inscritos)` };
  }
  const mapa = {};
  let i = 0;
  for (const fl of flights) {
    const ag = ags[fl.age_group]?.name || fl.name || '';
    const n = parseInt(fl.registered, 10) || 0;
    for (let k = 0; k < n; k++, i++) {
      const mid = String(memberIds[i]);
      const antes = conhecido(mid);
      if (antes && antes !== ag) return { mapa: {}, motivo: `discordância em m=${mid}: "${antes}" vs "${ag}"` };
      mapa[mid] = ag;
    }
  }
  return { mapa, motivo: null };
}

module.exports = {
  escaloesPelaOrdem, podeEntrar,
  ANO_NASC_MANUEL, GERACOES, idadesDoEscalao, escalaoDaGeracao, anoDaData,
  compararPorApelido, associarPorOrdem, mesmoNome,
};
