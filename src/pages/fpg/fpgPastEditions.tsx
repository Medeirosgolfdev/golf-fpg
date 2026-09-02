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
interface EditionAlias { match: RegExp; canon: string; course?: RegExp; deriveEscFromName?: boolean }
const EDITION_ALIASES: EditionAlias[] = [
  // World Kids @ Amendoeira (ccode 179) — o nome variou muito entre anos:
  //   2024 "World Kids Golf 2024 Under N" · 2025 "Amendoeira World Kids Sub N"
  //   (sem "Golf") · 2026 "Amendoeira World Kids Golfe 2026 Sub N" · e há uma
  //   gralha na fonte ("World Kis Sub 14"). Casar só por "World Ki(d)s".
  { match: /\bworld ki[dt]?s\b/, canon: "world kids golf", deriveEscFromName: true },
  // Miramar Internacional Open — Sub 10 (ccode 003). O Sub-10 é uma prova
  // SEPARADA do U25 (9 buracos/dia vs 18) e o nome dela variou todos os anos:
  //   2024 "Miramar Internacional Open U25 ( Sub10)" → …open u25 sub10
  //   2025 "Miramar Internacional Open - sub 10"     → …open sub 10   ← sem "u25"
  //   2026 "X Miramar Internacional Open U25 - Sub10"→ …open u25 sub10
  // Três family keys para a mesma prova: a edição de 2025 ficava singleton e
  // não aparecia na tab. Colapsar todas as variantes que mencionem "sub 10".
  //
  // ⚠ Deliberadamente SEM deriveEscFromName: o "U25" do nome vem ANTES do
  // "Sub10", e o escFromName apanha a primeira ocorrência — daria "Sub 25"
  // ao Sub-10. Não é preciso: as três edições já trazem escalao "Sub 10".
  //
  // O U25 não precisa de regra (o family key dele já é estável nos três anos)
  // e não é afectado por esta: "…open u25" não contém "sub 10".
  { match: /^miramar internacional open\b.*\bsub\s?10\b/, canon: "miramar internacional open sub 10" },
  // PJA @ Terras da Comporta (ccode 192). A organização rebaptiza a prova
  // todos os anos — "PJA TOUR Grand Final" (2024), "PJA Race to Dunas" (2025,
  // no TORRE), "Race to Dunas G. Final" (2025, nas DUNAS) — e o resultado
  // eram quatro family keys, quatro singletons e a tab escondida em todas.
  //
  // O que é estável não é o nome: é o CAMPO. São duas provas distintas que
  // se repetem lá todos os anos — a etapa de Setembro no Torre e a Grande
  // Final de Novembro nas Dunas — e o campo separa-as sem ambiguidade. Daí o
  // `course` (⚠ testado contra `t.campo`, NUNCA contra o nome: "PJA Race to
  // Dunas" tem "Dunas" no nome mas joga-se no Torre, e é precisamente esse o
  // caso que uma regra por nome mandava para o grupo errado).
  { match: /\bdunas\b|\bgrand\w*\b/, course: /\bdunas\b/i, canon: "pja comporta grande final" },
  // ⚠ O match é largo de propósito: o nome desta etapa ainda vai mudar (o
  // torneio de 2026 entra com nome provisório e adopta o oficial da FPG quando
  // os resultados saírem). Uma regra colada ao nome fazia a tab desaparecer
  // nessa altura, em silêncio. Quem manda é o `course`.
  { match: /^pja\b|\btorre\b|\brace to dunas\b/, course: /\btorre\b/i, canon: "pja comporta torre" },
];
function editionAliasFor(rawFamKey: string | null, campo?: string | null): EditionAlias | null {
  if (!rawFamKey) return null;
  return EDITION_ALIASES.find(a =>
    a.match.test(rawFamKey) && (!a.course || a.course.test(String(campo || "")))) ?? null;
}
/** Escalão "Sub N" a partir do nome ("Under 14"/"U14"/"Sub 14" → "Sub 14";
 *  "Under 16/18" → "Sub 16"). Usado só para eventos com `deriveEscFromName`. */
function escFromName(name?: string | null): string | null {
  const m = String(name || "").match(/\b(?:sub|under|u)[\s\-_]?(\d{1,2})\b/i);
  return m ? `Sub ${m[1]}` : null;
}

/**
 * ccodes ALTERNATIVOS do mesmo organizador. O Porto Santo Golfe publica ora sob
 * 183 ora sob 920 (medido: José Rosado 2024 = 920/10077, 2025 = 183/10142,
 * 2026 = 920/10088 — o mesmo torneio, mesmo campo). Sem esta fusão cada ccode
 * ficava singleton e a tab de edições nunca aparecia nesses torneios.
 */
const CCODE_ALIASES: Record<string, string> = { "920": "183" };

/** Chave de agrupamento de edições: clube + família do nome (com aliases curados). */
function editionKey(t: Tournament): string | null {
  const raw = tournamentFamilyKey(t.name);
  if (!raw) return null;
  const fam = editionAliasFor(raw, t.campo)?.canon ?? raw;
  const cc = CCODE_ALIASES[String(t.ccode)] ?? t.ccode;
  return `${cc || "?"}|${fam}`;
}

/** Converte um torneio FPG numa `CircuitEntry` (uma coluna = uma edição). */
function toEntry(t: Tournament): CircuitEntry {
  const alias = editionAliasFor(tournamentFamilyKey(t.name), t.campo);
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
