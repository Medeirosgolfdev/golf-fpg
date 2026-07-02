/**
 * src/data/tidAliases.ts — FONTE ÚNICA dos mapas de alias/dedup de tids.
 *
 * Antes (até 2026-07-02) estes mapas viviam copiados em 3 sítios — KIDSPage,
 * RivalDetail e TabelaGlobal — e qualquer alias novo tinha de ser adicionado
 * em todos (a classe de bug que deixou o WJGC 2026 sem merge quando os
 * ficheiros foram renomeados). Extras específicos de uma vista (ex: TG_HIDDEN
 * da TabelaGlobal) compõem sobre estas bases em vez de as duplicar.
 */

/** Auto tid → manual T id que o cobre (dedup no detalhe de rival).
 *  Necessário quando o id manual não deriva trivialmente do auto tid. */
export const AUTO_COVERED_BY: Record<string, string> = {
  // wjgc26_1213 (manual) cobre o auto
  "wjgc26_b1213":  "wjgc26_1213",
  // Venice 2025
  "venice25_b11":  "venice25",
  "venice25_b12":  "venice25",
  "venice25_b9":   "venice25",
  "venice25_b10":  "venice25",
  // Rome 2025
  "rome25_b11":    "rome25",
  "rome25_b12":    "rome25",
  "rome25_b9":     "rome25",
  "rome25_b10":    "rome25",
  // Doral 2025
  "doral25_b1011": "doral25",
  "doral25_b89":   "doral25",
  "doral25_b1213": "doral25",
};

/** Pares [tid oculto, tid que o substitui] — dedup de contagens e tabelas.
 *  Um tid esconde-se quando AMBOS têm rondas no mesmo jogador. */
export const HIDDEN_WHEN_PRESENT: Array<[string, string]> = [
  ["brjgt25",       "wjgc25_b1011"],
  // WJGC 2026 — auto tid vs manual entry
  ["wjgc26_b1213",  "wjgc26_1213"],
  // Venice 2025 escalões vs manual entry
  ["venice25_b11","venice25"], ["venice25_b12","venice25"],
  ["venice25_b9", "venice25"], ["venice25_b10","venice25"],
  // Rome 2025
  ["rome25_b11",  "rome25"],   ["rome25_b12",  "rome25"],
  ["rome25_b9",   "rome25"],   ["rome25_b10",  "rome25"],
  // Doral 2025
  ["doral25_b1011","doral25"], ["doral25_b89", "doral25"], ["doral25_b1213","doral25"],
];
