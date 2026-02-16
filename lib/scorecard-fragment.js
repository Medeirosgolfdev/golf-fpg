// lib/scorecard-fragment.js — Utility functions for scorecard data extraction
const { isMeaningful, toNum } = require("./helpers");

function detectHoleCount({ parArr, grossArr, metersArr }) {
  const backHas =
    grossArr.slice(9).some(isMeaningful) ||
    parArr.slice(9).some(isMeaningful) ||
    metersArr.slice(9).some(isMeaningful);
  return backHas ? 18 : 9;
}

function holeCountFromRec(rec) {
  if (!rec) return 18;
  const H18 = Array.from({ length: 18 }, (_, i) => i + 1);
  const par18 = H18.map(h => toNum(rec?.[`par_${h}`]));
  const m18   = H18.map(h => toNum(rec?.[`meters_${h}`]));
  const g18   = H18.map(h => toNum(rec?.[`gross_${h}`]));
  return detectHoleCount({ parArr: par18, grossArr: g18, metersArr: m18 });
}

function parTotalFromRec(rec) {
  if (!rec) return null;
  const hc = holeCountFromRec(rec);
  let s = 0, c = 0;
  for (let i = 1; i <= hc; i++) {
    const v = toNum(rec?.[`par_${i}`]);
    if (v != null && isMeaningful(v)) { s += v; c++; }
  }
  return c >= Math.min(6, hc) ? s : null;
}

module.exports = { holeCountFromRec, parTotalFromRec };
