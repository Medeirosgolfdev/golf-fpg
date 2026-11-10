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
import { fieldIsManuel } from "./repeaters";
import { parsePos, temCartao } from "../../utils/classificacao";
import { isNoCardGross } from "../../data/intlCommon";
import { isRoundInProgress } from "../../data/fpgUtils";
import LoadingState from "../LoadingState";
import EmptyState from "../EmptyState";
import PastEditionsTable, { type PastEdition } from "./PastEditionsTable";
import { totalsDivisionView } from "./divisionPieces";
import { currentField } from "../../pages/fpg/repeatersModel";
import { stripAccents } from "../../utils/normName";
import { isPtCountry } from "../../utils/flagUtils";

/**
 * O torneio de hoje de uma divisão, como o Scout o lê (`currentField`: draw →
 * resultados → inscrições): os resultados — ou só os totais — com as inscrições e
 * os draws da divisão por cima. Sem nada disto, null.
 */
export function divisionTournament(
  d: CircuitDivision | null | undefined,
  meta: { name: string; date?: string | null; campo?: string | null },
): FPGTournament | null {
  if (!d) return null;
  const base = d.results
    ?? totalsDivisionView(d, { name: meta.name, date: meta.date ?? undefined, campo: meta.campo ?? undefined })?.tournament
    ?? ({ name: meta.name, tcode: d.key, date: meta.date ?? "", campo: meta.campo ?? "", rounds: 0, playerCount: 0, players: [] } as unknown as FPGTournament);
  const drawsDiv = Object.fromEntries((d.roundDraws ?? []).filter((r) => r.draw?.groups?.length).map((r) => [String(r.round), r.draw!]));
  const t = {
    ...base,
    escalao: base.escalao ?? d.escalao ?? null,
    _admissions: base._admissions ?? d.admissions ?? undefined,
    _draws: base._draws ?? (Object.keys(drawsDiv).length ? drawsDiv : undefined),
  } as FPGTournament;
  return currentField(t).length ? t : null;
}

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
  const base = stripAccents(String(name || ""))
    .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F3F4}][\u{1F1E6}-\u{1F1FF}\u{E0000}-\u{E007F}]*/gu, " ") // bandeiras
    .replace(/^\s*\d{4}\s*\/\/\s*/, " ")           // "2025 // " (FFG)
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, " ")             // anos
    // ordinais «3º», «12ª», «3o» (depois de º/ª não há `\b`: «108ª Lisbon Cup» ficava)
    .replace(/\b\d{1,3}\s*(?:[oa]\b|[ºª])/g, " ")
    // numerais romanos VÁLIDOS até 399 (LXXV, XII, III…) — qualquer palavra com
    // as letras ivxlcdm apagava «mid» («Mid-Amateur» = «Amateur») e «di»
    .replace(/\b(?=[ivxlc])c{0,3}(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})\b/g, (m) => (m.length === 1 && !/[ivx]/.test(m) ? m : " "))
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
  // Drive/AQUAPOR: a prova masculina aparece ora como divisão ÚNICA "—" (época
  // sem par feminino — é o caso do pool de edições, que não injecta as Senhoras),
  // ora FUNDIDA em "Masculino"/"Senhoras" (quando há admissions da prova feminina).
  // Sem casar estas duas representações, a tab Época do 4º Aquapor (rotulado
  // "Masculino") não encontrava as irmãs (rotuladas "—") e ficava vazia.
  // "Senhoras" só casa com "senhoras" explícito — uma prova única é a masculina.
  const nl = norm(label);
  const isGeneric = (s: string) => { const v = norm(s); return v === "" || v === "—" || v === "-"; };
  if (nl === "masculino" || isGeneric(label)) {
    const masc = divisions.find((d) => norm(lab(d)) === "masculino");
    if (masc) return masc;
    const generics = divisions.filter((d) => isGeneric(lab(d)));
    return generics.length === 1 ? generics[0] : null;
  }
  if (nl === "senhoras") return divisions.find((d) => norm(lab(d)) === "senhoras") ?? null;
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
  temCartao(r.gross) && !isRoundInProgress(r);

/** ±Par pelas voltas, cada uma contra o SEU par (fontes sem ±Par no jogador —
 *  USKids; uma volta encurtada a 9 buracos conta contra o par dos 9). Null se
 *  alguma volta jogada não tiver par. */
function toParPelasVoltas(rs: { gross?: number | null; pars?: (number | null)[] }[]): number | null {
  const jogadas = rs.filter((r) => temCartao(r.gross));
  if (!jogadas.length) return null;
  let s = 0;
  for (const r of jogadas) {
    const par = (r.pars || []).reduce<number>((a, b) => a + (b || 0), 0);
    if (!par) return null;
    s += (r.gross as number) - par;
  }
  return s;
}

/** Converte um Tournament (FPG-format) numa `PastEdition` (uma coluna da tabela).
 *  Devolve null se não houver jogadores com resultado. */
export function buildPastEditionFromTournament(
  t: FPGTournament,
  meta: { id: string; year: number; division: string; course?: string | null; url?: string | null; label?: string | null },
): PastEdition | null {
  const players = t.players
    .filter((p) => p.grossTotal != null || (p.roundScores || []).some((r) => (r.scores || []).length))
    .map((p) => {
      // Sem cartão (gross ≥ 900: 998/999, ou 74+998 = 1072): a volta fica vazia e
      // o total, o ±par e o lugar não contam (10/11/2026 — entravam «1072 · +936»
      // nas edições anteriores e na média do Scout).
      const semCartao = isNoCardGross(p.grossTotal as number | null | undefined)
        || (p.roundScores || []).some((r) => isNoCardGross(r.gross));
      return {
      // «T4» → 4, «CUT»/«WD» → sem lugar (`parsePos`; o parseInt deixava «T4» sem lugar).
      pos: semCartao ? null : parsePos(p.pos),
      name: p.name,
      // O federado da própria edição: é ele que casa o jogador com o field de
      // hoje (dois homónimos com federados diferentes — 10/11/2026).
      fed: p.fedCode || p.fed || null,
      club: p.club || null,
      total: !semCartao && typeof p.grossTotal === "number" ? p.grossTotal : null,
      toPar: semCartao ? null : typeof p.toPar === "number" ? p.toPar : toParPelasVoltas(p.roundScores || []),
      rounds: (p.roundScores || []).map((r) => (r.gross != null && !isNoCardGross(r.gross) ? r.gross : null)),
      holesPlayed: (p.roundScores || []).reduce((s, r) => s + (r.scores || []).filter(Boolean).length, 0),
      fullRounds: (p.roundScores || []).filter(isFullRound).length,
      // Pelo federado quando o há (o pai, 54907, também é «Manuel Medeiros»).
      isManuel: fieldIsManuel({ name: p.name, fed: p.fedCode || p.fed || null }),
      isPt: !!(p as unknown as { _isPortuguese?: boolean })._isPortuguese,
      };
    })
    // Quem ficou sem nada válido (NS: 999 sem voltas) não é uma linha da edição.
    .filter((p) => p.total != null || p.holesPlayed > 0 || p.rounds.some((g) => g != null))
    // ⚠ Ordenar por total sozinho põe em 1º quem NÃO acabou (2 voltas somam
    // menos que 3). Mais voltas completas primeiro; total só desempata iguais.
    .sort((a, b) => (b.fullRounds - a.fullRounds)
      || (b.rounds.filter(Boolean).length - a.rounds.filter(Boolean).length)
      || ((a.total ?? 9e9) - (b.total ?? 9e9)));
  if (!players.length) return null;
  // Par da prova: o do PRIMEIRO jogador que o traga, nao o do primeiro da
  // lista — os jogadores sem federado FPG vem sem parTotal, e se calhasse um
  // deles em primeiro a edicao inteira ficava sem par. Par 0 = desconhecido.
  const par = t.players.find((p) => typeof p.parTotal === "number" && p.parTotal > 0)?.parTotal ?? null;
  // Fontes sem ±Par no jogador (USKids): pelas voltas jogadas.
  if (par) for (const p of players) {
    const n = p.rounds.filter(Boolean).length;
    if (p.toPar == null && p.total && n) p.toPar = p.total - par * n;
  }
  return {
    id: meta.id,
    year: meta.year,
    label: meta.label ?? null,
    division: meta.division,
    course: meta.course ?? t.campo ?? null,
    url: meta.url ?? null,
    nRounds: Math.max(1, ...players.map((p) => p.rounds.length)),
    parPerRound: par,
    players,
  };
}

/** `PastEdition` de uma divisão só com totais (EGR, WAGR, GJGL, LGPIDF —
 *  `CircuitDivision.totals`, 20/10/2026). Sem cartões: cada volta conta como
 *  completa quando tem gross. */
export function buildPastEditionFromTotals(
  t: NonNullable<CircuitDivision["totals"]>,
  meta: { id: string; year: number; division: string; course?: string | null; url?: string | null; label?: string | null },
): PastEdition | null {
  const par = t.parPerRound;
  const players = t.players
    .filter((p) => p.name && (p.total != null || p.rounds.some((r) => r != null)))
    .map((p) => {
      const rounds = p.rounds.filter((r, i, a) => r != null || a.slice(i).some((x) => x != null));
      const jogadas = rounds.filter((r) => r != null).length;
      return {
        pos: typeof p.pos === "number" ? p.pos : null,
        name: p.name,
        fed: p.fed || null,
        club: p.club || null,
        total: typeof p.total === "number" ? p.total : null,
        toPar: typeof p.total === "number" && par != null && jogadas ? p.total - par * jogadas : null,
        rounds,
        holesPlayed: jogadas * 18,
        fullRounds: jogadas,
        isManuel: fieldIsManuel({ name: p.name, fed: p.fed || null }),
        isPt: isPtCountry(p.country),
      };
    })
    .sort((a, b) => (b.fullRounds - a.fullRounds) || ((a.total ?? 9e9) - (b.total ?? 9e9)));
  if (!players.length) return null;
  return {
    id: meta.id, year: meta.year, label: meta.label ?? null, division: meta.division,
    course: meta.course ?? null, url: meta.url ?? null,
    nRounds: Math.max(1, ...players.map((p) => p.rounds.length)),
    parPerRound: par,
    players,
  };
}

/** Carrega as divisões de uma entrada (eager `divisions` ou lazy `loadDivisions`). */
export async function entryDivisions(e: CircuitEntry): Promise<CircuitDivision[]> {
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
export function CircuitPastEditionsTab({ editions, division, match = matchDivision }: {
  editions: CircuitEntry[]; division: string;
  /** Escalão correspondente noutra edição (default `matchDivision`). */
  match?: (divisions: CircuitDivision[], label: string) => CircuitDivision | null;
}) {
  const [state, setState] = useState<{ loading: boolean; rows: PastEdition[]; err?: string }>({ loading: true, rows: [] });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sorted = [...editions].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
        const loaded = await Promise.all(sorted.map(async (e) => {
          try { return { e, divs: await entryDivisions(e) }; } catch { return { e, divs: [] as CircuitDivision[] }; }
        }));
        const rows: { ed: PastEdition; stamp: string }[] = [];
        for (const { e, divs } of loaded) {
          const dv = match(divs, division);
          if (!dv?.results && dv?.totals) {
            const edT = buildPastEditionFromTotals(dv.totals, {
              id: e.id, year: e.year ?? 0, label: e.name || null,
              division: dv.tabLabel || dv.escalao || division, course: e.course || null, url: e.sourceUrl || null,
            });
            if (edT) rows.push({ ed: edT, stamp: e.dateStart || String(e.year ?? 0) });
            continue;
          }
          if (!dv?.results) continue;
          const ed = buildPastEditionFromTournament(dv.results, {
            id: e.id,
            year: e.year ?? 0,
            // Rótulo distintivo para fontes com VÁRIAS edições no mesmo ano (Drive:
            // etapas de um tour) — a tabela só o mostra quando o ano se repete.
            label: e.name || null,
            division: dv.tabLabel || dv.escalao || division,
            course: dv.results.campo || e.course || null,
            url: e.sourceUrl || null,
          });
          if (ed) rows.push({ ed, stamp: e.dateStart || String(e.year ?? 0) });
        }
        // TODAS as edições (o Drive repete o evento várias vezes por ano — cada
        // etapa é uma coluna). Mais recente primeiro; empate por nome estável.
        rows.sort((a, b) => (b.stamp < a.stamp ? -1 : b.stamp > a.stamp ? 1 : (a.ed.label || "").localeCompare(b.ed.label || "")));
        if (alive) setState({ loading: false, rows: rows.map((r) => r.ed) });
      } catch (err) {
        if (alive) setState({ loading: false, rows: [], err: String((err as Error)?.message || err) });
      }
    })();
    return () => { alive = false; };
  }, [editions, division, match]);

  if (state.loading) return <LoadingState />;
  if (state.err) return <EmptyState size="md" message={"Falhou: " + state.err} />;
  if (!state.rows.length) return <EmptyState size="md" message="Sem edições anteriores com dados." />;
  // "—" é o escalão placeholder das provas Drive sem escalões (Tour/Aquapor) —
  // não faz sentido como título da tabela.
  return <PastEditionsTable editions={state.rows} title={division && division !== "—" ? division : undefined} />;
}

