/**
 * Para cada JSON em public/data/rfegolf-livegolfscoring/, fetch a
 * https://rfegolf.livegolfscoring.es/torneos/imprimir/{id} e extrair "Fecha: dd/mm/yyyy"
 * para popular meta.year e meta.dateIso.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "../public/data/rfegolf-livegolfscoring");
const UA = "Mozilla/5.0";
const AGENT = new https.Agent({ keepAlive: true, maxSockets: 8 });

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": UA }, agent: AGENT, timeout: 15000 }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    }).on("error", reject).on("timeout", () => reject(new Error("timeout")));
  });
}

async function enrich(file) {
  const fp = path.join(ROOT, file);
  const d = JSON.parse(fs.readFileSync(fp, "utf-8"));
  if (d.meta && d.meta.year && d.meta.dateIso) return { skipped: true };
  const id = d.id;
  try {
    const html = await get(`https://rfegolf.livegolfscoring.es/torneos/imprimir/${id}`);
    // Fecha: 27/06/2025 19:11 — tem o ano. Também "Del 25 junio al 27 junio de 2025"
    const fechaM = /Fecha:\s*(\d{1,2}\/\d{1,2}\/(\d{4}))/i.exec(html);
    const delM = /Del\s+(\d+)\s+(\w+)\s+al\s+(\d+)\s+(\w+)(?:\s+de\s+(\d{4}))?/i.exec(html);
    let year = null;
    let dateIso = null;
    if (fechaM) {
      year = parseInt(fechaM[2], 10);
      const parts = fechaM[1].split("/");
      dateIso = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
    if (!year && delM && delM[5]) {
      year = parseInt(delM[5], 10);
    }
    if (year || dateIso) {
      d.meta.year = year;
      d.meta.dateIso = dateIso;
      fs.writeFileSync(fp, JSON.stringify(d, null, 2));
      return { ok: true, year, dateIso };
    }
    return { ok: false };
  } catch (e) {
    return { error: e.message };
  }
}

(async () => {
  const files = fs.readdirSync(ROOT).filter(f => /^\d+\.json$/.test(f));
  console.log(`Enriching ${files.length} files...`);
  let ok = 0, fail = 0, skip = 0;
  const concurrency = 10;
  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const f = files[cursor++];
      const r = await enrich(f);
      if (r.skipped) skip++;
      else if (r.ok) { ok++; }
      else fail++;
    }
  }
  const ws = [];
  for (let i = 0; i < concurrency; i++) ws.push(worker());
  await Promise.all(ws);
  console.log(`ok=${ok} fail=${fail} skip=${skip}`);
})();
