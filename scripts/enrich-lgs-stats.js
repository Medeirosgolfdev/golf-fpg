/**
 * scripts/enrich-lgs-stats.js
 *
 * Enriquece os ficheiros existentes em public/data/rfegolf-livegolfscoring/{id}.json
 * com o bloco `course` (metros + SI + par + média por buraco) obtido da página
 * /torneos/estadisticas/{id} — que o scrape original não capturava.
 *
 * Pedido único por torneio (não re-scrape das rondas). Idempotente: salta os que
 * já têm `course` (a menos que --force).
 *
 * USO:
 *   node scripts/enrich-lgs-stats.js                 # só os que faltam
 *   node scripts/enrich-lgs-stats.js --force         # refaz todos
 *   node scripts/enrich-lgs-stats.js --concurrency 6
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { httpGet, parseEstadisticas } = require("./scrape-livegolfscoring.js");

const DIR = path.resolve(__dirname, "../public/data/rfegolf-livegolfscoring");
const args = process.argv.slice(2);
const force = args.includes("--force");
const ci = args.indexOf("--concurrency");
const concurrency = ci >= 0 ? parseInt(args[ci + 1], 10) : 5;

const files = fs.readdirSync(DIR).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
console.log(`enrich-lgs-stats: ${files.length} ficheiros, concurrency=${concurrency}, force=${force}`);

let done = 0, added = 0, skip = 0, none = 0, err = 0, cursor = 0;
async function worker() {
  while (cursor < files.length) {
    const f = files[cursor++];
    const fp = path.join(DIR, f);
    const id = parseInt(f, 10);
    let d;
    try { d = JSON.parse(fs.readFileSync(fp, "utf-8")); }
    catch (e) { err++; continue; }
    if (d.course && d.course.metersTotal && !force) { skip++; done++; continue; }
    try {
      const est = await httpGet(`https://rfegolf.livegolfscoring.es/torneos/estadisticas/${id}`);
      const course = est.status === 200 ? parseEstadisticas(est.body) : null;
      if (course) {
        d.course = course;
        fs.writeFileSync(fp, JSON.stringify(d, null, 0));
        added++;
      } else {
        none++;
      }
    } catch (e) { err++; }
    done++;
    if (done % 25 === 0) console.log(`  ... ${done}/${files.length} (add=${added} skip=${skip} sem=${none} err=${err})`);
  }
}
(async () => {
  const ws = [];
  for (let i = 0; i < concurrency; i++) ws.push(worker());
  await Promise.all(ws);
  console.log(`\nDone: total=${done} adicionados=${added} ja-tinham=${skip} sem-estatisticas=${none} erros=${err}`);
})();
