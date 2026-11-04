#!/usr/bin/env node
/**
 * scripts/build-egr-golfbox-links.js
 *
 * Gera `public/data/egr/egr-golfbox-links.json` — para cada evento da /egr que
 * a EGR foi buscar ao GolfBox (o `sourceUrl` traz `#/competition/{id}`) e que
 * nós já lemos inteiro (federações: public/data/{swissgolf,rbgf}/{id}.json;
 * provas do scripts/golfbox-scope.json: public/data/{slug}_{ano}.json), o
 * ficheiro rico e as divisões que correspondem ao escalão do evento.
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
 * Correr:  node scripts/build-egr-golfbox-links.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");
const { parseDivGolfbox } = require("./aggregator/util/golfbox-federacao");
const { rosterKey } = require("./aggregator/util/egr-dedup");

const DATA_DIR = path.resolve(__dirname, "..", "public", "data");
const LIST = path.join(DATA_DIR, "egr", "egr-events-list.json");
const OUT = path.join(DATA_DIR, "egr", "egr-golfbox-links.json");
const FEDERACOES = ["swissgolf", "rbgf"];
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

function main() {
  const list = lerJson(LIST);
  if (!list) { console.log("egr-events-list.json em falta — nada a ligar"); return; }
  const ficheiros = ficheirosGolfbox();
  const cache = new Map();
  const links = {};
  for (const ev of list.events || []) {
    const id = compIdDe(ev.sourceUrl);
    const url = id && ficheiros.get(id);
    if (!url) continue;
    if (!cache.has(url)) cache.set(url, lerJson(path.join(DATA_DIR, url.replace(/^\/data\//, ""))));
    const job = cache.get(url);
    if (!job) continue;
    const evento = lerJson(path.join(DATA_DIR, "egr", "events", `egr_${ev.id}.json`));
    const divs = divisoesDoEvento(job, ev, (evento?.players || []).map((p) => p.name));
    if (divs.length) links[ev.id] = { file: url, divs };
  }
  writeJsonAtomic(OUT, { generatedAt: new Date().toISOString(), total: Object.keys(links).length, links });
  console.log(`egr-golfbox-links.json: ${Object.keys(links).length} evento(s) EGR com o ficheiro GolfBox completo`);
}

if (require.main === module) main();
module.exports = { divisoesDoEvento, compIdDe };
