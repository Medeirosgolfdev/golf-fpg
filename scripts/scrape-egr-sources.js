/**
 * scripts/scrape-egr-sources.js — "ponte" EGR → plataformas de origem.
 *
 * O European Golf Rankings é um META-agregador: cada evento tem um `sourceUrl`
 * que aponta para a plataforma real onde o torneio decorreu. Este script usa a
 * lista de eventos EGR (public/data/egr/events/*.json) como camada de DESCOBERTA
 * e vai buscar às plataformas de origem o que o EGR NÃO tem — em particular o
 * **ano de nascimento** (o EGR só expõe escalão actual, sem DOB).
 *
 * Alvo actual: **GolfBox** (scores.golfbox.dk) — que serve directamente
 * (www.golfbox.dk) e via federações que usam o mesmo backend (golfbelgium.be).
 * O GolfBox publica `BirthYear` por jogador → transforma o matching fraco do
 * kids2 (nome+país) em forte (nome+DOB), como o fcg catalão.
 *
 * Reutiliza `scrapeOne` de `scrape-golfbox.js` (mesma lógica JSONP dos handlers).
 *
 * Output: public/data/egr/egr-dob-roster.json — roster consolidado
 *   { key `normname|iso2` → { name, birthYear, club, country, hcp, comps[], events[] } }
 * pronto a ser consumido pelo futuro adapter `egr.js` (enriquecimento DOB) e pela
 * própria página /egr.
 *
 * CLI:
 *   node scripts/scrape-egr-sources.js                 # golfbox+bélgica, todas as comps únicas
 *   node scripts/scrape-egr-sources.js --limit 5       # smoke test
 *   node scripts/scrape-egr-sources.js --concurrency 4
 *   node scripts/scrape-egr-sources.js --comps 4859983,4216621
 *
 * Exit codes: 0 = ok, 2 = sem comps, 1 = erro.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./lib/atomic-write");
const { scrapeOne } = require("./scrape-golfbox");

const EVENTS_DIR = path.resolve(__dirname, "..", "public", "data", "egr", "events");
const OUT_FILE = path.resolve(__dirname, "..", "public", "data", "egr", "egr-dob-roster.json");

/* ── nome/país helpers (espelho leve do util/names do agregador) ── */
function normName(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
// GolfBox devolve nacionalidade como ISO3 ("SUI","BEL") ou nome; normalizamos a
// uma chave curta estável para deduplicar homónimos entre países.
function countryKey(c) {
  if (!c) return "";
  return String(c).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

/* ── Descoberta: comps golfbox únicas a partir dos eventos EGR ──── */
function discoverGolfboxComps() {
  const files = fs.existsSync(EVENTS_DIR) ? fs.readdirSync(EVENTS_DIR).filter((f) => /^egr_\d+\.json$/.test(f)) : [];
  const comps = new Map(); // compId → { events: [{eventId,name,ageGroup}] }
  for (const f of files) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(EVENTS_DIR, f), "utf8")); } catch { continue; }
    const u = String(d.sourceUrl || "").replace(/&amp;/g, "&");
    if (!/golfbox|golfbelgium/.test(u)) continue;
    const m = u.match(/competition\/(\d+)/); // ignora URLs "só-tour" (customer/{id}/schedule)
    if (!m) continue;
    const compId = m[1];
    if (!comps.has(compId)) comps.set(compId, { events: [] });
    comps.get(compId).events.push({ eventId: d.id, name: d.name, ageGroup: d.ageGroup });
  }
  return comps;
}

/* ── Pool de concorrência ──────────────────────────────────────── */
async function pool(items, concurrency, worker, onDone) {
  const results = [];
  let idx = 0, done = 0;
  async function run() {
    while (idx < items.length) {
      const i = idx++;
      try { results[i] = await worker(items[i], i); }
      catch (err) { results[i] = { error: err.message }; }
      done++;
      if (onDone) onDone(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

/* ── main ──────────────────────────────────────────────────────── */
function parseArgs(argv) {
  const o = { limit: null, concurrency: 4, comps: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") o.limit = parseInt(argv[++i], 10);
    else if (a === "--concurrency") o.concurrency = Math.max(1, parseInt(argv[++i], 10) || 4);
    else if (a === "--comps") o.comps = String(argv[++i]).split(",").map((s) => s.trim()).filter(Boolean);
  }
  return o;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const discovered = discoverGolfboxComps();
  let compIds = opts.comps || [...discovered.keys()];
  if (opts.limit) compIds = compIds.slice(0, opts.limit);
  console.log(`• ${discovered.size} competições GolfBox/Bélgica descobertas nos eventos EGR${opts.limit ? ` (a processar ${compIds.length})` : ""}`);
  if (!compIds.length) { console.log("Sem competições."); process.exitCode = 2; return; }

  const roster = new Map(); // key → entry
  let okComps = 0, errComps = 0, totalPlayers = 0, withDob = 0;

  // Silenciar o log verboso do scrapeOne (uma linha por classe) durante todo o
  // batch — o override é global, não pode alternar por worker (racy com concorrência).
  const realLog = console.log;
  console.log = () => {};

  await pool(compIds, opts.concurrency, async (compId) => {
    const res = await scrapeOne(compId);
    const ctx = discovered.get(compId) || { events: [] };
    const eventIds = ctx.events.map((e) => e.eventId);
    for (const dv of res.out.divisions || []) {
      for (const p of dv.players || []) {
        if (!p.name) continue;
        totalPlayers++;
        const key = `${normName(p.name)}|${countryKey(p.country)}`;
        let e = roster.get(key);
        if (!e) {
          e = { name: p.name, birthYear: null, club: p.club || null, country: p.country || null, hcp: null, comps: [], events: [] };
          roster.set(key, e);
        }
        if (e.birthYear == null && p.birthYear) { e.birthYear = p.birthYear; }
        if (!e.club && p.club) e.club = p.club;
        if (e.hcp == null && typeof p.hcp === "number") e.hcp = p.hcp;
        if (!e.comps.includes(compId)) e.comps.push(compId);
        for (const id of eventIds) if (!e.events.includes(id)) e.events.push(id);
      }
    }
    okComps++;
    return { compId, name: res.name };
  }, (d, t) => { if (d % 10 === 0 || d === t) process.stdout.write(`\r  comps ${d}/${t}   `); });
  console.log = realLog;
  process.stdout.write("\n");

  const players = {};
  for (const [key, e] of roster) {
    if (e.birthYear) withDob++;
    players[key] = e;
  }
  errComps = compIds.length - okComps;

  writeJsonAtomic(OUT_FILE, {
    generated_at: new Date().toISOString(),
    source: "GolfBox (via descoberta EGR) — scores.golfbox.dk handlers",
    note: "Roster nome+DOB para enriquecer o kids2/EGR. Chave = normname|iso3-país. birthYear vem do GolfBox (o EGR não tem DOB).",
    totalComps: compIds.length,
    okComps, errComps,
    totalPlayers: roster.size,
    withBirthYear: withDob,
    players,
  }, { spaces: 0 });

  realLog(`  ✔ ${roster.size} jogadores únicos (${withDob} com ano de nascimento) de ${okComps}/${compIds.length} comps → ${path.relative(process.cwd(), OUT_FILE)}`);
  if (errComps) realLog(`  ⚠ ${errComps} comps falharam`);

  enrichRanking(roster, realLog);
  process.exitCode = 0;
}

/* ── Assar o birthYear no egr-ranking.json (match por nome, sem ambiguidade) ──
 * O EGR não tem DOB; o GolfBox tem. Cruzamos por nome normalizado (as chaves de
 * país divergem: EGR usa nome extenso, GolfBox ISO) e só carimbamos quando há um
 * único ano candidato para esse nome (0 colisões medidas). Fica disponível para
 * a página /egr e para o adapter kids2 sem fetch adicional. */
function enrichRanking(roster, log) {
  const RANKING_FILE = path.resolve(__dirname, "..", "public", "data", "egr-ranking.json");
  if (!fs.existsSync(RANKING_FILE)) { log("  ⚠ egr-ranking.json não existe — corre primeiro scrape-egr.js --ranking"); return; }
  const byName = new Map(); // normName → Set(birthYear)
  for (const e of roster.values()) {
    if (!e.birthYear) continue;
    const n = normName(e.name);
    if (!byName.has(n)) byName.set(n, new Set());
    byName.get(n).add(e.birthYear);
  }
  let rk;
  try { rk = JSON.parse(fs.readFileSync(RANKING_FILE, "utf8")); } catch { log("  ⚠ egr-ranking.json ilegível"); return; }
  let stamped = 0;
  for (const p of rk.players || []) {
    const ys = byName.get(normName(p.name));
    if (ys && ys.size === 1) { p.birthYear = [...ys][0]; p.birthYearSource = "golfbox"; stamped++; }
    else if (!("birthYear" in p)) { p.birthYear = null; }
  }
  rk.birthYearEnrichedAt = new Date().toISOString();
  rk.birthYearStamped = stamped;
  writeJsonAtomic(RANKING_FILE, rk);
  log(`  ✔ birthYear carimbado em ${stamped} jogadores do ranking → egr-ranking.json`);
}

main().catch((e) => { console.error("✖", e.message); process.exitCode = 1; });
