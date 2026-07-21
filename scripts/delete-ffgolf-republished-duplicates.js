/**
 * scripts/delete-ffgolf-republished-duplicates.js
 *
 * Apaga os ficheiros de RE-PUBLICAÇÃO em public/data/ffgolf-resultats/ — o
 * mesmo evento que a FFG publicou com outro trnId (às vezes com nome diferente).
 * Complementa o dedup do build-ffgolf-resultats-index.js (que os esconde da
 * lista): aqui limpam-se os ficheiros do disco.
 *
 * SEGURO por construção: só apaga quando o conjunto de licenças é IDÊNTICO
 * (mesmíssimos jogadores) e as datas estão a ≤3 dias. Rosters só PARECIDOS
 * (ex: "Critérium Cadet" a partilhar jogadores com um GP) NÃO são tocados —
 * ficam listados como AMBÍGUOS para revisão manual.
 *
 * Canónico mantido = mais jogadores → mais ficheiros de liga → trnId menor
 * (a mesma regra do índice). Apaga TODOS os ficheiros (todas as ligas) dos
 * trnIds redundantes. Os ficheiros são git-tracked → reversível.
 *
 * USO:
 *   node scripts/delete-ffgolf-republished-duplicates.js            # dry-run (só lista)
 *   node scripts/delete-ffgolf-republished-duplicates.js --apply    # apaga
 */
"use strict";
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "../public/data/ffgolf-resultats");
const APPLY = process.argv.includes("--apply");

const parseDate = (s) => {
  const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
};
const dayDiff = (a, b) => { const x = parseDate(a), y = parseDate(b); return x && y ? Math.abs((x - y) / 864e5) : 99; };
const setEq = (A, B) => { if (A.size !== B.size) return false; for (const x of A) if (!B.has(x)) return false; return true; };

const files = fs.readdirSync(DIR).filter((f) => /^\d{1,2}-\d{1,2}-\d+\.json$/.test(f));
const byTrn = new Map();
for (const f of files) {
  const m = f.match(/^(\d{1,2})-(\d{1,2})-(\d+)\.json$/);
  const trnId = m[3];
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  if (!byTrn.has(trnId)) {
    const lics = new Set(); let np = 0;
    for (const s of (j.details?.series || [])) for (const p of (s.players || [])) { np++; if (p.license) lics.add(p.license); }
    byTrn.set(trnId, { trnId, files: [], date: j.date, name: j.name, np, lics, year: (parseDate(j.date) || {}).getFullYear?.() });
  }
  byTrn.get(trnId).files.push(f);
}

const T = [...byTrn.values()];
const used = new Set();
const toDelete = [];
const ambiguous = [];
for (let i = 0; i < T.length; i++) {
  if (used.has(i)) continue;
  const group = [T[i]];
  for (let k = i + 1; k < T.length; k++) {
    if (used.has(k)) continue;
    if (T[i].lics.size >= 5 && dayDiff(T[i].date, T[k].date) <= 3 && jaccard(T[i].lics, T[k].lics) >= 0.9) {
      group.push(T[k]); used.add(k);
    }
  }
  if (group.length < 2) continue;
  used.add(i);
  group.sort((a, b) => (b.np - a.np) || (b.files.length - a.files.length) || a.trnId.localeCompare(b.trnId));
  const keep = group[0];
  for (const t of group.slice(1)) {
    if (setEq(keep.lics, t.lics) && t.np === keep.np) toDelete.push({ keep, drop: t });
    else ambiguous.push({ keep, other: t });
  }
}

function jaccard(A, B) { if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); }

console.log(`\n🗑  RE-PUBLICAÇÕES a apagar: ${toDelete.length} trnIds redundantes\n`);
let nFiles = 0;
for (const { keep, drop } of toDelete) {
  console.log(`   ${drop.date} · ${drop.name.slice(0, 40)}`);
  console.log(`      manter  trn ${keep.trnId} (${keep.np} jog, ${keep.files.length} fich)`);
  console.log(`      APAGAR  trn ${drop.trnId} (${drop.np} jog): ${drop.files.join(", ")}`);
  nFiles += drop.files.length;
}
console.log(`\n   Total: ${nFiles} ficheiros de ${toDelete.length} trnIds redundantes.`);

if (ambiguous.length) {
  console.log(`\n⚠  AMBÍGUOS — NÃO tocados (rosters diferentes, rever à mão):`);
  for (const { keep, other } of ambiguous) {
    console.log(`   ${other.date} · ${other.name.slice(0, 40)}`);
    console.log(`      trn ${keep.trnId} (${keep.np} jog)  vs  trn ${other.trnId} (${other.np} jog) — jaccard ${jaccard(keep.lics, other.lics).toFixed(3)}`);
  }
}

if (!APPLY) {
  console.log(`\n(dry-run — corre com --apply para apagar)`);
  process.exit(0);
}
for (const { drop } of toDelete) for (const f of drop.files) fs.unlinkSync(path.join(DIR, f));
console.log(`\n✅ ${nFiles} ficheiros apagados. Corre agora: node scripts/build-ffgolf-resultats-index.js`);
