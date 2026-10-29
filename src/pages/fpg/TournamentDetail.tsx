/**
 * TournamentDetail.tsx — Componente que renderiza o detalhe de UM torneio FPG.
 *
 * Reusável por qualquer página que mostre torneios FPG individuais. Decide
 * automaticamente as tabs disponíveis (Inscrições → Draw R1 → R1 → Draw R2
 * → R2 → ... → Resumo → Scorecards) com base nos dados disponíveis no
 * objecto Tournament: `_admissions`, `_draws.{1,2,3}`, `players[]`, etc.
 *
 * Antes vivia inline em FPGPage.tsx (linhas 542-872) — extraído para reduzir
 * o ficheiro principal e permitir reuso.
 */
import type { CircuitRoundDraw } from "../../ui/circuit/types";
import { roundDrawNode } from "../../ui/circuit/divisionPieces";
import { ShareRoundsPanel, RoundAnalysisFor } from "../../ui/ShareRoundPanel";
import ManuelResultPills from "../../ui/ManuelResultPills";
import React, { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Tournament, ScorecardOptions } from "../../data/fpgTypes";
import type { EscLookup } from "../../utils/playerUtils";
import type { PlayersDB } from "../../ui/tournamentPrimitives";
import type { MultiRoundRow } from "../../ui/multiRoundTypes";
import { expandMultiRound, synthesizeDrawFromCumulative } from "../../data/fpgUtils";
import { tournamentHasManuel, tournamentPccs } from "../../data/fpgUtils";
import { fmtDate, fpgAdmissionsUrl, fpgDrawUrl, fpgScoringUrl, tournamentUrl, norm } from "../../utils/format";
import { FEATURED_TOURNAMENTS } from "../../data/featuredTournaments";
import { useLiveAdmissions } from "../../hooks/useLiveAdmissions";
import {
  EscPill, RoundPill, NineHPill, SserraPill, NacionalPill, JuniorPill,
  ClubePill, ManuelPill, OmPill, PccPill,
} from "../../ui/PillBadge";
import { omLevelOf, useOmData, buildOmLookup } from "./fpgOmRanking";
import { SSERRA_CCODE } from "../../ui/TournSidebarItem";
import { LinksBar } from "../../ui/LinksBar";
import { ScorecardLB, AccumulatedLB, AllRoundsScorecardLB } from "../../ui/LeaderboardComponents";
import Aroeira2AnaliseView from "../../ui/Aroeira2AnaliseView";
import AdmissionsTab from "../../ui/AdmissionsTab";
import { teeRuleFor } from "../../utils/teeRegulation";
import DrawTab, { buildDrawResults } from "../../ui/DrawTab";
import { TOURNAMENT_EXTRA_LINKS } from "./constants";
import { initialTabIndex } from "./detailTabs";
import { crossApuradosInscritos } from "../../data/drive/driveCircuitData";
import type { FpgAdmissions } from "../../data/nacional2026Loader";

/** Junta listas de links extra removendo repetidos pelo URL (a mesma página do
 *  clube pode vir do synthetic FEATURED e da config ao mesmo tempo). */
function dedupLinks(links: Array<{ label: string; url: string; icon?: string }>) {
  const seen = new Set<string>();
  return links.filter(l => !seen.has(l.url) && seen.add(l.url));
}

type TabContent = { key: string; label: string; content: React.ReactNode };

/** Tudo o que uma página de torneio pode ligar — O ÚNICO componente de detalhe
 *  de torneio da app (FPG, Drive, MAJOR, França, Espanha, Global Junior…; o
 *  IntlTournView é só um adaptador). Cada página esconde o que não precisa. */
export interface TournamentDetailProps {
  tournament: Tournament;
  escLookup: EscLookup;
  playersDB: PlayersDB;
  options?: ScorecardOptions;
  /** Tabs DEPOIS das voltas/Resumo/Scorecards (Match Play, Edições anteriores…). */
  extraTabs?: TabContent[];
  /** Tabs ANTES de tudo (ex.: Inscritos de uma fonte internacional). */
  leadingTabs?: TabContent[];
  /** Draws desenhados pela página (fontes internacionais), por volta — entram
   *  como «Draw R{n}» antes da volta n, em vez do DrawTab FPG. */
  roundDraws?: CircuitRoundDraw[];
  /** Etiquetas próprias das voltas (ex.: «R1 · 25 Fev»). */
  roundLabels?: string[];
  /** Etiqueta da linha de SI no scorecard (ex.: «m»). */
  siLabel?: string;
  accShowCols?: { esc?: boolean; fed?: boolean; tee?: boolean; club?: boolean; hcp?: boolean; age?: boolean; birthYear?: boolean };
  accExtraColumns?: React.ComponentProps<typeof AccumulatedLB>["extraColumns"];
  /** Por cima / por baixo do Resumo. */
  accHeader?: React.ReactNode;
  accExtra?: React.ReactNode;
  /** Por baixo de cada volta (índice da volta, 0 = R1). */
  roundExtra?: (roundIndex: number) => React.ReactNode;
  /** Substituição total das secções (recebem o leaderboard já montado). */
  renderRoundSection?: (leaderboard: React.ReactNode, roundIndex: number) => React.ReactNode;
  renderAccSection?: (leaderboard: React.ReactNode) => React.ReactNode;
  /** Nome no Resumo (ex.: bandeira + seta kids2). */
  renderAccName?: (row: MultiRoundRow) => React.ReactNode;
  drawHideCols?: React.ComponentProps<typeof DrawTab>["hideCols"];
  hideHeader?: boolean;
  /** Prever o draw da próxima volta a partir do acumulado (regra FPG). Default true. */
  synthDraws?: boolean;
  /** Parâmetro do URL que guarda a aba (default «tab»; a /uskids usa «tab»
   *  para as suas abas e passa outro). */
  tabParam?: string;
  /** Aba a abrir quando o URL não traz nenhuma (ex.: «grupos» nos torneios de
   *  clubes). Sem ela, abre na fase mais avançada do torneio. */
  defaultTab?: string;
}

function TournamentDetail({ tournament, escLookup, playersDB, extraTabs, leadingTabs, roundDraws, roundLabels, siLabel, options, accShowCols, accExtraColumns, accHeader, accExtra, roundExtra, renderRoundSection, renderAccSection, renderAccName, drawHideCols, hideHeader, synthDraws = true, tabParam = "tab", defaultTab }: TournamentDetailProps) {
  const isMulti = (tournament.rounds || 1) > 1 && tournament.players.some(p => (p.roundScores?.length ?? 0) > 1);
  const nRounds = tournament.rounds || 1;
  const hasAnyRounds = (tournament.players?.length ?? 0) > 0;

  // Dados extra (admissions + draws) — injectados no loader Jovens
  const admissions = tournament._admissions;
  const draws      = tournament._draws;

  // ── Verificação LIVE das inscrições (torneios FEATURED futuros) ──────────
  // Ao abrir o detalhe de um torneio em destaque ainda não jogado, chama
  // /api/inscricoes (proxy) para buscar a lista ACTUAL de inscritos na FPG,
  // compara com o último scrape (fpg-admissions-draws.json) e mostra
  // "+N novos / −N saíram". A lista live substitui a scraped na tab
  // Inscrições; se o live falhar (cookies expirados, offline) cai no scrape.
  // Elegível para live: (a) está na config FEATURED (respeitando `live: false`),
  // ou (b) é um torneio sintético admissions-only (injectado a partir do
  // fpg-admissions-draws.json — inclui os Drive/jovens auto-detectados).
  // Em ambos os casos só enquanto não houver rondas jogadas.
  const featured = FEATURED_TOURNAMENTS.find(
    f => f.ccode === tournament.ccode && f.tcode === String(tournament.tcode));
  const syntheticAdm = tournament._sourceFile === "fpg-admissions-draws.json";
  // Inscrições já encerradas no último scrape → não vale a pena ir ao live
  // (a lista não muda mais e a FPG deixa de a servir): evita fetches inúteis.
  const admissionsClosed = /fechad|encerrad/i.test(admissions?.status || "");
  const liveEnabled = (featured ? featured.live !== false : syntheticAdm) && !hasAnyRounds && !admissionsClosed;
  const live = useLiveAdmissions(tournament.ccode, tournament.tcode, liveEnabled);
  const liveActive = live.status === "live" && live.players.length > 0;
  // Lista de convocados (final Drive): a lista live cruza-se outra vez com os
  // convocados — quem não está inscrito continua convocado, não «saiu».
  const convocados = admissions?._apuradosBase;
  const effAdmissions = useMemo(() => (liveActive
    ? convocados
      ? crossApuradosInscritos<FpgAdmissions>({ players: convocados }, { ...(admissions || {}), players: live.players, error: undefined })
      : { ...(admissions || {}), players: live.players, totalInscritos: live.players.length, reservas: 0, error: undefined }
    : admissions), [liveActive, admissions, convocados, live.players]);
  const admissionsDiff = useMemo(() => {
    if (!liveActive) return null;
    // Convocados: compara só com quem já estava inscrito no último scrape.
    const scraped = (admissions?.players ?? []).filter(p => !convocados || p.status === "confirmed");
    if (scraped.length === 0) return null;
    const keyOf = (p: { fed: string | null; nome: string }) => p.fed || norm(p.nome || "");
    const liveKeys = new Set(live.players.map(keyOf));
    const scrKeys = new Set(scraped.map(keyOf));
    return {
      novos: live.players.filter(p => !scrKeys.has(keyOf(p))),
      saidos: scraped.filter(p => !liveKeys.has(keyOf(p))),
    };
  }, [liveActive, live.players, admissions, convocados]);

  const hasAdmissions = !!effAdmissions && !effAdmissions.error && (effAdmissions.players?.length ?? 0) > 0;
  const drawsByRound = useMemo(() => {
    const out = new Map<number, import("../../data/nacional2026Loader").FpgDraw>();
    if (draws) for (const [k, d] of Object.entries(draws)) {
      if (d && (d.groups?.length ?? 0) > 0) out.set(parseInt(k, 10), d);
    }
    // Sintetizar o draw da PRÓXIMA ronda ainda não jogada, a partir do
    // leaderboard acumulado (regra FPG: 1º+2º+3º acumulado juntos, depois
    // 4º+5º+6º…). É uma PREVISÃO — só faz sentido para a ronda que está prestes
    // a sair (torneio a decorrer), quando a FPG ainda não publicou o draw
    // oficial. O DrawTab mostra um aviso (note) a indicar que é estimado.
    //
    // ⚠ NUNCA sintetizar o draw de uma ronda JÁ JOGADA: nesse caso o
    // emparelhamento real existiu (e está na FPG) e a estimativa seria
    // enganadora — foi o que acontecia em torneios concluídos, que mostravam
    // um "Draw R2" fabricado apesar de a R2 já ter sido disputada.
    const nR = tournament.rounds || 1;
    const playedRounds = Math.max(0, ...(tournament.players ?? []).map(p => p.roundScores?.length ?? 0));
    const nextRound = playedRounds + 1;
    if (synthDraws && nextRound >= 2 && nextRound <= nR && !out.has(nextRound)) {
      const synth = synthesizeDrawFromCumulative(tournament, nextRound);
      if (synth && (synth.groups?.length ?? 0) > 0) out.set(nextRound, synth);
    }
    return out;
  }, [draws, tournament, synthDraws]);
  // Draws desenhados pela página (internacionais) — ganham ao DrawTab FPG.
  const customDraw = useMemo(() => new Map((roundDraws ?? []).map((d) => [d.round, () => roundDrawNode(d)] as const)), [roundDraws]);
  const hasDraw = (r: number) => drawsByRound.has(r) || customDraw.has(r);
  const allDrawRounds = useMemo(() => [...new Set([...drawsByRound.keys(), ...customDraw.keys()])].sort((a, b) => a - b), [drawsByRound, customDraw]);

  // Expanded list: R1, R2, ..., Resumo
  const expanded = useMemo(() => expandMultiRound(tournament), [tournament]);

  // ── Pré-Cut ── (vem do expandMultiRound: _cutAfterRound no Resumo). Cut após
  // a R1 não gera tab (seria igual à própria R1).
  const cutAfterRound = useMemo(() => {
    const tot = expanded.find((t: any) => t._isTotal) as { _cutAfterRound?: number } | undefined;
    const n = tot?._cutAfterRound;
    return n != null && n >= 2 ? n : undefined;
  }, [expanded]);
  /** Classificação no momento do cut: quem tem score válido em TODAS as voltas
   *  1..cut, só com essas voltas (sem isso, quem faltou a uma volta ficava com
   *  toPar absurdo e em 1º). */
  const preCutTourn = useMemo(() => {
    if (!cutAfterRound) return null;
    const wanted = Array.from({ length: cutAfterRound }, (_, i) => i + 1);
    const trimmed = tournament.players.map((p) => {
      const rs = (p.roundScores || []).filter((r) => r.round <= cutAfterRound);
      const hasAll = wanted.every((rd) => rs.some((r) => r.round === rd && (r.gross || 0) > 0 && (r.gross || 0) < 900));
      const parPerRound = p.parTotal || (rs[0]?.pars?.reduce((a, b) => a + b, 0) || 0);
      const gross = rs.reduce((x, r) => x + (r.gross || 0), 0);
      return { ...p, roundScores: rs, grossTotal: gross, toPar: gross - parPerRound * cutAfterRound, parTotal: parPerRound,
        _wd: false, _cut: false, _incomplete: false, _roundsPlayed: cutAfterRound, _hasAll: hasAll };
    }).filter((p) => p._hasAll);
    trimmed.sort((a, b) => (a.grossTotal ?? 99999) - (b.grossTotal ?? 99999));
    let pos = 1;
    trimmed.forEach((p, i) => { if (i > 0 && (p.grossTotal ?? 0) !== (trimmed[i - 1].grossTotal ?? 0)) pos = i + 1; (p as any)._pos = pos; });
    return { ...tournament, players: trimmed, rounds: cutAfterRound, _roundLabel: `Resumo Pré-Cut (R1–R${cutAfterRound})`, _isTotal: true } as unknown as Tournament;
  }, [tournament, cutAfterRound]);
  /** Etiqueta da volta i (0 = R1): a da página, a do expandMultiRound ou «R{n}». */
  const roundLabel = (i: number, fallback: string) => roundLabels?.[i] || fallback;
  /**
   * Ordem canónica das tabs:
   *   Inscrições → Draw R1 → R1 → Draw R2 → R2 → Draw R3 → R3 → Resumo → 📋 Scorecards
   * Só aparecem tabs cujos dados existem.
   *
   * Internamente cada tab é identificada por uma chave:
   *   "admissions", "draw:N" (N=1..3), "round:I" (I=índice em expanded, exclui Resumo),
   *   "resumo", "scorecards"
   */
  const COMBINED_TAB = "📋 Scorecards";
  type TabDef = { key: string; label: string };
  const tabs: TabDef[] = useMemo(() => {
    const out: TabDef[] = [];
    for (const lt of leadingTabs ?? []) out.push({ key: lt.key, label: lt.label });
    if (hasAdmissions) out.push({ key: "admissions", label: "Inscrições" });
    if (isMulti) {
      // expanded é [R1, R2, ..., RN, Resumo] — últio elemento é o Resumo.
      const rondas = expanded.filter((e: any) => !e._isTotal);
      const temResumo = expanded.some((e: any) => e._isTotal);
      for (let i = 0; i < rondas.length; i++) {
        const roundNum = i + 1;
        if (hasDraw(roundNum)) {
          out.push({ key: `draw:${roundNum}`, label: `Draw R${roundNum}` });
        }
        out.push({ key: `round:${i}`, label: roundLabel(i, (rondas[i] as any)._roundLabel || `R${roundNum}`) });
        if (cutAfterRound && roundNum === cutAfterRound && rondas.length > cutAfterRound) out.push({ key: "precut", label: `Pré-Cut R1–R${cutAfterRound}` });
      }
      // Draws de rondas FUTURAS ainda sem scores (ex: Draw R3 publicado na
      // véspera com R1-R2 jogadas — Reid Trophy) — o loop acima só intercala
      // draws de rondas que JÁ têm dados. O ramo de 1 ronda já fazia isto.
      const futureDrawsMulti = allDrawRounds.filter(r => r > rondas.length);
      for (const r of futureDrawsMulti) out.push({ key: `draw:${r}`, label: `Draw R${r}` });
      if (temResumo) out.push({ key: "resumo", label: "Resumo" });
      // Sem cartão buraco a buraco (ex.: RFEG só PDF → _noHbh) não há Scorecards.
      if (!(tournament as { _noHbh?: boolean })._noHbh) out.push({ key: "scorecards", label: COMBINED_TAB });
      // Tab "Análise Aroeira II" — só para o PJA Aroeira Masters 2026 (029/10543)
      if (tournament.ccode === "029" && tournament.tcode === "10543") {
        out.push({ key: "analise-aroeira2", label: "🎯 Análise" });
      }
    } else if (hasAnyRounds) {
      // 1-round OU multi-round parcialmente jogado (ex: R1 com scorecards, R2
      // ainda só draw publicado). Mostrar:
      //   - Draw R1 (se existir) → Scorecard (R1) → Draw R2..N (se houver)
      if (hasDraw(1)) out.push({ key: "draw:1", label: "Draw R1" });
      // «R1» também quando já há draw de uma volta seguinte (Faldo Madeira:
      // só a R1 jogada, Draw R2 publicado) — dizia «Scorecard» (16/10/2026).
      out.push({ key: "round:0", label: roundLabel(0, nRounds > 1 || allDrawRounds.some(r => r >= 2) ? "R1" : "Scorecard") });
      // Draws de rondas futuras ainda não jogadas (R2, R3, ...)
      const futureDraws = allDrawRounds.filter(r => r >= 2);
      for (const r of futureDraws) {
        out.push({ key: `draw:${r}`, label: `Draw R${r}` });
      }
      // Em torneios multi-ronda, mostrar SEMPRE Resumo + 📋 Scorecards, mesmo
      // que só uma ronda esteja jogada. As rondas ainda não disputadas aparecem
      // como "–" no Resumo (AccumulatedLB) e são omitidas no combinado
      // (AllRoundsScorecardLB). Assim a página fica consistente com torneios já
      // concluídos e o utilizador não precisa de esperar pela última ronda.
      if (nRounds > 1) {
        out.push({ key: "resumo", label: "Resumo" });
        if (!(tournament as { _noHbh?: boolean })._noHbh) out.push({ key: "scorecards", label: COMBINED_TAB });
      }
    } else {
      // Sem rondas jogadas — pode ter só draws (torneio prestes a começar)
      const drawKeys = allDrawRounds;
      for (const r of drawKeys) out.push({ key: `draw:${r}`, label: `Draw R${r}` });
    }
    // Tabs extra injectadas pelo parent (ex: scorecards de match play)
    for (const et of extraTabs ?? []) {
      if (!out.some(t => t.key === et.key)) out.push({ key: et.key, label: et.label });
    }
    return out;
  }, [hasAdmissions, isMulti, expanded, drawsByRound, hasAnyRounds, extraTabs, leadingTabs, allDrawRounds, roundLabels, cutAfterRound, tournament]);

  // Tab activa = URL state (?tab=KEY). Permite deep-links como
  //   /FPG/torneio/000-10935?tab=draw:1   → abre directo no Draw R1
  //   /FPG/torneio/000-10935?tab=admissions
  // Quando o URL não traz `tab` (ou traz uma key que não existe neste torneio)
  // selecciona-se o tab mais avançado na progressão natural do torneio:
  //   Inscrições → Draw R1 → R1 → Draw R2 → R2 → ... → Resumo
  // Assim, quem abre o torneio vai sempre para a fase mais recente disponível
  // (admissions enquanto só houver inscrições, draw R1 quando o sorteio sair,
  // R1 quando se jogar, draw R2 quando publicado, etc.). Os tabs de agregação
  // ("📋 Scorecards", "🎯 Análise") são vistas alternativas e ficam fora do
  // auto-select — quem quer essas vai por link explícito.
  const [searchParams] = useSearchParams();
  const urlTabKey = searchParams.get(tabParam);
  const lastProgressionIdx = useMemo(() => {
    // "matchplay" fora do auto-select: o default fica no Resumo (regra global);
    // a fase knockout vê-se por clique explícito na tab "Match Play".
    const SKIP = new Set(["scorecards", "analise-aroeira2", "matchplay", "precut"]);
    // As tabs extra injectadas pelo parent (Época, Edições anteriores, …) são
    // vistas SUPLEMENTARES — nunca podem ser o auto-default, senão um torneio
    // com resultados abre na "Época" (vazia) em vez do Resumo. Vêm no fim da
    // barra (a seguir a Scorecards) e só se abrem por clique / ?tab= explícito.
    const extraKeys = new Set([...(extraTabs ?? []), ...(leadingTabs ?? [])].map(et => et.key));
    for (let i = tabs.length - 1; i >= 0; i--) {
      if (!SKIP.has(tabs[i].key) && !extraKeys.has(tabs[i].key)) return i;
    }
    return 0;
  }, [tabs, extraTabs, leadingTabs]);
  const tab = initialTabIndex(tabs, urlTabKey, defaultTab, lastProgressionIdx);

  const activeTab = tabs[Math.min(tab, Math.max(0, tabs.length - 1))];
  const activeKey = activeTab?.key || "";
  const isAdmissionsTab = activeKey === "admissions";
  const isDrawTab = activeKey.startsWith("draw:");
  const drawRoundNum = isDrawTab ? parseInt(activeKey.slice(5), 10) : 0;
  const isResumoTab = activeKey === "resumo";
  const isCombinedTab = activeKey === "scorecards";
  const isAnaliseAroeiraTab = activeKey === "analise-aroeira2";
  const isPreCutTab = activeKey === "precut";
  const isRoundTab = activeKey.startsWith("round:");
  const roundIdx = isRoundTab ? parseInt(activeKey.slice(6), 10) : 0;

  // Resultados da ronda do draw activo — cruzados com os emparelhamentos no
  // DrawTab para preencher as colunas ± (toPar) e Tot (gross). Indexado por
  // `fed` (autoritativo) E por nome normalizado, para o lookup funcionar quer o
  // draw resolva o fed quer só tenha nome. Só entram rondas já jogadas (gross
  // numérico > 0); rondas futuras ficam de fora → DrawTab mostra "–".
  const drawResults = useMemo(
    () => (isDrawTab ? buildDrawResults(tournament.players, drawRoundNum) : undefined),
    [isDrawTab, drawRoundNum, tournament],
  );

  // Ordem de Mérito CGSS — nos torneios do clube (ccode 007) carregamos o
  // om-cgss-junior.json (que traz o roster das 5 categorias) e passamos um
  // lookup ao DrawTab, que ganha a coluna "OM".
  const isCgss = String(tournament.ccode ?? "").padStart(3, "0") === "007";
  const omData = useOmData(isCgss);
  const omLookup = useMemo(() => buildOmLookup(omData), [omData]);

  // curT só é relevante para round/resumo tabs (lógica existente)
  const expandedIdxForCurT = isResumoTab
    ? expanded.findIndex((e: any) => e._isTotal)
    : isRoundTab
      ? expanded.findIndex((e: any, i: number) => !e._isTotal && expanded.filter((x: any, j: number) => !x._isTotal && j <= i).length === roundIdx + 1)
      : -1;
  const curT = expandedIdxForCurT >= 0 && expanded[expandedIdxForCurT] ? expanded[expandedIdxForCurT] : tournament;
  const isAcc = isResumoTab;
  const isCombined = isCombinedTab;
  // «📷 Partilhar volta» no Resumo / Scorecards / Draw: torneio completo + cada
  // volta já jogada (no Draw da volta seguinte também — o Faldo abre aí).
  const shareRounds = isResumoTab || isCombinedTab || isDrawTab
    ? <ShareRoundsPanel key={tournament.tcode} rounds={isMulti ? expanded.filter((e: any) => !e._isTotal) : [tournament]} event={options?.shareEvent} course={options?.shareCourse} date={options?.shareDate} analysis={isResumoTab} />
    : null;

  // Info about tournament
  const refPlayer = tournament.players[0];
  const nholes = refPlayer?.nholes || refPlayer?.par?.length || refPlayer?.roundScores?.[0]?.pars?.length || 18;
  const parTotal = refPlayer?.parTotal || refPlayer?.par?.reduce((a, b) => a + b, 0) || refPlayer?.roundScores?.[0]?.pars.reduce((a, b) => a + b, 0) || 0;

  // Seta ↗ para KIDS2 no Resumo: o AccumulatedLB não lê `options` (ao contrário
  // do ScorecardLB/AllRoundsScorecardLB), mas aceita um `renderName`. Quando o
  // caller injecta um `nameDecorator` (páginas MAJOR — ver MajorPage), aplicá-lo
  // também aqui. Base = nome a bold, igual ao fallback do MultiRoundLeaderboard
  // quando não há playersDB (o caso das fontes internacionais).
  const accRenderName = useMemo(
    () => renderAccName ?? (options?.nameDecorator
      ? (row: MultiRoundRow) => options.nameDecorator!(row.name, <span className="fw-700">{row.name}</span>)
      : undefined),
    [options, renderAccName],
  );

  return (
    <div>
      {/* Cabeçalho — escondido quando o parent já desenha um header próprio
          (ex: o CircuitShell da página MAJOR, que mostra o nome do torneio +
          campo + pills por cima deste TournamentDetail). */}
      {!hideHeader && (
      <div className="detail-header">
        <div className="flex-wrap gap-8" style={{ display: "flex", alignItems: "center" }}>
          {/* Título clicável: link canónico `/FPG/torneio/{ccode}-{tcode}`.
              Preserva right-click "abrir em nova aba", Ctrl/Cmd+click, middle-click,
              preview de URL. O próprio h2 continua visualmente inalterado. */}
          {(() => {
            const canonicalUrl = tournamentUrl("FPG", tournament.ccode, tournament.tcode);
            return canonicalUrl ? (
              <a
                href={canonicalUrl}
                title="Link canónico do torneio (abrir em nova aba para partilhar)"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "inherit", textDecoration: "none" }}>
                <h2 className="detail-title" style={{ margin: 0 }}>{tournament.name}</h2>
              </a>
            ) : (
              <h2 className="detail-title" style={{ margin: 0 }}>{tournament.name}</h2>
            );
          })()}
          <div className="gap-4" style={{ display: "flex", alignItems: "center" }}>
            {tournament.ccode && (
              <span title="tclub" className="fs-10 fw-600 mono" style={{
                background: "var(--bg-hover)", color: "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: 4, padding: "1px 6px", letterSpacing: "0.02em",
                userSelect: "all", cursor: "text",
              }}>
                {tournament.ccode}
              </span>
            )}
            {tournament.tcode && !featured?.semLinksFpg && (
              <span title="tcode" className="fs-10 fw-700 mono" style={{
                background: "var(--accent)", color: "#fff",
                borderRadius: 4, padding: "1px 6px", letterSpacing: "0.02em",
                userSelect: "all", cursor: "text",
              }}>
                {tournament.tcode}
              </span>
            )}
          </div>
          {/* Links oficiais À DIREITA do título, como nas outras secções
              (CircuitShell: «Leaderboard oficial ↗») — 14/10/2026. */}
          <div className="gap-4" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
            {/* Botões INSCRIÇÕES + DRAW + SCORING — todos mesmo tamanho/estilo.
                Uniformizados para consistência em todas as páginas de torneio. */}
            {tournament._isSynthetic
              ? (tournament._subRounds ?? []).map((sr, i) => (
                  sr.ccode && sr.tcode
                    ? <React.Fragment key={sr.tcode}>
                        <a href={fpgAdmissionsUrl(sr.ccode, sr.tcode)}
                          target="_blank" rel="noopener noreferrer"
                          title={`Inscrições do Dia ${i + 1}`}
                          className="tourn-ext-link">
                          Inscrições D{i + 1} ↗
                        </a>
                        <a href={fpgDrawUrl(sr.ccode, sr.tcode)}
                          target="_blank" rel="noopener noreferrer"
                          title={`Draw do Dia ${i + 1}`}
                          className="tourn-ext-link">
                          Draw D{i + 1} ↗
                        </a>
                        <a href={fpgScoringUrl(sr.ccode, sr.tcode)}
                          target="_blank" rel="noopener noreferrer"
                          title={`Classificação do Dia ${i + 1}`}
                          className="tourn-ext-link">
                          Scoring D{i + 1} ↗
                        </a>
                      </React.Fragment>
                    : null
                ))
              : tournament.ccode && tournament.tcode && !featured?.semLinksFpg && (
                  <>
                    <a href={fpgAdmissionsUrl(tournament.ccode, tournament.tcode)}
                      target="_blank" rel="noopener noreferrer"
                      title="Inscrições (tournAdmissions) na Federação"
                      className="tourn-ext-link">
                      Inscrições ↗
                    </a>
                    <a href={fpgDrawUrl(tournament.ccode, tournament.tcode)}
                      target="_blank" rel="noopener noreferrer"
                      title="Emparelhamentos (Draw) na Federação"
                      className="tourn-ext-link">
                      Draw ↗
                    </a>
                    <a href={fpgScoringUrl(tournament.ccode, tournament.tcode)}
                      target="_blank" rel="noopener noreferrer"
                      title="Classificação (Scoring) na Federação"
                      className="tourn-ext-link">
                      Scoring ↗
                    </a>
                  </>
                )
            }
            {/* Links extra específicos do torneio — regulamento, página do
                clube/evento, etc. Três fontes, deduplicadas por URL:
                  1. Tournament.extraLinks (enxertado do synthetic FEATURED)
                  2. a config FEATURED directamente — fallback obrigatório: quando
                     os resultados reais chegam, a versão com resultados ganha o
                     dedup e pode não trazer extraLinks; sem este fallback os
                     links do clube desapareciam a meio da prova
                  3. TOURNAMENT_EXTRA_LINKS (mapa avulso em fpg/constants.ts) */}
            {dedupLinks([
              ...(tournament.extraLinks || []),
              ...(featured?.extraLinks || []),
              ...(TOURNAMENT_EXTRA_LINKS[`${tournament.ccode}-${tournament.tcode}`] || []),
            ]).map((lnk) => (
              <a key={lnk.url} href={lnk.url}
                target="_blank" rel="noopener noreferrer"
                title={lnk.label}
                className="tourn-ext-link">
                {lnk.icon ? `${lnk.icon} ` : ""}{lnk.label} ↗
              </a>
            ))}
          </div>
        </div>
        <div className="detail-sub">
          {tournament.campo && <span className="muted">📍 {tournament.campo}</span>}
          <span className="muted ml-8" >{fmtDate(tournament.date)}</span>
          {/* Pills individuais — reutilizam os componentes globais (consistência com a sidebar).
              Ordem: stats básicos (jog, ronda, 9H, par) → características do torneio (escalão,
              NACIONAL, JUNIOR, SSerra, Clube, Manuel). */}
          <span className="gap-4 ml-8" style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap" }}>
            {tournament.playerCount != null && (
              <span className="p p-sm" style={{ background: "var(--bg-muted)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                {tournament.playerCount} jog
              </span>
            )}
            {nRounds > 1 && <RoundPill nR={nRounds} />}
            {nholes <= 9 && <NineHPill />}
            {parTotal > 0 && (
              <span className="p p-sm" style={{ background: "var(--bg-muted)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                Par {parTotal}
              </span>
            )}
            {tournament.escalao && <EscPill esc={tournament.escalao} />}
            {/NACIONAL/i.test(tournament.name || "") && <NacionalPill />}
            {/JUNIOR|J[ÚU]NIOR/i.test(tournament.name || "") && <JuniorPill />}
            {tournament.ccode === SSERRA_CCODE && <SserraPill />}
            {tournament.ccode !== SSERRA_CCODE && <ClubePill clube={tournament.clube} ccode={tournament.ccode} />}
            {omLevelOf(tournament) && <OmPill level={omLevelOf(tournament)} />}
            {tournamentPccs(tournament).map(x => <PccPill key={x.round} pcc={x.pcc} round={nRounds > 1 ? x.round : undefined} />)}
            {tournamentHasManuel(tournament) && <ManuelPill />}
          </span>

        </div>
        {/* Resultado do Manuel — as mesmas pílulas de todas as secções. */}
        <ManuelResultPills tournament={tournament} />
        <LinksBar links={tournament.links} escalao={tournament.escalao} />
      </div>
      )}

      {/* Nota editorial do torneio (_note) — usada para contexto cross-torneio
          (ex: "alguns jogadores jogaram simultaneamente no Absoluto").
          Estilo de ALERTA (amber/warning) para chamar à atenção. */}
      {(tournament as any)._note && (
        <div className="fs-12 fw-600" style={{
          padding: "10px 14px", margin: "8px 12px",
          background: "var(--bg-warn-subtle, #fef3c7)",
          border: "1px solid var(--color-warn, #f59e0b)",
          borderRadius: 6,
          color: "var(--text-1, #1f2937)", lineHeight: 1.45,
        }}>
          ⚠️ {(tournament as any)._note}
        </div>
      )}

      {/* Tabs renderizadas como Link → cada tab tem URL próprio (?tab=KEY),
          deep-linkable e copiável via right-click. Só mostra se há >1 tab. */}
      {tabs.length > 1 && (
        <div className="tab-bar">
          {tabs.map((t, i) => {
            const sp = new URLSearchParams(searchParams);
            sp.set(tabParam, t.key);
            return (
              <Link
                key={t.key}
                to={{ search: `?${sp.toString()}` }}
                replace
                className={`tab-under${tab === i ? " active" : ""}`}
                style={{ textDecoration: "none" }}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Conteúdo */}
      {(() => {
        // Extra tab injectada pelo parent (ex: scorecards de match play)
        const extraTab = [...(extraTabs ?? []), ...(leadingTabs ?? [])].find(et => et.key === activeKey);
        if (extraTab) return extraTab.content;
        if (isAdmissionsTab && effAdmissions)
          return <>
            {/* Barra de estado da verificação live (só torneios FEATURED futuros) */}
            {liveEnabled && (
              <div className="fs-12" style={{ padding: "8px 12px 0", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {live.status === "loading" && <span className="muted">⏳ a verificar inscrições na FPG…</span>}
                {liveActive && (
                  <span className="fw-600" style={{ color: "var(--color-good)" }}>
                    🟢 live FPG
                    {live.fetchedAt ? ` · ${new Date(live.fetchedAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}` : ""}
                    {` · ${live.players.length} inscritos`}
                  </span>
                )}
                {liveActive && admissionsDiff && (
                  (admissionsDiff.novos.length > 0 || admissionsDiff.saidos.length > 0) ? (
                    <span className="fw-600">
                      {admissionsDiff.novos.length > 0 && (
                        <span style={{ color: "var(--color-good)" }}>
                          +{admissionsDiff.novos.length} novos: {admissionsDiff.novos.map(p => p.nome).join(", ")}
                        </span>
                      )}
                      {admissionsDiff.saidos.length > 0 && (
                        <span style={{ color: "var(--color-warn, #dc2626)", marginLeft: admissionsDiff.novos.length > 0 ? 8 : 0 }}>
                          −{admissionsDiff.saidos.length} saíram: {admissionsDiff.saidos.map(p => p.nome).join(", ")}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="muted">sem alterações desde o último scrape</span>
                  )
                )}
                {live.status === "error" && (
                  <span className="muted" title={live.error}>
                    💾 live indisponível — a mostrar o último scrape
                    {live.error ? <span style={{ opacity: 0.75 }}> ({live.error})</span> : null}
                  </span>
                )}
              </div>
            )}
            <AdmissionsTab
              admissions={effAdmissions}
              playersDB={playersDB as any}
              date={tournament.date}
              fpgUrl={tournament.ccode && tournament.tcode && !featured?.semLinksFpg ? `https://scoring.fpg.pt/lists/tournAdmissions.aspx?ccode=${tournament.ccode}&tcode=${tournament.tcode}` : undefined}
              reservaLabel={featured?.reservaLabel}
              hcpActual={featured?.hcpActual}
              tournamentEscalao={tournament.escalao || undefined}
              tournamentSex={/\bF\b|\bS\b|Feminino/i.test(tournament.name || "") ? "F" : /\bM\b|\bH\b|Masculino/i.test(tournament.name || "") ? "M" : undefined}
              teeRule={teeRuleFor(tournament.ccode, tournament.tcode)}
            />
          </>;
        if (isDrawTab && customDraw.has(drawRoundNum))
          return <>{customDraw.get(drawRoundNum)!()}{shareRounds}</>;
        if (isDrawTab)
          return <><DrawTab
            draw={drawsByRound.get(drawRoundNum) || { groups: [] }}
            roundNum={drawRoundNum}
            playersDB={playersDB as any}
            tournamentEscalao={tournament.escalao || undefined}
            tournamentSex={/\bF\b|\bS\b|Feminino/i.test(tournament.name || "") ? "F" : /\bM\b|\bH\b|Masculino/i.test(tournament.name || "") ? "M" : undefined}
            tournamentDate={tournament.date}
            admissions={effAdmissions}
            results={drawResults}
            hideCols={drawHideCols}
            clubLabel={options?.clubLabel}
            omLookup={omLookup}
            fpgUrl={tournament.ccode && tournament.tcode ? `https://scoring.fpg.pt/lists/linkpage.aspx?page=draw&club=${tournament.ccode}&tourn=${tournament.tcode}&round=${drawRoundNum}&ack=8428ACK987` : undefined}
          />{shareRounds}</>;
        if (isCombined)
          return <><AllRoundsScorecardLB tournament={tournament} escLookup={escLookup} playersDB={playersDB} options={options} />{shareRounds}</>;
        if (isAnaliseAroeiraTab)
          return <Aroeira2AnaliseView tournament={tournament} />;
        if (isPreCutTab && preCutTourn)
          return <AccumulatedLB tournament={preCutTourn} nRounds={cutAfterRound!} escLookup={escLookup} playersDB={playersDB} showCols={accShowCols} extraColumns={accExtraColumns} renderName={accRenderName} showCourse={options?.showCourse} />;
        if (isAcc) {
          const accLB = <AccumulatedLB tournament={curT} nRounds={nRounds} escLookup={escLookup} playersDB={playersDB} showCols={accShowCols} extraColumns={accExtraColumns} renderName={accRenderName} showCourse={options?.showCourse} />;
          return renderAccSection ? <>{renderAccSection(accLB)}{shareRounds}</> : <>{accHeader}{accLB}{accExtra}{shareRounds}</>;
        }
        if (isRoundTab || !isMulti) {
          const roundLB = <ScorecardLB tournament={curT} escLookup={escLookup} playersDB={playersDB} siLabel={siLabel} options={options} />;
          // Volta 2+: análise dessa volta contra a anterior
          const roundAn = isMulti && isRoundTab && roundIdx >= 1
            ? <RoundAnalysisFor key={`${tournament.tcode}-an${roundIdx}`} rounds={expanded.filter((e: any) => !e._isTotal)} round={roundIdx + 1} />
            : null;
          return renderRoundSection
            ? <>{renderRoundSection(roundLB, roundIdx)}{roundAn}</>
            : <>{roundLB}{roundExtra?.(roundIdx)}{roundAn}</>;
        }
        return null;
      })()}
    </div>
  );
}


export { TournamentDetail };
