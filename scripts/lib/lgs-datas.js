/**
 * scripts/lib/lgs-datas.js — datas das provas do LiveGolfScoring (mitarjeta.golf).
 *
 * O `meta.dateRange` («25 junio - 27 junio») não traz o ano e o `meta.dateIso`
 * é um dia dentro dele. As provas lidas antes de Out/2026 ficaram com o ÚLTIMO
 * dia (46 de 72 a 01/11/2026: «25 junio - 27 junio» com 2025-06-27); a data da
 * prova é o primeiro — com o último, o Campeonato de España Alevín caía em cima
 * do Nacional de Jovens Sub-12 da FPG e quem joga os dois parecia ser dois.
 *
 * Usado pelo enrich-lgs-dates.js (corrige os ficheiros) e pelo agregador.
 */

const MESES_ES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/**
 * Primeiro e último dia da prova, com o ano tirado de `dateIso`.
 * Sem intervalo legível, ou com a data fora dele, fica a gravada (`fim: null`).
 * @returns {{inicio: string|null, fim: string|null}}
 */
function datasDoIntervalo(dateIso, dateRange) {
  const iso = typeof dateIso === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateIso) ? dateIso.slice(0, 10) : null;
  const r = /(\d{1,2})\s+([a-z]+)\s*-\s*(\d{1,2})\s+([a-z]+)/i.exec(dateRange || "");
  const mi = r && MESES_ES[r[2].toLowerCase()], mf = r && MESES_ES[r[4].toLowerCase()];
  if (!iso || !mi || !mf) return { inicio: iso, fim: null };
  const ano = Number(iso.slice(0, 4)), mes = Number(iso.slice(5, 7)), dia = Number(iso.slice(8, 10));
  const pad = (n) => String(n).padStart(2, "0");
  const k = (m, d) => m * 100 + d;
  const a = k(mi, Number(r[1])), b = k(mf, Number(r[3])), x = k(mes, dia);
  const vira = a > b; // «28 diciembre - 02 enero»
  if (vira ? !(x >= a || x <= b) : !(x >= a && x <= b)) return { inicio: iso, fim: null };
  const anoIni = vira && x <= b ? ano - 1 : ano;
  const anoFim = vira && x >= a ? ano + 1 : ano;
  return { inicio: `${anoIni}-${pad(mi)}-${pad(Number(r[1]))}`, fim: `${anoFim}-${pad(mf)}-${pad(Number(r[3]))}` };
}

module.exports = { MESES_ES, datasDoIntervalo };
