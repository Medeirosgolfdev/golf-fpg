/**
 * ratingsEstimados.ts — CR/Slope ESTIMADOS dos tees USKids quando a USKids não
 * publicou o PDF de rating do torneio.
 *
 * Partem do tee OFICIAL do clube (tabela da federação) e ajustam-se pelas jardas
 * do escalão com `lengthAdjustedRating` (whsCalc) — o método da USKids, que
 * reproduz à décima os CR oficiais de Marco Simone e Paris. Rapazes a partir do
 * tee de homens mais parecido, raparigas do tee de senhoras. Servem a /uskids
 * (TEES_LOOKUP, SD marcado como estimado) e a /campos (tees do torneio).
 */
import { lengthAdjustedRating } from "../../utils/whsCalc";

export interface RatingBase { tee: string; sex: "M" | "F"; cr: number; slope: number; yards: number; fonte: string }
export interface RatingEstimado { cr: number; slope: number; nota: string }

function estimar(base: RatingBase, yards: number): RatingEstimado {
  const { cr, slope } = lengthAdjustedRating(base, yards, base.sex);
  const quem = base.sex === "F" ? "senhoras" : "homens";
  return {
    cr, slope,
    nota: `ajustados pelas jardas do escalão (${yards} jd) a partir do tee ${base.tee} de ${quem} do clube ` +
      `(CR ${base.cr.toFixed(1)} · Slope ${base.slope}, ${base.yards} jd — ${base.fonte}); a USKids não publicou o rating`,
  };
}

/* ── The Vale Resort (Hensol, Gales) — British Kids Championship 2026 (t=22885) ──
 * Ratings: tabelas «Course Rating & Slope Rating» 2025 da Wales Golf no site do
 * clube (valeresort.com). Jardas: cartões do clube (Lake 2025, Wales National 2020). */
export const VALE_WN_YELLOW: RatingBase = { tee: "Yellow", sex: "M", cr: 73.5, slope: 126, yards: 6617, fonte: "Wales Golf 2025" };
export const VALE_LAKE_YELLOW: RatingBase = { tee: "Yellow", sex: "M", cr: 70.3, slope: 123, yards: 5986, fonte: "Wales Golf 2025" };
export const VALE_LAKE_RED_F: RatingBase = { tee: "Red", sex: "F", cr: 74.9, slope: 134, yards: 5745, fonte: "Wales Golf 2025" };

/* ── PGA National (Palm Beach Gardens, EUA) — Holiday Classic (2025 t=20878; 2026 t=23670) ──
 * Ratings: NCRDB da USGA (Fazio 34555, Palmer 14406, Match 35501), os mesmos tees
 * que estão em extraCourses.ts. Jardas dos escalões: «2025 Holiday Classic
 * Yardages» (iguais de 2021 a 2025). O Match é par 67 no clube e par 72 na USKids
 * (cinco par 4 compridos passam a par 5) — o CR vai pelas jardas, não pelo par. */
export const PGA_FAZIO_T3_M: RatingBase = { tee: "Tee 3", sex: "M", cr: 67.2, slope: 117, yards: 5574, fonte: "USGA NCRDB" };
export const PGA_FAZIO_T4_M: RatingBase = { tee: "Tee 4", sex: "M", cr: 65.2, slope: 112, yards: 5117, fonte: "USGA NCRDB" };
export const PGA_PALMER_T2_M: RatingBase = { tee: "Tee 2", sex: "M", cr: 70.3, slope: 133, yards: 6127, fonte: "USGA NCRDB" };
export const PGA_PALMER_T3_F: RatingBase = { tee: "Tee 3", sex: "F", cr: 72.9, slope: 135, yards: 5518, fonte: "USGA NCRDB" };
export const PGA_PALMER_T34_F: RatingBase = { tee: "Tee 3/4", sex: "F", cr: 71.0, slope: 129, yards: 5177, fonte: "USGA NCRDB" };
export const PGA_PALMER_T4_F: RatingBase = { tee: "Tee 4", sex: "F", cr: 69.0, slope: 119, yards: 4766, fonte: "USGA NCRDB" };
export const PGA_MATCH_SAILBOAT_M: RatingBase = { tee: "Sailboat", sex: "M", cr: 64.5, slope: 118, yards: 4889, fonte: "USGA NCRDB" };
export const PGA_MATCH_HELM_M: RatingBase = { tee: "Helm", sex: "M", cr: 60.9, slope: 109, yards: 3980, fonte: "USGA NCRDB" };
export const PGA_MATCH_SAILBOAT_F: RatingBase = { tee: "Sailboat", sex: "F", cr: 69.1, slope: 125, yards: 4889, fonte: "USGA NCRDB" };
export const PGA_MATCH_HELM_F: RatingBase = { tee: "Helm", sex: "F", cr: 64.0, slope: 109, yards: 3980, fonte: "USGA NCRDB" };

export const HOLIDAY25 = {
  fazioBoys12: estimar(PGA_FAZIO_T3_M, 5633),
  fazioBoys11: estimar(PGA_FAZIO_T4_M, 5215),
  palmerBoys1314: estimar(PGA_PALMER_T2_M, 6111),
  palmerGirls1314: estimar(PGA_PALMER_T3_F, 5592),
  palmerGirls12: estimar(PGA_PALMER_T34_F, 5215),
  palmerGirls11: estimar(PGA_PALMER_T4_F, 4817),
  matchBoys10: estimar(PGA_MATCH_SAILBOAT_M, 4701),
  matchGirls11: estimar(PGA_MATCH_SAILBOAT_F, 4701),
  matchBoys9: estimar(PGA_MATCH_HELM_M, 4148),
  matchGirls10: estimar(PGA_MATCH_HELM_F, 4148),
};

export const BKC26 = {
  wnBoys1518: estimar(VALE_WN_YELLOW, 6243),
  wnBoys1314: estimar(VALE_WN_YELLOW, 5692),
  wnBoys12: estimar(VALE_WN_YELLOW, 5222),
  wnBoys1011: estimar(VALE_WN_YELLOW, 4637),
  lakeBoys9: estimar(VALE_LAKE_YELLOW, 4046),
  lakeGirls1518: estimar(VALE_LAKE_RED_F, 5019),
  lakeGirls1314: estimar(VALE_LAKE_RED_F, 4471),
  lakeGirls1112: estimar(VALE_LAKE_RED_F, 4046),
};
