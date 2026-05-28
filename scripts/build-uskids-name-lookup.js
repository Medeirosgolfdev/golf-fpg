#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Cross-reference uskids-golf ↔ golf-fpg
 * --------------------------------------
 * Lê os batches enriquecidos do uskids-golf (que têm names + memberIds[] por
 * flight) e o uskids-member-history-slim.json do golf-fpg (que tem
 * strokes por memberId por torneio), e produz um lookup
 * memberId → {name, country, place, ...} via matching por strokes
 * fingerprint dentro de cada (tcode, flight).
 *
 * Output: public/data/uskids-name-lookup.json (em golf-fpg).
 *
 * USO:
 *   cd C:\golf-fpg
 *
 *   # default: lê C:\uskids-golf\public\batch_*.json
 *   node scripts/build-uskids-name-lookup.js
 *
 *   # caminho diferente para os batches
 *   node scripts/build-uskids-name-lookup.js --uskids-dir D:\backup\uskids-golf\public
 *
 *   # ou via env var
 *   $env:USKIDS_GOLF_DIR = "D:\backup\uskids-golf\public"
 *   node scripts/build-uskids-name-lookup.js
 *
 *   # debug verboso
 *   node scripts/build-uskids-name-lookup.js --verbose
 *
 *   # dry-run (mostra stats sem escrever output)
 *   node scripts/build-uskids-name-lookup.js --dry-run
 *
 * INTEGRAÇÃO com KIDSdataLoader.ts (sugestão):
 *   Após build, carregar uskids-name-lookup.json e, para cada rival com
 *   name === "?", substituir por lookup.members[mid].name se existir.
 *   Permite preencher dezenas de nomes desconhecidos.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const USKIDS_DIR =
  process.env.USKIDS_GOLF_DIR ||
  flag("uskids-dir", null) ||
  "C:\\uskids-golf\\public";
const MEM_HISTORY_PATH = path.join(
  ROOT,
  "public/data/uskids-member-history-slim.json"
);
const OUTPUT_PATH = path.join(ROOT, "public/data/uskids-name-lookup.json");

const VERBOSE = bool("verbose");
const DRY_RUN = bool("dry-run");

// ---------- CLI ----------
function flag(name, def = null) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const next = argv[i + 1];
  if (!next || next.startsWith("--")) return true;
  return next;
}
function bool(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

async function readJSON(p) {
  const t = await fs.readFile(p, "utf-8");
  return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
}

// ---------- Step 1: indexar member-history-slim ----------
// Output: Map<memberId, Map<tcode, fingerprintR1>>
// onde fingerprintR1 = strokes da ronda 1 joined com ','
async function indexMemberHistory(path) {
  console.log(`A ler member-history-slim de ${path}...`);
  const mh = await readJSON(path);
  console.log(
    `  ${Object.keys(mh.jogadores || {}).length} jogadores, ${Object.keys(mh.torneios || {}).length} torneios`
  );

  const known = {};
  let nMids = 0;
  let nFingerprints = 0;
  let unknownNames = 0;

  for (const [mid, p] of Object.entries(mh.jogadores || {})) {
    if (!p) continue;
    if (!p.name || p.name === "?" || p.name === "") unknownNames++;
    const torn = p.torneios || {};
    let hasAny = false;
    for (const [tcode, t] of Object.entries(torn)) {
      const rds = (t && t.rounds) || {};
      const r1 = rds["1"] || rds[1];
      if (!r1 || !Array.isArray(r1.strokes) || r1.strokes.length === 0) continue;
      // Strokes vêm com zeros para buracos não jogados (9H) — manter como está
      // porque é assim que o uskids-golf as armazena também
      const fp = r1.strokes.join(",");
      if (!known[mid]) known[mid] = {};
      known[mid][String(tcode)] = fp;
      hasAny = true;
      nFingerprints++;
    }
    if (hasAny) nMids++;
  }

  console.log(
    `  ${nMids} memberIds com strokes utilizáveis (${nFingerprints} fingerprints totais)`
  );
  console.log(
    `  ${unknownNames} memberIds em member-history-slim ainda têm name="?" → alvos do lookup`
  );

  return { known, mh, unknownNames };
}

// ---------- Step 2: para cada flight, fazer matching ----------
function processFlight(flight, tcode, torneio, mhIndex, lookup, stats) {
  const memberIds = (flight.memberIds || []).map(String);
  const flight_players =
    (flight.data && flight.data.flight_players) || {};
  const pidToMid = flight.pid_to_member_id || {};

  if (memberIds.length === 0 || Object.keys(flight_players).length === 0) {
    stats.flightsSkippedEmpty++;
    return;
  }
  stats.flightsProcessed++;

  // Build fingerprint → memberId from member-history (para este tcode)
  const fpToMid = new Map();
  for (const mid of memberIds) {
    const tcs = mhIndex[mid];
    if (!tcs) continue;
    const fp = tcs[tcode];
    if (!fp) continue;
    if (fpToMid.has(fp)) {
      fpToMid.set(fp, "__COLLISION__");
    } else {
      fpToMid.set(fp, mid);
    }
  }
  stats.fingerprintsInFlights += fpToMid.size;

  // Para cada player tentar encontrar o mid
  for (const [pid, p] of Object.entries(flight_players)) {
    const name = `${p.first || ""} ${p.last || ""}`.trim();
    if (!name) continue;

    // Direct match (raro — flight_players quase nunca tem node_id)
    const directMid = pidToMid[pid];
    if (directMid) {
      record(lookup, directMid, p, torneio, flight, "pid_direct");
      stats.viaPidDirect++;
      continue;
    }

    // Strokes fingerprint match (caminho principal)
    const r1 = p.rounds && (p.rounds["1"] || p.rounds[1]);
    if (!r1 || !Array.isArray(r1.strokes) || r1.strokes.length === 0) {
      stats.playersSkippedNoStrokes++;
      continue;
    }
    const fp = r1.strokes.join(",");
    const mid = fpToMid.get(fp);
    if (mid && mid !== "__COLLISION__") {
      record(lookup, mid, p, torneio, flight, "strokes");
      stats.viaStrokes++;
    } else if (mid === "__COLLISION__") {
      stats.playersCollision++;
    } else {
      stats.playersNoMatch++;
    }
  }
}

// Normaliza nome: trim + colapsa whitespace interno (alguns first/last vêm
// com espaço trailing/leading no scrape, gerando "Ken  Fernandes" em vez
// de "Ken Fernandes")
function joinName(first, last) {
  return `${first || ""} ${last || ""}`.trim().replace(/\s+/g, " ");
}

function record(lookup, mid, p, torneio, flight, method) {
  const name = joinName(p.first, p.last);
  const src = {
    tcode: String(torneio.signupanytime_t || ""),
    year: torneio.year || null,
    ageGroup: flight.flight_name || null,
    method,
  };
  const first = (p.first || "").trim() || null;
  const last = (p.last || "").trim() || null;
  const existing = lookup.get(mid);
  if (!existing) {
    lookup.set(mid, {
      name,
      first,
      last,
      country: p.country || null,
      place: p.place || null,
      ageGroup_latest: flight.flight_name || null,
      year_latest: torneio.year || null,
      appearances: 1,
      sources: [src],
    });
    return;
  }
  existing.appearances++;
  existing.sources.push(src);
  if ((torneio.year || 0) > (existing.year_latest || 0)) {
    existing.year_latest = torneio.year;
    existing.ageGroup_latest = flight.flight_name || existing.ageGroup_latest;
    // Mantém o nome mais recente (mais provável estar bem escrito)
    if (name) existing.name = name;
    if (first) existing.first = first;
    if (last) existing.last = last;
    if (p.country) existing.country = p.country;
    if (p.place) existing.place = p.place;
  }
}

// ---------- Main ----------
(async () => {
  // 1. Index member-history
  const { known: mhIndex, mh, unknownNames } = await indexMemberHistory(
    MEM_HISTORY_PATH
  );

  // 2. Iterar batches
  console.log(`\nA ler batches de ${USKIDS_DIR}...`);
  const files = (await fs.readdir(USKIDS_DIR))
    .filter((f) => /^batch_\d+\.json$/.test(f))
    .sort();
  console.log(`  ${files.length} batches encontrados`);

  const lookup = new Map();
  const stats = {
    batches: files.length,
    tornProcessed: 0,
    flightsProcessed: 0,
    flightsSkippedEmpty: 0,
    fingerprintsInFlights: 0,
    viaStrokes: 0,
    viaPidDirect: 0,
    playersCollision: 0,
    playersNoMatch: 0,
    playersSkippedNoStrokes: 0,
  };

  for (const fn of files) {
    const fp = path.join(USKIDS_DIR, fn);
    const data = await readJSON(fp);
    if (!Array.isArray(data)) continue;
    for (const torneio of data) {
      const tcode = String(torneio.signupanytime_t || "");
      if (!tcode) continue;
      const flights = Array.isArray(torneio.flights) ? torneio.flights : [];
      stats.tornProcessed++;
      for (const flight of flights) {
        processFlight(flight, tcode, torneio, mhIndex, lookup, stats);
      }
    }
    if (VERBOSE) console.log(`  ${fn}: cumulativo ${lookup.size} mids resolvidos`);
  }

  console.log("\n========== RESULTADOS ==========");
  console.log(`Torneios processados: ${stats.tornProcessed}`);
  console.log(
    `Flights: ${stats.flightsProcessed} processados, ${stats.flightsSkippedEmpty} skip (sem memberIds ou sem players)`
  );
  console.log(
    `Fingerprints disponíveis nos flights (memberId×tcode): ${stats.fingerprintsInFlights}`
  );
  console.log(`Matches obtidos:`);
  console.log(`  ✅ via strokes:    ${stats.viaStrokes}`);
  console.log(`  ✅ via pid direct: ${stats.viaPidDirect}`);
  console.log(`  ⚠  colisão strokes: ${stats.playersCollision}`);
  console.log(`  ❌ sem match:      ${stats.playersNoMatch}`);
  console.log(`  ⏭️  sem strokes:    ${stats.playersSkippedNoStrokes}`);
  console.log(`\nmemberIds únicos resolvidos: ${lookup.size}`);

  // Cross-check com member-history
  let mhResolved = 0;
  let mhNewNames = 0;
  for (const [mid, entry] of lookup) {
    const j = mh.jogadores && mh.jogadores[mid];
    if (j) {
      mhResolved++;
      if (!j.name || j.name === "?" || j.name === "") mhNewNames++;
    }
  }
  console.log(
    `Cross-check com member-history-slim:`
  );
  console.log(`  ${mhResolved} mids no lookup também estão no member-history`);
  console.log(
    `  ${mhNewNames} desses tinham name="?" em member-history → ganham nome via lookup`
  );
  console.log(
    `  (member-history tinha ${unknownNames} "?" no total — restam ${unknownNames - mhNewNames})`
  );

  if (DRY_RUN) {
    console.log("\n--- DRY RUN — não escrevi o output ---");
    return;
  }

  // 3. Escrever output
  const out = {
    _meta: {
      generated_at: new Date().toISOString(),
      source_batches: files.length,
      source_dir: USKIDS_DIR,
      member_history: path.basename(MEM_HISTORY_PATH),
      stats,
      member_history_unknown_before: unknownNames,
      member_history_new_names: mhNewNames,
    },
    members: Object.fromEntries(
      [...lookup.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    ),
  };

  // Compacto — este ficheiro pode vir a ser servido em runtime ao browser
  // se for integrado no KIDSdataLoader. Manter pequeno.
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(out), "utf-8");
  console.log(`\n💾 Output: ${OUTPUT_PATH}`);
  console.log(`   ${(await fs.stat(OUTPUT_PATH)).size} bytes (formato compacto)`);
})();
