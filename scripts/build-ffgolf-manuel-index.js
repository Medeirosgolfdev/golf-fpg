/**
 * build-ffgolf-manuel-index.js — Índice sparse Manuel/PT dos torneios FFG-Resultats.
 *
 * Lê todos os ficheiros `public/data/ffgolf-resultats/*.json` (≈1607, 168 MB) e
 * marca, por torneio (trnId), se há o Manuel (`m`) e/ou jogadores portugueses
 * (`pt`). Output pequeno (`public/data/ffgolf-manuel-index.json`) consumido pela
 * FFGPage (CircuitShell) para o filtro Manuel/PT da LISTA — sem ter de carregar
 * os 168 MB de detalhe (que continua lazy, por torneio).
 *
 * Correr após actualizar o índice de resultados FFG.
 *   node scripts/build-ffgolf-manuel-index.js
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "public", "data", "ffgolf-resultats");
const IDXFILE = path.join(__dirname, "..", "public", "data", "ffgolf-resultats-index.json");
const OUT = path.join(__dirname, "..", "public", "data", "ffgolf-manuel-index.json");

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const isM = (n) => { const x = norm(n); return /manuel/.test(x) && /(medeiros|goulart)/.test(x); };
const PT_EXC = [["castro", "ferreira", "ricardo"]];
const isPTname = (n) => { const x = norm(n); return PT_EXC.some((t) => t.every((w) => x.includes(w))); };
const isPTnat = (nat, flag) => /^(prt|por|pt|portugal)$/i.test(String(nat || flag || "").trim());

function main() {
  const idx = JSON.parse(fs.readFileSync(IDXFILE, "utf8"));
  const tournaments = {};
  const seen = new Set();
  let ok = 0, withM = 0, withPt = 0;

  for (const t of idx.tournaments) {
    if (seen.has(t.trnId)) continue;
    seen.add(t.trnId);
    let f;
    try { f = JSON.parse(fs.readFileSync(path.join(DIR, t.file), "utf8")); } catch { continue; }
    let m = false, pt = false;
    for (const s of (f.details && f.details.series) || []) {
      for (const p of s.players || []) {
        if (!m && isM(p.name)) m = true;
        if (!pt && (isPTnat(p.nationality, p.flag) || isPTname(p.name))) pt = true;
        if (m && pt) break;
      }
      if (m && pt) break;
    }
    if (m || pt) tournaments[t.trnId] = { ...(m ? { m: true } : {}), ...(pt ? { pt: true } : {}) };
    ok++; if (m) withM++; if (pt) withPt++;
  }

  fs.writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), tournaments }));
  console.log(`scanned ${ok} torneios · Manuel ${withM} · PT ${withPt} → ${OUT}`);
}

main();
