#!/usr/bin/env node
/**
 * scripts/scrape-lgs-matchplay.js — fase de MATCH PLAY dos campeonatos por
 * equipas do LGS/mitarjeta (Campeonatos de España de FFAA, …). 30/10/2026.
 *
 * Estes campeonatos têm 1 dia de stroke play individual (o que o
 * scrape-livegolfscoring.js lê) e depois 3 dias de cruzamentos entre
 * federações (foursomes + individuais), que não têm cartões de pancadas:
 *   /torneos/matchplay/{id}            → «Cruces: Día 2 | Día 3 | Día 4» (ou
 *                                         todos os dias na mesma página)
 *   /torneos/cruces/{id}/{dia}         → flights e confrontos de um dia
 *   /partidos/view/{id}/{confronto}    → jogos: jogadores, quem ganhou, «5/4»
 *   /torneos/resultados/{id}           → classificação final por equipas
 * Sem match play a página vem vazia (200, 0 bytes).
 *
 * Grava public/data/lgs-matchplay/{id}.json no formato MatchplayFile
 * (src/ui/circuit/matchplayTypes.ts) → aba «Match Play» da /rfeg. O
 * index.json guarda o que já se verificou: um torneio lido depois do último dia
 * não se volta a pedir.
 *
 * USO:
 *   node scripts/scrape-lgs-matchplay.js            # torneios LGS por verificar
 *   node scripts/scrape-lgs-matchplay.js --ids 393,389
 * Exit: 0 gravou · 2 nada de novo · 1 erro (tudo falhou).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { httpGet, lgsFimIso } = require("./scrape-livegolfscoring");
const { writeJsonAtomic } = require("./lib/atomic-write");

const LGS_DIR = path.resolve(__dirname, "../public/data/rfegolf-livegolfscoring");
const OUT_DIR = path.resolve(__dirname, "../public/data/lgs-matchplay");
const INDEX = path.join(OUT_DIR, "index.json");
const BASE = "https://mitarjeta.golf";
const PAUSA_MS = 300;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ENT = { amp: "&", quot: '"', nbsp: " ", lt: "<", gt: ">" };
const texto = (s) => String(s || "").replace(/<[^>]+>/g, " ")
  .replace(/&(#\d+|[a-z]+);/gi, (m, e) => (e[0] === "#" ? String.fromCharCode(+e.slice(1)) : ENT[e.toLowerCase()] ?? m))
  .replace(/\s+/g, " ").trim();
const pontos = (s) => { const n = parseFloat(String(s).replace(",", ".")); return Number.isFinite(n) ? n : null; };

/** «APELLIDO APELLIDO, NOMBRE» → «Nombre Apellido Apellido» (capitalizado). */
function nomeJogador(s) {
  const cap = (x) => x.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const [ap, no] = texto(s).split(/\s*,\s*/);
  return cap(no ? `${no} ${ap}` : ap);
}

/** Um dia de cruzamentos: blocos `<div class="division">` com <h5> e tabela. */
function lerDia(html, nome) {
  const flights = [];
  for (const blk of html.split(/<div class="division">/).slice(1)) {
    const h5 = /<h5>([\s\S]*?)<\/h5>/.exec(blk);
    const tabela = /<table class="cruces">([\s\S]*?)<\/table>/.exec(blk);
    if (!h5 || !tabela) continue;
    const confrontos = [];
    for (const tr of tabela[1].split(/<tr>/).slice(1)) {
      const eq = [...tr.matchAll(/<td class="comunidad"><h6>([\s\S]*?)<\/h6>/g)].map((m) => texto(m[1]));
      const res = /<td class="resultado">([\s\S]*?)<\/td>/.exec(tr);
      const rank = /<td class="rank">([\s\S]*?)<\/td>/.exec(tr);
      const pid = /partidos\/view\/\d+\/(\d+)/.exec(tr);
      if (eq.length < 2) continue;
      confrontos.push({ casa: eq[0], fora: eq[1], resultado: res ? texto(res[1]) : "", label: rank ? texto(rank[1]) : null, pid: pid ? +pid[1] : null });
    }
    if (confrontos.length) flights.push({ flight: texto(h5[1]), confrontos });
  }
  return { nome, flights };
}

/** Jogos de um confronto (/partidos/view): foursomes e individuais. */
function lerJogos(html) {
  const jogos = [];
  let formato = null;
  const corpo = (/<table class="partidosi">([\s\S]*?)<\/table>/.exec(html) || [])[1] || "";
  const linhas = corpo.split(/<tr/).slice(1);
  for (let i = 0; i < linhas.length; i++) {
    const tr = linhas[i];
    const h5 = /<h5>([\s\S]*?)<\/h5>/.exec(tr);
    if (h5) {
      const t = texto(h5[1]);
      if (/foursome/i.test(t)) formato = "foursome";
      else if (/individual|single/i.test(t)) formato = "single";
      continue;
    }
    if (!/class="partidoi/.test(tr)) continue;
    const lados = [...tr.matchAll(/<td class="(?:right )?comunidad ?([a-z]*)">([\s\S]*?)<\/td>/g)];
    if (lados.length < 2) continue;
    const nomes = (c) => [...c.matchAll(/<a [^>]*class="ficha">([\s\S]*?)<\/a>/g)].map((m) => nomeJogador(m[1]));
    const celula = (cls) => { const m = new RegExp(`<td class="${cls}[^"]*">\\s*(?:<div class="inputpartido">([^<]*)</div>)?`).exec(tr); return m && m[1] ? m[1].trim() : null; };
    const g1 = celula("gana1"), as = celula("as"), g2 = celula("gana2");
    const info = texto((linhas[i + 1] || "").match(/<td class="infopartido"[\s\S]*?<\/td>/)?.[0] || "");
    const buraco = /Hoyo:\s*(\d+)/i.exec(info);
    const n = /<td class="partidon"><strong>(\d+)<\/strong>/.exec(tr);
    jogos.push({
      matchNo: n ? +n[1] : jogos.length + 1,
      order: jogos.length + 1,
      format: formato,
      result: g1 || g2 || as || null,
      playedHoles: buraco ? +buraco[1] : null,
      startTime: null,
      isFinal: /finalizado/i.test(info),
      home: { teamId: null, name: null, players: nomes(lados[0][2]), result: g1, won: lados[0][1] === "ganador" },
      away: { teamId: null, name: null, players: nomes(lados[1][2]), result: g2, won: lados[1][1] === "ganador" },
    });
  }
  return jogos;
}

function lerClassificacao(html) {
  const t = /<table[^>]*class="resultadofinal"[^>]*>([\s\S]*?)<\/table>/.exec(html);
  if (!t) return [];
  return [...t[1].matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)]
    .map((m) => ({ pos: parseInt(texto(m[1]), 10), name: texto(m[2]) }))
    .filter((r) => Number.isFinite(r.pos) && r.name);
}

const somaDias = (iso, n) => {
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function pedir(url) {
  const r = await httpGet(url);
  await sleep(PAUSA_MS);
  if (r.status !== 200) throw new Error(`HTTP ${r.status} ${url}`);
  return r.body || "";
}

async function lerTorneio(id, lgs) {
  const principal = await pedir(`${BASE}/torneos/matchplay/${id}`);
  if (!/class="cruces"/.test(principal)) return null;   // sem match play

  // Dias: blocos <h4> («Día 4 - Final», «Día 3 - Semifinales»…) na página
  // principal. Os links «Cruces: Día N» são o QUADRO do sorteio, não os resultados.
  const dias = [];
  for (const p of principal.split(/<h4>/).slice(1)) {
    const nome = texto(p.slice(0, p.indexOf("</h4>")));
    const n = /D[ií]a\s*(\d+)/i.exec(nome);
    const dia = { numero: n ? +n[1] : dias.length + 2, ...lerDia(p, nome) };
    if (dia.flights.length) dias.push(dia);
  }
  dias.sort((a, b) => a.numero - b.numero);

  // Jogos de cada confronto (um pedido por confronto, sequencial).
  const jogosPorPid = new Map();
  for (const d of dias) for (const f of d.flights) for (const c of f.confrontos) {
    if (c.pid && !jogosPorPid.has(c.pid)) jogosPorPid.set(c.pid, lerJogos(await pedir(`${BASE}/partidos/view/${id}/${c.pid}`)));
  }
  const classificacao = lerClassificacao(await pedir(`${BASE}/torneos/resultados/${id}`));

  // Flights → rondas (dias) → confrontos, no formato MatchplayFile.
  const ini = (lgs.meta && lgs.meta.dateIso) || null;
  const flights = new Map();
  for (const d of dias) {
    for (const f of d.flights) {
      if (!flights.has(f.flight)) flights.set(f.flight, []);
      flights.get(f.flight).push({
        number: d.numero,
        name: d.nome,
        date: somaDias(ini, d.numero - 1),
        matches: f.confrontos.map((c, i) => {
          const [pc, pf] = c.resultado.split(/\s*-\s*/).map(pontos);
          const jogos = (jogosPorPid.get(c.pid) || []).map((g) => ({
            ...g,
            home: { ...g.home, name: c.casa },
            away: { ...g.away, name: c.fora },
          }));
          const jogado = pc != null && pf != null && (pc > 0 || pf > 0);
          const fechado = jogado && (!jogos.length || jogos.every((g) => g.isFinal));
          return {
            teamMatchId: c.pid,
            matchNo: i + 1,
            startTime: null,
            result: jogado ? c.resultado : null,
            label: c.label,
            isSettled: fechado,
            isStarted: jogado || jogos.some((g) => g.result),
            home: { teamId: null, name: c.casa, iso: null, country: null, points: jogado ? pc : null, isLead: fechado && pc > pf },
            away: { teamId: null, name: c.fora, iso: null, country: null, points: jogado ? pf : null, isLead: fechado && pf > pc },
            winner: fechado ? (pc > pf ? "home" : pf > pc ? "away" : null) : null,
            games: jogos,
          };
        }),
      });
    }
  }
  const fim = lgsFimIso(lgs.meta);
  return {
    tournament: (lgs.meta && lgs.meta.name) || null,
    slug: `lgs-${id}`,
    year: (lgs.meta && lgs.meta.year) || null,
    format: "Cruces",
    parentCompetitionId: id,
    startDate: ini || undefined,
    endDate: fim || undefined,
    flights: [...flights.entries()].map(([name, rounds]) => ({
      competitionId: id,
      name,
      format: null,
      parentId: null,
      isCompleted: rounds.every((r) => r.matches.every((m) => m.isSettled)),
      source: `${BASE}/torneos/matchplay/${id}`,
      rounds,
    })),
    standings: classificacao.length ? classificacao : undefined,
    scrapedAt: new Date().toISOString(),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--ids");
  const forcar = i >= 0 ? new Set(args[i + 1].split(",").map(Number)) : null;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let indice = { checked: {} };
  if (fs.existsSync(INDEX)) indice = JSON.parse(fs.readFileSync(INDEX, "utf8"));   // ilegível = erro

  const hoje = new Date().toISOString().slice(0, 10);
  const alvos = [];
  for (const f of fs.readdirSync(LGS_DIR).filter((x) => /^\d+\.json$/.test(x))) {
    const id = +f.replace(".json", "");
    if (forcar && !forcar.has(id)) continue;
    const lgs = JSON.parse(fs.readFileSync(path.join(LGS_DIR, f), "utf8"));
    const fim = lgsFimIso(lgs.meta);
    const visto = indice.checked[id];
    if (!forcar) {
      if (fim && fim >= hoje && !visto) continue;                  // ainda não acabou e nunca visto: espera
      if (visto && fim && visto.at.slice(0, 10) > fim) continue;   // lido depois do fim → feito
      if (visto && !fim && !visto.has) continue;                   // sem data e sem match play
    }
    alvos.push({ id, lgs });
  }
  console.log(`Match play LGS: ${alvos.length} torneio(s) a verificar`);

  let gravados = 0, sem = 0, falhas = 0;
  for (const { id, lgs } of alvos) {
    try {
      const mp = await lerTorneio(id, lgs);
      indice.checked[id] = { has: !!mp, at: new Date().toISOString() };
      if (!mp) { sem++; continue; }
      const nConf = mp.flights.reduce((s, f) => s + f.rounds.reduce((a, r) => a + r.matches.length, 0), 0);
      const nJogos = mp.flights.reduce((s, f) => s + f.rounds.reduce((a, r) => a + r.matches.reduce((b, m) => b + m.games.length, 0), 0), 0);
      if (!nConf) throw new Error("página de match play sem confrontos legíveis — o HTML mudou?");
      writeJsonAtomic(path.join(OUT_DIR, `${id}.json`), mp);
      gravados++;
      console.log(`  ${id}: ${mp.tournament} — ${mp.flights.length} flight(s), ${nConf} confrontos, ${nJogos} jogos${mp.standings ? `, 1.º ${mp.standings[0].name}` : ""}`);
    } catch (e) {
      falhas++;
      console.log(`  ✗ ${id}: ${e.message}`);
    }
  }
  writeJsonAtomic(INDEX, indice);
  console.log(`\nDone: gravados=${gravados} sem-match-play=${sem} falhas=${falhas}`);
  if (falhas && !gravados && !sem) process.exitCode = 1;
  else if (!gravados) process.exitCode = 2;
}

if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });
module.exports = { lerDia, lerJogos, lerClassificacao, nomeJogador };
