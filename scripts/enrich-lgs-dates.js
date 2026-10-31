/**
 * Para cada JSON em public/data/rfegolf-livegolfscoring/, fetch a
 * https://rfegolf.livegolfscoring.es/torneos/imprimir/{id} e extrair "Fecha: dd/mm/yyyy"
 * para popular meta.year e meta.dateIso.
 */
const fs = require("fs");
const { writeAtomic } = require("./lib/atomic-write");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "../public/data/rfegolf-livegolfscoring");
const UA = "Mozilla/5.0";
const AGENT = new https.Agent({ keepAlive: true, maxSockets: 8 });

// Out/2026: o rfegolf.livegolfscoring.es responde 301 → mitarjeta.golf; sem
// seguir o redirect o corpo era a página do 301 e todas as provas novas falhavam.
function get(url, hops = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": UA }, agent: AGENT, timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) {
        res.resume();
        resolve(get(new URL(res.headers.location, url).toString(), hops + 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    }).on("error", reject).on("timeout", () => reject(new Error("timeout")));
  });
}

const MESES = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10",
  noviembre: "11", diciembre: "12",
};
function mesLower(s) {
  return String(s || "").toLowerCase();   // nenhum mes em espanhol leva acento
}

/** A data gravada cai dentro de «11 febrero - 13 febrero»? (sem intervalo legível: sim).
 *  As provas lidas antes da correcção do «Del … al …» ficaram com o dia do
 *  «Fecha:» (Puntuable Nacional Juvenil de fevereiro de 2022 a 15/09/2022) —
 *  essas relêem-se. */
function dataNoIntervalo(meta) {
  const r = /(\d{1,2})\s+([a-z]+)\s*-\s*(\d{1,2})\s+([a-z]+)/i.exec(meta.dateRange || "");
  const ini = r && MESES[mesLower(r[2])], fim = r && MESES[mesLower(r[4])];
  if (!ini || !fim) return true;
  const k = (mes, dia) => Number(mes) * 100 + Number(dia);
  const a = k(ini, r[1]), b = k(fim, r[3]), x = k(meta.dateIso.slice(5, 7), meta.dateIso.slice(8, 10));
  return a <= b ? x >= a && x <= b : x >= a || x <= b;   // «28 diciembre - 02 enero»
}

async function enrich(file) {
  const fp = path.join(ROOT, file);
  const raw = fs.readFileSync(fp, "utf-8");
  const d = JSON.parse(raw);
  if (d.meta && d.meta.year && d.meta.dateIso && dataNoIntervalo(d.meta)) return { skipped: true };
  const id = d.id;
  try {
    const html = await get(`https://mitarjeta.golf/torneos/imprimir/${id}`);
    // ⚠ "Fecha: 03/09/2026 11:42" é a data em que a PÁGINA foi gerada (= agora),
    // não a do torneio: num torneio a decorrer dá o dia de hoje, e num torneio
    // antigo scrapado hoje daria o ano errado. A data real do torneio está no
    // cabeçalho "Del 02 septiembre al 05 septiembre [de 2025]" — essa manda.
    // O "Fecha:" fica só como fonte do ANO quando o cabeçalho não o traz
    // (torneios do ano corrente, que é quando o "Del" o omite).
    const fechaM = /Fecha:\s*(\d{1,2}\/\d{1,2}\/(\d{4}))/i.exec(html);
    const delM = /Del\s+(\d+)\s+(\w+)\s+al\s+(\d+)\s+(\w+)(?:\s+de\s+(\d{4}))?/i.exec(html);
    let year = null;
    let dateIso = null;
    if (delM && delM[5]) year = parseInt(delM[5], 10);
    // Interclubes/Adaptado: a página não traz "Fecha:" nem o ano no "Del" —
    // o ano vem no nome da prova ("... Interclubes Masculino 2026").
    const nomeAno = /\b(20\d{2})\b/.exec((d.meta && d.meta.name) || "");
    const mesIni = delM ? MESES[mesLower(delM[2])] : null;
    // Releitura (data gravada fora do intervalo): a gravada era o «Fecha:» de
    // quando se leu a prova, perto dela — o ano sai daí, e recua um se a prova
    // vem depois no calendário (IX Memorial Blanca Mayor, out/2021, lido a 08/09/2022).
    // O «Fecha:» de hoje daria o ano corrente a tudo.
    const antes = d.meta && d.meta.dateIso && !dataNoIntervalo(d.meta) ? d.meta.dateIso : null;
    if (!year && nomeAno) year = parseInt(nomeAno[1], 10);
    if (!year && antes && mesIni) {
      year = parseInt(antes.slice(0, 4), 10);
      if (Number(mesIni) * 100 + Number(delM[1]) > Number(antes.slice(5, 7)) * 100 + Number(antes.slice(8, 10))) year--;
    }
    if (!year && fechaM) year = parseInt(fechaM[2], 10);
    if (year && mesIni) {
      dateIso = `${year}-${mesIni}-${String(delM[1]).padStart(2, "0")}`;
    } else if (fechaM) {
      const parts = fechaM[1].split("/");
      dateIso = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
    if (year || dateIso) {
      d.meta.year = year;
      d.meta.dateIso = dateIso;
      // manter o formato do scraper (compacto) ou o antigo (indentado)
      writeAtomic(fp, raw.includes("\n") ? JSON.stringify(d, null, 2) : JSON.stringify(d));
      return { ok: true, year, dateIso };
    }
    return { semData: true };
  } catch (e) {
    return { error: e.message };
  }
}

(async () => {
  const files = fs.readdirSync(ROOT).filter(f => /^\d+\.json$/.test(f));
  console.log(`Enriching ${files.length} files...`);
  let ok = 0, fail = 0, skip = 0, semData = 0;
  const concurrency = 10;
  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const f = files[cursor++];
      const r = await enrich(f);
      if (r.skipped) skip++;
      else if (r.ok) { ok++; }
      else if (r.semData) { semData++; console.log(`  ${f}: a página não traz a data`); }
      else { fail++; console.log(`  ${f}: ${r.error}`); }
    }
  }
  const ws = [];
  for (let i = 0; i < concurrency; i++) ws.push(worker());
  await Promise.all(ws);
  console.log(`ok=${ok} fail=${fail} sem-data=${semData} skip=${skip}`);
  // Exit: 0 gravou · 2 nada de novo · 1 tudo falhou (antes acabava sempre em 0).
  // «sem-data» (a página respondeu mas não tem a data) não é erro: senão as
  // provas que nunca a terão punham o passo vermelho em todas as corridas.
  if (fail > 0 && ok === 0) process.exitCode = 1;
  else if (ok === 0) process.exitCode = 2;
})().catch((e) => { console.error(e); process.exit(1); });
