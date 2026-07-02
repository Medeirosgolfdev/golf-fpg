/**
 * scripts/debug-lgs-horarios.js — diagnóstico dos HORÁRIOS (draws/tee times) LGS.
 * NÃO escreve nada. Corre no PC (o site está bloqueado no ambiente remoto):
 *
 *   node scripts/debug-lgs-horarios.js 380
 *   node scripts/debug-lgs-horarios.js 380 1629      # 2º arg = sub-id do horário
 *   node scripts/debug-lgs-horarios.js 380 1629 mitarjeta   # 3º arg = domínio
 *
 * Mostra: como descobrir o sub-id por ronda (ex: 1629) e a estrutura da tabela de
 * horários (grupos, hora de saída, buraco de saída, jogadores).
 */
const https = require("https");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
function httpGet(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request({ method: "GET", hostname: url.hostname, path: url.pathname + url.search,
      headers: { "User-Agent": UA, "Accept": "text/html,*/*", "Accept-Language": "es-ES,es;q=0.9" }, timeout: 20000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); httpGet(new URL(res.headers.location, urlStr).toString()).then(resolve, reject); return;
      }
      const ch = []; res.on("data", c => ch.push(c)); res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(ch).toString("utf8") }));
    });
    req.on("error", reject); req.on("timeout", () => req.destroy(new Error("timeout"))); req.end();
  });
}
function stripTags(s) {
  return String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

(async () => {
  const id = process.argv[2] || "380";
  let subid = process.argv[3] || null;
  const dom = (process.argv[4] || "lgs").toLowerCase();
  const base = dom.startsWith("mit") ? "https://mitarjeta.golf" : "https://rfegolf.livegolfscoring.es";
  console.log(`base=${base}  id=${id}  subid=${subid || "(descobrir)"}`);

  // 1. Descobrir os sub-ids de horário: aparecem em links /horarios/{id}/{subid}
  //    na página principal e/ou no selector de rondas.
  const main = await httpGet(`${base}/torneos/hoyoahoyo/${id}`);
  const subids = [...new Set([...main.body.matchAll(new RegExp(`/torneos/horarios/${id}/(\\d+)`, "g"))].map(m => m[1]))];
  console.log(`\n=== sub-ids de horário encontrados na página principal: ${JSON.stringify(subids)} ===`);
  // Selector de horários (se existir) — mostrar as <option>
  const sel = [...main.body.matchAll(/<option value="\/torneos\/horarios\/\d+\/(\d+)"[^>]*>([^<]+)<\/option>/gi)];
  if (sel.length) { console.log("selector de horários (sub-id → label):"); sel.forEach(o => console.log(`  ${o[1]} → ${o[2].trim()}`)); }
  if (!subid) subid = subids[0] || "1629";

  // 2. Página de horários propriamente dita
  const h = await httpGet(`${base}/torneos/horarios/${id}/${subid}`);
  console.log(`\n=== /torneos/horarios/${id}/${subid} ===`);
  console.log(`status=${h.status}  bodyLen=${h.body.length}`);

  // 2b. Navegação por ronda DENTRO da página de horários — é aqui que provavelmente
  //     vivem os sub-ids das outras rondas (R2, R3). Mostrar selector + todos os links.
  const hSel = [...h.body.matchAll(/<option value="\/torneos\/horarios\/\d+\/(\d+)"[^>]*>([^<]*)<\/option>/gi)];
  if (hSel.length) { console.log("selector de rondas NA página de horários (sub-id → label):"); hSel.forEach(o => console.log(`  ${o[1]} → ${o[2].trim()}`)); }
  const hLinks = [...new Set([...h.body.matchAll(/\/torneos\/horarios\/(\d+)\/(\d+)/g)].map(m => `${m[1]}/${m[2]}`))];
  console.log(`links /horarios/X/Y na página de horários: ${JSON.stringify(hLinks)}`);
  // Qualquer <select> e os <a href> de navegação (para ver o padrão de ronda)
  const selectBlocks = [...h.body.matchAll(/<select[^>]*>([\s\S]*?)<\/select>/gi)];
  console.log(`nº de <select> na página: ${selectBlocks.length}`);
  selectBlocks.slice(0, 3).forEach((s, i) => console.log(`  <select#${i}> (stripped opts): ${stripTags(s[1]).slice(0, 200)}`));
  const navLinks = [...h.body.matchAll(/<a[^>]*href="([^"]*(?:ronda|round|horario|jornada)[^"]*)"[^>]*>([^<]*)<\/a>/gi)];
  navLinks.slice(0, 8).forEach(a => console.log(`  <a href="${a[1]}">${a[2].trim()}</a>`));
  // Procurar horas de saída (HH:MM) e nomes
  const times = [...h.body.matchAll(/\b([0-2]?\d:[0-5]\d)\b/g)].map(m => m[1]);
  console.log(`horas (HH:MM) encontradas: ${times.length} — ex: ${[...new Set(times)].slice(0, 6).join(", ")}`);

  // Dump das primeiras linhas de tabela (raw + stripped) para ver a estrutura
  const trs = [...h.body.matchAll(/<tr[^>]*>([\s\S]+?)<\/tr>/gi)].slice(0, 12);
  console.log(`\n--- primeiras ${trs.length} <tr> (stripped) ---`);
  trs.forEach((t, i) => { const s = stripTags(t[1]); if (s) console.log(`  [${i}] ${s.slice(0, 160)}`); });

  // Uma linha raw representativa (a primeira com uma hora HH:MM)
  const withTime = trs.find(t => /[0-2]?\d:[0-5]\d/.test(t[0]));
  if (withTime) { console.log(`\n--- 1ª <tr> com hora (raw, 900 chars) ---\n${withTime[0].slice(0, 900)}`); }
  else { console.log(`\n(nenhuma <tr> com hora — talvez a tabela use <div>; primeiros 800 chars do body:)\n${h.body.slice(0, 800)}`); }
})().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
