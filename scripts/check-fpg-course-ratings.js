/**
 * check-fpg-course-ratings.js — confere o master-courses.json com o cartão
 * oficial da FPG (scoring-pt.datagolf.pt/scripts/show_card.asp), tee a tee e
 * sexo a sexo: CR/Slope diferentes, tees sem coluna no cartão (re-medidos) e
 * ratings que a FPG não publica. SÓ LÊ — não altera o master.
 *
 *   node scripts/check-fpg-course-ratings.js [saida.json]
 *
 * Um pedido por segundo; os cartões ficam em cache em os.tmpdir().
 * Criado na revisão de todos os campos (30/10/2026): encontrou 51 ratings
 * errados (Azuis «M» com o rating de senhoras copiado, entre outros).
 * Nota: as colunas do cartão seguem a ordem oficial dos tees
 * (scorecardMeta.teeOrder.oldIndex) — emparelhar por distância falha quando
 * dois tees têm metros parecidos (Penha Longa Mosteiro).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] || path.join(os.tmpdir(), "fpg-course-ratings.json");
const master = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/master-courses.json"), "utf8"));
const CACHE = path.join(os.tmpdir(), "fpg-show-card-cache");
fs.mkdirSync(CACHE, { recursive: true });

const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const cellsOf = (row) => [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => decode(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim());

function parse(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => cellsOf(m[1]));
  const tot = rows.find((r) => r.includes("TOT"));
  if (!tot) return null;
  const totals = tot.slice(tot.indexOf("TOT") + 1).map(Number).filter((n) => n > 0);
  // a seguir ao último valor vem o par total; tirá-lo
  const nTees = totals.length - 1;
  const tees = totals.slice(0, nTees);
  const rat = { M: null, F: null };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] !== "C.Rat.") continue;
    const sex = r.some((c) => /Senhoras/i.test(c)) ? "F" : r.some((c) => /Homens/i.test(c)) ? "M" : null;
    const slope = rows[i + 1] && rows[i + 1][0] === "Slope" ? rows[i + 1] : null;
    if (!sex || !slope) continue;
    const cr = r.slice(1, 1 + nTees).map((v) => (v === "" ? null : Number(v)));
    const sl = slope.slice(1, 1 + nTees).map((v) => (v === "" ? null : Number(v)));
    rat[sex] = { cr, sl };
  }
  return { tees, rat };
}

(async () => {
  const report = [];
  for (const c of master.courses) {
    const code = c.master.numbers?.scorecards;
    if (!code) continue;
    const cf = `${CACHE}/${code}.html`;
    let html;
    if (fs.existsSync(cf)) html = fs.readFileSync(cf, "latin1");
    else {
      const url = `https://scoring-pt.datagolf.pt/scripts/show_card.asp?ncourse=${code}&stat=Y&Club=ALL&ack=XH256YF45T`;
      const res = await fetch(url);
      if (!res.ok) { report.push({ key: c.courseKey, name: c.master.name, erro: `HTTP ${res.status}` }); continue; }
      html = Buffer.from(await res.arrayBuffer()).toString("latin1");
      fs.writeFileSync(cf, html, "latin1");
      await new Promise((r) => setTimeout(r, 1000));
    }
    const p = parse(html);
    if (!p) { report.push({ key: c.courseKey, name: c.master.name, erro: "sem tabela" }); continue; }
    for (const t of c.master.tees) {
      const tot = t.distances?.total;
      const col = p.tees.indexOf(tot);
      const r = t.ratings?.holes18;
      if (col < 0) { report.push({ key: c.courseKey, name: c.master.name, tee: t.teeName, sex: t.sex, tot, problema: "tee sem coluna no cartão FPG", fpgTotais: p.tees }); continue; }
      const o = p.rat[t.sex];
      const ocr = o?.cr[col] ?? null, osl = o?.sl[col] ?? null;
      if (ocr == null) {
        report.push({ key: c.courseKey, name: c.master.name, tee: t.teeName, sex: t.sex, tot, problema: "FPG sem rating deste sexo neste tee", nosso: r && `${r.courseRating}/${r.slopeRating}` });
        continue;
      }
      if (!r || r.courseRating !== ocr || r.slopeRating !== osl) {
        report.push({ key: c.courseKey, name: c.master.name, tee: t.teeName, sex: t.sex, tot, problema: "rating diferente", nosso: r && `${r.courseRating}/${r.slopeRating}`, fpg: `${ocr}/${osl}` });
      }
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  const by = {}; for (const x of report) by[x.problema || x.erro] = (by[x.problema || x.erro] || 0) + 1;
  console.log(by);
})();
