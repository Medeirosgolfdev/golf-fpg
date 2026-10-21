/**
 * src/pages/fpg/fpgClubes.tsx
 *
 * Abas próprias dos torneios de clubes (/FPG/clubes) no TournamentDetail:
 *   - «🏅 Grupos»     — classificação por equipas: pontos do match play 3-way
 *                        (TeamPointsStandings), composição das equipas antes do
 *                        jogo, ou best-N por pancadas (ClubesGruposView /
 *                        ClubesCategoriasView) nos torneios strokeplay;
 *   - «🆚 Match Play» — confrontos 3-way (MatchplayView), só quando há resultados.
 * As restantes abas (Inscrições, Draw, R1…, Resumo, Scorecards) são as normais
 * do TournamentDetail, a partir de `clubesIndividualTournament`. Abre em Grupos
 * (`CLUBES_DEFAULT_TAB`).
 */
import React, { useMemo } from "react";
import type { Tournament } from "../../data/fpgTypes";
import type { PlayersDB } from "../../ui/tournamentPrimitives";
import { autoGruposByClub, clubesFormatOf } from "../../data/clubesFormats";
import { clubesMatchplayToFile, clubesTeamPoints } from "../../data/clubesMatchplayAdapter";
import { CLUBES_GRUPOS_BY_YEAR } from "../../data/clubesGruposData";
import ClubesGruposView from "../../ui/ClubesGruposView";
import ClubesCategoriasView from "../../ui/ClubesCategoriasView";
import MatchplayView from "../../ui/circuit/MatchplayView";
import TeamPointsStandings from "../../ui/circuit/TeamPointsStandings";

/** Aba com que um torneio de clubes abre (como na vista antiga). */
export const CLUBES_DEFAULT_TAB = "grupos";

type TabContent = { key: string; label: string; content: React.ReactNode };

/** Ano da edição (o do ficheiro de onde o torneio veio). */
const clubesYearOf = (t: Tournament): string => t._clubesYear ?? t.date?.substring(0, 4) ?? "";

/** Match play 3-way com resultados → confrontos (MatchplayView) e pontos por
 *  clube (TeamPointsStandings); senão null. */
function useClubesMatchplay(t: Tournament) {
  return useMemo(() => {
    const fmt = clubesFormatOf(t);
    const mp = fmt?.matchPlay ? t.matchPlayResults : undefined;
    if (!mp) return null;
    const opts = {
      tournament: t.name,
      slug: `clubes-${t.ccode}-${t.tcode}`,
      year: Number(clubesYearOf(t)) || null,
      categories: fmt?.categories,
    };
    return { file: clubesMatchplayToFile(mp, opts), points: clubesTeamPoints(mp, opts) };
  }, [t]);
}

/** Faixa 🆚 no topo das vistas de match play de clubes (abas Grupos e Match Play). */
function MatchPlayBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mp-banner">
      <span className="mp-banner-icon">🆚</span>
      <span>{children}</span>
    </div>
  );
}

/** Aviso centrado quando a aba Grupos não tem o que mostrar. */
function GruposEmpty({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="empty-state fs-13 c-muted">
      <div className="mb-12 fs-24">{icon}</div>
      <div className="fw-600 mb-6">{title}</div>
      <div className="fs-12">{children}</div>
    </div>
  );
}

function ClubesGruposTab({ t, playersDB }: { t: Tournament; playersDB: PlayersDB }) {
  const mpData = useClubesMatchplay(t);
  // Composição curada (juvenis sub14/sub18) tem prioridade; para clubes
  // não-juvenis (ex: Mid-Amateur, esc "midam") ou edições sem composição
  // carregada, auto-constrói as equipas por clube.
  const esc = t._clubesEsc;
  const year = clubesYearOf(t);
  const gruposData = year ? CLUBES_GRUPOS_BY_YEAR[year] : null;
  const curated = (esc === "sub14" || esc === "sub18") ? (gruposData?.[esc] ?? null) : null;
  const grupos = (curated && curated.length) ? curated : autoGruposByClub(t);
  const fmt = clubesFormatOf(t);

  // Match play (Regional 2026): a classificação é por pontos, não por pancadas.
  if (fmt?.matchPlay) {
    const banner = (
      <MatchPlayBanner>
        <strong>Match Play — classificação por pontos.</strong>{" "}{fmt.note}.
        {t.matchPlayResults
          ? <> Dia 1 match play · Dia 2 stroke play (Palheiro Golf) — usa o selector de <strong>Dia</strong> e clica num clube para ver os jogadores. Confrontos buraco-a-buraco na aba <strong>Match Play</strong>.</>
          : <> A classificação por equipa surge quando houver resultados; vê o <strong>Draw</strong> para os emparelhamentos 3-way.</>}
      </MatchPlayBanner>
    );
    if (mpData) {
      return <>{banner}<div className="p-16"><TeamPointsStandings data={mpData.points} /></div></>;
    }
    // Pré-jogo: composição das equipas por clube e categoria.
    if (fmt.categories && grupos.length) {
      return (
        <>
          {banner}
          <ClubesCategoriasView
            tournament={t}
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
      <GruposEmpty icon="🆚" title="Match Play — classificação por pontos">
        {fmt.note}<br />A classificação por equipa (pontos) será apresentada quando os resultados forem publicados.<br />Vê as abas de resultados e o <strong>Draw</strong> para os emparelhamentos 3-way.
      </GruposEmpty>
    );
  }
  // Torneios com categorias (ex: Regional Absoluto — Homens/Senhoras/Juniores)
  // → sub-grupos por categoria dentro do clube.
  if (fmt?.categories && grupos.length) {
    return <ClubesCategoriasView tournament={t} grupos={grupos} playersDB={playersDB} categories={fmt.categories} />;
  }
  if (grupos.length) {
    // Clubes não-juvenis (midam): formato de pontuação por torneio
    // (CLUBES_TEAM_FORMAT). Default = 5 melhores em todas as rondas (Absoluto),
    // sem cap de pancadas por buraco.
    const isMidam = esc === "midam";
    return (
      <ClubesGruposView
        grupos={grupos}
        tournament={t}
        escKey={esc === "sub18" ? "sub18" : "sub14"}
        bestNByRound={isMidam ? fmt?.bestNByRound : undefined}
        defaultBestN={isMidam ? (fmt?.defaultBestN ?? 5) : undefined}
        maxHoleScore={isMidam ? Infinity : undefined}
        formatNote={isMidam ? (fmt?.note ?? "Cada dia: 5 melhores resultados por equipa") : undefined}
      />
    );
  }
  return (
    <GruposEmpty icon="📋" title={`Vista de grupos não disponível para ${year}`}>
      Os dados de composição de grupos desta edição não estão carregados.<br />Vê os resultados nas outras abas.
    </GruposEmpty>
  );
}

function ClubesMatchplayTab({ t }: { t: Tournament }) {
  const mpData = useClubesMatchplay(t);
  if (!mpData) return <GruposEmpty icon="🆚" title="Sem confrontos publicados">Os confrontos aparecem quando houver resultados.</GruposEmpty>;
  return (
    <>
      <MatchPlayBanner>Confrontos 3-way: uma coluna por clube, com o jogador e os pontos. Clica num confronto para ver os duelos e o buraco a buraco.</MatchPlayBanner>
      <div className="p-16"><MatchplayView data={mpData.file} roundPicker /></div>
    </>
  );
}

/** Abas «Grupos» e (só em match play com resultados) «Match Play» de um torneio
 *  de clubes — entram ANTES das abas de resultados do TournamentDetail. */
export function clubesLeadingTabs(t: Tournament, playersDB: PlayersDB): TabContent[] {
  const tabs: TabContent[] = [
    { key: CLUBES_DEFAULT_TAB, label: "🏅 Grupos", content: <ClubesGruposTab t={t} playersDB={playersDB} /> },
  ];
  if (clubesFormatOf(t)?.matchPlay && t.matchPlayResults) {
    tabs.push({ key: "matchplay", label: "🆚 Match Play", content: <ClubesMatchplayTab t={t} /> });
  }
  return tabs;
}
