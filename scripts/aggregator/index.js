#!/usr/bin/env node
/**
 * scripts/aggregator/index.js
 *
 * Orchestrator do agregador de juniores.
 *
 * Pipeline:
 *   1. Carrega adapters de scripts/aggregator/sources/
 *   2. Cada adapter devolve RawSourceData (jogadores + torneios da sua fonte)
 *   3. identity-matcher.js funde por evidência forte (memberId, fed, lic, DOB) + nome
 *   4. Aplica overrides manuais
 *   5. Sanity checks (Manuel presente, Dmitrii 5 confrontos com Manuel, etc.)
 *   6. Escreve public/data/{juniors,juniors-tournaments,tournament-catalog}.json
 *
 * CLI:
 *   node scripts/aggregator/index.js               # tudo
 *   node scripts/aggregator/index.js --only=uskids  # só USKids (debug)
 *   node scripts/aggregator/index.js --skip=ffgolf  # excluir uma fonte
 *   node scripts/aggregator/index.js --dry-run      # corre mas não escreve
 */

const path = require("path");
const { SCHEMA_VERSION } = require("./types");
const { DATA, writeJson, readJsonSafe } = require("./util/io");
const { info, ok, warn, fail, step, sub, bold, dim } = require("./util/log");

const SOURCES = [
  { id: "uskids", label: "USKids Golf", load: () => require("./sources/uskids") },
  { id: "fpg", label: "Federação Portuguesa de Golfe", load: () => require("./sources/fpg") },
  { id: "rfeg", label: "Real Federación Española de Golf", load: () => require("./sources/rfeg") },
  { id: "ffgolf", label: "Fédération française de golf", load: () => require("./sources/ffgolf") },
  { id: "eowagr", label: "European Open WAGR", load: () => require("./sources/eowagr") },
  { id: "wjgc", label: "WJGC / BJGT", load: () => require("./sources/wjgc") },
  { id: "doral", label: "First Tee Miami Doral", load: () => require("./sources/doral") },
  { id: "fm", label: "Future Masters Golf (Dothan)", load: () => require("./sources/futuremasters") },
  { id: "fcg", label: "Federació Catalana de Golf", load: () => require("./sources/fcg") },
  { id: "england", label: "England Golf", load: () => require("./sources/england") },
  { id: "gjgl", label: "Global Junior Golf Live", load: () => require("./sources/gjgl") },
  { id: "fsga", label: "Florida State Golf Association", load: () => require("./sources/fsga") },
  { id: "uajt", label: "The Junior Tour (Under Armour)", load: () => require("./sources/uajt") },
  { id: "uaworlds", label: "The Junior Tour (Under Armour) — World Championship", load: () => require("./sources/uaworlds") },
  { id: "mexnacional", label: "Nacional Infantil Juvenil (México)", load: () => require("./sources/mexnacional") },
  { id: "coc", label: "Champion of Champions World Championship", load: () => require("./sources/coc") },
  { id: "reidtrophy", label: "Reid Trophy (English Boys' U14)", load: () => require("./sources/reidtrophy") },
  { id: "icopa", label: "Copa Bobby Díaz (México)", load: () => require("./sources/icopa") },
  { id: "interzonas", label: "Nacional Interzonas (México)", load: () => require("./sources/interzonas") },
  { id: "avtrophy", label: "Belgian Intl U14 (Albert Vermeiren)", load: () => require("./sources/avtrophy") },
  { id: "job", label: "Junior Orange Bowl International", load: () => require("./sources/job") },
  { id: "ebtc2", label: "European Boys' Team Champ Div. 2", load: () => require("./sources/ebtc2") },
  { id: "egtc", label: "European Girls' Team Championship", load: () => require("./sources/egtc") },
  { id: "elg", label: "European Ladies' Team Championship", load: () => require("./sources/elg") },
  { id: "eatc", label: "European Amateur Team Championship", load: () => require("./sources/eatc") },
  { id: "eatc2", label: "European Amateur Team Champ Div. 2", load: () => require("./sources/eatc2") },
  { id: "eym", label: "European Young Masters (EGA)", load: () => require("./sources/eym") },
  { id: "ejo", label: "Estonian Junior Open", load: () => require("./sources/ejo") },
  { id: "ejt", label: "Estonian Junior Tour", load: () => require("./sources/ejt") },
  { id: "egr", label: "European Golf Rankings", load: () => require("./sources/egr") },
  { id: "optimist", label: "Optimist Intl Junior Championships", load: () => require("./sources/optimist") },
];

function parseArgs(argv) {
  const args = { only: null, skip: [], dryRun: false };
  for (const a of argv.slice(2)) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--only=")) args.only = a.slice(7).split(",").map((s) => s.trim());
    else if (a.startsWith("--skip=")) args.skip = a.slice(7).split(",").map((s) => s.trim());
  }
  return args;
}

async function runAdapter(src, opts) {
  step(`Adapter: ${bold(src.id)} ${dim("(" + src.label + ")")}`);
  let adapter;
  try {
    adapter = src.load();
  } catch (err) {
    if (err.code === "MODULE_NOT_FOUND") {
      warn(`Adapter ${src.id} ainda não existe — saltado.`);
      return null;
    }
    throw err;
  }
  if (typeof adapter.load !== "function") {
    warn(`Adapter ${src.id} não exporta load() — saltado.`);
    return null;
  }
  const start = Date.now();
  try {
    const data = await adapter.load(opts);
    const ms = Date.now() - start;
    sub(`${data.players.length} jogadores · ${data.tournaments.length} torneios · ${ms}ms`);
    return data;
  } catch (err) {
    fail(`Adapter ${src.id} falhou: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  console.log("");
  step(bold(`Aggregator · schema v${SCHEMA_VERSION}`));
  if (args.dryRun) info("modo --dry-run (não escreve outputs)");
  if (args.only) info(`--only: ${args.only.join(", ")}`);
  if (args.skip.length) info(`--skip: ${args.skip.join(", ")}`);
  console.log("");

  // 1. Carregar overrides
  step("Overrides");
  const overrides = readJsonSafe(DATA.overrides, { schemaVersion: SCHEMA_VERSION, forceMerge: [], forceSplit: [], manualPlayers: [] });
  sub(`forceMerge: ${(overrides.forceMerge || []).length} · forceSplit: ${(overrides.forceSplit || []).length} · manualPlayers: ${(overrides.manualPlayers || []).length}`);
  console.log("");

  // 2. Correr todos os adapters
  const rawSources = [];
  for (const src of SOURCES) {
    if (args.only && !args.only.includes(src.id)) continue;
    if (args.skip.includes(src.id)) continue;
    const data = await runAdapter(src, { args });
    if (data) rawSources.push(data);
  }
  console.log("");

  if (rawSources.length === 0) {
    fail("Nenhum adapter produziu dados. Abort.");
    process.exit(1);
  }

  // 2b. Dedup genérico EGR: eventos que já vêm de uma fonte dedicada (roster
  //     overlap + janela de datas) saem ANTES do matcher — a fonte rica ganha.
  //     Complementa a whitelist regex do próprio adapter egr.js.
  {
    const { dedupeEgrTournaments } = require("./util/egr-dedup");
    const { dropped } = dedupeEgrTournaments(rawSources);
    if (dropped.length) {
      step("Dedup EGR vs fontes dedicadas");
      const bySrc = {};
      for (const d of dropped) bySrc[d.coveredBy] = (bySrc[d.coveredBy] || 0) + 1;
      sub(`${dropped.length} evento(s) EGR removido(s): ${Object.entries(bySrc).map(([k, v]) => `${k}×${v}`).join(" · ")}`);
      if (process.env.DEBUG) for (const d of dropped) sub(`  · ${d.egrName} → ${d.coveredBy}: ${d.coveredByName} (sh=${d.shared}, egr%=${d.ovEgr})`);
      console.log("");
    }
  }

  // 2c. Datas de nascimento do roster GolfBox (EGA + federações do norte da
  //     Europa). ANTES do matcher de propósito: a DOB é a evidência que junta o
  //     mesmo miúdo visto em fontes diferentes — nos torneios internacionais os
  //     estrangeiros chegam só com o nome e ficavam como entidades soltas.
  {
    const { enrichWithGolfbox } = require("./util/golfbox-dob");
    const r = enrichWithGolfbox(rawSources);
    if (!r.disponivel) {
      info("golfbox-players.json ausente — sem enriquecimento de DOB (correr scripts/build-golfbox-players.js)");
    } else if (r.total) {
      step("DOB via roster GolfBox");
      sub(`${r.total} jogador(es): ${Object.entries(r.porFonte).map(([k, v]) => `${k}×${v}`).join(" · ")}`);
      console.log("");
    }
  }

  // 3. Identity matcher
  step("Identity matcher");
  let matchResult;
  try {
    const matcher = require("./resolution/identity-matcher");
    matchResult = matcher.resolve(rawSources, overrides);
    sub(`${matchResult.juniors.length} juniores resolvidos · ${matchResult.tournaments.length} torneios`);
    sub(`evidência: ${matchResult.stats.strong} fortes · ${matchResult.stats.probable} prováveis · ${matchResult.stats.manual} manuais`);
  } catch (err) {
    if (err.code === "MODULE_NOT_FOUND") {
      warn("identity-matcher ainda não existe — saltado. Output será cru (1 entrada por sourceKey).");
      matchResult = stubResolve(rawSources);
    } else {
      throw err;
    }
  }
  console.log("");

  // 3b. Enrichment — calcula campos derivados a partir do estado pós-matcher.
  //     Hoje: `extra.nationsCount` por torneio (precisa de junior.country/nationality).
  //     Mantém-se separado do matcher porque depende de cruzar juniors↔tournaments.
  step("Enrichment");
  try {
    const beforeNations = matchResult.tournaments.filter((t) => t.extra && typeof t.extra.nationsCount === "number").length;
    enrichTournaments(matchResult);
    const afterNations = matchResult.tournaments.filter((t) => t.extra && typeof t.extra.nationsCount === "number").length;
    sub(`extra.nationsCount: ${beforeNations} → ${afterNations} torneios`);
  } catch (err) {
    warn(`Enrichment falhou: ${err.message}`);
  }
  console.log("");

  // 4. Sanity checks
  step("Sanity checks");
  try {
    const sc = require("./validate/sanity-check");
    const result = sc.run(matchResult);
    if (result.passed) {
      ok(`${result.passedCount}/${result.totalCount} checks ok`);
    } else {
      fail(`${result.failedCount} checks falharam:`);
      for (const f of result.failures) fail(`  · ${f}`);
      if (!args.dryRun) {
        fail("Build abortado por sanity checks. Use --dry-run para inspecionar mesmo assim.");
        process.exit(2);
      }
    }
  } catch (err) {
    if (err.code === "MODULE_NOT_FOUND") {
      warn("sanity-check ainda não existe — saltado.");
    } else {
      throw err;
    }
  }
  console.log("");

  // 5. Escrever outputs
  step("Outputs");
  const generatedAt = new Date().toISOString();
  const juniorsOut = { schemaVersion: SCHEMA_VERSION, generatedAt, juniors: matchResult.juniors, stats: matchResult.stats };
  const tournamentsOut = { schemaVersion: SCHEMA_VERSION, generatedAt, tournaments: matchResult.tournaments };
  const catalog = buildCatalog(matchResult.tournaments);

  if (args.dryRun) {
    sub("--dry-run · não escreve");
  } else {
    writeJson(DATA.outJuniors, juniorsOut);
    sub(`${path.relative(process.cwd(), DATA.outJuniors)}: ${juniorsOut.juniors.length} juniores`);

    // Split juniors-tournaments em N partes para não bater no limite de 100MB
    // do GitHub. Shards escrevem-se compactos (sem indent) — são lidos só por
    // máquinas. Target conservador 75MB para deixar margem.
    const TARGET_SHARD_BYTES = 75 * 1024 * 1024;
    const sortedTourns = [...tournamentsOut.tournaments].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    );
    // Tamanho REAL em bytes de cada torneio quando serializado compacto
    const tournBytes = sortedTourns.map((t) =>
      Buffer.byteLength(JSON.stringify(t), "utf8") + 1, // +1 para vírgula
    );
    const totalBytes = tournBytes.reduce((a, b) => a + b, 0);
    const numShards = Math.max(2, Math.ceil(totalBytes / TARGET_SHARD_BYTES));
    const targetPerShard = Math.ceil(totalBytes / numShards);

    const parts = [];
    let cur = [];
    let curBytes = 0;
    for (let i = 0; i < sortedTourns.length; i++) {
      cur.push(sortedTourns[i]);
      curBytes += tournBytes[i];
      if (curBytes >= targetPerShard && parts.length < numShards - 1) {
        parts.push(cur);
        cur = [];
        curBytes = 0;
      }
    }
    if (cur.length > 0) parts.push(cur);

    // Manifest no juniors-tournaments.json (raiz)
    const shardFilenames = parts.map((_, i) =>
      `juniors-tournaments-${String(i).padStart(2, "0")}.json`,
    );
    const manifest = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt,
      sharded: true,
      shardCount: parts.length,
      shards: shardFilenames,
      totalTournaments: tournamentsOut.tournaments.length,
    };
    writeJson(DATA.outTournaments, manifest);
    sub(`${path.relative(process.cwd(), DATA.outTournaments)}: manifest com ${parts.length} shards`);

    // Helper para escrever compacto (sem indent)
    const fs = require("fs");
    for (let i = 0; i < parts.length; i++) {
      const shardPath = path.join(path.dirname(DATA.outTournaments), shardFilenames[i]);
      const payload = {
        schemaVersion: SCHEMA_VERSION,
        generatedAt,
        shardIndex: i,
        shardCount: parts.length,
        tournaments: parts[i],
      };
      const compact = JSON.stringify(payload); // sem indent — mínimo de bytes
      fs.writeFileSync(shardPath, compact + "\n", "utf8");
      const sizeMB = (Buffer.byteLength(compact, "utf8") / 1024 / 1024).toFixed(1);
      sub(`  ${shardFilenames[i]}: ${parts[i].length} torneios · ${sizeMB} MB`);
    }

    writeJson(DATA.outCatalog, catalog);
    sub(`${path.relative(process.cwd(), DATA.outCatalog)}: ${catalog.series.length} séries`);
  }
  console.log("");

  ok(bold("Done."));
}

/**
 * Stub usado quando identity-matcher ainda não existe.
 * Cria 1 junior por (sourceId, sourceKey) — sem cross-source merging.
 */
function stubResolve(rawSources) {
  const juniors = [];
  const tournaments = [];
  for (const src of rawSources) {
    for (const p of src.players) {
      juniors.push({
        id: `${src.sourceId}-${p.sourceKey}`,
        canonicalName: p.name,
        aliases: p.aliases || [],
        dob: p.dob,
        sex: p.sex,
        country: p.country,
        club: p.club,
        sources: { [src.sourceId]: { ...p } },
        tournamentIds: [],
        _match: { confidence: "strong", evidence: [`${src.sourceId}:${p.sourceKey}`], mergedFromSources: [src.sourceId] },
      });
    }
    for (const t of src.tournaments) {
      tournaments.push({
        id: `${src.sourceId}-${t.sourceKey}`,
        sourceId: src.sourceId,
        sourceKey: t.sourceKey,
        ...t,
      });
    }
  }
  return { juniors, tournaments, stats: { strong: juniors.length, probable: 0, manual: 0 } };
}

/**
 * Pós-processa matchResult para preencher campos derivados que requerem
 * cruzar juniors com tournaments. Modifica `matchResult.tournaments` in-place.
 *
 * Campos calculados:
 *   • tournament.extra.nationsCount — contagem de nacionalidades distintas entre
 *     os juniors que participaram. Útil para o peso de prestígio (USKids European
 *     Championship com ~17 nações vs. um torneio FPG local com 1).
 */
function enrichTournaments(matchResult) {
  const juniorById = new Map();
  for (const j of matchResult.juniors) juniorById.set(j.id, j);
  for (const t of matchResult.tournaments) {
    const nations = new Set();
    for (const f of t.flights || []) {
      for (const r of f.results || []) {
        const j = juniorById.get(r.juniorId);
        if (!j) continue;
        // Preferir `nationality` (passport) sobre `country` (residência)
        // porque para o peso de prestígio queremos diversidade de origem.
        const nat = j.nationality || j.country;
        if (nat) nations.add(String(nat).toUpperCase());
      }
    }
    if (nations.size > 0) {
      if (!t.extra) t.extra = {};
      t.extra.nationsCount = nations.size;
    }
  }
}

function buildCatalog(tournaments) {
  const bySeries = new Map();
  for (const t of tournaments) {
    if (!t.seriesId) continue;
    const cur = bySeries.get(t.seriesId) || {
      id: t.seriesId,
      label: t.seriesLabel || t.seriesId,
      sourceId: t.sourceId,
      tournamentIds: [],
      firstDate: null,
      lastDate: null,
    };
    cur.tournamentIds.push(t.id);
    const d = t.startDate || t.date;
    if (d) {
      if (!cur.firstDate || d < cur.firstDate) cur.firstDate = d;
      if (!cur.lastDate || d > cur.lastDate) cur.lastDate = d;
    }
    bySeries.set(t.seriesId, cur);
  }
  const series = Array.from(bySeries.values()).map((s) => ({ ...s, editionsCount: s.tournamentIds.length }));
  series.sort((a, b) => b.editionsCount - a.editionsCount);
  return { schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(), series };
}

if (require.main === module) {
  main().catch((err) => {
    fail("Crash:", err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

module.exports = { main };
