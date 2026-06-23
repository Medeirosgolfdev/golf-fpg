/**
 * src/pages/TitulosPage.tsx
 *
 * Pagina "Titulos" - vista historica dos campeonatos de jovens FPG, dividida
 * em 3 tabs:
 *   - Nacional (default): Campeonatos Nacionais Sub-10 a Sub-18 (2005-2026)
 *     usando fpg-nacionais-historico.json (160+ torneios) + Top Clubes +
 *     Santo da Serra panel.
 *   - Regional: Campeonatos Regionais (Madeira/Norte/Sul/etc.) usando os
 *     ficheiros jovens_YYYY.json (mesmos dados que /FPG/jovens analise).
 *   - Atleta: pesquisa por nome ou fed code com lista cronologica de
 *     todos os resultados Nacionais.
 *
 * URLs:
 *   /titulos          -> redirect para /titulos/nacional
 *   /titulos/nacional -> tab Nacional
 *   /titulos/regional -> tab Regional
 *   /titulos/atleta   -> tab Atleta
 */

import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
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
import AtletaSearchPanel from "../ui/AtletaSearchPanel";
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

interface JovensFile {
  source?: string;
  lastUpdated?: string;
  tournaments: Tournament[];
}

type TabKey = "nacional" | "regional" | "atleta";

const TAB_LABELS: Record<TabKey, string> = {
  nacional: "🏆 Nacional",
  regional: "🌍 Regional",
  atleta: "🔍 Atleta",
};

const JOVENS_YEARS = ["2026", "2025", "2024", "2023", "2022", "2020", "2019"];

export default function TitulosPage() {
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const { players: appPlayers } = useAppContext();

  // ⚠ Hooks têm de ser chamados SEMPRE pela mesma ordem (Rules of Hooks).
  // Não fazer early-return ANTES dos useState/useEffect — em vez disso,
  // calcular activeTab condicionalmente e usar Navigate como render output.
  const validTab =
    tabParam && ["nacional", "regional", "atleta"].includes(tabParam)
      ? (tabParam as TabKey)
      : null;
  const activeTab: TabKey = validTab ?? "nacional";

  const [historico, setHistorico] = useState<HistoricoFile | null>(null);
  const [historicoErr, setHistoricoErr] = useState<string | null>(null);
  const [regionais, setRegionais] = useState<Tournament[]>([]);
  const [regLoaded, setRegLoaded] = useState(false);
  const [nationality, setNationality] = useState<NationalityMap>({});
  const [playerInfo, setPlayerInfo] = useState<PlayerInfoMap>({});

  // Nacional historico
  useEffect(() => {
    cachedFetchJson<HistoricoFile>("/data/fpg-nacionais-historico.json")
      .then((d) => {
        if (!d) {
          setHistoricoErr("Ficheiro fpg-nacionais-historico.json nao encontrado.");
          return;
        }
        setHistorico(d);
      })
      .catch((e) => setHistoricoErr(String(e?.message ?? e)));
  }, []);

  // Nationality map (foreigner rule)
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

  // Regional - lazy load when tab activates
  useEffect(() => {
    if (activeTab !== "regional") return;
    if (regLoaded) return;
    let alive = true;
    Promise.all(
      JOVENS_YEARS.map((y) =>
        cachedFetchJson<JovensFile>(`/data/jovens_${y}.json`)
          .then((d) =>
            (d?.tournaments || []).map((t) => ({
              ...t,
              _jovensYear: y,
            })),
          )
          .catch(() => [] as Tournament[]),
      ),
    ).then((arr) => {
      if (!alive) return;
      const merged = arr.flat() as Tournament[];
      const seen = new Map<string, Tournament>();
      for (const t of merged) {
        const key = `${(t as { ccode?: string }).ccode || "?"}/${t.tcode}`;
        if (seen.has(key)) continue;
        seen.set(key, t);
      }
      setRegionais([...seen.values()]);
      setRegLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [activeTab, regLoaded]);

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

  const nacTournaments = useMemo<Tournament[]>(() => {
    if (!historico) return [];
    return historico.tournaments
      .filter((t) => !/de\s+clubes/i.test(t.name || ""))
      .map((t) => ({
        ...t,
        playerCount: (t.players || []).length,
      }));
  }, [historico]);

  const yearsCovered = useMemo(() => {
    const ys = [
      ...new Set(
        nacTournaments
          .map((t) => parseInt((t.date || "").slice(0, 4)))
          .filter(Boolean),
      ),
    ];
    return ys.sort((a, b) => a - b);
  }, [nacTournaments]);

  const nacionalChampions = useMemo(
    () =>
      buildJovensAnalise(nacTournaments, playersDB, nationality, playerInfo)
        .nacionalChampions,
    [nacTournaments, playersDB, nationality, playerInfo],
  );

  // Navigate AFTER all hooks (Rules of Hooks: hooks must be called in same
  // order on every render — no early returns before useState/useEffect).
  if (validTab === null) return <Navigate to="/titulos/nacional" replace />;
  if (historicoErr) return <EmptyState message={`Erro a carregar dados: ${historicoErr}`} />;
  if (!historico) return <LoadingState message="A carregar Titulos..." />;

  return (
    <div className="page-full" style={{ maxWidth: "none" }}>
      <Toolbar>
        <ToolbarTitle>🏆 Titulos - Campeonatos de Jovens</ToolbarTitle>
        <ToolbarMeta>
          {yearsCovered.length > 0
            ? `${yearsCovered[0]}-${yearsCovered[yearsCovered.length - 1]}`
            : ""}
        </ToolbarMeta>
        <ToolbarSep />
        <span className="chip">{nacTournaments.length} Nacionais</span>
        {regLoaded && <span className="chip">{regionais.length} Regionais</span>}
        <span className="chip ml-auto" title="Ultima atualizacao">
          {historico.lastUpdated}
        </span>
      </Toolbar>

      {/* Tabs */}
      <div className="tabbar-under">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((k) => (
          <button
            key={k}
            className={"tab-under" + (activeTab === k ? " active" : "")}
            onClick={() => navigate(`/titulos/${k}`)}
          >
            {TAB_LABELS[k]}
          </button>
        ))}
      </div>

      {activeTab === "nacional" && (
        <>
          <JovensAnaliseView
            jovensTournaments={nacTournaments}
            playersDB={playersDB}
            splitByEscalao={true}
            mode="nacional"
            hideHeader={true}
          />
          <TopClubesPanel tournaments={nacTournaments} champions={nacionalChampions} />
          <SantoDaSerraPanel tournaments={historico.tournaments} />
        </>
      )}

      {activeTab === "regional" && (
        regLoaded ? (
          <JovensAnaliseView
            jovensTournaments={regionais}
            playersDB={playersDB}
            mode="regional"
            hideHeader={true}
          />
        ) : (
          <LoadingState message="A carregar Regionais..." />
        )
      )}

      {activeTab === "atleta" && (
        <AtletaSearchPanel tournaments={historico.tournaments} />
      )}
    </div>
  );
}
