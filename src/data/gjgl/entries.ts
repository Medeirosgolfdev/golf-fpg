/**
 * entries.ts — Catálogo + índice slim do GJGL → entradas do CircuitShell, e o
 * detalhe de cada torneio (lazy) → divisões U14/U18/U23.
 *
 * Tirado da GlobalJuniorPage a 23/10/2026 (fase 5 do plano) — igual ao que estava lá.
 */
import { withDivisionModel } from "../model/division";
import { cachedFetchJson } from "../fetchCache";
import { isManuelByName as isM } from "../../constants/manuel";
import type { CircuitEntry, CircuitDivision, CircuitLink } from "../../ui/circuit/types";
import type { Catalog, GjglIndex, GjglData, GjglOverrides } from "./types";
import { divisionToTournament, gjglScorecardOptions, gjglTotais, flagForCountry } from "./toTournament";

const OVERRIDES_URL = "/data/gjgl-course-overrides.json";
let _gjglOvr: Promise<GjglOverrides> | null = null;
export function loadGjglOverrides(): Promise<GjglOverrides> {
  if (!_gjglOvr) {
    _gjglOvr = cachedFetchJson<{ overrides: GjglOverrides }>(OVERRIDES_URL)
      .then((d) => d?.overrides || {})
      .catch(() => ({}));
  }
  return _gjglOvr;
}

export const CATALOG_URL = "/data/gjgl-catalog.json";
const dataUrl = (slug: string) => `/data/gjgl/gjgl_${slug}.json`;

/* ═══════════════════════════════════════════════════════════════
   GlobalJuniorPage (NOVO) — assente no CircuitShell partilhado.
   Carregamento LAZY por torneio (catálogo só tem metadados; o detalhe
   carrega gjgl_{slug}.json ao seleccionar). Divisões U14/U18/U23.
   Quando uma divisão não tem hole-by-hole, entrega os totais (`totals`) e o
   shell desenha o Resumo de totais comum.
   ═══════════════════════════════════════════════════════════════ */

/** Carrega o detalhe de um torneio GJGL e constrói as divisões (U14/U18/U23). */
function gjglLoadDivisions(slug: string): Promise<CircuitDivision[]> {
  return Promise.all([cachedFetchJson<GjglData>(dataUrl(slug)), loadGjglOverrides()])
    .then(([d, allOvr]) => {
      if (!d || !d.divisions?.length) return [];
      const ovr = allOvr[slug] ?? null;
      return d.divisions.map((div): CircuitDivision => withDivisionModel(((): CircuitDivision => {
        const tournament = divisionToTournament(d, div, `${d.tournament} — U${div.ak}`, ovr);
        const hasHoleByHole = (tournament.rounds ?? 0) > 0 && tournament.players.length > 0;
        const hasManuel = div.players.some((p) => isM(p.name));
        if (hasHoleByHole) {
          return {
            key: `u${div.ak}`,
            escalao: `U${div.ak}`,
            tabLabel: `U${div.ak}`,
            hasManuel,
            results: tournament,
            scOptions: gjglScorecardOptions(!!ovr),
          };
        }
        return {
          key: `u${div.ak}`,
          escalao: `U${div.ak}`,
          tabLabel: `U${div.ak} (${div.players.length})`,
          hasManuel,
          // Só totais → o shell desenha o TotalsResumo comum (ui/circuit/divisionPieces).
          totals: gjglTotais(div),
        };
      })()));
    })
    .catch(() => []);
}

/** Catálogo + índice slim → entries do CircuitShell. Metadados (data, campo,
 *  rondas, nº jog, divisões) e links oficiais vêm do índice; o detalhe completo
 *  (scorecards) continua a ser carregado de forma lazy ao seleccionar. */
export function buildGjglEntries(catalog: Catalog, index: GjglIndex | null, ovr?: GjglOverrides | null): CircuitEntry[] {
  return catalog.tournaments
    .filter((t) => t.gjgl_tournamentid)
    .map((t): CircuitEntry => {
      const ix = index?.tournaments?.[t.slug];
      const courseOvr = ovr?.[t.slug]?.course;
      const links: CircuitLink[] = [];
      if (ix?.tour_url) links.push({ label: "Página oficial", url: ix.tour_url, icon: "🌐" });
      if (ix?.livescoring_url) links.push({ label: "Live scoring", url: ix.livescoring_url, icon: "📡" });
      if (ix?.entrylist_url) links.push({ label: "Inscritos", url: ix.entrylist_url, icon: "👥" });
      return {
        id: t.slug,
        year: t.year,
        name: `${flagForCountry(t.country) || "🏳"} ${t.title}`.trim(),
        federation: t.country,
        course: courseOvr ?? ix?.course ?? undefined,
        dateStart: ix?.start_date ?? undefined,
        dateEnd: ix?.end_date ?? undefined,
        roundsCount: ix?.rounds ?? undefined,
        divisionCount: ix?.divisions?.length ?? undefined,
        playerCount: ix?.playerCount ?? undefined,
        hasManuel: ix?.hasManuel,
        hasPt: ix?.hasPt,
        links: links.length ? links : undefined,
        loadDivisions: () => gjglLoadDivisions(t.slug),
      };
    });
}
