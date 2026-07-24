/**
 * src/pages/fpg/fpgPastEditions.tsx
 *
 * Tab "Edições anteriores" para a FPGPage — liga a lógica partilhada de
 * `ui/circuit/pastEditions.tsx` (a mesma que serve England/FFG/GJGL/RFEG/MAJOR)
 * aos torneios FPG que a página já tem em memória (pull-torneios + jovens).
 *
 * Identidade de uma "edição": mesmo CLUBE organizador (`ccode`) + mesma família
 * de nome (`tournamentFamilyKey`, que remove ano/ordinal). O ccode entra na
 * chave DE PROPÓSITO — sem ele, torneios homónimos de clubes diferentes
 * ("Taça de Natal" em dois clubes) casariam como falsas edições. As edições
 * cruzam anos porque a FPGPage carrega todos os `pull-torneios*.json`.
 *
 * A tab só aparece quando há ≥2 edições do mesmo torneio (o `tournamentFamilyKey`
 * garante que provas de nome único ficam singletons e a tab esconde-se).
 */
import type { Tournament } from "../../data/fpgTypes";
import type { CircuitEntry, CircuitDivision } from "../../ui/circuit/types";
import { tournamentFamilyKey, CircuitPastEditionsTab } from "../../ui/circuit/pastEditions";

/** Chave de agrupamento de edições: clube + família do nome. */
function editionKey(t: Tournament): string | null {
  const fam = tournamentFamilyKey(t.name);
  if (!fam) return null;
  return `${t.ccode || "?"}|${fam}`;
}

/** Converte um torneio FPG numa `CircuitEntry` (uma coluna = uma edição). */
function toEntry(t: Tournament): CircuitEntry {
  const esc = t.escalao || "—";
  const div: CircuitDivision = { key: "d", escalao: esc, tabLabel: esc, results: t };
  return {
    id: `${t.ccode}-${t.tcode}`,
    year: parseInt(String(t.date || "").slice(0, 4), 10) || null,
    name: t.name,
    tcode: String(t.tcode || ""),
    course: t.campo || undefined,
    dateStart: t.date || undefined,
    divisions: [div],
  };
}

/**
 * Índice `editionKey → CircuitEntry[]` construído UMA vez sobre o pool de
 * torneios (memoizar no componente). Dedup por `ccode-tcode`, preferindo a
 * versão com mais jogadores (a scrapeada > a sintética/reconstruída).
 */
export function buildFpgEditionsIndex(pool: Tournament[]): Map<string, CircuitEntry[]> {
  const byKey = new Map<string, Map<string, Tournament>>();
  for (const t of pool) {
    const k = editionKey(t);
    if (!k) continue;
    let m = byKey.get(k);
    if (!m) { m = new Map(); byKey.set(k, m); }
    const id = `${t.ccode}-${t.tcode}`;
    const prev = m.get(id);
    if (!prev || (t.players?.length ?? 0) > (prev.players?.length ?? 0)) m.set(id, t);
  }
  const out = new Map<string, CircuitEntry[]>();
  for (const [k, m] of byKey) out.set(k, [...m.values()].map(toEntry));
  return out;
}

/**
 * Devolve o(s) extraTab(s) "Edições anteriores" para o torneio aberto, ou
 * `undefined` quando não há ≥2 edições. Passar directamente ao `extraTabs` do
 * TournamentDetail (aparece no fim da barra, nunca é o tab auto-seleccionado).
 */
export function fpgPastEditionsTabs(
  index: Map<string, CircuitEntry[]>,
  current: Tournament | null | undefined,
): { key: string; label: string; content: React.ReactNode }[] | undefined {
  if (!current) return undefined;
  const k = editionKey(current);
  if (!k) return undefined;
  const entries = index.get(k);
  if (!entries || entries.length < 2) return undefined;
  const division = current.escalao || "—";
  return [{
    key: "past-editions",
    label: "Edições anteriores",
    content: <CircuitPastEditionsTab editions={entries} division={division} />,
  }];
}
