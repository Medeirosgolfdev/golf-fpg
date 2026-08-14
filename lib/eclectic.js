// lib/eclectic.js — Eclectic score computation
const { toNum, isMeaningful } = require("./helpers");
const { normKey } = require("./tee-colors");

function computeEclecticForTee(roundRecs, teeName) {
  if (!roundRecs.length) return null;

  const holeCount = Math.max(...roundRecs.map(x => x.holeCount || 18));
  const holes = Array.from({ length: holeCount }, (_, i) => i + 1);

  const par = holes.map(h => {
    for (const rr of roundRecs) {
      const v = toNum(rr.rec?.[`par_${h}`]);
      if (isMeaningful(v)) return v;
    }
    return null;
  });

  const si = holes.map(h => {
    for (const rr of roundRecs) {
      const v = toNum(rr.rec?.[`stroke_index_${h}`]);
      if (isMeaningful(v)) return v;
    }
    return null;
  });

  const best = holes.map(h => {
    let bestVal = null;
    let bestFrom = null;
    let bestPar = null;
    for (const rr of roundRecs) {
      const v = toNum(rr.rec?.[`gross_${h}`]);
      if (!isMeaningful(v)) continue;
      if (bestVal == null || v < bestVal) {
        bestVal = v;
        bestFrom = { scoreId: rr.scoreId, date: rr.date || "" };
        // Par da PRÓPRIA volta do best: o mesmo tee pode ser jogado com pares
        // diferentes (a organização pode alterar o par de um buraco entre
        // edições — ex. Padierna hole 10 par 4 em 2025, par 5 em 2026). Sem
        // isto, um birdie feito no ano do par 4 aparecia como eagle no eclético.
        const p = toNum(rr.rec?.[`par_${h}`]);
        bestPar = isMeaningful(p) ? p : null;
      }
    }
    return { h, best: bestVal, par: bestPar ?? par[h - 1], from: bestFrom };
  });

  const playedHoles = best.filter(x => isMeaningful(x.best)).length;
  if (playedHoles < Math.min(6, holeCount)) return null;

  const totalGross = best.reduce((a, x) => a + (Number(x.best) || 0), 0);
  // Somar os pares das voltas dos bests (coerente com as células), não o par[]
  // de referência — podem diferir quando o par mudou entre edições.
  const totalPar = best.reduce((a, x) => a + (Number(x.par) || 0), 0);
  const toPar = (Number.isFinite(totalGross) && Number.isFinite(totalPar)) ? (totalGross - totalPar) : null;

  const wins = {};
  for (const h of best) {
    const sid = h?.from?.scoreId;
    if (!sid) continue;
    wins[sid] = (wins[sid] || 0) + 1;
  }

  return { teeName, teeKey: normKey(teeName), holeCount, totalGross, totalPar, toPar, holes: best, si, wins };
}

module.exports = { computeEclecticForTee };
