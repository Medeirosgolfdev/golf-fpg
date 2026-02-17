import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import "./App.css";
import "./Comparar.css";
import { loadMasterData, loadPlayers, loadAwayCourses } from "./data/loader";
import { initCourseColorCache } from "./utils/teeColors";
import { extractAwayCourses } from "./data/melhoriasLoader";
import { getExtraCourses } from "./data/extraCourses";
import type { Course, MasterData, PlayersDb } from "./data/types";
import CamposPage from "./pages/CamposPage";
import JogadoresPage from "./pages/JogadoresPage";
import CompararPage from "./pages/CompararPage";
import SimuladorPage from "./pages/SimuladorPage";
import TorneioPage from "./pages/TorneioPage";
import CalendarioPage from "./pages/CalendarioPage";
import golfBallSvg from "./assets/golf-ball.svg";

import melhoriasJson from "../melhorias.json";

type MelhoriasJson = Record<string, Record<string, unknown>>;

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: MasterData; players: PlayersDb; awayCourses: Course[] };

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const navigate = useNavigate();

  const goToPlayer = (fed: string) => {
    navigate(`/jogadores/${fed}`);
  };

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
          <NavLink to="/campos" className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}>
            Campos
          </NavLink>
          <NavLink to="/jogadores" className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}>
            Jogadores
          </NavLink>
          <NavLink to="/comparar" className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}>
            ⚡ Comparar
          </NavLink>
          <NavLink to="/simulador" className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}>
            Simulador
          </NavLink>
          <NavLink to="/torneio" className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`} style={{ position: "relative" }}>
            🔑 Torneio
          </NavLink>
          <NavLink to="/calendario" className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}>
            📅 Calendário
          </NavLink>
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

        {status.kind === "ready" && (
          <Routes>
            <Route path="/campos/:courseKey?" element={<CamposPage courses={simCourses} />} />
            <Route path="/jogadores/:fed?" element={<JogadoresPage players={status.players} courses={simCourses} />} />
            <Route path="/comparar" element={<CompararPage players={status.players} />} />
            <Route path="/simulador" element={<SimuladorPage courses={simCourses} />} />
            <Route path="/torneio" element={<TorneioPage players={status.players} onSelectPlayer={goToPlayer} />} />
            <Route path="/calendario" element={<CalendarioPage />} />
            <Route path="*" element={<Navigate to="/jogadores" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
