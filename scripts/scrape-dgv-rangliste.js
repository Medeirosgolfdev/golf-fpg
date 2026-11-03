/**
 * scripts/scrape-dgv-rangliste.js — DGV-Jugendrangliste (ranking juvenil da
 * federação alemã), publicada no site do EGR. 03/11/2026.
 *
 *   https://www.europeangolfrankings.com/tours/German_jungen_u18/ranking/dgv
 *     ?age_group=U18+and+younger&country=Germany&page=N   (AK18; 50 por página)
 *   https://www.europeangolfrankings.com/tours/German_jungen_ak14/ranking/dgv
 *     ?age_group=U14&country=Germany&page=N               (AK14)
 *   → Rang, Punkte, Name («APELIDO, Nome »»), Club, Jahrgang, Avg. To CR, Turniere.
 *
 * O Jahrgang (ano de nascimento) é publicado pela DGV — é um ano CERTO, não uma
 * estimativa. O agregador (util/dgv-rangliste.js) dá-o, com o clube, às fichas
 * alemãs sem data. Só rapazes (a lista das raparigas é outra; ela não as quer).
 * Um pedido de cada vez, com pausa; pára na primeira página vazia ou repetida.
 *
 * Saída: public/data/dgv-rangliste.json
 *   { generatedAt, source, total, jogadores: [{ nome, clube, ano, ak, rang, pontos, avgToCr, provas, sexo }] }
 * Gravação com guarda anti-encolhimento.
 *
 * Uso: node scripts/scrape-dgv-rangliste.js [--max-paginas 40] [--delay 3000]
 * Exit: 0 gravou · 1 erro.
 */
"use strict";
const path = require("path");
const { writeJsonGuarded } = require("./lib/shrink-guard");

// Duas listas de rapazes: AK18 (nascidos ~2008–2011) e AK14 (~2012–2014).
const LISTAS = [
  { ak: "AK18", url: "https://www.europeangolfrankings.com/tours/German_jungen_u18/ranking/dgv?age_group=U18+and+younger&country=Germany" },
  { ak: "AK14", url: "https://www.europeangolfrankings.com/tours/German_jungen_ak14/ranking/dgv?age_group=U14&country=Germany" },
];
const OUT = path.resolve(__dirname, "../public/data/dgv-rangliste.json");
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const MAX = parseInt(arg("max-paginas", "40"), 10);
const DELAY = Math.max(1500, parseInt(arg("delay", "3000"), 10));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const txt = (s) => s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/»/g, "").replace(/\s+/g, " ").trim();
const num = (s) => { const v = parseFloat(String(s).replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : null; };

(async () => {
  const jogadores = [];
  const vistos = new Set();
  for (const { ak, url } of LISTAS) for (let p = 1; p <= MAX; p++) {
    const r = await fetch(`${url}&page=${p}`, { headers: { "User-Agent": "Mozilla/5.0 (golf-fpg; junior tracker)" } });
    if (!r.ok) throw new Error(`página ${p}: HTTP ${r.status}`);
    const h = await r.text();
    let novos = 0;
    for (const m of h.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const c = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => txt(x[1]));
      if (c.length < 7 || !/^\d+$/.test(c[0])) continue;
      const ano = /^(19|20)\d\d$/.test(c[4]) ? +c[4] : null;
      const k = `${c[2]}|${c[3]}|${ano}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      novos++;
      jogadores.push({ nome: c[2], clube: c[3] || null, ano, ak, rang: +c[0], pontos: num(c[1]), avgToCr: num(c[5]), provas: +c[6] || null, sexo: "M" });
    }
    console.log(`  ${ak} página ${p}: ${novos} jogadores`);
    if (!novos) break;
    await sleep(DELAY);
  }
  if (!jogadores.length) throw new Error("nenhum jogador lido (a página mudou?)");
  const w = writeJsonGuarded(OUT, { generatedAt: new Date().toISOString(), source: "scripts/scrape-dgv-rangliste.js (EGR · DGV-Jugendrangliste Jungen)", total: jogadores.length, jogadores },
    { count: (d) => d.jogadores.length, spaces: 0, label: "dgv-rangliste.json" });
  console.log(`DGV-Jugendrangliste: ${jogadores.length} rapazes${w.written ? "" : " (NÃO gravado)"} → ${OUT}`);
  if (!w.written) process.exitCode = 1;
})().catch((e) => { console.error("ERRO:", e.message); process.exitCode = 1; });
