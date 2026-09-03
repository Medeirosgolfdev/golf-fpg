/**
 * scripts/backfill-lgs-clasificacion.js
 *
 * Re-lê SÓ a página de classificação de cada torneio LGS já guardado e preenche
 * o que os scrapes antigos não liam. Não toca em scorecards nem em nada que já
 * exista — re-scrapar os 287 torneios inteiros custaria horas.
 *
 * O que traz (tudo estava na página desde sempre, o parser é que não o lia):
 *   • `meta.course`      — o selector antigo (`span.nombre_campo`) não existe na
 *                          página; nenhum dos 287 ficheiros tinha campo.
 *   • país por jogador   — `<img class="flag" src=".../paises/por.png">`, com a
 *                          comunidade autónoma no `title`. Propagado para as
 *                          rondas (é o que a UI e o agregador lêem).
 *   • `course.par/si/meters` — tabela lateral "Scorecard" (Hoyo|Par|Hdp|Mtrs).
 *                          Só preenche o que faltar: a /estadisticas, quando
 *                          existe, traz as distâncias JOGADAS e essas mandam.
 *
 * Idempotente. Exit 0 = mudou alguma coisa, 2 = nada a fazer, 1 = erro.
 *
 * USO:
 *   node scripts/backfill-lgs-clasificacion.js [--force] [--concurrency 6] [--id 388]
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { lgsCountryToIso } = require("./lib/lgs-country.js");

const ROOT = path.resolve(__dirname, "../public/data/rfegolf-livegolfscoring");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const AGENT = new https.Agent({ keepAlive: true, maxSockets: 8 });

const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const CONCURRENCY = parseInt(arg("--concurrency", "6"), 10) || 6;
// Só as bandeiras (não toca no campo nem no par/SI/metros). Útil depois de
// acrescentar códigos novos ao mapa de países: os jogadores desses códigos
// ficaram com country null e a guarda normal salta-os para sempre.
const FLAGS_ONLY = argv.includes("--flags-only");
const ONLY_ID = arg("--id", null);

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": UA }, agent: AGENT, timeout: 20000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    }).on("error", reject).on("timeout", function () { this.destroy(new Error("timeout")); });
  });
}

function decodeEntities(s) {
  return String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}
function stripTags(s) { return decodeEntities(String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()); }
function normName(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseCourse(html) {
  const m = /Campo:\s*<\/span>\s*<a[^>]*>([^<]+)<\/a>/i.exec(html);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : null;
}

/** Tabela lateral "Scorecard": Hoyo | Par | Hdp | Mtrs (uma linha por buraco). */
function parseTarjetaCampo(html) {
  const tblM = /<table[^>]*class="[^"]*tarjetacampo[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!tblM) return null;
  const par = [], si = [], meters = [];
  const rowRe = /<tr[^>]*>\s*<td[^>]*>\s*(\d{1,2})\s*<\/td>\s*<td[^>]*>\s*(\d)\s*<\/td>\s*<td[^>]*>\s*(\d{1,2})\s*<\/td>\s*<td[^>]*>\s*(\d{1,4})\s*<\/td>/gi;
  let m;
  while ((m = rowRe.exec(tblM[1])) !== null) { par.push(Number(m[2])); si.push(Number(m[3])); meters.push(Number(m[4])); }
  if (par.length !== 9 && par.length !== 18) return null;
  return { par, si, meters };
}

/** memberId/nome → { country ISO-2, region, countryCode cru }. */
function parseFlags(html) {
  const byMid = {}, byName = {};
  const unknown = new Set();
  const trRe = /<tr[^>]*id="jugador-\d+"[^>]*>([\s\S]+?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const row = m[0];
    const idM = /id="(?:jugador|star|fichalink)-(\d+)"/.exec(row);
    const nameM = /<td[^>]*class="[^"]*jugador[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(row);
    // Dois formatos: `/paises/{cc}.png` é PAÍS; `/banderas/{N}.png` é a
    // comunidade autónoma (provas nacionais) e não diz nacionalidade nenhuma —
    // aí guarda-se só a região (ver cabeçalho do parser gémeo no scraper).
    const flagM = /class="flag"[^>]*src="\/img\/banderas\/(?:paises\/)?([a-z0-9_-]+)\.png"[^>]*?(?:title="([^"]*)")?/i.exec(row);
    if (!flagM) continue;
    const isCountryFlag = /\/paises\//i.test(flagM[0]);
    const code = isCountryFlag ? flagM[1].toLowerCase() : null;
    const country = code ? lgsCountryToIso(code) : null;
    if (code && !country) unknown.add(code);
    const nat = { country, region: flagM[2] ? decodeEntities(flagM[2]).trim() || null : null };
    if (idM) byMid[idM[1]] = nat;
    if (nameM) byName[normName(stripTags(nameM[1]).replace(/\*/g, ""))] = nat;
  }
  return { byMid, byName, unknown: [...unknown] };
}

(async () => {
  let files = fs.readdirSync(ROOT).filter((f) => /^\d+\.json$/.test(f));
  if (ONLY_ID) files = files.filter((f) => f === `${ONLY_ID}.json`);
  console.log(`backfill-lgs-clasificacion: ${files.length} ficheiro(s), concurrency=${CONCURRENCY}${FORCE ? " (force)" : ""}`);

  let changed = 0, skip = 0, err = 0, cursor = 0;
  const unknownCodes = new Set();

  async function worker() {
    while (cursor < files.length) {
      const f = files[cursor++];
      const fp = path.join(ROOT, f);
      try {
        const d = JSON.parse(fs.readFileSync(fp, "utf-8"));
        const temPais = (d.rounds || []).some((r) => (r.players || []).some((p) => p.country || p.region));
        const temTarjeta = Array.isArray(d.course && d.course.meters) && d.course.meters.length > 0;
        if (!FORCE && !FLAGS_ONLY && d.meta && d.meta.course && temPais && temTarjeta) { skip++; continue; }

        const html = await get(`https://rfegolf.livegolfscoring.es/torneos/clasificacion/${d.id}`);
        let dirty = false;

        const course = parseCourse(html);
        if (!FLAGS_ONLY && course && (FORCE || !d.meta.course)) { d.meta.course = course; dirty = true; }

        const tarjeta = FLAGS_ONLY ? null : parseTarjetaCampo(html);
        if (tarjeta) {
          d.course = d.course || {};
          for (const k of ["par", "si", "meters"]) {
            if (FORCE || !Array.isArray(d.course[k]) || !d.course[k].length) { d.course[k] = tarjeta[k]; dirty = true; }
          }
        }

        const { byMid, byName, unknown } = parseFlags(html);
        for (const u of unknown) unknownCodes.add(u);
        if (Object.keys(byMid).length || Object.keys(byName).length) {
          for (const cp of d.classification || []) {
            const nat = (cp.memberId && byMid[cp.memberId]) || byName[normName(String(cp.name).replace(/\*/g, ""))];
            if (!nat) continue;
            if (nat.country !== cp.country || (nat.region || null) !== (cp.region || null)) dirty = true;
            cp.country = nat.country;
            cp.region = nat.region;
          }
          for (const r of d.rounds || []) {
            for (const p of r.players || []) {
              const nat = (p.memberId && byMid[p.memberId]) || byName[normName(String(p.name).replace(/\*/g, ""))];
              if (!nat || (!nat.country && !nat.region)) continue;
              if (nat.country && p.country !== nat.country) { p.country = nat.country; dirty = true; }
              if (nat.region && p.region !== nat.region) { p.region = nat.region; dirty = true; }
            }
          }
        }

        if (dirty) { fs.writeFileSync(fp, JSON.stringify(d, null, 2)); changed++; }
        else skip++;
      } catch (e) { err++; console.warn(`  ⚠ ${f}: ${e.message}`); }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (unknownCodes.size) {
    console.warn(`\n⚠ códigos de país por mapear em scripts/lib/lgs-country.js: ${[...unknownCodes].sort().join(", ")}`);
  }
  console.log(`Done: alterados=${changed} sem-mudanças=${skip} erros=${err}`);
  process.exit(changed ? 0 : 2);
})();
