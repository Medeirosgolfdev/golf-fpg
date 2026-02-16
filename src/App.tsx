import { useEffect, useMemo, useState } from "react";
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
import golfBallSvg from "./assets/golf-ball.svg";

import melhoriasJson from "../melhorias.json";

type Tab = "campos" | "jogadores" | "simulador" | "torneio";

type MelhoriasJson = Record<string, Record<string, unknown>>;

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: MasterData; players: PlayersDb; awayCourses: Course[] };

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [tab, setTab] = useState<Tab>("jogadores");

  useEffect(() => {
    let alive = true;
    Promise.all([loadMasterData(), loadPlayers(), loadAwayCourses()])
      .then(([data, players, awayCourses]) => {
        if (!alive) return;
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
            onClick={() => setTab("campos")}
          >
            Campos
          </button>
          <button
            className={`nav-btn ${tab === "jogadores" ? "active" : ""}`}
            onClick={() => setTab("jogadores")}
          >
            Jogadores
          </button>
          <button
            className={`nav-btn ${tab === "simulador" ? "active" : ""}`}
            onClick={() => setTab("simulador")}
          >
            Simulador
          </button>
          <button
            className={`nav-btn ${tab === "torneio" ? "active" : ""}`}
            onClick={() => setTab("torneio")}
            style={{ position: "relative" }}
          >
            🔒 Torneio
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
          <JogadoresPage players={status.players} courses={simCourses} />
        )}

        {status.kind === "ready" && tab === "simulador" && (
          <SimuladorPage courses={simCourses} />
        )}

        {status.kind === "ready" && tab === "torneio" && (
          <TorneioPage players={status.players} />
        )}
      </main>
    </div>
  );
}
