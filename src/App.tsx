import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import { loadMasterData, loadPlayers, loadAwayCourses } from "./data/loader";
import { initCourseColorCache } from "./utils/teeColors";
import { extractAwayCourses } from "./data/melhoriasLoader";
import { getExtraCourses } from "./data/extraCourses";
import type { Course, MasterData, PlayersDb } from "./data/types";
import CamposPage from "./pages/CamposPage";
import JogadoresPage from "./pages/JogadoresPage";
import SimuladorPage from "./pages/SimuladorPage";
import TorneioPage from "./pages/TorneioPage";
import CalendarioPage from "./pages/CalendarioPage";
import CompararPage from "./pages/CompararPage";
import golfBallSvg from "./assets/golf-ball.svg";

import { deepFixMojibake } from "./utils/fixEncoding";
import melhoriasJson from "../melhorias.json";

type Tab = "campos" | "jogadores" | "comparar" | "simulador" | "calendario" | "torneio";

type MelhoriasJson = Record<string, Record<string, unknown>>;

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: MasterData; players: PlayersDb; awayCourses: Course[] };

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [tab, setTab] = useState<Tab>("jogadores");
  const [navigateToFed, setNavigateToFed] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const goToTab = (t: Tab) => {
    setTab(t);
    navigate(`/${t}`, { replace: true });
  };

  /* Sync URL → tab: quando React Router navega (ex: Link), actualiza o tab */
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith("/campos")) setTab("campos");
    else if (path.startsWith("/jogadores")) setTab("jogadores");
    else if (path.startsWith("/comparar")) setTab("comparar");
    else if (path.startsWith("/simulador") || path.startsWith("/calculador")) setTab("simulador");
    else if (path.startsWith("/torneio")) setTab("torneio");
    else if (path.startsWith("/calendario")) setTab("calendario");
  }, [location.pathname]);

  const goToPlayer = (fed: string) => {
    setNavigateToFed(fed);
    goToTab("jogadores");
  };

  useEffect(() => {
    let alive = true;
    Promise.all([loadMasterData(), loadPlayers(), loadAwayCourses()])
      .then(([data, players, awayCourses]) => {
        if (!alive) return;
        deepFixMojibake(players);
        initCourseColorCache([...data.courses, ...awayCourses]);
        setStatus({ kind: "ready", data, players, awayCourses });
      })
      .catch((e) => alive && setStatus({ kind: "error", message: e?.message ?? String(e) }));
    return () => { alive = false; };
  }, []);

  const playerCount = status.kind === "ready" ? Object.keys(status.players).length : 0;

  /* Campos FPG + Away (pipeline + melhorias + manuais) */
  const simCourses: Course[] = useMemo(() => {
    if (status.kind !== "ready") return [];
    const fpg = status.data.courses;
    const pipelineAway = status.awayCourses;
    const melhoriasAway = extractAwayCourses(melhoriasJson as MelhoriasJson);
    const extra = getExtraCourses();

    // Merge com dedup por courseKey (prioridade: pipeline > melhorias > extra)
    const map = new Map<string, Course>();
    for (const c of fpg) map.set(c.courseKey, c);
    for (const c of pipelineAway) if (!map.has(c.courseKey)) map.set(c.courseKey, c);
    for (const c of melhoriasAway) if (!map.has(c.courseKey)) map.set(c.courseKey, c);
    for (const c of extra) if (!map.has(c.courseKey)) map.set(c.courseKey, c);
    return [...map.values()];
  }, [status]);

  return (
    <div className="app">
      {/* Topbar */}
      <header className="topbar">
        <div className="brand">
          <img src={golfBallSvg} alt="" className="brand-icon" />
          <div className="brand-title">Golf</div>
        </div>

        <nav className="nav">
          <button
            className={`nav-btn ${tab === "campos" ? "active" : ""}`}
            onClick={() => goToTab("campos")}
          >
            Campos
          </button>
          <button
            className={`nav-btn ${tab === "simulador" ? "active" : ""}`}
            onClick={() => goToTab("simulador")}
          >
            Calculadora
          </button>
          <button
            className={`nav-btn ${tab === "jogadores" ? "active" : ""}`}
            onClick={() => goToTab("jogadores")}
          >
            Jogadores
          </button>
          <button
            className={`nav-btn ${tab === "comparar" ? "active" : ""}`}
            onClick={() => goToTab("comparar")}
          >
            Comparar
          </button>
          <button
            className={`nav-btn ${tab === "torneio" ? "active" : ""}`}
            onClick={() => goToTab("torneio")}
            style={{ position: "relative" }}
          >
            🔒 Torneio
          </button>
          <button
            className={`nav-btn ${tab === "calendario" ? "active" : ""}`}
            onClick={() => goToTab("calendario")}
          >
            Calendário
          </button>
        </nav>

        {status.kind === "ready" && (
          <div className="top-stats">
            <div className="top-stat">
              <div className="top-stat-val">{status.data.meta.stats.courses}</div>
              <div className="top-stat-label">Campos</div>
            </div>
            <div className="top-stat">
              <div className="top-stat-val">{status.data.meta.stats.tees}</div>
              <div className="top-stat-label">Tees</div>
            </div>
            <div className="top-stat">
              <div className="top-stat-val">{playerCount}</div>
              <div className="top-stat-label">Jogadores</div>
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="content">
        {status.kind === "loading" && (
          <div className="center-msg">A carregar…</div>
        )}

        {status.kind === "error" && (
          <div className="center-msg error-box">
            <div className="error-title">Erro</div>
            <div className="error-msg">{status.message}</div>
          </div>
        )}

        {status.kind === "ready" && tab === "campos" && (
          <CamposPage courses={simCourses} />
        )}

        {status.kind === "ready" && tab === "jogadores" && (
          <JogadoresPage players={status.players} courses={simCourses} initialFed={navigateToFed} onFedConsumed={() => setNavigateToFed(null)} />
        )}

        {status.kind === "ready" && tab === "simulador" && (
          <SimuladorPage courses={simCourses} />
        )}

        {status.kind === "ready" && tab === "comparar" && (
          <CompararPage players={status.players} />
        )}

        {status.kind === "ready" && tab === "calendario" && (
          <CalendarioPage />
        )}

        {status.kind === "ready" && tab === "torneio" && (
          <TorneioPage players={status.players} onSelectPlayer={goToPlayer} />
        )}
      </main>
    </div>
  );
}
