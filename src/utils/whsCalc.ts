/**
 * src/utils/whsCalc.ts
 *
 * Fórmulas genéricas do World Handicap System (WHS).
 * Centraliza cálculos que estavam duplicados em SimuladorPage e TorneioPage.
 *
 * Nota: TorneioPage tem um wrapper `calcSD(gross, teeColor, sex)` que combina
 * lookup de tee ratings + esta fórmula. Esse wrapper é específico do torneio
 * e continua lá — usa esta função internamente.
 */

/** Score Differential = (113 / Slope) × (Score − CR − PCC) */
export function calcSD(score: number, cr: number, slope: number, pcc = 0): number {
  return (113 / slope) * (score - cr - pcc);
}

/** Inverso: Score = SD × (Slope / 113) + CR + PCC */
export function calcScore(sd: number, cr: number, slope: number, pcc = 0): number {
  return sd * (slope / 113) + cr + pcc;
}

/** Course Handicap = HI × (Slope / 113) + (CR − Par)
 *  Usado para: distribuição de pancadas por buraco, Net Double Bogey (AGS) */
export function calcCourseHcp(hi: number, slope: number, cr: number, par: number): number {
  return hi * (slope / 113) + (cr - par);
}

/** Playing Handicap = Course Handicap × Allowance%
 *  Sem allowance (100%) = Course Handicap.
 *  Usado para: cálculo de Net Score em competição (95%, 85%, etc.) */
export function calcPlayingHcp(hi: number, slope: number, cr: number, par: number, allowance = 1): number {
  return calcCourseHcp(hi, slope, cr, par) * allowance;
}

/** Adjusted Gross Score (Net Double Bogey cap por buraco).
 *  Distribui pancadas de handicap pelos buracos por SI e aplica cap NDB. */
export function calcAGS(
  scores: number[], parArr: number[], si: number[],
  cr: number, slope: number, hcp: number, nholes: number
): number {
  if (!scores.length || !parArr.length || !si.length || scores.length < nholes)
    return scores.reduce((a, b) => a + b, 0);
  const parT = parArr.reduce((a, b) => a + b, 0);
  const ch = Math.round(hcp * (slope / 113) + (cr - parT));
  const siOrder = Array.from({ length: nholes }, (_, i) => i).sort((a, b) => si[a] - si[b]);
  const strokes = new Array(nholes).fill(0);
  let rem = Math.max(0, ch);
  while (rem > 0) { for (const idx of siOrder) { if (rem <= 0) break; strokes[idx]++; rem--; } }
  let adj = 0;
  for (let i = 0; i < nholes; i++) adj += Math.min(scores[i], parArr[i] + 2 + strokes[i]);
  return adj;
}

/* ── Expected SD por 9 buracos (tabela WHS oficial com interpolação linear) ── */
const EXP9: Record<number, number> = {
  0:1.2,1:1.7,2:2.2,3:2.8,4:3.3,5:3.8,6:4.3,7:4.8,8:5.4,9:5.9,
  10:6.4,11:6.9,12:7.4,13:8.0,14:8.5,15:9.0,16:9.5,17:10.0,18:10.6,
  19:11.1,20:11.6,21:12.2,22:12.7,23:13.2,24:13.7,25:14.2,26:14.8,
  27:15.3,28:15.8,29:16.3,30:16.8,31:17.4,32:17.9,33:18.4,34:18.9,
  35:19.4,36:20.0,37:20.5,38:21.0,39:21.5,40:22.0,41:22.6,42:23.1,
  43:23.6,44:24.1,45:24.6,46:25.2,47:25.7,48:26.2,49:26.7,50:27.2,
  51:27.8,52:28.3,53:28.8,54:29.3,
};

/** SD esperado para 9 buracos dado um HI (interpolação linear) */
export function expectedSD9(hi: number): number {
  const c = Math.min(54, Math.max(0, hi));
  const lo = Math.floor(c);
  const loV = EXP9[lo] ?? (lo * 0.52 + 1.2);
  const hiV = EXP9[Math.min(lo + 1, 54)] ?? ((lo + 1) * 0.52 + 1.2);
  return loV + (c - lo) * (hiV - loV);
}

/** Distribui pancadas de handicap pelos buracos por SI e calcula maxScore (NDB) */
export function calcStrokesPerHole(
  holes: { hole: number; par: number; si: number }[],
  ch: number
): { hole: number; par: number; si: number; strokes: number; maxScore: number }[] {
  return holes
    .filter(h => h.par != null && h.si != null)
    .map(h => {
      const si = h.si;
      let strokes = 0;
      if (si <= Math.min(ch, 18)) strokes++;
      if (ch > 18 && si <= Math.min(ch - 18, 18)) strokes++;
      if (ch > 36 && si <= Math.min(ch - 36, 18)) strokes++;
      return { hole: h.hole, par: h.par, si, strokes, maxScore: h.par + 2 + strokes };
    })
    .sort((a, b) => a.hole - b.hole);
}

/** Obtém ratings de 9 buracos (front ou back) de um tee.
 *
 *  Aceita qualquer objecto com `ratings.holes9Front` / `ratings.holes9Back`
 *  do shape `{ courseRating?, slopeRating?, par? }` — compatível com o tipo
 *  `Tee` (data/types.ts) e com qualquer subset estrutural. */
type Maybe<T> = T | null | undefined;
type RatingsLike = { courseRating?: Maybe<number>; slopeRating?: Maybe<number>; par?: Maybe<number> };

export function get9hRatings(
  tee: {
    ratings?: {
      holes9Front?: Maybe<RatingsLike>;
      holes9Back?: Maybe<RatingsLike>;
    };
  },
  nine: "front9" | "back9"
): { cr: number; slope: number; par: number } | null {
  const r = nine === "front9" ? tee.ratings?.holes9Front : tee.ratings?.holes9Back;
  if (!r?.courseRating || !r?.slopeRating) return null;
  return { cr: r.courseRating, slope: r.slopeRating, par: r.par ?? 36 };
}
