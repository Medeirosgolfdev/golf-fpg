#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Drill-down a um memberId USKids
 * --------------------------------
 * Mostra tudo o que sabemos sobre um mid, vindo de 3 fontes:
 *
 *   1) uskids-member-history-slim.json (golf-fpg) — name + torneios + strokes
 *   2) uskids-name-lookup.json (golf-fpg) — name + sources do cross-ref
 *   3) batches em uskids-golf — flight_players raw onde esse mid apareceu
 *      (procurando memberIds nos flights e tentando match)
 *
 * Útil para investigar casos suspeitos como o mid=489430 onde
 * member-history diz "Lucas Gilbart" mas o lookup descobriu "Matthew
 * Almajano". Mostra os strokes lado a lado e deixa-te confirmar qual
 * está certo.
 *
 * USO:
 *   cd C:\golf-fpg
 *   node scripts/drill-mid.js 489430
 *
 *   # caminho diferente para os batches
 *   node scripts/drill-mid.js 489430 --uskids-dir D:\backup\uskids-golf\public
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const argv = process.argv.slice(2);
function flag(name, def = null) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  return argv[i + 1] || def;
}
function bool(name) {
  return argv.includes(`--${name}`);
}

const TARGET_MID = argv.find((a) => /^\d+$/.test(a));
if (!TARGET_MID) {
  console.error("USO: node scripts/drill-mid.js <memberId> [flags]");
  console.error("Ex.: node scripts/drill-mid.js 489430");
  console.error("Flags:");
  console.error("  --full           mostra TODOS os players de cada flight (verboso)");
  console.error("  --out file.txt   grava o output em ficheiro (sem cores)");
  console.error("  --uskids-dir D:\\path\\public   localização dos batches");
  process.exit(1);
}

const FULL = bool("full");
const OUT_FILE = flag("out");
const _origLog = console.log;
const _outLines = [];
console.log = (...args) => {
  if (OUT_FILE) {
    _outLines.push(args.map(String).join(" "));
  } else {
    _origLog(...args);
  }
};
process.on("exit", () => {
  if (OUT_FILE) {
    fs.writeFileSync(OUT_FILE, _outLines.join("\n") + "\n", "utf-8");
    _origLog(`✅ Output gravado em ${OUT_FILE} (${_outLines.length} linhas)`);
  }
});

const USKIDS_DIR =
  process.env.USKIDS_GOLF_DIR ||
  flag("uskids-dir") ||
  "C:\\uskids-golf\\public";

const mhPath = path.join(ROOT, "public/data/uskids-member-history-slim.json");
const lookupPath = path.join(ROOT, "public/data/uskids-name-lookup.json");

function readJSON(p) {
  const t = fs.readFileSync(p, "utf-8");
  return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
}

function sep(t) {
  console.log("\n" + "=".repeat(70));
  console.log(t);
  console.log("=".repeat(70));
}

// ---------- 1. Member-history ----------
sep(`1/3  uskids-member-history-slim.json  (mid=${TARGET_MID})`);
const mh = readJSON(mhPath);
const mhEntry = mh.jogadores && mh.jogadores[TARGET_MID];
if (!mhEntry) {
  console.log("❌ mid não está no member-history-slim.");
} else {
  console.log(`Nome:       ${JSON.stringify(mhEntry.name)}`);
  console.log(`País:       ${mhEntry.country || "(n/a)"}`);
  console.log(`AgeGroup:   ${mhEntry.ageGroup || "(n/a)"}`);
  const torn = Object.entries(mhEntry.torneios || {});
  console.log(`Torneios:   ${torn.length}`);
  console.log();
  console.log(
    "  tcode    | torneio nome                                      | escalão     | pos | R1 strokes (gross)"
  );
  console.log("  " + "-".repeat(112));
  const tornCap = FULL ? torn.length : 10;
  for (const [tcode, t] of torn.slice(0, tornCap)) {
    const tInfo = (mh.torneios && mh.torneios[tcode]) || {};
    const nome = (tInfo.name || "(?)").slice(0, 48);
    const r1 = (t.rounds && (t.rounds["1"] || t.rounds[1])) || {};
    const strokes = Array.isArray(r1.strokes) ? r1.strokes.join(",") : "(no strokes)";
    const gross = r1.gross ?? "?";
    console.log(
      `  ${String(tcode).padStart(7)} | ${nome.padEnd(48)} | ${(t.ageGroup || "?").padEnd(11)} | ${String(t.place || "?").padStart(3)} | [${strokes}] (${gross})`
    );
  }
  if (torn.length > tornCap)
    console.log(`  ... +${torn.length - tornCap} torneios mais (--full para ver todos)`);
}

// ---------- 2. Lookup ----------
sep(`2/3  uskids-name-lookup.json  (mid=${TARGET_MID})`);
let lookupEntry = null;
try {
  const lookup = readJSON(lookupPath);
  lookupEntry = lookup.members && lookup.members[TARGET_MID];
  if (!lookupEntry) {
    console.log("❌ mid não está no lookup.");
  } else {
    console.log(`Nome:           ${JSON.stringify(lookupEntry.name)}`);
    console.log(`first/last:     ${lookupEntry.first} / ${lookupEntry.last}`);
    console.log(`País:           ${lookupEntry.country || "(n/a)"}`);
    console.log(`Cidade:         ${lookupEntry.place || "(n/a)"}`);
    console.log(`AgeGroup mais recente: ${lookupEntry.ageGroup_latest}`);
    console.log(`Aparições: ${lookupEntry.appearances}`);
    console.log(`Sources (${(lookupEntry.sources || []).length}):`);
    for (const s of lookupEntry.sources || []) {
      console.log(
        `   tcode=${String(s.tcode).padStart(7)}  year=${s.year}  ageGroup=${(s.ageGroup || "").padEnd(14)}  via ${s.method}`
      );
    }
  }
} catch (e) {
  console.log(`⚠ Erro a ler lookup: ${e.message}`);
}

// ---------- 3. Raw scrape do uskids-golf ----------
sep(`3/3  uskids-golf raw — flights onde mid=${TARGET_MID} aparece em memberIds[]`);
let foundAny = false;
let files;
try {
  files = fs
    .readdirSync(USKIDS_DIR)
    .filter((f) => /^batch_\d+\.json$/.test(f))
    .sort();
} catch (e) {
  console.log(`⚠ Não consegui ler ${USKIDS_DIR}: ${e.message}`);
  files = [];
}

for (const fn of files) {
  const fp = path.join(USKIDS_DIR, fn);
  let data;
  try {
    data = readJSON(fp);
  } catch {
    continue;
  }
  if (!Array.isArray(data)) continue;
  for (const torneio of data) {
    const tcode = String(torneio.signupanytime_t || "");
    if (!tcode) continue;
    for (const flight of torneio.flights || []) {
      const mids = (flight.memberIds || []).map(String);
      if (!mids.includes(TARGET_MID)) continue;
      foundAny = true;
      const fp_players = (flight.data && flight.data.flight_players) || {};
      const pidDirect = (flight.pid_to_member_id || {})[TARGET_MID];
      console.log(
        `\n📍 batch=${fn}  tcode=${tcode}  fid=${flight.flight_id}  escalão=${flight.flight_name}`
      );
      console.log(`   torneio: ${torneio.name}  (year ${torneio.year})`);
      console.log(
        `   flight tem ${mids.length} memberIds + ${Object.keys(fp_players).length} players com strokes`
      );
      if (pidDirect) {
        console.log(`   match directo: pid=${pidDirect}`);
      }
      // Para cada player no flight, mostrar nome + R1 strokes
      // (vamos sublinhar o que matches com o strokes do member-history para este tcode)
      const mhRoundForT =
        mhEntry &&
        mhEntry.torneios &&
        mhEntry.torneios[tcode] &&
        (mhEntry.torneios[tcode].rounds["1"] ||
          mhEntry.torneios[tcode].rounds[1]);
      const mhFp =
        mhRoundForT && Array.isArray(mhRoundForT.strokes)
          ? mhRoundForT.strokes.join(",")
          : null;
      if (mhFp) console.log(`   strokes do MH para este tcode R1: [${mhFp}]`);

      const entries = Object.entries(fp_players);
      // Calcula info por player
      const rows = entries.map(([pid, p]) => {
        const r1 = p.rounds && (p.rounds["1"] || p.rounds[1]);
        const strokes =
          r1 && Array.isArray(r1.strokes) ? r1.strokes.join(",") : null;
        const nome = `${p.first || ""} ${p.last || ""}`
          .trim()
          .replace(/\s+/g, " ");
        // Hamming distance vs strokes do MH (para ordenar candidatos)
        let dist = Infinity;
        if (mhFp && strokes) {
          const a = mhFp.split(",");
          const b = strokes.split(",");
          if (a.length === b.length) {
            dist = 0;
            for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) dist++;
          }
        }
        return {
          pid,
          nome,
          country: p.country || "??",
          place: p.place || "",
          strokes: strokes || "(no strokes)",
          isMatch: mhFp && strokes === mhFp,
          dist,
        };
      });

      const matches = rows.filter((r) => r.isMatch);
      let toShow;
      let extraMsg = "";
      if (FULL) {
        toShow = rows;
      } else {
        // Compacto: matches + top-3 mais próximos (por hamming) + 2 random extra para contexto
        const matched = matches;
        const near = rows
          .filter((r) => !r.isMatch && Number.isFinite(r.dist))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 3);
        toShow = [...matched, ...near];
        if (rows.length > toShow.length) {
          extraMsg = `   (mostrando ${toShow.length}/${rows.length} players — usa --full para todos)`;
        }
      }
      for (const r of toShow) {
        const tag = r.isMatch
          ? " ⭐ MATCH com MH"
          : Number.isFinite(r.dist)
          ? `  Δ=${r.dist}`
          : "";
        console.log(
          `     pid=${r.pid.padStart(7)}  ${r.nome.padEnd(28)} ${r.country.padEnd(3)} ${r.place.padEnd(24)}  [${r.strokes}]${tag}`
        );
      }
      if (extraMsg) console.log(extraMsg);
    }
  }
}

if (!foundAny) {
  console.log(
    `⚠ Não encontrei o mid=${TARGET_MID} em memberIds[] de nenhum flight scrapado.`
  );
  console.log(
    `  Significa que esse mid não foi capturado pelo GetTournamentPlayers em torneios que tens em batches.`
  );
}

// ---------- Diagnóstico ----------
sep(`Diagnóstico`);
if (mhEntry && lookupEntry) {
  if (mhEntry.name === lookupEntry.name) {
    console.log(`✓ Nomes concordam: "${mhEntry.name}"`);
  } else {
    console.log(`⚠ Nomes DIFEREM:`);
    console.log(`   member-history: "${mhEntry.name}"`);
    console.log(`   lookup:         "${lookupEntry.name}"`);
    console.log(
      `   → vê o secção 3 acima: o player no scrape raw cuja R1 ⭐ MATCH com MH é o "verdadeiro" mid=${TARGET_MID}`
    );
  }
} else if (lookupEntry && !mhEntry) {
  console.log(
    `ℹ Este mid só existe no lookup, não no member-history. Provavelmente um dos 51 "novos" que o cross-ref descobriu.`
  );
}
