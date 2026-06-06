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
import React, { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Tournament } from "../../data/fpgTypes";
import type { EscLookup } from "../../utils/playerUtils";
import type { PlayersDB } from "../../ui/tournamentPrimitives";
import { expandMultiRound, synthesizeDrawFromCumulative } from "../../data/fpgUtils";
import { tournamentHasManuel } from "../../data/fpgUtils";
import { fmtDate, fpgAdmissionsUrl, fpgDrawUrl, fpgScoringUrl, tournamentUrl } from "../../utils/format";
import {
  EscPill, RoundPill, NineHPill, SserraPill, NacionalPill, JuniorPill,
  ClubePill, ManuelPill,
} from "../../ui/PillBadge";
import { SSERRA_CCODE } from "../../ui/TournSidebarItem";
import { LinksBar } from "../../ui/LinksBar";
import { ScorecardLB, AccumulatedLB, AllRoundsScorecardLB } from "../../ui/LeaderboardComponents";
import Aroeira2AnaliseView from "../../ui/Aroeira2AnaliseView";
import AdmissionsTab from "../../ui/AdmissionsTab";
import DrawTab from "../../ui/DrawTab";
import PrintButton from "../../ui/PrintButton";
import PrintPJAButton from "../../ui/PrintPJAButton";

function TournamentDetail({ tournament, escLookup, playersDB }: { tournament: Tournament; escLookup: EscLookup; playersDB: PlayersDB }) {
  const isMulti = (tournament.rounds || 1) > 1 && tournament.players.some(p => (p.roundScores?.length ?? 0) > 1);
  const nRounds = tournament.rounds || 1;
  const hasAnyRounds = (tournament.players?.length ?? 0) > 0;

  // Dados extra (admissions + draws) — injectados no loader Jovens
  const admissions = (tournament as any)._admissions as import("../../data/nacional2026Loader").FpgAdmissions | undefined;
  const draws      = (tournament as any)._draws as Record<string, import("../../data/nacional2026Loader").FpgDraw> | undefined;
  const hasAdmissions = !!admissions && !admissions.error && (admissions.players?.length ?? 0) > 0;
  const drawsByRound = useMemo(() => {
    const out = new Map<number, import("../../data/nacional2026Loader").FpgDraw>();
    if (draws) for (const [k, d] of Object.entries(draws)) {
      if (d && (d.groups?.length ?? 0) > 0) out.set(parseInt(k, 10), d);
    }
    // Sintetizar draws em falta a partir do leaderboard acumulado.
    // Quando a FPG ainda não publicou o draw oficial de uma ronda (ou o scraper
    // não o apanhou), gerar emparelhamentos pelos resultados das rondas anteriores
    // (regra FPG: 1º+2º+3º acumulado juntos, depois 4º+5º+6º, etc.). O DrawTab
    // mostra um aviso (note) a indicar que é estimado.
    const nR = tournament.rounds || 1;
    for (let r = 2; r <= nR; r++) {
      if (out.has(r)) continue;
      const synth = synthesizeDrawFromCumulative(tournament, r);
      if (synth && (synth.groups?.length ?? 0) > 0) out.set(r, synth);
    }
    return out;
  }, [draws, tournament]);

  // Expanded list: R1, R2, ..., Resumo
  const expanded = useMemo(() => expandMultiRound(tournament), [tournament]);

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
    if (hasAdmissions) out.push({ key: "admissions", label: "Inscrições" });
    if (isMulti) {
      // expanded é [R1, R2, ..., RN, Resumo] — últio elemento é o Resumo.
      const rondas = expanded.filter((e: any) => !e._isTotal);
      const temResumo = expanded.some((e: any) => e._isTotal);
      for (let i = 0; i < rondas.length; i++) {
        const roundNum = i + 1;
        if (drawsByRound.has(roundNum)) {
          out.push({ key: `draw:${roundNum}`, label: `Draw R${roundNum}` });
        }
        out.push({ key: `round:${i}`, label: (rondas[i] as any)._roundLabel || `R${roundNum}` });
      }
      if (temResumo) out.push({ key: "resumo", label: "Resumo" });
      out.push({ key: "scorecards", label: COMBINED_TAB });
      // Tab "Análise Aroeira II" — só para o PJA Aroeira Masters 2026 (029/10543)
      if (tournament.ccode === "029" && tournament.tcode === "10543") {
        out.push({ key: "analise-aroeira2", label: "🎯 Análise" });
      }
    } else if (hasAnyRounds) {
      // 1-round OU multi-round parcialmente jogado (ex: R1 com scorecards, R2
      // ainda só draw publicado). Mostrar:
      //   - Draw R1 (se existir) → Scorecard (R1) → Draw R2..N (se houver)
      if (drawsByRound.has(1)) out.push({ key: "draw:1", label: "Draw R1" });
      out.push({ key: "round:0", label: nRounds > 1 ? "R1" : "Scorecard" });
      // Draws de rondas futuras ainda não jogadas (R2, R3, ...)
      const futureDraws = [...drawsByRound.keys()].filter(r => r >= 2).sort((a, b) => a - b);
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
        out.push({ key: "scorecards", label: COMBINED_TAB });
      }
    } else {
      // Sem rondas jogadas — pode ter só draws (torneio prestes a começar)
      const drawKeys = [...drawsByRound.keys()].sort((a, b) => a - b);
      for (const r of drawKeys) out.push({ key: `draw:${r}`, label: `Draw R${r}` });
    }
    return out;
  }, [hasAdmissions, isMulti, expanded, drawsByRound, hasAnyRounds]);

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
  const urlTabKey = searchParams.get("tab");
  const urlTabIdx = urlTabKey ? tabs.findIndex(t => t.key === urlTabKey) : -1;
  const lastProgressionIdx = useMemo(() => {
    const SKIP = new Set(["scorecards", "analise-aroeira2"]);
    for (let i = tabs.length - 1; i >= 0; i--) {
      if (!SKIP.has(tabs[i].key)) return i;
    }
    return 0;
  }, [tabs]);
  const tab = urlTabIdx >= 0 ? urlTabIdx : lastProgressionIdx;

  const activeTab = tabs[Math.min(tab, Math.max(0, tabs.length - 1))];
  const activeKey = activeTab?.key || "";
  const isAdmissionsTab = activeKey === "admissions";
  const isDrawTab = activeKey.startsWith("draw:");
  const drawRoundNum = isDrawTab ? parseInt(activeKey.slice(5), 10) : 0;
  const isResumoTab = activeKey === "resumo";
  const isCombinedTab = activeKey === "scorecards";
  const isAnaliseAroeiraTab = activeKey === "analise-aroeira2";
  const isRoundTab = activeKey.startsWith("round:");
  const roundIdx = isRoundTab ? parseInt(activeKey.slice(6), 10) : 0;

  // curT só é relevante para round/resumo tabs (lógica existente)
  const expandedIdxForCurT = isResumoTab
    ? expanded.findIndex((e: any) => e._isTotal)
    : isRoundTab
      ? expanded.findIndex((e: any, i: number) => !e._isTotal && expanded.filter((x: any, j: number) => !x._isTotal && j <= i).length === roundIdx + 1)
      : -1;
  const curT = expandedIdxForCurT >= 0 && expanded[expandedIdxForCurT] ? expanded[expandedIdxForCurT] : tournament;
  const isAcc = isResumoTab;
  const isCombined = isCombinedTab;

  // Info about tournament
  const refPlayer = tournament.players[0];
  const nholes = refPlayer?.nholes || refPlayer?.par?.length || refPlayer?.roundScores?.[0]?.pars?.length || 18;
  const parTotal = refPlayer?.parTotal || refPlayer?.par?.reduce((a, b) => a + b, 0) || refPlayer?.roundScores?.[0]?.pars.reduce((a, b) => a + b, 0) || 0;


  return (
    <div>
      {/* Cabeçalho */}
      <div className="detail-header">
        <div className="flex-wrap gap-8" style={{ display: "flex", alignItems: "baseline" }}>
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
            {tournament.tcode && (
              <span title="tcode" className="fs-10 fw-700 mono" style={{
                background: "var(--accent)", color: "#fff",
                borderRadius: 4, padding: "1px 6px", letterSpacing: "0.02em",
                userSelect: "all", cursor: "text",
              }}>
                {tournament.tcode}
              </span>
            )}
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
              : tournament.ccode && tournament.tcode && (
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
                clube/evento, etc. Carregados de Tournament.extraLinks. */}
            {(tournament.extraLinks || []).map((lnk) => (
              <a key={lnk.url} href={lnk.url}
                target="_blank" rel="noopener noreferrer"
                title={lnk.label}
                className="tourn-ext-link">
                {lnk.icon ? `${lnk.icon} ` : ""}{lnk.label} ↗
              </a>
            ))}
            <PrintButton />
            {/* PrintPJAButton carrega pja-members.json sozinho — só aparece
                se houver lista para o ano do torneio. */}
            <PrintPJAButton year={(tournament.date || "").substring(0, 4)} />
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
            {tournamentHasManuel(tournament) && <ManuelPill />}
          </span>

        </div>
        <LinksBar links={tournament.links} escalao={tournament.escalao} />
      </div>

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
            sp.set("tab", t.key);
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
      {isAdmissionsTab && admissions
        ? <AdmissionsTab
            admissions={admissions}
            playersDB={playersDB as any}
            date={tournament.date}
            fpgUrl={tournament.ccode && tournament.tcode ? `https://scoring.fpg.pt/lists/tournAdmissions.aspx?ccode=${tournament.ccode}&tcode=${tournament.tcode}` : undefined}
            tournamentEscalao={tournament.escalao || undefined}
            tournamentSex={/\bF\b|\bS\b|Feminino/i.test(tournament.name || "") ? "F" : /\bM\b|\bH\b|Masculino/i.test(tournament.name || "") ? "M" : undefined}
          />
        : isDrawTab
          ? <DrawTab
              draw={drawsByRound.get(drawRoundNum) || { groups: [] }}
              roundNum={drawRoundNum}
              playersDB={playersDB as any}
              tournamentEscalao={tournament.escalao || undefined}
              tournamentSex={/\bF\b|\bS\b|Feminino/i.test(tournament.name || "") ? "F" : /\bM\b|\bH\b|Masculino/i.test(tournament.name || "") ? "M" : undefined}
              tournamentDate={tournament.date}
              admissions={admissions}
              fpgUrl={tournament.ccode && tournament.tcode ? `https://scoring.fpg.pt/lists/linkpage.aspx?page=draw&club=${tournament.ccode}&tourn=${tournament.tcode}&round=${drawRoundNum}&ack=8428ACK987` : undefined}
            />
          : isCombined
            ? <AllRoundsScorecardLB tournament={tournament} escLookup={escLookup} playersDB={playersDB} />
            : isAnaliseAroeiraTab
              ? <Aroeira2AnaliseView tournament={tournament} />
              : isAcc
              ? <AccumulatedLB tournament={curT} nRounds={nRounds} escLookup={escLookup} playersDB={playersDB} />
              : isRoundTab || !isMulti
                ? <ScorecardLB tournament={curT} escLookup={escLookup} playersDB={playersDB} />
                : null /* sem tabs válidas — pode ser torneio futuro sem admissions (unlikely) */
      }
    </div>
  );
}

export default TournamentDetail;
export { TournamentDetail };
