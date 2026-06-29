/**
 * scripts/infer-nextcaddy-par.js
 *
 * NextCaddy nao expoe par/SI/metros do campo. Mas como temos scores hole-by-hole
 * de muitos jogadores e o `total + toPar` revela o par total da volta, podemos
 * inferir o par de cada buraco usando a moda/mediana dos scores dos top finishers.
 *
 * Heuristica:
 *   1. Para cada torneio + ronda, obter par_total = total - toPar (moda entre top jogadores)
 *   2. Para cada buraco, calcular mediana arredondada dos top-50% scores (excluindo NaN/0)
 *   3. Discretizar mediana em par 3/4/5
 *   4. Ajustar para fechar com par_total
 *
 * Output: actualiza `course.par` em cada `public/data/nextcaddy/{tourId}.json`.
 *
 * Uso: node scripts/infer-nextcaddy-par.js [--dry] [--verbose]
 */

const fs = require("fs");
const path = require("path");

const NC_DIR = path.resolve(__dirname, "../public/data/nextcaddy");
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const VERBOSE = args.includes("--verbose");

if (!fs.existsSync(NC_DIR)) {
  console.error("public/data/nextcaddy nao existe.");
  process.exit(1);
}

function inferParTotalForRound(roundEntries, nHoles) {
  const min = nHoles === 9 ? 27 : 60;
  const max = nHoles === 9 ? 40 : 80;
  const counts = new Map();
  for (const r of roundEntries) {
    if (typeof r.total === "number" && typeof r.toPar === "number") {
      const pt = r.total - r.toPar;
      if (pt >= min && pt <= max) {
        counts.set(pt, (counts.get(pt) || 0) + 1);
      }
    }
  }
  if (counts.size === 0) return null;
  let best = null, bestN = 0;
  for (const [pt, n] of counts) {
    if (n > bestN) { best = pt; bestN = n; }
  }
  return best;
}

// Infere só o PAR TOTAL a partir de (total, toPar) — para torneios sem scores
// buraco-a-buraco. Tenta 18 buracos (par plausível 60-80), depois 9 (27-40).
function inferParTotalAny(entries) {
  if (!entries.length) return null;
  for (const nHoles of [18, 9]) {
    const pt = inferParTotalForRound(entries, nHoles);
    if (pt != null) {
      const agree = entries.filter((e) => e.total - e.toPar === pt).length / entries.length;
      return { parTotal: pt, confidence: agree >= 0.8 ? "total-high" : "total-low" };
    }
  }
  return null;
}

function inferParPerHole(scoresMatrix, parTotal) {
  if (!scoresMatrix.length) return null;
  const nHoles = scoresMatrix[0].length;
  if (nHoles !== 9 && nHoles !== 18) return null;

  const ranked = scoresMatrix
    .map((scores) => ({ scores, gross: scores.reduce((a, b) => a + (b > 0 ? b : 0), 0) }))
    .filter((r) => r.gross > 0)
    .sort((a, b) => a.gross - b.gross);
  const topN = Math.max(3, Math.ceil(ranked.length * 0.5));
  const top = ranked.slice(0, topN);

  const medians = [];
  for (let h = 0; h < nHoles; h++) {
    const vals = top.map((r) => r.scores[h]).filter((v) => typeof v === "number" && v > 0).sort((a, b) => a - b);
    if (!vals.length) return null;
    const mid = vals[Math.floor(vals.length / 2)];
    medians.push(mid);
  }

  const par = medians.map((m) => {
    if (m <= 3) return 3;
    if (m <= 4) return 4;
    if (m <= 5) return 4;
    return 5;
  });

  if (parTotal != null) {
    let sum = par.reduce((a, b) => a + b, 0);
    let diff = parTotal - sum;
    if (diff !== 0) {
      const candidates = par.map((p, i) => ({ i, p, m: medians[i] }));
      if (diff > 0) {
        const upgradeable = candidates
          .filter((c) => par[c.i] === 4 && c.m >= 5)
          .sort((a, b) => b.m - a.m);
        for (const c of upgradeable) {
          if (diff <= 0) break;
          par[c.i] = 5; diff--;
        }
        if (diff > 0) {
          const up3 = candidates.filter((c) => par[c.i] === 3 && c.m >= 4).sort((a, b) => b.m - a.m);
          for (const c of up3) {
            if (diff <= 0) break;
            par[c.i] = 4; diff--;
          }
        }
      } else if (diff < 0) {
        const downgradeable = candidates
          .filter((c) => par[c.i] === 5 && c.m <= 5.5)
          .sort((a, b) => a.m - b.m);
        for (const c of downgradeable) {
          if (diff >= 0) break;
          par[c.i] = 4; diff++;
        }
        if (diff < 0) {
          const down4 = candidates.filter((c) => par[c.i] === 4 && c.m <= 3.5).sort((a, b) => a.m - b.m);
          for (const c of down4) {
            if (diff >= 0) break;
            par[c.i] = 3; diff++;
          }
        }
      }
    }
    if (diff !== 0) return { par, parTotal, sum: par.reduce((a, b) => a + b, 0), confidence: "low" };
    return { par, parTotal, sum: parTotal, confidence: "high" };
  }

  return { par, parTotal: par.reduce((a, b) => a + b, 0), sum: par.reduce((a, b) => a + b, 0), confidence: "medium" };
}

const files = fs.readdirSync(NC_DIR).filter((f) => /^\d+\.json$/.test(f));
let updated = 0, skipped = 0, errors = 0, totalOnly = 0;
const lowConfidence = [];

for (const file of files) {
  const fpath = path.join(NC_DIR, file);
  let j;
  try {
    j = JSON.parse(fs.readFileSync(fpath, "utf-8"));
  } catch (e) {
    console.warn("Bad JSON:", file);
    errors++;
    continue;
  }

  // ⚠ Pitch & Putt → TODOS os buracos par 3. Inferir par dos SCORES das crianças
  // (HCP 54, muitos 5-7 num par-3) dava 4/5 e inventava um par-total errado (ex:
  // tour 71286 "ESCUELA INFANTIL P&P" → par 40 em vez de 27). Detecta por
  // nome/formato OU por TODOS os buracos serem curtos (≤150 m = campo par-3) e
  // força par 3. A distância manda sobre os scores.
  {
    const nm = j.course && Array.isArray(j.course.meters) ? j.course.meters : null;
    const txt = `${(j.meta && j.meta.name) || ""} ${(j.meta && j.meta.format) || ""} ${(j.meta && j.meta.course) || ""}`.toLowerCase();
    const isPnP = /p\s*&\s*p\b|p\s*y\s*p\b|pitch\s*&?\s*putt|pitch\s+and\s+putt/.test(txt)
      || (nm && nm.length > 0 && nm.every((m) => typeof m === "number" && m > 0 && m <= 150));
    let nh = nm && (nm.length === 9 || nm.length === 18) ? nm.length : 0;
    if (!nh) {
      for (const cat of j.leaderboard || []) {
        for (const p of cat.players || []) {
          for (const rs of p.roundScores || []) {
            if (Array.isArray(rs.scores) && (rs.scores.length === 9 || rs.scores.length === 18)) { nh = rs.scores.length; break; }
          }
          if (nh) break;
        }
        if (nh) break;
      }
    }
    if (isPnP && nh) {
      if (!j.course) j.course = {};
      j.course.par = new Array(nh).fill(3);
      j.course.parTotal = nh * 3;
      j.course.parInferred = true;
      j.course.parConfidence = "high";
      if (j.course.si === undefined) j.course.si = null;
      if (j.course.meters === undefined) j.course.meters = null;
      if (!DRY) fs.writeFileSync(fpath, JSON.stringify(j, null, 2));
      updated++;
      continue;
    }
  }

  const roundsMap = new Map();
  for (const cat of j.leaderboard || []) {
    for (const p of cat.players || []) {
      for (const rs of p.roundScores || []) {
        if (!Array.isArray(rs.scores) || rs.scores.length === 0) continue;
        const r = rs.round;
        if (!roundsMap.has(r)) roundsMap.set(r, { scoresMatrix: [], entries: [] });
        const slot = roundsMap.get(r);
        slot.scoresMatrix.push(rs.scores);
        if (typeof rs.total === "number" && typeof p.toPar === "number") {
          slot.entries.push({ total: rs.total, toPar: p.toPar });
        }
      }
    }
  }

  if (roundsMap.size === 0) {
    // Sem scores buraco-a-buraco → tentar inferir pelo menos o PAR TOTAL a
    // partir de (total, toPar) do leaderboard. Dá o par do campo ao cabeçalho
    // e às cores de total, mesmo sem o par por buraco. Não sobrescreve um par
    // por buraco real já existente.
    const flat = [];
    for (const cat of j.leaderboard || []) {
      for (const p of cat.players || []) {
        let total = typeof p.total === "number" ? p.total : null;
        if (total == null && Array.isArray(p.roundScores)) {
          const t = p.roundScores.find((rs) => typeof rs.total === "number");
          if (t) total = t.total;
        }
        if (typeof total === "number" && typeof p.toPar === "number") flat.push({ total, toPar: p.toPar });
      }
    }
    const pt = inferParTotalAny(flat);
    if (pt && !(j.course && Array.isArray(j.course.par))) {
      if (!j.course) j.course = {};
      j.course.parTotal = pt.parTotal;
      j.course.parInferred = true;
      j.course.parConfidence = pt.confidence; // total-high | total-low
      if (j.course.si === undefined) j.course.si = null;
      if (j.course.meters === undefined) j.course.meters = null;
      if (!DRY) fs.writeFileSync(fpath, JSON.stringify(j, null, 2));
      updated++;
      totalOnly++;
    } else {
      skipped++;
    }
    continue;
  }

  const sortedRounds = [...roundsMap.entries()].sort((a, b) => b[1].scoresMatrix.length - a[1].scoresMatrix.length);
  const bestData = sortedRounds[0][1];
  const nHoles = bestData.scoresMatrix[0].length;
  const parTotal = inferParTotalForRound(bestData.entries, nHoles);
  const result = inferParPerHole(bestData.scoresMatrix, parTotal);

  if (!result) {
    skipped++;
    continue;
  }

  if (!j.course) j.course = {};
  j.course.par = result.par;
  j.course.parTotal = result.parTotal;
  j.course.parInferred = true;
  j.course.parConfidence = result.confidence;
  if (j.course.si === undefined) j.course.si = null;
  if (j.course.meters === undefined) j.course.meters = null;

  if (!DRY) {
    fs.writeFileSync(fpath, JSON.stringify(j, null, 2));
  }
  updated++;
  if (result.confidence !== "high") {
    lowConfidence.push({ file, conf: result.confidence, sum: result.sum, parTotal });
  }
  if (VERBOSE) {
    console.log("  " + file + ": par=[" + result.par.join(",") + "] total=" + result.parTotal + " conf=" + result.confidence);
  }
}

console.log("\nNextCaddy par inference: " + updated + " updated (" + totalOnly + " só par-total), " + skipped + " skipped, " + errors + " errors");
if (lowConfidence.length) {
  console.log("\nLow/medium confidence (" + lowConfidence.length + "):");
  for (const lc of lowConfidence.slice(0, 10)) {
    console.log("  " + lc.file + ": conf=" + lc.conf + " sum=" + lc.sum + " parTotal=" + lc.parTotal);
  }
}
if (DRY) console.log("(--dry: nenhuns ficheiros alterados)");
