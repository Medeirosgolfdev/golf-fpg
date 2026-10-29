/**
 * scripts/scrape-ffgolf-rms9.js
 *
 * Liga cada torneio do índice FFG (ffgolf-resultats-index.json) ao seu torneio
 * no RMS9/A9online — o live scoring do ORGANIZADOR, onde estão o CR, o Slope,
 * os metros e o SI oficiais de cada tee (`course-assignments`).
 *
 * Tenant = organizador = `glfOrg` do torneio no portal FFG (8023 = FFG,
 * 94LL = liga LL, 9401 Paris-IdF…; num GP de clube é o código do clube, ex.
 * 1439). Tenta-se o glfOrg e, a seguir, a liga e a FFG.
 * A API é pública com os cabeçalhos x-tenant-id: fr_{tenant}, x-access-token
 * vazio e Accept-Language: fr_FR (sem eles dá 401).
 *
 * Casa por data de início igual (±1 dia) e semelhança do nome.
 * Incremental: só procura os trnId que ainda não estão no ficheiro
 * (--all refaz tudo; --since AAAA corta os anos antigos).
 *
 * Output: public/data/ffgolf-rms9.json
 *   { generatedAt, tournaments: { trnId: { tenant, id, name } | { none: true, checkedAt } } }
 */
const fs = require("fs");
const path = require("path");

const INDEX = path.resolve(__dirname, "../public/data/ffgolf-resultats-index.json");
const RES_DIR = path.resolve(__dirname, "../public/data/ffgolf-resultats");
const OUT = path.resolve(__dirname, "../public/data/ffgolf-rms9.json");

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const SINCE = Number(args[args.indexOf("--since") + 1]) || 2022;

const H = (t) => ({ "x-tenant-id": "fr_" + t, "x-access-token": "", "Accept-Language": "fr_FR" });
async function get(tenant, p) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`https://${tenant}.rms9.fr/a9online/v1/rs/cs/${p}`, { headers: H(tenant) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) {
      if (i === 2) { console.warn(`  ${tenant} ${p}: ${e.message}`); return null; }
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    }
  }
}

// Torneios de um tenant num mês (arquivados e não arquivados), com cache.
const monthCache = new Map();
function monthList(tenant, ym) {
  const k = tenant + "|" + ym;
  if (!monthCache.has(k)) {
    const last = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
    monthCache.set(k, (async () => {
      const out = [];
      for (const arch of ["true", "false"]) {
        const j = await get(tenant, `tournaments?archived=${arch}&page=0&size=2000&sort=startDate,asc&startDateFrom=${ym}-01&startDateTo=${ym}-${last}`);
        out.push(...((j && j.content) || []));
      }
      return out;
    })());
  }
  return monthCache.get(k);
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "et", "golf", "grand", "prix", "gp"]);
const toks = (s) => new Set(norm(s).split(" ").filter((w) => w && !STOP.has(w)));
function sim(a, b) {
  const A = toks(a), B = toks(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.max(A.size, B.size);
}
const dayDiff = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

async function findOne(t) {
  let org = null;
  try {
    const d = JSON.parse(fs.readFileSync(path.join(RES_DIR, t.file), "utf8"));
    org = ((d.details && d.details.series) || []).map((s) => s.glfOrg).find(Boolean) || null;
  } catch { /* sem ficheiro → só liga/FFG */ }
  const tenants = [...new Set([org, t.ligue && t.ligue !== "00" && t.ligue !== "19" ? "94" + t.ligue : null, "8023"].filter(Boolean))];
  const ym = t.dateIso.slice(0, 7);
  let best = null;
  for (const tenant of tenants) {
    for (const x of await monthList(tenant, ym)) {
      const d = String(x.startDate || "").slice(0, 10);
      if (!d || dayDiff(d, t.dateIso) > 1) continue;
      const s = sim(t.name, x.name) - dayDiff(d, t.dateIso) * 0.1;
      if (!best || s > best.s) best = { s, tenant, id: x.id, name: x.name };
    }
  }
  return best && best.s >= 0.5 ? { tenant: best.tenant, id: best.id, name: best.name } : null;
}

(async () => {
  const ix = JSON.parse(fs.readFileSync(INDEX, "utf8"));
  const list = (ix.tournaments || ix).filter((t) => t.dateIso && (t.year || 0) >= SINCE);
  const prev = !ALL && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")).tournaments || {} : {};
  const out = { ...prev };
  // Os «none» com mais de 30 dias voltam a ser procurados (o organizador pode criar o torneio tarde).
  const todo = list.filter((t) => !out[t.trnId] || (out[t.trnId].none && Date.now() - Date.parse(out[t.trnId].checkedAt) > 30 * 86400000));
  console.log(`RMS9: ${todo.length} torneios por procurar (de ${list.length} desde ${SINCE})`);
  let found = 0;
  for (const t of todo) {
    const m = await findOne(t);
    if (m) { out[t.trnId] = m; found++; } else out[t.trnId] = { none: true, checkedAt: new Date().toISOString().slice(0, 10) };
    if (m) console.log(`  ${t.trnId} ${t.dateIso} ${t.name} → ${m.tenant}/${m.id} ${m.name}`);
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), tournaments: sorted }, null, 1) + "\n");
  console.log(`RMS9: ${found} novos ligados; total ligados ${Object.values(sorted).filter((v) => v.id).length}`);
})();
