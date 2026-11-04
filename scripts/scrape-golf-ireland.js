#!/usr/bin/env node
/**
 * scripts/scrape-golf-ireland.js
 *
 * Campeonatos JUVENIS da Golf Ireland → kids2 (04/11/2026, «avança com tudo»).
 * A Golf Ireland publica os resultados no GolfGenius (uma página `/pages/{id}`
 * por campeonato, às vezes num subdomínio `gi-….golfgenius.com`). Não há um
 * directório público com todos; a lista sai da EGR, que guarda o link de origem
 * de cada evento irlandês (egr/egr-events-list.json: país Ireland, link GolfGenius).
 * Cada página lê-se com o `runOne` do scrape-golfgenius-node.js (Node puro —
 * o GolfGenius dá 403 a browsers automatizados).
 *
 * Fora, por agora: as provas de 2026 na plataforma nova «GolfHub»
 * (golfhub.golfgenius.com/events/{uuid}) — outro formato, por estudar.
 *
 * Saída: public/data/irlanda/irl-{pageId}_{ano}.json — JobFile; adapter
 * sources/irlanda.js. Só kids2 (não vai à /major).
 *
 * Uso:
 *   node scripts/scrape-golf-ireland.js                  # 2024 em diante
 *   node scripts/scrape-golf-ireland.js --desde 2025
 *   node scripts/scrape-golf-ireland.js --pages 10676473230400714827
 *
 * Exit: 0 gravou · 2 nada de novo · 1 erro.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { runOne } = require("./scrape-golfgenius-node");

const DATA_DIR = path.join(__dirname, "..", "public", "data");
const OUT_DIR = path.join(DATA_DIR, "irlanda");
const LIST = path.join(DATA_DIR, "egr", "egr-events-list.json");
const PAUSA_MS = 3000;

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

/** Páginas GolfGenius dos campeonatos irlandeses juvenis (pela EGR), sem repetir;
 *  cada uma com os eventos EGR que apontam para ela (para o país dos jogadores). */
function paginasDaEgr(desde) {
  const list = JSON.parse(fs.readFileSync(LIST, "utf8"));
  const m = new Map();
  for (const e of list.events || []) {
    if (!/ireland/i.test(e.country || "") || !(e.year >= desde)) continue;
    const id = (/golfgenius\.com\/pages\/(\d+)/.exec(e.sourceUrl || "") || [])[1];
    if (!id) continue; // GolfHub (2026), leagues/… e outros: fora por agora
    if (!m.has(id)) m.set(id, { id, ano: e.year, nome: e.name.replace(/\s*\d{4}$/, ""), egr: [] });
    m.get(id).egr.push(e.id);
  }
  return [...m.values()].sort((a, b) => a.ano - b.ano || a.id.localeCompare(b.id));
}

/** O GolfGenius da Golf Ireland não mostra o país (só o clube) e o leitor cai em
 *  «US» por omissão. O país certo vem da EGR (o mesmo campeonato, por nome);
 *  sem ele fica sem país — nunca «US» inventado. Tira as classes vazias. */
function corrigir(d, egrIds) {
  const { rosterKey } = require("./aggregator/util/egr-dedup");
  const { countryToIso2 } = require("./aggregator/util/names");
  const pais = new Map();
  for (const id of egrIds || []) {
    let ev = null;
    try { ev = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "egr", "events", `egr_${id}.json`), "utf8")); } catch { /* sem leaderboard */ }
    for (const p of (ev && ev.players) || []) { const iso = countryToIso2(p.country); if (iso) pais.set(rosterKey(p.name), iso); }
  }
  let corrigidos = 0;
  // fora as classes vazias e as «Best Net»/«Nett» (a mesma volta em pancadas net)
  d.divisions = (d.divisions || []).filter((dv) => (dv.players || []).length && !/\bnett?\b/i.test(dv.division || ""));
  // a classe nem sempre diz o sexo («Under 16 Championship»): vem do nome do campeonato
  const sexoProva = /\bboy'?s|\bmen'?s/i.test(d.tournament || "") && !/girl|ladies|women/i.test(d.tournament || "") ? "Boys"
    : /girl'?s|ladies/i.test(d.tournament || "") && !/\bboy/i.test(d.tournament || "") ? "Girls" : null;
  for (const dv of d.divisions) if (sexoProva && !/boy|girl|men|ladies|women/i.test(dv.division || "")) dv.division = `${sexoProva} ${dv.division}`;
  for (const dv of d.divisions) {
    for (const p of dv.players) {
      if (p.country !== "US") continue;
      const iso = pais.get(rosterKey(p.name)) || null;
      if (iso !== "US") { p.country = iso; corrigidos++; }
    }
  }
  console.log(`   🌍 país pela EGR em ${corrigidos} jogador(es) (o resto sem país, nunca «US»)`);
}

(async () => {
  const desde = Number(arg("--desde") || 2024);
  const pages = arg("--pages")
    ? arg("--pages").split(",").map((id) => ({ id: id.trim(), ano: null, nome: "" }))
    : paginasDaEgr(desde);
  console.log(`Golf Ireland: ${pages.length} página(s) GolfGenius`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let gravados = 0, iguais = 0, erros = 0;
  for (const p of pages) {
    try {
      const r = await runOne({
        pageUrl: `https://www.golfgenius.com/pages/${p.id}`,
        slugOverride: `irl-${p.id}`,
        yearOverride: p.ano,
        outDir: OUT_DIR,
        // antes da comparação com o disco e da gravação (ver runOne)
        transform: (out) => corrigir(out, p.egr),
      });
      if (r && r.changed) gravados++; else iguais++;
      // página sem resultados no GolfGenius (ex.: Connacht U18 2025): não fica ficheiro vazio
      try { const d = JSON.parse(fs.readFileSync(r.file, "utf8")); if (!(d.divisions || []).length) { fs.unlinkSync(r.file); console.log("   ⏭️  sem classes com jogadores — ficheiro retirado"); } } catch { /* sem ficheiro */ }
    } catch (e) {
      erros++;
      console.error(`   ❌ ${p.id} ${p.nome}: ${e.message}`);
    }
    await dorme(PAUSA_MS);
  }
  console.log(`\n🏁 ${gravados} gravada(s) · ${iguais} sem alterações · ${erros} erro(s)`);
  process.exitCode = erros && !gravados ? 1 : gravados ? 0 : 2;
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
