/**
 * src/pages/NacionaisJovensPage.tsx
 *
 * Campeoes Nacionais de Jovens FPG - vista historica (21 anos: 2005-2026).
 *
 * Reusa o mesmo layout de /FPG/jovens (JovensAnaliseView) mas alimentado
 * pelo `fpg-nacionais-historico.json` (160 torneios scrapados via FPG
 * ClassifLST, cobrindo 2004-2026).
 */

import { useEffect, useMemo, useState } from "react";
import { Toolbar, ToolbarTitle, ToolbarMeta, ToolbarSep } from "../ui/Toolbar";
import { cachedFetchJson } from "../data/fetchCache";
import { JovensAnaliseView } from "../ui/JovensAnaliseView";
import LoadingState from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import { useAppContext } from "../context/AppContext";
import type { Tournament } from "../data/fpgTypes";
import type { PlayersDB } from "../ui/tournamentPrimitives";
import SantoDaSerraPanel from "../ui/SantoDaSerraPanel";
import TopClubesPanel from "../ui/TopClubesPanel";
import {
  buildJovensAnalise,
  type NationalityMap,
  type PlayerInfoMap,
} from "../data/jovensAnaliseData";

interface HistoricoFile {
  lastUpdated: string;
  source: string;
  totalTournaments: number;
  totalPlayers: number;
  totalScorecards: number;
  tournaments: Array<Tournament & { tipo?: string }>;
}

export default function NacionaisJovensPage() {
  const { players: appPlayers } = useAppContext();
  const [data, setData] = useState<HistoricoFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nationality, setNationality] = useState<NationalityMap>({});
  const [playerInfo, setPlayerInfo] = useState<PlayerInfoMap>({});

  useEffect(() => {
    cachedFetchJson<HistoricoFile>("/data/fpg-nacionais-historico.json")
      .then((d) => {
        if (!d) {
          setError("Ficheiro fpg-nacionais-historico.json nao encontrado.");
          return;
        }
        setData(d);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    let alive = true;
    cachedFetchJson<{ byFed?: NationalityMap; info?: PlayerInfoMap }>(
      "/data/players-nationality.json",
    )
      .then((d) => {
        if (!alive) return;
        if (d?.byFed) setNationality(d.byFed);
        if (d?.info) setPlayerInfo(d.info);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const playersDB = useMemo<PlayersDB>(() => {
    const out: PlayersDB = {};
    const list = Array.isArray(appPlayers) ? appPlayers : Object.values(appPlayers ?? {});
    for (const p of list) {
      const fed = String(
        (p as { nfed?: string; fed?: string }).nfed ??
          (p as { fed?: string }).fed ??
          "",
      ).trim();
      if (!fed) continue;
      const pp = p as {
        name?: string;
        escalao?: string;
        sex?: string;
        club?: { short?: string };
        dob?: string;
        hcp?: number;
        hcpExact?: number;
        region?: string;
      };
      out[fed] = {
        name: pp.name,
        escalao: pp.escalao,
        sex: pp.sex,
        club: pp.club,
        hcp: pp.hcp,
        hcpExact: pp.hcpExact,
        region: pp.region,
        ...(pp.dob ? ({ dob: pp.dob } as { dob: string }) : {}),
      };
    }
    return out;
  }, [appPlayers]);

  const tournaments = useMemo<Tournament[]>(() => {
    if (!data) return [];
    return data.tournaments
      .filter((t) => !/de\s+clubes/i.test(t.name || ""))
      .map((t) => ({
        ...t,
        playerCount: (t.players || []).length,
      }));
  }, [data]);

  const yearsCovered = useMemo(() => {
    const ys = [
      ...new Set(
        tournaments
          .map((t) => parseInt((t.date || "").slice(0, 4)))
          .filter(Boolean),
      ),
    ];
    return ys.sort((a, b) => a - b);
  }, [tournaments]);

  const nacionalChampions = useMemo(
    () =>
      buildJovensAnalise(tournaments, playersDB, nationality, playerInfo)
        .nacionalChampions,
    [tournaments, playersDB, nationality, playerInfo],
  );

  if (error) return <EmptyState message={`Erro a carregar dados: ${error}`} />;
  if (!data) return <LoadingState message="A carregar Nacionais de Jovens..." />;

  return (
    <div className="page-full">
      <Toolbar>
        <ToolbarTitle>Campeoes Nacionais de Jovens</ToolbarTitle>
        <ToolbarMeta>
          {yearsCovered.length > 0
            ? `${yearsCovered[0]}-${yearsCovered[yearsCovered.length - 1]}`
            : ""}
        </ToolbarMeta>
        <ToolbarSep />
        <span className="chip">{tournaments.length} torneios</span>
        <span className="chip ml-auto" title="Ultima atualizacao do JSON">
          {data.lastUpdated}
        </span>
      </Toolbar>

      <JovensAnaliseView
        jovensTournaments={tournaments}
        playersDB={playersDB}
        splitByEscalao={true}
      />

      <TopClubesPanel tournaments={tournaments} champions={nacionalChampions} />

      <SantoDaSerraPanel tournaments={data.tournaments} />
    </div>
  );
}
