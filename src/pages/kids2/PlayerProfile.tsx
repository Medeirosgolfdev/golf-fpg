import React, { useState, useMemo } from "react";
import type { CanonicalData, Junior } from "./data";
import HeroIdentity from "./components/HeroIdentity";
import MatchupVsManuel from "./components/MatchupVsManuel";
import MetricsGrid from "./components/MetricsGrid";
import EvolutionChart from "./components/EvolutionChart";
import CircuitFilterPills, { useJuniorCircuits } from "./components/CircuitFilterPills";
import HistoryByTournament from "./components/HistoryByTournament";
import ResultsTimeline from "./components/ResultsTimeline";
import AnaliseSection from "./components/AnaliseSection";

interface Props {
  data: CanonicalData;
  junior: Junior;
}

export default function PlayerProfile({ data, junior }: Props) {
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
      <MetricsGrid data={data} junior={junior} />
      <CircuitFilterPills data={data} junior={junior} active={circuit} onChange={setCircuit} />
      <EvolutionChart data={data} junior={junior} filterTids={filterTids} />
      <HistoryByTournament data={data} junior={junior} filterTids={filterTids} />
      <AnaliseSection data={data} junior={junior} filterTids={filterTids} />
      <ResultsTimeline data={data} junior={junior} filterTids={filterTids} />
    </div>
  );
}
