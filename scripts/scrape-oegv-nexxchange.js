#!/usr/bin/env node
/**
 * scripts/scrape-oegv-nexxchange.js
 *
 * Provas JUVENIS da federação austríaca (ÖGV) → kids2 (04/11/2026, «continua a
 * pesquisa»). O golf.at mostra cada torneio numa página pública com os dados da
 * prova (data, campo, nº de voltas, par e SI por buraco) e embute a classificação
 * do nexxchange (`tournament.nexxchange.com/de/at/{ano}/{clube}/{torneio}/live-score`),
 * também pública: por classe (separadores «Burschen U14», «Mädchen U16»…) a
 * posição, a bandeira, o jogador com o HANDICAP entre parênteses («Uraki Leo
 * (-2,4)», plus em negativo — a nossa convenção), o clube, cada volta e o total.
 * A vista buraco a buraco (`…/live-score-hole-by-hole`) só traz a ÚLTIMA volta;
 * as anteriores ficam só com o total. Os cartões completos não são públicos.
 *
 * A lista vem da EGR (eventos com país Austria e link golf.at) — o ÖGV não tem um
 * índice público de provas juvenis.
 *
 * Saída: public/data/oegv/{torneioId}.json — JobFile; adapter sources/oegv.js.
 * Só kids2 (não vai à /major).
 *
 * Uso:
 *   node scripts/scrape-oegv-nexxchange.js                 # 2025 em diante
 *   node scripts/scrape-oegv-nexxchange.js --desde 2024
 *
 * Pedidos um a um, com pausa. Exit: 0 gravou · 2 nada de novo · 1 erro.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { writeJsonGuarded } = require("./lib/shrink-guard");

const DATA_DIR = path.join(__dirname, "..", "public", "data");
const OUT_DIR = path.join(DATA_DIR, "oegv");
const LIST = path.join(DATA_DIR, "egr", "egr-events-list.json");
const NX = "https://tournament.nexxchange.com";
const PAUSA_MS = 2500;
const UA = { "User-Agent": "Mozilla/5.0" };

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const txt = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
async function get(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.text();
}

/** Páginas golf.at dos eventos austríacos da EGR (um por torneio). */
function torneiosDaEgr(desde) {
  const list = JSON.parse(fs.readFileSync(LIST, "utf8"));
  const m = new Map();
  for (const e of list.events || []) {
    if (e.country !== "Austria" || !(e.year >= desde)) continue;
    const u = String(e.sourceUrl || "");
    const id = (/golf\.at\/.*\/(\d{6,})\/?$/.exec(u) || [])[1];
    if (id && !m.has(id)) m.set(id, { id, url: u, ano: e.year });
  }
  return [...m.values()];
}

/** Linhas de uma <table> como arrays de HTML das células. */
function linhas(tabela) {
  return [...tabela.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)].map((r) => ({
    attrs: r[1],
    cells: [...r[2].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => c[1]),
  }));
}

/** Dados da prova na página do golf.at: ids do nexxchange, data, campo, par/SI. */
function dadosGolfAt(html) {
  const at = (k) => (new RegExp(`${k}="([^"]+)"`).exec(html) || [])[1] || null;
  const info = {};
  const tabelas = [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((t) => t[0]);
  for (const l of linhas(tabelas[0] || "")) if (l.cells.length >= 2) info[txt(l.cells[0]).replace(/:$/, "")] = txt(l.cells[1]);
  let par = null, si = null;
  for (const t of tabelas) {
    const ls = linhas(t).map((l) => l.cells.map(txt));
    const p = ls.find((c) => c[0] === "Par"), h = ls.find((c) => c[0] === "Hcp");
    if (p && p.length >= 19) { par = p.slice(1, 19).map(Number); if (h && h.length >= 19) si = h.slice(1, 19).map(Number); break; }
  }
  const [d, mo, y] = String(info.Datum || "").split(".");
  return {
    clube: at("nt-club-nr"), ano: at("nt-year"), torneio: at("nt-tournament-id"),
    data: y && mo && d ? `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}` : null,
    campo: info.Platz || null,
    // o nome do torneio é o 1.º <h2> (o <h1> da página é o «Menü»)
    nome: txt((/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(html) || [])[1] || ""),
    par, si,
  };
}

/** «<b>Uraki</b> Leo (-2,4)» → { name: "Leo Uraki", hcp: -2.4 } */
function jogador(cell) {
  const apelido = txt((/<b>([\s\S]*?)<\/b>/.exec(cell) || [])[1] || "");
  const tudo = txt(cell);
  const hcpM = /\((-?\+?\d+(?:,\d+)?)\)\s*$/.exec(tudo);
  const resto = tudo.replace(/\([^)]*\)\s*$/, "").replace(apelido, "").trim();
  const hcp = hcpM ? Number(hcpM[1].replace("+", "").replace(",", ".")) : null;
  return { name: `${resto} ${apelido}`.replace(/\s+/g, " ").trim(), hcp: Number.isFinite(hcp) ? hcp : null };
}

/** Classes (separadores) e as suas tabelas: [{ label, tabela }]. */
function classes(html) {
  const tabs = [...html.matchAll(/<a class="nav-link[^"]*"[^>]*href="#(nav-prizeclass-[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ id: m[1], label: txt(m[2]) }));
  return tabs.map((t) => {
    const i = html.indexOf(`id="${t.id}"`);
    const j = html.indexOf("</table>", i);
    return { label: t.label, tabela: i > 0 && j > i ? html.slice(i, j + 8) : "" };
  });
}

/** Classificação (live-score) + última volta buraco a buraco → divisões JobFile. */
function divisoes(liveHtml, hbhHtml, prova) {
  const hbh = new Map(); // data-scorecard → [18 pancadas] da última volta
  for (const c of classes(hbhHtml)) for (const l of linhas(c.tabela)) {
    const key = (/data-scorecard="([^"]+)"/.exec(l.attrs) || [])[1];
    const last = l.cells[l.cells.length - 1] || "";
    const holes = [...last.matchAll(/<div class="score[^"]*"><small>(\d+)<\/small><\/div>/g)].map((m) => +m[1]);
    if (key && holes.length === 18) hbh.set(key, holes);
  }
  const out = [];
  for (const c of classes(liveHtml)) {
    const ls = linhas(c.tabela);
    const head = (ls.find((l) => l.cells.some((x) => /Spieler/.test(txt(x)))) || { cells: [] }).cells.map(txt);
    const col = (re) => head.findIndex((h) => re.test(h));
    const iPos = col(/^Pos$/), iNat = col(/^Nation$/), iJog = col(/^Spieler$/), iClube = col(/^Heimatclub$/), iTot = col(/^Gesamt$/), iPar = col(/^Par$/);
    const iVoltas = head.map((h, i) => (/^R\d+$/.test(h) ? i : -1)).filter((i) => i >= 0);
    const players = [];
    for (const l of ls) {
      const key = (/data-scorecard="([^"]+)"/.exec(l.attrs) || [])[1];
      if (!key || iJog < 0) continue;
      const { name, hcp } = jogador(l.cells[iJog]);
      if (!name) continue;
      const cc = (/flagcdn\.com\/([a-z-]+)\.svg/i.exec(l.cells[iNat] || "") || [])[1];
      const gross = iVoltas.map((i) => Number(txt(l.cells[i]))).filter((x) => Number.isFinite(x) && x > 0);
      const total = Number(txt(l.cells[iTot]));
      const toParTxt = txt(l.cells[iPar]);
      const holes = hbh.get(key);
      const rounds = gross.map((g, i) => ({ day: i + 1, gross: g, scores: i === gross.length - 1 && holes && holes.reduce((a, b) => a + b, 0) === g ? holes : [] }));
      players.push({
        pos: txt(l.cells[iPos]) || "", name, country: cc ? cc.toUpperCase() : null,
        club: iClube >= 0 ? txt(l.cells[iClube]) || null : null, hcp,
        total: Number.isFinite(total) && total > 0 ? total : null,
        toPar: /^[+-]?\d+$/.test(toParTxt) ? Number(toParTxt) : toParTxt === "E" ? 0 : null,
        roundGross: gross, rounds,
      });
    }
    if (players.length) out.push({ division: c.label, par: prova.par, si: prova.si, parTotal: prova.par ? prova.par.reduce((a, b) => a + b, 0) : null, players });
  }
  return out;
}

const comVoltas = (d) => (d.divisions || []).reduce((n, dv) => n + dv.players.filter((p) => p.roundGross.length).length, 0);

(async () => {
  const desde = Number(arg("--desde") || 2025);
  const torneios = torneiosDaEgr(desde);
  console.log(`ÖGV: ${torneios.length} torneio(s) juvenis austríacos (pela EGR, desde ${desde})`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let gravados = 0, iguais = 0, vazios = 0, erros = 0;
  for (const t of torneios) {
    try {
      const prova = dadosGolfAt(await get(t.url));
      await dorme(PAUSA_MS);
      if (!prova.clube || !prova.torneio) { vazios++; console.log(`   ⏭️  ${t.id}: sem nexxchange`); continue; }
      const base = `${NX}/de/at/${prova.ano}/${prova.clube}/${prova.torneio}`;
      const live = await get(`${base}/live-score?iframe=true`);
      await dorme(PAUSA_MS);
      const hbh = await get(`${base}/live-score-hole-by-hole?iframe=true`).catch(() => "");
      await dorme(PAUSA_MS);
      const divisions = divisoes(live, hbh, prova);
      if (!divisions.length) { vazios++; console.log(`   ⏭️  ${prova.nome || t.id}: sem resultados`); continue; }
      const data = {
        tournament: prova.nome, year: Number(prova.ano) || t.ano, startDate: prova.data, course: prova.campo,
        source: `${base}/live-score`, competitionId: prova.torneio, customer: "ÖGV (golf.at / nexxchange)", divisions,
      };
      const file = path.join(OUT_DIR, `${prova.torneio}.json`);
      let anterior = null;
      try { anterior = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* novo */ }
      if (anterior && JSON.stringify(anterior) === JSON.stringify(data)) { iguais++; console.log(`   ⏭️  ${prova.nome}: sem alterações`); continue; }
      if (writeJsonGuarded(file, data, { count: comVoltas }).written) {
        gravados++;
        console.log(`   ✅ ${prova.nome} (${prova.data}) — ${divisions.map((d) => `${d.division}:${d.players.length}`).join(" · ")}`);
      } else erros++;
    } catch (e) {
      erros++;
      console.error(`   ❌ ${t.id}: ${e.message}`);
    }
  }
  console.log(`\n🏁 ${gravados} gravado(s) · ${iguais} sem alterações · ${vazios} sem resultados · ${erros} erro(s)`);
  process.exitCode = erros && !gravados ? 1 : gravados ? 0 : 2;
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
