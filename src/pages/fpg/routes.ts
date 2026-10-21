/**
 * routes.ts — Mapeamentos URL ↔ estado da FPGPage.
 *
 * URL canónica:
 *   /FPG                      → torneios, sem filtro de série
 *   /FPG/jovens               → tab Jovens
 *   /FPG/sto                  → tab Santo da Serra
 *   /FPG/clubes               → tab Clubes (o antigo ?ct=ccode-tcode → /FPG/torneio/ccode-tcode)
 *   /FPG/pja                  → tab PJA
 *   /FPG/rankingPJA           → modo Ranking PJA
 *   /FPG/rankingSub12         → modo Ranking Sub-12
 *   /FPG/classificacoes       → modo CLASSIFICAÇÕES (calendário dos jogadores de referência)
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
export const URL_TO_NAV: Record<string, "torneios" | "ranking-pja" | "ranking-sub12" | "classificacoes"> = {
  rankingpja:     "ranking-pja",
  rankingsub12:   "ranking-sub12",
  classificacoes: "classificacoes",
};
// URLs geradas — mantemos o case "camelCase" para leitura, mas o comparison
// com urlSeg é sempre lowercase.
export const NAV_TO_URL: Record<"torneios" | "ranking-pja" | "ranking-sub12" | "classificacoes", string> = {
  "torneios":       "",
  "ranking-pja":    "rankingPJA",
  "ranking-sub12":  "rankingSub12",
  "classificacoes": "classificacoes",
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

/** Links antigos de Clubes: `/FPG/clubes?ct={ccode}-{tcode}` (a selecção vivia
 *  num parâmetro) → `/FPG/torneio/{ccode}-{tcode}`, como os outros torneios.
 *  Fica o resto da query; a aba (`tab`) mantém-se, menos a antiga «individual»
 *  (hoje são as abas normais de resultados). Saem também `year` e `manuel`, os
 *  filtros exteriores que só serviam a lista antiga. Sem `ct` (ou fora de
 *  /FPG/clubes) → null. */
export function clubesCtRedirect(urlSeg: string, search: string): string | null {
  if (urlSeg.toLowerCase() !== "clubes") return null;
  const sp = new URLSearchParams(search);
  const ct = (sp.get("ct") || "").trim();
  if (!/^[^-\s]+-[^-\s]+$/.test(ct)) return null;
  sp.delete("ct");
  sp.delete("year");
  sp.delete("manuel");
  if (sp.get("tab") === "individual") sp.delete("tab");
  const q = sp.toString();
  return `/FPG/torneio/${ct}${q ? `?${q}` : ""}`;
}
