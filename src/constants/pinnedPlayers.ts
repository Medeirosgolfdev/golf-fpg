/**
 * pinnedPlayers.ts — Jogadores fixados no topo da lista /jogadores
 * (JogadoresListPage), quando o pin ⭐ está activo e a ordenação é por Nome.
 *
 * Ordem de prioridade:
 *   1) Manuel (52884)
 *   2) Gastão (59252)
 *   3) Top 5 de cada escalão do Campeonato Nacional de Jovens 2026 (Aroeira),
 *      por escalão (Sub-10 → Sub-18, Feminino antes de Masculino) e por posição.
 *
 * Fed codes resolvidos a partir de `nacionais-jovens.json` (top10 do CNJ 2026)
 * cruzado com `players.json`/`federados.json`. Actualizar quando houver um novo
 * Campeonato Nacional de Jovens.
 */
export const PINNED_TOP_FEDS: string[] = [
  "52884", // Manuel Goulartt Medeiros
  "59252", // Gastão Thomaz Medeiros
  // ── Campeonato Nacional de Jovens 2026 — top 5 por escalão ──
  // Sub-10 M
  "54264", "52815", "54330", "52713", "56641",
  // Sub-12 F
  "48971", "49328", "46314", "48113", "51803",
  // Sub-12 M (Manuel já listado acima → omitido aqui)
  "49085", "53645", "51180", "48946",
  // Sub-14 F
  "45393", "49076", "46310", "48794", "53847",
  // Sub-14 M
  "49124", "42908", "43968", "51524", "46299",
  // Sub-16 F
  "46437", "40981", "51523", "55270", "46489",
  // Sub-16 M
  "40534", "43732", "40115", "51074", "46591",
  // Sub-18 F
  "43832", "41131", "47078", "46589", "40990",
  // Sub-18 M
  "42845", "37010", "42205", "39552", "38334",
];

/** Mapa fed → posição de prioridade (0 = topo). */
export const PIN_RANK: Map<string, number> = new Map(
  PINNED_TOP_FEDS.map((fed, i) => [fed, i]),
);
