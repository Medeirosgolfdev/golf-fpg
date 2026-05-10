/**
 * routes.ts — Mapeamentos URL ↔ estado da FPGPage.
 *
 * URL canónica:
 *   /FPG                      → torneios, sem filtro de série
 *   /FPG/jovens               → tab Jovens
 *   /FPG/sto                  → tab Santo da Serra
 *   /FPG/clubes               → tab Clubes
 *   /FPG/pja                  → tab PJA
 *   /FPG/rankingPJA           → modo Ranking PJA
 *   /FPG/rankingSub12         → modo Ranking Sub-12
 *   /FPG/jovens/inscritosCN   → tab Jovens com painel de inscrições aberto
 */
// Mapa URL-segment ↔ seriesFilter — usado para sincronizar URL e estado.
export type SeriesKey = "" | "circuit" | "santo" | "clubes" | "jovens";
export const URL_TO_FILTER: Record<string, SeriesKey> = {
  jovens:  "jovens",
  clubes:  "clubes",
  sto:     "santo",
  santo:   "santo",    // alias
  pja:     "circuit",
  circuit: "circuit",  // alias
};

// Mapa URL-segment ↔ navMode (tabs "Torneios" / "Ranking PJA" / "Ranking Sub-12").
// ⚠ As chaves têm de ser lowercase porque `urlSeg = params.filter.toLowerCase()`.
// Para preservar leitura natural na URL ("rankingPJA"), usamos redirect no lookup.
export const URL_TO_NAV: Record<string, "torneios" | "ranking-pja" | "ranking-sub12"> = {
  rankingpja:   "ranking-pja",
  rankingsub12: "ranking-sub12",
};
// URLs geradas — mantemos o case "camelCase" para leitura, mas o comparison
// com urlSeg é sempre lowercase.
export const NAV_TO_URL: Record<"torneios" | "ranking-pja" | "ranking-sub12", string> = {
  "torneios":      "",
  "ranking-pja":   "rankingPJA",
  "ranking-sub12": "rankingSub12",
};
export const FILTER_TO_URL: Record<SeriesKey, string> = {
  "":        "",
  jovens:    "jovens",
  clubes:    "clubes",
  santo:     "sto",
  circuit:   "pja",
};
// Atalhos que abrem directamente JOVENS com o painel de inscrições (case-insensitive)
export const INSCRITOS_SHORTCUTS = new Set(["inscritoscn", "inscritos"]);
