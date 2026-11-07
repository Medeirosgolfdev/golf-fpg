#!/usr/bin/env node
/**
 * scripts/scrape-fpg-livescoring-browser.js
 * Live scoring da FPG lido NUM BROWSER (Playwright), com os cartões buraco a buraco.
 *
 * Porquê um browser: os PageMethods do /live-scoring/ só respondem à chamada
 * disparada pela navegação que renderiza a página (ver o cabeçalho de
 * scrape-fpg-livescoring.js). Aqui navega-se mesmo a página, lê-se a tabela do
 * DOM e abre-se o cartão de cada jogador que já tem buracos, UM DE CADA VEZ e
 * com pausa (clicar no nome é o que o site faz).
 *
 * Uso:
 *   node scripts/scrape-fpg-livescoring-browser.js --tcodes 000:10947
 *   node scripts/scrape-fpg-livescoring-browser.js --tcodes 000:10947 --sem-cartoes
 *
 * Output: public/data/fpg-livescoring.json — mesma chave e formato do
 * scrape-fpg-livescoring.js (`{ccode}-{tcode}-{round}`); o snapshot anterior
 * fica resumido em `history`. Cada jogador com cartão leva par/si/metros/gross
 * (18 posições, null nos buracos por jogar).
 *
 * Exit: 0 gravou · 2 prova não está live / sem dados · 1 erro.
 */
const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");

const OUT = path.join(process.cwd(), "public", "data", "fpg-livescoring.json");
const argv = process.argv.slice(2);
const val = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const TCODES = val("--tcodes", null);
const ROUND = val("--round", "0");
const SEM_CARTOES = argv.includes("--sem-cartoes");
const PAUSA_MS = 900;

async function lerProva(page, ccode, tcode) {
  const url = `https://scoring.fpg.pt/live-scoring/1.aspx?pa=classif&c=${ccode}&t=${tcode}&r=${ROUND}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  try { await page.waitForSelector("tr.jtable-data-row", { timeout: 30000 }); }
  catch { console.warn(`[live] ${ccode}/${tcode}: sem tabela (prova não está live?)`); return null; }

  const nome = (await page.locator("h1, h2, h3, h4").first().innerText().catch(() => "")).trim();
  const ler = () => page.$$eval("tr.jtable-data-row", trs => trs.map(tr => {
    const td = [...tr.children].map(x => x.innerText.trim());
    return {
      pos: td[0] === "-" ? null : Number(td[0]), nome: td[1], clube: td[2],
      buracos: /^\d+$/.test(td[3]) ? Number(td[3]) : 0,
      teeTime: /:/.test(td[3]) ? td[3] : null,
      resultado: td[4] === "-" ? null : td[4],
    };
  }));
  const jogadores = await ler();

  if (!SEM_CARTOES) {
    for (const j of jogadores) {
      if (!j.buracos) continue;
      const linha = page.locator("tr.jtable-data-row", { has: page.locator("h6.child-opener-image", { hasText: j.nome }) }).first();
      await linha.locator("h6.child-opener-image").click();
      const filho = linha.locator("xpath=following-sibling::tr[1][contains(@class,'jtable-child-row')]");
      try {
        await filho.filter({ hasText: "Gross" }).waitFor({ timeout: 8000 });
        const txt = await filho.innerText();
        const sc = {};
        for (const l of txt.split("\n").filter(l => /^(PAR|Stroke|Metros|Gross)\t/.test(l))) {
          const c = l.split("\t"); const v = c.slice(1);
          sc[c[0]] = [...v.slice(0, 9), ...v.slice(10, 19)].map(x => (x === "" ? null : Number(x)));
        }
        Object.assign(j, { par: sc.PAR, si: sc.Stroke, metros: sc.Metros, gross: sc.Gross });
        // confere com o resultado do live
        const jog = (sc.Gross || []).map((g, i) => [g, sc.PAR[i]]).filter(([g]) => g != null);
        const tp = jog.reduce((s, [g, p]) => s + g - p, 0);
        const tpStr = tp === 0 ? "PAR" : tp > 0 ? `+${tp}` : String(tp);
        if (tpStr !== j.resultado || jog.length !== j.buracos) j._cartaoDiverge = { cartao: tpStr, buracos: jog.length };
        await linha.locator("h6.child-opener-image").click();
      } catch { j._semCartao = true; }
      await page.waitForTimeout(PAUSA_MS);
    }
  }

  return {
    ccode, tcode, round: ROUND, nome, campo: nome.split("–").slice(1).join("–").trim() || null,
    classi: "1", classiLabel: "Gross", capturedAt: new Date().toISOString(), _via: "playwright",
    totalJogadores: jogadores.length,
    emJogo: jogadores.filter(j => j.buracos > 0).length,
    porSair: jogadores.filter(j => !j.buracos).length,
    jogadores,
  };
}

(async () => {
  if (!TCODES) { console.error("Indica --tcodes ccode:tcode[,…]"); process.exit(1); }
  const alvos = TCODES.split(",").map(s => s.trim().split(":")).filter(a => a.length === 2);
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const snaps = [];
  try {
    const page = await (await browser.newContext({ locale: "pt-PT" })).newPage();
    for (const [ccode, tcode] of alvos) {
      const s = await lerProva(page, ccode, tcode);
      if (s && s.jogadores.length) snaps.push(s);
    }
  } finally { await browser.close(); }

  if (!snaps.length) { console.log("[live] nada live"); process.exit(2); }
  let base;
  try { base = JSON.parse(fs.readFileSync(OUT, "utf8")); }
  catch (e) { if (fs.existsSync(OUT)) { console.error(`[live] ${OUT} ilegível: ${e.message}`); process.exit(1); } base = { tournaments: {} }; }
  for (const s of snaps) {
    const key = `${s.ccode}-${s.tcode}-${s.round}`;
    const prev = base.tournaments[key];
    const history = prev ? [...(prev.history || []), {
      capturedAt: prev.capturedAt, emJogo: prev.emJogo, lider: prev.jogadores?.[0]?.nome ?? null,
      liderResultado: prev.jogadores?.[0]?.resultado ?? null,
    }].slice(-200) : [];
    base.tournaments[key] = { ...s, history };
    const div = s.jogadores.filter(j => j._cartaoDiverge || j._semCartao).length;
    console.log(`[live] ${key} ${s.nome}: ${s.emJogo} em jogo, ${s.porSair} por sair; líder ${s.jogadores[0]?.nome} ${s.jogadores[0]?.resultado}${div ? ` · ${div} cartão(ões) por confirmar` : ""}`);
  }
  base.gerado_em = new Date().toISOString();
  writeJsonAtomic(OUT, base);
  process.exit(0);
})().catch(e => { console.error("[live] erro:", e.message); process.exit(1); });
