'use strict';

/**
 * Plano de varredura da fronteira de tcodes USKids.
 *
 * O que isto resolve: qualquer varredura que "pare ao fim de N tcodes vazios"
 * fica refém do maior buraco que a USKids venha a abrir. Foi assim que a
 * descoberta morreu 7 semanas em 2026 (limite 100, buraco real 632) — e subir o
 * limite não é garantia, só adia o mesmo acidente.
 *
 * Duas redes, nesta ordem:
 *
 *  1. **Densa com margem dinâmica** — varre TODOS os tcodes até
 *     `ultimoVivo + MARGEM_DENSA`. Como a margem é medida a partir do último
 *     tcode vivo (e não do início), cada torneio encontrado empurra o fim para
 *     a frente: enquanto houver vida a varredura nunca acaba. Um buraco só
 *     interrompe a densa se for maior que MARGEM_DENSA — hoje 1500, mais do
 *     dobro do maior buraco alguma vez observado.
 *
 *  2. **Sondas de salto** — janelas curtas espaçadas até um tecto muito mais
 *     alto. Existem só para o caso de um buraco absurdo: se alguma encontrar
 *     vida, a varredura densa RETOMA a partir dela e a rede 1 volta a mandar.
 *
 * O plano só termina quando as sondas chegam ao tecto sem achar nada. Máquina
 * de estados pura (sem I/O) para ser testável.
 */

const BLOCO_DENSO   = 60;    // tcodes por bloco na varredura densa
const MARGEM_DENSA  = 1500;  // quanto varrer para lá do último tcode vivo
const PASSO_SONDA   = 250;   // distância entre sondas de salto
const LARGURA_SONDA = 20;    // tcodes por sonda (janela, não tcode solto: com a
                             // densidade real da zona viva (~38%) uma janela de
                             // 20 falhar uma zona activa é ~1e-4)
const TECTO_SONDA   = 20000; // até onde as sondas vão, acima do último vivo

function criarPlano({ inicio, margemDensa = MARGEM_DENSA, tectoSonda = TECTO_SONDA,
                      bloco = BLOCO_DENSO, passoSonda = PASSO_SONDA,
                      larguraSonda = LARGURA_SONDA }) {
  return {
    inicio, margemDensa, tectoSonda, bloco, passoSonda, larguraSonda,
    modo: 'denso',
    cursor: inicio,
    ultimoVivo: inicio - 1,
    terminou: false,
    motivo: null,
    blocosDensos: 0,
    sondas: 0,
    retomas: 0,
  };
}

const fimDenso  = (st) => st.ultimoVivo + st.margemDensa;
const fimSondas = (st) => st.ultimoVivo + st.tectoSonda;

/** Próximo intervalo a sondar, ou null quando o plano terminou. */
function proximoIntervalo(st) {
  if (st.terminou) return null;
  if (st.modo === 'denso') {
    if (st.cursor > fimDenso(st)) return null;
    return { de: st.cursor, ate: Math.min(st.cursor + st.bloco - 1, fimDenso(st)), modo: 'denso' };
  }
  if (st.cursor > fimSondas(st)) return null;
  return { de: st.cursor, ate: st.cursor + st.larguraSonda - 1, modo: 'sonda' };
}

/**
 * Avança o estado com o resultado do intervalo varrido. `res.total` conta TODOS
 * os torneios existentes (internacionais ou não) — é isso que diz se a zona tem
 * vida; o filtro de interesse é outra coisa.
 */
function aplicarResultado(st, intervalo, res) {
  const s = { ...st };
  const achou = (res?.total || 0) > 0;
  if (achou && res.ultimoT > s.ultimoVivo) s.ultimoVivo = res.ultimoT;

  if (intervalo.modo === 'denso') {
    s.blocosDensos++;
    s.cursor = intervalo.ate + 1;
    if (s.cursor > fimDenso(s)) { s.modo = 'sonda'; s.cursor = fimDenso(s) + 1; }
  } else {
    s.sondas++;
    if (achou) {
      // Vida do outro lado do buraco → a rede densa volta a mandar.
      s.modo = 'denso';
      s.cursor = intervalo.de;
      s.retomas++;
    } else {
      s.cursor = intervalo.de + s.passoSonda;
    }
  }

  if (s.modo === 'sonda' && s.cursor > fimSondas(s)) {
    s.terminou = true;
    s.motivo = 'fronteira-esgotada';
  }
  return s;
}

module.exports = {
  BLOCO_DENSO, MARGEM_DENSA, PASSO_SONDA, LARGURA_SONDA, TECTO_SONDA,
  criarPlano, proximoIntervalo, aplicarResultado, fimDenso, fimSondas,
};
