#!/usr/bin/env node
/**
 * scripts/build-egr-fontes-ricas.js
 *
 * Gera `public/data/egr/egr-fontes-ricas.json` — para cada evento da /egr que
 * nós temos inteiro noutra fonte, o ficheiro rico (JobFile) e as divisões que
 * correspondem ao escalão do evento. Dois caminhos:
 *   1. GolfBox: o `sourceUrl` da EGR traz `#/competition/{id}` (federações:
 *      public/data/{swissgolf,rbgf,baltico}/{id}.json; provas do
 *      scripts/golfbox-scope.json: public/data/{slug}_{ano}.json);
 *   2. as provas que o agregador juntou ao evento EGR (`egr/egr-cobertos.json`:
 *      fonte + chave = nome do ficheiro) — DGV, Faldo, Evian, condados
 *      ingleses, JOB… — desde que o ficheiro seja um JobFile (divisions[]).
 *      FFG, FIG e RFEG têm formatos próprios: ficam com os totais e um botão
 *      para a página da prova no site (\`paginas\`); England fica só com os totais.
 *
 * A EGRPage usa-o para mostrar essas provas com cartões buraco a buraco, clube,
 * handicap e draw em vez de só os totais — mantendo o evento EGR (Mariana,
 * 04/11/2026: «em vez de tirar estas provas do EGR, fazer um merge da informação
 * e colocar lá também, para quando consultarmos lá, aparecer»).
 *
 * Escalão: a divisão do mesmo sexo com MAIS jogadores em comum com o evento EGR
 * (nomes) — o «U18» da EGR é muitas vezes o campo todo («Girls», 11 raparigas
 * no Junior Open Wallonie 2025), não a classe «Girls U18» (2). Pelo menos metade
 * do evento EGR tem de estar lá; senão fica só com os totais.
 *
 * Gerado no prebuild (gitignored), como o fpg-files-index.json.
 * Correr:  node scripts/build-egr-fontes-ricas.js (depois do agregador)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");
const { parseDivGolfbox } = require("./aggregator/util/golfbox-federacao");
const { rosterKey } = require("./aggregator/util/egr-dedup");

const DATA_DIR = path.resolve(__dirname, "..", "public", "data");
const LIST = path.join(DATA_DIR, "egr", "egr-events-list.json");
const OUT = path.join(DATA_DIR, "egr", "egr-fontes-ricas.json");
const COBERTOS = path.join(DATA_DIR, "egr", "egr-cobertos.json");
/** Pastas onde pode estar o ficheiro de uma fonte (chave = nome sem .json). */
const PASTAS_EXTRA = ["gg-condados", "ig-condados"];
const FEDERACOES = ["swissgolf", "rbgf", "baltico", "sgf"];
const SCOPE = path.join(__dirname, "golfbox-scope.json");

const compIdDe = (url) => (/#\/competition\/(\d+)/.exec(String(url || "")) || [])[1] || null;
const lerJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

/** competitionId → URL público do JobFile (só os que existem). */
function ficheirosGolfbox() {
  const m = new Map();
  for (const fed of FEDERACOES) {
    const dir = path.join(DATA_DIR, fed);
    let nomes = [];
    try { nomes = fs.readdirSync(dir); } catch { continue; }
    for (const n of nomes) if (/^\d+\.json$/.test(n)) m.set(n.replace(".json", ""), `/data/${fed}/${n}`);
  }
  const scope = lerJson(SCOPE);
  const slugs = new Set((scope?.competitions || []).map((e) => e.slug).filter(Boolean));
  for (const slug of slugs) {
    for (const n of fs.readdirSync(DATA_DIR).filter((x) => x.startsWith(`${slug}_`) && /_\d{4}\.json$/.test(x))) {
      const id = compIdDe(lerJson(path.join(DATA_DIR, n))?.source);
      if (id && !m.has(id)) m.set(id, `/data/${n}`);
    }
  }
  return m;
}

/** Índices das divisões do JobFile com os jogadores do evento EGR (nomes). Vai
 *  juntando a que traz mais jogadores do evento ainda em falta: a EGR às vezes
 *  junta dois escalões num evento («Estonian Junior Open U16/U14») que o GolfBox
 *  separa. Uma divisão só entra se a maioria dos seus jogadores for do evento. */
function divisoesDoEvento(job, ev, nomesEgr) {
  const alvo = new Set(nomesEgr.map(rosterKey).filter(Boolean));
  if (!alvo.size) return [];
  const cands = [];
  (job.divisions || []).forEach((d, i) => {
    const { sex } = parseDivGolfbox(d.division);
    if (ev.sex && sex && sex !== ev.sex) return;
    const nomes = new Set((d.players || []).map((p) => rosterKey(p.name)).filter(Boolean));
    const comuns = [...nomes].filter((k) => alvo.has(k));
    if (nomes.size && comuns.length / nomes.size >= 0.6) cands.push({ i, comuns, n: nomes.size });
  });
  const escolhidas = [];
  const coberto = new Set();
  for (;;) {
    let melhor = null;
    for (const c of cands) {
      if (escolhidas.includes(c.i)) continue;
      const novos = c.comuns.filter((k) => !coberto.has(k)).length;
      // empate: a mais pequena (a que é só aquele escalão)
      if (novos > 0 && (!melhor || novos > melhor.novos || (novos === melhor.novos && c.n < melhor.c.n))) melhor = { c, novos };
    }
    if (!melhor || (escolhidas.length && melhor.novos < 2)) break;
    escolhidas.push(melhor.c.i);
    for (const k of melhor.c.comuns) coberto.add(k);
  }
  return coberto.size >= alvo.size / 2 ? escolhidas.sort((a, b) => a - b) : [];
}

/** URL público do JobFile de uma prova coberta (fonte + chave), ou null. */
function ficheiroCoberto(c) {
  if (!/^[\w.-]+$/.test(c.chave || "")) return null;
  for (const rel of [`${c.chave}.json`, `${c.fonte}/${c.chave}.json`, ...PASTAS_EXTRA.map((p) => `${p}/${c.chave}.json`)]) {
    if (fs.existsSync(path.join(DATA_DIR, rel))) return `/data/${rel}`;
  }
  return null;
}

/** Página da prova AQUI no site, para as fontes com formato próprio (FFG, FIG,
 *  RFEG): a /egr mostra os totais e um botão para a prova completa. */
function paginaDoSite(c) {
  const k = String(c.chave || "");
  if (c.fonte === "ffgolf" && /^\d+$/.test(k)) return `/ffg/t/${encodeURIComponent(`ffgres:${k}`)}`;
  if (c.fonte === "fig" && /^[\w-]+$/.test(k)) return `/fig/${k}`;
  if (c.fonte === "rfeg") {
    const m = /^(lgs|nc|rfeg)(\d+)(?:_|$)/i.exec(k);
    const src = m && { lgs: "livegolfscoring", nc: "nextcaddy", rfeg: "rfegolf" }[m[1].toLowerCase()];
    if (src) return `/rfeg/${src}/${m[2]}`;
  }
  return null;
}

function main() {
  const list = lerJson(LIST);
  if (!list) { console.log("egr-events-list.json em falta — nada a ligar"); return; }
  const ficheiros = ficheirosGolfbox();
  const cobertos = new Map(((lerJson(COBERTOS) || {}).cobertos || []).map((c) => [String(c.egr), c]));
  const cache = new Map();
  const links = {};
  const paginas = {};
  const porFonte = {};
  for (const ev of list.events || []) {
    const id = compIdDe(ev.sourceUrl);
    const cob = cobertos.get(String(ev.id));
    const url = (id && ficheiros.get(id)) || (cob && ficheiroCoberto(cob));
    const pagina = cob && paginaDoSite(cob);
    if (!url) { if (pagina) paginas[ev.id] = pagina; continue; }
    if (!cache.has(url)) cache.set(url, lerJson(path.join(DATA_DIR, url.replace(/^\/data\//, ""))));
    const job = cache.get(url);
    // só JobFiles (divisions[] com players[]) — os outros formatos ficam com os totais
    if (!job || !Array.isArray(job.divisions) || !job.divisions.some((d) => Array.isArray(d.players))) continue;
    const evento = lerJson(path.join(DATA_DIR, "egr", "events", `egr_${ev.id}.json`));
    const divs = divisoesDoEvento(job, ev, (evento?.players || []).map((p) => p.name));
    if (divs.length) {
      links[ev.id] = { file: url, divs };
      const fonte = (id && ficheiros.get(id)) ? "golfbox" : cob.fonte;
      porFonte[fonte] = (porFonte[fonte] || 0) + 1;
    }
  }
  writeJsonAtomic(OUT, { generatedAt: new Date().toISOString(), total: Object.keys(links).length, links, paginas });
  console.log(`egr-fontes-ricas.json: ${Object.keys(links).length} evento(s) EGR com a prova completa — ${Object.entries(porFonte).map(([k, v]) => `${k}×${v}`).join(" · ")}; ${Object.keys(paginas).length} com botão para a página do site (FFG/FIG/RFEG)`);
}

if (require.main === module) main();
module.exports = { divisoesDoEvento, compIdDe, paginaDoSite };
