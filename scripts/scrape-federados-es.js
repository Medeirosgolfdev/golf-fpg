/**
 * scripts/scrape-federados-es.js
 *
 * Censo de federados espanhois via o serviço PÚBLICO de consulta de hándicap da
 * RFEG. Descoberto (ver scripts/probe-rfeg-handicap.js + CLAUDE.md) que a consulta
 * resolve numa URL GET limpa, sem postback/cookies/ViewState:
 *
 *   GET https://rfegolf.es/paginasservicios/serviciohandicap.aspx?HLic=<licença>
 *   GET https://rfegolf.es/paginasservicios/serviciohandicap.aspx?HAp1=<apelido1>[&HAp2=…][&HNom=…]
 *
 * O resultado renderiza server-side numa GridView `gvSearchResult` com colunas:
 *   [ Nombre completo | Licencia | Hándicap | Estado | Última Modificación ]
 *
 * ⚠ CAP de 20 resultados por query (sem paginação). Apelidos comuns precisam de
 * refinamento (HAp2 / HNom) — feito recursivamente no modo --census.
 *
 * A RFEG está estatutariamente autorizada a tornar públicos os hándicaps exactos
 * (art. 12.º 2. dos Estatutos) — por isso o serviço é aberto. Mesmo assim corremos
 * com ritmo educado (concorrência baixa + delay) e respeitamos o exit code 2.
 *
 * MODOS:
 *   --diagnose                 4-6 queries para validar semântica (match/refinamento/cap)
 *   --enrich [--from F]        para cada licença conhecida (licencia-dob-lookup.json por
 *                              defeito) → GET ?HLic= → hcp/estado/fecha autoritativos
 *   --census --surnames F      enumera apelidos (1 por linha em F); refina os que batem
 *                              no cap de 20 com HAp2 (e depois HNom). Dedup por licença.
 *   --lic L / --ap1 S [--ap2 T --nom N]   query ad-hoc (debug)
 *
 * Output: public/data/federados-es.json  (merge incremental, escrita atómica)
 *   { generatedAt, source, total, byLicencia: { <lic>: {licencia,nombre,hcp,hcpRaw,
 *     estado,fechaMod,fechaModIso,seenVia,scrapedAt} } }
 *
 * Exit: 0 = gravou novidades · 2 = sem novidades · 1 = erro.
 *
 * USO (no PC ou em GitHub Actions — o sandbox Cowork está bloqueado por política):
 *   node scripts/scrape-federados-es.js --diagnose
 *   node scripts/scrape-federados-es.js --enrich --concurrency 3
 *   node scripts/scrape-federados-es.js --census --surnames scripts/es-apellidos.txt
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

/* ─── args ─────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const has = (f) => argv.includes("--" + f);
function arg(name, def) { const i = argv.indexOf("--" + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def; }

const BASE = "https://rfegolf.es/paginasservicios/serviciohandicap.aspx";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const OUT = path.resolve(__dirname, "../public/data/federados-es.json");
const CONCURRENCY = Math.max(1, parseInt(arg("concurrency", "3"), 10));
const DELAY_MS = Math.max(0, parseInt(arg("delay", "120"), 10));
const CAP = 20;                                   // cap de resultados por query (confirmado)
const CHECKPOINT_EVERY = parseInt(arg("checkpoint", "500"), 10);

/* ─── HTTP GET (segue 3xx + window.location/pageRedirect server-side já vêm como 302) ─ */
function httpGet(qs, retries = 3) {
  const url = BASE + "?" + qs;
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const u = new URL(url);
      const req = https.request({
        method: "GET", hostname: u.hostname, path: u.pathname + u.search,
        headers: { "User-Agent": UA, "Accept": "text/html,*/*;q=0.8", "Accept-Language": "es-ES,es;q=0.9", "Cache-Control": "no-cache" },
        timeout: 30000,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url);
          res.resume();
          httpGet(next.search.replace(/^\?/, ""), n).then(resolve, reject); return;
        }
        const chunks = []; res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      });
      req.on("error", (e) => { if (n > 0) setTimeout(() => attempt(n - 1), 1200 * (4 - n)); else reject(e); });
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.end();
    };
    attempt(retries);
  });
}

/* ─── parsing da GridView gvSearchResult ───────────────────────── */
function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ").replace(/&Aacute;/g, "Á").replace(/&Eacute;/g, "É")
    .replace(/&Iacute;/g, "Í").replace(/&Oacute;/g, "Ó").replace(/&Uacute;/g, "Ú").replace(/&Ntilde;/g, "Ñ")
    .replace(/&iacute;/gi, "í");
}
function cellText(td) { return decodeEntities(td.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); }

/** Devolve { rows: [{nombre,licencia,hcpRaw,estado,fechaMod}], capped: bool } */
function parseGrid(html) {
  const tblM = /<table[^>]*\bid="[^"]*gvSearchResult"[^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!tblM) return { rows: [], capped: false };
  const trs = tblM[1].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const rows = [];
  for (const tr of trs) {
    if (!/_GridOlympus/i.test(tr)) continue;               // só linhas de dados (salta header)
    const tds = tr.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || [];
    if (tds.length < 6) continue;
    const cells = tds.map(cellText);
    // [0]=blank, [1]=nombre, [2]=licencia, [3]=hcp, [4]=estado, [5]=fecha, [6]=blank
    const nombre = cells[1] || "", licencia = (cells[2] || "").replace(/\s+/g, "");
    if (!licencia) continue;
    rows.push({ nombre, licencia, hcpRaw: cells[3] || "", estado: cells[4] || "", fechaMod: cells[5] || "" });
  }
  return { rows, capped: rows.length >= CAP };
}

function hcpNumber(raw) {
  if (!raw || /sin\s*hcp/i.test(raw)) return null;
  const n = parseFloat(raw.replace(/\./g, "").replace(",", "."));   // "16,6"→16.6 ; "1.234,5" raro
  if (isNaN(n)) return null;
  // 99,9 é a sentinela RFEG de "sem hándicap atribuído"
  if (n === 99.9) return null;
  return n;
}
function fechaIso(d) { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec((d || "").trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; }

function rowToRecord(r, seenVia, nowIso) {
  return {
    licencia: r.licencia, nombre: r.nombre,
    hcp: hcpNumber(r.hcpRaw), hcpRaw: r.hcpRaw,
    estado: r.estado, fechaMod: r.fechaMod, fechaModIso: fechaIso(r.fechaMod),
    seenVia, scrapedAt: nowIso,
  };
}

/* ─── store (merge incremental + escrita atómica) ─────────────── */
function loadStore() {
  try { const d = JSON.parse(fs.readFileSync(OUT, "utf8")); if (d && d.byLicencia) return d.byLicencia; } catch (e) {}
  return {};
}
function writeStore(byLicencia) {
  const out = { generatedAt: new Date().toISOString(), source: "scrape-federados-es.js (RFEG serviciohandicap)", total: Object.keys(byLicencia).length, byLicencia };
  const tmp = OUT + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(out)); fs.renameSync(tmp, OUT);
  return out.total;
}
function upsert(store, rec) {
  const ex = store[rec.licencia];
  // mantém o mais recente por fechaModIso; senão sobrescreve (dados frescos)
  if (!ex || !ex.fechaModIso || (rec.fechaModIso && rec.fechaModIso >= ex.fechaModIso)) { store[rec.licencia] = rec; return !ex; }
  return false;
}

/* ─── pool de concorrência simples ─────────────────────────────── */
async function runPool(items, worker, concurrency, onTick) {
  let i = 0, done = 0; const results = [];
  async function lane() {
    while (i < items.length) {
      const idx = i++; try { results[idx] = await worker(items[idx], idx); } catch (e) { results[idx] = { error: e.message }; }
      if (DELAY_MS) await new Promise((r) => setTimeout(r, DELAY_MS));
      if (onTick) onTick(++done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return results;
}

/* ─── queries ──────────────────────────────────────────────────── */
const enc = (s) => encodeURIComponent(String(s).trim());
async function queryLic(lic) { return parseGrid((await httpGet("HLic=" + enc(lic))).body); }
async function queryName({ ap1, ap2, nom }) {
  const parts = [];
  if (ap1) parts.push("HAp1=" + enc(ap1));
  if (ap2) parts.push("HAp2=" + enc(ap2));
  if (nom) parts.push("HNom=" + enc(nom));
  return parseGrid((await httpGet(parts.join("&"))).body);
}

/* ─── modo: diagnose ───────────────────────────────────────────── */
async function modeDiagnose() {
  const tests = [
    { label: "HLic=1106478321 (numérica)", q: () => queryLic("1106478321") },
    { label: "HLic=AM51917193 (Andalucía)", q: () => queryLic("AM51917193") },
    { label: "HAp1=GARCIA (apelido comum → deve dar cap 20)", q: () => queryName({ ap1: "GARCIA" }) },
    { label: "HAp1=GARC (prefixo? testa match parcial)", q: () => queryName({ ap1: "GARC" }) },
    { label: "HAp1=GARCIA&HAp2=LOPEZ (refinamento 2º apelido)", q: () => queryName({ ap1: "GARCIA", ap2: "LOPEZ" }) },
    { label: "HAp1=GARCIA&HNom=JUAN (refinamento por nome)", q: () => queryName({ ap1: "GARCIA", nom: "JUAN" }) },
    { label: "HAp1=ZUBIZARRETA (apelido raro → deve dar <20)", q: () => queryName({ ap1: "ZUBIZARRETA" }) },
  ];
  console.log("DIAGNOSE — semântica do serviço de hcp RFEG\n");
  for (const t of tests) {
    try {
      const { rows, capped } = await t.q();
      console.log(`• ${t.label}\n    → ${rows.length} linha(s)${capped ? " [CAP atingido]" : ""}` + (rows[0] ? `  ex: ${rows[0].nombre} | ${rows[0].licencia} | ${rows[0].hcpRaw} | ${rows[0].estado}` : ""));
    } catch (e) { console.log(`• ${t.label}\n    → ERRO: ${e.message}`); }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  console.log("\nLeitura: se GARC≈GARCIA o match é por prefixo; se HAp2/HNom baixam <20, o refinamento resolve o cap.");
}

/* ─── modo: enrich (por licença) ───────────────────────────────── */
function loadKnownLicencias(file) {
  const f = file || path.resolve(__dirname, "../public/data/licencia-dob-lookup.json");
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  const lk = d.lookup || d.byLicencia || d;
  return Object.keys(lk).map((s) => s.trim()).filter(Boolean);
}
async function modeEnrich() {
  const store = loadStore();
  const before = Object.keys(store).length;
  let licencias = loadKnownLicencias(arg("from", null));
  if (has("skip-existing")) licencias = licencias.filter((l) => !store[l]);
  if (arg("limit", null)) licencias = licencias.slice(0, parseInt(arg("limit"), 10));
  console.log(`ENRICH: ${licencias.length} licenças (concurrency=${CONCURRENCY}, delay=${DELAY_MS}ms)`);
  const now = new Date().toISOString();
  let found = 0, miss = 0;
  await runPool(licencias, async (lic) => {
    const { rows } = await queryLic(lic);
    // por licença esperamos 1 linha; aceita match exacto da licença se vierem várias
    const r = rows.find((x) => x.licencia === lic) || rows[0];
    if (r) { upsert(store, rowToRecord(r, "lic", now)); found++; } else miss++;
  }, CONCURRENCY, (done, total) => {
    if (done % CHECKPOINT_EVERY === 0) { writeStore(store); process.stdout.write(`\r  ${done}/${total} (found ${found}, miss ${miss}) — checkpoint`); }
  });
  const total = writeStore(store);
  console.log(`\nENRICH done: found ${found}, miss ${miss}. Store ${before} → ${total}.`);
  process.exit(total > before || found > 0 ? 0 : 2);
}

/* ─── modo: census (por apelido, com refinamento recursivo) ────── */
const A_Z = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
// Top apelidos espanhois (INE) — usados como 2º apelido (HAp2) para refinar os
// apelidos que batem no cap de 20. Cobre a maioria da população; alargar com
// --refine-with <ficheiro> (ex.: lista INE completa) para mais completude.
const COMMON_SURNAMES = ("GARCIA RODRIGUEZ GONZALEZ FERNANDEZ LOPEZ MARTINEZ SANCHEZ PEREZ GOMEZ MARTIN " +
  "JIMENEZ RUIZ HERNANDEZ DIAZ MORENO MUÑOZ ALVAREZ ROMERO ALONSO GUTIERREZ NAVARRO TORRES DOMINGUEZ " +
  "VAZQUEZ RAMOS GIL RAMIREZ SERRANO BLANCO MOLINA MORALES SUAREZ ORTEGA DELGADO CASTRO ORTIZ RUBIO " +
  "MARIN SANZ NUÑEZ IGLESIAS MEDINA GARRIDO CORTES CASTILLO SANTOS LOZANO GUERRERO CANO PRIETO MENDEZ " +
  "CALVO GALLEGO VIDAL LEON HERRERA MARQUEZ PEÑA CABRERA FLORES CAMPOS VEGA DIEZ FUENTES CARRASCO " +
  "CABALLERO NIETO REYES AGUILAR PASCUAL SANTANA HERRERO MONTERO HIDALGO GIMENEZ LORENZO GALAN CRUZ " +
  "SOTO RICO ARIAS PARRA CARMONA CRESPO ROMAN PASTOR SAEZ VELASCO MORA SERRA").split(/\s+/);
function loadSurnames(file) {
  if (file) return fs.readFileSync(file, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  // bootstrap: extrai apelidos distintos dos nossos dados de torneios
  const d = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../public/data/licencia-dob-lookup.json"), "utf8")).lookup || {};
  const set = new Set();
  for (const e of Object.values(d)) {
    if (!e.name) continue;
    const m = /^([^,]+),/.exec(e.name);                       // "APELIDOS, NOMES"
    const ap = (m ? m[1] : e.name).trim().split(/\s+/)[0];     // 1º token = 1º apelido aprox.
    if (ap && ap.length >= 3) set.add(ap.toUpperCase());
  }
  return [...set].sort();
}
async function modeCensus() {
  const store = loadStore();
  const before = Object.keys(store).length;
  const surnames = loadSurnames(arg("surnames", null));
  const refineSurnames = arg("refine-with", null) ? fs.readFileSync(arg("refine-with"), "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean) : COMMON_SURNAMES;
  console.log(`CENSUS: ${surnames.length} apelidos (concurrency=${CONCURRENCY}, delay=${DELAY_MS}ms). Refina capados com HAp2(${refineSurnames.length}) e depois HNom(A-Z).`);
  const now = new Date().toISOString();
  let added = 0, queries = 0;

  async function harvest(constraints) {
    queries++;
    const { rows, capped } = await queryName(constraints);
    for (const r of rows) if (upsert(store, rowToRecord(r, "ap", now))) added++;
    return capped;
  }
  // nível 1: HAp1
  await runPool(surnames, async (ap1) => {
    const capped = await harvest({ ap1 });
    if (!capped) return;
    // nível 2: HAp1 + HAp2
    for (const ap2 of refineSurnames) {
      const c2 = await harvest({ ap1, ap2 });
      if (DELAY_MS) await new Promise((r) => setTimeout(r, DELAY_MS));
      if (!c2) continue;
      // nível 3: HAp1 + HAp2 + HNom (inicial A-Z)
      for (const nom of A_Z) { await harvest({ ap1, ap2, nom }); if (DELAY_MS) await new Promise((r) => setTimeout(r, DELAY_MS)); }
    }
  }, CONCURRENCY, (done, total) => {
    if (done % 25 === 0) { writeStore(store); process.stdout.write(`\r  apelido ${done}/${total} — ${Object.keys(store).length} federados, ${queries} queries`); }
  });
  const total = writeStore(store);
  console.log(`\nCENSUS done: +${added} novos (${queries} queries). Store ${before} → ${total}.`);
  process.exit(total > before ? 0 : 2);
}

/* ─── modo: ad-hoc ─────────────────────────────────────────────── */
async function modeAdhoc() {
  let res;
  if (arg("lic", null)) res = await queryLic(arg("lic"));
  else res = await queryName({ ap1: arg("ap1", null), ap2: arg("ap2", null), nom: arg("nom", null) });
  console.log(JSON.stringify(res, null, 2));
}

/* ─── exports (para testes) ────────────────────────────────────── */
module.exports = { parseGrid, hcpNumber, fechaIso, rowToRecord, decodeEntities };

/* ─── main ─────────────────────────────────────────────────────── */
if (require.main === module) {
  (async () => {
    try {
      if (has("diagnose")) return void await modeDiagnose();
      if (has("enrich")) return void await modeEnrich();
      if (has("census")) return void await modeCensus();
      if (arg("lic", null) || arg("ap1", null)) return void await modeAdhoc();
      console.log("Escolhe um modo: --diagnose | --enrich | --census --surnames F | --lic L | --ap1 S");
    } catch (e) { console.error("ERRO:", e.message); process.exit(1); }
  })();
}
