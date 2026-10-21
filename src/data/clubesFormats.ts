/**
 * clubesFormats.ts — Contas dos torneios de clubes da /FPG/clubes
 *
 * - CLUBES_TEAM_FORMAT: formato de pontuação por equipa dos torneios não-juvenis
 * - autoGruposByClub: composição das equipas a partir dos próprios jogadores
 * - match play 3-way: pontos por dia, confrontos por publicar, linhas por
 *   jogador, jogadores/draw sintéticos para o tab Individual
 * - clubesHasManuel: ★Manuel da sidebar (também pelos confrontos do match play)
 *
 * Extraído da FPGPage a 21/10/2026 — a página só desenha.
 */
import type { Tournament, GrupoEntry, Player } from "./fpgTypes";
import type { FpgDraw, FpgDrawFlight } from "./nacional2026Loader";
import type { MatchPlayData, MpDia, MpMatch, MpRow } from "./clubesMatchplayTypes";
import type { CategoriaCfg } from "../ui/ClubesCategoriasView";
import { isManuel } from "../constants/manuel";

export interface ClubesTeamFormat {
  bestNByRound?: number[];
  defaultBestN?: number;
  note: string;
  /** Se presente, cada clube é dividido em sub-grupos por categoria
   *  (ClubesCategoriasView) em vez de uma única equipa. */
  categories?: CategoriaCfg[];
  /** Torneio em MATCH PLAY (pontos por equipa), não strokeplay. As vistas de
   *  Grupos por pancadas não se aplicam — mostra-se placeholder até existir a
   *  vista de match play e os dados reais. */
  matchPlay?: boolean;
}

/**
 * Formato de pontuação por equipa para torneios de clubes NÃO-juvenis, keyed
 * por `${ccode}-${tcode}`. Vive em código (e não no JSON) para sobreviver a
 * re-scrapes dos ficheiros CLUBES{ano}.json. `bestNByRound` = nº de resultados
 * contados em cada ronda; `note` = descrição mostrada no topo da vista Grupos.
 * Default para midam sem entrada: 5 melhores em todas as rondas (Absoluto).
 */
export const CLUBES_TEAM_FORMAT: Record<string, ClubesTeamFormat> = {
  // Campeonato Nacional de Clubes Mid-Amateur BPI 2026 — R1 individual (5
  // melhores), R2 foursomes (2 melhores).
  "000-10912": { bestNByRound: [5, 2], note: "R1: 5 melhores (individual) · R2: 2 melhores (foursomes)" },
  // Campeonato Regional de Clubes Absoluto 2024 — 2 dias individual, com 3
  // categorias por clube: Homens >18 (5 melhores), Senhoras >18 (2), Juniores
  // ≤Sub-18 (3). Sub-grupos dentro de cada card de clube.
  "059-10483": {
    bestNByRound: [5, 5],
    note: "Cada dia: 5 melhores resultados (Absoluto masculino)",
    categories: [
      { key: "H", label: "Homens", bestN: 5 },
      { key: "S", label: "Senhoras", bestN: 2 },
      { key: "J", label: "Juniores", bestN: 3 },
    ],
  },
  // Campeonato Regional de Clubes 2026 (059/10685, Palheiro, 20-21 Jun 2026).
  // ⚠ FORMATO NOVO: 36 buracos de 3-Way Match Play (pontos: V=1, E=0.5, D=0).
  // 3 campeonatos: Homens (6+1), Senhoras (3+1), Jovens (4+1, ≤18). NÃO é
  // strokeplay — a classificação é por pontos, por isso usa-se placeholder até
  // existir a vista de match play (construir com os dados reais do fim-de-semana).
  "059-10685": {
    note: "36 buracos · 3-Way Match Play (pontos: V=1 · E=0.5 · D=0)",
    matchPlay: true,
    categories: [
      { key: "H", label: "Homens", bestN: 6 },
      { key: "S", label: "Senhoras", bestN: 3 },
      { key: "J", label: "Juniores", bestN: 4 },
    ],
  },
};

/** Formato de equipa de um torneio de clubes (ou undefined). */
export function clubesFormatOf(t: { ccode?: string; tcode?: string } | null | undefined): ClubesTeamFormat | undefined {
  return t ? CLUBES_TEAM_FORMAT[`${t.ccode}-${t.tcode}`] : undefined;
}

/** Torneio de clubes em match play? Vivem em /FPG/clubes, fora das listas strokeplay. */
export function isClubesMatchPlay(t: { ccode?: string; tcode?: string }): boolean {
  return !!clubesFormatOf(t)?.matchPlay;
}

/**
 * Auto-constrói a composição de equipas (GrupoEntry[]) de um torneio de clubes
 * a partir dos próprios jogadores, agrupados pelo campo `club`. Usado para
 * torneios de clubes sem composição curada em CLUBES_GRUPOS_BY_YEAR (ex:
 * Campeonato Nacional de Clubes Mid-Amateur). A ClubesGruposView cruza por
 * `fed` e calcula o best-N por equipa, exactamente como nos juvenis.
 */
export function autoGruposByClub(t: Tournament | null): GrupoEntry[] {
  if (!t) return [];
  // Agrupar jogadores por clube (a chave do grupo — letra — é atribuída só
  // depois, por ordem alfabética de clube, para o cartão mostrar "A/B/C…" na
  // caixa e o nome do clube ao lado — igual aos juvenis curados).
  const byClub = new Map<string, { clube: string; jogadores: GrupoEntry["jogadores"] }>();
  const add = (clubeRaw: string, nome: string, fed: string | null, hcpRaw: unknown) => {
    const clube = (clubeRaw || "Sem clube").trim();
    if (!byClub.has(clube)) byClub.set(clube, { clube, jogadores: [] });
    byClub.get(clube)!.jogadores.push({
      nome,
      fed: fed ?? null,
      hcp: hcpRaw != null && hcpRaw !== "" ? (hcpRaw as number) : 0,
    });
  };
  if (t.players.length) {
    for (const p of t.players) {
      add(p.club || "", p.name, p.fedCode ?? null, p.hcpExact ?? p.hcpPlay);
    }
  } else {
    // Pré-jogo: ainda não há scorecards. Usar os inscritos (_admissions.players)
    // para já compor as equipas por clube/categoria (exclui reservas).
    for (const p of t._admissions?.players ?? []) {
      if (p.status === "reserva") continue;
      add(p.clube || "", p.nome, p.fed ?? null, p.hcp);
    }
  }
  const letra = (i: number) =>
    i < 26 ? String.fromCharCode(65 + i)
           : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
  // Letras oficiais por clube (do sorteio FPG), se o torneio as trouxer
  // (campo `teamLetters` em CLUBES{ano}.json). Caso contrário, letras
  // alfabéticas por ordem de clube como fallback.
  const letterMap = t.teamLetters;
  return [...byClub.values()]
    .sort((a, b) => a.clube.localeCompare(b.clube, "pt"))
    .map((g, i) => ({ grupo: letterMap?.[g.clube] ?? letra(i), clube: g.clube, jogadores: g.jogadores }))
    .sort((a, b) => a.grupo.localeCompare(b.grupo));
}

/* ── Match play 3-way ─────────────────────────────────────────────────── */

/** Pontos de um clube num dia. O `subtotal` do ficheiro nem sempre existe (o
 *  Dia 2 do Regional 2026 não o tem) — nesse caso somam-se os pontos dos
 *  próprios confrontos, senão os pontos ficavam de fora do total do clube. */
export function diaPoints(dia: MpDia, clubKey: string): number {
  const fromMatches = (dia.matches ?? []).reduce((s, m) => {
    const v = m[clubKey];
    return s + (typeof v === "number" ? v : 0);
  }, 0);
  const hasMatchPts = (dia.matches ?? []).some(m => typeof m[clubKey] === "number");
  return hasMatchPts ? fromMatches : (dia.subtotal?.[clubKey] ?? 0);
}

/** Confrontos de um dia ainda sem resultado publicado (h2h vazio e sem pontos). */
export function diaPendentes(dia: MpDia): number {
  return (dia.matches ?? []).filter(m => !(m.h2h?.length) ).length;
}

export function playerRows(matches: (MpMatch & { _dia?: number })[], clubKey: string): MpRow[] {
  const out: MpRow[] = [];
  const idx = new Map<string, MpRow>();
  for (const m of matches) {
    const player = m.players?.[clubKey];
    const pts = m[clubKey] as number | null | undefined;
    const key = player?.fed ?? (player?.name ? `n:${player.name.toLowerCase()}` : `m:${m._dia}-${m.match}`);
    let row = idx.get(key);
    if (!row) {
      row = { key, player, pts: null, byOpp: new Map() };
      idx.set(key, row);
      out.push(row);
    }
    // Prefere o registo com gross (o dia de stroke play traz-no).
    if (!row.player?.gross && player?.gross != null) row.player = player;
    if (pts != null) row.pts = (row.pts ?? 0) + pts;
    // UNIÃO dos adversários do match: os que têm jogador listado (para gerar a
    // entrada pendente quando o resultado não foi publicado) MAIS os que só
    // aparecem no h2h (há matches em que se sabe o resultado mas não o nome do
    // adversário — Senhoras m1/m2, Homens m1). Percorrer só um dos lados
    // perderia informação de um deles.
    const oppKeys = new Set<string>([
      ...Object.keys(m.players ?? {}),
      ...(m.h2h ?? []).flatMap(h => [h.w, h.l]),
    ]);
    for (const opp of oppKeys) {
      if (opp === clubKey) continue;
      const h = (m.h2h ?? []).find(x =>
        (x.w === clubKey && x.l === opp) || (x.l === clubKey && x.w === opp));
      const list = row.byOpp.get(opp) ?? [];
      list.push(h
        ? { won: !h.half && h.w === clubKey, half: h.half === true, margin: h.margin }
        : { won: false, half: false, margin: null, pending: true });
      row.byOpp.set(opp, list);
    }
  }
  return out;
}

/** O Manuel jogou algum confronto deste match play? */
export function matchPlayHasManuel(mp: MatchPlayData | undefined): boolean {
  if (!mp) return false;
  return mp.categories.some(cat => cat.dias.some(dia =>
    (dia.matches ?? []).some(m => Object.values(m.players ?? {}).some(
      p => isManuel({ fed: p.fed, name: p.name })
    ))
  ));
}

/** Jogadores sintetizados a partir dos cartões do match play, para o tab
 *  Individual: todos os dias de um jogador juntos (fed como chave → o Manuel
 *  aparece 1× com R1+R2, não 2×). Só cartões com ≥ 9 buracos. */
export function matchPlayToPlayers(mp: MatchPlayData): Player[] {
  const par = mp.course?.par ?? [];
  if (!par.length) return [];
  const meters = mp.course?.meters ?? [];
  const tee = mp.course?.tee;
  const parTot = par.reduce((s, v) => s + v, 0);
  type RndEntry = { diaNum: number; gross: number; scores: (number | null)[]; nholes: number };
  const byPlayer = new Map<string, { fed?: string; name: string; club: string; rounds: RndEntry[] }>();
  for (const cat of mp.categories) {
    for (const dia of cat.dias) {
      for (const m of dia.matches ?? []) {
        for (const cl of mp.clubs) {
          const p = m.players?.[cl.key];
          if (!p?.scores || p.scores.filter(Boolean).length < 9) continue;
          const holesPlayed = p.scores.filter((v): v is number => v != null);
          const gross = holesPlayed.reduce((s, v) => s + v, 0);
          const nholes = holesPlayed.length;
          // fed code → merge rounds; sem fed → entrada única por dia/match
          const key = p.fed ?? `${cat.key}-d${dia.dia}-${cl.key}-m${m.match}`;
          const existing = byPlayer.get(key);
          const rnd: RndEntry = { diaNum: dia.dia, gross, scores: p.scores, nholes };
          if (existing) existing.rounds.push(rnd);
          else byPlayer.set(key, { fed: p.fed, name: p.name ?? cl.name, club: cl.name, rounds: [rnd] });
        }
      }
    }
  }
  return Array.from(byPlayer.entries()).map(([key, entry]): Player => {
    const allGross = entry.rounds.reduce((s, r) => s + r.gross, 0);
    const allComplete = entry.rounds.every(r => r.nholes >= par.length);
    const toPar = allComplete ? allGross - parTot * entry.rounds.length : null;
    // ⚠ `nholes` é o TAMANHO DA VOLTA (18), não os buracos preenchidos: com 16
    // o leaderboard desenhava uma volta de 16 buracos e o ±par comparava com o
    // par errado (caso Tomás Câmara, Regional de Clubes 2026).
    return {
      scoreId: `mp-${key}`,
      name: entry.name,
      club: entry.club,
      fedCode: entry.fed,
      pos: null,
      grossTotal: allGross,
      toPar,
      // Os buracos por jogar vêm a null (o ScorecardLB trata-os).
      scores: entry.rounds[0]?.scores as number[] | undefined,
      par,
      nholes: par.length,
      teeName: tee,
      meters,
      roundScores: entry.rounds.map(r => ({
        round: r.diaNum,
        gross: r.gross,
        scores: r.scores as number[],
        pars: par,
        si: [],
        meters,
        teeName: tee,
      })),
    };
  });
}

/** O emparelhamento do Dia 1 do match play como draw FPG (aparece como "Draw R1"). */
export function matchPlayDia1Draw(mp: MatchPlayData): FpgDraw | undefined {
  const dia1 = mp.dia1;
  if (!dia1) return undefined;
  const clubMap = Object.fromEntries(mp.clubs.map(c => [c.key, c]));
  const flights: FpgDrawFlight[] = Object.values(dia1.groups)
    .flat()
    .map(g => ({
      teeTime: g.teeTime,
      startHole: 1,
      tee: g.tee ?? null,
      players: g.players.map(p => ({
        nome: p.name,
        clube: clubMap[p.club]?.name ?? p.club,
        fed: p.fed ?? null,
        tee: p.tee ?? null,
      })),
    }))
    .sort((a, b) => a.teeTime.localeCompare(b.teeTime));
  const total = flights.reduce((s, f) => s + f.players.length, 0);
  return { name: `Draw — ${dia1.modalidade ?? "R1"}`, date: dia1.date, totalJogadores: total, groups: flights };
}

/** O torneio de clubes como o tab Individual o mostra: num match play com
 *  cartões, os jogadores saem dos confrontos e o Dia 1 entra como "Draw R1". */
export function clubesIndividualTournament(t: Tournament): Tournament {
  const mp = clubesFormatOf(t)?.matchPlay ? t.matchPlayResults : undefined;
  const mpPlayers = mp ? matchPlayToPlayers(mp) : [];
  const draw1 = mp ? matchPlayDia1Draw(mp) : undefined;
  const existing: Record<string, FpgDraw> = t._draws ?? {};
  return {
    ...t,
    ...(mpPlayers.length > 0 ? { players: mpPlayers } : {}),
    _draws: draw1 ? { "1": draw1, ...existing } : existing,
  };
}

/** O Manuel jogou (ou está nos confrontos do match play) neste torneio de
 *  clubes? Alimenta o ★Manuel da sidebar de /FPG/clubes. */
export function clubesHasManuel(t: Tournament): boolean {
  return t.players.some(p => isManuel(p)) || matchPlayHasManuel(t.matchPlayResults);
}