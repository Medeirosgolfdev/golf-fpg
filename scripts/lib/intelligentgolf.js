/**
 * scripts/lib/intelligentgolf.js — leitura das páginas públicas dos clubes
 * ingleses em intelligentgolf (02/11/2026). Só funções puras (HTML → dados);
 * os pedidos ficam no scrape-intelligentgolf-hcp.js.
 *
 * Páginas (sem login, fetch simples):
 *   /competition2.php?time=future                → provas futuras (data com ano quando não é o ano corrente)
 *   POST /competition2.php?time=past  (ajaxaction=compsfilter, fromdate/todate dd/mm/aaaa,
 *        entrants, offset, loadmore) → JSON com 20 linhas de cada vez. ⚠ O filtro
 *        entrants=juniors deixa de fora os opens de juniores marcados «Men & Ladies»
 *        (o Goodwood Junior Open) — pede-se «all» e filtra-se pelo nome.
 *   /competition.php?go=entrants&compid=N        → lista de inscritos
 *
 * Na lista de inscritos cada linha é «Nome (Clube)» ou «Nome (HI)»: os sócios do
 * clube que organiza aparecem com o Handicap Index entre parênteses, os outros
 * com o clube. O HI é o ACTUAL (o mesmo valor em provas de Maio e de Setembro),
 * não o do dia da inscrição. Plus = com sinal menos («-2.7»), a convenção das
 * hcp-listas; um «+» também quer dizer plus e passa a negativo.
 */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+|#39);/gi, (m, k) => ENTITIES[k.toLowerCase()] ?? m);
}
const textOf = (html) => decode(String(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const HI_RE = /^[+-]?\d{1,2}(\.\d)?$/;
/** «-2.7» → -2.7 · «+1.0» → -1 (plus) · «11.5» → 11.5 · outra coisa → null */
function parseHi(s) {
  const t = String(s || "").trim();
  if (!HI_RE.test(t)) return null;
  const v = Number(t.replace(/^\+/, ""));
  return t.startsWith("+") ? -v : v;
}

/** Marcas de júnior que alguns clubes juntam ao nome: «(J)», «(Junior)». */
const MARCA_JUNIOR = /\s*\((?:j|jnr|jr|junior)\)\s*/gi;

/**
 * Lista de inscritos → [{ name, hcp, clube }]. `hcp` só quando o parêntese é
 * um número; `clube` quando é texto. «()» vazio fica sem os dois.
 */
function parseEntrants(html) {
  const s = String(html);
  const ini = s.search(/Entrant List/i);
  if (ini < 0) return null;
  const fim = s.indexOf("</table>", ini);
  const bloco = s.slice(ini, fim < 0 ? undefined : fim);
  const out = [];
  for (const m of bloco.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)) {
    const linha = textOf(m[1]);
    if (!linha) continue;
    // o último parêntese é o clube ou o HI; o clube pode ter parênteses lá dentro
    // («Eaton (Chester) Golf Club»), por isso conta-se de trás para a frente
    let fecho = linha.lastIndexOf(")");
    let nome = linha, extra = "";
    if (fecho === linha.length - 1) {
      let prof = 0, i = fecho;
      for (; i >= 0; i--) {
        if (linha[i] === ")") prof++;
        else if (linha[i] === "(" && --prof === 0) break;
      }
      if (i > 0) { nome = linha.slice(0, i); extra = linha.slice(i + 1, fecho).trim(); }
    }
    nome = nome.replace(MARCA_JUNIOR, " ").replace(/\s+/g, " ").trim();
    if (!nome) continue;
    const hcp = parseHi(extra);
    out.push({ name: nome, hcp, clube: hcp == null && extra ? extra : null });
  }
  return out;
}

const MESES = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
/** «Sunday 20th September» (+ ano por defeito) ou «Thursday 27th May 2027» → «2027-05-27». */
function parseCompDate(s, anoPorDefeito) {
  const m = String(s || "").match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?/i);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  const ano = m[3] ? Number(m[3]) : anoPorDefeito;
  if (!mes || !ano) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
}

/**
 * Linhas da lista de provas (página ou HTML do AJAX) → [{ compid, title, date }].
 * Uma linha por compid (cada linha tem dois links para a mesma prova).
 */
function parseCompRows(html, anoPorDefeito) {
  const out = new Map();
  for (const m of String(html).matchAll(/<div class="comp-name">([\s\S]*?)<\/div>\s*<div class="comp-date">([\s\S]*?)<\/div>/gi)) {
    const id = m[1].match(/compid=(\d+)/);
    if (!id || out.has(id[1])) continue;
    const titulo = textOf(m[1].replace(/<span[\s\S]*?<\/span>/gi, ""));
    out.set(id[1], { compid: Number(id[1]), title: titulo, date: parseCompDate(textOf(m[2]), anoPorDefeito) });
  }
  return [...out.values()];
}

/** HTML das linhas de uma resposta AJAX do filtro: a 1.ª página vem em
 *  {actions:[{html}]}, as seguintes («loadmore») em {html}. */
function ajaxHtml(json) {
  if (!json) return "";
  if (typeof json.html === "string") return json.html;
  return (json.actions || []).map((a) => a.html || "").join("\n");
}

/** Prova individual de juniores (open/campeonato), não aulas, séries de
 *  iniciação nem provas de pares (a linha de inscritos seria a equipa). */
const JUNIOR_RE = /\b(junior|juniors|jnr|boys|girls|youth|u\s?-?1\d|under\s?-?1\d)\b/i;
const FORA_RE = /\b(starter|beginner|taster|academy|coaching|lesson|clinic|parent|texas|scramble|pairs?|foursomes?|greensomes?|mixed)\b/i;
function eProvaJunior(title) {
  return JUNIOR_RE.test(title) && !FORA_RE.test(title);
}

module.exports = { parseEntrants, parseHi, parseCompDate, parseCompRows, ajaxHtml, eProvaJunior };
