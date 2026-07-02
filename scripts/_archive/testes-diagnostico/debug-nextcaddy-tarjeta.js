/**
 * scripts/debug-nextcaddy-tarjeta.js
 *
 * Diagnóstico: descobrir ONDE estão os scorecards hole-by-hole de um torneio
 * NextCaddy quando o fetch normal dá sc=0 (caso 71639 — os cartões abrem por um
 * link/PDF que o scraper não apanha). Despeja TODOS os links candidatos
 * (tarjeta / pdf / scorecard / resultado / roundId) do tour page + classificação,
 * e testa o endpoint /tarjeta-aux. Não grava nada nos dados.
 *
 * USO:
 *   node scripts/debug-nextcaddy-tarjeta.js --tour 71639
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const { parseScorecard } = require("./scrape-nextcaddy.js");

const BASE = "https://www.nextcaddy.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function req(method, urlStr, body) {
  const headers = {
    "User-Agent": UA, "Accept": "text/html,application/json,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9", "Referer": BASE + "/",
  };
  if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
    headers["Content-Length"] = Buffer.byteLength(body);
    headers["X-Requested-With"] = "XMLHttpRequest";
  }
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const r = https.request({ method, hostname: u.hostname, path: u.pathname + u.search, headers, timeout: 25000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return req(method, new URL(res.headers.location, urlStr).toString(), body).then(resolve, reject);
      }
      const c = []; res.on("data", (d) => c.push(d));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(c).toString("utf8"), headers: res.headers }));
    });
    r.on("error", reject); r.on("timeout", () => r.destroy(new Error("timeout")));
    if (body) r.write(body); r.end();
  });
}
const get = (u) => req("GET", u);
const post = (u, b) => req("POST", u, b);

function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
function dumpRows(html, label) {
  console.log(`  ── ${label}: linhas da tabela ──`);
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m, n = 0;
  while ((m = trRe.exec(html)) !== null) {
    const cells = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm;
    while ((cm = cellRe.exec(m[1])) !== null) cells.push(stripTags(cm[1]));
    if (cells.length < 2) continue;
    if (++n > 30) { console.log("    …(mais linhas)"); break; }
    console.log(`    [${cells.length}] ${JSON.stringify(cells).slice(0, 220)}`);
  }
  if (n === 0) console.log("    (sem tabela ≥2 cols — talvez seja PDF/iframe; ver o ficheiro gravado)");
}

/* Extrai todas as URLs/atributos interessantes de um HTML */
function harvestLinks(html, roundId) {
  const hits = new Set();
  // hrefs, data-*, src, action, onclick com palavras-chave
  const KW = /(tarjeta|scorecard|score-card|resultad|clasific|pdf|imprimir|print|descargar|download|cartel|golpe|hoyo)/i;
  const attrRe = /\b(href|src|data-[a-z-]+|action|onclick|data-href|data-url)\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = attrRe.exec(html)) !== null) {
    const val = m[2];
    if (KW.test(val) || (roundId && val.includes(String(roundId)))) hits.add(`${m[1]}="${val.slice(0, 200)}"`);
  }
  // URLs cruas a .pdf
  for (const mm of html.matchAll(/https?:\/\/[^"'\s)<>]+|\/[^"'\s)<>]*\.(?:pdf|aspx|php)/gi)) {
    if (KW.test(mm[0]) || /\.pdf$/i.test(mm[0])) hits.add(mm[0].slice(0, 200));
  }
  // funções JS tipo abrirTarjeta(...) / verTarjeta(...) / window.open('...')
  for (const mm of html.matchAll(/\b([a-zA-Z_]*(?:tarjeta|scorecard|pdf|resultad|imprimir)[a-zA-Z_]*)\s*\(([^)]{0,120})\)/gi)) {
    hits.add(`JS ${mm[1]}(${mm[2].trim().slice(0, 100)})`);
  }
  for (const mm of html.matchAll(/window\.open\(\s*['"]([^'"]+)['"]/gi)) hits.add(`window.open('${mm[1].slice(0, 180)}')`);
  return [...hits];
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--tour");
  const tour = i >= 0 ? args[i + 1] : null;
  if (!tour) { console.log("Uso: node scripts/debug-nextcaddy-tarjeta.js --tour 71639"); return; }

  // roundId (para procurar links que o usem)
  let roundId = null;
  try {
    const rr = await get(`${BASE}/stats/rounds/${tour}`);
    const rounds = JSON.parse(rr.body);
    roundId = rounds && rounds[0] && rounds[0].roundId;
    console.log(`rounds: ${JSON.stringify(rounds)}`);
  } catch { /* ignore */ }

  const pageR = await get(`${BASE}/tour/${tour}`);
  const clasR = await post(`${BASE}/getListadoClasificaciones`, `id=${tour}`);
  console.log(`\ntour page: status=${pageR.status} len=${pageR.body.length}`);
  console.log(`clasificaciones: status=${clasR.status} len=${clasR.body.length}`);

  const dir = os.tmpdir();
  fs.writeFileSync(path.join(dir, `nc-page-${tour}.html`), pageR.body);
  fs.writeFileSync(path.join(dir, `nc-clas-${tour}.html`), clasR.body);
  console.log(`\nHTML cru gravado em:\n  ${path.join(dir, `nc-page-${tour}.html`)}\n  ${path.join(dir, `nc-clas-${tour}.html`)}`);

  console.log(`\n══ Links candidatos no TOUR PAGE ══`);
  for (const h of harvestLinks(pageR.body, roundId)) console.log("  " + h);
  console.log(`\n══ Links candidatos na CLASSIFICAÇÃO ══`);
  for (const h of harvestLinks(clasR.body, roundId)) console.log("  " + h);

  // Links tarjeta-aux (com 2º parâmetro REAL)
  const tarj = [...clasR.body.matchAll(/\/tarjeta-aux\/(\d+)\/(-?\d+)/g)];
  console.log(`\n══ /tarjeta-aux na classificação: ${tarj.length} (amostra) ══`);
  for (const t of tarj.slice(0, 5)) console.log("  " + t[0]);

  // Testar o tarjeta-aux do primeiro jogador
  if (tarj.length) {
    const ins = tarj[0][1];
    for (const suffix of [tarj[0][2], "-1", "0", roundId].filter((v, k, a) => v != null && a.indexOf(v) === k)) {
      const url = `${BASE}/tarjeta-aux/${ins}/${suffix}`;
      let r; try { r = await get(url); } catch (e) { console.log(`\nGET ${url} → ERRO ${e.message}`); continue; }
      console.log(`\nGET ${url} → status=${r.status} len=${r.body.length} ct=${r.headers["content-type"]}`);
      if (r.status === 200 && r.body.length > 100) {
        const f = path.join(dir, `nc-tarjeta-${ins}-${suffix}.html`);
        fs.writeFileSync(f, r.body);
        dumpRows(r.body, `tarjeta ${ins}/${suffix}`);
        try {
          const sc = parseScorecard(r.body);
          console.log(`  parseScorecard: par=${JSON.stringify(sc.par)} rounds=${(sc.rounds||[]).length} nineHole=${sc.nineHole}`);
        } catch (e) { console.log("  parseScorecard ERRO:", e.message); }
        // Links DENTRO da tarjeta (pode haver o link real para o scorecard/PDF)
        const inner = harvestLinks(r.body, roundId);
        if (inner.length) { console.log("  links dentro da tarjeta:"); for (const h of inner) console.log("    " + h); }
        console.log(`  (HTML: ${f})`);
      }
    }
  }
  console.log(`\n➡ Cola aqui o output. Se viste o link do PDF/scorecard no site, cola também o URL exacto (F12 → Network ao clicar).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
