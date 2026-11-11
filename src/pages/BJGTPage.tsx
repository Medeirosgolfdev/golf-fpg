/**
 * BJGTPage.tsx — módulo de dados BJGT/EOWAGR/FCG/JWGC para a /major
 *
 * ⚠ Já NÃO é uma página (a rota /bjgt-legacy redirecciona para /major desde
 * 02/07/2026). Exporta `bjgtEvoFor` (evolução ano-a-ano) e `bjgtMajorDivision`
 * (a divisão do CircuitShell). Os dados (lista de ficheiros, normalização e
 * conversão para o formato FPG) vivem em src/data/major/bluegolf.ts.
 *
 * Até 11/11/2026 tinha aqui os blocos «Dificuldade por buraco» e «Análise
 * Manuel»: passaram a globais (`ui/AnaliseDaVolta.tsx`), postos pelo
 * TournamentDetail em todas as páginas.
 */
import { isManuelByName as isM } from "../constants/manuel";
import type { ScorecardOptions } from "./FPGPage";
import { buildEvoMap, type EvoEntry, type EvoInput } from "../hooks/useEvoComparison";
import { evoDaDivisao } from "../ui/evo";
import type { CircuitDivision } from "../ui/circuit/types";
import { intlScorecardOptions } from "../data/intlScorecard";
import { blueGolfToTournament, type TDef } from "../data/major/bluegolf";

/** Coluna ANO (class year) — só JWGC/FCG a expõem. */
function bjgtScorecardOptions(showClass = false): ScorecardOptions {
  return intlScorecardOptions({ showClass });
}

/** Evolução ano-a-ano para um TDef (bidirecional 2025↔2026). Pura (sem hooks). */
export function bjgtEvoFor(cur: TDef, all: TDef[]): { evo?: Map<string, EvoEntry>; evoYear?: string } {
  const refYear = cur.year === 2026 ? 2025 : cur.year === 2025 ? 2026 : 0;
  if (!refYear) return {};
  const refDefs = all.filter((t) => t && t.year === refYear && t.series === cur.series);
  if (!refDefs.length) return {};
  const curNR = Math.max(...cur.data.players.map((p) => p.rounds.length), 0);
  const curParTotal = cur.data.parTotal * curNR;
  const input: EvoInput = {
    // Só quem jogou TODAS as voltas (cut/WD com menos voltas dava «−40», «Δ −85»).
    currentPlayers: cur.data.players.filter((p) => p.total != null && p.rounds.length === curNR)
      .map((p) => ({ name: p.name, value: p.total! - curParTotal, category: cur.category })),
    referencePlayers: refDefs.flatMap((t) => {
      const tNR = Math.max(...t.data.players.map((p) => p.rounds.length), 0);
      const tPar = t.data.parTotal * tNR;
      return t.data.players.filter((p) => p.total != null && p.rounds.length === tNR)
        .map((p) => ({ name: p.name, value: p.total! - tPar, category: t.category }));
    }),
    referenceYear: String(refYear),
    isManuel: isM,
  };
  const raw = buildEvoMap(input);
  if (cur.year === 2025 && raw.evoMap) {
    const flipped = new Map<string, EvoEntry>();
    for (const [k, v] of raw.evoMap) flipped.set(k, { ...v, delta: -v.delta, from: v.to, to: v.from });
    return { evo: flipped, evoYear: raw.evoYear };
  }
  return { evo: raw.evoMap, evoYear: raw.evoYear };
}

/** CircuitDivision de um torneio BJGT/EOWAGR (results + evolução ano-a-ano). */
export function bjgtMajorDivision(def: TDef, evo: Map<string, EvoEntry> | undefined, evoYear: string | undefined, sourceUrl?: string): CircuitDivision {
  const data = def.data;
  const results = blueGolfToTournament(data, def);
  return {
    key: def.id,
    escalao: def.category,
    tabLabel: def.category,
    hasManuel: data.players.some((p) => isM(p.name)),
    links: sourceUrl ? [{ label: "BlueGolf", url: sourceUrl, icon: "🔗" }] : undefined,
    results,
    scOptions: bjgtScorecardOptions(results.players.some((p) => (p as unknown as { _classYear?: number | null })._classYear != null)),
    roundLabels: def.roundDates?.map((d, i) => `R${i + 1} · ${d}`),
    ...evoDaDivisao(results, evo, evoYear),
  };
}
