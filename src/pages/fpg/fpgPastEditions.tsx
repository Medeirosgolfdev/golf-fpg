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

/**
 * Aliases CURADOS de edições que mudaram de nome/rótulo entre anos. A heurística
 * automática (`tournamentFamilyKey`) não liga edições rebaptizadas — ex.: "World
 * Kids Golf 2024 Under 14" (ccode 179) e "Amendoeira World Kids Golfe 2026 Sub 14"
 * dão family keys diferentes (prefixo "Amendoeira" + "Golf"/"Golfe" + "Under"/"Sub").
 *
 * Cada regra:
 *  - `match` (testado contra o family key CRU) → colapsa para um `canon`
 *    ESCALÃO-INDEPENDENTE partilhado por todas as edições/escalões do evento;
 *  - `deriveEscFromName` → quando a fonte não traz escalão (as provas de 2024
 *    têm `escalao` vazio), deriva-o do nome no formato "Sub N" para casar com o
 *    `matchDivision` (que separa os escalões dentro da família).
 *
 * ⚠ Só afecta a tab de edições anteriores da FPGPage — NÃO mexe no
 * `tournamentFamilyKey` global (usado por England/FFG/RFEG/MAJOR). Derivar
 * escalão do nome GLOBALMENTE re-partiria o Miramar U25 (o "U25" do nome daria
 * "Sub 25" e deixava de casar com a edição anterior sem escalão).
 */
interface EditionAlias { match: RegExp; canon: string; deriveEscFromName?: boolean }
const EDITION_ALIASES: EditionAlias[] = [
  { match: /\bworld kids golfe?\b/, canon: "world kids golf", deriveEscFromName: true },
];
function editionAliasFor(rawFamKey: string | null): EditionAlias | null {
  if (!rawFamKey) return null;
  return EDITION_ALIASES.find(a => a.match.test(rawFamKey)) ?? null;
}
/** Escalão "Sub N" a partir do nome ("Under 14"/"U14"/"Sub 14" → "Sub 14";
 *  "Under 16/18" → "Sub 16"). Usado só para eventos com `deriveEscFromName`. */
function escFromName(name?: string | null): string | null {
  const m = String(name || "").match(/\b(?:sub|under|u)[\s\-_]?(\d{1,2})\b/i);
  return m ? `Sub ${m[1]}` : null;
}

/** Chave de agrupamento de edições: clube + família do nome (com aliases curados). */
function editionKey(t: Tournament): string | null {
  const raw = tournamentFamilyKey(t.name);
  if (!raw) return null;
  const fam = editionAliasFor(raw)?.canon ?? raw;
  return `${t.ccode || "?"}|${fam}`;
}

/** Converte um torneio FPG numa `CircuitEntry` (uma coluna = uma edição). */
function toEntry(t: Tournament): CircuitEntry {
  const alias = editionAliasFor(tournamentFamilyKey(t.name));
  const esc = t.escalao || (alias?.deriveEscFromName ? escFromName(t.name) : null) || "—";
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
