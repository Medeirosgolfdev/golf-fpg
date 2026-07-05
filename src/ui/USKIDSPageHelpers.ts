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
  
  
  
} from "./uskidsData";

// Re-export helpers
export {
  
  
  
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
  
} from "./uskidsHelpers";
