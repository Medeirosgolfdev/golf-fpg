// lib/hole-stats.js — Per-hole analysis (course+tee)
const { toNum, isMeaningful } = require("./helpers");
const { normKey } = require("./tee-colors");

function computeHoleStats(roundRecs, teeName) {
  if (roundRecs.length < 2) return null;

  const holeCount = Math.max(...roundRecs.map(x => x.holeCount || 18));
  const holes = [];
  for (let h = 1; h <= holeCount; h++) {
    const par = (() => { for (const rr of roundRecs) { const v = toNum(rr.rec?.[`par_${h}`]); if (isMeaningful(v)) return v; } return null; })();
    const si = (() => { for (const rr of roundRecs) { const v = toNum(rr.rec?.[`stroke_index_${h}`]); if (isMeaningful(v)) return v; } return null; })();
    const scores = [];
    for (const rr of roundRecs) {
      const v = toNum(rr.rec?.[`gross_${h}`]);
      if (isMeaningful(v)) scores.push(v);
    }
    if (!scores.length) { holes.push({ h, par, si, n: 0 }); continue; }
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const best = Math.min(...scores);
    const worst = Math.max(...scores);
    const dist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0 };
    if (par != null) {
      for (const s of scores) {
        const d = s - par;
        if (d <= -2) dist.eagle++;
        else if (d === -1) dist.birdie++;
        else if (d === 0) dist.par++;
        else if (d === 1) dist.bogey++;
        else if (d === 2) dist.double++;
        else dist.triple++;
      }
    }
    const strokesLost = par != null ? Math.round((avg - par) * 100) / 100 : 0;
    holes.push({ h, par, si, n: scores.length, avg: Math.round(avg * 100) / 100, best, worst, dist, strokesLost });
  }
  // Totals distribution
  const totalDist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, total: 0 };
  for (const hd of holes) {
    if (!hd.dist) continue;
    for (const k of Object.keys(totalDist)) { if (k !== 'total') totalDist[k] += hd.dist[k]; }
  }
  totalDist.total = totalDist.eagle + totalDist.birdie + totalDist.par + totalDist.bogey + totalDist.double + totalDist.triple;

  // By par type (Par 3, 4, 5)
  const byParType = {};
  for (const hd of holes) {
    if (hd.par == null || hd.n === 0) continue;
    const pt = hd.par;
    if (!byParType[pt]) byParType[pt] = { par: pt, holes: [], totalN: 0, sumAvg: 0, sumStrokesLost: 0, dist: { eagle:0, birdie:0, par:0, bogey:0, double:0, triple:0 } };
    const g = byParType[pt];
    g.holes.push(hd);
    g.totalN += hd.n;
    g.sumAvg += hd.avg * hd.n;
    g.sumStrokesLost += hd.strokesLost;
    if (hd.dist) { for (const k of Object.keys(g.dist)) g.dist[k] += hd.dist[k]; }
  }
  for (const pt of Object.keys(byParType)) {
    const g = byParType[pt];
    g.avg = g.totalN ? Math.round(g.sumAvg / g.totalN * 100) / 100 : null;
    g.avgVsPar = g.avg != null ? Math.round((g.avg - g.par) * 100) / 100 : null;
    g.strokesLostPerRound = Math.round(g.sumStrokesLost * 100) / 100;
    g.nHoles = g.holes.length;
    g.parOrBetterPct = g.totalN ? Math.round((g.dist.eagle + g.dist.birdie + g.dist.par) / g.totalN * 1000) / 10 : 0;
    g.doubleOrWorsePct = g.totalN ? Math.round((g.dist.double + g.dist.triple) / g.totalN * 1000) / 10 : 0;
  }

  // Front 9 vs Back 9 (only for 18-hole)
  let f9b9 = null;
  if (holeCount === 18) {
    const makeHalf = (start, end) => {
      const hh = holes.slice(start, end).filter(h => h.n > 0 && h.par != null);
      const sumSL = hh.reduce((a, h) => a + h.strokesLost, 0);
      const sumPar = hh.reduce((a, h) => a + h.par, 0);
      const dblPct = (() => {
        let tot = 0, dbl = 0;
        for (const h of hh) { if (h.dist) { tot += h.n; dbl += h.dist.double + h.dist.triple; } }
        return tot ? Math.round(dbl / tot * 1000) / 10 : 0;
      })();
      return { strokesLost: Math.round(sumSL * 100) / 100, par: sumPar, dblPct };
    };
    f9b9 = { f9: makeHalf(0, 9), b9: makeHalf(9, 18) };
  }

  // Overall round stats
  const roundGrosses = [];
  for (const rr of roundRecs) {
    let s = 0, c = 0;
    for (let i = 1; i <= holeCount; i++) {
      const v = toNum(rr.rec?.[`gross_${i}`]);
      if (isMeaningful(v)) { s += v; c++; }
    }
    if (c === holeCount) roundGrosses.push({ gross: s, date: rr.date || "" });
  }
  roundGrosses.sort((a, b) => a.gross - b.gross);
  const totalPar = holes.reduce((a, hd) => a + (hd.par || 0), 0);
  const totalStrokesLost = holes.reduce((a, hd) => a + (hd.strokesLost || 0), 0);

  return {
    teeName, teeKey: normKey(teeName), holeCount,
    nRounds: roundRecs.length,
    holes,
    totalDist,
    totalPar,
    totalStrokesLost: Math.round(totalStrokesLost * 100) / 100,
    byParType,
    f9b9,
    bestRound: roundGrosses[0] || null,
    worstRound: roundGrosses.length ? roundGrosses[roundGrosses.length - 1] : null,
    avgGross: roundGrosses.length ? Math.round(roundGrosses.reduce((a, x) => a + x.gross, 0) / roundGrosses.length * 10) / 10 : null,
    trend: (() => {
      if (roundGrosses.length < 4) return null;
      const dated = roundRecs.filter(rr => rr.date).map(rr => {
        let s = 0, c = 0;
        for (let i = 1; i <= holeCount; i++) { const v = toNum(rr.rec?.[`gross_${i}`]); if (isMeaningful(v)) { s += v; c++; } }
        return c === holeCount ? { gross: s, date: rr.date } : null;
      }).filter(Boolean);
      if (dated.length < 4) return null;
      const last3 = dated.slice(0, 3);
      const prev = dated.slice(3);
      const avgLast = last3.reduce((a, x) => a + x.gross, 0) / last3.length;
      const avgPrev = prev.reduce((a, x) => a + x.gross, 0) / prev.length;
      return Math.round((avgLast - avgPrev) * 10) / 10;
    })()
  };
}

module.exports = { computeHoleStats };
