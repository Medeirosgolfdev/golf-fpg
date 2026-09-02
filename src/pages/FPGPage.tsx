// @refresh reset
/**
 * TorneiosAnalisePage.tsx — Análise Genérica de Torneios
 *
 * Lê automaticamente todos os ficheiros:
 *   /data/pull-torneios000.json
 *   /data/pull-torneios001.json
 *   /data/pull-torneios002.json
 *   ... (para quando aparecer um 404)
 *
 * Apresenta:
 *   • Sidebar com todos os torneios de todos os ficheiros, agrupados por mês/ano
 *   • Leaderboard com scorecard buraco-a-buraco
 *   • Tabs por ronda (R1, R2, ... + Acumulado para multi-ronda)
 *   • Suporte a 9H e 18H, 1 a N rondas
 */
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { loadPlayers } from "../data/loader";
import { buildEscLookup, type EscLookup, normalizePlayer } from "../utils/playerUtils";
import { PILL_SSERRA, SIDEBAR_ACCENT, EscPill, PillBadge } from "../ui/PillBadge";
import { TournSidebarItem, SSERRA_CCODE, type SidebarItemTournament } from "../ui/TournSidebarItem";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarSep } from "../ui/Toolbar";
import ExtLink from "../ui/ExternalLink";
import ResultMark from "../ui/ResultMark";
import LoadingState from "../ui/LoadingState";
import { useMasterDetail } from "../hooks/useMasterDetail";
import { tournamentUrl, parseTournKey, fmtDateShort } from "../utils/format";
import {
  isManuel,
  type PlayersDB,
} from "../ui/tournamentPrimitives";
import { PJARankingView } from "../ui/PJARankingView";
import { cachedFetchJson } from "../data/fetchCache";
import ClubesGruposView from "../ui/ClubesGruposView";
import ClubesCategoriasView, { type CategoriaCfg } from "../ui/ClubesCategoriasView";
import TournExtLinks from "../ui/TournExtLinks";
import type { FpgDraw, FpgDrawFlight } from "../data/nacional2026Loader";
// Tipos e utilitários FPG — fonte canónica em ../data/fpgTypes.ts e ../data/fpgUtils.ts
import type { Tournament, GrupoEntry } from "../data/fpgTypes";
import { buildDisplayList, tournamentHasManuel, isHiddenNonManuelDrive, isDriveOrAquapor } from "../data/fpgUtils";
import { isDNS } from "../ui/driveUtils";
// Leaderboard components — extraídos para fpg/LeaderboardComponents.tsx
// Inscrições e Jovens — extraídos para fpg/InscricoesComponents.tsx
import { InscricoesPanel, buildJovensGroups, buildEventGroups, type JovensGroup, type EventGroup } from "../ui/InscricoesComponents";
// Admissions + draws (browser scrape + merge) — ver CLAUDE.md
import { loadFpgAdmissionsDraws, indexFpgAdmissionsDraws, type FpgTournamentData } from "../data/nacional2026Loader";
import { FEATURED_TOURNAMENTS, buildFeaturedSynthetic, inferEscalao, stripEscalaoSuffix } from "../data/featuredTournaments";
import { DataSourcesChip, DataSourcesProvider, type DataSource } from "../ui/DataSources";
// Re-exports para consumidores que ainda importam de FPGPage
export type { RoundScore, Player, Tournament, ScorecardOptions } from "../data/fpgTypes";
export { expandMultiRound } from "../data/fpgUtils";
export { ScorecardLB, AccumulatedLB, AllRoundsScorecardLB } from "../ui/LeaderboardComponents";
export { TournamentDetail } from "./fpg/TournamentDetail";

// ── Módulos extraídos (refactor 2026-05-09) ──────────────────────────────
import {
  DATA_MAX, PRE_2020_KEY, yearMatchesFilter, dataUrl,
  TOURN_PILLS, type TournPill, type FileMeta, type DriveData,
} from "./fpg/constants";
import { isPJACore } from "../../ranking-pja/pja-rules.mjs";
import {
  type SeriesKey, URL_TO_FILTER, URL_TO_NAV, NAV_TO_URL, FILTER_TO_URL, INSCRITOS_SHORTCUTS,
} from "./fpg/routes";
import { CLUBES_GRUPOS_BY_YEAR } from "../data/clubesGruposData";
import { TournamentDetail } from "./fpg/TournamentDetail";
import { buildFpgEditionsIndex, fpgPastEditionsTabs } from "./fpg/fpgPastEditions";
import { fpgOmRankingTabs } from "./fpg/fpgOmRanking";

/** Junta o tab da Ordem de Mérito (CGSS) aos tabs de "Edições anteriores". */
function fpgExtraTabs(editionsIndex: Parameters<typeof fpgPastEditionsTabs>[0], t: Parameters<typeof fpgOmRankingTabs>[0], playersDB?: Parameters<typeof fpgPastEditionsTabs>[2]) {
  const tabs = [...(fpgOmRankingTabs(t) ?? []), ...(fpgPastEditionsTabs(editionsIndex, t, playersDB) ?? [])];
  return tabs.length ? tabs : undefined;
}
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitConfig } from "../ui/circuit/types";
import { buildFpgEntries, fpgRepDivision, FPG_CONFIG } from "./fpg/fpgCircuitData";

/* ─────────────────────────────────────────────
   MAIN CONTENT
   ───────────────────────────────────────────── */


/* InscricoesPanel, buildJovensGroups, TERMOS_COMPETICAO, JovensGroup — importados de fpg/InscricoesComponents */

/**
 * Auto-constrói a composição de equipas (GrupoEntry[]) de um torneio de clubes
 * a partir dos próprios jogadores, agrupados pelo campo `club`. Usado para
 * torneios de clubes sem composição curada em CLUBES_GRUPOS_BY_YEAR (ex:
 * Campeonato Nacional de Clubes Mid-Amateur). A ClubesGruposView cruza por
 * `fed` e calcula o best-N por equipa, exactamente como nos juvenis.
 */
function autoGruposByClub(t: Tournament | null): GrupoEntry[] {
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
      add(p.club || "", p.name, p.fedCode ?? null, (p as any).hcpExact ?? (p as any).hcpPlay);
    }
  } else {
    // Pré-jogo: ainda não há scorecards. Usar os inscritos (_admissions.players)
    // para já compor as equipas por clube/categoria (exclui reservas).
    const adm = (t as any)._admissions?.players as Array<{
      nome: string; fed?: string; clube?: string; hcp?: number | string; status?: string;
    }> | undefined;
    for (const p of adm || []) {
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
  const letterMap = (t as any).teamLetters as Record<string, string> | undefined;
  return [...byClub.values()]
    .sort((a, b) => a.clube.localeCompare(b.clube, "pt"))
    .map((g, i) => ({ grupo: letterMap?.[g.clube] ?? letra(i), clube: g.clube, jogadores: g.jogadores }))
    .sort((a, b) => a.grupo.localeCompare(b.grupo));
}

/**
 * Formato de pontuação por equipa para torneios de clubes NÃO-juvenis, keyed
 * por `${ccode}-${tcode}`. Vive em código (e não no JSON) para sobreviver a
 * re-scrapes dos ficheiros CLUBES{ano}.json. `bestNByRound` = nº de resultados
 * contados em cada ronda; `note` = descrição mostrada no topo da vista Grupos.
 * Default para midam sem entrada: 5 melhores em todas as rondas (Absoluto).
 */
const CLUBES_TEAM_FORMAT: Record<string, {
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
}> = {
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

// ── 3-Way Match Play Results ──────────────────────────────────────────────
interface MpPlayer { name: string; fed?: string; gross?: number | null; toPar?: number | null; scores?: (number | null)[]; }
interface MpH2H    { w: string; l: string; margin: string | null; half?: boolean; }
interface MpMatch  {
  match: number;
  note?: string;
  players?: Record<string, MpPlayer>;
  h2h?: MpH2H[];
}
interface MpDia    { dia: number; matches?: MpMatch[]; subtotal: Record<string, number>; }
interface MpCat    { key: string; label: string; note?: string; dias: MpDia[]; }
interface MpDrawPlayer { name: string; fed?: string; club: string; tee?: string; }
interface MpDrawGroup  { teeTime: string; tee?: string; players: MpDrawPlayer[]; }
interface MatchPlayData {
  lastUpdated?: string;
  clubs: { key: string; name: string; shortName: string }[];
  categories: MpCat[];
  course?: { nome?: string; tee?: string; par: number[]; parTotal?: number; };
  dia1?: { date?: string; modalidade?: string; campo?: string; groups: Record<string, MpDrawGroup[]>; };
  dia2?: { date?: string; modalidade?: string; campo?: string; groups: Record<string, MpDrawGroup[]>; };
}

const MP_CLUB_COLOR = "var(--color-good-dark,#2d6a4f)";

/** Uma linha por JOGADOR (não por match): no modo Total um miúdo joga nos dois
 *  dias e aparecia 2× na tabela. Agrega por fed (ou nome) somando os pontos e
 *  juntando os confrontos de cada adversário. */
interface MpRow {
  key: string;
  player: MpPlayer | undefined;
  pts: number | null;
  /** Uma entrada POR CONFRONTO JOGADO (não por resultado): quando o jogador
   *  esteve emparelhado mas o resultado não foi publicado, a entrada fica
   *  `pending` — assim a linha do dia não desaparece e vê-se o que falta. */
  byOpp: Map<string, { won: boolean; half: boolean; margin: string | null; pending?: boolean }[]>;
}
/** Pontos de um clube num dia. O `subtotal` do ficheiro nem sempre existe (o
 *  Dia 2 do Regional 2026 não o tem) — nesse caso somam-se os pontos dos
 *  próprios confrontos, senão os pontos ficavam de fora do total do clube. */
function diaPoints(dia: MpDia, clubKey: string): number {
  const fromMatches = (dia.matches ?? []).reduce((s, m) => {
    const v = (m as unknown as Record<string, unknown>)[clubKey];
    return s + (typeof v === "number" ? v : 0);
  }, 0);
  const hasMatchPts = (dia.matches ?? []).some(m => typeof (m as unknown as Record<string, unknown>)[clubKey] === "number");
  return hasMatchPts ? fromMatches : (dia.subtotal?.[clubKey] ?? 0);
}

/** Confrontos de um dia ainda sem resultado publicado (h2h vazio e sem pontos). */
function diaPendentes(dia: MpDia): number {
  return (dia.matches ?? []).filter(m => !(m.h2h?.length) ).length;
}

function playerRows(matches: (MpMatch & { _dia?: number })[], clubKey: string): MpRow[] {
  const out: MpRow[] = [];
  const idx = new Map<string, MpRow>();
  for (const m of matches) {
    const player = m.players?.[clubKey];
    const pts = (m as unknown as Record<string, unknown>)[clubKey] as number | null | undefined;
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

/** Vistas da mesma prova de match play:
 *  • `standings` — cartões de clube com os pontos (tab Grupos)
 *  • `matches`   — os confrontos 3-way, com estado buraco-a-buraco (tab Match Play)
 *  • `scorecardOnly` — só os scorecards em pancadas (tab Individual) */
function MatchPlayResultsTable({
  results,
  categories: catCfg,
  scorecardOnly = false,
  mode = "standings",
}: {
  results: MatchPlayData;
  categories: { key: string; label: string; bestN: number }[];
  scorecardOnly?: boolean;
  mode?: "standings" | "matches";
}) {
  const clubs = results.clubs;
  const par = results.course?.par ?? [];

  // Dias da prova (o Regional 2026 são 2: match play + stroke play). Sem o
  // filtro, os dois dias apareciam empilhados no mesmo cartão e cada jogador
  // saía repetido — daí o selector.
  const dias = useMemo(() => {
    const s = new Set<number>();
    for (const cat of results.categories) for (const d of cat.dias) s.add(d.dia);
    return [...s].sort((a, b) => a - b);
  }, [results]);
  const [selDia, setSelDia] = useState<number | "all">(dias[0] ?? 1);
  const diaOf = (d: MpDia) => selDia === "all" || d.dia === selDia;
  const DiaPicker = dias.length > 1 ? (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px 0" }}>
      <span style={{ fontSize: "var(--fs-11)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", fontWeight: 700 }}>Dia</span>
      <div className="segmented-toggle" role="tablist" aria-label="Dia da prova">
        {dias.map(d => (
          <button key={d} role="tab" aria-selected={selDia === d}
            className={`seg-btn${selDia === d ? " active" : ""}`} onClick={() => setSelDia(d)}>
            <span className="seg-label">Dia {d}</span>
          </button>
        ))}
        <button role="tab" aria-selected={selDia === "all"}
          className={`seg-btn${selDia === "all" ? " active" : ""}`} onClick={() => setSelDia("all")}
          title="Somar os dois dias">
          <span className="seg-label">Total</span>
        </button>
      </div>
    </div>
  ) : null;

  const fmtPts = (v: number | null | undefined) => {
    if (v == null) return "—";
    if (v === 0.5) return "½";
    if (v === 1.5) return "1½";
    return String(v);
  };

  const scCls = (g: number, p: number): React.CSSProperties => {
    const d = g - p;
    if (d <= -2) return { background: "var(--bg-warn-subtle)", color: "var(--color-warn-dark)", borderRadius: "50%", fontWeight: 700 };
    if (d === -1) return { background: "var(--bg-danger-subtle)", color: "var(--color-danger-dark)", borderRadius: "50%", fontWeight: 700 };
    if (d === 1)  return { background: "var(--bg-info-subtle)", color: "var(--color-info-dark)" };
    if (d === 2)  return { background: "var(--bg-info-subtle)", color: "var(--color-info-dark)", fontWeight: 700 };
    if (d >= 3)   return { background: "var(--bg-info-subtle)", color: "var(--color-info-dark)", fontWeight: 700 };
    return {};
  };

  const grand: Record<string, number> = {};
  for (const cl of clubs)
    grand[cl.key] = results.categories.reduce((gs, rcat) =>
      gs + rcat.dias.filter(diaOf).reduce((ds, dia) => ds + diaPoints(dia, cl.key), 0), 0);
  // Confrontos por disputar/publicar na selecção actual — o Dia 2 do Regional
  // 2026 só tem 1 dos 4 resultados, e sem isto o total parecia definitivo.
  const pendentes = results.categories.reduce((s, rcat) =>
    s + rcat.dias.filter(diaOf).reduce((ds, dia) => ds + diaPendentes(dia), 0), 0);
  const places: Record<string, number> | undefined = (results as any).grandTotal?._places;
  const sortedClubs = [...clubs].sort((a, b) =>
    places ? (places[a.key] ?? 99) - (places[b.key] ?? 99) : (grand[b.key] ?? 0) - (grand[a.key] ?? 0));
  const maxGrand = Math.max(...clubs.map(cl => grand[cl.key] ?? 0));
  const hasResults = maxGrand > 0;

  const hasScorecards = par.length > 0 && results.categories.some(cat =>
    cat.dias.some(dia => dia.matches?.some(m =>
      clubs.filter(cl => (m.players?.[cl.key]?.scores?.length ?? 0) >= 9).length >= 2
    ))
  );

  const f9 = Array.from({ length: 9 }, (_, i) => i);
  const b9 = Array.from({ length: 9 }, (_, i) => i + 9);
  const cSc: React.CSSProperties = { padding: "3px 1px", textAlign: "center", fontSize: "var(--fs-11)", width: 26, minWidth: 26 };
  const cLbl: React.CSSProperties = { padding: "4px 8px", fontSize: "var(--fs-12)", whiteSpace: "nowrap", position: "sticky", left: 0, background: "var(--bg-card,white)", zIndex: 1 };
  const cSum: React.CSSProperties = { padding: "4px 6px", textAlign: "center", fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--text-2)" };

  // Modo scorecard-only: só renderiza a secção de scorecards (para o tab Individual)
  if (scorecardOnly) {
    if (!hasScorecards) return <div className="muted center-msg" style={{ padding: 24 }}>Sem scorecards disponíveis.</div>;
    return (
      <div style={{ padding: "20px 16px 24px" }}>
        {catCfg.flatMap(c => {
          const rcat = results.categories.find(rc => rc.key === c.key);
          if (!rcat) return [];
          return rcat.dias.flatMap(dia =>
            (dia.matches ?? []).map(m => {
              const withScores = clubs.filter(cl => (m.players?.[cl.key]?.scores?.length ?? 0) >= 9);
              if (withScores.length < 2) return null;
              return (
                <div key={`${dia.dia}-${m.match}`} style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--text-2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Match {m.match} — {c.label}
                  </div>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", width: "max-content", minWidth: "100%", fontSize: "var(--fs-11)" }}>
                        <thead>
                          <tr style={{ background: "var(--bg-2)" }}>
                            <th style={{ ...cLbl, background: "var(--bg-2)", fontWeight: 700, color: "var(--text-2)" }}>Buraco</th>
                            {f9.map(i => <th key={i} style={cSc}>{i + 1}</th>)}
                            <th style={{ ...cSum, borderLeft: "2px solid var(--border)" }}>Out</th>
                            {b9.map(i => <th key={i} style={cSc}>{i + 1}</th>)}
                            <th style={{ ...cSum, borderLeft: "2px solid var(--border)" }}>In</th>
                            <th style={{ ...cSum, borderLeft: "2px solid var(--border)" }}>Tot</th>
                          </tr>
                          <tr style={{ borderBottom: "2px solid var(--border)" }}>
                            <th style={{ ...cLbl, fontWeight: 400, color: "var(--text-3)" }}>Par</th>
                            {f9.map(i => <td key={i} style={{ ...cSc, color: "var(--text-3)" }}>{par[i]}</td>)}
                            <td style={{ ...cSum, borderLeft: "2px solid var(--border)", color: "var(--text-3)", fontWeight: 400 }}>{f9.reduce((s, i) => s + (par[i] ?? 0), 0)}</td>
                            {b9.map(i => <td key={i} style={{ ...cSc, color: "var(--text-3)" }}>{par[i]}</td>)}
                            <td style={{ ...cSum, borderLeft: "2px solid var(--border)", color: "var(--text-3)", fontWeight: 400 }}>{b9.reduce((s, i) => s + (par[i] ?? 0), 0)}</td>
                            <td style={{ ...cSum, borderLeft: "2px solid var(--border)", color: "var(--text-3)", fontWeight: 400 }}>{par.reduce((s, p) => s + p, 0)}</td>
                          </tr>
                        </thead>
                        <tbody>
                          {withScores.map((cl, ri) => {
                            const player = m.players?.[cl.key];
                            const sc = player?.scores ?? [];
                            const f9sum = f9.reduce((s, i) => s + (sc[i] ?? 0), 0);
                            const b9sum = b9.reduce((s, i) => s + (sc[i] ?? 0), 0);
                            const tot = sc.reduce((s: number, v) => s + (v ?? 0), 0);
                            const wins = m.h2h?.filter(h => h.w === cl.key) ?? [];
                            const losses = m.h2h?.filter(h => h.l === cl.key) ?? [];
                            return (
                              <tr key={cl.key} style={{ borderTop: ri === 0 ? "none" : "1px solid var(--border)" }}>
                                <td style={cLbl}>
                                  <div style={{ fontWeight: 600 }}>
                                    <span style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", marginRight: 4 }}>{cl.shortName}</span>
                                    {player?.name ?? cl.name}
                                  </div>
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 1 }}>
                                    {wins.map((h, hi) => { const opp = clubs.find(c2 => c2.key === h.l); return <span key={`w${hi}`} style={{ fontSize: "var(--fs-10)", color: MP_CLUB_COLOR }}><ResultMark kind="win" gap={3} />{opp?.shortName ?? h.l}{h.margin ? ` ${h.margin}` : ""}</span>; })}
                                    {losses.map((h, hi) => { const opp = clubs.find(c2 => c2.key === h.w); return <span key={`l${hi}`} style={{ fontSize: "var(--fs-10)", color: "var(--text-3)" }}><ResultMark kind="loss" gap={3} />{opp?.shortName ?? h.w}{h.margin ? ` ${h.margin}` : ""}</span>; })}
                                  </div>
                                </td>
                                {f9.map(i => { const g = sc[i]; return <td key={i} style={cSc}>{g != null ? <span style={{ display: "inline-block", width: 18, lineHeight: "18px", ...scCls(g, par[i]) }}>{g}</span> : <span style={{ color: "var(--text-3)" }}>–</span>}</td>; })}
                                <td style={{ ...cSum, borderLeft: "2px solid var(--border)" }}>{f9sum || "–"}</td>
                                {b9.map(i => { const g = sc[i]; return <td key={i} style={cSc}>{g != null ? <span style={{ display: "inline-block", width: 18, lineHeight: "18px", ...scCls(g, par[i]) }}>{g}</span> : <span style={{ color: "var(--text-3)" }}>–</span>}</td>; })}
                                <td style={{ ...cSum, borderLeft: "2px solid var(--border)" }}>{b9sum || "–"}</td>
                                <td style={{ ...cSum, borderLeft: "2px solid var(--border)" }}>{tot || "–"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      {DiaPicker}
      {pendentes > 0 && (
        <div style={{
          margin: "10px 16px 0", padding: "8px 12px", borderRadius: 6,
          background: "var(--bg-note-warn)", border: "1px solid var(--border-warn)",
          fontSize: "var(--fs-11)", color: "var(--text-2)",
        }}>
          ⚠ <strong>{pendentes}</strong> {pendentes === 1 ? "confronto sem resultado publicado" : "confrontos sem resultado publicado"} —
          a FPG não publicou a classificação desta prova, por isso estas linhas ficam sem pontos até os resultados serem inseridos.
        </div>
      )}

      {/* ══ CLUBE CARDS — standings + resultados ════════════ */}
      {mode === "standings" && (
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 10 }}>
          {sortedClubs.map((cl, rank) => {
            const opps = clubs.filter(c => c.key !== cl.key);
            return (
              <div key={cl.key} style={{
                background: "var(--bg-card,#fff)", border: "1px solid var(--border)",
                borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06)",
              }}>
                <div style={{ background: MP_CLUB_COLOR, color: "#fff", padding: "8px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, background: "rgba(255,255,255,0.2)", borderRadius: 6, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "var(--fs-20)", fontWeight: 900,
                  }}>{rank + 1}</div>
                  <div style={{ flex: 1, fontSize: "var(--fs-12)", fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cl.name}
                  </div>
                  <div style={{ fontSize: "var(--fs-20)", fontWeight: 900, lineHeight: 1, opacity: hasResults ? 1 : 0.35 }}>
                    {fmtPts(grand[cl.key] ?? 0)}
                  </div>
                </div>
                {results.categories.map((rcat, catIdx) => {
                  // Skip category if this club is not a participant (e.g. CGSS in Senhoras)
                  const catParticipants: string[] | undefined = (rcat as any).participants;
                  if (catParticipants && !catParticipants.includes(cl.key)) return null;
                  const catLabel = catCfg.find(c => c.key === rcat.key)?.label ?? rcat.key;
                  const visDias = rcat.dias.filter(diaOf);
                  const catTotal = visDias.reduce((s, dia) => s + diaPoints(dia, cl.key), 0);
                  // Um jogador por LINHA por dia — sem o filtro, os 2 dias
                  // empilhavam-se e o mesmo miúdo aparecia 2× na tabela.
                  const allMatches = visDias.flatMap(dia => (dia.matches ?? []).map(m => ({ ...m, _dia: dia.dia })));
                  if (!allMatches.length) return null;
                  // Opponents: filtered by category participants when defined
                  const catOpps = catParticipants
                    ? opps.filter(o => catParticipants.includes(o.key))
                    : opps;
                  return (
                    <div key={rcat.key} style={{ borderTop: catIdx === 0 ? "none" : "1px solid var(--border)" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-12)" }}>
                        <thead>
                          <tr>
                            <th colSpan={catOpps.length + 2} style={{
                              padding: "5px 10px", textAlign: "left",
                              background: "var(--bg-muted)", borderBottom: "1px solid var(--border)",
                              fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--text-2)",
                            }}>
                              <span>{catLabel}</span>
                              {catTotal > 0 && <span style={{ float: "right", color: MP_CLUB_COLOR }}>{fmtPts(catTotal)} pts</span>}
                            </th>
                          </tr>
                          <tr style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
                            <th style={{ padding: "4px 10px", textAlign: "left", fontWeight: 700, fontSize: "var(--fs-11)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Jogador</th>
                            {catOpps.map(opp => (
                              <th key={opp.key} style={{ padding: "4px 8px", textAlign: "center", fontWeight: 700, fontSize: "var(--fs-11)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                                vs {opp.shortName}
                              </th>
                            ))}
                            <th style={{ padding: "4px 8px", textAlign: "center", fontWeight: 700, fontSize: "var(--fs-11)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Pts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {playerRows(allMatches, cl.key).map((row) => {
                            const player = row.player;
                            const pts = row.pts;
                            const tdB: React.CSSProperties = { borderBottom: "1px solid var(--border)" };
                            return (
                              <tr key={row.key}>
                                <td style={{ padding: "5px 10px", ...tdB }}>
                                  {player?.name
                                    ? (player.fed
                                      ? <a href={`/jogadores/${player.fed}`} style={{ color: "var(--text-1)", textDecoration: "none" }}
                                          onMouseOver={e => (e.currentTarget.style.textDecoration = "underline")}
                                          onMouseOut={e => (e.currentTarget.style.textDecoration = "none")}>{player.name}</a>
                                      : player.name)
                                    : <span style={{ color: "var(--text-3)" }}>—</span>}
                                  {player?.gross != null && (
                                    <span style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", marginLeft: 5 }}>
                                      {player.gross}{player.toPar != null ? ` (${player.toPar >= 0 ? "+" : ""}${player.toPar})` : ""}
                                    </span>
                                  )}
                                </td>
                                {catOpps.map(opp => {
                                  // No modo Total um jogador tem um confronto por dia
                                  // contra o mesmo adversário — mostram-se os dois.
                                  const entries = row.byOpp.get(opp.key) ?? [];
                                  return (
                                    <td key={opp.key} style={{ padding: "5px 6px", textAlign: "center", ...tdB }}>
                                      {entries.length ? (
                                        // Um confronto por LINHA (empilhados) — no modo
                                        // Total, os dois dias lado a lado liam-se como um
                                        // resultado só ("✗ 🏆5&4").
                                        <span style={{ display: "inline-flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                                          {entries.map((e, ei) => e.pending ? (
                                            <span key={ei} style={{ color: "var(--text-4)" }} title="Sem resultado publicado">—</span>
                                          ) : e.half ? (
                                            <ResultMark key={ei} kind="half" gap={0} />
                                          ) : (
                                            // 🏆/✗ do <ResultMark> — o mesmo vocabulário do match play ETC (MatchplayView)
                                            <span key={ei} style={{ fontSize: "var(--fs-11)", fontWeight: e.won ? 700 : 400 }}>
                                              <ResultMark kind={e.won ? "win" : "loss"} gap={e.margin ? 4 : 0} />{e.margin ? <strong>{e.margin}</strong> : ""}
                                            </span>
                                          ))}
                                        </span>
                                      ) : (
                                        <span style={{ color: "var(--text-3)" }}>—</span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td style={{
                                  padding: "5px 6px", textAlign: "center", ...tdB,
                                  fontWeight: pts != null && pts > 0 ? 700 : 400,
                                  color: pts != null && pts > 0 ? MP_CLUB_COLOR : "var(--text-3)",
                                  fontSize: "var(--fs-13)",
                                }}>
                                  {pts != null ? fmtPts(pts) : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* ══ CONFRONTOS — match play (estado por buraco, sem pancadas) ══ */}
      {mode === "matches" && hasScorecards && (() => {
        // Running match-play status (from clA perspective)
        const mpRunning = (scA: (number|null)[], scB: (number|null)[]) => {
          const n = par.length;
          const statuses: { label: string; aLeads: boolean; bLeads: boolean; ended: boolean }[] = [];
          let diff = 0; let ended = false;
          for (let i = 0; i < n; i++) {
            const a = scA[i], b = scB[i];
            if (!ended && a != null && b != null) {
              if (a < b) diff++; else if (a > b) diff--;
            }
            const rem = n - 1 - i;
            if (ended) { statuses.push({ label: "", aLeads: diff > 0, bLeads: diff < 0, ended: true }); }
            else if (Math.abs(diff) > rem) { statuses.push({ label: `${Math.abs(diff)}&${rem}`, aLeads: diff > 0, bLeads: diff < 0, ended: true }); ended = true; }
            else if (diff === 0) { statuses.push({ label: "AS", aLeads: false, bLeads: false, ended: false }); }
            else { statuses.push({ label: `${Math.abs(diff)}up`, aLeads: diff > 0, bLeads: diff < 0, ended: false }); }
          }
          return { statuses, diff };
        };

        return (
          <div style={{ padding: "20px 16px 0" }}>
            {catCfg.flatMap(c => {
              const rcat = results.categories.find(rc => rc.key === c.key);
              if (!rcat) return [];
              return rcat.dias.filter(diaOf).flatMap(dia =>
                (dia.matches ?? []).map(m => {
                  const withScores = clubs.filter(cl => (m.players?.[cl.key]?.scores?.length ?? 0) >= 9);
                  if (withScores.length < 2) return null;

                  // Pairs for match rows
                  const pairs: [typeof clubs[0], typeof clubs[0]][] = [];
                  for (let i = 0; i < withScores.length; i++)
                    for (let j = i + 1; j < withScores.length; j++)
                      pairs.push([withScores[i], withScores[j]]);

                  // Colunas: rótulo (fixo) + 18 buracos (repartem o resto) + resultado.
                  // As antigas células vazias de separação Out/In absorviam toda a
                  // folga da tabela e esmagavam os buracos 10-18 — agora o corte do
                  // 9→10 é só uma borda na 10ª coluna.
                  const cHole: React.CSSProperties = { padding: "4px 2px", textAlign: "center", fontSize: "var(--fs-10)", whiteSpace: "nowrap" };
                  const sep9: React.CSSProperties = { borderLeft: "2px solid var(--sc-par-border)" };
                  return (
                    <div key={`${dia.dia}-${m.match}`} style={{ marginBottom: 22, maxWidth: 980 }}>
                      <div style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--text-2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                        {c.label} · Match {m.match}
                        {dias.length > 1 && <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> · Dia {dia.dia}</span>}
                      </div>

                      <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                        {/* Cabeçalho do confronto: os 3 jogadores e o que fizeram */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                          {withScores.map(cl => {
                            const player = m.players?.[cl.key];
                            const pts = m[cl.key as keyof MpMatch] as number | undefined;
                            const isTop = pts != null && withScores.every(c2 => (m[c2.key as keyof MpMatch] as number ?? 0) <= pts);
                            return (
                              <div key={cl.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-11)" }}>
                                <span className="p p-sm p-muted">{cl.shortName}</span>
                                <span style={{ fontWeight: isTop ? 700 : 600, color: "var(--text-1)" }}>{player?.name ?? cl.name}</span>
                                {player?.gross != null && <span style={{ fontSize: "var(--fs-10)", color: "var(--text-3)" }}>{player.gross}{player.toPar != null ? ` (${player.toPar >= 0 ? "+" : ""}${player.toPar})` : ""}</span>}
                                <span style={{ display: "flex", gap: 5 }}>
                                  {(m.h2h ?? []).filter(h => h.w === cl.key && !h.half).map((h, hi) => { const opp = clubs.find(c2 => c2.key === h.l); return <span key={hi} style={{ fontSize: "var(--fs-10)", color: "var(--accent)" }}><ResultMark kind="win" gap={3} />{opp?.shortName}{h.margin ? ` ${h.margin}` : ""}</span>; })}
                                  {(m.h2h ?? []).filter(h => h.l === cl.key && !h.half).map((h, hi) => { const opp = clubs.find(c2 => c2.key === h.w); return <span key={hi} style={{ fontSize: "var(--fs-10)", color: "var(--text-3)" }}><ResultMark kind="loss" gap={3} />{opp?.shortName}{h.margin ? ` ${h.margin}` : ""}</span>; })}
                                  {(m.h2h ?? []).filter(h => h.half && (h.w === cl.key || h.l === cl.key)).map((h, hi) => { const opp = clubs.find(c2 => c2.key === (h.w === cl.key ? h.l : h.w)); return <span key={hi} style={{ fontSize: "var(--fs-10)", color: "var(--text-2)" }}><ResultMark kind="half" gap={3} />{opp?.shortName}</span>; })}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <div style={{ overflowX: "auto" }}>
                          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--fs-11)" }}>
                            <thead>
                              <tr style={{ background: "var(--accent-light)" }}>
                                <th style={{ ...cLbl, background: "var(--accent-light)", width: "1%", fontWeight: 700, fontSize: "var(--fs-10)", color: "var(--accent-text)", textTransform: "uppercase", letterSpacing: "0.4px" }}>Confronto</th>
                                {f9.map(i => <th key={i} style={{ ...cHole, color: "var(--accent-text)", fontWeight: 700 }}>{i + 1}</th>)}
                                {b9.map((i, k) => <th key={i} style={{ ...cHole, ...(k === 0 ? sep9 : {}), color: "var(--accent-text)", fontWeight: 700 }}>{i + 1}</th>)}
                                <th style={{ ...cHole, width: "1%", borderLeft: "2px solid var(--sc-par-border)", padding: "4px 10px", color: "var(--accent-text)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", fontSize: "var(--fs-10)" }}>Resultado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pairs.map(([clA, clB], pi) => {
                                const scA = m.players?.[clA.key]?.scores ?? [];
                                const scB = m.players?.[clB.key]?.scores ?? [];
                                const { statuses, diff } = mpRunning(scA, scB);
                                const winner = diff > 0 ? clA : diff < 0 ? clB : null;
                                const finalEntry = m.h2h?.find(h =>
                                  (h.w === clA.key && h.l === clB.key) || (h.w === clB.key && h.l === clA.key)
                                );
                                const finalLabel = finalEntry?.half ? "½" : finalEntry ? `${finalEntry.margin ?? (diff > 0 ? clA.shortName : clB.shortName + " ganha")}` : (winner ? `${Math.abs(diff)}up` : "AS");
                                // Último buraco com estado — o desfecho do confronto.
                                const lastIdx = statuses.reduce((acc, s, i) => (s?.label ? i : acc), -1);
                                const chip = (i: number) => {
                                  const s = statuses[i];
                                  const lab = s?.label || "";
                                  if (!lab) return "";
                                  // "AS" é o estado neutro: ponto discreto, como no MatchplayView
                                  // (18 células "AS" repetidas afogavam o que interessa).
                                  if (lab === "AS" && i !== lastIdx) return <span style={{ color: "var(--text-4)" }}>·</span>;
                                  const kind = s.aLeads ? "mp-up" : s.bLeads ? "mp-dn" : "mp-as";
                                  return <span className={`mp-hole-chip ${kind}`} style={i === lastIdx ? { fontWeight: 800, boxShadow: "inset 0 0 0 1px currentColor" } : undefined}>{lab}</span>;
                                };
                                return (
                                  <tr key={pi} style={{ borderTop: pi === 0 ? "none" : "1px solid var(--border)" }}>
                                    <td style={{ ...cLbl, width: "1%", fontStyle: "normal" }}>
                                      <span style={{ color: "var(--accent)", fontWeight: 700 }}>{clA.shortName}</span>
                                      <span style={{ color: "var(--text-3)", margin: "0 4px" }}>vs</span>
                                      <span style={{ color: "var(--medal-bronze)", fontWeight: 700 }}>{clB.shortName}</span>
                                    </td>
                                    {f9.map(i => <td key={i} style={{ ...cHole, padding: "5px 2px" }}>{chip(i)}</td>)}
                                    {b9.map((i, k) => <td key={i} style={{ ...cHole, ...(k === 0 ? sep9 : {}), padding: "5px 2px" }}>{chip(i)}</td>)}
                                    <td style={{ ...cHole, width: "1%", padding: "5px 10px", borderLeft: "2px solid var(--sc-par-border)", fontWeight: 700, fontSize: "var(--fs-11)", color: finalEntry?.half ? "var(--text-2)" : winner ? (winner.key === clA.key ? "var(--accent)" : "var(--medal-bronze)") : "var(--text-3)" }}>
                                      {finalLabel}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })
              );
            })}
          </div>
        );
      })()}

    </div>
  );

}

function Content() {
  const location = useLocation();
  const navigate = useNavigate();
  const params   = useParams<{ filter?: string; sub?: string; tkey?: string }>();

  // Deep-link de torneio (`/FPG/torneio/{ccode}-{tcode}`) — prioritário sobre
  // os filtros de série. Quando presente, fazemos auto-select do torneio no
  // useEffect mais abaixo, assim que o displayList/jovensTournaments carregar.
  const urlTkey = params.tkey || null;

  // Resolver filtro inicial pela URL. Dois formatos válidos para inscrições:
  //   /FPG/jovens/inscritosCN  (canónico, nested)
  //   /FPG/inscritosCN         (atalho top-level — também funciona)
  const urlSeg = (params.filter || "").toLowerCase();
  const urlSub = (params.sub    || "").toLowerCase();
  const isInscritosShortcut = INSCRITOS_SHORTCUTS.has(urlSeg);
  const startSeries: SeriesKey = isInscritosShortcut
    ? "jovens"
    : (URL_TO_FILTER[urlSeg] ?? "");
  const startInscritos = isInscritosShortcut
    || (startSeries === "jovens" && INSCRITOS_SHORTCUTS.has(urlSub));
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [fileMeta, setFileMeta] = useState<FileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("A carregar ficheiros...");
  const [error, setError] = useState<string | null>(null);
  // selected=-1 inicial (independente de haver ou não params.tkey):
  // - Com deep-link: URL→state encontra o match e chama setSelected(idx).
  // - Sem deep-link (utilizador entra em /FPG): `cur = displayList[-1] = undefined`
  //   → o render mostra "Selecciona um torneio" em vez de auto-seleccionar
  //   o primeiro torneio (que ficaria em branco se não tiver scorecards).
  // Sem esta guarda, selected=0 fazia o render mostrar displayList[0] (torneio
  // aleatório, dependendo de qual ficheiro pull-torneios carregou primeiro)
  // enquanto pjaExtra ou jovens ainda carregam — dando a ilusão de "várias
  // páginas a piscar".
  const [selected, setSelected] = useState<number>(-1);
    const md = useMasterDetail();
  // Filtros sincronizados com URL query params para partilha directa.
  // Ex: `/FPG?year=2026&manuel=0&q=pedro`. Declarado ANTES dos useStates que
  // dependem dele (Temporal Dead Zone).
  const [searchParams, setSearchParams] = useSearchParams();
  const [navMode, setNavMode]         = useState<"torneios" | "ranking-pja" | "ranking-sub12" | "classificacoes">(
    URL_TO_NAV[urlSeg] ?? "torneios"
  );
  const [seriesFilter, setSeriesFilter] = useState<"" | "circuit" | "santo" | "clubes" | "jovens">(
    (startInscritos || urlSeg === "jovens") ? "jovens" : ""
  );
  const [yearFilter, setYearFilter]    = useState<string | null>(() => searchParams.get("year"));
  const [filterManuel, setFilterManuel] = useState(() => searchParams.get("manuel") !== "0");
  const [searchQuery, setSearchQuery]  = useState(() => searchParams.get("q") || "");  // filtro de texto: nome ou campo/clube
  const [escLookup, setEscLookup] = useState<EscLookup>(new Map());
  const [playersDB, setPlayersDB] = useState<PlayersDB>({});
  // Lista de fedCodes inscritos no circuito PJA por ano.
  // Carregado de /data/pja-members.json — ver PJARankingView para uso.
  const [pjaMembers, setPjaMembers] = useState<Record<string, string[]>>({});
  // Snapshot do PDF oficial PJA para comparação — se definido, a tabela mostra
  // Δ pts e Δ rondas vs PDF e destaca células com disparidade.
  const [pjaPdfSnapshot, setPjaPdfSnapshot] = useState<Record<string, Array<{fed:string;name:string;rounds:number;pts:number;pos:number}>>>({});

  // ── Estado Clubes ─────────────────────────────────────────────────────────
  const [clubesTournaments, setClubesTournaments] = useState<Tournament[]>([]);
  const [clubesLoading, setClubesLoading]         = useState(false);
  const [clubesLoaded, setClubesLoaded]           = useState(false);
  const [clubesSelected, setClubesSelected]       = useState<number>(0);
  const [clubesView, setClubesView]               = useState<"individual" | "grupos" | "matchplay">("grupos");

  // ── Estado PJA (drive/aquapor mensais, para o Ranking PJA 2026+) ─────────
  // Carregamos separadamente para não afectar o displayList principal (tabs
  // Todos/Circuito/Santo continuam a ver apenas pull-torneios).
  const [pjaExtraTournaments, setPjaExtraTournaments] = useState<Tournament[]>([]);

  // ── Estado CLASSIFICAÇÕES ─────────────────────────────────────────────────
  // Calendário dos jogadores de referência (Nuno Palmares, Santiago Dias,
  // João Setúbal) com o campo reduzido a juniores. Ficheiro pré-construído por
  // scripts/build-classificacoes.js — carregado lazy ao abrir o tab.
  const [classifTournaments, setClassifTournaments] = useState<Tournament[]>([]);
  const [classifLoading, setClassifLoading]         = useState(false);

  // ⚠ O guard de "já está a carregar" é um ref, NÃO state: pô-lo nas deps faz
  // o efeito re-correr assim que setClassifLoading(true) aplica, e a cleanup
  // dessa primeira execução marcava alive=false antes do fetch resolver — os
  // dados chegavam e eram deitados fora (ficava preso em "A carregar…").
  const classifFetchStarted = useRef(false);
  // ── Estado Ranking Sub-12 ────────────────────────────────────────────────
  // Ficheiro pré-construído por scripts/build-sub12-ranking.js — mesma vista do
  // Ranking PJA, mas com metric="sd" (differential sem componente de handicap,
  // porque o escalão joga sobretudo 9 buracos em campos muito diferentes).
  const [sub12Tournaments, setSub12Tournaments] = useState<Tournament[]>([]);
  const [sub12Loading, setSub12Loading] = useState(false);
  const sub12FetchStarted = useRef(false);
  useEffect(() => {
    if (navMode !== "ranking-sub12" || sub12FetchStarted.current) return;
    sub12FetchStarted.current = true;
    setSub12Loading(true);
    (async () => {
      try {
        const d = await cachedFetchJson<{ tournaments?: Tournament[] }>("/data/sub12-ranking.json");
        setSub12Tournaments(d?.tournaments || []);
      } catch {
        setSub12Tournaments([]);
      } finally {
        setSub12Loading(false);
      }
    })();
  }, [navMode]);

  useEffect(() => {
    if (navMode !== "classificacoes" || classifFetchStarted.current) return;
    classifFetchStarted.current = true;
    setClassifLoading(true);
    (async () => {
      try {
        const d = await cachedFetchJson<{ tournaments?: Tournament[] }>("/data/classificacoes.json");
        setClassifTournaments(d?.tournaments || []);
      } catch {
        setClassifTournaments([]);
      } finally {
        setClassifLoading(false);
      }
    })();
  }, [navMode]);

  // Sincronização state → URL (query string). Só parâmetros com valor
  // não-default vão para o URL. replace:true evita poluir o histórico.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams);
    // year
    if (yearFilter) sp.set("year", yearFilter); else sp.delete("year");
    // manuel (default: true — só guardar "0" se desligado)
    if (!filterManuel) sp.set("manuel", "0"); else sp.delete("manuel");
    // search
    if (searchQuery.trim()) sp.set("q", searchQuery.trim()); else sp.delete("q");
    // Normaliza links antigos: `shell` já não faz nada (o CircuitShell é o
    // default das vistas de torneios), por isso remove-se do URL.
    sp.delete("shell");
    if (sp.toString() !== searchParams.toString()) {
      setSearchParams(sp, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearFilter, filterManuel, searchQuery]);

  // ── Estado Jovens ─────────────────────────────────────────────────────────
  const [jovensTournaments, setJovensTournaments] = useState<Tournament[]>([]);
  const [jovensLoading, setJovensLoading]         = useState(false);
  const [jovensLoaded, setJovensLoaded]           = useState(false);
  const [jovensGroupKey, setJovensGroupKey]        = useState<string | null>(null);
  const [jovensEscIdx, setJovensEscIdx]            = useState<number>(0);
  const [jovensShowInscricoes, setJovensShowInscricoes] = useState(startInscritos);
  // /FPG/jovens sem sub-segmento → abre na lista de torneios (a Análise foi
  // migrada para /titulos em 2026-05-04). jovensShowAnalise mantém-se no
  // código apenas para desactivar manualmente caso futuras edições queiram
  // reactivar — sempre `false` por default agora.
  const [jovensShowAnalise, setJovensShowAnalise] = useState(false);

  // ── Sync URL→seriesFilter quando o utilizador navega entre /FPG, /FPG/jovens,
  //     /FPG/sto, /FPG/clubes, /FPG/pja sem remontar a página.
  // useState só inicializa UMA vez → se o user entrou em /FPG/jovens e depois
  // clica no topo em "FPG" (→ /FPG), o seriesFilter ficaria preso em "jovens".
  // Este effect alinha o estado com a URL sempre que urlSeg muda.
  //
  // ⚠ Early-return em `/FPG/torneio/:tkey`: essa rota não tem `:filter`, logo
  // urlSeg="" — o effect interpretaria como "volta a Todos" e arrancaria o
  // utilizador da tab em que está (Jovens/Santo/PJA). Nesse caso, a selecção
  // de torneio deve ser local à tab; não é uma mudança de tab.
  useEffect(() => {
    if (params.tkey) return;  // rota /FPG/torneio/:tkey → preservar tab actual

    // Navegação por tabs (Ranking PJA / Ranking Sub-12 / Torneios)
    const targetNav = URL_TO_NAV[urlSeg] ?? "torneios";
    if (targetNav !== navMode) setNavMode(targetNav);

    // Series-filter (apenas relevante em navMode=torneios)
    const targetSeries: SeriesKey = isInscritosShortcut
      ? "jovens"
      : (URL_TO_FILTER[urlSeg] ?? "");
    if (targetSeries !== seriesFilter) {
      setSeriesFilter(targetSeries);
    }
    // Se voltou para /FPG puro (sem segmento) a partir de /FPG/jovens, limpar
    // também as views jovens-específicas que podem ter ficado activas.
    if (urlSeg === "") {
      if (jovensShowInscricoes) setJovensShowInscricoes(false);
      if (jovensShowAnalise) setJovensShowAnalise(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSeg, urlSub, isInscritosShortcut, params.tkey]);

  // ── Sources secundárias (para o painel DataSourcesChip) ─────────────────
  //   Cada secção (clubes, jovens, admissions) regista ficheiros tentados/lidos.
  //   fileMeta cobre apenas os pull-torneios; estes cobrem o resto.
  const [clubesMeta, setClubesMeta] = useState<DataSource[]>([]);
  const [jovensMeta, setJovensMeta] = useState<DataSource[]>([]);
  const [admissionsMeta, setAdmissionsMeta] = useState<DataSource[]>([]);

  const { melhorias } = useAppContext();

  const tcodePills = useMemo<Record<string, TournPill>>(() => {
    const pills: Record<string, TournPill> = {};
    for (const playerData of Object.values(melhorias)) {
      if (typeof playerData !== "object" || !playerData) continue;
      for (const entry of Object.values(playerData as Record<string, any>)) {
        if (typeof entry !== "object" || !entry || Array.isArray(entry) || !entry.pill) continue;
        // Extrair TODOS os tcodes dos links desta entrada (ex: classificacao_d1 + classificacao_d2)
        for (const v of Object.values((entry as any).links || {})) {
          const match = String(v).match(/tcode=(\d+)/);
          if (match) pills[match[1]] = (entry as any).pill as TournPill;
        }
      }
    }
    return pills;
  }, [melhorias]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        // loadPlayers() usa fetchCache — 1 único fetch por sessão mesmo que FPGPage,
        // DrivePage e App.tsx o peçam em simultâneo.
        const [pdb, linksResp, kidsLinksResp, natResp, kidsTrackedResp] = await Promise.all([
          loadPlayers().catch(() => ({} as PlayersDB)),
          fetch("/data/tournament-links.json").catch(() => null),
          fetch("/data/kids-links.json").catch(() => null),
          fetch("/data/players-nationality.json").catch(() => null),
          fetch("/data/kids-tracked-names.json").catch(() => null),
        ]);
        // Merge players-nationality.json no playersDB — para cada federado FPG
        // estrangeiro (Joe Short→GB, Peter Yao→CN, etc.) injecta `country` no
        // entry existente, para o TournPName renderizar 🇬🇧 antes do nome.
        if (natResp?.ok) {
          try {
            const nat = await natResp.json();
            const byFed: Record<string, string> = nat?.byFed || {};
            // info: { fed: {country, dob, sex, name} } — fonte de DOB para
            // os ~58K federados (activos+inactivos).
            const info: Record<string, { country?: string; dob?: string; sex?: string; name?: string }> = nat?.info || {};
            for (const fed in byFed) {
              const cc = byFed[fed];
              if (!cc) continue;
              const inf = info[fed] || {};
              const entry = (pdb as any)[fed];
              if (entry) {
                if (!entry.country) entry.country = cc;
                if (!entry.dob && inf.dob) entry.dob = inf.dob;
                if (!entry.sex && inf.sex) entry.sex = inf.sex;
              } else {
                (pdb as any)[fed] = {
                  country: cc,
                  ...(inf.dob ? { dob: inf.dob } : {}),
                  ...(inf.sex ? { sex: inf.sex } : {}),
                  ...(inf.name ? { name: inf.name } : {}),
                };
              }
            }
          } catch { /* ignore */ }
        }
        // Merge kids-links.json no playersDB — entries CURADOS para
        // jogadores internacionais sem fedCode português (Emile Cuanalo,
        // George Campbell, etc.). Mantém precedência sobre auto-derived.
        if (kidsLinksResp?.ok) {
          try {
            const kl = await kidsLinksResp.json();
            for (const entry of (kl.players || [])) {
              if (!entry.name || !entry.kidsHash) continue;
              const key = "intl:" + entry.name.toLowerCase().replace(/\s+/g, "_");
              (pdb as any)[key] = {
                name: entry.name,
                kidsHash: entry.kidsHash,
                ...(entry.country ? { country: entry.country } : {}),
                ...(entry.escalao ? { escalao: entry.escalao } : {}),
                ...(entry.sex ? { sex: entry.sex } : {}),
              };
            }
          } catch { /* ignore */ }
        }
        // Merge kids-tracked-names.json — índice fino (~150KB) com todos os
        // nomes que aparecem nalguma fonte /kids (USKids, WJGC, Doral, etc.).
        // Para cada nome aqui, cria entry virtual com kidsHash = memberId
        // (preferido — link directo via ID) ou nome encodificado (fallback).
        // Isto resolve o problema de ↗ aparecer em jogadores que NÃO estão
        // em /kids: agora só aparece quando há match REAL com a fonte.
        if (kidsTrackedResp?.ok) {
          try {
            const kt = await kidsTrackedResp.json();
            const namesMap: Record<string, string | null> = kt?.names || {};
            // Meta extra: { sex?, country? } por normName (de FFG resultats etc.)
            const metaMap: Record<string, { sex?: "M" | "F"; country?: string }> = kt?.meta || {};
            for (const normName in namesMap) {
              if (!normName) continue;
              const memberId = namesMap[normName];
              const m = metaMap[normName] || {};
              const key = "kids:" + normName.replace(/\s+/g, "_");
              if ((pdb as any)[key]) continue; // já populado por kids-links.json
              const displayName = normName.replace(/\b\w/g, c => c.toUpperCase());
              (pdb as any)[key] = {
                name: displayName,
                kidsHash: memberId || encodeURIComponent(displayName),
                ...(m.sex ? { sex: m.sex } : {}),
                ...(m.country ? { country: m.country } : {}),
              };
            }
          } catch { /* ignore */ }
        }
        if (alive) { setEscLookup(buildEscLookup(pdb)); setPlayersDB(pdb as PlayersDB); }
        let externalLinks: Record<string, Record<string, string>> = {};
        if (linksResp?.ok) {
          externalLinks = await linksResp.json().catch(() => ({}));
        }

        const allT: Tournament[] = [];
        const meta: FileMeta[] = [];

        // Paraleliza os fetches dos pull-torneios*.json em lotes de PARALLEL_BATCH.
        // Antes: loop sequencial com await (6 ficheiros → 6× latência da rede).
        // Agora: 1 único batch de até DATA_MAX fetches concorrentes, pára no
        // primeiro null consecutivo que vier (via findIndex).
        const PARALLEL_BATCH = 10;
        let stopAt = DATA_MAX;
        for (let start = 0; start < stopAt; start += PARALLEL_BATCH) {
          if (!alive) return;
          const batchEnd = Math.min(start + PARALLEL_BATCH, stopAt);
          const batch = await Promise.all(
            Array.from({ length: batchEnd - start }, (_, k) => start + k).map(async (i) => {
              const url = dataUrl(i);
              try {
                const resp = await fetch(url);
                if (!resp.ok) return { i, url, d: null as DriveData | null, parseErr: null as string | null };
                const d = await resp.json() as DriveData;
                return { i, url, d, parseErr: null };
              } catch (e) {
                return { i, url, d: null, parseErr: String(e).slice(0, 120) };
              }
            })
          );
          let consecutiveMisses = 0;
          let hitStop = false;
          for (const { i, url, d, parseErr } of batch) {
            if (!d) {
              if (parseErr) console.warn(`[FPGPage] Falhou a parsear ${url}: ${parseErr} — a continuar`);
              consecutiveMisses++;
              if (consecutiveMisses >= 2) { stopAt = i; hitStop = true; break; }
              continue;
            }
            consecutiveMisses = 0;
            const normalised = (d.tournaments || []).map(t => {
              const extLinks = externalLinks[String(t.tcode)];
              return { ...t, _sourceFile: url, _sourceIndex: i,
                players: t.players.map(normalizePlayer),
                ...(extLinks ? { links: { ...(t.links || {}), ...extLinks } } : {}) };
            });
            allT.push(...normalised);
            meta.push({ file: url, index: i, lastUpdated: d.lastUpdated, source: d.source, count: normalised.length });
          }
          if (alive) {
            setTournaments([...allT]);
            setFileMeta([...meta]);
            setLoadingMsg(`A carregar... ${meta.length} ficheiro(s) · ${allT.length} torneios`);
          }
          if (hitStop) break;
        }

        // ── Ficheiros de torneio standalone (fora da numeração pull-torneios) ──
        // Cada ficheiro traz o seu próprio ccode/tcode, por isso o deep-link
        // /FPG/torneio/{ccode}-{tcode} resolve naturalmente (sem reescrita).
        const EXTRA_TOURN_FILES: string[] = [
          // Camp. Nacional de Profissionais 2026 (ccode 912 / tcode 10225) —
          // scraped à parte porque não veio na numeração pull-torneios.
          "/data/torneio-912-10225.json",
          // X Miramar Internacional Open U25 2026 (ccode 003) — U25 (10652) +
          // Sub-10 (10653). Scraped à parte durante a prova (19-21 Ago); fundem
          // com as entradas de inscrições/draw do fpg-admissions-draws por ccode-tcode.
          "/data/torneio-003-10652.json",
          "/data/torneio-003-10653.json",
          // Paul McGinley Junior Cup 2026 (ccode 962) — U18&U16 (10082), U14
          // (10083), U12 (10084). Scraped à parte; fundem com as inscrições/draw
          // do fpg-admissions-draws por ccode-tcode.
          "/data/torneio-962-10082.json",
          "/data/torneio-962-10083.json",
          "/data/torneio-962-10084.json",
        ];
        await Promise.all(EXTRA_TOURN_FILES.map(async (url) => {
          try {
            const resp = await fetch(url);
            if (!resp.ok) return;
            const d = await resp.json() as DriveData;
            const normalised = (d.tournaments || []).map(t => {
              const extLinks = externalLinks[String(t.tcode)];
              return { ...t,
                _sourceFile: url, _sourceIndex: -1,
                players: t.players.map(normalizePlayer),
                ...(extLinks ? { links: { ...(t.links || {}), ...extLinks } } : {}) };
            });
            allT.push(...normalised);
            meta.push({ file: url, index: -1, lastUpdated: d.lastUpdated, source: d.source, count: normalised.length });
          } catch (e) {
            console.warn(`[FPGPage] Falhou a carregar ${url}: ${String(e).slice(0, 120)}`);
          }
        }));
        if (alive) { setTournaments([...allT]); setFileMeta([...meta]); }

        if (alive) {
          if (allT.length === 0) {
            setError(`Ficheiro não encontrado: ${dataUrl(0)}`);
          }

          // Carregar os ficheiros de Clubes em paralelo com o loader principal
          const CLUBES_FILES_MAIN: { url: string; year: string; escFallback: string | null }[] = [
            { url: "/data/clubes_sub_14&18_2026.json", year: "2026", escFallback: null },
            { url: "/data/clubes_sub_14&18_2025.json", year: "2025", escFallback: null },
            { url: "/data/clubes_sub_14&18_2024.json", year: "2024", escFallback: null },
            // Clubes não-juvenis (ex: Nacional de Clubes Mid-Amateur, Regional
            // de Clubes Absoluto) — escFallback "midam"; a vista Grupos auto-constrói
            // as equipas por clube. Garantir "midam" mesmo que o JSON não traga
            // `escalao` (ex: gerado por scrape-classif-node).
            { url: "/data/CLUBES2026.json", year: "2026", escFallback: "midam" },
            { url: "/data/CLUBES2024.json", year: "2024", escFallback: "midam" },
          ];
          const resolveEscKeyMain = (escalao: string | null | undefined, fallback: string | null): string => {
            if (escalao && /14/i.test(escalao)) return "sub14";
            if (escalao && /18/i.test(escalao)) return "sub18";
            if (escalao && /mid|amateur|absolut|s[eé]nior/i.test(escalao)) return "midam";
            return fallback ?? "sub14";
          };
          const clubesMetaLocal: DataSource[] = [];
          const clubesResults = await Promise.all(CLUBES_FILES_MAIN.map(async ({ url, year, escFallback }) => {
            try {
              // cache:"no-store" — os ficheiros CLUBES{ano}.json são scrapados/
              // actualizados com frequência (draws, novos torneios). Sem isto, o
              // browser servia a versão antiga em cache e os draws não apareciam.
              const r = await fetch(url, { cache: "no-store" });
              if (!r.ok) {
                clubesMetaLocal.push({ path: url, status: "error", error: `HTTP ${r.status}`, group: "clubes" });
                return [];
              }
              const d: DriveData = await r.json();
              const rows = (d.tournaments || []).map(t => ({
                ...t,
                series: "clubes" as const,
                _clubesEsc: resolveEscKeyMain((t as any).escalao, escFallback),
                _clubesYear: year,
                _sourceFile: url,
                players: t.players.map(normalizePlayer),
              }));
              clubesMetaLocal.push({ path: url, status: "loaded", count: rows.length, source: d.source, lastUpdated: d.lastUpdated, group: "clubes" });
              return rows;
            } catch (e) {
              clubesMetaLocal.push({ path: url, status: "error", error: String(e), group: "clubes" });
              return [];
            }
          }));
          if (alive) setClubesMeta(clubesMetaLocal);
          const clubesFlat = clubesResults.flat();
          // Deduplicar por tcode
          const seen = new Map<string, Tournament>();
          for (const t of clubesFlat) seen.set(String(t.tcode), t as Tournament);
          if (alive) {
            const uniqueClubes = [...seen.values()];
            // Carregar admissions+draws UMA vez e enriquecer TODOS os torneios
            // (pull-torneios + clubes) para aparecerem com draws/pairings nos
            // tabs STO, PJA, Clubes e Todos. Os tabs Jovens e Clubes detalhe
            // fazem o mesmo enrichment nos seus loaders próprios.
            const admFile = await loadFpgAdmissionsDraws().catch(() => null);
            const admIdx = admFile ? indexFpgAdmissionsDraws(admFile) : new Map<string, FpgTournamentData>();
            const hasKeys = (o: any) => o && typeof o === "object" && Object.keys(o).length > 0;
            const enrich = (t: Tournament): Tournament => {
              const ad = admIdx.get(`${t.ccode}-${t.tcode}`);
              // DRAWS: preferir os embebidos no CLUBES{ano}.json (scrapados por
              // scripts/scrape-clube-draws.js, completos), senão os do
              // fpg-admissions-draws.json. ⚠ Este ficheiro pode ter o torneio com
              // `draws: {}` vazio (só admissions) — nesse caso NÃO sobrepor os
              // embebidos (era este o bug do regional 2024).
              if (hasKeys((t as any).draws)) (t as any)._draws = (t as any).draws;
              else if (hasKeys(ad?.draws)) (t as any)._draws = ad!.draws;
              // ADMISSIONS: preferir as do FPG (mais completas), senão embebidas.
              (t as any)._admissions = ad?.admissions ?? (t as any).admissions;
              return t;
            };
            const enrichedAllT = allT.map(enrich);
            const enrichedClubes = uniqueClubes.map(enrich);
            // Só agora (depois de enriquecidos com _draws/_admissions) é que se
            // publica o estado dos clubes — evita renderizar primeiro sem draws.
            setClubesTournaments(enrichedClubes);
            setClubesLoaded(true);
            setTournaments([...enrichedAllT, ...enrichedClubes]);
          }

          setLoading(false);
        }
      } catch {
        // erro inesperado — não mostrar stack trace técnico
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, []);

  // ── Loader PJA (Drive Tour + Aquapor mensais, para Ranking PJA 2026+) ────
  // Estes torneios NÃO entram em tournaments/displayList (para não poluir as
  // outras tabs). São carregados num state separado e combinados só quando
  // construímos `pjaRankingList`. Activado apenas quando a tab Ranking PJA
  // está activa.
  useEffect(() => {
    // Carregar drive-data/aquapor SEMPRE (não só no tab Ranking PJA) — assim
    // deep-links em nova aba para `/FPG/torneio/{ccode}-{tcode}` de um Drive
    // Tour ou Aquapor conseguem encontrar o torneio no displayList em vez de
    // cair no default (primeiro torneio).
    if (pjaExtraTournaments.length > 0) return;  // já carregado
    let alive = true;
    // Monta lista de URLs a tentar (todos os meses desde startYear até agora),
    // faz fetch em PARALELO com Promise.all. Cada fetch individual falha
    // silenciosamente (muitos meses podem não existir). Isto é 10-30× mais
    // rápido que o loop sequencial com await.
    const loadMonthly = async (prefix: string, startYear: number): Promise<Tournament[]> => {
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth() + 1;
      const urls: string[] = [];
      for (let y = startYear; y <= curYear; y++) {
        const endMonth = (y === curYear) ? curMonth : 12;
        for (let m = 1; m <= endMonth; m++) {
          urls.push(`/data/${prefix}-${y}-${String(m).padStart(2, "0")}.json`);
        }
      }
      const results = await Promise.all(urls.map(async (url) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return [];
          const ct = r.headers.get("content-type") || "";
          if (!ct.includes("json")) return [];
          const d = await r.json();
          return (d.tournaments || []).map((t: any) => ({
            ...t, _sourceFile: url,
            players: (t.players || []).map(normalizePlayer),
          })) as Tournament[];
        } catch { return []; }
      }));
      if (!alive) return [];
      return results.flat();
    };
    const loadPjaMembers = async (): Promise<Record<string, string[]>> => {
      try {
        const r = await fetch("/data/pja-members.json");
        if (!r.ok) return {};
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("json")) return {};
        const d = await r.json();
        const out: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(d)) {
          if (k.startsWith("_")) continue;
          if (Array.isArray(v)) out[k] = v.map(String);
        }
        return out;
      } catch { return {}; }
    };
    const loadPdfSnapshot = async (): Promise<Record<string, any[]>> => {
      try {
        const r = await fetch("/data/pja-pdf-snapshot.json");
        if (!r.ok) return {};
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("json")) return {};
        const d = await r.json();
        const out: Record<string, any[]> = {};
        for (const [k, v] of Object.entries(d)) {
          if (k.startsWith("_")) continue;
          if (Array.isArray(v)) out[k] = v as any[];
        }
        return out;
      } catch { return {}; }
    };
    Promise.all([
      loadMonthly("drive-data", 2026),
      loadMonthly("aquapor-data", 2026),
      loadPjaMembers(),
      loadPdfSnapshot(),
    ]).then(([drive, aq, members, pdfSnap]) => {
      if (!alive) return;
      // NÃO chamar buildDisplayList aqui — drive-data é single-round por design,
      // aquapor já vem como entrada única multi-round. buildDisplayList só
      // agruparia se houvesse padrões "Dia 1/Dia 2" no nome (não é o caso).
      // Torneios manuais (PJA exclusivos, Santo da Serra juniores) são agora
      // lidos no loader principal via pull-torneios003.json — incluídos em
      // `tournaments` e `displayList` naturalmente, aparecendo em todas as tabs
      // (Torneios, Ranking PJA, Draw) tal como o Nacional sintético.
      setPjaExtraTournaments([...drive, ...aq]);
      setPjaMembers(members);
      setPjaPdfSnapshot(pdfSnap);
    });
    return () => { alive = false; };
  }, [navMode, pjaExtraTournaments.length]);

  // ── Loader Clubes (D1 — só quando activado, para dados parciais de 2026) ────
  useEffect(() => {
    if (!(navMode === "torneios" && (seriesFilter === "clubes" || seriesFilter === "")) || clubesLoaded) return;
    let alive = true;
    setClubesLoading(true);

    // Ficheiros combinados (sub14 + sub18 no mesmo JSON) — escalão lido de t.escalao
    // Ficheiros D1 têm só um escalão (determinado pelo nome)
    const CLUBES_FILES: { url: string; escFallback: string | null; year: string }[] = [
      { url: "/data/clubes_sub_14_D1.json",    escFallback: "sub14", year: "2026" },
      { url: "/data/clubes_sub_18_D1.json",    escFallback: "sub18", year: "2026" },
      { url: "/data/clubes_sub_14&18_2026.json", escFallback: null,  year: "2026" },
      { url: "/data/clubes_sub_14&18_2025.json", escFallback: null,  year: "2025" },
      { url: "/data/clubes_sub_14&18_2024.json", escFallback: null,  year: "2024" },
      // Clubes não-juvenis (ex: Nacional de Clubes Mid-Amateur, Regional de
      // Clubes Absoluto) — escFallback "midam"; a vista Grupos auto-constrói
      // as equipas por clube.
      { url: "/data/CLUBES2026.json", escFallback: "midam", year: "2026" },
      { url: "/data/CLUBES2024.json", escFallback: "midam", year: "2024" },
    ];

    function resolveEscKey(escalao: string | undefined | null, fallback: string | null): string {
      if (escalao && /14/i.test(escalao)) return "sub14";
      if (escalao && /18/i.test(escalao)) return "sub18";
      if (escalao && /mid|amateur|absolut|s[eé]nior/i.test(escalao)) return "midam";
      return fallback ?? "sub14";
    }

    // Carregar também admissions+draws em paralelo para enriquecer torneios
    // Clubes (permite mostrar pairings/tee times na UI). Alinhado com loader
    // Jovens que já faz isto.
    Promise.all([
      ...CLUBES_FILES.map(async ({ url, escFallback, year }) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return [];
          const d: DriveData = await r.json();
          return (d.tournaments || []).map(t => ({
            ...t,
            _clubesEsc: resolveEscKey((t as any).escalao, escFallback),
            _clubesYear: year,
            _sourceFile: url,
            players: t.players.map(normalizePlayer),
          }));
        } catch { return []; }
      }),
      loadFpgAdmissionsDraws().catch(() => null),
    ]).then(all => {
      if (!alive) return;
      const admDrawsFile = all[all.length - 1] as Awaited<ReturnType<typeof loadFpgAdmissionsDraws>> | null;
      const admDrawsIdx = admDrawsFile ? indexFpgAdmissionsDraws(admDrawsFile) : new Map<string, FpgTournamentData>();
      const results = all.slice(0, -1) as any[];
      // Deduplicar por tcode — se o ficheiro D1 e o combined 2026 tiverem o mesmo torneio, fica o combined
      const seen = new Map<string, Tournament>();
      for (const t of results.flat()) {
        const key = (t as any).tcode;
        const existing = seen.get(key);
        // Preferir o combined (escFallback null) sobre D1 (escFallback não null)
        if (!existing || (existing as any)._sourceFile?.includes("D1")) {
          // Enriquecer com admissions/draws do fpg-admissions-draws.json se houver match
          const idxKey = `${t.ccode}-${(t as any).tcode}`;
          const ad = admDrawsIdx.get(idxKey);
          const hasKeys = (o: any) => o && typeof o === "object" && Object.keys(o).length > 0;
          // DRAWS: preferir embebidos no CLUBES{ano}.json; senão os do
          // fpg-admissions-draws.json (que pode ter `draws: {}` vazio).
          if (hasKeys((t as any).draws)) (t as any)._draws = (t as any).draws;
          else if (hasKeys(ad?.draws)) (t as any)._draws = ad!.draws;
          (t as any)._admissions = ad?.admissions ?? (t as any).admissions;
          seen.set(key, t as Tournament);
        }
      }
      setClubesTournaments([...seen.values()] as Tournament[]);
      setClubesLoaded(true);
      setClubesLoading(false);
    });
    return () => { alive = false; };
  }, [navMode, seriesFilter, clubesLoaded]);

  // ── Loader Jovens (arranca automaticamente no mount, para aparecerem em "Todos") ──
  useEffect(() => {
    if (jovensLoaded) return;
    let alive = true;
    setJovensLoading(true);
    const JOVENS_FILES = [
      { url: "/data/jovens_2026.json", year: "2026" },
      { url: "/data/jovens_2025.json", year: "2025" },
      { url: "/data/jovens_2024.json", year: "2024" },
      { url: "/data/jovens_2023.json", year: "2023" },
      { url: "/data/jovens_2022.json", year: "2022" },
      { url: "/data/jovens_2020.json", year: "2020" },
      { url: "/data/jovens_2019.json", year: "2019" },
    ];
    // Histórico dos Campeonatos Nacionais Jovens (2005-2026, 206 torneios) —
    // o mesmo ficheiro que alimenta a TitulosPage e a NacionaisJovensPage.
    // Carregado aqui para que os Nacionais históricos apareçam na sidebar
    // de /FPG/jovens (anos pré-2019 não estão em jovens_YYYY.json).
    // Tcodes que coincidam com jovens_YYYY perdem para a entrada existente
    // (dedup por ccode/tcode no loop "seen" abaixo).
    const HISTORICO_URL = "/data/fpg-nacionais-historico.json";
    const jovensMetaLocal: DataSource[] = [];
    Promise.all([
      ...JOVENS_FILES.map(async ({ url, year }) => {
        try {
          const r = await fetch(url);
          if (!r.ok) {
            jovensMetaLocal.push({ path: url, status: "error", error: `HTTP ${r.status}`, group: "jovens" });
            return [];
          }
          const d: DriveData = await r.json();
          const rows = (d.tournaments || []).map(t => ({
            ...t, _jovensYear: year, _sourceFile: url,
            players: t.players.map(normalizePlayer),
          }));
          jovensMetaLocal.push({ path: url, status: "loaded", count: rows.length, source: d.source, lastUpdated: d.lastUpdated, group: "jovens" });
          return rows;
        } catch (e) {
          jovensMetaLocal.push({ path: url, status: "error", error: String(e), group: "jovens" });
          return [];
        }
      }),
      // Carrega o ficheiro histórico dos Nacionais Jovens — mesma forma que os
      // jovens_YYYY mas cobre 2005-2026 (incluindo Drive Tour Finals e Sub-10/12
      // 2025 Santo Estevão ccode=988). Filtra "de Clubes" (têm tab própria).
      (async () => {
        try {
          const r = await fetch(HISTORICO_URL);
          if (!r.ok) {
            jovensMetaLocal.push({ path: HISTORICO_URL, status: "error", error: `HTTP ${r.status}`, group: "jovens" });
            return [];
          }
          const d: any = await r.json();
          const rows = ((d.tournaments || []) as any[])
            .filter((t: any) => !/de\s+clubes/i.test(t.name || ""))
            .map((t: any) => ({
              ...t,
              _jovensYear: (t.date || "").substring(0, 4),
              _sourceFile: HISTORICO_URL,
              players: (t.players || []).map(normalizePlayer),
              // Quando o historico contém admissions/draws (consolidação 2026-05-05
              // do Nacional Jovens 2026), promove-os para _admissions/_draws para
              // o detalhe do torneio mostrar tabs de Inscrições/Pairings.
              ...(t.admissions ? { _admissions: t.admissions } : {}),
              ...(t.draws ? { _draws: t.draws } : {}),
            }));
          jovensMetaLocal.push({ path: HISTORICO_URL, status: "loaded", count: rows.length, source: d.source, lastUpdated: d.lastUpdated, group: "jovens" });
          return rows;
        } catch (e) {
          jovensMetaLocal.push({ path: HISTORICO_URL, status: "error", error: String(e), group: "jovens" });
          return [];
        }
      })(),
      // Carrega também admissions + draws (107 torneios) para enriquecer existentes
      // e injectar sinteticamente os 10 Nacional 2026 (que ainda não estão em jovens_2026).
      loadFpgAdmissionsDraws().catch(() => null),
    ]).then(all => {
      if (!alive) return;
      const admLoaded = all[all.length - 1];
      setAdmissionsMeta([{
        path: "/data/fpg-admissions-draws.json",
        status: admLoaded ? "loaded" : "error",
        count: admLoaded ? ((admLoaded as any).tournaments?.length || 0) : undefined,
        source: (admLoaded as any)?.source,
        lastUpdated: (admLoaded as any)?.scrapedAt,
        group: "admissions",
      }]);
      setJovensMeta(jovensMetaLocal);
      const admDrawsFile = all[all.length - 1] as Awaited<ReturnType<typeof loadFpgAdmissionsDraws>> | null;
      const admDrawsIdx = admDrawsFile ? indexFpgAdmissionsDraws(admDrawsFile) : new Map<string, FpgTournamentData>();
      const tournaments = (all.slice(0, -1) as any[]).flat() as Tournament[];

      const seen = new Map<string, Tournament>();
      // 1) Torneios existentes — dedup + enriquecer com admissions/draws quando houver match
      for (const t of tournaments) {
        const key = t.ccode + "/" + String((t as any).tcode);
        if (seen.has(key)) continue;
        const idxKey = `${t.ccode}-${(t as any).tcode}`;
        const ad = admDrawsIdx.get(idxKey);
        if (ad) {
          (t as any)._admissions = ad.admissions;
          (t as any)._draws = ad.draws;
        }
        seen.set(key, t);
      }
      // 2) Injectar torneios em destaque (FEATURED_TOURNAMENTS — template genérico
      //    para torneios futuros: Nacional 2026 Aroeira, Amendoeira 2026, …) como
      //    torneios sintéticos se não existirem já em pull-torneios/jovens_YYYY.json.
      //    Só injecta quando há dados scraped no fpg-admissions-draws.json — sem
      //    scrape, a entrada da config fica dormente. Nome/data/campo/escalão vêm
      //    do scrape salvo override na config (ver src/data/featuredTournaments.ts).
      //    Entradas de séries Drive (tour/challenge/aquapor) são da DrivePage.
      for (const ft of FEATURED_TOURNAMENTS) {
        if ((ft.series ?? "jovens") !== "jovens") continue;  // Drive → DrivePage
        const key = ft.ccode + "/" + ft.tcode;
        if (seen.has(key)) continue;
        const ad = admDrawsIdx.get(`${ft.ccode}-${ft.tcode}`);
        if (!ad) continue;  // sem dados scraped, não injecta
        const date = ft.date || ad.date || "";
        const synthetic = {
          ...buildFeaturedSynthetic(ft, ad),
          _jovensYear: date.substring(0, 4) || String(new Date().getFullYear()),
        } as unknown as Tournament;
        seen.set(key, synthetic);
      }
      // 3) Injectar outros torneios jovens com apenas admissions (sem resultados ainda em
      //    pull-torneios) — detectados pelo nome na fpg-admissions-draws.json.
      //    Permite que torneios Junior/Sub-N de qualquer clube (ex: ccode=004) apareçam
      //    em /FPG/jovens logo que tenham inscrições scrapadas, sem precisar de pull-torneios.
      {
        const ADM_JOVEM_RE = /\b(juniors?|júniors?|juvenil|juvenis|sub[\s\-_]?\d{1,2}|u\d{1,2}|jovens?)\b/i;
        const stripDia = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
        // (inferEscalao / stripEscalaoSuffix importados de featuredTournaments.ts,
        //  partilhados com a injecção (2) e com a DrivePage)
        for (const [, ad] of admDrawsIdx) {
          const tournKey = `${ad.ccode}/${ad.tcode}`;
          if (seen.has(tournKey)) continue;
          const playerCount = ad.admissions?.totalInscritos ?? (ad.admissions?.players?.length ?? 0);
          if (playerCount === 0) continue;
          if (!ADM_JOVEM_RE.test(stripDia(ad.name || ""))) continue;
          const year = ad.date?.substring(0, 4) || String(new Date().getFullYear());
          const baseName = stripEscalaoSuffix(ad.name || "") || `Torneio ${ad.tcode}`;
          seen.set(tournKey, {
            name: baseName,
            ccode: ad.ccode,
            tcode: String(ad.tcode),
            date: ad.date || "",
            campo: ad.campo || null,
            clube: ad.ccode,
            circuit: "tour",
            series: "jovens",
            region: null,
            escalao: inferEscalao(ad.name || ""),
            num: 1,
            rounds: (ad.admissions as any)?.rounds ?? 1,
            playerCount,
            players: [],
            _jovensYear: year,
            _sourceFile: "fpg-admissions-draws.json",
            _admissions: ad.admissions,
            _draws: ad.draws,
          } as unknown as Tournament);
        }
      }
      setJovensTournaments([...seen.values()] as Tournament[]);
      setJovensLoaded(true);
      setJovensLoading(false);
    });
    return () => { alive = false; };
  }, [jovensLoaded]);

  // Match do filtro de pesquisa por nome/campo/clube (normalizado, case+accent insensitive)
  // Declarado ANTES dos useMemo que o consomem (ordem importante no JS — temporal dead zone).
  const searchTerm = searchQuery.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const matchesSearch = (t: Tournament): boolean => {
    if (!searchTerm) return true;
    const fields = [t.name, t.campo, (t as any).clube, t.tcode, t.ccode]
      .map(v => String(v ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, ""));
    return fields.some(f => f.includes(searchTerm));
  };

  // Lista filtrada por escalão dentro de Clubes, agrupada por ano
  const clubesList = useMemo(
    () => clubesTournaments
      .filter(t => !filterManuel || t.players.some(p => isManuel(p)) || (() => {
        const mp = (t as any).matchPlayResults as MatchPlayData | undefined;
        if (!mp) return false;
        return mp.categories.some(cat => cat.dias.some(dia =>
          (dia.matches ?? []).some(m => Object.values(m.players ?? {}).some(
            (p: any) => p.fed === "52884" || isManuel({ name: p.name ?? "" } as any)
          ))
        ));
      })())
      .filter(t => yearMatchesFilter((t as any)._clubesYear ?? t.date?.substring(0, 4), yearFilter))
      .filter(t => matchesSearch(t))
      .sort((a, b) => {
        const yCmp = ((b as any)._clubesYear ?? "").localeCompare((a as any)._clubesYear ?? "");
        if (yCmp !== 0) return yCmp;
        return ((a as any)._clubesEsc ?? "").localeCompare((b as any)._clubesEsc ?? "");
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clubesTournaments, filterManuel, yearFilter, searchTerm]
  );
  const clubesByYear = useMemo(() => {
    const m: Record<string, Tournament[]> = {};
    for (const t of clubesList) {
      const yr = (t as any)._clubesYear ?? t.date?.substring(0, 4) ?? "?";
      if (!m[yr]) m[yr] = [];
      m[yr].push(t);
    }
    return m;
  }, [clubesList]);
  const clubesYears = useMemo(() => Object.keys(clubesByYear).sort().reverse(), [clubesByYear]);
  const curClubes = clubesList[clubesSelected] ?? null;
  const curClubesYear: string = (curClubes as any)?._clubesYear ?? curClubes?.date?.substring(0, 4) ?? "";

  // Deep-link de Clubes: URL `?ct=ccode-tcode` → selecciona o torneio. Corre no
  // arranque (quando a lista carrega) e em navegação back/forward. `clubesSelected`
  // de propósito FORA das deps para não competir com os cliques na sidebar.
  useEffect(() => {
    if (seriesFilter !== "clubes" || !clubesLoaded) return;
    const ct = searchParams.get("ct");
    if (!ct) return;
    const idx = clubesList.findIndex(t => `${t.ccode}-${t.tcode}` === ct);
    if (idx >= 0) setClubesSelected(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesFilter, clubesLoaded, clubesList, searchParams]);

  const jovensGroups = useMemo(() => {
    // Input do tab JOVENS:
    //   1. jovensTournaments — Nacionais Jovens + sintéticos 2026 Aroeira
    //   2. Torneios com "Junior" no nome de outras fontes (Vila Sol Junior,
    //      GJG Junior Classics, ESTORIL Junior Open, Academia Junior, etc.) —
    //      têm pill JUNIOR na sidebar e faz sentido também aparecerem aqui
    //      já que são competições juvenis, mesmo que de clubes não-FPG.
    //      PJA e Greatgolf já têm os seus tabs próprios — excluídos por
    //      terem pill PJA em vez de pill JUNIOR genérica.
    //
    //   Dedup robusto via Map (primeira ocorrência ganha) — garante que mesmo
    //   se `tournaments` ou `jovensTournaments` contiverem entradas duplicadas,
    //   só aparece uma por (ccode/tcode) na sidebar e nos tabs de escalão.
    const dedupMap = new Map<string, Tournament>();
    const keyOf = (t: Tournament) => (t.ccode || "") + "/" + String(t.tcode || "");
    // Um torneio FEATURED já jogado cujos resultados vivem em pull-torneios
    // (ex: Amendoeira World Kids 2026) entra em `jovensTournaments` como
    // sintético (players:[], só inscrições/draws) E em `tournaments` com os
    // resultados reais. Sem preferir o que tem resultados, o tab Jovens mostrava
    // a ficha vazia. `hasResults` distingue os dois.
    const hasResults = (t: Tournament) =>
      (t.players || []).some(p => (p.roundScores?.length ?? 0) > 0 || p.grossTotal != null);
    // Nº de rondas com scorecard — entre duas versões REAIS do mesmo torneio
    // (ex: pull-torneios002 com 2 rondas vs ...006 com 3), ganha a mais completa.
    const roundCount = (t: Tournament) =>
      Math.max(0, ...(t.players || []).map(p => p.roundScores?.length ?? 0));
    for (const j of jovensTournaments) {
      const k = keyOf(j);
      if (!dedupMap.has(k)) dedupMap.set(k, j);
    }
    // Regex de detecção de torneios juvenis pelo nome:
    //  - "junior" / "juniors"  (Junior Open, GJG Portuguese Juniors)
    //  - "júnior" (Taça Yeatman Júnior — strip de diacríticos antes do test)
    //  - "subN"   (sub10, sub-14, sub 14, ...)
    //  - "UN"     (U10, U12, U14, U16, U18, U21 — categorias internacionais)
    //  - "escola"/"estagio"/"academia" (contexto juvenil: Escola de Golfe,
    //    Estágio Verão, Academia Junior)
    const JOVEM_NAME_RE = /\b(juniors?|júniors?|juvenil|juvenis|jovens?|sub[\s-]?\d{1,2}|u\d{1,2}|escola|estagio|academia)\b/i;
    const stripAcc = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const t of tournaments) {
      const cleanName = stripAcc(t.name || "");
      // "kids" pode vir colado ao nome do clube ("CityKids") — teste à parte.
      if (!JOVEM_NAME_RE.test(cleanName) && !/kids/i.test(cleanName)) continue;
      // Falsos positivos de "academia": "Academia Militar" não é juvenil.
      if (/academia\s+militar/i.test(cleanName)) continue;
      if (/PJA/i.test(t.name || "")) continue;                // já em tab PJA
      if (/greatgolf.*junior/i.test(t.name || "")) continue;  // já em tab PJA (excepção)
      const k = keyOf(t);
      const existing = dedupMap.get(k);
      if (!existing) { dedupMap.set(k, t); continue; }
      // Resultados reais (pull-torneios) suplantam o sintético admissions-only;
      // e entre duas versões reais, ganha a MAIS COMPLETA (mais rondas). Em ambos
      // os casos herda as inscrições/draws/links que só o sintético/versão antiga traz.
      if ((hasResults(t) && !hasResults(existing)) || roundCount(t) > roundCount(existing)) {
        dedupMap.set(k, {
          ...t,
          _admissions: (existing as any)._admissions ?? (t as any)._admissions,
          _draws: (existing as any)._draws ?? (t as any)._draws,
          extraLinks: (existing as any).extraLinks ?? (t as any).extraLinks,
        } as Tournament);
      }
    }
    const combined = [...dedupMap.values()];

    // Para torneios pré-jogo o Manuel só aparece em _admissions.players ou
    // _draws.*.groups.*.players. `tournamentHasManuel` cobre todos os sítios.
    const filtered = combined
      // Drive/Aquapor têm a sua própria página /drive — fora da /FPG (incl. jovens).
      .filter(t => !isDriveOrAquapor(t))
      // Clubes match-play vivem em /FPG/clubes (não na lista strokeplay).
      .filter(t => !CLUBES_TEAM_FORMAT[`${t.ccode}-${t.tcode}`]?.matchPlay)
      .filter(t => !filterManuel || tournamentHasManuel(t))
      .filter(t => yearMatchesFilter((t as any)._jovensYear ?? t.date?.substring(0, 4), yearFilter))
      .filter(t => matchesSearch(t));
    return buildJovensGroups(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jovensTournaments, tournaments, filterManuel, yearFilter, searchTerm]);

  const jovensByYear = useMemo(() => {
    const m: Record<string, JovensGroup[]> = {};
    for (const g of jovensGroups) {
      if (!m[g.year]) m[g.year] = [];
      m[g.year].push(g);
    }
    return m;
  }, [jovensGroups]);
  const jovensYears = useMemo(() => Object.keys(jovensByYear).sort().reverse(), [jovensByYear]);
  // Quando jovensGroupKey é null (estado inicial em /FPG/jovens, sem deep-link)
  // NÃO fazer fallback para jovensGroups[0]. Senão o auto-select escolhe sempre
  // o grupo mais futuro (Nacional 2026-05-01 > Regional 2026-04-17), faz
  // state→URL navegar para essa URL, e o utilizador é "atirado" para o Nacional
  // ao abrir Jovens. Com null, render mostra "Selecciona um torneio" e a URL
  // fica /FPG/jovens limpa até o utilizador escolher.
  const curJovensGroup = jovensGroupKey
    ? (jovensGroups.find(g => g.key === jovensGroupKey) ?? null)
    : null;
  const curJovens = curJovensGroup?.entries[jovensEscIdx] ?? curJovensGroup?.entries[0] ?? null;

  // Anti-loop: quando URL→state ou escIdx-sync aplicam actualizações de estado,
  // levantam este flag para que o state→URL a seguir SALTE uma navegação. Sem
  // isto o state→URL pode disparar com estado "stale" (old groupKey/escIdx)
  // enquanto URL→state ainda está a sincronizar, e navegar para URL errada,
  // criando ping-pong entre dois torneios. Ver logs do 2026-04-19.
  const skipNextStateUrlRef = useRef(false);

  /** Lista unificada que alimenta o tab "Todos":
   *  - tournaments (pull-torneios + clubes merged no loader principal)
   *  - jovensTournaments (jovens_YYYY.json + Nacional 2026 sintético) — dedup por ccode/tcode
   *  Clubes (seriesFilter === "clubes") mantém sidebar própria, mas também fazem parte de `tournaments`.
   *
   *  ⚠ Dedup robusto: usa Map para garantir UMA entrada por (ccode/tcode), eliminando
   *  duplicações que possam existir DENTRO de `tournaments` (ex: o mesmo torneio em
   *  dois pull-torneios*.json) ou entre `tournaments` e `jovensTournaments`.
   *  Sem isto, o Campeonato Nacional aparecia com cada escalão duplicado quando o
   *  mesmo torneio existia em pull-torneios006.json E em jovens_2026.json (via
   *  algum re-merge defeituoso, ou se o mesmo ficheiro fosse carregado duas vezes).
   *  Política: primeira ocorrência ganha; jovens só entra se ccode/tcode novo. */
  const displayList = useMemo(() => {
    const dedupMap = new Map<string, Tournament>();
    const keyOf = (t: Tournament) => (t.ccode || "?") + "/" + String(t.tcode ?? "?");
    // Nº de rondas com scorecard de um torneio — para escolher a versão MAIS
    // COMPLETA quando o mesmo (ccode/tcode) existe em 2 ficheiros pull-torneios.
    // ⚠ Aconteceu com o Amendoeira World Kids 2026: um scrape parcial (2 rondas)
    // ficou em pull-torneios002.json e os finais (3 rondas) em ...006.json; como
    // o 002 carrega primeiro, a versão de 2 rondas ganhava e a R3 saía vazia.
    const roundCount = (t: Tournament) =>
      Math.max(0, ...(t.players || []).map(p => p.roundScores?.length ?? 0));
    for (const t of tournaments) {
      const k = keyOf(t);
      const ex = dedupMap.get(k);
      if (!ex || roundCount(t) > roundCount(ex)) dedupMap.set(k, t);
    }
    for (const j of jovensTournaments) {
      const k = keyOf(j);
      const ex = dedupMap.get(k);
      if (!ex) { dedupMap.set(k, j); continue; }
      // O torneio já veio com resultados (pull-torneios/EXTRA_TOURN_FILES) mas o
      // synthetic jovem traz as inscrições/draw do fpg-admissions-draws — enxertá-las
      // na versão com resultados para não perder as tabs Inscrições/Draw (caso do
      // Miramar U25/Sub-10 2026, cujos resultados foram scraped à parte durante a prova).
      // `extraLinks` (página do clube, regulamento) vem da config FEATURED e só
      // existe no synthetic: sem o enxerto, os links do clube DESAPARECIAM do
      // cabeçalho assim que os primeiros resultados eram scraped.
      if ((!(ex as any)._admissions && (j as any)._admissions)
          || (!(ex as any)._draws && (j as any)._draws)
          || (!(ex as any).extraLinks?.length && (j as any).extraLinks?.length)) {
        dedupMap.set(k, {
          ...ex,
          _admissions: (ex as any)._admissions ?? (j as any)._admissions,
          _draws: (ex as any)._draws ?? (j as any)._draws,
          extraLinks: (ex as any).extraLinks?.length ? (ex as any).extraLinks : (j as any).extraLinks,
        } as Tournament);
      }
    }
    // Drive Tour + Aquapor NÃO entram aqui — esses torneios estão na DrivePage
    // e os deep-links usam /drive/torneio/{ccode}-{tcode} (não /FPG/torneio/...).
    // pjaExtraTournaments só é usado internamente pelo Ranking PJA.
    // Esconder drives sem Manuel: chegam aqui via admissions (fpg-admissions-draws)
    // mesmo depois de limpos do pull. Vivem na página /drive; os do Manuel ficam.
    const values = [...dedupMap.values()].filter(t => !isHiddenNonManuelDrive(t));
    return buildDisplayList(values);
  }, [tournaments, jovensTournaments]);
  const cur = displayList[selected];

  // ── Deep-link: sync URL (:tkey) → estado ────────────────────────────────
  // Ao carregar com `/FPG/torneio/{ccode}-{tcode}` (ou ao navegar para uma URL
  // desse formato), procurar o torneio em displayList E em jovensTournaments
  // e fazer DUAS actualizações em paralelo:
  //   - se estiver em displayList → setSelected (alimenta `cur` para vistas
  //     "Todos"/"Circuito"/"Santo")
  //   - se estiver em jovensTournaments → setSeriesFilter("jovens") +
  //     setJovensGroupKey (alimenta `curJovens` para a vista "Jovens")
  //
  // ⚠ Bug anterior: fazia early-return depois do setSelected, deixando
  // jovensGroupKey por sincronizar. Como displayList contém os torneios de
  // jovens (fundidos no `displayList` useMemo), o early-return triggava SEMPRE
  // para deep-links de jovens, e o jovensGroupKey ficava preso ao default
  // (null → fallback para jovensGroups[0] → Nacional 2026-05-01) mesmo com a
  // URL a apontar para outro torneio (ex: Regional 007-11010). O state→URL
  // depois reverteia a URL para o do default, criando o "loop" Nacional↔Regional.
  useEffect(() => {
    if (!urlTkey || displayList.length === 0) return;
    const parsed = parseTournKey(urlTkey);
    if (!parsed) return;
    const { ccode, tcode } = parsed;
    const matchesT = (t: Tournament) =>
      t.ccode === ccode && (
        t.tcode === tcode ||
        // Torneios sintéticos (multi-dia) guardam tcode como "10935+10936" — match contém
        (t.tcode || "").split("+").includes(tcode)
      );
    const idx = displayList.findIndex(matchesT);
    if (import.meta.env.DEV) console.log("[URL→state]", { urlTkey, idx, selected, seriesFilter, jovensGroupKey, jovensEscIdx });

    let anyUpdate = false;
    if (idx >= 0 && idx !== selected) { setSelected(idx); anyUpdate = true; }

    // Se também é um torneio de Jovens E o utilizador JÁ ESTÁ na vista Jovens,
    // sincronizar o grupo seleccionado para refrescar os tabs de escalão.
    //
    // ⚠ NÃO forçar setSeriesFilter("jovens") aqui — antes fazia-se e causava
    // um bug: clicar num torneio Nacional Jovens a partir do tab "Todos"
    // arrastava o utilizador de volta para o tab "Jovens". O "Todos" já
    // mostra os mesmos torneios com escalão-tabs no detalhe, por isso não
    // há razão para mudar de tab. Para deep-links externos (`/FPG/torneio/...`)
    // o utilizador fica em Todos por default, o que é aceitável.
    //
    // ⚠ NÃO pôr jovensGroups em deps — quando jovensGroups muda referência
    // (ex: toggle filterManuel), URL→state re-fire-ava e competia com
    // state→URL, causando loops entre torneios. O sync de jovensEscIdx é
    // deixado ao useEffect dedicado abaixo.
    const jovT = jovensTournaments.find(matchesT);
    if (jovT && seriesFilter === "jovens") {
      // Usar `entries.some(...)` em vez de construir a key: as keys agora
      // incluem um discriminator (tcode) para suportar Phase 3 Jaccard split.
      const grp = jovensGroups.find(g => g.entries.some(e => e.ccode === jovT.ccode && e.tcode === jovT.tcode));
      if (grp && jovensGroupKey !== grp.key) { setJovensGroupKey(grp.key); anyUpdate = true; }
      if (jovensShowInscricoes) { setJovensShowInscricoes(false); anyUpdate = true; }
      // Se o torneio pedido pela URL é histórico/sem Manuel, o filtro
      // filterManuel (default=true) escondê-lo-ia da sidebar e da view.
      // Auto-desactiva para que o deep-link funcione sempre.
      const tHasManuel = tournamentHasManuel(jovT);
      if (filterManuel && !tHasManuel) { setFilterManuel(false); anyUpdate = true; }
    }

    // Se actualizámos alguma coisa, sinalizar ao state→URL para não navegar
    // no próximo ciclo (URL é a fonte de verdade; estado está-se a alinhar).
    if (anyUpdate) skipNextStateUrlRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTkey, displayList, jovensTournaments]);

  // ── Sync jovensEscIdx com o tcode exacto pedido na URL ──
  // Quando urlTkey aponta para um torneio de Jovens numa posição do grupo
  // diferente de entries[0] (ex: /FPG/torneio/007-11011 = Sub 14/24, posição 1),
  // sincroniza jovensEscIdx. Separado do effect principal para evitar que deps
  // de jovensGroups causem loops (ver comentário acima).
  useEffect(() => {
    if (!urlTkey || !jovensGroupKey) return;
    const parsed = parseTournKey(urlTkey);
    if (!parsed) return;
    const curGroup = jovensGroups.find(g => g.key === jovensGroupKey);
    if (!curGroup) return;
    const escIdx = curGroup.entries.findIndex(
      e => e.ccode === parsed.ccode && e.tcode === parsed.tcode
    );
    if (escIdx >= 0 && escIdx !== jovensEscIdx) {
      setJovensEscIdx(escIdx);
      // Guarda anti-loop: a alteração de escIdx é consequência da URL, não
      // uma decisão nova do utilizador — o state→URL não deve reagir.
      skipNextStateUrlRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTkey, jovensGroupKey, jovensGroups]);

  // ── Deep-link: sync estado (torneio seleccionado) → URL ────────────────
  // Quando o utilizador clica num torneio na sidebar, actualizar a URL para
  // reflectir a selecção (`/FPG/torneio/{ccode}-{tcode}` com `replace: true`
  // para não poluir o histórico do browser).
  //
  // IMPORTANTE: deps=[cur, curJovens] APENAS. Não incluir `seriesFilter` nem
  // `jovensShowInscricoes` — se incluídos, clicar num tab (ex: "SSerra" →
  // navega para `/FPG/sto`) dispara este effect e sobrepõe a URL com
  // `/FPG/torneio/...` (o `cur` do displayList não muda com troca de tab).
  // O effect apenas deve disparar quando o TORNEIO muda de facto.
  //
  // Skip explícito (lido via closure, não por deps):
  //   - Painel de inscrições (`jovensShowInscricoes`) — URL dedicada
  //   - Vista Clubes — a URL `/FPG/clubes` não conflita e a selecção é local
  //
  // Não há loop: o useEffect URL→estado acima só muda `selected` se
  // `idx !== selected`, por isso navegar para a URL actual é no-op.
  useEffect(() => {
    if (jovensShowInscricoes) return;
    if (jovensShowAnalise) return;
    if (seriesFilter === "clubes") return;
    // Nas tabs Ranking PJA / Ranking Sub-12 a selecção de torneio não é visível
    // e a URL deve manter-se em /FPG/rankingPJA ou /FPG/rankingSub12. Guarda
    // dupla:
    //  (a) navMode actual (o tab pickado no state)
    //  (b) urlSeg actual (a URL pode já estar numa rota de ranking mesmo antes
    //      do URL→state effect ter sincronizado o navMode — ex: load inicial
    //      em /FPG/rankingPJA)
    // Sem esta guarda, cada mudança em `cur` (que acontece quando o displayList
    // carrega) sobrescreve a URL para /FPG/torneio/... e empurra o utilizador
    // para fora do ranking.
    if (navMode !== "torneios") return;
    // urlSeg é sempre lowercase (.toLowerCase() em params.filter) — comparar em lowercase.
    if (urlSeg === "rankingpja" || urlSeg === "rankingsub12" || urlSeg === "classificacoes") return;
    // Guarda anti-loop: se URL→state ou escIdx-sync acabaram de actualizar
    // estado, esse estado pode ainda não reflectir TUDO (ex: escIdx actualizado
    // mas groupKey acabou de mudar e entries[escIdx] aponta noutro lado). Saltar
    // esta execução — próximo render terá estado consistente e a URL coincidirá.
    if (skipNextStateUrlRef.current) {
      skipNextStateUrlRef.current = false;
      if (import.meta.env.DEV) console.log("[state→URL] SKIPPED (URL→state in flight)");
      return;
    }
    const t: Tournament | null =
      seriesFilter === "jovens" ? curJovens : cur;
    if (!t || !t.ccode || !t.tcode) return;
    const target = tournamentUrl("FPG", t.ccode, t.tcode);
    // Guarda anti-race: se o URL actual já é `/FPG/torneio/{tkey}` E esse
    // tkey NÃO corresponde ao `cur`, significa que URL→state ainda não
    // encontrou o torneio no displayList (provavelmente pjaExtraTournaments
    // ou jovensTournaments ainda não carregou). NÃO navegar — ficaria preso
    // a redireccionar para o displayList[0] e o deep-link perder-se-ia.
    // Aceitar também tcode sintético "A+B" quando o params.tkey é "A".
    if (params.tkey) {
      const parsed = parseTournKey(params.tkey);
      if (parsed) {
        const curCcode = t.ccode || "";
        const curTcodes = String(t.tcode || "").split("+");
        const matches = curCcode === parsed.ccode && (curTcodes.includes(parsed.tcode) || String(t.tcode) === parsed.tcode);
        if (!matches) {
          if (import.meta.env.DEV) console.log("[state→URL] SKIPPED — urlTkey", params.tkey, "não bate com cur", `${curCcode}-${t.tcode}`, "(aguardar URL→state)");
          return;
        }
      }
    }
    if (import.meta.env.DEV) console.log("[state→URL]", { from: location.pathname, target, seriesFilter, source: seriesFilter === "jovens" ? "curJovens" : "cur", tcode: t.tcode });
    if (target && location.pathname !== target) {
      navigate(target, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, curJovens, navMode]);

  /** Índice de "edições anteriores" (clube + família do nome → edições noutros
   *  anos). Construído uma vez sobre TODOS os torneios carregados; a tab só
   *  aparece nos torneios com ≥2 edições. Ver fpgPastEditions.tsx. */
  const editionsIndex = useMemo(
    () => buildFpgEditionsIndex([...tournaments, ...jovensTournaments]),
    [tournaments, jovensTournaments],
  );

  /** Lista de torneios indexados pelo seu ficheiro de origem — alimenta o
   *  popover do clique-direito no FileBadge. Inclui clubes e jovens (que têm
   *  _sourceFile próprio) além dos pull-torneios. */
  const providerTournaments = useMemo(() => {
    const base = [...tournaments, ...jovensTournaments];
    return base.map(t => ({
      _sourceFile: (t as any)._sourceFile,
      name: t.name,
      date: t.date,
      tcode: t.tcode,
      ccode: t.ccode,
    }));
  }, [tournaments, jovensTournaments]);

  /** Lista de todos os ficheiros lidos pela página — alimenta o DataSourcesChip. */
  const allSources = useMemo<DataSource[]>(() => {
    const main: DataSource[] = fileMeta.map(m => ({
      path: m.file,
      status: "loaded",
      count: m.count,
      source: m.source,
      lastUpdated: m.lastUpdated,
      group: "main",
    }));
    return [...main, ...clubesMeta, ...jovensMeta, ...admissionsMeta];
  }, [fileMeta, clubesMeta, jovensMeta, admissionsMeta]);

  // Anos disponíveis no modo Torneios.
  // Anos 2020+ aparecem como botões individuais; tudo o que é <2020 (1 entrada
  // por ano dos Nacionais Jovens históricos) fica agrupado num único bucket
  // "<2020" — evita 15+ botões para uma entrada cada.
  const availYears = useMemo(() => {
    const s = new Set<string>();
    let hasPre2020 = false;
    for (const t of displayList) {
      if (!t.date) continue;
      const y = t.date.substring(0, 4);
      if (y < "2020") hasPre2020 = true;
      else s.add(y);
    }
    const out = [...s].sort().reverse();
    if (hasPre2020) out.push(PRE_2020_KEY);
    return out;
  }, [displayList]);
  const activeYear = yearFilter ?? null;

  // Event-groups globais — os mesmos torneios agrupados por (date+ccode) com
  // nome simplificado e split por Jaccard<0.5. Usado pelos tabs "Todos",
  // "Santo" e "PJA" para mostrar 1 linha por evento físico (não 1 por tcode).
  const allEventGroups = useMemo(
    // Drive/Aquapor NÃO aparecem na sidebar da /FPG (têm a página /drive). E os
    // torneios de clubes em MATCH PLAY vivem na vista /FPG/clubes (o deep-link
    // redirige para lá) — não fazem sentido na lista strokeplay "Todos" (têm 0
    // jogadores e só um draw). Filtra-se na VISTA (não em `displayList`) para os
    // deep-links continuarem a resolver.
    () => buildEventGroups(
      displayList.filter(t =>
        !isDriveOrAquapor(t) && !CLUBES_TEAM_FORMAT[`${t.ccode}-${t.tcode}`]?.matchPlay),
      { mergeEditions: true },
    ),
    [displayList]
  );

  // Lista PJA (modo circuito) — apenas torneios com "PJA" no nome ou
  // registados em TOURN_PILLS como PJA. Exclui SSerra (tab próprio).
  //
  // Excepção: "Greatgolf Junior Open" não tem "PJA" no nome mas é considerado
  // parte do circuito PJA pela Mariana — incluído explicitamente.
  const pjaList = useMemo(
    () => displayList.filter(t => {
      if (t.ccode === SSERRA_CCODE) return false;  // SSerra tem tab próprio
      if (/PJA/i.test(t.name)) return true;
      if (/greatgolf.*junior/i.test(t.name)) return true;
      const tcodes = t.tcode?.split("+") || [];
      return tcodes.some(tc => TOURN_PILLS[tc] === "PJA");
    }),
    [displayList]
  );

  // Lista EXPANDIDA para o Ranking PJA — a partir de 2026 o ranking inclui,
  // além dos torneios exclusivos PJA, os torneios Drive Tour (FPG), Aquapor
  // (2 primeiros do ano) e Greatgolf Junior Open. Para anos anteriores,
  // mantém o comportamento antigo (só torneios PJA exclusivos).
  // A classificação do tipo e aplicação das regras (GG só R2+R3, Aquapor só
  // para quem não jogou DT, etc.) é feita dentro de PJARankingView.
  const pjaRankingList = useMemo(
    () => {
      const isPJA = (t: Tournament) => {
        // Torneios manuais marcados explicitamente como PJA
        if ((t as any)._manual && (t as any)._origin === "PJA") return true;
        if (t.ccode === SSERRA_CCODE) return false;
        // Regras partilhadas com a página standalone ranking-pja.vercel.app —
        // fonte única em ranking-pja/pja-rules.mjs (alterar as regras LÁ).
        return isPJACore(t);
      };
      // Combinar displayList (pull-torneios) + drive/aquapor mensais,
      // deduplicando por tcode+ccode+date.
      const out: Tournament[] = displayList.filter(isPJA);
      const seen = new Set(out.map(t => `${t.ccode || "?"}/${t.tcode ?? "?"}/${t.date || "?"}`));
      for (const t of pjaExtraTournaments) {
        if (!isPJA(t)) continue;
        const k = `${t.ccode || "?"}/${t.tcode ?? "?"}/${t.date || "?"}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
      }
      return out;
    },
    [displayList, pjaExtraTournaments]
  );

  const pjaEventGroups = useMemo(() => buildEventGroups(pjaList), [pjaList]);

  // ── Santo da Serra ──
  const santoList = useMemo(
    () => displayList.filter(t => t.ccode === SSERRA_CCODE),
    [displayList]
  );
  const santoEventGroups = useMemo(() => buildEventGroups(santoList), [santoList]);

  // ── Vista de Torneios via CircuitShell (Todos / Santo da Serra / PJA) ──
  // As três vistas de torneios usam o shell partilhado (mesmo componente de
  // /rfeg, /drive, /major, …). Não afecta Clubes / Jovens / rankings (que têm
  // UI própria mais abaixo). O detalhe é delegado ao TournamentDetail da FPG.
  const shellGroups = seriesFilter === "santo" ? santoEventGroups
    : seriesFilter === "" ? allEventGroups
    : pjaEventGroups;
  const shellEntries = useMemo(() => {
    const ents = buildFpgEntries(shellGroups);
    // Anexa o render do detalhe (delegado ao TournamentDetail da FPG, que tem
    // escLookup/playersDB em runtime) — mesmo padrão do DrivePage. As tabs
    // "Edições anteriores" vêm do índice próprio da FPG (fpgPastEditionsTabs),
    // não do mecanismo do shell — por isso a config não define editionKey.
    for (const e of ents) for (const d of e.divisions ?? []) {
      const t = d.results!;
      d.renderFull = () => (
        <TournamentDetail tournament={t} escLookup={escLookup} playersDB={playersDB}
          extraTabs={fpgExtraTabs(editionsIndex, t, playersDB)} />
      );
    }
    return ents;
  }, [shellGroups, escLookup, playersDB, editionsIndex]);

  // Deep-link /FPG/torneio/{ccode}-{tcode} → (grupo, escalão). Um membro pode ter
  // tcode sintético "A+B" (multi-dia); o URL canónico usa só o 1º tcode, por isso
  // o match parte o "+".
  const shellSel = useMemo(() => {
    const empty = { id: undefined as string | undefined, divKey: undefined as string | undefined };
    if (!params.tkey) return empty;
    const parsed = parseTournKey(params.tkey);
    if (!parsed) return empty;
    const matches = (memberKey: string) => {
      const mp = parseTournKey(memberKey);
      if (!mp || String(mp.ccode) !== String(parsed.ccode)) return false;
      const mt = String(mp.tcode ?? "");
      return mt === String(parsed.tcode) || mt.split("+").includes(String(parsed.tcode));
    };
    for (const e of shellEntries) {
      const d = e.divisions?.find(dv => matches(dv.key));
      if (d) return { id: e.id, divKey: d.key };
    }
    return empty;
  }, [params.tkey, shellEntries]);

  // Navega o URL para o tcode canónico (ccode-firstTcode) de uma divisão,
  // PRESERVANDO a query (ex.: ?manuel=0). Remove `tab` para o shell reescrever a
  // aba do novo torneio.
  const shellNavToDiv = useCallback((divKey: string, replace: boolean) => {
    const p = parseTournKey(divKey);
    if (!p) return;
    const firstTcode = String(p.tcode ?? "").split("+")[0];
    const path = tournamentUrl("FPG", p.ccode, firstTcode);
    if (!path) return;
    const sp = new URLSearchParams(location.search);
    sp.delete("tab");
    const search = sp.toString();
    const target = search ? `${path}?${search}` : path;
    if (location.pathname + location.search !== target) navigate(target, { replace });
  }, [location.pathname, location.search, navigate]);

  const shellConfig: CircuitConfig = {
    ...FPG_CONFIG,
    grouping: seriesFilter === "" ? "month-year" : "year",
    title: seriesFilter === "santo" ? "⛳ Santo da Serra"
      : seriesFilter === "" ? "🇵🇹 FPG — Todos" : "🏆 PJA",
  };
  const shellView = (
    <CircuitShell
      entries={shellEntries}
      config={shellConfig}
      loading={loading}
      selectedId={shellSel.id}
      selectedDivKey={shellSel.divKey}
      onSelectEntry={(e) => {
        const rep = fpgRepDivision(e.divisions ?? []);
        if (rep) shellNavToDiv(rep.key, true);
      }}
      onSelectDivision={(_e, d) => shellNavToDiv(d.key, true)}
      // Paridade total da sidebar: reusa o MESMO TournSidebarItem do render
      // clássico (pills NACIONAL/JUNIOR/9H/SSerra/Clube, 🔗 por-tcode, FileBadge
      // da fonte, contagem de inscritos), mas com click/href do shell.
      // O grupo vem por id (= EventGroup.key).
      renderSidebarItem={(entry, { active, onSelect }) => {
        const g = shellGroups.find(gr => gr.key === entry.id);
        if (!g) return null;
        const first = g.entries[0];
        const firstTcode = (first?.tcode || "").split("+")[0];
        const path = first?.ccode && firstTcode ? tournamentUrl("FPG", first.ccode, firstTcode) : undefined;
        let href = path;
        if (path) {
          const sp = new URLSearchParams(location.search);
          sp.delete("tab");
          const s = sp.toString();
          href = s ? `${path}?${s}` : path;
        }
        return renderSidebarItem(g, { onClick: onSelect, href, isActive: active });
      }}
    />
  );

  // Vistas de torneios servidas pelo CircuitShell (Todos/Santo/PJA). O shell traz
  // a sua própria pesquisa + toggle de sidebar, por isso os equivalentes da
  // toolbar exterior são escondidos aqui (evita chrome duplicado). Clubes/Jovens
  // (master-detail próprio) e os modos Ranking/Classificações mantêm-nos.
  const shellTorneios = navMode === "torneios" && seriesFilter !== "clubes" && seriesFilter !== "jovens";

  /** Renderiza item de sidebar para uma EventGroup.
   *  - Singleton (entries.length === 1): comportamento idêntico ao anterior.
   *  - Grupo (entries.length > 1): nome simplificado + pill "N escalões" +
   *    pills agregados de todas as entradas; clique vai à entrada activa
   *    se `cur` já pertence ao grupo, senão vai à primeira entrada. */
  function renderSidebarItem(g: EventGroup, opts: { onClick: () => void; href?: string; isActive: boolean }) {
    const isMulti = g.entries.length > 1;
    // Entrada activa dentro do grupo (ou a primeira, se nenhuma está activa) —
    // é dela que sai o campo/tcode/players do `tData`.
    const activeEntryIdx = cur
      ? g.entries.findIndex(e => e.ccode === cur.ccode && e.tcode === cur.tcode)
      : -1;
    const activeEntry = activeEntryIdx >= 0 ? g.entries[activeEntryIdx] : g.entries[0];

    // Pill dinâmico (REGIONAL, NACIONAL, etc.) agregando todos os tcodes do grupo.
    const allTcodes = g.entries.flatMap(e => (e.tcode || "").split("+"));
    const pillVal = allTcodes.map(tc => TOURN_PILLS[tc] || tcodePills?.[tc]).find(Boolean);

    // Contagem de escalões (só se houver mais que 1 entrada).
    const counterPill = isMulti ? (
      <span className="p p-sm p-muted" title={g.entries.map(e => e.escalao || "?").join(" · ")}>
        {g.entries.length} esc.
      </span>
    ) : null;
    const tournPill = pillVal && pillVal !== "PJA" && pillVal !== "SSERRA"
      ? <span className={`p p-sm p-tourn p-${pillVal.toLowerCase()}`}>{pillVal}</span>
      : null;
    const extraPills = (counterPill || tournPill) ? <>{counterPill}{tournPill}</> : null;

    // Número de jogadores: quando grupo, soma distinct por jogador (um player
    // pode aparecer em múltiplos escalões se o organizador o listou assim —
    // raro). Simples e suficiente: somar playerCount de cada entrada.
    const nJog = isMulti
      ? g.entries.reduce((s, e) => s + (e.playerCount || e.players.filter(p => !isDNS(p)).length), 0)
      : (activeEntry.playerCount || activeEntry.players.filter(p => !isDNS(p)).length);

    // Nome a mostrar: simplificado se grupo; original se singleton (preserva
    // aspectos como "R1/R2/Total" em torneios multi-ronda sintéticos).
    const displayName = isMulti ? g.name : (activeEntry.name || g.name);

    // tcode "combinado" para a chave React — apenas para diferenciar elementos.
    const keyTcodes = g.entries.map(e => e.tcode).join("+");

    const tData: SidebarItemTournament = {
      ...(activeEntry as any),
      name: displayName,
      // Escalão: só mostrar no pill quando é singleton; em grupo o escalão
      // varia por entrada → não cabe num pill único.
      escalao: isMulti ? null : activeEntry.escalao,
      playerCount: nJog,
      pill: pillVal,
      _manuelInscrito: g.entries.some(tournamentHasManuel),
    };
    // `opts` (click/href/isActive) vem do CircuitSidebar: o click navega
    // preservando a query e o href é o deep-link canónico (ccode-firstTcode).
    return (
      <TournSidebarItem
        key={(activeEntry._isSynthetic ? "synth_" : "") + keyTcodes + "_" + g.date}
        t={tData}
        isActive={opts.isActive}
        onClick={opts.onClick}
        extraPills={extraPills}
        href={opts.href}
      />
    );
  }

  return (
    <DataSourcesProvider tournaments={providerTournaments}>
    <div className="tourn-layout">

      {/* ── Toolbar mobile-first: scroll horizontal em vez de grid ── */}
      <div style={{ borderBottom: "1px solid var(--border-light)" }}>

        {/* Linha 1: toda numa linha scrollável */}
        <Toolbar>
          {/* Toggle exterior escondido nas vistas do shell (o shell tem o seu). */}
          {!shellTorneios && <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Torneios" />}
          <ToolbarTitle>🏌️ FPG</ToolbarTitle>
          <DataSourcesChip sources={allSources} />
          {/* Pesquisa exterior: nos modos Ranking/Classificações filtra jogadores;
              em Clubes/Jovens filtra a lista. Nas vistas do shell (Torneios) é o
              shell que pesquisa, por isso esconde-se aqui. */}
          {!loading && !shellTorneios && (<>
            <ToolbarSep />
            {/* Search unificado — mesmo local e tamanho em todos os modos.
                Filtra jogadores em Ranking PJA, a lista em Clubes/Jovens, etc.
                O valor é partilhado (searchQuery). */}
            <div style={{ flexShrink: 0, position: "relative", display: "inline-flex", alignItems: "center" }}>
              <span aria-hidden="true" style={{
                position: "absolute", left: 8, fontSize: "var(--fs-11)", color: "var(--text-muted)", pointerEvents: "none",
              }}>🔎</span>
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={
                  navMode === "ranking-pja" || navMode === "classificacoes" ? "jogador ou clube..."
                    : navMode === "ranking-sub12" ? "jogador..."
                    : "nome, campo, clube..."
                }
                aria-label="Pesquisar"
                style={{
                  fontSize: "var(--fs-12)",
                  padding: "4px 22px 4px 24px",
                  width: 200,
                  border: "1px solid var(--border)",
                  borderRadius: 5,
                  background: "var(--bg-card)",
                  color: "var(--text)",
                  outline: "none",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Limpar pesquisa"
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute", right: 2,
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--text-muted)", fontSize: "var(--fs-14)", padding: "0 4px",
                    lineHeight: 1,
                  }}
                >×</button>
              )}
            </div>
          </>)}
          {!loading && (<>
            <ToolbarSep />
            {([
              { key: "torneios",      label: "Torneios" },
              { key: "ranking-pja",   label: "📊 Ranking PJA" },
              { key: "ranking-sub12", label: "🏅 Ranking Sub-12" },
              { key: "classificacoes", label: "🏆 CLASSIFICAÇÕES" },
            ] as const).map(({ key, label }) => (
              <button key={key}
                className={"tourn-tab tourn-tab-sm" + (navMode === key ? " active" : " tourn-tab-muted")}
                onClick={() => {
                  setNavMode(key);
                  setSeriesFilter("");
                  setYearFilter(null);
                  const seg = NAV_TO_URL[key];
                  const target = seg ? `/FPG/${seg}` : "/FPG";
                  if (location.pathname !== target) navigate(target);
                }}
                style={{ flexShrink: 0 }}>
                {label}
              </button>
            ))}
            {/* Tabs de série (Todos/JOVENS/CLUBES/STO/PJA) — na MESMA barra, a
                seguir ao mode-switcher (antes ficavam numa 2ª linha). Só em modo
                Torneios. */}
            {navMode === "torneios" && (<>
              <ToolbarSep />
              {([
                { key: "",        label: "Todos" },
                { key: "jovens",  label: "🏆 JOVENS" },
                { key: "clubes",  label: "🏅 CLUBES" },
                { key: "santo",   label: "⛳ STO" },
                { key: "circuit", label: "🏆 PJA" },
              ] as const).map(({ key, label }) => {
                const active = seriesFilter === key;
                const st = active
                  ? key === "santo"  ? { flexShrink: 0, ...PILL_SSERRA, borderColor: PILL_SSERRA.background as string }
                  : key === "clubes" ? { flexShrink: 0, background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }
                  : key === "jovens"    ? { flexShrink: 0, background: SIDEBAR_ACCENT.tour, borderColor: SIDEBAR_ACCENT.tour, color: "#fff" }
                  : { flexShrink: 0 }
                  : { flexShrink: 0 };
                const urlSeg = FILTER_TO_URL[key];
                const href = urlSeg ? `/FPG/${urlSeg}` : "/FPG";
                return (
                  <a key={key} href={href}
                    className={"tourn-tab tourn-tab-sm" + (active ? " active" : " tourn-tab-muted")}
                    onClick={e => {
                      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                        e.preventDefault();
                        setSeriesFilter(key);
                        setJovensShowInscricoes(false);
                        // Preserva a query (ex.: ?manuel=0); remove `tab` (é por-torneio).
                        const _sp = new URLSearchParams(location.search);
                        _sp.delete("tab");
                        const _s = _sp.toString();
                        navigate((urlSeg ? `/FPG/${urlSeg}` : "/FPG") + (_s ? `?${_s}` : ""));
                      }
                    }}
                    style={st}>
                    {label}
                  </a>
                );
              })}
            </>)}
            {/* Pills de ano + ★Manuel exteriores: nas vistas do shell (Torneios)
                o CircuitShell já os tem, por isso escondem-se aqui para um
                cabeçalho limpo (estilo /ffg). Clubes/Jovens mantêm-nos (filtram
                a lista master-detail própria). */}
            {!shellTorneios && navMode === "torneios" && availYears.length > 1 && (<>
              <ToolbarSep />
              {availYears.map(y => (
                <button key={y}
                  className={"tourn-tab tourn-tab-sm" + (activeYear === y ? " active" : " tourn-tab-muted")}
                  onClick={() => setYearFilter(activeYear === y ? null : y)}
                  style={{ flexShrink: 0 }}>
                  {y}
                </button>
              ))}
              <ToolbarSep />
              <button
                className={"tourn-tab tourn-tab-sm" + (filterManuel ? " active" : " tourn-tab-muted")}
                onClick={() => setFilterManuel(v => !v)}
                style={filterManuel
                  ? { flexShrink: 0, background: "var(--bg-success-subtle)", borderColor: "var(--color-good)", color: "var(--color-good-dark)", whiteSpace: "nowrap" }
                  : { flexShrink: 0, whiteSpace: "nowrap" }}>
                ★ Manuel
              </button>
            </>)}
            <div className="flex-1" style={{ minWidth: 8 }} />
            {/* Contadores à direita */}
            <ExtLink href="https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T"
              className="fs-11 fw-600"
              style={{ flexShrink: 0, cursor: "pointer", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 5, padding: "3px 8px", lineHeight: 1.6, textDecoration: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 3 }}>
              FPG Torneios ↗
            </ExtLink>
            {loading
              ? <span className="muted fs-11 shrink-0"  style={{ fontStyle: "italic" }}>{loadingMsg}</span>
              : <>
                  {/* Contadores exteriores só nos modos SEM shell (Clubes/Jovens)
                      — nas vistas do shell o próprio CircuitShell mostra a
                      contagem, e estes dependiam dos filtros de ano/Manuel que
                      foram escondidos. */}
                  {!shellTorneios && navMode === "torneios" && (() => {
                    const count = seriesFilter === "clubes"  ? clubesList.length
                                : seriesFilter === "jovens"  ? jovensGroups.length
                                : 0;
                    return <span className="chip shrink-0" title={searchTerm ? `Com filtro "${searchQuery}"` : undefined}>
                      {count} torneio{count !== 1 ? "s" : ""}{searchTerm ? " ✓" : ""}
                    </span>;
                  })()}
                </>
            }
          </>)}
          {/* Slot de portal: o PJARankingView renderiza os seus filtros (anos,
              sexo, escalões) aqui via createPortal em vez de ter toolbar própria.
              ⚠ FORA do guard `!loading`: a vista de ranking monta antes de a
              FPGPage acabar de carregar e procura o slot no primeiro render —
              se ele ainda não existisse, os filtros caíam na toolbar de
              fallback e apareciam numa segunda linha. */}
          {(navMode === "ranking-pja" || navMode === "classificacoes" || navMode === "ranking-sub12") && <>
            {!loading && <ToolbarSep />}
            <div id="pja-toolbar-slot" style={{ display: "contents" }} />
          </>}
        </Toolbar>
      </div>

      {error && (
        <div className="fw-600 fs-13 c-danger" style={{ padding: "16px 20px" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Torneios (Todos / Santo da Serra / PJA) — vista via CircuitShell */}
      {shellTorneios && shellView}

      {/* ── Clubes ─────────────────────────────────────────────────────── */}
      {navMode === "torneios" && seriesFilter === "clubes" && (
        <div className="master-detail">
          {/* Sidebar Clubes */}
          <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
            {clubesLoading && <LoadingState size="sm" message="A carregar…" />}
            {clubesLoaded && clubesList.length === 0 && !clubesLoading && (
              <div className="muted fs-11 u-pad-italic">
                Ficheiro não encontrado (ainda)
              </div>
            )}
            {clubesYears.map(yr => (
              <React.Fragment key={yr}>
                <div className="sidebar-section-title-dark">🏅 {yr}</div>
                {clubesByYear[yr].map(t => {
                  const idx = clubesList.indexOf(t);
                  const playedR = Math.max(0, ...t.players.map(p => p.roundScores?.length ?? 0));
                  const nR = t.rounds || 1;
                  // Sufixo de progresso: "R2/3" no campo quando torneio incompleto
                  const progressSuffix = nR > 1 && playedR > 0 && playedR < nR
                    ? ` · R${playedR}/${nR}` : "";
                  const tWithProgress = {
                    ...(t as any),
                    playerCount: t.playerCount || t.players.length,
                    campo: (t.campo || "Oporto") + progressSuffix,
                  } as SidebarItemTournament;
                  return (
                    <TournSidebarItem
                      key={t.tcode + "_" + t.date}
                      t={tWithProgress}
                      isActive={clubesSelected === idx}
                      onClick={() => {
                        setClubesSelected(idx);
                        // URL partilhável por torneio: /FPG/clubes?ct=ccode-tcode
                        const sp = new URLSearchParams(searchParams);
                        sp.set("ct", `${t.ccode}-${t.tcode}`);
                        setSearchParams(sp, { replace: true });
                        md.onSelect();
                      }}
                      accentColor={SIDEBAR_ACCENT.clubes}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* Detail Clubes */}
          <div className="course-detail" ref={md.detailRef}>
            {/* Tabs Individual / Grupos */}
            <div className="tabbar-under" style={{
              background: "var(--bg-card,#fff)", position: "sticky", top: 0, zIndex: "var(--z-panel-hdr)",
            }}>
              {(() => {
                // O tab Match Play só existe em provas de match play com dados
                // (Regional de Clubes 2026) — nos strokeplay não faria sentido.
                const _fmtTabs = curClubes ? CLUBES_TEAM_FORMAT[`${curClubes.ccode}-${curClubes.tcode}`] : undefined;
                const hasMp = !!_fmtTabs?.matchPlay && !!(curClubes as any)?.matchPlayResults;
                const views = hasMp
                  ? (["grupos", "matchplay", "individual"] as const)
                  : (["grupos", "individual"] as const);
                const LABELS = { grupos: "🏅 Grupos", matchplay: "🆚 Match Play", individual: "📋 Individual" } as const;
                return views.map(v => (
                  <button key={v} onClick={() => setClubesView(v)}
                    className={"tab-under" + (clubesView === v ? " active" : "")}>{LABELS[v]}</button>
                ));
              })()}
            </div>

            {/* Links directos FPG (Inscritos · Draw · Resultados) — visíveis em
                ambos os tabs (Grupos e Individual) para TODOS os torneios de
                clubes. O TournamentDetail já mostra estes links no cabeçalho,
                mas o tab Grupos não os tinha. */}
            {curClubes?.ccode && curClubes?.tcode && (
              <div className="flex-wrap" style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 16px", borderBottom: "1px solid var(--border)",
                background: "var(--bg-muted,#f7f7f7)", fontSize: "var(--fs-12)",
              }}>
                <span className="fw-600" style={{ color: "var(--text-muted)" }}>FPG:</span>
                <TournExtLinks
                  ccode={curClubes.ccode}
                  tcode={curClubes.tcode}
                  round={1}
                />
              </div>
            )}

            {clubesView === "matchplay" && curClubes ? (() => {
              const _fmt = CLUBES_TEAM_FORMAT[`${curClubes.ccode}-${curClubes.tcode}`];
              const _mp = (curClubes as any).matchPlayResults as MatchPlayData | undefined;
              if (!_mp || !_fmt?.categories) {
                return <div className="fs-13 c-muted" style={{ padding: "32px 24px", textAlign: "center" }}>Sem confrontos publicados.</div>;
              }
              return (
                <>
                  <div className="flex-wrap" style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 16px", borderBottom: "1px solid var(--border)",
                    background: "var(--accent-light, #eef6ef)", fontSize: "var(--fs-12)", color: "var(--text-2)",
                  }}>
                    <span style={{ fontSize: "var(--fs-16)" }}>🆚</span>
                    <span>Confrontos 3-way, buraco a buraco. Estado corrido na perspectiva do <strong>1º clube</strong> de cada linha.</span>
                  </div>
                  <MatchPlayResultsTable results={_mp} categories={_fmt.categories} mode="matches" />
                </>
              );
            })() : clubesView === "individual"
              ? curClubes
                  ? (() => {
                      const _fmt = CLUBES_TEAM_FORMAT[`${curClubes.ccode}-${curClubes.tcode}`];
                      const _mp = _fmt?.matchPlay ? (curClubes as any).matchPlayResults as MatchPlayData | undefined : undefined;
                      const _par = _mp?.course?.par ?? [];
                      const _meters = (_mp?.course as any)?.meters ?? [];
                      const _tee = _mp?.course?.tee;
                      // Sintetizar jogadores do match play, agrupando todos os dias por jogador
                      // (fedCode como chave → Manuel aparece 1× com R1+R2, não 2×)
                      const _mpPlayers = _mp && _par.length > 0
                        ? (() => {
                            const parTot = _par.reduce((s, v) => s + v, 0);
                            type RndEntry = { diaNum: number; gross: number; scores: (number|null)[]; nholes: number };
                            const byPlayer = new Map<string, { fed?: string; name: string; club: string; rounds: RndEntry[] }>();
                            for (const cat of _mp.categories) {
                              for (const dia of cat.dias) {
                                for (const m of dia.matches ?? []) {
                                  for (const cl of _mp.clubs) {
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
                            return Array.from(byPlayer.entries()).map(([key, entry]) => {
                              const allGross = entry.rounds.reduce((s, r) => s + r.gross, 0);
                              const allComplete = entry.rounds.every(r => r.nholes >= _par.length);
                              const toPar = allComplete ? allGross - parTot * entry.rounds.length : null;
                              // ⚠ `nholes` é o TAMANHO DA VOLTA (18), não os buracos
                              // preenchidos: com 16 o leaderboard desenhava uma volta
                              // de 16 buracos e o ±par comparava com o par errado
                              // (caso Tomás Câmara, Regional de Clubes 2026).
                              const nholes = _par.length;
                              return {
                                scoreId: `mp-${key}`,
                                name: entry.name,
                                club: entry.club,
                                fedCode: entry.fed,
                                pos: null as unknown as number,
                                grossTotal: allGross,
                                toPar,
                                scores: entry.rounds[0]?.scores,
                                par: _par,
                                nholes,
                                teeName: _tee,
                                meters: _meters,
                                roundScores: entry.rounds.map(r => ({
                                  round: r.diaNum,
                                  gross: r.gross,
                                  scores: r.scores,
                                  pars: _par,
                                  si: [],
                                  meters: _meters,
                                  teeName: _tee,
                                })),
                              };
                            });
                          })()
                        : [];
                      // Injetar dia1 como _draws["1"] sintético para aparecer como "Draw R1"
                      const _dia1 = _mp?.dia1;
                      const _syntheticDraw1: FpgDraw | undefined = _dia1 ? (() => {
                        const clubMap = Object.fromEntries((_mp?.clubs ?? []).map(c => [c.key, c]));
                        const flights: FpgDrawFlight[] = Object.values(_dia1.groups)
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
                        return { name: `Draw — ${_dia1.modalidade ?? "R1"}`, date: _dia1.date, totalJogadores: total, groups: flights };
                      })() : undefined;
                      const _existingDraws: Record<string, FpgDraw> = (curClubes as any)._draws ?? {};
                      const _draws = _syntheticDraw1 ? { "1": _syntheticDraw1, ..._existingDraws } : _existingDraws;
                      const _t = {
                        ...((_mpPlayers.length > 0 ? { ...curClubes, players: _mpPlayers as any } : curClubes) as object),
                        _draws,
                      };
                      return <TournamentDetail tournament={_t as any} escLookup={escLookup} playersDB={playersDB} extraTabs={fpgExtraTabs(editionsIndex, _t as any, playersDB)} />;
                    })()
                  : !clubesLoading && (
                      clubesLoaded
                        ? <div className="center-msg muted">Selecciona um torneio</div>
                        : <LoadingState size="sm" message="A carregar…" />
                    )
              : (() => {
                  if (!curClubes) {
                    return !clubesLoading
                      ? <div className="center-msg muted">Selecciona um torneio</div>
                      : null;
                  }
                  // Composição curada (juvenis sub14/sub18) tem prioridade; para
                  // clubes não-juvenis (ex: Mid-Amateur, esc "midam") ou edições
                  // sem composição carregada, auto-constrói as equipas por clube.
                  const esc = (curClubes as any)?._clubesEsc as string | undefined;
                  const gruposData = curClubesYear ? CLUBES_GRUPOS_BY_YEAR[curClubesYear] : null;
                  const curated = (esc === "sub14" || esc === "sub18")
                    ? (gruposData?.[esc] ?? null)
                    : null;
                  const grupos = (curated && curated.length) ? curated : autoGruposByClub(curClubes);
                  // Clubes não-juvenis (midam): formato de pontuação por torneio
                  // (CLUBES_TEAM_FORMAT). Default = 5 melhores em todas as rondas
                  // (Absoluto), sem cap de pancadas por buraco.
                  const isMidam = esc === "midam";
                  const fmt = CLUBES_TEAM_FORMAT[`${curClubes.ccode}-${curClubes.tcode}`];
                  // Match Play (ex: Regional 2026) — a classificação é por pontos,
                  // não por pancadas. As vistas de Grupos por strokeplay não se
                  // aplicam; mostra-se nota e remete para Individual / Draw.
                  if (fmt?.matchPlay) {
                    const mpResults = (curClubes as any).matchPlayResults as MatchPlayData | undefined;
                    const banner = (
                      <div className="flex-wrap" style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "10px 16px", borderBottom: "1px solid var(--border)",
                        background: "var(--accent-light, #eef6ef)", fontSize: "var(--fs-12)", color: "var(--text-2)",
                      }}>
                        <span style={{ fontSize: "var(--fs-16)" }}>🆚</span>
                        <span>
                          <strong>Match Play — classificação por pontos.</strong>{" "}{fmt.note}.
                          {mpResults
                            ? <> Dia 1 match play · Dia 2 stroke play (Palheiro Golf) — usa o selector de <strong>Dia</strong>. Confrontos buraco-a-buraco no tab <strong>Match Play</strong>.</>
                            : <> A classificação por equipa surge quando houver resultados; vê o <strong>Draw</strong> para os emparelhamentos 3-way.</>}
                        </span>
                      </div>
                    );
                    // Com resultados: mostra tabela de match play
                    if (mpResults && fmt.categories) {
                      return (
                        <>
                          {banner}
                          <MatchPlayResultsTable results={mpResults} categories={fmt.categories} />
                        </>
                      );
                    }
                    // Pré-jogo: mostra composição das equipas por clube e categoria
                    if (fmt.categories && grupos.length) {
                      return (
                        <>
                          {banner}
                          <ClubesCategoriasView
                            tournament={curClubes}
                            grupos={grupos}
                            playersDB={playersDB}
                            categories={fmt.categories}
                            rosterMode
                            bestNLabel={(n) => `máx. ${n} + 1 supl.`}
                            initialSort="hcp"
                            intro={<>Composição das equipas por clube — cada clube alinha em 3 campeonatos: <strong>Homens</strong>, <strong>Senhoras</strong> e <strong>Juniores</strong> (≤Sub-18). O número ao lado de cada categoria é o nº de inscritos; "máx." é o limite do regulamento (titulares + 1 suplente).</>}
                          />
                        </>
                      );
                    }
                    return (
                      <div className="fs-13 c-muted" style={{ padding: "32px 24px", textAlign: "center" }}>
                        <div className="mb-12" style={{ fontSize: "var(--fs-32)" }}>🆚</div>
                        <div className="fw-600 mb-6">Match Play — classificação por pontos</div>
                        <div className="fs-12">{fmt.note}<br/>A classificação por equipa (pontos) será apresentada quando os resultados forem publicados.<br/>Vê o tab <strong>Individual</strong> e o <strong>Draw</strong> para os emparelhamentos 3-way.</div>
                      </div>
                    );
                  }
                  // Torneios com categorias (ex: Regional Absoluto — Homens/
                  // Senhoras/Juniores) → sub-grupos por categoria dentro do clube.
                  if (fmt?.categories && grupos.length) {
                    return <ClubesCategoriasView
                      tournament={curClubes}
                      grupos={grupos}
                      playersDB={playersDB}
                      categories={fmt.categories}
                    />;
                  }
                  if (grupos.length) {
                    return <ClubesGruposView
                      grupos={grupos}
                      tournament={curClubes}
                      escKey={(esc === "sub18" ? "sub18" : "sub14")}
                      bestNByRound={isMidam ? fmt?.bestNByRound : undefined}
                      defaultBestN={isMidam ? (fmt?.defaultBestN ?? 5) : undefined}
                      maxHoleScore={isMidam ? Infinity : undefined}
                      formatNote={isMidam ? (fmt?.note ?? "Cada dia: 5 melhores resultados por equipa") : undefined}
                    />;
                  }
                  return (
                    <div className="fs-13 c-muted" style={{ padding: "32px 24px", textAlign: "center" }}>
                      <div className="mb-12" style={{ fontSize: "var(--fs-32)" }}>📋</div>
                      <div className="fw-600 mb-6">Vista de grupos não disponível para {curClubesYear}</div>
                      <div className="fs-12">Os dados de composição de grupos desta edição não estão carregados.<br/>Use o tab <strong>Individual</strong> para ver os resultados.</div>
                    </div>
                  );
                })()
            }
          </div>
        </div>
      )}

      {/* Master-detail Jovens */}
      {navMode === "torneios" && seriesFilter === "jovens" && (
        <div className="master-detail">
          <div className={`sidebar ${md.open ? "" : "sidebar-closed"}`}>
            {jovensLoading && <LoadingState size="sm" message="A carregar…" />}
            {jovensLoaded && jovensGroups.length === 0 && !jovensLoading && (
              <div className="muted fs-11 u-pad-italic">Ficheiro não encontrado (ainda)</div>
            )}
            {/* A entrada "📊 Análise" foi REMOVIDA de /FPG/jovens em 2026-05-04
                — a análise agora vive exclusivamente na página dedicada /titulos
                (acessível via tab "🏆 Títulos" da NavBar de topo). */}
            {/* Entrada "📋 Inscrições 2026" DESACTIVADA 2026-04-27 — inscrições do
                Nacional Sub-12 fecharam, todos 19 inscritos confirmados (sem reservas).
                A rota /FPG/jovens/inscritosCN, o InscricoesPanel e o jovensShowInscricoes
                state mantêm-se intactos no código para reactivação rápida em próximas
                edições — basta voltar a `true` o flag abaixo. */}
            {false && (
            <a
              href="/FPG/jovens/inscritosCN"
              onClick={e => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  setJovensShowInscricoes(true);
                  setJovensShowAnalise(false);
                  setJovensGroupKey(null);
                  md.onSelect();
                  navigate("/FPG/jovens/inscritosCN");
                }
              }}
              className={`course-item${jovensShowInscricoes ? " active" : ""}`}
              style={{
                borderLeft: `4px solid ${SIDEBAR_ACCENT.tour}`, borderRadius: "0 6px 6px 0",
              }}
            >
              <div className="fw-700 fs-12">
                📋 Inscrições 2026
              </div>
              <div className="muted fs-11" >Campeonatos Nacionais de Jovens</div>
            </a>
            )}
            {jovensYears.map(yr => (
              <React.Fragment key={yr}>
                <div className="sidebar-section-title-dark">🏆 {yr}</div>
                {jovensByYear[yr].map(g => {
                  const totalJog = g.entries.reduce((s, e) => s + (e.playerCount || e.players.length), 0);
                  const t0 = g.entries[0];
                  // Mapa ccode → nome de região/organização
                  const REGION_LABEL: Record<string, string> = {
                    "000": "Nacional", "988": "Sul", "987": "Norte",
                    "985": "Tejo", "983": "Açores", "982": "Madeira",
                    "051": "Açores", "007": "Madeira", "910": "Norte",
                    "059": "Palheiro", "005": "Açores",
                  };
                  const regionLabel = REGION_LABEL[t0.ccode ?? ""] ?? t0.ccode ?? "";
                  // Data só dd/mm (ano já está no cabeçalho de secção)
                  const ddmm = g.date ? fmtDateShort(g.date) : "";
                  // Manuel detection: procurar em TODAS as entries do grupo (o grupo
                  // pode ter Sub 10 e Sub 14 do mesmo Regional — Manuel está só numa).
                  const groupHasManuel = g.entries.some(e => tournamentHasManuel(e));
                  const sidebarT: SidebarItemTournament = {
                    ...(t0 as any),
                    name: g.name,
                    playerCount: totalJog,
                    escalao: null,
                    ccode: "",     // sem ClubePill automático
                    date: undefined,  // sem data automática
                    _manuelInscrito: groupHasManuel,
                  };
                  return (
                    <TournSidebarItem
                      key={g.key}
                      t={sidebarT}
                      isActive={jovensGroupKey === g.key}
                      onClick={() => {
                        setJovensGroupKey(g.key); setJovensEscIdx(0); setJovensShowInscricoes(false); setJovensShowAnalise(false); md.onSelect();
                        // Navegar imediatamente para a URL do torneio escolhido.
                        // Sem isto, o state→URL effect skipa pelo guard anti-race
                        // (params.tkey != curJovens novo) e o user fica preso na URL
                        // antiga (ex: 007-10551?tab=draw:2). Mesmo padrão usado em
                        // renderSidebarItem da sidebar principal. Para tcodes sintéticos
                        // "A+B", parseTournKey aceita o primeiro tcode no URL.
                        const t0 = g.entries[0];
                        const firstTcode = (t0?.tcode || "").split("+")[0];
                        if (t0?.ccode && firstTcode) {
                          const target = tournamentUrl("FPG", t0.ccode, firstTcode);
                          if (target && location.pathname !== target) {
                            navigate(target, { replace: true });
                          }
                        } else if (/\/inscritos/i.test(location.pathname)) {
                          // Fallback: torneio sem ccode/tcode válido → sair de /inscritos
                          navigate("/FPG/jovens");
                        }
                      }}
                      accentColor={SIDEBAR_ACCENT.tour}
                      extraPills={
                        <span className="flex-wrap" style={{ display: "inline-flex", gap: 3, marginTop: 2 }}>
                          {g.isRegional && !g.isNacional && <PillBadge pill="REGIONAL" />}
                          {g.entries.map(e => (
                            <EscPill key={e.tcode} esc={e.escalao ?? ""} />
                          ))}
                        </span>
                      }
                      footer={
                        <div className="mt-3" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {regionLabel && (
                            <span className="fs-10 fw-600" style={{ padding: "1px 6px",
                              borderRadius: 10, background: "var(--bg-hover)", color: "var(--text-2)",
                              border: "1px solid var(--border)" }}>
                              {regionLabel}
                            </span>
                          )}
                          <span className="fs-11 c-muted">{ddmm}</span>
                        </div>
                      }
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="course-detail" ref={md.detailRef}>
            {jovensShowAnalise ? (
              // Análise foi migrada para /titulos em 2026-05-04 — qualquer
              // entrada residual nesta vista redirecciona automaticamente.
              <Navigate to="/titulos/nacional" replace />
            ) : jovensShowInscricoes ? (
              <InscricoesPanel />
            ) : curJovensGroup ? (
              <>
                {/* Tabs por escalão — fundo com a cor do escalão (tokens --esc-subN-*).
                    Quando o grupo tem tanto M como F, border da cor do sexo (azul/rosa).
                    Se o grupo tem só um sexo, sem border (não é preciso distinguir). */}
                {curJovensGroup.entries.length > 1 && (
                  <div style={{ display: "flex", gap: 4, padding: "8px 12px 0", flexWrap: "wrap",
                    borderBottom: "1px solid var(--border-light)", background: "var(--bg-card)" }}>
                    {curJovensGroup.entries.map((e, ri) => {
                      const active = jovensEscIdx === ri;
                      // Estilo default (.tourn-tab / .active) — SEM cores do escalão
                      // (ver memória "Sem cores nos botões de escalão"). Os pills
                      // na sidebar continuam coloridos; só aqui nos botões é default.
                      // Label: _tabLabel (override p/ torneios combinados "Sub 10 e 12"
                      // ou "Sub 14 a 24") → escalao → fallback "Esc N".
                      const label = (e as any)._tabLabel ?? e.escalao ?? "Esc " + (ri + 1);
                      return (
                        <button key={e.tcode + "_" + ri}
                          className={`tourn-tab tourn-tab-sm${active ? " active" : ""}`}
                          onClick={() => setJovensEscIdx(ri)}
                          style={{ marginBottom: 6 }}>
                          {label}
                          <span className="fs-10" style={{ marginLeft: 3, opacity: 0.8 }}>
                            ({(e.playerCount || e.players.length)} jog)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {curJovens
                  ? <TournamentDetail tournament={curJovens} escLookup={escLookup} playersDB={playersDB} extraTabs={fpgExtraTabs(editionsIndex, curJovens, playersDB)} />
                  : <div className="center-msg muted">Selecciona um torneio</div>
                }
              </>
            ) : (
              !jovensLoading && (
                jovensLoaded
                  ? <div className="center-msg muted">Selecciona um torneio</div>
                  : <LoadingState size="sm" message="A carregar…" />
              )
            )}
          </div>
        </div>
      )}

      {/* Ranking Sub-12 (e abaixo) — métrica de differential sem componente de
          HCP, porque as voltas são quase todas de 9 buracos e os campos variam
          muito. Ver scripts/build-sub12-ranking.js. */}
      {navMode === "ranking-sub12" && (
        <div className="flex-1" style={{ overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
          <PJARankingView
            pjaList={sub12Tournaments}
            playersDB={playersDB}
            loading={sub12Loading}
            externalFilterName={searchQuery}
            specialRules={false}
            metric="sd"
            showMeters
            hcpFilterMax={25}
            emptyLabel="Sem torneios Sub-12."
          />
        </div>
      )}

      {/* CLASSIFICAÇÕES — ranking do calendário dos jogadores de referência
          (ver scripts/build-classificacoes.js). Reusa a vista do ranking PJA
          com as regras específicas do circuito PJA desligadas. */}
      {navMode === "classificacoes" && (
        <div className="flex-1" style={{ overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
          <PJARankingView
            pjaList={classifTournaments}
            playersDB={playersDB}
            loading={classifLoading}
            externalFilterName={searchQuery}
            specialRules={false}
            emptyLabel="Sem torneios para classificar."
          />
        </div>
      )}

      {/* Ranking PJA */}
      {navMode === "ranking-pja" && (
        <div className="flex-1" style={{ overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
          <PJARankingView pjaList={pjaRankingList} playersDB={playersDB} loading={loading} pjaMembersByYear={pjaMembers} pjaPdfSnapshotByYear={pjaPdfSnapshot} externalFilterName={searchQuery} />
        </div>
      )}
    </div>
    </DataSourcesProvider>
  );
}

export default function TorneiosAnalisePage() {
  return <Content />;
}
