/* ═══════════════════════════════════════════════════════
   DRIVE TOUR / DRIVE CHALLENGE — Tabelas de pontos do ranking
   ─────────────────────────────────────────────────────────
   FONTE ÚNICA DE VERDADE (espelho Node: scripts/lib/drive-points.cjs —
   manter sincronizado).

   ⚠ Descoberta 2026-07-10 (comparação empírica com o RankingsClassifLST
   oficial, todas as zonas/escalões, via scripts/verify-drive-rankings.js):
   as séries têm tabelas DIFERENTES no 8º lugar —
     · TOUR:      8º = 38 (12 amostras oficiais) e 20º = 18
     · CHALLENGE: 8º = 35 (112 amostras oficiais)
   O ranking OFICIAL conta apenas os MELHORES N resultados (tipicamente 4;
   o verify detecta o N por ranking) — o site ainda soma tudo.
   ═══════════════════════════════════════════════════════ */

const BASE: Record<number, number> = {
  1: 250, 2: 165, 3: 94, 4: 75, 5: 64, 6: 53, 7: 45,
  9: 33, 10: 30, 11: 27, 12: 26, 13: 24, 14: 23,
  15: 22, 16: 21, 17: 20, 18: 19, 19: 18,
  20: 18,  // observado nos oficiais em AMBAS as séries (RDTN26 + DC_NOR_*)
};

export const DRIVE_POINTS_TOUR: Record<number, number> = {
  ...BASE, 8: 38,
};

export const DRIVE_POINTS_CHALLENGE: Record<number, number> = {
  ...BASE, 8: 35,
};

/** Retro-compat: tabela "default" (= Challenge). Preferir drivePoints(pos, series). */
export const DRIVE_POINTS = DRIVE_POINTS_CHALLENGE;

/** Pontos do ranking para uma posição final, conforme a série.
 *  `series`: "tour" | "aquapor" → tabela Tour; resto → Challenge.
 *  Posições fora da tabela → 0. */
export function drivePoints(pos: number | string | null, series?: string | null): number {
  if (pos == null) return 0;
  const n = Number(pos);
  if (isNaN(n) || n <= 0) return 0;
  const table = (series === "tour" || series === "aquapor") ? DRIVE_POINTS_TOUR : DRIVE_POINTS_CHALLENGE;
  return table[n] ?? 0;
}

/* ── Finais ──────────────────────────────────────────────────────────────
   Descoberto 2026-07-19 (código RFDC_26M18G, ranking final Madeira Sub 18):
   o Drive Challenge tem DOIS rankings por zona/escalão —
     · `DC_*`   = FASE REGULAR: melhores 4 provas, as Finais NÃO entram
     · `RFDC_*` = RANKING FINAL: total da fase regular + a Final a ×1.5
   Verificado: 1º 250→375 · 2º 165→248 (247,5) · 3º 94→141 · 4º 75→113 (112,5).
   Arredondamento a meio para cima (Math.round). ────────────────────────── */
export const FINAL_WEIGHT = 1.5;

/** A prova é uma Final (regional ou nacional)? */
export function isFinalEvent(name: string | null | undefined): boolean {
  return /\bfinal\b/i.test(String(name || ""));
}

/** Final NACIONAL — não entra nos rankings regionais (nem na fase regular,
 *  nem no ranking final da zona). */
export function isNacionalFinal(name: string | null | undefined): boolean {
  return isFinalEvent(name) && /nacional/i.test(String(name || ""));
}

/** Pontos de uma Final: tabela normal × 1.5, arredondado. */
export function finalPoints(pos: number | string | null, series?: string | null): number {
  return Math.round(drivePoints(pos, series) * FINAL_WEIGHT);
}

/** Quantas provas contam para o ranking (as melhores). Medido no oficial:
 *  o Gonçalo Gouveia tinha 6 provas e o total = as 4 melhores. */
export const RANKING_BEST_N = 4;

/** Gross sentinela da FPG (999, 1044, 1080…) = "sem cartão": não pontua. */
export function hasCard(gross: number | null | undefined): boolean {
  return typeof gross === "number" && gross > 0 && gross < 900;
}

export interface FieldEntry {
  fed: string;
  pos: number | string | null;
  gross: number | null;
  sex?: string | null;
}

/** Pontos de UM torneio, por federado — com as regras oficiais de empate.
 *  · Aquapor: classifica DENTRO do sexo e empates partilham lugar/pontos.
 *  · Challenge/Tour: usa a posição já desempatada por countback no scrape;
 *    se ainda assim duas partilharem lugar, dividem os pontos. */
export function tournamentPoints(field: FieldEntry[], series?: string | null): Map<string, number> {
  const out = new Map<string, number>();
  const scored = field.filter(p => p.fed && hasCard(p.gross));

  if (series === "aquapor") {
    for (const sex of ["M", "F", ""]) {
      const grupo = scored.filter(p => (p.sex || "") === sex);
      if (!grupo.length) continue;
      const ord = [...grupo].sort((a, b) => (a.gross as number) - (b.gross as number));
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

  const porPos = new Map<string, FieldEntry[]>();
  for (const p of scored) {
    const k = String(p.pos);
    if (!porPos.has(k)) porPos.set(k, []);
    porPos.get(k)!.push(p);
  }
  for (const [, grupo] of porPos) {
    const pts = sharedPoints(grupo[0].pos, grupo.length, series);
    for (const p of grupo) out.set(p.fed, pts);
  }
  return out;
}

export interface RankingResultLike {
  pos: number | string | null;
  pts?: number | null;
  series?: string | null;
  tournName?: string | null;
}

/** Total do ranking COMO A FPG o calcula:
 *  melhores-N da fase regular + as Finais regionais a ×1.5.
 *  A Final NACIONAL não entra em ranking regional nenhum. */
export function rankingTotal(results: RankingResultLike[], bestN: number = RANKING_BEST_N): number {
  const regulares: number[] = [];
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

/** Empate não desfeito pelo countback: os `count` jogadores partilham a posição
 *  e recebem a MÉDIA dos pontos dos lugares ocupados (pos..pos+count-1).
 *  Confirmado no oficial: 2 empatados no 14º → (23+22)/2 = 22,5 cada. */
export function sharedPoints(pos: number | string | null, count: number, series?: string | null): number {
  const n = Math.max(1, Number(count) || 1);
  if (n === 1) return drivePoints(pos, series);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += drivePoints(Number(pos) + i, series);
  // O oficial publica com 1 decimal (3 empatados no 12º → (26+24+23)/3 = 24,3).
  return Math.round((sum / n) * 10) / 10;
}
