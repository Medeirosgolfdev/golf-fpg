/**
 * ffg-escalao.cjs — ESPELHO Node de `src/utils/ffgEscalao.ts`.
 *
 * O Node não importa `.ts`, mas o `build-france-players.js` precisa da MESMA
 * regra de escalão que a app usa em runtime. **Manter sincronizado** — o teste
 * `scripts/ffg-escalao-mirror.test.js` compara as duas implementações sobre
 * todos os labels reais dos ficheiros FFG e falha se divergirem.
 * (Precedente: `lib/course-aliases.cjs` ↔ `src/utils/courseAliases.ts`.)
 */
"use strict";

/** Escalões do mais novo para o mais velho (ordem de comparação). */
const FFG_ESC_ORDER = [
  "Sub-8",
  "Sub-10 (Poucet)",
  "Sub-12 (Poussin)",
  "Sub-14 (Benjamin)",
  "Sub-16 (Minime)",
  "Sub-18 (Cadet)",
  "Sub-21 (Junior)",
  "Adultos",
];

/** Escalão canónico de um label cru (série, divisão ou NOME de torneio). */
function ffgEscalaoCanonico(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const u = s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&#\d+;/g, "'");
  const bucket = (n) =>
    n <= 8 ? "Sub-8" : n <= 10 ? "Sub-10 (Poucet)" : n <= 12 ? "Sub-12 (Poussin)"
    : n <= 14 ? "Sub-14 (Benjamin)" : n <= 16 ? "Sub-16 (Minime)"
    : n <= 18 ? "Sub-18 (Cadet)" : "Sub-21 (Junior)";
  const um = u.match(/(?:^|[^A-Z0-9])U[\s-]*(\d{1,2})(?![0-9])/);
  if (um) return bucket(+um[1]);
  if (/POUCET/.test(u)) return "Sub-10 (Poucet)";
  if (/\bPOU/.test(u)) return "Sub-12 (Poussin)";
  if (/\bBEN|BNJ|^B[GF]\b/.test(u)) return "Sub-14 (Benjamin)";
  if (/\bMIN|\bMI\b|MNIM|^M[GF]\b/.test(u)) return "Sub-16 (Minime)";
  if (/\bCAD/.test(u)) return "Sub-18 (Cadet)";
  if (/JUNIOR|\bJUN\b|^J[GF]\b/.test(u)) return "Sub-21 (Junior)";
  if (/ENFANT/.test(u)) return "Sub-8";
  const am = u.match(/(?:JUSQU|MOINS|-)\D{0,8}?(\d{1,2})\s*ANS/);
  if (am) return bucket(+am[1]);
  if (/\bSENIOR|\bVETERAN|\bADULTE|MID[\s-]?AM/.test(u)) return "Adultos";
  return null;
}

/** Escalão mais novo de uma lista (ver doc no gémeo TS). */
function ffgEscalaoMaisNovo(escaloes) {
  let best = null;
  let bestIdx = Infinity;
  for (const e of escaloes) {
    if (!e) continue;
    const i = FFG_ESC_ORDER.indexOf(e);
    if (i >= 0 && i < bestIdx) { bestIdx = i; best = e; }
    else if (i < 0 && best === null) best = e;
  }
  return best;
}

module.exports = { FFG_ESC_ORDER, ffgEscalaoCanonico, ffgEscalaoMaisNovo };
