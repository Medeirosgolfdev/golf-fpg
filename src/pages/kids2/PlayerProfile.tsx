import { useState, useMemo, memo } from "react";
import type { CanonicalData, Junior } from "./data";
import HeroIdentity from "./components/HeroIdentity";
import MatchupVsManuel from "./components/MatchupVsManuel";
import MetricsGrid from "./components/MetricsGrid";
import EvolutionChart from "./components/EvolutionChart";
import CircuitFilterPills, { useJuniorCircuits } from "./components/CircuitFilterPills";
import HistoryByTournament from "./components/HistoryByTournament";
import ResultsTimeline from "./components/ResultsTimeline";
import AnaliseSection from "./components/AnaliseSection";
import PalmaresSection from "./components/PalmaresSection";
import ScoringDistribution from "./components/ScoringDistribution";
import MemberHistTable from "./components/MemberHistTable";

interface Props {
  data: CanonicalData;
  junior: Junior;
}

function PlayerProfileInner({ data, junior }: Props) {
  const isManuel = data.manuel?.id === junior.id;
  const [circuit, setCircuit] = useState<string>("all");
  const circuits = useJuniorCircuits(data, junior);

  const filterTids = useMemo<Set<string> | null>(() => {
    if (circuit === "all") return null;
    const c = circuits.find((x) => x.id === circuit);
    return c ? c.tournamentIds : null;
  }, [circuit, circuits]);

  return (
    <div className="kids2-profile" style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 860 }}>
      <HeroIdentity data={data} junior={junior} />
      {!isManuel && data.manuel && (
        <MatchupVsManuel data={data} junior={junior} manuel={data.manuel} />
      )}
      <MetricsGrid data={data} junior={junior} filterTids={filterTids} />
      <PalmaresSection data={data} junior={junior} filterTids={filterTids} />
      <CircuitFilterPills data={data} junior={junior} active={circuit} onChange={setCircuit} />
      <ScoringDistribution data={data} junior={junior} filterTids={filterTids} />
      <AnaliseSection data={data} junior={junior} filterTids={filterTids} />
      <ResultsTimeline data={data} junior={junior} filterTids={filterTids} />
      {/* Ante-penúltimas: evolução + histórico por torneio.
          Última: histórico USKids alargado (com links). */}
      <EvolutionChart data={data} junior={junior} filterTids={filterTids} />
      <HistoryByTournament data={data} junior={junior} filterTids={filterTids} />
      <MemberHistTable data={data} junior={junior} filterTids={filterTids} />
    </div>
  );
}

/**
 * React.memo com comparador estrito: PlayerProfile só re-renderiza se `data`
 * (a referência ao canonical singleton) ou `junior.id` mudarem.
 * Isto isola o detail dos re-renders do KIDS2Page provocados por mudanças
 * de filtros da toolbar / search da sidebar.
 */
const PlayerProfile = memo(PlayerProfileInner, (prev, next) => {
  return prev.data === next.data && prev.junior.id === next.junior.id;
});

export default PlayerProfile;
