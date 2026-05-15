/**
 * kids2/knownScorecards.ts — Scorecards top-players hardcoded
 *
 * Substitui kids/courseScorecards.ts. Diferenças:
 *   1. Lookup por (junior, tournament) em vez de nome string solto.
 *      Aceita aliases do junior e múltiplas chaves do torneio (id, name,
 *      shortName, seriesId). Match por nome normalizado (NFD + lowercase).
 *   2. API uniforme: getKnownScorecard(junior, tournament) → { par, si, meters, rounds, source } | null.
 *   3. Helper de merge: applyKnownScorecard(flight, result, fallback) devolve
 *      flight/result enriquecidos para o caso de o canónico não ter par ou
 *      strokes hbh. Os componentes (InlineScorecard, ScorecardModal) podem
 *      usar isto ANTES de renderizar — não precisam de saber que existe um
 *      fallback.
 *   4. Schema preparado para futuro: quando o aggregator começar a popular
 *      `Tournament.extra.knownScorecards`, basta acrescentar um lookup
 *      adicional aqui (linha única em getKnownScorecard).
 *
 * Fonte dos dados: cards públicos das organizações (WJGC, EOWAGR), copiados
 * manualmente do site oficial. Servem como ground truth quando o scraper
 * só apanha pos+gross sem hbh.
 */

import {
  VP_WJGC26_PAR, VP_WJGC26_SI, VP_WJGC26_M,
  VP_ALFERINI_PAR, VP_ALFERINI_SI, VP_ALFERINI_M,
  LT_FORET_PAR, LT_FORET_SI, LT_FORET_M,
} from "../../data/rivalData";
import type { Junior, Tournament, Flight, Result } from "./data";

// ═══════════════════════════════════════════════════════════════════════
// Tipos
// ═══════════════════════════════════════════════════════════════════════

export interface KnownScorecard {
  /** Par por buraco (18 entradas; em 9H, posições não jogadas têm par=0). */
  par: readonly number[];
  /** Stroke index por buraco (18 entradas). Pode ser vazio. */
  si: readonly number[];
  /** Distância em metros por buraco (18 entradas). Pode ser vazio. */
  meters: readonly number[];
  /** strokes[round-1][hole] — uma linha por ronda. */
  rounds: readonly (readonly number[])[];
  /** Texto descritivo para mostrar como rodapé "Fonte: …". */
  source: string;
}

interface KnownTournamentEntry {
  /** Nomes/IDs/shortNames possíveis do torneio. Match por normName.
   *  Match aceita igualdade exacta OU substring em qualquer direcção
   *  (lookup substring ⊆ key OU key ⊆ lookup), o que torna o resolver
   *  robusto a variantes ("WJGC 2026" vs "World Junior Golf Championship 2026"). */
  matchKeys: readonly string[];
  par: readonly number[];
  si: readonly number[];
  meters: readonly number[];
  /** Map<normName(player), strokes[][]> — preenchido por buildPlayerCards. */
  cards: Map<string, readonly (readonly number[])[]>;
  source: string;
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers de normalização
// ═══════════════════════════════════════════════════════════════════════

function normName(s: string | undefined | null): string {
  return (s || "").trim().toLowerCase()
    .replace(/[-'’.·\/]+/g, " ")
    .replace(/\s+/g, " ")
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function buildPlayerCards(
  arr: readonly { n: string; rds: readonly (readonly number[])[] }[],
): Map<string, readonly (readonly number[])[]> {
  const m = new Map<string, readonly (readonly number[])[]>();
  for (const c of arr) {
    const key = normName(c.n);
    if (!m.has(key)) m.set(key, c.rds);
  }
  return m;
}

// ═══════════════════════════════════════════════════════════════════════
// Dados — WJGC 2026 Boys 10-11 (Villa Padierna Flamingos)
// ═══════════════════════════════════════════════════════════════════════

const WJGC26_B1011_CARDS = buildPlayerCards([
  { n: "Dmitrii Elchaninov",      rds: [[4,3,3,4,4,4,3,4,4,5,4,4,3,4,5,3,4,4],[5,3,5,4,3,5,4,3,3,4,4,3,5,4,5,2,3,4],[6,3,4,3,3,5,5,2,4,5,5,2,4,4,5,3,4,5]] },
  { n: "William Harran",          rds: [[7,4,5,3,4,5,4,3,4,5,5,4,4,3,4,3,4,4],[5,3,4,4,3,6,3,3,4,4,5,3,4,3,7,3,3,4],[4,3,4,3,5,4,4,4,4,5,6,2,5,4,5,3,5,5]] },
  { n: "Sean Wilding",            rds: [[5,3,4,4,4,5,2,3,4,5,5,3,3,4,5,3,4,5],[5,4,5,3,4,6,4,3,4,5,5,3,4,3,5,2,5,4],[6,4,5,3,3,5,5,2,4,5,5,4,6,4,6,3,5,4]] },
  { n: "Weilian Sun",             rds: [[5,3,4,5,5,5,5,3,4,4,6,3,5,4,4,3,5,4],[5,3,4,2,4,6,3,3,4,5,4,3,4,4,6,3,6,4],[8,3,3,4,4,4,5,2,4,5,5,3,4,3,7,3,3,5]] },
  { n: "Philippe Xiao",           rds: [[5,3,4,3,4,5,5,3,4,5,5,3,5,3,6,3,4,4],[6,4,4,3,3,5,3,3,4,5,6,2,4,4,5,4,4,4],[6,4,4,3,5,6,5,2,4,5,5,4,5,6,6,2,4,4]] },
  { n: "Hugo Strasser",           rds: [[5,3,4,3,4,6,3,3,4,5,5,4,4,3,6,3,4,4],[6,3,4,3,4,4,4,3,6,5,5,3,5,3,4,3,4,4],[5,3,3,4,5,6,3,3,5,5,6,4,6,4,7,3,5,5]] },
  { n: "Christian Chepishev",     rds: [[4,4,5,3,4,5,4,3,4,5,5,4,5,4,6,4,3,3],[6,3,5,3,4,5,3,4,4,5,6,2,4,5,5,3,4,5],[5,4,4,3,4,5,6,4,3,6,5,3,5,6,5,3,4,4]] },
  { n: "Henry Bucys",             rds: [[6,3,5,4,4,5,4,4,5,5,5,4,4,4,5,3,4,5],[5,3,4,3,4,5,4,3,4,4,5,3,5,4,6,4,4,6],[4,3,4,3,3,4,4,4,4,6,5,5,5,4,6,4,4,4]] },
  { n: "Diego Gross Paneque",     rds: [[6,3,4,3,4,5,5,3,5,5,5,4,4,3,5,4,3,5],[7,3,4,3,4,5,4,3,4,5,6,3,5,4,6,2,3,4],[5,3,5,5,5,4,5,4,5,5,5,4,4,4,5,3,5,5]] },
  { n: "Manuel Francisco Medeiros", rds: [[9,3,3,4,5,5,4,3,4,5,5,5,5,4,4,3,3,5],[5,3,4,4,3,5,5,4,4,6,5,4,4,4,7,3,4,4],[5,3,3,3,4,7,3,3,4,4,6,3,5,4,6,4,4,4]] },
  { n: "Leon Schneitter",         rds: [[5,3,4,4,5,6,4,3,5,4,5,3,3,4,6,3,4,5],[8,4,4,5,4,4,4,2,4,6,5,4,6,4,5,3,4,4],[5,4,5,3,4,5,5,4,5,4,5,4,5,4,8,2,3,5]] },
  { n: "Álex Carrón",             rds: [[5,3,4,3,4,5,4,3,4,8,5,4,4,4,4,3,4,5],[6,3,5,4,5,5,4,2,5,4,5,3,5,4,7,2,5,8],[5,3,4,3,4,6,4,4,4,7,7,4,5,4,6,3,5,5]] },
  { n: "Benji Botham",            rds: [[5,3,3,3,5,6,4,3,4,8,6,5,5,4,4,4,4,5],[6,3,4,4,4,5,5,3,6,4,5,3,5,4,7,3,5,4],[6,3,4,4,5,5,4,3,7,5,6,4,5,4,6,3,5,4]] },
  { n: "Myles Jones",             rds: [[7,4,5,3,4,6,4,3,4,5,6,3,4,4,5,3,4,5],[5,3,4,3,4,5,4,3,5,6,6,3,7,6,8,4,6,6],[5,4,4,4,4,6,5,3,4,4,6,3,4,4,5,3,5,5]] },
  { n: "Oscar Bunt",              rds: [[9,3,4,4,4,5,4,3,5,4,5,3,3,4,6,3,5,8],[5,3,5,4,5,5,3,3,4,4,5,5,6,4,5,4,5,5],[5,5,4,3,4,8,4,4,3,4,5,5,4,5,6,4,5,5]] },
  { n: "Dylan Dedaj Ungureanu",   rds: [[5,3,4,3,4,6,4,4,4,5,9,3,5,5,5,4,5,6],[6,2,5,4,4,5,5,3,6,5,5,3,5,5,6,3,5,4],[5,3,4,2,4,6,5,3,4,5,7,3,4,5,7,4,5,4]] },
  { n: "Alexis Beringer",         rds: [[5,4,5,3,4,6,3,5,6,6,5,3,5,4,8,3,4,4],[7,3,4,4,4,5,3,3,5,8,6,4,4,3,7,3,5,4],[4,5,5,4,4,5,7,4,3,5,5,3,5,4,5,3,5,5]] },
  { n: "Hermes Stuart Cañizares Plaja", rds: [[7,4,3,4,4,5,4,3,4,4,5,3,4,4,7,3,4,5],[5,5,5,3,4,5,4,3,5,8,8,3,4,4,6,3,4,4],[5,4,5,2,5,5,4,4,8,4,6,3,10,3,7,3,5,5]] },
  { n: "Niko Alvarez Van Der Walt", rds: [[5,3,4,5,4,5,4,4,5,5,5,4,4,4,7,3,4,6],[5,7,5,3,3,6,3,3,3,4,5,4,5,4,9,3,5,9],[5,3,6,3,3,5,4,4,4,6,7,4,5,4,5,3,6,5]] },
  { n: "Miroslavs Bogdanovs",     rds: [[5,3,5,3,4,4,4,2,5,5,5,3,5,4,9,4,4,4],[4,4,4,3,4,5,3,3,11,6,5,4,6,5,6,3,4,6],[6,5,4,4,4,5,4,3,4,6,7,4,6,4,8,4,5,5]] },
  { n: "Buster Airey",            rds: [[6,3,4,3,4,5,4,3,4,7,4,4,5,5,6,3,4,5],[7,4,5,5,4,5,4,4,5,6,5,3,6,5,5,4,4,4],[7,3,5,3,5,5,5,4,4,8,5,4,6,4,6,4,5,5]] },
  { n: "Elijah Gibbons",          rds: [[9,3,3,4,4,8,4,3,5,5,5,3,4,5,5,3,5,5],[7,4,4,4,4,7,4,4,4,5,6,4,3,4,6,3,4,6],[6,4,4,3,5,6,3,4,4,9,5,4,6,3,7,5,4,5]] },
  { n: "Henry Liechti",           rds: [[6,3,5,3,4,4,5,3,4,5,5,4,5,4,5,3,6,5],[6,4,5,3,5,5,5,3,4,5,5,4,4,5,10,4,5,5],[7,6,5,4,4,6,4,4,4,7,5,4,4,5,7,3,6,4]] },
  { n: "Kai Russell",             rds: [[7,6,3,3,4,5,4,4,5,5,6,4,3,4,6,3,5,4],[7,4,5,3,4,5,4,6,5,6,6,4,4,4,6,2,5,3],[6,4,5,6,4,5,3,4,4,11,5,3,5,5,9,3,6,4]] },
  { n: "Aineon Hiram Jabonero",   rds: [[5,3,6,5,6,5,4,4,7,5,7,4,5,4,5,4,4,5],[6,4,5,4,5,6,4,2,5,6,5,4,6,4,6,4,5,6],[5,6,5,4,3,6,5,4,4,4,5,4,4,4,5,4,5,5]] },
  { n: "Lukas Doherty",           rds: [[6,3,4,3,5,7,5,3,5,6,6,5,5,5,7,4,5,5],[9,5,5,3,4,4,5,3,4,5,5,3,4,4,7,4,5,6],[6,4,5,3,4,5,5,3,4,5,6,4,5,4,7,3,6,5]] },
  { n: "Elias Didjurgis",         rds: [[6,3,5,3,5,6,5,4,5,6,5,3,5,5,5,4,3,6],[5,3,5,4,4,5,4,4,5,5,6,5,6,4,9,4,5,6],[7,5,4,3,4,6,6,2,6,5,6,3,5,4,7,3,5,5]] },
  { n: "Joe Short",               rds: [[8,4,5,4,4,7,5,4,7,6,5,5,4,5,6,4,6,4],[6,3,3,3,6,7,3,4,6,6,4,5,5,4,7,2,3,6],[6,4,6,3,3,8,6,4,3,5,6,3,5,5,6,7,4,6]] },
  { n: "Rodrigo Palacios Bauer",  rds: [[5,3,3,3,4,5,5,3,4,7,7,3,6,5,6,2,5,6],[5,3,5,4,4,6,5,3,7,10,6,4,5,5,7,4,5,5],[6,4,4,5,4,6,7,4,3,5,10,3,6,4,8,2,5,6]] },
  { n: "Kevin Canton",            rds: [[5,2,5,3,6,7,5,4,4,6,5,2,4,5,8,3,5,6],[6,3,5,3,4,6,4,4,6,6,5,6,5,4,7,3,4,7],[4,3,8,4,5,6,7,2,4,7,6,4,6,5,8,5,9,7]] },
  { n: "James Doyle",             rds: [[6,4,8,4,5,7,4,3,4,5,5,5,4,6,8,4,4,5],[5,4,4,4,4,7,5,3,5,5,7,4,6,5,6,3,5,5],[8,8,6,3,4,7,4,3,5,3,9,6,3,5,8,6,6,4]] },
  { n: "Joseph Robinson",         rds: [[6,7,6,3,4,5,5,3,4,6,7,3,4,5,6,2,4,5],[8,3,5,2,6,5,4,6,5,9,5,4,5,6,6,4,5,5],[8,6,4,4,4,8,7,3,5,5,6,4,6,4,4,4,12,5]] },
  { n: "Arthur Lamblin",          rds: [[7,3,5,3,5,7,4,4,4,7,6,3,6,5,5,5,5,5],[6,4,4,4,4,6,5,6,6,6,6,4,6,5,10,6,5,5],[8,4,5,4,4,8,4,3,5,6,6,3,5,5,6,3,6,7]] },
  { n: "Zeyn Lababedi",           rds: [[6,3,5,5,7,7,4,5,5,5,6,5,6,5,6,4,5,6],[7,3,5,4,5,6,5,5,6,6,6,3,5,5,8,4,5,6],[8,5,5,3,4,6,5,3,4,6,7,4,5,5,9,3,4,5]] },
  { n: "Maddox Tiemann",          rds: [[7,4,4,4,7,6,4,3,4,5,5,5,4,5,8,4,4,6],[5,3,6,3,4,6,5,3,4,7,5,3,6,4,7,3,5,8]] },
]);

// ═══════════════════════════════════════════════════════════════════════
// Dados — EOWAGR 2025 (Le Touquet La Forêt)
// ═══════════════════════════════════════════════════════════════════════

const EOWAGR25_CARDS = buildPlayerCards([
  { n: "Aronas Juodis",     rds: [[4,4,3,6,5,3,4,3,4,4,4,2,5,4,3,4,4,4],[4,6,4,4,5,4,4,2,5,3,4,3,5,3,3,4,4,4],[5,4,3,4,6,3,4,3,4,4,5,3,4,5,3,4,4,4]] },
  { n: "Dmitrii Elchaninov", rds: [[5,4,4,4,5,3,4,3,4,4,4,3,4,4,3,5,4,4],[5,3,4,3,4,2,4,3,4,4,4,3,7,4,3,4,5,4],[5,4,4,4,5,3,4,4,4,4,6,3,4,5,3,5,6,4]] },
  { n: "Emile Cuanalo",     rds: [[5,6,4,4,5,3,5,4,7,4,4,3,4,4,4,4,4,4],[5,4,4,5,4,3,4,3,4,4,5,4,5,4,4,6,4,4],[5,4,4,4,4,3,4,2,3,4,5,3,4,4,4,5,4,4]] },
  { n: "Maxwell Ip",        rds: [[7,4,4,4,7,3,4,3,4,3,4,4,5,4,4,3,4,4],[6,4,4,4,3,3,4,3,8,4,4,3,6,5,4,5,4,5],[5,3,3,4,6,3,4,2,4,4,4,3,7,4,3,5,5,4]] },
  { n: "Yorick De Hek",     rds: [[6,5,4,4,4,4,4,3,5,4,8,4,4,5,3,4,4,4],[5,4,4,5,6,3,4,3,6,4,5,3,5,4,3,4,4,4],[5,4,5,4,4,4,4,3,5,5,5,3,5,5,3,5,5,5]] },
  { n: "Nial Diwan",        rds: [[5,5,4,4,4,3,4,3,4,4,5,4,4,4,3,5,4,4],[6,6,5,4,5,4,5,4,5,6,5,4,3,4,3,4,5,6],[5,4,4,5,6,4,5,4,4,5,5,3,4,4,4,6,5,4]] },
  { n: "Manuel Medeiros",   rds: [[4,3,4,5,6,3,5,4,5,4,5,3,6,4,3,4,4,4],[5,6,4,4,4,4,4,3,4,4,5,4,4,4,4,5,5,4],[7,5,4,6,5,3,4,3,5,3,6,3,6,4,5,6,5,5]] },
  { n: "Muduo Wang",        rds: [[4,6,5,4,5,3,6,4,6,4,6,4,5,5,2,4,5,5],[6,5,5,5,7,3,5,3,5,6,5,5,5,5,6,7,5,5],[7,6,5,5,7,3,5,3,5,5,5,3,5,5,3,5,5,4]] },
]);

// ═══════════════════════════════════════════════════════════════════════
// Dados — WJGC 2026 Boys 12-13 (Villa Padierna Alferini)
// ═══════════════════════════════════════════════════════════════════════

const WJGC26_B1213_CARDS = buildPlayerCards([
  { n: "Marcus Latt",                rds: [[4,3,2,4,4,4,6,3,4,3,3,5,4,3,5,4,3,5],[4,5,3,4,4,4,5,3,5,3,3,5,4,4,4,5,3,3],[4,4,2,5,4,3,5,3,4,3,7,4,4,3,5,5,3,3]] },
  { n: "Skyy Wilding",               rds: [[4,4,3,3,3,4,4,3,4,3,5,5,4,3,3,6,4,5],[6,6,3,5,4,4,5,3,4,4,4,4,4,3,4,4,2,4],[4,5,3,4,4,3,5,3,4,4,5,5,4,3,4,6,3,4]] },
  { n: "Marcus Karim",               rds: [[6,6,3,4,4,4,5,3,4,4,4,5,4,3,3,4,5,4],[6,5,4,5,4,4,4,3,3,4,4,5,6,3,5,5,3,5],[5,6,3,3,3,4,5,3,3,3,4,6,5,3,4,4,4,4]] },
  { n: "Emile Cuanalo",              rds: [[5,7,4,4,4,5,4,4,4,4,4,4,5,3,6,4,4,4],[3,6,3,6,4,4,5,3,3,4,4,5,5,3,3,5,4,4],[5,5,3,5,4,4,4,4,4,4,3,5,4,3,3,5,3,4]] },
  { n: "Maxime Vervaet",             rds: [[5,4,3,4,4,4,5,3,4,3,5,5,4,3,6,5,4,5],[6,4,3,5,5,6,5,3,4,4,5,4,4,3,6,4,3,4],[5,3,4,5,4,6,4,3,4,4,5,4,4,3,5,5,4,4]] },
  { n: "Harrison Barnett",           rds: [[4,5,3,5,7,3,7,3,5,3,4,5,3,3,6,4,3,4],[7,5,3,5,4,4,7,3,4,5,6,4,4,2,5,6,5,4],[5,6,3,4,4,3,5,3,5,3,5,6,4,4,5,6,3,3]] },
  { n: "Kirill Sedov",               rds: [[5,5,2,4,5,3,5,4,5,6,3,7,5,3,3,5,4,4],[4,5,2,5,5,4,5,2,4,3,6,5,5,3,4,6,4,5],[5,4,3,5,5,5,5,3,5,4,3,5,7,3,4,5,4,4]] },
  { n: "Aronas Juodis",              rds: [[6,7,2,5,5,4,6,3,5,4,6,5,4,3,5,5,3,4],[6,5,3,5,5,5,5,4,5,4,5,5,6,3,5,4,5,7],[4,5,3,5,4,3,5,3,5,4,6,5,5,3,4,5,3,4]] },
  { n: "Francisco Carvalho",         rds: [[4,7,2,5,5,5,4,5,4,4,4,5,5,5,5,6,4,4],[6,6,3,5,4,5,6,3,7,4,6,6,6,3,5,7,4,5],[5,6,3,6,5,5,5,2,6,4,5,5,5,3,5,5,3,4]] },
  { n: "César Goossens",             rds: [[8,6,6,6,6,4,8,5,6,4,4,9,6,5,4,8,4,7],[6,7,3,8,7,7,5,3,6,6,6,6,6,3,5,6,5,8],[8,12,3,10,7,4,7,5,5,5,6,6,7,4,6,6,5,5]] },
  { n: "Seb Toft",                   rds: [[5,4,3,4,4,6,4,3,5,5,4,5,6,6,4,5,3,4],[5,5,3,4,6,4,5,4,4,4,4,5,4,4,3,6,4,4],[4,5,3,4,3,4,5,3,4,6,4,5,4,3,6,6,4,5]] },
  { n: "Memphis Greenwood",          rds: [[5,4,3,5,5,4,4,3,3,5,4,6,4,3,3,6,3,5],[5,4,3,4,3,4,4,3,5,6,4,5,5,3,6,6,3,6],[5,5,4,4,4,5,5,3,4,6,4,5,4,3,5,5,3,4]] },
  { n: "Luc Taylor",                 rds: [[5,5,4,4,4,4,4,3,4,3,4,5,5,3,5,6,4,4],[5,5,3,4,4,4,5,4,4,6,4,5,5,3,6,6,3,4],[4,5,3,5,5,3,6,6,4,3,4,5,5,4,3,4,3,6]] },
  { n: "Harry Mody",                 rds: [[4,5,3,3,4,4,5,4,5,3,4,5,4,2,4,7,3,5],[4,4,3,6,4,4,5,4,6,5,4,4,5,3,4,6,3,4],[5,5,4,4,5,4,5,3,4,4,4,5,6,5,4,5,4,4]] },
  { n: "Jack Hollingsworth",         rds: [[5,4,3,4,5,4,6,5,5,3,5,5,5,3,6,5,4,4],[6,5,4,4,4,4,6,4,5,4,4,6,4,4,4,5,3,6],[5,4,4,5,4,4,5,3,4,4,5,5,3,2,5,7,4,4]] },
  { n: "Kris Kuusk",                 rds: [[6,5,4,5,5,4,5,3,4,5,6,5,4,3,5,5,4,5],[4,5,4,4,4,4,6,4,5,5,5,5,5,4,5,7,3,4],[4,4,3,4,4,5,8,3,4,4,5,5,6,4,4,6,3,4]] },
  { n: "David Filip",                rds: [[5,5,4,5,3,4,4,3,5,4,5,6,4,2,4,5,3,4],[6,5,4,4,5,4,5,2,5,4,4,7,6,6,5,5,5,4],[4,5,3,4,4,5,6,3,5,4,9,6,5,3,3,5,4,5]] },
  { n: "Dylan Williams",             rds: [[6,5,4,4,4,9,6,3,6,5,4,4,4,3,3,5,4,4],[7,5,4,5,5,8,7,4,5,5,5,7,6,4,4,4,3,6],[6,4,3,7,4,6,6,3,6,5,4,5,6,3,5,6,3,5]] },
  { n: "Alejandro Gomez Morillo",    rds: [[6,5,4,5,5,5,6,4,6,5,5,5,6,3,6,7,4,8],[4,6,2,6,6,6,7,6,3,5,4,5,5,4,7,6,4,5],[8,6,3,6,3,5,6,5,7,4,5,4,5,3,5,6,3,6]] },
  { n: "Fredrik Sonsteby",           rds: [[6,6,6,6,6,5,6,5,6,4,5,6,5,3,5,6,5,7],[8,6,3,5,6,5,6,4,6,5,5,4,5,4,7,6,3,5],[7,7,3,5,5,5,6,7,7,4,6,7,5,3,5,7,5,5]] },
  { n: "William Ottesen Wang",       rds: [[6,8,3,4,5,6,8,3,4,8,4,6,6,4,7,10,3,5],[7,8,5,6,5,8,6,4,4,4,5,7,7,3,4,5,4,5],[6,6,4,5,5,4,6,5,9,6,7,5,6,5,5,5,4,4]] },
  { n: "Rafael Devic Frugier",       rds: [[4,4,4,5,5,5,6,4,7,4,4,4,4,3,5,7,4,4],[5,4,4,4,4,5,5,4,4,5,6,7,5,4,4,6,2,6],[7,5,4,4,6,4,6,3,7,4,9,4,4,4,4,6,4,4]] },
]);

// ═══════════════════════════════════════════════════════════════════════
// Tabela de torneios conhecidos
// ═══════════════════════════════════════════════════════════════════════

const KNOWN_TOURNAMENTS: readonly KnownTournamentEntry[] = [
  {
    matchKeys: [
      "wjgc26", "wjgc26_b1011",
      "wjgc 2026 boys 10-11", "wjgc 2026 boys 1011",
      "world junior golf championship 2026 boys 10-11",
      "world junior golf championship 2026", // genérico (preferir o flight 10-11 quando houver dúvida)
    ],
    par: VP_WJGC26_PAR, si: VP_WJGC26_SI, meters: VP_WJGC26_M,
    cards: WJGC26_B1011_CARDS,
    source: "WJGC 2026 Boys 10-11 — cards públicos (Villa Padierna Flamingos)",
  },
  {
    matchKeys: [
      "wjgc26_1213", "wjgc26 b1213",
      "wjgc 2026 boys 12-13", "wjgc 2026 boys 1213",
      "world junior golf championship 2026 boys 12-13",
    ],
    par: VP_ALFERINI_PAR, si: VP_ALFERINI_SI, meters: VP_ALFERINI_M,
    cards: WJGC26_B1213_CARDS,
    source: "WJGC 2026 Boys 12-13 — cards públicos (Villa Padierna Alferini)",
  },
  {
    matchKeys: [
      "eowagr25", "eowagr 2025", "eowagr",
      "european open wagr 2025",
      "european open wagr",
      "le touquet la foret",
    ],
    par: LT_FORET_PAR, si: LT_FORET_SI, meters: LT_FORET_M,
    cards: EOWAGR25_CARDS,
    source: "EOWAGR 2025 — cards públicos (Le Touquet La Forêt)",
  },
];

// ═══════════════════════════════════════════════════════════════════════
// Resolver
// ═══════════════════════════════════════════════════════════════════════

/** Match entre uma chave normalizada e o conjunto de matchKeys de um torneio.
 *  Aceita:
 *    - igualdade exacta
 *    - chave do lookup contém uma matchKey (ex: "wjgc 2026 boys 10-11 villa padierna" contém "wjgc 2026 boys 10-11")
 *    - matchKey contém a chave do lookup (ex: matchKey "wjgc26_b1011" contém "wjgc26")
 *  A second condição é a comum: nomes de torneio do canónico tendem a ser
 *  longos ("World Junior Golf Championship 2026 - Boys 10/11"), as matchKeys
 *  são curtas. */
function tournamentMatches(lookupKey: string, entry: KnownTournamentEntry): boolean {
  const lk = normName(lookupKey);
  if (!lk) return false;
  for (const k of entry.matchKeys) {
    const nk = normName(k);
    if (!nk) continue;
    if (nk === lk || lk.includes(nk) || nk.includes(lk)) return true;
  }
  return false;
}

function findEntryForTournament(t: { id?: string; name?: string; shortName?: string; seriesId?: string }): KnownTournamentEntry | null {
  const candidates = [t.id, t.shortName, t.name, t.seriesId].filter((s): s is string => !!s && s.length > 0);
  for (const entry of KNOWN_TOURNAMENTS) {
    for (const c of candidates) {
      if (tournamentMatches(c, entry)) return entry;
    }
  }
  return null;
}

function findCardForJunior(entry: KnownTournamentEntry, j: { canonicalName: string; aliases?: string[] }): readonly (readonly number[])[] | null {
  const names = [j.canonicalName, ...(j.aliases || [])];
  for (const n of names) {
    const k = normName(n);
    if (!k) continue;
    const rds = entry.cards.get(k);
    if (rds) return rds;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════

/** Devolve o scorecard hardcoded para (junior, torneio), se existir.
 *  Match por: tournament.id / shortName / name / seriesId × junior.canonicalName / aliases.
 *
 *  Devolve `null` quando:
 *    - o torneio não está em `KNOWN_TOURNAMENTS`
 *    - o jogador não está nos cards desse torneio (ex: posições 35+ no WJGC26)
 *
 *  Note: este lookup é puramente local. Não chama nada async. */
export function getKnownScorecard(
  junior: { canonicalName: string; aliases?: string[] },
  tournament: { id?: string; name?: string; shortName?: string; seriesId?: string },
): KnownScorecard | null {
  const entry = findEntryForTournament(tournament);
  if (!entry) return null;
  const rounds = findCardForJunior(entry, junior);
  if (!rounds) return null;
  return {
    par: entry.par,
    si: entry.si,
    meters: entry.meters,
    rounds,
    source: entry.source,
  };
}

/** Variante simples para chamadas que só têm uma string (ex: ainda sem Junior). */
export function getKnownScorecardByName(
  playerName: string,
  tournamentMatchKey: string,
): KnownScorecard | null {
  for (const entry of KNOWN_TOURNAMENTS) {
    if (!tournamentMatches(tournamentMatchKey, entry)) continue;
    const rds = entry.cards.get(normName(playerName));
    if (rds) {
      return { par: entry.par, si: entry.si, meters: entry.meters, rounds: rds, source: entry.source };
    }
  }
  return null;
}

/** Verifica se há scorecard hardcoded para o torneio (sem precisar de junior).
 *  Útil para mostrar badge "scorecards públicos disponíveis" nas listas. */
export function tournamentHasKnownScorecards(tournament: { id?: string; name?: string; shortName?: string; seriesId?: string }): boolean {
  return findEntryForTournament(tournament) !== null;
}

// ═══════════════════════════════════════════════════════════════════════
// Helper de merge — para componentes de scorecard
// ═══════════════════════════════════════════════════════════════════════

export interface MergedScorecard {
  /** Par por buraco — preferido o `flight.par`, fallback para o conhecido. */
  par: readonly number[];
  /** Yards por buraco — preferido o `flight.yards`, fallback derivado dos
   *  metros conhecidos (÷0.9144). Vazio se nenhuma fonte tem dados. */
  yards: readonly number[];
  /** Stroke index por buraco — só vem do conhecido (`flight` não tem este campo). */
  si: readonly number[];
  /** Strokes por buraco × ronda — preferido `result.rounds`, fallback para
   *  o conhecido. As entradas têm formato { round: 1-based, strokes: number[] }. */
  rounds: Array<{ round: number; gross?: number | null; strokes?: number[] }>;
  /** Texto a mostrar no rodapé quando algum dado vem de fallback. Null se
   *  só foi usado o canónico. */
  fallbackSource: string | null;
}

/** Merge entre os dados canónicos do flight/result e o scorecard hardcoded.
 *
 *  Política:
 *    - PAR: `flight.par` se tem ≥1 entrada >0, senão `known.par`.
 *    - YARDS: `flight.yards` se tem ≥1 entrada >0, senão `known.meters / 0.9144`.
 *    - SI: só do `known` (canónico não tem este campo).
 *    - ROUNDS: `result.rounds` quando todas as rondas têm strokes hbh
 *      (length ≥ 9 e pelo menos uma entrada >0). Caso contrário `known.rounds`
 *      (mantendo gross original quando existe).
 *
 *  `fallbackSource` é populado se ALGUM campo veio do known. */
export function mergeFlightWithKnown(
  flight: Flight,
  result: Result,
  known: KnownScorecard | null,
): MergedScorecard {
  const flightHasPar = !!(flight.par && flight.par.some((p) => p > 0));
  const flightHasYards = !!(flight.yards && flight.yards.some((y) => y > 0));

  // ROUNDS: para o canónico ser usado, TODAS as rondas têm de ter strokes hbh.
  //   Senão, fallback para known (se existir).
  const canonicalRounds = result.rounds || [];
  const allRoundsHaveStrokes = canonicalRounds.length > 0
    && canonicalRounds.every((r) => Array.isArray(r.strokes) && r.strokes.length >= 9 && r.strokes.some((s) => s > 0));

  let usedFallbackPar = false;
  let usedFallbackYards = false;
  let usedFallbackRounds = false;

  const par = flightHasPar ? flight.par! : (known?.par.slice() || []);
  if (!flightHasPar && known) usedFallbackPar = true;

  const yards = flightHasYards
    ? flight.yards!
    : (known?.meters ? known.meters.map((m) => (m > 0 ? Math.round(m / 0.9144) : 0)) : []);
  if (!flightHasYards && known?.meters?.length) usedFallbackYards = true;

  const si = (known?.si ? known.si.slice() : []);

  let rounds: MergedScorecard["rounds"];
  if (allRoundsHaveStrokes || !known) {
    rounds = canonicalRounds.map((r) => ({ round: r.round, gross: r.gross, strokes: r.strokes ? [...r.strokes] : undefined }));
  } else {
    // Usar known.rounds; preservar gross do canónico quando index bate
    rounds = known.rounds.map((strokes, i) => {
      const cr = canonicalRounds[i];
      const sumKnown = strokes.reduce((s, x) => s + (x > 0 ? x : 0), 0);
      return {
        round: cr?.round ?? (i + 1),
        gross: cr?.gross ?? (sumKnown > 0 ? sumKnown : null),
        strokes: [...strokes],
      };
    });
    usedFallbackRounds = true;
  }

  let fallbackSource: string | null = null;
  if (known && (usedFallbackPar || usedFallbackYards || usedFallbackRounds)) {
    fallbackSource = known.source;
  }

  return { par, yards, si, rounds, fallbackSource };
}

/** Atalho: dada a tripla canónica + junior, devolve directamente o merged
 *  scorecard. Ideal para chamar nos componentes de display. */
export function getMergedScorecard(
  tournament: Tournament,
  flight: Flight,
  result: Result,
  junior: Junior,
): MergedScorecard {
  const known = getKnownScorecard(junior, tournament);
  return mergeFlightWithKnown(flight, result, known);
}
