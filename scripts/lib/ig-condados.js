/**
 * scripts/lib/ig-condados.js — leitura dos sites das associações de condado
 * inglesas em intelligentgolf (03/11/2026). Só funções puras (HTML → dados);
 * os pedidos ficam no scrape-ig-condados.js.
 *
 * Páginas (sem login, fetch simples):
 *   /competition.php?compid=N&sort=2   → resultados em Gross. Dois formatos:
 *       · uma volta: «1st · Nome (hcp) · Clube · 71» com roundmgmt.php?playerid e viewround.php?roundid;
 *       · várias voltas («Gross Leaderboard»): colunas R1/R2 (cada uma é outra prova,
 *         com o seu compid), Total e Par; sem playerid.
 *     Cabeçalho: <h3>Nome</h3><h4>Monday 27th July 2026, White Tees, Leatherhead</h4>
 *     e «(95% handicap allowance)». Divisões: botões «division=N».
 *     compid inexistente → «Login Required».
 *   /viewround.php?roundid=N           → cartão: Yards/Metres, SI, Par, Score, tee e data.
 *
 * O número entre parênteses é o HANDICAP DE JOGO do dia (inteiro; «-3» = plus 3:
 * gross 67, nett 70). Não é o HI — o site do condado não mostra o HI em lado nenhum.
 */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+|#39);/gi, (m, k) => ENTITIES[k.toLowerCase()] ?? m);
}
const textOf = (html) => decode(String(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** «Ryan (Ryino)  Salisbury» → «Ryan Salisbury» · «Hugh Harris (Jnr)» → «Hugh Harris»: sem alcunhas nem espaços a mais. */
const limparNome = (s) => decode(String(s || "")).replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();

const MESES = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
/** «Monday 27th July 2026» → «2026-07-27». */
function dataISO(s) {
  const m = String(s || "").match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m || !MESES[m[2].toLowerCase()]) return null;
  return `${m[3]}-${String(MESES[m[2].toLowerCase()]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
}

/** «-3» → −3 (plus) · «+2» → −2 (plus) · «12» → 12 · outra coisa → null. */
function parseHcp(s) {
  const t = String(s ?? "").trim();
  if (!/^[+-]?\d{1,2}$/.test(t)) return null;
  const v = Number(t.replace(/^\+/, ""));
  return t.startsWith("+") ? -v : v;
}

/** Cabeçalho da página de uma prova. */
function lerCabecalho(html) {
  const t = String(html || "");
  if (/<title>\s*Login Required/i.test(t)) return { existe: false };
  const nome = textOf((t.match(/<div class="global">\s*<h3>([\s\S]*?)<\/h3>/) || [])[1] || "");
  if (!nome) return { existe: false };
  const h4 = textOf((t.match(/<div class="global">\s*<h3>[\s\S]*?<\/h3>\s*<h4>([\s\S]*?)<\/h4>/) || [])[1] || "");
  const partes = h4.split(",").map((x) => x.trim());
  const tees = partes.find((p) => /\btees?\b/i.test(p)) || null;
  const campo = partes.slice(partes.indexOf(tees) + 1).join(", ").trim() || null;
  const allowance = (t.match(/\((\d{1,3})% handicap allowance\)/) || [])[1];
  const pontos = /Gross Points|Nett Points|Stableford Points/i.test(t);
  const leaderboard = /class='leaderboardText'/.test(t);
  return {
    existe: true, nome, data: dataISO(partes[0]), tees: tees ? tees.replace(/\s*tees?$/i, "").trim() : null,
    campo: tees ? campo : partes.slice(1).join(", ").trim() || null,
    allowance: allowance ? Number(allowance) : null, pontos, leaderboard,
  };
}

/** Botões de divisão: [{ n, nome }] (sem o «All Results»). */
function divisoes(html) {
  const out = [];
  // ⚠ o division= nem sempre é o último parâmetro («…&division=1&sort=2&sort=2»)
  for (const m of String(html || "").matchAll(/href="[^"]*[?&]division=(\d+)[^"]*" class="button btn[^"]*">([^<]+)</g)) {
    if (!out.some((d) => d.n === m[1])) out.push({ n: m[1], nome: decode(m[2]).trim() });
  }
  return out;
}

const ESTADO = (s) => (/\bDQ|DSQ\b/i.test(s) ? "DQ" : /\bWD|RTD|RET\b/i.test(s) ? "WD" : /\bDNS\b/i.test(s) ? "DNS" : /\bNR\b|no return/i.test(s) ? "NR" : null);

/** Resultados no formato de uma volta: [{ pos, playerid, nome, hcp, clube, roundid, gross, estado }]. */
function linhasSimples(html) {
  const out = [];
  const re = /results_position'>([^<]*)<\/span><\/td><td>\s*<a href="roundmgmt\.php\?playerid=(\d+)">([^<]+)<\/a>\s*\(([^)]*)\)\s*<br><i>([^<]*)<\/i><td>([\s\S]*?)<\/td><\/td><\/tr>/g;
  for (const m of String(html || "").matchAll(re)) {
    const cel = m[6];
    const roundid = (cel.match(/viewround\.php\?roundid=(\d+)/) || [])[1] || null;
    const txt = textOf(cel.replace(/title="[^"]*"/g, ""));
    const gross = /^\d{2,3}\b/.test(txt) ? Number(txt.match(/^\d{2,3}/)[0]) : null;
    out.push({
      pos: textOf(m[1]) || null, playerid: m[2], nome: limparNome(m[3]), hcp: parseHcp(m[4]),
      clube: decode(m[5]).trim() || null, roundid, gross, estado: gross == null ? ESTADO(txt) || "NR" : null,
    });
  }
  return out;
}

/** Resultados no formato «Gross Leaderboard» (várias voltas). */
function linhasLeaderboard(html) {
  const t = String(html || "");
  const cab = (t.match(/<thead>([\s\S]*?)<\/thead>/) || [])[1] || "";
  const rondas = [...cab.matchAll(/class='rdetail'><a href='\/?competition\.php\?compid=(\d+)'>([^<]*)</g)].map((m) => ({ compid: m[1], nome: m[2] }));
  const linhas = [];
  for (const tr of t.split(/<tr class="(?:odd|even)">/).slice(1)) {
    const pos = textOf((tr.match(/class="poscol">([\s\S]*?)<\/td>/) || [])[1] || "");
    const nc = (tr.match(/class="namecol">([\s\S]*?)<\/td>/) || [])[1];
    if (nc == null) continue;
    const clube = textOf((nc.match(/class='courseName'>([\s\S]*?)<\/i>/) || [])[1] || "") || null;
    const hcp = parseHcp((textOf(nc).match(/\(([+-]?\d{1,2})\)\s*$/) || [])[1]);
    const nome = limparNome(textOf(nc.replace(/<i[\s\S]*?<\/i>/g, "")).replace(/\s*\([+-]?\d{1,2}\)\s*$/, ""));
    const voltas = [...tr.matchAll(/class='rdetail'>([\s\S]*?)<\/td>/g)].map((x) => {
      const roundid = (x[1].match(/roundid=(\d+)/) || [])[1] || null;
      const g = textOf(x[1]);
      return { roundid, gross: /^\d{2,3}$/.test(g) ? Number(g) : null };
    });
    const resto = [...tr.replace(/[\s\S]*class='rdetail'>[\s\S]*?<\/td>/, "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => textOf(x[1]));
    const total = /^\d{2,3}$/.test(resto[0] || "") ? Number(resto[0]) : null;
    const par = resto[1] === "E" || resto[1] === "Level" ? 0 : /^[+-]?\d{1,3}$/.test(resto[1] || "") ? Number(resto[1]) : null;
    if (!nome) continue;
    linhas.push({ pos: pos || null, nome, clube, hcp, voltas, total, toPar: par, estado: total == null ? ESTADO(resto.join(" ")) || "NR" : null });
  }
  return { rondas, linhas };
}

/** Cartão de uma volta (viewround.php). */
function lerCartao(html) {
  const t = String(html || "");
  const linha = (rot) => {
    // ⚠ o site escreve «<td  class=…» (dois espaços)
    const m = t.match(new RegExp(`<td\\s+class="rowheader"><strong>${rot}</strong></td>([\\s\\S]*?)</tr>`, "i"));
    if (!m) return null;
    const cels = [...m[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
    // só as 18 (ou 9) células dos buracos: as de OUT/IN/TOTAL vêm em <strong> ou «lastcol»
    const v = cels.filter((c) => !/lastcol/.test(c[1]) && !/<strong>/.test(c[2])).map((c) => textOf(c[2]));
    return v.map((x) => (/^\d{1,3}$/.test(x) ? Number(x) : null));
  };
  const unidade = /rowheader"><strong>(?:Metres|Meters)</i.test(t) ? "m" : /rowheader"><strong>Yards</i.test(t) ? "jd" : null;
  const dist = linha("Yards") || linha("Metres") || linha("Meters");
  const head = textOf((t.match(/<thead>([\s\S]*?)<\/thead>/) || [])[1] || "");
  const tee = (head.match(/ - ([^-]+?) Tees?\s*$/i) || [])[1] || null;
  const total = Number((textOf((t.match(/class="finalres"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || "").match(/Gross (\d{2,3})/) || [])[1]) || null;
  return { par: linha("Par"), si: linha("SI"), dist, unidade, pancadas: linha("Score"), tee: tee && tee.trim(), data: dataISO(head), gross: total };
}

/**
 * É uma prova de juniores que interessa? Fora: Stableford/pontos, pares e
 * equipas, adultos à mistura (Women & Girls), inscrições e eliminatórias.
 */
// «Colts» e «Youth» ficam de fora: vão até aos 21–25 anos (adultos no Kids 2).
const JUNIOR = /\b(boys?|girls?|juniors?|jnrs?|u\s?1[0-8]|under[ -]?1[0-8])\b/i;
const FORA = /stableford|\bpoints?\b|foursomes|greensomes|pairs|team|knock ?out|match ?play|\bmatch\b|sign ?up|interclub|scramble|texas|\bpar 3\b|pitch|9 holes?|\bwomen|ladies|\bmen'?s?\b|senior|mixed|parent|\bv\b|\bvs\b|coaching|camp\b/i;
const eProvaJuniorCondado = (nome) => JUNIOR.test(String(nome || "")) && !FORA.test(String(nome || ""));

/**
 * Escalão de um rótulo: sexo (Boys/Girls) + a MAIOR idade («U13 & U14» → U14;
 * «Under 16 & Under 14» → U16, o limite de cima do campo). Sem idade → só o sexo
 * ou null.
 */
function escalao(nome) {
  const s = String(nome || "");
  // «Girls & Boys» é misto: sem sexo
  const g = /\bgirls?\b/i.test(s), b = /\bboys?\b/i.test(s);
  const sexo = g && !b ? "Girls" : b && !g ? "Boys" : null;
  const idades = [...s.matchAll(/\b(?:u|under)\s?-?(\d{1,2})s?\b/gi)].map((m) => Number(m[1])).filter((n) => n >= 8 && n <= 21);
  const idade = idades.length ? `U${Math.max(...idades)}` : null;
  return [sexo, idade].filter(Boolean).join(" ") || null;
}

/** «U17 & U18 Surrey County Championship 2026 Round 1» → sem o «Round 1». */
const semRonda = (nome) => String(nome || "").replace(/\s*[-–:]?\s*\(?\b(?:round|rd|r)\s?\d\b\)?\s*$/i, "").replace(/\s*[-–]\s*$/, "").trim();

const jardasParaMetros = (a) => (Array.isArray(a) ? a.map((v) => (typeof v === "number" ? Math.round(v * 0.9144) : v)) : a);

/**
 * Cada volta só numa prova: o site repete as mesmas voltas na prova-mãe e nas
 * filhas (Kent: «Junior Championship» com os dois tees e uma prova por tee; as
 * de várias voltas têm a R1 e a R2 como provas próprias). Ficam as provas de
 * várias voltas primeiro e depois as mais pequenas; uma prova cujas voltas já
 * estão todas noutra sai, e de uma em parte só ficam as linhas que faltam.
 * provas: [{ compid, multi:boolean, linhas:[{ roundids:[...] }] }] → mesmas provas, filtradas.
 */
function umaProvaPorVolta(provas) {
  const ordem = [...provas].sort((a, b) => (b.multi - a.multi) || (a.linhas.length - b.linhas.length) || String(a.compid).localeCompare(String(b.compid)));
  const vistas = new Set();
  const out = [];
  for (const p of ordem) {
    const linhas = p.linhas.filter((l) => {
      const ids = (l.roundids || []).filter(Boolean);
      return !ids.length || !ids.every((id) => vistas.has(id));
    });
    for (const l of linhas) for (const id of l.roundids || []) if (id) vistas.add(id);
    if (linhas.length) out.push({ ...p, linhas });
  }
  return out;
}

module.exports = { decode, textOf, limparNome, dataISO, parseHcp, lerCabecalho, divisoes, linhasSimples, linhasLeaderboard, lerCartao, eProvaJuniorCondado, escalao, semRonda, jardasParaMetros, umaProvaPorVolta };
