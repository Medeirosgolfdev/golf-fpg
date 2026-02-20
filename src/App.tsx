import { useEffect, useMemo, useState } from "react";
import { Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom";
import "./App.css";
import { loadMasterData, loadPlayers, loadAwayCourses } from "./data/loader";
import { initCourseColorCache } from "./utils/teeColors";
import { extractAwayCourses } from "./data/melhoriasLoader";
import { getExtraCourses } from "./data/extraCourses";
import type { Course, MasterData, PlayersDb } from "./data/types";
import CamposPage from "./pages/CamposPage";
import JogadoresPage from "./pages/JogadoresPage";
import SimuladorPage from "./pages/SimuladorPage";

import CalendarioPage from "./pages/CalendarioPage";
import CompararPage from "./pages/CompararPage";
import golfBallSvg from "./assets/golf-ball.svg";

import { deepFixMojibake } from "./utils/fixEncoding";
import melhoriasJson from "../melhorias.json";

type Tab = "campos" | "jogadores" | "comparar" | "simulador" | "calendario";

type MelhoriasJson = Record<string, Record<string, unknown>>;

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: MasterData; players: PlayersDb; awayCourses: Course[] };

/* Derivar tab activo a partir do pathname */
function tabFromPath(pathname: string): Tab {
  const seg = pathname.split("/")[1] || "";
  if (seg === "campos") return "campos";
  if (seg === "simulador") return "simulador";
  if (seg === "comparar") return "comparar";
  if (seg === "calendario") return "calendario";
  return "jogadores"; // default
}

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const location = useLocation();
  const navigate = useNavigate();
  const tab = tabFromPath(location.pathname);

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

  const goTo = (path: string) => navigate(path);

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
            className={`nav-btn ${tab === "jogadores" ? "active" : ""}`}
            onClick={() => goTo("/jogadores")}
          >
            Jogadores
          </button>
          <button
            className={`nav-btn ${tab === "comparar" ? "active" : ""}`}
            onClick={() => goTo("/comparar")}
          >
            Comparar
          </button>
          <button
            className={`nav-btn ${tab === "campos" ? "active" : ""}`}
            onClick={() => goTo("/campos")}
          >
            Campos
          </button>
          <button
            className={`nav-btn ${tab === "simulador" ? "active" : ""}`}
            onClick={() => goTo("/simulador")}
          >
            Simulador
          </button>
          <button
            className={`nav-btn ${tab === "calendario" ? "active" : ""}`}
            onClick={() => goTo("/calendario")}
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

        {status.kind === "ready" && (
          <Routes>
            <Route path="/campos/:courseKey?" element={<CamposPage courses={simCourses} />} />
            <Route path="/jogadores/:fed?" element={<JogadoresPage players={status.players} courses={simCourses} />} />
            <Route path="/simulador" element={<SimuladorPage courses={simCourses} />} />
            <Route path="/comparar" element={<CompararPage players={status.players} />} />
            <Route path="/calendario" element={<CalendarioPage />} />
            <Route path="*" element={<Navigate to="/jogadores" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
