/**
 * eowagr-par-splits.js
 *
 * Calcula os splits par-3 / par-4 / par-5 de cada jogador a partir dos cartões
 * COMPLETOS dos escalões (eowagr25_contest*.json). Torna desnecessário
 * descarregar os sub-contests "Par 3/4/5" do BlueGolf, que são apenas projeções
 * dos mesmos buracos do cartão de 18 (ou 9) buracos.
 *
 * Para cada jogador soma, por categoria de par (3/4/5): nº de buracos, par,
 * tacadas e o resultado (toPar = tacadas − par). Faz por ronda e no total.
 *
 * USO:
 *   node scripts/eowagr-par-splits.js                         # todos os escalões em ./
 *   node scripts/eowagr-par-splits.js eowagr25_contest13.json [outros...]
 *   node scripts/eowagr-par-splits.js --dir public/data       # procurar noutra pasta
 *   node scripts/eowagr-par-splits.js --out eowagr-par-splits.json
 *
 * Ignora automaticamente os ficheiros que já são projeções (nome "Par 3/4/5"
 * ou par com um único valor distinto) e os que não têm cartões.
 *
 * Output: eowagr-par-splits.json + resumo no terminal.
 */

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const files = [];
  let dir = ".";
  let out = "eowagr-par-splits.json";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") dir = argv[++i];
    else if (a === "--out") out = argv[++i];
    else files.push(a);
  }
  return { files, dir, out };
}

/** É um sub-contest projeção (Par 3/4/5)? Nome ou par com um único valor. */
function isProjection(data) {
  if (/par\s*[3-5]\b/i.test(data.tournament || "")) return true;
  if (/par\s*[3-5]\b/i.test(data.category || "")) return true;
  const par = (data.par || []).filter((p) => p > 0);
  return par.length > 0 && new Set(par).size === 1;
}

function emptyCat() {
  return { holes: 0, par: 0, strokes: 0, toPar: 0 };
}

/** Divide uma ronda (scores alinhados a par) por categoria de par 3/4/5. */
function splitRound(scores, par) {
  const cats = { 3: emptyCat(), 4: emptyCat(), 5: emptyCat() };
  const n = Math.min(scores.length, par.length);
  for (let i = 0; i < n; i++) {
    const p = par[i];
    const s = scores[i];
    if (!(p >= 3 && p <= 5)) continue;
    if (!(Number.isFinite(s) && s > 0)) continue;
    cats[p].holes++;
    cats[p].par += p;
    cats[p].strokes += s;
  }
  for (const k of [3, 4, 5]) cats[k].toPar = cats[k].strokes - cats[k].par;
  return cats;
}

function addInto(dst, src) {
  for (const k of [3, 4, 5]) {
    dst[k].holes += src[k].holes;
    dst[k].par += src[k].par;
    dst[k].strokes += src[k].strokes;
    dst[k].toPar += src[k].toPar;
  }
}

function processFile(file) {
  const data = JSON.parse(fs.readFileSync(file, "utf-8"));
  if (isProjection(data)) return { skipped: "projeção" };
  const par = data.par || [];
  if (par.length === 0) return { skipped: "sem par" };

  const players = (data.players || [])
    .map((pl) => {
      const total = { 3: emptyCat(), 4: emptyCat(), 5: emptyCat() };
      const rounds = (pl.rounds || []).map((r) => {
        const cats = splitRound(r.scores || [], par);
        addInto(total, cats);
        return { day: r.day, p3: cats[3], p4: cats[4], p5: cats[5] };
      });
      return {
        name: pl.name,
        country: pl.country || "",
        pos: pl.pos != null ? pl.pos : null,
        splits: { p3: total[3], p4: total[4], p5: total[5] },
        rounds,
      };
    })
    .filter((p) => p.rounds.length > 0);

  return {
    contest: file.replace(/^.*[\\/]/, ""),
    tournament: data.tournament || "",
    category: data.category || "",
    holes: par.length,
    players,
  };
}

(function main() {
  const { files, dir, out } = parseArgs(process.argv.slice(2));
  let inputs = files;
  if (inputs.length === 0) {
    inputs = fs
      .readdirSync(dir)
      .filter((f) => /^eowagr25_contest.*\.json$/.test(f))
      .map((f) => path.join(dir, f))
      .sort();
  }

  const results = [];
  for (const f of inputs) {
    try {
      const r = processFile(f);
      const base = f.replace(/^.*[\\/]/, "");
      if (r.skipped) {
        console.log(`⏭️  ${base.padEnd(30)} — ${r.skipped}, ignorado`);
        continue;
      }
      results.push(r);
      console.log(
        `✅ ${base.padEnd(30)} ${(r.category || r.tournament).padEnd(20)} ` +
          `${r.players.length} jogadores (${r.holes}H)`
      );
    } catch (e) {
      console.error(`❌ ${f}: ${e.message}`);
    }
  }

  fs.writeFileSync(
    out,
    JSON.stringify({ generatedAt: new Date().toISOString(), contests: results }, null, 2),
    "utf-8"
  );
  console.log(`\n📦 ${results.length} escalões processados → ${out}`);

  // Exemplo de leitura no terminal: melhor par-5 do primeiro escalão
  if (results.length && results[0].players.length) {
    const ex = [...results[0].players].sort((a, b) => a.splits.p5.toPar - b.splits.p5.toPar)[0];
    if (ex && ex.splits.p5.holes) {
      const t = ex.splits.p5;
      console.log(
        `   ex.: melhor nos par-5 em "${results[0].category}": ${ex.name} ` +
          `→ ${t.strokes} em ${t.holes} buracos (par ${t.par}, ${t.toPar >= 0 ? "+" : ""}${t.toPar})`
      );
    }
  }
})();
