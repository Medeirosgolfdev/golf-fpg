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
