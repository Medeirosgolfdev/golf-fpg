"use strict";

const SUFFIX_PATTERNS = [
  /\s*[-–—]\s*CNJ(?:\s+FPG)?\s*$/i,
  /\s*[-–—]\s*CN(?:\s+FPG)?\s*$/i,
  /\s*[-–—]\s*CNS(?:\s+FPG)?\s*$/i,
];

const COURSE_NAME_ALIASES = {
  "aroeira challenge": "PGA  Aroeira No.2",
  "aroeira pines classic": "PGA  Aroeira No.1",
  "aroeira i": "PGA  Aroeira No.1",
};

function aliasKey(s) {
  return String(s).toLowerCase().replace(/\s+/g, " ").trim();
}

function canonicalCourseName(name) {
  if (!name || typeof name !== "string") return name;
  let out = name;
  for (const re of SUFFIX_PATTERNS) {
    if (re.test(out)) {
      out = out.replace(re, "").trim();
      break;
    }
  }
  const alias = COURSE_NAME_ALIASES[aliasKey(out)];
  if (alias) out = alias;
  return out;
}

const AROEIRA_PAR_TO_COURSE = {
  "[4,5,4,5,3,4,4,3,4,4,5,3,4,3,4,4,4,5]": "PGA  Aroeira No.2",
  "[4,3,4,4,4,5,4,5,4,5,3,4,4,3,4,4,5,3]": "PGA  Aroeira No.2",
  "[5,4,4,3,4,4,4,3,5,5,4,4,4,3,5,3,4,4]": "PGA  Aroeira No.1",
};
const AMBIGUOUS_AROEIRA_NAMES = new Set(["aroeira ii"]);

function resolveAroeiraIIByPar(name, pars) {
  if (!name || !AMBIGUOUS_AROEIRA_NAMES.has(aliasKey(name))) return name;
  if (!Array.isArray(pars) || pars.length !== 18) return name;
  return AROEIRA_PAR_TO_COURSE[JSON.stringify(pars)] || name;
}

const SDS_NINES = {
  "[4,4,5,3,4,4,5,3,4]": "Machico",
  "[4,5,4,4,4,3,5,3,4]": "Desertas",
  "[5,4,4,4,3,4,4,3,5]": "Serras",
};
const SDS_BASE = "Santo da Serra";

function _identifyNine(parsArr9) {
  if (!Array.isArray(parsArr9) || parsArr9.length !== 9) return null;
  return SDS_NINES[JSON.stringify(parsArr9)] || null;
}

function isSantoDaSerraName(name) {
  return /santo\s+da\s+serra|sto\.?\s+da\s+serra|s\.\s*da\s+serra/i.test(String(name || ""));
}

function canonicalSantoDaSerraNameOnly(name) {
  if (!isSantoDaSerraName(name)) return name;
  const m = String(name).match(/-\s*([A-Za-zÀ-ÿ]+)\s*[-/]\s*([A-Za-zÀ-ÿ]+)\s*$/);
  if (m) {
    const a = m[1].trim();
    const b = m[2].trim();
    if (a.toLowerCase() === b.toLowerCase()) return SDS_BASE + " - " + a + "×2";
    const sorted = [a, b].sort(function(x, y) { return x.localeCompare(y, "pt"); });
    return SDS_BASE + " - " + sorted[0] + "+" + sorted[1];
  }
  const m2 = String(name).match(/-\s*([A-Za-zÀ-ÿ]+)\s*$/);
  if (m2) return SDS_BASE + " - " + m2[1].trim();
  return name;
}

function resolveSantoDaSerraByPar(name, pars) {
  if (!isSantoDaSerraName(name)) return name;
  if (!Array.isArray(pars)) return canonicalSantoDaSerraNameOnly(name);
  if (pars.length === 9) {
    const nine = _identifyNine(pars);
    return nine ? SDS_BASE + " - " + nine : canonicalSantoDaSerraNameOnly(name);
  }
  if (pars.length === 18) {
    const f9 = _identifyNine(pars.slice(0, 9));
    const b9 = _identifyNine(pars.slice(9, 18));
    if (!f9 || !b9) return canonicalSantoDaSerraNameOnly(name);
    if (f9 === b9) return SDS_BASE + " - " + f9 + "×2";
    const sorted = [f9, b9].sort();
    return SDS_BASE + " - " + sorted[0] + "+" + sorted[1];
  }
  return canonicalSantoDaSerraNameOnly(name);
}

const AROEIRA2_OLD_PAR = [4, 5, 4, 5, 3, 4, 4, 3, 4, 4, 5, 3, 4, 3, 4, 4, 4, 5];

function rotateLeft(arr, n) {
  if (!Array.isArray(arr) || arr.length !== 18) return arr;
  return arr.slice(n).concat(arr.slice(0, n));
}

function rotateAroeira2RecordIfNeeded(rec) {
  if (!rec || typeof rec !== "object") return false;
  const pars = [];
  for (let i = 1; i <= 18; i++) {
    const v = rec["par_" + i];
    if (v == null) return false;
    const n = Number(v);
    if (!Number.isFinite(n)) return false;
    pars.push(n);
  }
  for (let i = 0; i < 18; i++) {
    if (pars[i] !== AROEIRA2_OLD_PAR[i]) return false;
  }
  const fields = ["par", "gross", "meters", "stroke_index", "net", "stbnet", "stbgross", "bogey"];
  for (const f of fields) {
    const arr = [];
    let any = false;
    for (let i = 1; i <= 18; i++) {
      const v = rec[f + "_" + i];
      if (v != null) any = true;
      arr.push(v);
    }
    if (!any) continue;
    const rot = rotateLeft(arr, 12);
    for (let i = 0; i < 18; i++) rec[f + "_" + (i + 1)] = rot[i];
  }
  rec._rotated = 12;
  return true;
}

module.exports = {
  canonicalCourseName,
  rotateAroeira2RecordIfNeeded,
  resolveAroeiraIIByPar,
  resolveSantoDaSerraByPar,
  canonicalSantoDaSerraNameOnly,
  AROEIRA2_OLD_PAR,
};
