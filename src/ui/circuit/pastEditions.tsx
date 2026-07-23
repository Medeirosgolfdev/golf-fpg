/**
 * src/ui/circuit/pastEditions.tsx
 *
 * Lógica PARTILHADA da tab "Edições anteriores" — extraída da MajorPage para
 * servir TODAS as páginas de circuito (CircuitShell: RFEG, FFG, England, GJGL,
 * Drive, MAJOR) e também a FPGPage. A tabela em si é o `PastEditionsTable`
 * (apresentação pura); aqui vive o que a alimenta:
 *   - `matchDivision` — casa o mesmo escalão entre edições quando o nome muda
 *     ("Under 15 Girls" 2023 ↔ "Under 14 Girls" 2024);
 *   - `buildPastEditionFromTournament` — converte um Tournament (FPG-format) numa
 *     linha `PastEdition` (jogadores + ordenação que põe finishers à frente de
 *     WD/DNF/em-curso);
 *   - `CircuitPastEditionsTab` — componente que recebe as ENTRADAS irmãs (mesmo
 *     torneio noutros anos), carrega cada uma (lazy, via `entry.loadDivisions`),
 *     casa a divisão e desenha a tabela. É isto que o CircuitShell injecta.
 */
import { useEffect, useState } from "react";
import type { CircuitEntry, CircuitDivision } from "./types";
import type { Tournament as FPGTournament } from "../../data/fpgTypes";
import { isManuelByName as isM } from "../../constants/manuel";
import { isRoundInProgress } from "../../data/fpgUtils";
import LoadingState from "../LoadingState";
import EmptyState from "../EmptyState";
import PastEditionsTable, { type PastEdition } from "./PastEditionsTable";

/**
 * Chave de IDENTIDADE de um torneio entre anos, a partir do nome, para páginas
 * cuja fonte não é uma identidade estável (England/GJGL/FFG/RFEG — a MAJOR usa
 * `e.source`). Remove o que varia entre edições e normaliza:
 *   - prefixo de bandeira (GJGL: "🇪🇸 …") e o "{ano} // " (FFG);
 *   - QUALQUER ano de 4 dígitos e ordinais de edição ("3º", "LXXV", "XXV ed.");
 *   - diacríticos, pontuação e maiúsculas.
 * Nomes que ficam iguais depois disto = mesma prova. Provas que só aparecem uma
 * vez ficam singletons e a tab esconde-se (precisa de ≥2 edições).
 */
export function tournamentFamilyKey(name?: string | null): string | null {
  const base = String(name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F3F4}][\u{1F1E6}-\u{1F1FF}\u{E0000}-\u{E007F}]*/gu, " ") // bandeiras
    .replace(/^\s*\d{4}\s*\/\/\s*/, " ")           // "2025 // " (FFG)
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, " ")             // anos
    .replace(/\b\d{1,3}\s*[oaºª]\b/g, " ")         // ordinais "3º", "12ª"
    .replace(/\b[ivxlcdm]{1,6}\b/g, " ")           // ordinais romanos (LXXV…)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return base || null;
}

/** Sexo + idade a partir do label do escalão — chave para casar edições quando
 *  o nome muda (2023 "Under 15 Girls" → 2024 "Under 14 Girls"). */
export function divKey(label: string): { sex: string; age: number | null } {
  const sex = /\bboys\b|\bvaronil\b|\bmen\b/i.test(label) ? "M" : /\bgirls\b|\bfemenil\b|\bladies\b|\bwomen\b/i.test(label) ? "F" : "?";
  const m = label.match(/\d+/);
  return { sex, age: m ? parseInt(m[0], 10) : null };
}

/** Divisão correspondente noutra edição: nome exacto → sexo+idade → sexo e
 *  idade mais próxima (±1). Devolve null quando o escalão não existiu.
 *  ⚠ Só se casa por idade quando o FORMATO do nome é o mesmo — senão o fallback
 *  de ±1 ano dava "10 and Under" (FM) como sendo "11 & 12". */
export function matchDivision(divisions: CircuitDivision[], label: string): CircuitDivision | null {
  const lab = (d: CircuitDivision) => d.tabLabel || d.escalao || "";
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const exact = divisions.find((d) => norm(lab(d)) === norm(label));
  if (exact) return exact;
  const k = divKey(label);
  if (k.age == null) return null;
  const shape = (s: string) => s.toLowerCase().replace(/\d+/g, " ").replace(/[^a-z]+/g, " ").trim();
  const sh = shape(label);
  const same = divisions.filter((d) => divKey(lab(d)).sex === k.sex && shape(lab(d)) === sh);
  const eq = same.find((d) => divKey(lab(d)).age === k.age);
  if (eq) return eq;
  const near = same
    .map((d) => ({ d, age: divKey(lab(d)).age }))
    .filter((x): x is { d: CircuitDivision; age: number } => x.age != null && Math.abs(x.age - k.age!) <= 1)
    .sort((a, b) => Math.abs(a.age - k.age!) - Math.abs(b.age - k.age!))[0];
  return near ? near.d : null;
}

/** Volta jogada até ao fim — distingue "cartão truncado na fonte" de "volta
 *  ainda a decorrer" (ver `isRoundInProgress`). */
const isFullRound = (r: { gross?: number | null; scores?: number[]; pars?: (number | null)[] }) =>
  (r.gross || 0) > 0 && !isRoundInProgress(r);

/** Converte um Tournament (FPG-format) numa `PastEdition` (uma coluna da tabela).
 *  Devolve null se não houver jogadores com resultado. */
export function buildPastEditionFromTournament(
  t: FPGTournament,
  meta: { year: number; division: string; course?: string | null; url?: string | null },
): PastEdition | null {
  const players = t.players
    .filter((p) => p.grossTotal != null || (p.roundScores || []).some((r) => (r.scores || []).length))
    .map((p) => ({
      pos: typeof p.pos === "number" ? p.pos : (parseInt(String(p.pos ?? ""), 10) || null),
      name: p.name,
      club: p.club || null,
      total: typeof p.grossTotal === "number" ? p.grossTotal : null,
      toPar: typeof p.toPar === "number" ? p.toPar : null,
      rounds: (p.roundScores || []).map((r) => r.gross ?? null),
      holesPlayed: (p.roundScores || []).reduce((s, r) => s + (r.scores || []).filter(Boolean).length, 0),
      fullRounds: (p.roundScores || []).filter(isFullRound).length,
      isManuel: isM(p.name),
      isPt: !!(p as unknown as { _isPortuguese?: boolean })._isPortuguese,
    }))
    // ⚠ Ordenar por total sozinho põe em 1º quem NÃO acabou (2 voltas somam
    // menos que 3). Mais voltas completas primeiro; total só desempata iguais.
    .sort((a, b) => (b.fullRounds - a.fullRounds)
      || (b.rounds.filter(Boolean).length - a.rounds.filter(Boolean).length)
      || ((a.total ?? 9e9) - (b.total ?? 9e9)));
  if (!players.length) return null;
  return {
    year: meta.year,
    division: meta.division,
    course: meta.course ?? t.campo ?? null,
    url: meta.url ?? null,
    nRounds: Math.max(1, ...players.map((p) => p.rounds.length)),
    parPerRound: t.players[0]?.parTotal ?? null,
    players,
  };
}

/** Carrega as divisões de uma entrada (eager `divisions` ou lazy `loadDivisions`). */
async function entryDivisions(e: CircuitEntry): Promise<CircuitDivision[]> {
  if (e.divisions) return e.divisions;
  if (e.loadDivisions) return e.loadDivisions();
  return [];
}

/**
 * Tab "Edições anteriores" para páginas de circuito. Recebe as entradas irmãs
 * (o MESMO torneio noutros anos, incluindo a actual) já filtradas pela página/
 * shell, e o escalão aberto. Carrega cada edição (lazy + cacheado pelo próprio
 * `loadDivisions`), casa a divisão e desenha a tabela.
 */
export function CircuitPastEditionsTab({ editions, division }: { editions: CircuitEntry[]; division: string }) {
  const [state, setState] = useState<{ loading: boolean; rows: PastEdition[]; err?: string }>({ loading: true, rows: [] });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sorted = [...editions].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
        const loaded = await Promise.all(sorted.map(async (e) => {
          try { return { e, divs: await entryDivisions(e) }; } catch { return { e, divs: [] as CircuitDivision[] }; }
        }));
        const rows: PastEdition[] = [];
        for (const { e, divs } of loaded) {
          const dv = matchDivision(divs, division);
          if (!dv?.results) continue;
          const ed = buildPastEditionFromTournament(dv.results, {
            year: e.year ?? 0,
            division: dv.tabLabel || dv.escalao || division,
            course: dv.results.campo || e.course || null,
            url: e.sourceUrl || null,
          });
          if (ed) rows.push(ed);
        }
        // Uma coluna por ANO: fontes com vários torneios do mesmo nome no mesmo
        // ano (tours semanais FFG/RFEG) dariam colunas "2025" repetidas — fica a
        // edição com mais jogadores.
        const byYear = new Map<number, PastEdition>();
        for (const ed of rows) {
          const prev = byYear.get(ed.year);
          if (!prev || ed.players.length > prev.players.length) byYear.set(ed.year, ed);
        }
        const deduped = [...byYear.values()].sort((a, b) => b.year - a.year);
        if (alive) setState({ loading: false, rows: deduped });
      } catch (err) {
        if (alive) setState({ loading: false, rows: [], err: String((err as Error)?.message || err) });
      }
    })();
    return () => { alive = false; };
  }, [editions, division]);

  if (state.loading) return <LoadingState />;
  if (state.err) return <EmptyState size="md" message={"Falhou: " + state.err} />;
  if (!state.rows.length) return <EmptyState size="md" message="Sem edições anteriores com dados." />;
  return <PastEditionsTable editions={state.rows} title={division} />;
}
