/**
 * scripts/debug-lgs-classif.js  —  diagnóstico pontual (NÃO escreve nada).
 *
 * Mostra a estrutura REAL das páginas livegolfscoring de um torneio para podermos
 * afinar o parser da classificação. Corre no PC (onde o site é alcançável):
 *
 *   node scripts/debug-lgs-classif.js 366
 *   node scripts/debug-lgs-classif.js 366 SENUSSI      # 2º arg = nome a procurar
 */
const https = require("https");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
function httpGet(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request({
      method: "GET", hostname: url.hostname, path: url.pathname + url.search,
      headers: { "User-Agent": UA, "Accept": "text/html,*/*", "Accept-Language": "es-ES,es;q=0.9" },
      timeout: 20000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); httpGet(new URL(res.headers.location, urlStr).toString()).then(resolve, reject); return;
      }
      const chunks = []; res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end();
  });
}
function stripTags(s) {
  return String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

(async () => {
  const id = process.argv[2] || "366";
  const needle = (process.argv[3] || "SENUSSI").toUpperCase();
  const base = "https://rfegolf.livegolfscoring.es";

  // ── 1. Página de classificação geral ──
  const clf = await httpGet(`${base}/torneos/clasificacion/${id}`);
  console.log(`\n=== /torneos/clasificacion/${id} ===`);
  console.log(`status=${clf.status}  bodyLen=${clf.body.length}`);
  console.log(`ocorrências 'id="jugador-': ${(clf.body.match(/id="jugador-\d+"/g) || []).length}`);
  console.log(`ocorrências 'altrow': ${(clf.body.match(/altrow/g) || []).length}`);
  console.log(`contém '${needle}'? ${clf.body.toUpperCase().includes(needle)}`);

  const trRe = /<tr[^>]*(?:class="(?:altrow|altrow_alt)"|id="jugador-\d+")[^>]*>([\s\S]+?)<\/tr>/gi;
  const matches = [];
  let m; while ((m = trRe.exec(clf.body)) !== null) matches.push(m);
  console.log(`linhas <tr> de jogador apanhadas pela regex: ${matches.length}`);

  console.log(`\n--- texto (stripped) das 4 primeiras linhas ---`);
  matches.slice(0, 4).forEach((mm, i) => console.log(`  [${i}] ${stripTags(mm[1]).slice(0, 200)}`));

  // Linha do jogador-alvo (raw + stripped) — o que mais preciso de ver
  const ni = clf.body.toUpperCase().indexOf(needle);
  if (ni >= 0) {
    const around = clf.body.slice(Math.max(0, ni - 900), ni + 300);
    const trStart = around.lastIndexOf("<tr");
    const rawRow = around.slice(trStart >= 0 ? trStart : 0);
    console.log(`\n--- RAW HTML à volta de '${needle}' (classificação) ---`);
    console.log(rawRow.slice(0, 1100));
    console.log(`\n--- stripped dessa zona ---`);
    console.log(stripTags(rawRow).slice(0, 260));
  } else {
    console.log(`\n'${needle}' NÃO aparece no HTML da classificação — página pode ser renderizada por JS.`);
    console.log(`Primeiros 600 chars do body:\n${clf.body.slice(0, 600)}`);
  }

  // ── 2. hoyoahoyo R1 — o jogador-alvo está mesmo ausente? ──
  const h1 = await httpGet(`${base}/torneos/hoyoahoyo/${id}/1`);
  console.log(`\n=== /torneos/hoyoahoyo/${id}/1 ===`);
  console.log(`status=${h1.status}  bodyLen=${h1.body.length}  contém '${needle}'? ${h1.body.toUpperCase().includes(needle)}`);
})().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
