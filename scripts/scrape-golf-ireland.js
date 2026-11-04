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
 * Provas de 2026 na plataforma nova «GolfHub» (golfhub.golfgenius.com/events/{uuid}):
 * a API pública dá o portal GolfGenius, que leva à página clássica /pages/{id}.
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

/** GolfHub (desde 2026): o evento `golfhub.golfgenius.com/events/{uuid}` tem na API
 *  pública (api.golfhub.golfgenius.com/api/v1/events/{uuid}) o `gg_portal_url`,
 *  que redirecciona para a página clássica `/pages/{id}` do campeonato. */
async function paginaDoGolfhub(uuid) {
  try {
    const r = await fetch(`https://api.golfhub.golfgenius.com/api/v1/events/${uuid}`, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const portal = (await r.json())?.data?.attributes?.gg_portal_url;
    if (!portal) return null;
    const p = await fetch(portal, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
    return (/\/pages\/(\d+)/.exec(p.url || "") || [])[1] || null;
  } catch { return null; }
}

/** Páginas GolfGenius dos campeonatos irlandeses juvenis (pela EGR), sem repetir;
 *  cada uma com os eventos EGR que apontam para ela (para o país dos jogadores). */
async function paginasDaEgr(desde) {
  const list = JSON.parse(fs.readFileSync(LIST, "utf8"));
  const m = new Map();
  const hub = new Map(); // uuid GolfHub → página (um pedido por evento)
  for (const e of list.events || []) {
    if (!/ireland/i.test(e.country || "") || !(e.year >= desde)) continue;
    let id = (/golfgenius\.com\/pages\/(\d+)/.exec(e.sourceUrl || "") || [])[1];
    const uuid = (/golfhub\.golfgenius\.com\/events\/([0-9a-f-]{36})/i.exec(e.sourceUrl || "") || [])[1];
    if (!id && uuid) {
      if (!hub.has(uuid)) { hub.set(uuid, await paginaDoGolfhub(uuid)); await dorme(PAUSA_MS); }
      id = hub.get(uuid);
    }
    if (!id) continue; // leagues/…, subdomínio sem página e outros: fora
    if (!m.has(id)) m.set(id, { id, ano: e.year, nome: e.name.replace(/\s*\d{4}$/, ""), egr: [] });
    m.get(id).egr.push(e.id);
  }
  if (hub.size) console.log(`   GolfHub: ${[...hub.values()].filter(Boolean).length} de ${hub.size} evento(s) com a página clássica`);
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
  // HCP de jogo pelas classes «Best Net»/«Nett» (o mesmo dos condados ingleses:
  // Gross − Net = handicap de jogo). Em várias voltas, a diferença dividida pelo
  // nº de voltas — só fica quando dá um inteiro plausível (nunca se inventa).
  const ehNet = (dv) => /\bnett?\b/i.test(dv.division || "");
  const grossPorNome = new Map();
  for (const dv of d.divisions || []) if (!ehNet(dv)) for (const p of dv.players || []) grossPorNome.set(rosterKey(p.name), p);
  let comHcp = 0;
  for (const dv of (d.divisions || []).filter(ehNet)) {
    for (const pn of dv.players || []) {
      const pg = grossPorNome.get(rosterKey(pn.name));
      const voltas = (pg?.roundGross || []).filter((x) => Number.isFinite(x)).length;
      if (!pg || pg.hcpJogo != null || !Number.isFinite(pg.total) || !Number.isFinite(pn.total) || !voltas) continue;
      if ((pn.roundGross || []).filter((x) => Number.isFinite(x)).length !== voltas) continue;
      const h = (pg.total - pn.total) / voltas;
      if (Math.abs(h - Math.round(h)) < 0.01 && h >= -10 && h <= 54) { pg.hcpJogo = Math.round(h); comHcp++; }
    }
  }
  if (comHcp) console.log(`   🎯 HCP de jogo (gross − net) em ${comHcp} jogador(es)`);
  // fora as classes vazias e as «Best Net»/«Nett» (a mesma volta em pancadas net)
  d.divisions = (d.divisions || []).filter((dv) => (dv.players || []).length && !ehNet(dv));
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
    : await paginasDaEgr(desde);
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
