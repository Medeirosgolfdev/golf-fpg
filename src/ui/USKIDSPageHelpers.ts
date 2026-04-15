/**
 * USKIDSPageHelpers — Re-export hub
 *
 * Consolidates re-exports from two focused modules:
 *   - uskidsData.ts: All data constants
 *   - uskidsHelpers.ts: All runtime helpers and React context
 *
 * All existing imports from USKIDSPageHelpers continue to work unchanged.
 */

// Re-export data constants
export {
  REGIONAL_CHAMPIONSHIPS,
  LINKS_EXTRA,
  TEES_LOOKUP,
  USA_KEYWORDS,
  EURO_KEYWORDS,
  NON_USKIDS_KEYWORDS,
} from "./uskidsData";

// Re-export helpers
export {
  shortTornName,
  tornCanon,
  hasCanon,
  torneioRegiao,
  isUSKidsTorneio,
  badgeVagas,
  fmtTs,
  diasAte,
  isTerminado,
  isWD,
  ArMapCtx,
  type TorneioComManuel,
  seriesBase,
  playerSeriesResult,
  fmtPosRivais,
} from "./uskidsHelpers";
