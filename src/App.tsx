import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { loadMasterData, loadPlayers } from "./data/loader";
import { extractAwayCourses } from "./data/melhoriasLoader";
import { getExtraCourses } from "./data/extraCourses";
import type { Course, MasterData, PlayersDb } from "./data/types";
import CamposPage from "./pages/CamposPage";
import JogadoresPage from "./pages/JogadoresPage";
import SimuladorPage from "./pages/SimuladorPage";

import melhoriasJson from "../melhorias.json";

type Tab = "campos" | "jogadores" | "simulador";

type MelhoriasJson = Record<string, Record<string, unknown>>;

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: MasterData; players: PlayersDb };

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [tab, setTab] = useState<Tab>("campos");

  useEffect(() => {
    let alive = true;
    Promise.all([loadMasterData(), loadPlayers()])
      .then(([data, players]) => alive && setStatus({ kind: "ready", data, players }))
      .catch((e) => alive && setStatus({ kind: "error", message: e?.message ?? String(e) }));
    return () => { alive = false; };
  }, []);

  const playerCount = status.kind === "ready" ? Object.keys(status.players).length : 0;

  /* Campos FPG + Away (melhorias) + Extra (manuais) para o Simulador */
  const simCourses: Course[] = useMemo(() => {
    if (status.kind !== "ready") return [];
    const fpg = status.data.courses;
    const away = extractAwayCourses(melhoriasJson as MelhoriasJson);
    const extra = getExtraCourses();
    return [...fpg, ...away, ...extra];
  }, [status]);

  return (
    <div className="app">
      {/* Topbar */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">⛳</span>
          <div>
            <div className="brand-title">Golf Portugal</div>
            <div className="brand-sub">Campos · Jogadores · Simulador</div>
          </div>
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
          <JogadoresPage players={status.players} />
        )}

        {status.kind === "ready" && tab === "simulador" && (
          <SimuladorPage courses={simCourses} />
        )}
      </main>
    </div>
  );
}
