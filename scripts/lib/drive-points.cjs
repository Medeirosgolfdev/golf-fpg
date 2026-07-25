/**
 * scripts/lib/drive-points.cjs — ESPELHO Node de src/constants/drivePoints.ts
 * (o Node não importa .ts; precedente: course-aliases.cjs ↔ courseAliases.ts).
 * ⚠ MANTER SINCRONIZADO com src/constants/drivePoints.ts.
 *
 * Tabelas oficiais FPG/DataGolf do ranking Drive — POR SÉRIE (2026-07-10):
 *   TOUR:      8º = 38, 20º = 18 (empírico, RankingsClassifLST)
 *   CHALLENGE: 8º = 35
 */
"use strict";

const BASE = {
  1: 250, 2: 165, 3: 94, 4: 75, 5: 64, 6: 53, 7: 45,
  9: 33, 10: 30, 11: 27, 12: 26, 13: 24, 14: 23,
  15: 22, 16: 21, 17: 20, 18: 19, 19: 18,
  20: 18,  // observado nos oficiais em AMBAS as séries
};

const DRIVE_POINTS_TOUR = { ...BASE, 8: 38 };
const DRIVE_POINTS_CHALLENGE = { ...BASE, 8: 35 };
const DRIVE_POINTS = DRIVE_POINTS_CHALLENGE;  // retro-compat

function drivePoints(pos, series) {
  if (pos == null) return 0;
  const n = Number(pos);
  if (isNaN(n) || n <= 0) return 0;
  const table = (series === "tour" || series === "aquapor") ? DRIVE_POINTS_TOUR : DRIVE_POINTS_CHALLENGE;
  return table[n] ?? 0;
}

const FINAL_WEIGHT = 1.5;

function isFinalEvent(name) {
  return /\bfinal\b/i.test(String(name || ""));
}

function isNacionalFinal(name) {
  return isFinalEvent(name) && /nacional/i.test(String(name || ""));
}

function finalPoints(pos, series) {
  return Math.round(drivePoints(pos, series) * FINAL_WEIGHT);
}

/** Empate que o countback não separa: os `count` jogadores partilham a posição
 *  `pos` e recebem a MÉDIA dos pontos dos lugares que ocupam (pos..pos+count-1).
 *  Confirmado no oficial: 2 empatados no 14º → (23+22)/2 = 22.5 cada.
 *  Sem arredondamento — o oficial publica mesmo meios pontos. */
function sharedPoints(pos, count, series) {
  const n = Math.max(1, Number(count) || 1);
  if (n === 1) return drivePoints(pos, series);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += drivePoints(Number(pos) + i, series);
  // O oficial publica com 1 decimal (3 empatados no 12º → (26+24+23)/3 = 24.3).
  return Math.round((sum / n) * 10) / 10;
}

const RANKING_BEST_N = 4;

function hasCard(gross) {
  return typeof gross === "number" && gross > 0 && gross < 900;
}

/** Pontos de UM torneio por federado, com as regras oficiais de empate.
 *  Aquapor classifica dentro do sexo; Challenge/Tour usa a posição já
 *  desempatada por countback. ESPELHO de src/constants/drivePoints.ts. */
function tournamentPoints(field, series) {
  const out = new Map();
  const scored = field.filter(p => p.fed && hasCard(p.gross));
  if (series === "aquapor") {
    for (const sex of ["M", "F", ""]) {
      const grupo = scored.filter(p => (p.sex || "") === sex);
      if (!grupo.length) continue;
      const ord = [...grupo].sort((a, b) => a.gross - b.gross);
      let i = 0;
      while (i < ord.length) {
        let j = i + 1;
        while (j < ord.length && ord[j].gross === ord[i].gross) j++;
        const pts = sharedPoints(i + 1, j - i, series);
        for (let k = i; k < j; k++) out.set(ord[k].fed, pts);
        i = j;
      }
    }
    return out;
  }
  const porPos = new Map();
  for (const p of scored) {
    const k = String(p.pos);
    if (!porPos.has(k)) porPos.set(k, []);
    porPos.get(k).push(p);
  }
  for (const [, grupo] of porPos) {
    const pts = sharedPoints(grupo[0].pos, grupo.length, series);
    for (const p of grupo) out.set(p.fed, pts);
  }
  return out;
}

/** Total do ranking como a FPG: melhores-N da fase regular + Finais ×1.5. */
function rankingTotal(results, bestN = RANKING_BEST_N) {
  const regulares = [];
  let finais = 0;
  for (const r of results) {
    if (isNacionalFinal(r.tournName)) continue;
    const base = r.pts ?? drivePoints(r.pos, r.series);
    if (!base) continue;
    if (isFinalEvent(r.tournName)) finais += Math.round(base * FINAL_WEIGHT);
    else regulares.push(base);
  }
  const melhores = regulares.sort((a, b) => b - a).slice(0, bestN).reduce((s, x) => s + x, 0);
  return Math.round((melhores + finais) * 10) / 10;
}

module.exports = {
  DRIVE_POINTS, DRIVE_POINTS_TOUR, DRIVE_POINTS_CHALLENGE, drivePoints,
  FINAL_WEIGHT, isFinalEvent, isNacionalFinal, finalPoints, sharedPoints,
  RANKING_BEST_N, hasCard, tournamentPoints, rankingTotal,
};
