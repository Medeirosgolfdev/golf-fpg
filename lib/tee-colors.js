/**
 * lib/tee-colors.js — Módulo CJS para Node.
 *
 * Toda a lógica de cores de tees para o pipeline Node.
 * Lê dados de shared/tee-colors.json (cores reais FPG/DataGolf).
 *
 * Para o React, ver src/utils/teeColors.ts (mesmo JSON, módulo ESM/TS).
 */

const path = require("path");
const teeData = require(path.join(__dirname, "..", "shared", "tee-colors.json"));

const EXACT    = teeData.exact;
const SUBS     = teeData.substrings;
const FALLBACK = teeData.fallback;

// Alias mantido por compatibilidade com process-data.js
const DEFAULT_TEE_COLORS = EXACT;

function normKey(s) {
  return String(s == null ? "" : s)
    .trim().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/\s+/g, "");
}

function teeColor(teeName) {
  const k = normKey(teeName);
  if (EXACT[k]) return EXACT[k];
  for (const [sub, hex] of SUBS) { if (k.includes(sub)) return hex; }
  return FALLBACK;
}

function teeTextColor(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return "#fff";
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.45 ? "#111" : "#fff";
}

module.exports = { DEFAULT_TEE_COLORS, EXACT, normKey, teeColor, teeTextColor };
