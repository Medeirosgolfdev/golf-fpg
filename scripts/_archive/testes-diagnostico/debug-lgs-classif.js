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

  // ── 2. hoyoahoyo R1 — estrutura do par + cartões (confirmar 9 vs 18 buracos) ──
  const h1 = await httpGet(`${base}/torneos/hoyoahoyo/${id}/1`);
  console.log(`\n=== /torneos/hoyoahoyo/${id}/1 ===`);
  console.log(`status=${h1.status}  bodyLen=${h1.body.length}  contém '${needle}'? ${h1.body.toUpperCase().includes(needle)}`);

  // Linha do par (hoyoahoyopares): raw + stripped → diz-me quantas colunas tem (9 ou 18)
  const parTr = /<tr[^>]*class="[^"]*hoyoahoyopares[^"]*"[^>]*>([\s\S]+?)<\/tr>/i.exec(h1.body);
  if (parTr) {
    console.log(`\n--- linha do PAR (raw, 600 chars) ---\n${parTr[0].slice(0, 600)}`);
    console.log(`--- par (stripped) ---\n${stripTags(parTr[1])}`);
  } else console.log("  (sem linha hoyoahoyopares)");

  // Primeiras 2 linhas de jogador: raw + stripped
  const pRe = /<tr[^>]*(?:class="(?:altrow|altrow_alt)"|id="jugador-\d+")[^>]*>([\s\S]+?)<\/tr>/gi;
  const prows = []; let pm;
  while ((pm = pRe.exec(h1.body)) !== null && prows.length < 2) prows.push(pm);
  prows.forEach((pr, i) => {
    console.log(`\n--- jogador[${i}] (raw, 700 chars) ---\n${pr[0].slice(0, 700)}`);
    console.log(`--- jogador[${i}] (stripped) ---\n${stripTags(pr[1])}`);
  });

  // Correr o parser REAL e mostrar o resultado
  try {
    const { parseHoyoAHoyo } = require("./scrape-livegolfscoring.js");
    const parsed = parseHoyoAHoyo(h1.body);
    console.log(`\n--- parseHoyoAHoyo: par[${parsed.par?.length}]=${JSON.stringify(parsed.par)} ---`);
    console.log(`jogadores=${parsed.players.length}, dropped=${JSON.stringify(parsed.dropped.map(d => d.reason))}`);
    parsed.players.slice(0, 3).forEach(p =>
      console.log(`  pos=${p.pos} ${String(p.name).padEnd(26)} scores[${p.scores?.length ?? 0}] total=${p.total} toPar=${p.toPar}`));
  } catch (e) { console.log("  (parseHoyoAHoyo indisponível:", e.message + ")"); }

  // ── 3. JSON já gravado: o jogador-alvo está nas N rondas? Qual o top-5? ──
  const fs = require("fs");
  const jpath = require("path").resolve(__dirname, `../public/data/rfegolf-livegolfscoring/${id}.json`);
  if (!fs.existsSync(jpath)) { console.log(`\n(${jpath} ainda não existe — corre o scraper primeiro)`); return; }
  const d = JSON.parse(fs.readFileSync(jpath, "utf8"));
  const PAR = (d.rounds[0]?.par || []).reduce((a, b) => a + (b || 0), 0);
  console.log(`\n=== ${id}.json: ${d.meta?.name || "?"} — ${d.rounds.length} rondas, par/ronda=${PAR} ===`);
  console.log(`classification[] guardado: ${(d.classification || []).length} jogadores` +
    `, com totais validados: ${(d.classification || []).filter(c => c.roundTotals).length}`);

  // presença do alvo por ronda
  const pres = d.rounds.map(r => {
    const p = r.players.find(x => String(x.name || "").toUpperCase().includes(needle));
    return p ? `R${r.round}=${p.total ?? "?"}${p._fromClassif ? "(classif)" : ""}` : `R${r.round}=AUSENTE`;
  });
  console.log(`'${needle}' por ronda: ${pres.join("  ")}`);

  // top-5 acumulado (mesma lógica do adapter: jogadores com TODAS as rondas)
  const agg = {};
  for (const r of d.rounds) for (const p of r.players) {
    const k = p.memberId || p.name; if (!agg[k]) agg[k] = { name: p.name, rounds: [] };
    if (p.total != null && p.total > 0 && p.total < 999) agg[k].rounds.push(p.total);
  }
  const players = Object.values(agg);
  const nR = Math.max(...players.map(p => p.rounds.length));
  const top = players.filter(p => p.rounds.length === nR)
    .map(p => ({ name: p.name, g: p.rounds.reduce((a, b) => a + b, 0) }))
    .map(p => ({ ...p, tp: p.g - PAR * nR })).sort((a, b) => a.g - b.g).slice(0, 5);
  console.log(`\n--- Resumo top-5 (acumulado, ${nR} rondas) ---`);
  top.forEach((p, i) => console.log(`  ${i + 1}. ${p.name.padEnd(34)} ${p.g} (${p.tp >= 0 ? "+" : ""}${p.tp})`));
})().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
