/**
 * scripts/lib/doral-aceites.js — lista de jogadores ACEITES do First Tee Miami
 * Doral Jr. Classic (página «ACCEPTED PLAYERS LIST» do GolfGenius).
 *
 * Desde 2026 o field é limitado (obras no Doral) e a comissão escolhe quem
 * entra; a lista sai antes do torneio numa página de texto do portal
 * (widget `text_pages`), colada de um Excel: uma linha por jogador com
 * Nome · Apelido · País · Escalão, e «PUBLISHED NOV 16, 26» por cima.
 *
 * O país vem escrito à mão por cada família («USA», «united states»,
 * «México», «CA», «Deutschland», «VENETO», um código postal…) → ISO-2, o
 * vocabulário do `src/utils/flagUtils.ts`. O que não se reconhece fica vazio,
 * com o texto original em `countryRaw` — nunca se adivinha.
 *
 * Usado por `scripts/scrape-doral-aceites.js` (grava) e por
 * `scripts/scrape-golfgenius-v3.js` (mantém a lista quando chegam os resultados).
 */

/** Letras acentuadas com nome (&eacute; &Ntilde; &uuml; &ccedil;…): letra + sinal. */
const SINAL = { acute: "́", grave: "̀", circ: "̂", tilde: "̃", uml: "̈", cedil: "̧", ring: "̊" };
const OUTRAS = { szlig: "ß", oslash: "ø", Oslash: "Ø", aelig: "æ", AElig: "Æ" };
const letraComNome = (m, nome) => {
  if (OUTRAS[nome]) return OUTRAS[nome];
  const x = nome.match(/^([a-zA-Z])(acute|grave|circ|tilde|uml|cedil|ring)$/);
  return x ? (x[1] + SINAL[x[2]]).normalize("NFC") : m;
};

const decodeEntities = (s) => s
  .replace(/&([a-zA-Z]+);/g, (m, nome) => (/^(nbsp|amp|lt|gt|quot|apos)$/i.test(nome) ? m : letraComNome(m, nome)))
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

const cellText = (html) => decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

const MESES = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

/** «PUBLISHED NOV 16, 26» → "2026-11-16" (null se não houver). */
function dataPublicada(html) {
  const m = cellText(html).match(/PUBLISHED\s+([A-Z]{3})[A-Z]*\.?\s+(\d{1,2}),?\s+(\d{2,4})/i);
  if (!m || !MESES[m[1].toUpperCase()]) return null;
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${ano}-${String(MESES[m[1].toUpperCase()]).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** País escrito à mão → ISO-2 (maiúsculas). Desconhecido → "". */
const PAIS = {
  "usa": "US", "us": "US", "u.s.": "US", "u.s.a.": "US", "united states": "US", "united state": "US",
  "united states of america": "US", "estados unidos": "US",
  "mexico": "MX", "méxico": "MX", "canada": "CA", "ca": "CA", "south africa": "ZA",
  "bolivia": "BO", "colombia": "CO", "brasil": "BR", "brazil": "BR", "spain": "ES", "españa": "ES",
  "deutschland": "DE", "germany": "DE", "france": "FR", "united kingdom": "GB", "uk": "GB",
  "england": "GB-ENG", "scotland": "GB-SCT", "wales": "GB-WLS", "ireland": "IE",
  "austria": "AT", "singapore": "SG", "puerto rico": "PR", "republica dominicana": "DO",
  "república dominicana": "DO", "dominican republic": "DO", "guatemala": "GT", "italy": "IT", "italia": "IT",
  // Região italiana escrita no lugar do país.
  "veneto": "IT",
  "bulgaria": "BG", "russia": "RU", "sweden": "SE", "panama": "PA", "panamá": "PA", "latvia": "LV",
  "belgium": "BE", "portugal": "PT", "argentina": "AR", "chile": "CL", "peru": "PE", "venezuela": "VE",
  "ecuador": "EC", "costa rica": "CR", "honduras": "HN", "el salvador": "SV", "uruguay": "UY",
  "paraguay": "PY", "netherlands": "NL", "switzerland": "CH", "denmark": "DK", "norway": "NO",
  "finland": "FI", "poland": "PL", "china": "CN", "japan": "JP", "korea": "KR", "south korea": "KR",
  "india": "IN", "thailand": "TH", "philippines": "PH", "australia": "AU", "new zealand": "NZ",
  "jamaica": "JM", "bahamas": "BS", "barbados": "BB", "trinidad and tobago": "TT", "cayman islands": "KY",
};
function paisIso(raw) {
  const k = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  return PAIS[k] || "";
}

/** Escalões que o Doral tem (rótulos como no GolfGenius de 2025). */
const ESCALOES = [
  "Boys 7 & Under", "Boys 8 & 9", "Boys 10 & 11", "Boys 12 & 13", "Boys 14 & 15", "Boys 16-18",
  "Girls 7 & Under", "Girls 8 & 9", "Girls 10 & 11", "Girls 12 & 13", "Girls 14 & 15", "Girls 16-18",
];
const chaveEsc = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/\s*(&|-|to)\s*/g, "-").trim();
const ESC_POR_CHAVE = new Map(ESCALOES.map((e) => [chaveEsc(e), e]));

/** Gralhas da lista publicada, cada uma provada nos dados do site (nunca
 *  adivinhada): nome do jogador (minúsculas) + escalão escrito → escalão certo. */
const CORRECCOES = {
  // 2026: «Boys 14 & 16» não existe. Henry e Jack Sokol (gémeos, gradYear 2029)
  // jogaram juntos Boys 12-13 em 2024 e Boys 14 & 15 em 2025; o Jack está no
  // Boys 14 & 15 desta mesma lista.
  "henry sokol|boys 14-16": "Boys 14 & 15",
};

/**
 * HTML do widget → { publicado, jogadores: [{ first, last, name, country,
 * countryRaw?, division, divisionRaw? }], ignorados: [linhas que não são jogadores] }.
 * `name` no formato do resto do Doral: «Apelido, Nome».
 */
function parseAceites(html) {
  const jogadores = [];
  const ignorados = [];
  const linhas = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const tr of linhas) {
    const cel = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellText(m[1]));
    if (cel.length < 4 || !cel[0] && !cel[1]) { if (cel.some(Boolean)) ignorados.push(cel.join(" | ")); continue; }
    const [first, last, paisRaw, escRaw] = cel;
    const full = `${first} ${last}`.replace(/\s+/g, " ").trim();
    const chave = chaveEsc(escRaw);
    const division = CORRECCOES[`${full.toLowerCase()}|${chave}`] || ESC_POR_CHAVE.get(chave);
    if (!division) { ignorados.push(cel.join(" | ")); continue; }
    const country = paisIso(paisRaw);
    jogadores.push({
      first, last,
      name: last ? `${last}, ${first}` : first,
      country,
      ...(country ? {} : { countryRaw: paisRaw }),
      division,
      ...(division !== ESC_POR_CHAVE.get(chave) ? { divisionRaw: escRaw } : {}),
    });
  }
  return { publicado: dataPublicada(html), jogadores, ignorados };
}

/** Uma divisão do ficheiro do Doral → a chave do escalão («boys-14-15»). */
const chaveDivisao = (d) => chaveEsc(d && d.division);

/**
 * Junta a lista de aceites a um ficheiro do Doral (sem mexer nos resultados):
 * cada escalão ganha `accepted`; os escalões sem divisão ainda criam-se vazios.
 * Os escalões que a lista não traz ficam sem `accepted`.
 */
function juntarAceites(file, jogadores) {
  const porEsc = new Map();
  for (const j of jogadores) {
    if (!porEsc.has(j.division)) porEsc.set(j.division, []);
    const { division: _d, first: _f, last: _l, ...resto } = j;
    porEsc.get(j.division).push(resto);
  }
  const divisions = (file.divisions || []).map((d) => {
    const { accepted: _velho, ...semLista } = d;
    const lista = porEsc.get(ESC_POR_CHAVE.get(chaveDivisao(d)) || d.division);
    return lista ? { ...semLista, accepted: lista } : semLista;
  });
  const existentes = new Set(divisions.map(chaveDivisao));
  for (const esc of ESCALOES) {
    if (!porEsc.has(esc) || existentes.has(chaveEsc(esc))) continue;
    divisions.push({ division: esc, name: `${esc} Division`, players: [], accepted: porEsc.get(esc) });
  }
  const ordem = (d) => { const i = ESCALOES.indexOf(ESC_POR_CHAVE.get(chaveDivisao(d))); return i < 0 ? 99 : i; };
  divisions.sort((a, b) => ordem(a) - ordem(b));
  return { ...file, divisions };
}

/**
 * Quando chegam os resultados (`scrape-golfgenius-v3.js`), o ficheiro novo só
 * traz as divisões com leaderboard. Mantém do ficheiro anterior: a lista de
 * aceites, as datas e o campo do ano — nada disto vem dos resultados.
 */
function manterAceites(anterior, novo) {
  if (!anterior || !Array.isArray(anterior.divisions)) return novo;
  const extra = {};
  for (const k of ["startDate", "endDate", "acceptedList"]) if (anterior[k] != null && novo[k] == null) extra[k] = anterior[k];
  const ant = new Map(anterior.divisions.map((d) => [chaveDivisao(d), d]));
  const divisions = (novo.divisions || []).map((d) => {
    const a = ant.get(chaveDivisao(d));
    if (!a) return d;
    return {
      ...d,
      ...(a.course && !d.course ? { course: a.course } : {}),
      ...(a.accepted ? { accepted: a.accepted } : {}),
    };
  });
  const novas = new Set(divisions.map(chaveDivisao));
  for (const a of anterior.divisions) {
    if (!novas.has(chaveDivisao(a)) && a.accepted && a.accepted.length) divisions.push({ ...a, players: [] });
  }
  return { ...novo, ...extra, divisions };
}

module.exports = { parseAceites, paisIso, dataPublicada, juntarAceites, manterAceites, ESCALOES };
