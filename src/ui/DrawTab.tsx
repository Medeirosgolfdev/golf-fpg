/**
 * DrawTab.tsx — renderer da tab "Draw R{n}" num torneio.
 *
 * Usa o componente `ScorecardLeaderboard` (mesma tabela das classificações)
 * com `showScorecard={false}`. Cada linha é um jogador; em vez dos scores
 * mostra Hora e Buraco de saída.
 *
 * Colunas: # | Jogador | ESC | FED | CLUBE | HCP | TEE | Nasc. | ± | Tot | Hora | Buraco
 *
 * ⚠ REGRA do projecto: TODAS as colunas do cabeçalho têm de ser ordenáveis.
 * Usa `useSort` + `SortableHdr` nas colunas custom.
 */

import { useMemo, useState } from "react";
import type { FpgDraw, FpgAdmissions } from "../data/nacional2026Loader";
import { MANUEL_FED, isManuelByName } from "../constants/manuel";
import { TournPName, TeeDot } from "./tournamentPrimitives";
import type { PlayersDB } from "./tournamentPrimitives";
import { EscPill, YearPill } from "./PillBadge";
import { useFedBirthdates, useFedHcp } from "./InscricoesComponents";
import { norm, fmtHcp, ageAtDate, escalaoAtDate } from "../utils/format";
import { teeNameFor } from "../utils/teeRegulation";
import { formatPlayerName } from "../utils/playerUtils";
import { ScorecardLeaderboard, type ScorecardRow } from "./ScorecardLeaderboard";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";
import { lookupOm, OmCatBadge, type OmHit } from "../pages/fpg/fpgOmRanking";
import { isVirtualFed } from "../utils/fedKeys";
import { escalaoAgeCap, fitsEscalaoAgeCap } from "../data/fpgUtils";
import { displayFed } from "../utils/fedKeys";

interface Props {
  draw: FpgDraw;
  roundNum?: number;
  playersDB?: PlayersDB;
  tournamentEscalao?: string;
  tournamentSex?: "M" | "F";
  /** Data do torneio (YYYY-MM-DD) — usada para calcular escalão histórico. */
  tournamentDate?: string | null;
  /** Admissions do mesmo torneio — usadas como snapshot temporal para HCP do
   *  evento quando o draw não o traz explicitamente. O valor em `admissions`
   *  foi capturado no momento da inscrição/draw e reflecte o HCP com que o
   *  jogador vai entrar em campo (≠ HCP actual, que já pode ter evoluído). */
  admissions?: FpgAdmissions;
  /** Link para o draw oficial no scoring.fpg.pt. Renderiza-se na toolbar
   *  como atalho "scoring.fpg.pt ↗" (mesmo padrão do AdmissionsTab). */
  fpgUrl?: string;
  /** Resultados da MESMA ronda do draw, para cruzar com os emparelhamentos e
   *  preencher as colunas ± (toPar) e Tot (gross). Map indexado por chave
   *  `fed` (string numérica) E por nome normalizado (`norm(nome)`) — ambos
   *  apontam para o mesmo registo, para o lookup funcionar quer o draw resolva
   *  o fed quer só tenha nome. Quando ausente (ronda ainda não jogada), as
   *  colunas mostram "–". */
  results?: Map<string, { gross: number; toPar: number | null }>;
  /** Esconde colunas que não se aplicam à fonte (ex: GolfGenius/internacional
   *  não expõe FED/HCP/Nasc.). Default: mostra todas. */
  hideCols?: { esc?: boolean; fed?: boolean; clube?: boolean; hcp?: boolean; tee?: boolean; nasc?: boolean };
  /** Lookup fed/nome → categoria da Ordem de Mérito CGSS (buildOmLookup). Quando
   *  presente e não-vazio, o draw ganha uma coluna "OM" com a categoria+posição
   *  de cada inscrito. */
  omLookup?: Map<string, OmHit>;
}

type SortKey = "pos" | "nome" | "esc" | "fed" | "clube" | "hcp" | "tee" | "nasc" | "hora" | "buraco" | "toPar" | "gross" | "om";

/** Registo de resultado de uma ronda usado para cruzar com o draw. */
export type DrawResult = { gross: number; toPar: number | null };

/** Forma mínima de jogador aceite por `buildDrawResults`. */
type ResultPlayer = {
  name?: string;
  fed?: string | null;
  fedCode?: string;
  grossTotal?: number | string | null;
  toPar?: number | null;
  parTotal?: number;
  roundScores?: Array<{ round: number; gross: number; pars: number[] }>;
};

/**
 * Constrói o mapa de resultados de uma ronda para alimentar a prop `results`
 * da DrawTab. Indexa cada registo por `fed`/`fedCode` (autoritativo) E por
 * `norm(nome)`, para o lookup funcionar quer o draw resolva o fed quer só
 * tenha nome.
 *
 * Dois modos:
 *  - `perRoundEntry: true` — `players` já é a lista de UMA ronda (cada jogador
 *    tem `grossTotal`/`toPar` dessa ronda). Usa-os directamente. (DrivePage,
 *    RFEGPage — entradas já expandidas por ronda.)
 *  - default — `players` é o torneio completo multi-ronda; extrai a ronda via
 *    `roundScores.find(r => r.round === roundNum)`. Só cai em `grossTotal`
 *    quando é torneio de ronda única (senão `grossTotal` é o acumulado de
 *    todas as rondas e estaria errado como resultado de uma ronda só).
 *
 * Devolve `undefined` quando não há nenhuma ronda jogada (mapa vazio) — assim
 * a DrawTab mostra "–" em todas as linhas.
 */
export function buildDrawResults(
  players: ResultPlayer[] | undefined,
  roundNum: number,
  opts?: { perRoundEntry?: boolean },
): Map<string, DrawResult> | undefined {
  if (!players || roundNum < 1) return undefined;
  const perRound = !!opts?.perRoundEntry;
  const m = new Map<string, DrawResult>();
  const numOf = (v: number | string | null | undefined): number => {
    if (typeof v === "number") return isNaN(v) ? 0 : v;
    if (typeof v === "string") { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
    return 0;
  };
  for (const p of players) {
    let gross = 0;
    let toPar: number | null = null;
    const rs = p.roundScores?.find(r => r.round === roundNum);
    if (rs) {
      gross = rs.gross;
      const parT = p.parTotal || rs.pars.reduce((a, b) => a + b, 0);
      toPar = gross > 0 && parT > 0 ? gross - parT : null;
    } else if (perRound || (roundNum === 1 && !(p.roundScores?.length))) {
      // Entrada já-por-ronda (perRound) OU torneio de ronda única.
      gross = numOf(p.grossTotal);
      toPar = typeof p.toPar === "number" ? p.toPar : null;
    }
    if (gross <= 0) continue; // ronda não jogada por este jogador
    const rec: DrawResult = { gross, toPar };
    const fed = (p.fed || p.fedCode || "").toString().trim();
    if (fed) m.set(fed, rec);
    if (p.name) m.set(norm(p.name), rec);
  }
  return m.size ? m : undefined;
}

// Paleta de fundo para distinguir horas de saída (grupos de flight).
// Cores pastel translúcidas — funcionam em tema claro e escuro.
const TEE_TIME_PALETTE = [
  "rgba(59, 130, 246, 0.14)",   // azul
  "rgba(34, 197, 94, 0.14)",    // verde
  "rgba(245, 158, 11, 0.14)",   // âmbar
  "rgba(236, 72, 153, 0.14)",   // rosa
  "rgba(168, 85, 247, 0.14)",   // roxo
  "rgba(20, 184, 166, 0.14)",   // teal
];


export default function DrawTab({
  draw, roundNum, playersDB,
  tournamentEscalao, tournamentSex, tournamentDate,
  admissions, fpgUrl, results, hideCols, omLookup,
}: Props) {
  const hc = hideCols || {};
  const showOm = !!(omLookup && omLookup.size);
  const [omFilter, setOmFilter] = useState<string | null>(null); // categoria OM a filtrar (null = todas)
  const effDate = tournamentDate || draw.date || null;
  const fedBirthdates = useFedBirthdates();
  const fedHcp = useFedHcp();
  const teeName = teeNameFor(tournamentEscalao, tournamentSex);
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("pos", "asc", { om: "desc" });

  // Snapshot temporal de HCP — HCP do evento, capturado das admissões.
  // Usado como fonte autoritativa quando o draw em si não traz `hcp` por jogador.
  const admHcpByFed = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of (admissions?.players || [])) {
      if (p.fed && typeof p.hcp === "number") m.set(p.fed, p.hcp);
    }
    return m;
  }, [admissions]);
  const admHcpByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of (admissions?.players || [])) {
      if (p.nome && typeof p.hcp === "number") m.set(norm(p.nome), p.hcp);
    }
    return m;
  }, [admissions]);

  // Fed REAL por nome a partir das admissões — fonte autoritativa para este
  // torneio. Tem de ter prioridade sobre `nameToFed` (playersDB global), porque
  // o playersDB pode conter entradas virtuais `intl:...` (vindas de
  // kids-links.json para internacionais) que mascaram o fed português real
  // com que o jogador se inscreveu. Ex: Joe Short (GB) tem entrada
  // `intl:joe_short` no playersDB, mas inscreveu-se com fed 51804 — só as
  // admissões sabem disso. Sem este mapa, o draw mostrava `intl:joe_short`
  // na coluna FED + ESC vazio + Nasc. vazio (cascata por dob desconhecida).
  const admFedByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of (admissions?.players || [])) {
      if (p.nome && p.fed) m.set(norm(p.nome), p.fed);
    }
    return m;
  }, [admissions]);

  // Multi-map: nome normalizado → TODOS os feds com esse nome (numéricos +
  // virtuais `intl:*` + `kids:*`). Substitui o antigo Map<nome, fed> que só
  // guardava o último valor → causava dois bugs:
  //   1. Homónimos numéricos (3 Miguel Nunes em players-nationality.json: o
  //      Sub-10 fed 48052, o adulto fed 21118, o sénior fed 54075) — o que era
  //      inserido por último ganhava, mesmo que fosse o errado para o
  //      escalão do torneio.
  //   2. Entradas virtuais `kids:*` criadas por kids-tracked-names.json
  //      (Sabrina, Ricardo, etc. — portugueses que jogam internacionais)
  //      sobrescreviam o fed numérico real do players.json, deixando a
  //      coluna FED a mostrar `kids:nome_normalizado` e ESC/Nasc. vazios.
  //
  // A escolha do candidato certo passa para `pickBestFed()` no `flat()`,
  // onde temos o contexto do torneio (escalão + data) para desempatar.
  const nameToFeds = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!playersDB) return m;
    for (const [fed, bd] of Object.entries(playersDB)) {
      const nm = (bd as any)?.name as string | undefined;
      if (!nm) continue;
      const k = norm(nm);
      const arr = m.get(k);
      if (arr) arr.push(fed);
      else m.set(k, [fed]);
    }
    return m;
  }, [playersDB]);

  // Achatar flights + enriquecer com dados do playersDB
  const flat = useMemo(() => {
    const out: Array<{
      pos: number;
      groupIdx: number;
      teeTime: string;
      startHole: number | null;
      tee: string | null;
      nome: string;
      juniorId?: string;
      clube: string;
      fed: string | null;
      /** true = visitante sem federação FPG (draw curado) — proíbe lookups por nome. */
      noFed: boolean;
      hcp: number | null;
      hcpCurrent: boolean;
      dob?: string;
      dobYear: number | null;
      escHist: string | null;
      gross: number;
      toPar: number | null;
      isPortuguese: boolean;
      country?: string;
    }> = [];
    let idx = 0;
    // Heurística: o scraper do draw às vezes mete o fed no campo `clube` (só dígitos 4-6 chars).
    // Quando isto acontece: reaproveitar como fed (se fed ainda não tem valor) e limpar clube.
    const looksLikeFed = (s: string | undefined): boolean => !!s && /^\d{4,6}$/.test(s.trim());

    // Contexto do torneio usado para desempatar homónimos em `pickBestFed`.
    const isVirtual = (f: string) => isVirtualFed(f);
    const escCapMatch = (tournamentEscalao || "").match(/Sub\s*(\d+)/i);
    const escCap = escCapMatch ? parseInt(escCapMatch[1], 10) : null;
    // Tecto para EXCLUIR homónimos: o maior "Sub N" do rótulo (um "Sub 14-24"
    // admite os de 24). Separado do `escCap` acima, que serve só para ordenar
    // preferências entre candidatos e continua a usar o primeiro número.
    const escCapMax = escalaoAgeCap(tournamentEscalao);
    const tornYear = effDate ? parseInt(String(effDate).slice(0, 4), 10) : null;

    // Escolhe o melhor fed entre candidatos com o mesmo nome.
    // Ordem de preferência:
    //   1. Match exacto de escalão histórico (player.dob → escalaoAtDate)
    //      vs. `tournamentEscalao`. Ex: 3 Miguel Nunes diferentes; só o de
    //      2014 dá "Sub 10" em 2024.
    //   2. Elegível por idade (yearNasc >= tornYear - escCap) — apanha
    //      torneios de cap genérico tipo Sub-24 (player Sub-12 também é
    //      elegível). Preferir o mais novo (proxy razoável para a fase
    //      júnior em torneios juvenis).
    //   3. Numérico > virtual (`kids:*` / `intl:*`) — fix do bug em que
    //      Sabrina/Ricardo apareciam com `kids:...` em vez do fed real.
    //   4. Primeiro candidato (preserva ordem de inserção como último
    //      recurso — comportamento antigo).
    const dobYearOf = (fed: string): number | null => {
      const dob = (playersDB as any)?.[fed]?.dob as string | undefined;
      if (!dob) return null;
      const y = parseInt(String(dob).slice(0, 4), 10);
      return Number.isFinite(y) ? y : null;
    };
    // Num Sub-12 não há "Absoluto": jogar ACIMA do escalão é permitido, abaixo
    // não. Um candidato demasiado velho para o tecto do torneio é homónimo, não
    // a pessoa — e isso vale mesmo quando é o ÚNICO candidato. Era esse o
    // buraco (2026-08-20, Paul McGinley U12): o `candidates.length === 1`
    // devolvia sem verificar nada, e o "Luis Mateus" alemão, que a folha da FPG
    // dá como não federado ("-"), herdava o fed 34417 de um adulto português
    // homónimo — aparecia no draw do Sub-12 com escalão "Absoluto".
    // Sem tecto (Absoluto/sénior) ou sem dob, o filtro deixa passar: excluir por
    // falta de dados apagaria jogadores legítimos.
    const fitsTournament = (fed: string): boolean =>
      isVirtual(fed) || fitsEscalaoAgeCap(dobYearOf(fed), escCapMax, tornYear);

    const pickBestFed = (allCandidates: string[]): string | null => {
      const candidates = allCandidates.filter(fitsTournament);
      if (candidates.length === 0) return null;
      if (candidates.length === 1) return candidates[0];

      // 1. Match exacto via escalaoAtDate
      if (tournamentEscalao && effDate) {
        const target = norm(tournamentEscalao);
        for (const fed of candidates) {
          if (isVirtual(fed)) continue;
          const bd = (playersDB as any)?.[fed];
          const dob = bd?.dob as string | undefined;
          if (!dob) continue;
          const esc = escalaoAtDate(dob, effDate);
          if (esc && norm(esc) === target) return fed;
        }
      }

      // 2. Elegível por cap de idade (preferir mais novo)
      if (escCap != null && tornYear != null) {
        let best: { fed: string; year: number } | null = null;
        for (const fed of candidates) {
          if (isVirtual(fed)) continue;
          const bd = (playersDB as any)?.[fed];
          const dob = bd?.dob as string | undefined;
          if (!dob) continue;
          const y = parseInt(dob.slice(0, 4), 10);
          if (isNaN(y)) continue;
          if (tornYear - y > escCap) continue; // demasiado velho para o cap
          if (!best || y > best.year) best = { fed, year: y };
        }
        if (best) return best.fed;
      }

      // 3. Numérico > virtual
      const numeric = candidates.find(f => !isVirtual(f));
      if (numeric) return numeric;

      // 4. Fallback
      return candidates[0];
    };

    let groupIdx = -1;
    for (const g of (draw.groups || [])) {
      groupIdx++;
      for (const p of g.players) {
        idx++;
        const nomeFormatted = formatPlayerName(p.nome || "");
        // Obter fed (em ordem de prioridade):
        //   1. Campo `p.fed` — quando a fonte o forneceu (ex: PDFs manuais curados)
        //   2. Campo `p.clube` se parecer um fed — a coluna Federado da folha
        //      oficial do draw lida como Clube pelo parser antigo. Este número é
        //      AUTORITATIVO para este torneio e tem de ganhar ao match por nome,
        //      que erra em homónimos (ex: 3 "Vicente Rodrigues" diferentes).
        //   3. Match por nome nas ADMISSÕES (fonte autoritativa para este torneio:
        //      tem o fed real com que o jogador se inscreveu, mesmo que seja
        //      internacional registado na FPG)
        //   4. Match por nome no playersDB (players.json) — pode ter `intl:...`
        const pFed = (p as any).fed as string | null | undefined;
        // `noFed: true` no draw curado = jogador SEM federação FPG (visitante,
        // ex: clube "Internacional") — proíbe o fallback de match por nome, que
        // atribuía o fed de um homónimo federado (caso João Rocha, Calheta Viva
        // 2026: visitante a herdar o fed do júnior do Estoril).
        const noFed = (p as any).noFed === true;
        let fed: string | null = pFed && String(pFed).trim() ? String(pFed).trim() : null;
        let clubeRaw = p.clube || "";
        if (!fed && !noFed && looksLikeFed(clubeRaw)) {
          // fed vindo da própria folha do draw (autoritativo) → usar e limpar clube
          fed = clubeRaw.trim();
          clubeRaw = "";
        }
        if (!fed && !noFed) {
          fed = admFedByName.get(norm(p.nome)) || admFedByName.get(norm(nomeFormatted)) || null;
        }
        if (!fed && !noFed) {
          const candidates = nameToFeds.get(norm(p.nome)) || nameToFeds.get(norm(nomeFormatted)) || [];
          fed = pickBestFed(candidates);
        }
        if (looksLikeFed(clubeRaw)) {
          // fed já conhecido por outra via; clube ainda contém um número → limpar
          clubeRaw = "";
        }
        const bd = fed && playersDB ? (playersDB[fed] as any) : undefined;
        // Preferir clube do playersDB (dados curados); cair para clubeRaw só se playersDB
        // não tiver info útil para este jogador.
        const clubeFromDB = bd?.club
          ? (typeof bd.club === "string" ? bd.club : (bd.club.short || bd.club.name || ""))
          : "";
        const clube = clubeFromDB || clubeRaw || "";
        // HCP — preferir o snapshot temporal do evento; cair no HCP actual só como
        // último recurso:
        //   1. `p.hcp` do draw (PDF oficial / scrape da folha do draw)
        //   2. Admissions HCP (por fed ou nome normalizado) — capturado na inscrição
        //   3. HCP ACTUAL do federado (`federados.json` por fed) — fallback para
        //      jogadores no draw mas ausentes das admissões (draw > inscritos
        //      capturados). É o HCP de hoje, não o do evento → marcado `hcpCurrent`
        //      para o render sinalizar (title) que não é o snapshot temporal.
        // Sem NENHUMA fonte, mostra-se "–".
        const pHcp = (p as any).hcp as number | null | undefined;
        const drawHcp = typeof pHcp === "number" ? pHcp : null;
        const admHcp = fed ? admHcpByFed.get(fed) : undefined;
        const admHcpByN = admHcpByName.get(norm(p.nome)) ?? admHcpByName.get(norm(nomeFormatted));
        const snapshotHcp = drawHcp ?? admHcp ?? admHcpByN ?? null;
        const currentHcp = snapshotHcp == null && fed ? (fedHcp.get(fed) ?? null) : null;
        const hcp: number | null = snapshotHcp ?? currentHcp;
        const hcpCurrent = snapshotHcp == null && currentHcp != null;
        // Dob: playersDB (curado) → federados.json (base FPG) → ficha RFEG.
        // A RFEG entra por ultimo mas e a UNICA fonte para quem nao tem
        // federado portugues: sem ela os internacionais ficavam sem escalao,
        // apesar de a data de nascimento estar gravada em _rfeg.
        const dob: string | undefined =
          bd?.dob || (fed ? fedBirthdates.get(fed) : undefined) || ((p as any)._rfeg?.dob as string | undefined);
        const dobYear = dob ? parseInt(dob.slice(0, 4), 10) : null;
        // Escalão: calculado da dob (fonte autoritativa). NÃO caímos em
        // `tournamentEscalao` porque torneios combinados (Regional Sub 14-24,
        // Sub 10+12) têm múltiplos escalões em disputa — o genérico engana.
        const escHist = escalaoAtDate(dob, effDate || undefined) || null;
        // Cruzar com os resultados da ronda (quando disponíveis): tentar por
        // fed primeiro (autoritativo), depois por nome normalizado. Sem match
        // → gross 0 / toPar null (a tabela mostra "–").
        const res = results
          ? (fed ? results.get(fed) : undefined)
            ?? results.get(norm(p.nome))
            ?? results.get(norm(nomeFormatted))
          : undefined;
        out.push({
          pos: idx,
          groupIdx,
          teeTime: g.teeTime,
          startHole: g.startHole,
          // Tee por jogador (flights com tees mistos M/F) tem prioridade sobre o tee do grupo.
          tee: ((p as any).tee as string | null | undefined) ?? g.tee,
          nome: nomeFormatted,
          clube,
          fed,
          // Id do agregador dos internacionais (_rfeg.juniorId, gravado no
          // fpg-admissions-draws.json). Sem o copiar para aqui perdia-se: este
          // objecto e construido de raiz, nao e um spread do original.
          juniorId: ((p as any)._rfeg?.juniorId as string | undefined) ?? undefined,
          noFed,
          hcp,
          hcpCurrent,
          dob,
          dobYear,
          escHist,
          gross: res?.gross ?? 0,
          toPar: res?.toPar ?? null,
          // Draws internacionais (MAJOR): conterrâneos vêm marcados na fonte
          // (`fmDrawsToFpg`) → `.row-portuguese`. Nos draws FPG o campo não
          // existe (todos são PT — destacar todos não distinguiria nada).
          isPortuguese: !!(p as { isPortuguese?: boolean }).isPortuguese,
          // Nacionalidade da fonte (draws internacionais) → bandeira no nome.
          country: ((p as { country?: string | null }).country) || undefined,
        });
      }
    }
    return out;
  }, [draw, nameToFeds, admFedByName, playersDB, fedBirthdates, fedHcp, effDate, tournamentEscalao, admHcpByFed, admHcpByName, results]);

  // Ordenar por sortKey
  const sorted = useMemo(() => {
    const INF = 9999;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...flat].sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "pos":    v = a.pos - b.pos; break;
        case "nome":   v = a.nome.localeCompare(b.nome, "pt"); break;
        case "esc":    v = (a.escHist || "").localeCompare(b.escHist || "", "pt"); break;
        case "fed":    v = (a.fed || "").localeCompare(b.fed || ""); break;
        case "clube":  v = a.clube.localeCompare(b.clube, "pt"); break;
        case "hcp":    v = (a.hcp ?? INF) - (b.hcp ?? INF); break;
        case "tee":    v = (a.tee || "").localeCompare(b.tee || "", "pt"); break;
        case "nasc":   v = (a.dobYear ?? INF) - (b.dobYear ?? INF); break;
        case "hora":   v = a.teeTime.localeCompare(b.teeTime); break;
        case "buraco": v = (a.startHole ?? INF) - (b.startHole ?? INF); break;
        case "toPar":  v = (a.toPar ?? INF) - (b.toPar ?? INF); break;
        case "gross":  v = (a.gross || INF) - (b.gross || INF); break;
        case "om": {
          const oa = lookupOm(omLookup, a.fed, a.nome), ob = lookupOm(omLookup, b.fed, b.nome);
          v = (oa ? oa.pts : -1) - (ob ? ob.pts : -1); break;
        }
      }
      return mult * v;
    });
  }, [flat, sortKey, sortDir, omLookup]);

  // Filtro por categoria da Ordem de Mérito (mostra só os jogadores de uma OM).
  const visibleSorted = useMemo(() => {
    if (!omFilter) return sorted;
    return sorted.filter(p => {
      const hit = lookupOm(omLookup, p.fed, p.nome);
      return omFilter === "none" ? !hit : hit?.catKey === omFilter;
    });
  }, [sorted, omFilter, omLookup]);

  // Mapa de cor de fundo por GRUPO (cicla uma paleta pastel pela ordem dos
  // flights em `draw.groups`). Identifica visualmente cada grupo mesmo quando
  // (a) é um shotgun — todos os grupos à mesma hora, distintos só pelo buraco —
  // ou (b) a tabela é reordenada por outra coluna. Antes era keyed por teeTime,
  // o que colapsava todos os grupos de um shotgun numa cor só.
  const groupBg = useMemo(() => {
    const m = new Map<number, string>();
    const unique = [...new Set(flat.map(p => p.groupIdx))];
    for (let i = 0; i < unique.length; i++) {
      m.set(unique[i], TEE_TIME_PALETTE[i % TEE_TIME_PALETTE.length]);
    }
    return m;
  }, [flat]);

  const rows: ScorecardRow[] = useMemo(() => {
    // Separador de grupos: linha mais grossa entre flights quando a ordenação
    // respeita o agrupamento natural (sort por `pos`, `hora` ou `buraco` — rows
    // do mesmo grupo ficam consecutivas). Com outros sorts (nome/hcp/...) os
    // flights quebram-se e a linha deixaria de marcar grupos coerentes, por isso
    // só aparece nestes. O grupo é identificado por `groupIdx` (ordem em
    // `draw.groups`), NÃO por `teeTime` — senão num shotgun (todos à mesma hora)
    // nunca havia mudança de grupo e não se desenhava nenhuma linha.
    //
    // 3px + `var(--text-3)` (#7a8a6e) dá uma linha claramente visível. A
    // `ScorecardLeaderboard` aplica o `borderTop` nos <td> que controla
    // (pos/nome/±Tot/buracos); aqui propagamos-o também aos <td> custom em
    // `prefixCells`/`postScorecardCells` para o traço atravessar a linha toda.
    const groupingActive = sortKey === "pos" || sortKey === "hora" || sortKey === "buraco";
    const GROUP_BORDER = "3px solid var(--text-3)";
    return visibleSorted.map((p, i) => {
      // Por fed (FPG) OU por nome: nos draws MAJOR (fmDrawsToFpg) não há fed
      // nenhum (playersDB vazio) e o Manuel ficava sem .row-manuel/estrela.
      const manuel = p.fed === MANUEL_FED || isManuelByName(p.nome);
      const age = ageAtDate(p.dob, effDate || undefined);
      const isFirstOfGroup = groupingActive && i > 0 && visibleSorted[i - 1].groupIdx !== p.groupIdx;
      const borderTop = isFirstOfGroup ? GROUP_BORDER : undefined;
      const bStyle = borderTop ? { borderTop } : undefined;
      return {
        key: `${p.pos}-${p.fed ?? p.nome}`,
        pos: p.pos,
        gross: p.gross,
        toPar: p.toPar,
        scores: [],
        isManuel: manuel,
        isPortuguese: !manuel && p.isPortuguese,
        sortPos: p.pos,
        sortName: p.nome,
        borderTop,
        // A bandeira é desenhada pelo próprio TournPName (resolve country por
        // fed/nome no playersDB). NÃO adicionar aqui uma CountryFlag por cima —
        // senão os estrangeiros ficam com a bandeira a dobrar.
        nameContent: (
          <span className="inline-flex items-center">
            {/* `noFed` (visitante sem federação FPG) suprime TAMBÉM os lookups
                por nome do TournPName (sex/kidsHash/country do playersDB) e o
                KidsLink — senão o visitante herdava o perfil/links de um
                homónimo federado (caso João Rocha, Calheta Viva 2026). */}
            <TournPName
              name={p.nome}
              fed={p.fed || undefined}
              juniorId={p.juniorId}
              playersDB={p.noFed ? undefined : playersDB}
              country={p.country}
              highlight={manuel}
            />
            {/* Seta ↗ kids2 via KidsLinkCtx (CircuitShell — MAJOR/England/…).
                Sem duplicação com a seta do próprio TournPName (kidsHash):
                quem tem kidsHash no playersDB (FPGPage) NÃO fornece o ctx, e
                quem fornece o ctx passa playersDB sem kidsHash. */}
            {/* A seta ↗ e desenhada pelo proprio TournPName, que agora tambem
                consulta o KidsLinkCtx. Antes havia aqui um <KidsLink> irmao e
                as duas apareciam na mesma linha. */}
          </span>
        ),
        prefixCells: (
          <>
            {showOm && (() => {
              const hit = lookupOm(omLookup, p.fed, p.nome);
              return <td style={{ padding: "6px 8px", whiteSpace: "nowrap", ...bStyle }}>
                {hit ? <OmCatBadge hit={hit} /> : <span className="muted">–</span>}
              </td>;
            })()}
            {!hc.esc && (
              <td className="lb-esc" style={bStyle}>
                {p.escHist ? <EscPill esc={p.escHist} /> : <span className="muted">–</span>}
              </td>
            )}
            {!hc.fed && <td className="lb-fed" style={bStyle}>{displayFed(p.fed) || "–"}</td>}
            {!hc.clube && <td className="lb-club" title={p.clube} style={bStyle}>{p.clube || "–"}</td>}
            {!hc.hcp && (
              <td className="lb-hcp" style={bStyle}
                title={p.hcpCurrent ? "HCP actual (federado) — snapshot do evento indisponível" : undefined}>
                {p.hcpCurrent ? <span style={{ color: "var(--color-danger)", fontWeight: 700 }}>*</span> : null}{p.hcp != null ? fmtHcp(p.hcp) : "–"}
              </td>
            )}
            {!hc.tee && <td className="lb-tee" style={bStyle}><TeeDot teeName={p.tee || teeName} /></td>}
            {!hc.nasc && (
              <td title={p.dob ? `${p.dob} (${age ?? "?"} anos à data)` : ""} style={{ textAlign: "center", padding: "6px 8px", whiteSpace: "nowrap", ...bStyle }}>
                {p.dobYear != null ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <YearPill year={p.dobYear} />
                    {age != null && <span className="muted fs-10">({age})</span>}
                  </span>
                ) : <span className="muted">–</span>}
              </td>
            )}
          </>
        ),
        postScorecardCells: (
          <>
            <td className="fs-12 fw-700 mono" style={{
              padding: "6px 8px", whiteSpace: "nowrap", textAlign: "center",
              background: groupBg.get(p.groupIdx),
              ...bStyle,
            }}>
              {p.teeTime}
            </td>
            <td className="fs-12 fw-600" style={{ padding: "6px 8px", textAlign: "center", ...bStyle }}>
              T{p.startHole ?? "?"}
            </td>
          </>
        ),
      };
    });
  }, [visibleSorted, playersDB, teeName, effDate, groupBg, sortKey, hc.esc, hc.fed, hc.clube, hc.hcp, hc.tee, hc.nasc]);

  if (draw.error) {
    return <div className="detail-toolbar" style={{ padding: 16 }}>
      <span className="muted">Erro a carregar draw: {draw.error}</span>
      {fpgUrl && (
        <a href={fpgUrl} target="_blank" rel="noopener noreferrer"
          className="ml-auto fs-11" style={{ color: "var(--chart-2)" }}>
          scoring.fpg.pt ↗
        </a>
      )}
    </div>;
  }
  if ((draw.groups || []).length === 0) {
    return <div className="detail-toolbar" style={{ padding: 16 }}>
      <span className="muted">{draw.note || "Draw ainda não publicado."}{roundNum ? ` (Ronda ${roundNum})` : ""}</span>
      {fpgUrl && (
        <a href={fpgUrl} target="_blank" rel="noopener noreferrer"
          className="ml-auto fs-11" style={{ color: "var(--chart-2)" }}>
          scoring.fpg.pt ↗
        </a>
      )}
    </div>;
  }

  const prefixHeaderCells = (
    <>
      {showOm && <SortableHdr k="om" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px" }} title="Categoria na Ordem de Mérito CGSS">OM</SortableHdr>}
      {!hc.esc && <SortableHdr k="esc"   sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-esc">ESC.</SortableHdr>}
      {!hc.fed && <SortableHdr k="fed"   sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-fed">FED</SortableHdr>}
      {!hc.clube && <SortableHdr k="clube" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-club">CLUBE</SortableHdr>}
      {!hc.hcp && <SortableHdr k="hcp"   sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-hcp">HCP</SortableHdr>}
      {!hc.tee && <SortableHdr k="tee"   sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-tee">TEE</SortableHdr>}
      {!hc.nasc && <SortableHdr k="nasc"  sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "center" }}>Nasc.</SortableHdr>}
    </>
  );
  const postScorecardHeaderCells = (
    <>
      <SortableHdr k="hora"   sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "center" }}>Hora</SortableHdr>
      <SortableHdr k="buraco" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "center" }}>Buraco</SortableHdr>
    </>
  );

  const total = flat.length;
  // Draws sintetizados (gerados pelo TournamentDetail a partir do acumulado das
  // rondas anteriores quando a FPG ainda não publicou o oficial) trazem `note`
  // mesmo com groups populados. Mostra-se um banner de aviso antes da tabela e
  // marca-se " (estimado)" no título da toolbar.
  const isEstimated = !!draw.note && (draw.groups?.length ?? 0) > 0;
  const filterBar = (
    <>
      <div className="detail-toolbar">
        <span className="fw-700 fs-14">Draw{roundNum ? ` — Ronda ${roundNum}` : ""}{isEstimated ? " (estimado)" : ""}</span>
        <span className="muted fs-12">{(draw.groups || []).length} flights · {omFilter ? `${visibleSorted.length}/${total}` : total} jogadores</span>
        {draw.date && <span className="muted fs-12">· {draw.date}</span>}
        {fpgUrl && (
          <a href={fpgUrl} target="_blank" rel="noopener noreferrer"
            className="ml-auto fs-11" style={{ color: "var(--chart-2)" }}>
            scoring.fpg.pt ↗
          </a>
        )}
      </div>
      {showOm && (
        <div className="detail-toolbar" style={{ gap: 6, flexWrap: "wrap" }}>
          <span className="muted fs-11">Ordem de Mérito:</span>
          {([{ k: null, l: "Todas" }, { k: "junior", l: "Júnior" }, { k: "homens", l: "Homens" }, { k: "senhoras", l: "Senhoras" }, { k: "seniores", l: "Seniores" }, { k: "superSeniores", l: "Super Sen." }, { k: "none", l: "Sem OM" }] as { k: string | null; l: string }[]).map(o => {
            const active = omFilter === o.k;
            return (
              <button key={o.l} type="button" onClick={() => setOmFilter(o.k)}
                className="p p-sm" style={{
                  cursor: "pointer",
                  background: active ? "var(--accent)" : "var(--bg-1)",
                  color: active ? "#fff" : "var(--text-1)",
                  borderColor: active ? "var(--accent)" : "var(--border)",
                  fontWeight: active ? 700 : 400,
                }}>
                {o.l}
              </button>
            );
          })}
        </div>
      )}
      {isEstimated && (
        <div className="fs-12 fw-600" style={{
          padding: "8px 14px", margin: "6px 12px",
          background: "var(--bg-warn-subtle, #fef3c7)",
          border: "1px solid var(--color-warn, #f59e0b)",
          borderRadius: 6,
          color: "var(--text-1, #1f2937)", lineHeight: 1.4,
        }}>
          ⚠️ {draw.note}
        </div>
      )}
    </>
  );

  return (
    <ScorecardLeaderboard
      par={[]}
      rows={rows}
      prefixHeaderCells={prefixHeaderCells}
      postScorecardHeaderCells={postScorecardHeaderCells}
      postScorecardColCount={2}
      showScorecard={false}
      filterBar={filterBar}
      // Sorting da pos e nome: delegamos a useSort externo
      onSortPos={() => toggleSort("pos")}
      onSortName={() => toggleSort("nome")}
      onSortToPar={() => toggleSort("toPar")}
      onSortGross={() => toggleSort("gross")}
      activeSortKey={sortKey}
      activeSortDir={sortDir}
    />
  );
}
