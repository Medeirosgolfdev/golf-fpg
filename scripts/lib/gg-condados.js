/**
 * scripts/lib/gg-condados.js — leitura (pura, sem rede) dos circuitos de
 * juniores dos condados ingleses no GolfGenius (03/11/2026).
 *
 * As associações de condado (BB&O, …) publicam o circuito de juniores num
 * «customer directory» do GolfGenius: uma lista JSON de provas
 * (fetch_initial_data_for_directories), cada uma com a página de resultados
 * (`resultsPath`). Em cada prova há duas classificações por escalão —
 * «… Gross - U14» e «… Net - U14» — e a diferença entre as duas é o handicap
 * de jogo do miúdo nesse dia (não é o HI: depende do campo e da percentagem).
 *
 * O scraper é scripts/scrape-gg-condados.js (cartões e tees pelo motor do
 * scrape-golfgenius-node.js); o formato de saída é o JobFile dos adapters
 * GolfGenius (scripts/aggregator/util/jobfile.js), com `hcpJogo` por jogador.
 */

/** Provas do directório (o `leagues` vem como objecto de listas). */
function eventosDoDirectorio(json) {
  const out = [];
  const visto = new Set();
  for (const e of Object.values(json?.leagues || {}).flat()) {
    if (!e || e.deleted || e.product !== "event" || visto.has(e.id)) continue;
    visto.add(e.id);
    out.push({
      id: String(e.id),
      name: String(e.name || "").replace(/\s+/g, " ").trim(),
      leagueId: String(e.registrationInfo?.league_id || e.id),
      startDate: e.startDate || null,
      endDate: e.endDate || null,
      courses: Array.isArray(e.courses) ? e.courses : [],
      resultsPageId: (String(e.resultsPath || "").match(/pages\/(\d+)/) || [])[1] || null,
    });
  }
  return out.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
}

/**
 * Nome de uma classificação → { tipo, escalao, saltar }.
 *   «Futures Tour Frilford Heath Gross - U14»        → gross · «U14»
 *   «Under 12's Girls Nett - 18 Holes Under 12's Girls» → net · «Girls U12»
 * `saltar`: 9 buracos (só os mais pequenos — os totais de 9 e 18 não se
 * misturam) e classificações por pontos (Stableford: pontos não são pancadas).
 */
function classificarLeaderboard(nome) {
  const s = String(nome || "");
  const tipo = /\bnett?\b/i.test(s) ? "net" : "gross";
  const sexo = /\bgirls?\b/i.test(s) ? "Girls" : /\bboys?\b/i.test(s) ? "Boys" : null;
  // O ÚLTIMO escalão do nome: «U12 & U14 Championship - U14» é o U14.
  const u = [...s.matchAll(/\b(?:u|under)\s?-?(\d{1,2})\b/gi)].pop();
  const faixa = s.match(/\((\d{1,2})\s*-\s*(\d{1,2})\s*years?\)/i);
  const depois = s.includes(" - ") ? s.slice(s.lastIndexOf(" - ") + 3).trim() : "";
  const idade = u ? `U${u[1]}` : faixa ? `${faixa[1]}-${faixa[2]}` : sexo ? "" : depois || "Geral";
  const escalao = [sexo, idade].filter(Boolean).join(" ");
  const saltar = /\b9\s*holes?\b/i.test(s) ? "9 buracos" : /stableford|\bpoints?\b|\bpts\b/i.test(s) ? "pontos" : null;
  return { tipo, escalao, saltar };
}

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** «Goring and Streatley (Berkshire)» → «Goring and Streatley». */
const limparClube = (a) => String(a || "").replace(/\s*\([^)]*\)\s*$/, "").trim() || null;

const chaveNome = (n) => String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

/** Linhas de um v2tournaments (JSON) → [{ name, total, club }]. */
function linhasDe(v2) {
  const linhas = [];
  for (const sc of v2?.event?.scopes || []) {
    for (const a of sc.aggregates || []) {
      const name = String(a.name || "").replace(/\s+/g, " ").trim();
      if (!name) continue;
      const total = num(a.total);
      linhas.push({ name, total: total != null && total > 0 ? total : null, club: limparClube(a.affiliation) });
    }
  }
  return linhas;
}

/**
 * Handicap de jogo por nome = Gross − Net (negativo = plus). Sem as duas
 * linhas, ou com uma diferença impossível, não há valor — nunca se inventa.
 */
function hcpJogoPorNome(gross, net) {
  const n = new Map((net || []).map((x) => [chaveNome(x.name), x.total]));
  const out = new Map();
  for (const g of gross || []) {
    const k = chaveNome(g.name);
    const t = n.get(k);
    if (g.total == null || t == null) continue;
    const h = g.total - t;
    if (h >= -10 && h <= 54) out.set(k, h);
  }
  return out;
}

/** Nome da prova: «BB&O Futures Tour — Thorney Park» / «— Final, Frilford Heath». */
function nomeDaProva(nomeEvento, circuito) {
  const s = String(nomeEvento).trim();
  // Directórios com provas de vários tipos (BB&O, Cheshire): o nome do
  // evento fica inteiro, só com o condado à frente.
  if (circuito.prefixo) return s.toLowerCase().startsWith(circuito.prefixo.toLowerCase()) ? s : `${circuito.prefixo} ${s}`;
  // «PING Junior Golf Tour 2026 - Louth Golf Club» → «Louth Golf Club»
  if (/\btour\b[^-]*\s-\s/i.test(s)) return `${circuito.nome} — ${s.slice(s.indexOf(" - ") + 3).trim()}`;
  const final = /\bfinal\b/i.test(s);
  const local = s.replace(/^.*?\b(?:tour|series|order of merit)\b\s*/i, "").replace(/\bfinal\b\s*/i, "").trim();
  return `${circuito.nome}${local ? ` — ${final ? "Final, " : ""}${local}` : final ? " — Final" : ""}`;
}

/** Jardas → metros (circuitos com `jardas: true` no scope). */
const jardasParaMetros = (arr) => (Array.isArray(arr) ? arr.map((y) => (typeof y === "number" ? Math.round(y * 0.9144) : y)) : arr);

module.exports = { eventosDoDirectorio, classificarLeaderboard, linhasDe, hcpJogoPorNome, nomeDaProva, limparClube, chaveNome, jardasParaMetros };
