/**
 * src/constants/simuladorPlayers.ts
 *
 * Quem aparece no selector de jogador do /simulador (decidido 2026-09-15):
 * o Manuel, pessoas escolhidas à mão, os regionais da Madeira que o site
 * segue, o PJA e a coorte do percurso dos juniores.
 */

export interface SimNamedPlayer {
  fed: string;
  /** Nome a mostrar — obrigatório para quem não está no players.json. */
  label?: string;
  sex?: "M" | "F";
  /** Grupo do selector em que aparece. */
  group: "Absolutos" | "Madeira";
}

/** Escolhidos à mão. Os que não estão no players.json (sem histórico de voltas
 *  no site) têm o HI lido do cadastro federados.json. */
export const SIM_NAMED_PLAYERS: SimNamedPlayer[] = [
  { fed: "54907", label: "Manuel Medeiros (pai)", sex: "M", group: "Absolutos" },
  { fed: "6437", label: "Bento Louro", sex: "M", group: "Absolutos" },
  { fed: "2217", label: "Joana Sousa", sex: "F", group: "Absolutos" },
  { fed: "36844", label: "Henrique Cunha", sex: "M", group: "Absolutos" },
  { fed: "59252", label: "Gastão Thomaz Medeiros", sex: "M", group: "Madeira" },
  { fed: "41121", label: "André Gonçalves", sex: "M", group: "Madeira" },
];

/** Região dos regionais "perto de nós" (campo `region` do players.json). */
export const SIM_REGION = "Madeira";

/** Espelho do COHORT de scripts/build-percurso-path.js — os 18 rapazes cujo
 *  percurso a /analise-percurso-juniores segue. Um teste compara as listas. */
export const PERCURSO_COHORT_FEDS = [
  "40452", "31831", "41294", "40682", "34186", "40534", "37010", "42205", "40112",
  "39701", "45340", "42845", "40115", "35404", "36638", "37152", "42908", "35849",
];
