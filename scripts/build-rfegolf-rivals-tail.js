// auxiliar para regenerar tail do build-rfegolf-rivals.js
const fs = require("fs");
const path = require("path");
const main = path.resolve(__dirname, "build-rfegolf-rivals.js");
let s = fs.readFileSync(main, "utf-8");
// Localizar truncation
const idx = s.lastIndexOf("        par");
if (idx === -1) { console.log("no truncation marker"); process.exit(0); }
// Trim from "        par" (incomplete) onwards
s = s.slice(0, idx);
const tail = `        par, parTotal,
        meters,
        si,
        nholes: 18, nRounds,
        source: "nextcaddy",
        players: enriched,
      };
      ncEntriesAdded++;
      anyAdded = true;
    }
    if (anyAdded) ncKept++;
    else ncSkipped++;
  } catch (e) {
    ncSkipped++;
  }
}

// === Deduplicar player x tour NC ===
function normPlayerName(s) {
  return (s || "").toString().toLowerCase()
    .normalize("NFKD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[,.]/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}
const ncTids = Object.keys(out.torneios).filter(k => k.startsWith("nc"));
const byBase = {};
for (const tid of ncTids) {
  const m = tid.match(/^nc(\\d+)_/);
  if (!m) continue;
  (byBase[m[1]] = byBase[m[1]] || []).push(tid);
}
let dedupedPlayers = 0;
for (const base in byBase) {
  const tids = byBase[base];
  if (tids.length < 2) continue;
  const playerToTids = {};
  for (const tid of tids) {
    const t = out.torneios[tid];
    for (const p of (t.players || [])) {
      const k = normPlayerName(p.n);
      (playerToTids[k] = playerToTids[k] || []).push({ tid, ageGroup: t.ageGroup });
    }
  }
  for (const k in playerToTids) {
    const entries = playerToTids[k];
    if (entries.length < 2) continue;
    let best = entries[0];
    for (const e of entries) {
      if (ageSpecificity(e.ageGroup) > ageSpecificity(best.ageGroup)) best = e;
    }
    for (const e of entries) {
      if (e.tid === best.tid) continue;
      const t = out.torneios[e.tid];
      t.players = t.players.filter(pl => normPlayerName(pl.n) !== k);
      dedupedPlayers++;
    }
  }
}
for (const tid of ncTids) {
  if (out.torneios[tid] && (out.torneios[tid].players || []).length === 0) {
    delete out.torneios[tid];
  }
}

out.total = Object.keys(out.torneios).length;
out.dedupedPlayers = dedupedPlayers;
fs.writeFileSync(OUT, JSON.stringify(out));
const size = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
console.log("Built rfegolf-rivals: LGS " + lgsKept + "/" + (lgsKept + lgsSkipped) +
            ", NC " + ncKept + " files (" + ncEntriesAdded + " cats) -> " +
            out.total + " torneios, " + dedupedPlayers + " dedup -> " + OUT + " (" + size + " MB)");
`;
fs.writeFileSync(main, s + tail);
console.log("Restored. Lines:", (s + tail).split("\n").length);
