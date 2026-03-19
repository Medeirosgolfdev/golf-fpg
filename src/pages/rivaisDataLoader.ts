/**
 * rivaisDataLoader.ts — re-export de KIDSdataLoader
 *
 * Este ficheiro existe para compatibilidade com importações existentes
 * (ex: KIDSPage.tsx que importa de "./rivaisDataLoader").
 * Toda a lógica real vive em KIDSdataLoader.ts — não duplicar aqui.
 *
 * Se precisares de importar algo novo, importa sempre de KIDSdataLoader.
 */
export {
  normName,
  getScorecards,
  buildAutoRivals,
  invalidateAutoRivalsCache,
  uskTournNames,
  uskFieldSizes,
} from "./KIDSdataLoader";

export type {
  AutoTournResult,
  AutoRivalPlayer,
  AutoScorecard,
  LoadProgress,
} from "./KIDSdataLoader";
