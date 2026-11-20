#!/usr/bin/env node
/**
 * scrape-doral-aceites.js — lista de ACEITES do First Tee Miami Doral Jr.
 * Classic → `public/data/ftm_doral_{ano}.json` (campo `accepted` de cada escalão).
 *
 * A edição vem de `scripts/doral-editions.json` (`acceptedPageId` + `leagueId`).
 * GolfGenius sempre por `fetch` (o browser dá 403): o widget
 * `/leagues/{league}/widgets/text_pages?page_id={acceptedPageId}`.
 *
 * Os resultados, quando os houver, continuam a vir do `scrape-golfgenius-v3.js`,
 * que mantém esta lista. Aqui nunca se tocam os `players` (resultados).
 *
 *   node scripts/scrape-doral-aceites.js --year 2026 [--force]
 *
 * Saída: 0 gravou · 2 nada de novo · 1 erro.
 */
const fs = require("fs");
const path = require("path");
const { writeJsonGuarded } = require("./lib/shrink-guard");
const { parseAceites, juntarAceites } = require("./lib/doral-aceites");

const ROOT = path.join(__dirname, "..");
const CONFIG = path.join(__dirname, "doral-editions.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

function args(argv) {
  const a = { force: argv.includes("--force") };
  const i = argv.indexOf("--year");
  if (i >= 0) a.year = Number(argv[i + 1]);
  return a;
}

function lerJson(p) {
  if (!fs.existsSync(p)) return null;
  let t = fs.readFileSync(p, "utf8");
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return JSON.parse(t); // ilegível = erro, nunca «vazio»
}

(async () => {
  const opts = args(process.argv.slice(2));
  const config = lerJson(CONFIG);
  const comLista = config.editions.filter((e) => e.acceptedPageId);
  const ed = opts.year ? comLista.find((e) => e.year === opts.year) : comLista.sort((a, b) => b.year - a.year)[0];
  if (!ed) { console.error(`❌ Sem acceptedPageId para ${opts.year || "nenhum ano"} em doral-editions.json`); process.exit(1); }
  if (!ed.leagueId) { console.error(`❌ ${ed.year}: falta o leagueId em doral-editions.json`); process.exit(1); }

  const host = new URL(ed.sourceUrl).host;
  const pagina = `https://${host}/pages/${ed.acceptedPageId}`;
  const url = `https://${host}/leagues/${ed.leagueId}/widgets/text_pages?page_id=${ed.acceptedPageId}&shared=false`;
  console.log(`🏌️  Doral ${ed.year} — lista de aceites\n   ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": UA, Referer: pagina } });
  if (!res.ok) { console.error(`❌ HTTP ${res.status}`); process.exit(1); }
  const { publicado, jogadores, ignorados } = parseAceites(await res.text());
  if (!jogadores.length) { console.error("❌ Lista vazia — a página mudou de formato?"); process.exit(1); }
  for (const l of ignorados) console.warn(`   ⚠️  linha ignorada (escalão desconhecido): ${l}`);
  for (const j of jogadores.filter((x) => x.divisionRaw)) console.log(`   ✎ ${j.first} ${j.last}: «${j.divisionRaw}» → ${j.division}`);
  for (const j of jogadores.filter((x) => !x.country)) console.log(`   ? ${j.first} ${j.last}: país «${j.countryRaw}» não reconhecido — fica vazio`);

  const out = path.join(ROOT, "public", "data", `ftm_doral_${ed.year}.json`);
  const anterior = lerJson(out) || { tournament: ed.name, year: ed.year, source: ed.sourceUrl, divisions: [] };
  const base = {
    ...anterior,
    ...(ed.startDate ? { startDate: ed.startDate } : {}),
    ...(ed.endDate ? { endDate: ed.endDate } : {}),
    acceptedList: { url: pagina, published: publicado, total: jogadores.length },
  };
  const data = juntarAceites(base, jogadores);
  // Campo do ano por escalão (2026: tudo no Red Tiger) — só nos que ainda não têm.
  if (ed.course) for (const d of data.divisions) if (!d.course) d.course = ed.course;

  const conta = (d) => (d.divisions || []).reduce((n, dv) => n + ((dv.accepted || []).length), 0);
  const antes = JSON.stringify(anterior.divisions?.map((d) => d.accepted || null));
  const depois = JSON.stringify(data.divisions.map((d) => d.accepted || null));
  if (antes === depois && anterior.acceptedList?.published === publicado) {
    console.log(`   = sem mudanças (${jogadores.length} aceites, publicada ${publicado})`);
    process.exit(2);
  }
  const r = writeJsonGuarded(out, data, { count: conta, maxDrop: 0.3, force: opts.force, label: "aceites" });
  if (!r.written) { console.error(`❌ Não gravado: ${r.reason}`); process.exit(1); }

  const porEsc = data.divisions.filter((d) => d.accepted).map((d) => `${d.division} ${d.accepted.length}`).join(" · ");
  console.log(`✅ ${jogadores.length} aceites (publicada ${publicado}) → ${path.relative(ROOT, out)}\n   ${porEsc}`);
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
